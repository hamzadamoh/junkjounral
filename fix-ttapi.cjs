const fs = require('fs');
let content = fs.readFileSync('services/ttapiService.ts', 'utf8');

// Fix 1: Comment out the comma-to-period replacement using regex
const commaRegex = /  \/\/ Replace commas with periods \(commas can be interpreted as parameter separators\)\s+\/\/ But only if they're not part of a URL or parameter\s+cleaned = cleaned\.replace\(\/,\(\\s\+\)\(\?!\[a-z\]\+:\)\/gi, '\.\$1'\);/;

if (commaRegex.test(content)) {
  content = content.replace(commaRegex, `  // REMOVED: Aggressive comma-to-period replacement breaks normal sentence structure
  // Commas are generally safe in Midjourney prompts
  // cleaned = cleaned.replace(/,(\\s+)(?![a-z]+:)/gi, '.$1');`);
  console.log('Fix 1 applied: comma replacement');
} else {
  console.log('Fix 1 NOT found');
}

// Fix 2: Change rate limit handling using regex
const rateRegex = /consecutiveRateLimitErrors\+\+;\s+console\.warn\(`\[Ttapi\] .* Rate limit detected \(consecutive: \$\{consecutiveRateLimitErrors\}\)\. Applying exponential backoff\.\.\.`\);\s+\/\/ Exponential backoff: 5s, 10s, 20s, 40s, max 60s\s+const backoffDelay = Math\.min\(5000 \* Math\.pow\(2, consecutiveRateLimitErrors - 1\), 60000\);\s+console\.log\(`\[Ttapi\] .* Waiting \$\{backoffDelay \/ 1000\}s before retrying\.\.\.`\);\s+await new Promise\(resolve => setTimeout\(resolve, backoffDelay\)\);\s+\/\/ Reset delay to initial after backoff\s+delay = initialDelay;\s+continue; \/\/ Retry polling/;

if (rateRegex.test(content)) {
  content = content.replace(rateRegex, `// Instead of retrying indefinitely, throw error to trigger resend as new task
          console.warn(\`[Ttapi] ⚠️ Rate limit detected during polling. Will resend as new task.\`);
          throw new Error(\`RATE_LIMIT_RESEND_TASK: \${errorMsg}\`);`);
  console.log('Fix 2 applied: rate limit');
} else {
  console.log('Fix 2 NOT found');
}

fs.writeFileSync('services/ttapiService.ts', content);
console.log('Done');
