/**
 * Discord Gateway Server for Hybrid Ttapi Approach
 * 
 * This server listens for Midjourney bot responses in DMs
 * (since Ttapi uses your account token and sends commands via DM)
 * 
 * Deploy this to Render.com as a Web Service
 */

const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

// Store pending requests (match by prompt or timestamp)
const pendingRequests = new Map();

// Initialize Discord client with intents for DMs
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages  // Required to access DMs
  ]
});

// Use USER TOKEN (same one Ttapi uses - VITE_DISCORD_TOKEN)
// This is your account token, not a bot token
const USER_TOKEN = process.env.DISCORD_USER_TOKEN || process.env.VITE_DISCORD_TOKEN;

if (!USER_TOKEN) {
  console.error('❌ DISCORD_USER_TOKEN or VITE_DISCORD_TOKEN environment variable is required!');
  console.error('This should be the same user token that Ttapi uses.');
  process.exit(1);
}

console.log('🔑 Using user token for Gateway connection...');
client.login(USER_TOKEN);

client.on('ready', () => {
  console.log('✅ Gateway connected with user token');
  console.log('User:', client.user.tag);
  console.log('User ID:', client.user.id);
  console.log('Listening for Midjourney bot responses in DMs...');
});

// Listen for DM messages from Midjourney bot
client.on('messageCreate', async (message) => {
  // Only process DMs (not server messages)
  if (message.channel.type !== 'DM') {
    return;
  }
  
  // Midjourney bot ID
  const MIDJOURNEY_BOT_ID = '936929561302675456';
  
  // Check if message is from Midjourney bot
  if (message.author.id === MIDJOURNEY_BOT_ID) {
    console.log('🎨 Midjourney responded in DM!');
    console.log('Message ID:', message.id);
    console.log('Content preview:', message.content.substring(0, 100));
    
    // Extract individual image URLs
    const imageUrls = extractIndividualImages(message);
    
    if (imageUrls.length > 0) {
      console.log(`✅ Found ${imageUrls.length} image(s)`);
      
      // Try to match with pending request
      const matchedRequest = findMatchingRequest(message);
      
      if (matchedRequest) {
        console.log(`✅ Matched request: ${matchedRequest.requestId}`);
        
        // Check if this request was already completed (prevent duplicate matches)
        if (matchedRequest.request.status === 'completed') {
          console.warn(`⚠️ Request ${matchedRequest.requestId} was already completed! Skipping duplicate match.`);
          return; // Don't overwrite existing result
        }
        
        // Store result and mark as completed (keep original request data)
        pendingRequests.set(matchedRequest.requestId, {
          ...matchedRequest.request, // Keep original request data (prompt, ttapiJobId, etc.)
          status: 'completed',
          images: imageUrls,
          messageId: message.id,
          completedAt: Date.now(),
          originalPrompt: matchedRequest.request.prompt // Keep original prompt for reference
        });
        
        // Clean up old completed requests to prevent memory issues
        cleanupOldRequests();
      } else {
        console.log('⚠️ No matching request found, storing as unmatched response');
        // Store with timestamp as key for manual retrieval
        const timestampKey = `unmatched_${Date.now()}`;
        pendingRequests.set(timestampKey, {
          status: 'completed',
          images: imageUrls,
          messageId: message.id,
          timestamp: Date.now(),
          prompt: message.content || message.embeds[0]?.description || ''
        });
      }
    } else {
      console.log('⚠️ No images found in Midjourney response');
    }
  }
});

