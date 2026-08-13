package com.hsienchenglu.zhidtalk

import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 中文 ↔ 印尼文的文字翻譯。
 *
 * 支援兩種金鑰：
 *  - Google Cloud Translation API v2（付費，延遲最低，建議通話使用）
 *  - Gemini API（用生成模型翻譯，免費額度較友善）
 */
class TranslateClient(private val prefs: Prefs) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /** 同步翻譯，請在背景執行緒呼叫。失敗時丟出 IOException。 */
    @Throws(IOException::class)
    fun translate(text: String, from: Lang, to: Lang): String {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return ""
        if (from == to) return trimmed
        val key = prefs.translateKey
        if (key.isEmpty()) throw IOException("尚未設定翻譯 API 金鑰")
        return when (prefs.translateProvider) {
            Prefs.PROVIDER_GEMINI -> translateWithGemini(trimmed, from, to, key)
            Prefs.PROVIDER_OPENAI -> translateWithOpenAI(trimmed, from, to, key)
            else -> translateWithGoogle(trimmed, from, to, key)
        }
    }

    private fun translateWithGoogle(text: String, from: Lang, to: Lang, key: String): String {
        val body = FormBody.Builder()
            .add("q", text)
            .add("source", from.apiCode)
            .add("target", to.apiCode)
            .add("format", "text")
            .build()
        val req = Request.Builder()
            .url("https://translation.googleapis.com/language/translate/v2?key=$key")
            .post(body)
            .build()
        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IOException(errorOf(raw, resp.code))
            val translations = JSONObject(raw)
                .optJSONObject("data")
                ?.optJSONArray("translations")
                ?: throw IOException("翻譯服務回應格式不符")
            if (translations.length() == 0) throw IOException("翻譯服務沒有回傳結果")
            return unescapeHtml(translations.getJSONObject(0).optString("translatedText"))
        }
    }

    private fun translateWithGemini(text: String, from: Lang, to: Lang, key: String): String {
        val fromName = if (from == Lang.ZH) "Traditional Chinese" else "Indonesian"
        val toName = if (to == Lang.ZH) "Traditional Chinese" else "Indonesian"
        val prompt = "Translate the following $fromName speech transcript into $toName. " +
            "It is one utterance from a live phone conversation, so keep it colloquial and natural. " +
            "Reply with the translation only, no quotes, no explanation, no romanisation.\n\n$text"

        val payload = JSONObject().apply {
            put(
                "contents",
                JSONArray().put(
                    JSONObject().put(
                        "parts",
                        JSONArray().put(JSONObject().put("text", prompt))
                    )
                )
            )
            put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.2)
                    .put("maxOutputTokens", 512)
            )
        }

        val req = Request.Builder()
            .url("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$key")
            .post(payload.toString().toRequestBody(jsonType))
            .build()

        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IOException(errorOf(raw, resp.code))
            val parts = JSONObject(raw)
                .optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?: throw IOException("翻譯服務回應格式不符")
            val sb = StringBuilder()
            for (i in 0 until parts.length()) {
                sb.append(parts.optJSONObject(i)?.optString("text").orEmpty())
            }
            val out = sb.toString().trim()
            if (out.isEmpty()) throw IOException("翻譯服務沒有回傳結果")
            return out
        }
    }

    private fun translateWithOpenAI(text: String, from: Lang, to: Lang, key: String): String {
        val fromName = if (from == Lang.ZH) "Traditional Chinese" else "Indonesian"
        val toName = if (to == Lang.ZH) "Traditional Chinese" else "Indonesian"
        val system = "You translate $fromName into $toName for a live phone call. " +
            "Each input is one spoken utterance. Keep it colloquial and natural. " +
            "Reply with the translation only — no quotes, no explanation, no romanisation."

        val payload = JSONObject().apply {
            put("model", "gpt-4o-mini")
            put("temperature", 0.2)
            put(
                "messages",
                JSONArray()
                    .put(JSONObject().put("role", "system").put("content", system))
                    .put(JSONObject().put("role", "user").put("content", text))
            )
        }

        val req = Request.Builder()
            .url("https://api.openai.com/v1/chat/completions")
            .header("Authorization", "Bearer $key")
            .post(payload.toString().toRequestBody(jsonType))
            .build()

        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IOException(errorOf(raw, resp.code))
            val out = JSONObject(raw)
                .optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                ?.trim()
                ?: throw IOException("翻譯服務回應格式不符")
            if (out.isEmpty()) throw IOException("翻譯服務沒有回傳結果")
            return out
        }
    }

    private fun errorOf(raw: String, code: Int): String {
        val msg = runCatching {
            JSONObject(raw).optJSONObject("error")?.optString("message")
        }.getOrNull()
        return if (msg.isNullOrEmpty()) "翻譯失敗：HTTP $code" else "翻譯失敗：$msg"
    }

    /** Cloud Translation v2 會把譯文做 HTML 跳脫。 */
    private fun unescapeHtml(s: String): String = s
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}
