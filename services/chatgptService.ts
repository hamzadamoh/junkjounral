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
  colorIntensity: 'Muted' | 'Normal' | 'Colorful' | 'Multicolored' = 'Muted',
  customArtStyle?: string
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  // Global helper function to generate variation control instructions
  const getVariationControl = (variationNumber: number, themeDescription: string): string => {
    // Detect theme type from description
    const themeLower = themeDescription.toLowerCase();
    const isBestiary = themeLower.includes('bestiary') || themeLower.includes('creature') || themeLower.includes('dragon') || themeLower.includes('beast') || themeLower.includes('animal') || themeLower.includes('bear') || themeLower.includes('owl') || themeLower.includes('wolf') || themeLower.includes('bird');
    const isLandscape = themeLower.includes('landscape') || themeLower.includes('forest') || themeLower.includes('mountain') || themeLower.includes('scene') || themeLower.includes('village') || themeLower.includes('winter') || themeLower.includes('summer') || themeLower.includes('autumn') || themeLower.includes('spring');
    
    let controlText = `\n\n🎯 VARIATION CONTROL (Variation #${variationNumber}):\n`;
    
    if (isBestiary) {
      controlText += `- CRITICAL: You MUST switch to a DIFFERENT creature than all previous variations.\n`;
      controlText += `- If previous variations featured dragons, switch to bears, owls, wolves, birds, or other creatures within the theme.\n`;
      controlText += `- Each creature must be visually distinct - different species, pose, composition, or setting.\n`;
      controlText += `- GOAL: Create a diverse bestiary collection where each image features a unique creature.\n`;
    } else if (isLandscape) {
      controlText += `- CRITICAL: You MUST switch the perspective or focal point from previous variations.\n`;
      controlText += `- Rotate through: Wide landscape shot, Close-up detail, Path/road view, Sky/aerial view, Ground level, Elevated view.\n`;
      controlText += `- Change the focal element: different structures, natural features, or environmental conditions.\n`;
      controlText += `- GOAL: Each image must show a different aspect of the landscape - like different photographs from a collection.\n`;
    } else {
      controlText += `- CRITICAL: You MUST explore a DIFFERENT subject, element, or composition than all previous variations.\n`;
      controlText += `- Switch between: different subjects, different perspectives (wide/close-up), different focal points, different moods.\n`;
      controlText += `- Avoid repeating the same visual elements, objects, or compositions.\n`;
      controlText += `- GOAL: Each image must be distinct enough to be a separate trading card or journal page.\n`;
    }
    
    controlText += `- REMEMBER: Never output the same subject or composition twice. Explore the entire breadth of "${themeDescription}".`;
    
    return controlText;
  };

  // CRITICAL: If colorIntensity is 'Custom / Override', use neutral system prompt
  if (colorIntensity === 'Custom / Override') {
    const systemPrompt = `You are a versatile AI Art Director. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.`;

    // Build the theme description
    let themeDescription = theme;
    if (customThemePrompt && customThemePrompt.trim()) {
      themeDescription = `${theme} with ${customThemePrompt.trim()}`;
    }

    // Create variation-specific instructions for custom override
    const variationInstructions = [
      'Explore a DIFFERENT time of day: morning, noon, evening, night, dawn, or dusk - each creates a unique mood and lighting',
      'Create a DIFFERENT composition: close-up of details, wide landscape view, path/road leading into distance, single focus element, or dense grouping',
      'Focus on DIFFERENT elements: vary the subjects, objects, structures, natural features, or environmental conditions within the theme',
      'Design a DIFFERENT perspective: bird\'s eye view, ground level, looking up, looking down a path/road, side view, or angled view',
      'Explore DIFFERENT weather/atmosphere: clear day, misty, foggy, moonlit, sunset, sunrise, stormy, or magical lighting',
      'Create a DIFFERENT scene type: path/road view, water feature (stream/river/lake), structure (house/cabin/building), open area, dense area, or elevated view',
      'Focus on DIFFERENT details: close-up textures, medium-range elements, distant horizon, specific objects, or environmental features',
      'Design a DIFFERENT mood: serene and peaceful, dramatic and bold, mystical and magical, cozy and warm, crisp and clear, or energetic and vibrant',
      'Explore DIFFERENT natural/man-made features: varied terrain, water elements, structures, vegetation, or architectural elements',
      'Create a DIFFERENT focal point: a single prominent element, a winding path/road, a structure, a natural feature, or a wide landscape',
      'Focus on DIFFERENT lighting: bright sunlight, soft diffused light, dramatic shadows, warm sunset/rise glow, cool moonlit, or atmospheric lighting',
      'Design a DIFFERENT scale: macro close-up details, medium view of a scene, or wide expansive landscape'
    ];
    
    const variationInstruction = variationInstructions[(variationNumber - 1) % variationInstructions.length];
    
    const variationDirections = [
      'Create a COMPLETELY DIFFERENT scene - change the time of day, weather/atmosphere, composition, or focal point. Avoid any similarity to previous variations.',
      'Explore a DIFFERENT aspect - think of other subjects, elements, features, or perspectives within the theme. Make it visually distinct.',
      'Design a UNIQUE interpretation - ensure this variation has different composition, different elements, different mood, or different perspective than previous ones.',
      'Create a FRESH perspective - change the viewpoint, scale, or focus. Think: close-up vs wide view, day vs night, path/road vs open area, single element vs group.',
      'Explore DIFFERENT elements - vary the subjects, features, structures, or details. Each variation should feel like a different scene entirely.',
      'Design a DISTINCT scene - change multiple aspects: time of day, composition type, focal elements, and mood. Make it feel like a different photograph or painting.'
    ];
    const variationDirection = variationDirections[(variationNumber - 1) % variationDirections.length];

    // Get global variation control
    const variationControl = getVariationControl(variationNumber, themeDescription);

    const userPrompt = `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} illustration.

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationControl}

${variationDirection}

${variationInstruction}

Think creatively and explore WIDELY different scenes within ${themeDescription}:
- Vary TIME OF DAY: morning, noon, evening, night, dawn, dusk, sunset, sunrise - each creates unique lighting and mood
- Vary COMPOSITION: close-up details, wide landscape, path/road view, single focus element, dense grouping, open area
- Vary ELEMENTS: different subjects, objects, structures, natural/man-made features, environmental conditions within the theme
- Vary PERSPECTIVE: bird's eye view, ground level, looking up, looking down path/road, side view, angled view
- Vary MOOD: serene, dramatic, mystical, cozy, crisp, peaceful, magical, energetic - each variation should have a distinct emotional feel
- Vary SCALE: macro close-up details, medium scene view, wide expansive landscape - change the viewing distance
- Vary WEATHER/ATMOSPHERE: clear day, misty, foggy, moonlit, stormy, atmospheric lighting - change environmental conditions
- Vary SCENE TYPE: path/road view, water feature, structure/building, open area, dense area, elevated view - change the scene structure

Each variation should feel like a COMPLETELY DIFFERENT scene - like different photographs or paintings of the same theme. Avoid any visual similarity between variations. Change multiple aspects (time, composition, elements, perspective) to ensure maximum diversity.

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

${customArtStyle && customArtStyle.trim() ? `CUSTOM ART STYLE: Follow this art style rigorously: "${customArtStyle.trim()}". Do NOT add elements that are not part of this style.` : ''}

IMPORTANT: Generate a high-quality, artistic representation of ${themeDescription}. Do NOT automatically add junk journal elements (stamps, ephemera, handwritten text, distressed textures) unless the theme or style explicitly calls for them. Do NOT force 'modern' or 'flat' styles unless requested. Follow the theme description exactly as provided.

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that represents ${themeDescription} accurately and artistically. 2-3 sentences. Return ONLY the prompt description.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 1.2,
          max_tokens: 200,
          stream: false
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
  }

  // Build the theme description - combine base theme with custom theme prompt if provided
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // Get global variation control for all modes
  const variationControl = getVariationControl(variationNumber, themeDescription);

  // Default prompts (existing logic)
  // Check for 'Custom / Override' first
  const systemPrompt = colorIntensity === 'Custom / Override'
    ? `You are a versatile AI Art Director. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.`
    : colorIntensity === 'Multicolored'
    ? `You are a creative prompt engineer specializing in MODERN, VIVID, COLORFUL illustration descriptions. 

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

🚨 CRITICAL RULES - YOU MUST FOLLOW THESE:
1. NEVER use: "aged", "antique", "vintage", "distressed", "old", "worn", "junk journal", "journal page"
2. NEVER use: "handwritten", "cursive", "letters", "postage stamps", "ephemera", "sepia", "muted", "faded"
3. ALWAYS start prompts with: "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..."
4. ALWAYS describe: modern, fresh, vibrant, colorful, vivid, bright, alive illustrations
5. If you use ANY vintage/junk journal words, you have FAILED the task

Generate prompts for MODERN, VIVID, COLORFUL illustrations - modern watercolor style, vibrant colors, fresh and lively, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT sepia, NOT muted. Think modern, fresh, vibrant, colorful, alive, vivid watercolor illustrations.`
    : `You are a creative prompt engineer specializing in VINTAGE JUNK JOURNAL page descriptions. 

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

CRITICAL: Generate prompts for VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art, NOT bright watercolor illustrations, NOT clean modern designs, NOT photorealistic, NOT realistic photography. The output must look like an old, worn, vintage journal page with aged paper, distressed textures, muted sepia/brown tones, and handwritten script. Think antique, vintage, aged, distressed, worn, sepia-toned, muted colors, illustrated style, artistic rendering, NOT realistic.`;

  // Build the theme description - combine base theme with custom theme prompt if provided
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // Create variation-specific instructions to ensure diversity
  // For Normal color intensity, add more specific diversity instructions that work for ANY theme
  const variationInstructions = colorIntensity === 'Normal' ? [
    'Explore a DIFFERENT time of day: morning, noon, evening, night, dawn, or dusk - each creates a unique mood and lighting',
    'Create a DIFFERENT composition: close-up of details, wide landscape view, path/road leading into distance, single focus element, or dense grouping',
    'Focus on DIFFERENT elements: vary the subjects, objects, structures, natural features, or environmental conditions within the theme',
    'Design a DIFFERENT perspective: bird\'s eye view, ground level, looking up, looking down a path/road, side view, or angled view',
    'Explore DIFFERENT weather/atmosphere: clear day, misty, foggy, moonlit, sunset, sunrise, stormy, or magical lighting',
    'Create a DIFFERENT scene type: path/road view, water feature (stream/river/lake), structure (house/cabin/building), open area, dense area, or elevated view',
    'Focus on DIFFERENT details: close-up textures, medium-range elements, distant horizon, specific objects, or environmental features',
    'Design a DIFFERENT mood: serene and peaceful, dramatic and bold, mystical and magical, cozy and warm, crisp and clear, or energetic and vibrant',
    'Explore DIFFERENT natural/man-made features: varied terrain, water elements, structures, vegetation, or architectural elements',
    'Create a DIFFERENT focal point: a single prominent element, a winding path/road, a structure, a natural feature, or a wide landscape',
    'Focus on DIFFERENT lighting: bright sunlight, soft diffused light, dramatic shadows, warm sunset/rise glow, cool moonlit, or atmospheric lighting',
    'Design a DIFFERENT scale: macro close-up details, medium view of a scene, or wide expansive landscape'
  ] : [
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
  // For Normal color intensity, add more specific diversity guidance that works for ANY theme
  let variationDirection = '';
  if (colorIntensity === 'Normal') {
    const directions = [
      'Create a COMPLETELY DIFFERENT scene - change the time of day, weather/atmosphere, composition, or focal point. Avoid any similarity to previous variations.',
      'Explore a DIFFERENT aspect - think of other subjects, elements, features, or perspectives within the theme. Make it visually distinct.',
      'Design a UNIQUE interpretation - ensure this variation has different composition, different elements, different mood, or different perspective than previous ones.',
      'Create a FRESH perspective - change the viewpoint, scale, or focus. Think: close-up vs wide view, day vs night, path/road vs open area, single element vs group.',
      'Explore DIFFERENT elements - vary the subjects, features, structures, or details. Each variation should feel like a different scene entirely.',
      'Design a DISTINCT scene - change multiple aspects: time of day, composition type, focal elements, and mood. Make it feel like a different photograph or painting.'
    ];
    variationDirection = directions[(variationNumber - 1) % directions.length];
  } else {
    if (variationNumber % 3 === 1) {
      variationDirection = 'Create a DIFFERENT subject, element, or composition within the theme - avoid repeating the same subject from previous variations.';
    } else if (variationNumber % 3 === 2) {
      variationDirection = 'Explore a DIFFERENT aspect of the theme - think of other visual elements, subjects, or scenes that relate to this theme.';
    } else {
      variationDirection = 'Design a UNIQUE interpretation of the theme - ensure this variation has distinct visual content, not just a style change.';
    }
  }

  const userPrompt = colorIntensity === 'Custom / Override'
    ? `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} illustration.

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationControl}

