// =============================================================================
// LE PORT D'ÉCRITURE — 05 §9.2, 11 §4, `LOT_L5.md` §2
//
// ── LA RÈGLE QUE CE FICHIER EXISTE POUR TENIR ────────────────────────────────
// **Aucune écriture Dexie n'a lieu ailleurs que dans ce module** (hors `meta`,
// qui ne se synchronise pas). C'est le seul moyen que 05 §9.2-2 — « CHAQUE
// écriture pousse une opération dans l'outbox » — soit vrai par construction et
// non par vigilance. Un seul écran qui écrirait directement dans `answers`
// produirait une réponse que la sync ne remonterait jamais : une donnée d'audit
// perdue, découverte au montage du rapport, des semaines plus tard.
// La règle est outillée par un test ESLint d'A26 (`LOT_L5.md` §4).
//
// ── LES DEUX FONCTIONS, ET CE QUI LES OPPOSE ─────────────────────────────────
//   `ecrireLocal`        : ce que fait L'AUDITEUR. Ligne + op, dans UNE seule
//                          transaction Dexie. Si l'une échoue, aucune des deux
//                          n'est écrite.
//   `appliquerDescente`  : ce que fait le SERVEUR. Écrit les lignes et **JAMAIS
//                          l'outbox** — sinon le terrain renverrait au serveur ce
//                          qu'il vient d'en recevoir, indéfiniment.
// La garantie n'est pas un commentaire : la transaction de `appliquerDescente`
// N'INCLUT PAS la table `outbox`, donc toute écriture y lèverait une erreur Dexie.
//
// ── L'ORDRE DES OPÉRATIONS, QUI N'EST PAS UN DÉTAIL ──────────────────────────
// Le chiffrement se fait AVANT d'ouvrir la transaction. Une transaction IndexedDB
// se referme dès qu'elle rend la main à une promesse qui ne lui appartient pas —
// et `crypto.subtle` en est une. Chiffrer dans la transaction produirait des
// `TransactionInactiveError` intermittents, c'est-à-dire le pire des défauts :
// celui qui ne se reproduit pas.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E7 (remontée continue dès
// qu'il y a du réseau).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import type { Table } from 'dexie';
import type { ActionOp, EntiteSync } from './contrat-sync.js';
import {
  cleCurseurPull,
  CLES_META,
  type BaseLocale,
  type LigneOutbox,
  type StatutOpLocale,
} from './base.js';
import { contexteLocal } from './contexte.js';
import type { Enveloppe } from './enveloppe.js';
import type { ChargeDeTable, IndexDeTable, TableMiroir } from './formes.js';
import { maintenant, reglerDecalage, decalageActuelMs } from './horloge.js';

// ─────────────────────────────────────────────────────────────────────────────
// LA CORRESPONDANCE ENTITÉ DE SYNC → TABLE MIROIR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 11 §4 nomme cinq entités montantes ; 05 §9.1 nomme sept tables miroirs. Les
 * deux listes ne coïncident pas, et c'est normal : `missions` et
 * `workAssignments` descendent seulement (05 §9.4, « les entités siège ne sont
 * JAMAIS modifiées depuis le terrain »).
 *
 * `question_adhoc` pointe sur `missionQuestions` : localement, une question ad hoc
 * EST une ligne de questionnaire de mission. Côté serveur, la même op crée les
 * deux lignes atomiquement (11 §4) — c'est le serveur qui porte cette dualité,
 * pas le terrain.
 */
export const TABLE_PAR_ENTITE = {
  interview: 'interviews',
  answer: 'answers',
  attachment_meta: 'attachments',
  org_unit_proposal: 'orgUnits',
  question_adhoc: 'missionQuestions',
} as const satisfies Record<EntiteSync, TableMiroir>;

export type TablePourEntite<E extends EntiteSync> = (typeof TABLE_PAR_ENTITE)[E];

/**
 * Les clés d'index EN CLAIR à fournir pour une entité — QUATRE en sont retirées,
 * parce que le port les pose lui-même : `id`, `missionId`, `clientUpdatedAt` et
 * `supprimeLe`.
 *
 * Pour `clientUpdatedAt`, la raison est l'arbitrage des conflits : si l'appelant
 * le fournissait, il l'obtiendrait tôt ou tard d'un `new Date()`, et 05 §9.4 fait
 * de cet horodatage le juge du dernier-écrit-gagne. Le décalage serveur (05 §9.2)
 * doit être appliqué à UN seul endroit — ici.
 *
 * Pour `id` et `missionId`, la raison est un DÉFAUT RÉEL, trouvé par le testeur.
 * `DemandeEcriture` les porte déjà à son niveau supérieur ; les redemander dans
 * `index` créait deux exemplaires de la même donnée, et le port n'en recopiait
 * qu'un — `id`. Une ligne écrite par `ecrireLocal` n'était donc pas retrouvable
 * par `where('missionId')`, ce qui casse SANS BRUIT « décharger la mission »
 * (05 §9.7 : purge locale après sync intégrale vérifiée) et tout export par
 * mission. Le typage n'y pouvait rien : les deux copies étaient exigées, jamais
 * comparées. Une seule source de vérité supprime la question.
 */
