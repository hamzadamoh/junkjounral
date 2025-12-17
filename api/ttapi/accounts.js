/**
 * Vercel Serverless Function to proxy ttapi.io Midjourney accounts requests
 * This bypasses CORS restrictions by making API calls server-side
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get API key from environment variable (without VITE_ prefix for serverless functions)
    const apiKey = process.env.TTAPI_API_KEY || process.env.VITE_TTAPI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Ttapi API key is not configured. Please set TTAPI_API_KEY in Vercel environment variables.' 
      });
    }

    // Get Ttapi domain from environment variable (defaults to PPU mode)
    // Hold Account Mode: https://hold.ttapi.io
    // PPU Mode: https://api.ttapi.io
    const ttapiDomain = process.env.TTAPI_DOMAIN || process.env.VITE_TTAPI_DOMAIN || 'https://api.ttapi.io';

    // Get mode from query parameter (fast or relax)
    const { mode = 'fast' } = req.query;

    // Only fetch accounts for Hold Account Mode
    if (!ttapiDomain.includes('hold.ttapi.io')) {
      return res.status(200).json({ 
        accounts: [],
        count: 1,
        accountIds: []
      });
    }

    console.log(`[Ttapi Accounts Proxy] Fetching accounts for mode: ${mode}`);
    console.log(`[Ttapi Accounts Proxy] Using domain: ${ttapiDomain}`);

    // Call ttapi.io API FROM THE SERVER (Securely)
    const response = await fetch(`${ttapiDomain}/midjourney/v1/accounts`, {
      method: 'GET',
      headers: {
        'TT-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Ttapi Accounts Proxy] API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `Ttapi API error: ${response.status}`,
        details: errorText,
        accounts: [],
        count: 1,
        accountIds: []
      });
    }

    const data = await response.json();
    const accounts = data.accounts || data.data?.accounts || [];

    // Filter accounts based on mode
    let filteredAccounts = accounts;
    if (mode === 'fast') {
      filteredAccounts = accounts.filter((acc) => 
        acc.fast_time_remaining > 0 || acc.has_fast_time || acc.fast_hours > 0
      );
      // If no fast time accounts, use all accounts
      if (filteredAccounts.length === 0) {
        filteredAccounts = accounts;
      }
    }

    // Extract account IDs (only active accounts)
    const accountIds = filteredAccounts
      .filter((acc) => acc.status === 'active')
      .map((acc) => acc.id || acc.account_id)
      .filter((id) => id);

    const count = Math.max(accountIds.length || filteredAccounts.length || 1, 1);

    console.log(`[Ttapi Accounts Proxy] Found ${count} account(s) for ${mode} mode`);

    // Set CORS headers to allow the frontend to access this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Return the response
    res.status(200).json({
      accounts: filteredAccounts,
      count,
      accountIds
    });
  } catch (error) {
    console.error('[Ttapi Accounts Proxy] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      accounts: [],
      count: 1,
      accountIds: []
    });
  }
}

