# Replicate API Browser Proxy Solution

## The Problem
Replicate API doesn't allow direct browser access due to CORS restrictions, and public CORS proxies strip Authorization headers, making it impossible to authenticate requests from the browser.

## Solution: Simple Backend Proxy

You need a simple backend server to proxy requests to Replicate. Here are two options:

### Option 1: Use a Free Proxy Service (Recommended)

Use a service like **CORS Anywhere** or create a simple Node.js proxy:

1. **Quick Solution**: Use a hosted CORS proxy that supports auth headers
2. **Better Solution**: Create your own simple proxy server

### Option 2: Simple Node.js Proxy Server

Create a file `proxy-server.js`:

```javascript
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/replicate/*', async (req, res) => {
  const path = req.path.replace('/api/replicate', '');
  const url = `https://api.replicate.com${path}`;
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Proxy server running on http://localhost:3001');
});
```

Then update the Replicate service to use `http://localhost:3001/api/replicate` instead of the CORS proxy.

### Option 3: Use Vercel/Netlify Function

Deploy a serverless function to proxy requests.

## For Now: Use Pollinations Instead

Until you set up a proxy, **Pollinations** works perfectly from the browser with no CORS issues and is free!

