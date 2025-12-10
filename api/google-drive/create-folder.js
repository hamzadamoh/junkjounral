/**
 * Google Drive Create Folder API
 * Creates a folder in Google Drive
 */

async function getAccessToken() {
  const oauthToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (oauthToken) {
    return oauthToken;
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (clientEmail && privateKey) {
    try {
      const { google } = await import('googleapis');
      const jwtClient = new google.auth.JWT(
        clientEmail,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/drive']
      );
      const tokens = await jwtClient.authorize();
      return tokens.access_token;
    } catch (error) {
      console.error('[Google Drive API] Service account auth failed:', error);
      return null;
    }
  }

  return null;
}

async function createFolder(folderName, accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
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

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create folder: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('[Google Drive API] Error creating folder:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderName } = req.body;

    if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Failed to get Google Drive access token. Please configure GOOGLE_DRIVE_ACCESS_TOKEN or service account credentials.' 
      });
    }

    const folderId = await createFolder(folderName.trim(), accessToken);
    if (!folderId) {
      return res.status(500).json({ error: 'Failed to create folder' });
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return res.status(200).json({
      success: true,
      folderId,
      folderUrl,
    });
  } catch (error) {
    console.error('[Google Drive API] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create folder',
      message: error.message 
    });
  }
}

