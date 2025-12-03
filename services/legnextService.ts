import { Theme, GenerationSettings } from '../types';

const LEGNEXT_BASE_URL = 'https://api.legnext.ai/api/v1';

// Get API key from environment variable only
const getLegnextApiKey = (): string => {
  return import.meta.env.VITE_LEGNEXT_API_KEY || '';
};

interface LegnextTaskResponse {
  jobId?: string;
  job_id?: string;
  id?: string;
  task_id?: string;
  status?: string;
  message?: string;
  [key: string]: any; // Allow other fields
}

interface LegnextJobStatus {
  status: string;
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

  // Get color palette based on color intensity setting
  const colorPalette = settings.colorIntensity === 'Muted' 
    ? 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors'
    : settings.colorIntensity === 'Colorful'
    ? 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'
    : 'wide range of colors (blues, greens, purples, warm accents like oranges and yellows, cool tones, various harmonious hues), multicolored vintage palette, watercolor-like color diversity, maintaining vintage charm, NOT modern bright colors, NOT neon colors';
  
  // Construct the final detailed prompt
  // STRICT: Vintage junk journal aesthetic - aged, distressed, illustrated style with overlays
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  
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
 * Sends a task to Legnext.ai Midjourney
 */
const sendTaskToLegnext = async (
  prompt: string
): Promise<string | null> => {
  const apiKey = getLegnextApiKey();
  if (!apiKey) {
    throw new Error('Legnext API key is not configured. Please set VITE_LEGNEXT_API_KEY in your environment variables.');
  }

  const data = {
    text: prompt,
    callback: '' // Optional callback URL
  };

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  try {
    console.log(`[Legnext] Creating task with prompt: ${prompt.substring(0, 100)}...`);
    const response = await fetch(`${LEGNEXT_BASE_URL}/diffusion`, options);
    
    // Check response status before parsing
    if (!response.ok) {
      let errorMessage = `Legnext HTTP error: ${response.status}`;
      let errorDetail = '';
      
      try {
        const errorJson = await response.json();
        console.error(`[Legnext] HTTP ${response.status} error creating task:`, JSON.stringify(errorJson, null, 2));
        
        // Handle specific error cases
        if (response.status === 402) {
          const quotaError = errorJson.error?.message || errorJson.message || 'insufficient quota';
          errorMessage = `Legnext API error: Insufficient quota. Your Legnext.ai account has no credits remaining or has exceeded its usage limit.`;
          errorDetail = `Please check your Legnext.ai account balance at https://legnext.ai/dashboard and add credits if needed. Error details: ${quotaError}`;
        } else if (response.status === 401) {
          errorMessage = `Legnext API error: Invalid API key. Please check that VITE_LEGNEXT_API_KEY is set correctly.`;
        } else if (response.status === 429) {
          errorMessage = `Legnext API error: Rate limit exceeded. Please wait a moment and try again.`;
        } else {
          errorDetail = errorJson.error?.message || errorJson.message || JSON.stringify(errorJson);
          errorMessage = `Legnext HTTP error: ${response.status} - ${errorDetail}`;
        }
      } catch (parseError) {
        const errorText = await response.text();
        console.error(`[Legnext] HTTP ${response.status} error (could not parse JSON):`, errorText);
        errorMessage = `Legnext HTTP error: ${response.status} - ${errorText}`;
      }
      
      const fullError = errorDetail ? `${errorMessage} ${errorDetail}` : errorMessage;
      throw new Error(fullError);
    }
    
    const json: LegnextTaskResponse = await response.json();
    console.log(`[Legnext] Task creation response:`, JSON.stringify(json, null, 2));

    // Try multiple possible field names for the job ID
    const jobId = json.jobId || json.job_id || json.id || json.task_id;
    
    if (jobId) {
      console.log(`[Legnext] ✅ Task created successfully: ${jobId}`);
      return jobId;
    } else {
      // Log the full response for debugging
      console.error(`[Legnext] ❌ Task creation failed - no jobId found in response. Full response:`, JSON.stringify(json, null, 2));
      const errorMsg = json.message || json.error?.message || 'Failed to create task - no job ID in response';
      throw new Error(`${errorMsg}. Please check the console for the full API response.`);
    }
  } catch (error: any) {
    console.error('[Legnext] Exception sending task to Legnext API:', error);
    // If error already has a detailed message, use it; otherwise provide generic message
    if (error.message && error.message.includes('Legnext')) {
      throw error;
    }
    throw new Error(error.message || 'Failed to send task to Legnext API');
  }
};

/**
 * Gets the status and result of a job from Legnext
 */
const getJobStatus = async (jobId: string): Promise<LegnextJobStatus | null> => {
  const apiKey = getLegnextApiKey();
  if (!apiKey) {
    throw new Error('Legnext API key is not configured.');
  }

  const options: RequestInit = {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await fetch(`${LEGNEXT_BASE_URL}/job/${jobId}`, options);
    
    // Check if response is ok before parsing
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Legnext] HTTP ${response.status} error for job ${jobId}:`, errorText);
      throw new Error(`Legnext HTTP error: ${response.status} - ${errorText}`);
    }
    
    const json: LegnextJobStatus = await response.json();
    return json;
  } catch (error: any) {
    console.error(`[Legnext] Exception in getJobStatus for job ${jobId}:`, error);
    throw error;
  }
};

/**
 * Polls for job completion with exponential backoff
 * Returns all image URLs from Legnext (typically 4 variations for Midjourney)
 */
const pollJobUntilComplete = async (
  jobId: string,
  onProgress?: (status: string) => void,
  maxAttempts: number = 180, // Up to 30 minutes
  initialDelay: number = 5000 // Start with 5 seconds
): Promise<string[]> => {
  let attempts = 0;
  let delay = initialDelay;
  const startTime = Date.now();

  console.log(`[Legnext] Starting to poll job ${jobId}, max attempts: ${maxAttempts} (up to ~${Math.round((maxAttempts * delay) / 1000 / 60)} minutes)`);
  console.log(`[Legnext] 💡 Tip: You can check job status manually at https://legnext.ai/dashboard or via API: GET ${LEGNEXT_BASE_URL}/job/${jobId}`);

  while (attempts < maxAttempts) {
    try {
      const status = await getJobStatus(jobId);

      if (!status) {
        console.error(`[Legnext] Invalid status response for job ${jobId} on attempt ${attempts + 1}`);
        throw new Error('Invalid status response from Legnext');
      }

      const currentStatus = status.status;
      const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
      console.log(`[Legnext] Job ${jobId} (attempt ${attempts + 1}/${maxAttempts}, ${elapsedMinutes}m elapsed): status="${currentStatus}"`);

      // Handle completed status
      if (currentStatus === 'completed' || currentStatus === 'success' || currentStatus === 'done') {
        // Check for images in multiple possible locations
        const images: string[] = [];
        
        // Try output.image_urls (array) - Legnext.ai format
        if (status.output && typeof status.output === 'object' && !Array.isArray(status.output)) {
          if (status.output.image_urls && Array.isArray(status.output.image_urls)) {
            images.push(...status.output.image_urls.filter(Boolean));
          }
          // Try output.image_url (single) - Legnext.ai format
          else if (status.output.image_url) {
            images.push(status.output.image_url);
          }
          // Try other output fields
          else if (status.output.images && Array.isArray(status.output.images)) {
            images.push(...status.output.images.filter(Boolean));
          } else if (status.output.image) {
            images.push(status.output.image);
          } else if (status.output.url) {
            images.push(status.output.url);
          } else if (status.output.urls && Array.isArray(status.output.urls)) {
            images.push(...status.output.urls.filter(Boolean));
          }
        }
        // Try output as string or array
        else if (status.output) {
          if (Array.isArray(status.output)) {
            images.push(...status.output.filter(Boolean));
          } else if (typeof status.output === 'string') {
            images.push(status.output);
          }
        }
        // Try result.images (array)
        else if (status.result?.images && Array.isArray(status.result.images)) {
          images.push(...status.result.images.filter(Boolean));
        }
        // Try result.image (single)
        else if (status.result?.image) {
          images.push(status.result.image);
        }
        // Try result.url (single)
        else if (status.result?.url) {
          images.push(status.result.url);
        }
        // Try result.urls (array)
        else if (status.result?.urls && Array.isArray(status.result.urls)) {
          images.push(...status.result.urls.filter(Boolean));
        }
        // Try root-level images (array)
        else if (status.images && Array.isArray(status.images)) {
          images.push(...status.images.filter(Boolean));
        }
        // Try root-level image (single)
        else if (status.image) {
          images.push(status.image);
        }
        // Try root-level url (single)
        else if (status.url) {
          images.push(status.url);
        }
        // Try root-level urls (array)
        else if (status.urls && Array.isArray(status.urls)) {
          images.push(...status.urls.filter(Boolean));
        }
        // Try data.images, data.image, data.url, data.urls
        else if (status.data) {
          if (status.data.images && Array.isArray(status.data.images)) {
            images.push(...status.data.images.filter(Boolean));
          } else if (status.data.image) {
            images.push(status.data.image);
          } else if (status.data.url) {
            images.push(status.data.url);
          } else if (status.data.urls && Array.isArray(status.data.urls)) {
            images.push(...status.data.urls.filter(Boolean));
          }
        }
        
        if (images.length > 0) {
          console.log(`[Legnext] ✅ Job ${jobId} completed! Found ${images.length} images`);
          return images;
        } else {
          // Log the full response for debugging
          console.error(`[Legnext] ❌ Job completed but no images found. Full response:`, JSON.stringify(status, null, 2));
          console.error(`[Legnext] Response keys:`, Object.keys(status));
          if (status.result) {
            console.error(`[Legnext] Result keys:`, Object.keys(status.result));
          }
          throw new Error('Job completed but no image URLs found in response. Check console for full API response structure.');
        }
      } 
      // Handle failed status
      else if (currentStatus === 'failed' || currentStatus === 'error') {
        const errorMsg = status.error || status.message || `Job failed with status: ${currentStatus}`;
        console.error(`[Legnext] ❌ Job ${jobId} failed:`, errorMsg);
        throw new Error(errorMsg);
      }
      // Handle in-progress statuses
      else if (currentStatus === 'pending' || currentStatus === 'processing' || currentStatus === 'in_progress' || currentStatus === 'queued' || currentStatus === 'waiting' || currentStatus === 'running') {
        // Update progress if callback provided
        if (onProgress) {
          onProgress(currentStatus);
        }
        
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        
        // Special handling for long-running jobs
        if (elapsedSeconds > 600 && attempts % 5 === 0) {
          const elapsedMinutes = Math.round(elapsedSeconds / 60);
          console.warn(`[Legnext] ⚠️ Job ${jobId} has been ${currentStatus.toUpperCase()} for ${elapsedMinutes} minutes.`);
          console.warn(`[Legnext] This can happen during high server load. Check manually: https://legnext.ai/dashboard`);
        }
        
        // Wait before next poll with exponential backoff
        if (currentStatus === 'pending' && elapsedSeconds > 600) {
          delay = Math.min(delay * 1.2, 30000); // Slower polling for long-pending jobs
        } else {
          delay = Math.min(delay * 1.1, 15000);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } 
      // Unknown status - log it and continue
      else {
        console.warn(`[Legnext] ⚠️ Unknown status for job ${jobId}: "${currentStatus}". Full response:`, JSON.stringify(status, null, 2));
        
        // Check if images are present even with unknown status
        if (status.result?.images && Array.isArray(status.result.images) && status.result.images.length > 0) {
          console.log(`[Legnext] ✅ Found images despite unknown status "${currentStatus}". Returning images.`);
          return status.result.images;
        }
        if (status.result?.image) {
          console.log(`[Legnext] ✅ Found image despite unknown status "${currentStatus}". Returning image.`);
          return [status.result.image];
        }
        
        if (onProgress) {
          onProgress(currentStatus);
        }
        await new Promise(resolve => setTimeout(resolve, Math.max(delay, 5000)));
        delay = Math.min(delay * 1.1, 15000);
        attempts++;
      }
    } catch (error: any) {
      // If it's a network/API error, we might want to retry
      if (attempts < maxAttempts - 1 && (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('HTTP'))) {
        console.warn(`[Legnext] Network/API error for job ${jobId}, retrying... (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay * 2));
        delay = Math.min(delay * 1.2, 20000);
        attempts++;
        continue;
      }
      throw error;
    }
  }

  const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
  throw new Error(`Job polling timeout after ${attempts} attempts (${elapsedMinutes} minutes elapsed). Job ${jobId} may still be processing. Check the Legnext dashboard for status.`);
};

/**
 * Converts image URLs to base64 data URLs
 * Uses Vercel serverless function proxy to bypass CORS restrictions
 */
const convertUrlsToBase64 = async (imageUrls: string[]): Promise<string[]> => {
  const convertPromises = imageUrls.map(async (url) => {
    try {
      // Use Vercel serverless function to proxy the image request
      // This bypasses CORS restrictions
      const proxyUrl = `/api/legnext/image?url=${encodeURIComponent(url)}`;
      const imageResponse = await fetch(proxyUrl);
      
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image via proxy: ${imageResponse.status} ${imageResponse.statusText}`);
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
 * Generates journal pages using Legnext.ai Midjourney
 * Returns all images from Legnext (typically 4 variations for Midjourney)
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
  try {
    // Use custom prompt if provided (from ChatGPT), otherwise construct one
    let prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
    
    // CRITICAL: Always append vintage junk journal constraints
    // STRICT: Vintage aesthetic, muted colors, aged paper, illustrated style, NOT realistic
    const colorPalette = settings.colorIntensity === 'Muted' 
      ? 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors'
      : settings.colorIntensity === 'Colorful'
      ? 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'
      : 'wide range of colors (blues, greens, purples, warm accents like oranges and yellows, cool tones, various harmonious hues), multicolored vintage palette, watercolor-like color diversity, maintaining vintage charm, NOT modern bright colors, NOT neon colors';
    const strictConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
    
    if (customPrompt) {
      prompt = `${prompt}. ${strictConstraints}`;
    } else {
      // Add strict constraints to constructed prompts too
      prompt = `${prompt} ${strictConstraints}`;
    }

    // Add aspect ratio to prompt if needed (Legnext may support this)
    // Note: Legnext uses Midjourney, so aspect ratio might need to be in the prompt
    if (aspectRatio && aspectRatio !== '1:1') {
      prompt += ` --ar ${aspectRatio}`;
    }

    // Send task to Legnext
    const jobId = await sendTaskToLegnext(prompt);

    if (!jobId) {
      throw new Error('Failed to create job');
    }

    // Poll for completion - returns all image URLs
    const imageUrls = await pollJobUntilComplete(jobId, onProgress);

    // Convert all image URLs to base64 data URLs
    const base64Images = await convertUrlsToBase64(imageUrls);
    
    return base64Images;
  } catch (error: any) {
    console.error('Legnext Image Generation Error:', error);
    throw error;
  }
};

