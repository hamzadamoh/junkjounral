import { Theme, GenerationSettings } from '../types';

// Get API key from environment variable only
const getReplicateApiKey = (): string => {
  return import.meta.env.VITE_REPLICATE_API_KEY || '';
};

// CORS proxy for browser requests (Replicate API doesn't allow direct browser access)
// IMPORTANT: Most public CORS proxies strip Authorization headers
// For production, use a backend proxy server (see REPLICATE_PROXY_SOLUTION.md)
// For now, we'll try direct fetch first, then fallback to proxies
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

// Check if we have a custom backend proxy URL (set via environment variable)
const BACKEND_PROXY_URL = import.meta.env.VITE_REPLICATE_PROXY_URL || '';

// Alternative: Use a proxy that supports custom headers via query params
// This is a workaround since most proxies strip Authorization headers
const createProxiedRequest = async (url: string, options: RequestInit, apiKey: string): Promise<Response> => {
  // For POST requests, we need to include auth in a way the proxy can forward it
  // Since proxies strip headers, we'll try embedding it in the request body metadata
  // But Replicate doesn't support this, so we need a proxy that forwards headers
  
  // Try allorigins.win with proper header forwarding
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        // allorigins might forward these
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: options.body,
    });
    
    if (response.ok) {
      // Check if the response is actually from Replicate or an error from the proxy
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        // If it's a Replicate error about auth, the header wasn't forwarded
        if (json.detail && json.detail.includes('authentication token')) {
          throw new Error('Proxy did not forward Authorization header');
        }
        // Return a new Response with the parsed JSON
        return new Response(text, { status: response.status, headers: response.headers });
      } catch (e) {
        return new Response(text, { status: response.status, headers: response.headers });
      }
    }
    return response;
  } catch (e) {
    throw e;
  }
};

// Function to create a timeout signal
const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

// Function to try fetching with CORS proxy
const fetchWithCorsProxy = async (url: string, options: RequestInit = {}, proxyIndex: number = 0): Promise<Response> => {
  const errors: string[] = [];
  const timeoutMs = 30000; // 30 second timeout
  
  // Try direct fetch first (might work for some endpoints)
  try {
    const directResponse = await fetch(url, {
      ...options,
      signal: createTimeoutSignal(timeoutMs)
    } as RequestInit);
    if (directResponse.ok) {
      return directResponse;
    }
    errors.push(`Direct fetch returned ${directResponse.status}`);
  } catch (e: any) {
    // Direct fetch failed, try proxy
    if (e.name !== 'AbortError') {
      errors.push(`Direct fetch failed: ${e.message}`);
    }
  }

  // Try with CORS proxy
  // Note: Most CORS proxies don't forward Authorization headers for security reasons
  // We need to pass the auth token in the URL or request body for some proxies
  for (let i = proxyIndex; i < CORS_PROXIES.length; i++) {
    try {
      const proxy = CORS_PROXIES[i];
      let proxyUrl: string;
      let proxyOptions: RequestInit = {
        ...options,
        signal: createTimeoutSignal(timeoutMs)
      };
      
      // Handle different proxy formats
      if (proxy.includes('allorigins.win')) {
        // allorigins.win supports headers via X-Requested-With
        proxyUrl = proxy + encodeURIComponent(url);
        proxyOptions.headers = {
          ...options.headers,
          'X-Requested-With': 'XMLHttpRequest'
        };
      } else if (proxy.includes('corsproxy.io')) {
        // corsproxy.io - try to include auth in URL if it's a GET, or keep headers for POST
        proxyUrl = proxy + encodeURIComponent(url);
        // For POST requests, try to keep headers
        if (options.method === 'POST' && options.headers) {
          proxyOptions.headers = options.headers;
        }
      } else {
        // Other proxies
        proxyUrl = proxy + encodeURIComponent(url);
        // Try to keep headers
        proxyOptions.headers = options.headers;
      }
      
      const response = await fetch(proxyUrl, proxyOptions);
      
      if (response.ok) {
        return response;
      }
      
      // Check if it's an auth error from Replicate (not the proxy)
      const responseText = await response.text().catch(() => '');
      if (responseText.includes('Unauthenticated') || responseText.includes('authentication token')) {
        errors.push(`Proxy ${i + 1} (${proxy}) - Auth header not forwarded (Replicate returned 401)`);
      } else {
        errors.push(`Proxy ${i + 1} (${proxy}) returned ${response.status}`);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        errors.push(`Proxy ${i + 1} (${CORS_PROXIES[i]}) failed: ${e.message}`);
      }
      // Continue to next proxy
    }
  }
  
  throw new Error(`All CORS proxy attempts failed. Errors: ${errors.join('; ')}`);
};

