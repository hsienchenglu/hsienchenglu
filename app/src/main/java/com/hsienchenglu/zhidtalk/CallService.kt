package com.hsienchenglu.zhidtalk

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 常駐的來電監聽服務。
 *
 * App 在背景時就靠這個服務維持與訊令伺服器的連線；有人撥進來時，
 * 它負責響鈴（內建鈴聲，連續兩次）、跳出全螢幕來電畫面，並把事件
 * 廣播給主畫面顯示來電卡片。
 */
class CallService : Service() {

    private lateinit var prefs: Prefs
    private lateinit var signaling: Signaling
    private lateinit var ringer: Ringer
    private lateinit var history: HistoryStore

    private val io = Executors.newSingleThreadExecutor()
    private var incomingStream: Signaling.Stream? = null
    private var watchedAccount: String = ""

    @Volatile
    private var pending: PendingCall? = null

    data class PendingCall(
        val callId: String,
        val from: String,
        val fromLang: Lang,
        val startTs: Long
    )

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        signaling = Signaling(prefs)
        ringer = Ringer(this)
        history = HistoryStore(this)
        startForeground(NOTI_SERVICE, buildServiceNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> ensureStream()
            ACTION_ACCEPT -> acceptCall()
            ACTION_REJECT -> rejectCall(userRejected = true)
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }

