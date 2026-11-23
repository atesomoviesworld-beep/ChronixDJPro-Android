import {
  CrossfaderCurve,
  DeckId,
  DeckState,
  DeckStemKey,
  DeckStemSelection,
  DjSettings,
  FxType,
  PadMode,
  RecordingMode,
  RecordingState,
  SamplerPadState,
  SamplerSourceType,
  VocalMode,
} from '../types/dj';
import {
  analyzeAudioBuffer,
  StudioTrackPreset,
  synthesizeStudioTrack,
} from './studioTrackGenerator';
import {getCachedDeckStems, separateDeckAudioStems} from './stemSeparator';
import {createKeyLockInsert, KeyLockInsert} from './keyLockWorklet';
import {
  DEFAULT_BUILTIN_SAMPLERS,
  deleteSamplerAudioBytes,
  deriveShortPadLabel,
  encodeAudioSliceToWavArrayBuffer,
  loadSavedSamplerBank,
  saveSamplerAudioBytes,
  saveSamplerBankMeta,
} from './samplerStorage';

const ALL_STEMS_ON: DeckStemSelection = {
  vocals: true,
  drums: true,
  bass: true,
  melody: true,
};

const MAX_SYNC_PITCH_PERCENT = 50;

function wrap01(x: number): number {
  const m = x % 1;
  return m < 0 ? m + 1 : m;
}

function wrapSignedHalf(x: number): number {
  let w = wrap01(x);
  if (w >= 0.5) w -= 1;
  return w;
}

interface InternalDeckNodes {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  separatedStems: Record<DeckStemKey, AudioBuffer> | null;
  stemSources: Record<DeckStemKey, AudioBufferSourceNode | null>;
  stemGains: Record<DeckStemKey, GainNode>;
  dryMixGain: GainNode;
  gainNode: GainNode;
  keyLock: KeyLockInsert;
  lowEq: BiquadFilterNode;
  midEq: BiquadFilterNode;
  highEq: BiquadFilterNode;
  sweepFilter: BiquadFilterNode;
  volumeGain: GainNode;
  xfadeGain: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  flangerLfo: OscillatorNode;
  flangerLfoGain: GainNode;
  reverbWet: GainNode;
  analyser: AnalyserNode;
  dryPassGain: GainNode;
  noAcapellaGain: GainNode;
  acapellaOnlyGain: GainNode;
  startedAtCtxTime: number;
  offsetAtStartSec: number;
  basePlaybackRate: number;
  syncTrimRatio: number;
  playbackRate: number;
  lastScratchSeekMs: number;
  isScratching: boolean;
  slipOriginCtxTime: number | null;
  slipOriginPosSec: number;
}

function createInitialDeckState(deckId: DeckId): DeckState {
  return {
    deckId,
    title: deckId === 'DECK_A' ? 'DECK A: LOAD A SONG' : 'DECK B: LOAD A SONG',
    isLoaded: false,
    isVideo: false,
    videoUrl: null,
    isPlaying: false,
    isLoading: false,
    durationSec: 0,
    positionSec: 0,
    cuePointSec: 0,
    cuePreviewing: false,
    detectedBpm: 0,
    beatOffsetSec: 0,
    musicalKey: '#?',
    pitchPercent: 0,
    pitchRangePercent: 8,
    keyLockEnabled: false,
    slipEnabled: false,
    beatJumpEnabled: false,
    quantizeEnabled: true,
    syncLocked: false,
    syncMaster: false,
    syncMultiplier: 1,
    quantizePending: false,
    phaseErrorBeats: 0,
    vocalMode: 'OFF',
    stemStatus: 'IDLE',
    stemSourceMode: null,
    stemNote: null,
    stemError: null,
    stemBypassed: true,
    activeStems: {...ALL_STEMS_ON},
    volume: 0.88,
    gainDb: 0,
    eqHigh: 0.5,
    eqMid: 0.5,
    eqLow: 0.5,
    filterValue: 0.5,
    loopBeats: 0.5,
    loopActive: false,
    loopStartSec: 0,
    loopEndSec: 0,
    padMode: deckId === 'DECK_A' ? 'STEMS' : 'CUE',
    hotCues: Array.from({length: 8}, (_, index) => ({index, positionSec: null})),
    fxSlots: [
      {type: 'Echo Out', enabled: false, intensity: 0.5},
      {type: 'Reverb Out', enabled: false, intensity: 0.5},
      {type: 'Loop Out', enabled: false, intensity: 0.5},
    ],
    waveform: [],
    vuLevel: 0,
    platterDegrees: 0,
  };
}

