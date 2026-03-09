import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'components/EtsySEOOptimizer.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

const startStr = 'const handleOptimize = async () => {';
const startIdx = code.indexOf(startStr);

if (startIdx === -1) {
    console.error("COULD NOT FIND handleOptimize start");
    process.exit(1);
}

// Search for the end of handleOptimize
const endRegex = /setIsEvaluatingOptimized\(false\);\n\s*\}\n\s*\};/;
const endMatch = code.substring(startIdx).match(endRegex);

if (!endMatch) {
    console.error("COULD NOT FIND handleOptimize end");
    process.exit(1);
}

const optimizeEnd = startIdx + endMatch.index + endMatch[0].length;

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
    };`;

code = code.substring(0, startIdx) + newHandleOptimizeStr + code.substring(optimizeEnd);

// Find the old Results section from earlier versions to make absolutely sure it's gone
// (We look for the old 100-Point Score Grid or similar tags)
const replaceBlocks = [
    { start: '{/* --- OLD RESULTS BLOCK --- */}', end: '{/* --- END OLD RESULTS --- */}' },
    { start: '{/* 100-Point Score Grid */}', end: '{/* --- END RESULTS --- */}' }
];

replaceBlocks.forEach(b => {
    const s = code.indexOf(b.start);
    if (s > -1) {
        const e = code.indexOf(b.end, s);
        if (e > -1) {
            code = code.substring(0, s) + code.substring(e + b.end.length);
        }
    }
});

fs.writeFileSync(filePath, code);
console.log('Force update script executed successfully using regex target.');
