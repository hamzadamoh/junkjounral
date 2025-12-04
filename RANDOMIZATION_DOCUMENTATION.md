# Randomization System Documentation

## Overview

The randomization system ensures **consistent style** across a batch while maintaining **diverse content** for each variation. It separates "Style" (artistic technique, color palette) from "Content" (subject focus, viewing angle, composition).

---

## Architecture: Two-Layer System

### Layer 1: Style Selection (Fixed for Batch)
- **Purpose**: Ensures all images in a batch share the same artistic style
- **Seed**: `styleSeed = 1` (always fixed)
- **When Applied**: Only in `Custom / Override` mode
- **What It Randomizes**:
  - Art Technique (e.g., "Watercolor", "Vector Illustration")
  - Color Palette (e.g., "Soft Pastels", "Natural & Organic")

### Layer 2: Content Selection (Varies per Variation)
- **Purpose**: Ensures each image has unique composition/subject
- **Seed**: `contentSeed = variationNumber` (changes for each image)
- **When Applied**: ALL modes (Muted, Normal, Colorful, Multicolored, Custom)
- **What It Randomizes**:
  - Visual Focus (e.g., "Single Hero Object", "Wide Atmospheric Scene")
  - Viewing Angle (e.g., "Top-Down / Flat Lay", "Macro Close-Up")

---

## Current Implementation

### Code Location
`services/chatgptService.ts` - Lines 138-181

### Style Selection (Lines 138-171)

```typescript
const styleSeed = 1; // Fixed seed for style selection
let styleInstruction = '';

if (colorIntensity === 'Custom / Override') {
  if (customArtStyle && customArtStyle.trim()) {
    // User provided custom art style - use ONLY their text
    styleInstruction = `STYLE: Follow this custom art style: "${customArtStyle.trim()}".`;
  } else {
    // No custom art style - pick random tech and palette ONCE using fixed seed
    const randomTech = artTechniques[Math.floor((styleSeed * 31 + styleSeed * 13) % artTechniques.length)];
    const randomPalette = palettes[Math.floor((styleSeed * 37 + styleSeed * 19) % palettes.length)];
    styleInstruction = `STYLE: ${randomTech} technique. Color Palette: ${randomPalette}.`;
  }
}
```

**Formula**: `Math.floor((seed * multiplier1 + seed * multiplier2) % array.length)`

**Example**:
- `styleSeed = 1`
- `randomTech = artTechniques[Math.floor((1 * 31 + 1 * 13) % 12)]`
- `randomTech = artTechniques[Math.floor(44 % 12)]`
- `randomTech = artTechniques[8]` = "Charcoal Sketch"

**Problem**: Since `styleSeed` is always `1`, the same technique and palette are selected every time. This is intentional for consistency, but means every batch will have the same style.

---

### Content Selection (Lines 173-181)

```typescript
const contentSeed = variationNumber; // Changes per variation
const randomFocus = subjectFocus[Math.floor((contentSeed * 17 + contentSeed * 7) % subjectFocus.length)];
const randomAngle = cameraAngles[Math.floor((contentSeed * 23 + contentSeed * 11) % cameraAngles.length)];
```

**Formula**: `Math.floor((variationNumber * multiplier1 + variationNumber * multiplier2) % array.length)`

**Example for Variation 1**:
- `contentSeed = 1`
- `randomFocus = subjectFocus[Math.floor((1 * 17 + 1 * 7) % 8)]`
- `randomFocus = subjectFocus[Math.floor(24 % 8)]`
- `randomFocus = subjectFocus[0]` = "Single Hero Object (Central)"

**Example for Variation 2**:
- `contentSeed = 2`
- `randomFocus = subjectFocus[Math.floor((2 * 17 + 2 * 7) % 8)]`
- `randomFocus = subjectFocus[Math.floor(48 % 8)]`
- `randomFocus = subjectFocus[0]` = "Single Hero Object (Central)" ⚠️ **SAME AS VARIATION 1!**

**Problem**: The formula can produce the same index for different variation numbers, especially with small arrays.

---

## Arrays Used

### Content Arrays (All Modes)

**`subjectFocus`** (8 options):
1. "Single Hero Object (Central)"
2. "Wide Atmospheric Scene"
3. "Macro Detail/Texture"
4. "Knolling (Flat Lay of multiple items)"
5. "Asymmetrical Corner Composition"
6. "Pattern-Focused (No central object)"
7. "Collage of Scattered Elements"
8. "Framed Vignette"

**`cameraAngles`** (5 options):
1. "Top-Down / Flat Lay"
2. "Straight-On Front View"
3. "Macro Close-Up"
4. "Isometric Angle"
5. "Dutch Angle (Dynamic tilt)"

### Style Arrays (Custom Mode Only)

**`artTechniques`** (12 options):
1. "Watercolor"
2. "Vector Illustration"
3. "Etching"
4. "Gouache"
5. "Ink Drawing"
6. "Digital Painting"
7. "Linocut"
8. "Screen Print"
9. "Charcoal Sketch"
10. "Pastel Drawing"
11. "Acrylic Paint"
12. "Oil Painting"

**`palettes`** (12 options):
1. "Soft Pastels"
2. "Natural & Organic"
3. "Vintage Muted"
4. "Watercolor Wash"
5. "Earth Tones"
6. "Botanical Greenery"
7. "Monochromatic"
8. "Faded & Nostalgic"
9. "Warm Neutrals"
10. "Cool & Frosty"
11. "Classic Elegant"
12. "Desaturated"

