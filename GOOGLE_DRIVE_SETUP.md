# Google Drive API Setup Guide

This guide will help you set up Google Drive API credentials for the image upload feature.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "Junk Journal Uploader")
5. Click **"Create"**
6. Wait for the project to be created, then select it from the dropdown

## Step 2: Enable Google Drive API

1. In the Google Cloud Console, go to **"APIs & Services"** > **"Library"**
2. Search for **"Google Drive API"**
3. Click on it and click **"Enable"**
4. Wait for the API to be enabled

## Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted, configure the OAuth consent screen first (see Step 4 below)
5. For **Application type**, select **"Web application"**
6. Give it a name (e.g., "Junk Journal Web Client")
7. Under **"Authorized redirect URIs"**, add:
   - `http://localhost:5173` (for local development)
   - `https://your-vercel-app.vercel.app` (for production - replace with your actual domain)
8. Click **"Create"**
9. **IMPORTANT**: Copy the **Client ID** and **Client Secret** immediately - you won't be able to see the secret again!

## Step 4: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** > **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace account)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: Your app name (e.g., "Junk Journal Uploader")
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **"Save and Continue"**
6. On the **Scopes** page, click **"Add or Remove Scopes"**
7. Add these scopes:
   - `https://www.googleapis.com/auth/drive.file` (View and manage Google Drive files and folders that you have opened or created)
8. Click **"Update"**, then **"Save and Continue"**
9. On the **Test users** page (if in testing mode), add your Google account email
10. Click **"Save and Continue"**, then **"Back to Dashboard"**

## Step 5: Get Refresh Token

⚠️ **CRITICAL**: The refresh token MUST be generated using the **exact same Client ID and Client Secret** that you're using in your app. If you use different credentials, you'll get an "unauthorized_client" error.

### Method 1: Using OAuth 2.0 Playground (Easier)

1. **First, get your Client ID and Client Secret from Google Cloud Console:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to **APIs & Services** > **Credentials**
   - Find your OAuth 2.0 Client ID (the one you created in Step 3)
   - Click on it to view details
   - Copy the **Client ID** and **Client Secret** (click "Show" to reveal the secret)

2. **Generate the refresh token:**
   - Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
   - Click the gear icon (⚙️) in the top right
   - Check **"Use your own OAuth credentials"**
   - **IMPORTANT**: Enter the **exact same Client ID and Client Secret** you copied from Google Cloud Console
   - In the left panel, scroll down and find **"Drive API v3"**
   - Expand it and check:
     - `https://www.googleapis.com/auth/drive.file`
   - Click **"Authorize APIs"**
   - Sign in with your Google account and grant permissions
   - Click **"Exchange authorization code for tokens"**
   - Copy the **Refresh token** from the response (it looks like: `1//0abc123...`)

3. **Verify the credentials match:**
   - The Client ID you used in OAuth Playground should match `VITE_GOOGLE_DRIVE_CLIENT_ID` in your `.env`
   - The Client Secret you used in OAuth Playground should match `VITE_GOOGLE_DRIVE_CLIENT_SECRET` in your `.env`
   - The refresh token you just generated should be used for `VITE_GOOGLE_DRIVE_REFRESH_TOKEN` in your `.env`

### Method 2: Using a Script (More Control)

1. Create a simple HTML file with this content:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Get Google Drive Refresh Token</title>
</head>
<body>
  <h1>Get Google Drive Refresh Token</h1>
  <button onclick="getToken()">Get Refresh Token</button>
  <div id="result"></div>

  <script>
    const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
    const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
    const REDIRECT_URI = 'http://localhost:5173'; // Or your production URL

    function getToken() {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=https://www.googleapis.com/auth/drive.file&` +
        `access_type=offline&` +
        `prompt=consent`;

      window.location.href = authUrl;
    }

    // Handle callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })
      .then(response => response.json())
      .then(data => {
        document.getElementById('result').innerHTML = 
          '<h2>Refresh Token:</h2><pre>' + data.refresh_token + '</pre>';
      });
    }
  </script>
</body>
</html>
```

2. Replace `YOUR_CLIENT_ID_HERE` and `YOUR_CLIENT_SECRET_HERE` with your actual credentials
3. Open the HTML file in a browser
4. Click the button and authorize
5. Copy the refresh token from the result

## Step 6: Add to Environment Variables

Add these to your `.env` file (or Vercel environment variables):

```env
VITE_GOOGLE_DRIVE_CLIENT_ID=your_client_id_here
VITE_GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret_here
VITE_GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token_here
```

**For Vercel:**
1. Go to your project settings in Vercel
2. Navigate to **"Environment Variables"**
3. Add each variable:
   - `VITE_GOOGLE_DRIVE_CLIENT_ID`
   - `VITE_GOOGLE_DRIVE_CLIENT_SECRET`
   - `VITE_GOOGLE_DRIVE_REFRESH_TOKEN`
4. Redeploy your application

## Troubleshooting

### "unauthorized_client" error (401 Unauthorized)
This is the most common error and usually means:
1. **Client ID and Client Secret don't match** - Double-check that you copied them correctly from Google Cloud Console
2. **Refresh token was generated with a different Client ID** - The refresh token must be generated using the exact same Client ID you're using in your app
3. **OAuth consent screen not configured** - Make sure you completed Step 4 above
4. **Wrong OAuth client type** - Make sure you created a "Web application" OAuth client, not "Desktop" or "Other"

**Solution:**
- Go back to OAuth Playground (Method 1 in Step 5)
- Make sure you enter the **exact same Client ID and Client Secret** from your Google Cloud Console
- Generate a new refresh token
- Update your environment variables with the new refresh token

### "Invalid client" error
- Make sure your Client ID and Client Secret are correct
- Check that you copied them without extra spaces or line breaks
- Verify they match exactly what's shown in Google Cloud Console

### "Invalid grant" error
- Your refresh token may have expired or been revoked
- If your app is in "Testing" mode, refresh tokens expire after 7 days
- Generate a new refresh token using Method 1 or 2 above
- Make sure you're using the same Google account that authorized the app
- **Solution:** Change your app's publishing status to "In production" to prevent refresh token expiration

### "Access denied" error
- Make sure the OAuth consent screen is properly configured
- If in testing mode, make sure your email is added as a test user
- Try publishing your app (if ready) or wait for verification

### "Redirect URI mismatch"
- Make sure the redirect URI in your OAuth client matches exactly what you're using
- For local development: `http://localhost:5173`
- For production: your actual Vercel URL (e.g., `https://junkjounral.vercel.app`)
- Note: The redirect URI is only used during initial authorization - it doesn't need to match your app's domain for refresh tokens

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit your `.env` file to Git** - it's already in `.gitignore`
2. **Client Secret is sensitive** - keep it private
3. **Refresh Token is very sensitive** - treat it like a password
4. **Use environment variables** - never hardcode credentials in your code
5. **Rotate credentials** if you suspect they've been compromised

## Need Help?

If you encounter issues:
1. Check the Google Cloud Console for error messages
2. Verify all credentials are correct
3. Make sure the Google Drive API is enabled
4. Check that your OAuth consent screen is configured properly

