import {StemType, WaveformPeak} from '../types/dj';

const KEY_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
];

export interface AnalyzedAudio {
  bpm: number;
  beatOffsetSec: number;
  musicalKey: string;
  waveform: WaveformPeak[];
}

export function analyzeAudioBuffer(buffer: AudioBuffer, titleSeed = '', targetBuckets = 320): AnalyzedAudio {
  const sampleRate = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  const maxAnalyzeSamples = Math.min(ch0.length, sampleRate * 35);
  // High-resolution (~5.8ms) onset window for sub-0.1 BPM accuracy across 75..175 BPM
  const windowSize = Math.max(128, Math.floor(sampleRate / 172));
  const wps = sampleRate / windowSize;
  const energy: number[] = [];
  const low: number[] = [];

  let prev = 0;
  let lpPrev = 0;
  const lpAlpha = 0.04;
  for (let i = 0; i < maxAnalyzeSamples; i += windowSize) {
    const end = Math.min(maxAnalyzeSamples, i + windowSize);
    let sumSq = 0;
    let lowSq = 0;
    const count = end - i;
    for (let j = i; j < end; j++) {
      const m = (ch0[j] + ch1[j]) * 0.5;
      sumSq += m * m;
      lpPrev += lpAlpha * (m - lpPrev);
      lowSq += lpPrev * lpPrev;
      prev = m;
    }
    const rms = Math.sqrt(sumSq / count);
    const lowRms = Math.sqrt(lowSq / count);
    energy.push(Math.min(1, rms * 2.5 + Math.abs(prev) * 0.01));
    low.push(Math.min(1, lowRms * 3.0));
  }

  let bpm = 124.0;
  let beatOffsetSec = 0;
  if (energy.length > 160) {
    const flux = new Float32Array(energy.length);
    for (let i = 1; i < energy.length; i++) {
      const de = Math.max(0, energy[i] - energy[i - 1]);
      const dl = Math.max(0, low[i] - low[i - 1]);
      flux[i] = dl * 0.65 + de * 0.35;
    }

    const minLag = Math.max(4, Math.floor((60 / 172) * wps));
    const maxLag = Math.min(Math.floor(flux.length / 2.5), Math.ceil((60 / 74) * wps));
    const corrArr = new Float32Array(maxLag + 2);
    let bestLag = minLag;
    let bestScore = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let c1 = 0;
      const limit = flux.length - lag * 2;
      for (let i = 0; i < limit; i++) {
        c1 += flux[i] * flux[i + lag];
      }
      // Harmonic reinforcement at 2x period stabilizes 80 vs 160 / 96 vs 192 choices
      let c2 = 0;
      if (lag * 2 < flux.length) {
        const lim2 = flux.length - lag * 2;
        for (let i = 0; i < lim2; i++) {
          c2 += flux[i] * flux[i + lag * 2];
        }
      }
      const score = c1 + c2 * 0.55;
      corrArr[lag] = score;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    // Parabolic interpolation around bestLag for sub-window BPM precision
    let refinedLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const sL = corrArr[bestLag - 1];
      const sC = corrArr[bestLag];
      const sR = corrArr[bestLag + 1];
      const denom = sL - 2 * sC + sR;
      if (Math.abs(denom) > 1e-6) {
        const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (sL - sR)) / denom));
        refinedLag = bestLag + delta;
      }
    }

    bpm = (60 * wps) / refinedLag;
    while (bpm < 78) bpm *= 2;
    while (bpm > 168) bpm /= 2;
    bpm = Math.round(bpm * 10) / 10;

    // Beatgrid first-beat phase anchor detection across [0, beatSec)
    const beatSec = 60 / bpm;
    const phaseBins = 48;
    let bestPhaseBin = 0;
    let bestPhaseScore = -1;
    const beatsToScan = Math.min(32, Math.floor((energy.length / wps) / beatSec));
    for (let bin = 0; bin < phaseBins; bin++) {
      const candidateOffsetSec = (bin / phaseBins) * beatSec;
      let pScore = 0;
      for (let b = 0; b < beatsToScan; b++) {
        const idx = Math.round((candidateOffsetSec + b * beatSec) * wps);
        if (idx >= 0 && idx < flux.length) {
          const prevIdx = Math.max(0, idx - 1);
          const nextIdx = Math.min(flux.length - 1, idx + 1);
          pScore += flux[idx] + flux[prevIdx] * 0.45 + flux[nextIdx] * 0.45;
        }
      }
      if (pScore > bestPhaseScore) {
        bestPhaseScore = pScore;
        bestPhaseBin = bin;
      }
    }
    const rawOffset = (bestPhaseBin / phaseBins) * beatSec;
    // Snap near-zero grid starts (< 14ms) cleanly to 0.000s
    beatOffsetSec = rawOffset < 0.014 || beatSec - rawOffset < 0.014 ? 0 : Number(rawOffset.toFixed(4));
  }

  // Full-track waveform extraction
  const totalLen = ch0.length;
  const bucketSize = Math.max(1, Math.floor(totalLen / targetBuckets));
  const waveform: WaveformPeak[] = [];
  for (let b = 0; b < targetBuckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(totalLen, start + bucketSize);
    const stride = Math.max(1, Math.floor((end - start) / 48));
    let maxA = 0;
    let maxD = 0;
    let p = 0;
    for (let idx = start; idx < end; idx += stride) {
      const val = Math.abs((ch0[idx] + ch1[idx]) * 0.5);
      if (val > maxA) maxA = val;
      const d = Math.abs(val - p);
      if (d > maxD) maxD = d;
      p = val;
    }
    const amp = Math.min(1, Math.max(0.05, maxA * 1.15));
    const hi = Math.min(1, maxD * 1.5);
    const lo = Math.min(1, Math.max(0.05, amp - hi * 0.35));
    waveform.push({
      amplitude: amp,
      lowEnergy: lo,
      midEnergy: Math.min(1, (amp + lo + hi) / 3),
      highEnergy: hi,
    });
  }

  let hash = 0;
  for (let i = 0; i < titleSeed.length; i++) {
    hash = (hash * 31 + titleSeed.charCodeAt(i)) | 0;
  }
  const musicalKey = KEY_NAMES[Math.abs(hash) % KEY_NAMES.length];

  return {bpm, beatOffsetSec, musicalKey, waveform};
}