/**
 * Extract individual image URLs from Midjourney message
 */
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
    console.log(`📷 Found ${contentUrls.length} URL(s) in message content`);
  }
  
  // Method 2: From embeds (most common)
  if (message.embeds && message.embeds.length > 0) {
    message.embeds.forEach((embed, index) => {
      if (embed.image?.url) {
        images.push(embed.image.url);
        console.log(`📷 Image from embed ${index + 1}: ${embed.image.url}`);
      }
      if (embed.thumbnail?.url) {
        images.push(embed.thumbnail.url);
        console.log(`📷 Thumbnail from embed ${index + 1}: ${embed.thumbnail.url}`);
      }
      // Check if embed URL is an image
      if (embed.url && embed.url.match(/\.(png|jpg|jpeg|webp)/i)) {
        images.push(embed.url);
        console.log(`📷 Image from embed URL: ${embed.url}`);
      }
    });
  }
  
  // Method 3: From attachments
  if (message.attachments && message.attachments.size > 0) {
    message.attachments.forEach((attachment, attachmentId) => {
      if (attachment.url && attachment.url.match(/\.(png|jpg|jpeg|webp)/i)) {
        images.push(attachment.url);
        console.log(`📎 Image from attachment: ${attachment.url}`);
      }
    });
  }
  
  // Method 4: Parse grid image and extract individual URLs
  // If Midjourney returns a grid, extract the 4 individual image URLs
  // Grid URL format: https://cdn.midjourney.com/.../grid_0.png
  // Individual URLs: .../0_0.png, .../0_1.png, .../0_2.png, .../0_3.png
  const gridUrl = images.find(url => url.includes('grid'));
  if (gridUrl) {
    console.log('🔍 Found grid image, extracting individual URLs...');
    // Extract base URL and generate individual image URLs
    const baseUrl = gridUrl.replace(/grid_\d+\.png$/, '');
    for (let i = 0; i < 4; i++) {
      const individualUrl = `${baseUrl}0_${i}.png`;
      images.push(individualUrl);
      console.log(`📷 Individual image ${i + 1}: ${individualUrl}`);
    }
  }
  
  // Remove duplicates
  return [...new Set(images)];
}

/**
 * Match Midjourney response with pending request
 * Improved matching to prevent duplicate matches
 */
function findMatchingRequest(message) {
  const messageContent = message.content || message.embeds[0]?.description || '';
  const messageTimestamp = message.createdTimestamp;
  
  // Get all PENDING requests, sorted by timestamp (oldest first - FIFO)
  const pendingList = Array.from(pendingRequests.entries())
    .filter(([id, req]) => req.status === 'pending')
    .sort((a, b) => a[1].timestamp - b[1].timestamp); // Oldest first
  
  if (pendingList.length === 0) {
    console.log('⚠️ No pending requests to match');
    return null;
  }
  
  // Strategy 1: Match by Ttapi jobId (most precise)
  // If Ttapi includes jobId in the response somehow, use that
  // (This would require Ttapi to include jobId in the prompt or metadata)
  
  // Strategy 2: Match by exact prompt content (most reliable)
  // Extract the actual prompt from Midjourney response
  // Midjourney responses often include the prompt in the embed description
  const extractedPrompt = extractPromptFromMessage(message);
  
  if (extractedPrompt) {
    for (const [requestId, request] of pendingList) {
      // Exact match (case-insensitive, trimmed)
      const requestPromptClean = request.prompt.trim().toLowerCase();
      const extractedPromptClean = extractedPrompt.trim().toLowerCase();
      
      if (requestPromptClean === extractedPromptClean) {
        console.log(`✅ Matched by exact prompt: "${requestPromptClean.substring(0, 50)}..."`);
        return { requestId, request };
      }
      
      // Check if prompts are very similar (90% match)
      const similarity = calculateSimilarity(requestPromptClean, extractedPromptClean);
      if (similarity > 0.9) {
        console.log(`✅ Matched by high similarity (${Math.round(similarity * 100)}%): "${requestPromptClean.substring(0, 50)}..."`);
        return { requestId, request };
      }
    }
  }
  
  // Strategy 3: Match by timestamp + prompt prefix (fallback)
  // Only match if:
  // 1. Within 2 minutes (tighter window)
  // 2. Prompt prefix matches (first 30 chars)
  // 3. It's the OLDEST pending request (FIFO)
  
  for (const [requestId, request] of pendingList) {
    const timeDiff = messageTimestamp - request.timestamp;
    
    // Only match if response came AFTER request (not before)
    if (timeDiff < 0) continue; // Response came before request - impossible
    
    // Tight time window: 30 seconds to 5 minutes
    if (timeDiff >= 30000 && timeDiff < 5 * 60 * 1000) {
      const requestPrefix = request.prompt.substring(0, 30).toLowerCase().trim();
      const messagePrefix = messageContent.substring(0, 30).toLowerCase().trim();
      
      // Check if prefixes match
      if (requestPrefix && messagePrefix && 
          (messagePrefix.includes(requestPrefix) || requestPrefix.includes(messagePrefix))) {
        console.log(`✅ Matched by timestamp + prefix (${Math.round(timeDiff / 1000)}s after request): "${requestPrefix}..."`);
        return { requestId, request };
      }
    }
  }
  
  // Strategy 4: Match by message reference (if Ttapi references your message)
  if (message.referenced_message) {
    const referencedId = message.referenced_message.id;
    for (const [requestId, request] of pendingList) {
      if (request.messageId === referencedId) {
        console.log(`✅ Matched by message reference`);
        return { requestId, request };
      }
    }
  }
  
  console.log('⚠️ No matching request found for Midjourney response');
  return null;
}

