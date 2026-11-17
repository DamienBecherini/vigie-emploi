import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The language taken from the system (new workspace, no configuration) is French for the whole suite, on every machine:
    // the locale variable here, the locale Node reports in tests/setup.ts. The tests of the detection pass their own.
    env: { LC_ALL: 'fr_FR.UTF-8' },
    setupFiles: ['tests/setup.ts'],
    // Tests answer in milliseconds here, but the Windows CI runner is about fifteen times slower: the default 5 s was exceeded.
    testTimeout: 30_000,
    // `npm run coverage`: the server code (src/). The interface has no component tests yet, it is left out of the figure.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Dictionaries are data: every key is checked by the compiler, not by a test.
      exclude: ['src/i18n/fr.ts', 'src/i18n/en.ts', 'src/mcp/i18n/**'],
      reporter: ['text-summary', 'text'],
      // Floor a little under the measured figures (84 / 77 / 84 / 88 once the CLI got its tests): it may only go up.
      thresholds: { statements: 82, branches: 75, functions: 82, lines: 86 },
    },
  },
});
