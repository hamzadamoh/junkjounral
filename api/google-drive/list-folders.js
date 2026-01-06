/**
 * Vercel Serverless Function - List Google Drive folders
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { clientId, clientSecret, refreshToken, parentFolderId, accountNumber = 1 } = req.body;

    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ 
        error: 'Missing Google Drive credentials' 
      });
    }

    // Helper function to refresh access token
    const refreshAccessToken = async () => {
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
        throw new Error(`Failed to get access token: ${tokenResponse.status} - ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    };

    const accessToken = await refreshAccessToken();

    // List folders in the parent folder (or root if not specified)
    const query = parentFolderId 
      ? `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,parents)&orderBy=name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `Failed to list folders: ${response.status} - ${errorText}` 
      });
    }

    const data = await response.json();
    return res.status(200).json({ folders: data.files || [] });
  } catch (error) {
    console.error('Error listing Google Drive folders:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to list folders' 
    });
  }
}

