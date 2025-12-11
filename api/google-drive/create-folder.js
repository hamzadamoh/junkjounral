/**
 * Google Drive Create Folder API
 * Creates a folder in Google Drive
 */

async function getAccessToken() {
  const oauthToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (oauthToken) {
    console.log('[Google Drive API] Using OAuth2 access token');
    return oauthToken;
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

async function createFolder(folderName, accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create folder: ${response.status} ${error}`);
    }

    const data = await response.json();
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
    const { folderName } = req.body;

    if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      // Check what's missing and provide specific error
      const hasOAuthToken = !!process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
      const hasClientEmail = !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const hasPrivateKey = !!process.env.GOOGLE_DRIVE_PRIVATE_KEY;
      
      let errorMessage = 'Failed to get Google Drive access token. ';
      if (!hasOAuthToken && (!hasClientEmail || !hasPrivateKey)) {
        errorMessage += 'Missing credentials: ';
        if (!hasClientEmail) errorMessage += 'GOOGLE_DRIVE_CLIENT_EMAIL ';
        if (!hasPrivateKey) errorMessage += 'GOOGLE_DRIVE_PRIVATE_KEY ';
        errorMessage += '. Please configure these in Vercel environment variables and redeploy.';
      } else if (hasClientEmail && hasPrivateKey) {
        errorMessage += 'Service account credentials found but authentication failed. Check Vercel function logs for details.';
      } else {
        errorMessage += 'Please configure GOOGLE_DRIVE_ACCESS_TOKEN or service account credentials in Vercel.';
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

    const folderId = await createFolder(folderName.trim(), accessToken);
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

