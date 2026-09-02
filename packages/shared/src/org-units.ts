// =============================================================================
// CONTRAT D'API DE L'ARBRE ORGANISATIONNEL — `org_units`. Lot L3, incrément L3c.
//
// ── D'OÙ VIENNENT CES SIX ROUTES ────────────────────────────────────────────
// `docs/conception/LOT_L3.md` §2 les nomme : `GET|POST /v1/missions/:id/org-units`
// · `PATCH /v1/org-units/:id` · `POST /v1/missions/:id/org-units/import`
// (`?verification=true` = à blanc) · `POST /v1/org-units/:id/{validate,merge}`.
// Elles servent trois sections du pack, et trois seulement :
//   · **03 §16.2** — l'arbre de la mission, `kind` jusqu'à `poste` (§26.3) ;
//   · **03 §35.2** — le format CSV d'import, normatif, transcrit ci-dessous
//     colonne par colonne ;
//   · **03 §25.3** — la proposition d'unité venue du terrain, et les deux gestes
//     du siège qui la qualifient : VALIDER (`proposee` → `active`) ou FUSIONNER
//     (`proposee` → `fusionnee` + `merged_into_id`).
// Aucune capacité n'est inventée ici : **pas de suppression** — le « D » de CRUD
// n'est instancié nulle part par le pack, `org_units` n'a même pas de `deleted_at`
// au fichier 04, et l'invariant 7 (« rien n'est jamais silencieusement écrasé ou
// supprimé ») en fait une décision de produit, pas une convention.
//
// ── LE FORMAT §35.2 EST RECOPIÉ, PAS INTERPRÉTÉ ─────────────────────────────
// Neuf colonnes, dans l'ordre du pack, avec ses étoiles d'obligation : `ref` ·
// `name`* · `kind`* · `parent_ref` · `country_code` · `headcount` ·
// `service_code` · `sector_code` · `timezone`. Ce qui n'est PAS écrit au §35.2 et
// qu'il a fallu trancher est signalé cas par cas, à l'endroit exact où la décision
// se lit — jamais dans un commentaire d'ensemble qui se perdrait.
//
// ── POURQUOI LE PARSEUR VIT ICI, DANS UN PAQUET PARTAGÉ ─────────────────────
// `analyserCsvArbre` est une fonction **PURE** : elle ne connaît ni base ni
// réseau. La console peut donc rendre son rapport d'erreurs AVANT le moindre
// aller-retour — un fichier d'organigramme se corrige par itérations, et faire un
// aller-retour serveur par itération est une ergonomie que le §35.2 (« fait pour
// être saisissable à la main ») ne mérite pas. Le serveur le rejoue de toute
// façon : un contrôle de navigateur ne garantit rien. Même geste, et même
// justification, que les fonctions pures de `companies.ts`.
// **Ce qu'elle ne fait PAS, et ne peut pas faire** : vérifier qu'un `service_code`
// ou un `sector_code` EXISTE. Ces deux contrôles-là lisent des référentiels en
// base ; ils vivent dans le service (`apps/api/src/domaines/org-units/service.ts`).
//
// Traçabilité : E4 (arbre organisationnel à profondeur libre) · E5 (audits
// partiels — périmètre par unité, `in_scope`) · E31 (généricité absolue : un
// arbre est une DONNÉE de mission, jamais une constante) · E43 (conventions d'API
// épinglées) · E46 (bout en bout opérationnel : le format CSV du §35.2).
// =============================================================================
import { z } from 'zod';
import { codePaysSchema } from './companies.js';
import { codeReferentielSchema, TYPES_UNITE_ORG, type TypeUniteOrg } from './missions.js';
import { fuseauIanaSchema, isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// LE VOCABULAIRE FERMÉ DE `org_units`
// -----------------------------------------------------------------------------

/**
 * `org_units.status` — 03 §25.3, transcrit du CHECK du fichier 04.
 *
 * ⚠ **`fusionnee` N'EST PAS UNE VALEUR QU'UN APPELANT PEUT POSER.** Elle est le
 * résultat de `POST /v1/org-units/:id/merge`, qui l'écrit AVEC `merged_into_id`
 * dans la même transaction. Un statut « fusionnée » sans cible serait une unité
 * qui déclare avoir disparu sans dire où — exactement la perte de traçabilité que
 * l'invariant 7 refuse. Les schémas d'écriture ci-dessous ne l'admettent donc
 * jamais.
 */
export const STATUTS_UNITE_ORG = ['active', 'proposee', 'fusionnee'] as const;
export type StatutUniteOrg = (typeof STATUTS_UNITE_ORG)[number];

/**
 * Les statuts qu'une CRÉATION peut demander.
 *
 * `proposee` y figure — 03 §25.3 : « un auditeur crée hors ligne une unité
 * `proposee` […] à la sync : alerte au lead/admin ». Le chemin de sync est le lot
 * L6 ; sans cette valeur ici, `validate` et `merge` seraient des routes qu'aucun
 * appelant ne pourrait atteindre en V1, donc des routes que personne ne pourrait
 * ni exercer ni recetter. Le siège peut donc enregistrer une proposition reçue
 * autrement (au téléphone, sur un carnet) — ce qui est le geste que §25.3 décrit,
 * moins l'appareil.
 */
export const STATUTS_UNITE_ORG_CREABLES = ['active', 'proposee'] as const;
export type StatutUniteOrgCreable = (typeof STATUTS_UNITE_ORG_CREABLES)[number];

// -----------------------------------------------------------------------------
// BORNES DE SAISIE
// -----------------------------------------------------------------------------
//
// `org_units.name` est un `TEXT` sans borne au fichier 04 : les bornes sont donc
// APPLICATIVES, et elles existent pour la même raison que celles de `companies` —
// refuser une entrée démesurée AVANT la base, sans jamais refuser une saisie
// réelle.

/** Longueur maximale du nom d'une unité. Même borne que la raison sociale. */
export const NOM_UNITE_LONGUEUR_MAX = 300;

/**
 * Longueur maximale d'un `ref` de fichier CSV — « identifiant de ligne, libre »
 * (§35.2). Libre ne veut pas dire illimité : c'est une clé de rapprochement
 * interne au fichier, jamais une donnée conservée (aucune colonne du 04 ne la
 * porte). 128 caractères couvrent un code d'organigramme, un chemin hiérarchique
 * abrégé, un identifiant d'ERP.
 */
export const REF_CSV_LONGUEUR_MAX = 128;

/**
 * LA PLUS GRANDE VALEUR QU'UN `INTEGER` DE POSTGRESQL PUISSE PORTER.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UNE BORNE MÉTIER : C'EST LE TYPE DE LA COLONNE, RENDU EXÉCUTABLE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le fichier 04 déclare `org_units.position INTEGER` et `headcount INTEGER`. Une
 * valeur au-delà de cette borne n'est pas « trop grande » au sens du métier : elle
 * est **impossible à stocker**, et PostgreSQL la refuse par un `22003`
 * (numeric_value_out_of_range).
 *
 * ⚠ **MESURÉ, ET C'EST LE DÉFAUT QUE CETTE CONSTANTE FERME** : sans elle,
 * `PATCH { position: 2147483648 }` traversait la validation Zod, atteignait la base,
 * et sortait en **500 INTERNAL_ERROR** — une faute de saisie imputée au serveur. Le
 * 11 §3 exige un statut cohérent : une valeur hors du type de sa colonne est une
 * faute de FORME, donc un **400**, et il se prononce ici, avant tout aller-retour.
 * Le dépôt traduit le `22003` en seconde ceinture (défense en profondeur : une
 * valeur calculée en interne — l'import numérote `positionMax + 1` — ne passe par
 * aucun schéma Zod).
 */
export const ENTIER_POSTGRES_MAX = 2_147_483_647;

/**
 * Plafond d'effectif d'une unité. Borne de VRAISEMBLANCE, pas règle métier : elle
 * écarte la saisie accidentelle d'un montant dans la colonne `headcount`, sans
 * jamais refuser une unité réelle. Même valeur que `companies`.
 *
 * Elle est TRÈS EN DEÇÀ d'`ENTIER_POSTGRES_MAX` : `headcount` ne peut donc pas
 * déborder son `INTEGER`, et le défaut mesuré sur `position` n'a jamais eu de
 * jumeau ici. Écrit plutôt que supposé — c'est la question qu'on se pose en
 * relisant, et la réponse doit être dans le fichier.
 */
export const EFFECTIF_UNITE_MAX = 10_000_000;

/**
 * Longueur maximale du motif d'une fusion. Généreuse, pour la même raison que le
 * motif d'une transition de mission : c'est la seule phrase où un administrateur
 * explique pourquoi deux unités n'en font plus qu'une.
 */
export const MOTIF_FUSION_LONGUEUR_MAX = 2000;

/**
 * Profondeur maximale d'un arbre, et **c'est un garde-fou d'exécution, pas une
 * règle métier**.
 *
 * Le pack écrit « profondeur LIBRE » (E4) et le brief FIL-GC parle de 4 niveaux ;
 * cette borne ne les contredit pas, elle borne les PARCOURS : détection de cycle
 * à l'import, remontée d'ancêtres au reparentage. Sans elle, un arbre corrompu en
 * base (un cycle introduit par une écriture directe) ferait boucler une remontée
 * indéfiniment — c'est-à-dire qu'une donnée fausse rendrait l'API muette au lieu
 * de bruyante. 64 niveaux sont hors d'atteinte d'un organigramme réel.
 */
export const PROFONDEUR_ARBRE_MAX = 64;

// -----------------------------------------------------------------------------
// PARAMÈTRES D'URL
// -----------------------------------------------------------------------------

/** `:id` des trois routes qui visent UNE unité (`PATCH`, `validate`, `merge`). */
export const orgUnitParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type OrgUnitParams = z.infer<typeof orgUnitParamsSchema>;

// -----------------------------------------------------------------------------
// SORTIE — la seule forme sous laquelle une unité sort de l'API
// -----------------------------------------------------------------------------

/**
 * Une unité de l'arbre, telle qu'elle est rendue.
 *
 * `strictObject` : une clé non déclarée est REFUSÉE, pas ignorée — le sérialiseur
 * Zod repasse la réponse par ce schéma avant l'envoi (`apps/api/src/http/zod.ts`),
 * et c'est cette ceinture qui empêche un champ ajouté par mégarde dans un dépôt
 * d'atteindre le réseau.
 *
 * ── LES DEUX CHAMPS QUI SE LISENT ENSEMBLE ──────────────────────────────────
 * `status` et `mergedIntoId` forment un couple : `fusionnee` ⇒ `mergedIntoId` non
 * nul. La réciproque est vraie aussi. Aucun schéma ne peut l'exprimer sans rendre
 * la lecture d'une ligne historique fragile ; c'est le service qui le garantit à
 * l'écriture, et c'est écrit ici pour que personne ne les dissocie à la lecture.
 *
 * `timezone` NUL n'est pas une donnée manquante : 03 §22.2 en fait un HÉRITAGE
 * explicite du fuseau de la mission. Y recopier le fuseau de la mission créerait
 * une seconde valeur à tenir à jour, que personne ne mettrait à jour.
 */
export const orgUnitResponseSchema = z.strictObject({
  id: z.uuid(),
  missionId: z.uuid(),
  /** `null` = racine de l'arbre. Une mission peut en porter plusieurs (§35.2). */
  parentId: z.uuid().nullable(),
  kind: z.enum(TYPES_UNITE_ORG),
  name: z.string().min(1).max(NOM_UNITE_LONGUEUR_MAX),
  countryCode: z.string().nullable(),
  /** §22.2 — `null` = héritage du fuseau de la mission. Voir ci-dessus. */
  timezone: z.string().nullable(),
  headcount: z.number().int().nullable(),
  /** Taxonomie des 11 fonctions (11 §5) — `services.id`. */
  serviceRefId: z.uuid().nullable(),
  /** R6 — secteur surchargé par unité (holdings multi-activités). */
  sectorId: z.uuid().nullable(),
  /** §25.1 — hors périmètre : données CONSERVÉES, exclues du scoring. */
  inScope: z.boolean(),
  status: z.enum(STATUTS_UNITE_ORG),
  /** §25.3 — l'auditeur qui a proposé l'unité. `null` pour une unité du siège. */
  proposedBy: z.uuid().nullable(),
  /** §25.3 — la cible d'une fusion. Non nul si et seulement si `fusionnee`. */
  mergedIntoId: z.uuid().nullable(),
  /**
   * Rang de l'unité dans l'arbre de sa mission.
   *
   * ⚠ **NULLABLE, PARCE QUE LE FICHIER 04 LA DÉCLARE NULLABLE.** Une unité sans
   * position est donc un état LÉGITIME, pas une corruption — et elle a le droit
   * d'être rendue. Ce lot n'en écrit jamais (la racine porte 1, une création
   * calcule `max + 1`, un import numérote à la suite), mais une ligne venue d'un
   * autre chemin en porterait une : la taire ferait disparaître une unité de
   * l'arbre sans un mot.
   *
   * La pagination s'en accommode sans que le 04 bouge : le curseur trie sur la
   * position RAMENÉE À UNE FIN DE LISTE (voir `domaines/org-units/depot.ts`), de
   * sorte que ces unités sortent une fois, et une seule, en queue d'arbre.
   */
  position: z.number().int().nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});

export type OrgUnitResponse = z.infer<typeof orgUnitResponseSchema>;

/**
 * La réponse d'une FUSION (§25.3) — ce qui a été écrit, et ce qui a été
 * RE-RATTACHÉ.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LES DEUX DÉCOMPTES NE SONT PAS DÉCORATIFS : ILS SONT LA PREUVE DE L'INVARIANT 7.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Une fusion ne supprime rien — la ligne source SURVIT, en `fusionnee`, portant sa
 * cible. Mais elle DÉPLACE : les entretiens de l'unité source et ses unités filles
 * changent de rattachement. Rendre les deux décomptes, c'est permettre à
 * l'administrateur de vérifier immédiatement que rien n'a été perdu en chemin —
 * et à un test de le vérifier sans lire la base. Un geste qui déplace des données
 * sans dire combien est un geste qu'on ne peut pas contrôler.
 */
export const orgUnitMergeResponseSchema = z.strictObject({
  /** L'unité fusionnée, APRÈS coup : `status = 'fusionnee'`, `mergedIntoId` posé. */
  unite: orgUnitResponseSchema,
  /** L'unité CIBLE, inchangée — rendue pour éviter une seconde lecture. */
  cible: orgUnitResponseSchema,
  /** Entretiens re-rattachés de la source vers la cible. Peut valoir 0. */
  entretiensReattaches: z.number().int().min(0),
  /** Unités filles re-parentées de la source vers la cible. Peut valoir 0. */
  enfantsReattaches: z.number().int().min(0),
});

export type OrgUnitMergeResponse = z.infer<typeof orgUnitMergeResponseSchema>;

// -----------------------------------------------------------------------------
// BRIQUES D'ENTRÉE
// -----------------------------------------------------------------------------

const nomUniteSchema = z.string().trim().pipe(z.string().min(1).max(NOM_UNITE_LONGUEUR_MAX));

const effectifSchema = z.number().int().min(0).max(EFFECTIF_UNITE_MAX);

/**
 * La position d'une unité : un entier POSITIF, dans les bornes de sa colonne.
 *
 * Bornée à 1 par le bas parce que la racine créée d'office avec la mission porte
 * `position = 1` (`domaines/missions/depot.ts`) : admettre 0 ou un négatif
 * mélangerait deux conventions de rang dans la même colonne, et un tri mélangé ne
 * se voit pas — il rend simplement l'arbre dans un ordre que personne n'a voulu.
 *
 * Bornée par le haut au TYPE de la colonne (`ENTIER_POSTGRES_MAX`), et pas à une
 * valeur métier : rien ne dit qu'un arbre ne peut pas porter deux milliards
 * d'unités, mais la colonne, elle, ne sait pas les numéroter. Voir
 * `ENTIER_POSTGRES_MAX` pour le 500 que ce plafond remplace par un 400.
 */
const positionSchema = z.number().int().min(1).max(ENTIER_POSTGRES_MAX);

// -----------------------------------------------------------------------------
// ENTRÉES — création et modification
// -----------------------------------------------------------------------------

/**
 * `POST /v1/missions/:id/org-units` — création d'UNE unité.
 *
 * ── `id` EST ACCEPTÉ, ET C'EST L'INVERSE DE `companies` / `missions` ────────
 * Le fichier 04 le dit en toutes lettres, règle P1-4 : « TOUTE entité créable
 * hors ligne (`interviews`, `answers`, `attachments`, **`org_units` proposées**,
 * `questions`/`mission_questions` ad hoc) porte un **UUID v7 généré côté client** ;
 * le serveur upsert par cet id, idempotent. » Une fiche client, elle, n'est jamais
 * créée hors ligne — d'où le refus symétrique dans `companies.ts`. Ici,
 * l'identifiant est donc **optionnel** : fourni, il est repris tel quel ; absent,
 * le serveur frappe un UUID v7 applicatif (11 §2, lib `uuidv7` — PostgreSQL 16
 * n'a pas d'`uuidv7()` native, et une fonction SQL de génération v7 est interdite).
 *
 * ⚠ **UN `id` DÉJÀ PRIS N'ÉCRASE RIEN** : la route rend `409 CONFLICT`. L'upsert
 * idempotent de P1-4 appartient au chemin de SYNC (05 §9.2, lot L6a), qui porte
 * son propre contrat d'op et sa table `processed_ops` ; le faire ici donnerait à
 * un `POST` de console le pouvoir de réécrire une unité par surprise.
 *
 * ── LES CHAMPS QUE CE SCHÉMA REFUSE ─────────────────────────────────────────
 *  · **`missionId`** : il est dans l'URL. L'admettre aussi dans le corps
 *    autoriserait un désaccord entre les deux, qu'il faudrait arbitrer ;
 *  · **`status: 'fusionnee'`** et **`mergedIntoId`** : voir `STATUTS_UNITE_ORG` —
 *    une fusion est un ACTE, avec sa route et sa transaction ;
 *  · **`proposedBy`** : le pack en fait l'auteur TERRAIN de la proposition
 *    (§25.3). Le renseigner depuis la console attribuerait la proposition à
 *    quelqu'un qui ne l'a pas faite — une trace fausse coûte plus cher qu'une
 *    trace absente ;
 *  · **`createdAt` / `updatedAt`** : ils appartiennent au dépôt.
 */
export const createOrgUnitRequestSchema = z.strictObject({
  /** UUID v7 frappé par le CLIENT (04, règle P1-4). Absent : le serveur le frappe. */
  id: z.uuid().optional(),
  name: nomUniteSchema,
  kind: z.enum(TYPES_UNITE_ORG),
  /**
   * `null` = racine. Le parent DOIT appartenir à la même mission — vérifié par le
   * service, parce qu'aucune contrainte du 04 ne le peut : la clé étrangère
   * `org_units.parent_id → org_units.id` ne dit rien de la mission.
   */
  parentId: z.uuid().nullable().default(null),
  countryCode: codePaysSchema.nullable().default(null),
  /** §22.2 — `null` = héritage du fuseau de la mission. */
  timezone: fuseauIanaSchema.nullable().default(null),
  headcount: effectifSchema.nullable().default(null),
  serviceRefId: z.uuid().nullable().default(null),
  sectorId: z.uuid().nullable().default(null),
  /** §25.1 — une unité naît DANS le périmètre ; l'en sortir est un acte délibéré. */
  inScope: z.boolean().default(true),
  status: z.enum(STATUTS_UNITE_ORG_CREABLES).default('active'),
  /** Absente : le service place l'unité en fin d'arbre (`max(position) + 1`). */
  position: positionSchema.optional(),
});

export type CreateOrgUnitRequest = z.infer<typeof createOrgUnitRequestSchema>;

/**
 * `PATCH /v1/org-units/:id` — modification d'une unité.
 *
 * ── `undefined` ET `null` NE DISENT PAS LA MÊME CHOSE ───────────────────────
 * Champ ABSENT = « ne touche pas ». Champ à `null` = « efface la valeur ». Les
 * confondre rendrait impossible de retirer un fuseau surchargé par erreur — donc
 * de revenir à l'héritage du §22.2 — autrement qu'en écrivant en base.
 *
 * ⚠ **`status` N'Y PASSE PAS.** Les deux seules transitions de statut d'une unité
 * sont `validate` et `merge` (§25.3), qui ont leurs routes, leurs conditions et
 * leur trace. Un `PATCH {status}` court-circuiterait tout cela — et l'admettre
 * rendrait exprimable une unité `fusionnee` sans cible.
 *
 * `refine` plutôt qu'un objet libre : un `PATCH {}` n'est pas une modification.
 */
export const updateOrgUnitRequestSchema = z
  .strictObject({
    name: nomUniteSchema.optional(),
    kind: z.enum(TYPES_UNITE_ORG).optional(),
    /** Reparentage. Le service refuse un cycle et un parent d'une autre mission. */
    parentId: z.uuid().nullable().optional(),
    countryCode: codePaysSchema.nullable().optional(),
    timezone: fuseauIanaSchema.nullable().optional(),
    headcount: effectifSchema.nullable().optional(),
    serviceRefId: z.uuid().nullable().optional(),
    sectorId: z.uuid().nullable().optional(),
    inScope: z.boolean().optional(),
    position: positionSchema.optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

export type UpdateOrgUnitRequest = z.infer<typeof updateOrgUnitRequestSchema>;

// -----------------------------------------------------------------------------
// ENTRÉES — les deux gestes de qualification du §25.3
// -----------------------------------------------------------------------------

/**
 * `POST /v1/org-units/:id/validate` — « devient `active`, entre dans la couverture
 * et le scoring » (§25.3).
 *
 * Le corps est VIDE, et **facultatif** : un `POST` sans corps est ce qu'écrit
 * naturellement un client pour un acte qui n'a pas de paramètre. `strictObject`
 * refuse quand même toute clé inattendue — accepter `{status: 'active'}` en
 * l'ignorant laisserait croire à un appelant qu'il choisit quelque chose.
 *
 * ⚠ `nullish` ET NON `optional`, ET LA NUANCE ÉTAIT UN DÉFAUT MESURÉ : quand une
 * requête arrive **sans corps du tout**, Fastify ne passe pas `undefined` au
 * validateur, il passe **`null`**. Un `.optional()` — qui n'admet que `undefined` —
 * refusait donc exactement le cas que cette documentation promettait d'accepter, et
 * rendait `400 « objet attendu, null reçu »`. Le contrat disait une chose et faisait
 * l'autre ; `nullish` admet les deux absences, celle du langage et celle du réseau.
 */
export const validateOrgUnitRequestSchema = z.strictObject({}).nullish();

export type ValidateOrgUnitRequest = z.infer<typeof validateOrgUnitRequestSchema>;

/**
 * `POST /v1/org-units/:id/merge` — « fusionner avec une unité existante
 * (`fusionnee` + `merged_into_id` ; les entretiens sont re-rattachés
 * automatiquement) » (§25.3).
 *
 * ── LE NOM DU CHAMP EST `mergedIntoId`, ET C'EST UN ARBITRAGE DATÉ ──────────
 * `DECISIONS.md` du 2026-09-01 : c'est le camelCase de la colonne
 * `org_units.merged_into_id` du fichier 04. `targetId` aurait inventé un troisième
 * vocabulaire pour désigner la même chose (11 §3 : `snake_case` en base ↔
 * `camelCase` en TS, jamais de mélange).
 *
 * `motif` est FACULTATIF : ni §25.3 ni le §32.2 n'en exigent un pour ce geste-là.
 * Il n'est **pas** journalisé en toutes lettres — la ceinture de vocabulaire
 * technique du journal (`verifierValeursAtomiques`) refuse une phrase française —
 * seul le FAIT qu'il y en ait eu un l'est. Même limite, et même remontée, que le
 * motif d'une transition de mission.
 */
export const mergeOrgUnitRequestSchema = z.strictObject({
  mergedIntoId: z.uuid(),
  motif: z.string().trim().min(1).max(MOTIF_FUSION_LONGUEUR_MAX).optional(),
});

export type MergeOrgUnitRequest = z.infer<typeof mergeOrgUnitRequestSchema>;

// =============================================================================
// LE FORMAT CSV DU §35.2 — TRANSCRIT COLONNE PAR COLONNE
// =============================================================================

/**
 * LES NEUF COLONNES, DANS L'ORDRE DU §35.2.
 *
 * ```
 * ref;name;kind;parent_ref;country_code;headcount;service_code;sector_code;timezone
 * ```
 *
 * ── CE QUE LE PACK MARQUE D'UNE ÉTOILE, ET CE QU'IL NE MARQUE PAS ───────────
 * `name`* et `kind`* sont les seules valeurs OBLIGATOIRES d'une ligne. `ref` ne
 * porte pas d'étoile : une unité qui n'est le parent de personne n'a besoin
 * d'aucune référence, et l'exiger refuserait un fichier légitime. Quand un `ref`
 * est fourni, il doit être UNIQUE (« identifiant de ligne, libre, unique »).
 *
 * ── LES EN-TÊTES SONT OBLIGATOIRES, ET LA LISTE EST EXHAUSTIVE ─────────────
 * `DECISIONS.md` du 2026-09-01 : les neuf colonnes doivent être PRÉSENTES, et
 * **toute colonne inconnue fait refuser le fichier, en la nommant**. Le motif est
 * mesurable : `headcont` au lieu de `headcount`, et l'effectif de tout l'arbre
 * disparaît sans que rien ne le dise. Le coût du refus est une ligne de rapport ;
 * le prix de la tolérance est un arbre faux.
 *
 * L'ORDRE DES COLONNES DU FICHIER, LUI, EST LIBRE : les en-têtes sont NOMMÉS, donc
 * la position ne porte aucune information. Exiger l'ordre du pack refuserait un
 * fichier dont un tableur a déplacé une colonne — un refus que l'auditeur ne
 * comprendrait pas, sur un défaut qui n'en est pas un.
 */
export const COLONNES_CSV_ARBRE = [
  'ref',
  'name',
  'kind',
  'parent_ref',
  'country_code',
  'headcount',
  'service_code',
  'sector_code',
  'timezone',
] as const;

export type ColonneCsvArbre = (typeof COLONNES_CSV_ARBRE)[number];

/** Les deux séparateurs du §35.2 : « séparateur `;` (ou `,` détecté) ». */
export const SEPARATEURS_CSV_ARBRE = [';', ','] as const;
export type SeparateurCsvArbre = (typeof SEPARATEURS_CSV_ARBRE)[number];

/**
 * Le séparateur retenu quand la détection ne tranche pas (en-tête d'une seule
 * colonne, fichier vide). `;` — c'est celui que le §35.2 nomme en premier, et
 * celui qu'un tableur francophone écrit par défaut.
 */
export const SEPARATEUR_CSV_ARBRE_DEFAUT: SeparateurCsvArbre = ';';

/**
 * NUMÉROTATION DES LIGNES DU RAPPORT — `DECISIONS.md` du 2026-09-01.
 *
 * **L'en-tête est la ligne 1**, le premier enregistrement la ligne 2. C'est la
 * numérotation du TABLEUR, et la raison est terrain : la personne qui lit le
 * rapport a le fichier ouvert dans un tableur, et c'est ce numéro-là qu'elle
 * cherche. Deux imports du même produit qui numéroteraient différemment seraient
 * un défaut à eux seuls — cette constante est donc citée, pas recopiée, par
 * l'import de la banque de questions (lot L9).
 */
export const LIGNE_ENTETE_CSV = 1;

/**
 * Nombre maximal de lignes d'enregistrement d'un import.
 *
 * Borne de PROTECTION, pas règle métier : le fil rouge FIL-GC en compte 150, et un
 * organigramme jusqu'au `poste` d'un grand groupe reste très en deçà. Elle évite
 * qu'un fichier aberrant (un export complet d'annuaire) ne fasse tourner la
 * validation en mémoire sur des centaines de milliers de lignes. Le corps HTTP est
 * déjà borné par `bodyLimit` (2 Mio, `app.ts`) — cette borne-ci est la seconde.
 */
export const LIGNES_CSV_ARBRE_MAX = 5000;

/**
 * Plafond de longueur du contenu CSV transmis. En deçà de `bodyLimit`, pour que le
 * refus soit une erreur de validation lisible plutôt qu'une coupure de connexion.
 */
export const TAILLE_CSV_ARBRE_MAX = 1_000_000;

/**
 * Nombre maximal d'erreurs DÉTAILLÉES dans un rapport (`docs/conception/LOT_L3.md`
 * §3c : « au-delà de 500, le rapport est tronqué et porte son total »).
 *
 * Le total, lui, n'est JAMAIS tronqué : `totalErreurs` dit toujours combien il y
 * en a eu. Un rapport qui tairait son propre écrêtage ferait croire à un fichier
 * presque bon.
 */
export const ERREURS_RAPPORTEES_MAX = 500;

/**
 * LES CAUSES MACHINE DU RAPPORT — le champ `code` du §35.2.
 *
 * `DECISIONS.md` du 2026-09-01, entrée `[transverse]` : « `message` est de
 * l'INTERFACE et l'invariant 5 s'y applique ; `code` est de la MACHINE et n'est
 * jamais rendu à un humain ». Ces codes sont donc stables et testables ; les
 * phrases françaises qui les accompagnent sont libres d'évoluer.
 *
 * Un code = une CAUSE, jamais une reformulation. C'est le même critère que celui
 * qui gouverne `ERROR_CODES`.
 *
 * ── LES ORTHOGRAPHES SONT CELLES DE `banque-questions.ts`, ET C'EST VOULU ────
 * Le §36.4 pose l'import de la banque « mêmes règles que §35.2 », et ce fichier-là
 * a déjà nommé les causes communes : `FICHIER_VIDE`, `ENTETE_MANQUANT`,
 * `ENTETE_INCONNU`, `ENTETE_DUPLIQUE`, `NOMBRE_DE_CHAMPS`, `VALEUR_OBLIGATOIRE`,
 * `VALEUR_HORS_ENUM`, `REFERENTIEL_INCONNU`. Les recopier à l'identique fait qu'un
 * front sachant afficher le rapport d'un import sait afficher l'autre ; en
 * inventer une seconde orthographe aurait produit deux vocabulaires pour une seule
 * chose — exactement le défaut que l'arbitrage `[transverse]` du 2026-09-01 refuse.
 * **Le nom de la constante diffère** (`_ARBRE`) parce que les deux listes ne sont
 * pas la même : un import d'arbre n'a pas de barème, un import de banque n'a pas
 * de cycle.
 */
export const CODES_DEFAUT_IMPORT_ARBRE = [
  /** Le contenu ne porte aucune ligne exploitable. */
  'FICHIER_VIDE',
  /** Plus de `LIGNES_CSV_ARBRE_MAX` enregistrements. */
  'TROP_DE_LIGNES',
  /** Une des neuf colonnes du §35.2 manque à l'en-tête. */
  'ENTETE_MANQUANT',
  /** L'en-tête porte une colonne que le §35.2 ne connaît pas. */
  'ENTETE_INCONNU',
  /** La même colonne apparaît deux fois dans l'en-tête. */
  'ENTETE_DUPLIQUE',
  /** La ligne n'a pas le nombre de cellules de l'en-tête. */
  'NOMBRE_DE_CHAMPS',
  /** Une valeur marquée obligatoire au §35.2 (`name`, `kind`) est vide. */
  'VALEUR_OBLIGATOIRE',
  /** La valeur n'appartient pas à l'énumération de la colonne. */
  'VALEUR_HORS_ENUM',
  /** La valeur dépasse la borne de saisie de la colonne. */
  'VALEUR_TROP_LONGUE',
  /** La valeur n'a pas la forme attendue (code pays, effectif, fuseau). */
  'FORMAT_INVALIDE',
  /** Deux lignes portent le même `ref` — « unique » (§35.2). */
  'REF_DUPLIQUEE',
  /** `parent_ref` ne désigne aucune ligne du fichier. */
  'PARENT_INTROUVABLE',
  /** Le rattachement referme une boucle : l'arbre n'en serait plus un. */
  'CYCLE',
  /** `service_code` / `sector_code` absent du référentiel (contrôle serveur). */
  'REFERENTIEL_INCONNU',
] as const;

export type CodeDefautImportArbre = (typeof CODES_DEFAUT_IMPORT_ARBRE)[number];

/**
 * UNE LIGNE DU RAPPORT D'ERREURS — la forme exacte du §35.2 :
 * `{ligne, colonne, code, message}`.
 *
 * `colonne` est NULLE quand le défaut ne porte sur aucune colonne en particulier
 * (une ligne au mauvais nombre de cellules, un en-tête inconnu dont le nom ne
 * figure évidemment pas dans l'énumération des neuf colonnes). Le nom fautif est
 * alors dans le `message`, à sa place : c'est la phrase que l'auditeur lit.
 */
export const ligneRapportImportSchema = z.strictObject({
  /** Numérotation TABLEUR : l'en-tête est la ligne 1. Voir `LIGNE_ENTETE_CSV`. */
  ligne: z.number().int().min(1),
  colonne: z.enum(COLONNES_CSV_ARBRE).nullable(),
  /** La cause, pour une machine. Jamais affichée. */
  code: z.enum(CODES_DEFAUT_IMPORT_ARBRE),
  /** La phrase française, affichée telle quelle (invariant 5). */
  message: z.string().min(1),
});

export type LigneRapportImport = z.infer<typeof ligneRapportImportSchema>;

/**
 * LE CORPS DE LA REQUÊTE D'IMPORT — `DECISIONS.md` du 2026-09-01.
 *
 * `application/json`, corps `{ csv: "<contenu>" }`. `multipart/form-data` aurait
 * exigé `@fastify/multipart`, absent de la liste épinglée du 11 §1 — l'ajouter est
 * une escalade, pas une décision d'agent (`CLAUDE.md` §3-1). Un corps brut
 * `text/csv` se heurtait au 11 §3 (« chaque route déclare son schéma Zod in/out » :
 * un corps brut n'a pas de schéma).
 *
 * **Conséquence assumée, écrite plutôt que tue** : un fichier mal encodé (latin-1,
 * octets invalides) ne peut pas arriver jusqu'à la route — c'est le navigateur qui
 * aura décidé du décodage. Son rejet n'est donc ni implémenté ni testé.
 */
export const importArbreRequestSchema = z.strictObject({
  csv: z.string().min(1).max(TAILLE_CSV_ARBRE_MAX),
});

export type ImportArbreRequest = z.infer<typeof importArbreRequestSchema>;

/**
 * LA CHAÎNE DE REQUÊTE — `?verification=true` = mode À BLANC.
 *
 * `docs/conception/LOT_L3.md` §3c : « `?verification=true` s'arrête après la
 * passe 1 : l'utilisateur itère sans jamais toucher la base ». Le mode à blanc
 * rapporte EXACTEMENT ce que ferait l'import réel — mêmes contrôles, même rapport,
 * même statut `200` — et n'écrit rien.
 *
 * La coercition accepte `true`/`false`, `1`/`0` : une chaîne de requête n'a pas de
 * type, et `?verification=1` est ce qu'écrivent la moitié des clients HTTP.
 * ⚠ Elle N'ACCEPTE PAS n'importe quoi : `z.stringbool` refuse `?verification=oui`
 * plutôt que de le lire comme faux. Un mode à blanc qu'on croit avoir demandé et
 * qui écrit en base est le pire défaut possible de cette route.
 */
export const importArbreQuerySchema = z.strictObject({
  verification: z.stringbool().default(false),
});

export type ImportArbreQuery = z.infer<typeof importArbreQuerySchema>;

/**
 * CE QUI S'OPPOSE À L'IMPORT RÉEL, INDÉPENDAMMENT DU FICHIER.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UN OBSTACLE D'ÉTAT N'EST PAS UN DÉFAUT DE FICHIER, ET IL NE VOYAGE PAS AVEC EUX.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le rapport du §35.2 décrit un FICHIER, ligne par ligne et colonne par colonne.
 * Un arbre déjà peuplé n'a ni ligne ni colonne : le ranger dans `erreurs[]`
 * obligerait à lui inventer un numéro de ligne et brouillerait la seule question à
 * laquelle ce tableau répond — « mon fichier est-il bon ? ». Il a donc son champ, et
 * les deux se lisent séparément : `erreurs` dit ce qu'il faut corriger DANS LE
 * FICHIER, `importReelRefuse` dit ce qu'il faut régler AVANT de le téléverser.
 *
 * Un seul obstacle existe aujourd'hui, et l'énumération reste fermée pour qu'un
 * second ne s'ajoute pas en silence sous forme de chaîne libre.
 */
export const RAISONS_REFUS_IMPORT_REEL = [
  /**
   * L'arbre de la mission porte déjà autre chose que sa racine d'office.
   * `DECISIONS.md` du 2026-09-01 : « import refusé si l'arbre porte autre chose que
   * sa racine d'office, arbre inchangé au bit près ». Le mode réel rend alors
   * `409 CONFLICT` ; le mode à blanc rend `200` et le dit ici.
   */
  'ARBRE_NON_VIDE',
] as const;

export type RaisonRefusImportReel = (typeof RAISONS_REFUS_IMPORT_REEL)[number];

/** L'obstacle, quand il y en a un : sa cause machine et sa phrase française. */
export const refusImportReelSchema = z.strictObject({
  /** Pour une machine. Jamais affiché — voir l'arbitrage `[transverse]`. */
  code: z.enum(RAISONS_REFUS_IMPORT_REEL),
  /** Phrase française, affichée telle quelle (invariant 5). */
  message: z.string().min(1),
});

export type RefusImportReel = z.infer<typeof refusImportReelSchema>;

/**
 * LE RAPPORT D'IMPORT — rendu en `200` dans les deux modes quand le fichier est
 * conforme, et en mode à blanc **même s'il ne l'est pas**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE VALIDATION À BLANC QUI TROUVE DES ERREURS REND `200`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `DECISIONS.md` du 2026-08-29 : « une validation à blanc qui trouve des erreurs a
 * RÉUSSI son travail, et rendre une erreur HTTP sur le succès d'un contrôle est une
 * incohérence qui se paie au front ». L'import RÉEL, lui, rend `422
 * IMPORT_REJECTED` avec le même rapport dans `details[]` — parce que là, le
 * document a été lu et REJETÉ.
 *
 * `200` et non `201` (`DECISIONS.md` du 2026-09-01) : un 201 engage un en-tête
 * `Location` vers LA ressource créée ; un import en crée n cent, et ce qu'il rend
 * n'est pas une ressource mais un RAPPORT.
 *
 * ── ET SI L'IMPORT RÉEL ÉTAIT DE TOUTE FAÇON IMPOSSIBLE ? ───────────────────
 * Le mode à blanc **analyse quand même le fichier** et rend **200** : un contrôle à
 * blanc ne TENTE pas l'import, il ne peut donc pas se heurter à l'état de l'arbre.
 * Mais il ne fait pas semblant non plus — `importReelRefuse` dit alors, en toutes
 * lettres, que l'import réel serait refusé et pourquoi. Sans ce champ, le rapport
 * annoncerait « 32 unités seraient créées » sur un arbre où rien ne peut être créé,
 * c'est-à-dire qu'il mentirait poliment. Avec lui, l'auditeur apprend les deux
 * choses qui l'intéressent — son fichier est-il bon, et peut-il l'importer — en un
 * seul aller-retour, et **avant** d'avoir touché à son arbre.
 */
export const rapportImportArbreSchema = z.strictObject({
  /** `true` si `?verification=true` : rien n'a été écrit, par construction. */
  verification: z.boolean(),
  /** `true` si l'arbre a RÉELLEMENT reçu les unités. Toujours `false` à blanc. */
  applique: z.boolean(),
  /**
   * L'obstacle d'ÉTAT qui interdirait l'import réel, ou `null` quand rien ne s'y
   * oppose. **Ne concerne jamais le fichier** — voir `RAISONS_REFUS_IMPORT_REEL`.
   *
   * Toujours `null` en mode réel : s'il y avait un obstacle, la requête aurait
   * rendu `409` au lieu de ce rapport. Il n'est donc renseigné qu'à blanc, et
   * c'est ce qui fait du mode à blanc une répétition honnête de l'import.
   */
  importReelRefuse: refusImportReelSchema.nullable(),
  /** Le séparateur détecté — `;` ou `,` (§35.2). */
  separateur: z.enum(SEPARATEURS_CSV_ARBRE),
  /** Lignes d'enregistrement lues : hors en-tête, hors lignes vides. */
  lignesLues: z.number().int().min(0),
  /**
   * Lignes vides SAUTÉES, et comptées — `DECISIONS.md` du 2026-09-01. Un tableur
   * en produit couramment en fin de fichier ; les refuser serait un refus
   * incompréhensible, les ignorer en silence ferait disparaître 40 lignes d'un
   * fichier de 100 sans que personne ne le voie. **Jamais d'unité fantôme.**
   */
  lignesVidesIgnorees: z.number().int().min(0),
  /** Unités que le fichier décrit — écrites si et seulement si `applique`. */
  unites: z.number().int().min(0),
  /** Le rapport §35.2, ligne par ligne. Vide = fichier conforme. */
  erreurs: z.array(ligneRapportImportSchema),
  /** Le total RÉEL, même quand `erreurs` a été écrêté à `ERREURS_RAPPORTEES_MAX`. */
  totalErreurs: z.number().int().min(0),
  erreursTronquees: z.boolean(),
});

export type RapportImportArbre = z.infer<typeof rapportImportArbreSchema>;

// =============================================================================
// LE PARSEUR — fonction PURE, sans base ni réseau
// =============================================================================

/**
 * Une ligne d'enregistrement VALIDE, telle que l'analyse la rend.
 *
 * `parentIndice` est un INDICE dans le tableau des lignes, pas un `ref` : la
 * résolution des rattachements est faite une fois, par l'analyse, et le service
 * n'a plus à la refaire. Rendre le `ref` obligerait chaque appelant à reconstruire
 * la même table de correspondance — et deux résolutions du même graphe finissent
 * par différer.
 */
export interface LigneArbreCsv {
  /** Numéro TABLEUR de la ligne dans le fichier. */
  readonly ligne: number;
  readonly ref: string | null;
  readonly name: string;
  readonly kind: TypeUniteOrg;
  /** Indice du parent dans `lignes`, ou `null` pour une racine. */
  readonly parentIndice: number | null;
  readonly countryCode: string | null;
  readonly headcount: number | null;
  readonly serviceCode: string | null;
  readonly sectorCode: string | null;
  readonly timezone: string | null;
}

/** Ce que rend l'analyse d'un contenu CSV. */
export interface AnalyseCsvArbre {
  readonly separateur: SeparateurCsvArbre;
  readonly lignesLues: number;
  readonly lignesVidesIgnorees: number;
  /**
   * Les lignes STRUCTURELLEMENT valides, dans l'ordre du fichier. Quand `erreurs`
   * est vide, `lignes.length === lignesLues` — c'est la propriété sur laquelle
   * l'import atomique s'appuie.
   */
  readonly lignes: readonly LigneArbreCsv[];
  readonly erreurs: readonly LigneRapportImport[];
}

/**
 * Marque d'ordre des octets. Un tableur qui exporte en « UTF-8 avec BOM » la place
 * en tête ; sans ce retrait, le premier en-tête s'appellerait « U+FEFF puis ref »
 * et le fichier serait refusé pour une colonne inconnue que personne ne voit à
 * l'écran.
 *
 * Retirée EN TÊTE seulement — un remplacement global effacerait un caractère
 * légitimement présent au milieu d'un nom d'unité, donc modifierait la donnée.
 */
const BOM = '\uFEFF';

/** Retire la marque d'ordre des octets si elle ouvre le contenu. */
function sansBom(contenu: string): string {
  return contenu.startsWith(BOM) ? contenu.slice(BOM.length) : contenu;
}

/**
 * Espaces retirés d'un effectif saisi. En JavaScript, la classe des espaces couvre
 * l'espace insécable et l'espace fine insécable — les deux que produit un tableur
 * francophone en écrivant « 6 500 ».
 */
const ESPACES_EFFECTIF = /\s/g;

/** Un effectif, une fois les espaces retirés : des chiffres, rien d'autre. */
const MOTIF_EFFECTIF = /^\d+$/;

/** Reconnaît une colonne du §35.2 — un GARDE de type, jamais une assertion. */
function estColonneCsvArbre(nom: string): nom is ColonneCsvArbre {
  return (COLONNES_CSV_ARBRE as readonly string[]).includes(nom);
}

/** Reconnaît un « kind » du fichier 04 — même geste, même raison. */
function estTypeUniteOrg(valeur: string): valeur is TypeUniteOrg {
  return (TYPES_UNITE_ORG as readonly string[]).includes(valeur);
}

/**
 * Détecte le séparateur sur la PREMIÈRE ligne physique du contenu.
 *
 * On compte, on ne devine pas : le séparateur est celui qui apparaît le plus dans
 * la ligne d'en-tête. À égalité — y compris zéro contre zéro, cas d'un en-tête
 * d'une seule colonne — c'est `;`, celui que le §35.2 nomme en premier.
 *
 * ⚠ La détection lit la ligne d'en-tête AVANT tout traitement des guillemets. Un
 * en-tête ne contient ni guillemet ni retour à la ligne dans aucun tableur connu ;
 * s'en remettre à un pré-parsage complet aurait exigé de connaître le séparateur,
 * ce qui est précisément la question posée.
 */
export function detecterSeparateurCsv(contenu: string): SeparateurCsvArbre {
  const premiereLigne = sansBom(contenu).split('\n', 1)[0] ?? '';
  let pointsVirgules = 0;
  let virgules = 0;
  for (const caractere of premiereLigne) {
    if (caractere === ';') pointsVirgules += 1;
    else if (caractere === ',') virgules += 1;
  }
  return virgules > pointsVirgules ? ',' : SEPARATEUR_CSV_ARBRE_DEFAUT;
}

/** Un enregistrement brut : ses cellules, et sa ligne TABLEUR de départ. */
interface EnregistrementBrut {
  readonly ligne: number;
  readonly cellules: readonly string[];
}

/**
 * Découpe un contenu CSV en enregistrements.
 *
 * Gère les guillemets doubles (`"…"`), les guillemets échappés par doublement
 * (`""`), les fins de ligne `\n` et `\r\n`, et les retours à la ligne INTERNES à un
 * champ entre guillemets. Le §35.2 ne mentionne pas les guillemets — mais tout
 * tableur en produit dès qu'une cellule contient le séparateur, et un parseur qui
 * découperait bêtement sur le séparateur casserait le nom d'une unité en deux
 * colonnes sans rien dire. On suit donc la convention universelle plutôt que la
 * lecture littérale.
 *
 * Le numéro de ligne rendu est celui de la PREMIÈRE ligne physique de
 * l'enregistrement : c'est là que l'utilisateur pose les yeux dans son tableur.
 */
function decouperEnregistrements(
  contenu: string,
  separateur: SeparateurCsvArbre,
): readonly EnregistrementBrut[] {
  const enregistrements: EnregistrementBrut[] = [];
  let cellules: string[] = [];
  let cellule = '';
  let entreGuillemets = false;
  let ligneCourante = 1;
  let ligneDebut = 1;

  const cloreEnregistrement = (): void => {
    cellules.push(cellule);
    enregistrements.push({ ligne: ligneDebut, cellules });
    cellules = [];
    cellule = '';
  };

  for (let index = 0; index < contenu.length; index += 1) {
    const caractere = contenu[index];

    if (entreGuillemets) {
      if (caractere === '"') {
        if (contenu[index + 1] === '"') {
          cellule += '"';
          index += 1;
        } else {
          entreGuillemets = false;
        }
      } else {
        if (caractere === '\n') ligneCourante += 1;
        cellule += caractere ?? '';
      }
      continue;
    }

    if (caractere === '"' && cellule === '') {
      entreGuillemets = true;
      continue;
    }

    if (caractere === separateur) {
      cellules.push(cellule);
      cellule = '';
      continue;
    }

    if (caractere === '\r') continue;

    if (caractere === '\n') {
      cloreEnregistrement();
      ligneCourante += 1;
      ligneDebut = ligneCourante;
      continue;
    }

    cellule += caractere ?? '';
  }

  // La dernière ligne d'un fichier n'a pas toujours de fin de ligne : sans ce
  // traitement, le dernier enregistrement — donc la dernière unité de l'arbre —
  // disparaîtrait en silence.
  if (cellule !== '' || cellules.length > 0 || entreGuillemets) {
    cloreEnregistrement();
  }

  return enregistrements;
}

/** Une ligne est VIDE quand toutes ses cellules le sont, une fois élaguées. */
function enregistrementVide(enregistrement: EnregistrementBrut): boolean {
  return enregistrement.cellules.every((cellule) => cellule.trim() === '');
}

/** Fabrique une entrée de rapport. Le message est déjà une phrase française. */
function defaut(
  ligne: number,
  colonne: ColonneCsvArbre | null,
  code: CodeDefautImportArbre,
  message: string,
): LigneRapportImport {
  return { ligne, colonne, code, message };
}

/**
 * Analyse l'EN-TÊTE et rend la position de chaque colonne.
 *
 * Les noms sont élagués et ramenés en minuscules : un tableur conserve la casse de
 * saisie, et refuser `Name` pour un `name` attendu serait un refus sur une
 * différence que l'utilisateur ne voit pas. Ce n'est PAS une tolérance aux
 * colonnes inconnues — celles-là sont refusées, nommément.
 */
function analyserEntete(enregistrement: EnregistrementBrut): {
  readonly positions: ReadonlyMap<ColonneCsvArbre, number>;
  readonly erreurs: readonly LigneRapportImport[];
} {
  const erreurs: LigneRapportImport[] = [];
  const positions = new Map<ColonneCsvArbre, number>();

  enregistrement.cellules.forEach((brut, index) => {
    const nom = brut.trim().toLowerCase();

    if (!estColonneCsvArbre(nom)) {
      erreurs.push(
        defaut(
          enregistrement.ligne,
          null,
          'ENTETE_INCONNU',
          `La colonne « ${nom === '' ? '(sans nom)' : nom} » n'appartient pas au format d'import de l'arbre. Colonnes attendues : ${COLONNES_CSV_ARBRE.join(', ')}.`,
        ),
      );
      return;
    }

    const colonne = nom;
    if (positions.has(colonne)) {
      erreurs.push(
        defaut(
          enregistrement.ligne,
          colonne,
          'ENTETE_DUPLIQUE',
          `La colonne « ${colonne} » apparaît plusieurs fois dans l'en-tête.`,
        ),
      );
      return;
    }

    positions.set(colonne, index);
  });

  for (const colonne of COLONNES_CSV_ARBRE) {
    if (!positions.has(colonne)) {
      erreurs.push(
        defaut(
          enregistrement.ligne,
          colonne,
          'ENTETE_MANQUANT',
          `La colonne « ${colonne} » manque à l'en-tête. Les neuf colonnes du format sont obligatoires.`,
        ),
      );
    }
  }

  return { positions, erreurs };
}

/** Valeurs élaguées d'une ligne, indexées par colonne. */
type CellulesLigne = Readonly<Record<ColonneCsvArbre, string>>;

function lireCellules(
  enregistrement: EnregistrementBrut,
  positions: ReadonlyMap<ColonneCsvArbre, number>,
): CellulesLigne {
  const lues = {} as Record<ColonneCsvArbre, string>;
  for (const colonne of COLONNES_CSV_ARBRE) {
    const index = positions.get(colonne);
    lues[colonne] = index === undefined ? '' : (enregistrement.cellules[index] ?? '').trim();
  }
  return lues;
}

/** Le brouillon d'une ligne, avant résolution des rattachements. */
interface BrouillonLigne {
  readonly ligne: number;
  readonly ref: string | null;
  readonly parentRef: string | null;
  readonly valeurs: Omit<LigneArbreCsv, 'ligne' | 'ref' | 'parentIndice'>;
}

/**
 * Contrôle les valeurs d'UNE ligne. Rend son brouillon, ou `null` si la ligne
 * porte au moins un défaut bloquant.
 *
 * ⚠ **AUCUN ARRÊT À LA PREMIÈRE ERREUR**, ni ici ni chez l'appelant : les contrôles
 * sont tous exécutés et TOUTES les erreurs de la ligne sont rapportées. Une ligne
 * dont le `kind` et le `country_code` sont faux doit se corriger en une fois.
 */
function analyserLigne(
  numeroLigne: number,
  cellules: CellulesLigne,
  erreurs: LigneRapportImport[],
): BrouillonLigne | null {
  let valide = true;

  // --- ref (facultatif ; l'unicité est vérifiée par l'appelant) --------------
  const refBrut = cellules.ref;
  if (refBrut.length > REF_CSV_LONGUEUR_MAX) {
    erreurs.push(
      defaut(
        numeroLigne,
        'ref',
        'VALEUR_TROP_LONGUE',
        `La référence de ligne dépasse ${String(REF_CSV_LONGUEUR_MAX)} caractères.`,
      ),
    );
    valide = false;
  }
  const ref = refBrut === '' ? null : refBrut;

  // --- name* -----------------------------------------------------------------
  const name = cellules.name;
  if (name === '') {
    erreurs.push(
      defaut(numeroLigne, 'name', 'VALEUR_OBLIGATOIRE', "Le nom de l'unité est obligatoire."),
    );
    valide = false;
  } else if (name.length > NOM_UNITE_LONGUEUR_MAX) {
    erreurs.push(
      defaut(
        numeroLigne,
        'name',
        'VALEUR_TROP_LONGUE',
        `Le nom de l'unité dépasse ${String(NOM_UNITE_LONGUEUR_MAX)} caractères.`,
      ),
    );
    valide = false;
  }

  // --- kind* -----------------------------------------------------------------
  //
  // AUCUN ORDRE N'EST IMPOSÉ ENTRE LES SEPT TYPES — `DECISIONS.md` du 2026-09-01 :
  // « une direction rattachée à un établissement d'un groupe est ordinaire, une
  // équipe directement sous un groupe l'est aussi dans une TPE. Un contrôle inventé
  // qui refuse du vrai coûte plus cher qu'un contrôle absent. »
  const kindBrut = cellules.kind.toLowerCase();
  let kind: TypeUniteOrg | null = null;
  if (kindBrut === '') {
    erreurs.push(
      defaut(numeroLigne, 'kind', 'VALEUR_OBLIGATOIRE', "Le type de l'unité est obligatoire."),
    );
    valide = false;
  } else if (!estTypeUniteOrg(kindBrut)) {
    erreurs.push(
      defaut(
        numeroLigne,
        'kind',
        'VALEUR_HORS_ENUM',
        `Le type « ${kindBrut} » n'existe pas. Types admis : ${TYPES_UNITE_ORG.join(' | ')}.`,
      ),
    );
    valide = false;
  } else {
    kind = kindBrut;
  }

  // --- parent_ref (résolu par l'appelant, qui seul voit tout le fichier) -----
  const parentRefBrut = cellules.parent_ref;
  const parentRef = parentRefBrut === '' ? null : parentRefBrut;
  if (parentRef !== null && ref !== null && parentRef === ref) {
    erreurs.push(
      defaut(
        numeroLigne,
        'parent_ref',
        'CYCLE',
        `L'unité « ${parentRef} » est déclarée comme son propre parent.`,
      ),
    );
    valide = false;
  }

  // --- country_code ----------------------------------------------------------
  let countryCode: string | null = null;
  if (cellules.country_code !== '') {
    const analyse = codePaysSchema.safeParse(cellules.country_code);
    if (analyse.success) {
      countryCode = analyse.data;
    } else {
      erreurs.push(
        defaut(
          numeroLigne,
          'country_code',
          'FORMAT_INVALIDE',
          'Le code pays doit être un code ISO 3166-1 alpha-2 (par exemple FR).',
        ),
      );
      valide = false;
    }
  }

  // --- headcount -------------------------------------------------------------
  let headcount: number | null = null;
  if (cellules.headcount !== '') {
    // Les espaces sont retirés (`6 500` est ce qu'écrit un tableur francophone),
    // mais NI le point NI la virgule : `6.500` est ambigu — millier ou décimal ? —
    // et deviner ici écrirait un effectif faux sans que rien ne le signale.
    const compact = cellules.headcount.replace(ESPACES_EFFECTIF, '');
    if (!MOTIF_EFFECTIF.test(compact)) {
      erreurs.push(
        defaut(
          numeroLigne,
          'headcount',
          'FORMAT_INVALIDE',
          "L'effectif doit être un nombre entier positif, sans séparateur de milliers autre que l'espace.",
        ),
      );
      valide = false;
    } else {
      const valeur = Number(compact);
      if (valeur > EFFECTIF_UNITE_MAX) {
        erreurs.push(
          defaut(
            numeroLigne,
            'headcount',
            'FORMAT_INVALIDE',
            `L'effectif dépasse la valeur maximale admise (${String(EFFECTIF_UNITE_MAX)}).`,
          ),
        );
        valide = false;
      } else {
        headcount = valeur;
      }
    }
  }

  // --- service_code / sector_code -------------------------------------------
  //
  // Seule la FORME est contrôlée ici. L'EXISTENCE dans les référentiels (`services`,
  // `sectors`) est un contrôle de base, fait par le service — un paquet partagé qui
  // part dans un navigateur n'a pas de référentiel à interroger.
  const codes: { serviceCode: string | null; sectorCode: string | null } = {
    serviceCode: null,
    sectorCode: null,
  };
  for (const [colonne, cle] of [
    ['service_code', 'serviceCode'],
    ['sector_code', 'sectorCode'],
  ] as const) {
    const brut = cellules[colonne];
    if (brut === '') continue;
    const analyse = codeReferentielSchema.safeParse(brut.toLowerCase());
    if (analyse.success) {
      codes[cle] = analyse.data;
    } else {
      erreurs.push(
        defaut(
          numeroLigne,
          colonne,
          'FORMAT_INVALIDE',
          `Le code « ${brut} » n'a pas la forme d'un code de référentiel (minuscules, chiffres et tirets bas).`,
        ),
      );
      valide = false;
    }
  }

  // --- timezone --------------------------------------------------------------
  let timezone: string | null = null;
  if (cellules.timezone !== '') {
    const analyse = fuseauIanaSchema.safeParse(cellules.timezone);
    if (analyse.success) {
      timezone = analyse.data;
    } else {
      erreurs.push(
        defaut(
          numeroLigne,
          'timezone',
          'FORMAT_INVALIDE',
          `Le fuseau horaire « ${cellules.timezone} » n'est pas un identifiant IANA connu (par exemple Europe/Paris). Laissez la cellule vide pour hériter du fuseau de la mission.`,
        ),
      );
      valide = false;
    }
  }

  if (!valide || kind === null) return null;

  return {
    ligne: numeroLigne,
    ref,
    parentRef,
    valeurs: { name, kind, countryCode, headcount, ...codes, timezone },
  };
}

/**
 * Le `ref` d'une ligne dont l'analyse a ÉCHOUÉ.
 *
 * Une ligne fautive garde le droit d'occuper sa référence : sans cette lecture de
 * secours, un fichier où la même référence est portée deux fois — dont une sur une
 * ligne par ailleurs invalide — ne signalerait pas le doublon, et l'utilisateur
 * corrigerait la première erreur pour en découvrir une seconde au tour suivant.
 * Rend `null` quand la ligne n'a même pas le bon nombre de cellules : là, on ne
 * sait plus quelle cellule est laquelle, et deviner écrirait une fausse référence.
 */
function refDeSecours(
  enregistrement: EnregistrementBrut,
  entete: EnregistrementBrut,
  positions: ReadonlyMap<ColonneCsvArbre, number>,
): string | null {
  if (enregistrement.cellules.length !== entete.cellules.length) return null;
  const ref = lireCellules(enregistrement, positions).ref;
  return ref === '' ? null : ref;
}

/**
 * ANALYSE COMPLÈTE D'UN CONTENU CSV — passe 1 de l'import, **entièrement en
 * mémoire, zéro écriture**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * L'ATOMICITÉ ET L'EXHAUSTIVITÉ NE SE CONTREDISENT PAS : LA VALIDATION N'ÉCRIT PAS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * §35.2 : « import ATOMIQUE (une erreur = rien d'importé + rapport d'erreurs ligne
 * par ligne) ». Les deux exigences tiennent ensemble parce que cette fonction
 * évalue TOUTES les lignes sans jamais toucher la base : un fichier de 1 000 lignes
 * dont la 900ᵉ est fautive rend 1 000 lignes évaluées, une erreur rapportée, et
 * zéro unité créée.
 *
 * ── L'ORDRE DES CONTRÔLES ───────────────────────────────────────────────────
 *  1. contenu non vide ;
 *  2. en-tête — s'il est invalide, on s'arrête : sans correspondance
 *     colonne → position, analyser les lignes reviendrait à inventer des erreurs
 *     de valeur sur des cellules lues au mauvais endroit ;
 *  3. lignes vides sautées et COMPTÉES (jamais d'unité fantôme) ;
 *  4. valeurs de chaque ligne, toutes contrôlées ;
 *  5. unicité des `ref` ;
 *  6. résolution des `parent_ref` — contre TOUS les `ref` du fichier, y compris
 *     ceux de lignes fautives : sinon une seule ligne cassée ferait cascader
 *     « parent introuvable » sur toute sa descendance et noierait la cause réelle ;
 *  7. absence de cycle.
 */
export function analyserCsvArbre(contenu: string): AnalyseCsvArbre {
  const separateur = detecterSeparateurCsv(contenu);
  const erreurs: LigneRapportImport[] = [];
  const enregistrements = decouperEnregistrements(sansBom(contenu), separateur);

  const nonVides = enregistrements.filter((e) => !enregistrementVide(e));
  const entete = nonVides[0];
  if (entete === undefined) {
    return {
      separateur,
      lignesLues: 0,
      lignesVidesIgnorees: enregistrements.length,
      lignes: [],
      erreurs: [
        defaut(
          LIGNE_ENTETE_CSV,
          null,
          'FICHIER_VIDE',
          "Le fichier ne contient aucune ligne : la première ligne doit porter l'en-tête des neuf colonnes.",
        ),
      ],
    };
  }

  // ② L'en-tête. Une erreur ici arrête l'analyse — voir l'en-tête de la fonction.
  const { positions, erreurs: erreursEntete } = analyserEntete(entete);
  if (erreursEntete.length > 0) {
    return {
      separateur,
      lignesLues: 0,
      lignesVidesIgnorees: 0,
      lignes: [],
      erreurs: erreursEntete,
    };
  }

  // ③ Les enregistrements de données, lignes vides écartées et comptées.
  const apresEntete = enregistrements.filter((e) => e.ligne > entete.ligne);
  const donnees = apresEntete.filter((e) => !enregistrementVide(e));
  const lignesVidesIgnorees = apresEntete.length - donnees.length;

  // UN EN-TÊTE SEUL N'EST PAS UN IMPORT RÉUSSI DE ZÉRO UNITÉ.
  //
  // Formellement, un fichier réduit à sa ligne d'en-tête ne porte aucune erreur : il
  // n'a rien à contrôler. Le laisser passer rendrait pourtant « import réussi, 0
  // unité créée », c'est-à-dire un SUCCÈS pour quelqu'un qui vient de téléverser le
  // mauvais fichier ou un export vide — et qui découvrirait l'arbre absent bien plus
  // tard, au moment de figer son questionnaire. On refuse, avec le même code que le
  // fichier réellement vide : dans les deux cas, il n'y a aucune unité à importer.
  if (donnees.length === 0) {
    return {
      separateur,
      lignesLues: 0,
      lignesVidesIgnorees,
      lignes: [],
      erreurs: [
        defaut(
          LIGNE_ENTETE_CSV,
          null,
          'FICHIER_VIDE',
          "Le fichier ne contient aucune ligne d'unité sous son en-tête : il n'y a rien à importer.",
        ),
      ],
    };
  }

  if (donnees.length > LIGNES_CSV_ARBRE_MAX) {
    return {
      separateur,
      lignesLues: donnees.length,
      lignesVidesIgnorees,
      lignes: [],
      erreurs: [
        defaut(
          LIGNE_ENTETE_CSV,
          null,
          'TROP_DE_LIGNES',
          `Le fichier contient ${String(donnees.length)} lignes ; le maximum admis par import est ${String(LIGNES_CSV_ARBRE_MAX)}.`,
        ),
      ],
    };
  }

  // ④ Les valeurs, ligne par ligne.
  const brouillons: (BrouillonLigne | null)[] = [];
  for (const enregistrement of donnees) {
    if (enregistrement.cellules.length !== entete.cellules.length) {
      erreurs.push(
        defaut(
          enregistrement.ligne,
          null,
          'NOMBRE_DE_CHAMPS',
          `Cette ligne porte ${String(enregistrement.cellules.length)} cellules ; l'en-tête en déclare ${String(entete.cellules.length)}.`,
        ),
      );
      brouillons.push(null);
      continue;
    }
    brouillons.push(
      analyserLigne(enregistrement.ligne, lireCellules(enregistrement, positions), erreurs),
    );
  }

  // ⑤ Unicité des `ref`, et ⑥ table de résolution des `parent_ref`.
  //
  // ═══════════════════════════════════════════════════════════════════════════════
  // LA TABLE ACCUEILLE TOUS LES `ref` DU FICHIER, Y COMPRIS CEUX DE LIGNES FAUTIVES.
  // ═══════════════════════════════════════════════════════════════════════════════
  // C'est la condition pour qu'une erreur de VALEUR ne se propage pas en fausses
  // erreurs de RATTACHEMENT sur toute une branche. Le défaut a été mesuré : un
  // fichier où la ligne 2 oublie son nom et où la ligne 3 s'y rattache rendait
  // `VALEUR_OBLIGATOIRE` **et** `PARENT_INTROUVABLE` — l'auditeur corrigeait la
  // première, découvrait que la seconde n'avait jamais existé, et perdait confiance
  // dans le rapport entier. Une ligne fautive garde donc le droit d'OCCUPER sa
  // référence : elle est bien présente dans le fichier, c'est sa VALEUR qui cloche,
  // et ce sont deux défauts distincts qui se corrigent à deux endroits distincts.
  //
  // `PARENT_INTROUVABLE` ne signale donc plus qu'une seule chose, et c'est
  // exactement ce que son nom dit : **aucune ligne du fichier ne porte cette
  // référence.**
  const parRef = new Map<string, number>();
  const refsVus = new Set<string>();
  donnees.forEach((enregistrement, index) => {
    const brouillon = brouillons[index] ?? null;
    const ref =
      brouillon === null ? refDeSecours(enregistrement, entete, positions) : brouillon.ref;
    if (ref === null) return;

    if (refsVus.has(ref)) {
      erreurs.push(
        defaut(
          enregistrement.ligne,
          'ref',
          'REF_DUPLIQUEE',
          `La référence « ${ref} » est utilisée par plusieurs lignes ; elle doit être unique.`,
        ),
      );
      return;
    }
    refsVus.add(ref);
    // INCONDITIONNEL — voir le bloc ci-dessus. En cas de `ref` dupliquée, c'est la
    // PREMIÈRE occurrence qui occupe la référence (le `return` ci-dessus l'a déjà
    // garanti) : un rattachement ne change pas de cible selon l'ordre des erreurs.
    parRef.set(ref, index);
  });

  // ⑥ Résolution des rattachements.
  const parents: (number | null)[] = brouillons.map(() => null);
  brouillons.forEach((brouillon, index) => {
    if (brouillon?.parentRef == null) return;
    const cible = parRef.get(brouillon.parentRef);
    if (cible === undefined) {
      // AUCUNE ligne du fichier ne porte cette référence — ni valide, ni fautive.
      // C'est le seul cas où ce défaut est prononcé, et le message le dit sans
      // nuance : l'auditeur cherche une référence qu'il n'a pas écrite.
      erreurs.push(
        defaut(
          brouillon.ligne,
          'parent_ref',
          'PARENT_INTROUVABLE',
          `Le rattachement « ${brouillon.parentRef} » ne correspond à aucune ligne du fichier.`,
        ),
      );
      brouillons[index] = null;
      return;
    }
    parents[index] = cible;
  });

  // ⑦ Cycles. Remontée bornée : un arbre corrompu ne doit jamais faire boucler.
  //
  // ⚠ LIMITE ÉCRITE PLUTÔT QUE SUPPOSÉE : la remontée s'arrête sur une ligne
  // FAUTIVE, qui n'a pas de parent résolu. Un cycle passant par une telle ligne
  // n'est donc pas signalé — sans conséquence : le fichier porte déjà l'erreur qui
  // l'a rendue fautive, donc l'import est rejeté en bloc, et cette ligne n'entre
  // pas dans `lignes`. Le cycle se révélera au ré-import, une fois la valeur
  // corrigée.
  brouillons.forEach((brouillon, index) => {
    if (brouillon === null) return;
    let courant = parents[index] ?? null;
    let profondeur = 0;
    while (courant !== null && profondeur <= PROFONDEUR_ARBRE_MAX) {
      if (courant === index) {
        erreurs.push(
          defaut(
            brouillon.ligne,
            'parent_ref',
            'CYCLE',
            "Ce rattachement referme une boucle : l'unité descendrait d'elle-même.",
          ),
        );
        brouillons[index] = null;
        return;
      }
      courant = parents[courant] ?? null;
      profondeur += 1;
    }
    if (profondeur > PROFONDEUR_ARBRE_MAX) {
      erreurs.push(
        defaut(
          brouillon.ligne,
          'parent_ref',
          'CYCLE',
          `La chaîne de rattachement dépasse ${String(PROFONDEUR_ARBRE_MAX)} niveaux : le fichier décrit vraisemblablement une boucle.`,
        ),
      );
      brouillons[index] = null;
    }
  });

  // Les indices manipulés jusqu'ici sont ceux des ENREGISTREMENTS lus ; `lignes` ne
  // porte que les lignes retenues. Les deux numérotations divergent dès qu'une ligne
  // est écartée, et `LigneArbreCsv.parentIndice` promet « un indice dans `lignes` » :
  // on REMAPPE, au lieu de rendre un indice qui pointerait à côté.
  //
  // Un parent ÉCARTÉ (ligne fautive) rend `parentIndice: null`. Ce cas n'existe que
  // lorsque `erreurs` n'est pas vide — donc quand l'import est de toute façon rejeté
  // et que `lignes` n'a aucun usage. On préfère un `null` honnête à un indice qui
  // désignerait une autre unité que celle voulue.
  const retenus = brouillons.map((brouillon) => brouillon !== null);
  const indiceDansLignes = new Map<number, number>();
  let rang = 0;
  retenus.forEach((retenu, index) => {
    if (!retenu) return;
    indiceDansLignes.set(index, rang);
    rang += 1;
  });

  const lignes: LigneArbreCsv[] = [];
  brouillons.forEach((brouillon, index) => {
    if (brouillon === null) return;
    const parent = parents[index] ?? null;
    lignes.push({
      ligne: brouillon.ligne,
      ref: brouillon.ref,
      parentIndice: parent === null ? null : (indiceDansLignes.get(parent) ?? null),
      ...brouillon.valeurs,
    });
  });

  return {
    separateur,
    lignesLues: donnees.length,
    lignesVidesIgnorees,
    // Quand des erreurs subsistent, `lignes` n'a AUCUN usage : l'import est rejeté
    // en bloc. On le rend quand même tel quel plutôt que vide — un rapport dont les
    // données disparaissent selon le verdict est un rapport qu'on ne peut pas
    // déboguer.
    lignes,
    erreurs,
  };
}

/**
 * Écrête un rapport à `ERREURS_RAPPORTEES_MAX` entrées et rend le total réel.
 *
 * Séparée de l'analyse, parce que l'écrêtage est une décision de PRÉSENTATION : la
 * passe 1 doit tout voir pour décider du rejet, l'utilisateur n'a pas besoin de
 * lire 12 000 lignes pour comprendre que son fichier est du mauvais format.
 */
export function ecreterRapport(erreurs: readonly LigneRapportImport[]): {
  readonly erreurs: readonly LigneRapportImport[];
  readonly totalErreurs: number;
  readonly erreursTronquees: boolean;
} {
  return {
    erreurs: erreurs.slice(0, ERREURS_RAPPORTEES_MAX),
    totalErreurs: erreurs.length,
    erreursTronquees: erreurs.length > ERREURS_RAPPORTEES_MAX,
  };
}
