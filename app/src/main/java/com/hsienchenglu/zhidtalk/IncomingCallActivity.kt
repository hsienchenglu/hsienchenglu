package com.hsienchenglu.zhidtalk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.hsienchenglu.zhidtalk.databinding.ActivityIncomingBinding

/**
 * 全螢幕來電畫面。螢幕鎖著也會亮起來，接聽／拒接都交給 CallService 處理，
 * 這樣不管使用者是從通知還是從這個畫面操作，走的都是同一條路。
 */
class IncomingCallActivity : AppCompatActivity() {

    private lateinit var b: ActivityIncomingBinding

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // 對方取消或已由通知處理完畢
            if (intent?.action == CallService.ACTION_EVENT_INCOMING_GONE) finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        b = ActivityIncomingBinding.inflate(layoutInflater)
        setContentView(b.root)

        val peer = intent.getStringExtra(EXTRA_PEER).orEmpty()
        val peerLang = Lang.fromApiCode(intent.getStringExtra(EXTRA_PEER_LANG))

        b.textPeer.text = peer
        b.textPeerLang.text = getString(R.string.speaks_fmt, getString(peerLang.labelRes))

        b.btnAccept.setOnClickListener {
            CallService.send(this, CallService.ACTION_ACCEPT)
            finish()
        }
        b.btnReject.setOnClickListener {
            CallService.send(this, CallService.ACTION_REJECT)
            finish()
        }

        LocalBroadcastManager.getInstance(this).registerReceiver(
            receiver,
            IntentFilter(CallService.ACTION_EVENT_INCOMING_GONE)
        )

        // 來電畫面不該被返回鍵隨手關掉，要明確選接聽或拒接
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = Unit
        })
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onDestroy() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(receiver)
        super.onDestroy()
    }

    companion object {
        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER = "peer"
        const val EXTRA_PEER_LANG = "peer_lang"

        fun intentFor(context: Context, callId: String, peer: String, peerLang: Lang): Intent =
            Intent(context, IncomingCallActivity::class.java)
                .putExtra(EXTRA_CALL_ID, callId)
                .putExtra(EXTRA_PEER, peer)
                .putExtra(EXTRA_PEER_LANG, peerLang.apiCode)
    }
}
