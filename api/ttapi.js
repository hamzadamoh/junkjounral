/**
 * Vercel Serverless Function - Consolidated TTAPI proxy
 * Handles: imagine, fetch, accounts, and image operations
 * This reduces 4 functions to 1 to stay within Vercel Hobby plan limit
 */
export default async function handler(req, res) {
  try {
    // Get API key and domain
    const apiKey = process.env.TTAPI_API_KEY || process.env.VITE_TTAPI_API_KEY;
    const ttapiDomain = process.env.TTAPI_DOMAIN || process.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';

    // Determine operation from query parameter
    const { operation, jobId, url, mode } = req.query;

    // Handle different operations
    if (operation === 'imagine' || (!operation && req.method === 'POST')) {
      // POST /api/ttapi?operation=imagine or POST /api/ttapi (default)
      if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Vercel environment variables.' 
        });
      }

      const { url: bodyUrl, options, prompt } = req.body || {};

      let targetUrl;
      let requestBody;
      let requestHeaders;

      if (bodyUrl && options) {
        // Generic proxy request (for upscale, etc.)
        targetUrl = bodyUrl;
        try {
          requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          return res.status(400).json({ error: 'Invalid options.body format' });
        }
        requestHeaders = options.headers || {};
      } else if (prompt !== undefined) {
        // /imagine request
        targetUrl = `${ttapiDomain}/midjourney/v1/imagine`;
        requestBody = req.body;
        requestHeaders = {
          'TT-API-KEY': apiKey,
          'Content-Type': 'application/json'
        };
      } else {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      return res.status(200).json(data);

    } else if (operation === 'fetch' || (req.method === 'GET' && jobId)) {
      // GET /api/ttapi?operation=fetch&jobId=... or GET /api/ttapi?jobId=...
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Vercel environment variables.' 
        });
      }

      if (!jobId) {
        return res.status(400).json({ error: 'Missing jobId query parameter' });
      }

      const response = await fetch(`${ttapiDomain}/midjourney/v1/fetch?jobId=${jobId}`, {
        method: 'GET',
        headers: {
          'TT-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).json(data);

    } else if (operation === 'accounts' || (req.method === 'GET' && mode !== undefined)) {
      // GET /api/ttapi?operation=accounts&mode=... or GET /api/ttapi?mode=...
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Vercel environment variables.' 
        });
      }

      const accountMode = mode || req.query.mode || 'fast';

      if (!ttapiDomain.includes('hold.ttapi.io')) {
        return res.status(200).json({ 
          accounts: [],
          count: 1,
          accountIds: []
        });
      }

      const response = await fetch(`${ttapiDomain}/midjourney/v1/accounts`, {
        method: 'GET',
        headers: {
          'TT-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: `Ttapi API error: ${response.status}`,
          details: errorText,
          accounts: [],
          count: 1,
          accountIds: []
        });
      }

      const data = await response.json();
      const accounts = data.accounts || data.data?.accounts || [];

      let filteredAccounts = accounts;
      if (accountMode === 'fast') {
        filteredAccounts = accounts.filter((acc) => 
          acc.fast_time_remaining > 0 || acc.has_fast_time || acc.fast_hours > 0
        );
        if (filteredAccounts.length === 0) {
          filteredAccounts = accounts;
        }
      }

      const accountIds = filteredAccounts
        .filter((acc) => acc.status === 'active')
        .map((acc) => acc.id || acc.account_id)
        .filter((id) => id);

      const count = Math.max(accountIds.length || filteredAccounts.length || 1, 1);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).json({
        accounts: filteredAccounts,
        count,
        accountIds
      });

    } else if (operation === 'image' || (req.method === 'GET' && url)) {
      // GET /api/ttapi?operation=image&url=... or GET /api/ttapi?url=...
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      const imageUrl = url || req.query.url;
      if (!imageUrl) {
        return res.status(400).json({ message: 'Missing image URL parameter' });
      }

      const decodedUrl = decodeURIComponent(imageUrl);
      if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
        return res.status(400).json({ message: 'Invalid image URL. Must be a valid HTTP/HTTPS URL.' });
      }

      const imageResponse = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Ttapi-Proxy/1.0)',
          'Referer': 'https://ttapi.io/'
        }
      });

      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ 
          message: `Failed to fetch image: ${imageResponse.statusText}` 
        });
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(Buffer.from(imageBuffer));

    } else {
      return res.status(400).json({ 
        error: 'Invalid operation. Use ?operation=imagine|fetch|accounts|image or provide appropriate query parameters.' 
      });
    }

  } catch (error) {
    console.error('[Ttapi Proxy] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}

