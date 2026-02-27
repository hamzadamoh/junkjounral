import React, { useState } from 'react';
import { Search, Loader2, Sparkles, Copy, Check, ExternalLink, Wand2, Tag, FileText, Type, ChevronLeft } from 'lucide-react';

interface SEOScore {
    overallScore: number;
    titleScore: number;
    tagsScore: number;
    descriptionScore: number;
    strengths: string[];
    weaknesses: string[];
}

interface ScrapedDetails {
    title: string;
    description: string;
    tags: string[];
    imageUrl?: string;
    listingId?: string;
    score?: SEOScore;
}

interface OptimizedDetails {
    title: string;
    description: string;
    tags: string[];
    score?: SEOScore;
}

interface EtsySEOOptimizerProps {
    onClose?: () => void;
}

const EtsySEOOptimizer: React.FC<EtsySEOOptimizerProps> = ({ onClose }) => {
    const [url, setUrl] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [isEvaluatingOriginal, setIsEvaluatingOriginal] = useState(false);
    const [isEvaluatingOptimized, setIsEvaluatingOptimized] = useState(false);
    const [scrapedData, setScrapedData] = useState<ScrapedDetails | null>(null);
    const [optimizedData, setOptimizedData] = useState<OptimizedDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const evaluateListing = async (listing: { title: string, description: string, tags: string[] }): Promise<SEOScore> => {
        const promptLines = [
            'As an elite Etsy SEO Evaluator, grade this listing based on these strict 2026 search model constraints.',
            '',
            '=== EVALUATION CRITERIA ===',
            'TITLE:',
            '- Sharpness over Length: A 100-120 character highly-targeted title is BETTER than a 140 character title stuffed with words. DO NOT penalize for being under 125 chars if it is highly relevant.',
            '- Truncation: Heavily penalize if the title ends in a cut-off or partial word.',
            '- Focus: MUST have ONE dominant buyer-intent phrase. Secondary phrases must support this identity, not dilute it.',
            '- Readability: Penalize generic trailing filler (e.g. "DIY Craft Supplies").',
            '',
            'TAGS:',
            '- Length: No tag can exceed 20 characters.',
            '- Quantity: Should have exactly 13 tags.',
            '- Specificity: Tags must be hyper-specific to the product/theme (e.g., "sakura journal kit").',
            '- Penalize severely for broad, low-converting tags like "digital download", "instant download", "printable art", or "digital paper pack".',
            '- Aesthetics: Must firmly establish the niche aesthetic (e.g., cottagecore, romantic spring).',
            '',
            'DESCRIPTION:',
            '- Length: Must be 800+ characters.',
            '- Hook: Opening paragraph must be emotionally positioned and sensory.',
            '- Differentiator: Must clearly state what makes the product unique.',
            '- Formatting: Must use proper line breaks and sections.',
            '',
            '=== INPUT ===',
            'Title: ' + listing.title,
            'Tags: ' + (listing.tags?.join(', ') || 'None'),
            'Description:',
            listing.description.substring(0, 2000),
            '',
            '=== INSTRUCTIONS ===',
            '1. Analyze the input against the criteria above.',
            '2. Calculate objective scores from 0 to 100 for Title, Tags, and Description.',
            '3. Calculate an Overall Score (average of the three).',
            '4. Identify 2-3 specific Strengths.',
            '5. Identify 2-3 specific Weaknesses.',
            '6. Output ONLY a valid JSON object matching the schema below.',
        ].join('\n');

        const systemPrompt = `You are an expert SEO grader. You must respond ONLY with a valid JSON object representing the score. Do not provide any conversational text.

{
  "overallScore": number (0-100),
  "titleScore": number (0-100),
  "tagsScore": number (0-100),
  "descriptionScore": number (0-100),
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"]
}`;

        const response = await fetch('/api/openai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptLines }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1 // Make it highly deterministic
            }),
        });

        if (!response.ok) throw new Error('Evaluation failed');
        const result = await response.json();
        let content = result.choices[0].message.content;
        if (content.includes('```')) {
            content = content.replace(/```json|```/g, '').trim();
        }
        return JSON.parse(content) as SEOScore;
    };

    const handleScrape = async () => {
        if (!url.trim()) return;

        setIsScraping(true);
        setError(null);
        setScrapedData(null);
        setOptimizedData(null);

        try {
            const response = await fetch('/api/etsy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'scrape-details', url: url.trim() }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to scrape listing');
            }

            const data = await response.json();
            setScrapedData(data);

            // Kick off original listing evaluation
            setIsEvaluatingOriginal(true);
            try {
                const score = await evaluateListing({
                    title: data.title,
                    description: data.description,
                    tags: data.tags
                });
                setScrapedData(prev => prev ? { ...prev, score } : null);
            } catch (evalErr) {
                console.error("Failed to evaluate original listing:", evalErr);
            } finally {
                setIsEvaluatingOriginal(false);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleOptimize = async () => {
        if (!scrapedData) return;

        setIsOptimizing(true);
        setError(null);

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            'Your goal is to optimize for:',
            '- Search match relevance',
            '- Click-through rate (CTR)',
            '- Conversion rate (CVR)',
            '- Listing quality score',
            '- Long-term shop authority',
            '',
            'Priority formula: Relevance x Click Appeal x Buyer Intent x Conversion Clarity',
            'NOT keyword stuffing.',
            '',
            '=== 1. TITLE OPTIMIZATION (STRATEGIC STRUCTURE) ===',
            '',
            'A. Length Target:',
            '- Ideal range: 125-140 characters',
            '- Never force padding to hit max',
            '- Clarity > character count',
            '',
            'B. First 60 Characters Rule (Mobile Priority Zone):',
            'The first 50-70 characters MUST contain the strongest buyer-intent phrase, clearly define what the product is, and be readable like a product name.',
            'GOOD: "Rustic Greenhouse Junk Journal Kit Printable"',
            'BAD: "Vintage Garden Digital Papers Rustic Greenhouse Junk Journal"',
            '',
            'C. Title Structure Formula (Pro Seller Model):',
            '[Primary Buyer Phrase], [Secondary Niche Angle] [Supporting Descriptor] [Format Clarifier]',
            'Example: "Rustic Greenhouse Junk Journal Kit Printable, Vintage Garden Ephemera Pages, Romantic Spring Digital Download"',
            'Rules:',
            '- 1 dominant phrase + 2-3 supporting angles max',
            '- NO generic padding phrases like "DIY Craft Pages" or "Aesthetic Scrapbooking Supplies"',
            '- Every phrase MUST strengthen buyer intent (e.g. use "Printable", "Ephemera Pages", "Digital Download")',
            '- Avoid stacking 5-8 equal keywords',
            '- Natural language flow',
            '- 1-3 commas maximum (if needed)',
            '- No keyword dumping',
            '',
            'D. CTR Psychology Layer:',
            'The title must sound like a product someone WANTS. Be specific, not vague. Include aesthetic triggers when relevant (cottagecore, dark academia, fairycore, botanical, gothic, shabby chic, etc.). Etsy now rewards clicks and saves heavily.',
            '',
            'E. Dominance Enforcement Rule (CRITICAL):',
            'Before generating the title:',
            '1. Identify ONE dominant buyer-intent phrase (the phrase most likely searched).',
            '2. Ensure it appears fully intact within the first 60 characters.',
            '3. Do NOT introduce another competing primary phrase.',
            '4. Supporting angles must MODIFY the dominant phrase — not compete with it.',
            '5. If two phrases could be primary, choose ONE and demote the other.',
            '',
            'F. Title Length & Padding Rule (SHARPNESS OVER COVERAGE):',
            '- NEVER add generic trailing filler (e.g., "DIY Scrapbook Ephemera", "Printable Stationery", "Craft Supplies") just to reach 140 characters.',
            '- STRICTLY BAN ChatGPT-isms: "Creative Souls", "Crafting Delight", "Elevate", "Whimsical Journey", "Unleash your creativity". Titles are product names, not poetry.',
            '- It is perfectly acceptable and PREFERRED to stop at 100-120 characters if the niche identity is fully established.',
            '- If the choice is between a concise 115 character sharp title and a 140 character diluted title, choose 115.',
            '- Your hard cap is 140 characters. DO NOT cut off mid-word.',
            '',
            '=== H. EMOTIONAL DISTINCTION LAYER (HIGH-COMPETITION MODE) ===',
            'If the theme belongs to a competitive aesthetic (floral, gothic, cottagecore, vintage, botanical, fantasy):',
            '- Include ONE emotionally charged descriptor that enhances click appeal.',
            '- This descriptor must support the dominant phrase, not compete with it.',
            '- Avoid over-dramatic language or hype words.',
            '- The title must still read like a product name — not a poem.',
            '',
            'Examples of controlled emotional descriptors:',
            '- Romantic Spring',
            '- Moody Victorian',
            '- Enchanted Forest',
            '- Delicate Sakura',
            '- Antique Library',
            '- Dreamy Pastel',
            '',
            '=== 2. TAG STRATEGY (EXPANSION MODEL) ===',
            '',
            'Output exactly 13 tags.',
            '',
            'A. Character Rule: Max 20 characters each. 2-3 words per tag. No single-word tags.',
            '',
            'B. Tag Strategy Framework - do NOT repeat the full title phrase. Expand horizontally into different buyer angles:',
            '1. Alternate product phrasing',
            '2. Aesthetic niche',
            '3. Use-case intent',
            '4. Style variation',
            '5. Broader entry keywords',
            '6. Adjacent audience types',
            '',
            'Example good angles: "botanical journal kit", "garden scrapbook", "cottagecore ephemera", "floral printable pages", "digital paper pack", "shabby chic art", "vintage craft kit"',
            'Example BAD (too repetitive): "junk journal kit", "junk journal printable", "junk journal pages"',
            '',
            'C. Reinforcement Rule (Advanced):',
            'You MAY lightly reinforce part of the main title phrase using a variation in ONE tag.',
            'Example - Title: "Rustic Greenhouse Junk Journal Kit Printable" then Tag allowed: "greenhouse journal kit"',
            'But NOT exact full duplication.',
            '',
            'D. Buyer Intent Filter (MANDATORY):',
            'Tags are entry doors. They must be hyper-specific things buyers type to purchase.',
            'MANDATORY FORMULA: Product + Theme + Format/Use Case (e.g., "sakura journal kit", "romantic spring junk", "pink floral ephemera").',
            'BANNED TAGS: "digital download", "instant download", "printable art", "digital paper pack", "botanical crafting", "shabby chic art".',
            'Do NOT use vague aesthetic labels alone or broad category terms.',
            '',
            'E. Strict Character Enforcement:',
            'Before finalizing output:',
            '- Count characters of each tag including spaces.',
            '- If any tag exceeds 20 characters, shorten or replace it.',
            '- Do NOT approximate. Hard limit: 20 characters.',
            '- If constraint cannot be met, regenerate tag list.',
            '',
            '=== F. AESTHETIC SIGNAL TAG RULE ===',
            'At least 2 tags must clearly signal the aesthetic mood or subculture identity (e.g., cottagecore paper, dark academia art, romantic floral kit).',
            'These must still pass the Buyer Intent Filter.',
            'Do NOT use vague aesthetic-only tags without product context.',
            '',
            '=== 3. DESCRIPTION OPTIMIZATION (AI + CONVERSION MODEL) ===',
            '',
            'Descriptions influence: Google ranking, buyer confidence, AI product understanding, conversion rate, time on listing (engagement signal).',
            '',
            'A. First 2 Sentences = Google Snippet Zone. Must clearly state what it is, include primary buyer phrase naturally, be readable and persuasive, avoid keyword stacking.',
            'GOOD: "Create a charming botanical journal with this Rustic Greenhouse Junk Journal Kit Printable, featuring vintage garden ephemera and cottagecore-inspired digital papers."',
            'BAD: "Rustic Greenhouse Junk Journal Kit Vintage Garden Digital Papers Scrapbook Papers Printable Ephemera"',
            '',
            'B. Required Content Elements - the description MUST clearly communicate:',
            '- What it is',
            '- Who it is for',
            '- What aesthetic/style it fits',
            '- How it is used',
            '- Format clarity (digital, instant download)',
            '- Commercial/personal use info',
            '',
            'C. Structure Preservation Rule - when optimizing:',
            '- Keep existing sections, formatting, emojis, and bullet lists',
            '- Expand and improve, do NOT delete structure',
            '- Minimum length: 800+ characters',
            '- CRITICAL: Use \\n (newline characters) in the JSON description value to preserve line breaks, section headers, spacing, and paragraph structure',
            '- Each section header (like ### or emoji headers) MUST be on its own line',
            '- Bullet points and numbered lists MUST each be on their own line',
            '- Add blank lines (\\n\\n) between sections for readability',
            '',
            'D. Conversion Layer - add where appropriate:',
            '- Use-case scenarios',
            '- Gift positioning',
            '- Emotional triggers',
            '- Clear digital explanation',
            '- Reassurance statements',
            '',
            'E. Differentiation Requirement:',
            'The description must include at least ONE specific differentiating element unique to this listing, such as: unique motif, unique mood, unique color palette, unique cultural inspiration, or unique seasonal positioning.',
            'Do NOT write a generic description that could apply to any junk journal kit. Each listing must feel distinct.',
            '',
            'F. Input Boundaries Rule:',
            'Do NOT introduce themes, motifs, aesthetics, or use cases that are not supported by the original title or description.',
            'Enhance — do not fabricate.',
            '',
            '=== G. MARKET CLUSTER POSITIONING & EMOTIONAL ENGINE (MANDATORY) ===',
            'The first paragraph MUST:',
            '1. Pick ONE dominant market cluster and lean perfectly into it (e.g. if Floral + Sakura + Cottagecore, pick strictly Sakura Inspired or strictly Romantic Spring Floral). Do NOT dilute the focus.',
            '2. Establish a clear mood or atmosphere (romantic, moody, whimsical, nostalgic, enchanted, serene, etc.).',
            '3. Identify the ideal buyer type (junk journal creators, scrapbook artists, cottagecore lovers, fantasy journal fans, etc.).',
            '4. Include at least one SPECIFIC differentiating element (e.g., "Inspired by Japanese sakura gardens" or "Hand-painted watercolor texture").',
            '5. Include at least one sensory or visual detail (soft watercolor blooms, aged parchment textures, moody cathedral shadows, delicate lace overlays, etc.).',
            '',
            'Do NOT write a neutral, safely beautiful, or informational opening.',
            'The opening must establish distinct competitive edge.',
            '',
            '=== 4. WHAT TO AVOID (2026 PENALTY ZONE) ===',
            '- Keyword stuffing',
            '- Robotic phrasing',
            '- Repeating exact title in description',
            '- Extremely broad tags (printable, art, paper)',
            '- Ranking for too many unrelated themes',
            '- Title reading like a keyword list',
            'Etsy AI now detects manipulation patterns.',
            '',
            '=== 5. FINAL INTERNAL CHECK (CRITICAL) ===',
            'Before returning JSON:',
            '1. Re-evaluate title for stacking.',
            '2. Re-count tag characters.',
            '3. Confirm exactly 13 tags.',
            '4. Confirm no tag exceeds 20 characters.',
            '5. Confirm description > 800 characters.',
            '6. Confirm no hallucinated themes added.',
            'If any fail -> silently iterate and fix before responding.',
            '',
            '=== INPUT DATA ===',
            'Title: ' + scrapedData.title,
            'Description (PRESERVE AND MODIFY - keep structure, sections, emojis):',
            scrapedData.description.substring(0, 2500),
            'Current Tags: ' + scrapedData.tags.join(', '),
            '',
            '=== OUTPUT (JSON ONLY) ===',
            'IMPORTANT: In the description field, use \\n for line breaks to preserve formatting.',
            'Do NOT return the description as one flat paragraph.',
            'Keep sections, headers, bullet points, and emojis each on their own line using \\n.',
            '{',
            '  "title": "optimized title 125-140 chars",',
            '  "description": "first line\\n\\nsecond section\\n- bullet 1\\n- bullet 2",',
            '  "tags": ["13 tags each MUST be 1-20 characters, no exceptions"]',
            '}',
        ].join('\n');

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are a Pro Seller Level Etsy SEO expert optimizing for the 2026 Etsy AI Search Model. Respond only with valid JSON. Use the keys: "title", "description", and "tags". Optimize for Relevance x Click Appeal x Buyer Intent x Conversion Clarity. CRITICAL: In the description field, use \n (actual newline characters) to preserve line breaks, section headers, spacing, bullets, and paragraph structure. Do NOT return the description as one flat paragraph.' },
                        { role: 'user', content: promptLines }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                }),
            });

            if (!response.ok) throw new Error('Failed to optimize with AI');
            const result = await response.json();
            let content = result.choices[0].message.content;

            // Clean markdown code blocks if present
            if (content.includes('```')) {
                content = content.replace(/```json|```/g, '').trim();
            }

            let aiResponse = JSON.parse(content);

            // Safety net: if title is very short (<90), retry with context
            if (aiResponse.title && aiResponse.title.length < 90) {
                const retryLines = [
                    'Your title is only ' + aiResponse.title.length + ' characters: "' + aiResponse.title + '"',
                    '',
                    'Extend this title naturally to around 110-130 characters. Add ONE highly relevant aesthetic or format modifier.',
                    'Follow the Pro Seller structure: [Primary Buyer Phrase], [Secondary Niche Angle] [Supporting Descriptor] [Format Clarifier].',
                    'CRITICAL: Do NOT add generic filler like "DIY Craft Supplies". Maintain sharp niche focus.',
                    '',
                    'Return JSON only: { "title": "extended title here" }',
                ].join('\n');

                const retryResponse = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are an Etsy SEO expert. Respond only with valid JSON.' },
                            { role: 'user', content: retryLines }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.7
                    }),
                });

                if (retryResponse.ok) {
                    const retryResult = await retryResponse.json();
                    let retryContent = retryResult.choices[0].message.content;
                    if (retryContent.includes('```')) {
                        retryContent = retryContent.replace(/```json|```/g, '').trim();
                    }
                    const retryData = JSON.parse(retryContent);
                    if (retryData.title && retryData.title.length > aiResponse.title.length) {
                        aiResponse.title = retryData.title.substring(0, 140);
                    }
                }
            }

            // Enforce clean 140 char hard cap — strictly cut at the last complete word boundary
            if (aiResponse.title && aiResponse.title.length > 140) {
                let text = aiResponse.title.substring(0, 140);

                // If the 141st character is not a space, we sliced a word.
                // We must backtrack to the last space to avoid cut-off words like "Statio"
                if (aiResponse.title[140] && aiResponse.title[140] !== ' ') {
                    const lastSpaceIndex = text.lastIndexOf(' ');
                    if (lastSpaceIndex > 0) {
                        text = text.substring(0, lastSpaceIndex);
                    }
                }

                // Clean up trailing commas or punctuation
                aiResponse.title = text.replace(/[,-\s]+$/, '').trim();
            }

            // Enforce 20 char tag limit — truncate at last complete word
            if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                aiResponse.tags = aiResponse.tags.map((tag: string) => {
                    if (tag.length <= 20) return tag;
                    let truncated = tag.substring(0, 20);
                    const lastSpace = truncated.lastIndexOf(' ');
                    if (lastSpace > 5) truncated = truncated.substring(0, lastSpace);
                    return truncated.trim();
                });
            }

            setOptimizedData(aiResponse);

            // Kick off optimized listing evaluation
            setIsEvaluatingOptimized(true);
            try {
                const score = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                });
                setOptimizedData(prev => prev ? { ...prev, score } : null);
            } catch (evalErr) {
                console.error("Failed to evaluate optimized listing:", evalErr);
            } finally {
                setIsEvaluatingOptimized(false);
            }

        } catch (err: any) {
            setError('AI Optimization failed: ' + err.message);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleRefine = async () => {
        if (!scrapedData || !optimizedData || !optimizedData.score) return;

        setIsRefining(true);
        setError(null);

        const promptLines = [
            'You are an Etsy SEO Expert operating under the 2026 Etsy AI Search Model.',
            '',
            'You previously optimized this listing, but our internal grader found the following weaknesses:',
            ...optimizedData.score.weaknesses.map((w: string) => `- ${w}`),
            '',
            'Your task is to REWRITE the title, tags, and description to EXPLICITLY fix these weaknesses while maintaining all previous structural rules.',
            '',
            '=== PREVIOUS OUTPUT ===',
            'Title: ' + optimizedData.title,
            'Tags: ' + optimizedData.tags.join(', '),
            'Description:',
            optimizedData.description.substring(0, 2000),
            '',
            '=== STRICT CONSTRAINTS ===',
            '- Title: Target 110-130 chars. Max 140. Structure: [Primary Buyer Phrase], [Secondary Angle] [Descriptor] [Format]. Sharpness over length. BAN poetic filler ("Creative Souls", "Delight", "Elevate").',
            '- Tags: EXACTLY 13 tags. MAX 20 chars per tag. Formula: Product + Theme + Use Case. BANNED: "digital download", "instant download", "printable art", "digital paper pack", "botanical crafting".',
            '- Description: OVER 800 chars. Pick ONE dominant market cluster. MUST USE \\n for line breaks to preserve formatting.',
            '',
            '=== OUTPUT (JSON ONLY) ===',
            'Respond ONLY with a valid JSON object matching the exact structure previously requested: {"title": "", "description": "", "tags": []}.',
        ].join('\n');

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are a Pro Seller Level Etsy SEO expert optimizing for the 2026 Etsy AI Search Model. Respond only with valid JSON. Use the keys: "title", "description", and "tags". CRITICAL: In the description field, use \\n (actual newline characters) to preserve formatting.' },
                        { role: 'user', content: promptLines }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                }),
            });

            if (!response.ok) throw new Error('Failed to refine with AI');
            const result = await response.json();
            let content = result.choices[0].message.content;

            if (content.includes('```')) {
                content = content.replace(/```json|```/g, '').trim();
            }

            let aiResponse = JSON.parse(content);

            // Safety net: if title is very short (<90), retry with context
            if (aiResponse.title && aiResponse.title.length < 90) {
                const retryLines = [
                    'Your title is only ' + aiResponse.title.length + ' characters: "' + aiResponse.title + '"',
                    '',
                    'Extend this title naturally to around 110-130 characters. Add ONE highly relevant aesthetic or format modifier.',
                    'Follow the Pro Seller structure: [Primary Buyer Phrase], [Secondary Niche Angle] [Supporting Descriptor] [Format Clarifier].',
                    'CRITICAL: Do NOT add generic filler like "DIY Craft Supplies". Maintain sharp niche focus.',
                    '',
                    'Return JSON only: { "title": "extended title here" }',
                ].join('\n');

                const retryResponse = await fetch('/api/openai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: 'You are an Etsy SEO expert. Respond only with valid JSON.' },
                            { role: 'user', content: retryLines }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.7
                    }),
                });

                if (retryResponse.ok) {
                    const retryResult = await retryResponse.json();
                    let retryContent = retryResult.choices[0].message.content;
                    if (retryContent.includes('```')) {
                        retryContent = retryContent.replace(/```json|```/g, '').trim();
                    }
                    const retryData = JSON.parse(retryContent);
                    if (retryData.title && retryData.title.length > aiResponse.title.length) {
                        aiResponse.title = retryData.title.substring(0, 140);
                    }
                }
            }

            // Enforce character caps defensively
            if (aiResponse.title && aiResponse.title.length > 140) {
                let text = aiResponse.title.substring(0, 140);
                if (aiResponse.title[140] && aiResponse.title[140] !== ' ') {
                    const lastSpaceIndex = text.lastIndexOf(' ');
                    if (lastSpaceIndex > 0) text = text.substring(0, lastSpaceIndex);
                }
                aiResponse.title = text.replace(/[,-\s]+$/, '').trim();
            }

            if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
                aiResponse.tags = aiResponse.tags.map((tag: string) => {
                    if (tag.length <= 20) return tag;
                    let truncated = tag.substring(0, 20);
                    const lastSpace = truncated.lastIndexOf(' ');
                    if (lastSpace > 5) truncated = truncated.substring(0, lastSpace);
                    return truncated.trim();
                });
            }

            setOptimizedData(aiResponse as OptimizedDetails);

            // Re-evaluate the new refinement
            setIsEvaluatingOptimized(true);
            try {
                const score = await evaluateListing({
                    title: aiResponse.title,
                    description: aiResponse.description,
                    tags: aiResponse.tags
                });
                setOptimizedData(prev => prev ? { ...prev, score } : null);
            } catch (err) {
                console.error("Evaluation failed on refinement:", err);
            } finally {
                setIsEvaluatingOptimized(false);
            }

        } catch (err: any) {
            setError('AI Refinement failed: ' + err.message);
        } finally {
            setIsRefining(false);
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 bg-slate-900 text-slate-100 min-h-screen">
            <header className="relative text-center space-y-2">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="absolute left-0 top-0 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Close"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent flex items-center justify-center gap-3">
                    <Sparkles className="text-purple-400" />
                    Etsy SEO Optimizer 2026
                </h1>
                <p className="text-slate-400">Optimize your listings using 2026 SEO guidelines and AI</p>
            </header>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Paste Etsy Listing URL (e.g., https://www.etsy.com/listing/123456...)"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        />
                    </div>
                    <button
                        onClick={handleScrape}
                        disabled={isScraping || !url}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg font-semibold flex items-center gap-2 transition-colors"
                    >
                        {isScraping ? <Loader2 className="animate-spin w-5 h-5" /> : 'Load Listing'}
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {scrapedData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Current Metadata */}
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-6">
                        <div className="flex justify-between items-start">
                            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-300">
                                <ExternalLink className="w-5 h-5" />
                                Current Listing
                            </h2>
                            {scrapedData.score ? (
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${scrapedData.score.overallScore >= 80 ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400' : scrapedData.score.overallScore >= 60 ? 'bg-amber-900/30 border-amber-500/50 text-amber-400' : 'bg-red-900/30 border-red-500/50 text-red-400'}`}>
                                    <span className="text-sm font-bold">Score: {scrapedData.score.overallScore}/100</span>
                                </div>
                            ) : isEvaluatingOriginal ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-600 bg-slate-700/50 text-slate-400">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-xs">Grading...</span>
                                </div>
                            ) : null}
                        </div>

                        {scrapedData.score && (
                            <div className="space-y-2 mb-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                        <div className="text-xs text-slate-500 font-bold uppercase mb-2">Strengths</div>
                                        <ul className="space-y-1 text-xs text-emerald-400">
                                            {scrapedData.score.strengths.slice(0, 2).map((s, i) => (
                                                <li key={i} className="flex items-start gap-1"><Check className="w-3 h-3 mt-0.5 shrink-0" /> {s}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                        <div className="text-xs text-slate-500 font-bold uppercase mb-2">Weaknesses</div>
                                        <ul className="space-y-1 text-xs text-red-400">
                                            {scrapedData.score.weaknesses.slice(0, 2).map((w, i) => (
                                                <li key={i} className="flex items-start gap-1"><span className="text-[10px] mt-0.5 shrink-0">⚠️</span> {w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 flex justify-between text-xs text-slate-400">
                                    <span><strong className="text-slate-500">TITLE </strong> <span className={scrapedData.score.titleScore < 60 ? 'text-red-400' : scrapedData.score.titleScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{scrapedData.score.titleScore}/100</span></span>
                                    <span><strong className="text-slate-500">TAGS </strong> <span className={scrapedData.score.tagsScore < 60 ? 'text-red-400' : scrapedData.score.tagsScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{scrapedData.score.tagsScore}/100</span></span>
                                    <span><strong className="text-slate-500">DESC </strong> <span className={scrapedData.score.descriptionScore < 60 ? 'text-red-400' : scrapedData.score.descriptionScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{scrapedData.score.descriptionScore}/100</span></span>
                                </div>
                            </div>
                        )}

                        {scrapedData.imageUrl && (
                            <img src={scrapedData.imageUrl} alt="Listing" className="w-full h-48 object-cover rounded-lg border border-slate-700" />
                        )}

                        <div className="space-y-4">
                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Title</label>
                                <p className="text-sm p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">{scrapedData.title}</p>
                            </section>

                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Tags ({scrapedData.tags.length})</label>
                                <div className="flex flex-wrap gap-2">
                                    {scrapedData.tags.map((tag, i) => (
                                        <span key={i} className="text-xs px-2 py-1 bg-slate-700/50 rounded border border-slate-600/50">{tag}</span>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Description Snippet</label>
                                <p className="text-xs p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 line-clamp-4">{scrapedData.description}</p>
                            </section>
                        </div>

                        <button
                            onClick={handleOptimize}
                            disabled={isOptimizing}
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all active:scale-95"
                        >
                            {isOptimizing ? <Loader2 className="animate-spin w-5 h-5" /> : <><Wand2 className="w-5 h-5" /> Optimize for 2026 Model</>}
                        </button>
                    </div>

                    {/* Optimized Metadata */}
                    <div className={`bg-slate-800 p-6 rounded-xl border-2 ${optimizedData ? 'border-amber-500/50 shadow-amber-900/10' : 'border-dashed border-slate-700'} flex flex-col justify-center`}>
                        {!optimizedData && !isOptimizing ? (
                            <div className="text-center space-y-3 opacity-50">
                                <Sparkles className="w-12 h-12 mx-auto text-slate-600" />
                                <p>Click optimize to see AI recommendations</p>
                            </div>
                        ) : optimizedData ? (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-start">
                                    <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-400">
                                        <Sparkles className="w-5 h-5" />
                                        Optimized Result
                                    </h2>
                                    {optimizedData.score ? (
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${optimizedData.score.overallScore >= 80 ? 'bg-emerald-900/40 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.2)] text-emerald-400' : optimizedData.score.overallScore >= 60 ? 'bg-amber-900/30 border-amber-500/50 text-amber-400' : 'bg-red-900/30 border-red-500/50 text-red-400'}`}>
                                            <span className="text-sm font-bold">New Score: {optimizedData.score.overallScore}/100</span>
                                        </div>
                                    ) : isEvaluatingOptimized ? (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-900/20 text-amber-400/70">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="text-xs">Verifying Quality...</span>
                                        </div>
                                    ) : null}
                                </div>

                                {optimizedData.score && (
                                    <div className="space-y-2 mb-4">
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-emerald-900/50">
                                            <div className="text-xs text-slate-500 font-bold uppercase mb-2">Resolved</div>
                                            <ul className="space-y-1 text-xs text-emerald-400">
                                                {optimizedData.score.strengths.slice(0, 3).map((s, i) => (
                                                    <li key={i} className="flex items-start gap-1"><Check className="w-3 h-3 mt-0.5 shrink-0" /> {s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/50 flex justify-between text-xs text-slate-400">
                                            <span><strong className="text-slate-500">TITLE </strong> <span className={optimizedData.score.titleScore >= 90 ? 'text-emerald-400' : ''}>{optimizedData.score.titleScore}/100</span></span>
                                            <span><strong className="text-slate-500">TAGS </strong> <span className={optimizedData.score.tagsScore >= 90 ? 'text-emerald-400' : ''}>{optimizedData.score.tagsScore}/100</span></span>
                                            <span><strong className="text-slate-500">DESC </strong> <span className={optimizedData.score.descriptionScore >= 90 ? 'text-emerald-400' : ''}>{optimizedData.score.descriptionScore}/100</span></span>
                                        </div>
                                    </div>
                                )}

                                {optimizedData.score && optimizedData.score.weaknesses && optimizedData.score.weaknesses.length > 0 && (
                                    <button
                                        onClick={handleRefine}
                                        disabled={isRefining}
                                        className="w-full py-2.5 bg-gradient-to-r from-amber-600/80 to-orange-600/80 hover:from-amber-500 hover:to-orange-500 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 text-amber-50 border border-amber-500/50"
                                    >
                                        {isRefining ? <Loader2 className="animate-spin w-5 h-5" /> : <><Sparkles className="w-5 h-5 text-amber-300" /> Auto-Fix Weaknesses to Improve Score</>}
                                    </button>
                                )}

                                <div className="space-y-4">
                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Type className="w-3 h-3" /> Optimized Title
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.title, 'title')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'title' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <p className="text-sm p-3 bg-slate-900 border border-amber-500/20 rounded-lg text-amber-50 shadow-inner">{optimizedData.title}</p>
                                        <span className={`text-xs mt-1 inline-block ${(optimizedData.title?.length || 0) > 140 ? 'text-red-400' : (optimizedData.title?.length || 0) >= 125 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                            {optimizedData.title?.length || 0}/140 characters
                                        </span>
                                    </section>

                                    <section>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <Tag className="w-3 h-3" /> Optimized Tags ({optimizedData.tags?.length || 0}/13)
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500">Click a tag to copy it</span>
                                                <button onClick={() => copyToClipboard(optimizedData.tags.join(', '), 'all-tags')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                    {copiedField === 'all-tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                    {copiedField === 'all-tags' ? 'Copied' : 'Copy All'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                                            {optimizedData.tags.map((tag, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => copyToClipboard(tag, `tag-${i}`)}
                                                    className="text-xs px-2 py-1 bg-amber-500/10 text-amber-200 rounded border border-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/40 transition-all cursor-pointer flex items-center gap-1"
                                                    title={`Copy: ${tag}`}
                                                >
                                                    {copiedField === `tag-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : null}
                                                    {tag}
                                                    {tag.length > 20 && <span className="text-red-400 ml-1">({tag.length})</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> Optimized Description
                                            </label>
                                            <button onClick={() => copyToClipboard(optimizedData.description, 'description')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                                {copiedField === 'description' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedField === 'description' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="text-xs p-3 bg-slate-900 border border-amber-500/20 rounded-lg text-slate-300 h-64 overflow-y-auto whitespace-pre-wrap shadow-inner leading-relaxed">
                                            {optimizedData.description}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <Loader2 className="w-12 h-12 mx-auto animate-spin text-purple-500" />
                                <p className="text-slate-400 animate-pulse">Consulting 2026 SEO Guidelines...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EtsySEOOptimizer;
