// Import WordPress config from env module
import { getWordPressConfig } from './env';

const getWordPressUsername = (): string => {
  return getWordPressConfig().username;
};

const getWordPressAppPassword = (): string => {
  return getWordPressConfig().password;
};

const WORDPRESS_MEDIA_ENDPOINT = 'https://gold-stingray-884517.hostingersite.com/wp-json/wp/v2/media';

export interface WordPressUploadResult {
  folderUrl: string;
  uploadedImages: Array<{
    filename: string;
    url: string;
    id: number;
  }>;
  failed: number;
}

interface WordPressMediaResponse {
  id: number;
  source_url: string;
  [key: string]: any;
}

/**
 * Uploads an image to WordPress and returns the public URL
 * Uses server-side API route to avoid CORS issues
 * Includes retry logic for database connection errors
 * @param base64Image Base64 encoded image (with or without data URL prefix)
 * @param retries Number of retry attempts (default: 2)
 * @returns The public URL of the uploaded image
 */
export const uploadImageToWordPress = async (base64Image: string, retries: number = 3): Promise<string> => {
  const maxRetries = retries;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      // Use server-side API route to avoid CORS issues
      const response = await fetch('/api/wordpress/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Image,
          filename: `style-ref-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Check if it's a retryable error (database connection issues, rate limiting, or 403)
        const isRetryable = errorData.retryable || 
                           response.status === 403 || 
                           response.status === 429 || 
                           response.status === 503 ||
                           (errorData.error && (
                             errorData.error.includes('database') || 
                             errorData.error.includes('rate limit') ||
                             errorData.error.includes('403')
                           ));
        
        if (isRetryable && attempt < maxRetries) {
          attempt++;
          // Exponential backoff: 1s, 2s, 4s, max 8s
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          console.log(`[WordPress] Retryable error (${response.status}), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        console.error('[WordPress] Upload error response:', errorData);
        throw new Error(errorData.error || `WordPress upload failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.url) {
        throw new Error('API response missing URL');
      }

      console.log(`[WordPress] ✅ Image uploaded successfully: ${data.url}`);
      return data.url;
    } catch (error: any) {
      // If it's the last attempt, throw the error
      if (attempt >= maxRetries) {
        console.error('[WordPress] Upload error (max retries reached):', error);
        throw new Error(`Failed to upload image to WordPress: ${error.message || 'Unknown error'}`);
      }
      
      // Check if error message suggests retryable issue
      const isRetryableError = error.message && (
        error.message.includes('database') || 
        error.message.includes('503') ||
        error.message.includes('403') ||
        error.message.includes('429') ||
        error.message.includes('rate limit') ||
        error.message.includes('timeout')
      );
      
      if (isRetryableError) {
        attempt++;
        // Exponential backoff: 1s, 2s, 4s, max 8s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`[WordPress] Retryable error detected, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retryable error, throw immediately
      console.error('[WordPress] Upload error:', error);
      throw new Error(`Failed to upload image to WordPress: ${error.message || 'Unknown error'}`);
    }
  }
  
  throw new Error('Failed to upload image to WordPress: Max retries exceeded');
};

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
 * Generate random filename for WordPress uploads
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
 * Upload multiple images to WordPress with shuffling and random naming
 * @param images Array of image URLs or base64 strings
 * @param onProgress Optional callback for progress updates
 * @returns Upload result with URLs
 */
export async function uploadImagesToWordPress(
  images: Array<{ url: string; originalUrl?: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<WordPressUploadResult> {
  console.log(`[WordPress] Starting upload of ${images.length} images`);
  
  const username = getWordPressUsername();
  const appPassword = getWordPressAppPassword();
  
  if (!username || !appPassword) {
    throw new Error('WordPress credentials are not configured. Please set VITE_WP_USERNAME and VITE_WP_APP_PASSWORD in your environment variables.');
  }
  
  // Shuffle images to randomize order
  const shuffledImages = shuffleArray(images);
  console.log(`[WordPress] Shuffled ${shuffledImages.length} images to randomize order`);
  
  // Convert all images to JPG
  console.log(`[WordPress] Converting ${shuffledImages.length} images to JPG format...`);
  const convertedImages: string[] = [];
  for (const img of shuffledImages) {
    try {
      const sourceUrl = img.originalUrl || img.url;
      const jpgBase64 = await convertToJpg(sourceUrl);
      convertedImages.push(jpgBase64);
    } catch (error) {
      console.warn(`[WordPress] Failed to convert image, using original:`, error);
      convertedImages.push(img.url);
    }
  }
  console.log(`[WordPress] ✅ Converted ${convertedImages.length}/${shuffledImages.length} images to JPG`);
  
  // Upload images sequentially (WordPress may have rate limits)
  const uploadedImages: Array<{ filename: string; url: string; id: number }> = [];
  let failed = 0;
  
  console.log(`[WordPress] Uploading ${convertedImages.length} images...`);
  
  for (let i = 0; i < convertedImages.length; i++) {
    const base64Image = convertedImages[i];
    const filename = generateRandomFilename();
    
    try {
      // Remove data URL prefix if present
      const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
      
      // Convert base64 to binary Blob
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      
      // Create FormData
      const formData = new FormData();
      formData.append('file', blob, filename);
      
      // Create Basic Auth header
      const authString = btoa(`${username}:${appPassword}`);
      
      // Upload to WordPress
      const response = await fetch(WORDPRESS_MEDIA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[WordPress] Upload error for image ${i + 1}:`, errorText);
        failed++;
        continue;
      }
      
      const data: WordPressMediaResponse = await response.json();
      
      if (data.source_url) {
        uploadedImages.push({
          filename,
          url: data.source_url,
          id: data.id
        });
        console.log(`[WordPress] ✅ Uploaded image ${i + 1}/${convertedImages.length}: ${data.source_url}`);
      } else {
        failed++;
      }
      
      // Progress callback
      if (onProgress) {
        onProgress(i + 1, convertedImages.length);
      }
      
      // Small delay between uploads to avoid rate limiting
      if (i < convertedImages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`[WordPress] Error uploading image ${i + 1}:`, error);
      failed++;
    }
  }
  
  if (uploadedImages.length === 0) {
    throw new Error('Failed to upload any images to WordPress');
  }
  
  console.log(`[WordPress] ✅ Upload complete: ${uploadedImages.length} successful, ${failed} failed`);
  
  // WordPress doesn't have folders, so we'll use the site URL as the "folder"
  const siteUrl = WORDPRESS_MEDIA_ENDPOINT.replace('/wp-json/wp/v2/media', '');
  
  return {
    folderUrl: `${siteUrl}/wp-admin/upload.php`, // Link to media library
    uploadedImages,
    failed
  };
}

