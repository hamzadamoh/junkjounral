/**
 * Vercel Serverless Function - Upload a single grid image to Dropbox
 * Expects: { folderPath, fileName, base64Image }
 */

import { Buffer } from 'buffer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderPath, fileName, base64Image } = req.body || {};

    if (!folderPath || !fileName || !base64Image) {
      return res.status(400).json({ error: 'Missing folderPath, fileName, or base64Image' });
    }

    const accessToken =
      process.env.DROPBOX_ACCESS_TOKEN ||
      process.env.VITE_DROPBOX_ACCESS_TOKEN ||
      process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(500).json({ error: 'Dropbox access token not configured' });
    }

    // Ensure folderPath starts with /
    const normalizedFolderPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
    const dropboxPath = `${normalizedFolderPath}/${fileName}`;

    // Decode base64
    const base64Content = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    const fileBuffer = Buffer.from(base64Content, 'base64');

    // Create folder (ignore "already exists" errors)
    await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: normalizedFolderPath,
        autorename: false,
      }),
    }).catch(() => {});

    // Upload file
    const uploadResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: dropboxPath,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Dropbox upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadData = await uploadResponse.json();

    // Get a temporary link for the uploaded file
    let temporaryLink = null;
    try {
      const linkResponse = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: uploadData.path_lower }),
      });
      if (linkResponse.ok) {
        const linkData = await linkResponse.json();
        temporaryLink = linkData.link || null;
      }
    } catch (e) {
      // ignore link errors; upload succeeded
    }

    return res.status(200).json({
      success: true,
      fileId: uploadData.id,
      fileName: uploadData.name,
      path: uploadData.path_display,
      temporaryLink,
    });
  } catch (error) {
    console.error('[Dropbox] Error uploading grid:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload grid to Dropbox' });
  }
}

