import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
// base './' + everything inlined into one index.html => also opens from file:// and offline
export default defineConfig({ base: './', plugins: [viteSingleFile()], build: { target: 'es2022', chunkSizeWarningLimit: 2000 } })