---

## Variation Instructions (Modulo Rotation)

### Custom / Override Mode (Lines 269-294)

```typescript
const variationInstructions = [
  'Explore a DIFFERENT time of day...',
  'Create a DIFFERENT composition...',
  'Focus on DIFFERENT elements...',
  // ... 12 total instructions
];

const variationInstruction = variationInstructions[(variationNumber - 1) % variationInstructions.length];
```

**How It Works**:
- Variation 1: Uses instruction 0
- Variation 2: Uses instruction 1
- Variation 13: Uses instruction 0 again (cycles back)

**Problem**: After 12 variations, instructions repeat. This can cause similar prompts.

---

## Identified Issues

### Issue 1: Content Selection Collisions
**Problem**: The formula `(variationNumber * 17 + variationNumber * 7) % 8` can produce the same index for different variation numbers.

**Example**:
- Variation 1: `(1 * 17 + 1 * 7) % 8 = 24 % 8 = 0`
- Variation 2: `(2 * 17 + 2 * 7) % 8 = 48 % 8 = 0` ⚠️ **SAME!**
- Variation 3: `(3 * 17 + 3 * 7) % 8 = 72 % 8 = 0` ⚠️ **SAME!**

**Root Cause**: The multipliers (17, 7) are not prime relative to the array length (8), causing collisions.

### Issue 2: Modulo Rotation Repetition
**Problem**: Variation instructions cycle every 12 variations, causing repetition in large batches.

**Example**:
- Variations 1-12: Unique instructions
- Variation 13: Same as Variation 1
- Variation 14: Same as Variation 2

### Issue 3: Style Seed Always Fixed
**Problem**: `styleSeed = 1` means every batch gets the same style (unless user provides `customArtStyle`).

**Impact**: If generating multiple batches, they'll all have the same technique/palette.

---

## Current Behavior Examples

### Example 1: Generating 4 Images (Custom Mode, No customArtStyle)

**Style Selection** (Fixed):
- `styleSeed = 1`
- `randomTech = artTechniques[8]` = "Charcoal Sketch"
- `randomPalette = palettes[4]` = "Earth Tones"
- **Result**: All 4 images use "Charcoal Sketch" + "Earth Tones"

**Content Selection** (Varies):
- Variation 1: `randomFocus = subjectFocus[0]` = "Single Hero Object"
- Variation 2: `randomFocus = subjectFocus[0]` = "Single Hero Object" ⚠️ **SAME!**
- Variation 3: `randomFocus = subjectFocus[0]` = "Single Hero Object" ⚠️ **SAME!**
- Variation 4: `randomFocus = subjectFocus[0]` = "Single Hero Object" ⚠️ **SAME!**

**Result**: All 4 images have the same focus, causing repetition.

### Example 2: Generating 12 Images (Normal Mode)

**Content Selection**:
- Variations 1-8: May have collisions (same focus/angle)
- Variations 9-12: May repeat earlier selections

**Variation Instructions**:
- Variations 1-12: Each gets a unique instruction
- Variation 13: Cycles back to instruction 0

---

## Recommendations for Fix

### Fix 1: Improve Content Selection Formula
**Current**: `(variationNumber * 17 + variationNumber * 7) % array.length`
**Better**: Use a hash function or better prime multipliers

**Option A - Hash Function**:
```typescript
const hash = (seed: number, arrayLength: number) => {
  return ((seed * 2654435761) % (2 ** 32)) % arrayLength;
};
const randomFocus = subjectFocus[hash(variationNumber, subjectFocus.length)];
```

**Option B - Better Prime Multipliers**:
```typescript
// Use primes that are coprime with array length
const randomFocus = subjectFocus[Math.floor((variationNumber * 17 + variationNumber * 19) % subjectFocus.length)];
```

### Fix 2: Add Random Offset to Style Seed
**Current**: `styleSeed = 1` (always same)
**Better**: Generate a random seed once per batch, store it, reuse it

```typescript
// Generate once at batch start
const batchStyleSeed = Math.floor(Math.random() * 1000);
// Use in all variations
const randomTech = artTechniques[Math.floor((batchStyleSeed * 31 + batchStyleSeed * 13) % artTechniques.length)];
```

### Fix 3: Expand Variation Instructions
**Current**: 12 instructions (cycles every 12)
**Better**: Add more instructions or use a combination system

```typescript
// Combine multiple instruction types
const timeInstructions = [...];
const compositionInstructions = [...];
const elementInstructions = [...];
// Pick one from each category based on variationNumber
```

### Fix 4: Track Used Selections
**Current**: No tracking of what was used
**Better**: Track used focus/angle combinations and avoid repeats

```typescript
const usedCombinations = new Set();
let attempts = 0;
let randomFocus, randomAngle;
do {
  randomFocus = subjectFocus[hash(variationNumber + attempts, subjectFocus.length)];
  randomAngle = cameraAngles[hash(variationNumber + attempts, cameraAngles.length)];
  attempts++;
} while (usedCombinations.has(`${randomFocus}-${randomAngle}`) && attempts < 10);
usedCombinations.add(`${randomFocus}-${randomAngle}`);
```

---

## Summary

**Current System**:
- ✅ Style consistency across batch (intended)
- ❌ Content collisions (same focus/angle for different variations)
- ❌ Style seed always same (no variety between batches)
- ❌ Instruction cycling (repeats after 12 variations)

**Main Problem**: The content selection formula produces collisions, causing multiple variations to have the same visual focus and viewing angle, leading to repetitive images.

