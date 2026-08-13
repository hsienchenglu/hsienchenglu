package com.hsienchenglu.zhidtalk

import org.json.JSONObject

/** 通話中的一句話：原文 + 譯文。 */
data class Msg(
    val id: String,
    val fromMe: Boolean,
    val srcLang: Lang,
    val src: String,
    val dst: String,
    val ts: Long
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("fromMe", fromMe)
        .put("srcLang", srcLang.apiCode)
        .put("src", src)
        .put("dst", dst)
        .put("ts", ts)

    companion object {
        fun fromJson(o: JSONObject): Msg = Msg(
            id = o.optString("id"),
            fromMe = o.optBoolean("fromMe"),
            srcLang = Lang.fromApiCode(o.optString("srcLang")),
            src = o.optString("src"),
            dst = o.optString("dst"),
            ts = o.optLong("ts")
        )
    }
}

/** 通話紀錄一筆。 */
data class CallRecord(
    val callId: String,
    val peer: String,
    val incoming: Boolean,
    val startTs: Long,
    var durationSec: Long,
    var answered: Boolean,
    var msgCount: Int
) {
    fun toJson(): JSONObject = JSONObject()
        .put("callId", callId)
        .put("peer", peer)
        .put("incoming", incoming)
        .put("startTs", startTs)
        .put("durationSec", durationSec)
        .put("answered", answered)
        .put("msgCount", msgCount)

    companion object {
        fun fromJson(o: JSONObject): CallRecord = CallRecord(
            callId = o.optString("callId"),
            peer = o.optString("peer"),
            incoming = o.optBoolean("incoming"),
            startTs = o.optLong("startTs"),
            durationSec = o.optLong("durationSec"),
            answered = o.optBoolean("answered"),
            msgCount = o.optInt("msgCount")
        )
    }
}
