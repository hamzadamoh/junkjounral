/**
 * Google Drive Service
 * Handles uploading images to Google Drive
 */

export interface GoogleDriveUploadResult {
  success: boolean;
  folderId?: string;
  folderUrl?: string;
  uploadedFiles?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  error?: string;
}

/**
 * Upload images to Google Drive in a new folder
 * Uploads images one at a time to avoid 413 errors
 */
export async function uploadImagesToGoogleDrive(
  folderName: string,
  images: Array<{ id: string; url: string; prompt?: string }>,
  onProgress?: (uploaded: number, total: number) => void
): Promise<GoogleDriveUploadResult> {
  try {
    console.log(`[Google Drive] Starting upload of ${images.length} images to folder: "${folderName}"`);

    // Step 1: Create folder
    const createFolderResponse = await fetch('/api/google-drive/create-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ folderName }),
    });

    if (!createFolderResponse.ok) {
      const errorData = await createFolderResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to create folder: ${createFolderResponse.statusText}`);
    }

    const folderData = await createFolderResponse.json();
    const folderId = folderData.folderId;
    const folderUrl = folderData.folderUrl;

    if (!folderId) {
      throw new Error('Failed to create folder: No folder ID returned');
    }

    console.log(`[Google Drive] ✅ Folder created: ${folderId}`);

    // Step 2: Upload images one at a time
    const uploadedFiles: Array<{ id: string; name: string; url: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        console.log(`[Google Drive] Uploading image ${i + 1}/${images.length}: ${img.id}`);
        
        // Convert to base64
        const base64 = await urlToBase64(img.url);
        const filename = `image_${img.id}.png`;

        // Upload single image
        const uploadResponse = await fetch('/api/google-drive/upload-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderId,
            filename,
            base64,
            imageId: img.id,
          }),
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error(`[Google Drive] Failed to upload image ${i + 1}:`, errorData);
          // Continue with other images
          continue;
        }

        const fileData = await uploadResponse.json();
        if (fileData.fileId && fileData.fileUrl) {
          uploadedFiles.push({
            id: img.id,
            name: filename,
            url: fileData.fileUrl,
          });
          console.log(`[Google Drive] ✅ Image ${i + 1} uploaded: ${fileData.fileUrl}`);
        }

        // Report progress
        if (onProgress) {
          onProgress(i + 1, images.length);
        }
      } catch (error: any) {
        console.error(`[Google Drive] Error uploading image ${i + 1}:`, error);
        // Continue with other images
      }
    }

    return {
      success: true,
      folderId,
      folderUrl,
      uploadedFiles,
    };
  } catch (error: any) {
    console.error('[Google Drive] ❌ Upload failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload images to Google Drive',
    };
  }
}

/**
 * Convert image URL to base64
 */
async function urlToBase64(url: string): Promise<string> {
  // If it's already a data URL, return it
  if (url.startsWith('data:')) {
    return url;
  }

  // Fetch the image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

