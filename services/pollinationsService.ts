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
    
    // Add seed for variation (Pollinations uses seed parameter)
    if (variationIndex !== undefined) {
      const seed = Math.floor(Math.random() * 1000000) + variationIndex * 1000;
      prompt += ` seed:${seed}`;
    }
    
    // Add additional parameters if provided
    if (parametersForMJ) {
      prompt += ` ${parametersForMJ}`;
    }
    
    return prompt;
  }
  
  // Get color palette and style constraints based on color intensity setting
  let colorPalette: string;
  let styleConstraints: string;
  
  if (settings.colorIntensity === 'Muted' || settings.colorIntensity === 'Colorful') {
    // Vintage junk journal style
    colorPalette = settings.colorIntensity === 'Muted' 
      ? 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors'
      : 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
    styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
  } else {
    // Multicolored: vivid, alive, modern - NO vintage/junk journal
    colorPalette = 'vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors';
    styleConstraints = `${colorPalette}, modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
  }
  
  // Construct the final detailed prompt
  let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. ${styleConstraints}`;
  
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
    
    // CRITICAL: Handle Custom / Override mode - trust ChatGPT prompt entirely, no style constraints
    if (customPrompt && settings.colorIntensity === 'Custom / Override') {
      // For Custom / Override: Trust ChatGPT prompt entirely, DO NOT add any style constraints
      // Only aspect ratio is handled by the URL parameters below
    } else if (customPrompt) {
      // For other modes: Append vintage junk journal constraints
      // STRICT: Vintage aesthetic, muted colors, aged paper, illustrated style, NOT realistic
      if (settings.colorIntensity === 'Muted') {
        // Muted: sepia, brown tones, faded
        const colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
        prompt = `${prompt}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else if (settings.colorIntensity === 'Normal') {
        // Normal: normal colors, not muted/sepia, not overly vibrant - gothic/vintage aesthetic
        const colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
        prompt = `${prompt}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else if (settings.colorIntensity === 'Colorful') {
        // Colorful: vibrant colors with vintage charm
        const colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
        prompt = `${prompt}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor illustrations, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
      } else {
        // Multicolored: vivid, alive, modern - NO vintage
        prompt = `${prompt}. vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
      }
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
    
    console.log(`[Pollinations] Generating image: ${imageUrl.substring(0, 100)}...`);

    // Use serverless function for proxy support and parallel requests
    // Get a proxy for this request (rotates automatically)
    const proxy = await getNextProxy();
    
    if (proxy) {
      console.log(`[Pollinations] Using proxy ${proxy.host}:${proxy.port} for variation ${variationIndex || 'N/A'}`);
    }

    // Fetch through serverless function with proxy support
    let retryCount = 0;
    const maxRetries = 3; // Reduced retries since we're using serverless function
    
    while (retryCount <= maxRetries) {
      try {
        const response = await fetch('/api/pollinations/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl,
            proxy: proxy || null
          })
        });

        if (!response.ok) {
          // Handle rate limiting
          if (response.status === 429) {
            const data = await response.json().catch(() => ({}));
            const retryAfter = parseInt(data.retryAfter || '10');
            
            if (retryCount < maxRetries) {
              console.warn(`[Pollinations] Rate limited (429). Retrying after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              retryCount++;
              continue;
            } else {
              throw new Error(`Pollinations API error: Rate limited. All retries exhausted.`);
            }
          }
          
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`Pollinations API error: ${response.status} ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success && data.image) {
          if (onProgress) {
            onProgress('completed');
          }
          return data.image; // Return base64 data URL
        } else {
          throw new Error(data.message || 'Failed to generate image');
        }
      } catch (error: any) {
        // If it's a network error and we have retries left, try again
        const isRetryableError = error.message?.includes('Failed to fetch') || 
                                 error.message?.includes('Network') ||
                                 error.message?.includes('timeout') ||
                                 error.message?.includes('429');
        
        if (retryCount < maxRetries && isRetryableError) {
          // Get next proxy for retry
          const nextProxy = await getNextProxy();
          console.warn(`[Pollinations] Network/rate limit error. Retrying with next proxy... (attempt ${retryCount + 1}/${maxRetries})`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Failed to generate image from Pollinations API after all retries');
  } catch (error: any) {
    console.error('Pollinations Image Generation Error:', error);
    throw error;
  }
};

