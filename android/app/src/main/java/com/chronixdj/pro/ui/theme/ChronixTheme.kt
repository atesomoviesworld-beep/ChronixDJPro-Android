package com.chronixdj.pro.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object ChronixColors {
    val Background = Color(0xFF0A0C0F)
    val SurfaceDark = Color(0xFF14171D)
    val SurfaceCard = Color(0xFF1E2229)
    val SurfacePad = Color(0xFF282D35)
    val BorderSubtle = Color(0xFF333944)
    val TextPrimary = Color(0xFFF3F6FA)
    val TextMuted = Color(0xFF9AA3B2)

    val DeckABlue = Color(0xFF2188FF)
    val DeckACyan = Color(0xFF38BDF8)
    val DeckBOrange = Color(0xFFFF7A00)
    val DeckBAmber = Color(0xFFF59E0B)
    val ActiveGreen = Color(0xFF4CAF50)
    val RecordRed = Color(0xFFEF4444)
}

private val ChronixDarkScheme = darkColorScheme(
    primary = ChronixColors.DeckABlue,
    secondary = ChronixColors.DeckBOrange,
    tertiary = ChronixColors.ActiveGreen,
    background = ChronixColors.Background,
    surface = ChronixColors.SurfaceDark,
    surfaceVariant = ChronixColors.SurfaceCard,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = ChronixColors.TextPrimary,
    onSurface = ChronixColors.TextPrimary
)

@Composable
fun ChronixDJProTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ChronixDarkScheme,
        content = content
    )
}
