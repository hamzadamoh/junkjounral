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
    const { clientId, clientSecret, refreshToken, parentFolderId, accountNumber = 1 } = await request.json();

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing Google Drive credentials' },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

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
      return NextResponse.json(
        { error: `Failed to list folders: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ folders: data.files || [] });
  } catch (error: any) {
    console.error('Error listing Google Drive folders:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list folders' },
      { status: 500 }
    );
  }
}

