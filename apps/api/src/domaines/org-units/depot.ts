// =============================================================================
// DÉPÔT DE L'ARBRE ORGANISATIONNEL — `org_units`, plus les deux lectures de
// référentiel (`services`, `sectors`) dont l'import CSV a besoin et le
// re-rattachement des `interviews` qu'une fusion opère. Lot L3, incrément L3c.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS, ET C'EST VOULU ─────────────────────────────
//   · **il ne supprime rien.** `org_units` n'a pas de `deleted_at` au fichier 04
//     et aucune route n'efface une ligne : une fusion (§25.3) CONSERVE la source
//     en `fusionnee` et pose `merged_into_id` — invariant 7, « rien n'est jamais
//     silencieusement écrasé ou supprimé » ;
//   · **il ne décide d'aucune qualification.** Il sait poser un statut ; il ne
//     sait pas si on avait le droit. Les conditions du §25.3 (seule une unité
//     `proposee` se fusionne, la cible doit être `active`) vivent dans le SERVICE ;
//   · **il ne valide aucun CSV.** L'analyse du §35.2 est une fonction pure de
//     `packages/shared` ; ce dépôt ne voit que des lignes déjà jugées ;
//   · il ne journalise rien : la porte d'écriture unique est
//     `domaines/journal/service.ts`, appelée par le service APRÈS le succès ;
//   · **il ne touche aucune colonne de cadrage financier.** Aucune donnée
//     financière ne transite par une route d'arbre (invariant 3).
//
// ── LE CADRAGE PAR MISSION EST DANS LE `WHERE`, PAS DANS LA POLITIQUE ───────
// Invariant 3. `auth/politique.ts` le dit en une phrase : une politique de route
// « dit QUI ENTRE, pas CE QUE LE SQL RAMÈNE ». Toute lecture d'arbre porte donc
// `mission_id` dans sa clause, et toute écriture vérifie que le parent, la cible
// d'une fusion et l'unité visée appartiennent à la MÊME mission — ce qu'aucune
// contrainte du 04 ne peut faire (la clé étrangère `parent_id → org_units.id` ne
// dit rien de la mission).
// Traçabilité : E4 (arbre organisationnel à profondeur libre) · E5 (audits
// partiels — `in_scope`) · E31 (généricité : un arbre est une donnée de mission) ·
// E43 (conventions d'API — pagination keyset).
// =============================================================================
import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import {
  AppError,
  type PaginationQuery,
  type StatutUniteOrg,
  type TypeUniteOrg,
} from '@axion/shared';
import { db } from '../../db.js';
import { interviews, missions, orgUnits, sectors, services } from '../../db/schema.js';
import {
  decoderCurseur,
  limiteAChercher,
  paginerParCurseur,
  type DefinitionCurseur,
  type PageCurseur,
} from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';

// -----------------------------------------------------------------------------
// LA LIGNE
// -----------------------------------------------------------------------------

/**
 * Une unité de l'arbre, telle que l'API a le droit de la voir.
 *
 * `position` est NULLABLE, comme au fichier 04 — et c'est le point de bascule de ce
 * dépôt : **une unité sans position est un état LÉGITIME**, pas une corruption. Le
 * 04 l'autorise, donc le code la rend. Ce qu'il faut à la pagination, ce n'est pas
 * une colonne NOT NULL : c'est un ORDRE TOTAL, et c'est la REQUÊTE qui le
 * fabrique (voir `RANG_DE_TRI` et `CURSEUR_UNITES`).
 */
