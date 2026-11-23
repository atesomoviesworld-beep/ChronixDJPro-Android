export type AppSection = 'MASTER' | 'VIDEO' | 'STEMS' | 'SETTINGS';

export type MasterCenterMode = 'MIXER_EQ' | 'WAVEFORM' | 'VIDEO_PREVIEW';

export type DeckId = 'DECK_A' | 'DECK_B';

export type PadMode = 'CUE' | 'SMP' | 'SCRT' | 'STEMS';

export type VocalMode = 'OFF' | 'REMOVE_ACAPELLA' | 'ACAPELLA_ONLY';

export type FxType =
  | 'Echo Out'
  | 'Reverb Out'
  | 'Loop Out'
  | 'Flanger'
  | 'High-Pass'
  | 'Low-Pass';

export const FX_TYPES: FxType[] = [
  'Echo Out',
  'Reverb Out',
  'Loop Out',
  'Flanger',
  'High-Pass',
  'Low-Pass',
];

export interface FxSlotState {
  type: FxType;
  enabled: boolean;
  intensity: number;
}

export interface HotCuePoint {
  index: number;
  positionSec: number | null;
}

export type SamplerSourceType = 'BUILTIN' | 'CUSTOM_FILE' | 'MIC_RECORDING' | 'DECK_CAPTURE';

export interface SamplerPadState {
  id: string;
  label: string;
  sourceType: SamplerSourceType;
  builtinSynthIndex: number | null;
  fileName: string | null;
  volume: number;
  loop: boolean;
  color: string | null;
  durationSec: number;
  isPlaying: boolean;
}

export interface WaveformPeak {
  amplitude: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
}

export type DeckStemKey = 'vocals' | 'drums' | 'bass' | 'melody';

export type DeckStemStatus = 'IDLE' | 'PROCESSING' | 'READY' | 'ERROR';

export type DeckStemSourceMode = 'CLOUD_AI' | 'OFFLINE_DSP' | null;

export interface DeckStemSelection {
  vocals: boolean;
  drums: boolean;
  bass: boolean;
  melody: boolean;
}

export interface StemSeparationParams {
  bassCutoffHz: number;
  vocalLowHz: number;
  vocalHighHz: number;
  drumsHighCutoffHz: number;
  vocalCenterBias: number;
  transientSensitivity: number;
  analysisNote?: string;
}

export interface DeckState {
  deckId: DeckId;
  title: string;
  isLoaded: boolean;
  isVideo: boolean;
  videoUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  durationSec: number;
  positionSec: number;
  cuePointSec: number;
  cuePreviewing: boolean;
  detectedBpm: number;
  beatOffsetSec: number;
  musicalKey: string;
  pitchPercent: number;
  pitchRangePercent: 8 | 16 | 50;
  keyLockEnabled: boolean;
  slipEnabled: boolean;
  beatJumpEnabled: boolean;
  quantizeEnabled: boolean;
  syncLocked: boolean;
  syncMaster: boolean;
  syncMultiplier: number;
  quantizePending: boolean;
  phaseErrorBeats: number;
  vocalMode: VocalMode;
  stemStatus: DeckStemStatus;
  stemSourceMode: DeckStemSourceMode;
  stemNote: string | null;
  stemError: string | null;
  stemBypassed: boolean;
  activeStems: DeckStemSelection;
  volume: number;
  gainDb: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  filterValue: number;
  loopBeats: number;
  loopActive: boolean;
  loopStartSec: number;
  loopEndSec: number;
  padMode: PadMode;
  hotCues: HotCuePoint[];
  fxSlots: FxSlotState[];
  waveform: WaveformPeak[];
  vuLevel: number;
  platterDegrees: number;
}

export type StemType = 'VOCALS' | 'DRUMS' | 'BASS' | 'INSTRUMENTAL';

export const STEM_TYPES: StemType[] = ['VOCALS', 'DRUMS', 'BASS', 'INSTRUMENTAL'];

export interface StemChannelState {
  type: StemType;
  label: string;
  fileName: string;
  isLoaded: boolean;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
  durationSec: number;
  positionSec: number;
  levelMeter: number;
}

export interface StemSeparationProvider {
  isAvailable: boolean;
  providerName: string;
  separateAudioFile(file: File): Promise<Record<StemType, AudioBuffer>>;
}

export interface VideoDeckState {
  deckId: DeckId;
  title: string;
  srcUrl: string | null;
  isLoaded: boolean;
  isPlaying: boolean;
  durationSec: number;
  positionSec: number;
  volume: number;
}

export type CrossfaderCurve = 'EQUAL_POWER' | 'LINEAR' | 'FAST_CUT';
export type LatencyProfile = 'LOW_LATENCY' | 'BALANCED' | 'HIGH_STABILITY';
export type AudioOutputRoute = 'AUTO' | 'SPEAKER' | 'HEADPHONES' | 'BLUETOOTH';

export type RecordingMode = 'AUDIO' | 'VIDEO';
export type RecordingStatus = 'IDLE' | 'RECORDING' | 'PAUSED';

export interface SavedRecording {
  url: string;
  name: string;
  mode: RecordingMode;
  durationSec: number;
}

export interface RecordingState {
  status: RecordingStatus;
  mode: RecordingMode;
  elapsedSec: number;
  lastSaved: SavedRecording | null;
}

export interface DjSettings {
  audioOutputRoute: AudioOutputRoute;
  audioOutputDeviceId: string;
  latencyProfile: LatencyProfile;
  crossfaderCurve: CrossfaderCurve;
  autoBpmDetection: boolean;
  showBeatGrid: boolean;
  highContrastMode: boolean;
  liteMode: boolean;
  waveformZoom: number;
  waveformScrollSpeed: number;
  defaultMusicFolderName: string;
  storagePermissionGranted: boolean;
  videoHardwareAcceleration: boolean;
  videoCrossfadeBlend: boolean;
  videoMaintainAspectRatio: boolean;
}

export const DEFAULT_SETTINGS: DjSettings = {
  audioOutputRoute: 'AUTO',
  audioOutputDeviceId: 'default',
  latencyProfile: 'LOW_LATENCY',
  crossfaderCurve: 'EQUAL_POWER',
  autoBpmDetection: true,
  showBeatGrid: true,
  highContrastMode: false,
  liteMode: true,
  waveformZoom: 1.25,
  waveformScrollSpeed: 1.0,
  defaultMusicFolderName: 'Internal Storage / Music',
  storagePermissionGranted: true,
  videoHardwareAcceleration: true,
  videoCrossfadeBlend: true,
  videoMaintainAspectRatio: true,
};
