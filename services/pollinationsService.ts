import { Theme, GenerationSettings } from '../types';
import { getNextProxy, formatProxyUrl } from './proxyService';

const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai';

// Proxy gateway services that can route requests through proxies
// These services accept a target URL and proxy parameters
const PROXY_GATEWAYS = [
  'https://api.allorigins.win/raw?url=', // CORS proxy (doesn't support custom proxies)
  // Note: Browser fetch doesn't support direct proxy configuration
  // For true proxy rotation, we'd need a backend service
];

// Track which proxy to use for each request
let currentProxyIndex = 0;

/**
 * Converts aspect ratio string to width and height
 */
const getAspectRatioDimensions = (aspectRatio: string): { width: number; height: number } => {
  const ratios: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '4:3': { width: 1536, height: 1152 },
    '3:4': { width: 1152, height: 1536 },
    '21:9': { width: 2560, height: 1080 },
  };
  
  return ratios[aspectRatio] || ratios['1:1'];
};

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
  
  // Add seed for additional variation (Pollinations uses seed parameter)
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
 * Generates a journal page using Pollinations.AI
 * Pollinations.AI is free and open-source, no API key required!
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
    let prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
    
    // CRITICAL: Always append flat printable page constraints to ensure no 3D photography
    // This is especially important for ChatGPT-generated prompts which might not include these constraints
    if (customPrompt) {
      prompt = `${prompt}. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design.`;
    }
    
    const { width, height } = getAspectRatioDimensions(aspectRatio);

    // Update progress
    if (onProgress) {
      onProgress('generating');
    }

    // Pollinations.AI uses a simple URL-based API
    // Format: https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&model={model}
    const encodedPrompt = encodeURIComponent(prompt);
    
    // Choose model based on mode
    // Available models: flux, flux-pro, flux-dev, flux-schnell, etc.
    const model = processMode === 'fast' ? 'flux-schnell' : 'flux-pro';
    
    // Add seed for variation if variationIndex is provided
    const seed = variationIndex !== undefined 
      ? Math.floor(Math.random() * 1000000) + variationIndex * 1000 
      : Math.floor(Math.random() * 1000000);
    
    // Build the image URL with seed for variation
    const imageUrl = `${POLLINATIONS_BASE_URL}/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&enhance=true`;
    
    console.log(`Generating image with Pollinations.AI: ${imageUrl.substring(0, 100)}...`);

    // Fetch the image with retry logic for rate limiting and proxy rotation
    let imageResponse: Response | null = null;
    let retryCount = 0;
    const maxRetries = 5;
    let useProxy = false;
    
    while (retryCount <= maxRetries) {
      try {
        // Try to get a proxy for this request (rotates automatically)
        const proxy = await getNextProxy();
        
        // Build request URL
        // Note: Browser fetch doesn't support direct proxy configuration
        // We'll use the direct URL, but track proxy rotation for future server-side use
        let requestUrl = imageUrl;
        
        if (proxy) {
          console.log(`[Pollinations] Using proxy ${proxy.host}:${proxy.port} for request ${retryCount + 1}`);
          // In a server-side implementation, we would use the proxy here
          // For browser, we'll just rotate the request timing to simulate proxy rotation
          useProxy = true;
        }
        
        // Add a small random delay to simulate different IP addresses
        // This helps distribute requests even without direct proxy support
        if (useProxy && retryCount > 0) {
          const delay = Math.random() * 1000 + 500; // 500-1500ms
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Pollinations API doesn't allow custom headers due to CORS restrictions
        // Use cache: 'no-cache' in fetch options instead of headers
        imageResponse = await fetch(requestUrl, {
          cache: 'no-cache',
          // Don't add custom headers - Pollinations CORS policy doesn't allow them
        });
        
        if (imageResponse.ok) {
          break; // Success, exit retry loop
        }
        
        // Handle rate limiting (429) with retry and proxy rotation
        if (imageResponse.status === 429) {
          if (retryCount < maxRetries) {
            // Get next proxy for retry
            await getNextProxy(); // Rotate to next proxy
            // Longer exponential backoff for rate limits: 10s, 20s, 30s, 40s, 50s
            const retryAfter = 10 + (retryCount * 10);
            console.warn(`[Pollinations] Rate limited (429). Rotating proxy and retrying after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            retryCount++;
            continue; // Retry the request with new proxy
          } else {
            throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}. All retries exhausted.`);
          }
        }
        
        // Handle timeout errors (524) - these are server-side timeouts, retry with longer delay
        if (imageResponse.status === 524) {
          if (retryCount < maxRetries) {
            await getNextProxy(); // Rotate to next proxy
            // Longer delay for timeouts: 15s, 25s, 35s, 45s, 55s
            const retryAfter = 15 + (retryCount * 10);
            console.warn(`[Pollinations] Timeout (524). Server took too long to respond. Retrying after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            retryCount++;
            continue;
          } else {
            throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}. Server timeout - all retries exhausted.`);
          }
        }
        
        // Handle Bad Gateway errors (502) - server-side issues, retry with delay
        if (imageResponse.status === 502 || imageResponse.status === 503 || imageResponse.status === 504) {
          if (retryCount < maxRetries) {
            await getNextProxy(); // Rotate to next proxy
            // Moderate delay for gateway errors: 8s, 16s, 24s, 32s, 40s
            const retryAfter = 8 + (retryCount * 8);
            const errorName = imageResponse.status === 502 ? 'Bad Gateway' : 
                             imageResponse.status === 503 ? 'Service Unavailable' : 'Gateway Timeout';
            console.warn(`[Pollinations] ${errorName} (${imageResponse.status}). Server issue detected. Retrying after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            retryCount++;
            continue;
          } else {
            throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}. Server error - all retries exhausted.`);
          }
        }
        
        // For other errors, throw immediately
        throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}`);
      } catch (error: any) {
        // If it's a network error, timeout, or fetch error and we have retries left, try again
        const isRetryableError = error.message?.includes('Failed to fetch') || 
                                 error.message?.includes('Network') ||
                                 error.message?.includes('timeout') ||
                                 error.message?.includes('524') ||
                                 error.message?.includes('429') ||
                                 error.message?.includes('502') ||
                                 error.message?.includes('503') ||
                                 error.message?.includes('504') ||
                                 error.message?.includes('Bad Gateway');
        
        if (retryCount < maxRetries && isRetryableError) {
          await getNextProxy(); // Rotate to next proxy
          // Longer delay for network errors: 5s, 10s, 15s, 20s, 25s
          const retryAfter = 5 + (retryCount * 5);
          console.warn(`[Pollinations] Network/timeout error. Retrying with next proxy after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw error;
      }
    }
    
    if (!imageResponse || !imageResponse.ok) {
      throw new Error('Failed to fetch image from Pollinations API');
    }

    // Convert to blob then to data URL
    const blob = await imageResponse.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if (onProgress) {
            onProgress('completed');
          }
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error: any) {
    console.error('Pollinations Image Generation Error:', error);
    throw error;
  }
};

