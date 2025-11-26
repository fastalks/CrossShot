package com.example.flutter_app

import android.content.Context
import android.os.Build
import android.provider.Settings

object SettingsOverlayHelper {
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
    }
}
