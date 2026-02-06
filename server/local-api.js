/**
 * Local API server for development.
 * Runs the same Vercel-style handlers from api/* so /api/google-drive etc. work with Vite.
 * Load .env.local into process.env so API keys are available.
 */

import { createServer } from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Load .env.local into process.env (Node doesn't load it by default)
function loadEnvLocal() {
  try {
    const path = join(rootDir, '.env.local');
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          let value = trimmed.slice(eq + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = value;
        }
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[local-api] Could not load .env.local:', e.message);
  }
}

loadEnvLocal();

const PORT = Number(process.env.API_PORT) || 3001;

// Route table: path -> handler module path (relative to project root)
const ROUTES = [
  { path: '/api/google-drive', module: './api/google-drive.js' },
  { path: '/api/openai/chat', module: './api/openai/chat.js' },
  { path: '/api/wordpress/upload', module: './api/wordpress/upload.js' },
  { path: '/api/dropbox/upload-grid', module: './api/dropbox/upload-grid.js' },
  { path: '/api/ttapi', module: './api/ttapi.js' },
  { path: '/api/etsy', module: './api/etsy.js' },
  { path: '/api/pollinations/generate', module: './api/pollinations/generate.js' },
];

function parseBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(200).end();
    return;
  }

  // Etsy proxy-image: handle directly so it works regardless of handler res.send/res.end
  if (pathname === '/api/etsy' && method === 'GET') {
    const operation = url.searchParams.get('operation');
    const imageUrl = url.searchParams.get('url');
    if (operation === 'proxy-image' && imageUrl) {
      try {
        const decodedUrl = decodeURIComponent(imageUrl);
        const imageResponse = await fetch(decodedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Etsy-Image-Proxy/1.0)',
            Referer: 'https://www.etsy.com/',
          },
        });
        if (!imageResponse.ok) {
          res.writeHead(imageResponse.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Failed to fetch image: ${imageResponse.statusText}` }));
          return;
        }
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        res.end(buffer);
        return;
      } catch (err) {
        console.error('[local-api] Etsy proxy-image error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
        return;
      }
    }
  }

  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '?'));
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not found: ${pathname}. Start the local API server (see README).` }));
    return;
  }

  let body = {};
  if (method === 'POST' && req.headers['content-type']?.includes('application/json')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) body = parseBody(raw);
  } else {
    // Drain GET (or other) request body before handling
    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
      req.resume();
    });
  }

  const query = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  // Handlers expect req.body (POST JSON) and req.query (GET query params). Merge for body so query params can override.
  const nodeReq = {
    method,
    url: url.pathname + url.search,
    query,
    body: method === 'POST' ? body : { ...query },
    headers: req.headers,
  };

  let ended = false;
  const nodeRes = {};
  nodeRes._headers = {};
  nodeRes.statusCode = 200;
  nodeRes.setHeader = function (name, value) {
    nodeRes._headers[name.toLowerCase()] = value;
  };
  nodeRes.getHeader = function (name) {
    return nodeRes._headers[name.toLowerCase()];
  };
  nodeRes.status = function (code) {
    nodeRes.statusCode = code;
    return nodeRes;
  };
  nodeRes.json = function (obj) {
    if (ended) return;
    ended = true;
    nodeRes.setHeader('content-type', 'application/json');
    res.writeHead(nodeRes.statusCode, nodeRes._headers);
    res.end(JSON.stringify(obj));
  };
  nodeRes.send = function (data) {
    if (ended) return;
    ended = true;
    if (Buffer.isBuffer(data) && !nodeRes.getHeader('content-type')) {
      nodeRes.setHeader('content-type', 'application/octet-stream');
    }
    const payload = Buffer.isBuffer(data) ? data : (data != null ? Buffer.from(String(data)) : Buffer.alloc(0));
    res.writeHead(nodeRes.statusCode, nodeRes._headers);
    res.end(payload);
  };
  nodeRes.end = function (data) {
    if (ended) return;
    ended = true;
    const payload = data != null ? (Buffer.isBuffer(data) ? data : Buffer.from(String(data))) : Buffer.alloc(0);
    res.writeHead(nodeRes.statusCode, nodeRes._headers);
    res.end(payload);
  };

  try {
    const modulePath = join(rootDir, route.module);
    const mod = await import(pathToFileURL(modulePath).href);
    const handler = mod.default;
    if (typeof handler !== 'function') {
      nodeRes.status(500).json({ error: 'Handler not a function' });
      return;
    }
    await handler(nodeReq, nodeRes);
    if (!ended) {
      nodeRes.end('');
    }
  } catch (err) {
    console.error(`[local-api] ${pathname} error:`, err.message || err);
    if (err.stack) console.error(err.stack);
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[local-api] API server running at http://localhost:${PORT}`);
  console.log(`[local-api] Proxy /api from Vite (npm run dev) to this server.`);
  console.log(`[local-api] res.status().send() / .json() supported for Etsy proxy-image.`);
});
