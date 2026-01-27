# How to Add "Update" Button to Sync Tracker

## ⚠️ IMPORTANT: This is for your GitHub Pages site

Your Sync Tracker is on the GitHub Pages site. You need to add the Update button there.

---

## Step 1: Add Update Button Code

Find the part in your GitHub Pages code where the Sync Tracker table is generated (where it shows ✓ or ○ for each day).

Add this code to create the "Update" button for incomplete dates:

```javascript
// In the Sync Tracker table rendering code
// Where you create each row for a date

function renderSyncTrackerRow(date, yogaComplete, messDayComplete, messNightComplete, nightShiftComplete) {
    const isToday = date === getTodayDate();
    const row = document.createElement('tr');
    
    // Date cell
    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(date);
    if (isToday) dateCell.innerHTML += ' (Today)';
    row.appendChild(dateCell);
    
    // For each section
    const sections = [
        {name: 'Yoga', isComplete: yogaComplete},
        {name: 'Mess Day', isComplete: messDayComplete},
        {name: 'Mess Night', isComplete: messNightComplete},
        {name: 'Night Shift', isComplete: nightShiftComplete}
    ];
    
    let allComplete = true;
    const incompleteSections = [];
    
    sections.forEach(section => {
        const cell = document.createElement('td');
        cell.textContent = section.isComplete ? '✓' : '○';
        cell.style.color = section.isComplete ? '#34C759' : '#FF9500';
        row.appendChild(cell);
        
        if (!section.isComplete && !isToday) {
            allComplete = false;
            incompleteSections.push(section.name);
        }
    });
    
    // All complete cell
    const allCell = document.createElement('td');
    allCell.textContent = allComplete ? '✓' : '○';
    allCell.style.color = allComplete ? '#34C759' : '#FF9500';
    row.appendChild(allCell);
    
    // ADD UPDATE BUTTON FOR INCOMPLETE PAST DATES
    if (!isToday && incompleteSections.length > 0) {
        const actionCell = document.createElement('td');
        
        incompleteSections.forEach((section, index) => {
            const updateBtn = document.createElement('button');
            updateBtn.textContent = `Update ${section}`;
            updateBtn.style.cssText = `
                padding: 6px 12px;
                margin: 2px;
                border-radius: 8px;
                border: none;
                background: linear-gradient(135deg, #007AFF, #5856D6);
                color: white;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
            `;
            
            // Call the parent window function (your main app)
            updateBtn.onclick = () => {
                if (window.parent && window.parent.updatePresenty) {
                    window.parent.updatePresenty(date, section);
                } else {
                    alert(`Update ${section} for ${date}`);
                }
            };
            
            actionCell.appendChild(updateBtn);
        });
        
        row.appendChild(actionCell);
    }
    
    return row;
}
```

---

## Step 2: Alternative - Simple JavaScript Snippet

If you can't modify the GitHub Pages code easily, add this JavaScript at the bottom of your GitHub Pages HTML:

```html
<script>
// Add "Update" buttons to incomplete dates in Sync Tracker
document.addEventListener('DOMContentLoaded', function() {
    const trackerBody = document.getElementById('syncTrackerBody');
    if (!trackerBody) return;
    
    const rows = trackerBody.querySelectorAll('tr');
    const today = new Date().toLocaleDateString();
    
    rows.forEach(row => {
        const dateCell = row.querySelector('td:first-child');
        if (!dateCell) return;
        
        const dateText = dateCell.textContent.trim();
        const isToday = dateText.includes('Today');
        
        if (!isToday) {
            const cells = row.querySelectorAll('td');
            const sections = ['Yoga', 'Mess Day', 'Mess Night', 'Night Shift'];
            const incompleteSections = [];
            
            // Check which sections are incomplete (○ symbol)
            cells.forEach((cell, index) => {
                if (index > 0 && index < 5 && cell.textContent.includes('○')) {
                    incompleteSections.push(sections[index - 1]);
                }
            });
            
            // Add Update button if there are incomplete sections
            if (incompleteSections.length > 0) {
                incompleteSections.forEach(section => {
                    const btn = document.createElement('button');
                    btn.textContent = `✏️ ${section}`;
                    btn.style.cssText = 'padding:4px 8px; margin:2px; border-radius:6px; border:none; background:#007AFF; color:white; font-size:10px; cursor:pointer;';
                    btn.onclick = () => {
                        const dateMatch = dateText.match(/\d+ \w+/);
                        const dateStr = dateMatch ? convertToISODate(dateMatch[0]) : '';
                        if (window.parent && window.parent.updatePresenty) {
                            window.parent.updatePresenty(dateStr, section);
                        }
                    };
                    row.appendChild(btn);
                });
            }
        }
    });
});

function convertToISODate(dateStr) {
    // Convert "27 Jan" to "2026-01-27"
    const months = {'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12};
    const parts = dateStr.split(' ');
    const day = parts[0];
    const month = months[parts[1]];
    const year = new Date().getFullYear();
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
</script>
```

---

## Testing

1. **Update your web app** (push changes to GitHub Pages)
2. **Open Sync Tracker**
3. **Look for dates with ○ (incomplete)**
4. **Click "Update [Section]" button**
5. **App should load that date and section**
6. **Fill attendance and sync**
7. **Check Sync Tracker** - should now show ✓

---

## If You Can't Modify GitHub Pages

Just tell me and I'll create a simpler solution that works entirely within the Android app!

For now, the main app already has the `updatePresenty()` function ready to receive calls from Sync Tracker.
