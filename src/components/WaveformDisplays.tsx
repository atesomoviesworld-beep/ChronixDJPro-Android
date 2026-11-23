import React, {memo, useEffect, useRef} from 'react';
import {DeckState, WaveformPeak} from '../types/dj';

function samplePeak(peaks: WaveformPeak[], floatIdx: number): WaveformPeak {
  if (peaks.length === 0) {
    return {amplitude: 0, lowEnergy: 0, midEnergy: 0, highEnergy: 0};
  }
  const clamped = Math.max(0, Math.min(peaks.length - 1, floatIdx));
  const lo = Math.floor(clamped);
  const hi = Math.min(peaks.length - 1, lo + 1);
  const t = clamped - lo;
  const a = peaks[lo];
  const b = peaks[hi];
  return {
    amplitude: a.amplitude + (b.amplitude - a.amplitude) * t,
    lowEnergy: a.lowEnergy + (b.lowEnergy - a.lowEnergy) * t,
    midEnergy: a.midEnergy + (b.midEnergy - a.midEnergy) * t,
    highEnergy: a.highEnergy + (b.highEnergy - a.highEnergy) * t,
  };
}

interface DualVerticalWaveformProps {
  deckA: DeckState;
  deckB: DeckState;
  zoom: number;
  scrollSpeed: number;
  showBeatGrid: boolean;
  liteMode?: boolean;
  onSeekA: (sec: number) => void;
  onSeekB: (sec: number) => void;
  onChangeZoom?: (nextZoom: number) => void;
}

