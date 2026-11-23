import {
  STEM_TYPES,
  StemChannelState,
  StemSeparationProvider,
  StemType,
} from '../types/dj';
import {STUDIO_TRACK_PRESETS, synthesizeStemPack} from './studioTrackGenerator';

interface InternalStemNode {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  analyser: AnalyserNode;
  startedAtCtxTime: number;
  offsetSec: number;
}

const STEM_LABELS: Record<StemType, string> = {
  VOCALS: 'Vocals',
  DRUMS: 'Drums',
  BASS: 'Bass',
  INSTRUMENTAL: 'Instrumental',
};

export class WebStemsEngine {
  private ctx: AudioContext | null = null;
  private nodes: Partial<Record<StemType, InternalStemNode>> = {};
  private rafId: number | null = null;
  private onStateChange: () => void;
  private onError: (msg: string) => void;

  /**
   * Architectural hook for integrating a future AI Stem Separation backend or WebAssembly/ONNX model.
   * Deliberately null by default so ordinary file loading never pretends to do AI separation.
   */
  public aiSeparationProvider: StemSeparationProvider | null = null;

  public channels: Record<StemType, StemChannelState> = {
    VOCALS: this.initialState('VOCALS'),
    DRUMS: this.initialState('DRUMS'),
    BASS: this.initialState('BASS'),
    INSTRUMENTAL: this.initialState('INSTRUMENTAL'),
  };

