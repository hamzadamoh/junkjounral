const PRODUCT_TERMS = [
    "junk journal",
    "journal kit",
    "ephemera",
    "printable",
    "scrapbook",
    "paper pack",
    "journal pages",
    "ephemera pack"
];

const VAGUE_TERMS = [
    "art",
    "aesthetic",
    "creative",
    "craft",
    "digital",
    "style",
    "theme"
];

export function classifyTag(tag: string): "transactional" | "thematic" | "vague" {
    const lowerTag = tag.toLowerCase();

    if (PRODUCT_TERMS.some(term => lowerTag.includes(term))) {
        return "transactional";
    }

    if (VAGUE_TERMS.some(term => lowerTag.includes(term))) {
        return "vague";
    }

    return "thematic";
}

export interface TagAnalysis {
    transactional: number;
    thematic: number;
    vague: number;
    total: number;
}

export function analyzeTagBalance(tags: string[]): TagAnalysis {
    const analysis: TagAnalysis = { transactional: 0, thematic: 0, vague: 0, total: tags.length };

    tags.forEach(tag => {
        const intent = classifyTag(tag);
        analysis[intent]++;
    });

    return analysis;
}

export function calculateTagIntentScore(tags: string[]): number {
    if (!tags || tags.length === 0) return 0;

    const analysis = analyzeTagBalance(tags);
    const vagueRatio = analysis.vague / analysis.total;

    let score = 90;

    // Vague penalty
    if (vagueRatio > 0.4) score -= 40;
    else if (vagueRatio > 0.25) score -= 20;

    // Balance enforcement
    if (analysis.transactional < 5) score -= 15;
    if (analysis.thematic < 3) score -= 10;
    if (analysis.vague > 3) score -= 15;

    return Math.max(score, 0);
}