${variationDirection}

${variationInstruction}

Think creatively and explore WIDELY different scenes within ${themeDescription}:
- Vary TIME OF DAY: morning, noon, evening, night, dawn, dusk, sunset, sunrise - each creates unique lighting and mood
- Vary COMPOSITION: close-up details, wide landscape, path/road view, single focus element, dense grouping, open area
- Vary ELEMENTS: different subjects, objects, structures, natural/man-made features, environmental conditions within the theme
- Vary PERSPECTIVE: bird's eye view, ground level, looking up, looking down path/road, side view, angled view
- Vary MOOD: serene, dramatic, mystical, cozy, crisp, peaceful, magical, energetic - each variation should have a distinct emotional feel
- Vary SCALE: macro close-up details, medium scene view, wide expansive landscape - change the viewing distance
- Vary WEATHER/ATMOSPHERE: clear day, misty, foggy, moonlit, stormy, atmospheric lighting - change environmental conditions
- Vary SCENE TYPE: path/road view, water feature, structure/building, open area, dense area, elevated view - change the scene structure

Each variation should feel like a COMPLETELY DIFFERENT scene - like different photographs or paintings of the same theme. Avoid any visual similarity between variations. Change multiple aspects (time, composition, elements, perspective) to ensure maximum diversity.

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

