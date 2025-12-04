# Complete Prompt Documentation

This document contains ALL prompts used in the project, organized by component and mode.

---

## 1. GLOBAL CONTENT VARIABLES (Applied to ALL Modes)

These ensure variety in WHAT is shown, regardless of style:

### Subject Focus (8 types):
```javascript
const subjectFocus = [
  "Single Hero Object (Central)",
  "Wide Atmospheric Scene",
  "Macro Detail/Texture",
  "Knolling (Flat Lay of multiple items)",
  "Asymmetrical Corner Composition",
  "Pattern-Focused (No central object)",
  "Collage of Scattered Elements",
  "Framed Vignette"
];
```

### Camera Angles (5 types):
```javascript
const cameraAngles = [
  "Top-Down / Flat Lay",
  "Straight-On Front View",
  "Macro Close-Up",
  "Isometric Angle",
  "Dutch Angle (Dynamic tilt)"
];
```

---

## 2. STYLE VARIABLES (Applied ONLY to Custom Mode when customArtStyle is EMPTY)

**IMPORTANT**: These are only used when the user has NOT provided a `customArtStyle` input. If `customArtStyle` has text, the system uses ONLY the user's text and does NOT inject random techniques or palettes.

### Art Techniques (12 types):
```javascript
const artTechniques = [
  "Watercolor",
  "Vector Illustration",
  "Etching",
  "Gouache",
  "Ink Drawing",
  "Digital Painting",
  "Linocut",
  "Screen Print",
  "Charcoal Sketch",
  "Pastel Drawing",
  "Acrylic Paint",
  "Oil Painting"
];
```

### Color Palettes (12 types):
```javascript
const palettes = [
  "Pastel & Soft",
  "Vintage & Muted",
  "Monochromatic (Single Color Family)",
  "Earth Tones & Natural",
  "Cool & Frosty (Blues/Whites/Greys)",
  "Warm & Cozy (Ambers/Creams/Golds)",
  "Desaturated & Moody",
  "Soft Watercolor Wash",
  "Classic & Elegant",
  "Sepia & Nostalgic",
  "Botanical & Organic (Greens/Browns)",
  "Neutral & Minimalist"
];
```

**Note**: These palettes are curated to be softer, more artistic, and suitable for high-quality illustrations. Aggressive options like "Neon", "Vibrant", and "High Contrast" have been removed to ensure the randomizer always defaults to usable, professional color schemes when `customArtStyle` is empty.

**Logic**:
- **IF `customArtStyle` has text**: Use ONLY the user's text → `STYLE: Follow this custom art style: "${customArtStyle.trim()}".`
- **IF `customArtStyle` is empty**: Use random technique and palette → `STYLE: ${randomTech} technique. Color Palette: ${randomPalette}.`

---

## 3. CHATGPT SYSTEM PROMPTS

### 3.1 Custom / Override Mode
```
You are a versatile AI Art Director. Your goal is to generate image prompts based EXACTLY on the user's provided Theme and Style description.

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

- Do NOT default to 'vintage', 'grunge', or 'junk journal' unless explicitly asked.
- Do NOT default to 'modern' or 'flat' unless explicitly asked.
- If the user provides a 'Custom Art Style', follow it rigorously.
- If no style is provided, generate a high-quality, artistic representation of the Theme.

🎨 COLOR LOGIC: Unless the user explicitly uses words like 'Vibrant', 'Neon', 'Bright', or 'Saturated', you MUST default to a **Soft, Natural, or Muted** color palette. Avoid oversaturation. Prioritize artistic, tasteful, and printable colors over intense digital hues.
```

### 3.2 Multicolored Mode
```
You are a creative prompt engineer specializing in MODERN, VIVID, COLORFUL illustration descriptions. 

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

🚨 CRITICAL RULES - YOU MUST FOLLOW THESE:
1. NEVER use: "aged", "antique", "vintage", "distressed", "old", "worn", "junk journal", "journal page"
2. NEVER use: "handwritten", "cursive", "letters", "postage stamps", "ephemera", "sepia", "muted", "faded"
3. ALWAYS start prompts with: "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..."
4. ALWAYS describe: modern, fresh, vibrant, colorful, vivid, bright, alive illustrations
5. If you use ANY vintage/junk journal words, you have FAILED the task

Generate prompts for MODERN, VIVID, COLORFUL illustrations - modern watercolor style, vibrant colors, fresh and lively, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT sepia, NOT muted. Think modern, fresh, vibrant, colorful, alive, vivid watercolor illustrations.
```