export type ClesIndex<E extends EntiteSync> = Omit<
  IndexDeTable<TablePourEntite<E>>,
  'id' | 'missionId' | 'clientUpdatedAt' | 'supprimeLe'
>;

/** La charge chiffrable d'une entité — tout ce qui n'est pas dans la liste fermée §3.2. */
export type ChargeUtile<E extends EntiteSync> = ChargeDeTable<TablePourEntite<E>>;

// ─────────────────────────────────────────────────────────────────────────────
// L'ACCÈS AU CONTEXTE
// ─────────────────────────────────────────────────────────────────────────────
// Base et coffre viennent de `contexte.ts`, installés UNE fois au déverrouillage.
//
// Pourquoi pas un paramètre de `ecrireLocal` : la signature publiée
// (`LOT_L5.md` §2) est `ecrireLocal({entite, id, missionId, action, index,
// charge})`, et L5b l'appellera depuis une trentaine d'endroits. Faire transiter
// la base ET le coffre dans chacun d'eux garantirait qu'un écran finisse par les
// chercher ailleurs. Le corollaire est assumé et voulu : après `verrouiller()`, le
// contexte est retiré et toute écriture LÈVE (05 §9.7).

/** Ce que Dexie stocke réellement : l'en-tête d'index en clair + la charge chiffrée. */
type LigneEcrite = { readonly id: string; readonly charge: Enveloppe } & Record<string, unknown>;

