// verify-rapide.mjs — rejeu local de la CI sans conteneur, EN PARALLÈLE.
//
// Remplace la chaîne `a && b && c …` de l'ancien `verify:rapide` (une trentaine de secondes de
// gardes + lint + typecheck + tests, tous bout à bout). Mêmes vérifications, même verdict : le
// premier échec rend un code non nul et la sortie complète de CHAQUE étape fautive est affichée.
// Audit de vitesse du 2026-10-23 (docs/AUDIT_VITESSE_2026-10-23.md, B9).
//
// Trois vagues, parce que lint et typecheck lisent `packages/*/dist` :
//   1. gardes + format + fixtures, et la construction des paquets (une seule fois)  — en parallèle ;
//   2. lint, typecheck                                                               — en parallèle ;
//   3. tests unit + interface, SEULS (charge CPU : voir le commentaire de VAGUES) ;
// Une vague n'est lancée que si la précédente est entièrement verte.
//
// Aucune dépendance : node:child_process seulement (CLAUDE.md §3-1).
import { spawn } from 'node:child_process';

const GARDES = [
  'check:octets-controle',
  'check:invariants',
  'check:jonction',
  'check:etapes-jumelles',
  'check:graphe-modules',
  'check:porte-journal',
  'check:no-skipped-tests',
  'check:test-projects',
  'check:isolation-reseau',
  'check:compose-coolify',
  'check:executabilite',
  'check:fixtures',
  'check:briefs',
  'format:check',
];

const VAGUES = [
  [...GARDES.map((s) => ['pnpm', s]), ['pnpm', 'build:packages']],
  [
    ['pnpm', 'lint:sans-build'],
    ['pnpm', 'typecheck:sans-build'],
  ],
  // Seule dans sa vague : lancés avec eslint et tsc, des tests à délai court (Argon2, coffre local)
  // dépassaient leur timeout sous la charge CPU — échec au pre-push, vert quand on les rejoue seuls.
  [['pnpm', 'exec', 'vitest', 'run', '--project', 'unit', '--project', 'interface']],
];

const nom = (cmd) => cmd.join(' ');

function lancer(cmd) {
  return new Promise((resolve) => {
    const debut = Date.now();
    const enfant = spawn(cmd[0], cmd.slice(1), { shell: true, env: process.env });
    let sortie = '';
    enfant.stdout.on('data', (d) => (sortie += d));
    enfant.stderr.on('data', (d) => (sortie += d));
    enfant.on('error', (e) => resolve({ cmd, code: 1, sortie: sortie + String(e), ms: 0 }));
    enfant.on('close', (code) => resolve({ cmd, code: code ?? 1, sortie, ms: Date.now() - debut }));
  });
}

let echec = false;
for (const [i, vague] of VAGUES.entries()) {
  console.log(
    `[verify:rapide] vague ${i + 1}/${VAGUES.length} — ${vague.length} étapes en parallèle…`,
  );
  const resultats = await Promise.all(vague.map(lancer));
  for (const r of resultats) {
    const s = (r.ms / 1000).toFixed(1).padStart(5);
    console.log(`  ${r.code === 0 ? 'OK     ' : 'ÉCHEC  '} ${s}s  ${nom(r.cmd)}`);
  }
  for (const r of resultats.filter((x) => x.code !== 0)) {
    echec = true;
    console.error(`\n──── ÉCHEC : ${nom(r.cmd)} (code ${r.code}) ────\n${r.sortie}`);
  }
  if (echec) break;
}
if (echec) {
  console.error('\n[verify:rapide] ÉCHEC — corrige, puis relance `pnpm verify:rapide`.');
  process.exit(1);
}
console.log('[verify:rapide] OK');
