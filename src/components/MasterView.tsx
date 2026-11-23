import React, {useState} from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Disc,
  Download,
  Film,
  Mic,
  Minus,
  Pause,
  Pencil,
  Play,
  PlaySquare,
  Plus,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  AppSection,
  DeckId,
  DeckState,
  FX_TYPES,
  FxType,
  MasterCenterMode,
  PadMode,
  RecordingState,
  SamplerPadState,
} from '../types/dj';
import {WebDjEngine} from '../audio/WebDjEngine';
import {DeckVideoPlayer} from './DeckVideoPlayer';
import {RotaryKnob} from './RotaryKnob';
import {SamplerManagerModal} from './SamplerManagerModal';
import {TurntableJogWheel} from './TurntableJogWheel';
import {
  DualVerticalWaveform,
  HorizontalOverviewWaveform,
  ParallelScrollingWaveform,
} from './WaveformDisplays';

interface MasterViewProps {
  engine: WebDjEngine;
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number;
  masterVolume: number;
  centerMode: MasterCenterMode;
  isRecording: boolean;
  recordingState: RecordingState;
  showBeatGrid: boolean;
  highContrastMode: boolean;
  liteMode: boolean;
  waveformZoom: number;
  waveformScrollSpeed: number;
  recordedMixUrl: {url: string; name: string} | null;
  onChangeCenterMode: (mode: MasterCenterMode) => void;
  onNavigateSection: (section: AppSection) => void;
  onOpenTrackModal: (deckId: DeckId) => void;
  onToggleLiteMode: () => void;
  onUpdateWaveformZoom: (zoom: number) => void;
  onUpdateWaveformSpeed: (speed: number) => void;
}

type MobilePane = 'ALL' | 'DECK_A' | 'MIXER' | 'DECK_B';

function formatRecClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const MasterView: React.FC<MasterViewProps> = ({
  engine,
  deckA,
  deckB,
  crossfader,
  masterVolume,
  centerMode,
  recordingState,
  showBeatGrid,
  highContrastMode,
  liteMode,
  waveformZoom,
  waveformScrollSpeed,
  recordedMixUrl,
  onChangeCenterMode,
  onNavigateSection,
  onOpenTrackModal,
  onToggleLiteMode,
  onUpdateWaveformZoom,
  onUpdateWaveformSpeed,
}) => {
  const [deleteCueMode, setDeleteCueMode] = useState<Record<DeckId, boolean>>({
    DECK_A: false,
    DECK_B: false,
  });
  const [mobilePane, setMobilePane] = useState<MobilePane>('ALL');
  const [showParallelWave, setShowParallelWave] = useState(true);
  const [samplerModalOpen, setSamplerModalOpen] = useState(false);
  const [samplerEditPadId, setSamplerEditPadId] = useState<string | null>(null);
  const [samplerEditMode, setSamplerEditMode] = useState(false);

  const bgSurface = highContrastMode
    ? 'bg-black'
    : 'bg-[radial-gradient(ellipse_at_top,#171F2C_0%,#090C11_55%,#05070A_100%)]';
  const savedItem = recordingState.lastSaved ?? (recordedMixUrl ? {...recordedMixUrl, mode: 'AUDIO' as const, durationSec: 0} : null);

  return (
    <div className={`h-dvh w-full overflow-hidden ${bgSurface} text-slate-100 flex flex-col select-none`}>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 sm:p-2 flex flex-col gap-1.5">
      {/* TOP BAR — DJ EMMA PRO · CHRONIXDJ HARDWARE CONSOLE */}
      <header className="shrink-0 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {/* DECK A HEADER */}
        <div className="relative overflow-hidden flex items-center gap-2 emma-controller-chassis border border-[#2188FF]/30 rounded-lg p-1.5 min-w-0">
          <button
            type="button"
            onClick={() => onOpenTrackModal('DECK_A')}
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg bg-[#1A202B] hover:bg-[#252E3D] border border-[#2188FF]/60 flex items-center justify-center text-white shadow cursor-pointer emma-pad-bevel"
            title="Load Audio or Video to Deck A"
          >
            {deckA.isLoaded ? <Disc className="w-6 h-6 text-[#2188FF]" /> : <Plus className="w-6 h-6" />}
          </button>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono-tabular text-xs font-bold text-[#2188FF] whitespace-nowrap">
                  {deckA.detectedBpm > 0
                    ? `BPM : ${(deckA.detectedBpm * (1 + deckA.pitchPercent / 100)).toFixed(1)}`
                    : 'BPM : 0.00'}
                </span>
                {deckA.isLoaded && (
                  <button
                    type="button"
                    onClick={() => engine.setMasterDeck('DECK_A')}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border cursor-pointer ${
                      deckA.syncMaster
                        ? 'bg-[#2188FF] border-[#93C5FD] text-white'
                        : 'bg-[#171C26] border-white/15 text-slate-400 hover:text-white'
                    }`}
                    title="Set Deck A as Tempo Master"
                  >
                    MST
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenTrackModal('DECK_A')}
                className="text-xs sm:text-sm font-bold text-[#60A5FA] hover:underline truncate text-right cursor-pointer"
              >
                {deckA.title}
              </button>
            </div>
            <HorizontalOverviewWaveform
              waveform={deckA.waveform}
              progress={deckA.durationSec > 0 ? deckA.positionSec / deckA.durationSec : 0}
              accentColor="#2188FF"
              durationSec={deckA.durationSec}
              loopActive={deckA.loopActive}
              loopStartSec={deckA.loopStartSec}
              loopEndSec={deckA.loopEndSec}
              hotCues={deckA.hotCues}
              onSeek={(f) => engine.seekTo('DECK_A', f * deckA.durationSec)}
            />
          </div>
        </div>

        {/* CENTER DJ EMMA PRO IDENTITY + MODE & SECTION CONTROL CLUSTER */}
        <div className="flex flex-col items-center justify-between gap-1 px-2 sm:px-2.5 py-1.5 emma-controller-chassis border border-white/15 rounded-lg min-w-0 sm:min-w-[256px]">
          <div className="w-full flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onNavigateSection('SETTINGS')}
              className="w-8 h-8 rounded-full bg-[#1C222D] hover:bg-[#2A3242] border border-white/20 flex items-center justify-center text-slate-200 cursor-pointer shrink-0"
              title="Open ChronixDJ Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/assets/aistudio/1000355629_1467eab5.png"
                alt="DJ EMMA PRO"
                decoding="async"
                className="w-8 h-8 rounded-full object-cover object-[50%_12%] border border-white/35 shadow shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="leading-tight text-left truncate">
                <div className="font-display text-sm font-extrabold tracking-wider text-white whitespace-nowrap">
                  DJ EMMA PRO
                </div>
                <div className="text-[9px] font-semibold tracking-widest text-slate-400 whitespace-nowrap">
                  CHRONIXDJ STUDIO
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleLiteMode}
              className={`px-2 h-7 rounded border text-[10px] font-bold cursor-pointer shrink-0 ${
                liteMode
                  ? 'bg-[#4CAF50]/20 border-[#4CAF50] text-[#4CAF50]'
                  : 'bg-[#1C222D] border-white/15 text-slate-300'
              }`}
              title="Toggle Lite Performance Mode (low CPU & memory)"
            >
              LITE
            </button>
          </div>

          <nav className="w-full grid grid-cols-4 gap-1 bg-[#080A0F] p-0.5 rounded-md border border-white/10">
            {(['MASTER', 'VIDEO', 'STEMS', 'SETTINGS'] as AppSection[]).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => onNavigateSection(sec)}
                className={`px-2 py-1 rounded text-[10px] font-bold tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sec === 'MASTER'
                    ? 'bg-[#2188FF] text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {sec}
              </button>
            ))}
          </nav>

          <div className="w-full grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => onChangeCenterMode('MIXER_EQ')}
              className={`h-7 rounded flex items-center justify-center transition-colors cursor-pointer emma-pad-bevel ${
                centerMode === 'MIXER_EQ'
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#232834] hover:bg-[#313847] text-slate-300'
              }`}
              title="EQ & Gain Mixer View"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeCenterMode('WAVEFORM')}
              className={`h-7 rounded flex items-center justify-center transition-colors cursor-pointer emma-pad-bevel ${
                centerMode === 'WAVEFORM'
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#232834] hover:bg-[#313847] text-slate-300'
              }`}
              title="Dual Vertical Waveforms View"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeCenterMode('VIDEO_PREVIEW')}
              className={`h-7 rounded flex items-center justify-center transition-colors cursor-pointer emma-pad-bevel ${
                centerMode === 'VIDEO_PREVIEW'
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#232834] hover:bg-[#313847] text-slate-300'
              }`}
              title="Center Video Program Blend View"
            >
              <PlaySquare className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* DECK B HEADER */}
        <div className="relative overflow-hidden flex items-center gap-2 emma-controller-chassis border border-[#FF7A00]/30 rounded-lg p-1.5 min-w-0">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenTrackModal('DECK_B')}
                className="text-xs sm:text-sm font-bold text-[#FDBA74] hover:underline truncate text-left cursor-pointer"
              >
                {deckB.title}
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                {deckB.isLoaded && (
                  <button
                    type="button"
                    onClick={() => engine.setMasterDeck('DECK_B')}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border cursor-pointer ${
                      deckB.syncMaster
                        ? 'bg-[#FF7A00] border-[#FCD34D] text-white'
                        : 'bg-[#171C26] border-white/15 text-slate-400 hover:text-white'
                    }`}
                    title="Set Deck B as Tempo Master"
                  >
                    MST
                  </button>
                )}
                <span className="font-mono-tabular text-xs font-bold text-[#FF7A00] whitespace-nowrap">
                  {deckB.detectedBpm > 0
                    ? `BPM: ${(deckB.detectedBpm * (1 + deckB.pitchPercent / 100)).toFixed(1)}`
                    : 'BPM : 0.00'}
                </span>
              </div>
            </div>
            <HorizontalOverviewWaveform
              waveform={deckB.waveform}
              progress={deckB.durationSec > 0 ? deckB.positionSec / deckB.durationSec : 0}
              accentColor="#FF7A00"
              durationSec={deckB.durationSec}
              loopActive={deckB.loopActive}
              loopStartSec={deckB.loopStartSec}
              loopEndSec={deckB.loopEndSec}
              hotCues={deckB.hotCues}
              onSeek={(f) => engine.seekTo('DECK_B', f * deckB.durationSec)}
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenTrackModal('DECK_B')}
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg bg-[#1A202B] hover:bg-[#252E3D] border border-[#FF7A00]/60 flex items-center justify-center text-white shadow cursor-pointer emma-pad-bevel"
            title="Load Audio or Video to Deck B"
          >
            {deckB.isLoaded ? <Disc className="w-6 h-6 text-[#FF7A00]" /> : <Plus className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* VIRTUALDJ PARALLEL SCROLLING WAVEFORM + STUDIO RECORDER BAR */}
      <section className="shrink-0 emma-controller-chassis border border-white/15 rounded-lg p-1.5 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          {/* Waveform Zoom & Scroll Speed Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowParallelWave((v) => !v)}
              className="px-2 py-1 rounded bg-[#1E232D] hover:bg-[#2A3140] border border-white/10 text-[10px] font-bold text-slate-200 cursor-pointer"
            >
              {showParallelWave ? 'HIDE WAVE' : 'SHOW WAVE'}
            </button>

            <div className="flex items-center gap-1 bg-[#0A0C10] border border-white/10 rounded px-1.5 py-0.5">
              <span className="text-[9px] font-bold text-slate-400">ZOOM</span>
              <button
                type="button"
                onClick={() => onUpdateWaveformZoom(Math.max(0.5, Number((waveformZoom - 0.25).toFixed(2))))}
                className="w-5 h-5 rounded bg-[#1E232D] hover:bg-[#2D3545] flex items-center justify-center text-white cursor-pointer"
                title="Zoom Out Waveform"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono-tabular text-[10px] font-bold text-cyan-300 w-9 text-center">
                {waveformZoom.toFixed(2)}x
              </span>
              <button
                type="button"
                onClick={() => onUpdateWaveformZoom(Math.min(4, Number((waveformZoom + 0.25).toFixed(2))))}
                className="w-5 h-5 rounded bg-[#1E232D] hover:bg-[#2D3545] flex items-center justify-center text-white cursor-pointer"
                title="Zoom In Waveform"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-[#0A0C10] border border-white/10 rounded px-1.5 py-0.5">
              <span className="text-[9px] font-bold text-slate-400">SPEED</span>
              <button
                type="button"
                onClick={() => onUpdateWaveformSpeed(Math.max(0.5, Number((waveformScrollSpeed - 0.25).toFixed(2))))}
                className="w-5 h-5 rounded bg-[#1E232D] hover:bg-[#2D3545] flex items-center justify-center text-white cursor-pointer"
                title="Slower Scroll Speed"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono-tabular text-[10px] font-bold text-amber-300 w-9 text-center">
                {waveformScrollSpeed.toFixed(2)}x
              </span>
              <button
                type="button"
                onClick={() => onUpdateWaveformSpeed(Math.min(3, Number((waveformScrollSpeed + 0.25).toFixed(2))))}
                className="w-5 h-5 rounded bg-[#1E232D] hover:bg-[#2D3545] flex items-center justify-center text-white cursor-pointer"
                title="Faster Scroll Speed"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Audio & Video DJ Mix Recording Controls (Start, Pause, Stop, Save) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center rounded bg-[#0A0C10] border border-white/10 p-0.5">
              <button
                type="button"
                disabled={recordingState.status !== 'IDLE'}
                onClick={() => engine.setRecordingMode('AUDIO')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60 ${
                  recordingState.mode === 'AUDIO' ? 'bg-[#2188FF] text-white' : 'text-slate-300'
                }`}
                title="Record Stereo Master Audio Mix"
              >
                <Mic className="w-3 h-3" />
                AUD
              </button>
              <button
                type="button"
                disabled={recordingState.status !== 'IDLE'}
                onClick={() => engine.setRecordingMode('VIDEO')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60 ${
                  recordingState.mode === 'VIDEO' ? 'bg-[#FF7A00] text-white' : 'text-slate-300'
                }`}
                title="Record Video + Audio Mix"
              >
                <Film className="w-3 h-3" />
                A/V
              </button>
            </div>

            {recordingState.status === 'IDLE' ? (
              <button
                type="button"
                onClick={() => engine.startRecording()}
                className="px-2.5 py-1 rounded bg-[#1E232D] hover:bg-red-950/80 border border-red-500/40 text-[10px] font-bold text-red-400 flex items-center gap-1 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                START REC
              </button>
            ) : (
              <>
                <span
                  className={`font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded border ${
                    recordingState.status === 'RECORDING'
                      ? 'bg-red-600/20 border-red-500 text-red-300'
                      : 'bg-amber-600/20 border-amber-400 text-amber-200'
                  }`}
                >
                  {recordingState.status === 'PAUSED' ? 'PAUSED ' : '● '}
                  {formatRecClock(recordingState.elapsedSec)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    recordingState.status === 'RECORDING'
                      ? engine.pauseRecording()
                      : engine.resumeRecording()
                  }
                  className="px-2 py-1 rounded bg-[#232935] hover:bg-[#31394A] border border-white/15 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
                >
                  {recordingState.status === 'RECORDING' ? (
                    <>
                      <Pause className="w-3 h-3" />
                      PAUSE
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      RESUME
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => engine.stopRecording()}
                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  STOP
                </button>
              </>
            )}

            {savedItem && recordingState.status === 'IDLE' && (
              <div className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-500/40 rounded px-2 py-0.5">
                <a
                  href={savedItem.url}
                  download={savedItem.name}
                  className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                  title={`Save ${savedItem.name}`}
                >
                  <Download className="w-3 h-3" />
                  SAVE {savedItem.mode}
                </a>
                <button
                  type="button"
                  onClick={() => engine.clearSavedRecording()}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {showParallelWave && (
          <ParallelScrollingWaveform
            deckA={deckA}
            deckB={deckB}
            zoom={waveformZoom}
            scrollSpeed={waveformScrollSpeed}
            showBeatGrid={showBeatGrid}
            liteMode={liteMode}
            onSeekA={(sec) => engine.seekTo('DECK_A', sec)}
            onSeekB={(sec) => engine.seekTo('DECK_B', sec)}
            onChangeZoom={onUpdateWaveformZoom}
          />
        )}
      </section>

      {/* MOBILE PHONE PANE SWITCHER (< lg) */}
      <div className="grid grid-cols-4 gap-1 lg:hidden bg-[#12151B] border border-white/10 rounded-lg p-1">
        {(['ALL', 'DECK_A', 'MIXER', 'DECK_B'] as MobilePane[]).map((pane) => (
          <button
            key={pane}
            type="button"
            onClick={() => setMobilePane(pane)}
            className={`h-8 rounded text-[10px] font-bold cursor-pointer ${
              mobilePane === pane
                ? 'bg-[#2188FF] text-white'
                : 'bg-[#1D222C] text-slate-300'
            }`}
          >
            {pane.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* MAIN DUAL-DECK + CENTER WORKSPACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_244px_1fr] gap-2 min-h-0">
        {/* DECK A PANEL */}
        <div className={`${mobilePane === 'ALL' || mobilePane === 'DECK_A' ? 'flex' : 'hidden'} lg:flex flex-col min-w-0`}>
          <DeckControlSurface
            deck={deckA}
            accentColor="#2188FF"
            isLeft={true}
            deleteCueActive={deleteCueMode.DECK_A}
            onToggleDeleteCue={() =>
              setDeleteCueMode((prev) => ({...prev, DECK_A: !prev.DECK_A}))
            }
            samplerPads={engine.samplerPads}
            samplerEditMode={samplerEditMode}
            onToggleSamplerEditMode={() => setSamplerEditMode((v) => !v)}
            onOpenSamplerModal={(padId) => {
              setSamplerEditPadId(padId);
              setSamplerModalOpen(true);
            }}
            engine={engine}
          />
        </div>

        {/* CENTER COLUMN: WAVEFORM, MIXER EQ, OR VIDEO PROGRAM BLEND */}
        <section
          className={`${
            mobilePane === 'ALL' || mobilePane === 'MIXER' ? 'flex' : 'hidden'
          } lg:flex relative emma-controller-chassis border border-white/15 rounded-lg overflow-hidden flex-col min-h-[290px]`}
        >
          {/* Subtle DJ EMMA PRO Skin Layer behind Center Mixer */}
          {centerMode === 'MIXER_EQ' && (
            <div className="absolute inset-0 pointer-events-none">
              <img
                src="/assets/aistudio/1000355629_1467eab5.png"
                alt=""
                aria-hidden="true"
                decoding="async"
                className="w-full h-full object-cover object-[50%_18%] opacity-25"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E16]/85 via-[#090C12]/88 to-[#07090D]/95" />
            </div>
          )}
          <div className="relative z-10 flex-1 flex flex-col min-h-0">
          {centerMode === 'WAVEFORM' ? (
            <div className="flex-1 min-h-[280px]">
              <DualVerticalWaveform
                deckA={deckA}
                deckB={deckB}
                zoom={waveformZoom}
                scrollSpeed={waveformScrollSpeed}
                showBeatGrid={showBeatGrid}
                liteMode={liteMode}
                onSeekA={(sec) => engine.seekTo('DECK_A', sec)}
                onSeekB={(sec) => engine.seekTo('DECK_B', sec)}
                onChangeZoom={onUpdateWaveformZoom}
              />
            </div>
          ) : centerMode === 'VIDEO_PREVIEW' ? (
            <div className="flex-1 flex flex-col justify-between p-2 gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#4CAF50]">
                  PROGRAM VIDEO MIX
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateSection('VIDEO')}
                  className="px-2 py-1 rounded bg-[#232833] hover:bg-[#303746] text-[10px] font-bold text-white cursor-pointer"
                >
                  EXPAND
                </button>
              </div>
              <div className="relative flex-1 min-h-[180px] bg-black rounded border border-white/10 overflow-hidden flex items-center justify-center">
                {deckA.videoUrl && (
                  <DeckVideoPlayer
                    srcUrl={deckA.videoUrl}
                    isPlaying={deckA.isPlaying}
                    positionSec={deckA.positionSec}
                    pitchPercent={deckA.pitchPercent}
                    onVideoElement={(el) => engine.registerVideoElement('DECK_A', el)}
                    style={{opacity: 1 - crossfader}}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                {deckB.videoUrl && (
                  <DeckVideoPlayer
                    srcUrl={deckB.videoUrl}
                    isPlaying={deckB.isPlaying}
                    positionSec={deckB.positionSec}
                    pitchPercent={deckB.pitchPercent}
                    onVideoElement={(el) => engine.registerVideoElement('DECK_B', el)}
                    style={{opacity: crossfader}}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                {!deckA.videoUrl && !deckB.videoUrl && (
                  <div className="text-center px-3 space-y-2">
                    <div className="text-[11px] text-slate-400">
                      Load a video onto Deck A or Deck B (+) to mix live
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenTrackModal('DECK_A')}
                      className="px-2.5 py-1 rounded bg-[#2188FF] text-[10px] font-bold text-white cursor-pointer"
                    >
                      Load Video to Deck A
                    </button>
                  </div>
                )}
              </div>
              <div className="text-[10px] font-mono-tabular text-slate-400 flex justify-between">
                <span>A: {Math.round((1 - crossfader) * 100)}%</span>
                <span>B: {Math.round(crossfader * 100)}%</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between p-2.5 gap-2">
              {/* REC + Master Volume */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => engine.toggleRecording()}
                  className={`px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    recordingState.status !== 'IDLE'
                      ? 'bg-red-600 border-red-400 text-white'
                      : 'bg-[#1D2129] border-white/15 text-red-400 hover:bg-[#262B35]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-current" />
                  {recordingState.status !== 'IDLE' ? 'STOP' : 'REC'}
                </button>

                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-[10px] font-bold text-slate-400">MST</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={masterVolume}
                    onChange={(e) => engine.setMasterVolume(Number(e.target.value))}
                    className="w-full accent-[#4CAF50] cursor-pointer"
                    title="Master Output Volume"
                  />
                </div>
              </div>

              {savedItem && (
                <a
                  href={savedItem.url}
                  download={savedItem.name}
                  className="text-center text-[11px] font-semibold text-emerald-400 hover:underline bg-emerald-950/50 border border-emerald-500/30 rounded py-1 px-2 truncate"
                >
                  Save {savedItem.mode} Mix ({savedItem.name})
                </a>
              )}

              {/* Dual Column Rotary EQ + Center VU Meters */}
              <div className="flex-1 grid grid-cols-[1fr_28px_1fr] items-center gap-1">
                {/* Deck A EQ */}
                <div className="flex flex-col items-center justify-between h-full py-1 gap-1.5">
                  <RotaryKnob
                    label="GAIN"
                    value={(deckA.gainDb + 12) / 24}
                    accentColor="#2188FF"
                    onChange={(v) => engine.setGainDb('DECK_A', v * 24 - 12)}
                    onReset={() => engine.setGainDb('DECK_A', 0)}
                    size={40}
                  />
                  <RotaryKnob
                    label="HIGH"
                    value={deckA.eqHigh}
                    accentColor="#2188FF"
                    onChange={(v) => engine.setEq('DECK_A', {eqHigh: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="MID"
                    value={deckA.eqMid}
                    accentColor="#2188FF"
                    onChange={(v) => engine.setEq('DECK_A', {eqMid: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="LOW"
                    value={deckA.eqLow}
                    accentColor="#2188FF"
                    onChange={(v) => engine.setEq('DECK_A', {eqLow: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="FILTER"
                    value={deckA.filterValue}
                    accentColor="#38BDF8"
                    onChange={(v) => engine.setEq('DECK_A', {filterValue: v})}
                    size={40}
                  />
                </div>

                {/* Live Stereo Channel VU Meters */}
                <div className="h-[220px] flex items-end justify-center gap-1 py-2">
                  <div className="w-2.5 h-full bg-[#151820] rounded-sm overflow-hidden flex flex-col justify-end border border-white/10">
                    <div
                      className="w-full bg-gradient-to-t from-[#2188FF] via-cyan-400 to-emerald-400 transition-all duration-75"
                      style={{height: `${Math.round(deckA.vuLevel * 100)}%`}}
                    />
                  </div>
                  <div className="w-2.5 h-full bg-[#151820] rounded-sm overflow-hidden flex flex-col justify-end border border-white/10">
                    <div
                      className="w-full bg-gradient-to-t from-[#FF7A00] via-amber-400 to-emerald-400 transition-all duration-75"
                      style={{height: `${Math.round(deckB.vuLevel * 100)}%`}}
                    />
                  </div>
                </div>

                {/* Deck B EQ */}
                <div className="flex flex-col items-center justify-between h-full py-1 gap-1.5">
                  <RotaryKnob
                    label="GAIN"
                    value={(deckB.gainDb + 12) / 24}
                    accentColor="#FF7A00"
                    onChange={(v) => engine.setGainDb('DECK_B', v * 24 - 12)}
                    onReset={() => engine.setGainDb('DECK_B', 0)}
                    size={40}
                  />
                  <RotaryKnob
                    label="HIGH"
                    value={deckB.eqHigh}
                    accentColor="#FF7A00"
                    onChange={(v) => engine.setEq('DECK_B', {eqHigh: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="MID"
                    value={deckB.eqMid}
                    accentColor="#FF7A00"
                    onChange={(v) => engine.setEq('DECK_B', {eqMid: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="LOW"
                    value={deckB.eqLow}
                    accentColor="#FF7A00"
                    onChange={(v) => engine.setEq('DECK_B', {eqLow: v})}
                    size={40}
                  />
                  <RotaryKnob
                    label="FILTER"
                    value={deckB.filterValue}
                    accentColor="#FBBF24"
                    onChange={(v) => engine.setEq('DECK_B', {filterValue: v})}
                    size={40}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  engine.setEq('DECK_A', {eqHigh: 0.5, eqMid: 0.5, eqLow: 0.5, filterValue: 0.5});
                  engine.setEq('DECK_B', {eqHigh: 0.5, eqMid: 0.5, eqLow: 0.5, filterValue: 0.5});
                }}
                className="w-full py-1.5 rounded bg-[#232833] hover:bg-[#2D3342] text-[10px] font-bold text-slate-200 border border-white/10 cursor-pointer"
              >
                RESET ALL EQ
              </button>
            </div>
          )}
          </div>
        </section>

        {/* DECK B PANEL */}
        <div className={`${mobilePane === 'ALL' || mobilePane === 'DECK_B' ? 'flex' : 'hidden'} lg:flex flex-col min-w-0`}>
          <DeckControlSurface
            deck={deckB}
            accentColor="#FF7A00"
            isLeft={false}
            deleteCueActive={deleteCueMode.DECK_B}
            onToggleDeleteCue={() =>
              setDeleteCueMode((prev) => ({...prev, DECK_B: !prev.DECK_B}))
            }
            samplerPads={engine.samplerPads}
            samplerEditMode={samplerEditMode}
            onToggleSamplerEditMode={() => setSamplerEditMode((v) => !v)}
            onOpenSamplerModal={(padId) => {
              setSamplerEditPadId(padId);
              setSamplerModalOpen(true);
            }}
            engine={engine}
          />
        </div>
      </main>
      </div>

      <SamplerManagerModal
        isOpen={samplerModalOpen}
        initialPadId={samplerEditPadId}
        samplerPads={engine.samplerPads}
        deckA={deckA}
        deckB={deckB}
        engine={engine}
        onClose={() => setSamplerModalOpen(false)}
      />

      {/* FIXED BOTTOM TRANSPORT & SMOOTH CROSSFADER HARDWARE BAR */}
      <footer className="shrink-0 z-40 bg-[#07090E] border-t border-white/15 px-1 sm:px-2.5 py-1 sm:py-1.5 flex flex-col gap-1 md:grid md:grid-cols-[1fr_minmax(270px,440px)_1fr] md:items-center md:gap-2">
        {/* Crossfader Plate (Top compact strip on mobile, center on desktop) */}
        <div className="order-1 md:order-2 h-8 sm:h-11 rounded-md emma-controller-chassis border border-white/20 flex items-center gap-1 px-1 sm:px-1.5">
          <button
            type="button"
            onClick={() => engine.setCrossfader(0)}
            className="w-6 sm:w-7 h-6 sm:h-8 rounded bg-[#262C37] hover:bg-[#333B4A] border border-white/10 flex items-center justify-center text-white cursor-pointer shrink-0"
            title="Instant Cut to Deck A"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => engine.animateCrossfaderTo(0, 2200)}
            className="px-1 sm:px-1.5 h-6 sm:h-8 rounded bg-[#2188FF]/20 hover:bg-[#2188FF]/40 border border-[#2188FF]/45 text-[8.5px] sm:text-[9px] font-bold text-blue-200 cursor-pointer shrink-0 whitespace-nowrap"
            title="Smooth 2.2s Auto-Fade to Deck A"
          >
            FADE A
          </button>
          <div className="relative flex-1 min-w-[60px] flex items-center">
            <div className="pointer-events-none absolute inset-x-2 flex justify-between opacity-35">
              {Array.from({length: 9}).map((_, i) => (
                <span key={i} className={`w-px bg-white ${i === 4 ? 'h-4 sm:h-5' : 'h-2.5 sm:h-3'}`} />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={crossfader}
              onChange={(e) => engine.setCrossfader(Number(e.target.value))}
              onDoubleClick={() => engine.animateCrossfaderTo(0.5, 600)}
              className="chronix-crossfader relative z-10 w-full"
              title="Crossfader (double-click to smoothly center)"
            />
          </div>
          <button
            type="button"
            onClick={() => engine.animateCrossfaderTo(1, 2200)}
            className="px-1 sm:px-1.5 h-6 sm:h-8 rounded bg-[#FF7A00]/20 hover:bg-[#FF7A00]/40 border border-[#FF7A00]/45 text-[8.5px] sm:text-[9px] font-bold text-orange-200 cursor-pointer shrink-0 whitespace-nowrap"
            title="Smooth 2.2s Auto-Fade to Deck B"
          >
            FADE B
          </button>
          <button
            type="button"
            onClick={() => engine.setCrossfader(1)}
            className="w-6 sm:w-7 h-6 sm:h-8 rounded bg-[#262C37] hover:bg-[#333B4A] border border-white/10 flex items-center justify-center text-white cursor-pointer shrink-0"
            title="Instant Cut to Deck B"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Side-by-side Deck A & Deck B Transport Row on Mobile, Split Wings on Desktop */}
        <div className="order-2 md:order-none md:contents grid grid-cols-2 gap-1">
          {/* Deck A Transport */}
          <div className="md:order-1 grid grid-cols-[1.35fr_1fr_1fr] gap-0.5 sm:gap-1.5 min-w-0">
            <div className="flex items-stretch gap-0.5 sm:gap-1 min-w-0">
              <button
                type="button"
                onPointerDown={(e) => {
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // ignore unsupported synthetic pointerId
                  }
                  engine.cuePress('DECK_A');
                }}
                onPointerUp={() => engine.cueRelease('DECK_A')}
                onPointerCancel={() => engine.cueRelease('DECK_A')}
                onLostPointerCapture={() => engine.cueRelease('DECK_A')}
                className={`touch-none flex-1 min-w-0 h-9 sm:h-11 rounded-md border emma-pad-bevel font-display text-[11px] sm:text-base font-bold tracking-wider text-white cursor-pointer transition-colors ${
                  deckA.cuePreviewing
                    ? 'bg-amber-500 border-amber-200 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.65)]'
                    : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
                }`}
                title="Tap while playing to return & pause at Main Cue. Hold while paused to preview from Main Cue."
              >
                CUE
              </button>
              <button
                type="button"
                onClick={() => engine.setMainCue('DECK_A')}
                className="px-1 sm:px-1.5 h-9 sm:h-11 rounded-md bg-[#1B2230] hover:bg-[#273145] border border-white/15 text-[8px] sm:text-[9px] font-bold text-slate-200 cursor-pointer shrink-0"
                title="Save current track position as Main Cue Point"
              >
                SET
              </button>
            </div>
            <button
              type="button"
              onClick={() => engine.togglePlayPause('DECK_A')}
              className={`h-9 sm:h-11 min-w-0 rounded-md border font-display text-[11px] sm:text-base font-bold tracking-wider text-white transition-all emma-pad-bevel cursor-pointer truncate ${
                deckA.isPlaying && !deckA.cuePreviewing
                  ? 'bg-[#2188FF] border-[#93C5FD] shadow-[0_0_16px_rgba(33,136,255,0.55)]'
                  : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
              }`}
            >
              {deckA.isPlaying && !deckA.cuePreviewing ? 'PAUSE' : 'PLAY'}
            </button>
            <button
              type="button"
              onClick={() => engine.syncBpm('DECK_A')}
              className={`h-9 sm:h-11 min-w-0 rounded-md border emma-pad-bevel font-display text-[11px] sm:text-base font-bold tracking-wider text-white cursor-pointer transition-all truncate ${
                deckA.syncLocked
                  ? 'bg-[#2188FF] border-[#93C5FD] shadow-[0_0_14px_rgba(33,136,255,0.6)]'
                  : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
              }`}
              title="Match Deck B BPM & beat phase without starting playback"
            >
              SYNC
            </button>
          </div>

          {/* Deck B Transport */}
          <div className="md:order-3 grid grid-cols-[1fr_1.35fr_1fr] gap-0.5 sm:gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => engine.syncBpm('DECK_B')}
              className={`h-9 sm:h-11 min-w-0 rounded-md border emma-pad-bevel font-display text-[11px] sm:text-base font-bold tracking-wider text-white cursor-pointer transition-all truncate ${
                deckB.syncLocked
                  ? 'bg-[#FF7A00] border-[#FCD34D] shadow-[0_0_14px_rgba(255,122,0,0.6)]'
                  : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
              }`}
              title="Match Deck A BPM & beat phase without starting playback"
            >
              SYNC
            </button>
            <div className="flex items-stretch gap-0.5 sm:gap-1 min-w-0">
              <button
                type="button"
                onPointerDown={(e) => {
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // ignore unsupported synthetic pointerId
                  }
                  engine.cuePress('DECK_B');
                }}
                onPointerUp={() => engine.cueRelease('DECK_B')}
                onPointerCancel={() => engine.cueRelease('DECK_B')}
                onLostPointerCapture={() => engine.cueRelease('DECK_B')}
                className={`touch-none flex-1 min-w-0 h-9 sm:h-11 rounded-md border emma-pad-bevel font-display text-[11px] sm:text-base font-bold tracking-wider text-white cursor-pointer transition-colors ${
                  deckB.cuePreviewing
                    ? 'bg-amber-500 border-amber-200 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.65)]'
                    : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
                }`}
                title="Tap while playing to return & pause at Main Cue. Hold while paused to preview from Main Cue."
              >
                CUE
              </button>
              <button
                type="button"
                onClick={() => engine.setMainCue('DECK_B')}
                className="px-1 sm:px-1.5 h-9 sm:h-11 rounded-md bg-[#1B2230] hover:bg-[#273145] border border-white/15 text-[8px] sm:text-[9px] font-bold text-slate-200 cursor-pointer shrink-0"
                title="Save current track position as Main Cue Point"
              >
                SET
              </button>
            </div>
            <button
              type="button"
              onClick={() => engine.togglePlayPause('DECK_B')}
              className={`h-9 sm:h-11 min-w-0 rounded-md border font-display text-[11px] sm:text-base font-bold tracking-wider text-white transition-all emma-pad-bevel cursor-pointer truncate ${
                deckB.isPlaying && !deckB.cuePreviewing
                  ? 'bg-[#FF7A00] border-[#FCD34D] shadow-[0_0_16px_rgba(255,122,0,0.55)]'
                  : 'bg-gradient-to-b from-[#2A303B] to-[#1A1E26] hover:from-[#343C4A] hover:to-[#222732] border-white/20'
              }`}
            >
              {deckB.isPlaying && !deckB.cuePreviewing ? 'PAUSE' : 'PLAY'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface DeckControlSurfaceProps {
  deck: DeckState;
  accentColor: string;
  isLeft: boolean;
  deleteCueActive: boolean;
  onToggleDeleteCue: () => void;
  samplerPads: SamplerPadState[];
  samplerEditMode: boolean;
  onToggleSamplerEditMode: () => void;
  onOpenSamplerModal: (padId: string | null) => void;
  engine: WebDjEngine;
}

const DeckControlSurface: React.FC<DeckControlSurfaceProps> = ({
  deck,
  accentColor,
  isLeft,
  deleteCueActive,
  onToggleDeleteCue,
  samplerPads,
  samplerEditMode,
  onToggleSamplerEditMode,
  onOpenSamplerModal,
  engine,
}) => {
  const padLabels: Record<Exclude<PadMode, 'SMP'>, string[]> = {
    CUE: ['1', '2', '3', '4', '5', '6', '7', '8'],
    SCRT: ['-4 BEAT', '+4 BEAT', '1/2X', '2X', 'SPINBK', 'BRAKE', 'STUTTER', 'ROLL'],
    STEMS: ['DRUMS', 'BASS', 'MELODY', 'ACAPEL', 'INSTRU', 'FULL MIX', 'AI SEP', 'FX1'],
  };

  const fxColumn = (
    <div className="flex flex-col justify-between gap-1 sm:gap-1.5 w-[74px] sm:w-[116px] shrink-0">
      <div className="text-[9px] sm:text-[10px] font-bold tracking-wider text-slate-400 text-center">
        {deck.deckId === 'DECK_A' ? 'DECK A FX' : 'DECK B FX'}
      </div>
      {deck.fxSlots.map((slot, idx) => (
        <div
          key={idx}
          className="flex items-stretch rounded overflow-hidden border border-white/15 bg-[#1B1F27]"
        >
          <button
            type="button"
            onClick={() => engine.toggleFxSlot(deck.deckId, idx)}
            style={slot.enabled ? {backgroundColor: accentColor} : undefined}
            className={`flex-1 px-1 sm:px-1.5 py-1.5 sm:py-2 text-[9px] sm:text-[11px] font-semibold text-left truncate cursor-pointer transition-colors ${
              slot.enabled ? 'text-white' : 'text-slate-200 hover:bg-white/5'
            }`}
            title="Click to toggle FX"
          >
            {slot.type}
          </button>
          <select
            aria-label={`Select FX ${idx + 1}`}
            value={slot.type}
            onChange={(e) => engine.setFxSlotType(deck.deckId, idx, e.target.value as FxType)}
            className="w-4 sm:w-5 bg-[#2A303B] text-[9px] sm:text-[10px] text-white outline-none cursor-pointer"
          >
            {FX_TYPES.map((t) => (
              <option key={t} value={t} className="bg-[#15181E] text-white">
                {t}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Loop Section */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">LOOP</span>
        <div
          className="w-full h-7 sm:h-8 rounded border border-white/15 flex items-center justify-between overflow-hidden"
          style={{backgroundColor: deck.loopActive ? accentColor : '#1B1F27'}}
        >
          <button
            type="button"
            onClick={() => engine.stepLoopSize(deck.deckId, -1)}
            className="w-5 sm:w-7 h-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => engine.toggleLoop(deck.deckId)}
            className="flex-1 h-full text-[10px] sm:text-xs font-mono-tabular font-bold text-white cursor-pointer"
          >
            {deck.loopBeats === 0.125
              ? '1/8'
              : deck.loopBeats === 0.25
              ? '1/4'
              : deck.loopBeats === 0.5
              ? '1/2'
              : deck.loopBeats}
          </button>
          <button
            type="button"
            onClick={() => engine.stepLoopSize(deck.deckId, 1)}
            className="w-5 sm:w-7 h-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const acapellaSoloActive =
    !deck.stemBypassed &&
    deck.activeStems.vocals &&
    !deck.activeStems.drums &&
    !deck.activeStems.bass &&
    !deck.activeStems.melody;
  const instrumentalActive =
    !deck.stemBypassed &&
    !deck.activeStems.vocals &&
    deck.activeStems.drums &&
    deck.activeStems.bass &&
    deck.activeStems.melody;

  const modifiersColumn = (
    <div className="flex flex-col justify-between gap-1 w-[38px] sm:w-[56px] shrink-0">
      <button
        type="button"
        onClick={() => engine.isolateDeckStem(deck.deckId, 'vocals')}
        className={`h-[24px] sm:h-[26px] rounded border text-[8px] sm:text-[9px] font-bold leading-tight px-0.5 cursor-pointer truncate ${
          acapellaSoloActive
            ? 'bg-amber-500 border-amber-300 text-slate-950'
            : instrumentalActive
            ? 'bg-[#4CAF50] border-emerald-300 text-white'
            : 'bg-[#232730] border-white/15 text-slate-200 hover:bg-[#2C313D]'
        }`}
        title="Isolate Vocals (ACAPEL) or click again to restore full song"
      >
        {deck.stemStatus === 'PROCESSING'
          ? 'PROC...'
          : acapellaSoloActive
          ? 'ACAPEL'
          : instrumentalActive
          ? 'NO VOX'
          : 'ACAPEL'}
      </button>
      <button
        type="button"
        onClick={() => engine.toggleModFlag(deck.deckId, 'slipEnabled')}
        style={deck.slipEnabled ? {backgroundColor: accentColor} : undefined}
        className={`h-[24px] sm:h-[26px] rounded border border-white/15 text-[9px] sm:text-[10px] font-bold cursor-pointer ${
          deck.slipEnabled ? 'text-white' : 'bg-[#232730] text-slate-200 hover:bg-[#2C313D]'
        }`}
        title="Vinyl Slip Mode (returns on-beat after scratching)"
      >
        SLIP
      </button>
      <button
        type="button"
        onClick={() => engine.toggleModFlag(deck.deckId, 'beatJumpEnabled')}
        style={deck.beatJumpEnabled ? {backgroundColor: accentColor} : undefined}
        className={`h-[24px] sm:h-[26px] rounded border border-white/15 text-[9px] sm:text-[10px] font-bold cursor-pointer ${
          deck.beatJumpEnabled ? 'text-white' : 'bg-[#232730] text-slate-200 hover:bg-[#2C313D]'
        }`}
      >
        BEAT
      </button>
      <button
        type="button"
        onClick={() => engine.toggleModFlag(deck.deckId, 'quantizeEnabled')}
        style={deck.quantizeEnabled ? {backgroundColor: accentColor} : undefined}
        className={`h-[24px] sm:h-[26px] rounded border border-white/15 text-[9px] sm:text-[10px] font-bold cursor-pointer ${
          deck.quantizeEnabled ? 'text-white' : 'bg-[#232730] text-slate-200 hover:bg-[#2C313D]'
        }`}
      >
        QNTZ
      </button>
      <button
        type="button"
        onClick={() => engine.toggleModFlag(deck.deckId, 'keyLockEnabled')}
        style={{backgroundColor: accentColor}}
        className={`h-[24px] sm:h-[26px] rounded text-[9.5px] sm:text-[11px] font-mono-tabular font-bold text-white cursor-pointer border ${
          deck.keyLockEnabled ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.45)]' : 'border-white/20'
        }`}
        title={deck.keyLockEnabled ? 'Key Lock ON (musical pitch locked across tempo changes)' : 'Key Lock OFF (click to preserve musical key when pitching)'}
      >
        {deck.keyLockEnabled ? `${deck.musicalKey}·K` : deck.musicalKey}
      </button>
      <button
        type="button"
        onClick={() => engine.cyclePitchRange(deck.deckId)}
        style={{backgroundColor: accentColor}}
        className="h-[24px] sm:h-[26px] rounded text-[9px] sm:text-[10px] font-bold text-white cursor-pointer"
        title="Cycle Pitch Range (±8%, ±16%, ±50%)"
      >
        ±{deck.pitchRangePercent}%
      </button>
    </div>
  );

  const fadersColumn = (
    <div className="flex items-center gap-0.5 sm:gap-1.5 h-[160px] sm:h-[196px] px-0 sm:px-1 shrink-0">
      <div className="flex flex-col items-center h-full justify-between">
        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">VOL</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={deck.volume}
          onChange={(e) => engine.setDeckVolume(deck.deckId, Number(e.target.value))}
          style={{writingMode: 'vertical-lr', direction: 'rtl', accentColor}}
          className="h-[114px] sm:h-[146px] w-3.5 sm:w-4 cursor-pointer"
          title="Channel Volume"
        />
        <span className="font-mono-tabular text-[8px] sm:text-[9px] text-slate-300">
          {Math.round(deck.volume * 100)}
        </span>
      </div>
      <div className="flex flex-col items-center h-full justify-between">
        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400">PITCH</span>
        <input
          type="range"
          min={-deck.pitchRangePercent}
          max={deck.pitchRangePercent}
          step={0.1}
          value={deck.pitchPercent}
          onChange={(e) => engine.setPitchPercent(deck.deckId, Number(e.target.value))}
          onDoubleClick={() => engine.setPitchPercent(deck.deckId, 0)}
          style={{writingMode: 'vertical-lr', direction: 'rtl', accentColor}}
          className="h-[114px] sm:h-[146px] w-3.5 sm:w-4 cursor-pointer"
          title="Tempo / Pitch Fader (double-click to reset 0%)"
        />
        <span className="font-mono-tabular text-[8px] sm:text-[9px] text-slate-300">
          {deck.pitchPercent >= 0 ? `+${deck.pitchPercent.toFixed(0)}` : deck.pitchPercent.toFixed(0)}%
        </span>
      </div>
    </div>
  );

  const jogWheel = (
    <div className="flex-1 flex items-center justify-center min-w-[88px]">
      <TurntableJogWheel
        bpm={deck.detectedBpm}
        musicalKey={deck.musicalKey}
        pitchPercent={deck.pitchPercent}
        positionSec={deck.positionSec}
        durationSec={deck.durationSec}
        platterDegrees={deck.platterDegrees}
        accentColor={accentColor}
        isPlaying={deck.isPlaying}
        videoUrl={deck.videoUrl}
        onVideoElement={(el) => engine.registerVideoElement(deck.deckId, el)}
        onScratchStart={() => engine.beginScratch(deck.deckId)}
        onScratchDelta={(deg) => engine.nudgePlatter(deck.deckId, deg)}
        onScratchEnd={() => engine.endScratch(deck.deckId)}
      />
    </div>
  );

  return (
    <section
      className="relative overflow-hidden emma-controller-chassis rounded-xl p-1.5 sm:p-2 flex flex-col justify-between gap-1.5 sm:gap-2 min-w-0"
      style={{border: `1px solid ${accentColor}55`}}
    >
      {/* Official DJ EMMA PRO Skin Layer integrated into Deck Chassis */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src="/assets/aistudio/1000355629_1467eab5.png"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="w-full h-full object-cover object-[50%_18%] opacity-35 saturate-75"
          referrerPolicy="no-referrer"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(155deg, rgba(10,14,22,0.88) 0%, rgba(9,12,18,0.82) 48%, rgba(6,8,13,0.94) 100%)`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`}}
        />
      </div>

      {/* Hardware Corner Fasteners */}
      <span className="pointer-events-none absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />
      <span className="pointer-events-none absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />

      {/* Deck Skin Signature Tag */}
      <div className="relative z-10 flex items-center justify-between px-1 text-[9px] font-bold tracking-widest text-slate-300/90">
        <span style={{color: accentColor}}>
          {deck.deckId === 'DECK_A' ? 'DECK A' : 'DECK B'} · DJ EMMA PRO
        </span>
        <span className="font-mono-tabular text-slate-400">
          {deck.isLoaded ? `${deck.musicalKey} · ${deck.detectedBpm ? (deck.detectedBpm * (1 + deck.pitchPercent / 100)).toFixed(1) : '0.0'} BPM` : 'READY'}
        </span>
      </div>

      {/* Upper Deck Row */}
      <div className="relative z-10 flex items-center justify-between gap-1 sm:gap-2 min-h-[164px] sm:min-h-[195px]">
        {isLeft ? (
          <>
            {fxColumn}
            {modifiersColumn}
            {jogWheel}
            {fadersColumn}
          </>
        ) : (
          <>
            {fadersColumn}
            {jogWheel}
            {modifiersColumn}
            {fxColumn}
          </>
        )}
      </div>

      {/* Pad Mode Tabs: CUE | SMP | SCRT | STEMS */}
      <div className="relative z-10 grid grid-cols-4 gap-1">
        <div className="flex items-center rounded overflow-hidden bg-[#1A1E27]/95 border border-white/15 emma-pad-bevel">
          <button
            type="button"
            onClick={onToggleDeleteCue}
            className={`px-1.5 sm:px-2 h-8 flex items-center justify-center cursor-pointer ${
              deleteCueActive ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
            title="Toggle Cue Delete Mode"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => engine.setPadMode(deck.deckId, 'CUE')}
            style={deck.padMode === 'CUE' ? {backgroundColor: accentColor} : undefined}
            className={`flex-1 h-8 text-[11px] font-bold cursor-pointer ${
              deck.padMode === 'CUE' ? 'text-white' : 'text-slate-200'
            }`}
          >
            CUE
          </button>
        </div>

        <button
          type="button"
          onClick={() => engine.setPadMode(deck.deckId, 'SMP')}
          style={deck.padMode === 'SMP' ? {backgroundColor: accentColor} : undefined}
          className={`h-8 rounded border border-white/15 emma-pad-bevel flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer ${
            deck.padMode === 'SMP' ? 'text-white' : 'bg-[#1A1E27]/95 text-slate-200 hover:bg-[#262C38]'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          SMP
        </button>

        <button
          type="button"
          onClick={() => engine.setPadMode(deck.deckId, 'SCRT')}
          style={deck.padMode === 'SCRT' ? {backgroundColor: accentColor} : undefined}
          className={`h-8 rounded border border-white/15 emma-pad-bevel flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer ${
            deck.padMode === 'SCRT' ? 'text-white' : 'bg-[#1A1E27]/95 text-slate-200 hover:bg-[#262C38]'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          SCRT
        </button>

        <button
          type="button"
          onClick={() => engine.setPadMode(deck.deckId, 'STEMS')}
          style={deck.padMode === 'STEMS' ? {backgroundColor: accentColor} : undefined}
          className={`h-8 rounded border border-white/15 emma-pad-bevel text-[11px] font-bold cursor-pointer ${
            deck.padMode === 'STEMS' ? 'text-white' : 'bg-[#1A1E27]/95 text-slate-200 hover:bg-[#262C38]'
          }`}
        >
          STEMS
        </button>
      </div>

      {/* In-Deck Stems Live Engine Bar (shown in STEMS tab without leaving Deck) */}
      {deck.padMode === 'STEMS' && (
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-1 px-1.5 py-1 rounded bg-[#0A0E16]/90 border border-white/10 text-[9px]">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                deck.stemStatus === 'PROCESSING'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : deck.stemStatus === 'ERROR'
                  ? 'bg-red-500/20 text-red-300 border border-red-400/40'
                  : deck.stemSourceMode === 'CLOUD_AI'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                  : deck.stemStatus === 'READY'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-slate-800 text-slate-300 border border-white/10'
              }`}
              title={deck.stemNote || deck.stemError || 'Click any stem pad or AI SEP to extract stems in-deck'}
            >
              {deck.stemStatus === 'PROCESSING'
                ? 'SEPARATING...'
                : deck.stemStatus === 'ERROR'
                ? 'STEM ERROR'
                : deck.stemSourceMode === 'CLOUD_AI'
                ? 'CLOUD AI'
                : deck.stemStatus === 'READY'
                ? 'OFFLINE DSP'
                : 'STEMS IDLE'}
            </span>
            <span className="truncate text-slate-400">
              {deck.stemBypassed ? 'Original Full Song' : 'Stems Active'}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {(['vocals', 'drums', 'bass', 'melody'] as const).map((k) => {
              const short = k === 'vocals' ? 'V' : k === 'drums' ? 'D' : k === 'bass' ? 'B' : 'M';
              const active = !deck.stemBypassed && deck.activeStems[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => engine.toggleSingleStem(deck.deckId, k)}
                  className={`w-5 h-5 rounded text-[9px] font-bold border cursor-pointer ${
                    active
                      ? 'bg-[#2188FF] border-white/40 text-white'
                      : 'bg-[#171B23] border-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={`Layer / Mute ${k.toUpperCase()} stem`}
                >
                  {short}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => engine.restoreFullMix(deck.deckId)}
              className={`px-1.5 h-5 rounded text-[8px] font-bold border cursor-pointer ${
                deck.stemBypassed
                  ? 'bg-[#4CAF50] border-emerald-300 text-white'
                  : 'bg-[#171B23] border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title="Restore Original Full Song"
            >
              FULL
            </button>
          </div>
        </div>
      )}

      {/* In-Deck Custom Sampler Bank Toolbar */}
      {deck.padMode === 'SMP' && (
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded bg-[#0A0E16]/90 border border-white/10 text-[10px]">
          <span className="text-slate-300 font-semibold truncate">
            {samplerEditMode
              ? 'Tap any pad to edit or replace'
              : `Sampler Bank · ${samplerPads.length} pads`}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {samplerPads.some((p) => p.isPlaying) && (
              <button
                type="button"
                onClick={() => engine.stopAllSamplers()}
                className="px-2 h-6 rounded bg-red-600 hover:bg-red-500 text-[9px] font-bold text-white cursor-pointer"
                title="Stop all playing samplers"
              >
                STOP
              </button>
            )}
            <button
              type="button"
              onClick={onToggleSamplerEditMode}
              className={`px-2 h-6 rounded text-[9px] font-bold border cursor-pointer ${
                samplerEditMode
                  ? 'bg-amber-500 border-amber-300 text-slate-950'
                  : 'bg-[#171B23] border-white/15 text-slate-200 hover:bg-white/10'
              }`}
              title="Toggle pad edit mode to customize or replace any pad"
            >
              {samplerEditMode ? 'DONE' : 'EDIT'}
            </button>
            <button
              type="button"
              onClick={() => onOpenSamplerModal(null)}
              style={{backgroundColor: accentColor}}
              className="px-2.5 h-6 rounded text-[9px] font-bold text-white flex items-center gap-1 cursor-pointer hover:brightness-110"
              title="Add your own audio file, mic drop, or deck clip as a sampler pad"
            >
              <Plus className="w-3 h-3" />
              ADD SAMPLER
            </button>
          </div>
        </div>
      )}

      {/* 2x4 (or Dynamic N-Row) Tactile Hardware Performance Pads Grid */}
      {deck.padMode === 'SMP' ? (
        <div className="relative z-10 grid grid-cols-4 gap-1.5">
          {samplerPads.map((pad) => {
            const padAccent = pad.color ?? accentColor;
            const isCustom = pad.sourceType !== 'BUILTIN';
            const isHighlighted = pad.isPlaying || samplerEditMode;
            return (
              <button
                key={pad.id}
                type="button"
                onClick={() => {
                  if (samplerEditMode) {
                    onOpenSamplerModal(pad.id);
                  } else {
                    engine.triggerSamplerPad(pad.id);
                  }
                }}
                style={
                  pad.isPlaying
                    ? {
                        backgroundColor: padAccent,
                        borderColor: '#fff',
                        boxShadow: `0 0 12px ${padAccent}88`,
                      }
                    : isCustom
                    ? {
                        borderColor: `${padAccent}88`,
                      }
                    : undefined
                }
                title={
                  samplerEditMode
                    ? `Click to customize "${pad.label}"`
                    : `${pad.label}${pad.fileName ? ` (${pad.fileName})` : ''}${pad.loop ? ' [Loop]' : ''}`
                }
                className={`h-10 px-1 rounded-md border text-[10px] sm:text-[11px] font-bold tracking-wide transition-all active:scale-95 emma-pad-bevel cursor-pointer flex items-center justify-center gap-1 overflow-hidden ${
                  isHighlighted && pad.isPlaying
                    ? 'text-white'
                    : samplerEditMode
                    ? 'bg-[#252B36]/95 border-amber-400/70 text-amber-100 hover:bg-[#2F3746]'
                    : 'bg-gradient-to-b from-[#252B36]/95 to-[#191D25]/95 hover:from-[#2F3746] hover:to-[#202631] border-white/15 text-slate-100'
                }`}
              >
                <span className="truncate">{pad.label}</span>
                {pad.loop && <span className="text-[9px] opacity-80 shrink-0">∞</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-4 gap-1.5">
          {padLabels[deck.padMode].map((label, idx) => {
            const isCueSet =
              deck.padMode === 'CUE' && deck.hotCues[idx]?.positionSec !== null;
            const isStemPadActive =
              deck.padMode === 'STEMS' &&
              ((idx === 0 && !deck.stemBypassed && deck.activeStems.drums) ||
                (idx === 1 && !deck.stemBypassed && deck.activeStems.bass) ||
                (idx === 2 && !deck.stemBypassed && deck.activeStems.melody) ||
                (idx === 3 && !deck.stemBypassed && deck.activeStems.vocals) ||
                (idx === 4 && instrumentalActive) ||
                (idx === 5 && deck.stemBypassed) ||
                (idx === 6 && deck.stemStatus === 'PROCESSING') ||
                (idx === 7 && deck.fxSlots[0]?.enabled));
            const activeColor =
              idx === 5 && deck.stemBypassed
                ? '#16A34A'
                : idx === 3 && acapellaSoloActive
                ? '#D97706'
                : accentColor;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (deck.padMode === 'CUE') {
                    engine.triggerHotCue(deck.deckId, idx, deleteCueActive);
                  } else if (deck.padMode === 'SCRT') {
                    engine.triggerScratchAction(deck.deckId, idx);
                  } else {
                    if (idx === 0) engine.isolateDeckStem(deck.deckId, 'drums');
                    else if (idx === 1) engine.isolateDeckStem(deck.deckId, 'bass');
                    else if (idx === 2) engine.isolateDeckStem(deck.deckId, 'melody');
                    else if (idx === 3) engine.isolateDeckStem(deck.deckId, 'vocals');
                    else if (idx === 4) engine.toggleInstrumentalMode(deck.deckId);
                    else if (idx === 5) engine.toggleStemsBypass(deck.deckId);
                    else if (idx === 6) void engine.prepareDeckStems(deck.deckId, true);
                    else engine.toggleFxSlot(deck.deckId, 0);
                  }
                }}
                style={
                  isCueSet || isStemPadActive
                    ? {
                        backgroundColor: activeColor,
                        borderColor: '#fff',
                        boxShadow: `0 0 12px ${activeColor}88`,
                      }
                    : undefined
                }
                className={`h-10 rounded-md border text-[10px] sm:text-[11px] font-bold tracking-wide transition-all active:scale-95 emma-pad-bevel cursor-pointer ${
                  isCueSet || isStemPadActive
                    ? 'text-white'
                    : 'bg-gradient-to-b from-[#252B36]/95 to-[#191D25]/95 hover:from-[#2F3746] hover:to-[#202631] border-white/15 text-slate-100'
                }`}
              >
                {idx === 5 && deck.padMode === 'STEMS'
                  ? deck.stemBypassed
                    ? 'FULL ON'
                    : 'RESTORE'
                  : label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
