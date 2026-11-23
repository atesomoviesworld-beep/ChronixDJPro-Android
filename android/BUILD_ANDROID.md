# ChronixDJ Pro — Native Android Studio Project Build & APK Guide

## 1. Prerequisites
- **Android Studio** Ladybug (2024.2.1) or newer
- **JDK 17** (bundled with Android Studio)
- **Android SDK Platform 35** (`compileSdk = 35`, `minSdk = 26`)

## 2. Opening in Android Studio (Recommended)
1. Extract `ChronixDJPro-AndroidStudio.zip` to a folder on your computer.
2. Open **Android Studio** -> **File -> Open...** and select the extracted `ChronixDJPro-Android` folder (containing `settings.gradle.kts` and `app/`).
3. Wait for Gradle Sync to finish (Android Studio automatically provisions Gradle 8.7 using `gradle/wrapper/gradle-wrapper.properties` and downloads Jetpack Compose, Media3 ExoPlayer, and DataStore dependencies).
4. Connect an Android phone via USB (with **USB Debugging** enabled) or start a Landscape Emulator.
5. Click **Run (`Shift + F10`)** or **Build -> Build Bundle(s) / APK(s) -> Build APK(s)** to generate `app-debug.apk`.

## 3. Building the APK via Terminal / Gradle
If you have Gradle 8.7+ installed locally, run from inside `ChronixDJPro-Android/`:

```bash
# Generate local gradlew wrapper (first time only if running from CLI)
gradle wrapper --gradle-version 8.7

# Build Debug APK
./gradlew assembleDebug

# Build Release APK (minified & resource-shrunk)
./gradlew assembleRelease
```

Output APK locations:
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `app/build/outputs/apk/release/app-release-unsigned.apk`

## 4. Installing the APK via ADB
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 5. Architecture Overview
- `audio/DjAudioEngine.kt`: Dual independent Media3 `ExoPlayer` decks, equal-power/linear/fast-cut crossfader, pitch/tempo `PlaybackParameters`, BPM sync, loop engine, hot cues, and `VocalRemoverAudioProcessor` integration.
- `audio/VocalRemoverAudioProcessor.kt`: Real-time 16-bit PCM stereo Mid/Side processor for Acapella Removal (`REMOVE_ACAPELLA` with `<180Hz` bass retention) and Acapella Isolation (`ACAPELLA_ONLY`).
- `audio/DeckAudioEffectsProcessor.kt`: Native `Equalizer`, `BassBoost`, and `PresetReverb` DSP attached per `audioSessionId`.
- `audio/BpmAndWaveformAnalyzer.kt`: Real `MediaExtractor` + `MediaCodec` PCM decoding for onset autocorrelation BPM detection and multi-band waveform peak extraction.
- `video/VideoDjEngine.kt`: Dual `ExoPlayer` video decks synchronized with crossfader volume & alpha blending, live audio-following wave capture (`Visualizer`), and fullscreen playback.
- `audio/StemsAudioEngine.kt`: 4-channel synchronized stem mixer (Vocals, Drums, Bass, Instrumental) with Volume, Mute, Solo, Play/Pause, and clean `StemSeparationEngine` interface for future AI separation.
- `data/PreferencesRepository.kt`: Persistent `DataStore` preferences (including `liteMode`) across app launches.
