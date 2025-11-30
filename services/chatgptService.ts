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
  variationNumber: number
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY in your environment variables.');
  }

  const systemPrompt = `You are a creative prompt engineer specializing in junk journal page descriptions. Generate detailed, unique prompts for AI image generation that are specific, visually rich, and varied.`;

  const userPrompt = `Create a unique prompt for variation #${variationNumber} of a ${theme} junk journal page. Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}Make it unique with specific visual details, colors, lighting, and mood. 2-3 sentences. Return ONLY the prompt.`;

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
        temperature: 0.9, // Higher temperature for more creative variation
        max_tokens: 150, // Reduced for faster generation
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

