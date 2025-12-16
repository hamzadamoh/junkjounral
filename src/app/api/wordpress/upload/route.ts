import { NextRequest, NextResponse } from 'next/server';

interface WordPressUploadResponse {
  id: number;
  source_url: string;
  link: string;
}

/**
 * Upload an image to WordPress via REST API
 */
async function uploadToWordPress(imageUrl: string, filename: string): Promise<WordPressUploadResponse | null> {
  // Support both naming conventions
  const wpUrl = process.env.WORDPRESS_URL || process.env.VITE_WP_URL;
  const wpUsername = process.env.WORDPRESS_USERNAME || process.env.VITE_WP_USERNAME;
  const wpPassword = process.env.WORDPRESS_APPLICATION_PASSWORD || process.env.VITE_WP_APP_PASSWORD;

  if (!wpUrl || !wpUsername || !wpPassword) {
    throw new Error('WordPress credentials not configured. Please set WORDPRESS_URL (or VITE_WP_URL), WORDPRESS_USERNAME (or VITE_WP_USERNAME), and WORDPRESS_APPLICATION_PASSWORD (or VITE_WP_APP_PASSWORD) environment variables.');
  }

  try {
    // Download the image from the source URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBlob = new Blob([imageBuffer], { 
      type: imageResponse.headers.get('content-type') || 'image/png' 
    });

    // Upload to WordPress Media Library using REST API
    const uploadUrl = `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/media`;
    
    // Use native FormData (available in Node.js 18+)
    const formData = new FormData();
    formData.append('file', imageBlob, filename);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${wpUsername}:${wpPassword}`).toString('base64')}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`WordPress upload failed: ${uploadResponse.status} ${errorText}`);
    }

    const uploadData: WordPressUploadResponse = await uploadResponse.json();
    return uploadData;
  } catch (error) {
    console.error('Error uploading to WordPress:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls } = await request.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'imageUrls array is required' },
        { status: 400 }
      );
    }

    const results: Array<{ originalUrl: string; wordpressUrl: string | null; error?: string }> = [];
    
    // Upload images sequentially to avoid overwhelming WordPress
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      const filename = `gothic-journal-page-${i + 1}.png`;

      try {
        const uploadResult = await uploadToWordPress(imageUrl, filename);
        results.push({
          originalUrl: imageUrl,
          wordpressUrl: uploadResult?.source_url || uploadResult?.link || null,
        });
        
        // Small delay between uploads to avoid rate limiting
        if (i < imageUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error uploading image ${i + 1}:`, error);
        results.push({
          originalUrl: imageUrl,
          wordpressUrl: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      uploaded: results.filter(r => r.wordpressUrl).length,
      failed: results.filter(r => !r.wordpressUrl).length,
    });
  } catch (error) {
    console.error('WordPress upload error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to upload images to WordPress',
        success: false 
      },
      { status: 500 }
    );
  }
}

