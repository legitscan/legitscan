import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Local dev only: /api comes from dev-api.ts (same code as functions/api, reading the collector's SQLite copy).
  // API_TARGET=https://legitscan.pages.dev reads the live API instead, to check a UI change against real coins.
  server: { proxy: { '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:8788', changeOrigin: true } } },
})
