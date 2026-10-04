import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/tests/globalSetup.ts'],
    setupFiles: ['src/tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Tests share one in-memory MongoDB; run files sequentially to keep collections isolated.
    fileParallelism: false,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**/*.ts'], exclude: ['src/tests/**', 'src/scripts/**'] },
  },
});
