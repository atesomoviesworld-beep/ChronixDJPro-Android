import React, {useEffect, useRef} from 'react';

interface DeckVideoPlayerProps {
  srcUrl: string;
  isPlaying: boolean;
  positionSec: number;
  pitchPercent: number;
  className?: string;
  style?: React.CSSProperties;
  onVideoElement?: (el: HTMLVideoElement | null) => void;
}

/**
 * Synchronized muted <video> renderer locked directly to a Deck's WebDjEngine clock.
 * Audio comes exclusively from WebDjEngine (so EQ, FX, Acapella Remover, Pitch,
 * Loops, and Crossfader all process the video's audio seamlessly with zero echo).
 */
export const DeckVideoPlayer: React.FC<DeckVideoPlayerProps> = ({
  srcUrl,
  isPlaying,
  positionSec,
  pitchPercent,
  className = '',
  style,
  onVideoElement,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    onVideoElement?.(videoRef.current);
    return () => {
      onVideoElement?.(null);
    };
  }, [onVideoElement, srcUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const rate = Math.max(0.4, Math.min(2.0, 1 + pitchPercent / 100));
    if (Math.abs(el.playbackRate - rate) > 0.01) {
      el.playbackRate = rate;
    }
  }, [pitchPercent]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) {
      if (el.paused) {
        void el.play().catch(() => {});
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
    }
  }, [isPlaying, srcUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(positionSec)) return;
    const dur = el.duration;
    const target = Number.isFinite(dur) && dur > 0 ? positionSec % dur : positionSec;
    const drift = Math.abs(el.currentTime - target);
    // Snap immediately when paused/scrubbed or if drift exceeds 160ms
    if ((!isPlaying && drift > 0.04) || drift > 0.16) {
      try {
        el.currentTime = target;
      } catch {
        // ignore seek before metadata ready
      }
    }
  }, [positionSec, isPlaying]);

  return (
    <video
      ref={videoRef}
      src={srcUrl}
      muted
      playsInline
      loop
      className={className}
      style={style}
    />
  );
};

/**
 * Generates a lightweight 4-second WebM A/V clip (animated DJ visual + synthesized beat & center vocal)
 * ready to load directly onto Deck A or Deck B.
 */
export function createDeckDemoVideoClip(label: string, colorHex: string, bpm: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx2d = canvas.getContext('2d')!;
      const canvasStream = canvas.captureStream(24);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      const master = audioCtx.createGain();
      master.gain.value = 0.5;
      master.connect(dest);

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, {mimeType: 'video/webm'});
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        void audioCtx.close();
        resolve(URL.createObjectURL(new Blob(chunks, {type: 'video/webm'})));
      };

      const beatSec = 60 / bpm;
      let beatCount = 0;
      const triggerBeat = () => {
        const now = audioCtx.currentTime;
        const kick = audioCtx.createOscillator();
        const kGain = audioCtx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(145, now);
        kick.frequency.exponentialRampToValueAtTime(44, now + 0.14);
        kGain.gain.setValueAtTime(0.85, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        kick.connect(kGain);
        kGain.connect(master);
        kick.start(now);
        kick.stop(now + 0.25);

        // Wide stereo chords
        const panL = audioCtx.createStereoPanner();
        panL.pan.value = -0.85;
        const panR = audioCtx.createStereoPanner();
        panR.pan.value = 0.85;
        const chordL = audioCtx.createOscillator();
        const chordR = audioCtx.createOscillator();
        chordL.type = 'triangle';
        chordR.type = 'triangle';
        chordL.frequency.value = beatCount % 4 < 2 ? 220 : 261.63;
        chordR.frequency.value = beatCount % 4 < 2 ? 329.63 : 392.0;
        const cGain = audioCtx.createGain();
        cGain.gain.setValueAtTime(0.28, now);
        cGain.gain.exponentialRampToValueAtTime(0.01, now + beatSec * 0.9);
        chordL.connect(panL);
        chordR.connect(panR);
        panL.connect(cGain);
        panR.connect(cGain);
        cGain.connect(master);
        chordL.start(now);
        chordR.start(now);
        chordL.stop(now + beatSec);
        chordR.stop(now + beatSec);

        // Center vocal lead (removed by NO VOX / NO ACAPELLA)
        const vox = audioCtx.createOscillator();
        vox.type = 'sawtooth';
        vox.frequency.value = beatCount % 2 === 0 ? 523.25 : 587.33;
        const vFilter = audioCtx.createBiquadFilter();
        vFilter.type = 'bandpass';
        vFilter.frequency.value = 1100;
        const vGain = audioCtx.createGain();
        vGain.gain.setValueAtTime(0.32, now);
        vGain.gain.exponentialRampToValueAtTime(0.001, now + beatSec * 0.7);
        vox.connect(vFilter);
        vFilter.connect(vGain);
        vGain.connect(master);
        vox.start(now);
        vox.stop(now + beatSec * 0.75);

        beatCount++;
      };

      recorder.start();
      triggerBeat();
      const beatTimer = window.setInterval(triggerBeat, beatSec * 1000);

      let frame = 0;
      const totalFrames = 96; // 4s at 24fps
      const frameTimer = window.setInterval(() => {
        const t = frame / 24;
        ctx2d.fillStyle = '#07090D';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);

        const pulse = 0.5 + 0.5 * Math.sin((t * bpm * Math.PI) / 30);
        for (let i = 0; i < 5; i++) {
          ctx2d.strokeStyle = colorHex;
          ctx2d.lineWidth = 3;
          ctx2d.globalAlpha = 0.3 + (i / 5) * 0.55;
          ctx2d.beginPath();
          ctx2d.arc(
            canvas.width / 2,
            canvas.height / 2,
            26 + i * 20 + pulse * 14,
            t * 1.6 + i,
            t * 1.6 + i + Math.PI * 1.25
          );
          ctx2d.stroke();
        }
        ctx2d.globalAlpha = 1;
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.font = 'bold 22px sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.fillText(label, canvas.width / 2, canvas.height / 2 + 8);

        frame++;
        if (frame >= totalFrames) {
          window.clearInterval(frameTimer);
          window.clearInterval(beatTimer);
          recorder.stop();
        }
      }, 42);
    } catch (err) {
      reject(err);
    }
  });
}
