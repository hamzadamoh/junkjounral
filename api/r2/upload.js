/**
 * Cloudflare R2 Upload API
 * Uploads a single image to Cloudflare R2 with folder support
 * Uses AWS SDK (R2 is S3-compatible)
 */

export default async function handler(req, res) {
  // Dynamic import for AWS SDK
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folder, filename, filePath, base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Base64 image data is required' });
    }

    // Get R2 credentials from environment and sanitize (remove newlines/whitespace)
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim().replace(/[\r\n]/g, '');
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim().replace(/[\r\n]/g, '');
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim().replace(/[\r\n]/g, '');
    const bucketName = (process.env.R2_BUCKET_NAME || '').trim().replace(/[\r\n]/g, '');
    const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').trim().replace(/[\r\n]/g, ''); // Optional: custom domain for public URLs

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      console.error('[R2] Missing credentials:', {
        accountId: !!accountId,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey,
        bucketName: !!bucketName,
      });
      return res.status(500).json({ 
        error: 'R2 credentials not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in Vercel environment variables.' 
      });
    }

    // Debug: Log credential lengths (not values) to help diagnose issues
    console.log('[R2] Credential check:', {
      accountIdLength: accountId.length,
      accessKeyIdLength: accessKeyId.length,
      secretAccessKeyLength: secretAccessKey.length,
      bucketNameLength: bucketName.length,
      publicDomainLength: publicDomain?.length || 0,
    });

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64, 'base64');

    // Sanitize folder name
    const sanitizedFolder = folder 
      ? folder.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      : 'uploads';
    
    const key = filePath || `${sanitizedFolder}/${filename}`;

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    console.log(`[R2] Uploading to: ${key}`);

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    });

    await s3Client.send(command);

    // Generate public URL
    // If custom domain is set, use it; otherwise use R2's public URL format
    let publicUrl;
    if (publicDomain) {
      // Custom domain: https://[domain]/[key]
      publicUrl = `https://${publicDomain}/${key}`;
    } else {
      // R2 public URL format: https://[account-id].r2.cloudflarestorage.com/[bucket]/[key]
      // OR if you have a public bucket endpoint: https://pub-[account-id].r2.dev/[bucket]/[key]
      // Note: You need to configure a public bucket endpoint in Cloudflare R2 dashboard
      // For now, we'll use the account endpoint format
      publicUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
      
      // If you've set up a public bucket endpoint, use this instead:
      // publicUrl = `https://pub-${accountId}.r2.dev/${bucketName}/${key}`;
    }
    
    console.log('[R2] ✅ Upload successful:', {
      key: key,
      url: publicUrl,
      folder: sanitizedFolder,
    });

    return res.status(200).json({
      key: key,
      url: publicUrl,
      folder: sanitizedFolder,
      size: imageBuffer.length,
    });
  } catch (error) {
    console.error('[R2] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to upload image to R2' 
    });
  }
}

