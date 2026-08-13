package com.hsienchenglu.zhidtalk

import android.util.Log
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 用 Firebase Realtime Database 的 REST / SSE 介面做訊令（signaling）與逐句文字傳輸。
 *
 * 之所以不用 Firebase SDK：這樣就不需要 google-services.json 與額外的 Gradle plugin，
 * 使用者只要在設定頁貼上資料庫網址就能跑。
 *
 * 資料結構：
 *   users/{帳號}/incoming            → 該帳號目前的來電，沒有來電時為 null
 *   calls/{通話ID}/meta              → 雙方帳號與語言
 *   calls/{通話ID}/state             → ringing / accepted / ended
 *   calls/{通話ID}/msgs/{自動ID}     → 一句話（原文 + 譯文）
 */
class Signaling(private val prefs: Prefs) {

    private val json = "application/json; charset=utf-8".toMediaType()

    private val restClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val streamClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // SSE 必須不逾時
        .retryOnConnectionFailure(true)
        .build()

    private fun url(path: String): String {
        val base = prefs.dbUrl
        require(base.isNotEmpty()) { "尚未設定資料庫網址" }
        val p = path.trim('/')
        val auth = prefs.dbSecret
        return if (auth.isEmpty()) "$base/$p.json" else "$base/$p.json?auth=$auth"
    }

    /** 寫入（覆蓋）一個節點。value 可以是 JSONObject、字串或 null。 */
    @Throws(IOException::class)
    fun put(path: String, value: Any?) {
        val body = encode(value).toRequestBody(json)
        val req = Request.Builder().url(url(path)).put(body).build()
        restClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("PUT $path 失敗：HTTP ${resp.code}")
        }
    }

    /** 新增一筆到清單，回傳 Firebase 產生的鍵值。 */
    @Throws(IOException::class)
    fun push(path: String, value: Any?): String? {
        val body = encode(value).toRequestBody(json)
        val req = Request.Builder().url(url(path)).post(body).build()
        restClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("POST $path 失敗：HTTP ${resp.code}")
            val text = resp.body?.string() ?: return null
            return runCatching { JSONObject(text).optString("name", null) }.getOrNull()
        }
    }

    @Throws(IOException::class)
    fun delete(path: String) {
        val req = Request.Builder().url(url(path)).delete().build()
        restClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("DELETE $path 失敗：HTTP ${resp.code}")
        }
    }

    /** 讀取節點，回傳原始 JSON 字串（不存在時為 "null"）。 */
    @Throws(IOException::class)
    fun get(path: String): String? {
        val req = Request.Builder().url(url(path)).get().build()
        restClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("GET $path 失敗：HTTP ${resp.code}")
            return resp.body?.string()
        }
    }

    /** 連線測試，設定頁用。成功回傳 null，失敗回傳錯誤訊息。 */
    fun testConnection(): String? = try {
        put("healthcheck/${prefs.myAccount.ifEmpty { "anon" }}", System.currentTimeMillis().toString())
        null
    } catch (e: Exception) {
        e.message ?: e.toString()
    }

    private fun encode(value: Any?): String = when (value) {
        null -> "null"
        is JSONObject -> value.toString()
        is String -> JSONObject.quote(value)
        is Number, is Boolean -> value.toString()
        else -> JSONObject.quote(value.toString())
    }

    /**
     * 訂閱某個節點的變動。callback 在背景執行緒被呼叫。
     * 連線中斷時會自動重連，直到呼叫 [Stream.close]。
     */
    fun stream(path: String, listener: StreamListener): Stream {
        val stream = Stream(path, listener)
        stream.start()
        return stream
    }

    interface StreamListener {
        /**
         * @param path 相對於訂閱點的路徑，"/" 代表整個節點
         * @param data 該路徑的新內容，字串形式的 JSON；被刪除時為 "null"
         */
        fun onEvent(path: String, data: String)

        fun onError(t: Throwable) {}
    }

    inner class Stream(private val path: String, private val listener: StreamListener) {

        @Volatile
        private var closed = false

        @Volatile
        private var call: Call? = null

        private var thread: Thread? = null

        fun start() {
            val t = Thread({ loop() }, "sse-$path")
            t.isDaemon = true
            thread = t
            t.start()
        }

        private fun loop() {
            var backoff = 1000L
            while (!closed) {
                try {
                    val req = Request.Builder()
                        .url(url(path))
                        .header("Accept", "text/event-stream")
                        .header("Cache-Control", "no-cache")
                        .get()
                        .build()
                    val c = streamClient.newCall(req)
                    call = c
                    c.execute().use { resp ->
                        if (!resp.isSuccessful) throw IOException("串流連線失敗：HTTP ${resp.code}")
                        backoff = 1000L
                        val source = resp.body?.source() ?: throw IOException("串流沒有回應內容")
                        var event = ""
                        val data = StringBuilder()
                        while (!closed) {
                            val line = source.readUtf8Line() ?: break
                            when {
                                line.startsWith("event:") -> event = line.substringAfter("event:").trim()
                                line.startsWith("data:") -> {
                                    if (data.isNotEmpty()) data.append('\n')
                                    data.append(line.substringAfter("data:").trim())
                                }
                                line.isEmpty() -> {
                                    if (event == "put" || event == "patch") {
                                        dispatch(data.toString())
                                    }
                                    event = ""
                                    data.setLength(0)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    if (!closed) {
                        Log.w(TAG, "串流中斷 $path：${e.message}")
                        listener.onError(e)
                    }
                }
                if (closed) break
                try {
                    Thread.sleep(backoff)
                } catch (e: InterruptedException) {
                    break
                }
                backoff = (backoff * 2).coerceAtMost(15000L)
            }
        }

        private fun dispatch(raw: String) {
            if (raw.isEmpty()) return
            try {
                val obj = JSONObject(raw)
                val p = obj.optString("path", "/")
                val d = if (obj.isNull("data")) "null" else obj.get("data").toString()
                listener.onEvent(p, d)
            } catch (e: Exception) {
                Log.w(TAG, "無法解析串流事件：$raw")
            }
        }

        fun close() {
            closed = true
            runCatching { call?.cancel() }
            runCatching { thread?.interrupt() }
        }
    }

    companion object {
        private const val TAG = "Signaling"

        const val STATE_RINGING = "ringing"
        const val STATE_ACCEPTED = "accepted"
        const val STATE_REJECTED = "rejected"
        const val STATE_ENDED = "ended"

        fun incomingPath(account: String) = "users/${sanitize(account)}/incoming"
        fun callPath(callId: String) = "calls/$callId"
        fun statePath(callId: String) = "calls/$callId/state"
        fun metaPath(callId: String) = "calls/$callId/meta"
        fun msgsPath(callId: String) = "calls/$callId/msgs"

        /** Firebase 的鍵值不能含有 . $ # [ ] / 這些字元。 */
        fun sanitize(account: String): String =
            account.trim().lowercase().replace(Regex("[.$#\\[\\]/\\s]"), "_")
    }
}
