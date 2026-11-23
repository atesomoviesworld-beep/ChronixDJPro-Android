import React, {useEffect, useRef, useState} from 'react';
import {
  Disc,
  FolderOpen,
  Mic,
  Play,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {DeckState, SamplerPadState} from '../types/dj';
import {WebDjEngine} from '../audio/WebDjEngine';

interface SamplerManagerModalProps {
  isOpen: boolean;
  initialPadId: string | null;
  samplerPads: SamplerPadState[];
  deckA: DeckState;
  deckB: DeckState;
  engine: WebDjEngine;
  onClose: () => void;
}

const PAD_COLORS = [
  {label: 'Blue', hex: '#2188FF'},
  {label: 'Orange', hex: '#FF7A00'},
  {label: 'Green', hex: '#22C55E'},
  {label: 'Amber', hex: '#F59E0B'},
  {label: 'Rose', hex: '#F43F5E'},
  {label: 'Cyan', hex: '#06B6D4'},
];

export const SamplerManagerModal: React.FC<SamplerManagerModalProps> = ({
  isOpen,
  initialPadId,
  samplerPads,
  deckA,
  deckB,
  engine,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micTimerRef = useRef<number | null>(null);

  const [selectedPadId, setSelectedPadId] = useState<string | null>(initialPadId);
  const [labelInput, setLabelInput] = useState('');
  const [volumeInput, setVolumeInput] = useState(0.95);
  const [loopInput, setLoopInput] = useState(false);
  const [colorInput, setColorInput] = useState<string>('#2188FF');
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [micRecording, setMicRecording] = useState(false);
  const [micElapsedSec, setMicElapsedSec] = useState(0);

  const activePad = selectedPadId
    ? samplerPads.find((p) => p.id === selectedPadId) ?? null
    : null;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPadId(initialPadId);
    setLocalError(null);
    setBusyMessage(null);
  }, [isOpen, initialPadId]);

  useEffect(() => {
    if (activePad) {
      setLabelInput(activePad.label);
      setVolumeInput(activePad.volume);
      setLoopInput(activePad.loop);
      setColorInput(activePad.color ?? '#2188FF');
    } else {
      setLabelInput('');
      setVolumeInput(0.95);
      setLoopInput(false);
      setColorInput('#2188FF');
    }
  }, [activePad?.id]);

  useEffect(() => {
    if (!isOpen) {
      stopMicCaptureCleanup();
    }
    return () => {
      stopMicCaptureCleanup();
    };
  }, [isOpen]);

  const stopMicCaptureCleanup = () => {
    if (micTimerRef.current !== null) {
      window.clearInterval(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setMicRecording(false);
  };

  if (!isOpen) return null;

  const isBuiltinSlot = activePad ? activePad.id.startsWith('builtin-') : false;

  const handleFilePicked = async (file: File) => {
    setLocalError(null);
    setBusyMessage('Loading audio file...');
    try {
      if (activePad) {
        const ok = await engine.replaceSamplerFromFile(
          activePad.id,
          file,
          labelInput.trim() || undefined
        );
        if (ok) {
          engine.updateSamplerPad(activePad.id, {
            volume: volumeInput,
            loop: loopInput,
            color: colorInput,
          });
        }
      } else {
        const created = await engine.addCustomSamplerFromFile(file, {
          label: labelInput.trim() || undefined,
          volume: volumeInput,
          loop: loopInput,
          color: colorInput,
        });
        if (created) {
          setSelectedPadId(created.id);
        }
      }
    } finally {
      setBusyMessage(null);
    }
  };

  const handleStartOrStopMic = async () => {
    setLocalError(null);
    if (micRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      micStreamRef.current = stream;
      micChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      setMicElapsedSec(0);
      setMicRecording(true);

      const started = Date.now();
      micTimerRef.current = window.setInterval(() => {
        setMicElapsedSec(Math.floor((Date.now() - started) / 1000));
      }, 250);

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) micChunksRef.current.push(ev.data);
      };

      rec.onstop = async () => {
        if (micTimerRef.current !== null) {
          window.clearInterval(micTimerRef.current);
          micTimerRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        setMicRecording(false);

        const blob = new Blob(micChunksRef.current, {type: rec.mimeType || 'audio/webm'});
        if (blob.size < 256) {
          setLocalError('Recording was empty. Please speak into the microphone and try again.');
          return;
        }

        setBusyMessage('Saving mic recording...');
        const chosenLabel = labelInput.trim() || `MIC TAG ${samplerPads.length + 1}`;
        try {
          if (activePad) {
            const ok = await engine.replaceSamplerFromBlob(
              activePad.id,
              blob,
              chosenLabel,
              'MIC_RECORDING',
              `${chosenLabel}.webm`
            );
            if (ok) {
              engine.updateSamplerPad(activePad.id, {
                volume: volumeInput,
                loop: loopInput,
                color: colorInput,
              });
            }
          } else {
            const created = await engine.addCustomSamplerFromBlob(
              blob,
              chosenLabel,
              'MIC_RECORDING',
              `${chosenLabel}.webm`,
              {volume: volumeInput, loop: loopInput, color: colorInput}
            );
            if (created) {
              setSelectedPadId(created.id);
            }
          }
        } finally {
          setBusyMessage(null);
        }
      };

      rec.start();
    } catch {
      setLocalError('Microphone access was denied or unavailable.');
      stopMicCaptureCleanup();
    }
  };

  const handleCaptureDeck = async (deckId: 'DECK_A' | 'DECK_B') => {
    setLocalError(null);
    setBusyMessage(`Capturing 4s clip from ${deckId === 'DECK_A' ? 'Deck A' : 'Deck B'}...`);
    try {
      const res = await engine.captureDeckClipToSampler(
        deckId,
        4,
        activePad?.id ?? null,
        labelInput.trim() || undefined
      );
      if (res) {
        engine.updateSamplerPad(res.id, {
          volume: volumeInput,
          loop: loopInput,
          color: colorInput,
        });
        setSelectedPadId(res.id);
      }
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSaveMetadataOnly = () => {
    if (!activePad) return;
    engine.updateSamplerPad(activePad.id, {
      label: labelInput.trim() || activePad.label,
      volume: volumeInput,
      loop: loopInput,
      color: colorInput,
    });
    onClose();
  };

  const handleDeleteOrReset = async () => {
    if (!activePad) return;
    await engine.removeOrResetSamplerPad(activePad.id);
    if (!isBuiltinSlot) {
      setSelectedPadId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2.5 sm:p-4">
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-xl bg-[#131720] border border-white/15 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate">
              {activePad ? `Customize Pad: ${activePad.label}` : 'Add Custom Sampler'}
            </h2>
            <p className="text-xs text-slate-400">
              Import any audio file, record a mic DJ drop, or capture from a deck
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#202632] hover:bg-[#2B3342] text-slate-200 cursor-pointer shrink-0"
            aria-label="Close sampler editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Quick Pad Slot Switcher */}
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Target Sampler Slot ({samplerPads.length} pads)
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPadId(null)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-colors ${
                  selectedPadId === null
                    ? 'bg-[#2188FF] border-white/60 text-white'
                    : 'bg-[#1A202B] border-white/15 text-slate-200 hover:bg-[#242C3A]'
                }`}
              >
                + New Pad
              </button>
              {samplerPads.map((pad) => (
                <button
                  key={pad.id}
                  type="button"
                  onClick={() => setSelectedPadId(pad.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border cursor-pointer transition-colors ${
                    selectedPadId === pad.id
                      ? 'bg-[#252E3E] border-[#2188FF] text-white'
                      : 'bg-[#171B24] border-white/10 text-slate-300 hover:bg-[#202634]'
                  }`}
                >
                  {pad.label}
                </button>
              ))}
            </div>
          </div>

          {localError && (
            <div className="px-3 py-2 rounded-lg bg-red-950/70 border border-red-500/40 text-xs text-red-200">
              {localError}
            </div>
          )}

          {busyMessage && (
            <div className="px-3 py-2 rounded-lg bg-sky-950/70 border border-sky-500/40 text-xs text-sky-200">
              {busyMessage}
            </div>
          )}

          {/* Pad Name & Playback Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Pad Name
              </label>
              <input
                type="text"
                maxLength={18}
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder={activePad ? activePad.label : 'e.g. DJ TAG, AIRHORN'}
                className="w-full h-10 px-3 rounded-lg bg-[#0D1016] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#2188FF]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                <span>Pad Volume</span>
                <span className="font-mono-tabular text-slate-200">
                  {Math.round(volumeInput * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.5}
                step={0.05}
                value={volumeInput}
                onChange={(e) => setVolumeInput(Number(e.target.value))}
                className="w-full h-10 accent-[#2188FF] cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                Trigger Mode
              </span>
              <div className="flex gap-1.5 bg-[#0D1016] p-1 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setLoopInput(false)}
                  className={`flex-1 py-2 rounded-md text-xs font-bold cursor-pointer ${
                    !loopInput ? 'bg-[#2188FF] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  One-Shot
                </button>
                <button
                  type="button"
                  onClick={() => setLoopInput(true)}
                  className={`flex-1 py-2 rounded-md text-xs font-bold cursor-pointer ${
                    loopInput ? 'bg-[#FF7A00] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Loop Toggle
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                Pad Color
              </span>
              <div className="flex items-center gap-2">
                {PAD_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColorInput(c.hex)}
                    style={{backgroundColor: c.hex}}
                    className={`w-8 h-8 rounded-lg cursor-pointer border-2 transition-transform ${
                      colorInput === c.hex ? 'border-white scale-110' : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                    title={c.label}
                    aria-label={`Pad color ${c.label}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Audio Source Importers */}
          <div className="space-y-2 pt-1 border-t border-white/10">
            <div className="text-xs font-semibold text-slate-400">
              {activePad ? 'Replace Audio Source' : 'Choose Audio Source'}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFilePicked(f);
                e.target.value = '';
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-3 py-2 rounded-lg bg-[#1C2330] hover:bg-[#252E3E] border border-[#2188FF]/50 flex items-center gap-2.5 text-left cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-[#2188FF] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Choose Audio File</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    MP3, WAV, M4A, OGG, WEBM
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleStartOrStopMic()}
                className={`min-h-[44px] px-3 py-2 rounded-lg border flex items-center gap-2.5 text-left cursor-pointer ${
                  micRecording
                    ? 'bg-red-700 hover:bg-red-600 border-red-300'
                    : 'bg-[#1C2330] hover:bg-[#252E3E] border-white/15'
                }`}
              >
                {micRecording ? (
                  <Square className="w-4 h-4 text-white shrink-0" />
                ) : (
                  <Mic className="w-4 h-4 text-[#FF7A00] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">
                    {micRecording ? `Stop Mic (${micElapsedSec}s)` : 'Record Mic Tag'}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    {micRecording ? 'Tap to save voice tag' : 'Record live DJ drop'}
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!deckA.isLoaded}
                onClick={() => void handleCaptureDeck('DECK_A')}
                className={`min-h-[40px] px-3 py-2 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
                  deckA.isLoaded
                    ? 'bg-[#18212E] hover:bg-[#212D3F] border-[#2188FF]/40 text-slate-100 cursor-pointer'
                    : 'bg-[#12161E] border-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Disc className="w-4 h-4 text-[#2188FF] shrink-0" />
                <span className="truncate">Capture 4s from Deck A</span>
              </button>

              <button
                type="button"
                disabled={!deckB.isLoaded}
                onClick={() => void handleCaptureDeck('DECK_B')}
                className={`min-h-[40px] px-3 py-2 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
                  deckB.isLoaded
                    ? 'bg-[#261D17] hover:bg-[#33261E] border-[#FF7A00]/40 text-slate-100 cursor-pointer'
                    : 'bg-[#12161E] border-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Disc className="w-4 h-4 text-[#FF7A00] shrink-0" />
                <span className="truncate">Capture 4s from Deck B</span>
              </button>
            </div>
          </div>

          {activePad && (
            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 pt-1">
              <span>
                Source:{' '}
                <strong className="text-slate-200">
                  {activePad.sourceType === 'BUILTIN'
                    ? 'Built-in Studio Synth'
                    : activePad.fileName ?? 'Custom Audio'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{activePad.durationSec.toFixed(2)}s</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-white/10 bg-[#0E1118] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {activePad && (
              <>
                <button
                  type="button"
                  onClick={() => engine.triggerSamplerPad(activePad.id)}
                  className="min-h-[40px] px-3 rounded-lg bg-[#222938] hover:bg-[#2C3548] border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Test Pad
                </button>
                {(activePad.sourceType !== 'BUILTIN' || !isBuiltinSlot) && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteOrReset()}
                    className="min-h-[40px] px-3 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-xs font-bold text-red-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isBuiltinSlot ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 rounded-lg bg-[#1D222C] hover:bg-[#262C38] text-xs font-semibold text-slate-200 cursor-pointer"
            >
              Close
            </button>
            {activePad && (
              <button
                type="button"
                onClick={handleSaveMetadataOnly}
                className="min-h-[40px] px-4 rounded-lg bg-[#2188FF] hover:bg-[#1974DE] text-xs font-bold text-white cursor-pointer"
              >
                Save Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
