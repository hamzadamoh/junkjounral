// QA Test: NLP Title Architecture vs Old Comma-Separated Format
// Tests the scoring engine with both formats for two test subjects

import { evaluateListingSEO } from '../src/lib/seoScoringEngine';
import { JunkJournalPagesIdentity } from '../src/types/productIdentity';

const tags13 = [
    "junk journal pages", "vintage journal", "printable papers",
    "digital download", "scrapbook pages", "collage sheets",
    "journal printable", "craft papers", "handmade journal",
    "mixed media pages", "book journal", "paper ephemera",
    "commercial use"
];

const description = `Transform your junk journals with these richly detailed pages, designed for collectors, crafters, and artists who love vintage aesthetics.\n\nWhat's Included:\n- 160+ high-resolution JPG journal pages\n- Print size: 8.5 x 11 inches\n- Resolution: 300 DPI — print-ready quality\n- Commercial use license included\n\nThis is a DIGITAL DOWNLOAD. After purchase you will receive a PDF file. Inside that PDF is a Google Drive link where you can instantly download all 160+ JPG image files directly to your device. No physical item will be shipped.\n\nPrint at home or at a print shop. Use in junk journals, art journals, scrapbooks, mixed media projects, or planners.\n\nCommercial use license is included with your purchase. You may use these pages in journals or products you sell.`;

// ═══ TEST 1: Vintage Swatchbook ═══

const swatchbookIdentity: JunkJournalPagesIdentity = {
    core_product_type: "junk_journal_pages",
    format: "digital_printable",
    delivery_method: "pdf_google_drive_link",
    file_types: ["JPG"],
    print_size: "8.5x11",
    page_count: 160,
    dpi: "300 DPI",
    license_type: "commercial_use",
    primary_theme: "vintage swatchbook",
    theme_synonyms: ["color swatch", "paint chip", "color palette"],
    secondary_themes: ["retro"],
    color_palette: ["multicolor"],
    mood: "creative",
    locked_identity_terms: ["vintage swatchbook", "junk journal pages"],
    theme_cluster: "vintage" as any,
    confidence: 0.95
};

const swatchbookCompetitorPhrases = ["Color Swatch Ephemera", "Paint Chip Collage Sheets", "Watercolor Palette Papers"];

// OLD format (comma-separated)
const oldSwatchTitle = "Vintage Swatchbook Junk Journal Pages, Vintage Swatch Collage, Vintage Color Swatch Printable, Vintage Paint Chip Papers";

// NEW format (NLP sentence)
const newSwatchTitle = "Vintage Swatchbook Junk Journal Pages with Color Swatch Ephemera, Printable Paint Chip Collage Sheets for Art Journals";

console.log("═══ TEST 1: VINTAGE SWATCHBOOK ═══\n");

console.log("OLD FORMAT (comma keywords):");
console.log(`  "${oldSwatchTitle}" (${oldSwatchTitle.length} chars)`);
const oldSwatchScore = evaluateListingSEO(oldSwatchTitle, tags13, description, swatchbookIdentity, swatchbookCompetitorPhrases);
console.log(`  Score: ${oldSwatchScore.overallScore}/100 | Title: ${oldSwatchScore.pillars.title}`);
console.log(`  Strengths: ${oldSwatchScore.strengths.filter(s => s.includes('title') || s.includes('Core') || s.includes('theme') || s.includes('NLP') || s.includes('connector') || s.includes('length')).join(' | ')}`);
console.log(`  Weaknesses: ${oldSwatchScore.weaknesses.filter(s => s.includes('title') || s.includes('connector') || s.includes('root') || s.includes('NLP') || s.includes('chars') || s.includes('anchor') || s.includes('keyword')).join(' | ')}`);

console.log("\nNEW FORMAT (NLP sentence):");
console.log(`  "${newSwatchTitle}" (${newSwatchTitle.length} chars)`);
const newSwatchScore = evaluateListingSEO(newSwatchTitle, tags13, description, swatchbookIdentity, swatchbookCompetitorPhrases);
console.log(`  Score: ${newSwatchScore.overallScore}/100 | Title: ${newSwatchScore.pillars.title}`);
console.log(`  Strengths: ${newSwatchScore.strengths.filter(s => s.includes('title') || s.includes('Core') || s.includes('theme') || s.includes('NLP') || s.includes('connector') || s.includes('length')).join(' | ')}`);
console.log(`  Weaknesses: ${newSwatchScore.weaknesses.filter(s => s.includes('title') || s.includes('connector') || s.includes('root') || s.includes('NLP') || s.includes('chars') || s.includes('anchor') || s.includes('keyword')).join(' | ')}`);

