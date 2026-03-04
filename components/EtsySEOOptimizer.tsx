import React, { useState } from 'react';
import { Search, Loader2, Sparkles, Copy, Check, ExternalLink, Wand2, Tag, FileText, Type, ChevronLeft } from 'lucide-react';
import { evaluateListingSEO } from '../src/lib/seoScoringEngine';
import { JunkJournalPagesIdentity } from '../src/types/productIdentity';
import { buildIdentityLockPrompt } from '../src/lib/buildIdentityLockPrompt';
import { buildViolationReport } from '../src/lib/buildViolationReport';
import { calculateFillerDensity } from '../src/lib/seoEfficiencyRules';
import { calculateTagIntentScore, classifyTag } from '../src/lib/tagIntentClassifier';
import { analyzeTagContainment, violatesFormatContainment, getFormatViolations } from '../src/lib/productBoundaryGuard';

const FILLER_WORDS = ["beautiful", "amazing", "perfect", "lovely", "high quality"];

const FILLER_ONLY_SEGMENTS = new Set([
    "printable", "digital", "color", "digital download",
    "printable pages", "mixed media", "craft supplies", "digital papers",
    "journal magic", "printable journal magic"
]);

const removeFillerSegments = (title: string): string => {
    if (!title) return "";
    // Remove orphan single words (words surrounded by commas or at boundaries that stand alone)
    // Also remove filler-only phrases anywhere in the title
    let cleaned = title;
    for (const filler of FILLER_ONLY_SEGMENTS) {
        // Remove as standalone comma segment
        cleaned = cleaned.replace(new RegExp(`,\\s*${filler}\\s*,`, 'gi'), ',');
        cleaned = cleaned.replace(new RegExp(`,\\s*${filler}\\s*$`, 'gi'), '');
        cleaned = cleaned.replace(new RegExp(`^\\s*${filler}\\s*,`, 'gi'), '');
    }
    // Remove orphan single words (a single word between commas)
    cleaned = cleaned.replace(/,\s*\b[A-Za-z]{2,15}\b\s*(?=,|$)/g, '');
    return cleaned.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '').replace(/(?<![a-zA-Z0-9])[+%&](?![a-zA-Z0-9])/g, '').replace(/\s+/g, ' ').trim();
};

const applyReplacements = (text: string): string => {
    if (!text) return "";
    let newText = text.replace(/\bwall art\b/gi, "pages")
        .replace(/\bhome decor\b/gi, "pages")
        .replace(/\bcommercial use license\b/gi, "")
        .replace(/\bpdf download\b/gi, "")
        .replace(/\b\w+\s+magic\b/gi, "")        // [word] Magic combos
        .replace(/\bmagic\b/gi, "")                // standalone Magic
        .replace(/\b160\+?\b/g, "")                // specs: 160+
        .replace(/\b300\s*dpi\b/gi, "")            // specs: 300 DPI
        .replace(/\b8\.?5\s*x\s*11\b/gi, "")       // specs: 8.5x11
        .replace(/-/g, ',');                        // dashes → commas
    let cleanText = ` ${newText} `;
    for (const filler of FILLER_WORDS) {
        cleanText = cleanText.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }
    return cleanText.replace(/\s+/g, ' ').trim();
};

const removeTitleDuplicates = (title: string): string => {
    if (!title) return "";
    // Detect repeated root words (>2 occurrences) and trim the later occurrence phrase
    const words = title.split(/\s+/);
    const stopWords = new Set(["with", "for", "and", "the", "a", "an", "of", "in", "on", "to", "junk", "journal", "pages", "printable", "digital"]);
    const rootCounts = new Map<string, number>();
    const rootStem = (w: string) => w.toLowerCase().replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');

    for (const w of words) {
        // Strip only non-alpha for stemming, but skip words that are purely numeric/special (e.g. '160+')
        const alphaOnly = w.replace(/[^a-zA-Z]/g, '');
        if (alphaOnly.length === 0) continue; // skip pure numbers/symbols like '160+'
        const stem = rootStem(alphaOnly);
        if (stem.length > 2 && !stopWords.has(stem)) {
            rootCounts.set(stem, (rootCounts.get(stem) || 0) + 1);
        }
    }

    // Find stems that appear 3+ times
    const overusedStems = new Set<string>();
    for (const [stem, count] of rootCounts.entries()) {
        if (count > 2) overusedStems.add(stem);
    }

    if (overusedStems.size === 0) return title;

    // Split into phrases (by comma or connector) and remove later occurrences
    const phrases = title.split(/,\s*/).map(p => p.trim()).filter(p => p.length > 0);
    if (phrases.length <= 1) return title;

    const usedStems = new Map<string, number>();
    const kept: string[] = [];

    for (const phrase of phrases) {
        const phraseWords = phrase.split(/\s+/);
        let shouldDrop = false;

        for (const w of phraseWords) {
            const alphaOnly2 = w.replace(/[^a-zA-Z]/g, '');
            if (alphaOnly2.length === 0) continue; // skip pure numbers/symbols
            const stem = rootStem(alphaOnly2);
            if (overusedStems.has(stem)) {
                const count = (usedStems.get(stem) || 0) + 1;
                usedStems.set(stem, count);
                if (count > 2) {
                    console.log(`[TRACE] DEDUP: dropping phrase "${phrase}" (root "${stem}" used ${count}x)`);
                    shouldDrop = true;
                    break;
                }
            }
        }

        if (!shouldDrop) kept.push(phrase);
    }

    return kept.join(', ');
};

