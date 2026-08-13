package com.hsienchenglu.zhidtalk

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * 來電鈴聲。使用手機內建的預設鈴聲，並在播完設定的次數後自動停止
 * （預設兩次，可在設定頁調整）。
 */
class Ringer(private val context: Context) {

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var playsLeft = 0

    @Synchronized
    fun start(repeat: Int) {
        stop()
        playsLeft = repeat.coerceIn(1, 10)

        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val silent = audio?.ringerMode == AudioManager.RINGER_MODE_SILENT
        val vibrateOnly = audio?.ringerMode == AudioManager.RINGER_MODE_VIBRATE

        startVibration(!silent)
        if (silent || vibrateOnly) return

        val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: return

        try {
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(context, uri)
                isLooping = false
                setOnCompletionListener { mp ->
                    playsLeft--
                    if (playsLeft > 0) {
                        runCatching {
                            mp.seekTo(0)
                            mp.start()
                        }
                    } else {
                        stop()
                    }
                }
                setOnErrorListener { _, what, extra ->
                    Log.w(TAG, "鈴聲播放錯誤 what=$what extra=$extra")
                    stop()
                    true
                }
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.w(TAG, "無法播放鈴聲：${e.message}")
            stop()
        }
    }

    private fun startVibration(enabled: Boolean) {
        if (!enabled) return
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } ?: return
        vibrator = v
        val pattern = longArrayOf(0, 700, 700)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, 0)
            }
        }
    }

    @Synchronized
    fun stop() {
        playsLeft = 0
        runCatching {
            player?.setOnCompletionListener(null)
            if (player?.isPlaying == true) player?.stop()
            player?.release()
        }
        player = null
        runCatching { vibrator?.cancel() }
        vibrator = null
    }

    companion object {
        private const val TAG = "Ringer"
    }
}
