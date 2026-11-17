import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // `npm run coverage`: the server code (src/). The interface has no component tests yet, it is left out of the figure.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Dictionaries are data: every key is checked by the compiler, not by a test.
      exclude: ['src/i18n/fr.ts', 'src/i18n/en.ts', 'src/mcp/i18n/**'],
      reporter: ['text-summary', 'text'],
      // Floor a little under the figures measured when coverage was introduced (72 / 66 / 75 / 76): it may only go up.
      thresholds: { statements: 70, branches: 64, functions: 72, lines: 74 },
    },
  },
});