IMPORTANT: Generate a high-quality, artistic representation of ${themeDescription}. Do NOT automatically add junk journal elements (stamps, ephemera, handwritten text, distressed textures) unless the theme explicitly calls for them. Do NOT force 'modern' or 'flat' styles unless requested. Follow the theme description exactly as provided.

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

${customArtStyle && customArtStyle.trim() ? `CUSTOM ART STYLE: Follow this art style rigorously: "${customArtStyle.trim()}". Do NOT add elements that are not part of this style.` : ''}

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that represents ${themeDescription} accurately and artistically. 2-3 sentences. Return ONLY the prompt description.`
    : colorIntensity === 'Multicolored'
    ? `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} MODERN WATERCOLOR ILLUSTRATION. 

🚨 CRITICAL: This is a MODERN, VIVID, COLORFUL watercolor illustration - NOT a journal page, NOT vintage, NOT antique, NOT junk journal.

🚨 MANDATORY: Your prompt MUST start with one of these exact phrases:
- "A vivid, modern watercolor illustration of..."
- "A colorful watercolor painting depicting..."
- "A fresh, lively watercolor illustration showing..."
- "A bright, vibrant watercolor artwork featuring..."

🚨 FORBIDDEN STARTS - DO NOT START WITH:
❌ "Visualize an aged..." 
❌ "Craft a vintage..."
❌ "Imagine a... junk journal page"
❌ "Create an antique-style..."
❌ ANY phrase containing: aged, antique, vintage, junk journal, journal page

