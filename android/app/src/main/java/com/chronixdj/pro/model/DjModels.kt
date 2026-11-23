package com.chronixdj.pro.model

import android.net.Uri

enum class AppSection {
    MASTER,
    VIDEO,
    STEMS,
    SETTINGS
}

enum class MasterCenterMode {
    MIXER_EQ,
    WAVEFORM,
    VIDEO_PREVIEW
}

enum class DeckId {
    DECK_A,
    DECK_B
}

enum class PadMode {
    CUE,
    SMP,
    SCRT,
    STEMS
}

enum class VocalMode(val label: String) {
    OFF("NORM"),
    REMOVE_ACAPELLA("NO ACAPELLA"),
    ACAPELLA_ONLY("ACAPELLA")
}

enum class FxType(val label: String) {
    ECHO_OUT("Echo Out"),
    REVERB_OUT("Reverb Out"),
    LOOP_OUT("Loop Out"),
    FLANGER("Flanger"),
    HIGH_PASS("High-Pass"),
    LOW_PASS("Low-Pass")
}

data class FxSlotState(
    val type: FxType,
    val enabled: Boolean = false,
    val intensity: Float = 0.5f
)

data class HotCuePoint(
    val index: Int,
    val positionMs: Long? = null,
    val label: String = "${index + 1}"
)

enum class SamplerSourceType {
    BUILTIN,
    CUSTOM_FILE
}

data class SamplerPadState(
    val id: String,
    val label: String,
    val sourceType: SamplerSourceType = SamplerSourceType.BUILTIN,
    val builtinIndex: Int? = null,
    val filePath: String? = null,
    val fileName: String? = null,
    val volume: Float = 0.9f,
    val loop: Boolean = false,
    val isPlaying: Boolean = false
)

data class WaveformPeak(
    val amplitude: Float,
    val lowEnergy: Float,
    val midEnergy: Float,
    val highEnergy: Float
)

enum class DeckStemKey {
    VOCALS,
    DRUMS,
    BASS,
    MELODY
}

data class DeckStemSelection(
    val vocals: Boolean = true,
    val drums: Boolean = true,
    val bass: Boolean = true,
    val melody: Boolean = true
)

data class DeckState(
    val deckId: DeckId,
    val title: String = if (deckId == DeckId.DECK_A) "DECK A: LOAD A SONG" else "DECK B: LOAD A SONG",
    val artist: String = "",
    val mediaUri: Uri? = null,
    val isVideo: Boolean = false,
    val isLoaded: Boolean = false,
    val isPlaying: Boolean = false,
    val isLoading: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val cuePointMs: Long = 0L,
    val cuePreviewing: Boolean = false,
    val detectedBpm: Float = 0f,
    val beatOffsetMs: Long = 0L,
    val musicalKey: String = "#?",
    val pitchPercent: Float = 0f,
    val pitchRangePercent: Int = 8,
    val keyLockEnabled: Boolean = false,
    val slipEnabled: Boolean = false,
    val beatJumpEnabled: Boolean = false,
    val quantizeEnabled: Boolean = true,
    val syncLocked: Boolean = false,
    val syncMaster: Boolean = deckId == DeckId.DECK_A,
    val syncMultiplier: Float = 1f,
    val quantizePending: Boolean = false,
    val phaseErrorBeats: Float = 0f,
    val vocalMode: VocalMode = VocalMode.OFF,
    val stemBypassed: Boolean = true,
    val activeStems: DeckStemSelection = DeckStemSelection(),
    val volume: Float = 0.85f,
    val gainDb: Float = 0f,       // -12f to +12f
    val eqHigh: Float = 0.5f,     // 0f..1f (0.5f = flat)
    val eqMid: Float = 0.5f,      // 0f..1f
    val eqLow: Float = 0.5f,      // 0f..1f
    val filterValue: Float = 0.5f,// 0f..0.5f LPF, 0.5f..1f HPF
    val loopBeats: Float = 0.5f,  // 1/8 to 16 beats
    val loopActive: Boolean = false,
    val loopStartMs: Long = 0L,
    val loopEndMs: Long = 0L,
    val padMode: PadMode = if (deckId == DeckId.DECK_A) PadMode.STEMS else PadMode.CUE,
    val hotCues: List<HotCuePoint> = List(8) { HotCuePoint(it) },
    val fxSlots: List<FxSlotState> = listOf(
        FxSlotState(FxType.ECHO_OUT),
        FxSlotState(FxType.REVERB_OUT),
        FxSlotState(FxType.LOOP_OUT)
    ),
    val waveform: List<WaveformPeak> = emptyList(),
    val audioWaveLevels: List<Float> = List(48) { 0.08f },
    val vuLevel: Float = 0f,
    val platterDegrees: Float = 0f
)

