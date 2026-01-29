package com.vssnagar.attendance;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * Main Activity
 * This activity loads your Google Apps Script web app in a WebView.
 * Downloads are handled via JavaScript interface (WebAppInterface).
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private TextView noInternetText;
    private static final int NOTIFICATION_PERMISSION_CODE = 100;
    private static final int STORAGE_PERMISSION_CODE = 101;

    // Your GitHub Pages hosted web app URL
    private static final String WEB_APP_URL = "https://vaibhav1305-iitm.github.io/hostel-attendance-app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Find the WebView from the layout file
        webView = findViewById(R.id.webView);
        noInternetText = findViewById(R.id.noInternetText);

        // Request permissions
        requestNotificationPermission();
        requestStoragePermission();

        // Schedule daily attendance check at 11:30 PM
        scheduleDailyAttendanceCheck();

        // Check if internet is available
        if (isInternetAvailable()) {
            // Internet is available, load the web app
            setupWebView();
            loadWebApp();
        } else {
            // No internet, show error message
            showNoInternetMessage();
        }
    }

    /**
     * Set up WebView settings
     * This configures how the WebView behaves
     */
    private void setupWebView() {
        WebSettings webSettings = webView.getSettings();
        
        // Enable JavaScript (required for your Google Apps Script to work)
        webSettings.setJavaScriptEnabled(true);
        
        // Allow DOM storage (sometimes needed for web apps)
        webSettings.setDomStorageEnabled(true);
        
        // Enable zoom controls (optional - you can remove if you don't want zoom)
        webSettings.setBuiltInZoomControls(true);
        webSettings.setDisplayZoomControls(false); // Hide the zoom buttons
        
        // Make the WebView fit the screen properly
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        
        // Allow mixed content (http in https)
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Add JavaScript Interface for communication with web app
        // This is how the web app can send download data to Android
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");

        // Set WebChromeClient for better JavaScript support
        webView.setWebChromeClient(new WebChromeClient());

        // This makes sure all links open INSIDE the app, not in external browser
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Load the URL in the same WebView
                view.loadUrl(url);
                return true;
            }
            
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject download helper script after page loads
                injectDownloadHelper();
            }
        });
    }

    /**
     * Inject JavaScript helper to intercept downloads and route them through Android interface
     */
    private void injectDownloadHelper() {
        String js = "javascript:(function() {" +
            // Check if Android interface exists
            "if (typeof Android === 'undefined') { console.log('Android interface not found'); return; }" +
            
            // Override the default download behavior for anchor tags with download attribute
            "document.addEventListener('click', function(e) {" +
            "  var anchor = e.target.closest('a[download]');" +
            "  if (anchor && anchor.href && anchor.href.startsWith('blob:')) {" +
            "    e.preventDefault();" +
            "    e.stopPropagation();" +
            "    var fileName = anchor.download || 'download';" +
            "    fetch(anchor.href).then(r => r.blob()).then(blob => {" +
            "      var reader = new FileReader();" +
            "      reader.onloadend = function() {" +
            "        var base64 = reader.result.split(',')[1];" +
            "        var mimeType = blob.type || 'application/octet-stream';" +
            "        Android.downloadFileSimple(base64, fileName, mimeType);" +
            "      };" +
            "      reader.readAsDataURL(blob);" +
            "    }).catch(function(err) { console.log('Download error:', err); });" +
            "    return false;" +
            "  }" +
            "}, true);" +
            
            // Helper function that web app can call directly
            "window.androidDownload = function(blob, fileName, mimeType) {" +
            "  var reader = new FileReader();" +
            "  reader.onloadend = function() {" +
            "    var base64 = reader.result.split(',')[1];" +
            "    Android.downloadFileSimple(base64, fileName, mimeType || blob.type);" +
            "  };" +
            "  reader.readAsDataURL(blob);" +
            "};" +
            
            "console.log('Android download helper injected!');" +
            "})();";
        
        webView.evaluateJavascript(js, null);
    }

    /**
     * Load your web app URL in the WebView
     */
    private void loadWebApp() {
        webView.loadUrl(WEB_APP_URL);
    }

    /**
     * Check if internet connection is available
     * Returns true if connected, false if not connected
     */
    private boolean isInternetAvailable() {
        ConnectivityManager connectivityManager = 
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        
        if (connectivityManager != null) {
            NetworkInfo activeNetwork = connectivityManager.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnectedOrConnecting();
        }
        
        return false;
    }

    /**
     * Show "No Internet" message to the user
     */
    private void showNoInternetMessage() {
        webView.setVisibility(android.view.View.GONE); // Hide WebView
        noInternetText.setVisibility(android.view.View.VISIBLE); // Show error message
    }

    /**
     * Handle the back button press
     * If WebView has history, go back. Otherwise, show exit confirmation.
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Check if the Back button was pressed
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            
            // If WebView can go back (has previous pages in history)
            if (webView.canGoBack()) {
                webView.goBack(); // Go to previous page
                return true;
            } else {
                // WebView can't go back, show exit confirmation dialog
                showExitConfirmationDialog();
                return true;
            }
        }
        
        return super.onKeyDown(keyCode, event);
    }

    /**
     * Show a dialog asking user if they want to exit the app
     */
    private void showExitConfirmationDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Exit App")
            .setMessage("Do you want to exit?")
            .setPositiveButton("Yes", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    // User clicked Yes, close the app
                    finish();
                }
            })
            .setNegativeButton("No", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    // User clicked No, just close the dialog
                    dialog.dismiss();
                }
            })
            .show();
    }

    /**
     * Request notification permission for Android 13+
     */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_CODE);
            }
        }
    }

    /**
     * Request storage permission for Android 9 and below
     */
    private void requestStoragePermission() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                        STORAGE_PERMISSION_CODE);
            }
        }
    }

    /**
     * Handle permission request result
     */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == NOTIFICATION_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Notification permission granted", Toast.LENGTH_SHORT).show();
            }
        } else if (requestCode == STORAGE_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Storage permission granted", Toast.LENGTH_SHORT).show();
            }
        }
    }

    /**
     * Schedule daily attendance check at 11:30 PM
     */
    private void scheduleDailyAttendanceCheck() {
        // Calculate initial delay until 11:30 PM today (or tomorrow if past 11:30 PM)
        Calendar calendar = Calendar.getInstance();
        Calendar targetTime = Calendar.getInstance();
        
        targetTime.set(Calendar.HOUR_OF_DAY, 23);
        targetTime.set(Calendar.MINUTE, 30);
        targetTime.set(Calendar.SECOND, 0);

        // If current time is past 11:30 PM, schedule for tomorrow
        if (calendar.after(targetTime)) {
            targetTime.add(Calendar.DAY_OF_MONTH, 1);
        }

        long initialDelay = targetTime.getTimeInMillis() - calendar.getTimeInMillis();

        // Create periodic work request - runs daily
        PeriodicWorkRequest dailyWorkRequest = 
            new PeriodicWorkRequest.Builder(
                AttendanceCheckWorker.class,
                1, TimeUnit.DAYS  // Repeat every 24 hours
            )
            .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
            .build();

        // Schedule the work (replace any existing work with same name)
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "DailyAttendanceCheck",
            ExistingPeriodicWorkPolicy.KEEP,  // Keep existing if already scheduled
            dailyWorkRequest
        );
    }
}
