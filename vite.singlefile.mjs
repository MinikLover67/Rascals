// One-off build config for the shareable single-file web beta:
// everything rolled into ONE JS chunk (no dynamic chunk fetches) and
// relative paths, so scripts/make-singlefile.mjs can inline it all.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    outDir: 'dist-single',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // No dynamic chunks: tauri-plugin code stays inside the one bundle
        // and its dynamic import() resolves in place (never fetched).
        inlineDynamicImports: true,
      },
    },
  },
})
