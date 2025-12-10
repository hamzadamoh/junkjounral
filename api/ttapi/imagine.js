/**
 * Vercel Serverless Function to proxy ttapi.io Midjourney imagine requests
 * This bypasses CORS restrictions by making API calls server-side
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
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

    // Check if this is a generic proxy request (for upscale or other endpoints)
    const { url, options, prompt } = req.body;

    let targetUrl: string;
    let requestBody: any;
    let requestHeaders: any;

    if (url && options) {
      // Generic proxy request (for upscale, etc.)
      targetUrl = url;
      requestBody = JSON.parse(options.body);
      requestHeaders = options.headers;
      console.log(`[Ttapi Proxy] Generic request to: ${targetUrl}`);
    } else if (prompt) {
      // Legacy /imagine request
      targetUrl = `${ttapiDomain}/midjourney/v1/imagine`;
      requestBody = { prompt };
      requestHeaders = {
        'TT-API-KEY': apiKey,
        'Content-Type': 'application/json'
      };
      console.log(`[Ttapi Proxy] Creating task with prompt: ${prompt.substring(0, 100)}...`);
    } else {
      return res.status(400).json({ error: 'Missing prompt or url/options in request body' });
    }

    console.log(`[Ttapi Proxy] Using domain: ${ttapiDomain}`);

    // Call ttapi.io API FROM THE SERVER (Securely)
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
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
    console.log(`[Ttapi Proxy] Request successful:`, data);

    // Set CORS headers to allow the frontend to access this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
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

