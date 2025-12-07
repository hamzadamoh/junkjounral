/**
 * Vercel serverless function to poll Discord DM channel for Midjourney responses
 * Uses REST API (no WebSocket needed) - works on Vercel!
 * 
 * This polls your DM channel with Midjourney bot to get individual image URLs
 * 
 * Note: This function can run for up to 10 minutes (Vercel Pro plan limit)
 * For longer waits, consider using a background job or webhook
 */

export default async function handler(req, res) {
  // Set timeout to 9 minutes (Vercel free tier: 10s, Pro: 60s, Enterprise: 300s)
  // For longer polling, you might need to use a different approach
  const MAX_EXECUTION_TIME = 9 * 60 * 1000; // 9 minutes
  const startTime = Date.now();
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, jobId, requestId, gridImageUrl, completedAt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // If gridImageUrl is provided, we can match by it (most reliable)
  // If completedAt is provided, we know when to start looking

  const DISCORD_TOKEN = process.env.VITE_DISCORD_TOKEN || process.env.DISCORD_USER_TOKEN;
  const MIDJOURNEY_BOT_ID = '936929561302675456';

  if (!DISCORD_TOKEN) {
    return res.status(500).json({ error: 'Discord token not configured' });
  }

  try {
    // Step 1: Get your DM channel with Midjourney bot
    // First, get your user info
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': DISCORD_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to get user info: ${userResponse.status}`);
    }

    const user = await userResponse.json();
    console.log(`[Discord] User: ${user.username}#${user.discriminator}`);

    // Step 2: Get DM channels
    const dmChannelsResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      headers: {
        'Authorization': DISCORD_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!dmChannelsResponse.ok) {
      throw new Error(`Failed to get DM channels: ${dmChannelsResponse.status}`);
    }

    const dmChannels = await dmChannelsResponse.json();
    console.log(`[Discord] Found ${dmChannels.length} DM channel(s)`);

    // Step 3: Find DM channel with Midjourney bot
    let midjourneyChannel = dmChannels.find(channel => {
      // DM channels have a recipients array
      return channel.recipients && channel.recipients.some(recipient => recipient.id === MIDJOURNEY_BOT_ID);
    });

    if (!midjourneyChannel) {
      // If no DM channel exists, we can't poll
      // Ttapi will create it when it sends the first message
      return res.status(404).json({ 
        error: 'No DM channel with Midjourney bot found. Ttapi will create it when sending the command.',
        retry: true 
      });
    }

    console.log(`[Discord] Found DM channel with Midjourney: ${midjourneyChannel.id}`);

    // Step 4: Poll for new messages
    // Since Ttapi already confirmed completion, we only need to look at recent messages
    // Poll for a shorter time (2 minutes max) since the message should already exist
    const maxAttempts = completedAt ? 24 : 120; // 2 minutes if completedAt provided, 10 minutes otherwise
    const pollInterval = completedAt ? 2000 : 5000; // 2s if we know completion time, 5s otherwise
    let attempts = 0;
    const pollStartTime = Date.now();

    while (attempts < maxAttempts) {
      attempts++;
      const elapsed = Math.round((Date.now() - pollStartTime) / 1000);

      // Fetch recent messages from DM channel
      // If we know completion time, fetch more messages to find the matching one
      const messageLimit = completedAt ? 20 : 10;
      const messagesResponse = await fetch(
        `https://discord.com/api/v10/channels/${midjourneyChannel.id}/messages?limit=${messageLimit}`,
        {
          headers: {
            'Authorization': DISCORD_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!messagesResponse.ok) {
        console.error(`[Discord] Failed to fetch messages: ${messagesResponse.status}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      const messages = await messagesResponse.json();
      console.log(`[Discord] Poll ${attempts}/${maxAttempts} (${elapsed}s): Found ${messages.length} message(s)`);

      // Look for messages from Midjourney bot that match our criteria
      for (const message of messages) {
        // Check if from Midjourney bot
        if (message.author.id !== MIDJOURNEY_BOT_ID) {
          continue;
        }

        // If gridImageUrl is provided, try to match by it first (most reliable)
        if (gridImageUrl) {
          const messageContent = message.content || '';
          const messageEmbeds = message.embeds || [];
          const embedImageUrl = messageEmbeds[0]?.image?.url || '';
          const attachmentUrls = (message.attachments || []).map(a => a.url).join(' ');
          const allUrls = `${messageContent} ${embedImageUrl} ${attachmentUrls}`;
          
          // Extract base URL from gridImageUrl (remove query params, get base path)
          const gridBaseUrl = gridImageUrl.split('?')[0].replace(/\/[^\/]+\.(png|jpg|jpeg|webp)$/i, '');
          
          // Check if message contains the same base URL (same generation)
          if (allUrls.includes(gridBaseUrl) || allUrls.includes(gridImageUrl.split('/').pop()?.split('?')[0] || '')) {
            console.log(`[Discord] ✅ Found matching message by grid image URL!`);
            const imageUrls = extractImageUrls(message);
            if (imageUrls.length > 0) {
              return res.status(200).json({
                success: true,
                images: imageUrls,
                messageId: message.id,
                timestamp: message.timestamp,
                prompt: prompt,
                matchedBy: 'gridImageUrl'
              });
            }
          }
        }

        // Match by timestamp (if completedAt provided, look for messages around that time)
        if (completedAt) {
          const messageTime = new Date(message.timestamp).getTime();
          const completedTime = new Date(completedAt).getTime();
          const timeDiff = Math.abs(messageTime - completedTime);
          
          // Message should be within 2 minutes of completion
          if (timeDiff > 2 * 60 * 1000) {
            continue; // Too far from completion time
          }
        } else {
          // No completion time, check if message is recent (within last 15 minutes)
          const messageTime = new Date(message.timestamp).getTime();
          const requestTime = Date.now() - (15 * 60 * 1000); // 15 minutes ago
          if (messageTime < requestTime) {
            continue; // Message too old
          }
        }

        // Try to match by prompt (check if message contains prompt keywords)
        const messageContent = message.content || '';
        const messageEmbeds = message.embeds || [];
        const embedDescription = messageEmbeds[0]?.description || '';
        const fullMessageText = `${messageContent} ${embedDescription}`.toLowerCase();
        
        // Extract key words from prompt (remove --sref, --sw, etc.)
        const cleanPrompt = prompt.replace(/--\w+\s+[^\s]+/g, '').trim();
        const promptKeywords = cleanPrompt.toLowerCase().split(' ').slice(0, 5).join(' '); // First 5 words

        // Check if message matches our prompt
        const matchesPrompt = fullMessageText.includes(promptKeywords) || 
                             promptKeywords.split(' ').some(word => word.length > 3 && fullMessageText.includes(word));

        if (!matchesPrompt) {
          continue; // Not our message
        }

        console.log(`[Discord] ✅ Found matching message from Midjourney by prompt!`);

        // Extract individual image URLs
        const imageUrls = extractImageUrls(message);

        if (imageUrls.length > 0) {
          console.log(`[Discord] ✅ Extracted ${imageUrls.length} image URL(s)`);
          return res.status(200).json({
            success: true,
            images: imageUrls,
            messageId: message.id,
            timestamp: message.timestamp,
            prompt: prompt,
            matchedBy: completedAt ? 'timestamp' : 'prompt'
          });
        }
      }

      // Check execution time limit (Vercel timeout protection)
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        return res.status(408).json({
          error: 'Function execution time limit reached',
          attempts: attempts,
          elapsed: Math.round((Date.now() - startTime) / 1000),
          message: 'Vercel serverless function timeout. Consider using a background job for longer polling.'
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    return res.status(408).json({
      error: 'Timeout waiting for Midjourney response',
      attempts: attempts,
      elapsed: Math.round((Date.now() - startTime) / 1000)
    });

  } catch (error) {
    console.error('[Discord] Error polling DM:', error);
    return res.status(500).json({
      error: 'Failed to poll Discord DM',
      message: error.message
    });
  }
}

/**
 * Extract image URLs from Discord message
 */
function extractImageUrls(message) {
  const imageUrls = [];

  // From message content (individual URLs)
  const urlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|webp)/gi;
  const contentUrls = (message.content || '').match(urlPattern);
  if (contentUrls) {
    imageUrls.push(...contentUrls);
  }

  // From embeds
  if (message.embeds && message.embeds.length > 0) {
    message.embeds.forEach(embed => {
      if (embed.image?.url) {
        imageUrls.push(embed.image.url);
      }
      if (embed.thumbnail?.url) {
        imageUrls.push(embed.thumbnail.url);
      }
      if (embed.url && embed.url.match(/\.(png|jpg|jpeg|webp)/i)) {
        imageUrls.push(embed.url);
      }
    });
  }

  // From attachments
  if (message.attachments && message.attachments.length > 0) {
    message.attachments.forEach(attachment => {
      if (attachment.url && attachment.url.match(/\.(png|jpg|jpeg|webp)/i)) {
        imageUrls.push(attachment.url);
      }
    });
  }

  // Parse grid image and extract individual URLs
  // Note: Midjourney bot in DMs typically only shows the grid image
  // Individual images appear after clicking U1-U4 buttons, which we can't do via API
  // So we'll try to extract individual URLs if they exist, otherwise return the grid
  const gridUrl = imageUrls.find(url => url.includes('grid'));
  if (gridUrl) {
    // Try to extract individual URLs from grid URL pattern
    // Grid: https://cdn.midjourney.com/.../grid_0.png
    // Individual: .../0_0.png, .../0_1.png, .../0_2.png, .../0_3.png
    const baseUrl = gridUrl.replace(/grid_\d+\.png.*$/, '');
    const individualUrls = [];
    for (let i = 0; i < 4; i++) {
      individualUrls.push(`${baseUrl}0_${i}.png`);
    }
    // Replace grid URL with individual URLs
    const gridIndex = imageUrls.indexOf(gridUrl);
    imageUrls.splice(gridIndex, 1, ...individualUrls);
  } else if (imageUrls.length === 1) {
    // If we only have 1 image and it's not a grid, it might be a single image
    // Try to check if it's a Discord CDN URL that might have individual variants
    const singleUrl = imageUrls[0];
    if (singleUrl.includes('cdn.discordapp.com') || singleUrl.includes('discord.com')) {
      // This is likely a grid image from Discord CDN
      // Individual images would be in separate messages after clicking U buttons
      // Since we can't click buttons, we'll return the single image (grid)
      // The client will split it
      console.log(`[Discord] Found single Discord CDN image (likely grid). Individual images require button clicks.`);
    }
  }

  // Remove duplicates
  return [...new Set(imageUrls)];
}