export interface StudioTrackPreset {
  id: string;
  title: string;
  bpm: number;
  musicalKey: string;
  bars: number;
  rootHz: number;
  style: 'HOUSE' | 'AFRO' | 'TECHNO';
}

export const STUDIO_TRACK_PRESETS: StudioTrackPreset[] = [
  {
    id: 'house-124',
    title: 'Chronix_Midnight_Groove_(Studio_Mix)',
    bpm: 124,
    musicalKey: 'Am',
    bars: 8,
    rootHz: 110,
    style: 'HOUSE',
  },
  {
    id: 'afro-102',
    title: 'Zero_Pro_Lagos_Sunlight_(96_Groove)',
    bpm: 96,
    musicalKey: 'G#',
    bars: 8,
    rootHz: 103.83,
    style: 'AFRO',
  },
  {
    id: 'techno-132',
    title: 'Obsidian_Warehouse_Drive_132',
    bpm: 132,
    musicalKey: 'Dm',
    bars: 8,
    rootHz: 73.42,
    style: 'TECHNO',
  },
  {
    id: 'hiphop-80',
    title: 'Emma_Sub_Bounce_80_BPM',
    bpm: 80,
    musicalKey: 'Cm',
    bars: 8,
    rootHz: 65.41,
    style: 'AFRO',
  },
  {
    id: 'moombahton-110',
    title: 'Solar_Club_Groove_110_BPM',
    bpm: 110,
    musicalKey: 'F#m',
    bars: 8,
    rootHz: 92.5,
    style: 'HOUSE',
  },
  {
    id: 'techhouse-125',
    title: 'Mainstage_Drive_125_BPM',
    bpm: 125,
    musicalKey: 'Em',
    bars: 8,
    rootHz: 82.41,
    style: 'HOUSE',
  },
  {
    id: 'hard-140',
    title: 'Velocity_Peak_140_BPM',
    bpm: 140,
    musicalKey: 'Bm',
    bars: 8,
    rootHz: 123.47,
    style: 'TECHNO',
  },
];

export function synthesizeStudioTrack(ctx: AudioContext, preset: StudioTrackPreset): AudioBuffer {
  const stems = synthesizeStemPack(ctx, preset);
  const len = stems.DRUMS.length;
  const out = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const dest = out.getChannelData(c);
    const d = stems.DRUMS.getChannelData(c);
    const b = stems.BASS.getChannelData(c);
    const inst = stems.INSTRUMENTAL.getChannelData(c);
    const v = stems.VOCALS.getChannelData(c);
    for (let i = 0; i < len; i++) {
      dest[i] = Math.tanh((d[i] * 0.9 + b[i] * 0.8 + inst[i] * 0.65 + v[i] * 0.6) * 0.72);
    }
  }
  return out;
}

