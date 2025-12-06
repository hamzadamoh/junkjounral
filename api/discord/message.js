/**
 * Vercel serverless function to proxy Discord API message sending
 * This bypasses CORS and keeps the Discord token secure on the server
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channelId, content, token } = req.body;

  if (!channelId || !content || !token) {
    return res.status(400).json({ error: 'Missing required parameters: channelId, content, token' });
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API error: ${response.status}`, errorText);
      return res.status(response.status).json({ 
        error: `Discord API error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error proxying Discord message:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

