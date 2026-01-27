package com.vssnagar.attendance;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Splash Screen Activity
 * This is the first screen that appears when you open the app.
 * It shows for 2 seconds, then opens MainActivity.
 */
public class SplashActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        // Wait for 2000 milliseconds (2 seconds), then open MainActivity
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                // Create an intent to open MainActivity
                Intent intent = new Intent(SplashActivity.this, MainActivity.class);
                startActivity(intent);
                
                // Close this splash screen so user can't come back to it
                finish();
            }
        }, 2000); // 2000 milliseconds = 2 seconds
    }
}
