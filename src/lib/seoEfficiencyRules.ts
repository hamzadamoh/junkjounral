export const LOW_EFFICIENCY_TITLE_WORDS = [
    "digital download",
    "instant access",
    "printable art",
    "creative crafting",
    "craft supplies",
    "scrapbook supplies",
    "scrapbooking supplies",
    "diy craft",
    "digital print",
    "aesthetic",
    "art set",
    "creative kit",
    "crafting kit"
];

export function calculateFillerDensity(title: string): number {
    const lowerTitle = title.toLowerCase();
    let fillerCount = 0;

    LOW_EFFICIENCY_TITLE_WORDS.forEach(word => {
        if (lowerTitle.includes(word)) {
            fillerCount++;
        }
    });

    // Calculate words loosely, splitting by spaces and dashes
    const totalWords = lowerTitle.split(/[\s-]+/).filter(Boolean).length;
    if (totalWords === 0) return 0;

    return fillerCount / totalWords;
}

export function checkTailEfficiency(title: string): boolean {
    const words = title.split(" ").filter(Boolean);
    if (words.length === 0) return false;

    const tailWords = (Array.isArray(words) ? words.slice(Math.floor(words.length * 0.6)) : []).join(" ").toLowerCase();

    return LOW_EFFICIENCY_TITLE_WORDS.some(word =>
        tailWords.includes(word)
    );
}
