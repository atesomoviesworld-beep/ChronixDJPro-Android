package com.chronixdj.pro.audio

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.PresetReverb
import com.chronixdj.pro.model.FxSlotState
import com.chronixdj.pro.model.FxType
import kotlin.math.roundToInt

/**
 * Attaches native Android AudioEffect DSP (Equalizer, BassBoost, PresetReverb)
 * directly to an ExoPlayer audioSessionId for real 3-band EQ, Sweep Filter, and FX.
 */
class DeckAudioEffectsProcessor {

    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var presetReverb: PresetReverb? = null
    private var attachedSessionId: Int = 0

    fun attachToSession(audioSessionId: Int) {
        if (audioSessionId <= 0 || audioSessionId == attachedSessionId) return
        release()
        attachedSessionId = audioSessionId
        runCatching {
            equalizer = Equalizer(0, audioSessionId).apply { enabled = true }
            bassBoost = BassBoost(0, audioSessionId).apply { enabled = true }
            presetReverb = PresetReverb(0, audioSessionId).apply {
                preset = PresetReverb.PRESET_NONE
                enabled = true
            }
        }
    }

    fun applyEqAndFilter(
        eqLow: Float,
        eqMid: Float,
        eqHigh: Float,
        filterValue: Float,
        fxSlots: List<FxSlotState>
    ) {
        val eq = equalizer ?: return
        runCatching {
            val bands = eq.numberOfBands.toInt()
            if (bands <= 0) return
            val range = eq.bandLevelRange
            val minLevel = range[0].toFloat()
            val maxLevel = range[1].toFloat()

            // Map Filter knob: <0.48 rolls off highs (LPF), >0.52 rolls off lows (HPF)
            val lpfCut = if (filterValue < 0.48f) (0.48f - filterValue) / 0.48f else 0f
            val hpfCut = if (filterValue > 0.52f) (filterValue - 0.52f) / 0.48f else 0f

            val hpFxActive = fxSlots.any { it.type == FxType.HIGH_PASS && it.enabled }
            val lpFxActive = fxSlots.any { it.type == FxType.LOW_PASS && it.enabled }
            val flangerOn = fxSlots.any { it.type == FxType.FLANGER && it.enabled }

            for (band in 0 until bands) {
                val centerHz = eq.getCenterFreq(band.toShort()) / 1000
                var norm = when {
                    centerHz < 300 -> eqLow * (1f - hpfCut * 0.95f) * (if (hpFxActive) 0.15f else 1f)
                    centerHz < 2400 -> (eqMid + if (flangerOn) 0.14f else 0f) * (1f - (lpfCut * 0.45f) - (hpfCut * 0.35f))
                    else -> (eqHigh + if (flangerOn) 0.18f else 0f) * (1f - lpfCut * 0.95f) * (if (lpFxActive) 0.15f else 1f)
                }.coerceIn(0f, 1f)

                // Map 0..1 where 0.5 is 0dB center
                val targetLevel = if (norm < 0.5f) {
                    minLevel * (1f - norm * 2f)
                } else {
                    maxLevel * ((norm - 0.5f) * 2f)
                }
                eq.setBandLevel(band.toShort(), targetLevel.roundToInt().coerceIn(range[0].toInt(), range[1].toInt()).toShort())
            }

            bassBoost?.let { bb ->
                if (bb.strengthSupported) {
                    val strength = ((eqLow - 0.5f).coerceAtLeast(0f) * 2f * 850f).roundToInt().coerceIn(0, 1000)
                    bb.setStrength(strength.toShort())
                }
            }

            val reverbOn = fxSlots.any { it.type == FxType.REVERB_OUT && it.enabled }
            val echoOn = fxSlots.any { it.type == FxType.ECHO_OUT && it.enabled }
            presetReverb?.let { rv ->
                rv.preset = when {
                    reverbOn -> PresetReverb.PRESET_LARGEHALL
                    echoOn -> PresetReverb.PRESET_MEDIUMROOM
                    flangerOn -> PresetReverb.PRESET_SMALLROOM
                    else -> PresetReverb.PRESET_NONE
                }
            }
        }
    }

    fun release() {
        runCatching { equalizer?.release() }
        runCatching { bassBoost?.release() }
        runCatching { presetReverb?.release() }
        equalizer = null
        bassBoost = null
        presetReverb = null
        attachedSessionId = 0
    }
}
