const CORE_PRODUCT_NOUNS = [
    "junk journal",
    "ephemera",
    "printable",
    "scrapbook",
    "paper pack",
    "journal pages",
    "digital pages",
    "folio",
    "inserts",
    "fussy cut"
];

const FORMAT_VIOLATIONS = [
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
    "kit set"
];

const ALLOWED_AUDIENCE_TERMS = [
    "journal",
    "scrapbook",
    "craft",
    "paper",
    "planner",
    "ephemera"
];

export function tagHasProductAttachment(tag: string): boolean {
    const lowerTag = tag.toLowerCase();
    return CORE_PRODUCT_NOUNS.some(noun => lowerTag.includes(noun));
}

export function violatesFormatContainment(text: string): boolean {
    const lowerText = text.toLowerCase();
    return FORMAT_VIOLATIONS.some(term => lowerText.includes(term));
}

export function analyzeTagContainment(tags: string[]): {
    isValid: boolean;
    productAttachedCount: number;
    formatViolations: string[];
} {
    let productAttachedCount = 0;
    const formatViolations: string[] = [];

    tags.forEach(tag => {
        if (tagHasProductAttachment(tag)) {
            productAttachedCount++;
        }
        if (violatesFormatContainment(tag)) {
            formatViolations.push(tag);
        }
    });

    // Strict enforcement: no format violations allowed, at least 6 product attached tags
    const isValid = formatViolations.length === 0 && productAttachedCount >= 6;

    return {
        isValid,
        productAttachedCount,
        formatViolations
    };
}
