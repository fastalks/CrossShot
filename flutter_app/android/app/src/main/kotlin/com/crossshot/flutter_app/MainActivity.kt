package com.crossshot.flutter_app

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : FlutterActivity() {
    companion object {
        private var eventSink: EventChannel.EventSink? = null

        fun pushScreenshotEvent(payload: Map<String, Any?>) {
            val sink = eventSink ?: return
            if (Looper.myLooper() == Looper.getMainLooper()) {
                sink.success(payload)
            } else {
                Handler(Looper.getMainLooper()).post {
                    sink.success(payload)
                }
            }
        }
    }

    private val methodChannelName = "crossshot/screenshot"
    private val eventChannelName = "crossshot/screenshot_events"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, methodChannelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "capture" -> captureCurrentScreen(result)
                "startMonitor" -> {
                    val intent = Intent(this, ScreenshotMonitorService::class.java)
                    ContextCompat.startForegroundService(this, intent)
                    result.success(true)
                }
                "stopMonitor" -> {
                    val stopped = stopService(Intent(this, ScreenshotMonitorService::class.java))
                    result.success(stopped)
                }
                "canDrawOverlays" -> result.success(SettingsOverlayHelper.canDrawOverlays(this))
                "openOverlaySettings" -> {
                    if (SettingsOverlayHelper.canDrawOverlays(this)) {
                        result.success(true)
                    } else {
                        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                        result.success(true)
                    }
                }
                else -> result.notImplemented()
            }
        }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, eventChannelName).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    eventSink = events
                }

                override fun onCancel(arguments: Any?) {
                    eventSink = null
                }
            },
        )
    }

    private fun captureCurrentScreen(result: MethodChannel.Result) {
        runOnUiThread {
            try {
                val view = window?.decorView?.rootView
                if (view == null || view.width == 0 || view.height == 0) {
                    result.error("no-view", "无法访问当前视图", null)
                    return@runOnUiThread
                }

                val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)
                view.draw(canvas)

                val folder = cacheDir
                val formatter = SimpleDateFormat("yyyyMMdd_HHmmssSSS", Locale.getDefault())
                val filename = "crossshot_${formatter.format(Date())}.png"
                val file = File(folder, filename)

                FileOutputStream(file).use { stream ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                    stream.flush()
                }

                result.success(file.absolutePath)
            } catch (error: Throwable) {
                result.error("capture-failed", error.localizedMessage, null)
            }
        }
    }
}
