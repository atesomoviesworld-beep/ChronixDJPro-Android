package com.chronixdj.pro.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Slideshow
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chronixdj.pro.R
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.DeckState
import com.chronixdj.pro.model.DeckStemKey
import com.chronixdj.pro.model.DjSettings
import com.chronixdj.pro.model.FxType
import com.chronixdj.pro.model.MasterCenterMode
import com.chronixdj.pro.model.PadMode
import com.chronixdj.pro.model.RecordingMode
import com.chronixdj.pro.model.RecordingState
import com.chronixdj.pro.model.RecordingStatus
import com.chronixdj.pro.model.SamplerPadState
import com.chronixdj.pro.model.SamplerSourceType
import com.chronixdj.pro.ui.components.DualVerticalWaveformView
import com.chronixdj.pro.ui.components.ExoVideoTextureSurface
import com.chronixdj.pro.ui.components.ParallelScrollingWaveformView
import com.chronixdj.pro.ui.components.RotaryKnob
import com.chronixdj.pro.ui.components.TurntableJogWheel
import com.chronixdj.pro.ui.theme.ChronixColors
import com.chronixdj.pro.viewmodel.ChronixDjViewModel

private enum class PhoneMasterPane {
    DECK_A,
    MIXER,
    DECK_B
}

@Composable
fun MasterScreen(
    deckA: DeckState,
    deckB: DeckState,
    crossfader: Float,
    masterVolume: Float,
    centerMode: MasterCenterMode,
    padModes: Map<DeckId, PadMode>,
    cueDeleteMode: Map<DeckId, Boolean>,
    recordingState: RecordingState,
    settings: DjSettings,
    viewModel: ChronixDjViewModel,
    onPickAudio: (DeckId) -> Unit,
    onPickSamplerAudio: (String?) -> Unit,
    onNavigateSection: (AppSection) -> Unit
) {
    var showParallelWave by remember { mutableStateOf(true) }
    var phonePane by remember { mutableStateOf(PhoneMasterPane.DECK_A) }
    var samplerEditMode by remember { mutableStateOf(false) }
    var editingSamplerPadId by remember { mutableStateOf<String?>(null) }
    val samplerPads by viewModel.samplerEngine.pads.collectAsState()

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(ChronixColors.Background)
    ) {
        val isPortraitPhone = maxWidth < 600.dp
        val isCompactLandscape = !isPortraitPhone && (maxHeight < 460.dp || maxWidth < 800.dp)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = if (isPortraitPhone) 4.dp else 6.dp, vertical = 3.dp),
            verticalArrangement = Arrangement.spacedBy(if (isPortraitPhone || isCompactLandscape) 3.dp else 4.dp)
        ) {
            if (isPortraitPhone) {
                // PORTRAIT PHONE HEADER: Top Navigation + Compact Side-by-Side Deck Status
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(34.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(26.dp)
                                .clip(CircleShape)
                                .background(ChronixColors.SurfaceCard)
                                .clickable { onNavigateSection(AppSection.SETTINGS) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = "Settings",
                                tint = ChronixColors.TextPrimary,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                        Image(
                            painter = painterResource(id = R.drawable.dj_emma_pro_skin),
                            contentDescription = "DJ EMMA PRO",
                            contentScale = ContentScale.Crop,
                            alignment = BiasAlignment(0f, -0.5f),
                            modifier = Modifier
                                .size(24.dp)
                                .graphicsLayer()
                                .clip(CircleShape)
                                .border(1.dp, Color(0x55FFFFFF), CircleShape)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            SectionMiniTab("MST", true) { onNavigateSection(AppSection.MASTER) }
                            SectionMiniTab("VID", false) { onNavigateSection(AppSection.VIDEO) }
                            SectionMiniTab("STM", false) { onNavigateSection(AppSection.STEMS) }
                        }
                    }

                    Row(
                        modifier = Modifier.width(102.dp),
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        CenterTabButton(
                            active = centerMode == MasterCenterMode.MIXER_EQ,
                            icon = { Icon(Icons.Default.Equalizer, "EQ", tint = Color.White, modifier = Modifier.size(14.dp)) },
                            onClick = {
                                viewModel.selectMasterCenterMode(MasterCenterMode.MIXER_EQ)
                                phonePane = PhoneMasterPane.MIXER
                            },
                            modifier = Modifier.weight(1f),
                            compact = true
                        )
                        CenterTabButton(
                            active = centerMode == MasterCenterMode.WAVEFORM,
                            icon = { Icon(Icons.Default.GraphicEq, "Wave", tint = Color.White, modifier = Modifier.size(14.dp)) },
                            onClick = {
                                viewModel.selectMasterCenterMode(MasterCenterMode.WAVEFORM)
                                phonePane = PhoneMasterPane.MIXER
                            },
                            modifier = Modifier.weight(1f),
                            compact = true
                        )
                        CenterTabButton(
                            active = centerMode == MasterCenterMode.VIDEO_PREVIEW,
                            icon = { Icon(Icons.Default.Slideshow, "Video", tint = Color.White, modifier = Modifier.size(14.dp)) },
                            onClick = {
                                viewModel.selectMasterCenterMode(MasterCenterMode.VIDEO_PREVIEW)
                                phonePane = PhoneMasterPane.MIXER
                            },
                            modifier = Modifier.weight(1f),
                            compact = true
                        )
                    }
                }

                // Dual Deck Header Strip in Portrait
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(38.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    DeckTopHeader(
                        deck = deckA,
                        accentColor = ChronixColors.DeckABlue,
                        isLeft = true,
                        compact = true,
                        onLoadClick = { onPickAudio(DeckId.DECK_A) },
                        onSetMaster = { viewModel.audioEngine.setMasterDeck(DeckId.DECK_A) },
                        modifier = Modifier.weight(1f)
                    )
                    DeckTopHeader(
                        deck = deckB,
                        accentColor = ChronixColors.DeckBOrange,
                        isLeft = false,
                        compact = true,
                        onLoadClick = { onPickAudio(DeckId.DECK_B) },
                        onSetMaster = { viewModel.audioEngine.setMasterDeck(DeckId.DECK_B) },
                        modifier = Modifier.weight(1f)
                    )
                }
            } else {
                // LANDSCAPE / TABLET HEADER BAR
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (isCompactLandscape) 48.dp else 58.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    DeckTopHeader(
                        deck = deckA,
                        accentColor = ChronixColors.DeckABlue,
                        isLeft = true,
                        compact = isCompactLandscape,
                        onLoadClick = { onPickAudio(DeckId.DECK_A) },
                        onSetMaster = { viewModel.audioEngine.setMasterDeck(DeckId.DECK_A) },
                        modifier = Modifier.weight(1f)
                    )

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.width(if (isCompactLandscape) 168.dp else 196.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(if (isCompactLandscape) 4.dp else 6.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(if (isCompactLandscape) 24.dp else 28.dp)
                                    .clip(CircleShape)
                                    .background(ChronixColors.SurfaceCard)
                                    .clickable { onNavigateSection(AppSection.SETTINGS) },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Settings,
                                    contentDescription = "Settings",
                                    tint = ChronixColors.TextPrimary,
                                    modifier = Modifier.size(if (isCompactLandscape) 13.dp else 16.dp)
                                )
                            }

                            Image(
                                painter = painterResource(id = R.drawable.dj_emma_pro_skin),
                                contentDescription = "DJ EMMA PRO",
                                contentScale = ContentScale.Crop,
                                alignment = BiasAlignment(0f, -0.5f),
                                modifier = Modifier
                                    .size(if (isCompactLandscape) 22.dp else 26.dp)
                                    .graphicsLayer()
                                    .clip(CircleShape)
                                    .border(1.dp, Color(0x55FFFFFF), CircleShape)
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                SectionMiniTab(if (isCompactLandscape) "MST" else "MASTER", true) { onNavigateSection(AppSection.MASTER) }
                                SectionMiniTab(if (isCompactLandscape) "VID" else "VIDEO", false) { onNavigateSection(AppSection.VIDEO) }
                                SectionMiniTab(if (isCompactLandscape) "STM" else "STEMS", false) { onNavigateSection(AppSection.STEMS) }
                            }
                        }
                        Spacer(modifier = Modifier.height(2.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            CenterTabButton(
                                active = centerMode == MasterCenterMode.MIXER_EQ,
                                icon = { Icon(Icons.Default.Equalizer, "EQ", tint = Color.White, modifier = Modifier.size(14.dp)) },
                                onClick = { viewModel.selectMasterCenterMode(MasterCenterMode.MIXER_EQ) },
                                modifier = Modifier.weight(1f),
                                compact = isCompactLandscape
                            )
                            CenterTabButton(
                                active = centerMode == MasterCenterMode.WAVEFORM,
                                icon = { Icon(Icons.Default.GraphicEq, "Wave", tint = Color.White, modifier = Modifier.size(14.dp)) },
                                onClick = { viewModel.selectMasterCenterMode(MasterCenterMode.WAVEFORM) },
                                modifier = Modifier.weight(1f),
                                compact = isCompactLandscape
                            )
                            CenterTabButton(
                                active = centerMode == MasterCenterMode.VIDEO_PREVIEW,
                                icon = { Icon(Icons.Default.Slideshow, "Video", tint = Color.White, modifier = Modifier.size(14.dp)) },
                                onClick = { viewModel.selectMasterCenterMode(MasterCenterMode.VIDEO_PREVIEW) },
                                modifier = Modifier.weight(1f),
                                compact = isCompactLandscape
                            )
                        }
                    }

                    DeckTopHeader(
                        deck = deckB,
                        accentColor = ChronixColors.DeckBOrange,
                        isLeft = false,
                        compact = isCompactLandscape,
                        onLoadClick = { onPickAudio(DeckId.DECK_B) },
                        onSetMaster = { viewModel.audioEngine.setMasterDeck(DeckId.DECK_B) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // PARALLEL SCROLLING WAVEFORM + RECORDING BAR
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF0A0D12))
                    .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(5.dp))
                    .padding(horizontal = 5.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CompactStudioChip(
                        label = if (showParallelWave) "HIDE WAVE" else "SHOW WAVE",
                        active = showParallelWave,
                        accent = ChronixColors.DeckABlue
                    ) { showParallelWave = !showParallelWave }
                    CompactStudioChip("Z-", false, ChronixColors.SurfacePad) {
                        val next = (settings.waveformZoom - 0.25f).coerceIn(0.5f, 4.0f)
                        viewModel.updateSettings { it.copy(waveformZoom = next) }
                    }
                    Text(
                        text = String.format("Z %.2fx", settings.waveformZoom),
                        color = ChronixColors.TextPrimary,
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    CompactStudioChip("Z+", false, ChronixColors.SurfacePad) {
                        val next = (settings.waveformZoom + 0.25f).coerceIn(0.5f, 4.0f)
                        viewModel.updateSettings { it.copy(waveformZoom = next) }
                    }
                    CompactStudioChip("SPD-", false, ChronixColors.SurfacePad) {
                        val next = (settings.waveformScrollSpeed - 0.25f).coerceIn(0.5f, 3.0f)
                        viewModel.updateSettings { it.copy(waveformScrollSpeed = next) }
                    }
                    Text(
                        text = String.format("%.2fx", settings.waveformScrollSpeed),
                        color = ChronixColors.DeckBAmber,
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    CompactStudioChip("SPD+", false, ChronixColors.SurfacePad) {
                        val next = (settings.waveformScrollSpeed + 0.25f).coerceIn(0.5f, 3.0f)
                        viewModel.updateSettings { it.copy(waveformScrollSpeed = next) }
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    CompactStudioChip(
                        label = if (recordingState.mode == RecordingMode.VIDEO) "A/V" else "AUD",
                        active = recordingState.mode == RecordingMode.VIDEO,
                        accent = ChronixColors.DeckBOrange
                    ) {
                        val nextMode = if (recordingState.mode == RecordingMode.AUDIO) RecordingMode.VIDEO else RecordingMode.AUDIO
                        viewModel.setRecordingMode(nextMode)
                    }

                    when (recordingState.status) {
                        RecordingStatus.IDLE -> {
                            CompactStudioChip("● REC", false, ChronixColors.RecordRed) {
                                viewModel.startRecording()
                            }
                        }
                        RecordingStatus.RECORDING -> {
                            CompactStudioChip("PAUSE", true, ChronixColors.DeckBAmber) {
                                viewModel.pauseRecording()
                            }
                            CompactStudioChip("STOP", true, ChronixColors.RecordRed) {
                                viewModel.stopRecording()
                            }
                        }
                        RecordingStatus.PAUSED -> {
                            CompactStudioChip("RESUME", true, ChronixColors.ActiveGreen) {
                                viewModel.resumeRecording()
                            }
                            CompactStudioChip("STOP", true, ChronixColors.RecordRed) {
                                viewModel.stopRecording()
                            }
                        }
                    }

                    val mins = recordingState.elapsedSec / 60
                    val secs = recordingState.elapsedSec % 60
                    Text(
                        text = String.format("%02d:%02d", mins, secs),
                        color = if (recordingState.status == RecordingStatus.RECORDING) ChronixColors.RecordRed else ChronixColors.TextPrimary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    if (recordingState.savedFilePath != null && recordingState.status == RecordingStatus.IDLE) {
                        CompactStudioChip("SAVE", true, ChronixColors.ActiveGreen) {
                            viewModel.saveRecording()
                        }
                        CompactStudioChip("CLR", false, ChronixColors.SurfacePad) {
                            viewModel.clearSavedRecording()
                        }
                    }
                }

                if (showParallelWave) {
                    ParallelScrollingWaveformView(
                        deckA = deckA,
                        deckB = deckB,
                        zoom = settings.waveformZoom,
                        scrollSpeed = settings.waveformScrollSpeed,
                        showBeatGrid = settings.showBeatGrid,
                        liteMode = settings.liteMode,
                        onSeekA = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_A, ms) },
                        onSeekB = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_B, ms) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (isPortraitPhone) 38.dp else if (isCompactLandscape) 32.dp else 42.dp)
                    )
                }
            }

            if (isPortraitPhone) {
                // PORTRAIT PHONE PANE SWITCHER (Deck A | Mixer | Deck B — zero cramped horizontal squeezing)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(28.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(ChronixColors.SurfaceDark)
                        .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(5.dp))
                        .padding(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    PhonePaneTab(
                        label = "DECK A",
                        active = phonePane == PhoneMasterPane.DECK_A,
                        accent = ChronixColors.DeckABlue,
                        onClick = { phonePane = PhoneMasterPane.DECK_A },
                        modifier = Modifier.weight(1f)
                    )
                    PhonePaneTab(
                        label = "MIXER · EQ",
                        active = phonePane == PhoneMasterPane.MIXER,
                        accent = ChronixColors.ActiveGreen,
                        onClick = { phonePane = PhoneMasterPane.MIXER },
                        modifier = Modifier.weight(1f)
                    )
                    PhonePaneTab(
                        label = "DECK B",
                        active = phonePane == PhoneMasterPane.DECK_B,
                        accent = ChronixColors.DeckBOrange,
                        onClick = { phonePane = PhoneMasterPane.DECK_B },
                        modifier = Modifier.weight(1f)
                    )
                }

                // Active Portrait Pane
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    when (phonePane) {
                        PhoneMasterPane.DECK_A -> {
                            DeckWorkspaceColumn(
                                deck = deckA,
                                accentColor = ChronixColors.DeckABlue,
                                isLeft = true,
                                showPlatterVideo = deckA.isVideo && centerMode != MasterCenterMode.VIDEO_PREVIEW,
                                padMode = padModes[DeckId.DECK_A] ?: PadMode.STEMS,
                                deleteCueActive = cueDeleteMode[DeckId.DECK_A] ?: false,
                                samplerPads = samplerPads,
                                samplerEditMode = samplerEditMode,
                                onToggleSamplerEditMode = { samplerEditMode = !samplerEditMode },
                                onAddSampler = { onPickSamplerAudio(null) },
                                onEditSamplerPad = { padId -> editingSamplerPadId = padId },
                                viewModel = viewModel,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                        PhoneMasterPane.MIXER -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0xFF06080B))
                                    .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
                            ) {
                                when (centerMode) {
                                    MasterCenterMode.WAVEFORM -> DualVerticalWaveformView(
                                        deckA = deckA,
                                        deckB = deckB,
                                        zoom = settings.waveformZoom,
                                        scrollSpeed = settings.waveformScrollSpeed,
                                        showBeatGrid = settings.showBeatGrid,
                                        liteMode = settings.liteMode,
                                        onSeekA = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_A, ms) },
                                        onSeekB = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_B, ms) }
                                    )
                                    MasterCenterMode.MIXER_EQ -> CenterEqMixerPanel(
                                        deckA = deckA,
                                        deckB = deckB,
                                        masterVolume = masterVolume,
                                        recordingState = recordingState,
                                        viewModel = viewModel,
                                        knobSizeDp = 42
                                    )
                                    MasterCenterMode.VIDEO_PREVIEW -> CenterVideoPreviewPanel(
                                        deckA = deckA,
                                        deckB = deckB,
                                        crossfader = crossfader,
                                        viewModel = viewModel,
                                        onExpand = { onNavigateSection(AppSection.VIDEO) }
                                    )
                                }
                            }
                        }
                        PhoneMasterPane.DECK_B -> {
                            DeckWorkspaceColumn(
                                deck = deckB,
                                accentColor = ChronixColors.DeckBOrange,
                                isLeft = false,
                                showPlatterVideo = deckB.isVideo && centerMode != MasterCenterMode.VIDEO_PREVIEW,
                                padMode = padModes[DeckId.DECK_B] ?: PadMode.CUE,
                                deleteCueActive = cueDeleteMode[DeckId.DECK_B] ?: false,
                                samplerPads = samplerPads,
                                samplerEditMode = samplerEditMode,
                                onToggleSamplerEditMode = { samplerEditMode = !samplerEditMode },
                                onAddSampler = { onPickSamplerAudio(null) },
                                onEditSamplerPad = { padId -> editingSamplerPadId = padId },
                                viewModel = viewModel,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }
                }

                // FIXED COMPACT PORTRAIT BOTTOM CROSSFADER + DUAL TRANSPORT BAR
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF07090E))
                        .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
                        .padding(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Crossfader Strip
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(34.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(ChronixColors.SurfaceCard)
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        CompactStudioChip("FADE A", crossfader < 0.05f, ChronixColors.DeckABlue) {
                            viewModel.animateCrossfaderTo(0f)
                        }
                        Icon(
                            Icons.Default.ChevronLeft,
                            contentDescription = "Cut Left",
                            tint = Color.White,
                            modifier = Modifier
                                .size(20.dp)
                                .clickable { viewModel.setCrossfader(0f) }
                        )
                        Slider(
                            value = crossfader,
                            onValueChange = { viewModel.setCrossfader(it) },
                            colors = SliderDefaults.colors(
                                thumbColor = Color.White,
                                activeTrackColor = ChronixColors.DeckABlue,
                                inactiveTrackColor = ChronixColors.DeckBOrange
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Cut Right",
                            tint = Color.White,
                            modifier = Modifier
                                .size(20.dp)
                                .clickable { viewModel.setCrossfader(1f) }
                        )
                        CompactStudioChip("FADE B", crossfader > 0.95f, ChronixColors.DeckBOrange) {
                            viewModel.animateCrossfaderTo(1f)
                        }
                    }

                    // Dual Transport Row (Deck A + Deck B side-by-side)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(38.dp),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CueHoldButton(
                            previewing = deckA.cuePreviewing,
                            onPress = { viewModel.audioEngine.cuePress(DeckId.DECK_A) },
                            onRelease = { viewModel.audioEngine.cueRelease(DeckId.DECK_A) },
                            modifier = Modifier.weight(1f)
                        )
                        TransportButton(
                            label = if (deckA.isPlaying && !deckA.cuePreviewing) "PAUSE" else "PLAY",
                            bg = if (deckA.isPlaying && !deckA.cuePreviewing) ChronixColors.DeckABlue else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1.1f),
                            compact = true
                        ) { viewModel.audioEngine.togglePlayPause(DeckId.DECK_A) }
                        TransportButton(
                            label = "SYNC",
                            bg = if (deckA.syncLocked) ChronixColors.DeckABlue else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1f),
                            compact = true
                        ) { viewModel.audioEngine.syncBpm(DeckId.DECK_A) }

                        Spacer(modifier = Modifier.width(2.dp))

                        TransportButton(
                            label = "SYNC",
                            bg = if (deckB.syncLocked) ChronixColors.DeckBOrange else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1f),
                            compact = true
                        ) { viewModel.audioEngine.syncBpm(DeckId.DECK_B) }
                        CueHoldButton(
                            previewing = deckB.cuePreviewing,
                            onPress = { viewModel.audioEngine.cuePress(DeckId.DECK_B) },
                            onRelease = { viewModel.audioEngine.cueRelease(DeckId.DECK_B) },
                            modifier = Modifier.weight(1f)
                        )
                        TransportButton(
                            label = if (deckB.isPlaying && !deckB.cuePreviewing) "PAUSE" else "PLAY",
                            bg = if (deckB.isPlaying && !deckB.cuePreviewing) ChronixColors.DeckBOrange else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1.1f),
                            compact = true
                        ) { viewModel.audioEngine.togglePlayPause(DeckId.DECK_B) }
                    }
                }
            } else {
                // LANDSCAPE / TABLET 3-COLUMN MIXING SURFACE
                val centerWidth = if (isCompactLandscape) 150.dp else 196.dp
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(if (isCompactLandscape) 3.dp else 4.dp)
                ) {
                    DeckWorkspaceColumn(
                        deck = deckA,
                        accentColor = ChronixColors.DeckABlue,
                        isLeft = true,
                        showPlatterVideo = deckA.isVideo && centerMode != MasterCenterMode.VIDEO_PREVIEW,
                        padMode = padModes[DeckId.DECK_A] ?: PadMode.STEMS,
                        deleteCueActive = cueDeleteMode[DeckId.DECK_A] ?: false,
                        samplerPads = samplerPads,
                        samplerEditMode = samplerEditMode,
                        onToggleSamplerEditMode = { samplerEditMode = !samplerEditMode },
                        onAddSampler = { onPickSamplerAudio(null) },
                        onEditSamplerPad = { padId -> editingSamplerPadId = padId },
                        viewModel = viewModel,
                        modifier = Modifier.weight(1f)
                    )

                    Box(
                        modifier = Modifier
                            .width(centerWidth)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF06080B))
                            .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
                    ) {
                        when (centerMode) {
                            MasterCenterMode.WAVEFORM -> {
                                DualVerticalWaveformView(
                                    deckA = deckA,
                                    deckB = deckB,
                                    zoom = settings.waveformZoom,
                                    scrollSpeed = settings.waveformScrollSpeed,
                                    showBeatGrid = settings.showBeatGrid,
                                    liteMode = settings.liteMode,
                                    onSeekA = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_A, ms) },
                                    onSeekB = { ms -> viewModel.audioEngine.seekTo(DeckId.DECK_B, ms) }
                                )
                            }
                            MasterCenterMode.MIXER_EQ -> {
                                CenterEqMixerPanel(
                                    deckA = deckA,
                                    deckB = deckB,
                                    masterVolume = masterVolume,
                                    recordingState = recordingState,
                                    viewModel = viewModel,
                                    knobSizeDp = if (isCompactLandscape) 26 else 38
                                )
                            }
                            MasterCenterMode.VIDEO_PREVIEW -> {
                                CenterVideoPreviewPanel(
                                    deckA = deckA,
                                    deckB = deckB,
                                    crossfader = crossfader,
                                    viewModel = viewModel,
                                    onExpand = { onNavigateSection(AppSection.VIDEO) }
                                )
                            }
                        }
                    }

                    DeckWorkspaceColumn(
                        deck = deckB,
                        accentColor = ChronixColors.DeckBOrange,
                        isLeft = false,
                        showPlatterVideo = deckB.isVideo && centerMode != MasterCenterMode.VIDEO_PREVIEW,
                        padMode = padModes[DeckId.DECK_B] ?: PadMode.CUE,
                        deleteCueActive = cueDeleteMode[DeckId.DECK_B] ?: false,
                        samplerPads = samplerPads,
                        samplerEditMode = samplerEditMode,
                        onToggleSamplerEditMode = { samplerEditMode = !samplerEditMode },
                        onAddSampler = { onPickSamplerAudio(null) },
                        onEditSamplerPad = { padId -> editingSamplerPadId = padId },
                        viewModel = viewModel,
                        modifier = Modifier.weight(1f)
                    )
                }

                // FIXED LANDSCAPE BOTTOM TRANSPORT & CROSSFADER ROW (Flexible Weights — fits 640dp phones cleanly)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (isCompactLandscape) 40.dp else 46.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(if (isCompactLandscape) 3.dp else 5.dp)
                ) {
                    Row(
                        modifier = Modifier.weight(1.2f),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CueHoldButton(
                            previewing = deckA.cuePreviewing,
                            onPress = { viewModel.audioEngine.cuePress(DeckId.DECK_A) },
                            onRelease = { viewModel.audioEngine.cueRelease(DeckId.DECK_A) },
                            modifier = Modifier.weight(1f)
                        )
                        if (!isCompactLandscape) {
                            CompactStudioChip("SET", false, ChronixColors.SurfaceCard) {
                                viewModel.audioEngine.setMainCue(DeckId.DECK_A)
                            }
                        }
                        TransportButton(
                            label = if (deckA.isPlaying && !deckA.cuePreviewing) "PAUSE" else "PLAY",
                            bg = if (deckA.isPlaying && !deckA.cuePreviewing) ChronixColors.DeckABlue else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1.05f),
                            compact = isCompactLandscape
                        ) { viewModel.audioEngine.togglePlayPause(DeckId.DECK_A) }
                        TransportButton(
                            label = "SYNC",
                            bg = if (deckA.syncLocked) ChronixColors.DeckABlue else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1f),
                            compact = isCompactLandscape
                        ) { viewModel.audioEngine.syncBpm(DeckId.DECK_A) }
                    }

                    Row(
                        modifier = Modifier
                            .weight(1.55f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(6.dp))
                            .background(ChronixColors.SurfaceCard)
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        CompactStudioChip(if (isCompactLandscape) "A" else "FADE A", crossfader < 0.05f, ChronixColors.DeckABlue) {
                            viewModel.animateCrossfaderTo(0f)
                        }
                        Icon(
                            Icons.Default.ChevronLeft,
                            contentDescription = "Cut Left",
                            tint = Color.White,
                            modifier = Modifier
                                .size(18.dp)
                                .clickable { viewModel.setCrossfader(0f) }
                        )
                        Slider(
                            value = crossfader,
                            onValueChange = { viewModel.setCrossfader(it) },
                            colors = SliderDefaults.colors(
                                thumbColor = Color.White,
                                activeTrackColor = ChronixColors.DeckABlue,
                                inactiveTrackColor = ChronixColors.DeckBOrange
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Cut Right",
                            tint = Color.White,
                            modifier = Modifier
                                .size(18.dp)
                                .clickable { viewModel.setCrossfader(1f) }
                        )
                        CompactStudioChip(if (isCompactLandscape) "B" else "FADE B", crossfader > 0.95f, ChronixColors.DeckBOrange) {
                            viewModel.animateCrossfaderTo(1f)
                        }
                    }

                    Row(
                        modifier = Modifier.weight(1.2f),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TransportButton(
                            label = "SYNC",
                            bg = if (deckB.syncLocked) ChronixColors.DeckBOrange else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1f),
                            compact = isCompactLandscape
                        ) { viewModel.audioEngine.syncBpm(DeckId.DECK_B) }
                        CueHoldButton(
                            previewing = deckB.cuePreviewing,
                            onPress = { viewModel.audioEngine.cuePress(DeckId.DECK_B) },
                            onRelease = { viewModel.audioEngine.cueRelease(DeckId.DECK_B) },
                            modifier = Modifier.weight(1f)
                        )
                        if (!isCompactLandscape) {
                            CompactStudioChip("SET", false, ChronixColors.SurfaceCard) {
                                viewModel.audioEngine.setMainCue(DeckId.DECK_B)
                            }
                        }
                        TransportButton(
                            label = if (deckB.isPlaying && !deckB.cuePreviewing) "PAUSE" else "PLAY",
                            bg = if (deckB.isPlaying && !deckB.cuePreviewing) ChronixColors.DeckBOrange else ChronixColors.SurfacePad,
                            modifier = Modifier.weight(1.05f),
                            compact = isCompactLandscape
                        ) { viewModel.audioEngine.togglePlayPause(DeckId.DECK_B) }
                    }
                }
            }
        }

        val editingPad = editingSamplerPadId?.let { id -> samplerPads.firstOrNull { it.id == id } }
        if (editingPad != null) {
            SamplerPadEditorDialog(
                pad = editingPad,
                onDismiss = { editingSamplerPadId = null },
                onSave = { label, vol, loop ->
                    viewModel.samplerEngine.updateSamplerSettings(editingPad.id, label, vol, loop)
                    editingSamplerPadId = null
                },
                onPickReplaceAudio = {
                    onPickSamplerAudio(editingPad.id)
                    editingSamplerPadId = null
                },
                onTest = { viewModel.samplerEngine.triggerPad(editingPad.id) },
                onDeleteOrReset = {
                    viewModel.samplerEngine.resetOrDeleteSampler(editingPad.id)
                    editingSamplerPadId = null
                }
            )
        }
    }
}