const truncateTo140 = (title: string): string => {
    if (!title) return "";
    let t = title.trim();
    if (t.length <= 140) return t;

    let truncated = t.substring(0, 140);
    // Cut at last word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) {
        truncated = truncated.substring(0, lastSpace);
    }

    return truncated.replace(/[,-\s]+$/, '').replace(/(?<![a-zA-Z0-9])[+%&](?![a-zA-Z0-9])/g, '').replace(/\s+/g, ' ').trim();
};

const ensureTitleLength = (title: string, identity: JunkJournalPagesIdentity, competitorPhrases?: string[]): string => {
    console.log('[TRACE] ensureTitleLength called with competitorPhrases:', competitorPhrases);
    console.log('[TRACE] Title before padding:', title, '| Length:', title?.length);
    if (!title) return "";
    let finalTitle = title.trim();

    finalTitle = truncateTo140(finalTitle);
    if (finalTitle.length >= 120) return finalTitle;

    const capitalizeWords = (str: string) => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const bannedTerms = ["set", "pack", "bundle", "collection", "clipart", "clip art", "png", "svg", "transparent", "stickers", "sticker", "washi", "tape", "stamps", "stamp", "foil", "die cut", "die cuts"];

    // Connector rotation — never use same connector twice consecutively
    const padConnectors = [', ', ' for ', ' with '];
    let lastConnectorIdx = -1;

    // Root-word extraction helper with normalization map for irregular plurals/synonyms
    const normalizationMap: Record<string, string> = {
        'kitties': 'cat', 'kitty': 'cat', 'kittens': 'cat', 'kitten': 'cat', 'cats': 'cat', 'feline': 'cat', 'felines': 'cat',
        'puppies': 'dog', 'puppy': 'dog', 'puppys': 'dog', 'dogs': 'dog', 'pups': 'dog', 'pup': 'dog',
        'bunnies': 'rabbit', 'bunny': 'rabbit', 'rabbits': 'rabbit',
        'roses': 'rose', 'rosy': 'rose',
        'butterflies': 'butterfly',
        'fairies': 'fairy', 'faeries': 'fairy',
        'foxes': 'fox', 'foxy': 'fox',
        'owls': 'owl',
        'flowers': 'flower', 'floral': 'flower', 'florals': 'flower',
    };
    const rootStem = (w: string) => {
        const lower = w.toLowerCase().replace(/[^a-z]/g, '');
        if (normalizationMap[lower]) return normalizationMap[lower];
        return lower.replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');
    };
    const stopWords = new Set(["with", "for", "and", "the", "a", "an", "of", "in", "on", "to", "junk", "journal", "pages", "printable", "digital"]);

    const getTitleRoots = (t: string): Set<string> => {
        const roots = new Set<string>();
        t.split(/\s+/).forEach(w => {
            const stem = rootStem(w);
            if (stem.length > 2 && !stopWords.has(stem)) roots.add(stem);
        });
        return roots;
    };

    // Global root frequency counter — counts every root stem in a string
    const getRootFrequencies = (t: string): Map<string, number> => {
        const freq = new Map<string, number>();
        t.split(/\s+/).forEach(w => {
            const stem = rootStem(w);
            if (stem.length > 2 && !stopWords.has(stem)) {
                freq.set(stem, (freq.get(stem) || 0) + 1);
            }
        });
        return freq;
    };

    // Aesthetic adjectives get stricter cap (max 2) vs nouns (max 3)
    const aestheticAdjectives = new Set([
        'whimsical', 'quirky', 'vintage', 'shabby', 'aesthetic', 'surreal', 'enchanted', 'dreamy',
        'mystical', 'ethereal', 'romantic', 'rustic', 'cottagecore', 'bohemian', 'retro', 'gothic',
        'celestial', 'moody', 'dark', 'grunge', 'pastel', 'watercolor', 'delicate', 'charming',
        'elegant', 'antique', 'nostalgic', 'serene', 'magical', 'fantastical', 'playful'
    ]);

    // Global root cap with split sensitivity: adjectives=2, nouns=3
    const wouldExceedRootCap = (currentTitle: string, candidateAddition: string): string | null => {
        const combined = `${currentTitle} ${candidateAddition}`;
        const freq = getRootFrequencies(combined);
        for (const [root, count] of freq.entries()) {
            const cap = aestheticAdjectives.has(root) ? 2 : 3;
            if (count > cap) return root;
        }
        return null;
    };

    // Priority 1: Competitor phrases — extend naturally with connectors
    const competitorOptions = (competitorPhrases || []).map(p => p.trim()).filter(p => p.length > 0);

    for (const phrase of competitorOptions) {
        if (finalTitle.length >= 120) { console.log('[TRACE] Reached 120, stopping'); break; }
        if (bannedTerms.some(banned => phrase.toLowerCase().includes(banned))) { console.log('[TRACE] SKIPPED (banned):', phrase); continue; }
        if (finalTitle.toLowerCase().includes(phrase.toLowerCase())) { console.log('[TRACE] SKIPPED (already in title):', phrase); continue; }

        // Root-word overlap filter: skip if phrase shares 2+ root words with existing title
        const titleRoots = getTitleRoots(finalTitle);
        const phraseRoots = phrase.split(/\s+/).map(w => rootStem(w)).filter(s => s.length > 2 && !stopWords.has(s));
        const overlapCount = phraseRoots.filter(r => titleRoots.has(r)).length;
        if (overlapCount >= 2) { console.log('[TRACE] SKIPPED (2+ root overlap):', phrase, '| overlaps:', overlapCount); continue; }

        // Enhanced echo guard: skip if candidate's last word matches the final word of ANY segment in the title
        const titleSegments = finalTitle.split(/,\s*|\bfor\b|\bwith\b|\band\b/i).map(s => s.trim()).filter(s => s.length > 0);
        const candidateWords = capitalizeWords(phrase).trim().split(/\s+/);
        const candidateLastWord = candidateWords[candidateWords.length - 1]?.toLowerCase();
        if (candidateLastWord) {
            const hasEcho = titleSegments.some(seg => {
                const segWords = seg.trim().split(/\s+/);
                return segWords[segWords.length - 1]?.toLowerCase() === candidateLastWord;
            });
            if (hasEcho) {
                console.log('[TRACE] SKIPPED (echo guard):', phrase, '| trailing word:', candidateLastWord);
                continue;
            }
        }

        // Build natural extension with rotating connector
        let nextIdx = (lastConnectorIdx + 1) % padConnectors.length;
        const connector = padConnectors[nextIdx];
        const addition = `${connector}${capitalizeWords(phrase)}`;

        if (finalTitle.length + addition.length > 140) { console.log('[TRACE] SKIPPED (would exceed 140):', phrase); continue; }

        // GLOBAL ROOT CAP: simulate combined string and check no root exceeds 3
        const overloadedRoot = wouldExceedRootCap(finalTitle, addition);
        if (overloadedRoot) {
            console.log(`[TRACE] SKIPPED (global root cap): '${phrase}' would push '${overloadedRoot}' over 3 occurrences`);
            continue;
        }

        finalTitle += addition;
        lastConnectorIdx = nextIdx;
        console.log('[TRACE] APPENDED:', addition, '| New length:', finalTitle.length);
    }

    if (finalTitle.length >= 120) return truncateTo140(finalTitle);

    // Priority 2: theme synonyms/secondary themes as natural extensions
    const descriptors = [...(identity.theme_synonyms || []), ...(identity.secondary_themes || [])];
    const uniqueDescriptors = Array.from(new Set(descriptors.map(d => d.trim().toLowerCase()))).filter(d => d.length > 0);

    for (const desc of uniqueDescriptors) {
        if (finalTitle.length >= 120) break;
        if (bannedTerms.some(banned => desc.toLowerCase().includes(banned))) continue;
        if (finalTitle.toLowerCase().includes(desc.toLowerCase())) continue;

        // Root-word overlap filter: skip if phrase shares 2+ root words with existing title
        const titleRoots2 = getTitleRoots(finalTitle);
        const descRoots = desc.split(/\s+/).map(w => rootStem(w)).filter(s => s.length > 2 && !stopWords.has(s));
        const descOverlap = descRoots.filter(r => titleRoots2.has(r)).length;
        if (descOverlap >= 2) { console.log('[TRACE] SKIPPED synonym (2+ root overlap):', desc); continue; }

        // Echo guard for synonyms: skip if candidate's last word echoes any segment-final word
        const synSegments = finalTitle.split(/,\s*|\bfor\b|\bwith\b|\band\b/i).map(s => s.trim()).filter(s => s.length > 0);
        const synCandidateWords = capitalizeWords(desc).trim().split(/\s+/);
        const synLastWord = synCandidateWords[synCandidateWords.length - 1]?.toLowerCase();
        if (synLastWord) {
            const synEcho = synSegments.some(seg => {
                const sw = seg.trim().split(/\s+/);
                return sw[sw.length - 1]?.toLowerCase() === synLastWord;
            });
            if (synEcho) { console.log('[TRACE] SKIPPED synonym (echo guard):', desc, '| trailing:', synLastWord); continue; }
        }

        // Rotating connector
        let nextIdx2 = (lastConnectorIdx + 1) % padConnectors.length;
        const connector2 = padConnectors[nextIdx2];
        const addition = `${connector2}${capitalizeWords(desc)}`;
        if (finalTitle.length + addition.length > 140) continue;

        // GLOBAL ROOT CAP: simulate combined string and check no root exceeds 3
        const overloadedRoot2 = wouldExceedRootCap(finalTitle, addition);
        if (overloadedRoot2) {
            console.log(`[TRACE] SKIPPED synonym (global root cap): '${desc}' would push '${overloadedRoot2}' over 3 occurrences`);
            continue;
        }

        finalTitle += addition;
        lastConnectorIdx = nextIdx2;
    }

    console.log('[TRACE] Title after padding:', finalTitle, '| Length:', finalTitle.length);
    return truncateTo140(finalTitle);
};


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

