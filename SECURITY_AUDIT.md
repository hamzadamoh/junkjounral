# Security Audit Report

## ⚠️ CRITICAL SECURITY ISSUES FOUND

### 1. **API Keys Exposed in Client-Side Code** 🔴 CRITICAL

**Issue**: All environment variables with the `VITE_` prefix are **bundled into the client-side JavaScript code**. This means anyone can:
- View your API keys in the browser's DevTools (Sources tab)
- Extract API keys from the bundled JavaScript files
- Use your API keys to make unauthorized requests

**Affected Variables:**
- `VITE_OPENAI_API_KEY` - **EXPOSED** ❌
- `VITE_TTAPI_API_KEY` - **EXPOSED** ❌
- `VITE_DISCORD_TOKEN` - **EXPOSED** ❌
- `VITE_WP_USERNAME` - **EXPOSED** ❌
- `VITE_WP_APP_PASSWORD` - **EXPOSED** ❌
- `VITE_GOOGLE_DRIVE_CLIENT_SECRET` - **EXPOSED** ❌
- `VITE_GOOGLE_DRIVE_REFRESH_TOKEN` - **EXPOSED** ❌
- `VITE_ETSY_API_KEY` - **EXPOSED** ❌
- And all other `VITE_*` variables

**How to Verify:**
1. Open your deployed app in a browser
2. Press F12 to open DevTools
3. Go to Sources tab → Find your JavaScript bundle
4. Search for "VITE_OPENAI_API_KEY" or any API key
5. You'll see the actual API key values in plain text

### 2. **API Keys Visible in Network Requests** 🔴 CRITICAL

**Issue**: Client-side code makes direct API calls with API keys in request headers. These are visible in:
- Browser Network tab (Request Headers)
- Browser DevTools
- Any network monitoring tools

**Affected Files:**
- `components/ArcaneSplitter.tsx` (line 600): Direct OpenAI API call with API key in Authorization header
- `services/ttapiService.ts`: Makes client-side requests (though uses proxy for some)
- `services/oracleService.ts`: May make direct client-side requests

**Example:**
```typescript
// ❌ BAD - API key visible in Network tab
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`, // EXPOSED!
  },
});
```

### 3. **Console Logs Exposing Partial API Keys** 🟡 MEDIUM

**Issue**: Some console logs expose partial API key information.

**Affected Files:**
- `api/replicate/predictions.js` (line 22): Logs first 10 characters of API key

### 4. **Server-Side Routes (Good Examples)** ✅

**Good**: These routes properly protect API keys on the server:
- `api/ttapi/imagine.js` - Uses server-side environment variables
- `api/wordpress/upload.js` - Uses server-side environment variables
- `api/replicate/predictions.js` - Uses server-side environment variables (but has logging issue)

## 🔒 RECOMMENDED FIXES

### Priority 1: Move All API Calls to Server-Side Routes

**For OpenAI API calls:**
1. Create `/api/openai/chat` serverless function
2. Move API key to server-side (remove `VITE_` prefix)
3. Client calls your API route, not OpenAI directly

**Example Fix:**
```typescript
// ❌ BEFORE (Client-side - EXPOSED)
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
  },
});

// ✅ AFTER (Server-side - SECURE)
// Client calls your API
const response = await fetch('/api/openai/chat', {
  method: 'POST',
  body: JSON.stringify({ messages, model }),
});

// Server-side: api/openai/chat.js
const apiKey = process.env.OPENAI_API_KEY; // No VITE_ prefix = server-only
```

### Priority 2: Remove VITE_ Prefix from Sensitive Variables

**For Vercel/Serverless Functions:**
- Use `OPENAI_API_KEY` (not `VITE_OPENAI_API_KEY`) in Vercel environment variables
- Use `TTAPI_API_KEY` (not `VITE_TTAPI_API_KEY`)
- Use `WORDPRESS_USERNAME` (not `VITE_WP_USERNAME`)
- Use `WORDPRESS_APPLICATION_PASSWORD` (not `VITE_WP_APP_PASSWORD`)

**Note**: `VITE_` prefix is ONLY for variables that are safe to expose to the client (like public API URLs, feature flags, etc.)

### Priority 3: Remove Console Logs with Sensitive Data

Remove or sanitize console logs that expose API keys, even partially.

### Priority 4: Add Rate Limiting

Add rate limiting to your API routes to prevent abuse even if keys are exposed.

## 📋 IMMEDIATE ACTION ITEMS

1. **URGENT**: Create server-side API routes for all external API calls
2. **URGENT**: Remove `VITE_` prefix from all sensitive environment variables
3. **URGENT**: Update Vercel environment variables (remove `VITE_` prefix)
4. **HIGH**: Remove console.log statements that expose API keys
5. **MEDIUM**: Add rate limiting to API routes
6. **MEDIUM**: Add request validation to prevent abuse

## 🔍 HOW TO CHECK IF YOUR APP IS SECURE

1. **Check Network Tab:**
   - Open DevTools → Network tab
   - Look for requests with `Authorization` headers
   - If you see API keys, they're exposed

2. **Check Sources Tab:**
   - Open DevTools → Sources tab
   - Search for "VITE_" in your JavaScript files
   - If you find API key values, they're exposed

3. **Check Console:**
   - Look for any logs that show API keys (even partial)

## ⚠️ CURRENT RISK LEVEL: **HIGH** 🔴

Your API keys are currently exposed and can be:
- Extracted by anyone viewing your website
- Used to make unauthorized API calls
- Used to rack up charges on your accounts
- Used to access your WordPress site, Google Drive, etc.

## ✅ AFTER FIXES: Expected Risk Level: **LOW** 🟢

After implementing the recommended fixes, your API keys will be:
- Only accessible on the server
- Not visible in client-side code
- Not visible in network requests
- Protected by server-side authentication

