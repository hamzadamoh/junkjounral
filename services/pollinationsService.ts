import { Theme, GenerationSettings } from '../types';

const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai';

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
    const prompt = customPrompt || constructPrompt(theme, settings, parametersForMJ, variationIndex);
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

    // Fetch the image with retry logic for rate limiting
    let imageResponse: Response;
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount <= maxRetries) {
      imageResponse = await fetch(imageUrl);
      
      if (imageResponse.ok) {
        break; // Success, exit retry loop
      }
      
      // Handle rate limiting (429) with retry
      if (imageResponse.status === 429) {
        if (retryCount < maxRetries) {
          const retryAfter = 5; // Pollinations typically resets quickly, wait 5 seconds
          console.warn(`[Pollinations] Rate limited (429). Retrying after ${retryAfter} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          retryCount++;
          continue; // Retry the request
        } else {
          throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}`);
        }
      }
      
      // For other errors, throw immediately
      throw new Error(`Pollinations API error: ${imageResponse.status} ${imageResponse.statusText}`);
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

