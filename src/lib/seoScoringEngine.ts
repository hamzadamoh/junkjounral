import { JunkJournalPagesIdentity, COMPATIBLE_THEME_CLUSTERS, ThemeCluster } from '../types/productIdentity';

export interface SEOPillarScores {
    title: number;
    tags: number;
    description: number;
    ctrRisk: number;
}

export interface TagSubPillarScores {
    intentRatio: { score: number; max: number; label: string };
    themeCoverage: { score: number; max: number; label: string };
    deliveryClarity: { score: number; max: number; label: string };
    commercialUse: { score: number; max: number; label: string };
}

export interface SEOScore {
    overallScore: number;
    pillars: SEOPillarScores;
    tagSubPillars?: TagSubPillarScores;
    strengths: string[];
    weaknesses: string[];
    ctrRiskScore: number;
    ctrRiskReasons: string[];
}

export function evaluateListingSEO(title: string = "", tags: string[] = [], description: string = "", identityContract?: JunkJournalPagesIdentity, competitorPhrases: string[] = []): SEOScore {
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let ctrRiskReasons: string[] = [];

    const lowerTitle = (title || "").toLowerCase();
    const lowerDesc = (description || "").toLowerCase();
    const safeTags = Array.isArray(tags) ? tags : [];
    const lowerTags = (Array.isArray(safeTags) ? safeTags : []).map(t => typeof t === 'string' ? t.toLowerCase() : String(t || "").toLowerCase());
    const allTagsText = (Array.isArray(lowerTags) ? lowerTags : []).join(' ');

    // --- PILLAR 1: TITLE ENGINEERING (Max 30) ---
    let titleScore = 0;

    // Buyer Intent Core (10 pts) — first 60 chars must contain core product identity
    const first60 = lowerTitle.substring(0, 60);
    const hasJunkJournalCore = lowerTitle.includes("junk journal pages") || lowerTitle.includes("journal pages");
    const hasJunkJournalInFirst60 = first60.includes("junk journal pages") || first60.includes("journal pages");

    if (hasJunkJournalCore && hasJunkJournalInFirst60) {
        titleScore += 10;
        strengths.push("Core intent 'junk journal pages' found in first 60 chars (strong anchor).");
    } else if (hasJunkJournalCore) {
        titleScore += 5;
        weaknesses.push("Core product 'junk journal pages' is pushed past the first 60 characters. Anchor it earlier.");
    } else {
        weaknesses.push("Missing core product phrase 'junk journal pages' or 'journal pages'.");
    }

    // Theme Anchor (8 pts) vs Complementary Theme Bonus (4 pts) vs Contradictory Penalty
    let hasContradictoryTheme = false;
    let missingPrimaryTheme = false;

    if (identityContract && identityContract.primary_theme !== "unthemed") {
        const primaryTheme = identityContract.primary_theme.toLowerCase();

        // Theme Anchor (8 pts)
        if (first60.includes(primaryTheme)) {
            titleScore += 8;
            strengths.push(`Primary theme '${primaryTheme}' anchored in first 60 chars.`);
        } else if (lowerTitle.includes(primaryTheme)) {
            titleScore += 4;
            weaknesses.push(`Primary theme '${primaryTheme}' is present but pushed past the first 60 characters.`);
        } else {
            missingPrimaryTheme = true;
            weaknesses.push(`IDENTITY VIOLATION: Missing primary theme '${primaryTheme}' in title.`);
        }

        // Complementary Theme Bonus (4 pts)
        const validComplements = COMPATIBLE_THEME_CLUSTERS[identityContract.theme_cluster] || [];
        let complementaryCount = 0;

        for (const secTheme of identityContract.secondary_themes) {
            if (lowerTitle.includes(secTheme.toLowerCase())) {
                complementaryCount++;
            }
        }
        titleScore += Math.min(4, complementaryCount * 2);

        // Removed cluster cross-pollination penalty to allow up to 4 compatible themes without deduction.
    } else {
        // Unthemed logic
        titleScore += 8; // Auto-award anchor if no theme is strictly required
    }

    // Filler Density (5 pts)
    const words = lowerTitle.split(/\s+/);
    const fillerWords = ["gift", "for her", "beautiful", "amazing", "stunning", "perfect"];
    const fillerCount = words.filter(w => fillerWords.includes(w)).length;
    const fillerRatio = words.length > 0 ? fillerCount / words.length : 0;
    if (fillerRatio < 0.1) {
        titleScore += 5;
    } else {
        weaknesses.push(`High filler density in title (${Math.round(fillerRatio * 100)}%).`);
    }

    // Format Signal (3 pts)
    if (lowerTitle.includes("printable") || lowerTitle.includes("digital download") || lowerTitle.includes("digital")) {
        titleScore += 3;
    } else {
        weaknesses.push("Missing format signal ('printable' or 'digital download') in title.");
    }

    // Natural Connector Check (NEW — 4 pts for NLP sentence structure)
    const hasWithConnector = /\bwith\b/i.test(lowerTitle);
    const hasForConnector = /\bfor\b/i.test(lowerTitle);
    const hasAndConnector = /\band\b/i.test(lowerTitle);
    const connectorCount = [hasWithConnector, hasForConnector, hasAndConnector].filter(Boolean).length;

    if (connectorCount >= 2) {
        titleScore += 4;
        strengths.push("Strong NLP sentence structure with multiple natural connectors.");
    } else if (connectorCount === 1) {
        titleScore += 2;
        weaknesses.push("Title has only one natural connector. Use 'with', 'for', or 'and' to create flowing phrases.");
    } else {
        weaknesses.push("No natural connectors found ('with', 'for', 'and'). Title reads like a keyword list, not a product name.");
    }

    // Redundancy Detector
    let redundantPairs: string[] = [];
    if (lowerTitle.includes("printable") && (lowerTitle.includes("digital download") || lowerTitle.includes("digital file"))) {
        redundantPairs.push("'printable' + 'digital download/file'");
    }
    if (lowerTitle.includes("vintage") && lowerTitle.includes("antique")) {
        redundantPairs.push("'vintage' + 'antique'");
    }

    const titleWordCounts = new Map<string, number>();
    const ignoreWords = new Set(["for", "and", "with", "the", "junk", "journal", "pages", "printable", "digital", "download", "paper", "pack", "craft", "supplies", "art", "designs", "design", "illustration", "decor", "print", "files", "kit", "set"]);

    words.forEach(w => {
        const cleanWord = w.replace(/[^a-z]/g, '');
        if (cleanWord.length > 2 && !ignoreWords.has(cleanWord)) {
            titleWordCounts.set(cleanWord, (titleWordCounts.get(cleanWord) || 0) + 1);
        }
    });

    for (const [word, count] of titleWordCounts.entries()) {
        if (count > 2) {
            const extraOccurrences = count - 2;
            const penalty = extraOccurrences * 5;
            titleScore -= penalty;
            weaknesses.push(`Root word '${word}' repeated ${count}× (-${penalty}pts). Max allowed is 2.`);
        }
    }

    // Explicit check for "printable pages" when "journal pages" is present
    if ((lowerTitle.includes("junk journal pages") || lowerTitle.includes("journal pages")) && lowerTitle.includes("printable pages")) {
        redundantPairs.push("'printable pages' repeating 'pages'");
    }


    if (redundantPairs.length > 0) {
        const deduction = Math.min(6, redundantPairs.length * 2);
        titleScore -= deduction;
        weaknesses.push(`Redundancy detected (-${deduction}pts): ${(Array.isArray(redundantPairs) ? redundantPairs : []).join(', ')}`);
    }

    // Title Phrase Match (bonus/penalty based on competitor vocabulary usage)
    const safeCompetitorPhrases = Array.isArray(competitorPhrases) ? competitorPhrases : [];
    if (safeCompetitorPhrases.length > 0) {
        const matchedPhrases = (Array.isArray(safeCompetitorPhrases) ? safeCompetitorPhrases : []).filter(phrase => lowerTitle.includes((phrase || "").toLowerCase()));
        if (matchedPhrases.length >= 3) {
            titleScore += 5;
            strengths.push(`Strong competitor vocabulary: ${matchedPhrases.length} proven phrases found in title (+5pts).`);
        } else if (matchedPhrases.length >= 1) {
            titleScore += 2;
            weaknesses.push(`Only ${matchedPhrases.length} competitor phrase(s) in title (+2pts). Use more proven theme vocabulary.`);
        } else {
            titleScore -= 5;
            weaknesses.push(`Zero competitor phrases in title (-5pts). Title ignores proven market vocabulary.`);
        }
    }

    // Title length range bonus (100-140 is ideal)
    if (title.length >= 100 && title.length <= 140) {
        titleScore += 2;
        strengths.push("Title length in ideal 100-140 character range.");
    } else if (title.length > 140) {
        titleScore -= 5;
        weaknesses.push(`Title is ${title.length} chars — exceeds 140. Trim to avoid truncation.`);
    } else {
        weaknesses.push(`Title is only ${title.length} chars. Target 100-140 for maximum search coverage.`);
    }

    titleScore = Math.max(0, Math.min(35, titleScore));

    // --- PILLAR 2: TAG INTELLIGENCE (Max 35) ---
    let tagsScore = 0;

    // Sub-pillar tracking
    let intentRatioScore = 0;
    let themeCoverageScore = 0;
    let deliveryClarityScore = 0;
    let commercialUseScore = 0;

    // Buyer Intent Tag Ratio (15 pts)
    let multiWordTags = 0;
    let singleWordTags = 0;
    lowerTags.forEach(tag => {
        if (tag.split(' ').length > 1) multiWordTags++;
        else singleWordTags++;
    });

    if (multiWordTags >= 9) {
        intentRatioScore = 15;
        strengths.push("Excellent buyer intent multi-word tag ratio.");
    } else if (multiWordTags >= 5) {
        intentRatioScore = 8;
        weaknesses.push(`Only ${multiWordTags} multi-word tags. Shift to phrase-based tags.`);
    } else {
        intentRatioScore = 0;
        weaknesses.push(`Too many single-word tags (${singleWordTags}). Needs 'theme + product' structure.`);
    }
    tagsScore += intentRatioScore;

    // Theme Coverage (10 pts)
    if (identityContract && identityContract.primary_theme !== "unthemed") {
        const stemWord = (w: string) => w.replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');
        const themeWords = (identityContract.primary_theme || "").toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const stemmedThemeWords = (Array.isArray(themeWords) ? themeWords : []).map(stemWord);

        // Use GPT-extracted theme synonyms instead of hardcoded map
        const expandedThemeWords = new Set<string>(stemmedThemeWords);
        if (identityContract.theme_synonyms && identityContract.theme_synonyms.length > 0) {
            identityContract.theme_synonyms.forEach(syn => expandedThemeWords.add(stemWord(syn.toLowerCase())));
        }

        const themeTags = lowerTags.filter(t => {
            const splitWords = (t || "").split(/\s+/);
            const tagWords = (Array.isArray(splitWords) ? splitWords : []).map(stemWord);
            return Array.from(expandedThemeWords).some(sw => tagWords.some(tw => tw.includes(sw) || sw.includes(tw)));
        });

        if (themeTags.length >= 3) {
            themeCoverageScore += 5;
        } else {
            weaknesses.push(`Missing theme coverage in tags. Need at least 3 tags containing '${identityContract.primary_theme}' (found ${themeTags.length}).`);
        }

        if (identityContract.secondary_themes.length > 0) {
            const hasSecondary = identityContract.secondary_themes.some(st => allTagsText.includes(st.toLowerCase()));
            if (hasSecondary) {
                themeCoverageScore += 5;
            } else {
                weaknesses.push("Missing secondary theme coverage in tags.");
            }
        } else {
            themeCoverageScore += 5; // Auto-award if no secondary themes requested
        }
    } else {
        themeCoverageScore = 10;
    }
    tagsScore += themeCoverageScore;

    // Delivery Clarity Tag (5 pts)
    if (allTagsText.includes("instant download") || allTagsText.includes("digital journal") || allTagsText.includes("google drive")) {
        deliveryClarityScore = 5;
        strengths.push("Excellent delivery clarity in tags.");
    } else {
        deliveryClarityScore = 0;
        weaknesses.push("Missing delivery clarity tag (e.g., 'instant download').");
    }
    tagsScore += deliveryClarityScore;

    // Commercial Use Tag Preference (5 pts)
    let hasStrongCommercialTag = false;
    let hasWeakCommercialTag = false;
    lowerTags.forEach(tag => {
        if (tag.includes("commercial use license") || tag.includes("commercial use included")) {
            hasStrongCommercialTag = true;
        } else if (tag === "commercial use" || tag.includes("commercial use")) {
            hasWeakCommercialTag = true;
        }
    });

    if (hasStrongCommercialTag) {
        commercialUseScore = 5;
        strengths.push("Strong commercial use tag pattern used ('commercial use license' or 'included').");
    } else if (hasWeakCommercialTag) {
        commercialUseScore = 3;
        weaknesses.push("'commercial use' standalone scores 3/5. Use 'commercial use license' or 'commercial use included' for full credit.");
    } else {
        commercialUseScore = 0;
        weaknesses.push("Missing commercial use tag (e.g., 'commercial use license').");
    }
    tagsScore += commercialUseScore;

    tagsScore = Math.max(0, Math.min(35, tagsScore));

    // Word Order Sanity Check
    if (allTagsText.includes("journal junk") || allTagsText.includes("notebook junk")) {
        tagsScore -= 5;
        weaknesses.push("Malformed tag detected: Use 'junk journal' instead of reversed 'journal junk' or 'notebook junk'.");
    }

    // --- PILLAR 3: DESCRIPTION PERFORMANCE (Max 20) ---
    let descScore = 0;

    // Google Drive Delivery Explanation (6 pts)
    const hasGoogleDrive = lowerDesc.includes("google drive");
    const hasDeliveryFlow = hasGoogleDrive && lowerDesc.includes("pdf") && (lowerDesc.includes("link") || lowerDesc.includes("download"));
    let missingGoogleDrive = false;

    if (hasDeliveryFlow) {
        descScore += 6;
        strengths.push("Clear Google Drive PDF delivery flow explained.");
    } else if (hasGoogleDrive) {
        descScore += 3;
        weaknesses.push("Google Drive mentioned, but the PDF download delivery flow is unclear.");
    } else {
        missingGoogleDrive = true;
        weaknesses.push("DELIVERY CONFUSION RISK: Delivery method (PDF with Google Drive link) not explicitly explained.");
    }

    // Technical Specs Block (5 pts)
    let techSpecsPoints = 0;
    let missingSpecs = false;
    if (lowerDesc.includes("160") || lowerDesc.includes("pages")) techSpecsPoints += 1.25;
    else missingSpecs = true;
    if (lowerDesc.includes("jpg") || lowerDesc.includes("jpeg")) techSpecsPoints += 1.25;
    else missingSpecs = true;
    if (lowerDesc.includes("8.5x11") || lowerDesc.includes("8.5 x 11") || lowerDesc.includes("a4")) techSpecsPoints += 1.25;
    else missingSpecs = true;
    if (lowerDesc.includes("300 dpi") || lowerDesc.includes("300dpi")) techSpecsPoints += 1.25;
    else missingSpecs = true;

    descScore += Math.round(techSpecsPoints);
    if (techSpecsPoints < 5) {
        weaknesses.push("Missing explicit technical specification (160+ pages, JPG, 8.5x11, 300 DPI).");
    }

    // Commercial Use Statement (4 pts)
    let missingCommercialUseState = false;
    if (lowerDesc.includes("commercial use allowed") || lowerDesc.includes("commercial use is allowed") || lowerDesc.includes("for commercial use") || lowerDesc.includes("commercial use license")) {
        descScore += 4;
    } else {
        missingCommercialUseState = true;
        weaknesses.push("Missing explicit commercial use statement in description.");
    }

    // Emotional Hook (3 pts)
    const sensoryWords = ["beautiful", "dreamy", "rustic", "haunting", "whimsical", "rich", "vintage", "charm", "botanical"];
    const firstPara = lowerDesc.split('\n')[0] || lowerDesc;
    if (sensoryWords.some(w => firstPara.includes(w))) {
        descScore += 3;
    } else {
        descScore += 1;
        weaknesses.push("First paragraph lacks strong sensory/emotional hook language.");
    }

    // Structure & Length (2 pts)
    if (description.length > 800) descScore += 1;
    if (description.includes("-") || description.includes("•")) descScore += 1;

    descScore = Math.max(0, Math.min(20, descScore));

    // --- PILLAR 4 ---
    let ctrScore = 15;
    if (title.length > 140) {
        ctrScore -= 5;
        ctrRiskReasons.push("Title exceeds 140 characters.");
    }
    if ((title.match(/[A-Z]/g)?.length || 0) > title.length * 0.5) {
        ctrScore -= 5;
        ctrRiskReasons.push("Spammy capitalization detected.");
    }

    let overallScore = titleScore + tagsScore + descScore + ctrScore;

    // --- IDENTITY VIOLATION PENALTIES (JUNK JOURNAL PAGES MODE) ---
    let hardCapLimit = 100;

    if (identityContract) {
        // Missing Theme in Title (-20pts)
        if (missingPrimaryTheme && identityContract.primary_theme !== "unthemed") {
            overallScore -= 20;
            hardCapLimit = Math.min(hardCapLimit, 95);
        }

        // Missing "junk journal pages" (-15pts)
        if (!hasJunkJournalCore && !allTagsText.includes("junk journal pages")) {
            overallScore -= 15;
            hardCapLimit = Math.min(hardCapLimit, 95);
            weaknesses.push("IDENTITY VIOLATION: 'junk journal pages' phrase missing entirely.");
        }

        // Google Drive Delivery Not Explained (-15pts)
        if (missingGoogleDrive) {
            overallScore -= 15;
            hardCapLimit = Math.min(hardCapLimit, 95);
        }

        // Missing Commercial Use (-10pts)
        if (missingCommercialUseState) {
            overallScore -= 10;
            hardCapLimit = Math.min(hardCapLimit, 95);
        }

        // Contradictory Theme Detected (-20pts & Hard Cap at 50)
        if (hasContradictoryTheme) {
            overallScore -= 20;
            hardCapLimit = Math.min(hardCapLimit, 50);
            weaknesses.push("IDENTITY VIOLATION: Contradictory motif hallucinated by AI.");
        }

        // Theme Absence Violation (-20pts)
        if (identityContract.primary_theme !== "unthemed") {
            const themeTags = lowerTags.filter(t => t.includes(identityContract.primary_theme.toLowerCase()));
            if (!lowerTitle.includes(identityContract.primary_theme.toLowerCase()) && themeTags.length < 2) {
                overallScore -= 20;
                hardCapLimit = Math.min(hardCapLimit, 95);
                weaknesses.push("IDENTITY VIOLATION: Product theme was stripped out, becoming generic.");
            }
        }

        // Missing Functional Specs (-10pts)
        if (missingSpecs) {
            overallScore -= 10;
            hardCapLimit = Math.min(hardCapLimit, 95);
            weaknesses.push("IDENTITY VIOLATION: Required technical specs (160+ pages, JPG, etc.) are missing.");
        }
    }

    // ELITE 100 CONDITIONS CHECK
    if (fillerRatio >= 0.1) hardCapLimit = Math.min(hardCapLimit, 95);
    if (!hasJunkJournalInFirst60) hardCapLimit = Math.min(hardCapLimit, 95);
    if (singleWordTags > 4) hardCapLimit = Math.min(hardCapLimit, 95);

    overallScore = Math.max(0, Math.min(overallScore, hardCapLimit));

    return {
        overallScore,
        pillars: {
            title: titleScore,
            tags: tagsScore,
            description: descScore,
            ctrRisk: ctrScore
        },
        tagSubPillars: {
            intentRatio: { score: intentRatioScore, max: 15, label: 'Intent Ratio' },
            themeCoverage: { score: themeCoverageScore, max: 10, label: 'Theme Coverage' },
            deliveryClarity: { score: deliveryClarityScore, max: 5, label: 'Delivery Clarity' },
            commercialUse: { score: commercialUseScore, max: 5, label: 'Commercial Use' }
        },
        strengths,
        weaknesses,
        ctrRiskScore: ctrScore,
        ctrRiskReasons
    };
}
