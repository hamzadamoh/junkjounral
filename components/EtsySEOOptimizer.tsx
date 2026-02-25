import React, { useState } from 'react';
import { Search, Loader2, Sparkles, Copy, Check, ExternalLink, Wand2, Tag, FileText, Type, ChevronLeft } from 'lucide-react';

interface ScrapedDetails {
    title: string;
    description: string;
    tags: string[];
    imageUrl?: string;
    listingId?: string;
}

interface OptimizedDetails {
    title: string;
    description: string;
    tags: string[];
}

interface EtsySEOOptimizerProps {
    onClose?: () => void;
}

const EtsySEOOptimizer: React.FC<EtsySEOOptimizerProps> = ({ onClose }) => {
    const [url, setUrl] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [scrapedData, setScrapedData] = useState<ScrapedDetails | null>(null);
    const [optimizedData, setOptimizedData] = useState<OptimizedDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const handleScrape = async () => {
        if (!url.trim()) return;

        setIsScraping(true);
        setError(null);
        setScrapedData(null);
        setOptimizedData(null);

        try {
            const response = await fetch('/api/etsy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'scrape-details', url: url.trim() }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to scrape listing');
            }

            const data = await response.json();
            setScrapedData(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleOptimize = async () => {
        if (!scrapedData) return;

        setIsOptimizing(true);
        setError(null);

        const prompt = `
Act as an Etsy SEO Expert specializing in the "2026 Etsy Model".
Optimize this Etsy listing following these STRICT rules:

═══ TITLE RULES (MUST be 120-140 characters — use the FULL Etsy limit!) ═══
- Etsy allows up to 140 characters. You MUST use at least 120 characters. A short title wastes SEO opportunity.
- First 50-70 characters: strongest buyer-intent phrase.
- Structure: [Primary Keyword Phrase], [Secondary Buyer Phrase] [Style/Theme Words] [Format Clarifier] [Additional Keywords]
- Use natural language, NOT keyword stacking. But DO fill the space with useful descriptors.
- One dominant phrase + 2-3 supporting phrases + style/theme words to reach 140 chars.
- Avoid excessive punctuation. Keep it smooth and readable.
- EXAMPLE (104 chars): "Rustic Greenhouse Junk Journal Kit Printable, Vintage Garden Ephemera Pages Cottagecore Digital Download"
- BETTER (133 chars): "Rustic Greenhouse Junk Journal Kit Printable, Vintage Garden Ephemera Pages Cottagecore Digital Download Botanical Scrapbook Paper"
- Count your characters! If under 120, add more relevant descriptors.

═══ TAG RULES (exactly 13 tags) ═══
- CRITICAL: Each tag must be MAX 20 characters (Etsy hard limit). Count carefully!
- Use full phrases (2-3 words), never single words.
- Cover DIFFERENT search angles — do NOT repeat similar phrases.
- Do NOT duplicate phrases already in the title.
- Example good tags: "rustic journal kit", "vintage ephemera", "garden scrapbook", "cottagecore paper", "botanical journal", "floral junk pages", "shabby chic art", "paper kit print", "garden craft kit", "digital ephemera", "antique garden art", "junk journal pages", "greenhouse print"

═══ DESCRIPTION RULES (MODIFY, do NOT replace) ═══
- Take the EXISTING description below and IMPROVE it, keeping its structure, sections, emojis, and formatting.
- Rewrite the first 2 sentences to be SEO-critical (Google pulls from here). Make them natural, clear, and buyer-focused.
- Include: What it is, who it's for, style it fits, how it's used, format clarity.
- Keep all existing sections (What You'll Receive, Perfect For, download info, copyright, etc.)
- Improve wording for SEO without keyword stuffing.
- Do NOT repeat the exact title in the description.
- The description should be LONG and detailed (at least 800 characters), preserving the seller's original content structure.

═══ INPUT DATA ═══
Title: ${scrapedData.title}
Description (PRESERVE AND MODIFY THIS):
${scrapedData.description.substring(0, 2000)}
Current Tags: ${scrapedData.tags.join(', ')}

═══ OUTPUT (JSON ONLY) ═══
{
  "title": "optimized title 100-140 chars",
  "description": "full modified description preserving original structure",
  "tags": ["tag1 max20", "tag2 max20", ... exactly 13 tags]
}
`;

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are an Etsy SEO expert. Respond only with valid JSON. Use the keys: "title", "description", and "tags".' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                }),
            });

            if (!response.ok) throw new Error('Failed to optimize with AI');
            const result = await response.json();
            let content = result.choices[0].message.content;

            // Clean markdown code blocks if present
            if (content.includes('```')) {
                content = content.replace(/```json|```/g, '').trim();
            }

            const aiResponse = JSON.parse(content);
            setOptimizedData(aiResponse);
        } catch (err: any) {
            setError('AI Optimization failed: ' + err.message);
        } finally {
            setIsOptimizing(false);
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 bg-slate-900 text-slate-100 min-h-screen">
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
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent flex items-center justify-center gap-3">
                    <Sparkles className="text-purple-400" />
                    Etsy SEO Optimizer 2026
                </h1>
                <p className="text-slate-400">Optimize your listings using 2026 SEO guidelines and AI</p>
            </header>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Paste Etsy Listing URL (e.g., https://www.etsy.com/listing/123456...)"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        />
                    </div>
                    <button
                        onClick={handleScrape}
                        disabled={isScraping || !url}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg font-semibold flex items-center gap-2 transition-colors"
                    >
                        {isScraping ? <Loader2 className="animate-spin w-5 h-5" /> : 'Load Listing'}
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {scrapedData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Current Metadata */}
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-300">
                            <ExternalLink className="w-5 h-5" />
                            Current Listing
                        </h2>

                        {scrapedData.imageUrl && (
                            <img src={scrapedData.imageUrl} alt="Listing" className="w-full h-48 object-cover rounded-lg border border-slate-700" />
                        )}

                        <div className="space-y-4">
                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Title</label>
                                <p className="text-sm p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">{scrapedData.title}</p>
                            </section>

                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Tags ({scrapedData.tags.length})</label>
                                <div className="flex flex-wrap gap-2">
                                    {scrapedData.tags.map((tag, i) => (
                                        <span key={i} className="text-xs px-2 py-1 bg-slate-700/50 rounded border border-slate-600/50">{tag}</span>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Description Snippet</label>
                                <p className="text-xs p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 line-clamp-4">{scrapedData.description}</p>
                            </section>
                        </div>

                        <button
                            onClick={handleOptimize}
                            disabled={isOptimizing}
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all active:scale-95"
                        >
                            {isOptimizing ? <Loader2 className="animate-spin w-5 h-5" /> : <><Wand2 className="w-5 h-5" /> Optimize for 2026 Model</>}
                        </button>
                    </div>

                    {/* Optimized Metadata */}
                    <div className={`bg-slate-800 p-6 rounded-xl border-2 ${optimizedData ? 'border-amber-500/50 shadow-amber-900/10' : 'border-dashed border-slate-700'} flex flex-col justify-center`}>
                        {!optimizedData && !isOptimizing ? (
                            <div className="text-center space-y-3 opacity-50">
                                <Sparkles className="w-12 h-12 mx-auto text-slate-600" />
                                <p>Click optimize to see AI recommendations</p>
                            </div>
                        ) : optimizedData ? (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-400">
                                    <Sparkles className="w-5 h-5" />
                                    Optimized Result
                                </h2>

                                <div className="space-y-4">
                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Type className="w-3.0 h-3.0" /> Optimized Title
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.title, 'title')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'title' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="text-sm p-3 bg-slate-900 border border-amber-500/20 rounded-lg text-amber-50 shadow-inner">{optimizedData.title}</p>
                                    </section>

                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Tag className="w-3.0 h-3.0" /> Optimized Tags (13)
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.tags.join(', '), 'tags')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'tags' ? 'Copied' : 'Copy All'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                                            {optimizedData.tags.map((tag, i) => (
                                                <span key={i} className="text-xs px-2 py-1 bg-amber-500/10 text-amber-200 rounded border border-amber-500/20">{tag}</span>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <FileText className="w-3.0 h-3.0" /> Optimized Description
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.description, 'description')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'description' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'description' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="text-xs p-3 bg-slate-900 border border-amber-500/20 rounded-lg text-slate-300 h-64 overflow-y-auto whitespace-pre-wrap shadow-inner leading-relaxed">
                                            {optimizedData.description}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <Loader2 className="w-12 h-12 mx-auto animate-spin text-purple-500" />
                                <p className="text-slate-400 animate-pulse">Consulting 2026 SEO Guidelines...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EtsySEOOptimizer;
