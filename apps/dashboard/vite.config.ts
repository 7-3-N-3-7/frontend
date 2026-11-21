import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: path.resolve(import.meta.dirname, "../.."),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
