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

// Find the last statement of the finally block
const endIdx = code.indexOf('setIsEvaluatingOptimized(false);', startIdx);
if (endIdx === -1) {
    console.error("COULD NOT FIND setIsEvaluatingOptimized(false);");
    process.exit(1);
}

// Find the very next }; which closes the function
const finalEnd = code.indexOf('};', endIdx) + 2;

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

code = code.substring(0, startIdx) + newHandleOptimizeStr + code.substring(finalEnd);

// Also we MUST remove the old UI block! The old UI had 100-Point Score Grid, Pillars, etc.
// Since my previous injection added the new UI after `{/* Optimized Metadata */}`, 
// let's just make sure ANY old sections are purged. Let's look for "overallScore", "CTR Risk", "Auto-Fix Weaknesses"
// A safe way to remove the old UI is to manually find where it starts and ends.
const oldUIStart1 = code.indexOf('{/* 100-Point Score Grid */}');
if (oldUIStart1 > -1) {
    const nextOldUIEnd = code.indexOf('</div>', code.indexOf('{/* --- END OF OLD RESULTS --- */}', oldUIStart1) || code.indexOf('Auto-Fix Weaknesses', oldUIStart1) + 200);
    // actually, let's just remove anything between {/* 100-Point Score Grid */} and {/* Optimized Metadata */}
    const optMeta = code.indexOf('{/* Optimized Metadata */}');
    if (optMeta > oldUIStart1) {
        code = code.substring(0, oldUIStart1) + code.substring(optMeta);
    }
}

// Since the old score object is gone, if `optimizedData.score` is referenced in the old UI, it will break TS compilation.
// Wait, my previous `inject-ui.mjs` injected the new UI AFTER the old UI. So the old UI is still there.
// Instead of gambling with substrings, let's just write a regex to completely strip out the "Auto-Fix" button and "100-Point Score Grid".

code = code.replace(/\{.*?100-Point Score Grid[\s\S]*?(?=\{.*?Optimized Metadata)/g, '');

code = code.replace(/<button[^>]*?onClick=\{.*?handleRefine\}[^>]*?>[\s\S]*?<\/button>/g, '');

fs.writeFileSync(filePath, code);
console.log('Force update script executed successfully.');
