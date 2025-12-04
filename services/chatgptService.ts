// Get API key from environment variable only
const getOpenAIApiKey = (): string => {
  return import.meta.env.VITE_OPENAI_API_KEY || '';
};

const getOpenRouterApiKey = (): string => {
  return import.meta.env.VITE_OPENROUTER_API_KEY || '';
};

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatGPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ImageAnalysisResponse {
  theme: string;
  style: string;
}

// ============================================
// GLOBAL CONTENT VARIABLES (Apply to ALL Modes)
// These ensure variety in WHAT is shown, regardless of style
// ============================================
const subjectFocus = [
  "Single Hero Object (Central)",
  "Wide Atmospheric Scene",
  "Macro Detail/Texture",
  "Knolling (Flat Lay of multiple items)",
  "Asymmetrical Corner Composition",
  "Pattern-Focused (No central object)",
  "Collage of Scattered Elements",
  "Framed Vignette"
];

const cameraAngles = [
  "Top-Down / Flat Lay",
  "Straight-On Front View",
  "Macro Close-Up",
  "Isometric Angle",
  "Dutch Angle (Dynamic tilt)"
];

// ============================================
// STYLE VARIABLES (Apply ONLY to Custom Mode)
// ============================================
const artTechniques = [
  "Watercolor",
  "Vector Illustration",
  "Etching",
  "Gouache",
  "Ink Drawing",
  "Digital Painting",
  "Linocut",
  "Screen Print",
  "Charcoal Sketch",
  "Pastel Drawing",
  "Acrylic Paint",
  "Oil Painting"
];

const palettes = [
  "Soft Pastels",
  "Natural & Organic",
  "Vintage Muted",
  "Watercolor Wash",
  "Earth Tones",
  "Botanical Greenery",
  "Monochromatic",
  "Faded & Nostalgic",
  "Warm Neutrals",
  "Cool & Frosty",
  "Classic Elegant",
  "Desaturated"
];

/**
 * Cleans DeepSeek R1 output by removing reasoning tags and markdown formatting
 */
