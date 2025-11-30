// Vercel Serverless Function - Proxy for getting Replicate model versions
// GET /api/replicate/models/[model]/versions

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // In Vercel serverless functions, use REPLICATE_API_TOKEN (not VITE_ prefix)
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Replicate API key not configured' 
      });
    }

    // Get model name from the URL
    const { model } = req.query;

    if (!model) {
      return res.status(400).json({ error: 'Missing model name' });
    }

    // Call Replicate API from the server
    const response = await fetch(`https://api.replicate.com/v1/models/${model}/versions`, {
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

    // Return the model versions to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error('Replicate model versions proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

