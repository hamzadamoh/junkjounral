import { Theme, GenerationSettings } from '../types';

const TTAPI_BASE_URL = 'https://api.ttapi.io';

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

  // Get color palette and style constraints based on color intensity setting
  const colorPalette = settings.colorIntensity === 'Muted' 
    ? 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors'
    : settings.colorIntensity === 'Colorful'
    ? 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'
    : 'wide range of colors (blues, greens, purples, warm accents like oranges and yellows, cool tones, various harmonious hues), multicolored vintage palette, watercolor-like color diversity, maintaining vintage charm, NOT modern bright colors, NOT neon colors';

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
  if (variationIndex !== undefined) {
    const seed = Math.floor(Math.random() * 1000000) + variationIndex * 1000;
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
    prompt: prompt
  };

  const url = `${TTAPI_BASE_URL}/midjourney/v1/imagine`;
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
    console.log(`[Ttapi] Sending POST request to ${url}...`);
    const response = await fetch(url, options);
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
          errorMessage = `Ttapi API error: Rate limit exceeded. Please wait a moment and try again.`;
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
    const jobId = json.jobId || json.job_id || json.id || json.task_id;
    
    if (!jobId) {
      console.error(`[Ttapi] ❌ No job ID found in response. Full response:`, JSON.stringify(json, null, 2));
      console.error(`[Ttapi] Response keys:`, Object.keys(json));
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
    const response = await fetch(`${TTAPI_BASE_URL}/midjourney/v1/fetch?jobId=${jobId}`, options);
    
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
 */
const pollTaskUntilComplete = async (
  jobId: string,
  maxAttempts: number = 180,
  initialDelay: number = 3000
): Promise<string[]> => {
  let attempts = 0;
  let delay = initialDelay;
  const startTime = Date.now();

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

      // Check if task is completed
      if (status.status === 'completed' || status.status === 'success') {
        // Try to extract image URLs from various possible locations
        let imageUrls: string[] = [];

        // Check output.image_urls (array)
        if (status.output && typeof status.output === 'object' && !Array.isArray(status.output)) {
          if (Array.isArray(status.output.image_urls)) {
            imageUrls = status.output.image_urls;
          } else if (status.output.image_url) {
            imageUrls = [status.output.image_url];
          } else if (Array.isArray(status.output.images)) {
            imageUrls = status.output.images;
          } else if (status.output.image) {
            imageUrls = [status.output.image];
          } else if (status.output.url) {
            imageUrls = [status.output.url];
          } else if (Array.isArray(status.output.urls)) {
            imageUrls = status.output.urls;
          }
        }

        // Check result field
        if (imageUrls.length === 0 && status.result) {
          if (Array.isArray(status.result.images)) {
            imageUrls = status.result.images;
          } else if (status.result.image) {
            imageUrls = [status.result.image];
          } else if (status.result.url) {
            imageUrls = [status.result.url];
          } else if (Array.isArray(status.result.urls)) {
            imageUrls = status.result.urls;
          }
        }

        // Check top-level fields
        if (imageUrls.length === 0) {
          if (Array.isArray(status.images)) {
            imageUrls = status.images;
          } else if (status.image) {
            imageUrls = [status.image];
          } else if (status.url) {
            imageUrls = [status.url];
          } else if (Array.isArray(status.urls)) {
            imageUrls = status.urls;
          }
        }

        // Check data field
        if (imageUrls.length === 0 && status.data) {
          if (Array.isArray(status.data.images)) {
            imageUrls = status.data.images;
          } else if (status.data.image) {
            imageUrls = [status.data.image];
          } else if (status.data.url) {
            imageUrls = [status.data.url];
          } else if (Array.isArray(status.data.urls)) {
            imageUrls = status.data.urls;
          }
        }

        // If output is a string or array, try to use it directly
        if (imageUrls.length === 0 && typeof status.output === 'string') {
          imageUrls = [status.output];
        } else if (imageUrls.length === 0 && Array.isArray(status.output)) {
          imageUrls = status.output;
        }

        if (imageUrls.length > 0) {
          console.log(`[Ttapi] ✅ Task ${jobId} completed! Found ${imageUrls.length} images`);
          return imageUrls;
        } else {
          console.error(`[Ttapi] ❌ Job completed but no image URLs found in response. Full response:`, JSON.stringify(status, null, 2));
          console.error(`[Ttapi] Response keys:`, Object.keys(status));
          throw new Error('Job completed but no image URLs found in response. Check console for full API response structure.');
        }
      }

      // Check if task failed
      if (status.status === 'failed' || status.status === 'error') {
        const errorMsg = status.error || status.message || 'Unknown error';
        throw new Error(`Ttapi task failed: ${errorMsg}`);
      }

      // Diagnostic warnings for long-running tasks
      if (attempts === 30 && (status.status === 'pending' || status.status === 'processing')) {
        console.warn(`[Ttapi] ⚠️ Task ${jobId} has been ${status.status} for ${elapsed} minutes.`);
        console.warn(`[Ttapi] This is normal for Midjourney - generation can take 5-15 minutes depending on server load.`);
        console.warn(`[Ttapi] Check status manually: https://ttapi.io/dashboard or API: ${TTAPI_BASE_URL}/midjourney/v1/fetch?jobId=${jobId}`);
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
 */
const convertUrlsToBase64 = async (urls: string[]): Promise<string[]> => {
  const base64Promises = urls.map(async (url) => {
    try {
      // Use Vercel proxy to bypass CORS if needed
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
  });

  return Promise.all(base64Promises);
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
    
    // CRITICAL: Always append vintage junk journal constraints
    // STRICT: Vintage aesthetic, muted colors, aged paper, illustrated style, NOT realistic
    let strictConstraints: string;
    
    if (settings.colorIntensity === 'Muted' || settings.colorIntensity === 'Colorful') {
      // Vintage junk journal style
      const colorPalette = settings.colorIntensity === 'Muted' 
        ? 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors'
        : 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
      strictConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
    } else {
      // Multicolored: vivid, alive, modern - NO vintage
      strictConstraints = `vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
    }
    
    if (customPrompt) {
      prompt = `${prompt}. ${strictConstraints}`;
    } else {
      // Add strict constraints to constructed prompts too
      prompt = `${prompt} ${strictConstraints}`;
    }

    // Add aspect ratio to prompt if needed (ttapi may support this)
    // Note: ttapi uses Midjourney, so aspect ratio might need to be in the prompt
    if (aspectRatio && aspectRatio !== '1:1') {
      prompt += ` --ar ${aspectRatio}`;
    }

    console.log(`[Ttapi] Generating journal page with prompt: ${prompt.substring(0, 100)}...`);

    // Send task to ttapi.io
    const jobId = await sendTaskToTtapi(prompt);
    if (!jobId) {
      throw new Error('Failed to create ttapi.io task');
    }

    // Poll until complete - returns all image URLs
    const imageUrls = await pollTaskUntilComplete(jobId, 180, 5000);
    
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No images returned from ttapi.io');
    }

    // Convert URLs to base64
    console.log(`[Ttapi] Converting ${imageUrls.length} image(s) to base64...`);
    const base64Images = await convertUrlsToBase64(imageUrls);
    
    console.log(`[Ttapi] ✅ Successfully generated ${base64Images.length} image(s)`);
    return base64Images;
  } catch (error: any) {
    console.error(`[Ttapi] ❌ Error generating journal page:`, error);
    throw new Error(`Ttapi Image Generation Error: ${error.message || 'Unknown error occurred'}`);
  }
};

