package com.chronixdj.pro.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.chronixdj.pro.model.AudioOutputRoute
import com.chronixdj.pro.model.CrossfaderCurve
import com.chronixdj.pro.model.DjSettings
import com.chronixdj.pro.model.LatencyMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "chronix_dj_settings")

class PreferencesRepository(private val context: Context) {

    private object Keys {
        val AUDIO_OUTPUT = stringPreferencesKey("audio_output_route")
        val LATENCY_MODE = stringPreferencesKey("latency_mode")
        val CROSSFADER_CURVE = stringPreferencesKey("crossfader_curve")
        val AUTO_BPM = booleanPreferencesKey("auto_bpm")
        val AUTO_GAIN = booleanPreferencesKey("auto_gain")
        val HIGH_CONTRAST = booleanPreferencesKey("high_contrast")
        val LITE_MODE = booleanPreferencesKey("lite_mode")
        val SHOW_BEAT_GRID = booleanPreferencesKey("show_beat_grid")
        val WAVEFORM_ZOOM = floatPreferencesKey("waveform_zoom")
        val WAVEFORM_SCROLL_SPEED = floatPreferencesKey("waveform_scroll_speed")
        val DEFAULT_FOLDER_URI = stringPreferencesKey("default_folder_uri")
        val DEFAULT_FOLDER_NAME = stringPreferencesKey("default_folder_name")
        val VIDEO_HW_ACCEL = booleanPreferencesKey("video_hw_accel")
        val VIDEO_XFADE_BLEND = booleanPreferencesKey("video_xfade_blend")
        val VIDEO_ASPECT_RATIO = booleanPreferencesKey("video_aspect_ratio")
    }

    val settingsFlow: Flow<DjSettings> = context.dataStore.data.map { prefs ->
        DjSettings(
            audioOutputRoute = prefs[Keys.AUDIO_OUTPUT]?.let {
                runCatching { AudioOutputRoute.valueOf(it) }.getOrNull()
            } ?: AudioOutputRoute.AUTO,
            latencyMode = prefs[Keys.LATENCY_MODE]?.let {
                runCatching { LatencyMode.valueOf(it) }.getOrNull()
            } ?: LatencyMode.LOW_LATENCY,
            crossfaderCurve = prefs[Keys.CROSSFADER_CURVE]?.let {
                runCatching { CrossfaderCurve.valueOf(it) }.getOrNull()
            } ?: CrossfaderCurve.EQUAL_POWER,
            autoBpmDetection = prefs[Keys.AUTO_BPM] ?: true,
            autoGainNormalization = prefs[Keys.AUTO_GAIN] ?: false,
            highContrastMode = prefs[Keys.HIGH_CONTRAST] ?: false,
            liteMode = prefs[Keys.LITE_MODE] ?: true,
            showBeatGrid = prefs[Keys.SHOW_BEAT_GRID] ?: true,
            waveformZoom = prefs[Keys.WAVEFORM_ZOOM] ?: 1.25f,
            waveformScrollSpeed = prefs[Keys.WAVEFORM_SCROLL_SPEED] ?: 1.0f,
            defaultMusicFolderUri = prefs[Keys.DEFAULT_FOLDER_URI],
            defaultMusicFolderName = prefs[Keys.DEFAULT_FOLDER_NAME] ?: "Internal Music / Downloads",
            videoHardwareAcceleration = prefs[Keys.VIDEO_HW_ACCEL] ?: true,
            videoCrossfadeBlend = prefs[Keys.VIDEO_XFADE_BLEND] ?: true,
            videoMaintainAspectRatio = prefs[Keys.VIDEO_ASPECT_RATIO] ?: true
        )
    }

    suspend fun updateSettings(transform: (DjSettings) -> DjSettings) {
        context.dataStore.edit { prefs ->
            val current = DjSettings(
                audioOutputRoute = prefs[Keys.AUDIO_OUTPUT]?.let {
                    runCatching { AudioOutputRoute.valueOf(it) }.getOrNull()
                } ?: AudioOutputRoute.AUTO,
                latencyMode = prefs[Keys.LATENCY_MODE]?.let {
                    runCatching { LatencyMode.valueOf(it) }.getOrNull()
                } ?: LatencyMode.LOW_LATENCY,
                crossfaderCurve = prefs[Keys.CROSSFADER_CURVE]?.let {
                    runCatching { CrossfaderCurve.valueOf(it) }.getOrNull()
                } ?: CrossfaderCurve.EQUAL_POWER,
                autoBpmDetection = prefs[Keys.AUTO_BPM] ?: true,
                autoGainNormalization = prefs[Keys.AUTO_GAIN] ?: false,
                highContrastMode = prefs[Keys.HIGH_CONTRAST] ?: false,
                liteMode = prefs[Keys.LITE_MODE] ?: true,
                showBeatGrid = prefs[Keys.SHOW_BEAT_GRID] ?: true,
                waveformZoom = prefs[Keys.WAVEFORM_ZOOM] ?: 1.25f,
                waveformScrollSpeed = prefs[Keys.WAVEFORM_SCROLL_SPEED] ?: 1.0f,
                defaultMusicFolderUri = prefs[Keys.DEFAULT_FOLDER_URI],
                defaultMusicFolderName = prefs[Keys.DEFAULT_FOLDER_NAME] ?: "Internal Music / Downloads",
                videoHardwareAcceleration = prefs[Keys.VIDEO_HW_ACCEL] ?: true,
                videoCrossfadeBlend = prefs[Keys.VIDEO_XFADE_BLEND] ?: true,
                videoMaintainAspectRatio = prefs[Keys.VIDEO_ASPECT_RATIO] ?: true
            )
            val next = transform(current)
            prefs[Keys.AUDIO_OUTPUT] = next.audioOutputRoute.name
            prefs[Keys.LATENCY_MODE] = next.latencyMode.name
            prefs[Keys.CROSSFADER_CURVE] = next.crossfaderCurve.name
            prefs[Keys.AUTO_BPM] = next.autoBpmDetection
            prefs[Keys.AUTO_GAIN] = next.autoGainNormalization
            prefs[Keys.HIGH_CONTRAST] = next.highContrastMode
            prefs[Keys.LITE_MODE] = next.liteMode
            prefs[Keys.SHOW_BEAT_GRID] = next.showBeatGrid
            prefs[Keys.WAVEFORM_ZOOM] = next.waveformZoom
            prefs[Keys.WAVEFORM_SCROLL_SPEED] = next.waveformScrollSpeed
            if (next.defaultMusicFolderUri != null) {
                prefs[Keys.DEFAULT_FOLDER_URI] = next.defaultMusicFolderUri
            } else {
                prefs.remove(Keys.DEFAULT_FOLDER_URI)
            }
            prefs[Keys.DEFAULT_FOLDER_NAME] = next.defaultMusicFolderName
            prefs[Keys.VIDEO_HW_ACCEL] = next.videoHardwareAcceleration
            prefs[Keys.VIDEO_XFADE_BLEND] = next.videoCrossfadeBlend
            prefs[Keys.VIDEO_ASPECT_RATIO] = next.videoMaintainAspectRatio
        }
    }

    suspend fun resetAll() {
        context.dataStore.edit { it.clear() }
    }
}
