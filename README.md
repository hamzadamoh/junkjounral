<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1HntWJdqPDsoWOcmUcp1p565rd9O2wovD

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`

2. Copy the example env file and add your values:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and set your API keys and secrets. The file `.env.example` lists all supported variables (Google Drive, Dropbox, OpenAI, TTAPI/Midjourney, WordPress, Etsy, etc.). You can copy values from your Vercel project’s Environment Variables into `.env.local` for local development.
   Note: Pollinations is free and doesn’t require an API key.

3. **Run the API server** (required for Google Drive, OpenAI, WordPress, etc. to work locally):
   In one terminal:
   ```bash
   npm run dev:api
   ```
   Leave it running. It serves `/api/*` on port 3001 and loads `.env.local`.

4. **Run the app** in a second terminal:
   ```bash
   npm run dev
   ```

5. Open **http://localhost:3000** in your browser. Vite proxies `/api` requests to the API server.

**If you get "Server error: 404" when loading folders or using APIs:**  
You need the API server running. Run `npm run dev:api` in a separate terminal, then try again.

**If Etsy / Arcane Splitter images return 500 or "res.status(...).send is not a function":**  
Restart the API server: stop it (Ctrl+C in the terminal where `npm run dev:api` is running), then run `npm run dev:api` again. After restart you should see a log line: `res.status().send() / .json() supported for Etsy proxy-image.`

**If you see "WebSocket connection failed" or "[vite] failed to connect to websocket":**  
HMR is disabled; this message is harmless. You can ignore it or do a hard refresh (Ctrl+Shift+R). The app works without the WebSocket.

**If you see a blank page:**
- Open DevTools (F12) → **Console** and check for red error messages.
- If an error is shown on the page ("Something went wrong"), read the message and check the console for details.
- Make sure you are using `npm run dev` (Vite), not Next.js. This project’s main app runs with Vite.

## Deployment on Vercel

When deploying to Vercel, the app includes serverless functions in the `api/` directory that proxy Replicate API calls. This solves CORS issues and keeps your API keys secure on the server.

**Important**: Make sure to add your API keys in Vercel's Environment Variables:
- Go to your Vercel project settings
- Navigate to "Environment Variables"
- **For Replicate**: Add `REPLICATE_API_TOKEN` (without `VITE_` prefix) with your Replicate API key
  - Note: Serverless functions need `REPLICATE_API_TOKEN`, not `VITE_REPLICATE_API_KEY`
- **For other services**: Add `VITE_GOAPI_API_KEY` and `VITE_OPENAI_API_KEY` as usual

The serverless functions will automatically use `REPLICATE_API_TOKEN` for Replicate API calls.
