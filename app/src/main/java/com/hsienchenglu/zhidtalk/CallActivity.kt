package com.hsienchenglu.zhidtalk

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.hsienchenglu.zhidtalk.databinding.ActivityCallBinding
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 通話畫面。
 *
 * 這個 App 不傳送語音串流，而是「本地辨識 → 翻譯 → 傳文字 → 對方本地朗讀」。
 * 這樣在一般行動網路下也很穩，而且雙方都能看到完整的對話逐字稿。
 */
class CallActivity : AppCompatActivity(), SpeechManager.Listener {

    private lateinit var b: ActivityCallBinding
    private lateinit var prefs: Prefs
    private lateinit var signaling: Signaling
    private lateinit var translator: TranslateClient
    private lateinit var history: HistoryStore
    private lateinit var speech: SpeechManager
    private lateinit var adapter: TranscriptAdapter

    private val io = Executors.newFixedThreadPool(2)
    private val ui = Handler(Looper.getMainLooper())

    private lateinit var callId: String
    private lateinit var peer: String
    private var peerLang: Lang = Lang.ID
    private var incoming = false

    private var stateStream: Signaling.Stream? = null
    private var msgStream: Signaling.Stream? = null

    private var connected = false
    private var connectedAt = 0L
    private val startTs = System.currentTimeMillis()
    private var ending = false
    private var msgCount = 0

    private val myAccount: String by lazy { Signaling.sanitize(prefs.myAccount) }
    private val myLang: Lang get() = prefs.myLang

