/**
 * Utility to convert Vercel-style request/response to Netlify Functions format
 * This helps convert existing Vercel handlers to work with Netlify Functions
 */

/**
 * Converts a Vercel-style handler to Netlify Functions format
 * @param {Function} vercelHandler - The Vercel handler function
 * @returns {Function} Netlify handler function
 */
export function convertVercelHandler(vercelHandler) {
  return async (event, context) => {
    // Convert Netlify event to Vercel-style req/res
    const req = {
      method: event.httpMethod,
      url: event.path + (event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : ''),
      query: event.queryStringParameters || {},
      body: event.body ? JSON.parse(event.body) : {},
      headers: event.headers || {},
      path: event.path,
      pathParameters: event.pathParameters || {},
    };

    let statusCode = 200;
    const headers = {};
    let body = null;
    let ended = false;

    const res = {
      statusCode: 200,
      setHeader: (name, value) => {
        headers[name.toLowerCase()] = value;
      },
      getHeader: (name) => {
        return headers[name.toLowerCase()];
      },
      status: (code) => {
        statusCode = code;
        res.statusCode = code;
        return res;
      },
      json: (obj) => {
        if (ended) return res;
        ended = true;
        body = JSON.stringify(obj);
        res.setHeader('content-type', 'application/json');
        return res;
      },
      send: (data) => {
        if (ended) return res;
        ended = true;
        if (Buffer.isBuffer(data)) {
          body = data.toString('base64');
          res.setHeader('content-type', 'application/octet-stream');
        } else {
          body = typeof data === 'string' ? data : JSON.stringify(data);
        }
        return res;
      },
      end: (data) => {
        if (ended) return res;
        ended = true;
        if (data) {
          if (Buffer.isBuffer(data)) {
            body = data.toString('base64');
          } else {
            body = typeof data === 'string' ? data : JSON.stringify(data);
          }
        }
        return res;
      },
    };

    try {
      await vercelHandler(req, res);
      
      // If handler didn't end the response, return default
      if (!ended) {
        body = JSON.stringify({ message: 'OK' });
      }

      return {
        statusCode: statusCode || 200,
        headers: {
          'Content-Type': headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          ...headers,
        },
        body: body || '',
      };
    } catch (error) {
      console.error('Function error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: error.message || 'Internal server error',
        }),
      };
    }
  };
}
