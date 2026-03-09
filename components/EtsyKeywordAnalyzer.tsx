import React, { useState, useMemo } from 'react';
import {
    Upload,
    Table as TableIcon,
    Filter,
    Check,
    Copy,
    Sparkles,
    ChevronRight,
    X,
    BarChart3,
    ArrowRight,
    Search
} from 'lucide-react';
import Papa from 'papaparse';

interface KeywordData {
    keyword: string;
    vol: number;
    competition: number;
    score: number;
    new_volume?: number;
    cpc?: number;
    id?: string;
    created_at?: string;
    updated_at?: string;
}

interface EtsyKeywordAnalyzerProps {
    onClose: () => void;
}

const EtsyKeywordAnalyzer: React.FC<EtsyKeywordAnalyzerProps> = ({ onClose }) => {
    const [data, setData] = useState<KeywordData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [maxCompetition, setMaxCompetition] = useState(40);
    const [minVolume, setMinVolume] = useState(100);
    const [minScore, setMinScore] = useState(0);
    const [selectedKeywords, setSelectedKeywords] = useState<KeywordData[]>([]);
    const [generatedTitle, setGeneratedTitle] = useState<{
        title: string;
        characterCount: number;
        strings: { string: string; anchor: string }[];
    } | null>(null);
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [useOpenRouter, setUseOpenRouter] = useState(true);

    // --- STEP 1: CSV Upload & Parse ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);

        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsedData = results.data as KeywordData[];
                console.log("Parsed CSV Data:", parsedData);

                // Validate columns
                if (parsedData.length > 0) {
                    const firstRow = parsedData[0];
                    if (!('keyword' in firstRow) || !('vol' in firstRow) || !('competition' in firstRow)) {
                        setError("Invalid CSV format. Required columns: keyword, vol, competition, score");
                        setIsLoading(false);
                        return;
                    }
                }

                setData(parsedData);
                setIsLoading(false);
            },
            error: (error) => {
                setError(`Failed to parse CSV: ${error.message}`);
                setIsLoading(false);
            }
        });
    };

    // --- STEP 2: Filtering & Sorting ---
    const filteredData = useMemo(() => {
        return data
            .filter(item =>
                item.competition <= maxCompetition &&
                item.vol >= minVolume &&
                (item.score || 0) >= minScore
            )
            .sort((a, b) => b.vol - a.vol);
    }, [data, maxCompetition, minVolume, minScore]);

    // Identification of "Golden Keywords" (Top 10)
    const goldenKeywords = useMemo(() => {
        return filteredData.slice(0, 10).map(k => k.keyword);
    }, [filteredData]);

    const handleKeywordToggle = (keyword: KeywordData) => {
        if (selectedKeywords.find(k => k.keyword === keyword.keyword)) {
            setSelectedKeywords(prev => prev.filter(k => k.keyword !== keyword.keyword));
        } else if (selectedKeywords.length < 3) {
            setSelectedKeywords(prev => [...prev, keyword]);
        }
    };

    // --- SHARED TRIMMER LOGIC (Step 5) ---
    const enforceTitleRules = (title: string): string => {
        let result = title;

        // 1. Character Limit Enforcement
        if (result.length > 140) {
            const strings = result.split(",");
            while (strings.join(",").length > 140 && strings.length > 1) {
                const lastString = strings[strings.length - 1].trim();
                const words = lastString.split(" ");
                if (words.length <= 2) {
                    strings.pop();
                } else {
                    strings[strings.length - 1] = words.slice(0, -1).join(" ");
                }
            }
            result = strings.join(",").trim().replace(/,\s*$/, "");
        }

        // 2. Final Noun Rule
        const validFinalNouns = ['kit', 'pages', 'supplies', 'collection', 'ephemera', 'journal', 'pack', 'bundle', 'sheets', 'prints', 'art', 'craft', 'design'];
        const currentWords = result.split(" ");
        const lastWord = currentWords[currentWords.length - 1].toLowerCase().replace(/[^a-z]/g, "");

        if (!validFinalNouns.includes(lastWord)) {
            // Check if the last word is logically a subset (e.g., "bundle" in "bundle-kit") - simplistic check
            const isNounLike = validFinalNouns.some(n => lastWord.includes(n));
            if (!isNounLike) {
                result = `${result} journal kit`;
                // Re-enforce limit after adding noun
                if (result.length > 140) {
                    return enforceTitleRules(result); // Recursive fix
                }
            }
        }

        return result.trim().replace(/,\s*$/, "");
    };

    // --- STEP 4: Build Title (Nick Method) ---
    const buildTitle = async () => {
        if (selectedKeywords.length < 1) return;

        setIsGeneratingTitle(true);
        setError(null);

        const prompt = `
You are an Etsy SEO title builder using the Nick Method.

The user has selected these ${selectedKeywords.length} high-value anchor keywords from real Etsy search volume data:
${selectedKeywords.map((k, i) => `${i + 1}. ${k.keyword} (vol: ${k.vol}, competition: ${k.competition})`).join('\n')}

Build an Etsy product title following these STRICT rules:

1. Must be 130-140 characters total
2. Must contain exactly 3-4 comma-separated keyword strings
3. Each string format: [descriptor] [descriptor] [anchor]
4. Each selected keyword must appear in the title as an anchor
5. Add descriptive words around each anchor based on context
6. NO connector words: no "and", "for", "with", "to", "the"
7. NO fulfillment phrases: no "digital download", "instant download"
8. Final word must be a noun (kit, pages, supplies, collection, etc.)
9. No string should be 100% repeated words from another string

Return ONLY a JSON object:
{
  "title": "your title here",
  "characterCount": 134,
  "strings": [
    {"string": "first keyword string", "anchor": "anchor phrase"},
    {"string": "second keyword string", "anchor": "anchor phrase"},
    {"string": "third keyword string", "anchor": "anchor phrase"}
  ]
}
`;

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: useOpenRouter ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o',
                    isOpenRouter: useOpenRouter,
                    messages: [
                        { role: 'system', content: 'You are an Etsy SEO expert. Respond ONLY with valid JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) throw new Error("API request failed");

            const result = await response.json();
            let content = result.choices[0].message.content;
            if (content.includes('```')) content = content.replace(/```json|```/g, '').trim();

            const rawData = JSON.parse(content);

            // Apply Step 5 Trimmer logic
            const finalTitle = enforceTitleRules(rawData.title);

            setGeneratedTitle({
                ...rawData,
                title: finalTitle,
                characterCount: finalTitle.length
            });
        } catch (err: any) {
            setError(err.message || "Failed to generate title");
        } finally {
            setIsGeneratingTitle(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        // Simple visual feedback could go here
    };

    return (
        <div className="bg-gothic-900 min-h-screen text-slate-200 p-6 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center border-b border-gothic-gold/20 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gothic-gold/20 rounded-lg">
                            <BarChart3 className="text-gothic-gold" size={24} />
                        </div>
                        <h1 className="text-2xl font-serif text-slate-100">📊 Keyword Research & Title Builder</h1>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Sidebar: Filters & Selection */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* File Upload */}
                        <div className="bg-gothic-800 p-5 rounded-xl border border-slate-700 shadow-xl">
                            <h3 className="text-sm font-serif text-gothic-gold uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Upload size={16} /> 1. Upload CSV
                            </h3>
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg hover:border-gothic-gold transition-colors cursor-pointer group">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Upload size={24} className="text-slate-500 group-hover:text-gothic-gold mb-2" />
                                    <p className="text-xs text-slate-400">Click to upload .csv</p>
                                </div>
                                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                            </label>
                        </div>

                        {/* Filters */}
                        <div className="bg-gothic-800 p-5 rounded-xl border border-slate-700 shadow-xl space-y-4">
                            <h3 className="text-sm font-serif text-gothic-gold uppercase tracking-wider flex items-center gap-2">
                                <Filter size={16} /> 2. Filters
                            </h3>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">Max Competition</span>
                                    <span className="text-gothic-gold font-bold">{maxCompetition}</span>
                                </div>
                                <input
                                    type="range" min="0" max="1000" step="5"
                                    value={maxCompetition}
                                    onChange={(e) => setMaxCompetition(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-gothic-gold"
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="text-xs text-slate-400">Min Search Volume</span>
                                <input
                                    type="number"
                                    value={minVolume}
                                    onChange={(e) => setMinVolume(parseInt(e.target.value) || 0)}
                                    className="w-full bg-gothic-900 border border-slate-700 rounded p-2 text-sm focus:outline-none focus:border-gothic-gold"
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="text-xs text-slate-400">Min Score</span>
                                <input
                                    type="number"
                                    value={minScore}
                                    onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
                                    className="w-full bg-gothic-900 border border-slate-700 rounded p-2 text-sm focus:outline-none focus:border-gothic-gold"
                                />
                            </div>
                        </div>

                        {/* Selected Anchors */}
                        <div className="bg-gothic-800 p-5 rounded-xl border-2 border-gothic-gold/30 shadow-xl space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-serif text-gothic-gold uppercase tracking-wider">
                                    Selected Anchors
                                </h3>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedKeywords.length === 3 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {selectedKeywords.length}/3
                                </span>
                            </div>

                            <div className="space-y-2">
                                {selectedKeywords.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic">Select 3 keywords from the table to build your title.</p>
                                ) : (
                                    selectedKeywords.map((k, i) => (
                                        <div key={i} className="flex items-center justify-between bg-gothic-900/50 p-2 rounded border border-slate-700">
                                            <span className="text-xs text-slate-200 truncate pr-2">{k.keyword}</span>
                                            <button
                                                onClick={() => handleKeywordToggle(k)}
                                                className="text-slate-500 hover:text-red-400"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            {selectedKeywords.length === 3 && (
                                <button
                                    onClick={buildTitle}
                                    disabled={isGeneratingTitle}
                                    className="w-full mt-4 bg-gradient-to-r from-gothic-gold to-amber-600 hover:from-amber-500 hover:to-amber-700 text-black font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isGeneratingTitle ? (
                                        <span className="flex items-center gap-2">
                                            <Sparkles className="animate-spin" size={18} /> Building...
                                        </span>
                                    ) : (
                                        <>
                                            <Sparkles size={18} /> Build Title
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Main Table Area */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Title Builder Result */}
                        {generatedTitle && (
                            <div className="bg-gradient-to-br from-gothic-800 to-slate-900 border-2 border-gothic-gold rounded-xl p-6 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gothic-gold/5 blur-3xl rounded-full"></div>

                                <div className="flex justify-between items-start mb-4">
                                    <div className="space-y-1">
                                        <h3 className="text-xs font-serif text-gothic-gold uppercase tracking-widest">Optimized Nick Method Title</h3>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-2xl font-serif text-white">{generatedTitle.title}</h4>
                                            <span className={`text-xs px-2 py-1 rounded font-bold ${generatedTitle.characterCount >= 130 && generatedTitle.characterCount <= 140 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                                {generatedTitle.characterCount} chars
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCopy(generatedTitle.title)}
                                        className="p-2 bg-gothic-900/50 hover:bg-gothic-gold/20 rounded-lg border border-slate-700 transition-all text-slate-400 hover:text-gothic-gold"
                                        title="Copy optimized title"
                                    >
                                        <Copy size={20} />
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-4">
                                    {generatedTitle.strings.map((str, idx) => (
                                        <div
                                            key={idx}
                                            className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-2 ${idx === 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
                                                    idx === 1 ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' :
                                                        'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                                }`}
                                        >
                                            <span className="opacity-60">{idx + 1}.</span>
                                            <span className="font-semibold">{str.string}</span>
                                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-white/10 rounded">{str.anchor}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm flex items-center gap-3">
                                <X size={18} className="flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                <TableIcon className="text-gothic-gold/20 animate-pulse" size={64} />
                                <p className="text-slate-400">Parsing data scroll...</p>
                            </div>
                        ) : data.length === 0 ? (
                            <div className="bg-gothic-800/50 border-2 border-dashed border-slate-700 rounded-2xl py-20 flex flex-col items-center justify-center space-y-4">
                                <div className="p-4 bg-slate-900 rounded-full">
                                    <TableIcon size={32} className="text-slate-700" />
                                </div>
                                <div className="text-center">
                                    <p className="text-slate-100 font-serif text-lg">No CSV Data</p>
                                    <p className="text-slate-500 text-sm max-w-xs">Upload your Etsy keyword spreadsheet to begin analyzing opportunities.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gothic-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                                <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
                                    <h3 className="text-sm font-serif text-slate-300 flex items-center gap-2">
                                        <ChevronRight size={16} className="text-gothic-gold" />
                                        Displaying {filteredData.length} opportunities (Sorted by Volume)
                                    </h3>
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 bg-green-500/20 border border-green-500/50 rounded-full"></div>
                                            <span className="text-slate-400">Golden Keyword</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 bg-gothic-gold/20 border border-gothic-gold/50 rounded-full"></div>
                                            <span className="text-slate-400">Selected</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="max-h-[600px] overflow-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-gothic-950 text-slate-400 text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4 font-semibold">Keyword</th>
                                                <th className="px-4 py-4 font-semibold text-center">Volume</th>
                                                <th className="px-4 py-4 font-semibold text-center">Comp</th>
                                                <th className="px-4 py-4 font-semibold text-center">Score</th>
                                                <th className="px-6 py-4 font-semibold text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {filteredData.map((item, idx) => {
                                                const isGolden = goldenKeywords.includes(item.keyword);
                                                const isSelected = selectedKeywords.some(k => k.keyword === item.keyword);

                                                return (
                                                    <tr
                                                        key={idx}
                                                        className={`transition-colors hover:bg-white/5 group ${isSelected ? 'bg-gothic-gold/10' :
                                                                isGolden ? 'bg-green-500/5' : ''
                                                            }`}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`font-medium ${isSelected ? 'text-gothic-gold' :
                                                                        isGolden ? 'text-green-400' : 'text-slate-200'
                                                                    }`}>
                                                                    {item.keyword}
                                                                </span>
                                                                {isGolden && (
                                                                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-500 text-[10px] font-bold rounded border border-green-500/30 uppercase tracking-tighter">Golden</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-center font-mono opacity-80">{item.vol?.toLocaleString()}</td>
                                                        <td className="px-4 py-4 text-center font-mono opacity-80">{item.competition?.toLocaleString()}</td>
                                                        <td className="px-4 py-4 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${(item.score || 0) > 80 ? 'text-green-400 bg-green-400/10' :
                                                                    (item.score || 0) > 50 ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500 bg-slate-500/10'
                                                                }`}>
                                                                {item.score || 0}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <button
                                                                onClick={() => handleKeywordToggle(item)}
                                                                disabled={!isSelected && selectedKeywords.length >= 3}
                                                                className={`p-1.5 rounded-lg border transition-all ${isSelected
                                                                        ? 'bg-gothic-gold text-black border-gothic-gold'
                                                                        : 'border-slate-600 text-slate-400 hover:border-gothic-gold hover:text-gothic-gold disabled:opacity-30 disabled:hover:border-slate-600 disabled:hover:text-slate-400'
                                                                    }`}
                                                            >
                                                                {isSelected ? <Check size={16} /> : <ChevronRight size={16} />}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Control Center (Floating Toolbar) */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gothic-800/95 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl flex items-center gap-1 z-50">
                <button
                    onClick={() => setUseOpenRouter(false)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${!useOpenRouter ? 'bg-gothic-gold text-black shadow-lg shadow-amber-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    GPT-4o
                </button>
                <button
                    onClick={() => setUseOpenRouter(true)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${useOpenRouter ? 'bg-gothic-gold text-black shadow-lg shadow-amber-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Llama-3.3
                </button>
            </div>
        </div>
    );
};

export default EtsyKeywordAnalyzer;
