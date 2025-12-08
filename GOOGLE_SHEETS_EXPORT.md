# Google Sheets Export Guide

This guide explains how to export generated images to Google Sheets and use Google Apps Script to insert images.

## How to Use

1. **Export Images**: After generating images, click the "Export to Sheets" button in the gallery view.
2. **Download CSV**: A CSV file will be downloaded with all image data.
3. **Import to Google Sheets**: 
   - Open Google Sheets
   - File → Import → Upload the downloaded CSV file
4. **Run Google Apps Script**: Use the scripts below to process images in the sheet.

## Google Apps Script Code

### Script 1: Process Images for Canva

This script inserts images from URLs into the "image preview" column.

```javascript
/**
 * @OnlyCurrentDoc
 */

function processImagesForCanva() {
  try {
    Logger.log("----- Starting processImagesForCanva script -----");
    
    // Open the active spreadsheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log("Spreadsheet not found.");
      return;
    }
    
    // Get the active sheet
    var sheet = ss.getActiveSheet();
    
    // Retrieve all data from the sheet
    var dataRange = sheet.getDataRange();
    var data = dataRange.getValues();    
    
    if (data.length < 2) {
      Logger.log("No data rows found (only header present).");
      return;
    }
    
    // Assume the first row contains headers
    var headers = data[0];
    Logger.log("Headers found: " + headers.join(", "));
    
    // Get the column indices for the required headers
    var postImageIdx = headers.indexOf("Image for Canva");
    var imageSetIdx = headers.indexOf("inserted");
    var imageForCanvaIdx = headers.indexOf("image preview");
    
    // Validate that all required columns exist
    if (postImageIdx === -1 || imageSetIdx === -1 || imageForCanvaIdx === -1) {
      Logger.log("One or more required columns not found. Please check header names.");
      return;
    }
    
    Logger.log("Column indices - Post Image: " + postImageIdx + ", Image set to cell: " + imageSetIdx + ", Image For Canva: " + imageForCanvaIdx);
    
    // Process each row (starting from row 2, index 1) where the image is not yet set.
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var currentRowNumber = i + 1;  // Convert to 1-based row number for Sheets
      
      // Check if the image is already set
      var imageSetValue = row[imageSetIdx];
      if (imageSetValue === true || (typeof imageSetValue === "string" && imageSetValue.toLowerCase() === "true")) {
        Logger.log("Row " + currentRowNumber + ": Image already set. Skipping.");
        continue;
      }
      
      // Retrieve the image URL from the "Image for Canva" column.
      var imageUrl = row[postImageIdx];
      if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
        Logger.log("Row " + currentRowNumber + ": Invalid or empty image URL. Skipping.");
        continue;
      }
      
      // Determine the target cell for image insertion
      var targetColumn = imageForCanvaIdx + 1;
      var targetRow = currentRowNumber;
      
      try {
        Logger.log("Row " + currentRowNumber + ": Attempting to insert image from URL: " + imageUrl);
        // Inserts the image over the cell in the target column and row.
        var imageObj = sheet.insertImage(imageUrl, targetColumn, targetRow);
        Logger.log("Row " + currentRowNumber + ": Image inserted successfully.");
        
        // Update the "Image set to cell" column to true
        sheet.getRange(currentRowNumber, imageSetIdx + 1).setValue(true);
        Logger.log("Row " + currentRowNumber + ": 'Image set to cell' updated to true.");
      } catch (err) {
        Logger.log("Row " + currentRowNumber + ": Error inserting image - " + err);
      }
    }
    
    Logger.log("----- processImagesForCanva script completed -----");
    
  } catch (e) {
    Logger.log("Unexpected error: " + e);
  }
}
```

### Script 2: Create Filtered Output Sheet (Optional)

This script creates a filtered sheet based on checkbox selection.

