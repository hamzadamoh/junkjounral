// Vercel Serverless Function - Proxy for Replicate API predictions
// This runs on the server, so no CORS issues

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.VITE_REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Replicate API key not configured. Set VITE_REPLICATE_API_KEY in Vercel environment variables.' 
      });
    }

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

