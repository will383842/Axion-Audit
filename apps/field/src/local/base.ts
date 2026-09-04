// =============================================================================
// LA BASE LOCALE — Dexie 4, schéma local VERSIONNÉ (05 §31-1, 05 §9.1)
//
// ── CE QUE CE MODULE EST ─────────────────────────────────────────────────────
// La SOURCE DE VÉRITÉ pendant la mission (invariant 1). L'interface lit toujours
// IndexedDB, jamais l'API (05 §9.2-3) : c'est ce qui rend la réactivité identique
// en ligne et hors ligne, et c'est aussi pourquoi une régression ici ne se voit
// pas au bureau mais chez le client.
//
// ── LE VERSIONNEMENT, ET LA RÈGLE QUI LE COMMANDE ────────────────────────────
// 05 §31-1 : « compatibilité ascendante du schéma local Dexie (migrations locales
// versionnées, testées) pour qu'une mise à jour n'invalide JAMAIS des données non
// synchronisées ». `SCHEMA_LOCAL` est donc une LISTE ORDONNÉE d'étapes, jamais un
// appel `version()` dispersé : ajouter une version, c'est ajouter une entrée, et
// le test « v_n → v_n+1 avec outbox non vide » (`LOT_L5.md` §4) a un objet à
// parcourir.
//
// ── LE RETOUR DE VERSION, QUI N'EST PAS UNE MIGRATION ────────────────────────
// Dexie (comme IndexedDB) **ne sait pas redescendre** : ouvrir une base créée par
// une version plus récente lève `VersionError`. Le réflexe — supprimer la base et
// repartir propre — détruirait des réponses non synchronisées : c'est
// exactement ce que l'invariant 7 interdit. `ouvrirBaseLocale()` intercepte donc
// ce cas et lève `BaseTropRecenteError`, que la coquille affiche comme un écran
// d'erreur avec une action ; **aucun chemin de ce fichier n'appelle `delete()`**.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E33 (sécurité / RGPD).
// =============================================================================
import Dexie, { type Table, type Transaction } from 'dexie';
import type { ActionOp, EntiteSync } from './contrat-sync.js';
import type { Enveloppe } from './enveloppe.js';
import type { LigneLocale, TableMiroir } from './formes.js';

// ─────────────────────────────────────────────────────────────────────────────
// L'OUTBOX — la file de montée (05 §9.2-2, 11 §4)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les états d'une opération en file.
 *
 * `LOT_L5.md` §3.3-① : « l'outbox est la SEULE file, et rien n'en sort sans une
 * réponse serveur ; `forbidden` et `error` vont vers un état VISIBLE, jamais vers
 * une suppression ». D'où trois états et pas deux : une op rejetée RESTE.
 */
export const STATUTS_OP_LOCALE = ['en_attente', 'rejetee', 'a_examiner'] as const;
export type StatutOpLocale = (typeof STATUTS_OP_LOCALE)[number];

/**
 * Une opération de la file locale.
 *
 * `opId` est un **UUID v7** (invariant 1, P1-4) : il est à la fois la clé
 * d'idempotence serveur (`processed_ops`, 11 §4) ET l'ordre de la file, puisque
 * l'UUID v7 est ordonnable dans le temps. Trier par `opId` PRÉSERVE l'ordre
 * d'écriture exigé par 11 §4 sans qu'aucun compteur ne puisse dériver.
 *
 * `charge` porte le `payload` de l'op — **chiffré**. C'est indispensable et pas
 * cosmétique : le payload contient le nom de l'interviewé et la valeur de la
 * réponse, et une outbox en clair rendrait le §3.2 faux pour toutes les données
 * qui n'ont pas encore été synchronisées, c'est-à-dire exactement les plus
 * exposées.
 */
export interface LigneOutbox {
  readonly opId: string;
  readonly missionId: string;
  readonly entite: EntiteSync;
  readonly entiteId: string;
  readonly action: ActionOp;
  readonly clientUpdatedAt: string;
  readonly queuedAt: string;
  readonly statut: StatutOpLocale;
  readonly tentatives: number;
  /** Message en français, sans donnée personnelle (11 §2). `null` tant que rien n'a échoué. */
  readonly derniereErreur: string | null;
  readonly charge: Enveloppe;
}

