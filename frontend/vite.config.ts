import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The backend runs separately (uvicorn). Proxying /api avoids needing CORS
// configuration on the FastAPI app for local development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.FIXTURE_GENERATOR_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
})
