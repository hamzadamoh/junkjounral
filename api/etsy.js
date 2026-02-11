import * as cheerio from 'cheerio';

/**
 * Koyeb/Vercel serverless - Etsy operations (scraper + proxy only; no Etsy API)
 * Handles: analyze (501), fetch-images, listing, proxy-image
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
    // Extract parameters: GET uses query, POST uses body
    const queryParams = req.query || {};
    const bodyParams = req.body || {};
    const operation = queryParams.operation || bodyParams.operation;
    const shopUrl = bodyParams.shopUrl;
    const listingIds = bodyParams.listingIds;
    const listingIdParam = queryParams.listingId || bodyParams.listingId;
    const url = queryParams.url || bodyParams.url;

    // Scraper (no Etsy API)
    const scrapeListingImages = async (listingId) => {
      console.log(`[Etsy Scraper] Scraping images for listing ${listingId}...`);
      let html = '';
      try {
        const response = await fetch(`https://www.etsy.com/listing/${listingId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.google.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
          }
        });

        try {
          html = await response.text();
        } catch (e) {
          console.error(`[Etsy Scraper] response.text() failed:`, e.message);
          return { error: e.message, pageTitle: 'Error occurred', snippet: null, images: [] };
        }

        let $;
        try {
          $ = cheerio.load(html);
        } catch (e) {
          console.error(`[Etsy Scraper] cheerio.load failed:`, e.message);
          return { error: e.message, pageTitle: 'Error occurred', snippet: html.substring(0, 300), images: [] };
        }

        if (!response.ok) {
          console.warn(`[Etsy Scraper] HTTP ${response.status}`);
          const title = ($('title').text() || '').trim() || 'No Title';
          return { error: `HTTP ${response.status}`, pageTitle: title, snippet: html.substring(0, 500), images: [] };
        }

        const images = [];

        // Strategy 1: Look for data-palette-listing-image (carousel images)
        $('img[data-palette-listing-image]').each((i, el) => {
          const src = $(el).attr('data-src') || $(el).attr('src');
          if (src) {
            // Convert to full size if possible (often 340x270 or similar -> fullxfull)
            // Common patterns: il_340x270.jpg -> il_fullxfull.jpg
            const fullSizeSrc = src.replace(/il_\d+x\d+/, 'il_fullxfull');
            images.push(fullSizeSrc);
          }
        });

        // Strategy 2: Look for og:image
        if (images.length === 0) {
          const ogImage = $('meta[property="og:image"]').attr('content');
          if (ogImage) images.push(ogImage);
        }

        // Strategy 3: Look for any large image in listing-image-gallery
        if (images.length === 0) {
          $('.listing-image-gallery img').each((i, el) => {
            const src = $(el).attr('data-src') || $(el).attr('src');
            if (src) images.push(src.replace(/il_\d+x\d+/, 'il_fullxfull'));
          });
        }

        // Strategy 4: any img with etsystatic in src
        if (images.length === 0) {
          $('img[src*="etsystatic"], img[data-src*="etsystatic"]').each((i, el) => {
            const src = $(el).attr('data-src') || $(el).attr('src');
            if (src && /il_(\d+x\d+|fullxfull)/.test(src)) images.push(src.replace(/il_\d+x\d+/, 'il_fullxfull'));
          });
        }

        // Strategy 5: regex in raw HTML for Etsy CDN image URLs
        if (images.length === 0 && html) {
          const cdnRegex = /https?:\/\/i\.etsystatic\.com\/[^"'\s]+il_(?:fullxfull|\d+x\d+)[^"'\s]*/g;
          const matches = html.match(cdnRegex) || [];
          matches.forEach((u) => {
            const full = u.replace(/il_\d+x\d+/, 'il_fullxfull').split(/["'\s]/)[0];
            if (full) images.push(full);
          });
        }

        const uniqueImages = [...new Set(images)];
        console.log(`[Etsy Scraper] Found ${uniqueImages.length} images for ${listingId}`);

        return {
          images: uniqueImages.map(url => ({ url_fullxfull: url, url_570xN: url, url_75x75: url })),
          pageTitle: uniqueImages.length === 0 ? ($('title').text() || '').trim() : null,
          snippet: uniqueImages.length === 0 ? html.substring(0, 500) : null
        };
      } catch (err) {
        console.error(`[Etsy Scraper] Failed to scrape ${listingId}:`, err.message);
        return {
          error: err.message,
          pageTitle: 'Error occurred',
          snippet: html ? html.substring(0, 300) : null,
          images: []
        };
      }
    };

    // Handle analyze operation
    if (operation === 'analyze' || (!operation && shopUrl)) {
      return res.status(501).json({
        error: 'Shop analysis is no longer supported due to Etsy API changes. Please use listing URLs to fetch images.'
      });

      // Handle fetch-images operation
    } else if (operation === 'fetch-images' || (!operation && listingIds && Array.isArray(listingIds))) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) return res.status(400).json({ error: 'Listing IDs array is required' });

      const results = [];

      for (let i = 0; i < listingIds.length; i++) {
        const listingId = listingIds[i];

        try {
          // Use Scraper exclusively
          const scrapeResult = await scrapeListingImages(listingId);
          const scrapedImages = scrapeResult.images || [];

          if (scrapedImages.length === 0) {
            const errorDetails = scrapeResult.pageTitle ? ` (Title: ${scrapeResult.pageTitle})` : '';
            results.push({
              listing_id: listingId,
              success: false,
              error: `Scraper failed to find images${errorDetails}. Etsy may be blocking requests.`,
              image_url: null
            });
            continue;
          }

          const firstImage = scrapedImages[0];
          const imageUrl = firstImage.url_fullxfull || firstImage.url_570xN || firstImage.url_75x75;

          results.push({
            listing_id: listingId,
            success: true,
            image_url: imageUrl
          });

          // Add delay to be polite and avoid blocks
          if (i < listingIds.length - 1) await new Promise(resolve => setTimeout(resolve, 500));

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
    } else if (operation === 'listing' || (!operation && listingIdParam)) {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const listingId = listingIdParam;

      if (!listingId) {
        return res.status(400).json({ error: 'Missing listingId parameter' });
      }

      try {
        const scrapeResult = await scrapeListingImages(listingId);
        const scrapedImages = scrapeResult.images || [];

        if (scrapedImages.length > 0) {
          return res.status(200).json({
            count: scrapedImages.length,
            results: scrapedImages
          });
        }

        const pageTitle = (scrapeResult.pageTitle || '').trim().toLowerCase();
        const isBlockPage = pageTitle === 'etsy.com' || pageTitle === 'etsy' || (scrapeResult.snippet && /captcha|enable javascript|blocked|access denied/i.test(scrapeResult.snippet));
        const errMsg = scrapeResult.error ? ` ${scrapeResult.error}.` : '';
        const suggestion = isBlockPage
          ? ' Etsy may be blocking automated requests. Try again later or paste image URLs manually.'
          : ' The listing might be private or Etsy may be blocking requests.';
        return res.status(404).json({
          error: 'No images found',
          details: `Scraper failed to find images. Page title: "${scrapeResult.pageTitle || 'Unknown'}".${errMsg}${suggestion}`,
          pageTitle: scrapeResult.pageTitle,
          snippet: scrapeResult.snippet
        });
      } catch (err) {
        return res.status(500).json({
          error: `Scraping failed: ${err.message}`
        });
      }

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

