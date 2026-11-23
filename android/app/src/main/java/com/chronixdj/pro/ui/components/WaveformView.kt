package com.chronixdj.pro.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import com.chronixdj.pro.model.DeckState
import com.chronixdj.pro.model.WaveformPeak
import com.chronixdj.pro.ui.theme.ChronixColors
import kotlin.math.ceil
import kotlin.math.floor

private fun sampleInterpolatedPeak(peaks: List<WaveformPeak>, floatIdx: Float): WaveformPeak {
    if (peaks.isEmpty()) return WaveformPeak(0f, 0f, 0f, 0f)
    val clamped = floatIdx.coerceIn(0f, peaks.lastIndex.toFloat())
    val lo = floor(clamped).toInt()
    val hi = (lo + 1).coerceAtMost(peaks.lastIndex)
    val t = clamped - lo
    val a = peaks[lo]
    val b = peaks[hi]
    return WaveformPeak(
        amplitude = a.amplitude + (b.amplitude - a.amplitude) * t,
        lowEnergy = a.lowEnergy + (b.lowEnergy - a.lowEnergy) * t,
        midEnergy = a.midEnergy + (b.midEnergy - a.midEnergy) * t,
        highEnergy = a.highEnergy + (b.highEnergy - a.highEnergy) * t
    )
}

