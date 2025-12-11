/**
 * Cloudflare R2 Service
 * Handles uploading images to Cloudflare R2 with folder support
 * R2 provides public URLs that don't require login
 */

export interface R2UploadResult {
  success: boolean;
  folderName?: string;
  folderUrl?: string;
  uploadedFiles?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  error?: string;
}

/**
 * Shuffle array using Fisher-Yates algorithm
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
 * Convert image to JPG format using canvas
 */
async function convertToJpg(imageUrl: string, quality: number = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0);
      
      // Convert to JPG
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to convert image to blob'));
            return;
          }
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

/**
 * Generate a random filename
 */
function generateRandomFilename(): string {
  const timestamp = Date.now();
  const randomPart1 = Math.random().toString(36).substring(2, 8);
  const randomPart2 = Math.random().toString(36).substring(2, 8);
  const randomNumber = Math.floor(Math.random() * 10000);
  return `img_${randomPart1}_${randomPart2}_${randomNumber}_${timestamp}.jpg`;
}

export async function uploadImagesToR2(
  folderName: string,
  images: Array<{ id: string; url: string; prompt?: string }>,
  onProgress?: (uploaded: number, total: number) => void
): Promise<R2UploadResult> {
  try {
    console.log(`[R2] Starting parallel upload of ${images.length} images to folder: "${folderName}"`);

    // Shuffle images to mix them up (since Midjourney generates 4 images per prompt)
    const shuffledImages = shuffleArray(images);
    console.log(`[R2] Shuffled ${images.length} images to randomize order`);

    // Step 1: Convert all images to JPG in parallel
    console.log(`[R2] Converting ${shuffledImages.length} images to JPG format...`);
    const conversionPromises = shuffledImages.map((image, index) => 
      convertToJpg(image.url).then(jpgBase64 => ({
        image,
        jpgBase64,
        index,
      })).catch(error => {
        console.error(`[R2] Error converting image ${index + 1}:`, error);
        return null;
      })
    );

    const convertedImages = await Promise.all(conversionPromises);
    const validConvertedImages = convertedImages.filter((item): item is { image: { id: string; url: string; prompt?: string }; jpgBase64: string; index: number } => item !== null);
    
    console.log(`[R2] ✅ Converted ${validConvertedImages.length}/${shuffledImages.length} images to JPG`);

    if (validConvertedImages.length === 0) {
      throw new Error('Failed to convert any images to JPG');
    }

    // Step 2: Upload all images to R2 in parallel
    console.log(`[R2] Uploading ${validConvertedImages.length} images in parallel...`);
    
    let completedCount = 0;
    const uploadPromises = validConvertedImages.map(({ image, jpgBase64, index }) => {
      const filename = generateRandomFilename();
      const filePath = `${folderName}/${filename}`;
      
      return fetch('/api/r2/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder: folderName,
          filename: filename,
          filePath: filePath,
          base64: jpgBase64,
        }),
      })
      .then(async (uploadResponse) => {
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to upload image: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        completedCount++;
        
        if (onProgress) {
          onProgress(completedCount, validConvertedImages.length);
        }

        console.log(`[R2] Uploaded ${completedCount}/${validConvertedImages.length}: ${filename}`);

        return {
          id: uploadData.key || uploadData.url,
          name: filename,
          url: uploadData.url,
        };
      })
      .catch((error) => {
        console.error(`[R2] Error uploading image ${index + 1}:`, error);
        return null;
      });
    });

    // Wait for all uploads to complete (successful or failed)
    const uploadResults = await Promise.allSettled(uploadPromises);
    const uploadedFiles = uploadResults
      .map((result) => {
        if (result.status === 'fulfilled' && result.value !== null) {
          return result.value;
        }
        return null;
      })
      .filter((file): file is { id: string; name: string; url: string } => file !== null);

    if (uploadedFiles.length === 0) {
      throw new Error('Failed to upload any images');
    }

    console.log(`[R2] ✅ Successfully uploaded ${uploadedFiles.length}/${validConvertedImages.length} images`);

    // Generate public folder URL
    // R2 public URL format: https://[account-id].r2.cloudflarestorage.com/[bucket]/[folder]/
    // Or custom domain: https://[custom-domain]/[folder]/
    const folderUrl = uploadedFiles[0]?.url 
      ? uploadedFiles[0].url.substring(0, uploadedFiles[0].url.lastIndexOf('/') + 1)
      : undefined;

    return {
      success: true,
      folderName,
      folderUrl,
      uploadedFiles,
    };
  } catch (error: any) {
    console.error('[R2] Upload error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