interface ReplicateResponse {
  output?: string | string[];
  error?: string;
  status?: string;
}

/**
 * Converts aspect ratio string to width and height
 * Replicate models have a maximum dimension of 1440px
 * Many models require dimensions to be multiples of 64 or 128
 */
const getAspectRatioDimensions = (aspectRatio: string): { width: number; height: number } => {
  const MAX_DIMENSION = 1440;
  const MULTIPLE = 64; // Most Replicate models require dimensions to be multiples of 64
  
  const ratios: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },   // 1344x768 (multiple of 64, maintains 16:9)
    '9:16': { width: 768, height: 1344 },   // 768x1344 (multiple of 64, maintains 9:16)
    '4:3': { width: 1280, height: 960 },     // 1280x960 (multiple of 64, maintains 4:3)
    '3:4': { width: 960, height: 1280 },     // 960x1280 (multiple of 64, maintains 3:4)
    '21:9': { width: 1344, height: 576 },    // 1344x576 (multiple of 64, maintains 21:9)
  };
  
  const dimensions = ratios[aspectRatio] || ratios['1:1'];
  
  // Ensure both dimensions are within limits and are multiples of MULTIPLE
  let { width, height } = dimensions;
  
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  
  // Round to nearest multiple of MULTIPLE
  width = Math.round(width / MULTIPLE) * MULTIPLE;
  height = Math.round(height / MULTIPLE) * MULTIPLE;
  
  // Ensure minimum size
  width = Math.max(width, 512);
  height = Math.max(height, 512);
  
  return { width, height };
};

