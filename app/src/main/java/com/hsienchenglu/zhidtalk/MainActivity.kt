package com.hsienchenglu.zhidtalk

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.hsienchenglu.zhidtalk.databinding.ActivityMainBinding
import java.util.concurrent.Executors

/**
 * 主畫面：撥號、來電顯示、通話紀錄。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var history: HistoryStore
    private lateinit var adapter: HistoryAdapter

    private val io = Executors.newSingleThreadExecutor()

    private val notifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 拒絕也不影響 App 在前景時的來電顯示 */ }

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) toast(getString(R.string.err_mic_permission))
    }

    /** 來電事件由 CallService 廣播過來，主畫面顯示成一張卡片。 */
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                CallService.ACTION_EVENT_INCOMING -> showIncoming(
                    intent.getStringExtra(CallService.EXTRA_PEER).orEmpty()
                )

                CallService.ACTION_EVENT_INCOMING_GONE -> hideIncoming()
                CallService.ACTION_EVENT_HISTORY_CHANGED -> refreshHistory()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        prefs = Prefs(this)
        history = HistoryStore(this)

        adapter = HistoryAdapter(
            mutableListOf(),
            onOpen = { openDetail(it) },
            onDelete = { confirmDelete(it) }
        )
        b.recyclerHistory.layoutManager = LinearLayoutManager(this)
        b.recyclerHistory.adapter = adapter

        b.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        b.btnCall.setOnClickListener { placeCall() }
        b.btnClearHistory.setOnClickListener { confirmClearAll() }
        b.btnAcceptIncoming.setOnClickListener {
            hideIncoming()
            CallService.send(this, CallService.ACTION_ACCEPT)
        }
        b.btnRejectIncoming.setOnClickListener {
            hideIncoming()
            CallService.send(this, CallService.ACTION_REJECT)
        }

        LocalBroadcastManager.getInstance(this).registerReceiver(
            receiver,
            IntentFilter().apply {
                addAction(CallService.ACTION_EVENT_INCOMING)
                addAction(CallService.ACTION_EVENT_INCOMING_GONE)
                addAction(CallService.ACTION_EVENT_HISTORY_CHANGED)
            }
        )

        askPermissions()
    }

    override fun onResume() {
        super.onResume()
        refreshHeader()
        refreshHistory()
        if (prefs.isConfigured) {
            CallService.start(this)
        } else {
            promptSetup()
        }
    }

    private fun askPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun refreshHeader() {
        val account = prefs.myAccount
        b.textMyAccount.text = if (account.isEmpty()) {
            getString(R.string.no_account)
        } else {
            getString(R.string.my_account_fmt, account)
        }
        b.textMyLang.text = getString(
            R.string.lang_pair,
            getString(prefs.myLang.labelRes),
            getString(prefs.myLang.other().labelRes)
        )
        if (b.editPeer.text.isNullOrEmpty() && prefs.peerAccount.isNotEmpty()) {
            b.editPeer.setText(prefs.peerAccount)
        }
        b.textStatusHint.visibility = if (prefs.isConfigured) View.GONE else View.VISIBLE
    }

    private fun promptSetup() {
        AlertDialog.Builder(this)
            .setTitle(R.string.setup_needed)
            .setMessage(R.string.setup_needed_msg)
            .setPositiveButton(R.string.go_settings) { _, _ ->
                startActivity(Intent(this, SettingsActivity::class.java))
            }
            .setNegativeButton(R.string.later, null)
            .show()
    }

    // ------------------------------------------------------------ 撥號

    private fun placeCall() {
        if (!prefs.isConfigured) {
            promptSetup()
            return
        }
        val peer = b.editPeer.text?.toString()?.trim().orEmpty()
        if (peer.isEmpty()) {
            b.editPeer.error = getString(R.string.err_no_peer)
            return
        }
        if (Signaling.sanitize(peer) == Signaling.sanitize(prefs.myAccount)) {
            toast(getString(R.string.err_call_self))
            return
        }
        prefs.peerAccount = peer

        startActivity(
            CallActivity.intentFor(
                context = this,
                callId = HistoryStore.newCallId(),
                peer = peer,
                peerLang = prefs.myLang.other(),
                incoming = false,
                alreadyAccepted = false
            )
        )
    }

    // ------------------------------------------------------------ 來電卡片

    private fun showIncoming(peer: String) {
        b.cardIncoming.visibility = View.VISIBLE
        b.textIncomingPeer.text = peer
    }

    private fun hideIncoming() {
        b.cardIncoming.visibility = View.GONE
    }

    // ------------------------------------------------------------ 通話紀錄

    private fun refreshHistory() {
        io.execute {
            val list = history.list()
            runOnUiThread {
                adapter.replaceAll(list)
                b.textNoHistory.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                b.btnClearHistory.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
            }
        }
    }

    private fun openDetail(record: CallRecord) {
        startActivity(
            Intent(this, HistoryDetailActivity::class.java)
                .putExtra(HistoryDetailActivity.EXTRA_CALL_ID, record.callId)
                .putExtra(HistoryDetailActivity.EXTRA_PEER, record.peer)
        )
    }

    private fun confirmDelete(record: CallRecord) {
        AlertDialog.Builder(this)
            .setTitle(R.string.delete_record_q)
            .setMessage(getString(R.string.delete_record_msg, record.peer))
            .setPositiveButton(R.string.delete) { _, _ ->
                io.execute {
                    history.delete(record.callId)
                    runOnUiThread { refreshHistory() }
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmClearAll() {
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_all_q)
            .setMessage(R.string.clear_all_msg)
            .setPositiveButton(R.string.delete) { _, _ ->
                io.execute {
                    history.clearAll()
                    runOnUiThread { refreshHistory() }
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onDestroy() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(receiver)
        io.shutdown()
        super.onDestroy()
    }
}
