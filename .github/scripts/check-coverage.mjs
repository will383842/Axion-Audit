// =============================================================================
// CONTRÔLE DE COUVERTURE DES MODULES CRITIQUES — DoD transverse 09 §3
// =============================================================================
// Applique : « couverture ≥ 90 % sur les modules critiques (moteur de sync,
// crypto locale, scoring, RBAC/propriété) — MESURÉE, PAS DÉCLARÉE ».
//
// Entrées :
//   · coverage/coverage-summary.json  (reporter `json-summary` de Vitest 3)
//   · .github/coverage-critical-paths.json (liste versionnée, revue en PR)
//
// Principe : on ne fait PAS confiance au seuil global d'un outil de couverture.
// On relit les chiffres fichier par fichier, on ne retient que les fichiers qui
// tombent dans un chemin critique, et on tranche ici. Un module critique déclaré
// qui ne correspond à AUCUN fichier couvert fait échouer le contrôle : une liste
// qui ne mesure rien serait pire qu'une liste vide.
//
// Sortie : code 0 si tout est ≥ seuil, code 1 sinon (aucune tolérance, aucun
// arrondi favorable — 09 §5.7).
//
// Traçabilité E36/E43 — lot L0 (07 §12), agent A52.
// =============================================================================

import { readFileSync } from 'node:fs';

const CONFIG = '.github/coverage-critical-paths.json';
const RESUME = 'coverage/coverage-summary.json';

/** Convertit un glob de type pathspec en expression régulière. */
function globVersRegex(glob) {
  const echappe = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const motif = echappe
    .replace(/\*\*\//g, '<<<GLOBSTAR_SLASH>>>')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<<GLOBSTAR_SLASH>>>/g, '(?:.*/)?')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp('^' + motif + '$');
}

function echec(message) {
  console.error(`::error title=Couverture insuffisante::${message}`);
  process.exitCode = 1;
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const seuil = config.seuilMinimalPourcent;
const metriques = config.metriquesControlees ?? ['lines', 'statements', 'functions', 'branches'];
const chemins = config.cheminsCritiques ?? [];

if (seuil !== 90) {
  echec(
    `Seuil déclaré ${seuil} % — la DoD transverse (09 §3) exige 90 %. ` +
      `Abaisser ce seuil passe par DECISIONS.md (11 §8-5), pas par ce fichier.`,
  );
  process.exit(1);
}

if (chemins.length === 0) {
  console.log(
    'Aucun module critique déclaré : ce script ne devrait pas être appelé (voir ci.yml).',
  );
  process.exit(0);
}

const resume = JSON.parse(readFileSync(RESUME, 'utf8'));
const racine = process.cwd().replace(/\\/g, '/');

// Normalise les clés du rapport (chemins absolus) en chemins relatifs au dépôt.
const fichiers = Object.entries(resume)
  .filter(([cle]) => cle !== 'total')
  .map(([cle, valeurs]) => [cle.replace(/\\/g, '/').replace(`${racine}/`, ''), valeurs]);

let toutVaBien = true;

for (const entree of chemins) {
  const regex = globVersRegex(entree.glob);
  const concernes = fichiers.filter(([chemin]) => regex.test(chemin));

  if (concernes.length === 0) {
    echec(
      `Module critique « ${entree.module ?? entree.glob} » (${entree.glob}) : ` +
        `AUCUN fichier couvert ne correspond. Soit le glob est périmé, soit ce module ` +
        `n'est pas instrumenté — dans les deux cas la couverture n'est pas MESURÉE.`,
    );
    toutVaBien = false;
    continue;
  }

  // Agrégation pondérée sur l'ensemble du module (et non moyenne des fichiers :
  // un gros fichier mal couvert ne doit pas être dilué par dix petits fichiers).
  for (const metrique of metriques) {
    let total = 0;
    let couvert = 0;
    for (const [, valeurs] of concernes) {
      const m = valeurs[metrique];
      if (!m) continue;
      total += m.total ?? 0;
      couvert += m.covered ?? 0;
    }
    if (total === 0) continue;
    const pourcentage = (couvert / total) * 100;
    const affiche = pourcentage.toFixed(2);
    if (pourcentage < seuil) {
      echec(
        `Module « ${entree.module ?? entree.glob} » — ${metrique} : ${affiche} % ` +
          `(< ${seuil} %) sur ${concernes.length} fichier(s). Référence : ${entree.reference ?? '09 §3'}.`,
      );
      toutVaBien = false;
    } else {
      console.log(`OK — ${entree.module ?? entree.glob} · ${metrique} : ${affiche} %`);
    }
  }
}

if (!toutVaBien) {
  console.error(
    'Definition of Done transverse (09 §3) NON satisfaite : la couverture des modules ' +
      'critiques est mesurée et insuffisante. Ajouter des tests — jamais retirer un chemin de la liste.',
  );
  process.exit(1);
}

console.log(`Tous les modules critiques atteignent ${seuil} % — couverture MESURÉE.`);
