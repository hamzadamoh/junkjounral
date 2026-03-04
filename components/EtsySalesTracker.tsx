import React, { useState, useCallback } from 'react';
import {
    ShoppingBag, Loader2, X, TrendingUp, TrendingDown, Eye, Heart,
    Package, Calendar, DollarSign, Download, FileText, BarChart3,
    AlertTriangle, CheckCircle, Clock, ArrowUpDown, Zap, Database,
    RefreshCw, Trash2, ChevronDown, ChevronUp, Copy, Info
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface EtsySalesTrackerProps {
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
    shop_id?: number;
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

interface Snapshot {
    timestamp: string;
    shop_info: ShopInfo;
    listings: Listing[];
}

interface SalesEstimate {
    listing_id: number;
    title: string;
    stock_delta: number;
    proxy_score: number;
    estimated_sales: number;
    lifetime_sales_from_stock: number;
    new_listing: boolean;
    stock: number;
    favorites: number;
    views: number;
    is_digital: boolean;
    tags: string[];
    delta_favs: number;
    delta_views: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const SNAPSHOT_KEY_PREFIX = 'etsy_snapshot_';

function sanitizeName(name: string): string {
    return name.replace(/[^\w\-]/g, '_');
}

function getSnapshotKeys(shopName: string): string[] {
    const prefix = SNAPSHOT_KEY_PREFIX + sanitizeName(shopName) + '_';
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys.sort();
}

function saveSnapshot(shopName: string, data: AnalysisResult): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `${SNAPSHOT_KEY_PREFIX}${sanitizeName(shopName)}_${ts}`;
    const snapshot: Snapshot = {
        timestamp: ts,
        shop_info: data.shop_info,
        listings: data.listings,
    };
    localStorage.setItem(key, JSON.stringify(snapshot));
    return key;
}

function loadLatestSnapshot(shopName: string): Snapshot | null {
    const keys = getSnapshotKeys(shopName);
    if (keys.length === 0) return null;
    const latest = keys[keys.length - 1];
    const raw = localStorage.getItem(latest);
    return raw ? JSON.parse(raw) : null;
}

function loadAllSnapshots(shopName: string): { key: string; snapshot: Snapshot }[] {
    return getSnapshotKeys(shopName).map(key => ({
        key,
        snapshot: JSON.parse(localStorage.getItem(key)!),
    }));
}

function deleteSnapshot(key: string) {
    localStorage.removeItem(key);
}

// ─── Sales Estimation Engine ─────────────────────────────────────────

// Standard Etsy baseline stock — 99% of sellers start at 999
const DEFAULT_BASELINE_STOCK = 999;

function computeSales(
    current: AnalysisResult,
    previous: Snapshot | null
): SalesEstimate[] {
    const prevMap = new Map<number, Listing>();
    if (previous) {
        for (const l of previous.listings) {
            prevMap.set(l.listing_id, l);
        }
    }

    const shopDeltaSales = previous
        ? current.shop_info.total_sales - previous.shop_info.total_sales
        : 0;

    const totalDigitalScore = current.listings
        .filter(l => l.is_digital)
        .reduce((sum, l) => sum + l.views + l.favorites, 0);

    const results: SalesEstimate[] = [];

    for (const listing of current.listings) {
        const prev = prevMap.get(listing.listing_id);
        const isNew = !prev;

        // Immediate: lifetime sales from 999 baseline
        // Works on the very first run — most sellers start stock at 999
        const lifetimeSalesFromStock = Math.max(0, DEFAULT_BASELINE_STOCK - listing.stock);

        // Plan A: stock-based delta (snapshot comparison)
        const stockDelta = prev ? prev.stock - listing.stock : 0;

        // Plan B: proxy scoring
        const deltaFavs = listing.favorites - (prev?.favorites ?? 0);
        const deltaViews = listing.views - (prev?.views ?? 0);
        const proxyScore = deltaFavs + deltaViews;

        // Plan C: proportional digital sales allocation
        let proportionalSales = 0;
        if (listing.is_digital && shopDeltaSales > 0 && totalDigitalScore > 0) {
            const listingScore = listing.views + listing.favorites;
            proportionalSales = shopDeltaSales * (listingScore / totalDigitalScore);
        }

        // estimated_sales: use snapshot delta if available, otherwise use 999-baseline
        const snapshotEstimate = Math.max(stockDelta, proportionalSales);
        const estimatedSales = previous ? snapshotEstimate : lifetimeSalesFromStock;

        results.push({
            listing_id: listing.listing_id,
            title: listing.title,
            stock_delta: stockDelta,
            proxy_score: proxyScore,
            estimated_sales: estimatedSales,
            lifetime_sales_from_stock: lifetimeSalesFromStock,
            new_listing: isNew,
            stock: listing.stock,
            favorites: listing.favorites,
            views: listing.views,
            is_digital: listing.is_digital,
            tags: listing.tags,
            delta_favs: deltaFavs,
            delta_views: deltaViews,
        });
    }

    return results;
}

// ─── Duplicate & Consistency Audits ──────────────────────────────────

function auditDuplicates(listings: Listing[]): number[] {
    const seen = new Set<number>();
    const dupes: number[] = [];
    for (const l of listings) {
        if (seen.has(l.listing_id)) dupes.push(l.listing_id);
        else seen.add(l.listing_id);
    }
    return dupes;
}

function auditShopConsistency(listings: Listing[]): { consistent: boolean; shopIds: number[] } {
    const ids = new Set<number>();
    for (const l of listings) {
        if (l.shop_id) ids.add(l.shop_id);
    }
    return { consistent: ids.size <= 1, shopIds: Array.from(ids) };
}

// ─── Component ───────────────────────────────────────────────────────

const EtsySalesTracker: React.FC<EtsySalesTrackerProps> = ({ onClose }) => {
    const [shopUrl, setShopUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [sharedSecret, setSharedSecret] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [salesData, setSalesData] = useState<SalesEstimate[]>([]);
    const [previousSnapshot, setPreviousSnapshot] = useState<Snapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortColumn, setSortColumn] = useState<string>('estimated_sales');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [duplicates, setDuplicates] = useState<number[]>([]);
    const [shopConsistency, setShopConsistency] = useState<{ consistent: boolean; shopIds: number[] } | null>(null);
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [snapshots, setSnapshots] = useState<{ key: string; snapshot: Snapshot }[]>([]);
    const [snapshotSavedKey, setSnapshotSavedKey] = useState<string | null>(null);
    const [showAuditPanel, setShowAuditPanel] = useState(false);

    // ─── Analyze ──────────────────────────────────────────────────────

    const handleAnalyze = useCallback(async () => {
        if (!shopUrl.trim()) {
            setError('Please enter an Etsy shop URL');
            return;
        }

        setIsAnalyzing(true);
        setError(null);
        setResult(null);
        setSalesData([]);
        setDuplicates([]);
        setShopConsistency(null);
        setSnapshotSavedKey(null);

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

            // Audits
            const dupes = auditDuplicates(data.listings);
            setDuplicates(dupes);
            const consistency = auditShopConsistency(data.listings);
            setShopConsistency(consistency);

            // Load previous snapshot & compute sales
            const shopName = data.shop_info.shop_name;
            const prev = loadLatestSnapshot(shopName);
            setPreviousSnapshot(prev);
            const sales = computeSales(data, prev);
            setSalesData(sales);

            // Save current snapshot
            const key = saveSnapshot(shopName, data);
            setSnapshotSavedKey(key);

            // Refresh snapshot list
            setSnapshots(loadAllSnapshots(shopName));
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

    const getSortedSales = (): SalesEstimate[] => {
        return [...salesData].sort((a, b) => {
            let av: any, bv: any;
            switch (sortColumn) {
                case 'estimated_sales': av = a.estimated_sales; bv = b.estimated_sales; break;
                case 'lifetime_sales': av = a.lifetime_sales_from_stock; bv = b.lifetime_sales_from_stock; break;
                case 'stock_delta': av = a.stock_delta; bv = b.stock_delta; break;
                case 'proxy_score': av = a.proxy_score; bv = b.proxy_score; break;
                case 'views': av = a.views; bv = b.views; break;
                case 'favorites': av = a.favorites; bv = b.favorites; break;
                case 'stock': av = a.stock; bv = b.stock; break;
                case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
                default: av = a.estimated_sales; bv = b.estimated_sales;
            }
            if (av < bv) return sortDirection === 'asc' ? -1 : 1;
            if (av > bv) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // ─── Export ───────────────────────────────────────────────────────

    const handleExportCSV = () => {
        if (salesData.length === 0) return;
        const headers = ['Listing ID', 'Title', 'Stock', 'Lifetime Sales (999)', 'Stock Delta', 'Est. Sales', 'Proxy Score', 'Favorites', 'Δ Favs', 'Views', 'Δ Views', 'Digital', 'New Listing', 'Tags'];
        const rows = salesData.map(s => [
            s.listing_id, `"${s.title.replace(/"/g, '""')}"`, s.stock, s.lifetime_sales_from_stock,
            s.stock_delta, s.estimated_sales.toFixed(2), s.proxy_score, s.favorites, s.delta_favs,
            s.views, s.delta_views, s.is_digital ? 'Yes' : 'No', s.new_listing ? 'Yes' : 'No',
            `"${s.tags.join(', ')}"`,
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${result?.shop_info.shop_name || 'shop'}_sales_${Date.now()}.csv`;
        link.click();
    };

    const handleExportJSON = () => {
        if (!result) return;
        const payload = {
            snapshot_timestamp: new Date().toISOString(),
            shop_info: result.shop_info,
            sales_estimates: salesData,
            comparison_snapshot: previousSnapshot?.timestamp || null,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${result.shop_info.shop_name}_sales_${Date.now()}.json`;
        link.click();
    };

    // ─── Snapshot Management ──────────────────────────────────────────

    const handleDeleteSnapshot = (key: string) => {
        deleteSnapshot(key);
        if (result) setSnapshots(loadAllSnapshots(result.shop_info.shop_name));
    };

    const handleClearAllSnapshots = () => {
        if (!result) return;
        const keys = getSnapshotKeys(result.shop_info.shop_name);
        keys.forEach(k => localStorage.removeItem(k));
        setSnapshots([]);
        setPreviousSnapshot(null);
    };

    // ─── Metrics ──────────────────────────────────────────────────────

    const getMetrics = () => {
        if (!result || salesData.length === 0) return null;

        const totalEstSales = salesData.reduce((s, d) => s + d.estimated_sales, 0);
        const totalLifetimeSales = salesData.reduce((s, d) => s + d.lifetime_sales_from_stock, 0);
        const newListings = salesData.filter(d => d.new_listing).length;
        const topMovers = [...salesData].sort((a, b) => b.estimated_sales - a.estimated_sales).slice(0, 5);
        const avgProxyScore = salesData.length > 0
            ? salesData.reduce((s, d) => s + d.proxy_score, 0) / salesData.length
            : 0;

        const shopDeltaSales = previousSnapshot
            ? result.shop_info.total_sales - previousSnapshot.shop_info.total_sales
            : 0;

        const shopDeltaFavs = previousSnapshot
            ? result.shop_info.total_favorers - previousSnapshot.shop_info.total_favorers
            : 0;

        return { totalEstSales, totalLifetimeSales, newListings, topMovers, avgProxyScore, shopDeltaSales, shopDeltaFavs };
    };

    const SortIcon = ({ col }: { col: string }) => (
        <span className="ml-1 inline-block w-3">
            {sortColumn === col ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </span>
    );

    // ─── Render ───────────────────────────────────────────────────────

    const metrics = getMetrics();
    const sorted = getSortedSales();

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
                            <p className="text-sm text-slate-400">Track sales, compare snapshots & estimate revenue</p>
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
                            <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing & Comparing...</>
                        ) : (
                            <><TrendingUp className="w-5 h-5" /> Analyze & Track Sales</>
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
                        {/* Snapshot saved confirmation */}
                        {snapshotSavedKey && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 flex items-center gap-2 text-sm">
                                <CheckCircle className="w-4 h-4" />
                                Snapshot saved to localStorage
                                {previousSnapshot && (
                                    <span className="text-slate-400 ml-2">
                                        • Comparing against snapshot from {previousSnapshot.timestamp.replace(/T.*/, '').replace(/-/g, '/')}
                                    </span>
                                )}
                                {!previousSnapshot && (
                                    <span className="text-slate-400 ml-2">• First snapshot — run again later to see changes</span>
                                )}
                            </div>
                        )}

                        {/* ── Shop Info + Delta Cards ── */}
                        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                                    {result.shop_info.shop_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-2xl font-bold text-white">{result.shop_info.shop_name}</h3>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                                        <span>{result.shop_info.total_listings} listings</span>
                                        <span>•</span>
                                        <span>{result.shop_info.total_sales.toLocaleString()} total sales</span>
                                        {result.shop_info.shop_age_days && (
                                            <><span>•</span><span>{result.shop_info.shop_age_days} days old</span></>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Metric Cards ── */}
                        {metrics && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-700/50">
                                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                                        <DollarSign className="w-4 h-4" />
                                        <span className="text-xs font-medium">Shop Δ Sales</span>
                                    </div>
                                    <div className="text-2xl font-bold text-emerald-300">
                                        {metrics.shopDeltaSales > 0 ? '+' : ''}{metrics.shopDeltaSales}
                                    </div>
                                    <div className="text-xs text-emerald-400/60 mt-1">since last snapshot</div>
                                </div>

                                <div className="bg-teal-900/30 rounded-lg p-4 border border-teal-700/50">
                                    <div className="flex items-center gap-2 text-teal-400 mb-1">
                                        <BarChart3 className="w-4 h-4" />
                                        <span className="text-xs font-medium">Lifetime (999)</span>
                                    </div>
                                    <div className="text-2xl font-bold text-teal-300">
                                        {metrics.totalLifetimeSales.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-teal-400/60 mt-1">from stock count (999 baseline)</div>
                                </div>

                                <div className="bg-cyan-900/30 rounded-lg p-4 border border-cyan-700/50">
                                    <div className="flex items-center gap-2 text-cyan-400 mb-1">
                                        <Heart className="w-4 h-4" />
                                        <span className="text-xs font-medium">Δ Favorers</span>
                                    </div>
                                    <div className="text-2xl font-bold text-cyan-300">
                                        {metrics.shopDeltaFavs > 0 ? '+' : ''}{metrics.shopDeltaFavs}
                                    </div>
                                </div>

                                <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700/50">
                                    <div className="flex items-center gap-2 text-blue-400 mb-1">
                                        <Zap className="w-4 h-4" />
                                        <span className="text-xs font-medium">Avg Proxy</span>
                                    </div>
                                    <div className="text-2xl font-bold text-blue-300">
                                        {metrics.avgProxyScore.toFixed(1)}
                                    </div>
                                    <div className="text-xs text-blue-400/60 mt-1">Δviews + Δfavs</div>
                                </div>

                                <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/50">
                                    <div className="flex items-center gap-2 text-purple-400 mb-1">
                                        <Package className="w-4 h-4" />
                                        <span className="text-xs font-medium">New Listings</span>
                                    </div>
                                    <div className="text-2xl font-bold text-purple-300">{metrics.newListings}</div>
                                    <div className="text-xs text-purple-400/60 mt-1">since last snapshot</div>
                                </div>

                                <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-700/50">
                                    <div className="flex items-center gap-2 text-amber-400 mb-1">
                                        <Calendar className="w-4 h-4" />
                                        <span className="text-xs font-medium">Total Listings</span>
                                    </div>
                                    <div className="text-2xl font-bold text-amber-300">{result.shop_info.total_listings}</div>
                                </div>
                            </div>
                        )}

                        {/* ── Audit Panel ── */}
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setShowAuditPanel(!showAuditPanel)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2 text-sm border border-slate-700"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                Audits
                                {showAuditPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            <button
                                onClick={() => setShowSnapshots(!showSnapshots)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2 text-sm border border-slate-700"
                            >
                                <Database className="w-4 h-4" />
                                Snapshots ({snapshots.length})
                                {showSnapshots ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            <button
                                onClick={handleExportCSV}
                                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                                <Download className="w-4 h-4" /> Export CSV
                            </button>

                            <button
                                onClick={handleExportJSON}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                                <FileText className="w-4 h-4" /> Export JSON
                            </button>
                        </div>

                        {/* Audit details */}
                        {showAuditPanel && (
                            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Data Audits
                                </h4>
                                <div className="flex items-center gap-2 text-sm">
                                    {duplicates.length === 0 ? (
                                        <span className="text-emerald-400 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> No duplicate listings
                                        </span>
                                    ) : (
                                        <span className="text-red-400 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> {duplicates.length} duplicate(s): {duplicates.join(', ')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    {shopConsistency?.consistent ? (
                                        <span className="text-emerald-400 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> All listings belong to one shop
                                        </span>
                                    ) : (
                                        <span className="text-amber-400 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Multiple shop IDs: {shopConsistency?.shopIds.join(', ')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Snapshot list */}
                        {showSnapshots && (
                            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Database className="w-4 h-4 text-blue-400" /> Saved Snapshots
                                    </h4>
                                    {snapshots.length > 0 && (
                                        <button
                                            onClick={handleClearAllSnapshots}
                                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                        >
                                            <Trash2 className="w-3 h-3" /> Clear All
                                        </button>
                                    )}
                                </div>
                                {snapshots.length === 0 ? (
                                    <p className="text-sm text-slate-500">No snapshots saved yet.</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {snapshots.map(({ key, snapshot }) => (
                                            <div key={key} className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 text-sm">
                                                <div className="text-slate-300">
                                                    <Clock className="w-3 h-3 inline mr-1 text-slate-500" />
                                                    {snapshot.timestamp.replace(/T/, ' ').replace(/-/g, ':').substring(0, 19)}
                                                    <span className="text-slate-500 ml-2">({snapshot.listings.length} listings, {snapshot.shop_info.total_sales} sales)</span>
                                                </div>
                                                <button onClick={() => handleDeleteSnapshot(key)} className="text-red-400/60 hover:text-red-400">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Top Movers ── */}
                        {metrics && metrics.topMovers.length > 0 && previousSnapshot && (
                            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" /> Top 5 Movers
                                </h4>
                                <div className="space-y-2">
                                    {metrics.topMovers.map((m, i) => (
                                        <div key={m.listing_id} className="flex items-center gap-3 bg-slate-900 rounded px-3 py-2">
                                            <span className="text-emerald-400 font-bold text-sm w-5">#{i + 1}</span>
                                            <span className="text-white text-sm flex-1 truncate">{m.title}</span>
                                            <span className="text-emerald-300 text-sm font-medium">
                                                {m.estimated_sales > 0 ? `+${m.estimated_sales.toFixed(1)}` : '0'} est.
                                            </span>
                                            <span className="text-slate-400 text-xs">
                                                Δstock: {m.stock_delta} | proxy: {m.proxy_score}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Sales Table ── */}
                        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                                    Sales Estimates ({sorted.length} listings)
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Info className="w-3 h-3" />
                                    {previousSnapshot ? 'Comparing with previous snapshot' : 'No previous snapshot — deltas are 0'}
                                </div>
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
                                                onClick={() => handleSort('stock_delta')}
                                            >
                                                Δ Stock<SortIcon col="stock_delta" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('lifetime_sales')}
                                            >
                                                Sold (999)<SortIcon col="lifetime_sales" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('estimated_sales')}
                                            >
                                                Est. Sales<SortIcon col="estimated_sales" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('proxy_score')}
                                            >
                                                Proxy<SortIcon col="proxy_score" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('favorites')}
                                            >
                                                Favs<SortIcon col="favorites" />
                                            </th>
                                            <th
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white"
                                                onClick={() => handleSort('views')}
                                            >
                                                Views<SortIcon col="views" />
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Type</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        {sorted.map((sale, idx) => (
                                            <tr
                                                key={sale.listing_id}
                                                className={`hover:bg-slate-700/50 transition-colors ${sale.new_listing ? 'bg-emerald-900/10' : ''}`}
                                            >
                                                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                                                <td className="px-3 py-2 text-white max-w-[280px] truncate" title={sale.title}>
                                                    {sale.title}
                                                    {sale.new_listing && (
                                                        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                                                            NEW
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">{sale.stock}</td>
                                                <td className="px-3 py-2">
                                                    <span className={sale.lifetime_sales_from_stock > 0 ? 'text-teal-300 font-semibold' : 'text-slate-500'}>
                                                        {sale.lifetime_sales_from_stock}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={sale.stock_delta > 0 ? 'text-emerald-400 font-medium' : sale.stock_delta < 0 ? 'text-red-400' : 'text-slate-500'}>
                                                        {sale.stock_delta > 0 ? `+${sale.stock_delta}` : sale.stock_delta}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={sale.estimated_sales > 0 ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>
                                                        {sale.estimated_sales > 0 ? sale.estimated_sales.toFixed(1) : '0'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={sale.proxy_score > 0 ? 'text-blue-300' : sale.proxy_score < 0 ? 'text-red-400' : 'text-slate-500'}>
                                                        {sale.proxy_score > 0 ? `+${sale.proxy_score}` : sale.proxy_score}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">
                                                    {sale.favorites.toLocaleString()}
                                                    {sale.delta_favs !== 0 && (
                                                        <span className={`ml-1 text-xs ${sale.delta_favs > 0 ? 'text-pink-400' : 'text-red-400'}`}>
                                                            ({sale.delta_favs > 0 ? '+' : ''}{sale.delta_favs})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">
                                                    {sale.views.toLocaleString()}
                                                    {sale.delta_views !== 0 && (
                                                        <span className={`ml-1 text-xs ${sale.delta_views > 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                                            ({sale.delta_views > 0 ? '+' : ''}{sale.delta_views})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {sale.is_digital ? (
                                                        <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded border border-purple-500/30">
                                                            Digital
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-400 rounded border border-slate-600">
                                                            Physical
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(sale.tags.join(', '))}
                                                        className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 transition-colors border border-amber-600/30"
                                                        title="Copy tags"
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ── Footer info ── */}
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                            <Info className="w-3 h-3" />
                            <span>
                                Stock Δ = previous stock − current stock (positive = sold).
                                Proxy = Δviews + Δfavorites.
                                Est. Sales = max(stock delta, proportional digital allocation).
                                Run again later to compare snapshots.
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EtsySalesTracker;
