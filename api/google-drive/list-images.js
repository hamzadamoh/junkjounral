/**
 * Vercel Serverless Function - List images from Google Drive folder
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { folderId, clientId, clientSecret, refreshToken } = req.body;

    if (!folderId || !clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ 
        error: 'Missing required parameters' 
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

    // List image files in the folder (common image MIME types)
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
    
    // Get download URLs for each image
    const images = await Promise.all(
      (data.files || []).map(async (file) => {
        try {
          // For private files, we need to use the access token
          const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${accessToken}`;
          
          return {
            id: file.id,
            name: file.name,
            url: downloadUrl,
            thumbnailUrl: file.thumbnailLink || downloadUrl,
          };
        } catch (error) {
          console.error(`Error processing file ${file.id}:`, error);
          return null;
        }
      })
    );

    // Filter out null values
    const validImages = images.filter(img => img !== null);

    return res.status(200).json({ images: validImages });
  } catch (error) {
    console.error('Error listing Google Drive images:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to list images' 
    });
  }
}

