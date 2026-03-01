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

export function calculateTagIntentScore(tags: string[]): number {
    if (!tags || tags.length === 0) return 0;

    const vagueCount = tags.filter(tag => classifyTag(tag) === "vague").length;
    const vagueRatio = vagueCount / tags.length;

    if (vagueRatio > 0.4) return 50;
    if (vagueRatio > 0.25) return 70;

    return 90;
}
