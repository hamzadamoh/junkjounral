// Vercel Serverless Function - Proxy for OpenAI API
// This runs on the server, so API keys are not exposed to the client

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get the request body from the frontend
    const { model, messages, max_tokens, temperature, isOpenRouter } = req.body;

    // Use server-side environment variable (NO VITE_ prefix)
    const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
    const apiUrl = isOpenRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    if (!apiKey) {
      console.error(`${isOpenRouter ? 'OpenRouter' : 'OpenAI'} API key missing`);
      return res.status(500).json({
        error: `${isOpenRouter ? 'OpenRouter' : 'OpenAI'} API key not configured. Set it in Vercel environment variables.`
      });
    }

    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing model or messages parameters' });
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (isOpenRouter) {
      headers['HTTP-Referer'] = req.headers.referer || 'http://localhost:3000';
      headers['X-Title'] = 'Etsy SEO Optimizer';
    }

    const fetchAI = async (currentModel, attempt = 1) => {
      console.log(`[AI Proxy] ${currentModel} - Attempt ${attempt}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: currentModel,
          messages,
          max_tokens,
          temperature,
        }),
      });

      // Handle Rate Limits (429) or Temporary Service Issues (503/502)
      if ((response.status === 429 || response.status === 503 || response.status === 502) && isOpenRouter) {
        console.warn(`[AI Proxy] ${currentModel} returned ${response.status} on attempt ${attempt}`);

        // --- TEXT FALLBACK CHAIN ---
        const textChain = [
          'meta-llama/llama-3.3-70b-instruct:free',
          'qwen/qwen-2.5-72b-instruct:free',
          'mistralai/mistral-7b-instruct:free'
        ];

        // --- VISION FALLBACK CHAIN ---
        const visionChain = [
          'google/gemma-3-27b-it:free',
          'google/gemma-3-12b-it:free'
        ];

        const isVision = currentModel.includes('gemma') || (messages[0]?.content && Array.isArray(messages[0].content) && messages[0].content.some(c => c.type === 'image_url'));

        if (isVision) {
          // Vision specific logic
          if (attempt < visionChain.length) {
            const nextVisionModel = visionChain[attempt]; // attempt 1 -> index 1
            console.log(`[AI Proxy] Vision Fallback: ${currentModel} -> ${nextVisionModel}`);
            return fetchAI(nextVisionModel, attempt + 1);
          } else {
            console.error(`[AI Proxy] All vision models failed. Signaling skip to frontend.`);
            // Return a 202 "Accepted" with a flag so frontend knows to degrade gracefully
            return {
              status: 202,
              ok: true,
              json: async () => ({
                choices: [{ message: { content: "Visual analysis unavailable (all models busy)" } }],
                usage: { total_tokens: 0 }
              })
            };
          }
        } else {
          // Text specific logic with explicit delays
          const delays = [1000, 2000, 5000]; // 1s, 2s, 5s
          const currentDelay = delays[attempt - 1] || 5000;

          if (attempt < textChain.length) {
            const nextTextModel = textChain[attempt];
            console.log(`[AI Proxy] Text Retry/Fallback in ${currentDelay}ms: ${currentModel} -> ${nextTextModel}`);
            await new Promise(r => setTimeout(r, currentDelay));
            return fetchAI(nextTextModel, attempt + 1);
          } else {
            console.error(`[AI Proxy] All text models failed after ${attempt} attempts.`);
            return response; // Return the final 429/503
          }
        }
      }

      return response;
    };

    const response = await fetchAI(model);
    const data = await response.json();

    if (!response.ok && response.status !== 202) {
      console.error('AI Proxy API error:', data);
      return res.status(response.status).json(data);
    }

    // Return the response to the frontend
    res.status(response.status || 200).json(data);

  } catch (error) {
    console.error('AI proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
