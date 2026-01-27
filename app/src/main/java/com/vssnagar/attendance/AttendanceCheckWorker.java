package com.vssnagar.attendance;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Iterator;

/**
 * AttendanceCheckWorker
 * Background task that runs daily at 11:30 PM
 * Checks if attendance is complete and sends notifications if needed
 */
public class AttendanceCheckWorker extends Worker {

    private static final String TAG = "AttendanceCheckWorker";

    public AttendanceCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "AttendanceCheckWorker started - checking attendance status");

        try {
            // Get sync status from WebAppInterface
            String syncData = WebAppInterface.getLatestSyncStatus();
            
            if (syncData == null || syncData.isEmpty()) {
                Log.d(TAG, "No sync data available yet");
                // If no data, we'll send a generic reminder
                sendGenericReminder();
                return Result.success();
            }

            // Parse JSON and find incomplete sections
            ArrayList<String> incompleteSections = parseIncompleteSections(syncData);

            if (incompleteSections.size() > 0) {
                // Send notification for incomplete sections
                sendNotificationForIncompleteSections(incompleteSections);
                Log.d(TAG, "Sent notification for " + incompleteSections.size() + " incomplete sections");
            } else {
                Log.d(TAG, "All sections complete - no notification needed");
            }

            return Result.success();

        } catch (Exception e) {
            Log.e(TAG, "Error in AttendanceCheckWorker: " + e.getMessage());
            e.printStackTrace();
            return Result.retry();
        }
    }

    /**
     * Parse JSON sync data and extract incomplete sections
     */
    private ArrayList<String> parseIncompleteSections(String jsonData) {
        ArrayList<String> incomplete = new ArrayList<>();

        try {
            JSONObject json = new JSONObject(jsonData);
            Iterator<String> keys = json.keys();

            while (keys.hasNext()) {
                String key = keys.next();
                boolean isComplete = json.getBoolean(key);
                
                if (!isComplete) {
                    // Convert key to readable name
                    String readableName = convertToReadableName(key);
                    incomplete.add(readableName);
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Error parsing sync data: " + e.getMessage());
        }

        return incomplete;
    }

    /**
     * Convert JSON keys to user-friendly names
     */
    private String convertToReadableName(String key) {
        switch (key.toLowerCase()) {
            case "yoga":
                return "Yoga";
            case "messday":
            case "mess_day":
                return "Mess Day";
            case "messnight":
            case "mess_night":
                return "Mess Night";
            case "nightshift":
            case "night_shift":
                return "Night Shift";
            default:
                return key; // Return as-is if unknown
        }
    }

    /**
     * Send notification for incomplete sections
     */
    private void sendNotificationForIncompleteSections(ArrayList<String> sections) {
        NotificationHelper notificationHelper = new NotificationHelper(getApplicationContext());
        
        if (sections.size() == 1) {
            notificationHelper.sendSingleSectionReminder(sections.get(0));
        } else {
            String[] sectionsArray = sections.toArray(new String[0]);
            notificationHelper.sendMultipleSectionReminder(sectionsArray);
        }
    }

    /**
     * Send a generic reminder when sync data is not available
     */
    private void sendGenericReminder() {
        NotificationHelper notificationHelper = new NotificationHelper(getApplicationContext());
        notificationHelper.sendSingleSectionReminder("today's attendance");
    }
}
