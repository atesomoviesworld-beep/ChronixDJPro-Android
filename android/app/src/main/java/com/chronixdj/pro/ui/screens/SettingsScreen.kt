package com.chronixdj.pro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chronixdj.pro.BuildConfig
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.AudioOutputRoute
import com.chronixdj.pro.model.CrossfaderCurve
import com.chronixdj.pro.model.DjSettings
import com.chronixdj.pro.model.LatencyMode
import com.chronixdj.pro.permissions.StoragePermissionStatus
import com.chronixdj.pro.ui.theme.ChronixColors
import com.chronixdj.pro.viewmodel.ChronixDjViewModel

@Composable
fun SettingsScreen(
    settings: DjSettings,
    permissions: StoragePermissionStatus,
    viewModel: ChronixDjViewModel,
    onRequestPermissions: () -> Unit,
    onPickDefaultFolder: () -> Unit,
    onNavigateSection: (AppSection) -> Unit
) {
    var confirmReset by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ChronixColors.Background)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        SectionHeaderBar(
            title = "CHRONIXDJ PRO SETTINGS",
            activeSection = AppSection.SETTINGS,
            onNavigateSection = onNavigateSection
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            SettingsCard("Audio Output & Buffer Latency") {
                Text("Audio Output Route", color = ChronixColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                val routeRows = AudioOutputRoute.entries.chunked(2)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    routeRows.forEach { rowItems ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            rowItems.forEach { route ->
                                OptionChip(
                                    label = route.name,
                                    selected = settings.audioOutputRoute == route,
                                    onClick = { viewModel.updateSettings { it.copy(audioOutputRoute = route) } },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text("Buffer & Latency Profile", color = ChronixColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    LatencyMode.entries.forEach { mode ->
                        OptionChip(
                            label = mode.label,
                            selected = settings.latencyMode == mode,
                            onClick = { viewModel.updateSettings { it.copy(latencyMode = mode) } },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text("Crossfader Curve", color = ChronixColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CrossfaderCurve.entries.forEach { curve ->
                        OptionChip(
                            label = curve.label,
                            selected = settings.crossfaderCurve == curve,
                            onClick = { viewModel.updateSettings { it.copy(crossfaderCurve = curve) } },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            SettingsCard("Theme & Interface") {
                ToggleRow("Lite Performance Mode (Low CPU & Memory)", settings.liteMode) { v ->
                    viewModel.updateSettings { it.copy(liteMode = v) }
                }
                ToggleRow("Auto BPM & Key Analysis", settings.autoBpmDetection) { v ->
                    viewModel.updateSettings { it.copy(autoBpmDetection = v) }
                }
                ToggleRow("Show Waveform Beatgrid", settings.showBeatGrid) { v ->
                    viewModel.updateSettings { it.copy(showBeatGrid = v) }
                }
                ToggleRow("High-Contrast Club Mode", settings.highContrastMode) { v ->
                    viewModel.updateSettings { it.copy(highContrastMode = v) }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Waveform Zoom", color = ChronixColors.TextPrimary, fontSize = 12.sp)
                    Text(String.format("%.2fx", settings.waveformZoom), color = ChronixColors.DeckABlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = settings.waveformZoom,
                    onValueChange = { z -> viewModel.updateSettings { it.copy(waveformZoom = z) } },
                    valueRange = 0.5f..4.0f,
                    colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = ChronixColors.DeckABlue)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Waveform Scroll Speed", color = ChronixColors.TextPrimary, fontSize = 12.sp)
                    Text(String.format("%.2fx", settings.waveformScrollSpeed), color = ChronixColors.DeckBOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = settings.waveformScrollSpeed,
                    onValueChange = { s -> viewModel.updateSettings { it.copy(waveformScrollSpeed = s) } },
                    valueRange = 0.5f..3.0f,
                    colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = ChronixColors.DeckBOrange)
                )
            }

            SettingsCard("Storage Permissions & Music Library") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Audio Permission: ${if (permissions.audioGranted) "GRANTED" else "MISSING"}",
                            color = if (permissions.audioGranted) ChronixColors.ActiveGreen else ChronixColors.RecordRed,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Video Permission: ${if (permissions.videoGranted) "GRANTED" else "MISSING"}",
                            color = if (permissions.videoGranted) ChronixColors.ActiveGreen else ChronixColors.RecordRed,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Button(onClick = onRequestPermissions) {
                        Text("Grant Permissions", fontSize = 11.sp)
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Default Music Folder", color = ChronixColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(settings.defaultMusicFolderName, color = ChronixColors.TextMuted, fontSize = 11.sp)
                    }
                    Button(onClick = onPickDefaultFolder) {
                        Text("Choose Folder", fontSize = 11.sp)
                    }
                }
            }

            SettingsCard("Video Settings") {
                ToggleRow("Hardware Video Acceleration", settings.videoHardwareAcceleration) { v ->
                    viewModel.updateSettings { it.copy(videoHardwareAcceleration = v) }
                }
                ToggleRow("Crossfader Alpha Video Blend", settings.videoCrossfadeBlend) { v ->
                    viewModel.updateSettings { it.copy(videoCrossfadeBlend = v) }
                }
                ToggleRow("Maintain Video Aspect Ratio", settings.videoMaintainAspectRatio) { v ->
                    viewModel.updateSettings { it.copy(videoMaintainAspectRatio = v) }
                }
            }

            SettingsCard("Reset & App Information") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("ChronixDJ Pro", color = ChronixColors.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Version ${BuildConfig.VERSION_NAME} • Media3 + AudioEffect DSP", color = ChronixColors.TextMuted, fontSize = 11.sp)
                    }
                    Button(
                        onClick = { confirmReset = true },
                        colors = ButtonDefaults.buttonColors(containerColor = ChronixColors.RecordRed)
                    ) {
                        Text("Reset Preferences", fontSize = 11.sp)
                    }
                }
            }
        }
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset All Preferences?") },
            text = { Text("This restores audio routing, latency buffer, crossfader curve, and video settings to factory defaults.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.resetPreferences()
                    confirmReset = false
                }) { Text("Reset") }
            },
            dismissButton = {
                TextButton(onClick = { confirmReset = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(ChronixColors.SurfaceDark)
            .border(1.dp, ChronixColors.BorderSubtle, RoundedCornerShape(8.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(title, color = ChronixColors.DeckABlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        content()
    }
}

@Composable
private fun OptionChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(5.dp))
            .background(if (selected) ChronixColors.ActiveGreen else ChronixColors.SurfacePad)
            .clickable { onClick() }
            .padding(vertical = 8.dp, horizontal = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = ChronixColors.TextPrimary,
            fontSize = 12.sp,
            modifier = Modifier.weight(1f).padding(end = 8.dp)
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
