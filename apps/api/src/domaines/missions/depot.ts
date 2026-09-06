// =============================================================================
// DÉPÔT DES MISSIONS — `missions`, plus les TROIS lectures dont la machine à états
// a besoin pour mesurer ses conditions (`step_validations`, `mission_questions`)
// et l'écriture de l'unité racine (`org_units`). Lot L3, incrément L3b.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS, ET C'EST VOULU ─────────────────────────────
//   · **il ne décide d'aucune transition.** Il sait poser un statut ; il ne sait
//     pas si on avait le droit. Le §32.2 vit dans `TRANSITIONS_MISSION`
//     (`packages/shared`) et s'applique dans le SERVICE — jamais ici, jamais dans
//     un `CHECK`, jamais dans un trigger (`docs/conception/LOT_L3.md` §3b) ;
//   · il ne journalise rien : la porte d'écriture unique est
//     `domaines/journal/service.ts`, appelée par le service APRÈS le succès ;
//   · il ne rend JAMAIS une mission supprimée. `missions.deleted_at` existe au
//     fichier 04 ; toutes les lectures filtrent `deleted_at IS NULL`, une fois,
//     ici — un filtre laissé à chaque appelant est un filtre qu'un appelant
//     oubliera ;
//   · **il ne touche pas une colonne de `scoping_financials`.** Aucune donnée
//     financière ne transite par une route missions (invariant 3).
// Traçabilité : E39 (Machine à états mission) · E24 (Validation obligatoire de
// chaque étape — la lecture de `step_validations`) · E4 (Arbre organisationnel
// profondeur libre — la racine créée d'office, §16.2) · E30 (3 niveaux d'audit —
// `missions.audit_level`) · E43 (Exécutabilité autopilote — conventions d'API,
// pagination keyset).
// =============================================================================
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PgInsertValue } from 'drizzle-orm/pg-core';
import {
  AppError,
  codesReferentielStockesSchema,
  type CodeConditionMission,
  type FournisseurLlmMission,
  type NiveauAuditMission,
  type OffreCommercialeMission,
  type PaginationQuery,
  type PerimetreGeoMission,
  type StatutMission,
  type TypeUniteOrg,
} from '@axion/shared';
import { db } from '../../db.js';
import { companies, missions, orgUnits, stepValidations } from '../../db/schema.js';
import {
  conditionApresCurseur,
  limiteAChercher,
  ordreDuCurseur,
  paginerParCurseur,
  type DefinitionCurseur,
  type PageCurseur,
} from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';
// L'UNIQUE comptage des questions figées vit chez L3d (brief L3D §9-8) : ce dépôt
// le CONSOMME, il ne le duplique pas. L'import ne crée aucun cycle — le dépôt du
// questionnaire ne connaît pas celui des missions, il lit `missions` directement.
import { compterQuestionsFigees } from '../questionnaire/depot.js';

// -----------------------------------------------------------------------------
// LA LIGNE
// -----------------------------------------------------------------------------

/**
 * Une mission telle que la console a le droit de la voir.
 *
 * `deletedAt` n'y figure PAS : aucune lecture de ce dépôt ne rend une mission
 * supprimée, donc le champ ne porterait jamais que `null`. Un champ qui ne prend
 * qu'une valeur invite à croire qu'il en prend d'autres.
 *
 * Les trois `*Planned` / `ndaSignedAt` sont des **chaînes** `AAAA-MM-JJ` : le 04
 * les déclare `DATE`, et Drizzle rend une `date()` sans configuration en mode
 * chaîne. Les convertir en `Date` leur donnerait une heure — donc un fuseau — que
 * la donnée n'a pas, et une date de début planifié basculerait d'un jour à
 * l'affichage au fuseau de mission (§22.2).
 */
