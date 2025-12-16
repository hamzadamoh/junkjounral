'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { themes, getThemeById } from '@/lib/themes';
import { GenerationSettings, PageStyle, TextureIntensity } from '@/lib/types';
import { getRandomIllustrations } from '@/lib/prompts';
import { motion } from 'framer-motion';
import { Settings, Sparkles, Download } from 'lucide-react';
import Link from 'next/link';
import { SynestheticButton } from '@/components/SynestheticButton';

export const dynamic = 'force-dynamic';

const illustrationOptions = [
  'ravens', 'keys', 'moths', 'moons', 'roses', 'skulls',
  'candles', 'books', 'quills', 'crystals', 'gears', 'branches'
];

function GeneratePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const themeId = searchParams.get('theme') || themes[0].id;

  const [settings, setSettings] = useState<GenerationSettings>({
    themeId,
    pageCount: 20,
    pageStyle: 'full-page-background',
    textureIntensity: 'medium',
    includeFrames: false,
    includeBorders: true,
    includeWatermarks: false,
    includeIllustrations: true,
    illustrationTypes: getRandomIllustrations(3),
    midjourneyMode: 'fast',
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPages, setGeneratedPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTheme = getThemeById(settings.themeId);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedPages([]);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate pages');
      }

      const data = await response.json();
      console.log('Generation response:', { jobId: data.jobId, pagesCount: data.pages?.length });
      
      setGeneratedPages(data.pages || []);
      
      // Store pages in localStorage as backup
      if (data.pages && data.pages.length > 0) {
        const cacheData = { pages: data.pages, jobId: data.jobId, timestamp: Date.now() };
        localStorage.setItem(`job_${data.jobId}`, JSON.stringify(cacheData));
        console.log('Pages cached to localStorage:', data.pages.length);
        
        // Small delay to ensure localStorage is written before navigation
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.warn('No pages in response:', data);
      }
      
      // Navigate to preview page with pages in state
      router.push(`/preview?jobId=${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <header className="border-b border-gothic-gold/20 bg-gothic-charcoal/50 backdrop-blur-sm sticky top-0 z-50 w-full">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-3xl font-display font-bold text-gothic-gold">
              Gothic Junk Journal Generator
            </Link>
            <nav className="flex gap-6">
              <Link href="/" className="text-gothic-parchment hover:text-gothic-gold transition-colors">
                Home
              </Link>
              <Link href="/themes" className="text-gothic-parchment hover:text-gothic-gold transition-colors">
                Themes
              </Link>
              <Link href="/generate" className="text-gothic-parchment hover:text-gothic-gold transition-colors">
                Generate
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col pt-20">
        <main className="flex-1 container mx-auto px-4 py-8 flex gap-6 max-w-7xl">
          {/* Settings Sidebar */}
          <aside className="w-80 flex-shrink-0 sticky top-24 spatial-depth">
            <motion.div
              className="gothic-card h-fit"
              whileHover={{ 
                scale: 1.02,
                rotateY: 2,
                rotateX: 2,
              }}
              transition={{ type: "spring", stiffness: 300 }}
            >
            <div className="flex items-center gap-2 mb-6">
              <Settings className="text-gothic-gold" size={24} />
              <h2 className="text-2xl font-display font-semibold text-gothic-gold">
                Settings
              </h2>
            </div>

            {/* Theme Selection */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-2">Theme</label>
              <select
                value={settings.themeId}
                onChange={(e) => setSettings({ ...settings, themeId: e.target.value })}
                className="gothic-input w-full"
              >
                {themes.map(theme => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Count */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-2">
                Page Count: {settings.pageCount}
              </label>
              <input
                type="range"
                min="20"
                max="500"
                value={settings.pageCount}
                onChange={(e) => setSettings({ ...settings, pageCount: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gothic-parchment/60 mt-1">
                <span>20</span>
                <span>500</span>
              </div>
            </div>

            {/* Page Style */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-2">Page Style</label>
              <select
                value={settings.pageStyle}
                onChange={(e) => setSettings({ ...settings, pageStyle: e.target.value as PageStyle })}
                className="gothic-input w-full"
              >
                <option value="full-page-background">Full Page Background</option>
                <option value="collage-layout">Collage Layout</option>
                <option value="lined-journal">Lined Journal</option>
                <option value="gridded-page">Gridded Page</option>
                <option value="ephemera-sheets">Ephemera Sheets</option>
              </select>
            </div>

            {/* Texture Intensity */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-2">Texture Intensity</label>
              <div className="flex gap-2">
                {(['light', 'medium', 'heavy'] as TextureIntensity[]).map(intensity => (
                  <button
                    key={intensity}
                    onClick={() => setSettings({ ...settings, textureIntensity: intensity })}
                    className={`flex-1 px-3 py-2 rounded border capitalize transition-colors ${
                      settings.textureIntensity === intensity
                        ? 'bg-gothic-gold/30 border-gothic-gold text-gothic-gold'
                        : 'bg-gothic-charcoal border-gothic-gold/30 text-gothic-parchment hover:border-gothic-gold'
                    }`}
                  >
                    {intensity}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Elements */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-3">Optional Elements</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeFrames}
                    onChange={(e) => setSettings({ ...settings, includeFrames: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gothic-parchment">Frames</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeBorders}
                    onChange={(e) => setSettings({ ...settings, includeBorders: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gothic-parchment">Gothic Borders</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeWatermarks}
                    onChange={(e) => setSettings({ ...settings, includeWatermarks: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gothic-parchment">Watermarks</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeIllustrations}
                    onChange={(e) => setSettings({ ...settings, includeIllustrations: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gothic-parchment">Illustrations</span>
                </label>
              </div>
            </div>

            {/* Illustration Types */}
            {settings.includeIllustrations && (
              <div className="mb-6">
                <label className="block text-gothic-parchment mb-2">Illustration Types</label>
                <div className="flex flex-wrap gap-2">
                  {illustrationOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => {
                        const newTypes = settings.illustrationTypes.includes(option)
                          ? settings.illustrationTypes.filter(t => t !== option)
                          : [...settings.illustrationTypes, option];
                        setSettings({ ...settings, illustrationTypes: newTypes });
                      }}
                      className={`px-2 py-1 rounded text-xs border capitalize transition-colors ${
                        settings.illustrationTypes.includes(option)
                          ? 'bg-gothic-gold/30 border-gothic-gold text-gothic-gold'
                          : 'bg-gothic-charcoal border-gothic-gold/30 text-gothic-parchment hover:border-gothic-gold'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Midjourney Mode */}
            <div className="mb-6">
              <label className="block text-gothic-parchment mb-2">Midjourney Mode</label>
              <div className="flex gap-2">
                {(['fast', 'relaxed'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSettings({ ...settings, midjourneyMode: mode })}
                    className={`flex-1 px-3 py-2 rounded border capitalize transition-colors ${
                      settings.midjourneyMode === mode
                        ? 'bg-gothic-gold/30 border-gothic-gold text-gothic-gold'
                        : 'bg-gothic-charcoal border-gothic-gold/30 text-gothic-parchment hover:border-gothic-gold'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gothic-parchment/60 mt-2">
                {settings.midjourneyMode === 'fast' 
                  ? 'Fast: Quicker generation, uses Fast Time credits'
                  : 'Relaxed: Slower generation, uses Relaxed Time credits (often cheaper)'}
              </p>
            </div>

            {/* Generate Button */}
            <SynestheticButton
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gothic-button gothic-button-primary w-full biomorphic-glow"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="inline-block mr-2 animate-spin" size={20} />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="inline-block mr-2" size={20} />
                  Generate Pages
                </>
              )}
            </SynestheticButton>

            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-300 text-sm">
                {error}
              </div>
            )}
            </motion.div>
          </aside>

          {/* Preview Area */}
          <div className="flex-1 min-w-0">
            <div className="gothic-card h-fit">
              <h2 className="text-2xl font-display font-semibold text-gothic-gold mb-4">
                Preview
              </h2>
              
              {selectedTheme && (
                <div className="mb-6">
                  <div
                    className="h-32 rounded-lg mb-4"
                    style={{ backgroundColor: selectedTheme.previewColor }}
                  />
                  <h3 className="text-xl font-display text-gothic-gold mb-2">
                    {selectedTheme.name}
                  </h3>
                  <p className="text-gothic-parchment/80 mb-4">
                    {selectedTheme.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTheme.motifs.slice(0, 6).map(motif => (
                      <span
                        key={motif}
                        className="text-xs px-2 py-1 bg-gothic-gold/10 border border-gothic-gold/20 rounded text-gothic-gold"
                      >
                        {motif}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {generatedPages.length > 0 && (
                <div className="mt-6">
                  <p className="text-gothic-parchment mb-4">
                    Generated {generatedPages.length} pages. Redirecting to preview...
                  </p>
                </div>
              )}

              {!isGenerating && generatedPages.length === 0 && (
                <div className="text-center py-12 text-gothic-parchment/60">
                  <Sparkles className="mx-auto mb-4" size={48} />
                  <p>Configure your settings and click "Generate Pages" to begin</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gothic-gold mx-auto mb-4"></div>
          <p className="text-gothic-parchment">Loading...</p>
        </div>
      </div>
    }>
      <GeneratePageContent />
    </Suspense>
  );
}

