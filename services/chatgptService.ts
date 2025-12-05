// Get API key from environment variable only
const getOpenAIApiKey = (): string => {
  return import.meta.env.VITE_OPENAI_API_KEY || '';
};

const getOpenRouterApiKey = (): string => {
  return import.meta.env.VITE_OPENROUTER_API_KEY || '';
};

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Metrics tracking (module-level)
const metrics = {
  headerMissing: 0,
  rewrites: 0,
  semanticMismatch: 0,
  retries: 0,
  swaps: 0,
};

// Failed subjects tracking (module-level)
const failedSubjects = new Set<string>();

interface ChatGPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ImageAnalysisResponse {
  theme: string;
  style: string;
}

// ============================================
// GLOBAL CONTENT VARIABLES (Apply to ALL Modes)
// These ensure variety in WHAT is shown, regardless of style
// ============================================
const subjectFocus = [
  "Single Hero Object (Central)",
  "Wide Atmospheric Scene",
  "Macro Detail/Texture",
  "Knolling (Flat Lay of multiple items)",
  "Asymmetrical Corner Composition",
  "Pattern-Focused (No central object)",
  "Collage of Scattered Elements",
  "Framed Vignette"
];

const cameraAngles = [
  "Top-Down / Flat Lay",
  "Straight-On Front View",
  "Macro Close-Up",
  "Isometric Angle",
  "Dutch Angle (Dynamic tilt)"
];

// ============================================
// STYLE VARIABLES (Apply ONLY to Custom Mode)
// ============================================
const artTechniques = [
  "Watercolor",
  "Vector Illustration",
  "Etching",
  "Gouache",
  "Ink Drawing",
  "Digital Painting",
  "Linocut",
  "Screen Print",
  "Charcoal Sketch",
  "Pastel Drawing",
  "Acrylic Paint",
  "Oil Painting"
];

const palettes = [
  "Soft Pastels",
  "Natural & Organic",
  "Vintage Muted",
  "Watercolor Wash",
  "Earth Tones",
  "Botanical Greenery",
  "Monochromatic",
  "Faded & Nostalgic",
  "Warm Neutrals",
  "Cool & Frosty",
  "Classic Elegant",
  "Desaturated"
];

// ============================================
// BATCH STATE TRACKING (Module-level)
// ============================================
// Track used (focus, angle) combinations per batch
// Reset when batch changes (detected by variationNumber resetting to 1)
let usedCombinations = new Set<string>();
let currentBatchStyleSeed: number | null = null;
let lastVariationNumber = 0;

/**
 * 32-bit multiplicative hash function for better distribution
 * Uses Knuth's multiplicative hash with golden ratio constant
 */
function hash32(seed: number, arrayLength: number): number {
  // 32-bit integer multiplication with golden ratio constant (0x9e3779b9)
  const hash = ((seed * 0x9e3779b9) >>> 0) % arrayLength;
  return hash;
}

/**
 * Selects a unique (focus, angle) combination for a variation
 * Retries with offset if collision detected
 */
function selectUniqueContent(
  variationNumber: number,
  maxAttempts: number = 10
): { focus: string; angle: string } {
  let attempts = 0;
  let focus: string;
  let angle: string;
  let combination: string;

  do {
    // Use hash with offset to ensure different results on retry
    const offset = attempts * 1000; // Large offset to avoid similar hashes
    const focusIndex = hash32(variationNumber + offset, subjectFocus.length);
    const angleIndex = hash32(variationNumber + offset + 5000, cameraAngles.length);
    
    focus = subjectFocus[focusIndex];
    angle = cameraAngles[angleIndex];
    combination = `${focus}|${angle}`;
    attempts++;
  } while (usedCombinations.has(combination) && attempts < maxAttempts);

  // If we still have a collision after max attempts, use it anyway (should be rare)
  if (usedCombinations.has(combination) && attempts >= maxAttempts) {
    console.warn(`[Randomization] Collision detected for variation ${variationNumber} after ${maxAttempts} attempts. Using: ${combination}`);
  }

  usedCombinations.add(combination);
  return { focus, angle };
}

/**
 * Generates a per-batch style seed (random, but consistent for the batch)
 * Called once per batch when variationNumber resets to 1
 */
function getBatchStyleSeed(): number {
  if (currentBatchStyleSeed === null) {
    // Generate random seed between 1 and 10000
    currentBatchStyleSeed = Math.floor(Math.random() * 10000) + 1;
    console.log(`[Randomization] New batch style seed: ${currentBatchStyleSeed}`);
  }
  return currentBatchStyleSeed;
}

/**
 * Resets batch state when starting a new batch
 * Detects new batch by checking if variationNumber decreased or reset to 1
 */
function resetBatchIfNeeded(variationNumber: number): void {
  if (variationNumber === 1 || variationNumber < lastVariationNumber) {
    // New batch detected - reset state
    usedCombinations.clear();
    currentBatchStyleSeed = null;
    console.log(`[Randomization] New batch detected (variation ${variationNumber}). Resetting state.`);
  }
  lastVariationNumber = variationNumber;
}

// ============================================
// MASTER SUBJECT LIST (Per Batch)
// ============================================
let masterSubjectList: string[] = [];
let masterSubjectListGenerated = false;

/**
 * Generates a master subject list for the batch (36 unique subjects)
 * Uses lower temperature for more deterministic results
 */
export async function generateMasterSubjectList(
  theme: string,
  batchSize: number,
  apiKey: string,
  apiUrl: string,
  useOpenRouter: boolean
): Promise<string[]> {
  if (masterSubjectListGenerated && masterSubjectList.length > 0) {
    return masterSubjectList;
  }

  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  const listSize = Math.max(batchSize, 36); // Generate at least 36 subjects

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    if (useOpenRouter) {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Junk Journal Generator';
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a subject list generator. Produce exactly ${listSize} unique short subject phrases (2-3 words each) for theme "${theme}". No synonyms, no duplicates, no variations of the same object. Output ONLY a numbered list, one subject per line. Each subject must be distinct and specific (e.g., "ornate pastel teapot" not just "teapot").`
          },
          {
            role: 'user',
            content: `Generate ${listSize} unique subjects for "${theme}". Each must be 2-3 words, specific, and visually distinct. Output numbered list only.`
          }
        ],
        temperature: 0.6, // Lower temperature for more deterministic results
        max_tokens: 1000,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to generate master subject list: ${response.status}`);
    }

    const data: ChatGPTResponse = await response.json();
    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      // Parse numbered list
      const subjects = content
        .split('\n')
        .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => line.length > 0 && line.length < 50) // Filter valid subjects
        .slice(0, listSize);
      
      if (subjects.length >= batchSize) {
        masterSubjectList = subjects;
        masterSubjectListGenerated = true;
        console.log(`[Master Subject List] Generated ${subjects.length} subjects for theme "${theme}"`);
        return subjects;
      }
    }
  } catch (error) {
    console.error('[Master Subject List] Generation failed:', error);
  }

  // Fallback: generate simple subjects based on theme
  const fallbackSubjects: string[] = [];
  const baseSubjects = ['teapot', 'teacup', 'shell', 'rose', 'vintage label', 'postage stamp', 'botanical sketch', 'handwritten note', 'lace trim', 'ribbon', 'crystal stopper', 'porcelain plate', 'sugar spoon', 'pastry tray', 'window seat', 'coastal path', 'sandcastle', 'seashell cluster', 'floral pattern', 'ornate frame', 'vintage ticket', 'old map', 'sheet music', 'pressed flower', 'wax seal', 'antique key', 'candle holder', 'old book', 'quill pen', 'crystal ball', 'geometric pattern', 'art nouveau border', 'gothic arch', 'stained glass', 'tapestry detail', 'illuminated letter'];
  
  for (let i = 0; i < listSize; i++) {
    const base = baseSubjects[i % baseSubjects.length];
    const modifier = ['ornate', 'delicate', 'vintage', 'antique', 'decorative', 'elaborate'][i % 6];
    fallbackSubjects.push(`${modifier} ${base}`);
  }

  masterSubjectList = fallbackSubjects.slice(0, listSize);
  masterSubjectListGenerated = true;
  return masterSubjectList;
}

/**
 * Normalizes text for semantic matching
 */
function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detects photographic/photorealistic language in prompts
 */
