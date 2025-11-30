// Vercel Serverless Function - Get number of available API keys
// GET /api/replicate/keys

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Support multiple API keys for rotation
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
    
    // Return number of keys (without exposing the actual keys)
    res.status(200).json({ 
      keyCount: apiKeys.length,
      message: apiKeys.length > 1 
        ? `Using ${apiKeys.length} API keys for rotation` 
        : 'Using single API key'
    });

  } catch (error) {
    console.error('Replicate keys endpoint error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

