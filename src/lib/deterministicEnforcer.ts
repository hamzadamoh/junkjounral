import { JunkJournalPagesIdentity } from "../types/productIdentity";

const FILLER_WORDS = [
    "beautiful", "amazing", "perfect", "lovely", "high quality"
];

function applyReplacements(text: string): string {
    let newText = text;

    // Replace "kit" -> "pages" (Regex word boundary)
    newText = newText.replace(/\bkit\b/gi, "pages");

    // Replace anything containing "ephemera" -> "pages" (Substring match)
    newText = newText.replace(/ephemera/gi, "pages");

    // Strip filler words
    let cleanText = ` ${newText} `;
    for (const filler of FILLER_WORDS) {
        cleanText = cleanText.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }

    return cleanText.replace(/\s+/g, ' ').trim();
}

function removeDuplicatePagesInTitle(title: string): string {
    const pagesMatches = title.match(/pages/gi);
    if (pagesMatches && pagesMatches.length > 1) {
        const firstIdx = title.toLowerCase().indexOf('pages');
        if (firstIdx !== -1) {
            const before = title.substring(0, firstIdx + 5);
            let after = title.substring(firstIdx + 5);
            after = after.replace(/pages/gi, '');
            title = before + after;
        }
    }
    return title.replace(/\s+/g, ' ').trim();
}

export function enforceTitle(rawTitle: string, identity: JunkJournalPagesIdentity): string {
    let title = applyReplacements(rawTitle);
    title = removeDuplicatePagesInTitle(title);
    return title;
}

export function enforceTags(tags: string[], identity: JunkJournalPagesIdentity): string[] {
    return tags.map(tag => applyReplacements(tag));
}
