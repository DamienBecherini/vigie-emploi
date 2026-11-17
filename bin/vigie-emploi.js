#!/usr/bin/env node
// Entry point of the `vigie-emploi` command.
// In the repository (src/ present), Node 24 runs the TypeScript directly (type stripping).
// In the npm package, src/ is not shipped: the JavaScript compiled into dist/ is loaded (`npm run build`),
// because Node refuses to strip the types of a file located under node_modules.
import { existsSync } from 'node:fs';

// Hide the "experimental" warnings of node:sqlite and of TypeScript loading, without hiding the others.
const emit = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
  const text = String(warning?.message ?? warning);
  if (type === 'ExperimentalWarning' && /SQLite|Type Stripping|type stripping/i.test(text)) return;
  return emit.call(process, warning, ...rest);
};

// node:sqlite (the application's database): Node 22.13 at least, 24 recommended. A clear message rather than a module error,
// especially in Claude Desktop, whose extension log shows stderr.
try {
  await import('node:sqlite');
} catch {
  process.stderr.write(
    `vigie-emploi : Node ${process.versions.node} n'a pas node:sqlite ; installer Node 24 ou plus récent (https://nodejs.org).\n` +
      `vigie-emploi: Node ${process.versions.node} lacks node:sqlite; install Node 24 or later (https://nodejs.org).\n`,
  );
  process.exit(1);
}

const source = new URL('../src/cli/main.ts', import.meta.url);
const { main } = existsSync(source) ? await import(source.href) : await import('../dist/cli/main.js');
process.exitCode = await main(process.argv.slice(2));
