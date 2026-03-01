import { calculateFillerDensity } from './seoEfficiencyRules';
import { calculateSpecificityScore, checkNicheSharpness, calculateIntentDensity } from './semanticSpecificity';

export function calculateCTRRisk(title: string, description: string): { riskPenalty: number, riskScore: number, reasons: string[] } {
    let ctrScore = 15;
    const reasons: string[] = [];

    const lowerTitle = title ? title.toLowerCase() : "";

    // Generic density > 25% -> -5
    const fillerRatio = calculateFillerDensity(title);
    if (fillerRatio > 0.25) {
        ctrScore -= 5;
        reasons.push(`High density of generic words (${Math.round(fillerRatio * 100)}%). Lacks specificity.`);
    }

    // No motif word -> -5
    const specific = calculateSpecificityScore(title);
    if (specific.matches.length === 0) {
        ctrScore -= 5;
        reasons.push("Title lacks a highly specific motif or differentiation marker.");
    }

    // 4+ aesthetics -> -3
    const niche = checkNicheSharpness(title);
    if (niche.matchedAesthetics.length >= 4) {
        ctrScore -= 3;
        reasons.push(`Too many aesthetics mixed (${niche.matchedAesthetics.length}). Buyer confusion risk.`);
    }

    // Weak first 50 chars -> -5
    const intent = calculateIntentDensity(title);
    const first50 = lowerTitle.substring(0, 50);
    const hasCoreInFirst50 = intent.matches.some(noun => first50.includes(noun));
    if (!hasCoreInFirst50) {
        ctrScore -= 5;
        reasons.push("Weak first 50 characters: Missing core product noun.");
    }

    ctrScore = Math.max(0, ctrScore);

    return {
        riskPenalty: 15 - ctrScore,
        riskScore: ctrScore,
        reasons
    };
}
