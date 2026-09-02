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
  /** Missions dont `storage.persist()` a été accordé (05 §31-2). */
  prefixeEmbarquement: 'mission:embarquee:',
} as const;

/** Clé du curseur de pull d'une mission donnée. */
export function cleCurseurPull(missionId: string): string {
  return `${CLES_META.prefixeCurseurPull}${missionId}`;
}

/** Clé de l'état d'embarquement d'une mission (05 §31-2). */
export function cleEmbarquement(missionId: string): string {
  return `${CLES_META.prefixeEmbarquement}${missionId}`;
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
  constructor(readonly versionAttendue: number) {
    super(
      'Les données de cet appareil ont été enregistrées par une version plus récente de l’application. ' +
        'Rien n’a été supprimé. Mettez l’application à jour (rechargez la page) avant de reprendre la collecte.',
    );
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
export async function ouvrirBaseLocale(nom: string = NOM_BASE_LOCALE): Promise<BaseLocale> {
  const base = new BaseLocale(nom);
  try {
    await base.open();
  } catch (erreur) {
    if (erreur instanceof Dexie.VersionError) {
      base.close();
      throw new BaseTropRecenteError(VERSION_SCHEMA_LOCAL);
    }
    throw erreur;
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