export interface LigneUniteOrg {
  readonly id: string;
  readonly missionId: string;
  readonly parentId: string | null;
  readonly kind: TypeUniteOrg;
  readonly name: string;
  readonly countryCode: string | null;
  readonly timezone: string | null;
  readonly headcount: number | null;
  readonly serviceRefId: string | null;
  readonly sectorId: string | null;
  readonly inScope: boolean;
  readonly status: StatutUniteOrg;
  readonly proposedBy: string | null;
  readonly mergedIntoId: string | null;
  readonly position: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Les colonnes rendues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_UNITE = {
  id: orgUnits.id,
  missionId: orgUnits.missionId,
  parentId: orgUnits.parentId,
  kind: orgUnits.kind,
  name: orgUnits.name,
  countryCode: orgUnits.countryCode,
  timezone: orgUnits.timezone,
  headcount: orgUnits.headcount,
  serviceRefId: orgUnits.serviceRefId,
  sectorId: orgUnits.sectorId,
  inScope: orgUnits.inScope,
  status: orgUnits.status,
  proposedBy: orgUnits.proposedBy,
  mergedIntoId: orgUnits.mergedIntoId,
  position: orgUnits.position,
  createdAt: orgUnits.createdAt,
  updatedAt: orgUnits.updatedAt,
};

/**
 * LA VALEUR DE TRI D'UNE UNITÉ SANS POSITION : la plus grande qu'un `INTEGER` de
 * PostgreSQL puisse porter — donc la fin de la liste.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'EST LA REQUÊTE QUI RÉCONCILIE UNE COLONNE NULLABLE ET UN CURSEUR KEYSET.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `docs/conception/LOT_L3.md` §2 fixe le curseur à `(position, id)` ; le module de
 * pagination exige de ses appelants des composantes NON NULLES (« la comparaison de
 * n-uplets de PostgreSQL rend NULL, donc AUCUNE ligne, dès qu'une composante est
 * nulle ») ; le fichier 04, lui, déclare la colonne NULLABLE. Trois contraintes, et
 * aucune n'a tort.
 *
 * La jonction se fait ICI, dans la clause SQL, **sans toucher ni au 04 ni au module
 * partagé** : ce qui est comparé et ce qui est encodé dans le curseur, ce n'est pas
 * `position` mais `coalesce(position, MAX_INT)`. L'ordre redevient TOTAL, une unité
 * sans position se range en queue d'arbre, et elle y apparaît **exactement une
 * fois** — ni zéro (elle sortirait de l'arbre sans un mot), ni deux.
 *
 * ⚠ Une unité qui porterait RÉELLEMENT `2147483647` partagerait ce rang avec les
 * unités sans position. Ce n'est pas un défaut : l'`id`, seconde composante du
 * curseur, départage, et l'ordre reste total. Aucune ligne n'est perdue ni répétée.
 */
const RANG_FIN_DE_LISTE = 2_147_483_647;

/**
 * Le rang réellement trié et comparé — voir `RANG_FIN_DE_LISTE`.
 *
 * Écrit une fois, utilisé par la clause de reprise, par le `ORDER BY` et par la
 * valeur encodée dans le curseur : les trois DOIVENT dire la même chose, et trois
 * écritures séparées finiraient par diverger — une divergence qui ne lève rien, qui
 * saute simplement des lignes à la deuxième page.
 */
const RANG_DE_TRI = sql`coalesce(${orgUnits.position}, ${RANG_FIN_DE_LISTE})`;

/** Ce que Drizzle rend réellement — identique à la ligne exposée. */
type LigneBrute = LigneUniteOrg;

/**
 * Projection de la ligne. Il n'y a RIEN à valider : `position` nulle est une valeur
 * admise par le 04 (voir `RANG_FIN_DE_LISTE`), et toutes les autres colonnes lues
 * sont `NOT NULL` en base ou nullables au contrat. Cette fonction existe pour que
 * le point de passage reste nommé le jour où une colonne demandera un contrôle.
 */
function versLigne(brut: LigneBrute): LigneUniteOrg {
  return brut;
}

// -----------------------------------------------------------------------------
// LISTE — pagination keyset
// -----------------------------------------------------------------------------

/**
 * Le curseur de `GET /v1/missions/:id/org-units` : **`(position, id)`, ascendant** —
 * figé par `docs/conception/LOT_L3.md` §2, qui l'écrit route par route.
 *
 * ── LES TROIS EXIGENCES DU MODULE DE PAGINATION, VÉRIFIÉES ICI ──────────────
 *  1. « les colonnes du curseur sont NOT NULL » : `org_units.id` l'est (clé
 *     primaire) ; `position` ne l'est PAS en base, et le 04 a raison de le
 *     permettre. L'exigence est donc tenue **par la requête et non par la
 *     colonne** : ce qui est trié, comparé et encodé est `RANG_DE_TRI`,
 *     c'est-à-dire `coalesce(position, MAX_INT)`, qui n'est jamais nul. Une unité
 *     sans position se range en fin d'arbre et y paraît exactement une fois ;
 *  2. « la DERNIÈRE clé est unique » : `id` est la clé primaire. Indispensable —
 *     **rien n'impose l'unicité de `position` dans une mission** (le 04 n'a pas de
 *     contrainte, et un import peut légitimement produire des rangs identiques
 *     après un ajout manuel) ; sans l'`id`, l'ordre ne serait pas total et la
 *     pagination sauterait des unités ;
 *  3. « l'index qui sert le tri couvre les mêmes colonnes » : **IL N'EXISTE PAS.**
 *     Le §7.1 du 04 prévoit `org_units(mission_id)` et `org_units(parent_id)`,
 *     aucun sur `(position, id)`. Le tri est donc servi en mémoire, APRÈS le filtre
 *     par mission qui, lui, est indexé : on trie 150 lignes (FIL-GC), pas la table.
 *     Sans effet mesurable au volume de la Phase 1. L'ajouter toucherait le fichier
 *     04 — escalade, pas décision d'agent.
 *
 * ⚠ ORDRE ASCENDANT, et ici il PORTE DU SENS, contrairement aux autres listes :
 * l'import numérote les unités **dans l'ordre du fichier**, parents avant enfants.
 * Lue en position croissante, la liste rend donc l'arbre dans l'ordre où le sponsor
 * l'a écrit — un affichage hiérarchique n'a rien à retrier.
 */
const CURSEUR_UNITES: DefinitionCurseur<LigneUniteOrg> = {
  ressource: 'org_units',
  sens: 'asc',
  cles: [
    // ⚠ `colonne` NOMME LA COLONNE, `valeur` PRODUIT CE QUI EST COMPARÉ — et les
    // deux diffèrent ici, seule ressource du produit dans ce cas. La composante
    // encodée est le RANG DE TRI (`coalesce(position, MAX_INT)`), parce qu'une
    // composante nulle rendrait toute la comparaison de n-uplets indécidable.
    // C'est pourquoi ce dépôt compose sa clause de reprise lui-même
    // (`conditionApresRang`) au lieu d'appeler `conditionApresCurseur` : cette
    // dernière comparerait `position` nue, donc pas ce que le curseur porte.
    { colonne: orgUnits.position, valeur: (ligne) => String(ligne.position ?? RANG_FIN_DE_LISTE) },
    { colonne: orgUnits.id, valeur: (ligne) => ligne.id },
  ],
};

/**
 * La clause « après le curseur », sur le RANG DE TRI plutôt que sur la colonne nue.
 *
 * Comparaison de N-UPLETS, comme le fait le module partagé : `(rang, id) > ($1, $2)`
 * est une seule comparaison, que PostgreSQL sait servir par un index composite, là
 * où la cascade `rang > $1 OR (rang = $1 AND id > $2)` dégénère souvent en balayage.
 *
 * `decoderCurseur` reste celui du module : c'est lui qui refuse un curseur d'une
 * autre ressource, une arité fausse ou un encodage bruité (`400 INVALID_CURSOR`).
 * On ne réécrit QUE la clause, jamais la validation.
 */
function conditionApresRang(curseur: string | undefined): SQL | undefined {
  if (curseur === undefined) return undefined;

  const [rang, id] = decoderCurseur(CURSEUR_UNITES, curseur);
  if (rang === undefined || id === undefined) {
    // Inatteignable : `decoderCurseur` a déjà vérifié l'arité contre `cles`. On
    // échoue quand même plutôt que d'asserter — une assertion mentirait au
    // compilateur, et c'est le curseur qui vient du réseau.
    throw new AppError(
      'INVALID_CURSOR',
      'Le curseur de pagination est invalide. Reprenez la liste depuis le début.',
    );
  }

  return sql`(${RANG_DE_TRI}, ${orgUnits.id}) > (${rang}::integer, ${id}::uuid)`;
}

/**
 * Une page de l'arbre d'UNE mission.
 *
 * ⚠ **`mission_id` EST DANS LE `WHERE`, TOUJOURS** (invariant 3) : c'est ici, et
 * nulle part ailleurs, que le cadrage par mission s'applique. La politique de route
 * dit qui entre ; ce filtre dit ce que le SQL ramène.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LES `fusionnee` SONT EXCLUES — ET CE N'EST PAS UNE SUPPRESSION, C'EST UNE VUE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Une unité fusionnée n'est plus un NŒUD de l'arbre : elle est de l'HISTOIRE. La
 * servir ici la ferait doubler avec sa cible — ses entretiens et ses enfants y ont
 * été re-rattachés — c'est-à-dire qu'elle recréerait exactement le doublon que la
 * fusion existait pour supprimer, et la couverture compterait deux fois la même
 * réalité.
 *
 * **L'invariant 7 n'en souffre pas, et c'est la distinction qui compte** : la ligne
 * SURVIT en base, avec son `merged_into_id` ; rien n'est effacé. Elle reste
 * atteignable par son identifiant, lisible par une requête d'audit, et la trace
 * `activity_log` de la fusion dit d'où elle vient. Ce qui change n'est pas la
 * donnée, c'est ce que cette liste-ci prétend décrire : l'arbre VIVANT.
 *
 * Les `proposee`, elles, SONT rendues : l'administrateur ne peut pas qualifier
 * (§25.3) ce qu'il ne voit pas.
 *
 * **AUCUN paramètre de filtre** : le pack n'en nomme aucun, et en inventer un
 * (`?status=`) serait inventer du produit. Le jour où la console voudra afficher
 * l'historique des fusions, elle amènera sa route et son contrat.
 */
export async function listerUnitesDeMission(
  missionId: string,
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneUniteOrg>> {
  const lignes: LigneBrute[] = await db
    .select(COLONNES_UNITE)
    .from(orgUnits)
    .where(
      and(
        eq(orgUnits.missionId, missionId),
        ne(orgUnits.status, 'fusionnee'),
        conditionApresRang(pagination.after),
      ),
    )
    // Trié sur le RANG, pas sur la colonne : le `ORDER BY` doit dire exactement ce
    // que compare la clause ci-dessus, sinon la pagination saute des lignes sans
    // jamais lever d'erreur. (`ORDER BY position ASC` rangerait bien les nuls en
    // dernier — PostgreSQL le fait par défaut — mais rien ne le garantirait le jour
    // où le sens changerait, et la clause de reprise, elle, n'a pas ce défaut.)
    .orderBy(sql`${RANG_DE_TRI} asc`, sql`${orgUnits.id} asc`)
    .limit(limiteAChercher(pagination));

  return paginerParCurseur(CURSEUR_UNITES, pagination, lignes.map(versLigne));
}

// -----------------------------------------------------------------------------
// LECTURES UNITAIRES
// -----------------------------------------------------------------------------

/** Lit une unité par clé primaire. Rend `null` si elle n'existe pas. */
export async function lireUnite(
  executeur: ExecuteurSql,
  id: string,
): Promise<LigneUniteOrg | null> {
  const lignes = await executeur.select(COLONNES_UNITE).from(orgUnits).where(eq(orgUnits.id, id));

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * Lit une unité ET LA VERROUILLE jusqu'à la fin de la transaction.
 *
 * Même raison que pour la machine à états des missions : `validate` et `merge` sont
 * des lire-décider-écrire. Sans `FOR UPDATE`, deux demandes concurrentes liraient le
 * même `proposee`, jugeraient toutes deux valides, et la seconde écrirait sur un
 * état déjà périmé — une unité pourrait alors être validée ET fusionnée, ce que
 * `merged_into_id` rendrait incohérent avec `status`.
 */
export async function lireUnitePourEcriture(
  executeur: ExecuteurSql,
  id: string,
): Promise<LigneUniteOrg | null> {
  const lignes = await executeur
    .select(COLONNES_UNITE)
    .from(orgUnits)
    .where(eq(orgUnits.id, id))
    .for('update');

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * La mission existe-t-elle, et est-elle vivante ?
 *
 * Lue AVANT toute écriture d'arbre pour que « mission inconnue » rende un `404`
 * portant un message utile, plutôt qu'un nom de contrainte de clé étrangère. La
 * clé étrangère reste la seconde ceinture : entre cette lecture et l'insertion,
 * rien ne garantit que la mission survit, et c'est elle qui arbitre alors.
 */
export async function missionVivante(executeur: ExecuteurSql, missionId: string): Promise<boolean> {
  const lignes = await executeur
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1);

  return lignes.length > 0;
}

/**
 * La mission existe-t-elle, **et sa ligne est-elle verrouillée** jusqu'à la fin de
 * la transaction ?
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ÉCRITE UNE FOIS : TOUTE ROUTE QUI DÉCIDE SUR UN DÉCOMPTE D'ARBRE LIT
 * LA MISSION `FOR UPDATE`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un garde-fou qui compte des lignes filles pour décider d'en insérer d'autres est
 * un lire-décider-écrire, et `org_units` ne porte aucun `UNIQUE` qui rattraperait
 * la course : deux imports concurrents compteraient tous deux « arbre vide »,
 * jugeraient tous deux légitime, et produiraient DEUX arbres dans la même mission —
 * qu'aucune route ne sait ensuite réparer. Le verrou porte sur la MISSION et non
 * sur les unités, pour la raison qui vaut déjà au figeage
 * (`questionnaire/depot.ts`, `lireMissionPourFigeage`) : on ne verrouille pas des
 * lignes qui n'existent pas encore. Le second appel attend, compte n non nul, et
 * sort en 409.
 *
 * Le mode À BLANC ne l'utilise pas, et c'est volontaire : il n'écrit rien, il n'a
 * donc aucune décision d'écriture à sérialiser — le verrou ferait attendre un
 * contrôle de fichier derrière un import réel sans rien protéger.
 *
 * Posé le 2026-09-02 (revue croisée A17, constat B-2).
 */
export async function verrouillerMission(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<boolean> {
  const lignes = await executeur
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1)
    .for('update');

  return lignes.length > 0;
}

/**
 * L'arbre d'une mission, réduit à ce qu'une détection de cycle a besoin de savoir.
 *
 * Deux colonnes, jamais la ligne entière : un reparentage n'a pas à charger 150
 * noms d'unités en mémoire pour vérifier une propriété de graphe. `FOR UPDATE`
 * n'est pas posé — un cycle ne peut naître que d'un reparentage, et le reparentage
 * verrouille déjà la ligne qu'il modifie.
 */
export async function lireSquelette(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly { readonly id: string; readonly parentId: string | null }[]> {
  return executeur
    .select({ id: orgUnits.id, parentId: orgUnits.parentId })
    .from(orgUnits)
    .where(eq(orgUnits.missionId, missionId));
}

/**
 * Combien d'unités porte l'arbre d'une mission, et lesquelles sont des racines.
 *
 * Sert LE garde-fou de ré-import (`DECISIONS.md` du 2026-09-01) : « import refusé
 * si l'arbre porte autre chose que sa racine d'office, arbre inchangé au bit près ».
 * On rend les deux décomptes plutôt qu'un booléen : c'est le service qui décide de
 * la règle, pas le dépôt.
 */
export async function compterUnites(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<{ readonly total: number; readonly racines: number }> {
  const lignes = await executeur
    .select({
      total: sql<string>`count(*)`,
      racines: sql<string>`count(*) filter (where ${orgUnits.parentId} is null)`,
    })
    .from(orgUnits)
    .where(eq(orgUnits.missionId, missionId));

  const ligne = lignes[0];
  return {
    total: Number(ligne?.total ?? 0),
    racines: Number(ligne?.racines ?? 0),
  };
}

/**
 * La position la plus haute de l'arbre d'une mission, ou 0 s'il est vide.
 *
 * Une création et un import se placent À LA SUITE (`max + 1`, `max + n`). Recommencer
 * à 1 ferait cohabiter deux unités de même rang, et l'ordre de la liste dépendrait
 * alors de l'`id` — c'est-à-dire de l'instant de création, pas de la volonté de
 * l'utilisateur.
 */
export async function positionMax(executeur: ExecuteurSql, missionId: string): Promise<number> {
  const lignes = await executeur
    .select({ maximum: sql<string>`coalesce(max(${orgUnits.position}), 0)` })
    .from(orgUnits)
    .where(eq(orgUnits.missionId, missionId));

  return Number(lignes[0]?.maximum ?? 0);
}

// -----------------------------------------------------------------------------
// RÉFÉRENTIELS — `service_code` et `sector_code` du §35.2
// -----------------------------------------------------------------------------

/**
 * Les tables de correspondance `code → id` des deux référentiels que l'import CSV
 * résout.
 *
 * ⚠ **LUES EN UNE FOIS, PAS LIGNE PAR LIGNE.** Un import de 150 unités qui
 * interrogerait `services` à chaque ligne ferait 150 allers-retours pour lire une
 * table de onze lignes (11 §5). Les deux référentiels sont des SEEDS : ils tiennent
 * en mémoire, et la lecture est faite une seule fois, au début de la passe de
 * validation.
 *
 * `sectors` est filtré sur `is_active` : un secteur désactivé n'est plus une valeur
 * qu'on assigne — le proposer à l'import ressusciterait un référentiel qu'un
 * administrateur a délibérément retiré.
 */
export async function lireReferentiels(executeur: ExecuteurSql): Promise<{
  readonly servicesParCode: ReadonlyMap<string, string>;
  readonly secteursParCode: ReadonlyMap<string, string>;
}> {
  const lignesServices = await executeur
    .select({ id: services.id, code: services.code })
    .from(services);

  const lignesSecteurs = await executeur
    .select({ id: sectors.id, code: sectors.code })
    .from(sectors)
    .where(eq(sectors.isActive, true));

  return {
    servicesParCode: new Map(lignesServices.map((ligne) => [ligne.code, ligne.id])),
    secteursParCode: new Map(lignesSecteurs.map((ligne) => [ligne.code, ligne.id])),
  };
}

// -----------------------------------------------------------------------------
// ÉCRITURES — et la traduction des erreurs du pilote PostgreSQL
// -----------------------------------------------------------------------------

/** Code SQLSTATE d'une violation de clé primaire ou d'index unique (PostgreSQL). */
const VIOLATION_UNICITE = '23505';

/** Code SQLSTATE d'une violation de clé étrangère (PostgreSQL). */
const VIOLATION_CLE_ETRANGERE = '23503';

/** Code SQLSTATE d'une violation de contrainte CHECK (PostgreSQL). */
const VIOLATION_CHECK = '23514';

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
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/**
 * Lit `code` et `constraint` en REMONTANT la chaîne `cause`, sans `instanceof`.
 *
 * MESURÉ au CRUD des comptes et redit dans chaque dépôt parce que l'oublier coûte
 * un 500 au lieu d'un 400 : une requête qui échoue ne propage PAS l'erreur du
 * pilote. Drizzle lève une `DrizzleQueryError` et RANGE la `DatabaseError` de `pg`
 * dans sa propriété `cause` ; ni `code` ni `constraint` ne sont recopiés sur
 * l'enveloppe.
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
function traduireEchecDeContrainte(erreur: unknown): never {
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

  if (echec.code === VIOLATION_CHECK && echec.contrainte.startsWith('org_units_')) {
    throw new AppError(
      'VALIDATION_FAILED',
      "Une valeur de l'unité n'est pas admise par le modèle de données.",
      [{ path: 'orgUnit', message: `Contrainte violée : ${echec.contrainte}` }],
    );
  }

  throw erreur;
}

/**
 * Ce qu'une création d'unité fournit.
 *
 * `id` est TOUJOURS présent : il vient de l'appelant (UUID v7 client, P1-4) ou du
 * service (UUID v7 applicatif, 11 §2 — PostgreSQL 16 n'a pas d'`uuidv7()` native).
 * Le dépôt ne frappe jamais d'identifiant lui-même : deux endroits qui en frappent
 * finissent par en frapper deux.
 */
export interface NouvelleUniteOrg {
  readonly id: string;
  readonly missionId: string;
  readonly parentId: string | null;
  readonly kind: TypeUniteOrg;
  readonly name: string;
  readonly countryCode: string | null;
  readonly timezone: string | null;
  readonly headcount: number | null;
  readonly serviceRefId: string | null;
  readonly sectorId: string | null;
  readonly inScope: boolean;
  readonly status: StatutUniteOrg;
  readonly proposedBy: string | null;
  /**
   * NON NULLE À L'ÉCRITURE, même si la colonne l'admet (04). Lire une position
   * nulle est légitime — en ÉCRIRE une ne le serait pas : ce dépôt sait toujours
   * où placer ce qu'il insère (racine à 1, création à `max + 1`, import à la
   * suite), et laisser le choix ouvert inviterait un futur appelant à s'en
   * dispenser. On accepte l'existant, on ne le fabrique pas.
   */
  readonly position: number;
}

/** Les valeurs d'insertion, construites une fois pour les deux chemins d'écriture. */
function valeursInsertion(
  nouvelle: NouvelleUniteOrg,
  maintenant: Date,
): typeof orgUnits.$inferInsert {
  return {
    id: nouvelle.id,
    missionId: nouvelle.missionId,
    parentId: nouvelle.parentId,
    kind: nouvelle.kind,
    name: nouvelle.name,
    countryCode: nouvelle.countryCode,
    timezone: nouvelle.timezone,
    headcount: nouvelle.headcount,
    serviceRefId: nouvelle.serviceRefId,
    sectorId: nouvelle.sectorId,
    inScope: nouvelle.inScope,
    status: nouvelle.status,
    proposedBy: nouvelle.proposedBy,
    // Une unité ne NAÎT jamais fusionnée : `merged_into_id` est le résultat d'un
    // acte, écrit par `fusionnerUnite` et par lui seul.
    mergedIntoId: null,
    position: nouvelle.position,
    // `created_at` et `updated_at` sont posés PAR L'APPLICATION malgré leur défaut
    // SQL : un horodatage qui vient tantôt de l'application, tantôt de la base, rend
    // indécidable à la relecture d'un incident de quelle horloge on parle.
    createdAt: maintenant,
    updatedAt: maintenant,
  };
}

/** Insère UNE unité. N'ouvre pas de transaction : l'appelant en tient une. */
export async function insererUnite(
  executeur: ExecuteurSql,
  nouvelle: NouvelleUniteOrg,
  maintenant: Date,
): Promise<LigneUniteOrg> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .insert(orgUnits)
      .values(valeursInsertion(nouvelle, maintenant))
      .returning(COLONNES_UNITE);
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

/**
 * Taille d'un lot d'insertion à l'import.
 *
 * Un `INSERT` de 150 lignes tient largement dans une requête ; le découpage existe
 * pour le jour où quelqu'un importera 5 000 unités (`LIGNES_CSV_ARBRE_MAX`) : au-delà
 * de quelques centaines de lignes, le nombre de paramètres liés d'une seule requête
 * approche la limite du protocole PostgreSQL (65 535), et le dépassement se
 * manifesterait par une erreur du pilote au pire moment — au milieu d'un import.
 * 17 colonnes × 500 lignes = 8 500 paramètres : une marge de plus de sept fois.
 */
const LOT_INSERTION = 500;

/**
 * Insère N unités **dans l'ordre reçu**, par lots.
 *
 * ⚠ **L'APPELANT DOIT AVOIR TRIÉ LES PARENTS AVANT LEURS ENFANTS.** La clé
 * étrangère `org_units_parent_id_fkey` est vérifiée à chaque ligne (elle n'est pas
 * `DEFERRABLE` au fichier 04) : un enfant inséré avant son parent échoue. Ce tri est
 * une propriété de l'appelant, pas de cette fonction — écrit ici parce qu'un
 * appelant qui l'ignore obtiendrait une violation de clé étrangère parfaitement
 * mystérieuse.
 *
 * **Aucune transaction ouverte ici** : l'atomicité de l'import (§35.2, « une erreur
 * = rien d'importé ») est tenue par la transaction du service, qui englobe aussi le
 * garde-fou de ré-import. Une transaction par lot annulerait cette garantie.
 */
export async function insererUnites(
  executeur: ExecuteurSql,
  nouvelles: readonly NouvelleUniteOrg[],
  maintenant: Date,
): Promise<number> {
  let ecrites = 0;

  for (let debut = 0; debut < nouvelles.length; debut += LOT_INSERTION) {
    const lot = nouvelles.slice(debut, debut + LOT_INSERTION);
    if (lot.length === 0) continue;

    try {
      const inserees = await executeur
        .insert(orgUnits)
        .values(lot.map((nouvelle) => valeursInsertion(nouvelle, maintenant)))
        .returning({ id: orgUnits.id });
      ecrites += inserees.length;
    } catch (erreur: unknown) {
      return traduireEchecDeContrainte(erreur);
    }
  }

  return ecrites;
}

/** Les champs que `PATCH /v1/org-units/:id` peut toucher. `status` n'en est PAS. */
export interface ChampsUniteModifiables {
  readonly name?: string;
  readonly kind?: TypeUniteOrg;
  readonly parentId?: string | null;
  readonly countryCode?: string | null;
  readonly timezone?: string | null;
  readonly headcount?: number | null;
  readonly serviceRefId?: string | null;
  readonly sectorId?: string | null;
  readonly inScope?: boolean;
  readonly position?: number;
}

/**
 * Applique une modification. `updated_at` est TOUJOURS bousculé — le service
 * n'appelle cette fonction QUE si au moins un champ change réellement, et c'est
 * précisément la question à laquelle cette colonne répond.
 */
export async function mettreAJourUnite(
  executeur: ExecuteurSql,
  id: string,
  champs: ChampsUniteModifiables,
  maintenant: Date,
): Promise<LigneUniteOrg | null> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .update(orgUnits)
      .set({ ...champs, updatedAt: maintenant })
      .where(eq(orgUnits.id, id))
      .returning(COLONNES_UNITE);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

// -----------------------------------------------------------------------------
// LES DEUX GESTES DE QUALIFICATION — 03 §25.3
// -----------------------------------------------------------------------------

/**
 * Pose un statut d'unité. **LA SEULE ÉCRITURE DE `org_units.status` DE TOUT LE
 * CODE** — c'est ce qui rend vraie la phrase « les conditions du §25.3 s'appliquent
 * dans le service » : il n'y a qu'un chemin, et il passe par `validerUneUnite` ou
 * `fusionnerUneUnite`.
 *
 * ── LA CLAUSE `status = depuis`, QUI N'EST PAS DE LA CEINTURE INUTILE ────────
 * L'appelant tient déjà un `FOR UPDATE` sur la ligne, donc personne n'a pu la
 * changer entre-temps. Cette clause supplémentaire ne protège pas de la
 * concurrence : elle protège d'une FAUTE DE PROGRAMMATION — un futur appelant qui
 * aurait oublié le verrou. Elle rend alors `null` (donc un échec bruyant) au lieu
 * d'écraser un statut décidé sur un état périmé. Même raisonnement, et mêmes mots,
 * que `poserStatutMission`.
 *
 * `mergedIntoId` vaut `undefined` pour une validation (« ne touche pas à cette
 * colonne ») et l'identifiant de la cible pour une fusion. Il n'est **jamais remis
 * à `null`** : une fusion ne se défait pas en silence (invariant 7).
 */
export async function poserStatutUnite(
  executeur: ExecuteurSql,
  id: string,
  depuis: StatutUniteOrg,
  vers: StatutUniteOrg,
  mergedIntoId: string | undefined,
  maintenant: Date,
): Promise<LigneUniteOrg | null> {
  let lignes: LigneBrute[];
  try {
    lignes = await executeur
      .update(orgUnits)
      .set({
        status: vers,
        ...(mergedIntoId === undefined ? {} : { mergedIntoId }),
        updatedAt: maintenant,
      })
      .where(and(eq(orgUnits.id, id), eq(orgUnits.status, depuis)))
      .returning(COLONNES_UNITE);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  return ligne === undefined ? null : versLigne(ligne);
}

/**
 * Re-rattache à la CIBLE tous les entretiens de la source. Rend le décompte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUCUNE RÉPONSE N'EST TOUCHÉE, ET C'EST UNE PROPRIÉTÉ DU MODÈLE, PAS UNE CHANCE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Une `answer` ne référence JAMAIS une unité (04) : elle pend à un `interview`, qui
 * seul porte `org_unit_id`. Déplacer l'entretien déplace donc toutes ses réponses,
 * sans en lire une seule — et le nombre de réponses est strictement identique avant
 * et après. C'est ce qui fait qu'une fusion « ne perd aucune réponse par
 * construction » (`docs/conception/LOT_L3.md` §3e).
 *
 * `conducted_by` n'est PAS touché : le propriétaire d'une session (05 §9.9) est la
 * personne qui l'a menée, et une fusion d'unités ne change pas qui a parlé à qui.
 *
 * ⚠ `interviews.updated_at` EST bousculé : la colonne sert de curseur au pull delta
 * de la sync (05 §9.5, index `attachments(updated_at)` et son équivalent ici). Ne
 * pas la toucher ferait qu'un terrain déjà synchronisé garderait indéfiniment
 * l'ancien rattachement — un arbre juste au siège et faux sur l'iPad.
 */
export async function reattacherEntretiens(
  executeur: ExecuteurSql,
  sourceId: string,
  cibleId: string,
  maintenant: Date,
): Promise<number> {
  const lignes = await executeur
    .update(interviews)
    .set({ orgUnitId: cibleId, updatedAt: maintenant })
    .where(eq(interviews.orgUnitId, sourceId))
    .returning({ id: interviews.id });

  return lignes.length;
}

/**
 * Re-parente vers la CIBLE les unités filles de la source. Rend le décompte.
 *
 * Sans ce geste, fusionner une unité qui a des enfants les laisserait accrochés à
 * une unité `fusionnee` — une branche entière suspendue à un nœud qui déclare
 * n'être plus là. Le §25.3 ne le dit pas explicitement (il ne parle que des
 * entretiens), mais l'alternative — laisser les enfants — produit un arbre
 * incohérent, et l'autre alternative — les supprimer — est interdite par
 * l'invariant 7.
 */
export async function reparenterEnfants(
  executeur: ExecuteurSql,
  sourceId: string,
  cibleId: string,
  maintenant: Date,
): Promise<number> {
  const lignes = await executeur
    .update(orgUnits)
    .set({ parentId: cibleId, updatedAt: maintenant })
    .where(eq(orgUnits.parentId, sourceId))
    .returning({ id: orgUnits.id });

  return lignes.length;
}
