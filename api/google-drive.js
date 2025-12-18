/**
 * Vercel Serverless Function - Consolidated Google Drive operations
 * Handles: create-folder and upload-file operations
 * This reduces 2 functions to 1 to stay within Vercel Hobby plan limit
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { operation, folderName, folderId, filename, base64Data, mimeType, clientId, clientSecret, refreshToken, parentFolderId } = req.body;

    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ 
        error: 'Missing required parameters: clientId, clientSecret, refreshToken' 
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
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: 'unknown_error', error_description: errorText };
        }
        
        console.error('[Google Drive] Token refresh error:', errorData);
        
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
        
        throw new Error(errorMessage);
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    };

    // Handle create-folder operation
    if (operation === 'create-folder' || (!operation && folderName && !filename)) {
      if (!folderName) {
        return res.status(400).json({ 
          error: 'Missing required parameter: folderName' 
        });
      }

      const accessToken = await refreshAccessToken();
      const targetParentFolderId = parentFolderId || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU';

      const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [targetParentFolderId],
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

    // Handle upload-file operation
    } else if (operation === 'upload-file' || (!operation && filename && base64Data)) {
      if (!folderId || !filename || !base64Data) {
        return res.status(400).json({ 
          error: 'Missing required parameters: folderId, filename, base64Data' 
        });
      }

      const accessToken = await refreshAccessToken();
      const fileBuffer = Buffer.from(base64Data, 'base64');
      
      const boundary = '-------' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const metadata = {
        name: filename,
        parents: [folderId],
      };
      
      const metadataJson = JSON.stringify(metadata);
      
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

      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=id,name,webViewLink,webContentLink`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!fileResponse.ok) {
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

    } else {
      return res.status(400).json({ 
        error: 'Invalid operation. Use ?operation=create-folder or ?operation=upload-file, or provide appropriate parameters.' 
      });
    }

  } catch (error) {
    console.error('[Google Drive] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