const photorealismPattern = /\b(photo|photoreal|photorealistic|photograph|photography|dslr|bokeh|shutter|f\/\d+|depth of field|dof|hyper-?real|ultra-?real|cinematic lens|realistic lighting|photorealism)\b/i;

function containsPhotographicLanguage(text: string): boolean {
  return photorealismPattern.test(text || '');
}

/**
 * Cleans master subject list by replacing poetic/abstract subjects with concrete noun phrases
 * @param masterArray The raw master subject list from GPT
 * @param desiredCount Target number of subjects (default 36)
 * @returns Cleaned array of concrete noun phrases
 */
export function cleanMasterList(masterArray: string[], desiredCount: number = 36): string[] {
  // Curated fallback pool (concrete, noun-focused)
  const fallbackPool = [
    "Cluster of glowing mushrooms", "Hidden lantern on post", "Hooded figure silhouette",
    "Moonlit crystal pond", "Majestic stag silhouette", "Tree hollow doorway",
    "Winding ivy tendril", "Stone pathway with moss", "Low-lying fog bank",
    "Velvet moss patch", "Ancient twisted oak tree", "Sparkling brook reflection",
    "Moss-covered stone altar", "Pair of glowing eyes in brush", "Twisted vine archway",
    "Glistening spiderweb strand", "Luminescent beetle cluster", "Twinkling firefly swarm",
    "Delicate butterfly wing", "Softly glowing orb on stump", "Hidden fairy circle of stones",
    "Gnarled root formation", "Stone bench with lichens",
    "Weathered wooden signpost", "Small ruined stone shrine", "Silver-leaf canopy",
    "Crumbling stone step", "Ivy-wrapped stone arch", "Mossy tree stump altar",
    "Moonlit river bend", "Low stone bridge", "Small wooden lantern",
    "Weathered leather satchel", "Field of night-blooming flowers", "Ancient rune carving"
  ];

  // Replacement dictionary for commonly generated poetic phrases
  const replacements: Record<string, string> = {
    "whispering willow branches": "Willow branch cluster",
    "whispering willow": "Willow branch cluster",
    "whispering breeze sound": "Wind-swept leaf cluster",
    "whispering breath": "Wind-swept leaf cluster",
    "whispering night breeze": "Wind-swept leaf cluster",
    "radiant night blooming": "Moonlit blossom",
    "mystic river reflection": "Moonlit river reflection",
    "mystic river": "Moonlit river reflection",
    "enchanted fog veil": "Low-lying fog bank",
    "mysterious fog blanket": "Low-lying fog bank",
    "mysterious glowing eyes": "Pair of glowing eyes in brush",
    "silken spider silk": "Silken spider thread",
    "flickering candlelight shadows": "Soft candlelight shadow",
    "flickering shadow play": "Shadowed movement of leaves",
    "hidden treasure chest": "Partially-buried wooden chest",
    "enchanted nightingale song": "Nightingale perched on branch",
    "velvet moss carpet": "Velvet moss patch",
    "luminescent flower petals": "Luminescent flower petals",
    "ethereal silver mist": "Low-lying silver mist",
    "enchanted forest clearing": "Ancient stone clearing",
    "enchanted artifacts": "Crystal orb on pedestal",
    "enchanted forest floor": "Moss-covered stone path",
    "collage of enchanted artifacts": "Single crystal artifact",
    "framed vignette of a celestial fae court": "Celestial fae figure",
    "playful sprite laughter": "Sprite figure in flight",
    "dreamlike cloud wisps": "Wispy cloud formation"
  };

  // Simple ambiguous pattern to drop overly poetic entries not caught by replacements
  const ambiguousPattern = /\b(whisper|whispering|radiant|mystic|mysterious|breeze|song|reflection|bloom|shimmer|ethereal|veil|blanket)\b/i;

  // Normalize helper
  const norm = (s: string) => (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9\s']/g, '');

  // Start cleaning
  let cleaned = masterArray.map(s => {
    const key = norm(s);
    if (replacements[key]) return replacements[key];
    return s;
  });

  // Drop entries that still look ambiguous
  cleaned = cleaned.filter(s => {
    if (!s) return false;
    if (ambiguousPattern.test(s)) return false;
    // Require at least one reasonably long token
    const tokens = (s || '').split(/\s+/).filter(t => t.length > 2);
    return tokens.length > 0;
  });

  // Dedupe while preserving order
  const seen = new Set<string>();
  cleaned = cleaned.filter(s => {
    const k = norm(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Fill with fallback if not enough items
  let i = 0;
  while (cleaned.length < desiredCount && i < fallbackPool.length) {
    const candidate = fallbackPool[i++];
    if (!seen.has(norm(candidate))) {
      cleaned.push(candidate);
      seen.add(norm(candidate));
    }
  }

  // Final trim to desiredCount
  return cleaned.slice(0, desiredCount);
}

/**
 * Validates if the prompt text actually describes the required subject
 */
async function subjectMatchesPrompt(subject: string, promptText: string, apiKey: string, apiUrl: string, useOpenRouter: boolean): Promise<boolean> {
  // First try simple token-based matching (fast)
  const subjTokens = normalize(subject).split(' ').filter(t => t.length > 2);
  const body = normalize(promptText.replace(/^primary subject:.*?\./i, ''));
  const hits = subjTokens.filter(t => body.includes(t));
  const tokenOk = hits.length >= Math.max(1, Math.floor(subjTokens.length / 2));

  if (tokenOk) return true;

  // Fallback: explicit yes/no check using LLM classifier
  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  const sys = 'You are a strict verifier. Answer ONLY YES or NO.';
  const usr = `Does the following prompt describe the subject "${subject}" as the MAIN focus? Prompt: """${promptText}""" Return only YES or NO.`;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    if (useOpenRouter) {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Junk Journal Generator';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for classifier

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr }
        ],
        temperature: 0, // Deterministic
        max_tokens: 3,
        stream: false
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Classifier API error: ${response.status}`);
    }

    const data: ChatGPTResponse = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from classifier API');
    }

    const text = (data.choices[0].message.content || '').trim();
    return /^yes/i.test(text);
  } catch (error) {
    console.error(`[PromptGen] Error in semantic classifier for "${subject}":`, error);
    return false; // Assume no match on error
  }
}

/**
 * Ensures PRIMARY SUBJECT header is present and correct
 * Returns object with text, corrected flag, and matched flag
 */
async function ensurePrimarySubjectHeader(requiredSubject: string, gptText: string, apiKey: string, apiUrl: string, useOpenRouter: boolean): Promise<{ text: string; corrected: boolean; matched: boolean }> {
  const trimmed = (gptText || '').trim();
  let corrected = false;
  
  if (/^PRIMARY SUBJECT:\s*/i.test(trimmed)) {
    // Check if header matches required subject
    const header = trimmed.split('\n')[0];
    if (!header.toLowerCase().includes(requiredSubject.toLowerCase())) {
      // Replace header
      const rest = trimmed.split('\n').slice(1).join('\n').trim();
      console.warn(`[Primary Subject] Header mismatch. Expected: "${requiredSubject}", got: "${header}". Correcting...`);
      const fixed = `PRIMARY SUBJECT: ${requiredSubject}. ${rest}`;
      const matched = await subjectMatchesPrompt(requiredSubject, fixed, apiKey, apiUrl, useOpenRouter);
      return { text: fixed, corrected: true, matched };
    }
    const matched = await subjectMatchesPrompt(requiredSubject, trimmed, apiKey, apiUrl, useOpenRouter);
    return { text: trimmed, corrected: false, matched };
  } else {
    // Prepend header
    console.warn(`[Primary Subject] Missing header in prompt. Adding: "${requiredSubject}"`);
    const fixed = `PRIMARY SUBJECT: ${requiredSubject}. ${trimmed}`;
    const matched = await subjectMatchesPrompt(requiredSubject, fixed, apiKey, apiUrl, useOpenRouter);
    return { text: fixed, corrected: true, matched };
  }
}

/**
 * Calls ChatGPT with retry logic and header enforcement
 */
async function callPromptWithHeaderEnforcement(
  subject: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  apiUrl: string,
  useOpenRouter: boolean,
  maxAttempts: number = 4 // Allow extra retry for tricky subjects
): Promise<{ text: string; corrected: boolean; attempt: number; matched: boolean }> {
  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      
      if (useOpenRouter) {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'Junk Journal Generator';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3, // Lower temperature for stricter compliance
          max_tokens: useOpenRouter ? 4000 : 220,
          stream: false
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ChatGPTResponse = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from API');
      }

      let rawText = data.choices[0].message.content;
      
      // Clean DeepSeek R1 reasoning tags if using OpenRouter
      if (useOpenRouter) {
        rawText = cleanDeepSeekOutput(rawText);
      }
      
      const text = rawText.trim();

      // Check for RETRY token
      if (/^RETRY$/i.test(text)) {
        console.warn(`[PromptGen] GPT returned RETRY for "${subject}" (attempt ${attempt}/${maxAttempts})`);
        if (attempt < maxAttempts) continue;
      }

      // Check for photographic language and force rewrite
      if (containsPhotographicLanguage(text)) {
        console.warn(`[PromptGen] Photographic language detected for "${subject}" — forcing rewrite (attempt ${attempt})`);
        metrics.rewrites++;
        if (attempt < maxAttempts) continue; // trigger retry so the model rewrites
        
        // On final attempt, force an illustrated rewrite
        const bodyText = text.replace(/^PRIMARY SUBJECT:.*?\./i, '').trim();
        const forcedIllustration = `PRIMARY SUBJECT: ${subject}. ${bodyText} (REWRITE: make this a HAND-DRAWN illustration style, not a photograph. Use "ink and watercolor", "hand-drawn", "flat vector", or "pastel drawing" and remove any photographic language.)`;
        const matched = await subjectMatchesPrompt(subject, forcedIllustration, apiKey, apiUrl, useOpenRouter);
        return { text: forcedIllustration, corrected: true, attempt, matched };
      }

      // Check if header is present
      if (/^PRIMARY SUBJECT:\s*/i.test(text)) {
        // First check: Does the header subject match the expected subject?
        const headerMatch = text.match(/^PRIMARY SUBJECT:\s*(.+?)(?:\.|$)/i);
        if (headerMatch) {
          const headerSubject = headerMatch[1].trim();
          const expectedSubject = subject.trim();
          
          // Normalize for comparison (case-insensitive, remove extra spaces)
          const normalizedHeader = headerSubject.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedExpected = expectedSubject.toLowerCase().replace(/\s+/g, ' ').trim();
          
          // If subjects don't match, this is a critical error - the model ignored our instruction
          if (normalizedHeader !== normalizedExpected) {
            console.warn(`[Primary Subject] Header mismatch. Expected: "${expectedSubject}", got: "${headerSubject}". Retrying...`);
            if (attempt < maxAttempts) continue;
            // On final attempt, force correct header
            const corrected = `PRIMARY SUBJECT: ${expectedSubject}. ${text.replace(/^PRIMARY SUBJECT:\s*.*?\./i, '').trim()}`;
            const matched = await subjectMatchesPrompt(expectedSubject, corrected, apiKey, apiUrl, useOpenRouter);
            return { text: corrected, corrected: true, attempt, matched };
          }
        }
        
        // Header subject matches - now check semantic match
        const result = await ensurePrimarySubjectHeader(subject, text, apiKey, apiUrl, useOpenRouter);
        if (result.matched) {
          return { ...result, attempt, matched: true };
        } else {
          console.warn(`[PromptGen] Semantic mismatch for "${subject}" (attempt ${attempt}/${maxAttempts}). Prompt doesn't describe the subject.`);
          if (attempt < maxAttempts) continue;
          return { ...result, attempt, matched: false };
        }
      }

      // Header missing - retry if not last attempt
      if (attempt < maxAttempts) {
        console.warn(`[PromptGen] Header missing for "${subject}" (attempt ${attempt}/${maxAttempts}). Retrying...`);
        continue;
      }

      // Final fallback: force header
      const forced = `PRIMARY SUBJECT: ${subject}. ${text.replace(/^(\s*PRIMARY SUBJECT:.*?\.)/i, '').trim()}`;
      const matched = subjectMatchesPrompt(subject, forced);
      return { text: forced, corrected: true, attempt, matched };
    } catch (error: any) {
      console.error(`[PromptGen] Error on attempt ${attempt}/${maxAttempts} for "${subject}":`, error);
      if (attempt < maxAttempts) continue;
      // Final fallback on error
      const forced = `PRIMARY SUBJECT: ${subject}. [Error generating prompt, using fallback]`;
      return { text: forced, corrected: true, attempt, matched: false };
    }
  }

  // Should never reach here, but TypeScript needs it
  const forced = `PRIMARY SUBJECT: ${subject}. [Max attempts reached]`;
  return { text: forced, corrected: true, attempt: maxAttempts, matched: false };
}

