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
   VITE_REPLICATE_API_KEY=your_replicate_api_key_here (for Replicate models - note: requires backend due to CORS)
   ```
   Note: Pollinations is free and doesn't require an API key!

3. Run the app:
   `npm run dev`
   
   **Note**: Replicate API doesn't work directly from browsers due to CORS restrictions. Use Pollinations or Midjourney for browser-based generation.
