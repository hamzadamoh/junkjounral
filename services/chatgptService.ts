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
  customThemePrompt?: string,
  colorIntensity: 'Muted' | 'Colorful' | 'Multicolored' = 'Muted'
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  const systemPrompt = `You are a creative prompt engineer specializing in VINTAGE JUNK JOURNAL page descriptions. CRITICAL: Generate prompts for VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art, NOT bright watercolor illustrations, NOT clean modern designs, NOT photorealistic, NOT realistic photography. The output must look like an old, worn, vintage journal page with aged paper, distressed textures, muted sepia/brown tones, and handwritten script. Think antique, vintage, aged, distressed, worn, sepia-toned, muted colors, illustrated style, artistic rendering, NOT realistic.`;

  // Build the theme description - combine base theme with custom theme prompt if provided
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // Create variation-specific instructions to ensure diversity
  // Let ChatGPT naturally explore different aspects of the theme
  const variationInstructions = [
    'Explore a different aspect or element of the theme - think creatively about what else could represent this theme',
    'Create a completely different composition, subject, or focal point while staying within the theme',
    'Focus on different visual elements, objects, or motifs that relate to the theme',
    'Design a unique interpretation that hasn\'t been used in previous variations',
    'Think of a different way to represent the theme visually - different subjects, scenes, or elements',
    'Create a fresh perspective on the theme with distinct visual content',
    'Explore another facet of the theme with different subjects or compositions',
    'Design a unique variation that explores a different aspect of the theme',
    'Create a distinct visual interpretation that differs from previous variations',
    'Think creatively about other ways to represent the theme visually',
    'Explore different subjects, elements, or compositions within the theme',
    'Create a unique design that represents the theme in a different way'
  ];
  
  const variationInstruction = variationInstructions[(variationNumber - 1) % variationInstructions.length];
  
  // Add specific variation direction - emphasize natural variety
  let variationDirection = '';
  if (variationNumber % 3 === 1) {
    variationDirection = 'Create a DIFFERENT subject, element, or composition within the theme - avoid repeating the same subject from previous variations.';
  } else if (variationNumber % 3 === 2) {
    variationDirection = 'Explore a DIFFERENT aspect of the theme - think of other visual elements, subjects, or scenes that relate to this theme.';
  } else {
    variationDirection = 'Design a UNIQUE interpretation of the theme - ensure this variation has distinct visual content, not just a style change.';
  }

  const userPrompt = `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationDirection}

${variationInstruction}

Think creatively: What are different ways to represent ${themeDescription}? What other subjects, elements, scenes, or compositions could relate to this theme? Each variation should feel like a different page from a collection - naturally varied, not repetitive.

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- ILLUSTRATED/ARTISTIC STYLE: stylized illustration, artistic rendering, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic
${colorIntensity === 'Muted' 
  ? '- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, coffee-stained look, NOT bright vibrant colors'
  : colorIntensity === 'Colorful'
  ? '- COLORFUL VINTAGE PALETTE: rich, vibrant colors (reds, blues, greens, purples, yellows) while maintaining vintage aesthetic, aged paper texture, and antique feel - colors should be vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'
  : '- MULTICOLORED MODERN PALETTE: vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals) - modern, fresh, lively, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT sepia, NOT muted - think modern watercolor, vibrant illustration, fresh and alive'}
${colorIntensity === 'Multicolored' 
  ? '- MODERN, FRESH STYLE: clean, modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps - just vivid, alive, modern colorful illustration'
  : `- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT OVERLAYS: extensive cursive handwritten text overlaying the design, like old letters or journal entries, faded brown/sepia ink, flowing script, multiple layers of text
- VINTAGE EPHEMERA: include postage stamps, vintage labels, old tickets, faded botanical illustrations, floral patterns, sheet music notation, vintage seals or stamps
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements - the page should look like a real junk journal page with multiple layers
- MIXED MEDIA: combine the main illustration with handwritten text, stamps, floral patterns, and other vintage elements all layered together`}
- FLAT printable page design (like a vintage scrapbook page)
- NO modern watercolor illustrations, NO clean digital art
- NO photorealistic rendering, NO realistic photography, NO hyper-realistic details
- NO 3D objects, NO depth, NO shadows, NO realistic lighting
- NO still life compositions, NO objects placed around the page
- Top-down view, flat illustration style, artistic rendering
- Think of it as an illustrated, artistic rendering of an old, worn vintage journal page with handwritten text overlays, stamps, and ephemera - like a real junk journal page, stylized, NOT realistic
- EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}".` : ''}

Create a DISTINCT and UNIQUE design with specific visual details, colors, mood, composition, and style that naturally differs from other variations. 2-3 sentences. Return ONLY the prompt description (without adding "flat" or "printable" again - I'll add those constraints separately).`;

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

