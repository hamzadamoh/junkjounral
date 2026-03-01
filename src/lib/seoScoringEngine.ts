import { calculateFillerDensity } from './seoEfficiencyRules';
import { analyzeTagBalance } from './tagIntentClassifier';
import { calculateSpecificityScore, calculateIntentDensity, checkNicheSharpness } from './semanticSpecificity';
import { analyzeTagContainment } from './productBoundaryGuard';
import { calculateCTRRisk } from './ctrRiskAnalyzer';

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

export function evaluateListingSEO(title: string, tags: string[], description: string): SEOScore {
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let ctrRiskReasons: string[] = [];

    // PILLAR 1: TITLE ENGINEERING (Max 30)
    let titleScore = 0;
    let titleCap = 100;

    if (!title) {
        weaknesses.push("Title is missing.");
    } else {
        const lowerTitle = title.toLowerCase();

        // 1. Buyer Intent Core (10 pts)
        const first60 = lowerTitle.substring(0, 60);
        const intent = calculateIntentDensity(title);
        const hasCoreInFirst60 = intent.matches.some(noun => first60.includes(noun));

        if (hasCoreInFirst60) {
            titleScore += 10;
        } else {
            titleCap = 20;
            weaknesses.push("Missing core product noun in the first 60 characters.");
        }

        // 2. Intent Density (5 pts)
        const specific = calculateSpecificityScore(title);
        const niche = checkNicheSharpness(title);
        const hasThemeModifier = niche.matchedAesthetics.length > 0 || specific.matches.length > 0;

        if (intent.density >= 2 && hasThemeModifier) {
            titleScore += 5;
            strengths.push(`High intent density (${intent.density} core nouns) with thematic modifiers.`);
        } else if (intent.density === 1 && hasThemeModifier) {
            titleScore += 3;
            weaknesses.push("Only 1 core product noun detected (need 2+ for max density).");
        } else {
            weaknesses.push("aesthetic-only title detected or missing noun density (0 points).");
        }

        // 3. Specificity Index (5 pts)
        if (specific.matches.length >= 2) {
            titleScore += 5;
            strengths.push(`High specificity motif density: ${specific.matches.join(', ')}`);
        } else if (specific.matches.length === 1) {
            titleScore += 3;
            strengths.push(`Specificity motif detected: ${specific.matches[0]}`);
        } else {
            weaknesses.push("Missing a highly specific aesthetic motif or visual differentiation marker.");
        }

        // 4. Filler Density (5 pts)
        const fillerRatio = calculateFillerDensity(title);
        if (fillerRatio < 0.1) {
            titleScore += 5;
            strengths.push(`Excellent filler density (${Math.round(fillerRatio * 100)}%).`);
        } else if (fillerRatio <= 0.2) {
            titleScore += 3;
        } else if (fillerRatio <= 0.3) {
            titleScore += 1;
            weaknesses.push(`High filler density (${Math.round(fillerRatio * 100)}%).`);
        } else {
            weaknesses.push(`Severe filler density (${Math.round(fillerRatio * 100)}%).`);
        }

        // 5. Niche Sharpness (5 pts)
        const aestheticCount = niche.matchedAesthetics.length;
        if (aestheticCount <= 3) {
            titleScore += 5;
        } else if (aestheticCount === 4) {
            titleScore += 2; // -3 from 5
            weaknesses.push(`Aesthetic saturation warning (4 themes). Focus the niche.`);
        } else {
            weaknesses.push(`Aesthetic overload (${aestheticCount} themes). Severely dilutes niche.`);
        }
    }

    // PILLAR 2: TAG INTELLIGENCE (Max 25)
    let tagsScore = 0;
    if (!tags || tags.length === 0) {
        weaknesses.push("Missing tags.");
    } else {
        const analysis = analyzeTagBalance(tags);
        const containment = analyzeTagContainment(tags);

        // 1. Transactional Tag Ratio (10 pts)
        if (analysis.transactional >= 9) {
            tagsScore += 10;
        } else if (analysis.transactional >= 6) {
            tagsScore += 7;
        } else {
            weaknesses.push(`Low transactional tags (${analysis.transactional}/13). Need 6+ containing core product nouns.`);
        }

        // 2. Thematic Spread (5 pts)
        if (analysis.thematic >= 3) {
            tagsScore += 5;
        } else if (analysis.thematic === 0 && analysis.transactional > 0) {
            tagsScore += 2; // 5 - 3
            weaknesses.push("All tags are product-only. Missing thematic spread.");
        } else {
            tagsScore += 3;
            weaknesses.push(`Low thematic tags (${analysis.thematic}/13). Need 3 minimum.`);
        }

        // 3. Vague Tag Ratio (5 pts)
        const vagueRatio = tags.length > 0 ? analysis.vague / tags.length : 1;
        if (vagueRatio < 0.1) {
            tagsScore += 5;
        } else if (vagueRatio <= 0.25) {
            tagsScore += 3;
        } else {
            weaknesses.push(`Too many vague tags (${Math.round(vagueRatio * 100)}%). Reduce generic phrases.`);
        }

        // 4. Containment Compliance (5 pts)
        if (containment.isValid && containment.formatViolations.length === 0) {
            tagsScore += 5;
        } else {
            titleCap = Math.min(titleCap, 85); // Auto cap at 85
            weaknesses.push(`CRITICAL: Format containment violation detected (${containment.formatViolations.join(', ')}). Auto-capping score at 85.`);
        }
    }

    // PILLAR 3: DESCRIPTION PERFORMANCE (Max 20)
    let descScore = 0;
    if (!description) {
        weaknesses.push("Missing description.");
    } else {
        const firstParagraph = description.split('\n\n')[0] || description.substring(0, 300);
        const lowerDesc = description.toLowerCase();

        // 1. Emotional Hook (5 pts)
        const sensoryWords = ["soft", "delicate", "moody", "dreamy", "aged", "textured", "faded", "hand-painted", "romantic", "whimsical", "vintage", "enchanted", "gothic", "aesthetic"];
        const audienceTerms = ["for crafting", "journalers", "enthusiast", "maker", "creator", "artist", "scrapbooker", "diy", "you"];
        const hasSensory = sensoryWords.some(w => firstParagraph.toLowerCase().includes(w));
        const hasAudience = audienceTerms.some(w => firstParagraph.toLowerCase().includes(w));

        let missingHooks = 0;
        if (!hasSensory) missingHooks++;
        if (!hasAudience) missingHooks++;

        if (missingHooks === 0) {
            descScore += 5;
            strengths.push("Strong emotional hook and audience indicator in description.");
        } else if (missingHooks === 1) {
            descScore += 3;
        } else {
            weaknesses.push("Missing sensory/emotional hook and audience indicator in description opening.");
        }

        // 2. Differentiation Signal (5 pts)
        const specific = calculateSpecificityScore(description);
        if (specific.matches.length > 0) {
            descScore += 5;
        } else {
            weaknesses.push("Generic description template without unique differentiation motifs.");
        }

        // 3. Format Clarity (5 pts)
        const hasDigital = lowerDesc.includes("digital");
        const hasPrintable = lowerDesc.includes("printable") || lowerDesc.includes("print");
        const hasNoPhysical = lowerDesc.includes("no physical") || lowerDesc.includes("physical item");
        const hasFormat = lowerDesc.includes("pdf") || lowerDesc.includes("jpg") || lowerDesc.includes("png") || lowerDesc.includes("zip");

        if (hasDigital && hasPrintable && hasNoPhysical && hasFormat) {
            descScore += 5;
        } else {
            descScore += 2; // -3 from 5
            weaknesses.push("Ambiguous format clarity. Missing clear 'no physical item' or file format indicators.");
        }

        // 4. Structure & Length (5 pts)
        if (description.length > 800 && description.includes("-")) {
            descScore += 5;
        } else if (description.length >= 600) {
            descScore += 3;
        } else {
            weaknesses.push(`Description is too short (${description.length} chars). Clean formatting and depth needed.`);
        }
    }

    // PILLAR 4: CTR RISK PROFILE (Max 15)
    // Start at 15. Subtract risk.
    const ctrData = calculateCTRRisk(title, description);
    ctrRiskReasons.push(...ctrData.reasons);
    let ctrScore = ctrData.riskScore;

    // PILLAR 5: CLUSTER POSITIONING (Max 10)
    let clusterScore = 10;
    const niche = checkNicheSharpness(title || "");
    if (niche.matchedAesthetics.length > 2) {
        clusterScore -= 3;
        weaknesses.push("Blended identity cluster (Too many aesthetics). Focus on ONE dominant pattern.");
    }

    // CALCULATE FINAL SCORE
    let overallScore = titleScore + tagsScore + descScore + ctrScore + clusterScore;

    // ELITE 100 CONDITIONS CHECK
    let isElite = true;
    const fillerRatio = calculateFillerDensity(title || "");
    const intent = calculateIntentDensity(title || "");
    const specific = calculateSpecificityScore(title || "");
    const analysis = analyzeTagBalance(tags || []);
    const lowerTitle = (title || "").toLowerCase();
    const first50 = lowerTitle.substring(0, 50);
    const hasCoreInFirst50 = intent.matches.some(noun => first50.includes(noun));
    const containment = analyzeTagContainment(tags || []);

    if (fillerRatio >= 0.1) isElite = false;
    if (intent.density < 2) isElite = false;
    if (specific.matches.length === 0) isElite = false;
    if (analysis.vague / Math.max(tags?.length || 1, 1) >= 0.1) isElite = false;
    if (analysis.transactional < 6) isElite = false;
    if (containment.formatViolations.length > 0) isElite = false;
    if (niche.matchedAesthetics.length >= 4) isElite = false;
    if (!hasCoreInFirst50) isElite = false;

    if (!isElite && overallScore > 95) {
        overallScore = 95; // Anything missing -> 95 max
    }

    if (overallScore > titleCap) {
        overallScore = titleCap;
    }

    overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));

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
        ctrRiskScore: ctrData.riskScore,
        ctrRiskReasons
    };
}
