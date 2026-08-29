// =============================================================================
// PAGINATION KEYSET CÔTÉ SERVEUR — lot L3, incrément L3a (note de conception §1).
//
// Contrat 11 §3 : « Pagination : keyset partout (`?limit=50&after=<curseur>`),
// jamais d'offset. Curseur = id ou timestamptz selon la ressource, documenté par
// route. » Le CONTRAT DE FIL vit dans `packages/shared/src/pagination.ts` (le
// front importe les mêmes schémas) ; le présent module est sa moitié serveur :
// le codage/décodage du curseur et la clause SQL qui reprend la liste après lui.
//
// ── POURQUOI LE CURSEUR EST COMPOSITE, ET NON « le dernier id » ──────────────
// Une liste triée par `created_at` seul n'a PAS d'ordre total : deux missions
// créées dans la même milliseconde s'échangent librement. Reprendre après un
// `created_at` ferait alors sauter ou répéter des lignes — le défaut même qu'on
// reproche à la pagination par décalage. Chaque curseur porte donc TOUTES les
// composantes du tri, la dernière étant une clé UNIQUE qui départage
// (`…, id`). La conception L3 les fige par route : `missions`(created_at, id) ·
// `companies`(name, id) · `org_units`(position, id).
//
// ── CE QUE CE MODULE EXIGE DE SES APPELANTS (non vérifiable ici) ─────────────
//   1. les colonnes du curseur sont NOT NULL. La comparaison de n-uplets de
//      PostgreSQL rend NULL — donc « ni vrai ni faux », donc AUCUNE ligne — dès
//      qu'une composante est nulle. Une liste triée sur une colonne nullable
//      s'arrêterait silencieusement à la première page ;
//   2. la DERNIÈRE clé est unique sur la ressource (l'`id`), faute de quoi
//      l'ordre n'est pas total et le point 1 de l'en-tête revient ;
//   3. l'index qui sert le tri couvre les mêmes colonnes dans le même ordre,
//      sinon la pagination est correcte mais lente.
// Ces trois points sont des exigences de REVUE (étape 4) et de test
// d'intégration, pas des garanties de ce fichier. Écrites plutôt que supposées.
//
// ── LE CURSEUR N'EST PAS UN JETON DE SÉCURITÉ ────────────────────────────────
// Il est OPAQUE (base64url), pas SIGNÉ : un client peut en fabriquer un et
// reprendre la liste où il veut. Ce n'est pas une fuite — le cadrage par mission
// et le RBAC vivent dans le dépôt et dans `config.acces`, jamais dans le curseur
// (auth/politique.ts : « une porte fermée ne trie pas le courrier »). Signer le
// curseur donnerait l'illusion d'un contrôle d'accès là où il n'y en a pas.
// Traçabilité : E43 (conventions d'API épinglées).
// =============================================================================
import { asc, desc, sql, type Column, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  PAGINATION_LIMIT_MAX,
  pageSchema,
  paginationQuerySchema,
  type PaginationQuery,
} from '@axion/shared';

/**
 * Une composante du curseur : la colonne qui trie, et de quoi relire sa valeur
 * sur une ligne déjà chargée. Les deux vont ensemble — les séparer laisserait
 * coder une valeur qui ne correspond pas à la colonne comparée, défaut invisible
 * jusqu'à la deuxième page.
 */
export interface CleDeCurseur<Ligne> {
  readonly colonne: Column;
  /** Rend la composante SOUS SA FORME TEXTUELLE, telle qu'elle sera comparée. */
  readonly valeur: (ligne: Ligne) => string;
}

/**
 * Le contrat de pagination d'UNE ressource. `ressource` est recopié dans le
 * curseur : un curseur de `companies` présenté à `missions` est alors REFUSÉ au
 * lieu d'être décodé en silence et de produire une page absurde.
 */
export interface DefinitionCurseur<Ligne> {
  readonly ressource: string;
  readonly sens: 'asc' | 'desc';
  /** La DERNIÈRE clé doit être unique — voir l'en-tête, exigence 2. */
  readonly cles: readonly [CleDeCurseur<Ligne>, ...CleDeCurseur<Ligne>[]];
}

/** Une page rendue au client — la forme de `pageSchema` (packages/shared). */
export interface PageCurseur<Ligne> {
  readonly items: readonly Ligne[];
  /** `null` signifie « fin de la liste », sans ambiguïté. */
  readonly nextCursor: string | null;
}