            else -> ensureStream()
        }
        return START_STICKY
    }

    // ------------------------------------------------------------ 監聽來電

    private fun ensureStream() {
        val account = Signaling.sanitize(prefs.myAccount)
        if (account.isEmpty() || prefs.dbUrl.isEmpty()) {
            Log.w(TAG, "尚未完成設定，不啟動來電監聽")
            return
        }
        if (incomingStream != null && watchedAccount == account) return

        incomingStream?.close()
        watchedAccount = account
        incomingStream = signaling.stream(
            Signaling.incomingPath(account),
            object : Signaling.StreamListener {
                override fun onEvent(path: String, data: String) {
                    handleIncomingEvent(data)
                }

                override fun onError(t: Throwable) {
                    Log.w(TAG, "來電監聽中斷：${t.message}")
                }
            }
        )
        Log.i(TAG, "開始監聽 $account 的來電")
    }

    private fun handleIncomingEvent(data: String) {
        val obj = HistoryStore.optObject(data)
        if (obj == null) {
            // 節點被清空，代表對方取消了來電
            if (pending != null) cancelIncoming()
            return
        }
        val callId = obj.optString("callId")
        val from = obj.optString("from")
        if (callId.isEmpty() || from.isEmpty()) return
        if (pending?.callId == callId) return

        // 已經在通話中就直接回覆忙線
        if (CallActivity.isInCall) {
            io.execute {
                runCatching { signaling.put(Signaling.statePath(callId), Signaling.STATE_REJECTED) }
                runCatching { signaling.delete(Signaling.incomingPath(watchedAccount)) }
            }
            return
        }

        val call = PendingCall(
            callId = callId,
            from = from,
            fromLang = Lang.fromApiCode(obj.optString("fromLang")),
            startTs = System.currentTimeMillis()
        )
        pending = call
        ringer.start(prefs.ringRepeat)
        notifyIncoming(call)
        broadcast(Intent(ACTION_EVENT_INCOMING).apply {
            putExtra(EXTRA_CALL_ID, call.callId)
            putExtra(EXTRA_PEER, call.from)
            putExtra(EXTRA_PEER_LANG, call.fromLang.apiCode)
        })
        launchIncomingScreen(call)
    }

    /** 對方在我們接聽前掛斷 */
    private fun cancelIncoming() {
        val call = pending ?: return
        pending = null
        ringer.stop()
        NotificationManagerCompat.from(this).cancel(NOTI_INCOMING)
        saveMissed(call)
        broadcast(Intent(ACTION_EVENT_INCOMING_GONE).putExtra(EXTRA_CALL_ID, call.callId))
    }

    // ------------------------------------------------------------ 接聽 / 拒接

    private fun acceptCall() {
        val call = pending ?: return
        pending = null
        ringer.stop()
        NotificationManagerCompat.from(this).cancel(NOTI_INCOMING)

        io.execute {
            runCatching { signaling.put(Signaling.statePath(call.callId), Signaling.STATE_ACCEPTED) }
                .onFailure { Log.w(TAG, "回覆接聽狀態失敗：${it.message}") }
            runCatching { signaling.delete(Signaling.incomingPath(watchedAccount)) }
        }

        val intent = CallActivity.intentFor(
            context = this,
            callId = call.callId,
            peer = call.from,
            peerLang = call.fromLang,
            incoming = true,
            alreadyAccepted = true
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        startActivity(intent)
        broadcast(Intent(ACTION_EVENT_INCOMING_GONE).putExtra(EXTRA_CALL_ID, call.callId))
    }

    private fun rejectCall(userRejected: Boolean) {
        val call = pending ?: return
        pending = null
        ringer.stop()
        NotificationManagerCompat.from(this).cancel(NOTI_INCOMING)

        io.execute {
            runCatching { signaling.put(Signaling.statePath(call.callId), Signaling.STATE_REJECTED) }
            runCatching { signaling.delete(Signaling.incomingPath(watchedAccount)) }
        }
        if (userRejected) saveMissed(call)
        broadcast(Intent(ACTION_EVENT_INCOMING_GONE).putExtra(EXTRA_CALL_ID, call.callId))
    }

    private fun saveMissed(call: PendingCall) {
        io.execute {
            history.save(
                CallRecord(
                    callId = call.callId,
                    peer = call.from,
                    incoming = true,
                    startTs = call.startTs,
                    durationSec = 0,
                    answered = false,
                    msgCount = 0
                )
            )
            broadcast(Intent(ACTION_EVENT_HISTORY_CHANGED))
        }
    }

    // ------------------------------------------------------------ 通知

    private fun buildServiceNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), piFlags()
        )
        return NotificationCompat.Builder(this, App.CH_SERVICE)
            .setContentTitle(getString(R.string.svc_title))
            .setContentText(getString(R.string.svc_text))
            .setSmallIcon(R.drawable.ic_call)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open)
            .build()
    }

    private fun notifyIncoming(call: PendingCall) {
        val fullScreen = PendingIntent.getActivity(
            this,
            1,
            IncomingCallActivity.intentFor(this, call.callId, call.from, call.fromLang)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            piFlags()
        )
        val accept = PendingIntent.getService(
            this, 2, Intent(this, CallService::class.java).setAction(ACTION_ACCEPT), piFlags()
        )
        val reject = PendingIntent.getService(
            this, 3, Intent(this, CallService::class.java).setAction(ACTION_REJECT), piFlags()
        )

        val noti = NotificationCompat.Builder(this, App.CH_INCOMING)
            .setContentTitle(getString(R.string.incoming_call))
            .setContentText(call.from)
            .setSmallIcon(R.drawable.ic_call)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSilent(true) // 鈴聲由 Ringer 播放，才能精準控制次數
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(fullScreen)
            .addAction(R.drawable.ic_call_end, getString(R.string.reject), reject)
            .addAction(R.drawable.ic_call, getString(R.string.accept), accept)
            .build()

        runCatching { NotificationManagerCompat.from(this).notify(NOTI_INCOMING, noti) }
            .onFailure { Log.w(TAG, "無法顯示來電通知：${it.message}") }
    }

    private fun launchIncomingScreen(call: PendingCall) {
        // Android 10 以後背景啟動 Activity 受限，失敗時仍有全螢幕通知可用
        runCatching {
            startActivity(
                IncomingCallActivity.intentFor(this, call.callId, call.from, call.fromLang)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    private fun piFlags(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

    private fun broadcast(intent: Intent) {
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    override fun onDestroy() {
        incomingStream?.close()
        incomingStream = null
        ringer.stop()
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "CallService"

        private const val NOTI_SERVICE = 1001
        private const val NOTI_INCOMING = 1002

        const val ACTION_START = "com.hsienchenglu.zhidtalk.START"
        const val ACTION_ACCEPT = "com.hsienchenglu.zhidtalk.ACCEPT"
        const val ACTION_REJECT = "com.hsienchenglu.zhidtalk.REJECT"
        const val ACTION_STOP = "com.hsienchenglu.zhidtalk.STOP"

        const val ACTION_EVENT_INCOMING = "com.hsienchenglu.zhidtalk.EVENT_INCOMING"
        const val ACTION_EVENT_INCOMING_GONE = "com.hsienchenglu.zhidtalk.EVENT_INCOMING_GONE"
        const val ACTION_EVENT_HISTORY_CHANGED = "com.hsienchenglu.zhidtalk.EVENT_HISTORY"

        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER = "peer"
        const val EXTRA_PEER_LANG = "peer_lang"

        fun start(context: Context) {
            val intent = Intent(context, CallService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun send(context: Context, action: String) {
            context.startService(Intent(context, CallService::class.java).setAction(action))
        }
    }
}