export interface ReferenceShop {
    shopId: string;
    verified: boolean;
}

export interface CompetitorInsights {
    searchQuery: string;
    themeTitles: string[];
    extractedPattern?: {
        themePhrases: string[];
    };
}

export const DEFAULT_REFERENCE_SHOPS: ReferenceShop[] = [
    { shopId: "BowArts", verified: false },
    { shopId: "junkjournalartt", verified: false },
    { shopId: "junkjournalprintable", verified: false },
    { shopId: "SweetRevealCo", verified: false },
    { shopId: "wrapito", verified: false },
    { shopId: "BontikVintageDesigns", verified: false },
    { shopId: "ArtemisJournals", verified: false }
];

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

    // Competitor Insights State
    const [referenceShops, setReferenceShops] = useState<ReferenceShop[]>(DEFAULT_REFERENCE_SHOPS);
    const [competitorInsights, setCompetitorInsights] = useState<CompetitorInsights | null>(null);
    const [isFetchingInsights, setIsFetchingInsights] = useState(false);
    const [showReferenceSettings, setShowReferenceSettings] = useState(false);
    const [newShopInput, setNewShopInput] = useState('');

    // Load reference shops from localStorage on mount
    React.useEffect(() => {
        const stored = localStorage.getItem('etsyReferenceShops');
        if (stored) {
            try {
                setReferenceShops(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse stored reference shops.");
            }
        }
    }, []);

    // Save reference shops whenever they change
    React.useEffect(() => {
        if (referenceShops !== DEFAULT_REFERENCE_SHOPS) {
            localStorage.setItem('etsyReferenceShops', JSON.stringify(referenceShops));
        }
    }, [referenceShops]);

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

    const evaluateListing = async (listing: { title: string, description: string, tags: string[] }, identityContract?: JunkJournalPagesIdentity, competitorPhrases?: string[]): Promise<SEOScore> => {
        // Now using purely deterministic TS analysis instead of LLM token burn
        return Promise.resolve(evaluateListingSEO(listing.title, listing.tags || [], listing.description, identityContract, competitorPhrases));
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
- primary_theme MUST be the FULL compound theme descriptor, not a single word. If the title says "Vintage Swatchbook Junk Journal Pages", the primary_theme is "vintage swatchbook" NOT just "vintage". If the title says "Dark Gothic Fairy", the primary_theme is "dark gothic fairy" NOT just "gothic". Always capture the complete, most-specific multi-word theme.
- primary_theme must be the subject/aesthetic ONLY — never include product words like 'junk journal', 'pages', 'printable', 'digital', 'kit', 'paper', 'scrapbook', 'ephemera', 'download' in the theme. Correct examples: 'cherry blossom', 'vintage swatchbook', 'whimsical cats', 'dark gothic fairy'. Wrong examples: 'cherry junk journal', 'vintage journal pages', 'gothic scrapbook kit'.
- If no theme is present, set primary_theme to "unthemed"
- If secondary_themes are not present, return []
- If confidence is below 0.7, still return the JSON but flag it
- Never add themes that are not explicitly supported by the original listing
- The locked_identity_terms MUST include the primary theme noun and "junk journal pages"
- For theme_synonyms, do not extract generic craft words like 'creative', 'artistic', 'vintage', 'antique'. Instead extract the specific buyer search phrases someone would type into Etsy when looking for THIS specific type of page. Think like a buyer, not a designer. For a swatchbook listing a buyer would search 'color swatch journal pages', 'paint chip printable', 'color palette pages' — not 'creative scrapbooking paper'. Do NOT include format words ('printable', 'digital') alone or invented compound words. Maximum 5 synonyms. If unsure, return fewer — an empty array is better than hallucinated terms.

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

                // Sanitize primary_theme: strip product words that GPT may include
                const PRODUCT_WORDS = ['journal', 'junk', 'pages', 'printable', 'digital', 'kit', 'download', 'paper', 'scrapbook', 'ephemera'];
                if (currentIdentity.primary_theme && currentIdentity.primary_theme !== 'unthemed') {
                    currentIdentity.primary_theme = currentIdentity.primary_theme
                        .split(' ')
                        .filter(w => !PRODUCT_WORDS.includes(w.toLowerCase()))
                        .join(' ')
                        .trim();
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
            searchQuery: `${currentIdentity!.primary_theme} junk journal`,
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

            // Extract descriptive vocabulary from theme results
            if (insights.themeTitles.length > 0) {
                const patternPrompt = `Analyze these Etsy listing titles that all relate to the theme "${currentIdentity!.primary_theme}".

Titles:
${insights.themeTitles.map(t => `- ${t}`).join('\n')}

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
}`;

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
                        if (patternContent.includes('```')) {
                            patternContent = patternContent.replace(/```json|```/g, '').trim();
                        }
                        insights.extractedPattern = JSON.parse(patternContent);
                        console.log('[TRACE] Extracted themePhrases:', insights.extractedPattern?.themePhrases);
                    }
                } catch (e) {
                    console.error("Pattern extraction failed", e);
                }
            }

            setCompetitorInsights(insights);
            console.log('[TRACE] insights.extractedPattern at setCompetitorInsights:', insights.extractedPattern);

        } catch (err) {
            console.error("Competitor intelligence phase failed silently", err);
        } finally {
            setIsFetchingInsights(false);
        }

        setIsOptimizing(true);

        const originalViolations = getFormatViolations(scrapedData.title, scrapedData.tags);

        const dynamicWarning = originalViolations.length > 0
            ? `BEFORE YOU WRITE ANYTHING: Read this first.\nThe words [${originalViolations.join(', ')}] appear in the original listing.\nThese words are FACTUALLY INCORRECT for this product.\nThis product is PAGES ONLY. Test every word you generate against this list before outputting.\nIf you are about to write "kit" — STOP. Replace it with "pages".\nIf you are about to write "set" — STOP. Replace it with "pages" or remove it.\n`
            : '';

        const swatchbookWarning = (extractedIdentity?.primary_theme?.toLowerCase().includes('swatch') || extractedIdentity?.primary_theme?.toLowerCase().includes('swatchbook'))
            ? 'This product contains colorful swatch and paint chip style pages. The correct search terms are "swatchbook journal pages", "color swatch printable", "paint chip journal pages" — NOT ephemera.\n'
            : '';

        let competitorPrompt = '';
        if (insights.extractedPattern && insights.extractedPattern.themePhrases.length > 0) {
            const phraseList = insights.extractedPattern.themePhrases.join(', ');
            competitorPrompt = [
                '=== 1. COMPETITOR INTELLIGENCE (PROVEN NICHE PHRASES) ===',
                `Proven buyer search phrases for this theme: ${phraseList}`,
                'IMPORTANT: Weave these phrases naturally into the sentence-structured title using connective language ("with", "for", "and").',
                'Do NOT append them as isolated comma-separated segments. Integrate them into the flowing product name.',
                ''
            ].join('\n');
        }

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            dynamicWarning,
            swatchbookWarning,
            '=== 0. PRODUCT CONSTRAINTS (MANDATORY IDENTITY LOCK) ===',
            buildIdentityLockPrompt(currentIdentity!),
            '',
            competitorPrompt,
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
            '=== 2. TITLE OPTIMIZATION (NLP SENTENCE STRUCTURE) ===',
            '',
            'Generate a title that reads like a natural product name, NOT a keyword list.',
            'Structure it as 2-3 flowing phrases connected with "with", "for", and commas — not just comma-separated keywords.',
            '',
            'FORMULA: [Adjective] [Theme] Junk Journal [Product Type] with [Style/Aesthetic] [Niche Noun], Printable [Use Case] [Format]',
            '',
            `Where [Theme] = "${(currentIdentity!.primary_theme || 'Theme').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}"`,
            `Where [Niche Noun] comes from proven phrases in Section 1: ${insights.extractedPattern ? insights.extractedPattern.themePhrases.join(', ') : 'ephemera, collage sheets, digital papers, scrapbook'}`,
            '',
            'GOOD EXAMPLE: "Vintage Cat and Kitten Junk Journal Pages with Cottagecore Ephemera, Printable Scrapbook Collage Sheets"',
            'BAD EXAMPLE: "Cat With Kitten Junk Journal Pages, Cats Collage Ephemera, Vintage Cats And Kittens, Cottage Cats Ephemera"',
            '',
            'STRICT GENERATION RULES:',
            '- EXTENDED SENTENCE: You MUST generate a highly detailed, extended sentence. Your generated sentence must explicitly include the Primary Theme, the Product Type, at least two Aesthetic Adjectives, and the intended Use Case or Audience. Do not return short summaries.',
            '- 60-CHARACTER ANCHOR: The first 60 characters must clearly state the core product (e.g. "Vintage Swatchbook Junk Journal Pages").',
            '- NATURAL CONNECTORS: Use "with" or "for" to connect context naturally. Do not just list comma segments.',
            '- DENSITY CAP: Never repeat the exact same root word more than twice in the entire title. "Cat" appearing 3+ times = rejected.',
            '- COMPETITOR INTEGRATION: Weave competitor phrases naturally into the sentence flow, not as standalone comma segments.',
            '- NO ORPHANS: Zero standalone, single-word segments allowed.',
            '- Do NOT use filler words: beautiful, perfect, amazing, high quality, lovely.',
            '- BANNED PHRASES: "Commercial Use License", "PDF Download", any "[word] Magic" combo (e.g. "Journal Magic", "Printable Journal Magic"), "160+", "300 DPI", "8.5x11". Do NOT include these anywhere.',
            '- BANNED CHARACTERS: Never use dashes (-) in titles. Etsy titles use commas only. Specs (page count, DPI, dimensions) belong in the description, NEVER in the title.',
            '',
            '=== 3. TAG STRATEGY (EXPANSION MODEL) ===',
            '',
            'Output exactly 13 tags.',
            '',
            'RESERVED SLOTS (MANDATORY): You MUST reserve exactly 3 of your 13 tags for product format and licensing:',
            '- One tag for delivery format (e.g., "digital download", "instant download")',
            '- One tag for product type (e.g., "printable journal", "digital journal")',
            '- One tag for license (e.g., "commercial use")',
            'Use the remaining 10 tags for exact-match aesthetic and competitor keywords.',
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
            '=== 3. DESCRIPTION OPTIMIZATION (SEO + CONVERSION MODEL) ===',
            '',
            'Descriptions influence: Google ranking, Etsy semantic indexing, buyer confidence, conversion rate, and time on listing.',
            '',
            '=== RULE 1: GOOGLE META-HOOK (First 160 Characters) ===',
            'The VERY FIRST sentence of the description MUST be a highly engaging, natural sentence that:',
            `- Explicitly includes the Primary Theme ("${(currentIdentity!.primary_theme || 'Theme').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}")`,
            '- Explicitly includes the Product Type (e.g., "junk journal pages", "printable pages")',
            '- Reads like a premium brand introduction',
            '- Fits within 160 characters (Google meta description snippet cutoff)',
            'GOOD: "Transform your junk journals with these richly detailed vintage cat-themed pages, designed for collectors, crafters, and artists who love whimsical aesthetics."',
            'BAD: "Vintage Cat Junk Journal Pages Digital Download Printable Ephemera Scrapbook Papers"',
            '',
            '=== RULE 2: SEMANTIC WEAVE (LSI Keyword Integration) ===',
            `You must naturally weave these exact competitor phrases into the SECOND paragraph of the description using proper, flowing sentences:`,
            ...(insights.extractedPattern && insights.extractedPattern.themePhrases.length > 0
                ? [`PHRASES TO WEAVE: ${insights.extractedPattern.themePhrases.slice(0, 3).join(', ')}`,
                    'Integrate these as natural descriptive language — do NOT list them as a comma-separated block.',
                    'Example: "These pages feature [phrase1] styling with [phrase2] motifs, perfect for creating [phrase3] projects."']
                : ['Use theme-relevant competitor vocabulary naturally in the second paragraph.']),
            '',
            '=== RULE 3: TECHNICAL BULLET POINTS (Conversion Hooks) ===',
            'The product specifications MUST be formatted as a clean, scannable bulleted list (### section with emoji header).',
            'This list MUST always include ALL of the following:',
            `- Page count: "${currentIdentity!.page_count || 160}+ High-Resolution Printable Pages"`,
            '- File quality: "300 DPI — Print-Ready Quality"',
            '- Print size: "8.5 x 11 Inches"',
            '- License: "Commercial Use License Included"',
            '- Delivery: "Instant Digital Download via Google Drive"',
            'These specs are BANNED from the title but MANDATORY in the description.',
            '',
            '=== DESCRIPTION STRUCTURE (Follow This Order) ===',
            '',
            'Paragraph 1 — Google Meta-Hook (1-2 sentences, max 160 chars)',
            `Lead with the Primary Theme and Product Type. Name the buyer persona. Must be indexable by Google.`,
            '',
            'Paragraph 2 — Semantic Weave (2-3 sentences)',
            'Naturally integrate the competitor phrases listed above. Describe the aesthetic, mood, and artistic details.',
            'Include at least one SPECIFIC differentiating element unique to this listing.',
            '',
            "Paragraph 3 — What's Included (bulleted list with emoji header)",
            `- ${currentIdentity!.page_count || 160}+ high-resolution JPG journal pages`,
            '- Print size: 8.5 x 11 inches',
            '- Resolution: 300 DPI — print-ready quality',
            `- Theme: ${(currentIdentity!.primary_theme || 'Theme').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} with ${(currentIdentity!.secondary_themes || ['vintage']).join(', ')}`,
            '- Commercial use license included',
            '',
            'Paragraph 4 — How Delivery Works (must be crystal clear)',
            '"This is a DIGITAL DOWNLOAD. After purchase you will receive a PDF file. Inside that PDF is a Google Drive link where you can instantly download all [NUMBER]+ JPG image files directly to your device. No physical item will be shipped."',
            '',
            'Paragraph 5 — Usage Ideas (2-3 sentences)',
            'Print at home or at a print shop. Use in junk journals, art journals, scrapbooks, mixed media projects, or planners.',
            '',
            'Paragraph 6 — License Statement (1-2 sentences)',
            '"Commercial use license is included with your purchase. You may use these pages in journals or products you sell."',
            '',
            'D. Structure Preservation Rule:',
            '- CRITICAL: Use \\\\n (newline characters) in the JSON description value to preserve line breaks, section headers, spacing, and paragraph structure',
            '- Keep emoji headers (###), bullet lists, and section formatting',
            '- Minimum length: 800+ characters',
            '',
            'E. Input Boundaries Rule:',
            'Do NOT introduce themes, motifs, aesthetics, or use cases that are not supported by the original title or description.',
            'Enhance — do not fabricate.',
            '',
            '=== F. MARKET CLUSTER POSITIONING & EMOTIONAL ENGINE (MANDATORY) ===',
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
            'Do not write "ephemera". Do not write "ephemera collage". Do not write "digital ephemera". Write "journal pages" or "collage pages" or "digital journal pages" instead.',
            'Do not put "Commercial Use" in the title.',
            'Every tag must contain one of: pages, journal, printable, papers, download.',
            'Never repeat a tag. All 13 tags must be completely unique — no duplicates, no near-duplicates like "whimsical cat" and "whimsical cats".',
            'Never repeat a tag concept. If you use "rustic greenhouse" as a tag, do not use "greenhouse pages", "rustic pages", or any other tag that shares a root word with a tag you already wrote. Treat each tag as a unique signal — no overlapping roots.',
            'Check every tag before outputting. If any two tags share the same root word, delete one. Examples: "printable journal" and "printable pages" both start with "printable" — keep only one. "vintage journal" and "vintage papers" both start with "vintage" — keep only one. Output 13 completely unique tags with no shared root words.',
            'Do not repeat "pages" more than once in the title. If "journal pages" is already present, do not add "printable pages" at the end.',
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

                // SILENT POST-PROCESSING
                console.log('[TRACE] Before post-processing — raw title:', aiResponse.title, '| Length:', aiResponse.title?.length);
                aiResponse.title = removeFillerSegments(aiResponse.title);
                aiResponse.title = applyReplacements(aiResponse.title);
                aiResponse.title = removeTitleDuplicates(aiResponse.title);
                console.log('[TRACE] After dedup, before padder:', aiResponse.title, '| Length:', aiResponse.title?.length);
                aiResponse.title = ensureTitleLength(aiResponse.title, currentIdentity!, insights.extractedPattern?.themePhrases);
                aiResponse.title = truncateTo140(aiResponse.title);
                if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                    aiResponse.tags = aiResponse.tags.map((tag: string) => applyReplacements(tag));
                }

                setIsEvaluatingOptimized(true);
                const evalScore = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                }, currentIdentity || undefined, insights.extractedPattern?.themePhrases);
                setIsEvaluatingOptimized(false);

                if (!bestScoreObj || evalScore.overallScore > bestScoreObj.overallScore) {
                    bestScoreObj = evalScore;
                    bestOptimizedData = { ...aiResponse, score: evalScore };
                    console.log(`[TRACE] Attempt ${attempt} is NEW BEST: score=${evalScore.overallScore}, title="${aiResponse.title}" (${aiResponse.title?.length} chars)`);
                } else {
                    console.log(`[TRACE] Attempt ${attempt} NOT best: score=${evalScore.overallScore} vs best=${bestScoreObj.overallScore}`);
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

        const swatchbookWarning = (extractedIdentity?.primary_theme?.toLowerCase().includes('swatch') || extractedIdentity?.primary_theme?.toLowerCase().includes('swatchbook'))
            ? 'This product contains colorful swatch and paint chip style pages. The correct search terms are "swatchbook journal pages", "color swatch printable", "paint chip journal pages" — NOT ephemera.\n'
            : '';

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            dynamicWarning,
            swatchbookWarning,
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
            'TITLE RULES (NLP SENTENCE STRUCTURE):',
            '- EXTENDED SENTENCE: You MUST generate a highly detailed, extended sentence. Include the Primary Theme, Product Type, at least two Aesthetic Adjectives, and the Use Case/Audience. Do not return short summaries.',
            '- Structure: 2-3 flowing phrases connected with "with", "for", and commas — NOT a keyword list.',
            '- FORMULA: [Adjective] [Theme] Junk Journal [Product Type] with [Style/Aesthetic] [Niche Noun], Printable [Use Case] [Format]',
            '- 60-CHARACTER ANCHOR: State the main product clearly within the first 60 characters.',
            '- NATURAL CONNECTORS: Use "with" or "for" to connect context naturally.',
            '- DENSITY CAP: Never repeat the exact same root word more than twice.',
            '- Do NOT use filler words: beautiful, perfect, amazing, high quality, lovely.',
            '- BANNED: any "[word] Magic" combo, "160+", "300 DPI", "8.5x11", dashes (-). Specs go in description only.',
            '- GOOD: "Vintage Swatchbook Junk Journal Pages with Color Swatch Ephemera, Printable Paint Chip Collage Sheets"',
            '- BAD: "Vintage Swatchbook Junk Journal Pages, Vintage Swatch Collage, Swatchbook Ephemera, Vintage Papers"',
            '- Weave competitor phrases naturally into the sentence. Do not append them as isolated comma segments.',
            '- Tags: EXACTLY 13 tags. MAX 20 chars per tag. CRITICAL: At least 5 tags MUST contain a core product noun (e.g. "junk journal", "scrapbook", "paper pack", "journal pages"). Formula: Product + Theme + Use Case.',
            '- TAG RULE: Never end a tag with a noun that has no product signal. "art journaling", "creative journaling", "cat art" are BANNED patterns. Every tag MUST contain one of: pages, journal, printable, papers, download.',
            '- TITLE RULE: NEVER include "Commercial Use" or license language in the title. The title is for search discovery only.',
            '- Description: OVER 800 chars. Pick ONE dominant market cluster. MUST USE \\n for line breaks to preserve formatting.',
            '',
            '=== OUTPUT (JSON ONLY) ===',
            'Respond ONLY with a valid JSON object matching the exact structure previously requested: {"title": "", "description": "", "tags": []}.',
            '',
            'FINAL REMINDER BEFORE YOU OUTPUT:',
            'Do not write "kit". Write "pages" instead.',
            'Do not write "journal kit". Write "journal pages" instead.',
            'Do not write "ephemera". Do not write "ephemera collage". Do not write "digital ephemera". Write "journal pages" or "collage pages" or "digital journal pages" instead.',
            'Do not put "Commercial Use" in the title.',
            'Every tag must contain one of: pages, journal, printable, papers, download.',
            'Never repeat a tag. All 13 tags must be completely unique — no duplicates, no near-duplicates like "whimsical cat" and "whimsical cats".',
            'Never repeat a tag concept. If you use "rustic greenhouse" as a tag, do not use "greenhouse pages", "rustic pages", or any other tag that shares a root word with a tag you already wrote. Treat each tag as a unique signal — no overlapping roots.',
            'Check every tag before outputting. If any two tags share the same root word, delete one. Examples: "printable journal" and "printable pages" both start with "printable" — keep only one. "vintage journal" and "vintage papers" both start with "vintage" — keep only one. Output 13 completely unique tags with no shared root words.',
            'Do not repeat "pages" more than once in the title. If "journal pages" is already present, do not add "printable pages" at the end.',
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

                // SILENT POST-PROCESSING
                aiResponse.title = removeFillerSegments(aiResponse.title);
                aiResponse.title = applyReplacements(aiResponse.title);
                aiResponse.title = removeTitleDuplicates(aiResponse.title);
                aiResponse.title = ensureTitleLength(aiResponse.title, extractedIdentity!, competitorInsights?.extractedPattern?.themePhrases);
                aiResponse.title = truncateTo140(aiResponse.title);
                if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                    aiResponse.tags = aiResponse.tags.map((tag: string) => applyReplacements(tag));
                }

                setIsEvaluatingOptimized(true);
                const evalScore = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                }, extractedIdentity || undefined, competitorInsights?.extractedPattern?.themePhrases);
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
        <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-900 text-slate-100 min-h-screen">
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

                <div className="flex justify-between items-center mt-4">
                    <button
                        onClick={() => setShowReferenceSettings(!showReferenceSettings)}
                        className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                    >
                        ⚙️ Reference Shops ({referenceShops.length})
                    </button>
                    {isFetchingInsights && (
                        <div className="text-xs text-amber-400 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Fetching Competitor Intelligence...
                        </div>
                    )}
                </div>

                {showReferenceSettings && (
                    <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-3 mt-4">
                        <div className="text-sm font-semibold text-slate-300">Trusted Reference Shops</div>
                        <div className="flex flex-wrap gap-2">
                            {referenceShops.map(shop => (
                                <div key={shop.shopId} className="flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 text-xs">
                                    <span>{shop.shopId}</span>
                                    {shop.verified && <span title="Verified 1000+ Sales" className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                                    <button
                                        onClick={() => setReferenceShops(prev => prev.filter(s => s.shopId !== shop.shopId))}
                                        className="ml-1 text-slate-500 hover:text-red-400"
                                    >×</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newShopInput}
                                onChange={e => setNewShopInput(e.target.value)}
                                placeholder="Add shop ID..."
                                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm outline-none focus:border-purple-500"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && newShopInput.trim()) {
                                        if (!referenceShops.some(s => s.shopId.toLowerCase() === newShopInput.trim().toLowerCase())) {
                                            setReferenceShops(prev => [...prev, { shopId: newShopInput.trim(), verified: false }]);
                                        }
                                        setNewShopInput('');
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    if (newShopInput.trim() && !referenceShops.some(s => s.shopId.toLowerCase() === newShopInput.trim().toLowerCase())) {
                                        setReferenceShops(prev => [...prev, { shopId: newShopInput.trim(), verified: false }]);
                                    }
                                    setNewShopInput('');
                                }}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                            >Add</button>
                        </div>
                    </div>
                )}

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

                        {competitorInsights && (
                            <div className="mt-6 pt-6 border-t border-slate-700 space-y-4 animate-in fade-in duration-500">
                                <h3 className="text-sm font-bold flex items-center gap-2 text-amber-400 uppercase tracking-wider">
                                    <Sparkles className="w-4 h-4" /> Competitor Intelligence
                                </h3>
                                <div className="space-y-4">
                                    {competitorInsights.extractedPattern && (
                                        <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg space-y-3">
                                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wide">AI Extracted Keyword Phrasing</h4>
                                            <div className="space-y-1 text-xs text-slate-300">
                                                <span className="font-semibold text-slate-400 block mb-1">Unique Theme Phrases:</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {(competitorInsights.extractedPattern.themePhrases || []).map((p, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 bg-emerald-900/50 border border-emerald-700/50 rounded text-emerald-300">{p}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {competitorInsights.themeTitles.length > 0 && (
                                        <div className="p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                                            <div className="text-xs text-slate-500 font-bold mb-2">Etsy Search Query: "{competitorInsights.searchQuery}"</div>
                                            <ul className="space-y-1">
                                                {competitorInsights.themeTitles.map((title, j) => (
                                                    <li key={j} className="text-xs text-slate-300 flex items-start gap-1">
                                                        <span className="text-slate-600 shrink-0 mt-0.5">•</span>
                                                        <span className="line-clamp-2">{title}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
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
