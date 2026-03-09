import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../components/EtsySEOOptimizer.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

const optimizeStart = code.indexOf('const handleOptimize = async () => {');

// The end of the function
const optimizeEndStr = 'setIsEvaluatingOptimized(false);\n        }\n    };';
const optimizeEndIndex = code.indexOf(optimizeEndStr, optimizeStart);

if (optimizeStart === -1 || optimizeEndIndex === -1) {
    console.error("COULD NOT FIND handleOptimize bounds:", optimizeStart, optimizeEndIndex);
    process.exit(1);
}

const optimizeEnd = optimizeEndIndex + optimizeEndStr.length;

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
    "badAdviceWarning": "Warning message if needed"
}
\`;

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are an Etsy SEO expert. Respond ONLY with valid JSON.' },
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

code = code.substring(0, optimizeStart) + newHandleOptimizeStr + code.substring(optimizeEnd);

// Also we need to make sure we remove the legacy render block if it's there
const oldResultStart = code.indexOf('{/* 100-Point Score Grid */}');
if (oldResultStart > -1) {
    const oldResultEnd = code.indexOf('{/* --- END OF OLD RESULTS --- */}', oldResultStart);
    if (oldResultEnd > -1) {
        // remove that chunk entirely
        code = code.substring(0, oldResultStart) + code.substring(oldResultEnd + '{/* --- END OF OLD RESULTS --- */}'.length);
    }
}

// Ensure interface OptimizedDetails is gone
code = code.replace(/interface OptimizedDetails \{[\s\S]*?\}/g, '');

fs.writeFileSync(filePath, code);
console.log('Force update script executed successfully.');
