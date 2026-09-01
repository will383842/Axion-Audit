// =============================================================================
// DÉPÔT DES ENTREPRISES CLIENTES — `companies`, plus la LECTURE de
// `naf_sector_map` qu'exige R4. Lot L3, incrément L3a.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS, ET C'EST VOULU ─────────────────────────────
//   · il ne décide rien : le choix du secteur (R4), l'alerte de doublon de nom
//     (R3) et le refus d'un SIREN déjà pris sont des règles de SERVICE ;
//   · il ne journalise rien : la porte d'écriture unique est
//     `domaines/journal/service.ts`, et le service l'appelle APRÈS le succès ;
//   · il ne rend JAMAIS une fiche supprimée. `companies.deleted_at` existe au
//     fichier 04 ; toutes les lectures de ce dépôt filtrent `deleted_at IS NULL`,
//     une fois, ici — un filtre laissé à chaque appelant est un filtre qu'un
//     appelant oubliera.
// Traçabilité : E19 (avant-vente : cadrage de l'étendue — entreprise complète,
// filiales) · E18 (liaison clients axion-ia.com : console maîtresse) · E3 (tous
// secteurs d'activité — pré-remplissage sectoriel) · E43 (conventions d'API
// épinglées : pagination keyset).
// =============================================================================
import { and, eq, isNull, ne } from 'drizzle-orm';
import { AppError, codesPaysStockesSchema, divisionNaf, type PaginationQuery } from '@axion/shared';
import { db } from '../../db.js';
import { companies, nafSectorMap } from '../../db/schema.js';
import {
  conditionApresCurseur,
  limiteAChercher,
  ordreDuCurseur,
  paginerParCurseur,
  type DefinitionCurseur,
  type PageCurseur,
} from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';

// -----------------------------------------------------------------------------
// LA LIGNE
// -----------------------------------------------------------------------------

/**
 * Une fiche client telle que la console a le droit de la voir.
 *
 * `deletedAt` n'y figure PAS : aucune lecture de ce dépôt ne rend une fiche
 * supprimée, donc le champ ne porterait jamais que `null`. Un champ qui ne prend
 * qu'une valeur invite à croire qu'il en prend d'autres.
 */
