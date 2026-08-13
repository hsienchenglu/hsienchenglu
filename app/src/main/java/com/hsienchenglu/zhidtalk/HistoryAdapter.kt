package com.hsienchenglu.zhidtalk

import android.annotation.SuppressLint
import android.content.Context
import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/** 通話紀錄列表。點一筆看完整逐字稿，右側按鈕刪除單筆。 */
class HistoryAdapter(
    private val items: MutableList<CallRecord>,
    private val onOpen: (CallRecord) -> Unit,
    private val onDelete: (CallRecord) -> Unit
) : RecyclerView.Adapter<HistoryAdapter.VH>() {

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.iconDirection)
        val peer: TextView = view.findViewById(R.id.textPeer)
        val meta: TextView = view.findViewById(R.id.textMeta)
        val time: TextView = view.findViewById(R.id.textTime)
        val delete: ImageButton = view.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_history, parent, false))

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = items[position]
        val ctx = holder.itemView.context

        holder.peer.text = r.peer
        holder.time.text = relativeTime(ctx, r.startTs)
        holder.meta.text = metaText(ctx, r)

        val (iconRes, tint) = when {
            !r.answered && r.incoming -> R.drawable.ic_call_missed to R.color.missed
            r.incoming -> R.drawable.ic_call_in to R.color.text_secondary
            else -> R.drawable.ic_call_out to R.color.text_secondary
        }
        holder.icon.setImageResource(iconRes)
        holder.icon.setColorFilter(ctx.getColor(tint))

        holder.itemView.setOnClickListener { onOpen(r) }
        holder.itemView.setOnLongClickListener {
            onDelete(r)
            true
        }
        holder.delete.setOnClickListener { onDelete(r) }
    }

    private fun metaText(ctx: Context, r: CallRecord): String {
        val head = when {
            !r.answered && r.incoming -> ctx.getString(R.string.call_missed)
            !r.answered -> ctx.getString(R.string.call_no_answer)
            else -> ctx.getString(R.string.duration_fmt, HistoryStore.formatDuration(r.durationSec))
        }
        return if (r.msgCount > 0) {
            head + " · " + ctx.getString(R.string.sentence_count, r.msgCount)
        } else {
            head
        }
    }

    private fun relativeTime(ctx: Context, ts: Long): CharSequence =
        DateUtils.getRelativeDateTimeString(
            ctx,
            ts,
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.WEEK_IN_MILLIS,
            0
        ) ?: ""

    @SuppressLint("NotifyDataSetChanged")
    fun replaceAll(newItems: List<CallRecord>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }
}
