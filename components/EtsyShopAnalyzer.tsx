import React, { useState, useEffect } from 'react';
import { ShoppingBag, Loader2, X, TrendingUp, Eye, Heart, Package, Calendar, DollarSign, Download, FileText, Upload, Check, Copy, BarChart3, Star, Tag, Image as ImageIcon } from 'lucide-react';
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
  image_url?: string | null;
  state?: string;
  when_made?: string;
  who_made?: string;
}

interface ShopInfo {
  shop_name: string;
  shop_id: number;
  shop_age_days: number | null;
  total_listings: number;
  total_favorers: number;
  total_sales: number;
  shop_url: string;
  avg_price?: number;
  currency_code?: string;
  oldest_listing_age_days?: number | null;
  shop_location?: string | null;
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
  const [listingImages, setListingImages] = useState<Map<number, string>>(new Map());
  const [sortColumn, setSortColumn] = useState<string>('views');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleAnalyze = async () => {
    if (!shopUrl.trim()) {
      setError('Please enter an Etsy shop URL');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/etsy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'analyze',
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
      
      // Automatically fetch listing images
      if (data.listings && data.listings.length > 0) {
        fetchListingImages(data.listings.map((l: Listing) => l.listing_id));
        
        // Automatically fetch and upload all images to WordPress
        // Use setTimeout to allow UI to update first
        setTimeout(() => {
          handleFetchAndUploadImagesAuto(data.listings.map((l: Listing) => l.listing_id));
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while analyzing the shop');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchListingImages = async (listingIds: number[]) => {
    if (listingIds.length === 0) return;
    
    try {
      const fetchResponse = await fetch('/api/etsy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'fetch-images',
          listingIds,
          apiKey: apiKey.trim() || undefined,
        }),
      });

      if (fetchResponse.ok) {
        const fetchData = await fetchResponse.json();
        const imageMap = new Map<number, string>();
        fetchData.results.forEach((r: any) => {
          if (r.success && r.image_url) {
            imageMap.set(r.listing_id, r.image_url);
          }
        });
        setListingImages(imageMap);
      }
    } catch (error) {
      console.error('Failed to fetch listing images:', error);
    }
  };

  const handleExportCSV = () => {
    if (!result) return;

    const headers = ['Listing ID', 'Title', 'WordPress Image Link', 'Views', 'Favorites', 'Stock', 'Age (Days)', 'Price', 'Currency', 'Is Digital', 'Tags'];
    const rows = result.listings.map(listing => {
      const wpImageUrl = uploadedImages.get(listing.listing_id) || '';
      return [
        listing.listing_id,
        listing.title,
        wpImageUrl, // WordPress image link
        listing.views,
        listing.favorites,
        listing.stock,
        listing.age_days || '',
        listing.price || '',
        listing.currency_code || '',
        listing.is_digital ? 'Yes' : 'No',
        listing.tags.join(', '),
      ];
    });

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

  const handleCopyAllTags = () => {
    if (!result) return;
    
    const allTags = new Set<string>();
    result.listings.forEach(listing => {
      listing.tags.forEach(tag => allTags.add(tag));
    });
    
    const tagsArray = Array.from(allTags).sort();
    navigator.clipboard.writeText(tagsArray.join(', '));
    alert(`Copied ${tagsArray.length} unique tags to clipboard!`);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortedListings = () => {
    if (!result) return [];
    
    const sorted = [...result.listings].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortColumn) {
        case 'views':
          aVal = a.views;
          bVal = b.views;
          break;
        case 'favorites':
          aVal = a.favorites;
          bVal = b.favorites;
          break;
        case 'price':
          aVal = a.price || 0;
          bVal = b.price || 0;
          break;
        case 'stock':
          aVal = a.stock;
          bVal = b.stock;
          break;
        case 'age':
          aVal = a.age_days || 0;
          bVal = b.age_days || 0;
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        default:
          aVal = a.views;
          bVal = b.views;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  };

  // Calculate metrics
  const calculateMetrics = () => {
    if (!result) return null;
    
    const currency = result.shop_info.currency_code || 'USD';
    const currencySymbol = currency === 'USD' ? '$' : currency;
    
    const totalSales = result.shop_info.total_sales || 0;
    const shopAgeDays = result.shop_info.shop_age_days || 1;
    const dailyAvgSales = shopAgeDays > 0 ? (totalSales / shopAgeDays).toFixed(2) : '0.00';
    
    const avgPrice = result.shop_info.avg_price || 0;
    const estimatedRevenue = totalSales * avgPrice;
    const dailyAvgRevenue = shopAgeDays > 0 ? (estimatedRevenue / shopAgeDays).toFixed(2) : '0.00';
    
    const oldestListingAge = result.shop_info.oldest_listing_age_days || result.shop_info.shop_age_days || null;
    
    return {
      totalSales,
      dailyAvgSales,
      estimatedRevenue,
      dailyAvgRevenue,
      avgPrice,
      oldestListingAge,
      currencySymbol,
    };
  };

  const handleFetchAndUploadImagesAuto = async (listingIds: number[]) => {
    if (!listingIds || listingIds.length === 0) {
      return;
    }

    setIsFetchingImages(true);
    setError(null);
    setUploadProgress({ completed: 0, total: listingIds.length });
    const newUploadedImages = new Map<number, string>();

    try {
      // Step 1: Fetch image URLs from Etsy API
      
      const fetchResponse = await fetch('/api/etsy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'fetch-images',
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

      // Step 2: Download each image via proxy (to bypass CORS), convert to base64, and upload to WordPress
      for (let i = 0; i < successfulFetches.length; i++) {
        const fetchResult = successfulFetches[i];
        
        try {
          // Download the image via proxy to bypass CORS
          const proxyUrl = `/api/etsy?operation=proxy-image&url=${encodeURIComponent(fetchResult.image_url)}`;
          const imageResponse = await fetch(proxyUrl);
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
        console.log(`✅ Successfully uploaded ${newUploadedImages.size} image(s) to WordPress!`);
      }

    } catch (err: any) {
      console.error('Failed to fetch and upload images:', err);
      setError(err.message || 'Failed to fetch and upload images');
    } finally {
      setIsFetchingImages(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  const handleFetchAndUploadImages = async () => {
    if (!result || result.listings.length === 0) {
      setError('No listings to process');
      return;
    }

    const listingIds = result.listings.map(l => l.listing_id);
    await handleFetchAndUploadImagesAuto(listingIds);
    
    // Wait a bit for state to update, then show alert
    setTimeout(() => {
      if (uploadedImages.size > 0) {
        // Copy all WordPress URLs to clipboard
        const urls = Array.from(uploadedImages.values()).join('\n');
        navigator.clipboard.writeText(urls);
        alert(`Successfully uploaded ${uploadedImages.size} image(s) to WordPress! URLs copied to clipboard.`);
      }
    }, 500);
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
        {result && (() => {
          const metrics = calculateMetrics();
          const sortedListings = getSortedListings();
          
          return (
            <div className="space-y-6">
              {/* Auto Upload Status */}
              {isFetchingImages && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-3 text-blue-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <div>
                      <div className="font-medium">Automatically uploading images to WordPress...</div>
                      <div className="text-sm text-blue-300">
                        Progress: {uploadProgress.completed} / {uploadProgress.total} images
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shop Info Card - Enhanced */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center text-white font-bold text-xl">
                    {result.shop_info.shop_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-2xl font-bold text-white">{result.shop_info.shop_name}</h3>
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
                        {result.shop_info.currency_code || 'USD'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                      <span>ID: {result.shop_info.shop_id}</span>
                      {result.shop_info.shop_location && (
                        <span>• {result.shop_info.shop_location}-based</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Total Sales */}
                <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700/50">
                  <div className="flex items-center gap-2 text-blue-400 mb-2">
                    <BarChart3 className="w-4 h-4" />
                    <span className="text-xs font-medium">Total Sales</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-300">{metrics?.totalSales.toLocaleString() || 0}</div>
                  <div className="text-xs text-blue-400 mt-1">{metrics?.dailyAvgSales}/day</div>
                </div>

                {/* Est. Revenue */}
                <div className="bg-green-900/30 rounded-lg p-4 border border-green-700/50">
                  <div className="flex items-center gap-2 text-green-400 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">Est. Revenue</span>
                  </div>
                  <div className="text-2xl font-bold text-green-300">
                    {metrics?.currencySymbol}{metrics?.estimatedRevenue.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-xs text-green-400 mt-1">{metrics?.currencySymbol}{metrics?.dailyAvgRevenue}/day</div>
                </div>

                {/* Avg Price */}
                <div className="bg-cyan-900/30 rounded-lg p-4 border border-cyan-700/50">
                  <div className="flex items-center gap-2 text-cyan-400 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">Avg Price</span>
                  </div>
                  <div className="text-2xl font-bold text-cyan-300">
                    {metrics?.currencySymbol}{metrics?.avgPrice.toFixed(2) || '0.00'}
                  </div>
                </div>

                {/* Listings */}
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Package className="w-4 h-4" />
                    <span className="text-xs font-medium">Listings</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {result.shop_info.total_listings} ({result.shop_info.total_listings})
                  </div>
                </div>

                {/* Favorites */}
                <div className="bg-pink-900/30 rounded-lg p-4 border border-pink-700/50">
                  <div className="flex items-center gap-2 text-pink-400 mb-2">
                    <Heart className="w-4 h-4" />
                    <span className="text-xs font-medium">Favorites</span>
                  </div>
                  <div className="text-2xl font-bold text-pink-300">
                    {result.shop_info.total_favorers.toLocaleString()}
                  </div>
                  <div className="text-xs text-pink-400 mt-1">
                    {result.shop_info.total_favorers.toLocaleString()} (5.0★)
                  </div>
                </div>

                {/* Age / Oldest */}
                <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-700/50">
                  <div className="flex items-center gap-2 text-amber-400 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Age / Oldest</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-300">
                    {result.shop_info.shop_age_days ? `${result.shop_info.shop_age_days}d` : 'N/A'}
                  </div>
                  {metrics?.oldestListingAge && (
                    <div className="text-xs text-amber-400 mt-1">
                      Oldest: {metrics.oldestListingAge}d
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCopyAllTags}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                >
                  <Tag className="w-4 h-4" />
                  Copy All Tags
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export to CSV
                </button>
                <button
                  onClick={handleFetchAndUploadImages}
                  disabled={isFetchingImages || result.listings.length === 0}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                >
                  {isFetchingImages ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading ({uploadProgress.completed}/{uploadProgress.total})
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Fetch & Upload Images
                    </>
                  )}
                </button>
              </div>

              {/* Comprehensive Listings Table */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Image</th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:bg-slate-800"
                          onClick={() => handleSort('title')}
                        >
                          Title {sortColumn === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:bg-slate-800"
                          onClick={() => handleSort('price')}
                        >
                          Price {sortColumn === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Views</th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:bg-slate-800"
                          onClick={() => handleSort('favorites')}
                        >
                          Favs {sortColumn === 'favorites' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Created</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Modified</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">WordPress</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {sortedListings.map((listing, index) => {
                        const imageUrl = listingImages.get(listing.listing_id) || listing.image_url;
                        const wpUrl = uploadedImages.get(listing.listing_id);
                        const currencySymbol = listing.currency_code === 'USD' ? '$' : listing.currency_code || '$';
                        
                        return (
                          <tr key={listing.listing_id} className="hover:bg-slate-700/50 transition-colors">
                            <td className="px-3 py-2 text-slate-300 font-medium">{index + 1}</td>
                            <td className="px-3 py-2">
                              {imageUrl ? (
                                <img 
                                  src={imageUrl} 
                                  alt={listing.title}
                                  className="w-12 h-12 object-cover rounded border border-slate-600"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-12 h-12 bg-slate-700 rounded border border-slate-600 flex items-center justify-center">
                                  <ImageIcon className="w-5 h-5 text-slate-500" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-white max-w-xs truncate" title={listing.title}>
                              {listing.title}
                            </td>
                            <td className="px-3 py-2 text-slate-300 font-medium">
                              {currencySymbol}{listing.price?.toFixed(2) || '0.00'}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{listing.stock}</td>
                            <td className="px-3 py-2 text-slate-300">{listing.views.toLocaleString()}</td>
                            <td className="px-3 py-2 text-slate-300">{listing.favorites.toLocaleString()}</td>
                            <td className="px-3 py-2 text-slate-300">
                              {listing.age_days ? `${listing.age_days}d` : 'N/A'}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-xs">
                              {listing.last_modified 
                                ? new Date(listing.last_modified).toLocaleDateString()
                                : 'N/A'}
                            </td>
                            <td className="px-3 py-2">
                              {wpUrl ? (
                                <div className="flex items-center gap-1">
                                  <Check className="w-3 h-3 text-green-400" />
                                  <button
                                    onClick={() => navigator.clipboard.writeText(wpUrl)}
                                    className="text-xs text-purple-400 hover:text-purple-300 underline"
                                    title="Copy WordPress URL"
                                  >
                                    Copy
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => {
                                    const tags = listing.tags.join(', ');
                                    navigator.clipboard.writeText(tags);
                                  }}
                                  className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 transition-colors border border-amber-600/30"
                                  title={`Tags: ${listing.tags.join(', ')}`}
                                >
                                  Tags
                                </button>
                                {imageUrl && (
                                  <button
                                    onClick={() => {
                                      window.open(imageUrl, '_blank');
                                    }}
                                    className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors border border-blue-600/30"
                                    title="View image"
                                  >
                                    Img
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 text-sm text-slate-400 text-center">
                  Showing all {result.listings.length} listing{result.listings.length !== 1 ? 's' : ''} 
                  {sortColumn && ` sorted by ${sortColumn} (${sortDirection})`}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default EtsyShopAnalyzer;

