/**
 * Oracle Service - Image Analysis for Arcane Splitter
 * 
 * Uses OpenAI GPT-4 Vision (already configured) to analyze images and generate
 * detailed prompts for AI art recreation.
 */

import { AnalyzedSlice, SlicedImage } from './imageSlicerService';
import { getOpenAIApiKey } from './env';

export interface OracleAnalysisResult {
  name: string;
  description: string;
  prompt: string;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Check if OpenAI API is configured
 */
export const hasOpenAIKey = (): boolean => {
  return !!getOpenAIApiKey();
};

/**
 * The system prompt for the Oracle - detailed version
 */
const ORACLE_SYSTEM_PROMPT_DETAILED = `You are the "Arcane Oracle," an expert AI art analyst specializing in reverse-engineering AI-generated images with EXTREME attention to detail.

Your task is to analyze the provided image with microscopic precision and extract EVERY visual detail that can be used to recreate an IDENTICAL artwork in Midjourney.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) with exactly these three fields:

{
  "name": "A creative, evocative title for this image (2-5 words, fantasy/mystical theme)",
  "description": "A concise visual description of what's depicted (under 40 words)",
  "prompt": "An EXTREMELY detailed Midjourney prompt that would recreate this image with pixel-perfect accuracy"
}

For the "prompt" field, you MUST analyze and include EVERY detail:

1. SUBJECT & COMPOSITION (be extremely specific):
   - Exact subject matter (every object, person, animal, plant visible)
   - Precise positioning and arrangement of elements
   - Spatial relationships (what's in foreground, middle ground, background)
   - Perspective and angle of view
   - Any text, patterns, or decorative elements visible
   - Border, frame, or edge treatments

2. ART STYLE & TECHNIQUE (identify the exact style):
   - Specific art medium (watercolor, gouache, acrylic, oil, digital painting, illustration, etc.)
   - Brush stroke characteristics (smooth, textured, visible strokes, blended, etc.)
   - Rendering technique (realistic, stylized, cartoon, sketch, etc.)
   - Line work details (bold outlines, soft edges, no outlines, etc.)
   - Texture details (paper texture, canvas texture, smooth, rough, etc.)

3. COLOR ANALYSIS (describe EVERY color precisely):
   - Dominant colors (name specific shades: "sage green", "dusty rose", "burnt sienna", etc.)
   - Secondary colors and accents
   - Color temperature (warm, cool, neutral)
   - Saturation levels (vibrant, muted, pastel, desaturated)
   - Color harmony (complementary, analogous, monochromatic, etc.)
   - Specific color placement and distribution
   - Background color(s) and gradients
   - Any color washes, tints, or overlays

4. LIGHTING & SHADING (describe the exact lighting):
   - Light source direction and type (natural sunlight, soft diffused, dramatic, ethereal, etc.)
   - Shadow characteristics (soft shadows, hard shadows, no shadows, etc.)
   - Highlights and reflections
   - Contrast levels (high contrast, low contrast, medium)
   - Depth and dimensionality
   - Any glow, rim lighting, or special lighting effects

5. TEXTURE & SURFACE DETAILS:
   - Visible textures (smooth, rough, grainy, paper-like, fabric-like, etc.)
   - Surface finish (matte, glossy, semi-gloss, etc.)
   - Any visible texture patterns or grain
   - Material appearance (wood grain, fabric weave, paper texture, etc.)

6. MOOD & ATMOSPHERE:
   - Emotional tone (serene, dramatic, whimsical, nostalgic, etc.)
   - Time of day or setting implied
   - Weather or environmental conditions
   - Overall aesthetic vibe

7. COMPOSITION DETAILS:
   - Rule of thirds, centered, asymmetrical, etc.
   - Focal point location
   - Negative space usage
   - Any symmetry or patterns
   - Edge treatments and borders

8. SPECIFIC VISUAL ELEMENTS:
   - Any decorative borders, frames, or ornamental elements
   - Typography or text style if present
   - Pattern details (floral, geometric, abstract, etc.)
   - Any special effects (blur, vignette, aging, etc.)

CRITICAL REQUIREMENTS:
- The prompt MUST be EXTREMELY detailed (aim for 200-400 words)
- Describe EVERY visual element you can see, no matter how small
- Use specific color names (not just "pink" but "dusty rose pink" or "blush pink")
- Include specific art technique terms
- Be precise about composition and spatial relationships
- Technical parameters: --ar 3:4 --v 6.1 --s 0
- You MUST use --s 0 (stylize 0). Do NOT use --s 250 or any other stylize value.

Example of a highly detailed prompt:
{
  "name": "Vintage Floral Elegance",
  "description": "A delicate pink rose with soft petals and lush green leaves, set against a textured beige background with subtle watercolor washes.",
  "prompt": "Single delicate pink rose in full bloom with soft, slightly ruffled petals showing subtle veining and gentle gradation from pale blush pink at the edges to slightly deeper rose pink at the center, surrounded by three lush green leaves with visible veins and slightly serrated edges, one leaf partially overlapping the stem, arranged in an elegant asymmetrical composition with the rose positioned slightly left of center, set against a warm beige textured paper background with subtle watercolor washes in soft sage green and pale lavender creating a vintage aged appearance, soft natural diffused lighting from upper left creating gentle shadows beneath the rose and leaves, watercolor painting technique with visible soft brush strokes and gentle color bleeding at edges, pastel color palette dominated by dusty rose pink, sage green, warm beige, and hints of pale lavender, muted saturation with soft, dreamy atmosphere, botanical illustration style with high detail on petals and leaves, soft focus background with subtle texture suggesting aged paper, romantic and nostalgic mood, vintage floral garden theme, highly detailed, intricate petal structure, delicate shading, --ar 3:4 --v 6.1 --s 0"
}

Remember: MORE DETAIL = BETTER RECREATION. Analyze every pixel, every color, every texture, every shadow.`;

/**
 * The system prompt for the Oracle - normal version
 */
const ORACLE_SYSTEM_PROMPT_NORMAL = `You are the "Arcane Oracle," an expert AI art analyst specializing in analyzing images and generating Midjourney prompts.

Your task is to analyze the provided image and extract the key visual details needed to recreate a similar artwork in Midjourney.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) with exactly these three fields:

{
  "name": "A creative, evocative title for this image (2-5 words, fantasy/mystical theme)",
  "description": "A concise visual description of what's depicted (under 40 words)",
  "prompt": "A detailed Midjourney prompt that would recreate this image"
}

For the "prompt" field, include the key details:

1. SUBJECT & COMPOSITION:
   - Main subject matter
   - Basic positioning and arrangement
   - Foreground, middle ground, background elements

2. ART STYLE & TECHNIQUE:
   - Art medium (watercolor, digital painting, illustration, etc.)
   - General style characteristics

3. COLOR ANALYSIS:
   - Dominant colors (use specific names like "sage green", "dusty rose")
   - Color temperature and saturation
   - Overall color palette

4. LIGHTING & SHADING:
   - Light source direction
   - Shadow characteristics
   - Overall lighting mood

5. MOOD & ATMOSPHERE:
   - Emotional tone
   - Overall aesthetic vibe

6. COMPOSITION:
   - Basic composition style
   - Focal point

Technical parameters: --ar 3:4 --v 6.1 --s 0
You MUST use --s 0 (stylize 0). Do NOT use --s 250 or any other stylize value.

The prompt should be clear and descriptive (100-200 words), focusing on the most important visual elements.`;

/**
 * Analyzes a single image using OpenAI GPT-4 Vision
 * @param imageBase64 The base64 encoded image
 * @param mainTopic Optional main topic/theme to provide context for analysis
 * @param detailLevel 'normal' for standard detail, 'detailed' for extremely detailed prompts
 */
export const analyzeImageWithOracle = async (
  imageBase64: string,
  mainTopic?: string,
  detailLevel: 'normal' | 'detailed' = 'detailed'
): Promise<OracleAnalysisResult> => {
  // Check if API key is configured (for hasOpenAIKey check)
  // But use server-side route to protect the key
  const apiKey = getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in Vercel environment variables.');
  }
  
