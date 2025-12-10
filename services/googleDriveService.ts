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
 */
export async function uploadImagesToGoogleDrive(
  folderName: string,
  images: Array<{ id: string; url: string; prompt?: string }>
): Promise<GoogleDriveUploadResult> {
  try {
    console.log(`[Google Drive] Starting upload of ${images.length} images to folder: "${folderName}"`);

    // Convert images to base64
    const imageData = await Promise.all(
      images.map(async (img) => {
        try {
          const base64 = await urlToBase64(img.url);
          const filename = `image_${img.id}.png`;
          return {
            id: img.id,
            filename,
            base64,
            prompt: img.prompt || ''
          };
        } catch (error: any) {
          console.error(`[Google Drive] Failed to convert image ${img.id} to base64:`, error);
          throw error;
        }
      })
    );

    // Call serverless function to upload to Google Drive
    const response = await fetch('/api/google-drive/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folderName,
        images: imageData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GoogleDriveUploadResult = await response.json();
    console.log(`[Google Drive] ✅ Upload completed:`, result);
    return result;
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

