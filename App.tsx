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
  Table
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
  const [srefCode, setSrefCode] = useState<string>('');
  const [srefSubject, setSrefSubject] = useState<string>('');
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
  const [consoleLogs, setConsoleLogs] = useState<Array<{ id: string; message: string; timestamp: number; type: 'log' | 'error' | 'success' }>>([]);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; base64: string; theme?: string; style?: string; colors?: string; vibe?: string; styleRefUrl?: string; fullAnalysis?: any }>>([]);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [styleRefUrl, setStyleRefUrl] = useState<string | null>(null);
  const [isUploadingStyleRef, setIsUploadingStyleRef] = useState<boolean>(false);
  
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
    setSelectedTheme(null);
  };

  const handleImageThemeExpansionSelect = () => {
    setIsImageThemeExpansion(true);
    setIsCustomTheme(false);
    setIsSrefMode(false);
    setSelectedTheme(null);
  };

  const handleSrefModeSelect = () => {
    setIsSrefMode(true);
    setIsCustomTheme(false);
    setIsImageThemeExpansion(false);
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
              useOpenRouter
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
          srefCode // SREF code/URL
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
      
      // Rate limiting: Ttapi has strict limits, stagger requests
      // For Ttapi: Send requests with 2-3 second delays to avoid rate limits
      // For other services: Can send in parallel or with smaller delays
      const isTtapi = settings.imageService === 'ttapi';
      const delayBetweenRequests = isTtapi ? 2500 : 1000; // 2.5s for Ttapi, 1s for others
      const maxConcurrent = isTtapi ? 3 : 5; // Max 3 concurrent for Ttapi, 5 for others
      
      if (isTtapi) {
        addLog(`[${serviceName}] Starting ${requestsNeeded} request(s) for ${total} images (4 images per request) with rate limiting (${delayBetweenRequests / 1000}s delays, max ${maxConcurrent} concurrent)...`);
      } else {
        addLog(`[${serviceName}] Starting ${requestsNeeded} request(s) for ${total} images (4 images per request)...`);
      }
      
      const imagePromises = Array.from({ length: requestsNeeded }, async (_, requestIdx) => {
        // Add delay to stagger requests and avoid rate limits (especially for Ttapi)
        if (requestIdx > 0 && isTtapi) {
          const delay = requestIdx * delayBetweenRequests;
          addLog(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] ⏳ Waiting ${delay / 1000}s to avoid rate limits...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const startIdx = requestIdx * 4;
        const endIdx = Math.min(startIdx + 4, total);
        const imageRange = `${startIdx + 1}-${endIdx}`;
        
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
          
          if (isSrefModeForGeneration && srefCode.trim()) {
            // SREF mode: use the SREF code/URL as style reference
            imageStyleRefUrl = srefCode.trim();
            console.log(`[Midjourney Request ${requestIdx + 1}] Using SREF Style Match mode - SREF code: ${srefCode.substring(0, 50)}...`);
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
          const imageSpecificSettings = {
            ...settings,
            styleRefUrl: imageStyleRefUrl || settings.styleRefUrl,
            skipStyleReference: isImageThemeMode ? true : false // SREF mode should NOT skip style reference
          };
          
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
            settings.parametersForMJ,
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
            generatedPrompts[requestIdx * 4] // Use prompt from first image in this batch
          ) as string[]; // Type assertion: Midjourney returns array
          
          // Add all images from this request to the gallery
          base64Urls.forEach((base64Url, imgIdx) => {
            const actualIdx = startIdx + imgIdx;
            if (actualIdx < total) {
              addLog(`[Image ${actualIdx + 1}/${total}] ✅ COMPLETED`, 'success');
              setGeneratedImages(prev => prev.map((img, idx) => 
                idx === actualIdx ? { 
                  ...img, 
                  url: base64Url, 
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
      });

      const results = await Promise.allSettled(imagePromises);
      
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

        // Update with the first image from the array (or use the index if multiple)
        if (base64Urls && base64Urls.length > 0) {
          const imageToUse = base64Urls[index % base64Urls.length] || base64Urls[0];
          setGeneratedImages(prev => prev.map((item, idx) => 
            idx === index ? { 
              ...item, 
              url: imageToUse, 
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

  const downloadImage = (img: GeneratedImage, index: number) => {
    const link = document.createElement('a');
    link.href = img.url;
    link.download = `${APP_NAME.replace(/\s+/g, '_')}_${selectedTheme?.name}_${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      // Fetch all images and add to zip
      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        try {
          const response = await fetch(img.url);
          const blob = await response.blob();
          const fileName = `${APP_NAME.replace(/\s+/g, '_')}_${selectedTheme?.name || 'journal'}_variation_${img.variationNumber || i + 1}.png`;
          zip.file(fileName, blob);
        } catch (error) {
          console.error(`Failed to fetch image ${i + 1}:`, error);
        }
      }

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${APP_NAME.replace(/\s+/g, '_')}_${selectedTheme?.name || 'journal'}_collection.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      alert('Failed to create ZIP file. Please try again.');
    }
  };

  const exportToGoogleSheets = async () => {
    const completedImages = generatedImages.filter(img => img.status === 'completed' && img.url);
    
    if (completedImages.length === 0) {
      alert('No completed images to export');
      return;
    }

    try {
      addLog(`[Google Sheets] Preparing to export ${completedImages.length} images...`, 'log');
      
      // Prepare data for Google Sheets
      const sheetData = {
        images: completedImages.map((img, index) => ({
          title: `Image ${index + 1}`,
          prompt: img.prompt || 'No prompt available',
          url: img.url || '',
          variationNumber: img.variationNumber || index + 1
        })),
        themeName: selectedTheme?.name || 'Custom Theme'
      };

      // Call the API endpoint to create Google Sheet
      const response = await fetch('/api/google-sheets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sheetData),
      });

      const result = await response.json();

      if (result.success) {
        addLog(`[Google Sheets] ✅ Data prepared successfully!`, 'success');
        // Generate and download CSV
        const csvContent = generateCSVForGoogleSheets(completedImages);
        const filename = `Generated_Images_${selectedTheme?.name || 'Custom'}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadCSV(csvContent, filename);
        
        // Show instructions
        const instructions = `CSV file downloaded!\n\nNext steps:\n1. Open Google Sheets\n2. File → Import → Upload the CSV file\n3. Use the Google Apps Script (provided in documentation) to insert images\n\nOr manually:\n- Column D ("inserted") will have checkboxes\n- Column E ("image preview") will show images after running the script`;
        alert(instructions);
      } else {
        throw new Error(result.error || 'Failed to prepare Google Sheets data');
      }
    } catch (error: any) {
      console.error('Error exporting to Google Sheets:', error);
      addLog(`[Google Sheets] ❌ Error: ${error.message}`, 'error');
      alert(`Failed to export to Google Sheets: ${error.message}`);
    }
  };

  const generateCSVForGoogleSheets = (images: GeneratedImage[]): string => {
    // Headers matching the Google Apps Script format
    const headers = ['Title for Canva', 'Ingredients for Canva', 'Image for Canva', 'inserted', 'image preview'];
    const rows = [headers];

    images.forEach((img, index) => {
      rows.push([
        `Image ${index + 1}`,
        img.prompt || 'No prompt available',
        img.url || '',
        'FALSE', // Checkbox column
        '' // Image preview column (will be populated by script)
      ]);
    });

    // Convert to CSV format
    return rows.map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                }}
                className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft />
              </button>
              <h2 className="text-3xl font-serif text-gothic-gold">SREF Style Match</h2>
            </div>
            <p className="text-slate-400">
              Input a subject and Midjourney SREF code/URL. The system will generate subject variations while the SREF handles all styling.
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
                Enter the Midjourney style reference code or URL. This will be used as the --sref parameter.
              </p>
            </div>

            <button
              onClick={() => {
                if (srefSubject.trim() && srefCode.trim()) {
                  // Create a custom theme object for SREF mode
                  const customTheme: Theme = {
                    id: 'sref-style-match',
                    name: 'SREF Style Match',
                    description: `Subject: ${srefSubject.trim()}, SREF: ${srefCode.trim().substring(0, 50)}...`,
                    thumbnail: '',
                    basePrompt: srefSubject.trim(),
                    styleKeywords: ['sref', 'style-match']
                  };
                  setSelectedTheme(customTheme);
                  setIsSrefMode(false);
                  setStep(2);
                } else {
                  alert('Please enter both a subject and SREF code/URL.');
                }
              }}
              disabled={!srefSubject.trim() || !srefCode.trim()}
              className="w-full bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-black font-bold py-4 rounded-lg shadow-lg shadow-amber-900/20 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <Link className="animate-pulse" size={20} />
              Continue with SREF Style Match
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
          Choose how you want to generate your journal pages - with a custom theme description, by uploading an image to extract the theme, or using a Midjourney style reference code.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
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
                    { value: 'openrouter', label: 'OpenRouter (DeepSeek R1)', desc: 'Free model via OpenRouter' }
                  ].map((service) => (
                    <button
                      key={service.value}
                      onClick={() => handleSettingChange('promptService', service.value as 'openai' | 'openrouter')}
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
                <button 
                  onClick={downloadAllAsZip}
                  className="flex items-center gap-2 px-4 py-2 bg-gothic-gold hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
                  title="Download all images as ZIP file"
                >
                  <Archive size={18} /> Download ZIP ({completedCount})
                </button>
                <button 
                  onClick={downloadAllAsPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-gothic-gold hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
                  title="Download all images as PDF"
                >
                  <FileText size={18} /> Download PDF ({completedCount})
                </button>
                <button 
                  onClick={exportToGoogleSheets}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  title="Export to Google Sheets"
                >
                  <Table size={18} /> Export to Sheets ({completedCount})
                </button>
              </>
            )}
           <button 
            onClick={() => {
              setStep(2);
              setGeneratedImages([]);
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
              return (
          <div key={img.id} className="bg-white rounded-xl overflow-hidden shadow-lg border border-gray-200">
            {/* Image Container */}
            <div className="relative bg-gray-100 aspect-square flex items-center justify-center">
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
                  className="w-full h-full object-cover"
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
