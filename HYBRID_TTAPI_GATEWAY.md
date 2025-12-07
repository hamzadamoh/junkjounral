# Hybrid Approach: Ttapi Commands + Your Bot Retrieval

## ⚠️ CRITICAL LIMITATION DISCOVERED

**Problem**: Ttapi sends commands to Midjourney via **Direct Messages (DMs)**, not public channels!

This means:
- ❌ Ttapi uses their own Discord account to DM Midjourney bot
- ❌ Responses come back in Ttapi's DMs (not accessible to your bot)
- ❌ Your bot **CANNOT** see these responses
- ❌ **Hybrid approach won't work with Ttapi PPU mode**

## Possible Solutions

### Solution 1: Use Ttapi Hold Account Mode ❌

**Hold Account Mode also uses DMs:**
- ⚠️ **Still uses DMs** (not public channels)
- Commands sent via DM from your account
- Responses come back in DMs
- Your bot **still can't see them**

**Conclusion: Hybrid approach won't work with Ttapi** (neither PPU nor Hold Account Mode)

### Solution 2: Use User Token in Gateway Bot ⚠️

**If Ttapi uses your account token:**
- Ttapi sends commands from **your account** via DM
- Responses come to **your DMs**
- **Try using YOUR user token** in Gateway bot (not bot token)
- User token might be able to access your own DMs

**How it might work:**
```javascript
// Use USER TOKEN (same one Ttapi uses)
client.login(process.env.DISCORD_USER_TOKEN);

// Listen for DM messages
client.on('messageCreate', (message) => {
  if (message.channel.type === 'DM' && 
      message.author.id === '936929561302675456') {
    // Midjourney responded in your DM!
    extractImages(message);
  }
});
```

**⚠️ Warnings:**
- May violate Discord ToS
- Security risk (full account access)
- Use at your own risk

**See `USER_TOKEN_DM_ACCESS.md` for detailed guide.**

### Solution 3: Check GoAPI BYOA ⚠️

**GoAPI's Bring Your Own Account (BYOA):**
- Uses **YOUR Midjourney account**
- Commands sent from **your account**
- **Question**: Does it use channels or DMs?

**Check GoAPI documentation:**
- Do responses appear in your channels?
- Or do they also use DMs?
- Can you specify which channel/server?

**If GoAPI BYOA uses channels** → Hybrid approach would work!
**If GoAPI BYOA uses DMs** → Hybrid approach won't work

### Solution 4: Just Use Ttapi's Full Service

**If hybrid doesn't work:**
- Use Ttapi's complete service (submit + retrieve)
- They handle everything
- No need for your bot

## Original Idea (Won't Work with PPU Mode)

**Ttapi**: Submit commands (send `/imagine`)  
**Your Bot**: Retrieve individual image links (monitor Discord)

**This won't work because Ttapi uses DMs that your bot can't access.**

## Which Token to Use?

### ✅ **Use Your Bot Token (Recommended)**

**Why use the bot you created:**
- ✅ **Follows Discord ToS** - Bots are meant for automation
- ✅ **More secure** - Bot token can be revoked without affecting your account
- ✅ **Better permissions** - Can be configured with specific permissions
- ✅ **No account risk** - Your personal account stays safe

**What you need:**
- Bot token from the Discord application you created
- Bot added to your Discord server
- Bot permissions: `Read Messages`, `Read Message History`, `View Channels`

### ⚠️ **User Token (Not Recommended)**

**Why avoid user token:**
- ❌ **May violate Discord ToS** - User tokens are for personal use
- ❌ **Account risk** - If token is exposed, your account is compromised
- ❌ **Less secure** - Full account access

**Only use if:**
- You're just testing/learning
- You understand the risks
- You're okay with potential ToS violations

## How It Would Work

```
1. Your App → Ttapi API → Submit /imagine command
2. Ttapi → Discord → Sends command to Midjourney
3. Your Bot (Render) → Discord Gateway → Listens for Midjourney response
4. Your Bot → Extracts individual image URLs
5. Your Bot → Returns URLs to your app
```

## Benefits

✅ **Simpler**: You only need to listen, not send commands  
✅ **Cost Savings**: Potentially pay less (if Ttapi charges per request)  
✅ **Better Control**: You extract individual images yourself  
✅ **Reliability**: Your bot handles result retrieval

## Implementation

### Step 1: Use Ttapi to Submit Commands

```javascript
// In your Vercel app
async function submitToTtapi(prompt, styleRefUrl) {
  const response = await fetch('https://api.ttapi.io/midjourney/v1/imagine', {
    method: 'POST',
    headers: {
      'TT-API-KEY': process.env.VITE_TTAPI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      getUImages: true
    })
  });
  
  const { jobId } = await response.json();
  
  // Store jobId to match with Discord response
  return jobId;
}
```

### Step 2: Your Bot Listens for Midjourney Response

