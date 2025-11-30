// Simple Replicate API Proxy Server
// Run this with: node proxy-server.js
// Then set VITE_REPLICATE_PROXY_URL=http://localhost:3001 in your .env.local

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Proxy all requests to Replicate API
app.all('/v1/*', async (req, res) => {
  const path = req.path;
  const url = `https://api.replicate.com${path}`;
  
  console.log(`[Proxy] ${req.method} ${path}`);
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json',
        ...req.headers
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Replicate Proxy Server running on http://localhost:${PORT}`);
  console.log(`📝 Add this to your .env.local file:`);
  console.log(`   VITE_REPLICATE_PROXY_URL=http://localhost:${PORT}\n`);
});

