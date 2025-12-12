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
    let serviceAccountError: string | null = null;

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
          
          // Check if it's a service account limitation
          if (errorData.error === 'Service account storage limitation' || 
              errorData.message?.includes('Service Accounts do not have storage quota')) {
            console.error(`[Google Drive] ⚠️ Service account limitation: ${errorData.message}`);
            // Store this error to show user (only store once)
            if (!serviceAccountError) {
              serviceAccountError = errorData.message || 'Service accounts cannot use personal Drive storage. Please use an OAuth2 access token instead.';
            }
          }
          
          // Check if it's a storage quota error
          if (errorData.error === 'Google Drive storage quota exceeded' || 
              errorData.message?.includes('storage quota')) {
            console.error(`[Google Drive] ⚠️ Storage quota exceeded for image ${i + 1}`);
            // Continue with other images, but we'll report this in the final result
          }
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

    // Check if all uploads failed
    if (uploadedFiles.length === 0 && images.length > 0) {
      let errorMessage = 'All uploads failed. ';
      
      // Check if it's a service account limitation
      if (serviceAccountError) {
        errorMessage = 'Service accounts cannot use personal Google Drive storage. ';
        errorMessage += 'You must use an OAuth2 access token instead.\n\n';
        errorMessage += 'Instructions:\n';
        errorMessage += '1. Go to https://developers.google.com/oauthplayground\n';
        errorMessage += '2. In the left panel, find and select "Drive API v3"\n';
        errorMessage += '3. Click "Authorize APIs" and sign in with your Google account\n';
        errorMessage += '4. Click "Exchange authorization code for tokens"\n';
        errorMessage += '5. Copy the "Access token"\n';
        errorMessage += '6. Add it to Vercel as GOOGLE_DRIVE_ACCESS_TOKEN environment variable\n';
        errorMessage += '7. Redeploy your application';
      } else {
        errorMessage += 'This may be due to Google Drive storage quota being exceeded. Please free up space in your Google Drive or upgrade your storage plan.';
      }
      
      return {
        success: false,
        folderId,
        folderUrl,
        uploadedFiles: [],
        error: errorMessage,
      };
    }

    return {
      success: true,
      folderId,
      folderUrl,
      uploadedFiles,
      ...(uploadedFiles.length < images.length ? {
        warning: `Only ${uploadedFiles.length} of ${images.length} images were uploaded. Some uploads may have failed due to storage quota.`
      } : {})
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

