import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: process.env.VITE_DEV_WS_PROXY_TARGET || 'http://localhost:3007',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
})
