#!/usr/bin/env node
// Point d'entrée de la commande `postuler-juste`. Node 24 exécute directement le TypeScript (suppression des types).
// On masque les avertissements « expérimental » de node:sqlite et du chargement TypeScript, sans masquer les autres.
const emettre = process.emitWarning;
process.emitWarning = function (avertissement, ...reste) {
  const type = typeof reste[0] === 'string' ? reste[0] : reste[0]?.type;
  const texte = String(avertissement?.message ?? avertissement);
  if (type === 'ExperimentalWarning' && /SQLite|Type Stripping|type stripping/i.test(texte)) return;
  return emettre.call(process, avertissement, ...reste);
};

const { main } = await import('../src/cli/main.ts');
process.exitCode = await main(process.argv.slice(2));
