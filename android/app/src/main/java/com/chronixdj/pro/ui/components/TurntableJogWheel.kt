package com.chronixdj.pro.ui.components

import android.view.TextureView
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import com.chronixdj.pro.R
import com.chronixdj.pro.ui.theme.ChronixColors
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

@OptIn(UnstableApi::class)
@Composable
fun ExoVideoTextureSurface(
    player: ExoPlayer,
    cropToFill: Boolean = false,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val textureView = remember(context) { TextureView(context) }

    DisposableEffect(player, textureView) {
        player.setVideoTextureView(textureView)
        onDispose {
            player.clearVideoTextureView(textureView)
        }
    }

    AndroidView(
        factory = { ctx ->
            AspectRatioFrameLayout(ctx).apply {
                resizeMode = if (cropToFill) {
                    AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                } else {
                    AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
                val initialSize = player.videoSize
                if (initialSize.width > 0 && initialSize.height > 0) {
                    setAspectRatio((initialSize.width * initialSize.pixelWidthHeightRatio) / initialSize.height)
                }
                (textureView.parent as? ViewGroup)?.removeView(textureView)
                addView(
                    textureView,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
            }
        },
        update = { container ->
            container.resizeMode = if (cropToFill) {
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            } else {
                AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
            val size: VideoSize = player.videoSize
            if (size.width > 0 && size.height > 0) {
                container.setAspectRatio((size.width * size.pixelWidthHeightRatio) / size.height)
            }
        },
        modifier = modifier
    )
}

@Composable
fun TurntableJogWheel(
    bpm: Float,
    musicalKey: String,
    pitchPercent: Float,
    positionMs: Long,
    durationMs: Long,
    platterDegrees: Float,
    accentColor: Color,
    onScratchDelta: (Float) -> Unit,
    modifier: Modifier = Modifier,
    player: ExoPlayer? = null,
    showVideo: Boolean = false,
    onScratchStart: () -> Unit = {},
    onScratchEnd: () -> Unit = {}
) {
    val platterVignetteBrush = remember {
        Brush.radialGradient(
            colors = listOf(
                Color(0x38090D14),
                Color(0x9E080B11),
                Color(0xEB04060A)
            )
        )
    }

    BoxWithConstraints(
        modifier = modifier
            .aspectRatio(1f, matchHeightConstraintsFirst = false)
            .pointerInput(Unit) {
                var lastAngle = 0f
                detectDragGestures(
                    onDragStart = { offset ->
                        val cx = size.width / 2f
                        val cy = size.height / 2f
                        lastAngle = atan2(offset.y - cy, offset.x - cx) * (180f / PI.toFloat())
                        onScratchStart()
                    },
                    onDragEnd = { onScratchEnd() },
                    onDragCancel = { onScratchEnd() },
                    onDrag = { change, _ ->
                        change.consume()
                        val cx = size.width / 2f
                        val cy = size.height / 2f
                        val angle = atan2(change.position.y - cy, change.position.x - cx) * (180f / PI.toFloat())
                        var delta = angle - lastAngle
                        if (delta > 180f) delta -= 360f
                        if (delta < -180f) delta += 360f
                        lastAngle = angle
                        onScratchDelta(delta)
                    }
                )
            },
        contentAlignment = Alignment.Center
    ) {
        val compactWheel = maxWidth < 120.dp
        val bpmTextSize = if (compactWheel) 9.sp else 11.sp
        val metaTextSize = if (compactWheel) 8.sp else 10.sp
        val timeTextSize = if (compactWheel) 9.sp else 11.sp
        val padH = if (compactWheel) 7.dp else 12.dp
        val padV = if (compactWheel) 6.dp else 10.dp

        if (showVideo && player != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(4.dp)
                    .clip(CircleShape)
            ) {
                ExoVideoTextureSurface(
                    player = player,
                    cropToFill = true,
                    modifier = Modifier.fillMaxSize()
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0x77090D14))
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(4.dp)
                    .graphicsLayer()
                    .clip(CircleShape)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.dj_emma_pro_skin),
                    contentDescription = "DJ EMMA PRO Platter Skin",
                    contentScale = ContentScale.Crop,
                    alignment = BiasAlignment(0f, -0.45f),
                    modifier = Modifier.fillMaxSize()
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(platterVignetteBrush)
                )
            }
        }

        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = size.minDimension / 2f
            val center = Offset(size.width / 2f, size.height / 2f)

            for (rStep in 1..4) {
                drawCircle(
                    color = Color(0x28FFFFFF),
                    radius = radius * (0.44f + rStep * 0.115f),
                    center = center,
                    style = Stroke(width = 1.dp.toPx())
                )
            }

            drawCircle(
                color = accentColor,
                radius = radius - 3.dp.toPx(),
                center = center,
                style = Stroke(width = if (compactWheel) 2.2.dp.toPx() else 3.dp.toPx())
            )

            drawCircle(
                color = if (showVideo) Color(0xAA1F242D) else Color(0xFF1F242D),
                radius = radius * 0.21f,
                center = center
            )
            drawCircle(
                color = accentColor,
                radius = radius * 0.21f,
                center = center,
                style = Stroke(width = 1.8.dp.toPx())
            )
            drawCircle(color = Color(0xFF6B7280), radius = radius * 0.055f, center = center)

            val rad = (platterDegrees - 90f) * (PI / 180.0)
            val start = Offset(
                x = center.x + (cos(rad) * radius * 0.23f).toFloat(),
                y = center.y + (sin(rad) * radius * 0.23f).toFloat()
            )
            val end = Offset(
                x = center.x + (cos(rad) * radius * 0.93f).toFloat(),
                y = center.y + (sin(rad) * radius * 0.93f).toFloat()
            )
            drawLine(
                color = accentColor,
                start = start,
                end = end,
                strokeWidth = if (compactWheel) 3.dp.toPx() else 4.dp.toPx(),
                cap = StrokeCap.Round
            )
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = padH, vertical = padV)
        ) {
            Text(
                text = if (bpm > 0f) String.format("%.1f", bpm) else "0.0",
                color = ChronixColors.TextPrimary,
                fontSize = bpmTextSize,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                maxLines = 1
            )
            Spacer(modifier = Modifier.weight(1f))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = musicalKey,
                    color = accentColor,
                    fontSize = metaTextSize,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 1
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = String.format("%+.1f%%", pitchPercent),
                    color = ChronixColors.TextPrimary,
                    fontSize = metaTextSize,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 1
                )
            }
            Spacer(modifier = Modifier.weight(1f))
            val remaining = (durationMs - positionMs).coerceAtLeast(0L)
            Text(
                text = formatDjTime(positionMs),
                color = ChronixColors.TextPrimary,
                fontSize = timeTextSize,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                maxLines = 1
            )
            Text(
                text = "-${formatDjTime(remaining)}",
                color = ChronixColors.TextMuted,
                fontSize = metaTextSize,
                fontFamily = FontFamily.Monospace,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(1.dp))
        }
    }
}

fun formatDjTime(ms: Long): String {
    val totalCentis = (ms / 10L).coerceAtLeast(0L)
    val centis = totalCentis % 100
    val totalSecs = totalCentis / 100
    val secs = totalSecs % 60
    val mins = totalSecs / 60
    return String.format("%02d:%02d:%02d", mins, secs, centis)
}
