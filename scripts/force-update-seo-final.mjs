import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'components/EtsySEOOptimizer.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

const startStr = 'const handleOptimize = async () => {';
const startIdx = code.indexOf(startStr);

// The next function after handleOptimize is copyToClipboard
const nextFunctionStr = 'const copyToClipboard = (text: string, field: string) => {';
const endIdx = code.indexOf(nextFunctionStr, startIdx);

if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find bounds", startIdx, endIdx);
    process.exit(1);
}

const newHandleOptimizeStr = `const handleOptimize = async () => {
        if (!scrapedData) return;

        setError(null);
        setIsOptimizing(true);
        setOptimizedData(null);

        const prompt = \`You are an Etsy SEO expert executing the "Nick Method".

==== LISTING DATA ====
Title: \${scrapedData.title}
Tags: \${scrapedData.tags.join(', ')}
Description: \${scrapedData.description.substring(0, 1000)}

Analyze this listing and return a strictly formatted JSON object matching the NickMethodReport interface.

==== Output Requirement (JSON ONLY) ====  
{
    "brainstorm": {
        "descriptive": ["word1", "word2"],
        "anchors": ["word1", "word2"]
    },
    "titleScore": {
        "total": 20,
        "breakdown": ["Good point", "Bad point"]
    },
    "tagScore": {
        "total": 30,
        "breakdown": ["Good point", "Bad point"]
    },
    "totalScore": {
        "score": 50,
        "rating": "Needs Work"
    },
    "improvedTitle": "Your new optimized title here max 140 chars",
    "improvedTags": ["tag1", "tag2"],
    "badAdviceWarning": "Optional warning message if needed"
}
\`;

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are an Etsy SEO expert. Respond ONLY with valid JSON matching the exact schema requested.' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                }),
            });

            if (!response.ok) throw new Error('Failed to optimize with AI');
            const result = await response.json();
            let content = result.choices[0].message.content;

            if (content.includes('\`\`\`')) {
                content = content.replace(/\`\`\`json|\`\`\`/g, '').trim();
            }

            const aiResponse = JSON.parse(content) as NickMethodReport;
            setOptimizedData(aiResponse);

        } catch (err: any) {
            setError('AI Optimization failed: ' + err.message);
        } finally {
            setIsOptimizing(false);
        }
    };

    `;

code = code.substring(0, startIdx) + newHandleOptimizeStr + code.substring(endIdx);

fs.writeFileSync(filePath, code);
console.log('Final fix applied successfully.');
