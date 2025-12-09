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
 * The system prompt for the Oracle - instructs GPT-4 on how to analyze images
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
 * Analyzes a single image using OpenAI GPT-4 Vision
 */
export const analyzeImageWithOracle = async (
  imageBase64: string
): Promise<OracleAnalysisResult> => {
  const apiKey = getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in your environment.');
  }
  
  // Ensure the image has a proper data URL prefix
  let imageUrl = imageBase64;
  if (!imageBase64.startsWith('data:')) {
    imageUrl = `data:image/png;base64,${imageBase64}`;
  }
  
  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: ORACLE_SYSTEM_PROMPT
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
            text: 'Analyze this image and provide the JSON response with name, description, and Midjourney prompt.'
          }
        ]
      }
    ],
    max_tokens: 1024,
    temperature: 0.7,
  };
  
  console.log('[Oracle] Sending image for analysis with GPT-4 Vision...');
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
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
 */
export const analyzeAllImages = async (
  slices: SlicedImage[],
  onProgress?: (completed: number, total: number) => void
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
          const analysis = await analyzeImageWithOracle(slice.base64);
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
 */
export const analyzeSingleSlice = async (
  slice: SlicedImage
): Promise<AnalyzedSlice> => {
  try {
    const analysis = await analyzeImageWithOracle(slice.base64);
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

