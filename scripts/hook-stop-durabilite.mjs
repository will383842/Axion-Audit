#!/usr/bin/env node
// =============================================================================
// HOOK « Stop » DE CLAUDE CODE — une session ne s'arrête pas avec du travail
// non poussé (CLAUDE.md §8, régime du 2026-08-31 point 2, décision de Williams
// du 2026-09-02 : « une session qui ne s'arrête pas en silence »).
// =============================================================================
// Appelé par Claude Code quand une session veut rendre la main (.claude/
// settings.json → hooks.Stop). Il reçoit un JSON sur stdin. S'il trouve, dans
// le répertoire de travail de la session, des modifications non commitées ou
// des commits non poussés, il REFUSE l'arrêt une fois et dit quoi faire.
//   · `stop_hook_active` vrai = la session continue déjà à cause de ce hook :
//     on laisse passer, sinon la boucle serait infinie.
//   · hors dépôt git, ou sans branche amont : on laisse passer.
// Mesuré le 2026-09-02 : 73 fichiers non commités et six heures sans push dans
// le worktree L3, une session « idle » après « Corrigé. Rejeu… ». Ce hook est
// la parade mécanique ; la règle écrite seule n'a pas tenu.
// =============================================================================
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function lireStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}
function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

const entree = lireStdin();
if (entree.stop_hook_active) process.exit(0);
const cwd = entree.cwd || process.cwd();

let dedans;
try {
  dedans = git('rev-parse --is-inside-work-tree', cwd) === 'true';
} catch {
  dedans = false;
}
if (!dedans) process.exit(0);

const modifs = git('status --porcelain', cwd).split('\n').filter(Boolean).length;
let nonPousses = 0;
try {
  nonPousses = Number(git('rev-list --count @{u}..HEAD', cwd)) || 0;
} catch {
  // pas de branche amont : la branche entière est non poussée
  try {
    nonPousses = Number(git('rev-list --count origin/main..HEAD', cwd)) || 0;
  } catch {
    nonPousses = 0;
  }
}
const branche = git('branch --show-current', cwd) || '(détachée)';

if (modifs === 0 && nonPousses === 0) process.exit(0);

const motifs = [];
if (modifs > 0) motifs.push(`${modifs} fichier(s) modifié(s) non commité(s)`);
if (nonPousses > 0) motifs.push(`${nonPousses} commit(s) non poussé(s)`);

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      `ARRÊT REFUSÉ (CLAUDE.md §8) — branche ${branche} : ${motifs.join(', ')}. ` +
      'Un commit non poussé n’existe pas. Avant de rendre la main : ' +
      '1) `git add` + commit (préfixe `wip:` si la suite n’est pas verte, sur une branche lot/**) ; ' +
      '2) `git push` ; 3) un bloc court dans docs/ETAT.md (≤ 25 lignes : commit, branche, tâche, ' +
      'prochaine action, tests rouges). Puis termine ton tour en disant à Williams où tu en es. ' +
      'Si tu es BLOQUÉ, dis-le explicitement avec ta recommandation : l’arrêt silencieux est interdit.',
  }),
);
