/**
 * Vercel Serverless Function to proxy Ttapi image requests
 * This bypasses CORS restrictions by fetching images server-side
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get the image URL from query parameter
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ message: 'Missing image URL parameter' });
    }

    // Decode the URL (it might be encoded)
    const imageUrl = decodeURIComponent(url);

    // Validate that it's a valid image URL (ttapi.io may use various CDNs)
    // We'll be more permissive here since ttapi.io might use different CDNs
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return res.status(400).json({ message: 'Invalid image URL. Must be a valid HTTP/HTTPS URL.' });
    }

    console.log(`[Ttapi Proxy] Fetching image from: ${imageUrl}`);

    // Fetch the image
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Ttapi-Proxy/1.0)',
        'Referer': 'https://ttapi.io/'
      }
    });

    if (!imageResponse.ok) {
      console.error(`[Ttapi Proxy] Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
      return res.status(imageResponse.status).json({ 
        message: `Failed to fetch image: ${imageResponse.statusText}` 
      });
    }

    // Get the image data as a buffer
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    // Set CORS headers to allow the frontend to access this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Send the image data
    res.status(200).send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('[Ttapi Proxy] Error:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to proxy image' 
    });
  }
}