```javascript
// gateway-server.js (on Render)
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store pending requests (match by prompt or jobId)
const pendingRequests = new Map();

client.login(process.env.DISCORD_TOKEN);

client.on('ready', () => {
  console.log('✅ Gateway connected, listening for Midjourney...');
});

// Listen for DM messages from Midjourney bot
client.on('messageCreate', async (message) => {
  // Only process DMs (not server messages)
  if (message.channel.type !== 'DM') {
    return;
  }
  
  // Midjourney bot ID
  if (message.author.id === '936929561302675456') {
    console.log('🎨 Midjourney responded!');
    
    // Extract individual image URLs
    const imageUrls = extractIndividualImages(message);
    
    if (imageUrls.length > 0) {
      // Try to match with pending request
      // Match by prompt content or message reference
      const matchedRequest = findMatchingRequest(message);
      
      if (matchedRequest) {
        // Store result
        pendingRequests.set(matchedRequest.requestId, {
          status: 'completed',
          images: imageUrls,
          messageId: message.id,
          timestamp: Date.now()
        });
        
        console.log(`✅ Matched request ${matchedRequest.requestId}, found ${imageUrls.length} images`);
      }
    }
  }
});

// Extract individual image URLs from Midjourney response
function extractIndividualImages(message) {
  const images = [];
  
  // Method 1: From message content (individual image URLs)
  // Midjourney sometimes includes URLs like:
  // https://cdn.midjourney.com/.../0_0.png
  // https://cdn.midjourney.com/.../0_1.png
  // https://cdn.midjourney.com/.../0_2.png
  // https://cdn.midjourney.com/.../0_3.png
  
  const urlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|webp)/gi;
  const contentUrls = message.content.match(urlPattern);
  if (contentUrls) {
    images.push(...contentUrls);
  }
  
  // Method 2: From embeds
  if (message.embeds) {
    message.embeds.forEach(embed => {
      if (embed.image?.url) {
        images.push(embed.image.url);
      }
      if (embed.thumbnail?.url) {
        images.push(embed.thumbnail.url);
      }
    });
  }
  
  // Method 3: From attachments
  if (message.attachments) {
    message.attachments.forEach(attachment => {
      if (attachment.url) {
        images.push(attachment.url);
      }
    });
  }
  
  // Method 4: Parse grid image and extract individual URLs
  // If Midjourney returns a grid, extract the 4 individual image URLs
  // Grid URL format: https://cdn.midjourney.com/.../grid_0.png
  // Individual URLs: .../0_0.png, .../0_1.png, .../0_2.png, .../0_3.png
  
  const gridUrl = images.find(url => url.includes('grid'));
  if (gridUrl) {
    // Extract base URL and generate individual image URLs
    const baseUrl = gridUrl.replace(/grid_\d+\.png$/, '');
    for (let i = 0; i < 4; i++) {
      images.push(`${baseUrl}0_${i}.png`);
    }
  }
  
  return [...new Set(images)]; // Remove duplicates
}

// Match Midjourney response with pending request
function findMatchingRequest(message) {
  // Strategy 1: Match by prompt content
  const prompt = message.content || message.embeds[0]?.description || '';
  
  for (const [requestId, request] of pendingRequests.entries()) {
    if (request.status === 'pending') {
      // Check if prompt matches (first 50 chars)
      const requestPrompt = request.prompt.substring(0, 50);
      if (prompt.includes(requestPrompt) || requestPrompt.includes(prompt.substring(0, 50))) {
        return { requestId, request };
      }
    }
  }
  
  // Strategy 2: Match by message reference (if Ttapi references your message)
  if (message.referenced_message) {
    const referencedId = message.referenced_message.id;
    for (const [requestId, request] of pendingRequests.entries()) {
      if (request.messageId === referencedId) {
        return { requestId, request };
      }
    }
  }
  
  return null;
}

// API endpoint to register a request (called after Ttapi submission)
app.post('/api/register-request', (req, res) => {
  const { requestId, prompt, ttapiJobId } = req.body;
  
  pendingRequests.set(requestId, {
    status: 'pending',
    prompt: prompt,
    ttapiJobId: ttapiJobId,
    timestamp: Date.now()
  });
  
  res.json({ success: true, requestId });
});

// API endpoint to get result
app.get('/api/result/:requestId', (req, res) => {
  const result = pendingRequests.get(req.params.requestId);
  
  if (!result) {
    return res.status(404).json({ error: 'Request not found' });
  }
  
  res.json(result);
});

// Poll endpoint (for your app to check status)
app.get('/api/poll/:requestId', (req, res) => {
  const result = pendingRequests.get(req.params.requestId);
  
  if (!result) {
    return res.status(404).json({ error: 'Request not found' });
  }
  
  if (result.status === 'completed') {
    res.json({
      status: 'completed',
      images: result.images,
      messageId: result.messageId
    });
  } else {
    res.json({
      status: 'pending',
      message: 'Waiting for Midjourney response...'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gateway server running on port ${PORT}`);
});
```

### Step 3: Update Your App Flow

```javascript
// In your Vercel app
const RENDER_GATEWAY_URL = 'https://your-gateway-server.onrender.com';

