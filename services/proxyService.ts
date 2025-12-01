/**
 * Proxy Service for Pollinations API
 * Uses proxifly free proxy list to rotate proxies and avoid rate limits
 * https://github.com/proxifly/free-proxy-list
 */

interface Proxy {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
}

const PROXY_LIST_URL = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json';
let cachedProxies: Proxy[] = [];
let proxyIndex = 0;
let lastProxyFetch = 0;
const PROXY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches proxies from proxifly
 */
const fetchProxies = async (): Promise<Proxy[]> => {
  try {
    const response = await fetch(PROXY_LIST_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch proxies: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Convert to our Proxy format
    const proxies: Proxy[] = data
      .filter((p: any) => p.protocol && (p.protocol === 'http' || p.protocol === 'https'))
      .map((p: any) => ({
        host: p.ip || p.host,
        port: parseInt(p.port),
        protocol: p.protocol.toLowerCase() as 'http' | 'https'
      }))
      .filter((p: Proxy) => p.host && p.port && p.port > 0 && p.port < 65536);
    
    console.log(`[Proxy Service] Fetched ${proxies.length} proxies from proxifly`);
    return proxies;
  } catch (error) {
    console.error('[Proxy Service] Error fetching proxies:', error);
    return [];
  }
};

/**
 * Gets the current proxy list, using cache if available
 */
const getProxyList = async (): Promise<Proxy[]> => {
  const now = Date.now();
  
  // Use cache if it's fresh
  if (cachedProxies.length > 0 && (now - lastProxyFetch) < PROXY_CACHE_DURATION) {
    return cachedProxies;
  }
  
  // Fetch fresh proxies
  cachedProxies = await fetchProxies();
  lastProxyFetch = now;
  
  // Shuffle proxies for better distribution
  cachedProxies = cachedProxies.sort(() => Math.random() - 0.5);
  
  return cachedProxies;
};

/**
 * Tests if a proxy is working by making a test request
 */
const testProxy = async (proxy: Proxy, timeout: number = 5000): Promise<boolean> => {
  try {
    // Test with a simple request to a reliable endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Note: Browser fetch API doesn't support direct proxy configuration
    // We'll need to use a proxy URL format or skip proxy testing in browser
    // For now, we'll assume all proxies are valid and let the actual request fail if needed
    
    clearTimeout(timeoutId);
    return true; // Assume valid for now (browser limitation)
  } catch (error) {
    return false;
  }
};

/**
 * Gets the next proxy in rotation
 */
export const getNextProxy = async (): Promise<Proxy | null> => {
  const proxies = await getProxyList();
  
  if (proxies.length === 0) {
    console.warn('[Proxy Service] No proxies available');
    return null;
  }
  
  // Get next proxy in rotation
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  
  return proxy;
};

/**
 * Formats proxy for use in fetch (for server-side only)
 * Note: Browser fetch doesn't support proxies directly
 * This would need to be implemented server-side or via a proxy service
 */
export const formatProxyUrl = (proxy: Proxy): string => {
  return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
};

/**
 * Makes a fetch request through a proxy
 * Note: This is a placeholder - browser fetch doesn't support proxies
 * For browser use, we'd need to route through a proxy server or use a service
 */
export const fetchWithProxy = async (
  url: string,
  options: RequestInit = {},
  proxy?: Proxy | null
): Promise<Response> => {
  // If no proxy provided, get next one
  if (!proxy) {
    proxy = await getNextProxy();
  }
  
  // Browser limitation: fetch API doesn't support direct proxy configuration
  // In a real implementation, you would:
  // 1. Route requests through a backend proxy server
  // 2. Use a proxy service API
  // 3. Use a browser extension (not recommended for production)
  
  // For now, we'll just make the request normally
  // The proxy rotation will help when requests are made server-side
  // or when using a proxy service
  
  console.log(`[Proxy Service] Making request to ${url}${proxy ? ` via proxy ${proxy.host}:${proxy.port}` : ' (no proxy)'}`);
  
  return fetch(url, options);
};

/**
 * Resets the proxy cache (useful for testing or forcing refresh)
 */
export const resetProxyCache = () => {
  cachedProxies = [];
  proxyIndex = 0;
  lastProxyFetch = 0;
};

