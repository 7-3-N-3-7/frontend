import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: true,
    allowedHosts: ['127.0.0.1.nip.io', 'platform.127.0.0.1.nip.io'],
    watch: {
      usePolling: true,
      ignored: ['**/node_modules/**', 'C:/**', 'c:/**'],
    },
    proxy: {
      '/realms': {
        target: 'https://login.157.180.43.151.nip.io',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Spoof the origin so Keycloak doesn't reject it
            proxyReq.setHeader('Origin', 'https://platform.157.180.43.151.nip.io')
          })
        }
      }
    }
  },
})
