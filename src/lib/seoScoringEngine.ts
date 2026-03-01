import { JunkJournalPagesIdentity, COMPATIBLE_THEME_CLUSTERS, ThemeCluster } from '../types/productIdentity';

export interface SEOPillarScores {
    title: number;
    tags: number;
    description: number;
    ctrRisk: number;
    clusterPositioning: number;
}

export interface SEOScore {
    overallScore: number;
    pillars: SEOPillarScores;
    strengths: string[];
    weaknesses: string[];
    ctrRiskScore: number;
    ctrRiskReasons: string[];
}

export function evaluateListingSEO(title: string, tags: string[], description: string, identityContract?: JunkJournalPagesIdentity): SEOScore {
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let ctrRiskReasons: string[] = [];

    const lowerTitle = (title || "").toLowerCase();
    const lowerDesc = (description || "").toLowerCase();
    const lowerTags = (tags || []).map(t => t.toLowerCase());
    const allTagsText = lowerTags.join(' ');

    // --- PILLAR 1: TITLE ENGINEERING (Max 30) ---
    let titleScore = 0;

    // Buyer Intent Core (10 pts)
    const first40 = lowerTitle.substring(0, 40);
    const hasJunkJournalCore = lowerTitle.includes("junk journal pages") || lowerTitle.includes("journal pages");
    const hasJunkJournalInFirst40 = first40.includes("junk journal pages") || first40.includes("journal pages");

    if (hasJunkJournalCore && hasJunkJournalInFirst40) {
        titleScore += 10;
        strengths.push("Core intent 'junk journal pages' found in first 40 chars.");
    } else if (hasJunkJournalCore) {
        titleScore += 5;
        weaknesses.push("Core product 'junk journal pages' is pushed past the first 40 characters.");
    } else {
        weaknesses.push("Missing core product phrase 'junk journal pages' or 'journal pages'.");
    }

    // Theme Anchor (8 pts) vs Complementary Theme Bonus (4 pts) vs Contradictory Penalty
    let hasContradictoryTheme = false;
    let missingPrimaryTheme = false;

    if (identityContract && identityContract.primary_theme !== "unthemed") {
        const primaryTheme = identityContract.primary_theme.toLowerCase();

        // Theme Anchor (8 pts)
        if (first40.includes(primaryTheme)) {
            titleScore += 8;
            strengths.push(`Primary theme '${primaryTheme}' anchored in first 40 chars.`);
        } else if (lowerTitle.includes(primaryTheme)) {
            titleScore += 4;
            weaknesses.push(`Primary theme '${primaryTheme}' is present but pushed past the first 40 characters.`);
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

        // Subcultural keyword mapping to catch cross-cluster hallucination
        const clusterKeywords: Record<ThemeCluster, string[]> = {
            vintage_antique: ["vintage", "antique", "retro", "old"],
            cottagecore_botanical: ["cottagecore", "botanical", "mushroom", "forest"],
            gothic_dark: ["gothic", "dark", "creepy", "macabre", "vampire", "witch"],
            coastal_beach: ["coastal", "beach", "ocean", "sea", "nautical"],
            christmas_winter: ["christmas", "winter", "snow", "holiday", "festive"],
            halloween_spooky: ["halloween", "spooky", "scary", "ghost", "pumpkin"],
            floral_romantic: ["floral", "romantic", "rose", "lace", "pink", "love"],
            masculine_industrial: ["masculine", "industrial", "steampunk", "gears", "metal"],
            mixed_eclectic: ["mixed media", "eclectic", "junk", "collage"],
            unthemed: [],
            other: []
        };

        for (const [cluster, keywords] of Object.entries(clusterKeywords)) {
            if (cluster === identityContract.theme_cluster || cluster === "unthemed" || cluster === "other") continue;
            if (validComplements.includes(cluster as ThemeCluster)) continue;

            for (const kw of keywords) {
                // To avoid accidental matches inside words, we can just check bounds but simple includes is fine for demo
                const paddedKw = ` ${kw} `;
                const paddedTitle = ` ${lowerTitle} `;

                if (paddedTitle.includes(paddedKw)) {
                    hasContradictoryTheme = true;
                    weaknesses.push(`Contradictory theme detected: '${kw}' conflicts with ${identityContract.theme_cluster}.`);
                    titleScore -= 4; // Deduction for title pillar
                    break;
                }
            }
        }
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

    titleScore = Math.max(0, Math.min(30, titleScore));

    // --- PILLAR 2: TAG INTELLIGENCE (Max 25) ---
    let tagsScore = 0;

    // Buyer Intent Tag Ratio (10 pts)
    let multiWordTags = 0;
    let singleWordTags = 0;
    lowerTags.forEach(tag => {
        if (tag.split(' ').length > 1) multiWordTags++;
        else singleWordTags++;
    });

    if (multiWordTags >= 9) {
        tagsScore += 10;
        strengths.push("Excellent buyer intent multi-word tag ratio.");
    } else if (multiWordTags >= 5) {
        tagsScore += 5;
        weaknesses.push(`Only ${multiWordTags} multi-word tags. Shift to phrase-based tags.`);
    } else {
        weaknesses.push(`Too many single-word tags (${singleWordTags}). Needs 'theme + product' structure.`);
    }

    // Theme Coverage (5 pts)
    if (identityContract && identityContract.primary_theme !== "unthemed") {
        const themeTags = lowerTags.filter(t => t.includes(identityContract.primary_theme.toLowerCase()));
        if (themeTags.length >= 3) {
            tagsScore += 3;
        } else {
            weaknesses.push(`Missing theme coverage in tags. Need at least 3 tags containing '${identityContract.primary_theme}'.`);
        }

        if (identityContract.secondary_themes.length > 0) {
            const hasSecondary = identityContract.secondary_themes.some(st => allTagsText.includes(st.toLowerCase()));
            if (hasSecondary) {
                tagsScore += 2;
            } else {
                weaknesses.push("Missing secondary theme coverage in tags.");
            }
        } else {
            tagsScore += 2; // Auto-award if no secondary themes requested
        }
    } else {
        tagsScore += 5;
    }

    // Commercial Use Tag (5 pts)
    const hasCommercial = allTagsText.includes("commercial use") || allTagsText.includes("commercial license");
    const hasDigital = allTagsText.includes("digital download") || allTagsText.includes("printable");

    if (hasCommercial && hasDigital) {
        tagsScore += 5;
        strengths.push("Tags contain commercial use and digital identifiers.");
    } else if (hasCommercial || hasDigital) {
        tagsScore += 2;
        weaknesses.push("Tags must ideally contain both 'commercial use' and 'digital download/printable'.");
    } else {
        tagsScore -= 5;
        weaknesses.push("Tags missing critical 'commercial use' identifier.");
    }

    // Delivery Clarity Tag (5 pts)
    if (allTagsText.includes("instant download") || allTagsText.includes("digital journal") || allTagsText.includes("google drive")) {
        tagsScore += 5;
    } else {
        weaknesses.push("Missing delivery clarity tag (e.g., 'instant download').");
    }

    tagsScore = Math.max(0, Math.min(25, tagsScore));

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
    if (lowerDesc.includes("commercial use") || lowerDesc.includes("commercial license")) {
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

    // --- PILLAR 4 & 5 ---
    let ctrScore = 15;
    if (title.length > 140) {
        ctrScore -= 5;
        ctrRiskReasons.push("Title exceeds 140 characters.");
    }
    if ((title.match(/[A-Z]/g)?.length || 0) > title.length * 0.5) {
        ctrScore -= 5;
        ctrRiskReasons.push("Spammy capitalization detected.");
    }

    let clusterScore = 10;
    if (hasContradictoryTheme) clusterScore -= 3;

    let overallScore = titleScore + tagsScore + descScore + ctrScore + clusterScore;

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
    if (!hasJunkJournalInFirst40) hardCapLimit = Math.min(hardCapLimit, 95);
    if (singleWordTags > 4) hardCapLimit = Math.min(hardCapLimit, 95);

    overallScore = Math.max(0, Math.min(overallScore, hardCapLimit));

    return {
        overallScore,
        pillars: {
            title: titleScore,
            tags: tagsScore,
            description: descScore,
            ctrRisk: ctrScore,
            clusterPositioning: clusterScore
        },
        strengths,
        weaknesses,
        ctrRiskScore: ctrScore,
        ctrRiskReasons
    };
}
