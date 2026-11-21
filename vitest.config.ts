import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "frontend/src/**/*.test.ts",
      "frontend/src/**/*.test.tsx",
      "sdlc/**/*.test.ts",
    ],
    server: {
      deps: {
        inline: ["next-intl", "next-auth"],
      },
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: path.resolve(__dirname, "coverage"),
      include: [
        "frontend/src/core/**/*.{ts,tsx}",
        "frontend/src/features/**/*.{ts,tsx}",
        "sdlc/core/**/*.ts",
      ],
      exclude: ["frontend/src/**/*.test.{ts,tsx}", "sdlc/**/*.test.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/navigation": path.resolve(
        __dirname,
        "./node_modules/next/navigation.js"
      ),
    },
  },
});
