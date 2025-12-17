import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  Settings, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  ChevronLeft,
  Printer,
  FileDown,
  Archive,
  FileText,
  Eye,
  X,
  Copy,
  Check,
  Terminal,
  ChevronRight,
  Link,
  Table,
  Scissors,
  Upload,
  Folder,
  Square,
  CheckSquare
} from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { THEMES, OPTIONAL_ELEMENTS, APP_NAME } from './constants';
import { Theme, GenerationSettings, GenerationStatus, GeneratedImage } from './types';
import { generateJournalPage as generateWithPollinations } from './services/pollinationsService';
import { generateJournalPage as generateWithReplicate } from './services/replicateService';
import { generateJournalPage as generateWithTtapi } from './services/ttapiService';
import { generatePromptWithChatGPT, analyzeReferenceImage, generateImageSpecificSubjectList } from './services/chatgptService';
import { uploadImageToWordPress } from './services/imageHostingService';
import { uploadImagesToGoogleDrive, GoogleDriveUploadResult } from './services/googleDriveService';
import ArcaneSplitter from './components/ArcaneSplitter';

// Get password from environment variable (constant, doesn't change) - defined outside component to avoid re-renders
// Note: import.meta.env is replaced at build time by Vite, so this is safe
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || '';

const App: React.FC = () => {
  // ============================================
  // ALL HOOKS MUST BE DECLARED AT THE TOP LEVEL
  // BEFORE ANY CONDITIONAL RETURNS
  // ============================================
  
  // --- Password Protection State ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [password, setPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [isCheckingPassword, setIsCheckingPassword] = useState<boolean>(false);
  
  // --- Main App State ---
  const [step, setStep] = useState<number>(1);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [isCustomTheme, setIsCustomTheme] = useState<boolean>(false);
  const [isImageThemeExpansion, setIsImageThemeExpansion] = useState<boolean>(false);
  const [isSrefMode, setIsSrefMode] = useState<boolean>(false);
  const [isBulkPromptMode, setIsBulkPromptMode] = useState<boolean>(false);
  const [srefCode, setSrefCode] = useState<string>('');
  const [srefSubject, setSrefSubject] = useState<string>('');
  const [srefCategory, setSrefCategory] = useState<string>(''); // Selected category for SREF mode
  const [srefMoodboard, setSrefMoodboard] = useState<string>(''); // Midjourney moodboard ID (--p parameter)
  const [bulkPrompts, setBulkPrompts] = useState<string>(''); // Bulk prompts text (each paragraph is a prompt)
  const [bulkMoodboard, setBulkMoodboard] = useState<string>(''); // Moodboard for all bulk prompts
  const [bulkSrefCode, setBulkSrefCode] = useState<string>(''); // SREF code for all bulk prompts
  const [bulkImagesPerPrompt, setBulkImagesPerPrompt] = useState<1 | 2 | 4>(4); // Images per prompt for Midjourney
  const [showArcaneSplitter, setShowArcaneSplitter] = useState<boolean>(false); // Show Arcane Splitter for grid image processing
  const [customThemePrompt, setCustomThemePrompt] = useState<string>('');
  const [singleImageForTheme, setSingleImageForTheme] = useState<{ id: string; base64: string; theme?: string; style?: string; colors?: string; vibe?: string; styleRefUrl?: string; fullAnalysis?: any } | null>(null);
  const [settings, setSettings] = useState<GenerationSettings>({
    pageCount: 1,
    textureIntensity: 'Medium',
    colorIntensity: 'Muted',
    pageStyle: 'Full Page',
    elements: [],
    includeFrames: false,
    includeBorders: false,
    aspectRatio: '1:1',
    midjourneyMode: 'fast',
    parametersForMJ: '',
    imageService: 'ttapi',
    replicateModel: 'black-forest-labs/flux-1.1-pro',
    customThemePrompt: '',
    customArtStyle: '',
    promptService: 'openai',
  });
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [consoleLogs, setConsoleLogs] = useState<Array<{ id: string; message: string; timestamp: number; type: 'log' | 'error' | 'success' }>>([]);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; base64: string; theme?: string; style?: string; colors?: string; vibe?: string; styleRefUrl?: string; fullAnalysis?: any }>>([]);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [styleRefUrl, setStyleRefUrl] = useState<string | null>(null);
  const [isUploadingStyleRef, setIsUploadingStyleRef] = useState<boolean>(false);
  const [isUploadingToGoogleDrive, setIsUploadingToGoogleDrive] = useState<boolean>(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState<boolean>(false);
  const [googleDriveModalData, setGoogleDriveModalData] = useState<{
    title: string;
    message: string;
    folderUrl?: string;
    urls?: string[];
    type: 'success' | 'error';
  } | null>(null);
  
  // --- Refs ---
  const hasCheckedAuth = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- Callbacks ---
  const addLog = useCallback((message: string, type: 'log' | 'error' | 'success' = 'log') => {
    const logEntry = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      timestamp: Date.now(),
      type
    };
    setConsoleLogs(prev => [...prev, logEntry]);
    if (type === 'error') {
      console.error(message);
    } else if (type === 'success') {
      console.log(`✅ ${message}`);
    } else {
      console.log(message);
    }
  }, []);
  
  const processImage = useCallback(async (base64Image: string, imageId?: string) => {
    const id = imageId || crypto.randomUUID();
    setIsAnalyzingImage(true);
    setIsUploadingStyleRef(true);
    setUploadedImages(prev => [...prev, { id, base64: base64Image }]);
    try {
      const [analysis, wordPressUrl] = await Promise.allSettled([
        analyzeReferenceImage(base64Image),
        uploadImageToWordPress(base64Image)
      ]);
      let theme = '';
      let style = '';
      let colors = '';
      let vibe = '';
      if (analysis.status === 'fulfilled') {
        theme = analysis.value.theme || '';
        style = analysis.value.style || '';
        colors = analysis.value.colors || '';
        vibe = analysis.value.vibe || '';
        setUploadedImages(prev => prev.map(img => 
          img.id === id 
            ? { ...img, theme, style, colors, vibe, styleRefUrl: wordPressUrl.status === 'fulfilled' ? wordPressUrl.value : undefined, fullAnalysis: analysis.value }
            : img
        ));
        if (uploadedImages.length === 0) {
          setCustomThemePrompt(theme);
          let styleDescription = style;
          if (analysis.status === 'fulfilled' && analysis.value.clusters && analysis.value.clusters[0]) {
            const cluster = analysis.value.clusters[0];
            if (cluster.technique && !styleDescription.includes(cluster.technique)) {
              styleDescription = `${styleDescription} Technique: ${cluster.technique}.`;
            }
            if (cluster.dominant_textures && cluster.dominant_textures.length > 0) {
              styleDescription += ` Textures: ${cluster.dominant_textures.join(', ')}.`;
            }
          }
          if (vibe) {
            styleDescription += ` Vibe/Atmosphere: ${vibe}.`;
          }
          if (colors) {
            styleDescription += ` Color palette: ${colors}.`;
          }
          setSettings(prev => ({
            ...prev,
            customArtStyle: styleDescription,
            colorIntensity: 'Custom / Override',
            styleRefUrl: wordPressUrl.status === 'fulfilled' ? wordPressUrl.value : prev.styleRefUrl
          }));
        }
        const colorInfo = colors ? `, Colors="${colors}"` : '';
        const vibeInfo = vibe ? `, Vibe="${vibe}"` : '';
        addLog(`✅ Image ${uploadedImages.length + 1} analyzed: Theme="${theme}", Style="${style}"${colorInfo}${vibeInfo}`, 'success');
      } else {
        console.error('Image analysis error:', analysis.reason);
        addLog(`❌ Failed to analyze image ${uploadedImages.length + 1}: ${analysis.reason?.message || 'Unknown error'}`, 'error');
      }
      if (wordPressUrl.status === 'fulfilled') {
        setUploadedImages(prev => prev.map(img => 
          img.id === id ? { ...img, styleRefUrl: wordPressUrl.value } : img
        ));
        if (uploadedImages.length === 0) {
          setStyleRefUrl(wordPressUrl.value);
        }
        addLog(`✅ Style Reference ${uploadedImages.length + 1} uploaded: ${wordPressUrl.value}`, 'success');
      } else {
        console.error('WordPress upload error:', wordPressUrl.reason);
        addLog(`⚠️ Failed to upload style reference ${uploadedImages.length + 1}: ${wordPressUrl.reason?.message || 'Unknown error'}`, 'error');
      }
    } catch (error: any) {
      console.error('Unexpected error:', error);
      addLog(`❌ Unexpected error: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setIsAnalyzingImage(false);
      setIsUploadingStyleRef(false);
    }
  }, [addLog, uploadedImages.length]);
  
  const handleRemoveImage = useCallback((imageId: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== imageId));
    addLog(`🗑️ Image removed.`, 'log');
  }, [addLog]);
  
  // --- Effects ---

  // Check authentication on mount (only once)
  // All authentication logic is in useEffect to avoid render-time side effects
  useEffect(() => {
    // Prevent multiple executions (important for React Strict Mode)
    if (hasCheckedAuth.current) {
      return;
    }
    hasCheckedAuth.current = true;

    // Only run on client side
    if (typeof window === 'undefined') {
      setIsCheckingAuth(false);
      return;
    }

    // If no password is set in env, allow access (for development)
    // Check APP_PASSWORD directly (it's a constant, won't change)
    if (!APP_PASSWORD) {
      console.warn('⚠️ VITE_APP_PASSWORD not set. Allowing access without password.');
      setIsAuthenticated(true);
      setIsCheckingAuth(false);
      return;
    }
    
    // Check if user was previously authenticated (stored in sessionStorage)
    try {
      const wasAuthenticated = sessionStorage.getItem('app_authenticated') === 'true';
      setIsAuthenticated(wasAuthenticated);
    } catch (e) {
      // sessionStorage might not be available
      setIsAuthenticated(false);
    }
    setIsCheckingAuth(false);
  }, []); // Empty dependency array - only run once on mount
  
  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Clear logs when generation starts
  useEffect(() => {
    if (status === GenerationStatus.GENERATING) {
      setConsoleLogs([]);
      setShowSidebar(true);
    }
  }, [status]);
  
  // Handle paste event for images
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      // Only handle paste when we're on the custom theme step (step 2)
      if (step !== 2 || !isCustomTheme) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      // Find all images in clipboard
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        event.preventDefault();
        
        // Process all pasted images
        for (const file of imageFiles) {
          // Validate file size (max 20MB)
          if (file.size > 20 * 1024 * 1024) {
            alert(`Pasted image "${file.name}" is too large (max 20MB). Skipping...`);
            continue;
          }

          // Convert to base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64Image = e.target?.result as string;
            await processImage(base64Image);
            addLog(`📋 Image "${file.name}" pasted from clipboard`, 'success');
          };
          reader.onerror = () => {
            alert(`Failed to read pasted image "${file.name}"`);
          };
          reader.readAsDataURL(file);
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [step, isCustomTheme, processImage, addLog]);

  // Handle password authentication
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setIsCheckingPassword(true);

    // If no password is set in env, allow access (for development)
    if (!APP_PASSWORD) {
      console.warn('⚠️ VITE_APP_PASSWORD not set. Allowing access without password.');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('app_authenticated', 'true');
      }
      setIsAuthenticated(true);
      setIsCheckingPassword(false);
      return;
    }

    // Check password
    if (password === APP_PASSWORD) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('app_authenticated', 'true');
      }
      setIsAuthenticated(true);
      setPassword('');
      setIsCheckingPassword(false);
    } else {
      setPasswordError('Incorrect password. Please try again.');
      setPassword('');
      setIsCheckingPassword(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('app_authenticated');
    }
    setIsAuthenticated(false);
    setPassword('');
    setPasswordError('');
  };

  // Show loading screen while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gothic-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gothic-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gothic-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gothic-800/90 backdrop-blur-sm border-2 border-gothic-gold/30 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-serif text-gothic-gold mb-2">{APP_NAME}</h1>
            <p className="text-slate-400">Enter password to access</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
                autoFocus
                disabled={isCheckingPassword}
              />
              {passwordError && (
                <p className="mt-2 text-sm text-red-400">{passwordError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isCheckingPassword || !password.trim()}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all"
            >
              {isCheckingPassword ? 'Checking...' : 'Access App'}
            </button>
          </form>

          {!APP_PASSWORD && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-400">
              ⚠️ Password protection is disabled. Set VITE_APP_PASSWORD in environment variables to enable it.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Handlers ---

  const handleThemeSelect = (theme: Theme) => {
    const newTheme = theme.name;
    setSelectedTheme(theme);
    setIsCustomTheme(false);
    setCustomThemePrompt('');
    
    // Theme changed - no action needed (image-specific subject lists are generated per image)
    
    setStep(2);
  };

  const handleCustomThemeSelect = () => {
    setIsCustomTheme(true);
    setIsImageThemeExpansion(false);
    setIsSrefMode(false);
    setIsBulkPromptMode(false);
    setSelectedTheme(null);
  };

  const handleImageThemeExpansionSelect = () => {
    setIsImageThemeExpansion(true);
    setIsCustomTheme(false);
    setIsSrefMode(false);
    setIsBulkPromptMode(false);
    setSelectedTheme(null);
  };

  const handleSrefModeSelect = () => {
    setIsSrefMode(true);
    setIsCustomTheme(false);
    setIsImageThemeExpansion(false);
    setIsBulkPromptMode(false);
    setSelectedTheme(null);
  };

  const handleBulkPromptModeSelect = () => {
    setIsBulkPromptMode(true);
    setIsCustomTheme(false);
    setIsImageThemeExpansion(false);
    setIsSrefMode(false);
    setSelectedTheme(null);
  };

  const handleCustomThemeSubmit = () => {
    if (customThemePrompt.trim()) {
      const newTheme = customThemePrompt.trim();
      
      // Create a custom theme object
      const customTheme: Theme = {
        id: 'custom',
        name: 'Custom Theme',
        description: customThemePrompt.trim(),
        thumbnail: 'https://picsum.photos/id/106/400/600', // Placeholder
        basePrompt: customThemePrompt.trim(),
        styleKeywords: ['custom', 'unique']
      };
      setSelectedTheme(customTheme);
      
      // Theme changed - no action needed (image-specific subject lists are generated per image)
      
      setStep(2);
    }
  };

  const handleSettingChange = (field: keyof GenerationSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Process all selected files
    const fileArray = Array.from(files);
    
    // Validate all files first
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        alert(`"${file.name}" is not an image file. Skipping...`);
        continue;
      }

      if (file.size > 20 * 1024 * 1024) {
        alert(`"${file.name}" is too large (max 20MB). Skipping...`);
        continue;
      }

      // Convert to base64 and process
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target?.result as string;
        await processImage(base64Image);
      };

      reader.onerror = () => {
        alert(`Failed to read "${file.name}"`);
      };

      reader.readAsDataURL(file);
    }
  };


  const toggleElement = (element: string) => {
    setSettings(prev => {
      const exists = prev.elements.includes(element);
      if (exists) {
        return { ...prev, elements: prev.elements.filter(e => e !== element) };
      } else {
        return { ...prev, elements: [...prev.elements, element] };
      }
    });
  };

  const startGeneration = async () => {
    // Allow generation if either a theme is selected OR a custom theme is being used
    if (!selectedTheme && !isCustomTheme) return;
    
    const total = settings.pageCount;
    const newImages: GeneratedImage[] = [];

    // Create placeholder images first
    for (let i = 0; i < total; i++) {
      const placeholderImage: GeneratedImage = {
        id: crypto.randomUUID(),
        url: '',
        prompt: 'Generating prompt...', // Will be updated with ChatGPT prompt
        timestamp: Date.now(),
        status: 'generating',
        variationNumber: i + 1
      };
      newImages.push(placeholderImage);
    }
    
    // Set all state together to ensure gallery shows immediately
    setGeneratedImages(newImages);
    setStep(4); // Go directly to gallery to show placeholders
    setStatus(GenerationStatus.GENERATING);
    setCurrentProgress(0);
    setErrorMsg(null);

    // STEP 1: Generate prompts
    addLog('Generating prompts...');
    
    // Check if we're in bulk prompt mode
    const isBulkPromptModeForTheme = selectedTheme?.id === 'bulk-prompt-import';
    
    // Handle bulk prompt mode - parse prompts and use them directly
    if (isBulkPromptModeForTheme && selectedTheme?.basePrompt) {
      const parsePrompts = (text: string): string[] => {
        return text
          .split(/\n\s*\n/) // Split by double newlines (paragraphs)
          .map(p => p.trim())
          .filter(p => p.length > 0);
      };
      
      const bulkPromptsList = parsePrompts(selectedTheme.basePrompt);
      const totalPrompts = bulkPromptsList.length;
      
      if (totalPrompts === 0) {
        setErrorMsg('No prompts detected. Please paste at least one prompt.');
        setStatus(GenerationStatus.ERROR);
        return;
      }
      
      addLog(`[Bulk Prompt Mode] Detected ${totalPrompts} prompt${totalPrompts !== 1 ? 's' : ''}. Generating images for each...`);
      
      // For Ttapi: use the user-selected images per prompt (1, 2, or 4)
      // For other services: always 1 image per prompt
      const imagesPerPromptToUse = settings.imageService === 'ttapi' ? bulkImagesPerPrompt : 1;
      const totalImagesToGenerate = totalPrompts * imagesPerPromptToUse;
      
      addLog(`[Bulk Prompt Mode] Using ${imagesPerPromptToUse} image(s) per prompt. Total: ${totalImagesToGenerate} images.`);
      const actualTotal = Math.min(totalImagesToGenerate, total);
      
      // Update placeholder images to match actual count
      const updatedImages = newImages.slice(0, actualTotal);
      setGeneratedImages(updatedImages);
      
      // Generate images for each prompt
      // For Ttapi: process sequentially with delays to avoid queue overflow
      // For other services: process in parallel
      const promptsToProcess = bulkPromptsList.slice(0, Math.ceil(actualTotal / imagesPerPromptToUse));
      
      if (settings.imageService === 'ttapi') {
        // Calculate dynamic batch size based on available accounts
        // With multiple accounts, we can send more parallel requests
        // Formula: accounts × 3 (e.g., 2 accounts = 6 parallel requests)
        const { getTTAPIAccountCount, getTTAPIAccountIds } = await import('./services/ttapiService');
        const accountCount = await getTTAPIAccountCount(settings.midjourneyMode || 'fast');
        const accountIds = await getTTAPIAccountIds(settings.midjourneyMode || 'fast');
        const maxConcurrent = accountCount * 3;
        const totalBatches = Math.ceil(promptsToProcess.length / maxConcurrent);
        addLog(`[Ttapi Bulk] Processing ${promptsToProcess.length} prompts in ${totalBatches} batch(es) with ${maxConcurrent} concurrent requests per batch (${accountCount} account(s) available, ${settings.midjourneyMode} mode)...`);
        
        // Track if we've detected relax mode issues and should switch to fast
        let shouldUseFastMode = false;
        
        // Process prompts in batches
        for (let batchStart = 0; batchStart < promptsToProcess.length; batchStart += maxConcurrent) {
          const batchEnd = Math.min(batchStart + maxConcurrent, promptsToProcess.length);
          const batchNumber = Math.floor(batchStart / maxConcurrent) + 1;
          
          addLog(`[Ttapi Bulk] 🚀 Starting batch ${batchNumber}/${totalBatches}: Processing ${batchEnd - batchStart} prompt(s) in parallel (prompts ${batchStart + 1}-${batchEnd} of ${promptsToProcess.length})...`, 'log');
          
          // Process this batch in parallel with round-robin account distribution
          const batchPromises = promptsToProcess.slice(batchStart, batchEnd).map(async (prompt, batchIndex) => {
            const promptIndex = batchStart + batchIndex;
            
            // Distribute requests across accounts in round-robin fashion
            // If we have 2 accounts and 6 requests: 0,2,4 → account[0], 1,3,5 → account[1]
            const accountId = accountIds.length > 0 ? accountIds[promptIndex % accountIds.length] : undefined;
            if (accountId) {
              console.log(`[Ttapi Bulk] Request ${promptIndex + 1} assigned to account: ${accountId}`);
            }
          
          try {
            // Apply moodboard and SREF if provided
            let finalPrompt = prompt.trim();
            
            // Add moodboard if provided
            if (bulkMoodboard.trim()) {
              let moodboardId = bulkMoodboard.trim();
              moodboardId = moodboardId.replace(/^--p\s*/i, '').trim();
              moodboardId = moodboardId.replace(/^m/, '').trim();
              finalPrompt += ` --p m${moodboardId}`;
            }
            
            // Add SREF if provided
            if (bulkSrefCode.trim()) {
              finalPrompt += ` --sref ${bulkSrefCode.trim()} --sw 1000`;
            }
            
            // Add aspect ratio
            if (settings.aspectRatio) {
              finalPrompt += ` --ar ${settings.aspectRatio}`;
            }
            
            // Determine which mode to use (fallback to fast if relax failed before)
            const processMode = shouldUseFastMode ? 'fast' : (settings.midjourneyMode || 'fast');
            if (shouldUseFastMode && settings.midjourneyMode === 'relax') {
              addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] ⚠️ Relax mode unavailable, using fast mode instead`, 'log');
            }
            
            addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] 🚀 Starting (keeping ${imagesPerPromptToUse} of 4): "${prompt.substring(0, 50)}..."`);
            
            // Create a dummy theme for bulk prompt mode
            const dummyTheme: Theme = {
              id: 'bulk-prompt',
              name: 'Bulk Prompt',
              description: 'Bulk prompt import',
              thumbnail: '',
              basePrompt: prompt,
              styleKeywords: []
            };
            
            const result = await generateWithTtapi(
              dummyTheme,
              settings,
              undefined, // parametersForMJ
              settings.aspectRatio || '1:1', // aspectRatio
              processMode, // processMode (may be overridden to 'fast' if relax failed)
              undefined, // onProgress
              promptIndex, // variationIndex
              finalPrompt.trim() || undefined, // customPrompt
              accountId // accountId for explicit account selection
            );
            
            // Extract results
            const originalUrls = (result as any)?.originalUrls as string[] | undefined;
            const originalGridUrl = (result as any)?.originalGridUrl as string | undefined;
            const isGrid = (result as any)?.isGrid as boolean | undefined;
            const allBase64Urls = Array.isArray(result) ? result : (result ? [result] : []);
            const base64Urls = allBase64Urls.slice(0, imagesPerPromptToUse);
            
            // Update placeholder images
            const startIndex = promptIndex * imagesPerPromptToUse;
            const endIndex = Math.min(startIndex + imagesPerPromptToUse, actualTotal);
            
            if (base64Urls.length > 0) {
              for (let i = 0; i < base64Urls.length && (startIndex + i) < actualTotal; i++) {
                updatedImages[startIndex + i].url = base64Urls[i];
                if (isGrid && originalGridUrl) {
                  updatedImages[startIndex + i].originalUrl = originalGridUrl;
                  (updatedImages[startIndex + i] as any).gridSliceIndex = i;
                } else if (originalUrls && originalUrls[i]) {
                  updatedImages[startIndex + i].originalUrl = originalUrls[i];
                }
                updatedImages[startIndex + i].status = 'completed';
                updatedImages[startIndex + i].prompt = finalPrompt;
              }
            }
            
            setGeneratedImages([...updatedImages]);
            setCurrentProgress(prev => Math.min(prev + base64Urls.length, actualTotal));
            addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] ✅ Completed (${base64Urls.length} images)`, 'success');
            return { success: true, promptIndex };
            
          } catch (error: any) {
            console.error(`[Bulk Prompt ${promptIndex + 1}] Generation failed:`, error);
            
            const errorMessage = error.message || '';
            const isNoAccountsError = errorMessage.includes('No available accounts') || 
                                     errorMessage.includes('no available accounts') ||
                                     errorMessage.includes('HOLD_RELAX_MODE_NOT_SUPPORTED');
            const isRelaxMode = settings.midjourneyMode === 'relax';
            
            if (isNoAccountsError && isRelaxMode && !shouldUseFastMode) {
              // HOLD account relax mode issue - TTAPI API bug
              addLog(`[Bulk Prompt ${promptIndex + 1}] ⚠️ TTAPI API Error: "No available accounts"`, 'error');
              addLog(`[Bulk Prompt ${promptIndex + 1}] 🔍 This is a known TTAPI API bug with HOLD accounts (0 fast hours + "Only Relax" mode)`, 'log');
              addLog(`[Bulk Prompt ${promptIndex + 1}] ✅ Your account works fine - manual Discord jobs complete successfully`, 'log');
              addLog(`[Bulk Prompt ${promptIndex + 1}] 💡 Workaround: Use TTAPI dashboard directly, or contact TTAPI support about this API bug`, 'log');
              addLog(`[Bulk Prompt ${promptIndex + 1}] 📧 Report this to TTAPI: HOLD account API returns "No available accounts" despite account being valid`, 'log');
              
              // Don't retry - this is an API bug that won't be fixed by retrying
              // The user needs to either use the dashboard or contact TTAPI support
            }
            
            // Regular error handling
            const startIndex = promptIndex * imagesPerPromptToUse;
            const endIndex = Math.min(startIndex + imagesPerPromptToUse, actualTotal);
            
            for (let i = startIndex; i < endIndex && i < actualTotal; i++) {
              updatedImages[i].status = 'error';
              updatedImages[i].prompt = prompt;
            }
            setGeneratedImages([...updatedImages]);
            addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] ❌ Failed: ${error.message || 'Unknown error'}`, 'error');
            return { success: false, promptIndex };
          }
          });
          
          // Wait for all requests in this batch to complete
          const batchResults = await Promise.allSettled(batchPromises);
          const batchCompleted = batchResults.filter(r => r.status === 'fulfilled' && r.value?.success).length;
          addLog(`[Ttapi Bulk] ✅ Batch ${batchNumber}/${totalBatches} completed: ${batchCompleted}/${batchEnd - batchStart} prompts successful`, 'success');
          
          // Small delay between batches to avoid overwhelming the API
          if (batchEnd < promptsToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } else {
        // Parallel processing for Replicate/Pollinations
        const imagePromises = promptsToProcess.map(async (prompt, promptIndex) => {
          try {
            // Apply moodboard and SREF if provided
            let finalPrompt = prompt.trim();
            
            // Add moodboard if provided
            if (bulkMoodboard.trim()) {
              // Remove any existing --p prefix and m prefix, then add them properly
              let moodboardId = bulkMoodboard.trim();
              // Remove --p if present
              moodboardId = moodboardId.replace(/^--p\s*/i, '').trim();
              // Remove m prefix if present (we'll add it back)
              moodboardId = moodboardId.replace(/^m/, '').trim();
              // Add m prefix and --p parameter
              finalPrompt += ` --p m${moodboardId}`;
            }
            
            // Add SREF if provided
            if (bulkSrefCode.trim()) {
              finalPrompt += ` --sref ${bulkSrefCode.trim()} --sw 1000`;
            }
            
            // Add aspect ratio
            if (settings.aspectRatio) {
              finalPrompt += ` --ar ${settings.aspectRatio}`;
            }
            
            addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] Generating: "${prompt.substring(0, 60)}..."`);
            
            // Replicate/Pollinations: 1 image per prompt
            const imageIndex = promptIndex;
            if (imageIndex >= actualTotal) return;
            
            // Create a dummy theme for bulk prompt mode
            const dummyTheme: Theme = {
              id: 'bulk-prompt',
              name: 'Bulk Prompt',
              description: 'Bulk prompt import',
              thumbnail: '',
              basePrompt: prompt,
              styleKeywords: []
            };
            
            let imageUrl = '';
            if (settings.imageService === 'replicate') {
              imageUrl = await generateWithReplicate(
                dummyTheme,
                settings,
                undefined, // parametersForMJ
                settings.aspectRatio || '1:1', // aspectRatio
                settings.midjourneyMode || 'fast', // processMode
                undefined, // onProgress
                imageIndex, // variationIndex
                finalPrompt // customPrompt
              );
            } else if (settings.imageService === 'pollinations') {
              imageUrl = await generateWithPollinations(
                dummyTheme,
                settings,
                undefined, // parametersForMJ
                settings.aspectRatio || '1:1', // aspectRatio
                settings.midjourneyMode || 'fast', // processMode
                undefined, // onProgress
                imageIndex, // variationIndex
                finalPrompt // customPrompt
              );
            }
            
            if (imageUrl) {
              updatedImages[imageIndex].url = imageUrl;
              updatedImages[imageIndex].status = 'completed';
              updatedImages[imageIndex].prompt = finalPrompt;
              setGeneratedImages([...updatedImages]);
              setCurrentProgress(imageIndex + 1);
              addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] ✅ Completed`, 'success');
            } else {
              throw new Error('No image URL returned');
            }
          } catch (error: any) {
            console.error(`[Bulk Prompt ${promptIndex + 1}] Generation failed:`, error);
            const imageIndex = promptIndex;
            if (imageIndex < actualTotal) {
              updatedImages[imageIndex].status = 'error';
              updatedImages[imageIndex].prompt = prompt;
            }
            setGeneratedImages([...updatedImages]);
            addLog(`[Bulk Prompt ${promptIndex + 1}/${promptsToProcess.length}] ❌ Failed: ${error.message || 'Unknown error'}`, 'error');
          }
        });
        
        await Promise.allSettled(imagePromises);
      }
      
      const completed = updatedImages.filter(img => img.status === 'completed').length;
      const errored = updatedImages.filter(img => img.status === 'error').length;
      
      addLog(`[Bulk Prompt Mode] ✅ Completed: ${completed} successful, ${errored} failed`, completed > 0 ? 'success' : 'error');
      setStatus(GenerationStatus.COMPLETED);
      setCurrentProgress(actualTotal);
      return;
    }
    
    // Determine the theme name to use
    // If SREF mode: use the SREF subject
    // If Image Theme Expansion mode: use the PRIMARY SUBJECT (theme) from the single uploaded image
    // If custom theme: use the custom prompt directly
    // Otherwise: use selected theme name
    const isSrefModeForTheme = selectedTheme?.id === 'sref-style-match' || isSrefMode;
    const themeName = isSrefModeForTheme && srefSubject.trim()
      ? srefSubject.trim()
      : isImageThemeExpansion && singleImageForTheme?.theme
      ? singleImageForTheme.theme // Use PRIMARY SUBJECT from single image
      : isCustomTheme && customThemePrompt.trim() 
      ? customThemePrompt.trim() 
      : selectedTheme?.name || 'Custom Theme';
    
    // For Image Theme Expansion: use the PRIMARY SUBJECT as the theme for all variations
    // ChatGPT will generate different subjects but same theme/style
    // Check if we're in Image Theme Expansion mode (either by flag or by selected theme ID)
    const isImageThemeMode = isImageThemeExpansion || selectedTheme?.id === 'image-theme-expansion';
    const primarySubjectForExpansion = (isImageThemeMode && singleImageForTheme?.theme)
      ? singleImageForTheme.theme
      : (selectedTheme?.id === 'image-theme-expansion' && selectedTheme?.basePrompt)
      ? selectedTheme.basePrompt // Fallback: use basePrompt from selectedTheme (set when "Continue with Image Theme" is clicked)
      : settings.primarySubject?.trim() || undefined;
    console.log(`[Image Theme Expansion] primarySubjectForExpansion: "${primarySubjectForExpansion}", isImageThemeExpansion: ${isImageThemeExpansion}, selectedTheme?.id: "${selectedTheme?.id}", selectedTheme?.basePrompt: "${selectedTheme?.basePrompt}", singleImageForTheme?.theme: "${singleImageForTheme?.theme}"`);
    
    // Note: customThemePrompt and customArtStyle fields have been removed from UI
    // They are kept in settings for backward compatibility but are no longer used
    
    // For Ttapi: Only generate prompts for the number of requests needed (1 prompt per 4 images)
    // For Pollinations/Replicate: Generate a prompt for each image
    let promptsToGenerate: number;
    let generatedPrompts: string[];
    
    // Generate image-specific subject lists for each uploaded image
    // Each image gets its own nature-focused subject list
    const usedSubjects = new Set<string>();
    const imageSubjectLists: Map<number, string[]> = new Map();
    
    // Metrics tracking (defined here so it's accessible to all code paths)
    const metrics = {
      headerMissing: 0,
      rewrites: 0,
      semanticMismatches: 0,
      nullReturns: 0,
      subjectSwaps: 0,
      finalAccepts: 0
    };
    
    // Generate subject lists for each uploaded image
    if (uploadedImages.length > 0) {
      const usesPerImage = Math.floor(total / uploadedImages.length);
      const apiKey = settings.promptService === 'openrouter' 
        ? (import.meta.env.VITE_OPENROUTER_API_KEY || '')
        : (import.meta.env.VITE_OPENAI_API_KEY || '');
      const apiUrl = settings.promptService === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const useOpenRouter = settings.promptService === 'openrouter';
      
      if (apiKey) {
        for (let imgIdx = 0; imgIdx < uploadedImages.length; imgIdx++) {
          const image = uploadedImages[imgIdx];
          const imageAnalysis = image.fullAnalysis ? {
            theme: image.theme || image.fullAnalysis.clusters?.[0]?.theme,
            style: image.style || image.fullAnalysis.clusters?.[0]?.style,
            technique: image.fullAnalysis.clusters?.[0]?.technique,
            primary_subject: image.fullAnalysis.clusters?.[0]?.primary_subject,
            colors: image.colors || image.fullAnalysis.clusters?.[0]?.palette?.map((p: any) => `${p.name} (${p.hex})`).join(', ') || '',
            vibe: image.vibe || image.fullAnalysis.clusters?.[0]?.vibe || ''
          } : (image.colors || image.vibe ? {
            theme: image.theme,
            style: image.style,
            colors: image.colors || '',
            vibe: image.vibe || ''
          } : null);
          
          try {
            const subjectList = await generateImageSpecificSubjectList(
              imageAnalysis,
              usesPerImage,
              apiKey,
              apiUrl,
              useOpenRouter,
              useHuggingFace
            );
            imageSubjectLists.set(imgIdx, subjectList);
            addLog(`[Image ${imgIdx + 1}] Generated ${subjectList.length} nature-focused subjects`, 'success');
          } catch (error: any) {
            console.error(`[Image ${imgIdx + 1} Subject List] Generation failed:`, error);
            addLog(`[Image ${imgIdx + 1} Subject List] Failed: ${error.message}`, 'error');
            // Use fallback list
            imageSubjectLists.set(imgIdx, []);
          }
        }
      } else {
        addLog(`[Image Subject Lists] API key not configured, using fallback subjects`, 'error');
      }
    }
    
    if (settings.imageService === 'ttapi') {
      // Only need prompts for the number of requests (each request generates 4 images)
      promptsToGenerate = Math.ceil(total / 4);
      const serviceName = 'Ttapi';
      addLog(`[${serviceName}] Generating ${promptsToGenerate} prompts for ${total} images (4 images per prompt)`);
      
      // Calculate which image to use for each request
      const usesPerImage = uploadedImages.length > 0 ? Math.floor(total / uploadedImages.length) : 0;
      const requestsPerImage = uploadedImages.length > 0 ? Math.floor(promptsToGenerate / uploadedImages.length) : 0;
      
      const promptPromises = Array.from({ length: promptsToGenerate }, async (_, i) => {
        // Determine which image to use for this request
        let imageIndex = 0;
        let imageTheme = themeName;
        let imageStyle = settings.customArtStyle || '';
        let imageSubjectList: string[] = [];
        
        // Check if we're in Image Theme Expansion mode (either by flag or by selected theme ID)
        const isImageThemeModeForRequest = isImageThemeExpansion || selectedTheme?.id === 'image-theme-expansion';
        
        // For Image Theme Expansion mode: use the single image's theme and style for all variations
        if (isImageThemeModeForRequest && (singleImageForTheme || selectedTheme?.id === 'image-theme-expansion')) {
          imageTheme = singleImageForTheme?.theme || selectedTheme?.basePrompt || imageTheme;
          console.log(`[${serviceName} Request ${i + 1}] Image Theme Expansion mode - imageTheme: "${imageTheme}"`);
          
          // Build style description from single image analysis or use settings.customArtStyle
          if (singleImageForTheme?.style) {
            // Build style description from single image analysis
            if (singleImageForTheme.fullAnalysis?.clusters?.[0]) {
              const cluster = singleImageForTheme.fullAnalysis.clusters[0];
              imageStyle = cluster.style || '';
              
              if (cluster.technique) {
                imageStyle = `${imageStyle} Technique: ${cluster.technique}.`;
              }
              
              if (cluster.dominant_textures && cluster.dominant_textures.length > 0) {
                imageStyle = `${imageStyle} Textures: ${cluster.dominant_textures.join(', ')}.`;
              }
              
              if (cluster.palette && Array.isArray(cluster.palette)) {
                const colorList = cluster.palette.map((c: any) => `${c.name} (${c.hex})`).join(', ');
                imageStyle = `${imageStyle} Color palette: ${colorList}.`;
              }
              
              if (cluster.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${cluster.vibe}.`;
              }
            } else {
              imageStyle = singleImageForTheme.style;
              if (singleImageForTheme.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${singleImageForTheme.vibe}.`;
              }
              if (singleImageForTheme.colors) {
                imageStyle = `${imageStyle} Color palette: ${singleImageForTheme.colors}.`;
              }
            }
          } else if (settings.customArtStyle && settings.customArtStyle.trim()) {
            // Fallback: use customArtStyle from settings (set when image was uploaded)
            imageStyle = settings.customArtStyle;
            console.log(`[${serviceName} Request ${i + 1}] Using customArtStyle from settings: "${imageStyle}"`);
          }
          
          // For Image Theme Expansion, we don't need a subject list - ChatGPT will generate different subjects
          imageSubjectList = [];
          
          if (i === 0) {
            addLog(`[${serviceName} Request ${i + 1}] Image Theme Expansion mode - Using PRIMARY SUBJECT: "${imageTheme}" - ChatGPT will generate different subjects for each variation`, 'success');
          }
        } else if (uploadedImages.length > 0 && requestsPerImage > 0) {
          imageIndex = Math.floor(i / requestsPerImage) % uploadedImages.length;
          const uploadedImage = uploadedImages[imageIndex];
          
          // Use image-specific theme
          if (uploadedImage.theme) {
            imageTheme = uploadedImage.theme;
          }
          
          // Build style description EXACTLY from image analysis (no modifications)
          if (uploadedImage.fullAnalysis?.clusters?.[0]) {
            const cluster = uploadedImage.fullAnalysis.clusters[0];
            imageStyle = cluster.style || '';
            
            // Add technique if available
            if (cluster.technique) {
              imageStyle = `${imageStyle} Technique: ${cluster.technique}.`;
            }
            
            // Add textures if available
            if (cluster.dominant_textures && cluster.dominant_textures.length > 0) {
              imageStyle = `${imageStyle} Textures: ${cluster.dominant_textures.join(', ')}.`;
            }
            
            // Add colors EXACTLY as extracted
            if (cluster.palette && Array.isArray(cluster.palette)) {
              const colorList = cluster.palette.map((c: any) => `${c.name} (${c.hex})`).join(', ');
              imageStyle = `${imageStyle} Color palette: ${colorList}.`;
            }
            
            // Add vibe EXACTLY as extracted
            if (cluster.vibe) {
              imageStyle = `${imageStyle} Vibe/Atmosphere: ${cluster.vibe}.`;
            }
          } else if (uploadedImage.style) {
            // Fallback to stored style if full analysis not available
            imageStyle = uploadedImage.style;
            if (uploadedImage.vibe) {
              imageStyle = `${imageStyle} Vibe/Atmosphere: ${uploadedImage.vibe}.`;
            }
            if (uploadedImage.colors) {
              imageStyle = `${imageStyle} Color palette: ${uploadedImage.colors}.`;
            }
          }
          
          // Get image-specific subject list
          imageSubjectList = imageSubjectLists.get(imageIndex) || [];
          
          if (i === 0 || (i % requestsPerImage === 0 && requestsPerImage > 0)) {
            addLog(`[${serviceName} Request ${i + 1}] Using uploaded image ${imageIndex + 1}/${uploadedImages.length} (Theme: "${imageTheme}", Subjects: ${imageSubjectList.length})`, 'log');
          }
        }
        
        // Determine primary subject: use primarySubjectForExpansion for Image Theme Expansion, use srefSubject for SREF mode, otherwise use settings.primarySubject
        const isSrefModeForRequest = selectedTheme?.id === 'sref-style-match' || isSrefMode;
        const primarySubjectToUse = isImageThemeModeForRequest 
          ? primarySubjectForExpansion 
          : isSrefModeForRequest && srefSubject.trim()
          ? srefSubject.trim()
          : settings.primarySubject?.trim() || undefined;
        console.log(`[${serviceName} Request ${i + 1}] primarySubjectToUse: "${primarySubjectToUse}", isImageThemeModeForRequest: ${isImageThemeModeForRequest}`);
        
        // For Image Theme Expansion: pass full image cluster data to enable base prompt generation
        const imageClusterData = isImageThemeModeForRequest && singleImageForTheme?.fullAnalysis 
          ? singleImageForTheme.fullAnalysis 
          : undefined;
        
        return generatePromptWithChatGPT(
          imageTheme,
          settings.pageStyle,
          settings.textureIntensity,
          settings.elements,
          settings.includeFrames,
          settings.includeBorders,
          i + 1,
          '', // customThemePrompt - no longer used
          'Custom / Override', // Always use Custom / Override to respect image style exactly
          imageStyle, // Use image-specific style (exact copy from analysis)
          settings.promptService || 'openai',
          imageSubjectList, // Use image-specific subject list
          usedSubjects,
          primarySubjectToUse, // For Image Theme Expansion: use PRIMARY SUBJECT from image; otherwise user-specified
          0, // recursionDepth
          imageClusterData, // Pass full image cluster data for Image Theme Expansion
          isSrefModeForRequest, // SREF mode flag
          srefCode, // SREF code/URL
          srefCategory || undefined // Selected category (optional)
        ).catch((error) => {
          console.warn(`ChatGPT prompt generation failed for request ${i + 1}, using fallback:`, error?.message || error);
          console.warn(`Full error details:`, error);
          // Fallback to constructed prompt if ChatGPT fails
          return constructPrompt(selectedTheme, settings, i);
        });
      });
      
      const requestPrompts = await Promise.all(promptPromises);
      
      // Log metrics summary
      addLog(`[Metrics] Header missing: ${metrics.headerMissing}, Rewrites: ${metrics.rewrites}, Semantic mismatches: ${metrics.semanticMismatches}, Null returns: ${metrics.nullReturns}, Subject swaps: ${metrics.subjectSwaps}, Final accepts: ${metrics.finalAccepts}`, 'log');
      console.log('[Metrics Summary]', metrics);
      
      // Threshold / abort policy
      const totalAttempts = requestPrompts.length;
      const semanticMismatchRate = (metrics.semanticMismatches / totalAttempts) * 100;
      const nullRate = (metrics.nullReturns / totalAttempts) * 100;
      
      if (semanticMismatchRate > 15) {
        addLog(`⚠️ High semantic mismatch rate: ${semanticMismatchRate.toFixed(1)}% (threshold: 15%). Consider reviewing prompts.`, 'error');
      }
      if (nullRate > 10) {
        addLog(`⚠️ High null return rate: ${nullRate.toFixed(1)}% (threshold: 10%). Consider reviewing master subject list.`, 'error');
      }
      
      // Validation: Check for corrections and semantic mismatches
      const CORRECTION_ALERT_THRESHOLD = 6; // Alert if ≥6 prompts were corrected
      let correctionCount = 0;
      let mismatchCount = 0;
      
      // Duplicate detection: check for repeated PRIMARY SUBJECT headers
      // Skip duplicate detection for Image Theme Expansion mode (theme is intentionally the same)
      const isImageThemeModeForDuplicateCheck = isImageThemeExpansion || selectedTheme?.id === 'image-theme-expansion';
      if (!isImageThemeModeForDuplicateCheck) {
        const subjectMap = new Map<string, number[]>();
        requestPrompts.forEach((prompt, idx) => {
          const match = prompt.match(/^PRIMARY SUBJECT:\s*(.+?)(?:\.|$)/i);
          if (match) {
            const subject = match[1].toLowerCase().trim();
            if (!subjectMap.has(subject)) {
              subjectMap.set(subject, []);
            }
            subjectMap.get(subject)!.push(idx);
          }
        });
        
        // Log duplicates
        subjectMap.forEach((indices, subject) => {
          if (indices.length > 1) {
            console.warn(`[Duplicate Detection] Subject "${subject}" appears in variations: ${indices.join(', ')}`);
            addLog(`⚠️ Duplicate subject detected: "${subject}" in variations ${indices.join(', ')}`, 'error');
          }
        });
      } else {
        console.log(`[Duplicate Detection] Skipping duplicate check for Image Theme Expansion mode (theme is intentionally the same: "${primarySubjectForExpansion}")`);
      }
      
      // Check console logs for correction warnings (approximate count)
      const correctionWarnings = consoleLogs.filter(log => log.message.includes('was corrected')).length;
      if (correctionWarnings >= CORRECTION_ALERT_THRESHOLD) {
        addLog(`⚠️ High correction rate detected: ${correctionWarnings} prompts were corrected. Consider reviewing the master subject list.`, 'error');
      }
      
      // Expand prompts: each request prompt is used for 4 images
      generatedPrompts = [];
    for (let i = 0; i < total; i++) {
        const requestIdx = Math.floor(i / 4);
        generatedPrompts.push(requestPrompts[requestIdx] || constructPrompt(selectedTheme, settings, i));
      }
    } else {
      // For Pollinations/Replicate: Generate a prompt for each image
      promptsToGenerate = total;
      console.log(`[Pollinations/Replicate] Generating ${promptsToGenerate} prompts (1 prompt per image)`);
      
      // If we have uploaded images, use their theme/style for prompt generation
      // Cycle through uploaded images if we have fewer images than total prompts needed
      // Calculate how many times each image should be used
      const usesPerImage = uploadedImages.length > 0 ? Math.floor(total / uploadedImages.length) : 0;
      
      if (uploadedImages.length > 0 && usesPerImage > 0) {
        addLog(`[Prompt Generation] Using ${uploadedImages.length} uploaded image(s). Each image will be used ${usesPerImage} time(s) for ${total} total generations.`, 'success');
      }
      
      const promptPromises = Array.from({ length: total }, (_, i) => {
        // Cycle through uploaded images equally
        // Example: 6 images, 36 generations = each image used 6 times
        // Example: 6 images, 24 generations = each image used 4 times
        let imageTheme = themeName;
        let imageStyle = settings.customArtStyle || '';
        
        let imageSubjectList: string[] = [];
        
        // For Image Theme Expansion mode: use the single image's theme and style for all variations
        // Check if we're in Image Theme Expansion mode (either by flag or by selected theme ID)
        const isImageThemeMode = isImageThemeExpansion || selectedTheme?.id === 'image-theme-expansion';
        if (isImageThemeMode && (singleImageForTheme || selectedTheme?.id === 'image-theme-expansion')) {
          imageTheme = singleImageForTheme?.theme || selectedTheme?.basePrompt || imageTheme;
          console.log(`[Image Theme Expansion] imageTheme set to: "${imageTheme}", singleImageForTheme?.theme: "${singleImageForTheme?.theme}", selectedTheme?.basePrompt: "${selectedTheme?.basePrompt}"`);
          
          // Build style description from single image analysis or use settings.customArtStyle
          if (singleImageForTheme?.style) {
            // Build style description from single image analysis
            if (singleImageForTheme.fullAnalysis?.clusters?.[0]) {
              const cluster = singleImageForTheme.fullAnalysis.clusters[0];
              imageStyle = cluster.style || '';
              
              if (cluster.technique) {
                imageStyle = `${imageStyle} Technique: ${cluster.technique}.`;
              }
              
              if (cluster.dominant_textures && cluster.dominant_textures.length > 0) {
                imageStyle = `${imageStyle} Textures: ${cluster.dominant_textures.join(', ')}.`;
              }
              
              if (cluster.palette && Array.isArray(cluster.palette)) {
                const colorList = cluster.palette.map((c: any) => `${c.name} (${c.hex})`).join(', ');
                imageStyle = `${imageStyle} Color palette: ${colorList}.`;
              }
              
              if (cluster.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${cluster.vibe}.`;
              }
            } else {
              imageStyle = singleImageForTheme.style;
              if (singleImageForTheme.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${singleImageForTheme.vibe}.`;
              }
              if (singleImageForTheme.colors) {
                imageStyle = `${imageStyle} Color palette: ${singleImageForTheme.colors}.`;
              }
            }
          } else if (settings.customArtStyle && settings.customArtStyle.trim()) {
            // Fallback: use customArtStyle from settings (set when image was uploaded)
            imageStyle = settings.customArtStyle;
            console.log(`[Image Theme Expansion] Using customArtStyle from settings: "${imageStyle}"`);
          }
          // For Image Theme Expansion, we don't need a subject list - ChatGPT will generate different subjects
          imageSubjectList = [];
          
          if (i === 0) {
            addLog(`[Image Theme Expansion] Using PRIMARY SUBJECT: "${imageTheme}" - ChatGPT will generate different subjects for each variation`, 'success');
          }
        } else if (uploadedImages.length > 0) {
          // Calculate which image to use for this prompt
          // This ensures each image is used equally: imageIndex = Math.floor(i / usesPerImage) % uploadedImages.length
          const imageIndex = usesPerImage > 0 
            ? Math.floor(i / usesPerImage) % uploadedImages.length
            : i % uploadedImages.length;
          
          const uploadedImage = uploadedImages[imageIndex];
          
          if (uploadedImage.theme) {
            imageTheme = uploadedImage.theme;
          }
          if (uploadedImage.style) {
            // Build style description EXACTLY from image analysis (no modifications)
            if (uploadedImage.fullAnalysis?.clusters?.[0]) {
              const cluster = uploadedImage.fullAnalysis.clusters[0];
              imageStyle = cluster.style || '';
              
              // Add technique if available
              if (cluster.technique) {
                imageStyle = `${imageStyle} Technique: ${cluster.technique}.`;
              }
              
              // Add textures if available
              if (cluster.dominant_textures && cluster.dominant_textures.length > 0) {
                imageStyle = `${imageStyle} Textures: ${cluster.dominant_textures.join(', ')}.`;
              }
              
              // Add colors EXACTLY as extracted
              if (cluster.palette && Array.isArray(cluster.palette)) {
                const colorList = cluster.palette.map((c: any) => `${c.name} (${c.hex})`).join(', ');
                imageStyle = `${imageStyle} Color palette: ${colorList}.`;
              }
              
              // Add vibe EXACTLY as extracted
              if (cluster.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${cluster.vibe}.`;
              }
            } else {
              // Fallback to stored style if full analysis not available
              imageStyle = uploadedImage.style;
              if (uploadedImage.vibe) {
                imageStyle = `${imageStyle} Vibe/Atmosphere: ${uploadedImage.vibe}.`;
              }
              if (uploadedImage.colors) {
                imageStyle = `${imageStyle} Color palette: ${uploadedImage.colors}.`;
              }
            }
          }
          
          // Get image-specific subject list
          imageSubjectList = imageSubjectLists.get(imageIndex) || [];
          
          if (i === 0 || (i % usesPerImage === 0 && usesPerImage > 0)) {
            addLog(`[Prompt ${i + 1}] Using uploaded image ${imageIndex + 1}/${uploadedImages.length} (Theme: "${imageTheme}", Subjects: ${imageSubjectList.length})`, 'log');
          }
        }
        
        // For Image Theme Expansion: pass full image cluster data to enable base prompt generation
        const imageClusterDataForPoll = isImageThemeMode && singleImageForTheme?.fullAnalysis 
          ? singleImageForTheme.fullAnalysis 
          : undefined;
        
        // Check if SREF mode is active
        const isSrefModeForPoll = selectedTheme?.id === 'sref-style-match' || isSrefMode;
        
        return generatePromptWithChatGPT(
          imageTheme,
          settings.pageStyle,
          settings.textureIntensity,
          settings.elements,
          settings.includeFrames,
          settings.includeBorders,
          i + 1,
          '', // customThemePrompt - no longer used
          'Custom / Override', // Always use Custom / Override to respect image style exactly
          imageStyle, // Use image-specific style (exact copy from analysis)
          settings.promptService || 'openai',
          imageSubjectList, // Use image-specific subject list (empty for Image Theme Expansion)
          usedSubjects,
          primarySubjectForExpansion, // For Image Theme Expansion: use PRIMARY SUBJECT from image; otherwise user-specified
          0, // recursionDepth
          imageClusterDataForPoll, // Pass full image cluster data for Image Theme Expansion
          isSrefModeForPoll, // SREF mode flag
          srefCode // SREF code/URL
        ).catch((error) => {
          console.warn(`ChatGPT prompt generation failed for variation ${i + 1}, using fallback:`, error?.message || error);
          console.warn(`Full error details:`, error);
          // Fallback to constructed prompt if ChatGPT fails
          return constructPrompt(selectedTheme, settings, i);
        });
      });

      generatedPrompts = await Promise.all(promptPromises);
    }
    
    // Update all prompts in the images
    setGeneratedImages(prev => prev.map((img, idx) => ({
      ...img,
      prompt: generatedPrompts[idx]
    })));

    // STEP 2: Generate all images
    addLog(`[${settings.imageService}] Generating all images...`);
    const generateFunction = settings.imageService === 'pollinations' 
      ? generateWithPollinations 
      : settings.imageService === 'replicate'
      ? generateWithReplicate
      : generateWithTtapi; // Default to Ttapi
    
    addLog(`[${settings.imageService}] Selected generate function: ${generateFunction.name || 'anonymous'}`);

    // For Replicate, maximize the 6 requests/minute limit
    // Rate limit: 6 requests/minute = 1 request every 10 seconds
    // Send requests at 10s intervals without waiting for completion to maximize throughput
    if (settings.imageService === 'replicate') {
      const requestsPerMinute = 6;
      const delayBetweenRequests = (60 * 1000) / requestsPerMinute; // Exactly 10 seconds between requests
      
      addLog(`Sending ${total} Replicate requests at ${requestsPerMinute} requests/minute (${delayBetweenRequests / 1000}s intervals)...`);
      
      // Start all requests with proper timing to maximize rate limit usage
      const requestPromises: Promise<void>[] = [];
      
    for (let i = 0; i < total; i++) {
        // Calculate delay for this request (staggered starts)
        const startDelay = i * delayBetweenRequests;
        
        const requestPromise = (async () => {
          // Wait for the staggered start time
          if (startDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, startDelay));
          }
          
          addLog(`[Image ${i + 1}/${total}] 🚀 Starting Replicate generation...`);
          
          try {
            const base64Url = await generateFunction(
              selectedTheme, 
              settings,
              settings.parametersForMJ,
              settings.aspectRatio || '1:1',
              settings.midjourneyMode || 'fast',
              (status) => {
                console.log(`[Image ${i + 1}/${total}] 📊 Status: ${status.toUpperCase()}`);
                setGeneratedImages(prev => prev.map((img, idx) => 
                  idx === i ? { ...img, status: status === 'completed' ? 'completed' : 'generating' } : img
                ));
              },
              i,
              generatedPrompts[i]
            );
            
            setGeneratedImages(prev => prev.map((img, idx) => 
              idx === i ? { 
                ...img, 
          url: base64Url,
                status: 'completed' as const 
              } : img
            ));
            
            setCurrentProgress((prev) => {
              const completed = ((i + 1) / total) * 100;
              return Math.min(completed, 100);
            });

            addLog(`[Image ${i + 1}/${total}] ✅ COMPLETED`, 'success');
      } catch (err: any) {
            addLog(`[Image ${i + 1}/${total}] ❌ ERROR: ${err.message || err}`, 'error');
        setErrorMsg(err.message || "Failed to generate some pages.");
            setGeneratedImages(prev => prev.map((img, idx) => 
              idx === i ? { ...img, status: 'error' as const } : img
            ));
          }
        })();
        
        requestPromises.push(requestPromise);
      }
      
      // Wait for all requests to complete
      await Promise.allSettled(requestPromises);
    } else if (settings.imageService === 'pollinations') {
      // For Pollinations, send ALL requests in parallel through serverless function with proxy support
      // Each request uses a different proxy, allowing 100+ parallel requests
      addLog(`[Pollinations] Generating ${total} images in parallel with proxy support...`);
      
      const imagePromises = Array.from({ length: total }, async (_, i) => {
        addLog(`[Image ${i + 1}/${total}] 🚀 Starting Pollinations generation...`);
        try {
          const base64Url = await generateFunction(
            selectedTheme, 
            settings,
            settings.parametersForMJ,
            settings.aspectRatio || '1:1',
            settings.midjourneyMode || 'fast',
            (status) => {
              addLog(`[Image ${i + 1}/${total}] 📊 Status: ${status.toUpperCase()}`);
              setGeneratedImages(prev => prev.map((img, idx) => 
                idx === i ? { ...img, status: status === 'completed' ? 'completed' : 'generating' } : img
              ));
            },
            i,
            generatedPrompts[i]
          );
          
          setGeneratedImages(prev => prev.map((img, idx) => 
            idx === i ? { 
              ...img, 
              url: base64Url, 
              status: 'completed' as const 
            } : img
          ));
          
          setCurrentProgress((prev) => {
            const completed = ((i + 1) / total) * 100;
            return Math.min(completed, 100);
          });

          addLog(`[Image ${i + 1}/${total}] ✅ COMPLETED`, 'success');
          return { success: true, index: i };
        } catch (err: any) {
          addLog(`[Image ${i + 1}/${total}] ❌ ERROR: ${err.message || err}`, 'error');
          setErrorMsg(err.message || "Failed to generate some pages.");
          setGeneratedImages(prev => prev.map((img, idx) => 
            idx === i ? { ...img, status: 'error' as const } : img
          ));
          return { success: false, index: i, error: err };
        }
      });
      
      // Wait for all requests to complete in parallel
      await Promise.allSettled(imagePromises);
    } else if (settings.imageService === 'ttapi') {
      // For Ttapi, generate with rate limiting
      // Note: Midjourney returns 4 images per request, so we need fewer requests
      const serviceName = 'Ttapi';
      const requestsNeeded = Math.ceil(total / 4);
      
      // Rate limiting: Process requests in concurrent batches
      // For Ttapi: Dynamic based on account count (accounts × 3)
      // For other services: Can send more in parallel
      const isTtapi = settings.imageService === 'ttapi';
      
      // For TTAPI, calculate dynamic batch size based on account count
      let maxConcurrent = 5; // Default for non-TTAPI services
      let accountIds: string[] = [];
      if (isTtapi) {
        try {
          const { getTTAPIAccountCount, getTTAPIAccountIds } = await import('./services/ttapiService');
          const accountCount = await getTTAPIAccountCount(settings.midjourneyMode || 'fast');
          accountIds = await getTTAPIAccountIds(settings.midjourneyMode || 'fast');
          maxConcurrent = accountCount * 3; // accounts × 3
        } catch (error) {
          console.warn(`[${serviceName}] Could not get account count, defaulting to 3:`, error);
          maxConcurrent = 3; // Fallback to 3 if account count fetch fails
        }
      }
      
      if (isTtapi) {
        addLog(`[${serviceName}] Starting ${requestsNeeded} request(s) for ${total} images (4 images per request) with ${maxConcurrent} concurrent requests per batch (${Math.floor(maxConcurrent / 3)} account(s) available)...`);
      } else {
        addLog(`[${serviceName}] Starting ${requestsNeeded} request(s) for ${total} images (4 images per request)...`);
      }
      
      // Process requests in batches of maxConcurrent
      const processRequest = async (requestIdx: number) => {
        const startIdx = requestIdx * 4;
        const endIdx = Math.min(startIdx + 4, total);
        const imageRange = `${startIdx + 1}-${endIdx}`;
        
        // Distribute requests across accounts in round-robin fashion
        const accountId = accountIds.length > 0 ? accountIds[requestIdx % accountIds.length] : undefined;
        if (accountId) {
          console.log(`[${serviceName} Request ${requestIdx + 1}] Assigned to account: ${accountId}`);
        }
        
        // Log immediately when request starts (all requests in batch start simultaneously)
        addLog(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] 🚀 Starting generation for images ${imageRange}...`);
        try {
          // For Image Theme Expansion mode: use the single image's styleRefUrl
          // For SREF mode: use the SREF code as style reference
          // For regular mode: use round-robin distribution through uploaded images
          let imageStyleRefUrl: string | undefined;
          let imageIndex = 0;
          
          // Check if we're in Image Theme Expansion mode (either by flag or by selected theme ID)
          const isImageThemeMode = isImageThemeExpansion || selectedTheme?.id === 'image-theme-expansion';
          // Check if we're in SREF mode
          const isSrefModeForGeneration = selectedTheme?.id === 'sref-style-match' || isSrefMode;
          
          if (isSrefModeForGeneration) {
            // SREF mode: use the SREF code/URL as style reference ONLY if provided
            if (srefCode.trim()) {
              imageStyleRefUrl = srefCode.trim();
              console.log(`[Midjourney Request ${requestIdx + 1}] Using SREF Style Match mode - SREF code: ${srefCode.substring(0, 50)}...`);
            } else {
              // No SREF code provided - explicitly set to undefined
              imageStyleRefUrl = undefined;
              console.log(`[Midjourney Request ${requestIdx + 1}] SREF mode active but no SREF code provided - will use moodboard if provided, or prompt only`);
            }
          } else if (isImageThemeMode && (singleImageForTheme || selectedTheme?.id === 'image-theme-expansion')) {
            // Image Theme Expansion mode: use single image's style reference
            // First try singleImageForTheme.styleRefUrl, then fallback to settings.styleRefUrl
            // (settings.styleRefUrl is set during image upload)
            imageStyleRefUrl = singleImageForTheme?.styleRefUrl || settings.styleRefUrl;
            imageIndex = 0; // Always use the single image
            console.log(`[Midjourney Request ${requestIdx + 1}] Using Image Theme Expansion mode - single image style reference`);
            console.log(`[Midjourney Request ${requestIdx + 1}] singleImageForTheme?.styleRefUrl: ${singleImageForTheme?.styleRefUrl || 'undefined'}`);
            console.log(`[Midjourney Request ${requestIdx + 1}] settings.styleRefUrl: ${settings.styleRefUrl || 'undefined'}`);
            console.log(`[Midjourney Request ${requestIdx + 1}] Final imageStyleRefUrl: ${imageStyleRefUrl || 'undefined'}`);
          } else if (uploadedImages.length > 0) {
            // Regular mode: round-robin distribution
            // Each image should be used for approximately (requestsNeeded / uploadedImages.length) requests
            // Use modulo to cycle through images evenly
            // Example: 6 images, 9 requests -> each image used 1-2 times
            // Request 0: 0 % 6 = 0 (image 0)
            // Request 1: 1 % 6 = 1 (image 1)
            // Request 2: 2 % 6 = 2 (image 2)
            // Request 3: 3 % 6 = 3 (image 3)
            // Request 4: 4 % 6 = 4 (image 4)
            // Request 5: 5 % 6 = 5 (image 5)
            // Request 6: 6 % 6 = 0 (image 0)
            // Request 7: 7 % 6 = 1 (image 1)
            // Request 8: 8 % 6 = 2 (image 2)
            imageIndex = requestIdx % uploadedImages.length;
            imageStyleRefUrl = uploadedImages[imageIndex]?.styleRefUrl;
          } else {
            // Fallback: use settings.styleRefUrl
            imageStyleRefUrl = settings.styleRefUrl;
          }
          
          // TEMPORARY DEBUG: Uncomment to test with single reference URL
          // const debugStyleRefUrl = "https://gold-stingray-884517.hostingersite.com/wp-content/uploads/2025/12/style-ref-1764982392518.png"; // Replace with your test URL
          // const imageStyleRefUrl = debugStyleRefUrl;
          // console.log(`[DEBUG] Forcing same style reference for all requests: ${debugStyleRefUrl}`);
          
          // Create modified settings with image-specific styleRefUrl
          // For Image Theme Expansion mode: skip style reference URL, rely on detailed prompt only
          // For SREF mode: use the SREF code as style reference (don't skip)
          // IMPORTANT: In SREF mode, if no SREF code is provided, don't fall back to settings.styleRefUrl
          // Only use fallback in non-SREF modes
          let finalStyleRefUrl: string | undefined;
          if (isSrefModeForGeneration) {
            // SREF mode: only use the SREF code if provided, don't fall back
            finalStyleRefUrl = imageStyleRefUrl || undefined;
          } else {
            // Non-SREF mode: use image-specific URL or fall back to settings
            finalStyleRefUrl = imageStyleRefUrl || settings.styleRefUrl;
          }
          
          const imageSpecificSettings = {
            ...settings,
            styleRefUrl: finalStyleRefUrl,
            moodboardId: isSrefModeForGeneration && srefMoodboard.trim() ? srefMoodboard.trim() : undefined, // Add moodboard ID for SREF mode
            skipStyleReference: isImageThemeMode ? true : false // SREF mode should NOT skip style reference
          };
          
          if (isSrefModeForGeneration && srefMoodboard.trim()) {
            console.log(`[Midjourney Request ${requestIdx + 1}] Using moodboard: --p ${srefMoodboard.trim()}`);
          }
          
          let imageTheme = 'Unknown';
          if (isImageThemeMode) {
            imageTheme = singleImageForTheme?.theme || selectedTheme?.basePrompt || 'Unknown';
            console.log(`[Midjourney Request ${requestIdx + 1}] Using Image Theme Expansion mode (Theme: "${imageTheme}")`);
          } else if (uploadedImages.length > 0) {
            imageTheme = uploadedImages[imageIndex]?.theme || uploadedImages[imageIndex]?.fullAnalysis?.clusters?.[0]?.theme || 'Unknown';
            console.log(`[Midjourney Request ${requestIdx + 1}] Using uploaded image ${imageIndex + 1}/${uploadedImages.length} (Theme: "${imageTheme}")`);
          }
          
          if (imageStyleRefUrl) {
            console.log(`[Midjourney Request ${requestIdx + 1}] Style reference URL: ${imageStyleRefUrl}`);
            if (isImageThemeMode) {
              console.log(`[Midjourney Request ${requestIdx + 1}] ✅ Image Theme Expansion mode - styleRefUrl available (but will be skipped, relying on detailed prompt only)`);
            } else {
              console.log(`[Midjourney Request ${requestIdx + 1}] ✅ Using image-specific styleRefUrl (Image ${imageIndex + 1} of ${uploadedImages.length})`);
            }
          } else {
            // Only show warning if NOT in Image Theme Expansion mode (where skipping styleRefUrl is intentional)
            if (!isImageThemeMode) {
              console.warn(`[Midjourney Request ${requestIdx + 1}] ⚠️ No style reference URL found`);
              console.warn(`[Midjourney Request ${requestIdx + 1}] ⚠️ Falling back to settings.styleRefUrl: ${settings.styleRefUrl || 'none'}`);
            } else {
              console.log(`[Midjourney Request ${requestIdx + 1}] ℹ️ Image Theme Expansion mode - styleRefUrl intentionally skipped (relying on detailed prompt only)`);
            }
          }
          
          // Ttapi returns an array of images (typically 4)
          const base64Urls = await generateFunction(
            selectedTheme, 
            imageSpecificSettings,  // ✅ CHANGED: was "settings", now "imageSpecificSettings"
            settings.parametersForMJ, // Use original parametersForMJ from settings
            settings.aspectRatio || '1:1',
            settings.midjourneyMode || 'fast',
            (status) => {
              addLog(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] 📊 Status: ${status.toUpperCase()} (Images ${imageRange})`);
              // Update all images that will come from this request
              setGeneratedImages(prev => prev.map((img, idx) => 
                idx >= startIdx && idx < endIdx 
                  ? { ...img, status: status === 'completed' ? 'completed' : 'generating' } 
                  : img
              ));
            },
            requestIdx,
            generatedPrompts[requestIdx * 4], // Use prompt from first image in this batch
            accountId // accountId for explicit account selection
          ) as string[]; // Type assertion: Midjourney returns array
          
          // Extract original URLs if available (attached as property for backward compatibility)
          const originalUrls = (base64Urls as any)?.originalUrls as string[] | undefined;
          const originalGridUrl = (base64Urls as any)?.originalGridUrl as string | undefined;
          const isGrid = (base64Urls as any)?.isGrid as boolean | undefined;
          const base64Array = Array.isArray(base64Urls) ? base64Urls : [];
          
          // Add all images from this request to the gallery
          base64Array.forEach((base64Url, imgIdx) => {
            const actualIdx = startIdx + imgIdx;
            if (actualIdx < total) {
              addLog(`[Image ${actualIdx + 1}/${total}] ✅ COMPLETED`, 'success');
              setGeneratedImages(prev => prev.map((img, idx) => 
                idx === actualIdx ? { 
                  ...img, 
                  url: base64Url, 
                  // Store original URL if available for high-quality downloads
                  // For grid images, store the grid URL so we can split it fresh on download
                  originalUrl: isGrid && originalGridUrl ? originalGridUrl : (originalUrls && originalUrls[imgIdx] ? originalUrls[imgIdx] : undefined),
                  // Store grid slice index for grid images (0-3)
                  ...(isGrid && originalGridUrl ? { gridSliceIndex: imgIdx } : {}),
                  status: 'completed' as const,
                  prompt: generatedPrompts[actualIdx] || img.prompt
                } : img
              ));
            }
          });
          
          setCurrentProgress((prev) => {
            const completed = ((requestIdx + 1) / requestsNeeded) * 100;
            return Math.min(completed, 100);
          });

          addLog(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] ✅ COMPLETED - Generated ${base64Urls.length} images (Images ${imageRange})`, 'success');
          return { success: true, index: requestIdx };
      } catch (err: any) {
          addLog(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] ❌ ERROR (Images ${imageRange}): ${err.message || err}`, 'error');
        setErrorMsg(err.message || "Failed to generate some pages.");
          const startIdx = requestIdx * 4;
          const endIdx = Math.min(startIdx + 4, total);
          setGeneratedImages(prev => prev.map((img, idx) => 
            idx >= startIdx && idx < endIdx ? { ...img, status: 'error' as const } : img
          ));
          return { success: false, index: requestIdx, error: err };
        }
      };

      // Process requests in batches
      const results: Array<PromiseSettledResult<{ success: boolean; index: number; error?: any }>> = [];
      
      for (let batchStart = 0; batchStart < requestsNeeded; batchStart += maxConcurrent) {
        const batchEnd = Math.min(batchStart + maxConcurrent, requestsNeeded);
        const batchSize = batchEnd - batchStart;
        const batchNumber = Math.floor(batchStart / maxConcurrent) + 1;
        const totalBatches = Math.ceil(requestsNeeded / maxConcurrent);
        
        if (isTtapi) {
          addLog(`[${serviceName}] 🚀 Starting batch ${batchNumber}/${totalBatches}: Processing ${batchSize} request(s) in parallel (requests ${batchStart + 1}-${batchEnd} of ${requestsNeeded})...`, 'log');
        }
        
        // Process this batch in parallel - all requests start simultaneously
        // Create all promises at once - they all start executing immediately
        const batchPromises: Promise<{ success: boolean; index: number; error?: any }>[] = [];
        for (let i = 0; i < batchSize; i++) {
          batchPromises.push(processRequest(batchStart + i));
        }
        
        // All promises are now running in parallel - wait for all to complete
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        if (isTtapi) {
          const batchCompleted = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
          addLog(`[${serviceName}] ✅ Batch ${batchNumber}/${totalBatches} completed: ${batchCompleted}/${batchSize} requests successful`, 'success');
        }
        
        // Small delay between batches to avoid overwhelming the API
        if (batchEnd < requestsNeeded && isTtapi) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay between batches
        }
      }
      
      // Calculate summary from actual results
      let completedCount = 0;
      let errorCount = 0;
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.success) {
          // Count images from this successful request (4 images per request, or remaining if last)
          const startIdx = result.value.index * 4;
          const endIdx = Math.min(startIdx + 4, total);
          completedCount += (endIdx - startIdx);
        } else {
          // Count errors from this failed request
          const requestIdx = result.status === 'fulfilled' && result.value.index !== undefined 
            ? result.value.index 
            : idx;
          const startIdx = requestIdx * 4;
          const endIdx = Math.min(startIdx + 4, total);
          errorCount += (endIdx - startIdx);
        }
      });
      
      addLog(`\n📊 Generation Summary:`, 'success');
      addLog(`   ✅ Completed: ${completedCount}/${total}`, 'success');
      addLog(`   ❌ Errors: ${errorCount}/${total}`, errorCount > 0 ? 'error' : 'success');
      addLog(`   ⏳ Remaining: ${total - completedCount - errorCount}/${total}`, 'log');
    }

    setStatus(GenerationStatus.COMPLETED);
    setCurrentProgress(100);
  };

  const constructPrompt = (theme: Theme, settings: GenerationSettings, variationIndex?: number): string => {
    const texture = getTexturePrompt(settings.textureIntensity);
    
    let layoutPrompt = '';
    switch (settings.pageStyle) {
      case 'Full Page': layoutPrompt = 'A full page seamless background texture'; break;
      case 'Collage': layoutPrompt = 'A mixed media collage layout with layered paper scraps'; break;
      case 'Lined': layoutPrompt = 'A page with faint vintage handwriting lines for journaling'; break;
      case 'Grid': layoutPrompt = 'A page with distressed vintage graph paper grid'; break;
      case 'Ephemera Sheet': layoutPrompt = 'A sheet containing multiple cut-out ephemera items like tags, tickets, and cards'; break;
    }

    const elementsPrompt = settings.elements.length > 0 
      ? `featuring elements: ${settings.elements.join(', ')}` 
      : '';

    const extraDetails = [
      settings.includeFrames ? 'ornate vintage frames' : '',
      settings.includeBorders ? 'decorative borders' : ''
    ].filter(Boolean).join(', ');

    // Add variation modifiers to make each image unique
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

    const variationMod = variationIndex !== undefined 
      ? variationModifiers[variationIndex % variationModifiers.length]
      : '';
    const styleVar = variationIndex !== undefined
      ? styleVariations[variationIndex % styleVariations.length]
      : '';

    // CRITICAL: Handle Custom / Override mode with safe, neutral fallback
    if (settings.colorIntensity === 'Custom / Override') {
      // Custom / Override: Safe, neutral fallback - minimal constraints
      let prompt = theme.basePrompt;
      
      // Add custom art style if provided
      if (settings.customArtStyle && settings.customArtStyle.trim()) {
        prompt += `. ${settings.customArtStyle.trim()}`;
      }
      
      // Add ONLY technical constraints - no color/style forcing
      prompt += `. Flat illustration, 2D, high resolution, printable design.`;
      
      // Add seed for variation
      if (variationIndex !== undefined && typeof variationIndex === 'number') {
        const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
        prompt += ` --seed ${seed}`;
      }
      
      // Add additional parameters if provided
      if (settings.parametersForMJ) {
        prompt += ` ${settings.parametersForMJ}`;
      }
      
      return prompt;
    }
    
    // Get color palette and style constraints based on color intensity setting
    let colorPalette: string;
    let styleConstraints: string;
    
    if (settings.colorIntensity === 'Muted') {
      // Muted: sepia, brown tones, faded
      colorPalette = 'muted sepia and brown tones, old faded colors, muted color palette, NOT bright vibrant colors';
      styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
    } else if (settings.colorIntensity === 'Normal') {
      // Normal: normal colors, not muted/sepia, not overly vibrant - gothic/vintage aesthetic
      colorPalette = 'normal colors, deep burgundy, maroon, dark grey, black, antique gold, rich but not faded, NOT sepia, NOT muted, NOT overly vibrant, NOT neon';
      styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), brown/black ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
    } else if (settings.colorIntensity === 'Colorful') {
      // Colorful: vibrant colors with vintage charm
      colorPalette = 'rich vibrant colors (reds, blues, greens, purples, yellows), colorful vintage palette, vibrant but with vintage charm, NOT modern bright colors, NOT neon colors';
      styleConstraints = `VINTAGE JUNK JOURNAL PAGE, aged antique paper, distressed worn texture, ${colorPalette}, extensive cursive handwritten text overlays (like old letters or journal entries), faded brown/sepia ink handwriting, flowing cursive script, multiple layers of handwritten text, vintage postage stamps, old tickets, vintage labels, faded botanical illustrations, floral patterns, sheet music notation, vintage seals, antique ephemera, layered collage style, mixed media junk journal page, tea-stained paper, worn edges, vintage collage style, illustrated style, artistic rendering, stylized illustration, hand-drawn aesthetic, NOT photorealistic, NOT realistic photography, NOT hyper-realistic, NOT modern watercolor, NOT clean digital art, vintage distressed aesthetic, old journal page, aged vintage design, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, no still life photography, no objects placed around page, flat collage design, single flat page layout, one cohesive page design, not a photograph of objects, vintage junk journal aesthetic, illustrated artistic style, real junk journal page with text overlays and ephemera.`;
    } else {
      // Multicolored: vivid, alive, modern - NO vintage/junk journal
      colorPalette = 'vivid, alive, bright, vibrant colors - wide range of vivid colors (blues, greens, purples, oranges, yellows, pinks, teals, vibrant hues), modern watercolor palette, fresh and lively colors';
      styleConstraints = `${colorPalette}, modern watercolor illustration, vivid and alive, fresh and vibrant, clean modern design, NOT vintage, NOT aged, NOT distressed, NOT junk journal style, NOT handwritten text overlays, NOT vintage ephemera, NOT postage stamps, NOT sepia, NOT muted, NOT coffee-stained, flat printable page, SINGLE PAGE ONLY, not a scene, not multiple objects, not a still life composition, no 3D objects, no shadows, no depth, no realistic photography, no realistic lighting, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page, modern colorful illustration.`;
    }
    
    let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. ${styleConstraints}`;
    
    // Add seed or random element for additional variation
    if (variationIndex !== undefined && typeof variationIndex === 'number') {
      const seed = Math.floor(Math.random() * 1000000) + Math.floor(variationIndex) * 1000;
      prompt += ` --seed ${seed}`;
    }
    
    // Add additional parameters if provided
    if (settings.parametersForMJ) {
      prompt += ` ${settings.parametersForMJ}`;
    }
    
    return prompt;
  };

  const getTexturePrompt = (intensity: 'Light' | 'Medium' | 'Heavy'): string => {
    switch (intensity) {
      case 'Light': return 'lightly distressed paper, subtle aging';
      case 'Medium': return 'moderately distressed, tea stained, worn edges';
      case 'Heavy': return 'heavily distressed, grunge texture, burnt edges, heavy stains, torn paper';
    }
  };

  const regenerateImage = async (img: GeneratedImage, index: number) => {
    if (!selectedTheme) return;
    
    addLog(`[Image ${index + 1}] 🔄 Regenerating...`);
    
    // Update status to generating
    setGeneratedImages(prev => prev.map((item, idx) => 
      idx === index ? { ...item, status: 'generating' as const } : item
    ));

    try {
      const generateFunction = settings.imageService === 'pollinations' 
        ? generateWithPollinations 
        : settings.imageService === 'replicate'
        ? generateWithReplicate
        : generateWithTtapi; // Default to Ttapi

      // For Ttapi, we need to handle arrays
      if (settings.imageService === 'ttapi') {
        const base64Urls = await generateFunction(
          selectedTheme,
          settings,
          settings.parametersForMJ,
          settings.aspectRatio || '1:1',
          settings.midjourneyMode || 'fast',
          (status) => {
            setGeneratedImages(prev => prev.map((item, idx) => 
              idx === index ? { ...item, status: status === 'completed' ? 'completed' : 'generating' } : item
            ));
          },
          index,
          img.prompt // Use the same prompt
        ) as string[];

        // Extract original URLs if available
        const originalUrls = (base64Urls as any)?.originalUrls as string[] | undefined;
        const base64Array = Array.isArray(base64Urls) ? base64Urls : [];
        
        // Update with the first image from the array (or use the index if multiple)
        if (base64Array.length > 0) {
          const imageIdx = index % base64Array.length;
          const imageToUse = base64Array[imageIdx] || base64Array[0];
          const originalUrlToUse = originalUrls && originalUrls[imageIdx] ? originalUrls[imageIdx] : undefined;
          
          setGeneratedImages(prev => prev.map((item, idx) => 
            idx === index ? { 
              ...item, 
              url: imageToUse,
              originalUrl: originalUrlToUse, // Store original URL for high-quality downloads
              status: 'completed' as const 
            } : item
          ));
        }
    } else {
        // For Pollinations/Replicate, single image
        const base64Url = await generateFunction(
          selectedTheme,
          settings,
          settings.parametersForMJ,
          settings.aspectRatio || '1:1',
          settings.midjourneyMode || 'fast',
          (status) => {
            setGeneratedImages(prev => prev.map((item, idx) => 
              idx === index ? { ...item, status: status === 'completed' ? 'completed' : 'generating' } : item
            ));
          },
          index,
          img.prompt // Use the same prompt
        ) as string;

        setGeneratedImages(prev => prev.map((item, idx) => 
          idx === index ? { 
            ...item, 
            url: base64Url, 
            status: 'completed' as const 
          } : item
        ));
      }
    } catch (err: any) {
      console.error(`Regeneration failed for image ${index + 1}:`, err);
      setErrorMsg(err.message || "Failed to regenerate image.");
      setGeneratedImages(prev => prev.map((item, idx) => 
        idx === index ? { ...item, status: 'error' as const } : item
      ));
    }
  };

  // Helper function to shuffle array (Fisher-Yates algorithm)
  const shuffleArray = <T extends unknown>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const downloadImage = async (img: GeneratedImage, index: number) => {
    try {
      let blob: Blob;
      
      // Check if this is a grid image that needs to be split fresh for maximum quality
      const gridSliceIndex = (img as any).gridSliceIndex as number | undefined;
      
      if (img.originalUrl && gridSliceIndex !== undefined) {
        // This is a grid image - split it fresh from the original URL to preserve maximum quality
        console.log(`[Download] Grid image detected, splitting fresh from original URL for slice ${gridSliceIndex}`);
        try {
          // Import splitGridImage dynamically
          const { splitGridImage } = await import('./services/ttapiService');
          // Use the proxy URL to fetch the grid image
          const proxyUrl = `/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`;
          const slices = await splitGridImage(proxyUrl);
          
          // Extract the specific slice (slices are base64 data URLs)
          if (slices[gridSliceIndex]) {
            blob = await (await fetch(slices[gridSliceIndex])).blob();
          } else {
            // Fallback to base64 if slice extraction fails
            blob = await (await fetch(img.url)).blob();
          }
        } catch (error) {
          console.warn(`[Download] Failed to split grid fresh, using pre-split base64:`, error);
          // Fallback to base64 if grid splitting fails
          blob = await (await fetch(img.url)).blob();
        }
      } else if (img.originalUrl) {
        // Regular image with original URL - fetch it directly
        const response = await fetch(`/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`);
        if (response.ok) {
          blob = await response.blob();
        } else {
          // Fallback to base64 if original URL fetch fails
          blob = await (await fetch(img.url)).blob();
        }
      } else {
        // Use base64 URL - convert to blob for better compatibility
        blob = await (await fetch(img.url)).blob();
      }
      
      // Create download link with blob
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Use generic filename: image_001.png, image_002.png, etc.
      const paddedIndex = String(index + 1).padStart(3, '0');
      link.download = `image_${paddedIndex}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      // Fallback to simple base64 download
    const link = document.createElement('a');
    link.href = img.url;
      const paddedIndex = String(index + 1).padStart(3, '0');
      link.download = `image_${paddedIndex}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    }
  };

  // Toggle image selection
  const toggleImageSelection = (imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  // Select/deselect all completed images
  const toggleSelectAll = () => {
    const completedImages = generatedImages.filter(img => img.status === 'completed' && img.url);
    if (selectedImages.size === completedImages.length) {
      // All selected, deselect all
      setSelectedImages(new Set());
    } else {
      // Select all completed images
      setSelectedImages(new Set(completedImages.map(img => img.id)));
    }
  };

  // Download only selected images as ZIP
  const downloadSelectedAsZip = async () => {
    try {
      const selectedImagesArray = generatedImages.filter(
        img => selectedImages.has(img.id) && img.status === 'completed' && img.url
      );
      
      if (selectedImagesArray.length === 0) {
        alert('No images selected for download');
        return;
      }

      const zip = new JSZip();
      
      // Show loading state
      addLog(`[Download] Preparing ${selectedImagesArray.length} selected images for download...`);

      // Shuffle images to randomize order
      const shuffledImages = shuffleArray(selectedImagesArray);

      // Import splitGridImage for grid images
      const { splitGridImage } = await import('./services/ttapiService');
      
      for (let i = 0; i < shuffledImages.length; i++) {
        const img = shuffledImages[i];
        try {
          let blob: Blob;
          const gridSliceIndex = (img as any).gridSliceIndex as number | undefined;
          
          // Check if this is a grid image that needs to be split fresh
          if (img.originalUrl && gridSliceIndex !== undefined) {
            try {
              const proxyUrl = `/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`;
              const slices = await splitGridImage(proxyUrl);
              if (slices[gridSliceIndex]) {
                blob = await (await fetch(slices[gridSliceIndex])).blob();
              } else {
                blob = await (await fetch(img.url)).blob();
              }
            } catch (error) {
              console.warn(`Failed to split grid for image ${i + 1}, using base64:`, error);
              blob = await (await fetch(img.url)).blob();
            }
          } else if (img.originalUrl) {
            try {
              const response = await fetch(`/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`);
              if (response.ok) {
                blob = await response.blob();
              } else {
                blob = await (await fetch(img.url)).blob();
              }
            } catch (error) {
              blob = await (await fetch(img.url)).blob();
            }
          } else {
            blob = await (await fetch(img.url)).blob();
          }
          
          // Generate random filename
          const randomName = `image_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
          zip.file(randomName, blob);
        } catch (error) {
          console.error(`Failed to add image ${i + 1} to ZIP:`, error);
        }
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `selected_images_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addLog(`[Download] ✅ Downloaded ${shuffledImages.length} selected images as ZIP`, 'success');
      
      // Clear selection after download
      setSelectedImages(new Set());
    } catch (error: any) {
      console.error('Failed to download selected images:', error);
      addLog(`[Download] ❌ Failed to download: ${error.message}`, 'error');
    }
  };

  const downloadAllAsZip = async () => {
    try {
      const zip = new JSZip();
      const completedImages = generatedImages.filter(img => img.status === 'completed' && img.url);
      
      if (completedImages.length === 0) {
        alert('No completed images to download');
        return;
      }

      // Show loading state
      const loadingMsg = `Preparing ${completedImages.length} images for download...`;
      alert(loadingMsg);

      // Shuffle images to randomize order (so 4 images from each batch aren't grouped together)
      const shuffledImages = shuffleArray(completedImages);
      console.log(`[Download] Shuffled ${shuffledImages.length} images for random order`);

      // Fetch all images and add to zip with generic filenames
      // Use original URLs for high-quality downloads if available
      // Import splitGridImage for grid images
      const { splitGridImage } = await import('./services/ttapiService');
      
      for (let i = 0; i < shuffledImages.length; i++) {
        const img = shuffledImages[i];
        try {
          let blob: Blob;
          const gridSliceIndex = (img as any).gridSliceIndex as number | undefined;
          
          // Check if this is a grid image that needs to be split fresh
          if (img.originalUrl && gridSliceIndex !== undefined) {
            // Grid image - split fresh for maximum quality
            try {
              const proxyUrl = `/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`;
              const slices = await splitGridImage(proxyUrl);
              if (slices[gridSliceIndex]) {
                blob = await (await fetch(slices[gridSliceIndex])).blob();
              } else {
                blob = await (await fetch(img.url)).blob();
              }
            } catch (error) {
              console.warn(`Failed to split grid for image ${i + 1}, using base64:`, error);
              blob = await (await fetch(img.url)).blob();
            }
          } else if (img.originalUrl) {
            // Regular image with original URL - fetch it directly
            try {
              const response = await fetch(`/api/ttapi/image?url=${encodeURIComponent(img.originalUrl)}`);
              if (response.ok) {
                blob = await response.blob();
              } else {
                // Fallback to base64
                blob = await (await fetch(img.url)).blob();
              }
            } catch (error) {
              // Fallback to base64 if original URL fetch fails
              console.warn(`Failed to fetch original URL for image ${i + 1}, using base64:`, error);
              blob = await (await fetch(img.url)).blob();
            }
          } else {
            // Use base64 URL
            blob = await (await fetch(img.url)).blob();
          }
          
          // Use generic filename: image_001.png, image_002.png, etc.
          const paddedIndex = String(i + 1).padStart(3, '0');
          const fileName = `image_${paddedIndex}.png`;
          zip.file(fileName, blob);
        } catch (error) {
          console.error(`Failed to fetch image ${i + 1}:`, error);
        }
      }

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      // Use generic ZIP filename
      link.download = `images_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      alert('Failed to create ZIP file. Please try again.');
    }
  };

  // Helper function to convert image URL to base64
  const urlToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to convert image to base64'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error: any) {
      throw new Error(`Failed to fetch image: ${error.message}`);
    }
  };

  const uploadToGoogleDrive = async () => {
    const completedImages = generatedImages.filter(img => img.status === 'completed' && img.url);
    
    if (completedImages.length === 0) {
      alert('No completed images to upload');
      return;
    }

    // Prompt for folder name
    const folderName = prompt('Enter a name for the Google Drive folder:');
    if (!folderName || folderName.trim() === '') {
      return; // User cancelled or entered empty name
    }

    try {
      setIsUploadingToGoogleDrive(true);
      addLog(`[Google Drive] Preparing to upload ${completedImages.length} images to folder: "${folderName}"...`, 'log');

      // Prepare images for upload
      const imagesToUpload = completedImages.map(img => ({
        url: img.url!,
        originalUrl: img.originalUrl,
      }));

      // Upload to Google Drive with progress callback
      const result = await uploadImagesToGoogleDrive(
        folderName.trim(),
        imagesToUpload,
        (uploaded, total) => {
          addLog(`[Google Drive] Uploading ${uploaded}/${total} images...`, 'log');
        }
      );

      addLog(`[Google Drive] ✅ Successfully uploaded ${result.uploadedFiles.length} images!`, 'success');
      if (result.failed > 0) {
        addLog(`[Google Drive] ⚠️ ${result.failed} images failed to upload`, 'warn');
      }
      addLog(`[Google Drive] 📁 Folder URL: ${result.folderUrl}`, 'success');
      
      // Copy URLs to clipboard if possible
      const urls = result.uploadedFiles.map(f => f.url).join('\n');
      if (navigator.clipboard && urls) {
        try {
          await navigator.clipboard.writeText(urls);
          addLog(`[Google Drive] 📋 URLs copied to clipboard!`, 'success');
        } catch (clipError) {
          console.warn('Failed to copy to clipboard:', clipError);
        }
      }
      
      // Show success modal
      setGoogleDriveModalData({
        title: 'Upload Successful!',
        message: `Successfully uploaded ${result.uploadedFiles.length} images to Google Drive. ${result.failed > 0 ? `(${result.failed} failed)` : ''} All images are stored in your Google Drive folder.`,
        folderUrl: result.folderUrl,
        urls: result.uploadedFiles.map(f => f.url),
        type: 'success',
      });
      setShowGoogleDriveModal(true);
    } catch (error: any) {
      console.error('Error uploading to Google Drive:', error);
      
      // Extract error message - check if it's from the API response
      let errorMessage = error.message || 'Unknown error occurred';
      if (error.message && error.message.includes('401')) {
        // OAuth error - provide helpful guidance
        errorMessage = 'Authentication failed. Please check your Google Drive credentials:\n\n' +
          '1. Verify your Client ID, Client Secret, and Refresh Token are correct\n' +
          '2. Make sure the refresh token was generated with the same Client ID\n' +
          '3. If the refresh token is expired, generate a new one\n' +
          '4. Check that your OAuth consent screen is properly configured\n\n' +
          'See GOOGLE_DRIVE_SETUP.md for detailed instructions.';
      }
      
      addLog(`[Google Drive] ❌ Error: ${errorMessage}`, 'error');
      
      // Show error modal
      setGoogleDriveModalData({
        title: 'Upload Failed',
        message: errorMessage,
        type: 'error',
      });
      setShowGoogleDriveModal(true);
    } finally {
      setIsUploadingToGoogleDrive(false);
    }
  };

  const downloadAllAsPdf = async () => {
    try {
      const completedImages = generatedImages.filter(img => img.status === 'completed' && img.url);
      
      if (completedImages.length === 0) {
        alert('No completed images to download');
        return;
      }

      // Show loading state
      const loadingMsg = `Preparing ${completedImages.length} images for PDF...`;
      alert(loadingMsg);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        try {
          // Fetch image and convert to base64
          const response = await fetch(img.url);
          const blob = await response.blob();
          
          // Convert blob to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result);
              } else {
                reject(new Error('Failed to convert image to base64'));
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          // Create image element to get dimensions
          const imgElement = new Image();
          await new Promise((resolve, reject) => {
            imgElement.onload = resolve;
            imgElement.onerror = reject;
            imgElement.src = base64;
          });

          // Add new page for each image (except first)
          if (i > 0) {
            pdf.addPage();
          }

          // Calculate dimensions to fit A4 (210mm x 297mm) with margins
          const margin = 10;
          const maxWidth = 210 - (margin * 2);
          const maxHeight = 297 - (margin * 2);
          
          const imgWidth = imgElement.width;
          const imgHeight = imgElement.height;
          const aspectRatio = imgWidth / imgHeight;

          // Scale to fit page
          let finalWidth = maxWidth;
          let finalHeight = maxWidth / aspectRatio;
          
          if (finalHeight > maxHeight) {
            finalHeight = maxHeight;
            finalWidth = maxHeight * aspectRatio;
          }

          // Center image on page
          const x = (210 - finalWidth) / 2;
          const y = (297 - finalHeight) / 2;

          // Add image to PDF (use base64 directly)
          pdf.addImage(base64, 'PNG', x, y, finalWidth, finalHeight);
          
          // Add variation number as text at bottom
          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Variation #${img.variationNumber || i + 1}`, margin, 290);
        } catch (error) {
          console.error(`Failed to add image ${i + 1} to PDF:`, error);
        }
      }

      // Save PDF
      pdf.save(`${APP_NAME.replace(/\s+/g, '_')}_${selectedTheme?.name || 'journal'}_collection.pdf`);
    } catch (error) {
      console.error('Error creating PDF:', error);
      alert('Failed to create PDF. Please try again.');
    }
  };

  // --- Render Steps ---

  const renderThemeSelection = () => {
    // If Image Theme Expansion mode is selected, show the single image upload form
    if (isImageThemeExpansion) {
      return (
        <div className="animate-fade-in space-y-8 max-w-3xl mx-auto">
      <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button 
                onClick={() => {
                  setIsImageThemeExpansion(false);
                  setSingleImageForTheme(null);
                }}
                className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft />
              </button>
              <h2 className="text-3xl font-serif text-gothic-gold">Image Theme Expansion</h2>
            </div>
            <p className="text-slate-400">
              Upload ONE image. ChatGPT will extract the theme (PRIMARY SUBJECT) and generate multiple prompts with DIFFERENT subjects but the SAME theme and style.
        </p>
      </div>
      
          <div className="bg-gothic-800 p-8 rounded-xl border border-slate-700 space-y-6">
            {/* Single Image Upload Section */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Upload ONE Reference Image
              </label>
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    const file = files[0]; // Only take first file
                    
                    if (!file.type.startsWith('image/')) {
                      alert(`"${file.name}" is not an image file.`);
                      return;
                    }

                    if (file.size > 20 * 1024 * 1024) {
                      alert(`"${file.name}" is too large (max 20MB).`);
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = async (e) => {
                      const base64Image = e.target?.result as string;
                      const id = `single-theme-${Date.now()}`;
                      
                      // Analyze the image
                      setIsAnalyzingImage(true);
                      try {
                        const analysis = await analyzeReferenceImage(base64Image);
                        if (analysis && analysis.theme && analysis.style) {
                          const { theme, style, colors, vibe, fullAnalysis } = analysis;
                          
                          // Upload to WordPress
                          setIsUploadingStyleRef(true);
                          const wordPressUrl = await uploadImageToWordPress(base64Image);
                          
                          const imageData = {
                            id,
                            base64: base64Image,
                            theme,
                            style,
                            colors,
                            vibe,
                            styleRefUrl: wordPressUrl.status === 'fulfilled' ? wordPressUrl.value : undefined,
                            fullAnalysis
                          };
                          
                          setSingleImageForTheme(imageData);
                          
                          // Update settings with style reference
                          if (wordPressUrl.status === 'fulfilled') {
                            setSettings(prev => ({
                              ...prev,
                              styleRefUrl: wordPressUrl.value,
                              customArtStyle: style || '',
                              colorIntensity: 'Custom / Override'
                            }));
                          }
                          
                          addLog(`✅ Image analyzed: Theme="${theme}", Style="${style}"`, 'success');
                          if (wordPressUrl.status === 'fulfilled') {
                            addLog(`✅ Style Reference uploaded: ${wordPressUrl.value}`, 'success');
                          }
                        } else {
                          addLog(`❌ Failed to analyze image: Invalid response format`, 'error');
                        }
                      } catch (error: any) {
                        console.error('Image analysis error:', error);
                        addLog(`❌ Failed to analyze image: ${error.message || 'Unknown error'}`, 'error');
                      } finally {
                        setIsAnalyzingImage(false);
                        setIsUploadingStyleRef(false);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                  id="single-image-upload"
                  disabled={isAnalyzingImage}
                />
                <label
                  htmlFor="single-image-upload"
                  className={`block w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                    isAnalyzingImage
                      ? 'border-slate-600 bg-slate-900/50 cursor-not-allowed'
                      : singleImageForTheme
                      ? 'border-gothic-gold bg-gothic-gold/10'
                      : 'border-slate-600 bg-slate-900 hover:border-gothic-gold hover:bg-slate-800'
                  }`}
                >
                  {isAnalyzingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="animate-spin text-gothic-gold" size={24} />
                      <span className="text-sm text-slate-400">Analyzing image...</span>
                    </div>
                  ) : singleImageForTheme ? (
                    <div className="w-full space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded border border-gothic-gold/30">
                        <div className="relative w-24 h-24 rounded overflow-hidden border border-gothic-gold flex-shrink-0">
                          <img
                            src={singleImageForTheme.base64}
                            alt="Reference"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gothic-gold font-medium mb-1">Reference Image</div>
                          {singleImageForTheme.theme && (
                            <div className="text-xs text-slate-300 mb-1">
                              <span className="text-slate-500">Theme:</span> {singleImageForTheme.theme}
                            </div>
                          )}
                          {singleImageForTheme.style && (
                            <div className="text-xs text-slate-400 truncate" title={singleImageForTheme.style}>
                              <span className="text-slate-500">Style:</span> {singleImageForTheme.style.substring(0, 50)}...
                            </div>
                          )}
                        </div>
          <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSingleImageForTheme(null);
                            setSettings(prev => ({ ...prev, styleRefUrl: undefined, customArtStyle: '' }));
                          }}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-xs text-gothic-gold hover:text-gothic-gold/80 py-2 border border-gothic-gold/30 rounded hover:bg-gothic-gold/10"
                      >
                        Replace Image
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="text-slate-400" size={24} />
                      <span className="text-sm text-slate-400">
                        Click to upload ONE image
                      </span>
                      <span className="text-xs text-slate-500">PNG, JPG, WEBP up to 20MB</span>
                    </div>
                  )}
                </label>
                
                <p className="text-xs text-slate-500 mt-2">
                  Upload ONE image. ChatGPT will extract the PRIMARY SUBJECT (theme) and generate different subjects for each variation while maintaining the same style.
                </p>
                {settings.styleRefUrl && (
                  <div className="mt-2 p-2 bg-green-900/20 border border-green-700/50 rounded text-xs text-green-400">
                    ✅ Style Reference uploaded: {settings.styleRefUrl.substring(0, 50)}...
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (singleImageForTheme && singleImageForTheme.theme) {
                  // Create a custom theme object with the extracted PRIMARY SUBJECT
                  const customTheme: Theme = {
                    id: 'image-theme-expansion',
                    name: 'Image Theme Expansion',
                    description: `Theme extracted from image: ${singleImageForTheme.theme}`,
                    thumbnail: singleImageForTheme.base64,
                    basePrompt: singleImageForTheme.theme,
                    styleKeywords: ['image-extracted', 'dynamic']
                  };
                  setSelectedTheme(customTheme);
                  setIsImageThemeExpansion(false);
                  setStep(2);
                } else {
                  alert('Please upload and analyze an image first.');
                }
              }}
              disabled={!singleImageForTheme || !singleImageForTheme.theme}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="animate-pulse" size={20} />
              Continue with Image Theme
            </button>
          </div>
        </div>
      );
    }

    // If SREF mode is selected, show the SREF input form
    if (isSrefMode) {
      return (
        <div className="animate-fade-in space-y-8 max-w-3xl mx-auto">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button 
                onClick={() => {
                  setIsSrefMode(false);
                  setSrefCode('');
                  setSrefSubject('');
                  setSrefCategory('');
                  setSrefMoodboard('');
                }}
                className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft />
              </button>
              <h2 className="text-3xl font-serif text-gothic-gold">SREF Style Match</h2>
            </div>
            <p className="text-slate-400">
              Input a subject and optionally a Midjourney SREF code/URL and/or moodboard. The system will generate subject variations while the style references handle styling.
            </p>
          </div>

          <div className="bg-gothic-800 p-8 rounded-xl border border-slate-700 space-y-6">
            {/* Subject Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Primary Subject (Theme)
              </label>
              <input
                type="text"
                value={srefSubject}
                onChange={(e) => setSrefSubject(e.target.value)}
                placeholder="e.g., Gothic Castle, Fantasy Character, Cozy Cottage"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter the main subject or theme. ChatGPT will generate different variations of this subject.
              </p>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Category Type (Optional)
              </label>
              <select
                value={srefCategory}
                onChange={(e) => setSrefCategory(e.target.value)}
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              >
                <option value="">Auto-select (variety across all types)</option>
                <option value="Botanical">Botanical (Plants, Flowers, Mushrooms)</option>
                <option value="Creatures">Creatures (Animals, Insects, Small Wildlife)</option>
                <option value="Artifacts">Artifacts (Keys, Potions, Crystals, Magical Items)</option>
                <option value="Architecture">Architecture (Arches, Doors, Bridges, Structures)</option>
                <option value="Celestial">Celestial (Moon, Stars, Comets, Cosmic Elements)</option>
                <option value="Ephemera">Ephemera (Letters, Quills, Stamps, Vintage Items)</option>
                <option value="Dwellings">Dwellings (Treehouses, Cabins, Nests, Shelters)</option>
              </select>
              <p className="text-xs text-slate-500 mt-2">
                Select a category type to focus on. Leave as "Auto-select" for variety across all types.
              </p>
            </div>

            {/* Midjourney Moodboard */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Midjourney Moodboard (Optional)
              </label>
              <input
                type="text"
                value={srefMoodboard}
                onChange={(e) => setSrefMoodboard(e.target.value)}
                placeholder="e.g., 7396698770005557263 (just the number, or m7396698770005557263)"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter the Midjourney moodboard ID. This will be used as the --p parameter (e.g., --p m7396698770005557263). Optional - you can use SREF instead, or both together.
              </p>
            </div>

            {/* SREF Code/URL Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Midjourney SREF Code or URL
              </label>
              <input
                type="text"
                value={srefCode}
                onChange={(e) => setSrefCode(e.target.value)}
                placeholder="e.g., https://cdn.midjourney.com/... or SREF code"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter the Midjourney style reference code or URL. This will be used as the --sref parameter. Optional - you can use moodboard instead, or both together.
              </p>
            </div>

            <button
              onClick={() => {
                if (srefSubject.trim()) {
                  // Create a custom theme object for SREF mode
                  // SREF code and moodboard are optional - can use one, both, or neither
                  const hasSref = srefCode.trim().length > 0;
                  const hasMoodboard = srefMoodboard.trim().length > 0;
                  let description = `Subject: ${srefSubject.trim()}`;
                  if (hasSref) {
                    description += `, SREF: ${srefCode.trim().substring(0, 50)}...`;
                  }
                  if (hasMoodboard) {
                    description += `, Moodboard: ${srefMoodboard.trim()}`;
                  }
                  if (!hasSref && !hasMoodboard) {
                    description += ` (No style reference - using prompt only)`;
                  }
                  
                  const customTheme: Theme = {
                    id: 'sref-style-match',
                    name: 'SREF Style Match',
                    description,
                    thumbnail: '',
                    basePrompt: srefSubject.trim(),
                    styleKeywords: ['sref', 'style-match']
                  };
                  setSelectedTheme(customTheme);
                  setIsSrefMode(false);
                  setStep(2);
                } else {
                  alert('Please enter a subject. SREF code and moodboard are optional.');
                }
              }}
              disabled={!srefSubject.trim()}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <Link className="animate-pulse" size={20} />
              Continue with SREF Style Match
            </button>
          </div>
        </div>
      );
    }

    // If bulk prompt mode is selected, show the input form
    if (isBulkPromptMode) {
      // Parse prompts from text (each paragraph is a prompt)
      const parsePrompts = (text: string): string[] => {
        return text
          .split(/\n\s*\n/) // Split by double newlines (paragraphs)
          .map(p => p.trim())
          .filter(p => p.length > 0);
      };

      const detectedPrompts = parsePrompts(bulkPrompts);
      
      // Handle prompts generated from Arcane Splitter
      const handleArcaneSplitterPrompts = (prompts: string[], imagesPerPrompt?: number) => {
        setBulkPrompts(prompts.join('\n\n'));
        // Store the images per prompt preference if provided
        if (imagesPerPrompt) {
          setBulkImagesPerPrompt(imagesPerPrompt);
        }
        setShowArcaneSplitter(false);
      };
      
      // If Arcane Splitter is open, show it
      if (showArcaneSplitter) {
        return (
          <div className="animate-fade-in max-w-5xl mx-auto">
            <ArcaneSplitter
              onPromptsGenerated={handleArcaneSplitterPrompts}
              onClose={() => setShowArcaneSplitter(false)}
            />
          </div>
        );
      }
      
      return (
        <div className="animate-fade-in space-y-8 max-w-3xl mx-auto">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button 
                onClick={() => {
                  setIsBulkPromptMode(false);
                  setBulkPrompts('');
                  setBulkMoodboard('');
                  setBulkSrefCode('');
                }}
                className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft />
              </button>
              <h2 className="text-3xl font-serif text-gothic-gold">Bulk Prompt Import</h2>
            </div>
            <p className="text-slate-400">
              Paste multiple prompts (each paragraph is a separate prompt). Each prompt will generate images with optional moodboard and SREF applied.
            </p>
          </div>

          <div className="bg-gothic-800 p-8 rounded-xl border border-slate-700 space-y-6">
            {/* Arcane Splitter Button */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowArcaneSplitter(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 rounded-lg font-medium text-white flex items-center gap-2 transition-all shadow-lg shadow-purple-900/30"
              >
                <Scissors className="w-5 h-5" />
                Open Arcane Splitter
                <span className="text-xs opacity-75">(Slice grids & generate prompts)</span>
              </button>
            </div>
            
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <span className="relative px-4 bg-gothic-800 text-sm text-slate-500">or paste prompts manually</span>
            </div>
            
            {/* Bulk Prompts Textarea */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Prompts (One per paragraph)
              </label>
              <textarea
                value={bulkPrompts}
                onChange={(e) => setBulkPrompts(e.target.value)}
                placeholder="Paste your prompts here, one per paragraph:

A glowing lantern hanging from a twisted tree branch, illuminating the forest floor.

A crystal vial filled with shimmering moonlight, sealed with a silver crescent moon cap.

A silver-furred fox with luminous eyes, playfully chasing fireflies under the moonlight."
                rows={12}
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent resize-none font-mono text-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                Each paragraph will be treated as a separate prompt. Empty lines between paragraphs are used to separate prompts.
              </p>
              {detectedPrompts.length > 0 && (
                <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs text-blue-400">
                  ✓ Detected {detectedPrompts.length} prompt{detectedPrompts.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Moodboard Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Midjourney Moodboard (Optional - applies to all prompts)
              </label>
              <input
                type="text"
                value={bulkMoodboard}
                onChange={(e) => setBulkMoodboard(e.target.value)}
                placeholder="e.g., 7396698770005557263 (just the number, or m7396698770005557263)"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter the Midjourney moodboard ID. This will be applied to all prompts as the --p parameter. Optional.
              </p>
            </div>

            {/* SREF Code Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Midjourney SREF Code or URL (Optional - applies to all prompts)
              </label>
              <input
                type="text"
                value={bulkSrefCode}
                onChange={(e) => setBulkSrefCode(e.target.value)}
                placeholder="e.g., https://cdn.midjourney.com/... or SREF code"
                className="w-full px-4 py-3 bg-gothic-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gothic-gold focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter the Midjourney style reference code or URL. This will be applied to all prompts as the --sref parameter. Optional.
              </p>
            </div>

            {/* Images Per Prompt Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Images to Keep Per Prompt
              </label>
              <div className="flex gap-2">
                {([1, 2, 4] as const).map((num) => (
                  <button
                    key={num}
                    onClick={() => setBulkImagesPerPrompt(num)}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                      bulkImagesPerPrompt === num
                        ? 'bg-gothic-gold text-black'
                        : 'bg-gothic-900 border border-slate-600 text-slate-300 hover:border-gothic-gold/50'
                    }`}
                  >
                    {num} of 4
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Midjourney generates 4 images per prompt. Choose how many to keep (saves time if you only need 1-2).
              </p>
            </div>

            <button
              onClick={() => {
                if (detectedPrompts.length > 0) {
                  // Create a custom theme object for bulk prompt mode
                  const hasSref = bulkSrefCode.trim().length > 0;
                  const hasMoodboard = bulkMoodboard.trim().length > 0;
                  let description = `${detectedPrompts.length} prompt${detectedPrompts.length !== 1 ? 's' : ''}`;
                  if (hasSref) {
                    description += `, SREF: ${bulkSrefCode.trim().substring(0, 50)}...`;
                  }
                  if (hasMoodboard) {
                    description += `, Moodboard: ${bulkMoodboard.trim()}`;
                  }
                  
                  const customTheme: Theme = {
                    id: 'bulk-prompt-import',
                    name: 'Bulk Prompt Import',
                    description,
                    thumbnail: '',
                    basePrompt: detectedPrompts.join('\n\n'), // Store all prompts
                    styleKeywords: ['bulk', 'prompt-import']
                  };
                  setSelectedTheme(customTheme);
                  setIsBulkPromptMode(false);
                  setStep(2);
                } else {
                  alert('Please paste at least one prompt. Each paragraph is treated as a separate prompt.');
                }
              }}
              disabled={detectedPrompts.length === 0}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <FileText className="animate-pulse" size={20} />
              Continue with {detectedPrompts.length > 0 ? `${detectedPrompts.length} Prompt${detectedPrompts.length !== 1 ? 's' : ''}` : 'Bulk Prompts'}
            </button>
          </div>
        </div>
      );
    }

    // If custom theme mode is selected, show the input form
    if (isCustomTheme) {
      return (
        <div className="animate-fade-in space-y-8 max-w-3xl mx-auto">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button 
                onClick={() => {
                  setIsCustomTheme(false);
                  setCustomThemePrompt('');
                }}
                className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft />
              </button>
              <h2 className="text-3xl font-serif text-gothic-gold">Create Custom Theme</h2>
            </div>
            <p className="text-slate-400">
              Enter your own theme description. ChatGPT will use this as the base for generating all prompts.
            </p>
          </div>

          <div className="bg-gothic-800 p-8 rounded-xl border border-slate-700 space-y-6">
            {/* Image Upload Section */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Upload Reference Image (Optional)
              </label>
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                  disabled={isAnalyzingImage}
                />
                <label
                  htmlFor="image-upload"
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    isAnalyzingImage
                      ? 'border-slate-600 bg-slate-800 cursor-not-allowed'
                      : uploadedImages.length > 0
                      ? 'border-gothic-gold bg-gothic-gold/10'
                      : 'border-slate-600 bg-slate-900 hover:border-gothic-gold hover:bg-slate-800'
                  }`}
                >
                  {isAnalyzingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="animate-spin text-gothic-gold" size={24} />
                      <span className="text-sm text-slate-400">Analyzing images...</span>
                    </div>
                  ) : uploadedImages.length > 0 ? (
                    <div className="w-full space-y-2 max-h-64 overflow-y-auto">
                      {uploadedImages.map((img, idx) => (
                        <div key={img.id} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded border border-gothic-gold/30">
                          <div className="relative w-16 h-16 rounded overflow-hidden border border-gothic-gold flex-shrink-0">
                            <img
                              src={img.base64}
                              alt={`Reference ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
            </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gothic-gold font-medium">Image {idx + 1}</div>
                            {img.theme && (
                              <div className="text-xs text-slate-400 truncate" title={img.theme}>
                                Theme: {img.theme}
                              </div>
                            )}
                            {img.style && (
                              <div className="text-xs text-slate-500 truncate" title={img.style}>
                                Style: {img.style.substring(0, 40)}...
                              </div>
                            )}
                            {img.vibe && (
                              <div className="text-xs text-slate-400 truncate" title={img.vibe}>
                                Vibe: {img.vibe.substring(0, 40)}...
                              </div>
                            )}
                            {img.colors && (
                              <div className="text-xs text-slate-400 truncate" title={img.colors}>
                                Colors: {img.colors.substring(0, 50)}...
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRemoveImage(img.id);
                            }}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 flex-shrink-0"
                          >
                            <X size={14} />
          </button>
                        </div>
                      ))}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-xs text-gothic-gold hover:text-gothic-gold/80 py-2 border border-gothic-gold/30 rounded hover:bg-gothic-gold/10"
                      >
                        + Add More Images
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="text-slate-400" size={24} />
                      <span className="text-sm text-slate-400">
                        Click to upload multiple images, drag and drop, or paste (Ctrl+V)
                      </span>
                      <span className="text-xs text-slate-500">PNG, JPG, WEBP up to 20MB each</span>
                    </div>
                  )}
                </label>
                
                
                <p className="text-xs text-slate-500 mt-2">
                  Upload multiple images to create a combined analysis. Uses GPT-4o-mini vision.
                </p>
                {settings.styleRefUrl && (
                  <div className="mt-2 p-2 bg-green-900/20 border border-green-700/50 rounded text-xs text-green-400">
                    ✅ Style Reference uploaded: {settings.styleRefUrl.substring(0, 50)}...
                    {settings.imageService === 'midjourney' && ' (Will be used with --sref)'}
                  </div>
                )}
                {isUploadingStyleRef && (
                  <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs text-blue-400 flex items-center gap-2">
                    <RefreshCw className="animate-spin" size={14} />
                    Uploading style reference to WordPress...
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Custom Theme Description
              </label>
              <textarea
                value={customThemePrompt}
                onChange={(e) => {
                  setCustomThemePrompt(e.target.value);
                  // Theme changed - no action needed (image-specific subject lists are generated per image)
                }}
                placeholder="e.g., 'Vintage botanical journal with pressed flowers, dried herbs, and botanical illustrations', 'Steampunk adventure journal with gears, maps, and mechanical drawings', 'Dark romantic gothic journal with roses, lace, and vintage photographs'..."
                rows={6}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                Describe the overall aesthetic and elements you want in your journal pages. Be specific about colors, textures, and key elements.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Custom Art Style (Optional)
              </label>
              <textarea
                value={settings.customArtStyle}
                onChange={(e) => handleSettingChange('customArtStyle', e.target.value)}
                placeholder="e.g., 'Soft atmospheric watercolor, pastel blue and white palette, traditional art style', 'Celtic Art Nouveau with gold frames', 'Vintage botanical illustration with sepia tones'..."
                rows={4}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                Specify the artistic style, medium, colors, and mood. If filled, this will override default style presets. Leave empty to use random style variations.
              </p>
            </div>

            <button
              onClick={handleCustomThemeSubmit}
              disabled={!customThemePrompt.trim()}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="animate-pulse" size={20} />
              Continue with Custom Theme
            </button>
      </div>
    </div>
  );
    }

    // Default theme selection view
    return (
    <div className="animate-fade-in space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-serif text-gothic-gold">Select Your Aesthetic</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Choose how you want to generate your journal pages - with a custom theme description, by uploading an image to extract the theme, using a Midjourney style reference code, or by pasting multiple prompts.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {/* Custom Theme Option */}
          <button
            onClick={handleCustomThemeSelect}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gothic-800 to-slate-900 border-2 border-dashed border-slate-600 hover:border-gothic-gold transition-all duration-300 text-left h-80 flex flex-col items-center justify-center p-6"
          >
            <div className="text-center space-y-4 z-10">
              <div className="w-16 h-16 mx-auto bg-gothic-gold/20 rounded-full flex items-center justify-center group-hover:bg-gothic-gold/30 transition-colors">
                <Sparkles className="text-gothic-gold" size={32} />
              </div>
              <h3 className="text-xl font-serif text-slate-100 group-hover:text-gothic-gold transition-colors">Custom Theme</h3>
              <p className="text-sm text-slate-400">
                Create your own unique theme with a custom description
              </p>
            </div>
          </button>

          {/* Image Theme Expansion Option */}
          <button
            onClick={handleImageThemeExpansionSelect}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gothic-800 to-slate-900 border-2 border-dashed border-slate-600 hover:border-gothic-gold transition-all duration-300 text-left h-80 flex flex-col items-center justify-center p-6"
          >
            <div className="text-center space-y-4 z-10">
              <div className="w-16 h-16 mx-auto bg-gothic-gold/20 rounded-full flex items-center justify-center group-hover:bg-gothic-gold/30 transition-colors">
                <ImageIcon className="text-gothic-gold" size={32} />
              </div>
              <h3 className="text-xl font-serif text-slate-100 group-hover:text-gothic-gold transition-colors">Image Theme Expansion</h3>
              <p className="text-sm text-slate-400">
                Upload one image - ChatGPT extracts the theme and generates different subjects
              </p>
            </div>
          </button>

          {/* SREF Style Match Option */}
          <button
            onClick={handleSrefModeSelect}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gothic-800 to-slate-900 border-2 border-dashed border-slate-600 hover:border-gothic-gold transition-all duration-300 text-left h-80 flex flex-col items-center justify-center p-6"
          >
            <div className="text-center space-y-4 z-10">
              <div className="w-16 h-16 mx-auto bg-gothic-gold/20 rounded-full flex items-center justify-center group-hover:bg-gothic-gold/30 transition-colors">
                <Link className="text-gothic-gold" size={32} />
              </div>
              <h3 className="text-xl font-serif text-slate-100 group-hover:text-gothic-gold transition-colors">SREF Style Match</h3>
              <p className="text-sm text-slate-400">
                Input a subject and Midjourney SREF code - generates subject variations with style from SREF
              </p>
            </div>
          </button>

          {/* Bulk Prompt Import Option */}
          <button
            onClick={handleBulkPromptModeSelect}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gothic-800 to-slate-900 border-2 border-dashed border-slate-600 hover:border-gothic-gold transition-all duration-300 text-left h-80 flex flex-col items-center justify-center p-6"
          >
            <div className="text-center space-y-4 z-10">
              <div className="w-16 h-16 mx-auto bg-gothic-gold/20 rounded-full flex items-center justify-center group-hover:bg-gothic-gold/30 transition-colors">
                <FileText className="text-gothic-gold" size={32} />
              </div>
              <h3 className="text-xl font-serif text-slate-100 group-hover:text-gothic-gold transition-colors">Bulk Prompt Import</h3>
              <p className="text-sm text-slate-400">
                Paste multiple prompts (one per paragraph) with optional moodboard and SREF for all
              </p>
            </div>
          </button>
      </div>
    </div>
  );
  };

  const renderSettings = () => (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8 flex items-center gap-4">
        <button 
          onClick={() => setStep(1)} 
          className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <ChevronLeft />
        </button>
        <h2 className="text-3xl font-serif text-slate-100">Configure Generation</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Section 1: Page Specs */}
          <div className="bg-gothic-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-serif text-gothic-gold mb-4 flex items-center gap-2">
              <Settings size={18} /> Page Specifications
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Page Style</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Full Page', 'Collage', 'Lined', 'Grid', 'Ephemera Sheet'].map((style) => (
                    <button
                      key={style}
                      onClick={() => handleSettingChange('pageStyle', style)}
                      className={`px-4 py-3 rounded-lg text-sm text-left transition-all ${
                        settings.pageStyle === style 
                          ? 'bg-gothic-accent/20 border-gothic-accent text-white border' 
                          : 'bg-slate-900 border-transparent text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-slate-300 mb-2">
                   Quantity (1-200)
                 </label>
                 <div className="flex gap-3 items-center">
                 <input 
                   type="range" 
                   min="1" 
                     max="200" 
                     value={Math.min(settings.pageCount, 200)}
                   onChange={(e) => handleSettingChange('pageCount', parseInt(e.target.value))}
                     className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-gothic-gold"
                   />
                   <input
                     type="number"
                     min="1"
                     max="200"
                     value={settings.pageCount}
                     onChange={(e) => {
                       const value = parseInt(e.target.value) || 1;
                       const clampedValue = Math.min(Math.max(value, 1), 200);
                       handleSettingChange('pageCount', clampedValue);
                     }}
                     className="w-20 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 text-center focus:outline-none focus:border-gothic-gold transition-colors"
                   />
                 </div>
                 <div className="flex justify-between text-xs text-slate-500 mt-1">
                   <span>1 Page</span>
                   <span className="text-gothic-gold font-bold">{settings.pageCount} Pages</span>
                   <span>200 Pages</span>
                 </div>
                 {settings.pageCount > 50 && (
                   <p className="text-xs text-amber-500 mt-2">
                     ⚠️ Generating {settings.pageCount} images may take a while and use significant API credits.
                   </p>
                 )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Texture Intensity</label>
                <div className="flex bg-slate-900 rounded-lg p-1">
                  {['Light', 'Medium', 'Heavy'].map((intensity) => (
                    <button
                      key={intensity}
                      onClick={() => handleSettingChange('textureIntensity', intensity)}
                      className={`flex-1 py-2 text-sm rounded-md transition-all ${
                        settings.textureIntensity === intensity 
                          ? 'bg-gothic-700 text-white shadow-lg' 
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {intensity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Color Intensity</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Muted', 'Normal', 'Colorful', 'Multicolored', 'Custom / Override'] as const).map((intensity) => (
                    <button
                      key={intensity}
                      onClick={() => handleSettingChange('colorIntensity', intensity)}
                      className={`py-2 px-3 text-sm rounded-md transition-all ${
                        settings.colorIntensity === intensity 
                          ? 'bg-gothic-700 text-white shadow-lg border border-gothic-gold' 
                          : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-700'
                      }`}
                      title={
                        intensity === 'Muted' ? 'Sepia, brown tones, faded colors' :
                        intensity === 'Normal' ? 'Normal colors, gothic/vintage aesthetic' :
                        intensity === 'Colorful' ? 'Vibrant colors with vintage charm' :
                        intensity === 'Multicolored' ? 'Modern, vivid, colorful (not vintage)' :
                        'Custom style - bypasses all default prompts, follows theme exactly'
                      }
                    >
                      {intensity === 'Custom / Override' ? 'Custom / Override' : intensity}
                    </button>
                  ))}
            </div>
                <p className="text-xs text-slate-400 mt-1">
                  {settings.colorIntensity === 'Muted' 
                    ? 'Vintage sepia and brown tones (coffee-stained look)' 
                    : settings.colorIntensity === 'Normal'
                    ? 'Normal colors, gothic/vintage aesthetic (deep burgundy, maroon, dark grey, black, antique gold)'
                    : settings.colorIntensity === 'Colorful'
                    ? 'Vibrant colors while maintaining vintage aesthetic'
                    : settings.colorIntensity === 'Multicolored'
                    ? 'Vivid, alive, modern colorful - NOT vintage, NOT junk journal style'
                    : 'Custom style - no automatic junk journal or modern constraints, follows your theme exactly'}
                </p>
          </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Primary Subject (Optional)</label>
                <input
                  type="text"
                  value={settings.primarySubject || ''}
                  onChange={(e) => handleSettingChange('primarySubject', e.target.value)}
                  placeholder="e.g., Gothic castle, Burning heart, Butterfly..."
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Leave blank to auto-generate varied subjects from theme. Or specify one subject to use for all variations.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                  {['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => handleSettingChange('aspectRatio', ratio)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        settings.aspectRatio === ratio 
                          ? 'bg-gothic-accent/20 border-gothic-accent text-white border' 
                          : 'bg-slate-900 border-transparent text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
            </div>
          </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Image Generation Service</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'ttapi', label: 'Midjourney (Ttapi)', desc: 'Premium quality via ttapi.io, requires API key (Default)' },
                    { value: 'replicate', label: 'Replicate', desc: 'Multiple models, works via Vercel proxy' },
                    { value: 'pollinations', label: 'Pollinations (Free)', desc: 'Fast, free, no API key' }
                  ].map((service) => (
                    <button
                      key={service.value}
                      onClick={() => handleSettingChange('imageService', service.value as 'pollinations' | 'replicate' | 'ttapi')}
                      className={`w-full py-2 px-3 text-sm rounded-md transition-all text-left ${
                        settings.imageService === service.value 
                          ? 'bg-gothic-700 text-white shadow-lg border border-gothic-gold' 
                          : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-700'
                      }`}
                      title={service.desc}
                    >
                      <div className="font-medium">{service.label}</div>
                      <div className="text-xs opacity-75">{service.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Prompt Generation Service</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'openai', label: 'OpenAI (GPT-4o-mini)', desc: 'Default, fast and cost-efficient' },
                    { value: 'openrouter', label: 'OpenRouter (DeepSeek R1)', desc: 'Free model via OpenRouter' },
                    { value: 'huggingface', label: 'Hugging Face (DeepSeek V3.2)', desc: 'DeepSeek via Hugging Face API' }
                  ].map((service) => (
                    <button
                      key={service.value}
                      onClick={() => handleSettingChange('promptService', service.value as 'openai' | 'openrouter' | 'huggingface')}
                      className={`w-full py-2 px-3 text-sm rounded-md transition-all text-left ${
                        (settings.promptService || 'openai') === service.value 
                          ? 'bg-gothic-700 text-white shadow-lg border border-gothic-gold' 
                          : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-700'
                      }`}
                      title={service.desc}
                    >
                      <div className="font-medium">{service.label}</div>
                      <div className="text-xs opacity-75">{service.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {settings.promptService === 'openrouter' 
                    ? '⚠️ Requires VITE_OPENROUTER_API_KEY environment variable'
                    : settings.promptService === 'huggingface'
                    ? '⚠️ Requires VITE_HUGGINGFACE_API_KEY environment variable'
                    : '✓ Requires VITE_OPENAI_API_KEY environment variable'}
                </p>
              </div>

              {/* Model Quality/Mode Selection */}
              {settings.imageService === 'replicate' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Replicate Model</label>
                  <select
                    value={settings.replicateModel || 'black-forest-labs/flux-1.1-pro'}
                    onChange={(e) => handleSettingChange('replicateModel', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-gothic-gold transition-colors"
                  >
                    <option value="black-forest-labs/flux-2-pro">Flux 2 Pro (Latest)</option>
                    <option value="black-forest-labs/flux-1.1-pro">Flux 1.1 Pro</option>
                    <option value="qwen/qwen-image">Qwen Image</option>
                    <option value="recraft-ai/recraft-v3">Recraft V3</option>
                    <option value="google/imagen-4-fast">Imagen 4 Fast</option>
                    <option value="bytedance/seedream-4">Seedream 4</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    ✓ Replicate works via Vercel serverless functions (no CORS issues)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {settings.imageService === 'pollinations' ? 'Model Quality' : 'Midjourney Mode'}
                  </label>
                  <div className="flex bg-slate-900 rounded-lg p-1">
                    {settings.imageService === 'pollinations' ? (
                      <>
                        <button
                          onClick={() => handleSettingChange('midjourneyMode', 'fast')}
                          className={`flex-1 py-2 px-3 text-sm rounded-md transition-all ${
                            settings.midjourneyMode === 'fast' 
                              ? 'bg-gothic-700 text-white shadow-lg' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title="Flux Schnell - Faster generation"
                        >
                          <div className="font-medium">Fast (Flux Schnell)</div>
                          <div className="text-xs opacity-75">Quick generation</div>
                        </button>
                        <button
                          onClick={() => handleSettingChange('midjourneyMode', 'relax')}
                          className={`flex-1 py-2 px-3 text-sm rounded-md transition-all ${
                            settings.midjourneyMode === 'relax' 
                              ? 'bg-gothic-700 text-white shadow-lg' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title="Flux Pro - Higher quality"
                        >
                          <div className="font-medium">Pro (Flux Pro)</div>
                          <div className="text-xs opacity-75">Higher quality</div>
                        </button>
                      </>
                    ) : (
                      <>
                        {['fast', 'relax'].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => handleSettingChange('midjourneyMode', mode)}
                            className={`flex-1 py-2 text-sm rounded-md transition-all capitalize ${
                              settings.midjourneyMode === mode 
                                ? 'bg-gothic-700 text-white shadow-lg' 
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Additional Parameters (optional)
                </label>
                <input
                  type="text"
                  value={settings.parametersForMJ || ''}
                  onChange={(e) => handleSettingChange('parametersForMJ', e.target.value)}
                  placeholder="e.g., --iw 2, --v 6, --style raw"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Add Midjourney parameters that will be appended to the prompt
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Elements */}
          <div className="bg-gothic-800 p-6 rounded-xl border border-slate-700">
             <h3 className="text-lg font-serif text-gothic-gold mb-4 flex items-center gap-2">
              <Sparkles size={18} /> Optional Elements
            </h3>
            <div className="flex flex-wrap gap-3">
              {OPTIONAL_ELEMENTS.map(el => (
                <button
                  key={el}
                  onClick={() => toggleElement(el)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    settings.elements.includes(el)
                      ? 'bg-gothic-gold/20 border-gothic-gold text-gothic-gold'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {el}
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-6">
               <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    settings.includeFrames ? 'bg-gothic-gold border-gothic-gold' : 'border-slate-600 bg-slate-900'
                  }`}>
                    {settings.includeFrames && <div className="w-2.5 h-2.5 bg-black rounded-sm" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={settings.includeFrames} onChange={(e) => handleSettingChange('includeFrames', e.target.checked)} />
                  <span className="text-slate-300 group-hover:text-white transition-colors">Include Frames</span>
               </label>

               <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    settings.includeBorders ? 'bg-gothic-gold border-gothic-gold' : 'border-slate-600 bg-slate-900'
                  }`}>
                    {settings.includeBorders && <div className="w-2.5 h-2.5 bg-black rounded-sm" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={settings.includeBorders} onChange={(e) => handleSettingChange('includeBorders', e.target.checked)} />
                  <span className="text-slate-300 group-hover:text-white transition-colors">Include Borders</span>
               </label>
            </div>
          </div>
        </div>

        {/* Right Column: Summary */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 sticky top-8">
            <h3 className="text-lg font-serif text-white mb-4">Generation Summary</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-500">Theme</span>
                <span className="text-gothic-gold">
                  {isCustomTheme ? 'Custom Theme' : selectedTheme?.name}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-500">Style</span>
                <span className="text-slate-300">{settings.pageStyle}</span>
              </div>
               <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-500">Texture</span>
                <span className="text-slate-300">{settings.textureIntensity}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-500">Count</span>
                <span className="text-slate-300">{settings.pageCount} Pages</span>
              </div>
            </div>

            <button
              onClick={startGeneration}
              disabled={status === GenerationStatus.GENERATING}
              className="w-full mt-8 bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="animate-pulse" size={20} />
              Generate Pages
            </button>
            <p className="text-xs text-center mt-3 text-slate-500">
              {settings.pageCount <= 10 ? (
                <>Estimated time: {settings.pageCount * 2}-{settings.pageCount * 5} minutes - 300 DPI Quality</>
              ) : (
                <>Large batch: {settings.pageCount} images will be generated in parallel. Time depends on service speed.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-gothic-gold rounded-full border-t-transparent animate-spin"></div>
        <Sparkles className="absolute inset-0 m-auto text-gothic-gold animate-pulse" />
      </div>
      <h2 className="text-2xl font-serif text-white mb-2">Weaving Magic...</h2>
      <p className="text-slate-400 mb-8 max-w-md">
        {settings.imageService === 'pollinations' 
          ? 'Pollinations.AI is crafting your' 
          : settings.imageService === 'ttapi'
          ? 'Ttapi is crafting your'
          : settings.imageService === 'replicate'
          ? 'Replicate is crafting your'
          : 'Ttapi is crafting your'} {selectedTheme?.name} journal pages. 
        {settings.imageService === 'pollinations' 
          ? ' This should be quick!' 
          : ' This process may take a few minutes as we generate high-resolution images.'}
      </p>
      
      <div className="w-full max-w-md bg-slate-800 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-gothic-gold h-full transition-all duration-300 ease-out"
          style={{ width: `${currentProgress}%` }}
        />
      </div>
      <p className="mt-4 text-gothic-gold font-mono text-sm">{Math.round(currentProgress)}% Completed</p>
      {status === GenerationStatus.GENERATING && (
        <p className="mt-2 text-slate-500 text-xs">
          Status: Processing... This may take 2-10 minutes per image
        </p>
      )}
      
      {errorMsg && (
        <div className="mt-8 p-4 bg-red-900/30 border border-red-800 text-red-200 rounded-lg max-w-md">
          <p className="font-bold">Error:</p>
          <p>{errorMsg}</p>
          <button 
            onClick={() => { setStatus(GenerationStatus.IDLE); setStep(2); }}
            className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900 rounded border border-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );

  const renderGallery = () => {
    const completedCount = generatedImages.filter(img => img.status === 'completed' && img.url).length;

    return (
    <div className="animate-fade-in">
       <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
              onClick={() => {
                setStep(2);
              }} 
            className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <ChevronLeft />
          </button>
            <h2 className="text-3xl font-serif text-slate-100">
              Your Collection {generatedImages.length > 0 && `(${generatedImages.length} images)`}
            </h2>
        </div>
        
          <div className="flex gap-3 flex-wrap">
            {completedCount > 0 && (
              <>
                {/* Selection Controls */}
                <button 
                  onClick={toggleSelectAll}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedImages.size === completedCount 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  }`}
                  title={selectedImages.size === completedCount ? "Deselect all images" : "Select all images"}
                >
                  {selectedImages.size === completedCount ? (
                    <>
                      <Check size={18} /> Deselect All
                    </>
                  ) : (
                    <>
                      <Square size={18} /> Select All ({completedCount})
                    </>
                  )}
                </button>
                
                {/* Download Selected - only show when images are selected */}
                {selectedImages.size > 0 && (
                  <button 
                    onClick={downloadSelectedAsZip}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                    title="Download only selected images as ZIP"
                  >
                    <Archive size={18} /> Download Selected ({selectedImages.size})
                  </button>
                )}
                
                <button 
                  onClick={downloadAllAsZip}
                  className="flex items-center gap-2 px-4 py-2 bg-gothic-gold hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
                  title="Download all images as ZIP file"
                >
                  <Archive size={18} /> Download All ({completedCount})
                </button>
                <button 
                  onClick={downloadAllAsPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-gothic-gold hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
                  title="Download all images as PDF"
                >
                  <FileText size={18} /> Download PDF ({completedCount})
                </button>
                <button 
                  onClick={uploadToGoogleDrive}
                  disabled={isUploadingToGoogleDrive}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  title="Upload all images to Google Drive (images will be shuffled, renamed, converted to JPG, and organized in a folder)"
                >
                  {isUploadingToGoogleDrive ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" /> Uploading... ({completedCount})
                    </>
                  ) : (
                    <>
                      <Link size={18} /> Upload to Google Drive ({completedCount})
                    </>
                  )}
                </button>
              </>
            )}
           <button 
            onClick={() => {
              setStep(2);
              setGeneratedImages([]);
              setSelectedImages(new Set());
              setStatus(GenerationStatus.IDLE);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={18} /> New Batch
          </button>
        </div>
      </div>

        {/* Grid Layout: 3 columns - Show all images */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {generatedImages.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-400">
              <p>No images generated yet. Start generating to see them here.</p>
            </div>
          ) : (
            generatedImages.map((img, idx) => {
              const actualIndex = idx;
              const isSelected = selectedImages.has(img.id);
              return (
          <div key={img.id} className={`bg-white rounded-xl overflow-hidden shadow-lg border-2 transition-all ${
            isSelected ? 'border-purple-500 ring-2 ring-purple-300' : 'border-gray-200'
          }`}>
            {/* Image Container */}
            <div className="relative bg-gray-100 aspect-square flex items-center justify-center">
              {/* Selection Checkbox - only show for completed images */}
              {img.status === 'completed' && img.url && (
                <button
                  onClick={() => toggleImageSelection(img.id)}
                  className={`absolute top-3 left-3 z-10 p-1.5 rounded-lg transition-all ${
                    isSelected 
                      ? 'bg-purple-600 text-white shadow-lg' 
                      : 'bg-white/90 text-gray-600 hover:bg-white hover:text-purple-600 shadow'
                  }`}
                  title={isSelected ? "Deselect image" : "Select image"}
                >
                  {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              )}
              
              {img.status === 'generating' ? (
                <div className="flex flex-col items-center justify-center p-8">
                  <div className="w-16 h-16 border-4 border-gothic-gold border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-500 text-sm">Generating...</p>
                </div>
              ) : img.status === 'error' ? (
                <div className="flex flex-col items-center justify-center p-8 text-red-500">
                  <ImageIcon size={48} className="mb-2" />
                  <p className="text-sm">Generation Failed</p>
                </div>
              ) : img.url ? (
            <img 
              src={img.url} 
                  alt={`Variation ${img.variationNumber || idx + 1}`} 
                  className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-90' : ''}`}
                  onClick={() => img.status === 'completed' && toggleImageSelection(img.id)}
                  style={{ cursor: img.status === 'completed' ? 'pointer' : 'default' }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                  <ImageIcon size={48} className="mb-2" />
                  <p className="text-sm">No Image</p>
                </div>
              )}
            </div>
            
            {/* Card Content */}
            <div className="p-4">
              {/* Variation Label */}
              <div className="mb-2">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                  VARIATION #{img.variationNumber || idx + 1}
                </span>
              </div>
              
              {/* Prompt Text with Copy Button */}
              <div className="mb-4">
                <div className="flex items-start gap-2 mb-2">
                  <p className="text-sm text-gray-700 line-clamp-3 min-h-[3rem] flex-1">
                    {img.prompt}
                  </p>
              <button 
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(img.prompt);
                        setCopiedPromptIndex(idx);
                        setTimeout(() => setCopiedPromptIndex(null), 2000);
                      } catch (err) {
                        console.error('Failed to copy prompt:', err);
                      }
                    }}
                    className="flex-shrink-0 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    title="Copy prompt"
                  >
                    {copiedPromptIndex === idx ? (
                      <Check size={16} className="text-green-600" />
                    ) : (
                      <Copy size={16} />
                    )}
              </button>
            </div>
          </div>
              
              {/* Action Buttons */}
              {img.status === 'completed' && img.url ? (
                <div className="flex gap-2">
              <button 
                    onClick={() => setPreviewImage(img)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                    <Eye size={16} />
                    Preview
              </button>
                  <button 
                    onClick={() => downloadImage(img, actualIndex)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Download
                  </button>
                  <button 
                    onClick={() => regenerateImage(img, actualIndex)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    title="Regenerate this image with the same prompt"
                  >
                    <RefreshCw size={16} />
                    Regenerate
                  </button>
            </div>
              ) : img.status === 'generating' ? (
                <button 
                  disabled
                  className="w-full bg-gray-300 text-gray-500 font-medium py-2 px-4 rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} className="animate-spin" />
                  Generating...
                </button>
              ) : (
                <button 
                  onClick={() => {
                    // Regenerate this specific image
                    setGeneratedImages(prev => prev.map((imgItem, i) => 
                      i === actualIndex ? { ...imgItem, status: 'generating', url: '' } : imgItem
                    ));
                    // Trigger regeneration logic here
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  Generate
                </button>
              )}
          </div>
          </div>
            );
            })
          )}
      </div>
      
        {/* Progress indicator if generating */}
        {status === GenerationStatus.GENERATING && (
          <div className="mt-8 p-6 bg-slate-900/50 rounded-xl border border-slate-800 text-center">
            <div className="w-full max-w-md mx-auto bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
              <div 
                className="bg-gothic-gold h-full transition-all duration-300 ease-out"
                style={{ width: `${currentProgress}%` }}
              />
      </div>
            <p className="text-gothic-gold font-mono text-sm">{Math.round(currentProgress)}% Completed</p>
          </div>
        )}
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-gothic-900 text-slate-200 font-sans selection:bg-gothic-gold selection:text-black">
      {/* Header */}
      <header className="border-b border-slate-800 bg-gothic-900/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gothic-gold rounded-lg flex items-center justify-center">
              <FileDown className="text-gothic-900" size={24} />
            </div>
            <h1 className="text-xl font-serif font-bold text-slate-100 tracking-wide">{APP_NAME}</h1>
          </div>
          <div className="flex items-center gap-4">
          <div className="text-xs text-slate-500 font-mono hidden md:block">
              AI-POWERED • V.1.0 • {settings.imageService === 'pollinations' ? 'POLLINATIONS' : settings.imageService === 'replicate' ? 'REPLICATE' : 'TTAPI'}
            </div>
            {APP_PASSWORD && (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg border border-slate-700 hover:border-red-700 transition-all"
                title="Logout"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto px-6 py-12 transition-all duration-300 ${showSidebar ? 'mr-80' : ''}`}>
            {step === 1 && renderThemeSelection()}
            {step === 2 && renderSettings()}
            {step === 4 && renderGallery()}
        {step === 3 && status === GenerationStatus.GENERATING && renderLoading()}
      </main>

      {/* Console Logs Sidebar */}
      {status === GenerationStatus.GENERATING && (
        <div className={`fixed right-0 top-20 bottom-0 w-80 bg-slate-900 border-l border-slate-800 shadow-2xl z-40 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Sidebar Header */}
          <div className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Terminal size={20} className="text-gothic-gold" />
              <h3 className="text-sm font-semibold text-slate-200">Console Logs</h3>
            </div>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800 rounded"
              title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            >
              {showSidebar ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          {/* Logs Container */}
          <div className="h-[calc(100vh-5rem)] overflow-y-auto p-4 font-mono text-xs">
            {consoleLogs.length === 0 ? (
              <div className="text-slate-500 text-center mt-8">
                <Terminal size={32} className="mx-auto mb-2 opacity-50" />
                <p>Waiting for logs...</p>
              </div>
            ) : (
              <div className="space-y-1">
                {consoleLogs.map((log) => {
                  const time = new Date(log.timestamp).toLocaleTimeString();
                  return (
                    <div
                      key={log.id}
                      className={`p-2 rounded border-l-2 ${
                        log.type === 'error'
                          ? 'bg-red-900/20 border-red-500 text-red-300'
                          : log.type === 'success'
                          ? 'bg-green-900/20 border-green-500 text-green-300'
                          : 'bg-slate-800/50 border-slate-600 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 text-[10px] mt-0.5 flex-shrink-0">{time}</span>
                        <span className="break-words whitespace-pre-wrap">{log.message}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="absolute bottom-0 left-0 right-0 h-12 border-t border-slate-800 bg-slate-900 flex items-center justify-between px-4">
            <span className="text-xs text-slate-500">
              {consoleLogs.length} log{consoleLogs.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setConsoleLogs([])}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 hover:bg-slate-800 rounded"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Toggle Button (when hidden) */}
      {status === GenerationStatus.GENERATING && !showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="fixed right-4 top-24 z-40 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 p-2 rounded-lg shadow-lg transition-all hover:scale-105"
          title="Show console logs"
        >
          <Terminal size={20} />
        </button>
      )}

      {/* Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Variation #{previewImage.variationNumber || 'N/A'}
                </h3>
                <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                  {previewImage.prompt}
                </p>
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-2 hover:bg-slate-800 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Image */}
            <div className="p-4">
              <img 
                src={previewImage.url} 
                alt="Preview" 
                className="w-full h-auto rounded-lg"
              />
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 flex gap-2">
              <button
                onClick={() => {
                  if (previewImage) {
                    const index = generatedImages.findIndex(img => img.id === previewImage.id);
                    downloadImage(previewImage, index);
                  }
                }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Download Image
              </button>
              <button
                onClick={() => setPreviewImage(null)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Upload Modal */}
      {showGoogleDriveModal && googleDriveModalData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-gothic-800/95 backdrop-blur-sm border-2 border-emerald-500/30 rounded-xl p-8 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-serif ${googleDriveModalData.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                {googleDriveModalData.title}
              </h3>
              <button
                onClick={() => {
                  setShowGoogleDriveModal(false);
                  setGoogleDriveModalData(null);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-slate-200">{googleDriveModalData.message}</p>

              {googleDriveModalData.type === 'success' && googleDriveModalData.folderUrl && (
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                  <p className="text-slate-300 mb-2 text-sm font-medium">📁 Google Drive Folder URL:</p>
                  <a
                    href={googleDriveModalData.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 break-all text-sm flex items-center gap-2 transition-colors"
                  >
                    <Link size={16} />
                    {googleDriveModalData.folderUrl}
                  </a>
                  <p className="text-green-400 text-xs mt-2">✅ Images are stored in your Google Drive folder!</p>
                </div>
              )}

              {googleDriveModalData.type === 'success' && googleDriveModalData.urls && googleDriveModalData.urls.length > 0 && (
                <>
                  {/* Public URLs Notice */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-green-400 text-sm font-medium mb-1">✅ Google Drive URLs</p>
                    <p className="text-slate-300 text-xs">
                      These URLs link to your images in Google Drive. Make sure the folder is shared if you want to share these links with others.
                    </p>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-slate-300 text-sm font-medium">Image URLs ({googleDriveModalData.urls.length}):</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(googleDriveModalData.urls?.join('\n') || '');
                              addLog('[Google Drive] 📋 URLs copied to clipboard!', 'success');
                            } catch (error) {
                              console.error('Failed to copy:', error);
                            }
                          }}
                          className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 transition-colors"
                        >
                          <Copy size={14} />
                          Copy All
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {googleDriveModalData.urls.map((url, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-slate-500 text-xs mt-1">{index + 1}.</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 break-all text-xs flex-1"
                        >
                          {url}
                        </a>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(url);
                              addLog(`[Google Drive] 📋 URL ${index + 1} copied!`, 'success');
                            } catch (error) {
                              console.error('Failed to copy:', error);
                            }
                          }}
                          className="text-slate-400 hover:text-emerald-400 transition-colors p-1"
                          title="Copy URL"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                {googleDriveModalData.type === 'success' && googleDriveModalData.urls && googleDriveModalData.urls.length > 0 && (
                  <>
                    <button
                      onClick={() => {
                        // Download as text file
                        const content = googleDriveModalData.urls?.join('\n') || '';
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `google-drive-urls-${Date.now()}.txt`;
                        link.click();
                        URL.revokeObjectURL(url);
                        addLog('[Google Drive] 📄 URLs file downloaded!', 'success');
                      }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText size={18} />
                      Download URLs (.txt)
                    </button>
                    <button
                      onClick={() => {
                        // Download as HTML file
                        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Google Drive Image URLs</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #1e1e1e; color: #fff; }
    a { color: #34d399; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .url { margin: 10px 0; padding: 10px; background: #2d2d2d; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Google Drive Image URLs (${googleDriveModalData.urls?.length || 0} images)</h1>
  <p>All images are stored in your Google Drive folder.</p>
  ${googleDriveModalData.urls?.map((url, i) => `
    <div class="url">
      <strong>Image ${i + 1}:</strong><br>
      <a href="${url}" target="_blank">${url}</a>
    </div>
  `).join('')}
</body>
</html>`;
                        const blob = new Blob([htmlContent], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `google-drive-urls-${Date.now()}.html`;
                        link.click();
                        URL.revokeObjectURL(url);
                        addLog('[Google Drive] 📄 HTML file downloaded!', 'success');
                      }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText size={18} />
                      Download URLs (.html)
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setShowGoogleDriveModal(false);
                    setGoogleDriveModalData(null);
                  }}
                  className={`flex-1 ${googleDriveModalData.type === 'success' ? 'bg-slate-700 hover:bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600 text-white'} text-white font-medium py-3 px-4 rounded-lg transition-colors`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