  // Ensure the image has a proper data URL prefix
  let imageUrl = imageBase64;
  if (!imageBase64.startsWith('data:')) {
    imageUrl = `data:image/png;base64,${imageBase64}`;
  }
  
  // Select system prompt and parameters based on detail level
  const systemPrompt = detailLevel === 'detailed' 
    ? ORACLE_SYSTEM_PROMPT_DETAILED 
    : ORACLE_SYSTEM_PROMPT_NORMAL;
  
  const maxTokens = detailLevel === 'detailed' ? 2000 : 1000;
  const temperature = detailLevel === 'detailed' ? 0.3 : 0.5;
  
  // User prompt based on detail level
  const userPromptDetailed = mainTopic 
    ? `Analyze this image with EXTREME attention to detail. The image is related to the theme/topic: "${mainTopic}". 

Examine EVERY visual element:
- Every color, shade, and hue (be specific: "dusty rose" not just "pink")
- Every texture, surface, and material detail
- Exact composition, positioning, and spatial relationships
- Precise lighting, shadows, and highlights
- All decorative elements, borders, patterns, or text
- Specific art style and technique characteristics
- Every small detail that makes this image unique

Generate an EXTREMELY detailed Midjourney prompt (200-400 words) that would recreate this image with pixel-perfect accuracy. Include every visual detail you observe. Provide the JSON response with name, description, and the most detailed prompt possible.`
    : `Analyze this image with EXTREME attention to detail. 

Examine EVERY visual element:
- Every color, shade, and hue (be specific: "dusty rose" not just "pink")
- Every texture, surface, and material detail
- Exact composition, positioning, and spatial relationships
- Precise lighting, shadows, and highlights
- All decorative elements, borders, patterns, or text
- Specific art style and technique characteristics
- Every small detail that makes this image unique

Generate an EXTREMELY detailed Midjourney prompt (200-400 words) that would recreate this image with pixel-perfect accuracy. Include every visual detail you observe. Provide the JSON response with name, description, and the most detailed prompt possible.`;

