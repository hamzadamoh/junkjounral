/**
 * Arcane Splitter Component
 * 
 * A sophisticated UI for slicing grid images and generating AI prompts.
 * Features drag-and-drop, clipboard paste, and parallel AI analysis.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Scissors,
  Download,
  Copy,
  Check,
  Loader2,
  Wand2,
  Archive,
  Eye,
  X,
  AlertCircle,
  Trash2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Link,
  ShoppingBag,
  FileText,
  Tag,
} from 'lucide-react';
import {
  SlicedImage,
  AnalyzedSlice,
  GridConfig,
  sliceGridImage,
  detectGridConfig,
  downloadSlicesAsZip,
  copyAllPrompts,
} from '../services/imageSlicerService';
import { analyzeAllImages, analyzeSingleSlice, hasOpenAIKey } from '../services/oracleService';
import { uploadImageToWordPress } from '../services/imageHostingService';

interface ArcaneSplitterProps {
  onPromptsGenerated?: (prompts: string[], imagesPerPrompt?: number) => void;
  onClose?: () => void;
}

const ArcaneSplitter: React.FC<ArcaneSplitterProps> = ({ onPromptsGenerated, onClose }) => {
  // State
  const [sourceImages, setSourceImages] = useState<Array<{ id: string; base64: string }>>([]); // Track all uploaded grids with IDs
  const [gridConfig] = useState<GridConfig>({ rows: 3, cols: 4 }); // Fixed: 3 rows × 4 cols = 12 images
  const [slices, setSlices] = useState<Array<AnalyzedSlice & { gridId?: string }>>([]);
  const [isSlicing, setIsSlicing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewSlice, setPreviewSlice] = useState<AnalyzedSlice | null>(null);
  const [copiedPrompts, setCopiedPrompts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlices, setSelectedSlices] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [imagesPerPrompt, setImagesPerPrompt] = useState<1 | 2 | 4>(4); // Midjourney images per prompt
  const [etsyUrl, setEtsyUrl] = useState<string>(''); // Etsy listing URL
  const [isFetchingEtsy, setIsFetchingEtsy] = useState(false); // Loading state for Etsy fetch
  const [etsySliceGrids, setEtsySliceGrids] = useState(true); // Whether to slice Etsy images as grids
  const [etsyFetchProgress, setEtsyFetchProgress] = useState({ current: 0, total: 0 }); // Progress for Etsy fetch
  const [mainTopic, setMainTopic] = useState<string>(''); // Main topic/theme for analysis context
  const [detailLevel, setDetailLevel] = useState<'normal' | 'detailed'>('detailed'); // Detail level for analysis
  const [uploadToWordPress, setUploadToWordPress] = useState<boolean>(false); // WordPress upload toggle
  const [isUploadingToWordPress, setIsUploadingToWordPress] = useState<boolean>(false); // Upload progress
  const [wordPressUploadProgress, setWordPressUploadProgress] = useState({ completed: 0, total: 0 }); // WordPress upload progress
  const autoCrop = true; // Always auto-crop
  
  // Keyword Analysis & Listing Generation State
  const [seedKeywords, setSeedKeywords] = useState<string[]>([]);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvKeywords, setCsvKeywords] = useState<Array<{ keyword: string; volume: number }>>([]);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [productTheme, setProductTheme] = useState<string>('');
  const [generatedListings, setGeneratedListings] = useState<Array<{ title?: string; description: string; tags: string[]; filteredLongTailKeywords?: Array<{ keyword: string; volume: number }> }>>([]);
  const [isGeneratingListings, setIsGeneratingListings] = useState(false);
  const [copiedSeedKeywords, setCopiedSeedKeywords] = useState(false);
  const [copiedTagsIndex, setCopiedTagsIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  
  // Check if OpenAI API is configured (uses existing key)
  const hasApiKey = hasOpenAIKey();
  
  // Handle file selection - auto-slice immediately and append to existing slices
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      // Generate unique ID for this grid
      const gridId = `grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add to source images list with ID
      setSourceImages(prev => [...prev, { id: gridId, base64 }]);
      
      // Fixed grid: 3 rows × 4 cols = 12 images
      const config: GridConfig = { rows: 3, cols: 4 };
      console.log('[ArcaneSplitter] Processing new grid: 3 rows × 4 cols = 12 images');
      
      // Auto-slice immediately and APPEND to existing slices
      setIsSlicing(true);
      try {
        const slicedImages = await sliceGridImage(base64, config, autoCrop);
        const newSlices = slicedImages.map(s => ({ ...s, isAnalyzing: false, gridId }));
        
        // Append new slices to existing ones
        setSlices(prev => [...prev, ...newSlices]);
        console.log(`[ArcaneSplitter] Added ${slicedImages.length} new slices (total: ${slices.length + slicedImages.length})`);
      } catch (err: any) {
        setError(err.message || 'Failed to slice image');
        console.error('[ArcaneSplitter] Auto-slice error:', err);
      } finally {
        setIsSlicing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [autoCrop, slices.length]);
  
  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);
  
  // Handle paste from clipboard
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleFileSelect(file);
          break;
        }
      }
    }
  }, [handleFileSelect]);
  
  // Set up paste listener
  React.useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // Fetch images from Etsy listing
  const handleFetchEtsyListing = useCallback(async () => {
    if (!etsyUrl.trim()) {
      setError('Please enter an Etsy listing URL');
      return;
    }

    // Extract listing ID from URL
    // Formats: 
    // - https://www.etsy.com/listing/1234567890/product-name
    // - https://www.etsy.com/uk/listing/1234567890/product-name
    const listingIdMatch = etsyUrl.match(/listing\/(\d+)/);
    if (!listingIdMatch) {
      setError('Invalid Etsy URL. Please use a listing URL like: https://www.etsy.com/listing/1234567890/...');
      return;
    }

    const listingId = listingIdMatch[1];

    setIsFetchingEtsy(true);
    setEtsyFetchProgress({ current: 0, total: 0 });
    setError(null);

    try {
      console.log(`[ArcaneSplitter] Fetching Etsy listing: ${listingId}`);

      // Use the Vercel proxy to avoid CORS issues
      const response = await fetch(`/api/etsy?operation=listing&listingId=${listingId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ArcaneSplitter] Etsy API error:', errorData);
        throw new Error(errorData.error || `Etsy API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const images = data.results || [];

      if (images.length === 0) {
        throw new Error('No images found in this listing');
      }

      console.log(`[ArcaneSplitter] Found ${images.length} images in Etsy listing`);
      setEtsyFetchProgress({ current: 0, total: images.length });

      // Get all image URLs
      const imageUrls = images
        .map((img: any) => img.url_fullxfull || img.url_570xN || img.url_170x135)
        .filter(Boolean);

      // Fetch ALL images in parallel for speed (use Etsy proxy for Etsy URLs – correct Referer)
      let completedCount = 0;
      const fetchPromises = imageUrls.map(async (imageUrl: string, i: number) => {
        try {
          const proxyUrl = `/api/etsy?operation=proxy-image&url=${encodeURIComponent(imageUrl)}`;
          const imgResponse = await fetch(proxyUrl);
          if (!imgResponse.ok) {
            const errText = await imgResponse.text();
            console.error(`[ArcaneSplitter] Etsy image ${i + 1} proxy returned ${imgResponse.status}:`, errText.slice(0, 200));
            completedCount++;
            setEtsyFetchProgress({ current: completedCount, total: images.length });
            return { index: i, base64: null, success: false };
          }
          const blob = await imgResponse.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          
          completedCount++;
          setEtsyFetchProgress({ current: completedCount, total: images.length });
          
          return { index: i, base64, success: true };
        } catch (imgErr) {
          console.error(`[ArcaneSplitter] Failed to load Etsy image ${i + 1}:`, imgErr);
          completedCount++;
          setEtsyFetchProgress({ current: completedCount, total: images.length });
          return { index: i, base64: null, success: false };
        }
      });

      const results = await Promise.all(fetchPromises);
      const successfulResults = results.filter(r => r.success && r.base64);

      if (successfulResults.length === 0) {
        throw new Error('Failed to load any images from the listing');
      }

      console.log(`[ArcaneSplitter] Loaded ${successfulResults.length}/${images.length} Etsy images`);

      // If slicing is enabled, treat each image as a grid and slice it
      if (etsySliceGrids) {
        console.log(`[ArcaneSplitter] Slicing ${successfulResults.length} Etsy images as 4×3 grids...`);
        
        for (const result of successfulResults) {
          const etsyGridId = `etsy-${listingId}-grid-${result.index}-${Date.now()}`;
          
          // Add to source images for tracking
          setSourceImages(prev => [...prev, { id: etsyGridId, base64: result.base64! }]);
          
          // Slice the image as a 4×3 grid
          try {
            const config: GridConfig = { rows: 3, cols: 4 };
            const slicedImages = await sliceGridImage(result.base64!, config, autoCrop);
            const newSlices = slicedImages.map(s => ({ ...s, isAnalyzing: false, gridId: etsyGridId }));
            
            setSlices(prev => [...prev, ...newSlices]);
            console.log(`[ArcaneSplitter] Sliced Etsy image ${result.index + 1} into ${slicedImages.length} pieces`);
          } catch (sliceErr) {
            console.error(`[ArcaneSplitter] Failed to slice Etsy image ${result.index + 1}:`, sliceErr);
          }
        }
      } else {
        // Add as individual images (no slicing)
        const etsyGroupId = `etsy-${listingId}-${Date.now()}`;
        const newSlices: Array<AnalyzedSlice & { gridId?: string }> = successfulResults.map((result, i) => ({
          id: `etsy-${listingId}-img-${result.index}-${Date.now()}`,
          base64: result.base64!,
          row: Math.floor(i / 4),
          col: i % 4,
          name: `Etsy Image ${result.index + 1}`,
          isAnalyzing: false,
          gridId: etsyGroupId,
        }));
        
        setSlices(prev => [...prev, ...newSlices]);
      }

      setEtsyUrl(''); // Clear input
      console.log(`[ArcaneSplitter] Etsy import complete!`);

    } catch (err: any) {
      console.error('[ArcaneSplitter] Etsy fetch error:', err);
      setError(err.message || 'Failed to fetch Etsy listing');
    } finally {
      setIsFetchingEtsy(false);
      setEtsyFetchProgress({ current: 0, total: 0 });
    }
  }, [etsyUrl, etsySliceGrids, autoCrop]);
  
  // Analyze all slices with GPT-4 Vision
  // NOTE: Does NOT auto-navigate to generation - user can sort first, then click "Use in Bulk Mode"
  const handleAnalyzeAll = useCallback(async () => {
    if (slices.length === 0 || !hasApiKey) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress({ completed: 0, total: slices.length });
    setError(null);
    
    const topic = mainTopic.trim();
    if (topic) {
      console.log(`[ArcaneSplitter] Analyzing with main topic context: "${topic}"`);
    }
    
    // Mark all as analyzing
    setSlices(prev => prev.map(s => ({ ...s, isAnalyzing: true })));
    
    try {
      const analyzed = await analyzeAllImages(slices, (completed, total) => {
        setAnalysisProgress({ completed, total });
      }, topic || undefined, detailLevel);
      // Preserve gridId and wordPressUrl (and other custom properties) for each analyzed slice
      setSlices(prev => {
        const prevMap = new Map(prev.map(s => [s.id, s]));
        return analyzed.map(s => {
          const prevSlice = prevMap.get(s.id);
          return {
            ...s,
            gridId: prevSlice?.gridId,
            wordPressUrl: (prevSlice as any)?.wordPressUrl, // Preserve WordPress URL
          };
        });
      });
      
      // Don't auto-navigate to generation - let user sort first if they want
      // User can click "Use in Bulk Mode" when ready
      console.log(`[ArcaneSplitter] Analysis complete! ${analyzed.filter(s => s.prompt).length} prompts generated. You can now sort by similarity or use prompts.`);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [slices, hasApiKey, mainTopic, detailLevel]);
  
  // Analyze single slice
  const handleAnalyzeSingle = useCallback(async (sliceId: string) => {
    if (!hasApiKey) return;
    
    const slice = slices.find(s => s.id === sliceId);
    if (!slice) return;
    
    setSlices(prev => prev.map(s => 
      s.id === sliceId ? { ...s, isAnalyzing: true } : s
    ));
    
    const topic = mainTopic.trim();
    if (topic) {
      console.log(`[ArcaneSplitter] Analyzing single image with topic context: "${topic}"`);
    }
    
    const analyzed = await analyzeSingleSlice(slice, topic || undefined, detailLevel);
    setSlices(prev => prev.map(s => 
      s.id === sliceId ? { 
        ...analyzed, 
        gridId: s.gridId,
        wordPressUrl: (s as any).wordPressUrl // Preserve WordPress URL
      } : s
    ));
  }, [slices, hasApiKey, mainTopic, detailLevel]);
  
  // Download all slices as ZIP
  const handleDownloadZip = useCallback(async () => {
    if (slices.length === 0) return;
    await downloadSlicesAsZip(slices, 'arcane-slices');
  }, [slices]);
  
  // Copy all prompts
  const handleCopyPrompts = useCallback(async () => {
    // Include WordPress URLs in prompts if they exist (regardless of toggle state)
    const promptsWithUrls = slices.filter(s => s.prompt).map(s => {
      const wordPressUrl = (s as any).wordPressUrl;
      if (wordPressUrl) {
        // If WordPress URL exists, always include it in the prompt
        return `${wordPressUrl} ${s.prompt!}`;
      }
      return s.prompt!;
    });
    
    // Copy to clipboard
    await navigator.clipboard.writeText(promptsWithUrls.join('\n\n'));
    setCopiedPrompts(true);
    setTimeout(() => setCopiedPrompts(false), 2000);
    
    // Also notify parent
    onPromptsGenerated?.(promptsWithUrls);
  }, [slices, onPromptsGenerated]);
  
  // Upload slices to WordPress
  const handleUploadToWordPress = useCallback(async () => {
    if (slices.length === 0) return;
    
    setIsUploadingToWordPress(true);
    setWordPressUploadProgress({ completed: 0, total: slices.length });
    setError(null);
    
    try {
      // Upload sequentially with delays to avoid rate limiting
      const updatedSlices: Array<AnalyzedSlice & { wordPressUrl?: string }> = [];
      
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        try {
          const wordPressUrl = await uploadImageToWordPress(slice.base64, 3); // 3 retries
          updatedSlices.push({ ...slice, wordPressUrl });
          setWordPressUploadProgress({ completed: i + 1, total: slices.length });
          console.log(`[ArcaneSplitter] ✅ Uploaded slice ${slice.id} to WordPress: ${wordPressUrl}`);
          
          // Add delay between uploads to avoid rate limiting (except for last item)
          if (i < slices.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between uploads
          }
        } catch (error: any) {
          console.error(`[ArcaneSplitter] Failed to upload slice ${slice.id}:`, error);
          updatedSlices.push(slice); // Keep original slice if upload fails
          setWordPressUploadProgress({ completed: i + 1, total: slices.length });
          
          // If we get a 403 error, wait longer before next upload
          if (error.message && error.message.includes('403')) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay after 403
          }
        }
      }
      
      setSlices(updatedSlices);
      const uploadedCount = updatedSlices.filter(s => (s as any).wordPressUrl).length;
      console.log(`[ArcaneSplitter] ✅ Uploaded ${uploadedCount}/${slices.length} images to WordPress`);
      console.log(`[ArcaneSplitter] WordPress URLs stored:`, updatedSlices.map(s => ({ id: s.id, url: (s as any).wordPressUrl })));
    } catch (error: any) {
      setError(`WordPress upload failed: ${error.message}`);
      console.error('[ArcaneSplitter] WordPress upload error:', error);
    } finally {
      setIsUploadingToWordPress(false);
      setWordPressUploadProgress({ completed: 0, total: 0 });
    }
  }, [slices]);
  
  // Use prompts in bulk mode
  const handleUsePrompts = useCallback(() => {
    // Include WordPress URLs in prompts if they exist (regardless of toggle state)
    const slicesWithPrompts = slices.filter(s => s.prompt);
    const slicesWithUrls = slicesWithPrompts.filter(s => (s as any).wordPressUrl);
    console.log(`[ArcaneSplitter] Preparing ${slicesWithPrompts.length} prompts (${slicesWithUrls.length} have WordPress URLs)`);
    
    const prompts = slicesWithPrompts.map(s => {
      const wordPressUrl = (s as any).wordPressUrl;
      if (wordPressUrl) {
        // If WordPress URL exists, always include it in the prompt (Midjourney image reference format)
        const promptWithUrl = `${wordPressUrl} ${s.prompt!}`;
        console.log(`[ArcaneSplitter] ✅ Including WordPress URL in prompt: ${wordPressUrl.substring(0, 80)}...`);
        return promptWithUrl;
      } else {
        console.log(`[ArcaneSplitter] ⚠️ No WordPress URL for slice ${s.id}`);
      }
      return s.prompt!;
    });
    console.log(`[ArcaneSplitter] Sending ${prompts.length} prompts to bulk mode`);
    console.log(`[ArcaneSplitter] First prompt preview: ${prompts[0]?.substring(0, 150)}...`);
    onPromptsGenerated?.(prompts, imagesPerPrompt);
    onClose?.();
  }, [slices, onPromptsGenerated, onClose, imagesPerPrompt]);
  
  // Download single slice
  const handleDownloadSlice = useCallback((slice: AnalyzedSlice) => {
    const link = document.createElement('a');
    link.download = `${slice.name || `slice-${slice.row + 1}-${slice.col + 1}`}.png`;
    link.href = slice.base64;
    link.click();
  }, []);
  
  // Delete a single slice
  const handleDeleteSlice = useCallback((sliceId: string) => {
    setSlices(prev => prev.filter(s => s.id !== sliceId));
    setSelectedSlices(prev => {
      const newSet = new Set(prev);
      newSet.delete(sliceId);
      return newSet;
    });
  }, []);

  // Delete selected slices
  const handleDeleteSelected = useCallback(() => {
    if (selectedSlices.size === 0) return;
    if (confirm(`Delete ${selectedSlices.size} selected slice(s)?`)) {
      setSlices(prev => prev.filter(s => !selectedSlices.has(s.id)));
      setSelectedSlices(new Set());
    }
  }, [selectedSlices]);

  // Toggle slice selection
  const handleToggleSelect = useCallback((sliceId: string) => {
    setSelectedSlices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sliceId)) {
        newSet.delete(sliceId);
      } else {
        newSet.add(sliceId);
      }
      return newSet;
    });
  }, []);

  // Select all / Deselect all
  const handleSelectAll = useCallback(() => {
    if (selectedSlices.size === slices.length) {
      setSelectedSlices(new Set());
    } else {
      setSelectedSlices(new Set(slices.map(s => s.id)));
    }
  }, [selectedSlices.size, slices]);

  // Move slice up
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setSlices(prev => {
      const newSlices = [...prev];
      [newSlices[index - 1], newSlices[index]] = [newSlices[index], newSlices[index - 1]];
      return newSlices;
    });
  }, []);

  // Move slice down
  const handleMoveDown = useCallback((index: number) => {
    setSlices(prev => {
      if (index === prev.length - 1) return prev;
      const newSlices = [...prev];
      [newSlices[index], newSlices[index + 1]] = [newSlices[index + 1], newSlices[index]];
      return newSlices;
    });
  }, []);

  // Drag and drop handlers for slice reordering
  const handleSliceDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleSliceDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    setSlices(prev => {
      const newSlices = [...prev];
      const draggedSlice = newSlices[draggedIndex];
      newSlices.splice(draggedIndex, 1);
      newSlices.splice(index, 0, draggedSlice);
      return newSlices;
    });
    setDraggedIndex(index);
  }, [draggedIndex]);

  const handleSliceDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);
  
  // Delete a grid and all its slices
  const handleDeleteGrid = useCallback((gridId: string) => {
    setSourceImages(prev => prev.filter(g => g.id !== gridId));
    setSlices(prev => prev.filter(s => s.gridId !== gridId));
  }, []);

  // State for similarity sorting
  const [isSortingBySimilarity, setIsSortingBySimilarity] = useState(false);
  const [sortProgress, setSortProgress] = useState({ completed: 0, total: 0, phase: '' });

  // Sort slices by visual similarity using the generated prompts
  const handleSortBySimilarity = useCallback(async () => {
    if (slices.length < 2 || !hasApiKey) return;
    
    // Check if all images have been analyzed
    const unanalyzedCount = slices.filter(s => !s.prompt).length;
    if (unanalyzedCount > 0) {
      setError(`Please analyze all images first! ${unanalyzedCount} image(s) not analyzed yet. Click "Analyze All" first.`);
      return;
    }
    
    setIsSortingBySimilarity(true);
    setSortProgress({ completed: 0, total: slices.length, phase: 'Sorting' });
    setError(null);
    
    try {
      // Use the detailed prompts for accurate sorting
      // Extract key visual elements from each prompt (first 80 chars for better context)
      const descriptions: Map<string, string> = new Map();
      slices.forEach((slice, idx) => {
        // Use the full prompt but truncate for the sorting request
        const prompt = slice.prompt || `image-${idx}`;
        descriptions.set(slice.id, prompt.substring(0, 80));
      });
      
      console.log(`[ArcaneSplitter] Sorting ${slices.length} images using their prompts`);
      
      setSortProgress({ completed: slices.length, total: slices.length, phase: 'Grouping' });
      
      // Step 2: For large sets, first categorize into groups, then sort within groups
      const descList = slices.map((s, i) => `${i}:${descriptions.get(s.id) || 'unknown'}`).join('; ');
      
      // Calculate max_tokens needed: roughly 4 chars per number + comma + space
      // For 84 images: need ~420 chars for array, add generous buffer
      // Token ~= 4 chars, so 84 indices * 4 chars / 4 = 84 tokens minimum, but add 3x buffer
      const maxTokensNeeded = Math.max(1000, slices.length * 12);
      
      console.log(`[ArcaneSplitter] Sorting ${slices.length} images, requesting ${maxTokensNeeded} max_tokens`);
      
      // Use server-side API route to protect API key
      const sortResponse = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Sort image indices by visual similarity. Group similar subjects/colors together.

CRITICAL: Output ONLY a JSON array with ALL ${slices.length} indices from 0 to ${slices.length - 1}, each appearing exactly once.
Example for 5 images: [2,4,0,3,1]

NO text, NO explanation - ONLY the JSON array.`
            },
            {
              role: 'user',
              content: `Sort these ${slices.length} images:\n${descList}\n\nJSON array:`
            }
          ],
          max_tokens: maxTokensNeeded,
          temperature: 0.05,
        }),
      });
      
      if (!sortResponse.ok) {
        const errText = await sortResponse.text();
        console.error('[ArcaneSplitter] Sort API error:', errText);
        throw new Error('Failed to get sorting order from AI');
      }
      
      const sortData = await sortResponse.json();
      const sortText = sortData.choices?.[0]?.message?.content || '';
      
      console.log('[ArcaneSplitter] AI response:', sortText.substring(0, 200));
      
      // Parse the JSON array from the response - handle multiline
      const cleanedText = sortText.replace(/\s+/g, '');
      const jsonMatch = cleanedText.match(/\[[\d,]+\]/);
      if (!jsonMatch) {
        console.error('[ArcaneSplitter] Could not find JSON array in:', sortText);
        throw new Error('Could not parse sorting order - AI response invalid');
      }
      
      let sortOrder: number[];
      try {
        sortOrder = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error('[ArcaneSplitter] JSON parse error:', parseErr);
        throw new Error('Could not parse sorting order - invalid JSON');
      }
      
      console.log(`[ArcaneSplitter] Parsed ${sortOrder.length} indices (expected ${slices.length})`);
      
      // Filter out invalid indices first
      sortOrder = sortOrder.filter(n => typeof n === 'number' && n >= 0 && n < slices.length);
      console.log(`[ArcaneSplitter] After filtering invalid: ${sortOrder.length} valid indices`);
      
      // Remove duplicates
      const seen = new Set<number>();
      const deduped: number[] = [];
      for (const n of sortOrder) {
        if (!seen.has(n)) {
          seen.add(n);
          deduped.push(n);
        }
      }
      sortOrder = deduped;
      
      // Add any missing indices at the end
      const missing: number[] = [];
      for (let i = 0; i < slices.length; i++) {
        if (!seen.has(i)) {
          missing.push(i);
          seen.add(i);
        }
      }
      
      if (missing.length > 0) {
        console.log(`[ArcaneSplitter] Adding ${missing.length} missing indices: ${missing.slice(0, 10).join(',')}${missing.length > 10 ? '...' : ''}`);
        sortOrder = [...sortOrder, ...missing];
      }
      
      // Final validation
      if (sortOrder.length !== slices.length) {
        throw new Error(`Failed to construct valid sort order: got ${sortOrder.length}, expected ${slices.length}`);
      }
      
      console.log(`[ArcaneSplitter] Final sort order: ${sortOrder.length} indices`);
      
      // Apply the sort order
      const sortedSlices = sortOrder.map(i => slices[i]);
      setSlices(sortedSlices);
      
      console.log('[ArcaneSplitter] Successfully sorted by similarity');
    } catch (err: any) {
      console.error('[ArcaneSplitter] Similarity sort error:', err);
      setError(err.message || 'Failed to sort by similarity');
    } finally {
      setIsSortingBySimilarity(false);
    }
  }, [slices, hasApiKey]);
  
  // Generate seed keywords from analyzed listings
  const handleGenerateSeedKeywords = useCallback(async () => {
    if (slices.length === 0 || !hasApiKey) {
      setError('Please analyze some images first');
      return;
    }
    
    const analyzedSlices = slices.filter(s => s.prompt || s.description);
    if (analyzedSlices.length === 0) {
      setError('No analyzed images found. Please click "Analyze All" first.');
      return;
    }
    
    setIsGeneratingKeywords(true);
    setError(null);
    
    try {
      // Collect all prompts/descriptions
      const allText = analyzedSlices
        .map(s => s.prompt || s.description || '')
        .filter(Boolean)
        .join('\n\n');
      
      // Use OpenAI with the Etsy SEO expert prompt
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an **Etsy SEO + conversion optimization expert** specializing in:

* Junk journal kits
* Junk journal pages
* Printable papers
* Digital collage sheets
* Ephemera packs
* Scrapbooking and journaling supplies

You help sellers research keywords **before** writing listings.

## ❗ ABSOLUTE RULES (DO NOT BREAK)

1. Do NOT invent keyword volumes
2. Do NOT guess trends
3. Do NOT suggest new products
4. Do NOT switch niches
5. All keywords must match Etsy buyer intent
6. Tags must be **1–20 characters**
7. Use **exactly 13 tags**
8. No duplicate tags
9. Title ≤ 140 characters
10. Assume **DIGITAL PDF** unless stated
11. No emojis
12. No filler language

## 🟢 STEP 1 — SEED KEYWORDS (FIRST AND ONLY OUTPUT)

Generate **SEED KEYWORDS ONLY** - these are simple 1-2 word terms that will be used for research to get actual keyword volumes from Etsy.

### SEED KEYWORD RULES

* **1–2 words ONLY** - simple, broad terms
* No punctuation
* No plurals unless common
* Broad but relevant
* Etsy autosuggest-friendly
* **These are just starting points for research** - you will NOT get volumes here, just seed terms
* **Analyze the product descriptions and generate seed keywords that:**
  - Match the actual themes, subjects, and styles shown in the images
  - Are relevant to junk journals, scrapbooking, and digital crafting
  - Would be good starting points for Etsy keyword research
  - Include both crafting terms AND theme-specific terms based on what you see

### FORMAT (VERY IMPORTANT)

Output **ONLY** this format — nothing else:

keyword1
keyword2
keyword3
keyword4
...

### Quantity

* Provide **20–30 seed keywords**
* These are just seed terms - the user will research these on Etsy to get actual keywords with volumes
* Let the content guide you - if images show gardens, include garden-related seed terms; if they show gnomes, include gnome-related seed terms, etc.

### Group internally by intent, but **DO NOT label groups**.

⚠️ STOP after seed keywords.
⚠️ DO NOT continue to listings until I return with keyword data.`
            },
            {
              role: 'user',
              content: `Analyze these product descriptions carefully. Generate SEED KEYWORDS ONLY (20-30 simple 1-2 word terms, one per line).

**IMPORTANT**: These are just seed keywords for research - simple terms that will be used to find actual keywords with volumes on Etsy. Do NOT include volumes or detailed keywords.

Based on what you see in the images (themes, subjects, styles, colors, etc.), generate simple seed terms that:
- Match the actual themes and subjects in the images (e.g., if you see gardens, butterflies, flowers, include: garden, butterfly, flowers)
- Are relevant to junk journals and digital crafting (e.g., junk journal, printable, ephemera)
- Would be good starting points for Etsy keyword research

Product Descriptions:
${allText}

Output ONLY seed keywords (simple 1-2 word terms), one per line, nothing else:`
            }
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate keywords');
      }
      
      const data = await response.json();
      const keywordsText = data.choices?.[0]?.message?.content || '';
      
      // Parse keywords (one per line, clean up)
      const keywords = keywordsText
        .split('\n')
        .map(k => k.trim())
        .filter(k => {
          // Remove numbering, bullets, labels
          const cleaned = k.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•*]\s*/, '').trim();
          // Must be 1-2 words, no punctuation (except hyphens in compound words)
          const words = cleaned.split(/\s+/);
          return cleaned && 
                 words.length <= 2 && 
                 words.length > 0 &&
                 !cleaned.match(/^[A-Z][a-z]+:/) && // Remove labels like "Group 1:"
                 cleaned.length > 0;
        })
        .map(k => k.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
        .filter(k => k.length > 0)
        .slice(0, 30); // Limit to 30 keywords
      
      setSeedKeywords(keywords);
      console.log(`[ArcaneSplitter] Generated ${keywords.length} seed keywords`);
    } catch (err: any) {
      console.error('[ArcaneSplitter] Keyword generation error:', err);
      setError(`Failed to generate keywords: ${err.message}`);
    } finally {
      setIsGeneratingKeywords(false);
    }
  }, [slices, hasApiKey]);
  
  // Handle CSV file upload
  const handleCsvUpload = useCallback(async (file: File) => {
    setIsProcessingCsv(true);
    setError(null);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Parse CSV - only use first two columns: keyword,vol
      const keywords: Array<{ keyword: string; volume: number }> = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Skip header row if it exists (check for keyword and vol/volume)
        if (i === 0 && (line.toLowerCase().includes('keyword') && (line.toLowerCase().includes('vol') || line.toLowerCase().includes('volume')))) {
          continue;
        }
        
        // Parse CSV line - only use first two columns
        // Handle quoted values and commas within quotes
        const parts: string[] = [];
        let currentPart = '';
        let insideQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === ',' && !insideQuotes) {
            parts.push(currentPart.trim().replace(/^"|"$/g, ''));
            currentPart = '';
            // Stop after second column
            if (parts.length >= 2) break;
          } else {
            currentPart += char;
          }
        }
        
        // Add the last part if we haven't reached 2 columns yet
        if (parts.length < 2 && currentPart) {
          parts.push(currentPart.trim().replace(/^"|"$/g, ''));
        }
        
        // Only process if we have at least 2 columns
        if (parts.length >= 2) {
          const keyword = parts[0];
          const volume = parseInt(parts[1]) || 0;
          if (keyword) {
            keywords.push({ keyword, volume });
          }
        }
      }
      
      setCsvKeywords(keywords);
      setCsvFile(file);
      console.log(`[ArcaneSplitter] Loaded ${keywords.length} keywords from CSV (using only keyword and vol columns)`);
    } catch (err: any) {
      console.error('[ArcaneSplitter] CSV parsing error:', err);
      setError(`Failed to parse CSV: ${err.message}`);
    } finally {
      setIsProcessingCsv(false);
    }
  }, []);
  
  // Generate listings from CSV keywords
  const handleGenerateListings = useCallback(async () => {
    if (csvKeywords.length === 0) {
      setError('Please upload a CSV file with keywords first');
      return;
    }
    
    if (slices.length === 0) {
      setError('Please analyze some images first');
      return;
    }
    
    const analyzedSlices = slices.filter(s => s.prompt || s.description);
    if (analyzedSlices.length === 0) {
      setError('No analyzed images found. Please click "Analyze All" first.');
      return;
    }
    
    setIsGeneratingListings(true);
    setError(null);
    setGeneratedListings([]);
    
    try {
      // Combine all analyzed slices into one product description
      const allPrompts = analyzedSlices
        .map(s => s.prompt || s.description || '')
        .filter(Boolean)
        .join('\n\n');
      
      // Extract key themes from image descriptions (lowercase for matching)
      const imageText = allPrompts.toLowerCase();
      
      // Extract key words from image descriptions for better matching
      const imageWords = new Set<string>();
      const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their']);
      
      // Extract meaningful words from image descriptions (2+ characters, not common words)
      allPrompts.toLowerCase().split(/\s+/).forEach(word => {
        const cleaned = word.replace(/[^\w]/g, '');
        if (cleaned.length >= 2 && !commonWords.has(cleaned)) {
          imageWords.add(cleaned);
        }
      });
      
      // Match keywords to image content
      // Score keywords based on how well they match the image descriptions
      const scoredKeywords = csvKeywords.map(keyword => {
        const keywordLower = keyword.keyword.toLowerCase();
        const keywordWords = keywordLower.split(/\s+/).map(w => w.replace(/[^\w]/g, ''));
        
        // Calculate match score
        let score = 0;
        let exactMatch = false;
        let wordMatches = 0;
        
        // Exact phrase match gets highest score
        if (imageText.includes(keywordLower)) {
          score += 200;
          exactMatch = true;
        }
        
        // Word-by-word matching (check if keyword words appear in image)
        keywordWords.forEach(word => {
          if (word.length >= 2 && imageWords.has(word)) {
            score += 50;
            wordMatches++;
          } else if (imageText.includes(word)) {
            score += 30;
            wordMatches++;
          }
        });
        
        // Special handling for generic terms that shouldn't match unless exact
        const genericTerms = ['color', 'palette', 'template', 'bundle', 'print', 'brand', 'seasons', 'fabric', 'procreate', 'benjamin', 'moore'];
        const isGenericTerm = keywordWords.some(w => genericTerms.includes(w.toLowerCase()));
        
        // If it's a generic term and not an exact match, require ALL words to match
        if (isGenericTerm && !exactMatch) {
          const allWordsMatch = keywordWords.every(w => 
            w.length >= 2 && (imageWords.has(w) || imageText.includes(w))
          );
          if (!allWordsMatch) {
            score = -1000; // Heavily penalize generic terms that don't fully match
            wordMatches = 0;
          }
        }
        
        // If no matches at all, heavily penalize
        if (!exactMatch && wordMatches === 0) {
          score = -1000; // Heavy penalty for irrelevant keywords
        }
        
        // Small bonus for higher volume (only if there's strong relevance)
        if (score > 50) { // Only add volume bonus if there's meaningful relevance
          score += Math.min(keyword.volume / 30, 20); // Reduced volume bonus
        }
        
        return { ...keyword, score, exactMatch, wordMatches };
      });
      
      // Filter out keywords with negative scores or low relevance (minimum 50 points)
      const relevantKeywords = scoredKeywords.filter(k => k.score >= 50);
      
      // Sort by relevance score first, then by volume
      relevantKeywords.sort((a, b) => {
        // Prioritize exact matches
        if (a.exactMatch && !b.exactMatch) return -1;
        if (!a.exactMatch && b.exactMatch) return 1;
        
        // Then by score
        if (Math.abs(a.score - b.score) > 20) {
          return b.score - a.score;
        }
        // If scores are close, prefer higher volume
        return b.volume - a.volume;
      });
      
      // If no relevant keywords found, fall back to all keywords sorted by volume
      const sortedKeywords = relevantKeywords.length > 0 ? relevantKeywords : scoredKeywords.sort((a, b) => b.volume - a.volume);
      
      // Select primary and secondary keywords (top relevant ones)
      const primaryKeyword = sortedKeywords[0];
      const secondaryKeywords = sortedKeywords.slice(1, 4); // 2-3 secondary keywords
      
      // Get top 20 relevant keywords for the prompt
      const topRelevantKeywords = sortedKeywords.slice(0, 20);
      
      // Format keyword data for the prompt
      const keywordData = [
        `Primary: ${primaryKeyword.keyword} (vol: ${primaryKeyword.volume}, relevance score: ${Math.round(primaryKeyword.score)})`,
        ...secondaryKeywords.map(k => `Secondary: ${k.keyword} (vol: ${k.volume}, relevance score: ${Math.round(k.score)})`),
        ...topRelevantKeywords.slice(4).map(k => `${k.keyword} (vol: ${k.volume}, relevance score: ${Math.round(k.score)})`)
      ].join('\n');
      
      // Prepare all CSV keywords for tag selection (sorted by volume, filtered to 1-20 chars)
      const allValidKeywords = csvKeywords
        .filter(k => k.keyword.length >= 1 && k.keyword.length <= 20)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 100); // Top 100 by volume for ChatGPT to choose from
      
      const keywordsForTagSelection = allValidKeywords.map(k => `${k.keyword} (vol: ${k.volume})`).join('\n');
      
      // Generate ONE listing using the Etsy SEO expert prompt
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an **Etsy SEO + conversion optimization expert** specializing in:

* Junk journal kits
* Junk journal pages
* Printable papers
* Digital collage sheets
* Ephemera packs
* Scrapbooking and journaling supplies

## ❗ ABSOLUTE RULES (DO NOT BREAK)

1. Do NOT invent keyword volumes
2. Do NOT guess trends
3. Do NOT suggest new products
4. Do NOT switch niches
5. All keywords must match Etsy buyer intent
6. Tags must be **1–20 characters**
7. Use **exactly 13 tags**
8. No duplicate tags
9. Title ≤ 140 characters
10. Assume **DIGITAL PDF** unless stated
11. Use emojis in description (✅, ✦) as shown in format
12. No filler language

## 🔵 STEP 3 — LISTING CREATION

Generate:

### 1️⃣ TITLE

* Primary keyword first
* Natural language
* Digital intent included
* ≤ 140 characters

### 2️⃣ DESCRIPTION

Use structured sections:

* Opening hook
* What you'll receive
* Perfect for
* Style & theme
* How to use
* Important notes

### 3️⃣ TAGS

### TAG RULES

* Exactly **13 tags**
* 1–20 characters each
* **MUST be from the keyword data provided above - DO NOT invent tags**
* **Use natural, readable tags like: "junk journaling", "scrapbooking", "fairy tale", "gnomes", "ephemera", "printable pages"**
* **You can use:**
  - Exact keywords from the CSV data (e.g., "junk journaling", "scrapbooking", "fairy tale")
  - Single words that appear in keywords (e.g., "gnomes" from "gnomes ornaments", "ephemera" from "junk journal ephemera")
* **DO NOT use partial multi-word phrases** (e.g., don't use "art prints digital" if the keyword is "art prints digital download set" - use the exact keyword or just "art" or "prints")
* **DO NOT create variations like "art prints set of 3", "home decor gift", "home decor boho"**
* **DO NOT add numbers, quantities, or extra words that aren't in the keyword data**
* **Tags should be natural and readable, matching the image themes**
* No commas inside tags

### FORMAT (VERY IMPORTANT)

Output **ONLY** this format:

TITLE:
[title text]

DESCRIPTION:
[description text]

TAGS:
tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12, tag13

## 🚫 NEVER USE THESE PHRASES

* Perfect for everyone
* Great for any occasion
* High quality designs
* Beautiful artwork
* Stunning illustrations`
            },
              {
                role: 'user',
                content: `Generate ONE Etsy listing for this product collection (${analyzedSlices.length} items):

Product Descriptions:
${allPrompts}

Keyword Data (with search volumes):
${keywordData}

Primary keyword: ${primaryKeyword.keyword} (vol: ${primaryKeyword.volume}, relevance score: ${Math.round(primaryKeyword.score)}${primaryKeyword.exactMatch ? ', EXACT MATCH' : ''})
Secondary keywords: ${secondaryKeywords.map(k => `${k.keyword} (vol: ${k.volume}, score: ${Math.round(k.score)})`).join(', ')}

Available Keywords for Tags (select exactly 13 from this list):
${keywordsForTagSelection}

🚨 CRITICAL INSTRUCTION FOR TITLE GENERATION:

The primary keyword shown above is based on relevance scoring, but you MUST verify it matches the actual image content described in "Product Descriptions" above.

**IF the primary keyword is a generic term** (like "color palette", "template", "bundle", "print", "brand", "seasons", "fabric", "procreate") **AND the Product Descriptions mention specific themes** (gnomes, forests, flowers, mushrooms, gardens, woodland, fairy tale, etc.), then:

1. **DO NOT use the primary keyword in the title**
2. **Use the most relevant secondary keyword instead** (one that matches the actual themes in the images)
3. **The title must start with the thematic keyword** (e.g., "Enchanted Forest", "Whimsical Gnomes", "Delicate Flowers") NOT the generic term
4. **Only use generic terms if the images are specifically about that concept** (e.g., actual color swatches/palettes)

Selection logic: Keywords were matched to image content with strict relevance scoring. Generic terms are heavily penalized unless they fully match. Always prioritize thematic relevance over volume.

## 🎯 CRITICAL: Generate ALL from the SAME data

You MUST generate the title, description, and tags ALL from:
- The SAME product descriptions above (analyzed images)
- The SAME keyword data provided
- They MUST be consistent with each other and accurately reflect the actual image content

Now generate:
1. Title (≤ 140 characters, primary keyword first, digital intent) - MUST match the image themes
2. Description (MUST follow this EXACT format with emojis):
✅ DESCRIPTION (ready to paste)

[Opening sentence: Create [theme/style] projects with this [product name] junk journal printable kit.]

[Paragraph: This digital collection includes [number] printable pages inspired by [themes, colors, elements].]

[Paragraph: Designed for junk journaling, collage, scrapbooking, and [specific use cases], these pages work beautifully together while offering plenty of variety for layering and creative layouts.]

✦ WHAT YOU GET

• [Number] high-quality [theme] printable pages
• [Feature 1]
• [Feature 2]
• [Feature 3]
• Instant digital download (no physical item)

✦ PERFECT FOR

• [Use case 1]
• [Use case 2]
• [Use case 3]
• [Use case 4]
• [Use case 5]

✦ FILE DETAILS

• High-resolution digital files
• Print at home or professionally
• Personal crafting & journaling use

[Closing sentence: This [product name] printable kit is ideal for crafters who love [target audience interests].]

3. Exactly 13 tags (comma-separated, 1-20 characters each) - **CRITICAL: Select exactly 13 tags from the "Available Keywords for Tags" list provided above. Analyze the product descriptions and choose keywords that best match the image themes (gnomes, forests, gardens, etc.) and are relevant to junk journals/scrapbooking. Use exact keywords from the list - do NOT modify them. Prioritize keywords with good volume that match the image content.**

**IMPORTANT**: All three (title, description, tags) must be:
- Generated from the SAME product descriptions (analyzed images)
- Generated from the SAME keyword data provided
- Consistent with each other
- Accurately reflect what's actually in the images

Format your response as:
TITLE:
[title]

DESCRIPTION:
[description with exact format above]

TAGS:
tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12, tag13`
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate listing');
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Parse title, description and tags
      const titleMatch = content.match(/TITLE:\s*(.+?)(?=DESCRIPTION:|$)/is);
      const descriptionMatch = content.match(/DESCRIPTION:\s*(.+?)(?=TAGS:|$)/is);
      const tagsMatch = content.match(/TAGS:\s*(.+?)$/is);
      
      const title = titleMatch?.[1]?.trim() || '';
      const description = descriptionMatch?.[1]?.trim() || allPrompts;
      const tagsText = tagsMatch?.[1]?.trim() || '';
      
      // Create a set of all valid keywords from CSV (for validation)
      const validKeywordsSet = new Set(csvKeywords.map(k => k.keyword.toLowerCase()));
      
      // Parse tags - ChatGPT should have selected them from the CSV keywords list
      const parsedTags = tagsText.split(',').map(t => t.trim()).filter(t => t && t.length <= 20);
      
      // Validate tags are from CSV (exact matches or single words from keywords)
      const validatedTags = parsedTags.filter(tag => {
        const tagLower = tag.toLowerCase().trim();
        const tagWords = tagLower.split(/\s+/).filter(w => w.length > 0);
        
        // Check if tag matches any CSV keyword
        for (const keyword of validKeywordsSet) {
          const keywordLower = keyword.toLowerCase().trim();
          
          // Exact match
          if (keywordLower === tagLower) {
            console.log(`[ArcaneSplitter] Validated tag: "${tag}" (exact match)`);
            return true;
          }
          
          // Single word that appears in keyword
          if (tagWords.length === 1 && tagLower.length >= 3) {
            const wordBoundaryRegex = new RegExp(`\\b${tagLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (wordBoundaryRegex.test(keywordLower)) {
              console.log(`[ArcaneSplitter] Validated tag: "${tag}" (single word from keyword)`);
              return true;
            }
          }
        }
        
        console.warn(`[ArcaneSplitter] Rejected invalid tag: "${tag}" - not found in CSV keywords`);
        return false;
      });
      
      // Fill remaining slots with valid keywords from CSV if ChatGPT didn't select enough
      let tags = [...validatedTags];
      const usedKeywords = new Set(validatedTags.map(t => t.toLowerCase()));
      
      // Add from top relevant keywords (prioritize relevance)
      for (const keyword of topRelevantKeywords) {
        if (tags.length >= 13) break;
        const keywordLower = keyword.keyword.toLowerCase();
        if (!usedKeywords.has(keywordLower) && keyword.keyword.length <= 20) {
          tags.push(keyword.keyword);
          usedKeywords.add(keywordLower);
        }
      }
      
      // If still not 13 tags, add from all CSV keywords sorted by volume
      if (tags.length < 13) {
        for (const keyword of allValidKeywords) {
          if (tags.length >= 13) break;
          const keywordLower = keyword.keyword.toLowerCase();
          if (!usedKeywords.has(keywordLower)) {
            tags.push(keyword.keyword);
            usedKeywords.add(keywordLower);
          }
        }
      }
      
      // Ensure we have exactly 13 tags (or as many as available)
      tags = tags.slice(0, 13);
      
      // Get all keywords with volume >= 100 for filtering
      const allLongTailKeywords = csvKeywords
        .filter(k => k.volume >= 100)
        .sort((a, b) => b.volume - a.volume);
      
      // Ask ChatGPT to filter long tail keywords to only junk journal related ones
      let filteredLongTailKeywords: Array<{ keyword: string; volume: number }> = [];
      
      if (allLongTailKeywords.length > 0) {
        try {
          const filterResponse = await fetch('/api/openai/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are an expert at identifying keywords relevant to junk journals, scrapbooking, and digital crafting supplies.

Your task: Select keywords from the list that are relevant to the product. Include BOTH:
1. Junk journal/crafting keywords (junk journal, scrapbooking, ephemera, printable, etc.)
2. **Theme-specific keywords** that match the product content (e.g., if product shows gnomes, include "gnomes", "gnome", "dwarf", "fairy tale", etc.; if it shows gardens, include "garden", "butterfly", "flowers", "nature", etc.)

**BE INCLUSIVE** - Include keywords if they:
- Are related to junk journals, scrapbooking, crafting
- Match the themes/subjects shown in the product (gnomes, dwarfs, gardens, butterflies, flowers, nature, pastel, whimsical, etc.)
- Are relevant to the product being sold

EXCLUDE ONLY keywords about:
- Furniture
- Clothing (unless craft-related)
- Food/cooking
- Completely unrelated products

**CRITICAL**: Do NOT filter out theme-specific keywords. If the product shows gnomes/gardens/butterflies/etc., include those keywords from the list.

Output ONLY a JSON array of keyword strings that are relevant. Format: ["keyword1", "keyword2", "keyword3"]`
                },
                {
                  role: 'user',
                  content: `Analyze these product descriptions and select ALL relevant keywords from the list below.

Product Theme: ${productTheme || 'Not specified - analyze from descriptions'}

Product Descriptions:
${allPrompts}

Keywords to select from (volume ≥ 100):
${allLongTailKeywords.map(k => `${k.keyword} (vol: ${k.volume})`).join('\n')}

**Select keywords that are:**
1. Related to junk journals, scrapbooking, crafting (include these)
2. **Theme-specific keywords that match the product theme**${productTheme ? `: "${productTheme}"` : ''} (e.g., if theme is gnomes/dwarfs, include ALL gnome/dwarf/fairy tale keywords; if theme is gardens/butterflies, include ALL garden/butterfly/flower/nature keywords)

**BE INCLUSIVE** - Include theme-specific keywords if they appear in the list and match the product theme${productTheme ? ` "${productTheme}"` : ''} described above. Do NOT filter them out.

Output ONLY a JSON array of the selected keywords (just the keyword strings, no volumes).`
                }
              ],
              max_tokens: 500,
              temperature: 0.3,
            }),
          });
          
          if (filterResponse.ok) {
            const filterData = await filterResponse.json();
            const filterContent = filterData.choices?.[0]?.message?.content || '';
            
            // Try to parse JSON array
            try {
              const jsonMatch = filterContent.match(/\[.*?\]/s);
              if (jsonMatch) {
                const relevantKeywords = JSON.parse(jsonMatch[0]) as string[];
                // Map back to full keyword objects with volumes
                filteredLongTailKeywords = allLongTailKeywords.filter(k => 
                  relevantKeywords.includes(k.keyword)
                );
              }
            } catch (parseError) {
              console.warn('[ArcaneSplitter] Failed to parse filtered keywords, using all keywords');
              filteredLongTailKeywords = allLongTailKeywords;
            }
          } else {
            console.warn('[ArcaneSplitter] Failed to filter keywords, using all keywords');
            filteredLongTailKeywords = allLongTailKeywords;
          }
        } catch (filterError) {
          console.warn('[ArcaneSplitter] Error filtering keywords, using all keywords:', filterError);
          filteredLongTailKeywords = allLongTailKeywords;
        }
      }
      
      // Generate just ONE listing with title, description, tags, and filtered long tail keywords
      setGeneratedListings([{ title, description, tags, filteredLongTailKeywords }]);
      console.log(`[ArcaneSplitter] Generated 1 listing for ${analyzedSlices.length} images with ${filteredLongTailKeywords.length} filtered long tail keywords`);
    } catch (err: any) {
      console.error('[ArcaneSplitter] Listing generation error:', err);
      setError(`Failed to generate listings: ${err.message}`);
    } finally {
      setIsGeneratingListings(false);
    }
  }, [csvKeywords, slices]);
  
  // Copy seed keywords (one per line)
  const handleCopySeedKeywords = useCallback(async () => {
    if (seedKeywords.length === 0) return;
    const text = seedKeywords.join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedSeedKeywords(true);
    setTimeout(() => setCopiedSeedKeywords(false), 2000);
  }, [seedKeywords]);
  
  // Copy tags (comma-separated)
  const handleCopyTags = useCallback(async (tags: string[], index: number) => {
    const text = tags.join(', ');
    await navigator.clipboard.writeText(text);
    setCopiedTagsIndex(index);
    setTimeout(() => setCopiedTagsIndex(null), 2000);
  }, []);
  
  const analyzedCount = slices.filter(s => s.prompt).length;
  
  return (
    <div className="bg-slate-900 rounded-xl border border-purple-500/30 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-amber-900/30 px-6 py-4 border-b border-purple-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Scissors className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Arcane Splitter</h2>
              <p className="text-sm text-slate-400">Slice grids & generate AI prompts</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {/* Drop Zone - Always visible, compact when slices exist */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl text-center cursor-pointer
            transition-all duration-300
            ${slices.length > 0 
              ? 'p-4' 
              : 'p-12'}
            ${isDragging 
              ? 'border-purple-500 bg-purple-500/10' 
              : 'border-slate-700 hover:border-purple-500/50 hover:bg-slate-800/50'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          
          {isSlicing ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-sm text-white">Slicing into 12 images...</p>
            </div>
          ) : (
            <div className={`flex flex-col items-center ${slices.length > 0 ? 'gap-2' : 'gap-4'}`}>
              <div className={`
                ${slices.length > 0 ? 'w-10 h-10' : 'w-16 h-16'} rounded-full flex items-center justify-center
                ${isDragging ? 'bg-purple-500/20' : 'bg-slate-800'}
              `}>
                <Upload className={`${slices.length > 0 ? 'w-5 h-5' : 'w-8 h-8'} ${isDragging ? 'text-purple-400' : 'text-slate-500'}`} />
              </div>
              <div>
                <p className={`${slices.length > 0 ? 'text-sm' : 'text-lg'} font-medium text-white`}>
                  {isDragging ? 'Drop your image here' : slices.length > 0 ? 'Add another 4×3 grid' : 'Drop your 4×3 grid image'}
                </p>
                {slices.length === 0 && (
                  <p className="text-sm text-slate-500 mt-1">
                    Will auto-slice into 12 images • Paste with Ctrl+V
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Etsy Listing Import */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <ShoppingBag className="w-4 h-4 text-orange-400" />
              </div>
              <input
                type="text"
                value={etsyUrl}
                onChange={(e) => setEtsyUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchEtsyListing()}
                placeholder="Paste Etsy listing URL (e.g., https://www.etsy.com/listing/1234567890/...)"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
                disabled={isFetchingEtsy}
              />
            </div>
            <button
              onClick={handleFetchEtsyListing}
              disabled={isFetchingEtsy || !etsyUrl.trim()}
              className="px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              {isFetchingEtsy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {etsyFetchProgress.total > 0 
                    ? `${etsyFetchProgress.current}/${etsyFetchProgress.total}` 
                    : 'Loading...'}
                </>
              ) : (
                <>
                  <Link className="w-4 h-4" />
                  Import
                </>
              )}
            </button>
          </div>
          
          {/* Slice as grids toggle */}
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={etsySliceGrids}
                onChange={(e) => setEtsySliceGrids(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/50"
              />
              <span className="text-slate-300">Slice as 4×3 grids</span>
            </label>
            <span className="text-slate-500 text-xs">
              {etsySliceGrids 
                ? '(Each image → 12 slices)' 
                : '(Import as individual images)'}
            </span>
          </div>
        </div>
        
        {/* Keyword Analysis & Listing Generation Tool */}
        {analyzedCount > 0 && (
          <div className="bg-slate-800/50 rounded-lg border border-purple-500/30 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Keyword Analysis & Listing Generator</h3>
            </div>
            
            {/* Step 1: Generate Seed Keywords */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Step 1: Generate Seed Keywords</label>
                <button
                  onClick={handleGenerateSeedKeywords}
                  disabled={isGeneratingKeywords || analyzedCount === 0}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors"
                >
                  {isGeneratingKeywords ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate Keywords
                    </>
                  )}
                </button>
              </div>
              
              {seedKeywords.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Seed Keywords ({seedKeywords.length})</span>
                    <button
                      onClick={handleCopySeedKeywords}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"
                    >
                      {copiedSeedKeywords ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{seedKeywords.join('\n')}</pre>
                  </div>
                </div>
              )}
            </div>
            
            {/* Step 2: Upload CSV */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Step 2: Upload CSV with Keywords & Volume</label>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvUpload(file);
                  }}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  {csvFile ? csvFile.name : 'Upload CSV (keyword,vol)'}
                </label>
              </div>
              
              {csvKeywords.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <span className="text-xs text-slate-400">Loaded {csvKeywords.length} keywords from CSV</span>
                </div>
              )}
            </div>
            
            {/* Product Theme Input */}
            {csvKeywords.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Product Theme (optional)</label>
                <input
                  type="text"
                  value={productTheme}
                  onChange={(e) => setProductTheme(e.target.value)}
                  placeholder="e.g., gnomes, garden, butterflies, fairy tale, nature..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-slate-400">Enter the main theme to help filter relevant keywords (e.g., "gnomes", "garden", "butterflies")</p>
              </div>
            )}
            
            {/* Step 3: Generate Listings */}
            {csvKeywords.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Step 3: Generate Descriptions & Tags</label>
                  <button
                    onClick={handleGenerateListings}
                    disabled={isGeneratingListings || csvKeywords.length === 0}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors"
                  >
                    {isGeneratingListings ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Listings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {/* Generated Listings */}
            {generatedListings.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-300">Generated Listing</h4>
                <div className="space-y-3">
                  {generatedListings.map((listing, index) => {
                    // Use ChatGPT-filtered long tail keywords
                    const longTailKeywords = listing.filteredLongTailKeywords || [];
                    
                    return (
                      <div key={index} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                        {listing.title && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-purple-400">Title</span>
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(listing.title!);
                                  alert('Title copied to clipboard!');
                                }}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                            </div>
                            <p className="text-sm font-semibold text-white">{listing.title}</p>
                          </div>
                        )}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-purple-400">Description</span>
                            <button
                              onClick={async () => {
                                await navigator.clipboard.writeText(listing.description);
                                alert('Description copied to clipboard!');
                              }}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              Copy
                            </button>
                          </div>
                          <p className="text-sm text-white whitespace-pre-wrap">{listing.description}</p>
                        </div>
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-purple-400">Tags ({listing.tags.length})</span>
                            <button
                              onClick={() => handleCopyTags(listing.tags, index)}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"
                            >
                              {copiedTagsIndex === index ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy Tags
                                </>
                              )}
                            </button>
                          </div>
                          <span className="text-xs text-slate-300">{listing.tags.join(', ')}</span>
                        </div>
                        
                        {/* Long Tail Keywords Section */}
                        {longTailKeywords.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-amber-400">
                                Long Tail Keywords (Volume ≥ 100) ({longTailKeywords.length})
                              </span>
                              <button
                                onClick={async () => {
                                  const keywordsText = longTailKeywords.map(k => `${k.keyword} (vol: ${k.volume})`).join('\n');
                                  await navigator.clipboard.writeText(keywordsText);
                                  alert('Long tail keywords copied to clipboard!');
                                }}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              <div className="space-y-1">
                                {longTailKeywords.map((keyword, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-300">{keyword.keyword}</span>
                                    <span className="text-amber-400 font-medium ml-2">vol: {keyword.volume}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Sliced Images Grid */}
        {slices.length > 0 && (
          <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="font-medium text-white">{slices.length}</span> slices
                {sourceImages.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-amber-400">{sourceImages.length}</span> grid{sourceImages.length !== 1 ? 's' : ''}
                  </>
                )}
                {analyzedCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-purple-400">{analyzedCount}</span> analyzed
                  </>
                )}
                {selectedSlices.size > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-blue-400">{selectedSlices.size}</span> selected
                  </>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {/* Selection Controls */}
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white
                    flex items-center gap-2 transition-colors"
                >
                  {selectedSlices.size === slices.length ? 'Deselect All' : 'Select All'}
                </button>
                
                {selectedSlices.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium text-white
                      flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Selected ({selectedSlices.size})
                  </button>
                )}
                {hasApiKey ? (
                  <>
                    {/* Main Topic Input for Analysis Context */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-300 whitespace-nowrap">
                        {mainTopic ? (
                          <span className="text-purple-400" title="Topic set - analysis will use this context">
                            Topic:
                          </span>
                        ) : (
                          <span>Main Topic:</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={mainTopic}
                        onChange={(e) => setMainTopic(e.target.value)}
                        placeholder="e.g., kitchen items, vintage tools, pastel decor..."
                        className={`px-3 py-2 bg-slate-800 border rounded-lg text-sm text-white
                          placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                          min-w-[200px] flex-1 transition-colors ${
                            mainTopic 
                              ? 'border-purple-500/50' 
                              : 'border-slate-600'
                          }`}
                        title={mainTopic 
                          ? `Analysis will assume images are related to: "${mainTopic}"`
                          : "Enter the main theme/topic to help AI analyze images in the correct context (optional)"}
                      />
                      {mainTopic && (
                        <button
                          onClick={() => setMainTopic('')}
                          className="text-slate-400 hover:text-white transition-colors p-1"
                          title="Clear topic"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {/* Detail Level Selector */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
                      <span className="text-xs text-slate-400 whitespace-nowrap">Detail:</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDetailLevel('normal')}
                          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                            detailLevel === 'normal'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                          title="Normal detail level - standard prompts (100-200 words)"
                        >
                          Normal
                        </button>
                        <button
                          onClick={() => setDetailLevel('detailed')}
                          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                            detailLevel === 'detailed'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                          title="Too detailed - extremely detailed prompts (200-400 words)"
                        >
                          Too Detailed
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleAnalyzeAll}
                      disabled={isAnalyzing || isSortingBySimilarity}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Consulting Oracle... ({analysisProgress.completed}/{analysisProgress.total})
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Analyze All
                        </>
                      )}
                    </button>
                    
                    {slices.length >= 2 && analyzedCount === slices.length && (
                      <button
                        onClick={handleSortBySimilarity}
                        disabled={isSortingBySimilarity || isAnalyzing}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white
                          disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        title="Group visually similar images together based on their prompts"
                      >
                        {isSortingBySimilarity ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {sortProgress.phase === 'Grouping' 
                              ? 'Grouping by prompts...' 
                              : `${sortProgress.phase}...`}
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Sort by Similarity
                          </>
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
                    Set VITE_OPENAI_API_KEY to enable AI analysis
                  </div>
                )}
                
                <button
                  onClick={handleDownloadZip}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white
                    flex items-center gap-2 transition-colors"
                >
                  <Archive className="w-4 h-4" />
                  Download ZIP
                </button>
                
                {/* WordPress Upload Toggle - Available as soon as there are slices (can upload while analyzing) */}
                {slices.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
                      <input
                        type="checkbox"
                        id="wordpress-upload-toggle"
                        checked={uploadToWordPress}
                        onChange={(e) => setUploadToWordPress(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-600 focus:ring-amber-500 focus:ring-offset-slate-800 cursor-pointer"
                      />
                      <label htmlFor="wordpress-upload-toggle" className="text-xs text-slate-300 cursor-pointer whitespace-nowrap">
                        Upload to WordPress
                      </label>
                    </div>
                    
                    {/* WordPress Upload Button (shown when toggle is on) */}
                    {uploadToWordPress && (
                      <button
                        onClick={handleUploadToWordPress}
                        disabled={isUploadingToWordPress || slices.length === 0}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white
                          disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        title="Upload all sliced images to WordPress and include URLs in prompts (can run while analysis is in progress)"
                      >
                        {isUploadingToWordPress ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Uploading ({wordPressUploadProgress.completed}/{wordPressUploadProgress.total})
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Upload to WordPress
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                
                {analyzedCount > 0 && (
                  <>
                    <button
                      onClick={handleCopyPrompts}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white
                        flex items-center gap-2 transition-colors"
                    >
                      {copiedPrompts ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      {copiedPrompts ? 'Copied!' : 'Copy Prompts'}
                    </button>
                    
                    {onPromptsGenerated && (
                      <>
                        {/* Images Per Prompt Selector */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700" title="Midjourney generates 4 images per prompt. Choose how many to keep.">
                          <span className="text-xs text-slate-400">Keep:</span>
                          <div className="flex gap-1">
                            {([1, 2, 4] as const).map((num) => (
                              <button
                                key={num}
                                onClick={() => setImagesPerPrompt(num)}
                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                  imagesPerPrompt === num
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                              >
                                {num}/4
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <button
                          onClick={handleUsePrompts}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white
                            flex items-center gap-2 transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Use in Bulk Mode ({analyzedCount * imagesPerPrompt} images)
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Grids List - Show uploaded grids with delete option */}
            {sourceImages.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-400">Uploaded Grids ({sourceImages.length})</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {sourceImages.map((grid) => {
                    const gridSliceCount = slices.filter(s => s.gridId === grid.id).length;
                    return (
                      <div
                        key={grid.id}
                        className="group relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-purple-500/50 transition-colors"
                      >
                        <div className="aspect-square relative">
                          <img
                            src={grid.base64}
                            alt={`Grid ${grid.id}`}
                            className="w-full h-full object-contain bg-slate-900"
                          />
                          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() => {
                                if (confirm(`Delete this grid and all ${gridSliceCount} slices?`)) {
                                  handleDeleteGrid(grid.id);
                                }
                              }}
                              className="p-2 bg-red-600 rounded-lg hover:bg-red-500"
                              title="Delete Grid"
                            >
                              <Trash2 className="w-5 h-5 text-white" />
                            </button>
                          </div>
                        </div>
                        <div className="p-2 text-center">
                          <p className="text-xs text-slate-400">{gridSliceCount} slices</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Slices Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {slices.map((slice, index) => (
                <div
                  key={slice.id}
                  draggable
                  onDragStart={() => handleSliceDragStart(index)}
                  onDragOver={(e) => handleSliceDragOver(e, index)}
                  onDragEnd={handleSliceDragEnd}
                  className={`group relative bg-slate-800 rounded-lg overflow-hidden border transition-colors
                    ${selectedSlices.has(slice.id) 
                      ? 'border-blue-500 ring-2 ring-blue-500/50' 
                      : 'border-slate-700 hover:border-purple-500/50'}
                    ${draggedIndex === index ? 'opacity-50' : ''}
                  `}
                >
                  {/* Selection Checkbox */}
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedSlices.has(slice.id)}
                      onChange={() => handleToggleSelect(slice.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  {/* Reorder Controls */}
                  <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(index);
                      }}
                      disabled={index === 0}
                      className="p-1 bg-slate-900/80 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(index);
                      }}
                      disabled={index === slices.length - 1}
                      className="p-1 bg-slate-900/80 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* Drag Handle */}
                  <div className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-move">
                    <GripVertical className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Image */}
                  <div className="aspect-square relative">
                    <img
                      src={slice.base64}
                      alt={slice.name || `Slice ${slice.row + 1}-${slice.col + 1}`}
                      className="w-full h-full object-contain bg-slate-900"
                    />
                    
                    {/* Loading Overlay */}
                    {slice.isAnalyzing && (
                      <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                        <span className="text-sm text-purple-400 mt-2">Consulting Oracle...</span>
                      </div>
                    )}
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => setPreviewSlice(slice)}
                        className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => handleDownloadSlice(slice)}
                        className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"
                        title="Download"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                      {hasApiKey && !slice.prompt && !slice.isAnalyzing && (
                        <button
                          onClick={() => handleAnalyzeSingle(slice.id)}
                          className="p-2 bg-purple-600 rounded-lg hover:bg-purple-500"
                          title="Analyze"
                        >
                          <Wand2 className="w-4 h-4 text-white" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this slice?')) {
                            handleDeleteSlice(slice.id);
                          }
                        }}
                        className="p-2 bg-red-600 rounded-lg hover:bg-red-500"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="p-3">
                    {slice.name ? (
                      <h4 className="font-medium text-white text-sm truncate">{slice.name}</h4>
                    ) : (
                      <h4 className="text-slate-500 text-sm">Row {slice.row + 1}, Col {slice.col + 1}</h4>
                    )}
                    
                    {slice.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{slice.description}</p>
                    )}
                    
                    {slice.analysisError && (
                      <p className="text-xs text-red-400 mt-1">{slice.analysisError}</p>
                    )}
                    
                    {slice.prompt && (
                      <div className="mt-2">
                        <div className="text-xs font-mono bg-slate-900 p-2 rounded text-slate-300 line-clamp-3">
                          {slice.prompt}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Clear All Button */}
            <button
              onClick={() => {
                if (confirm(`Clear all ${slices.length} slices and ${sourceImages.length} grids?`)) {
                  setSourceImages([]);
                  setSlices([]);
                  setSelectedSlices(new Set());
                }
              }}
              className="w-full py-3 px-4 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
            >
              Clear All ({slices.length} slices)
            </button>
          </div>
        )}
      </div>
      
      {/* Preview Modal */}
      {previewSlice && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewSlice(null)}
        >
          <div
            className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{previewSlice.name || 'Preview'}</h3>
              <button
                onClick={() => setPreviewSlice(null)}
                className="p-2 hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <img
                src={previewSlice.base64}
                alt={previewSlice.name || 'Preview'}
                className="w-full max-h-96 object-contain bg-slate-800 rounded-lg"
              />
              
              {previewSlice.description && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Description</h4>
                  <p className="text-white">{previewSlice.description}</p>
                </div>
              )}
              
              {previewSlice.prompt && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Generated Prompt</h4>
                  <div className="bg-slate-800 p-4 rounded-lg font-mono text-sm text-slate-300 whitespace-pre-wrap">
                    {previewSlice.prompt}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadSlice(previewSlice)}
                  className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                {previewSlice.prompt && (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(previewSlice.prompt!);
                    }}
                    className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-500 rounded-lg text-white flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Prompt
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArcaneSplitter;