export interface LigneEntreprise {
  readonly id: string;
  readonly externalRef: string | null;
  readonly name: string;
  readonly siren: string | null;
  readonly nafCode: string | null;
  readonly sectorId: string | null;
  readonly headcount: number | null;
  readonly sitesCount: number | null;
  readonly countries: readonly string[];
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Les colonnes rendues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_ENTREPRISE = {
  id: companies.id,
  externalRef: companies.externalRef,
  name: companies.name,
  siren: companies.siren,
  nafCode: companies.nafCode,
  sectorId: companies.sectorId,
  headcount: companies.headcount,
  sitesCount: companies.sitesCount,
  countries: companies.countries,
  notes: companies.notes,
  createdAt: companies.createdAt,
  updatedAt: companies.updatedAt,
};

/** Ce que Drizzle rend réellement : `countries` est un JSONB, donc `unknown`. */
type LigneBrute = Omit<LigneEntreprise, 'countries'> & { readonly countries: unknown };

/**
 * Valide le JSONB `countries` au lieu de l'asserter.
 *
 * `jsonb` traverse Drizzle en `unknown`, et un `as string[]` mentirait au
 * compilateur exactement là où la donnée vient de la base plutôt que du type — le
 * même geste que le dépôt financier applique à `daily_rates`. Une colonne qui ne
 * contiendrait pas un tableau de chaînes est une CORRUPTION, pas une entrée
 * d'utilisateur : elle sort en 500, bruyamment, plutôt qu'en liste vide silencieuse
 * qui ferait disparaître les pays d'implantation d'une fiche sans que personne ne
 * le voie.
 */
function versLigne(brut: LigneBrute): LigneEntreprise {
  const pays = codesPaysStockesSchema.safeParse(brut.countries);
  if (!pays.success) {
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return { ...brut, countries: pays.data };
}

// -----------------------------------------------------------------------------
// LISTE — pagination keyset
// -----------------------------------------------------------------------------

/**
 * Le curseur de `GET /v1/companies` : **`(name, id)`, ascendant**.
 *
 * ── POURQUOI `name` ET NON `created_at`, CONTRAIREMENT À `users` ─────────────
 * C'est `docs/conception/LOT_L3.md` §2 qui le fige (« `missions`: `created_at,id` ·
 * `companies`: `name,id` · `org_units`: `position,id` »), et `http/pagination.ts`
 * en porte déjà la trace dans son en-tête. Le motif est fonctionnel : un
 * référentiel client se consulte par ORDRE ALPHABÉTIQUE — c'est ainsi qu'on cherche
 * une fiche —, alors qu'une liste de comptes se lit dans l'ordre de création.
 *
 * ── ET POURQUOI, ICI, LA COMPOSANTE DU CURSEUR N'A PAS BESOIN DE `::text` ────
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le piège mesuré sur `users` NE S'APPLIQUE PAS À UNE COLONNE `TEXT`, et il faut
 * dire pourquoi plutôt que de laisser croire à un oubli.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sur `users`, la composante `created_at` est un `TIMESTAMPTZ` : PostgreSQL y garde
 * des MICROSECONDES, la `Date` de JavaScript n'a que la MILLISECONDE, et un curseur
 * reconstruit par `toISOString()` est STRICTEMENT INFÉRIEUR à la valeur réelle —
 * d'où une ligne re-servie à chaque page, et une BOUCLE quand `limit` lignes
 * partagent la même milliseconde. Le dépôt des comptes lit donc `created_at::text`.
 * Ici, la composante est `companies.name`, un `TEXT` : `node-postgres` le rend
 * **caractère pour caractère**, aucune conversion n'intervient, et `ligne.name` EST
 * la forme comparée. Ajouter un `::text` serait une conversion identité — un rite
 * qui laisserait croire qu'une conversion protège de quelque chose.
 * ⚠ LA RÈGLE À RETENIR POUR LE PROCHAIN LOT : dès que la composante d'un curseur
 * est un `TIMESTAMPTZ`, un `NUMERIC` ou tout type que le pilote convertit, elle se
 * lit **en SQL**, jamais reconstruite depuis la valeur JavaScript.
 *
 * ── LES TROIS EXIGENCES DU MODULE DE PAGINATION, VÉRIFIÉES ICI ──────────────
 *  1. « les colonnes du curseur sont NOT NULL » : `companies.name` et
 *     `companies.id` le sont (04 · migration `0002`, convention T12/T13). Une
 *     composante nulle rendrait la comparaison de n-uplets NULL, donc AUCUNE ligne,
 *     donc une liste qui s'arrête à la première page ;
 *  2. « la DERNIÈRE clé est unique » : `id` est la clé primaire — indispensable ici
 *     plus qu'ailleurs, car **deux entreprises homonymes sont LÉGITIMES** (§16,
 *     filiales étrangères) : sans l'`id`, l'ordre ne serait pas total et la
 *     pagination sauterait précisément les doublons que R3 cherche à faire voir ;
 *  3. « l'index qui sert le tri couvre les mêmes colonnes » : **IL N'EXISTE PAS.**
 *     Le §7.1 du fichier 04 ne prévoit aucun index sur `companies(name, id)` ; le
 *     tri est servi par un tri en mémoire. Correct, et lent au-delà de quelques
 *     milliers de fiches — sans effet mesurable au volume de la Phase 1. L'ajouter
 *     toucherait le fichier 04, donc une escalade (`CLAUDE.md` §3-2) : il est
 *     REMONTÉ, pas ajouté.
 *
 * ⚠ DÉPENDANCE À LA COLLATION, écrite plutôt que supposée : `ORDER BY name` et la
 * comparaison `(name, id) > ($1, $2)` utilisent la MÊME collation de base, donc
 * elles ne peuvent pas diverger. Changer la collation de la base réordonnerait la
 * liste — sans jamais casser la pagination, puisque les deux moitiés bougent
 * ensemble.
 */
const CURSEUR_ENTREPRISES: DefinitionCurseur<LigneEntreprise> = {
  ressource: 'companies',
  sens: 'asc',
  cles: [
    { colonne: companies.name, valeur: (ligne) => ligne.name },
    { colonne: companies.id, valeur: (ligne) => ligne.id },
  ],
};

/**
 * Une page de fiches clients, par ordre alphabétique.
 *
 * AUCUN FILTRE, et c'est un choix : le pack n'en nomme aucun (ni par secteur, ni
 * par pays, ni par recherche de nom). En inventer serait inventer du produit ; les
 * ajouter plus tard n'est qu'une extension du schéma de requête
 * (`paginationQuerySchema.extend({ … })`), pas une reprise de cette fonction.
 */
export async function listerEntreprises(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneEntreprise>> {
  const lignes = await db
    .select(COLONNES_ENTREPRISE)
    .from(companies)
    .where(
      and(
        isNull(companies.deletedAt),
        conditionApresCurseur(CURSEUR_ENTREPRISES, pagination.after),
      ),
    )
    .orderBy(...ordreDuCurseur(CURSEUR_ENTREPRISES))
    .limit(limiteAChercher(pagination));

  return paginerParCurseur(CURSEUR_ENTREPRISES, pagination, lignes.map(versLigne));
}

// -----------------------------------------------------------------------------
// LECTURES UNITAIRES
// -----------------------------------------------------------------------------

/** Lit une fiche par clé primaire. Rend `null` si elle n'existe pas ou est supprimée. */
export async function lireEntreprise(id: string): Promise<LigneEntreprise | null> {
  const lignes = await db
    .select(COLONNES_ENTREPRISE)
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * Lit une fiche ET LA VERROUILLE jusqu'à la fin de la transaction.
 *
 * Comme pour les comptes, le `FOR UPDATE` est ce qui rend le journal VRAI : un
 * `PATCH` est un lire-puis-écrire, on a besoin de l'état AVANT pour savoir quels
 * champs changent réellement — et c'est cette liste de champs, et elle seule, que
 * `company.update` écrit dans `activity_log`. Sans verrou, deux modifications
 * simultanées liraient le même « avant » et produiraient deux lignes d'audit dont
 * l'une décrit un changement qui n'a jamais eu lieu.
 */
export async function lireEntreprisePourEcriture(
  executeur: ExecuteurSql,
  id: string,
): Promise<LigneEntreprise | null> {
  const lignes = await executeur
    .select(COLONNES_ENTREPRISE)
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1)
    .for('update');

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * L'identifiant de la fiche qui porte DÉJÀ ce SIREN. Sert UNIQUEMENT à enrichir le
 * message d'un `COMPANY_DUPLICATE` déjà décidé par la contrainte — jamais à décider
 * du conflit lui-même (voir `insererEntreprise`).
 *
 * ⚠ NE FILTRE PAS `deleted_at` : l'index unique partiel du fichier 04 ne l'exclut
 * pas non plus. Une fiche supprimée continue donc de retenir son SIREN, et cette
 * lecture doit pouvoir la nommer — sinon le conflit serait rapporté sans coupable.
 * Conséquence à connaître, remontée au rapport du lot : tant qu'aucune route
 * n'écrit `deleted_at`, le cas est inatteignable ; le jour où une suppression
 * existera, ce 409 désignera une fiche que la liste ne montre plus.
 */
export async function lireIdEntrepriseParSiren(siren: string): Promise<string | null> {
  const lignes = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.siren, siren))
    .limit(1);

  return lignes[0]?.id ?? null;
}

/** Un nom de fiche, réduit à ce que la comparaison de doublons a besoin de voir. */
export interface NomEntreprise {
  readonly id: string;
  readonly name: string;
}

/**
 * LES NOMS DES FICHES VIVANTES — la matière de l'alerte R3 « nom en second ».
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'EST UN BALAYAGE COMPLET, ET C'EST ASSUMÉ. Voici le raisonnement, pour que
 * personne n'ait à le refaire.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La comparaison porte sur le nom NORMALISÉ (minuscules, sans accents, formes
 * juridiques retirées — `packages/shared/src/companies.ts`). Trois façons de la
 * servir :
 *   1. **normaliser en SQL** : il faudrait réécrire la normalisation en PL/pgSQL,
 *      donc en tenir DEUX exemplaires, dans deux langages, qui divergeront ;
 *   2. **colonne normalisée + index** : la bonne solution à terme — et un
 *      amendement du fichier 04, donc la signature de Williams (`CLAUDE.md` §3-2) ;
 *   3. **balayer et comparer en TypeScript** : une seule normalisation, celle que
 *      le front partage déjà.
 * L'option 3 est retenue POUR LA PHASE 1, où le référentiel compte quelques
 * dizaines de fiches et où deux colonnes par ligne tiennent dans une poignée de
 * kilo-octets. **AUCUNE BORNE N'EST POSÉE sur le nombre de lignes lues** : une
 * borne (« les 5 000 premières ») rendrait l'alerte silencieusement incomplète
 * au-delà — et une alerte anti-doublon qui rate des doublons sans le dire est pire
 * que pas d'alerte. On préfère une requête qui ralentit visiblement à une garantie
 * qui s'éteint invisiblement. Le passage à l'option 2 est REMONTÉ au rapport du lot.
 */
export async function lireNomsEntreprises(
  idAExclure: string | null,
): Promise<readonly NomEntreprise[]> {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      and(
        isNull(companies.deletedAt),
        // Sur un `PATCH`, la fiche modifiée n'est pas son propre homonyme.
        idAExclure === null ? undefined : ne(companies.id, idAExclure),
      ),
    );
}

// -----------------------------------------------------------------------------
// R4 — LA CORRESPONDANCE NAF → SECTEUR
// -----------------------------------------------------------------------------

/**
 * Le secteur d'une DIVISION NAF, ou `null` si le référentiel ne la couvre pas.
 *
 * ⚠ LA CLÉ EST LA DIVISION À DEUX CHIFFRES, PAS LE CODE APE COMPLET. `seed.mjs`
 * peuple `naf_sector_map` avec 88 lignes `'01'` … `'99'`, tandis que
 * `companies.naf_code` porte un code APE complet (`'62.01Z'`). Interroger la table
 * avec le code complet ne rendrait JAMAIS rien, et R4 sortirait vert en ne faisant
 * rien : chaque création rendrait poliment « secteur à qualifier » sans que la table
 * ait été consultée une seule fois. Le passage par `divisionNaf` est donc la
 * fonction de ce module, pas une commodité.
 *
 * Rendre `null` n'est PAS une erreur : R4 pré-remplit, il n'impose pas. Un
 * référentiel incomplet est un fait d'administration (la table est éditable depuis
 * la console, espace Contenu), jamais une faute de l'utilisateur.
 */
export async function lireSecteurParCodeNaf(codeNafCanonique: string): Promise<string | null> {
  const lignes = await db
    .select({ sectorId: nafSectorMap.sectorId })
    .from(nafSectorMap)
    .where(eq(nafSectorMap.nafCode, divisionNaf(codeNafCanonique)))
    .limit(1);

  return lignes[0]?.sectorId ?? null;
}

// -----------------------------------------------------------------------------
// ÉCRITURES — et la traduction des erreurs du pilote PostgreSQL
// -----------------------------------------------------------------------------

/**
 * Nom de l'index unique PARTIEL du SIREN, tel que le pose la migration
 * `0002_clients_missions_organisation.sql` :
 * `CREATE UNIQUE INDEX uq_companies_siren ON companies (siren) WHERE siren IS NOT NULL`.
 *
 * On le NOMME plutôt que de traiter tout `23505` comme un doublon de SIREN : le jour
 * où une seconde contrainte unique apparaîtra sur `companies` (05 §8.3 annonce un
 * référentiel partagé avec `external_ref`), un message parlant de SIREN serait
 * FAUX — et un message d'erreur faux envoie chercher au mauvais endroit, ce qui
 * coûte plus cher qu'un message absent.
 */
const CONTRAINTE_SIREN_UNIQUE = 'uq_companies_siren';

/** Nom de la clé étrangère du secteur, posée par la même migration. */
const CONTRAINTE_SECTEUR = 'companies_sector_id_fkey';

/** Code SQLSTATE d'une violation d'unicité (PostgreSQL). */
const VIOLATION_UNICITE = '23505';

/** Code SQLSTATE d'une violation de clé étrangère (PostgreSQL). */
const VIOLATION_CLE_ETRANGERE = '23503';

/**
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/**
 * Reconnaît une violation de contrainte NOMMÉE, SANS `instanceof` ni assertion.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ON REMONTE LA CHAÎNE `cause`, ET C'EST LA SEULE FAÇON QUE ÇA MARCHE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * MESURÉ sur `drizzle-orm@0.44.7` lors du CRUD des comptes : une requête qui échoue
 * ne propage PAS l'erreur du pilote — elle lève une `DrizzleQueryError` qui porte la
 * requête et ses paramètres, et RANGE la `DatabaseError` de `pg` dans sa propriété
 * `cause`. **Ni `code` ni `constraint` ne sont recopiés sur l'enveloppe.** Un
 * `catch` qui lirait `erreur.code` rendrait donc TOUJOURS `false`, et un SIREN en
 * double sortirait en **500 INTERNAL_ERROR** au lieu de **409 COMPANY_DUPLICATE** —
 * un défaut qui ne se voit pas en lisant le code, seulement en l'exécutant contre un
 * PostgreSQL réel.
 *
 * Le type de l'erreur du pilote `pg` n'est pas exporté d'une façon sur laquelle il
 * serait sage de s'appuyer : on lit deux propriétés, prudemment, sur chaque maillon.
 */
function violeLaContrainte(erreur: unknown, sqlstate: string, contrainte: string): boolean {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur <= PROFONDEUR_MAX_CAUSE; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return false;

    const code = 'code' in courante ? courante.code : undefined;
    const nom = 'constraint' in courante ? courante.constraint : undefined;
    if (code === sqlstate && nom === contrainte) return true;

    courante = 'cause' in courante ? courante.cause : undefined;
  }
  return false;
}

