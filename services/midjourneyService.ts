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
    queue_position?: number;
    estimated_wait_time?: number;
    process_mode?: string;
    is_using_private_pool?: boolean;
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
      // Remove any trailing periods before adding seed to prevent "853924." error
      prompt = prompt.replace(/\.\s*$/, '');
      prompt += ` seed:${seed}`;
    }
    
    // Add additional parameters if provided
    if (parametersForMJ) {
      prompt += ` ${parametersForMJ}`;
    }
    
    return prompt;
  }
  
  // Get color palette and style based on color intensity setting
  let colorPalette: string;
  let styleConstraints: string;
  
  if (settings.colorIntensity === 'Muted') {
    colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
    styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  } else if (settings.colorIntensity === 'Normal') {
    colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
    styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  } else if (settings.colorIntensity === 'Colorful') {
    colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
    styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  } else {
    // Multicolored: vivid, alive, modern - NO vintage/junk journal
    colorPalette = 'vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors';
    styleConstraints = `${colorPalette}, modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
  }
  
  // Construct the final detailed prompt
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. ${styleConstraints}`;
  
  // Add seed for additional variation
  if (variationIndex !== undefined && typeof variationIndex === 'number') {
    const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
    // Remove any trailing periods before adding seed to prevent "853924." error
    prompt = prompt.replace(/\.\s*$/, '');
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
 * Cleans prompt for Midjourney by removing newlines and problematic characters
 * Midjourney interprets newlines and certain characters as parameter separators
 */
const cleanPromptForMidjourney = (prompt: string): string => {
  if (!prompt) return '';
  
  // Remove PRIMARY SUBJECT header if present (Midjourney doesn't need it)
  let cleaned = prompt.replace(/^PRIMARY SUBJECT:\s*/i, '').trim();
  
  // Replace all newlines with spaces
  cleaned = cleaned.replace(/\n+/g, ' ');
  
  // Replace multiple spaces with single space
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove triple dashes (---) which Midjourney might interpret as parameters
  cleaned = cleaned.replace(/---+/g, '');
  
  // Remove any trailing periods before parameters
  cleaned = cleaned.replace(/\.\s*$/, '');
  
  return cleaned.trim();
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

  // Clean the prompt before sending to Midjourney
  // Remove newlines and problematic characters that Midjourney interprets as parameters
  const cleanedPrompt = cleanPromptForMidjourney(prompt);

  const data = {
    prompt: cleanedPrompt,
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
    console.log(`[GoAPI] Creating task with prompt: ${cleanedPrompt.substring(0, 100)}...`);
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

    // Log response for debugging
    if (json.code === 200) {
      const statusValue = json.data?.status || 'unknown';
      const progressValue = json.data?.progress || 'N/A';
      const queuePosition = json.data?.queue_position;
      const estimatedWait = json.data?.estimated_wait_time;
      const processMode = json.data?.process_mode;
      const privatePool = json.data?.is_using_private_pool;
      
      // Build status message with additional info
      let statusMsg = `[GoAPI] Task ${taskId} status: ${statusValue}`;
      if (progressValue !== 'N/A') statusMsg += `, progress: ${progressValue}%`;
      if (queuePosition !== undefined) statusMsg += `, queue position: ${queuePosition}`;
      if (estimatedWait !== undefined) statusMsg += `, estimated wait: ${estimatedWait}s`;
      if (processMode) statusMsg += `, mode: ${processMode}`;
      if (privatePool !== undefined) statusMsg += `, private pool: ${privatePool}`;
      console.log(statusMsg);
      
      // Log full response periodically or if status is unexpected to help debug
      const shouldLogFull = !['pending', 'processing', 'in_progress', 'queued', 'completed', 'succeeded', 'failed', 'error'].includes(statusValue);
      if (shouldLogFull) {
        console.log(`[GoAPI] Unexpected status "${statusValue}". Full response:`, JSON.stringify(json, null, 2));
      }
      
      // Also check if there are images even if status doesn't say completed
      // Sometimes GoAPI returns images before status updates
      if (json.data?.output?.image_urls && json.data.output.image_urls.length > 0) {
        // If we have images but status is still pending/processing, treat it as completed
        if (statusValue === 'pending' || statusValue === 'processing' || statusValue === 'in_progress') {
          console.log(`[GoAPI] ✅ Found images in response but status is still "${statusValue}". Images: ${json.data.output.image_urls.length}. Treating as completed.`);
          // Update the status in the response to reflect completion
          json.data.status = 'completed';
        } else if (statusValue === 'completed' || statusValue === 'succeeded') {
          // Normal case - status is completed and images are present
          console.log(`[GoAPI] ✅ Task completed with ${json.data.output.image_urls.length} images`);
        }
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
      // Also check if images are available even if status is still "pending" or "processing"
      // (Sometimes GoAPI returns images before status updates)
      const hasImages = status.data.output?.image_urls && status.data.output.image_urls.length > 0;
      const isCompletedStatus = currentStatus === 'completed' || currentStatus === 'succeeded' || currentStatus === 'done' || currentStatus === 'success';
      
      if (isCompletedStatus || hasImages) {
        // Check if images are available in output
        if (hasImages) {
          if (!isCompletedStatus) {
            console.log(`[GoAPI] ✅ Task ${taskId} has images available (status: ${currentStatus}). Treating as completed.`);
          } else {
            console.log(`[GoAPI] ✅ Task ${taskId} completed! Found ${status.data.output.image_urls.length} images`);
          }
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
        // Check multiple possible error message locations
        const errorMsg = status.data?.error || 
                        status.data?.error_message || 
                        status.data?.message || 
                        (status as any).message || 
                        (status as any).error ||
                        `Task failed with status: ${currentStatus}`;
        console.error(`[GoAPI] ❌ Task ${taskId} failed:`, errorMsg);
        console.error(`[GoAPI] Full failed task response:`, JSON.stringify(status, null, 2));
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
        
        // Special handling for tasks stuck in "pending" or "processing" for too long
        const fullResponse = status as any;
        const queuePosition = fullResponse.data?.queue_position;
        const estimatedWait = fullResponse.data?.estimated_wait_time;
        const processMode = fullResponse.data?.process_mode;
        
        if ((currentStatus === 'pending' || currentStatus === 'processing') && elapsedSeconds > 600) { // 10 minutes
          // Check if there's an error in the response
          if (fullResponse.error && fullResponse.error.message) {
            console.error(`[GoAPI] ❌ Task ${taskId} has error after ${elapsedMinutes} minutes:`, fullResponse.error.message);
            throw new Error(`Task error: ${fullResponse.error.message}`);
          }
          
          // If processing for > 10 minutes, provide detailed info
          if (attempts % 5 === 0) { // Every 5 attempts (about every 1-2 minutes)
            console.warn(`[GoAPI] ⚠️ Task ${taskId} has been ${currentStatus.toUpperCase()} for ${elapsedMinutes} minutes.`);
            
            if (queuePosition !== undefined) {
              console.warn(`[GoAPI] Queue position: ${queuePosition}${estimatedWait ? `, estimated wait: ${estimatedWait}s` : ''}`);
            }
            
            if (processMode === 'fast') {
              console.warn(`[GoAPI] Using "fast" mode - if your Fast GPU time is exhausted, tasks may queue longer.`);
            }
            
            console.warn(`[GoAPI] This can happen during high server load. Check manually: https://goapi.ai/dashboard`);
            console.warn(`[GoAPI] Task details:`, JSON.stringify({
              task_id: taskId,
              status: currentStatus,
              process_mode: processMode,
              queue_position: queuePosition,
              estimated_wait_time: estimatedWait,
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
    
    // CRITICAL: Handle Custom / Override mode - trust ChatGPT prompt entirely, only add aspect ratio
    if (settings.colorIntensity === 'Custom / Override') {
      // For Custom / Override: Only add aspect ratio, DO NOT add any style constraints
      // Trust the ChatGPT prompt entirely
      // Note: Aspect ratio will be added after style reference if present
    } else {
      // For other modes: Append constraints based on color intensity
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
      
      if (customPrompt) {
        prompt = `${prompt}. ${strictConstraints}`;
      } else {
        // Add strict constraints to constructed prompts too
        prompt = `${prompt} ${strictConstraints}`;
      }
    }

    // MAXIMUM style reference influence - force Midjourney to follow reference style
    // Skip style reference if skipStyleReference flag is set (e.g., Image Theme Expansion mode - rely on detailed prompt only)
    if (!settings.skipStyleReference && settings.styleRefUrl && settings.styleRefUrl.trim()) {
      prompt += ` --sref ${settings.styleRefUrl.trim()} --sw 1000`;
      console.log(`[Midjourney] Added MAXIMUM style reference (--sw 1000) for variation ${variationIndex ?? 0}: ${settings.styleRefUrl}`);
    } else if (settings.skipStyleReference) {
      console.log(`[Midjourney] Skipping style reference URL - relying on detailed prompt only for variation ${variationIndex ?? 0}`);
    }

    // Add aspect ratio last (after style reference if present)
    if (aspectRatio && aspectRatio !== '1:1' && !prompt.includes('--ar')) {
      prompt += ` --ar ${aspectRatio}`;
    }

    // Clean the prompt before sending to remove newlines and problematic characters
    // This prevents Midjourney from interpreting newlines as parameter separators
    prompt = cleanPromptForMidjourney(prompt);

    // Log the EXACT prompt being sent to Midjourney for debugging
    console.log(`[Midjourney] FULL PROMPT BEING SENT: "${prompt}"`);
    console.log(`[Midjourney] Full request body:`, JSON.stringify({
      prompt: prompt,
      aspect_ratio: aspectRatio,
      process_mode: processMode,
      skip_prompt_check: true
    }, null, 2));

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