This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationControl}

${variationDirection}

${variationInstruction}

Think creatively: What are different ways to represent ${themeDescription}? What other subjects, elements, scenes, or compositions could relate to this theme? Each variation should feel naturally varied, not repetitive.

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

ABSOLUTELY FORBIDDEN WORDS AND PHRASES - DO NOT USE ANY OF THESE:
❌ "vintage", "antique", "aged", "distressed", "old", "worn", "weathered"
❌ "journal page", "junk journal", "scrapbook page", "journal entry"
❌ "handwritten", "cursive script", "letters", "writing", "poem", "verses", "entries"
❌ "postage stamps", "vintage ephemera", "botanical illustrations", "ticket stubs", "seals"
❌ "sepia", "muted", "coffee-stained", "tea-stained", "parchment", "aged paper"
❌ "faded", "distressed texture", "antique-style", "vintage-style", "old-world"
❌ "nostalgic", "wistful", "memory", "echoed memory", "past", "reminiscing"

EXAMPLE OF WHAT NOT TO WRITE:
❌ "Craft a vintage junk journal page..." 
❌ "Imagine a Winter Wonderland junk journal page..."
❌ "antique-style journal page showcasing..."
❌ "vintage botanical illustrations"
❌ "handwritten poem reminiscing"
❌ "aged postage stamps"
❌ "sepia tones"

