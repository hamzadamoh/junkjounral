# Midjourney Prompt Package Generator

This module provides a Midjourney-optimized prompt generation system that produces compact, deterministic prompt packages for use with Midjourney's `/imagine` command.

## Overview

The `generateMJPackage` function analyzes uploaded images (or themes) and returns a structured JSON package containing:
- Subject suggestion
- Style tokens (composable, short phrases)
- Palette tokens (color names)
- Minimal subject prompt (no style descriptors)
- Pre-formatted Midjourney flags

## Usage

### Basic Example

```typescript
import { generateMJPackage } from './services/chatgptService';

// From image analysis
const imageAnalysis = await analyzeReferenceImage(base64Image);
const package = await generateMJPackage(
  imageAnalysis,
  42,        // batch_seed
  3,         // variation_index
  'https://cdn.example.com/style-ref.jpg', // sref_url (optional)
  'openai'   // promptService
);

// Or from theme string
const package = await generateMJPackage(
  'Winter collection',
  100,       // batch_seed
  1,         // variation_index
  null,      // no sref_url
  'openai'
);
```

### Using the Output

The generated package contains everything needed to construct a Midjourney `/imagine` command:

```typescript
// Full Midjourney command:
const fullCommand = `/imagine prompt: ${package.mj_prompt} ${package.mj_flags}`;

// Example output:
// /imagine prompt: Majestic stag portrait, three-quarter view --ref "hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal" --sref https://cdn.example.com/uploads/fire_base.jpg --sref-weight 0.7 --seed 42003 --stylize 50 --chaos 10
```

### Package Schema

```typescript
interface MJPackage {
  subject_suggestion: string;    // 2-6 words
  style_tokens: string;           // 3-6 comma-separated tokens
  palette_tokens: string;        // 2-5 comma-separated colors
  sref_url: string | null;        // Style reference URL or null
  batch_seed: number;             // Batch seed
  variation_index: number;        // Variation number
  mj_prompt: string;              // Subject-only prompt (8-12 words)
  mj_ref: string;                 // Combined style + palette for --ref
  mj_flags: string;               // Full flags string ready to append
}
```

## Seed Calculation

The Midjourney seed is computed deterministically:
```
SEED = batch_seed * 1000 + variation_index
```

Example:
- `batch_seed = 42`, `variation_index = 3` → `SEED = 42003`
- `batch_seed = 100`, `variation_index = 1` → `SEED = 100001`

## Flags Configuration

Default flags included:
- `--ref "<style_tokens>, <palette_tokens>"` (always included)
- `--sref <url> --sref-weight 0.7` (if sref_url provided)
- `--seed <computed_seed>`
- `--stylize 50`
- `--chaos 10`

You can customize these by calling `formatMJFlags` directly:

```typescript
import { formatMJFlags } from './services/chatgptService';

const flags = formatMJFlags(
  mj_ref,
  sref_url,
  seed,
  75,    // stylize (default: 50)
  0.9,   // sref_weight (default: 0.7)
  20     // chaos (default: 10)
);
```

## Validation

The system automatically validates that `mj_prompt` contains no style tokens. If style words are detected in the subject prompt, an error is thrown to ensure clean separation between subject and style.

## Integration Notes

1. **Style Reference URLs**: Ensure uploaded reference images are publicly accessible (CDN) before passing as `sref_url`.

2. **Backwards Compatibility**: The old verbose prompt generator remains available for non-Midjourney backends. The new system is used when `imageService === 'midjourney'` or similar.

3. **Temperature**: The LLM uses `temperature: 0.2` for deterministic style and palette outputs.

4. **Token Limit**: Limited to 200 tokens for compact, focused outputs.

## Examples

### Example A: With Style Reference

```json
{
  "subject_suggestion": "majestic stag portrait",
  "style_tokens": "hand-drawn ink & watercolor, vintage collage, warm glow",
  "palette_tokens": "amber, burnt sienna, charcoal",
  "sref_url": "https://cdn.example.com/uploads/fire_base.jpg",
  "batch_seed": 42,
  "variation_index": 3,
  "mj_prompt": "Majestic stag portrait, three-quarter view",
  "mj_ref": "hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal",
  "mj_flags": "--ref \"hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal\" --sref https://cdn.example.com/uploads/fire_base.jpg --sref-weight 0.7 --seed 42003 --stylize 50 --chaos 10"
}
```

### Example B: Without Style Reference

```json
{
  "subject_suggestion": "birch forest path",
  "style_tokens": "watercolor wash, delicate ink linework, paper grain",
  "palette_tokens": "icy teal, frost blue, soft gray",
  "sref_url": null,
  "batch_seed": 100,
  "variation_index": 1,
  "mj_prompt": "Birch forest path, winding into distance",
  "mj_ref": "watercolor wash, delicate ink linework, paper grain, icy teal, frost blue, soft gray",
  "mj_flags": "--ref \"watercolor wash, delicate ink linework, paper grain, icy teal, frost blue, soft gray\" --seed 100001 --stylize 50 --chaos 10"
}
```

