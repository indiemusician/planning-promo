package fr.indiemusician.labo

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/** Pont appelé par le Labo web via window.LaboNative */
class LaboBridge(private val ctx: Context) {
    @JavascriptInterface fun available(): Boolean = true
    @JavascriptInterface fun version(): String = BuildConfigHolder.versionName(ctx)
    @JavascriptInterface fun open(): Boolean = NativeAudio.open()
    @JavascriptInterface fun close() = NativeAudio.close()
    @JavascriptInterface fun isOpen(): Boolean = NativeAudio.isOpen()
    @JavascriptInterface fun setMonitor(on: Boolean, volume: Float) = NativeAudio.setMonitor(on, volume)
    @JavascriptInterface fun recStart() = NativeAudio.recStart()
    @JavascriptInterface fun recStop(): Int = NativeAudio.recStop()
    @JavascriptInterface fun sampleRate(): Int = NativeAudio.sampleRate()
    @JavascriptInterface fun level(): Float = NativeAudio.level()
    @JavascriptInterface fun peak(): Float = NativeAudio.peak()
    @JavascriptInterface fun latencyMs(): Double = NativeAudio.latencyMs()
    @JavascriptInterface fun recordedFrames(): Int = NativeAudio.recordedFrames()
    @JavascriptInterface fun readChunk(from: Int, count: Int): String =
        Base64.encodeToString(NativeAudio.readPcm16(from, count), Base64.NO_WRAP)

    /* export de fichiers (le WebView ne sait pas télécharger les blob:) */
    private var out: OutputStream? = null
    private var outName = ""
    @JavascriptInterface fun fileBegin(name: String): Boolean {
        return try {
            outName = name
            out = if (Build.VERSION.SDK_INT >= 29) {
                val v = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, "audio/wav")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Labo")
                }
                val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)
                uri?.let { ctx.contentResolver.openOutputStream(it) }
            } else {
                val dir = File(ctx.getExternalFilesDir(null), "exports"); dir.mkdirs()
                FileOutputStream(File(dir, name))
            }
            out != null
        } catch (e: Exception) { false }
    }
    @JavascriptInterface fun fileAppend(b64: String): Boolean = try { out?.write(Base64.decode(b64, Base64.DEFAULT)); true } catch (e: Exception) { false }
    @JavascriptInterface fun fileEnd(): String { return try { out?.close(); out = null; "Téléchargements/Labo/$outName" } catch (e: Exception) { "" } }
}

object BuildConfigHolder {
    fun versionName(ctx: Context): String = try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "" } catch (e: Exception) { "" }
}
