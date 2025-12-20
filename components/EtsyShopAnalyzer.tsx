import React, { useState } from 'react';
import { ShoppingBag, Loader2, X, TrendingUp, Eye, Heart, Package, Calendar, DollarSign, Download, FileText, Upload, Check, Copy } from 'lucide-react';
import { uploadImageToWordPress } from '../services/imageHostingService';

interface EtsyShopAnalyzerProps {
  onClose?: () => void;
}

interface Listing {
  listing_id: number;
  title: string;
  views: number;
  favorites: number;
  stock: number;
  age_days: number | null;
  last_modified: string | null;
  is_digital: boolean;
  tags: string[];
  price?: number;
  currency_code?: string;
}

interface ShopInfo {
  shop_name: string;
  shop_id: number;
  shop_age_days: number | null;
  total_listings: number;
  total_favorers: number;
  total_sales: number;
  shop_url: string;
}

interface AnalysisResult {
  shop_info: ShopInfo;
  listings: Listing[];
}

const EtsyShopAnalyzer: React.FC<EtsyShopAnalyzerProps> = ({ onClose }) => {
  const [shopUrl, setShopUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingImages, setIsFetchingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [uploadedImages, setUploadedImages] = useState<Map<number, string>>(new Map());

  const handleAnalyze = async () => {
    if (!shopUrl.trim()) {
      setError('Please enter an Etsy shop URL');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/etsy/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopUrl: shopUrl.trim(),
          apiKey: apiKey.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze shop');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while analyzing the shop');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportCSV = () => {
    if (!result) return;

    const headers = ['Listing ID', 'Title', 'Views', 'Favorites', 'Stock', 'Age (Days)', 'Price', 'Currency', 'Is Digital', 'Tags'];
    const rows = result.listings.map(listing => [
      listing.listing_id,
      listing.title,
      listing.views,
      listing.favorites,
      listing.stock,
      listing.age_days || '',
      listing.price || '',
      listing.currency_code || '',
      listing.is_digital ? 'Yes' : 'No',
      listing.tags.join(', '),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${result.shop_info.shop_name}_analysis_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!result) return;

    const jsonContent = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${result.shop_info.shop_name}_analysis_${Date.now()}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFetchAndUploadImages = async () => {
    if (!result || result.listings.length === 0) {
      setError('No listings to process');
      return;
    }

    setIsFetchingImages(true);
    setError(null);
    setUploadProgress({ completed: 0, total: result.listings.length });
    const newUploadedImages = new Map<number, string>();

    try {
      // Step 1: Fetch image URLs from Etsy API
      const listingIds = result.listings.map(l => l.listing_id);
      
      const fetchResponse = await fetch('/api/etsy/fetch-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingIds,
          apiKey: apiKey.trim() || undefined,
        }),
      });

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json();
        throw new Error(errorData.error || 'Failed to fetch images');
      }

      const fetchData = await fetchResponse.json();
      const successfulFetches = fetchData.results.filter((r: any) => r.success);

      if (successfulFetches.length === 0) {
        throw new Error('No images were successfully fetched');
      }

      // Step 2: Download each image, convert to base64, and upload to WordPress
      for (let i = 0; i < successfulFetches.length; i++) {
        const fetchResult = successfulFetches[i];
        
        try {
          // Download the image
          const imageResponse = await fetch(fetchResult.image_url);
          if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.statusText}`);
          }

          // Convert to base64
          const imageBlob = await imageResponse.blob();
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64String = reader.result as string;
              resolve(base64String);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(imageBlob);
          const base64Image = await base64Promise;

          // Upload to WordPress
          const wordpressUrl = await uploadImageToWordPress(base64Image);
          newUploadedImages.set(fetchResult.listing_id, wordpressUrl);

          setUploadProgress({ completed: i + 1, total: successfulFetches.length });
          
          // Small delay to avoid overwhelming WordPress
          if (i < successfulFetches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (error: any) {
          console.error(`Failed to upload image for listing ${fetchResult.listing_id}:`, error);
          // Continue with next image even if one fails
        }
      }

      setUploadedImages(newUploadedImages);
      
      if (newUploadedImages.size > 0) {
        // Copy all WordPress URLs to clipboard
        const urls = Array.from(newUploadedImages.values()).join('\n');
        await navigator.clipboard.writeText(urls);
        alert(`Successfully uploaded ${newUploadedImages.size} image(s) to WordPress! URLs copied to clipboard.`);
      }

    } catch (err: any) {
      setError(err.message || 'Failed to fetch and upload images');
    } finally {
      setIsFetchingImages(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-purple-500/30 overflow-hidden max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-amber-900/30 px-6 py-4 border-b border-purple-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Etsy Shop Analyzer</h2>
              <p className="text-sm text-slate-400">Analyze shop performance and listings</p>
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
        {/* Input Section */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Etsy Shop URL
            </label>
            <input
              type="text"
              value={shopUrl}
              onChange={(e) => setShopUrl(e.target.value)}
              placeholder="https://www.etsy.com/shop/YourShopName"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              disabled={isAnalyzing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Etsy API Key (Optional - uses environment variable if not provided)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave empty to use server API key"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              disabled={isAnalyzing}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !shopUrl.trim()}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing Shop...
              </>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" />
                Analyze Shop
              </>
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Shop Info Card */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-purple-400" />
                {result.shop_info.shop_name}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Package className="w-4 h-4" />
                    <span className="text-xs">Listings</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{result.shop_info.total_listings}</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Heart className="w-4 h-4" />
                    <span className="text-xs">Favorers</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{result.shop_info.total_favorers.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs">Total Sales</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{result.shop_info.total_sales.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Shop Age</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {result.shop_info.shop_age_days ? `${Math.floor(result.shop_info.shop_age_days / 365)}y` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleFetchAndUploadImages}
                disabled={isFetchingImages || result.listings.length === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {isFetchingImages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading ({uploadProgress.completed}/{uploadProgress.total})
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Fetch & Upload Images to WordPress
                  </>
                )}
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Export JSON
              </button>
            </div>

            {/* Listings Table */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Views</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Favorites</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Age</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">WordPress URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {result.listings
                      .sort((a, b) => b.views - a.views)
                      .map((listing) => (
                        <tr key={listing.listing_id} className="hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-white max-w-xs truncate" title={listing.title}>
                            {listing.title}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 flex items-center gap-1">
                            <Eye className="w-4 h-4 text-slate-500" />
                            {listing.views.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 flex items-center gap-1">
                            <Heart className="w-4 h-4 text-slate-500" />
                            {listing.favorites.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{listing.stock}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {listing.age_days ? `${listing.age_days}d` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {listing.is_digital ? (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">Digital</span>
                            ) : (
                              <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs">Physical</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {uploadedImages.has(listing.listing_id) ? (
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-400" />
                                <a
                                  href={uploadedImages.get(listing.listing_id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 underline truncate max-w-xs"
                                  title={uploadedImages.get(listing.listing_id)}
                                >
                                  {uploadedImages.get(listing.listing_id)?.substring(0, 40)}...
                                </a>
                                <button
                                  onClick={() => {
                                    const url = uploadedImages.get(listing.listing_id);
                                    if (url) {
                                      navigator.clipboard.writeText(url);
                                    }
                                  }}
                                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                                  title="Copy URL"
                                >
                                  <Copy className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-xs">Not uploaded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 text-sm text-slate-400 text-center">
                Showing all {result.listings.length} listing{result.listings.length !== 1 ? 's' : ''} sorted by views
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EtsyShopAnalyzer;

