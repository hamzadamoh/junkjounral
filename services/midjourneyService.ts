import { Theme, GenerationSettings } from '../types';

const GOAPI_BASE_URL = 'https://api.goapi.ai';

// Get API key from environment variable only
const getGoApiKey = (): string => {
  return import.meta.env.VITE_GOAPI_API_KEY || '';
};

interface GoApiTaskResponse {
  status: string;
  task_id?: string;
  message?: string;
}

interface GoApiTaskStatus {
  code: number;
  data: {
    status: string;
    progress?: number;
    output?: {
      image_urls: string[];
    };
    message?: string;
  };
  message?: string;
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

  // Construct the final detailed prompt
  // STRICT: Single page only, no scenes, no multiple objects arranged around
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. Digital junk journal page design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects.`;
  
  // Add seed for additional variation
  if (variationIndex !== undefined) {
    const seed = Math.floor(Math.random() * 1000000) + variationIndex * 1000;
    prompt += ` seed:${seed}`;
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
 * Sends a task to Go API Midjourney
 */
const sendTaskToGoApi = async (
  prompt: string,
  aspectRatio: string = '1:1',
  processMode: string = 'fast'
): Promise<string | null> => {
  const apiKey = getGoApiKey();
  if (!apiKey) {
    throw new Error('Go API key is not configured. Please set VITE_GOAPI_API_KEY in your environment variables.');
  }

  const data = {
    prompt: prompt,
    aspect_ratio: aspectRatio,
    process_mode: processMode,
    skip_prompt_check: true,
    webhook_endpoint: '',
    webhook_secret: '',
    notify_progress: true
  };

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  try {
    console.log(`[GoAPI] Creating task with prompt: ${prompt.substring(0, 100)}...`);
    const response = await fetch(`${GOAPI_BASE_URL}/mj/v2/imagine`, options);
    
    // Check response status before parsing
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GoAPI] HTTP ${response.status} error creating task:`, errorText);
      throw new Error(`GoAPI HTTP error: ${response.status} - ${errorText}`);
    }
    
    const json: GoApiTaskResponse = await response.json();
    console.log(`[GoAPI] Task creation response:`, JSON.stringify(json, null, 2));

    if (json.status === 'success' && json.task_id) {
      console.log(`[GoAPI] ✅ Task created successfully: ${json.task_id}`);
      return json.task_id;
    } else {
      const errorMsg = json.message || 'Failed to create task';
      console.error(`[GoAPI] ❌ Task creation failed:`, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    console.error('[GoAPI] Exception sending task to Go API:', error);
    throw new Error(error.message || 'Failed to send task to Go API');
  }
};

/**
 * Gets the status and result of a task from Go API
 */
const getTaskStatus = async (taskId: string): Promise<GoApiTaskStatus | null> => {
  const apiKey = getGoApiKey();
  if (!apiKey) {
    throw new Error('Go API key is not configured.');
  }

  const options: RequestInit = {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await fetch(`${GOAPI_BASE_URL}/api/v1/task/${taskId}`, options);
    
    // Check if response is ok before parsing
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GoAPI] HTTP ${response.status} error for task ${taskId}:`, errorText);
      throw new Error(`GoAPI HTTP error: ${response.status} - ${errorText}`);
    }
    
    const json: GoApiTaskStatus = await response.json();

    // Log response for debugging (but not the full JSON every time to reduce noise)
    if (json.code === 200) {
      console.log(`[GoAPI] Task ${taskId} status: ${json.data?.status || 'unknown'}, progress: ${json.data?.progress || 'N/A'}`);
      // Only log full response if status is unexpected
      if (json.data?.status && !['pending', 'processing', 'in_progress', 'queued', 'completed', 'succeeded', 'failed', 'error'].includes(json.data.status)) {
        console.log(`[GoAPI] Unexpected status response:`, JSON.stringify(json, null, 2));
      }
      return json;
    } else {
      console.error(`[GoAPI] Error response for task ${taskId}:`, JSON.stringify(json, null, 2));
      // Don't return null - throw with the actual error message
      throw new Error(`GoAPI error: ${json.code} - ${(json as any).message || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error(`[GoAPI] Exception in getTaskStatus for task ${taskId}:`, error);
    // Re-throw the error instead of returning null so we can see what went wrong
    throw error;
  }
};

/**
 * Polls for task completion with exponential backoff
 * Returns all image URLs from Midjourney (typically 4 variations)
 */
