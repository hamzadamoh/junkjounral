# Midjourney Prompt Package System

## Overview

The Midjourney Prompt Package Generator produces deterministic, validated prompt packages for Midjourney image generation with two distinct UI modes:

### Custom Theme Mode
- User uploads a style reference image
- Image is uploaded to CDN and the CDN URL is included as `--sref <url>` in the Midjourney request
- Uses `--sref-weight 0.7` (default) to control style influence
- The generated prompt is subject-only, relying on the style reference for visual style

### Image Theme Expansion Mode
- User uploads an image for theme extraction
- ChatGPT analyzes the image and generates detailed prompts with style descriptions
- **No `--sref` parameter is included** - relies solely on the detailed prompt text
- Each variation has a different subject but maintains the same detected style/vibe

## MJPackage Schema

```typescript
interface MJPackage {
  subject_suggestion: string;    // 2-6 words
  style_tokens: string;          // 3-6 comma-separated tokens
  palette_tokens: string;        // 2-5 comma-separated colors
  sref_url: string | null;       // Style reference URL (Custom Theme) or null (Image Theme Expansion)
  batch_seed: number;            // Batch seed for deterministic generation
  variation_index: number;       // Variation number (0-based)
  mj_prompt: string;             // Subject-only prompt (8-12 words, no style tokens)
  mj_ref: string;                // Combined style_tokens + palette_tokens
  mj_flags: string;              // Formatted Midjourney flags string
}
```

## Seed Calculation

Deterministic seed: `finalSeed = batch_seed * 1000 + variation_index`

This ensures variations within the same batch share the same base seed while maintaining uniqueness.

## Validation

- `mj_prompt` must not contain any words from `style_tokens` (word-boundary matching)
- `sref_url` must be a valid HTTPS URL if provided
- `variation_index` must be a non-negative integer
- All style/palette tokens are normalized (trimmed, deduplicated, `&` → `and`)

