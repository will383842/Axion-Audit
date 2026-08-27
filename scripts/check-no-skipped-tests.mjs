#!/usr/bin/env node
// =============================================================================
// GARDE-FOU ANTI-SKIP — règle 09 §5.7 et DoD transverse (09 §3)
// « Tests désactivés/skippés = build rouge » (11 §2) · « @critique jamais skippable »
//
// Pourquoi un script dédié alors qu'ESLint porte déjà la règle : un lint peut être
// désactivé en local par un commentaire, et le contrat prévient (09 §5.7) qu'un agent
// pressé « simplifiera temporairement » pour faire passer un test. Ce contrôle-ci est
// exécuté par la CI, sans échappatoire par commentaire, et il bloque le merge.
// Traçabilité : E36 (exécutable par lots avec critères), E43 (exécutabilité autopilote).
// =============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Motifs de désactivation de test, tous langages de test du dépôt confondus. */
const MOTIFS = [
  { re: /\b(?:it|test|describe|suite|bench)\s*\.\s*skip\s*\(/g, quoi: '.skip(' },
  { re: /\b(?:it|test|describe|suite|bench)\s*\.\s*only\s*\(/g, quoi: '.only(' },
  { re: /\b(?:it|test|describe)\s*\.\s*todo\s*\(/g, quoi: '.todo(' },
  { re: /\b(?:it|test|describe)\s*\.\s*failing\s*\(/g, quoi: '.failing(' },
  { re: /\bx(?:it|test|describe)\s*\(/g, quoi: 'xit/xdescribe(' },
  { re: /\bf(?:it|describe)\s*\(/g, quoi: 'fit/fdescribe(' },
  { re: /\btest\s*\.\s*fixme\s*\(/g, quoi: 'test.fixme( (Playwright)' },
  { re: /\btest\s*\.\s*slow\s*\(\s*\)/g, quoi: 'test.slow() sans argument' },
  { re: /\bskipIf\s*\(/g, quoi: 'skipIf(' },
  { re: /\bthis\s*\.\s*skip\s*\(/g, quoi: 'this.skip(' },
];

/**
 * AUCUNE EXCEPTION. Cette liste est volontairement vide et doit le rester : une
 * exception ici est exactement le trou par lequel un test @critique disparaîtrait.
 * L'ajout d'une entrée exige une entrée DECISIONS.md signée par Williams (11 §8.5).
 */
const EXCEPTIONS = [];

/** Fichiers de test suivis par git (on n'analyse jamais node_modules ni dist). */
function fichiersDeTest() {
  const sortie = execFileSync(
    'git',
    ['ls-files', '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx', '*.e2e.ts'],
    { encoding: 'utf8' },
  );
  return sortie.split('\n').filter((f) => f.trim() !== '' && !EXCEPTIONS.includes(f));
}

const infractions = [];

for (const fichier of fichiersDeTest()) {
  const contenu = readFileSync(fichier, 'utf8');
  const lignes = contenu.split('\n');

  for (const { re, quoi } of MOTIFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(contenu)) !== null) {
      const numero = contenu.slice(0, m.index).split('\n').length;
      infractions.push({
        fichier,
        ligne: numero,
        quoi,
        extrait: (lignes[numero - 1] ?? '').trim(),
      });
    }
  }
}

if (infractions.length > 0) {
  console.error('\n[31m✗ GARDE-FOU ANTI-SKIP : build rouge[0m');
  console.error('  Règle 09 §5.7 et DoD transverse : « tous les tests verts, AUCUN test skippé ».');
  console.error('  Les tests marqués @critique et @filrouge ne sont JAMAIS skippables (11 §2).\n');
  for (const i of infractions) {
    console.error(`  ${i.fichier}:${i.ligne}  ${i.quoi}`);
    console.error(`      ${i.extrait}`);
  }
  console.error(
    `\n  ${infractions.length} test(s) désactivé(s). Corrige le test ou supprime-le —\n` +
      '  « simplifier temporairement » pour faire passer la CI est explicitement\n' +
      '  interdit (09 §5.7). Un test qui gêne signale un problème, il ne le crée pas.\n',
  );
  process.exit(1);
}

const total = fichiersDeTest().length;
console.log(
  `[32m✓[0m garde-fou anti-skip : aucun test désactivé (${total} fichier(s) de test analysé(s)).`,
);
