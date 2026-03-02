import { JunkJournalPagesIdentity } from "../types/productIdentity";

const TAG_WHITELIST_PATTERNS = [
    (theme: string) => `${theme} junk journal pages`,
    (theme: string) => `${theme} journal pages`,
    (theme: string) => `${theme} printable`,
    (theme: string) => `printable ${theme} pages`,
    (theme: string) => `${theme} digital pages`,
    (theme: string) => `${theme} digital download`,
    (theme: string) => `commercial use ${theme}`,
    (theme: string) => `instant download ${theme}`,
    (theme: string) => `${theme} junk journal`,
];

const FALLBACK_QUEUE = [
    (theme: string) => `${theme} junk journal pages`,
    (theme: string) => `${theme} printable`,
    (theme: string) => `${theme} digital download`,
    (theme: string) => `${theme} journal pages`,
    (theme: string) => `printable ${theme} pages`,
    (theme: string) => `${theme} digital pages`,
    (theme: string) => `instant download ${theme}`
];

const BANNED_REPLACEMENTS: Record<string, string> = {
    "kit": "pages",
    "ephemera": "decorative pages",
    "scrapbooking": "journaling",
    "set": "pages",
    "collection": "pages"
};

const FILLER_WORDS = [
    "beautiful", "amazing", "perfect", "lovely", "cute", "great", "best", "unique",
    "stunning", "wonderful", "gorgeous", "high quality", "premium", "excellent", "incredible"
];

const SPECIFICITY_DESCRIPTORS = [
    "printable", "digital", "colorful", "rustic", "gothic", "floral", "botanical",
    "watercolor", "illustrated", "whimsical", "mystical", "antique", "pastel", "dark",
    "cozy", "vintage", "shabby chic", "cottagecore"
];

