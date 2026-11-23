import React, {useEffect, useState} from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FolderOpen,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  AppSection,
  AudioOutputRoute,
  CrossfaderCurve,
  DjSettings,
  LatencyProfile,
} from '../types/dj';
import {buildClientZipBlob} from '../utils/zipBuilder';

interface AndroidFileEntry {
  path: string;
  size: number;
  content: string;
}

interface SettingsViewProps {
  settings: DjSettings;
  onUpdateSettings: (updater: (prev: DjSettings) => DjSettings) => void;
  onResetPreferences: () => void;
  onNavigateSection: (section: AppSection) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetPreferences,
  onNavigateSection,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [androidFiles, setAndroidFiles] = useState<AndroidFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<AndroidFileEntry | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadingAndroid, setLoadingAndroid] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipBlobUrl, setZipBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => setAudioDevices(list.filter((d) => d.kind === 'audiooutput')))
        .catch(() => setAudioDevices([]));
    }
  }, []);

  useEffect(() => {
    setLoadingAndroid(true);
    const loadFiles = async () => {
      for (const endpoint of ['/api/android-files', '/android-files.json']) {
        try {
          const res = await fetch(endpoint);
          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) continue;
          const data = (await res.json()) as {files?: AndroidFileEntry[]};
          if (data.files && data.files.length > 0) {
            setAndroidFiles(data.files);
            const readme =
              data.files.find((f) => f.path.endsWith('BUILD_ANDROID.md')) || data.files[0];
            setSelectedFile(readme);
            return;
          }
        } catch {
          // try next endpoint
        }
      }
      setAndroidFiles([]);
    };
    void loadFiles().finally(() => setLoadingAndroid(false));
  }, []);

  useEffect(() => {
    return () => {
      if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl);
    };
  }, [zipBlobUrl]);

  const handleDownloadAndroidZip = async () => {
    setZipStatus('Packaging ChronixDJPro-AndroidStudio.zip...');
    let blob: Blob | null = null;

    for (const url of ['/api/android-zip', '/ChronixDJPro-AndroidStudio.zip']) {
      try {
        const res = await fetch(url, {cache: 'no-store'});
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Verify PKZIP magic bytes ('P', 'K') so we never save an HTML fallback page as .zip
        if (bytes.length > 22 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
          blob = new Blob([bytes], {type: 'application/zip'});
          break;
        }
      } catch {
        // try next source
      }
    }

    if (!blob && androidFiles.length > 0) {
      blob = buildClientZipBlob(androidFiles);
    }

    if (!blob) {
      setZipStatus('Could not load Android source files to package ZIP.');
      return;
    }

    if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl);
    const objectUrl = URL.createObjectURL(blob);
    setZipBlobUrl(objectUrl);

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'ChronixDJPro-AndroidStudio.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const kb = Math.max(1, Math.round(blob.size / 1024));
    setZipStatus(`ZIP ready (${kb} KB). If download did not start automatically, click Save ZIP below.`);
  };

  const handleChooseDefaultFolder = async () => {
    const picker = (window as unknown as {showDirectoryPicker?: () => Promise<{name: string}>})
      .showDirectoryPicker;
    if (picker) {
      try {
        const dir = await picker();
        onUpdateSettings((prev) => ({
          ...prev,
          defaultMusicFolderName: dir.name,
          storagePermissionGranted: true,
        }));
        return;
      } catch {
        // User cancelled
        return;
      }
    }
    onUpdateSettings((prev) => ({
      ...prev,
      defaultMusicFolderName: 'Device Downloads / ChronixDJ Music',
      storagePermissionGranted: true,
    }));
  };

  const handleCopySource = (file: AndroidFileEntry) => {
    void navigator.clipboard.writeText(file.content);
    setCopiedPath(file.path);
    window.setTimeout(() => setCopiedPath(null), 1500);
  };

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
          <h1 className="font-display text-base sm:text-xl font-bold tracking-wide text-white truncate">
            DJ EMMA PRO · SETTINGS & ANDROID
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {(['MASTER', 'VIDEO', 'STEMS', 'SETTINGS'] as AppSection[]).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onNavigateSection(sec)}
              className={`px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
                sec === 'SETTINGS'
                  ? 'bg-[#2188FF] text-white'
                  : 'bg-[#222731] text-slate-200 hover:bg-[#2D3442]'
              }`}
            >
              {sec}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
        {/* Left Column: Audio, Theme, Storage, Video, Reset */}
        <div className="space-y-3">
          {/* Audio Output & Buffer Latency */}
          <section className="bg-[#12151B] border border-white/10 rounded-xl p-4 space-y-3">
            <h2 className="text-xs font-bold tracking-wider text-[#2188FF]">
              AUDIO OUTPUT & BUFFER LATENCY
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Audio Output Route
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(['AUTO', 'SPEAKER', 'HEADPHONES', 'BLUETOOTH'] as AudioOutputRoute[]).map((route) => (
                  <button
                    key={route}
                    type="button"
                    onClick={() => onUpdateSettings((p) => ({...p, audioOutputRoute: route}))}
                    className={`py-2 px-2 rounded text-[11px] font-bold cursor-pointer ${
                      settings.audioOutputRoute === route
                        ? 'bg-[#4CAF50] text-white'
                        : 'bg-[#222731] text-slate-300 hover:bg-[#2D3442]'
                    }`}
                  >
                    {route}
                  </button>
                ))}
              </div>
            </div>

            {audioDevices.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 block">
                  System Output Device
                </label>
                <select
                  value={settings.audioOutputDeviceId}
                  onChange={(e) =>
                    onUpdateSettings((p) => ({...p, audioOutputDeviceId: e.target.value}))
                  }
                  className="w-full bg-[#1C212A] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="default">System Default Output</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Audio Device (${d.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Audio Buffer & Latency Profile
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {(
                  [
                    {id: 'LOW_LATENCY', label: 'Low Latency (256)'},
                    {id: 'BALANCED', label: 'Balanced (512)'},
                    {id: 'HIGH_STABILITY', label: 'Stability (1024)'},
                  ] as Array<{id: LatencyProfile; label: string}>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings((p) => ({...p, latencyProfile: item.id}))}
                    className={`py-2 px-2 rounded text-[11px] font-bold cursor-pointer ${
                      settings.latencyProfile === item.id
                        ? 'bg-[#4CAF50] text-white'
                        : 'bg-[#222731] text-slate-300 hover:bg-[#2D3442]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Crossfader Curve
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {id: 'EQUAL_POWER', label: 'Equal Power'},
                    {id: 'LINEAR', label: 'Linear Blend'},
                    {id: 'FAST_CUT', label: 'Fast Cut'},
                  ] as Array<{id: CrossfaderCurve; label: string}>
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onUpdateSettings((p) => ({...p, crossfaderCurve: c.id}))}
                    className={`py-2 px-2 rounded text-[11px] font-bold cursor-pointer ${
                      settings.crossfaderCurve === c.id
                        ? 'bg-[#2188FF] text-white'
                        : 'bg-[#222731] text-slate-300 hover:bg-[#2D3442]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Theme, Storage, Video */}
          <section className="bg-[#12151B] border border-white/10 rounded-xl p-4 space-y-3">
            <h2 className="text-xs font-bold tracking-wider text-[#FF7A00]">
              THEME, STORAGE PERMISSIONS & VIDEO SETTINGS
            </h2>

            <SettingToggle
              label="Lite Performance Mode (Low CPU & 25fps Canvas)"
              checked={settings.liteMode}
              onChange={(v) => onUpdateSettings((p) => ({...p, liteMode: v}))}
            />
            <SettingToggle
              label="Auto BPM & Key Detection on Load"
              checked={settings.autoBpmDetection}
              onChange={(v) => onUpdateSettings((p) => ({...p, autoBpmDetection: v}))}
            />
            <SettingToggle
              label="Show Waveform Beatgrid Lines"
              checked={settings.showBeatGrid}
              onChange={(v) => onUpdateSettings((p) => ({...p, showBeatGrid: v}))}
            />
            <SettingToggle
              label="High-Contrast Club Mode"
              checked={settings.highContrastMode}
              onChange={(v) => onUpdateSettings((p) => ({...p, highContrastMode: v}))}
            />
            <SettingToggle
              label="Video Crossfader Alpha Blend"
              checked={settings.videoCrossfadeBlend}
              onChange={(v) => onUpdateSettings((p) => ({...p, videoCrossfadeBlend: v}))}
            />
            <SettingToggle
              label="Maintain Video Aspect Ratio"
              checked={settings.videoMaintainAspectRatio}
              onChange={(v) => onUpdateSettings((p) => ({...p, videoMaintainAspectRatio: v}))}
            />

            <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Waveform Zoom</span>
                  <span className="font-mono-tabular font-bold text-cyan-300">
                    {settings.waveformZoom.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.25}
                  value={settings.waveformZoom}
                  onChange={(e) =>
                    onUpdateSettings((p) => ({...p, waveformZoom: Number(e.target.value)}))
                  }
                  className="w-full accent-[#2188FF] cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Waveform Scroll Speed</span>
                  <span className="font-mono-tabular font-bold text-amber-300">
                    {settings.waveformScrollSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.25}
                  value={settings.waveformScrollSpeed}
                  onChange={(e) =>
                    onUpdateSettings((p) => ({...p, waveformScrollSpeed: Number(e.target.value)}))
                  }
                  className="w-full accent-[#FF7A00] cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-4 h-4 text-[#4CAF50]" />
                <span>
                  Storage Access:{' '}
                  <strong className="text-[#4CAF50]">
                    {settings.storagePermissionGranted ? 'ACTIVE' : 'REQUIRED'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 truncate max-w-[180px]">
                  {settings.defaultMusicFolderName}
                </span>
                <button
                  type="button"
                  onClick={() => void handleChooseDefaultFolder()}
                  className="px-3 py-1.5 rounded bg-[#232833] hover:bg-[#2F3645] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Default Folder
                </button>
              </div>
            </div>
          </section>

          {/* App Info & Reset */}
          <section className="bg-[#12151B] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">ChronixDJ Pro v1.0.0</div>
              <div className="text-xs text-slate-400">
                Web Audio DSP Studio + Native Android Kotlin / Media3 / Jetpack Compose Project
              </div>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetPreferences();
                    setConfirmReset(false);
                  }}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 rounded bg-[#222731] text-xs font-bold text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-2 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-500/40 text-xs font-bold text-red-200 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Preferences
              </button>
            )}
          </section>
        </div>

        {/* Right Column: Complete Android Studio Kotlin Project Source & ZIP Download */}
        <section className="bg-[#12151B] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-h-[540px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#4CAF50]" />
              <h2 className="text-xs font-bold tracking-wider text-[#4CAF50]">
                NATIVE ANDROID STUDIO PROJECT (KOTLIN + COMPOSE + MEDIA3)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void handleDownloadAndroidZip()}
              className="px-3 py-2 rounded-lg bg-[#4CAF50] hover:bg-[#43A047] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Android Project (.zip)
            </button>
          </div>

          {zipStatus && (
            <div className="px-3 py-2 rounded-lg bg-[#0B0D11] border border-emerald-500/30 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span>{zipStatus}</span>
              {zipBlobUrl && (
                <a
                  href={zipBlobUrl}
                  download="ChronixDJPro-AndroidStudio.zip"
                  className="px-2.5 py-1 rounded bg-[#4CAF50] text-white font-bold text-[11px] hover:bg-[#43A047]"
                >
                  Save ZIP File
                </a>
              )}
            </div>
          )}

          <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 min-h-[420px]">
            {/* File Tree */}
            <div className="bg-[#090B0E] border border-white/10 rounded-lg p-2 overflow-y-auto max-h-[460px] space-y-1">
              {loadingAndroid ? (
                <div className="text-xs text-slate-400 p-2">Loading Android source tree...</div>
              ) : (
                androidFiles.map((file) => {
                  const shortName = file.path
                    .replace('android/app/src/main/java/com/chronixdj/pro/', '')
                    .replace('android/', '');
                  const active = selectedFile?.path === file.path;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedFile(file)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono-tabular truncate cursor-pointer ${
                        active
                          ? 'bg-[#2188FF] text-white font-bold'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                      title={file.path}
                    >
                      {shortName}
                    </button>
                  );
                })
              )}
            </div>

            {/* Source Viewer */}
            <div className="bg-[#090B0E] border border-white/10 rounded-lg flex flex-col overflow-hidden max-h-[460px]">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#15181F]">
                    <span className="font-mono-tabular text-[11px] text-slate-300 truncate">
                      {selectedFile.path}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySource(selectedFile)}
                      className="px-2.5 py-1 rounded bg-[#222731] hover:bg-[#2F3645] text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedPath === selectedFile.path ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="flex-1 p-3 text-[11px] font-mono-tabular text-slate-200 overflow-auto leading-relaxed">
                    {selectedFile.content}
                  </pre>
                </>
              ) : (
                <div className="p-4 text-xs text-slate-400">
                  Select a file to inspect the native Android Kotlin source code.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

interface SettingToggleProps {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({label, checked, onChange}) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-xs font-medium text-slate-200">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
        checked ? 'bg-[#4CAF50]' : 'bg-[#2B313C]'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);
