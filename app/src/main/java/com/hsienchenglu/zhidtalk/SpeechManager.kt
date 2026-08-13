package com.hsienchenglu.zhidtalk

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log

/**
 * 把手機內建的語音辨識與語音合成包成一個好用的物件。
 *
 * 兩個重點：
 *  1. SpeechRecognizer 只能在主執行緒操作，所有進出點都會轉回主執行緒。
 *  2. 朗讀譯文時必須停掉麥克風，否則會把喇叭的聲音再辨識一次，造成無限迴圈。
 */
class SpeechManager(
    private val context: Context,
    private var myLang: Lang,
    private val listener: Listener
) {

    interface Listener {
        /** 辨識中的暫時結果 */
        fun onPartial(text: String)

        /** 一句話辨識完成 */
        fun onResult(text: String)

        /** 麥克風狀態改變 */
        fun onListeningChanged(listening: Boolean)

        /** 音量大小，0f~1f，可用來畫動畫 */
        fun onRms(level: Float) {}

        fun onSpeechError(message: String) {}
    }

    private val main = Handler(Looper.getMainLooper())

    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null

    /** 使用者希望持續聆聽 */
    @Volatile
    var wantListening: Boolean = false
        private set

    /** 辨識器目前實際上正在錄音 */
    private var recognizing = false

    /** 正在朗讀，這段期間不錄音 */
    private var speaking = false

    private var ttsReady = false
    private val pendingSpeech = ArrayDeque<Pair<String, Lang>>()

    fun init() {
        main.post {
            tts = TextToSpeech(context) { status ->
                ttsReady = status == TextToSpeech.SUCCESS
                if (ttsReady) {
                    applyTtsListener()
                    flushPending()
                } else {
                    listener.onSpeechError(context.getString(R.string.err_tts_init))
                }
            }
        }
    }

    fun setMyLang(lang: Lang) {
        myLang = lang
    }

    // ---------------------------------------------------------------- 語音辨識

    fun startListening() {
        wantListening = true
        main.post { beginRecognition() }
    }

    fun stopListening() {
        wantListening = false
        main.post {
            recognizing = false
            runCatching { recognizer?.stopListening() }
            runCatching { recognizer?.cancel() }
            listener.onListeningChanged(false)
        }
    }

    fun toggleListening() {
        if (wantListening) stopListening() else startListening()
    }

    private fun beginRecognition() {
        if (!wantListening || recognizing || speaking) return
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            wantListening = false
            listener.onSpeechError(context.getString(R.string.err_stt_unavailable))
            listener.onListeningChanged(false)
            return
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                setRecognitionListener(recognitionListener)
            }
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, myLang.sttTag)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, myLang.sttTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            // 講完後 1.2 秒沒聲音就送出，通話中的節奏比較自然
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        }
        try {
            recognizer?.startListening(intent)
            recognizing = true
            listener.onListeningChanged(true)
        } catch (e: Exception) {
            recognizing = false
            listener.onSpeechError(e.message ?: context.getString(R.string.err_stt_start))
            scheduleRestart(1500)
        }
    }

    private fun scheduleRestart(delayMs: Long) {
        main.postDelayed({ beginRecognition() }, delayMs)
    }

    private fun recreateRecognizer() {
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {
            listener.onRms(((rmsdB + 2f) / 12f).coerceIn(0f, 1f))
        }

        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
            recognizing = false
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                    // 只是沒聽到話，安靜地重新開始
                    if (wantListening) scheduleRestart(200)
                }

                SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
                SpeechRecognizer.ERROR_CLIENT -> {
                    recreateRecognizer()
                    if (wantListening) scheduleRestart(600)
                }

                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    wantListening = false
                    listener.onSpeechError(context.getString(R.string.err_mic_permission))
                    listener.onListeningChanged(false)
                }

                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> {
                    listener.onSpeechError(context.getString(R.string.err_stt_network))
                    if (wantListening) scheduleRestart(2000)
                }

                else -> {
                    Log.w(TAG, "語音辨識錯誤：$error")
                    if (wantListening) scheduleRestart(1000)
                }
            }
            if (!wantListening) listener.onListeningChanged(false)
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val text = firstOf(partialResults)
            if (!text.isNullOrBlank()) listener.onPartial(text)
        }

        override fun onResults(results: Bundle?) {
            recognizing = false
            val text = firstOf(results)
            if (!text.isNullOrBlank()) listener.onResult(text.trim())
            if (wantListening) scheduleRestart(150)
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}

        private fun firstOf(bundle: Bundle?): String? =
            bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
    }

    // ---------------------------------------------------------------- 語音合成

    /** 朗讀一段文字。朗讀期間會自動暫停麥克風。 */
    fun speak(text: String, lang: Lang) {
        if (text.isBlank()) return
        main.post {
            if (!ttsReady) {
                pendingSpeech.addLast(text to lang)
                return@post
            }
            val engine = tts ?: return@post
            val result = engine.setLanguage(lang.ttsLocale())
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                listener.onSpeechError(
                    context.getString(R.string.err_tts_lang, context.getString(lang.labelRes))
                )
                return@post
            }
            // 先停麥克風，避免朗讀的聲音被自己聽進去
            speaking = true
            recognizing = false
            runCatching { recognizer?.cancel() }
            listener.onListeningChanged(false)

            engine.setSpeechRate(0.95f)
            engine.speak(text, TextToSpeech.QUEUE_ADD, null, UTTERANCE_ID)
        }
    }

    private fun applyTtsListener() {
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}

            override fun onDone(utteranceId: String?) {
                main.post { finishSpeaking() }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                main.post { finishSpeaking() }
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                main.post { finishSpeaking() }
            }
        })
    }

    private fun finishSpeaking() {
        if (tts?.isSpeaking == true) return // 佇列裡還有下一句
        speaking = false
        if (wantListening) scheduleRestart(250)
    }

    private fun flushPending() {
        while (pendingSpeech.isNotEmpty()) {
            val (text, lang) = pendingSpeech.removeFirst()
            speak(text, lang)
        }
    }

    fun stopSpeaking() {
        main.post {
            runCatching { tts?.stop() }
            finishSpeaking()
        }
    }

    fun release() {
        wantListening = false
        main.post {
            runCatching { recognizer?.destroy() }
            recognizer = null
            runCatching {
                tts?.stop()
                tts?.shutdown()
            }
            tts = null
            ttsReady = false
        }
    }

    companion object {
        private const val TAG = "SpeechManager"
        private const val UTTERANCE_ID = "zhid"
    }
}
