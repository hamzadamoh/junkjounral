/**
 * Google Drive Storage Service
 * Uploads images to Google Drive with folder support
 */

import { getGoogleDriveConfig } from './env';

export interface GoogleDriveUploadResult {
  folderId: string;
  folderUrl: string;
  uploadedFiles: Array<{
    filename: string;
    url: string;
    id: string;
  }>;
  failed: number;
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate random filename for Google Drive uploads
 */
function generateRandomFilename(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random1 = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const random2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const timestamp = Date.now().toString(36);
  return `img_${random1}_${random2}_${timestamp}.jpg`;
}

/**
 * Convert image URL or base64 to JPG base64
 */
async function convertToJpg(imageUrl: string, quality: number = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // White background for JPG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // Convert to JPG base64
      const jpgBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(jpgBase64);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

/**
 * Upload multiple images to Google Drive with folder support
 * @param folderName Name of the folder to create/use
 * @param images Array of image URLs or base64 strings
 * @param onProgress Optional callback for progress updates
 * @returns Upload result with folder URL and image URLs
 */
export async function uploadImagesToGoogleDrive(
  folderName: string,
  images: Array<{ url: string; originalUrl?: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<GoogleDriveUploadResult> {
  console.log(`[Google Drive] Starting upload of ${images.length} images to folder: "${folderName}"`);
  
  const config = getGoogleDriveConfig();
  
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw {
      error: 'Google Drive credentials not configured. Please set VITE_GOOGLE_DRIVE_CLIENT_ID, VITE_GOOGLE_DRIVE_CLIENT_SECRET, and VITE_GOOGLE_DRIVE_REFRESH_TOKEN in your environment variables.',
    };
  }
  
  // Shuffle images to randomize order
  const shuffledImages = shuffleArray(images);
  console.log(`[Google Drive] Shuffled ${shuffledImages.length} images to randomize order`);
  
  // Convert all images to JPG
  console.log(`[Google Drive] Converting ${shuffledImages.length} images to JPG format...`);
  const convertedImages: string[] = [];
  for (const img of shuffledImages) {
    try {
      const sourceUrl = img.originalUrl || img.url;
      const jpgBase64 = await convertToJpg(sourceUrl);
      convertedImages.push(jpgBase64);
    } catch (error) {
      console.warn(`[Google Drive] Failed to convert image, using original:`, error);
      // If conversion fails, try to use the base64 data directly if available
      if (img.url.startsWith('data:image')) {
        convertedImages.push(img.url);
      } else {
        console.warn(`[Google Drive] Skipping image (CORS blocked or invalid):`, error);
      }
    }
  }
  console.log(`[Google Drive] ✅ Converted ${convertedImages.length}/${shuffledImages.length} images to JPG`);
  
  // Create folder first
  console.log(`[Google Drive] Creating folder: "${folderName}"...`);
  let folderId: string;
  try {
    const folderResponse = await fetch('/api/google-drive/create-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folderName,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
      }),
    });
    
    if (!folderResponse.ok) {
      const errorText = await folderResponse.text();
      throw new Error(`Failed to create folder: ${folderResponse.status} - ${errorText}`);
    }
    
    const folderData = await folderResponse.json();
    folderId = folderData.folderId;
    console.log(`[Google Drive] ✅ Folder created: ${folderId}`);
  } catch (error: any) {
    console.error(`[Google Drive] ❌ Failed to create folder:`, error);
    throw new Error(`Failed to create Google Drive folder: ${error.message || 'Unknown error'}`);
  }
  
  // Upload images in parallel (with some concurrency limit)
  const uploadedFiles: Array<{ filename: string; url: string; id: string }> = [];
  let failed = 0;
  const maxConcurrent = 5; // Upload 5 images at a time
  
  console.log(`[Google Drive] Uploading ${convertedImages.length} images...`);
  
  for (let i = 0; i < convertedImages.length; i += maxConcurrent) {
    const batch = convertedImages.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (base64Image, batchIndex) => {
      const globalIndex = i + batchIndex;
      const filename = generateRandomFilename();
      
      try {
        // Remove data URL prefix if present
        const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
        
        const uploadResponse = await fetch('/api/google-drive/upload-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderId,
            filename,
            base64Data,
            mimeType: 'image/jpeg',
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            refreshToken: config.refreshToken,
          }),
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`[Google Drive] Upload error for image ${globalIndex + 1}:`, errorText);
          failed++;
          return null;
        }
        
        const uploadData = await uploadResponse.json();
        
        if (uploadData.fileId && uploadData.webViewLink) {
          uploadedFiles.push({
            filename,
            url: uploadData.webViewLink,
            id: uploadData.fileId,
          });
          console.log(`[Google Drive] ✅ Uploaded image ${globalIndex + 1}/${convertedImages.length}: ${uploadData.webViewLink}`);
          
          // Progress callback
          if (onProgress) {
            onProgress(uploadedFiles.length, convertedImages.length);
          }
          
          return uploadData;
        } else {
          failed++;
          return null;
        }
      } catch (error) {
        console.error(`[Google Drive] Error uploading image ${globalIndex + 1}:`, error);
        failed++;
        return null;
      }
    });
    
    await Promise.allSettled(batchPromises);
    
    // Small delay between batches to avoid rate limiting
    if (i + maxConcurrent < convertedImages.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  if (uploadedFiles.length === 0) {
    throw new Error('Failed to upload any images to Google Drive');
  }
  
  // Generate folder URL
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  
  console.log(`[Google Drive] ✅ Upload complete: ${uploadedFiles.length} successful, ${failed} failed`);
  console.log(`[Google Drive] 📁 Folder URL: ${folderUrl}`);
  
  return {
    folderId,
    folderUrl,
    uploadedFiles,
    failed,
  };
}

