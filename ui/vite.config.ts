import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.MESH_APP_ORIGIN ?? 'http://127.0.0.1:4640'

// Single-origin in every environment: the backend proxies /api and /v1 to the
// embedded node, so dev only needs to forward everything to the app port.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/app': backend,
      '/api': backend,
      '/v1': backend,
    },
  },
})
