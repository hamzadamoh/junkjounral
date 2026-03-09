const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/EtsySEOOptimizer.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add NickMethodReport interface
code = code.replace(
    /interface OptimizedDetails {[\s\S]*?score\?: SEOScore;\n}/,
    `export interface NickMethodReport {
    brainstorm: { descriptive: string[], anchors: string[] };
    titleScore: { total: number, breakdown: string[] };
    tagScore: { total: number, breakdown: string[] };
    totalScore: { score: number, rating: string };
    improvedTitle: string;
    improvedTags: string[];
    badAdviceWarning?: string;
}`
);

// 2. Update state hook
code = code.replace(
    /const \[optimizedData, setOptimizedData\] = useState<OptimizedDetails \| null>\(null\);/,
    `const [optimizedData, setOptimizedData] = useState<NickMethodReport | null>(null);`
);

// 3. Delete handleRefine safely
const refineStart = code.indexOf('const handleRefine = async () => {');
const refineRegex = /const handleRefine = async \(\) => {[\s\S]*?};\n\s*const copyToClipboard/;
code = code.replace(refineRegex, 'const copyToClipboard');

// 4. Update handleOptimize logic entirely
const optimizeFuncRegex = /const handleOptimize = async \(\) => {[\s\S]*?setIsOptimizing\(false\);\n\s*}\n\s*};/;

