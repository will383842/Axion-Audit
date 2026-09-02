// =============================================================================
// EMBARQUEMENT D'UNE MISSION — 05 §31-2, et deux états qu'on ne confond plus
//
// ── CE QUI EST LIVRÉ ICI ────────────────────────────────────────────────────
// La porte du 05 §31-2. `navigator.storage.persist()` est demandé, et **son refus
// rend la mission NON EMBARQUÉE** — pas embarquée avec un avertissement qu'on
// clique pour passer outre. L'écran guide (installation sur l'écran d'accueil,
// libération d'espace).
//
// ── LES DEUX ÉTATS, ET POURQUOI ILS NE SE CONFONDENT PLUS ───────────────────
// `DECISIONS.md` 2026-09-02, « Mission embarquée signifie données présentes,
// jamais persistance accordée » (bloquant B4 de la revue A29) : ce module posait
// la marque `mission:embarquee` dès que le quota était accordé, PUIS refusait le
// pull. `missionEmbarquee()` répondait donc « oui » sur une mission qui n'avait
// pas une seule ligne, et l'écran d'accueil affichait deux messages contraires.
//
//   `persistanceAccordee(mission)` → le stockage est prêt (condition) ;
//   `missionEmbarquee(mission)`    → les données SONT là (résultat).
//
// La question à laquelle la seconde répond est « puis-je collecter hors ligne sur
// cette mission ? » : la seule réponse honnête dépend des données, pas du quota.
//
// ── CE QUI N'EST PAS LIVRÉ, ET CE N'EST PLUS UNE OPINION ────────────────────
// Le PREMIER PULL est **descopé de L5a vers L6a** — `DECISIONS.md` 2026-09-02,
// « Liste fermée §3.2 […] ; le premier pull est descopé vers L6a » (réserve
// R-L5a-10). L3d (figeage du questionnaire) est livré ; l'obstacle restant est
// l'endpoint serveur, que L6a livre et consomme. `marquerMissionEmbarquee` est la
// porte qu'il appellera : c'est le SEUL endroit qui pose la marque, et il exige
// d'avoir vu des lignes.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E38 (sauvegarde terrain).
// =============================================================================
import { cleEmbarquement, clePersistance, ecrireMeta, lireMeta, type BaseLocale } from './base.js';
import { maintenant } from './horloge.js';
import { alerteEspace, exigerPersistance, type EtatStockage } from './stockage.js';

export type MotifRefusEmbarquement =
  'persistance_refusee' | 'espace_insuffisant' | 'premier_pull_indisponible';

/** L'état du stockage POUR CETTE MISSION — la condition, jamais le résultat. */
export type EtatPersistance = 'accordee' | 'refusee' | 'indisponible';

export type ResultatEmbarquement =
  | {
      readonly statut: 'embarquee';
      readonly missionId: string;
      readonly embarqueeLe: string;
      readonly persistance: EtatPersistance;
      readonly etatStockage: EtatStockage;
    }
  | {
      readonly statut: 'refuse';
      readonly motif: MotifRefusEmbarquement;
      /** Cause + action, en français (03 §17.6, §33.2). */
      readonly guidage: string;
      readonly persistance: EtatPersistance;
      readonly etatStockage: EtatStockage;
    };

/**
 * Les DONNÉES de cette mission sont-elles présentes sur cet appareil ?
 *
 * `false` tant qu'aucun pull n'a réussi, même si le stockage est prêt — c'est
 * exactement la distinction que la revue A29 a réclamée (B4).
 */
export async function missionEmbarquee(base: BaseLocale, missionId: string): Promise<boolean> {
  return (await lireMeta(base, cleEmbarquement(missionId))) !== undefined;
}

/** Le stockage a-t-il été rendu persistant pour cette mission (05 §31-2) ? */
export async function persistanceAccordee(base: BaseLocale, missionId: string): Promise<boolean> {
  return (await lireMeta(base, clePersistance(missionId))) !== undefined;
}

/**
 * Pose la marque « données présentes ».
 *
 * **Appelée par L6a, à l'issue d'un premier pull qui a réellement écrit des
 * lignes**, et par personne d'autre. Elle refuse de mentir : sans persistance
 * accordée, il n'y a rien à garantir hors ligne, donc rien à marquer.
 */
export async function marquerMissionEmbarquee(
  base: BaseLocale,
  missionId: string,
): Promise<boolean> {
  if (!(await persistanceAccordee(base, missionId))) return false;
  await ecrireMeta(base, cleEmbarquement(missionId), maintenant());
  return true;
}

/**
 * Étape 1 : la persistance du stockage (05 §31-2).
 *
 * Exécutable dès aujourd'hui, indépendamment du pull : c'est elle qui porte le
 * critère de recette « refus de `persist()` ⇒ mission non embarquée »
 * (`LOT_L5.md` §4, E2E @critique). Elle ne pose QUE la marque de persistance.
 */
export async function preparerStockagePourMission(
  base: BaseLocale,
  missionId: string,
): Promise<ResultatEmbarquement> {
  const persistance = await exigerPersistance();
  if (!persistance.accordee) {
    return {
      statut: 'refuse',
      motif: 'persistance_refusee',
      guidage: persistance.guidage,
      persistance: persistance.motif === 'api_indisponible' ? 'indisponible' : 'refusee',
      etatStockage: persistance.etat,
    };
  }

  if (persistance.etat.niveau === 'critique') {
    return {
      statut: 'refuse',
      motif: 'espace_insuffisant',
      guidage:
        alerteEspace(persistance.etat) ??
        'L’espace de stockage de cet appareil est saturé. Libérez de l’espace avant d’embarquer la mission.',
      persistance: 'accordee',
      etatStockage: persistance.etat,
    };
  }

  await ecrireMeta(base, clePersistance(missionId), maintenant());
  return {
    statut: 'refuse',
    motif: 'premier_pull_indisponible',
    guidage:
      'Le stockage de cet appareil est prêt pour cette mission. Le téléchargement des données n’est pas encore disponible dans cette version.',
    persistance: 'accordee',
    etatStockage: persistance.etat,
  };
}

/**
 * Étape 2 : le premier pull, COMPLET (05 §9.5 : « premier pull = mission
 * complète »). **Descopé vers L6a** — voir l'en-tête et `DECISIONS.md` du
 * 2026-09-02.
 *
 * La signature est publiée pour que L5c et L6b s'y branchent sans rien renommer ;
 * l'implémentation prépare le stockage et refuse le pull, en le disant. Ne pas la
 * « faire marcher » en rendant un succès : une mission embarquée sans données ne
 * se découvrirait que chez le client.
 */
export async function embarquerMission(
  base: BaseLocale,
  missionId: string,
): Promise<ResultatEmbarquement> {
  const stockage = await preparerStockagePourMission(base, missionId);
  if (stockage.statut === 'refuse' && stockage.motif !== 'premier_pull_indisponible') {
    return stockage;
  }

  return {
    statut: 'refuse',
    motif: 'premier_pull_indisponible',
    guidage:
      'Le téléchargement d’une mission arrive avec la synchronisation (lot L6a) : c’est l’API de descente qui manque, pas le questionnaire. ' +
      'Le stockage de cet appareil est prêt et la conservation des données est garantie.',
    persistance: stockage.persistance,
    etatStockage: stockage.etatStockage,
  };
}
