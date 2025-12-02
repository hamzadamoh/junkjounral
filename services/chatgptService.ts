// Get API key from environment variable only
const getOpenAIApiKey = (): string => {
  return import.meta.env.VITE_OPENAI_API_KEY || '';
};

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatGPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Generates a unique prompt using ChatGPT API
 */
export const generatePromptWithChatGPT = async (
  theme: string,
  pageStyle: string,
  textureIntensity: string,
  elements: string[],
  includeFrames: boolean,
  includeBorders: boolean,
  variationNumber: number,
  customThemePrompt?: string
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  const systemPrompt = `You are a creative prompt engineer specializing in VINTAGE JUNK JOURNAL page descriptions. CRITICAL: Generate prompts for VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art, NOT bright watercolor illustrations, NOT clean modern designs. The output must look like an old, worn, vintage journal page with aged paper, distressed textures, muted sepia/brown tones, and handwritten script. Think antique, vintage, aged, distressed, worn, sepia-toned, muted colors.`;

  // Build the theme description - combine base theme with custom theme prompt if provided
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // Create variation-specific instructions to ensure diversity
  const variationInstructions = [
    'Create a completely different composition and layout from previous variations',
    'Use a different color palette and visual style while maintaining the theme',
    'Design a different arrangement with unique positioning of elements',
    'Create a different mood and atmosphere with varied lighting and tones',
    'Use different artistic styles (sketch, watercolor, ink, vintage illustration)',
    'Create different focal points and visual hierarchy',
    'Use different patterns, textures, and decorative elements',
    'Create different perspectives and viewpoints of the theme elements',
    'Use different scales and proportions of elements',
    'Create different border and frame designs',
    'Use different typography and script styles',
    'Create different background treatments and textures'
  ];
  
  const variationInstruction = variationInstructions[(variationNumber - 1) % variationInstructions.length];
  
  // Add specific variation direction based on number
  let variationDirection = '';
  if (variationNumber % 3 === 1) {
    variationDirection = 'Focus on creating a DIFFERENT composition with unique element placement and layout.';
  } else if (variationNumber % 3 === 2) {
    variationDirection = 'Focus on using DIFFERENT colors, tones, and visual style while keeping the theme.';
  } else {
    variationDirection = 'Focus on DIFFERENT artistic treatment, patterns, and decorative elements.';
  }

  const userPrompt = `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

THIS VARIATION MUST BE VISUALLY DIFFERENT from all previous variations while maintaining the ${themeDescription} theme.

${variationDirection}
${variationInstruction}

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, NOT bright vibrant colors
- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT: faint vintage handwriting, old script, cursive text visible
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements
- FLAT printable page design (like a vintage scrapbook page)
- NO modern watercolor illustrations, NO bright colors, NO clean digital art
- NO 3D objects, NO depth, NO shadows, NO realistic photography
- NO still life compositions, NO objects placed around the page
- Top-down view, flat illustration style
- Think of it as an old, worn vintage journal page found in an antique shop
- EACH VARIATION MUST HAVE A UNIQUE COMPOSITION, COLOR SCHEME, AND VISUAL STYLE

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time.` : ''}

Create a DISTINCT and UNIQUE design with specific visual details, colors, mood, composition, and style that differs from other variations. 2-3 sentences. Return ONLY the prompt description (without adding "flat" or "printable" again - I'll add those constraints separately).`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast and cost-efficient
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1.2, // Increased temperature for maximum creative variation (higher = more diverse)
        max_tokens: 200, // Increased to allow for more detailed, varied descriptions
        stream: false // Ensure non-streaming for parallel requests
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data: ChatGPTResponse = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      const generatedPrompt = data.choices[0].message.content.trim();
      return generatedPrompt;
    } else {
      throw new Error('No response from ChatGPT API');
    }
  } catch (error: any) {
    console.error('ChatGPT API Error:', error);
    throw new Error(`Failed to generate prompt with ChatGPT: ${error.message || 'Unknown error'}`);
  }
};

