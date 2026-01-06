'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, BookOpen, Download, Grid3x3, Loader2, Folder, FileDown } from 'lucide-react';
import { BiomorphicShape } from '@/components/BiomorphicShape';
import { SynestheticButton } from '@/components/SynestheticButton';
import { OrganicNav } from '@/components/OrganicNav';
import { getGoogleDriveConfig } from '../../../services/env';

export default function Home() {
  const [googleDriveAccount, setGoogleDriveAccount] = useState<1 | 2>(1);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [images, setImages] = useState<Array<{ id: string; name: string; url: string; thumbnailUrl: string }>>([]);
  const [gridPages, setGridPages] = useState<string[]>([]);
  const [numGridPages, setNumGridPages] = useState<number>(1);
  const [isGeneratingGrids, setIsGeneratingGrids] = useState(false);
  const [uploadingGridsToDrive, setUploadingGridsToDrive] = useState(false);
  const [gridUploadResult, setGridUploadResult] = useState<{ folderUrl?: string; uploaded?: number; failed?: number } | null>(null);

  // Helper function to shuffle array (Fisher-Yates algorithm)
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const loadFolders = async () => {
    setLoadingFolders(true);
    try {
      const config = getGoogleDriveConfig(googleDriveAccount);
      // For account 2, we'd need to check env.ts for accountNumber support
      // For now, using account 1
      const response = await fetch('/api/google-drive/list-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: config.refreshToken,
          parentFolderId: config.parentFolderId,
          accountNumber: googleDriveAccount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load folders');
      }

      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error: any) {
      console.error('Error loading folders:', error);
      alert(`Failed to load folders: ${error.message}`);
    } finally {
      setLoadingFolders(false);
    }
  };

  const loadImages = async () => {
    if (!selectedFolderId) {
      alert('Please select a folder first');
      return;
    }

    setLoadingImages(true);
    setImages([]);
    try {
      const config = getGoogleDriveConfig(googleDriveAccount);
      const response = await fetch('/api/google-drive/list-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: selectedFolderId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: config.refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load images');
      }

      const data = await response.json();
      setImages(data.images || []);
    } catch (error: any) {
      console.error('Error loading images:', error);
      alert(`Failed to load images: ${error.message}`);
    } finally {
      setLoadingImages(false);
    }
  };

  const generateGrids = async () => {
    if (images.length === 0) {
      alert('No images available. Please load images from a folder first.');
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
      const availableImages = images.length;

      if (availableImages < imagesPerGrid) {
        alert(`You need at least ${imagesPerGrid} images to create a grid. You have ${availableImages}.`);
        setIsGeneratingGrids(false);
        return;
      }

      // Shuffle images randomly
      const shuffledImages = shuffleArray(images);
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
        const padding = 20;
        const totalPaddingWidth = padding * (cols + 1);
        const totalPaddingHeight = padding * (rows + 1);
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
            
            if (imageIndex >= availableImages) {
              break;
            }

            const imageUrl = shuffledImages[imageIndex].url;
            const x = padding + col * (cellWidth + padding);
            const y = padding + row * (cellHeight + padding);

            await new Promise<void>((resolve) => {
              const img = new window.Image();
              img.crossOrigin = 'anonymous';
              
              img.onload = () => {
                try {
                  const imgAspect = img.width / img.height;
                  const cellAspect = cellWidth / cellHeight;
                  
                  let drawWidth = cellWidth;
                  let drawHeight = cellHeight;
                  let drawX = x;
                  let drawY = y;
                  
                  if (imgAspect > cellAspect) {
                    drawWidth = cellHeight * imgAspect;
                    drawX = x - (drawWidth - cellWidth) / 2;
                  } else {
                    drawHeight = cellWidth / imgAspect;
                    drawY = y - (drawHeight - cellHeight) / 2;
                  }
                  
                  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                  resolve();
                } catch (err) {
                  console.error('Error drawing image:', err);
                  resolve();
                }
              };
              
              img.onerror = () => {
                console.error('Failed to load image:', imageUrl);
                resolve();
              };
              
              img.src = imageUrl;
            });
          }
        }

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
      alert(`Successfully generated ${generatedGrids.length} grid page(s)!`);
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

  const uploadGridsToGoogleDrive = async () => {
    if (gridPages.length === 0) {
      alert('No grids to upload');
      return;
    }

    setUploadingGridsToDrive(true);
    setGridUploadResult(null);

    try {
      const config = getGoogleDriveConfig(googleDriveAccount);
      const folderName = `Grid Pages ${new Date().toISOString().split('T')[0]}`;

      // Convert blob URLs to base64
      const gridPagesBase64 = await Promise.all(
        gridPages.map(async (gridUrl) => {
          const response = await fetch(gridUrl);
          const blob = await response.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        })
      );

      const response = await fetch('/api/google-drive/upload-grids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName,
          gridPages: gridPagesBase64,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: config.refreshToken,
          accountNumber: googleDriveAccount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload grids');
      }

      const data = await response.json();
      setGridUploadResult({
        folderUrl: data.folderUrl,
        uploaded: data.uploaded,
        failed: data.failed,
      });

      alert(`Successfully uploaded ${data.uploaded} grid(s) to Google Drive!${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
    } catch (error: any) {
      console.error('Error uploading grids:', error);
      alert(`Failed to upload grids: ${error.message}`);
    } finally {
      setUploadingGridsToDrive(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gothic-gold/20 bg-gothic-charcoal/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-display font-bold text-gothic-gold">
              Gothic Junk Journal Generator
            </h1>
            <OrganicNav />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-5xl font-display font-bold text-gothic-gold mb-4">
            Create Stunning Gothic Journal Pages
          </h2>
          <p className="text-xl text-gothic-parchment/80 max-w-2xl mx-auto mb-8">
            Generate cohesive, stylized junk journal page collections in gothic, vintage, and dark aesthetics.
            Perfect for Etsy sellers creating digital printable ephemera packs.
          </p>
          <Link href="/generate">
            <SynestheticButton className="gothic-button gothic-button-primary text-lg px-8 py-4 biomorphic-glow">
              <Sparkles className="inline-block mr-2" size={20} />
              Start Generating
            </SynestheticButton>
          </Link>
        </motion.div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <BookOpen className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                8 Unique Themes
              </h3>
              <p className="text-gothic-parchment/80">
                From Gothic Victorian to Steampunk Vintage, choose from carefully crafted themes
              </p>
            </BiomorphicShape>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <Sparkles className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                AI-Powered Generation
              </h3>
              <p className="text-gothic-parchment/80">
                Powered by Midjourney for high-quality, print-ready journal pages
              </p>
            </BiomorphicShape>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="spatial-depth"
          >
            <BiomorphicShape className="gothic-card text-center h-full">
              <Download className="mx-auto mb-4 text-gothic-gold" size={48} />
              <h3 className="text-2xl font-display font-semibold text-gothic-gold mb-2">
                Multiple Export Formats
              </h3>
              <p className="text-gothic-parchment/80">
                Download as PNG, JPEG, or PDF bundle at 300 DPI print quality
              </p>
            </BiomorphicShape>
          </motion.div>
        </div>

        {/* Quick Start */}
        <div className="mt-16 text-center">
          <Link href="/themes">
            <button className="gothic-button px-8 py-3">
              Browse Themes
            </button>
          </Link>
        </div>

        {/* Google Drive Grid Generator */}
        <div className="mt-16 gothic-card">
          <div className="mb-6">
            <h2 className="text-3xl font-display font-bold text-gothic-gold mb-2">
              Google Drive Grid Generator
            </h2>
            <p className="text-gothic-parchment/80">
              Create grid layouts from images stored in your Google Drive folders
            </p>
          </div>

          <div className="space-y-4">
            {/* Account Selection */}
            <div>
              <label className="block text-gothic-parchment mb-2">Google Drive Account</label>
              <select
                value={googleDriveAccount}
                onChange={(e) => setGoogleDriveAccount(Number(e.target.value) as 1 | 2)}
                className="gothic-input"
              >
                <option value="1">Google Drive Account 1</option>
                <option value="2">Google Drive Account 2</option>
              </select>
            </div>

            {/* Load Folders */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <button
                  onClick={loadFolders}
                  disabled={loadingFolders}
                  className="gothic-button gothic-button-primary w-full"
                >
                  {loadingFolders ? (
                    <>
                      <Loader2 className="inline-block mr-2 animate-spin" size={20} />
                      Loading Folders...
                    </>
                  ) : (
                    <>
                      <Folder className="inline-block mr-2" size={20} />
                      Load Folders
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Folder Selection */}
            {folders.length > 0 && (
              <div>
                <label className="block text-gothic-parchment mb-2">Select Folder</label>
                <select
                  value={selectedFolderId}
                  onChange={(e) => {
                    const folder = folders.find(f => f.id === e.target.value);
                    setSelectedFolderId(e.target.value);
                    setSelectedFolderName(folder?.name || '');
                    setImages([]);
                    setGridPages([]);
                  }}
                  className="gothic-input w-full"
                >
                  <option value="">-- Select a folder --</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Load Images */}
            {selectedFolderId && (
              <div>
                <button
                  onClick={loadImages}
                  disabled={loadingImages}
                  className="gothic-button gothic-button-primary w-full"
                >
                  {loadingImages ? (
                    <>
                      <Loader2 className="inline-block mr-2 animate-spin" size={20} />
                      Loading Images...
                    </>
                  ) : (
                    <>
                      <Download className="inline-block mr-2" size={20} />
                      Load Images from Folder
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Images Count */}
            {images.length > 0 && (
              <div className="p-4 bg-gothic-gold/10 border border-gothic-gold/30 rounded">
                <p className="text-gothic-gold">
                  ✓ Loaded {images.length} image(s) from "{selectedFolderName}"
                </p>
              </div>
            )}

            {/* Grid Generation */}
            {images.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-gothic-gold/20">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-gothic-parchment mb-2">
                      Number of Grid Pages
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={Math.ceil(images.length / 12)}
                      value={numGridPages}
                      onChange={(e) => setNumGridPages(Math.max(1, parseInt(e.target.value) || 1))}
                      className="gothic-input w-full"
                      placeholder="1"
                    />
                    <p className="text-xs text-gothic-parchment/60 mt-1">
                      Maximum: {Math.ceil(images.length / 12)} pages (based on {images.length} available images)
                    </p>
                  </div>
                  <button
                    onClick={generateGrids}
                    disabled={isGeneratingGrids || images.length < 12}
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

                {images.length < 12 && (
                  <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-yellow-300 text-sm">
                    ⚠️ You need at least 12 images to create a grid. You currently have {images.length} images.
                  </div>
                )}

                {gridPages.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                      <h3 className="text-xl font-display font-semibold text-gothic-gold">
                        Generated Grids ({gridPages.length})
                      </h3>
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={uploadGridsToGoogleDrive}
                          disabled={uploadingGridsToDrive || gridPages.length === 0}
                          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                        >
                          {uploadingGridsToDrive ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload size={16} />
                              Upload to Google Drive
                            </>
                          )}
                        </button>
                        <button
                          onClick={downloadAllGrids}
                          className="gothic-button gothic-button-primary"
                        >
                          <Download className="inline-block mr-2" size={16} />
                          Download All Grids
                        </button>
                      </div>
                    </div>
                    {gridUploadResult && (
                      <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded">
                        <p className="text-emerald-300 text-sm">
                          ✓ Uploaded {gridUploadResult.uploaded} grid(s) to Google Drive
                          {gridUploadResult.failed && gridUploadResult.failed > 0 && ` (${gridUploadResult.failed} failed)`}
                        </p>
                        {gridUploadResult.folderUrl && (
                          <a
                            href={gridUploadResult.folderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:underline text-sm mt-1 block"
                          >
                            Open Folder →
                          </a>
                        )}
                      </div>
                    )}
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
                            <img
                              src={gridUrl}
                              alt={`Grid page ${index + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gothic-gold/20 mt-auto py-8">
        <div className="container mx-auto px-4 text-center text-gothic-parchment/60">
          <p>Gothic Junk Journal Page Generator © 2024</p>
        </div>
      </footer>
    </div>
  );
}

