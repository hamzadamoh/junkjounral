const CORE_PRODUCT_NOUNS = [
    "junk journal",
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
    "ephemera",
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

export function tagHasProductAttachment(tag: string): boolean {
    const lowerTag = tag.toLowerCase();
    return CORE_PRODUCT_NOUNS.some(noun => lowerTag.includes(noun));
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

    // Strict enforcement: no format violations allowed, at least 5 product attached tags
    const isValid = formatViolations.length === 0 && productAttachedCount >= 5;

    return {
        isValid,
        productAttachedCount,
        formatViolations
    };
}
