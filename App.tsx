import React, { useState, useCallback, useRef } from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  Settings, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  ChevronLeft,
  Printer,
  FileDown
} from 'lucide-react';
import { THEMES, OPTIONAL_ELEMENTS, APP_NAME } from './constants';
import { Theme, GenerationSettings, GenerationStatus, GeneratedImage } from './types';
import { generateJournalPage } from './services/midjourneyService';

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
    
    setStep(3);
    setStatus(GenerationStatus.GENERATING);
    setCurrentProgress(0);
    setErrorMsg(null);
    setGeneratedImages([]); // Clear previous

    const total = settings.pageCount;
    const newImages: GeneratedImage[] = [];

    // Loop for "Batch" processing simulation
    for (let i = 0; i < total; i++) {
      try {
        const base64Url = await generateJournalPage(
          selectedTheme, 
          settings,
          settings.parametersForMJ,
          settings.aspectRatio || '1:1',
          settings.midjourneyMode || 'fast',
          (status) => {
            console.log(`Page ${i + 1} status: ${status}`);
          }
        );
        
        const newImage: GeneratedImage = {
          id: crypto.randomUUID(),
          url: base64Url,
          prompt: selectedTheme.basePrompt,
          timestamp: Date.now()
        };
        
        newImages.push(newImage);
        setGeneratedImages(prev => [...prev, newImage]);
        setCurrentProgress(((i + 1) / total) * 100);

      } catch (err: any) {
        console.error("Generation failed for a page", err);
        setErrorMsg(err.message || "Failed to generate some pages.");
        // We continue trying to generate the rest if one fails
      }
    }

    setStatus(GenerationStatus.COMPLETED);
    // Auto advance to preview if at least one image succeeded
    if (newImages.length > 0) {
      setTimeout(() => setStep(4), 1000);
    } else {
      setStatus(GenerationStatus.ERROR);
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
                   Quantity (1-5 for Demo)
                 </label>
                 <input 
                   type="range" 
                   min="1" 
                   max="5" 
                   value={settings.pageCount}
                   onChange={(e) => handleSettingChange('pageCount', parseInt(e.target.value))}
                   className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-gothic-gold"
                 />
                 <div className="flex justify-between text-xs text-slate-500 mt-1">
                   <span>1 Page</span>
                   <span className="text-gothic-gold font-bold">{settings.pageCount} Pages</span>
                   <span>5 Pages</span>
                 </div>
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
                <label className="block text-sm font-medium text-slate-300 mb-2">Midjourney Mode</label>
                <div className="flex bg-slate-900 rounded-lg p-1">
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
                </div>
              </div>

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
              Estimated time: {settings.pageCount * 2}-{settings.pageCount * 5} minutes per page - 300 DPI Quality
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
        Midjourney is crafting your {selectedTheme?.name} journal pages. This process may take a few minutes as we generate high-resolution images.
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

  const renderGallery = () => (
    <div className="animate-fade-in">
       <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setStep(2)} 
            className="p-2 hover:bg-gothic-700 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <ChevronLeft />
          </button>
          <h2 className="text-3xl font-serif text-slate-100">Your Collection</h2>
        </div>
        
        <div className="flex gap-3">
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

      <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
        {generatedImages.map((img, idx) => (
          <div key={img.id} className="break-inside-avoid relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
            <img 
              src={img.url} 
              alt={`Generated journal page ${idx + 1}`} 
              className="w-full h-auto object-cover"
            />
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
              <button 
                onClick={() => downloadImage(img, idx)}
                className="bg-gothic-gold text-black px-6 py-2 rounded-full font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:scale-105"
              >
                <Download size={18} /> Save PNG
              </button>
              <span className="text-slate-300 text-xs px-4 text-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75">
                300 DPI • Print Ready
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Disclaimer / Footer inside gallery */}
      <div className="mt-12 p-6 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 text-center">
        <Printer className="mx-auto text-slate-600 mb-2" size={24} />
        <p className="text-slate-500 text-sm">
          These images are generated at high resolution suitable for printing. 
          For best results, print on matte photo paper or cardstock.
        </p>
      </div>
    </div>
  );

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
            AI-POWERED • V.1.0 • MIDJOURNEY
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {status === GenerationStatus.GENERATING ? renderLoading() : (
          <>
            {step === 1 && renderThemeSelection()}
            {step === 2 && renderSettings()}
            {step === 4 && renderGallery()}
          </>
        )}
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
