# Koyeb Deployment Guide

This guide will help you deploy your application to Koyeb. **This project is built to run on Koyeb:** the production server (`server.js`) serves the Vite build and all API routes (Etsy, WordPress, OpenAI, etc.) in one service.

## Overview

Koyeb is a serverless platform that can run Node.js applications. This project has been configured to:
- Build the Vite frontend (`npm run build`)
- Serve static files and API routes using a unified Node.js server (`server.js`)

## Prerequisites

1. A Koyeb account (sign up at https://www.koyeb.com)
2. Your code pushed to GitHub (already done ✅)

## Deployment Steps

### Option 1: Deploy via Koyeb Dashboard (Recommended)

1. **Go to Koyeb Dashboard**
   - Visit https://app.koyeb.com
   - Sign in or create an account

2. **Create a New Service**
   - Click "Create Service" or "New Service"
   - Select "GitHub" as your source
   - Authorize Koyeb to access your GitHub if needed

3. **Select Your Repository**
   - Choose `hamzadamoh/junkjounral` from the list
   - Select the `main` branch

4. **Configure Build Settings**
   - **Build Command**: `npm run build`
   - **Run Command**: `npm start`
   - **Root Directory**: Leave empty (or set to `junkjounral` if deploying from monorepo root)
   - **Port**: `3000` (Koyeb will set PORT env var automatically)

5. **Set Environment Variables**
   Click "Environment Variables" and add:
   
   **Required (based on features you use):**
   - `OPENAI_API_KEY` - For OpenAI chat completions
   - `TTAPI_API_KEY` - For Midjourney/TTAPI operations
   - Etsy listing images use the built-in scraper only; no Etsy API keys are required.
   - `TTAPI_DOMAIN` - Optional, defaults to `https://api.ttapi.io`

   **Google Drive (if used):**
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_PARENT_FOLDER_ID` (optional)

   **WordPress (if used):**
   - `WP_URL` or `WORDPRESS_URL` or `VITE_WP_URL`
   - `WP_USERNAME` or `WORDPRESS_USERNAME` or `VITE_WP_USERNAME`
   - `WP_APP_PASSWORD` or `WORDPRESS_APPLICATION_PASSWORD` or `VITE_WP_APP_PASSWORD`

   **Dropbox (if used):**
   - `DROPBOX_ACCESS_TOKEN` or `VITE_DROPBOX_ACCESS_TOKEN`

   **Note**: Remove `VITE_` prefix for server-side environment variables. The `VITE_` prefix is only needed for client-side variables in Vite, but since API routes run server-side, use the non-prefixed versions.

6. **Deploy**
   - Click "Deploy" or "Create Service"
   - Koyeb will build and deploy your application
   - Wait for the deployment to complete (usually 2-5 minutes)

7. **Access Your App**
   - Once deployed, Koyeb will provide a URL like `https://your-app-name.koyeb.app`
   - Your app should be live!

### Option 2: Deploy via Koyeb CLI

1. **Install Koyeb CLI**
   ```bash
   # macOS/Linux
   curl -fsSL https://cli.koyeb.com/install.sh | sh
   
   # Windows (using PowerShell)
   iwr https://cli.koyeb.com/install.ps1 -useb | iex
   ```

2. **Login to Koyeb**
   ```bash
   koyeb login
   ```

3. **Deploy**
   ```bash
   koyeb service create \
     --name gothic-journal-artificer \
     --git github.com/hamzadamoh/junkjounral \
     --git-branch main \
     --build-command "npm run build" \
     --run-command "npm start" \
     --ports 3000:http
   ```

4. **Set Environment Variables**
   ```bash
   koyeb service update your-service-name \
     --env OPENAI_API_KEY=your_key
   # Add more env vars as needed (WordPress, TTAPI, etc.). Etsy uses scraper only; no API keys.
   ```

## How It Works

1. **Build Phase**: Koyeb runs `npm run build` which uses Vite to build your React app into static files in the `dist` directory.

2. **Run Phase**: Koyeb runs `npm start` which executes `server.js`. This server:
   - Serves static files from the `dist` directory
   - Handles API routes (`/api/*`) using your existing Vercel-style handlers
   - Provides SPA routing support (all non-API routes serve `index.html`)

## File Structure

```
junkjounral/
├── server.js              # Production server (serves frontend + API)
├── server/
│   └── local-api.js      # Development API server
├── api/                  # API route handlers (Vercel format)
│   ├── google-drive.js
│   ├── etsy.js
│   ├── ttapi.js
│   └── ...
├── dist/                 # Built frontend (created by `npm run build`)
└── koyeb.toml           # Koyeb configuration (optional)
```

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (18+)
- Check build logs in Koyeb dashboard

### API Routes Return 404
- Verify `server.js` is running (check logs)
- Ensure API route handlers are in the `api/` directory
- Check that routes are listed in `ROUTES` array in `server.js`

### Static Files Not Loading
- Verify `dist` directory exists after build
- Check that `dist/index.html` exists
- Ensure `server.js` is pointing to the correct `distDir`

### Environment Variables Not Working
- Remove `VITE_` prefix for server-side variables
- Restart the service after adding env vars
- Check logs to see if env vars are loaded

### Port Issues
- Koyeb automatically sets `PORT` environment variable
- `server.js` uses `process.env.PORT || 3000`
- Don't hardcode port numbers

## Differences from Vercel/Netlify

- **Single Server**: Instead of separate serverless functions, Koyeb runs one Node.js server
- **Static + API**: The same server handles both static files and API routes
- **Environment Variables**: No `VITE_` prefix needed for server-side variables
- **Deployment**: Uses Git-based deployment with build/run commands

## Updating Your Deployment

1. Push changes to GitHub
2. Koyeb will automatically detect changes and redeploy
3. Or manually trigger redeploy from Koyeb dashboard

## Cost

Koyeb offers a free tier with:
- 2 services
- 512 MB RAM per service
- Sufficient for small to medium applications

For production, consider upgrading based on your traffic needs.

## Support

- Koyeb Docs: https://www.koyeb.com/docs
- Koyeb Community: https://www.koyeb.com/community
- Check application logs in Koyeb dashboard for debugging
