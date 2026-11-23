import React, {memo, useRef} from 'react';
import {DeckVideoPlayer} from './DeckVideoPlayer';

interface TurntableJogWheelProps {
  bpm: number;
  musicalKey: string;
  pitchPercent: number;
  positionSec: number;
  durationSec: number;
  platterDegrees: number;
  accentColor: string;
  isPlaying: boolean;
  videoUrl?: string | null;
  onVideoElement?: (el: HTMLVideoElement | null) => void;
  onScratchStart?: () => void;
  onScratchDelta: (deltaDegrees: number) => void;
  onScratchEnd?: () => void;
}

export function formatDjClock(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export const TurntableJogWheel: React.FC<TurntableJogWheelProps> = memo(({
  bpm,
  musicalKey,
  pitchPercent,
  positionSec,
  durationSec,
  platterDegrees,
  accentColor,
  isPlaying,
  videoUrl,
  onVideoElement,
  onScratchStart,
  onScratchDelta,
  onScratchEnd,
}) => {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const lastAngleRef = useRef<number | null>(null);

  const getPointerAngle = (clientX: number, clientY: number): number => {
    const el = wheelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastAngleRef.current = getPointerAngle(e.clientX, e.clientY);
    onScratchStart?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastAngleRef.current === null) return;
    const angle = getPointerAngle(e.clientX, e.clientY);
    let delta = angle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngleRef.current = angle;
    onScratchDelta(delta);
  };

  const handlePointerUp = () => {
    if (lastAngleRef.current !== null) {
      lastAngleRef.current = null;
      onScratchEnd?.();
    }
  };

  const effectiveBpm = bpm > 0 ? bpm * (1 + pitchPercent / 100) : 0;
  const remaining = Math.max(0, durationSec - positionSec);

  return (
    <div
      ref={wheelRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{boxShadow: `0 8px 20px rgba(0,0,0,0.8), 0 0 16px ${accentColor}24`}}
      className="relative aspect-square w-full max-w-[144px] sm:max-w-[210px] min-w-[84px] rounded-full bg-gradient-to-b from-[#202632] via-[#0B0E14] to-[#06080C] border border-white/20 select-none cursor-grab active:cursor-grabbing touch-none flex items-center justify-center overflow-hidden"
      title="Drag platter to scratch or nudge beat"
    >
      {/* Platter Media Surface: Live Video OR Official DJ EMMA PRO Skin Portrait */}
      <div className="absolute inset-[5px] sm:inset-[7px] rounded-full overflow-hidden pointer-events-none bg-[#080B10]">
        {videoUrl ? (
          <DeckVideoPlayer
            srcUrl={videoUrl}
            isPlaying={isPlaying}
            positionSec={positionSec}
            pitchPercent={pitchPercent}
            onVideoElement={onVideoElement}
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src="/assets/aistudio/1000355629_1467eab5.png"
            alt="DJ EMMA PRO Official Deck Platter Skin"
            decoding="async"
            className="w-full h-full object-cover object-[50%_18%] scale-[1.06] brightness-95"
            referrerPolicy="no-referrer"
          />
        )}
        {/* Radial Spotlight Vignette Scrim for Readout Contrast */}
        <div
          className="absolute inset-0"
          style={{
            background: videoUrl
              ? 'radial-gradient(circle at center, rgba(6,9,14,0.28) 0%, rgba(5,8,12,0.72) 100%)'
              : 'radial-gradient(circle at center, rgba(9,13,20,0.22) 0%, rgba(8,11,17,0.62) 66%, rgba(4,6,10,0.92) 100%)',
          }}
        />
      </div>

      {/* Outer Strobe Dotted Ring & Deck Color LED Rim */}
      <div className="absolute inset-[2px] rounded-full border border-dashed border-white/20 pointer-events-none" />
      <div
        className="absolute inset-[5px] sm:inset-[6px] rounded-full pointer-events-none"
        style={{
          border: `2.5px solid ${accentColor}`,
        }}
      />

      {/* Vinyl Micro-Grooves */}
      <div className="absolute inset-[13px] rounded-full border border-white/10 pointer-events-none" />
      <div className="absolute inset-[22px] rounded-full border border-white/8 pointer-events-none" />
      <div className="absolute inset-[31px] rounded-full border border-white/10 pointer-events-none hidden sm:block" />
      <div className="absolute inset-[40px] rounded-full border border-white/8 pointer-events-none hidden sm:block" />

      {/* Rotating Needle / Platter Indicator (GPU composited) */}
      <div
        className="absolute inset-0 pointer-events-none will-change-transform"
        style={{transform: `rotate(${platterDegrees}deg)`}}
      >
        <div
          className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[4px] sm:w-[5px] h-[36%] rounded-full"
          style={{backgroundColor: accentColor}}
        />
      </div>

      {/* Brushed Chrome Center Spindle Hub */}
      <div
        className="relative z-10 w-[28px] h-[28px] sm:w-[40px] sm:h-[40px] rounded-full bg-gradient-to-b from-[#2A313D] to-[#11151C] flex items-center justify-center pointer-events-none shadow-md"
        style={{border: `2px solid ${accentColor}`}}
      >
        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gradient-to-b from-slate-200 to-slate-500" />
      </div>

      {/* High-Contrast Digital Platter Telemetry (no heavy CSS filter shadows) */}
      <div className="absolute inset-0 z-20 flex flex-col justify-between items-center py-2 sm:py-3.5 px-2 sm:px-3.5 pointer-events-none">
        <div className="font-mono-tabular text-[10px] sm:text-[13px] font-extrabold text-white bg-black/70 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
          {effectiveBpm > 0 ? `BPM : ${effectiveBpm.toFixed(1)}` : 'BPM : 0.00'}
        </div>

        <div className="w-full flex items-center justify-between px-0.5 sm:px-1">
          <span
            className="font-mono-tabular text-[9px] sm:text-[11px] font-extrabold bg-black/70 px-1 sm:px-1.5 py-0.5 rounded"
            style={{color: accentColor}}
          >
            {musicalKey}
          </span>
          <span className="font-mono-tabular text-[9px] sm:text-[11px] font-extrabold text-white bg-black/70 px-1 sm:px-1.5 py-0.5 rounded">
            {pitchPercent >= 0 ? `+${pitchPercent.toFixed(1)}%` : `${pitchPercent.toFixed(1)}%`}
          </span>
        </div>

        <div className="flex flex-col items-center leading-tight bg-black/70 px-1.5 sm:px-2.5 py-0.5 rounded">
          <span className="font-mono-tabular text-[10px] sm:text-[12px] font-extrabold text-white">
            {formatDjClock(positionSec)}
          </span>
          <span className="font-mono-tabular text-[8.5px] sm:text-[10px] font-semibold text-slate-200">
            -{formatDjClock(remaining)}
          </span>
        </div>
      </div>
    </div>
  );
});
