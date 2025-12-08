// Import environment variable accessors
import { getOpenAIApiKey, getOpenRouterApiKey } from './env';

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

/**
 * Logs current metrics for debugging/monitoring
 */
export function logMetrics(): void {
  console.log('[Metrics]', {
    headerMissing: metrics.headerMissing,
    rewrites: metrics.rewrites,
    semanticMismatch: metrics.semanticMismatch,
    retries: metrics.retries,
    swaps: metrics.swaps,
    failedSubjects: failedSubjects.size
  });
}

/**
 * Resets metrics (useful for testing or per-batch tracking)
 */
export function resetMetrics(): void {
  metrics.headerMissing = 0;
  metrics.rewrites = 0;
  metrics.semanticMismatch = 0;
  metrics.retries = 0;
  metrics.swaps = 0;
  failedSubjects.clear();
}

interface ChatGPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ColorPalette {
  name: string;
  hex: string;
}

interface ImageCluster {
  id: string;
  theme: string;
  primary_subject: string;
  style: string;
  technique: string;
  palette: ColorPalette[];
  vibe: string;
  dominant_textures?: string[];
  recommended_prompt_example: string;
}

interface ImageAnalysisResponse {
  clusters: ImageCluster[];
  global_tags?: string[];
  confidence: number;
  // Legacy fields for backward compatibility (extracted from first cluster)
  theme?: string;
  style?: string;
  colors?: string;
  vibe?: string;
}

/**
 * Midjourney-optimized prompt package schema
 */
