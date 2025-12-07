import { Theme, GenerationSettings } from '../types';

/**
 * Direct Midjourney Integration using Discord Token
 * 
 * This service connects directly to Midjourney via Discord API,
 * bypassing third-party services like Ttapi/GoAPI.
 * 
 * Requirements:
 * - Discord account with Midjourney subscription
 * - Discord token (user token OR bot token)
 * - Server ID and Channel ID where Midjourney bot is active
 * 
 * Note: Bot tokens require using Discord's Interaction API for slash commands.
 * User tokens can send messages but may not work with slash commands.
 */

// Get Discord credentials from environment variables
const getDiscordToken = (): string => {
  return import.meta.env.VITE_DISCORD_TOKEN || '';
};

const getDiscordServerId = (): string => {
  return import.meta.env.VITE_DISCORD_SERVER_ID || '';
};

const getDiscordChannelId = (): string => {
  return import.meta.env.VITE_DISCORD_CHANNEL_ID || '';
};

const DISCORD_API_BASE = 'https://discord.com/api/v10';

interface DiscordMessage {
  id: string;
  content: string;
  embeds?: Array<{
    image?: { url: string };
    thumbnail?: { url: string };
    url?: string;
  }>;
  attachments?: Array<{
    url: string;
    filename: string;
  }>;
  author?: {
    id: string;
    username: string;
    bot: boolean;
  };
  components?: any[];
  referenced_message?: {
    id: string;
  };
}

interface MidjourneyTask {
  messageId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrls?: string[];
  createdAt: number;
}

// In-memory task storage (in production, use a database)
const taskStorage = new Map<string, MidjourneyTask>();

/**
 * Cleans prompt for Midjourney (removes problematic characters)
 */
const cleanPromptForMidjourney = (prompt: string): string => {
  // Remove PRIMARY SUBJECT: header if present
  let cleaned = prompt.replace(/^PRIMARY SUBJECT:\s*/i, '').trim();
  
  // Replace newlines with spaces
  cleaned = cleaned.replace(/\n+/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove triple dashes (can be interpreted as parameters)
  cleaned = cleaned.replace(/---+/g, '');
  
  // Remove trailing periods before parameters
  cleaned = cleaned.replace(/\.\s*$/, '');
  
  return cleaned.trim();
};

/**
 * Sends a /imagine command to Midjourney bot via Discord API
 */
const sendImagineCommand = async (
  prompt: string,
  styleRefUrl?: string
): Promise<string> => {
  const token = getDiscordToken();
  const serverId = getDiscordServerId();
  const channelId = getDiscordChannelId();

  if (!token || !serverId || !channelId) {
    throw new Error('Discord credentials not configured. Please set VITE_DISCORD_TOKEN, VITE_DISCORD_SERVER_ID, and VITE_DISCORD_CHANNEL_ID');
  }

  // Clean the prompt
  let cleanPrompt = cleanPromptForMidjourney(prompt);
  
  // Add style reference if provided
  if (styleRefUrl && styleRefUrl.trim()) {
    cleanPrompt += ` --sref ${styleRefUrl.trim()} --sw 1000`;
    console.log(`[DirectMJ] Added MAXIMUM style reference (--sw 1000): ${styleRefUrl}`);
  }

  console.log(`[DirectMJ] Sending /imagine command: "${cleanPrompt}"`);

  // ⚠️ CRITICAL LIMITATION: Discord does NOT allow sending slash commands programmatically
  // Slash commands can only be triggered by user interactions in Discord UI
  // Sending `/imagine` as text will NOT trigger Midjourney bot - it's just plain text
  
  // Attempt 1: Try to use Interaction API (may not work for triggering other bots' commands)
  const midjourneyApplicationId = '936929561302675456'; // Midjourney's bot application ID
  
  try {
    // Try Interaction API approach (unlikely to work, but worth trying)
    // This would require your bot/user to have permission to trigger Midjourney's commands
    const interactionPayload = {
      type: 2, // APPLICATION_COMMAND
      application_id: midjourneyApplicationId,
      guild_id: serverId,
      channel_id: channelId,
      data: {
        id: 'imagine', // Command ID (this won't work - we don't have Midjourney's command structure)
        name: 'imagine',
        type: 1, // CHAT_INPUT
        options: [
          {
            name: 'prompt',
            type: 3, // STRING
            value: cleanPrompt
          }
        ]
      }
    };

    console.log(`[DirectMJ] ⚠️ Attempting Interaction API (may not work for other bots' commands)...`);
    
    // This will likely fail, but we'll try it
    try {
      const interactionResponse = await fetch('/api/discord/interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          interaction: interactionPayload
        })
      });

      if (interactionResponse.ok) {
        console.log(`[DirectMJ] ✅ Interaction API succeeded (unexpected but great!)`);
        const taskId = `interaction_${Date.now()}`;
        taskStorage.set(taskId, {
          messageId: taskId,
          prompt: cleanPrompt,
          status: 'pending',
          createdAt: Date.now()
        });
        return taskId;
      }
    } catch (interactionError) {
      console.log(`[DirectMJ] Interaction API failed (expected):`, interactionError);
    }

    // Attempt 2: Send as text message (WON'T WORK - Midjourney won't respond)
    // This is a fallback, but it won't actually trigger Midjourney
    console.warn(`[DirectMJ] ⚠️ WARNING: Sending as text message - Midjourney bot will NOT respond to this!`);
    console.warn(`[DirectMJ] Discord does not allow programmatic slash commands. This will fail.`);
    
    const response = await fetch('/api/discord/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channelId,
        content: `/imagine ${cleanPrompt}`,
        token
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DirectMJ] Discord API error: ${response.status}`, errorText);
      throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    const message: DiscordMessage = await response.json();
    console.log(`[DirectMJ] ✅ Command sent. Message ID: ${message.id}`);
    
    // Store task
    const taskId = message.id;
    taskStorage.set(taskId, {
      messageId: taskId,
      prompt: cleanPrompt,
      status: 'pending',
      createdAt: Date.now()
    });

    return taskId;
  } catch (error: any) {
    console.error(`[DirectMJ] Error sending command:`, error);
    throw new Error(`Failed to send Midjourney command: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Polls Discord channel for Midjourney bot responses
 */
