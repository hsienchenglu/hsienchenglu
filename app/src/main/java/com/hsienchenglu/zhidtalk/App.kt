package com.hsienchenglu.zhidtalk

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.os.Build

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return

        // 來電通道：鈴聲由 App 自行播放（可控制響兩次），所以通道本身不帶聲音。
        val incoming = NotificationChannel(
            CH_INCOMING,
            getString(R.string.ch_incoming),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.ch_incoming_desc)
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }
        nm.createNotificationChannel(incoming)

        val service = NotificationChannel(
            CH_SERVICE,
            getString(R.string.ch_service),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.ch_service_desc)
            setSound(null, AudioAttributes.Builder().build())
            setShowBadge(false)
        }
        nm.createNotificationChannel(service)
    }

    companion object {
        const val CH_INCOMING = "incoming_call"
        const val CH_SERVICE = "call_service"
    }
}
