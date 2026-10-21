import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      thresholds: {
        lines: 98,
        branches: 98,
        functions: 98,
        statements: 98,
      },
    },
  },
});
