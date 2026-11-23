import {SamplerPadState} from '../types/dj';

const DB_NAME = 'chronixdj_samplers_db_v1';
const DB_VERSION = 1;
const STORE_PADS = 'pads';
const STORE_AUDIO = 'audio_blobs';
const PADS_META_KEY = 'sampler_pads_v1';

export const DEFAULT_BUILTIN_SAMPLERS: SamplerPadState[] = [
  {
    id: 'builtin-0',
    label: 'KICK',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 0,
    fileName: null,
    volume: 0.9,
    loop: false,
    color: null,
    durationSec: 0.3,
    isPlaying: false,
  },
  {
    id: 'builtin-1',
    label: 'SNARE',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 1,
    fileName: null,
    volume: 0.9,
    loop: false,
    color: null,
    durationSec: 0.22,
    isPlaying: false,
  },
  {
    id: 'builtin-2',
    label: 'HAT',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 2,
    fileName: null,
    volume: 0.85,
    loop: false,
    color: null,
    durationSec: 0.08,
    isPlaying: false,
  },
  {
    id: 'builtin-3',
    label: 'CLAP',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 3,
    fileName: null,
    volume: 0.9,
    loop: false,
    color: null,
    durationSec: 0.22,
    isPlaying: false,
  },
  {
    id: 'builtin-4',
    label: 'HORN',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 4,
    fileName: null,
    volume: 0.85,
    loop: false,
    color: null,
    durationSec: 0.46,
    isPlaying: false,
  },
  {
    id: 'builtin-5',
    label: 'SIREN',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 5,
    fileName: null,
    volume: 0.85,
    loop: false,
    color: null,
    durationSec: 0.64,
    isPlaying: false,
  },
  {
    id: 'builtin-6',
    label: 'RISER',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 6,
    fileName: null,
    volume: 0.85,
    loop: false,
    color: null,
    durationSec: 0.72,
    isPlaying: false,
  },
  {
    id: 'builtin-7',
    label: 'DROP',
    sourceType: 'BUILTIN',
    builtinSynthIndex: 7,
    fileName: null,
    volume: 0.9,
    loop: false,
    color: null,
    durationSec: 0.56,
    isPlaying: false,
  },
];

function openSamplerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PADS)) {
        db.createObjectStore(STORE_PADS);
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open sampler DB'));
  });
}

export async function saveSamplerBankMeta(pads: SamplerPadState[]): Promise<void> {
  try {
    const db = await openSamplerDb();
    const sanitized = pads.map((p) => ({...p, isPlaying: false}));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PADS, 'readwrite');
      tx.objectStore(STORE_PADS).put(sanitized, PADS_META_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore persistence error when private browsing blocks IDB
  }
}

export async function saveSamplerAudioBytes(padId: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await openSamplerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      tx.objectStore(STORE_AUDIO).put(bytes.slice(0), padId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB write error
  }
}

export async function deleteSamplerAudioBytes(padId: string): Promise<void> {
  try {
    const db = await openSamplerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      tx.objectStore(STORE_AUDIO).delete(padId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function loadSavedSamplerBank(): Promise<{
  pads: SamplerPadState[];
  audioBytesById: Map<string, ArrayBuffer>;
} | null> {
  try {
    const db = await openSamplerDb();
    const pads = await new Promise<SamplerPadState[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_PADS, 'readonly');
      const req = tx.objectStore(STORE_PADS).get(PADS_META_KEY);
      req.onsuccess = () => resolve((req.result as SamplerPadState[] | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });

    if (!pads || !Array.isArray(pads) || pads.length === 0) {
      db.close();
      return null;
    }

    const audioBytesById = new Map<string, ArrayBuffer>();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_AUDIO);
      for (const pad of pads) {
        if (pad.sourceType !== 'BUILTIN') {
          const getReq = store.get(pad.id);
          getReq.onsuccess = () => {
            if (getReq.result instanceof ArrayBuffer) {
              audioBytesById.set(pad.id, getReq.result);
            }
          };
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    return {
      pads: pads.map((p) => ({...p, isPlaying: false})),
      audioBytesById,
    };
  } catch {
    return null;
  }
}

export function deriveShortPadLabel(rawName: string): string {
  const withoutExt = rawName.replace(/\.[^/.]+$/, '').trim();
  const cleaned = withoutExt.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'SAMPLE';
  return cleaned.slice(0, 14).toUpperCase();
}

export function encodeAudioSliceToWavArrayBuffer(
  srcBuffer: AudioBuffer,
  startSec: number,
  durationSec: number
): ArrayBuffer {
  const sr = srcBuffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const maxFrames = Math.max(1, Math.min(Math.floor(durationSec * sr), srcBuffer.length - startSample));
  const numChannels = Math.min(2, srcBuffer.numberOfChannels);
  const dataBytes = maxFrames * numChannels * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(srcBuffer.getChannelData(ch));
  }
  for (let i = 0; i < maxFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][startSample + i] ?? 0));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
  }
  return out;
}