/**
 * `meta` : curseurs de sync par mission, `deviceId`, coffre, décalage d'horloge,
 * vue courante (05 §9.1, 03 §17.4 « rouvrir l'app = revenir à la question en
 * cours »). Une table clé-valeur, volontairement non typée par clé : elle porte
 * des natures hétérogènes et la typer par une union géante coûterait plus qu'elle
 * ne rapporte. Les clés, elles, sont énumérées ci-dessous.
 */
export interface LigneMeta {
  readonly cle: string;
  readonly valeur: unknown;
}

/** Les clés de `meta` connues du socle. Une clé littérale ne s'écrit nulle part ailleurs. */
export const CLES_META = {
  /** Identifiant stable de CET appareil (UUID v7), exigé par `lotPushSchema`. */
  appareil: 'appareil',
  /** Libellé lisible de l'appareil — `device_label` de l'en-tête `.axionbackup` (11 §4). */
  libelleAppareil: 'appareil:libelle',
  /** `{sel, parametres, dekEnveloppee}` — le coffre au repos (05 §9.7). */
  coffre: 'coffre',
  /** Décalage d'horloge estimé, en millisecondes (05 §9.2). */
  decalageHorloge: 'horloge:decalage',
  /** Jeton de rafraîchissement, CHIFFRÉ (11 §3, 05 §31-3). */
  jetonRafraichissement: 'auth:refresh',
  /** Dernière vue affichée, pour la reprise instantanée (03 §17.4). */
  vueCourante: 'nav:vue-courante',
  /** Préfixe du curseur de pull, une entrée par mission (05 §9.5). */
  prefixeCurseurPull: 'sync:since:',
  /** Préfixe des lignes descendantes CONSERVÉES au profit du local (invariant 7). */
  prefixeDescenteConservee: 'sync:conservees:',
  /**
   * Missions dont les DONNÉES sont présentes sur cet appareil.
   *
   * DECISIONS.md 2026-09-02, « Mission embarquée signifie données présentes,
   * jamais persistance accordée » : la marque n'est posée qu'après un premier
   * pull réussi. Elle répond à « puis-je collecter hors ligne sur cette
   * mission ? », et la seule réponse honnête dépend des données, pas du quota.
   */
  prefixeEmbarquement: 'mission:embarquee:',
  /**
   * Missions pour lesquelles `storage.persist()` a été ACCORDÉ (05 §31-2).
   *
   * État DISTINCT du précédent, et c'est tout l'objet de la décision ci-dessus :
   * le stockage prêt est une condition de l'embarquement, jamais l'embarquement.
   */
  prefixePersistance: 'mission:persistance:',
  /**
   * La version de schéma qui a RÉELLEMENT écrit cette base.
   *
   * Écrite à chaque ouverture par le code qui vient de poser (ou de retrouver) le
   * schéma. C'est le marqueur du garde-fou 05 §31-1 — voir `ouvrirBaseLocale`,
   * qui explique pourquoi Dexie ne peut plus nous le dire lui-même.
   */
  versionSchema: 'schema:version',
  // ── L5b (A22) — raccordement strictement nécessaire, append-only ─────────
  /**
   * L'identité de l'auditeur de cet appareil (`{id, profil}`), CHIFFRÉE comme le
   * jeton : c'est le `conducted_by` de toute session créée ici (05 §9.9) et le
   * `created_by` d'une note volante. Écrite par la connexion au siège.
   */
  utilisateur: 'auth:utilisateur',
  /** La session ouverte à l'écran d'entretien — reprise instantanée (03 §17.4). */
  sessionCourante: 'session:courante',
  /** Préfixe de la question courante, une entrée par session (03 §17.4). */
  prefixeQuestionCourante: 'session:question:',
} as const;