### 3.3 Muted / Normal / Colorful Modes (Vintage Junk Journal)
```
You are a creative prompt engineer specializing in VINTAGE JUNK JOURNAL page descriptions. 

🎯 PRIMARY GOAL: DIVERSITY. Your primary goal is DIVERSITY. Never output the same subject or composition twice in a row. Explore the entire breadth of the provided Theme.

CRITICAL: Generate prompts for VINTAGE, AGED, ANTIQUE-STYLE junk journal pages - NOT modern digital art, NOT bright watercolor illustrations, NOT clean modern designs, NOT photorealistic, NOT realistic photography. The output must look like an old, worn, vintage journal page with aged paper, distressed textures, muted sepia/brown tones, and handwritten script. Think antique, vintage, aged, distressed, worn, sepia-toned, muted colors, illustrated style, artistic rendering, NOT realistic.
```

---

## 4. CHATGPT USER PROMPTS

### 4.1 Custom / Override Mode User Prompt
```
Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} illustration.

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus} ⚠️ THIS DETERMINES THE IMAGE STRUCTURE
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription} (Use theme elements, but structure follows VISUAL FOCUS)

${styleInstruction}
```

**Note on `${styleInstruction}`**:
- **IF `customArtStyle` has text**: `${styleInstruction}` = `STYLE: Follow this custom art style: "${customArtStyle.trim()}".` (Uses ONLY user's text)
- **IF `customArtStyle` is empty**: `${styleInstruction}` = `STYLE: ${randomTech} technique. Color Palette: ${randomPalette}.` (Uses random selection for diversity)

🎯 STRUCTURE HIERARCHY: VISUAL FOCUS > THEME DESCRIPTION
The VISUAL FOCUS defines the COMPOSITION STRUCTURE. The Theme provides the CONTENT ELEMENTS to fill that structure.

INSTRUCTION: Create the assigned VISUAL FOCUS structure, then incorporate theme elements appropriately:
- If Focus is 'Single Hero Object (Central)': Create an ISOLATED central element (ephemera-style). Use theme elements to design this single object, NOT as background. Even if theme suggests "pattern", create a distinct focal object.
- If Focus is 'Wide Atmospheric Scene': Show a broader landscape/environment view using theme elements.
- If Focus is 'Macro Detail/Texture': Show a close-up of intricate details, textures, or patterns. This is the ONLY focus that allows full-page texture/pattern.
- If Focus is 'Knolling (Flat Lay of multiple items)': Arrange multiple theme-related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition': Place the main subject in a corner with negative space. Use theme elements to create the corner element, NOT background.
- If Focus is 'Pattern-Focused (No central object)': Create a repeating pattern or texture without a central focal point. This is the ONLY focus that allows full-page repeating patterns.
- If Focus is 'Collage of Scattered Elements': Arrange various theme elements scattered across the page in a collage style.
- If Focus is 'Framed Vignette': Show a scene or object within a decorative frame or border. Use theme elements inside the frame, NOT as background pattern.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.

🚨 HIERARCHY RULE - VISUAL FOCUS OVERRIDES THEME:
The VISUAL FOCUS determines the STRUCTURE and COMPOSITION of the image, NOT the Theme Description.
- If VISUAL FOCUS is 'Single Hero Object (Central)': The image MUST have an isolated central element as the primary subject, even if the Theme suggests patterns or backgrounds. Use theme elements to create a distinct focal point, NOT a background pattern.
- If VISUAL FOCUS is 'Framed Vignette': The image MUST show a scene or object within a decorative frame or border. Use theme elements to create the framed content, NOT a repeating background.
- If VISUAL FOCUS is 'Pattern-Focused (No central object)': THEN you may create a full-page repeating pattern or texture using the theme elements.
- If VISUAL FOCUS is 'Macro Detail/Texture': THEN you may create a close-up texture or pattern detail.
- For ALL OTHER FOCUS TYPES: Do NOT generate a full-page background pattern, even if the Theme contains "Pattern" or "Background". Instead, use the theme elements to create the assigned focus structure (e.g., isolated element, framed scene, corner composition, etc.).

🚨 ANTI-REPETITION RULE:
If the Theme Description contains words like "Pattern", "Background", "Texture", or "Seamless":
- ONLY generate a full-page repeating pattern/texture if VISUAL FOCUS is 'Pattern-Focused (No central object)' or 'Macro Detail/Texture'.
- For all other VISUAL FOCUS types (Single Hero Object, Framed Vignette, Asymmetrical Corner, Knolling, Collage, Wide Scene): Use the theme elements to create a DISTINCT focal point, isolated element, framed composition, or specific arrangement - NOT a background pattern.

🎨 DESIGN KIT GENERATION GOAL:
You are creating a "Design Kit" that contains a MIX of different types of elements:
- Some variations should be full-page backgrounds/textures (only when Focus is Pattern-Focused or Macro Detail)
- Some variations should be isolated elements/ephemera (when Focus is Single Hero Object, Framed Vignette, or Asymmetrical Corner)
- Some variations should be frames or borders (when Focus is Framed Vignette)
- Some variations should be compositions with multiple items (when Focus is Knolling or Collage)
- The goal is VARIETY - not all variations should be the same type of element.

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

Create a flat, printable page design suitable for digital use. NO 3D objects, NO depth, NO shadows, NO realistic lighting (unless the style requires it). Top-down view, flat illustration style (unless the style specifies otherwise).

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

Create a DISTINCT and UNIQUE design that follows the VISUAL FOCUS structure while incorporating the ${themeDescription} theme elements appropriately. 2-3 sentences. Return ONLY the prompt description.
```

### 4.2 Multicolored Mode User Prompt
```
Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} MODERN WATERCOLOR ILLUSTRATION. 

