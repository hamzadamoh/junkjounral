/**
 * Netlify Function - Consolidated TTAPI proxy
 * Handles: imagine, fetch, accounts, and image operations
 * Converted from Vercel serverless function format
 */

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  try {
    // Get API key and domain
    const apiKey = process.env.TTAPI_API_KEY || process.env.VITE_TTAPI_API_KEY;
    const ttapiDomain = process.env.TTAPI_DOMAIN || process.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';

    // Determine operation from query parameter
    const queryParams = event.queryStringParameters || {};
    const { operation, jobId, url, mode } = queryParams;
    const body = event.body ? JSON.parse(event.body) : {};

    // Handle different operations
    if (operation === 'imagine' || (!operation && event.httpMethod === 'POST')) {
      // POST /api/ttapi?operation=imagine or POST /api/ttapi (default)
      if (event.httpMethod !== 'POST') {
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Method not allowed' }),
        };
      }

      if (!apiKey) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Netlify environment variables.' 
          }),
        };
      }

      const { url: bodyUrl, options, prompt } = body;

      let targetUrl;
      let requestBody;
      let requestHeaders;

      if (bodyUrl && options) {
        // Generic proxy request (for upscale, etc.)
        targetUrl = bodyUrl;
        try {
          requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Invalid options.body format' }),
          };
        }
        requestHeaders = options.headers || {};
      } else if (prompt !== undefined) {
        // /imagine request
        targetUrl = `${ttapiDomain}/midjourney/v1/imagine`;
        requestBody = body;
        requestHeaders = {
          'TT-API-KEY': apiKey,
          'Content-Type': 'application/json'
        };
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Invalid request body' }),
        };
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          statusCode: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(data),
        };
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(data),
      };

    } else if (operation === 'fetch' || (event.httpMethod === 'GET' && jobId)) {
      // GET /api/ttapi?operation=fetch&jobId=... or GET /api/ttapi?jobId=...
      if (event.httpMethod !== 'GET') {
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Method not allowed' }),
        };
      }

      if (!apiKey) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Netlify environment variables.' 
          }),
        };
      }

      if (!jobId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Missing jobId query parameter' }),
        };
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
        return {
          statusCode: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(data),
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      };

    } else if (operation === 'accounts' || (event.httpMethod === 'GET' && mode !== undefined)) {
      // GET /api/ttapi?operation=accounts&mode=... or GET /api/ttapi?mode=...
      if (event.httpMethod !== 'GET') {
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Method not allowed' }),
        };
      }

      if (!apiKey) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Netlify environment variables.' 
          }),
        };
      }

      const accountMode = mode || queryParams.mode || 'fast';

      if (!ttapiDomain.includes('hold.ttapi.io')) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            accounts: [],
            count: 1,
            accountIds: []
          }),
        };
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
        return {
          statusCode: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: `Ttapi API error: ${response.status}`,
            details: errorText,
            accounts: [],
            count: 1,
            accountIds: []
          }),
        };
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

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accounts: filteredAccounts,
          count,
          accountIds
        }),
      };

    } else if (operation === 'image' || (event.httpMethod === 'GET' && url)) {
      // GET /api/ttapi?operation=image&url=... or GET /api/ttapi?url=...
      if (event.httpMethod !== 'GET') {
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Method not allowed' }),
        };
      }

      const imageUrl = url || queryParams.url;
      if (!imageUrl) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Missing image URL parameter' }),
        };
      }

      const decodedUrl = decodeURIComponent(imageUrl);
      if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Invalid image URL. Must be a valid HTTP/HTTPS URL.' }),
        };
      }

      const imageResponse = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Ttapi-Proxy/1.0)',
          'Referer': 'https://ttapi.io/'
        }
      });

      if (!imageResponse.ok) {
        return {
          statusCode: imageResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            message: `Failed to fetch image: ${imageResponse.statusText}` 
          }),
        };
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      // Convert to base64 for Netlify Functions
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: base64Image,
        isBase64Encoded: true,
      };

    } else {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          error: 'Invalid operation. Use ?operation=imagine|fetch|accounts|image or provide appropriate query parameters.' 
        }),
      };
    }

  } catch (error) {
    console.error('[Ttapi Proxy] Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error' 
      }),
    };
  }
};