/**
 * Traduit les deux échecs de contrainte que ces routes peuvent provoquer, et
 * relance tout le reste.
 *
 * ── POURQUOI ON N'A PAS LU AVANT D'ÉCRIRE ───────────────────────────────────
 * Un `SELECT … WHERE siren = $1` préalable ne supprime PAS le besoin de ce
 * traitement : entre la lecture et l'insertion, une autre requête peut prendre le
 * SIREN. **C'est l'index unique partiel qui arbitre la course, pas nous** — deux
 * `POST` concurrents sur le même SIREN donnent une création et un 409, et c'est la
 * base qui le décide. Un contrôle préalable n'ajouterait qu'un aller-retour et
 * l'illusion d'une garantie.
 *
 * L'identifiant de la fiche existante est lu APRÈS coup, uniquement pour le message :
 * une lecture qui échouerait (course, fiche supprimée entre-temps) dégrade le
 * message, jamais la décision.
 */
async function traduireEchecDeContrainte(erreur: unknown, siren: string | null): Promise<never> {
  if (violeLaContrainte(erreur, VIOLATION_UNICITE, CONTRAINTE_SIREN_UNIQUE)) {
    // L'identifiant de la fiche fautive rend le conflit ACTIONNABLE : sans lui, la
    // console ne peut qu'annoncer un doublon, jamais y conduire. Il est lu APRÈS
    // que la contrainte a décidé — s'il manque (course, SIREN effacé entre-temps),
    // le message est plus pauvre, la décision reste la même.
    const existante = siren === null ? null : await lireIdEntrepriseParSiren(siren);
    throw new AppError(
      'COMPANY_DUPLICATE',
      'Une autre entreprise porte déjà ce SIREN. Rapprochez les deux fiches plutôt ' +
        "que d'en créer une seconde.",
      existante === null
        ? undefined
        : [{ path: 'siren', message: `Fiche existante : ${existante}` }],
    );
  }
  if (violeLaContrainte(erreur, VIOLATION_CLE_ETRANGERE, CONTRAINTE_SECTEUR)) {
    throw new AppError('VALIDATION_FAILED', "Ce secteur d'activité n'existe pas.", [
      { path: 'sectorId', message: "Secteur d'activité inconnu du référentiel." },
    ]);
  }
  throw erreur;
}

