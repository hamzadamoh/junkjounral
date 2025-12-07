# Gateway Server Integration Guide

## Current Status

**The Gateway server is NOT integrated yet.** It exists as a standalone server (`gateway-server.js`) but your app is still using Ttapi's direct polling method.

## Testing If User Token Works

**Before integrating, test if user tokens can access DMs:**

```bash
# Set your user token
export DISCORD_USER_TOKEN="your_token_here"
# OR
export VITE_DISCORD_TOKEN="your_token_here"

# Run test script
node test-user-token.js
```

**What to look for:**
- ✅ "Connected successfully!" = Good sign
- ✅ "Found DM channel with Midjourney bot!" = Gateway should work
- ❌ Errors accessing DMs = Gateway won't work
- ❌ "Failed to login" = User token not supported

## Integration Steps

### Step 1: Deploy Gateway Server to Render.com

1. Push `gateway-server.js` and `package-gateway.json` to GitHub
2. Deploy to Render.com as Web Service
3. Set environment variable: `VITE_DISCORD_TOKEN` = your user token
4. Get your Gateway URL: `https://your-gateway.onrender.com`

### Step 2: Update Ttapi Service to Use Gateway

**Option A: Use Gateway for Individual Images (Hybrid)**

```typescript
// In services/ttapiService.ts

// Add Gateway URL (from environment or config)
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'https://your-gateway.onrender.com';

// In generateJournalPage function, after sending to Ttapi:
async function generateJournalPage(...) {
  // ... existing prompt building code ...
  
  // Send task to Ttapi
  const jobId = await sendTaskToTtapi(prompt);
  
  // Register request with Gateway
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    await fetch(`${GATEWAY_URL}/api/register-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: requestId,
        prompt: prompt,
        ttapiJobId: jobId
      })
    });
    console.log(`[Ttapi] Registered request ${requestId} with Gateway`);
  } catch (error) {
    console.warn(`[Ttapi] Failed to register with Gateway, falling back to direct polling:`, error);
  }
  
  // Try Gateway first, fallback to direct polling
  let imageUrls: string[] = [];
  
  try {
    // Poll Gateway for results (faster, gets individual images)
    imageUrls = await pollGateway(requestId, 120, 5000); // 10 minutes max
    console.log(`[Ttapi] ✅ Got ${imageUrls.length} images from Gateway`);
  } catch (error) {
    console.warn(`[Ttapi] Gateway failed, falling back to direct polling:`, error);
    // Fallback to existing polling method
    const staggerDelay = (variationIndex ?? 0) * 500;
    imageUrls = await pollTaskUntilComplete(jobId, 180, 5000, staggerDelay);
  }
  
  // ... rest of code ...
}

// New function to poll Gateway
async function pollGateway(requestId: string, maxAttempts: number = 120, interval: number = 5000): Promise<string[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    
    try {
      const response = await fetch(`${GATEWAY_URL}/api/poll/${requestId}`);
      const result = await response.json();
      
      if (result.status === 'completed') {
        return result.images || [];
      }
      
      if (result.status === 'pending') {
        continue; // Keep polling
      }
      
      throw new Error(`Gateway returned unexpected status: ${result.status}`);
    } catch (error: any) {
      if (attempt === maxAttempts - 1) {
        throw error; // Last attempt, throw error
      }
      // Continue polling on error
    }
  }
  
  throw new Error('Gateway polling timeout');
}
```

**Option B: Use Gateway Only (No Ttapi Polling)**

Replace the entire polling logic with Gateway polling only.

## Environment Variables

**For Gateway Server (Render.com):**
- `VITE_DISCORD_TOKEN` or `DISCORD_USER_TOKEN`: Your user token

**For Your App (Vercel):**
- `VITE_GATEWAY_URL`: Your Gateway server URL (optional, falls back to direct polling if not set)

## Testing

1. **Test user token access:**
   ```bash
   node test-user-token.js
   ```

2. **Deploy Gateway server:**
   - Push to GitHub
   - Deploy on Render.com
   - Check logs for "✅ Gateway connected"

3. **Test integration:**
   - Generate images with Ttapi
   - Check Gateway logs for DM messages
   - Verify individual images are extracted

## Current Limitation

**The Gateway server is NOT integrated yet.** Your app is still:
- Using Ttapi's direct polling
- Getting grid images
- Splitting them client-side

**To use Gateway:**
1. Test if user token works (`test-user-token.js`)
2. Deploy Gateway server
3. Integrate Gateway polling into `ttapiService.ts`

## Why It Might Not Work

**Discord.js may not support user tokens:**
- User tokens are meant for REST API, not Gateway
- Discord.js is designed for bot tokens
- Gateway connection might fail with user token

**If it doesn't work:**
- You'll need to use Ttapi's direct polling (current method)
- Or build your own Gateway with raw WebSocket
- Or use a different approach