/**
 * Composable variation instruction selection
 * Combines time, composition, and mood for more variety
 */
function getComposableVariationInstruction(variationNumber: number): string {
  const timeOptions = [
    'morning', 'noon', 'afternoon', 'evening', 'night', 'dawn', 'dusk', 'twilight'
  ];
  const compositionOptions = [
    'close-up of details', 'wide landscape view', 'path/road leading into distance',
    'single focus element', 'dense grouping', 'sparse arrangement', 'centered composition',
    'asymmetrical layout', 'diagonal composition', 'circular arrangement'
  ];
  const moodOptions = [
    'serene and peaceful', 'dramatic and bold', 'mystical and magical',
    'cozy and warm', 'crisp and clear', 'energetic and vibrant', 'melancholic and moody',
    'ethereal and dreamy', 'intense and powerful', 'gentle and soft'
  ];

  // Use hash to select one from each category
  const timeIndex = hash32(variationNumber, timeOptions.length);
  const compositionIndex = hash32(variationNumber + 100, compositionOptions.length);
  const moodIndex = hash32(variationNumber + 200, moodOptions.length);

  return `Explore a DIFFERENT time of day: ${timeOptions[timeIndex]} - create a ${compositionOptions[compositionIndex]} with a ${moodOptions[moodIndex]} mood. Each combination creates a unique visual experience.`;
}

/**
 * Cleans DeepSeek R1 output by removing reasoning tags and markdown formatting
 */
