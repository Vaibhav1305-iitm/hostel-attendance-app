// ============================================
// EXTERNAL HOSTEL SHEET CONFIGURATION
// ============================================
const EXTERNAL_STUDENTS_SHEET_ID = '1g8J61vJLWh_sP0by9biJVACR0EGtC8XGlft9mmHLkps';
const EXTERNAL_STUDENTS_SHEET_GID = 1897721584;

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Hostel Attendance System')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000); // 30s

  try {
    const jsonString = e.postData.contents;
    const json = JSON.parse(jsonString);
    
    if (json.action === "sync_batched_multi_sheet") {
      return handleMultiSheetSync(json.batches);
    } else if (json.action === "fetch_reports") {
      return handleFetchReport(json.date);
    } else if (json.action === "fetch_category_data") {
      return handleFetchCategoryData(json.date, json.category);
    } else if (json.action === "get_sync_status") {
      return handleGetSyncStatus(json.dates, json.totalStudents);
    } else if (json.action === "get_tracking_data") {
      return getTrackingData(json.startDate, json.endDate);
    } else if (json.action === "refresh_tracking") {
      // Force recalculate and store fresh data
      const result = calculateTrackingData(null, null);
      return ContentService.createTextOutput(JSON.stringify({ 
        result: 'success', 
        data: result.data, 
        warnings: result.warnings 
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (json.action === "get_students") {
      // Now fetches from external hostel sheet
      return fetchExternalStudents();
    } else if (json.action === "add_student") {
      return addStudent(json.student);
    } else if (json.action === "check_attendance_status") {
      // Multi-device sync: Check if attendance already submitted
      return handleCheckAttendanceStatus(json.date, json.category, json.totalStudents);
    } else if (json.action === "get_data_statistics") {
      // Data Management: Get statistics about all sheets
      return getDataStatistics();
    } else if (json.action === "get_full_backup") {
      // Data Management: Get all data from all sheets for backup
      return getFullBackupData();
    } else if (json.action === "archive_old_data") {
      // Data Management: Archive data older than X months
      return archiveOldData(json.months);
    } else if (json.action === "purge_old_data") {
      // Data Management: Permanently delete data older than X months
      return purgeOldData(json.months);
    } else if (json.action === "import_backup") {
      // Data Management: Import/restore from backup file
      return importBackupData(json.sheets, json.mode);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function handleMultiSheetSync(batches) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = ["Full Name", "Application: Application Number", "Application: ID", "Hostel Id", "Hostel Allocation", "Time", "Status", "Reason", "Date"];

  let stats = { updated: 0, inserted: 0, skipped: 0 };

  for (const [sheetName, rows] of Object.entries(batches)) {
    if (!rows || !rows.length) continue;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    
    // Add headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }
    
    // Get existing data for smart UPSERT logic
    // Priority for matching: Application ID → Application Number → Name
    const lastRow = sheet.getLastRow();
    
    // Helper function to normalize date to YYYY-MM-DD string
    function normalizeDate(dateVal) {
      if (!dateVal) return '';
      if (dateVal instanceof Date) {
        const y = dateVal.getFullYear();
        const m = String(dateVal.getMonth() + 1).padStart(2, '0');
        const d = String(dateVal.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return String(dateVal).trim();
    }
    
    // Helper to get best identifier for a row
    // Priority: Application ID (col 3) → Application Number (col 2) → Name (col 1)
    function getStudentKey(row, dateStr) {
      const appId = String(row[2] || '').trim();      // Application: ID (index 2)
      const appNum = String(row[1] || '').trim();     // Application: Application Number (index 1)
      const name = String(row[0] || '').trim();       // Full Name (index 0)
      
      // Use best available identifier
      if (appId && appId.length > 0) {
        return { key: dateStr + '_appId_' + appId, type: 'appId', value: appId };
      } else if (appNum && appNum.length > 0) {
        return { key: dateStr + '_appNum_' + appNum, type: 'appNum', value: appNum };
      } else {
        return { key: dateStr + '_name_' + name, type: 'name', value: name };
      }
    }
    
    // Build existing map with ALL possible keys for each row
    let existingMap = {};
    
    if (lastRow > 1) {
      const existingData = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
      existingData.forEach((row, idx) => {
        const dateStr = normalizeDate(row[8]); // Date (col 9)
        const appId = String(row[2] || '').trim();
        const appNum = String(row[1] || '').trim();
        const name = String(row[0] || '').trim();
        
        const rowData = {
          rowIndex: idx + 2,
          status: String(row[6] || '').trim(),
          name: name
        };
        
        // Store by ALL available identifiers (so we can match by any)
        if (appId) existingMap[dateStr + '_appId_' + appId] = rowData;
        if (appNum) existingMap[dateStr + '_appNum_' + appNum] = rowData;
        if (name) existingMap[dateStr + '_name_' + name] = rowData;
      });
    }
    
    // Process each incoming row - smart matching
    const newRows = [];
    rows.forEach(row => {
      const date = normalizeDate(row[8]);
      const newStatus = String(row[6] || '').trim();
      const newName = String(row[0] || '').trim();
      const newAppId = String(row[2] || '').trim();
      const newAppNum = String(row[1] || '').trim();
      
      // Try to find existing entry by priority: appId → appNum → name
      let existing = null;
      if (newAppId) existing = existingMap[date + '_appId_' + newAppId];
      if (!existing && newAppNum) existing = existingMap[date + '_appNum_' + newAppNum];
      if (!existing && newName) existing = existingMap[date + '_name_' + newName];
      
      if (existing) {
        // Entry exists - check if status CHANGED
        if (existing.status !== newStatus) {
          // Status changed → UPDATE this row (includes updated name!)
          sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
          stats.updated++;
        } else {
          // Status same → SKIP
          stats.skipped++;
        }
      } else {
        // Entry doesn't exist → INSERT new row
        newRows.push(row);
        stats.inserted++;
      }
    });
    
    // Append all new rows in one batch (more efficient)
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    result: 'success',
    stats: stats  // Return stats: updated, inserted, skipped counts
  })).setMimeType(ContentService.MimeType.JSON);
}


function handleFetchReport(dateStr) {
  if (!dateStr) return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'No date provided' })).setMimeType(ContentService.MimeType.JSON);
  
  // Helper to normalize date to YYYY-MM-DD format
  function normalizeDate(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return str;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportData = {};
  const sheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const data = sheet.getDataRange().getValues(); // Use getValues() for Date objects
      if (data.length > 1) {
        const headers = data[0].map(h => String(h).trim());
        const dateIndex = headers.indexOf('Date');
        
        if (dateIndex !== -1) {
            const filtered = data.filter((row, i) => i === 0 || normalizeDate(row[dateIndex]) === dateStr);
            if (filtered.length > 1) {
                // Convert Date objects to strings before JSON serialization
                const serializedData = filtered.map(row => row.map(cell => {
                    if (cell instanceof Date) {
                        const y = cell.getFullYear();
                        const m = String(cell.getMonth() + 1).padStart(2, '0');
                        const d = String(cell.getDate()).padStart(2, '0');
                        return `${y}-${m}-${d}`;
                    }
                    return cell;
                }));
                 reportData[sheetName] = serializedData;
            }
        }
      }
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: reportData })).setMimeType(ContentService.MimeType.JSON);
}


