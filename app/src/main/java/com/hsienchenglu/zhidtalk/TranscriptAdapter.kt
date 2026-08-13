package com.hsienchenglu.zhidtalk

import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * 對話逐句列表。自己說的話靠右，對方的話靠左；
 * 每則都同時顯示原文（小字）與譯文（大字）。
 */
class TranscriptAdapter(private val items: MutableList<Msg>) :
    RecyclerView.Adapter<TranscriptAdapter.VH>() {

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val bubble: LinearLayout = view.findViewById(R.id.bubble)
        val textSrc: TextView = view.findViewById(R.id.textSrc)
        val textDst: TextView = view.findViewById(R.id.textDst)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_msg, parent, false)
        return VH(v)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val msg = items[position]
        val ctx = holder.itemView.context

        // 自己的訊息：上面是我說的原文，下面是送出去的譯文
        // 對方的訊息：上面是對方的原文，下面是翻成我看得懂的譯文
        holder.textSrc.text = msg.src
        holder.textDst.text = msg.dst
        holder.textDst.visibility = if (msg.dst.isBlank()) View.GONE else View.VISIBLE

        val lp = holder.bubble.layoutParams as FrameLayout.LayoutParams
        lp.gravity = if (msg.fromMe) Gravity.END else Gravity.START
        holder.bubble.layoutParams = lp
        holder.bubble.setBackgroundResource(
            if (msg.fromMe) R.drawable.bg_bubble_mine else R.drawable.bg_bubble_theirs
        )
        val srcColor = if (msg.fromMe) R.color.bubble_mine_sub else R.color.bubble_theirs_sub
        val dstColor = if (msg.fromMe) R.color.bubble_mine_text else R.color.bubble_theirs_text
        holder.textSrc.setTextColor(ctx.getColor(srcColor))
        holder.textDst.setTextColor(ctx.getColor(dstColor))
    }

    fun add(msg: Msg) {
        items.add(msg)
        notifyItemInserted(items.size - 1)
    }

    fun replaceAll(newItems: List<Msg>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    fun snapshot(): List<Msg> = items.toList()
}
