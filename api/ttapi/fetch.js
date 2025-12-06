/**
 * Vercel Serverless Function to proxy ttapi.io Midjourney fetch requests
 * This bypasses CORS restrictions by making API calls server-side
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get API key from environment variable (without VITE_ prefix for serverless functions)
    const apiKey = process.env.TTAPI_API_KEY || process.env.VITE_TTAPI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Vercel environment variables.' 
      });
    }

    // Get Ttapi domain from environment variable (defaults to PPU mode)
    // Hold Account Mode: https://hold.ttapi.io
    // PPU Mode: https://api.ttapi.io
    const ttapiDomain = process.env.TTAPI_DOMAIN || process.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';

    // Get the jobId from query parameter
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId query parameter' });
    }

    console.log(`[Ttapi Proxy] Fetching status for job: ${jobId}`);
    console.log(`[Ttapi Proxy] Using domain: ${ttapiDomain}`);

    // Call ttapi.io API FROM THE SERVER (Securely)
    const response = await fetch(`${ttapiDomain}/midjourney/v1/fetch?jobId=${jobId}`, {
      method: 'GET',
      headers: {
        'TT-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Ttapi Proxy] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `Ttapi API error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();

    // Set CORS headers to allow the frontend to access this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Return the response from ttapi.io
    res.status(200).json(data);
  } catch (error) {
    console.error('[Ttapi Proxy] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}