// Fetch data for a specific category and date
function handleFetchCategoryData(dateStr, category) {
  if (!dateStr) return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'No date provided' })).setMimeType(ContentService.MimeType.JSON);
  if (!category) return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'No category provided' })).setMimeType(ContentService.MimeType.JSON);
  
  // Helper to normalize date to YYYY-MM-DD format
  function normalizeDate(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return str;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(category);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: [] })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues(); // Use getValues() to get Date objects
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: [] })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const headers = data[0].map(h => String(h).trim());
  const dateIndex = headers.indexOf('Date');
  
  if (dateIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'Date column not found' })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Filter rows by date (normalized), keep headers
  const filtered = data.filter((row, i) => i === 0 || normalizeDate(row[dateIndex]) === dateStr);
  
  return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: filtered })).setMimeType(ContentService.MimeType.JSON);
}


// Batch get sync status for multiple dates - optimized single query
function handleGetSyncStatus(dates, totalStudents) {
  if (!dates || !dates.length) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'No dates provided' })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Helper to normalize date to YYYY-MM-DD format
  function normalizeDate(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Try to parse string date formats like "13/01/2026" or "1/13/2026"
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // Already YYYY-MM-DD
    
    // Try DD/MM/YYYY or MM/DD/YYYY
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      // Assume DD/MM/YYYY format (common in India)
      const [d, m, y] = parts;
      if (y && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return str;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const categories = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  const statusData = {};
  
  // Build a Set for O(1) date lookup
  const dateSet = new Set(dates);
  
  // Process each category sheet once (not per date - optimized!)
  categories.forEach(category => {
    const sheet = ss.getSheetByName(category);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues(); // Use getValues() to get Date objects
    if (data.length <= 1) return;
    
    const headers = data[0].map(h => String(h).trim());
    const dateIndex = headers.indexOf('Date');
    if (dateIndex === -1) return;
    
    // Count records per date using a Map - O(n) single pass
    const countByDate = {};
    for (let i = 1; i < data.length; i++) {
      const rowDate = normalizeDate(data[i][dateIndex]); // Normalize date!
      if (dateSet.has(rowDate)) {
        countByDate[rowDate] = (countByDate[rowDate] || 0) + 1;
      }
    }
    
    // Store counts for this category
    Object.keys(countByDate).forEach(date => {
      if (!statusData[date]) statusData[date] = {};
      statusData[date][category] = countByDate[date];
    });
  });
  
  // Fill missing entries with 0
  dates.forEach(date => {
    if (!statusData[date]) statusData[date] = {};
    categories.forEach(cat => {
      if (!statusData[date][cat]) statusData[date][cat] = 0;
    });
  });
  
  return ContentService.createTextOutput(JSON.stringify({ 
    result: 'success', 
    data: statusData,
    totalStudents: totalStudents || 0
  })).setMimeType(ContentService.MimeType.JSON);
}


// ============================================
// MULTI-DEVICE SYNC: Check attendance status
// Returns if a date+category has been submitted
// ============================================
function handleCheckAttendanceStatus(dateStr, category, totalStudents) {
  if (!dateStr) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error', 
      error: 'No date provided' 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (!category) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error', 
      error: 'No category provided' 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Helper to normalize date to YYYY-MM-DD format
  function normalizeDate(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return str;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(category);
  
  // If sheet doesn't exist, not started
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'success',
      status: 'not_started',
      recordCount: 0,
      totalStudents: totalStudents || 0,
      lastUpdatedAt: null,
      attendanceData: null
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'success',
      status: 'not_started',
      recordCount: 0,
      totalStudents: totalStudents || 0,
      lastUpdatedAt: null,
      attendanceData: null
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const headers = data[0].map(h => String(h).trim());
  const dateIndex = headers.indexOf('Date');
  const nameIndex = headers.indexOf('Full Name');
  const statusIndex = headers.indexOf('Status');
  
  if (dateIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error',
      error: 'Date column not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Filter rows for this date
  const matchingRows = [];
  for (let i = 1; i < data.length; i++) {
    const rowDate = normalizeDate(data[i][dateIndex]);
    if (rowDate === dateStr) {
      matchingRows.push(data[i]);
    }
  }
  
  const recordCount = matchingRows.length;
  const expectedCount = totalStudents || 45; // Default to 45 if not provided
  
  // Determine status based on record count
  let status = 'not_started';
  if (recordCount > 0) {
    // If we have 80% or more of expected records, consider it submitted
    if (recordCount >= expectedCount * 0.8) {
      status = 'submitted';
    } else {
      status = 'in_progress';
    }
  }
  
  // Build attendance map if data exists
  let attendanceData = null;
  if (matchingRows.length > 0 && nameIndex !== -1 && statusIndex !== -1) {
    attendanceData = {};
    matchingRows.forEach(row => {
      const name = String(row[nameIndex] || '').trim();
      const attendanceStatus = String(row[statusIndex] || 'Present').trim();
      if (name) {
        attendanceData[name] = attendanceStatus;
      }
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    result: 'success',
    status: status,
    recordCount: recordCount,
    totalStudents: expectedCount,
    lastUpdatedAt: new Date().toISOString(),
    attendanceData: attendanceData
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// FIX ALL STUDENT DATA
// 1) Renames old names to new names
// 2) Adds Application Numbers to entries missing them
// Uses smart name matching (first 2 sorted name parts)
// ============================================
function fixAllStudentData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  let totalRenamed = 0;
  let totalAppNumFixed = 0;
  
  // ===== NAME CHANGES LIST =====
  // Format: [oldName, newName]
  const nameChanges = [
    ['Pachpute aditya', 'Aditya ramdas pachpute'],
    ['Siddhart Satish Alte', 'Siddharth Satish Alte'],  // Fix typo in name
    // Add more name changes here as needed
  ];
  
  // Helper: Get first 2 sorted name parts for matching
  function getNameKey(fullName) {
    const parts = String(fullName || '').trim().toLowerCase().split(/\s+/).filter(p => p.length > 0);
    if (parts.length < 2) return parts.join('_');
    const sorted = [...parts].sort();
    return sorted[0] + '_' + sorted[1];
  }
  
  // Build student lookup from Students sheet
  const studentsSheet = ss.getSheetByName('Students');
  const studentData = {};  // name key → { name, appNum }
  const exactNameMatch = {};  // exact lowercase name → { name, appNum }
  
  if (!studentsSheet) {
    Logger.log('ERROR: Students sheet not found!');
    return 'ERROR: Students sheet not found!';
  }
  
  const sData = studentsSheet.getDataRange().getValues();
  const sHeaders = sData[0].map(h => String(h).toLowerCase());
  const sNameIdx = sHeaders.findIndex(h => h.includes('name') && !h.includes('hostel'));
  const sAppNumIdx = sHeaders.findIndex(h => h.includes('application') && h.includes('number'));
  
  for (let i = 1; i < sData.length; i++) {
    const name = String(sData[i][sNameIdx] || '').trim();
    const appNum = String(sData[i][sAppNumIdx] || '').trim();
    if (name) {
      const key = getNameKey(name);
      studentData[key] = { name: name, appNum: appNum };
      exactNameMatch[name.toLowerCase()] = { name: name, appNum: appNum };
    }
  }
  Logger.log('Loaded ' + Object.keys(studentData).length + ' students');
  
  // Process each attendance sheet
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name') && !h.includes('hostel'));
    const appNumIdx = headers.findIndex(h => h.includes('application') && h.includes('number'));
    
    if (nameIdx === -1) {
      Logger.log(sheetName + ': Name column not found');
      return;
    }
    
    let renamedInSheet = 0;
    let appNumInSheet = 0;
    
    for (let i = 1; i < data.length; i++) {
      const currentName = String(data[i][nameIdx] || '').trim();
      const currentAppNum = appNumIdx >= 0 ? String(data[i][appNumIdx] || '').trim() : '';
      let newName = currentName;
      let newAppNum = currentAppNum;
      
      // Step 1: Check for explicit name changes
      for (const [oldName, targetName] of nameChanges) {
        if (currentName.toLowerCase() === oldName.toLowerCase()) {
          newName = targetName;
          break;
        }
      }
      
      // Step 2: If App Number is missing, try to find it
      if (!newAppNum) {
        // Try exact match first
        let match = exactNameMatch[newName.toLowerCase()];
        
        // Try smart name matching if no exact match
        if (!match) {
          const key = getNameKey(newName);
          match = studentData[key];
        }
        
        if (match && match.appNum) {
          newAppNum = match.appNum;
        }
      }
      
      // Apply changes
      if (newName !== currentName) {
        sheet.getRange(i + 1, nameIdx + 1).setValue(newName);
        renamedInSheet++;
        Logger.log(sheetName + ' Row ' + (i + 1) + ': "' + currentName + '" → "' + newName + '"');
      }
      
      if (newAppNum && newAppNum !== currentAppNum && appNumIdx >= 0) {
        sheet.getRange(i + 1, appNumIdx + 1).setValue(newAppNum);
        appNumInSheet++;
        if (appNumInSheet <= 5) {
          Logger.log(sheetName + ' Row ' + (i + 1) + ': AppNum → ' + newAppNum);
        }
      }
    }
    
    Logger.log(sheetName + ': Renamed ' + renamedInSheet + ', AppNum fixed ' + appNumInSheet);
    totalRenamed += renamedInSheet;
    totalAppNumFixed += appNumInSheet;
  });
  
  Logger.log('=== TOTAL: Renamed ' + totalRenamed + ', AppNum fixed ' + totalAppNumFixed + ' ===');
  return 'Renamed ' + totalRenamed + ', AppNum fixed ' + totalAppNumFixed + '. Now run forceRefreshTracking()';
}


// ============================================
// SYNC ALL STUDENT DATA
// Updates ALL attendance entries with correct:
// - Application Number
// - Application ID
// - Hostel ID
// - Hostel Allocation
// from Students sheet (overwrites to ensure correctness)
// ============================================
function syncAllStudentData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  let totalUpdated = 0;
  let totalNotFound = 0;
  
  // Helper: Get first 2 sorted name parts for matching
  function getNameKey(fullName) {
    const parts = String(fullName || '').trim().toLowerCase().split(/\s+/).filter(p => p.length > 0);
    if (parts.length < 2) return parts.join('_');
    const sorted = [...parts].sort();
    return sorted[0] + '_' + sorted[1];
  }
  
  // Build student lookup from Students sheet
  const studentsSheet = ss.getSheetByName('Students');
  if (!studentsSheet) {
    Logger.log('ERROR: Students sheet not found!');
    return 'ERROR: Students sheet not found!';
  }
  
  // name key → { appNum, appId, hostelId, hostelAllocation }
  const studentData = {};
  const exactNameMatch = {};
  
  const sData = studentsSheet.getDataRange().getValues();
  const sHeaders = sData[0].map(h => String(h).toLowerCase());
  
  // Find column indices in Students sheet
  const sNameIdx = sHeaders.findIndex(h => h.includes('name') && !h.includes('hostel'));
  const sAppNumIdx = sHeaders.findIndex(h => h.includes('application') && h.includes('number'));
  const sAppIdIdx = sHeaders.findIndex(h => h.includes('application') && h.includes('id') && !h.includes('number'));
  const sHostelIdIdx = sHeaders.findIndex(h => h.includes('hostel') && h.includes('id'));
  const sHostelAllocIdx = sHeaders.findIndex(h => h.includes('hostel') && h.includes('allocation'));
  
  Logger.log('Students sheet columns: Name=' + sNameIdx + ', AppNum=' + sAppNumIdx + 
             ', AppId=' + sAppIdIdx + ', HostelId=' + sHostelIdIdx + ', HostelAlloc=' + sHostelAllocIdx);
  
  if (sNameIdx === -1) {
    Logger.log('ERROR: Name column not found in Students sheet');
    return 'ERROR: Name column not found in Students sheet';
  }
  
  // Build lookup maps
  for (let i = 1; i < sData.length; i++) {
    const name = String(sData[i][sNameIdx] || '').trim();
    if (!name) continue;
    
    const info = {
      appNum: sAppNumIdx >= 0 ? String(sData[i][sAppNumIdx] || '').trim() : '',
      appId: sAppIdIdx >= 0 ? String(sData[i][sAppIdIdx] || '').trim() : '',
      hostelId: sHostelIdIdx >= 0 ? String(sData[i][sHostelIdIdx] || '').trim() : '',
      hostelAlloc: sHostelAllocIdx >= 0 ? String(sData[i][sHostelAllocIdx] || '').trim() : ''
    };
    
    const key = getNameKey(name);
    studentData[key] = info;
    exactNameMatch[name.toLowerCase()] = info;
  }
  Logger.log('Loaded ' + Object.keys(studentData).length + ' students');
  
  // Process each attendance sheet
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    
    // Find column indices in attendance sheet
    const nameIdx = headers.findIndex(h => h.includes('name') && !h.includes('hostel'));
    const appNumIdx = headers.findIndex(h => h.includes('application') && h.includes('number'));
    const appIdIdx = headers.findIndex(h => h.includes('application') && h.includes('id') && !h.includes('number'));
    const hostelIdIdx = headers.findIndex(h => h.includes('hostel') && h.includes('id'));
    const hostelAllocIdx = headers.findIndex(h => h.includes('hostel') && h.includes('allocation'));
    
    if (nameIdx === -1) {
      Logger.log(sheetName + ': Name column not found');
      return;
    }
    
    Logger.log(sheetName + ' columns: Name=' + nameIdx + ', AppNum=' + appNumIdx + 
               ', AppId=' + appIdIdx + ', HostelId=' + hostelIdIdx + ', HostelAlloc=' + hostelAllocIdx);
    
    let updatedInSheet = 0;
    let notFoundInSheet = 0;
    
    for (let i = 1; i < data.length; i++) {
      const currentName = String(data[i][nameIdx] || '').trim();
      if (!currentName) continue;
      
      // Try exact match first, then smart matching
      let studentInfo = exactNameMatch[currentName.toLowerCase()];
      if (!studentInfo) {
        const key = getNameKey(currentName);
        studentInfo = studentData[key];
      }
      
      if (studentInfo) {
        // Update all available columns
        if (appNumIdx >= 0 && studentInfo.appNum) {
          sheet.getRange(i + 1, appNumIdx + 1).setValue(studentInfo.appNum);
        }
        if (appIdIdx >= 0 && studentInfo.appId) {
          sheet.getRange(i + 1, appIdIdx + 1).setValue(studentInfo.appId);
        }
        if (hostelIdIdx >= 0 && studentInfo.hostelId) {
          sheet.getRange(i + 1, hostelIdIdx + 1).setValue(studentInfo.hostelId);
        }
        if (hostelAllocIdx >= 0 && studentInfo.hostelAlloc) {
          sheet.getRange(i + 1, hostelAllocIdx + 1).setValue(studentInfo.hostelAlloc);
        }
        
        updatedInSheet++;
        if (updatedInSheet <= 3) {
          Logger.log(sheetName + ' Row ' + (i + 1) + ': ' + currentName + ' → Updated');
        }
      } else {
        notFoundInSheet++;
        if (notFoundInSheet <= 3) {
          Logger.log(sheetName + ': NOT FOUND: "' + currentName + '"');
        }
      }
    }
    
    Logger.log(sheetName + ': Updated ' + updatedInSheet + ', Not found ' + notFoundInSheet);
    totalUpdated += updatedInSheet;
    totalNotFound += notFoundInSheet;
  });
  
  Logger.log('=== TOTAL: Updated ' + totalUpdated + ', Not found ' + totalNotFound + ' ===');
  return 'Updated ' + totalUpdated + ' entries with ALL student data. Not found: ' + totalNotFound;
}


// ============================================
// FORCE REFRESH TRACKING - Run this to debug
// ============================================
function forceRefreshTracking() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Sheet Name: ' + ss.getName());
  
  // First, let's see what names are in Yoga sheet
  const yogaSheet = ss.getSheetByName('Yoga');
  if (yogaSheet) {
    const data = yogaSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    
    Logger.log('=== YOGA SHEET NAMES (first 20) ===');
    for (let i = 1; i < Math.min(21, data.length); i++) {
      const name = String(data[i][nameIdx] || '');
      if (name.toLowerCase().includes('aditya') || name.toLowerCase().includes('pachpute')) {
        Logger.log('Found: ' + name);
      }
    }
  }
  
  // Delete old sheets to force fresh creation
  const trackingSheet = ss.getSheetByName('Tracking_Report');
  if (trackingSheet) {
    ss.deleteSheet(trackingSheet);
    Logger.log('Deleted old Tracking_Report');
  }
  
  const detailsSheet = ss.getSheetByName('TrackingDetails');
  if (detailsSheet) {
    ss.deleteSheet(detailsSheet);
    Logger.log('Deleted old TrackingDetails');
  }
  
  // Run the calculation
  const result = calculateTrackingData(null, null);
  Logger.log('DONE!');
  
  return 'Tracking refreshed!';
}


