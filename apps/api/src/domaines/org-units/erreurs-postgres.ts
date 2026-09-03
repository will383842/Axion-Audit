// =============================================================================
// TRADUCTION DES ERREURS DU PILOTE POSTGRESQL — `org_units`. Lot L3, incrément L3c.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CE MODULE EXISTE À PART DU DÉPÔT : POUR ÊTRE TESTABLE SEUL.
// ═══════════════════════════════════════════════════════════════════════════════
// Ce sont des fonctions PURES sur une forme d'objet : elles ne connaissent ni base,
// ni réseau, ni configuration. Laissées dans `depot.ts`, elles n'auraient pourtant
// pas été testables sans base — non pas à cause d'elles, mais parce qu'IMPORTER
// `depot.ts` importe `db.ts`, qui importe `config.ts`, qui **lève au chargement**
// si les variables d'environnement manquent (`chargerEnv`, `packages/shared/env.ts`).
// Un test unitaire du traducteur aurait donc dû fabriquer un environnement complet
// pour éprouver une fonction qui n'en a aucun besoin — c'est-à-dire cesser d'être
// un test unitaire.
//
// Le dépôt les RÉEXPORTE : les deux chemins d'import fonctionnent, et aucun appelant
// existant n'a à changer.
//
// ── CE QUE CES FONCTIONS FONT, ET CE QU'ELLES NE FONT PAS ───────────────────
// Elles traduisent en `AppError` française les seuls échecs que les routes de
// l'arbre peuvent provoquer, et **relancent tout le reste tel quel** : traduire une
// erreur qu'on n'attendait pas reviendrait à inventer un diagnostic, et un message
// d'erreur faux coûte plus cher qu'un message absent.
// Traçabilité : E4 (arbre organisationnel à profondeur libre) · E43 (conventions
// d'API — format d'erreur unique et statut HTTP cohérent, 11 §3).
// =============================================================================
import { AppError } from '@axion/shared';

/**
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/** Code SQLSTATE d'une violation de clé primaire ou d'index unique (PostgreSQL). */
const VIOLATION_UNICITE = '23505';

/** Code SQLSTATE d'une violation de clé étrangère (PostgreSQL). */
const VIOLATION_CLE_ETRANGERE = '23503';

/** Code SQLSTATE d'une violation de contrainte CHECK (PostgreSQL). */
const VIOLATION_CHECK = '23514';

/**
 * Code SQLSTATE d'une valeur numérique hors des bornes de son type — PostgreSQL
 * `22003`, `numeric_value_out_of_range`.
 *
 * ⚠ **IL N'A PAS DE `constraint`, ET C'EST TOUT LE PIÈGE.** Ce n'est pas une règle
 * d'intégrité qui casse : c'est le TYPE de la colonne qui refuse la valeur. Un
 * lecteur d'erreur qui exigerait `code` **et** `constraint` — ce que faisait celui
 * de ce fichier — ne le voit donc jamais, laisse remonter l'erreur brute, et
 * `PATCH { position: 2147483648 }` sort en **500** au lieu de 400 (mesuré).
 */
const VALEUR_HORS_BORNES = '22003';

/**
 * Code SQLSTATE d'un INTERBLOCAGE tranché par PostgreSQL — `40P01`,
 * `deadlock_detected`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UNE PANNE : C'EST UN ARBITRAGE, ET IL A UNE VICTIME DÉSIGNÉE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Quand deux transactions s'attendent mutuellement, PostgreSQL en choisit une et
 * l'annule. La transaction survivante aboutit normalement ; la victime reçoit ce
 * code. **Rien n'est cassé, rien n'est corrompu — la demande a simplement perdu une
 * course**, et la rejouer réussit presque toujours.
 *
 * ── POURQUOI LE TRADUIRE EST UNE MESURE DE SÉCURITÉ, PAS DE CONFORT ────────
 * Revue A51, F-14. Non traduit, un `40P01` remontait brut jusqu'au gestionnaire
 * global et sortait en **500 `INTERNAL_ERROR`** — deux conséquences, et la seconde
 * est la vraie :
 *   1. l'appelant lit « erreur interne » là où il devait lire « réessayez », donc il
 *      ne réessaie pas ;
 *   2. **une erreur non traduite est journalisée avec son objet d'erreur complet**,
 *      c'est-à-dire avec le gabarit `Failed query: … / params: …` de Drizzle — la
 *      fuite F-12. La traduire ici, c'est fermer la porte par laquelle F-12
 *      rentrait ; les deux constats sont liés et se corrigent ensemble.
 *
 * ── 409, ET NON 503 NI 500 ──────────────────────────────────────────────────
 * La requête est bien formée (400 serait faux), l'appelant a les droits (403 serait
 * faux), et le service n'est pas indisponible (503 serait faux) : c'est **l'état de
 * la ressource au moment de la demande** qui s'y oppose — la définition de 409, et
 * le même raisonnement que celui d'`ILLEGAL_STATE_TRANSITION` (`errors.ts`).
 */
