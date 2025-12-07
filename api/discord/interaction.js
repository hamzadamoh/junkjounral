/**
 * Vercel serverless function to proxy Discord Interaction API calls
 * This is used to send slash commands via Discord's Interaction API
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, interaction } = req.body;

  if (!token || !interaction) {
    return res.status(400).json({ error: 'Missing required parameters: token, interaction' });
  }

  try {
    // Discord Interaction API endpoint
    // Note: This is a simplified version - full implementation requires proper interaction handling
    const response = await fetch('https://discord.com/api/v10/interactions', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`, // Bot tokens use "Bot " prefix
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(interaction)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord Interaction API error: ${response.status}`, errorText);
      return res.status(response.status).json({ 
        error: `Discord Interaction API error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error proxying Discord interaction:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