/**
 * Plafond de taille du curseur. Un curseur légitime tient en quelques dizaines
 * d'octets ; ce plafond évite de décoder puis d'analyser en JSON une chaîne
 * arbitrairement longue fournie par le réseau.
 */
const LONGUEUR_MAX_CURSEUR = 1024;

/**
 * Alphabet base64url. `Buffer.from(…, 'base64url')` est PERMISSIF : il ignore
 * les caractères inconnus au lieu d'échouer. Sans ce contrôle préalable, un
 * curseur bruité serait décodé en quelque chose — parfois même en JSON valide.
 */
const MOTIF_BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Forme attendue du curseur décodé : `[ressource, …composantes]`. */
const curseurDecodeSchema = z.array(z.string()).min(2);

/**
 * Refus UNIQUE de tout curseur illisible — forme, ressource ou arité.
 *
 * Un seul message, volontairement : distinguer « mal encodé » de « curseur d'une
 * autre liste » n'aiderait aucun client légitime (qui ne fabrique jamais de
 * curseur) et renseignerait un client hostile sur nos ressources.
 */
function curseurInvalide(): AppError {
  return new AppError(
    'INVALID_CURSOR',
    'Le curseur de pagination est invalide. Reprenez la liste depuis le début.',
  );
}

/** Code les composantes d'une ligne en un curseur opaque. */
export function encoderCurseur(ressource: string, composantes: readonly string[]): string {
  return Buffer.from(JSON.stringify([ressource, ...composantes]), 'utf8').toString('base64url');
}

/**
 * Décode un curseur et vérifie qu'il appartient BIEN à cette liste.
 * Lève `INVALID_CURSOR` (400) dans tous les autres cas.
 */
export function decoderCurseur<Ligne>(
  definition: DefinitionCurseur<Ligne>,
  curseur: string,
): readonly string[] {
  if (curseur.length > LONGUEUR_MAX_CURSEUR || !MOTIF_BASE64URL.test(curseur)) {
    throw curseurInvalide();
  }

  let brut: unknown;
  try {
    brut = JSON.parse(Buffer.from(curseur, 'base64url').toString('utf8'));
  } catch {
    throw curseurInvalide();
  }

  const analyse = curseurDecodeSchema.safeParse(brut);
  if (!analyse.success) throw curseurInvalide();

  const [ressource, ...composantes] = analyse.data;
  if (ressource !== definition.ressource) throw curseurInvalide();
  if (composantes.length !== definition.cles.length) throw curseurInvalide();

  return composantes;
}

/**
 * Clause « après le curseur », en COMPARAISON DE N-UPLETS : `(a, b) > ($1, $2)`.
 *
 * C'est une seule comparaison, et non la cascade `a > $1 OR (a = $1 AND b > $2)`
 * qu'on écrit d'habitude : PostgreSQL sait la servir directement par l'index
 * composite `(a, b)`, là où la cascade dégénère souvent en balayage. La forme
 * développée serait aussi juste — elle serait juste plus lente et plus facile à
 * écrire de travers.
 *
 * CHAQUE VALEUR EST CASTÉE dans le type SQL DE SA COLONNE, lu sur la colonne
 * Drizzle elle-même. Sans ce cast, un paramètre textuel comparé à un
 * `timestamptz` DANS un constructeur de n-uplet laisse PostgreSQL choisir la
 * résolution de type — et un `uuid` comparé à du texte échoue franchement.
 * Le type vient de notre propre schéma, jamais du réseau : `sql.raw` n'ouvre ici
 * aucune injection.
 *
 * Rend `undefined` s'il n'y a pas de curseur (première page) : la requête
 * appelante compose alors ses filtres sans clause supplémentaire.
 */
export function conditionApresCurseur<Ligne>(
  definition: DefinitionCurseur<Ligne>,
  curseur: string | undefined,
): SQL | undefined {
  if (curseur === undefined) return undefined;

  const composantes = decoderCurseur(definition, curseur);

  const colonnes = sql.join(
    definition.cles.map((cle) => sql`${cle.colonne}`),
    sql`, `,
  );
  const valeurs = sql.join(
    definition.cles.map((cle, indice) => {
      const valeur = composantes[indice];
      // Inatteignable : l'arité est vérifiée au décodage. On échoue quand même
      // plutôt que d'assertir — une assertion ici mentirait au compilateur.
      if (valeur === undefined) throw curseurInvalide();
      return sql`${valeur}::${sql.raw(cle.colonne.getSQLType())}`;
    }),
    sql`, `,
  );

  return definition.sens === 'asc'
    ? sql`(${colonnes}) > (${valeurs})`
    : sql`(${colonnes}) < (${valeurs})`;
}

