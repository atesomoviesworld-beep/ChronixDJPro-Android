package com.chronixdj.pro.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chronixdj.pro.ui.theme.ChronixColors
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun RotaryKnob(
    label: String,
    value: Float, // 0f..1f
    accentColor: Color,
    onValueChange: (Float) -> Unit,
    onDoubleTapReset: () -> Unit = { onValueChange(0.5f) },
    size: Dp = 44.dp
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(
            modifier = Modifier
                .size(size)
                .pointerInput(value) {
                    detectTapGestures(onDoubleTap = { onDoubleTapReset() })
                }
                .pointerInput(value) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val delta = -dragAmount.y / 140f
                        onValueChange((value + delta).coerceIn(0f, 1f))
                    }
                }
        ) {
            val r = this.size.minDimension / 2f
            val center = Offset(this.size.width / 2f, this.size.height / 2f)

            val strokePx = (if (size < 32.dp) 2.2.dp else 3.dp).toPx()

            // Arc track (-225 deg to +45 deg = 270 deg sweep)
            drawArc(
                color = Color(0xFF2C323C),
                startAngle = 135f,
                sweepAngle = 270f,
                useCenter = false,
                topLeft = Offset(3f, 3f),
                size = Size(this.size.width - 6f, this.size.height - 6f),
                style = Stroke(width = strokePx, cap = StrokeCap.Round)
            )

            // Active value arc
            drawArc(
                color = accentColor,
                startAngle = 135f,
                sweepAngle = 270f * value,
                useCenter = false,
                topLeft = Offset(3f, 3f),
                size = Size(this.size.width - 6f, this.size.height - 6f),
                style = Stroke(width = strokePx, cap = StrokeCap.Round)
            )

            // Knob body
            drawCircle(color = Color(0xFF272C35), radius = r * 0.72f, center = center)
            drawCircle(
                color = Color(0xFF4B5563),
                radius = r * 0.72f,
                center = center,
                style = Stroke(width = 1.dp.toPx())
            )

            // Indicator line
            val angleDeg = 135f + 270f * value
            val rad = angleDeg * (PI / 180.0)
            val start = Offset(
                center.x + (cos(rad) * r * 0.22f).toFloat(),
                center.y + (sin(rad) * r * 0.22f).toFloat()
            )
            val end = Offset(
                center.x + (cos(rad) * r * 0.65f).toFloat(),
                center.y + (sin(rad) * r * 0.65f).toFloat()
            )
            drawLine(
                color = Color.White,
                start = start,
                end = end,
                strokeWidth = (if (size < 32.dp) 1.8.dp else 2.5.dp).toPx(),
                cap = StrokeCap.Round
            )
        }
        Text(
            text = label,
            color = ChronixColors.TextMuted,
            fontSize = if (size < 32.dp) 7.sp else 9.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}
