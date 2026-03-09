import { JunkJournalPagesIdentity } from '../types/productIdentity';

export function buildIdentityLockPrompt(identity: JunkJournalPagesIdentity): string {
    return `
<MANDATORY IDENTITY LOCK>
This product is a DIGITAL PRINTABLE JUNK JOURNAL PAGES listing.
You are optimizing SEO ONLY. You MUST NOT change what the product IS.

FROZEN PRODUCT FACTS (do not alter these under any circumstance):
- Product type: Junk journal pages (decorative printable pages)
- Page count: ${identity.page_count ?? "160+"} pages
- File format: JPG images
- Print size: 8.5 x 11 inches
- Delivery: PDF file containing a Google Drive download link
- License: Commercial use included
- Primary theme: ${identity.primary_theme || "not specified"}
- Secondary themes: ${(Array.isArray(identity.secondary_themes) ? identity.secondary_themes : []).join(", ") || "none"}
- Color palette: ${(Array.isArray(identity.color_palette) ? identity.color_palette : []).join(", ") || "not specified"}
- Mood: ${identity.mood || "not specified"}
- Non-negotiable identity terms: ${(Array.isArray(identity.locked_identity_terms) ? identity.locked_identity_terms : []).join(", ")}

SEO OPTIMIZATION RULES FOR THIS NICHE:
1. The title MUST contain "junk journal pages" or "journal pages printable"
2. The title MUST lead with the primary theme in the first 40 characters
3. Tags MUST use buyer-intent combinations: "[theme] junk journal pages",
   "printable journal pages [theme]", "digital journal pages [theme]"
4. At least 2 tags MUST reference the commercial use license
5. The description MUST clearly explain the Google Drive delivery method
6. The description MUST state: 160+ pages, JPG format, 8.5x11, 300 DPI
7. Do NOT invent themes, motifs, or aesthetics not present in the identity above
8. Do NOT use themes that contradict the primary theme cluster
9. Secondary themes must be complementary — not contradictory
</MANDATORY IDENTITY LOCK>
`;
}
