import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
      version?: unknown
    }
    return typeof pkg.version === 'string' ? pkg.version : 'web'
  } catch {
    return 'web'
  }
}

// Tauri dev server config: fixed port so src-tauri devUrl stays stable.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: {
    // Baked into the static web build so the UI can show a version
    // without the Tauri runtime. Desktop reads the bundle version instead.
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
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
