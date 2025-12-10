/**
 * Google Drive Upload File API
 * Uploads a single file to Google Drive
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

async function uploadFile(filename, base64Data, folderId, accessToken) {
  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    const metadata = {
      name: filename,
      parents: [folderId],
    };

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Type: application/json\r\n\r\n'),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from('Content-Type: image/png\r\n\r\n'),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipartBody.length.toString(),
      },
      body: multipartBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Drive API] Upload error response:', errorText);
      throw new Error(`Failed to upload file: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('[Google Drive API] Error uploading file:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderId, filename, base64, imageId } = req.body;

    if (!folderId || !filename || !base64) {
      return res.status(400).json({ error: 'folderId, filename, and base64 are required' });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Failed to get Google Drive access token. Please configure GOOGLE_DRIVE_ACCESS_TOKEN or service account credentials.' 
      });
    }

    const fileId = await uploadFile(filename, base64, folderId, accessToken);
    if (!fileId) {
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

    return res.status(200).json({
      success: true,
      fileId,
      fileUrl,
      imageId: imageId || null,
    });
  } catch (error) {
    console.error('[Google Drive API] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Failed to upload file',
      message: error.message 
    });
  }
}

