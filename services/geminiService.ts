/**
 * Gemini AI Service - "The Oracle"
 * 
 * Uses Google's Gemini Multimodal AI to analyze images and generate
 * detailed prompts for AI art recreation.
 */

import { AnalyzedSlice, SlicedImage } from './imageSlicerService';
import { getGeminiApiKey } from './env';

export interface GeminiAnalysisResult {
  name: string;
  description: string;
  prompt: string;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Re-export for convenience
export { getGeminiApiKey };

/**
 * The system prompt for the Oracle - instructs Gemini on how to analyze images
 */
const ORACLE_SYSTEM_PROMPT = `You are the "Arcane Oracle," an expert AI art analyst specializing in reverse-engineering AI-generated images.

Your task is to analyze the provided image and extract detailed information that can be used to recreate similar artwork in Midjourney.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) with exactly these three fields:

{
  "name": "A creative, evocative title for this image (2-5 words, fantasy/mystical theme)",
  "description": "A concise visual description of what's depicted (under 40 words)",
  "prompt": "A detailed Midjourney prompt that would recreate this style"
}

For the "prompt" field, include:
- Subject description (what is shown)
- Art style (watercolor, oil painting, digital art, etc.)
- Color palette (dominant colors, mood)
- Lighting (soft, dramatic, ethereal, etc.)
- Composition details
- Atmosphere/mood keywords
- Technical parameters: --ar 3:4 --v 6.1 --s 250

Example response:
{
  "name": "Enchanted Forest Guardian",
  "description": "A mystical deer with glowing antlers stands in a moonlit forest clearing, surrounded by floating fireflies and ancient trees.",
  "prompt": "Majestic deer with luminescent crystalline antlers standing in an enchanted forest clearing, soft moonlight filtering through ancient oak trees, floating golden fireflies, mystical atmosphere, ethereal glow, deep teal and amber color palette, fantasy illustration style, highly detailed, magical realism, soft focus background, volumetric lighting --ar 3:4 --v 6.1 --s 250"
}`;

/**
 * Analyzes a single image using Gemini AI
 */
export const analyzeImageWithGemini = async (
  imageBase64: string
): Promise<GeminiAnalysisResult> => {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in your environment.');
  }
  
  // Extract base64 data without the data URL prefix
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  // Determine MIME type
  let mimeType = 'image/png';
  if (imageBase64.includes('data:image/jpeg')) {
    mimeType = 'image/jpeg';
  } else if (imageBase64.includes('data:image/webp')) {
    mimeType = 'image/webp';
  }
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: ORACLE_SYSTEM_PROMPT
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    }
  };
  
  console.log('[Gemini] Sending image for analysis...');
  
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Gemini] API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // Extract the text response
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textResponse) {
    throw new Error('No response from Gemini API');
  }
  
  console.log('[Gemini] Raw response:', textResponse);
  
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
    
    const result = JSON.parse(cleanedResponse) as GeminiAnalysisResult;
    
    // Validate required fields
    if (!result.name || !result.description || !result.prompt) {
      throw new Error('Missing required fields in Gemini response');
    }
    
    console.log('[Gemini] Successfully parsed analysis:', result.name);
    return result;
  } catch (parseError) {
    console.error('[Gemini] Failed to parse response:', parseError);
    
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
    
    throw new Error(`Failed to parse Gemini response: ${parseError}`);
  }
};

/**
 * Analyzes multiple images in parallel
 */
export const analyzeAllImages = async (
  slices: SlicedImage[],
  onProgress?: (completed: number, total: number) => void
): Promise<AnalyzedSlice[]> => {
  const total = slices.length;
  let completed = 0;
  
  console.log(`[Gemini] Starting parallel analysis of ${total} images...`);
  
  const results = await Promise.all(
    slices.map(async (slice): Promise<AnalyzedSlice> => {
      try {
        const analysis = await analyzeImageWithGemini(slice.base64);
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
        console.error(`[Gemini] Failed to analyze slice ${slice.id}:`, error);
        
        return {
          ...slice,
          isAnalyzing: false,
          analysisError: error.message || 'Analysis failed',
        };
      }
    })
  );
  
  console.log(`[Gemini] Analysis complete. ${results.filter(r => r.prompt).length}/${total} successful.`);
  return results;
};

/**
 * Analyzes a single slice and returns updated slice
 */
export const analyzeSingleSlice = async (
  slice: SlicedImage
): Promise<AnalyzedSlice> => {
  try {
    const analysis = await analyzeImageWithGemini(slice.base64);
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