```javascript
/**
 * @OnlyCurrentDoc
 */

// --- Configuration ---
const COLUMNS_TO_EXTRACT_FROM_SOURCE = ["Title for canva", "Ingredients for canva", "Image for Canva"];
const CHECKBOX_COLUMN_NAME_FOR_FILTER = "Export for Canva";
const HEADER_ROW_INDEX_FOR_SOURCE_FILTER = 1;
const NEW_SHEET_FIXED_NAME = "Filtered_Canva_Output";
const ADDITIONAL_COLUMNS_IN_NEW_SHEET = {
  inserted: "inserted",
  imagePreview: "image preview"
};

function createOrReplaceFilteredOutputSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();

  if (!activeSheet) {
    ui.alert("Error", "No active sheet found.", ui.ButtonSet.OK);
    return;
  }

  try {
    Logger.log(`Processing sheet '${activeSheet.getName()}' to create/replace '${NEW_SHEET_FIXED_NAME}'.`);
    const extractedDataRows = getFilteredDataFromSourceSheet(activeSheet);

    if (!extractedDataRows) {
        Logger.log("Filtered data extraction failed or no data to export.");
        return;
    }
    
    if (extractedDataRows.length <= 1) {
      ui.alert("No Data", `No rows found in sheet '${activeSheet.getName()}' matching the criteria (checkbox checked in '${CHECKBOX_COLUMN_NAME_FOR_FILTER}' column). No new sheet created/replaced.`, ui.ButtonSet.OK);
      return;
    }

    // Define the headers for the new sheet
    const newSheetHeaders = [
        ...COLUMNS_TO_EXTRACT_FROM_SOURCE, 
        ADDITIONAL_COLUMNS_IN_NEW_SHEET.inserted, 
        ADDITIONAL_COLUMNS_IN_NEW_SHEET.imagePreview
    ];

    // Prepare the full data array for the new sheet
    const dataForNewSheet = [];
    dataForNewSheet.push(newSheetHeaders); 
    for (let i = 1; i < extractedDataRows.length; i++) {
        const sourceRow = extractedDataRows[i];
        const newRow = [
            ...sourceRow,
            false,
            ""
        ];
        dataForNewSheet.push(newRow);
    }

    // Check if the sheet already exists and delete it if it does
    const existingSheet = ss.getSheetByName(NEW_SHEET_FIXED_NAME);
    if (existingSheet) {
        Logger.log(`Sheet '${NEW_SHEET_FIXED_NAME}' already exists. Deleting it.`);
        ss.deleteSheet(existingSheet);
        SpreadsheetApp.flush();
    }

    // Create the new sheet
    Logger.log(`Creating new sheet named: ${NEW_SHEET_FIXED_NAME}`);
    const newSheet = ss.insertSheet(NEW_SHEET_FIXED_NAME);

    // Write all data to the new sheet
    Logger.log("Writing data to the new sheet...");
    newSheet.getRange(1, 1, dataForNewSheet.length, newSheetHeaders.length).setValues(dataForNewSheet);
    SpreadsheetApp.flush();

    // Apply checkbox data validation
    if (dataForNewSheet.length > 1) {
        const insertedColumnIndex = newSheetHeaders.indexOf(ADDITIONAL_COLUMNS_IN_NEW_SHEET.inserted);
        if (insertedColumnIndex !== -1) {
            const insertedColumnLetter = String.fromCharCode(65 + insertedColumnIndex);
            const numDataRows = dataForNewSheet.length - 1;
            const checkboxRange = newSheet.getRange(`${insertedColumnLetter}2:${insertedColumnLetter}${numDataRows + 1}`);
            const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
            checkboxRange.setDataValidation(rule);
        }
    }

    // Activate the new sheet
    newSheet.activate();
    ui.alert("Success", `Sheet '${NEW_SHEET_FIXED_NAME}' has been created/replaced with the filtered data.`, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log("Error in createOrReplaceFilteredOutputSheet: " + e.toString() + "\nStack: " + e.stack);
    ui.alert("Error", "An unexpected error occurred: " + e.message, ui.ButtonSet.OK);
  }
}

function getFilteredDataFromSourceSheet(sheetToProcess) {
  const ui = SpreadsheetApp.getUi();
  const lastRow = sheetToProcess.getLastRow();
  const lastColumn = sheetToProcess.getLastColumn();

  if (lastRow < HEADER_ROW_INDEX_FOR_SOURCE_FILTER) {
      Logger.log(`Source sheet '${sheetToProcess.getName()}' has no header row or is empty.`);
      ui.alert("Info", `The source sheet '${sheetToProcess.getName()}' appears to be empty or doesn't have a header row at the expected position.`, ui.ButtonSet.OK);
      return null;
  }
  
  const headerDataRange = sheetToProcess.getRange(HEADER_ROW_INDEX_FOR_SOURCE_FILTER, 1, 1, lastColumn);
  const headers = headerDataRange.getValues()[0].map(h => String(h).trim());

  const checkboxColumnIndex = headers.indexOf(CHECKBOX_COLUMN_NAME_FOR_FILTER);
  const columnIndicesToExtract = COLUMNS_TO_EXTRACT_FROM_SOURCE.map(colName => headers.indexOf(colName));

  if (checkboxColumnIndex === -1) {
    Logger.log(`Checkbox column "${CHECKBOX_COLUMN_NAME_FOR_FILTER}" not found in headers.`);
    ui.alert("Column Not Found", `The checkbox column "${CHECKBOX_COLUMN_NAME_FOR_FILTER}" was not found.`, ui.ButtonSet.OK);
    return null;
  }

  let missingExtractColumn = false;
  let firstMissingColumnName = "";
  COLUMNS_TO_EXTRACT_FROM_SOURCE.forEach((colName, i) => {
    if (columnIndicesToExtract[i] === -1) {
      if (!missingExtractColumn) {
          firstMissingColumnName = colName;
      }
      missingExtractColumn = true;
    }
  });

  if (missingExtractColumn) {
    ui.alert("Column Not Found", `One or more columns to extract (e.g., "${firstMissingColumnName}") were not found.`, ui.ButtonSet.OK);
    return null;
  }
  
  const filteredData = [];
  filteredData.push(COLUMNS_TO_EXTRACT_FROM_SOURCE);

  if (lastRow === HEADER_ROW_INDEX_FOR_SOURCE_FILTER) {
    Logger.log(`No data rows found below the header.`);
    return filteredData;
  }

  const dataRowsRange = sheetToProcess.getRange(HEADER_ROW_INDEX_FOR_SOURCE_FILTER + 1, 1, lastRow - HEADER_ROW_INDEX_FOR_SOURCE_FILTER, lastColumn);
  const allDataRows = dataRowsRange.getValues();

  for (let i = 0; i < allDataRows.length; i++) {
    const row = allDataRows[i];
    if (row[checkboxColumnIndex] === true) {
      const extractedRow = [];
      columnIndicesToExtract.forEach(idx => {
        extractedRow.push(row[idx] !== null && row[idx] !== undefined ? row[idx] : "");
      });
      filteredData.push(extractedRow);
    }
  }
  
  Logger.log(`Filtered data extracted. Data rows: ${filteredData.length - 1}`);
  return filteredData;
}
```

## How to Add Scripts to Google Sheets

1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Delete any default code
4. Paste the `processImagesForCanva` script
5. Click **Save** (floppy disk icon)
6. Give your project a name
7. Click **Run** to execute the script (you may need to authorize it)

## Column Structure

The exported CSV contains these columns:

- **Title for Canva**: Image title/number
- **Ingredients for Canva**: The prompt used to generate the image
- **Image for Canva**: The image URL
- **inserted**: Checkbox column (initially false, set to true after image is inserted)
- **image preview**: Column where images will be inserted by the script

## Notes

- The script processes images row by row
- Images are only inserted if the "inserted" checkbox is false
- The script skips rows with invalid or empty image URLs
- After successful insertion, the "inserted" checkbox is automatically set to true

