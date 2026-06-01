import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the app build's plugin types don't clash with
// Vitest's bundled Vite types. JSX in tests is handled by esbuild (tsconfig jsx).
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
