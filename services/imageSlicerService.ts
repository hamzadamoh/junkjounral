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
 * Checks if a pixel is white/near-white (the grid border color)
 * More aggressive detection for white borders
 */
const isWhitePixel = (r: number, g: number, b: number, threshold: number = 240): boolean => {
  // Check if all RGB values are above threshold (near white)
  return r >= threshold && g >= threshold && b >= threshold;
};

/**
 * Checks if a row is mostly white (border row)
 */
const isWhiteRow = (imageData: ImageData, y: number, threshold: number = 240): boolean => {
  const { data, width } = imageData;
  let whiteCount = 0;
  const samplePoints = Math.min(20, width);
  const step = Math.floor(width / samplePoints);
  
  for (let i = 0; i < samplePoints; i++) {
    const x = i * step;
    const idx = (y * width + x) * 4;
    if (isWhitePixel(data[idx], data[idx + 1], data[idx + 2], threshold)) {
      whiteCount++;
    }
  }
  
  return whiteCount >= samplePoints * 0.8; // 80% white = border row
};

/**
 * Checks if a column is mostly white (border column)
 */
const isWhiteColumn = (imageData: ImageData, x: number, threshold: number = 240): boolean => {
  const { data, width, height } = imageData;
  let whiteCount = 0;
  const samplePoints = Math.min(20, height);
  const step = Math.floor(height / samplePoints);
  
  for (let i = 0; i < samplePoints; i++) {
    const y = i * step;
    const idx = (y * width + x) * 4;
    if (isWhitePixel(data[idx], data[idx + 1], data[idx + 2], threshold)) {
      whiteCount++;
    }
  }
  
  return whiteCount >= samplePoints * 0.8; // 80% white = border column
};

/**
 * Detects content bounds by trimming white borders from edges
 * Scans inward from each edge until non-white content is found
 */
const detectContentBounds = (
  imageData: ImageData,
  _bgColor: { r: number; g: number; b: number },
  _threshold: number = 30
): { x: number; y: number; width: number; height: number } => {
  const { width, height } = imageData;
  
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  
  // Find top edge (scan down until non-white row)
  for (let y = 0; y < height; y++) {
    if (!isWhiteRow(imageData, y)) {
      top = y;
      break;
    }
  }
  
  // Find bottom edge (scan up until non-white row)
  for (let y = height - 1; y >= 0; y--) {
    if (!isWhiteRow(imageData, y)) {
      bottom = y;
      break;
    }
  }
  
  // Find left edge (scan right until non-white column)
  for (let x = 0; x < width; x++) {
    if (!isWhiteColumn(imageData, x)) {
      left = x;
      break;
    }
  }
  
  // Find right edge (scan left until non-white column)
  for (let x = width - 1; x >= 0; x--) {
    if (!isWhiteColumn(imageData, x)) {
      right = x;
      break;
    }
  }
  
  // Ensure valid bounds
  if (left >= right || top >= bottom) {
    console.log('[ImageSlicer] No content bounds detected, using full image');
    return { x: 0, y: 0, width, height };
  }
  
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  
  console.log(`[ImageSlicer] Cropping: (${left},${top}) to (${right},${bottom}) = ${cropWidth}x${cropHeight}`);
  
  return {
    x: left,
    y: top,
    width: cropWidth,
    height: cropHeight,
  };
};

/**
 * Returns the default grid configuration
 * Always 3 rows × 4 columns = 12 images (user's standard format)
 */
export const detectGridConfig = async (
  _imageBase64: string
): Promise<GridConfig> => {
  // User always uploads 4 columns × 3 rows grids (12 images)
  console.log('[ImageSlicer] Using fixed grid: 3 rows × 4 cols = 12 images');
  return { rows: 3, cols: 4 };
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

