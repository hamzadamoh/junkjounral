import * as cheerio from 'cheerio';

/**
 * Etsy operations handler - Uses Official Etsy API V3
 * Handles: fetch-images, listing, proxy-image, scrape-details (now via API)
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const queryParams = req.query || {};
    const bodyParams = req.body || {};
    const operation = queryParams.operation || bodyParams.operation;
    const url = queryParams.url || bodyParams.url;
    const listingIdParam = queryParams.listingId || bodyParams.listingId;
    const listingIds = bodyParams.listingIds || [];

    // Use single key: ETSY_API_KEY
    const apiKey = bodyParams.apiKey || queryParams.apiKey || process.env.ETSY_API_KEY || process.env.VITE_ETSY_API_KEY;

    // Helper to extract listing ID from URL
    const extractListingId = (input) => {
      if (!input) return null;
      if (/^\d+$/.test(input)) return input;
      const match = input.match(/listing\/(\d+)/);
      return match ? match[1] : null;
    };

    // Official API: Fetch Listing Details
    const fetchListingFromAPI = async (id) => {
      if (!apiKey) throw new Error('Etsy API Key (ETSY_API_KEY) is missing');

      console.log(`[Etsy API] Fetching listing ${id}...`);
      const response = await fetch(`https://openapi.etsy.com/v3/application/listings/${id}?includes=Images`, {
        headers: { 'x-api-key': apiKey }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Etsy API Error: ${response.status}`);
      }

      return await response.json();
    };

    // Scraper Fallback (Optional, but user said "use official API")
    // We'll keep it as a very basic fallback or just use API exclusively for details
    const getDetailsViaAPI = async (idOrUrl) => {
      const id = extractListingId(idOrUrl);
      if (!id) throw new Error('Invalid Listing ID or URL');

      const data = await fetchListingFromAPI(id);

      return {
        success: true,
        title: data.title,
        description: data.description,
        tags: data.tags || [],
        imageUrl: data.images?.[0]?.url_fullxfull || data.images?.[0]?.url_570xN,
        listingId: data.listing_id.toString()
      };
    };

    // Operations
    if (operation === 'scrape-details' || (!operation && url && url.includes('etsy.com/listing'))) {
      const target = queryParams.url || bodyParams.url || url;
      try {
        const result = await getDetailsViaAPI(target);
        return res.status(200).json(result);
      } catch (err) {
        console.error('[Etsy API] Error:', err.message);
        return res.status(err.message.includes('Key') ? 401 : 500).json({ error: err.message });
      }

    } else if (operation === 'fetch-images' || (!operation && listingIds.length > 0)) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const results = [];
      for (const id of listingIds) {
        try {
          const data = await fetchListingFromAPI(id);
          results.push({
            listing_id: id,
            success: true,
            image_url: data.images?.[0]?.url_fullxfull || data.images?.[0]?.url_570xN
          });
        } catch (err) {
          results.push({ listing_id: id, success: false, error: err.message });
        }
      }
      return res.status(200).json({ success: true, results });

    } else if (operation === 'listing' || (!operation && listingIdParam)) {
      const id = extractListingId(listingIdParam);
      try {
        const data = await fetchListingFromAPI(id);
        const images = (data.images || []).map(img => ({
          url_fullxfull: img.url_fullxfull,
          url_570xN: img.url_570xN,
          url_75x75: img.url_75x75
        }));
        return res.status(200).json({ count: images.length, results: images });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }

    } else if (operation === 'proxy-image') {
      const imageUrl = queryParams.url || url;
      if (!imageUrl) return res.status(400).json({ error: 'Missing url' });

      const imgRes = await fetch(decodeURIComponent(imageUrl), {
        headers: { 'User-Agent': 'Etsy-Image-Proxy/1.0', 'Referer': 'https://www.etsy.com/' }
      });

      if (!imgRes.ok) return res.status(imgRes.status).json({ error: 'Failed to fetch image' });

      const buffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(Buffer.from(buffer));

    } else {
      return res.status(400).json({ error: 'Invalid operation' });
    }

  } catch (error) {
    console.error('[Etsy Handler] Fatal:', error);
    return res.status(500).json({ error: error.message });
  }
}

