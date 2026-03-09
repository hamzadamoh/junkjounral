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

    // Call API from the server (no CORS issues, API key hidden)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(response.status).json(data);
    }

    // Return the response to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

