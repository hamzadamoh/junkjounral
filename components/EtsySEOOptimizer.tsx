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
    "journal magic", "printable journal magic",
    "printable download", "whimsical background", "vintage background",
    "background", "download"
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
                    shouldDrop = true;
                    break;
                }
            }
        }

        if (!shouldDrop) kept.push(phrase);
    }

    return (Array.isArray(kept) ? kept : []).join(', ');
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

    // Alien theme filter: build vocabulary set from product identity
    const identityVocab = new Set<string>();
    const genericProductWords = new Set(['art', 'paper', 'craft', 'print', 'page', 'ephemera', 'collage', 'scrapbook', 'background', 'mixed', 'media', 'decorative', 'ornamental']);
    // Add primary theme words
    if (identity.primary_theme && identity.primary_theme !== 'unthemed') {
        identity.primary_theme.toLowerCase().split(/\s+/).forEach(w => { identityVocab.add(rootStem(w)); identityVocab.add(w.toLowerCase()); });
    }
    // Add secondary themes
    (identity.secondary_themes || []).forEach(t => t.toLowerCase().split(/\s+/).forEach(w => { identityVocab.add(rootStem(w)); identityVocab.add(w.toLowerCase()); }));
    // Add theme synonyms
    (identity.theme_synonyms || []).forEach(s => s.toLowerCase().split(/\s+/).forEach(w => { identityVocab.add(rootStem(w)); identityVocab.add(w.toLowerCase()); }));
    // Add color palette
    (identity.color_palette || []).forEach(c => c.toLowerCase().split(/\s+/).forEach(w => { identityVocab.add(rootStem(w)); identityVocab.add(w.toLowerCase()); }));

    const isAlienPhrase = (phrase: string): boolean => {
        const phraseWords = phrase.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        for (const w of phraseWords) {
            const stem = rootStem(w);
            if (stopWords.has(w) || stopWords.has(stem)) continue;
            if (genericProductWords.has(w) || genericProductWords.has(stem)) continue;
            if (identityVocab.has(w) || identityVocab.has(stem)) continue;
            return true; // word not in identity — alien
        }
        return false;
    };

    // Priority 1: Competitor phrases — extend naturally with connectors
    const competitorOptions = (competitorPhrases || []).map(p => p.trim()).filter(p => p.length > 0);

    for (const phrase of competitorOptions) {
        if (finalTitle.length >= 100) break;
        if (bannedTerms.some(banned => phrase.toLowerCase().includes(banned))) continue;
        if (finalTitle.toLowerCase().includes(phrase.toLowerCase())) continue;

        // Root-word overlap filter: skip if phrase shares 2+ root words with existing title
        const titleRoots = getTitleRoots(finalTitle);
        const phraseRoots = phrase.split(/\s+/).map(w => rootStem(w)).filter(s => s.length > 2 && !stopWords.has(s));
        const overlapCount = phraseRoots.filter(r => titleRoots.has(r)).length;
        if (overlapCount >= 2) continue;

        // Alien theme filter: skip if any word in phrase is not in product identity
        if (isAlienPhrase(phrase)) continue;

        // Enhanced echo guard: skip if candidate's last word matches the final word of ANY segment
        const titleSegments = finalTitle.split(/,\s*|\bfor\b|\bwith\b|\band\b/i).map(s => s.trim()).filter(s => s.length > 0);
        const candidateWords = capitalizeWords(phrase).trim().split(/\s+/);
        const candidateLastWord = candidateWords[candidateWords.length - 1]?.toLowerCase();
        if (candidateLastWord) {
            const hasEcho = titleSegments.some(seg => {
                const segWords = seg.trim().split(/\s+/);
                return segWords[segWords.length - 1]?.toLowerCase() === candidateLastWord;
            });
            if (hasEcho) continue;
        }

        // Build natural extension with rotating connector
        let nextIdx = (lastConnectorIdx + 1) % padConnectors.length;
        const connector = padConnectors[nextIdx];
        const addition = `${connector}${capitalizeWords(phrase)}`;

        if (finalTitle.length + addition.length > 140) continue;

        // GLOBAL ROOT CAP: simulate combined string and check no root exceeds cap
        const overloadedRoot = wouldExceedRootCap(finalTitle, addition);
        if (overloadedRoot) continue;

        finalTitle += addition;
        lastConnectorIdx = nextIdx;
    }

    if (finalTitle.length >= 100) return truncateTo140(finalTitle);

    // Priority 2: theme synonyms/secondary themes as natural extensions
    const descriptors = [...(identity.theme_synonyms || []), ...(identity.secondary_themes || [])];
    const uniqueDescriptors = Array.from(new Set(descriptors.map(d => d.trim().toLowerCase()))).filter(d => d.length > 0);

    for (const desc of uniqueDescriptors) {
        if (finalTitle.length >= 100) break;
        if (bannedTerms.some(banned => desc.toLowerCase().includes(banned))) continue;
        if (finalTitle.toLowerCase().includes(desc.toLowerCase())) continue;

        // Root-word overlap filter
        const titleRoots2 = getTitleRoots(finalTitle);
        const descRoots = desc.split(/\s+/).map(w => rootStem(w)).filter(s => s.length > 2 && !stopWords.has(s));
        const descOverlap = descRoots.filter(r => titleRoots2.has(r)).length;
        if (descOverlap >= 2) continue;

        // Echo guard for synonyms
        const synSegments = finalTitle.split(/,\s*|\bfor\b|\bwith\b|\band\b/i).map(s => s.trim()).filter(s => s.length > 0);
        const synCandidateWords = capitalizeWords(desc).trim().split(/\s+/);
        const synLastWord = synCandidateWords[synCandidateWords.length - 1]?.toLowerCase();
        if (synLastWord) {
            const synEcho = synSegments.some(seg => {
                const sw = seg.trim().split(/\s+/);
                return sw[sw.length - 1]?.toLowerCase() === synLastWord;
            });
            if (synEcho) continue;
        }

        // Rotating connector
        let nextIdx2 = (lastConnectorIdx + 1) % padConnectors.length;
        const connector2 = padConnectors[nextIdx2];
        const addition = `${connector2}${capitalizeWords(desc)}`;
        if (finalTitle.length + addition.length > 140) continue;

        // GLOBAL ROOT CAP
        const overloadedRoot2 = wouldExceedRootCap(finalTitle, addition);
        if (overloadedRoot2) continue;

        finalTitle += addition;
        lastConnectorIdx = nextIdx2;
    }

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

