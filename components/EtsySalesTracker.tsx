import React, { useState, useCallback } from 'react';
import {
    TrendingUp, Loader2, X, Eye, Heart,
    Package, DollarSign, Download, BarChart3,
    AlertTriangle, ArrowUpDown, Info, ShoppingBag
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface EtsySalesTrackerProps {
    onClose?: () => void;
}

interface Listing {
    listing_id: number;
    title: string;
    description: string;
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
    shop_id?: number;
    shop_age_days: number | null;
    total_listings: number;
    total_favorers: number;
    total_sales: number;
    shop_url?: string;
    avg_price?: number;
    currency_code?: string;
}

interface AnalysisResult {
    shop_info: ShopInfo;
    listings: Listing[];
}

// Standard Etsy baseline stock — 99% of sellers start at 999
const DEFAULT_BASELINE_STOCK = 999;

// ─── Component ───────────────────────────────────────────────────────

const EtsySalesTracker: React.FC<EtsySalesTrackerProps> = ({ onClose }) => {
    const [shopUrl, setShopUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [sharedSecret, setSharedSecret] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortColumn, setSortColumn] = useState<string>('sold');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // ─── Analyze ──────────────────────────────────────────────────────

    const handleAnalyze = useCallback(async () => {
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: 'analyze',
                    shopUrl: shopUrl.trim(),
                    apiKey: apiKey.trim() || undefined,
                    sharedSecret: sharedSecret.trim() || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to analyze shop');
            }

            const data: AnalysisResult = await response.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsAnalyzing(false);
        }
    }, [shopUrl, apiKey, sharedSecret]);

    // ─── Sorting ──────────────────────────────────────────────────────

    const handleSort = (col: string) => {
        if (sortColumn === col) {
            setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(col);
            setSortDirection('desc');
        }
    };

    const getSortedListings = (): (Listing & { sold: number })[] => {
        if (!result) return [];
        const withSold = result.listings.map(l => ({
            ...l,
            sold: Math.max(0, DEFAULT_BASELINE_STOCK - l.stock),
        }));
        return withSold.sort((a, b) => {
            let av: any, bv: any;
            switch (sortColumn) {
                case 'sold': av = a.sold; bv = b.sold; break;
                case 'stock': av = a.stock; bv = b.stock; break;
                case 'views': av = a.views; bv = b.views; break;
                case 'favorites': av = a.favorites; bv = b.favorites; break;
                case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
                case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
                default: av = a.sold; bv = b.sold;
            }
            if (av < bv) return sortDirection === 'asc' ? -1 : 1;
            if (av > bv) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // ─── Export CSV ───────────────────────────────────────────────────

    const handleExportCSV = () => {
        if (!result) return;
        const headers = ['Listing ID', 'Title', 'Description', 'Stock', 'Sold (999-stock)', 'Views', 'Favorites', 'Price', 'Digital', 'Tags'];
        const rows = result.listings.map(l => [
            l.listing_id,
            `"${l.title.replace(/"/g, '""')}"`,
            `"${(l.description || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
            l.stock,
            Math.max(0, DEFAULT_BASELINE_STOCK - l.stock),
            l.views,
            l.favorites,
            l.price ?? '',
            l.is_digital ? 'Yes' : 'No',
            `"${l.tags.join(', ')}"`,
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${result.shop_info.shop_name}_listings_${Date.now()}.csv`;
        link.click();
    };

    // ─── Metrics ──────────────────────────────────────────────────────

    const getMetrics = () => {
        if (!result) return null;
        const totalSold = result.listings.reduce((s, l) => s + Math.max(0, DEFAULT_BASELINE_STOCK - l.stock), 0);
        const totalViews = result.listings.reduce((s, l) => s + l.views, 0);
        const totalFavs = result.listings.reduce((s, l) => s + l.favorites, 0);
        const digitalCount = result.listings.filter(l => l.is_digital).length;
        return { totalSold, totalViews, totalFavs, digitalCount };
    };

    const SortIcon = ({ col }: { col: string }) => (
        <span className="ml-1 inline-block w-3">
            {sortColumn === col ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </span>
    );

    // ─── Render ───────────────────────────────────────────────────────

    const metrics = getMetrics();
    const sorted = getSortedListings();

    return (
        <div className="bg-slate-900 rounded-xl border border-emerald-500/30 overflow-hidden max-w-7xl mx-auto">
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-emerald-900/50 to-teal-900/30 px-6 py-4 border-b border-emerald-500/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Etsy Sales Tracker</h2>
                            <p className="text-sm text-slate-400">See stock, views, favorites & estimated sales per listing</p>
                        </div>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* ── Input Fields ── */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Etsy Shop URL</label>
                        <input
                            type="text"
                            value={shopUrl}
                            onChange={e => setShopUrl(e.target.value)}
                            placeholder="https://www.etsy.com/shop/YourShopName"
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                            disabled={isAnalyzing}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">API Key (Optional)</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder="Leave empty to use server key"
                                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                disabled={isAnalyzing}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Shared Secret (Optional)</label>
                            <input
                                type="password"
                                value={sharedSecret}
                                onChange={e => setSharedSecret(e.target.value)}
                                placeholder="Leave empty to use server secret"
                                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                disabled={isAnalyzing}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !shopUrl.trim()}
                        className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isAnalyzing ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> Fetching listings...</>
                        ) : (
                            <><TrendingUp className="w-5 h-5" /> Get Sales Data</>
                        )}
                    </button>
                </div>

                {/* ── Error ── */}
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* ── Results ── */}
                {result && (
                    <div className="space-y-6">
                        {/* ── Shop Info ── */}
                        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                                    {result.shop_info.shop_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-2xl font-bold text-white">{result.shop_info.shop_name}</h3>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                                        <span>{result.listings.length} listings fetched</span>
                                        <span>•</span>
                                        <span>{result.shop_info.total_sales.toLocaleString()} total shop sales</span>
                                        {result.shop_info.shop_age_days && (
                                            <><span>•</span><span>{result.shop_info.shop_age_days} days old</span></>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Metric Cards ── */}
                        {metrics && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-700/50">
                                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                                        <ShoppingBag className="w-4 h-4" />
                                        <span className="text-xs font-medium">Est. Total Sold</span>
                                    </div>
                                    <div className="text-2xl font-bold text-emerald-300">
                                        {metrics.totalSold.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-emerald-400/60 mt-1">from 999 baseline</div>
                                </div>

                                <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700/50">
                                    <div className="flex items-center gap-2 text-blue-400 mb-1">
                                        <Eye className="w-4 h-4" />
                                        <span className="text-xs font-medium">Total Views</span>
                                    </div>
                                    <div className="text-2xl font-bold text-blue-300">
                                        {metrics.totalViews.toLocaleString()}
                                    </div>
                                </div>

                                <div className="bg-pink-900/30 rounded-lg p-4 border border-pink-700/50">
                                    <div className="flex items-center gap-2 text-pink-400 mb-1">
                                        <Heart className="w-4 h-4" />
                                        <span className="text-xs font-medium">Total Favorites</span>
                                    </div>
                                    <div className="text-2xl font-bold text-pink-300">
                                        {metrics.totalFavs.toLocaleString()}
                                    </div>
                                </div>

                                <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-700/50">
                                    <div className="flex items-center gap-2 text-amber-400 mb-1">
                                        <Package className="w-4 h-4" />
                                        <span className="text-xs font-medium">Listings Fetched</span>
                                    </div>
                                    <div className="text-2xl font-bold text-amber-300">
                                        {result.listings.length.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-amber-400/60 mt-1">{metrics.digitalCount} digital</div>
                                </div>
                            </div>
                        )}

                        {/* ── Export Button ── */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleExportCSV}
                                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Info className="w-3 h-3" />
                                Sold = 999 − current stock (standard Etsy baseline)
                            </div>
                        </div>

                        {/* ── Listings Table ── */}
                        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-700">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                                    All Listings ({sorted.length})
                                </h4>
                            </div>

                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">#</th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('title')}
                                            >
                                                Title<SortIcon col="title" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('stock')}
                                            >
                                                Stock<SortIcon col="stock" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('sold')}
                                            >
                                                Sold<SortIcon col="sold" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('views')}
                                            >
                                                Views<SortIcon col="views" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('favorites')}
                                            >
                                                Favs<SortIcon col="favorites" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('price')}
                                            >
                                                Price<SortIcon col="price" />
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Type</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Tags</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        {sorted.map((listing, idx) => (
                                            <tr
                                                key={listing.listing_id}
                                                className="hover:bg-slate-700/50 transition-colors"
                                            >
                                                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                                                <td className="px-3 py-2 text-white max-w-[300px] truncate" title={listing.title}>
                                                    {listing.title}
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">{listing.stock}</td>
                                                <td className="px-3 py-2">
                                                    <span className={listing.sold > 0 ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>
                                                        {listing.sold}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-blue-300">{listing.views.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-pink-300">{listing.favorites.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-slate-300">
                                                    {listing.price != null ? `${listing.currency_code === 'USD' ? '$' : ''}${listing.price.toFixed(2)}` : '—'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 text-[10px] rounded ${listing.is_digital ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-600/30 text-slate-400 border border-slate-600/30'}`}>
                                                        {listing.is_digital ? 'Digital' : 'Physical'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 max-w-[200px]">
                                                    <div className="flex flex-wrap gap-1">
                                                        {listing.tags.slice(0, 5).map((tag, i) => (
                                                            <span key={i} className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                        {listing.tags.length > 5 && (
                                                            <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-500 rounded">
                                                                +{listing.tags.length - 5}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 max-w-[250px]">
                                                    <p className="text-xs text-slate-400 truncate" title={listing.description}>
                                                        {listing.description ? listing.description.substring(0, 80) + (listing.description.length > 80 ? '...' : '') : '—'}
                                                    </p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EtsySalesTracker;
