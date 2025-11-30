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

2. Create a `.env.local` file in the root directory and set your API keys:
   ```
   VITE_GOAPI_API_KEY=your_goapi_api_key_here (for Midjourney)
   VITE_OPENAI_API_KEY=your_openai_api_key_here (for ChatGPT prompts)
   VITE_REPLICATE_API_KEY=your_replicate_api_key_here (for Replicate models)
   ```
   Note: Pollinations is free and doesn't require an API key!

3. Run the app:
   `npm run dev`

## Deployment on Vercel

When deploying to Vercel, the app includes serverless functions in the `api/` directory that proxy Replicate API calls. This solves CORS issues and keeps your API keys secure on the server.

**Important**: Make sure to add your API keys in Vercel's Environment Variables:
- Go to your Vercel project settings
- Navigate to "Environment Variables"
- Add `VITE_REPLICATE_API_KEY` (or `REPLICATE_API_TOKEN`) with your Replicate API key

The serverless functions will automatically use these environment variables.
