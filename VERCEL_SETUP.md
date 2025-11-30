# Vercel Serverless Functions Setup

This project uses Vercel Serverless Functions to proxy Replicate API calls, solving CORS issues and keeping API keys secure.

## How It Works

1. **Browser** → Calls `/api/replicate/predictions` (same domain, no CORS)
2. **Vercel Serverless Function** → Forwards request to Replicate API with your API key
3. **Replicate API** → Returns response to Vercel function
4. **Vercel Function** → Returns response to browser

## API Routes

The following serverless functions are available:

- `POST /api/replicate/predictions` - Create a new prediction
- `GET /api/replicate/predictions/[id]` - Poll prediction status
- `GET /api/replicate/models/[model]/versions` - Get model versions

## Environment Variables

**IMPORTANT**: In Vercel serverless functions, you must use `REPLICATE_API_TOKEN` (without the `VITE_` prefix).

Add this in Vercel Project Settings → Environment Variables:

```
REPLICATE_API_TOKEN=r8_your_key_here
```

**Why?** 
- `VITE_*` variables are only available in the frontend build (client-side)
- Serverless functions run in Node.js and need regular environment variables
- The functions will check `REPLICATE_API_TOKEN` first, then `REPLICATE_API_KEY` as fallback

**Note**: For local development (`.env.local`), you can still use `VITE_REPLICATE_API_KEY` for the frontend, but the serverless functions need `REPLICATE_API_TOKEN`.

## Local Development

**Note**: The API routes only work when deployed to Vercel or when using `vercel dev`.

For local development with `npm run dev`:
- Pollinations and Midjourney will work fine (no CORS issues)
- Replicate will only work when deployed to Vercel or using `vercel dev`

To test Replicate locally, install Vercel CLI and run:
```bash
npm install -g vercel
vercel dev
```

This will start a local server that includes the serverless functions.

## Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

The serverless functions will be automatically detected and deployed.

