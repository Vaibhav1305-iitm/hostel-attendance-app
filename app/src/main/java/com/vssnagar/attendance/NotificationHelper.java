package com.vssnagar.attendance;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * NotificationHelper
 * Manages all notification-related functionality
 * Creates notification channels and sends attendance reminders
 */
public class NotificationHelper {

    private static final String CHANNEL_ID = "attendance_reminders";
    private static final String CHANNEL_NAME = "Attendance Reminders";
    private static final String CHANNEL_DESCRIPTION = "Daily reminders for pending attendance";
    private static final int NOTIFICATION_ID = 1001;

    private Context context;
    private NotificationManagerCompat notificationManager;

    public NotificationHelper(Context context) {
        this.context = context;
        this.notificationManager = NotificationManagerCompat.from(context);
        createNotificationChannel();
    }

    /**
     * Create notification channel (required for Android 8.0+)
     */
    private void createNotificationChannel() {
        // Only create channel on Android 8.0 (API 26) and above
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH // High importance for reminders
            );
            channel.setDescription(CHANNEL_DESCRIPTION);
            channel.enableVibration(true);
            channel.enableLights(true);

            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Send notification for a single pending section
     */
    public void sendSingleSectionReminder(String sectionName) {
        String title = "Attendance Reminder";
        String message = "You haven't filled attendance for " + sectionName;
        sendNotification(title, message);
    }

    /**
     * Send notification for multiple pending sections
     */
    public void sendMultipleSectionReminder(String[] sections) {
        String title = "Attendance Reminder";
        String message;

        if (sections.length == 1) {
            message = "You haven't filled attendance for " + sections[0];
        } else {
            // Create comma-separated list
            StringBuilder sb = new StringBuilder("Pending attendance for: ");
            for (int i = 0; i < sections.length; i++) {
                sb.append(sections[i]);
                if (i < sections.length - 1) {
                    sb.append(", ");
                }
            }
            message = sb.toString();
        }

        sendNotification(title, message);
    }

    /**
     * Send the actual notification
     */
    private void sendNotification(String title, String message) {
        // Create intent to open MainActivity when notification is tapped
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // Build the notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // Default icon
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message)) // Show full text
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true) // Dismiss when tapped
            .setContentIntent(pendingIntent)
            .setVibrate(new long[]{0, 500, 200, 500}); // Vibration pattern

        // Send the notification
        try {
            notificationManager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Permission not granted - handle silently
            e.printStackTrace();
        }
    }

    /**
     * Check if notification permission is granted (Android 13+)
     */
    public boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return notificationManager.areNotificationsEnabled();
        }
        return true; // Pre-Android 13 doesn't require runtime permission
    }
}
