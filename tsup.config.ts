import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    banner: '/// <reference lib="dom" />',
  },
  target: 'es2020',
  sourcemap: true,
  clean: true,
});