function calculateTrackingData(startDateStr, endDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  const warnings = [];

  // Helper: Extract first and last name from full name (handles various formats)
  // Uses first TWO sorted name parts to create consistent key (ignores middle names)
  function extractFirstLastName(fullName) {
    const name = String(fullName || '').trim().toLowerCase();
    const parts = name.split(/\s+/).filter(p => p.length > 0);
    
    if (parts.length === 0) return { first: '', last: '', key: '' };
    if (parts.length === 1) return { first: parts[0], last: parts[0], key: parts[0] };
    
    // Sort parts alphabetically and take FIRST TWO only
    // "Pachpute aditya" → sorted: ['aditya', 'pachpute'] → key: 'aditya_pachpute'
    // "Aditya ramdas pachpute" → sorted: ['aditya', 'pachpute', 'ramdas'] → take [0],[1] → key: 'aditya_pachpute'
    const sortedParts = [...parts].sort();
    const first = sortedParts[0];  // Alphabetically first
    const second = sortedParts[1]; // Alphabetically second (ignores middle/extra names)
    
    return { first: first, last: second, key: first + '_' + second };
  }
  
  // Get all students from EXTERNAL hostel sheet (same source as attendance app)
  const externalStudents = getExternalStudentsData();
  const allStudents = {};
  
  // STEP 1: Build name → latest Application Number mapping from external students
  // This allows us to find the current App Number for any student by their name
  const nameToAppNum = {};  // name_key → appNum
  const nameToAppId = {};   // name_key → appId
  const studentLatestInfo = {};  // name_key → {name, appNum, appId}
  
  if (externalStudents && externalStudents.length > 0) {
    externalStudents.forEach(student => {
      const name = student.name;
      const appId = student.appId || '';
      const appNum = student.appNumber || '';
      
      if (name) {
        const nameInfo = extractFirstLastName(name);
        const nameKey = nameInfo.key;
        
        // Store the mapping: name → appNum/appId
        if (appNum && !['n/a', 'na', '-', 'null', 'undefined'].includes(appNum.toLowerCase())) {
          nameToAppNum[nameKey] = appNum;
        }
        if (appId && !['n/a', 'na', '-', 'null', 'undefined'].includes(appId.toLowerCase())) {
          nameToAppId[nameKey] = appId;
        }
        
        // Store latest student info
        studentLatestInfo[nameKey] = {
          name: String(name).trim(),
          appNum: appNum,
          appId: appId
        };
      }
    });
  }
  
  // Helper: Get best identifier for a student
  // Uses App Number if available (from record OR looked up by name), otherwise uses name
  function getStudentKey(recordAppNum, recordAppId, name) {
    const nameInfo = extractFirstLastName(name);
    const nameKey = nameInfo.key;
    
    // Check if record has valid App Number
    const num = String(recordAppNum || '').trim();
    const isValidNum = num && num.length > 0 && !['n/a', 'na', '-', 'null', 'undefined'].includes(num.toLowerCase());
    
    // Priority 1: Use App Number from record if valid
    if (isValidNum) {
      return 'appNum_' + num;
    }
    
    // Priority 2: Look up this student's current App Number by name
    // This merges old records (without App Number) with the student's current App Number
    const latestAppNum = nameToAppNum[nameKey];
    if (latestAppNum) {
      return 'appNum_' + latestAppNum;
    }
    
    // Priority 3: Check App ID from record
    const id = String(recordAppId || '').trim();
    const isValidId = id && id.length > 0 && !['n/a', 'na', '-', 'null', 'undefined'].includes(id.toLowerCase());
    if (isValidId) {
      return 'appId_' + id;
    }
    
    // Priority 4: Look up this student's current App ID by name
    const latestAppId = nameToAppId[nameKey];
    if (latestAppId) {
      return 'appId_' + latestAppId;
    }
    
    // Priority 5: Use name-based key (for students without any ID yet)
    return 'name_' + nameKey;
  }
  
  // STEP 2: Initialize tracking for all external students
  if (externalStudents && externalStudents.length > 0) {
    externalStudents.forEach(student => {
      const name = student.name;
      const appId = student.appId || '';
      const appNum = student.appNumber || '';
      
      if (name) {
        const studentKey = getStudentKey(appNum, appId, name);
        
        // Initialize tracking for each category
        attendanceSheets.forEach(cat => {
          const key = `${studentKey}_${cat}`;
          allStudents[key] = {
            name: String(name).trim(),
            id: appNum || appId || '',
            appId: appId,
            appNumber: appNum,
            category: cat,
            present: 0,
            absent: 0,
            leave: 0,
            total: 0,
            presentDates: [],
            absentDates: [],
            leaveDates: []
          };
        });
      }
    });
  }

  // Process each attendance sheet
  attendanceSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    // Use getValues to get actual data (Date objects for dates)
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    // Find column indices
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const getIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const pName = getIdx(['full name', 'name']);
    const pStatus = getIdx(['status']);
    const pDate = getIdx(['date', 'timestamp']);
    const pAppId = getIdx(['application: id', 'app id', 'application id']);
    const pAppNum = getIdx(['application: application number', 'application number', 'app number']);

    if (pName === -1 || pStatus === -1 || pDate === -1) return;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rawName = row[pName];
      const status = row[pStatus];
      const rawDate = row[pDate];
      const appId = pAppId !== -1 ? String(row[pAppId] || '').trim() : '';
      const appNum = pAppNum !== -1 ? String(row[pAppNum] || '').trim() : '';
      
      if (!rawName || !rawDate) continue;
      
      // Get unique student identifier (Application ID → Application Number → Name)
      const studentKey = getStudentKey(appNum, appId, rawName);

      // Parse date - handle Date objects and strings
      let dateStr = '';
      if (rawDate instanceof Date) {
        const year = rawDate.getFullYear();
        const month = String(rawDate.getMonth() + 1).padStart(2, '0');
        const day = String(rawDate.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else {
        const rawDateStr = String(rawDate).trim();
        // Format: YYYY-MM-DD (ISO)
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
          dateStr = rawDateStr;
        }
        // Format: MM/DD/YYYY or M/D/YYYY (US format from Sheets)
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDateStr)) {
          const parts = rawDateStr.split('/');
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          dateStr = `${parts[2]}-${month}-${day}`;
        }
        // Format: DD/MM/YYYY or D/M/YYYY (Indian format)
        else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(rawDateStr)) {
          const parts = rawDateStr.split('-');
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          dateStr = `${parts[2]}-${month}-${day}`;
        }
        // Try parsing as Date object as fallback
        else {
          const d = new Date(rawDateStr);
          if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
        }
      }
      
      if (!dateStr) continue;
      
      // Apply date filter using string comparison
      if (startDateStr && dateStr < startDateStr) continue;
      if (endDateStr && dateStr > endDateStr) continue;

      // Parse date for day-of-week check (Sunday for Yoga)
      const dateParts = dateStr.split('-');
      const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      
      // Skip Sundays for Yoga
      if (sheetName === 'Yoga' && dateObj.getDay() === 0) continue;

      const key = `${studentKey}_${sheetName}`;
      
      // Get name key for looking up latest student info
      const nameKeyForLookup = extractFirstLastName(rawName).key;

      // Create entry if not exists (for students in attendance but not in Students sheet)
      if (!allStudents[key]) {
        // Use latest info from external students if available (lookup by name key)
        const latestInfo = studentLatestInfo[nameKeyForLookup];
        const displayName = latestInfo ? latestInfo.name : String(rawName).trim();
        const latestAppNum = latestInfo ? latestInfo.appNum : (nameToAppNum[nameKeyForLookup] || appNum);
        const latestAppId = latestInfo ? latestInfo.appId : (nameToAppId[nameKeyForLookup] || appId);
        
        allStudents[key] = {
          name: displayName,
          id: latestAppNum || latestAppId || '',
          appId: latestAppId,
          appNumber: latestAppNum,
          category: sheetName,
          present: 0,
          absent: 0,
          leave: 0,
          total: 0,
          presentDates: [],
          absentDates: [],
          leaveDates: []
        };
      } else {
        // Update to latest info (in case name or app number changed)
        const latestInfo = studentLatestInfo[nameKeyForLookup];
        if (latestInfo) {
          allStudents[key].name = latestInfo.name;
          allStudents[key].appNumber = latestInfo.appNum;
          allStudents[key].appId = latestInfo.appId;
          allStudents[key].id = latestInfo.appNum || latestInfo.appId || '';
        }
      }

      // Count status and store dates
      const lowerStatus = String(status).toLowerCase();
      if (lowerStatus.includes('present')) {
        allStudents[key].present++;
        if (!allStudents[key].presentDates.includes(dateStr)) {
          allStudents[key].presentDates.push(dateStr);
        }
      } else if (lowerStatus.includes('absent')) {
        allStudents[key].absent++;
        if (!allStudents[key].absentDates.includes(dateStr)) {
          allStudents[key].absentDates.push(dateStr);
        }
      } else if (lowerStatus.includes('leave')) {
        allStudents[key].leave++;
        if (!allStudents[key].leaveDates.includes(dateStr)) {
          allStudents[key].leaveDates.push(dateStr);
        }
      }
    }
  });

  // Calculate totals, sort dates (newest first), and sort students alphabetically
  const finalResults = Object.values(allStudents).map(rec => {
    rec.total = rec.present + rec.absent + rec.leave;
    // Sort dates descending (newest first)
    rec.presentDates.sort().reverse();
    rec.absentDates.sort().reverse();
    rec.leaveDates.sort().reverse();
    return rec;
  })
  .filter(rec => rec.name) // Remove any empty entries
  .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name

  // Update Tracking_Report sheet (only if no date filter)
  if (!startDateStr && !endDateStr) {
    let trackingSheet = ss.getSheetByName('Tracking_Report');
    if (!trackingSheet) {
      trackingSheet = ss.insertSheet('Tracking_Report');
      trackingSheet.appendRow(['Student Name', 'Category', 'Present', 'Absent', 'Leave', 'Total Days', 'Last Updated']);
    }
    
    if (finalResults.length > 0) {
      if (trackingSheet.getLastRow() > 1) {
        trackingSheet.getRange(2, 1, trackingSheet.getLastRow() - 1, 7).clearContent();
      }
      const output = finalResults.map(rec => [
        rec.name, rec.category, rec.present, rec.absent, rec.leave, rec.total, new Date()
      ]);
      trackingSheet.getRange(2, 1, output.length, 7).setValues(output);
    }

    // Also save date details to TrackingDetails sheet for persistent storage
    let detailsSheet = ss.getSheetByName('TrackingDetails');
    if (!detailsSheet) {
      detailsSheet = ss.insertSheet('TrackingDetails');
      detailsSheet.appendRow(['Student Name', 'Category', 'Present Dates', 'Absent Dates', 'Leave Dates', 'Last Updated']);
    }
    
    if (finalResults.length > 0) {
      if (detailsSheet.getLastRow() > 1) {
        detailsSheet.getRange(2, 1, detailsSheet.getLastRow() - 1, 6).clearContent();
      }
      const detailsOutput = finalResults.map(rec => [
        rec.name, 
        rec.category, 
        (rec.presentDates || []).join(','),
        (rec.absentDates || []).join(','),
        (rec.leaveDates || []).join(','),
        new Date()
      ]);
      detailsSheet.getRange(2, 1, detailsOutput.length, 6).setValues(detailsOutput);
    }
  }
  
  return { data: finalResults, warnings: warnings };
}