function sanitizeString(str: string): string {
    return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesTagPattern(tag: string, identity: JunkJournalPagesIdentity): boolean {
    const cleanTag = sanitizeString(tag);

    if (identity.primary_theme) {
        const theme = sanitizeString(identity.primary_theme);
        for (const pattern of TAG_WHITELIST_PATTERNS) {
            if (cleanTag === sanitizeString(pattern(theme))) return true;
        }
    }

    for (const secTheme of identity.secondary_themes) {
        const theme = sanitizeString(secTheme);
        for (const pattern of TAG_WHITELIST_PATTERNS) {
            if (cleanTag === sanitizeString(pattern(theme))) return true;
        }
    }

    if (cleanTag.startsWith('commercial use') || cleanTag.startsWith('instant download')) return true;

    return false;
}

export function enforceTags(tags: string[], identity: JunkJournalPagesIdentity): string[] {
    const validTags: string[] = [];
    let failureCount = 0;
    let fallbackIndex = 0;
    const theme = identity.primary_theme ? sanitizeString(identity.primary_theme) : "journal";

    for (const tag of tags) {
        if (matchesTagPattern(tag, identity)) {
            let safeTag = tag.substring(0, 20).trim();
            if (!validTags.map(t => t.toLowerCase()).includes(safeTag.toLowerCase())) {
                validTags.push(safeTag);
            }
        } else {
            failureCount++;

            let safeFallback = '';
            let attempts = 0;
            while (attempts < FALLBACK_QUEUE.length) {
                const candidate = FALLBACK_QUEUE[fallbackIndex % FALLBACK_QUEUE.length](theme).substring(0, 20).trim();
                fallbackIndex++;
                attempts++;

                if (!validTags.map(t => t.toLowerCase()).includes(candidate.toLowerCase())) {
                    safeFallback = candidate;
                    break;
                }
            }

            if (safeFallback) {
                validTags.push(safeFallback);
            }
        }
    }

    if (failureCount > 7) {
        throw new Error(`CRITICAL_STRUCTURAL_FAILURE: ${failureCount} tags failed whitelist validation. GPT output is severely degraded.`);
    }

    if (validTags.length > 13) {
        validTags.length = 13;
    }

    while (validTags.length < 13) {
        const candidate = FALLBACK_QUEUE[fallbackIndex % FALLBACK_QUEUE.length](theme).substring(0, 20).trim();
        fallbackIndex++;
        if (!validTags.map(t => t.toLowerCase()).includes(candidate.toLowerCase())) {
            validTags.push(candidate);
        } else if (fallbackIndex > FALLBACK_QUEUE.length * 3) {
            break;
        }
    }

    return validTags;
}

function applyBannedReplacements(text: string): string {
    let newText = text;
    for (const [banned, replacement] of Object.entries(BANNED_REPLACEMENTS)) {
        newText = newText.replace(new RegExp(`\\b${banned}\\b`, 'gi'), replacement);
    }
    // Hard substring replace for ephemera specifically
    newText = newText.replace(/ephemera/gi, "decorative pages");
    return newText;
}

function stripFiller(text: string): string {
    let cleanText = ` ${text} `;
    for (const filler of FILLER_WORDS) {
        cleanText = cleanText.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }
    return cleanText.replace(/\s+/g, ' ').trim();
}

function capitalizeWords(str: string): string {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function enforceTitle(rawTitle: string, identity: JunkJournalPagesIdentity): string {
    let title = applyBannedReplacements(rawTitle);

    // Deduplicate "pages" to maximum 1 occurrence
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

    const segments = title.split(',').map(s => s.trim());
    let slot1 = segments.length > 0 ? segments[0] : title;
    let slot2 = segments.length > 1 ? segments[1] : "";
    let slot3 = segments.length > 2 ? segments.slice(2).join(', ') : "";

    const theme = identity.primary_theme ? identity.primary_theme : "Journal";
    const lowerTheme = theme.toLowerCase();

    // --- SLOT 1 ENFORCEMENT ---
    slot1 = stripFiller(slot1);

    let lowerSlot1 = slot1.toLowerCase();

    // Must contain theme word
    if (!lowerSlot1.includes(lowerTheme)) {
        slot1 = `${capitalizeWords(theme)} ${slot1}`.trim();
        lowerSlot1 = slot1.toLowerCase();
    }

    // Must contain "junk journal pages" or "journal pages"
    if (!lowerSlot1.includes("junk journal pages") && !lowerSlot1.includes("journal pages")) {
        // Find theme keyword position and append
        const themeIdx = lowerSlot1.indexOf(lowerTheme);
        if (themeIdx !== -1) {
            const splitPos = themeIdx + lowerTheme.length;
            slot1 = slot1.substring(0, splitPos) + " Junk Journal Pages" + slot1.substring(splitPos);
        } else {
            slot1 = `${slot1} Junk Journal Pages`;
        }
    }

    slot1 = capitalizeWords(slot1).substring(0, 50).trim();

    // --- SLOT 2 ENFORCEMENT ---
    let lowerSlot2 = slot2.toLowerCase();
    let slot2Valid = false;

    const validDescriptors = [...SPECIFICITY_DESCRIPTORS, ...identity.secondary_themes.map(t => t.toLowerCase())];
    for (const desc of validDescriptors) {
        if (lowerSlot2.includes(desc)) {
            slot2Valid = true;
            break;
        }
    }

    // Check if slot 2 is purely generic words
    let isPurelyGeneric = false;
    const genericWords = ["high quality", "instant download", "digital download", "for her", "great gift", "beautiful", "perfect"];
    let testStrip = ` ${lowerSlot2} `;
    for (const word of genericWords) {
        testStrip = testStrip.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    }
    if (testStrip.replace(/[^a-z]/g, '').trim().length === 0 && lowerSlot2.length > 0) {
        isPurelyGeneric = true;
    }

    if ((!slot2Valid || isPurelyGeneric) && slot2.length > 0) {
        // Rebuild slot 2 - reject generic, use secondary theme + printable
        const secTheme = identity.secondary_themes[0] ? identity.secondary_themes[0] : theme;
        slot2 = `${capitalizeWords(secTheme)} Printable`;
    }
    slot2 = capitalizeWords(stripFiller(slot2)).substring(0, 45).trim();

    // --- SLOT 3 ENFORCEMENT ---
    // If GPT leaves this empty: leave it empty, do NOT pad with filler
    // If GPT fills it with filler words: strip the slot entirely
    if (slot3.length > 0) {
        const lowerSlot3 = slot3.toLowerCase();
        let testStrip = ` ${lowerSlot3} `;
        for (const word of ["high quality", "instant download", "digital download", "for her", "great gift", "beautiful", "perfect", ...FILLER_WORDS]) {
            testStrip = testStrip.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
        }
        if (testStrip.replace(/[^a-z0-9]/g, '').trim().length === 0) {
            slot3 = ""; // Strip completely filler slot3
        } else {
            slot3 = capitalizeWords(stripFiller(slot3)).substring(0, 45).trim();
        }
    }

    // Compile 
    let finalTitleParts = [];
    if (slot1) finalTitleParts.push(slot1);
    if (slot2) finalTitleParts.push(slot2);
    if (slot3) finalTitleParts.push(slot3);

    let finalTitle = finalTitleParts.join(', ').replace(/\s+/g, ' ').trim();

    // Format output to 60-140 characters, stripping trailing prepositions
    finalTitle = finalTitle.replace(/[\s,]+(?:for|with|of|to|in|and|the)$/i, '');

    if (finalTitle.length < 60) {
        const pad = " Instant Digital Download";
        if (finalTitle.length + pad.length <= 140) finalTitle += pad;
    }
    if (finalTitle.length > 140) {
        finalTitle = finalTitle.substring(0, 140);
        const lastSpace = finalTitle.lastIndexOf(' ');
        if (lastSpace > 120) {
            finalTitle = finalTitle.substring(0, lastSpace);
        }
        finalTitle = finalTitle.replace(/[\s,]+$/, '');
    }

    return finalTitle;
}