enum class StemType(val displayName: String) {
    VOCALS("Vocals"),
    DRUMS("Drums"),
    BASS("Bass"),
    INSTRUMENTAL("Instrumental")
}

data class StemChannelState(
    val type: StemType,
    val fileName: String = "No stem file loaded",
    val uri: Uri? = null,
    val isLoaded: Boolean = false,
    val isPlaying: Boolean = false,
    val volume: Float = 0.85f,
    val isMuted: Boolean = false,
    val isSolo: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val levelMeter: Float = 0f
)

/**
 * Clean abstraction for future on-device or cloud AI stem separation (e.g. Demucs / Spleeter TFLite).
 * Loading a standard audio file NEVER simulates AI separation; users load real separated stems,
 * or plug an implementation of StemSeparationEngine into StemsAudioEngine.
 */
interface StemSeparationEngine {
    val isAvailable: Boolean
    val engineName: String
    suspend fun separateAudioFile(sourceUri: Uri): Result<Map<StemType, Uri>>
}

data class VideoDeckState(
    val deckId: DeckId,
    val title: String = if (deckId == DeckId.DECK_A) "VIDEO DECK A" else "VIDEO DECK B",
    val videoUri: Uri? = null,
    val isLoaded: Boolean = false,
    val isPlaying: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val volume: Float = 0.85f,
    val vocalMode: VocalMode = VocalMode.OFF,
    val audioWaveLevels: List<Float> = List(48) { 0.08f },
    val syncToAudioClock: Boolean = true
)

enum class CrossfaderCurve(val label: String) {
    EQUAL_POWER("Equal Power"),
    LINEAR("Linear Blend"),
    FAST_CUT("Fast Scratch Cut")
}

enum class LatencyMode(val label: String, val bufferFrames: Int) {
    LOW_LATENCY("Low Latency (256 frames)", 256),
    BALANCED("Balanced (512 frames)", 512),
    HIGH_STABILITY("High Stability (1024 frames)", 1024)
}

enum class AudioOutputRoute(val label: String) {
    AUTO("Automatic (Speaker / Wired / BT)"),
    SPEAKER("Device Speaker"),
    HEADPHONES("Wired Headphones / USB DAC"),
    BLUETOOTH("Bluetooth A2DP")
}

enum class RecordingMode {
    AUDIO,
    VIDEO
}

enum class RecordingStatus {
    IDLE,
    RECORDING,
    PAUSED
}

data class RecordingState(
    val status: RecordingStatus = RecordingStatus.IDLE,
    val mode: RecordingMode = RecordingMode.AUDIO,
    val elapsedSec: Int = 0,
    val savedFilePath: String? = null,
    val savedFileName: String? = null
)

data class DjSettings(
    val audioOutputRoute: AudioOutputRoute = AudioOutputRoute.AUTO,
    val latencyMode: LatencyMode = LatencyMode.LOW_LATENCY,
    val crossfaderCurve: CrossfaderCurve = CrossfaderCurve.EQUAL_POWER,
    val autoBpmDetection: Boolean = true,
    val autoGainNormalization: Boolean = false,
    val highContrastMode: Boolean = false,
    val liteMode: Boolean = true,
    val showBeatGrid: Boolean = true,
    val waveformZoom: Float = 1.25f,
    val waveformScrollSpeed: Float = 1.0f,
    val defaultMusicFolderUri: String? = null,
    val defaultMusicFolderName: String = "Internal Music / Downloads",
    val videoHardwareAcceleration: Boolean = true,
    val videoCrossfadeBlend: Boolean = true,
    val videoMaintainAspectRatio: Boolean = true
)
