// Vercel Serverless Function - Proxy for OpenAI API
// This runs on the server, so API keys are not exposed to the client

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Use server-side environment variable (NO VITE_ prefix)
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('OpenAI API key missing');
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Set OPENAI_API_KEY in Vercel environment variables.' 
      });
    }

    // Get the request body from the frontend
    const { model, messages, max_tokens, temperature } = req.body;

    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing model or messages parameters' });
    }

    // Call OpenAI API from the server (no CORS issues, API key hidden)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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