🚨 CRITICAL: This is a MODERN, VIVID, COLORFUL watercolor illustration - NOT a journal page, NOT vintage, NOT antique, NOT junk journal.

🚨 MANDATORY: Your prompt MUST start with one of these exact phrases:
- "A vivid, modern watercolor illustration of..."
- "A colorful watercolor painting depicting..."
- "A fresh, lively watercolor illustration showing..."
- "A bright, vibrant watercolor artwork featuring..."

🚨 FORBIDDEN STARTS - DO NOT START WITH:
❌ "Visualize an aged..." 
❌ "Craft a vintage..."
❌ "Imagine a... junk journal page"
❌ "Create an antique-style..."
❌ ANY phrase containing: aged, antique, vintage, junk journal, journal page

This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus}
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription}

STYLE: Modern Watercolor Illustration. Vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues). Fresh and lively, clean modern design. NOT vintage, NOT aged, NOT distressed, NOT junk journal style.

INSTRUCTION: Depict the Theme '${themeDescription}' using the assigned VISUAL FOCUS.
- If Focus is 'Single Hero Object (Central)', show a prominent central subject (e.g., a single flower, a key, a skull, a character).
- If Focus is 'Wide Atmospheric Scene', show a broader landscape or environment view.
- If Focus is 'Macro Detail/Texture', show a close-up of intricate details, textures, or patterns.
- If Focus is 'Knolling (Flat Lay of multiple items)', arrange multiple related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition', place the main subject in a corner with negative space.
- If Focus is 'Pattern-Focused (No central object)', create a repeating pattern or texture without a central focal point.
- If Focus is 'Collage of Scattered Elements', arrange various elements scattered across the page.
- If Focus is 'Framed Vignette', show a scene or object within a decorative frame or border.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.

${variationControl}

Style: ${pageStyle}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

