/**
 * Google Drive Upload File API
 * Uploads a single file to Google Drive
 */

async function getAccessToken() {
  const oauthToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (oauthToken) {
    console.log('[Google Drive API] Using OAuth2 access token');
    return oauthToken;
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  
  if (clientEmail && privateKey) {
    try {
      // Handle both escaped and actual newlines
      let formattedPrivateKey = privateKey.trim();
      if (formattedPrivateKey.includes('\\n')) {
        formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');
      }
      
      // Ensure proper ending
      if (formattedPrivateKey.endsWith('-----END PRIVATE KEY-----')) {
        formattedPrivateKey += '\n';
      }
      
      const { google } = await import('googleapis');
      const jwtClient = new google.auth.JWT({
        email: clientEmail,
        key: formattedPrivateKey,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      const tokens = await jwtClient.authorize();
      return tokens.access_token;
    } catch (error) {
      console.error('[Google Drive API] Service account auth failed:', error);
      console.error('[Google Drive API] Error details:', error.message);
      return null;
    }
  }

  return null;
}

async function uploadFile(filename, base64Data, folderId, accessToken) {
  try {
    console.log(`[Google Drive API] Uploading file "${filename}" to folder ID: ${folderId}`);
    
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    const metadata = {
      name: filename,
      parents: [folderId],
    };
    
    console.log('[Google Drive API] File metadata:', JSON.stringify(metadata, null, 2));

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

    // Add supportsAllDrives parameter to work with shared drives and folders
    const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
    url.searchParams.set('uploadType', 'multipart');
    url.searchParams.set('supportsAllDrives', 'true');
    
    const response = await fetch(url.toString(), {
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
      
      // Check for specific error types
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.errors?.some(e => e.reason === 'storageQuotaExceeded')) {
          throw new Error('Google Drive storage quota exceeded. Please free up space in your Google Drive or upgrade your storage plan.');
        }
        if (errorJson.error?.errors?.some(e => e.reason === 'insufficientFilePermissions')) {
          throw new Error('Insufficient permissions. Make sure the service account has Editor access to the folder.');
        }
      } catch (parseError) {
        // If parsing fails, use the original error
      }
      
      throw new Error(`Failed to upload file: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('[Google Drive API] File uploaded successfully. File ID:', data.id);
    console.log('[Google Drive API] File parents:', data.parents || 'none');
    
    if (data.parents && data.parents.length > 0) {
      if (data.parents.includes(folderId)) {
        console.log('[Google Drive API] ✅ File uploaded to correct folder');
      } else {
        console.log('[Google Drive API] ⚠️ File parent does not match expected folder ID');
      }
    }
    
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
    
    // Check for storage quota error
    if (error.message && error.message.includes('storageQuotaExceeded')) {
      return res.status(403).json({ 
        error: 'Google Drive storage quota exceeded',
        message: 'Your Google Drive is out of storage space. Please free up space or upgrade your storage plan.',
        details: error.message
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to upload file',
      message: error.message 
    });
  }
}

