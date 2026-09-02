import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-maplibre-runtime',
      closeBundle() {
        const runtimeFiles = [
          'maplibre-gl.mjs',
          'maplibre-gl-shared.mjs',
          'maplibre-gl-worker.mjs',
        ]

        runtimeFiles.forEach((file) => {
          const src = path.resolve(__dirname, 'node_modules/maplibre-gl/dist', file)
          const dest = path.resolve(__dirname, 'dist/assets', file)

          if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(src, dest)
          }
        })
      },
    },
  ],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