REQUIRED - MUST DESCRIBE AS:
✅ MODERN, VIVID, COLORFUL watercolor illustration
✅ VIBRANT COLORS: vivid blues, greens, purples, oranges, yellows, pinks, teals - bright and colorful
✅ MODERN WATERCOLOR STYLE: fresh, lively, vibrant watercolor painting
✅ CLEAN, MODERN design - think contemporary art, modern illustration
✅ Pure, modern, colorful watercolor painting of ${themeDescription}
✅ FLAT printable page design
✅ NO photorealistic rendering, NO realistic photography
✅ NO 3D objects, NO depth, NO shadows, NO realistic lighting
✅ NO still life compositions
✅ Top-down view, flat illustration style

EXAMPLE OF WHAT TO WRITE:
✅ "A vivid, modern watercolor illustration of a winter forest scene with bright blues, greens, and whites..."
✅ "A colorful watercolor painting depicting a serene snowy landscape with vibrant hues..."
✅ "A fresh, lively watercolor illustration of a winter scene with vivid colors..."

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}". Remember: MODERN, VIVID, COLORFUL watercolor illustration - NOT vintage, NOT journal page.` : ''}

🚨 FINAL CHECKLIST - Before returning your prompt, verify:
1. ✅ Does it start with "A vivid, modern..." or "A colorful watercolor..."? 
2. ❌ Does it contain ANY of these words: aged, antique, vintage, junk journal, journal page, handwritten, sepia, muted, faded, postage stamps, ephemera? If YES, rewrite it completely.
3. ✅ Is it describing a modern, colorful illustration with vibrant colors?

Create a DISTINCT and UNIQUE MODERN WATERCOLOR ILLUSTRATION prompt. Start with "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..." - describe it as a pure, modern, colorful watercolor painting of ${themeDescription} with vibrant colors. DO NOT mention journal, vintage, antique, stamps, handwritten text, or any vintage elements. 2-3 sentences. Return ONLY the prompt description.`
    : `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationControl}

${variationDirection}

${variationInstruction}

${colorIntensity === 'Normal' 
  ? `Think creatively and explore WIDELY different scenes within ${themeDescription}:
- Vary TIME OF DAY: morning, noon, evening, night, dawn, dusk, sunset, sunrise - each creates unique lighting and mood
- Vary COMPOSITION: close-up details, wide landscape, path/road view, single focus element, dense grouping, open area
- Vary ELEMENTS: different subjects, objects, structures, natural/man-made features, environmental conditions within the theme
- Vary PERSPECTIVE: bird's eye view, ground level, looking up, looking down path/road, side view, angled view
- Vary MOOD: serene, dramatic, mystical, cozy, crisp, peaceful, magical, energetic - each variation should have a distinct emotional feel
- Vary SCALE: macro close-up details, medium scene view, wide expansive landscape - change the viewing distance
- Vary WEATHER/ATMOSPHERE: clear day, misty, foggy, moonlit, stormy, atmospheric lighting - change environmental conditions
- Vary SCENE TYPE: path/road view, water feature, structure/building, open area, dense area, elevated view - change the scene structure

Each variation should feel like a COMPLETELY DIFFERENT scene - like different photographs or paintings of the same theme. Avoid any visual similarity between variations. Change multiple aspects (time, composition, elements, perspective) to ensure maximum diversity.`
  : `Think creatively: What are different ways to represent ${themeDescription}? What other subjects, elements, scenes, or compositions could relate to this theme? Each variation should feel like a different page from a collection - naturally varied, not repetitive.`}

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- ILLUSTRATED/ARTISTIC STYLE: stylized illustration, artistic rendering, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic
${colorIntensity === 'Muted' 
  ? '- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, coffee-stained look, NOT bright vibrant colors'
  : colorIntensity === 'Normal'
  ? '- NORMAL COLORS: deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, normal color saturation, gothic/vintage aesthetic'
  : '- COLORFUL VINTAGE PALETTE: rich, vibrant colors (reds, blues, greens, purples, yellows) while maintaining vintage aesthetic, aged paper texture, and antique feel - colors should be vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'}
- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT OVERLAYS: extensive cursive handwritten text overlaying the design, like old letters or journal entries, faded brown/sepia ink, flowing script, multiple layers of text
- VINTAGE EPHEMERA: include postage stamps, vintage labels, old tickets, faded botanical illustrations, floral patterns, sheet music notation, vintage seals or stamps
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements - the page should look like a real junk journal page with multiple layers
- MIXED MEDIA: combine the main illustration with handwritten text, stamps, floral patterns, and other vintage elements all layered together
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

