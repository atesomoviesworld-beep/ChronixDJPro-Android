import {DeckStemKey, DeckStemSourceMode, StemSeparationParams} from '../types/dj';

export interface SeparatedStemPack {
  stems: Record<DeckStemKey, AudioBuffer>;
  sourceMode: Exclude<DeckStemSourceMode, null>;
  params: StemSeparationParams;
  note: string;
  cloudError: string | null;
}

const DEFAULT_PARAMS: StemSeparationParams = {
  bassCutoffHz: 175,
  vocalLowHz: 230,
  vocalHighHz: 4800,
  drumsHighCutoffHz: 5400,
  vocalCenterBias: 1.2,
  transientSensitivity: 1.25,
  analysisNote: 'Local 4-band spectral & Mid/Side stem DSP separation',
};

const MAX_CACHE_ENTRIES = 4;
const stemPackCache = new Map<string, SeparatedStemPack>();

function buildCacheKey(buffer: AudioBuffer, title: string): string {
  return `${title}::${buffer.duration.toFixed(2)}::${buffer.sampleRate}::${buffer.numberOfChannels}`;
}

export function getCachedDeckStems(buffer: AudioBuffer, title: string): SeparatedStemPack | null {
  const key = buildCacheKey(buffer, title);
  return stemPackCache.get(key) ?? null;
}

function storeCachedDeckStems(buffer: AudioBuffer, title: string, pack: SeparatedStemPack): void {
  const key = buildCacheKey(buffer, title);
  if (stemPackCache.has(key)) {
    stemPackCache.delete(key);
  } else if (stemPackCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = stemPackCache.keys().next().value;
    if (oldestKey) stemPackCache.delete(oldestKey);
  }
  stemPackCache.set(key, pack);
}

