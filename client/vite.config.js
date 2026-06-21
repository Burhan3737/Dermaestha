import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev-only: proxy API calls to the Express server. In prod the SPA is served same-origin.
  server: { proxy: { '/api': 'http://localhost:3000', '/dev': 'http://localhost:3000' } },
})
