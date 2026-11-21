import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: path.resolve(import.meta.dirname, "../.."),
  },
  server: {
    port: 5173,
  },
});
