package com.hsienchenglu.zhidtalk

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.hsienchenglu.zhidtalk.databinding.ActivityHistoryDetailBinding
import java.util.concurrent.Executors

/** 單筆通話的完整逐字稿，也可以直接在這裡刪掉這筆紀錄。 */
class HistoryDetailActivity : AppCompatActivity() {

    private lateinit var b: ActivityHistoryDetailBinding
    private lateinit var history: HistoryStore
    private lateinit var adapter: TranscriptAdapter
    private val io = Executors.newSingleThreadExecutor()

    private lateinit var callId: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityHistoryDetailBinding.inflate(layoutInflater)
        setContentView(b.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        history = HistoryStore(this)
        callId = intent.getStringExtra(EXTRA_CALL_ID).orEmpty()
        val peer = intent.getStringExtra(EXTRA_PEER).orEmpty()
        title = peer.ifEmpty { getString(R.string.history_detail) }

        adapter = TranscriptAdapter(mutableListOf())
        b.recyclerTranscript.layoutManager = LinearLayoutManager(this)
        b.recyclerTranscript.adapter = adapter

        b.btnDeleteRecord.setOnClickListener { confirmDelete() }

        io.execute {
            val msgs = history.loadTranscript(callId)
            runOnUiThread {
                adapter.replaceAll(msgs)
                b.textEmpty.visibility = if (msgs.isEmpty()) View.VISIBLE else View.GONE
            }
        }
    }

    private fun confirmDelete() {
        AlertDialog.Builder(this)
            .setTitle(R.string.delete_record_q)
            .setPositiveButton(R.string.delete) { _, _ ->
                io.execute {
                    history.delete(callId)
                    runOnUiThread { finish() }
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER = "peer"
    }
}