function tableDe(base: BaseLocale, nom: TableMiroir): Table<LigneEcrite, string> {
  return base.table<LigneEcrite, string>(nom);
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉCRITURE LOCALE — le geste de l'auditeur
// ─────────────────────────────────────────────────────────────────────────────
export interface DemandeEcriture<E extends EntiteSync> {
  readonly entite: E;
  /** UUID v7 **généré sur l'appareil** (invariant 1, P1-4) — jamais un id serveur. */
  readonly id: string;
  readonly missionId: string;
  readonly action: ActionOp;
  readonly index: ClesIndex<E>;
  readonly charge: ChargeUtile<E>;
}

/**
 * Écrit une ligne locale ET son opération de montée, dans UNE transaction.
 *
 * 03 §17.4 : « enregistrement continu, aucun bouton sauvegarder nulle part ». Le
 * critère d'acceptation qui va avec (§17.7-2) est « coupure de courant en pleine
 * saisie = zéro perte » : c'est l'atomicité ci-dessous qui le tient, et c'est elle
 * que le test @critique d'A26 met à l'épreuve en tuant l'onglet.
 */
export async function ecrireLocal<E extends EntiteSync>(
  demande: DemandeEcriture<E>,
): Promise<void> {
  const { base, coffre } = contexteLocal();
  const nom: TableMiroir = TABLE_PAR_ENTITE[demande.entite];
  const horodatage = maintenant();

  // Les quatre clés que le port possède viennent APRÈS l'étalement de `index` :
  // elles ne sont pas surchargeables par l'appelant, et c'est le but.
  const enTete = {
    ...demande.index,
    id: demande.id,
    missionId: demande.missionId,
    clientUpdatedAt: horodatage,
    supprimeLe: demande.action === 'delete_soft' ? horodatage : null,
  } as unknown as Record<string, unknown> & { id: string };

  // Chiffrement AVANT la transaction — voir l'en-tête du fichier.
  // Deux enveloppes distinctes, et non une réutilisée : la ligne ne porte que sa
  // charge, l'op porte l'entité COMPLÈTE (le serveur n'a pas nos index locaux).
  const chargeLigne = await coffre.chiffrer(demande.charge);
  const chargeOp = await coffre.chiffrer({ ...enTete, ...demande.charge });

  const op: LigneOutbox = {
    opId: uuidv7(),
    missionId: demande.missionId,
    entite: demande.entite,
    entiteId: demande.id,
    action: demande.action,
    clientUpdatedAt: horodatage,
    queuedAt: horodatage,
    statut: 'en_attente' satisfies StatutOpLocale,
    tentatives: 0,
    derniereErreur: null,
    charge: chargeOp,
  };

  await base.transaction('rw', tableDe(base, nom), base.outbox, async () => {
    await tableDe(base, nom).put({ ...enTete, charge: chargeLigne });
    await base.outbox.add(op);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DESCENTE — ce que le serveur envoie
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Un enregistrement descendant, DÉJÀ traduit dans les formes locales.
 *
 * La traduction « ligne serveur en snake_case → forme locale » appartient au pull
 * (L6b) : la mettre ici ferait de ce module un client HTTP, et il n'en est pas un.
 * L'union discriminée par `table` interdit au compilateur d'apparier l'index
 * d'une table avec la charge d'une autre.
 */
export type EnregistrementDescendant = {
  [T in TableMiroir]: {
    readonly table: T;
    readonly index: IndexDeTable<T>;
    readonly charge: ChargeDeTable<T>;
  };
}[TableMiroir];

export interface LotDescendant {
  readonly missionId: string;
  /** 11 §4 : le `serverTime` du pull — la source du décalage d'horloge (05 §9.2). */
  readonly serverTime: string;
  /** Curseur à persister PAR MISSION (05 §9.5). `null` = fin du delta. */
  readonly prochainSince: string | null;
  readonly enregistrements: readonly EnregistrementDescendant[];
}

/**
 * Applique une descente.
 *
 * Deux garde-fous, tous deux au service de l'invariant 7 :
 *   1. **une ligne qui a une op EN ATTENTE dans l'outbox n'est jamais écrasée** —
 *      le travail non synchronisé de l'auditeur passe avant tout ;
 *   2. à défaut, `clientUpdatedAt` arbitre (05 §9.4, dernier écrit gagne par
 *      LIGNE) — une descente plus ANCIENNE que la ligne locale ne l'écrase pas.
 * Ce qui est conservé n'est pas passé sous silence : le compte est écrit dans
 * `meta`, pour que L6b puisse le montrer (« n élément(s) conservé(s) »).
 *
 * Rend `void` (signature publiée `LOT_L5.md` §2).
 */
export async function appliquerDescente(lot: LotDescendant): Promise<void> {
  const { base, coffre } = contexteLocal();

  // Le décalage d'horloge se règle AVANT tout : les écritures qui suivent, y
  // compris celles de l'auditeur pendant le pull, doivent déjà en bénéficier.
  reglerDecalage(lot.serverTime);

  // Lecture PRÉALABLE de la file — hors de la transaction d'écriture, qui
  // n'inclura pas `outbox`.
  const enAttente = new Set(
    (await base.outbox.where('statut').equals('en_attente').toArray()).map((op) => op.entiteId),
  );

  // Chiffrement de toutes les charges avant d'ouvrir la transaction.
  const prets: { nom: TableMiroir; enTete: LigneEcrite }[] = [];
  for (const enr of lot.enregistrements) {
    const charge = await coffre.chiffrer(enr.charge);
    prets.push({
      nom: enr.table,
      enTete: { ...enr.index, charge },
    });
  }

  const tablesTouchees = [...new Set(prets.map((p) => p.nom))].map((nom) => tableDe(base, nom));
  let conservees = 0;

  // `outbox` est ABSENTE de cette liste : c'est la garantie structurelle qu'une
  // descente ne peut pas fabriquer d'op. Dexie lèverait si on essayait.
  await base.transaction('rw', [...tablesTouchees, base.meta], async () => {
    for (const pret of prets) {
      const table = tableDe(base, pret.nom);
      const identifiant = pret.enTete.id;
      if (enAttente.has(identifiant)) {
        conservees += 1;
        continue;
      }
      const existante = await table.get(identifiant);
      const localeIso =
        typeof existante?.clientUpdatedAt === 'string' ? existante.clientUpdatedAt : null;
      const entranteIso =
        typeof pret.enTete.clientUpdatedAt === 'string' ? pret.enTete.clientUpdatedAt : null;
      if (localeIso !== null && entranteIso !== null && localeIso > entranteIso) {
        conservees += 1;
        continue;
      }
      await table.put(pret.enTete);
    }

    await base.meta.put({
      cle: cleCurseurPull(lot.missionId),
      valeur: lot.prochainSince,
    });
    await base.meta.put({ cle: CLES_META.decalageHorloge, valeur: decalageActuelMs() });
    if (conservees > 0) {
      await base.meta.put({
        cle: `${CLES_META.prefixeDescenteConservee}${lot.missionId}`,
        valeur: conservees,
      });
    }
  });
}