function cleanDeepSeekOutput(content: string): string {
  let cleaned = content;
  
  // Remove everything between <think> and </think> (including newlines)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
  
  // Also handle <think>...</think> tags (common in reasoning models)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Remove any markdown code block syntax if present
  cleaned = cleaned.replace(/^```(json|text|markdown)?/i, '').replace(/```$/i, '');
  
  // Remove double-dash separators that confuse Midjourney
  // Remove double em-dash (——) with optional whitespace
  cleaned = cleaned.replace(/——\s*/g, '');
  // Remove double dash (--) followed by a letter (Midjourney interprets -- as commands)
  cleaned = cleaned.replace(/--\s*([A-Za-z])/g, '$1');
  
  // Remove any leading/trailing whitespace and newlines
  cleaned = cleaned.trim();
  
  return cleaned;
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
  customArtStyle?: string,
  promptService: 'openai' | 'openrouter' = 'openai'
): Promise<string> => {
  // Determine which service to use
  const useOpenRouter = promptService === 'openrouter';
  const apiKey = useOpenRouter ? getOpenRouterApiKey() : getOpenAIApiKey();
  const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
  const model = useOpenRouter ? 'tngtech/deepseek-r1t2-chimera:free' : 'gpt-4o-mini';
  
  if (!apiKey) {
    const serviceName = useOpenRouter ? 'OpenRouter' : 'OpenAI';
    const envVar = useOpenRouter ? 'VITE_OPENROUTER_API_KEY' : 'VITE_OPENAI_API_KEY';
    throw new Error(`${serviceName} API key is not configured. Please set ${envVar} in your environment variables.`);
  }

  // ============================================
  // RANDOMIZE CONTENT (For ALL Modes)
  // ============================================
  // Use variationNumber as seed for consistent randomization per variation
  // This ensures each variation gets a unique but deterministic content assignment
  // Using prime number multipliers to ensure good distribution
  const seed = variationNumber;
  const randomFocus = subjectFocus[Math.floor((seed * 17 + seed * 7) % subjectFocus.length)];
  const randomAngle = cameraAngles[Math.floor((seed * 23 + seed * 11) % cameraAngles.length)];

  // ============================================
  // SELECT STYLE (Logic Branch)
  // ============================================
  let styleInstruction = '';
  if (colorIntensity === 'Custom / Override') {
    // Custom Mode: Check if customArtStyle is provided
    if (customArtStyle && customArtStyle.trim()) {
      // User provided custom art style - use ONLY their text, NO random tech/palette
      styleInstruction = `STYLE: Follow this custom art style: "${customArtStyle.trim()}".`;
    } else {
      // No custom art style - use random tech and palette for diversity
      const randomTech = artTechniques[Math.floor((seed * 31 + seed * 13) % artTechniques.length)];
      const randomPalette = palettes[Math.floor((seed * 37 + seed * 19) % palettes.length)];
      styleInstruction = `STYLE: ${randomTech} technique. Color Palette: ${randomPalette}.`;
    }
    // Add safety constraint for color handling in Custom Mode
    styleInstruction += ` CONSTRAINT: Avoid neon colors, hyper-saturation, and harsh contrast unless explicitly requested in the style description. Keep colors harmonious and printable.`;
  } else if (colorIntensity === 'Multicolored') {
    // Multicolored: Modern, Vivid, Colorful
    styleInstruction = 'STYLE: Modern Watercolor Illustration. Vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues). Fresh and lively, clean modern design. NOT vintage, NOT aged, NOT distressed, NOT junk journal style.';
  } else if (colorIntensity === 'Muted') {
    // Muted: Vintage Junk Journal with muted colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, muted sepia and brown tones, old faded colors, muted color palette. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges.';
  } else if (colorIntensity === 'Normal') {
    // Normal: Vintage Junk Journal with normal colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, normal colors (deep burgundy, maroon, dark grey, black, antique gold, rich but not faded). Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges.';
  } else if (colorIntensity === 'Colorful') {
    // Colorful: Vintage Junk Journal with vibrant colors
    styleInstruction = 'STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges.';
  }

  // Build the theme description (needed for variationSpecifies)
  let themeDescription = theme;
  if (customThemePrompt && customThemePrompt.trim()) {
    themeDescription = `${theme} with ${customThemePrompt.trim()}`;
  }

  // ============================================
  // CONSTRUCT VARIATION SPECIFICS (Content + Style)
  // Must be defined before Custom/Override block uses it
  // ============================================
  const variationSpecifies = `VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus} ⚠️ THIS DETERMINES THE IMAGE STRUCTURE
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription} (Use theme elements, but structure follows VISUAL FOCUS)

${styleInstruction}

🎯 STRUCTURE HIERARCHY: VISUAL FOCUS > THEME DESCRIPTION
The VISUAL FOCUS defines the COMPOSITION STRUCTURE. The Theme provides the CONTENT ELEMENTS to fill that structure.

INSTRUCTION: Create the assigned VISUAL FOCUS structure, then incorporate theme elements appropriately:
- If Focus is 'Single Hero Object (Central)': Create an ISOLATED central element (ephemera-style). Use theme elements to design this single object, NOT as background. Even if theme suggests "pattern", create a distinct focal object.
- If Focus is 'Wide Atmospheric Scene': Show a broader landscape/environment view using theme elements.
- If Focus is 'Macro Detail/Texture': Show a close-up of intricate details, textures, or patterns. This is the ONLY focus that allows full-page texture/pattern.
- If Focus is 'Knolling (Flat Lay of multiple items)': Arrange multiple theme-related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition': Place the main subject in a corner with negative space. Use theme elements to create the corner element, NOT background.
- If Focus is 'Pattern-Focused (No central object)': Create a repeating pattern or texture without a central focal point. This is the ONLY focus that allows full-page repeating patterns.
- If Focus is 'Collage of Scattered Elements': Arrange various theme elements scattered across the page in a collage style.
- If Focus is 'Framed Vignette': Show a scene or object within a decorative frame or border. Use theme elements inside the frame, NOT as background pattern.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.`;

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
- If no style is provided, generate a high-quality, artistic representation of the Theme.

🎨 COLOR LOGIC: Unless the user explicitly uses words like 'Vibrant', 'Neon', 'Bright', or 'Saturated', you MUST default to a **Soft, Natural, or Muted** color palette. Avoid oversaturation. Prioritize artistic, tasteful, and printable colors over intense digital hues.

🎨 AESTHETIC DEFAULT: Your default aesthetic is 'High-End Illustration' (Soft, Textured, Natural). Avoid 'Digital Art' aesthetics (Neon, Shiny, Plastic) unless requested.`;

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

${variationSpecifies}

🚨 HIERARCHY RULE - VISUAL FOCUS OVERRIDES THEME:
The VISUAL FOCUS determines the STRUCTURE and COMPOSITION of the image, NOT the Theme Description.
- If VISUAL FOCUS is 'Single Hero Object (Central)': The image MUST have an isolated central element as the primary subject, even if the Theme suggests patterns or backgrounds. Use theme elements to create a distinct focal point, NOT a background pattern.
- If VISUAL FOCUS is 'Framed Vignette': The image MUST show a scene or object within a decorative frame or border. Use theme elements to create the framed content, NOT a repeating background.
- If VISUAL FOCUS is 'Pattern-Focused (No central object)': THEN you may create a full-page repeating pattern or texture using the theme elements.
- If VISUAL FOCUS is 'Macro Detail/Texture': THEN you may create a close-up texture or pattern detail.
- For ALL OTHER FOCUS TYPES: Do NOT generate a full-page background pattern, even if the Theme contains "Pattern" or "Background". Instead, use the theme elements to create the assigned focus structure (e.g., isolated element, framed scene, corner composition, etc.).

🚨 ANTI-REPETITION RULE:
If the Theme Description contains words like "Pattern", "Background", "Texture", or "Seamless":
- ONLY generate a full-page repeating pattern/texture if VISUAL FOCUS is 'Pattern-Focused (No central object)' or 'Macro Detail/Texture'.
- For all other VISUAL FOCUS types (Single Hero Object, Framed Vignette, Asymmetrical Corner, Knolling, Collage, Wide Scene): Use the theme elements to create a DISTINCT focal point, isolated element, framed composition, or specific arrangement - NOT a background pattern.

🎨 DESIGN KIT GENERATION GOAL:
You are creating a "Design Kit" that contains a MIX of different types of elements:
- Some variations should be full-page backgrounds/textures (only when Focus is Pattern-Focused or Macro Detail)
- Some variations should be isolated elements/ephemera (when Focus is Single Hero Object, Framed Vignette, or Asymmetrical Corner)
- Some variations should be frames or borders (when Focus is Framed Vignette)
- Some variations should be compositions with multiple items (when Focus is Knolling or Collage)
- The goal is VARIETY - not all variations should be the same type of element.

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that follows the VISUAL FOCUS structure while incorporating the ${themeDescription} theme elements appropriately. 2-3 sentences. Return ONLY the prompt description.`;

    // Create AbortController for timeout (120 seconds for reasoning models)
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      
      // OpenRouter requires HTTP-Referer header (optional but recommended)
      if (useOpenRouter) {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'Junk Journal Generator';
      }
      
      // Set timeout (120 seconds for reasoning models - DeepSeek R1 can take 60+ seconds)
      timeoutId = setTimeout(() => controller.abort(), 120000);
      
      console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Starting API request with 120s timeout...`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 1.2,
          max_tokens: 4000, // FORCE THIS TO 4000 for DeepSeek R1 reasoning model
          stream: false
        }),
        signal: controller.signal
      });
      
      if (!response.ok) {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        const errorData = await response.json().catch(() => ({}));
        const serviceName = useOpenRouter ? 'OpenRouter' : 'OpenAI';
        console.error(`[${serviceName}] API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`${serviceName} API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data: ChatGPTResponse = await response.json();
      
      // Clear timeout if request completes successfully
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      
      if (data.choices && data.choices.length > 0) {
        const rawContent = data.choices[0].message.content;
        
        // Debug: Log raw response BEFORE cleaning
        console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Raw Model Output:`, rawContent);
        
        // Clean DeepSeek R1 reasoning tags IMMEDIATELY after receiving response (before any validation)
        const generatedPrompt = cleanDeepSeekOutput(rawContent);
        
        // Debug: Log cleaned response
        console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Cleaned Prompt:`, generatedPrompt);
        
        return generatedPrompt;
      } else {
        throw new Error(`No response from ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'} API`);
      }
    } catch (error: any) {
      // Ensure timeout is cleared even on error
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      
      // Debug: Log full error details
      console.error(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] API Error Details:`, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        error: error
      });
      
      // Handle timeout errors specifically
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        throw new Error(`Request timeout: The ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'} API took longer than 120 seconds to respond. This may happen with reasoning models. Please try again.`);
      }
      
      throw new Error(`Failed to generate prompt with ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}: ${error.message || 'Unknown error'}`);
    }
  }

  // Get global variation control for all modes (themeDescription already defined above)
  const variationControl = getVariationControl(variationNumber, themeDescription);

  // Default prompts (existing logic)
  // Check for 'Custom / Override' first
  const systemPrompt = colorIntensity === 'Custom / Override'
    ? `You are a versatile AI Art Director. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.

🎨 AESTHETIC DEFAULT: Your default aesthetic is 'High-End Illustration' (Soft, Textured, Natural). Avoid 'Digital Art' aesthetics (Neon, Shiny, Plastic) unless requested.`
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

