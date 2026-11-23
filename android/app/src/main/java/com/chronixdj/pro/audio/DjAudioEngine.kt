package com.chronixdj.pro.audio

import android.content.ContentValues
import android.content.Context
import android.media.AudioAttributes as AndroidAudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.audiofx.Visualizer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import com.chronixdj.pro.model.AudioOutputRoute
import com.chronixdj.pro.model.CrossfaderCurve
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.DeckState
import com.chronixdj.pro.model.DeckStemKey
import com.chronixdj.pro.model.DeckStemSelection
import com.chronixdj.pro.model.DjSettings
import com.chronixdj.pro.model.FxType
import com.chronixdj.pro.model.LatencyMode
import com.chronixdj.pro.model.RecordingMode
import com.chronixdj.pro.model.RecordingState
import com.chronixdj.pro.model.RecordingStatus
import com.chronixdj.pro.model.VocalMode
import com.chronixdj.pro.permissions.StoragePermissionHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.roundToLong
import kotlin.math.sin

class DjAudioEngine(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onError: (String) -> Unit
) {
    private val _deckA = MutableStateFlow(DeckState(DeckId.DECK_A))
    val deckA: StateFlow<DeckState> = _deckA.asStateFlow()

    private val _deckB = MutableStateFlow(DeckState(DeckId.DECK_B))
    val deckB: StateFlow<DeckState> = _deckB.asStateFlow()

    private val _crossfader = MutableStateFlow(0.5f) // 0f = Deck A, 1f = Deck B
    val crossfader: StateFlow<Float> = _crossfader.asStateFlow()

    private val _masterVolume = MutableStateFlow(0.9f)
    val masterVolume: StateFlow<Float> = _masterVolume.asStateFlow()

    private val _recordingState = MutableStateFlow(RecordingState())
    val recordingState: StateFlow<RecordingState> = _recordingState.asStateFlow()

    private var currentSettings = DjSettings()

    private val fxA = DeckAudioEffectsProcessor()
    private val fxB = DeckAudioEffectsProcessor()
    private val vocalProcA = VocalRemoverAudioProcessor()
    private val vocalProcB = VocalRemoverAudioProcessor()

    private var visualizerA: Visualizer? = null
    private var visualizerB: Visualizer? = null
    private val liveLevelsA = FloatArray(48) { 0.08f }
    private val liveLevelsB = FloatArray(48) { 0.08f }

    private var playerA: ExoPlayer = createPlayer(DeckId.DECK_A)
    private var playerB: ExoPlayer = createPlayer(DeckId.DECK_B)
    private var tickerJob: Job? = null
    private var crossfadeAnimJob: Job? = null

    private val slipShadowPosMs = mutableMapOf(DeckId.DECK_A to 0L, DeckId.DECK_B to 0L)
    private val slipScratchActive = mutableMapOf(DeckId.DECK_A to false, DeckId.DECK_B to false)
    private val slipWasPlaying = mutableMapOf(DeckId.DECK_A to false, DeckId.DECK_B to false)
    private val cueHoldActive = mutableMapOf(DeckId.DECK_A to false, DeckId.DECK_B to false)
    private val syncTrimRatio = mutableMapOf(DeckId.DECK_A to 1f, DeckId.DECK_B to 1f)
    private val quantizeJobs = mutableMapOf<DeckId, Job?>()

    private val recQueueA = ConcurrentLinkedQueue<ShortArray>()
    private val recQueueB = ConcurrentLinkedQueue<ShortArray>()
    private var recordingFile: File? = null
    private var recordingJob: Job? = null
    private var recordingTimerJob: Job? = null
    private var recordingDataBytes = 0L

    companion object {
        private const val MAX_SYNC_PITCH_PERCENT = 50f
        private val IDLE_WAVE_LEVELS = List(48) { 0.06f }
    }

    init {
        startPositionTicker()
    }

    @OptIn(UnstableApi::class)
    private fun createPlayer(deckId: DeckId): ExoPlayer {
        val minBuffer = when (currentSettings.latencyMode) {
            LatencyMode.LOW_LATENCY -> 400
            LatencyMode.BALANCED -> 900
            LatencyMode.HIGH_STABILITY -> 2200
        }
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(minBuffer, 12000, 120, 250)
            .build()

        val audioAttrs = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()

        val vocalProcessor = if (deckId == DeckId.DECK_A) vocalProcA else vocalProcB
        val renderersFactory = object : DefaultRenderersFactory(context) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean
            ): AudioSink {
                return DefaultAudioSink.Builder(context)
                    .setAudioProcessors(arrayOf(vocalProcessor))
                    .build()
            }
        }

        return ExoPlayer.Builder(context, renderersFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(audioAttrs, false)
            .build().apply {
                addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        stateFlowFor(deckId).update { it.copy(isPlaying = isPlaying) }
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY) {
                            val dur = duration.coerceAtLeast(0L)
                            stateFlowFor(deckId).update {
                                it.copy(durationMs = dur, isLoading = false)
                            }
                            attachEffects(deckId, audioSessionId)
                        } else if (playbackState == Player.STATE_ENDED) {
                            stateFlowFor(deckId).update { it.copy(isPlaying = false, quantizePending = false) }
                            handleMasterPlaybackStopped(deckId)
                        }
                    }

                    override fun onTracksChanged(tracks: Tracks) {
                        val hasVideo = tracks.groups.any { group ->
                            group.type == C.TRACK_TYPE_VIDEO && group.length > 0
                        }
                        if (hasVideo) {
                            stateFlowFor(deckId).update { it.copy(isVideo = true) }
                        }
                    }

                    override fun onAudioSessionIdChanged(audioSessionId: Int) {
                        attachEffects(deckId, audioSessionId)
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        stateFlowFor(deckId).update { it.copy(isPlaying = false, isLoading = false) }
                        onError("Playback error on ${deckId.name}: ${error.localizedMessage ?: "Unsupported or missing file"}")
                    }
                })
            }
    }

    private fun attachEffects(deckId: DeckId, sessionId: Int) {
        if (sessionId <= 0) return
        val fx = if (deckId == DeckId.DECK_A) fxA else fxB
        fx.attachToSession(sessionId)
        val st = stateFlowFor(deckId).value
        fx.applyEqAndFilter(st.eqLow, st.eqMid, st.eqHigh, st.filterValue, st.fxSlots)
        attachVisualizer(deckId, sessionId)
    }

    private fun attachVisualizer(deckId: DeckId, sessionId: Int) {
        if (sessionId <= 0) return
        runCatching {
            val targetArray = if (deckId == DeckId.DECK_A) liveLevelsA else liveLevelsB
            val vis = Visualizer(sessionId).apply {
                captureSize = Visualizer.getCaptureSizeRange()[0]
                setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                    override fun onWaveFormDataCapture(v: Visualizer?, waveform: ByteArray?, samplingRate: Int) {
                        if (waveform == null || waveform.isEmpty()) return
                        val step = (waveform.size / targetArray.size).coerceAtLeast(1)
                        for (i in targetArray.indices) {
                            val idx = (i * step).coerceIn(0, waveform.lastIndex)
                            val amp = abs((waveform[idx].toInt() and 0xFF) - 128) / 128f
                            targetArray[i] = amp.coerceIn(0.06f, 1f)
                        }
                    }

                    override fun onFftDataCapture(v: Visualizer?, fft: ByteArray?, samplingRate: Int) = Unit
                }, Visualizer.getMaxCaptureRate() / 2, true, false)
                enabled = true
            }
            if (deckId == DeckId.DECK_A) {
                visualizerA?.release()
                visualizerA = vis
            } else {
                visualizerB?.release()
                visualizerB = vis
            }
        }
    }

    private fun stateFlowFor(deckId: DeckId): MutableStateFlow<DeckState> =
        if (deckId == DeckId.DECK_A) _deckA else _deckB

    fun getPlayer(deckId: DeckId): ExoPlayer = playerFor(deckId)

    private fun playerFor(deckId: DeckId): ExoPlayer =
        if (deckId == DeckId.DECK_A) playerA else playerB

    private fun fxFor(deckId: DeckId): DeckAudioEffectsProcessor =
        if (deckId == DeckId.DECK_A) fxA else fxB

    fun loadTrack(deckId: DeckId, uri: Uri) {
        StoragePermissionHelper.takePersistableReadPermission(context, uri)
        val displayName = StoragePermissionHelper.resolveDisplayName(context, uri)
        val mime = runCatching { context.contentResolver.getType(uri) }.getOrNull()
        val ext = displayName.substringAfterLast('.', "").lowercase()
        val looksLikeVideo = mime?.startsWith("video/") == true ||
            ext in setOf("mp4", "mkv", "webm", "mov", "3gp", "m4v", "avi")
        val flow = stateFlowFor(deckId)
        val player = playerFor(deckId)

        flow.update {
            it.copy(
                title = displayName.substringBeforeLast('.'),
                mediaUri = uri,
                isVideo = looksLikeVideo,
                isLoaded = true,
                isLoading = true,
                isPlaying = false,
                positionMs = 0L,
                cuePointMs = 0L,
                cuePreviewing = false,
                beatOffsetMs = 0L,
                pitchPercent = 0f,
                syncLocked = false,
                syncMultiplier = 1f,
                quantizePending = false,
                phaseErrorBeats = 0f,
                loopActive = false,
                vocalMode = VocalMode.OFF,
                stemBypassed = true,
                activeStems = DeckStemSelection()
            )
        }
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        syncTrimRatio[deckId] = 1f
        val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        val otherState = stateFlowFor(otherId).value
        if (flow.value.syncMaster && otherState.isLoaded && otherState.syncLocked) {
            flow.update { it.copy(syncMaster = false) }
            stateFlowFor(otherId).update { it.copy(syncMaster = true, syncLocked = false, phaseErrorBeats = 0f) }
        } else if (!otherState.isLoaded) {
            flow.update { it.copy(syncMaster = true) }
            stateFlowFor(otherId).update { it.copy(syncMaster = false) }
        }
        cueHoldActive[deckId] = false
        vocalProcFor(deckId).apply {
            stemBypassed = true
            vocalMode = VocalMode.OFF
            activeStems = DeckStemSelection()
        }

        runCatching {
            player.stop()
            player.playWhenReady = false
            player.setMediaItem(MediaItem.fromUri(uri))
            player.prepare()
            applyPlaybackSpeed(deckId)
            applyMixVolumes()
        }.onFailure { err ->
            flow.update { it.copy(isLoading = false, isLoaded = false) }
            onError("Could not load media file: ${err.localizedMessage ?: "Invalid URI"}")
        }

        if (currentSettings.autoBpmDetection) {
            scope.launch {
                val buckets = if (currentSettings.liteMode) 220 else 320
                val analysis = BpmAndWaveformAnalyzer.analyze(context, uri, targetBuckets = buckets)
                flow.update {
                    it.copy(
                        detectedBpm = analysis.bpm,
                        beatOffsetMs = analysis.beatOffsetMs,
                        musicalKey = analysis.musicalKey,
                        waveform = analysis.waveform,
                        durationMs = if (it.durationMs > 0L) it.durationMs else analysis.durationMs
                    )
                }
            }
        }
    }

    private fun vocalProcFor(deckId: DeckId): VocalRemoverAudioProcessor =
        if (deckId == DeckId.DECK_A) vocalProcA else vocalProcB

    private fun wrap01(x: Float): Float = ((x % 1f) + 1f) % 1f

    private fun wrapSignedHalf(x: Float): Float {
        var r = wrap01(x)
        if (r > 0.5f) r -= 1f
        return r
    }

    private fun pitchPercentToRate(pitchPercent: Float): Float =
        (1f + pitchPercent / 100f).coerceIn(0.5f, 1.5f)

    private fun handleMasterPlaybackStopped(stoppedDeckId: DeckId) {
        val stopped = stateFlowFor(stoppedDeckId).value
        val otherId = if (stoppedDeckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        val other = stateFlowFor(otherId).value
        if (stopped.syncMaster && other.isLoaded && other.isPlaying && other.syncLocked) {
            stateFlowFor(stoppedDeckId).update { it.copy(syncMaster = false) }
            stateFlowFor(otherId).update { it.copy(syncMaster = true, syncLocked = false, phaseErrorBeats = 0f) }
            syncTrimRatio[otherId] = 1f
            applyPlaybackSpeed(otherId)
        }
    }

    fun toggleQuantize(deckId: DeckId) {
        stateFlowFor(deckId).update { it.copy(quantizeEnabled = !it.quantizeEnabled) }
    }

    fun togglePlayPause(deckId: DeckId) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) {
            onError("Load an audio file into ${if (deckId == DeckId.DECK_A) "Deck A" else "Deck B"} first.")
            return
        }
        cueHoldActive[deckId] = false
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        stateFlowFor(deckId).update { it.copy(cuePreviewing = false, quantizePending = false) }
        val player = playerFor(deckId)
        if (player.isPlaying) {
            player.pause()
            handleMasterPlaybackStopped(deckId)
        } else {
            if (player.playbackState == Player.STATE_ENDED) {
                player.seekTo(st.beatOffsetMs)
            }
            val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
            val other = stateFlowFor(otherId).value
            if (st.syncLocked && other.isLoaded && other.isPlaying && other.detectedBpm > 0f && st.detectedBpm > 0f) {
                syncTempoToMaster(deckId, otherId)
                val updatedSt = stateFlowFor(deckId).value
                val masterBeatMs = 60_000f / other.detectedBpm
                val masterRate = pitchPercentToRate(other.pitchPercent)
                val masterWallBeatMs = masterBeatMs / masterRate
                val mult = updatedSt.syncMultiplier.takeIf { it > 0f } ?: 1f
                val targetWallBeatMs = masterWallBeatMs / mult
                val masterPos = playerFor(otherId).currentPosition.coerceAtLeast(0L)
                val masterPhase = wrap01(((masterPos - other.beatOffsetMs).toFloat() / masterBeatMs) * mult)
                val slaveBeatMs = 60_000f / updatedSt.detectedBpm
                val curPos = player.currentPosition.coerceAtLeast(0L)

                if (updatedSt.quantizeEnabled) {
                    val beatIdx = kotlin.math.round((curPos - updatedSt.beatOffsetMs).toFloat() / slaveBeatMs)
                    val qPos = (updatedSt.beatOffsetMs + (beatIdx * slaveBeatMs).roundToLong())
                        .coerceIn(0L, updatedSt.durationMs.coerceAtLeast(1L))
                    player.seekTo(qPos)
                    val beatsUntilNext = if (masterPhase < 0.03f) 0f else 1f - masterPhase
                    val waitMs = (beatsUntilNext * targetWallBeatMs).roundToLong()
                    if (waitMs <= 14L) {
                        player.play()
                    } else {
                        stateFlowFor(deckId).update { it.copy(quantizePending = true, positionMs = qPos) }
                        quantizeJobs[deckId] = scope.launch(Dispatchers.Main) {
                            delay(waitMs)
                            stateFlowFor(deckId).update { it.copy(quantizePending = false) }
                            player.play()
                        }
                    }
                    return
                } else {
                    val baseBeatIdx = floor((curPos - updatedSt.beatOffsetMs).toFloat() / slaveBeatMs)
                    val matchedPos = (updatedSt.beatOffsetMs + ((baseBeatIdx + masterPhase) * slaveBeatMs).roundToLong())
                        .coerceIn(0L, updatedSt.durationMs.coerceAtLeast(1L))
                    player.seekTo(matchedPos)
                    player.play()
                    return
                }
            }
            if (!other.isPlaying && st.syncLocked) {
                syncTempoToMaster(deckId, otherId)
            }
            player.play()
        }
    }

    fun stop(deckId: DeckId) {
        cueHoldActive[deckId] = false
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        val player = playerFor(deckId)
        player.pause()
        player.seekTo(0L)
        stateFlowFor(deckId).update {
            it.copy(isPlaying = false, cuePreviewing = false, quantizePending = false, positionMs = 0L)
        }
        handleMasterPlaybackStopped(deckId)
    }

    fun seekTo(deckId: DeckId, positionMs: Long) {
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        val player = playerFor(deckId)
        val clamped = positionMs.coerceIn(0L, stateFlowFor(deckId).value.durationMs.coerceAtLeast(1L))
        player.seekTo(clamped)
        stateFlowFor(deckId).update { it.copy(positionMs = clamped, quantizePending = false) }
    }

    fun setMainCue(deckId: DeckId) {
        val flow = stateFlowFor(deckId)
        if (!flow.value.isLoaded) return
        val pos = playerFor(deckId).currentPosition.coerceAtLeast(0L)
        flow.update { it.copy(cuePointMs = pos) }
    }

    fun cuePress(deckId: DeckId) {
        val flow = stateFlowFor(deckId)
        val st = flow.value
        if (!st.isLoaded) return
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        val player = playerFor(deckId)
        if (player.isPlaying && cueHoldActive[deckId] != true) {
            player.pause()
            player.seekTo(st.cuePointMs)
            flow.update { it.copy(isPlaying = false, cuePreviewing = false, quantizePending = false, positionMs = st.cuePointMs) }
            handleMasterPlaybackStopped(deckId)
            return
        }
        cueHoldActive[deckId] = true
        player.seekTo(st.cuePointMs)
        flow.update { it.copy(cuePreviewing = true, quantizePending = false, positionMs = st.cuePointMs) }
        player.play()
    }

    fun cueRelease(deckId: DeckId) {
        if (cueHoldActive[deckId] != true) return
        cueHoldActive[deckId] = false
        val flow = stateFlowFor(deckId)
        val cuePos = flow.value.cuePointMs
        val player = playerFor(deckId)
        player.pause()
        player.seekTo(cuePos)
        flow.update { it.copy(isPlaying = false, cuePreviewing = false, quantizePending = false, positionMs = cuePos) }
        handleMasterPlaybackStopped(deckId)
    }

    fun triggerCue(deckId: DeckId) {
        val flow = stateFlowFor(deckId)
        val st = flow.value
        if (!st.isLoaded) return
        cueHoldActive[deckId] = false
        quantizeJobs[deckId]?.cancel()
        quantizeJobs[deckId] = null
        val player = playerFor(deckId)
        player.pause()
        player.seekTo(st.cuePointMs)
        flow.update { it.copy(isPlaying = false, cuePreviewing = false, quantizePending = false, positionMs = st.cuePointMs) }
        handleMasterPlaybackStopped(deckId)
    }

    fun triggerHotCue(deckId: DeckId, padIndex: Int, deleteMode: Boolean = false) {
        val flow = stateFlowFor(deckId)
        val st = flow.value
        if (!st.isLoaded) return
        val cue = st.hotCues.getOrNull(padIndex) ?: return

        if (deleteMode) {
            val updated = st.hotCues.mapIndexed { i, c -> if (i == padIndex) c.copy(positionMs = null) else c }
            flow.update { it.copy(hotCues = updated) }
            return
        }

        if (cue.positionMs == null) {
            val pos = playerFor(deckId).currentPosition
            val updated = st.hotCues.mapIndexed { i, c -> if (i == padIndex) c.copy(positionMs = pos) else c }
            flow.update { it.copy(hotCues = updated) }
        } else {
            cueHoldActive[deckId] = false
            quantizeJobs[deckId]?.cancel()
            quantizeJobs[deckId] = null
            val player = playerFor(deckId)
            val targetPos = cue.positionMs.coerceIn(0L, st.durationMs.coerceAtLeast(1L))
            val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
            val other = stateFlowFor(otherId).value
            if (st.syncLocked && st.quantizeEnabled && other.isPlaying && other.detectedBpm > 0f && st.detectedBpm > 0f) {
                val masterBeatMs = 60_000f / other.detectedBpm
                val masterWallBeatMs = masterBeatMs / pitchPercentToRate(other.pitchPercent)
                val mult = st.syncMultiplier.takeIf { it > 0f } ?: 1f
                val masterPos = playerFor(otherId).currentPosition.coerceAtLeast(0L)
                val masterPhase = wrap01(((masterPos - other.beatOffsetMs).toFloat() / masterBeatMs) * mult)
                val beatsUntilNext = if (masterPhase < 0.03f) 0f else 1f - masterPhase
                val waitMs = (beatsUntilNext * (masterWallBeatMs / mult)).roundToLong()
                player.seekTo(targetPos)
                if (waitMs <= 14L) {
                    flow.update { it.copy(cuePreviewing = false, quantizePending = false, positionMs = targetPos) }
                    if (!player.isPlaying) player.play()
                } else {
                    flow.update { it.copy(cuePreviewing = false, quantizePending = true, positionMs = targetPos) }
                    quantizeJobs[deckId] = scope.launch(Dispatchers.Main) {
                        delay(waitMs)
                        flow.update { it.copy(quantizePending = false) }
                        if (!player.isPlaying) player.play()
                    }
                }
                return
            }
            player.seekTo(targetPos)
            flow.update { it.copy(cuePreviewing = false, quantizePending = false, positionMs = targetPos) }
            if (!player.isPlaying) {
                player.play()
            }
        }
    }

    fun setPitchPercent(deckId: DeckId, percent: Float, manualUserChange: Boolean = true) {
        val flow = stateFlowFor(deckId)
        val maxRange = minOf(MAX_SYNC_PITCH_PERCENT, flow.value.pitchRangePercent.toFloat())
        val clamped = percent.coerceIn(-maxRange, maxRange)
        if (manualUserChange && flow.value.syncLocked) {
            syncTrimRatio[deckId] = 1f
            flow.update { it.copy(pitchPercent = clamped, syncLocked = false, phaseErrorBeats = 0f) }
        } else {
            flow.update { it.copy(pitchPercent = clamped) }
        }
        applyPlaybackSpeed(deckId)
        val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        if (stateFlowFor(otherId).value.syncLocked) {
            syncTempoToMaster(otherId, deckId)
        }
    }

    fun cyclePitchRange(deckId: DeckId) {
        stateFlowFor(deckId).update { st ->
            val nextRange = when (st.pitchRangePercent) {
                8 -> 16
                16 -> 50
                else -> 8
            }
            st.copy(
                pitchRangePercent = nextRange,
                pitchPercent = st.pitchPercent.coerceIn(-nextRange.toFloat(), nextRange.toFloat())
            )
        }
        applyPlaybackSpeed(deckId)
        val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        if (stateFlowFor(otherId).value.syncLocked) {
            syncTempoToMaster(otherId, deckId)
        }
    }

    fun toggleKeyLock(deckId: DeckId) {
        stateFlowFor(deckId).update { it.copy(keyLockEnabled = !it.keyLockEnabled) }
        applyPlaybackSpeed(deckId)
    }

    private fun applyDeckStemsState(deckId: DeckId, selection: DeckStemSelection, bypassed: Boolean) {
        val nextVocal = when {
            bypassed -> VocalMode.OFF
            selection.vocals && !selection.drums && !selection.bass && !selection.melody -> VocalMode.ACAPELLA_ONLY
            !selection.vocals && (selection.drums || selection.bass || selection.melody) -> VocalMode.REMOVE_ACAPELLA
            else -> VocalMode.OFF
        }
        stateFlowFor(deckId).update {
            it.copy(stemBypassed = bypassed, activeStems = selection, vocalMode = nextVocal)
        }
        vocalProcFor(deckId).apply {
            stemBypassed = bypassed
            activeStems = selection
            vocalMode = nextVocal
        }
    }

    fun isolateDeckStem(deckId: DeckId, stemKey: DeckStemKey) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        val cur = st.activeStems
        val alreadySolo = !st.stemBypassed && when (stemKey) {
            DeckStemKey.VOCALS -> cur.vocals && !cur.drums && !cur.bass && !cur.melody
            DeckStemKey.DRUMS -> cur.drums && !cur.vocals && !cur.bass && !cur.melody
            DeckStemKey.BASS -> cur.bass && !cur.vocals && !cur.drums && !cur.melody
            DeckStemKey.MELODY -> cur.melody && !cur.vocals && !cur.drums && !cur.bass
        }
        if (alreadySolo) {
            restoreFullMix(deckId)
            return
        }
        val mask = DeckStemSelection(
            vocals = stemKey == DeckStemKey.VOCALS,
            drums = stemKey == DeckStemKey.DRUMS,
            bass = stemKey == DeckStemKey.BASS,
            melody = stemKey == DeckStemKey.MELODY
        )
        applyDeckStemsState(deckId, mask, false)
    }

    fun toggleSingleStem(deckId: DeckId, stemKey: DeckStemKey) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        val base = if (st.stemBypassed) DeckStemSelection() else st.activeStems
        val next = when (stemKey) {
            DeckStemKey.VOCALS -> base.copy(vocals = !base.vocals)
            DeckStemKey.DRUMS -> base.copy(drums = !base.drums)
            DeckStemKey.BASS -> base.copy(bass = !base.bass)
            DeckStemKey.MELODY -> base.copy(melody = !base.melody)
        }
        val allOn = next.vocals && next.drums && next.bass && next.melody
        applyDeckStemsState(deckId, next, allOn)
    }

    fun toggleInstrumentalMode(deckId: DeckId) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        val cur = st.activeStems
        if (!st.stemBypassed && !cur.vocals && cur.drums && cur.bass && cur.melody) {
            restoreFullMix(deckId)
        } else {
            applyDeckStemsState(deckId, DeckStemSelection(vocals = false, drums = true, bass = true, melody = true), false)
        }
    }

    fun toggleStemsBypass(deckId: DeckId) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        if (st.stemBypassed) {
            val cur = st.activeStems
            val anyOff = !cur.vocals || !cur.drums || !cur.bass || !cur.melody
            val next = if (anyOff) cur else DeckStemSelection(vocals = false, drums = true, bass = true, melody = true)
            applyDeckStemsState(deckId, next, false)
        } else {
            restoreFullMix(deckId)
        }
    }

    fun restoreFullMix(deckId: DeckId) {
        applyDeckStemsState(deckId, DeckStemSelection(), true)
    }

    fun setVocalMode(deckId: DeckId, mode: VocalMode) {
        when (mode) {
            VocalMode.OFF -> restoreFullMix(deckId)
            VocalMode.ACAPELLA_ONLY -> applyDeckStemsState(deckId, DeckStemSelection(vocals = true, drums = false, bass = false, melody = false), false)
            VocalMode.REMOVE_ACAPELLA -> applyDeckStemsState(deckId, DeckStemSelection(vocals = false, drums = true, bass = true, melody = true), false)
        }
    }

    fun cycleVocalMode(deckId: DeckId) {
        val curr = stateFlowFor(deckId).value.vocalMode
        val next = when (curr) {
            VocalMode.OFF -> VocalMode.ACAPELLA_ONLY
            VocalMode.ACAPELLA_ONLY -> VocalMode.REMOVE_ACAPELLA
            VocalMode.REMOVE_ACAPELLA -> VocalMode.OFF
        }
        setVocalMode(deckId, next)
    }

    private fun applyPlaybackSpeed(deckId: DeckId) {
        val st = stateFlowFor(deckId).value
        val baseRate = pitchPercentToRate(st.pitchPercent)
        val trim = (syncTrimRatio[deckId] ?: 1f).coerceIn(0.95f, 1.05f)
        val speed = (baseRate * trim).coerceIn(0.45f, 1.58f)
        val pitch = if (st.keyLockEnabled) 1.0f else baseRate
        playerFor(deckId).playbackParameters = PlaybackParameters(speed, pitch)
    }

    fun setMasterDeck(deckId: DeckId) {
        val target = stateFlowFor(deckId).value
        if (!target.isLoaded) return
        val otherId = if (deckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        syncTrimRatio[deckId] = 1f
        stateFlowFor(deckId).update { it.copy(syncMaster = true, syncLocked = false, phaseErrorBeats = 0f) }
        applyPlaybackSpeed(deckId)
        stateFlowFor(otherId).update { it.copy(syncMaster = false) }
        if (stateFlowFor(otherId).value.syncLocked) {
            syncTempoToMaster(otherId, deckId)
            maintainSyncLock()
        }
    }

    private fun computeBestSyncTarget(
        slaveOriginalBpm: Float,
        masterEffectiveBpm: Float
    ): Pair<Float, Float> {
        val directPitch = ((masterEffectiveBpm / slaveOriginalBpm) - 1f) * 100f
        if (abs(directPitch) <= MAX_SYNC_PITCH_PERCENT) {
            return directPitch to 1f
        }
        val halfPitch = (((masterEffectiveBpm * 0.5f) / slaveOriginalBpm) - 1f) * 100f
        val doublePitch = (((masterEffectiveBpm * 2f) / slaveOriginalBpm) - 1f) * 100f
        if (abs(halfPitch) <= MAX_SYNC_PITCH_PERCENT && abs(halfPitch) <= abs(doublePitch)) {
            return halfPitch to 0.5f
        }
        if (abs(doublePitch) <= MAX_SYNC_PITCH_PERCENT) {
            return doublePitch to 2f
        }
        return directPitch.coerceIn(-MAX_SYNC_PITCH_PERCENT, MAX_SYNC_PITCH_PERCENT) to 1f
    }

    private fun syncTempoToMaster(slaveId: DeckId, masterId: DeckId) {
        val slave = stateFlowFor(slaveId).value
        val master = stateFlowFor(masterId).value
        if (!slave.isLoaded || !master.isLoaded || slave.detectedBpm <= 0f || master.detectedBpm <= 0f) return
        val masterEffectiveBpm = master.detectedBpm * pitchPercentToRate(master.pitchPercent)
        val (neededPitch, mult) = computeBestSyncTarget(slave.detectedBpm, masterEffectiveBpm)
        val nextRange = if (abs(neededPitch) > slave.pitchRangePercent) {
            if (abs(neededPitch) > 16f) 50 else 16
        } else slave.pitchRangePercent
        val maxAllowed = minOf(MAX_SYNC_PITCH_PERCENT, nextRange.toFloat())
        val clamped = neededPitch.coerceIn(-maxAllowed, maxAllowed)
        stateFlowFor(slaveId).update {
            it.copy(
                pitchRangePercent = nextRange,
                pitchPercent = clamped,
                syncMultiplier = mult
            )
        }
        applyPlaybackSpeed(slaveId)
    }

    fun syncBpm(targetDeckId: DeckId) {
        val otherId = if (targetDeckId == DeckId.DECK_A) DeckId.DECK_B else DeckId.DECK_A
        val otherDeck = stateFlowFor(otherId).value
        val targetDeck = stateFlowFor(targetDeckId).value
        if (!otherDeck.isLoaded || !targetDeck.isLoaded || otherDeck.detectedBpm <= 0f || targetDeck.detectedBpm <= 0f) return

        // Toggle off cleanly if already locked & close in phase
        if (targetDeck.syncLocked && abs(targetDeck.phaseErrorBeats) < 0.04f) {
            syncTrimRatio[targetDeckId] = 1f
            stateFlowFor(targetDeckId).update { it.copy(syncLocked = false, phaseErrorBeats = 0f) }
            applyPlaybackSpeed(targetDeckId)
            return
        }

        // Assign opposite deck as Master clock and lock target deck as Slave (without auto-starting playback)
        syncTrimRatio[otherId] = 1f
        stateFlowFor(otherId).update { it.copy(syncMaster = true, syncLocked = false, phaseErrorBeats = 0f) }
        applyPlaybackSpeed(otherId)

        stateFlowFor(targetDeckId).update { it.copy(syncMaster = false, syncLocked = true) }
        syncTempoToMaster(targetDeckId, otherId)

        val updatedTarget = stateFlowFor(targetDeckId).value
        val mult = updatedTarget.syncMultiplier.takeIf { it > 0f } ?: 1f
        val otherBeatMs = 60_000f / otherDeck.detectedBpm
        val targetBeatMs = 60_000f / updatedTarget.detectedBpm
        val otherPos = playerFor(otherId).currentPosition.coerceAtLeast(0L)
        val curTargetPos = playerFor(targetDeckId).currentPosition.coerceAtLeast(0L)

        val masterPhase = wrap01(((otherPos - otherDeck.beatOffsetMs).toFloat() / otherBeatMs) * mult)
        val targetBeatsFloat = (curTargetPos - updatedTarget.beatOffsetMs).toFloat() / targetBeatMs
        val nearestBeat = kotlin.math.round(targetBeatsFloat - masterPhase)
        var alignedMs = updatedTarget.beatOffsetMs + ((nearestBeat + masterPhase) * targetBeatMs).roundToLong()
        if (alignedMs < 0L) alignedMs += targetBeatMs.roundToLong()
        val dur = updatedTarget.durationMs.coerceAtLeast(1L)
        if (alignedMs >= dur) alignedMs = (alignedMs - targetBeatMs.roundToLong()).coerceAtLeast(0L)
        alignedMs = alignedMs.coerceIn(0L, dur)

        val sittingAtStartCue = !updatedTarget.isPlaying && abs(curTargetPos - updatedTarget.beatOffsetMs) < 40L
        syncTrimRatio[targetDeckId] = 1f
        if (sittingAtStartCue && updatedTarget.quantizeEnabled) {
            stateFlowFor(targetDeckId).update { it.copy(positionMs = updatedTarget.beatOffsetMs, phaseErrorBeats = 0f) }
            applyPlaybackSpeed(targetDeckId)
            return
        }

        seekTo(targetDeckId, alignedMs)
        stateFlowFor(targetDeckId).update { it.copy(phaseErrorBeats = 0f) }
        applyPlaybackSpeed(targetDeckId)
    }

    private fun maintainSyncLock() {
        val deckA = _deckA.value
        val deckB = _deckB.value
        if (!deckA.isLoaded || !deckB.isLoaded || deckA.detectedBpm <= 0f || deckB.detectedBpm <= 0f) return

        val (slaveId, masterId) = when {
            deckB.syncLocked && !deckA.syncLocked -> DeckId.DECK_B to DeckId.DECK_A
            deckA.syncLocked && !deckB.syncLocked -> DeckId.DECK_A to DeckId.DECK_B
            else -> return
        }

        val master = stateFlowFor(masterId).value
        val slave = stateFlowFor(slaveId).value
        val masterEffectiveBpm = master.detectedBpm * pitchPercentToRate(master.pitchPercent)
        val (neededPitch, mult) = computeBestSyncTarget(slave.detectedBpm, masterEffectiveBpm)
        val nextRange = if (abs(neededPitch) > slave.pitchRangePercent) {
            if (abs(neededPitch) > 16f) 50 else 16
        } else slave.pitchRangePercent
        val maxAllowed = minOf(MAX_SYNC_PITCH_PERCENT, nextRange.toFloat())
        val desiredPitch = neededPitch.coerceIn(-maxAllowed, maxAllowed)

        if (abs(slave.pitchPercent - desiredPitch) > 0.005f || slave.syncMultiplier != mult || slave.pitchRangePercent != nextRange) {
            stateFlowFor(slaveId).update {
                it.copy(pitchRangePercent = nextRange, pitchPercent = desiredPitch, syncMultiplier = mult)
            }
        }

        val masterPlayer = playerFor(masterId)
        val slavePlayer = playerFor(slaveId)
        if (!masterPlayer.isPlaying || !slavePlayer.isPlaying || slave.quantizePending || slipScratchActive[slaveId] == true || slipScratchActive[masterId] == true) {
            if ((syncTrimRatio[slaveId] ?: 1f) != 1f || abs(slave.pitchPercent - desiredPitch) > 0.005f) {
                syncTrimRatio[slaveId] = 1f
                applyPlaybackSpeed(slaveId)
            }
            if (slave.phaseErrorBeats != 0f) {
                stateFlowFor(slaveId).update { it.copy(phaseErrorBeats = 0f) }
            }
            return
        }

        val posM = masterPlayer.currentPosition.coerceAtLeast(0L)
        val posS = slavePlayer.currentPosition.coerceAtLeast(0L)
        val masterBeatMs = 60_000f / master.detectedBpm
        val slaveBeatMs = 60_000f / slave.detectedBpm

        val phaseM = wrap01(((posM - master.beatOffsetMs).toFloat() / masterBeatMs) * mult)
        val phaseS = wrap01((posS - slave.beatOffsetMs).toFloat() / slaveBeatMs)
        val phaseErr = wrapSignedHalf(phaseM - phaseS)
        stateFlowFor(slaveId).update { it.copy(phaseErrorBeats = phaseErr) }

        if (abs(phaseErr) > 0.14f) {
            val snapped = (posS + (phaseErr * slaveBeatMs).roundToLong())
                .coerceIn(0L, slave.durationMs.coerceAtLeast(1L))
            syncTrimRatio[slaveId] = 1f
            slavePlayer.seekTo(snapped)
            applyPlaybackSpeed(slaveId)
            return
        }

        val targetTrim = if (abs(phaseErr) > 0.002f) {
            1f + (phaseErr * 0.5f).coerceIn(-0.025f, 0.025f)
        } else 1f
        val curTrim = syncTrimRatio[slaveId] ?: 1f
        if (abs(curTrim - targetTrim) > 0.0004f || abs(slave.pitchPercent - desiredPitch) > 0.005f) {
            syncTrimRatio[slaveId] = targetTrim
            applyPlaybackSpeed(slaveId)
        }
    }

    fun setDeckVolume(deckId: DeckId, volume: Float) {
        stateFlowFor(deckId).update { it.copy(volume = volume.coerceIn(0f, 1f)) }
        applyMixVolumes()
    }

    fun setGainDb(deckId: DeckId, gainDb: Float) {
        stateFlowFor(deckId).update { it.copy(gainDb = gainDb.coerceIn(-12f, 12f)) }
        applyMixVolumes()
    }

    fun setCrossfader(value: Float) {
        crossfadeAnimJob?.cancel()
        _crossfader.value = value.coerceIn(0f, 1f)
        applyMixVolumes()
    }

    fun animateCrossfaderTo(target: Float, durationMs: Long = 2200L) {
        crossfadeAnimJob?.cancel()
        val clampedTarget = target.coerceIn(0f, 1f)
        val start = _crossfader.value
        if (abs(clampedTarget - start) < 0.005f) {
            setCrossfader(clampedTarget)
            return
        }
        crossfadeAnimJob = scope.launch(Dispatchers.Main) {
            val startTime = System.currentTimeMillis()
            while (isActive) {
                val t = ((System.currentTimeMillis() - startTime).toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
                val eased = (0.5f - 0.5f * cos(PI * t)).toFloat()
                _crossfader.value = start + (clampedTarget - start) * eased
                applyMixVolumes()
                if (t >= 1f) break
                delay(24L)
            }
        }
    }

    fun setMasterVolume(value: Float) {
        _masterVolume.value = value.coerceIn(0f, 1f)
        applyMixVolumes()
    }

    fun setEq(deckId: DeckId, low: Float? = null, mid: Float? = null, high: Float? = null, filter: Float? = null) {
        val flow = stateFlowFor(deckId)
        flow.update { st ->
            st.copy(
                eqLow = low?.coerceIn(0f, 1f) ?: st.eqLow,
                eqMid = mid?.coerceIn(0f, 1f) ?: st.eqMid,
                eqHigh = high?.coerceIn(0f, 1f) ?: st.eqHigh,
                filterValue = filter?.coerceIn(0f, 1f) ?: st.filterValue
            )
        }
        val st = flow.value
        fxFor(deckId).applyEqAndFilter(st.eqLow, st.eqMid, st.eqHigh, st.filterValue, st.fxSlots)
    }

    fun toggleFxSlot(deckId: DeckId, slotIndex: Int) {
        val flow = stateFlowFor(deckId)
        flow.update { st ->
            val updated = st.fxSlots.mapIndexed { idx, slot ->
                if (idx == slotIndex) slot.copy(enabled = !slot.enabled) else slot
            }
            st.copy(fxSlots = updated)
        }
        val st = flow.value
        fxFor(deckId).applyEqAndFilter(st.eqLow, st.eqMid, st.eqHigh, st.filterValue, st.fxSlots)
    }

    fun setFxSlotType(deckId: DeckId, slotIndex: Int, fxType: FxType) {
        val flow = stateFlowFor(deckId)
        flow.update { st ->
            val updated = st.fxSlots.mapIndexed { idx, slot ->
                if (idx == slotIndex) slot.copy(type = fxType) else slot
            }
            st.copy(fxSlots = updated)
        }
        val st = flow.value
        fxFor(deckId).applyEqAndFilter(st.eqLow, st.eqMid, st.eqHigh, st.filterValue, st.fxSlots)
    }

    fun stepLoopSize(deckId: DeckId, direction: Int) {
        val sizes = listOf(0.125f, 0.25f, 0.5f, 1f, 2f, 4f, 8f, 16f)
        stateFlowFor(deckId).update { st ->
            val currentIdx = sizes.indexOfFirst { it == st.loopBeats }.takeIf { it >= 0 } ?: 2
            val nextIdx = (currentIdx + direction).coerceIn(0, sizes.lastIndex)
            val nextBeats = sizes[nextIdx]
            if (st.loopActive && st.isLoaded) {
                val bpm = st.detectedBpm.takeIf { it > 0f } ?: 120f
                val beatMsBuf = 60_000f / bpm
                val nextEnd = (st.loopStartMs + (beatMsBuf * nextBeats).toLong())
                    .coerceAtMost(st.durationMs.coerceAtLeast(st.loopStartMs + 120L))
                st.copy(loopBeats = nextBeats, loopEndMs = nextEnd)
            } else {
                st.copy(loopBeats = nextBeats)
            }
        }
    }

    fun toggleLoop(deckId: DeckId) {
        val flow = stateFlowFor(deckId)
        val st = flow.value
        if (!st.isLoaded) return
        if (st.loopActive) {
            flow.update { it.copy(loopActive = false) }
            maintainSyncLock()
        } else {
            val bpm = st.detectedBpm.takeIf { it > 0f } ?: 120f
            // Loop boundaries live in buffer-time milliseconds (playbackParameters already stretches time)
            val beatMsBuf = 60_000f / bpm
            val loopLenMs = (beatMsBuf * st.loopBeats).toLong().coerceAtLeast(120L)
            val curPos = playerFor(deckId).currentPosition.coerceAtLeast(0L)
            val start = if (st.quantizeEnabled && st.detectedBpm > 0f) {
                val beatIdx = kotlin.math.round((curPos - st.beatOffsetMs).toFloat() / beatMsBuf)
                (st.beatOffsetMs + (beatIdx * beatMsBuf).roundToLong()).coerceIn(0L, st.durationMs.coerceAtLeast(1L))
            } else curPos
            flow.update {
                it.copy(
                    loopActive = true,
                    loopStartMs = start,
                    loopEndMs = (start + loopLenMs).coerceAtMost(st.durationMs.coerceAtLeast(start + 120L))
                )
            }
        }
    }

    fun toggleSlip(deckId: DeckId) {
        stateFlowFor(deckId).update { it.copy(slipEnabled = !it.slipEnabled) }
    }

    fun beginScratch(deckId: DeckId) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        if (st.slipEnabled) {
            slipShadowPosMs[deckId] = st.positionMs
            slipScratchActive[deckId] = true
            slipWasPlaying[deckId] = st.isPlaying
        }
    }

    fun endScratch(deckId: DeckId) {
        if (slipScratchActive[deckId] == true) {
            slipScratchActive[deckId] = false
            val targetPos = (slipShadowPosMs[deckId] ?: 0L).coerceIn(0L, stateFlowFor(deckId).value.durationMs.coerceAtLeast(1L))
            seekTo(deckId, targetPos)
            if (slipWasPlaying[deckId] == true && !playerFor(deckId).isPlaying) {
                playerFor(deckId).play()
            }
        }
        maintainSyncLock()
    }

    fun nudgePlatter(deckId: DeckId, deltaDegrees: Float) {
        val st = stateFlowFor(deckId).value
        if (!st.isLoaded) return
        val deltaMs = (deltaDegrees / 360f * 1800f).toLong()
        seekTo(deckId, (st.positionMs + deltaMs).coerceIn(0L, st.durationMs))
    }

    fun setRecordingMode(mode: RecordingMode) {
        if (_recordingState.value.status != RecordingStatus.IDLE) return
        _recordingState.update { it.copy(mode = mode) }
    }

    fun startRecording() {
        if (_recordingState.value.status != RecordingStatus.IDLE) return
        val ext = "wav"
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val prefix = if (_recordingState.value.mode == RecordingMode.VIDEO) "ChronixDJ_AVMix" else "ChronixDJ_Mix"
        val fileName = "${prefix}_${stamp}.$ext"
        val outFile = File(context.cacheDir, fileName)
        recordingFile = outFile
        recQueueA.clear()
        recQueueB.clear()
        recordingDataBytes = 0L

        attachRecorderTaps(true)
        _recordingState.update {
            it.copy(
                status = RecordingStatus.RECORDING,
                elapsedSec = 0,
                savedFilePath = null,
                savedFileName = null
            )
        }

        recordingTimerJob?.cancel()
        recordingTimerJob = scope.launch(Dispatchers.Main) {
            while (isActive) {
                delay(1000L)
                if (_recordingState.value.status == RecordingStatus.RECORDING) {
                    _recordingState.update { it.copy(elapsedSec = it.elapsedSec + 1) }
                }
            }
        }

        recordingJob?.cancel()
        recordingJob = scope.launch(Dispatchers.IO) {
            runCatching {
                BufferedOutputStream(FileOutputStream(outFile)).use { bos ->
                    bos.write(ByteArray(44)) // WAV header placeholder
                    var chunkCount = 0L
                    while (isActive && _recordingState.value.status != RecordingStatus.IDLE) {
                        if (_recordingState.value.status == RecordingStatus.PAUSED) {
                            recQueueA.clear()
                            recQueueB.clear()
                            delay(40L)
                            continue
                        }
                        val bufA = recQueueA.poll()
                        val bufB = recQueueB.poll()
                        if (bufA == null && bufB == null) {
                            delay(15L)
                            continue
                        }
                        val len = maxOf(bufA?.size ?: 0, bufB?.size ?: 0)
                        val byteBuf = ByteBuffer.allocate(len * 2).order(ByteOrder.LITTLE_ENDIAN)
                        for (i in 0 until len) {
                            val sA = if (bufA != null && i < bufA.size) bufA[i].toInt() else 0
                            val sB = if (bufB != null && i < bufB.size) bufB[i].toInt() else 0
                            val mixed = (sA + sB).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
                            byteBuf.putShort(mixed)
                        }
                        val raw = byteBuf.array()
                        bos.write(raw)
                        recordingDataBytes += raw.size
                        chunkCount++
                        if (chunkCount % 16L == 0L) bos.flush()
                    }
                    bos.flush()
                }
                patchWavHeader(outFile, 44100, 2, recordingDataBytes)
            }.onFailure { err ->
                withContext(Dispatchers.Main) {
                    onError("Mix recording error: ${err.localizedMessage ?: "I/O failure"}")
                    stopRecording()
                }
            }
        }
    }

    fun pauseRecording() {
        if (_recordingState.value.status != RecordingStatus.RECORDING) return
        attachRecorderTaps(false)
        _recordingState.update { it.copy(status = RecordingStatus.PAUSED) }
    }

    fun resumeRecording() {
        if (_recordingState.value.status != RecordingStatus.PAUSED) return
        recQueueA.clear()
        recQueueB.clear()
        attachRecorderTaps(true)
        _recordingState.update { it.copy(status = RecordingStatus.RECORDING) }
    }

    fun stopRecording() {
        attachRecorderTaps(false)
        recordingTimerJob?.cancel()
        val current = _recordingState.value
        if (current.status == RecordingStatus.IDLE) return
        val file = recordingFile
        _recordingState.update {
            it.copy(
                status = RecordingStatus.IDLE,
                savedFilePath = file?.absolutePath,
                savedFileName = file?.name
            )
        }
    }

    fun saveRecording(onResult: (String) -> Unit) {
        val filePath = _recordingState.value.savedFilePath
        val fileName = _recordingState.value.savedFileName ?: "ChronixDJ_Mix.wav"
        val src = if (filePath != null) File(filePath) else null
        if (src == null || !src.exists()) {
            onResult("No recorded mix available to save.")
            return
        }
        scope.launch(Dispatchers.IO) {
            val res = runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                        put(MediaStore.Downloads.MIME_TYPE, "audio/wav")
                        put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/ChronixDJ")
                    }
                    val resolver = context.contentResolver
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: error("MediaStore insert failed")
                    resolver.openOutputStream(uri)?.use { out ->
                        src.inputStream().use { inp -> inp.copyTo(out) }
                    } ?: error("Cannot open Downloads stream")
                    "Saved mix to Downloads/ChronixDJ/$fileName"
                } else {
                    @Suppress("DEPRECATION")
                    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ChronixDJ")
                    dir.mkdirs()
                    val dst = File(dir, fileName)
                    src.copyTo(dst, overwrite = true)
                    "Saved mix to ${dst.absolutePath}"
                }
            }
            withContext(Dispatchers.Main) {
                res.onSuccess { msg -> onResult(msg) }
                    .onFailure { err -> onResult("Save failed: ${err.localizedMessage ?: "Permission denied"}") }
            }
        }
    }

    fun clearSavedRecording() {
        recordingFile?.delete()
        recordingFile = null
        _recordingState.update {
            it.copy(elapsedSec = 0, savedFilePath = null, savedFileName = null)
        }
    }

    private fun attachRecorderTaps(enabled: Boolean) {
        if (!enabled) {
            vocalProcA.frameTap = null
            vocalProcB.frameTap = null
            return
        }
        vocalProcA.frameTap = { bytes, sr, _ ->
            if (recQueueA.size < 48) {
                recQueueA.offer(scaleAndResampleStereo(bytes, sr, currentGainFor(DeckId.DECK_A)))
            }
        }
        vocalProcB.frameTap = { bytes, sr, _ ->
            if (recQueueB.size < 48) {
                recQueueB.offer(scaleAndResampleStereo(bytes, sr, currentGainFor(DeckId.DECK_B)))
            }
        }
    }

    private fun currentGainFor(deckId: DeckId): Float {
        val xf = _crossfader.value
        val (xfA, xfB) = when (currentSettings.crossfaderCurve) {
            CrossfaderCurve.EQUAL_POWER -> cos(xf * (PI / 2.0)).toFloat() to sin(xf * (PI / 2.0)).toFloat()
            CrossfaderCurve.LINEAR -> (1f - xf) to xf
            CrossfaderCurve.FAST_CUT -> (if (xf > 0.92f) 0f else 1f) to (if (xf < 0.08f) 0f else 1f)
        }
        val st = stateFlowFor(deckId).value
        val gainMult = 10f.pow(st.gainDb / 20f)
        val xfGain = if (deckId == DeckId.DECK_A) xfA else xfB
        return (st.volume * xfGain * _masterVolume.value * gainMult).coerceIn(0f, 1.2f)
    }

    private fun scaleAndResampleStereo(bytes: ByteArray, sampleRate: Int, gain: Float): ShortArray {
        val srcShorts = ShortArray(bytes.size / 2)
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(srcShorts)
        if (sampleRate == 44100 || sampleRate <= 0) {
            for (i in srcShorts.indices) {
                srcShorts[i] = (srcShorts[i] * gain).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
            return srcShorts
        }
        val srcFrames = srcShorts.size / 2
        val dstFrames = ((srcFrames.toLong() * 44100L) / sampleRate).toInt().coerceAtLeast(1)
        val out = ShortArray(dstFrames * 2)
        for (f in 0 until dstFrames) {
            val sf = ((f.toFloat() / dstFrames) * srcFrames).toInt().coerceIn(0, (srcFrames - 1).coerceAtLeast(0))
            out[f * 2] = (srcShorts[sf * 2] * gain).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            out[f * 2 + 1] = (srcShorts[sf * 2 + 1] * gain).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return out
    }

    private fun patchWavHeader(file: File, sampleRate: Int, channels: Int, dataBytes: Long) {
        val byteRate = sampleRate * channels * 2
        val blockAlign = channels * 2
        RandomAccessFile(file, "rw").use { raf ->
            val hdr = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
                put("RIFF".toByteArray())
                putInt((36L + dataBytes).toInt())
                put("WAVE".toByteArray())
                put("fmt ".toByteArray())
                putInt(16)
                putShort(1.toShort())
                putShort(channels.toShort())
                putInt(sampleRate)
                putInt(byteRate)
                putShort(blockAlign.toShort())
                putShort(16.toShort())
                put("data".toByteArray())
                putInt(dataBytes.toInt())
            }.array()
            raf.seek(0L)
            raf.write(hdr)
        }
    }

    fun updateSettings(settings: DjSettings) {
        currentSettings = settings
        applyMixVolumes()
        applyAudioOutputRoute(settings.audioOutputRoute)
    }

    private fun applyAudioOutputRoute(route: AudioOutputRoute) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val targetDevice: AudioDeviceInfo? = when (route) {
            AudioOutputRoute.AUTO -> null
            AudioOutputRoute.SPEAKER -> devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            AudioOutputRoute.HEADPHONES -> devices.firstOrNull {
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                    it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                    it.type == AudioDeviceInfo.TYPE_USB_HEADSET
            }
            AudioOutputRoute.BLUETOOTH -> devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
        }
        runCatching {
            playerA.setPreferredAudioDevice(targetDevice)
            playerB.setPreferredAudioDevice(targetDevice)
        }
    }

    private fun applyMixVolumes() {
        val xf = _crossfader.value
        val (xfGainA, xfGainB) = when (currentSettings.crossfaderCurve) {
            CrossfaderCurve.EQUAL_POWER -> {
                cos(xf * (PI / 2.0)).toFloat() to sin(xf * (PI / 2.0)).toFloat()
            }
            CrossfaderCurve.LINEAR -> {
                (1f - xf) to xf
            }
            CrossfaderCurve.FAST_CUT -> {
                (if (xf > 0.92f) 0f else 1f) to (if (xf < 0.08f) 0f else 1f)
            }
        }

        val gainMultA = 10f.pow(_deckA.value.gainDb / 20f)
        val gainMultB = 10f.pow(_deckB.value.gainDb / 20f)

        playerA.volume = (_deckA.value.volume * xfGainA * _masterVolume.value * gainMultA).coerceIn(0f, 1f)
        playerB.volume = (_deckB.value.volume * xfGainB * _masterVolume.value * gainMultB).coerceIn(0f, 1f)
    }

    private fun startPositionTicker() {
        tickerJob?.cancel()
        tickerJob = scope.launch(Dispatchers.Main) {
            while (isActive) {
                updateDeckTick(DeckId.DECK_A, playerA, _deckA, liveLevelsA)
                updateDeckTick(DeckId.DECK_B, playerB, _deckB, liveLevelsB)
                maintainSyncLock()
                delay(if (currentSettings.liteMode) 45L else 28L)
            }
        }
    }

    private fun updateDeckTick(
        deckId: DeckId,
        player: ExoPlayer,
        flow: MutableStateFlow<DeckState>,
        liveVis: FloatArray
    ) {
        val st = flow.value
        if (!st.isLoaded) return
        val isPlaying = player.isPlaying
        val pos = player.currentPosition.coerceAtLeast(0L)

        // Skip zero-delta UI state emissions when paused/idle to prevent 30fps full-screen recompositions
        if (!isPlaying && st.positionMs == pos && st.vuLevel == 0f && st.audioWaveLevels === IDLE_WAVE_LEVELS) {
            return
        }

        if (isPlaying && st.loopActive && pos >= st.loopEndMs && st.loopEndMs > st.loopStartMs) {
            player.seekTo(st.loopStartMs)
        }
        val nextAngle = if (isPlaying) {
            (st.platterDegrees + (6.6f * (1f + st.pitchPercent / 100f))) % 360f
        } else st.platterDegrees

        val vu = if (isPlaying) {
            val waveIdx = if (st.waveform.isNotEmpty() && st.durationMs > 0L) {
                ((pos.toFloat() / st.durationMs.toFloat()) * st.waveform.lastIndex)
                    .toInt().coerceIn(0, st.waveform.lastIndex)
            } else -1
            if (waveIdx >= 0) st.waveform[waveIdx].amplitude * player.volume else 0.5f * player.volume
        } else 0f

        val waveList = if (isPlaying) {
            if (st.waveform.isNotEmpty() && st.durationMs > 0L) {
                val centerIdx = ((pos.toFloat() / st.durationMs.toFloat()) * st.waveform.lastIndex).toInt()
                List(48) { idx ->
                    val sampleIdx = (centerIdx - 24 + idx).coerceIn(0, st.waveform.lastIndex)
                    val peak = st.waveform[sampleIdx].amplitude
                    val live = liveVis[idx]
                    ((peak * 0.65f + live * 0.35f) * player.volume.coerceAtLeast(0.25f)).coerceIn(0.06f, 1f)
                }
            } else {
                liveVis.toList()
            }
        } else {
            IDLE_WAVE_LEVELS
        }

        val tickMs = if (currentSettings.liteMode) 45L else 28L
        if (slipScratchActive[deckId] == true && slipWasPlaying[deckId] == true) {
            val speed = 1f + st.pitchPercent / 100f
            slipShadowPosMs[deckId] = ((slipShadowPosMs[deckId] ?: pos) + (tickMs * speed).toLong())
                .coerceIn(0L, st.durationMs.coerceAtLeast(1L))
        }

        flow.update {
            it.copy(
                positionMs = pos,
                platterDegrees = nextAngle,
                vuLevel = vu,
                audioWaveLevels = waveList
            )
        }
    }

    fun release() {
        quantizeJobs[DeckId.DECK_A]?.cancel()
        quantizeJobs[DeckId.DECK_B]?.cancel()
        crossfadeAnimJob?.cancel()
        recordingTimerJob?.cancel()
        recordingJob?.cancel()
        attachRecorderTaps(false)
        tickerJob?.cancel()
        runCatching { visualizerA?.release() }
        runCatching { visualizerB?.release() }
        fxA.release()
        fxB.release()
        playerA.release()
        playerB.release()
    }
}
