import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {buildStoreZipUint8Array} from './src/utils/zipBuilder';

function collectAndroidFiles(dir: string, baseDir: string): Array<{relPath: string; fullPath: string}> {
  if (!fs.existsSync(dir)) return [];
  const results: Array<{relPath: string; fullPath: string}> = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAndroidFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        relPath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
        fullPath,
      });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function writeStaticAndroidBundles(targetDir: string) {
  const androidRoot = path.resolve(__dirname, 'android');
  if (!fs.existsSync(androidRoot) || !fs.existsSync(targetDir)) return;

  const files = collectAndroidFiles(androidRoot, androidRoot);
  const textFiles = files.filter(
    (f) => !/\.(png|jpe?g|webp|gif|ico)$/i.test(f.relPath)
  );
  const jsonPayload = {
    files: textFiles.map((f) => {
      const content = fs.readFileSync(f.fullPath, 'utf8');
      return {
        path: `android/${f.relPath}`,
        size: Buffer.byteLength(content, 'utf8'),
        content,
      };
    }),
  };

  fs.writeFileSync(
    path.join(targetDir, 'android-files.json'),
    JSON.stringify(jsonPayload),
    'utf8'
  );

  const zipBytes = buildStoreZipUint8Array(
    files.map((f) => ({
      name: `ChronixDJPro-Android/${f.relPath}`,
      data: new Uint8Array(fs.readFileSync(f.fullPath)),
    }))
  );

  fs.writeFileSync(
    path.join(targetDir, 'ChronixDJPro-AndroidStudio.zip'),
    Buffer.from(zipBytes)
  );
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'bundle-static-android-project',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          writeStaticAndroidBundles(path.resolve(__dirname, 'dist'));
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