  constructor(onStateChange: () => void, onError: (msg: string) => void) {
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

  private initialState(type: StemType): StemChannelState {
    return {
      type,
      label: STEM_LABELS[type],
      fileName: 'No stem file loaded',
      isLoaded: false,
      isPlaying: false,
      volume: 0.85,
      isMuted: false,
      isSolo: false,
      durationSec: 0,
      positionSec: 0,
      levelMeter: 0,
    };
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      this.ctx = new AudioCtx({latencyHint: 'interactive'});
      STEM_TYPES.forEach((type) => {
        const gain = this.ctx!.createGain();
        const analyser = this.ctx!.createAnalyser();
        analyser.fftSize = 128;
        gain.connect(analyser);
        analyser.connect(this.ctx!.destination);
        this.nodes[type] = {
          buffer: null,
          source: null,
          gain,
          analyser,
          startedAtCtxTime: 0,
          offsetSec: 0,
        };
      });
      this.applyVolumes();
      this.startMeters();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async loadStemFile(type: StemType, file: File): Promise<void> {
    const ctx = this.ensureContext();
    this.stopStemSource(type);
    try {
      const arr = await file.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      const node = this.nodes[type]!;
      node.buffer = buf;
      node.offsetSec = 0;
      this.channels[type] = {
        ...this.channels[type],
        fileName: file.name,
        isLoaded: true,
        isPlaying: false,
        durationSec: buf.duration,
        positionSec: 0,
      };
      this.applyVolumes();
      this.onStateChange();
    } catch {
      this.onError(`Could not decode ${STEM_LABELS[type]} stem file: ${file.name}`);
    }
  }

  public loadStudioStemPack(presetIndex = 0): void {
    const ctx = this.ensureContext();
    const preset = STUDIO_TRACK_PRESETS[presetIndex] || STUDIO_TRACK_PRESETS[0];
    const pack = synthesizeStemPack(ctx, preset);
    STEM_TYPES.forEach((type) => {
      this.stopStemSource(type);
      const buf = pack[type];
      const node = this.nodes[type]!;
      node.buffer = buf;
      node.offsetSec = 0;
      this.channels[type] = {
        ...this.channels[type],
        fileName: `${preset.title}_${type.toLowerCase()}.wav`,
        isLoaded: true,
        isPlaying: false,
        durationSec: buf.duration,
        positionSec: 0,
      };
    });
    this.applyVolumes();
    this.onStateChange();
  }

  private stopStemSource(type: StemType): void {
    const node = this.nodes[type];
    if (node?.source) {
      try {
        node.source.onended = null;
        node.source.stop();
        node.source.disconnect();
      } catch {
        // ignore
      }
      node.source = null;
    }
  }

  private startStemAt(type: StemType, offsetSec: number): void {
    const ctx = this.ensureContext();
    const node = this.nodes[type];
    const ch = this.channels[type];
    if (!node || !node.buffer) return;
    this.stopStemSource(type);

    const clamped = Math.max(0, Math.min(offsetSec, Math.max(0, node.buffer.duration - 0.01)));
    const src = ctx.createBufferSource();
    src.buffer = node.buffer;
    src.connect(node.gain);
    node.startedAtCtxTime = ctx.currentTime;
    node.offsetSec = clamped;
    node.source = src;

    src.onended = () => {
      if (node.source === src && ch.isPlaying) {
        ch.isPlaying = false;
        ch.positionSec = 0;
        node.offsetSec = 0;
        node.source = null;
        this.onStateChange();
      }
    };

    src.start(0, clamped);
    ch.isPlaying = true;
    this.onStateChange();
  }

  public togglePlayPause(type: StemType): void {
    const ch = this.channels[type];
    if (!ch.isLoaded) {
      this.onError(`Load a separated ${ch.label} audio file or Studio Stem Pack first.`);
      return;
    }
    this.ensureContext();
    const node = this.nodes[type]!;
    if (ch.isPlaying && this.ctx) {
      ch.positionSec = Math.min(ch.durationSec, node.offsetSec + (this.ctx.currentTime - node.startedAtCtxTime));
      node.offsetSec = ch.positionSec;
      this.stopStemSource(type);
      ch.isPlaying = false;
      this.onStateChange();
    } else {
      this.startStemAt(type, ch.positionSec);
    }
  }

  public playAllSync(): void {
    const loaded = STEM_TYPES.filter((t) => this.channels[t].isLoaded);
    if (loaded.length === 0) {
      this.onError('Load at least one stem channel first.');
      return;
    }
    this.ensureContext();
    loaded.forEach((t) => this.startStemAt(t, 0));
  }

  public pauseAll(): void {
    STEM_TYPES.forEach((t) => {
      const ch = this.channels[t];
      const node = this.nodes[t];
      if (ch.isPlaying && node && this.ctx) {
        ch.positionSec = Math.min(ch.durationSec, node.offsetSec + (this.ctx.currentTime - node.startedAtCtxTime));
        node.offsetSec = ch.positionSec;
        this.stopStemSource(t);
        ch.isPlaying = false;
      }
    });
    this.onStateChange();
  }

  public seekChannel(type: StemType, sec: number): void {
    const ch = this.channels[type];
    if (!ch.isLoaded) return;
    const clamped = Math.max(0, Math.min(sec, ch.durationSec));
    ch.positionSec = clamped;
    if (this.nodes[type]) this.nodes[type]!.offsetSec = clamped;
    if (ch.isPlaying) {
      this.startStemAt(type, clamped);
    } else {
      this.onStateChange();
    }
  }

  public setVolume(type: StemType, volume: number): void {
    this.channels[type].volume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
    this.onStateChange();
  }

  public toggleMute(type: StemType): void {
    this.channels[type].isMuted = !this.channels[type].isMuted;
    this.applyVolumes();
    this.onStateChange();
  }

  public toggleSolo(type: StemType): void {
    this.channels[type].isSolo = !this.channels[type].isSolo;
    this.applyVolumes();
    this.onStateChange();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const anySolo = STEM_TYPES.some((t) => this.channels[t].isSolo);
    STEM_TYPES.forEach((t) => {
      const ch = this.channels[t];
      const node = this.nodes[t];
      if (!node) return;
      const muted = ch.isMuted || (anySolo && !ch.isSolo);
      node.gain.gain.setTargetAtTime(muted ? 0 : ch.volume, this.ctx!.currentTime, 0.015);
    });
  }

  private startMeters(): void {
    const buf = new Uint8Array(64);
    const tick = () => {
      let changed = false;
      STEM_TYPES.forEach((t) => {
        const ch = this.channels[t];
        const node = this.nodes[t];
        if (!node || !this.ctx) return;
        if (ch.isPlaying) {
          ch.positionSec = Math.min(ch.durationSec, node.offsetSec + (this.ctx.currentTime - node.startedAtCtxTime));
          node.analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          ch.levelMeter = Math.min(1, peak * 2.2);
          changed = true;
        } else if (ch.levelMeter > 0.01) {
          ch.levelMeter = 0;
          changed = true;
        }
      });
      if (changed) this.onStateChange();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    STEM_TYPES.forEach((t) => this.stopStemSource(t));
    if (this.ctx) void this.ctx.close();
  }
}