${variationSpecifies}

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

IMPORTANT: Generate a high-quality, artistic representation of ${themeDescription}. Do NOT automatically add junk journal elements (stamps, ephemera, handwritten text, distressed textures) unless the theme explicitly calls for them. Do NOT force 'modern' or 'flat' styles unless requested. Follow the theme description exactly as provided.

🎨 COLOR SAFETY RULE: Unless the user explicitly uses words like 'Neon', 'Bright', 'Vibrant', or 'Pop Art', you MUST default to a **Natural, Soft, or Artistic** color palette. Avoid oversaturation. Do NOT use digital neon colors.

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

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

${variationSpecifies}

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

ABSOLUTELY FORBIDDEN WORDS AND PHRASES - DO NOT USE ANY OF THESE:
❌ "vintage", "antique", "aged", "distressed", "old", "worn", "weathered"
❌ "journal page", "junk journal", "scrapbook page", "journal entry"
❌ "handwritten", "cursive script", "letters", "writing", "poem", "verses", "entries"
❌ "postage stamps", "vintage ephemera", "botanical illustrations", "ticket stubs", "seals"
❌ "sepia", "muted", "coffee-stained", "tea-stained", "parchment", "aged paper"
❌ "faded", "distressed texture", "antique-style", "vintage-style", "old-world"
❌ "nostalgic", "wistful", "memory", "echoed memory", "past", "reminiscing"

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}". Remember: MODERN, VIVID, COLORFUL watercolor illustration - NOT vintage, NOT journal page.` : ''}

