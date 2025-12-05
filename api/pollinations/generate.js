/**
 * Vercel Serverless Function to generate Pollinations images with proxy support
 * This allows parallel requests through different proxies to speed up generation
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { imageUrl, proxy } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: 'Missing imageUrl parameter' });
    }

    // Validate that it's a Pollinations URL for security
    if (!imageUrl.startsWith('https://image.pollinations.ai/')) {
      return res.status(400).json({ message: 'Invalid image URL. Must be from Pollinations.' });
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
        const { HttpsProxyAgent } = await import('https-proxy-agent');
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
        return res.status(429).json({ 
          message: 'Rate limited. Please retry.',
          retryAfter: imageResponse.headers.get('Retry-After') || '10'
        });
      }
      
      return res.status(imageResponse.status).json({ 
        message: `Failed to generate image: ${imageResponse.statusText}` 
      });
    }

    // Get the image data as a buffer
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    // Convert to base64 for easy transfer
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Send the base64 image data
    res.status(200).json({ 
      success: true,
      image: dataUrl,
      contentType 
    });
  } catch (error) {
    console.error('[Pollinations Proxy] Error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to generate image' 
    });
  }
}

