#!/usr/bin/env node
// =============================================================================
// GARDE DE PROSE — CLAUDE.md §7 et §8 (décision de Williams, 2026-09-02)
// =============================================================================
// Constat mesuré le 2026-09-02 : 117 entrées de DECISIONS.md en six jours, des
// blocs ETAT.md de soixante lignes, « trois pages pour une ligne de code ».
// Le temps passé à écrire SUR le travail est pris sur le travail.
//
// Ce garde ne juge que le DERNIER bloc de chaque fichier append-only (l'histoire
// ne se réécrit pas). Lignes comptées hors lignes vides.
//   · docs/ETAT.md      : dernier bloc  ≤ 25 lignes
//   · DECISIONS.md      : dernière entrée ≤ 40 lignes
// Rejouable : `pnpm check:prose`. Détail : `--verbeux`.
// =============================================================================
import { readFileSync } from 'node:fs';

const LIMITES = [
  { fichier: 'docs/ETAT.md', max: 25, nom: 'dernier bloc ETAT' },
  { fichier: 'DECISIONS.md', max: 40, nom: 'dernière entrée DECISIONS' },
];
const verbeux = process.argv.includes('--verbeux');

function dernierBloc(texte) {
  const lignes = texte.split('\n');
  let debut = -1;
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    if (/^## /.test(lignes[i])) {
      debut = i;
      break;
    }
  }
  if (debut < 0) return null;
  const bloc = lignes.slice(debut);
  return { titre: bloc[0], lignes: bloc.filter((l) => l.trim() !== '').length };
}

let echec = false;
for (const { fichier, max, nom } of LIMITES) {
  const bloc = dernierBloc(readFileSync(fichier, 'utf8'));
  if (!bloc) continue;
  const ok = bloc.lignes <= max;
  if (!ok) echec = true;
  if (verbeux || !ok) {
    console.log(
      `${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nom} : ${bloc.lignes} ligne(s) (max ${max}) — « ${bloc.titre.slice(0, 70)} »`,
    );
  }
}

if (echec) {
  console.error(
    '\nUn bloc trop long ne se coupe pas : il se RÉÉCRIT. Faits, chiffres, prochaine action.\n' +
      'Le détail va dans le commit, le test ou le fichier de porte, pas dans le journal de reprise.',
  );
  process.exit(1);
}
console.log(
  '\x1b[32m✓\x1b[0m prose : dernier bloc ETAT ≤ 25 lignes, dernière décision ≤ 40 lignes.',
);
