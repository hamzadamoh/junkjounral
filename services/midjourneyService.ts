import { Theme, GenerationSettings } from '../types';

const GOAPI_BASE_URL = 'https://api.goapi.ai';

// Get API key from localStorage first, then fall back to environment variable
const getGoApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('api_key_goapi');
    if (stored) return stored;
  }
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
    output?: {
      image_urls: string[];
    };
  };
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
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page.`;
  
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
    throw new Error('Go API key is not configured. Please set it in the API Keys Configuration section.');
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
    const response = await fetch(`${GOAPI_BASE_URL}/mj/v2/imagine`, options);
    const json: GoApiTaskResponse = await response.json();

    if (json.status === 'success' && json.task_id) {
      return json.task_id;
    } else {
      throw new Error(json.message || 'Failed to create task');
    }
  } catch (error: any) {
    console.error('Error sending task to Go API:', error);
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
      'X-API-KEY': GOAPI_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await fetch(`${GOAPI_BASE_URL}/api/v1/task/${taskId}`, options);
    const json: GoApiTaskStatus = await response.json();

    if (json.code === 200) {
      // Log the full response for debugging
      console.log(`Task ${taskId} response:`, JSON.stringify(json, null, 2));
      return json;
    } else {
      console.error('Error from Go API:', json);
      return null;
    }
  } catch (error: any) {
    console.error('Exception in getTaskStatus:', error);
    return null;
  }
};

/**
 * Polls for task completion with exponential backoff
 */
const pollTaskUntilComplete = async (
  taskId: string,
  onProgress?: (status: string) => void,
  maxAttempts: number = 120, // Increased to 120 attempts (about 10-20 minutes)
  initialDelay: number = 3000 // Start with 3 seconds
): Promise<string> => {
  let attempts = 0;
  let delay = initialDelay;

  console.log(`Starting to poll task ${taskId}, max attempts: ${maxAttempts}`);

  while (attempts < maxAttempts) {
    const status = await getTaskStatus(taskId);

    if (!status) {
      console.error(`Failed to get status for task ${taskId} on attempt ${attempts + 1}`);
      throw new Error('Failed to get task status');
    }

    const currentStatus = status.data.status;
    console.log(`Task ${taskId} status (attempt ${attempts + 1}/${maxAttempts}): ${currentStatus}`);

    // Handle completed status
    if (currentStatus === 'completed' || currentStatus === 'succeeded') {
      if (status.data.output?.image_urls && status.data.output.image_urls.length > 0) {
        console.log(`Task ${taskId} completed! Image URL: ${status.data.output.image_urls[0]}`);
        return status.data.output.image_urls[0];
      } else {
        throw new Error('Task completed but no image URL found');
      }
    } 
    // Handle failed status
    else if (currentStatus === 'failed' || currentStatus === 'error') {
      throw new Error(`Task failed with status: ${currentStatus}`);
    }
    // Handle in-progress statuses (pending, processing, etc.)
    else if (currentStatus === 'pending' || currentStatus === 'processing' || currentStatus === 'in_progress' || currentStatus === 'queued') {
      // Update progress if callback provided
      if (onProgress) {
        onProgress(currentStatus);
      }
      
      // Wait before next poll with exponential backoff (max 15 seconds)
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.1, 15000); // Slower backoff, max 15 seconds
      attempts++;
    } 
    // Unknown status - log it and continue
    else {
      console.warn(`Unknown status for task ${taskId}: ${currentStatus}`);
      if (onProgress) {
        onProgress(currentStatus);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.1, 15000);
      attempts++;
    }
  }

  throw new Error(`Task polling timeout after ${maxAttempts} attempts (approximately ${Math.round((maxAttempts * delay) / 1000 / 60)} minutes)`);
};

/**
 * Generates a journal page using Go API Midjourney
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
): Promise<string> => {
  try {
    // Use custom prompt if provided (from ChatGPT), otherwise construct one
    const prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);

    // Send task to Go API
    const taskId = await sendTaskToGoApi(prompt, aspectRatio, processMode);

    if (!taskId) {
      throw new Error('Failed to create task');
    }

    // Poll for completion
    const imageUrl = await pollTaskUntilComplete(taskId, onProgress);

    // Convert the image URL to a data URL for consistency with the app
    // First, fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const blob = await imageResponse.blob();
    
    return new Promise((resolve, reject) => {
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
  } catch (error: any) {
    console.error('Midjourney Image Generation Error:', error);
    throw error;
  }
};

