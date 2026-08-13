package com.hsienchenglu.zhidtalk

import java.util.Locale

/**
 * 這個 App 只處理兩種語言：中文（繁體）與印尼文。
 *
 * 注意 Java/Android 的歷史包袱：印尼文的 ISO 語言碼在 Locale 內部是 "in"，
 * 但語音辨識與翻譯 API 使用的是 "id"。兩者分開存放，不要混用。
 */
enum class Lang(
    /** 翻譯 API 使用的語言碼 */
    val apiCode: String,
    /** SpeechRecognizer 的 EXTRA_LANGUAGE 標籤 */
    val sttTag: String,
    val labelRes: Int
) {
    ZH("zh-TW", "cmn-Hant-TW", R.string.lang_zh),
    ID("id", "id-ID", R.string.lang_id);

    /** TextToSpeech 用的 Locale */
    fun ttsLocale(): Locale = when (this) {
        ZH -> Locale.TRADITIONAL_CHINESE
        ID -> Locale("in", "ID")
    }

    /** 對話中的另一方語言 */
    fun other(): Lang = if (this == ZH) ID else ZH

    companion object {
        fun fromApiCode(code: String?): Lang =
            if (code != null && code.startsWith("id")) ID else ZH
    }
}
