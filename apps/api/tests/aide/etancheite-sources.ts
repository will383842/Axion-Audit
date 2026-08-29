// =============================================================================
// BALAYAGE DES SOURCES — ceinture 3 de l'étanchéité financière. Lot L2, tâche T5.
// Note de conception `docs/conception/LOT_L2.md` §2.2-3.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI UNE CEINTURE DE PLUS, ALORS QUE LE TYPE INTERDIT DÉJÀ LA JOINTURE
// ═══════════════════════════════════════════════════════════════════════════════
// La marque `ContexteAdmin` (ceinture 2) protège ce que le COMPILATEUR voit. Elle
// ne voit pas :
//   · une requête SQL brute (`client.query('SELECT … FROM scoping_financials …')`) ;
//   · une VUE créée par une migration, qui déplacerait les montants sous un autre
//     nom de table ;
//   · un second dépôt qui importerait `scopingFinancials` en toute bonne foi
//     « juste pour l'export », en se donnant lui-même le droit d'y toucher.
// Ce balayage-ci lit le TEXTE des sources. C'est sa faiblesse (il ne comprend rien)
// et c'est sa force (rien ne lui échappe pour cause de typage).
//
// ── CE MODULE EST UN MOTEUR, PAS UN TEST ────────────────────────────────────
// Aucun `expect`, aucun `it` : il rend une liste d'infractions. Les assertions
// appartiennent au test, écrit par un autre agent (09 §5.6).
//
// ── SES ANGLES MORTS, ÉCRITS ICI PLUTÔT QUE DÉCOUVERTS PLUS TARD ─────────────
//  · SQL CONSTRUIT À L'EXÉCUTION : `'scoping_' + 'financials'`, un nom de table
//    venu d'une variable, d'un fichier de configuration ou d'une entrée. Aucun
//    balayage textuel ne le voit. Seule la ceinture 4 (sentinelle à l'exécution)
//    l'attrape, et seulement si la route est atteinte.
//  · VUES ET FONCTIONS SQL qui ne nomment pas la table sur la même ligne
//    (`CREATE VIEW v AS SELECT … FROM sf` avec un alias défini plus haut).
//  · DÉTECTION DES COMMENTAIRES par heuristique (voir `retirerCommentaires`) :
//    une ligne portant une URL (`https://…`) est tronquée à partir du `//`, ce qui
//    peut masquer la fin de la ligne. Faux NÉGATIF possible, jamais faux positif.
//  · Les fichiers `.json` ne sont pas balayés : l'inventaire de schéma
//    (`schema-manifest.json`) et les fiches de couverture nomment légitimement la
//    table, et un JSON de configuration ne lit aucune donnée.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMPS_FINANCIERS_SURVEILLES } from '@axion/shared';

const ICI = fileURLToPath(new URL('.', import.meta.url));

/** Racine du dépôt : `apps/api/tests/aide` → quatre niveaux au-dessus. */
export const RACINE = resolve(ICI, '..', '..', '..', '..');

/** Les arborescences balayées. Le pack (`docs/`) est de la documentation. */
const DOSSIERS_BALAYES = ['apps', 'packages', 'scripts'];

const DOSSIERS_IGNORES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'coverage-unit',
  'dev-dist',
  '.turbo',
  '.vite',
]);

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.sql'];

/**
 * LA LISTE BLANCHE — les seuls fichiers autorisés à nommer la table financière ou
 * ses colonnes.
 *
 * Chemins RELATIFS à la racine, en séparateurs POSIX. Toute addition à cette liste
 * est un ACTE DE CONCEPTION : elle élargit la surface d'accès aux montants et doit
 * être justifiée en revue croisée, jamais glissée pour faire passer un test.
 *
 * Sa longueur EST la mesure de la surface. Aujourd'hui : onze fichiers, dont UN
 * SEUL lit vraiment la table (le dépôt) et un seul la sert (la route admin) ; les
 * neuf autres la NOMMENT sans jamais en lire une valeur. Le jour où elle en compte
 * vingt, la question à poser n'est pas « ce balayage est-il trop strict ? » mais
 * « pourquoi vingt fichiers parlent-ils d'argent ? ».
 */
export const LISTE_BLANCHE: readonly string[] = [
  // La déclaration Drizzle de la table — elle DOIT la nommer.
  'apps/api/src/db/schema.ts',
  // Le DDL (fichier 04 transcrit littéralement).
  'apps/api/drizzle/0006_rapport_cadrage_pilotage.sql',
  // L'UNIQUE dépôt (ceinture 2).
  'apps/api/src/domaines/scoping/financiers.depot.ts',
  // L'UNIQUE route admin, et le contrat d'API qu'elle sert.
  'apps/api/src/routes/scoping.ts',
  'packages/shared/src/scoping.ts',
  // La politique de redaction pino : elle nomme ces champs pour les MASQUER.
  'packages/shared/src/redaction.ts',
  // Les garde-fous eux-mêmes.
  'apps/api/tests/aide/etancheite-sources.ts',
  'apps/api/tests/aide/sentinelle-financiere.ts',
  // Conformité de schéma L1 : ces fichiers vérifient que les colonnes du fichier 04
  // EXISTENT. Ils nomment la table, ils n'en lisent jamais une valeur.
  'apps/api/tests/aide/specification-l1.ts',
  'apps/api/tests/l1-structure.integration.test.ts',
  // Les tests d'étanchéité (ils sèment et lisent la table à dessein).
  'apps/api/tests/l2-crochets.integration.test.ts',
];