function cleanDeepSeekOutput(content: string): string {
  let cleaned = content;
  
  // Remove everything between <think> and </think> (including newlines)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
  
  // Also handle <think>...</think> tags (common in reasoning models)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Remove any markdown code block syntax if present
  cleaned = cleaned.replace(/^```(json|text|markdown)?/i, '').replace(/```$/i, '');
  
  // Remove double-dash separators that confuse Midjourney
  // Remove double em-dash (——) with optional whitespace
  cleaned = cleaned.replace(/——\s*/g, '');
  // Remove double dash (--) followed by a letter (Midjourney interprets -- as commands)
  cleaned = cleaned.replace(/--\s*([A-Za-z])/g, '$1');
  
  // Remove any leading/trailing whitespace and newlines
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Generates a unique prompt using ChatGPT API
 */
export const generatePromptWithChatGPT = async (
  theme: string,
  pageStyle: string,
  textureIntensity: string,
  elements: string[],
  includeFrames: boolean,
  includeBorders: boolean,
  variationNumber: number,
  customThemePrompt?: string,
  colorIntensity: 'Muted' | 'Normal' | 'Colorful' | 'Multicolored' = 'Muted',
  customArtStyle?: string,
  promptService: 'openai' | 'openrouter' = 'openai',
  masterSubjectList?: string[],
  usedSubjects?: Set<string>,
  primarySubjectOverride?: string // Optional: override subject selection for swapping
): Promise<string | null> => {
  // Determine which service to use
  const useOpenRouter = promptService === 'openrouter';
  const apiKey = useOpenRouter ? getOpenRouterApiKey() : getOpenAIApiKey();
  const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  
  if (!apiKey) {
    const serviceName = useOpenRouter ? 'OpenRouter' : 'OpenAI';
    const envVar = useOpenRouter ? 'VITE_OPENROUTER_API_KEY' : 'VITE_OPENAI_API_KEY';
    throw new Error(`${serviceName} API key is not configured. Please set ${envVar} in your environment variables.`);
  }

  // ============================================
  // BATCH STATE MANAGEMENT
  // ============================================
  // Reset batch state if starting a new batch
  resetBatchIfNeeded(variationNumber);

  // ============================================
  // PRIMARY SUBJECT SELECTION (From Master List)
  // ============================================
  let primarySubject: string;
  const forbiddenSubjects = usedSubjects ? Array.from(usedSubjects).filter(s => !s.includes('##FAILED')).map(s => s.replace('##FAILED', '')) : [];
  
  // Use override if provided (for subject swapping)
  if (primarySubjectOverride) {
    primarySubject = primarySubjectOverride;
  } else if (masterSubjectList && masterSubjectList.length > 0) {
    // Select subject from master list, avoiding used ones
    let attempts = 0;
    do {
      const subjectIndex = hash32(variationNumber + attempts * 100, masterSubjectList.length);
      primarySubject = masterSubjectList[subjectIndex];
      attempts++;
    } while (usedSubjects?.has(primarySubject.toLowerCase()) && attempts < 10);
    
    // If still using a forbidden subject, pick next available
    if (usedSubjects?.has(primarySubject.toLowerCase())) {
      const available = masterSubjectList.filter(s => !usedSubjects?.has(s.toLowerCase()));
      if (available.length > 0) {
        primarySubject = available[hash32(variationNumber, available.length)];
      }
    }
  } else {
    // Fallback: generate simple subject
    primarySubject = `${theme} element ${variationNumber}`;
  }
  
  // Note: Don't mark as used here - let the caller handle it after successful generation

  // ============================================
  // SELECT STYLE (Fixed for entire batch - consistent across all variations)
  // ============================================
  // Style is selected ONCE using a per-batch random seed to ensure consistency across the batch
  // This ensures all images in a batch share the same technique and palette
  let styleInstruction = '';
  if (colorIntensity === 'Custom / Override') {
    // Custom Mode: Check if customArtStyle is provided
    if (customArtStyle && customArtStyle.trim()) {
      // User provided custom art style - use ONLY their text, NO random tech/palette
      styleInstruction = `STYLE: Follow this custom art style: "${customArtStyle.trim()}".`;
    } else {
      // No custom art style - pick random tech and palette ONCE using per-batch random seed
      // This ensures all variations in the batch use the same technique and palette
      const batchStyleSeed = getBatchStyleSeed();
      const techIndex = hash32(batchStyleSeed, artTechniques.length);
      const paletteIndex = hash32(batchStyleSeed + 1000, palettes.length);
      const randomTech = artTechniques[techIndex];
      const randomPalette = palettes[paletteIndex];
      styleInstruction = `STYLE: ${randomTech} technique. Color Palette: ${randomPalette}.`;
    }
    // Add safety constraint for color handling in Custom Mode
    styleInstruction += ` CONSTRAINT: Avoid digital neon colors (hot pink, electric blue) and plastic textures. HOWEVER, if the theme is 'Gothic', 'Dark', or 'Fantasy', you MUST use **Deep Shadows, High Contrast (Chiaroscuro), and Dark Muted Tones** (Indigo, Charcoal, Sepia). Do not force 'Soft/Pastel' colors on Dark themes.`;
    
    // Add anti-photorealism rules
    styleInstruction += ` ABSOLUTE FORMAT: This must be an ILLUSTRATION, NOT a photograph. DO NOT use photography or camera language, DO NOT mention "photo", "photorealistic", "photoreal", "DSLR", "bokeh", "depth of field", "cinematic lens", "shutter", "f/1.8", "hyper-realistic", "ultra-realistic", or "photographic". Use illustration language: "hand-drawn", "ink and watercolor", "line art", "flat vector", "cel-shading", "gouache textures", "paper collage", "screen-print style", "woodcut", "etching", "pastel drawing". NEGATIVE: FORBIDDEN - photo, photorealistic, photography, DSLR, lens, bokeh, hyperreal, ultra-real, realistic lighting, naturalistic shadows, photoreal portrait.`;
  } else if (colorIntensity === 'Multicolored') {
    // Multicolored: Modern, Vivid, Colorful
    styleInstruction = 'STYLE: Modern Watercolor Illustration. Vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues). Fresh and lively, clean modern design. NOT vintage, NOT aged, NOT distressed, NOT junk journal style. ABSOLUTE FORMAT: This must be an ILLUSTRATION, NOT a photograph. DO NOT use photography or camera language, DO NOT mention "photo", "photorealistic", "photoreal", "DSLR", "bokeh", "depth of field", "cinematic lens", "shutter", "f/1.8", "hyper-realistic", "ultra-realistic", or "photographic". Use illustration language: "hand-drawn", "ink and watercolor", "line art", "flat vector", "cel-shading", "gouache textures", "paper collage", "screen-print style", "woodcut", "etching", "pastel drawing". NEGATIVE: FORBIDDEN - photo, photorealistic, photography, DSLR, lens, bokeh, hyperreal, ultra-real, realistic lighting, naturalistic shadows, photoreal portrait.';
  } else if (colorIntensity === 'Muted') {
    // Muted: Vintage Junk Journal with muted colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, muted sepia and brown tones, old faded colors, muted color palette. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges. ABSOLUTE FORMAT: This must be an ILLUSTRATION, NOT a photograph. DO NOT use photography or camera language, DO NOT mention "photo", "photorealistic", "photoreal", "DSLR", "bokeh", "depth of field", "cinematic lens", "shutter", "f/1.8", "hyper-realistic", "ultra-realistic", or "photographic". Use illustration language: "hand-drawn", "ink and watercolor", "line art", "flat vector", "cel-shading", "gouache textures", "paper collage", "screen-print style", "woodcut", "etching", "pastel drawing". NEGATIVE: FORBIDDEN - photo, photorealistic, photography, DSLR, lens, bokeh, hyperreal, ultra-real, realistic lighting, naturalistic shadows, photoreal portrait.';
  } else if (colorIntensity === 'Normal') {
    // Normal: Vintage Junk Journal with normal colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, normal colors (deep burgundy, maroon, dark grey, black, antique gold, rich but not faded). Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges. ABSOLUTE FORMAT: This must be an ILLUSTRATION, NOT a photograph. DO NOT use photography or camera language, DO NOT mention "photo", "photorealistic", "photoreal", "DSLR", "bokeh", "depth of field", "cinematic lens", "shutter", "f/1.8", "hyper-realistic", "ultra-realistic", or "photographic". Use illustration language: "hand-drawn", "ink and watercolor", "line art", "flat vector", "cel-shading", "gouache textures", "paper collage", "screen-print style", "woodcut", "etching", "pastel drawing". NEGATIVE: FORBIDDEN - photo, photorealistic, photography, DSLR, lens, bokeh, hyperreal, ultra-real, realistic lighting, naturalistic shadows, photoreal portrait.';
  } else if (colorIntensity === 'Colorful') {
    // Colorful: Vintage Junk Journal with vibrant colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges. ABSOLUTE FORMAT: This must be an ILLUSTRATION, NOT a photograph. DO NOT use photography or camera language, DO NOT mention "photo", "photorealistic", "photoreal", "DSLR", "bokeh", "depth of field", "cinematic lens", "shutter", "f/1.8", "hyper-realistic", "ultra-realistic", or "photographic". Use illustration language: "hand-drawn", "ink and watercolor", "line art", "flat vector", "cel-shading", "gouache textures", "paper collage", "screen-print style", "woodcut", "etching", "pastel drawing". NEGATIVE: FORBIDDEN - photo, photorealistic, photography, DSLR, lens, bokeh, hyperreal, ultra-real, realistic lighting, naturalistic shadows, photoreal portrait.';
  }

  // ============================================
  // RANDOMIZE CONTENT (For ALL Modes - varies per variation)
  // ============================================
  // Use 32-bit hash function with collision detection and retry logic
  // This ensures each variation gets a unique (focus, angle) combination
  // NOTE: Content (focus/angle) varies per variation, but Style (above) is fixed for the batch
  const { focus: randomFocus, angle: randomAngle } = selectUniqueContent(variationNumber);

  // Build the theme description (needed for variationSpecifies)
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // ============================================
  // CONSTRUCT VARIATION SPECIFICS (Content + Style)
  // Must be defined before Custom/Override block uses it
  // ============================================
  const variationSpecifies = `VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus} ⚠️ THIS DETERMINES THE IMAGE STRUCTURE
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription} (Use theme elements, but structure follows VISUAL FOCUS)

${styleInstruction}

🎯 STRUCTURE HIERARCHY: VISUAL FOCUS > THEME DESCRIPTION
The VISUAL FOCUS defines the COMPOSITION STRUCTURE. The Theme provides the CONTENT ELEMENTS to fill that structure.

INSTRUCTION: Create the assigned VISUAL FOCUS structure, then incorporate theme elements appropriately:
- If Focus is 'Single Hero Object (Central)': Create an ISOLATED central element (ephemera-style). Use theme elements to design this single object, NOT as background. Even if theme suggests "pattern", create a distinct focal object.
- If Focus is 'Wide Atmospheric Scene': Show a broader landscape/environment view using theme elements.
- If Focus is 'Macro Detail/Texture': Show a close-up of intricate details, textures, or patterns. This is the ONLY focus that allows full-page texture/pattern.
- If Focus is 'Knolling (Flat Lay of multiple items)': Arrange multiple theme-related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition': Place the main subject in a corner with negative space. Use theme elements to create the corner element, NOT background.
- If Focus is 'Pattern-Focused (No central object)': Create a repeating pattern or texture without a central focal point. This is the ONLY focus that allows full-page repeating patterns.
- If Focus is 'Collage of Scattered Elements': Arrange various theme elements scattered across the page in a collage style.
- If Focus is 'Framed Vignette': Show a scene or object within a decorative frame or border. Use theme elements inside the frame, NOT as background pattern.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.`;

  // Global helper function to generate variation control instructions
  const getVariationControl = (variationNumber: number, themeDescription: string): string => {
    // Detect theme type from description
    const themeLower = themeDescription.toLowerCase();
    const isBestiary = themeLower.includes('bestiary') || themeLower.includes('creature') || themeLower.includes('dragon') || themeLower.includes('beast') || themeLower.includes('animal') || themeLower.includes('bear') || themeLower.includes('owl') || themeLower.includes('wolf') || themeLower.includes('bird');
    const isLandscape = themeLower.includes('landscape') || themeLower.includes('forest') || themeLower.includes('mountain') || themeLower.includes('scene') || themeLower.includes('village') || themeLower.includes('winter') || themeLower.includes('summer') || themeLower.includes('autumn') || themeLower.includes('spring');
    
    let controlText = `\n\n🎯 VARIATION CONTROL (Variation #${variationNumber}):\n`;
    
    if (isBestiary) {
      controlText += `- CRITICAL: You MUST switch to a DIFFERENT creature than all previous variations.\n`;
      controlText += `- If previous variations featured dragons, switch to bears, owls, wolves, birds, or other creatures within the theme.\n`;
      controlText += `- Each creature must be visually distinct - different species, pose, composition, or setting.\n`;
      controlText += `- GOAL: Create a diverse bestiary collection where each image features a unique creature.\n`;
    } else if (isLandscape) {
      controlText += `- CRITICAL: You MUST switch the perspective or focal point from previous variations.\n`;
      controlText += `- Rotate through: Wide landscape shot, Close-up detail, Path/road view, Sky/aerial view, Ground level, Elevated view.\n`;
      controlText += `- Change the focal element: different structures, natural features, or environmental conditions.\n`;
      controlText += `- GOAL: Each image must show a different aspect of the landscape - like different photographs from a collection.\n`;
    } else {
      controlText += `- CRITICAL: You MUST explore a DIFFERENT subject, element, or composition than all previous variations.\n`;
      controlText += `- Switch between: different subjects, different perspectives (wide/close-up), different focal points, different moods.\n`;
      controlText += `- Avoid repeating the same visual elements, objects, or compositions.\n`;
      controlText += `- GOAL: Each image must be distinct enough to be a separate trading card or journal page.\n`;
    }
    
    controlText += `- REMEMBER: Never output the same subject or composition twice. Explore the entire breadth of "${themeDescription}".`;
    
    return controlText;
  };

  // CRITICAL: If colorIntensity is 'Custom / Override', use neutral system prompt
  if (colorIntensity === 'Custom / Override') {
    const systemPrompt = `You are a versatile AI Art Director. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🚨 CRITICAL FORMAT REQUIREMENT:
Your response MUST start with this EXACT line (copy it exactly, do not modify):
PRIMARY SUBJECT: [the exact subject name provided by the user]

Then, in 1-2 sentences, describe ONLY that subject as the main visual focus.

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.

🎨 COLOR LOGIC: Unless the user explicitly uses words like 'Vibrant', 'Neon', 'Bright', or 'Saturated', you MUST default to a **Soft, Natural, or Muted** color palette. Avoid oversaturation. Prioritize artistic, tasteful, and printable colors over intense digital hues.

🎨 AESTHETIC DEFAULT: Your default aesthetic is 'High-End Illustration' (Soft, Textured, Natural). Avoid 'Digital Art' aesthetics (Neon, Shiny, Plastic) unless requested.

REMEMBER: Start EVERY response with "PRIMARY SUBJECT: [subject]." (with the period after the subject name).`;

    // Use composable variation instruction (time + composition + mood)
    const variationInstruction = getComposableVariationInstruction(variationNumber);
    
    const variationDirections = [
      'Create a COMPLETELY DIFFERENT scene - change the time of day, weather/atmosphere, composition, or focal point. Avoid any similarity to previous variations.',
      'Explore a DIFFERENT aspect - think of other subjects, elements, features, or perspectives within the theme. Make it visually distinct.',
      'Design a UNIQUE interpretation - ensure this variation has different composition, different elements, different mood, or different perspective than previous ones.',
      'Create a FRESH perspective - change the viewpoint, scale, or focus. Think: close-up vs wide view, day vs night, path/road vs open area, single element vs group.',
      'Explore DIFFERENT elements - vary the subjects, features, structures, or details. Each variation should feel like a different scene entirely.',
      'Design a DISTINCT scene - change multiple aspects: time of day, composition type, focal elements, and mood. Make it feel like a different photograph or painting.'
    ];
    const variationDirection = variationDirections[(variationNumber - 1) % variationDirections.length];

    // Get global variation control
    const variationControl = getVariationControl(variationNumber, themeDescription);

    const userPrompt = `🚨 CRITICAL: You MUST use this EXACT subject: "${primarySubject}"

Generate an image prompt following this EXACT format:

PRIMARY SUBJECT: ${primarySubject}.

[Then write 1-2 sentences describing ONLY "${primarySubject}" as the main visual focus]

DO NOT change the subject. DO NOT use a different subject. DO NOT generate your own subject. You MUST use "${primarySubject}" exactly as provided.

Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} illustration.

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationSpecifies}

🚨 HIERARCHY RULE - VISUAL FOCUS OVERRIDES THEME:
The VISUAL FOCUS determines the STRUCTURE and COMPOSITION of the image, NOT the Theme Description.
- If VISUAL FOCUS is 'Single Hero Object (Central)': The image MUST have an isolated central element as the primary subject, even if the Theme suggests patterns or backgrounds. Use theme elements to create a distinct focal point, NOT a background pattern.
- If VISUAL FOCUS is 'Framed Vignette': The image MUST show a scene or object within a decorative frame or border. Use theme elements to create the framed content, NOT a repeating background.
- If VISUAL FOCUS is 'Pattern-Focused (No central object)': THEN you may create a full-page repeating pattern or texture using the theme elements.
- If VISUAL FOCUS is 'Macro Detail/Texture': THEN you may create a close-up texture or pattern detail.
- For ALL OTHER FOCUS TYPES: Do NOT generate a full-page background pattern, even if the Theme contains "Pattern" or "Background". Instead, use the theme elements to create the assigned focus structure (e.g., isolated element, framed scene, corner composition, etc.).

🚨 ANTI-REPETITION RULE:
If the Theme Description contains words like "Pattern", "Background", "Texture", or "Seamless":
- ONLY generate a full-page repeating pattern/texture if VISUAL FOCUS is 'Pattern-Focused (No central object)' or 'Macro Detail/Texture'.
- For all other VISUAL FOCUS types (Single Hero Object, Framed Vignette, Asymmetrical Corner, Knolling, Collage, Wide Scene): Use the theme elements to create a DISTINCT focal point, isolated element, framed composition, or specific arrangement - NOT a background pattern.

🎨 DESIGN KIT GENERATION GOAL:
You are creating a "Design Kit" that contains a MIX of different types of elements:
- Some variations should be full-page backgrounds/textures (only when Focus is Pattern-Focused or Macro Detail)
- Some variations should be isolated elements/ephemera (when Focus is Single Hero Object, Framed Vignette, or Asymmetrical Corner)
- Some variations should be frames or borders (when Focus is Framed Vignette)
- Some variations should be compositions with multiple items (when Focus is Knolling or Collage)
- The goal is VARIETY - not all variations should be the same type of element.

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that follows the VISUAL FOCUS structure while incorporating the ${themeDescription} theme elements appropriately. 2-3 sentences. Return ONLY the prompt description.`;

    // Use retry wrapper with header enforcement
    const result = await callPromptWithHeaderEnforcement(
      primarySubject,
      systemPrompt,
      userPrompt,
      apiKey,
      apiUrl,
      useOpenRouter,
      4 // maxAttempts
    );

    // If generation failed (returned null), return null so caller can swap subjects
    if (!result.text) {
      console.warn(`[PromptGen] Failed to generate valid prompt for "${primarySubject}" after ${result.attempt} attempts`);
      return null; // Caller should swap to next subject from master list
    }

    // Log result for audit
    if (result.corrected) {
      console.log(`[PromptGen] Prompt for "${primarySubject}" was corrected (attempt ${result.attempt})`);
    }
    if (!result.matched) {
      console.warn(`[PromptGen] ⚠️ Semantic mismatch: Prompt for "${primarySubject}" may not describe the subject correctly`);
    }

    return result.text;
  }

  // Get global variation control for all modes (themeDescription already defined above)
  const variationControl = getVariationControl(variationNumber, themeDescription);

  // Default prompts (existing logic)
  // Check for 'Custom / Override' first
    const systemPrompt = colorIntensity === 'Custom / Override'
    ? `You are a strict prompt generator that MUST output illustrated-style prompts only. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🚨 CRITICAL FORMAT REQUIREMENT:
Your response MUST start with this EXACT line (copy it exactly, do not modify):
PRIMARY SUBJECT: [the exact subject name provided by the user]

Then, in 1-2 sentences, describe ONLY that subject as the main visual focus.

ABSOLUTE RULES (must follow exactly):
- This must be an ILLUSTRATION, NOT a photograph.
- NEVER use photography/camera words: photo, photograph, photorealistic, photoreal, DSLR, bokeh, depth of field, DOF, shutter, lens, hyperreal, ultra-realistic, or "naturalistic lighting".
- Use illustration terms: hand-drawn, ink and watercolor, gouache, screen-print, linocut, line art, pastel drawing, vector illustration, etching, cel-shading, paper collage.
- Keep output 1-2 sentences describing ONLY the PRIMARY SUBJECT. No lists, no extra formatting.
- If you cannot produce an illustrated description, respond with ONLY: RETRY

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

🚨 CRITICAL RULES:
1. You MUST begin your response with "PRIMARY SUBJECT: <subject>" exactly as specified in the user prompt.
2. The ENTIRE prompt must describe and focus on THAT SPECIFIC PRIMARY SUBJECT. Do NOT describe a different object or scene.
3. If the PRIMARY SUBJECT is "Cursed tarot deck", your prompt MUST describe a cursed tarot deck, NOT a pattern, NOT a spellbook, NOT anything else.
4. Do NOT change the subject. Do NOT replace it with a similar item. Do NOT describe a scene that doesn't feature the PRIMARY SUBJECT as the main focus.
5. Return 2-3 sentences ONLY, describing the PRIMARY SUBJECT in detail.

EXAMPLES (required format):

PRIMARY SUBJECT: Moonlit crystal pond. Hand-drawn ink and watercolor illustration of a shallow pond under moonlight; stylized ripples, soft watercolor washes in indigo and silver, delicate ink linework for reeds, paper texture visible — illustration, not a photograph.

PRIMARY SUBJECT: Velvet moss patch. Pastel drawing with stippled highlights and flattened perspective; decorative macro shapes, soft textured background, clearly hand-drawn.

PRIMARY SUBJECT: Celestial unicorn silhouette. Etching-style line art with subtle watercolor wash for the sky; simplified shapes and decorative stars — illustrative and stylized.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.

🎨 AESTHETIC DEFAULT: Your default aesthetic is 'High-End Illustration' (Soft, Textured, Natural). Avoid 'Digital Art' aesthetics (Neon, Shiny, Plastic) unless requested.`
    : colorIntensity === 'Multicolored'
    ? `You are a strict prompt generator that MUST output illustrated-style prompts only. FOLLOW THESE RULES EXACTLY:

RULE 1: Your response MUST start with: "PRIMARY SUBJECT: [exact subject from user prompt]"

RULE 2: The ENTIRE rest of your response (2-3 sentences) MUST describe ONLY that PRIMARY SUBJECT as the main focus.

RULE 3: If you cannot follow these rules, respond with ONLY the word: RETRY

RULE 4: Output plain text only. No JSON, no lists, no extra formatting.

ABSOLUTE RULES (must follow exactly):
- This must be an ILLUSTRATION, NOT a photograph.
- NEVER use photography/camera words: photo, photograph, photorealistic, photoreal, DSLR, bokeh, depth of field, DOF, shutter, lens, hyperreal, ultra-realistic, or "naturalistic lighting".
- Use illustration terms: hand-drawn, ink and watercolor, gouache, screen-print, linocut, line art, pastel drawing, vector illustration, etching, cel-shading, paper collage.

EXAMPLES (required format):

PRIMARY SUBJECT: Moonlit crystal pond. Hand-drawn ink and watercolor illustration of a shallow pond under moonlight; stylized ripples, soft watercolor washes in indigo and silver, delicate ink linework for reeds, paper texture visible — illustration, not a photograph.

PRIMARY SUBJECT: Velvet moss patch. Pastel drawing with stippled highlights and flattened perspective; decorative macro shapes, soft textured background, clearly hand-drawn.

PRIMARY SUBJECT: Celestial unicorn silhouette. Etching-style line art with subtle watercolor wash for the sky; simplified shapes and decorative stars — illustrative and stylized.

DIVERSITY: Each variation must be different. Explore the theme's full breadth.

STYLE: MODERN, VIVID, COLORFUL watercolor illustration - NOT vintage, NOT journal page.`
    : `You are a strict prompt generator that MUST output illustrated-style prompts only. FOLLOW THESE RULES EXACTLY:

RULE 1: Your response MUST start with: "PRIMARY SUBJECT: [exact subject from user prompt]"

RULE 2: The ENTIRE rest of your response (2-3 sentences) MUST describe ONLY that PRIMARY SUBJECT as the main focus.

RULE 3: If you cannot follow these rules, respond with ONLY the word: RETRY

RULE 4: Output plain text only. No JSON, no lists, no extra formatting.

ABSOLUTE RULES (must follow exactly):
- This must be an ILLUSTRATION, NOT a photograph.
- NEVER use photography/camera words: photo, photograph, photorealistic, photoreal, DSLR, bokeh, depth of field, DOF, shutter, lens, hyperreal, ultra-realistic, or "naturalistic lighting".
- Use illustration terms: hand-drawn, ink and watercolor, gouache, screen-print, linocut, line art, pastel drawing, vector illustration, etching, cel-shading, paper collage.

EXAMPLES (required format):

PRIMARY SUBJECT: Moonlit crystal pond. Hand-drawn ink and watercolor illustration of a shallow pond under moonlight; stylized ripples, soft watercolor washes in indigo and silver, delicate ink linework for reeds, paper texture visible — illustration, not a photograph.

PRIMARY SUBJECT: Velvet moss patch. Pastel drawing with stippled highlights and flattened perspective; decorative macro shapes, soft textured background, clearly hand-drawn.

PRIMARY SUBJECT: Celestial unicorn silhouette. Etching-style line art with subtle watercolor wash for the sky; simplified shapes and decorative stars — illustrative and stylized.

DIVERSITY: Each variation must be different. Explore the theme's full breadth.

STYLE: VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art.`;

  // Create variation-specific instructions to ensure diversity
  // For Normal color intensity, add more specific diversity instructions that work for ANY theme
  const variationInstructions = colorIntensity === 'Normal' ? [
    'Explore a DIFFERENT time of day: morning, noon, evening, night, dawn, or dusk - each creates a unique mood and lighting',
    'Create a DIFFERENT composition: close-up of details, wide landscape view, path/road leading into distance, single focus element, or dense grouping',
    'Focus on DIFFERENT elements: vary the subjects, objects, structures, natural features, or environmental conditions within the theme',
    'Design a DIFFERENT perspective: bird\'s eye view, ground level, looking up, looking down a path/road, side view, or angled view',
    'Explore DIFFERENT weather/atmosphere: clear day, misty, foggy, moonlit, sunset, sunrise, stormy, or magical lighting',
    'Create a DIFFERENT scene type: path/road view, water feature (stream/river/lake), structure (house/cabin/building), open area, dense area, or elevated view',
    'Focus on DIFFERENT details: close-up textures, medium-range elements, distant horizon, specific objects, or environmental features',
    'Design a DIFFERENT mood: serene and peaceful, dramatic and bold, mystical and magical, cozy and warm, crisp and clear, or energetic and vibrant',
    'Explore DIFFERENT natural/man-made features: varied terrain, water elements, structures, vegetation, or architectural elements',
    'Create a DIFFERENT focal point: a single prominent element, a winding path/road, a structure, a natural feature, or a wide landscape',
    'Focus on DIFFERENT lighting: bright sunlight, soft diffused light, dramatic shadows, warm sunset/rise glow, cool moonlit, or atmospheric lighting',
    'Design a DIFFERENT scale: macro close-up details, medium view of a scene, or wide expansive landscape'
  ] : [
    'Explore a different aspect or element of the theme - think creatively about what else could represent this theme',
    'Create a completely different composition, subject, or focal point while staying within the theme',
    'Focus on different visual elements, objects, or motifs that relate to the theme',
    'Design a unique interpretation that hasn\'t been used in previous variations',
    'Think of a different way to represent the theme visually - different subjects, scenes, or elements',
    'Create a fresh perspective on the theme with distinct visual content',
    'Explore another facet of the theme with different subjects or compositions',
    'Design a unique variation that explores a different aspect of the theme',
    'Create a distinct visual interpretation that differs from previous variations',
    'Think creatively about other ways to represent the theme visually',
    'Explore different subjects, elements, or compositions within the theme',
    'Create a unique design that represents the theme in a different way'
  ];
  
  const variationInstruction = variationInstructions[(variationNumber - 1) % variationInstructions.length];
  
  // Add specific variation direction - emphasize natural variety
  // For Normal color intensity, add more specific diversity guidance that works for ANY theme
  let variationDirection = '';
  if (colorIntensity === 'Normal') {
    const directions = [
      'Create a COMPLETELY DIFFERENT scene - change the time of day, weather/atmosphere, composition, or focal point. Avoid any similarity to previous variations.',
      'Explore a DIFFERENT aspect - think of other subjects, elements, features, or perspectives within the theme. Make it visually distinct.',
      'Design a UNIQUE interpretation - ensure this variation has different composition, different elements, different mood, or different perspective than previous ones.',
      'Create a FRESH perspective - change the viewpoint, scale, or focus. Think: close-up vs wide view, day vs night, path/road vs open area, single element vs group.',
      'Explore DIFFERENT elements - vary the subjects, features, structures, or details. Each variation should feel like a different scene entirely.',
      'Design a DISTINCT scene - change multiple aspects: time of day, composition type, focal elements, and mood. Make it feel like a different photograph or painting.'
    ];
    variationDirection = directions[(variationNumber - 1) % directions.length];
  } else {
    if (variationNumber % 3 === 1) {
      variationDirection = 'Create a DIFFERENT subject, element, or composition within the theme - avoid repeating the same subject from previous variations.';
    } else if (variationNumber % 3 === 2) {
      variationDirection = 'Explore a DIFFERENT aspect of the theme - think of other visual elements, subjects, or scenes that relate to this theme.';
    } else {
      variationDirection = 'Design a UNIQUE interpretation of the theme - ensure this variation has distinct visual content, not just a style change.';
    }
  }

  const forbiddenText = forbiddenSubjects.length > 0 
    ? `\n\nFORBIDDEN: Do not use these subjects (already used in other variations): ${forbiddenSubjects.join(', ')}.`
    : '';

  const userPrompt = colorIntensity === 'Custom / Override'
    ? `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} illustration.

PRIMARY SUBJECT (REQUIRED - DO NOT CHANGE): ${primarySubject}

🚨 ABSOLUTE REQUIREMENTS:
1. Begin your response with "PRIMARY SUBJECT: ${primarySubject}" (exact text, do not modify).
2. The ENTIRE prompt must describe ${primarySubject} as the MAIN FOCUS of the image.
3. Do NOT describe a different object, scene, or pattern. If PRIMARY SUBJECT is "${primarySubject}", your prompt MUST be about ${primarySubject}, nothing else.
4. Do NOT replace it with a similar item or describe a scene that doesn't feature ${primarySubject} prominently.
5. This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements.${forbiddenText}

${variationSpecifies}

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

IMPORTANT: Generate a high-quality, artistic representation of ${themeDescription}. Do NOT automatically add junk journal elements (stamps, ephemera, handwritten text, distressed textures) unless the theme explicitly calls for them. Do NOT force 'modern' or 'flat' styles unless requested. Follow the theme description exactly as provided.

🎨 COLOR SAFETY RULE: Avoid digital neon colors (hot pink, electric blue) and plastic textures. HOWEVER, if the theme is 'Gothic', 'Dark', or 'Fantasy', you MUST use **Deep Shadows, High Contrast (Chiaroscuro), and Dark Muted Tones** (Indigo, Charcoal, Sepia). Do not force 'Soft/Pastel' colors on Dark themes.

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that represents ${themeDescription} accurately and artistically. 2-3 sentences. Return ONLY the prompt description.`
    : colorIntensity === 'Multicolored'
    ? `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} MODERN WATERCOLOR ILLUSTRATION. 

PRIMARY SUBJECT (REQUIRED - DO NOT CHANGE): ${primarySubject}

🚨 ABSOLUTE REQUIREMENTS:
1. Begin your response with "PRIMARY SUBJECT: ${primarySubject}" (exact text, do not modify).
2. The ENTIRE prompt must describe ${primarySubject} as the MAIN FOCUS of the image.
3. Do NOT describe a different object, scene, or pattern. If PRIMARY SUBJECT is "${primarySubject}", your prompt MUST be about ${primarySubject}, nothing else.
4. Do NOT replace it with a similar item or describe a scene that doesn't feature ${primarySubject} prominently.${forbiddenText}

🚨 CRITICAL: This is a MODERN, VIVID, COLORFUL watercolor illustration - NOT a journal page, NOT vintage, NOT antique, NOT junk journal.

🚨 MANDATORY: Your prompt MUST start with one of these exact phrases:
- "A vivid, modern watercolor illustration of..."
- "A colorful watercolor painting depicting..."
- "A fresh, lively watercolor illustration showing..."
- "A bright, vibrant watercolor artwork featuring..."

🚨 FORBIDDEN STARTS - DO NOT START WITH:
❌ "Visualize an aged..." 
❌ "Craft a vintage..."
❌ "Imagine a... junk journal page"
❌ "Create an antique-style..."
❌ ANY phrase containing: aged, antique, vintage, junk journal, journal page

This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationSpecifies}

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

ABSOLUTELY FORBIDDEN WORDS AND PHRASES - DO NOT USE ANY OF THESE:
❌ "vintage", "antique", "aged", "distressed", "old", "worn", "weathered"
❌ "journal page", "junk journal", "scrapbook page", "journal entry"
❌ "handwritten", "cursive script", "letters", "writing", "poem", "verses", "entries"
❌ "postage stamps", "vintage ephemera", "botanical illustrations", "ticket stubs", "seals"
❌ "sepia", "muted", "coffee-stained", "tea-stained", "parchment", "aged paper"
❌ "faded", "distressed texture", "antique-style", "vintage-style", "old-world"
❌ "nostalgic", "wistful", "memory", "echoed memory", "past", "reminiscing"

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}". Remember: MODERN, VIVID, COLORFUL watercolor illustration - NOT vintage, NOT journal page.` : ''}

🚨 FINAL CHECKLIST - Before returning your prompt, verify:
1. ✅ Does it start with "A vivid, modern..." or "A colorful watercolor..."? 
2. ❌ Does it contain ANY of these words: aged, antique, vintage, junk journal, journal page, handwritten, sepia, muted, faded, postage stamps, ephemera? If YES, rewrite it completely.
3. ✅ Is it describing a modern, colorful illustration with vibrant colors?

Create a DISTINCT and UNIQUE MODERN WATERCOLOR ILLUSTRATION prompt. Start with "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..." - describe it as a pure, modern, colorful watercolor painting of ${themeDescription} with vibrant colors. DO NOT mention journal, vintage, antique, stamps, handwritten text, or any vintage elements. 2-3 sentences. Return ONLY the prompt description.`
    : `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page.

PRIMARY SUBJECT (REQUIRED - DO NOT CHANGE): ${primarySubject}

🚨 ABSOLUTE REQUIREMENTS:
1. Begin your response with "PRIMARY SUBJECT: ${primarySubject}" (exact text, do not modify).
2. The ENTIRE prompt must describe ${primarySubject} as the MAIN FOCUS of the image.
3. Do NOT describe a different object, scene, or pattern. If PRIMARY SUBJECT is "${primarySubject}", your prompt MUST be about ${primarySubject}, nothing else.
4. Do NOT replace it with a similar item or describe a scene that doesn't feature ${primarySubject} prominently.
5. This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements.${forbiddenText}

${variationSpecifies}

${variationControl}

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- ILLUSTRATED/ARTISTIC STYLE: stylized illustration, artistic rendering, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic
${colorIntensity === 'Muted' 
  ? '- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, coffee-stained look, NOT bright vibrant colors'
  : colorIntensity === 'Normal'
  ? '- NORMAL COLORS: deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, normal color saturation, gothic/vintage aesthetic'
  : '- COLORFUL VINTAGE PALETTE: rich, vibrant colors (reds, blues, greens, purples, yellows) while maintaining vintage aesthetic, aged paper texture, and antique feel - colors should be vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'}
- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT OVERLAYS: extensive cursive handwritten text overlaying the design, like old letters or journal entries, faded brown/sepia ink, flowing script, multiple layers of text
- VINTAGE EPHEMERA: include postage stamps, vintage labels, old tickets, faded botanical illustrations, floral patterns, sheet music notation, vintage seals or stamps
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements - the page should look like a real junk journal page with multiple layers
- MIXED MEDIA: combine the main illustration with handwritten text, stamps, floral patterns, and other vintage elements all layered together
- FLAT printable page design (like a vintage scrapbook page)
- NO modern watercolor illustrations, NO clean digital art
- NO photorealistic rendering, NO realistic photography, NO hyper-realistic details
- NO 3D objects, NO depth, NO shadows, NO realistic lighting
- NO still life compositions, NO objects placed around the page
- Top-down view, flat illustration style, artistic rendering
- Think of it as an illustrated, artistic rendering of an old, worn vintage journal page with handwritten text overlays, stamps, and ephemera - like a real junk journal page, stylized, NOT realistic
- EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}".` : ''}

