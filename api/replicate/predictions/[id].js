// Vercel Serverless Function - Proxy for polling Replicate prediction status
// GET /api/replicate/predictions/[id]

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.VITE_REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Replicate API key not configured' 
      });
    }

    // Get prediction ID from the URL
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing prediction ID' });
    }

    // Call Replicate API from the server
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Return the prediction status to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error('Replicate polling proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

