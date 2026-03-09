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

    const fetchAI = async (currentModel, retryCount = 0) => {
      console.log(`[AI Proxy] Request to ${currentModel} (Attempt ${retryCount + 1})`);

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
        console.warn(`[AI Proxy] ${currentModel} returned ${response.status}. retryCount: ${retryCount}`);

        // Define fallback map for free models
        const fallbacks = {
          'google/gemma-3-27b-it:free': 'nvidia/nemotron-nano-12b-v2-vl:free',
          'meta-llama/llama-3.3-70b-instruct:free': 'qwen/qwen3-coder:free'
        };

        const fallbackModel = fallbacks[currentModel];

        if (retryCount < 2) {
          // Attempt 1 & 2: Wait and retry SAME model
          const delay = (retryCount + 1) * 2000;
          console.log(`[AI Proxy] Retrying ${currentModel} in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          return fetchAI(currentModel, retryCount + 1);
        } else if (fallbackModel) {
          // Third attempt failed: Swap to FALLBACK model
          console.log(`[AI Proxy] Exceeded retries for ${currentModel}. Failing over to: ${fallbackModel}`);
          await new Promise(r => setTimeout(r, 1000));
          return fetchAI(fallbackModel, 0); // Reset retry count for fallback
        }
      }

      return response;
    };

    const response = await fetchAI(model);
    const data = await response.json();

    if (!response.ok) {
      console.error('AI Proxy API error:', data);
      return res.status(response.status).json(data);
    }

    // Return the response to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error('AI proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