@Composable
private fun PhonePaneTab(
    label: String,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) accent else ChronixColors.SurfacePad)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun DeckTopHeader(
    deck: DeckState,
    accentColor: Color,
    isLeft: Boolean,
    compact: Boolean,
    onLoadClick: () -> Unit,
    onSetMaster: () -> Unit,
    modifier: Modifier = Modifier
) {
    val liveBpm = deck.detectedBpm * (1f + deck.pitchPercent / 100f)
    val boxSize = if (compact) 34.dp else 44.dp
    val bpmFontSize = if (compact) 9.sp else 11.sp
    val titleFontSize = if (compact) 10.sp else 12.sp

    Row(
        modifier = modifier
            .fillMaxHeight()
            .padding(horizontal = if (compact) 2.dp else 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 6.dp)
    ) {
        if (isLeft) {
            LoadSongBox(accentColor, boxSize, onLoadClick)
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(
                            text = if (deck.detectedBpm > 0f) String.format("%.1f", liveBpm) else "0.0",
                            color = accentColor,
                            fontSize = bpmFontSize,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            maxLines = 1
                        )
                        if (deck.isLoaded) {
                            CompactStudioChip("MST", deck.syncMaster, accentColor) { onSetMaster() }
                        }
                    }
                    Text(
                        text = deck.title,
                        color = accentColor,
                        fontSize = titleFontSize,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 4.dp)
                            .clickable { onLoadClick() }
                    )
                }
            }
        } else {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = deck.title,
                        color = accentColor,
                        fontSize = titleFontSize,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(end = 4.dp)
                            .clickable { onLoadClick() }
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        if (deck.isLoaded) {
                            CompactStudioChip("MST", deck.syncMaster, accentColor) { onSetMaster() }
                        }
                        Text(
                            text = if (deck.detectedBpm > 0f) String.format("%.1f", liveBpm) else "0.0",
                            color = accentColor,
                            fontSize = bpmFontSize,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            maxLines = 1
                        )
                    }
                }
            }
            LoadSongBox(accentColor, boxSize, onLoadClick)
        }
    }
}

