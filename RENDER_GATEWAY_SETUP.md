# Using Discord Gateway WebSocket on Render.com

## ✅ Yes, It Works!

**Render.com supports persistent servers**, which is exactly what Gateway WebSocket needs!

## Why Render Works (But Vercel Doesn't)

| Platform | Type | WebSocket Support |
|----------|------|-------------------|
| **Vercel** | Serverless | ❌ No (functions die after response) |
| **Render** | Persistent Server | ✅ Yes (server stays alive) |

## Render.com Service Types

### Option 1: Web Service (Recommended)
- ✅ Keeps server running 24/7
- ✅ Supports WebSocket connections
- ✅ Free tier available (with limitations)
- ✅ Auto-deploy from GitHub

### Option 2: Background Worker
- ✅ Long-running processes
- ✅ Good for Gateway connections
- ✅ Free tier available
- ✅ No HTTP endpoint (just runs in background)

## Setup Guide

### Step 1: Create Your Gateway Server

**Option A: Use the provided `gateway-server.js`** (for hybrid Ttapi approach)
- Already configured to use user token (`VITE_DISCORD_TOKEN`)
- Listens for DMs from Midjourney bot
- Extracts individual image URLs

**Option B: Create your own** (for full Gateway solution)

Create a new file: `gateway-server.js`

```javascript
// gateway-server.js
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

// Discord Gateway Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store results in memory (or use database)
const results = new Map();

// Connect to Discord Gateway
client.login(process.env.DISCORD_TOKEN);

client.on('ready', () => {
  console.log('✅ Discord Gateway connected!');
});

// Listen for Midjourney responses
client.on('messageCreate', async (message) => {
  // Midjourney bot ID
  if (message.author.id === '936929561302675456') {
    console.log('🎨 Midjourney responded!');
    
    // Extract images
    const images = [];
    
    // From embeds
    if (message.embeds) {
      message.embeds.forEach(embed => {
        if (embed.image?.url) images.push(embed.image.url);
      });
    }
    
    // From attachments
    if (message.attachments) {
      message.attachments.forEach(attachment => {
        if (attachment.url) images.push(attachment.url);
      });
    }
    
    // Store result (match by prompt or message reference)
    const prompt = message.content || message.embeds[0]?.description || '';
    const requestId = extractRequestId(prompt); // Your logic to match requests
    
    if (requestId) {
      results.set(requestId, {
        status: 'completed',
        images: images,
        messageId: message.id,
        timestamp: Date.now()
      });
    }
  }
});

// API endpoint to trigger Midjourney command
app.post('/api/imagine', async (req, res) => {
  const { prompt, channelId, styleRefUrl } = req.body;
  
  if (!prompt || !channelId) {
    return res.status(400).json({ error: 'Missing prompt or channelId' });
  }
  
  try {
    const channel = await client.channels.fetch(channelId);
    
    // Build full prompt
    let fullPrompt = prompt;
    if (styleRefUrl) {
      fullPrompt += ` --sref ${styleRefUrl} --sw 1000`;
    }
    
    // Send slash command
    // Note: This requires proper interaction handling
    // You might need to use a library or send as text first
    
    // For now, send as text (won't work, but shows structure)
    const message = await channel.send(`/imagine ${fullPrompt}`);
    
    // Generate request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store pending request
    results.set(requestId, {
      status: 'pending',
      prompt: fullPrompt,
      messageId: message.id,
      timestamp: Date.now()
    });
    
    res.json({
      requestId: requestId,
      status: 'pending',
      message: 'Command sent, waiting for Midjourney response...'
    });
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to check result
app.get('/api/result/:requestId', (req, res) => {
  const result = results.get(req.params.requestId);
  
  if (!result) {
    return res.status(404).json({ error: 'Request not found' });
  }
  
  res.json(result);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: client.isReady() ? 'connected' : 'disconnected',
    timestamp: Date.now()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gateway server running on port ${PORT}`);
});
```

### Step 2: Create package.json

```json
{
  "name": "discord-gateway-server",
  "version": "1.0.0",
  "main": "gateway-server.js",
  "scripts": {
    "start": "node gateway-server.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "express": "^4.18.2"
  }
}
```

### Step 3: Deploy to Render

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Gateway server"
   git push origin main
   ```

2. **Create New Web Service on Render**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository

3. **Configure Service**
   - **Name**: `discord-gateway-server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for better performance)

4. **Add Environment Variables**
   - `DISCORD_TOKEN`: Your Discord bot/user token
   - `PORT`: `3000` (Render sets this automatically)

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically

### Step 4: Update Your Vercel App

Update your Vercel app to use the Render Gateway server:

```javascript
// In your Vercel app
const RENDER_GATEWAY_URL = 'https://your-gateway-server.onrender.com';