/**
 * Extract prompt from Midjourney message
 */
function extractPromptFromMessage(message) {
  // Try to extract from embed description
  if (message.embeds && message.embeds.length > 0) {
    const embed = message.embeds[0];
    if (embed.description) {
      // Midjourney often includes prompt in description
      // Format: "Prompt: [actual prompt text]"
      const promptMatch = embed.description.match(/prompt[:\s]+(.+)/i);
      if (promptMatch) {
        return promptMatch[1].trim();
      }
      // Or the description itself might be the prompt
      return embed.description.trim();
    }
  }
  
  // Try message content
  if (message.content) {
    // Remove URLs and other metadata
    const cleaned = message.content
      .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
      .replace(/--\w+\s+[^\s]+/g, '') // Remove parameters like --ar 3:4
      .trim();
    
    if (cleaned.length > 10) {
      return cleaned;
    }
  }
  
  return null;
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  
  // Simple word-based similarity
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// API endpoint to register a request (called after Ttapi submission)
app.post('/api/register-request', (req, res) => {
  const { requestId, prompt, ttapiJobId } = req.body;
  
  if (!requestId || !prompt) {
    return res.status(400).json({ error: 'Missing requestId or prompt' });
  }
  
  pendingRequests.set(requestId, {
    status: 'pending',
    prompt: prompt,
    ttapiJobId: ttapiJobId,
    timestamp: Date.now()
  });
  
  console.log(`📝 Registered request: ${requestId} (prompt: "${prompt.substring(0, 50)}...")`);
  
  res.json({ 
    success: true, 
    requestId,
    message: 'Request registered, waiting for Midjourney response...'
  });
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
      messageId: result.messageId,
      prompt: result.prompt
    });
  } else {
    const elapsed = Math.round((Date.now() - result.timestamp) / 1000);
    res.json({
      status: 'pending',
      message: `Waiting for Midjourney response... (${elapsed}s elapsed)`,
      elapsed: elapsed
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: client.isReady() ? 'connected' : 'disconnected',
    user: client.user?.tag || 'not connected',
    pendingRequests: pendingRequests.size,
    timestamp: Date.now()
  });
});

/**
 * Clean up old completed requests to prevent memory issues
 */
function cleanupOldRequests() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [requestId, request] of pendingRequests.entries()) {
    // Remove completed requests older than 1 hour
    if (request.status === 'completed' && 
        (request.completedAt || request.timestamp) < oneHourAgo) {
      pendingRequests.delete(requestId);
      cleaned++;
    }
    // Remove unmatched responses older than 30 minutes
    else if (request.unmatched && request.timestamp < Date.now() - (30 * 60 * 1000)) {
      pendingRequests.delete(requestId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old request(s)`);
  }
}

// Get all pending requests (for debugging)
app.get('/api/pending', (req, res) => {
  const pending = Array.from(pendingRequests.entries())
    .filter(([id, req]) => req.status === 'pending')
    .map(([id, req]) => ({
      requestId: id,
      status: req.status,
      prompt: req.prompt?.substring(0, 50),
      timestamp: req.timestamp,
      elapsed: Math.round((Date.now() - req.timestamp) / 1000)
    }));
  
  const completed = Array.from(pendingRequests.entries())
    .filter(([id, req]) => req.status === 'completed')
    .map(([id, req]) => ({
      requestId: id,
      status: req.status,
      prompt: req.prompt?.substring(0, 50),
      images: req.images?.length || 0,
      completedAt: req.completedAt || req.timestamp
    }));
  
  res.json({ 
    pending: pending.length,
    completed: completed.length,
    pendingList: pending,
    completedList: completed.slice(-10) // Last 10 completed
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gateway server running on port ${PORT}`);
  console.log(`📡 Waiting for Discord Gateway connection...`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

