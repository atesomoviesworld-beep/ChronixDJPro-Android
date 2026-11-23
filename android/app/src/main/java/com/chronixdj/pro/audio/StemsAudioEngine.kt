package com.chronixdj.pro.audio

import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.chronixdj.pro.model.StemChannelState
import com.chronixdj.pro.model.StemSeparationEngine
import com.chronixdj.pro.model.StemType
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
import kotlin.math.abs
import kotlin.math.sin

class StemsAudioEngine(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onError: (String) -> Unit
) {
    private val _channels = MutableStateFlow(
        StemType.entries.associateWith { StemChannelState(type = it) }
    )
    val channels: StateFlow<Map<StemType, StemChannelState>> = _channels.asStateFlow()

    /**
     * Future AI stem separation hook (e.g., on-device Demucs / ONNX / Cloud separator).
     * Defaults to unimplemented so ordinary file loading never pretends to perform AI separation.
     */
    var aiSeparationEngine: StemSeparationEngine? = null

    private val players: Map<StemType, ExoPlayer> = StemType.entries.associateWith { stemType ->
        val attrs = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()
        ExoPlayer.Builder(context)
            .setAudioAttributes(attrs, false)
            .build().apply {
                addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        updateChannel(stemType) { it.copy(isPlaying = isPlaying) }
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY) {
                            updateChannel(stemType) { it.copy(durationMs = duration.coerceAtLeast(0L)) }
                        } else if (playbackState == Player.STATE_ENDED) {
                            updateChannel(stemType) { it.copy(isPlaying = false) }
                        }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        updateChannel(stemType) { it.copy(isPlaying = false) }
                        onError("Stem ${stemType.displayName} error: ${error.localizedMessage ?: "Unsupported audio format"}")
                    }
                })
            }
    }

    private var tickerJob: Job? = null

    init {
        tickerJob = scope.launch(Dispatchers.Main) {
            var tick = 0
            while (isActive) {
                tick++
                _channels.update { map ->
                    map.mapValues { (type, ch) ->
                        val p = players[type]
                        val pos = p?.currentPosition?.coerceAtLeast(0L) ?: 0L
                        val meter = if (ch.isPlaying && !isEffectivelyMuted(type, map)) {
                            (ch.volume * (0.45f + 0.5f * abs(sin((tick + type.ordinal * 2) * 0.35f))))
                        } else 0f
                        ch.copy(positionMs = pos, levelMeter = meter)
                    }
                }
                delay(50L)
            }
        }
    }

    fun loadStemFile(stemType: StemType, uri: Uri) {
        StoragePermissionHelper.takePersistableReadPermission(context, uri)
        val name = StoragePermissionHelper.resolveDisplayName(context, uri)
        val player = players[stemType] ?: return

        runCatching {
            player.stop()
            player.setMediaItem(MediaItem.fromUri(uri))
            player.prepare()
            updateChannel(stemType) {
                it.copy(
                    fileName = name,
                    uri = uri,
                    isLoaded = true,
                    isPlaying = false,
                    positionMs = 0L
                )
            }
            applyEffectiveVolumes()
        }.onFailure {
            onError("Failed to load ${stemType.displayName} stem: ${it.localizedMessage}")
        }
    }

    fun togglePlayPause(stemType: StemType) {
        val ch = _channels.value[stemType] ?: return
        if (!ch.isLoaded) {
            onError("Load a separated ${stemType.displayName} audio file first.")
            return
        }
        val player = players[stemType] ?: return
        if (player.isPlaying) {
            player.pause()
        } else {
            if (player.playbackState == Player.STATE_ENDED) player.seekTo(0L)
            player.play()
        }
    }

    fun playAllLoaded() {
        val loaded = _channels.value.filterValues { it.isLoaded }
        if (loaded.isEmpty()) {
            onError("Load at least one stem file (Vocals, Drums, Bass, or Instrumental) first.")
            return
        }
        loaded.keys.forEach { type ->
            players[type]?.let { p ->
                p.seekTo(0L)
                p.play()
            }
        }
    }

    fun pauseAll() {
        players.values.forEach { it.pause() }
    }

    fun setVolume(stemType: StemType, volume: Float) {
        updateChannel(stemType) { it.copy(volume = volume.coerceIn(0f, 1f)) }
        applyEffectiveVolumes()
    }

    fun toggleMute(stemType: StemType) {
        updateChannel(stemType) { it.copy(isMuted = !it.isMuted) }
        applyEffectiveVolumes()
    }

    fun toggleSolo(stemType: StemType) {
        updateChannel(stemType) { it.copy(isSolo = !it.isSolo) }
        applyEffectiveVolumes()
    }

    private fun isEffectivelyMuted(type: StemType, map: Map<StemType, StemChannelState>): Boolean {
        val ch = map[type] ?: return true
        if (ch.isMuted) return true
        val anySolo = map.values.any { it.isSolo }
        return anySolo && !ch.isSolo
    }

    private fun applyEffectiveVolumes() {
        val current = _channels.value
        current.forEach { (type, ch) ->
            val muted = isEffectivelyMuted(type, current)
            players[type]?.volume = if (muted) 0f else ch.volume
        }
    }

    private fun updateChannel(type: StemType, transform: (StemChannelState) -> StemChannelState) {
        _channels.update { map ->
            val current = map[type] ?: return@update map
            map + (type to transform(current))
        }
    }

    fun release() {
        tickerJob?.cancel()
        players.values.forEach { it.release() }
    }
}
