// Vercel Serverless Function to fetch Etsy listing image URLs
// The client will handle uploading to WordPress

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { listingIds, apiKey } = req.body;

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'Listing IDs array is required' });
    }

    // Use provided API key or fall back to environment variable
    const etsyApiKey = apiKey || process.env.ETSY_API_KEY;
    if (!etsyApiKey) {
      return res.status(500).json({ 
        error: 'Etsy API key not configured. Please provide an API key or set ETSY_API_KEY environment variable.' 
      });
    }

    const headers = { 'x-api-key': etsyApiKey };
    const results = [];

    // Process each listing
    for (let i = 0; i < listingIds.length; i++) {
      const listingId = listingIds[i];
      
      try {
        // Fetch listing images from Etsy API
        const imagesResponse = await fetch(
          `https://openapi.etsy.com/v3/application/listings/${listingId}/images`,
          { headers }
        );

        if (!imagesResponse.ok) {
          console.error(`Failed to fetch images for listing ${listingId}: ${imagesResponse.statusText}`);
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

        // Get the first image (full size preferred)
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

        // Small delay to avoid rate limiting
        if (i < listingIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`Error processing listing ${listingId}:`, error);
        results.push({
          listing_id: listingId,
          success: false,
          error: error.message || 'Unknown error',
          image_url: null
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    res.status(200).json({
      success: true,
      total: listingIds.length,
      successful: successCount,
      failed: failedCount,
      results: results
    });

  } catch (error) {
    console.error('[Etsy Images API] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch images' 
    });
  }
}