function getTrackingData(startDate, endDate) {
  // Always calculate fresh data for accuracy
  const result = calculateTrackingData(startDate, endDate);
  return ContentService.createTextOutput(JSON.stringify({ 
    result: 'success', 
    data: result.data, 
    warnings: result.warnings 
  })).setMimeType(ContentService.MimeType.JSON);
}

// Read stored date details from TrackingDetails sheet
function getStoredTrackingDetails() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const detailsSheet = ss.getSheetByName('TrackingDetails');
    const trackingSheet = ss.getSheetByName('Tracking_Report');
    
    if (!detailsSheet || !trackingSheet) return null;
    
    const detailsData = detailsSheet.getDataRange().getValues();
    const trackingData = trackingSheet.getDataRange().getValues();
    
    if (detailsData.length <= 1 || trackingData.length <= 1) return null;
    
    // Create lookup for tracking counts
    const countLookup = {};
    for (let i = 1; i < trackingData.length; i++) {
      const key = `${trackingData[i][0]}_${trackingData[i][1]}`.toLowerCase();
      countLookup[key] = {
        present: trackingData[i][2] || 0,
        absent: trackingData[i][3] || 0,
        leave: trackingData[i][4] || 0,
        total: trackingData[i][5] || 0
      };
    }
    
    // Merge with date details
    const results = [];
    for (let i = 1; i < detailsData.length; i++) {
      const name = detailsData[i][0];
      const category = detailsData[i][1];
      const key = `${name}_${category}`.toLowerCase();
      const counts = countLookup[key] || { present: 0, absent: 0, leave: 0, total: 0 };
      
      results.push({
        name: name,
        id: '',
        category: category,
        present: counts.present,
        absent: counts.absent,
        leave: counts.leave,
        total: counts.total,
        presentDates: detailsData[i][2] ? String(detailsData[i][2]).split(',').filter(d => d) : [],
        absentDates: detailsData[i][3] ? String(detailsData[i][3]).split(',').filter(d => d) : [],
        leaveDates: detailsData[i][4] ? String(detailsData[i][4]).split(',').filter(d => d) : []
      });
    }
    
    return results;
  } catch (e) {
    return null;
  }
}

