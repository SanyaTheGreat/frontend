import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    mimeTypes: {
      '.json': 'text/plain' // 👈 Lottie expects text/plain, not application/json
    }
  }
})
