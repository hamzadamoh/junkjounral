/**
 * Cloudinary Service
 * Handles uploading images to Cloudinary with folder support
 */

export interface CloudinaryUploadResult {
  success: boolean;
  folderName?: string;
  folderUrl?: string;
  uploadedFiles?: Array<{
    id: string;
    name: string;
    url: string;
    secureUrl: string;
  }>;
  error?: string;
}

/**
 * Upload images to Cloudinary in a folder
 * Uploads images one at a time to avoid payload limits
 */
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
  return `img_${randomPart1}_${randomPart2}_${randomNumber}_${timestamp}`;
}

export async function uploadImagesToCloudinary(
  folderName: string,
  images: Array<{ id: string; url: string; prompt?: string }>,
  onProgress?: (uploaded: number, total: number) => void
): Promise<CloudinaryUploadResult> {
  try {
    console.log(`[Cloudinary] Starting parallel upload of ${images.length} images to folder: "${folderName}"`);

    // Shuffle images to mix them up (since Midjourney generates 4 images per prompt)
    const shuffledImages = shuffleArray(images);
    console.log(`[Cloudinary] Shuffled ${images.length} images to randomize order`);

    // Step 1: Convert all images to JPG in parallel
    console.log(`[Cloudinary] Converting ${shuffledImages.length} images to JPG format...`);
    const conversionPromises = shuffledImages.map((image, index) => 
      convertToJpg(image.url).then(jpgBase64 => ({
        image,
        jpgBase64,
        index,
      })).catch(error => {
        console.error(`[Cloudinary] Error converting image ${index + 1}:`, error);
        return null;
      })
    );

    const convertedImages = await Promise.all(conversionPromises);
    const validConvertedImages = convertedImages.filter((item): item is { image: { id: string; url: string; prompt?: string }; jpgBase64: string; index: number } => item !== null);
    
    console.log(`[Cloudinary] ✅ Converted ${validConvertedImages.length}/${shuffledImages.length} images to JPG`);

    if (validConvertedImages.length === 0) {
      throw new Error('Failed to convert any images to JPG');
    }

    // Step 2: Upload all images to Cloudinary in parallel
    console.log(`[Cloudinary] Uploading ${validConvertedImages.length} images in parallel...`);
    
    let completedCount = 0;
    const uploadPromises = validConvertedImages.map(({ image, jpgBase64, index }) => {
      const filename = generateRandomFilename();
      
      return fetch('/api/cloudinary/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder: folderName,
          filename: filename,
          base64: jpgBase64,
          format: 'jpg',
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

        console.log(`[Cloudinary] Uploaded ${completedCount}/${validConvertedImages.length}: ${filename}`);

        return {
          id: uploadData.public_id || uploadData.secure_url,
          name: filename,
          url: uploadData.url || uploadData.secure_url,
          secureUrl: uploadData.secure_url,
        };
      })
      .catch((error) => {
        console.error(`[Cloudinary] Error uploading image ${index + 1}:`, error);
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
      .filter((file): file is { id: string; name: string; url: string; secureUrl: string } => file !== null);

    if (uploadedFiles.length === 0) {
      throw new Error('Failed to upload any images');
    }

    console.log(`[Cloudinary] ✅ Successfully uploaded ${uploadedFiles.length}/${validConvertedImages.length} images`);

    // Generate folder URL (Cloudinary Media Library folder view)
    // Note: This links to the folder in Cloudinary's console (requires login)
    const sanitizedFolder = folderName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    // Cloudinary folder URL format: https://cloudinary.com/console/media_library/folders/[folder_path]
    const folderUrl = `https://cloudinary.com/console/media_library/folders/${encodeURIComponent(sanitizedFolder)}`;

    return {
      success: true,
      folderName,
      folderUrl,
      uploadedFiles,
    };
  } catch (error: any) {
    console.error('[Cloudinary] Upload error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