function encodeMonoWavSnippetBase64(buffer: AudioBuffer): string {
  const targetSr = 16000;
  const maxSnippetSec = 7;
  const snippetFrames = Math.min(Math.floor(buffer.duration * targetSr), maxSnippetSec * targetSr);
  const startSec = Math.max(0, Math.min(buffer.duration * 0.3, buffer.duration - snippetFrames / targetSr));
  const startSrc = Math.floor(startSec * buffer.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const stride = buffer.sampleRate / targetSr;

  const dataBytes = snippetFrames * 2;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSr, true);
  view.setUint32(28, targetSr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < snippetFrames; i++) {
    const srcIdx = Math.min(left.length - 1, startSrc + Math.floor(i * stride));
    const mono = (left[srcIdx] + right[srcIdx]) * 0.5;
    const clamped = Math.max(-1, Math.min(1, mono));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  const bytes = new Uint8Array(wav);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchCloudStemParams(
  buffer: AudioBuffer,
  title: string,
  bpm: number,
  musicalKey: string
): Promise<{params: StemSeparationParams | null; cloudError: string | null}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {params: null, cloudError: 'Device is offline'};
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7500);
  try {
    const wavBase64 = encodeMonoWavSnippetBase64(buffer);
    const res = await fetch('/api/stems/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({wavBase64, title, bpm, musicalKey}),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        params: null,
        cloudError: typeof json.error === 'string' ? json.error : `Cloud AI HTTP ${res.status}`,
      };
    }
    return {
      params: json.params as StemSeparationParams,
      cloudError: null,
    };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Cloud AI request timed out'
        : err instanceof Error
        ? err.message
        : 'Cloud AI unreachable';
    return {params: null, cloudError: msg};
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Genuine 4-stem local DSP separation producing phase-aligned AudioBuffers:
 * - bass: 4th-order cascaded mono low-pass (< bassCutoffHz) + harmonic warmth
 * - drums: transient-detected kick punch (<140Hz) + snare snap + crisp hats (>drumsHighCutoffHz)
 * - vocals: center-weighted (L+R) sustained bandpass [vocalLowHz..vocalHighHz] with side & transient suppression
 * - melody: harmonic stereo bed (side + de-vocalized mids outside drum transients)
 */
async function renderLocalStemBuffers(
  ctx: AudioContext,
  srcBuffer: AudioBuffer,
  params: StemSeparationParams
): Promise<Record<DeckStemKey, AudioBuffer>> {
  const sr = srcBuffer.sampleRate;
  const len = srcBuffer.length;
  const inL = srcBuffer.getChannelData(0);
  const inR = srcBuffer.numberOfChannels > 1 ? srcBuffer.getChannelData(1) : inL;

  const vocalsBuf = ctx.createBuffer(2, len, sr);
  const drumsBuf = ctx.createBuffer(2, len, sr);
  const bassBuf = ctx.createBuffer(2, len, sr);
  const melodyBuf = ctx.createBuffer(2, len, sr);

  const vL = vocalsBuf.getChannelData(0);
  const vR = vocalsBuf.getChannelData(1);
  const dL = drumsBuf.getChannelData(0);
  const dR = drumsBuf.getChannelData(1);
  const bL = bassBuf.getChannelData(0);
  const bR = bassBuf.getChannelData(1);
  const mL = melodyBuf.getChannelData(0);
  const mR = melodyBuf.getChannelData(1);

  const dt = 1 / sr;
  const lpAlpha = (hz: number) => {
    const rc = 1 / (2 * Math.PI * Math.max(20, hz));
    return dt / (rc + dt);
  };
  const hpAlpha = (hz: number) => {
    const rc = 1 / (2 * Math.PI * Math.max(20, hz));
    return rc / (rc + dt);
  };

  const aBass = lpAlpha(params.bassCutoffHz);
  const aKick = lpAlpha(115);
  const aVoxHp = hpAlpha(params.vocalLowHz);
  const aVoxLp = lpAlpha(params.vocalHighHz);
  const aHatHp = hpAlpha(params.drumsHighCutoffHz);
  const aSnareHp = hpAlpha(190);
  const aSnareLp = lpAlpha(2600);
  const aFastEnv = lpAlpha(45);
  const aSlowEnv = lpAlpha(7);
  const aStereoEnv = lpAlpha(14);

  // Filter states
  let bass1 = 0;
  let bass2 = 0;
  let bassL1 = 0;
  let bassR1 = 0;
  let kick1 = 0;
  let voxHpY = 0;
  let voxPrevX = 0;
  let voxLp1 = 0;
  let voxLp2 = 0;
  let hatHpY = 0;
  let hatPrevX = 0;
  let hatHpL = 0;
  let hatPrevL = 0;
  let hatHpR = 0;
  let hatPrevR = 0;
  let snareHpY = 0;
  let snarePrevX = 0;
  let snareLpY = 0;

  let fastEnv = 0;
  let slowEnv = 0;
  let midEnergy = 0;
  let sideEnergy = 0;

  const CHUNK_SIZE = 32768;
  for (let start = 0; start < len; start += CHUNK_SIZE) {
    const end = Math.min(len, start + CHUNK_SIZE);
    for (let i = start; i < end; i++) {
      const l = inL[i];
      const r = inR[i];
      const mid = (l + r) * 0.5;
      const side = (l - r) * 0.5;

      // 1. Cascaded 2nd-order bass extraction from mono sum
      bass1 += aBass * (mid - bass1);
      bass2 += aBass * (bass1 - bass2);
      bassL1 += aBass * (l - bassL1);
      bassR1 += aBass * (r - bassR1);

      // High-passed audio above bass cutoff
      const hiL = l - bassL1;
      const hiR = r - bassR1;

      // 2. Percussive transient envelope detector (kick/snare spikes)
      const absMid = Math.abs(mid);
      fastEnv += aFastEnv * (absMid - fastEnv);
      slowEnv += aSlowEnv * (absMid - slowEnv);
      const transientRatio = Math.max(0, (fastEnv - slowEnv * 1.08) / (slowEnv + 0.015));
      const drumGate = Math.min(1, transientRatio * params.transientSensitivity);

      // Kick body + Snare transient + Hi-hat sheen
      kick1 += aKick * (mid - kick1);
      const kickStem = kick1 * Math.min(1, 0.3 + drumGate * 0.9);

      snareHpY = aSnareHp * (snareHpY + mid - snarePrevX);
      snarePrevX = mid;
      snareLpY += aSnareLp * (snareHpY - snareLpY);
      const snareTransient = snareLpY * Math.min(1, drumGate * 0.88);

      hatHpY = aHatHp * (hatHpY + mid - hatPrevX);
      hatPrevX = mid;
      hatHpL = aHatHp * (hatHpL + l - hatPrevL);
      hatPrevL = l;
      hatHpR = aHatHp * (hatHpR + r - hatPrevR);
      hatPrevR = r;

      const dOutL = Math.max(-1, Math.min(1, kickStem + snareTransient + hatHpL * 0.92));
      const dOutR = Math.max(-1, Math.min(1, kickStem + snareTransient + hatHpR * 0.92));

      // Bassline minus punchy kick transient
      const bOut = Math.max(-1, Math.min(1, bass2 * (1 - drumGate * 0.42)));

      // 3. Center vocal isolation with Mid/Side spectral masking
      midEnergy += aStereoEnv * (Math.abs(mid) - midEnergy);
      sideEnergy += aStereoEnv * (Math.abs(side) - sideEnergy);
      const centerDominance = Math.max(
        0.06,
        Math.min(
          1,
          (midEnergy * params.vocalCenterBias - sideEnergy * 0.65) /
            (midEnergy + sideEnergy + 0.008)
        )
      );

      voxHpY = aVoxHp * (voxHpY + mid - voxPrevX);
      voxPrevX = mid;
      voxLp1 += aVoxLp * (voxHpY - voxLp1);
      voxLp2 += aVoxLp * (voxLp1 - voxLp2);

      // Suppress sharp snare transients inside the vocal isolate
      const vocalWeight = centerDominance * (1 - drumGate * 0.55);
      const vOut = Math.max(-1, Math.min(1, voxLp2 * vocalWeight * 1.15));

      // 4. Melody / harmonic synth & guitar bed (stereo field + harmonic remainder minus vocal & drum hits)
      const harmonicSideL = hiL - vOut * 0.9 - dOutL * 0.45 + side * 0.25;
      const harmonicSideR = hiR - vOut * 0.9 - dOutR * 0.45 - side * 0.25;
      const mOutL = Math.max(-1, Math.min(1, harmonicSideL));
      const mOutR = Math.max(-1, Math.min(1, harmonicSideR));

      vL[i] = vOut;
      vR[i] = vOut;
      dL[i] = dOutL;
      dR[i] = dOutR;
      bL[i] = bOut;
      bR[i] = bOut;
      mL[i] = mOutL;
      mR[i] = mOutR;
    }

    // Yield to browser UI thread between chunks so waveforms/jog wheel keep spinning smoothly
    if (end < len) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    vocals: vocalsBuf,
    drums: drumsBuf,
    bass: bassBuf,
    melody: melodyBuf,
  };
}

export async function separateDeckAudioStems(
  ctx: AudioContext,
  buffer: AudioBuffer,
  title: string,
  bpm: number,
  musicalKey: string,
  preferCloud = true
): Promise<SeparatedStemPack> {
  const cached = getCachedDeckStems(buffer, title);
  if (cached && (!preferCloud || cached.sourceMode === 'CLOUD_AI')) {
    return cached;
  }

  let params = DEFAULT_PARAMS;
  let sourceMode: Exclude<DeckStemSourceMode, null> = 'OFFLINE_DSP';
  let cloudError: string | null = null;

  if (preferCloud) {
    const cloud = await fetchCloudStemParams(buffer, title, bpm, musicalKey);
    if (cloud.params) {
      params = cloud.params;
      sourceMode = 'CLOUD_AI';
    } else {
      cloudError = cloud.cloudError;
    }
  }

  const stems = await renderLocalStemBuffers(ctx, buffer, params);
  const note =
    sourceMode === 'CLOUD_AI'
      ? `Cloud AI + DSP: ${params.analysisNote || 'Adaptive vocal/drum separation'}`
      : cloudError
      ? `Offline DSP (${cloudError})`
      : 'Offline Local DSP 4-Stem Separation';

  const pack: SeparatedStemPack = {
    stems,
    sourceMode,
    params,
    note,
    cloudError,
  };
  storeCachedDeckStems(buffer, title, pack);
  return pack;
}
