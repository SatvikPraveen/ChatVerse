import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', seed: 'src/scripts/seed.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Workspace packages ship TypeScript source, so they must be bundled; everything else stays external.
  noExternal: [/^@chatverse\//],
  // The in-process Redis emulator is a dev/test convenience and must never ship in the image.
  external: ['ioredis-mock'],
});
