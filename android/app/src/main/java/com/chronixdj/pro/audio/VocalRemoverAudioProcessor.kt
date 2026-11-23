package com.chronixdj.pro.audio

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import com.chronixdj.pro.model.DeckStemSelection
import com.chronixdj.pro.model.VocalMode
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs

/**
 * Real-time 4-Stem PCM Stereo AudioProcessor for Media3 ExoPlayer:
 * - VOCALS (ACAPEL): Center-weighted Mid channel bandpass [230Hz..4800Hz] with side & transient suppression.
 * - DRUMS: Percussive transient kick punch + snare snap + hi-hat shimmer (>5.4kHz).
 * - BASS: Cascaded low-pass (<175Hz) mono bassline.
 * - MELODY: Harmonic stereo side & mid instrument bed minus center vocals and sharp transients.
 * When stemBypassed == true, passes bit-exact original audio.
 */
@OptIn(UnstableApi::class)
class VocalRemoverAudioProcessor : BaseAudioProcessor() {

    @Volatile
    var vocalMode: VocalMode = VocalMode.OFF

    @Volatile
    var stemBypassed: Boolean = true

    @Volatile
    var activeStems: DeckStemSelection = DeckStemSelection()

    @Volatile
    var frameTap: ((ByteArray, Int, Int) -> Unit)? = null

    private var bass1 = 0f
    private var bass2 = 0f
    private var bassL = 0f
    private var bassR = 0f
    private var kickLp = 0f
    private var voxHpY = 0f
    private var voxPrevX = 0f
    private var voxLp1 = 0f
    private var voxLp2 = 0f
    private var snareHpY = 0f
    private var snarePrevX = 0f
    private var snareLpY = 0f
    private var hatHpL = 0f
    private var hatPrevL = 0f
    private var hatHpR = 0f
    private var hatPrevR = 0f
    private var fastEnv = 0f
    private var slowEnv = 0f
    private var midEnergy = 0f
    private var sideEnergy = 0f

