# Direct Discord/Midjourney Integration Setup

⚠️ **CRITICAL LIMITATION**: Discord does **NOT** allow sending slash commands programmatically. Slash commands can only be triggered by user interactions in Discord's UI. This means **direct Discord integration may not work** for triggering Midjourney's `/imagine` command.

**This integration sends `/imagine` as plain text, which Midjourney bot will NOT respond to.**

**Recommended**: Use Ttapi or GoAPI instead, as they handle the Discord interaction complexity for you.

---

This guide explains how to attempt direct Discord integration (though it has limitations).

## ⚠️ Important Notes

1. **Terms of Service**: Using a user token directly may violate Discord's Terms of Service. Use at your own risk.
2. **Security**: Your Discord token grants full access to your account. Keep it secure and never commit it to Git.
3. **Alternative**: Consider using a Discord Bot token instead (requires creating a Discord application).

## Prerequisites

1. **Discord Account** with Midjourney subscription
2. **Discord Server** with Midjourney bot added
3. **Discord Token** (user token or bot token)
4. **Server ID** and **Channel ID** where Midjourney bot is active

## Step 0: Add Midjourney Bot to Your Server

### Option A: Add Official Midjourney Bot (Recommended)

1. **Join Midjourney's Official Server**:
   - Go to https://discord.gg/midjourney
   - Accept the invite and join the server

2. **Subscribe to Midjourney**:
   - You need an active Midjourney subscription to use the bot
   - Visit https://www.midjourney.com/account/ to subscribe

3. **Create Your Own Private Server** (Optional but Recommended):
   - In Discord, click the **"+"** icon on the left sidebar
   - Select **"Create My Own"** → **"For me and my friends"**
   - Give it a name (e.g., "My Midjourney Server")

4. **Add Midjourney Bot to Your Server**:
   - Go to https://discord.com/oauth2/authorize?client_id=936929561302675456&scope=bot
   - Or use this direct link: https://discord.com/api/oauth2/authorize?client_id=936929561302675456&permissions=0&scope=bot
   - Select your server from the dropdown
   - Click **"Authorize"**
   - Complete any CAPTCHA if prompted

5. **Verify Bot is Added**:
   - Go to your server
   - Check the member list on the right
   - You should see "Midjourney Bot" listed

6. **Create a Channel for Midjourney**:
   - Create a new text channel (e.g., `#midjourney-generations`)
   - Make sure the Midjourney bot has permission to send messages in this channel

### Option B: Create Your Own Discord Bot (For Bot Token)

If you want to use a bot token instead of a user token:

1. **Create Discord Application**:
   - Go to https://discord.com/developers/applications
   - Click **"New Application"**
   - Give it a name (e.g., "My Midjourney Bot")
   - Click **"Create"**

2. **Create Bot**:
   - Go to the **"Bot"** section in the left sidebar
   - Click **"Add Bot"** → **"Yes, do it!"**
   - Under **"Token"**, click **"Reset Token"** → **"Yes, do it!"**
   - Copy the token (this is your `VITE_DISCORD_TOKEN`)

3. **Enable Bot Permissions** (Optional - can be skipped):
   - **⚠️ IMPORTANT**: The "Privileged Gateway Intents" section may NOT be visible in your Discord Developer Portal
   - This is normal - Discord's interface varies and this section doesn't always appear
   - **You can skip this entire step** - it's not required for basic bot functionality
   - If you DO see it (rare): Scroll down in the **"Bot"** section to find **"Privileged Gateway Intents"** and enable **"MESSAGE CONTENT INTENT"**
   - If you DON'T see it (common): Just continue to the next step - no action needed

4. **Add Bot to Your Server**:
   - Go to **"OAuth2"** → **"URL Generator"**
   - Under **"Scopes"**, check:
     - ✅ `bot`
     - ✅ `applications.commands` (if you want slash commands)
   - Under **"Bot Permissions"**, check:
     - ✅ `Send Messages`
     - ✅ `Read Message History`
     - ✅ `Attach Files`
     - ✅ `Embed Links`
     - ✅ `Read Messages/View Channels`
   - Copy the generated URL at the bottom
   - Open the URL in your browser
   - Select your server and click **"Authorize"**
   - Complete CAPTCHA if prompted

5. **⚠️ IMPORTANT CLARIFICATION**:
   - **Your bot CANNOT trigger Midjourney's `/imagine` command** - only Midjourney bot can respond to its own commands
   - Your bot is useful for: reading messages, monitoring channels, or building your own features
   - **For Midjourney integration, you need a USER TOKEN** (not bot token) to send messages that Midjourney bot can see
   - OR: You need the **official Midjourney bot** in your server (see Step 0, Option A)
   - The bot you created is separate and won't interact with Midjourney directly

