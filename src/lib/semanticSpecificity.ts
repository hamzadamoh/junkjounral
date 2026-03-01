export const SPECIFICITY_TERMS = [
    "lavender",
    "wisteria",
    "sakura",
    "cathedral",
    "victorian",
    "greenhouse",
    "botanical",
    "gothic",
    "romantic",
    "antique",
    "parchment",
    "lace",
    "mushroom",
    "fairy",
    "celestial",
    "cherry blossom",
    "dark academia",
    "cottagecore",
    "shabby chic",
    "witchy",
    "steampunk",
    "grimoire"
];

export const HIGH_INTENT_NOUNS = [
    "junk journal",
    "journal kit",
    "ephemera",
    "printable",
    "scrapbook",
    "paper pack",
    "journal pages",
    "ephemera pack",
    "folio",
    "inserts",
    "fussy cut"
];

export const AESTHETIC_TERMS = [
    "cottagecore",
    "boho",
    "shabby chic",
    "romantic",
    "vintage",
    "aesthetic",
    "botanical",
    "gothic",
    "dark academia",
    "coquette",
    "witchy"
];

export function calculateSpecificityScore(title: string): { score: number, matches: string[] } {
    const lowerTitle = title.toLowerCase();
    const matchedTerms: string[] = [];

    SPECIFICITY_TERMS.forEach(word => {
        if (lowerTitle.includes(word)) {
            matchedTerms.push(word);
        }
    });

    return {
        score: Math.min(matchedTerms.length * 5, 20), // max +20 bonus 
        matches: matchedTerms
    };
}

export function calculateIntentDensity(title: string): { density: number, matches: string[] } {
    const lowerTitle = title.toLowerCase();
    const matchedNouns: string[] = [];

    HIGH_INTENT_NOUNS.forEach(term => {
        if (lowerTitle.includes(term)) {
            matchedNouns.push(term);
        }
    });

    return {
        density: matchedNouns.length,
        matches: matchedNouns
    };
}

export function checkNicheSharpness(title: string): { isDiluted: boolean, matchedAesthetics: string[] } {
    const lowerTitle = title.toLowerCase();
    const matchedAesthetics: string[] = [];

    AESTHETIC_TERMS.forEach(term => {
        // Basic word boundary checking to avoid partial matches
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        if (regex.test(lowerTitle)) {
            matchedAesthetics.push(term);
        }
    });

    return {
        isDiluted: matchedAesthetics.length > 3,
        matchedAesthetics
    };
}
