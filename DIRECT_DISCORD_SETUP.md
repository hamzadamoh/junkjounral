# Direct Discord/Midjourney Integration Setup

This guide explains how to use your own Discord account token to connect directly to Midjourney, bypassing third-party services like Ttapi/GoAPI.

## ⚠️ Important Notes

1. **Terms of Service**: Using a user token directly may violate Discord's Terms of Service. Use at your own risk.
2. **Security**: Your Discord token grants full access to your account. Keep it secure and never commit it to Git.
3. **Alternative**: Consider using a Discord Bot token instead (requires creating a Discord application).

## Prerequisites

1. **Discord Account** with Midjourney subscription
2. **Discord Server** with Midjourney bot added
3. **Discord Token** (user token or bot token)
4. **Server ID** and **Channel ID** where Midjourney bot is active

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