ABSOLUTELY FORBIDDEN WORDS AND PHRASES - DO NOT USE ANY OF THESE:
❌ "vintage", "antique", "aged", "distressed", "old", "worn", "weathered"
❌ "journal page", "junk journal", "scrapbook page", "journal entry"
❌ "handwritten", "cursive script", "letters", "writing", "poem", "verses", "entries"
❌ "postage stamps", "vintage ephemera", "botanical illustrations", "ticket stubs", "seals"
❌ "sepia", "muted", "coffee-stained", "tea-stained", "parchment", "aged paper"
❌ "faded", "distressed texture", "antique-style", "vintage-style", "old-world"
❌ "nostalgic", "wistful", "memory", "echoed memory", "past", "reminiscing"

EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style.

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}". Remember: MODERN, VIVID, COLORFUL watercolor illustration - NOT vintage, NOT journal page.` : ''}

🚨 FINAL CHECKLIST - Before returning your prompt, verify:
1. ✅ Does it start with "A vivid, modern..." or "A colorful watercolor..."? 
2. ❌ Does it contain ANY of these words: aged, antique, vintage, junk journal, journal page, handwritten, sepia, muted, faded, postage stamps, ephemera? If YES, rewrite it completely.
3. ✅ Is it describing a modern, colorful illustration with vibrant colors?

Create a DISTINCT and UNIQUE MODERN WATERCOLOR ILLUSTRATION prompt. Start with "A vivid, modern watercolor illustration..." or "A colorful watercolor painting..." - describe it as a pure, modern, colorful watercolor painting of ${themeDescription} with vibrant colors. DO NOT mention journal, vintage, antique, stamps, handwritten text, or any vintage elements. 2-3 sentences. Return ONLY the prompt description.
```

### 4.3 Muted / Normal / Colorful Modes User Prompt
```
Create a UNIQUE and DISTINCT prompt for variation #${variationNumber} of a ${themeDescription} junk journal page. 

CRITICAL: This variation must be DIFFERENT from all previous variations. Avoid repeating the same subject, composition, or visual elements. Each variation should explore the ${themeDescription} theme in a fresh, unique way.

VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus}
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription}

${styleInstruction}

INSTRUCTION: Depict the Theme '${themeDescription}' using the assigned VISUAL FOCUS.
- If Focus is 'Single Hero Object (Central)', show a prominent central subject (e.g., a single flower, a key, a skull, a character).
- If Focus is 'Wide Atmospheric Scene', show a broader landscape or environment view.
- If Focus is 'Macro Detail/Texture', show a close-up of intricate details, textures, or patterns.
- If Focus is 'Knolling (Flat Lay of multiple items)', arrange multiple related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition', place the main subject in a corner with negative space.
- If Focus is 'Pattern-Focused (No central object)', create a repeating pattern or texture without a central focal point.
- If Focus is 'Collage of Scattered Elements', arrange various elements scattered across the page.
- If Focus is 'Framed Vignette', show a scene or object within a decorative frame or border.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.

${variationControl}

Style: ${pageStyle}. Texture: ${textureIntensity}. ${elements.length > 0 ? `Elements: ${elements.join(', ')}.` : ''} ${includeFrames ? 'Include frames. ' : ''}${includeBorders ? 'Include borders. ' : ''}

CRITICAL REQUIREMENTS FOR VINTAGE JUNK JOURNAL AESTHETIC:
- VINTAGE, AGED, ANTIQUE appearance - must look old and worn
- ILLUSTRATED/ARTISTIC STYLE: stylized illustration, artistic rendering, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic
${colorIntensity === 'Muted' 
  ? '- MUTED COLORS ONLY: sepia tones, browns, creams, faded colors, coffee-stained look, NOT bright vibrant colors'
  : colorIntensity === 'Normal'
  ? '- NORMAL COLORS: deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, normal color saturation, gothic/vintage aesthetic'
  : '- COLORFUL VINTAGE PALETTE: rich, vibrant colors (reds, blues, greens, purples, yellows) while maintaining vintage aesthetic, aged paper texture, and antique feel - colors should be vibrant but with vintage charm, NOT modern bright colors, NOT neon colors'}
