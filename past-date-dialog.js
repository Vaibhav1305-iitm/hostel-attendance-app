// ========================================
// SMART PAST DATE DIALOG
// ========================================

// Show smart dialog based on database status
async function showPastDateDialog(date, category, hasData) {
    const overlay = document.createElement('div');
    overlay.id = 'pastDateDialogOverlay';
    overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: fadeIn 0.2s ease;
            `;

    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
                background: var(--md-sys-color-surface);
                border-radius: 24px;
                padding: 24px;
                max-width: 400px;
                width: 100%;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
                animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
            `;

    if (hasData) {
        // Dialog WITH DATA - View Only, Update, X icon
        dialog.innerHTML = `
                    <button onclick="closePastDateDialog()" style="
                        position: absolute;
                        top: 16px;
                        right: 16px;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        border: none;
                        background: rgba(142, 142, 147, 0.18);
                        color: var(--md-sys-color-on-surface);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
                    </button>
                    
                    <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: var(--md-sys-color-on-surface);">
                        Past Date Selected
                    </h3>
                    <p style="margin: 0 0 24px 0; color: var(--md-sys-color-on-surface-variant); font-size: 15px; line-height: 1.5;">
                        ${category} attendance for <strong>${formattedDate}</strong> was already submitted to database.
                    </p>
                    
                    <div style="display: flex; gap: 12px;">
                        <button onclick="handleViewOnly()" style="
                            flex: 1;
                            padding: 14px 20px;
                            border-radius: 12px;
                            border: 1px solid var(--md-sys-color-primary);
                            background: transparent;
                            color: var(--md-sys-color-primary);
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            font-family: inherit;
                            transition: all 0.2s;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 20px;">visibility</span>
                            View Only
                        </button>
                        <button onclick="handleUpdate()" style="
                            flex: 1;
                            padding: 14px 20px;
                            border-radius: 12px;
                            border: none;
                            background: var(--md-sys-color-primary);
                            color: white;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            font-family: inherit;
                            transition: all 0.2s;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 20px;">edit</span>
                            Update
                        </button>
                    </div>
                `;
    } else {
        // Dialog WITHOUT DATA - Update, Cancel
        dialog.innerHTML = `
                    <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: var(--md-sys-color-on-surface);">
                        Update Past Date
                    </h3>
                    <p style="margin: 0 0 24px 0; color: var(--md-sys-color-on-surface-variant); font-size: 15px; line-height: 1.5;">
                        No ${category} attendance found for <strong>${formattedDate}</strong> in database. Do you want to create it?
                    </p>
                    
                    <div style="display: flex; gap: 12px;">
                        <button onclick="closePastDateDialog()" style="
                            flex: 1;
                            padding: 14px 20px;
                            border-radius: 12px;
                            border: 1px solid rgba(142, 142, 147, 0.3);
                            background: transparent;
                            color: var(--md-sys-color-on-surface);
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            font-family: inherit;
                            transition: all 0.2s;
                        ">
                            Cancel
                        </button>
                        <button onclick="handleUpdate()" style="
                            flex: 1;
                            padding: 14px 20px;
                            border-radius: 12px;
                            border: none;
                            background: var(--md-sys-color-primary);
                            color: white;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            font-family: inherit;
                            transition: all 0.2s;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 20px;">edit</span>
                            Update
                        </button>
                    </div>
                `;
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
    });
}

function closePastDateDialog() {
    const overlay = document.getElementById('pastDateDialogOverlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => overlay.remove(), 200);
    }
}

function handleViewOnly() {
    closePastDateDialog();
    fetchAndViewPastData(true);
}

function handleUpdate() {
    closePastDateDialog();
    fetchAndViewPastData(false);
}

// Trigger dialog when past date is selected
async function handleMainDateChange() {
    const dateInput = document.getElementById('mainAttendanceDate');
    if (!dateInput) return;

    const newDate = dateInput.value;
    if (!newDate) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // If past date, check database and show dialog
    if (newDate < today) {
        try {
            const syncStatus = await checkServerSyncStatus(newDate, currentCategory);
            const hasData = syncStatus && syncStatus.status === 'submitted' && syncStatus.recordCount > 0;

            showPastDateDialog(newDate, currentCategory, hasData);
        } catch (err) {
            console.error('Failed to check sync status:', err);
            showPastDateDialog(newDate, currentCategory, false);
        }
    } else {
        // Today or future - just load normally
        ensureCategoryAttendance(currentCategory);
        attendance = attendanceByCategory[currentCategory];
        renderStudentList();
        updateFetchButtonVisibility();
        handleSyncStatusCheck();
    }
}