/**
 * Generates a journal page using Replicate API
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
  const apiKey = getReplicateApiKey();
  if (!apiKey) {
    throw new Error('Replicate API key is not configured. Please set VITE_REPLICATE_API_KEY in your environment variables.');
  }

  try {
    // Use custom prompt if provided (from ChatGPT), otherwise construct one
    const prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
    const { width, height } = getAspectRatioDimensions(aspectRatio);

    // Get the model from settings
    const model = settings.replicateModel || 'black-forest-labs/flux-1.1-pro';

    if (onProgress) {
      onProgress('generating');
    }

    console.log(`[Replicate] Generating image ${variationIndex !== undefined ? variationIndex + 1 : ''} with model: ${model}`);
    console.log(`[Replicate] Aspect ratio: ${aspectRatio}`);

    // Get model-specific parameters first
    const modelParams = getModelSpecificParams(model, variationIndex);
    
    // Build input parameters
    // Flux models use aspect_ratio string instead of width/height
    const inputParams: Record<string, any> = {
      prompt: prompt,
      ...modelParams
    };
    
    // For Flux models, use aspect_ratio parameter
    if (model.includes('flux')) {
      inputParams.aspect_ratio = aspectRatio;
      // Remove width/height if they were added by modelParams
      delete inputParams.width;
      delete inputParams.height;
    } else {
      // For other models, use width/height
      inputParams.width = width;
      inputParams.height = height;
    }
    
    console.log('[Replicate] Input params:', JSON.stringify(inputParams, null, 2));
    
    // For Flux models, use model name directly; for others, try to get version ID
    let modelIdentifier: string;
    if (model.includes('flux')) {
      // Use model name directly for Flux models
      modelIdentifier = model;
    } else {
      // Try to get version ID for other models
      modelIdentifier = await getModelVersion(model);
    }
    
    console.log('[Replicate] Creating prediction...');
    console.log('[Replicate] API Key present:', apiKey ? 'Yes' : 'No');
    console.log('[Replicate] Model:', model);
    
    // Try different approaches in order:
    // 1. Backend proxy (if configured)
    // 2. Direct fetch (might work in some browsers)
    // 3. Public CORS proxy (will likely fail due to auth header stripping)
    
    let response: Response | null = null;
    let lastError: Error | null = null;
    
    // Option 1: Use backend proxy if configured
    if (BACKEND_PROXY_URL) {
      try {
        console.log('[Replicate] Using backend proxy:', BACKEND_PROXY_URL);
        response = await fetch(`${BACKEND_PROXY_URL}/v1/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: modelIdentifier,
            input: inputParams
          })
        });
        
        if (response.ok) {
          console.log('[Replicate] Backend proxy succeeded!');
        } else {
          console.log('[Replicate] Backend proxy failed with status:', response.status);
        }
      } catch (error: any) {
        console.warn('[Replicate] Backend proxy error:', error.message);
        lastError = error;
      }
    }
    
    // Option 2: Try direct fetch
    if (!response || !response.ok) {
      try {
        console.log('[Replicate] Attempting direct fetch...');
        response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: modelIdentifier,
            input: inputParams
          })
        });
        
        if (response.ok) {
          console.log('[Replicate] Direct fetch succeeded!');
        } else {
          console.log('[Replicate] Direct fetch failed with status:', response.status);
          lastError = new Error(`Direct fetch returned ${response.status}`);
        }
      } catch (error: any) {
        console.log('[Replicate] Direct fetch CORS error (expected):', error.message);
        lastError = error;
      }
    }
    
    // Option 3: Try public CORS proxy (will likely fail due to auth header stripping)
    if (!response || !response.ok) {
      try {
        console.log('[Replicate] Trying public CORS proxy (may fail due to auth header stripping)...');
        response = await fetchWithCorsProxy('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: modelIdentifier,
            input: inputParams
          })
        });
        console.log('[Replicate] CORS proxy fetch completed, status:', response.status);
      } catch (error: any) {
        console.error('[Replicate] CORS proxy failed:', error);
        lastError = error;
      }
    }
    
    // If all attempts failed
    if (!response || !response.ok) {
      const errorMsg = lastError?.message || 'All fetch attempts failed';
      if (errorMsg.includes('Unauthenticated') || errorMsg.includes('authentication token')) {
        throw new Error(`Replicate authentication failed: Public CORS proxies strip Authorization headers. To use Replicate from the browser, you need a backend proxy server. See REPLICATE_PROXY_SOLUTION.md for setup instructions. Alternatively, use Pollinations (free, no API key) which works directly from browsers.`);
      }
      throw new Error(`Failed to create Replicate prediction: ${errorMsg}`);
    }
    
    if (!response) {
      throw new Error('No response received from Replicate API');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[Replicate] API error response:', errorText);
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON
      }
      throw new Error(`Replicate API error: ${response.status} ${errorData.detail || response.statusText || errorText}`);
    }

    let prediction: ReplicateResponse & { id?: string };
    try {
      const responseText = await response.text();
      console.log('[Replicate] Prediction response:', responseText.substring(0, 200));
      prediction = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('[Replicate] Failed to parse prediction response:', parseError);
      throw new Error('Failed to parse Replicate API response');
    }
    
    if (prediction.error) {
      console.error('[Replicate] Prediction error:', prediction.error);
      throw new Error(`Replicate error: ${prediction.error}`);
    }

    if (!prediction.id) {
      console.error('[Replicate] No prediction ID in response:', prediction);
      throw new Error('No prediction ID returned from Replicate');
    }

    console.log(`[Replicate] Prediction created with ID: ${prediction.id}, starting to poll...`);

    // Poll for completion
    const imageUrl = await pollReplicatePrediction(prediction.id, onProgress);
    
    console.log(`[Replicate] Prediction ${prediction.id} completed, image URL: ${imageUrl.substring(0, 50)}...`);

    console.log(`Fetching image from URL: ${imageUrl}`);

    // Convert the image URL to a data URL
    // Try direct fetch first, if CORS fails, use proxy
    let imageResponse: Response;
    try {
      imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
    } catch (error: any) {
      // If direct fetch fails (CORS), try with proxy
      console.warn('Direct fetch failed, trying with CORS proxy:', error.message);
      try {
        imageResponse = await fetchWithCorsProxy(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image via proxy: ${imageResponse.status}`);
        }
      } catch (proxyError: any) {
        throw new Error(`Failed to fetch image: ${error.message} (proxy also failed: ${proxyError.message})`);
      }
    }
    
    const blob = await imageResponse.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if (onProgress) {
            onProgress('completed');
          }
          console.log(`Successfully converted image to data URL for prediction ${prediction.id}`);
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to data URL'));
        }
      };
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        reject(new Error('Failed to read image blob'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error: any) {
    console.error('Replicate Image Generation Error:', error);
    throw error;
  }
};

/**
 * Polls Replicate prediction until completion
 */
