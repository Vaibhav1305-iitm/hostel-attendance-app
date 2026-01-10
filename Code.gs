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
      return getStudents();
    } else if (json.action === "add_student") {
      return addStudent(json.student);
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

  for (const [sheetName, rows] of Object.entries(batches)) {
    if (!rows || !rows.length) continue;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return ContentService.createTextOutput(JSON.stringify({ result: 'success' })).setMimeType(ContentService.MimeType.JSON);
}

function handleFetchReport(dateStr) {
  if (!dateStr) return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'No date provided' })).setMimeType(ContentService.MimeType.JSON);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportData = {};
  const sheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const data = sheet.getDataRange().getDisplayValues(); // Get values as strings
      if (data.length > 1) {
        // Filter by Date (Index 8 is 'Date' column based on our known structure)
        const headers = data[0];
        const dateIndex = headers.indexOf('Date');
        
        if (dateIndex !== -1) {
            const filtered = data.filter((row, i) => i === 0 || row[dateIndex] === dateStr);
            if (filtered.length > 1) { // If has more than just headers
                 reportData[sheetName] = filtered;
            }
        }
      }
    }
  });
  

  return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: reportData })).setMimeType(ContentService.MimeType.JSON);
}

function calculateTrackingData(startDateStr, endDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheets = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
  const warnings = [];

  // Date filter strings are used directly for comparison (avoids timezone issues)

  // Get all students from Students sheet first
  const studentsSheet = ss.getSheetByName('Students');
  const allStudents = {};
  
  if (studentsSheet) {
    const studentsData = studentsSheet.getDataRange().getValues();
    for (let i = 1; i < studentsData.length; i++) {
      const name = studentsData[i][0];
      if (name) {
        const nameKey = String(name).trim().toLowerCase();
        // Initialize tracking for each category
        attendanceSheets.forEach(cat => {
          const key = `${nameKey}_${cat}`;
          allStudents[key] = {
            name: String(name).trim(),
            id: studentsData[i][1] || studentsData[i][2] || '',
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
    }
  }

  // Process each attendance sheet
  attendanceSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    // Use getDisplayValues to get exact strings as shown in sheet (no Date conversion)
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return;

    // Find column indices
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const getIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const pName = getIdx(['full name', 'name']);
    const pStatus = getIdx(['status']);
    const pDate = getIdx(['date', 'timestamp']);

    if (pName === -1 || pStatus === -1 || pDate === -1) return;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rawName = row[pName];
      const status = row[pStatus];
      const rawDate = String(row[pDate]).trim();
      
      if (!rawName || !rawDate) continue;
      const nameKey = String(rawName).trim().toLowerCase();

      // Parse date string - try multiple formats
      let dateStr = '';
      
      // Format: YYYY-MM-DD (ISO)
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        dateStr = rawDate;
      }
      // Format: MM/DD/YYYY or M/D/YYYY (US format from Sheets)
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
        const parts = rawDate.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        dateStr = `${parts[2]}-${month}-${day}`;
      }
      // Format: DD/MM/YYYY or D/M/YYYY (Indian format)
      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(rawDate)) {
        const parts = rawDate.split('-');
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        dateStr = `${parts[2]}-${month}-${day}`;
      }
      // Try parsing as Date object as fallback
      else {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
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

      const key = `${nameKey}_${sheetName}`;

      // Create entry if not exists (for students in attendance but not in Students sheet)
      if (!allStudents[key]) {
        allStudents[key] = {
          name: String(rawName).trim(),
          id: '',
          category: sheetName,
          present: 0,
          absent: 0,
          leave: 0,
          total: 0,
          presentDates: [],
          absentDates: [],
          leaveDates: []
        };
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

function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('calculateTrackingData')
      .timeBased()
      .everyDays(1)
      .atHour(1)
      .create();
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
