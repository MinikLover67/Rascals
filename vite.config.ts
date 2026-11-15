import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// Tauri dev server config: fixed port so src-tauri devUrl stays stable.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // App version baked in at build time — used by the changelog modal and
  // shown in the UI even when the Tauri getVersion() API is unavailable.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM ? 'chrome105' : 'esnext',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
