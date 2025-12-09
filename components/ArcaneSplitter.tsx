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
  Sparkles,
  Download,
  Copy,
  Check,
  Loader2,
  Grid3X3,
  Wand2,
  Archive,
  Eye,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
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
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [gridConfig, setGridConfig] = useState<GridConfig>({ rows: 2, cols: 2 });
  const [slices, setSlices] = useState<AnalyzedSlice[]>([]);
  const [isSlicing, setIsSlicing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewSlice, setPreviewSlice] = useState<AnalyzedSlice | null>(null);
  const [copiedPrompts, setCopiedPrompts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  
  // Check if OpenAI API is configured (uses existing key)
  const hasApiKey = hasOpenAIKey();
  
  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setSourceImage(base64);
      setSlices([]);
      
      // Auto-detect grid configuration
      const detectedConfig = await detectGridConfig(base64);
      setGridConfig(detectedConfig);
      console.log('[ArcaneSplitter] Detected grid config:', detectedConfig);
    };
    reader.readAsDataURL(file);
  }, []);
  
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
  
  // Slice the image
  const handleSlice = useCallback(async () => {
    if (!sourceImage) return;
    
    setIsSlicing(true);
    setError(null);
    
    try {
      const slicedImages = await sliceGridImage(sourceImage, gridConfig, autoCrop);
      setSlices(slicedImages.map(s => ({ ...s, isAnalyzing: false })));
      console.log(`[ArcaneSplitter] Created ${slicedImages.length} slices`);
    } catch (err: any) {
      setError(err.message || 'Failed to slice image');
      console.error('[ArcaneSplitter] Slicing error:', err);
    } finally {
      setIsSlicing(false);
    }
  }, [sourceImage, gridConfig, autoCrop]);
  
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
      setSlices(analyzed);
      
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
      s.id === sliceId ? analyzed : s
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
        
        {/* Drop Zone */}
        {!sourceImage && (
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
              transition-all duration-300
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
            
            <div className="flex flex-col items-center gap-4">
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                ${isDragging ? 'bg-purple-500/20' : 'bg-slate-800'}
              `}>
                <Upload className={`w-8 h-8 ${isDragging ? 'text-purple-400' : 'text-slate-500'}`} />
              </div>
              <div>
                <p className="text-lg font-medium text-white">
                  {isDragging ? 'Drop your image here' : 'Drop a grid image or click to upload'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Supports PNG, JPG, WebP • You can also paste (Ctrl+V)
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Source Image Preview & Settings */}
        {sourceImage && slices.length === 0 && (
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-slate-800">
              <img 
                src={sourceImage} 
                alt="Source" 
                className="w-full max-h-96 object-contain"
              />
              <button
                onClick={() => setSourceImage(null)}
                className="absolute top-2 right-2 p-2 bg-slate-900/80 rounded-lg hover:bg-slate-900"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            
            {/* Grid Settings */}
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <Grid3X3 className="w-5 h-5 text-purple-400" />
                  <span className="font-medium text-white">Grid Settings</span>
                  <span className="text-sm text-slate-400">({gridConfig.rows}×{gridConfig.cols})</span>
                </div>
                {showSettings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              
              {showSettings && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Rows</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={gridConfig.rows}
                      onChange={(e) => setGridConfig(prev => ({ ...prev, rows: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Columns</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={gridConfig.cols}
                      onChange={(e) => setGridConfig(prev => ({ ...prev, cols: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCrop}
                        onChange={(e) => setAutoCrop(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-300">Auto-crop whitespace/borders</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            
            {/* Slice Button */}
            <button
              onClick={handleSlice}
              disabled={isSlicing}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-amber-600 rounded-lg font-medium text-white
                hover:from-purple-500 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 transition-all"
            >
              {isSlicing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Slicing...
                </>
              ) : (
                <>
                  <Scissors className="w-5 h-5" />
                  Slice into {gridConfig.rows * gridConfig.cols} Images
                </>
              )}
            </button>
          </div>
        )}
        
        {/* Sliced Images Grid */}
        {slices.length > 0 && (
          <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="font-medium text-white">{slices.length}</span> slices
                {analyzedCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-purple-400">{analyzedCount}</span> analyzed
                  </>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
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
            
            {/* Slices Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {slices.map((slice) => (
                <div
                  key={slice.id}
                  className="group relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-purple-500/50 transition-colors"
                >
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
                      >
                        <Eye className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => handleDownloadSlice(slice)}
                        className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                      {hasApiKey && !slice.prompt && !slice.isAnalyzing && (
                        <button
                          onClick={() => handleAnalyzeSingle(slice.id)}
                          className="p-2 bg-purple-600 rounded-lg hover:bg-purple-500"
                        >
                          <Wand2 className="w-4 h-4 text-white" />
                        </button>
                      )}
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
            
            {/* New Image Button */}
            <button
              onClick={() => {
                setSourceImage(null);
                setSlices([]);
              }}
              className="w-full py-3 px-4 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
            >
              Process Another Image
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

