'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, FileDown, Image as ImageIcon, FileText, Upload, Copy, Check, Grid3x3, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

function PreviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get('jobId');

  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'pdf'>('png');
  const [wordpressUrls, setWordpressUrls] = useState<Array<{ originalUrl: string; wordpressUrl: string | null; error?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [gridPages, setGridPages] = useState<string[]>([]);
  const [numGridPages, setNumGridPages] = useState<number>(1);
  const [isGeneratingGrids, setIsGeneratingGrids] = useState(false);

  useEffect(() => {
    if (!jobId) {
      router.push('/generate');
      return;
    }

    // Try to get pages from localStorage first (in case of hot reload)
    const cachedPages = localStorage.getItem(`job_${jobId}`);
    if (cachedPages) {
      try {
        const parsed = JSON.parse(cachedPages);
        const cachedPagesList = parsed.pages || [];
        if (cachedPagesList.length > 0) {
          console.log('Loading pages from localStorage:', cachedPagesList.length);
          setPages(cachedPagesList);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error('Error parsing cached pages:', e);
        // If parsing fails, continue to fetch
      }
    }
    
    console.log('Fetching pages from API for jobId:', jobId);

    fetch(`/api/generate?jobId=${jobId}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Job not found. The generation may have expired or the server was restarted.');
        }
        return res.json();
      })
      .then(data => {
        const pagesList = data.pages || [];
        setPages(pagesList);
        // Cache in localStorage as backup
        if (pagesList.length > 0) {
          localStorage.setItem(`job_${jobId}`, JSON.stringify({ pages: pagesList }));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching pages:', err);
        setLoading(false);
        // Show error message to user
        alert('Unable to load generated pages. The job may have expired. Please generate new pages.');
      });
  }, [jobId, router]);

  const downloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `gothic-journal-page-${index + 1}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < pages.length; i++) {
      await downloadImage(pages[i], i);
      // Small delay to avoid overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const downloadPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [1200, 1600],
      });

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = pages[i];
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            try {
              pdf.addImage(img, 'PNG', 0, 0, 1200, 1600);
              resolve(null);
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => {
            reject(new Error('Failed to load image'));
          };
        });
      }

      pdf.save(`gothic-journal-pages-${jobId}.pdf`);
    } catch (error) {
      console.error('Error creating PDF:', error);
      alert('Failed to create PDF. Please try downloading individual images.');
    }
  };

  const uploadToWordPress = async () => {
    if (pages.length === 0) {
      alert('No images to upload');
      return;
    }

    setUploading(true);
    setWordpressUrls([]);

    try {
      const response = await fetch('/api/wordpress/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrls: pages }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload images');
      }

      setWordpressUrls(data.results || []);
      
      const successCount = data.uploaded || 0;
      const failCount = data.failed || 0;
      
      if (successCount > 0) {
        alert(`Successfully uploaded ${successCount} image(s) to WordPress${failCount > 0 ? ` (${failCount} failed)` : ''}`);
      } else {
        alert('Failed to upload images. Please check your WordPress credentials.');
      }
    } catch (error) {
      console.error('Error uploading to WordPress:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload images to WordPress');
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const copyAllUrls = async () => {
    const urls = wordpressUrls
      .filter(r => r.wordpressUrl)
      .map(r => r.wordpressUrl)
      .join('\n');
    
    if (urls) {
      await copyToClipboard(urls, -1);
      alert('All WordPress URLs copied to clipboard!');
    }
  };

  // Helper function to shuffle array (Fisher-Yates algorithm)
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const generateGrids = async () => {
    if (pages.length === 0) {
      alert('No images available to create grids');
      return;
    }

    if (numGridPages < 1) {
      alert('Please enter a valid number of grid pages (at least 1)');
      return;
    }

    setIsGeneratingGrids(true);
    setGridPages([]);

    try {
      const imagesPerGrid = 12; // 3 rows x 4 columns
      const totalImagesNeeded = numGridPages * imagesPerGrid;
      const availableImages = pages.length;

      if (availableImages < imagesPerGrid) {
        alert(`You need at least ${imagesPerGrid} images to create a grid. You have ${availableImages}.`);
        setIsGeneratingGrids(false);
        return;
      }

      // Shuffle images randomly
      const shuffledPages = shuffleArray(pages);
      const generatedGrids: string[] = [];

      // Create each grid page
      for (let gridIndex = 0; gridIndex < numGridPages; gridIndex++) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        // Grid dimensions: 3 rows x 4 columns, 3000x3000 pixels
        const rows = 3;
        const cols = 4;
        const padding = 20; // Padding between cells
        const totalPaddingWidth = padding * (cols + 1); // Padding on both sides + between columns
        const totalPaddingHeight = padding * (rows + 1); // Padding on both sides + between rows
        const cellWidth = (3000 - totalPaddingWidth) / cols;
        const cellHeight = (3000 - totalPaddingHeight) / rows;

        canvas.width = 3000;
        canvas.height = 3000;

        // Fill background with white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw images in grid
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const imageIndex = gridIndex * imagesPerGrid + row * cols + col;
            
            // If we run out of images, stop
            if (imageIndex >= availableImages) {
              break;
            }

            const imageUrl = shuffledPages[imageIndex];
            const x = padding + col * (cellWidth + padding);
            const y = padding + row * (cellHeight + padding);

            // Load and draw image
            await new Promise<void>((resolve, reject) => {
              const img = new window.Image();
              img.crossOrigin = 'anonymous';
              
              img.onload = () => {
                try {
                  // Calculate aspect ratios
                  const imgAspect = img.width / img.height;
                  const cellAspect = cellWidth / cellHeight;
                  
                  let drawWidth = cellWidth;
                  let drawHeight = cellHeight;
                  let drawX = x;
                  let drawY = y;
                  
                  // Fit image to cell while maintaining aspect ratio (cover mode)
                  if (imgAspect > cellAspect) {
                    // Image is wider - fit to height
                    drawWidth = cellHeight * imgAspect;
                    drawX = x - (drawWidth - cellWidth) / 2;
                  } else {
                    // Image is taller - fit to width
                    drawHeight = cellWidth / imgAspect;
                    drawY = y - (drawHeight - cellHeight) / 2;
                  }
                  
                  // Draw image to fill cell (cover mode)
                  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                  resolve();
                } catch (err) {
                  console.error('Error drawing image:', err);
                  resolve(); // Continue even if one image fails
                }
              };
              
              img.onerror = () => {
                console.error('Failed to load image:', imageUrl);
                resolve(); // Continue even if one image fails
              };
              
              img.src = imageUrl;
            });
          }
        }

        // Convert canvas to blob URL
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, 'image/png');
        });

        const gridUrl = URL.createObjectURL(blob);
        generatedGrids.push(gridUrl);
      }

      setGridPages(generatedGrids);
    } catch (error) {
      console.error('Error generating grids:', error);
      alert('Failed to generate grids. Please try again.');
    } finally {
      setIsGeneratingGrids(false);
    }
  };

  const downloadGrid = (gridUrl: string, index: number) => {
    const a = document.createElement('a');
    a.href = gridUrl;
    a.download = `grid-page-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllGrids = async () => {
    for (let i = 0; i < gridPages.length; i++) {
      downloadGrid(gridPages[i], i);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gothic-gold mx-auto mb-4"></div>
          <p className="text-gothic-parchment">Loading pages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gothic-gold/20 bg-gothic-charcoal/50 backdrop-blur-sm sticky top-0 z-50">
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

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-display font-bold text-gothic-gold mb-2">
              Preview Pages
            </h1>
            <p className="text-gothic-parchment/80">
              {pages.length} pages generated
            </p>
          </div>

          <div className="flex gap-4 items-center flex-wrap">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'png' | 'jpeg' | 'pdf')}
              className="gothic-input"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF Bundle</option>
            </select>

            {exportFormat === 'pdf' ? (
              <button onClick={downloadPDF} className="gothic-button gothic-button-primary">
                <FileText className="inline-block mr-2" size={20} />
                Download PDF
              </button>
            ) : (
              <button onClick={downloadAll} className="gothic-button gothic-button-primary">
                <Download className="inline-block mr-2" size={20} />
                Download All
              </button>
            )}

            <button 
              onClick={uploadToWordPress} 
              disabled={uploading || pages.length === 0}
              className="gothic-button bg-gothic-gold/20 border-gothic-gold text-gothic-gold hover:bg-gothic-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="inline-block mr-2" size={20} />
              {uploading ? 'Uploading...' : 'Upload to WordPress'}
            </button>
          </div>
        </div>

        {/* Masonry Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {pages.map((url, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="gothic-card p-0 overflow-hidden group cursor-pointer"
              onClick={() => setSelectedImage(url)}
            >
              <div className="relative aspect-[3/4] bg-gothic-charcoal">
                <Image
                  src={url}
                  alt={`Journal page ${index + 1}`}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(url, index);
                      }}
                      className="gothic-button gothic-button-primary"
                    >
                      <FileDown size={16} className="mr-2" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-3 text-center">
                <p className="text-sm text-gothic-parchment/60">Page {index + 1}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {pages.length === 0 && (
          <div className="text-center py-12 text-gothic-parchment/60">
            <ImageIcon className="mx-auto mb-4" size={48} />
            <p>No pages to display</p>
            <Link href="/generate" className="text-gothic-gold hover:underline mt-4 inline-block">
              Generate new pages
            </Link>
          </div>
        )}

        {/* Grid Generator Tool */}
        {pages.length > 0 && (
          <div className="mt-8 gothic-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                  Grid Generator
                </h2>
                <p className="text-gothic-parchment/60 text-sm">
                  Create grid layouts (3 rows × 4 columns = 12 images per grid)
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-end mb-6">
              <div className="flex-1">
                <label className="block text-gothic-parchment mb-2">
                  Number of Grid Pages
                </label>
                <input
                  type="number"
                  min="1"
                  max={Math.ceil(pages.length / 12)}
                  value={numGridPages}
                  onChange={(e) => setNumGridPages(Math.max(1, parseInt(e.target.value) || 1))}
                  className="gothic-input w-full"
                  placeholder="1"
                />
                <p className="text-xs text-gothic-parchment/60 mt-1">
                  Maximum: {Math.ceil(pages.length / 12)} pages (based on {pages.length} available images)
                </p>
              </div>
              <button
                onClick={generateGrids}
                disabled={isGeneratingGrids || pages.length < 12}
                className="gothic-button gothic-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingGrids ? (
                  <>
                    <Loader2 className="inline-block mr-2 animate-spin" size={20} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Grid3x3 className="inline-block mr-2" size={20} />
                    Generate Grids
                  </>
                )}
              </button>
            </div>

            {pages.length < 12 && (
              <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-yellow-300 text-sm">
                ⚠️ You need at least 12 images to create a grid. You currently have {pages.length} images.
              </div>
            )}

            {gridPages.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-display font-semibold text-gothic-gold">
                    Generated Grids ({gridPages.length})
                  </h3>
                  <button
                    onClick={downloadAllGrids}
                    className="gothic-button gothic-button-primary"
                  >
                    <Download className="inline-block mr-2" size={16} />
                    Download All Grids
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {gridPages.map((gridUrl, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="gothic-card p-0 overflow-hidden group"
                    >
                      <div className="relative aspect-square bg-gothic-charcoal">
                        <Image
                          src={gridUrl}
                          alt={`Grid page ${index + 1}`}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => downloadGrid(gridUrl, index)}
                              className="gothic-button gothic-button-primary"
                            >
                              <FileDown size={16} className="mr-2" />
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-sm text-gothic-parchment/60">Grid Page {index + 1}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* WordPress URLs Section */}
        {wordpressUrls.length > 0 && (
          <div className="mt-8 gothic-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-display font-semibold text-gothic-gold">
                WordPress URLs
              </h2>
              <button
                onClick={copyAllUrls}
                className="gothic-button gothic-button-primary text-sm"
              >
                {copiedIndex === -1 ? (
                  <>
                    <Check className="inline-block mr-2" size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="inline-block mr-2" size={16} />
                    Copy All URLs
                  </>
                )}
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {wordpressUrls.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    result.wordpressUrl
                      ? 'bg-gothic-gold/10 border-gothic-gold/30'
                      : 'bg-red-900/20 border-red-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gothic-parchment/60 mb-1">
                        Page {index + 1}
                      </div>
                      {result.wordpressUrl ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={result.wordpressUrl}
                            className="flex-1 gothic-input bg-gothic-charcoal/50 text-gothic-parchment text-sm"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => copyToClipboard(result.wordpressUrl!, index)}
                            className="gothic-button p-2"
                            title="Copy URL"
                          >
                            {copiedIndex === index ? (
                              <Check size={16} className="text-green-400" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="text-red-400 text-sm">
                          ❌ Upload failed: {result.error || 'Unknown error'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gothic-parchment/60">
              💡 Tip: Copy all URLs and paste them into your Google Sheet!
            </div>
          </div>
        )}
      </main>

      {/* Full Screen Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-7xl max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 z-10 bg-gothic-charcoal border border-gothic-gold text-gothic-gold p-2 rounded-lg hover:bg-gothic-gold/20 transition-colors"
              >
                <X size={24} />
              </button>
              <Image
                src={selectedImage}
                alt="Full size preview"
                width={1200}
                height={1600}
                className="max-w-full max-h-[90vh] object-contain"
                unoptimized
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gothic-gold mx-auto mb-4"></div>
          <p className="text-gothic-parchment">Loading...</p>
        </div>
      </div>
    }>
      <PreviewPageContent />
    </Suspense>
  );
}