export interface MJPackage {
  subject_suggestion: string;         // 2-6 words, e.g. "deer portrait", "birch forest path"
  style_tokens: string;               // 3-6 short comma-separated tokens, e.g. "winter watercolor, soft teal palette, paper grain"
  palette_tokens: string;              // 2-5 comma-separated colors/hues e.g. "icy teal, frost blue, soft gray"
  sref_url: string | null;            // URL of uploaded style reference image or null
  batch_seed: number;                  // deterministic seed for batch (caller can pass)
  variation_index: number;             // variation number supplied by caller
  mj_prompt: string;                   // minimal subject prompt for /imagine (subject only)
  mj_ref: string;                      // single string used for --ref (should be: style_tokens + palette_tokens)
  mj_flags: string;                    // full flags ready to append to /imagine (see example)
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
 * After all combinations are exhausted, allows reuse with variation modifiers
 */
function selectUniqueContent(
  variationNumber: number,
  maxAttempts: number = 10
): { focus: string; angle: string } {
  const maxCombinations = subjectFocus.length * cameraAngles.length; // 8 × 5 = 40
  
  // If all combinations are exhausted, allow reuse (for batches > 40)
  if (usedCombinations.size >= maxCombinations) {
    // Use variation number to cycle through combinations with some variation
    const cycleIndex = (variationNumber - 1) % maxCombinations;
    const focusIndex = Math.floor(cycleIndex / cameraAngles.length) % subjectFocus.length;
    const angleIndex = cycleIndex % cameraAngles.length;
    
    const focus = subjectFocus[focusIndex];
    const angle = cameraAngles[angleIndex];
    // Don't add to usedCombinations since we're allowing reuse
    return { focus, angle };
  }

  // Normal case: try to find unique combination
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
// IMAGE-SPECIFIC NATURE-FOCUSED SUBJECT LIST
// ============================================

/**
 * Generates an image-specific nature-focused subject list
 * Based on the image's analysis, generates subjects in three categories:
 * - Animal portraits (centered, elegant)
 * - Botanical compositions
 * - Atmospheric vignette nature scenes
 * 
 * Prohibits cartoon/absurd subjects (gnomes, raccoons, mushrooms, floating islands, etc.)
 */
export async function generateImageSpecificSubjectList(
  imageAnalysis: { theme?: string; style?: string; technique?: string; primary_subject?: string; colors?: string; vibe?: string } | null,
  batchSize: number,
  apiKey: string,
  apiUrl: string,
  useOpenRouter: boolean
): Promise<string[]> {
  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  const listSize = Math.max(batchSize, 36); // Generate at least 36 subjects

  // Extract image analysis data - let ChatGPT analyze the style dynamically
  const imageTheme = imageAnalysis?.theme || 'Nature';
  const imageStyle = imageAnalysis?.style || '';
  const primarySubject = imageAnalysis?.primary_subject || '';
  const imageColors = imageAnalysis?.colors || '';
  const imageVibe = imageAnalysis?.vibe || '';
  const imageTechnique = imageAnalysis?.technique || '';

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
            content: `You are a sophisticated subject generator that analyzes reference images and creates subjects matching their exact aesthetic. 

YOUR TASK:
1. Analyze the image style, colors, vibe, and technique provided
2. Detect the specific aesthetic (e.g., teal/golden magical realism, dark fantasy, fiery fantasy, watercolor, digital painting, vintage, botanical, etc.)
3. Generate exactly ${listSize} unique subjects that match the detected style

STYLE ANALYSIS REQUIREMENTS:
- Analyze the color palette to understand the aesthetic (teal/golden = magical realism, dark/orange/crimson = dark fantasy, pastels = soft/whimsical, etc.)
- Analyze the vibe/mood (whimsical, enchanted, dramatic, intense, mystical, serene, etc.)
- Analyze the technique (watercolor, digital painting, gouache, acrylic, etc.)
- Analyze the composition style (centered portrait, botanical, atmospheric, landscape, etc.)
- Generate subjects that match ALL these aspects

FORBIDDEN SUBJECTS (DO NOT INCLUDE - unless they match the PRIMARY SUBJECT):
- Gnomes, goblins, trolls (unless PRIMARY SUBJECT specifically mentions them)
- Raccoons, squirrels, chipmunks (too cartoon-like, unless in the image)
- Mushrooms (unless part of a sophisticated botanical composition or in PRIMARY SUBJECT)
- Floating islands, flying castles (unless in PRIMARY SUBJECT)
- Anthropomorphic animals (animals wearing clothes, standing upright, unless in PRIMARY SUBJECT)
- Cute or cartoon-style animals (unless in PRIMARY SUBJECT)
- Generic "nature" subjects if PRIMARY SUBJECT is clearly fantasy/magical (be specific - e.g., "nature scene" is too generic)

IMPORTANT: If PRIMARY SUBJECT contains "elf", "elemental", "fairy", "fire", "flames", "magical creature", etc., these are ALLOWED and REQUIRED in your subjects!

SUBJECT REQUIREMENTS:
- Must match the detected style from the image analysis
- Must be specific (2-4 words)
- Must be visually distinct
- Must fit the color palette, vibe, and technique of the reference image
- Examples of good subjects: "elegant deer portrait", "enchanted crystal heart", "glowing golden lantern", "mystical stairway", "dramatic fox silhouette", "fiery peacock display"

OUTPUT FORMAT: Numbered list only, one subject per line. Each subject must be 2-4 words, specific, and visually distinct.`
          },
          {
            role: 'user',
            content: `Analyze this image and generate ${listSize} unique subjects that match its EXACT content and aesthetic:

IMAGE ANALYSIS:
Theme: "${imageTheme}"
Style: "${imageStyle}"
${imageTechnique ? `Technique: "${imageTechnique}"` : ''}
**PRIMARY SUBJECT: "${primarySubject}"** ⚠️ THIS IS THE MOST IMPORTANT FIELD - MATCH THIS!
${imageColors ? `Color Palette: "${imageColors}"` : ''}
${imageVibe ? `Vibe/Atmosphere: "${imageVibe}"` : ''}

CRITICAL INSTRUCTIONS:
1. **MATCH THE PRIMARY SUBJECT FIRST**: 
   - If PRIMARY SUBJECT contains "elf" → Generate subjects like "mystical elf portrait", "fire-wielding elf", "elven creature", "forest elf", "fire elf"
   - If PRIMARY SUBJECT contains "elemental" → Generate subjects like "fire elemental form", "earth elemental essence", "water elemental manifestation", "elemental being"
   - If PRIMARY SUBJECT contains "fire" or "flames" → Generate subjects like "flame-wreathed creature", "fire spirit", "burning entity", "flame elemental", "fire-wielding being"
   - If PRIMARY SUBJECT contains "magical creature" → Generate subjects like "magical being", "enchanted creature", "mystical entity"
   - If PRIMARY SUBJECT is "Deer portrait" → Generate subjects like "elegant deer portrait", "majestic stag", "forest deer"
   - **DO NOT default to generic "nature" subjects if PRIMARY SUBJECT is clearly fantasy/magical!**

2. Match the color palette:
   - If fiery red/orange → fire/fantasy subjects (especially if PRIMARY SUBJECT mentions fire/flames)
   - If teal/golden → magical realism subjects
   - If dark/orange/crimson → dark fantasy subjects
   - If pastels → soft/whimsical subjects

3. Match the vibe:
   - If dramatic/intense/fiery → dramatic/fire subjects
   - If whimsical/enchanted → magical/fantasy subjects
   - If serene → peaceful subjects

4. Match the technique and composition style

5. Be specific: Instead of "nature scene", use "enchanted forest doorway" or "moonlit clearing" (but ONLY if PRIMARY SUBJECT is nature-focused)

**REMEMBER: If PRIMARY SUBJECT = "Elf with fire" or "Elemental creature" or "Fire/flames", your subjects MUST include these elements!**

Output ONLY a numbered list, one subject per line.`
          }
        ],
        temperature: 0.4, // Lower temperature for more deterministic, sophisticated results
        max_tokens: 1200,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to generate image-specific subject list: ${response.status}`);
    }

    const data: ChatGPTResponse = await response.json();
    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content;
      
      // Clean DeepSeek output if using OpenRouter
      if (useOpenRouter) {
        content = cleanDeepSeekOutput(content);
      }
      
      // Parse numbered list
      const subjects = content
        .split('\n')
        .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => {
          const lower = line.toLowerCase();
          // Filter out forbidden subjects (but allow if they match the primary subject)
          // Only filter if the primary subject doesn't contain these elements
          const primarySubjectLower = (primarySubject || '').toLowerCase();
          const isFantasyImage = primarySubjectLower.includes('elf') || primarySubjectLower.includes('elemental') || 
                                 primarySubjectLower.includes('fairy') || primarySubjectLower.includes('magical') ||
                                 primarySubjectLower.includes('fire') || primarySubjectLower.includes('flame');
          
          // If image is fantasy/magical, allow fantasy subjects; otherwise filter them
          const forbidden = isFantasyImage 
            ? ['raccoon', 'squirrel', 'chipmunk', 'floating island', 'flying castle', 'anthropomorphic'] // Allow elves, elementals, fairies for fantasy images
            : ['gnome', 'fairy', 'elf', 'goblin', 'troll', 'raccoon', 'squirrel', 'chipmunk', 'floating island', 'flying castle', 'anthropomorphic']; // Filter all for nature images
          
          return line.length > 0 && line.length < 60 && !forbidden.some(f => lower.includes(f));
        })
        .slice(0, listSize);
      
      if (subjects.length >= Math.min(batchSize, 20)) {
        console.log(`[Image-Specific Subject List] Generated ${subjects.length} subjects for theme "${imageTheme}" (Primary Subject: "${primarySubject}")`);
        return subjects;
      }
    }
  } catch (error) {
    console.error('[Image-Specific Subject List] Generation failed:', error);
  }

  // Fallback: generic subjects (should rarely be used since ChatGPT should handle style detection)
  const fallbackSubjects: string[] = [
    // Animal portraits
    'elegant deer portrait', 'majestic stag silhouette', 'graceful fox profile', 'peacock feather display', 'wise owl portrait', 'swan in moonlight', 'noble horse head', 'proud wolf howl', 'grizzly bear portrait', 'eagle in flight', 'hawk on branch', 'raven on tree',
    // Botanical compositions
    'elegant rose bouquet', 'pressed botanical specimen', 'vine pattern border', 'fern frond cluster', 'wildflower meadow', 'herb garden arrangement', 'leaf cluster composition', 'botanical illustration page',
    // Atmospheric scenes
    'forest doorway entrance', 'moonlit clearing', 'misty forest path', 'enchanted grove', 'twilight meadow', 'dawn-lit valley', 'starlit forest', 'sun-dappled glade', 'mystical woodland', 'ancient tree portal', 'secret garden path', 'hidden forest clearing'
  ];
  
  // Extend fallback list to match batchSize
  const extendedFallback: string[] = [];
  for (let i = 0; i < listSize; i++) {
    extendedFallback.push(fallbackSubjects[i % fallbackSubjects.length]);
  }

  return extendedFallback.slice(0, listSize);
}

/**
 * Normalizes text for semantic matching
 */
function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detects photographic/photorealistic language in prompts
 * Uses contextual patterns to avoid false positives from subject names
 */
const photorealismPattern = /\b(photoreal|photorealistic|photograph(s)?|photo of|photo:|photography|dslr|bokeh|shutter|f\/\d+|depth of field|dof|hyper-?real|ultra-?real|cinematic lens|realistic lighting|photorealism)\b/i;

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
      metrics.rewrites++;
      const fixed = `PRIMARY SUBJECT: ${requiredSubject}. ${rest}`;
      const matched = await subjectMatchesPrompt(requiredSubject, fixed, apiKey, apiUrl, useOpenRouter);
      return { text: fixed, corrected: true, matched };
    }
    const matched = await subjectMatchesPrompt(requiredSubject, trimmed, apiKey, apiUrl, useOpenRouter);
    return { text: trimmed, corrected: false, matched };
  } else {
    // Prepend header
    console.warn(`[Primary Subject] Missing header in prompt. Adding: "${requiredSubject}"`);
    metrics.rewrites++;
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
  maxAttempts: number = 4, // Allow extra retry for tricky subjects
  temperature: number = 0.3, // Default temperature (can be overridden for Custom/Override mode)
  maxTokens: number = 220 // Default max_tokens (can be overridden for Custom/Override mode)
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
          temperature: temperature, // Use passed temperature (default 0.3, Custom/Override uses 0.1)
          max_tokens: useOpenRouter ? (maxTokens === 100 ? 100 : 4000) : maxTokens, // Use passed max_tokens (default 220, Custom/Override uses 100)
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
      // IMPORTANT: Strip PRIMARY SUBJECT header before checking to avoid false positives
      // when the subject name itself contains "photo" (e.g., "Driftwood photo display")
      const bodyOnly = (text || '').replace(/^PRIMARY SUBJECT:\s*.*?\.\s*/i, '').trim();
      
      if (containsPhotographicLanguage(bodyOnly)) {
        console.warn(`[PromptGen] Photographic language detected for "${subject}". Body: "${bodyOnly.slice(0, 120)}"... forcing rewrite (attempt ${attempt})`);
        metrics.rewrites++;
        if (attempt < maxAttempts) continue; // trigger retry so the model rewrites
        
        // On final attempt, force an illustrated rewrite (operate on bodyOnly to avoid double header)
        const forcedIllustration = `PRIMARY SUBJECT: ${subject}. ${bodyOnly} (REWRITE: make this a HAND-DRAWN illustration style, not a photograph. Use "ink and watercolor", "hand-drawn", "flat vector", or "pastel drawing" and remove any photographic language.)`;
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
            metrics.rewrites++;
            metrics.retries++;
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
          metrics.semanticMismatch++;
          metrics.retries++;
          if (attempt < maxAttempts) continue;
          return { ...result, attempt, matched: false };
        }
      }

      // Header missing - retry if not last attempt
      if (attempt < maxAttempts) {
        console.warn(`[PromptGen] Header missing for "${subject}" (attempt ${attempt}/${maxAttempts}). Retrying...`);
        metrics.headerMissing++;
        metrics.retries++;
        continue;
      }

      // Final fallback: force header
      const forced = `PRIMARY SUBJECT: ${subject}. ${text.replace(/^(\s*PRIMARY SUBJECT:.*?\.)/i, '').trim()}`;
      const matched = await subjectMatchesPrompt(subject, forced, apiKey, apiUrl, useOpenRouter);
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
  let cleaned = content || '';

  // Remove common reasoning/redacted blocks (either tag form)
  cleaned = cleaned.replace(/<(?:think|redacted_reasoning)[\s\S]*?<\/(?:think|redacted_reasoning)>/gi, '');

  // Remove any other redacted blocks if present
  cleaned = cleaned.replace(/<redacted>[\s\S]*?<\/redacted>/gi, '');

  // Remove any markdown code block fences if present
  cleaned = cleaned.replace(/```(?:json|text|markdown)?/gi, '').replace(/```/g, '');

  // Remove double em-dash or double dash sequences that confuse image engines
  cleaned = cleaned.replace(/——\s*/g, '').replace(/--\s*([A-Za-z])/g, '$1');

  // Trim whitespace/newlines
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
  colorIntensity: 'Muted' | 'Normal' | 'Colorful' | 'Multicolored' | 'Custom / Override' = 'Muted',
  customArtStyle?: string,
  promptService: 'openai' | 'openrouter' = 'openai',
  masterSubjectList?: string[],
  usedSubjects?: Set<string>,
  primarySubjectOverride?: string, // Optional: override subject selection for swapping
  recursionDepth: number = 0, // NEW: explicit recursion depth counter
  imageClusterData?: any, // Optional: full image cluster data from analysis (for Image Theme Expansion)
  isSrefMode: boolean = false, // NEW: SREF Style Match mode flag
  srefCode: string = '' // NEW: Midjourney SREF code/URL
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
  // SREF STYLE MATCH MODE (Final Fix: Hard-Coded Category Injection)
  // ============================================
  if (isSrefMode) {
    // Determine primary subject for SREF mode
    let primarySubject: string;
    if (primarySubjectOverride && primarySubjectOverride.trim()) {
      primarySubject = primarySubjectOverride.trim();
    } else if (masterSubjectList && masterSubjectList.length > 0) {
      const forbiddenSubjects = usedSubjects ? Array.from(usedSubjects).filter(s => !s.includes('##FAILED')).map(s => s.replace('##FAILED', '')) : [];
      let attempts = 0;
      do {
        const subjectIndex = hash32(variationNumber + attempts * 100, masterSubjectList.length);
        primarySubject = masterSubjectList[subjectIndex];
        attempts++;
      } while (usedSubjects?.has(primarySubject.toLowerCase()) && attempts < 10);
      
      if (usedSubjects?.has(primarySubject.toLowerCase())) {
        const available = masterSubjectList.filter(s => !usedSubjects?.has(s.toLowerCase()));
        if (available.length > 0) {
          primarySubject = available[hash32(variationNumber, available.length)];
        }
      }
    } else {
      primarySubject = `${theme} element ${variationNumber}`;
    }

    // Define 12 distinct categories to prevent repetition (ensures 48 unique images before category repeats)
    // Use hash32 to ensure each variation gets a unique category (not just modulo rotation)
    const categoryConfigs = [
      {
        name: "Botanical/Flora",
        examples: ["Glowing Mushroom", "Fern", "Exotic Flower", "Moss", "Leaf", "Berry", "Seed", "Root", "Bark", "Twig", "Ivy", "Thorn", "Petal", "Stem", "Blossom"],
        forbidden: ["animal", "creature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Small Creature",
        examples: ["Frog", "Mouse", "Moth", "Beetle", "Snail", "Spider", "Cricket", "Caterpillar", "Dragonfly", "Firefly", "Bee", "Butterfly", "Ladybug", "Grasshopper", "Ant"],
        forbidden: ["plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal", "larger", "fox", "owl", "deer"]
      },
      {
        name: "Magical Artifact",
        examples: ["Key", "Potion Bottle", "Amulet", "Crystal", "Lantern", "Scroll", "Wand", "Orb", "Vial", "Talisman", "Grimoire", "Hourglass", "Compass", "Seal", "Charm"],
        forbidden: ["animal", "creature", "plant", "nature", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Architectural Element",
        examples: ["Stone Arch", "Tiny Door", "Gate", "Bridge", "Window", "Staircase", "Fence", "Portal", "Arch", "Gatepost", "Threshold", "Entryway", "Gateway", "Passage", "Column"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "potion", "lantern", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Celestial/Cosmic",
        examples: ["Moon Phase", "Star Map", "Constellation", "Nebula", "Comet", "Aurora", "Solar Eclipse", "Stardust", "Galaxy", "Planet", "Asteroid", "Meteor", "Cosmic Dust", "Star Cluster", "Lunar Surface"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Ephemera/Stationery",
        examples: ["Old Letter", "Quill", "Ink Pot", "Tag", "Envelope", "Wax Seal", "Postage Stamp", "Ticket", "Label", "Bookmark", "Note", "Manuscript", "Parchment", "Scroll", "Certificate"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Forest Dwelling",
        examples: ["Treehouse", "Hollow Log", "Birdhouse", "Nest", "Burrow", "Den", "Cabin", "Hut", "Shelter", "Hideaway", "Refuge", "Sanctuary", "Retreat", "Cottage", "Shack"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "water", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Larger Animal",
        examples: ["Fox", "Owl", "Deer", "Badger", "Raven", "Wolf", "Bear", "Hawk", "Swan", "Crow", "Eagle", "Stag", "Hawk", "Falcon", "Raccoon"],
        forbidden: ["plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical", "seasonal", "small", "frog", "mouse", "moth"]
      },
      {
        name: "Water Feature",
        examples: ["Puddle", "Stream", "Reflection", "Dew Drop", "Pond", "Fountain", "Waterfall", "Spring", "Well", "Creek", "Brook", "Ripple", "Wave", "Mist", "Raindrop"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "food", "cozy", "abstract", "magical", "seasonal"]
      },
      {
        name: "Food/Cozy Item",
        examples: ["Tea Cup", "Berries", "Basket", "Candle", "Cookie", "Apple", "Bread", "Honey", "Jam", "Muffin", "Pie", "Cake", "Mug", "Pot", "Jar"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "abstract", "magical", "seasonal"]
      },
      {
        name: "Abstract/Magical",
        examples: ["Swirling Mist", "Spell Sparkles", "Rune", "Energy Orb", "Magic Circle", "Aura", "Glow", "Shimmer", "Ethereal Light", "Mystical Energy", "Enchanted Glow", "Magical Aura", "Spell Effect", "Mystical Mist", "Ethereal Essence"],
        forbidden: ["animal", "creature", "plant", "nature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "seasonal"]
      },
      {
        name: "Seasonal Element",
        examples: ["Falling Leaf", "Snowflake", "Acorn", "Pinecone", "Icicle", "Flower Petal", "Maple Leaf", "Cherry Blossom", "Autumn Leaf", "Winter Branch", "Spring Bud", "Summer Bloom", "Frost", "Dew", "Hailstone"],
        forbidden: ["animal", "creature", "object", "artifact", "structure", "path", "door", "archway", "celestial", "cosmic", "ephemera", "stationery", "dwelling", "water", "food", "cozy", "abstract", "magical"]
      }
    ];

    // Use hash32 to select category deterministically but uniquely for each variation
    const categoryIndex = hash32(variationNumber * 7, categoryConfigs.length);
    const targetCategory = categoryConfigs[categoryIndex];
    
    // Use hash32 to select a unique example from the category for this variation
    const exampleIndex = hash32(variationNumber * 13 + categoryIndex * 17, targetCategory.examples.length);
    const exampleSubject = targetCategory.examples[exampleIndex];

    const systemPrompt = `You are a Subject Generator for Midjourney SREF Mode.

YOUR GOAL:
The user has provided a MASTER THEME: "${primarySubject}".
Your job is to generate a specific "Nano-Subject" that fits this theme, strictly within the assigned CATEGORY.

CURRENT CATEGORY CONSTRAINT: **${targetCategory.name}**
VARIATION NUMBER: #${variationNumber} (This variation must be UNIQUE - different from all other variations)

CRITICAL RULES:
1. **OBEY THE CATEGORY:** The subject MUST be a "${targetCategory.name}". Do not deviate.
2. **FORBIDDEN WORDS:** Do NOT use any of these words: ${targetCategory.forbidden.join(', ')}.
3. **BE SPECIFIC:** Drill down to a specific item. Use the example "${exampleSubject}" as inspiration, but create a COMPLETELY DIFFERENT specific subject.
4. **UNIQUENESS:** This is variation #${variationNumber}. It must be COMPLETELY DIFFERENT from all other variations. Each variation gets a unique category, example, and action combination.
5. **NO STYLE WORDS:** Do NOT use words like "watercolor", "vintage", "grunge", "illustration", "painting". The --sref handles that.
6. **TEXT ONLY:** Output just the descriptive sentence, no headers.

EXAMPLES FOR THIS CATEGORY (use as inspiration, but create something DIFFERENT):
- ${targetCategory.examples.slice(0, 5).join('\n- ')}

Output format: "[Specific subject description & action ONLY]."`;

    // Calculate a deterministic variation modifier to ensure uniqueness
    // Use hash32 to select a unique action/state for each variation (not just rotating)
    const actionModifiers = [
      "resting", "perched", "glowing", "hanging", "floating", "growing", "standing", "sitting", 
      "illuminating", "sparkling", "shimmering", "twinkling", "dancing", "flying", "crawling", "leaping",
      "sleeping", "watching", "guarding", "blooming", "shining", "reflecting", "swaying", "nesting",
      "foraging", "hunting", "playing", "exploring", "hiding", "emerging", "transforming", "evolving"
    ];
    const actionIndex = hash32(variationNumber * 23 + categoryIndex * 29, actionModifiers.length);
    const suggestedAction = actionModifiers[actionIndex];

    // INJECT the category directly into the user prompt to force compliance
    const userPrompt = `Generate Variation #${variationNumber} for theme "${primarySubject}".

CATEGORY: **${targetCategory.name}**
EXAMPLE INSPIRATION: "${exampleSubject}" (but create something COMPLETELY DIFFERENT)

VARIATION REQUIREMENTS:
- This is variation #${variationNumber} (each variation must be UNIQUE)
- Category: ${targetCategory.name} (selected uniquely for this variation)
- Suggested action/state: "${suggestedAction}" (use this or a similar action)

INSTRUCTIONS:
1. Generate a SPECIFIC ${targetCategory.name} that fits "${primarySubject}".
2. Use "${exampleSubject}" as inspiration, but create a COMPLETELY UNIQUE subject (not the same as the example).
3. Include action/state: "${suggestedAction}" or similar (e.g., "A glowing mushroom", "A lantern illuminating", "A fox resting").
4. Describe it clearly in 10-15 words with action/pose.
5. DO NOT use: ${targetCategory.forbidden.join(', ')}.
6. CRITICAL: This variation #${variationNumber} must be COMPLETELY DIFFERENT from ALL other variations. Each variation gets a unique category, example, and action. Think creatively about a DISTINCT ${targetCategory.name.toLowerCase()} that fits the theme.

Output ONLY: "[Your specific subject description]"`;

    // SREF mode: Direct API call without header enforcement (no "PRIMARY SUBJECT:" required)
    const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
    let cleaned: string | null = null;
    
    for (let attempt = 1; attempt <= 4; attempt++) {
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
            temperature: 0.2,
            max_tokens: useOpenRouter ? 4000 : 150,
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
        
        let text = rawText.trim();

        // Remove any surrounding quotes (single or double) that the LLM might add
        text = text.replace(/^["']|["']$/g, '');
        
        // Remove any style words that might have slipped through
        const styleWords = ['watercolor', 'vintage', 'grunge', 'illustration', 'camera', 'lighting', 'texture', 'aesthetic', 'mood', 'atmosphere', 'vibe', 'colors', 'palette', 'shadows', 'background', 'photorealistic', 'digital', '3D', 'smooth', 'shiny', 'modern'];
        styleWords.forEach(word => {
          const regex = new RegExp(`\\b${word}\\b`, 'gi');
          text = text.replace(regex, '');
        });
        
        // Remove "PRIMARY SUBJECT:" header if present (new format doesn't use it)
        text = text.replace(/^PRIMARY\s+SUBJECT:\s*/i, '');
        
        // Remove theme name repetition if it appears at the start
        // Example: "Nature. A red fox..." → "A red fox..."
        const escapedTheme = primarySubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const themeRegex = new RegExp(`^${escapedTheme}\\s*[.,]?\\s*`, 'gi');
        text = text.replace(themeRegex, '');
        
        // Clean up extra spaces and trim
        text = text.replace(/\s+/g, ' ').trim();
        
        // Ensure we have actual content (not just empty after cleaning)
        if (!text || text.length === 0) {
          console.warn(`[PromptGen] SREF mode prompt became empty after cleaning (attempt ${attempt}/4). Original: "${rawText}"`);
          if (attempt < 4) continue;
          return null;
        }
        
        cleaned = text;
        break; // Success - exit retry loop
      } catch (error: any) {
        console.error(`[PromptGen] SREF mode error on attempt ${attempt}/4 for "${primarySubject}":`, error);
        if (attempt < 4) continue;
        return null;
      }
    }

    if (!cleaned) {
      console.warn(`[PromptGen] Failed to generate SREF mode prompt for "${primarySubject}" after 4 attempts`);
      return null;
    }
    
    // Return just the description (no header needed for SREF mode)
    return cleaned;
  }

  // ============================================
  // BATCH STATE MANAGEMENT
  // ============================================
  // Reset batch state if starting a new batch
  resetBatchIfNeeded(variationNumber);

  // ============================================
  // PRIMARY SUBJECT SELECTION (From Master List or User-Specified)
  // ============================================
  let primarySubject: string;
  const forbiddenSubjects = usedSubjects ? Array.from(usedSubjects).filter(s => !s.includes('##FAILED')).map(s => s.replace('##FAILED', '')) : [];
  
  // Use user-specified subject if provided, otherwise use master list
  console.log(`[PromptGen] primarySubjectOverride: "${primarySubjectOverride}", masterSubjectList length: ${masterSubjectList?.length || 0}`);
  if (primarySubjectOverride && primarySubjectOverride.trim()) {
    // User explicitly specified a subject - use it for all variations
    primarySubject = primarySubjectOverride.trim();
    console.log(`[PromptGen] ✅ Using user-specified subject: "${primarySubject}"`);
  } else if (masterSubjectList && masterSubjectList.length > 0) {
    // No user subject - auto-generate from master list
    let attempts = 0;
    do {
      const subjectIndex = hash32(variationNumber + attempts * 100, masterSubjectList.length);
      primarySubject = masterSubjectList[subjectIndex];
      attempts++;
    } while (usedSubjects?.has(primarySubject.toLowerCase()) && attempts < 10);
    console.log(`[PromptGen] Auto-generated subject from list: "${primarySubject}"`);
    
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

  // CRITICAL: If colorIntensity is 'Custom / Override', check if we should expand on PRIMARY SUBJECT with detected style
  if (colorIntensity === 'Custom / Override') {
    // Check if user provided PRIMARY SUBJECT and we have detected style - if so, expand on it while maintaining style
    const hasUserPrimarySubject = primarySubject && primarySubject.trim().length > 0;
    const hasDetectedStyle = customArtStyle && customArtStyle.trim().length > 0;
    const shouldExpandWithStyle = hasUserPrimarySubject && hasDetectedStyle;
    
    if (shouldExpandWithStyle) {
      // Get list of already used subjects to avoid duplicates
      const usedSubjectsList = usedSubjects ? Array.from(usedSubjects).filter(s => !s.includes('##FAILED')).map(s => s.replace('##FAILED', '').toLowerCase()) : [];
      const usedSubjectsText = usedSubjectsList.length > 0 ? `\n\n⚠️ ALREADY USED SUBJECTS (DO NOT REPEAT): ${usedSubjectsList.slice(-10).join(', ')}` : '';
      
      // If we have full image cluster data, use it to extract all style parameters
      const hasFullClusterData = imageClusterData && imageClusterData.clusters && imageClusterData.clusters[0];
      const cluster = hasFullClusterData ? imageClusterData.clusters[0] : null;
      
      // Extract style parameters from cluster or customArtStyle
      const colorPalette = cluster?.palette ? cluster.palette.map((c: any) => `${c.name} (${c.hex})`).join(', ') : '';
      
      // 1. Define the Style Translation Layer - Vintage Junk Journal Techniques
      const vintageTechniques = [
        {
          name: "Botanical Engraving",
          desc: "Detailed black ink line work, cross-hatching, scientific illustration style, antique biology textbook aesthetic.",
          texture: "aged parchment"
        },
        {
          name: "Mixed Media Collage",
          desc: "Layered composition with torn paper edges, vintage newspaper clippings, tape marks, and ephemera elements.",
          texture: "distressed grunge overlay"
        },
        {
          name: "Faded Watercolor",
          desc: "Soft, washed-out paint, pigment bleeds, water stains, wet-on-wet technique, dreamy and ethereal.",
          texture: "tea-stained paper"
        },
        {
          name: "Antique Lithograph",
          desc: "Grainy texture, noise, slight print misalignment, muted ink, posterized vintage print look.",
          texture: "worn edges and noise"
        }
      ];
      
      // Select technique deterministically based on variation number (modulo 4)
      const selectedTech = vintageTechniques[(variationNumber - 1) % vintageTechniques.length];
      
      // 2. Construct the prompts with Style Translation Layer
      const systemPrompt = `You are a "Style Translator" for a Vintage Junk Journal Kit. 

INPUT: A subject and color palette from a reference image (which might be modern/digital).
OUTPUT: A prompt for a specific VINTAGE ARTISTIC INTERPRETATION of that subject.

YOUR GOAL: 
1. Take the PRIMARY SUBJECT (e.g., Castle, Fox) and the COLORS.
2. DISCARD the modern style (ignore 3D, glowing, digital, smooth, pixar-style).
3. RE-IMAGINE the subject using this specific artistic technique: "${selectedTech.name}".
4. FORCE these textures: "${selectedTech.texture}, vintage, distressed, grunge".

Output format: "PRIMARY SUBJECT: [Subject]. [Detailed description using the specific vintage technique and textures]."`;

      const userPrompt = hasFullClusterData 
        ? `Translate this subject into a Vintage Junk Journal design.

SOURCE ANALYSIS:
- Subject: ${primarySubject} (Theme: ${primarySubject})
- Detected Colors: ${colorPalette} (Use these colors, but make them muted/vintage/ink-based)

REQUIRED TARGET STYLE (Variation ${variationNumber}):
- Technique: ${selectedTech.name} (${selectedTech.desc})
- Mandatory Texture: ${selectedTech.texture}
- Vibe: Ancient, mysterious, handcrafted, tactile.

INSTRUCTIONS:
1. Ignore any "digital", "3D", or "smooth" aspects of the original image.
2. Describe a ${selectedTech.name} of a DIFFERENT subject that fits the "${primarySubject}" theme.
3. Ensure the result looks like it belongs in an old scrapbook or grimoire.

Output ONLY: "PRIMARY SUBJECT: [Theme]. [Your prompt]"`
        : `Translate this subject into a Vintage Junk Journal design.

PRIMARY SUBJECT (THEME): ${primarySubject}
SOURCE COLORS/VIBE: ${customArtStyle} (Interpret this loosely, force it into a vintage aesthetic)

REQUIRED TARGET STYLE (Variation ${variationNumber}):
- Technique: ${selectedTech.name} (${selectedTech.desc})
- Mandatory Texture: ${selectedTech.texture}

INSTRUCTIONS:
1. Ignore "digital", "shiny", or "modern" descriptors.
2. Generate a unique subject fitting the theme, rendered as a ${selectedTech.name}.
3. Focus on texture, age, and imperfection.

Output ONLY: "PRIMARY SUBJECT: [Theme]. [Your prompt]"`;
      
      // Use retry wrapper with header enforcement
      const result = await callPromptWithHeaderEnforcement(
        primarySubject,
        systemPrompt,
        userPrompt,
        apiKey,
        apiUrl,
        useOpenRouter,
        4, // maxAttempts
        0.4, // temperature (higher for more creative expansion)
        200 // max_tokens (more tokens for expanded descriptions)
      );

      if (!result.text) {
        console.warn(`[PromptGen] Failed to generate expanded prompt for "${primarySubject}" after ${result.attempt} attempts`);
        return null;
      }

      // Validation and truncation
      if (result.text) {
        const lines = result.text.split('\n').filter(l => l.trim());
        if (lines.length >= 2) {
          const sentences = lines[1].split(/[.!?]+/).filter(s => s.trim());
          if (sentences.length > 1) {
            const simplified = `PRIMARY SUBJECT: ${primarySubject}. ${sentences[0]}.`;
            return simplified;
          }
        }
      }

      return result.text;
    } else {
      // No user PRIMARY SUBJECT or no detected style → Use ultra-minimal prompt
      const systemPrompt = `You generate MINIMAL subject-only prompts for Midjourney.

RULES:
1. Start with "PRIMARY SUBJECT: [exact subject]"
2. ONE sentence: ONLY what the subject is and its basic pose/position (8-12 words max)
3. FORBIDDEN WORDS - NEVER USE: style, technique, illustration, painting, digital, watercolor, realistic, photorealistic, collage, vintage, impressionist, artistic, art, artwork, drawing, sketch, render, aesthetic, mood, atmosphere, vibe, colors, palette, lighting, shadows, texture, background
4. ONLY describe: subject + pose + composition type

EXAMPLES:
PRIMARY SUBJECT: Owl on branch. Owl perched on oak branch, centered view.

PRIMARY SUBJECT: Deer in meadow. Young deer standing among flowers, portrait orientation.

PRIMARY SUBJECT: Swan on water. Swan gliding across pond, symmetrical composition.

FORBIDDEN EXAMPLES:
❌ "Painterly illustration of..." 
❌ "Whimsical digital art showing..."
❌ "Photorealistic macro of..."
❌ "Vintage collage featuring..."

Output ONLY: "PRIMARY SUBJECT: [subject]. [8-12 word sentence with zero style words]"`;

      const userPrompt = `Generate a minimal subject description for variation ${variationNumber}.

REQUIRED SUBJECT: ${primarySubject}

OUTPUT FORMAT (STRICT):
Line 1: PRIMARY SUBJECT: ${primarySubject}
Line 2: One simple sentence (10-15 words max) - subject pose/position and basic composition only.

Theme: ${themeDescription}
Composition type: ${randomFocus}

CRITICAL: Keep it minimal. Style reference images handle all visual styling. You only describe WHAT is shown, not HOW it looks.`;

    // Use retry wrapper with header enforcement
    // For Custom/Override mode, use lower temperature and fewer tokens for minimal prompts
    const result = await callPromptWithHeaderEnforcement(
      primarySubject,
      systemPrompt,
      userPrompt,
      apiKey,
      apiUrl,
      useOpenRouter,
      4, // maxAttempts
      0.1, // temperature (lower for more deterministic, minimal output)
      100 // max_tokens (reduced for shorter prompts)
    );

    // If generation failed (returned null), return null so caller can swap subjects
    if (!result.text) {
      console.warn(`[PromptGen] Failed to generate valid prompt for "${primarySubject}" after ${result.attempt} attempts`);
      return null; // Caller should swap to next subject from master list
    }

    // Add validation to truncate prompts if they're too long
    if (result.text) {
      const bodyText = result.text.replace(/^PRIMARY SUBJECT:.*?\.\s*/i, '').trim();
      const sentences = bodyText.split(/\.\s+/);
      
      // If more than 1 sentence, keep only the first
      if (sentences.length > 1) {
        console.warn(`[PromptGen] Prompt too long (${sentences.length} sentences), truncating to first sentence`);
        const simplified = `PRIMARY SUBJECT: ${primarySubject}. ${sentences[0]}.`;
        return simplified;
      }
      
      // Check word count (should be 10-15 words after PRIMARY SUBJECT header)
      const wordCount = bodyText.split(/\s+/).length;
      if (wordCount > 20) {
        console.warn(`[PromptGen] Prompt too long (${wordCount} words), truncating to first sentence`);
        const firstSentence = sentences[0] || bodyText.split('.')[0];
        const simplified = `PRIMARY SUBJECT: ${primarySubject}. ${firstSentence}.`;
        return simplified;
      }
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
  }

  // Get global variation control for all modes (themeDescription already defined above)
  const variationControl = getVariationControl(variationNumber, themeDescription);

  // Default prompts (existing logic)
  // Note: 'Custom / Override' is already handled above with early return
    const systemPrompt = colorIntensity === 'Multicolored'
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
  
  // Reusable variation instruction pools
  const variationInstructionsNormal = [
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
  ];

  const variationInstructionsGeneric = [
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

  // Choose appropriate instruction array based on colorIntensity (or other logic)
  const _variationInstructions = colorIntensity === 'Normal' ? variationInstructionsNormal : variationInstructionsGeneric;

  // Safely choose one entry from the array using the provided hash32 function (deterministic)
  const variationInstruction = _variationInstructions[(variationNumber - 1) % _variationInstructions.length];
  
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

  // Check if customArtStyle contains color palette or vibe information
  const hasColorPalette = customArtStyle && /color palette:/i.test(customArtStyle);
  const hasVibe = customArtStyle && /vibe\/atmosphere:/i.test(customArtStyle);
  
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

🎯 CRITICAL: MAINTAIN CONSISTENCY WHILE VARYING SUBJECTS
The style description (including vibe/atmosphere and color palette if provided) was extracted from a reference image. You MUST:
- MAINTAIN the same vibe/atmosphere, style, and color palette across ALL variations
- VARY the SUBJECTS within the ${themeDescription} theme (e.g., if theme is "Christmas", use different subjects like "deer", "santa", "presents", "winter trees", "snowflakes", "winter clothing", etc.)
- Each variation should have a DIFFERENT subject but the SAME overall vibe, style, and colors
- Think of it like: "Same winter/Christmas vibe, different things in the images"

IMPORTANT: Generate a high-quality, artistic representation of ${themeDescription}. Do NOT automatically add junk journal elements (stamps, ephemera, handwritten text, distressed textures) unless the theme explicitly calls for them. Do NOT force 'modern' or 'flat' styles unless requested. Follow the theme description exactly as provided.

${hasVibe ? '🎨 VIBE/ATMOSPHERE REQUIREMENT: The style description includes a specific vibe/atmosphere extracted from a reference image. You MUST maintain this exact vibe/atmosphere in your prompt. The mood and feeling should be consistent across all variations.' : ''}
${hasColorPalette ? '🎨 COLOR PALETTE REQUIREMENT: The style description includes a specific color palette extracted from a reference image. You MUST use these exact colors prominently in your prompt. Match the color palette as closely as possible while maintaining artistic quality. The colors should be consistent across all variations, even though subjects change.' : '🎨 COLOR SAFETY RULE: Avoid digital neon colors (hot pink, electric blue) and plastic textures. HOWEVER, if the theme is \'Gothic\', \'Dark\', or \'Fantasy\', you MUST use **Deep Shadows, High Contrast (Chiaroscuro), and Dark Muted Tones** (Indigo, Charcoal, Sepia). Do not force \'Soft/Pastel\' colors on Dark themes.'}

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
      failedSubjects.add(primarySubject.toLowerCase());
      metrics.swaps++;
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
    if (recursionDepth >= maxRecursion) {
      console.error(`[PromptGen] Max recursion depth reached for subject swapping. Returning null.`);
      return null;
    }

    // Call recursively with the next subject and increase recursionDepth
    return await generatePromptWithChatGPT(
      theme,
      pageStyle,
      textureIntensity,
      elements,
      includeFrames,
      includeBorders,
      variationNumber,
      customThemePrompt,
      colorIntensity,
      customArtStyle,
      promptService,
      masterSubjectList,
      usedSubjects,
      nextSubject,
      recursionDepth + 1,
      imageClusterData // Pass imageClusterData to recursive call
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
                text: `SYSTEM TASK — Image Analysis for Prompt Generation (STRICT JSON OUTPUT)

You are an image analysis assistant whose job is to extract precise, machine-friendly metadata for generating art prompts. For each input image, return **only** a single JSON object (no markdown, no extra text) that exactly follows the schema below. If the image clearly belongs to more than one visual cluster, return a "clusters" array with one entry per cluster.

REQUIRED JSON SCHEMA (exact keys):
{
  "clusters": [
    {
      "id": "coastal-001",
      "theme": "Coastal Landscape",
      "primary_subject": "Rugged coastal cliffs",
      "style": "Painterly digital impressionism with visible brushstrokes",
      "technique": "digital painting",
      "palette": [
        {"name":"Peach sunlight","hex":"#F5C9A9"},
        {"name":"Terracotta","hex":"#B85A2A"},
        {"name":"Teal ocean","hex":"#2E9AA8"},
        {"name":"Dusty lavender","hex":"#BFA6C7"}
      ],
      "vibe": "serene, cinematic, expansive",
      "dominant_textures": ["soft haze","rough rock"],
      "recommended_prompt_example": "PRIMARY SUBJECT: Rugged coastal cliffs. Painterly digital illustration of dramatic terracotta cliffs glowing in peach sunlight with teal-blue water below; soft atmospheric haze and cinematic perspective, visible brush texture — serene and expansive."
    }
  ],
  "global_tags": ["hand-painted look","printable","no photorealism"],
  "confidence": 0.92
}

RULES:
1. Always output valid JSON exactly matching the schema above. No extra commentary or wrapping text.
2. For "palette" include human-readable color name AND a HEX code. Prefer 4-7 colors (if fewer, include what you can).
3. "technique" must be one of: watercolor, gouache, ink, digital painting, alcohol-ink, mixed-media, engraving, vector. If uncertain, choose the best match.
4. "vibe" must be 1–5 short adjectives (comma-separated). Avoid generic single words like "nature"—use mood words (e.g., "dreamy, whimsical, majestic").
5. If an image contains clear multiple styles or groups, split into separate cluster objects (clusters array). Otherwise return a single cluster.
6. "recommended_prompt_example" must be 1 sentence, start with PRIMARY SUBJECT: and be 15–30 words, strictly illustrative (no camera/photography terms). Must reflect the cluster's style, palette, and vibe.
7. Do NOT output photography/camera language anywhere.
8. Keep "confidence" as your best estimate (0.0–1.0).

Now analyze the provided image and produce the JSON object described above.`
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
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.error) {
          errorMessage = JSON.stringify(errorData.error);
        }
      } catch (parseError) {
        // If JSON parsing fails, try to get text response
        try {
          const textResponse = await response.text();
          if (textResponse) {
            errorMessage = textResponse.substring(0, 200);
          }
        } catch (textError) {
          // Ignore text parsing errors
        }
      }
      
      // Provide user-friendly error messages for common status codes
      if (response.status === 401) {
        throw new Error('OpenAI API key is invalid or expired. Please check your VITE_OPENAI_API_KEY.');
      } else if (response.status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please wait a moment and try again.');
      } else if (response.status === 400) {
        throw new Error(`OpenAI API request error: ${errorMessage}`);
      } else if (response.status >= 500) {
        throw new Error(`OpenAI API server error (${response.status}). Please try again later.`);
      } else {
        throw new Error(`OpenAI Vision API error (${response.status}): ${errorMessage}`);
      }
    }

    const data: ChatGPTResponse = await response.json();

    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      try {
        const analysis: ImageAnalysisResponse = JSON.parse(content);
        
        // Validate response structure
        if (!analysis.clusters || !Array.isArray(analysis.clusters) || analysis.clusters.length === 0) {
          throw new Error('Invalid response format: missing or empty clusters array');
        }

        // Use the first cluster as the primary analysis
        const primaryCluster = analysis.clusters[0];

        // Validate primary cluster has required fields
        if (!primaryCluster.theme || !primaryCluster.style || !primaryCluster.palette) {
          throw new Error('Invalid response format: missing required fields in cluster');
        }

        // Build colors string from palette
        const colorsString = primaryCluster.palette
          .map(c => `${c.name} (${c.hex})`)
          .join(', ');

        // Build style string with technique
        const styleString = primaryCluster.technique 
          ? `${primaryCluster.style} Technique: ${primaryCluster.technique}.`
          : primaryCluster.style;

        // Return structured response with backward compatibility fields
        return {
          ...analysis, // Include full structured response
          // Legacy fields extracted from first cluster for backward compatibility
          theme: primaryCluster.theme.trim(),
          style: styleString.trim(),
          colors: colorsString,
          vibe: primaryCluster.vibe ? primaryCluster.vibe.trim() : undefined
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
    
    // If the error already has a descriptive message, use it
    if (error.message && error.message !== 'Unknown error') {
      throw error;
    }
    
    // Otherwise, provide a generic error with more context
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to OpenAI API. Please check your internet connection.');
    }
    
    throw new Error(`Failed to analyze image: ${error.message || 'Unknown error. Please check your OpenAI API key and try again.'}`);
  }
};

/**
 * Formats Midjourney flags string from components
 * @param mj_ref - Combined style and palette tokens for --ref
 * @param sref_url - Optional style reference URL
 * @param seed - Computed seed value
 * @param stylize - Stylize value (default: 50)
 * @param sref_weight - Style reference weight (default: 0.7)
 * @param chaos - Chaos value (default: 10)
 * @returns Formatted flags string ready to append to /imagine command
 */
export function formatMJFlags(
  mj_ref: string,
  sref_url: string | null,
  seed: number,
  stylize: number = 50,
  sref_weight: number = 0.7,
  chaos: number = 10
): string {
  const flags: string[] = [];
  
  // Add --ref with quoted mj_ref
  flags.push(`--ref "${mj_ref}"`);
  
  // Add --sref if URL is provided
  if (sref_url) {
    // Ensure sref_weight is formatted consistently (avoid floating point precision issues)
    const formattedWeight = parseFloat(sref_weight.toFixed(1));
    flags.push(`--sref ${sref_url} --sref-weight ${formattedWeight}`);
  }
  
  // Add seed (ensure it's an integer)
  flags.push(`--seed ${Math.floor(seed)}`);
  
  // Add stylize (ensure it's an integer)
  flags.push(`--stylize ${Math.floor(stylize)}`);
  
  // Add chaos (ensure it's an integer)
  flags.push(`--chaos ${Math.floor(chaos)}`);
  
  return flags.join(' ');
}

/**
 * Normalizes a string for comparison: lowercase, trim, normalize & to 'and', remove extra punctuation
 * @param str - String to normalize
 * @returns Normalized string
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')  // Normalize & to 'and'
    .replace(/-/g, ' ')  // Replace hyphens with spaces (so "water-color" → "water color")
    .replace(/[^\w\s]/g, ' ')  // Replace other punctuation with spaces
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
}

/**
 * Validates that mj_prompt contains no style tokens
 * Uses word boundaries to avoid false positives on short/common words
 * Handles symbols (e.g., &), hyphens, plurals, and multi-word phrases correctly
 * @param mj_prompt - The prompt to validate
 * @param style_tokens - Style tokens to check against
 * @throws Error if style tokens are found in prompt
 */
function validateMJPrompt(mj_prompt: string, style_tokens: string): void {
  // Normalize style_tokens: split on comma, trim, remove empties, normalize each token
  const normalizedStyleTokens = style_tokens
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(normalizeForComparison);
  
  const normalizedPrompt = normalizeForComparison(mj_prompt);
  
  // Check each normalized style token
  for (const normalizedToken of normalizedStyleTokens) {
    // Split token into words (handle multi-word phrases)
    const words = normalizedToken.split(/\s+/).filter(w => w.length > 2);
    
    // Check if any style word appears as a whole word in the prompt
    for (const word of words) {
      // Escape special regex characters in the word
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Use word boundary regex to match whole words only
      // \b matches word boundaries (between word and non-word characters)
      const wordBoundaryRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      if (wordBoundaryRegex.test(normalizedPrompt)) {
        throw new Error('mj_prompt contains style token');
      }
    }
  }
}

/**
 * Generates a Midjourney-optimized prompt package
 * @param imageAnalysisOrTheme - Either an ImageAnalysisResponse (from analyzeReferenceImage) or a theme string
 * @param batch_seed - Optional batch seed (if null, will generate a random positive integer > 0)
 * @param variation_index - Variation number (integer >= 0)
 * @param sref_url - Optional style reference URL (string or null)
 * @param promptService - Optional service to use ('openai' or 'openrouter')
 * @returns MJPackage with all required fields
 */
export async function generateMJPackage(
  imageAnalysisOrTheme: any,
  batch_seed: number | null,
  variation_index: number,
  sref_url: string | null,
  promptService?: 'openai' | 'openrouter'
): Promise<MJPackage> {
  // Validate variation_index is numeric and >= 0
  if (typeof variation_index !== 'number' || variation_index < 0 || !Number.isInteger(variation_index)) {
    throw new Error('variation_index must be a non-negative integer');
  }
  
  // Generate batch_seed if null (random positive integer > 0)
  const finalBatchSeed = batch_seed !== null ? batch_seed : Math.floor(Math.random() * 1000000) + 1;
  
  // Compute Midjourney seed: SEED = batch_seed * 1000 + variation_index
  const finalSeed = finalBatchSeed * 1000 + variation_index;
  
  // Determine API service (default to 'openai' if not provided)
  const service = promptService || 'openai';
  const useOpenRouter = service === 'openrouter';
  const apiKey = useOpenRouter ? getOpenRouterApiKey() : getOpenAIApiKey();
  const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
  
  if (!apiKey) {
    throw new Error(`${service === 'openrouter' ? 'OpenRouter' : 'OpenAI'} API key is not configured.`);
  }
  
  // Extract data from image analysis or theme
  let cluster: ImageCluster | null = null;
  let themeDescription = '';
  
  if (typeof imageAnalysisOrTheme === 'string') {
    // Theme string provided
    themeDescription = imageAnalysisOrTheme;
  } else {
    // Image analysis provided
    if (imageAnalysisOrTheme.clusters && imageAnalysisOrTheme.clusters.length > 0) {
      cluster = imageAnalysisOrTheme.clusters[0];
      themeDescription = cluster.theme || '';
    } else {
      throw new Error('Invalid image analysis: no clusters found');
    }
  }
  
  // Build system prompt for LLM
  const systemPrompt = `You are a Midjourney prompt generator. Your task is to analyze an image (or theme) and output EXACT JSON matching this schema:

{
  "subject_suggestion": string,      // 2-6 words, e.g. "deer portrait", "birch forest path"
  "style_tokens": string,            // 3-6 short comma-separated tokens, e.g. "winter watercolor, soft teal palette, paper grain"
  "palette_tokens": string,          // 2-5 comma-separated colors/hues e.g. "icy teal, frost blue, soft gray"
  "mj_prompt": string                // minimal subject prompt (8-12 words max), subject only, NO style descriptors
}

RULES:
1. subject_suggestion: 2-6 words describing the main subject
2. style_tokens: 3-6 short phrases, comma-separated, no punctuation except commas. Examples: "watercolor wash", "delicate ink linework", "soft paper grain", "muted sepia"
3. palette_tokens: 2-5 color names, comma-separated, prefer human-readable names
4. mj_prompt: ONLY the subject and minimal positional modifiers (8-12 words max). NO style descriptors, NO colors, NO technique words. Examples: "Owl perched on frosted branch", "Majestic stag portrait, three-quarter view"

CRITICAL: mj_prompt must NOT contain any words from style_tokens or palette_tokens. It should be pure subject description only.

Output ONLY valid JSON, no extra text.`;

  // Build user prompt
  let userPrompt = '';
  if (cluster) {
    // Image analysis provided - use cluster data
    userPrompt = `Analyze this image and generate a Midjourney prompt package.

Image Analysis:
- Theme: ${cluster.theme}
- Primary Subject: ${cluster.primary_subject}
- Style: ${cluster.style}
- Technique: ${cluster.technique}
- Colors: ${cluster.palette.map(c => `${c.name} (${c.hex})`).join(', ')}
- Vibe: ${cluster.vibe}
- Textures: ${cluster.dominant_textures?.join(', ') || 'none'}

Generate the JSON package. For style_tokens, extract 3-6 short phrases from the style, technique, and textures.
For palette_tokens, use 2-5 color names from the palette.
For mj_prompt, use ONLY the primary_subject with minimal positional modifiers (8-12 words), NO style words.`;
  } else {
    // Theme string provided
    userPrompt = `Generate a Midjourney prompt package for theme: "${themeDescription}"

Generate the JSON package with:
- subject_suggestion: A 2-6 word subject that fits this theme
- style_tokens: 3-6 short style phrases (e.g. "watercolor wash, delicate ink linework, paper grain")
- palette_tokens: 2-5 color names appropriate for this theme
- mj_prompt: Subject only (8-12 words), NO style descriptors`;
  }
  
  // Retry logic with exponential backoff for network/API errors
  const maxRetries = 3;
  let data: ChatGPTResponse | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(useOpenRouter ? { 'HTTP-Referer': window.location.origin } : {})
        },
        body: JSON.stringify({
          model: useOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 200
        })
      });
      
      if (!response.ok) {
        // Handle specific HTTP errors
        if (response.status === 401) {
          throw new Error('API key is invalid or expired');
        } else if (response.status === 429) {
          // Rate limited - retry if attempts remain
          if (attempt < maxRetries) {
            continue;
          }
          throw new Error('Rate limit exceeded');
        } else if (response.status >= 500) {
          // Server error - retry if attempts remain
          if (attempt < maxRetries) {
            continue;
          }
          throw new Error(`Server error: ${response.status}`);
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }
      
      // Success - parse response and break
      data = await response.json();
      break;
    } catch (error: any) {
      // Don't retry on non-retryable errors (401, validation errors, parse errors)
      if (error.message?.includes('invalid') || error.message?.includes('expired') || error.message?.includes('parse') || error.message?.includes('Failed to parse')) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Otherwise continue to retry
      continue;
    }
  }
  
  try {
    if (!data || !data.choices || data.choices.length === 0) {
      throw new Error('No response from API');
    }
    
    const content = data.choices[0].message.content;
    let llmOutput: any;
    
    try {
      llmOutput = JSON.parse(content);
    } catch (parseError) {
      throw new Error('Failed to parse image analysis response');
    }
    
    // Validate required fields
    if (!llmOutput.subject_suggestion || !llmOutput.style_tokens || !llmOutput.palette_tokens || !llmOutput.mj_prompt) {
      throw new Error('Failed to parse image analysis response');
    }
    
    // Normalize and clean style_tokens and palette_tokens (remove extra spaces, trailing commas)
    const normalizedStyleTokens = llmOutput.style_tokens
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .join(', ');
    
    const normalizedPaletteTokens = llmOutput.palette_tokens
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .join(', ');
    
    // Clean mj_prompt: remove "PRIMARY SUBJECT:" header if present
    let cleanedMjPrompt = llmOutput.mj_prompt.trim();
    cleanedMjPrompt = cleanedMjPrompt.replace(/^PRIMARY SUBJECT:\s*/i, '').trim();
    
    // Validate mj_prompt doesn't contain style tokens (use normalized version)
    validateMJPrompt(cleanedMjPrompt, normalizedStyleTokens);
    
    // Validate sref_url if provided (must be valid HTTPS URL)
    let validatedSrefUrl: string | null = sref_url;
    if (sref_url && sref_url.trim()) {
      try {
        const url = new URL(sref_url.trim());
        if (url.protocol !== 'https:') {
          console.warn(`[generateMJPackage] sref_url is not HTTPS, treating as null: ${sref_url}`);
          validatedSrefUrl = null;
        } else {
          validatedSrefUrl = url.toString();
        }
      } catch {
        console.warn(`[generateMJPackage] sref_url is not a valid URL, treating as null: ${sref_url}`);
        validatedSrefUrl = null;
      }
    }
    
    // Build mj_ref (normalized style_tokens + palette_tokens)
    const mj_ref = `${normalizedStyleTokens}, ${normalizedPaletteTokens}`;
    
    // Build mj_flags with defaults: stylize=50, sref_weight=0.7, chaos=10
    const mj_flags = formatMJFlags(mj_ref, validatedSrefUrl, finalSeed, 50, 0.7, 10);
    
    // Construct final package (use normalized tokens)
    const package_: MJPackage = {
      subject_suggestion: llmOutput.subject_suggestion.trim(),
      style_tokens: normalizedStyleTokens,
      palette_tokens: normalizedPaletteTokens,
      sref_url: validatedSrefUrl,
      batch_seed: finalBatchSeed,
      variation_index: variation_index,
      mj_prompt: cleanedMjPrompt,
      mj_ref: mj_ref.trim(),
      mj_flags: mj_flags
    };
    
    return package_;
  } catch (error: any) {
    // Re-throw validation errors as-is
    if (error.message === 'mj_prompt contains style token') {
      throw error;
    }
    // Re-throw parse errors as-is
    if (error.message === 'Failed to parse image analysis response') {
      throw error;
    }
    throw new Error(`Failed to generate MJ package: ${error.message || 'Unknown error'}`);
  }
}

