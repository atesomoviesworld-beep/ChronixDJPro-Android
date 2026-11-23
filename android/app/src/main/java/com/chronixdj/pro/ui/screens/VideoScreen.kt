package com.chronixdj.pro.ui.screens

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.exoplayer.ExoPlayer
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.DeckState
import com.chronixdj.pro.model.VocalMode
import com.chronixdj.pro.ui.components.ExoVideoTextureSurface
import com.chronixdj.pro.ui.components.formatDjTime
import com.chronixdj.pro.ui.theme.ChronixColors
import com.chronixdj.pro.viewmodel.ChronixDjViewModel

@Composable
fun VideoScreen(
    deckA: DeckState,
    deckB: DeckState,
    crossfader: Float,
    viewModel: ChronixDjViewModel,
    onPickMedia: (DeckId) -> Unit,
    onNavigateSection: (AppSection) -> Unit
) {
    var fullscreenVisible by remember { mutableStateOf(false) }
    var splitDeckMonitors by remember { mutableStateOf(false) }
    var portraitDeckTab by remember { mutableStateOf(DeckId.DECK_A) }

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
                title = "UNIFIED ON-DECK VIDEO MIXER",
                activeSection = AppSection.VIDEO,
                onNavigateSection = onNavigateSection
            )

            if (isPortraitPhone) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Program Output Monitor
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(256.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ChronixColors.SurfaceDark)
                            .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(8.dp))
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("PROGRAM OUTPUT", color = ChronixColors.ActiveGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(ChronixColors.SurfacePad)
                                    .clickable { fullscreenVisible = true }
                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Fullscreen, contentDescription = "Fullscreen", tint = Color.White, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("FULL", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color.Black),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!fullscreenVisible) {
                                if (deckA.isVideo) {
                                    ExoVideoTextureSurface(
                                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_A),
                                        cropToFill = false,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .alpha(1f - crossfader)
                                    )
                                }
                                if (deckB.isVideo) {
                                    ExoVideoTextureSurface(
                                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_B),
                                        cropToFill = false,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .alpha(crossfader)
                                    )
                                }
                                if (!deckA.isVideo && !deckB.isVideo) {
                                    Text("Load video into Deck A or B (shared with Master)", color = ChronixColors.TextMuted, fontSize = 11.sp)
                                }
                            }
                        }

                        val blendedWaves = remember(deckA.audioWaveLevels, deckB.audioWaveLevels, crossfader) {
                            List(48) { idx ->
                                val a = deckA.audioWaveLevels.getOrElse(idx) { 0.06f } * (1f - crossfader)
                                val b = deckB.audioWaveLevels.getOrElse(idx) { 0.06f } * crossfader
                                (a + b).coerceIn(0.06f, 1f)
                            }
                        }
                        AudioFollowingWaveStrip(
                            levels = blendedWaves,
                            accentColor = ChronixColors.ActiveGreen,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(28.dp)
                        )

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("A", color = ChronixColors.DeckABlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Slider(
                                value = crossfader,
                                onValueChange = { viewModel.setCrossfader(it) },
                                colors = SliderDefaults.colors(
                                    thumbColor = Color.White,
                                    activeTrackColor = ChronixColors.DeckABlue,
                                    inactiveTrackColor = ChronixColors.DeckBOrange
                                ),
                                modifier = Modifier.weight(1f).padding(horizontal = 6.dp)
                            )
                            Text("B", color = ChronixColors.DeckBOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Portrait Deck Switcher (Deck A | Deck B)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(30.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(ChronixColors.SurfaceDark)
                            .padding(3.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        listOf(
                            DeckId.DECK_A to ("DECK A" to ChronixColors.DeckABlue),
                            DeckId.DECK_B to ("DECK B" to ChronixColors.DeckBOrange)
                        ).forEach { (id, info) ->
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (portraitDeckTab == id) info.second else ChronixColors.SurfacePad)
                                    .clickable { portraitDeckTab = id },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(info.first, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    val activeDeck = if (portraitDeckTab == DeckId.DECK_A) deckA else deckB
                    val activeAccent = if (portraitDeckTab == DeckId.DECK_A) ChronixColors.DeckABlue else ChronixColors.DeckBOrange
                    VideoDeckPanel(
                        state = activeDeck,
                        accentColor = activeAccent,
                        player = viewModel.audioEngine.getPlayer(portraitDeckTab),
                        showMonitor = !fullscreenVisible,
                        onLoad = { onPickMedia(portraitDeckTab) },
                        onPlayPause = { viewModel.audioEngine.togglePlayPause(portraitDeckTab) },
                        onStop = { viewModel.audioEngine.stop(portraitDeckTab) },
                        onSync = { viewModel.audioEngine.syncBpm(portraitDeckTab) },
                        onSeek = { viewModel.audioEngine.seekTo(portraitDeckTab, it) },
                        onVolume = { viewModel.audioEngine.setDeckVolume(portraitDeckTab, it) },
                        onToggleVocal = { viewModel.audioEngine.cycleVocalMode(portraitDeckTab) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(270.dp)
                    )
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    VideoDeckPanel(
                        state = deckA,
                        accentColor = ChronixColors.DeckABlue,
                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_A),
                        showMonitor = splitDeckMonitors && !fullscreenVisible,
                        onLoad = { onPickMedia(DeckId.DECK_A) },
                        onPlayPause = { viewModel.audioEngine.togglePlayPause(DeckId.DECK_A) },
                        onStop = { viewModel.audioEngine.stop(DeckId.DECK_A) },
                        onSync = { viewModel.audioEngine.syncBpm(DeckId.DECK_A) },
                        onSeek = { viewModel.audioEngine.seekTo(DeckId.DECK_A, it) },
                        onVolume = { viewModel.audioEngine.setDeckVolume(DeckId.DECK_A, it) },
                        onToggleVocal = { viewModel.audioEngine.cycleVocalMode(DeckId.DECK_A) },
                        modifier = Modifier.weight(1f)
                    )

                    Column(
                        modifier = Modifier
                            .weight(1.1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(8.dp))
                            .background(ChronixColors.SurfaceDark)
                            .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(8.dp))
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("PROGRAM", color = ChronixColors.ActiveGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (splitDeckMonitors) ChronixColors.DeckABlue else ChronixColors.SurfacePad)
                                        .clickable { splitDeckMonitors = !splitDeckMonitors }
                                        .padding(horizontal = 6.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        text = if (splitDeckMonitors) "PROGRAM" else "MONITORS",
                                        color = Color.White,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(ChronixColors.SurfacePad)
                                        .clickable { fullscreenVisible = true }
                                        .padding(horizontal = 6.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Fullscreen, contentDescription = "Fullscreen", tint = Color.White, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text("FULL", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color.Black),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!splitDeckMonitors && !fullscreenVisible) {
                                if (deckA.isVideo) {
                                    ExoVideoTextureSurface(
                                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_A),
                                        cropToFill = false,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .alpha(1f - crossfader)
                                    )
                                }
                                if (deckB.isVideo) {
                                    ExoVideoTextureSurface(
                                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_B),
                                        cropToFill = false,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .alpha(crossfader)
                                    )
                                }
                                if (!deckA.isVideo && !deckB.isVideo) {
                                    Text("Load video into Deck A or B", color = ChronixColors.TextMuted, fontSize = 11.sp)
                                }
                            } else if (splitDeckMonitors) {
                                Text("Split Deck Monitors Active", color = ChronixColors.TextMuted, fontSize = 11.sp)
                            }
                        }

                        val blendedWaves = remember(deckA.audioWaveLevels, deckB.audioWaveLevels, crossfader) {
                            List(48) { idx ->
                                val a = deckA.audioWaveLevels.getOrElse(idx) { 0.06f } * (1f - crossfader)
                                val b = deckB.audioWaveLevels.getOrElse(idx) { 0.06f } * crossfader
                                (a + b).coerceIn(0.06f, 1f)
                            }
                        }
                        AudioFollowingWaveStrip(
                            levels = blendedWaves,
                            accentColor = ChronixColors.ActiveGreen,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(30.dp)
                        )

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("A", color = ChronixColors.DeckABlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Slider(
                                value = crossfader,
                                onValueChange = { viewModel.setCrossfader(it) },
                                colors = SliderDefaults.colors(
                                    thumbColor = Color.White,
                                    activeTrackColor = ChronixColors.DeckABlue,
                                    inactiveTrackColor = ChronixColors.DeckBOrange
                                ),
                                modifier = Modifier.weight(1f).padding(horizontal = 6.dp)
                            )
                            Text("B", color = ChronixColors.DeckBOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    VideoDeckPanel(
                        state = deckB,
                        accentColor = ChronixColors.DeckBOrange,
                        player = viewModel.audioEngine.getPlayer(DeckId.DECK_B),
                        showMonitor = splitDeckMonitors && !fullscreenVisible,
                        onLoad = { onPickMedia(DeckId.DECK_B) },
                        onPlayPause = { viewModel.audioEngine.togglePlayPause(DeckId.DECK_B) },
                        onStop = { viewModel.audioEngine.stop(DeckId.DECK_B) },
                        onSync = { viewModel.audioEngine.syncBpm(DeckId.DECK_B) },
                        onSeek = { viewModel.audioEngine.seekTo(DeckId.DECK_B, it) },
                        onVolume = { viewModel.audioEngine.setDeckVolume(DeckId.DECK_B, it) },
                        onToggleVocal = { viewModel.audioEngine.cycleVocalMode(DeckId.DECK_B) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }

    if (fullscreenVisible) {
        Dialog(
            onDismissRequest = { fullscreenVisible = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            ) {
                val activePlayer = if (crossfader < 0.5f && deckA.isVideo) {
                    viewModel.audioEngine.getPlayer(DeckId.DECK_A)
                } else {
                    viewModel.audioEngine.getPlayer(DeckId.DECK_B)
                }
                ExoVideoTextureSurface(
                    player = activePlayer,
                    cropToFill = false,
                    modifier = Modifier.fillMaxSize()
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(16.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xAA111827))
                        .clickable { fullscreenVisible = false }
                        .padding(8.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Exit Fullscreen", tint = Color.White)
                }
            }
        }
    }
}

@Composable
fun AudioFollowingWaveStrip(
    levels: List<Float>,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color(0xFF06080B))
    ) {
        if (levels.isEmpty()) return@Canvas
        val barWidth = size.width / levels.size.toFloat()
        val midY = size.height / 2f
        levels.forEachIndexed { idx, amp ->
            val x = idx * barWidth + barWidth * 0.5f
            val halfH = (amp * size.height * 0.46f).coerceAtLeast(2f)
            drawLine(
                color = accentColor,
                start = Offset(x, midY - halfH),
                end = Offset(x, midY + halfH),
                strokeWidth = (barWidth * 0.65f).coerceAtLeast(2f)
            )
        }
    }
}

@Composable
private fun VideoDeckPanel(
    state: DeckState,
    accentColor: Color,
    player: ExoPlayer,
    showMonitor: Boolean,
    onLoad: () -> Unit,
    onPlayPause: () -> Unit,
    onStop: () -> Unit,
    onSync: () -> Unit,
    onSeek: (Long) -> Unit,
    onVolume: (Float) -> Unit,
    onToggleVocal: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(8.dp))
            .background(ChronixColors.SurfaceDark)
            .border(1.dp, accentColor.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = state.title,
                color = accentColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (state.vocalMode == VocalMode.OFF) ChronixColors.SurfacePad else ChronixColors.ActiveGreen)
                    .clickable { onToggleVocal() }
                    .padding(horizontal = 6.dp, vertical = 4.dp)
            ) {
                Text(
                    text = if (state.vocalMode == VocalMode.OFF) "NO VOX" else state.vocalMode.label,
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.width(4.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(accentColor)
                    .clickable { onLoad() }
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Add, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Text("LOAD", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            if (state.isVideo && showMonitor) {
                ExoVideoTextureSurface(
                    player = player,
                    cropToFill = false,
                    modifier = Modifier.fillMaxSize()
                )
            } else if (state.isLoaded) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = if (state.isVideo) "PLAYING ON DECK & PROGRAM" else "AUDIO DECK LOADED",
                        color = accentColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "BPM ${if (state.detectedBpm > 0f) String.format("%.1f", state.detectedBpm) else "--"} • ${String.format("%+.1f%%", state.pitchPercent)}",
                        color = ChronixColors.TextPrimary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            } else {
                Text("Tap LOAD to select Audio or Video", color = ChronixColors.TextMuted, fontSize = 11.sp)
            }
        }

        // Audio-Following Live Wave Strip
        AudioFollowingWaveStrip(
            levels = state.audioWaveLevels,
            accentColor = accentColor,
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp)
        )

        val progress = if (state.durationMs > 0) state.positionMs.toFloat() / state.durationMs else 0f
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(formatDjTime(state.positionMs), color = ChronixColors.TextMuted, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
            Slider(
                value = progress,
                onValueChange = { if (state.durationMs > 0) onSeek((it * state.durationMs).toLong()) },
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = accentColor),
                modifier = Modifier.weight(1f).height(22.dp).padding(horizontal = 4.dp)
            )
            Text(formatDjTime(state.durationMs), color = ChronixColors.TextMuted, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (state.isPlaying) accentColor else ChronixColors.SurfacePad)
                    .clickable { onPlayPause() },
                contentAlignment = Alignment.Center
            ) {
                Icon(if (state.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null, tint = Color.White)
            }
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(ChronixColors.SurfacePad)
                    .clickable { onStop() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Stop, null, tint = Color.White)
            }
            Box(
                modifier = Modifier
                    .height(34.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(ChronixColors.SurfacePad)
                    .clickable { onSync() }
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("SYNC", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Text("VOL", color = ChronixColors.TextMuted, fontSize = 10.sp)
            Slider(
                value = state.volume,
                onValueChange = onVolume,
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = accentColor),
                modifier = Modifier.weight(1f).height(22.dp)
            )
        }
    }
}

@Composable
fun SectionHeaderBar(
    title: String,
    activeSection: AppSection,
    onNavigateSection: (AppSection) -> Unit
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(ChronixColors.SurfaceDark)
            .padding(horizontal = 8.dp, vertical = 6.dp)
    ) {
        val narrow = maxWidth < 520.dp
        if (narrow) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    AppSection.entries.forEach { sec ->
                        val selected = sec == activeSection
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (selected) ChronixColors.ActiveGreen else ChronixColors.SurfacePad)
                                .clickable { onNavigateSection(sec) }
                                .padding(vertical = 5.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(sec.name, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    }
                }
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(end = 8.dp)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    AppSection.entries.forEach { sec ->
                        val selected = sec == activeSection
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (selected) ChronixColors.ActiveGreen else ChronixColors.SurfacePad)
                                .clickable { onNavigateSection(sec) }
                                .padding(horizontal = 9.dp, vertical = 5.dp)
                        ) {
                            Text(sec.name, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}
