# Version 1.1 - What's New

## New Features ✨

### 1. Daily Attendance Reminder Notifications
- **Automatic check at 11:30 PM** every night
- **Smart notifications** for pending attendance
- **Specific section names** shown in notification
- **Tap notification** to open app directly

### 2. JavaScript Interface
- Web app can now share data with Android app
- Better integration between web and mobile
- Foundation for future features

---

## Technical Changes

### Added:
- ✅ WorkManager for scheduled background tasks
- ✅ Notification permissions (Android 13+)
- ✅ JavaScript bridge for WebView communication
- ✅ `NotificationHelper.java` class
- ✅ `WebAppInterface.java` class
- ✅ `AttendanceCheckWorker.java` class

### Modified:
- ✅ `MainActivity.java` - Added notification scheduling
- ✅ `AndroidManifest.xml` - Added notification permissions
- ✅ `build.gradle` - Added WorkManager dependency
- ✅ Version: 1.0 → **1.1**

---

## How It Works

```
User fills attendance during the day
           ↓
11:30 PM - App checks sync status
           ↓
If incomplete → Send notification
           ↓
User taps notification → App opens
```

---

## Installing Version 1.1

1. **Uninstall old version** (optional, but recommended)
2. **Install new APK** (`app-debug.apk`)
3. **Grant notification permission** when prompted
4. Done!

---

## For Best Results

Add JavaScript to your web app - see `WEB_APP_INTEGRATION.md`

**Without web integration:**
- Generic notification: "You haven't filled today's attendance"

**With web integration:**
- Specific notification: "You haven't filled attendance for Yoga, Mess Day"

---

## Known Limitations

- Requires internet at 11:30 PM to check status
- Notification permission required (Android 13+)
- Works best with web app integration

---

## Roadmap (Future Features)

Coming in version 1.2:
- ⏳ Previous day attendance update
- ⏳ Update Attendance button in Sync Tracker
- ⏳ Offline attendance data sync

---

**Build Date:** 27 January 2026  
**Version Code:** 2  
**Package:** com.vssnagar.attendance
