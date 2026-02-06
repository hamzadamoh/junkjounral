# Netlify Deployment Guide

This project can be deployed to Netlify, but the API routes need to be converted from Vercel format to Netlify Functions format.

## Current Status

✅ **Frontend**: Works perfectly - Vite builds to static files  
⚠️ **API Routes**: Need conversion from Vercel to Netlify Functions format

## Quick Answer

**Yes, this project can work on Netlify**, but you have 3 options:

### Option 1: Convert API Routes to Netlify Functions (Recommended)

Convert each API handler from Vercel format to Netlify Functions format.

**Vercel Format:**
```javascript
export default async function handler(req, res) {
  res.status(200).json({ message: 'Hello' });
}
```

**Netlify Format:**
```javascript
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello' })
  };
};
```

### Option 2: Use Netlify Edge Functions

Netlify Edge Functions use a similar format to Vercel but run on the edge. They use Deno runtime.

### Option 3: Keep APIs on Vercel

Deploy the frontend to Netlify and keep the API routes on Vercel. Update your frontend to call the Vercel API URLs.

## Conversion Steps (Option 1)

### Step 1: Create Netlify Functions Directory

```bash
mkdir -p netlify/functions
```

### Step 2: Convert API Handlers

Each API handler needs to be converted. See `netlify/functions/pollinations-generate.js` for an example.

### Step 3: Update netlify.toml

The `netlify.toml` file is already created with basic configuration.

### Step 4: Update Frontend API Calls

If your frontend calls `/api/*`, Netlify Functions will automatically be available at `/.netlify/functions/*` or you can configure rewrites.

### Step 5: Set Environment Variables

In Netlify Dashboard → Site Settings → Environment Variables, add:
- `TTAPI_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `DROPBOX_ACCESS_TOKEN`
- `ETSY_API_KEY`
- `REPLICATE_API_TOKEN`
- And any other API keys your functions need

## Helper Function for Conversion

A helper utility is available at `netlify/functions/utils/vercel-to-netlify.js` to simplify conversion.

## API Routes That Need Conversion

- `/api/google-drive` → `netlify/functions/google-drive.js`
- `/api/openai/chat` → `netlify/functions/openai-chat.js`
- `/api/wordpress/upload` → `netlify/functions/wordpress-upload.js`
- `/api/dropbox/upload-grid` → `netlify/functions/dropbox-upload-grid.js`
- `/api/ttapi` → `netlify/functions/ttapi.js`
- `/api/etsy` → `netlify/functions/etsy.js`
- `/api/pollinations/generate` → `netlify/functions/pollinations-generate.js`

## Differences Between Vercel and Netlify Functions

| Feature | Vercel | Netlify |
|---------|--------|---------|
| Handler Format | `export default async function handler(req, res)` | `exports.handler = async (event, context)` |
| Request Body | `req.body` | `JSON.parse(event.body)` |
| Query Params | `req.query` | `event.queryStringParameters` |
| Response | `res.status(200).json({})` | `return { statusCode: 200, body: JSON.stringify({}) }` |
| Headers | `res.setHeader()` | Return in `headers` object |
| Path Params | `req.query` | `event.pathParameters` |

## Testing Locally

Install Netlify CLI:
```bash
npm install -g netlify-cli
```

Run locally:
```bash
netlify dev
```

This will:
- Build your Vite app
- Run Netlify Functions locally
- Proxy API routes correctly

## Deployment

1. Push code to GitHub/GitLab/Bitbucket
2. Connect repository to Netlify
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Add environment variables
6. Deploy!

## Cost Comparison

- **Vercel Hobby**: Free tier with limitations (100GB bandwidth, serverless function limits)
- **Netlify Free**: 100GB bandwidth, 125K function invocations/month

Both are suitable for small to medium projects.
