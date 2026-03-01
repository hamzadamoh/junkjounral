import { calculateFillerDensity, checkTailEfficiency, LOW_EFFICIENCY_TITLE_WORDS } from './seoEfficiencyRules';
import { calculateTagIntentScore, classifyTag } from './tagIntentClassifier';

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
        const fillerDensity = calculateFillerDensity(title);
        if (title.length >= 110 && title.length <= 140) {
            strengths.push("Excellent title length (110-140 chars).");
        }

        if (fillerDensity > 0.4) {
            titleScore -= 25;
            weaknesses.push(`High filler density (${Math.round(fillerDensity * 100)}%). Remove broad terms.`);
        } else if (fillerDensity > 0.25) {
            titleScore -= 15;
            weaknesses.push(`Moderate filler density (${Math.round(fillerDensity * 100)}%). Make phrasing more specific.`);
        } else if (fillerDensity <= 0.1) {
            strengths.push("High title efficiency. Dense buyer-intent phrases detected.");
        }

        if (checkTailEfficiency(title)) {
            titleScore -= 10;
            weaknesses.push("Weak tail detected. Remove trailing category phrases.");
        }

        if (title.length < 110) {
            titleScore -= 10;
            weaknesses.push("Title is too short. Use more secondary modifiers.");
        }
        if (title.length > 145) {
            titleScore -= 10;
            weaknesses.push("Title exceeds padding limits.");
        }
    }
    titleScore = Math.max(titleScore, 0);

    // TAGS EVALUATION
    let tagsScore = 0;
    if (!tags || tags.length === 0) {
        weaknesses.push("Missing tags.");
    } else {
        tagsScore = calculateTagIntentScore(tags);
        if (tagsScore < 70) {
            weaknesses.push("High ratio of vague tags. Use stricter product+aesthetic terms.");
        } else if (tagsScore === 90) {
            strengths.push("Strong transactional tag structure.");
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

        const emotionalWords = ["romantic", "moody", "whimsical", "dreamy", "vintage", "enchanted", "cottagecore", "gothic", "aesthetic", "delicate", "dark academia"];
        const hasEmotion = emotionalWords.some(word =>
            description.toLowerCase().includes(word)
        );

        if (!hasEmotion) {
            descriptionScore -= 15;
            weaknesses.push("Missing emotional hook or subculture keywords in description.");
        } else {
            strengths.push("Aesthetic terminology and emotional mood detected.");
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