export interface Infraction {
  /** Chemin relatif à la racine, en séparateurs POSIX. */
  readonly fichier: string;
  readonly ligne: number;
  readonly motif: string;
  /** La ligne fautive, tronquée. Du code, jamais une donnée. */
  readonly extrait: string;
}

/**
 * Retire les commentaires d'un source pour ne balayer que le CODE.
 *
 * Sans cela, les en-têtes de `auth/politique.ts` et `auth/contexte.ts` — qui citent
 * `scoping_financials` pour EXPLIQUER l'invariant — seraient signalés. Un garde-fou
 * qui hurle sur sa propre documentation est un garde-fou qu'on désarme.
 *
 * Heuristique assumée, décrite en tête de fichier : les lignes sont VIDÉES à partir
 * du marqueur, jamais réécrites. Le numéro de ligne reste donc exact.
 */
export function retirerCommentaires(contenu: string, sql: boolean): string {
  const sansBlocs = contenu.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '));
  const motifLigne = sql ? /(--|\/\/).*$/gm : /\/\/.*$/gm;
  return sansBlocs.replace(motifLigne, '');
}

/** Les motifs recherchés dans le CODE (commentaires retirés). */
interface Sonde {
  readonly nom: string;
  readonly motif: RegExp;
}

function sondes(): readonly Sonde[] {
  // Les noms de champs viennent du CONTRAT PARTAGÉ (`packages/shared/src/scoping
  // .ts`), pas d'une liste recopiée : un champ financier ajouté demain au schéma
  // de réponse est surveillé sans qu'on ait à modifier ce fichier. Une liste
  // recopiée aurait dérivé au premier ajout — et un garde-fou qui surveille
  // l'ancienne liste est un garde-fou vert qui ne protège plus rien.
  const champs = CHAMPS_FINANCIERS_SURVEILLES.map((champ) =>
    champ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );

  return [
    {
      nom: 'identifiant Drizzle `scopingFinancials`',
      motif: /\bscopingFinancials\b/,
    },
    {
      nom: 'table `scoping_financials` en SQL',
      motif:
        /\b(from|join|into|update|table|exists)\s+(?:if\s+not\s+exists\s+)?scoping_financials\b/i,
    },
    {
      nom: 'nom de colonne financière',
      motif: new RegExp(`\\b(${champs.join('|')})\\b`),
    },
  ];
}

function estPosix(chemin: string): string {
  return chemin.split(sep).join('/');
}

function* parcourir(dossier: string): Generator<string> {
  for (const entree of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(entree)) continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      yield* parcourir(chemin);
    } else if (EXTENSIONS.some((extension) => entree.endsWith(extension))) {
      yield chemin;
    }
  }
}

/**
 * Balaie les sources et rend les infractions à l'étanchéité.
 *
 * `listeBlanche` est un paramètre — et pas seulement une constante — pour que le
 * test puisse prouver la SENSIBILITÉ du balayage : le rejouer avec une liste vide
 * DOIT faire apparaître le dépôt financier lui-même. Un balayage qui ne trouve
 * jamais rien, même quand on lui retire ses œillères, ne cherche rien.
 */
export function balayerSources(
  listeBlanche: readonly string[] = LISTE_BLANCHE,
): readonly Infraction[] {
  const autorises = new Set(listeBlanche);
  const infractions: Infraction[] = [];
  const detecteurs = sondes();

  for (const dossier of DOSSIERS_BALAYES) {
    const racineDossier = join(RACINE, dossier);
    for (const chemin of parcourir(racineDossier)) {
      const relatif = estPosix(relative(RACINE, chemin));
      if (autorises.has(relatif)) continue;

      const brut = readFileSync(chemin, 'utf8');
      const code = retirerCommentaires(brut, chemin.endsWith('.sql'));

      code.split('\n').forEach((ligne, index) => {
        for (const detecteur of detecteurs) {
          if (detecteur.motif.test(ligne)) {
            infractions.push({
              fichier: relatif,
              ligne: index + 1,
              motif: detecteur.nom,
              extrait: ligne.trim().slice(0, 160),
            });
          }
        }
      });
    }
  }

  return infractions;
}

/** Rendu lisible, pour le message d'échec du test. */
export function decrireInfractions(infractions: readonly Infraction[]): string {
  return infractions
    .map(
      (infraction) =>
        `${infraction.fichier}:${String(infraction.ligne)} — ${infraction.motif}\n    ${infraction.extrait}`,
    )
    .join('\n');
}