export const DualVerticalWaveform: React.FC<DualVerticalWaveformProps> = memo(({
  deckA,
  deckB,
  zoom,
  scrollSpeed,
  showBeatGrid,
  liteMode = true,
  onSeekA,
  onSeekB,
  onChangeZoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{lane: 'A' | 'B'; startY: number; startSec: number} | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = liteMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const cssW = canvas.clientWidth || 220;
    const cssH = canvas.clientHeight || 320;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#030406';
    ctx.fillRect(0, 0, cssW, cssH);

    const midX = cssW / 2;
    const playheadY = Math.round(cssH * 0.25);

    ctx.strokeStyle = '#2A303B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, cssH);
    ctx.stroke();

    const pxPerSec = 36 * Math.max(0.5, zoom) * Math.max(0.5, scrollSpeed);

    const drawDeckLane = (
      deck: DeckState,
      centerX: number,
      maxHalfW: number,
      lowColor: string,
      midColor: string,
      highColor: string
    ) => {
      const peaks = deck.waveform;
      if (!peaks.length || deck.durationSec <= 0) return;

      const laneLeft = centerX - maxHalfW;
      const laneW = maxHalfW * 2;
      const secPerPx = 1 / pxPerSec;

      const rate = Math.max(0.5, Math.min(1.5, 1 + deck.pitchPercent / 100));

      // Active loop region shading
      if (deck.loopActive && deck.loopEndSec > deck.loopStartSec) {
        const y1 = playheadY + ((deck.loopStartSec - deck.positionSec) / rate) * pxPerSec;
        const y2 = playheadY + ((deck.loopEndSec - deck.positionSec) / rate) * pxPerSec;
        const top = Math.max(0, Math.min(y1, y2));
        const bot = Math.min(cssH, Math.max(y1, y2));
        if (bot > top) {
          ctx.fillStyle = 'rgba(76, 175, 80, 0.16)';
          ctx.fillRect(laneLeft, top, laneW, bot - top);
        }
      }

      const stepPx = liteMode ? 3.5 : 2.5;
      for (let y = 0; y < cssH; y += stepPx) {
        const timeAtY = deck.positionSec + (y - playheadY) * secPerPx * rate;
        if (timeAtY < 0 || timeAtY > deck.durationSec) continue;
        const floatIdx = (timeAtY / deck.durationSec) * (peaks.length - 1);
        const p = samplePeak(peaks, floatIdx);
        const halfW = p.amplitude * maxHalfW;

        ctx.fillStyle =
          p.highEnergy > 0.55
            ? highColor
            : p.midEnergy > p.lowEnergy
            ? midColor
            : lowColor;
        ctx.fillRect(centerX - halfW, y, halfW * 2, Math.max(1.3, stepPx - 0.5));
      }

      // BPM-accurate beatgrid ticks anchored on detected beatOffsetSec & scaled by playback rate
      if (showBeatGrid && deck.detectedBpm > 0) {
        const beatSecBuf = 60 / deck.detectedBpm;
        const anchor = deck.beatOffsetSec || 0;
        const startSec = Math.max(0, deck.positionSec - playheadY * secPerPx * rate);
        const endSec = Math.min(deck.durationSec, deck.positionSec + (cssH - playheadY) * secPerPx * rate);
        const firstBeat = Math.ceil((startSec - anchor) / beatSecBuf);
        const lastBeat = Math.floor((endSec - anchor) / beatSecBuf);
        for (let b = firstBeat; b <= lastBeat; b++) {
          const beatBuf = anchor + b * beatSecBuf;
          const y = playheadY + ((beatBuf - deck.positionSec) / rate) * pxPerSec;
          const isBar = ((b % 4) + 4) % 4 === 0;
          ctx.fillStyle = isBar ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.16)';
          ctx.fillRect(laneLeft, y, laneW, isBar ? 1.5 : 1);
        }
      }

      // Hot Cue ticks
      deck.hotCues.forEach((cue) => {
        if (cue.positionSec === null) return;
        const y = playheadY + ((cue.positionSec - deck.positionSec) / rate) * pxPerSec;
        if (y >= 0 && y <= cssH) {
          ctx.fillStyle = '#10B981';
          ctx.fillRect(laneLeft, y, laneW, 2);
        }
      });
    };

    drawDeckLane(deckA, midX * 0.5, midX * 0.44, '#2188FF', '#38BDF8', '#E0F2FE');
    drawDeckLane(deckB, midX + midX * 0.5, midX * 0.44, '#FF7A00', '#FBBF24', '#FEF3C7');

    // Playhead needle
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, playheadY - 1, cssW, 2);

    ctx.restore();
  }, [
    deckA,
    deckB,
    deckA.positionSec,
    deckB.positionSec,
    deckA.pitchPercent,
    deckB.pitchPercent,
    deckA.beatOffsetSec,
    deckB.beatOffsetSec,
    deckA.loopActive,
    deckB.loopActive,
    zoom,
    scrollSpeed,
    showBeatGrid,
    liteMode,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isA = e.clientX - rect.left < rect.width / 2;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      lane: isA ? 'A' : 'B',
      startY: e.clientY,
      startSec: isA ? deckA.positionSec : deckB.positionSec,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const pxPerSec = 36 * Math.max(0.5, zoom) * Math.max(0.5, scrollSpeed);
    const dy = dragRef.current.startY - e.clientY;
    const activeDeck = dragRef.current.lane === 'A' ? deckA : deckB;
    const rate = Math.max(0.5, Math.min(1.5, 1 + activeDeck.pitchPercent / 100));
    const deltaSec = (dy / pxPerSec) * rate;
    if (dragRef.current.lane === 'A' && deckA.durationSec > 0) {
      onSeekA(Math.max(0, Math.min(deckA.durationSec, dragRef.current.startSec + deltaSec)));
    } else if (dragRef.current.lane === 'B' && deckB.durationSec > 0) {
      onSeekB(Math.max(0, Math.min(deckB.durationSec, dragRef.current.startSec + deltaSec)));
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={(e) => {
        if (!onChangeZoom) return;
        e.preventDefault();
        const next = Math.max(0.5, Math.min(4, Number((zoom + (e.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
        onChangeZoom(next);
      }}
      className="w-full h-full cursor-ns-resize touch-none block"
      title="Drag vertically to scrub Deck A (left) or Deck B (right) • Scroll wheel to zoom"
    />
  );
});

interface ParallelScrollingWaveformProps {
  deckA: DeckState;
  deckB: DeckState;
  zoom: number;
  scrollSpeed: number;
  showBeatGrid: boolean;
  liteMode?: boolean;
  onSeekA: (sec: number) => void;
  onSeekB: (sec: number) => void;
  onChangeZoom?: (nextZoom: number) => void;
}

/**
 * VirtualDJ-style dual horizontal stacked scrolling waveform with shared center beatgrid playhead,
 * RGB 3-band energy shading, hot cues, loop shading, and smooth pointer drag scrubbing.
 */
export const ParallelScrollingWaveform: React.FC<ParallelScrollingWaveformProps> = memo(({
  deckA,
  deckB,
  zoom,
  scrollSpeed,
  showBeatGrid,
  liteMode = true,
  onSeekA,
  onSeekB,
  onChangeZoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{lane: 'A' | 'B'; startX: number; startSec: number} | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = liteMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 68;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#05070A';
    ctx.fillRect(0, 0, cssW, cssH);

    const midY = cssH / 2;
    const playheadX = Math.round(cssW * 0.34);
    const pxPerSec = 68 * Math.max(0.5, zoom) * Math.max(0.5, scrollSpeed);
    const secPerPx = 1 / pxPerSec;

    // Horizontal divider between Deck A & Deck B lanes
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, midY - 0.5, cssW, 1);

    const drawHorizontalLane = (
      deck: DeckState,
      laneTop: number,
      laneH: number,
      lowColor: string,
      midColor: string,
      highColor: string
    ) => {
      const peaks = deck.waveform;
      const centerY = laneTop + laneH / 2;
      const maxHalfH = laneH * 0.44;
      if (!peaks.length || deck.durationSec <= 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, centerY - 0.5, cssW, 1);
        return;
      }

      const rate = Math.max(0.5, Math.min(1.5, 1 + deck.pitchPercent / 100));

      if (deck.loopActive && deck.loopEndSec > deck.loopStartSec) {
        const x1 = playheadX + ((deck.loopStartSec - deck.positionSec) / rate) * pxPerSec;
        const x2 = playheadX + ((deck.loopEndSec - deck.positionSec) / rate) * pxPerSec;
        const left = Math.max(0, Math.min(x1, x2));
        const right = Math.min(cssW, Math.max(x1, x2));
        if (right > left) {
          ctx.fillStyle = 'rgba(76, 175, 80, 0.18)';
          ctx.fillRect(left, laneTop, right - left, laneH);
        }
      }

      const stepPx = liteMode ? 3.5 : 2.5;
      for (let x = 0; x < cssW; x += stepPx) {
        const timeAtX = deck.positionSec + (x - playheadX) * secPerPx * rate;
        if (timeAtX < 0 || timeAtX > deck.durationSec) continue;
        const floatIdx = (timeAtX / deck.durationSec) * (peaks.length - 1);
        const p = samplePeak(peaks, floatIdx);
        const halfH = Math.max(1.5, p.amplitude * maxHalfH);
        ctx.fillStyle =
          p.highEnergy > 0.55
            ? highColor
            : p.midEnergy > p.lowEnergy
            ? midColor
            : lowColor;
        ctx.fillRect(x, centerY - halfH, Math.max(1.5, stepPx - 0.6), halfH * 2);
      }

      if (showBeatGrid && deck.detectedBpm > 0) {
        const beatSecBuf = 60 / deck.detectedBpm;
        const anchor = deck.beatOffsetSec || 0;
        const startSec = Math.max(0, deck.positionSec - playheadX * secPerPx * rate);
        const endSec = Math.min(deck.durationSec, deck.positionSec + (cssW - playheadX) * secPerPx * rate);
        const firstBeat = Math.ceil((startSec - anchor) / beatSecBuf);
        const lastBeat = Math.floor((endSec - anchor) / beatSecBuf);
        for (let b = firstBeat; b <= lastBeat; b++) {
          const beatBuf = anchor + b * beatSecBuf;
          const x = playheadX + ((beatBuf - deck.positionSec) / rate) * pxPerSec;
          const isBar = ((b % 4) + 4) % 4 === 0;
          ctx.fillStyle = isBar ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.16)';
          ctx.fillRect(x, laneTop, isBar ? 1.5 : 1, laneH);
        }
      }

      deck.hotCues.forEach((cue) => {
        if (cue.positionSec === null) return;
        const x = playheadX + ((cue.positionSec - deck.positionSec) / rate) * pxPerSec;
        if (x >= 0 && x <= cssW) {
          ctx.fillStyle = '#10B981';
          ctx.fillRect(x, laneTop, 2, laneH);
        }
      });
    };

    drawHorizontalLane(deckA, 1, midY - 2, '#2188FF', '#38BDF8', '#E0F2FE');
    drawHorizontalLane(deckB, midY + 1, midY - 2, '#FF7A00', '#FBBF24', '#FEF3C7');

    // Shared center playhead needle
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(playheadX - 1, 0, 2, cssH);

    ctx.restore();
  }, [
    deckA,
    deckB,
    deckA.positionSec,
    deckB.positionSec,
    deckA.pitchPercent,
    deckB.pitchPercent,
    deckA.beatOffsetSec,
    deckB.beatOffsetSec,
    deckA.loopActive,
    deckB.loopActive,
    zoom,
    scrollSpeed,
    showBeatGrid,
    liteMode,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isA = e.clientY - rect.top < rect.height / 2;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      lane: isA ? 'A' : 'B',
      startX: e.clientX,
      startSec: isA ? deckA.positionSec : deckB.positionSec,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const pxPerSec = 68 * Math.max(0.5, zoom) * Math.max(0.5, scrollSpeed);
    const dx = dragRef.current.startX - e.clientX;
    const activeDeck = dragRef.current.lane === 'A' ? deckA : deckB;
    const rate = Math.max(0.5, Math.min(1.5, 1 + activeDeck.pitchPercent / 100));
    const deltaSec = (dx / pxPerSec) * rate;
    if (dragRef.current.lane === 'A' && deckA.durationSec > 0) {
      onSeekA(Math.max(0, Math.min(deckA.durationSec, dragRef.current.startSec + deltaSec)));
    } else if (dragRef.current.lane === 'B' && deckB.durationSec > 0) {
      onSeekB(Math.max(0, Math.min(deckB.durationSec, dragRef.current.startSec + deltaSec)));
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onWheel={(e) => {
        if (!onChangeZoom) return;
        e.preventDefault();
        const next = Math.max(0.5, Math.min(4, Number((zoom + (e.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
        onChangeZoom(next);
      }}
      className="w-full h-[64px] sm:h-[72px] rounded cursor-ew-resize touch-none block"
      title="VirtualDJ Parallel Waveforms: Drag left/right to scrub Deck A (top) or Deck B (bottom)"
    />
  );
});

interface HorizontalOverviewProps {
  waveform: WaveformPeak[];
  progress: number;
  accentColor: string;
  durationSec?: number;
  loopActive?: boolean;
  loopStartSec?: number;
  loopEndSec?: number;
  hotCues?: Array<{index: number; positionSec: number | null}>;
  onSeek: (fraction: number) => void;
}

export const HorizontalOverviewWaveform: React.FC<HorizontalOverviewProps> = memo(({
  waveform,
  progress,
  accentColor,
  durationSec = 0,
  loopActive = false,
  loopStartSec = 0,
  loopEndSec = 0,
  hotCues,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#07090C';
    ctx.fillRect(0, 0, w, h);

    if (loopActive && durationSec > 0 && loopEndSec > loopStartSec) {
      const lx1 = (loopStartSec / durationSec) * w;
      const lx2 = (loopEndSec / durationSec) * w;
      ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
      ctx.fillRect(lx1, 0, Math.max(2, lx2 - lx1), h);
    }

    if (waveform.length > 0) {
      const barW = w / waveform.length;
      for (let i = 0; i < waveform.length; i++) {
        const amp = waveform[i].amplitude;
        const barH = Math.max(2, amp * h);
        const passed = i / waveform.length <= progress;
        ctx.fillStyle = passed ? '#4ADE80' : accentColor;
        ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 0.3), barH);
      }

      if (hotCues && durationSec > 0) {
        ctx.fillStyle = '#FACC15';
        hotCues.forEach((c) => {
          if (c.positionSec !== null) {
            const cx = (c.positionSec / durationSec) * w;
            ctx.fillRect(cx, 0, 1.5, h);
          }
        });
      }

      const px = Math.round(progress * w);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px, 0, 2, h);
    }
  }, [waveform, progress, accentColor, durationSec, loopActive, loopStartSec, loopEndSec, hotCues]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={26}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
      }}
      className="w-full h-[24px] rounded border border-white/10 cursor-pointer block"
      title="Click waveform overview to scrub track"
    />
  );
});
