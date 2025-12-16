# Midjourney Style Reference Analysis

## Current Implementation

### 1. How Style References Are Currently Passed

**Location:** `services/midjourneyService.ts` lines 587-606

```typescript
// Add Style Reference (--sref) with 60/20/20 strategy
// 60% use --sw 30 --sv 2 (moderate), 20% use --sw 55 --sv 3 (higher), 20% omit --sref
if (settings.styleRefUrl && settings.styleRefUrl.trim()) {
  // Use variationIndex to determine strategy (0-based, default to 0)
  const idx = variationIndex ?? 0;
  const strategy = idx % 10;
  
  if (strategy < 6) {
    // 60%: Moderate influence
    prompt += ` --sref ${settings.styleRefUrl.trim()} --sw 30 --sv 2 --c 5`;
    console.log(`[Midjourney] Added style reference (Moderate: --sw 30 --sv 2) for variation ${idx + 1}: ${settings.styleRefUrl}`);
  } else if (strategy < 8) {
    // 20%: Higher influence
    prompt += ` --sref ${settings.styleRefUrl.trim()} --sw 55 --sv 3 --c 5`;
    console.log(`[Midjourney] Added style reference (Higher: --sw 55 --sv 3) for variation ${idx + 1}: ${settings.styleRefUrl}`);
  } else {
    // 20%: Omit --sref entirely
    console.log(`[Midjourney] Omitting style reference for variation ${idx + 1} (20% strategy)`);
  }
}
```

### 2. The Problem

**Issue:** The code uses `settings.styleRefUrl` which is a **single URL** stored in global settings. When multiple images are uploaded:

- Each uploaded image has its own `styleRefUrl` stored in `uploadedImages[imageIndex].styleRefUrl`
- But when calling Midjourney, the code passes `settings` which contains only ONE `styleRefUrl`
- This means ALL Midjourney requests use the same style reference URL (probably from the first or last uploaded image)

**Location of the bug:** `App.tsx` lines 866-882

```typescript
const base64Urls = await generateFunction(
  selectedTheme, 
  settings,  // ❌ PROBLEM: This contains only ONE styleRefUrl
  settings.parametersForMJ,
  settings.aspectRatio || '1:1',
  settings.midjourneyMode || 'fast',
  (status) => { ... },
  requestIdx,
  generatedPrompts[requestIdx * 4]
) as string[];
```

### 3. What Should Happen

When 6 images are uploaded and 36 generations are requested:
- Each image should be used 6 times (36 / 6 = 6)
- Each Midjourney request should use the style reference URL from the corresponding uploaded image
- Request 1-6 should use `uploadedImages[0].styleRefUrl`
- Request 7-12 should use `uploadedImages[1].styleRefUrl`
- And so on...

### 4. Current Midjourney API Call Format

**GoAPI Endpoint:** `POST https://api.goapi.ai/mj/v2/imagine`

**Request Body:**
```json
{
  "prompt": "PRIMARY SUBJECT: elegant deer portrait. [description]... --sref https://example.com/image1.png --sw 30 --sv 2 --c 5 --ar 3:4",
  "aspect_ratio": "3:4",
  "process_mode": "fast",
  "skip_prompt_check": true,
  "webhook_endpoint": "",
  "webhook_secret": "",
  "notify_progress": true
}
```

**Current Prompt Format:**
```
[ChatGPT-generated prompt text] --sref [SINGLE URL FROM SETTINGS] --sw 30 --sv 2 --c 5 --ar 3:4
```

**What it SHOULD be:**
```
[ChatGPT-generated prompt text] --sref [IMAGE-SPECIFIC URL] --sw 30 --sv 2 --c 5 --ar 3:4
```

### 5. Parameters Being Used

- `--sref`: Style reference URL (currently using single URL from settings)
- `--sw 30` or `--sw 55`: Style weight (30 = moderate, 55 = higher influence)
- `--sv 2` or `--sv 3`: Style variation (2 = moderate, 3 = higher variation)
- `--c 5`: Chaos parameter (always 5)
- `--ar 3:4`: Aspect ratio (added last)

**Strategy Distribution:**
- 60% of requests: `--sref [URL] --sw 30 --sv 2 --c 5`
- 20% of requests: `--sref [URL] --sw 55 --sv 3 --c 5`
- 20% of requests: No `--sref` (omitted entirely)

### 6. The Fix Needed

**In `App.tsx`**, when calling `generateFunction` for Midjourney, we need to:

1. Determine which uploaded image corresponds to this request
2. Get the `styleRefUrl` from that specific image
3. Create a modified `settings` object with the image-specific `styleRefUrl`
4. Pass this modified settings to `generateFunction`

**Example fix:**
```typescript
// Determine which image to use for this request
const usesPerImage = uploadedImages.length > 0 ? Math.floor(total / uploadedImages.length) : 0;
const requestsPerImage = uploadedImages.length > 0 ? Math.floor(requestsNeeded / uploadedImages.length) : 0;
const imageIndex = requestsPerImage > 0 
  ? Math.floor(requestIdx / requestsPerImage) % uploadedImages.length
  : requestIdx % uploadedImages.length;

// Get image-specific style reference URL
const imageStyleRefUrl = uploadedImages[imageIndex]?.styleRefUrl;

// Create modified settings with image-specific styleRefUrl
const imageSpecificSettings = {
  ...settings,
  styleRefUrl: imageStyleRefUrl || settings.styleRefUrl
};

// Use image-specific settings
const base64Urls = await generateFunction(
  selectedTheme, 
  imageSpecificSettings,  // ✅ FIXED: Now uses image-specific styleRefUrl
  settings.parametersForMJ,
  settings.aspectRatio || '1:1',
  settings.midjourneyMode || 'fast',
  (status) => { ... },
  requestIdx,
  generatedPrompts[requestIdx * 4]
) as string[];
```

### 7. Verification

To verify the fix is working, check the console logs:
- Look for: `[Midjourney] Added style reference (Moderate: --sw 30 --sv 2) for variation X: [URL]`
- The URL should change based on which uploaded image is being used
- Each image's styleRefUrl should appear in the logs for its corresponding requests

