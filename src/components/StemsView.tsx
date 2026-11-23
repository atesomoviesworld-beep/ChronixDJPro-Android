import React, {useRef} from 'react';
import {
  Cpu,
  FolderOpen,
  Layers,
  Pause,
  Play,
} from 'lucide-react';
import {
  AppSection,
  STEM_TYPES,
  StemChannelState,
  StemType,
} from '../types/dj';
import {WebStemsEngine} from '../audio/WebStemsEngine';
import {formatDjClock} from './TurntableJogWheel';

interface StemsViewProps {
  stemsEngine: WebStemsEngine;
  channels: Record<StemType, StemChannelState>;
  onNavigateSection: (section: AppSection) => void;
}

const STEM_COLORS: Record<StemType, string> = {
  VOCALS: '#2188FF',
  DRUMS: '#FF7A00',
  BASS: '#4CAF50',
  INSTRUMENTAL: '#38BDF8',
};

export const StemsView: React.FC<StemsViewProps> = ({
  stemsEngine,
  channels,
  onNavigateSection,
}) => {
  const fileRefs = useRef<Partial<Record<StemType, HTMLInputElement | null>>>({});

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#171F2C_0%,#090C11_55%,#05070A_100%)] text-slate-100 p-2 sm:p-3 flex flex-col gap-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 emma-controller-chassis border border-white/15 rounded-lg px-2.5 sm:px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/assets/aistudio/1000355629_1467eab5.png"
            alt="DJ EMMA PRO"
            decoding="async"
            className="w-8 h-8 rounded-full object-cover object-[50%_12%] border border-white/30 shadow shrink-0"
            referrerPolicy="no-referrer"
          />
          <Layers className="w-5 h-5 text-[#2188FF] shrink-0" />
          <h1 className="font-display text-base sm:text-xl font-bold tracking-wide text-white truncate">
            DJ EMMA PRO · STEMS MIXER
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {(['MASTER', 'VIDEO', 'STEMS', 'SETTINGS'] as AppSection[]).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onNavigateSection(sec)}
              className={`px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
                sec === 'STEMS'
                  ? 'bg-[#2188FF] text-white'
                  : 'bg-[#222731] text-slate-200 hover:bg-[#2D3442]'
              }`}
            >
              {sec}
            </button>
          ))}
        </nav>
      </header>

      {/* Honest AI Separation Architecture + Master Sync Transport */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151B] border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-start gap-3 max-w-2xl">
          <Cpu className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-white">
              Separated Stem Loader · AI Separation Engine Hook Ready
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Load pre-separated Vocals, Drums, Bass, and Instrumental audio files into each independent channel, or load the 4-Stem Studio Pack. Standard audio loading never simulates fake AI separation; <code className="text-cyan-300">StemSeparationProvider</code> is wired for future on-device/cloud separation models.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => stemsEngine.loadStudioStemPack(0)}
            className="px-3 py-2 rounded-lg bg-[#232833] hover:bg-[#2F3645] border border-white/15 text-xs font-bold text-white cursor-pointer"
          >
            Load 4-Stem Studio Pack
          </button>
          <button
            type="button"
            onClick={() => stemsEngine.playAllSync()}
            className="px-3.5 py-2 rounded-lg bg-[#4CAF50] hover:bg-[#43A047] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Play All Sync
          </button>
          <button
            type="button"
            onClick={() => stemsEngine.pauseAll()}
            className="px-3.5 py-2 rounded-lg bg-[#2A2F39] hover:bg-[#363D4B] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause All
          </button>
        </div>
      </div>

      {/* 4 Independent Stem Channel Strips */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STEM_TYPES.map((stemType) => {
          const ch = channels[stemType];
          const accent = STEM_COLORS[stemType];
          const anySolo = STEM_TYPES.some((t) => channels[t].isSolo);
          const effectivelyMuted = ch.isMuted || (anySolo && !ch.isSolo);

          return (
            <div
              key={stemType}
              className="bg-[#12151B] rounded-xl border p-4 flex flex-col justify-between gap-3"
              style={{borderColor: `${accent}66`}}
            >
              <input
                ref={(el) => {
                  fileRefs.current[stemType] = el;
                }}
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void stemsEngine.loadStemFile(stemType, file);
                  e.target.value = '';
                }}
              />

              {/* Channel Header */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold tracking-wide" style={{color: accent}}>
                    {ch.label.toUpperCase()}
                  </div>
                  <div className="text-xs text-slate-400 truncate max-w-[180px]" title={ch.fileName}>
                    {ch.fileName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileRefs.current[stemType]?.click()}
                  className="px-2.5 py-1.5 rounded bg-[#222731] hover:bg-[#2E3543] border border-white/10 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Load
                </button>
              </div>

              {/* Channel Visual Indicator Meter */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400">
                  <span>{formatDjClock(ch.positionSec)}</span>
                  <span>{effectivelyMuted ? 'MUTED' : `${Math.round(ch.levelMeter * 100)}% RMS`}</span>
                </div>
                <div className="h-3 w-full rounded bg-[#080A0D] border border-white/10 overflow-hidden">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: `${effectivelyMuted ? 0 : Math.round(ch.levelMeter * 100)}%`,
                      backgroundColor: accent,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, ch.durationSec)}
                  step={0.05}
                  value={ch.positionSec}
                  onChange={(e) => stemsEngine.seekChannel(stemType, Number(e.target.value))}
                  style={{accentColor: accent}}
                  className="w-full cursor-pointer"
                  title="Seek Stem Channel"
                />
              </div>

              {/* Mute / Solo / Play-Pause Controls */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => stemsEngine.toggleMute(stemType)}
                  className={`h-10 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                    ch.isMuted
                      ? 'bg-red-600 border-red-400 text-white'
                      : 'bg-[#222731] border-white/10 text-slate-200 hover:bg-[#2D3442]'
                  }`}
                >
                  MUTE
                </button>
                <button
                  type="button"
                  onClick={() => stemsEngine.toggleSolo(stemType)}
                  className={`h-10 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                    ch.isSolo
                      ? 'bg-amber-500 border-amber-300 text-slate-950'
                      : 'bg-[#222731] border-white/10 text-slate-200 hover:bg-[#2D3442]'
                  }`}
                >
                  SOLO
                </button>
                <button
                  type="button"
                  onClick={() => stemsEngine.togglePlayPause(stemType)}
                  style={ch.isPlaying ? {backgroundColor: accent} : undefined}
                  className={`h-10 rounded-lg border border-white/10 flex items-center justify-center text-white cursor-pointer ${
                    ch.isPlaying ? '' : 'bg-[#222731] hover:bg-[#2D3442]'
                  }`}
                >
                  {ch.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>

              {/* Channel Volume Fader */}
              <div className="bg-[#0B0D11] border border-white/10 rounded-lg p-3 flex flex-col items-center gap-2">
                <div className="w-full flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-slate-400">CHANNEL VOL</span>
                  <span className="font-bold text-white">{Math.round(ch.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ch.volume}
                  onChange={(e) => stemsEngine.setVolume(stemType, Number(e.target.value))}
                  style={{accentColor: accent}}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
