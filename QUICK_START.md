# 🚀 Quick Start Guide

## For Complete Beginners - 5 Minute Version

### What You Have Now
✅ A complete Android app project  
✅ All code files created  
✅ App icon configured  
✅ Splash screen ready  
✅ WebView app ready  

### What You Need to Do

#### 1️⃣ Install Android Studio
- Download from: https://developer.android.com/studio
- Install it (takes 20-30 minutes)

#### 2️⃣ Open the Project
- Open Android Studio
- Click "Open"
- Select: `E:\Coding Files\Apps Code\VSS-Nagar_Attendance(Main)`
- Wait for "Gradle Sync" to finish

#### 3️⃣ Add Your URL ⚠️ IMPORTANT
- Open: `app/src/main/java/com/vssnagar/attendance/MainActivity.java`
- Find line 24
- Replace `YOUR_SCRIPT_ID_HERE` with your Google Apps Script URL
- Save (Ctrl + S)

#### 4️⃣ Build APK
- Click: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
- Wait for "APK generated successfully"
- Find APK at: `app/build/outputs/apk/debug/app-debug.apk`

#### 5️⃣ Install on Phone
- Copy APK to phone
- Tap it
- Install
- Done!

---

## 📝 What to Change Before Building

### MUST CHANGE:
```java
// File: MainActivity.java, Line 24
private static final String WEB_APP_URL = "YOUR_ACTUAL_URL_HERE";
```

### OPTIONAL CHANGES:

**App Name:**
```xml
<!-- File: res/values/strings.xml -->
<string name="app_name">Your App Name</string>
```

**Splash Background Color:**
```xml
<!-- File: res/values/colors.xml -->
<color name="splash_background">#1976D2</color>
```

**Version:**
```gradle
// File: app/build.gradle
versionCode 1        // Increment for updates: 2, 3, 4...
versionName "1.0"    // Display version: "1.1", "2.0"
```

---

## 🎯 Build Commands

### Using Android Studio (Easy)
`Build → Build Bundle(s) / APK(s) → Build APK(s)`

### Using Command Line (Advanced)
```bash
cd "E:\Coding Files\Apps Code\VSS-Nagar_Attendance(Main)"
.\gradlew assembleDebug
```

APK Location: `app\build\outputs\apk\debug\app-debug.apk`

---

## ✅ Testing Checklist

When you install the app, verify:
- [ ] Splash screen shows for 2 seconds
- [ ] Your web app loads
- [ ] All buttons/forms work
- [ ] Links open in app (not external browser)
- [ ] Back button navigates back
- [ ] Exit dialog appears on home screen
- [ ] "No internet" message when offline

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Gradle sync failed | Enable internet, restart Android Studio |
| Can't install APK | Enable "Unknown sources" in phone settings |
| Blank screen in app | Check URL in MainActivity.java |
| Build failed | Clean Project, then Rebuild Project |

---

## 📂 Key Files

```
MainActivity.java        ← Main app code (EDIT URL HERE)
strings.xml             ← App name and text
colors.xml              ← App colors
build.gradle (app)      ← Version numbers
AndroidManifest.xml     ← Permissions & config
```

---

## 💡 Remember

⚠️ **Change the URL before building!**  
💾 **Save all files (Ctrl + S)**  
⏳ **Wait for Gradle sync**  
📱 **Test on real phone first**  

---

**Full guide:** See `README.md` for detailed explanations