const pollReplicatePrediction = async (
  predictionId: string,
  onProgress?: (status: string) => void,
  maxAttempts: number = 120,
  initialDelay: number = 2000
): Promise<string> => {
  let attempts = 0;
  let delay = initialDelay;
  const apiKey = getReplicateApiKey();

  while (attempts < maxAttempts) {
    try {
      const response = await fetchWithCorsProxy(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Replicate polling error (${response.status}):`, errorText);
        throw new Error(`Failed to get prediction status: ${response.status}`);
      }

      const responseText = await response.text();
      let prediction: ReplicateResponse & { status: string; output?: string | string[] };
      
      try {
        prediction = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse Replicate response:', responseText);
        throw new Error('Invalid JSON response from Replicate');
      }

      console.log(`Prediction ${predictionId} status:`, prediction.status, 'output:', prediction.output);

      if (prediction.status === 'succeeded') {
        if (prediction.output) {
          // Handle different output formats
          let imageUrl: string | null = null;
          
          if (Array.isArray(prediction.output)) {
            // If output is an array, get the first string URL
            imageUrl = prediction.output.find((item): item is string => typeof item === 'string') || null;
          } else if (typeof prediction.output === 'string') {
            imageUrl = prediction.output;
          }
          
          if (imageUrl) {
            console.log(`Prediction ${predictionId} succeeded with URL:`, imageUrl);
            return imageUrl;
          }
        }
        console.error(`Prediction ${predictionId} succeeded but output format unexpected:`, prediction.output);
        throw new Error('Prediction succeeded but no image URL found in output');
      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        const errorMsg = (prediction as any).error || `Prediction ${prediction.status}`;
        console.error(`Prediction ${predictionId} ${prediction.status}:`, errorMsg);
        throw new Error(errorMsg);
      }

      if (onProgress) {
        onProgress(prediction.status || 'processing');
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 1000; // Add random jitter to avoid thundering herd
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      delay = Math.min(delay * 1.2, 15000); // Increase delay more aggressively
      attempts++;
    } catch (error: any) {
      // If it's a network error or CORS proxy error, retry
      const isRetryableError = 
        error.message?.includes('fetch') || 
        error.message?.includes('network') ||
        error.message?.includes('CORS') ||
        error.message?.includes('proxy') ||
        error.message?.includes('Failed to fetch');
      
      if (isRetryableError && attempts < maxAttempts - 1) {
        console.warn(`Network error polling prediction ${predictionId}, retrying... (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
        // Exponential backoff with jitter for retries
        const retryDelay = Math.min(delay * 1.5, 20000);
        const jitter = Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, retryDelay + jitter));
        delay = retryDelay;
        attempts++;
        continue;
      }
      // Otherwise, rethrow
      throw error;
    }
  }

  throw new Error(`Prediction polling timeout after ${maxAttempts} attempts`);
};


/**
 * Get model version ID for Replicate API
 * Replicate uses version IDs (hashes) for models
 */
const getModelVersion = async (model: string): Promise<string> => {
    // Try to get the latest version for the model
    const apiKey = getReplicateApiKey();
    try {
      const response = await fetchWithCorsProxy(`https://api.replicate.com/v1/models/${model}/versions`, {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });
    
    if (response.ok) {
      const data: { results?: Array<{ id: string }> } = await response.json();
      if (data.results && data.results.length > 0) {
        // Return the latest version ID
        return data.results[0].id;
      }
    }
  } catch (error) {
    console.warn(`Could not fetch version for ${model}, using model identifier directly`);
  }
  
  // Fallback: return model identifier (may need to be converted to version ID manually)
  // For now, return the model name - user may need to provide version IDs
  return model;
};

/**
 * Get model-specific parameters
 */
const getModelSpecificParams = (model: string, variationIndex?: number): Record<string, any> => {
  const params: Record<string, any> = {};

  // Add seed for variation
  if (variationIndex !== undefined) {
    const seed = Math.floor(Math.random() * 1000000) + variationIndex * 1000;
    params.seed = seed;
  }

  // Model-specific parameters
  // Settings optimized for $0.01 cost
  if (model.includes('flux')) {
    params.output_format = 'webp';
    params.output_quality = 70;
    params.safety_tolerance = 2;
    params.prompt_upsampling = false;
  }

  if (model.includes('qwen')) {
    params.num_images = 1;
  }

  if (model.includes('recraft')) {
    params.num_outputs = 1;
  }

  if (model.includes('imagen')) {
    params.num_images = 1;
  }

  if (model.includes('seedream')) {
    params.num_images = 1;
  }

  return params;
};

/**
 * Construct prompt (reuse from other services or create a simple one)
 */
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

  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page.`;
  
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

