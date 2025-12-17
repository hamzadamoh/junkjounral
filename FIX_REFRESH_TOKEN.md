# Quick Fix: Generate New Refresh Token

If you're getting "unauthorized_client" error, it means your refresh token was generated with different Client ID/Secret than what you're using now.

## Quick Steps to Fix:

### 1. Get Your Current Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Find your OAuth 2.0 Client ID
4. Click on it and copy:
   - **Client ID** (visible)
   - **Client Secret** (click "Show" to reveal)

### 2. Generate New Refresh Token
1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the **gear icon (⚙️)** in the top right
3. Check **"Use your own OAuth credentials"**
4. **Paste the EXACT Client ID and Client Secret** from Step 1
5. In the left panel, find **"Drive API v3"** and expand it
6. Check: `https://www.googleapis.com/auth/drive.file`
7. Click **"Authorize APIs"**
8. Sign in and grant permissions
9. Click **"Exchange authorization code for tokens"**
10. Copy the **Refresh token** (starts with `1//`)

### 3. Update Your Environment Variables

**In your `.env` file:**
```env
VITE_GOOGLE_DRIVE_CLIENT_ID=<paste Client ID from Step 1>
VITE_GOOGLE_DRIVE_CLIENT_SECRET=<paste Client Secret from Step 1>
VITE_GOOGLE_DRIVE_REFRESH_TOKEN=<paste Refresh token from Step 2>
```

**In Vercel (if deployed):**
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Update all three variables with the new values
4. **Redeploy** your application

### 4. Verify They Match

✅ Client ID in `.env` = Client ID used in OAuth Playground  
✅ Client Secret in `.env` = Client Secret used in OAuth Playground  
✅ Refresh token in `.env` = Refresh token generated in OAuth Playground  

**All three must match!**

## Common Mistakes:

❌ Using an old refresh token with new Client ID/Secret  
❌ Using Client ID/Secret from a different OAuth client  
❌ Copying credentials with extra spaces or line breaks  
❌ Not redeploying after updating Vercel environment variables  

## Still Getting Errors?

1. Double-check all three values match exactly
2. Make sure there are no extra spaces when copying
3. If in Vercel, make sure you redeployed after updating variables
4. Try generating a completely new refresh token
5. Verify your OAuth consent screen is configured (Step 4 in GOOGLE_DRIVE_SETUP.md)



