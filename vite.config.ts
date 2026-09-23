import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    watch: {
      /**
       * Editors on Windows save files through a short-lived temp directory
       * (`.<name>.<pid>.<uuid>.tmpdir`). Vite's watcher races that directory's
       * removal and dies with EBUSY on the very next file write, which kills
       * the dev server. Ignoring those paths keeps HMR usable.
       */
      ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/.DS_Store'],
    },
  },
  build: {
    // Cloudflare Pages serves `dist` as the site root.
    outDir: 'dist',
    sourcemap: false,
  },
})
