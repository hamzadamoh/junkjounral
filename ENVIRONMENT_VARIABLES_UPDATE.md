# Environment Variables Update Guide

## 🔒 Security Update Required

To secure your API keys and fix the serverless function consolidation, you need to update your Vercel environment variables.

## 📋 Changes Required

### 1. **Add New Server-Side Variables (NO `VITE_` prefix)**

Add these to your Vercel environment variables (Project Settings → Environment Variables):

```
OPENAI_API_KEY=your_openai_api_key_here
```

**Why:** The new `/api/openai/chat` route uses `OPENAI_API_KEY` (server-side only, not exposed to client).

### 2. **Optional: Keep Old Variables Temporarily (for backward compatibility)**

You can keep the old `VITE_*` variables temporarily during transition, but they should eventually be removed:

**Currently Used (can keep for now):**
- `VITE_OPENAI_API_KEY` - Still used by some client-side checks (but API calls now go through server)
- `VITE_TTAPI_API_KEY` - Still used as fallback in serverless functions
- `VITE_TTAPI_DOMAIN` - Still used as fallback in serverless functions
- `VITE_WP_URL` - Still used as fallback in serverless functions
- `VITE_WP_USERNAME` - Still used as fallback in serverless functions
- `VITE_WP_APP_PASSWORD` - Still used as fallback in serverless functions

**Recommendation:** Keep both for now, then remove `VITE_*` versions once everything is tested.

### 3. **Server-Side Variables (Already Correct - No `VITE_` prefix)**

These are already correct and should stay as-is:

```
TTAPI_API_KEY=your_ttapi_key
TTAPI_DOMAIN=https://hold.ttapi.io (or https://api.ttapi.io)
WORDPRESS_URL=your_wordpress_url
WORDPRESS_USERNAME=your_wordpress_username
WORDPRESS_APPLICATION_PASSWORD=your_wordpress_app_password
REPLICATE_API_TOKEN=your_replicate_token
```

## 🎯 Quick Action Checklist

### In Vercel Dashboard:

1. ✅ **Add** `OPENAI_API_KEY` (new, required)
2. ✅ **Keep** existing `VITE_OPENAI_API_KEY` (temporary, for backward compatibility)
3. ✅ **Keep** all other existing variables (they're working fine)

### After Testing (Optional Cleanup):

Once you've verified everything works:
- ❌ **Remove** `VITE_OPENAI_API_KEY` (API calls now go through server)
- ❌ **Remove** other `VITE_*` variables if you want maximum security
- ⚠️ **Keep** `VITE_*` variables that are safe to expose (like `VITE_TTAPI_DOMAIN` for client-side URL construction)

## 📝 Step-by-Step Instructions

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Click **Add New**
4. Add:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** Your OpenAI API key (same value as `VITE_OPENAI_API_KEY`)
   - **Environment:** Select all (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your application (or wait for next deployment)

## ⚠️ Important Notes

- **Don't delete** `VITE_OPENAI_API_KEY` yet - some code still checks for it
- The new `OPENAI_API_KEY` is **server-side only** and won't be exposed to clients
- After testing, you can remove `VITE_OPENAI_API_KEY` for better security
- All other variables can stay as-is for now

## 🔍 How to Verify

After updating:
1. Check that OpenAI API calls still work (Arcane Splitter, Oracle analysis)
2. Check browser DevTools → Network tab
3. Look for requests to `/api/openai/chat` (should work)
4. Search Sources tab for `VITE_OPENAI_API_KEY` - you'll still see it, but actual API calls use server-side key

## 🚨 Security Reminder

**Current Status:**
- ✅ OpenAI API calls now go through server (secure)
- ⚠️ `VITE_OPENAI_API_KEY` still in client code (but not used for API calls)
- ✅ Other API keys already on server-side

**After Cleanup:**
- ✅ All API calls through server
- ✅ No API keys in client code
- ✅ Maximum security

