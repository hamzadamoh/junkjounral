// Import WordPress config from env module
import { getWordPressConfig } from './env';

const getWordPressUsername = (): string => {
  return getWordPressConfig().username;
};

const getWordPressAppPassword = (): string => {
  return getWordPressConfig().password;
};

const WORDPRESS_MEDIA_ENDPOINT = 'https://gold-stingray-884517.hostingersite.com/wp-json/wp/v2/media';

interface WordPressMediaResponse {
  id: number;
  source_url: string;
  [key: string]: any;
}

/**
 * Uploads an image to WordPress and returns the public URL
 * @param base64Image Base64 encoded image (with or without data URL prefix)
 * @returns The public URL of the uploaded image
 */
export const uploadImageToWordPress = async (base64Image: string): Promise<string> => {
  const username = getWordPressUsername();
  const appPassword = getWordPressAppPassword();

  if (!username || !appPassword) {
    throw new Error('WordPress credentials are not configured. Please set VITE_WP_USERNAME and VITE_WP_APP_PASSWORD in your environment variables.');
  }

  try {
    // Remove data URL prefix if present (keep just the base64 data)
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // Convert base64 to binary Blob
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    // Create FormData for multipart/form-data upload
    const formData = new FormData();
    formData.append('file', blob, `style-ref-${Date.now()}.jpg`);

    // Create Basic Auth header
    const authString = btoa(`${username}:${appPassword}`);

    // Upload to WordPress
    const response = await fetch(WORDPRESS_MEDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`
        // Don't set Content-Type - let browser set it with boundary for FormData
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[WordPress] Upload error response:', errorText);
      throw new Error(`WordPress upload failed: ${response.status} - ${errorText}`);
    }

    const data: WordPressMediaResponse = await response.json();

    if (!data.source_url) {
      throw new Error('WordPress response missing source_url');
    }

    console.log(`[WordPress] ✅ Image uploaded successfully: ${data.source_url}`);
    return data.source_url;
  } catch (error: any) {
    console.error('[WordPress] Upload error:', error);
    throw new Error(`Failed to upload image to WordPress: ${error.message || 'Unknown error'}`);
  }
};

