// Vercel Serverless Function - Proxy for Replicate API predictions
// This runs on the server, so no CORS issues

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Support multiple API keys for rotation
    // Option 1: Comma-separated keys in REPLICATE_API_TOKENS
    // Option 2: Individual keys REPLICATE_API_TOKEN_1, REPLICATE_API_TOKEN_2, etc.
    // Option 3: Single key REPLICATE_API_TOKEN (fallback)
    
    let apiKeys = [];
    
    // Check for comma-separated keys
    if (process.env.REPLICATE_API_TOKENS) {
      apiKeys = process.env.REPLICATE_API_TOKENS.split(',').map(k => k.trim()).filter(k => k);
    } else {
      // Check for numbered keys (REPLICATE_API_TOKEN_1, REPLICATE_API_TOKEN_2, etc.)
      let keyIndex = 1;
      while (process.env[`REPLICATE_API_TOKEN_${keyIndex}`]) {
        apiKeys.push(process.env[`REPLICATE_API_TOKEN_${keyIndex}`]);
        keyIndex++;
      }
    }
    
    // Fallback to single key
    if (apiKeys.length === 0) {
      const singleKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
      if (singleKey) {
        apiKeys = [singleKey];
      }
    }
    
    if (apiKeys.length === 0) {
      console.error('Replicate API key missing. Available env vars:', Object.keys(process.env).filter(k => k.includes('REPLICATE')));
      return res.status(500).json({ 
        error: 'Replicate API key not configured. Set REPLICATE_API_TOKEN or REPLICATE_API_TOKENS in Vercel environment variables.' 
      });
    }
    
    // Get key index from request body (for rotation) or use first key
    const { version, input, keyIndex } = req.body;
    const selectedKeyIndex = (keyIndex !== undefined && keyIndex >= 0 && keyIndex < apiKeys.length) 
      ? keyIndex 
      : 0;
    const apiKey = apiKeys[selectedKeyIndex];
    
    console.log(`Using Replicate API key ${selectedKeyIndex + 1}/${apiKeys.length} (first 10 chars):`, apiKey.substring(0, 10) + '...');

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

