'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, FileDown, Image as ImageIcon, FileText, Upload, Copy, Check, Cloud } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { uploadImagesToGoogleDrive, GoogleDriveUploadResult } from '@/services/googleDriveService';

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
  const [googleDriveAccount, setGoogleDriveAccount] = useState<1 | 2>(1);
  const [uploadingToGoogleDrive, setUploadingToGoogleDrive] = useState(false);
  const [googleDriveResult, setGoogleDriveResult] = useState<GoogleDriveUploadResult | null>(null);
  const [googleDriveProgress, setGoogleDriveProgress] = useState({ completed: 0, total: 0 });

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

  const uploadToGoogleDrive = async () => {
    if (pages.length === 0) {
      alert('No images to upload');
      return;
    }

    const folderName = prompt(`Enter a name for the Google Drive folder (Account ${googleDriveAccount}):`);
    if (!folderName || !folderName.trim()) {
      return;
    }

    setUploadingToGoogleDrive(true);
    setGoogleDriveResult(null);
    setGoogleDriveProgress({ completed: 0, total: pages.length });

    try {
      const images = pages.map(url => ({ url, originalUrl: url }));
      
      const result = await uploadImagesToGoogleDrive(
        folderName.trim(),
        images,
        (completed, total) => {
          setGoogleDriveProgress({ completed, total });
        },
        googleDriveAccount
      );

      setGoogleDriveResult(result);
      alert(`Successfully uploaded ${result.uploadedFiles.length} image(s) to Google Drive Account ${googleDriveAccount}${result.failed > 0 ? ` (${result.failed} failed)` : ''}`);
    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload images to Google Drive';
      alert(`Error: ${errorMessage}`);
    } finally {
      setUploadingToGoogleDrive(false);
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

            <div className="flex gap-2 items-center">
              <select
                value={googleDriveAccount}
                onChange={(e) => setGoogleDriveAccount(Number(e.target.value) as 1 | 2)}
                className="gothic-input"
                disabled={uploadingToGoogleDrive}
              >
                <option value="1">Google Drive Account 1</option>
                <option value="2">Google Drive Account 2</option>
              </select>
              <button 
                onClick={uploadToGoogleDrive} 
                disabled={uploadingToGoogleDrive || pages.length === 0}
                className="gothic-button bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Cloud className="inline-block mr-2" size={20} />
                {uploadingToGoogleDrive ? `Uploading... (${googleDriveProgress.completed}/${googleDriveProgress.total})` : 'Upload to Google Drive'}
              </button>
            </div>
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

        {/* Google Drive Upload Results */}
        {googleDriveResult && (
          <div className="mt-8 gothic-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-display font-semibold text-gothic-gold">
                Google Drive Upload Results (Account {googleDriveAccount})
              </h2>
              <button
                onClick={() => {
                  const urls = googleDriveResult.uploadedFiles.map(f => f.url).join('\n');
                  if (urls) {
                    navigator.clipboard.writeText(urls);
                    alert('All Google Drive URLs copied to clipboard!');
                  }
                }}
                className="gothic-button gothic-button-primary text-sm"
              >
                <Copy className="inline-block mr-2" size={16} />
                Copy All URLs
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud className="text-blue-400" size={20} />
                  <span className="text-gothic-gold font-semibold">Folder Created</span>
                </div>
                <a
                  href={googleDriveResult.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all"
                >
                  {googleDriveResult.folderUrl}
                </a>
                <div className="mt-2 text-sm text-gothic-parchment/80">
                  ✅ {googleDriveResult.uploadedFiles.length} images uploaded successfully
                  {googleDriveResult.failed > 0 && (
                    <span className="text-red-400 ml-2">⚠️ {googleDriveResult.failed} failed</span>
                  )}
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {googleDriveResult.uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-gothic-gold/10 border border-gothic-gold/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gothic-parchment/60 mb-1">
                          {file.filename}
                        </div>
                        <input
                          type="text"
                          readOnly
                          value={file.url}
                          className="w-full gothic-input bg-gothic-charcoal/50 text-gothic-parchment text-sm"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(file.url);
                          alert('URL copied to clipboard!');
                        }}
                        className="gothic-button p-2"
                        title="Copy URL"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

