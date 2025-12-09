import { Theme, GenerationSettings } from '../types';

// Get Ttapi domain from environment variable (defaults to PPU mode)
// Hold Account Mode: https://hold.ttapi.io
// PPU Mode: https://api.ttapi.io
const getTtapiBaseUrl = (): string => {
  return import.meta.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';
};

// Get API key from environment variable only
const getTtapiApiKey = (): string => {
  return import.meta.env.VITE_TTAPI_API_KEY || '';
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

  const elementsPrompt = settings.elements.length > 0 
    ? `featuring elements: ${settings.elements.join(', ')}` 
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
    prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. Color palette: ${colorPalette}. vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
  } else {
    prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. Color palette: ${colorPalette}. Extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
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
  
  // Replace commas with periods (commas can be interpreted as parameter separators)
  // But only if they're not part of a URL or parameter
  cleaned = cleaned.replace(/,(\s+)(?![a-z]+:)/gi, '.$1');
  
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
 * Sends a task to ttapi.io Midjourney
 */
const sendTaskToTtapi = async (
  prompt: string
): Promise<string | null> => {
  console.log(`[Ttapi] ===== Starting sendTaskToTtapi =====`);
  console.log(`[Ttapi] Prompt length: ${prompt.length}`);
  console.log(`[Ttapi] Prompt preview: ${prompt.substring(0, 150)}...`);
  
  const apiKey = getTtapiApiKey();
  console.log(`[Ttapi] API key retrieved: ${apiKey ? `Yes (length: ${apiKey.length})` : 'NO - MISSING!'}`);
  
  if (!apiKey) {
    const error = 'Ttapi API key is not configured. Please set VITE_TTAPI_API_KEY in your environment variables.';
    console.error(`[Ttapi] ❌ ${error}`);
    throw new Error(error);
  }

  const data = {
    prompt: prompt,
    getUImages: true  // Request 4 individual images instead of grid (per Ttapi docs)
  };

  const baseUrl = getTtapiBaseUrl();
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
    
    // Check response status before parsing
    if (!response.ok) {
      let errorMessage = `Ttapi HTTP error: ${response.status}`;
      let errorDetail = '';
      
      try {
        const errorJson = await response.json();
        console.error(`[Ttapi] HTTP ${response.status} error creating task:`, JSON.stringify(errorJson, null, 2));
        
        // Handle specific error cases
        if (response.status === 402) {
          const quotaError = errorJson.error?.message || errorJson.message || 'insufficient quota';
          errorMessage = `Ttapi API error: Insufficient quota. Your ttapi.io account has no credits remaining or has exceeded its usage limit.`;
          errorDetail = `Please check your ttapi.io account balance and add credits if needed. Error details: ${quotaError}`;
        } else if (response.status === 401) {
          errorMessage = `Ttapi API error: Invalid API key. Please check that VITE_TTAPI_API_KEY is set correctly.`;
        } else if (response.status === 429) {
          errorMessage = `Ttapi API error: Rate limit exceeded. Will retry with new task.`;
          // Rate limit - throw special error to trigger retry
          throw new Error('RATE_LIMIT_RETRY');
        } else {
          errorDetail = errorJson.error?.message || errorJson.message || JSON.stringify(errorJson);
          errorMessage = `Ttapi HTTP error: ${response.status} - ${errorDetail}`;
        }
      } catch (parseError) {
        const errorText = await response.text();
        console.error(`[Ttapi] HTTP ${response.status} error (could not parse JSON):`, errorText);
        errorMessage = `Ttapi HTTP error: ${response.status} - ${errorText}`;
      }
      
      const fullError = errorDetail ? `${errorMessage} ${errorDetail}` : errorMessage;
      throw new Error(fullError);
    }
    
    const json: TtapiTaskResponse = await response.json();
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
 */
const pollTaskUntilComplete = async (
  jobId: string,
  maxAttempts: number = 180,
  initialDelay: number = 3000,
  staggerDelay: number = 0 // Add stagger delay to avoid simultaneous polling
): Promise<string[]> => {
  // Stagger polling start to avoid rate limits when multiple tasks poll simultaneously
  if (staggerDelay > 0) {
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

        // If we only found 1 image (likely a grid), check if we can get individual images
        // Midjourney typically returns a grid image first, then you need to use variations/components
        if (imageUrls.length === 1) {
          const singleUrl = imageUrls[0];
          console.log(`[Ttapi] ⚠️ Only found 1 image URL (likely a grid): ${singleUrl}`);
          console.log(`[Ttapi] 📋 Checking if response contains individual image URLs or components...`);
          
          // Check if data contains individual image URLs (variations)
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
              // If no individual URLs found, we'll split the grid image into 4 tiles
              console.log(`[Ttapi] ⚠️ No individual image URLs found. Will split grid image into 4 tiles.`);
              // Keep singleUrl - we'll split it later in convertUrlsToBase64
              imageUrls = [singleUrl]; // Mark as grid to split
            }
          } else {
            // No data object, mark as grid to split
            console.log(`[Ttapi] ⚠️ No data object found. Will split grid image into 4 tiles.`);
            imageUrls = [singleUrl]; // Mark as grid to split
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

      // Check if task failed
      if (status.status === 'failed' || status.status === 'error') {
        const errorMsg = status.error || status.message || 'Unknown error';
        
        // Check if it's a rate limit error
        if (errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('rate limited')) {
          consecutiveRateLimitErrors++;
          console.warn(`[Ttapi] ⚠️ Rate limit detected (consecutive: ${consecutiveRateLimitErrors}). Applying exponential backoff...`);
          
          // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
          const backoffDelay = Math.min(5000 * Math.pow(2, consecutiveRateLimitErrors - 1), 60000);
          console.log(`[Ttapi] ⏳ Waiting ${backoffDelay / 1000}s before retrying...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          
          // Reset delay to initial after backoff
          delay = initialDelay;
          continue; // Retry polling
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
      
      // Exponential backoff, but cap at 10 seconds
      delay = Math.min(delay * 1.1, 10000);
    } catch (error: any) {
      // If it's a task failure, throw immediately
      if (error.message && error.message.includes('task failed')) {
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
 * Converts image URLs to base64 data URLs
 * Uses proxy for Discord CDN URLs to avoid CORS issues
 */
const convertUrlsToBase64 = async (imageUrls: string[]): Promise<string[]> => {
  const convertPromises = imageUrls.map(async (url) => {
    try {
      // Use proxy for Discord CDN URLs (CORS blocked) or Ttapi CDN URLs
      const needsProxy = url.includes('cdn.discordapp.com') || url.includes('discord.com') || url.includes('mjcdn.ttapi.io');
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
const splitGridImage = async (gridImageUrl: string): Promise<string[]> => {
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
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    const tiles: string[] = [];
    
    // Split into 4 tiles (2x2 grid)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const sx = col * tileWidth;
        const sy = row * tileHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, tileWidth, tileHeight);
        
        // Draw the tile
        ctx.drawImage(
          imageBitmap,
          sx, sy, tileWidth, tileHeight,  // Source rectangle
          0, 0, tileWidth, tileHeight      // Destination rectangle
        );
        
        // Convert to base64
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
 * Main function to generate a journal page using ttapi.io Midjourney
 * Returns an array of base64-encoded images (typically 4 images per request)
 */
export const generateJournalPage = async (
  theme: Theme,
  settings: GenerationSettings,
  parametersForMJ?: string,
  aspectRatio: string = '1:1',
  processMode: string = 'fast',
  onProgress?: (status: string) => void,
  variationIndex?: number,
  customPrompt?: string
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
  console.log(`[Ttapi] Variation index: ${variationIndex}`);
  
  try {
    // Use custom prompt if provided (from ChatGPT), otherwise construct one
    let prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
    
    // CRITICAL: Extract --ar parameter if it exists in the middle of the prompt
    // Midjourney interprets everything after --ar as parameters, so we need to move it to the end
    // SIMPLE APPROACH: If --ar is found, extract it and remove EVERYTHING after it
    let extractedAspectRatio: string | null = null;
    const arMatch = prompt.match(/--ar\s+([^\s]+)/i);
    if (arMatch) {
      extractedAspectRatio = arMatch[1];
      console.log(`[Ttapi] Found --ar ${extractedAspectRatio} in middle of prompt, extracting it`);
      // Find the position where --ar starts
      const arIndex = prompt.indexOf('--ar');
      if (arIndex !== -1) {
        // Get everything before --ar and trim it
        prompt = prompt.substring(0, arIndex).trim();
        console.log(`[Ttapi] Removed --ar and everything after it. New prompt: "${prompt}"`);
      }
    }
    
    // Clean the prompt to remove problematic phrases that Midjourney interprets as parameters
    const promptBeforeCleaning = prompt;
    prompt = cleanPromptForMidjourney(prompt);
    if (promptBeforeCleaning !== prompt) {
      console.log(`[Ttapi] Prompt cleaned: "${promptBeforeCleaning}" -> "${prompt}"`);
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

    // Add other Midjourney parameters (e.g., --v 6.1, --niji 6) if provided
    // These should be added at the very end, after --ar, --sref, and --p
    if (parametersForMJ && parametersForMJ.trim()) {
      prompt += ` ${parametersForMJ.trim()}`;
      console.log(`[Ttapi] Added Midjourney parameters: ${parametersForMJ.trim()}`);
    }

    // Log the EXACT prompt being sent to Midjourney for debugging
    console.log(`[Ttapi] FULL PROMPT BEING SENT: "${prompt}"`);
    console.log(`[Ttapi] Full request body:`, JSON.stringify({
      prompt: prompt,
      aspect_ratio: aspectRatio,
      process_mode: processMode
    }, null, 2));

    // Send task to ttapi.io with retry logic for rate limits
    let jobId: string | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const baseRetryDelay = 5000; // 5 seconds base delay
    
    while (!jobId && retryCount <= maxRetries) {
      try {
        jobId = await sendTaskToTtapi(prompt);
        if (!jobId) {
          throw new Error('Failed to create ttapi.io task: No job ID returned');
        }
        break; // Success, exit retry loop
      } catch (error: any) {
        // Check if it's a rate limit error
        const isRateLimit = error.message?.includes('RATE_LIMIT_RETRY') || 
                           error.message?.toLowerCase().includes('rate limit') ||
                           error.message?.includes('429');
        
        if (isRateLimit && retryCount < maxRetries) {
          retryCount++;
          // Exponential backoff: 5s, 10s, 20s
          const retryDelay = baseRetryDelay * Math.pow(2, retryCount - 1);
          console.warn(`[Ttapi] ⚠️ Rate limit detected during task creation (attempt ${retryCount}/${maxRetries}). Waiting ${retryDelay / 1000}s before resending as new task...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`[Ttapi] 🔄 Retrying task creation (attempt ${retryCount}/${maxRetries})...`);
          continue; // Retry
        } else {
          // Not a rate limit, or max retries reached - throw the error
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
    // Each request waits (variationIndex * 500ms) before starting to poll
    const staggerDelay = (variationIndex ?? 0) * 500; // 0ms, 500ms, 1000ms, 1500ms, etc.
    
    let pollingRetryCount = 0;
    const maxPollingRetries = 2;
    let currentJobId = jobId;
    
    while (imageUrls.length === 0 && pollingRetryCount <= maxPollingRetries) {
      try {
        imageUrls = await pollTaskUntilComplete(currentJobId, 180, 5000, staggerDelay);
        
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
            currentJobId = await sendTaskToTtapi(prompt);
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

    // Convert URLs to base64
    // If we have exactly 1 image, it's likely a grid - split it client-side
    if (imageUrls.length === 1) {
      console.log(`[Ttapi] 📋 Detected grid image - splitting into 4 individual tiles...`);
      const base64Images = await splitGridImage(imageUrls[0]);
      console.log(`[Ttapi] ✅ Successfully split grid into ${base64Images.length} individual images`);
      return base64Images;
    } else {
      console.log(`[Ttapi] Converting ${imageUrls.length} image(s) to base64...`);
      const base64Images = await convertUrlsToBase64(imageUrls);
      console.log(`[Ttapi] ✅ Successfully generated ${base64Images.length} image(s)`);
      return base64Images;
    }
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error generating journal page:`, error);
    throw new Error(`Ttapi Image Generation Error: ${error.message || 'Unknown error occurred'}`);
  }
};

