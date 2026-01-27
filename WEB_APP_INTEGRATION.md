# Web App Integration Guide

## For Enabling Notification Data Sharing

To make the Android app's notification system work, you need to add a small JavaScript code to your web app.

---

## What to Add

### Add this JavaScript code to your Sync Tracker page:

```javascript
// Add this inside index.html or your sync tracker page
<script>
// Function to share sync status with Android app
function shareSyncStatusWithAndroid() {
    try {
        // Check if running in Android WebView
        if (typeof Android !== 'undefined') {
            
            // Create sync status object
            // true = attendance filled (tick mark present)
            // false = attendance NOT filled (no tick mark)
            let syncStatus = {
                yoga: checkIfSectionComplete('yoga'),
                messDay: checkIfSectionComplete('messDay'),
                messNight: checkIfSectionComplete('messNight'),
                nightShift: checkIfSectionComplete('nightShift')
            };
            
            // Send to Android app
            Android.receiveSyncData(JSON.stringify(syncStatus));
            console.log('Sync data sent to Android:', syncStatus);
        }
    } catch (e) {
        console.error('Error sharing sync data:', e);
    }
}

// Helper function to check if section is complete for today
function checkIfSectionComplete(sectionName) {
    // YOUR LOGIC HERE - Example:
    // Check if today's row has a tick mark for this section
    // Return true if tick mark exists, false otherwise
    
    // Example implementation (modify based on your HTML structure):
    let todayRow = document.querySelector('tr.today');  // Adjust selector
    if (!todayRow) return false;
    
    let sectionCell = todayRow.querySelector(`.${sectionName}`);  // Adjust selector
    if (!sectionCell) return false;
    
    // Check if tick mark (✓) is present
    return sectionCell.textContent.includes('✓') || sectionCell.querySelector('.checkmark');
}

// Call this function when sync tracker loads
document.addEventListener('DOMContentLoaded', function() {
    shareSyncStatusWithAndroid();
    
    // Also call it whenever sync status changes
    // For example, after filling attendance
});
</script>
```

---

## How It Works

1. **Android app opens** your web app
2. **Sync Tracker page loads**
3. **JavaScript runs** and checks which sections are complete
4. **Data is sent** to Android via `Android.receiveSyncData()`
5. **At 11:30 PM**, Android checks this data
6. **If incomplete**, notification is sent

---

## Important Notes

### Section Names
The section names in JavaScript **must match** what's in the Android code:
- `yoga` → "Yoga"
- `messDay` → "Mess Day"  
- `messNight` → "Mess Night"
- `nightShift` → "Night Shift"

### Your Implementation
You need to modify `checkIfSectionComplete()` based on YOUR HTML structure:
- How do you show tick marks?
- What CSS classes/IDs do you use?
- How is today's row identified?

---

## Testing

### In Browser (Desktop)
Open console (F12) and check for:
- ✅ `"Sync data sent to Android: {yoga: true, ...}"`
- ❌ Any errors?

### In Android App
1. Open app
2. Check Android Studio Logcat
3. Look for: `"Received sync data from web app: {...}"`

---

## Example for Your Sync Tracker

Based on the screenshot you showed earlier, here's a custom version:

```javascript
function checkIfSectionComplete(sectionName) {
    // Get today's date
    let today = new Date();
    let todayStr = today.toLocaleDateString(); // Adjust format as needed
    
    // Find today's row in sync tracker table
    let rows = document.querySelectorAll('table tbody tr');
    let todayRow = null;
    
    for (let row of rows) {
        let dateCell = row.querySelector('td:first-child'); // First column is date
        if (dateCell && dateCell.textContent.includes('Today')) {
            todayRow = row;
            break;
        }
    }
    
    if (!todayRow) return false;
    
    // Map section names to column indices (adjust based on your table)
    let columnMap = {
        'yoga': 1,        // 2nd column
        'messDay': 2,     // 3rd column
        'messNight': 3,   // 4th column
        'nightShift': 4   // 5th column
    };
    
    let columnIndex = columnMap[sectionName];
    if (!columnIndex) return false;
    
    let cell = todayRow.querySelectorAll('td')[columnIndex];
    
    // Check if checkmark (✓) is present
    return cell && cell.textContent.trim() === '✓';
}
```

---

## Without Web Modification (Fallback)

If you can't modify the web app, the Android app will still work:
- It will send a **generic notification**: "You haven't filled today's attendance"
- To get **specific section names**, you MUST add the JavaScript above

---

## Need Help?

1. Share your sync tracker HTML structure
2. I'll create the exact JavaScript code for you
3. Just copy-paste it!

---

**Status:** Optional but recommended for best experience
**Effort:** 5-10 minutes
**Benefit:** Notifications show exact section names
