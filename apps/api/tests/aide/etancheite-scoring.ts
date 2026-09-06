// =============================================================================
// ÉTANCHÉITÉ DU MOTEUR DE SCORING — balayage des sources. Lot L8.
//
// ── CE MODULE EST UN MOTEUR, PAS UN TEST ────────────────────────────────────
// Aucun `expect`, aucun `it` : il rend une liste d'infractions. Les assertions
// appartiennent au testeur croisé (09 §5.6 : « le code de test n'est JAMAIS écrit
// par l'agent qui a écrit le code testé »), exactement comme
// `etancheite-sources.ts` et `sentinelle-financiere.ts` du lot L2, dont ce fichier
// reprend la forme délibérément.
//
// ── LES DEUX FRONTIÈRES QU'IL SURVEILLE, ET POURQUOI ELLES SONT DIFFÉRENTES ─
//
// ① INVARIANT 7 — `answers`, JAMAIS `answer_revisions`. C'est LA frontière propre
//    à ce lot, et elle n'est gardée nulle part ailleurs. `answers` porte la
//    révision COURANTE ; `answer_revisions` porte les valeurs ÉCRASÉES. Lire les
//    deux compterait DEUX FOIS une réponse corrigée, et la moyenne du §32.1-1
//    pencherait vers la valeur que l'auditeur a justement rectifiée.
//    LA RÉGRESSION SERAIT INVISIBLE : les scores resteraient plausibles, aucun
//    test de forme ne broncherait, et seule une relecture de la requête SQL
//    dirait pourquoi une correction terrain ne fait pas bouger le score autant
//    qu'elle le devrait. C'est précisément la famille de défaut qu'un garde-fou
//    textuel attrape et qu'un test de comportement rate.
//
// ② INVARIANT 3 — aucune donnée de `scoping_financials` dans un score. Cette
//    frontière-là est DÉJÀ gardée : `balayerSources` (L2, ceinture 3) balaie
//    `apps/`, `packages/` et `scripts/` EN ENTIER, donc `apps/api/src/scoring/**`
//    y est compris sans qu'on ait rien à faire, et `apps/api/src/scoring/` n'est
//    pas sur sa liste blanche. La sonde ci-dessous ne la remplace pas : elle la
//    RESSERRE sur le seul périmètre du scoring, pour qu'un futur élargissement de
//    la liste blanche du L2 ne desserre pas silencieusement celle-ci.
//    ⚠ Une réponse d'audit de type `money` est LÉGITIME — c'est `answers.value`,
//    la parole d'un interviewé. Le mot `money` n'est donc PAS une sonde ; seuls
//    la table interdite et ses colonnes le sont.
//
// ── SES ANGLES MORTS, ÉCRITS ICI PLUTÔT QUE DÉCOUVERTS PLUS TARD ────────────
//  · Il lit du TEXTE. Un nom de table construit à l'exécution lui échappe, comme
//    au balayage L2 dont il hérite l'heuristique.
//  · Il retire les COMMENTAIRES avant de sonder : les en-têtes de `entree.ts` et
//    de `moteur.ts` NOMMENT `answer_revisions` pour expliquer qu'on ne la lit pas.
//    Un garde-fou qui hurle sur sa propre documentation est un garde-fou qu'on
//    désarme — c'est le constat du L2, repris tel quel.
//  · Il ne dit rien de la REQUÊTE qui alimentera le moteur quand une route
//    l'appellera : le jour où `apps/api/src/scoring/depot.ts` existera, il entrera
//    de lui-même dans le périmètre ci-dessous (le balayage lit un DOSSIER, pas une
//    liste de fichiers), et c'est le point.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E21 (auditeurs jamais
// d'accès aux montants).
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { CHAMPS_FINANCIERS_SURVEILLES, TABLE_FINANCIERE } from '@axion/shared';

import { RACINE, retirerCommentaires, type Infraction } from './etancheite-sources.js';

/** Le périmètre balayé : le moteur de scoring, en entier, quel qu'il devienne. */
export const DOSSIER_SCORING = 'apps/api/src/scoring';

const EXTENSIONS = ['.ts', '.tsx', '.sql'];

/**
 * L'ARCHIVE DES RÉVISIONS, dans ses deux graphies — snake_case de la base et
 * camelCase de Drizzle (11 §3 : « `snake_case` en base ↔ `camelCase` en TS »).
 *
 * `revision` seul n'y est PAS, et c'est délibéré : `answers.revision` est un champ
 * LÉGITIME de la ligne courante, que le moteur a le droit de voir passer. Sonder
 * le mot produirait des faux positifs, c'est-à-dire un garde-fou qu'on finit par
 * désarmer — le même raisonnement que `currency` dans `TABLE_FINANCIERE`.
 */
export const ARCHIVE_REVISIONS = ['answer_revisions', 'answerRevisions'] as const;

interface Sonde {
  readonly nom: string;
  readonly motif: RegExp;
}

function echapper(mot: string): string {
  return mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Les sondes, construites depuis les CONSTANTES PARTAGÉES et jamais recopiées :
 * une colonne financière ajoutée demain au contrat est surveillée ici sans qu'on
 * touche à ce fichier. Une liste recopiée aurait dérivé au premier ajout, et un
 * garde-fou qui surveille l'ancienne liste est un garde-fou vert qui ne protège
 * plus rien.
 */
export function sondesScoring(): readonly Sonde[] {
  return [
    {
      nom: "archive des révisions (invariant 7 : `answers` seule, jamais l'archive)",
      motif: new RegExp(`\\b(${ARCHIVE_REVISIONS.map(echapper).join('|')})\\b`),
    },
    {
      nom: 'table financière (invariant 3 : aucun montant de cadrage dans un score)',
      motif: new RegExp(`\\b(${TABLE_FINANCIERE.map(echapper).join('|')})\\b`),
    },
    {
      nom: 'colonne financière (invariant 3)',
      motif: new RegExp(`\\b(${CHAMPS_FINANCIERS_SURVEILLES.map(echapper).join('|')})\\b`),
    },
  ];
}

function* parcourir(dossier: string): Generator<string> {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      yield* parcourir(chemin);
    } else if (EXTENSIONS.some((extension) => entree.endsWith(extension))) {
      yield chemin;
    }
  }
}

/**
 * Balaie les sources du moteur de scoring et rend les infractions.
 *
 * `sondes` est un PARAMÈTRE — et pas seulement une constante — pour que le test
 * puisse prouver la SENSIBILITÉ du balayage : le rejouer avec une sonde qui vise
 * un mot notoirement présent (`coterReponse`, par exemple) DOIT faire apparaître
 * des lignes. Un balayage qui ne trouve jamais rien, même quand on lui demande de
 * chercher quelque chose, ne cherche rien.
 */
export function balayerScoring(sondes: readonly Sonde[] = sondesScoring()): readonly Infraction[] {
  const infractions: Infraction[] = [];
  const racineDossier = join(RACINE, ...DOSSIER_SCORING.split('/'));

  for (const chemin of parcourir(racineDossier)) {
    const relatif = relative(RACINE, chemin).split(sep).join('/');
    const code = retirerCommentaires(readFileSync(chemin, 'utf8'), chemin.endsWith('.sql'));

    code.split('\n').forEach((ligne, index) => {
      for (const sonde of sondes) {
        if (sonde.motif.test(ligne)) {
          infractions.push({
            fichier: relatif,
            ligne: index + 1,
            motif: sonde.nom,
            extrait: ligne.trim().slice(0, 160),
          });
        }
      }
    });
  }

  return infractions;
}
