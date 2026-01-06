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

async function createFolder(accessToken: string, folderName: string, parentFolderId?: string): Promise<string> {
  const folderMetadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  // If parentFolderId is provided, add it; otherwise create in root
  if (parentFolderId) {
    folderMetadata.parents = [parentFolderId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(folderMetadata),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create folder: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.id;
}

async function uploadFile(
  accessToken: string,
  fileName: string,
  base64Data: string,
  mimeType: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  // Remove data URL prefix if present
  const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binaryData = Buffer.from(base64Content, 'base64');

  // Create file metadata
  const fileMetadata: any = {
    name: fileName,
  };

  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  // Create multipart request
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelimiter = '\r\n--' + boundary + '--';

  // Create multipart body
  const jsonPart = Buffer.from(JSON.stringify(fileMetadata), 'utf-8');
  const imagePart = binaryData;
  
  const delimiterBuffer = Buffer.from(delimiter, 'utf-8');
  const closeDelimiterBuffer = Buffer.from(closeDelimiter, 'utf-8');
  const jsonHeader = Buffer.from('Content-Type: application/json\r\n\r\n', 'utf-8');
  const imageHeader = Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`, 'utf-8');
  
  const multipartBody = Buffer.concat([
    delimiterBuffer,
    jsonHeader,
    jsonPart,
    delimiterBuffer,
    imageHeader,
    imagePart,
    closeDelimiterBuffer,
  ]);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Get web view link
  const permissionsResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${data.id}?fields=webViewLink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const fileData = await permissionsResponse.json();

  return {
    fileId: data.id,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { folderName, gridPages, clientId, clientSecret, refreshToken, accountNumber = 1 } = await request.json();

    if (!folderName || !gridPages || !Array.isArray(gridPages) || gridPages.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters: folderName and gridPages array' },
        { status: 400 }
      );
    }

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing Google Drive credentials' },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // Create folder in root (not in parent folder)
    // Pass null/undefined for parentFolderId to create in root
    const folderId = await createFolder(accessToken, folderName);
    console.log(`[Google Drive] Created folder: ${folderName} (${folderId})`);

    // Upload grid pages
    const uploadedFiles: Array<{ filename: string; url: string; id: string }> = [];
    let failed = 0;

    for (let i = 0; i < gridPages.length; i++) {
      try {
        const gridPage = gridPages[i];
        const fileName = `grid-page-${i + 1}.png`;
        
        // gridPage should already be a base64 data URL from the client
        // Remove data URL prefix to get just the base64 content
        const base64Content = gridPage.includes(',') ? gridPage.split(',')[1] : gridPage;

        const result = await uploadFile(accessToken, fileName, base64Data, 'image/png', folderId);
        
        uploadedFiles.push({
          filename: fileName,
          url: result.webViewLink,
          id: result.fileId,
        });

        console.log(`[Google Drive] Uploaded ${i + 1}/${gridPages.length}: ${fileName}`);
      } catch (error: any) {
        console.error(`[Google Drive] Failed to upload grid page ${i + 1}:`, error);
        failed++;
      }
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return NextResponse.json({
      success: true,
      folderId,
      folderUrl,
      uploadedFiles,
      uploaded: uploadedFiles.length,
      failed,
    });
  } catch (error: any) {
    console.error('Error uploading grids to Google Drive:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload grids to Google Drive', success: false },
      { status: 500 }
    );
  }
}

