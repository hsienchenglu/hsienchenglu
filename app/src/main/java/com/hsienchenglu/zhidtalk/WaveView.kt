package com.hsienchenglu.zhidtalk

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

/** 麥克風音量的簡單長條動畫，讓使用者知道系統確實有聽到聲音。 */
class WaveView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0
) : View(context, attrs, defStyle) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.accent)
    }

    private val bars = FloatArray(BAR_COUNT)
    private var level = 0f

    fun setLevel(value: Float) {
        level = value.coerceIn(0f, 1f)
        // 往左推移，形成流動的感覺
        for (i in 0 until BAR_COUNT - 1) bars[i] = bars[i + 1]
        bars[BAR_COUNT - 1] = level
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        val gap = w / BAR_COUNT * 0.35f
        val barW = w / BAR_COUNT - gap
        val radius = barW / 2f
        for (i in 0 until BAR_COUNT) {
            val amp = max(bars[i], 0.06f)
            val barH = h * amp
            val left = i * (barW + gap)
            val top = (h - barH) / 2f
            canvas.drawRoundRect(left, top, left + barW, top + barH, radius, radius, paint)
        }
    }

    companion object {
        private const val BAR_COUNT = 24
    }
}