@Composable
private fun LoadSongBox(
    accentColor: Color,
    boxSize: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(boxSize)
            .clip(RoundedCornerShape(6.dp))
            .background(ChronixColors.SurfaceCard)
            .border(1.dp, accentColor.copy(alpha = 0.6f), RoundedCornerShape(6.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Default.Add,
            contentDescription = "Load Track",
            tint = Color.White,
            modifier = Modifier.size(boxSize * 0.5f)
        )
    }
}

@Composable
private fun SectionMiniTab(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) ChronixColors.DeckABlue else ChronixColors.SurfaceCard)
            .clickable { onClick() }
            .padding(horizontal = 5.dp, vertical = 3.dp)
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 8.5.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun CenterTabButton(
    active: Boolean,
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    Box(
        modifier = modifier
            .height(if (compact) 22.dp else 25.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) ChronixColors.ActiveGreen else ChronixColors.SurfacePad)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        icon()
    }
}

@Composable
private fun DeckWorkspaceColumn(
    deck: DeckState,
    accentColor: Color,
    isLeft: Boolean,
    showPlatterVideo: Boolean,
    padMode: PadMode,
    deleteCueActive: Boolean,
    samplerPads: List<SamplerPadState>,
    samplerEditMode: Boolean,
    onToggleSamplerEditMode: () -> Unit,
    onAddSampler: () -> Unit,
    onEditSamplerPad: (String) -> Unit,
    viewModel: ChronixDjViewModel,
    modifier: Modifier = Modifier
) {
    val skinScrimBrush = remember {
        Brush.verticalGradient(
            colors = listOf(Color(0xDB0B1018), Color(0xCC090D14), Color(0xF006080D))
        )
    }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, accentColor.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
    ) {
        val compactDeck = maxWidth < 310.dp || maxHeight < 250.dp
        val fxWidth = if (compactDeck) 78.dp else 104.dp
        val modWidth = if (compactDeck) 38.dp else 46.dp
        val faderWidth = if (compactDeck) 28.dp else 36.dp
        val padTabHeight = if (compactDeck) 22.dp else 26.dp
        val padHeight = if (compactDeck) 24.dp else 30.dp

        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer()
        ) {
            Image(
                painter = painterResource(id = R.drawable.dj_emma_pro_skin),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = BiasAlignment(0f, -0.35f),
                modifier = Modifier
                    .fillMaxSize()
                    .alpha(0.32f)
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(skinScrimBrush)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(if (compactDeck) 3.dp else 4.dp),
            verticalArrangement = Arrangement.spacedBy(if (compactDeck) 3.dp else 4.dp)
        ) {
            // Upper section: FX + Modifiers + Jog Wheel + Pitch/Vol Faders (Proportional & never crushes wheel)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(if (compactDeck) 3.dp else 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isLeft) {
                    FxAndLoopColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(fxWidth))
                    DeckModifierColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(modWidth))
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        contentAlignment = Alignment.Center
                    ) {
                        TurntableJogWheel(
                            bpm = deck.detectedBpm,
                            musicalKey = deck.musicalKey,
                            pitchPercent = deck.pitchPercent,
                            positionMs = deck.positionMs,
                            durationMs = deck.durationMs,
                            platterDegrees = deck.platterDegrees,
                            accentColor = accentColor,
                            onScratchDelta = { viewModel.audioEngine.nudgePlatter(deck.deckId, it) },
                            modifier = Modifier.fillMaxSize(),
                            player = viewModel.audioEngine.getPlayer(deck.deckId),
                            showVideo = showPlatterVideo,
                            onScratchStart = { viewModel.audioEngine.beginScratch(deck.deckId) },
                            onScratchEnd = { viewModel.audioEngine.endScratch(deck.deckId) }
                        )
                    }
                    PitchAndVolumeColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(faderWidth))
                } else {
                    PitchAndVolumeColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(faderWidth))
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        contentAlignment = Alignment.Center
                    ) {
                        TurntableJogWheel(
                            bpm = deck.detectedBpm,
                            musicalKey = deck.musicalKey,
                            pitchPercent = deck.pitchPercent,
                            positionMs = deck.positionMs,
                            durationMs = deck.durationMs,
                            platterDegrees = deck.platterDegrees,
                            accentColor = accentColor,
                            onScratchDelta = { viewModel.audioEngine.nudgePlatter(deck.deckId, it) },
                            modifier = Modifier.fillMaxSize(),
                            player = viewModel.audioEngine.getPlayer(deck.deckId),
                            showVideo = showPlatterVideo,
                            onScratchStart = { viewModel.audioEngine.beginScratch(deck.deckId) },
                            onScratchEnd = { viewModel.audioEngine.endScratch(deck.deckId) }
                        )
                    }
                    DeckModifierColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(modWidth))
                    FxAndLoopColumn(deck, accentColor, viewModel, compactDeck, Modifier.width(fxWidth))
                }
            }

            // Performance Pad Mode Tabs (CUE / SMP / SCRT / STEMS)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(padTabHeight),
                horizontalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                PadModeTab(
                    label = "CUE",
                    active = padMode == PadMode.CUE,
                    accentColor = accentColor,
                    icon = {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Clear Cue",
                            tint = if (deleteCueActive) ChronixColors.RecordRed else Color.White,
                            modifier = Modifier
                                .size(12.dp)
                                .clickable { viewModel.toggleCueDeleteMode(deck.deckId) }
                        )
                    },
                    onClick = { viewModel.setPadMode(deck.deckId, PadMode.CUE) },
                    modifier = Modifier.weight(1f)
                )
                PadModeTab(
                    label = "SMP",
                    active = padMode == PadMode.SMP,
                    accentColor = accentColor,
                    icon = { Icon(Icons.Default.VolumeUp, null, tint = Color.White, modifier = Modifier.size(12.dp)) },
                    onClick = { viewModel.setPadMode(deck.deckId, PadMode.SMP) },
                    modifier = Modifier.weight(1f)
                )
                PadModeTab(
                    label = "SCRT",
                    active = padMode == PadMode.SCRT,
                    accentColor = accentColor,
                    icon = { Icon(Icons.Default.Edit, null, tint = Color.White, modifier = Modifier.size(12.dp)) },
                    onClick = { viewModel.setPadMode(deck.deckId, PadMode.SCRT) },
                    modifier = Modifier.weight(1f)
                )
                PadModeTab(
                    label = "STEMS",
                    active = padMode == PadMode.STEMS,
                    accentColor = accentColor,
                    icon = null,
                    onClick = { viewModel.setPadMode(deck.deckId, PadMode.STEMS) },
                    modifier = Modifier.weight(1f)
                )
            }

            // Custom Sampler Toolbar + Dynamic Grid (when SMP tab active)
            if (padMode == PadMode.SMP) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF0A0E16))
                        .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(4.dp))
                        .padding(horizontal = 5.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (samplerEditMode) "TAP PAD TO EDIT" else "BANK · ${samplerPads.size} PADS",
                        color = if (samplerEditMode) ChronixColors.DeckBAmber else ChronixColors.TextMuted,
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (samplerPads.any { it.isPlaying }) {
                            CompactStudioChip("STOP", true, ChronixColors.RecordRed) {
                                viewModel.samplerEngine.stopAll()
                            }
                        }
                        CompactStudioChip(
                            label = if (samplerEditMode) "DONE" else "EDIT",
                            active = samplerEditMode,
                            accent = ChronixColors.DeckBAmber
                        ) { onToggleSamplerEditMode() }
                        CompactStudioChip("+ ADD", true, accentColor) {
                            onAddSampler()
                        }
                    }
                }

                val rows = samplerPads.chunked(4)
                val gridModifier = if (rows.size > 2) {
                    Modifier
                        .fillMaxWidth()
                        .height(padHeight * 2 + 4.dp)
                        .verticalScroll(rememberScrollState())
                } else {
                    Modifier.fillMaxWidth()
                }
                Column(
                    modifier = gridModifier,
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    rows.forEach { rowPads ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            rowPads.forEach { pad ->
                                val padBg = when {
                                    pad.isPlaying -> accentColor.copy(alpha = 0.9f)
                                    samplerEditMode -> Color(0xFF3A2D16)
                                    pad.sourceType == SamplerSourceType.CUSTOM_FILE -> Color(0xFF1F2B3D)
                                    else -> ChronixColors.SurfacePad
                                }
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(padHeight)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(padBg)
                                        .border(
                                            1.dp,
                                            if (pad.isPlaying) Color.White else if (pad.sourceType == SamplerSourceType.CUSTOM_FILE) accentColor.copy(alpha = 0.6f) else Color.Transparent,
                                            RoundedCornerShape(4.dp)
                                        )
                                        .clickable {
                                            if (samplerEditMode) {
                                                onEditSamplerPad(pad.id)
                                            } else {
                                                viewModel.samplerEngine.triggerPad(pad.id)
                                            }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = if (pad.loop) "${pad.label} ∞" else pad.label,
                                        color = Color.White,
                                        fontSize = if (compactDeck) 8.sp else 9.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.padding(horizontal = 3.dp)
                                    )
                                }
                            }
                            repeat(4 - rowPads.size) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            } else {
                // 2x4 Performance Pads Grid for CUE / SCRT / STEMS
                val acapelSolo = !deck.stemBypassed && deck.activeStems.vocals &&
                    !deck.activeStems.drums && !deck.activeStems.bass && !deck.activeStems.melody
                val instruOn = !deck.stemBypassed && !deck.activeStems.vocals &&
                    deck.activeStems.drums && deck.activeStems.bass && deck.activeStems.melody
                val labels = when (padMode) {
                    PadMode.CUE -> List(8) { "${it + 1}" }
                    PadMode.SMP -> emptyList()
                    PadMode.SCRT -> listOf("-4 BT", "+4 BT", "1/2X", "2X", "SPINBK", "BRAKE", "STUTTER", "ROLL")
                    PadMode.STEMS -> listOf(
                        "DRUMS",
                        "BASS",
                        "MELODY",
                        "ACAPEL",
                        "INSTRU",
                        if (deck.stemBypassed) "FULL" else "RESET",
                        "FX1",
                        "FX2"
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (row in 0..1) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            for (col in 0..3) {
                                val idx = row * 4 + col
                                val cueSet = padMode == PadMode.CUE && deck.hotCues.getOrNull(idx)?.positionMs != null
                                val stemActive = padMode == PadMode.STEMS && when (idx) {
                                    0 -> !deck.stemBypassed && deck.activeStems.drums
                                    1 -> !deck.stemBypassed && deck.activeStems.bass
                                    2 -> !deck.stemBypassed && deck.activeStems.melody
                                    3 -> !deck.stemBypassed && deck.activeStems.vocals
                                    4 -> instruOn
                                    5 -> deck.stemBypassed
                                    6 -> deck.fxSlots.getOrNull(0)?.enabled == true
                                    else -> deck.fxSlots.getOrNull(1)?.enabled == true
                                }
                                val padBg = when {
                                    cueSet -> accentColor.copy(alpha = 0.75f)
                                    stemActive && idx == 5 -> ChronixColors.ActiveGreen.copy(alpha = 0.85f)
                                    stemActive && idx == 3 && acapelSolo -> Color(0xFFD97706)
                                    stemActive -> accentColor.copy(alpha = 0.85f)
                                    else -> ChronixColors.SurfacePad
                                }
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(padHeight)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(padBg)
                                        .clickable {
                                            when (padMode) {
                                                PadMode.CUE -> viewModel.audioEngine.triggerHotCue(deck.deckId, idx, deleteCueActive)
                                                PadMode.STEMS -> when (idx) {
                                                    0 -> viewModel.audioEngine.isolateDeckStem(deck.deckId, DeckStemKey.DRUMS)
                                                    1 -> viewModel.audioEngine.isolateDeckStem(deck.deckId, DeckStemKey.BASS)
                                                    2 -> viewModel.audioEngine.isolateDeckStem(deck.deckId, DeckStemKey.MELODY)
                                                    3 -> viewModel.audioEngine.isolateDeckStem(deck.deckId, DeckStemKey.VOCALS)
                                                    4 -> viewModel.audioEngine.toggleInstrumentalMode(deck.deckId)
                                                    5 -> viewModel.audioEngine.toggleStemsBypass(deck.deckId)
                                                    6 -> viewModel.audioEngine.toggleFxSlot(deck.deckId, 0)
                                                    else -> viewModel.audioEngine.toggleFxSlot(deck.deckId, 1)
                                                }
                                                PadMode.SCRT -> {
                                                    if (idx == 0) viewModel.audioEngine.seekTo(deck.deckId, deck.positionMs - 2000L)
                                                    if (idx == 1) viewModel.audioEngine.seekTo(deck.deckId, deck.positionMs + 2000L)
                                                    if (idx == 4) viewModel.audioEngine.nudgePlatter(deck.deckId, -360f)
                                                }
                                                PadMode.SMP -> Unit
                                            }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = labels[idx],
                                        color = Color.White,
                                        fontSize = if (compactDeck) 8.5.sp else 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FxAndLoopColumn(
    deck: DeckState,
    accentColor: Color,
    viewModel: ChronixDjViewModel,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxHeight(),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = if (deck.deckId == DeckId.DECK_A) "A FX" else "B FX",
            color = ChronixColors.TextMuted,
            fontSize = if (compact) 8.sp else 9.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
        deck.fxSlots.forEachIndexed { index, slot ->
            var menuOpen by remember { mutableStateOf(false) }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (compact) 21.dp else 25.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (slot.enabled) accentColor.copy(alpha = 0.35f) else ChronixColors.SurfaceCard)
                    .border(
                        width = 1.dp,
                        color = if (slot.enabled) accentColor else ChronixColors.BorderSubtle,
                        shape = RoundedCornerShape(4.dp)
                    )
                    .clickable { viewModel.audioEngine.toggleFxSlot(deck.deckId, index) }
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = slot.type.label,
                        color = Color.White,
                        fontSize = if (compact) 8.sp else 9.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "▼",
                        color = ChronixColors.TextMuted,
                        fontSize = 7.sp,
                        modifier = Modifier.clickable { menuOpen = true }
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    FxType.entries.forEach { fxType ->
                        DropdownMenuItem(
                            text = { Text(fxType.label, fontSize = 12.sp) },
                            onClick = {
                                viewModel.setFxSlotType(deck.deckId, index, fxType)
                                menuOpen = false
                            }
                        )
                    }
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("LOOP", color = ChronixColors.TextMuted, fontSize = 7.5.sp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (compact) 21.dp else 25.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (deck.loopActive) accentColor else ChronixColors.SurfaceCard),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Icon(
                    Icons.Default.ChevronLeft,
                    contentDescription = "Halve Loop",
                    tint = Color.White,
                    modifier = Modifier
                        .size(if (compact) 16.dp else 20.dp)
                        .clickable { viewModel.audioEngine.stepLoopSize(deck.deckId, -1) }
                )
                Text(
                    text = when (deck.loopBeats) {
                        0.125f -> "1/8"
                        0.25f -> "1/4"
                        0.5f -> "1/2"
                        else -> deck.loopBeats.toInt().toString()
                    },
                    color = Color.White,
                    fontSize = if (compact) 8.5.sp else 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { viewModel.audioEngine.toggleLoop(deck.deckId) }
                )
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = "Double Loop",
                    tint = Color.White,
                    modifier = Modifier
                        .size(if (compact) 16.dp else 20.dp)
                        .clickable { viewModel.audioEngine.stepLoopSize(deck.deckId, 1) }
                )
            }
        }
    }
}

@Composable
private fun DeckModifierColumn(
    deck: DeckState,
    accentColor: Color,
    viewModel: ChronixDjViewModel,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxHeight(),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        MiniModBtn("SLIP", deck.slipEnabled, accentColor, compact) {
            viewModel.audioEngine.toggleSlip(deck.deckId)
        }
        MiniModBtn(
            label = when {
                !deck.stemBypassed && deck.activeStems.vocals && !deck.activeStems.drums -> "ACPL"
                !deck.stemBypassed && !deck.activeStems.vocals -> "NOVX"
                else -> "ACPL"
            },
            active = !deck.stemBypassed,
            accentColor = if (!deck.stemBypassed && deck.activeStems.vocals && !deck.activeStems.drums) Color(0xFFD97706) else ChronixColors.ActiveGreen,
            compact = compact
        ) {
            viewModel.audioEngine.isolateDeckStem(deck.deckId, DeckStemKey.VOCALS)
        }
        MiniModBtn("QNTZ", deck.quantizeEnabled, accentColor, compact) {
            viewModel.audioEngine.toggleQuantize(deck.deckId)
        }
        MiniModBtn(
            label = if (deck.keyLockEnabled) "${deck.musicalKey}·K" else deck.musicalKey,
            active = deck.keyLockEnabled,
            accentColor = accentColor,
            compact = compact
        ) {
            viewModel.audioEngine.toggleKeyLock(deck.deckId)
        }
        MiniModBtn("±${deck.pitchRangePercent}%", true, accentColor, compact) {
            viewModel.audioEngine.cyclePitchRange(deck.deckId)
        }
    }
}

