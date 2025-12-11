/**
 * Google Drive Create Folder API
 * Creates a folder in Google Drive
 */

async function getAccessToken() {
  // Option 1: Direct access token (temporary, expires in ~1 hour)
  const oauthToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (oauthToken) {
    console.log('[Google Drive API] Using OAuth2 access token (may expire)');
    return oauthToken;
  }

  // Option 2: Refresh token (requires OAuth consent screen - will fallback to service account if fails)
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  
  if (refreshToken && clientId && clientSecret) {
    console.log('[Google Drive API] Attempting OAuth2 refresh token...');
    try {
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const requestBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody,
      });

      if (response.ok) {
        const tokenData = await response.json();
        if (tokenData.access_token) {
          console.log('[Google Drive API] ✅ Successfully refreshed access token');
          return tokenData.access_token;
        }
      } else {
        const errorText = await response.text();
        console.warn('[Google Drive API] ⚠️ OAuth2 refresh failed:', errorText);
        console.warn('[Google Drive API] ⚠️ Falling back to service account...');
        // Don't throw - fall through to service account
      }
    } catch (error) {
      console.warn('[Google Drive API] ⚠️ OAuth2 error:', error.message);
      console.warn('[Google Drive API] ⚠️ Falling back to service account...');
      // Don't throw - fall through to service account
    }
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  
  console.log('[Google Drive API] Checking service account credentials...');
  console.log('[Google Drive API] Client email exists:', !!clientEmail);
  console.log('[Google Drive API] Private key exists:', !!privateKey);
  console.log('[Google Drive API] Private key length:', privateKey ? privateKey.length : 0);
  console.log('[Google Drive API] Private key first 50 chars:', privateKey ? privateKey.substring(0, 50) : 'N/A');
  console.log('[Google Drive API] Private key last 50 chars:', privateKey ? privateKey.substring(privateKey.length - 50) : 'N/A');
  console.log('[Google Drive API] Private key contains \\n:', privateKey ? privateKey.includes('\\n') : false);
  console.log('[Google Drive API] Private key contains actual newlines:', privateKey ? privateKey.includes('\n') : false);
  
  if (clientEmail && privateKey) {
    try {
      // Replace \\n with actual newlines (handle both escaped and actual newlines)
      // First trim any leading/trailing whitespace
      let formattedPrivateKey = privateKey.trim();
      
      // If it contains \n (escaped), replace with actual newlines
      if (formattedPrivateKey.includes('\\n')) {
        formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');
        console.log('[Google Drive API] Converted \\n to actual newlines');
      } else if (formattedPrivateKey.includes('\n')) {
        console.log('[Google Drive API] Private key already contains actual newlines (multi-line format)');
      }
      
      // Ensure it ends with a newline after END PRIVATE KEY
      if (formattedPrivateKey.endsWith('-----END PRIVATE KEY-----')) {
        formattedPrivateKey += '\n';
        console.log('[Google Drive API] Added trailing newline after END PRIVATE KEY');
      }
      
      // Also handle if it already has newlines (Vercel might convert them)
      console.log('[Google Drive API] Formatted key length:', formattedPrivateKey.length);
      console.log('[Google Drive API] Formatted key first 50 chars:', formattedPrivateKey.substring(0, 50));
      console.log('[Google Drive API] Formatted key last 50 chars:', formattedPrivateKey.substring(formattedPrivateKey.length - 50));
      
      console.log('[Google Drive API] Attempting to import googleapis...');
      
      let google;
      try {
        const googleapisModule = await import('googleapis');
        google = googleapisModule.google || googleapisModule.default?.google;
        if (!google) {
          throw new Error('googleapis module does not export google');
        }
        console.log('[Google Drive API] googleapis imported successfully');
      } catch (importError) {
        console.error('[Google Drive API] ❌ Failed to import googleapis:', importError);
        console.error('[Google Drive API] Import error details:', importError.message);
        throw new Error(`Failed to import googleapis: ${importError.message}. Make sure googleapis is installed.`);
      }
      
      // Validate private key format
      if (!formattedPrivateKey.includes('BEGIN PRIVATE KEY')) {
        console.error('[Google Drive API] ❌ Private key format invalid: Missing BEGIN PRIVATE KEY');
        throw new Error('Private key must start with -----BEGIN PRIVATE KEY-----');
      }
      if (!formattedPrivateKey.includes('END PRIVATE KEY')) {
        console.error('[Google Drive API] ❌ Private key format invalid: Missing END PRIVATE KEY');
        throw new Error('Private key must end with -----END PRIVATE KEY-----');
      }
      
      console.log('[Google Drive API] Private key format validated');
      console.log('[Google Drive API] Creating JWT client with email:', clientEmail);
      console.log('[Google Drive API] Private key to pass (first 100 chars):', formattedPrivateKey.substring(0, 100));
      console.log('[Google Drive API] Private key to pass (last 100 chars):', formattedPrivateKey.substring(formattedPrivateKey.length - 100));
      console.log('[Google Drive API] Private key is empty?', formattedPrivateKey.length === 0);
      
      // Create JWT client - the key parameter should be the private key string
      // According to googleapis docs: new JWT(email, keyFile, key, scopes, subject)
      const jwtClient = new google.auth.JWT({
        email: clientEmail,
        key: formattedPrivateKey,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      
      console.log('[Google Drive API] Authorizing JWT client...');
      try {
        const tokens = await jwtClient.authorize();
        if (!tokens || !tokens.access_token) {
          throw new Error('Authorization succeeded but no access token returned');
        }
        console.log('[Google Drive API] ✅ JWT authorization successful');
        return tokens.access_token;
      } catch (authError) {
        console.error('[Google Drive API] ❌ JWT authorization failed:', authError);
        console.error('[Google Drive API] Auth error message:', authError.message);
        console.error('[Google Drive API] Auth error code:', authError.code);
        console.error('[Google Drive API] Auth error response:', authError.response?.data || 'No response data');
        throw authError;
      }
    } catch (error) {
      console.error('[Google Drive API] ❌ Service account auth failed:', error);
      console.error('[Google Drive API] Error details:', error.message);
      console.error('[Google Drive API] Error code:', error.code);
      console.error('[Google Drive API] Error stack:', error.stack);
      return null;
    }
  }

  console.error('[Google Drive API] ❌ No credentials found. Client email:', !!clientEmail, 'Private key:', !!privateKey);
  return null;
}

async function createFolder(folderName, accessToken, parentFolderId = null) {
  try {
    // If parentFolderId is provided, create folder inside it (uses user's storage)
    // Otherwise, create in service account's root (uses service account's limited storage)
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    // Add parent folder if provided (this makes it use the user's storage quota)
    if (parentFolderId) {
      folderMetadata.parents = [parentFolderId];
      console.log(`[Google Drive API] Creating folder inside parent folder: ${parentFolderId}`);
    } else {
      console.log('[Google Drive API] Creating folder in service account root (may have limited storage)');
    }
    
    // Add supportsAllDrives parameter to work with shared drives and folders
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('supportsAllDrives', 'true');
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(folderMetadata),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create folder: ${response.status} ${error}`);
    }

    const data = await response.json();
    console.log('[Google Drive API] Folder created successfully. Folder ID:', data.id);
    console.log('[Google Drive API] Folder metadata:', JSON.stringify(data, null, 2));
    
    // Verify the folder's parent
    if (data.parents && data.parents.length > 0) {
      console.log('[Google Drive API] Folder parent IDs:', data.parents);
      if (parentFolderId && data.parents.includes(parentFolderId)) {
        console.log('[Google Drive API] ✅ Folder created in correct parent folder (will use your storage)');
      } else {
        console.log('[Google Drive API] ⚠️ Folder parent does not match expected parent folder ID');
      }
    } else {
      console.log('[Google Drive API] ⚠️ Folder has no parents (created in service account root)');
    }
    
    return data.id;
  } catch (error) {
    console.error('[Google Drive API] Error creating folder:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderName, parentFolderId } = req.body;

    if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      // Check what's missing and provide specific error
      const hasOAuthToken = !!process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
      const hasRefreshToken = !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
      const hasClientId = !!process.env.GOOGLE_DRIVE_CLIENT_ID;
      const hasClientSecret = !!process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const hasClientEmail = !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const hasPrivateKey = !!process.env.GOOGLE_DRIVE_PRIVATE_KEY;
      
      let errorMessage = 'Failed to get Google Drive access token. ';
      
      // Check for refresh token setup
      if (hasRefreshToken && (!hasClientId || !hasClientSecret)) {
        errorMessage += 'Refresh token found but missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET. ';
        errorMessage += 'All three are required for refresh token authentication.';
      } else if (!hasOAuthToken && !hasRefreshToken && (!hasClientEmail || !hasPrivateKey)) {
        errorMessage += 'Missing credentials. You need either:\n';
        errorMessage += '1. GOOGLE_DRIVE_ACCESS_TOKEN (temporary, expires in ~1 hour), OR\n';
        errorMessage += '2. GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET (permanent solution), OR\n';
        errorMessage += '3. Service account credentials (but these cannot use personal Drive storage).';
      } else if (hasClientEmail && hasPrivateKey) {
        errorMessage += 'Service account credentials found but authentication failed. Check Vercel function logs for details.';
        errorMessage += ' Note: Service accounts cannot use personal Drive storage. Use OAuth2 refresh token instead.';
      } else {
        errorMessage += 'Please configure OAuth2 credentials (access token or refresh token) in Vercel.';
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        debug: {
          hasOAuthToken,
          hasClientEmail,
          hasPrivateKey,
          privateKeyLength: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.length || 0
        }
      });
    }

    // Use parent folder from environment variable or request body
    // This should be the ID of a folder in your personal Drive that you've shared with the service account
    const envParentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
    const parentId = parentFolderId || envParentId || null;
    
    console.log('[Google Drive API] Parent folder check:');
    console.log('[Google Drive API] - From request body:', parentFolderId || 'not provided');
    console.log('[Google Drive API] - From environment variable:', envParentId || 'not set');
    console.log('[Google Drive API] - Final parent ID to use:', parentId || 'none (will use service account root)');
    
    if (parentId) {
      console.log(`[Google Drive API] ✅ Using parent folder ID: ${parentId} (will use your storage quota)`);
    } else {
      console.log('[Google Drive API] ⚠️ No parent folder specified - creating in service account root (limited storage)');
      console.log('[Google Drive API] To use your storage quota, set GOOGLE_DRIVE_PARENT_FOLDER_ID in Vercel environment variables');
      console.log('[Google Drive API] The folder ID should be from a folder in YOUR personal Drive that you shared with the service account');
    }
    
    const folderId = await createFolder(folderName.trim(), accessToken, parentId);
    if (!folderId) {
      return res.status(500).json({ error: 'Failed to create folder' });
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return res.status(200).json({
      success: true,
      folderId,
      folderUrl,
    });
  } catch (error) {
    console.error('[Google Drive API] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create folder',
      message: error.message 
    });
  }
}

