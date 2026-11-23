package com.chronixdj.pro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.StemChannelState
import com.chronixdj.pro.model.StemType
import com.chronixdj.pro.ui.theme.ChronixColors
import com.chronixdj.pro.viewmodel.ChronixDjViewModel

@Composable
fun StemsScreen(
    channels: Map<StemType, StemChannelState>,
    viewModel: ChronixDjViewModel,
    onPickStemFile: (StemType) -> Unit,
    onNavigateSection: (AppSection) -> Unit
) {
    val colors = mapOf(
        StemType.VOCALS to ChronixColors.DeckABlue,
        StemType.DRUMS to ChronixColors.DeckBOrange,
        StemType.BASS to ChronixColors.ActiveGreen,
        StemType.INSTRUMENTAL to ChronixColors.DeckACyan
    )

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(ChronixColors.Background)
    ) {
        val isPortraitPhone = maxWidth < 600.dp

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(if (isPortraitPhone) 6.dp else 8.dp),
            verticalArrangement = Arrangement.spacedBy(if (isPortraitPhone) 6.dp else 8.dp)
        ) {
            SectionHeaderBar(
                title = "4-CHANNEL STEMS MIXER",
                activeSection = AppSection.STEMS,
                onNavigateSection = onNavigateSection
            )

            // Master Stems Bar
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(ChronixColors.SurfaceDark)
                    .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Load separated stem audio files per channel.",
                        color = ChronixColors.TextMuted,
                        fontSize = 11.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(end = 8.dp)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(ChronixColors.ActiveGreen)
                                .clickable { viewModel.stemsEngine.playAllLoaded() }
                                .padding(horizontal = 9.dp, vertical = 6.dp)
                        ) {
                            Text("PLAY ALL", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(ChronixColors.SurfacePad)
                                .clickable { viewModel.stemsEngine.pauseAll() }
                                .padding(horizontal = 9.dp, vertical = 6.dp)
                        ) {
                            Text("PAUSE ALL", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (isPortraitPhone) {
                // 2x2 Grid for Portrait Phone
                val entries = StemType.entries
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(entries.take(2), entries.drop(2)).forEach { rowItems ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            rowItems.forEach { stemType ->
                                val ch = channels[stemType] ?: StemChannelState(stemType)
                                val accent = colors[stemType] ?: ChronixColors.DeckABlue
                                StemChannelCard(
                                    channel = ch,
                                    accentColor = accent,
                                    onLoad = { onPickStemFile(stemType) },
                                    onPlayPause = { viewModel.stemsEngine.togglePlayPause(stemType) },
                                    onMute = { viewModel.stemsEngine.toggleMute(stemType) },
                                    onSolo = { viewModel.stemsEngine.toggleSolo(stemType) },
                                    onVolume = { viewModel.stemsEngine.setVolume(stemType, it) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            } else {
                // 4-Column Row for Landscape / Tablet
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StemType.entries.forEach { stemType ->
                        val ch = channels[stemType] ?: StemChannelState(stemType)
                        val accent = colors[stemType] ?: ChronixColors.DeckABlue
                        StemChannelCard(
                            channel = ch,
                            accentColor = accent,
                            onLoad = { onPickStemFile(stemType) },
                            onPlayPause = { viewModel.stemsEngine.togglePlayPause(stemType) },
                            onMute = { viewModel.stemsEngine.toggleMute(stemType) },
                            onSolo = { viewModel.stemsEngine.toggleSolo(stemType) },
                            onVolume = { viewModel.stemsEngine.setVolume(stemType, it) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StemChannelCard(
    channel: StemChannelState,
    accentColor: Color,
    onLoad: () -> Unit,
    onPlayPause: () -> Unit,
    onMute: () -> Unit,
    onSolo: () -> Unit,
    onVolume: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(8.dp))
            .background(ChronixColors.SurfaceDark)
            .border(1.dp, accentColor.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = channel.type.displayName.uppercase(),
            color = accentColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = channel.fileName,
            color = if (channel.isLoaded) ChronixColors.TextPrimary else ChronixColors.TextMuted,
            fontSize = 10.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(5.dp))
                .background(ChronixColors.SurfacePad)
                .clickable { onLoad() }
                .padding(vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Add, null, tint = Color.White)
                Spacer(modifier = Modifier.width(4.dp))
                Text("LOAD STEM", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }

        // Visual Level Indicator Bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(Color(0xFF0A0C0F))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(channel.levelMeter.coerceIn(0f, 1f))
                    .background(accentColor)
            )
        }

        // Mute / Solo / Play-Pause Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(if (channel.isMuted) ChronixColors.RecordRed else ChronixColors.SurfacePad)
                    .clickable { onMute() },
                contentAlignment = Alignment.Center
            ) {
                Text("MUTE", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(if (channel.isSolo) ChronixColors.DeckBAmber else ChronixColors.SurfacePad)
                    .clickable { onSolo() },
                contentAlignment = Alignment.Center
            ) {
                Text("SOLO", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(if (channel.isPlaying) accentColor else ChronixColors.SurfacePad)
                    .clickable { onPlayPause() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (channel.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = "Play/Pause Stem",
                    tint = Color.White
                )
            }
        }

        // Volume Control
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "VOL ${(channel.volume * 100).toInt()}%",
                color = ChronixColors.TextPrimary,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
            Slider(
                value = channel.volume,
                onValueChange = onVolume,
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = accentColor),
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