@Composable
fun DualVerticalWaveformView(
    deckA: DeckState,
    deckB: DeckState,
    zoom: Float,
    scrollSpeed: Float,
    showBeatGrid: Boolean,
    liteMode: Boolean,
    onSeekA: (Long) -> Unit,
    onSeekB: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val pxPerSecBase = 36f * zoom.coerceAtLeast(0.5f) * scrollSpeed.coerceAtLeast(0.5f)
    Canvas(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF040507))
            .pointerInput(deckA.durationMs, deckB.durationMs, pxPerSecBase) {
                var activeLaneA = true
                detectVerticalDragGestures(
                    onDragStart = { offset ->
                        activeLaneA = offset.x < size.width / 2f
                    },
                    onVerticalDrag = { change, dragAmount ->
                        change.consume()
                        val deck = if (activeLaneA) deckA else deckB
                        val rate = (1f + deck.pitchPercent / 100f).coerceIn(0.5f, 1.5f)
                        val pxPerSec = pxPerSecBase * density
                        val deltaMs = ((-dragAmount / pxPerSec) * rate * 1000f).toLong()
                        if (activeLaneA && deckA.durationMs > 0L) {
                            onSeekA((deckA.positionMs + deltaMs).coerceIn(0L, deckA.durationMs))
                        } else if (!activeLaneA && deckB.durationMs > 0L) {
                            onSeekB((deckB.positionMs + deltaMs).coerceIn(0L, deckB.durationMs))
                        }
                    }
                )
            }
    ) {
        val midX = size.width / 2f
        val playheadY = size.height * 0.25f
        val pxPerSec = pxPerSecBase * density

        drawLine(
            color = Color(0xFF2D333E),
            start = Offset(midX, 0f),
            end = Offset(midX, size.height),
            strokeWidth = 1.5f
        )

        drawVerticalLane(
            deck = deckA,
            centerX = midX * 0.5f,
            maxHalfWidth = midX * 0.44f,
            playheadY = playheadY,
            pxPerSec = pxPerSec,
            showBeatGrid = showBeatGrid,
            liteMode = liteMode,
            lowColor = ChronixColors.DeckABlue,
            midColor = ChronixColors.DeckACyan,
            highColor = Color(0xFFE0F2FE)
        )

        drawVerticalLane(
            deck = deckB,
            centerX = midX + midX * 0.5f,
            maxHalfWidth = midX * 0.44f,
            playheadY = playheadY,
            pxPerSec = pxPerSec,
            showBeatGrid = showBeatGrid,
            liteMode = liteMode,
            lowColor = ChronixColors.DeckBOrange,
            midColor = ChronixColors.DeckBAmber,
            highColor = Color(0xFFFEF3C7)
        )

        drawLine(
            color = Color.White,
            start = Offset(0f, playheadY),
            end = Offset(size.width, playheadY),
            strokeWidth = 2.5f
        )
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawVerticalLane(
    deck: DeckState,
    centerX: Float,
    maxHalfWidth: Float,
    playheadY: Float,
    pxPerSec: Float,
    showBeatGrid: Boolean,
    liteMode: Boolean,
    lowColor: Color,
    midColor: Color,
    highColor: Color
) {
    val peaks = deck.waveform
    if (peaks.isEmpty() || deck.durationMs <= 0L) return
    val durationSec = deck.durationMs / 1000f
    val posSec = deck.positionMs / 1000f
    val secPerPx = 1f / pxPerSec
    val laneLeft = centerX - maxHalfWidth
    val laneWidth = maxHalfWidth * 2f

    val rate = (1f + deck.pitchPercent / 100f).coerceIn(0.5f, 1.5f)

    if (deck.loopActive && deck.loopEndMs > deck.loopStartMs) {
        val y1 = playheadY + (((deck.loopStartMs / 1000f) - posSec) / rate) * pxPerSec
        val y2 = playheadY + (((deck.loopEndMs / 1000f) - posSec) / rate) * pxPerSec
        val top = minOf(y1, y2).coerceIn(0f, size.height)
        val bot = maxOf(y1, y2).coerceIn(0f, size.height)
        if (bot > top) {
            drawRect(
                color = Color(0x284CAF50),
                topLeft = Offset(laneLeft, top),
                size = Size(laneWidth, bot - top)
            )
        }
    }

    val stepPx = (if (liteMode) 3.5f else 2f) * density
    var y = 0f
    while (y < size.height) {
        val timeAtY = posSec + (y - playheadY) * secPerPx * rate
        if (timeAtY in 0f..durationSec) {
            val floatIdx = (timeAtY / durationSec) * peaks.lastIndex
            val p = sampleInterpolatedPeak(peaks, floatIdx)
            val halfW = p.amplitude * maxHalfWidth
            val c = when {
                p.highEnergy > 0.55f -> highColor
                p.midEnergy > p.lowEnergy -> midColor
                else -> lowColor
            }
            drawLine(
                color = c,
                start = Offset(centerX - halfW, y),
                end = Offset(centerX + halfW, y),
                strokeWidth = stepPx
            )
        }
        y += stepPx
    }

    if (showBeatGrid && deck.detectedBpm > 0f) {
        val beatSecBuf = 60f / deck.detectedBpm
        val anchor = deck.beatOffsetMs / 1000f
        val startSec = (posSec - playheadY * secPerPx * rate).coerceAtLeast(0f)
        val endSec = (posSec + (size.height - playheadY) * secPerPx * rate).coerceAtMost(durationSec)
        val firstBeat = ceil((startSec - anchor) / beatSecBuf).toInt()
        val lastBeat = floor((endSec - anchor) / beatSecBuf).toInt()
        for (b in firstBeat..lastBeat) {
            val beatBuf = anchor + b * beatSecBuf
            val by = playheadY + ((beatBuf - posSec) / rate) * pxPerSec
            val isBar = ((b % 4) + 4) % 4 == 0
            drawLine(
                color = if (isBar) Color(0x70FFFFFF) else Color(0x26FFFFFF),
                start = Offset(laneLeft, by),
                end = Offset(laneLeft + laneWidth, by),
                strokeWidth = if (isBar) 2f else 1f
            )
        }
    }

    deck.hotCues.forEach { cue ->
        val cueMs = cue.positionMs ?: return@forEach
        val cy = playheadY + (((cueMs / 1000f) - posSec) / rate) * pxPerSec
        if (cy in 0f..size.height) {
            drawLine(
                color = ChronixColors.ActiveGreen,
                start = Offset(laneLeft, cy),
                end = Offset(laneLeft + laneWidth, cy),
                strokeWidth = 3f
            )
        }
    }
}

@Composable
fun ParallelScrollingWaveformView(
    deckA: DeckState,
    deckB: DeckState,
    zoom: Float,
    scrollSpeed: Float,
    showBeatGrid: Boolean,
    liteMode: Boolean,
    onSeekA: (Long) -> Unit,
    onSeekB: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val pxPerSecBase = 64f * zoom.coerceAtLeast(0.5f) * scrollSpeed.coerceAtLeast(0.5f)
    Canvas(
        modifier = modifier
            .background(Color(0xFF05070A))
            .pointerInput(deckA.durationMs, deckB.durationMs, pxPerSecBase) {
                var activeLaneA = true
                detectHorizontalDragGestures(
                    onDragStart = { offset ->
                        activeLaneA = offset.y < size.height / 2f
                    },
                    onHorizontalDrag = { change, dragAmount ->
                        change.consume()
                        val deck = if (activeLaneA) deckA else deckB
                        val rate = (1f + deck.pitchPercent / 100f).coerceIn(0.5f, 1.5f)
                        val pxPerSec = pxPerSecBase * density
                        val deltaMs = ((-dragAmount / pxPerSec) * rate * 1000f).toLong()
                        if (activeLaneA && deckA.durationMs > 0L) {
                            onSeekA((deckA.positionMs + deltaMs).coerceIn(0L, deckA.durationMs))
                        } else if (!activeLaneA && deckB.durationMs > 0L) {
                            onSeekB((deckB.positionMs + deltaMs).coerceIn(0L, deckB.durationMs))
                        }
                    }
                )
            }
    ) {
        val midY = size.height / 2f
        val playheadX = size.width * 0.34f
        val pxPerSec = pxPerSecBase * density

        drawLine(
            color = Color(0x33FFFFFF),
            start = Offset(0f, midY),
            end = Offset(size.width, midY),
            strokeWidth = 1f
        )

        drawHorizontalLane(
            deck = deckA,
            laneTop = 1f,
            laneHeight = midY - 2f,
            playheadX = playheadX,
            pxPerSec = pxPerSec,
            showBeatGrid = showBeatGrid,
            liteMode = liteMode,
            lowColor = ChronixColors.DeckABlue,
            midColor = ChronixColors.DeckACyan,
            highColor = Color(0xFFE0F2FE)
        )

        drawHorizontalLane(
            deck = deckB,
            laneTop = midY + 1f,
            laneHeight = midY - 2f,
            playheadX = playheadX,
            pxPerSec = pxPerSec,
            showBeatGrid = showBeatGrid,
            liteMode = liteMode,
            lowColor = ChronixColors.DeckBOrange,
            midColor = ChronixColors.DeckBAmber,
            highColor = Color(0xFFFEF3C7)
        )

        drawLine(
            color = Color.White,
            start = Offset(playheadX, 0f),
            end = Offset(playheadX, size.height),
            strokeWidth = 2.5f
        )
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawHorizontalLane(
    deck: DeckState,
    laneTop: Float,
    laneHeight: Float,
    playheadX: Float,
    pxPerSec: Float,
    showBeatGrid: Boolean,
    liteMode: Boolean,
    lowColor: Color,
    midColor: Color,
    highColor: Color
) {
    val peaks = deck.waveform
    if (peaks.isEmpty() || deck.durationMs <= 0L) return
    val durationSec = deck.durationMs / 1000f
    val posSec = deck.positionMs / 1000f
    val secPerPx = 1f / pxPerSec
    val centerY = laneTop + laneHeight / 2f
    val maxHalfH = laneHeight * 0.44f

    val rate = (1f + deck.pitchPercent / 100f).coerceIn(0.5f, 1.5f)
    val stepPx = (if (liteMode) 3.5f else 2f) * density
    var x = 0f
    while (x < size.width) {
        val timeAtX = posSec + (x - playheadX) * secPerPx * rate
        if (timeAtX in 0f..durationSec) {
            val floatIdx = (timeAtX / durationSec) * peaks.lastIndex
            val p = sampleInterpolatedPeak(peaks, floatIdx)
            val halfH = (p.amplitude * maxHalfH).coerceAtLeast(2f)
            val c = when {
                p.highEnergy > 0.55f -> highColor
                p.midEnergy > p.lowEnergy -> midColor
                else -> lowColor
            }
            drawLine(
                color = c,
                start = Offset(x, centerY - halfH),
                end = Offset(x, centerY + halfH),
                strokeWidth = stepPx
            )
        }
        x += stepPx
    }

    if (showBeatGrid && deck.detectedBpm > 0f) {
        val beatSecBuf = 60f / deck.detectedBpm
        val anchor = deck.beatOffsetMs / 1000f
        val startSec = (posSec - playheadX * secPerPx * rate).coerceAtLeast(0f)
        val endSec = (posSec + (size.width - playheadX) * secPerPx * rate).coerceAtMost(durationSec)
        val firstBeat = ceil((startSec - anchor) / beatSecBuf).toInt()
        val lastBeat = floor((endSec - anchor) / beatSecBuf).toInt()
        for (b in firstBeat..lastBeat) {
            val beatBuf = anchor + b * beatSecBuf
            val bx = playheadX + ((beatBuf - posSec) / rate) * pxPerSec
            val isBar = ((b % 4) + 4) % 4 == 0
            drawLine(
                color = if (isBar) Color(0x70FFFFFF) else Color(0x26FFFFFF),
                start = Offset(bx, laneTop),
                end = Offset(bx, laneTop + laneHeight),
                strokeWidth = if (isBar) 2f else 1f
            )
        }
    }
}
