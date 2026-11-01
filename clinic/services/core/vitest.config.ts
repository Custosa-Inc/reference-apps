import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/**/*.test.ts"],
    // Each test file starts its own in-memory Postgres, which is slow on small CI machines.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    unstubEnvs: true,
  },
});