/** Ce qu'une création fournit. `id` est un UUID v7 frappé par le service. */
export interface NouvelleEntreprise {
  readonly id: string;
  readonly name: string;
  readonly siren: string | null;
  readonly nafCode: string | null;
  readonly sectorId: string | null;
  readonly externalRef: string | null;
  readonly headcount: number | null;
  readonly sitesCount: number | null;
  readonly countries: readonly string[];
  readonly notes: string | null;
}

/**
 * Insère une fiche. Lève `COMPANY_DUPLICATE` (409) si le SIREN est déjà pris.
 *
 * `created_at` et `updated_at` sont posés PAR L'APPLICATION malgré leur défaut SQL,
 * pour la raison qu'énonce le dépôt du journal : un horodatage qui vient tantôt de
 * l'application tantôt de la base rend indécidable, à la relecture d'un incident, de
 * quelle horloge on parle. `new Date()` est en UTC dans le protocole PostgreSQL, et
 * la session est forcée en UTC (`db.ts`).
 */
export async function insererEntreprise(
  nouvelle: NouvelleEntreprise,
  maintenant: Date,
): Promise<LigneEntreprise> {
  let lignes: LigneBrute[];
  try {
    lignes = await db
      .insert(companies)
      .values({
        id: nouvelle.id,
        externalRef: nouvelle.externalRef,
        name: nouvelle.name,
        siren: nouvelle.siren,
        nafCode: nouvelle.nafCode,
        sectorId: nouvelle.sectorId,
        headcount: nouvelle.headcount,
        sitesCount: nouvelle.sitesCount,
        // Le tableau est RECOPIÉ : la valeur passée par le service est en lecture
        // seule, et Drizzle attend un JSON mutable.
        countries: [...nouvelle.countries],
        notes: nouvelle.notes,
        // Une fiche naît VIVANTE. Écrit en clair plutôt que laissé au défaut de la
        // colonne : c'est une décision fonctionnelle, elle appartient au code.
        deletedAt: null,
        createdAt: maintenant,
        updatedAt: maintenant,
      })
      .returning(COLONNES_ENTREPRISE);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur, nouvelle.siren);
  }

  const ligne = lignes[0];
  if (ligne === undefined) {
    // Inatteignable : un `INSERT … RETURNING` qui n'échoue pas rend une ligne. On
    // échoue quand même plutôt que d'asserter — une assertion mentirait au compilateur.
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return versLigne(ligne);
}

