import { Theme, GenerationSettings } from '../types';

// Get Ttapi domain from environment variable (defaults to PPU mode)
// Hold Account Mode: https://hold.ttapi.io
// PPU Mode: https://api.ttapi.io
export const getTtapiBaseUrl = (): string => {
  return import.meta.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';
};

// Get API key from environment variable only
const getTtapiApiKey = (): string => {
  return import.meta.env.VITE_TTAPI_API_KEY || '';
};

// Get Discord token for direct CDN access
const getDiscordToken = (): string => {
  return import.meta.env.VITE_DISCORD_TOKEN || '';
};

interface TtapiTaskResponse {
  jobId?: string;
  job_id?: string;
  id?: string;
  task_id?: string;
  status?: string;
  message?: string;
  data?: {
    jobId?: string;
    job_id?: string;
    id?: string;
    task_id?: string;
    [key: string]: any;
  };
  [key: string]: any; // Allow other fields
}

interface TtapiJobStatus {
  status: string;
  jobId?: string;
  job_id?: string;
  result?: {
    images?: string[];
    image?: string;
    url?: string;
    urls?: string[];
  };
  output?: {
    image_url?: string;
    image_urls?: string[];
    images?: string[];
    image?: string;
    url?: string;
    urls?: string[];
    [key: string]: any;
  } | string | string[];
  images?: string[];
  image?: string;
  url?: string;
  urls?: string[];
  data?: {
    images?: string[];
    image?: string;
    url?: string;
    urls?: string[];
  };
  error?: string;
  message?: string;
  [key: string]: any; // Allow other fields
}

const constructPrompt = (theme: Theme, settings: GenerationSettings, parametersForMJ?: string, variationIndex?: number): string => {
  const texture = getTexturePrompt(settings.textureIntensity);
  
  let layoutPrompt = '';
  switch (settings.pageStyle) {
    case 'Full Page': layoutPrompt = 'A full page seamless background texture'; break;
    case 'Collage': layoutPrompt = 'A mixed media collage layout with layered paper scraps'; break;
    case 'Lined': layoutPrompt = 'A page with faint vintage handwriting lines for journaling'; break;
    case 'Grid': layoutPrompt = 'A page with distressed vintage graph paper grid'; break;
    case 'Ephemera Sheet': layoutPrompt = 'A sheet containing multiple cut-out ephemera items like tags, tickets, and cards'; break;
  }

  // Safety check: ensure elements is an array
  const elementsArray = Array.isArray(settings.elements) ? settings.elements : [];
  const elementsPrompt = elementsArray.length > 0 
    ? `featuring elements: ${elementsArray.join(', ')}` 
    : '';

  const extraDetails = [
    settings.includeFrames ? 'ornate vintage frames' : '',
    settings.includeBorders ? 'decorative borders' : ''
  ].filter(Boolean).join(', ');

  // Add variation modifiers to make each image unique
  const variationModifiers = [
    'unique composition', 'different arrangement', 'varied layout', 'distinctive style',
    'alternative perspective', 'original design', 'creative variation', 'individual character',
    'unique details', 'distinct elements', 'original arrangement', 'creative composition'
  ];
  
  const styleVariations = [
    'slightly different lighting', 'varied color tones', 'different texture pattern',
    'alternative color palette', 'unique shading', 'distinctive mood', 'varied atmosphere',
    'different depth', 'alternative focus', 'unique perspective', 'distinctive angle'
  ];

  const variationMod = variationIndex !== undefined 
    ? variationModifiers[variationIndex % variationModifiers.length]
    : '';
  const styleVar = variationIndex !== undefined
    ? styleVariations[variationIndex % styleVariations.length]
    : '';

  // CRITICAL: Handle Custom / Override mode with safe, neutral fallback
  if (settings.colorIntensity === 'Custom / Override') {
    // Custom / Override: Safe, neutral fallback - minimal constraints
    let prompt = theme.basePrompt;
    
    // Add custom art style if provided
    if (settings.customArtStyle && settings.customArtStyle.trim()) {
      prompt += `. ${settings.customArtStyle.trim()}`;
    }
    
    // Add ONLY technical constraints - no color/style forcing
    prompt += `. Flat illustration, 2D, high resolution, printable design.`;
    
    // Add seed for variation
    if (variationIndex !== undefined && typeof variationIndex === 'number') {
      const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
      prompt += ` --seed ${seed}`;
    }
    
    // Add additional parameters if provided
    if (parametersForMJ) {
      prompt += ` ${parametersForMJ}`;
    }
    
    return prompt;
  }
  
  // Get color palette and style constraints based on color intensity setting
  let colorPalette: string;
  
  if (settings.colorIntensity === 'Muted') {
    colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
  } else if (settings.colorIntensity === 'Normal') {
    colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
  } else if (settings.colorIntensity === 'Colorful') {
    colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
  } else {
    // Multicolored
    colorPalette = 'vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors';
  }

  let prompt = '';
  if (settings.colorIntensity === 'Multicolored') {
    const styleKeywordsStr = theme.styleKeywords && Array.isArray(theme.styleKeywords) && theme.styleKeywords.length > 0
      ? `${theme.styleKeywords.join(', ')} style.`
      : '';
    prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${styleKeywordsStr} Color palette: ${colorPalette}. vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
  } else {
    const styleKeywordsStr = theme.styleKeywords && Array.isArray(theme.styleKeywords) && theme.styleKeywords.length > 0
      ? `${theme.styleKeywords.join(', ')} style.`
      : '';
    prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${styleKeywordsStr} Color palette: ${colorPalette}. Extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  }

  // Add variation modifiers
  if (variationMod || styleVar) {
    prompt += ` ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}`;
  }

  // Add seed for additional variation
  if (variationIndex !== undefined && typeof variationIndex === 'number') {
    const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
    prompt += ` --seed ${seed}`;
  }

  // Add additional parameters if provided
  if (parametersForMJ) {
    prompt += ` ${parametersForMJ}`;
  }

  return prompt;
};

const getTexturePrompt = (intensity: 'Light' | 'Medium' | 'Heavy'): string => {
  switch (intensity) {
    case 'Light': return 'lightly distressed paper, subtle aging';
    case 'Medium': return 'moderately distressed, tea stained, worn edges';
    case 'Heavy': return 'heavily distressed, grunge texture, burnt edges, heavy stains, torn paper';
  }
};

/**
 * Cleans prompt for Midjourney by removing newlines and problematic characters
 * Midjourney interprets newlines and certain characters as parameter separators
 * Same implementation as GoAPI for consistency
 */
const cleanPromptForMidjourney = (prompt: string): string => {
  if (!prompt) return '';
  
  // Remove PRIMARY SUBJECT header if present (Midjourney doesn't need it)
  let cleaned = prompt.replace(/^PRIMARY SUBJECT:\s*/i, '').trim();
  
  // Replace all newlines with spaces
  cleaned = cleaned.replace(/\n+/g, ' ');
  
  // CRITICAL: Remove problematic phrases that Midjourney interprets as parameters
  // These phrases often appear after --ar and cause "Invalid parameter" errors
  // Use more flexible patterns to catch variations with/without commas, periods, etc.
  const problematicPhrases = [
    /\bflat\s+printable\s+page,?\s*/gi,
    /\bSINGLE\s+PAGE\s+ONLY,?\s*/gi,
    /\bnot\s+a\s+scene,?\s*/gi,
    /\bnot\s+multiple\s+objects,?\s*/gi,
    /\bnot\s+a\s+still\s+life\s+composition,?\s*/gi,
    /\bno\s+3D\s+objects,?\s*/gi,
    /\bno\s+shadows,?\s*/gi,
    /\bno\s+depth,?\s*/gi,
    /\bno\s+realistic\s+photography,?\s*/gi,
    /\bno\s+realistic\s+lighting,?\s*/gi,
    /\bflat\s+illustration\s+style,?\s*/gi,
    /\btop-down\s+view,?\s*/gi,
    /\bprintable\s+scrapbook\s+page,?\s*/gi,
    /\bdigital\s+design,?\s*/gi,
    /\bflat\s+lay\s+design,?\s*/gi,
    /\bhigh\s+resolution\s+printable\s+journal\s+page,?\s*/gi,
    // Also catch individual words that might be split
    /\bflat\s+printable\b/gi,
    /\bSINGLE\s+PAGE\b/gi,
    /\bONLY,?\b/gi
  ];
  
  problematicPhrases.forEach(phrase => {
    cleaned = cleaned.replace(phrase, '');
  });
  
  // Remove any remaining problematic patterns (catch-all for comma-separated lists)
  // Remove sequences like "word, word, word" that might be interpreted as parameters
  cleaned = cleaned.replace(/,\s*(?:flat|printable|SINGLE|PAGE|ONLY|not|multiple|objects|still|life|composition|3D|shadows|depth|realistic|photography|lighting|illustration|style|top-down|view|scrapbook|digital|design|lay|high|resolution|journal|page)\b/gi, '');
  
  // REMOVED: Aggressive comma-to-period replacement breaks normal sentence structure
  // Commas are generally safe in Midjourney prompts
  // cleaned = cleaned.replace(/,(\s+)(?![a-z]+:)/gi, '.$1');
  
  // Replace multiple spaces with single space
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove triple dashes (---) which Midjourney might interpret as parameters
  cleaned = cleaned.replace(/---+/g, '');
  
  // Remove any trailing periods before parameters
  cleaned = cleaned.replace(/\.\s*$/, '');
  
  // Final cleanup: remove any double periods or periods followed by spaces before end
  cleaned = cleaned.replace(/\.\s*\./g, '.');
  cleaned = cleaned.replace(/\s+\./g, '.');
  
  return cleaned.trim();
};

/**
 * Sends an upscale task to Ttapi for a specific image in a grid
 * @param taskId The original task ID from the /imagine command
 * @param imageIndex The index of the image to upscale (0-3 for the 4 images in a grid)
 * @returns The new task ID for the upscale operation
 */
