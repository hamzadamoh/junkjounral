const removeTitleDuplicates = (title) => {
    if (!title) return '';
    const seen = new Set();
    let newTitle = title.replace(/\b[A-Za-z0-9_]+\b/g, (match) => {
        const lower = match.toLowerCase();
        if (seen.has(lower)) return '';
        seen.add(lower);
        return match;
    });
    return newTitle
        .replace(/\s+/g, ' ')
        // Remove empty commas like ", ," -> ","
        .replace(/,\s*,/g, ',')
        // Remove comma followed by nothing but space " ," -> ","
        .replace(/\s+,/g, ',')
        // Remove trailing or leading commas
        .replace(/(^,\s*)|(,\s*$)/g, '')
        .trim();
};
console.log(removeTitleDuplicates('Vintage Junk Journal Pages, Color Swatch Printable, Paint Chip Digital Pages, Nostalgic Collage Printable, vintage'));
console.log(removeTitleDuplicates('Vintage Junk Journal Pages, 160 Digital Printable Collage, 8.5x11 JPGs, Commercial Use Included'));
