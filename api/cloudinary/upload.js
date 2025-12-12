/**
 * Cloudinary Upload API
 * Uploads a single image to Cloudinary with folder support
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folder, filename, base64, format = 'jpg' } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Base64 image data is required' });
    }

    // Get Cloudinary credentials from environment
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[Cloudinary] Missing credentials:', {
        cloudName: !!cloudName,
        apiKey: !!apiKey,
        apiSecret: !!apiSecret,
      });
      return res.status(500).json({ 
        error: 'Cloudinary credentials not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Vercel environment variables.' 
      });
    }

    // Build folder path (sanitize folder name)
    const sanitizedFolder = folder 
      ? folder.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      : 'uploads';
    
    const publicId = sanitizedFolder ? `${sanitizedFolder}/${filename}` : filename;

    // Upload to Cloudinary using unsigned upload with upload preset
    // OR use signed upload with API secret
    // For simplicity, we'll use signed upload
    
    // Create the upload string for base64 upload
    // Cloudinary expects format: data:image/jpeg;base64,... for JPG
    const mimeType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
    const uploadString = `data:${mimeType};base64,${base64}`;
    
    // Generate signature for signed upload
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Build parameters for signature (must include format if specified)
    const formatParam = format === 'jpg' || format === 'jpeg' ? 'jpg' : format;
    const params = {
      folder: sanitizedFolder,
      format: formatParam,
      overwrite: 'false',
      public_id: publicId,
      timestamp: timestamp.toString(),
    };
    
    // Create signature string (sorted keys)
    const sortedKeys = Object.keys(params).sort();
    const signatureString = sortedKeys
      .map(key => `${key}=${params[key]}`)
      .join('&') + apiSecret;
    
    const crypto = await import('crypto');
    const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

    // Build form data
    const formData = new URLSearchParams();
    formData.append('file', uploadString);
    formData.append('folder', sanitizedFolder);
    formData.append('public_id', publicId);
    formData.append('overwrite', 'false');
    formData.append('format', format === 'jpg' || format === 'jpeg' ? 'jpg' : format);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('api_key', apiKey);

    console.log(`[Cloudinary] Uploading to folder: ${sanitizedFolder}, public_id: ${publicId}`);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Cloudinary] Upload error:', errorText);
      return res.status(response.status).json({ 
        error: `Cloudinary upload failed: ${errorText}` 
      });
    }

    const data = await response.json();
    
    console.log('[Cloudinary] ✅ Upload successful:', {
      public_id: data.public_id,
      secure_url: data.secure_url,
      folder: sanitizedFolder,
    });

    return res.status(200).json({
      public_id: data.public_id,
      url: data.url,
      secure_url: data.secure_url,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes,
      folder: sanitizedFolder,
    });
  } catch (error) {
    console.error('[Cloudinary] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to upload image to Cloudinary' 
    });
  }
}

