package com.hsienchenglu.zhidtalk

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 通話紀錄與逐句對話的本機儲存。資料量小，用 JSON 檔即可，不必動用資料庫。
 * 所有資料只留在手機上，刪除即真的刪除。
 */
class HistoryStore(context: Context) {

    private val dir: File = File(context.applicationContext.filesDir, "history").apply { mkdirs() }
    private val indexFile = File(dir, "calls.json")

    @Synchronized
    fun list(): MutableList<CallRecord> {
        if (!indexFile.exists()) return mutableListOf()
        return try {
            val arr = JSONArray(indexFile.readText())
            val out = ArrayList<CallRecord>(arr.length())
            for (i in 0 until arr.length()) {
                out.add(CallRecord.fromJson(arr.getJSONObject(i)))
            }
            out.sortByDescending { it.startTs }
            out
        } catch (e: Exception) {
            Log.w(TAG, "讀取通話紀錄失敗：${e.message}")
            mutableListOf()
        }
    }

    @Synchronized
    fun save(record: CallRecord) {
        val all = list()
        val idx = all.indexOfFirst { it.callId == record.callId }
        if (idx >= 0) all[idx] = record else all.add(record)
        writeIndex(all)
    }

    @Synchronized
    fun delete(callId: String) {
        val all = list().filterNot { it.callId == callId }
        writeIndex(all)
        transcriptFile(callId).delete()
    }

    @Synchronized
    fun clearAll() {
        indexFile.delete()
        dir.listFiles()?.forEach { if (it.name.startsWith("t_")) it.delete() }
    }

    @Synchronized
    fun saveTranscript(callId: String, msgs: List<Msg>) {
        if (msgs.isEmpty()) return
        val arr = JSONArray()
        msgs.forEach { arr.put(it.toJson()) }
        runCatching { transcriptFile(callId).writeText(arr.toString()) }
            .onFailure { Log.w(TAG, "寫入逐句紀錄失敗：${it.message}") }
    }

    @Synchronized
    fun loadTranscript(callId: String): List<Msg> {
        val f = transcriptFile(callId)
        if (!f.exists()) return emptyList()
        return try {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).map { Msg.fromJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            Log.w(TAG, "讀取逐句紀錄失敗：${e.message}")
            emptyList()
        }
    }

    private fun writeIndex(records: List<CallRecord>) {
        val arr = JSONArray()
        records.forEach { arr.put(it.toJson()) }
        runCatching { indexFile.writeText(arr.toString()) }
            .onFailure { Log.w(TAG, "寫入通話紀錄失敗：${it.message}") }
    }

    private fun transcriptFile(callId: String) = File(dir, "t_${sanitizeFileName(callId)}.json")

    private fun sanitizeFileName(s: String) = s.replace(Regex("[^A-Za-z0-9_-]"), "_")

    /** 給列表用的簡短標題。 */
    fun summaryOf(r: CallRecord, ctx: Context): String = when {
        !r.answered && r.incoming -> ctx.getString(R.string.call_missed)
        !r.answered -> ctx.getString(R.string.call_no_answer)
        else -> formatDuration(r.durationSec)
    }

    companion object {
        private const val TAG = "HistoryStore"

        fun formatDuration(sec: Long): String {
            val m = sec / 60
            val s = sec % 60
            return String.format("%02d:%02d", m, s)
        }

        fun newCallId(): String =
            System.currentTimeMillis().toString(36) + "_" + (1000..9999).random().toString(36)

        /** 給 JSONObject 讀取用的小工具。 */
        fun optObject(raw: String?): JSONObject? = try {
            if (raw.isNullOrEmpty() || raw == "null") null else JSONObject(raw)
        } catch (e: Exception) {
            null
        }
    }
}