export function synthesizeStemPack(
  ctx: AudioContext,
  preset: StudioTrackPreset
): Record<StemType, AudioBuffer> {
  const sr = ctx.sampleRate;
  const secPerBeat = 60 / preset.bpm;
  const totalBeats = preset.bars * 4;
  const totalSamples = Math.floor(totalBeats * secPerBeat * sr);

  const drums = ctx.createBuffer(2, totalSamples, sr);
  const bass = ctx.createBuffer(2, totalSamples, sr);
  const instrumental = ctx.createBuffer(2, totalSamples, sr);
  const vocals = ctx.createBuffer(2, totalSamples, sr);

  const dL = drums.getChannelData(0);
  const dR = drums.getChannelData(1);
  const bL = bass.getChannelData(0);
  const bR = bass.getChannelData(1);
  const iL = instrumental.getChannelData(0);
  const iR = instrumental.getChannelData(1);
  const vL = vocals.getChannelData(0);
  const vR = vocals.getChannelData(1);

  const chordRatios = [1, 1.1892, 1.4983, 1.7818];
  const bassPattern = [1, 1, 1.3348, 1.1892, 1, 1.4983, 1.1892, 1.3348];

  for (let n = 0; n < totalSamples; n++) {
    const t = n / sr;
    const beatFloat = t / secPerBeat;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat);
    const sixteenthPhase = sixteenthFloat - sixteenthIdx;

    // 1. DRUMS STEM (Kick + Clap/Snare + Crisp Offbeat Hi-Hat)
    let kick = 0;
    const kickTrigger = preset.style === 'AFRO'
      ? (beatIndex % 4 === 0 || beatIndex % 4 === 2 || (sixteenthIdx % 16 === 6 && sixteenthPhase < 0.9))
      : true;
    if (kickTrigger && beatPhase < 0.45) {
      const kEnv = Math.exp(-beatPhase * 12);
      const kFreq = 46 + 115 * Math.exp(-beatPhase * 28);
      kick = Math.sin(2 * Math.PI * kFreq * (beatPhase * secPerBeat)) * kEnv * 0.9;
    }
    let snare = 0;
    if ((beatIndex % 2 === 1) && beatPhase < 0.25) {
      const sEnv = Math.exp(-beatPhase * 18);
      const noise = Math.sin(n * 12.9898) * 43758.5453;
      const white = (noise - Math.floor(noise)) * 2 - 1;
      snare = (white * 0.55 + Math.sin(2 * Math.PI * 195 * t) * 0.45) * sEnv * 0.55;
    }
    let hat = 0;
    if ((sixteenthIdx % 2 === 1) && sixteenthPhase < 0.35) {
      const hEnv = Math.exp(-sixteenthPhase * 20);
      const noise = Math.sin(n * 78.233) * 19341.12;
      const white = (noise - Math.floor(noise)) * 2 - 1;
      hat = white * hEnv * 0.25;
    }
    const drumSample = kick + snare + hat;
    dL[n] = drumSample;
    dR[n] = drumSample * 0.98 + hat * 0.1;

    // 2. BASS STEM (Sub + Punchy FM Bassline)
    const bassNote = preset.rootHz * 0.5 * bassPattern[Math.floor(beatIndex / 2) % bassPattern.length];
    const bassEnv = Math.exp(-sixteenthPhase * 3.5);
    const bassMod = Math.sin(2 * Math.PI * bassNote * 2 * t) * 1.4 * bassEnv;
    const bassSample = Math.sin(2 * Math.PI * bassNote * t + bassMod) * bassEnv * 0.68;
    bL[n] = bassSample;
    bR[n] = bassSample;

    // 3. INSTRUMENTAL STEM (Warm Stereo Pad Chords + Arpeggio)
    const barIdx = Math.floor(beatIndex / 4);
    const rootShift = barIdx % 4 === 2 ? 1.122 : barIdx % 4 === 3 ? 0.891 : 1.0;
    const sidechain = 0.45 + 0.55 * Math.min(1, beatPhase * 2.2);
    let chordSum = 0;
    for (let c = 0; c < chordRatios.length; c++) {
      const f = preset.rootHz * 2 * chordRatios[c] * rootShift;
      chordSum += Math.sin(2 * Math.PI * f * t + (c * 0.4)) * 0.14;
    }
    const arpFreq = preset.rootHz * 4 * chordRatios[sixteenthIdx % chordRatios.length] * rootShift;
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * Math.exp(-sixteenthPhase * 5) * 0.2;
    iL[n] = (chordSum + arp) * sidechain;
    iR[n] = (chordSum * 0.95 - arp * 0.85) * sidechain;

    // 4. VOCALS STEM (Formant-Filtered Melodic Vocal Synth Phrase)
    const phraseActive = (barIdx % 2 === 1);
    if (phraseActive) {
      const vFreq = preset.rootHz * 4 * (beatIndex % 4 === 0 ? 1.5 : beatIndex % 4 === 1 ? 1.334 : 1.189);
      const vibrato = Math.sin(2 * Math.PI * 5.4 * t) * 0.015;
      const carrier = Math.sin(2 * Math.PI * vFreq * (1 + vibrato) * t);
      const formant1 = Math.sin(2 * Math.PI * 720 * t) * 0.5;
      const formant2 = Math.sin(2 * Math.PI * 1440 * t) * 0.25;
      const vEnv = Math.sin(Math.PI * Math.min(1, beatPhase * 1.1)) * 0.45;
      const vox = (carrier * 0.65 + carrier * (formant1 + formant2) * 0.5) * vEnv;
      vL[n] = vox;
      vR[n] = vox;
    }
  }

  return {
    VOCALS: vocals,
    DRUMS: drums,
    BASS: bass,
    INSTRUMENTAL: instrumental,
  };
}
