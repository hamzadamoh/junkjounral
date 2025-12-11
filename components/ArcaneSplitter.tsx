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

interface ArcaneSplitterProps {
  onPromptsGenerated?: (prompts: string[]) => void;
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
  
  
  // Analyze all slices with GPT-4 Vision
  const handleAnalyzeAll = useCallback(async () => {
    if (slices.length === 0 || !hasApiKey) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress({ completed: 0, total: slices.length });
    setError(null);
    
    // Mark all as analyzing
    setSlices(prev => prev.map(s => ({ ...s, isAnalyzing: true })));
    
    try {
      const analyzed = await analyzeAllImages(slices, (completed, total) => {
        setAnalysisProgress({ completed, total });
      });
      // Preserve gridId for each analyzed slice
      setSlices(prev => {
        const gridIdMap = new Map(prev.map(s => [s.id, s.gridId]));
        return analyzed.map(s => ({ ...s, gridId: gridIdMap.get(s.id) }));
      });
      
      // Notify parent of generated prompts
      const prompts = analyzed.filter(s => s.prompt).map(s => s.prompt!);
      onPromptsGenerated?.(prompts);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [slices, hasApiKey, onPromptsGenerated]);
  
  // Analyze single slice
  const handleAnalyzeSingle = useCallback(async (sliceId: string) => {
    if (!hasApiKey) return;
    
    const slice = slices.find(s => s.id === sliceId);
    if (!slice) return;
    
    setSlices(prev => prev.map(s => 
      s.id === sliceId ? { ...s, isAnalyzing: true } : s
    ));
    
    const analyzed = await analyzeSingleSlice(slice);
    setSlices(prev => prev.map(s => 
      s.id === sliceId ? { ...analyzed, gridId: s.gridId } : s // Preserve gridId
    ));
  }, [slices, hasApiKey]);
  
  // Download all slices as ZIP
  const handleDownloadZip = useCallback(async () => {
    if (slices.length === 0) return;
    await downloadSlicesAsZip(slices, 'arcane-slices');
  }, [slices]);
  
  // Copy all prompts
  const handleCopyPrompts = useCallback(async () => {
    const prompts = await copyAllPrompts(slices);
    setCopiedPrompts(true);
    setTimeout(() => setCopiedPrompts(false), 2000);
    
    // Also notify parent
    const promptList = slices.filter(s => s.prompt).map(s => s.prompt!);
    onPromptsGenerated?.(promptList);
  }, [slices, onPromptsGenerated]);
  
  // Use prompts in bulk mode
  const handleUsePrompts = useCallback(() => {
    const prompts = slices.filter(s => s.prompt).map(s => s.prompt!);
    onPromptsGenerated?.(prompts);
    onClose?.();
  }, [slices, onPromptsGenerated, onClose]);
  
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
                  <button
                    onClick={handleAnalyzeAll}
                    disabled={isAnalyzing}
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
                    
                    {onPromptsGenerated && (
                      <button
                        onClick={handleUsePrompts}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white
                          flex items-center gap-2 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Use in Bulk Mode
                      </button>
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

