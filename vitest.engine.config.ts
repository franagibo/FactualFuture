import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/engine/**/*.spec.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src/engine'),
    },
  },
});
