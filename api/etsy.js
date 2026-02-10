/**
 * Vercel Serverless Function - Consolidated Etsy operations
 * Handles: analyze, fetch-images, listing, proxy-image
 * This reduces 4 functions to 1 to stay within Vercel Hobby plan limit
 */
export default async function handler(req, res) {
  // Enable CORS for all operations
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Extract parameters from request
    const { operation, shopUrl, listingIds, listingId, url, apiKey } = req.body || {};
    const queryParams = req.query || {};

    // Collect all available API keys
    const apiKeys = [
      apiKey || queryParams.apiKey,
      process.env.ETSY_API_KEY_1,
      process.env.ETSY_API_KEY_2,
      process.env.ETSY_API_KEY_3,
      process.env.ETSY_API_KEY_4,
      process.env.ETSY_API_KEY_5,
      process.env.ETSY_API_KEY || process.env.VITE_ETSY_API_KEY,
    ].filter(Boolean); // Remove undefined/null/empty strings

    // Deduplicate keys
    const uniqueApiKeys = [...new Set(apiKeys)];

    if (uniqueApiKeys.length === 0 && operation !== 'proxy-image') {
      return res.status(500).json({
        error: 'Etsy API key not configured. Please provide ETSY_API_KEY_1, _2, etc., or ETSY_API_KEY environment variable.'
      });
    }

    // Helper function to fetch with key rotation and retries
    const fetchWithRotation = async (url, options = {}) => {
      let attempts = 0;
      const maxAttempts = uniqueApiKeys.length > 0 ? uniqueApiKeys.length : 1;
      const keysToTry = [...uniqueApiKeys]; // Copy to mutate

      while (attempts < maxAttempts) {
        // Pick a random key from remaining keys
        const keyIndex = Math.floor(Math.random() * keysToTry.length);
        const currentKey = keysToTry[keyIndex];

        // Remove used key from pool for this request cycle
        keysToTry.splice(keyIndex, 1);

        const headers = {
          ...options.headers,
          'x-api-key': currentKey,
        };

        try {
          const response = await fetch(url, { ...options, headers });

          // If successful or not a transferable error, return response
          if (response.ok) {
            return response;
          }

          // If 429 (Rate Limit) or 403 (Forbidden - likely invalid key), try next key
          if ((response.status === 429 || response.status === 403) && keysToTry.length > 0) {
            console.warn(`[Etsy API] Key ${currentKey.substring(0, 4)}... failed with ${response.status}. Retrying with next key...`);
            attempts++;
            continue;
          }

          // Return the failed response if we can't or shouldn't retry
          return response;

        } catch (error) {
          // Network errors might be worth retrying with another key if we strictly assume it might be key-related (unlikely but possible)
          // For now, let's treat network errors as fatal unless we want to be very aggressive
          console.error(`[Etsy API] Request failed: ${error.message}`);
          attempts++;
          if (keysToTry.length > 0) continue;
          throw error;
        }
      }

      throw new Error('All API keys failed or were exhausted.');
    };

    // Handle analyze operation
    if (operation === 'analyze' || (!operation && shopUrl)) {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!shopUrl) {
        return res.status(400).json({ error: 'Shop URL is required' });
      }

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
        const shopResponse = await fetchWithRotation(
          `https://openapi.etsy.com/v3/application/shops?shop_name=${shopIdentifier}`
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
      const shopDetailsResponse = await fetchWithRotation(
        `https://openapi.etsy.com/v3/application/shops/${shopId}`
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
        const listingsResponse = await fetchWithRotation(
          `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${perPage}&offset=${offset}`
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

        const priceNum = listing.price ? parseFloat(listing.price) : 0;
        const currency = listing.currency_code || 'USD';

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
          price: priceNum,
          currency_code: currency,
          image_url: null,
          state: listing.state || 'active',
          when_made: listing.when_made,
          who_made: listing.who_made,
        };
      });

      const shopCreationTs = shopDetails.create_date || shopDetails.created_timestamp;
      const shopCreationDate = shopCreationTs ? new Date(shopCreationTs * 1000) : null;
      const shopAgeDays = shopCreationDate
        ? Math.floor((Date.now() - shopCreationDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const avgPrice = processedListings.length > 0
        ? processedListings.reduce((sum, listing) => sum + (listing.price || 0), 0) / processedListings.length
        : 0;

      const oldestListing = processedListings.reduce((oldest, listing) => {
        if (!oldest) return listing;
        if (!listing.age_days) return oldest;
        if (!oldest.age_days) return listing;
        return listing.age_days > oldest.age_days ? listing : oldest;
      }, null);

      return res.status(200).json({
        shop_info: {
          shop_name: shopDetails.shop_name || shopIdentifier,
          shop_id: shopId,
          shop_age_days: shopAgeDays,
          total_listings: shopDetails.listing_active_count || listings.length,
          total_favorers: shopDetails.num_favorers || 0,
          total_sales: shopDetails.transaction_sold_count || 0,
          shop_url: shopUrl,
          avg_price: avgPrice,
          currency_code: processedListings[0]?.currency_code || 'USD',
          oldest_listing_age_days: oldestListing?.age_days || null,
          shop_location: shopDetails.location || null,
        },
        listings: processedListings,
      });

      // Handle fetch-images operation
    } else if (operation === 'fetch-images' || (!operation && listingIds && Array.isArray(listingIds))) {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
        return res.status(400).json({ error: 'Listing IDs array is required' });
      }

      const results = [];

      for (let i = 0; i < listingIds.length; i++) {
        const listingId = listingIds[i];

        try {
          const imagesResponse = await fetchWithRotation(
            `https://openapi.etsy.com/v3/application/listings/${listingId}/images`
          );

          if (!imagesResponse.ok) {
            results.push({
              listing_id: listingId,
              success: false,
              error: `Failed to fetch images: ${imagesResponse.statusText}`,
              image_url: null
            });
            continue;
          }

          const imagesData = await imagesResponse.json();
          const images = imagesData.results || [];

          if (images.length === 0) {
            results.push({
              listing_id: listingId,
              success: false,
              error: 'No images found for this listing',
              image_url: null
            });
            continue;
          }

          const firstImage = images[0];
          const imageUrl = firstImage.url_fullxfull || firstImage.url_570xN || firstImage.url_75x75;

          if (!imageUrl) {
            results.push({
              listing_id: listingId,
              success: false,
              error: 'No valid image URL found',
              image_url: null
            });
            continue;
          }

          results.push({
            listing_id: listingId,
            success: true,
            image_url: imageUrl
          });

          if (i < listingIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          results.push({
            listing_id: listingId,
            success: false,
            error: error.message || 'Unknown error',
            image_url: null
          });
        }
      }

      return res.status(200).json({
        success: true,
        total: listingIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      });

      // Handle listing operation (GET listing images)
    } else if (operation === 'listing' || (!operation && queryParams.listingId)) {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const listingId = queryParams.listingId || listingId;

      if (!listingId) {
        return res.status(400).json({ error: 'Missing listingId parameter' });
      }

      const imagesResponse = await fetchWithRotation(
        `https://openapi.etsy.com/v3/application/listings/${listingId}/images`
      );

      if (!imagesResponse.ok) {
        const errorText = await imagesResponse.text();
        return res.status(imagesResponse.status).json({
          error: `Etsy API error: ${imagesResponse.status} ${imagesResponse.statusText}`,
          details: errorText
        });
      }

      const data = await imagesResponse.json();
      return res.status(200).json(data);

      // Handle proxy-image operation
    } else if (operation === 'proxy-image' || (!operation && (queryParams.url || url))) {
      // ... (proxy-image implementation remains similar but no API key needed usually for public image URLs, 
      // though if it does, it would use fetchWithRotation if we changed it. 
      // Standard proxy-image doesn't use API key for pulling images from Etsy CDN)
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      const imageUrl = queryParams.url || url;

      if (!imageUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      const decodedUrl = decodeURIComponent(imageUrl);

      const imageResponse = await fetch(decodedUrl, {
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

      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.status(200);
      return res.end(Buffer.from(imageBuffer));

    } else {
      return res.status(400).json({
        error: 'Invalid operation. Use ?operation=analyze, fetch-images, listing, or proxy-image, or provide appropriate parameters.'
      });
    }

  } catch (error) {
    console.error('[Etsy API] Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}

