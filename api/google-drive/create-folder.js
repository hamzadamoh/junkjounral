/**
 * Vercel Serverless Function to create a folder in Google Drive
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { folderName, clientId, clientSecret, refreshToken } = req.body;

    if (!folderName || !clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ 
        error: 'Missing required parameters: folderName, clientId, clientSecret, refreshToken' 
      });
    }

    // Get access token using refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Google Drive] Token refresh error:', errorText);
      return res.status(401).json({ 
        error: 'Failed to refresh access token',
        details: errorText 
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Create folder in Google Drive
    const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!folderResponse.ok) {
      const errorText = await folderResponse.text();
      console.error('[Google Drive] Folder creation error:', errorText);
      return res.status(folderResponse.status).json({ 
        error: 'Failed to create folder',
        details: errorText 
      });
    }

    const folderData = await folderResponse.json();

    return res.status(200).json({
      folderId: folderData.id,
      folderName: folderData.name,
    });
  } catch (error) {
    console.error('[Google Drive] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

