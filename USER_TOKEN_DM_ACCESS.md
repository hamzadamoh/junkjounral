# Using User Token to Access DMs for Hybrid Approach

## The Situation

**Ttapi uses YOUR account token** (Hold Account Mode):
- Commands sent from **your account**
- Responses come to **your DMs** (not public channels)
- Your bot (with bot token) **can't see your DMs**

## Possible Solution: Use User Token in Gateway Bot

**Idea**: If Ttapi uses your account token, maybe you can use **your user token** in the Gateway bot to access your own DMs.

### How It Might Work

```javascript
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages  // For accessing DMs
  ]
});

// Use USER TOKEN (not bot token)
// This is the token Ttapi uses (your account token)
client.login(process.env.DISCORD_USER_TOKEN);

client.on('ready', () => {
  console.log('✅ Connected with user token');
});

// Listen for DM messages
client.on('messageCreate', async (message) => {
  // Check if it's a DM
  if (message.channel.type === 'DM') {
    // Check if it's from Midjourney bot
    if (message.author.id === '936929561302675456') {
      console.log('🎨 Midjourney responded in DM!');
      
      // Extract images
      const images = extractImages(message);
      console.log(`Found ${images.length} images`);
    }
  }
});
```

## ⚠️ Important Warnings

### 1. Discord Terms of Service
- **Using user tokens for automation may violate Discord ToS**
- User tokens are meant for personal use, not automation
- Your account could be banned if detected

### 2. Security Risks
- User token gives **full access to your account**
- If exposed, someone could:
  - Read all your messages
  - Send messages as you
  - Delete your account
  - Access all your servers

### 3. Technical Limitations
- Discord.js might not fully support user tokens
- Some features might not work with user tokens
- Gateway connection might be unstable

## Testing If It Works

### Step 1: Get Your User Token

1. Open Discord in web browser
2. Press `F12` → Network tab
3. Send a message in Discord
4. Find request to `discord.com/api`
5. Copy `Authorization` header value

### Step 2: Test Gateway Connection

```javascript
// test-user-token.js
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.login('YOUR_USER_TOKEN');

client.on('ready', () => {
  console.log('✅ Connected!');
  console.log('User:', client.user.tag);
  
  // Try to access DMs
  client.channels.cache.forEach(channel => {
    if (channel.type === 'DM') {
      console.log('DM Channel:', channel.recipient?.tag);
    }
  });
});

client.on('messageCreate', (message) => {
  if (message.channel.type === 'DM') {
    console.log('DM from:', message.author.tag);
    console.log('Content:', message.content);
  }
});
```

### Step 3: Check If You Can See Midjourney DMs

1. Send a test command via Ttapi
2. Check if your Gateway bot receives the DM
3. Verify you can extract image URLs

## Alternative: Check Ttapi API for Channel Option

**Before trying user token, check Ttapi docs:**

Look for API parameters like:
```javascript
{
  prompt: "...",
  channel_id: "YOUR_CHANNEL_ID",  // Can you specify channel?
  use_dm: false,                   // Can you disable DMs?
  server_id: "YOUR_SERVER_ID"      // Can you specify server?
}
```

**If Ttapi supports channel specification:**
- ✅ Use your server/channel
- ✅ Your bot can see responses
- ✅ No need for user token
- ✅ Safer and ToS compliant

## If User Token Works

**Implementation:**

```javascript
// gateway-server.js
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Use USER TOKEN (same one Ttapi uses)
const USER_TOKEN = process.env.DISCORD_USER_TOKEN;

if (!USER_TOKEN) {
  console.error('❌ DISCORD_USER_TOKEN is required!');
  process.exit(1);
}

client.login(USER_TOKEN);

const pendingRequests = new Map();

client.on('ready', () => {
  console.log('✅ Gateway connected with user token');
  console.log('User:', client.user.tag);
});

// Listen for DM messages from Midjourney
client.on('messageCreate', async (message) => {
  // Only process DMs
  if (message.channel.type !== 'DM') return;
  
  // Check if from Midjourney bot
  if (message.author.id === '936929561302675456') {
    console.log('🎨 Midjourney responded in DM!');
    
    // Extract images
    const images = extractImages(message);
    
    // Match with pending request (by prompt or timestamp)
    const matchedRequest = findMatchingRequest(message);
    
    if (matchedRequest) {
      pendingRequests.set(matchedRequest.requestId, {
        status: 'completed',
        images: images,
        timestamp: Date.now()
      });
    }
  }
});

// API endpoints (same as before)
app.post('/api/register-request', (req, res) => {
  // Register request from your app
});

app.get('/api/result/:requestId', (req, res) => {
  // Get result
});

app.listen(process.env.PORT || 3000);
```

## Risks vs Benefits

### Risks
- ❌ May violate Discord ToS
- ❌ Account security risk
- ❌ Account could be banned
- ❌ Technical limitations

### Benefits
- ✅ Might work for hybrid approach
- ✅ Can access your DMs
- ✅ Full control over extraction

## Recommendation

**Before using user token:**

1. **Check Ttapi API docs** - Can you specify channels instead of DMs?
2. **Test user token** - Does it actually work with Discord.js?
3. **Understand risks** - Are you okay with potential ToS violation?
4. **Consider alternatives** - Is it worth the risk?

**If Ttapi doesn't support channels:**
- ⚠️ User token might work, but risky
- ✅ Building your own Gateway is safer
- ✅ Using Ttapi full service is simplest

## Summary

**If Ttapi uses your account token:**
- Commands sent from your account
- Responses in your DMs
- **Try using your user token** in Gateway bot
- Might be able to access your DMs
- ⚠️ But risky and may violate ToS

**Better approach:**
- Check if Ttapi supports channel specification
- Or build your own Gateway solution
- Or use Ttapi's full service

Good luck! 🚀

