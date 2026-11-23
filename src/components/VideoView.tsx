import React, {useEffect, useRef, useState} from 'react';
import {
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Square,
  Video,
  X,
} from 'lucide-react';
import {
  AppSection,
  DeckId,
  DeckState,
  DjSettings,
  RecordingState,
} from '../types/dj';
import {WebDjEngine} from '../audio/WebDjEngine';
import {createDeckDemoVideoClip, DeckVideoPlayer} from './DeckVideoPlayer';
import {formatDjClock} from './TurntableJogWheel';

interface VideoViewProps {
  engine: WebDjEngine;
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number;
  settings: DjSettings;
  recordingState: RecordingState;
  onNavigateSection: (section: AppSection) => void;
}

export const VideoView: React.FC<VideoViewProps> = ({
  engine,
  deckA,
  deckB,
  crossfader,
  settings,
  recordingState,
  onNavigateSection,
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [generatingClip, setGeneratingClip] = useState<DeckId | null>(null);

  const fileARef = useRef<HTMLInputElement | null>(null);
  const fileBRef = useRef<HTMLInputElement | null>(null);

  const waveCanvasARef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasBRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasProgRef = useRef<HTMLCanvasElement | null>(null);

  // Draw live audio-following wave strips driven directly by Deck A & Deck B WebDjEngine state
  useEffect(() => {
    const drawDeckWave = (
      canvas: HTMLCanvasElement | null,
      deck: DeckState,
      color: string
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#06080B';
      ctx.fillRect(0, 0, w, h);

      const barCount = 44;
      const step = w / barCount;
      const midY = h / 2;
      ctx.fillStyle = color;

      const peaks = deck.waveform;
      const progress = deck.durationSec > 0 ? deck.positionSec / deck.durationSec : 0;
      const centerIdx = peaks.length > 0 ? Math.floor(progress * (peaks.length - 1)) : 0;

      for (let i = 0; i < barCount; i++) {
        let amp = 0.05;
        if (peaks.length > 0) {
          const sampleIdx = Math.max(0, Math.min(peaks.length - 1, centerIdx - 22 + i));
          const p = peaks[sampleIdx];
          const liveBoost = deck.isPlaying ? 0.5 + deck.vuLevel * 0.75 : 0.35;
          amp = Math.min(1, p.amplitude * liveBoost * deck.volume);
        }
        const barH = Math.max(3, amp * (h * 0.88));
        ctx.fillRect(i * step + 1, midY - barH / 2, Math.max(2, step - 2), barH);
      }

      // Playhead center marker
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.floor(w / 2), 0, 1.5, h);
    };

    drawDeckWave(waveCanvasARef.current, deckA, '#2188FF');
    drawDeckWave(waveCanvasBRef.current, deckB, '#FF7A00');

    // Program Blended Wave Strip
    const progCanvas = waveCanvasProgRef.current;
    if (progCanvas) {
      const ctx = progCanvas.getContext('2d');
      if (ctx) {
        const w = progCanvas.width;
        const h = progCanvas.height;
        ctx.fillStyle = '#06080B';
        ctx.fillRect(0, 0, w, h);
        const barCount = 44;
        const step = w / barCount;
        const midY = h / 2;
        ctx.fillStyle = '#4CAF50';

        const progA = deckA.durationSec > 0 ? deckA.positionSec / deckA.durationSec : 0;
        const progB = deckB.durationSec > 0 ? deckB.positionSec / deckB.durationSec : 0;
        const idxA = deckA.waveform.length > 0 ? Math.floor(progA * (deckA.waveform.length - 1)) : 0;
        const idxB = deckB.waveform.length > 0 ? Math.floor(progB * (deckB.waveform.length - 1)) : 0;

        for (let i = 0; i < barCount; i++) {
          const ampA =
            deckA.waveform.length > 0
              ? deckA.waveform[Math.max(0, Math.min(deckA.waveform.length - 1, idxA - 22 + i))]
                  .amplitude *
                (deckA.isPlaying ? 0.5 + deckA.vuLevel * 0.75 : 0.25) *
                (1 - crossfader)
              : 0;
          const ampB =
            deckB.waveform.length > 0
              ? deckB.waveform[Math.max(0, Math.min(deckB.waveform.length - 1, idxB - 22 + i))]
                  .amplitude *
                (deckB.isPlaying ? 0.5 + deckB.vuLevel * 0.75 : 0.25) *
                crossfader
              : 0;
          const amp = Math.min(1, Math.max(0.05, ampA + ampB));
          const barH = Math.max(3, amp * (h * 0.88));
          ctx.fillRect(i * step + 1, midY - barH / 2, Math.max(2, step - 2), barH);
        }
      }
    }
  }, [
    deckA.positionSec,
    deckA.isPlaying,
    deckA.vuLevel,
    deckA.volume,
    deckA.waveform,
    deckB.positionSec,
    deckB.isPlaying,
    deckB.vuLevel,
    deckB.volume,
    deckB.waveform,
    crossfader,
  ]);

  const handleLoadVisualLoop = async (deckId: DeckId) => {
    setGeneratingClip(deckId);
    try {
      const bpm = deckId === 'DECK_A' ? 124 : 128;
      const url = await createDeckDemoVideoClip(
        deckId === 'DECK_A' ? 'CHRONIX DECK A VIDEO' : 'CHRONIX DECK B VIDEO',
        deckId === 'DECK_A' ? '#2188FF' : '#FF7A00',
        bpm
      );
      await engine.loadVideoClipUrl(
        deckId,
        url,
        deckId === 'DECK_A' ? 'Deck_A_AV_Mix.webm' : 'Deck_B_AV_Mix.webm',
        bpm
      );
    } finally {
      setGeneratingClip(null);
    }
  };

  const renderDeck = (
    deck: DeckState,
    accent: string,
    waveCanvasRef: React.RefObject<HTMLCanvasElement | null>,
    fileRef: React.RefObject<HTMLInputElement | null>
  ) => (
    <div
      className="bg-[#12151B] rounded-xl border p-3 flex flex-col gap-2"
      style={{borderColor: `${accent}66`}}
    >
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.mp3,.wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void engine.loadLocalFile(deck.deckId, f);
          e.target.value = '';
        }}
      />
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-xs font-bold truncate" style={{color: accent}}>
          {deck.title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => engine.cycleVocalMode(deck.deckId)}
            className={`px-2 py-1.5 rounded text-[10px] font-bold cursor-pointer ${
              deck.vocalMode === 'REMOVE_ACAPELLA'
                ? 'bg-[#4CAF50] text-white'
                : deck.vocalMode === 'ACAPELLA_ONLY'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-[#232833] text-slate-200 hover:bg-[#2F3645]'
            }`}
            title="Remove Acapella / Isolate Acapella on Deck Audio"
          >
            {deck.vocalMode === 'REMOVE_ACAPELLA'
              ? 'NO ACAPELLA'
              : deck.vocalMode === 'ACAPELLA_ONLY'
              ? 'ACAPELLA'
              : 'VOX RM'}
          </button>
          <button
            type="button"
            disabled={generatingClip === deck.deckId}
            onClick={() => void handleLoadVisualLoop(deck.deckId)}
            className="px-2 py-1.5 rounded bg-[#232833] hover:bg-[#2F3645] text-[10px] font-semibold text-slate-200 cursor-pointer"
          >
            {generatingClip === deck.deckId ? '...' : 'Demo A/V'}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{backgroundColor: accent}}
            className="px-2 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Load
          </button>
        </div>
      </div>

      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
        {deck.videoUrl ? (
          <DeckVideoPlayer
            srcUrl={deck.videoUrl}
            isPlaying={deck.isPlaying}
            positionSec={deck.positionSec}
            pitchPercent={deck.pitchPercent}
            className={`w-full h-full ${settings.videoMaintainAspectRatio ? 'object-contain' : 'object-cover'}`}
          />
        ) : (
          <div className="text-center px-4 text-xs text-slate-400 flex flex-col items-center gap-1.5">
            <Video className="w-6 h-6 text-slate-500" />
            <span>
              {deck.isLoaded
                ? `Audio track active on ${deck.deckId === 'DECK_A' ? 'Deck A' : 'Deck B'} — Load MP4/WEBM or Demo A/V`
                : 'Load MP4 / WEBM / MOV or tap Demo A/V (plays synced on Master Deck too)'}
            </span>
          </div>
        )}
      </div>

      {/* Live Audio-Following Wave Canvas */}
      <canvas
        ref={waveCanvasRef}
        width={360}
        height={38}
        className="w-full h-[38px] rounded border border-white/10 block"
      />

      {/* Seek Bar */}
      <div className="flex items-center gap-2">
        <span className="font-mono-tabular text-[11px] text-slate-400">
          {formatDjClock(deck.positionSec)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, deck.durationSec)}
          step={0.05}
          value={deck.positionSec}
          onChange={(e) => engine.seekTo(deck.deckId, Number(e.target.value))}
          style={{accentColor: accent}}
          className="flex-1 cursor-pointer"
        />
        <span className="font-mono-tabular text-[11px] text-slate-400">
          {formatDjClock(deck.durationSec)}
        </span>
      </div>

      {/* Transport + Volume (controls the unified Master Deck!) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => engine.togglePlayPause(deck.deckId)}
          style={deck.isPlaying ? {backgroundColor: accent} : undefined}
          className="w-10 h-9 rounded bg-[#232833] hover:bg-[#2E3442] text-white flex items-center justify-center cursor-pointer"
        >
          {deck.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => engine.stop(deck.deckId)}
          className="w-10 h-9 rounded bg-[#232833] hover:bg-[#2E3442] text-white flex items-center justify-center cursor-pointer"
        >
          <Square className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-bold text-slate-400 ml-1">VOL</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={deck.volume}
          onChange={(e) => engine.setDeckVolume(deck.deckId, Number(e.target.value))}
          style={{accentColor: accent}}
          className="flex-1 cursor-pointer"
        />
      </div>
    </div>
  );

  const opacityA = settings.videoCrossfadeBlend ? 1 - crossfader : crossfader < 0.5 ? 1 : 0;
  const opacityB = settings.videoCrossfadeBlend ? crossfader : crossfader >= 0.5 ? 1 : 0;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#171F2C_0%,#090C11_55%,#05070A_100%)] text-slate-100 p-2 sm:p-3 flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 emma-controller-chassis border border-white/15 rounded-lg px-2.5 sm:px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/assets/aistudio/1000355629_1467eab5.png"
            alt="DJ EMMA PRO"
            decoding="async"
            className="w-8 h-8 rounded-full object-cover object-[50%_12%] border border-white/30 shadow shrink-0"
            referrerPolicy="no-referrer"
          />
          <h1 className="font-display text-base sm:text-xl font-bold tracking-wide text-white truncate">
            DJ EMMA PRO · VIDEO DECKS
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {(['MASTER', 'VIDEO', 'STEMS', 'SETTINGS'] as AppSection[]).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onNavigateSection(sec)}
              className={`px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
                sec === 'VIDEO'
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#222731] text-slate-200 hover:bg-[#2D3442]'
              }`}
            >
              {sec}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 items-start min-w-0">
        {renderDeck(deckA, '#2188FF', waveCanvasARef, fileARef)}

        {/* MASTER PROGRAM MONITOR */}
        <div
          className={`${
            fullscreen ? 'fixed inset-0 z-50 p-4' : 'relative rounded-xl border border-white/15 p-3'
          } bg-[#12151B] flex flex-col gap-2.5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#4CAF50]">
              MASTER VIDEO PROGRAM OUTPUT
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {recordingState.status === 'IDLE' ? (
                <button
                  type="button"
                  onClick={() => {
                    engine.setRecordingMode('VIDEO');
                    engine.startRecording();
                  }}
                  className="px-2.5 py-1.5 rounded bg-[#232833] hover:bg-red-950 border border-red-500/40 text-[11px] font-bold text-red-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  REC A/V
                </button>
              ) : (
                <>
                  <span className="font-mono-tabular text-[11px] font-bold text-red-300 bg-red-950/70 border border-red-500/40 px-2 py-1 rounded">
                    {recordingState.status === 'PAUSED' ? 'PAUSED ' : '● '}
                    {Math.floor(recordingState.elapsedSec / 60)}:{String(recordingState.elapsedSec % 60).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      recordingState.status === 'RECORDING'
                        ? engine.pauseRecording()
                        : engine.resumeRecording()
                    }
                    className="px-2 py-1.5 rounded bg-[#232833] hover:bg-[#303746] text-[11px] font-bold text-white cursor-pointer"
                  >
                    {recordingState.status === 'RECORDING' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => engine.stopRecording()}
                    className="px-2 py-1.5 rounded bg-red-600 hover:bg-red-500 text-[11px] font-bold text-white cursor-pointer"
                  >
                    Stop
                  </button>
                </>
              )}
              {recordingState.lastSaved && recordingState.status === 'IDLE' && (
                <div className="flex items-center gap-1 bg-emerald-950/70 border border-emerald-500/40 rounded px-2 py-1">
                  <a
                    href={recordingState.lastSaved.url}
                    download={recordingState.lastSaved.name}
                    className="text-[11px] font-bold text-emerald-300 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save
                  </a>
                  <button
                    type="button"
                    onClick={() => engine.clearSavedRecording()}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                className="px-2.5 py-1.5 rounded bg-[#232833] hover:bg-[#303746] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            </div>
          </div>

          <div className="relative aspect-video w-full flex-1 bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
            {deckA.videoUrl && (
              <DeckVideoPlayer
                srcUrl={deckA.videoUrl}
                isPlaying={deckA.isPlaying}
                positionSec={deckA.positionSec}
                pitchPercent={deckA.pitchPercent}
                onVideoElement={(el) => engine.registerVideoElement('DECK_A', el)}
                style={{opacity: opacityA}}
                className={`absolute inset-0 w-full h-full ${
                  settings.videoMaintainAspectRatio ? 'object-contain' : 'object-cover'
                }`}
              />
            )}
            {deckB.videoUrl && (
              <DeckVideoPlayer
                srcUrl={deckB.videoUrl}
                isPlaying={deckB.isPlaying}
                positionSec={deckB.positionSec}
                pitchPercent={deckB.pitchPercent}
                onVideoElement={(el) => engine.registerVideoElement('DECK_B', el)}
                style={{opacity: opacityB}}
                className={`absolute inset-0 w-full h-full ${
                  settings.videoMaintainAspectRatio ? 'object-contain' : 'object-cover'
                }`}
              />
            )}
            {!deckA.videoUrl && !deckB.videoUrl && (
              <span className="text-xs text-slate-400">
                Crossfader blends Deck A & Deck B video live here
              </span>
            )}
          </div>

          {/* Live Program Blended Audio Wave */}
          <canvas
            ref={waveCanvasProgRef}
            width={380}
            height={38}
            className="w-full h-[38px] rounded border border-white/10 block"
          />

          <div className="flex items-center gap-2 bg-[#1A1F28] px-2.5 py-2 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => engine.animateCrossfaderTo(0, 2200)}
              className="px-2 py-1 rounded bg-[#2188FF]/20 border border-[#2188FF]/40 text-[10px] font-bold text-[#2188FF] cursor-pointer"
            >
              FADE A
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={crossfader}
              onChange={(e) => engine.setCrossfader(Number(e.target.value))}
              className="chronix-crossfader flex-1"
            />
            <button
              type="button"
              onClick={() => engine.animateCrossfaderTo(1, 2200)}
              className="px-2 py-1 rounded bg-[#FF7A00]/20 border border-[#FF7A00]/40 text-[10px] font-bold text-[#FF7A00] cursor-pointer"
            >
              FADE B
            </button>
          </div>
        </div>

        {renderDeck(deckB, '#FF7A00', waveCanvasBRef, fileBRef)}
      </div>
    </div>
  );
};
