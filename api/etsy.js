import * as cheerio from 'cheerio';

/**
 * Etsy operations handler - Uses Official Etsy API V3
 * Handles: fetch-images, listing, proxy-image, scrape-details, analyze, cluster-analysis
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

    // Use combined key format for V3: keystring:secret
    const rawApiKey = bodyParams.apiKey || queryParams.apiKey || process.env.ETSY_API_KEY || process.env.VITE_ETSY_API_KEY;
    const rawSharedSecret = bodyParams.sharedSecret || queryParams.sharedSecret || process.env.ETSY_SHARED_SECRET || process.env.VITE_ETSY_SHARED_SECRET;

    // As of Jan 2026, Etsy V3 requires both combined with a colon if shared secret exists
    const apiKey = (rawApiKey && rawSharedSecret) ? `${rawApiKey}:${rawSharedSecret}` : rawApiKey;

    // Helper to extract listing ID from URL
    const extractListingId = (input) => {
      if (!input) return null;
      if (/^\d+$/.test(input)) return input;
      const match = input.match(/listing\/(\d+)/);
      return match ? match[1] : null;
    };

    // Helper to extract shop name from URL
    const extractShopName = (input) => {
      if (!input) return null;
      // Handle URLs like https://www.etsy.com/shop/ShopName or just "ShopName"
      const match = input.match(/etsy\.com\/shop\/([^\/\?]+)/);
      if (match) return match[1];
      // If it's just a plain name
      if (/^[a-zA-Z0-9]+$/.test(input.trim())) return input.trim();
      return null;
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

    // Official API: Fetch shop info by name
    const fetchShopByName = async (shopName) => {
      if (!apiKey) throw new Error('Etsy API Key (ETSY_API_KEY) is missing');

      console.log(`[Etsy API] Fetching shop: ${shopName}...`);
      const response = await fetch(`https://openapi.etsy.com/v3/application/shops?shop_name=${encodeURIComponent(shopName)}`, {
        headers: { 'x-api-key': apiKey }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Etsy API Error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.results || data.results.length === 0) {
        throw new Error(`Shop "${shopName}" not found`);
      }
      return data.results[0];
    };

    // Official API: Fetch all active listings for a shop (paginated)
    const fetchAllShopListings = async (shopId) => {
      if (!apiKey) throw new Error('Etsy API Key (ETSY_API_KEY) is missing');

      const allListings = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        console.log(`[Etsy API] Fetching listings for shop ${shopId}, offset ${offset}...`);
        const response = await fetch(
          `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}&includes=Images`,
          { headers: { 'x-api-key': apiKey } }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Etsy API Error: ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];
        allListings.push(...results);

        if (results.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }

        // Safety: max 20 pages (2000 listings)
        if (offset >= 2000) hasMore = false;
      }

      return allListings;
    };

    // Scraper Fallback (Optional, but user said "use official API")
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
    } else if (operation === 'search-listings') {
      const keywords = queryParams.keywords || bodyParams.keywords;
      const limit = queryParams.limit || bodyParams.limit || 10;
      const sort_on = queryParams.sort_on || bodyParams.sort_on || 'created';

      if (!keywords) return res.status(400).json({ error: 'Missing keywords' });
      if (!apiKey) return res.status(401).json({ error: 'API key missing' });

      try {
        console.log(`[Etsy API] Searching active listings for: "${keywords}" (sort: ${sort_on})...`);
        const searchRes = await fetch(`https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(keywords)}&limit=${limit}&sort_on=${sort_on}&includes=Images`, {
          headers: { 'x-api-key': apiKey }
        });
        if (!searchRes.ok) {
          const errData = await searchRes.json().catch(() => ({}));
          throw new Error(errData.error || `Etsy API Error: ${searchRes.status}`);
        }
        const data = await searchRes.json();
        return res.status(200).json(data);
      } catch (err) {
        console.error('[Etsy API] Search error:', err.message);
        return res.status(500).json({ error: err.message });
      }

    } else if (operation === 'shop-search') {
      const shopName = queryParams.shopName || bodyParams.shopName;
      const keywords = queryParams.keywords || bodyParams.keywords;
      const limit = queryParams.limit || bodyParams.limit || 20;

      if (!shopName || !keywords) return res.status(400).json({ error: 'Missing shopName or keywords' });
      if (!apiKey) return res.status(401).json({ error: 'API key missing' });

      try {
        console.log(`[Etsy API] Searching shop "${shopName}" for "${keywords}"...`);
        const shop = await fetchShopByName(shopName);
        const shopId = shop.shop_id;

        const searchRes = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${limit}&sort_on=created&keywords=${encodeURIComponent(keywords)}&includes=Images`, {
          headers: { 'x-api-key': apiKey }
        });

        if (!searchRes.ok) {
          const errData = await searchRes.json().catch(() => ({}));
          throw new Error(errData.error || `Etsy API Error: ${searchRes.status}`);
        }

        const data = await searchRes.json();
        return res.status(200).json({
          shop: shop,
          results: data.results || []
        });
      } catch (err) {
        console.error('[Etsy API] Shop search error:', err.message);
        return res.status(500).json({ error: err.message });
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

    } else if (operation === 'analyze') {
      // Full shop analysis: fetch shop info + all listings
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const shopUrl = bodyParams.shopUrl || bodyParams.url;
      if (!shopUrl) return res.status(400).json({ error: 'Missing shopUrl' });

      const shopName = extractShopName(shopUrl);
      if (!shopName) return res.status(400).json({ error: 'Could not extract shop name from URL' });

      try {
        // Get shop info
        const shop = await fetchShopByName(shopName);
        const shopId = shop.shop_id;

        // Get all active listings
        const rawListings = await fetchAllShopListings(shopId);

        // Calculate shop age
        const shopCreated = shop.create_date ? new Date(shop.create_date * 1000) : null;
        const shopAgeDays = shopCreated ? Math.floor((Date.now() - shopCreated.getTime()) / (1000 * 60 * 60 * 24)) : null;

        // Transform listings
        const listings = rawListings.map(l => {
          const createdDate = l.created_timestamp ? new Date(l.created_timestamp * 1000) : null;
          const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
          const lastModified = l.last_modified_timestamp ? new Date(l.last_modified_timestamp * 1000).toISOString() : null;

          return {
            listing_id: l.listing_id,
            title: l.title,
            views: l.views || 0,
            favorites: l.num_favorers || 0,
            stock: l.quantity || 0,
            age_days: ageDays,
            last_modified: lastModified,
            is_digital: l.is_digital || false,
            tags: l.tags || [],
            description: l.description || '',
            price: l.price ? (l.price.amount / l.price.divisor) : 0,
            currency_code: l.price?.currency_code || 'USD',
            image_url: l.images?.[0]?.url_570xN || l.images?.[0]?.url_fullxfull || null,
            state: l.state || 'active',
            section_id: l.shop_section_id || null,
            created_timestamp: l.created_timestamp || null
          };
        });

        // Calculate average price
        const prices = listings.filter(l => l.price > 0).map(l => l.price);
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

        const shopInfo = {
          shop_name: shop.shop_name,
          shop_id: shopId,
          shop_age_days: shopAgeDays,
          total_listings: rawListings.length,
          total_favorers: shop.num_favorers || 0,
          total_sales: shop.transaction_sold_count || 0,
          shop_url: `https://www.etsy.com/shop/${shop.shop_name}`,
          avg_price: Math.round(avgPrice * 100) / 100,
          currency_code: shop.currency_code || 'USD',
          shop_location: shop.city || null
        };

        return res.status(200).json({ shop_info: shopInfo, listings });
      } catch (err) {
        console.error('[Etsy API] Analyze error:', err.message);
        return res.status(500).json({ error: err.message });
      }

    } else if (operation === 'cluster-analysis') {
      // AI-powered cluster analysis using GPT-4o
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { listings, shop_info } = bodyParams;
      if (!listings || !Array.isArray(listings) || listings.length === 0) {
        return res.status(400).json({ error: 'Missing or empty listings array' });
      }

      // ═══ PRE-NORMALIZATION LAYER ═══
      // Compute derived metrics BEFORE sending to GPT — improves reasoning + reduces tokens
      const fillerWords = /\b(printable|digital download|instant download|pdf|png|jpg|download)\b/gi;

      const structuredListings = listings.map(l => {
        const views = l.views || 0;
        const favorites = l.favorites || 0;
        const sales = l.sales || 0;
        const ageDays = l.age_days || (l.created_timestamp ? Math.floor((Date.now() - l.created_timestamp * 1000) / (1000 * 60 * 60 * 24)) : null);

        // Primary phrase: first 60 chars, stripped of filler
        const rawPhrase = (l.title || '').substring(0, 60).trim();
        const primaryPhrase = rawPhrase.replace(fillerWords, '').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();

        // Performance metrics
        const favPer100Views = views > 0 ? Math.round((favorites / views) * 10000) / 100 : 0;
        const conversionRate = views > 0 ? Math.round((sales / views) * 10000) / 100 : 0;

        // Velocity: favorites per day of listing age (momentum indicator)
        const velocityScore = ageDays && ageDays > 0 ? Math.round((favorites / ageDays) * 100) / 100 : 0;

        return {
          listing_id: l.listing_id,
          title: l.title,
          primary_phrase: primaryPhrase,
          tags: l.tags || [],
          section_name: l.section_name || l.section_id || 'Uncategorized',
          views,
          favorites,
          sales,
          age_days: ageDays,
          fav_per_100_views: favPer100Views,
          conversion_rate_pct: conversionRate,
          velocity_score: velocityScore,
          creation_date: l.created_timestamp ? new Date(l.created_timestamp * 1000).toISOString().split('T')[0] : null,
          last_updated_date: l.last_modified || null
        };
      });

      // The full 8-step prompt
      const systemPrompt = `You are an Etsy Cluster Authority & Cannibalization Intelligence Engine operating under the 2026 Etsy AI Search Model.

Your job is to analyze ALL provided shop listings as ONE ecosystem and return structured intelligence.

You are NOT optimizing a single listing. You are engineering search ecosystem dominance.

Process ALL listings through these 8 steps:

STEP 1: PRIMARY PHRASE EXTRACTION
- Extract the first 60 characters of each title
- Identify the dominant buyer-intent phrase
- Remove filler modifiers (printable, digital download, instant download)
- Normalize singular/plural variations
- Generate a clean "Primary Keyword Identity" label

STEP 2: SEMANTIC CLUSTERING
- Using title + tags + section_name, cluster listings into 4-8 groups
- Name clusters based on dominant recurring tokens
- Cluster names must reflect aesthetic + buyer intent

STEP 3: CANNIBALIZATION DETECTION
- Inside each cluster, compare primary_identity similarity
- If similarity > 75%, flag as potential cannibalization
- If 2+ listings share nearly identical dominant phrases, flag as "High Conflict Zone"
- Also detect duplicate tag sets, similar titles, and split impressions

STEP 4: CLUSTER AUTHORITY SCORING
For each cluster calculate: Total Views, Favorites, Sales, Avg Conversion, Avg Favorites/100 views, Listing Count, Keyword Duplication Rate
Authority Score = (Total Sales x Conversion Rate x Avg Favorites Rate) / Keyword Duplication Rate (normalize 0-100)
Label: 80-100=Dominant, 60-79=Growing, 40-59=Weak, Below 40=Fragmented

STEP 5: ANCHOR LISTING DETECTION
Within each cluster find the listing with highest: (views x 0.3) + (favorites x 0.3) + (sales x 0.4)
Label as Anchor Listing. Detect underperformers inside strong clusters.

STEP 6: CLUSTER GAP ANALYSIS
Evaluate per cluster: phrases too similar? cluster too broad? one aesthetic dominating? expansion angles missing?
Suggest 3 expansion ideas per cluster.

STEP 7: SHOP STRUCTURE DIAGNOSIS
Detect: overloaded clusters (40+), underdeveloped (<6), mixed-intent sections, seasonal dilution, redundant themes.
Provide top 3 structural risks.

STEP 8: STRATEGIC ROADMAP
Generate: which cluster to expand, consolidate, differentiate. Highest revenue scaling potential. Whether to create new cluster.
Output 30-Day Action Plan and 90-Day Authority Plan.

ANALYSIS RULES:
- Think like a search algorithm
- Prioritize ecosystem strength over individual listing optimization
- Do not suggest keyword stuffing
- Do not recommend deleting listings unless severe duplication
- Focus on authority depth, not theme variety
- Goal: Build a Specialist Shop Authority Model

Respond ONLY with valid JSON matching this exact structure.`;

      const userPrompt = `Analyze this Etsy shop ecosystem:

Shop Info: ${JSON.stringify(shop_info)}

Listings Data (${structuredListings.length} total):
${JSON.stringify(structuredListings)}

Return JSON with this exact structure:
{
  "clusters": [
    {
      "cluster_name": "string",
      "authority_score": number,
      "classification": "Dominant|Growing|Weak|Fragmented",
      "listing_count": number,
      "total_views": number,
      "total_favorites": number,
      "total_sales": number,
      "anchor_listing": { "listing_id": number, "title": "string", "performance_score": number },
      "listings": [{ "listing_id": number, "title": "string", "primary_identity": "string" }],
      "cannibalization_flags": ["string"],
      "expansion_opportunities": ["string"],
      "underperformers": [{ "listing_id": number, "title": "string", "reason": "string" }]
    }
  ],
  "high_conflict_zones": [{ "cluster": "string", "description": "string", "affected_listings": [number], "recommendation": "string" }],
  "weak_clusters": ["string"],
  "overloaded_clusters": ["string"],
  "structural_risks": [{ "risk": "string", "severity": "High|Medium|Low", "description": "string" }],
  "strategic_recommendations": {
    "expand_next": "string",
    "consolidate": "string",
    "differentiate_listings": [{ "listing_id": number, "suggestion": "string" }],
    "new_cluster_opportunity": "string",
    "thirty_day_plan": "string",
    "ninety_day_plan": "string"
  }
}`;

      try {
        // Use OpenAI API key from env
        const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
        if (!openaiKey) throw new Error('OpenAI API key not configured');

        console.log(`[Etsy Cluster] Sending ${structuredListings.length} listings to GPT-4o for analysis...`);

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 8000
          })
        });

        if (!aiResponse.ok) {
          const errData = await aiResponse.json().catch(() => ({}));
          throw new Error(errData.error?.message || `OpenAI API Error: ${aiResponse.status}`);
        }

        const aiResult = await aiResponse.json();
        let content = aiResult.choices[0].message.content;

        // Clean markdown blocks
        if (content.includes('```')) {
          content = content.replace(/```json|```/g, '').trim();
        }

        const analysis = JSON.parse(content);
        console.log(`[Etsy Cluster] Analysis complete. ${analysis.clusters?.length || 0} clusters identified.`);

        return res.status(200).json({ success: true, analysis });
      } catch (err) {
        console.error('[Etsy Cluster] Analysis error:', err.message);
        return res.status(500).json({ error: 'Cluster analysis failed: ' + err.message });
      }

    } else {
      return res.status(400).json({ error: 'Invalid operation' });
    }

  } catch (error) {
    console.error('[Etsy Handler] Fatal:', error);
    return res.status(500).json({ error: error.message });
  }
}