@Composable
private fun MiniModBtn(
    label: String,
    active: Boolean,
    accentColor: Color,
    compact: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (compact) 18.dp else 22.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(if (active) accentColor.copy(alpha = 0.8f) else ChronixColors.SurfacePad)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = if (compact) 7.sp else 8.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun PitchAndVolumeColumn(
    deck: DeckState,
    accentColor: Color,
    viewModel: ChronixDjViewModel,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxHeight(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Text("VOL", color = ChronixColors.TextMuted, fontSize = if (compact) 7.sp else 8.sp)
        Slider(
            value = deck.volume,
            onValueChange = { viewModel.audioEngine.setDeckVolume(deck.deckId, it) },
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = accentColor),
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        )
        Text("PTC", color = ChronixColors.TextMuted, fontSize = if (compact) 7.sp else 8.sp)
        Slider(
            value = deck.pitchPercent,
            valueRange = -deck.pitchRangePercent.toFloat()..deck.pitchRangePercent.toFloat(),
            onValueChange = { viewModel.audioEngine.setPitchPercent(deck.deckId, it) },
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = accentColor),
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        )
    }
}

@Composable
private fun CenterEqMixerPanel(
    deckA: DeckState,
    deckB: DeckState,
    masterVolume: Float,
    recordingState: RecordingState,
    viewModel: ChronixDjViewModel,
    knobSizeDp: Int = 38
) {
    val knobSize = knobSizeDp.dp
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(if (knobSizeDp < 32) 4.dp else 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            val recActive = recordingState.status != RecordingStatus.IDLE
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (recActive) ChronixColors.RecordRed else ChronixColors.SurfacePad)
                    .clickable {
                        when (recordingState.status) {
                            RecordingStatus.IDLE -> viewModel.startRecording()
                            RecordingStatus.RECORDING -> viewModel.pauseRecording()
                            RecordingStatus.PAUSED -> viewModel.resumeRecording()
                        }
                    }
                    .padding(horizontal = 6.dp, vertical = 3.dp)
            ) {
                Text(
                    text = when (recordingState.status) {
                        RecordingStatus.RECORDING -> "⏸ REC"
                        RecordingStatus.PAUSED -> "▶ REC"
                        RecordingStatus.IDLE -> "● REC"
                    },
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Row(
                modifier = Modifier.weight(1f).padding(start = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("MST", color = ChronixColors.TextMuted, fontSize = 8.sp)
                Slider(
                    value = masterVolume,
                    onValueChange = { viewModel.setMasterVolume(it) },
                    modifier = Modifier.weight(1f).height(20.dp),
                    colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = ChronixColors.ActiveGreen)
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceEvenly,
                modifier = Modifier.fillMaxHeight()
            ) {
                RotaryKnob("GAIN", (deckA.gainDb + 12f) / 24f, ChronixColors.DeckABlue,
                    onValueChange = { viewModel.audioEngine.setGainDb(DeckId.DECK_A, it * 24f - 12f) }, size = knobSize)
                RotaryKnob("HIGH", deckA.eqHigh, ChronixColors.DeckABlue,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_A, high = it) }, size = knobSize)
                RotaryKnob("MID", deckA.eqMid, ChronixColors.DeckABlue,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_A, mid = it) }, size = knobSize)
                RotaryKnob("LOW", deckA.eqLow, ChronixColors.DeckABlue,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_A, low = it) }, size = knobSize)
                RotaryKnob("FLTR", deckA.filterValue, ChronixColors.DeckACyan,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_A, filter = it) }, size = knobSize)
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceEvenly,
                modifier = Modifier.fillMaxHeight()
            ) {
                RotaryKnob("GAIN", (deckB.gainDb + 12f) / 24f, ChronixColors.DeckBOrange,
                    onValueChange = { viewModel.audioEngine.setGainDb(DeckId.DECK_B, it * 24f - 12f) }, size = knobSize)
                RotaryKnob("HIGH", deckB.eqHigh, ChronixColors.DeckBOrange,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_B, high = it) }, size = knobSize)
                RotaryKnob("MID", deckB.eqMid, ChronixColors.DeckBOrange,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_B, mid = it) }, size = knobSize)
                RotaryKnob("LOW", deckB.eqLow, ChronixColors.DeckBOrange,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_B, low = it) }, size = knobSize)
                RotaryKnob("FLTR", deckB.filterValue, ChronixColors.DeckBAmber,
                    onValueChange = { viewModel.audioEngine.setEq(DeckId.DECK_B, filter = it) }, size = knobSize)
            }
        }
    }
}