## Step 1: Get Your Discord Credentials

### A. Get Discord Token

**Method 1: User Token (Easier, but may violate ToS)**
1. Open Discord in a web browser and log in
2. Press `F12` to open Developer Tools
3. Go to the **Network** tab
4. Send a message in Discord
5. Look for a request to `discord.com/api`
6. In the request headers, find the `Authorization` field
7. Copy the token value (starts with your user ID)

**Method 2: Bot Token (Recommended, but requires setup)**
1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to "Bot" section
4. Create a bot and copy the token
5. Add the bot to your Discord server with appropriate permissions

### B. Get Server ID and Channel ID

1. Enable **Developer Mode** in Discord:
   - Settings → Advanced → Developer Mode
2. **Server ID**:
   - Right-click on your server name → "Copy Server ID"
3. **Channel ID**:
   - Right-click on the channel where Midjourney bot is active → "Copy Channel ID"

## Step 2: Configure Environment Variables

Add these to your `.env.local` file:

```bash
VITE_DISCORD_TOKEN=your_discord_token_here
VITE_DISCORD_SERVER_ID=your_server_id_here
VITE_DISCORD_CHANNEL_ID=your_channel_id_here
```

**Example:**
```bash
VITE_DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OTA.Xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_DISCORD_SERVER_ID=123456789012345678
VITE_DISCORD_CHANNEL_ID=987654321098765432
```

## Step 3: Select "Direct" Service in UI

1. Open the app
2. Go to **Settings Panel**
3. Under **Image Generation Service**, select **"Midjourney (Direct)"**
4. The app will now use your Discord token to connect directly

## Step 4: How It Works

1. **Sends Command**: The app sends `/imagine` commands to Midjourney bot via Discord API
2. **Polls for Response**: The app monitors the Discord channel for Midjourney bot responses
3. **Extracts Images**: When Midjourney responds, the app extracts image URLs from message embeds/attachments
4. **Converts to Base64**: Images are converted to base64 data URLs for display

## Technical Details

### API Endpoints Used

- **Send Message**: `POST /api/discord/message` (proxied to Discord API)
- **Fetch Messages**: `GET /api/discord/messages` (proxied to Discord API)

### Serverless Functions

The app uses Vercel serverless functions to proxy Discord API calls:
- `api/discord/message.js` - Sends messages to Discord
- `api/discord/messages.js` - Fetches messages from Discord

This keeps your Discord token secure on the server and bypasses CORS.

## Troubleshooting

### "Discord credentials not configured"
- Make sure all three environment variables are set in `.env.local`
- Restart your dev server after adding environment variables

### "Discord API error: 401"
- Your Discord token is invalid or expired
- Get a fresh token and update `VITE_DISCORD_TOKEN`

### "Discord API error: 403"
- Your token doesn't have permission to access the channel
- Make sure the token has access to the specified server and channel

### "No images returned from Midjourney"
- Check that Midjourney bot is active in the specified channel
- Verify the channel ID is correct
- Make sure your Midjourney subscription is active

### "Command sent but no response"
- Midjourney bot may be slow to respond (wait up to 5 minutes)
- Check the Discord channel manually to see if Midjourney responded
- Verify the bot is listening in that channel

## Limitations

1. **Slash Commands**: Discord doesn't allow sending slash commands as regular messages. The current implementation sends `/imagine` as text, which may not work if Midjourney bot only accepts proper slash commands.

2. **Interaction API**: To properly send slash commands, you'd need to use Discord's Interaction API, which requires:
   - Setting up an interaction endpoint
   - Handling interaction callbacks
   - More complex implementation

3. **Rate Limits**: Discord has rate limits. Too many requests may result in temporary bans.

## Alternative: Use Discord.js Library

For a more robust implementation, consider using the `discord.js` library:

```bash
npm install discord.js
```

This would allow:
- Proper slash command handling
- WebSocket connection (faster than polling)
- Better error handling
- Automatic reconnection

However, this requires a Node.js backend (not just serverless functions).

## Security Best Practices

✅ **DO**:
- Keep your Discord token in `.env.local` (already in `.gitignore`)
- Use environment variables in Vercel for production
- Rotate your token if it's exposed
- Use a bot token instead of user token if possible

❌ **DON'T**:
- Commit `.env.local` to Git
- Share your Discord token publicly
- Hardcode tokens in source code
- Use the same token for multiple projects

## Next Steps

1. Test with a single image generation
2. Monitor console logs for any errors
3. Check Discord channel to verify commands are being sent
4. Adjust polling interval if needed (default: 5 seconds)

If you encounter issues, check:
- Browser console for errors
- Vercel function logs (if deployed)
- Discord channel for Midjourney responses

