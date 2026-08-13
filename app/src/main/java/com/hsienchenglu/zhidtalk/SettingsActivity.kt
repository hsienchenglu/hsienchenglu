package com.hsienchenglu.zhidtalk

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hsienchenglu.zhidtalk.databinding.ActivitySettingsBinding
import java.util.concurrent.Executors

/** 設定頁：帳號、語言、訊令資料庫、翻譯金鑰、鈴聲次數。 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var b: ActivitySettingsBinding
    private lateinit var prefs: Prefs
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(b.root)

        prefs = Prefs(this)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        load()

        b.btnSave.setOnClickListener { if (save()) finish() }
        b.btnTest.setOnClickListener { testConnection() }
        b.sliderRing.addOnChangeListener { _, value, _ ->
            b.textRingValue.text = getString(R.string.ring_times_fmt, value.toInt())
        }
    }

    private fun load() {
        b.editMyAccount.setText(prefs.myAccount)
        b.editPeerAccount.setText(prefs.peerAccount)
        b.editDbUrl.setText(prefs.dbUrl)
        b.editDbSecret.setText(prefs.dbSecret)
        b.editApiKey.setText(prefs.translateKey)

        if (prefs.myLang == Lang.ZH) b.radioZh.isChecked = true else b.radioId.isChecked = true
        if (prefs.translateProvider == Prefs.PROVIDER_GEMINI) {
            b.radioGemini.isChecked = true
        } else {
            b.radioGoogle.isChecked = true
        }

        b.sliderRing.value = prefs.ringRepeat.toFloat()
        b.textRingValue.text = getString(R.string.ring_times_fmt, prefs.ringRepeat)
        b.switchAutoListen.isChecked = prefs.autoListen
        b.switchAutoSpeak.isChecked = prefs.autoSpeak
    }

    private fun save(): Boolean {
        val account = b.editMyAccount.text?.toString()?.trim().orEmpty()
        if (account.isEmpty()) {
            b.editMyAccount.error = getString(R.string.err_account_required)
            return false
        }
        val dbUrl = b.editDbUrl.text?.toString()?.trim().orEmpty()
        if (dbUrl.isNotEmpty() && !dbUrl.startsWith("https://")) {
            b.editDbUrl.error = getString(R.string.err_db_url)
            return false
        }

        prefs.myAccount = account
        prefs.peerAccount = b.editPeerAccount.text?.toString()?.trim().orEmpty()
        prefs.dbUrl = dbUrl
        prefs.dbSecret = b.editDbSecret.text?.toString()?.trim().orEmpty()
        prefs.translateKey = b.editApiKey.text?.toString()?.trim().orEmpty()
        prefs.myLang = if (b.radioZh.isChecked) Lang.ZH else Lang.ID
        prefs.translateProvider =
            if (b.radioGemini.isChecked) Prefs.PROVIDER_GEMINI else Prefs.PROVIDER_GOOGLE
        prefs.ringRepeat = b.sliderRing.value.toInt()
        prefs.autoListen = b.switchAutoListen.isChecked
        prefs.autoSpeak = b.switchAutoSpeak.isChecked

        // 帳號可能換了，讓監聽服務重新訂閱
        CallService.start(this)
        toast(getString(R.string.saved))
        return true
    }

    /** 一次驗證兩件事：訊令資料庫寫得進去，翻譯金鑰能用。 */
    private fun testConnection() {
        if (!save()) return
        b.btnTest.isEnabled = false
        b.textTestResult.text = getString(R.string.testing)

        io.execute {
            val dbError = Signaling(prefs).testConnection()
            val translateError = try {
                val sample = TranslateClient(prefs).translate("你好", Lang.ZH, Lang.ID)
                if (sample.isBlank()) getString(R.string.err_translate) else null
            } catch (e: Exception) {
                e.message ?: getString(R.string.err_translate)
            }

            runOnUiThread {
                b.btnTest.isEnabled = true
                b.textTestResult.text = when {
                    dbError != null -> getString(R.string.test_db_fail, dbError)
                    translateError != null -> getString(R.string.test_tr_fail, translateError)
                    else -> getString(R.string.test_ok)
                }
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }
}
