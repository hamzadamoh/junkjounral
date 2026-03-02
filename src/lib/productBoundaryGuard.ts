const CORE_PRODUCT_NOUNS = [
    "junk journal",
    "printable",
    "scrapbook",
    "paper pack",
    "journal pages",
    "digital pages",
    "digital papers",
    "digital download",
    "craft papers",
    "papers",
    "folio",
    "inserts",
    "fussy cut"
];

const FORMAT_VIOLATIONS = [
    "ephemera",
    "ephemera collage",
    "wall art",
    "poster",
    "canvas",
    "home decor",
    "wall hanging",
    "bedroom decor",
    "nursery art",
    "print for frame",
    "macrame",
    "furniture",
    "clothing",
    "apparel",
    "kit",
    "pockets",
    "tags",
    "scrapbooking set",
    "journal set",
    "tag set",
    "kit set",
    "journal kit"
];

const ALLOWED_AUDIENCE_TERMS = [
    "journal",
    "scrapbook",
    "craft",
    "paper",
    "planner"
];

export function tagHasProductAttachment(tag: string, primaryTheme?: string): boolean {
    const lowerTag = tag.trim().toLowerCase();

    // Fast path: if the tag directly contains a core product noun, it passes
    if (CORE_PRODUCT_NOUNS.some(noun => lowerTag.includes(noun))) {
        return true;
    }

    // Slow path: check for secondary product/craft nouns with quality filters
    const words = lowerTag.split(/\s+/);
    if (words.length < 2) return false;

    const lastWord = words[words.length - 1];
    if (["for", "with", "of", "to", "in"].includes(lastWord)) return false;

    const productAndCraftNouns = ["journal", "pages", "printable", "paper", "download", "craft", "collage", "planner", "stickers", "decoupage", "scrapbook"];
    if (productAndCraftNouns.some(noun => lowerTag.includes(noun))) {
        return true;
    }

    // Theme-aware path: if the tag contains the listing's primary theme + any audience term, give credit
    if (primaryTheme) {
        const lowerTheme = primaryTheme.toLowerCase();
        if (lowerTag.includes(lowerTheme)) {
            const audienceMatch = ALLOWED_AUDIENCE_TERMS.some(term => lowerTag.includes(term));
            if (audienceMatch) return true;
        }
    }

    return false;
}

export function violatesFormatContainment(text: string): boolean {
    const lowerText = text.toLowerCase();
    return FORMAT_VIOLATIONS.some(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        return regex.test(lowerText);
    });
}

export function getFormatViolations(title: string, tags: string[] = []): string[] {
    const violations = new Set<string>();
    const lowerTitle = title.toLowerCase();

    FORMAT_VIOLATIONS.forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        if (regex.test(lowerTitle)) {
            violations.add(term);
        }
    });

    tags.forEach(tag => {
        const lowerTag = tag.toLowerCase();
        FORMAT_VIOLATIONS.forEach(term => {
            const regex = new RegExp(`\\b${term}\\b`, 'i');
            if (regex.test(lowerTag)) {
                violations.add(term);
            }
        });
    });

    return Array.from(violations);
}

export function analyzeTagContainment(tags: string[], primaryTheme?: string): {
    isValid: boolean;
    productAttachedCount: number;
    formatViolations: string[];
    duplicateTags: string[];
} {
    let productAttachedCount = 0;
    const formatViolations: string[] = [];

    // Duplicate & near-duplicate tag detection
    const seen = new Set<string>();
    const stemmedSeen = new Set<string>();
    const duplicateTags: string[] = [];

    const stemTag = (t: string): string => {
        return t.split(/\s+/).map(w => w.replace(/(?:ies$)/, 'y').replace(/(?:es|s)$/, '')).join(' ');
    };

    tags.forEach(tag => {
        const normalized = tag.trim().toLowerCase();
        const stemmed = stemTag(normalized);

        if (seen.has(normalized)) {
            // Exact duplicate
            if (!duplicateTags.includes(normalized)) duplicateTags.push(normalized);
        } else if (stemmedSeen.has(stemmed)) {
            // Near-duplicate (plural variant)
            if (!duplicateTags.includes(normalized)) duplicateTags.push(`${normalized} (near-duplicate)`);
        } else {
            seen.add(normalized);
            stemmedSeen.add(stemmed);
        }
    });

    tags.forEach(tag => {
        if (tagHasProductAttachment(tag, primaryTheme)) {
            productAttachedCount++;
        }
        if (violatesFormatContainment(tag)) {
            formatViolations.push(tag);
        }
    });

    // Strict enforcement: no format violations, no duplicates, at least 5 product attached tags
    const isValid = formatViolations.length === 0 && duplicateTags.length === 0 && productAttachedCount >= 5;

    return {
        isValid,
        productAttachedCount,
        formatViolations,
        duplicateTags
    };
}
