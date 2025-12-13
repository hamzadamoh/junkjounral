/**
 * Vercel serverless function to fetch Etsy listing images
 * Proxies the request to bypass CORS restrictions
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { listingId } = req.query;

  if (!listingId) {
    return res.status(400).json({ error: 'Missing listingId parameter' });
  }

  const etsyApiKey = process.env.VITE_ETSY_API_KEY;

  if (!etsyApiKey) {
    return res.status(500).json({ error: 'Etsy API key not configured' });
  }

  try {
    console.log(`[Etsy Proxy] Fetching listing ${listingId}`);

    // Fetch listing images from Etsy API v3
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/listings/${listingId}/images`,
      {
        headers: {
          'x-api-key': etsyApiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Etsy Proxy] API error:', errorText);
      return res.status(response.status).json({ 
        error: `Etsy API error: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log(`[Etsy Proxy] Found ${data.results?.length || 0} images`);

    return res.status(200).json(data);
  } catch (error) {
    console.error('[Etsy Proxy] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch Etsy listing' });
  }
}