/** Les champs que `PATCH /v1/companies/:id` peut toucher. */
export interface ChampsEntrepriseModifiables {
  readonly name?: string;
  readonly siren?: string | null;
  readonly nafCode?: string | null;
  readonly sectorId?: string | null;
  readonly externalRef?: string | null;
  readonly headcount?: number | null;
  readonly sitesCount?: number | null;
  readonly countries?: string[];
  readonly notes?: string | null;
}

/**
 * Applique une modification. `updated_at` est TOUJOURS bousculé — le service
 * n'appelle cette fonction QUE si au moins un champ change réellement, et c'est
 * précisément la question à laquelle cette colonne répond.
 */
export async function mettreAJourEntreprise(
  executeur: ExecuteurSql,
  id: string,
  champs: ChampsEntrepriseModifiables,
  maintenant: Date,
): Promise<LigneEntreprise | null> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .update(companies)
      .set({ ...champs, updatedAt: maintenant })
      .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
      .returning(COLONNES_ENTREPRISE);
  } catch (erreur: unknown) {
    // `champs.siren` est `undefined` quand la modification ne touche pas au SIREN —
    // et dans ce cas l'index unique ne PEUT pas être violé par cette requête. Le
    // `?? null` n'est donc pas un repli : il dit qu'il n'y a rien à rapprocher.
    return traduireEchecDeContrainte(erreur, champs.siren ?? null);
  }

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}