Create a DISTINCT and UNIQUE design with specific visual details, colors, mood, composition, and style that naturally differs from other variations. 2-3 sentences. Return ONLY the prompt description (without adding "flat" or "printable" again - I'll add those constraints separately).`;

  // Use retry wrapper with header enforcement
  const result = await callPromptWithHeaderEnforcement(
    primarySubject,
    systemPrompt,
    userPrompt,
    apiKey,
    apiUrl,
    useOpenRouter,
    4 // maxAttempts
  );

  // If generation failed or semantic mismatch persists, swap to next subject
  if (!result.text || !result.matched) {
    console.warn(`[PromptGen] Subject "${primarySubject}" failed validation after ${result.attempt} attempts. Marking as failed and swapping subject.`);
    
    // Mark subject as failed so we won't retry it in this batch
    if (usedSubjects) {
      usedSubjects.add(`${primarySubject.toLowerCase()}##FAILED`);
    }
    
    // Pick next available subject from master list
    const available = (masterSubjectList || []).filter(s => {
      const lower = s.toLowerCase();
      return !usedSubjects?.has(lower) && !usedSubjects?.has(`${lower}##FAILED`);
    });
    
    if (available.length === 0) {
      console.error('[PromptGen] No available subjects to swap to.');
      return null;
    }
    
    const nextSubject = available[hash32(variationNumber + 13, available.length)];
    console.log(`[PromptGen] Swapping "${primarySubject}" -> "${nextSubject}"`);
    
    // Recursively call with next subject (limit recursion depth to prevent infinite loops)
    const maxRecursion = 3;
    const recursionDepth = (arguments as any).__recursionDepth || 0;
    if (recursionDepth >= maxRecursion) {
      console.error(`[PromptGen] Max recursion depth reached for subject swapping. Returning null.`);
      return null;
    }
    
    // Create new arguments with next subject
    const newArgs = {
      theme, pageStyle, textureIntensity, elements, includeFrames, includeBorders,
      variationNumber, customThemePrompt, colorIntensity, customArtStyle, promptService,
      masterSubjectList, usedSubjects, primarySubjectOverride: nextSubject
    };
    (newArgs as any).__recursionDepth = recursionDepth + 1;
    
    return await generatePromptWithChatGPT(
      newArgs.theme, newArgs.pageStyle, newArgs.textureIntensity, newArgs.elements,
      newArgs.includeFrames, newArgs.includeBorders, newArgs.variationNumber,
      newArgs.customThemePrompt, newArgs.colorIntensity, newArgs.customArtStyle,
      newArgs.promptService, newArgs.masterSubjectList, newArgs.usedSubjects,
      newArgs.primarySubjectOverride
    );
  }

  // Log result for audit
  if (result.corrected) {
    console.warn(`[PromptGen] Prompt for "${primarySubject}" was corrected (attempt ${result.attempt})`);
  }
  if (!result.matched) {
    console.warn(`[PromptGen] ⚠️ Semantic mismatch: Prompt for "${primarySubject}" may not describe the subject correctly`);
  }

  return result.text;
};