const sendUpscaleToTtapi = async (
  taskId: string,
  imageIndex: number
): Promise<string | null> => {
  console.log(`[Ttapi] ===== Starting sendUpscaleToTtapi =====`);
  console.log(`[Ttapi] Task ID: ${taskId}, Image Index: ${imageIndex}`);
  
  const apiKey = getTtapiApiKey();
  if (!apiKey) {
    throw new Error('Ttapi API key is not configured');
  }

  const data = {
    taskId: taskId,
    imageIndex: imageIndex
  };

  const baseUrl = getTtapiBaseUrl();
  const url = `${baseUrl}/midjourney/v1/upscale`;
  console.log(`[Ttapi] Upscale URL: ${url}`);
  console.log(`[Ttapi] Upscale data:`, JSON.stringify(data, null, 2));

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'TT-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  try {
    console.log(`[Ttapi] Sending upscale request via Vercel proxy...`);
    const response = await fetch('/api/ttapi/imagine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        options: {
          method: 'POST',
          headers: options.headers,
          body: JSON.stringify(data)
        }
      })
    });

    // Read response body once
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[Ttapi] ❌ Upscale request failed: ${response.status} ${response.statusText}`);
      console.error(`[Ttapi] Error response:`, responseText);
      
      // Check for specific error types
      if (response.status === 400) {
        try {
          const errorData = JSON.parse(responseText);
          const errorMsg = errorData.error || errorData.message || responseText;
          if (errorMsg.includes('account queue is full') || errorMsg.includes('queue is full')) {
            throw new Error('QUEUE_FULL_RETRY');
          }
        } catch (parseError) {
          // If JSON parsing fails, check the text directly
          if (responseText.includes('account queue is full') || responseText.includes('queue is full')) {
            throw new Error('QUEUE_FULL_RETRY');
          }
        }
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMIT_RETRY');
      }
      
      throw new Error(`Upscale request failed: ${response.status} ${responseText}`);
    }

    // Parse JSON from the already-read responseText
    let result: TtapiTaskResponse;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[Ttapi] Failed to parse upscale JSON response:`, responseText);
      throw new Error(`Invalid JSON response from upscale: ${responseText}`);
    }
    
    console.log(`[Ttapi] Upscale response:`, JSON.stringify(result, null, 2));

    // Extract job ID from various possible locations
    const jobId = result.jobId || result.job_id || result.id || result.task_id || 
                  result.data?.jobId || result.data?.job_id || result.data?.id || result.data?.task_id;

    if (jobId) {
      console.log(`[Ttapi] ✅ Upscale task created successfully. Job ID: ${jobId}`);
      return jobId;
    } else {
      console.error(`[Ttapi] ❌ No job ID found in upscale response:`, result);
      throw new Error('No job ID returned from upscale request');
    }
  } catch (error: any) {
    if (error.message === 'QUEUE_FULL_RETRY' || error.message === 'RATE_LIMIT_RETRY') {
      throw error; // Re-throw to be handled by caller
    }
    console.error(`[Ttapi] ❌ Error sending upscale request:`, error);
    throw new Error(`Failed to send upscale request: ${error.message}`);
  }
};

/**
 * Sends a task to ttapi.io Midjourney
 * @param prompt - The prompt to send to Midjourney
 * @param processMode - 'fast' or 'relax' mode (defaults to 'fast')
 */
const sendTaskToTtapi = async (
  prompt: string,
  processMode: string = 'fast',
  accountId?: string
): Promise<string | null> => {
  console.log(`[Ttapi] ===== Starting sendTaskToTtapi =====`);
  console.log(`[Ttapi] Original prompt length: ${prompt.length}`);
  console.log(`[Ttapi] Original prompt preview: ${prompt.substring(0, 150)}...`);
  console.log(`[Ttapi] Process mode: ${processMode}`);
  
  const apiKey = getTtapiApiKey();
  console.log(`[Ttapi] API key retrieved: ${apiKey ? `Yes (length: ${apiKey.length})` : 'NO - MISSING!'}`);
  
  if (!apiKey) {
    const error = 'Ttapi API key is not configured. Please set VITE_TTAPI_API_KEY in your environment variables.';
    console.error(`[Ttapi] ❌ ${error}`);
    throw new Error(error);
  }

  // Check if this is a HOLD account (hold.ttapi.io domain)
  const baseUrl = getTtapiBaseUrl();
  const isHoldAccount = baseUrl.includes('hold.ttapi.io');

  // Add negative prompt to exclude realistic style
  // Append --no realistic to every prompt (avoid duplicates)
  let promptWithNegative = prompt.trim();
  console.log(`[Ttapi] Original prompt received: "${promptWithNegative.substring(0, 100)}..."`);
  console.log(`[Ttapi] First 200 chars: "${promptWithNegative.substring(0, 200)}"`);
  
  // Check if prompt starts with a WordPress URL (image reference)
  // More robust URL pattern that handles various URL formats
  const urlPattern = /^https?:\/\/[^\s]+/i;
  const urlMatch = promptWithNegative.match(urlPattern);
  const hasImageUrl = urlMatch !== null && urlMatch.index === 0;
  
  if (hasImageUrl && urlMatch) {
    console.log(`[Ttapi] ✅ Detected image URL at start of prompt: ${urlMatch[0].substring(0, 80)}...`);
    console.log(`[Ttapi] Full URL: ${urlMatch[0]}`);
  } else {
    // Additional check: maybe the URL is there but the regex didn't match
    const startsWithHttp = promptWithNegative.toLowerCase().startsWith('http://') || promptWithNegative.toLowerCase().startsWith('https://');
    if (startsWithHttp) {
      // Extract URL manually
      const spaceIndex = promptWithNegative.indexOf(' ');
      const extractedUrl = spaceIndex > 0 ? promptWithNegative.substring(0, spaceIndex) : promptWithNegative;
      console.log(`[Ttapi] ✅ Detected URL via manual check: ${extractedUrl.substring(0, 80)}...`);
    } else {
      console.log(`[Ttapi] ⚠️ No image URL detected at start of prompt`);
      console.log(`[Ttapi] First 10 chars: "${promptWithNegative.substring(0, 10)}"`);
    }
  }
  
  // Remove duplicate --ar parameters (keep only the first occurrence)
  const arPattern = /--ar\s+[^\s]+/gi;
  let arCount = 0;
  promptWithNegative = promptWithNegative.replace(arPattern, (match) => {
    arCount++;
    // Keep the first --ar, remove all subsequent ones
    return arCount === 1 ? match : '';
  });
  // Clean up extra spaces after removing duplicates
  promptWithNegative = promptWithNegative.replace(/\s+/g, ' ').trim();
  
  // Add stronger negative prompts to exclude realistic/photographic style
  // Use multiple specific terms for better results
  const negativeTerms = 'photorealistic, 3D render, photographic, hyperrealistic, photoreal, DSLR, camera, lens, bokeh, depth of field, realistic lighting, naturalistic shadows, photoreal portrait, ultra-realistic';
  
  // Check if any negative prompt already exists
  const hasNoPrompt = /--no\s+[^-]+/i.test(promptWithNegative);
  if (!hasNoPrompt) {
    promptWithNegative += ` --no ${negativeTerms}`;
    console.log(`[Ttapi] ✅ Added strong negative prompts to exclude realistic style`);
  } else {
    // If --no already exists, check if it includes our terms
    const hasOurTerms = /--no\s+.*(?:photorealistic|3D render|photographic)/i.test(promptWithNegative);
    if (!hasOurTerms) {
      // Append our terms to existing --no
      promptWithNegative = promptWithNegative.replace(/(--no\s+[^-]+)/i, `$1, ${negativeTerms}`);
      console.log(`[Ttapi] ✅ Enhanced existing --no with additional negative terms`);
    } else {
      console.log(`[Ttapi] ℹ️ Prompt already contains strong negative terms, skipping`);
    }
  }
  
  // Log the FINAL prompt that will actually be sent to TTAPI
  console.log(`[Ttapi] ===== FINAL PROMPT SENT TO TTAPI =====`);
  console.log(`[Ttapi] "${promptWithNegative}"`);
  console.log(`[Ttapi] =====================================`);
  
  // Verify negative prompt is in the prompt
  if (!/--no\s+[^-]+/i.test(promptWithNegative)) {
    console.error(`[Ttapi] ⚠️ WARNING: --no negative prompt was NOT added!`);
    console.error(`[Ttapi] Prompt: "${promptWithNegative}"`);
    // Force add it as a safety measure
    promptWithNegative += ` --no ${negativeTerms}`;
    console.log(`[Ttapi] ✅ Force-added negative prompts as safety measure`);
  }
  
  const data: any = {
    prompt: promptWithNegative,
    getUImages: true  // Request 4 individual images instead of grid (per Ttapi docs)
  };
  
  // Use 'mode' parameter (not 'process_mode') - per TTAPI documentation
  // mode can be: 'fast', 'relax', or 'turbo'
  // Default is 'fast' if not specified
  // For HOLD accounts, --relax is also added to the prompt (done in generateJournalPage)
  if (processMode && processMode !== 'fast') {
    data.mode = processMode; // 'relax' or 'turbo'
    console.log(`[Ttapi] Setting mode parameter to: ${processMode}`);
  }
  
  // Add account_id if provided (for explicit account selection in Hold Account Mode)
  if (accountId && isHoldAccount) {
    data.account_id = accountId;
    console.log(`[Ttapi] Using specific account: ${accountId}`);
  }
  
  // Final verification before sending
  const promptEnd = data.prompt.substring(Math.max(0, data.prompt.length - 100));
  console.log(`[Ttapi] Final data.prompt ends with: "${promptEnd}"`);
  const hasNegativePrompt = /--no\s+[^-]+/i.test(data.prompt);
  console.log(`[Ttapi] Contains --no negative prompt: ${hasNegativePrompt}`);
  if (!hasNegativePrompt) {
    console.error(`[Ttapi] ❌ CRITICAL: Negative prompt missing from final prompt!`);
  }
  
  if (isHoldAccount) {
    console.log(`[Ttapi] HOLD account detected. Mode: ${processMode || 'fast'}`);
    if (processMode === 'relax') {
      console.log(`[Ttapi] Note: --relax has been added to the prompt for HOLD account relax mode.`);
    }
  }

  const url = `${baseUrl}/midjourney/v1/imagine`;
  console.log(`[Ttapi] Request URL: ${url}`);
  console.log(`[Ttapi] Request data:`, JSON.stringify(data, null, 2));

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'TT-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  console.log(`[Ttapi] Request headers:`, {
    'TT-API-KEY': `${apiKey.substring(0, 10)}...`,
    'Content-Type': 'application/json'
  });

  try {
    console.log(`[Ttapi] Sending POST request via Vercel proxy...`);
    // Use Vercel serverless function to bypass CORS
    const response = await fetch('/api/ttapi/imagine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    console.log(`[Ttapi] Response received. Status: ${response.status} ${response.statusText}`);
    console.log(`[Ttapi] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    // Read response body once - check status and parse accordingly
    const responseText = await response.text();
    
    // Check response status before parsing
    if (!response.ok) {
      let errorMessage = `Ttapi HTTP error: ${response.status}`;
      let errorDetail = '';
      
      try {
        const errorJson = JSON.parse(responseText);
        console.error(`[Ttapi] HTTP ${response.status} error creating task:`, JSON.stringify(errorJson, null, 2));
        
        // Extract error message
        const apiMessage = errorJson.error?.message || errorJson.message || '';
        const isQueueFull = apiMessage.toLowerCase().includes('queue is full') || 
                           apiMessage.toLowerCase().includes('queue full') ||
                           apiMessage.toLowerCase().includes('try again later');
        const isNoAccounts = apiMessage.toLowerCase().includes('no available accounts') ||
                            apiMessage.toLowerCase().includes('no available account');
        
        // Handle specific error cases
        if (response.status === 402) {
          const quotaError = errorJson.error?.message || errorJson.message || 'insufficient quota';
          errorMessage = `Ttapi API error: Insufficient quota. Your ttapi.io account has no credits remaining or has exceeded its usage limit.`;
          errorDetail = `Please check your ttapi.io account balance and add credits if needed. Error details: ${quotaError}`;
        } else if (response.status === 401) {
          errorMessage = `Ttapi API error: Invalid API key. Please check that VITE_TTAPI_API_KEY is set correctly.`;
        } else if (response.status === 429 || isQueueFull) {
          // Rate limit or queue full - throw special error to trigger retry
          errorMessage = isQueueFull 
            ? `Ttapi API error: Queue is full. Will retry with exponential backoff.`
            : `Ttapi API error: Rate limit exceeded. Will retry with new task.`;
          throw new Error('QUEUE_FULL_RETRY');
        } else if (response.status === 400 && isNoAccounts) {
          // "No available accounts" - could be account busy, or TTAPI API validation issue
          // For HOLD accounts with 0 fast hours set to "Only Relax", this is a known TTAPI API limitation
          // The job may still be queued in Discord despite the API error
          errorMessage = `Ttapi API error: Account is busy (no available accounts). Will retry with exponential backoff.`;
          if (isHoldAccount) {
            console.warn(`[Ttapi] HOLD account: "No available accounts" error detected.`);
            console.warn(`[Ttapi] Known issue: HOLD accounts with 0 fast hours + "Only Relax" mode may trigger this error.`);
            console.warn(`[Ttapi] Check your Discord - the job may still be queued despite the API error.`);
            console.warn(`[Ttapi] If this persists, contact TTAPI support or try using the TTAPI dashboard directly.`);
          }
          throw new Error('NO_ACCOUNTS_RETRY');
        } else {
          errorDetail = errorJson.error?.message || errorJson.message || JSON.stringify(errorJson);
          errorMessage = `Ttapi HTTP error: ${response.status} - ${errorDetail}`;
        }
      } catch (parseError) {
        // Use the already-read responseText
        console.error(`[Ttapi] HTTP ${response.status} error (could not parse JSON):`, responseText);
        errorMessage = `Ttapi HTTP error: ${response.status} - ${responseText}`;
      }
      
      const fullError = errorDetail ? `${errorMessage} ${errorDetail}` : errorMessage;
      throw new Error(fullError);
    }
    
    // Parse JSON from the already-read responseText
    let json: TtapiTaskResponse;
    try {
      json = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[Ttapi] Failed to parse JSON response:`, responseText);
      throw new Error(`Invalid JSON response from Ttapi: ${responseText}`);
    }
    
    console.log(`[Ttapi] Task creation response:`, JSON.stringify(json, null, 2));

    // Try multiple possible field names for the job ID
    // Check data.jobId first (ttapi.io returns jobId inside data object)
    const jobId = json.data?.jobId || json.data?.job_id || json.data?.id || json.data?.task_id ||
                   json.jobId || json.job_id || json.id || json.task_id;
    
    if (!jobId) {
      console.error(`[Ttapi] ❌ No job ID found in response. Full response:`, JSON.stringify(json, null, 2));
      console.error(`[Ttapi] Response keys:`, Object.keys(json));
      if (json.data) {
        console.error(`[Ttapi] Data keys:`, Object.keys(json.data));
      }
      throw new Error('Failed to create task: No job ID returned from ttapi.io API. Check console for full API response.');
    }

    console.log(`[Ttapi] ✅ Task created successfully. Job ID: ${jobId}`);
    return jobId;
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error creating task:`, error);
    if (error.message) {
      throw error;
    }
    throw new Error(`Ttapi API error: ${error.message || 'Unknown error occurred'}`);
  }
};

/**
 * Gets the status of a ttapi.io task
 */
const getTaskStatus = async (jobId: string): Promise<TtapiJobStatus> => {
  const apiKey = getTtapiApiKey();
  if (!apiKey) {
    throw new Error('Ttapi API key is not configured. Please set VITE_TTAPI_API_KEY in your environment variables.');
  }

  const options: RequestInit = {
    method: 'GET',
    headers: {
      'TT-API-KEY': apiKey,
      'Content-Type': 'application/json'
    }
  };

  try {
    // Use Vercel serverless function to bypass CORS
    const response = await fetch(`/api/ttapi/fetch?jobId=${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Ttapi] HTTP ${response.status} error fetching task status:`, errorText);
      throw new Error(`Ttapi HTTP error: ${response.status} - ${errorText}`);
    }
    
    const json: TtapiJobStatus = await response.json();
    return json;
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error fetching task status:`, error);
    throw new Error(`Ttapi API error: ${error.message || 'Unknown error occurred'}`);
  }
};