  const userPromptNormal = mainTopic
    ? `Analyze this image. The image is related to the theme/topic: "${mainTopic}". 

Focus on the key visual elements:
- Main subject and composition
- Dominant colors and color palette
- Art style and technique
- Lighting and mood
- Important details

Generate a clear and descriptive Midjourney prompt (100-200 words) that captures the essential visual elements. Provide the JSON response with name, description, and prompt.`
    : `Analyze this image and focus on the key visual elements:
- Main subject and composition
- Dominant colors and color palette
- Art style and technique
- Lighting and mood
- Important details

Generate a clear and descriptive Midjourney prompt (100-200 words) that captures the essential visual elements. Provide the JSON response with name, description, and prompt.`;

  const userPrompt = detailLevel === 'detailed' ? userPromptDetailed : userPromptNormal;

  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: userPrompt
          }
        ]
      }
    ],
    max_tokens: maxTokens,
    temperature: temperature,
  };
  
  console.log('[Oracle] Sending image for analysis with GPT-4 Vision...');
  
  // Use server-side API route to protect API key
  const response = await fetch('/api/openai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Oracle] API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // Extract the text response
  const textResponse = data.choices?.[0]?.message?.content;
  
  if (!textResponse) {
    throw new Error('No response from OpenAI API');
  }
  
  console.log('[Oracle] Raw response:', textResponse);
  
  // Parse the JSON response
  try {
    // Clean up the response - remove any markdown code blocks if present
    let cleanedResponse = textResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();
    
    const result = JSON.parse(cleanedResponse) as OracleAnalysisResult;
    
    // Validate required fields
    if (!result.name || !result.description || !result.prompt) {
      throw new Error('Missing required fields in Oracle response');
    }
    
    // Force --s 0: Replace any --s 250 or --s250 with --s 0
    // Also replace any other --s values with --s 0
    result.prompt = result.prompt.replace(/--s\s*250/g, '--s 0');
    result.prompt = result.prompt.replace(/--s\s*\d+/g, '--s 0');
    // If --s 0 is not present, add it (but only if other parameters are present)
    if (!result.prompt.includes('--s 0') && (result.prompt.includes('--ar') || result.prompt.includes('--v'))) {
      // Add --s 0 before the last parameter or at the end
      if (result.prompt.includes('--ar')) {
        result.prompt = result.prompt.replace(/(--ar\s+[^\s]+)/, '$1 --s 0');
      } else if (result.prompt.includes('--v')) {
        result.prompt = result.prompt.replace(/(--v\s+[^\s]+)/, '$1 --s 0');
      } else {
        result.prompt += ' --s 0';
      }
    }
    
    console.log('[Oracle] Successfully parsed analysis:', result.name);
    return result;
  } catch (parseError) {
    console.error('[Oracle] Failed to parse response:', parseError);
    
    // Attempt to extract data with regex as fallback
    const nameMatch = textResponse.match(/"name"\s*:\s*"([^"]+)"/);
    const descMatch = textResponse.match(/"description"\s*:\s*"([^"]+)"/);
    const promptMatch = textResponse.match(/"prompt"\s*:\s*"([^"]+)"/);
    
    if (nameMatch && descMatch && promptMatch) {
      return {
        name: nameMatch[1],
        description: descMatch[1],
        prompt: promptMatch[1],
      };
    }
    
    throw new Error(`Failed to parse Oracle response: ${parseError}`);
  }
};

