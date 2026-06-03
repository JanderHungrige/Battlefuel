import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use esbuild to minify. The default (oxc) re-minifier miscompiles an already-minified
  // dependency (mgrs ships pre-minified ESM) in the shared maplibre chunk, producing a runtime
  // "j is not defined" that blanks all map overlays in the production build (v2 Wave 2).
  build: { minify: 'esbuild' },
  // Local prod-build verification: `vite preview` proxies /api (+ WS) to the dev backend so the
  // minified bundle can be smoke-tested same-origin. No effect on the deployed image.
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:8000', ws: true, changeOrigin: true },
    },
  },
})
