package com.hsienchenglu.zhidtalk

import android.content.Context
import android.content.SharedPreferences

/** 所有設定值的單一入口。 */
class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("zhid_prefs", Context.MODE_PRIVATE)

    /** 自己的帳號（對方要撥給你時輸入的名稱） */
    var myAccount: String
        get() = sp.getString(K_MY_ACCOUNT, "") ?: ""
        set(v) = sp.edit().putString(K_MY_ACCOUNT, v.trim()).apply()

    /** 常用的對方帳號，撥號畫面會預先帶入 */
    var peerAccount: String
        get() = sp.getString(K_PEER_ACCOUNT, "") ?: ""
        set(v) = sp.edit().putString(K_PEER_ACCOUNT, v.trim()).apply()

    /** 自己說的語言 */
    var myLang: Lang
        get() = Lang.fromApiCode(sp.getString(K_MY_LANG, Lang.ZH.apiCode))
        set(v) = sp.edit().putString(K_MY_LANG, v.apiCode).apply()

    /** Firebase Realtime Database 網址，例如 https://xxx-default-rtdb.firebaseio.com */
    var dbUrl: String
        get() = (sp.getString(K_DB_URL, "") ?: "").trim().trimEnd('/')
        set(v) = sp.edit().putString(K_DB_URL, v.trim().trimEnd('/')).apply()

    /** 資料庫密鑰，測試模式規則可留空 */
    var dbSecret: String
        get() = sp.getString(K_DB_SECRET, "") ?: ""
        set(v) = sp.edit().putString(K_DB_SECRET, v.trim()).apply()

    /** 翻譯服務供應商：google（Cloud Translation v2）、gemini 或 openai */
    var translateProvider: String
        get() = sp.getString(K_TR_PROVIDER, PROVIDER_GOOGLE) ?: PROVIDER_GOOGLE
        set(v) = sp.edit().putString(K_TR_PROVIDER, v).apply()

    var translateKey: String
        get() = sp.getString(K_TR_KEY, "") ?: ""
        set(v) = sp.edit().putString(K_TR_KEY, v.trim()).apply()

    /** 來電鈴聲要連續播放幾次 */
    var ringRepeat: Int
        get() = sp.getInt(K_RING_REPEAT, 2)
        set(v) = sp.edit().putInt(K_RING_REPEAT, v.coerceIn(1, 10)).apply()

    /** 通話中自動連續聆聽（關閉時改為手動按住說話） */
    var autoListen: Boolean
        get() = sp.getBoolean(K_AUTO_LISTEN, true)
        set(v) = sp.edit().putBoolean(K_AUTO_LISTEN, v).apply()

    /** 收到對方訊息時自動朗讀 */
    var autoSpeak: Boolean
        get() = sp.getBoolean(K_AUTO_SPEAK, true)
        set(v) = sp.edit().putBoolean(K_AUTO_SPEAK, v).apply()

    val isConfigured: Boolean
        get() = myAccount.isNotEmpty() && dbUrl.isNotEmpty() && translateKey.isNotEmpty()

    companion object {
        const val PROVIDER_GOOGLE = "google"
        const val PROVIDER_GEMINI = "gemini"
        const val PROVIDER_OPENAI = "openai"

        private const val K_MY_ACCOUNT = "my_account"
        private const val K_PEER_ACCOUNT = "peer_account"
        private const val K_MY_LANG = "my_lang"
        private const val K_DB_URL = "db_url"
        private const val K_DB_SECRET = "db_secret"
        private const val K_TR_PROVIDER = "tr_provider"
        private const val K_TR_KEY = "tr_key"
        private const val K_RING_REPEAT = "ring_repeat"
        private const val K_AUTO_LISTEN = "auto_listen"
        private const val K_AUTO_SPEAK = "auto_speak"
    }
}
