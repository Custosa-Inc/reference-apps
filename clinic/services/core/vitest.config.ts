import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    unstubEnvs: true,
  },
});
