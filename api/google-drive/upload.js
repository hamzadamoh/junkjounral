/**
 * Google Drive Upload API
 * Creates a folder and uploads images to Google Drive
 * 
 * Requires environment variables:
 * - GOOGLE_DRIVE_CLIENT_EMAIL: Service account email
 * - GOOGLE_DRIVE_PRIVATE_KEY: Service account private key (with \n replaced)
 * 
 * Or use OAuth2 token:
 * - GOOGLE_DRIVE_ACCESS_TOKEN: OAuth2 access token
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderName, images } = req.body;

    if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    console.log(`[Google Drive API] Creating folder "${folderName}" and uploading ${images.length} images...`);

    // Get access token (either from service account or OAuth token)
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Failed to get Google Drive access token. Please configure GOOGLE_DRIVE_ACCESS_TOKEN or service account credentials.' 
      });
    }

    // Create folder
    const folderId = await createFolder(folderName, accessToken);
    if (!folderId) {
      return res.status(500).json({ error: 'Failed to create folder' });
    }

    console.log(`[Google Drive API] ✅ Folder created: ${folderId}`);

    // Upload images
    const uploadedFiles = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        console.log(`[Google Drive API] Uploading image ${i + 1}/${images.length}: ${image.filename}`);
        
        const fileId = await uploadFile(
          image.filename,
          image.base64,
          folderId,
          accessToken
        );

        if (fileId) {
          const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
          uploadedFiles.push({
            id: image.id,
            name: image.filename,
            url: fileUrl,
          });
          console.log(`[Google Drive API] ✅ Uploaded: ${image.filename}`);
        }
      } catch (error) {
        console.error(`[Google Drive API] ❌ Failed to upload ${image.filename}:`, error);
        // Continue with other images
      }
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return res.status(200).json({
      success: true,
      folderId,
      folderUrl,
      uploadedFiles,
    });
  } catch (error) {
    console.error('[Google Drive API] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Failed to upload to Google Drive',
      message: error.message 
    });
  }
}

/**
 * Get Google Drive access token
 * Supports both OAuth2 token and service account
 */
async function getAccessToken() {
  // Option 1: Direct OAuth2 access token (simplest)
  const oauthToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (oauthToken) {
    console.log('[Google Drive API] Using OAuth2 access token');
    return oauthToken;
  }

  // Option 2: Service account (requires JWT)
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (clientEmail && privateKey) {
    console.log('[Google Drive API] Using service account');
    // For service account, we need to create a JWT and exchange it for an access token
    // This requires the 'googleapis' package
    try {
      // Dynamic import to avoid requiring the package if not needed
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

  console.error('[Google Drive API] No Google Drive credentials found');
  return null;
}

/**
 * Create a folder in Google Drive
 */
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

/**
 * Upload a file to Google Drive
 */
async function uploadFile(filename, base64Data, folderId, accessToken) {
  try {
    // Convert base64 to buffer
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    // Step 1: Create metadata first
    const metadata = {
      name: filename,
      parents: [folderId],
    };

    // Step 2: Upload file using multipart/related
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Build multipart body
    const metadataPart = JSON.stringify(metadata);
    const filePart = buffer;
    
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Type: application/json\r\n\r\n'),
      Buffer.from(metadataPart),
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from('Content-Type: image/png\r\n\r\n'),
      filePart,
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

