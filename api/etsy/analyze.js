// Vercel Serverless Function for Etsy Shop Analysis
// This proxies Etsy API calls to keep the API key secure

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { shopUrl, apiKey } = req.body;

    if (!shopUrl) {
      return res.status(400).json({ error: 'Shop URL is required' });
    }

    // Use provided API key or fall back to environment variable
    const etsyApiKey = apiKey || process.env.ETSY_API_KEY;
    if (!etsyApiKey) {
      return res.status(500).json({ 
        error: 'Etsy API key not configured. Please provide an API key or set ETSY_API_KEY environment variable.' 
      });
    }

    const headers = { 'x-api-key': etsyApiKey };

    // Extract shop identifier from URL
    const shopUrlObj = new URL(shopUrl);
    const pathMatch = shopUrlObj.pathname.match(/shop\/([^/]+)/);
    if (!pathMatch) {
      return res.status(400).json({ error: 'Invalid Etsy shop URL format' });
    }

    const shopIdentifier = pathMatch[1];
    const isNumeric = /^\d+$/.test(shopIdentifier);
    
    // Get shop ID
    let shopId;
    if (isNumeric) {
      shopId = shopIdentifier;
    } else {
      const shopResponse = await fetch(
        `https://openapi.etsy.com/v3/application/shops?shop_name=${shopIdentifier}`,
        { headers }
      );
      if (!shopResponse.ok) {
        throw new Error(`Failed to get shop ID: ${shopResponse.statusText}`);
      }
      const shopData = await shopResponse.json();
      if (!shopData.results || shopData.results.length === 0) {
        return res.status(404).json({ error: 'Shop not found' });
      }
      shopId = shopData.results[0].shop_id;
    }

    // Get shop details
    const shopDetailsResponse = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${shopId}`,
      { headers }
    );
    if (!shopDetailsResponse.ok) {
      throw new Error(`Failed to get shop details: ${shopDetailsResponse.statusText}`);
    }
    const shopDetails = await shopDetailsResponse.json();

    // Get all listings (with pagination)
    const listings = [];
    let page = 0;
    const perPage = 100;
    let totalListings = null;

    while (true) {
      const offset = page * perPage;
      const listingsResponse = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${perPage}&offset=${offset}`,
        { headers }
      );
      
      if (!listingsResponse.ok) {
        throw new Error(`Failed to get listings: ${listingsResponse.statusText}`);
      }

      const listingsData = await listingsResponse.json();
      
      if (totalListings === null) {
        totalListings = listingsData.count || 0;
      }

      const results = listingsData.results || [];
      listings.push(...results);

      if (results.length < perPage || listings.length >= totalListings) {
        break;
      }

      page++;
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process listings
    const processedListings = listings.map(listing => {
      const creationTs = listing.creation_timestamp || listing.created_timestamp;
      const modifiedTs = listing.last_modified_timestamp || listing.updated_timestamp;
      
      const creationDate = creationTs ? new Date(creationTs * 1000) : null;
      const modifiedDate = modifiedTs ? new Date(modifiedTs * 1000) : null;
      const ageDays = creationDate 
        ? Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        listing_id: listing.listing_id,
        shop_id: listing.shop_id,
        title: listing.title,
        views: listing.views || 0,
        favorites: listing.num_favorers || 0,
        stock: listing.quantity || 0,
        age_days: ageDays,
        last_modified: modifiedDate ? modifiedDate.toISOString() : null,
        is_digital: listing.listing_type === 'download',
        tags: listing.tags || [],
        price: listing.price,
        currency_code: listing.currency_code,
      };
    });

    // Process shop info
    const shopCreationTs = shopDetails.create_date || shopDetails.created_timestamp;
    const shopCreationDate = shopCreationTs ? new Date(shopCreationTs * 1000) : null;
    const shopAgeDays = shopCreationDate 
      ? Math.floor((Date.now() - shopCreationDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const responseData = {
      shop_info: {
        shop_name: shopDetails.shop_name || shopIdentifier,
        shop_id: shopId,
        shop_age_days: shopAgeDays,
        total_listings: shopDetails.listing_active_count || listings.length,
        total_favorers: shopDetails.num_favorers || 0,
        total_sales: shopDetails.transaction_sold_count || 0,
        shop_url: shopUrl,
      },
      listings: processedListings,
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error('[Etsy API] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to analyze Etsy shop' 
    });
  }
}