async function generateWithHybrid(prompt, styleRefUrl) {
  // Step 1: Submit to Ttapi
  const ttapiResponse = await fetch('https://api.ttapi.io/midjourney/v1/imagine', {
    method: 'POST',
    headers: {
      'TT-API-KEY': process.env.VITE_TTAPI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `${prompt} ${styleRefUrl ? `--sref ${styleRefUrl} --sw 1000` : ''}`
    })
  });
  
  const { jobId } = await ttapiResponse.json();
  
  // Step 2: Register request with your Gateway bot
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await fetch(`${RENDER_GATEWAY_URL}/api/register-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: requestId,
      prompt: prompt,
      ttapiJobId: jobId
    })
  });
  
  // Step 3: Poll your Gateway bot for results
  let result = null;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes (5 second intervals)
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const pollResponse = await fetch(`${RENDER_GATEWAY_URL}/api/poll/${requestId}`);
    result = await pollResponse.json();
    
    if (result.status === 'completed') {
      return result.images; // Return individual image URLs
    }
    
    attempts++;
  }
  
  throw new Error('Timeout waiting for Midjourney response');
}
```

## Challenges & Solutions

### Challenge 1: Matching Requests

**Problem**: How to match Ttapi's command with Midjourney's response?

**Solutions**:
- Match by prompt content (first 50 chars)
- Match by message reference (if Ttapi references messages)
- Match by timestamp (within time window)
- Store Ttapi jobId and match somehow

### Challenge 2: Individual Image URLs

**Problem**: Midjourney might return grid image, not individual URLs

**Solutions**:
- Parse grid URL and generate individual URLs
- Use `getUImages: true` in Ttapi request (if supported)
- Extract from message content/embeds
- Split grid image client-side if needed

### Challenge 3: Timing

**Problem**: Your bot might miss the response if it's not listening

**Solutions**:
- Keep Gateway connection always open
- Use database to store all Midjourney messages
- Match by timestamp window

## Cost Comparison

| Approach | Command Submission | Result Retrieval | Total |
|----------|-------------------|------------------|-------|
| **Full Ttapi** | Ttapi | Ttapi | Pay per request |
| **Hybrid** | Ttapi | Your Bot (Free) | Pay per request (but simpler retrieval) |

**Note**: You still pay Ttapi for submitting commands, but you handle result retrieval yourself.

## Advantages

✅ **Simpler**: Only need to listen, not send commands  
✅ **Better Control**: You extract individual images exactly how you want  
✅ **Cost**: Same Ttapi cost, but you control result retrieval  
✅ **Reliability**: Your bot handles the extraction logic

## Disadvantages

❌ **Complexity**: Need to match requests with responses  
❌ **Infrastructure**: Need Render server for Gateway  
❌ **Maintenance**: Need to handle matching logic  
❌ **Potential Misses**: Bot might miss responses if connection drops

## Recommendation

**This hybrid approach is viable IF:**
- ✅ You want more control over image extraction
- ✅ You're already using Ttapi
- ✅ You're willing to maintain a Render server
- ✅ You want to extract individual images reliably

**Stick with full Ttapi IF:**
- ✅ You want simplicity
- ✅ Ttapi's result retrieval works fine
- ✅ You don't want to maintain infrastructure

## Token Setup

### Step 1: Get Your Bot Token

1. Go to https://discord.com/developers/applications
2. Select the **bot application you created earlier**
3. Go to **"Bot"** section
4. Under **"Token"**, click **"Reset Token"** (if needed)
5. Copy the token - this is your `DISCORD_BOT_TOKEN`

### Step 2: Add Bot to Your Server

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select scopes: `bot`
3. Select permissions:
   - ✅ `Read Messages/View Channels`
   - ✅ `Read Message History`
   - ✅ `Send Messages` (optional, for logging)
4. Copy the generated URL
5. Open URL and add bot to your server

### Step 3: Set Environment Variable on Render

In Render dashboard:
- **Key**: `DISCORD_BOT_TOKEN`
- **Value**: Your bot token (from Step 1)

## Summary

**⚠️ UPDATE: Hybrid approach won't work with Ttapi!**

**Why:**
- ❌ Ttapi PPU uses DMs (Ttapi's account)
- ❌ Ttapi Hold Account also uses DMs (your account, but still DMs)
- ❌ Your bot can't access DMs (they're private)
- ❌ Responses are invisible to your bot

**Possible solutions:**
1. **Check GoAPI BYOA** - Does it use channels or DMs?
2. **Build your own Gateway solution** - Full control, uses your channels
3. **Use Ttapi/GoAPI full service** - Simplest, but no hybrid control

**If you want hybrid approach:**
- You need a service that uses **public channels**, not DMs
- Or build your own Gateway solution (full control)

**Bottom line:** If all services use DMs, hybrid approach is **not possible** with third-party services. You'd need to build your own Gateway solution.

Sorry - the hybrid approach won't work with Ttapi! 😔

