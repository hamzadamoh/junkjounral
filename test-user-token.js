/**
 * Test script to check if user token can access DMs
 * Run this to verify if Gateway server will work
 * 
 * Usage: node test-user-token.js
 */

const { Client, GatewayIntentBits } = require('discord.js');

// Get user token from environment variable
const USER_TOKEN = process.env.DISCORD_USER_TOKEN || process.env.VITE_DISCORD_TOKEN;

if (!USER_TOKEN) {
  console.error('❌ DISCORD_USER_TOKEN or VITE_DISCORD_TOKEN environment variable is required!');
  console.error('Set it in your .env file or export it:');
  console.error('  export DISCORD_USER_TOKEN="your_token_here"');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages  // Required to access DMs
  ]
});

console.log('🔑 Attempting to connect with user token...');
console.log('⚠️  WARNING: Using user tokens may violate Discord ToS. Use at your own risk.');

client.on('ready', async () => {
  console.log('✅ Connected successfully!');
  console.log('User:', client.user.tag);
  console.log('User ID:', client.user.id);
  
  // Try to list DM channels
  console.log('\n📬 Checking DM channels...');
  try {
    const dmChannels = client.channels.cache.filter(channel => channel.type === 'DM');
    console.log(`Found ${dmChannels.size} DM channel(s) in cache`);
    
    if (dmChannels.size > 0) {
      console.log('\nDM Channels:');
      dmChannels.forEach((channel, channelId) => {
        const recipient = channel.recipient;
        console.log(`  - ${channelId}: ${recipient?.tag || 'Unknown'} (${recipient?.id || 'N/A'})`);
      });
    } else {
      console.log('⚠️  No DM channels found in cache. This might be normal if you have no recent DMs.');
      console.log('   The Gateway will still work - it listens for NEW messages.');
    }
    
    // Check if we can see Midjourney bot
    const midjourneyBotId = '936929561302675456';
    const midjourneyChannel = dmChannels.find(ch => ch.recipient?.id === midjourneyBotId);
    
    if (midjourneyChannel) {
      console.log(`\n✅ Found DM channel with Midjourney bot!`);
      console.log(`   Channel ID: ${midjourneyChannel.id}`);
      console.log(`   This means the Gateway server SHOULD work.`);
    } else {
      console.log(`\n⚠️  No DM channel found with Midjourney bot (ID: ${midjourneyBotId})`);
      console.log(`   This is OK - the Gateway will create the channel when Midjourney responds.`);
    }
    
  } catch (error) {
    console.error('❌ Error accessing DM channels:', error);
    console.error('   This might mean user tokens cannot access DMs via Discord.js');
  }
  
  console.log('\n✅ Test complete! Gateway server should work if you saw "Connected successfully!"');
  console.log('   If you saw errors accessing DMs, the Gateway might not work.');
  
  // Keep connection alive for a bit to test message reception
  console.log('\n⏳ Listening for messages for 30 seconds...');
  console.log('   Send a test message to Midjourney bot via Ttapi to see if it appears here.');
  
  setTimeout(() => {
    console.log('\n⏹️  Test complete. Disconnecting...');
    client.destroy();
    process.exit(0);
  }, 30000);
});

client.on('messageCreate', async (message) => {
  // Only process DMs
  if (message.channel.type !== 'DM') {
    return;
  }
  
  console.log(`\n📨 DM received!`);
  console.log(`   From: ${message.author.tag} (${message.author.id})`);
  console.log(`   Channel: ${message.channel.id}`);
  console.log(`   Content: ${message.content.substring(0, 100)}...`);
  
  // Check if from Midjourney bot
  const MIDJOURNEY_BOT_ID = '936929561302675456';
  if (message.author.id === MIDJOURNEY_BOT_ID) {
    console.log(`   ✅ This is from Midjourney bot!`);
    
    // Try to extract images
    const images = [];
    
    // From embeds
    if (message.embeds && message.embeds.length > 0) {
      message.embeds.forEach((embed, index) => {
        if (embed.image?.url) {
          images.push(embed.image.url);
          console.log(`   📷 Image ${index + 1} from embed: ${embed.image.url.substring(0, 80)}...`);
        }
      });
    }
    
    // From attachments
    if (message.attachments && message.attachments.size > 0) {
      message.attachments.forEach((attachment) => {
        if (attachment.url) {
          images.push(attachment.url);
          console.log(`   📎 Attachment: ${attachment.url.substring(0, 80)}...`);
        }
      });
    }
    
    if (images.length > 0) {
      console.log(`   ✅ Found ${images.length} image(s)! Gateway extraction should work.`);
    } else {
      console.log(`   ⚠️  No images found in this message.`);
    }
  }
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

client.on('warn', (warning) => {
  console.warn('⚠️  Discord client warning:', warning);
});

// Try to login
try {
  client.login(USER_TOKEN);
} catch (error) {
  console.error('❌ Failed to login with user token:', error);
  console.error('   This might mean:');
  console.error('   1. User token is invalid');
  console.error('   2. Discord.js doesn\'t support user tokens');
  console.error('   3. Discord API blocked the connection');
  process.exit(1);
}

