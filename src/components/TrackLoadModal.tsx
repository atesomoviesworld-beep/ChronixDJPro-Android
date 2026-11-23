import React, {useRef, useState} from 'react';
import {FolderOpen, Music, Video, X} from 'lucide-react';
import {DeckId} from '../types/dj';
import {STUDIO_TRACK_PRESETS, StudioTrackPreset} from '../audio/studioTrackGenerator';
import {createDeckDemoVideoClip} from './DeckVideoPlayer';

interface TrackLoadModalProps {
  deckId: DeckId | null;
  defaultFolderName: string;
  onClose: () => void;
  onPickLocalFile: (deckId: DeckId, file: File) => void;
  onPickStudioPreset: (deckId: DeckId, preset: StudioTrackPreset) => void;
  onPickDemoVideo: (deckId: DeckId, blobUrl: string, title: string, bpm: number) => void;
}

export const TrackLoadModal: React.FC<TrackLoadModalProps> = ({
  deckId,
  defaultFolderName,
  onClose,
  onPickLocalFile,
  onPickStudioPreset,
  onPickDemoVideo,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [creatingVideo, setCreatingVideo] = useState(false);

  if (!deckId) return null;

  const isA = deckId === 'DECK_A';
  const accent = isA ? '#2188FF' : '#FF7A00';

  const handleLoadDemoAv = async (bpm: number, title: string) => {
    setCreatingVideo(true);
    try {
      const url = await createDeckDemoVideoClip(
        isA ? 'CHRONIX DECK A VIDEO' : 'CHRONIX DECK B VIDEO',
        accent,
        bpm
      );
      onPickDemoVideo(deckId, url, title, bpm);
      onClose();
    } finally {
      setCreatingVideo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl bg-[#14171D] border border-white/15 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">
              Load Audio or Video Into {isA ? 'Deck A' : 'Deck B'}
            </h2>
            <p className="text-xs text-slate-400">Folder: {defaultFolderName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#222731] hover:bg-[#2C3340] text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.mp4,.webm,.mov,.mkv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onPickLocalFile(deckId, file);
                onClose();
              }
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{borderColor: accent}}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg bg-[#1D222B] hover:bg-[#252B36] border text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="w-5 h-5" style={{color: accent}} />
              <div>
                <div className="text-sm font-semibold text-white">
                  Browse Device Audio or Video File
                </div>
                <div className="text-xs text-slate-400">
                  MP3, WAV, FLAC, M4A, MP4, WEBM, MOV — plays directly on deck
                </div>
              </div>
            </div>
            <span
              className="px-3 py-1.5 rounded text-xs font-bold text-white whitespace-nowrap"
              style={{backgroundColor: accent}}
            >
              Choose File
            </span>
          </button>

          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Video Clips (Plays Directly on Deck & Center Program Mix)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={creatingVideo}
                onClick={() =>
                  void handleLoadDemoAv(isA ? 124 : 128, isA ? 'Deck_A_Visual_Mix.webm' : 'Deck_B_Visual_Mix.webm')
                }
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1A1E26] hover:bg-[#232833] border border-white/10 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Video className="w-4 h-4 shrink-0" style={{color: accent}} />
                  <span className="text-xs font-medium text-slate-100 truncate">
                    {creatingVideo ? 'Building A/V Clip...' : `Studio A/V Loop (${isA ? 124 : 128} BPM)`}
                  </span>
                </div>
              </button>
              <button
                type="button"
                disabled={creatingVideo}
                onClick={() =>
                  void handleLoadDemoAv(96, isA ? 'Deck_A_Afro_Visual.webm' : 'Deck_B_Afro_Visual.webm')
                }
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1A1E26] hover:bg-[#232833] border border-white/10 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Video className="w-4 h-4 shrink-0" style={{color: accent}} />
                  <span className="text-xs font-medium text-slate-100 truncate">
                    {creatingVideo ? 'Building A/V Clip...' : 'Afro Visual Loop (96 BPM)'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Audio Studio Crate (44.1kHz PCM Tracks)
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {STUDIO_TRACK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onPickStudioPreset(deckId, preset);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#1A1E26] hover:bg-[#232833] border border-white/10 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Music className="w-4 h-4 shrink-0" style={{color: accent}} />
                    <span className="text-xs font-medium text-slate-100 truncate">
                      {preset.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono-tabular text-slate-400 shrink-0 ml-2">
                    <span>{preset.bpm} BPM</span>
                    <span>·</span>
                    <span>{preset.musicalKey}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