const INTERBLOCAGE = '40P01';

/**
 * Les colonnes `INTEGER` de `org_units` qu'une écriture peut faire déborder, et le
 * champ d'API à nommer. La correspondance est explicite plutôt que dérivée d'un
 * `snake_case → camelCase` automatique : PostgreSQL ne garantit pas de renseigner
 * `column` sur un `22003`, et deviner un nom de champ à partir d'un message
 * d'erreur anglais serait exactement le « message faux » que ce dépôt refuse.
 */
const COLONNES_ENTIERES: Readonly<Record<string, string>> = {
  position: 'position',
  headcount: 'headcount',
};

/**
 * Les clés étrangères de `org_units` (migration `0002`), et le champ d'API qu'il
 * faut nommer quand chacune casse. Le nom de la contrainte est LU, jamais deviné :
 * traiter tout `23503` comme « parent inconnu » enverrait chercher au mauvais
 * endroit le jour où c'est le secteur qui manque — et un message d'erreur faux
 * coûte plus cher qu'un message absent.
 */
const CONTRAINTES_ETRANGERES: readonly {
  readonly contrainte: string;
  readonly champ: string;
  readonly message: string;
}[] = [
  {
    contrainte: 'org_units_mission_id_fkey',
    champ: 'missionId',
    message: "Cette mission n'existe pas.",
  },
  {
    contrainte: 'org_units_parent_id_fkey',
    champ: 'parentId',
    message: "L'unité parente indiquée n'existe pas.",
  },
  {
    contrainte: 'org_units_service_ref_id_fkey',
    champ: 'serviceRefId',
    message: "Cette fonction n'existe pas dans le référentiel.",
  },
  {
    contrainte: 'org_units_sector_id_fkey',
    champ: 'sectorId',
    message: "Ce secteur n'existe pas dans le référentiel.",
  },
  {
    contrainte: 'org_units_proposed_by_fkey',
    champ: 'proposedBy',
    message: "L'auteur de la proposition n'existe plus.",
  },
  {
    contrainte: 'org_units_merged_into_id_fkey',
    champ: 'mergedIntoId',
    message: "L'unité cible de la fusion n'existe pas.",
  },
];

/**
 * Lit `code` et `constraint` en REMONTANT la chaîne `cause`, sans `instanceof`.
 *
 * MESURÉ au CRUD des comptes et redit dans chaque dépôt parce que l'oublier coûte
 * un 500 au lieu d'un 400 : une requête qui échoue ne propage PAS l'erreur du
 * pilote. Drizzle lève une `DrizzleQueryError` et RANGE la `DatabaseError` de `pg`
 * dans sa propriété `cause` ; ni `code` ni `constraint` ne sont recopiés sur
 * l'enveloppe.
 */
export interface EchecPostgres {
  readonly code: string;
  /** `null` pour les erreurs qui n'en portent pas — un débordement, par exemple. */
  readonly contrainte: string | null;
  /** La colonne, quand le pilote la renseigne. `null` sinon. */
  readonly colonne: string | null;
}

/**
 * Lit `code`, `constraint` et `column` en REMONTANT la chaîne `cause`, sans
 * `instanceof`.
 *
 * ⚠ **LA CONDITION D'ARRÊT PORTE SUR `code` SEUL**, et c'était le défaut : exiger
 * `constraint` en plus faisait rater toute erreur qui n'en porte pas — au premier
 * rang desquelles le débordement d'entier (`22003`, voir `VALEUR_HORS_BORNES`),
 * qui remontait alors intact jusqu'au gestionnaire global et sortait en 500.
 * `contrainte` et `colonne` deviennent des renseignements FACULTATIFS : présents,
 * ils précisent le message ; absents, ils ne font plus perdre l'erreur entière.
 *
 * EXPORTÉE parce qu'elle est testable seule : c'est une fonction pure sur une forme
 * d'objet, et la seule façon de prouver qu'elle voit un `22003` sans avoir à
 * provoquer un débordement réel en base.
 */
export function lireEchecDeContrainte(erreur: unknown): EchecPostgres | null {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur <= PROFONDEUR_MAX_CAUSE; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return null;

    const code = 'code' in courante ? courante.code : undefined;
    if (typeof code === 'string') {
      const contrainte = 'constraint' in courante ? courante.constraint : undefined;
      const colonne = 'column' in courante ? courante.column : undefined;
      return {
        code,
        contrainte: typeof contrainte === 'string' ? contrainte : null,
        colonne: typeof colonne === 'string' ? colonne : null,
      };
    }

    courante = 'cause' in courante ? courante.cause : undefined;
  }
  return null;
}

