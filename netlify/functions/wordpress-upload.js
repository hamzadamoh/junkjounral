/**
 * Netlify Function - WordPress upload API route
 * This route handles uploading images to WordPress to avoid CORS issues
 * Converted from Vercel serverless function format
 */

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { base64Image, filename } = body;

    if (!base64Image) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'No image data provided' }),
      };
    }

    // Get WordPress credentials from environment variables
    const wpUrl = process.env.VITE_WP_URL || process.env.WORDPRESS_URL || process.env.WP_URL;
    const wpUsername = process.env.VITE_WP_USERNAME || process.env.WORDPRESS_USERNAME || process.env.WP_USERNAME;
    const wpPassword = process.env.VITE_WP_APP_PASSWORD || process.env.WORDPRESS_APPLICATION_PASSWORD || process.env.WP_APP_PASSWORD;

    if (!wpUrl || !wpUsername || !wpPassword) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          error: 'WordPress credentials not configured. Please set WP_URL, WP_USERNAME, and WP_APP_PASSWORD environment variables.' 
        }),
      };
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
      console.error('[WordPress API] Upload error:', response.status, errorText.substring(0, 500));
      
      // Check if it's a database connection error
      if (errorText.includes('database connection') || errorText.includes('Database Error')) {
        return {
          statusCode: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'WordPress database connection error. Please try again in a moment.',
            retryable: true
          }),
        };
      }
      
      // Check for rate limiting (403 or 429)
      const isRateLimit = response.status === 403 || response.status === 429;
      if (isRateLimit) {
        return {
          statusCode: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: `WordPress upload failed: ${response.status} (Rate limit or permission denied)`,
            retryable: true
          }),
        };
      }
      
      // Try to extract meaningful error from HTML if it's an HTML response
      let errorMessage = errorText;
      if (errorText.includes('<!DOCTYPE html>') || errorText.includes('<html')) {
        // Try multiple patterns to extract error message
        const patterns = [
          /<h1[^>]*>(.*?)<\/h1>/i,
          /<title>(.*?)<\/title>/i,
          /<p[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/p>/i,
          /<div[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/div>/i,
          /error[^<]*:?\s*([^<\n]+)/i
        ];
        
        for (const pattern of patterns) {
          const match = errorText.match(pattern);
          if (match && match[1]) {
            errorMessage = match[1].trim();
            break;
          }
        }
        
        if (errorMessage === errorText) {
          errorMessage = `WordPress server error (${response.status})`;
        }
      }
      
      // Determine if error is retryable
      const retryable = response.status === 503 || 
                       response.status === 429 || 
                       response.status === 500 ||
                       errorText.includes('timeout') ||
                       errorText.includes('temporarily');
      
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          error: `WordPress upload failed: ${response.status} ${errorMessage.substring(0, 200)}`,
          retryable
        }),
      };
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text().catch(() => 'Unable to read response');
        console.error('[WordPress API] JSON parse error:', parseError);
        console.error('[WordPress API] Response text:', text.substring(0, 500));
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'WordPress returned invalid JSON response',
            retryable: true
          }),
        };
      }
    } else {
      const text = await response.text().catch(() => 'Unable to read response');
      console.error('[WordPress API] Non-JSON response. Content-Type:', contentType);
      console.error('[WordPress API] Response text:', text.substring(0, 500));
      
      // Try to extract error from HTML response
      let errorMessage = 'WordPress returned an unexpected response format';
      if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
        const h1Match = text.match(/<h1[^>]*>(.*?)<\/h1>/i);
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        if (h1Match) {
          errorMessage = h1Match[1].trim();
        } else if (titleMatch) {
          errorMessage = titleMatch[1].trim();
        }
      }
      
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          error: errorMessage,
          retryable: true
        }),
      };
    }

    if (!data.source_url) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'WordPress response missing source_url' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        url: data.source_url,
        id: data.id 
      }),
    };

  } catch (error) {
    console.error('[WordPress API] Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to upload image to WordPress' 
      }),
    };
  }
};
