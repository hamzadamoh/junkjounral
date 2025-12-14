/**
 * Vercel Serverless Function to upload a file to Google Drive
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { folderId, filename, base64Data, mimeType, clientId, clientSecret, refreshToken } = req.body;

    if (!folderId || !filename || !base64Data || !clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ 
        error: 'Missing required parameters: folderId, filename, base64Data, clientId, clientSecret, refreshToken' 
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

    // Convert base64 to binary
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Upload file to Google Drive using multipart upload
    // Create multipart boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Create metadata part
    const metadata = {
      name: filename,
      parents: [folderId],
    };
    
    // Build multipart body
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Type: application/json\r\n\r\n'),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from(`Content-Type: ${mimeType || 'image/jpeg'}\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipartBody.length.toString(),
      },
      body: multipartBody,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[Google Drive] Upload error:', errorText);
      return res.status(uploadResponse.status).json({ 
        error: 'Failed to upload file',
        details: errorText 
      });
    }

    const uploadData = await uploadResponse.json();

    // Get web view link by fetching file details
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=id,name,webViewLink,webContentLink`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!fileResponse.ok) {
      // If we can't get the link, still return success with file ID
      return res.status(200).json({
        fileId: uploadData.id,
        filename: uploadData.name,
        webViewLink: `https://drive.google.com/file/d/${uploadData.id}/view`,
      });
    }

    const fileData = await fileResponse.json();

    return res.status(200).json({
      fileId: fileData.id,
      filename: fileData.name,
      webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
      webContentLink: fileData.webContentLink,
    });
  } catch (error) {
    console.error('[Google Drive] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

