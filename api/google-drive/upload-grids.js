/**
 * Vercel Serverless Function - Upload grid pages to Google Drive
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { folderName, gridPages, clientId, clientSecret, refreshToken, accountNumber = 1 } = req.body;

    if (!folderName || !gridPages || !Array.isArray(gridPages) || gridPages.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required parameters: folderName and gridPages array' 
      });
    }

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

    // Create folder in root (not in parent folder)
    // Pass null/undefined for parentFolderId to create in root
    const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        // No parents = root folder
      }),
    });

    if (!folderResponse.ok) {
      const errorText = await folderResponse.text();
      throw new Error(`Failed to create folder: ${folderResponse.status} - ${errorText}`);
    }

    const folderData = await folderResponse.json();
    const folderId = folderData.id;
    console.log(`[Google Drive] Created folder: ${folderName} (${folderId})`);

    // Upload grid pages
    const uploadedFiles = [];
    let failed = 0;

    for (let i = 0; i < gridPages.length; i++) {
      try {
        const gridPage = gridPages[i];
        const fileName = `grid-page-${i + 1}.png`;
        
        // Remove data URL prefix to get just the base64 content
        const base64Content = gridPage.includes(',') ? gridPage.split(',')[1] : gridPage;
        const fileBuffer = Buffer.from(base64Content, 'base64');

        const boundary = '-------' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        const metadata = {
          name: fileName,
          parents: [folderId],
        };
        
        const metadataJson = JSON.stringify(metadata);
        
        const parts = [
          `--${boundary}\r\n`,
          `Content-Type: application/json; charset=UTF-8\r\n`,
          `\r\n`,
          `${metadataJson}\r\n`,
          `--${boundary}\r\n`,
          `Content-Type: image/png\r\n`,
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
          console.error(`[Google Drive] Failed to upload grid page ${i + 1}:`, errorText);
          failed++;
          continue;
        }

        const uploadData = await uploadResponse.json();

        const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=id,name,webViewLink`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        const fileData = fileResponse.ok ? await fileResponse.json() : uploadData;
        
        uploadedFiles.push({
          filename: fileName,
          url: fileData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
          id: uploadData.id,
        });

        console.log(`[Google Drive] Uploaded ${i + 1}/${gridPages.length}: ${fileName}`);
      } catch (error) {
        console.error(`[Google Drive] Error uploading grid page ${i + 1}:`, error);
        failed++;
      }
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return res.status(200).json({
      success: true,
      folderId,
      folderUrl,
      uploadedFiles,
      uploaded: uploadedFiles.length,
      failed,
    });
  } catch (error) {
    console.error('Error uploading grids to Google Drive:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to upload grids to Google Drive',
      success: false 
    });
  }
}

