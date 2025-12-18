// Vercel Serverless Function - Proxy for Replicate API predictions
// This runs on the server, so no CORS issues

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // In Vercel serverless functions, use REPLICATE_API_TOKEN (not VITE_ prefix)
    // VITE_ variables are only available in the frontend build
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    
    if (!apiKey) {
      console.error('Replicate API key missing. Available env vars:', Object.keys(process.env).filter(k => k.includes('REPLICATE')));
      return res.status(500).json({ 
        error: 'Replicate API key not configured. Set REPLICATE_API_TOKEN in Vercel environment variables.' 
      });
    }
    
    // Security: Don't log API key, even partially
    // console.log('Using Replicate API key (first 10 chars):', apiKey.substring(0, 10) + '...');

    // Get the request body from the frontend
    const { version, input } = req.body;

    if (!version || !input) {
      return res.status(400).json({ error: 'Missing version or input parameters' });
    }

    // Call Replicate API from the server (no CORS issues)
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version,
        input
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Return the prediction to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error('Replicate proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

