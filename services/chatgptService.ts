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

  const systemPrompt = `You are a creative prompt engineer specializing in VINTAGE JUNK JOURNAL page descriptions. CRITICAL: Generate prompts for VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art, NOT bright watercolor illustrations, NOT clean modern designs, NOT photorealistic, NOT realistic photography. The output must look like an old, worn, vintage journal page with aged paper, distressed textures, muted sepia/brown tones, and handwritten script. Think antique, vintage, aged, distressed, worn, sepia-toned, muted colors, illustrated style, artistic rendering, NOT realistic.`;

  // Build the theme description - combine base theme with custom theme prompt if provided
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // Create variation-specific instructions to ensure diversity in SUBJECTS, not just style
  // Rotate through different types of content: characters, scenes, objects, ephemera, patterns
  const subjectTypes = [
    'quirky character', // e.g., skeleton bride, spooky creature, whimsical figure
    'different quirky character', // e.g., different character entirely
    'gothic scene or landscape', // e.g., spooky house, haunted forest, gothic town
    'vintage ephemera and objects', // e.g., old tickets, vintage cards, antique items
    'decorative pattern or border', // e.g., ornate frame, decorative border, pattern design
    'different scene or setting', // e.g., different location or environment
    'vintage collage elements', // e.g., layered paper scraps, mixed media elements
    'whimsical creature or figure', // e.g., different creature/character
    'gothic architecture or structure', // e.g., castle, mansion, spooky building
    'vintage botanical or nature elements', // e.g., twisted trees, gothic flowers, spooky plants
    'antique decorative elements', // e.g., vintage frames, old labels, antique decorations
    'different character or figure' // e.g., yet another unique character
  ];
  
  const currentSubjectType = subjectTypes[(variationNumber - 1) % subjectTypes.length];
  
  // Add specific variation direction based on number - focus on DIFFERENT SUBJECTS
  let variationDirection = '';
  const subjectRotation = variationNumber % 4;
  if (subjectRotation === 1) {
    variationDirection = `Focus on a DIFFERENT ${currentSubjectType} - create a unique subject that hasn't appeared in previous variations.`;
  } else if (subjectRotation === 2) {
    variationDirection = `Focus on a COMPLETELY DIFFERENT ${currentSubjectType} - ensure this is a distinct subject, not just a style variation.`;
  } else if (subjectRotation === 3) {
    variationDirection = `Focus on a NEW ${currentSubjectType} - make sure this subject is different from all previous variations.`;
  } else {
    variationDirection = `Focus on an UNIQUE ${currentSubjectType} - create a fresh, distinct subject within the theme.`;
  }
  
  // Additional instruction to emphasize subject diversity
  const variationInstruction = `CRITICAL: This variation must feature a DIFFERENT MAIN SUBJECT than previous variations. For example, if previous variations showed pumpkins, this one should show a different subject like a spooky character, gothic house, vintage ephemera, or twisted tree - NOT just pumpkins in a different style. Each variation should be like a different page from a junk journal collection, featuring different subjects, characters, scenes, or elements, all within the ${themeDescription} theme.`;

  const userPrompt = `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

CRITICAL: THIS VARIATION MUST FEATURE A DIFFERENT MAIN SUBJECT than all previous variations, not just a different style of the same subject.

${variationDirection}

${variationInstruction}

For example, if the theme is "Halloween Junk Journal Pages":
- Variation 1 might feature: a quirky skeleton bride character
- Variation 2 might feature: a spooky gothic house scene
- Variation 3 might feature: vintage Halloween ephemera and tickets
- Variation 4 might feature: a twisted gothic tree
- Variation 5 might feature: a different quirky character (not skeleton bride)
- And so on...

Each variation should be like a DIFFERENT PAGE from a junk journal collection - featuring different subjects, characters, scenes, objects, or elements - all within the ${themeDescription} theme.

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- ILLUSTRATED/ARTISTIC STYLE: stylized illustration, artistic rendering, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic
- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, NOT bright vibrant colors
- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT: faint vintage handwriting, old script, cursive text visible
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements
- FLAT printable page design (like a vintage scrapbook page)
- NO modern watercolor illustrations, NO bright colors, NO clean digital art
- NO photorealistic rendering, NO realistic photography, NO hyper-realistic details
- NO 3D objects, NO depth, NO shadows, NO realistic lighting
- NO still life compositions, NO objects placed around the page
- Top-down view, flat illustration style, artistic rendering
- Think of it as an illustrated, artistic rendering of an old, worn vintage journal page - stylized, NOT realistic
- EACH VARIATION MUST HAVE A DIFFERENT MAIN SUBJECT (different character, scene, object, or element) AND a unique composition, color scheme, and visual style

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT subject and interpretation each time. For example, if the custom theme mentions "dragons", create different dragon-related subjects: a dragon character, a dragon scene, dragon ephemera, dragon patterns, etc.` : ''}

Create a DISTINCT and UNIQUE design featuring a DIFFERENT MAIN SUBJECT with specific visual details, colors, mood, composition, and style that differs from other variations. 2-3 sentences. Return ONLY the prompt description (without adding "flat" or "printable" again - I'll add those constraints separately).`;

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

