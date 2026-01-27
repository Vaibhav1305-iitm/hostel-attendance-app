package com.vssnagar.attendance;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.util.Log;

/**
 * WebAppInterface
 * Bridge between Android app and web app JavaScript
 * Allows web app to communicate attendance status to Android
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
}
