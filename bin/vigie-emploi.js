#!/usr/bin/env node
// Point d'entrée de la commande `vigie-emploi`.
// Dans le dépôt (src/ présent), Node 24 exécute directement le TypeScript (suppression des types).
// Dans le paquet npm, src/ n'est pas livré : on charge le JavaScript compilé dans dist/ (`npm run build`),
// car Node refuse de supprimer les types d'un fichier situé sous node_modules.
import { existsSync } from 'node:fs';

// On masque les avertissements « expérimental » de node:sqlite et du chargement TypeScript, sans masquer les autres.
const emettre = process.emitWarning;
process.emitWarning = function (avertissement, ...reste) {
  const type = typeof reste[0] === 'string' ? reste[0] : reste[0]?.type;
  const texte = String(avertissement?.message ?? avertissement);
  if (type === 'ExperimentalWarning' && /SQLite|Type Stripping|type stripping/i.test(texte)) return;
  return emettre.call(process, avertissement, ...reste);
};

// node:sqlite (base de l'application) : Node 22.13 au moins, 24 recommandé. Message clair plutôt qu'une erreur de module,
// notamment dans Claude Desktop, dont le journal de l'extension affiche stderr.
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
