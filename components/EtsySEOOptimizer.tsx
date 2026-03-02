import React, { useState } from 'react';
import { Search, Loader2, Sparkles, Copy, Check, ExternalLink, Wand2, Tag, FileText, Type, ChevronLeft } from 'lucide-react';
import { evaluateListingSEO } from '../src/lib/seoScoringEngine';
import { JunkJournalPagesIdentity } from '../src/types/productIdentity';
import { buildIdentityLockPrompt } from '../src/lib/buildIdentityLockPrompt';
import { buildViolationReport } from '../src/lib/buildViolationReport';
import { calculateFillerDensity } from '../src/lib/seoEfficiencyRules';
import { calculateTagIntentScore, classifyTag } from '../src/lib/tagIntentClassifier';
import { analyzeTagContainment, violatesFormatContainment, getFormatViolations } from '../src/lib/productBoundaryGuard';

interface SEOPillarScores {
    title: number;
    tags: number;
    description: number;
    ctrRisk: number;
}

interface SEOScore {
    overallScore: number;
    pillars: SEOPillarScores;
    strengths: string[];
    weaknesses: string[];
    ctrRiskScore: number;
    ctrRiskReasons: string[];
}

interface ScrapedDetails {
    title: string;
    description: string;
    tags: string[];
    imageUrl?: string;
    listingId?: string;
    score?: SEOScore;
}

interface OptimizedDetails {
    title: string;
    description: string;
    tags: string[];
    score?: SEOScore;
}

interface EtsySEOOptimizerProps {
    onClose?: () => void;
}

