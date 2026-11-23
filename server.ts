import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import zlib from 'zlib';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ANDROID_ROOT = path.resolve(__dirname, 'android');

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface AndroidFileEntry {
  path: string;
  size: number;
  content: string;
}

function collectFiles(dir: string, baseDir: string): Array<{relPath: string; fullPath: string}> {
  if (!fs.existsSync(dir)) return [];
  const results: Array<{relPath: string; fullPath: string}> = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({relPath, fullPath});
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_TIME = (12 << 11) | (0 << 5) | 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 20;

function buildZipBuffer(entries: Array<{name: string; data: Buffer}>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  app.post('/api/stems/analyze', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Cloud AI stem analysis unavailable: GEMINI_API_KEY is not configured.',
      });
      return;
    }

    const {wavBase64, title, bpm, musicalKey} = req.body ?? {};
    if (typeof wavBase64 !== 'string' || wavBase64.length < 128) {
      res.status(400).json({error: 'Missing valid audio excerpt for stem analysis.'});
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: wavBase64,
              },
            },
            {
              text:
                `Analyze this DJ track excerpt ("${String(title || 'Track')}", ` +
                `${Number(bpm || 120)} BPM, key ${String(musicalKey || 'Unknown')}) ` +
                `to optimize real-time 4-stem separation (vocals, drums, bass, melody). ` +
                `Return conservative, accurate acoustic crossover frequencies and isolation weights.`,
            },
          ],
        },
        config: {
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bassCutoffHz: {
                type: Type.NUMBER,
                description: 'Low-pass cutoff frequency in Hz separating bass from melody/vocals (120 to 250).',
              },
              vocalLowHz: {
                type: Type.NUMBER,
                description: 'High-pass lower bound in Hz for lead vocal band (180 to 360).',
              },
              vocalHighHz: {
                type: Type.NUMBER,
                description: 'Low-pass upper bound in Hz for lead vocal band (3600 to 6200).',
              },
              drumsHighCutoffHz: {
                type: Type.NUMBER,
                description: 'High-frequency hi-hat/cymbal sheen cutoff in Hz (4200 to 7500).',
              },
              vocalCenterBias: {
                type: Type.NUMBER,
                description: 'Center-channel vocal emphasis weight (0.9 to 1.6).',
              },
              transientSensitivity: {
                type: Type.NUMBER,
                description: 'Percussive transient gate sensitivity for drums (0.9 to 1.8).',
              },
              analysisNote: {
                type: Type.STRING,
                description: 'Concise acoustic profile description under 80 characters.',
              },
            },
            required: [
              'bassCutoffHz',
              'vocalLowHz',
              'vocalHighHz',
              'drumsHighCutoffHz',
              'vocalCenterBias',
              'transientSensitivity',
              'analysisNote',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const clamp = (v: unknown, min: number, max: number, fallback: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

      res.json({
        model: 'gemini-4-hydrogen',
        params: {
          bassCutoffHz: clamp(parsed.bassCutoffHz, 120, 250, 175),
          vocalLowHz: clamp(parsed.vocalLowHz, 180, 360, 230),
          vocalHighHz: clamp(parsed.vocalHighHz, 3600, 6200, 4800),
          drumsHighCutoffHz: clamp(parsed.drumsHighCutoffHz, 4200, 7500, 5400),
          vocalCenterBias: clamp(parsed.vocalCenterBias, 0.9, 1.6, 1.2),
          transientSensitivity: clamp(parsed.transientSensitivity, 0.9, 1.8, 1.25),
          analysisNote:
            typeof parsed.analysisNote === 'string' && parsed.analysisNote.trim()
              ? parsed.analysisNote.trim().slice(0, 90)
              : 'Cloud AI spectral vocal & drum stem profile applied',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream Cloud AI stem analysis failed.';
      res.status(502).json({error: msg});
    }
  });

  app.get('/api/android-files', (_req, res) => {
    try {
      const files = collectFiles(ANDROID_ROOT, ANDROID_ROOT).filter(
        (f) => !/\.(png|jpe?g|webp|gif|ico)$/i.test(f.relPath)
      );
      const payload: AndroidFileEntry[] = files.map((f) => {
        const content = fs.readFileSync(f.fullPath, 'utf8');
        return {
          path: `android/${f.relPath}`,
          size: Buffer.byteLength(content, 'utf8'),
          content,
        };
      });
      res.json({files: payload});
    } catch {
      res.status(500).json({error: 'Failed to read Android Studio project files.'});
    }
  });

  app.get('/api/android-zip', (_req, res) => {
    try {
      const files = collectFiles(ANDROID_ROOT, ANDROID_ROOT);
      const entries = files.map((f) => ({
        name: `ChronixDJPro-Android/${f.relPath}`,
        data: fs.readFileSync(f.fullPath),
      }));
      const zipBuffer = buildZipBuffer(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="ChronixDJPro-AndroidStudio.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(zipBuffer);
    } catch {
      res.status(500).json({error: 'Failed to package Android Studio project zip.'});
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChronixDJ Pro Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