@Composable
private fun CenterVideoPreviewPanel(
    deckA: DeckState,
    deckB: DeckState,
    crossfader: Float,
    viewModel: ChronixDjViewModel,
    onExpand: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("PROGRAM A/V", color = ChronixColors.ActiveGreen, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(ChronixColors.SurfacePad)
                    .clickable { onExpand() }
                    .padding(horizontal = 6.dp, vertical = 3.dp)
            ) {
                Text("EXPAND", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
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
                Text(
                    text = "Load a video on Deck A or B",
                    color = ChronixColors.TextMuted,
                    fontSize = 10.sp
                )
            }
        }

        val blendedWaves = remember(deckA.audioWaveLevels, deckB.audioWaveLevels, crossfader) {
            List(32) { idx ->
                val srcIdx = (idx * 48) / 32
                val a = deckA.audioWaveLevels.getOrElse(srcIdx) { 0.06f } * (1f - crossfader)
                val b = deckB.audioWaveLevels.getOrElse(srcIdx) { 0.06f } * crossfader
                (a + b).coerceIn(0.06f, 1f)
            }
        }
        AudioFollowingWaveStrip(
            levels = blendedWaves,
            accentColor = ChronixColors.ActiveGreen,
            modifier = Modifier
                .fillMaxWidth()
                .height(26.dp)
        )
    }
}