/**
 * Polls a ttapi.io task until it completes or fails
 * Added rate limit handling with exponential backoff
 * 
 * RATE LIMIT MITIGATION:
 * - Initial delay: 10 seconds (was 3s - too aggressive)
 * - Stagger delay: Each task waits (taskIndex * 2000ms) before starting to poll
 * - Exponential backoff: delay increases by 1.2x each poll, max 30 seconds
 * - This prevents overwhelming Ttapi's API when polling multiple tasks
 */
const pollTaskUntilComplete = async (
  jobId: string,
  maxAttempts: number = 120, // Reduced from 180 since we poll less frequently
  initialDelay: number = 10000, // 10 seconds (was 3s)
  staggerDelay: number = 0 // Add stagger delay to avoid simultaneous polling
): Promise<string[]> => {
  // Stagger polling start to avoid rate limits when multiple tasks poll simultaneously
  if (staggerDelay > 0) {
    console.log(`[Ttapi] ⏳ Staggering poll start by ${staggerDelay/1000}s for task ${jobId}`);
    await new Promise(resolve => setTimeout(resolve, staggerDelay));
  }
  
  let attempts = 0;
  let delay = initialDelay;
  const startTime = Date.now();
  let consecutiveRateLimitErrors = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    try {
      const status = await getTaskStatus(jobId);
      console.log(`[Ttapi] Task ${jobId} (attempt ${attempts}/${maxAttempts}, ${elapsed}m elapsed): status="${status.status}"`);

      // Check for errors
      if (status.error) {
        throw new Error(`Ttapi task failed: ${status.error}`);
      }

      if (status.message && status.status !== 'completed') {
        console.log(`[Ttapi] Task message: ${status.message}`);
      }

      // Check if task is completed (handle both lowercase and uppercase)
      const statusLower = status.status?.toLowerCase();
      if (statusLower === 'completed' || statusLower === 'success' || status.status === 'SUCCESS') {
        // Log full response for debugging
        console.log(`[Ttapi] Task ${jobId} completed. Full response:`, JSON.stringify(status, null, 2));
        
        // PRIORITY 0: Try to extract message_id and message_hash for direct Discord CDN access
        // This gets high-quality (2048+ px) images directly from Midjourney's CDN
        let messageId: string | undefined;
        let messageHash: string | undefined;
        let channelId: string | undefined;
        
        // Extract from various possible locations in Ttapi response
        if (status.data && typeof status.data === 'object' && !Array.isArray(status.data)) {
          messageId = status.data.message_id || status.data.messageId || status.data.id;
          messageHash = status.data.message_hash || status.data.messageHash || status.data.hash;
          channelId = status.data.channel_id || status.data.channelId || import.meta.env.VITE_DISCORD_CHANNEL_ID;
        }
        
        // Also check top-level
        if (!messageId) messageId = (status as any).message_id || (status as any).messageId;
        if (!messageHash) messageHash = (status as any).message_hash || (status as any).messageHash;
        
        // If we have message_id and hash, fetch directly from Discord CDN
        if (messageId && messageHash) {
          console.log(`[Ttapi] 🎯 Found message_id (${messageId}) and hash (${messageHash}), fetching from Discord CDN...`);
          const discordImageUrls = await fetchFromDiscordCDN(messageId, messageHash, channelId);
          
          if (discordImageUrls.length > 0) {
            console.log(`[Ttapi] ✅ Successfully fetched ${discordImageUrls.length} images from Discord CDN (high-quality)`);
            return discordImageUrls;
          } else {
            console.warn(`[Ttapi] ⚠️ Discord CDN fetch returned no images, falling back to Ttapi URLs`);
          }
        }
        
        // Check if response contains components/variations (Midjourney grid -> individual images)
        // Ttapi might return a grid image and components to get individual variations
        if (status.data && typeof status.data === 'object' && !Array.isArray(status.data)) {
          if (status.data.components && Array.isArray(status.data.components)) {
            console.log(`[Ttapi] 📋 Found components array:`, status.data.components);
          }
          if (status.data.variations && Array.isArray(status.data.variations)) {
            console.log(`[Ttapi] 📋 Found variations array:`, status.data.variations);
          }
          if (status.data.buttons && Array.isArray(status.data.buttons)) {
            console.log(`[Ttapi] 📋 Found buttons array:`, status.data.buttons);
          }
        }
        
        // Try to extract image URLs from various possible locations
        let imageUrls: string[] = [];

        // PRIORITY 1: Check data.images array FIRST (Ttapi returns 4 individual images when getUImages=true)
        // According to Ttapi docs: "CDN address of TTAPI, four small pictures generated by the imagine command"
        if (status.data && typeof status.data === 'object' && !Array.isArray(status.data)) {
          if (Array.isArray(status.data.images) && status.data.images.length > 0) {
            imageUrls = status.data.images;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} individual images in data.images (getUImages=true)`);
          } else if (status.data.images === null || status.data.images === undefined) {
            // getUImages was requested but images array is null/undefined
            // This might happen in Hold Account Mode or if the feature isn't available
            console.warn(`[Ttapi] ⚠️ getUImages=true was sent but data.images is null. This might not be supported in Hold Account Mode. Falling back to grid splitting.`);
          } else if (Array.isArray(status.data.image_urls) && status.data.image_urls.length > 0) {
            imageUrls = status.data.image_urls;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data.image_urls`);
          } else if (Array.isArray(status.data.urls) && status.data.urls.length > 0) {
            imageUrls = status.data.urls;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data.urls`);
          }
        }

        // PRIORITY 2: Check output.image_urls array (GoAPI-style response)
        if (imageUrls.length === 0 && status.output && typeof status.output === 'object' && !Array.isArray(status.output)) {
          if (Array.isArray(status.output.image_urls) && status.output.image_urls.length > 0) {
            imageUrls = status.output.image_urls;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in output.image_urls`);
          } else if (Array.isArray(status.output.images) && status.output.images.length > 0) {
            imageUrls = status.output.images;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in output.images`);
          }
        }

        // PRIORITY 3: Check data.cdnImage and data.discordImage (Ttapi single image fallback)
        // Only use these if no array was found (some Ttapi responses might only return 1 image)
        if (imageUrls.length === 0 && status.data && typeof status.data === 'object' && !Array.isArray(status.data)) {
          // Ttapi specific fields: cdnImage (preferred) and discordImage (fallback)
          if (status.data.cdnImage) {
            imageUrls = [status.data.cdnImage];
            console.log(`[Ttapi] ⚠️ Found only 1 image in data.cdnImage (expected 4 images)`);
          } else if (status.data.discordImage) {
            imageUrls = [status.data.discordImage];
            console.log(`[Ttapi] ⚠️ Found only 1 image in data.discordImage (expected 4 images)`);
          }
        }

        // PRIORITY 4: Check result field (arrays first)
        if (imageUrls.length === 0 && status.result) {
          if (Array.isArray(status.result.images) && status.result.images.length > 0) {
            imageUrls = status.result.images;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in result.images`);
          } else if (Array.isArray(status.result.urls) && status.result.urls.length > 0) {
            imageUrls = status.result.urls;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in result.urls`);
          } else if (status.result.image) {
            imageUrls = [status.result.image];
            console.log(`[Ttapi] ⚠️ Found only 1 image in result.image (expected 4 images)`);
          } else if (status.result.url) {
            imageUrls = [status.result.url];
            console.log(`[Ttapi] ⚠️ Found only 1 image in result.url (expected 4 images)`);
          }
        }

        // PRIORITY 5: Check top-level fields (arrays first)
        if (imageUrls.length === 0) {
          if (Array.isArray(status.images) && status.images.length > 0) {
            imageUrls = status.images;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in top-level images`);
          } else if (Array.isArray(status.urls) && status.urls.length > 0) {
            imageUrls = status.urls;
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in top-level urls`);
          } else if (status.image) {
            imageUrls = [status.image];
            console.log(`[Ttapi] ⚠️ Found only 1 image in top-level image (expected 4 images)`);
          } else if (status.url) {
            imageUrls = [status.url];
            console.log(`[Ttapi] ⚠️ Found only 1 image in top-level url (expected 4 images)`);
          }
        }
        
        // PRIORITY 6: Check other data locations (single image fallbacks)
        if (imageUrls.length === 0 && status.data) {
          // Check if data is an object
          if (typeof status.data === 'object' && !Array.isArray(status.data)) {
            if (status.data.image) {
              imageUrls = [status.data.image];
              console.log(`[Ttapi] ⚠️ Found only 1 image in data.image (expected 4 images)`);
            } else if (status.data.url) {
              imageUrls = [status.data.url];
              console.log(`[Ttapi] ⚠️ Found only 1 image in data.url (expected 4 images)`);
            } else if (status.data.image_url) {
              imageUrls = [status.data.image_url];
              console.log(`[Ttapi] ⚠️ Found only 1 image in data.image_url (expected 4 images)`);
            }
            // Check nested output in data (arrays first)
            if (imageUrls.length === 0 && status.data.output) {
              if (typeof status.data.output === 'object' && !Array.isArray(status.data.output)) {
                if (Array.isArray(status.data.output.image_urls) && status.data.output.image_urls.length > 0) {
                  imageUrls = status.data.output.image_urls;
                  console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data.output.image_urls`);
                } else if (Array.isArray(status.data.output.images) && status.data.output.images.length > 0) {
                  imageUrls = status.data.output.images;
                  console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data.output.images`);
                } else if (status.data.output.image_url) {
                  imageUrls = [status.data.output.image_url];
                  console.log(`[Ttapi] ⚠️ Found only 1 image in data.output.image_url (expected 4 images)`);
                }
              } else if (Array.isArray(status.data.output)) {
                imageUrls = status.data.output.filter((item: any) => typeof item === 'string' && item.startsWith('http'));
                if (imageUrls.length > 0) {
                  console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data.output array`);
                }
              } else if (typeof status.data.output === 'string' && status.data.output.startsWith('http')) {
                imageUrls = [status.data.output];
                console.log(`[Ttapi] ⚠️ Found only 1 image in data.output string (expected 4 images)`);
              }
            }
          } else if (Array.isArray(status.data)) {
            // Data is an array - might be image URLs directly
            imageUrls = status.data.filter((item: any) => typeof item === 'string' && item.startsWith('http'));
            if (imageUrls.length > 0) {
              console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in data array`);
            }
          } else if (typeof status.data === 'string' && status.data.startsWith('http')) {
            // Data is a string - might be a single image URL
            imageUrls = [status.data];
            console.log(`[Ttapi] ⚠️ Found only 1 image in data string (expected 4 images)`);
          }
        }

        // PRIORITY 7: If output is a string or array, try to use it directly
        if (imageUrls.length === 0 && typeof status.output === 'string' && status.output.startsWith('http')) {
          imageUrls = [status.output];
          console.log(`[Ttapi] ⚠️ Found only 1 image in output string (expected 4 images)`);
        } else if (imageUrls.length === 0 && Array.isArray(status.output)) {
          imageUrls = status.output.filter((item: any) => typeof item === 'string' && item.startsWith('http'));
          if (imageUrls.length > 0) {
            console.log(`[Ttapi] ✅ Found ${imageUrls.length} images in output array`);
          }
        }

        // If we only found 1 image (likely a grid), try to get individual images via upscale
        // Midjourney typically returns a grid image first, then you need to use upscale to get individual images
        if (imageUrls.length === 1) {
          const singleUrl = imageUrls[0];
          console.log(`[Ttapi] ⚠️ Only found 1 image URL (likely a grid): ${singleUrl}`);
          console.log(`[Ttapi] 📋 Checking if response contains individual image URLs or attempting upscale...`);
          
          // Check if data contains individual image URLs (variations/upsamples already done)
          if (status.data && typeof status.data === 'object' && !Array.isArray(status.data)) {
            // Check for variation URLs (variation1, variation2, variation3, variation4)
            const variationUrls: string[] = [];
            for (let i = 1; i <= 4; i++) {
              const variationKey = `variation${i}`;
              const variationUrl = status.data[variationKey];
              if (variationUrl && typeof variationUrl === 'string' && variationUrl.startsWith('http')) {
                variationUrls.push(variationUrl);
              }
            }
            
            // Check for upsample URLs (upsample1, upsample2, upsample3, upsample4)
            for (let i = 1; i <= 4; i++) {
              const upsampleKey = `upsample${i}`;
              const upsampleUrl = status.data[upsampleKey];
              if (upsampleUrl && typeof upsampleUrl === 'string' && upsampleUrl.startsWith('http')) {
                variationUrls.push(upsampleUrl);
              }
            }
            
            if (variationUrls.length > 0) {
              console.log(`[Ttapi] ✅ Found ${variationUrls.length} individual image URLs in variations/upsamples`);
              imageUrls = variationUrls;
            } else {
              // No individual URLs found - try upscale API to get individual images
              console.log(`[Ttapi] 🎯 No individual URLs found. Attempting to upscale grid to get individual images...`);
              
              // Use the current jobId as the taskId for upscale
              const taskId = jobId;
              
              try {
                // Trigger 4 upscale requests (imageIndex 0-3) in parallel
                console.log(`[Ttapi] 📤 Triggering 4 upscale requests for imageIndex 0-3...`);
                const upscalePromises = [];
                for (let i = 0; i < 4; i++) {
                  upscalePromises.push(sendUpscaleToTtapi(taskId, i));
                }
                
                const upscaleJobIds = await Promise.all(upscalePromises);
                console.log(`[Ttapi] ✅ All 4 upscale tasks created:`, upscaleJobIds);
                
                // Poll all 4 upscale tasks
                console.log(`[Ttapi] 📡 Polling upscale tasks for completion...`);
                const upscaleImageUrls: string[] = [];
                
                for (let i = 0; i < upscaleJobIds.length; i++) {
                  const upscaleJobId = upscaleJobIds[i];
                  if (!upscaleJobId) {
                    console.warn(`[Ttapi] ⚠️ Upscale task ${i} did not return a job ID, skipping...`);
                    continue;
                  }
                  
                  try {
                    // Poll this upscale task
                    const upscaleUrls = await pollTaskUntilComplete(
                      upscaleJobId,
                      10, // initialDelay
                      2, // staggerDelay
                      1.2, // delay multiplier
                      120, // maxAttempts
                      30 // maxDelay
                    );
                    
                    if (upscaleUrls && upscaleUrls.length > 0) {
                      // Take the first URL (upscale returns 1 image)
                      upscaleImageUrls.push(upscaleUrls[0]);
                      console.log(`[Ttapi] ✅ Upscale task ${i} completed: ${upscaleUrls[0]}`);
                    } else {
                      console.warn(`[Ttapi] ⚠️ Upscale task ${i} completed but no image URL found`);
                    }
                  } catch (upscaleError: any) {
                    console.error(`[Ttapi] ❌ Upscale task ${i} failed:`, upscaleError);
                    // Continue with other upscale tasks
                  }
                }
                
                if (upscaleImageUrls.length > 0) {
                  console.log(`[Ttapi] ✅ Successfully upscaled ${upscaleImageUrls.length} images from grid`);
                  imageUrls = upscaleImageUrls;
                } else {
                  // Fallback to splitting grid if upscale fails
                  console.log(`[Ttapi] ⚠️ Upscale failed, falling back to grid splitting`);
                  imageUrls = [singleUrl]; // Mark as grid to split
                }
              } catch (upscaleError: any) {
                console.error(`[Ttapi] ❌ Error during upscale process:`, upscaleError);
                // Fallback to splitting grid if upscale fails
                console.log(`[Ttapi] ⚠️ Falling back to grid splitting due to upscale error`);
                imageUrls = [singleUrl]; // Mark as grid to split
              }
            }
          } else {
            // No data object, try upscale or fallback to splitting
            console.log(`[Ttapi] ⚠️ No data object found. Attempting upscale...`);
            
            const taskId = jobId;
            try {
              // Trigger 4 upscale requests
              const upscalePromises = [];
              for (let i = 0; i < 4; i++) {
                upscalePromises.push(sendUpscaleToTtapi(taskId, i));
              }
              
              const upscaleJobIds = await Promise.all(upscalePromises);
              const upscaleImageUrls: string[] = [];
              
              for (let i = 0; i < upscaleJobIds.length; i++) {
                const upscaleJobId = upscaleJobIds[i];
                if (!upscaleJobId) continue;
                
                try {
                  const upscaleUrls = await pollTaskUntilComplete(upscaleJobId, 10, 2, 1.2, 120, 30);
                  if (upscaleUrls && upscaleUrls.length > 0) {
                    upscaleImageUrls.push(upscaleUrls[0]);
                  }
                } catch (error) {
                  console.error(`[Ttapi] Upscale task ${i} failed:`, error);
                }
              }
              
              if (upscaleImageUrls.length > 0) {
                imageUrls = upscaleImageUrls;
              } else {
                imageUrls = [singleUrl]; // Fallback to grid splitting
              }
            } catch (error) {
              console.error(`[Ttapi] Upscale failed:`, error);
              imageUrls = [singleUrl]; // Fallback to grid splitting
            }
          }
        }
        
        if (imageUrls.length > 0) {
          // If we have exactly 1 image, it's likely a grid (will be split client-side)
          if (imageUrls.length === 1) {
            console.log(`[Ttapi] ✅ Task ${jobId} completed! Found grid image (will split into 4 tiles)`);
          } else {
            console.log(`[Ttapi] ✅ Task ${jobId} completed! Returning ${imageUrls.length} images`);
          }
          return imageUrls;
        } else {
          // Log detailed structure for debugging
          console.error(`[Ttapi] ❌ Job completed but no image URLs found in response.`);
          console.error(`[Ttapi] Status:`, status.status);
          console.error(`[Ttapi] Response keys:`, Object.keys(status));
          console.error(`[Ttapi] Full response:`, JSON.stringify(status, null, 2));
          
          // Try to find any URL-like strings in the response (fallback)
          const responseStr = JSON.stringify(status);
          const urlMatches = responseStr.match(/https?:\/\/[^\s"']+/g);
          if (urlMatches && urlMatches.length > 0) {
            console.warn(`[Ttapi] ⚠️ Found potential image URLs in response:`, urlMatches);
            // Filter out non-image URLs (like API endpoints, style reference URLs)
            const imageUrls = urlMatches.filter(url => {
              // Exclude style reference URLs (WordPress hosting URLs)
              if (url.includes('hostingersite.com') || url.includes('wp-content')) {
                return false;
              }
              // Include image URLs
              return /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(url) || 
                     url.includes('cdn.discordapp.com') || 
                     url.includes('mjcdn.ttapi.io') ||
                     url.includes('cdn.ttapi.io') ||
                     url.includes('discordapp.com/attachments');
            });
          if (imageUrls.length > 0) {
            console.log(`[Ttapi] ✅ Extracted ${imageUrls.length} image URLs from response (filtered)`);
            
            // If we got a grid image (single URL), it will be split client-side
            if (imageUrls.length === 1) {
              console.log(`[Ttapi] 📋 Got grid image (will split into 4 tiles client-side)`);
            }
            
            return imageUrls;
          }
        }
        
        throw new Error('Job completed but no image URLs found in response. Check console for full API response structure.');
      }
      }

      // Check if task failed (case-insensitive - Ttapi returns "FAILED" uppercase)
      const taskStatusLower = status.status?.toLowerCase() || '';
      if (taskStatusLower === 'failed' || taskStatusLower === 'error') {
        const errorMsg = status.error || status.message || 'Unknown error';
        
        // Check if it's a rate limit error
        if (errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('rate limited')) {
          // Instead of retrying indefinitely, throw error to trigger resend as new task
          console.warn(`[Ttapi] ⚠️ Rate limit detected during polling (status=${status.status}). Will resend as new task.`);
          throw new Error(`RATE_LIMIT_RESEND_TASK: ${errorMsg}`);
        }
        
        throw new Error(`Ttapi task failed: ${errorMsg}`);
      }
      
      // Reset consecutive rate limit errors on successful poll
      consecutiveRateLimitErrors = 0;

      // Diagnostic warnings for long-running tasks
      if (attempts === 30 && (status.status === 'pending' || status.status === 'processing')) {
        console.warn(`[Ttapi] ⚠️ Task ${jobId} has been ${status.status} for ${elapsed} minutes.`);
        console.warn(`[Ttapi] This is normal for Midjourney - generation can take 5-15 minutes depending on server load.`);
        const baseUrl = getTtapiBaseUrl();
        console.warn(`[Ttapi] Check status manually: https://ttapi.io/dashboard or API: ${baseUrl}/midjourney/v1/fetch?jobId=${jobId}`);
      }

      // Check for images even if status is not 'completed' (sometimes API returns images before status updates)
      if (status.status === 'pending' || status.status === 'processing') {
        let imageUrls: string[] = [];
        
        if (status.output && typeof status.output === 'object' && !Array.isArray(status.output)) {
          if (Array.isArray(status.output.image_urls)) {
            imageUrls = status.output.image_urls;
          } else if (status.output.image_url) {
            imageUrls = [status.output.image_url];
          }
        }
        
        if (imageUrls.length > 0) {
          console.log(`[Ttapi] ⚠️ Found images in response but status is "${status.status}". Images: ${imageUrls.length}`);
          console.log(`[Ttapi] ✅ Task ${jobId} completed! Found ${imageUrls.length} images`);
          return imageUrls;
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Exponential backoff, cap at 30 seconds to avoid rate limits
      // Starts at 10s, grows: 12s, 14.4s, 17.3s, 20.7s, 24.9s, 29.9s, 30s...
      delay = Math.min(delay * 1.2, 30000);
    } catch (error: any) {
      // If it's a task failure or rate limit resend, throw immediately
      if (error.message && (error.message.includes('task failed') || error.message.includes('RATE_LIMIT_RESEND_TASK'))) {
        throw error;
      }
      
      // For other errors, log and continue polling
      console.error(`[Ttapi] Error polling task (attempt ${attempts}/${maxAttempts}):`, error);
      
      // If we've tried many times, give up
      if (attempts >= maxAttempts) {
        throw new Error(`Ttapi task did not complete after ${maxAttempts} attempts. Last error: ${error.message || 'Unknown error'}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Ttapi task did not complete after ${maxAttempts} attempts`);
};

/**
 * Fetches images directly from Discord CDN using message_id and hash
 * This gets the high-quality (2048+ px) versions directly from Midjourney's CDN
 */
const fetchFromDiscordCDN = async (
  messageId: string,
  messageHash: string,
  channelId?: string
): Promise<string[]> => {
  const discordToken = getDiscordToken();
  
  if (!discordToken) {
    console.warn('[Ttapi] Discord token not available, cannot fetch from Discord CDN');
    return [];
  }

  try {
    // Discord CDN format for Midjourney attachments:
    // https://cdn.discordapp.com/attachments/{channel_id}/{attachment_id}/{filename}.png
    // For high-quality versions, we can use the message hash
    
    // First, try to get the message from Discord API to get attachment IDs
    // If channelId is not provided, we'll try to extract it from the hash or use a fallback
    const discordApiUrl = channelId 
      ? `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`
      : null;
    
    let attachmentIds: string[] = [];
    
    if (discordApiUrl) {
      try {
        const response = await fetch(discordApiUrl, {
          headers: {
            'Authorization': discordToken,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const message = await response.json();
          // Extract attachment IDs from the message
          if (message.attachments && Array.isArray(message.attachments)) {
            attachmentIds = message.attachments.map((att: any) => att.id);
            console.log(`[Ttapi] ✅ Found ${attachmentIds.length} attachments in Discord message`);
          }
        }
      } catch (error) {
        console.warn('[Ttapi] Failed to fetch message from Discord API, will use hash-based URLs:', error);
      }
    }
    
    // If we have attachment IDs, construct URLs directly
    // Otherwise, use the hash to construct URLs (Midjourney format)
    const imageUrls: string[] = [];
    
    if (attachmentIds.length > 0 && channelId) {
      // Use attachment IDs for direct CDN access
      for (const attachmentId of attachmentIds) {
        // High-quality version (2048+ px) - Midjourney typically uses this format
        const cdnUrl = `https://cdn.discordapp.com/attachments/${channelId}/${attachmentId}/${messageHash}.png`;
        imageUrls.push(cdnUrl);
      }
    } else {
      // Fallback: Use hash-based URL construction
      // Midjourney grid images are typically at:
      // https://cdn.discordapp.com/attachments/{channel_id}/{message_id}/{hash}.png
      // For individual images, they might be at:
      // https://cdn.discordapp.com/attachments/{channel_id}/{message_id}/{hash}_0.png, _1.png, etc.
      
      // Try to get channel ID from environment or use message_id as fallback
      const fallbackChannelId = import.meta.env.VITE_DISCORD_CHANNEL_ID || messageId;
      
      // Try different URL patterns for individual images
      for (let i = 0; i < 4; i++) {
        const cdnUrl = i === 0 
          ? `https://cdn.discordapp.com/attachments/${fallbackChannelId}/${messageId}/${messageHash}.png`
          : `https://cdn.discordapp.com/attachments/${fallbackChannelId}/${messageId}/${messageHash}_${i}.png`;
        imageUrls.push(cdnUrl);
      }
    }
    
    console.log(`[Ttapi] 🔗 Constructed ${imageUrls.length} Discord CDN URLs from message_id and hash`);
    return imageUrls;
  } catch (error) {
    console.error('[Ttapi] ❌ Error fetching from Discord CDN:', error);
    return [];
  }
};

/**
 * Converts image URLs to base64 data URLs
 * Uses proxy for Discord CDN URLs to avoid CORS issues
 */
const convertUrlsToBase64 = async (imageUrls: string[]): Promise<string[]> => {
  const convertPromises = imageUrls.map(async (url) => {
    try {
      // Use proxy for Discord CDN URLs (CORS blocked) or Ttapi CDN URLs
      const needsProxy = url.includes('cdn.discordapp.com') || 
                        url.includes('discord.com') || 
                        url.includes('mjcdn.ttapi.io') ||
                        url.includes('cdn.ttapi.io');
      const fetchUrl = needsProxy ? `/api/ttapi/image?url=${encodeURIComponent(url)}` : url;
      
      const imageResponse = await fetch(fetchUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      
      const blob = await imageResponse.blob();
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to convert image to data URL'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`Failed to convert image URL ${url}:`, error);
      throw error;
    }
  });
  
  return Promise.all(convertPromises);
};

/**
 * Splits a grid image into 4 individual images (2x2 grid)
 * Returns an array of 4 base64 data URLs
 */
export const splitGridImage = async (gridImageUrl: string): Promise<string[]> => {
  try {
    console.log(`[Ttapi] 🖼️ Splitting grid image into 4 individual images...`);
    
    // Use Vercel proxy to fetch the grid image
    const proxyUrl = `/api/ttapi/image?url=${encodeURIComponent(gridImageUrl)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch grid image: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    
    const width = imageBitmap.width;
    const height = imageBitmap.height;
    const tileWidth = width / 2;
    const tileHeight = height / 2;
    
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: false,
      willReadFrequently: false,
      colorSpace: 'srgb',
      // Enable high-quality image rendering
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Set high-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    const tiles: string[] = [];
    
    // Split into 4 tiles (2x2 grid)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const sx = col * tileWidth;
        const sy = row * tileHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, tileWidth, tileHeight);
        
        // Draw the tile with high quality
        ctx.drawImage(
          imageBitmap,
          sx, sy, tileWidth, tileHeight,  // Source rectangle
          0, 0, tileWidth, tileHeight      // Destination rectangle
        );
        
        // Convert to base64 - PNG is lossless, so this preserves quality
        const base64 = canvas.toDataURL('image/png');
        tiles.push(base64);
      }
    }
    
    imageBitmap.close();
    console.log(`[Ttapi] ✅ Successfully split grid into ${tiles.length} individual images`);
    return tiles;
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error splitting grid image:`, error);
    // Fallback: return the grid image 4 times
    console.log(`[Ttapi] ⚠️ Falling back to duplicating grid image`);
    const base64 = await convertUrlToBase64(gridImageUrl);
    return [base64, base64, base64, base64];
  }
};

/**
 * Converts a single image URL to base64 data URL
 */
const convertUrlToBase64 = async (url: string): Promise<string> => {
  try {
    const proxyUrl = `/api/ttapi/image?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`[Ttapi] Error converting URL to base64:`, url, error);
      // Fallback: try direct fetch
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (fallbackError) {
        console.error(`[Ttapi] Fallback fetch also failed:`, fallbackError);
        throw fallbackError;
      }
    }
};

/**
 * Return type for image generation - includes both base64 (for display) and original URL (for high-quality downloads)
 */
export interface ImageGenerationResult {
  base64: string; // Base64 data URL for display
  originalUrl?: string; // Original image URL for high-quality downloads
}

/**
 * Main function to generate a journal page using ttapi.io Midjourney
 * Returns an array of base64-encoded images (typically 4 images per request)
 * Note: Returns string[] for backward compatibility, but original URLs should be stored separately
 * TODO: Update to return ImageGenerationResult[] for original URL support
 */
export const generateJournalPage = async (
  theme: Theme,
  settings: GenerationSettings,
  parametersForMJ?: string,
  aspectRatio: string = '1:1',
  processMode: string = 'fast',
  onProgress?: (status: string) => void,
  variationIndex?: number,
  customPrompt?: string,
  accountId?: string
): Promise<string[]> => {
  console.log(`[Ttapi] ===== generateJournalPage called =====`);
  console.log(`[Ttapi] Theme: ${theme?.name || 'N/A'}`);
  console.log(`[Ttapi] Settings:`, {
    colorIntensity: settings.colorIntensity,
    textureIntensity: settings.textureIntensity,
    pageStyle: settings.pageStyle,
    aspectRatio,
    processMode
  });
  console.log(`[Ttapi] Custom prompt provided: ${customPrompt ? 'Yes' : 'No'}`);
  if (customPrompt) {
    console.log(`[Ttapi] Custom prompt preview (first 200 chars): "${customPrompt.substring(0, 200)}..."`);
    // Check if custom prompt starts with a URL
    const urlMatch = customPrompt.match(/^(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      console.log(`[Ttapi] ✅ Custom prompt starts with URL: ${urlMatch[1].substring(0, 80)}...`);
    } else {
      console.log(`[Ttapi] ⚠️ Custom prompt does NOT start with a URL`);
    }
  }
  console.log(`[Ttapi] Variation index: ${variationIndex}`);
  
  try {
    // Use custom prompt if provided (from ChatGPT), otherwise construct one
    // Check if customPrompt is a non-empty string
    let prompt = (customPrompt && customPrompt.trim()) ? customPrompt : constructPrompt(theme, settings, parametersForMJ, variationIndex);
    
    // CRITICAL: Extract image URL at the start of the prompt (for Midjourney image reference)
    // This must be preserved throughout all transformations and prepended at the end
    let imageUrlAtStart: string | null = null;
    const urlMatchAtStart = prompt.match(/^(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|avi|webm|pdf))\s*/i);
    if (urlMatchAtStart) {
      imageUrlAtStart = urlMatchAtStart[1];
      console.log(`[Ttapi] ✅ Detected image URL at start of prompt: ${imageUrlAtStart.substring(0, 80)}...`);
      // Remove the URL from the prompt temporarily (we'll add it back at the end)
      prompt = prompt.substring(urlMatchAtStart[0].length).trim();
      console.log(`[Ttapi] Extracted image URL, remaining prompt length: ${prompt.length}`);
    } else {
      // Also check for any URL at the start (even without image extension)
      const anyUrlMatch = prompt.match(/^(https?:\/\/[^\s]+)\s*/i);
      if (anyUrlMatch) {
        imageUrlAtStart = anyUrlMatch[1];
        console.log(`[Ttapi] ✅ Detected URL at start (non-image): ${imageUrlAtStart.substring(0, 80)}...`);
        prompt = prompt.substring(anyUrlMatch[0].length).trim();
      } else {
        console.log(`[Ttapi] ⚠️ No URL detected at start of prompt`);
      }
    }
    
    // CRITICAL: Extract --ar parameter and preserve other Midjourney parameters (--p, --sref, --sw, etc.)
    // Midjourney interprets everything after --ar as parameters, so we need to move it to the end
    // But we must preserve other valid Midjourney parameters that come after --ar
    let extractedAspectRatio: string | null = null;
    let extractedParameters: string = ''; // Store other parameters found after --ar as a string
    const arMatch = prompt.match(/--ar\s+([^\s]+)/i);
    if (arMatch) {
      extractedAspectRatio = arMatch[1];
      console.log(`[Ttapi] Found --ar ${extractedAspectRatio} in middle of prompt, extracting it`);
      // Find the position where --ar starts
      const arIndex = prompt.indexOf('--ar');
      if (arIndex !== -1) {
        // Extract everything after --ar (this includes the aspect ratio value and any following parameters)
        const afterAr = prompt.substring(arIndex + '--ar'.length).trim();
        // The first word is the aspect ratio value (already extracted in arMatch[1])
        // Everything after the first word might be other parameters
        const afterArValue = afterAr.substring(arMatch[1].length).trim();
        if (afterArValue) {
          // Preserve everything after the aspect ratio value as it might contain --p, --sref, etc.
          extractedParameters = afterArValue;
          console.log(`[Ttapi] Preserved parameters after --ar: ${extractedParameters}`);
        }
        // Get everything before --ar and trim it
        prompt = prompt.substring(0, arIndex).trim();
        console.log(`[Ttapi] Removed --ar and extracted parameters. New prompt: "${prompt}"`);
      }
    }
    
    // Clean the prompt to remove problematic phrases that Midjourney interprets as parameters
    const promptBeforeCleaning = prompt;
    const urlBeforeCleaning = prompt.match(/^(https?:\/\/[^\s]+)/i)?.[1];
    if (urlBeforeCleaning) {
      console.log(`[Ttapi] URL before cleaning: ${urlBeforeCleaning.substring(0, 80)}...`);
    }
    prompt = cleanPromptForMidjourney(prompt);
    const urlAfterCleaning = prompt.match(/^(https?:\/\/[^\s]+)/i)?.[1];
    if (urlAfterCleaning) {
      console.log(`[Ttapi] ✅ URL preserved after cleaning: ${urlAfterCleaning.substring(0, 80)}...`);
    } else if (urlBeforeCleaning) {
      console.log(`[Ttapi] ❌ URL REMOVED during cleaning! Original: ${urlBeforeCleaning.substring(0, 80)}...`);
    }
    if (promptBeforeCleaning !== prompt) {
      console.log(`[Ttapi] Prompt cleaned: "${promptBeforeCleaning.substring(0, 100)}..." -> "${prompt.substring(0, 100)}..."`);
    }
    
    // CRITICAL: Validate that prompt is not empty after cleaning
    // Midjourney requires text before parameters (--ar, --sref, etc.)
    // Also check if prompt is just "PRIMARY SUBJECT:" with no actual content
    const isOnlyHeader = /^PRIMARY\s+SUBJECT:\s*$/i.test(prompt.trim());
    if (!prompt || prompt.trim().length === 0 || isOnlyHeader) {
      const errorMsg = `[Ttapi] ❌ ERROR: Prompt is empty or contains only header after cleaning. Cannot send empty prompt to Midjourney. Original prompt: "${promptBeforeCleaning}", Cleaned: "${prompt}"`;
      console.error(errorMsg);
      throw new Error('Generated prompt is empty or invalid. The prompt generation may have failed. Please check your prompt generation settings or try a different subject.');
    }
    
    // CRITICAL: Handle Custom / Override mode - trust ChatGPT prompt entirely, only add aspect ratio
    // Also skip adding problematic phrases for Image Theme Expansion mode (skipStyleReference = true)
    if (settings.colorIntensity === 'Custom / Override' || settings.skipStyleReference) {
      // For Custom / Override or Image Theme Expansion: Only add aspect ratio, DO NOT add any style constraints
      // Trust the ChatGPT prompt entirely
      // Use extracted aspect ratio if found, otherwise use the provided aspectRatio
      const finalAspectRatio = extractedAspectRatio || (aspectRatio && aspectRatio !== '1:1' ? aspectRatio : null);
      if (finalAspectRatio) {
        prompt += ` --ar ${finalAspectRatio}`;
      }
      if (settings.skipStyleReference) {
        console.log(`[Ttapi] Skipping style reference URL - relying on detailed prompt only for variation ${variationIndex ?? 0}`);
      }
    } else if (customPrompt) {
      // For other modes with custom prompts: Add minimal flat design constraints
      // BUT skip for SREF mode - the SREF handles all styling, and we should only have subject description
      const isSrefMode = theme?.id === 'sref-style-match';
      
      // For SREF mode: Only add aspect ratio at the end (before --sref will be added)
      // For other modes: Add aspect ratio and flat design constraints
      if (isSrefMode) {
        // SREF mode: Use extracted aspect ratio if found, otherwise use provided aspectRatio
        const finalAspectRatio = extractedAspectRatio || (aspectRatio && aspectRatio !== '1:1' ? aspectRatio : null);
        if (finalAspectRatio) {
          prompt += ` --ar ${finalAspectRatio}`;
        }
        console.log(`[Ttapi] SREF mode detected - skipping flat design constraints, relying on --sref for styling`);
      } else {
        // Non-SREF mode: Add aspect ratio and flat design constraints
        if (settings.aspectRatio && settings.aspectRatio !== '1:1' && !prompt.includes('--ar')) {
          prompt += ` --ar ${settings.aspectRatio}`;
        }
        // Add minimal flat design constraints if not already present
        if (!prompt.toLowerCase().includes('flat printable page')) {
          prompt += ` flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page.`;
        }
      }
    } else {
      // Constructed prompt - add full constraints based on color intensity
      let strictConstraints: string;
      
      if (settings.colorIntensity === 'Muted') {
        // Muted: sepia, brown tones, faded
        const colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
        strictConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else if (settings.colorIntensity === 'Normal') {
        // Normal: normal colors, not muted/sepia, not overly vibrant - gothic/vintage aesthetic
        const colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
        strictConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else if (settings.colorIntensity === 'Colorful') {
        // Colorful: vibrant colors with vintage charm
        const colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
        strictConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else {
        // Multicolored: vivid, alive, modern - NO vintage
        strictConstraints = `vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
      }
      
      prompt = `${prompt} ${strictConstraints}`;
      
      // Add aspect ratio if not already added
      if (aspectRatio && aspectRatio !== '1:1' && !prompt.includes('--ar')) {
        prompt += ` --ar ${aspectRatio}`;
      }
    }

    // MAXIMUM style reference influence - force Midjourney to follow reference style
    // Same as GoAPI implementation
    // Add style reference BEFORE aspect ratio (parameters should be at the end)
    // Skip style reference if skipStyleReference flag is set (e.g., Image Theme Expansion mode - rely on detailed prompt only)
    // Only add --sref and --sw if we have a valid SREF code/URL (not empty, not just whitespace)
    const trimmedStyleRef = settings.styleRefUrl?.trim();
    const hasValidStyleRef = trimmedStyleRef && trimmedStyleRef.length > 0;
    
    if (!settings.skipStyleReference && hasValidStyleRef) {
      prompt += ` --sref ${trimmedStyleRef} --sw 1000`;
      console.log(`[Ttapi] Added MAXIMUM style reference (--sw 1000) for variation ${variationIndex ?? 0}: ${trimmedStyleRef}`);
    } else if (settings.skipStyleReference) {
      console.log(`[Ttapi] Skipping style reference URL - relying on detailed prompt only for variation ${variationIndex ?? 0}`);
    } else if (!hasValidStyleRef) {
      console.log(`[Ttapi] No valid style reference URL/code provided - skipping --sref and --sw for variation ${variationIndex ?? 0}`);
    }

    // Add Midjourney moodboard (--p parameter) if provided
    // Moodboard should be added after --sref but before --ar
    const trimmedMoodboard = settings.moodboardId?.trim();
    if (trimmedMoodboard && trimmedMoodboard.length > 0) {
      // Ensure moodboard ID starts with 'm' if not already
      const moodboardId = trimmedMoodboard.startsWith('m') ? trimmedMoodboard : `m${trimmedMoodboard}`;
      prompt += ` --p ${moodboardId}`;
      console.log(`[Ttapi] Added moodboard (--p) for variation ${variationIndex ?? 0}: ${moodboardId}`);
    }

    // Add aspect ratio LAST (after style reference if present)
    // Only add if not already present and not in Custom / Override mode (which handles it above)
    if (settings.colorIntensity !== 'Custom / Override') {
      const finalAspectRatio = extractedAspectRatio || (aspectRatio && aspectRatio !== '1:1' ? aspectRatio : null);
      if (finalAspectRatio && !prompt.includes('--ar')) {
        prompt += ` --ar ${finalAspectRatio}`;
      }
    }

    // Re-add extracted parameters that were found after --ar (like --p, --sref, etc.)
    // Remove any --ar from extractedParameters since we add it separately at the end
    if (extractedParameters && extractedParameters.trim()) {
      // Remove any --ar parameters from extractedParameters to avoid duplicates
      let cleanedParams = extractedParameters.trim();
      // Remove --ar and its value (e.g., "--ar 3:4" or "--ar 16:9")
      cleanedParams = cleanedParams.replace(/--ar\s+[^\s]+/gi, '').trim();
      // Clean up any double spaces
      cleanedParams = cleanedParams.replace(/\s+/g, ' ');
      
      if (cleanedParams) {
        prompt += ` ${cleanedParams}`;
        console.log(`[Ttapi] Re-added extracted parameters (--ar removed): ${cleanedParams}`);
      }
    }

    // Add other Midjourney parameters (e.g., --v 6.1, --niji 6) if provided
    // These should be added at the very end, after --ar, --sref, and --p
    if (parametersForMJ && parametersForMJ.trim()) {
      prompt += ` ${parametersForMJ.trim()}`;
      console.log(`[Ttapi] Added Midjourney parameters: ${parametersForMJ.trim()}`);
    }
    
    // For HOLD accounts with relax mode, add --relax to the end of the prompt
    // According to TTAPI docs, HOLD accounts need the mode specified in the prompt
    const baseUrl = getTtapiBaseUrl();
    const isHoldAccount = baseUrl.includes('hold.ttapi.io');
    if (isHoldAccount && processMode === 'relax') {
      prompt = prompt.trim();
      // Make sure --relax isn't already in the prompt
      if (!prompt.toLowerCase().includes('--relax')) {
        prompt += ' --relax';
        console.log(`[Ttapi] HOLD account: Added --relax to prompt for relax mode`);
      }
    }

    // CRITICAL: Prepend the image URL back at the start (if it was extracted)
    // Midjourney requires image URLs to be at the very beginning of the prompt
    // Ensure no leading whitespace and exactly one space between URL and prompt
    if (imageUrlAtStart) {
      // Remove any leading/trailing whitespace from URL and prompt
      const cleanUrl = imageUrlAtStart.trim();
      const cleanPrompt = prompt.trim();
      // Ensure URL starts with http:// or https://
      if (cleanUrl.match(/^https?:\/\//i)) {
        prompt = `${cleanUrl} ${cleanPrompt}`;
        console.log(`[Ttapi] ✅ Prepended image URL back to prompt: ${cleanUrl.substring(0, 80)}...`);
        console.log(`[Ttapi] Full URL: ${cleanUrl}`);
      } else {
        console.warn(`[Ttapi] ⚠️ Extracted URL does not start with http:// or https://: ${cleanUrl.substring(0, 80)}...`);
        // Still prepend it, but log a warning
        prompt = `${cleanUrl} ${cleanPrompt}`;
      }
    }
    
    // Log the final prompt before sending (--no realistic will be added in sendTaskToTtapi)
    const finalUrlCheck = prompt.match(/^(https?:\/\/[^\s]+)/i);
    if (finalUrlCheck) {
      console.log(`[Ttapi] ✅ Final prompt STARTS with URL: ${finalUrlCheck[1].substring(0, 80)}...`);
      console.log(`[Ttapi] Final prompt preview (first 300 chars): "${prompt.substring(0, 300)}..."`);
    } else {
      console.log(`[Ttapi] ⚠️ Final prompt does NOT start with a URL`);
      console.log(`[Ttapi] Final prompt preview (first 300 chars): "${prompt.substring(0, 300)}..."`);
    }
    console.log(`[Ttapi] Note: --no realistic will be added automatically in sendTaskToTtapi`);

    // Send task to ttapi.io with retry logic for rate limits
    let jobId: string | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const baseRetryDelay = 5000; // 5 seconds base delay
    
    while (!jobId && retryCount <= maxRetries) {
      try {
        // Pass accountId if provided (for explicit account rotation)
        jobId = await sendTaskToTtapi(prompt, processMode, accountId);
        if (!jobId) {
          throw new Error('Failed to create ttapi.io task: No job ID returned');
        }
        break; // Success, exit retry loop
      } catch (error: any) {
        // Check if it's a rate limit, queue full, or "no available accounts" error
        const isRateLimit = error.message?.includes('RATE_LIMIT_RETRY') || 
                           error.message?.toLowerCase().includes('rate limit') ||
                           error.message?.includes('429');
        const isQueueFull = error.message?.includes('QUEUE_FULL_RETRY') ||
                           error.message?.toLowerCase().includes('queue is full') ||
                           error.message?.toLowerCase().includes('queue full') ||
                           error.message?.toLowerCase().includes('try again later');
        const isNoAccounts = error.message?.includes('NO_ACCOUNTS_RETRY') ||
                            error.message?.toLowerCase().includes('no available accounts') ||
                            error.message?.toLowerCase().includes('no available account');
        
        // "No available accounts" usually means the account is busy - retry with delay
        if ((isRateLimit || isQueueFull || isNoAccounts) && retryCount < maxRetries) {
          retryCount++;
          // Exponential backoff: 5s, 10s, 20s for rate limits, longer for queue full/no accounts
          const baseDelay = (isQueueFull || isNoAccounts) ? baseRetryDelay * 2 : baseRetryDelay; // 10s base for queue full/no accounts
          const retryDelay = baseDelay * Math.pow(2, retryCount - 1);
          let errorType = isQueueFull ? 'queue full' : (isNoAccounts ? 'account busy' : 'rate limit');
          console.warn(`[Ttapi] ⚠️ ${errorType} detected during task creation (attempt ${retryCount}/${maxRetries}). Waiting ${retryDelay / 1000}s before resending as new task...`);
          if (isNoAccounts) {
            console.warn(`[Ttapi] 💡 Account may be processing another job. Retrying after delay...`);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`[Ttapi] 🔄 Retrying task creation (attempt ${retryCount}/${maxRetries})...`);
          continue; // Retry
        } else {
          // Not a retryable error, or max retries reached - throw the error
          throw error;
        }
      }
    }
    
    if (!jobId) {
      throw new Error('Failed to create ttapi.io task after retries');
    }

    // Poll Ttapi until task is complete - returns image URLs (may be grid or individual)
    console.log(`[Ttapi] 📡 Polling Ttapi for task completion...`);
    
    let imageUrls: string[] = [];
    
    // Poll until complete - returns all image URLs
    // Add stagger delay based on variationIndex to avoid simultaneous polling
    // Each request waits (variationIndex * 2000ms) before starting to poll
    // This spreads out polling requests to avoid rate limiting
    const staggerDelay = (variationIndex ?? 0) * 2000; // 0ms, 2s, 4s, 6s, etc.
    
    let pollingRetryCount = 0;
    const maxPollingRetries = 2;
    let currentJobId = jobId;
    
    while (imageUrls.length === 0 && pollingRetryCount <= maxPollingRetries) {
      try {
        // Use longer delays to avoid rate limiting:
        // - maxAttempts: 120 (at ~15s average = 30 min max wait)
        // - initialDelay: 10000ms (10s between polls)
        // - staggerDelay: spreads out concurrent task polling
        imageUrls = await pollTaskUntilComplete(currentJobId, 120, 10000, staggerDelay);
        
        if (!imageUrls || imageUrls.length === 0) {
          throw new Error('No images returned from ttapi.io');
        }
        break; // Success, exit retry loop
      } catch (error: any) {
        // Check if we should resend as new task
        const shouldResend = error.message?.includes('RATE_LIMIT_RESEND_TASK') || 
                            (error.message?.toLowerCase().includes('rate limit') && pollingRetryCount < maxPollingRetries);
        
        if (shouldResend) {
          pollingRetryCount++;
          const retryDelay = 10000 * pollingRetryCount; // 10s, 20s
          console.warn(`[Ttapi] ⚠️ Rate limit during polling (attempt ${pollingRetryCount}/${maxPollingRetries}). Resending prompt as new task after ${retryDelay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Resend the prompt as a completely new task
          console.log(`[Ttapi] 🔄 Resending prompt as new task (attempt ${pollingRetryCount}/${maxPollingRetries})...`);
          try {
            currentJobId = await sendTaskToTtapi(prompt, processMode);
            if (!currentJobId) {
              throw new Error('Failed to create new task after rate limit');
            }
            console.log(`[Ttapi] ✅ New task created: ${currentJobId}`);
            // Reset stagger delay for new task
            const newStaggerDelay = (variationIndex ?? 0) * 500;
            continue; // Retry polling with new job ID
          } catch (resendError: any) {
            if (pollingRetryCount >= maxPollingRetries) {
              throw new Error(`Failed to resend task after rate limit: ${resendError.message}`);
            }
            // If resend also fails with rate limit, wait longer and try again
            const longerDelay = 20000 * pollingRetryCount; // 20s, 40s
            console.warn(`[Ttapi] ⚠️ Resend also rate limited. Waiting ${longerDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, longerDelay));
            continue;
          }
        } else {
          // Not a rate limit or max retries reached - throw the error
          throw error;
        }
      }
    }
    
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No images returned from ttapi.io after retries');
    }

    // Convert URLs to base64, but also preserve original URLs for high-quality downloads
    // If we have exactly 1 image, it's likely a grid - split it client-side
    if (imageUrls.length === 1) {
      console.log(`[Ttapi] 📋 Detected grid image - splitting into 4 individual tiles...`);
      const base64Images = await splitGridImage(imageUrls[0]);
      console.log(`[Ttapi] ✅ Successfully split grid into ${base64Images.length} individual images`);
      // Store the original grid URL so we can split it fresh on download for maximum quality
      // This avoids quality loss from re-encoding the pre-split base64 images
      const result = base64Images as any;
      result.originalGridUrl = imageUrls[0]; // Store grid URL for high-quality downloads
      result.isGrid = true; // Mark as grid so download can split fresh
      return result;
    } else {
      console.log(`[Ttapi] Converting ${imageUrls.length} image(s) to base64...`);
      const base64Images = await convertUrlsToBase64(imageUrls);
      console.log(`[Ttapi] ✅ Successfully generated ${base64Images.length} image(s)`);
      // Store original URLs alongside base64 for high-quality downloads
      // We'll attach original URLs to the return value
      // For backward compatibility, return string[] but attach originalUrls as a property
      const result = base64Images as any;
      result.originalUrls = imageUrls; // Attach original URLs
      console.log(`[Ttapi] ✅ Attached ${imageUrls.length} original URL(s) for high-quality downloads`);
      return result;
    }
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error generating journal page:`, error);
    throw new Error(`Ttapi Image Generation Error: ${error.message || 'Unknown error occurred'}`);
  }
};

/**
 * Get the number of available TTAPI accounts for dynamic batch sizing
 * For Hold Account Mode, fetches actual account count via server-side API
 * For PPU mode, returns 1 (single account)
 */
export const getTTAPIAccountCount = async (mode: 'fast' | 'relax' = 'fast'): Promise<number> => {
  const apiKey = getTtapiApiKey();
  
  if (!apiKey) {
    return 1; // Default to 1 if no API key
  }
  
  try {
    // Use server-side API route to avoid CORS issues
    const response = await fetch(`/api/ttapi/accounts?mode=${mode}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const count = data.count || 1;
      console.log(`[Ttapi] Found ${count} account(s) available for ${mode} mode`);
      return count;
    } else {
      console.warn(`[Ttapi] Could not fetch account count, defaulting to 1:`, response.status);
    }
  } catch (error) {
    console.warn(`[Ttapi] Could not fetch account count, defaulting to 1:`, error);
  }
  
  // Default to 1 account (PPU mode or if fetch failed)
  return 1;
};

/**
 * Get the list of available TTAPI account IDs for round-robin distribution
 * For Hold Account Mode, fetches actual account list via server-side API
 * For PPU mode, returns empty array (no account selection)
 */
export const getTTAPIAccountIds = async (mode: 'fast' | 'relax' = 'fast'): Promise<string[]> => {
  const apiKey = getTtapiApiKey();
  
  if (!apiKey) {
    return []; // No accounts if no API key
  }
  
  try {
    // Use server-side API route to avoid CORS issues
    const response = await fetch(`/api/ttapi/accounts?mode=${mode}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const accountIds = data.accountIds || [];
      console.log(`[Ttapi] Found ${accountIds.length} account ID(s) for ${mode} mode:`, accountIds);
      return accountIds;
    } else {
      console.warn(`[Ttapi] Could not fetch account IDs, defaulting to empty:`, response.status);
    }
  } catch (error) {
    console.warn(`[Ttapi] Could not fetch account IDs, defaulting to empty:`, error);
  }
  
  // Default to empty array (PPU mode or if fetch failed)
  return [];
};