const EtsySEOOptimizer: React.FC<EtsySEOOptimizerProps> = ({ onClose }) => {
    const [url, setUrl] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [isEvaluatingOriginal, setIsEvaluatingOriginal] = useState(false);
    const [isEvaluatingOptimized, setIsEvaluatingOptimized] = useState(false);
    const [scrapedData, setScrapedData] = useState<ScrapedDetails | null>(null);
    const [optimizedData, setOptimizedData] = useState<OptimizedDetails | null>(null);
    const [extractedIdentity, setExtractedIdentity] = useState<JunkJournalPagesIdentity | null>(null);
    const [showIdentityConfirmation, setShowIdentityConfirmation] = useState(false);
    const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [rejectedSynonyms, setRejectedSynonyms] = useState<string[]>([]);
    const [synonymInput, setSynonymInput] = useState('');

    // Reusable synonym sanitizer
    const sanitizeSynonyms = (raw: any[]): { valid: string[]; rejected: string[] } => {
        const formatWords = ['printable', 'digital', 'download', 'pages', 'journal', 'paper', 'scrapbook'];
        const bannedSynonyms = ['kit', 'set', 'ephemera', 'pockets', 'wall art', 'poster', 'canvas', 'decor', 'furniture', 'clothing', 'apparel'];
        const valid: string[] = [];
        const rejected: string[] = [];
        (raw || []).forEach((s: any) => {
            if (typeof s === 'string' && s.length > 2 && s.length < 20 &&
                !bannedSynonyms.includes(s.toLowerCase()) &&
                !formatWords.includes(s.toLowerCase())) {
                valid.push(s);
            } else if (typeof s === 'string' && s.length > 0) {
                rejected.push(s);
            }
        });
        return { valid: valid.slice(0, 5), rejected };
    };

    const evaluateListing = async (listing: { title: string, description: string, tags: string[] }, identityContract?: JunkJournalPagesIdentity): Promise<SEOScore> => {
        // Now using purely deterministic TS analysis instead of LLM token burn
        return Promise.resolve(evaluateListingSEO(listing.title, listing.tags || [], listing.description, identityContract));
    };

    const handleScrape = async () => {
        if (!url.trim()) return;

        setIsScraping(true);
        setError(null);
        setScrapedData(null);
        setOptimizedData(null);
        setExtractedIdentity(null);

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

            // Kick off original listing evaluation
            setIsEvaluatingOriginal(true);
            try {
                const score = await evaluateListing({
                    title: data.title,
                    description: data.description,
                    tags: data.tags
                });
                setScrapedData(prev => prev ? { ...prev, score } : null);
            } catch (evalErr) {
                console.error("Failed to evaluate original listing:", evalErr);
            } finally {
                setIsEvaluatingOriginal(false);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleOptimize = async () => {
        if (!scrapedData) return;

        setError(null);

        // --- PHASE 1: IDENTITY EXTRACTION ---
        let currentIdentity = extractedIdentity;
        if (!currentIdentity) {
            setIsAnalyzingProduct(true);
            try {
                const analysisPrompt = `You are a product identity extraction engine for an Etsy store that sells 
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
- If no theme is present, set primary_theme to "unthemed"
- If secondary_themes are not present, return []
- If confidence is below 0.7, still return the JSON but flag it
- Never add themes that are not explicitly supported by the original listing
- The locked_identity_terms MUST include the primary theme noun and "junk journal pages"
- For theme_synonyms: Only include synonyms that are actual common search terms buyers would type on Etsy. Do NOT include: aesthetic descriptions ('dreamy', 'beautiful'), format words ('printable', 'digital'), or invented compound words. Maximum 5 synonyms. If unsure, return fewer — an empty array is better than hallucinated terms.

Do not invent motifs. Do not add aesthetics not present. Only extract what is explicitly implied.

=== ORIGINAL LISTING ===
Title: ${scrapedData.title}
Tags: ${scrapedData.tags.join(', ')}
Description: ${scrapedData.description.substring(0, 2000)}`;

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
                if (analysisContent.includes('```')) {
                    analysisContent = analysisContent.replace(/```json|```/g, '').trim();
                }
                currentIdentity = JSON.parse(analysisContent) as JunkJournalPagesIdentity;

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

        setIsOptimizing(true);

        const originalViolations = getFormatViolations(scrapedData.title, scrapedData.tags);

        const dynamicWarning = originalViolations.length > 0
            ? `BEFORE YOU WRITE ANYTHING: Read this first.\nThe words [${originalViolations.join(', ')}] appear in the original listing.\nThese words are FACTUALLY INCORRECT for this product.\nThis product is PAGES ONLY. Test every word you generate against this list before outputting.\nIf you are about to write "kit" — STOP. Replace it with "pages".\nIf you are about to write "set" — STOP. Replace it with "pages" or remove it.\n`
            : '';

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            dynamicWarning,
            '=== 0. PRODUCT CONSTRAINTS (MANDATORY IDENTITY LOCK) ===',
            buildIdentityLockPrompt(currentIdentity!),
            '',
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
            '[Primary Buyer Phrase], [Secondary Niche Angle] + [Format/Descriptor]',
            'Example: "Rustic Greenhouse Junk Journal Kit, Vintage Garden Printable Ephemera, Romantic Spring Digital Pages"',
            'Rules:',
            '- 1 dominant phrase + 2-3 supporting angles max',
            '- NO generic padding phrases like "DIY Craft Pages" or "Aesthetic Scrapbooking Supplies"',
            '- Every phrase MUST strengthen buyer intent.',
            '- DO NOT dump isolated format tags at the end (e.g., "160+ Pages", "Printable", "Digital Download").',
            '- INTEGATE format naturally into the phrase (e.g., "Boho Vintage Digital Download", "160+ Printable Pages").',
            '- Avoid stacking 5-8 equal keywords',
            '- Natural language flow',
            '- 1-3 commas maximum (if needed)',
            '- No keyword dumping',
            '',
            'D. Primary Phrase Protection Rule (CRITICAL):',
            'Identify the strong buyer-intent product phrase from the ORIGINAL listing (e.g., "Junk Journal Kit", "Scrapbook Kit", "Printable Ephemera").',
            '- Do NOT remove it.',
            '- Do NOT replace it with a broader synonym (e.g., do not downgrade "Junk Journal Kit" to "Vintage Journal Kit").',
            '- Preserve or strengthen it as the anchor of the optimized title.',
            '',
            'E. CTR Psychology Layer:',
            'The title must sound like a product someone WANTS. Be specific, not vague. Include aesthetic triggers when relevant (cottagecore, dark academia, fairycore, botanical, gothic, shabby chic, etc.). Etsy now rewards clicks and saves heavily.',
            '',
            'F. Dominance Enforcement Rule:',
            'Before generating the title:',
            '1. Ensure the protected dominant buyer-intent phrase appears fully intact within the first 60 characters.',
            '2. Do NOT introduce another competing primary phrase.',
            '3. Supporting angles must MODIFY the dominant phrase — not compete with it.',
            '',
            'F. Title Length & Padding Rule (SHARPNESS + COVERAGE):',
            '- Target Length: 120-135 characters.',
            '- DO NOT overly truncate. You MUST use secondary angles and specific format modifiers to fill the space cleanly and competitively.',
            '- NEVER add generic trailing filler (e.g., "DIY Scrapbook Ephemera", "Printable Stationery", "Craft Supplies").',
            '- NEVER dump disconnected specs at the end of the title (e.g. ", 160+ Pages Printable"). Integrate them smoothly.',
            '- STRICTLY BAN ChatGPT-isms: "Creative Souls", "Crafting Delight", "Elevate", "Whimsical Journey", "Unleash your creativity". Titles are product names, not poetry.',
            '- NEVER include "Commercial Use" or license language in the title. The title is for search discovery only.',
            '- Your hard cap is 140 characters. DO NOT cut off mid-word.',
            '',
            '=== H. EMOTIONAL DISTINCTION LAYER (HIGH-COMPETITION MODE) ===',
            'If the theme belongs to a competitive aesthetic (floral, gothic, cottagecore, vintage, botanical, fantasy):',
            '- Include ONE emotionally charged descriptor that enhances click appeal.',
            '- This descriptor must support the dominant phrase, not compete with it.',
            '- Avoid over-dramatic language or hype words.',
            '- The title must still read like a product name — not a poem.',
            '',
            'Examples of controlled emotional descriptors (use ONLY if appropriate to the original product):',
            '- [Emotion/Vibe] + [Theme strictly from original text]',
            '',
            '=== I. TAIL EFFICIENCY RULE (CRITICAL) ===',
            'After generating the title:',
            '1. Analyze the last 40% of the title (tail section).',
            '2. Remove or replace any phrase that:',
            '   - Is purely format clarification (digital download, instant access).',
            '   - Is overly broad (creative crafting, scrapbook supplies, printable art).',
            '   - Does not add buyer-intent specificity, aesthetic differentiation, or value reinforcement.',
            '3. Replace low-efficiency phrases with specific motif terms strictly sourced from the original product description, seasonal cues, or actual subculture identifiers.',
            'If no strong replacement exists, shorten the title instead of padding.',
            'Never extend a title solely to hit the length target with weak words.',
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
            'Example good angles: "botanical journal pages", "garden scrapbook", "cottagecore printable", "floral printable pages", "digital paper pack", "shabby chic papers", "vintage craft papers"',
            'Example BAD (too repetitive): "junk journal pages", "junk journal printable", "junk journal papers"',
            '',
            'C. Reinforcement Rule (Advanced):',
            'You MAY lightly reinforce part of the main title phrase using a variation in ONE tag.',
            'Example - Title: "Rustic Greenhouse Junk Journal Kit Printable" then Tag allowed: "greenhouse journal kit"',
            'But NOT exact full duplication.',
            '',
            'D. Buyer Intent Filter (MANDATORY):',
            'Tags are entry doors. They must be hyper-specific things buyers type to purchase.',
            'MANDATORY FORMULA: Product + Theme + Format/Use Case (e.g., "[Theme] journal pages", "[Emotion] [Theme] papers", "[Color] [Theme] printable").',
            'Never end a tag with a noun that has no product signal. "art journaling", "creative journaling", "cat art" are BANNED tag patterns.',
            'Every tag MUST contain one of: pages, journal, printable, papers, download.',
            'BANNED TAGS: "digital download", "instant download", "printable art", "digital paper pack", "botanical crafting", "shabby chic art", "creative journaling", "vintage aesthetics".',
            'Do NOT use vague aesthetic labels alone or broad category terms. EVERY tag must sound like a physical or digital product people query.',
            '',
            'E. Strict Character Enforcement:',
            'Before finalizing output:',
            '- Count characters of each tag including spaces.',
            '- If any tag exceeds 20 characters, shorten or replace it.',
            '- Do NOT approximate. Hard limit: 20 characters.',
            '- If constraint cannot be met, regenerate tag list.',
            '',
            '=== F. AESTHETIC SIGNAL TAG RULE ===',
            'At least 2 tags must clearly signal the aesthetic mood or subculture identity (e.g., cottagecore paper, dark academia art, romantic floral kit).',
            'These must still pass the Buyer Intent Filter.',
            'Do NOT use vague aesthetic-only tags without product context.',
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
            '- CRITICAL: Use \\n (newline characters) in the JSON description value to preserve line breaks, section headers, spacing, and paragraph structure',
            '- Minimum length: 800+ characters',
            '',
            'DESCRIPTION STRUCTURE GUIDE (follow this order):',
            '',
            'Paragraph 1 — Emotional Hook (2-3 sentences)',
            'Lead with theme/mood language. Name the buyer.',
            'Example: "Transform your junk journals with these richly detailed [THEME] pages, designed for collectors, crafters, and artists who love [MOOD] aesthetics."',
            '',
            "Paragraph 2 — What is Included (bullet list)",
            '- [NUMBER]+ high-resolution JPG journal pages',
            '- Print size: 8.5 x 11 inches',
            '- Resolution: 300 DPI — print-ready quality',
            '- Theme: [PRIMARY THEME] with [SECONDARY THEMES]',
            '- Commercial use license included',
            '',
            'Paragraph 3 — How Delivery Works (critical — must be clear)',
            '"This is a DIGITAL DOWNLOAD. After purchase you will receive a PDF file. Inside that PDF is a Google Drive link where you can instantly download all [NUMBER]+ JPG image files directly to your device. No physical item will be shipped."',
            '',
            'Paragraph 4 — Usage Ideas (2-3 sentences)',
            'Print at home or at a print shop. Use in junk journals, art journals, scrapbooks, mixed media projects, or planners.',
            '',
            'Paragraph 5 — License Statement (1-2 sentences)',
            '"Commercial use license is included with your purchase. You may use these pages in journals or products you sell."',
            '',
            'D. Differentiation Requirement:',
            'The description must include at least ONE specific differentiating element unique to this listing, such as: unique motif, unique mood, unique color palette, unique cultural inspiration, or unique seasonal positioning.',
            'Do NOT write a generic description that could apply to any junk journal kit. Each listing must feel distinct.',
            '',
            'F. Input Boundaries Rule:',
            'Do NOT introduce themes, motifs, aesthetics, or use cases that are not supported by the original title or description.',
            'Enhance — do not fabricate.',
            '',
            '=== G. MARKET CLUSTER POSITIONING & EMOTIONAL ENGINE (MANDATORY) ===',
            'The first paragraph MUST:',
            '1. Pick ONE dominant market cluster supported by the original listing and lean perfectly into it. Do NOT dilute the focus or invent clusters.',
            '2. Establish a clear mood or atmosphere (romantic, moody, whimsical, nostalgic, enchanted, serene, etc.).',
            '3. Identify the ideal buyer type (junk journal creators, scrapbook artists, cottagecore lovers, fantasy journal fans, etc.).',
            '4. Include at least one SPECIFIC differentiating element (e.g., "Inspired by Japanese sakura gardens" or "Hand-painted watercolor texture").',
            '5. Include at least one sensory or visual detail that is factually present in the original product images or description (e.g. watercolor texture, vintage parchment, etc).',
            '',
            'Do NOT write a neutral, safely beautiful, or informational opening.',
            'The opening must establish distinct competitive edge.',
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
            '=== 5. FINAL INTERNAL CHECK & SEMANTIC AUDIT (CRITICAL) ===',
            'Before returning JSON:',
            '1. Re-evaluate title for stacking.',
            '2. Re-count tag characters.',
            '3. Confirm exactly 13 tags.',
            '4. Confirm at least 5 tags contain a core product noun (e.g., "junk journal", "scrapbook", "paper pack", "journal pages").',
            '5. Confirm no tag exceeds 20 characters.',
            '6. Confirm description > 800 characters.',
            '7. Confirm no hallucinated themes added.',
            '8. Highlight words in title that are broad, redundant, or non-transactional.',
            '8. If 3+ weak words appear in the final 40% of the title, REDO the tail section.',
            '9. Ensure at least one niche modifier exists, no more than one format clarifier phrase, and no more than one broad craft descriptor.',
            'If any fail -> silently iterate and fix before responding.',
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
            '  "tags": ["13 tags each MUST be 1-20 characters, no exceptions"]',
            '}',
            '',
            'FINAL REMINDER BEFORE YOU OUTPUT:',
            'Do not write "kit". Write "pages" instead.',
            'Do not write "journal kit". Write "journal pages" instead.',
            'Do not write "ephemera". Do not write "ephemera collage". Write "journal pages" or "collage pages" instead.',
            'Do not put "Commercial Use" in the title.',
            'Every tag must contain one of: pages, journal, printable, papers, download.',
            'Never repeat a tag. All 13 tags must be completely unique — no duplicates, no near-duplicates like "whimsical cat" and "whimsical cats".',
            'Never repeat a tag concept. If you use "rustic greenhouse" as a tag, do not use "greenhouse pages", "rustic pages", or any other tag that shares a root word with a tag you already wrote. Treat each tag as a unique signal — no overlapping roots.',
            'Check every tag before outputting. If any two tags share the same root word, delete one. Examples: "printable journal" and "printable pages" both start with "printable" — keep only one. "vintage journal" and "vintage papers" both start with "vintage" — keep only one. Output 13 completely unique tags with no shared root words.',
            'Check your output one final time before returning it.'
        ].join('\n');

        try {
            let bestOptimizedData: OptimizedDetails | null = null;
            let bestScoreObj: SEOScore | null = null;
            let currentPromptLines = [...promptLines];

            for (let attempt = 1; attempt <= 3; attempt++) {
                console.log(`Optimization Attempt ${attempt}/3...`);

                const response = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are a Pro Seller Level Etsy SEO expert optimizing for the 2026 Etsy AI Search Model. Respond only with valid JSON. Use the keys: "title", "description", and "tags". Optimize for Relevance x Click Appeal x Buyer Intent x Conversion Clarity. CRITICAL: In the description field, use \\n (actual newline characters) to preserve line breaks, section headers, spacing, bullets, and paragraph structure. Do NOT return the description as one flat paragraph.' },
                            { role: 'user', content: currentPromptLines.join('\n') }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: attempt === 1 ? 0.7 : Math.min(0.9, 0.7 + (attempt * 0.1))
                    }),
                });

                if (!response.ok) throw new Error(`Failed to optimize with AI on attempt ${attempt}`);
                const result = await response.json();
                let content = result.choices[0].message.content;

                if (content.includes('```')) {
                    content = content.replace(/```json|```/g, '').trim();
                }

                let aiResponse = JSON.parse(content);

                if (aiResponse.title && aiResponse.title.length > 140) {
                    let text = aiResponse.title.substring(0, 140);
                    if (aiResponse.title[140] && aiResponse.title[140] !== ' ') {
                        const lastSpaceIndex = text.lastIndexOf(' ');
                        if (lastSpaceIndex > 0) text = text.substring(0, lastSpaceIndex);
                    }
                    aiResponse.title = text.replace(/[,-\s]+$/, '').trim();
                }

                if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                    aiResponse.tags = aiResponse.tags.map((tag: string) => {
                        if (tag.length <= 20) return tag;
                        let truncated = tag.substring(0, 20);
                        const lastSpace = truncated.lastIndexOf(' ');
                        if (lastSpace > 5) truncated = truncated.substring(0, lastSpace);
                        return truncated.trim();
                    });
                }

                // BOUNDARY GUARD INTERCEPT
                const tagBoundary = analyzeTagContainment(aiResponse.tags || [], extractedIdentity?.primary_theme);
                const titleViolations = aiResponse.title ? getFormatViolations(aiResponse.title) : [];
                const titleFormatViolation = titleViolations.length > 0;

                const hasFormatViolations = tagBoundary.formatViolations.length > 0 || titleFormatViolation;
                const insufficientTags = tagBoundary.productAttachedCount < 5;
                const hasDuplicates = tagBoundary.duplicateTags.length > 0;

                if (hasFormatViolations || insufficientTags || hasDuplicates) {
                    const violations = Array.from(new Set([...tagBoundary.formatViolations, ...titleViolations]));
                    console.warn(`Attempt ${attempt} blocked by boundary guard. Format violations: ${violations.length}, Product tags: ${tagBoundary.productAttachedCount}/5, Duplicates: ${tagBoundary.duplicateTags.length}`);

                    if (attempt < 3) {
                        currentPromptLines.push(`=== CRITICAL BOUNDARY VIOLATION ===`);
                        if (hasFormatViolations) {
                            currentPromptLines.push(`Your previous attempt included banned terms: ${violations.join(', ')}.`);
                            currentPromptLines.push(`You MUST NOT include these terms or any terms like "kit", "set", "ephemera", "wall art", etc.`);
                        }
                        if (insufficientTags) {
                            currentPromptLines.push(`Your previous attempt lacked core product identifiers. You only included ${tagBoundary.productAttachedCount} product-attached tags (minimum 5 required). Ensure tags use terms like "junk journal pages" or "scrapbook paper".`);
                        }
                        if (hasDuplicates) {
                            currentPromptLines.push(`Your previous attempt contained DUPLICATE tags: ${tagBoundary.duplicateTags.join(', ')}. Every tag must be unique.`);
                        }
                        continue; // Force regenerate immediately without scoring
                    } else {
                        let errorMsg = `AI failed to generate valid results after 3 attempts.`;
                        if (hasFormatViolations) errorMsg += ` Banned terms detected: ${violations.join(', ')}.`;
                        if (insufficientTags) errorMsg += ` Insufficient product tags (${tagBoundary.productAttachedCount}/5).`;
                        if (hasDuplicates) errorMsg += ` Duplicate tags: ${tagBoundary.duplicateTags.join(', ')}.`;
                        throw new Error(errorMsg);
                    }
                }

                setIsEvaluatingOptimized(true);
                const evalScore = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                }, currentIdentity || undefined);
                setIsEvaluatingOptimized(false);

                if (!bestScoreObj || evalScore.overallScore > bestScoreObj.overallScore) {
                    bestScoreObj = evalScore;
                    bestOptimizedData = { ...aiResponse, score: evalScore };
                }

                if (evalScore.overallScore >= 100) {
                    break;
                }

                if (attempt < 3 && evalScore.weaknesses.length > 0) {
                    currentPromptLines = [
                        'You are a Pro Seller Level Etsy SEO expert.',
                        `Your previous optimization attempt scored ${evalScore.overallScore}/100.`,
                        buildViolationReport(
                            evalScore.weaknesses,
                            currentIdentity!,
                            ["The page count", "The file format", "The delivery method", "The license type"]
                        ),
                        '=== PREVIOUS OUTPUT SO YOU KNOW WHAT FAILED ===',
                        'Title: ' + aiResponse.title,
                        'Tags: ' + (aiResponse.tags || []).join(', '),
                        '',
                        ...promptLines
                    ];
                }
            }

            setOptimizedData(bestOptimizedData);

        } catch (err: any) {
            setError('AI Optimization failed: ' + err.message);
        } finally {
            setIsOptimizing(false);
            setIsEvaluatingOptimized(false);
        }
    };

    const handleRefine = async () => {
        if (!scrapedData || !optimizedData || !optimizedData.score) return;

        setIsRefining(true);
        setError(null);

        const originalViolations = getFormatViolations(scrapedData.title, scrapedData.tags);

        const dynamicWarning = originalViolations.length > 0
            ? `BEFORE YOU WRITE ANYTHING: Read this first.\nThe words [${originalViolations.join(', ')}] appear in the original listing.\nThese words are FACTUALLY INCORRECT for this product.\nThis product is PAGES ONLY. Test every word you generate against this list before outputting.\nIf you are about to write "kit" — STOP. Replace it with "pages".\nIf you are about to write "set" — STOP. Replace it with "pages" or remove it.\n`
            : '';

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            dynamicWarning,
            '=== 0. PRODUCT CONSTRAINTS (MANDATORY IDENTITY LOCK) ===',
            buildIdentityLockPrompt(extractedIdentity!),
            '',
            '',
            'You previously optimized this listing, but our internal grader found the following weaknesses:',
            ...optimizedData.score.weaknesses.map((w: string) => `- ${w}`),
            '',
            'Your task is to REWRITE the title, tags, and description to EXPLICITLY fix these weaknesses while maintaining all previous structural rules.',
            '',
            '=== PREVIOUS OUTPUT ===',
            'Title: ' + optimizedData.title,
            'Tags: ' + optimizedData.tags.join(', '),
            'Description:',
            optimizedData.description.substring(0, 2000),
            '',
            '=== STRICT CONSTRAINTS ===',
            '- Title: Target 120-135 chars. Max 140. Structure: [Primary Buyer Phrase], [Secondary Angle] [Descriptor] [Format].',
            '- CRITICAL TITLE RULE: Do NOT remove or replace the primary buyer-intent product phrase from the original (e.g., KEEP "Junk Journal Kit", do not downgrade to "Vintage Journal").',
            '- NEVER remove strong secondary angles just to make the title short. Keep it competitive and dense with buyer intent.',
            '- BAN poetic filler ("Creative Souls", "Delight", "Elevate").',
            '- Tags: EXACTLY 13 tags. MAX 20 chars per tag. CRITICAL: At least 5 tags MUST contain a core product noun (e.g. "junk journal", "scrapbook", "paper pack", "journal pages"). Formula: Product + Theme + Use Case.',
            '- TAG RULE: Never end a tag with a noun that has no product signal. "art journaling", "creative journaling", "cat art" are BANNED patterns. Every tag MUST contain one of: pages, journal, printable, papers, download.',
            '- TITLE RULE: NEVER include "Commercial Use" or license language in the title. The title is for search discovery only.',
            '- Description: OVER 800 chars. Pick ONE dominant market cluster. MUST USE \\n for line breaks to preserve formatting.',
            '',
            '=== TAIL EFFICIENCY & SEMANTIC AUDIT (CRITICAL) ===',
            '1. Analyze the last 40% of the title (tail section). Remove broad filler or pure format clarifiers. Replace them with specific aesthetic, motif, or subcultural terms.',
            '2. Do not extend a title solely to reach 140 characters if you have to use weak words to do it.',
            '3. Ensure the title contains no more than one broad craft descriptor and no more than one format phrase.',
            '4. If >3 filler words exist in the tail, regenerate the tail section.',
            '',
            '=== OUTPUT (JSON ONLY) ===',
            'Respond ONLY with a valid JSON object matching the exact structure previously requested: {"title": "", "description": "", "tags": []}.',
            '',
            'FINAL REMINDER BEFORE YOU OUTPUT:',
            'Do not write "kit". Write "pages" instead.',
            'Do not write "journal kit". Write "journal pages" instead.',
            'Do not write "ephemera". Do not write "ephemera collage". Write "journal pages" or "collage pages" instead.',
            'Do not put "Commercial Use" in the title.',
            'Every tag must contain one of: pages, journal, printable, papers, download.',
            'Never repeat a tag. All 13 tags must be completely unique — no duplicates, no near-duplicates like "whimsical cat" and "whimsical cats".',
            'Never repeat a tag concept. If you use "rustic greenhouse" as a tag, do not use "greenhouse pages", "rustic pages", or any other tag that shares a root word with a tag you already wrote. Treat each tag as a unique signal — no overlapping roots.',
            'Check every tag before outputting. If any two tags share the same root word, delete one. Examples: "printable journal" and "printable pages" both start with "printable" — keep only one. "vintage journal" and "vintage papers" both start with "vintage" — keep only one. Output 13 completely unique tags with no shared root words.',
            'Check your output one final time before returning it.'
        ].join('\n');

        try {
            let bestOptimizedData: OptimizedDetails | null = null;
            let bestScoreObj: SEOScore | null = null;
            let currentPromptLines = [...promptLines];

            for (let attempt = 1; attempt <= 3; attempt++) {
                console.log(`Refinement Attempt ${attempt}/3...`);

                const response = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are a Pro Seller Level Etsy SEO expert optimizing for the 2026 Etsy AI Search Model. Respond only with valid JSON. Use the keys: "title", "description", and "tags". CRITICAL: In the description field, use \\n (actual newline characters) to preserve formatting.' },
                            { role: 'user', content: currentPromptLines.join('\n') }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: attempt === 1 ? 0.7 : Math.min(0.9, 0.7 + (attempt * 0.1))
                    }),
                });

                if (!response.ok) throw new Error(`Failed to refine with AI on attempt ${attempt}`);
                const result = await response.json();
                let content = result.choices[0].message.content;

                if (content.includes('```')) {
                    content = content.replace(/```json|```/g, '').trim();
                }

                let aiResponse = JSON.parse(content);

                if (aiResponse.title && aiResponse.title.length > 140) {
                    let text = aiResponse.title.substring(0, 140);
                    if (aiResponse.title[140] && aiResponse.title[140] !== ' ') {
                        const lastSpaceIndex = text.lastIndexOf(' ');
                        if (lastSpaceIndex > 0) text = text.substring(0, lastSpaceIndex);
                    }
                    aiResponse.title = text.replace(/[,-\s]+$/, '').trim();
                }

                if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                    aiResponse.tags = aiResponse.tags.map((tag: string) => {
                        if (tag.length <= 20) return tag;
                        let truncated = tag.substring(0, 20);
                        const lastSpace = truncated.lastIndexOf(' ');
                        if (lastSpace > 5) truncated = truncated.substring(0, lastSpace);
                        return truncated.trim();
                    });
                }

                // BOUNDARY GUARD INTERCEPT
                const tagBoundary = analyzeTagContainment(aiResponse.tags || [], extractedIdentity?.primary_theme);
                const titleViolations = aiResponse.title ? getFormatViolations(aiResponse.title) : [];
                const titleFormatViolation = titleViolations.length > 0;

                const hasFormatViolations = tagBoundary.formatViolations.length > 0 || titleFormatViolation;
                const insufficientTags = tagBoundary.productAttachedCount < 5;
                const hasDuplicates = tagBoundary.duplicateTags.length > 0;

                if (hasFormatViolations || insufficientTags || hasDuplicates) {
                    const violations = Array.from(new Set([...tagBoundary.formatViolations, ...titleViolations]));
                    console.warn(`Refinement attempt ${attempt} blocked by boundary guard. Format violations: ${violations.length}, Product tags: ${tagBoundary.productAttachedCount}/5, Duplicates: ${tagBoundary.duplicateTags.length}`);

                    if (attempt < 3) {
                        currentPromptLines.push(`=== CRITICAL BOUNDARY VIOLATION ===`);
                        if (hasFormatViolations) {
                            currentPromptLines.push(`Your previous attempt included banned terms: ${violations.join(', ')}.`);
                            currentPromptLines.push(`You MUST NOT include these terms or any terms like "kit", "set", "ephemera", "wall art", etc.`);
                        }
                        if (insufficientTags) {
                            currentPromptLines.push(`Your previous attempt lacked core product identifiers. You only included ${tagBoundary.productAttachedCount} product-attached tags (minimum 5 required). Ensure tags use terms like "junk journal pages" or "scrapbook paper".`);
                        }
                        if (hasDuplicates) {
                            currentPromptLines.push(`Your previous attempt contained DUPLICATE tags: ${tagBoundary.duplicateTags.join(', ')}. Every tag must be unique.`);
                        }
                        continue; // Force regenerate immediately without scoring
                    } else {
                        let errorMsg = `AI failed to refine results after 3 attempts.`;
                        if (hasFormatViolations) errorMsg += ` Banned terms detected: ${violations.join(', ')}.`;
                        if (insufficientTags) errorMsg += ` Insufficient product tags (${tagBoundary.productAttachedCount}/5).`;
                        if (hasDuplicates) errorMsg += ` Duplicate tags: ${tagBoundary.duplicateTags.join(', ')}.`;
                        throw new Error(errorMsg);
                    }
                }

                setIsEvaluatingOptimized(true);
                const evalScore = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                }, extractedIdentity || undefined);
                setIsEvaluatingOptimized(false);

                if (!bestScoreObj || evalScore.overallScore > bestScoreObj.overallScore) {
                    bestScoreObj = evalScore;
                    bestOptimizedData = { ...aiResponse, score: evalScore };
                }

                if (evalScore.overallScore >= 100) {
                    break;
                }

                if (attempt < 3 && evalScore.weaknesses.length > 0) {
                    currentPromptLines = [
                        'You are a Pro Seller Level Etsy SEO expert.',
                        `Your previous refinement attempt scored ${evalScore.overallScore}/100.`,
                        buildViolationReport(
                            evalScore.weaknesses,
                            extractedIdentity!,
                            ["The page count", "The file format", "The delivery method", "The license type"]
                        ),
                        '=== PREVIOUS OUTPUT ===',
                        'Title: ' + aiResponse.title,
                        'Tags: ' + (aiResponse.tags || []).join(', '),
                        '',
                        ...promptLines
                    ];
                }
            }

            setOptimizedData(bestOptimizedData);

        } catch (err: any) {
            setError('AI Refinement failed: ' + err.message);
        } finally {
            setIsRefining(false);
            setIsEvaluatingOptimized(false);
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
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm break-words whitespace-pre-wrap">
                        {error}
                    </div>
                )}
            </div>

            {scrapedData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Current Metadata */}
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-6">
                        <div className="flex justify-between items-start">
                            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-300">
                                <ExternalLink className="w-5 h-5" />
                                Current Listing
                            </h2>
                            {scrapedData.score ? (
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${scrapedData.score.overallScore >= 80 ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400' : scrapedData.score.overallScore >= 60 ? 'bg-amber-900/30 border-amber-500/50 text-amber-400' : 'bg-red-900/30 border-red-500/50 text-red-400'}`}>
                                    <span className="text-sm font-bold">Score: {scrapedData.score.overallScore}/100</span>
                                </div>
                            ) : isEvaluatingOriginal ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-600 bg-slate-700/50 text-slate-400">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-xs">Grading...</span>
                                </div>
                            ) : null}
                        </div>

                        {scrapedData.score && (
                            <div className="space-y-2 mb-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                        <div className="text-xs text-slate-500 font-bold uppercase mb-2">Strengths</div>
                                        <ul className="space-y-1 text-xs text-emerald-400">
                                            {scrapedData.score.strengths.slice(0, 2).map((s, i) => (
                                                <li key={i} className="flex items-start gap-1"><Check className="w-3 h-3 mt-0.5 shrink-0" /> {s}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                        <div className="text-xs text-slate-500 font-bold uppercase mb-2">Weaknesses</div>
                                        <ul className="space-y-1 text-xs text-red-400">
                                            {scrapedData.score.weaknesses.slice(0, 2).map((w, i) => (
                                                <li key={i} className="flex items-start gap-1"><span className="text-[10px] mt-0.5 shrink-0">⚠️</span> {w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 flex flex-col gap-2 text-xs text-slate-400">
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Title Core</strong> <span className={scrapedData.score.pillars.title >= 25 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{scrapedData.score.pillars.title}/30</span></div>
                                        <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Tag Quality</strong> <span className={scrapedData.score.pillars.tags >= 28 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{scrapedData.score.pillars.tags}/35</span></div>
                                        <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Description</strong> <span className={scrapedData.score.pillars.description >= 15 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{scrapedData.score.pillars.description}/20</span></div>
                                        <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">CTR Safety</strong> <span className={scrapedData.score.pillars.ctrRisk >= 10 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{scrapedData.score.pillars.ctrRisk}/15</span></div>
                                        <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Positioning</strong> <span className={scrapedData.score.pillars.clusterPositioning >= 8 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{scrapedData.score.pillars.clusterPositioning}/10</span></div>
                                    </div>
                                    {scrapedData.score.ctrRiskReasons && scrapedData.score.ctrRiskReasons.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                                            <strong className="text-slate-500 uppercase text-[10px] block mb-1">CTR Risk Factors detected:</strong>
                                            <ul className="space-y-1 text-[10px] text-slate-400">
                                                {scrapedData.score.ctrRiskReasons.map((r, i) => <li key={i}>• {r}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {scrapedData.score.tagSubPillars && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                                            <strong className="text-slate-500 uppercase text-[10px] block mb-1">Tag Score Breakdown ({scrapedData.score.pillars.tags}/35)</strong>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                                {Object.values(scrapedData.score.tagSubPillars).map((sp: any, i: number) => (
                                                    <div key={i} className="flex justify-between">
                                                        <span className="text-slate-500">{sp.label}</span>
                                                        <span className={sp.score >= sp.max ? 'text-emerald-400 font-bold' : sp.score > 0 ? 'text-amber-400' : 'text-red-400'}>{sp.score}/{sp.max}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

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

                        {showIdentityConfirmation && extractedIdentity ? (
                            <div className="p-4 bg-amber-900/30 border border-amber-500/50 rounded-lg space-y-4 shadow-lg shadow-amber-900/20">
                                <h3 className="text-amber-400 font-bold flex items-center gap-2">
                                    <span className="text-xl">⚠️</span> Low Confidence Identity Extraction
                                </h3>
                                <p className="text-sm text-slate-300">
                                    Our AI had trouble cleanly identifying the exact themes for this product based on the original listing. Please confirm or edit the details below before we generate the SEO.
                                </p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Primary Theme</label>
                                        <input
                                            type="text"
                                            value={extractedIdentity.primary_theme}
                                            onChange={(e) => setExtractedIdentity({ ...extractedIdentity, primary_theme: e.target.value })}
                                            className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Secondary Themes (Comma separated)</label>
                                        <input
                                            type="text"
                                            value={extractedIdentity.secondary_themes.join(', ')}
                                            onChange={(e) => setExtractedIdentity({ ...extractedIdentity, secondary_themes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Theme Synonyms (comma separated)</label>
                                        {rejectedSynonyms.length > 0 && (
                                            <div className="mb-2 p-2 bg-red-900/30 border border-red-500/40 rounded text-[11px] text-red-400">
                                                ⚠️ These extracted synonyms were rejected (format words or invalid): [{rejectedSynonyms.map(s => `"${s}"`).join(', ')}] — not used in scoring
                                            </div>
                                        )}
                                        {extractedIdentity.theme_synonyms.length === 0 && (
                                            <div className="mb-2 p-2 bg-amber-900/30 border border-amber-500/40 rounded text-[11px] text-amber-400">
                                                ⚠️ No valid theme synonyms extracted. Theme Coverage scoring may be reduced. Add synonyms manually below.
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            value={synonymInput}
                                            onChange={(e) => setSynonymInput(e.target.value)}
                                            placeholder="e.g. kitten, kitty, feline, tabby"
                                            className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1">Buyer search terms related to "{extractedIdentity.primary_theme}". Max 5.</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Format Specs</label>
                                        <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                            {extractedIdentity.page_count}+ Pages • {extractedIdentity.file_types.join(', ')} • {extractedIdentity.print_size} • Commercial Use
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        // Re-sanitize manual synonym input on confirm
                                        const manualSynonyms = synonymInput.split(',').map(s => s.trim()).filter(Boolean);
                                        const { valid } = sanitizeSynonyms(manualSynonyms);
                                        if (extractedIdentity) {
                                            const updated = { ...extractedIdentity, theme_synonyms: valid };
                                            setExtractedIdentity(updated);
                                        }
                                        setShowIdentityConfirmation(false);
                                        handleOptimize();
                                    }}
                                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-900/20"
                                >
                                    Confirm Identity & Generate SEO
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleOptimize}
                                disabled={isOptimizing || isAnalyzingProduct}
                                className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isOptimizing || isAnalyzingProduct ? <Loader2 className="animate-spin w-5 h-5" /> : <><Wand2 className="w-5 h-5" /> Optimize for 2026 Model</>}
                            </button>
                        )}
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
                                <div className="flex justify-between items-start">
                                    <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-400">
                                        <Sparkles className="w-5 h-5" />
                                        Optimized Result
                                    </h2>
                                    {optimizedData.score ? (
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${optimizedData.score.overallScore >= 80 ? 'bg-emerald-900/40 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.2)] text-emerald-400' : optimizedData.score.overallScore >= 60 ? 'bg-amber-900/30 border-amber-500/50 text-amber-400' : 'bg-red-900/30 border-red-500/50 text-red-400'}`}>
                                            <span className="text-sm font-bold">New Score: {optimizedData.score.overallScore}/100</span>
                                        </div>
                                    ) : isEvaluatingOptimized ? (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-900/20 text-amber-400/70">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="text-xs">Verifying Quality...</span>
                                        </div>
                                    ) : null}
                                </div>

                                {optimizedData.score && optimizedData.score.overallScore < 70 && (
                                    <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold flex items-start gap-2 animate-in slide-in-from-top-2 duration-300">
                                        <span className="text-sm mt-0.5">⚠️</span>
                                        <p>This listing could not reach the quality threshold. Review weaknesses manually.</p>
                                    </div>
                                )}

                                {optimizedData.score && (
                                    <div className="space-y-2 mb-4">
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-emerald-900/50">
                                            <div className="text-xs text-slate-500 font-bold uppercase mb-2">Resolved</div>
                                            <ul className="space-y-1 text-xs text-emerald-400">
                                                {optimizedData.score.strengths.slice(0, 3).map((s, i) => (
                                                    <li key={i} className="flex items-start gap-1"><Check className="w-3 h-3 mt-0.5 shrink-0" /> {s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/50 flex flex-col gap-2 text-xs text-slate-400">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Title Core</strong> <span className={optimizedData.score.pillars.title >= 25 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{optimizedData.score.pillars.title}/30</span></div>
                                                <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Tag Quality</strong> <span className={optimizedData.score.pillars.tags >= 28 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{optimizedData.score.pillars.tags}/35</span></div>
                                                <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">Description</strong> <span className={optimizedData.score.pillars.description >= 15 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{optimizedData.score.pillars.description}/20</span></div>
                                                <div className="flex flex-col"><strong className="text-slate-500 text-[10px] uppercase">CTR Safety</strong> <span className={optimizedData.score.pillars.ctrRisk >= 10 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{optimizedData.score.pillars.ctrRisk}/15</span></div>
                                            </div>
                                            {optimizedData.score.ctrRiskReasons && optimizedData.score.ctrRiskReasons.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-slate-700/50">
                                                    <strong className="text-slate-500 uppercase text-[10px] block mb-1">CTR Risk Factors detected:</strong>
                                                    <ul className="space-y-1 text-[10px] text-slate-400">
                                                        {optimizedData.score.ctrRiskReasons.map((r, i) => <li key={i}>• {r}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {optimizedData.score.tagSubPillars && (
                                                <div className="mt-2 pt-2 border-t border-slate-700/50">
                                                    <strong className="text-slate-500 uppercase text-[10px] block mb-1">Tag Score Breakdown ({optimizedData.score.pillars.tags}/35)</strong>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                                        {Object.values(optimizedData.score.tagSubPillars).map((sp: any, i: number) => (
                                                            <div key={i} className="flex justify-between">
                                                                <span className="text-slate-500">{sp.label}</span>
                                                                <span className={sp.score >= sp.max ? 'text-emerald-400 font-bold' : sp.score > 0 ? 'text-amber-400' : 'text-red-400'}>{sp.score}/{sp.max}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {optimizedData.score && optimizedData.score.weaknesses && optimizedData.score.weaknesses.length > 0 && (
                                    <button
                                        onClick={handleRefine}
                                        disabled={isRefining}
                                        className="w-full py-2.5 bg-gradient-to-r from-amber-600/80 to-orange-600/80 hover:from-amber-500 hover:to-orange-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 text-amber-50 border border-amber-500/50"
                                    >
                                        {isRefining ? <Loader2 className="animate-spin w-5 h-5" /> : <><Sparkles className="w-5 h-5 text-amber-300" /> Auto-Fix Weaknesses to Improve Score</>}
                                    </button>
                                )}

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
                                        <span className={`text-xs mt-1 inline-block ${(optimizedData.title?.length || 0) > 140 ? 'text-red-400' : (optimizedData.title?.length || 0) >= 125 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                            {optimizedData.title?.length || 0}/140 characters
                                        </span>
                                    </section>

                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Tag className="w-3 h-3" /> Optimized Tags ({optimizedData.tags?.length || 0}/13)
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500">Click a tag to copy it</span>
                                                <button onClick={() => copyToClipboard(optimizedData.tags.join(', '), 'all-tags')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                    {copiedField === 'all-tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                    {copiedField === 'all-tags' ? 'Copied' : 'Copy All'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                                            {optimizedData.tags.map((tag, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => copyToClipboard(tag, `tag-${i}`)}
                                                    className="text-xs px-2 py-1 bg-amber-500/10 text-amber-200 rounded border border-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/40 transition-all cursor-pointer flex items-center gap-1"
                                                    title={`Copy: ${tag}`}
                                                >
                                                    {copiedField === `tag-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : null}
                                                    {tag}
                                                    {tag.length > 20 && <span className="text-red-400 ml-1">({tag.length})</span>}
                                                </button>
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
            )
            }
        </div >
    );
};

export default EtsySEOOptimizer;
