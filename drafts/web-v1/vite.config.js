import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('./apps/web', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: path.resolve(fileURLToPath(new URL('.', import.meta.url)), mode === 'single' ? 'dist-single' : 'dist'),
    emptyOutDir: true,
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['shared/**/*.test.js', 'apps/web/src/**/*.test.js'],
  },
}))
