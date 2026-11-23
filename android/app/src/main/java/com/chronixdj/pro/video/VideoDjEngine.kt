package com.chronixdj.pro.video

import android.content.Context
import android.media.audiofx.Visualizer
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import com.chronixdj.pro.audio.BpmAndWaveformAnalyzer
import com.chronixdj.pro.audio.VocalRemoverAudioProcessor
import com.chronixdj.pro.model.CrossfaderCurve
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.VideoDeckState
import com.chronixdj.pro.model.VocalMode
import com.chronixdj.pro.model.WaveformPeak
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
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

class VideoDjEngine(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onError: (String) -> Unit
) {
    private val _deckA = MutableStateFlow(VideoDeckState(DeckId.DECK_A))
    val deckA: StateFlow<VideoDeckState> = _deckA.asStateFlow()

    private val _deckB = MutableStateFlow(VideoDeckState(DeckId.DECK_B))
    val deckB: StateFlow<VideoDeckState> = _deckB.asStateFlow()

    private val vocalProcA = VocalRemoverAudioProcessor()
    private val vocalProcB = VocalRemoverAudioProcessor()

    private var extractedWaveA: List<WaveformPeak> = emptyList()
    private var extractedWaveB: List<WaveformPeak> = emptyList()

    private var visualizerA: Visualizer? = null
    private var visualizerB: Visualizer? = null
    private val liveLevelsA = FloatArray(48) { 0.08f }
    private val liveLevelsB = FloatArray(48) { 0.08f }

    val playerA: ExoPlayer = buildVideoPlayer(DeckId.DECK_A)
    val playerB: ExoPlayer = buildVideoPlayer(DeckId.DECK_B)

    private var crossfader = 0.5f
    private var masterVolume = 0.9f
    private var curve = CrossfaderCurve.EQUAL_POWER
    private var tickerJob: Job? = null

    init {
        tickerJob = scope.launch(Dispatchers.Main) {
            while (isActive) {
                updateVideoWaveTick(DeckId.DECK_A, playerA, _deckA, extractedWaveA, liveLevelsA)
                updateVideoWaveTick(DeckId.DECK_B, playerB, _deckB, extractedWaveB, liveLevelsB)
                delay(40L) // Lite 25fps wave sync
            }
        }
    }

    @OptIn(UnstableApi::class)
    private fun buildVideoPlayer(deckId: DeckId): ExoPlayer {
        val attrs = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .setUsage(C.USAGE_MEDIA)
            .build()
        val vocalProc = if (deckId == DeckId.DECK_A) vocalProcA else vocalProcB
        val renderersFactory = object : DefaultRenderersFactory(context) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean
            ): AudioSink {
                return DefaultAudioSink.Builder(context)
                    .setAudioProcessors(arrayOf(vocalProc))
                    .build()
            }
        }
        return ExoPlayer.Builder(context, renderersFactory)
            .setAudioAttributes(attrs, false)
            .build().apply {
                addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        flowFor(deckId).update { it.copy(isPlaying = isPlaying) }
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY) {
                            flowFor(deckId).update { it.copy(durationMs = duration.coerceAtLeast(0L)) }
                            attachVisualizer(deckId, audioSessionId)
                        } else if (playbackState == Player.STATE_ENDED) {
                            flowFor(deckId).update { it.copy(isPlaying = false) }
                        }
                    }

                    override fun onAudioSessionIdChanged(audioSessionId: Int) {
                        attachVisualizer(deckId, audioSessionId)
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        flowFor(deckId).update { it.copy(isPlaying = false) }
                        onError("Video playback error on ${deckId.name}: ${error.localizedMessage ?: "Unsupported format"}")
                    }
                })
            }
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

    private fun updateVideoWaveTick(
        deckId: DeckId,
        player: ExoPlayer,
        flow: MutableStateFlow<VideoDeckState>,
        extracted: List<WaveformPeak>,
        liveVis: FloatArray
    ) {
        val st = flow.value
        if (!st.isLoaded) return
        val pos = player.currentPosition.coerceAtLeast(0L)
        val waveList = if (player.isPlaying) {
            if (extracted.isNotEmpty() && st.durationMs > 0L) {
                val centerIdx = ((pos.toFloat() / st.durationMs.toFloat()) * extracted.lastIndex).toInt()
                List(48) { idx ->
                    val sampleIdx = (centerIdx - 24 + idx).coerceIn(0, extracted.lastIndex)
                    val peak = extracted[sampleIdx].amplitude
                    val live = liveVis[idx]
                    ((peak * 0.65f + live * 0.35f) * player.volume).coerceIn(0.06f, 1f)
                }
            } else {
                liveVis.toList()
            }
        } else {
            List(48) { 0.06f }
        }
        flow.update { it.copy(positionMs = pos, audioWaveLevels = waveList) }
    }

    private fun flowFor(deckId: DeckId): MutableStateFlow<VideoDeckState> =
        if (deckId == DeckId.DECK_A) _deckA else _deckB

    fun playerFor(deckId: DeckId): ExoPlayer =
        if (deckId == DeckId.DECK_A) playerA else playerB

    fun loadVideo(deckId: DeckId, uri: Uri) {
        StoragePermissionHelper.takePersistableReadPermission(context, uri)
        val name = StoragePermissionHelper.resolveDisplayName(context, uri)
        val player = playerFor(deckId)
        runCatching {
            player.stop()
            player.setMediaItem(MediaItem.fromUri(uri))
            player.prepare()
            flowFor(deckId).update {
                it.copy(
                    title = name.substringBeforeLast('.'),
                    videoUri = uri,
                    isLoaded = true,
                    isPlaying = false,
                    positionMs = 0L
                )
            }
            applyVideoAudioVolumes()
            scope.launch {
                val analysis = BpmAndWaveformAnalyzer.analyze(context, uri, targetBuckets = 120)
                if (deckId == DeckId.DECK_A) extractedWaveA = analysis.waveform
                else extractedWaveB = analysis.waveform
            }
        }.onFailure {
            onError("Failed to load video file: ${it.localizedMessage}")
        }
    }

    fun cycleVocalMode(deckId: DeckId) {
        val curr = flowFor(deckId).value.vocalMode
        val next = when (curr) {
            VocalMode.OFF -> VocalMode.REMOVE_ACAPELLA
            VocalMode.REMOVE_ACAPELLA -> VocalMode.ACAPELLA_ONLY
            VocalMode.ACAPELLA_ONLY -> VocalMode.OFF
        }
        flowFor(deckId).update { it.copy(vocalMode = next) }
        if (deckId == DeckId.DECK_A) vocalProcA.vocalMode = next else vocalProcB.vocalMode = next
    }

    fun togglePlayPause(deckId: DeckId) {
        val st = flowFor(deckId).value
        if (!st.isLoaded) {
            onError("Load a video into ${if (deckId == DeckId.DECK_A) "Video Deck A" else "Video Deck B"} first.")
            return
        }
        val p = playerFor(deckId)
        if (p.isPlaying) {
            p.pause()
        } else {
            if (p.playbackState == Player.STATE_ENDED) p.seekTo(0L)
            p.play()
        }
    }

    fun stop(deckId: DeckId) {
        val p = playerFor(deckId)
        p.pause()
        p.seekTo(0L)
        flowFor(deckId).update { it.copy(isPlaying = false, positionMs = 0L) }
    }

    fun seekTo(deckId: DeckId, positionMs: Long) {
        val st = flowFor(deckId).value
        val clamped = positionMs.coerceIn(0L, st.durationMs.coerceAtLeast(1L))
        playerFor(deckId).seekTo(clamped)
        flowFor(deckId).update { it.copy(positionMs = clamped) }
    }

    fun setVolume(deckId: DeckId, volume: Float) {
        flowFor(deckId).update { it.copy(volume = volume.coerceIn(0f, 1f)) }
        applyVideoAudioVolumes()
    }

    fun updateMixControls(xf: Float, masterVol: Float, xfadeCurve: CrossfaderCurve) {
        crossfader = xf.coerceIn(0f, 1f)
        masterVolume = masterVol.coerceIn(0f, 1f)
        curve = xfadeCurve
        applyVideoAudioVolumes()
    }

    private fun applyVideoAudioVolumes() {
        val (xfA, xfB) = when (curve) {
            CrossfaderCurve.EQUAL_POWER -> cos(crossfader * (PI / 2.0)).toFloat() to sin(crossfader * (PI / 2.0)).toFloat()
            CrossfaderCurve.LINEAR -> (1f - crossfader) to crossfader
            CrossfaderCurve.FAST_CUT -> (if (crossfader > 0.92f) 0f else 1f) to (if (crossfader < 0.08f) 0f else 1f)
        }
        playerA.volume = (_deckA.value.volume * xfA * masterVolume).coerceIn(0f, 1f)
        playerB.volume = (_deckB.value.volume * xfB * masterVolume).coerceIn(0f, 1f)
    }

    fun release() {
        tickerJob?.cancel()
        runCatching { visualizerA?.release() }
        runCatching { visualizerB?.release() }
        playerA.release()
        playerB.release()
    }
}