/**
 * Le `ORDER BY` du curseur — DANS L'ORDRE DES CLÉS, sans exception.
 *
 * Trier autrement que ne compare `conditionApresCurseur` produirait une
 * pagination qui saute des lignes sans jamais lever d'erreur. Les deux
 * fonctions lisent la MÊME définition pour que cette divergence-là soit
 * inexprimable.
 */
export function ordreDuCurseur<Ligne>(definition: DefinitionCurseur<Ligne>): SQL[] {
  return definition.cles.map((cle) =>
    definition.sens === 'asc' ? asc(cle.colonne) : desc(cle.colonne),
  );
}

/**
 * Nombre de lignes à DEMANDER à la base : une de plus que la page.
 *
 * C'est cette ligne excédentaire — lue puis jetée — qui dit s'il existe une
 * suite. L'alternative (un `COUNT(*)` en parallèle) coûte un second balayage et
 * ment dès qu'une écriture s'intercale entre les deux requêtes.
 *
 * Le plafond est REVÉRIFIÉ ici. `paginationQuerySchema` l'a déjà appliqué sur la
 * chaîne de requête, mais un service peut être appelé avec une pagination
 * construite en code (une tâche de fond, un test) : sans ce contrôle, un
 * `limit` de 100 000 traverserait tout et ferait de la borne du contrat une
 * borne de façade.
 */
export function limiteAChercher(pagination: PaginationQuery): number {
  if (
    !Number.isInteger(pagination.limit) ||
    pagination.limit < 1 ||
    pagination.limit > PAGINATION_LIMIT_MAX
  ) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Le paramètre « limit » doit être un entier compris entre 1 et ${String(PAGINATION_LIMIT_MAX)}.`,
    );
  }
  return pagination.limit + 1;
}

/**
 * Découpe le résultat sur-lu en page + curseur suivant.
 *
 * `lignes` DOIT venir d'une requête bornée par `limiteAChercher(pagination)` et
 * triée par `ordreDuCurseur(definition)`. Passer autre chose ne lève rien : ça
 * rend simplement une pagination fausse. C'est la limite honnête d'une fonction
 * pure — le contrôle appartient au test d'intégration de chaque route.
 */
export function paginerParCurseur<Ligne>(
  definition: DefinitionCurseur<Ligne>,
  pagination: PaginationQuery,
  lignes: readonly Ligne[],
): PageCurseur<Ligne> {
  if (lignes.length <= pagination.limit) {
    // Dernière page : `nextCursor` est nul, et il l'est parce qu'on a DEMANDÉ
    // une ligne de plus et qu'elle n'existe pas — pas parce qu'on a supposé.
    return { items: lignes, nextCursor: null };
  }

  const items = lignes.slice(0, pagination.limit);
  const dernier = items[items.length - 1];
  if (dernier === undefined) {
    // Inatteignable : `lignes.length > limit ≥ 1` garantit `items.length ≥ 1`.
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }

  return {
    items,
    nextCursor: encoderCurseur(
      definition.ressource,
      definition.cles.map((cle) => cle.valeur(dernier)),
    ),
  };
}

/**
 * Les deux schémas d'une route de liste : la chaîne de requête keyset et la
 * réponse `{ items, nextCursor }`. Tous deux viennent de `packages/shared` —
 * c'est ce qui fait que le front en importe LES MÊMES (11 §3).
 *
 * Une route qui filtre en plus étend le schéma de requête plutôt que de le
 * remplacer : `querystring: paginationQuerySchema.extend({ statut: … })`.
 */
export function contratDeListe<Item extends z.ZodType>(
  item: Item,
): { querystring: typeof paginationQuerySchema; response: { 200: ReturnType<typeof pageSchema<Item>> } } {
  return {
    querystring: paginationQuerySchema,
    response: { 200: pageSchema(item) },
  };
}
