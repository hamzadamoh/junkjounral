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
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { url, options, prompt } = req.body;

    let targetUrl;
    let requestBody;
    let requestHeaders;

    if (url && options) {
      // Generic proxy request (for upscale, etc.)
      targetUrl = url;
      // options.body might already be a string or an object
      try {
        requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      } catch (e) {
        return res.status(400).json({ error: 'Invalid options.body format' });
      }
      requestHeaders = options.headers || {};
      console.log(`[Ttapi Proxy] Generic request to: ${targetUrl}`);
    } else if (prompt !== undefined) {
      // /imagine request - preserve all fields (prompt, getUImages, etc.)
      targetUrl = `${ttapiDomain}/midjourney/v1/imagine`;
      // Preserve all fields from req.body (prompt, getUImages, aspect_ratio, process_mode, etc.)
      requestBody = req.body;
      requestHeaders = {
        'TT-API-KEY': apiKey,
        'Content-Type': 'application/json'
      };
      const promptPreview = typeof prompt === 'string' && prompt.length > 100 
        ? prompt.substring(0, 100) + '...' 
        : (prompt || 'N/A');
      console.log(`[Ttapi Proxy] Creating task with prompt: ${promptPreview}`);
      console.log(`[Ttapi Proxy] Request body includes:`, Object.keys(requestBody || {}).join(', '));
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

    // Read response once - check status and parse accordingly
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[Ttapi Proxy] API error: ${response.status} - ${responseText}`);
      return res.status(response.status).json({ 
        error: `Ttapi API error: ${response.status}`,
        details: responseText 
      });
    }

    // Parse JSON from the text we already read
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`[Ttapi Proxy] Failed to parse JSON response:`, responseText);
      return res.status(500).json({ 
        error: 'Invalid JSON response from Ttapi',
        details: responseText 
      });
    }
    
    console.log(`[Ttapi Proxy] Request successful:`, data);

    // Set CORS headers to allow the frontend to access this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Return the response from ttapi.io
    res.status(200).json(data);
  } catch (error) {
    console.error('[Ttapi Proxy] Error:', error);
    console.error('[Ttapi Proxy] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