    /** 這個 App 只在中文與印尼文之間互譯，所以對方的語言就是我的另一種。 */
    private val targetLang: Lang get() = myLang.other()

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            speech.startListening()
        } else {
            toast(getString(R.string.err_mic_permission))
        }
    }

    private val ringTimeout = Runnable {
        if (!connected && !ending) {
            toast(getString(R.string.call_no_answer))
            endCall(notifyPeer = true)
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (connected) {
                val sec = (System.currentTimeMillis() - connectedAt) / 1000
                b.textDuration.text = HistoryStore.formatDuration(sec)
            }
            ui.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityCallBinding.inflate(layoutInflater)
        setContentView(b.root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        prefs = Prefs(this)
        signaling = Signaling(prefs)
        translator = TranslateClient(prefs)
        history = HistoryStore(this)

        callId = intent.getStringExtra(EXTRA_CALL_ID) ?: HistoryStore.newCallId()
        peer = intent.getStringExtra(EXTRA_PEER).orEmpty()
        peerLang = Lang.fromApiCode(intent.getStringExtra(EXTRA_PEER_LANG))
        incoming = intent.getBooleanExtra(EXTRA_INCOMING, false)
        val alreadyAccepted = intent.getBooleanExtra(EXTRA_ACCEPTED, false)

        if (peer.isEmpty()) {
            toast(getString(R.string.err_no_peer))
            finish()
            return
        }

        adapter = TranscriptAdapter(mutableListOf())
        b.recyclerTranscript.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        b.recyclerTranscript.adapter = adapter

        b.textPeer.text = peer
        b.textLangPair.text = getString(
            R.string.lang_pair,
            getString(myLang.labelRes),
            getString(targetLang.labelRes)
        )
        b.textDuration.text = HistoryStore.formatDuration(0)

        speech = SpeechManager(this, myLang, this)
        speech.init()

        b.btnEnd.setOnClickListener { endCall(notifyPeer = true) }
        b.btnMic.setOnClickListener { toggleMic() }
        b.btnSpeaker.setOnClickListener { toggleSpeaker() }
        updateSpeakerIcon()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                confirmEnd()
            }
        })

        isInCall = true
        routeAudioToSpeaker(true)
        watchState()
        watchMessages()

        if (incoming || alreadyAccepted) {
            onConnected()
        } else {
            placeOutgoingCall()
        }

        ui.post(ticker)
    }

    // ------------------------------------------------------------ 撥號與狀態

    private fun placeOutgoingCall() {
        setStatus(getString(R.string.status_calling))
        val peerKey = Signaling.sanitize(peer)
        io.execute {
            try {
                signaling.put(
                    Signaling.metaPath(callId),
                    JSONObject()
                        .put("caller", myAccount)
                        .put("callerLang", myLang.apiCode)
                        .put("callee", peerKey)
                        .put("startTs", startTs)
                )
                signaling.put(Signaling.statePath(callId), Signaling.STATE_RINGING)
                signaling.put(
                    Signaling.incomingPath(peerKey),
                    JSONObject()
                        .put("callId", callId)
                        .put("from", myAccount)
                        .put("fromLang", myLang.apiCode)
                        .put("ts", startTs)
                )
            } catch (e: Exception) {
                Log.w(TAG, "撥號失敗：${e.message}")
                ui.post {
                    toast(getString(R.string.err_dial, e.message ?: ""))
                    endCall(notifyPeer = false)
                }
            }
        }
        ui.postDelayed(ringTimeout, RING_TIMEOUT_MS)
    }

    private fun watchState() {
        stateStream = signaling.stream(
            Signaling.statePath(callId),
            object : Signaling.StreamListener {
                override fun onEvent(path: String, data: String) {
                    ui.post { onStateChanged(data.trim('"')) }
                }
            }
        )
    }

    private fun onStateChanged(state: String) {
        if (ending) return
        when (state) {
            Signaling.STATE_ACCEPTED -> if (!connected) onConnected()
            Signaling.STATE_REJECTED -> {
                toast(getString(R.string.call_rejected))
                endCall(notifyPeer = false)
            }

            Signaling.STATE_ENDED -> {
                toast(getString(R.string.call_peer_hung_up))
                endCall(notifyPeer = false)
            }
        }
    }

    private fun onConnected() {
        if (connected) return
        connected = true
        connectedAt = System.currentTimeMillis()
        ui.removeCallbacks(ringTimeout)
        setStatus(getString(R.string.status_connected))
        b.textDuration.visibility = View.VISIBLE
        if (prefs.autoListen) startMic()
    }

    // ------------------------------------------------------------ 訊息收發

    private fun watchMessages() {
        msgStream = signaling.stream(
            Signaling.msgsPath(callId),
            object : Signaling.StreamListener {
                override fun onEvent(path: String, data: String) {
                    if (data == "null") return
                    try {
                        if (path == "/") {
                            // 初次連線時會一次送來整包既有訊息
                            val all = JSONObject(data)
                            val keys = all.keys()
                            val list = ArrayList<Pair<String, JSONObject>>()
                            while (keys.hasNext()) {
                                val k = keys.next()
                                all.optJSONObject(k)?.let { list.add(k to it) }
                            }
                            list.sortBy { it.second.optLong("ts") }
                            list.forEach { (k, o) -> handleRemoteMsg(k, o) }
                        } else {
                            val key = path.trim('/')
                            handleRemoteMsg(key, JSONObject(data))
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "解析訊息失敗：${e.message}")
                    }
                }
            }
        )
    }

    private fun handleRemoteMsg(key: String, o: JSONObject) {
        if (!seenKeys.add(key)) return
        val from = o.optString("from")
        if (from == myAccount) return // 自己送出的，畫面上已經有了

        val msg = Msg(
            id = key,
            fromMe = false,
            srcLang = Lang.fromApiCode(o.optString("srcLang")),
            src = o.optString("src"),
            dst = o.optString("dst"),
            ts = o.optLong("ts", System.currentTimeMillis())
        )
        ui.post {
            appendMsg(msg)
            if (prefs.autoSpeak && msg.dst.isNotBlank()) {
                speech.speak(msg.dst, myLang)
            }
        }
    }

    /** 我說完一句話：翻譯後送出。 */
    private fun sendUtterance(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        setStatus(getString(R.string.status_translating))
        io.execute {
            val dst = try {
                translator.translate(trimmed, myLang, targetLang)
            } catch (e: Exception) {
                Log.w(TAG, "翻譯失敗：${e.message}")
                ui.post {
                    toast(e.message ?: getString(R.string.err_translate))
                    setStatus(getString(R.string.status_connected))
                }
                return@execute
            }

            val ts = System.currentTimeMillis()
            val payload = JSONObject()
                .put("from", myAccount)
                .put("srcLang", myLang.apiCode)
                .put("dstLang", targetLang.apiCode)
                .put("src", trimmed)
                .put("dst", dst)
                .put("ts", ts)

            val key = try {
                signaling.push(Signaling.msgsPath(callId), payload)
            } catch (e: Exception) {
                Log.w(TAG, "送出訊息失敗：${e.message}")
                ui.post {
                    toast(getString(R.string.err_send))
                    setStatus(getString(R.string.status_connected))
                }
                return@execute
            }

            val localKey = key ?: "local_$ts"
            seenKeys.add(localKey)
            ui.post {
                appendMsg(Msg(localKey, true, myLang, trimmed, dst, ts))
                setStatus(getString(R.string.status_connected))
            }
        }
    }

    private fun appendMsg(msg: Msg) {
        adapter.add(msg)
        msgCount++
        b.recyclerTranscript.scrollToPosition(adapter.itemCount - 1)
        b.textEmpty.visibility = View.GONE
    }

    // ------------------------------------------------------------ 麥克風 / 喇叭

    private fun toggleMic() {
        if (speech.wantListening) {
            speech.stopListening()
        } else {
            startMic()
        }
    }

    private fun startMic() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        speech.startListening()
    }

    private fun toggleSpeaker() {
        val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        @Suppress("DEPRECATION")
        routeAudioToSpeaker(!am.isSpeakerphoneOn)
        updateSpeakerIcon()
    }

    private fun routeAudioToSpeaker(on: Boolean) {
        val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        runCatching {
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = on
        }
    }

    private fun updateSpeakerIcon() {
        val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        @Suppress("DEPRECATION")
        val on = am?.isSpeakerphoneOn ?: true
        b.btnSpeaker.setImageResource(if (on) R.drawable.ic_speaker_on else R.drawable.ic_speaker_off)
    }

    // ------------------------------------------------------------ SpeechManager 回呼

    override fun onPartial(text: String) {
        b.textPartial.visibility = View.VISIBLE
        b.textPartial.text = text
    }

    override fun onResult(text: String) {
        b.textPartial.visibility = View.GONE
        b.textPartial.text = ""
        sendUtterance(text)
    }

    override fun onListeningChanged(listening: Boolean) {
        b.btnMic.setImageResource(if (listening) R.drawable.ic_mic_on else R.drawable.ic_mic_off)
        b.textMicHint.setText(if (listening) R.string.mic_on_hint else R.string.mic_off_hint)
        if (!listening) {
            b.textPartial.visibility = View.GONE
            b.waveView.setLevel(0f)
        }
    }

    override fun onRms(level: Float) {
        b.waveView.setLevel(level)
    }

    override fun onSpeechError(message: String) {
        setStatus(message)
    }

    private fun setStatus(text: String) {
        ui.post { b.textStatus.text = text }
    }

    // ------------------------------------------------------------ 結束通話

    private fun confirmEnd() {
        AlertDialog.Builder(this)
            .setTitle(R.string.end_call_q)
            .setPositiveButton(R.string.hang_up) { _, _ -> endCall(notifyPeer = true) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun endCall(notifyPeer: Boolean) {
        if (ending) return
        ending = true
        ui.removeCallbacks(ringTimeout)
        ui.removeCallbacks(ticker)

        speech.stopListening()
        speech.stopSpeaking()

        val peerKey = Signaling.sanitize(peer)
        val transcript = adapter.snapshot()
        val duration = if (connected) (System.currentTimeMillis() - connectedAt) / 1000 else 0L

        io.execute {
            if (notifyPeer) {
                runCatching { signaling.put(Signaling.statePath(callId), Signaling.STATE_ENDED) }
                if (!connected) runCatching { signaling.delete(Signaling.incomingPath(peerKey)) }
            }
            history.save(
                CallRecord(
                    callId = callId,
                    peer = peer,
                    incoming = incoming,
                    startTs = startTs,
                    durationSec = duration,
                    answered = connected,
                    msgCount = transcript.size
                )
            )
            history.saveTranscript(callId, transcript)
        }

        stateStream?.close()
        msgStream?.close()
        routeAudioToSpeaker(false)
        finish()
    }

    override fun onDestroy() {
        isInCall = false
        stateStream?.close()
        msgStream?.close()
        speech.release()
        ui.removeCallbacksAndMessages(null)
        io.shutdown()
        super.onDestroy()
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private val seenKeys = java.util.Collections.synchronizedSet(HashSet<String>())

    companion object {
        private const val TAG = "CallActivity"
        private const val RING_TIMEOUT_MS = 45_000L

        /** 讓 CallService 知道現在是否已在通話中，才能對第二通來電回覆忙線。 */
        @Volatile
        var isInCall: Boolean = false

        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER = "peer"
        const val EXTRA_PEER_LANG = "peer_lang"
        const val EXTRA_INCOMING = "incoming"
        const val EXTRA_ACCEPTED = "accepted"

        fun intentFor(
            context: Context,
            callId: String,
            peer: String,
            peerLang: Lang,
            incoming: Boolean,
            alreadyAccepted: Boolean
        ): Intent = Intent(context, CallActivity::class.java)
            .putExtra(EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_PEER, peer)
            .putExtra(EXTRA_PEER_LANG, peerLang.apiCode)
            .putExtra(EXTRA_INCOMING, incoming)
            .putExtra(EXTRA_ACCEPTED, alreadyAccepted)
    }
}