const pollTaskUntilComplete = async (
  taskId: string,
  onProgress?: (status: string) => void,
  maxAttempts: number = 180, // Increased to 180 attempts (about 15-30 minutes for slow generations)
  initialDelay: number = 5000 // Start with 5 seconds (Midjourney can be slow)
): Promise<string[]> => {
  let attempts = 0;
  let delay = initialDelay;
  const startTime = Date.now();

  console.log(`[GoAPI] Starting to poll task ${taskId}, max attempts: ${maxAttempts} (up to ~${Math.round((maxAttempts * delay) / 1000 / 60)} minutes)`);
  console.log(`[GoAPI] 💡 Tip: You can check task status manually at https://goapi.ai/dashboard or via API: GET https://api.goapi.ai/api/v1/task/${taskId}`);

  while (attempts < maxAttempts) {
    try {
      const status = await getTaskStatus(taskId);

      if (!status || !status.data) {
        console.error(`[GoAPI] Invalid status response for task ${taskId} on attempt ${attempts + 1}`);
        throw new Error('Invalid status response from GoAPI');
      }

      const currentStatus = status.data.status;
      const progress = status.data.progress;
      
      // More detailed logging with elapsed time
      const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
      console.log(`[GoAPI] Task ${taskId} (attempt ${attempts + 1}/${maxAttempts}, ${elapsedMinutes}m elapsed): status="${currentStatus}", progress=${progress || 'N/A'}%`);

      // Handle completed status - check multiple possible completion statuses
      if (currentStatus === 'completed' || currentStatus === 'succeeded' || currentStatus === 'done' || currentStatus === 'success') {
        // Check if images are available in output
        if (status.data.output?.image_urls && status.data.output.image_urls.length > 0) {
          console.log(`[GoAPI] ✅ Task ${taskId} completed! Found ${status.data.output.image_urls.length} images`);
          // Return ALL image URLs (Midjourney typically returns 4 variations)
          return status.data.output.image_urls;
        } 
        // Sometimes images might be in a different location - check the full response
        else {
          // Log the full response to see what we got
          console.warn(`[GoAPI] Task marked as ${currentStatus} but no images in output. Full response:`, JSON.stringify(status, null, 2));
          
          // Check if there are images elsewhere in the response
          const fullResponse = status as any;
          if (fullResponse.data?.images && Array.isArray(fullResponse.data.images)) {
            console.log(`[GoAPI] Found images in alternative location:`, fullResponse.data.images);
            return fullResponse.data.images.map((img: any) => typeof img === 'string' ? img : img.url || img.image_url);
          }
          
          throw new Error(`Task completed (status: ${currentStatus}) but no image URLs found in response`);
        }
      } 
      // Handle failed status
      else if (currentStatus === 'failed' || currentStatus === 'error') {
        const errorMsg = (status as any).message || `Task failed with status: ${currentStatus}`;
        console.error(`[GoAPI] ❌ Task ${taskId} failed:`, errorMsg);
        throw new Error(errorMsg);
      }
      // Handle in-progress statuses (pending, processing, etc.)
      else if (currentStatus === 'pending' || currentStatus === 'processing' || currentStatus === 'in_progress' || currentStatus === 'queued' || currentStatus === 'waiting' || currentStatus === 'running') {
        // Update progress if callback provided
        if (onProgress) {
          const progressMsg = progress ? `${currentStatus} (${progress}%)` : currentStatus;
          onProgress(progressMsg);
        }
        
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const elapsedMinutes = Math.round(elapsedSeconds / 60);
        
        // Special handling for tasks stuck in "pending" for too long
        if (currentStatus === 'pending' && elapsedSeconds > 900) { // 15 minutes
          // Check if there's an error in the response
          const fullResponse = status as any;
          if (fullResponse.error && fullResponse.error.message) {
            console.error(`[GoAPI] ❌ Task ${taskId} has error after ${elapsedMinutes} minutes:`, fullResponse.error.message);
            throw new Error(`Task error: ${fullResponse.error.message}`);
          }
          
          // If pending for > 15 minutes, it might be stuck - warn user
          if (attempts % 5 === 0) { // Every 5 attempts (about every 1-2 minutes)
            console.warn(`[GoAPI] ⚠️ Task ${taskId} has been PENDING for ${elapsedMinutes} minutes. This is unusually long.`);
            console.warn(`[GoAPI] The task may be stuck in queue. Check manually: https://goapi.ai/dashboard`);
            console.warn(`[GoAPI] Task details:`, JSON.stringify({
              task_id: taskId,
              status: currentStatus,
              process_mode: fullResponse.data?.process_mode,
              model_version: fullResponse.data?.model_version,
              is_using_private_pool: fullResponse.data?.is_using_private_pool,
              error: fullResponse.error
            }, null, 2));
          }
        }
        
        // If stuck in processing for a long time, provide helpful diagnostics
        if (elapsedSeconds > 300 && attempts % 10 === 0 && currentStatus !== 'pending') {
          console.warn(`[GoAPI] ⚠️ Task ${taskId} has been ${currentStatus} for ${elapsedMinutes} minutes.`);
          console.warn(`[GoAPI] This is normal for Midjourney - generation can take 5-15 minutes depending on server load.`);
          console.warn(`[GoAPI] Check status manually: https://goapi.ai/dashboard or API: https://api.goapi.ai/api/v1/task/${taskId}`);
        }
        
        // For pending status that's been waiting a long time, increase delay to avoid spamming
        if (currentStatus === 'pending' && elapsedSeconds > 600) { // 10 minutes
          delay = Math.min(delay * 1.2, 30000); // Slower polling, max 30 seconds
        } else {
          // Wait before next poll with exponential backoff (max 15 seconds)
          delay = Math.min(delay * 1.1, 15000);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } 
      // Unknown status - log it and continue (might be a new status we haven't seen)
      // But also check if it might actually be completed with images
      else {
        console.warn(`[GoAPI] ⚠️ Unknown status for task ${taskId}: "${currentStatus}". Full response:`, JSON.stringify(status, null, 2));
        
        // Check if images are present even with unknown status (some APIs return images before status updates)
        const fullResponse = status as any;
        if (fullResponse.data?.output?.image_urls && fullResponse.data.output.image_urls.length > 0) {
          console.log(`[GoAPI] ✅ Found images despite unknown status "${currentStatus}". Returning images.`);
          return fullResponse.data.output.image_urls;
        }
        if (fullResponse.data?.images && Array.isArray(fullResponse.data.images) && fullResponse.data.images.length > 0) {
          console.log(`[GoAPI] ✅ Found images in alternative location despite unknown status "${currentStatus}". Returning images.`);
          return fullResponse.data.images.map((img: any) => typeof img === 'string' ? img : img.url || img.image_url);
        }
        
        if (onProgress) {
          onProgress(currentStatus);
        }
        // For unknown statuses, wait a bit longer before retrying
        await new Promise(resolve => setTimeout(resolve, Math.max(delay, 5000)));
        delay = Math.min(delay * 1.1, 15000);
        attempts++;
      }
    } catch (error: any) {
      // If it's a network/API error, we might want to retry
      if (attempts < maxAttempts - 1 && (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('HTTP'))) {
        console.warn(`[GoAPI] Network/API error for task ${taskId}, retrying... (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay * 2)); // Wait longer on errors
        delay = Math.min(delay * 1.2, 20000); // Increase delay more on errors
        attempts++;
        continue;
      }
      // For other errors (like task failed), throw immediately
      throw error;
    }
  }

  const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
  throw new Error(`Task polling timeout after ${attempts} attempts (${elapsedMinutes} minutes elapsed). Task ${taskId} may still be processing. Check the GoAPI dashboard for status.`);
};

/**
 * Converts image URLs to base64 data URLs
 */
const convertUrlsToBase64 = async (imageUrls: string[]): Promise<string[]> => {
  const convertPromises = imageUrls.map(async (url) => {
    try {
      const imageResponse = await fetch(url);
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
 * Generates journal pages using Go API Midjourney
 * Returns all 4 images from Midjourney (one request = 4 variations)
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
    
    // CRITICAL: Always append flat printable page constraints to ensure no 3D photography
    // This is especially important for ChatGPT-generated prompts which might not include these constraints
    // STRICT: Single page only, no scenes, no multiple objects arranged around
    const strictConstraints = 'Digital junk journal page design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects.';
    
    if (customPrompt) {
      prompt = `${prompt}. ${strictConstraints}`;
    } else {
      // Add strict constraints to constructed prompts too
      prompt = `${prompt} ${strictConstraints}`;
    }

    // Send task to Go API
    const taskId = await sendTaskToGoApi(prompt, aspectRatio, processMode);

    if (!taskId) {
      throw new Error('Failed to create task');
    }

    // Poll for completion - returns all image URLs (typically 4)
    const imageUrls = await pollTaskUntilComplete(taskId, onProgress);

    // Convert all image URLs to base64 data URLs
    const base64Images = await convertUrlsToBase64(imageUrls);
    
    return base64Images;
  } catch (error: any) {
    console.error('Midjourney Image Generation Error:', error);
    throw error;
  }
};