// ═══ TEST 2: Shabby Chic Rose ═══

const roseIdentity: JunkJournalPagesIdentity = {
    core_product_type: "junk_journal_pages",
    format: "digital_printable",
    delivery_method: "pdf_google_drive_link",
    file_types: ["JPG"],
    print_size: "8.5x11",
    page_count: 160,
    dpi: "300 DPI",
    license_type: "commercial_use",
    primary_theme: "shabby chic rose",
    theme_synonyms: ["romantic floral", "cottage rose", "pink roses"],
    secondary_themes: ["vintage"],
    color_palette: ["pink", "cream"],
    mood: "romantic",
    locked_identity_terms: ["shabby chic rose", "junk journal pages"],
    theme_cluster: "floral" as any,
    confidence: 0.92
};

const roseCompetitorPhrases = ["Floral Ephemera Collage", "Rose Scrapbook Papers", "Cottagecore Printable"];

// OLD format
const oldRoseTitle = "Shabby Chic Rose Junk Journal Pages, Shabby Rose Ephemera, Rose Collage Sheets, Rose Scrapbook, Vintage Rose Papers";

// NEW format
const newRoseTitle = "Shabby Chic Rose Junk Journal Pages with Floral Ephemera Collage, Printable Cottagecore Scrapbook Sheets for Crafters";

console.log("\n\n═══ TEST 2: SHABBY CHIC ROSE ═══\n");

console.log("OLD FORMAT (comma keywords):");
console.log(`  "${oldRoseTitle}" (${oldRoseTitle.length} chars)`);
const oldRoseScore = evaluateListingSEO(oldRoseTitle, tags13, description, roseIdentity, roseCompetitorPhrases);
console.log(`  Score: ${oldRoseScore.overallScore}/100 | Title: ${oldRoseScore.pillars.title}`);
console.log(`  Strengths: ${oldRoseScore.strengths.filter(s => s.includes('title') || s.includes('Core') || s.includes('theme') || s.includes('NLP') || s.includes('connector') || s.includes('length')).join(' | ')}`);
console.log(`  Weaknesses: ${oldRoseScore.weaknesses.filter(s => s.includes('title') || s.includes('connector') || s.includes('root') || s.includes('NLP') || s.includes('chars') || s.includes('anchor') || s.includes('keyword')).join(' | ')}`);

console.log("\nNEW FORMAT (NLP sentence):");
console.log(`  "${newRoseTitle}" (${newRoseTitle.length} chars)`);
const newRoseScore = evaluateListingSEO(newRoseTitle, tags13, description, roseIdentity, roseCompetitorPhrases);
console.log(`  Score: ${newRoseScore.overallScore}/100 | Title: ${newRoseScore.pillars.title}`);
console.log(`  Strengths: ${newRoseScore.strengths.filter(s => s.includes('title') || s.includes('Core') || s.includes('theme') || s.includes('NLP') || s.includes('connector') || s.includes('length')).join(' | ')}`);
console.log(`  Weaknesses: ${newRoseScore.weaknesses.filter(s => s.includes('title') || s.includes('connector') || s.includes('root') || s.includes('NLP') || s.includes('chars') || s.includes('anchor') || s.includes('keyword')).join(' | ')}`);

console.log("\n\n═══ SUMMARY ═══");
console.log(`Vintage Swatchbook  — Old: ${oldSwatchScore.overallScore} → New: ${newSwatchScore.overallScore} (${newSwatchScore.overallScore > oldSwatchScore.overallScore ? '+' : ''}${newSwatchScore.overallScore - oldSwatchScore.overallScore})`);
console.log(`Shabby Chic Rose    — Old: ${oldRoseScore.overallScore} → New: ${newRoseScore.overallScore} (${newRoseScore.overallScore > oldRoseScore.overallScore ? '+' : ''}${newRoseScore.overallScore - oldRoseScore.overallScore})`);