/**
 * Analyzes a reference image using GPT-4o-mini vision to extract theme and style
 * @param base64Image Base64 encoded image (with data URL prefix)
 * @returns Object with theme and style fields
 */
/**
 * Unit test function to simulate variation allocation and detect collisions
 * @param batchSize Number of variations to simulate
 * @returns Object with collision count and details
 */
export function simulateVariationAllocation(batchSize: number): {
  collisions: number;
  collisionDetails: Array<{ variation: number; combination: string }>;
  allocations: Array<{ variation: number; focus: string; angle: string }>;
} {
  // Save original state for restoration
  const originalUsedCombinations = new Set(usedCombinations);
  const originalBatchSeed = currentBatchStyleSeed;
  const originalLastVariation = lastVariationNumber;
  
  // Reset state for clean test
  usedCombinations.clear();
  currentBatchStyleSeed = null;
  lastVariationNumber = 0;

  const allocations: Array<{ variation: number; focus: string; angle: string }> = [];
  const collisionDetails: Array<{ variation: number; combination: string }> = [];
  let collisions = 0;

  for (let i = 1; i <= batchSize; i++) {
    resetBatchIfNeeded(i);
    const beforeSize = usedCombinations.size;
    const { focus, angle } = selectUniqueContent(i);
    const afterSize = usedCombinations.size;
    
    allocations.push({ variation: i, focus, angle });
    
    // Detect collision: if set size didn't increase, we had a collision
    if (afterSize === beforeSize) {
      collisions++;
      collisionDetails.push({ variation: i, combination: `${focus}|${angle}` });
    }
  }

  // Restore original state
  usedCombinations = originalUsedCombinations;
  currentBatchStyleSeed = originalBatchSeed;
  lastVariationNumber = originalLastVariation;

  return {
    collisions,
    collisionDetails,
    allocations
  };
}

export const analyzeReferenceImage = async (base64Image: string): Promise<ImageAnalysisResponse> => {
  const apiKey = getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  // Remove data URL prefix if present (keep just the base64 data)
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image to create a generative art prompt. Return a JSON object with exactly two fields: 1. "theme": A concise subject description (e.g., "Winter Birch Forest with intricate roots"). 2. "style": A detailed style descriptor including medium, texture, colors, and mood (e.g., "Soft atmospheric watercolor, pastel blue and white palette, traditional art style").'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`OpenAI Vision API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data: ChatGPTResponse = await response.json();

    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      try {
        const analysis: ImageAnalysisResponse = JSON.parse(content);
        
        // Validate response structure
        if (!analysis.theme || !analysis.style) {
          throw new Error('Invalid response format: missing theme or style field');
        }

        return {
          theme: analysis.theme.trim(),
          style: analysis.style.trim()
        };
      } catch (parseError) {
        throw new Error(`Failed to parse analysis response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    } else {
      throw new Error('No response from OpenAI Vision API');
    }
  } catch (error: any) {
    console.error('[OpenAI Vision] API Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    throw new Error(`Failed to analyze image: ${error.message || 'Unknown error'}`);
  }
};