const newOptimizeFunc = `const handleOptimize = async () => {
        if (!scrapedData) return;

        setError(null);

        // --- PHASE 1: IDENTITY EXTRACTION ---
        let currentIdentity = extractedIdentity;
        if (!currentIdentity) {
            setIsAnalyzingProduct(true);
            try {
                const analysisPrompt = \`You are a product identity extraction engine for an Etsy store that sells 
DIGITAL PRINTABLE JUNK JOURNAL PAGES ONLY.

The store sells themed decorative journal pages (160+ JPGs, 8.5x11, 300 DPI).
Delivery is via a PDF file that contains a Google Drive download link.
All listings include commercial use license.
There are NO physical items, NO kits, NO pockets, NO tags — pages only.

Analyze the listing title, tags, and description provided.
Extract ONLY what is factually present. Do NOT invent motifs or themes.

Return a single JSON object matching this exact structure:

{
  "core_product_type": "junk_journal_pages",
  "format": "digital_printable",
  "delivery_method": "pdf_google_drive_link",
  "file_types": ["JPG"],
  "print_size": "8.5x11",
  "page_count": 160,
  "dpi": "300 DPI",
  "license_type": "commercial_use",
  "primary_theme": "string",
  "theme_synonyms": ["3-5 words buyers use instead of the primary theme. E.g. if theme is 'vintage': ['antique', 'nostalgic', 'retro', 'classic']. If theme is 'cottagecore': ['cottage', 'rustic', 'farmhouse', 'botanical']. Extract based on the actual theme, not examples."],
  "secondary_themes": ["string"],
  "color_palette": ["string"],
  "mood": "string",
  "locked_identity_terms": ["string"],
  "theme_cluster": "string",
  "confidence": 0.9
}

RULES:
- primary_theme is NOT the first adjective in the title.
- primary_theme is the SPECIFIC SUBJECT or VISUAL AESTHETIC that makes this listing unique and different from other junk journal listings.
- To find it, ask: "If I removed this theme word, would this listing look identical to any other junk journal listing?"
- Examples:
  * "Vintage Swatchbook Junk Journal Pages" → primary_theme = "vintage swatchbook" (swatchbook is the specific subject)
  * "Shabby Chic Rose Junk Journal Kit" → primary_theme = "shabby chic rose" (the specific floral aesthetic)
  * "Vintage Junk Journal Pages" → primary_theme = LOOK AT TAGS AND DESCRIPTION to find the specific subject — "vintage" alone is not enough
  * "Sacred Pagan Junk Journal Pages" → primary_theme = "sacred pagan"
- If the title is generic, extract the specific theme from the tags and description instead. Never return a single generic adjective as the primary_theme.
- Minimum: primary_theme must be 2 words.
- primary_theme must be the subject/aesthetic ONLY — never include product words like 'junk journal', 'pages', 'printable', 'digital', 'kit', 'paper', 'scrapbook', 'ephemera', 'download' in the theme. Correct examples: 'cherry blossom', 'vintage swatchbook', 'whimsical cats', 'dark gothic fairy'. Wrong examples: 'cherry junk journal', 'vintage journal pages', 'gothic scrapbook kit'.
- If no theme is present, set primary_theme to "unthemed"
- If secondary_themes are not present, return []
- If confidence is below 0.7, still return the JSON but flag it
- Never add themes that are not explicitly supported by the original listing
- The locked_identity_terms MUST include the primary theme noun and "junk journal pages"
- For theme_synonyms, do not extract generic craft words like 'creative', 'artistic', 'vintage', 'antique'. Instead extract the specific buyer search phrases someone would type into Etsy when looking for THIS specific type of page. Think like a buyer, not a designer. For a swatchbook listing a buyer would search 'color swatch journal pages', 'paint chip printable', 'color palette pages' — not 'creative scrapbooking paper'. Do NOT include format words ('printable', 'digital') alone or invented compound words. Maximum 5 synonyms. If unsure, return fewer — an empty array is better than hallucinated terms.

Do not invent motifs. Do not add aesthetics not present. Only extract what is explicitly implied.

=== ORIGINAL LISTING ===
Title: \${scrapedData.title}
Tags: \${scrapedData.tags.join(', ')}
Description: \${scrapedData.description.substring(0, 2000)}\`;

                const analysisRes = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are an objective product identity extractor.' },
                            { role: 'user', content: analysisPrompt }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.2
                    }),
                });

                if (!analysisRes.ok) throw new Error('Failed to analyze product identity');
                const analysisData = await analysisRes.json();
                let analysisContent = analysisData.choices[0].message.content;
                if (analysisContent.includes('\`\`\`')) {
                    analysisContent = analysisContent.replace(/\`\`\`json|\`\`\`/g, '').trim();
                }
                currentIdentity = JSON.parse(analysisContent) as JunkJournalPagesIdentity;

                // Sanitize primary_theme: strip product words but preserve compound descriptors
                const PRODUCT_WORDS = ['journal', 'junk', 'pages', 'printable', 'digital', 'kit', 'download', 'paper', 'scrapbook', 'ephemera'];
                const GENERIC_ADJECTIVES = new Set(['vintage', 'floral', 'dark', 'light', 'old', 'new', 'cute', 'pretty', 'nice', 'classic', 'modern', 'simple', 'basic', 'fancy', 'colorful', 'pastel', 'retro', 'antique', 'botanical', 'rustic', 'elegant', 'whimsical']);
                if (currentIdentity.primary_theme && currentIdentity.primary_theme !== 'unthemed') {
                    const themeWords = currentIdentity.primary_theme.split(' ');
                    const stripped = themeWords.filter(w => !PRODUCT_WORDS.includes(w.toLowerCase())).join(' ').trim();
                    // Only use stripped version if it leaves 2+ meaningful words,
                    // or if the remaining word is NOT a generic adjective
                    const strippedWords = stripped.split(/\\s+/).filter(w => w.length > 0);
                    if (strippedWords.length >= 2) {
                        currentIdentity.primary_theme = stripped;
                    } else if (strippedWords.length === 1 && !GENERIC_ADJECTIVES.has(strippedWords[0].toLowerCase())) {
                        currentIdentity.primary_theme = stripped;
                    } else {
                        // Stripping would leave a single generic adjective — keep original without product words at edges
                        currentIdentity.primary_theme = currentIdentity.primary_theme.trim();
                    }
                    if (!currentIdentity.primary_theme) currentIdentity.primary_theme = 'unthemed';
                }

                // Sanitize theme_synonyms after extraction — track rejected
                const { valid, rejected } = sanitizeSynonyms(currentIdentity.theme_synonyms || []);
                currentIdentity.theme_synonyms = valid;
                setRejectedSynonyms(rejected);
                setSynonymInput(valid.join(', '));

                setExtractedIdentity(currentIdentity);

                if (currentIdentity.confidence < 0.7) {
                    setShowIdentityConfirmation(true);
                    setIsAnalyzingProduct(false);
                    return; // Pause the pipeline
                }
            } catch (err: any) {
                setError('Identity extraction failed: ' + err.message);
                setIsAnalyzingProduct(false);
                return;
            } finally {
                setIsAnalyzingProduct(false);
            }
        }

        // --- PHASE 1.5: COMPETITOR INTELLIGENCE (PARALLEL SEARCH + PATTERN EXTRACTION) ---
        setIsFetchingInsights(true);
        let insights: CompetitorInsights = {
            searchQuery: \`\${currentIdentity!.primary_theme} junk journal\`,
            themeTitles: []
        };

        try {
            const themeQuery = insights.searchQuery;

            // Single theme-specific search only
            const themeSearchRes = await fetch('/api/etsy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'search-listings', keywords: themeQuery, limit: 10, sort_on: 'score' })
            });

            if (themeSearchRes.ok) {
                const themeData = await themeSearchRes.json();
                insights.themeTitles = (themeData.results || []).slice(0, 10).map((l: any) => l.title);
            }

            // --- Phase 1.5: Relevance Filter — keep only same-product-type listings ---
            if (insights.themeTitles.length > 0) {
                const relevancePrompt = \`My product is a digital printable junk journal pages listing.
My product identity:
- Title: \${scrapedData.title}
- Primary theme: \${currentIdentity!.primary_theme}
- Tags: \${scrapedData.tags.join(', ')}

Here are competitor listings found in search:
\${insights.themeTitles.map((t, i) => \`\${i + 1}. \${t}\`).join('\\n')}

Your task:
1. Understand what my product actually is
2. For each competitor listing, determine if it sells the same TYPE of product (digital printable journal pages/ephemera)
3. Return ONLY the titles of listings that are the same product type as mine
4. Discard listings that sell: stickers, washi tape, physical items, bundles of unrelated items, ATC cards, clipart sheets, fussy cuts, embellishments, tags, pockets, physical craft supplies, or anything that is not printable journal pages/ephemera

Return a JSON object: { "relevantTitles": ["title1", "title2", ...] }\`;

                try {
                    const relevanceRes = await fetch('/api/openai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            messages: [{ role: 'user', content: relevancePrompt }],
                            response_format: { type: 'json_object' },
                            temperature: 0.1
                        }),
                    });

                    if (relevanceRes.ok) {
                        const relevanceData = await relevanceRes.json();
                        let relevanceContent = relevanceData.choices[0].message.content;
                        if (relevanceContent.includes('\`\`\`')) {
                            relevanceContent = relevanceContent.replace(/\`\`\`json|\`\`\`/g, '').trim();
                        }
                        const parsed = JSON.parse(relevanceContent);
                        const filtered = parsed.relevantTitles || [];
                        insights.themeTitles = filtered;
                    }
                } catch (filterErr) {
                    console.warn('Relevance filter failed, using unfiltered titles:', filterErr);
                }
            }

            // Extract descriptive vocabulary from filtered theme results
            if (insights.themeTitles.length > 0) {
                const patternPrompt = \`Analyze these Etsy listing titles that all relate to the theme "\${currentIdentity!.primary_theme}".

Titles:
\${insights.themeTitles.map(t => \`- \${t}\`).join('\\n')}

Extract complete 2-4 word buyer search phrases from these titles.
Always include the product noun in each phrase.
Example: extract 'Paint Palette Ephemera' not just 'Paint Palette'.
Example: extract 'Watercolor Color Palette Papers' not just 'Watercolor Color Palette'.
Example: extract 'Mixed Media Collage Backgrounds' not just 'Mixed Media'.

Ignore generic standalone terms like "Digital Download", "Printable", "Junk Journal".
Only extract phrases that are SPECIFIC to this theme and include a product noun.
EXCLUDE phrases for different product types — no stickers, washi tape, stamps, die cuts, foil, or clipart phrases. This product is PAGES/PAPERS/EPHEMERA only.

Return ONLY a JSON object:
{
  "themePhrases": ["phrase1", "phrase2", "phrase3", "phrase4", "phrase5"]
}\`;

                try {
                    const patternRes = await fetch('/api/openai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            messages: [
                                { role: 'user', content: patternPrompt }
                            ],
                            response_format: { type: 'json_object' },
                            temperature: 0.1
                        }),
                    });

                    if (patternRes.ok) {
                        const patternData = await patternRes.json();
                        let patternContent = patternData.choices[0].message.content;
                        if (patternContent.includes('\`\`\`')) {
                            patternContent = patternContent.replace(/\`\`\`json|\`\`\`/g, '').trim();
                        }
                        insights.extractedPattern = JSON.parse(patternContent);
                    }
                } catch (e) {
                    console.error("Pattern extraction failed", e);
                }
            }

            setCompetitorInsights(insights);

        } catch (err) {
            console.error("Competitor intelligence phase failed silently", err);
        } finally {
            setIsFetchingInsights(false);
        }

        setIsOptimizing(true);
        console.log("Applying Nick Method SEO analysis...");

        const originalViolations = getFormatViolations(scrapedData.title, scrapedData.tags);

        const promptLines = [
            'You are a 2026 Etsy SEO Analyzer and Keyword Brainstormer built on the "Nick Method."',
            '',
            'You will be given an Etsy listing containing a TITLE, TAGS, and a PRODUCT IDENTITY (a factual description of what the product looks like and contains).',
            '',
            originalViolations.length > 0 ? \`WARNING: The words [\${originalViolations.join(', ')}] appear in the original listing but are FACTUALLY INCORRECT. This product is PAGES ONLY. Test every word you generate against this list before outputting. Do not use 'kit', 'set', etc. Replace with 'pages'.\\n\` : '',
            '',
            'Your job has two parts:',
            '',
            '═══════════════════════════════════════',
            'PART 1 — BRAINSTORM WORD CLOUD',
            '═══════════════════════════════════════',
            '',
            'Look at the Product Identity and generate a raw keyword brainstorm.',
            'Do NOT use search volume data, competitor research, or SEO tools.',
            'Base everything only on what the product actually is and looks like.',
            '',
            'Generate two lists:',
            '',
            'DESCRIPTIVE WORDS (15–20 words):',
            'Words describing how the product looks, feels, or makes the buyer feel.',
            'Include tactile, atmospheric, and vibe words (e.g., spooky, eerie, haunted, aged, moody, distressed).',
            '',
            'ANCHOR WORDS (4–6 phrases):',
            'Short phrases describing exactly what the product IS.',
            'These are literal product nouns (e.g., "gothic junk journal pages", "printable journal pages").',
            '',
            'STRICT RULE: Never invent a theme that is not present in the Product Identity.',
            'Accuracy is the #1 priority. Do not add popular keywords that dont match the actual product.',
            '',
            '═══════════════════════════════════════',
            'PART 2 — SEO SCORE + IMPROVEMENT PLAN',
            '═══════════════════════════════════════',
            '',
            'TITLE SCORING (0–30 points):',
            '',
            'Score the original title on these four criteria:',
            '',
            '1. CHARACTER COUNT (0–15 pts)',
            '   - 130–140 chars = 15pts ✅',
            '   - 110–129 chars = 10pts ⚠️',
            '   - 100–109 chars = 5pts ⚠️',
            '   - Under 100 chars = 0pts ❌',
            '   RULE: Always reward longer titles. Never penalize for length. Short titles lose visibility.',
            '',
            '2. KEYWORD STRING STRUCTURE (0–8 pts)',
            '   - 3–4 comma-separated keyword strings = 8pts ✅',
            '   - 2 strings = 4pts ⚠️',
            '   - 5+ strings = 5pts ⚠️',
            '   - 1 block with no structure = 0pts ❌',
            '   Each string should follow: [Descriptive] [Descriptive] [Anchor]',
            '',
            '3. VIBE/TACTILE WORDS (0–4 pts)',
            '   - 2+ atmospheric/tactile words = 4pts ✅',
            '   - 1 vibe word = 2pts ⚠️',
            '   - 0 vibe words = 0pts ❌',
            '   Examples: spooky, eerie, haunted, moody, dark, vintage, rustic, soft, creepy',
            '',
            '4. FULL-STRING REPETITION (0–3 pts)',
            '   - No keyword string is 100% made of words already used in a previous string = 3pts ✅',
            '   - One or more strings are entirely repeated words = 0pts ❌',
            '   NOTE: Slight word repetition across strings is acceptable (70% rule). Only penalize complete string repeats.',
            '',
            'TAG SCORING (0–35 points):',
            '',
            'Score the original tags on these five criteria:',
            '',
            '1. ALL 13 SLOTS FILLED (0–10 pts)',
            '   - 13/13 = 10pts ✅',
            '   - Deduct 2pts per empty slot',
            '',
            '2. CHARACTER LIMIT (0–5 pts)',
            '   - All tags under 20 characters = 5pts ✅',
            '   - Deduct 1pt per tag exceeding 20 characters',
            '   NOTE: Tags over 20 chars are rejected by Etsy entirely.',
            '',
            '3. FIVE Ws COVERAGE (0–15 pts, 3pts per W)',
            '   Classify tags across these five categories:',
            '   - WHO: buyer identity (crafter, artist, teen, goth, scrapbooker)',
            '   - WHAT: product noun (kit, pages, ephemera, printable, journal, supplies)',
            '   - WHERE: usage context (journal, diary, planner, book, album)',
            '   - WHEN: seasonal/timing (halloween, autumn, holiday, seasonal)',
            '   - WHY: purpose or style (aesthetic, gift, decor, craft, art, collage)',
            '   Award 3pts for each W that has at least one tag covering it.',
            '',
            '4. DEAD TAG PENALTY (-2pts each, min score 0)',
            '   Flag any tag that contains ONLY abstract/poetic words with zero buyer-intent signal.',
            '   Examples of dead tags: "midnight whisper", "soul echo", "dream muse", "art therapy"',
            '   RULE: Do NOT penalize tags that seem grammatically odd but contain real product or buyer keywords.',
            '   Cross-matching is Etsys job — two unrelated keywords in one tag box is valid strategy.',
            '',
            '5. CROSS-MATCH DIVERSITY (0–5 pts)',
            '   - Most tags contain 2 combinable keywords = 5pts ✅',
            '   - Several single-word tags present = 2pts ⚠️',
            '   Single-word tags generate fewer permutations than two-word tags.',
            '',
            '═══════════════════════════════════════',
            'IMPROVEMENT PLAN',
            '═══════════════════════════════════════',
            '',
            'After scoring the ORIGINAL listing, provide an IMPROVEMENT PLAN:',
            '',
            'IMPROVED TITLE:',
            'Write a new title using the brainstorm word cloud from Part 1.',
            '- Must be 130–140 characters',
            '- Must contain 3–4 comma-separated keyword strings',
            '- Each string: [Descriptive] [Descriptive] [Anchor]',
            '- Include at least 2 vibe/tactile words',
            '- No keyword string should be 100% repeated words from another string',
            '- Every word must accurately reflect the Product Identity',
            '',
            'IMPROVED TAGS (13 tags):',
            'Write 13 tags using the 5 Ws framework.',
            '- Every tag must be 20 characters or under',
            '- Cover all 5 Ws across the 13 slots',
            '- Tags do not need to make grammatical sense — prioritize cross-match permutations',
            '- Avoid purely poetic tags with no buyer-intent signal',
            '- Each tag should ideally contain 2 combinable keywords',
            '',
            'ETSY BAD ADVICE WARNING:',
            'If the original title is under 80 characters, add a warning.',
            '',
            '═══════════════════════════════════════',
            'OUTPUT FORMAT (JSON ONLY)',
            '═══════════════════════════════════════',
            '',
            'You MUST return your response as a valid JSON object matching this exact structure:',
            '{',
            '  "brainstorm": {',
            '    "descriptive": ["word1", "word2"],',
            '    "anchors": ["phrase1", "phrase2"]',
            '  },',
            '  "titleScore": {',
            '    "total": 30,',
            '    "breakdown": [',
            '      "Character Count: 15/15 — reason",',
            '      "String Structure: 8/8 — reason",',
            '      "Vibe Words: 4/4 — reason",',
            '      "Repetition: 3/3 — reason"',
            '    ]',
            '  },',
            '  "tagScore": {',
            '    "total": 35,',
            '    "breakdown": [',
            '      "Slots Filled: 10/10",',
            '      "Character Limit: 5/5",',
            '      "5 Ws Coverage: 15/15 — WHO ✅/❌ WHAT ✅/❌ WHERE ✅/❌ WHEN ✅/❌ WHY ✅/❌",',
            '      "Dead Tags: none",',
            '      "Cross-Match Diversity: 5/5"',
            '    ]',
            '  },',
            '  "totalScore": {',
            '    "score": 65,',
            '    "rating": "Strong"',
            '  },',
            '  "improvedTitle": "Your new optimized title",',
            '  "improvedTags": ["tag1", "tag2"],',
            '  "badAdviceWarning": "warning text or omit entirely if not needed"',
            '}',
            '',
            '=== LISTING TO ANALYZE ===',
            'TITLE: ' + scrapedData.title,
            'TAGS: ' + scrapedData.tags.join(', '),
            'PRODUCT IDENTITY: ' + JSON.stringify(currentIdentity)
        ].join('\\n');

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are a 2026 Etsy SEO Analyzer built on the Nick Method. Respond ONLY with valid JSON matching the exact output format schema.' },
                        { role: 'user', content: promptLines }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                }),
            });

            if (!response.ok) throw new Error(\`Failed to optimize with AI\`);
            const result = await response.json();
            let content = result.choices[0].message.content;

            if (content.includes('\`\`\`')) {
                content = content.replace(/\`\`\`json|\`\`\`/g, '').trim();
            }

            let aiResponse = JSON.parse(content) as NickMethodReport;
            setOptimizedData(aiResponse);

        } catch (err: any) {
            setError('AI Optimization failed: ' + err.message);
        } finally {
            setIsOptimizing(false);
            setIsEvaluatingOptimized(false);
        }
    };`;

