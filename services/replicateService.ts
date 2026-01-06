import { Theme, GenerationSettings } from '../types';

// Get API key from environment variable only
const getReplicateApiKey = (): string => {
  return import.meta.env.VITE_REPLICATE_API_KEY || '';
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
    let prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
    
    // CRITICAL: Handle Custom / Override mode - trust ChatGPT prompt entirely, no style constraints
    if (customPrompt && settings.colorIntensity === 'Custom / Override') {
      // For Custom / Override: Trust ChatGPT prompt entirely, DO NOT add any style constraints
      // Aspect ratio is handled by the model parameters below
    } else if (customPrompt) {
      // For other modes: Append flat printable page constraints to ensure no 3D photography
      prompt = `${prompt}. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design.`;
    }
    
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
    
    // Retry logic for rate limiting (429 errors)
    let retryCount = 0;
    const maxRetries = 10; // Increased retries for rate limits
    let response: Response;
    let prediction: ReplicateResponse & { id?: string };
    
    while (retryCount <= maxRetries) {
      try {
        // Use Vercel serverless function proxy (no CORS issues)
        // The API route runs on the server and forwards to Replicate
        response = await fetch('/api/replicate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operation: 'create-prediction',
            version: modelIdentifier,
            input: inputParams
          })
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[Replicate] API error response:', errorText);
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON
          }
          
          // Handle rate limiting (429) with retry
          if (response.status === 429) {
            const retryAfter = errorData.retry_after || 10; // Default to 10 seconds
            const errorMsg = errorData.detail || response.statusText || errorText;
            
            if (retryCount < maxRetries) {
              const waitTime = (retryAfter + 2) * 1000; // Add 2 second buffer for safety
              console.warn(`[Replicate] Rate limited (429). Retrying after ${retryAfter + 2} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
              continue; // Retry the request
            } else {
              throw new Error(`Replicate API error: ${response.status} ${errorMsg}`);
            }
          }
          
          // For other errors, throw immediately
          const errorMsg = errorData.detail || response.statusText || errorText;
          throw new Error(`Replicate API error: ${response.status} ${errorMsg}`);
        }
        
        // Success - parse response and break out of retry loop
        try {
          const responseText = await response.text();
          console.log('[Replicate] Prediction response:', responseText.substring(0, 200));
          prediction = JSON.parse(responseText);
        } catch (parseError: any) {
          console.error('[Replicate] Failed to parse prediction response:', parseError);
          throw new Error('Failed to parse Replicate API response');
        }
        
        break; // Success, exit retry loop
      } catch (error: any) {
        // If it's not a 429 error, don't retry
        if (!error.message?.includes('429') && !error.message?.includes('Rate limited')) {
          throw error;
        }
        // If we've exhausted retries, throw
        if (retryCount >= maxRetries) {
          throw error;
        }
        // For 429 errors, we already handled the retry in the if block above
        // This catch is for any other unexpected errors during retry
        throw error;
      }
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
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
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
      // Use Vercel serverless function proxy (no CORS issues)
      const response = await fetch(`/api/replicate?operation=get-prediction&id=${predictionId}`, {
        headers: {
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
      // If it's a network error, retry
      const isRetryableError = 
        error.message?.includes('fetch') || 
        error.message?.includes('network') ||
        error.message?.includes('CORS') ||
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
    try {
      // Use Vercel serverless function proxy (no CORS issues)
      const response = await fetch(`/api/replicate?operation=get-model-versions&model=${model}`, {
        headers: {
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
    
    // Add additional parameters if provided
    if (parametersForMJ) {
      prompt += ` ${parametersForMJ}`;
    }
    
    return prompt;
  }
  
  // Get color palette and style constraints based on color intensity setting
  let colorPalette: string;
  let styleConstraints: string;
  
  if (settings.colorIntensity === 'Muted') {
    // Muted: sepia, brown tones, faded
    colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
    styleConstraints = `Color palette: ${colorPalette}. Extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, real junk journal page with text overlays and ephemera.`;
  } else if (settings.colorIntensity === 'Normal') {
    // Normal: normal colors, not muted/sepia, not overly vibrant - gothic/vintage aesthetic
    colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
    styleConstraints = `Color palette: ${colorPalette}. Extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, real junk journal page with text overlays and ephemera.`;
  } else if (settings.colorIntensity === 'Colorful') {
    // Colorful: vibrant colors with vintage charm
    colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
    styleConstraints = `Color palette: ${colorPalette}. Extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, real junk journal page with text overlays and ephemera.`;
  } else {
    // Multicolored: vivid, alive, modern - NO vintage/junk journal
    colorPalette = 'vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors';
    styleConstraints = `${colorPalette}, modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained. Digital design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
  }
  
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${styleConstraints}`;
  
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

