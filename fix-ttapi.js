const fs = require('fs');
let content = fs.readFileSync('services/ttapiService.ts', 'utf8');

// Fix 1: Comment out the comma-to-period replacement
content = content.replace(
  /  \/\/ Replace commas with periods \(commas can be interpreted as parameter separators\)\n  \/\/ But only if they're not part of a URL or parameter\n  cleaned = cleaned\.replace\(\/,\(\\s\+\)\(\?!\[a-z\]\+:\)\/gi, '\.\$1'\);/,
  `  // REMOVED: Aggressive comma-to-period replacement breaks normal sentence structure
  // Commas are generally safe in Midjourney prompts
  // cleaned = cleaned.replace(/,(\\s+)(?![a-z]+:)/gi, ".$1");`
);

// Fix 2: Change rate limit handling to throw RATE_LIMIT_RESEND_TASK
content = content.replace(
  /          consecutiveRateLimitErrors\+\+;\n          console\.warn\(`\[Ttapi\] ⚠️ Rate limit detected \(consecutive: \$\{consecutiveRateLimitErrors\}\)\. Applying exponential backoff\.\.\.`\);\n\n          \/\/ Exponential backoff: 5s, 10s, 20s, 40s, max 60s\n          const backoffDelay = Math\.min\(5000 \* Math\.pow\(2, consecutiveRateLimitErrors - 1\), 60000\);\n          console\.log\(`\[Ttapi\] ⏳ Waiting \$\{backoffDelay \/ 1000\}s before retrying\.\.\.`\);\n          await new Promise\(resolve => setTimeout\(resolve, backoffDelay\)\);\n\n          \/\/ Reset delay to initial after backoff\n          delay = initialDelay;\n          continue; \/\/ Retry polling/,
  `          // Instead of retrying indefinitely, throw error to trigger resend as new task
          console.warn(\`[Ttapi] ⚠️ Rate limit detected during polling. Will resend as new task.\`);
          throw new Error(\`RATE_LIMIT_RESEND_TASK: \${errorMsg}\`);`
);

fs.writeFileSync('services/ttapiService.ts', content);
console.log('Done');

