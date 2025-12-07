# Using Discord Personal Account Token in Vercel

## ✅ Yes, You Can!

**You can use your Discord personal account token directly in Vercel serverless functions!**

Unlike Gateway WebSocket (which needs a persistent connection), **Discord REST API** works perfectly in Vercel serverless functions.

## How It Works

**Instead of WebSocket Gateway:**
- ❌ Requires persistent connection (doesn't work on Vercel)
- ❌ Needs separate server (Render.com)

**Use REST API Polling:**
- ✅ Works in Vercel serverless functions
- ✅ No persistent connection needed
- ✅ Polls DM channel for new messages
- ✅ Extracts individual image URLs

## Implementation

I've created `/api/discord/poll-dm.js` which:

1. **Uses your user token** (`VITE_DISCORD_TOKEN`)
2. **Finds your DM channel** with Midjourney bot
3. **Polls for new messages** every 5 seconds
4. **Extracts individual image URLs** from responses
5. **Returns 4 individual images** instead of grid

## Setup

### Step 1: Add Environment Variable in Vercel

In Vercel dashboard → Your Project → Settings → Environment Variables:

- **Key**: `VITE_DISCORD_TOKEN`
- **Value**: Your Discord user token (same one Ttapi uses)
- **Environment**: Production, Preview, Development (all)

### Step 2: Enable Discord DM Polling

The code automatically uses Discord DM polling if `VITE_DISCORD_TOKEN` is set.

**Or explicitly enable it:**
- **Key**: `VITE_USE_DISCORD_DM`
- **Value**: `true`

### Step 3: How It Works

```javascript
// In ttapiService.ts
1. Send command to Ttapi → Get jobId
2. Try Discord DM polling first:
   - Call /api/discord/poll-dm
   - Polls your DM channel for Midjourney response
   - Extracts individual image URLs
3. If Discord DM fails → Fallback to Ttapi polling
```

## Advantages

✅ **No separate server needed** - Everything runs on Vercel  
✅ **Gets individual images** - No grid splitting needed  
✅ **Works with user token** - Uses your existing token  
✅ **Automatic fallback** - Falls back to Ttapi if DM polling fails  

## Limitations

⚠️ **Vercel Function Timeout:**
- Free tier: 10 seconds
- Pro tier: 60 seconds  
- Enterprise: 300 seconds (5 minutes)

**Solution:** The function polls for up to 10 minutes, but Vercel might timeout. For longer waits:
- Use a background job service
- Or use the Gateway server on Render.com
- Or accept the timeout and use Ttapi polling fallback

## Testing

1. **Set environment variable** in Vercel
2. **Generate images** with Ttapi
3. **Check logs** - Should see:
   ```
   [Ttapi] 🔄 Attempting to get individual images from Discord DM...
   [Ttapi] ✅ Got 4 individual image(s) from Discord DM!
   ```

## How It Extracts Individual Images

The function looks for:
1. **Individual URLs in message content** (if Midjourney includes them)
2. **Grid image URL** → Converts to 4 individual URLs:
   - `grid_0.png` → `0_0.png`, `0_1.png`, `0_2.png`, `0_3.png`
3. **Images from embeds**
4. **Images from attachments**

## Current Status

✅ **Code is ready** - `/api/discord/poll-dm.js` created  
✅ **Integration added** - `ttapiService.ts` updated  
⏳ **Needs testing** - Deploy to Vercel and test  

## Next Steps

1. **Deploy to Vercel** with `VITE_DISCORD_TOKEN` set
2. **Generate images** and check if it uses Discord DM polling
3. **Check logs** to see if individual images are extracted
4. **If it works** - You'll get 4 individual images instead of grid!

## Troubleshooting

**"No DM channel found":**
- Normal on first use - Ttapi creates it when sending command
- Function will fallback to Ttapi polling

**"Function timeout":**
- Vercel free tier: 10s limit (too short)
- Upgrade to Pro (60s) or Enterprise (300s)
- Or use Gateway server on Render.com for longer polling

**"Rate limit errors":**
- Discord API has rate limits
- Function includes retry logic
- Falls back to Ttapi polling if needed

