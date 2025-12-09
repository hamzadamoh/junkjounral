/**
 * Image Slicer Service - "Arcane Splitter"
 * 
 * Intelligent grid-based image slicing with automatic content detection.
 * Designed for processing AI-generated image grids (Midjourney, etc.)
 */

export interface SlicedImage {
  id: string;
  base64: string;
  row: number;
  col: number;
  width: number;
  height: number;
  originalBounds: { x: number; y: number; width: number; height: number };
  croppedBounds: { x: number; y: number; width: number; height: number };
}

export interface GridConfig {
  rows: number;
  cols: number;
  padding?: number; // Padding to remove from edges
  backgroundColor?: string; // Expected background color for auto-crop
}

export interface AnalyzedSlice extends SlicedImage {
  name?: string;
  description?: string;
  prompt?: string;
  isAnalyzing?: boolean;
  analysisError?: string;
}

/**
 * Detects the dominant background color from image edges
 */
const detectBackgroundColor = (
  imageData: ImageData,
  sampleSize: number = 10
): { r: number; g: number; b: number } => {
  const { data, width, height } = imageData;
  const colors: { r: number; g: number; b: number }[] = [];
  
  // Sample from edges
  for (let i = 0; i < sampleSize; i++) {
    // Top edge
    const topIdx = (i * Math.floor(width / sampleSize)) * 4;
    colors.push({ r: data[topIdx], g: data[topIdx + 1], b: data[topIdx + 2] });
    
    // Bottom edge
    const bottomIdx = ((height - 1) * width + i * Math.floor(width / sampleSize)) * 4;
    colors.push({ r: data[bottomIdx], g: data[bottomIdx + 1], b: data[bottomIdx + 2] });
    
    // Left edge
    const leftIdx = (i * Math.floor(height / sampleSize) * width) * 4;
    colors.push({ r: data[leftIdx], g: data[leftIdx + 1], b: data[leftIdx + 2] });
    
    // Right edge
    const rightIdx = (i * Math.floor(height / sampleSize) * width + width - 1) * 4;
    colors.push({ r: data[rightIdx], g: data[rightIdx + 1], b: data[rightIdx + 2] });
  }
  
  // Calculate average
  const avg = colors.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  
  return {
    r: Math.round(avg.r / colors.length),
    g: Math.round(avg.g / colors.length),
    b: Math.round(avg.b / colors.length),
  };
};

/**
 * Checks if a pixel is similar to the background color
 */
const isBackgroundPixel = (
  r: number,
  g: number,
  b: number,
  bgColor: { r: number; g: number; b: number },
  threshold: number = 30
): boolean => {
  const diff = Math.abs(r - bgColor.r) + Math.abs(g - bgColor.g) + Math.abs(b - bgColor.b);
  return diff < threshold;
};

/**
 * Detects content bounds within a slice by analyzing pixel data
 * This is the "intelligent auto-crop" algorithm
 */
const detectContentBounds = (
  imageData: ImageData,
  bgColor: { r: number; g: number; b: number },
  threshold: number = 30
): { x: number; y: number; width: number; height: number } => {
  const { data, width, height } = imageData;
  
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  
  // Scan all pixels to find content bounds
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      
      // Skip transparent pixels
      if (a < 128) continue;
      
      // Check if this pixel is NOT background
      if (!isBackgroundPixel(r, g, b, bgColor, threshold)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  // If no content found, return full bounds
  if (minX >= maxX || minY >= maxY) {
    return { x: 0, y: 0, width, height };
  }
  
  // Add small padding around content
  const padding = 2;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

/**
 * Auto-detects the grid configuration from an image
 * Analyzes the image to find natural grid divisions
 */
export const detectGridConfig = async (
  imageBase64: string
): Promise<GridConfig> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const aspectRatio = width / height;
      
      // Common grid configurations based on aspect ratio
      // Midjourney typically generates 2x2 grids
      if (aspectRatio >= 0.9 && aspectRatio <= 1.1) {
        // Square-ish: likely 2x2
        resolve({ rows: 2, cols: 2 });
      } else if (aspectRatio >= 1.3 && aspectRatio <= 1.4) {
        // 4:3-ish: could be 3x4 or 2x2
        resolve({ rows: 3, cols: 4 });
      } else if (aspectRatio >= 0.7 && aspectRatio <= 0.8) {
        // 3:4-ish: could be 4x3
        resolve({ rows: 4, cols: 3 });
      } else if (aspectRatio >= 1.9 && aspectRatio <= 2.1) {
        // 2:1-ish: likely 1x2 or 2x4
        resolve({ rows: 2, cols: 4 });
      } else if (aspectRatio >= 0.45 && aspectRatio <= 0.55) {
        // 1:2-ish: likely 4x2
        resolve({ rows: 4, cols: 2 });
      } else {
        // Default to 2x2 (most common for Midjourney)
        resolve({ rows: 2, cols: 2 });
      }
    };
    img.onerror = () => {
      // Default fallback
      resolve({ rows: 2, cols: 2 });
    };
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  });
};

