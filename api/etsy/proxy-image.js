// Vercel Serverless Function to proxy Etsy image downloads (bypasses CORS)
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Decode the URL
    const imageUrl = decodeURIComponent(url);

    // Fetch the image from Etsy CDN
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Etsy-Image-Proxy/1.0)',
        'Referer': 'https://www.etsy.com/',
      },
    });

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ 
        error: `Failed to fetch image: ${imageResponse.statusText}` 
      });
    }

    // Get the image buffer
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Return the image with appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    return res.status(200).send(Buffer.from(imageBuffer));

  } catch (error) {
    console.error('Etsy image proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

