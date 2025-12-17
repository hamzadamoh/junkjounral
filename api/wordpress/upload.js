// WordPress upload API route for Vercel serverless function
// This route handles uploading images to WordPress to avoid CORS issues

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, filename } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Get WordPress credentials from environment variables
    const wpUrl = process.env.VITE_WP_URL || process.env.WORDPRESS_URL;
    const wpUsername = process.env.VITE_WP_USERNAME || process.env.WORDPRESS_USERNAME;
    const wpPassword = process.env.VITE_WP_APP_PASSWORD || process.env.WORDPRESS_APPLICATION_PASSWORD;

    if (!wpUrl || !wpUsername || !wpPassword) {
      return res.status(500).json({ 
        error: 'WordPress credentials not configured. Please set VITE_WP_URL, VITE_WP_USERNAME, and VITE_WP_APP_PASSWORD environment variables.' 
      });
    }

    // Remove data URL prefix if present
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Determine MIME type from base64 or default to jpeg
    let mimeType = 'image/jpeg';
    if (base64Image.startsWith('data:image/')) {
      const mimeMatch = base64Image.match(/data:image\/([^;]+)/);
      if (mimeMatch) {
        mimeType = `image/${mimeMatch[1]}`;
      }
    }

    // Generate filename if not provided
    const finalFilename = filename || `style-ref-${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;

    // Create multipart/form-data body for WordPress REST API
    // Use a simpler boundary format
    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2, 15)}`;
    const CRLF = '\r\n';
    
    // Build multipart body manually
    const header = [
      `--${boundary}${CRLF}`,
      `Content-Disposition: form-data; name="file"; filename="${finalFilename}"${CRLF}`,
      `Content-Type: ${mimeType}${CRLF}`,
      `${CRLF}`
    ].join('');
    
    const footer = `${CRLF}--${boundary}--${CRLF}`;
    
    // Combine header, image buffer, and footer
    const formDataBuffer = Buffer.concat([
      Buffer.from(header, 'utf8'),
      imageBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    // Upload to WordPress
    const uploadUrl = `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/media`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${wpUsername}:${wpPassword}`).toString('base64')}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formDataBuffer.length.toString(),
      },
      body: formDataBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[WordPress API] Upload error:', response.status, errorText);
      
      // Check if it's a database connection error
      if (errorText.includes('database connection') || errorText.includes('Database Error')) {
        return res.status(503).json({ 
          error: 'WordPress database connection error. Please try again in a moment.',
          retryable: true
        });
      }
      
      // Try to extract meaningful error from HTML if it's an HTML response
      let errorMessage = errorText;
      if (errorText.includes('<!DOCTYPE html>')) {
        const titleMatch = errorText.match(/<title>(.*?)<\/title>/i);
        const h1Match = errorText.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) {
          errorMessage = h1Match[1];
        } else if (titleMatch) {
          errorMessage = titleMatch[1];
        } else {
          errorMessage = 'WordPress server error';
        }
      }
      
      return res.status(response.status).json({ 
        error: `WordPress upload failed: ${response.status} ${errorMessage.substring(0, 200)}` 
      });
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('[WordPress API] Non-JSON response:', text.substring(0, 200));
      return res.status(500).json({ 
        error: 'WordPress returned an unexpected response format' 
      });
    }

    if (!data.source_url) {
      return res.status(500).json({ error: 'WordPress response missing source_url' });
    }

    return res.status(200).json({ 
      url: data.source_url,
      id: data.id 
    });

  } catch (error) {
    console.error('[WordPress API] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to upload image to WordPress' 
    });
  }
}

