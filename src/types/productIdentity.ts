export interface JunkJournalPagesIdentity {
    core_product_type: "junk_journal_pages";
    format: "digital_printable";
    delivery_method: "pdf_google_drive_link";
    file_types: string[];
    print_size: "8.5x11";
    page_count: number | null;        // Always 160+
    dpi: string | null;               // e.g. "300 DPI"
    license_type: "commercial_use";
    primary_theme: string;            // e.g. "Victorian", "Cottagecore"
    theme_synonyms: string[];         // Buyer search synonyms for primary theme
    secondary_themes: string[];       // Complementary themes only
    color_palette: string[];          // e.g. ["muted", "earthy", "sepia"]
    mood: string;                     // e.g. "romantic", "dark", "whimsical"
    motifs: string[];                 // e.g. ["playing cards", "roses"]
    style: string;                    // e.g. "vintage grunge watercolor"
    targetBuyer: string;              // e.g. "scrapbookers"
    locked_identity_terms: string[];  // Non-negotiable terms for validation
    theme_cluster: ThemeCluster;      // See clusters below
    confidence: number;               // 0–1, pause generation if below 0.7
}

export type ThemeCluster =
    | "vintage_antique"
    | "cottagecore_botanical"
    | "gothic_dark"
    | "coastal_beach"
    | "christmas_winter"
    | "halloween_spooky"
    | "floral_romantic"
    | "masculine_industrial"
    | "mixed_eclectic"
    | "unthemed"
    | "other";

// Clusters that are COMPATIBLE (can coexist without niche blur penalty)
export const COMPATIBLE_THEME_CLUSTERS: Record<ThemeCluster, ThemeCluster[]> = {
    vintage_antique: ["floral_romantic", "gothic_dark", "cottagecore_botanical"],
    cottagecore_botanical: ["floral_romantic", "vintage_antique", "coastal_beach"],
    gothic_dark: ["halloween_spooky", "vintage_antique"],
    coastal_beach: ["cottagecore_botanical", "floral_romantic"],
    christmas_winter: ["floral_romantic", "vintage_antique"],
    halloween_spooky: ["gothic_dark"],
    floral_romantic: ["vintage_antique", "cottagecore_botanical", "coastal_beach", "christmas_winter"],
    masculine_industrial: [],
    mixed_eclectic: [],
    unthemed: [],
    other: [],
};