function setupWeeklyTrigger() {
  // Remove existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Create weekly trigger - Every Sunday at 1 AM
  ScriptApp.newTrigger('forceRefreshTracking')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(1)
      .create();
  
  Logger.log('✅ Weekly trigger setup! Tracking will refresh every Sunday at 1 AM.');
  return 'Weekly trigger created - runs every Sunday at 1 AM';
}

// Utility: Remove all triggers
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('All triggers removed');
  return 'All triggers removed';
}

// ============================================
// STUDENT MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get all students from the "Students" sheet
 * Creates the sheet with headers if it doesn't exist
 */
function getStudents() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Students');
    
    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('Students');
      sheet.appendRow(['Full Name', 'Application: Application Number', 'Application: ID', 'Hostel Id', 'Hostel Allocation', 'Added Date']);
      // Return empty array since sheet was just created
      return ContentService.createTextOutput(JSON.stringify({ 
        result: 'success', 
        students: [] 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = sheet.getDataRange().getValues();
    
    // If only headers exist
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        result: 'success', 
        students: [] 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parse students (skip header row)
    const students = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) { // Only add if name exists
        students.push({
          name: row[0],
          appNumber: row[1] || '',
          appId: row[2] || '',
          hostelId: row[3] || '',
          allocation: row[4] || '',
          addedDate: row[5] || ''
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'success', 
      students: students 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error', 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add a new student to the "Students" sheet
 * Checks for duplicates by name
 */
function addStudent(studentData) {
  try {
    if (!studentData || !studentData.name) {
      return ContentService.createTextOutput(JSON.stringify({ 
        result: 'error', 
        error: 'Student name is required' 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Students');
    
    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('Students');
      sheet.appendRow(['Full Name', 'Application: Application Number', 'Application: ID', 'Hostel Id', 'Hostel Allocation', 'Added Date']);
    }
    
    // Check for duplicates
    const data = sheet.getDataRange().getValues();
    const studentName = studentData.name.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toLowerCase() === studentName) {
        return ContentService.createTextOutput(JSON.stringify({ 
          result: 'error', 
          error: 'Student with this name already exists' 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Add new student
    const newRow = [
      studentData.name.trim(),
      studentData.appNumber || '',
      studentData.appId || '',
      studentData.hostelId || '',
      studentData.allocation || '',
      new Date().toISOString().split('T')[0] // Today's date
    ];
    
    sheet.appendRow(newRow);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'success',
      message: 'Student added successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error', 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// FETCH STUDENTS FROM EXTERNAL HOSTEL SHEET
// ============================================
/**
 * Fetches student data directly from hostel's master Google Sheet
 * Auto-syncs whenever app loads - no manual updates needed
 */
function fetchExternalStudents() {
  try {
    // Open the external hostel sheet
    const externalSS = SpreadsheetApp.openById(EXTERNAL_STUDENTS_SHEET_ID);
    
    // Get sheet by GID
    const sheets = externalSS.getSheets();
    let targetSheet = null;
    for (let sheet of sheets) {
      if (sheet.getSheetId() === EXTERNAL_STUDENTS_SHEET_GID) {
        targetSheet = sheet;
        break;
      }
    }
    
    if (!targetSheet) {
      // Fallback to first sheet if GID not found
      targetSheet = sheets[0];
    }
    
    const data = targetSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        result: 'success', 
        students: [],
        source: 'external_hostel_sheet'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find column indices from header row
    const headers = data[0].map(h => String(h).trim());
    
    // Map exact column names (with flexibility for slight variations)
    const findCol = (keywords) => {
      return headers.findIndex(h => {
        const lower = h.toLowerCase();
        return keywords.some(k => lower.includes(k.toLowerCase()));
      });
    };
    
    const colName = findCol(['full name', 'name']);
    const colAppNumber = findCol(['application: application number', 'application number', 'app number']);
    const colAppId = findCol(['application: id', 'application id', 'app id']);
    const colHostelId = findCol(['hostel id']);
    const colAllocation = findCol(['hostel allocation', 'allocation']);
    
    // Parse students
    const students = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const name = colName >= 0 ? String(row[colName] || '').trim() : '';
      
      if (name) { // Only add if name exists
        students.push({
          name: name,
          appNumber: colAppNumber >= 0 ? String(row[colAppNumber] || '').trim() : '',
          appId: colAppId >= 0 ? String(row[colAppId] || '').trim() : '',
          hostelId: colHostelId >= 0 ? String(row[colHostelId] || '').trim() : '',
          allocation: colAllocation >= 0 ? String(row[colAllocation] || '').trim() : ''
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'success', 
      students: students,
      source: 'external_hostel_sheet',
      count: students.length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      result: 'error', 
      error: 'Failed to fetch from hostel sheet: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// HELPER: GET EXTERNAL STUDENTS DATA (Internal Use)
// ============================================
/**
 * Returns array of student objects from external hostel sheet
 * Used internally by calculateTrackingData() for consistent student data
 */
function getExternalStudentsData() {
  try {
    const externalSS = SpreadsheetApp.openById(EXTERNAL_STUDENTS_SHEET_ID);
    
    // Get sheet by GID
    const sheets = externalSS.getSheets();
    let targetSheet = null;
    for (let sheet of sheets) {
      if (sheet.getSheetId() === EXTERNAL_STUDENTS_SHEET_GID) {
        targetSheet = sheet;
        break;
      }
    }
    
    if (!targetSheet) {
      targetSheet = sheets[0];
    }
    
    const data = targetSheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    // Find column indices from header row
    const headers = data[0].map(h => String(h).trim());
    
    const findCol = (keywords) => {
      return headers.findIndex(h => {
        const lower = h.toLowerCase();
        return keywords.some(k => lower.includes(k.toLowerCase()));
      });
    };
    
    const colName = findCol(['full name', 'name']);
    const colAppNumber = findCol(['application: application number', 'application number', 'app number']);
    const colAppId = findCol(['application: id', 'application id', 'app id']);
    const colHostelId = findCol(['hostel id']);
    const colAllocation = findCol(['hostel allocation', 'allocation']);
    
    // Parse students
    const students = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const name = colName >= 0 ? String(row[colName] || '').trim() : '';
      
      if (name) {
        students.push({
          name: name,
          appNumber: colAppNumber >= 0 ? String(row[colAppNumber] || '').trim() : '',
          appId: colAppId >= 0 ? String(row[colAppId] || '').trim() : '',
          hostelId: colHostelId >= 0 ? String(row[colHostelId] || '').trim() : '',
          allocation: colAllocation >= 0 ? String(row[colAllocation] || '').trim() : ''
        });
      }
    }
    
    return students;
  } catch (error) {
    Logger.log('Error fetching external students: ' + error.toString());
    return [];
  }
}

// ============================================
// DEBUG: Find all entries for a student
// Run this to check why a student's data isn't tracking
// ============================================
function debugStudentData() {
  const searchNames = ['siddhart', 'siddharth', 'alte'];  // Keywords to search
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  
  Logger.log('=== SEARCHING FOR: ' + searchNames.join(', ') + ' ===');
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const appNumIdx = headers.findIndex(h => h.includes('application number'));
    const appIdIdx = headers.findIndex(h => h.includes('application: id'));
    const dateIdx = headers.findIndex(h => h.includes('date'));
    
    let found = 0;
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][nameIdx] || '').toLowerCase();
      if (searchNames.some(keyword => name.includes(keyword))) {
        found++;
        const appNum = appNumIdx >= 0 ? data[i][appNumIdx] : 'N/A';
        const appId = appIdIdx >= 0 ? data[i][appIdIdx] : 'N/A';
        const date = dateIdx >= 0 ? data[i][dateIdx] : 'N/A';
        Logger.log(sheetName + ' Row ' + (i+1) + ': "' + data[i][nameIdx] + '" | AppNum: ' + appNum + ' | AppID: ' + appId + ' | Date: ' + date);
      }
    }
    if (found > 0) Logger.log(sheetName + ' TOTAL: ' + found + ' entries');
  });
  
  // Also check Students sheet
  const studentsSheet = ss.getSheetByName('Students');
  if (studentsSheet) {
    const sData = studentsSheet.getDataRange().getValues();
    const sHeaders = sData[0].map(h => String(h).toLowerCase());
    const sNameIdx = sHeaders.findIndex(h => h.includes('name') || h.includes('student'));
    const sAppNumIdx = sHeaders.findIndex(h => h.includes('application number'));
    
    Logger.log('=== STUDENTS SHEET ===');
    for (let i = 1; i < sData.length; i++) {
      const name = String(sData[i][sNameIdx] || '').toLowerCase();
      if (searchNames.some(keyword => name.includes(keyword))) {
        const appNum = sAppNumIdx >= 0 ? sData[i][sAppNumIdx] : 'N/A';
        Logger.log('Students Row ' + (i+1) + ': "' + sData[i][sNameIdx] + '" | AppNum: ' + appNum);
      }
    }
  }
  
  Logger.log('=== DEBUG COMPLETE ===');
  return 'Check View → Logs for results';
}

// ============================================
// DEBUG: Compare student keys from different sources
// This shows WHY duplicates happen - key mismatch
// ============================================
function debugStudentKeys() {
  const searchName = 'siddharth';  // Search keyword
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Helper: Extract name key (same as calculateTrackingData)
  function extractFirstLastName(fullName) {
    const name = String(fullName || '').trim().toLowerCase();
    const parts = name.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) return { key: '' };
    if (parts.length === 1) return { key: parts[0] };
    const sortedParts = [...parts].sort();
    return { key: sortedParts[0] + '_' + sortedParts[1] };
  }
  
  function getStudentKey(appNum, appId, name) {
    const num = String(appNum || '').trim();
    const id = String(appId || '').trim();
    if (num && num.length > 0) return 'appNum_' + num;
    if (id && id.length > 0) return 'appId_' + id;
    const nameInfo = extractFirstLastName(name);
    return 'name_' + nameInfo.key;
  }
  
  // Check External Students
  Logger.log('=== EXTERNAL STUDENTS ===');
  const externalStudents = getExternalStudentsData();
  externalStudents.forEach((s, i) => {
    if (s.name.toLowerCase().includes(searchName)) {
      const key = getStudentKey(s.appNumber, s.appId, s.name);
      Logger.log('External Row ' + (i+2) + ': "' + s.name + '" | AppNum: "' + s.appNumber + '" | AppID: "' + s.appId + '" | KEY: ' + key);
    }
  });
  
  // Check Yoga sheet
  Logger.log('=== YOGA SHEET (first match) ===');
  const yoga = ss.getSheetByName('Yoga');
  if (yoga) {
    const data = yoga.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const appNumIdx = headers.findIndex(h => h.includes('application number'));
    const appIdIdx = headers.findIndex(h => h.includes('application: id'));
    
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][nameIdx] || '');
      if (name.toLowerCase().includes(searchName)) {
        const appNum = appNumIdx >= 0 ? String(data[i][appNumIdx] || '').trim() : '';
        const appId = appIdIdx >= 0 ? String(data[i][appIdIdx] || '').trim() : '';
        const key = getStudentKey(appNum, appId, name);
        Logger.log('Yoga Row ' + (i+1) + ': "' + name + '" | AppNum: "' + appNum + '" | AppID: "' + appId + '" | KEY: ' + key);
        break; // Just first match
      }
    }
  }
  
  Logger.log('=== If KEYs are different, that is why duplicates occur! ===');
  return 'Check View → Logs for results';
}

// ============================================
// DATA MANAGEMENT FUNCTIONS
// For backup, archive, and data statistics
// ============================================

/**
 * Get statistics about all sheets in the spreadsheet
 * Shows row counts, date ranges, and estimated size
 */
function getDataStatistics() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    const stats = {
      totalRows: 0,
      totalCells: 0,
      sheets: [],
      lastUpdated: new Date().toISOString()
    };
    
    // Sheets to analyze (attendance + tracking + students)
    const relevantSheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift', 'Students', 'Tracking_Report', 'TrackingDetails'];
    
    allSheets.forEach(sheet => {
      const name = sheet.getName();
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const cells = lastRow * lastCol;
      
      // Get date range for attendance sheets
      let oldestDate = null;
      let newestDate = null;
      
      if (['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'].includes(name) && lastRow > 1) {
        const data = sheet.getDataRange().getValues();
        const headers = data[0].map(h => String(h).toLowerCase());
        const dateIdx = headers.findIndex(h => h.includes('date'));
        
        if (dateIdx >= 0) {
          const dates = [];
          for (let i = 1; i < data.length; i++) {
            const d = data[i][dateIdx];
            if (d instanceof Date && !isNaN(d.getTime())) {
              dates.push(d);
            }
          }
          if (dates.length > 0) {
            dates.sort((a, b) => a - b);
            oldestDate = dates[0].toISOString().split('T')[0];
            newestDate = dates[dates.length - 1].toISOString().split('T')[0];
          }
        }
      }
      
      stats.sheets.push({
        name: name,
        rows: lastRow,
        columns: lastCol,
        cells: cells,
        oldestDate: oldestDate,
        newestDate: newestDate,
        isRelevant: relevantSheets.includes(name) || name.startsWith('Archive_')
      });
      
      stats.totalRows += lastRow;
      stats.totalCells += cells;
    });
    
    // Sort: relevant sheets first, then by row count
    stats.sheets.sort((a, b) => {
      if (a.isRelevant !== b.isRelevant) return b.isRelevant - a.isRelevant;
      return b.rows - a.rows;
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      stats: stats
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get ALL data from ALL sheets for full backup
 * Returns data that can be used to restore everything
 */
function getFullBackupData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    const backup = {
      spreadsheetName: ss.getName(),
      spreadsheetId: ss.getId(),
      backupDate: new Date().toISOString(),
      sheets: {}
    };
    
    allSheets.forEach(sheet => {
      const name = sheet.getName();
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      
      if (lastRow > 0 && lastCol > 0) {
        const data = sheet.getDataRange().getValues();
        
        // Convert dates to ISO strings for JSON
        const processedData = data.map(row => 
          row.map(cell => {
            if (cell instanceof Date) {
              return { _type: 'date', value: cell.toISOString() };
            }
            return cell;
          })
        );
        
        backup.sheets[name] = {
          rows: lastRow,
          columns: lastCol,
          data: processedData
        };
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      backup: backup
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Archive data older than X months to separate archive sheets
 * Moves data, doesn't delete - safe operation
 */
function archiveOldData(months) {
  try {
    if (!months || months < 1) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        error: 'Please specify months (minimum 1)'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    const results = { archived: 0, sheets: {} };
    
    attendanceSheets.forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const headerRow = headers.map(h => String(h).toLowerCase());
      const dateIdx = headerRow.findIndex(h => h.includes('date'));
      
      if (dateIdx === -1) return;
      
      // Separate old and new data
      const oldData = [];
      const newData = [headers]; // Keep headers
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const dateVal = row[dateIdx];
        let dateStr = '';
        
        if (dateVal instanceof Date) {
          dateStr = dateVal.toISOString().split('T')[0];
        } else if (dateVal) {
          dateStr = String(dateVal).trim();
        }
        
        if (dateStr && dateStr < cutoffStr) {
          oldData.push(row);
        } else {
          newData.push(row);
        }
      }
      
      if (oldData.length === 0) return;
      
      // Create or get archive sheet
      const archiveName = 'Archive_' + sheetName;
      let archiveSheet = ss.getSheetByName(archiveName);
      if (!archiveSheet) {
        archiveSheet = ss.insertSheet(archiveName);
        archiveSheet.appendRow(headers);
      }
      
      // Append old data to archive
      if (oldData.length > 0) {
        archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, oldData.length, oldData[0].length).setValues(oldData);
      }
      
      // Replace main sheet data with only new data
      sheet.clearContents();
      if (newData.length > 0) {
        sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
      }
      
      results.archived += oldData.length;
      results.sheets[sheetName] = oldData.length;
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      message: `Archived ${results.archived} rows older than ${months} months`,
      details: results
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Permanently delete data older than X months
 * WARNING: This cannot be undone!
 */
function purgeOldData(months) {
  try {
    if (!months || months < 6) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        error: 'Minimum 6 months required for safety'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    const results = { deleted: 0, sheets: {} };
    
    attendanceSheets.forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const headerRow = headers.map(h => String(h).toLowerCase());
      const dateIdx = headerRow.findIndex(h => h.includes('date'));
      
      if (dateIdx === -1) return;
      
      // Keep only new data
      const newData = [headers];
      let deletedCount = 0;
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const dateVal = row[dateIdx];
        let dateStr = '';
        
        if (dateVal instanceof Date) {
          dateStr = dateVal.toISOString().split('T')[0];
        } else if (dateVal) {
          dateStr = String(dateVal).trim();
        }
        
        if (dateStr && dateStr < cutoffStr) {
          deletedCount++;
        } else {
          newData.push(row);
        }
      }
      
      if (deletedCount === 0) return;
      
      // Replace sheet with only new data
      sheet.clearContents();
      if (newData.length > 0) {
        sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
      }
      
      results.deleted += deletedCount;
      results.sheets[sheetName] = deletedCount;
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      message: `Permanently deleted ${results.deleted} rows older than ${months} months`,
      details: results
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Import backup data from Excel file
 * @param {Object} sheetsData - Object with sheet names as keys and 2D arrays as values
 * @param {string} mode - 'merge' to append or 'replace' to clear and replace
 */
function importBackupData(sheetsData, mode) {
  try {
    if (!sheetsData || Object.keys(sheetsData).length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        error: 'No sheets data provided'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = { imported: 0, sheets: {} };
    
    for (const [sheetName, data] of Object.entries(sheetsData)) {
      if (!data || data.length === 0) continue;
      
      // Get or create sheet
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }
      
      // Process data - convert date strings back to dates if needed
      const processedData = data.map(row => 
        row.map(cell => {
          // Try to parse date strings (YYYY-MM-DD or ISO format)
          if (typeof cell === 'string') {
            // ISO date format
            if (/^\d{4}-\d{2}-\d{2}T/.test(cell)) {
              return new Date(cell);
            }
            // Simple date format YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) {
              const parts = cell.split('-');
              return new Date(parts[0], parts[1] - 1, parts[2]);
            }
          }
          return cell;
        })
      );
      
      if (mode === 'replace') {
        // Clear existing content and write new data
        sheet.clearContents();
        if (processedData.length > 0 && processedData[0].length > 0) {
          sheet.getRange(1, 1, processedData.length, processedData[0].length).setValues(processedData);
        }
        results.sheets[sheetName] = { rows: processedData.length, mode: 'replaced' };
      } else {
        // Merge mode - append data (skip header if sheet already has data)
        const existingRows = sheet.getLastRow();
        let dataToAppend = processedData;
        
        // Skip header row if sheet already has data (assuming first row is header)
        if (existingRows > 0 && processedData.length > 1) {
          dataToAppend = processedData.slice(1);
        }
        
        if (dataToAppend.length > 0 && dataToAppend[0].length > 0) {
          const startRow = existingRows > 0 ? existingRows + 1 : 1;
          sheet.getRange(startRow, 1, dataToAppend.length, dataToAppend[0].length).setValues(dataToAppend);
        }
        results.sheets[sheetName] = { rows: dataToAppend.length, mode: 'merged' };
      }
      
      results.imported += (results.sheets[sheetName]?.rows || 0);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      message: `Imported ${results.imported} rows across ${Object.keys(results.sheets).length} sheets`,
      details: results
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
