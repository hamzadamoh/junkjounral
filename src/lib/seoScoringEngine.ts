import { calculateFillerDensity, checkTailEfficiency, LOW_EFFICIENCY_TITLE_WORDS } from './seoEfficiencyRules';
import { calculateTagIntentScore, classifyTag, analyzeTagBalance } from './tagIntentClassifier';
import { calculateSpecificityScore, calculateIntentDensity, checkNicheSharpness } from './semanticSpecificity';

export interface SEOScore {
    overallScore: number;
    titleScore: number;
    tagsScore: number;
    descriptionScore: number;
    strengths: string[];
    weaknesses: string[];
}

export function evaluateListingSEO(title: string, tags: string[], description: string): SEOScore {
    let strengths: string[] = [];
    let weaknesses: string[] = [];

    // TITLE EVALUATION
    let titleScore = 100;
    if (!title) {
        titleScore = 0;
        weaknesses.push("Title is missing.");
    } else {
        // 1. Core Filler check
        const fillerDensity = calculateFillerDensity(title);
        if (fillerDensity > 0.4) {
            titleScore -= 25;
            weaknesses.push(`High filler density (${Math.round(fillerDensity * 100)}%). Remove broad terms.`);
        } else if (fillerDensity > 0.25) {
            titleScore -= 15;
            weaknesses.push(`Moderate filler density (${Math.round(fillerDensity * 100)}%). Make phrasing more specific.`);
        }

        // 2. Tail efficiency
        if (checkTailEfficiency(title)) {
            titleScore -= 10;
            weaknesses.push("Weak tail detected. Remove trailing category phrases.");
        }

        // 3. Semantic Specificity Reward
        const specificity = calculateSpecificityScore(title);
        if (specificity.score > 0) {
            titleScore += specificity.score;
            strengths.push(`High specificity phrasing detected: ${specificity.matches.join(', ')}`);
        }

        // 4. Intent Density Enforcement
        const intent = calculateIntentDensity(title);
        if (intent.density < 2) {
            titleScore -= 15;
            weaknesses.push("Low intent density. Needs at least 2 core product nouns (e.g., 'junk journal', 'ephemera').");
        } else {
            strengths.push(`High intent density (${intent.density} core nouns).`);
        }

        // 5. Niche Sharpness
        const niche = checkNicheSharpness(title);
        if (niche.isDiluted) {
            titleScore -= 10;
            weaknesses.push(`Aesthetic saturation warning. Too many themes (${niche.matchedAesthetics.length}). Focus the niche.`);
        }

        // 6. Competitive Length Optimization
        const isHighlyOptimized = fillerDensity < 0.15 && specificity.score >= 10 && intent.density >= 2;

        if (title.length < 110) {
            titleScore -= 10;
            weaknesses.push("Title is too short. Use more secondary modifiers.");
        } else if (title.length <= 125 && isHighlyOptimized) {
            strengths.push("Competitive shortened title length allowed due to extreme density density.");
        } else if (title.length >= 110 && title.length <= 140) {
            strengths.push("Excellent title length (110-140 chars).");
        }

        if (title.length > 145) {
            titleScore -= 10;
            weaknesses.push("Title exceeds padding limits.");
        }
    }
    titleScore = Math.min(100, Math.max(titleScore, 0));

    // TAGS EVALUATION
    let tagsScore = 0;
    if (!tags || tags.length === 0) {
        weaknesses.push("Missing tags.");
    } else {
        tagsScore = calculateTagIntentScore(tags);
        const analysis = analyzeTagBalance(tags);

        if (tagsScore < 70) {
            weaknesses.push("High ratio of vague tags. Use stricter product+aesthetic terms.");
        }

        if (analysis.transactional >= 5 && analysis.thematic >= 3 && analysis.vague <= 3) {
            strengths.push(`Perfectly balanced tag ecosystem (${analysis.transactional}T/${analysis.thematic}M/${analysis.vague}V).`);
        } else {
            if (analysis.transactional < 5) weaknesses.push(`Low transactional tags (${analysis.transactional}/13). Need 5 minimum.`);
            if (analysis.thematic < 3) weaknesses.push(`Low thematic tags (${analysis.thematic}/13). Need 3 minimum.`);
            if (analysis.vague > 3) weaknesses.push(`Too many vague tags (${analysis.vague}/13). Maximum 3 allowed.`);
        }

        if (tags.length < 13) {
            weaknesses.push(`Only ${tags.length}/13 tags used.`);
        }
    }

    // DESCRIPTION EVALUATION
    let descriptionScore = 100;
    if (!description) {
        descriptionScore = 0;
        weaknesses.push("Missing description.");
    } else {
        if (description.length < 800) {
            descriptionScore -= 20;
            weaknesses.push("Description is too short (< 800 chars).");
        } else {
            strengths.push("Detailed, ample description length.");
        }

        const firstParagraph = description.split('\n\n')[0] || description.substring(0, 300);
        const sensoryWords = ["soft", "delicate", "moody", "dreamy", "aged", "textured", "faded", "hand-painted", "romantic", "whimsical", "vintage", "enchanted", "gothic", "aesthetic"];

        const hasEmotion = sensoryWords.some(word =>
            firstParagraph.toLowerCase().includes(word)
        );

        if (!hasEmotion) {
            descriptionScore -= 10;
            weaknesses.push("Missing sensory or emotional hook in the opening paragraph.");
        } else {
            strengths.push("Strong sensory phrasing and emotional mood detected in description.");
        }
    }
    descriptionScore = Math.max(descriptionScore, 0);

    // OVERALL
    const overallScore = Math.round(
        titleScore * 0.4 +
        tagsScore * 0.3 +
        descriptionScore * 0.3
    );

    return {
        overallScore,
        titleScore,
        tagsScore,
        descriptionScore,
        strengths,
        weaknesses
    };
}
