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
  FileText
} from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { THEMES, OPTIONAL_ELEMENTS, APP_NAME } from './constants';
import { Theme, GenerationSettings, GenerationStatus, GeneratedImage } from './types';
import { generateJournalPage as generateWithMidjourney } from './services/midjourneyService';
import { generateJournalPage as generateWithPollinations } from './services/pollinationsService';
import { generateJournalPage as generateWithReplicate } from './services/replicateService';
import { generatePromptWithChatGPT } from './services/chatgptService';

const App: React.FC = () => {
  // --- State ---
  const [step, setStep] = useState<number>(1);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [settings, setSettings] = useState<GenerationSettings>({
    pageCount: 1, // Defaulting to 1 for demo purposes to save quota
    textureIntensity: 'Medium',
    pageStyle: 'Full Page',
    elements: [],
    includeFrames: false,
    includeBorders: false,
    aspectRatio: '1:1',
    midjourneyMode: 'fast',
    parametersForMJ: '',
    imageService: 'pollinations', // Default to Pollinations (free, no API key needed)
    replicateModel: 'black-forest-labs/flux-1.1-pro',
  });
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  

  // --- Handlers ---

  const handleThemeSelect = (theme: Theme) => {
    setSelectedTheme(theme);
    setStep(2);
  };

  const handleSettingChange = (field: keyof GenerationSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
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
    if (!selectedTheme) return;
    
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

    // STEP 1: Generate all prompts in parallel (much faster!)
    console.log('Generating all prompts in parallel...');
    const promptPromises = Array.from({ length: total }, (_, i) => 
      generatePromptWithChatGPT(
        selectedTheme.name,
        settings.pageStyle,
        settings.textureIntensity,
        settings.elements,
        settings.includeFrames,
        settings.includeBorders,
        i + 1
      ).catch((error) => {
        console.warn(`ChatGPT prompt generation failed for variation ${i + 1}, using fallback:`, error);
        // Fallback to constructed prompt if ChatGPT fails
        return constructPrompt(selectedTheme, settings, i);
      })
    );

    // Wait for all prompts to be generated
    const generatedPrompts = await Promise.all(promptPromises);
    
    // Update all prompts in the images
    setGeneratedImages(prev => prev.map((img, idx) => ({
      ...img,
      prompt: generatedPrompts[idx]
    })));

    // STEP 2: Generate all images
    console.log('Generating all images...');
    const generateFunction = settings.imageService === 'pollinations' 
      ? generateWithPollinations 
      : settings.imageService === 'replicate'
      ? generateWithReplicate
      : generateWithMidjourney;

    // For Replicate, use sequential processing with API key rotation
    // Rate limit: 6 requests/minute per API key
    // With multiple keys, we can process faster by rotating between them
    if (settings.imageService === 'replicate') {
      // Get number of available keys from server
      let keyCount = 1; // Default to 1 key
      try {
        const keysResponse = await fetch('/api/replicate/keys');
        if (keysResponse.ok) {
          const keysData = await keysResponse.json();
          keyCount = keysData.keyCount || 1;
          console.log(`Detected ${keyCount} Replicate API key(s) for rotation`);
        }
      } catch (err) {
        console.warn('Could not fetch key count, defaulting to 1:', err);
      }
      
      const requestsPerKeyPerMinute = 6;
      const totalRequestsPerMinute = keyCount * requestsPerKeyPerMinute;
      const delayBetweenRequests = Math.max(1000, (60 * 1000) / totalRequestsPerMinute); // Distribute requests across keys
      
      console.log(`Using ${keyCount} key(s): ${totalRequestsPerMinute} requests/minute, ${(delayBetweenRequests / 1000).toFixed(1)}s delay between requests`);
      
      let currentKeyIndex = 0;
      
      // Process images sequentially, rotating API keys
      for (let i = 0; i < total; i++) {
        console.log(`Processing Replicate image ${i + 1}/${total} with key ${currentKeyIndex + 1}...`);
          try {
            const base64Url = await generateFunction(
              selectedTheme, 
              settings,
              settings.parametersForMJ,
              settings.aspectRatio || '1:1',
              settings.midjourneyMode || 'fast',
              (status) => {
                console.log(`Page ${i + 1} status: ${status}`);
                setGeneratedImages(prev => prev.map((img, idx) => 
                  idx === i ? { ...img, status: status === 'completed' ? 'completed' : 'generating' } : img
                ));
              },
              i,
              generatedPrompts[i],
              currentKeyIndex // Pass key index for rotation
            );
            
            // Rotate to next key for next request
            currentKeyIndex = (currentKeyIndex + 1) % keyCount;
            
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

            console.log(`✓ Completed image ${i + 1}/${total}`);
          } catch (err: any) {
            console.error(`Generation failed for page ${i + 1}:`, err);
            setErrorMsg(err.message || "Failed to generate some pages.");
            setGeneratedImages(prev => prev.map((img, idx) => 
              idx === i ? { ...img, status: 'error' as const } : img
            ));
          }
        
        // Wait before next request (except for the last one)
        if (i < total - 1) {
          console.log(`Waiting ${delayBetweenRequests / 1000} seconds before next request...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
      }
    } else {
      // For Pollinations and Midjourney, generate in parallel
      const imagePromises = Array.from({ length: total }, async (_, i) => {
        try {
          const base64Url = await generateFunction(
            selectedTheme, 
            settings,
            settings.parametersForMJ,
            settings.aspectRatio || '1:1',
            settings.midjourneyMode || 'fast',
            (status) => {
              console.log(`Page ${i + 1} status: ${status}`);
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
            const completed = prev + (100 / total);
            return Math.min(completed, 100);
          });

          return { success: true, index: i };
        } catch (err: any) {
          console.error(`Generation failed for page ${i + 1}:`, err);
          setErrorMsg(err.message || "Failed to generate some pages.");
          setGeneratedImages(prev => prev.map((img, idx) => 
            idx === i ? { ...img, status: 'error' as const } : img
          ));
          return { success: false, index: i, error: err };
        }
      });

      await Promise.allSettled(imagePromises);
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

    let prompt = `${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. ${variationMod}${variationMod && styleVar ? ', ' : ''}${styleVar}. Digital junk journal page design, flat printable page, no 3D objects, no shadows, no depth, no realistic photography, flat illustration style, top-down view, printable scrapbook page, digital design, flat lay design, high resolution printable journal page.`;
    
    // Add seed or random element for additional variation
    if (variationIndex !== undefined) {
      const seed = Math.floor(Math.random() * 1000000) + variationIndex * 1000;
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

  const renderThemeSelection = () => (
    <div className="animate-fade-in space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-serif text-gothic-gold">Select Your Aesthetic</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Choose a foundational theme for your junk journal collection. Each theme comes with specialized prompts and textures tailored for print.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {THEMES.map(theme => (
          <button
            key={theme.id}
            onClick={() => handleThemeSelect(theme)}
            className="group relative overflow-hidden rounded-xl bg-gothic-800 border border-slate-700 hover:border-gothic-gold transition-all duration-300 text-left h-80"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent z-10" />
            <img 
              src={theme.thumbnail} 
              alt={theme.name} 
              className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
              <h3 className="text-xl font-serif text-slate-100 mb-2 group-hover:text-gothic-gold transition-colors">{theme.name}</h3>
              <p className="text-sm text-slate-300 line-clamp-2">{theme.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

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
                    { value: 'pollinations', label: 'Pollinations (Free)', desc: 'Fast, free, no API key' },
                    { value: 'replicate', label: 'Replicate', desc: 'Multiple models, works via Vercel proxy' },
                    { value: 'midjourney', label: 'Midjourney', desc: 'Premium quality, requires API key' }
                  ].map((service) => (
                    <button
                      key={service.value}
                      onClick={() => handleSettingChange('imageService', service.value as 'midjourney' | 'pollinations' | 'replicate')}
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
                <span className="text-gothic-gold">{selectedTheme?.name}</span>
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
          : 'Midjourney is crafting your'} {selectedTheme?.name} journal pages. 
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
              
              {/* Prompt Text */}
              <p className="text-sm text-gray-700 mb-4 line-clamp-3 min-h-[3rem]">
                {img.prompt}
              </p>
              
              {/* Action Button */}
              {img.status === 'completed' && img.url ? (
                <button 
                  onClick={() => downloadImage(img, actualIndex)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  Download
                </button>
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
          <div className="text-xs text-slate-500 font-mono hidden md:block">
            AI-POWERED • V.1.0 • {settings.imageService === 'pollinations' ? 'POLLINATIONS' : settings.imageService === 'replicate' ? 'REPLICATE' : 'MIDJOURNEY'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {step === 1 && renderThemeSelection()}
        {step === 2 && renderSettings()}
        {step === 4 && renderGallery()}
        {step === 3 && status === GenerationStatus.GENERATING && renderLoading()}
      </main>

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