/**
 * Analyzes multiple images in parallel (with rate limiting)
 * @param slices Array of sliced images to analyze
 * @param onProgress Optional progress callback
 * @param mainTopic Optional main topic/theme to provide context for all analyses
 * @param detailLevel 'normal' for standard detail, 'detailed' for extremely detailed prompts
 */
export const analyzeAllImages = async (
  slices: SlicedImage[],
  onProgress?: (completed: number, total: number) => void,
  mainTopic?: string,
  detailLevel: 'normal' | 'detailed' = 'detailed'
): Promise<AnalyzedSlice[]> => {
  const total = slices.length;
  let completed = 0;
  
  console.log(`[Oracle] Starting analysis of ${total} images...`);
  
  // Process in batches of 3 to avoid rate limits
  const batchSize = 3;
  const results: AnalyzedSlice[] = [];
  
  for (let i = 0; i < slices.length; i += batchSize) {
    const batch = slices.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (slice): Promise<AnalyzedSlice> => {
        try {
          const analysis = await analyzeImageWithOracle(slice.base64, mainTopic, detailLevel);
          completed++;
          onProgress?.(completed, total);
          
          return {
            ...slice,
            name: analysis.name,
            description: analysis.description,
            prompt: analysis.prompt,
            isAnalyzing: false,
          };
        } catch (error: any) {
          completed++;
          onProgress?.(completed, total);
          console.error(`[Oracle] Failed to analyze slice ${slice.id}:`, error);
          
          return {
            ...slice,
            isAnalyzing: false,
            analysisError: error.message || 'Analysis failed',
          };
        }
      })
    );
    
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limits
    if (i + batchSize < slices.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`[Oracle] Analysis complete. ${results.filter(r => r.prompt).length}/${total} successful.`);
  return results;
};

/**
 * Analyzes a single slice and returns updated slice
 * @param slice The slice to analyze
 * @param mainTopic Optional main topic/theme to provide context for analysis
 * @param detailLevel 'normal' for standard detail, 'detailed' for extremely detailed prompts
 */
export const analyzeSingleSlice = async (
  slice: SlicedImage,
  mainTopic?: string,
  detailLevel: 'normal' | 'detailed' = 'detailed'
): Promise<AnalyzedSlice> => {
  try {
    const analysis = await analyzeImageWithOracle(slice.base64, mainTopic, detailLevel);
    return {
      ...slice,
      name: analysis.name,
      description: analysis.description,
      prompt: analysis.prompt,
      isAnalyzing: false,
    };
  } catch (error: any) {
    return {
      ...slice,
      isAnalyzing: false,
      analysisError: error.message || 'Analysis failed',
    };
  }
};