/**
 * Traduit les échecs de contrainte que ces routes peuvent provoquer, et relance
 * tout le reste.
 *
 * ── LA CLÉ PRIMAIRE EST UN 409, ET C'EST LE CŒUR DE LA RÈGLE P1-4 ──────────
 * Un `id` d'unité peut venir du CLIENT (04, règle P1-4 : « TOUTE entité créable
 * hors ligne […] porte un UUID v7 généré côté client »). Deux appareils, deux
 * propositions, un même identifiant : c'est un CONFLIT, pas une requête malformée,
 * et surtout **jamais un écrasement**. L'upsert idempotent que P1-4 décrit
 * appartient au chemin de sync (05 §9.2), qui porte sa propre déduplication par
 * `op_id` ; une route de console qui écraserait sur collision d'`id` donnerait à un
 * `POST` le pouvoir de réécrire une unité par surprise.
 *
 * ── POURQUOI ON NE LIT PAS AVANT D'ÉCRIRE ───────────────────────────────────
 * Un `SELECT … WHERE id = $1` préalable ne supprime pas le besoin de ce traitement :
 * entre la lecture et l'insertion, une autre requête peut prendre l'identifiant.
 * **C'est la contrainte qui arbitre, pas nous.**
 */
export function traduireEchecDeContrainte(erreur: unknown): never {
  const echec = lireEchecDeContrainte(erreur);
  if (echec === null) throw erreur;

  if (echec.code === VIOLATION_UNICITE && echec.contrainte === 'org_units_pkey') {
    throw new AppError(
      'CONFLICT',
      "Une unité portant cet identifiant existe déjà. Rien n'a été modifié.",
      [{ path: 'id', message: 'Cet identifiant est déjà utilisé par une autre unité.' }],
    );
  }

  if (echec.code === VIOLATION_CLE_ETRANGERE) {
    const connue = CONTRAINTES_ETRANGERES.find((c) => c.contrainte === echec.contrainte);
    if (connue !== undefined) {
      throw new AppError('VALIDATION_FAILED', connue.message, [
        { path: connue.champ, message: connue.message },
      ]);
    }
  }

  if (echec.code === VIOLATION_CHECK && echec.contrainte?.startsWith('org_units_') === true) {
    throw new AppError(
      'VALIDATION_FAILED',
      "Une valeur de l'unité n'est pas admise par le modèle de données.",
      [{ path: 'orgUnit', message: `Contrainte violée : ${echec.contrainte}` }],
    );
  }

  // ── L'INTERBLOCAGE — 409, ET SURTOUT JAMAIS 500 ────────────────────────────
  //
  // A51, F-14. Placé AVANT le débordement d'entier parce qu'il est le seul code de
  // cette liste qui ne dit rien de la DONNÉE : il dit que la demande a perdu une
  // course. Le message le dit à l'utilisateur en toutes lettres — « réessayez » est
  // une instruction exécutable, « erreur interne » ne l'est pas.
  //
  // ⚠ AUCUN DÉTAIL SUR L'AUTRE TRANSACTION : ni ce qu'elle faisait, ni sur quelle
  // ressource. Le renseigner apprendrait à un appelant ce qu'un autre est en train
  // de modifier — et le traducteur ne le sait pas davantage : PostgreSQL range ce
  // diagnostic dans `detail`, que la redaction masque précisément parce qu'il
  // recopie des valeurs de ligne.
  if (echec.code === INTERBLOCAGE) {
    const message =
      'Une autre opération modifiait les mêmes unités au même moment : votre demande a été annulée pour préserver la cohérence de l’arbre. Réessayez.';
    throw new AppError('CONFLICT', message, [
      { path: 'orgUnit', code: 'conflit_concurrent', message },
    ]);
  }

  // ── LE DÉBORDEMENT D'ENTIER — SECONDE CEINTURE ─────────────────────────────
  //
  // Les schémas Zod bornent déjà `position` et `headcount` au type de leur colonne
  // (`ENTIER_POSTGRES_MAX`), et une requête d'API ne devrait donc jamais arriver
  // ici. **Mais toutes les valeurs ne viennent pas d'une requête** : l'import
  // numérote `positionMax + 1`, et ce calcul-là ne traverse aucun schéma. Une base
  // dont les positions frôlent la borne le ferait déborder sans qu'aucun contrôle
  // d'entrée ne s'en aperçoive. La défense en profondeur n'est donc pas ici une
  // précaution de style : c'est le seul filet du chemin interne.
  //
  // `VALIDATION_FAILED` (400) et non 500 : la valeur est refusée par le TYPE de sa
  // colonne, ce qui est une faute de forme — 11 §3, « statut HTTP cohérent ».
  if (echec.code === VALEUR_HORS_BORNES) {
    const champ = echec.colonne === null ? null : (COLONNES_ENTIERES[echec.colonne] ?? null);
    const message =
      champ === null
        ? "Une valeur numérique de l'unité dépasse ce que le modèle de données peut stocker."
        : `La valeur du champ « ${champ} » dépasse ce que le modèle de données peut stocker.`;
    throw new AppError('VALIDATION_FAILED', message, [
      { path: champ ?? 'orgUnit', code: echec.code, message },
    ]);
  }

  throw erreur;
}
