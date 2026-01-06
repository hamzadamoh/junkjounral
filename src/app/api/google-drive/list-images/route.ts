import { NextRequest, NextResponse } from 'next/server';

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const { folderId, clientId, clientSecret, refreshToken } = await request.json();

    if (!folderId || !clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

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
      return NextResponse.json(
        { error: `Failed to list images: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Get download URLs for each image
    const images = await Promise.all(
      (data.files || []).map(async (file: any) => {
        try {
          // Get the file's download URL
          const fileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              redirect: 'manual',
            }
          );

          // For public files, we can use webViewLink or construct download URL
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
    const validImages = images.filter((img): img is NonNullable<typeof img> => img !== null);

    return NextResponse.json({ images: validImages });
  } catch (error: any) {
    console.error('Error listing Google Drive images:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list images' },
      { status: 500 }
    );
  }
}

