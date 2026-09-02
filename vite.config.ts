import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-maplibre-worker',
      closeBundle() {
        const workerSrc = path.resolve(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
        const workerDest = path.resolve(__dirname, 'dist/assets/maplibre-gl-worker.mjs')

        if (fs.existsSync(workerSrc)) {
          fs.mkdirSync(path.dirname(workerDest), { recursive: true })
          fs.copyFileSync(workerSrc, workerDest)
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
