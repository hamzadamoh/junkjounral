/**
 * Production server for Koyeb deployment
 * Serves the built Vite frontend and handles API routes
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';
import { createReadStream } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const distDir = join(rootDir, 'dist');

const PORT = process.env.PORT || 3000;

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

// MIME types for static files
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function parseBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function serveStaticFile(filePath, res) {
  if (!existsSync(filePath)) {
    return false;
  }

  const ext = extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000');

  const stream = createReadStream(filePath);
  stream.pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS headers
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
        console.error('[Server] Etsy proxy-image error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
        return;
      }
    }
  }

  // Handle API routes
  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '?'));
  if (route) {
    try {
      const modulePath = join(rootDir, route.module);
      const mod = await import(pathToFileURL(modulePath).href);
      const handler = mod.default;

      if (typeof handler !== 'function') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Handler not a function' }));
        return;
      }

      let body = {};
      if (method === 'POST' && req.headers['content-type']?.includes('application/json')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) body = parseBody(raw);
      } else {
        await new Promise((resolve, reject) => {
          req.on('end', resolve);
          req.on('error', reject);
          req.resume();
        });
      }

      const query = {};
      url.searchParams.forEach((v, k) => { query[k] = v; });

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
        if (ended) return nodeRes;
        ended = true;
        nodeRes.setHeader('content-type', 'application/json');
        res.writeHead(nodeRes.statusCode, nodeRes._headers);
        res.end(JSON.stringify(obj));
        return nodeRes;
      };
      nodeRes.send = function (data) {
        if (ended) return nodeRes;
        ended = true;
        if (Buffer.isBuffer(data) && !nodeRes.getHeader('content-type')) {
          nodeRes.setHeader('content-type', 'application/octet-stream');
        }
        const payload = Buffer.isBuffer(data) ? data : (data != null ? Buffer.from(String(data)) : Buffer.alloc(0));
        res.writeHead(nodeRes.statusCode, nodeRes._headers);
        res.end(payload);
        return nodeRes;
      };
      nodeRes.end = function (data) {
        if (ended) return nodeRes;
        ended = true;
        const payload = data != null ? (Buffer.isBuffer(data) ? data : Buffer.from(String(data))) : Buffer.alloc(0);
        res.writeHead(nodeRes.statusCode, nodeRes._headers);
        res.end(payload);
        return nodeRes;
      };

      await handler(nodeReq, nodeRes);
      if (!ended) {
        nodeRes.end('');
      }
    } catch (err) {
      console.error(`[API] ${pathname} error:`, err.message || err);
      if (err.stack) console.error(err.stack);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
      }
    }
    return;
  }

  // Handle static files
  let filePath = join(distDir, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to serve the file
  if (serveStaticFile(filePath, res)) {
    return;
  }

  // If file not found and it's not an API route, try index.html for SPA routing
  if (!pathname.startsWith('/api')) {
    const indexPath = join(distDir, 'index.html');
    if (serveStaticFile(indexPath, res)) {
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Serving static files from ${distDir}`);
  console.log(`[Server] API routes: ${ROUTES.map(r => r.path).join(', ')}`);
});
