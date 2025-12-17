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
  const [uploadToWordPress, setUploadToWordPress] = useState<boolean>(false); // WordPress upload toggle
  const [isUploadingToWordPress, setIsUploadingToWordPress] = useState<boolean>(false); // Upload progress
  const [wordPressUploadProgress, setWordPressUploadProgress] = useState({ completed: 0, total: 0 }); // WordPress upload progress
  const autoCrop = true; // Always auto-crop
  
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
      const response = await fetch(`/api/etsy/listing?listingId=${listingId}`);

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

      // Fetch ALL images in parallel for speed
      let completedCount = 0;
      const fetchPromises = imageUrls.map(async (imageUrl: string, i: number) => {
        try {
          // Fetch image via proxy to avoid CORS
          const imgResponse = await fetch(`/api/ttapi/image?url=${encodeURIComponent(imageUrl)}`);
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
      }, topic || undefined);
      // Preserve gridId for each analyzed slice
      setSlices(prev => {
        const gridIdMap = new Map(prev.map(s => [s.id, s.gridId]));
        return analyzed.map(s => ({ ...s, gridId: gridIdMap.get(s.id) }));
      });
      
      // Don't auto-navigate to generation - let user sort first if they want
      // User can click "Use in Bulk Mode" when ready
      console.log(`[ArcaneSplitter] Analysis complete! ${analyzed.filter(s => s.prompt).length} prompts generated. You can now sort by similarity or use prompts.`);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [slices, hasApiKey, mainTopic]);
  
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
    
    const analyzed = await analyzeSingleSlice(slice, topic || undefined);
    setSlices(prev => prev.map(s => 
      s.id === sliceId ? { ...analyzed, gridId: s.gridId } : s // Preserve gridId
    ));
  }, [slices, hasApiKey, mainTopic]);
  
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
      const updatedSlices = await Promise.all(
        slices.map(async (slice, index) => {
          try {
            const wordPressUrl = await uploadImageToWordPress(slice.base64);
            setWordPressUploadProgress({ completed: index + 1, total: slices.length });
            return { ...slice, wordPressUrl };
          } catch (error: any) {
            console.error(`[ArcaneSplitter] Failed to upload slice ${slice.id}:`, error);
            return slice; // Keep original slice if upload fails
          }
        })
      );
      
      setSlices(updatedSlices);
      console.log(`[ArcaneSplitter] ✅ Uploaded ${updatedSlices.filter(s => (s as any).wordPressUrl).length}/${slices.length} images to WordPress`);
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
    const prompts = slices.filter(s => s.prompt).map(s => {
      const wordPressUrl = (s as any).wordPressUrl;
      if (wordPressUrl) {
        // If WordPress URL exists, always include it in the prompt (Midjourney image reference format)
        return `${wordPressUrl} ${s.prompt!}`;
      }
      return s.prompt!;
    });
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
      
      const sortResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
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
                    
                    {/* WordPress Upload Toggle - Always visible when there are analyzed slices */}
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
                        title="Upload all sliced images to WordPress and include URLs in prompts"
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

