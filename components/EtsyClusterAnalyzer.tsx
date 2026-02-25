import React, { useState } from 'react';
import {
    ChevronLeft, Loader2, Search, Network, AlertTriangle,
    TrendingUp, Star, Target, Shield, Zap, BarChart3,
    Copy, Check, ChevronDown, ChevronUp, Layers,
    Eye, Heart, ShoppingCart, Clock
} from 'lucide-react';

interface ClusterListing {
    listing_id: number;
    title: string;
    primary_identity?: string;
}

interface AnchorListing {
    listing_id: number;
    title: string;
    performance_score: number;
}

interface Underperformer {
    listing_id: number;
    title: string;
    reason: string;
}

interface Cluster {
    cluster_name: string;
    authority_score: number;
    classification: 'Dominant' | 'Growing' | 'Weak' | 'Fragmented';
    listing_count: number;
    total_views?: number;
    total_favorites?: number;
    total_sales?: number;
    anchor_listing?: AnchorListing;
    listings?: ClusterListing[];
    cannibalization_flags: string[];
    expansion_opportunities: string[];
    underperformers?: Underperformer[];
}

interface ConflictZone {
    cluster: string;
    description: string;
    affected_listings: number[];
    recommendation: string;
}

interface StructuralRisk {
    risk: string;
    severity: 'High' | 'Medium' | 'Low';
    description: string;
}

interface DifferentiationSuggestion {
    listing_id: number;
    suggestion: string;
}

interface StrategicRecommendations {
    expand_next: string;
    consolidate: string;
    differentiate_listings: DifferentiationSuggestion[];
    new_cluster_opportunity: string;
    thirty_day_plan: string;
    ninety_day_plan: string;
}

interface AnalysisResult {
    clusters: Cluster[];
    high_conflict_zones: ConflictZone[];
    weak_clusters: string[];
    overloaded_clusters: string[];
    structural_risks: StructuralRisk[];
    strategic_recommendations: StrategicRecommendations;
}

interface ShopInfo {
    shop_name: string;
    total_listings: number;
    total_sales: number;
    total_favorers: number;
    shop_url: string;
}

interface ShopListing {
    listing_id: number;
    title: string;
    tags: string[];
    description: string;
    views: number;
    favorites: number;
    section_id?: number | null;
    created_timestamp?: number | null;
    last_modified?: string | null;
}

interface EtsyClusterAnalyzerProps {
    onClose?: () => void;
}

