import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3002'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    proxy: {
      '/api': backendUrl
    }
  }
})
