package com.example.flutter_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.IBinder
import android.provider.MediaStore
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.MimeTypeMap
import android.widget.ImageView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

class ScreenshotMonitorService : Service() {
    companion object {
        private const val NOTIFICATION_ID = 2025
        private const val NOTIFICATION_CHANNEL_ID = "crossshot_monitor"
        private const val NOTIFICATION_CHANNEL_NAME = "CrossShot 截图监听"
        private const val TAG = "CrossShotMonitor"
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private lateinit var contentObserver: ContentObserver
    private val observedUris = mutableListOf<Uri>()
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val lastHandledId = AtomicLong(-1)
    private val lastHandledUri = AtomicReference<String?>(null)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        registerScreenshotObservers()
        showOverlayIfPermitted()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        runCatching { contentResolver.unregisterContentObserver(contentObserver) }
        observedUris.clear()
        removeOverlay()
        executor.shutdownNow()
    }

    private fun buildNotification(): Notification {
        val manager = ContextCompat.getSystemService(this, NotificationManager::class.java)
        if (manager != null && manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
            manager.createNotificationChannel(channel)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("CrossShot 正在监听截图")
            .setContentText("点击浮窗或截屏将自动上传到桌面端")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun showOverlayIfPermitted() {
        if (!SettingsOverlayHelper.canDrawOverlays(this)) {
            return
        }

        if (overlayView != null) {
            return
        }

        val inflater = LayoutInflater.from(this)
        val view = inflater.inflate(R.layout.overlay_screenshot_button, null, false)
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 48
            y = 0
        }

        view.findViewById<ImageView>(R.id.overlayButton).setOnClickListener {
            MainActivity.pushScreenshotEvent(mapOf("type" to "overlayTap"))
        }

        attachDragHandler(view, params)

        windowManager.addView(view, params)
        overlayView = view
    }

    private fun attachDragHandler(view: View, params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    false
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (initialTouchX - event.rawX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager.updateViewLayout(view, params)
                    true
                }
                else -> false
            }
        }
    }

    private fun removeOverlay() {
        overlayView?.let {
            runCatching { windowManager.removeView(it) }
        }
        overlayView = null
    }

    private fun registerScreenshotObservers() {
        contentObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                super.onChange(selfChange, uri)
                handleScreenshot(uri)
            }
        }

        val uris = mutableListOf<Uri>().apply {
            add(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            add(MediaStore.Images.Media.INTERNAL_CONTENT_URI)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                add(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY))
            }
        }

        uris.distinct().forEach { target ->
            observedUris.add(target)
            contentResolver.registerContentObserver(target, true, contentObserver)
        }
    }

    private fun handleScreenshot(uri: Uri?) {
        executor.execute {
            try {
                val latest = queryLatestScreenshot(uri)
                if (latest != null && shouldHandle(latest)) {
                    val cacheFile = copyToCache(latest.uri)
                    if (cacheFile != null) {
                        Log.d(TAG, "Detected screenshot uri=${latest.uri}")
                        MainActivity.pushScreenshotEvent(
                            mapOf(
                                "type" to "systemScreenshot",
                                "path" to cacheFile.absolutePath,
                                "name" to latest.displayName,
                            ),
                        )
                    }
                }
            } catch (error: Throwable) {
                Log.w(TAG, "Failed handling screenshot", error)
            }
        }
    }

    private data class ScreenshotEntry(
        val id: Long,
        val uri: Uri,
        val displayName: String?,
        val relativePath: String?,
    )

    private fun shouldHandle(entry: ScreenshotEntry): Boolean {
        val previousId = lastHandledId.get()
        if (previousId == entry.id) {
            return false
        }

        lastHandledId.set(entry.id)
        lastHandledUri.set(entry.uri.toString())
        return true
    }

    private fun queryLatestScreenshot(triggerUri: Uri?): ScreenshotEntry? {
        triggerUri?.let { target ->
            queryByUri(target)?.let { entry ->
                if (isScreenshotEntry(entry)) {
                    return entry
                }
            }
        }

        observedUris.forEach { baseUri ->
            queryLatestFromBase(baseUri)?.let { entry ->
                if (isScreenshotEntry(entry)) {
                    return entry
                }
            }
        }

        return null
    }

    private fun queryByUri(uri: Uri): ScreenshotEntry? {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.RELATIVE_PATH,
        )

        contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val id = cursor.getLong(0)
                val name = cursor.getString(1)
                val relativePathIndex = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH)
                val relativePath = if (relativePathIndex >= 0) cursor.getString(relativePathIndex) else null
                return ScreenshotEntry(id, uri, name, relativePath)
            }
        }
        return null
    }

    private fun queryLatestFromBase(baseUri: Uri): ScreenshotEntry? {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.RELATIVE_PATH,
        )

        contentResolver.query(
            baseUri,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.DATE_ADDED} DESC",
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val id = cursor.getLong(0)
                val name = cursor.getString(1)
                val relativePathIndex = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH)
                val relativePath = if (relativePathIndex >= 0) cursor.getString(relativePathIndex) else null
                val uri = ContentUris.withAppendedId(baseUri, id)
                return ScreenshotEntry(id, uri, name, relativePath)
            }
        }
        return null
    }

    private fun isScreenshotEntry(entry: ScreenshotEntry): Boolean {
        val name = entry.displayName ?: ""
        val relativePath = entry.relativePath ?: ""
        return name.contains("screenshot", ignoreCase = true) ||
            name.contains("screen shot", ignoreCase = true) ||
            relativePath.contains("screenshot", ignoreCase = true) ||
            relativePath.contains("screen_capture", ignoreCase = true) ||
            relativePath.contains("screenshots", ignoreCase = true)
    }

    private fun copyToCache(uri: Uri): File? {
        val mimeType = contentResolver.getType(uri)
        val cacheNamePng = "system_screenshot_${System.currentTimeMillis()}.png"
        val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
        val cacheNameRaw = "system_screenshot_${System.currentTimeMillis()}.${extension ?: "bin"}"

        repeat(5) { attempt ->
            try {
                contentResolver.openInputStream(uri)?.use { input ->
                    val decoded = BitmapFactory.decodeStream(input)
                    if (decoded != null) {
                        val file = File(cacheDir, cacheNamePng)
                        FileOutputStream(file).use { output ->
                            decoded.compress(Bitmap.CompressFormat.PNG, 100, output)
                            output.flush()
                        }
                        return file
                    }
                }

                // Fallback: raw copy if bitmap decode fails
                contentResolver.openInputStream(uri)?.use { input ->
                    val file = File(cacheDir, cacheNameRaw)
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                        output.flush()
                    }
                    return file
                }
                return null
            } catch (error: IllegalStateException) {
                if (error.message?.contains("pending", ignoreCase = true) == true && attempt < 4) {
                    Thread.sleep(150)
                } else {
                    Log.w(TAG, "copyToCache pending/illegal state uri=$uri", error)
                    return null
                }
            } catch (error: Throwable) {
                Log.w(TAG, "copyToCache failed uri=$uri", error)
                return null
            }
        }
        return null
    }
}