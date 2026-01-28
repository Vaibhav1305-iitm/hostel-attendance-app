// ========================================
// View Only / Edit Past Records Functions
// ========================================

// Fetch and display past attendance data
async function fetchAndViewPastData(viewOnlyMode) {
    const date = document.getElementById('attendanceDate').value;
    const category = currentCategory;

    if (!date) {
        showIOSToast('Please select a date', 'error', 2000);
        return;
    }

    showIOSLoading(`Loading ${category} data...`);

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "fetch_category_data",
                date: date,
                category: category
            })
        });
        const json = await res.json();
        hideIOSLoading();

        if (json.result === 'success' && json.data && json.data.length > 1) {
            // Parse and populate attendance
            const rows = json.data;
            const headers = rows[0];
            const nameIdx = headers.indexOf('Full Name');
            const statusIdx = headers.indexOf('Status');

            if (nameIdx !== -1 && statusIdx !== -1) {
                ensureCategoryAttendance(category);
                let count = 0;
                for (let i = 1; i < rows.length; i++) {
                    const name = rows[i][nameIdx];
                    const status = rows[i][statusIdx];
                    if (name && ['Present', 'Absent', 'Leave'].includes(status)) {
                        attendanceByCategory[category][name] = status;
                        count++;
                    }
                }

                if (!loadedFromSheets[date]) loadedFromSheets[date] = {};
                loadedFromSheets[date][category] = true;
                markAsSynced(date, category);

                attendance = attendanceByCategory[currentCategory];
                renderStudentList();

                // Apply read-only mode if View Only
                if (viewOnlyMode) {
                    document.body.classList.add('attendance-readonly');
                    showIOSToast(`📖 Viewing ${count} records (Read-Only)`, 'info', 3000);
                } else {
                    // Edit mode - allow editing
                    allowPastDateEdit = true;
                    document.body.classList.remove('attendance-readonly');
                    showIOSToast(`✏️ Loaded ${count} records for editing`, 'success', 3000);

                    // Reset edit flag after 10 minutes
                    setTimeout(() => {
                        allowPastDateEdit = false;
                    }, 600000);
                }
            } else {
                showIOSToast('Invalid data format from database', 'error', 3000);
            }
        } else if (json.result === 'success') {
            showIOSToast(`No ${category} data found for ${date}`, 'warning', 3000);
        } else {
            showIOSToast(`Fetch Failed: ${json.error || 'Unknown error'}`, 'error', 3000);
        }
    } catch (e) {
        hideIOSLoading();
        showIOSToast(`Network Error: ${e.message}`, 'error', 3000);
    }
}

// Update button visibility based on date and database status
async function updatePastRecordButtonsVisibility() {
    const btnContainer = document.getElementById('pastRecordBtns');
    if (!btnContainer) return;

    const date = document.getElementById('attendanceDate').value;
    if (!date || !currentCategory) {
        btnContainer.style.display = 'none';
        return;
    }

    // Get today's date
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Only show for past dates
    if (date >= today) {
        btnContainer.style.display = 'none';
        return;
    }

    // Check if database has data for this date/category
    try {
        const syncStatus = await checkServerSyncStatus(date, currentCategory);

        if (syncStatus && syncStatus.status === 'submitted' && syncStatus.recordCount > 0) {
            // Database has data - show buttons
            btnContainer.style.display = 'inline-flex';
        } else {
            // No data in database
            btnContainer.style.display = 'none';
        }
    } catch (err) {
        console.error('Button visibility check failed:', err);
        btnContainer.style.display = 'none';
    }
}
