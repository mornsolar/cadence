import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**', 'src/content/**'],
      exclude: ['src/content/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      reporter: ['text', 'html'],
    },
  },
});
