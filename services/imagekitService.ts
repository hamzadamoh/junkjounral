/**
 * ImageKit.io Storage Service
 * Uploads images to ImageKit with folder support
 * Free tier: 20GB storage, 20GB bandwidth/month
 */

import { getImageKitConfig } from './env';

export interface ImageKitUploadResult {
  success: boolean;
  folderUrl: string;
  uploadedFiles: Array<{
    filename: string;
    url: string;
    fileId: string;
    thumbnailUrl: string;
  }>;
  failed: number;
  error?: string;
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
 * Generate random filename
 */
function generateRandomFilename(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random1 = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const random2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const timestamp = Date.now().toString(36);
  return `img_${random1}_${random2}_${timestamp}`;
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
 * Upload a single image to ImageKit
 */
async function uploadToImageKit(
  publicKey: string,
  privateKey: string,
  urlEndpoint: string,
  folder: string,
  filename: string,
  base64Data: string
): Promise<{ url: string; fileId: string; thumbnailUrl: string }> {
  // ImageKit upload API endpoint
  const uploadUrl = 'https://upload.imagekit.io/api/v1/files/upload';
  
  // Remove data URL prefix if present
  const base64Only = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  
  // Create form data
  const formData = new FormData();
  formData.append('file', base64Only);
  formData.append('fileName', `${filename}.jpg`);
  formData.append('folder', `/${folder}`);
  formData.append('useUniqueFileName', 'false'); // We already have unique names
  
  // Create Basic Auth header (private_key:)
  const authString = btoa(`${privateKey}:`);
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ImageKit upload failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    url: data.url,
    fileId: data.fileId,
    thumbnailUrl: data.thumbnailUrl || data.url,
  };
}

/**
 * Upload multiple images to ImageKit with folder support
 * @param folderName Name of the folder to create
 * @param images Array of image URLs or base64 strings
 * @param onProgress Optional callback for progress updates
 * @returns Upload result with URLs
 */
export async function uploadImagesToImageKit(
  folderName: string,
  images: Array<{ url: string; originalUrl?: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<ImageKitUploadResult> {
  console.log(`[ImageKit] Starting upload of ${images.length} images to folder: "${folderName}"`);
  
  const config = getImageKitConfig();
  
  if (!config.publicKey || !config.privateKey || !config.urlEndpoint) {
    return {
      success: false,
      folderUrl: '',
      uploadedFiles: [],
      failed: images.length,
      error: 'ImageKit credentials not configured. Please set VITE_IMAGEKIT_PUBLIC_KEY, VITE_IMAGEKIT_PRIVATE_KEY, and VITE_IMAGEKIT_URL_ENDPOINT in your environment variables.',
    };
  }
  
  // Sanitize folder name
  const sanitizedFolder = folderName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Shuffle images to randomize order
  const shuffledImages = shuffleArray(images);
  console.log(`[ImageKit] Shuffled ${shuffledImages.length} images to randomize order`);
  
  // Convert all images to JPG
  console.log(`[ImageKit] Converting ${shuffledImages.length} images to JPG format...`);
  const convertedImages: string[] = [];
  for (const img of shuffledImages) {
    try {
      const sourceUrl = img.originalUrl || img.url;
      const jpgBase64 = await convertToJpg(sourceUrl);
      convertedImages.push(jpgBase64);
    } catch (error) {
      console.warn(`[ImageKit] Failed to convert image, using original:`, error);
      convertedImages.push(img.url);
    }
  }
  console.log(`[ImageKit] ✅ Converted ${convertedImages.length}/${shuffledImages.length} images to JPG`);
  
  // Upload images sequentially to avoid rate limits
  const uploadedFiles: Array<{ filename: string; url: string; fileId: string; thumbnailUrl: string }> = [];
  let failed = 0;
  
  console.log(`[ImageKit] Uploading ${convertedImages.length} images...`);
  
  for (let i = 0; i < convertedImages.length; i++) {
    const base64Image = convertedImages[i];
    const filename = generateRandomFilename();
    
    try {
      const result = await uploadToImageKit(
        config.publicKey,
        config.privateKey,
        config.urlEndpoint,
        sanitizedFolder,
        filename,
        base64Image
      );
      
      uploadedFiles.push({
        filename: `${filename}.jpg`,
        url: result.url,
        fileId: result.fileId,
        thumbnailUrl: result.thumbnailUrl,
      });
      
      console.log(`[ImageKit] ✅ Uploaded image ${i + 1}/${convertedImages.length}: ${result.url}`);
    } catch (error: any) {
      console.error(`[ImageKit] ❌ Error uploading image ${i + 1}:`, error);
      failed++;
    }
    
    if (onProgress) {
      onProgress(i + 1, convertedImages.length);
    }
    
    // Small delay between uploads to avoid rate limiting
    if (i < convertedImages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  if (uploadedFiles.length === 0) {
    return {
      success: false,
      folderUrl: '',
      uploadedFiles: [],
      failed,
      error: 'Failed to upload any images to ImageKit',
    };
  }
  
  // Generate folder URL (for browsing in ImageKit dashboard)
  const folderUrl = `${config.urlEndpoint}/${sanitizedFolder}/`;
  
  console.log(`[ImageKit] ✅ Upload complete: ${uploadedFiles.length} successful, ${failed} failed`);
  console.log(`[ImageKit] 📁 Folder URL: ${folderUrl}`);
  
  return {
    success: true,
    folderUrl,
    uploadedFiles,
    failed,
  };
}