// Send command
async function sendToMidjourney(prompt, styleRefUrl) {
  const response = await fetch(`${RENDER_GATEWAY_URL}/api/imagine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt,
      channelId: process.env.DISCORD_CHANNEL_ID,
      styleRefUrl: styleRefUrl
    })
  });
  
  const { requestId } = await response.json();
  return requestId;
}

// Poll for result
async function getResult(requestId) {
  const response = await fetch(`${RENDER_GATEWAY_URL}/api/result/${requestId}`);
  return await response.json();
}
```

## Architecture

```
┌─────────────┐
│   Vercel    │ ← Your app (frontend + API)
│   (App UI)  │
└──────┬──────┘
       │
       │ HTTP Requests
       ▼
┌─────────────┐
│   Render    │ ← Gateway server (persistent)
│  (Gateway)  │ ← Discord WebSocket connection
└──────┬──────┘
       │
       │ Gateway WebSocket
       ▼
┌─────────────┐
│  Discord    │ ← Midjourney bot
│  (Gateway)  │
└─────────────┘
```

## Render.com Pricing

### Free Tier
- ✅ 750 hours/month (enough for 24/7 if you're the only user)
- ✅ 512 MB RAM
- ✅ Sleeps after 15 minutes of inactivity (wakes on request)
- ⚠️ Cold start delay (~30 seconds when sleeping)

### Paid Plans
- **Starter**: $7/month
  - Always on (no sleep)
  - 512 MB RAM
  - Faster cold starts
  
- **Standard**: $25/month
  - Always on
  - 2 GB RAM
  - Better performance

## Important Notes

### 1. Free Tier Sleep Mode
- Render free tier **sleeps after 15 minutes** of inactivity
- When sleeping, first request takes ~30 seconds to wake up
- Gateway connection will drop when sleeping
- **Solution**: Use paid plan or implement reconnection logic

### 2. Sending Slash Commands
- Still need to properly send `/imagine` commands
- Can't send as text (Midjourney won't respond)
- Need to use Discord's Interaction API properly
- This is the complex part!

### 3. Database for Results
- Current example uses in-memory storage (lost on restart)
- **Better**: Use database (Supabase, MongoDB, etc.)
- Store results persistently

### 4. Reconnection Logic
```javascript
client.on('disconnect', () => {
  console.log('⚠️ Gateway disconnected, reconnecting...');
  client.login(process.env.DISCORD_TOKEN);
});
```

## Complete Example with Database

```javascript
// gateway-server.js (with database)
const { Client } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({ /* ... */ });
client.login(process.env.DISCORD_TOKEN);

client.on('messageCreate', async (message) => {
  if (message.author.id === '936929561302675456') {
    // Store in database
    await supabase
      .from('midjourney_results')
      .insert({
        message_id: message.id,
        images: extractImages(message),
        status: 'completed'
      });
  }
});

// API endpoint
app.post('/api/imagine', async (req, res) => {
  // Create request in database
  const { data } = await supabase
    .from('midjourney_requests')
    .insert({ prompt: req.body.prompt, status: 'pending' })
    .select()
    .single();
  
  // Send to Midjourney (via Gateway)
  // ... your logic here
  
  res.json({ requestId: data.id });
});
```

## Cost Comparison

| Solution | Monthly Cost | Setup Time |
|----------|--------------|------------|
| **GoAPI/Ttapi** | Pay per use (~$0.01-0.05/image) | 5 minutes |
| **Render Free** | $0 (with sleep limitations) | 1-2 hours |
| **Render Paid** | $7-25/month | 1-2 hours |
| **Render + Database** | $7-25/month + $0-25/month | 2-3 hours |

## Recommendation

**For learning/experimentation**: Use Render free tier
- ✅ Free
- ✅ Learn how Gateway works
- ⚠️ Sleep mode limitations

**For production**: Use GoAPI/Ttapi
- ✅ More reliable
- ✅ No infrastructure to manage
- ✅ Lower cost for occasional use

**For high volume**: Build on Render paid
- ✅ Full control
- ✅ Better for thousands of images/month
- ❌ More maintenance

## Summary

✅ **Yes, Gateway WebSocket works on Render.com!**

- Render supports persistent servers
- Can keep WebSocket connections open
- Free tier available (with sleep limitations)
- Can integrate with your Vercel app

**Next steps:**
1. Create Gateway server code
2. Deploy to Render
3. Update Vercel app to use Render API
4. Test and iterate

Good luck! 🚀