@Composable
private fun PadModeTab(
    label: String,
    active: Boolean,
    accentColor: Color,
    icon: (@Composable () -> Unit)?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) accentColor else ChronixColors.SurfaceCard)
            .clickable { onClick() }
            .padding(horizontal = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            icon()
            Spacer(modifier = Modifier.width(2.dp))
        }
        Text(text = label, color = Color.White, fontSize = 8.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun CueHoldButton(
    previewing: Boolean,
    onPress: () -> Unit,
    onRelease: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(6.dp))
            .background(if (previewing) Color(0xFFF59E0B) else ChronixColors.SurfacePad)
            .border(1.dp, if (previewing) Color.White else ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        onPress()
                        tryAwaitRelease()
                        onRelease()
                    }
                )
            },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "CUE",
            color = if (previewing) Color.Black else Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun TransportButton(
    label: String,
    bg: Color,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(6.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = if (compact) 9.5.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun CompactStudioChip(
    label: String,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) accent else ChronixColors.SurfacePad)
            .clickable { onClick() }
            .padding(horizontal = 6.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun SamplerPadEditorDialog(
    pad: SamplerPadState,
    onDismiss: () -> Unit,
    onSave: (String, Float, Boolean) -> Unit,
    onPickReplaceAudio: () -> Unit,
    onTest: () -> Unit,
    onDeleteOrReset: () -> Unit
) {
    var label by remember(pad.id) { mutableStateOf(pad.label) }
    var volume by remember(pad.id) { mutableStateOf(pad.volume) }
    var loop by remember(pad.id) { mutableStateOf(pad.loop) }
    val isBuiltinSlot = pad.id.startsWith("builtin-")

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF141821),
        title = {
            Text(
                text = "Edit Sampler Pad",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = label,
                    onValueChange = { if (it.length <= 16) label = it },
                    label = { Text("Pad Name", fontSize = 11.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Volume", color = ChronixColors.TextPrimary, fontSize = 12.sp)
                    Text("${(volume * 100).toInt()}%", color = ChronixColors.DeckABlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = volume,
                    onValueChange = { volume = it },
                    valueRange = 0.1f..1.0f,
                    colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = ChronixColors.DeckABlue)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Button(
                        onClick = { loop = false },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (!loop) ChronixColors.DeckABlue else ChronixColors.SurfacePad
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("One-Shot", fontSize = 11.sp)
                    }
                    Button(
                        onClick = { loop = true },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (loop) ChronixColors.DeckBOrange else ChronixColors.SurfacePad
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Loop", fontSize = 11.sp)
                    }
                }
                Button(
                    onClick = onPickReplaceAudio,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF232B3A)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Choose Custom Audio File", fontSize = 11.sp)
                }
                if (pad.fileName != null) {
                    Text(
                        text = "File: ${pad.fileName}",
                        color = ChronixColors.TextMuted,
                        fontSize = 10.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Button(
                        onClick = onTest,
                        colors = ButtonDefaults.buttonColors(containerColor = ChronixColors.ActiveGreen),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Test Pad", fontSize = 11.sp)
                    }
                    if (pad.sourceType == SamplerSourceType.CUSTOM_FILE || !isBuiltinSlot) {
                        Button(
                            onClick = onDeleteOrReset,
                            colors = ButtonDefaults.buttonColors(containerColor = ChronixColors.RecordRed),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (isBuiltinSlot) "Reset" else "Delete", fontSize = 11.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(label, volume, loop) }) {
                Text("Save", color = ChronixColors.DeckABlue, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = ChronixColors.TextMuted)
            }
        }
    )
}
