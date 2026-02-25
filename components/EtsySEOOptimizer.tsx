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

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            'Your goal is to optimize for:',
            '- Search match relevance',
            '- Click-through rate (CTR)',
            '- Conversion rate (CVR)',
            '- Listing quality score',
            '- Long-term shop authority',
            '',
            'Priority formula: Relevance x Click Appeal x Buyer Intent x Conversion Clarity',
            'NOT keyword stuffing.',
            '',
            '=== 1. TITLE OPTIMIZATION (STRATEGIC STRUCTURE) ===',
            '',
            'A. Length Target:',
            '- Ideal range: 125-140 characters',
            '- Never force padding to hit max',
            '- Clarity > character count',
            '',
            'B. First 60 Characters Rule (Mobile Priority Zone):',
            'The first 50-70 characters MUST contain the strongest buyer-intent phrase, clearly define what the product is, and be readable like a product name.',
            'GOOD: "Rustic Greenhouse Junk Journal Kit Printable"',
            'BAD: "Vintage Garden Digital Papers Rustic Greenhouse Junk Journal"',
            '',
            'C. Title Structure Formula (Pro Seller Model):',
            '[Primary Buyer Phrase], [Secondary Niche Angle] [Supporting Descriptor] [Format Clarifier]',
            'Example: "Rustic Greenhouse Junk Journal Kit Printable, Vintage Garden Ephemera Pages Cottagecore Digital Download"',
            'Rules:',
            '- 1 dominant phrase + 2-3 supporting angles max',
            '- Avoid stacking 5-8 equal keywords',
            '- Natural language flow',
            '- 1-3 commas maximum (if needed)',
            '- No keyword dumping',
            '',
            'D. CTR Psychology Layer:',
            'The title must sound like a product someone WANTS. Be specific, not vague. Include aesthetic triggers when relevant (cottagecore, dark academia, fairycore, botanical, gothic, shabby chic, etc.). Etsy now rewards clicks and saves heavily.',
            '',
            '=== 2. TAG STRATEGY (EXPANSION MODEL) ===',
            '',
            'Output exactly 13 tags.',
            '',
            'A. Character Rule: Max 20 characters each. 2-3 words per tag. No single-word tags.',
            '',
            'B. Tag Strategy Framework - do NOT repeat the full title phrase. Expand horizontally into different buyer angles:',
            '1. Alternate product phrasing',
            '2. Aesthetic niche',
            '3. Use-case intent',
            '4. Style variation',
            '5. Broader entry keywords',
            '6. Adjacent audience types',
            '',
            'Example good angles: "botanical journal kit", "garden scrapbook", "cottagecore ephemera", "floral printable pages", "digital paper pack", "shabby chic art", "vintage craft kit"',
            'Example BAD (too repetitive): "junk journal kit", "junk journal printable", "junk journal pages"',
            '',
            'C. Reinforcement Rule (Advanced):',
            'You MAY lightly reinforce part of the main title phrase using a variation in ONE tag.',
            'Example - Title: "Rustic Greenhouse Junk Journal Kit Printable" then Tag allowed: "greenhouse journal kit"',
            'But NOT exact full duplication.',
            '',
            '=== 3. DESCRIPTION OPTIMIZATION (AI + CONVERSION MODEL) ===',
            '',
            'Descriptions influence: Google ranking, buyer confidence, AI product understanding, conversion rate, time on listing (engagement signal).',
            '',
            'A. First 2 Sentences = Google Snippet Zone. Must clearly state what it is, include primary buyer phrase naturally, be readable and persuasive, avoid keyword stacking.',
            'GOOD: "Create a charming botanical journal with this Rustic Greenhouse Junk Journal Kit Printable, featuring vintage garden ephemera and cottagecore-inspired digital papers."',
            'BAD: "Rustic Greenhouse Junk Journal Kit Vintage Garden Digital Papers Scrapbook Papers Printable Ephemera"',
            '',
            'B. Required Content Elements - the description MUST clearly communicate:',
            '- What it is',
            '- Who it is for',
            '- What aesthetic/style it fits',
            '- How it is used',
            '- Format clarity (digital, instant download)',
            '- Commercial/personal use info',
            '',
            'C. Structure Preservation Rule - when optimizing:',
            '- Keep existing sections, formatting, emojis, and bullet lists',
            '- Expand and improve, do NOT delete structure',
            '- Minimum length: 800+ characters',
            '- CRITICAL: Use \\n (newline characters) in the JSON description value to preserve line breaks, section headers, spacing, and paragraph structure',
            '- Each section header (like ### or emoji headers) MUST be on its own line',
            '- Bullet points and numbered lists MUST each be on their own line',
            '- Add blank lines (\\n\\n) between sections for readability',
            '',
            'D. Conversion Layer - add where appropriate:',
            '- Use-case scenarios',
            '- Gift positioning',
            '- Emotional triggers',
            '- Clear digital explanation',
            '- Reassurance statements',
            '',
            '=== 4. WHAT TO AVOID (2026 PENALTY ZONE) ===',
            '- Keyword stuffing',
            '- Robotic phrasing',
            '- Repeating exact title in description',
            '- Extremely broad tags (printable, art, paper)',
            '- Ranking for too many unrelated themes',
            '- Title reading like a keyword list',
            'Etsy AI now detects manipulation patterns.',
            '',
            '=== INPUT DATA ===',
            'Title: ' + scrapedData.title,
            'Description (PRESERVE AND MODIFY - keep structure, sections, emojis):',
            scrapedData.description.substring(0, 2500),
            'Current Tags: ' + scrapedData.tags.join(', '),
            '',
            '=== OUTPUT (JSON ONLY) ===',
            'IMPORTANT: In the description field, use \\n for line breaks to preserve formatting.',
            'Do NOT return the description as one flat paragraph.',
            'Keep sections, headers, bullet points, and emojis each on their own line using \\n.',
            '{',
            '  "title": "optimized title 125-140 chars",',
            '  "description": "first line\\n\\nsecond section\\n- bullet 1\\n- bullet 2",',
            '  "tags": ["13 tags max 20 chars each"]',
            '}',
        ].join('\n');

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are a Pro Seller Level Etsy SEO expert optimizing for the 2026 Etsy AI Search Model. Respond only with valid JSON. Use the keys: "title", "description", and "tags". Optimize for Relevance x Click Appeal x Buyer Intent x Conversion Clarity. CRITICAL: In the description field, use \n (actual newline characters) to preserve line breaks, section headers, spacing, bullets, and paragraph structure. Do NOT return the description as one flat paragraph.' },
                        { role: 'user', content: promptLines }
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

            let aiResponse = JSON.parse(content);

            // Safety net: if title is very short (<110), retry with context
            if (aiResponse.title && aiResponse.title.length < 110) {
                const retryLines = [
                    'Your title is only ' + aiResponse.title.length + ' characters: "' + aiResponse.title + '"',
                    '',
                    'The ideal Etsy title range is 125-140 characters. You have ' + (140 - aiResponse.title.length) + ' unused characters.',
                    '',
                    'Extend this title naturally to 125-140 characters by adding relevant buyer-intent keywords, aesthetic triggers, or format clarifiers that flow with the existing title.',
                    'Follow the Pro Seller structure: [Primary Buyer Phrase], [Secondary Niche Angle] [Supporting Descriptor] [Format Clarifier].',
                    'Do NOT add random words - every word must be relevant.',
                    '',
                    'Return JSON only: { "title": "extended title here" }',
                ].join('\n');

                const retryResponse = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are an Etsy SEO expert. Respond only with valid JSON.' },
                            { role: 'user', content: retryLines }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.7
                    }),
                });

                if (retryResponse.ok) {
                    const retryResult = await retryResponse.json();
                    let retryContent = retryResult.choices[0].message.content;
                    if (retryContent.includes('```')) {
                        retryContent = retryContent.replace(/```json|```/g, '').trim();
                    }
                    const retryData = JSON.parse(retryContent);
                    if (retryData.title && retryData.title.length > aiResponse.title.length) {
                        aiResponse.title = retryData.title.substring(0, 140);
                    }
                }
            }

            // Enforce 140 char hard cap
            if (aiResponse.title && aiResponse.title.length > 140) {
                aiResponse.title = aiResponse.title.substring(0, 140).trim();
            }

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
                                                <Type className="w-3 h-3" /> Optimized Title
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
                                                <Tag className="w-3 h-3" /> Optimized Tags (13)
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
                                                <FileText className="w-3 h-3" /> Optimized Description
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