const EtsyClusterAnalyzer: React.FC<EtsyClusterAnalyzerProps> = ({ onClose }) => {
    const [shopUrl, setShopUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
    const [listings, setListings] = useState<ShopListing[]>([]);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [cacheUsed, setCacheUsed] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'clusters' | 'risks' | 'roadmap'>('overview');

    // Step 1: Fetch shop data
    const handleFetchShop = async () => {
        if (!shopUrl.trim()) return;
        setIsLoading(true);
        setError(null);
        setShopInfo(null);
        setListings([]);
        setAnalysis(null);

        try {
            const response = await fetch('/api/etsy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'analyze', shopUrl: shopUrl.trim() }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch shop data');
            }

            const data = await response.json();
            setShopInfo(data.shop_info);
            setListings(data.listings);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ═══ ANALYSIS CACHE ═══
    // Simple hash: listing count + sorted listing IDs → deterministic key
    const generateCacheKey = (shopName: string, listingData: ShopListing[]) => {
        const ids = listingData.map(l => l.listing_id).sort().join(',');
        const key = `cluster_${shopName}_${listingData.length}_${ids.length > 100 ? ids.substring(0, 100) : ids}`;
        // Simple hash
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash |= 0;
        }
        return `etsy_cluster_cache_${Math.abs(hash)}`;
    };

    const getCachedAnalysis = (shopName: string, listingData: ShopListing[]): AnalysisResult | null => {
        try {
            const cacheKey = generateCacheKey(shopName, listingData);
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;
            const parsed = JSON.parse(cached);
            // Cache valid for 24 hours
            if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(cacheKey);
                return null;
            }
            return parsed.analysis;
        } catch { return null; }
    };

    const setCacheAnalysis = (shopName: string, listingData: ShopListing[], analysis: AnalysisResult) => {
        try {
            const cacheKey = generateCacheKey(shopName, listingData);
            localStorage.setItem(cacheKey, JSON.stringify({ analysis, timestamp: Date.now() }));
        } catch { /* storage full — ignore */ }
    };

    // Step 2: Run cluster intelligence (with cache)
    const handleRunAnalysis = async (forceRefresh = false) => {
        if (!listings.length || !shopInfo) return;
        setCacheUsed(false);

        // Check cache first
        if (!forceRefresh) {
            const cached = getCachedAnalysis(shopInfo.shop_name, listings);
            if (cached) {
                setAnalysis(cached);
                setCacheUsed(true);
                setActiveTab('overview');
                return;
            }
        }

        setIsAnalyzing(true);
        setError(null);

        try {
            const response = await fetch('/api/etsy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: 'cluster-analysis',
                    listings,
                    shop_info: shopInfo
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Cluster analysis failed');
            }

            const data = await response.json();
            setAnalysis(data.analysis);
            setCacheAnalysis(shopInfo.shop_name, listings, data.analysis);
            setActiveTab('overview');
        } catch (err: any) {
            setError('Analysis failed: ' + err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleCluster = (index: number) => {
        setExpandedClusters(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const getClassBadge = (classification: string) => {
        const colors: Record<string, string> = {
            'Dominant': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            'Growing': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
            'Weak': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
            'Fragmented': 'bg-red-500/20 text-red-300 border-red-500/30',
        };
        return colors[classification] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    };

    const getSeverityBadge = (severity: string) => {
        const colors: Record<string, string> = {
            'High': 'bg-red-500/20 text-red-300 border-red-500/30',
            'Medium': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
            'Low': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        };
        return colors[severity] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-400';
        if (score >= 60) return 'text-blue-400';
        if (score >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getScoreBar = (score: number) => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 60) return 'bg-blue-500';
        if (score >= 40) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6 bg-slate-900 text-slate-100 min-h-screen">
            {/* Header */}
            <header className="relative text-center space-y-2">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="absolute left-0 top-0 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Close"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}
                <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center justify-center gap-3">
                    <Network className="text-cyan-400" />
                    Cluster Intelligence Engine
                </h1>
                <p className="text-slate-400 text-sm">Etsy Shop Authority & Cannibalization Analysis • 2026 Model</p>
            </header>

            {/* Search Section */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                        <input
                            type="text"
                            value={shopUrl}
                            onChange={(e) => setShopUrl(e.target.value)}
                            placeholder="Enter Etsy shop URL (e.g., https://www.etsy.com/shop/YourShopName)"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all text-sm"
                            onKeyDown={(e) => e.key === 'Enter' && handleFetchShop()}
                        />
                    </div>
                    <button
                        onClick={handleFetchShop}
                        disabled={isLoading || !shopUrl.trim()}
                        className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 rounded-lg font-semibold flex items-center gap-2 transition-colors text-sm"
                    >
                        {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Load Shop'}
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {/* Shop Overview + Run Analysis */}
            {shopInfo && !analysis && (
                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{shopInfo.shop_name}</h2>
                            <p className="text-slate-400 text-sm">{listings.length} active listings loaded</p>
                        </div>
                        <div className="flex gap-4 text-center">
                            <div className="bg-slate-900/50 px-4 py-2 rounded-lg">
                                <p className="text-lg font-bold text-cyan-400">{listings.length}</p>
                                <p className="text-xs text-slate-500">Listings</p>
                            </div>
                            <div className="bg-slate-900/50 px-4 py-2 rounded-lg">
                                <p className="text-lg font-bold text-purple-400">{shopInfo.total_sales?.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">Sales</p>
                            </div>
                            <div className="bg-slate-900/50 px-4 py-2 rounded-lg">
                                <p className="text-lg font-bold text-pink-400">{shopInfo.total_favorers?.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">Favorites</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="w-full py-3 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 text-sm"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="animate-spin w-5 h-5" />
                                Running 8-Step Intelligence Analysis...
                            </>
                        ) : (
                            <>
                                <Zap className="w-5 h-5" />
                                Run Cluster Intelligence Analysis
                            </>
                        )}
                    </button>

                    {isAnalyzing && (
                        <div className="text-center text-slate-400 text-xs animate-pulse">
                            Analyzing {listings.length} listings across 8 intelligence dimensions...
                        </div>
                    )}
                </div>
            )}

            {/* Analysis Results */}
            {analysis && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Cache indicator */}
                    {cacheUsed && (
                        <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/20 p-3 rounded-lg">
                            <span className="text-xs text-cyan-300">⚡ Using cached analysis (24h validity)</span>
                            <button
                                onClick={() => handleRunAnalysis(true)}
                                disabled={isAnalyzing}
                                className="text-xs text-cyan-400 hover:text-white underline"
                            >
                                {isAnalyzing ? 'Re-analyzing...' : 'Force Re-analyze'}
                            </button>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="flex gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                        {[
                            { id: 'overview', label: 'Overview', icon: BarChart3 },
                            { id: 'clusters', label: 'Clusters', icon: Layers },
                            { id: 'risks', label: 'Risks & Conflicts', icon: AlertTriangle },
                            { id: 'roadmap', label: 'Strategic Roadmap', icon: Target },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${activeTab === tab.id
                                    ? 'bg-slate-700 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Cluster Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                                    <p className="text-2xl font-bold text-cyan-400">{analysis.clusters?.length || 0}</p>
                                    <p className="text-xs text-slate-400 mt-1">Clusters Found</p>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                                    <p className="text-2xl font-bold text-emerald-400">
                                        {analysis.clusters?.filter(c => c.classification === 'Dominant').length || 0}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Dominant Clusters</p>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                                    <p className="text-2xl font-bold text-red-400">
                                        {analysis.high_conflict_zones?.length || 0}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Conflict Zones</p>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                                    <p className="text-2xl font-bold text-yellow-400">
                                        {analysis.structural_risks?.length || 0}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Structural Risks</p>
                                </div>
                            </div>

                            {/* Cluster Authority Map */}
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                                    Cluster Authority Map
                                </h3>
                                <div className="space-y-3">
                                    {analysis.clusters?.map((cluster, i) => (
                                        <div key={i} className="flex items-center gap-4">
                                            <div className="w-48 text-sm text-slate-300 truncate">{cluster.cluster_name}</div>
                                            <div className="flex-1 bg-slate-900 rounded-full h-5 overflow-hidden">
                                                <div
                                                    className={`h-full ${getScoreBar(cluster.authority_score)} rounded-full transition-all duration-1000`}
                                                    style={{ width: `${Math.max(cluster.authority_score, 5)}%` }}
                                                />
                                            </div>
                                            <div className={`w-12 text-right font-bold text-sm ${getScoreColor(cluster.authority_score)}`}>
                                                {Math.round(cluster.authority_score)}
                                            </div>
                                            <span className={`px-2 py-0.5 text-xs rounded-full border ${getClassBadge(cluster.classification)}`}>
                                                {cluster.classification}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Quick Actions */}
                            {analysis.strategic_recommendations && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                                            <h4 className="text-sm font-semibold text-emerald-300">Expand Next</h4>
                                        </div>
                                        <p className="text-xs text-slate-300">{analysis.strategic_recommendations.expand_next}</p>
                                    </div>
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Shield className="w-4 h-4 text-yellow-400" />
                                            <h4 className="text-sm font-semibold text-yellow-300">Consolidate</h4>
                                        </div>
                                        <p className="text-xs text-slate-300">{analysis.strategic_recommendations.consolidate}</p>
                                    </div>
                                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Zap className="w-4 h-4 text-purple-400" />
                                            <h4 className="text-sm font-semibold text-purple-300">New Cluster</h4>
                                        </div>
                                        <p className="text-xs text-slate-300">{analysis.strategic_recommendations.new_cluster_opportunity}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CLUSTERS TAB */}
                    {activeTab === 'clusters' && (
                        <div className="space-y-4">
                            {analysis.clusters?.map((cluster, i) => (
                                <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                                    {/* Cluster Header */}
                                    <button
                                        onClick={() => toggleCluster(i)}
                                        className="w-full p-4 flex items-center justify-between hover:bg-slate-750 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cluster.classification === 'Dominant' ? 'bg-emerald-500/20' :
                                                cluster.classification === 'Growing' ? 'bg-blue-500/20' :
                                                    cluster.classification === 'Weak' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                                                }`}>
                                                <Layers className={`w-5 h-5 ${cluster.classification === 'Dominant' ? 'text-emerald-400' :
                                                    cluster.classification === 'Growing' ? 'text-blue-400' :
                                                        cluster.classification === 'Weak' ? 'text-yellow-400' : 'text-red-400'
                                                    }`} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">{cluster.cluster_name}</h3>
                                                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                                                    <span>{cluster.listing_count} listings</span>
                                                    {cluster.total_views != null && (
                                                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{cluster.total_views?.toLocaleString()}</span>
                                                    )}
                                                    {cluster.total_favorites != null && (
                                                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{cluster.total_favorites?.toLocaleString()}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className={`text-lg font-bold ${getScoreColor(cluster.authority_score)}`}>
                                                    {Math.round(cluster.authority_score)}
                                                </p>
                                                <span className={`px-2 py-0.5 text-xs rounded-full border ${getClassBadge(cluster.classification)}`}>
                                                    {cluster.classification}
                                                </span>
                                            </div>
                                            {expandedClusters.has(i) ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                        </div>
                                    </button>

                                    {/* Cluster Expanded Content */}
                                    {expandedClusters.has(i) && (
                                        <div className="p-4 pt-0 space-y-4 border-t border-slate-700/50">
                                            {/* Anchor Listing */}
                                            {cluster.anchor_listing && (
                                                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Star className="w-4 h-4 text-amber-400" />
                                                        <span className="text-xs font-semibold text-amber-300">Anchor Listing</span>
                                                    </div>
                                                    <p className="text-sm text-slate-200">{cluster.anchor_listing.title}</p>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        ID: {cluster.anchor_listing.listing_id} • Performance Score: {cluster.anchor_listing.performance_score}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Listings in Cluster */}
                                            {cluster.listings && cluster.listings.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Listings ({cluster.listings.length})</h4>
                                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                                        {cluster.listings.map((listing, j) => (
                                                            <div key={j} className="flex items-center justify-between py-1.5 px-2 bg-slate-900/50 rounded text-xs">
                                                                <span className="text-slate-300 truncate flex-1">{listing.title}</span>
                                                                {listing.primary_identity && (
                                                                    <span className="text-cyan-400 ml-2 text-xs shrink-0">{listing.primary_identity}</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Cannibalization Flags */}
                                            {cluster.cannibalization_flags && cluster.cannibalization_flags.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-red-400 uppercase mb-2 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> Cannibalization Flags
                                                    </h4>
                                                    <ul className="space-y-1">
                                                        {cluster.cannibalization_flags.map((flag, j) => (
                                                            <li key={j} className="text-xs text-red-300 bg-red-500/10 px-3 py-1.5 rounded">⚠ {flag}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Expansion Opportunities */}
                                            {cluster.expansion_opportunities && cluster.expansion_opportunities.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-emerald-400 uppercase mb-2 flex items-center gap-1">
                                                        <TrendingUp className="w-3 h-3" /> Expansion Opportunities
                                                    </h4>
                                                    <ul className="space-y-1">
                                                        {cluster.expansion_opportunities.map((opp, j) => (
                                                            <li key={j} className="text-xs text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded">✦ {opp}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Underperformers */}
                                            {cluster.underperformers && cluster.underperformers.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-yellow-400 uppercase mb-2">Underperformers</h4>
                                                    <ul className="space-y-1">
                                                        {cluster.underperformers.map((up, j) => (
                                                            <li key={j} className="text-xs text-yellow-300 bg-yellow-500/10 px-3 py-1.5 rounded">
                                                                <span className="text-slate-300">{up.title}</span>
                                                                <span className="text-yellow-400 ml-2">— {up.reason}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* RISKS & CONFLICTS TAB */}
                    {activeTab === 'risks' && (
                        <div className="space-y-6">
                            {/* High Conflict Zones */}
                            {analysis.high_conflict_zones && analysis.high_conflict_zones.length > 0 && (
                                <div className="bg-slate-800 p-6 rounded-xl border border-red-500/30">
                                    <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        High Conflict Zones ({analysis.high_conflict_zones.length})
                                    </h3>
                                    <div className="space-y-3">
                                        {analysis.high_conflict_zones.map((zone, i) => (
                                            <div key={i} className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-sm font-semibold text-red-300">{zone.cluster}</h4>
                                                    <span className="text-xs text-red-400">{zone.affected_listings?.length || 0} listings affected</span>
                                                </div>
                                                <p className="text-xs text-slate-300 mb-2">{zone.description}</p>
                                                <div className="bg-slate-900/50 p-2 rounded text-xs text-cyan-300">
                                                    💡 {zone.recommendation}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Structural Risks */}
                            {analysis.structural_risks && analysis.structural_risks.length > 0 && (
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-yellow-400" />
                                        Structural Risks ({analysis.structural_risks.length})
                                    </h3>
                                    <div className="space-y-3">
                                        {analysis.structural_risks.map((risk, i) => (
                                            <div key={i} className="bg-slate-900/50 border border-slate-700 p-4 rounded-lg">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-sm font-semibold text-white">{risk.risk}</h4>
                                                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadge(risk.severity)}`}>
                                                        {risk.severity}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-300">{risk.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Weak & Overloaded Clusters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {analysis.weak_clusters && analysis.weak_clusters.length > 0 && (
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
                                        <h4 className="text-sm font-semibold text-yellow-300 mb-2">Weak Clusters</h4>
                                        <ul className="space-y-1">
                                            {analysis.weak_clusters.map((c, i) => (
                                                <li key={i} className="text-xs text-slate-300">⚠ {c}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {analysis.overloaded_clusters && analysis.overloaded_clusters.length > 0 && (
                                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                                        <h4 className="text-sm font-semibold text-red-300 mb-2">Overloaded Clusters</h4>
                                        <ul className="space-y-1">
                                            {analysis.overloaded_clusters.map((c, i) => (
                                                <li key={i} className="text-xs text-slate-300">🔴 {c}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* No risks */}
                            {(!analysis.high_conflict_zones || analysis.high_conflict_zones.length === 0) &&
                                (!analysis.structural_risks || analysis.structural_risks.length === 0) && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-xl text-center">
                                        <Shield className="w-12 h-12 mx-auto text-emerald-400 mb-2" />
                                        <p className="text-emerald-300 font-semibold">No major risks detected</p>
                                        <p className="text-xs text-slate-400 mt-1">Your shop structure looks healthy</p>
                                    </div>
                                )}
                        </div>
                    )}

                    {/* ROADMAP TAB */}
                    {activeTab === 'roadmap' && analysis.strategic_recommendations && (
                        <div className="space-y-6">
                            {/* Quick Strategy Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                                        <h4 className="text-sm font-bold text-emerald-300">Expand Next</h4>
                                    </div>
                                    <p className="text-sm text-slate-300">{analysis.strategic_recommendations.expand_next}</p>
                                </div>
                                <div className="bg-yellow-500/10 border border-yellow-500/20 p-5 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Shield className="w-5 h-5 text-yellow-400" />
                                        <h4 className="text-sm font-bold text-yellow-300">Consolidate</h4>
                                    </div>
                                    <p className="text-sm text-slate-300">{analysis.strategic_recommendations.consolidate}</p>
                                </div>
                            </div>

                            {/* New Cluster Opportunity */}
                            {analysis.strategic_recommendations.new_cluster_opportunity && (
                                <div className="bg-purple-500/10 border border-purple-500/20 p-5 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Zap className="w-5 h-5 text-purple-400" />
                                        <h4 className="text-sm font-bold text-purple-300">New Cluster Opportunity</h4>
                                    </div>
                                    <p className="text-sm text-slate-300">{analysis.strategic_recommendations.new_cluster_opportunity}</p>
                                </div>
                            )}

                            {/* Differentiation Suggestions */}
                            {analysis.strategic_recommendations.differentiate_listings && analysis.strategic_recommendations.differentiate_listings.length > 0 && (
                                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <Target className="w-4 h-4 text-cyan-400" />
                                        Listings to Differentiate
                                    </h4>
                                    <div className="space-y-2">
                                        {analysis.strategic_recommendations.differentiate_listings.map((item, i) => (
                                            <div key={i} className="bg-slate-900/50 p-3 rounded-lg text-xs">
                                                <span className="text-cyan-400">Listing {item.listing_id}:</span>
                                                <span className="text-slate-300 ml-2">{item.suggestion}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 30-Day & 90-Day Plans */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {analysis.strategic_recommendations.thirty_day_plan && (
                                    <div className="bg-slate-800 p-5 rounded-xl border border-cyan-500/30">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-5 h-5 text-cyan-400" />
                                                <h4 className="text-sm font-bold text-cyan-300">30-Day Action Plan</h4>
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(analysis.strategic_recommendations.thirty_day_plan, '30day')}
                                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                                            >
                                                {copiedField === '30day' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === '30day' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                                            {analysis.strategic_recommendations.thirty_day_plan}
                                        </p>
                                    </div>
                                )}
                                {analysis.strategic_recommendations.ninety_day_plan && (
                                    <div className="bg-slate-800 p-5 rounded-xl border border-purple-500/30">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Target className="w-5 h-5 text-purple-400" />
                                                <h4 className="text-sm font-bold text-purple-300">90-Day Authority Plan</h4>
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(analysis.strategic_recommendations.ninety_day_plan, '90day')}
                                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                                            >
                                                {copiedField === '90day' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === '90day' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                                            {analysis.strategic_recommendations.ninety_day_plan}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Export Full Analysis */}
                            <div className="text-center">
                                <button
                                    onClick={() => {
                                        const fullReport = JSON.stringify(analysis, null, 2);
                                        copyToClipboard(fullReport, 'full');
                                    }}
                                    className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium flex items-center gap-2 mx-auto transition-colors"
                                >
                                    {copiedField === 'full' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copiedField === 'full' ? 'Copied Full Report!' : 'Copy Full JSON Report'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Re-analyze button */}
                    <div className="text-center">
                        <button
                            onClick={() => {
                                setAnalysis(null);
                                setActiveTab('overview');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
                        >
                            ← Back to shop data
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EtsyClusterAnalyzer;
