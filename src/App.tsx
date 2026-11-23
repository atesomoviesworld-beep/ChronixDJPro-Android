import {useEffect, useRef, useState} from 'react';
import {WebDjEngine} from './audio/WebDjEngine';
import {WebStemsEngine} from './audio/WebStemsEngine';
import {MasterView} from './components/MasterView';
import {SettingsView} from './components/SettingsView';
import {StemsView} from './components/StemsView';
import {TrackLoadModal} from './components/TrackLoadModal';
import {VideoView} from './components/VideoView';
import {
  AppSection,
  DeckId,
  DEFAULT_SETTINGS,
  DjSettings,
  MasterCenterMode,
} from './types/dj';

const SETTINGS_STORAGE_KEY = 'chronixdj_pro_settings_v1';

function loadSavedSettings(): DjSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [section, setSection] = useState<AppSection>('MASTER');
  const [centerMode, setCenterMode] = useState<MasterCenterMode>('WAVEFORM');
  const [settings, setSettings] = useState<DjSettings>(loadSavedSettings);
  const [trackModalDeck, setTrackModalDeck] = useState<DeckId | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [recordedMix, setRecordedMix] = useState<{url: string; name: string} | null>(null);
  const [, setRenderTick] = useState(0);

  const engineRef = useRef<WebDjEngine | null>(null);
  const stemsRef = useRef<WebStemsEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new WebDjEngine(
      () => setRenderTick((t) => (t + 1) % 1_000_000),
      (msg) => setErrorBanner(msg),
      (url, name) => setRecordedMix({url, name})
    );
  }
  if (!stemsRef.current) {
    stemsRef.current = new WebStemsEngine(
      () => setRenderTick((t) => (t + 1) % 1_000_000),
      (msg) => setErrorBanner(msg)
    );
  }

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage quota errors
    }
    engineRef.current?.applySettings(settings);
  }, [settings]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      stemsRef.current?.dispose();
    };
  }, []);

  const engine = engineRef.current;
  const stemsEngine = stemsRef.current;

  return (
    <div className="min-h-screen bg-[#0A0C0F] text-slate-100">
      {errorBanner && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md bg-red-950/95 border border-red-500/60 text-red-100 px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 text-xs">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-bold cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {section === 'MASTER' && (
        <MasterView
          engine={engine}
          deckA={engine.deckStates.DECK_A}
          deckB={engine.deckStates.DECK_B}
          crossfader={engine.crossfader}
          masterVolume={engine.masterVolume}
          centerMode={centerMode}
          isRecording={engine.isRecording}
          recordingState={engine.recordingState}
          showBeatGrid={settings.showBeatGrid}
          highContrastMode={settings.highContrastMode}
          liteMode={settings.liteMode}
          waveformZoom={settings.waveformZoom}
          waveformScrollSpeed={settings.waveformScrollSpeed}
          recordedMixUrl={recordedMix}
          onChangeCenterMode={setCenterMode}
          onNavigateSection={setSection}
          onOpenTrackModal={setTrackModalDeck}
          onToggleLiteMode={() =>
            setSettings((prev) => ({...prev, liteMode: !prev.liteMode}))
          }
          onUpdateWaveformZoom={(waveformZoom) =>
            setSettings((prev) => ({...prev, waveformZoom}))
          }
          onUpdateWaveformSpeed={(waveformScrollSpeed) =>
            setSettings((prev) => ({...prev, waveformScrollSpeed}))
          }
        />
      )}

      {section === 'VIDEO' && (
        <VideoView
          engine={engine}
          deckA={engine.deckStates.DECK_A}
          deckB={engine.deckStates.DECK_B}
          crossfader={engine.crossfader}
          settings={settings}
          recordingState={engine.recordingState}
          onNavigateSection={setSection}
        />
      )}

      {section === 'STEMS' && (
        <StemsView
          stemsEngine={stemsEngine}
          channels={stemsEngine.channels}
          onNavigateSection={setSection}
        />
      )}

      {section === 'SETTINGS' && (
        <SettingsView
          settings={settings}
          onUpdateSettings={setSettings}
          onResetPreferences={() => {
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
            setSettings(DEFAULT_SETTINGS);
          }}
          onNavigateSection={setSection}
        />
      )}

      <TrackLoadModal
        deckId={trackModalDeck}
        defaultFolderName={settings.defaultMusicFolderName}
        onClose={() => setTrackModalDeck(null)}
        onPickLocalFile={(deckId, file) => void engine.loadLocalFile(deckId, file)}
        onPickStudioPreset={(deckId, preset) => engine.loadStudioPreset(deckId, preset)}
        onPickDemoVideo={(deckId, blobUrl, title, bpm) =>
          void engine.loadVideoClipUrl(deckId, blobUrl, title, bpm)
        }
      />
    </div>
  );
}
