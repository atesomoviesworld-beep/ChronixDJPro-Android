package com.chronixdj.pro.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.SoundPool
import android.net.Uri
import android.provider.OpenableColumns
import com.chronixdj.pro.model.SamplerPadState
import com.chronixdj.pro.model.SamplerSourceType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

class SamplerEngine(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onError: (String) -> Unit
) {
    companion object {
        private const val CONFIG_FILE = "samplers_config.json"
        private const val SAMPLERS_DIR = "samplers"
    }

    private val defaultBuiltins = listOf(
        SamplerPadState(id = "builtin-0", label = "KICK", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 0, volume = 0.92f),
        SamplerPadState(id = "builtin-1", label = "SNARE", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 1, volume = 0.90f),
        SamplerPadState(id = "builtin-2", label = "HAT", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 2, volume = 0.85f),
        SamplerPadState(id = "builtin-3", label = "CLAP", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 3, volume = 0.90f),
        SamplerPadState(id = "builtin-4", label = "HORN", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 4, volume = 0.85f),
        SamplerPadState(id = "builtin-5", label = "SIREN", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 5, volume = 0.85f),
        SamplerPadState(id = "builtin-6", label = "RISER", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 6, volume = 0.85f),
        SamplerPadState(id = "builtin-7", label = "DROP", sourceType = SamplerSourceType.BUILTIN, builtinIndex = 7, volume = 0.92f)
    )

    private val _pads = MutableStateFlow(defaultBuiltins)
    val pads: StateFlow<List<SamplerPadState>> = _pads.asStateFlow()

    private val samplersFolder: File by lazy {
        File(context.filesDir, SAMPLERS_DIR).apply { if (!exists()) mkdirs() }
    }
    private val configFile: File by lazy { File(context.filesDir, CONFIG_FILE) }

    private val soundPool: SoundPool = SoundPool.Builder()
        .setMaxStreams(8)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        )
        .build()

    private val soundIds = mutableMapOf<String, Int>()
    private val activePlayers = mutableMapOf<String, MediaPlayer>()
    private val pulseJobs = mutableMapOf<String, Job>()

    init {
        scope.launch(Dispatchers.IO) {
            ensureBuiltinWavsGenerated()
            val restored = loadConfigFromDisk()
            if (restored != null) {
                _pads.value = restored
            }
            _pads.value.forEach { preloadPadIntoSoundPool(it) }
        }
    }

    fun triggerPad(padId: String) {
        val pad = _pads.value.firstOrNull { it.id == padId } ?: return
        if (pad.loop && pad.isPlaying) {
            stopPad(padId)
            return
        }

        val file = resolvePadFile(pad)
        if (file == null || !file.exists()) {
            onError("Sampler audio missing for ${pad.label}")
            return
        }

        // Use MediaPlayer for looping pads or large custom files (> 600KB)
        if (pad.loop || file.length() > 600_000L) {
            playWithMediaPlayer(pad, file)
            return
        }

        val sid = soundIds[pad.id]
        if (sid != null && sid > 0) {
            val vol = pad.volume.coerceIn(0.05f, 1.0f)
            soundPool.play(sid, vol, vol, 1, 0, 1.0f)
            pulsePadIndicator(pad.id, 280L)
        } else {
            // Fallback to MediaPlayer while SoundPool finishes loading
            playWithMediaPlayer(pad, file)
        }
    }

    private fun playWithMediaPlayer(pad: SamplerPadState, file: File) {
        stopPad(pad.id, clearFlag = false)
        runCatching {
            val mp = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                setDataSource(file.absolutePath)
                isLooping = pad.loop
                val vol = pad.volume.coerceIn(0f, 1f)
                setVolume(vol, vol)
                prepare()
                setOnCompletionListener { player ->
                    if (!pad.loop) {
                        activePlayers.remove(pad.id)
                        runCatching { player.release() }
                        setPadPlaying(pad.id, false)
                    }
                }
                start()
            }
            activePlayers[pad.id] = mp
            setPadPlaying(pad.id, true)
        }.onFailure { err ->
            setPadPlaying(pad.id, false)
            onError("Unable to play sampler ${pad.label}: ${err.message ?: "unsupported audio"}")
        }
    }

    fun stopPad(padId: String, clearFlag: Boolean = true) {
        pulseJobs.remove(padId)?.cancel()
        activePlayers.remove(padId)?.let { mp ->
            runCatching {
                if (mp.isPlaying) mp.stop()
                mp.release()
            }
        }
        if (clearFlag) {
            setPadPlaying(padId, false)
        }
    }

    fun stopAll() {
        pulseJobs.values.forEach { it.cancel() }
        pulseJobs.clear()
        activePlayers.values.forEach { mp ->
            runCatching {
                if (mp.isPlaying) mp.stop()
                mp.release()
            }
        }
        activePlayers.clear()
        _pads.update { list -> list.map { if (it.isPlaying) it.copy(isPlaying = false) else it } }
    }

    fun addCustomSampler(uri: Uri, customLabel: String? = null) {
        scope.launch(Dispatchers.IO) {
            val padId = "custom-${System.currentTimeMillis()}"
            val displayName = resolveDisplayName(uri)
            val destFile = copyUriToSamplerFile(uri, padId, displayName)
            if (destFile == null) {
                withContext(Dispatchers.Main) {
                    onError("Could not read selected audio file.")
                }
                return@launch
            }

            val cleanLabel = deriveShortLabel(customLabel ?: displayName)
            val newPad = SamplerPadState(
                id = padId,
                label = cleanLabel,
                sourceType = SamplerSourceType.CUSTOM_FILE,
                builtinIndex = null,
                filePath = destFile.absolutePath,
                fileName = displayName,
                volume = 0.95f,
                loop = false,
                isPlaying = false
            )
            _pads.update { it + newPad }
            preloadPadIntoSoundPool(newPad)
            saveConfigToDisk()
        }
    }

    fun replaceSampler(padId: String, uri: Uri, customLabel: String? = null) {
        scope.launch(Dispatchers.IO) {
            val existing = _pads.value.firstOrNull { it.id == padId } ?: return@launch
            stopPad(padId)
            val displayName = resolveDisplayName(uri)
            val destFile = copyUriToSamplerFile(uri, padId, displayName)
            if (destFile == null) {
                withContext(Dispatchers.Main) {
                    onError("Could not import audio file for ${existing.label}.")
                }
                return@launch
            }

            val cleanLabel = deriveShortLabel(customLabel ?: displayName)
            val updated = existing.copy(
                label = cleanLabel,
                sourceType = SamplerSourceType.CUSTOM_FILE,
                filePath = destFile.absolutePath,
                fileName = displayName,
                isPlaying = false
            )
            _pads.update { list -> list.map { if (it.id == padId) updated else it } }
            preloadPadIntoSoundPool(updated)
            saveConfigToDisk()
        }
    }

    fun updateSamplerSettings(padId: String, label: String, volume: Float, loop: Boolean) {
        val cleanLabel = label.trim().take(16).uppercase()
        _pads.update { list ->
            list.map { pad ->
                if (pad.id != padId) pad
                else pad.copy(
                    label = if (cleanLabel.isNotEmpty()) cleanLabel else pad.label,
                    volume = volume.coerceIn(0.05f, 1.0f),
                    loop = loop
                )
            }
        }
        activePlayers[padId]?.let { mp ->
            runCatching {
                val v = volume.coerceIn(0f, 1f)
                mp.setVolume(v, v)
                mp.isLooping = loop
            }
        }
        scope.launch(Dispatchers.IO) { saveConfigToDisk() }
    }

    fun resetOrDeleteSampler(padId: String) {
        stopPad(padId)
        scope.launch(Dispatchers.IO) {
            soundIds.remove(padId)?.let { sid -> runCatching { soundPool.unload(sid) } }
            val current = _pads.value.firstOrNull { it.id == padId }
            if (current?.filePath != null && current.sourceType == SamplerSourceType.CUSTOM_FILE) {
                runCatching { File(current.filePath).delete() }
            }
            val builtinDefault = defaultBuiltins.firstOrNull { it.id == padId }
            if (builtinDefault != null) {
                _pads.update { list -> list.map { if (it.id == padId) builtinDefault else it } }
                preloadPadIntoSoundPool(builtinDefault)
            } else {
                _pads.update { list -> list.filterNot { it.id == padId } }
            }
            saveConfigToDisk()
        }
    }

    private fun pulsePadIndicator(padId: String, durationMs: Long) {
        pulseJobs.remove(padId)?.cancel()
        setPadPlaying(padId, true)
        pulseJobs[padId] = scope.launch {
            delay(durationMs)
            setPadPlaying(padId, false)
        }
    }

    private fun setPadPlaying(padId: String, playing: Boolean) {
        _pads.update { list ->
            list.map { if (it.id == padId) it.copy(isPlaying = playing) else it }
        }
    }

    private fun resolvePadFile(pad: SamplerPadState): File? {
        if (pad.sourceType == SamplerSourceType.CUSTOM_FILE && pad.filePath != null) {
            return File(pad.filePath)
        }
        val bIdx = pad.builtinIndex ?: return null
        return File(samplersFolder, "builtin_$bIdx.wav")
    }

    private fun preloadPadIntoSoundPool(pad: SamplerPadState) {
        val file = resolvePadFile(pad) ?: return
        if (!file.exists() || file.length() > 600_000L) return
        soundIds.remove(pad.id)?.let { old -> runCatching { soundPool.unload(old) } }
        val sid = runCatching { soundPool.load(file.absolutePath, 1) }.getOrNull() ?: 0
        if (sid > 0) soundIds[pad.id] = sid
    }

    private fun copyUriToSamplerFile(uri: Uri, padId: String, displayName: String): File? {
        val ext = displayName.substringAfterLast('.', "wav")
            .lowercase()
            .take(6)
            .ifBlank { "wav" }
        val target = File(samplersFolder, "${padId}.$ext")
        return runCatching {
            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(target).use { output ->
                    input.copyTo(output)
                }
            } ?: return null
            if (target.length() <= 0L) {
                target.delete()
                null
            } else {
                target
            }
        }.getOrNull()
    }

    private fun resolveDisplayName(uri: Uri): String {
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) {
                        val name = c.getString(idx)
                        if (!name.isNullOrBlank()) return name
                    }
                }
            }
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "Sample.wav"
    }

    private fun deriveShortLabel(rawName: String): String {
        val noExt = rawName.substringBeforeLast('.').replace('_', ' ').replace('-', ' ').trim()
        return if (noExt.isBlank()) "SAMPLE" else noExt.take(14).uppercase()
    }

    private fun saveConfigToDisk() {
        runCatching {
            val arr = JSONArray()
            _pads.value.forEach { pad ->
                arr.put(JSONObject().apply {
                    put("id", pad.id)
                    put("label", pad.label)
                    put("sourceType", pad.sourceType.name)
                    if (pad.builtinIndex != null) put("builtinIndex", pad.builtinIndex)
                    if (pad.filePath != null) put("filePath", pad.filePath)
                    if (pad.fileName != null) put("fileName", pad.fileName)
                    put("volume", pad.volume.toDouble())
                    put("loop", pad.loop)
                })
            }
            configFile.writeText(arr.toString())
        }
    }

    private fun loadConfigFromDisk(): List<SamplerPadState>? {
        if (!configFile.exists()) return null
        return runCatching {
            val arr = JSONArray(configFile.readText())
            val result = mutableListOf<SamplerPadState>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val src = runCatching {
                    SamplerSourceType.valueOf(obj.optString("sourceType", "BUILTIN"))
                }.getOrDefault(SamplerSourceType.BUILTIN)
                val bIdx = if (obj.has("builtinIndex")) obj.optInt("builtinIndex") else null
                val fPath = if (obj.has("filePath")) obj.optString("filePath") else null
                val fName = if (obj.has("fileName")) obj.optString("fileName") else null
                // If custom file was deleted externally, skip broken custom slot or revert builtin
                if (src == SamplerSourceType.CUSTOM_FILE && (fPath == null || !File(fPath).exists())) {
                    val fallback = defaultBuiltins.firstOrNull { it.id == obj.optString("id") }
                    if (fallback != null) result.add(fallback)
                    continue
                }
                result.add(
                    SamplerPadState(
                        id = obj.getString("id"),
                        label = obj.getString("label"),
                        sourceType = src,
                        builtinIndex = bIdx,
                        filePath = fPath,
                        fileName = fName,
                        volume = obj.optDouble("volume", 0.9).toFloat().coerceIn(0.05f, 1.0f),
                        loop = obj.optBoolean("loop", false),
                        isPlaying = false
                    )
                )
            }
            result.ifEmpty { null }
        }.getOrNull()
    }

    private fun ensureBuiltinWavsGenerated() {
        val sr = 44100
        for (idx in 0..7) {
            val out = File(samplersFolder, "builtin_$idx.wav")
            if (out.exists() && out.length() > 128L) continue
            val samples = synthesizeBuiltinSamples(idx, sr)
            writeMonoWav(out, sr, samples)
        }
    }

    private fun synthesizeBuiltinSamples(idx: Int, sr: Int): ShortArray {
        val durationSec = when (idx) {
            0 -> 0.28f
            1 -> 0.20f
            2 -> 0.08f
            3 -> 0.22f
            4 -> 0.45f
            5 -> 0.60f
            6 -> 0.65f
            else -> 0.52f
        }
        val count = (sr * durationSec).toInt().coerceAtLeast(1)
        val out = ShortArray(count)
        var phase = 0.0
        val rng = Random(100 + idx)

        for (i in 0 until count) {
            val t = i.toFloat() / sr
            val norm = i.toFloat() / count
            val v = when (idx) {
                0 -> { // KICK
                    val freq = 42.0 + 105.0 * exp(-t * 22.0)
                    phase += 2.0 * PI * freq / sr
                    sin(phase) * exp(-t * 9.0) * 0.9
                }
                1 -> { // SNARE
                    val body = sin(2.0 * PI * 185.0 * t) * exp(-t * 18.0) * 0.45
                    val noise = (rng.nextDouble() * 2.0 - 1.0) * exp(-t * 12.0) * 0.55
                    body + noise
                }
                2 -> { // HAT
                    val noise = (rng.nextDouble() * 2.0 - 1.0) * exp(-t * 42.0)
                    val prevNoise = if (i > 0) out[i - 1] / 32767.0 else 0.0
                    (noise - prevNoise * 0.6) * 0.65
                }
                3 -> { // CLAP
                    val burstEnv = if (t < 0.045f) {
                        if ((i / (sr / 85)) % 2 == 0) 0.9 else 0.25
                    } else exp(-(t - 0.045f) * 14.0)
                    (rng.nextDouble() * 2.0 - 1.0) * burstEnv * 0.7
                }
                4 -> { // HORN
                    val f1 = 440.0 + 24.0 * norm
                    val f2 = 554.0 + 28.0 * norm
                    val saw1 = ((f1 * t) % 1.0) * 2.0 - 1.0
                    val saw2 = ((f2 * t) % 1.0) * 2.0 - 1.0
                    (saw1 + saw2) * 0.28 * (1.0 - norm.toDouble().pow(4.0))
                }
                5 -> { // SIREN
                    val freq = 540.0 + 480.0 * sin(PI * norm)
                    phase += 2.0 * PI * freq / sr
                    sin(phase) * 0.45 * (1.0 - norm * 0.25)
                }
                6 -> { // RISER
                    val freq = 180.0 + 1020.0 * norm * norm
                    phase += 2.0 * PI * freq / sr
                    val saw = ((phase / (2.0 * PI)) % 1.0) * 2.0 - 1.0
                    saw * 0.35 * (0.2 + 0.8 * norm) * (1.0 - (norm - 0.85).coerceAtLeast(0.0) * 6.0)
                }
                else -> { // DROP
                    val freq = 220.0 * exp(-t * 4.5).coerceAtLeast(0.15)
                    phase += 2.0 * PI * freq / sr
                    sin(phase) * exp(-t * 3.8) * 0.85
                }
            }
            out[i] = (v * 32767.0).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return out
    }

    private fun writeMonoWav(file: File, sampleRate: Int, samples: ShortArray) {
        val dataBytes = samples.size * 2
        val buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray())
        buf.putInt(36 + dataBytes)
        buf.put("WAVE".toByteArray())
        buf.put("fmt ".toByteArray())
        buf.putInt(16)
        buf.putShort(1.toShort())
        buf.putShort(1.toShort())
        buf.putInt(sampleRate)
        buf.putInt(sampleRate * 2)
        buf.putShort(2.toShort())
        buf.putShort(16.toShort())
        buf.put("data".toByteArray())
        buf.putInt(dataBytes)
        samples.forEach { buf.putShort(it) }
        FileOutputStream(file).use { it.write(buf.array()) }
    }

    fun release() {
        stopAll()
        runCatching { soundPool.release() }
    }
}
