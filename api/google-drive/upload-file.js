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
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: 'unknown_error', error_description: errorText };
      }
      
      console.error('[Google Drive] Token refresh error:', errorData);
      
      // Provide helpful error messages
      let errorMessage = 'Failed to refresh access token';
      if (errorData.error === 'unauthorized_client') {
        errorMessage = 'OAuth credentials are invalid. Please check:\n' +
          '1. Client ID and Client Secret are correct\n' +
          '2. Refresh token is valid (generate a new one if needed)\n' +
          '3. OAuth consent screen is properly configured\n' +
          '4. The refresh token was generated with the same Client ID';
      } else if (errorData.error === 'invalid_grant') {
        errorMessage = 'Refresh token is invalid or expired. Please generate a new refresh token.';
      } else if (errorData.error_description) {
        errorMessage = errorData.error_description;
      }
      
      return res.status(401).json({ 
        error: errorMessage,
        errorCode: errorData.error,
        details: errorText 
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Convert base64 to binary
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Upload file to Google Drive using multipart upload
    // According to Google Drive API docs, multipart format should be:
    // --boundary
    // Content-Type: application/json
    // 
    // {metadata}
    // --boundary
    // Content-Type: {mimeType}
    // 
    // {file data}
    // --boundary--
    
    const boundary = '-------' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Create metadata part
    const metadata = {
      name: filename,
      parents: [folderId],
    };
    
    const metadataJson = JSON.stringify(metadata);
    
    // Build multipart body according to Google's specification
    const parts = [
      `--${boundary}\r\n`,
      `Content-Type: application/json; charset=UTF-8\r\n`,
      `\r\n`,
      `${metadataJson}\r\n`,
      `--${boundary}\r\n`,
      `Content-Type: ${mimeType || 'image/jpeg'}\r\n`,
      `\r\n`,
    ];
    
    const multipartBody = Buffer.concat([
      Buffer.from(parts.join(''), 'utf8'),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--`, 'utf8'),
    ]);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
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