/**
 * Slices a grid image into individual images with intelligent cropping
 */
export const sliceGridImage = async (
  imageBase64: string,
  config: GridConfig = { rows: 2, cols: 2 },
  autoCrop: boolean = true
): Promise<SlicedImage[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const { rows, cols, padding = 0 } = config;
        const slices: SlicedImage[] = [];
        
        // Calculate slice dimensions
        const sliceWidth = Math.floor((img.width - padding * 2) / cols);
        const sliceHeight = Math.floor((img.height - padding * 2) / rows);
        
        console.log(`[ImageSlicer] Slicing ${img.width}x${img.height} image into ${rows}x${cols} grid (${sliceWidth}x${sliceHeight} per slice)`);
        
        // Create a main canvas for the full image
        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = img.width;
        mainCanvas.height = img.height;
        const mainCtx = mainCanvas.getContext('2d');
        
        if (!mainCtx) {
          throw new Error('Failed to get canvas context');
        }
        
        mainCtx.drawImage(img, 0, 0);
        
        // Get the full image data for background detection
        const fullImageData = mainCtx.getImageData(0, 0, img.width, img.height);
        const bgColor = detectBackgroundColor(fullImageData);
        console.log(`[ImageSlicer] Detected background color: rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`);
        
        // Slice each cell
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = padding + col * sliceWidth;
            const y = padding + row * sliceHeight;
            
            // Create a canvas for this slice
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = sliceWidth;
            sliceCanvas.height = sliceHeight;
            const sliceCtx = sliceCanvas.getContext('2d');
            
            if (!sliceCtx) continue;
            
            // Draw the slice
            sliceCtx.drawImage(
              img,
              x, y, sliceWidth, sliceHeight,
              0, 0, sliceWidth, sliceHeight
            );
            
            let finalBase64: string;
            let croppedBounds = { x: 0, y: 0, width: sliceWidth, height: sliceHeight };
            
            if (autoCrop) {
              // Get slice image data for content detection
              const sliceImageData = sliceCtx.getImageData(0, 0, sliceWidth, sliceHeight);
              croppedBounds = detectContentBounds(sliceImageData, bgColor);
              
              // Create cropped canvas
              const croppedCanvas = document.createElement('canvas');
              croppedCanvas.width = croppedBounds.width;
              croppedCanvas.height = croppedBounds.height;
              const croppedCtx = croppedCanvas.getContext('2d');
              
              if (croppedCtx) {
                croppedCtx.drawImage(
                  sliceCanvas,
                  croppedBounds.x, croppedBounds.y, croppedBounds.width, croppedBounds.height,
                  0, 0, croppedBounds.width, croppedBounds.height
                );
                finalBase64 = croppedCanvas.toDataURL('image/png');
              } else {
                finalBase64 = sliceCanvas.toDataURL('image/png');
              }
            } else {
              finalBase64 = sliceCanvas.toDataURL('image/png');
            }
            
            slices.push({
              id: `slice-${row}-${col}-${Date.now()}`,
              base64: finalBase64,
              row,
              col,
              width: croppedBounds.width,
              height: croppedBounds.height,
              originalBounds: { x, y, width: sliceWidth, height: sliceHeight },
              croppedBounds,
            });
          }
        }
        
        console.log(`[ImageSlicer] Successfully created ${slices.length} slices`);
        resolve(slices);
      } catch (error) {
        console.error('[ImageSlicer] Error slicing image:', error);
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      console.error('[ImageSlicer] Error loading image:', error);
      reject(new Error('Failed to load image for slicing'));
    };
    
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  });
};

/**
 * Downloads all sliced images as a ZIP file
 */
export const downloadSlicesAsZip = async (
  slices: SlicedImage[],
  filename: string = 'sliced-images'
): Promise<void> => {
  const JSZip = (await import('jszip')).default;
  const { saveAs } = await import('file-saver');
  
  const zip = new JSZip();
  
  slices.forEach((slice, index) => {
    // Convert base64 to blob
    const base64Data = slice.base64.replace(/^data:image\/\w+;base64,/, '');
    zip.file(`${filename}_${index + 1}_r${slice.row + 1}c${slice.col + 1}.png`, base64Data, { base64: true });
  });
  
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${filename}.zip`);
};

/**
 * Copies all prompts from analyzed slices to clipboard
 */
export const copyAllPrompts = async (slices: AnalyzedSlice[]): Promise<string> => {
  const prompts = slices
    .filter(s => s.prompt)
    .map((s, i) => `--- Image ${i + 1}: ${s.name || 'Untitled'} ---\n${s.prompt}`)
    .join('\n\n');
  
  await navigator.clipboard.writeText(prompts);
  return prompts;
};