export interface NickMethodReport {
    brainstorm: { descriptive: string[], anchors: string[] };
    originalScore: { titleScore: number, tagScore: number, total: number, rating: string, breakdown: string[] };
    optimizedScore: { titleScore: number, tagScore: number, total: number, rating: string, breakdown: string[] };
    improvedTitle: string;
    improvedTags: string[];
    badAdviceWarning?: string;
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

async function extractVisualIdentity(imageUrl: string, useOpenRouter: boolean): Promise<string> {
    try {
        const model = useOpenRouter ? "google/gemma-3-27b-it:free" : "gpt-4o";
        const response = await fetch("/api/openai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                isOpenRouter: useOpenRouter,
                max_tokens: 800,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: { url: imageUrl }
                            },
                            {
                                type: "text",
                                text: `You are analyzing an Etsy product listing image for SEO purposes.
              
Describe exactly what you see. Be specific and literal — no guessing.
Focus on:
1. VISUAL MOTIFS: What objects, symbols, patterns are visible?
   CRITICAL: Identify the PRIMARY SUBJECT of the product.
   The primary subject is the most dominant visual element that defines 
   what this product IS (e.g., doors, cats, roses, playing cards).
   List it first in the motifs array.
2. COLOR PALETTE: What are the dominant colors and tones?
3. STYLE/AESTHETIC: What artistic style is this? (e.g. Victorian, watercolor, grunge)
4. MOOD/ATMOSPHERE: What feeling does this evoke? (e.g. spooky, elegant, rustic)
5. PRODUCT TYPE: What is this product exactly based on visual evidence alone?
6. TARGET BUYER: Who would buy this based on what you see?

Return ONLY a JSON object:
{
  "motifs": ["playing cards", "spades", "hearts", ...],
  "colors": ["deep red", "black", "aged parchment", ...],
  "style": "vintage grunge watercolor",
  "mood": ["nostalgic", "artistic", "bohemian"],
  "productType": "printable junk journal ephemera kit",
  "targetBuyer": "scrapbookers and mixed media artists"
}`
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();
        if (!response.ok) {
            console.warn("Vision extraction failed, proceeding without visual identity:", data);
            return "Visual analysis unavailable (proceeding with text description)";
        }
        const raw = data.choices[0].message.content;
        const clean = raw.replace(/```json|```/g, "").trim();
        return clean;
    } catch (err) {
        console.warn("Graceful degradation: Vision extraction failed:", err);
        return "Visual analysis unavailable (proceeding with text description)";
    }
}

interface EtsySEOOptimizerProps {
    onClose?: () => void;
}

const EtsySEOOptimizer: React.FC<EtsySEOOptimizerProps> = ({ onClose }) => {
    const [url, setUrl] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [useOpenRouter, setUseOpenRouter] = useState(false);

    const [isEvaluatingOriginal, setIsEvaluatingOriginal] = useState(false);
    const [isEvaluatingOptimized, setIsEvaluatingOptimized] = useState(false);
    const [scrapedData, setScrapedData] = useState<ScrapedDetails | null>(null);
    const [optimizedData, setOptimizedData] = useState<NickMethodReport | null>(null);
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
            // --- DEFENSIVE TAGS START ---
            const sanitizedTags = Array.isArray(data.tags) ? data.tags : [];
            setScrapedData({ ...data, tags: sanitizedTags });
            // --- DEFENSIVE TAGS END ---

            // Kick off original listing evaluation
            setIsEvaluatingOriginal(true);
            try {
                const score = await evaluateListing({
                    title: data.title,
                    description: data.description,
                    tags: Array.isArray(data.tags) ? data.tags : []
                });
                setScrapedData(prev => prev ? { ...prev, score, tags: Array.isArray(data.tags) ? data.tags : [] } : null);

                // --- IDENTITY GUARD START ---
                setIsAnalyzingProduct(true);
                // Pass a partial object to avoid .join() errors on string input
                const identityPrompt = buildIdentityLockPrompt({
                    primary_theme: "EXTRACT FROM DESCRIPTION BELOW",
                    secondary_themes: [],
                    color_palette: [],
                    locked_identity_terms: [],
                    mood: "unknown",
                    page_count: "unknown",
                    theme_cluster: "unthemed"
                } as any) + `\n\nListing Description for Extraction:\n${data.description}`;
                const identityResponse = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: useOpenRouter ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o',
                        isOpenRouter: useOpenRouter,
                        messages: [
                            { role: 'system', content: 'You are an Etsy SEO expert. Respond ONLY with valid JSON.' },
                            { role: 'user', content: identityPrompt }
                        ],
                        response_format: { type: 'json_object' }
                    })
                });

                if (identityResponse.ok) {
                    const idResult = await identityResponse.json();
                    let idContent = idResult.choices[0].message.content;
                    if (idContent.includes('```')) idContent = idContent.replace(/```json|```/g, '').trim();
                    const identity = JSON.parse(idContent) as JunkJournalPagesIdentity;
                    console.log("extractedIdentity:", identity);

                    // Sanitize synonyms
                    const { valid } = sanitizeSynonyms(identity.theme_synonyms || []);
                    identity.theme_synonyms = valid;

                    // Standardize identity with safe defaults to prevent render crashes
                    const normalizedIdentity: JunkJournalPagesIdentity = {
                        ...identity,
                        secondary_themes: Array.isArray(identity.secondary_themes) ? identity.secondary_themes : [],
                        theme_synonyms: Array.isArray(identity.theme_synonyms) ? identity.theme_synonyms : [],
                        file_types: Array.isArray(identity.file_types) ? identity.file_types : [],
                        color_palette: Array.isArray(identity.color_palette) ? identity.color_palette : [],
                        locked_identity_terms: Array.isArray(identity.locked_identity_terms) ? identity.locked_identity_terms : [],
                    };

                    setExtractedIdentity(normalizedIdentity);
                    setSynonymInput((Array.isArray(valid) ? valid : []).join(', '));
                    setShowIdentityConfirmation(true);
                }
            } catch (evalErr) {
                console.error("Failed to evaluate/analyze listing:", evalErr);
            } finally {
                setIsEvaluatingOriginal(false);
                setIsAnalyzingProduct(false);
            }
            // --- IDENTITY GUARD END ---

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleOptimize = async () => {
        if (!scrapedData) return;

        console.log("productIdentity:", extractedIdentity);

        setError(null);
        setIsOptimizing(true);
        setOptimizedData(null);

        try {
            // 1. Get visual identity from first listing image
            let visualIdentity = "None provided";
            if (scrapedData.imageUrl) {
                visualIdentity = await extractVisualIdentity(scrapedData.imageUrl, useOpenRouter);
            }

            // 2. Merge with existing text-based identity
            const fullIdentity = `
TEXT IDENTITY:
${extractedIdentity ? JSON.stringify(extractedIdentity, null, 2) : "Assume this is a printable junk journal kit/pages product."}

VISUAL IDENTITY (from image analysis):
${visualIdentity}
`;

            const prompt = `You are an Etsy SEO expert executing the "Nick Method".

==== LISTING DATA ====
Title: ${scrapedData.title}
Tags: ${scrapedData.tags.join(', ')}
Description: ${scrapedData.description.substring(0, 1000)}

==== PRODUCT IDENTITY ====
${fullIdentity}

PRODUCT IDENTITY includes both a text-based identity extracted from the 
listing description AND a visual identity extracted directly from the 
product images by a vision model. 

The visual identity is ground truth — it overrides any assumptions. 
If the visual identity says the product contains playing cards and grunge 
paper, every brainstorm word and keyword must reflect that accurately.

==== NICK METHOD INSTRUCTIONS ====
1. BRAINSTORM CLOUD:
   - "descriptive": Generate 15-20 highly descriptive, aesthetic, and specific words that describe the vibe, theme, and style in the listing.
   - "anchors": Generate 4-6 strong product anchor phrases (2-3 words each) that define exactly what the core item is.

2. SEO SCORING:
The JSON must include TWO score objects:

"originalScore": {
  Grade the ORIGINAL title and tags using the Nick Method rubric.
  titleScore: out of 30, tagScore: out of 35, total: out of 65, rating: string, breakdown: array of strings
},

"optimizedScore": {
  Grade YOUR OWN improved title and improved tags using the same rubric.
  titleScore: out of 30, tagScore: out of 35, total: out of 65, rating: string, breakdown: array of strings
}

3. OPTIMIZATION:
   - "improvedTitle": 
TITLE RULES (non-negotiable):
- Must be between 130-140 characters. Count before outputting.
- Must contain exactly 3-4 keyword strings separated by commas.
- Each string format: [descriptor] [descriptor] [anchor noun]
- Example structure: "Spooky dark junk journal kit printable pages, vintage grunge poker ephemera digital, retro playing card scrapbook paper, antique craft journal download"
- NO "and", NO colons, NO natural sentences.
TITLE RULES ADDITION:
- IDENTITY LOCK: The primary subject identified in the Visual Identity 
  (e.g., "rustic doors") MUST appear as a keyword in the improved title.
  If it does not appear, the title fails the accuracy test regardless 
  of character count or structure.
- BANNED ANCHOR PHRASES:
  - "digital download" — this is a fulfillment method, not a product anchor
  - "instant download" — same reason  
  - "printable download" — redundant
- ABSOLUTELY BANNED IN FINAL STRING:
  - "printable download", "digital download", "instant download"
  - These will NEVER appear as the anchor of any keyword string. Ever.
- VALID ANCHOR EXAMPLES (from Nick's method):
  - "junk journal kit" ✅ — what the item IS
  - "playing card ephemera" ✅ — what the item IS  
  - "scrapbook paper pack" ✅ — what the item IS
- Each keyword string must follow this exact pattern:
  [descriptor] [descriptor] [anchor noun phrase]
  Nick's example: "soft marmalade tabby cat plush toy"
  - "soft marmalade tabby" = descriptors
  - "cat plush toy" = anchor (what it IS)
- Your strings must mirror this. Never end a string on a lone adjective.
- Never start a string with an anchor before its descriptors.
- After writing the title, count the exact characters.
- If the count is below 130, you MUST add descriptive words to the weakest string 
  until you reach 130-140. Do not submit a title under 130 characters.
- FINAL WORD RULE (non-negotiable):
  The very last word of the entire title MUST be an anchor noun.
  Never end the title on a descriptive or vibe word.

  BANNED final words: elegant, artistic, vintage, rustic, bohemian, 
  charming, nostalgic, evocative, serene, whimsical, decorative, unique

  VALID final words: kit, pages, supplies, collection, ephemera, 
  journal, pack, bundle, sheets, prints, art, craft, design
   - "improvedTags": 
TAG RULES:
- Generate EXACTLY 13 unique tags (max 20 chars each). DO NOT return fewer than 13.
- Focus intensely on BUYER INTENT (WHO and WHEN).
- MUST include at least one tag explicitly naming the buyer type (e.g., "scrapbooker", "crafter teen", "junk journaler", "paper crafter").
- Avoid broad, generic terms like "decorative pages" or "unique design".
TAG RULES ADDITION:
- CRITICAL TAG RULE: Tags do NOT need to make grammatical sense.
  - Two completely unrelated keywords in one tag box is valid and encouraged.
  - Your goal is maximum word diversity across 13 tags.
  - Prioritize unique words over logical phrases.
  - Never sacrifice a new keyword just to make a tag sound natural.
  - EXAMPLES (from Nick's method):
    - "napping styling" ← nonsensical but feeds two unrelated keywords
    - "refresh revamp" ← no logical connection, both valid search words
    - "autumn journal" ← logical, also fine
    - "scrapbook poker" ← odd pairing, completely valid
- Before returning the tags array, count the items. 
  There must be exactly 13. Not 12, not 14. Exactly 13.
- WHEN TAG RULE:
  Before adding any seasonal tag, check the Visual Identity for 
  explicit seasonal indicators:
  - Autumn/Fall: pumpkins, falling leaves, orange tones, harvest themes
  - Winter/Christmas: snow, holly, red/green palette, ornaments
  - Summer: tropical, beach, bright sunshine, sea life
  - Spring: pastel florals, eggs, fresh green growth

  If NO explicit seasonal indicator exists in the Visual Identity,
  DO NOT use season names (autumn, fall, winter, spring, summer).

  Instead use time-of-mind crafting terms:
  "weekend crafting", "relaxing art", "evening journaling", 
  "mindful crafting", "creative escape"

  If explicit seasonal indicators DO exist, seasonal tags are mandatory.
- Replace any "nostalgic theme" or similar vague atmospheric tags 
  with a concrete WHEN or WHO tag.

4. WARNING:
   - "badAdviceWarning": If the original title was under 80 characters, provide a warning. Otherwise, omit.

Analyze this listing and return a strictly formatted JSON object.

==== Output Requirement (JSON ONLY) ====  
{
    "brainstorm": {
        "descriptive": ["word1", "word2", "word3", "...15 to 20 words"],
        "anchors": ["phrase1", "phrase2", "...4 to 6 phrases"]
    },
    "originalScore": {
        "titleScore": 20,
        "tagScore": 30,
        "total": 50,
        "rating": "Needs Work",
        "breakdown": ["Good point", "Bad point"]
    },
    "optimizedScore": {
        "titleScore": 28,
        "tagScore": 34,
        "total": 62,
        "rating": "Excellent",
        "breakdown": ["Good point", "Bad point"]
    },
    "improvedTitle": "Your new optimized title here max 140 chars with commas not colons",
    "improvedTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12", "tag13"],
    "badAdviceWarning": "Optional warning message if needed"
}
`;

            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: useOpenRouter ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o',
                    isOpenRouter: useOpenRouter,
                    messages: [
                        { role: 'system', content: 'You are an Etsy SEO expert. Respond ONLY with valid JSON matching the exact schema requested.' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7,
                    max_tokens: 2500
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData.error?.message || errorData.error || "Unknown error";
                throw new Error(`[${response.status}] ${errorMsg}`);
            }
            const result = await response.json();
            let content = result.choices[0].message.content;

            if (content.includes('```')) {
                content = content.replace(/```json|```/g, '').trim();
            }

            const aiResponse = JSON.parse(content) as NickMethodReport;

            // Enforce title character limit in code, not in the prompt
            if (aiResponse.improvedTitle.length > 140) {
                // Trim the last keyword string until under 140
                const strings = aiResponse.improvedTitle.split(",");
                while (strings.join(",").length > 140 && strings.length > 1) {
                    const lastString = strings[strings.length - 1].trim();
                    const words = lastString.split(" ");

                    if (words.length <= 2) {
                        // Drop the entire fragment if it falls below 2 words
                        strings.pop();
                    } else {
                        // Trim the last word off the string
                        strings[strings.length - 1] = words.slice(0, -1).join(" ");
                    }
                }
                aiResponse.improvedTitle = strings.join(",").trim().replace(/,\s*$/, "");
            }

            setOptimizedData(aiResponse);

        } catch (err: any) {
            console.error("Optimization error:", err);
            let errorMessage = err.message || "Failed to optimize listing";

            if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests")) {
                errorMessage = "OpenRouter Rate Limit: The free models are currently busy. I tried retrying with fallback models, but please wait 30 seconds and try again, or use OpenAI (GPT-4o).";
            } else if (errorMessage.includes("503") || errorMessage.includes("502")) {
                errorMessage = "AI Service Unavailable: The model provider is currently having issues. Please try again in a few minutes.";
            } else {
                errorMessage = 'AI Optimization failed: ' + errorMessage;
            }

            setError(errorMessage);
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
                <div className="flex items-center justify-end mb-2">
                    <div className="flex items-center gap-3 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
                        <span className={`text-xs font-medium ${!useOpenRouter ? 'text-blue-400' : 'text-slate-500'}`}>OpenAI (GPT-4o)</span>
                        <button
                            onClick={() => setUseOpenRouter(!useOpenRouter)}
                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${useOpenRouter ? 'bg-purple-600' : 'bg-slate-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useOpenRouter ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                        <span className={`text-xs font-medium ${useOpenRouter ? 'text-purple-400' : 'text-slate-500'}`}>OpenRouter (Free Models)</span>
                    </div>
                </div>
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
                                            {(Array.isArray(scrapedData.score.weaknesses) ? scrapedData.score.weaknesses : []).slice(0, 2).map((w, i) => (
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
                                                {(Array.isArray(scrapedData.score.ctrRiskReasons) ? scrapedData.score.ctrRiskReasons : []).map((r, i) => <li key={i}>• {r}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {scrapedData.score.tagSubPillars && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                                            <strong className="text-slate-500 uppercase text-[10px] block mb-1">Tag Score Breakdown ({scrapedData.score.pillars.tags}/35)</strong>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                                {Object.values(scrapedData.score.tagSubPillars || {}).map((sp: any, i: number) => (
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
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Tags ({(Array.isArray(scrapedData.tags) ? scrapedData.tags : []).length})</label>
                                <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(scrapedData.tags) ? scrapedData.tags : []).map((tag, i) => (
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
                                            value={(Array.isArray(extractedIdentity?.secondary_themes) ? extractedIdentity.secondary_themes : []).join(', ')}
                                            onChange={(e) => setExtractedIdentity({ ...extractedIdentity, secondary_themes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Theme Synonyms (comma separated)</label>
                                        {rejectedSynonyms.length > 0 && (
                                            <div className="mb-2 p-2 bg-red-900/30 border border-red-500/40 rounded text-[11px] text-red-400">
                                                ⚠️ These extracted synonyms were rejected (format words or invalid): [{(Array.isArray(rejectedSynonyms) ? rejectedSynonyms : []).map(s => `"${s}"`).join(', ')}] — not used in scoring
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
                                            {extractedIdentity.page_count}+ Pages • {(Array.isArray(extractedIdentity?.file_types) ? extractedIdentity.file_types : []).join(', ')} • {extractedIdentity.print_size} • Commercial Use
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
                                <p>Click optimize to run Nick Method SEO Analysis</p>
                            </div>
                        ) : optimizedData ? (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-start">
                                    <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-400">
                                        <Sparkles className="w-5 h-5" />
                                        Nick Method SEO Report
                                    </h2>
                                    <div className="flex items-center gap-4">
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${optimizedData.originalScore?.total >= 50 ? 'bg-emerald-900/40 border-emerald-400 text-emerald-400' : 'bg-slate-900/30 border-slate-500/50 text-slate-400'}`}>
                                            <span className="text-xs font-bold">Original: {optimizedData.originalScore?.total}/65</span>
                                        </div>
                                        <span className="text-slate-500 font-bold">→</span>
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${optimizedData.optimizedScore?.total >= 50 ? 'bg-emerald-900/40 border-emerald-400 text-emerald-400' : 'bg-amber-900/30 border-amber-500/50 text-amber-400'}`}>
                                            <span className="text-sm font-bold">Optimized: {optimizedData.optimizedScore?.total}/65 ({optimizedData.optimizedScore?.rating})</span>
                                        </div>
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
                                    <div className="p-4 rounded-lg bg-slate-900/80 border border-purple-900/50 text-sm text-slate-300">
                                        <div className="text-xs text-purple-400 font-bold uppercase mb-2">Brainstorm Cloud</div>
                                        <div className="mb-2"><strong>Descriptive:</strong> <span className="text-slate-400">{(Array.isArray(optimizedData.brainstorm?.descriptive) ? optimizedData.brainstorm.descriptive : []).join(', ')}</span></div>
                                        <div><strong>Anchors:</strong> <span className="text-slate-400">{(Array.isArray(optimizedData.brainstorm?.anchors) ? optimizedData.brainstorm.anchors : []).join(', ')}</span></div>
                                    </div>

                                    {/* Score Breakdowns */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-700/50 text-sm text-slate-300">
                                            <div className="text-xs text-slate-500 font-bold uppercase mb-2 flex justify-between">
                                                <span>Original Listing Breakdown</span>
                                                <div className="flex gap-3">
                                                    <span className={optimizedData.originalScore?.titleScore >= 25 ? 'text-emerald-400' : 'text-amber-400'}>Title: {optimizedData.originalScore?.titleScore}/30</span>
                                                    <span className={optimizedData.originalScore?.tagScore >= 30 ? 'text-emerald-400' : 'text-amber-400'}>Tags: {optimizedData.originalScore?.tagScore}/35</span>
                                                </div>
                                            </div>
                                            <ul className="space-y-1 text-xs text-slate-400">
                                                {optimizedData.originalScore?.breakdown?.map((item, i) => <li key={i}>• {item}</li>)}
                                            </ul>
                                        </div>
                                        <div className="p-4 rounded-lg bg-slate-900/80 border border-emerald-900/50 text-sm text-slate-300">
                                            <div className="text-xs text-emerald-500 font-bold uppercase mb-2 flex justify-between">
                                                <span>Optimized Listing Breakdown</span>
                                                <div className="flex gap-3">
                                                    <span className={optimizedData.optimizedScore?.titleScore >= 25 ? 'text-emerald-400' : 'text-amber-400'}>Title: {optimizedData.optimizedScore?.titleScore}/30</span>
                                                    <span className={optimizedData.optimizedScore?.tagScore >= 30 ? 'text-emerald-400' : 'text-amber-400'}>Tags: {optimizedData.optimizedScore?.tagScore}/35</span>
                                                </div>
                                            </div>
                                            <ul className="space-y-1 text-xs text-slate-400">
                                                {optimizedData.optimizedScore?.breakdown?.map((item, i) => <li key={i}>• {item}</li>)}
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
                                            <button onClick={() => copyToClipboard((Array.isArray(optimizedData.improvedTags) ? optimizedData.improvedTags : []).join(', '), 'all-tags')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'all-tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'all-tags' ? 'Copied' : 'Copy All'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                                            {optimizedData.improvedTags?.map((tag, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => copyToClipboard(tag, `tag-${i}`)}
                                                    className="text-xs px-2 py-1 bg-amber-500/10 text-amber-200 rounded border border-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/40 transition-all cursor-pointer flex items-center gap-1"
                                                >
                                                    {copiedField === `tag-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : null}
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
            )}
        </div>
    );
};

export default EtsySEOOptimizer;
