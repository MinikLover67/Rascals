import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

// Config for the phone web app build (npm run build:single): one JS chunk
// + one CSS file, so scripts/make-singlefile.mjs can inline everything into
// a single self-contained HTML file the desktop app can embed and serve.
export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      rollupOptions: {
        output: {
          // No code splitting: every dynamic import stays in the single chunk.
          inlineDynamicImports: true,
        },
      },
    },
  }),
)