    override fun onConfigure(inputAudioFormat: AudioFormat): AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT || inputAudioFormat.channelCount != 2) {
            return AudioFormat.NOT_SET
        }
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return

        val stems = activeStems
        val bypass = stemBypassed && vocalMode == VocalMode.OFF

        val out = replaceOutputBuffer(remaining)
        if (bypass) {
            out.put(inputBuffer)
            out.flip()
            emitFrameTap(out)
            return
        }

        val sr = inputAudioFormat.sampleRate.toFloat().coerceAtLeast(44100f)
        val dt = 1f / sr
        fun lp(hz: Float): Float {
            val rc = 1f / (2f * PI.toFloat() * hz)
            return dt / (rc + dt)
        }
        fun hp(hz: Float): Float {
            val rc = 1f / (2f * PI.toFloat() * hz)
            return rc / (rc + dt)
        }

        val aBass = lp(175f)
        val aKick = lp(115f)
        val aVoxHp = hp(230f)
        val aVoxLp = lp(4800f)
        val aHatHp = hp(5400f)
        val aSnareHp = hp(190f)
        val aSnareLp = lp(2600f)
        val aFastEnv = lp(45f)
        val aSlowEnv = lp(7f)
        val aStereoEnv = lp(14f)

        val enV = if (!stemBypassed) stems.vocals else (vocalMode != VocalMode.REMOVE_ACAPELLA)
        val enD = if (!stemBypassed) stems.drums else (vocalMode != VocalMode.ACAPELLA_ONLY)
        val enB = if (!stemBypassed) stems.bass else (vocalMode != VocalMode.ACAPELLA_ONLY)
        val enM = if (!stemBypassed) stems.melody else (vocalMode != VocalMode.ACAPELLA_ONLY)

        while (inputBuffer.remaining() >= 4) {
            val l = inputBuffer.short.toFloat() / 32768f
            val r = inputBuffer.short.toFloat() / 32768f

            val mid = (l + r) * 0.5f
            val side = (l - r) * 0.5f

            bass1 += aBass * (mid - bass1)
            bass2 += aBass * (bass1 - bass2)
            bassL += aBass * (l - bassL)
            bassR += aBass * (r - bassR)
            val hiL = l - bassL
            val hiR = r - bassR

            val absMid = abs(mid)
            fastEnv += aFastEnv * (absMid - fastEnv)
            slowEnv += aSlowEnv * (absMid - slowEnv)
            val transientRatio = ((fastEnv - slowEnv * 1.08f) / (slowEnv + 0.015f)).coerceAtLeast(0f)
            val drumGate = (transientRatio * 1.25f).coerceIn(0f, 1f)

            kickLp += aKick * (mid - kickLp)
            val kickStem = kickLp * (0.3f + drumGate * 0.9f).coerceAtMost(1f)

            snareHpY = aSnareHp * (snareHpY + mid - snarePrevX)
            snarePrevX = mid
            snareLpY += aSnareLp * (snareHpY - snareLpY)
            val snareTransient = snareLpY * (drumGate * 0.88f).coerceAtMost(1f)

            hatHpL = aHatHp * (hatHpL + l - hatPrevL)
            hatPrevL = l
            hatHpR = aHatHp * (hatHpR + r - hatPrevR)
            hatPrevR = r

            val dOutL = (kickStem + snareTransient + hatHpL * 0.92f).coerceIn(-1f, 1f)
            val dOutR = (kickStem + snareTransient + hatHpR * 0.92f).coerceIn(-1f, 1f)
            val bOut = (bass2 * (1f - drumGate * 0.42f)).coerceIn(-1f, 1f)

            midEnergy += aStereoEnv * (abs(mid) - midEnergy)
            sideEnergy += aStereoEnv * (abs(side) - sideEnergy)
            val centerDominance = ((midEnergy * 1.2f - sideEnergy * 0.65f) / (midEnergy + sideEnergy + 0.008f)).coerceIn(0.06f, 1f)

            voxHpY = aVoxHp * (voxHpY + mid - voxPrevX)
            voxPrevX = mid
            voxLp1 += aVoxLp * (voxHpY - voxLp1)
            voxLp2 += aVoxLp * (voxLp1 - voxLp2)
            val vOut = (voxLp2 * centerDominance * (1f - drumGate * 0.55f) * 1.15f).coerceIn(-1f, 1f)

            val mOutL = (hiL - vOut * 0.9f - dOutL * 0.45f + side * 0.25f).coerceIn(-1f, 1f)
            val mOutR = (hiR - vOut * 0.9f - dOutR * 0.45f - side * 0.25f).coerceIn(-1f, 1f)

            var outL = 0f
            var outR = 0f
            if (enV) { outL += vOut; outR += vOut }
            if (enD) { outL += dOutL; outR += dOutR }
            if (enB) { outL += bOut; outR += bOut }
            if (enM) { outL += mOutL; outR += mOutR }

            val sL = (outL.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            val sR = (outR.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            out.putShort(sL)
            out.putShort(sR)
        }

        out.flip()
        emitFrameTap(out)
    }

    private fun emitFrameTap(out: ByteBuffer) {
        val tap = frameTap ?: return
        val bytes = ByteArray(out.remaining())
        out.mark()
        out.get(bytes)
        out.reset()
        tap(bytes, inputAudioFormat.sampleRate, inputAudioFormat.channelCount)
    }

    override fun onReset() {
        bass1 = 0f
        bass2 = 0f
        bassL = 0f
        bassR = 0f
        kickLp = 0f
        voxHpY = 0f
        voxPrevX = 0f
        voxLp1 = 0f
        voxLp2 = 0f
        snareHpY = 0f
        snarePrevX = 0f
        snareLpY = 0f
        hatHpL = 0f
        hatPrevL = 0f
        hatHpR = 0f
        hatPrevR = 0f
        fastEnv = 0f
        slowEnv = 0f
        midEnergy = 0f
        sideEnergy = 0f
    }
}