- AGED PAPER texture: distressed, tea-stained, worn edges, vintage paper texture
- HANDWRITTEN SCRIPT OVERLAYS: extensive cursive handwritten text overlaying the design, like old letters or journal entries, faded brown/sepia ink, flowing script, multiple layers of text
- VINTAGE EPHEMERA: include postage stamps, vintage labels, old tickets, faded botanical illustrations, floral patterns, sheet music notation, vintage seals or stamps
- COLLAGE STYLE: layered paper scraps, vintage ephemera, mixed media collage elements - the page should look like a real junk journal page with multiple layers
- MIXED MEDIA: combine the main illustration with handwritten text, stamps, floral patterns, and other vintage elements all layered together
- FLAT printable page design (like a vintage scrapbook page)
- NO modern watercolor illustrations, NO clean digital art
- NO photorealistic rendering, NO realistic photography, NO hyper-realistic details
- NO 3D objects, NO depth, NO shadows, NO realistic lighting
- NO still life compositions, NO objects placed around the page
- Top-down view, flat illustration style, artistic rendering
- Think of it as an illustrated, artistic rendering of an old, worn vintage journal page with handwritten text overlays, stamps, and ephemera - like a real junk journal page, stylized, NOT realistic
- EACH VARIATION MUST BE VISUALLY DISTINCT with unique composition, subject matter, color scheme, and visual style

${customThemePrompt && customThemePrompt.trim() ? `IMPORTANT: Incorporate the custom theme elements: "${customThemePrompt.trim()}" into the design naturally, but create a DIFFERENT interpretation each time. Explore different aspects, subjects, or elements related to "${customThemePrompt.trim()}".` : ''}

