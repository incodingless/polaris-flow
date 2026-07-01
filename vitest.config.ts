import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/ts/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/commands/**'],
    },
  },
});