code = code.replace(optimizeFuncRegex, newOptimizeFunc);

// 5. Update UX rendering at bottom 
const uiStartRegex = /{scrapedData && \([\s\S]*?\n\s*}\n\s*</; // Not safe. Best to rewrite UI block. Let's do a strict match for the entire UI.
const newUIBlock = `
                    {/* Optimized Metadata (Nick Method) */}
                    <div className={\`bg-slate-800 p-6 rounded-xl border-2 \${optimizedData ? 'border-amber-500/50 shadow-amber-900/10' : 'border-dashed border-slate-700'} flex flex-col justify-center\`}>
                        {!optimizedData && !isOptimizing ? (
                            <div className="text-center space-y-3 opacity-50">
                                <Sparkles className="w-12 h-12 mx-auto text-slate-600" />
                                <p>Click optimize to run Nick Method SEO Analysis</p>
                            </div>
                        ) : optimizedData ? (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-start">
                                    <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-400">
                                        <Sparkles className="w-5 h-5" />
                                        Nick Method SEO Report
                                    </h2>
                                    <div className={\`flex items-center gap-2 px-3 py-1.5 rounded-full border \${optimizedData.totalScore.score >= 50 ? 'bg-emerald-900/40 border-emerald-400 text-emerald-400' : 'bg-amber-900/30 border-amber-500/50 text-amber-400'}\`}>
                                        <span className="text-sm font-bold">New Score: {optimizedData.totalScore.score}/65 ({optimizedData.totalScore.rating})</span>
                                    </div>
                                </div>

                                {optimizedData.badAdviceWarning && (
                                    <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold flex items-start gap-2">
                                        <span className="text-sm mt-0.5">⚠️</span>
                                        <p>{optimizedData.badAdviceWarning}</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {/* Brainstorm Cloud */}
                                    <div className="p-3 rounded-lg bg-slate-900/80 border border-purple-900/50 text-xs text-slate-300">
                                        <div className="text-[10px] text-purple-400 font-bold uppercase mb-2">Brainstorm Cloud</div>
                                        <div className="mb-2"><strong>Descriptive:</strong> <span className="text-slate-400">{optimizedData.brainstorm.descriptive.join(', ')}</span></div>
                                        <div><strong>Anchors:</strong> <span className="text-slate-400">{optimizedData.brainstorm.anchors.join(', ')}</span></div>
                                    </div>

                                    {/* Score Breakdowns */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/50 text-xs text-slate-300">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase mb-2 flex justify-between">
                                                <span>Title Score</span> 
                                                <span className={optimizedData.titleScore.total >= 25 ? 'text-emerald-400' : 'text-amber-400'}>{optimizedData.titleScore.total}/30</span>
                                            </div>
                                            <ul className="space-y-1 text-[10px] text-slate-400">
                                                {optimizedData.titleScore.breakdown.map((item, i) => <li key={i}>• {item}</li>)}
                                            </ul>
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/50 text-xs text-slate-300">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase mb-2 flex justify-between">
                                                <span>Tag Score</span> 
                                                <span className={optimizedData.tagScore.total >= 30 ? 'text-emerald-400' : 'text-amber-400'}>{optimizedData.tagScore.total}/35</span>
                                            </div>
                                            <ul className="space-y-1 text-[10px] text-slate-400">
                                                {optimizedData.tagScore.breakdown.map((item, i) => <li key={i}>• {item}</li>)}
                                            </ul>
                                        </div>
                                    </div>

                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Type className="w-3 h-3" /> Improved Title
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.improvedTitle, 'title')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'title' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="text-sm p-3 bg-slate-900 border border-amber-500/20 rounded-lg text-amber-50 shadow-inner">{optimizedData.improvedTitle}</p>
                                    </section>

                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Tag className="w-3 h-3" /> Improved Tags ({optimizedData.improvedTags?.length || 0}/13)
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.improvedTags.join(', '), 'all-tags')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'all-tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'all-tags' ? 'Copied' : 'Copy All'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                                            {optimizedData.improvedTags.map((tag, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => copyToClipboard(tag, \`tag-\${i}\`)}
                                                    className="text-xs px-2 py-1 bg-amber-500/10 text-amber-200 rounded border border-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/40 transition-all cursor-pointer flex items-center gap-1"
                                                >
                                                    {copiedField === \`tag-\${i}\` ? <Check className="w-3 h-3 text-emerald-400" /> : null}
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <Loader2 className="w-12 h-12 mx-auto animate-spin text-purple-500" />
                                <p className="text-slate-400 animate-pulse">Running Nick Method SEO Brainstorm & Audit...</p>
                            </div>
                        )}
                    </div>
                </div>
            )
            }
        </div >
    );
};
`;

const replaceUIRegex = /\{\/\* Optimized Metadata \*\/\}([\s\S]*?)<\/div\s*>\n\s*\)\n\s*\}\n\s*<\/div\s*>\n\s*\);\n\};/;
code = code.replace(replaceUIRegex, newUIBlock);

fs.writeFileSync(filePath, code);
console.log('Update script executed successfully.');
