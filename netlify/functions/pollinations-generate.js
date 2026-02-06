/**
 * Netlify Function - Pollinations image generation with proxy support
 * Converted from Vercel serverless function format
 */

const { HttpsProxyAgent } = require('https-proxy-agent');

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  // Only allow POST requests
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

  try {
    const { imageUrl, proxy } = JSON.parse(event.body || '{}');

    if (!imageUrl) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Missing imageUrl parameter' }),
      };
    }

    // Validate that it's a Pollinations URL for security
    if (!imageUrl.startsWith('https://image.pollinations.ai/')) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Invalid image URL. Must be from Pollinations.' }),
      };
    }

    console.log(`[Pollinations Proxy] Generating image${proxy ? ` via proxy ${proxy.host}:${proxy.port}` : ' (no proxy)'}`);

    // Build fetch options
    let fetchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Pollinations-Proxy/1.0)',
        'Referer': 'https://pollinations.ai/'
      },
      cache: 'no-cache'
    };

    // If proxy is provided, use https-proxy-agent
    if (proxy && proxy.host && proxy.port) {
      try {
        const proxyUrl = `${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        fetchOptions.agent = agent;
        console.log(`[Pollinations Proxy] Using proxy: ${proxyUrl}`);
      } catch (error) {
        console.warn(`[Pollinations Proxy] Failed to create proxy agent, using direct connection:`, error.message);
      }
    }

    // Fetch the image from Pollinations
    const imageResponse = await fetch(imageUrl, fetchOptions);

    if (!imageResponse.ok) {
      console.error(`[Pollinations Proxy] Failed to generate image: ${imageResponse.status} ${imageResponse.statusText}`);
      
      // Handle rate limiting
      if (imageResponse.status === 429) {
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': imageResponse.headers.get('Retry-After') || '10',
          },
          body: JSON.stringify({ 
            message: 'Rate limited. Please retry.',
            retryAfter: imageResponse.headers.get('Retry-After') || '10'
          }),
        };
      }
      
      return {
        statusCode: imageResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          message: `Failed to generate image: ${imageResponse.statusText}` 
        }),
      };
    }

    // Get the image data as a buffer
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    // Convert to base64 for easy transfer
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    // Send the base64 image data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ 
        success: true,
        image: dataUrl,
        contentType 
      }),
    };
  } catch (error) {
    console.error('[Pollinations Proxy] Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        success: false,
        message: error.message || 'Failed to generate image' 
      }),
    };
  }
};
