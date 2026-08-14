import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      exclude: [
        "src/main.ts",
        "src/worker.ts",
        "src/**/index.ts",
        "src/**/*.module.ts",
      ],
    },
  },
});