export interface LigneMission {
  readonly id: string;
  readonly companyId: string;
  readonly parentMissionId: string | null;
  readonly title: string;
  readonly geoScope: PerimetreGeoMission;
  readonly countryCode: string | null;
  readonly sizeTierId: string | null;
  readonly activeSectors: readonly string[];
  readonly activeBlocks: readonly string[];
  readonly auditLevel: NiveauAuditMission;
  readonly commercialOffer: OffreCommercialeMission | null;
  readonly timezone: string;
  readonly ndaRef: string | null;
  readonly ndaSignedAt: string | null;
  readonly status: StatutMission;
  readonly llmProvider: FournisseurLlmMission;
  readonly startPlanned: string | null;
  readonly endPlanned: string | null;
  readonly deliveredAt: Date | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Les colonnes rendues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_MISSION = {
  id: missions.id,
  companyId: missions.companyId,
  parentMissionId: missions.parentMissionId,
  title: missions.title,
  geoScope: missions.geoScope,
  countryCode: missions.countryCode,
  sizeTierId: missions.sizeTierId,
  activeSectors: missions.activeSectors,
  activeBlocks: missions.activeBlocks,
  auditLevel: missions.auditLevel,
  commercialOffer: missions.commercialOffer,
  timezone: missions.timezone,
  ndaRef: missions.ndaRef,
  ndaSignedAt: missions.ndaSignedAt,
  status: missions.status,
  llmProvider: missions.llmProvider,
  startPlanned: missions.startPlanned,
  endPlanned: missions.endPlanned,
  deliveredAt: missions.deliveredAt,
  createdBy: missions.createdBy,
  createdAt: missions.createdAt,
  updatedAt: missions.updatedAt,
};

/** Ce que Drizzle rend réellement : les deux JSONB traversent en `unknown`. */
type LigneBrute = Omit<LigneMission, 'activeSectors' | 'activeBlocks'> & {
  readonly activeSectors: unknown;
  readonly activeBlocks: unknown;
};

/**
 * Valide les deux JSONB au lieu de les asserter.
 *
 * `jsonb` traverse Drizzle en `unknown`, et un `as string[]` mentirait au
 * compilateur exactement là où la donnée vient de la base plutôt que du type — même
 * geste que `companies.countries` et que `scoping.daily_rates`. Une colonne qui ne
 * contiendrait pas un tableau de chaînes est une CORRUPTION, pas une entrée
 * d'utilisateur : elle sort en 500, bruyamment, plutôt qu'en liste vide silencieuse
 * qui ferait disparaître des blocs actifs d'une mission sans que personne ne le voie
 * — et un bloc disparu, c'est un questionnaire amputé au figeage.
 */
function versLigne(brut: LigneBrute): LigneMission {
  const secteurs = codesReferentielStockesSchema.safeParse(brut.activeSectors);
  const blocs = codesReferentielStockesSchema.safeParse(brut.activeBlocks);
  if (!secteurs.success || !blocs.success) {
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return { ...brut, activeSectors: secteurs.data, activeBlocks: blocs.data };
}

// -----------------------------------------------------------------------------
// LISTE — pagination keyset
// -----------------------------------------------------------------------------

/**
 * La ligne paginée : la mission, plus la composante TEXTUELLE EXACTE du curseur.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI ON NE DÉRIVE **PAS** LE CURSEUR DE `createdAt.toISOString()`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le piège est MESURÉ, et il est écrit au long dans `domaines/users/depot.ts` :
 * PostgreSQL garde des MICROSECONDES dans un `TIMESTAMPTZ`, la `Date` de JavaScript
 * s'arrête à la MILLISECONDE. Un curseur reconstruit depuis la `Date` est donc
 * STRICTEMENT INFÉRIEUR à la valeur réelle, la clause `(created_at, id) > (…)`
 * REPREND la ligne frontière à chaque page, et si `limit` missions partagent la même
 * milliseconde — ce que la fixture FIL-GC produit sans effort, elle qui insère en
 * lots — la pagination BOUCLE. On lit donc `created_at::text`, en SQL.
 * `companies` échappait à ce piège parce que sa composante est un `TEXT` ; ici la
 * composante est un horodatage, et la règle du module de pagination s'applique.
 */
interface LigneMissionPaginee extends LigneMission {
  readonly curseurCreatedAt: string;
}

/** Idem, avant validation des JSONB. */
type LigneBrutePaginee = LigneBrute & { readonly curseurCreatedAt: string };

/**
 * Le curseur de `GET /v1/missions` : **`(created_at, id)`, ascendant** — figé par
 * `docs/conception/LOT_L3.md` §2, qui l'écrit route par route.
 *
 * ── LES TROIS EXIGENCES DU MODULE DE PAGINATION, VÉRIFIÉES ICI ──────────────
 *  1. « les colonnes du curseur sont NOT NULL » : `missions.created_at`
 *     (`NOT NULL DEFAULT now()`) et `missions.id` (clé primaire) le sont
 *     (migration `0002`). Une composante nulle rendrait la comparaison de n-uplets
 *     NULL, donc AUCUNE ligne, donc une liste qui s'arrête à la première page ;
 *  2. « la DERNIÈRE clé est unique » : `id` est la clé primaire. Indispensable :
 *     **deux missions homonymes créées dans la même milliseconde sont légitimes**
 *     (un import, une déclinaison par pays §2.4), et sans l'`id` l'ordre ne serait
 *     pas total ;
 *  3. « l'index qui sert le tri couvre les mêmes colonnes » : **IL N'EXISTE PAS.**
 *     Le §7.1 du fichier 04 prévoit `missions(company_id)`, `missions(status)` et
 *     `missions(parent_mission_id)` — aucun sur `(created_at, id)`. Le tri est donc
 *     servi par un tri en mémoire : correct, et lent au-delà de quelques milliers
 *     de missions — sans effet mesurable au volume de la Phase 1 (FIL-GC porte 150
 *     UNITÉS, pas 150 missions). L'ajouter toucherait le fichier 04, donc une
 *     escalade (`CLAUDE.md` §3-2) : c'est REMONTÉ, pas ajouté.
 *
 * ⚠ ORDRE ASCENDANT : la plus ancienne d'abord. C'est le même sens que `users`, et
 * le contraire d'un « fil d'actualité ». Une console d'audit se lit dans l'ordre où
 * les missions sont nées ; inverser demanderait un `sens: 'desc'` — un mot, mais
 * une décision de produit que le pack ne prend pas.
 */
const CURSEUR_MISSIONS: DefinitionCurseur<LigneMissionPaginee> = {
  ressource: 'missions',
  sens: 'asc',
  cles: [
    { colonne: missions.createdAt, valeur: (ligne) => ligne.curseurCreatedAt },
    { colonne: missions.id, valeur: (ligne) => ligne.id },
  ],
};

/**
 * Une page de missions, de la plus ancienne à la plus récente.
 *
 * AUCUN FILTRE, et c'est le même choix qu'au référentiel client : le pack n'en
 * nomme aucun sur `CRUD /v1/missions` (05 §8.3). En inventer — par statut, par
 * entreprise — serait inventer du produit ; les ajouter plus tard n'est qu'une
 * extension du schéma de requête (`paginationQuerySchema.extend({ … })`), pas une
 * reprise de cette fonction. Les deux index du 04 (`company_id`, `status`) les
 * attendent déjà.
 *
 * ⚠ AUCUN CADRAGE PAR UTILISATEUR ICI, et il faut dire pourquoi plutôt que de
 * laisser croire à un oubli : la route est `roles: ['admin']` (03 §34.1, « la
 * console est ADMIN SEUL » en V1), et un administrateur voit toutes les missions.
 * Le jour où le lead entrera dans la console (§34.1, Phase 2), le filtrage par
 * `mission_users` se posera ICI, dans le `where` — pas dans la politique de route,
 * qui « dit QUI ENTRE, pas CE QUE LE SQL RAMÈNE » (`auth/politique.ts`).
 */
export async function listerMissions(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneMission>> {
  const lignes: LigneBrutePaginee[] = await db
    .select({
      ...COLONNES_MISSION,
      curseurCreatedAt: sql<string>`${missions.createdAt}::text`,
    })
    .from(missions)
    .where(
      and(isNull(missions.deletedAt), conditionApresCurseur(CURSEUR_MISSIONS, pagination.after)),
    )
    .orderBy(...ordreDuCurseur(CURSEUR_MISSIONS))
    .limit(limiteAChercher(pagination));

  const page = paginerParCurseur(
    CURSEUR_MISSIONS,
    pagination,
    lignes.map((brut) => ({ ...versLigne(brut), curseurCreatedAt: brut.curseurCreatedAt })),
  );

  return { items: page.items, nextCursor: page.nextCursor };
}

// -----------------------------------------------------------------------------
// LECTURES UNITAIRES
// -----------------------------------------------------------------------------

/** Lit une mission par clé primaire. Rend `null` si elle n'existe pas ou est supprimée. */
export async function lireMission(id: string): Promise<LigneMission | null> {
  const lignes = await db
    .select(COLONNES_MISSION)
    .from(missions)
    .where(and(eq(missions.id, id), isNull(missions.deletedAt)))
    .limit(1);

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * Lit une mission ET LA VERROUILLE jusqu'à la fin de la transaction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'EST LE VERROU QUI TIENT LA MACHINE À ÉTATS, PAS LE CODE QUI LA LIT.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Une transition est un lire-décider-écrire. Sans `FOR UPDATE`, deux demandes
 * concurrentes lisent le MÊME `depuis`, jugent toutes deux valides, et écrivent
 * toutes deux : une mission passerait `preparation → en_cours` puis
 * `en_cours → en_analyse` alors que la seconde a été jugée sur un état déjà périmé,
 * et `activity_log` porterait deux lignes dont l'une décrit une transition qui n'a
 * jamais eu lieu depuis l'état qu'elle nomme. `docs/conception/LOT_L3.md` §3b le
 * dit en une phrase : « la concurrence est tenue par `FOR UPDATE` ».
 * La même raison vaut pour le `PATCH`, comme pour `companies` : on a besoin de
 * l'état AVANT pour savoir quels champs changent réellement, et c'est cette liste
 * de champs — et elle seule — que `mission.update` écrit dans le journal.
 */
export async function lireMissionPourEcriture(
  executeur: ExecuteurSql,
  id: string,
): Promise<LigneMission | null> {
  const lignes = await executeur
    .select(COLONNES_MISSION)
    .from(missions)
    .where(and(eq(missions.id, id), isNull(missions.deletedAt)))
    .limit(1)
    .for('update');

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

// -----------------------------------------------------------------------------
// LES CONDITIONS DU §32.2 — MESURÉES, PAS SUPPOSÉES
// -----------------------------------------------------------------------------

/**
 * Les codes d'étape de PORTÉE MISSION que la machine à états interroge.
 *
 * Les huit codes de `step_validations.step_code` sont un CHECK fermé du 04 ;
 * `entretien` et `unite` ont une autre portée (respectivement `interview` et
 * `org_unit`, cohérence garantie par une CHECK composite en base) et ne
 * conditionnent aucune transition de mission. `analyse` et `rapport` sont des
 * étapes du pilote (§17.2) que le §32.2 ne met en condition d'aucune transition :
 * on ne les lit donc pas, plutôt que de les lire « au cas où ».
 */
const ETAPES_MISSION_LUES = ['cadrage', 'preparation', 'collecte', 'livraison'] as const;

/**
 * Les étapes de portée mission VALIDÉES pour cette mission.
 *
 * ⚠ **UNE SEULE LIGNE SUFFIT.** `step_validations` n'a aucune contrainte d'unicité
 * sur `(mission_id, step_code)` au fichier 04 — seulement un INDEX. Plusieurs
 * validations d'une même étape sont donc possibles (re-validation après un retour
 * arrière : c'est même le comportement attendu, invariant 7, « on ajoute, on
 * n'écrase pas »). La condition du §32.2 est « étape validée », c'est-à-dire
 * « il EXISTE une validation » — pas « il en existe exactement une ».
 *
 * `scope = 'mission'` est exigé explicitement : sans ce filtre, une validation
 * d'entretien portant par erreur `step_code = 'collecte'` ferait franchir une
 * transition de mission. La CHECK composite du 04 l'interdit déjà en base ; on ne
 * s'appuie pas sur elle pour ne pas la lire — deux ceintures, pas une.
 */
export async function lireEtapesValidees(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<ReadonlySet<string>> {
  const lignes = await executeur
    .selectDistinct({ stepCode: stepValidations.stepCode })
    .from(stepValidations)
    .where(
      and(
        eq(stepValidations.missionId, missionId),
        eq(stepValidations.scope, 'mission'),
        inArray(stepValidations.stepCode, [...ETAPES_MISSION_LUES]),
      ),
    );

  return new Set(lignes.map((ligne) => ligne.stepCode));
}

/**
 * Le questionnaire de cette mission est-il FIGÉ ?
 *
 * `docs/conception/LOT_L3.md` §3a, verbatim : « Il n'y a **pas de colonne “figé”** :
 * l'existence des lignes EST la preuve ».
 *
 * ⚠ **LE COMPTAGE N'EST PLUS FAIT ICI** (lot L3d, brief §9-8, « une seule
 * implémentation, chez L3d ; L3b la consomme, ne la duplique pas »). Cette fonction
 * délègue à `compterQuestionsFigees` et se contente de traduire le nombre en
 * booléen. Ce qu'on y gagne : le refus de figer deux fois (409, qui doit NOMMER le
 * compte) et la condition `questionnaire_fige` du §32.2 répondent désormais à la
 * même question par le même chemin — deux comptages auraient fini par diverger, et
 * le jour où ils divergent, une mission passe en collecte avec un questionnaire que
 * le figeage croit absent.
 *
 * Ce qu'on y perd, et il faut le dire : l'ancien `limit(1)` s'arrêtait à la première
 * ligne là où `count(*)` parcourt l'index de `mission_id`. Sur les ~240 questions
 * d'une mission de grand compte, c'est un index scan de quelques centaines
 * d'entrées, sur un chemin emprunté une fois par transition de statut — mesurable
 * en microsecondes, et payé pour une garantie d'unicité de la règle.
 */
export async function questionnaireEstFige(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<boolean> {
  return (await compterQuestionsFigees(executeur, missionId)) > 0;
}

/**
 * L'état MESURÉ des conditions du §32.2, pour une mission donnée.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CINQ CONDITIONS SUR HUIT SONT ÉVALUÉES, ET LES TROIS AUTRES SONT **ABSENTES**
 * DE L'OBJET — PAS À `false`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `EtatConditionsMission` (packages/shared) l'écrit en toutes lettres : une clé
 * ABSENTE vaut SATISFAITE, seul un `false` EXPLICITE bloque (03 §17.2 V2.9 : « une
 * condition dont la fonctionnalité porteuse n'est pas livrée est réputée
 * satisfaite »). Les trois absentes ont chacune une raison NOMMÉE :
 *   · `plan_entretiens_etabli` — le plan d'entretiens **n'est pas encore
 *     persisté** : `conducted_by` est nullable depuis le 2026-09-02 (migration
 *     0014), mais `/apply` n'est pas livrée (fiche d'étage 2) ;
 *   · `export_realise` — l'export appartient à L7-min ;
 *   · `retrospective_faite` — **aucun code d'étape ne la porte** : les huit valeurs
 *     de `step_validations.step_code` (CHECK fermé du 04) ne comptent pas de
 *     `retrospective`, et le §32.2 ne dit pas où elle s'enregistre.
 * Les traiter comme fausses rendrait `preparation → en_cours`, `en_analyse → livree`
 * et `livree → cloturee` DÉFINITIVEMENT infranchissables : le produit se
 * verrouillerait sur l'absence d'une fonctionnalité au lieu de s'en passer. C'est
 * exactement ce que le §17.2 refuse.
 */
export async function mesurerConditionsMission(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<Readonly<Partial<Record<CodeConditionMission, boolean>>>> {
  // SÉQUENTIEL, PAS `Promise.all` : les deux lectures partagent le client
  // PostgreSQL de la transaction, qui sérialise de toute façon les requêtes. Les
  // lancer en parallèle ne gagnerait rien et rendrait l'ordre des requêtes dans un
  // journal de base illisible le jour où l'on débogue un verrou.
  const etapes = await lireEtapesValidees(executeur, missionId);
  const questionnaireFige = await questionnaireEstFige(executeur, missionId);

  return {
    etape_cadrage_validee: etapes.has('cadrage'),
    etape_preparation_validee: etapes.has('preparation'),
    etape_collecte_validee: etapes.has('collecte'),
    etape_livraison_validee: etapes.has('livraison'),
    questionnaire_fige: questionnaireFige,
    // Et RIEN d'autre. Les trois conditions non mesurables sont absentes — voir
    // l'en-tête de cette fonction. Écrire `plan_entretiens_etabli: false` ici
    // fermerait la mission sur une fonctionnalité qui n'existe pas.
  };
}

// -----------------------------------------------------------------------------
// ÉCRITURES — et la traduction des erreurs du pilote PostgreSQL
// -----------------------------------------------------------------------------

/** Code SQLSTATE d'une violation de clé étrangère (PostgreSQL). */
const VIOLATION_CLE_ETRANGERE = '23503';

/** Code SQLSTATE d'une violation de contrainte CHECK (PostgreSQL). */
const VIOLATION_CHECK = '23514';

/**
 * Les quatre clés étrangères de `missions` (migration `0002`), et le champ d'API
 * qu'il faut nommer quand chacune casse. Le nom de la contrainte est LU, jamais
 * deviné : traiter tout `23503` comme « entreprise inconnue » enverrait chercher au
 * mauvais endroit le jour où c'est le palier qui manque — et un message d'erreur
 * faux coûte plus cher qu'un message absent.
 */
const CONTRAINTES_ETRANGERES: readonly {
  readonly contrainte: string;
  readonly champ: string;
  readonly message: string;
}[] = [
  {
    contrainte: 'missions_company_id_fkey',
    champ: 'companyId',
    message: "Cette entreprise n'existe pas.",
  },
  {
    contrainte: 'missions_parent_mission_id_fkey',
    champ: 'parentMissionId',
    message: "La mission mère indiquée n'existe pas.",
  },
  {
    contrainte: 'missions_size_tier_id_fkey',
    champ: 'sizeTierId',
    message: "Ce palier d'effectif n'existe pas.",
  },
  {
    contrainte: 'missions_created_by_fkey',
    champ: 'createdBy',
    message: "L'auteur de la mission n'existe plus.",
  },
];

/**
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/**
 * Lit `code` et `constraint` en REMONTANT la chaîne `cause`, sans `instanceof`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MESURÉ SUR `drizzle-orm@0.44.7` au CRUD des comptes, et redit ici parce que
 * l'oublier coûte un 500 au lieu d'un 400 : une requête qui échoue ne propage PAS
 * l'erreur du pilote. Drizzle lève une `DrizzleQueryError` et RANGE la
 * `DatabaseError` de `pg` dans sa propriété `cause`. **Ni `code` ni `constraint`
 * ne sont recopiés sur l'enveloppe.** Un `catch` qui lirait `erreur.code` rendrait
 * TOUJOURS `undefined`, et une entreprise inconnue sortirait en 500.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
function lireEchecDeContrainte(erreur: unknown): { code: string; contrainte: string } | null {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur <= PROFONDEUR_MAX_CAUSE; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return null;

    const code = 'code' in courante ? courante.code : undefined;
    const contrainte = 'constraint' in courante ? courante.constraint : undefined;
    if (typeof code === 'string' && typeof contrainte === 'string') {
      return { code, contrainte };
    }

    courante = 'cause' in courante ? courante.cause : undefined;
  }
  return null;
}

/**
 * Traduit les échecs de contrainte que ces routes peuvent provoquer, et relance
 * tout le reste.
 *
 * ── POURQUOI ON NE LIT PAS AVANT D'ÉCRIRE ───────────────────────────────────
 * Un `SELECT … WHERE id = $1` préalable sur `companies` ne supprime pas le besoin
 * de ce traitement : entre la lecture et l'insertion, la fiche peut disparaître.
 * **C'est la clé étrangère qui arbitre, pas nous** — un contrôle préalable
 * n'ajouterait qu'un aller-retour et l'illusion d'une garantie. Même raisonnement,
 * et mêmes mots, que le dépôt des entreprises pour le SIREN.
 *
 * Les CHECK (`geo_scope`, `audit_level`, `commercial_offer`, `status`,
 * `llm_provider`) sont normalement inatteignables — les schémas Zod ferment déjà
 * les cinq énumérations. Les traduire quand même donne un message utile plutôt
 * qu'un 500 muet le jour où le 04 ajoutera une valeur que `packages/shared` ne
 * connaît pas encore : c'est le symptôme d'une transcription en retard, et il vaut
 * mieux qu'il se lise.
 */
function traduireEchecDeContrainte(erreur: unknown): never {
  const echec = lireEchecDeContrainte(erreur);
  if (echec === null) throw erreur;

  if (echec.code === VIOLATION_CLE_ETRANGERE) {
    const connue = CONTRAINTES_ETRANGERES.find((c) => c.contrainte === echec.contrainte);
    if (connue !== undefined) {
      throw new AppError('VALIDATION_FAILED', connue.message, [
        { path: connue.champ, message: connue.message },
      ]);
    }
  }

  if (echec.code === VIOLATION_CHECK && echec.contrainte.startsWith('missions_')) {
    throw new AppError(
      'VALIDATION_FAILED',
      "Une valeur de la mission n'est pas admise par le modèle de données.",
      [{ path: 'mission', message: `Contrainte violée : ${echec.contrainte}` }],
    );
  }

  throw erreur;
}

/**
 * Ce qu'une création fournit. `id` est un UUID v7 frappé par le service (11 §2).
 *
 * `timezone` et `llmProvider` sont `undefined` quand l'appelant s'est tu : la
 * colonne n'est alors PAS écrite et PostgreSQL applique le défaut du fichier 04
 * (`'Europe/Paris'`, `'anthropic'`). Recopier ces valeurs dans du TypeScript en
 * ferait une seconde source de vérité — et `Europe/Paris` en dur est exactement ce
 * que l'invariant 2 refuse.
 *
 * `status` n'y figure pas : il vaut toujours `STATUT_MISSION_INITIAL`, et le dire
 * ici ferait croire qu'on peut en choisir un autre.
 */
export interface NouvelleMission {
  readonly id: string;
  readonly companyId: string;
  readonly parentMissionId: string | null;
  readonly title: string;
  readonly geoScope: PerimetreGeoMission;
  readonly countryCode: string | null;
  readonly sizeTierId: string | null;
  readonly activeSectors: readonly string[];
  readonly activeBlocks: readonly string[];
  readonly auditLevel: NiveauAuditMission;
  readonly commercialOffer: OffreCommercialeMission | null;
  readonly timezone: string | undefined;
  readonly ndaRef: string | null;
  readonly ndaSignedAt: string | null;
  readonly llmProvider: FournisseurLlmMission | undefined;
  readonly startPlanned: string | null;
  readonly endPlanned: string | null;
  readonly createdBy: string;
  readonly statutInitial: StatutMission;
}

/**
 * Insère une mission. **N'ouvre pas de transaction** : l'appelant en tient une, car
 * la mission et son unité racine naissent ENSEMBLE ou pas du tout (§16.2).
 *
 * `created_at` et `updated_at` sont posés PAR L'APPLICATION malgré leur défaut SQL,
 * pour la raison qu'énonce le dépôt du journal : un horodatage qui vient tantôt de
 * l'application, tantôt de la base, rend indécidable à la relecture d'un incident
 * de quelle horloge on parle.
 */
export async function insererMission(
  executeur: ExecuteurSql,
  nouvelle: NouvelleMission,
  maintenant: Date,
): Promise<LigneMission> {
  // L'objet est construit À PART et TYPÉ `$inferInsert`, plutôt qu'écrit en
  // littéral : les deux colonnes à défaut du 04 (`timezone`, `llm_provider`) ne
  // s'écrivent que si l'appelant les a fournies, et un littéral à `...spread`
  // conditionnel fait perdre à TypeScript la forme exacte de l'objet — donc la
  // vérification que toutes les colonnes NOT NULL sont bien posées, qui est
  // précisément ce qu'on veut garder ici.
  // `PgInsertValue`, et non `$inferInsert` : c'est le type des valeurs qu'un
  // INSERT accepte, lequel admet un fragment `SQL` là où `$inferInsert` décrit la
  // LIGNE une fois écrite. La nuance décide ici : les deux colonnes à défaut du
  // 04 passent `sql`default``, ce que la seconde forme interdirait.
  const valeurs: PgInsertValue<typeof missions> = {
    id: nouvelle.id,
    companyId: nouvelle.companyId,
    parentMissionId: nouvelle.parentMissionId,
    title: nouvelle.title,
    geoScope: nouvelle.geoScope,
    countryCode: nouvelle.countryCode,
    sizeTierId: nouvelle.sizeTierId,
    // Les tableaux sont RECOPIÉS : la valeur passée par le service est en lecture
    // seule, et Drizzle attend un JSON mutable.
    activeSectors: [...nouvelle.activeSectors],
    activeBlocks: [...nouvelle.activeBlocks],
    auditLevel: nouvelle.auditLevel,
    commercialOffer: nouvelle.commercialOffer,
    ndaRef: nouvelle.ndaRef,
    ndaSignedAt: nouvelle.ndaSignedAt,
    status: nouvelle.statutInitial,
    // ── LES DEUX COLONNES À DÉFAUT DU FICHIER 04 ────────────────────────────
    // `sql`default`` demande à PostgreSQL d'appliquer le DEFAULT de la
    // colonne (`'Europe/Paris'`, `'anthropic'`). C'est EXACTEMENT ce que Drizzle
    // émet de lui-même pour une clé `undefined` — on l'écrit explicitement parce
    // que `exactOptionalPropertyTypes` interdit de passer `undefined` là où le type
    // attend une chaîne, et parce qu'un lecteur doit voir que ce n'est pas un
    // oubli. Recopier les deux valeurs dans du TypeScript en ferait une seconde
    // source de vérité, et `Europe/Paris` en dur est précisément ce que
    // l'invariant 2 refuse : un fuseau varie par mission.
    timezone: nouvelle.timezone ?? sql`default`,
    llmProvider: nouvelle.llmProvider ?? sql`default`,
    startPlanned: nouvelle.startPlanned,
    endPlanned: nouvelle.endPlanned,
    // Une mission naît NON LIVRÉE et VIVANTE. Écrit en clair plutôt que laissé au
    // défaut de la colonne : ce sont des décisions fonctionnelles.
    deliveredAt: null,
    createdBy: nouvelle.createdBy,
    deletedAt: null,
    createdAt: maintenant,
    updatedAt: maintenant,
  };
  let lignes: LigneBrute[];
  try {
    lignes = await executeur.insert(missions).values(valeurs).returning(COLONNES_MISSION);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  if (ligne === undefined) {
    // Inatteignable : un `INSERT … RETURNING` qui n'échoue pas rend une ligne. On
    // échoue quand même plutôt que d'asserter — une assertion mentirait au compilateur.
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return versLigne(ligne);
}

/** Les champs que `PATCH /v1/missions/:id` peut toucher. `status` n'en est PAS. */
export interface ChampsMissionModifiables {
  readonly parentMissionId?: string | null;
  readonly title?: string;
  readonly geoScope?: PerimetreGeoMission;
  readonly countryCode?: string | null;
  readonly sizeTierId?: string | null;
  readonly activeSectors?: string[];
  readonly activeBlocks?: string[];
  readonly auditLevel?: NiveauAuditMission;
  readonly commercialOffer?: OffreCommercialeMission | null;
  readonly timezone?: string;
  readonly ndaRef?: string | null;
  readonly ndaSignedAt?: string | null;
  readonly llmProvider?: FournisseurLlmMission;
  readonly startPlanned?: string | null;
  readonly endPlanned?: string | null;
}

/**
 * Applique une modification. `updated_at` est TOUJOURS bousculé — le service
 * n'appelle cette fonction QUE si au moins un champ change réellement, et c'est
 * précisément la question à laquelle cette colonne répond.
 */
export async function mettreAJourMission(
  executeur: ExecuteurSql,
  id: string,
  champs: ChampsMissionModifiables,
  maintenant: Date,
): Promise<LigneMission | null> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .update(missions)
      .set({ ...champs, updatedAt: maintenant })
      .where(and(eq(missions.id, id), isNull(missions.deletedAt)))
      .returning(COLONNES_MISSION);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * Pose le nouveau statut d'une mission. **LA SEULE ÉCRITURE DE `missions.status`
 * DE TOUT LE CODE** — c'est ce qui rend vraie la phrase « la machine à états
 * s'applique dans le service » : il n'y a qu'un chemin, et il passe par
 * `transitionnerMission`.
 *
 * ── LA CLAUSE `status = depuis`, QUI N'EST PAS DE LA CEINTURE INUTILE ────────
 * L'appelant tient déjà un `FOR UPDATE` sur la ligne, donc personne n'a pu la
 * changer entre-temps. Cette clause supplémentaire ne protège pas de la
 * concurrence : elle protège d'une FAUTE DE PROGRAMMATION — un futur appelant qui
 * aurait oublié le verrou, ou qui aurait lu la mission hors transaction. Elle rend
 * alors `null` (donc un échec bruyant) au lieu d'écraser un statut décidé sur un
 * état périmé. Le coût est une comparaison de chaîne ; le défaut qu'elle attrape
 * est invisible autrement.
 *
 * `delivered_at` : posé à la PREMIÈRE entrée en `livree`, **jamais effacé** au
 * retour arrière `livree → en_analyse`. Invariant 7 — « rien n'est jamais
 * silencieusement écrasé ou supprimé » : la date de première livraison est un fait,
 * et le retour en analyse ne le défait pas. Le service décide de la valeur ;
 * `undefined` signifie « ne touche pas à cette colonne ».
 */
export async function poserStatutMission(
  executeur: ExecuteurSql,
  id: string,
  depuis: StatutMission,
  vers: StatutMission,
  deliveredAt: Date | undefined,
  maintenant: Date,
): Promise<LigneMission | null> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .update(missions)
      .set({
        status: vers,
        ...(deliveredAt === undefined ? {} : { deliveredAt }),
        updatedAt: maintenant,
      })
      .where(and(eq(missions.id, id), eq(missions.status, depuis), isNull(missions.deletedAt)))
      .returning(COLONNES_MISSION);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

// -----------------------------------------------------------------------------
// L'UNITÉ RACINE — 03 §16.2, « une racine est créée par défaut »
// -----------------------------------------------------------------------------

/**
 * Le NOM de l'entreprise auditée — la seule donnée de `companies` que ce dépôt lit.
 *
 * Elle sert à baptiser l'unité racine : l'arbre organisationnel d'une mission a
 * pour sommet l'entité auditée elle-même, et lui donner un nom générique
 * (« Racine », « Unité principale ») produirait un arbre où le nœud le plus visible
 * est le seul à ne rien dire. **Invariant 2 tenu** : ce nom est une DONNÉE de
 * mission, lue en base ; aucun libellé de client ne descend dans le code.
 *
 * Rend `null` si la fiche n'existe pas ou est supprimée — le service en fait un
 * refus AVANT toute écriture, ce qui donne un message utile là où la clé étrangère
 * n'aurait donné qu'un nom de contrainte. La clé étrangère reste la seconde
 * ceinture : entre cette lecture et l'insertion, rien ne garantit que la fiche
 * survit, et c'est elle qui arbitre alors.
 */
export async function lireNomEntreprise(
  executeur: ExecuteurSql,
  companyId: string,
): Promise<string | null> {
  const lignes = await executeur
    .select({ name: companies.name })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1);

  return lignes[0]?.name ?? null;
}

/** Ce qu'il faut pour poser la racine d'une mission neuve. */
export interface NouvelleUniteRacine {
  readonly id: string;
  readonly missionId: string;
  readonly name: string;
  readonly kind: TypeUniteOrg;
}

/**
 * Insère l'unité racine d'une mission — `parent_id NULL`, `position` à la première
 * place.
 *
 * ── LES QUATRE VALEURS QUI NE SONT PAS DEMANDÉES, ET D'OÙ ELLES VIENNENT ────
 *   · `parentId: null` — c'est la DÉFINITION d'une racine, pas un choix ;
 *   · `inScope: true` — le 04 le met en défaut ; l'écrire en clair dit que c'est
 *     une décision fonctionnelle (§25.1 : une unité hors périmètre est un acte
 *     délibéré, jamais l'état de naissance d'une racine) ;
 *   · `status: 'active'` — `proposee` est réservé aux propositions TERRAIN (§25.3,
 *     `proposed_by` renseigné) ; une racine créée par le siège naît active ;
 *   · `position: 1` — la fixture canonique FIL-TPE écrit la même valeur pour sa
 *     racine, et un arbre dont la racine n'a pas de position se trierait au hasard.
 *
 * `country_code`, `timezone`, `headcount`, `service_ref_id`, `sector_id` restent
 * NULS : le §22.2 fait de `timezone NULL` un HÉRITAGE explicite du fuseau de la
 * mission — y recopier le fuseau de la mission créerait une seconde valeur à tenir
 * à jour, que personne ne mettrait à jour.
 */
export async function insererUniteRacine(
  executeur: ExecuteurSql,
  racine: NouvelleUniteRacine,
  maintenant: Date,
): Promise<string> {
  const lignes = await executeur
    .insert(orgUnits)
    .values({
      id: racine.id,
      missionId: racine.missionId,
      parentId: null,
      kind: racine.kind,
      name: racine.name,
      countryCode: null,
      timezone: null,
      headcount: null,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      status: 'active',
      proposedBy: null,
      mergedIntoId: null,
      position: 1,
      createdAt: maintenant,
      updatedAt: maintenant,
    })
    .returning({ id: orgUnits.id });

  const ligne = lignes[0];
  if (ligne === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return ligne.id;
}
