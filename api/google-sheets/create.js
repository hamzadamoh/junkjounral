/**
 * Google Sheets Export - Returns CSV data for Google Sheets import
 * 
 * This endpoint prepares data in the format needed for Google Sheets.
 * The client will download a CSV file that can be imported into Google Sheets,
 * then the user can use the provided Google Apps Script to process images.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, themeName } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Prepare data for the sheet (matching Google Apps Script format)
    const sheetName = themeName ? `Generated Images - ${themeName}` : 'Generated Images';
    const timestamp = new Date().toISOString().split('T')[0];
    const finalSheetName = `${sheetName} - ${timestamp}`;

    // Headers matching the Google Apps Script format
    const headers = [
      'Title for Canva',
      'Ingredients for Canva',
      'Image for Canva',
      'inserted',
      'image preview'
    ];

    // Prepare rows data
    const rows = [headers];
    
    images.forEach((img, index) => {
      const title = `Image ${index + 1}`;
      const prompt = img.prompt || 'No prompt available';
      const imageUrl = img.url || '';
      
      rows.push([
        title,
        prompt,
        imageUrl,
        false, // inserted checkbox (default false)
        '' // image preview (will be populated by Google Apps Script)
      ]);
    });

    // Return data for CSV generation
    return res.status(200).json({
      success: true,
      sheetName: finalSheetName,
      headers,
      rows: rows.slice(1), // Skip header row
      rowCount: rows.length - 1,
      message: `Data prepared for ${images.length} images. CSV will be downloaded.`
    });
  } catch (error) {
    console.error('Error preparing Google Sheets data:', error);
    return res.status(500).json({ 
      error: 'Failed to prepare Google Sheets data',
      message: error.message 
    });
  }
}