Create a DISTINCT and UNIQUE design with specific visual details, colors, mood, composition, and style that naturally differs from other variations. 2-3 sentences. Return ONLY the prompt description (without adding "flat" or "printable" again - I'll add those constraints separately).
```

---

## 5. VARIATION SPECIFICS TEMPLATE

This is injected into ALL user prompts:

```
VARIATION SPECIFICS (Image ${variationNumber}):
- VISUAL FOCUS: ${randomFocus}
- VIEWING ANGLE: ${randomAngle}
- THEME: ${themeDescription}

${styleInstruction}

INSTRUCTION: Depict the Theme '${themeDescription}' using the assigned VISUAL FOCUS.
- If Focus is 'Single Hero Object (Central)', show a prominent central subject (e.g., a single flower, a key, a skull, a character).
- If Focus is 'Wide Atmospheric Scene', show a broader landscape or environment view.
- If Focus is 'Macro Detail/Texture', show a close-up of intricate details, textures, or patterns.
- If Focus is 'Knolling (Flat Lay of multiple items)', arrange multiple related items in a flat lay composition.
- If Focus is 'Asymmetrical Corner Composition', place the main subject in a corner with negative space.
- If Focus is 'Pattern-Focused (No central object)', create a repeating pattern or texture without a central focal point.
- If Focus is 'Collage of Scattered Elements', arrange various elements scattered across the page.
- If Focus is 'Framed Vignette', show a scene or object within a decorative frame or border.

The VIEWING ANGLE determines the perspective:
- 'Top-Down / Flat Lay': Bird's eye view, looking straight down
- 'Straight-On Front View': Direct frontal perspective
- 'Macro Close-Up': Extreme close-up of details
- 'Isometric Angle': 3D isometric perspective
- 'Dutch Angle (Dynamic tilt)': Tilted, dynamic angle

CRITICAL: Do NOT repeat subjects from previous prompts. Each image must explore a DIFFERENT aspect of the theme.
```

---

## 6. STYLE INSTRUCTIONS (By Color Intensity)

### 6.1 Custom / Override
**Logic**:
- **IF `customArtStyle` has text**: 
  ```
  STYLE: Follow this custom art style: "${customArtStyle.trim()}". CONSTRAINT: Avoid neon colors, hyper-saturation, and harsh contrast unless explicitly requested in the style description. Keep colors harmonious and printable.
  ```
  (Uses ONLY the user's text, NO random tech/palette, with color safety constraint)

- **IF `customArtStyle` is empty**: 
  ```
  STYLE: ${randomTech} technique. Color Palette: ${randomPalette}. CONSTRAINT: Avoid neon colors, hyper-saturation, and harsh contrast unless explicitly requested in the style description. Keep colors harmonious and printable.
  ```
  (Uses random technique and palette from arrays for diversity, with color safety constraint)

**Color Safety Constraint**: The constraint is always appended to ensure soft/natural color defaults unless the user explicitly requests vibrant/neon colors.

### 6.2 Multicolored
```
STYLE: Modern Watercolor Illustration. Vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues). Fresh and lively, clean modern design. NOT vintage, NOT aged, NOT distressed, NOT junk journal style.
```

### 6.3 Muted
```
STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, muted sepia and brown tones, old faded colors, muted color palette. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges.
```

### 6.4 Normal
```
STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, normal colors (deep burgundy, maroon, dark grey, black, antique gold, rich but not faded). Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges.
```

### 6.5 Colorful
```
STYLE: Vintage Junk Journal Aesthetic. Aged antique paper, distressed worn texture, rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm. Extensive cursive handwritten text overlays, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges.
```

---

## 7. VARIATION CONTROL INSTRUCTIONS

Generated by `getVariationControl()` function:

### For Bestiary/Creature Themes:
```
🎯 VARIATION CONTROL (Variation #${variationNumber}):
- CRITICAL: You MUST switch to a DIFFERENT creature than all previous variations.
- If previous variations featured dragons, switch to bears, owls, wolves, birds, or other creatures within the theme.
- Each creature must be visually distinct - different species, pose, composition, or setting.
- GOAL: Create a diverse bestiary collection where each image features a unique creature.
- REMEMBER: Never output the same subject or composition twice. Explore the entire breadth of "${themeDescription}".
```

### For Landscape/Scene Themes:
```
🎯 VARIATION CONTROL (Variation #${variationNumber}):
- CRITICAL: You MUST switch the perspective or focal point from previous variations.
- Rotate through: Wide landscape shot, Close-up detail, Path/road view, Sky/aerial view, Ground level, Elevated view.
- Change the focal element: different structures, natural features, or environmental conditions.
- GOAL: Each image must show a different aspect of the landscape - like different photographs from a collection.
- REMEMBER: Never output the same subject or composition twice. Explore the entire breadth of "${themeDescription}".
```

### For Other Themes:
```
🎯 VARIATION CONTROL (Variation #${variationNumber}):
- CRITICAL: You MUST explore a DIFFERENT subject, element, or composition than all previous variations.
- Switch between: different subjects, different perspectives (wide/close-up), different focal points, different moods.
- Avoid repeating the same visual elements, objects, or compositions.
- GOAL: Each image must be distinct enough to be a separate trading card or journal page.
- REMEMBER: Never output the same subject or composition twice. Explore the entire breadth of "${themeDescription}".
```

---

## 8. FALLBACK PROMPTS (When ChatGPT Fails)

These are used in `constructPrompt()` functions across all services when ChatGPT generation fails.

### 8.1 Layout Prompts (by Page Style)
- **Full Page**: `A full page seamless background texture`
- **Collage**: `A mixed media collage layout with layered paper scraps`
- **Lined**: `A page with faint vintage handwriting lines for journaling`
- **Grid**: `A page with distressed vintage graph paper grid`
- **Ephemera Sheet**: `A sheet containing multiple cut-out ephemera items like tags, tickets, and cards`

### 8.2 Texture Prompts (by Intensity)
- **Light**: `lightly distressed paper, subtle aging`
- **Medium**: `moderately distressed, tea stained, worn edges`
- **Heavy**: `heavily distressed, grunge texture, burnt edges, heavy stains, torn paper`

### 8.3 Variation Modifiers
```javascript
const variationModifiers = [
  'unique composition', 'different arrangement', 'varied layout', 'distinctive style',
  'alternative perspective', 'original design', 'creative variation', 'individual character',
  'unique details', 'distinct elements', 'original arrangement', 'creative composition'
];

const styleVariations = [
  'slightly different lighting', 'varied color tones', 'different texture pattern',
  'alternative color palette', 'unique shading', 'distinctive mood', 'varied atmosphere',
  'different depth', 'alternative focus', 'unique perspective', 'distinctive angle'
];
```

### 8.4 Full Fallback Prompt Template (Muted)
```
${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.
```

### 8.5 Full Fallback Prompt Template (Normal)
```
${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon, extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.
```

### 8.6 Full Fallback Prompt Template (Colorful)
```
${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.
```

### 8.7 Full Fallback Prompt Template (Multicolored)
```
${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors, modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.
```

---

## 9. SERVICE-SPECIFIC PROMPT APPENDAGES

**CRITICAL**: All services now handle `Custom / Override` mode specially:
- **IF `colorIntensity === 'Custom / Override'`**: 
  - **ONLY** appends aspect ratio (e.g., `--ar 2:3`)
  - **DO NOT** append any style constraints, "junk journal" keywords, or "no 3D" constraints
  - Trusts the ChatGPT prompt entirely

- **ELSE** (Muted, Normal, Colorful, Multicolored): Appends the appropriate style constraints as listed below

### 9.1 Midjourney Service (midjourneyService.ts)
When using custom prompts from ChatGPT:
- **Custom / Override**: Only adds aspect ratio (`--ar ${aspectRatio}`), NO style constraints
- **Muted**: Full vintage junk journal constraints (see 8.4)
- **Normal**: Full vintage junk journal constraints with normal colors (see 8.5)
- **Colorful**: Full vintage junk journal constraints with vibrant colors (see 8.6)
- **Multicolored**: Modern watercolor constraints (see 8.7)

### 9.2 Pollinations Service (pollinationsService.ts)
When using custom prompts from ChatGPT:
- **Custom / Override**: NO style constraints added (aspect ratio handled via URL parameters)
- **Muted**: Full vintage junk journal constraints (see 8.4)
- **Normal**: Full vintage junk journal constraints with normal colors (see 8.5)
- **Colorful**: Full vintage junk journal constraints with vibrant colors (see 8.6)
- **Multicolored**: Modern watercolor constraints (see 8.7)

### 9.3 Replicate Service (replicateService.ts)
When using custom prompts from ChatGPT:
- **Custom / Override**: NO style constraints added (aspect ratio handled via model parameters)
- **Other modes**: Appends:
```
Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design.
```

### 9.4 Legnext Service (legnextService.ts)
When using custom prompts from ChatGPT:
- **Custom / Override**: Only adds aspect ratio (`--ar ${aspectRatio}`), NO style constraints
- **Muted**: Full vintage junk journal constraints (see 8.4)
- **Normal**: Full vintage junk journal constraints with normal colors (see 8.5)
- **Colorful**: Full vintage junk journal constraints with vibrant colors (see 8.6)
- **Multicolored**: Modern watercolor constraints (see 8.7)

### 9.5 Ttapi Service (ttapiService.ts)
When using custom prompts from ChatGPT:
- **Custom / Override**: Only adds aspect ratio (`--ar ${aspectRatio}`), NO style constraints
- **Other modes**: 
  - Adds minimal flat design constraints if not already present:
  ```
  flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page.
  ```
  - Plus full vintage junk journal constraints for Muted/Normal/Colorful (see 8.4-8.6)
  - Or modern watercolor constraints for Multicolored (see 8.7)

---

## 10. VISUAL FOCUS & VIEWING ANGLE SELECTION

**IMPORTANT**: The system uses **PURE RANDOM ARRAY SELECTION** from the Global Content Variables (Section 1). There is NO modulo rotation or pattern-based selection.

### Selection Method:
```javascript
// Uses variationNumber as seed for consistent randomization per variation
const seed = variationNumber;
const randomFocus = subjectFocus[Math.floor((seed * 17 + seed * 7) % subjectFocus.length)];
const randomAngle = cameraAngles[Math.floor((seed * 23 + seed * 11) % cameraAngles.length)];
```

### Applied To:
- **ALL modes** (Custom / Override, Muted, Normal, Colorful, Multicolored)
- **ALL variations** (whether generating 12 images or 200)
- Ensures composition variety through random selection from the defined arrays

**Note**: The modulo rotation system (based on `variationNumber % 10`) has been **REMOVED**. The system now relies strictly on random array selection for maximum diversity.

---

## 11. VARIATION INSTRUCTIONS (For Normal Color Intensity)

```javascript
const variationInstructions = [
  'Explore a DIFFERENT time of day: morning, noon, evening, night, dawn, or dusk - each creates a unique mood and lighting',
  'Create a DIFFERENT composition: close-up of details, wide landscape view, path/road leading into distance, single focus element, or dense grouping',
  'Focus on DIFFERENT elements: vary the subjects, objects, structures, natural features, or environmental conditions within the theme',
  'Design a DIFFERENT perspective: bird\'s eye view, ground level, looking up, looking down a path/road, side view, or angled view',
  'Explore DIFFERENT weather/atmosphere: clear day, misty, foggy, moonlit, sunset, sunrise, stormy, or magical lighting',
  'Create a DIFFERENT scene type: path/road view, water feature (stream/river/lake), structure (house/cabin/building), open area, dense area, or elevated view',
  'Focus on DIFFERENT details: close-up textures, medium-range elements, distant horizon, specific objects, or environmental features',
  'Design a DIFFERENT mood: serene and peaceful, dramatic and bold, mystical and magical, cozy and warm, crisp and clear, or energetic and vibrant',
  'Explore DIFFERENT natural/man-made features: varied terrain, water elements, structures, vegetation, or architectural elements',
  'Create a DIFFERENT focal point: a single prominent element, a winding path/road, a structure, a natural feature, or a wide landscape',
  'Focus on DIFFERENT lighting: bright sunlight, soft diffused light, dramatic shadows, warm sunset/rise glow, cool moonlit, or atmospheric lighting',
  'Design a DIFFERENT scale: macro close-up details, medium view of a scene, or wide expansive landscape'
];
```

---

## 12. VARIATION DIRECTIONS (For Normal Color Intensity)

```javascript
const directions = [
  'Create a COMPLETELY DIFFERENT scene - change the time of day, weather/atmosphere, composition, or focal point. Avoid any similarity to previous variations.',
  'Explore a DIFFERENT aspect - think of other subjects, elements, features, or perspectives within the theme. Make it visually distinct.',
  'Design a UNIQUE interpretation - ensure this variation has different composition, different elements, different mood, or different perspective than previous ones.',
  'Create a FRESH perspective - change the viewpoint, scale, or focus. Think: close-up vs wide view, day vs night, path/road vs open area, single element vs group.',
  'Explore DIFFERENT elements - vary the subjects, features, structures, or details. Each variation should feel like a different scene entirely.',
  'Design a DISTINCT scene - change multiple aspects: time of day, composition type, focal elements, and mood. Make it feel like a different photograph or painting.'
];
```

---

## 13. CHATGPT API PARAMETERS

- **Model**: `gpt-4o-mini`
- **Temperature**: `1.2` (increased for maximum creative variation)
- **Max Tokens**: `200` (increased to allow for more detailed, varied descriptions)
- **Stream**: `false` (ensures non-streaming for parallel requests)

---

## 14. SEED GENERATION

All services use seeded randomization for variation:
```javascript
const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
```

Format varies by service:
- **Midjourney**: `seed:${seed}`
- **Legnext**: `--seed ${seed}`
- **Ttapi**: `--seed ${seed}`
- **Pollinations**: `seed:${seed}` (in URL parameter)

---

## 15. ASPECT RATIO HANDLING

### Midjourney/Legnext/Ttapi:
- Added to prompt as: `--ar ${aspectRatio}`

### Replicate:
- For Flux models: Uses `aspect_ratio` parameter directly
- For other models: Calculates width/height from aspect ratio

### Pollinations:
- Uses width/height in URL: `?width=${width}&height=${height}`

---

## END OF DOCUMENTATION