/** Clé du curseur de pull d'une mission donnée. */
export function cleCurseurPull(missionId: string): string {
  return `${CLES_META.prefixeCurseurPull}${missionId}`;
}

/** Clé de la présence des DONNÉES d'une mission sur cet appareil. */
export function cleEmbarquement(missionId: string): string {
  return `${CLES_META.prefixeEmbarquement}${missionId}`;
}

/** Clé de la persistance de stockage accordée pour une mission (05 §31-2). */
export function clePersistance(missionId: string): string {
  return `${CLES_META.prefixePersistance}${missionId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LE SCHÉMA VERSIONNÉ
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Une étape du schéma local. `tables` suit la syntaxe Dexie ; une valeur `null`
 * SUPPRIME une table (Dexie), ce qui ne doit jamais arriver sans migration de
 * reprise — d'où `migrer`, qui s'exécute DANS la transaction de mise à niveau.
 */
export interface EtapeSchemaLocal {
  readonly version: number;
  readonly tables: Readonly<Record<string, string | null>>;
  readonly migrer?: (transaction: Transaction) => Promise<void>;
}

/**
 * Le schéma local, version par version.
 *
 * Sur les index : seules les colonnes de la liste fermée du §3.2 y figurent
 * (`formes.ts`), plus le texte figé des questions, dont la même section autorise
 * explicitement l'indexation en clair. `*motsCles` est un index `multiEntry` :
 * c'est lui qui rend la recherche hors-parcours (03 §25.4) possible sans réseau
 * et sans déchiffrer 240 questions à chaque frappe.
 */
export const SCHEMA_LOCAL: readonly EtapeSchemaLocal[] = [
  {
    version: 1,
    tables: {
      missions: 'id, status',
      missionQuestions: 'id, missionId, position, [missionId+position], *motsCles, answerType',
      orgUnits: 'id, missionId, parentId, position',
      interviews:
        'id, missionId, orgUnitId, kind, status, scheduleStatus, scheduledAt, [missionId+status], clientUpdatedAt',
      answers:
        'id, missionId, interviewId, missionQuestionId, [interviewId+missionQuestionId], flagReview, horsParcours, clientUpdatedAt',
      attachments: 'id, missionId, interviewId, answerId, kind, clientUpdatedAt',
      workAssignments: 'id, missionId, orgUnitId',
      outbox: 'opId, missionId, entiteId, statut, [statut+opId], queuedAt',
      meta: 'cle',
    },
  },
];

/**
 * La version courante du schéma local.
 *
 * Dérivée de `SCHEMA_LOCAL` et NON écrite à la main : deux nombres qui doivent
 * rester égaux finissent toujours par diverger, et celui-ci commande une
 * migration de données terrain.
 */
export const VERSION_SCHEMA_LOCAL = SCHEMA_LOCAL.reduce(
  (max, etape) => Math.max(max, etape.version),
  0,
);

/**
 * Nom de la base IndexedDB.
 *
 * Invariant 2 : aucune référence client, ici comme ailleurs. Le nom est celui du
 * PRODUIT, et les missions cohabitent dans la même base — c'est ce qui permet à
 * `storage.estimate()` de dire une vérité utilisable sur l'espace consommé
 * (05 §31-2) plutôt qu'un chiffre par base.
 */
export const NOM_BASE_LOCALE = 'axion-terrain';

// ─────────────────────────────────────────────────────────────────────────────
// LA CLASSE
// ─────────────────────────────────────────────────────────────────────────────
export class BaseLocale extends Dexie {
  declare missions: Table<LigneLocale<'missions'>, string>;
  declare missionQuestions: Table<LigneLocale<'missionQuestions'>, string>;
  declare orgUnits: Table<LigneLocale<'orgUnits'>, string>;
  declare interviews: Table<LigneLocale<'interviews'>, string>;
  declare answers: Table<LigneLocale<'answers'>, string>;
  declare attachments: Table<LigneLocale<'attachments'>, string>;
  declare workAssignments: Table<LigneLocale<'workAssignments'>, string>;
  declare outbox: Table<LigneOutbox, string>;
  declare meta: Table<LigneMeta, string>;

  constructor(nom: string = NOM_BASE_LOCALE) {
    super(nom);
    for (const etape of SCHEMA_LOCAL) {
      const version = this.version(etape.version).stores({ ...etape.tables });
      const migrer = etape.migrer;
      if (migrer !== undefined) version.upgrade(migrer);
    }
  }

  /**
   * La table miroir correspondant à un nom. Passe par `Dexie.table()` plutôt que
   * par un accès de propriété pour que `ecriture.ts` puisse rester générique sans
   * indexer la classe par une chaîne — ce que `noUncheckedIndexedAccess` refuse à
   * juste titre.
   */
  miroir<T extends TableMiroir>(nom: T): Table<LigneLocale<T>, string> {
    return this.table<LigneLocale<T>, string>(nom);
  }
}

/**
 * La base n'est ouverte QUE par ici : le retour de version doit être intercepté
 * partout, et un `new BaseLocale()` dispersé le rendrait impossible à garantir.
 */
export class BaseTropRecenteError extends Error {
  override readonly name = 'BaseTropRecenteError';
  /** La version de schéma trouvée sur l'appareil. */
  readonly versionTrouvee: number;
  /** Celle que ce code sait lire. */
  readonly versionAttendue: number;

  // Champs déclarés puis affectés, plutôt que des propriétés de paramètre
  // (`constructor(readonly x)`) : ces dernières sont une construction TypeScript
  // qui EXIGE une transpilation complète. Sans elles, ce module s'exécute tel
  // quel sous le mode « strip-only » de Node — ce qui permet de MESURER le
  // garde-fou ci-dessous avec `fake-indexeddb` et trois lignes de script, au
  // lieu de le croire sur parole.
  constructor(versionTrouvee: number, versionAttendue: number = VERSION_SCHEMA_LOCAL) {
    super(
      'Les données de cet appareil ont été enregistrées par une version plus récente de l’application. ' +
        'Rien n’a été supprimé. Mettez l’application à jour (rechargez la page) avant de reprendre la collecte.',
    );
    this.versionTrouvee = versionTrouvee;
    this.versionAttendue = versionAttendue;
  }
}

/**
 * Ouvre la base locale.
 *
 * Le `catch` ne « rattrape » pas une panne : il traduit le SEUL cas où IndexedDB
 * refuse structurellement d'ouvrir — une base plus récente que le code. Toute
 * autre erreur remonte telle quelle : masquer une panne d'ouverture ferait croire
 * à une base vide, et une base vide invite à re-saisir par-dessus.
 */
/**
 * La version de schéma que la base DÉCLARE elle-même, ou `null` si elle ne le
 * déclare pas encore.
 *
 * ── POURQUOI CE MARQUEUR, ET PAS LA VERSION D'INDEXEDDB ─────────────────────
 * La version brute (`base.backendDB().version`) a été essayée puis REJETÉE, sur
 * mesure et non sur principe. Dexie encode sa version dans celle d'IndexedDB en
 * la multipliant par dix (mesuré : schémas 1 / 2 / 3 → bases 10 / 20 / 30), mais
 * il s'autorise aussi à l'incrémenter lui-même pour rattraper un schéma étendu
 * sans changement de numéro — la base tombe alors sur une valeur qui n'est plus
 * un multiple, et tout calcul qui en dépend devient faux. Un garde-fou assis sur
 * une convention interne qu'on a vue bouger en trois manipulations n'est pas un
 * garde-fou.
 *
 * Le marqueur ci-dessous est NOTRE donnée, à notre sémantique, et il est écrit
 * par `ouvrirBaseLocale` — le seul chemin d'ouverture de cette base (voir
 * l'en-tête du fichier). Une version future n'a donc rien à « penser à faire » :
 * elle hérite du marquage en passant par la porte commune.
 *
 * **L'angle mort, nommé plutôt que masqué** : une base migrée par un code qui
 * contournerait `ouvrirBaseLocale` ne porterait pas de marqueur, et ne serait pas
 * détectée. Aucune mesure disponible côté navigateur ne comble ce trou ; ce qui
 * le ferme, c'est la règle d'ouverture unique, pas une astuce.
 */
async function versionDeclareeParLaBase(base: BaseLocale): Promise<number | null> {
  const marque = await lireMeta(base, CLES_META.versionSchema);
  return typeof marque === 'number' && Number.isInteger(marque) ? marque : null;
}

/**
 * Ouvre la base locale, et REFUSE une base plus récente que ce code (05 §31-1).
 *
 * ── POURQUOI `Dexie.VersionError` NE SUFFIT PAS, ET C'EST MESURÉ ─────────────
 * Ce garde-fou reposait sur `Dexie.VersionError`. **Dexie 4 ne le lève plus.**
 * Mesure faite sur `dexie` 4.4.5 avec `fake-indexeddb`, base créée en version 2
 * puis rouverte par un code qui ne déclare que la version 1 :
 *   - aucune erreur : `open()` réussit et `isOpen()` rend `true` ;
 *   - `base.verno` rend **1**, c'est-à-dire la version DÉCLARÉE par le code et
 *     non celle du disque : il ne peut rien détecter du tout ;
 *   - les données de la table inconnue SURVIVENT — rien n'est détruit.
 *
 * Rien n'était donc perdu, mais l'application tournait EN AVEUGLE sur un schéma
 * qu'elle ne connaît pas : elle lit des lignes dont elle ignore la forme et en
 * écrit que la version récente relira de travers. C'est la famille de défauts que
 * ce dépôt traque — un garde-fou qui annonce plus qu'il ne fait — et c'est le
 * TESTEUR qui l'a prouvée, pas la relecture.
 *
 * Le `catch` reste : `VersionError` peut encore survenir sur d'autres chemins, et
 * le traduire coûte trois lignes. Il n'est simplement plus la seule défense.
 *
 * **Aucun chemin de cette fonction n'appelle `delete()`** : une base qu'on ne
 * sait pas lire n'est pas une base à jeter (invariant 7).
 */
export async function ouvrirBaseLocale(nom: string = NOM_BASE_LOCALE): Promise<BaseLocale> {
  const base = new BaseLocale(nom);
  try {
    await base.open();
  } catch (erreur) {
    if (erreur instanceof Dexie.VersionError) {
      base.close();
      // La version exacte est inconnue sur ce chemin ; elle est forcément
      // supérieure à la nôtre, c'est tout ce que l'écran a besoin de dire.
      throw new BaseTropRecenteError(VERSION_SCHEMA_LOCAL + 1);
    }
    throw erreur;
  }

  const declaree = await versionDeclareeParLaBase(base);
  if (declaree !== null && declaree > VERSION_SCHEMA_LOCAL) {
    base.close();
    throw new BaseTropRecenteError(declaree);
  }

  // La base est lisible : on marque la version qui vient de la poser. Écrit
  // seulement s'il change — dont le cas d'une base créée avant l'existence de ce
  // marqueur, qui se met ainsi en règle d'elle-même au premier démarrage.
  if (declaree !== VERSION_SCHEMA_LOCAL) {
    await ecrireMeta(base, CLES_META.versionSchema, VERSION_SCHEMA_LOCAL);
  }

  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCÈS `meta` — les seules écritures hors du port d'écriture, et elles le sont
// par nature : `meta` ne se synchronise pas, elle n'a donc pas d'op d'outbox.
// ─────────────────────────────────────────────────────────────────────────────
export async function lireMeta(base: BaseLocale, cle: string): Promise<unknown> {
  const ligne = await base.meta.get(cle);
  return ligne?.valeur;
}

export async function ecrireMeta(base: BaseLocale, cle: string, valeur: unknown): Promise<void> {
  await base.meta.put({ cle, valeur });
}

export async function effacerMeta(base: BaseLocale, cle: string): Promise<void> {
  await base.meta.delete(cle);
}