export class WebDjEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private convolver: ConvolverNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordCanvas: HTMLCanvasElement | null = null;
  private recordDrawTimer: number | null = null;
  private recordStream: MediaStream | null = null;
  private recordAccumulatedMs = 0;
  private recordSegmentStartMs = 0;
  private videoElements: Record<DeckId, HTMLVideoElement | null> = {
    DECK_A: null,
    DECK_B: null,
  };
  private xfadeAnimRaf: number | null = null;
  private cueHoldActive: Record<DeckId, boolean> = {
    DECK_A: false,
    DECK_B: false,
  };
  private stemJobSeq: Record<DeckId, number> = {
    DECK_A: 0,
    DECK_B: 0,
  };

  private nodes: Record<DeckId, InternalDeckNodes | null> = {
    DECK_A: null,
    DECK_B: null,
  };

  public deckStates: Record<DeckId, DeckState> = {
    DECK_A: createInitialDeckState('DECK_A'),
    DECK_B: createInitialDeckState('DECK_B'),
  };

  public crossfader = 0.5;
  public masterVolume = 0.9;
  public isRecording = false;
  public samplerPads: SamplerPadState[] = DEFAULT_BUILTIN_SAMPLERS.map((p) => ({...p}));
  private samplerBuffers = new Map<string, AudioBuffer>();
  private samplerRawBytes = new Map<string, ArrayBuffer>();
  private activeSamplerSources = new Map<string, {source: AudioBufferSourceNode; gain: GainNode}>();
  private samplerPulseTimers = new Map<string, number>();
  public recordingState: RecordingState = {
    status: 'IDLE',
    mode: 'AUDIO',
    elapsedSec: 0,
    lastSaved: null,
  };
  private crossfaderCurve: CrossfaderCurve = 'EQUAL_POWER';
  private liteMode = true;
  private rafId: number | null = null;
  private lastTickTime = 0;
  private onStateChange: () => void;
  private onError: (msg: string) => void;
  private onRecordingComplete: (blobUrl: string, fileName: string) => void;

  constructor(
    onStateChange: () => void,
    onError: (msg: string) => void,
    onRecordingComplete: (blobUrl: string, fileName: string) => void
  ) {
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onRecordingComplete = onRecordingComplete;
    void this.restoreCustomSamplers();
  }

  public ensureAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      this.ctx = new AudioCtx({latencyHint: 'interactive'});

      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -2;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 8;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this.buildImpulseResponse(this.ctx, 1.8, 2.8);

      this.recordDest = this.ctx.createMediaStreamDestination();

      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
      this.limiter.connect(this.recordDest);

      this.nodes.DECK_A = this.createDeckNodes(this.ctx);
      this.nodes.DECK_B = this.createDeckNodes(this.ctx);
      this.applyMixVolumes();
      this.startTickLoop();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private buildImpulseResponse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  private createDeckNodes(ctx: AudioContext): InternalDeckNodes {
    const dryMixGain = ctx.createGain();
    dryMixGain.gain.value = 1;

    const stemGains: Record<DeckStemKey, GainNode> = {
      vocals: ctx.createGain(),
      drums: ctx.createGain(),
      bass: ctx.createGain(),
      melody: ctx.createGain(),
    };
    stemGains.vocals.gain.value = 0;
    stemGains.drums.gain.value = 0;
    stemGains.bass.gain.value = 0;
    stemGains.melody.gain.value = 0;

    const gainNode = ctx.createGain();
    dryMixGain.connect(gainNode);
    stemGains.vocals.connect(gainNode);
    stemGains.drums.connect(gainNode);
    stemGains.bass.connect(gainNode);
    stemGains.melody.connect(gainNode);

    const lowEq = ctx.createBiquadFilter();
    lowEq.type = 'lowshelf';
    lowEq.frequency.value = 250;

    const midEq = ctx.createBiquadFilter();
    midEq.type = 'peaking';
    midEq.frequency.value = 1100;
    midEq.Q.value = 1.0;

    const highEq = ctx.createBiquadFilter();
    highEq.type = 'highshelf';
    highEq.frequency.value = 4200;

    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = 'allpass';
    sweepFilter.frequency.value = 1000;

    const volumeGain = ctx.createGain();
    const xfadeGain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Echo / Flanger delay network
    const delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.375;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.42;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;

    // LFO modulation for real sweeping Flanger FX
    const flangerLfo = ctx.createOscillator();
    flangerLfo.type = 'sine';
    flangerLfo.frequency.value = 0.45;
    const flangerLfoGain = ctx.createGain();
    flangerLfoGain.gain.value = 0;
    flangerLfo.connect(flangerLfoGain);
    flangerLfoGain.connect(delayNode.delayTime);
    flangerLfo.start();

    // Reverb send
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;

    // Real-time Mid/Side Acapella Remover & Isolator matrix
    const dryPassGain = ctx.createGain();
    dryPassGain.gain.value = 1;

    const noAcapellaGain = ctx.createGain();
    noAcapellaGain.gain.value = 0;

    const acapellaOnlyGain = ctx.createGain();
    acapellaOnlyGain.gain.value = 0;

    const splitter = ctx.createChannelSplitter(2);
    const mergerSide = ctx.createChannelMerger(2);
    const invR = ctx.createGain();
    invR.gain.value = -1;
    const invL = ctx.createGain();
    invL.gain.value = -1;

    // Side = (L - R) on left, (R - L) on right -> cancels dead-center vocals/acapella
    splitter.connect(mergerSide, 0, 0);
    splitter.connect(invR, 1);
    invR.connect(mergerSide, 0, 0);

    splitter.connect(mergerSide, 1, 1);
    splitter.connect(invL, 0);
    invL.connect(mergerSide, 0, 1);

    // Preserve <180Hz sub-bass & kick punch from mono sum
    const bassPreserveFilter = ctx.createBiquadFilter();
    bassPreserveFilter.type = 'lowpass';
    bassPreserveFilter.frequency.value = 180;
    const monoBassGain = ctx.createGain();
    monoBassGain.gain.value = 0.5;
    splitter.connect(monoBassGain, 0);
    splitter.connect(monoBassGain, 1);
    monoBassGain.connect(bassPreserveFilter);

    // Acapella-only branch: Mono sum -> 240Hz HPF -> 4800Hz LPF
    const voxHp = ctx.createBiquadFilter();
    voxHp.type = 'highpass';
    voxHp.frequency.value = 240;
    const voxLp = ctx.createBiquadFilter();
    voxLp.type = 'lowpass';
    voxLp.frequency.value = 4800;
    monoBassGain.connect(voxHp);
    voxHp.connect(voxLp);

    const keyLock = createKeyLockInsert(ctx);
    gainNode.connect(keyLock.input);
    keyLock.output.connect(dryPassGain);
    keyLock.output.connect(splitter);
    mergerSide.connect(noAcapellaGain);
    bassPreserveFilter.connect(noAcapellaGain);
    voxLp.connect(acapellaOnlyGain);

    dryPassGain.connect(lowEq);
    noAcapellaGain.connect(lowEq);
    acapellaOnlyGain.connect(lowEq);

    lowEq.connect(midEq);
    midEq.connect(highEq);
    highEq.connect(sweepFilter);

    // Dry path
    sweepFilter.connect(volumeGain);
    // Delay FX loop
    sweepFilter.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet);
    delayWet.connect(volumeGain);
    // Reverb FX send
    if (this.convolver) {
      sweepFilter.connect(reverbWet);
      reverbWet.connect(this.convolver);
      this.convolver.connect(volumeGain);
    }

    volumeGain.connect(analyser);
    analyser.connect(xfadeGain);
    if (this.masterGain) {
      xfadeGain.connect(this.masterGain);
    }

    return {
      buffer: null,
      source: null,
      separatedStems: null,
      stemSources: {vocals: null, drums: null, bass: null, melody: null},
      stemGains,
      dryMixGain,
      gainNode,
      keyLock,
      lowEq,
      midEq,
      highEq,
      sweepFilter,
      volumeGain,
      xfadeGain,
      delayNode,
      delayFeedback,
      delayWet,
      flangerLfo,
      flangerLfoGain,
      reverbWet,
      analyser,
      dryPassGain,
      noAcapellaGain,
      acapellaOnlyGain,
      startedAtCtxTime: 0,
      offsetAtStartSec: 0,
      basePlaybackRate: 1,
      syncTrimRatio: 1,
      playbackRate: 1,
      lastScratchSeekMs: 0,
      isScratching: false,
      slipOriginCtxTime: null,
      slipOriginPosSec: 0,
    };
  }

  public async loadLocalFile(deckId: DeckId, file: File): Promise<void> {
    const ctx = this.ensureAudioContext();
    const state = this.deckStates[deckId];
    this.stopSource(deckId);
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
    }
    const isVideoFile =
      file.type.startsWith('video/') ||
      /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(file.name);

    state.isLoading = true;
    state.isPlaying = false;
    state.isVideo = isVideoFile;
    state.videoUrl = isVideoFile ? URL.createObjectURL(file) : null;
    state.title = file.name.replace(/\.[^.]+$/, '');
    this.onStateChange();

    try {
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      this.commitLoadedBuffer(deckId, audioBuf, state.title, undefined, undefined, isVideoFile, state.videoUrl);
    } catch {
      state.isLoading = false;
      state.isLoaded = false;
      state.isVideo = false;
      if (state.videoUrl) {
        URL.revokeObjectURL(state.videoUrl);
        state.videoUrl = null;
      }
      state.title = deckId === 'DECK_A' ? 'DECK A: LOAD A SONG' : 'DECK B: LOAD A SONG';
      this.onError(`Unsupported or unreadable media file: ${file.name}`);
      this.onStateChange();
    }
  }

  public async loadVideoClipUrl(deckId: DeckId, blobUrl: string, title: string, bpm = 124): Promise<void> {
    const ctx = this.ensureAudioContext();
    const state = this.deckStates[deckId];
    this.stopSource(deckId);
    if (state.videoUrl && state.videoUrl !== blobUrl) {
      URL.revokeObjectURL(state.videoUrl);
    }
    state.isLoading = true;
    state.isPlaying = false;
    state.isVideo = true;
    state.videoUrl = blobUrl;
    state.title = title;
    this.onStateChange();

    try {
      const res = await fetch(blobUrl);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      this.commitLoadedBuffer(deckId, audioBuf, title, bpm, undefined, true, blobUrl);
    } catch {
      state.isLoading = false;
      state.isLoaded = false;
      this.onError(`Could not decode audio from video clip: ${title}`);
      this.onStateChange();
    }
  }

  public loadStudioPreset(deckId: DeckId, preset: StudioTrackPreset): void {
    const ctx = this.ensureAudioContext();
    this.stopSource(deckId);
    if (this.deckStates[deckId].videoUrl) {
      URL.revokeObjectURL(this.deckStates[deckId].videoUrl!);
    }
    const buffer = synthesizeStudioTrack(ctx, preset);
    this.commitLoadedBuffer(deckId, buffer, preset.title, preset.bpm, preset.musicalKey, false, null);
  }

  private commitLoadedBuffer(
    deckId: DeckId,
    buffer: AudioBuffer,
    title: string,
    overrideBpm?: number,
    overrideKey?: string,
    isVideo = false,
    videoUrl: string | null = null
  ): void {
    const node = this.nodes[deckId];
    if (!node) return;
    this.stemJobSeq[deckId] += 1;
    this.cueHoldActive[deckId] = false;
    node.buffer = buffer;
    node.offsetAtStartSec = 0;
    node.basePlaybackRate = 1;
    node.syncTrimRatio = 1;
    node.playbackRate = 1;
    node.isScratching = false;

    const cachedPack = getCachedDeckStems(buffer, title);
    node.separatedStems = cachedPack ? cachedPack.stems : null;

    const analysis = analyzeAudioBuffer(buffer, title);
    const st = this.deckStates[deckId];
    const otherId: DeckId = deckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    const other = this.deckStates[otherId];

    st.title = title;
    st.isLoaded = true;
    st.isVideo = isVideo;
    st.videoUrl = videoUrl;
    st.isLoading = false;
    st.isPlaying = false;
    st.cuePreviewing = false;
    st.quantizePending = false;
    st.durationSec = buffer.duration;
    st.positionSec = 0;
    st.cuePointSec = 0;
    st.loopActive = false;
    st.detectedBpm = overrideBpm ?? analysis.bpm;
    st.beatOffsetSec = overrideBpm !== undefined ? 0 : analysis.beatOffsetSec;
    st.pitchPercent = 0;
    st.syncLocked = false;
    st.syncMultiplier = 1;
    st.phaseErrorBeats = 0;
    if (st.syncMaster && other.isLoaded && other.syncLocked) {
      st.syncMaster = false;
      other.syncMaster = true;
      other.syncLocked = false;
    } else if (!other.isLoaded) {
      st.syncMaster = true;
      other.syncMaster = false;
    }
    st.musicalKey = overrideKey ?? analysis.musicalKey;
    st.waveform = analysis.waveform;
    st.hotCues = Array.from({length: 8}, (_, index) => ({index, positionSec: null}));

    st.vocalMode = 'OFF';
    st.stemBypassed = true;
    st.activeStems = {...ALL_STEMS_ON};
    st.stemError = cachedPack?.cloudError ?? null;
    st.stemStatus = cachedPack ? 'READY' : 'IDLE';
    st.stemSourceMode = cachedPack ? cachedPack.sourceMode : null;
    st.stemNote = cachedPack ? `${cachedPack.note} (Cached)` : null;

    // Sync echo delay to track BPM (3/4 beat echo)
    node.delayNode.delayTime.value = Math.min(1.5, (60 / st.detectedBpm) * 0.75);
    this.applyKeyLockParams(deckId);
    this.applyStemGains(deckId);
    this.applyEqAndFx(deckId);
    this.applyMixVolumes();
    this.onStateChange();
  }

  private pitchPercentToRate(pitchPercent: number): number {
    return Math.max(0.5, Math.min(1.5, 1 + pitchPercent / 100));
  }

  private applyKeyLockParams(deckId: DeckId): void {
    const node = this.nodes[deckId];
    const st = this.deckStates[deckId];
    if (!node || !this.ctx) return;
    const rate = Math.max(0.5, Math.min(1.5, node.playbackRate || 1));
    node.keyLock.setParams(st.keyLockEnabled, 1 / rate, this.ctx.currentTime);
  }

  private applyAudioRateNow(deckId: DeckId, baseRate: number, trimRatio: number, atCtxTime?: number): void {
    const node = this.nodes[deckId];
    const st = this.deckStates[deckId];
    if (!node || !this.ctx) return;
    const now = atCtxTime ?? this.ctx.currentTime;
    const clampedBase = Math.max(0.5, Math.min(1.5, baseRate));
    const clampedTrim = Math.max(0.95, Math.min(1.05, trimRatio));
    const effectiveRate = clampedBase * clampedTrim;

    if (st.isPlaying && node.source) {
      if (now >= node.startedAtCtxTime) {
        const curPos = this.computePositionAtCtxTime(deckId, now);
        node.offsetAtStartSec = curPos;
        node.startedAtCtxTime = now;
      }
      node.source.playbackRate.setValueAtTime(effectiveRate, now);
      (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
        const stemSrc = node.stemSources[k];
        if (stemSrc) stemSrc.playbackRate.setValueAtTime(effectiveRate, now);
      });
    }

    node.basePlaybackRate = clampedBase;
    node.syncTrimRatio = clampedTrim;
    node.playbackRate = effectiveRate;

    const vid = this.videoElements[deckId];
    if (vid) {
      try {
        vid.playbackRate = effectiveRate;
      } catch {
        // ignore unsupported rate
      }
    }

    this.applyKeyLockParams(deckId);
  }

  private stopSource(deckId: DeckId): void {
    const node = this.nodes[deckId];
    if (!node) return;
    if (node.source) {
      try {
        node.source.onended = null;
        node.source.stop();
        node.source.disconnect();
      } catch {
        // ignore already stopped
      }
      node.source = null;
    }
    (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
      const s = node.stemSources[k];
      if (s) {
        try {
          s.onended = null;
          s.stop();
          s.disconnect();
        } catch {
          // ignore
        }
        node.stemSources[k] = null;
      }
    });
  }

  private startSourceAt(deckId: DeckId, offsetSec: number, explicitStartWhen?: number): void {
    const ctx = this.ensureAudioContext();
    const node = this.nodes[deckId];
    const st = this.deckStates[deckId];
    if (!node || !node.buffer) return;

    this.stopSource(deckId);
    const clampedOffset = Math.max(0, Math.min(offsetSec, Math.max(0, node.buffer.duration - 0.01)));
    const baseRate = this.pitchPercentToRate(st.pitchPercent);
    const effectiveRate = baseRate * (node.syncTrimRatio || 1);
    const startWhen = Math.max(ctx.currentTime + 0.004, explicitStartWhen ?? ctx.currentTime + 0.004);

    const source = ctx.createBufferSource();
    source.buffer = node.buffer;
    source.playbackRate.value = effectiveRate;
    if (st.loopActive && st.loopEndSec > st.loopStartSec) {
      source.loop = true;
      source.loopStart = st.loopStartSec;
      source.loopEnd = st.loopEndSec;
    }
    source.connect(node.dryMixGain);

    node.startedAtCtxTime = startWhen;
    node.offsetAtStartSec = clampedOffset;
    node.basePlaybackRate = baseRate;
    node.playbackRate = effectiveRate;
    node.source = source;

    source.onended = () => {
      if (node.source === source && st.isPlaying) {
        this.cueHoldActive[deckId] = false;
        st.cuePreviewing = false;
        st.quantizePending = false;
        st.isPlaying = false;
        st.positionSec = st.durationSec;
        node.offsetAtStartSec = 0;
        node.source = null;
        this.stopSource(deckId);
        this.handleMasterPlaybackStopped(deckId);
        this.onStateChange();
      }
    };

    if (node.separatedStems) {
      (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((stemKey) => {
        const stemBuf = node.separatedStems![stemKey];
        const stemSrc = ctx.createBufferSource();
        stemSrc.buffer = stemBuf;
        stemSrc.playbackRate.value = effectiveRate;
        if (st.loopActive && st.loopEndSec > st.loopStartSec) {
          stemSrc.loop = true;
          stemSrc.loopStart = st.loopStartSec;
          stemSrc.loopEnd = st.loopEndSec;
        }
        stemSrc.connect(node.stemGains[stemKey]);
        node.stemSources[stemKey] = stemSrc;
        stemSrc.start(startWhen, clampedOffset);
      });
    }

    this.applyKeyLockParams(deckId);
    this.applyStemGains(deckId);
    source.start(startWhen, clampedOffset);
    st.quantizePending = startWhen > ctx.currentTime + 0.02;
    st.isPlaying = true;
    st.positionSec = clampedOffset;
    this.onStateChange();
  }

  private handleMasterPlaybackStopped(stoppedDeckId: DeckId): void {
    const stopped = this.deckStates[stoppedDeckId];
    const otherId: DeckId = stoppedDeckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    const other = this.deckStates[otherId];
    if (stopped.syncMaster && other.isLoaded && other.isPlaying && other.syncLocked) {
      stopped.syncMaster = false;
      other.syncMaster = true;
      other.syncLocked = false;
      const otherNode = this.nodes[otherId];
      if (otherNode) {
        this.applyAudioRateNow(otherId, this.pitchPercentToRate(other.pitchPercent), 1);
      }
    }
  }

  public togglePlayPause(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) {
      this.onError(`Load a track into ${deckId === 'DECK_A' ? 'Deck A' : 'Deck B'} first (+ button).`);
      return;
    }
    const ctx = this.ensureAudioContext();
    this.cueHoldActive[deckId] = false;
    st.cuePreviewing = false;
    if (st.isPlaying) {
      st.positionSec = this.computeCurrentPositionSec(deckId);
      st.quantizePending = false;
      if (this.nodes[deckId]) {
        this.nodes[deckId]!.offsetAtStartSec = st.positionSec;
      }
      this.stopSource(deckId);
      st.isPlaying = false;
      this.handleMasterPlaybackStopped(deckId);
      this.onStateChange();
      return;
    }

    const otherId: DeckId = deckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    const other = this.deckStates[otherId];
    const rawStart = st.positionSec >= st.durationSec - 0.05 ? st.beatOffsetSec : st.positionSec;

    // Beat-aware quantized start when synced to an actively playing master deck
    if (st.syncLocked && other.isLoaded && other.isPlaying && other.detectedBpm > 0 && st.detectedBpm > 0) {
      this.syncTempoToMaster(deckId, otherId);
      const now = ctx.currentTime;
      const masterPos = this.computePositionAtCtxTime(otherId, now);
      const masterBufBeat = 60 / other.detectedBpm;
      const masterRate = this.pitchPercentToRate(other.pitchPercent);
      const masterWallBeat = masterBufBeat / masterRate;
      const mult = st.syncMultiplier || 1;
      const targetWallBeat = masterWallBeat / mult;
      const masterPhase = wrap01(((masterPos - other.beatOffsetSec) / masterBufBeat) * mult);
      const slaveBufBeat = 60 / st.detectedBpm;

      if (st.quantizeEnabled) {
        const beatIndex = Math.round((rawStart - st.beatOffsetSec) / slaveBufBeat);
        const quantizedOffset = Math.max(0, Math.min(st.durationSec - 0.05, st.beatOffsetSec + beatIndex * slaveBufBeat));
        const beatsUntilNext = masterPhase < 0.025 ? 0 : 1 - masterPhase;
        const waitSec = beatsUntilNext * targetWallBeat;
        this.startSourceAt(deckId, quantizedOffset, now + Math.max(0.004, waitSec));
        return;
      }

      // Unquantized immediate start still snaps playback phase cleanly onto Master's current phase
      const startWhen = now + 0.004;
      const phaseAtStart = wrap01(masterPhase + 0.004 / targetWallBeat);
      const baseBeatIdx = Math.floor((rawStart - st.beatOffsetSec) / slaveBufBeat);
      const phaseMatchedOffset = Math.max(
        0,
        Math.min(st.durationSec - 0.05, st.beatOffsetSec + (baseBeatIdx + phaseAtStart) * slaveBufBeat)
      );
      this.startSourceAt(deckId, phaseMatchedOffset, startWhen);
      return;
    }

    // If starting the lone or master deck, give it master priority if no master is playing
    if (!other.isPlaying && st.syncLocked) {
      this.syncTempoToMaster(deckId, otherId);
    }
    this.startSourceAt(deckId, rawStart);
  }

  public stop(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    this.cueHoldActive[deckId] = false;
    st.cuePreviewing = false;
    st.quantizePending = false;
    this.stopSource(deckId);
    st.isPlaying = false;
    st.positionSec = 0;
    if (this.nodes[deckId]) {
      this.nodes[deckId]!.offsetAtStartSec = 0;
    }
    this.handleMasterPlaybackStopped(deckId);
    this.onStateChange();
  }

  public seekTo(deckId: DeckId, targetSec: number): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    const clamped = Math.max(0, Math.min(targetSec, st.durationSec));
    st.positionSec = clamped;
    st.quantizePending = false;
    if (this.nodes[deckId]) {
      this.nodes[deckId]!.offsetAtStartSec = clamped;
    }
    if (st.isPlaying) {
      this.startSourceAt(deckId, clamped);
    } else {
      this.onStateChange();
    }
  }

  public setMainCue(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    st.cuePointSec = this.computeCurrentPositionSec(deckId);
    this.onStateChange();
  }

  public cuePress(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    this.ensureAudioContext();
    if (st.isPlaying && !this.cueHoldActive[deckId]) {
      this.stopSource(deckId);
      st.isPlaying = false;
      st.cuePreviewing = false;
      st.quantizePending = false;
      st.positionSec = st.cuePointSec;
      if (this.nodes[deckId]) {
        this.nodes[deckId]!.offsetAtStartSec = st.cuePointSec;
      }
      this.handleMasterPlaybackStopped(deckId);
      this.onStateChange();
      return;
    }
    // Paused: holding CUE previews live from saved main cue point
    this.cueHoldActive[deckId] = true;
    st.cuePreviewing = true;
    st.positionSec = st.cuePointSec;
    this.startSourceAt(deckId, st.cuePointSec);
  }

  public cueRelease(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (!this.cueHoldActive[deckId]) return;
    this.cueHoldActive[deckId] = false;
    st.cuePreviewing = false;
    st.quantizePending = false;
    this.stopSource(deckId);
    st.isPlaying = false;
    st.positionSec = st.cuePointSec;
    if (this.nodes[deckId]) {
      this.nodes[deckId]!.offsetAtStartSec = st.cuePointSec;
    }
    this.handleMasterPlaybackStopped(deckId);
    this.onStateChange();
  }

  public triggerCue(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    this.cueHoldActive[deckId] = false;
    st.cuePreviewing = false;
    st.quantizePending = false;
    this.stopSource(deckId);
    st.isPlaying = false;
    st.positionSec = st.cuePointSec;
    if (this.nodes[deckId]) {
      this.nodes[deckId]!.offsetAtStartSec = st.cuePointSec;
    }
    this.handleMasterPlaybackStopped(deckId);
    this.onStateChange();
  }

  public triggerHotCue(deckId: DeckId, padIdx: number, deleteMode: boolean): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    const cue = st.hotCues[padIdx];
    if (!cue) return;
    if (deleteMode) {
      cue.positionSec = null;
      this.onStateChange();
      return;
    }
    if (cue.positionSec === null) {
      cue.positionSec = this.computeCurrentPositionSec(deckId);
      this.onStateChange();
    } else {
      const ctx = this.ensureAudioContext();
      this.cueHoldActive[deckId] = false;
      st.cuePreviewing = false;
      const targetPos = Math.max(0, Math.min(cue.positionSec, Math.max(0, st.durationSec - 0.01)));
      const otherId: DeckId = deckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
      const other = this.deckStates[otherId];
      if (st.syncLocked && st.quantizeEnabled && other.isPlaying && other.detectedBpm > 0 && st.detectedBpm > 0) {
        const now = ctx.currentTime;
        const masterPos = this.computePositionAtCtxTime(otherId, now);
        const masterBufBeat = 60 / other.detectedBpm;
        const masterWallBeat = masterBufBeat / this.pitchPercentToRate(other.pitchPercent);
        const mult = st.syncMultiplier || 1;
        const masterPhase = wrap01(((masterPos - other.beatOffsetSec) / masterBufBeat) * mult);
        const beatsUntilNext = masterPhase < 0.03 ? 0 : 1 - masterPhase;
        const waitSec = beatsUntilNext * (masterWallBeat / mult);
        this.startSourceAt(deckId, targetPos, now + Math.max(0.004, waitSec));
        return;
      }
      st.positionSec = targetPos;
      this.startSourceAt(deckId, targetPos);
    }
  }

  public beginScratch(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node) return;
    node.isScratching = true;
    if (st.slipEnabled && st.isPlaying && this.ctx) {
      node.slipOriginCtxTime = this.ctx.currentTime;
      node.slipOriginPosSec = this.computeCurrentPositionSec(deckId);
    }
  }

  public nudgePlatter(deckId: DeckId, deltaDeg: number): void {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node) return;
    const deltaSec = (deltaDeg / 360) * 1.6;
    const nextPos = Math.max(0, Math.min(st.durationSec, st.positionSec + deltaSec));
    st.platterDegrees = (st.platterDegrees + deltaDeg + 360) % 360;
    st.positionSec = nextPos;
    node.offsetAtStartSec = nextPos;

    if (st.isPlaying) {
      const nowMs = performance.now();
      if (nowMs - node.lastScratchSeekMs >= 32) {
        node.lastScratchSeekMs = nowMs;
        this.startSourceAt(deckId, nextPos);
        return;
      }
    }
    this.onStateChange();
  }

  public endScratch(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node) return;
    node.isScratching = false;
    if (st.slipEnabled && st.isPlaying && node.slipOriginCtxTime !== null && this.ctx) {
      const elapsed = (this.ctx.currentTime - node.slipOriginCtxTime) * node.playbackRate;
      const slipTarget = Math.max(0, Math.min(st.durationSec, node.slipOriginPosSec + elapsed));
      node.slipOriginCtxTime = null;
      this.seekTo(deckId, slipTarget);
      this.maintainSyncLock();
      return;
    }
    node.slipOriginCtxTime = null;
    if (st.isPlaying) {
      this.startSourceAt(deckId, st.positionSec);
    }
    this.maintainSyncLock();
  }

  public setPitchPercent(deckId: DeckId, percent: number, manualUserChange = true): void {
    const st = this.deckStates[deckId];
    const maxRange = Math.min(MAX_SYNC_PITCH_PERCENT, st.pitchRangePercent);
    const clamped = Math.max(-maxRange, Math.min(maxRange, percent));
    st.pitchPercent = clamped;

    // Manual pitch adjustment on a synced slave detaches lock cleanly so user has control
    if (manualUserChange && st.syncLocked) {
      st.syncLocked = false;
      st.phaseErrorBeats = 0;
      if (this.nodes[deckId]) {
        this.nodes[deckId]!.syncTrimRatio = 1;
      }
    }

    const newRate = this.pitchPercentToRate(clamped);
    this.applyAudioRateNow(deckId, newRate, this.nodes[deckId]?.syncTrimRatio ?? 1);

    // If this deck is Master, propagate tempo immediately to any synced slave deck
    const otherId: DeckId = deckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    if (this.deckStates[otherId].syncLocked) {
      this.syncTempoToMaster(otherId, deckId);
    }
    this.onStateChange();
  }

  public cyclePitchRange(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    st.pitchRangePercent = st.pitchRangePercent === 8 ? 16 : st.pitchRangePercent === 16 ? 50 : 8;
    this.setPitchPercent(deckId, st.pitchPercent, false);
  }

  public setMasterDeck(deckId: DeckId): void {
    const target = this.deckStates[deckId];
    if (!target.isLoaded) return;
    const otherId: DeckId = deckId === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    const other = this.deckStates[otherId];
    target.syncMaster = true;
    target.syncLocked = false;
    target.phaseErrorBeats = 0;
    if (this.nodes[deckId]) {
      this.applyAudioRateNow(deckId, this.pitchPercentToRate(target.pitchPercent), 1);
    }
    other.syncMaster = false;
    if (other.syncLocked) {
      this.syncTempoToMaster(otherId, deckId);
      this.maintainSyncLock();
    }
    this.onStateChange();
  }

  private computeBestSyncTarget(
    slaveOriginalBpm: number,
    masterEffectiveBpm: number
  ): {pitchPercent: number; multiplier: number} {
    const directPitch = ((masterEffectiveBpm / slaveOriginalBpm) - 1) * 100;
    if (Math.abs(directPitch) <= MAX_SYNC_PITCH_PERCENT) {
      return {pitchPercent: directPitch, multiplier: 1};
    }
    // Harmonic half/double-time fallback when 1:1 exceeds physical +/-50% pitch limits (e.g. 80 <-> 140 BPM)
    const halfPitch = (((masterEffectiveBpm * 0.5) / slaveOriginalBpm) - 1) * 100;
    const doublePitch = (((masterEffectiveBpm * 2) / slaveOriginalBpm) - 1) * 100;
    if (Math.abs(halfPitch) <= MAX_SYNC_PITCH_PERCENT && Math.abs(halfPitch) <= Math.abs(doublePitch)) {
      return {pitchPercent: halfPitch, multiplier: 0.5};
    }
    if (Math.abs(doublePitch) <= MAX_SYNC_PITCH_PERCENT) {
      return {pitchPercent: doublePitch, multiplier: 2};
    }
    return {
      pitchPercent: Math.max(-MAX_SYNC_PITCH_PERCENT, Math.min(MAX_SYNC_PITCH_PERCENT, directPitch)),
      multiplier: 1,
    };
  }

  private syncTempoToMaster(slaveId: DeckId, masterId: DeckId): void {
    const slave = this.deckStates[slaveId];
    const master = this.deckStates[masterId];
    if (!slave.isLoaded || !master.isLoaded || slave.detectedBpm <= 0 || master.detectedBpm <= 0) return;

    const masterEffectiveBpm = master.detectedBpm * this.pitchPercentToRate(master.pitchPercent);
    const {pitchPercent: neededPitch, multiplier} = this.computeBestSyncTarget(
      slave.detectedBpm,
      masterEffectiveBpm
    );

    if (Math.abs(neededPitch) > slave.pitchRangePercent) {
      slave.pitchRangePercent = Math.abs(neededPitch) > 16 ? 50 : 16;
    }
    const maxAllowed = Math.min(MAX_SYNC_PITCH_PERCENT, slave.pitchRangePercent);
    const clampedPitch = Math.max(-maxAllowed, Math.min(maxAllowed, neededPitch));

    slave.syncMultiplier = multiplier;
    slave.pitchPercent = clampedPitch;
    const baseRate = this.pitchPercentToRate(clampedPitch);
    const node = this.nodes[slaveId];
    this.applyAudioRateNow(slaveId, baseRate, node?.syncTrimRatio ?? 1);
  }

  public syncBpm(targetDeck: DeckId): void {
    const otherId: DeckId = targetDeck === 'DECK_A' ? 'DECK_B' : 'DECK_A';
    const other = this.deckStates[otherId];
    const target = this.deckStates[targetDeck];
    if (!other.isLoaded || !target.isLoaded || other.detectedBpm <= 0 || target.detectedBpm <= 0) return;

    const ctx = this.ensureAudioContext();

    // If already synced & close in phase, toggle SYNC OFF; if drifted out of phase, re-snap phase cleanly
    if (target.syncLocked && Math.abs(target.phaseErrorBeats) < 0.04) {
      target.syncLocked = false;
      target.phaseErrorBeats = 0;
      if (this.nodes[targetDeck]) {
        this.applyAudioRateNow(targetDeck, this.pitchPercentToRate(target.pitchPercent), 1);
      }
      this.onStateChange();
      return;
    }

    // Assign opposite deck as Master clock and lock target deck as Slave (without starting playback)
    other.syncMaster = true;
    other.syncLocked = false;
    other.phaseErrorBeats = 0;
    if (this.nodes[otherId]) {
      this.applyAudioRateNow(otherId, this.pitchPercentToRate(other.pitchPercent), 1);
    }

    target.syncMaster = false;
    target.syncLocked = true;
    this.syncTempoToMaster(targetDeck, otherId);

    const now = ctx.currentTime;
    const lookahead = target.isPlaying ? 0.004 : 0;
    const evalTime = now + lookahead;
    const masterPos = this.computePositionAtCtxTime(otherId, evalTime);
    const masterBufBeat = 60 / other.detectedBpm;
    const mult = target.syncMultiplier || 1;
    const masterPhase = wrap01(((masterPos - other.beatOffsetSec) / masterBufBeat) * mult);

    const targetBufBeat = 60 / target.detectedBpm;
    const curTargetPos = this.computePositionAtCtxTime(targetDeck, evalTime);

    // Compute beat-grid aligned position matching Master's current fractional beat phase
    const targetBeatsFloat = (curTargetPos - target.beatOffsetSec) / targetBufBeat;
    const nearestBeat = Math.round(targetBeatsFloat - masterPhase);
    let alignedPos = target.beatOffsetSec + (nearestBeat + masterPhase) * targetBufBeat;
    if (alignedPos < 0) alignedPos += targetBufBeat;
    if (alignedPos >= target.durationSec) alignedPos = Math.max(0, alignedPos - targetBufBeat);
    alignedPos = Math.max(0, Math.min(Math.max(0, target.durationSec - 0.01), alignedPos));

    // Preserve downbeat cue if Target is paused right at Cue/start & Quantize is ON; otherwise align phase cleanly
    const sittingAtStartCue = !target.isPlaying && Math.abs(curTargetPos - target.beatOffsetSec) < 0.04;
    if (sittingAtStartCue && target.quantizeEnabled) {
      target.positionSec = target.beatOffsetSec;
      target.phaseErrorBeats = 0;
      if (this.nodes[targetDeck]) {
        this.nodes[targetDeck]!.offsetAtStartSec = target.beatOffsetSec;
        this.nodes[targetDeck]!.syncTrimRatio = 1;
      }
      this.onStateChange();
      return;
    }

    target.positionSec = alignedPos;
    target.phaseErrorBeats = 0;
    if (this.nodes[targetDeck]) {
      this.nodes[targetDeck]!.offsetAtStartSec = alignedPos;
      this.nodes[targetDeck]!.syncTrimRatio = 1;
    }

    // Rule #12: Never start playback automatically if paused
    if (target.isPlaying) {
      this.startSourceAt(targetDeck, alignedPos, evalTime);
    } else {
      this.onStateChange();
    }
  }

  private maintainSyncLock(): void {
    if (!this.ctx) return;
    const deckA = this.deckStates.DECK_A;
    const deckB = this.deckStates.DECK_B;
    if (!deckA.isLoaded || !deckB.isLoaded || deckA.detectedBpm <= 0 || deckB.detectedBpm <= 0) return;

    let slaveId: DeckId | null = null;
    let masterId: DeckId | null = null;
    if (deckB.syncLocked && !deckA.syncLocked) {
      slaveId = 'DECK_B';
      masterId = 'DECK_A';
    } else if (deckA.syncLocked && !deckB.syncLocked) {
      slaveId = 'DECK_A';
      masterId = 'DECK_B';
    } else {
      return;
    }

    const master = this.deckStates[masterId];
    const slave = this.deckStates[slaveId];
    const slaveNode = this.nodes[slaveId];
    const masterNode = this.nodes[masterId];
    if (!slaveNode || !masterNode) return;

    // 1. Keep Slave tempo continuously matched to Master (handles live Master tempo slides)
    const masterEffectiveBpm = master.detectedBpm * this.pitchPercentToRate(master.pitchPercent);
    const {pitchPercent: neededPitch, multiplier} = this.computeBestSyncTarget(
      slave.detectedBpm,
      masterEffectiveBpm
    );
    if (Math.abs(neededPitch) > slave.pitchRangePercent) {
      slave.pitchRangePercent = Math.abs(neededPitch) > 16 ? 50 : 16;
    }
    const maxAllowed = Math.min(MAX_SYNC_PITCH_PERCENT, slave.pitchRangePercent);
    const desiredPitch = Math.max(-maxAllowed, Math.min(maxAllowed, neededPitch));
    slave.syncMultiplier = multiplier;
    if (Math.abs(slave.pitchPercent - desiredPitch) > 0.005) {
      slave.pitchPercent = desiredPitch;
    }
    const desiredBaseRate = this.pitchPercentToRate(slave.pitchPercent);

    // 2. If both decks are actively playing (not quantized-waiting or scratching), run PLL drift correction
    if (!master.isPlaying || !slave.isPlaying || slave.quantizePending || slaveNode.isScratching || masterNode.isScratching) {
      if (Math.abs(slaveNode.basePlaybackRate - desiredBaseRate) > 0.0001 || Math.abs(slaveNode.syncTrimRatio - 1) > 0.0001) {
        this.applyAudioRateNow(slaveId, desiredBaseRate, 1);
      }
      slave.phaseErrorBeats = 0;
      return;
    }

    const now = this.ctx.currentTime;
    if (now < slaveNode.startedAtCtxTime || now < masterNode.startedAtCtxTime) {
      return;
    }

    const posM = this.computePositionAtCtxTime(masterId, now);
    const posS = this.computePositionAtCtxTime(slaveId, now);
    const masterBufBeat = 60 / master.detectedBpm;
    const slaveBufBeat = 60 / slave.detectedBpm;

    const phaseM = wrap01(((posM - master.beatOffsetSec) / masterBufBeat) * multiplier);
    const phaseS = wrap01((posS - slave.beatOffsetSec) / slaveBufBeat);
    const phaseErr = wrapSignedHalf(phaseM - phaseS); // positive = master is ahead, slave needs to speed up slightly
    slave.phaseErrorBeats = phaseErr;

    // Large sudden discontinuity (e.g. seek/loop mismatch): snap phase directly
    if (Math.abs(phaseErr) > 0.14) {
      const snappedPos = Math.max(
        0,
        Math.min(slave.durationSec - 0.01, posS + phaseErr * slaveBufBeat)
      );
      slaveNode.syncTrimRatio = 1;
      slave.phaseErrorBeats = 0;
      this.startSourceAt(slaveId, snappedPos, now + 0.004);
      return;
    }

    // Proportional PLL micro-trim eliminates drift smoothly without audible artifacts (< 0.7ms deadband)
    let targetTrim = 1;
    if (Math.abs(phaseErr) > 0.0015) {
      targetTrim = 1 + Math.max(-0.025, Math.min(0.025, phaseErr * 0.55));
    }

    if (
      Math.abs(slaveNode.basePlaybackRate - desiredBaseRate) > 0.0001 ||
      Math.abs(slaveNode.syncTrimRatio - targetTrim) > 0.0003
    ) {
      this.applyAudioRateNow(slaveId, desiredBaseRate, targetTrim, now);
    }
  }

  public setDeckVolume(deckId: DeckId, vol: number): void {
    this.deckStates[deckId].volume = Math.max(0, Math.min(1, vol));
    this.applyMixVolumes();
    this.onStateChange();
  }

  public setGainDb(deckId: DeckId, gainDb: number): void {
    this.deckStates[deckId].gainDb = Math.max(-12, Math.min(12, gainDb));
    this.applyMixVolumes();
    this.onStateChange();
  }

  public setEq(
    deckId: DeckId,
    updates: Partial<Pick<DeckState, 'eqLow' | 'eqMid' | 'eqHigh' | 'filterValue'>>
  ): void {
    const st = this.deckStates[deckId];
    if (updates.eqLow !== undefined) st.eqLow = Math.max(0, Math.min(1, updates.eqLow));
    if (updates.eqMid !== undefined) st.eqMid = Math.max(0, Math.min(1, updates.eqMid));
    if (updates.eqHigh !== undefined) st.eqHigh = Math.max(0, Math.min(1, updates.eqHigh));
    if (updates.filterValue !== undefined) st.filterValue = Math.max(0, Math.min(1, updates.filterValue));
    this.applyEqAndFx(deckId);
    this.onStateChange();
  }

  public toggleFxSlot(deckId: DeckId, idx: number): void {
    const st = this.deckStates[deckId];
    const slot = st.fxSlots[idx];
    if (!slot) return;
    slot.enabled = !slot.enabled;
    if (slot.type === 'Loop Out') {
      this.toggleLoop(deckId);
    }
    this.applyEqAndFx(deckId);
    this.onStateChange();
  }

  public setFxSlotType(deckId: DeckId, idx: number, type: FxType): void {
    const st = this.deckStates[deckId];
    if (!st.fxSlots[idx]) return;
    st.fxSlots[idx].type = type;
    this.applyEqAndFx(deckId);
    this.onStateChange();
  }

  public stepLoopSize(deckId: DeckId, dir: -1 | 1): void {
    const sizes = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
    const st = this.deckStates[deckId];
    const idx = Math.max(0, sizes.indexOf(st.loopBeats));
    const next = Math.max(0, Math.min(sizes.length - 1, idx + dir));
    st.loopBeats = sizes[next];
    if (st.loopActive && st.isLoaded) {
      // Loop boundaries live in buffer-time seconds (playbackRate already stretches buffer speed)
      const beatSecBuffer = 60 / (st.detectedBpm || 120);
      st.loopEndSec = Math.min(st.durationSec, st.loopStartSec + beatSecBuffer * st.loopBeats);
      const node = this.nodes[deckId];
      if (node?.source) {
        node.source.loopStart = st.loopStartSec;
        node.source.loopEnd = st.loopEndSec;
        (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
          const s = node.stemSources[k];
          if (s) {
            s.loopStart = st.loopStartSec;
            s.loopEnd = st.loopEndSec;
          }
        });
      }
    }
    this.onStateChange();
  }

  public toggleLoop(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node) return;

    if (st.loopActive) {
      const wrappedPos = this.computeCurrentPositionSec(deckId);
      st.loopActive = false;
      st.positionSec = wrappedPos;
      if (this.ctx && node.source) {
        node.offsetAtStartSec = wrappedPos;
        node.startedAtCtxTime = this.ctx.currentTime;
        node.source.loop = false;
        (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
          const s = node.stemSources[k];
          if (s) s.loop = false;
        });
      }
      this.maintainSyncLock();
    } else {
      // Buffer-time beat duration (unscaled by pitchPercent) keeps loop exact when pitched
      const beatSecBuffer = 60 / (st.detectedBpm || 120);
      const curPos = this.computeCurrentPositionSec(deckId);
      let start = curPos;
      if (st.quantizeEnabled && st.detectedBpm > 0) {
        const beatIdx = Math.round((curPos - st.beatOffsetSec) / beatSecBuffer);
        start = Math.max(0, Math.min(st.durationSec - 0.15, st.beatOffsetSec + beatIdx * beatSecBuffer));
      }
      const end = Math.min(st.durationSec, start + Math.max(0.08, beatSecBuffer * st.loopBeats));
      st.loopStartSec = start;
      st.loopEndSec = end;
      st.loopActive = true;

      if (st.isPlaying) {
        if (curPos >= start && curPos < end - 0.02 && node.source) {
          node.source.loopStart = start;
          node.source.loopEnd = end;
          node.source.loop = true;
          (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
            const s = node.stemSources[k];
            if (s) {
              s.loopStart = start;
              s.loopEnd = end;
              s.loop = true;
            }
          });
        } else {
          this.startSourceAt(deckId, start);
        }
      }
    }
    this.onStateChange();
  }

  public setPadMode(deckId: DeckId, mode: PadMode): void {
    this.deckStates[deckId].padMode = mode;
    this.onStateChange();
  }

  public toggleModFlag(deckId: DeckId, flag: 'slipEnabled' | 'beatJumpEnabled' | 'quantizeEnabled' | 'keyLockEnabled'): void {
    this.deckStates[deckId][flag] = !this.deckStates[deckId][flag];
    if (flag === 'keyLockEnabled') {
      this.applyKeyLockParams(deckId);
    }
    this.onStateChange();
  }

  private applyStemGains(deckId: DeckId): void {
    const node = this.nodes[deckId];
    const st = this.deckStates[deckId];
    if (!node || !this.ctx) return;

    const t = this.ctx.currentTime;
    const useSeparated = !st.stemBypassed && node.separatedStems !== null;
    if (useSeparated) {
      node.dryMixGain.gain.setTargetAtTime(0, t, 0.015);
      (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
        node.stemGains[k].gain.setTargetAtTime(st.activeStems[k] ? 1 : 0, t, 0.015);
      });
      // Bypass legacy fallback M/S filter when isolated stem buffers are driving the deck
      node.dryPassGain.gain.setTargetAtTime(1, t, 0.015);
      node.noAcapellaGain.gain.setTargetAtTime(0, t, 0.015);
      node.acapellaOnlyGain.gain.setTargetAtTime(0, t, 0.015);
    } else {
      node.dryMixGain.gain.setTargetAtTime(1, t, 0.015);
      (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[]).forEach((k) => {
        node.stemGains[k].gain.setTargetAtTime(0, t, 0.015);
      });
      node.dryPassGain.gain.setTargetAtTime(st.vocalMode === 'OFF' ? 1 : 0, t, 0.015);
      node.noAcapellaGain.gain.setTargetAtTime(st.vocalMode === 'REMOVE_ACAPELLA' ? 1 : 0, t, 0.015);
      node.acapellaOnlyGain.gain.setTargetAtTime(st.vocalMode === 'ACAPELLA_ONLY' ? 1.2 : 0, t, 0.015);
    }
  }

  private deriveVocalModeFromStems(st: DeckState): VocalMode {
    if (st.stemBypassed) return 'OFF';
    const {vocals, drums, bass, melody} = st.activeStems;
    if (vocals && !drums && !bass && !melody) return 'ACAPELLA_ONLY';
    if (!vocals && (drums || bass || melody)) return 'REMOVE_ACAPELLA';
    return 'OFF';
  }

  public async prepareDeckStems(deckId: DeckId, preferCloud = true): Promise<boolean> {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node?.buffer) {
      this.onError(`Load a track into ${deckId === 'DECK_A' ? 'Deck A' : 'Deck B'} before separating stems.`);
      return false;
    }

    const ctx = this.ensureAudioContext();
    const jobId = ++this.stemJobSeq[deckId];
    st.stemStatus = 'PROCESSING';
    st.stemError = null;
    this.onStateChange();

    try {
      const pack = await separateDeckAudioStems(
        ctx,
        node.buffer,
        st.title,
        st.detectedBpm || 120,
        st.musicalKey || '#?',
        preferCloud
      );
      if (this.stemJobSeq[deckId] !== jobId) {
        return false; // Track was replaced mid-separation
      }
      node.separatedStems = pack.stems;
      st.stemStatus = 'READY';
      st.stemSourceMode = pack.sourceMode;
      st.stemNote = pack.note;
      st.stemError = pack.cloudError;

      if (st.isPlaying) {
        const curPos = this.computeCurrentPositionSec(deckId);
        this.startSourceAt(deckId, curPos);
      } else {
        this.applyStemGains(deckId);
        this.onStateChange();
      }
      return true;
    } catch (err) {
      if (this.stemJobSeq[deckId] !== jobId) return false;
      const msg = err instanceof Error ? err.message : 'Stem separation failed.';
      st.stemStatus = 'ERROR';
      st.stemError = msg;
      st.stemBypassed = true;
      st.activeStems = {...ALL_STEMS_ON};
      st.vocalMode = 'OFF';
      this.applyStemGains(deckId);
      this.onError(`Deck ${deckId === 'DECK_A' ? 'A' : 'B'} stem separation failed: ${msg}`);
      this.onStateChange();
      return false;
    }
  }

  private async applyStemRequest(
    deckId: DeckId,
    nextSelection: DeckStemSelection,
    bypass: boolean,
    preferCloud = true
  ): Promise<void> {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isLoaded || !node?.buffer) {
      this.onError(`Load a track into ${deckId === 'DECK_A' ? 'Deck A' : 'Deck B'} first.`);
      return;
    }

    if (bypass) {
      this.restoreFullMix(deckId);
      return;
    }

    st.activeStems = {...nextSelection};
    st.stemBypassed = false;
    st.vocalMode = this.deriveVocalModeFromStems(st);

    if (node.separatedStems) {
      this.applyStemGains(deckId);
      this.onStateChange();
      return;
    }

    const ok = await this.prepareDeckStems(deckId, preferCloud);
    if (!ok) return;
    // Re-apply intended selection in case state synced while separating
    this.deckStates[deckId].activeStems = {...nextSelection};
    this.deckStates[deckId].stemBypassed = false;
    this.deckStates[deckId].vocalMode = this.deriveVocalModeFromStems(this.deckStates[deckId]);
    this.applyStemGains(deckId);
    this.onStateChange();
  }

  public isolateDeckStem(deckId: DeckId, stemKey: DeckStemKey): void {
    const st = this.deckStates[deckId];
    const isAlreadyIsolated =
      !st.stemBypassed &&
      st.activeStems[stemKey] &&
      (['vocals', 'drums', 'bass', 'melody'] as DeckStemKey[])
        .filter((k) => k !== stemKey)
        .every((k) => !st.activeStems[k]);

    if (isAlreadyIsolated) {
      this.restoreFullMix(deckId);
      return;
    }

    const mask: DeckStemSelection = {
      vocals: stemKey === 'vocals',
      drums: stemKey === 'drums',
      bass: stemKey === 'bass',
      melody: stemKey === 'melody',
    };
    void this.applyStemRequest(deckId, mask, false);
  }

  public toggleSingleStem(deckId: DeckId, stemKey: DeckStemKey): void {
    const st = this.deckStates[deckId];
    const base = st.stemBypassed ? {...ALL_STEMS_ON} : {...st.activeStems};
    const next: DeckStemSelection = {...base, [stemKey]: !base[stemKey]};
    const allEnabled = next.vocals && next.drums && next.bass && next.melody;
    void this.applyStemRequest(deckId, next, allEnabled);
  }

  public toggleInstrumentalMode(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    const isAlreadyInstru =
      !st.stemBypassed &&
      !st.activeStems.vocals &&
      st.activeStems.drums &&
      st.activeStems.bass &&
      st.activeStems.melody;

    if (isAlreadyInstru) {
      this.restoreFullMix(deckId);
      return;
    }

    void this.applyStemRequest(
      deckId,
      {vocals: false, drums: true, bass: true, melody: true},
      false
    );
  }

  public toggleStemsBypass(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    if (st.stemBypassed) {
      const anyDisabled =
        !st.activeStems.vocals || !st.activeStems.drums || !st.activeStems.bass || !st.activeStems.melody;
      const mask = anyDisabled ? st.activeStems : {vocals: false, drums: true, bass: true, melody: true};
      void this.applyStemRequest(deckId, mask, false);
    } else {
      this.restoreFullMix(deckId);
    }
  }

  public restoreFullMix(deckId: DeckId): void {
    const st = this.deckStates[deckId];
    st.stemBypassed = true;
    st.activeStems = {...ALL_STEMS_ON};
    st.vocalMode = 'OFF';
    this.applyStemGains(deckId);
    this.onStateChange();
  }

  public setVocalMode(deckId: DeckId, mode: VocalMode): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    if (mode === 'OFF') {
      this.restoreFullMix(deckId);
    } else if (mode === 'ACAPELLA_ONLY') {
      void this.applyStemRequest(deckId, {vocals: true, drums: false, bass: false, melody: false}, false);
    } else {
      void this.applyStemRequest(deckId, {vocals: false, drums: true, bass: true, melody: true}, false);
    }
  }

  public cycleVocalMode(deckId: DeckId): void {
    const curr = this.deckStates[deckId].vocalMode;
    const next: VocalMode =
      curr === 'OFF'
        ? 'ACAPELLA_ONLY'
        : curr === 'ACAPELLA_ONLY'
        ? 'REMOVE_ACAPELLA'
        : 'OFF';
    this.setVocalMode(deckId, next);
  }

  private async restoreCustomSamplers(): Promise<void> {
    const saved = await loadSavedSamplerBank();
    if (!saved) return;
    this.samplerPads = saved.pads;
    saved.audioBytesById.forEach((bytes, id) => {
      this.samplerRawBytes.set(id, bytes);
    });
    this.onStateChange();
  }

  private setPadPlayingFlag(padId: string, playing: boolean): void {
    this.samplerPads = this.samplerPads.map((p) =>
      p.id === padId ? {...p, isPlaying: playing} : p
    );
    this.onStateChange();
  }

  private async getOrDecodeSamplerBuffer(ctx: AudioContext, padId: string): Promise<AudioBuffer | null> {
    const cached = this.samplerBuffers.get(padId);
    if (cached) return cached;
    const raw = this.samplerRawBytes.get(padId);
    if (!raw) return null;
    try {
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      this.samplerBuffers.set(padId, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  public triggerSamplerPad(padIdOrIndex: string | number): void {
    const pad =
      typeof padIdOrIndex === 'number'
        ? this.samplerPads[padIdOrIndex]
        : this.samplerPads.find((p) => p.id === padIdOrIndex);
    if (!pad) return;

    if (pad.loop && pad.isPlaying) {
      this.stopSamplerPad(pad.id);
      return;
    }

    const ctx = this.ensureAudioContext();
    if (!this.masterGain) return;

    if (pad.sourceType !== 'BUILTIN') {
      void this.playCustomSamplerPad(ctx, pad);
      return;
    }

    const synthIdx = pad.builtinSynthIndex ?? 0;
    const now = ctx.currentTime;
    const volScale = Math.max(0.05, Math.min(1.5, pad.volume));

    const prevTimer = this.samplerPulseTimers.get(pad.id);
    if (prevTimer) window.clearTimeout(prevTimer);
    this.setPadPlayingFlag(pad.id, true);
    const pulseMs = Math.max(120, Math.round(pad.durationSec * 1000));
    this.samplerPulseTimers.set(
      pad.id,
      window.setTimeout(() => {
        this.samplerPulseTimers.delete(pad.id);
        this.setPadPlayingFlag(pad.id, false);
      }, pulseMs)
    );

    if (synthIdx === 1 || synthIdx === 2 || synthIdx === 3) {
      this.triggerNoiseBurst(ctx, synthIdx === 2 ? 6000 : 1400, synthIdx === 2 ? 0.08 : 0.22, volScale);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    switch (synthIdx) {
      case 0: // KICK
        osc.type = 'sine';
        osc.frequency.setValueAtTime(145, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);
        gain.gain.setValueAtTime(0.85 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 4: // AIRHORN
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(466, now + 0.35);
        gain.gain.setValueAtTime(0.4 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.46);
        break;
      case 5: // SIREN
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(1040, now + 0.3);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.6);
        gain.gain.setValueAtTime(0.35 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
        osc.start(now);
        osc.stop(now + 0.64);
        break;
      case 6: // RISER
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.65);
        gain.gain.setValueAtTime(0.28 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.72);
        break;
      default: // DROP
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + 0.5);
        gain.gain.setValueAtTime(0.8 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.56);
        break;
    }
  }

  private async playCustomSamplerPad(ctx: AudioContext, pad: SamplerPadState): Promise<void> {
    if (!this.masterGain) return;
    const buffer = await this.getOrDecodeSamplerBuffer(ctx, pad.id);
    if (!buffer) {
      this.onError(`Unable to play sampler "${pad.label}": audio buffer not found.`);
      return;
    }

    // Stop any previous active instance on this pad so re-triggers stay crisp
    this.stopSamplerPad(pad.id, true);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = pad.loop;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1.5, pad.volume));
    src.connect(gain);
    gain.connect(this.masterGain);

    this.activeSamplerSources.set(pad.id, {source: src, gain});
    this.setPadPlayingFlag(pad.id, true);

    src.onended = () => {
      const current = this.activeSamplerSources.get(pad.id);
      if (current && current.source === src) {
        this.activeSamplerSources.delete(pad.id);
        this.setPadPlayingFlag(pad.id, false);
      }
    };
    src.start();
  }

  public stopSamplerPad(padId: string, silent = false): void {
    const active = this.activeSamplerSources.get(padId);
    if (active) {
      this.activeSamplerSources.delete(padId);
      try {
        active.source.onended = null;
        active.source.stop();
        active.source.disconnect();
        active.gain.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    const timer = this.samplerPulseTimers.get(padId);
    if (timer) {
      window.clearTimeout(timer);
      this.samplerPulseTimers.delete(padId);
    }
    if (!silent) {
      this.setPadPlayingFlag(padId, false);
    }
  }

  public stopAllSamplers(): void {
    Array.from(this.activeSamplerSources.keys()).forEach((id) => this.stopSamplerPad(id, true));
    this.samplerPulseTimers.forEach((t) => window.clearTimeout(t));
    this.samplerPulseTimers.clear();
    this.samplerPads = this.samplerPads.map((p) => (p.isPlaying ? {...p, isPlaying: false} : p));
    this.onStateChange();
  }

  public async addCustomSamplerFromFile(
    file: File,
    options?: {label?: string; loop?: boolean; volume?: number; color?: string | null}
  ): Promise<SamplerPadState | null> {
    const label = options?.label?.trim()
      ? options.label.trim().slice(0, 18).toUpperCase()
      : deriveShortPadLabel(file.name);
    return this.addCustomSamplerFromBlob(file, label, 'CUSTOM_FILE', file.name, options);
  }

  public async addCustomSamplerFromBlob(
    blob: Blob,
    label: string,
    sourceType: SamplerSourceType,
    fileName?: string,
    options?: {loop?: boolean; volume?: number; color?: string | null}
  ): Promise<SamplerPadState | null> {
    const ctx = this.ensureAudioContext();
    try {
      const bytes = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      const padId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const cleanLabel = (label || 'SAMPLE').trim().slice(0, 18).toUpperCase();
      const newPad: SamplerPadState = {
        id: padId,
        label: cleanLabel,
        sourceType,
        builtinSynthIndex: null,
        fileName: fileName ?? `${cleanLabel}.wav`,
        volume: options?.volume ?? 0.95,
        loop: options?.loop ?? false,
        color: options?.color ?? '#2188FF',
        durationSec: Number(decoded.duration.toFixed(2)),
        isPlaying: false,
      };
      this.samplerBuffers.set(padId, decoded);
      this.samplerRawBytes.set(padId, bytes);
      this.samplerPads = [...this.samplerPads, newPad];
      await saveSamplerAudioBytes(padId, bytes);
      await saveSamplerBankMeta(this.samplerPads);
      this.onStateChange();
      return newPad;
    } catch {
      this.onError(`Could not decode audio "${fileName ?? label}". Please pick MP3, WAV, OGG, M4A, or WEBM.`);
      return null;
    }
  }

  public async replaceSamplerFromFile(
    padId: string,
    file: File,
    labelOverride?: string
  ): Promise<boolean> {
    const label = labelOverride?.trim()
      ? labelOverride.trim().slice(0, 18).toUpperCase()
      : deriveShortPadLabel(file.name);
    return this.replaceSamplerFromBlob(padId, file, label, 'CUSTOM_FILE', file.name);
  }

  public async replaceSamplerFromBlob(
    padId: string,
    blob: Blob,
    label: string,
    sourceType: SamplerSourceType,
    fileName?: string
  ): Promise<boolean> {
    const ctx = this.ensureAudioContext();
    const exists = this.samplerPads.some((p) => p.id === padId);
    if (!exists) return false;
    try {
      const bytes = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      this.stopSamplerPad(padId, true);
      this.samplerBuffers.set(padId, decoded);
      this.samplerRawBytes.set(padId, bytes);
      const cleanLabel = (label || 'SAMPLE').trim().slice(0, 18).toUpperCase();
      this.samplerPads = this.samplerPads.map((p) =>
        p.id === padId
          ? {
              ...p,
              label: cleanLabel,
              sourceType,
              fileName: fileName ?? `${cleanLabel}.wav`,
              durationSec: Number(decoded.duration.toFixed(2)),
              isPlaying: false,
            }
          : p
      );
      await saveSamplerAudioBytes(padId, bytes);
      await saveSamplerBankMeta(this.samplerPads);
      this.onStateChange();
      return true;
    } catch {
      this.onError(`Could not decode audio "${fileName ?? label}".`);
      return false;
    }
  }

  public async captureDeckClipToSampler(
    deckId: DeckId,
    durationSec = 4,
    targetPadId?: string | null,
    customLabel?: string
  ): Promise<SamplerPadState | null> {
    const node = this.nodes[deckId];
    const deck = this.deckStates[deckId];
    if (!node?.buffer || !deck.isLoaded) {
      this.onError(`Load a track into ${deckId === 'DECK_A' ? 'Deck A' : 'Deck B'} before capturing a sample.`);
      return null;
    }
    const startSec = this.computeCurrentPositionSec(deckId);
    const clipDur = Math.min(durationSec, Math.max(0.25, node.buffer.duration - startSec));
    const wavBytes = encodeAudioSliceToWavArrayBuffer(node.buffer, startSec, clipDur);
    const blob = new Blob([wavBytes], {type: 'audio/wav'});
    const defaultLabel =
      customLabel?.trim() || `${deckId === 'DECK_A' ? 'A' : 'B'}-${deriveShortPadLabel(deck.title)}`.slice(0, 14);
    if (targetPadId) {
      const ok = await this.replaceSamplerFromBlob(targetPadId, blob, defaultLabel, 'DECK_CAPTURE', `${defaultLabel}.wav`);
      return ok ? this.samplerPads.find((p) => p.id === targetPadId) ?? null : null;
    }
    return this.addCustomSamplerFromBlob(blob, defaultLabel, 'DECK_CAPTURE', `${defaultLabel}.wav`);
  }

  public updateSamplerPad(
    padId: string,
    patch: Partial<Pick<SamplerPadState, 'label' | 'volume' | 'loop' | 'color'>>
  ): void {
    this.samplerPads = this.samplerPads.map((p) => {
      if (p.id !== padId) return p;
      const nextLabel =
        patch.label !== undefined
          ? patch.label.trim().slice(0, 18).toUpperCase() || p.label
          : p.label;
      return {
        ...p,
        ...patch,
        label: nextLabel,
      };
    });
    const active = this.activeSamplerSources.get(padId);
    if (active) {
      if (patch.volume !== undefined) {
        active.gain.gain.value = Math.max(0, Math.min(1.5, patch.volume));
      }
      if (patch.loop !== undefined) {
        active.source.loop = patch.loop;
      }
    }
    void saveSamplerBankMeta(this.samplerPads);
    this.onStateChange();
  }

  public async removeOrResetSamplerPad(padId: string): Promise<void> {
    this.stopSamplerPad(padId, true);
    this.samplerBuffers.delete(padId);
    this.samplerRawBytes.delete(padId);
    await deleteSamplerAudioBytes(padId);

    const builtinMatch = DEFAULT_BUILTIN_SAMPLERS.find((b) => b.id === padId);
    if (builtinMatch) {
      this.samplerPads = this.samplerPads.map((p) => (p.id === padId ? {...builtinMatch} : p));
    } else {
      this.samplerPads = this.samplerPads.filter((p) => p.id !== padId);
    }
    await saveSamplerBankMeta(this.samplerPads);
    this.onStateChange();
  }

  private triggerNoiseBurst(
    ctx: AudioContext,
    cutoffHz: number,
    durationSec: number,
    volScale = 1
  ): void {
    if (!this.masterGain) return;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSec), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / data.length) * 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoffHz;
    const g = ctx.createGain();
    g.gain.value = 0.55 * volScale;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start();
  }

  public triggerScratchAction(deckId: DeckId, padIndex: number): void {
    const st = this.deckStates[deckId];
    if (!st.isLoaded) return;
    const cur = this.computeCurrentPositionSec(deckId);
    const beatSec = 60 / (st.detectedBpm || 120);
    switch (padIndex) {
      case 0: // -4 BEAT
        this.seekTo(deckId, cur - beatSec * 4);
        break;
      case 1: // +4 BEAT
        this.seekTo(deckId, cur + beatSec * 4);
        break;
      case 2: // 1/2X
        this.setPitchPercent(deckId, -50);
        break;
      case 3: // 2X
        this.setPitchPercent(deckId, 50);
        break;
      case 4: // SPINBK
        this.nudgePlatter(deckId, -540);
        break;
      case 5: // BRAKE
        this.stop(deckId);
        break;
      case 6: // STUTTER
        this.seekTo(deckId, st.cuePointSec);
        if (!st.isPlaying) this.togglePlayPause(deckId);
        break;
      default: // ROLL 1/4
        st.loopBeats = 0.25;
        if (!st.loopActive) this.toggleLoop(deckId);
        break;
    }
  }

  public setCrossfader(val: number, cancelAuto = true): void {
    if (cancelAuto && this.xfadeAnimRaf !== null) {
      cancelAnimationFrame(this.xfadeAnimRaf);
      this.xfadeAnimRaf = null;
    }
    this.crossfader = Math.max(0, Math.min(1, val));
    this.applyMixVolumes();
    this.onStateChange();
  }

  public animateCrossfaderTo(target: number, durationMs = 2000): void {
    if (this.xfadeAnimRaf !== null) {
      cancelAnimationFrame(this.xfadeAnimRaf);
      this.xfadeAnimRaf = null;
    }
    const startVal = this.crossfader;
    const destVal = Math.max(0, Math.min(1, target));
    if (Math.abs(destVal - startVal) < 0.005) {
      this.setCrossfader(destVal, false);
      return;
    }
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      // Smooth S-curve easing
      const eased = t * t * (3 - 2 * t);
      this.setCrossfader(startVal + (destVal - startVal) * eased, false);
      if (t < 1) {
        this.xfadeAnimRaf = requestAnimationFrame(step);
      } else {
        this.xfadeAnimRaf = null;
      }
    };
    this.xfadeAnimRaf = requestAnimationFrame(step);
  }

  public setMasterVolume(val: number): void {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    this.onStateChange();
  }

  public applySettings(settings: DjSettings): void {
    this.crossfaderCurve = settings.crossfaderCurve;
    this.liteMode = settings.liteMode;
    this.applyMixVolumes();
  }

  public registerVideoElement(deckId: DeckId, el: HTMLVideoElement | null): void {
    this.videoElements[deckId] = el;
  }

  public setRecordingMode(mode: RecordingMode): void {
    if (this.recordingState.status !== 'IDLE') return;
    this.recordingState = {...this.recordingState, mode};
    this.onStateChange();
  }

  public clearSavedRecording(): void {
    if (this.recordingState.lastSaved?.url) {
      URL.revokeObjectURL(this.recordingState.lastSaved.url);
    }
    this.recordingState = {...this.recordingState, lastSaved: null};
    this.onStateChange();
  }

  private startVideoRecordCompositor(): MediaStream {
    const w = this.liteMode ? 640 : 960;
    const h = this.liteMode ? 360 : 540;
    if (!this.recordCanvas) {
      this.recordCanvas = document.createElement('canvas');
    }
    this.recordCanvas.width = w;
    this.recordCanvas.height = h;
    const ctx2d = this.recordCanvas.getContext('2d')!;

    const drawFrame = () => {
      if (this.recordingState.status !== 'RECORDING') return;
      ctx2d.fillStyle = '#07090D';
      ctx2d.fillRect(0, 0, w, h);

      const vidA = this.videoElements.DECK_A;
      const vidB = this.videoElements.DECK_B;
      const hasVidA = !!(vidA && this.deckStates.DECK_A.videoUrl && vidA.readyState >= 2);
      const hasVidB = !!(vidB && this.deckStates.DECK_B.videoUrl && vidB.readyState >= 2);

      const drawContained = (el: HTMLVideoElement, alpha: number) => {
        if (alpha <= 0.01) return;
        const vw = el.videoWidth || w;
        const vh = el.videoHeight || h;
        const scale = Math.min(w / vw, h / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        ctx2d.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ctx2d.restore();
      };

      if (hasVidA || hasVidB) {
        if (hasVidA && vidA) drawContained(vidA, 1 - this.crossfader);
        if (hasVidB && vidB) drawContained(vidB, this.crossfader);
      } else {
        // Sleek Studio Audio-Reactive Visualizer Backdrop when recording A/V with audio tracks
        const cx = w / 2;
        const cy = h / 2;
        const vuA = this.deckStates.DECK_A.vuLevel * (1 - this.crossfader);
        const vuB = this.deckStates.DECK_B.vuLevel * this.crossfader;
        const energy = Math.min(1, vuA + vuB);

        const grad = ctx2d.createRadialGradient(cx, cy, 12, cx, cy, w * 0.55);
        grad.addColorStop(0, `rgba(33,136,255,${0.18 + energy * 0.25})`);
        grad.addColorStop(0.5, `rgba(255,122,0,${0.08 + vuB * 0.2})`);
        grad.addColorStop(1, '#07090D');
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(0, 0, w, h);

        // Dual waveform bars
        const bars = 48;
        const barW = (w - 80) / bars;
        const peaksA = this.deckStates.DECK_A.waveform;
        const peaksB = this.deckStates.DECK_B.waveform;
        const idxA =
          peaksA.length && this.deckStates.DECK_A.durationSec > 0
            ? Math.floor((this.deckStates.DECK_A.positionSec / this.deckStates.DECK_A.durationSec) * (peaksA.length - 1))
            : 0;
        const idxB =
          peaksB.length && this.deckStates.DECK_B.durationSec > 0
            ? Math.floor((this.deckStates.DECK_B.positionSec / this.deckStates.DECK_B.durationSec) * (peaksB.length - 1))
            : 0;

        for (let i = 0; i < bars; i++) {
          const pA = peaksA.length ? peaksA[Math.max(0, Math.min(peaksA.length - 1, idxA - 24 + i))].amplitude : 0.08;
          const pB = peaksB.length ? peaksB[Math.max(0, Math.min(peaksB.length - 1, idxB - 24 + i))].amplitude : 0.08;
          const amp = Math.min(1, pA * (1 - this.crossfader) * (0.4 + vuA) + pB * this.crossfader * (0.4 + vuB));
          const bh = Math.max(8, amp * (h * 0.45));
          ctx2d.fillStyle = i < bars / 2 ? '#2188FF' : '#FF7A00';
          ctx2d.fillRect(40 + i * barW, cy - bh / 2, Math.max(3, barW - 3), bh);
        }
      }

      // Subtle ChronixDJ Pro Mix Overlay
      ctx2d.fillStyle = 'rgba(7, 9, 13, 0.7)';
      ctx2d.fillRect(14, h - 42, w - 28, 28);
      ctx2d.fillStyle = '#2188FF';
      ctx2d.font = 'bold 12px sans-serif';
      ctx2d.fillText(`A: ${this.deckStates.DECK_A.title.slice(0, 26)}`, 24, h - 24);
      ctx2d.fillStyle = '#FF7A00';
      ctx2d.textAlign = 'right';
      ctx2d.fillText(`B: ${this.deckStates.DECK_B.title.slice(0, 26)}`, w - 24, h - 24);
      ctx2d.textAlign = 'left';
    };

    const fps = this.liteMode ? 24 : 30;
    drawFrame();
    this.recordDrawTimer = window.setInterval(drawFrame, Math.round(1000 / fps));
    return this.recordCanvas.captureStream(fps);
  }

  public startRecording(): void {
    this.ensureAudioContext();
    if (!this.recordDest || this.recordingState.status !== 'IDLE') return;
    try {
      this.recordedChunks = [];
      const mode = this.recordingState.mode;
      const tracks: MediaStreamTrack[] = [...this.recordDest.stream.getAudioTracks()];
      if (mode === 'VIDEO') {
        const videoStream = this.startVideoRecordCompositor();
        tracks.unshift(...videoStream.getVideoTracks());
      }
      const combined = new MediaStream(tracks);
      this.recordStream = combined;

      const mimeCandidates =
        mode === 'VIDEO'
          ? ['video/webm;codecs=vp8,opus', 'video/webm']
          : ['audio/webm;codecs=opus', 'audio/webm'];
      const chosenMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = chosenMime
        ? new MediaRecorder(combined, {mimeType: chosenMime})
        : new MediaRecorder(combined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      recorder.onstop = () => {
        if (this.recordDrawTimer !== null) {
          window.clearInterval(this.recordDrawTimer);
          this.recordDrawTimer = null;
        }
        this.recordStream?.getVideoTracks().forEach((t) => t.stop());
        this.recordStream = null;

        const outMime = mode === 'VIDEO' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(this.recordedChunks, {type: outMime});
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
        const ext = mode === 'VIDEO' ? 'AV_Mix' : 'Audio_Mix';
        const fileName = `ChronixDJ_${ext}_${stamp}.webm`;
        const durationSec = Math.max(1, this.recordingState.elapsedSec);
        if (this.recordingState.lastSaved?.url) {
          URL.revokeObjectURL(this.recordingState.lastSaved.url);
        }
        this.recordingState = {
          status: 'IDLE',
          mode,
          elapsedSec: 0,
          lastSaved: {url, name: fileName, mode, durationSec},
        };
        this.isRecording = false;
        this.onRecordingComplete(url, fileName);
        this.onStateChange();
      };

      this.recordAccumulatedMs = 0;
      this.recordSegmentStartMs = performance.now();
      recorder.start(500);
      this.mediaRecorder = recorder;
      this.isRecording = true;
      this.recordingState = {
        ...this.recordingState,
        status: 'RECORDING',
        elapsedSec: 0,
      };
      this.onStateChange();
    } catch {
      if (this.recordDrawTimer !== null) {
        window.clearInterval(this.recordDrawTimer);
        this.recordDrawTimer = null;
      }
      this.onError('Mix recording is not supported in this browser session.');
    }
  }

  public pauseRecording(): void {
    if (this.recordingState.status !== 'RECORDING' || !this.mediaRecorder) return;
    try {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.pause();
      }
      this.recordAccumulatedMs += performance.now() - this.recordSegmentStartMs;
      this.isRecording = false;
      this.recordingState = {
        ...this.recordingState,
        status: 'PAUSED',
        elapsedSec: Math.floor(this.recordAccumulatedMs / 1000),
      };
      this.onStateChange();
    } catch {
      this.onError('Pause recording is not supported in this browser.');
    }
  }

  public resumeRecording(): void {
    if (this.recordingState.status !== 'PAUSED' || !this.mediaRecorder) return;
    try {
      if (this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
      }
      this.recordSegmentStartMs = performance.now();
      this.isRecording = true;
      this.recordingState = {
        ...this.recordingState,
        status: 'RECORDING',
      };
      this.onStateChange();
    } catch {
      this.onError('Resume recording is not supported in this browser.');
    }
  }

  public stopRecording(): void {
    if (this.recordingState.status === 'IDLE' || !this.mediaRecorder) return;
    if (this.recordingState.status === 'RECORDING') {
      this.recordAccumulatedMs += performance.now() - this.recordSegmentStartMs;
      this.recordingState.elapsedSec = Math.floor(this.recordAccumulatedMs / 1000);
    }
    try {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch {
      this.isRecording = false;
      this.recordingState = {...this.recordingState, status: 'IDLE'};
      this.onStateChange();
    }
  }

  public toggleRecording(): void {
    if (this.recordingState.status === 'IDLE') {
      this.startRecording();
    } else {
      this.stopRecording();
    }
  }

  private applyEqAndFx(deckId: DeckId): void {
    const node = this.nodes[deckId];
    const st = this.deckStates[deckId];
    if (!node || !this.ctx) return;

    const toDb = (val: number) => (val < 0.5 ? (val * 2 - 1) * 24 : (val - 0.5) * 2 * 12);
    node.lowEq.gain.setTargetAtTime(toDb(st.eqLow), this.ctx.currentTime, 0.015);
    node.midEq.gain.setTargetAtTime(toDb(st.eqMid), this.ctx.currentTime, 0.015);
    node.highEq.gain.setTargetAtTime(toDb(st.eqHigh), this.ctx.currentTime, 0.015);

    const hpFx = st.fxSlots.some((s) => s.enabled && s.type === 'High-Pass');
    const lpFx = st.fxSlots.some((s) => s.enabled && s.type === 'Low-Pass');

    if (st.filterValue < 0.47 || lpFx) {
      node.sweepFilter.type = 'lowpass';
      const norm = lpFx ? 0.25 : st.filterValue / 0.47;
      node.sweepFilter.frequency.setTargetAtTime(140 + Math.pow(norm, 2) * 16000, this.ctx.currentTime, 0.02);
      node.sweepFilter.Q.value = 1.4;
    } else if (st.filterValue > 0.53 || hpFx) {
      node.sweepFilter.type = 'highpass';
      const norm = hpFx ? 0.65 : (st.filterValue - 0.53) / 0.47;
      node.sweepFilter.frequency.setTargetAtTime(60 + Math.pow(norm, 2) * 6500, this.ctx.currentTime, 0.02);
      node.sweepFilter.Q.value = 1.4;
    } else {
      node.sweepFilter.type = 'allpass';
      node.sweepFilter.Q.value = 0.7;
    }

    const echoOn = st.fxSlots.some((s) => s.enabled && (s.type === 'Echo Out' || s.type === 'Flanger'));
    const reverbOn = st.fxSlots.some((s) => s.enabled && s.type === 'Reverb Out');
    const flangerOn = st.fxSlots.some((s) => s.enabled && s.type === 'Flanger');
    if (flangerOn) {
      node.delayNode.delayTime.setTargetAtTime(0.006, this.ctx.currentTime, 0.01);
      node.flangerLfoGain.gain.setTargetAtTime(0.004, this.ctx.currentTime, 0.02);
      node.delayFeedback.gain.value = 0.68;
    } else {
      node.flangerLfoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      const bpm = st.detectedBpm || 120;
      node.delayNode.delayTime.setTargetAtTime(Math.min(1.5, (60 / bpm) * 0.75), this.ctx.currentTime, 0.02);
      node.delayFeedback.gain.value = 0.42;
    }
    node.delayWet.gain.setTargetAtTime(echoOn ? 0.52 : 0, this.ctx.currentTime, 0.02);
    node.reverbWet.gain.setTargetAtTime(reverbOn ? 0.55 : 0, this.ctx.currentTime, 0.02);
  }

  private applyMixVolumes(): void {
    const xf = this.crossfader;
    let xfA = 1;
    let xfB = 1;
    if (this.crossfaderCurve === 'EQUAL_POWER') {
      xfA = Math.cos((xf * Math.PI) / 2);
      xfB = Math.sin((xf * Math.PI) / 2);
    } else if (this.crossfaderCurve === 'LINEAR') {
      xfA = 1 - xf;
      xfB = xf;
    } else {
      xfA = xf > 0.92 ? 0 : 1;
      xfB = xf < 0.08 ? 0 : 1;
    }

    (['DECK_A', 'DECK_B'] as DeckId[]).forEach((id) => {
      const node = this.nodes[id];
      const st = this.deckStates[id];
      if (!node || !this.ctx) return;
      const gainMult = Math.pow(10, st.gainDb / 20);
      node.gainNode.gain.setTargetAtTime(gainMult, this.ctx.currentTime, 0.015);
      node.volumeGain.gain.setTargetAtTime(st.volume, this.ctx.currentTime, 0.015);
      node.xfadeGain.gain.setTargetAtTime(id === 'DECK_A' ? xfA : xfB, this.ctx.currentTime, 0.015);
    });
  }

  private computePositionAtCtxTime(deckId: DeckId, ctxTime: number): number {
    const st = this.deckStates[deckId];
    const node = this.nodes[deckId];
    if (!st.isPlaying || !node || !this.ctx) return st.positionSec;
    if (ctxTime < node.startedAtCtxTime) {
      return st.positionSec;
    }
    const elapsed = (ctxTime - node.startedAtCtxTime) * node.playbackRate;
    let pos = node.offsetAtStartSec + elapsed;
    if (st.loopActive && st.loopEndSec > st.loopStartSec && pos >= st.loopStartSec) {
      const loopLen = st.loopEndSec - st.loopStartSec;
      pos = st.loopStartSec + ((pos - st.loopStartSec) % loopLen);
    }
    return Math.min(st.durationSec, Math.max(0, pos));
  }

  private computeCurrentPositionSec(deckId: DeckId): number {
    if (!this.ctx) return this.deckStates[deckId].positionSec;
    return this.computePositionAtCtxTime(deckId, this.ctx.currentTime);
  }

  private startTickLoop(): void {
    const bufA = new Uint8Array(128);
    const bufB = new Uint8Array(128);

    const tick = (now: number) => {
      const minInterval = this.liteMode ? 40 : 16; // 25fps in Lite Mode, 60fps otherwise
      if (now - this.lastTickTime < minInterval) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      this.lastTickTime = now;

      let changed = false;
      (['DECK_A', 'DECK_B'] as DeckId[]).forEach((id) => {
        const st = this.deckStates[id];
        const node = this.nodes[id];
        if (!st.isLoaded || !node) return;
        if (st.isPlaying) {
          const ctxTime = this.ctx?.currentTime ?? 0;
          if (st.quantizePending && ctxTime >= node.startedAtCtxTime) {
            st.quantizePending = false;
            changed = true;
          }
          if (!st.quantizePending) {
            st.positionSec = this.computeCurrentPositionSec(id);
            const degPerSec = 200 * node.playbackRate;
            st.platterDegrees = (st.platterDegrees + degPerSec * (minInterval / 1000)) % 360;

            const data = id === 'DECK_A' ? bufA : bufB;
            node.analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (let i = 0; i < data.length; i += 2) {
              const v = Math.abs(data[i] - 128) / 128;
              if (v > peak) peak = v;
            }
            st.vuLevel = Math.min(1, peak * 1.8);
          }
          changed = true;
        } else if (st.vuLevel > 0.01) {
          st.vuLevel = 0;
          changed = true;
        }
      });

      this.maintainSyncLock();

      if (this.recordingState.status === 'RECORDING') {
        const nextSec = Math.floor(
          (this.recordAccumulatedMs + (performance.now() - this.recordSegmentStartMs)) / 1000
        );
        if (nextSec !== this.recordingState.elapsedSec) {
          this.recordingState = {...this.recordingState, elapsedSec: nextSec};
          changed = true;
        }
      }

      if (changed) {
        this.onStateChange();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.xfadeAnimRaf !== null) cancelAnimationFrame(this.xfadeAnimRaf);
    if (this.recordDrawTimer !== null) window.clearInterval(this.recordDrawTimer);
    this.stopAllSamplers();
    this.stopSource('DECK_A');
    this.stopSource('DECK_B');
    if (this.ctx) void this.ctx.close();
  }
}
