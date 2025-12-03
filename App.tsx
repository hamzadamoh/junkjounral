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
  Check
} from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { THEMES, OPTIONAL_ELEMENTS, APP_NAME } from './constants';
import { Theme, GenerationSettings, GenerationStatus, GeneratedImage } from './types';
import { generateJournalPage as generateWithMidjourney } from './services/midjourneyService';
import { generateJournalPage as generateWithPollinations } from './services/pollinationsService';
import { generateJournalPage as generateWithReplicate } from './services/replicateService';
import { generateJournalPage as generateWithLegnext } from './services/legnextService';
import { generateJournalPage as generateWithTtapi } from './services/ttapiService';
import { generatePromptWithChatGPT } from './services/chatgptService';

const App: React.FC = () => {
  // --- State ---
  const [step, setStep] = useState<number>(1);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [isCustomTheme, setIsCustomTheme] = useState<boolean>(false);
  const [customThemePrompt, setCustomThemePrompt] = useState<string>('');
  const [settings, setSettings] = useState<GenerationSettings>({
    pageCount: 1, // Defaulting to 1 for demo purposes to save quota
    textureIntensity: 'Medium',
    colorIntensity: 'Muted',
    pageStyle: 'Full Page',
    elements: [],
    includeFrames: false,
    includeBorders: false,
    aspectRatio: '1:1',
    midjourneyMode: 'fast',
    parametersForMJ: '',
    imageService: 'pollinations', // Default to Pollinations (free, no API key needed)
    replicateModel: 'black-forest-labs/flux-1.1-pro',
    customThemePrompt: '',
  });
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  

  // --- Handlers ---

  const handleThemeSelect = (theme: Theme) => {
    setSelectedTheme(theme);
    setIsCustomTheme(false);
    setCustomThemePrompt('');
    setStep(2);
  };

  const handleCustomThemeSelect = () => {
    setIsCustomTheme(true);
    setSelectedTheme(null);
  };

  const handleCustomThemeSubmit = () => {
    if (customThemePrompt.trim()) {
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
      setStep(2);
    }
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
    console.log('Generating prompts...');
    
    // Determine the theme name to use - if custom theme, use the custom prompt directly
    const themeName = isCustomTheme && customThemePrompt.trim() 
      ? customThemePrompt.trim() 
      : selectedTheme?.name || 'Custom Theme';
    
    // For custom themes, the customThemePrompt from settings is additional details
    // For predefined themes, it's an enhancement
    const additionalThemePrompt = settings.customThemePrompt || '';
    
    // For Midjourney/Legnext: Only generate prompts for the number of requests needed (1 prompt per 4 images)
    // For Pollinations/Replicate: Generate a prompt for each image
    let promptsToGenerate: number;
    let generatedPrompts: string[];
    
    if (settings.imageService === 'midjourney' || settings.imageService === 'legnext' || settings.imageService === 'ttapi') {
      // Only need prompts for the number of requests (each request generates 4 images)
      promptsToGenerate = Math.ceil(total / 4);
      const serviceName = settings.imageService === 'legnext' ? 'Legnext' : settings.imageService === 'ttapi' ? 'Ttapi' : 'Midjourney';
      console.log(`[${serviceName}] Generating ${promptsToGenerate} prompts for ${total} images (4 images per prompt)`);
      
      const promptPromises = Array.from({ length: promptsToGenerate }, (_, i) => 
        generatePromptWithChatGPT(
          themeName,
          settings.pageStyle,
          settings.textureIntensity,
          settings.elements,
          settings.includeFrames,
          settings.includeBorders,
          i + 1,
          additionalThemePrompt,
          settings.colorIntensity
        ).catch((error) => {
          console.warn(`ChatGPT prompt generation failed for request ${i + 1}, using fallback:`, error);
          // Fallback to constructed prompt if ChatGPT fails
          return constructPrompt(selectedTheme, settings, i);
        })
      );
      
      const requestPrompts = await Promise.all(promptPromises);
      
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
      
      const promptPromises = Array.from({ length: total }, (_, i) => 
        generatePromptWithChatGPT(
          themeName,
          settings.pageStyle,
          settings.textureIntensity,
          settings.elements,
          settings.includeFrames,
          settings.includeBorders,
          i + 1,
          additionalThemePrompt,
          settings.colorIntensity
        ).catch((error) => {
          console.warn(`ChatGPT prompt generation failed for variation ${i + 1}, using fallback:`, error);
          // Fallback to constructed prompt if ChatGPT fails
          return constructPrompt(selectedTheme, settings, i);
        })
      );

      generatedPrompts = await Promise.all(promptPromises);
    }
    
    // Update all prompts in the images
    setGeneratedImages(prev => prev.map((img, idx) => ({
      ...img,
      prompt: generatedPrompts[idx]
    })));

    // STEP 2: Generate all images
    console.log(`[${settings.imageService}] Generating all images...`);
    const generateFunction = settings.imageService === 'pollinations' 
      ? generateWithPollinations 
      : settings.imageService === 'replicate'
      ? generateWithReplicate
      : settings.imageService === 'legnext'
      ? generateWithLegnext
      : settings.imageService === 'ttapi'
      ? generateWithTtapi
      : generateWithMidjourney;
    
    console.log(`[${settings.imageService}] Selected generate function:`, generateFunction.name || 'anonymous');

    // For Replicate, maximize the 6 requests/minute limit
    // Rate limit: 6 requests/minute = 1 request every 10 seconds
    // Send requests at 10s intervals without waiting for completion to maximize throughput
    if (settings.imageService === 'replicate') {
      const requestsPerMinute = 6;
      const delayBetweenRequests = (60 * 1000) / requestsPerMinute; // Exactly 10 seconds between requests
      
      console.log(`Sending ${total} Replicate requests at ${requestsPerMinute} requests/minute (${delayBetweenRequests / 1000}s intervals)...`);
      
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
          
          console.log(`[Image ${i + 1}/${total}] 🚀 Starting Replicate generation...`);
          
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

            console.log(`[Image ${i + 1}/${total}] ✅ COMPLETED`);
      } catch (err: any) {
            console.error(`[Image ${i + 1}/${total}] ❌ ERROR:`, err.message || err);
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
      // For Pollinations, use throttled batch processing to avoid rate limits
      // Pollinations has strict rate limits, so we'll process in smaller batches with delays
      const batchSize = 5; // Reduced from 10 to 5 to avoid rate limits
      const delayBetweenBatches = 5000; // Increased to 5 seconds between batches
      const delayBetweenRequests = 1000; // 1 second delay between individual requests in a batch
      
      console.log(`Processing ${total} Pollinations images in batches of ${batchSize} with ${delayBetweenBatches}ms delays...`);
      
      for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, total);
        console.log(`[Batch ${Math.floor(batchStart / batchSize) + 1}] Processing images ${batchStart + 1}-${batchEnd}...`);
        
        const batchPromises = Array.from({ length: batchEnd - batchStart }, async (_, batchIdx) => {
          const i = batchStart + batchIdx;
          
          // Add delay between individual requests to avoid hitting rate limits
          if (batchIdx > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
          }
          
          console.log(`[Image ${i + 1}/${total}] 🚀 Starting Pollinations generation...`);
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

            console.log(`[Image ${i + 1}/${total}] ✅ COMPLETED`);
            return { success: true, index: i };
          } catch (err: any) {
            console.error(`[Image ${i + 1}/${total}] ❌ ERROR:`, err.message || err);
            setErrorMsg(err.message || "Failed to generate some pages.");
            setGeneratedImages(prev => prev.map((img, idx) => 
              idx === i ? { ...img, status: 'error' as const } : img
            ));
            return { success: false, index: i, error: err };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Wait before next batch (except for the last batch)
        if (batchEnd < total) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
    } else if (settings.imageService === 'midjourney' || settings.imageService === 'legnext' || settings.imageService === 'ttapi') {
      // For Midjourney (GoAPI, Legnext, or Ttapi), generate in parallel
      // Note: Midjourney returns 4 images per request, so we need fewer requests
      const serviceName = settings.imageService === 'legnext' ? 'Legnext' : settings.imageService === 'ttapi' ? 'Ttapi' : 'Midjourney';
      const requestsNeeded = Math.ceil(total / 4);
      console.log(`[${serviceName}] Starting ${requestsNeeded} request(s) for ${total} images (4 images per request)...`);
      
      const imagePromises = Array.from({ length: requestsNeeded }, async (_, requestIdx) => {
        const startIdx = requestIdx * 4;
        const endIdx = Math.min(startIdx + 4, total);
        const imageRange = `${startIdx + 1}-${endIdx}`;
        
        console.log(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] 🚀 Starting generation for images ${imageRange}...`);
        try {
          // Midjourney/Legnext returns an array of images (typically 4)
          const base64Urls = await generateFunction(
            selectedTheme, 
            settings,
            settings.parametersForMJ,
            settings.aspectRatio || '1:1',
            settings.midjourneyMode || 'fast',
            (status) => {
              console.log(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] 📊 Status: ${status.toUpperCase()} (Images ${imageRange})`);
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
              console.log(`[Image ${actualIdx + 1}/${total}] ✅ COMPLETED`);
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

          console.log(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] ✅ COMPLETED - Generated ${base64Urls.length} images (Images ${imageRange})`);
          return { success: true, index: requestIdx };
        } catch (err: any) {
          console.error(`[${serviceName} Request ${requestIdx + 1}/${requestsNeeded}] ❌ ERROR (Images ${imageRange}):`, err.message || err);
          setErrorMsg(err.message || "Failed to generate some pages.");
          const startIdx = requestIdx * 4;
          const endIdx = Math.min(startIdx + 4, total);
          setGeneratedImages(prev => prev.map((img, idx) => 
            idx >= startIdx && idx < endIdx ? { ...img, status: 'error' as const } : img
          ));
          return { success: false, index: requestIdx, error: err };
        }
      });

      await Promise.allSettled(imagePromises);
    }

    const completedCount = generatedImages.filter(img => img.status === 'completed' && img.url).length;
    const errorCount = generatedImages.filter(img => img.status === 'error').length;
    console.log(`\n📊 Generation Summary:`);
    console.log(`   ✅ Completed: ${completedCount}/${total}`);
    console.log(`   ❌ Errors: ${errorCount}/${total}`);
    console.log(`   ⏳ Remaining: ${total - completedCount - errorCount}/${total}`);
    
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

  const regenerateImage = async (img: GeneratedImage, index: number) => {
    if (!selectedTheme) return;
    
    console.log(`[Image ${index + 1}] 🔄 Regenerating...`);
    
    // Update status to generating
    setGeneratedImages(prev => prev.map((item, idx) => 
      idx === index ? { ...item, status: 'generating' as const } : item
    ));

    try {
      const generateFunction = settings.imageService === 'pollinations' 
        ? generateWithPollinations 
        : settings.imageService === 'replicate'
        ? generateWithReplicate
        : settings.imageService === 'legnext'
        ? generateWithLegnext
        : settings.imageService === 'ttapi'
        ? generateWithTtapi
        : generateWithMidjourney;

      // For Midjourney/Legnext, we need to handle arrays
      if (settings.imageService === 'midjourney' || settings.imageService === 'legnext' || settings.imageService === 'ttapi') {
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
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Custom Theme Description
              </label>
              <textarea
                value={customThemePrompt}
                onChange={(e) => setCustomThemePrompt(e.target.value)}
                placeholder="e.g., 'Vintage botanical journal with pressed flowers, dried herbs, and botanical illustrations', 'Steampunk adventure journal with gears, maps, and mechanical drawings', 'Dark romantic gothic journal with roses, lace, and vintage photographs'..."
                rows={6}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                Describe the overall aesthetic and elements you want in your journal pages. Be specific about colors, textures, and key elements.
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
                  {(['Muted', 'Normal', 'Colorful', 'Multicolored'] as const).map((intensity) => (
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
                        'Modern, vivid, colorful (not vintage)'
                      }
                    >
                      {intensity}
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
                    : 'Vivid, alive, modern colorful - NOT vintage, NOT junk journal style'}
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
                    { value: 'pollinations', label: 'Pollinations (Free)', desc: 'Fast, free, no API key' },
                    { value: 'replicate', label: 'Replicate', desc: 'Multiple models, works via Vercel proxy' },
                    { value: 'midjourney', label: 'Midjourney (GoAPI)', desc: 'Premium quality via GoAPI, requires API key' },
                    { value: 'legnext', label: 'Midjourney (Legnext)', desc: 'Premium quality via Legnext.ai, requires API key' },
                    { value: 'ttapi', label: 'Midjourney (Ttapi)', desc: 'Premium quality via ttapi.io, requires API key' }
                  ].map((service) => (
                    <button
                      key={service.value}
                      onClick={() => handleSettingChange('imageService', service.value as 'midjourney' | 'pollinations' | 'replicate' | 'legnext' | 'ttapi')}
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

          {/* Section 2: Custom Theme Prompt */}
          <div className="bg-gothic-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-serif text-gothic-gold mb-4 flex items-center gap-2">
              <Sparkles size={18} /> Custom Theme Prompt (Optional)
            </h3>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Additional Theme Description
              </label>
              <textarea
                value={settings.customThemePrompt || ''}
                onChange={(e) => handleSettingChange('customThemePrompt', e.target.value)}
                placeholder="e.g., 'vintage botanical illustrations with pressed flowers', 'steampunk mechanical gears and brass', 'dark romantic gothic architecture'..."
                rows={4}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-gothic-gold transition-colors resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                ChatGPT will incorporate this into the generated prompts. Leave empty to use only the selected theme.
              </p>
            </div>
          </div>

          {/* Section 3: Elements */}
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
          : settings.imageService === 'legnext' 
          ? 'Legnext is crafting your'
          : settings.imageService === 'ttapi'
          ? 'Ttapi is crafting your'
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
