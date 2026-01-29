package com.vssnagar.attendance;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * WebAppInterface
 * Bridge between Android app and web app JavaScript
 * Handles file downloads and attendance status communication
 */
public class WebAppInterface {
    
    private Context context;
    private static final String TAG = "WebAppInterface";
    
    // Store the latest sync status received from web app
    private static String latestSyncStatus = "";

    public WebAppInterface(Context context) {
        this.context = context;
    }

    /**
     * Called by web app JavaScript to send sync status to Android
     * Expected format: JSON string like:
     * {"yoga": true, "messDay": false, "messNight": true, "nightShift": false}
     */
    @JavascriptInterface
    public void receiveSyncData(String jsonData) {
        latestSyncStatus = jsonData;
        Log.d(TAG, "Received sync data from web app: " + jsonData);
    }

    /**
     * Get the latest sync status
     * Called by AttendanceCheckWorker to determine incomplete sections
     */
    public static String getLatestSyncStatus() {
        return latestSyncStatus;
    }

    /**
     * Request web app to send current sync status
     * This can be called by Android to trigger data sharing
     */
    @JavascriptInterface
    public void requestSyncStatus() {
        Log.d(TAG, "Requesting sync status from web app");
        // Web app should listen and respond with receiveSyncData()
    }

    /**
     * Download file from Base64 data
     * Called by JavaScript when user wants to download a file
     * @param base64Data The file content as Base64 string
     * @param fileName The desired file name
     * @param mimeType The MIME type of the file
     */
    @JavascriptInterface
    public void downloadFile(String base64Data, String fileName, String mimeType) {
        Log.d(TAG, "Download requested: " + fileName + " (" + mimeType + ")");
        
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                // Decode base64 data
                byte[] fileData = Base64.decode(base64Data, Base64.DEFAULT);
                
                // Get Downloads directory
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs();
                }
                
                // Create unique filename with timestamp
                String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
                String uniqueFileName = addTimestampToFileName(fileName, timestamp);
                
                File outputFile = new File(downloadsDir, uniqueFileName);
                
                // Write file
                FileOutputStream fos = new FileOutputStream(outputFile);
                fos.write(fileData);
                fos.close();
                
                // Show success message
                showToast("✓ File saved to Downloads:\n" + uniqueFileName);
                
                Log.d(TAG, "File saved successfully: " + outputFile.getAbsolutePath());
                
            } catch (Exception e) {
                Log.e(TAG, "Error saving file: " + e.getMessage(), e);
                showToast("Error saving file: " + e.getMessage());
            }
        });
    }

    /**
     * Download file with simple approach - saves to app's external files directory
     * This method doesn't require storage permissions on Android 10+
     */
    @JavascriptInterface
    public void downloadFileSimple(String base64Data, String fileName, String mimeType) {
        Log.d(TAG, "Simple download requested: " + fileName);
        
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                // Decode base64 data
                byte[] fileData = Base64.decode(base64Data, Base64.DEFAULT);
                
                // Use app's external files directory (no permissions needed)
                File downloadsDir = new File(context.getExternalFilesDir(null), "Downloads");
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs();
                }
                
                // Create unique filename
                String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
                String uniqueFileName = addTimestampToFileName(fileName, timestamp);
                
                File outputFile = new File(downloadsDir, uniqueFileName);
                
                // Write file
                FileOutputStream fos = new FileOutputStream(outputFile);
                fos.write(fileData);
                fos.close();
                
                // Show success message
                showToast("✓ File saved:\n" + uniqueFileName);
                
                // Try to open the file
                openFile(outputFile, mimeType);
                
            } catch (Exception e) {
                Log.e(TAG, "Error saving file: " + e.getMessage(), e);
                showToast("Error: " + e.getMessage());
            }
        });
    }

    /**
     * Add timestamp to filename
     */
    private String addTimestampToFileName(String fileName, String timestamp) {
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
            return fileName.substring(0, dotIndex) + "_" + timestamp + fileName.substring(dotIndex);
        }
        return fileName + "_" + timestamp;
    }

    /**
     * Show toast message on UI thread
     */
    private void showToast(String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show();
        });
    }

    /**
     * Open file using default app
     */
    private void openFile(File file, String mimeType) {
        try {
            Uri contentUri = FileProvider.getUriForFile(context, 
                context.getPackageName() + ".fileprovider", file);
            
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Could not open file: " + e.getMessage());
        }
    }
}
