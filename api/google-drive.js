/**
 * Vercel Serverless Function - Consolidated Google Drive operations
 * Handles: create-folder, upload-file, list-folders, list-images, and upload-grids operations
 * This reduces multiple functions to 1 to stay within Vercel Hobby plan limit
 */
export default async function handler(req, res) {
  // Allow both POST and GET requests (GET for proxy-image)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { operation, folderName, folderId, filename, base64Data, mimeType, clientId, clientSecret, refreshToken, parentFolderId, gridPages } = req.body || {};
    const queryParams = req.query || {};
    
    // For proxy-image (GET request), credentials come from query params
    const isProxyImage = operation === 'proxy-image' || (!operation && req.method === 'GET' && queryParams.fileId);
    
    // Only validate credentials from body for non-proxy operations
    if (!isProxyImage && (!clientId || !clientSecret || !refreshToken)) {
      return res.status(400).json({ 
        error: 'Missing required parameters: clientId, clientSecret, refreshToken' 
      });
    }

    // Helper function to refresh access token
    const refreshAccessToken = async (useQueryParams = false) => {
      const credClientId = useQueryParams ? (queryParams.clientId || clientId) : clientId;
      const credClientSecret = useQueryParams ? (queryParams.clientSecret || clientSecret) : clientSecret;
      const credRefreshToken = useQueryParams ? (queryParams.refreshToken || refreshToken) : refreshToken;

      if (!credClientId || !credClientSecret || !credRefreshToken) {
        throw new Error('Missing credentials for token refresh');
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: credClientId,
          client_secret: credClientSecret,
          refresh_token: credRefreshToken,
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

      let accessToken;
      try {
        accessToken = await refreshAccessToken();
      } catch (tokenError) {
        console.error('[Google Drive] Token refresh failed:', tokenError);
        return res.status(500).json({ 
          error: tokenError.message || 'Failed to refresh access token',
          details: 'OAuth credentials are invalid. Please check:\n1. Client ID and Client Secret are correct\n2. Refresh token is valid (generate a new one if needed)\n3. OAuth consent screen is properly configured\n4. The refresh token was generated with the same Client ID'
        });
      }
      
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

      let accessToken;
      try {
        accessToken = await refreshAccessToken();
      } catch (tokenError) {
        console.error('[Google Drive] Token refresh failed:', tokenError);
        return res.status(500).json({ 
          error: tokenError.message || 'Failed to refresh access token',
          details: 'OAuth credentials are invalid. Please check:\n1. Client ID and Client Secret are correct\n2. Refresh token is valid (generate a new one if needed)\n3. OAuth consent screen is properly configured\n4. The refresh token was generated with the same Client ID'
        });
      }
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

    // Handle list-folders operation
    } else if (operation === 'list-folders' || (!operation && !folderName && !filename && !gridPages && parentFolderId !== undefined)) {
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

    // Handle list-images operation
    } else if (operation === 'list-images' || (!operation && folderId && !folderName && !filename && !gridPages)) {
      if (!folderId) {
        return res.status(400).json({ 
          error: 'Missing required parameter: folderId' 
        });
      }

      const accessToken = await refreshAccessToken();

      // List image files in the folder
      const imageMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
      ];
      const mimeTypeQuery = imageMimeTypes.map(mime => `mimeType='${mime}'`).join(' or ');

      const query = `'${folderId}' in parents and (${mimeTypeQuery}) and trashed=false`;

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,thumbnailLink)&orderBy=name`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: `Failed to list images: ${response.status} - ${errorText}` 
        });
      }

      const data = await response.json();
      
      // Return proxy URLs instead of direct Google Drive URLs to avoid CORS issues
      const images = (data.files || []).map((file) => {
        return {
          id: file.id,
          name: file.name,
          url: `/api/google-drive?operation=proxy-image&fileId=${file.id}&clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&refreshToken=${encodeURIComponent(refreshToken)}`,
          thumbnailUrl: file.thumbnailLink || `/api/google-drive?operation=proxy-image&fileId=${file.id}&clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&refreshToken=${encodeURIComponent(refreshToken)}`,
        };
      });

      return res.status(200).json({ images });

    // Handle proxy-image operation (must be checked early since it uses GET)
    } else if (isProxyImage) {
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
      }

      const fileId = queryParams.fileId;

      if (!fileId) {
        return res.status(400).json({ error: 'Missing fileId parameter' });
      }

      if (!queryParams.clientId || !queryParams.clientSecret || !queryParams.refreshToken) {
        return res.status(400).json({ 
          error: 'Missing required parameters: clientId, clientSecret, refreshToken' 
        });
      }

      const accessToken = await refreshAccessToken(true);

      // Fetch the image from Google Drive
      const imageResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ 
          error: `Failed to fetch image: ${imageResponse.statusText}` 
        });
      }

      // Get the image buffer
      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

      // Return the image with appropriate headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      return res.status(200).send(Buffer.from(imageBuffer));

    // Handle upload-grids operation
    } else if (operation === 'upload-grids' || (!operation && gridPages && Array.isArray(gridPages))) {
      if (!folderName || !gridPages || gridPages.length === 0) {
        return res.status(400).json({ 
          error: 'Missing required parameters: folderName and gridPages array' 
        });
      }

      const accessToken = await refreshAccessToken();

      // Create folder in root (not in parent folder)
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
      const targetFolderId = folderData.id;

      // Upload grid pages
      const uploadedFiles = [];
      let failed = 0;

      for (let i = 0; i < gridPages.length; i++) {
        try {
          const gridPage = gridPages[i];
          const fileName = `grid-page-${i + 1}.png`;
          
          const base64Content = gridPage.includes(',') ? gridPage.split(',')[1] : gridPage;
          const fileBuffer = Buffer.from(base64Content, 'base64');

          const boundary = '-------' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          
          const metadata = {
            name: fileName,
            parents: [targetFolderId],
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
        } catch (error) {
          console.error(`[Google Drive] Error uploading grid page ${i + 1}:`, error);
          failed++;
        }
      }

      const folderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;

      return res.status(200).json({
        success: true,
        folderId: targetFolderId,
        folderUrl,
        uploadedFiles,
        uploaded: uploadedFiles.length,
        failed,
      });

    } else {
      return res.status(400).json({ 
        error: 'Invalid operation. Use ?operation=create-folder, upload-file, list-folders, list-images, or upload-grids, or provide appropriate parameters.' 
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