🚨 FINAL CHECKLIST - Before returning your prompt, verify:
1. ✅ Does it start with "A vivid, modern..." or "A colorful watercolor..."? 
2. ❌ Does it contain ANY of these words: aged, antique, vintage, junk journal, journal page, handwritten, sepia, muted, faded, postage stamps, ephemera? If YES, rewrite it completely.
3. ✅ Is it describing a modern, colorful illustration with vibrant colors?

Create a DISTINCT and UNIQUE MODERN WATERCOLOR ILLUSTRATION prompt. Start with "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..." - describe it as a pure, modern, colorful watercolor painting of ${themeDescription} with vibrant colors. DO NOT mention journal, vintage, antique, stamps, handwritten text, or any vintage elements. 2-3 sentences. Return ONLY the prompt description.`
    : `Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

${variationSpecifies}

${variationControl}

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

  // Create AbortController for timeout (120 seconds for reasoning models)
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    // OpenRouter requires HTTP-Referer header (optional but recommended)
    if (useOpenRouter) {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Junk Journal Generator';
    }
    
    // Set timeout (120 seconds for reasoning models - DeepSeek R1 can take 60+ seconds)
    timeoutId = setTimeout(() => controller.abort(), 120000);
    
    console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Starting API request with 120s timeout...`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model, // Fast and cost-efficient
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1.2, // Increased temperature for maximum creative variation (higher = more diverse)
        max_tokens: 4000, // FORCE THIS TO 4000 for DeepSeek R1 reasoning model (needs 1000+ tokens to "think")
        stream: false // Ensure non-streaming for parallel requests
      }),
      signal: controller.signal
    });
    
    if (!response.ok) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      const errorData = await response.json().catch(() => ({}));
      const serviceName = useOpenRouter ? 'OpenRouter' : 'OpenAI';
      console.error(`[${serviceName}] API Error Details:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`${serviceName} API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data: ChatGPTResponse = await response.json();
    
    // Clear timeout if request completes successfully
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    if (data.choices && data.choices.length > 0) {
      const rawContent = data.choices[0].message.content;
      
      // Debug: Log raw response BEFORE cleaning
      console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Raw Model Output:`, rawContent);
      
      // Clean DeepSeek R1 reasoning tags IMMEDIATELY after receiving response (before any validation)
      const generatedPrompt = cleanDeepSeekOutput(rawContent);
      
      // Debug: Log cleaned response
      console.log(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] Cleaned Prompt:`, generatedPrompt);
      
      return generatedPrompt;
    } else {
      throw new Error(`No response from ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'} API`);
    }
  } catch (error: any) {
    // Ensure timeout is cleared even on error
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    // Debug: Log full error details
    console.error(`[${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}] API Error Details:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    // Handle timeout errors specifically
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      throw new Error(`Request timeout: The ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'} API took longer than 120 seconds to respond. This may happen with reasoning models. Please try again.`);
    }
    
    throw new Error(`Failed to generate prompt with ${useOpenRouter ? 'OpenRouter' : 'ChatGPT'}: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Analyzes a reference image using GPT-4o-mini vision to extract theme and style
 * @param base64Image Base64 encoded image (with data URL prefix)
 * @returns Object with theme and style fields
 */
export const analyzeReferenceImage = async (base64Image: string): Promise<ImageAnalysisResponse> => {
  const apiKey = getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  // Remove data URL prefix if present (keep just the base64 data)
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

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
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image to create a generative art prompt. Return a JSON object with exactly two fields: 1. "theme": A concise subject description (e.g., "Winter Birch Forest with intricate roots"). 2. "style": A detailed style descriptor including medium, texture, colors, and mood (e.g., "Soft atmospheric watercolor, pastel blue and white palette, traditional art style").'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`OpenAI Vision API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data: ChatGPTResponse = await response.json();

    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      try {
        const analysis: ImageAnalysisResponse = JSON.parse(content);
        
        // Validate response structure
        if (!analysis.theme || !analysis.style) {
          throw new Error('Invalid response format: missing theme or style field');
        }

        return {
          theme: analysis.theme.trim(),
          style: analysis.style.trim()
        };
      } catch (parseError) {
        throw new Error(`Failed to parse analysis response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    } else {
      throw new Error('No response from OpenAI Vision API');
    }
  } catch (error: any) {
    console.error('[OpenAI Vision] API Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    throw new Error(`Failed to analyze image: ${error.message || 'Unknown error'}`);
  }
};