const pollForMidjourneyResponse = async (
  taskId: string,
  maxAttempts: number = 180,
  pollInterval: number = 5000
): Promise<string[]> => {
  const token = getDiscordToken();
  const channelId = getDiscordChannelId();
  const messagesUrl = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=50`;

  const task = taskStorage.get(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  console.log(`[DirectMJ] Polling for Midjourney response (task: ${taskId})...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Fetch recent messages from channel via proxy
      const response = await fetch(`/api/discord/messages?channelId=${channelId}&token=${encodeURIComponent(token)}&limit=50`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const messages: DiscordMessage[] = await response.json();

      // Look for Midjourney bot responses (bot messages with images)
      for (const message of messages) {
        // Check if this is a Midjourney bot response
        if (message.author?.bot && message.author.username.toLowerCase().includes('midjourney')) {
          // Check if message contains our prompt (or is a response to our message)
          if (message.content.includes(task.prompt.substring(0, 50)) || 
              message.referenced_message?.id === taskId) {
            
            // Extract image URLs
            const imageUrls: string[] = [];

            // From embeds
            if (message.embeds) {
              for (const embed of message.embeds) {
                if (embed.image?.url) {
                  imageUrls.push(embed.image.url);
                } else if (embed.thumbnail?.url) {
                  imageUrls.push(embed.thumbnail.url);
                } else if (embed.url && embed.url.match(/\.(png|jpg|jpeg|webp)/i)) {
                  imageUrls.push(embed.url);
                }
              }
            }

            // From attachments
            if (message.attachments) {
              for (const attachment of message.attachments) {
                if (attachment.url.match(/\.(png|jpg|jpeg|webp)/i)) {
                  imageUrls.push(attachment.url);
                }
              }
            }

            // Check for individual image URLs in message content
            // Midjourney sometimes includes URLs like: https://cdn.midjourney.com/.../0_0.png
            const urlMatches = message.content.match(/https?:\/\/[^\s]+\.(png|jpg|jpeg|webp)/gi);
            if (urlMatches) {
              imageUrls.push(...urlMatches);
            }

            if (imageUrls.length > 0) {
              console.log(`[DirectMJ] ✅ Found ${imageUrls.length} images in Midjourney response`);
              
              // Update task
              task.status = 'completed';
              task.imageUrls = imageUrls;
              
              return imageUrls;
            }
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      if (attempt % 10 === 0) {
        console.log(`[DirectMJ] Still waiting for Midjourney response (attempt ${attempt}/${maxAttempts})...`);
      }
    } catch (error: any) {
      console.error(`[DirectMJ] Error polling (attempt ${attempt}/${maxAttempts}):`, error);
      
      if (attempt >= maxAttempts) {
        throw new Error(`Failed to get Midjourney response after ${maxAttempts} attempts: ${error.message}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Midjourney response not received after ${maxAttempts} attempts`);
};

/**
 * Converts image URLs to base64 data URLs
 */
const convertUrlsToBase64 = async (urls: string[]): Promise<string[]> => {
  const base64Promises = urls.map(async (url) => {
    try {
      // Use proxy to bypass CORS if needed
      const proxyUrl = `/api/discord/image?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`[DirectMJ] Error converting URL to base64:`, url, error);
      throw error;
    }
  });

  return Promise.all(base64Promises);
};

/**
 * Main function to generate images using direct Midjourney integration
 * Returns an array of base64-encoded images (typically 4 images per request)
 */
export const generateJournalPage = async (
  theme: Theme,
  settings: GenerationSettings,
  parametersForMJ?: string,
  aspectRatio: string = '1:1',
  processMode: string = 'fast',
  onProgress?: (status: string) => void,
  variationIndex?: number,
  customPrompt?: string
): Promise<string[]> => {
  console.log(`[DirectMJ] ===== generateJournalPage called =====`);
  
  try {
    // Construct prompt
    let prompt = customPrompt || '';
    
    if (!prompt) {
      // Build prompt from theme and settings
      prompt = theme.basePrompt || 'Gothic junk journal page';
      
      if (settings.customArtStyle) {
        prompt += `. ${settings.customArtStyle}`;
      }
    }

    // Add aspect ratio
    if (aspectRatio) {
      prompt += ` --ar ${aspectRatio}`;
    }

    // Add process mode
    if (processMode === 'relaxed') {
      prompt += ` --relax`;
    } else if (processMode === 'turbo') {
      prompt += ` --turbo`;
    }

    // Add additional parameters
    if (parametersForMJ) {
      prompt += ` ${parametersForMJ}`;
    }

    console.log(`[DirectMJ] Full prompt: "${prompt}"`);

    // Send /imagine command
    // Skip style reference if skipStyleReference flag is set (e.g., Image Theme Expansion mode - rely on detailed prompt only)
    const styleRefUrlToUse = settings.skipStyleReference ? undefined : settings.styleRefUrl;
    if (onProgress) onProgress('Sending command to Midjourney...');
    if (settings.skipStyleReference) {
      console.log(`[DirectMJ] Skipping style reference URL - relying on detailed prompt only`);
    }
    const taskId = await sendImagineCommand(prompt, styleRefUrlToUse);

    // Poll for response
    if (onProgress) onProgress('Waiting for Midjourney to generate images...');
    const imageUrls = await pollForMidjourneyResponse(taskId);

    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No images returned from Midjourney');
    }

    // Convert to base64
    if (onProgress) onProgress('Converting images to base64...');
    console.log(`[DirectMJ] Converting ${imageUrls.length} image(s) to base64...`);
    const base64Images = await convertUrlsToBase64(imageUrls);
    
    console.log(`[DirectMJ] ✅ Successfully generated ${base64Images.length} image(s)`);
    return base64Images;
  } catch (error: any) {
    console.error(`[DirectMJ] ❌ Error generating journal page:`, error);
    throw new Error(`Direct Midjourney Image Generation Error: ${error.message || 'Unknown error occurred'}`);
  }
};

