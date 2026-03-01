import { JunkJournalPagesIdentity } from '../types/productIdentity';

export function buildViolationReport(
    violations: string[],
    identity: JunkJournalPagesIdentity,
    preservedElements: string[]
): string {
    return `
VIOLATION REPORT — DO NOT IGNORE THESE:
${violations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

WHAT TO FIX:
- Restore primary theme "${identity.primary_theme}" to the first 40 characters of the title
- Ensure "junk journal pages" or "printable journal pages" is in the title
- Make sure the description explains: PDF file → Google Drive link → download JPG files
- State commercial use license explicitly in the description
- Use theme-specific tags: "${identity.primary_theme} junk journal pages" must be a tag

WHAT NOT TO TOUCH:
${preservedElements.map((e) => `- ${e}`).join("\n")}
- The page count (${identity.page_count ?? "160+"} pages)
- The file format (JPG, 8.5x11, 300 DPI)
- The delivery method (PDF with Google Drive link)
- The license type (commercial use)
- The primary theme: "${identity.primary_theme}"

Rewrite ONLY what is listed above. Preserve everything else exactly.
  `;
}
