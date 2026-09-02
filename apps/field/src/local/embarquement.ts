// =============================================================================
// EMBARQUEMENT D'UNE MISSION — 05 §31-2, et un REFUS EXPLICITE assumé
//
// ── CE QUI EST LIVRÉ ICI, ET CE QUI NE L'EST PAS ────────────────────────────
// LIVRÉ : la porte du 05 §31-2. `navigator.storage.persist()` est demandé, et
// **son refus rend la mission NON EMBARQUÉE** — pas embarquée avec un
// avertissement qu'on clique pour passer outre. L'écran guide (installation sur
// l'écran d'accueil, libération d'espace).
//
// NON LIVRÉ : le PREMIER PULL. `LOT_L5.md` §1 le donne à L5a, mais il dépend de
// L3d (figeage du questionnaire), qui n'est pas livré : sans questionnaire figé,
// il n'y a rien à descendre. Plutôt que d'écrire un pull contre une API qui ne
// répond pas encore — donc un code que personne ne peut exécuter et que personne
// ne relira avant qu'il ne soit faux —, l'interface est publiée et
// l'implémentation REFUSE, en le disant.
//
// C'est le même parti que le port de sync inerte (`local/port-sync.ts`) et pour la même
// raison : un embarquement qui « réussirait » sans données produirait une mission
// vide sur l'appareil, et l'auditeur ne s'en apercevrait que chez le client.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E38 (sauvegarde terrain).
// =============================================================================
import { cleEmbarquement, ecrireMeta, lireMeta, type BaseLocale } from './base.js';
import { maintenant } from './horloge.js';
import { alerteEspace, exigerPersistance, type EtatStockage } from './stockage.js';

export type MotifRefusEmbarquement =
  'persistance_refusee' | 'espace_insuffisant' | 'premier_pull_indisponible';

export type ResultatEmbarquement =
  | {
      readonly statut: 'embarquee';
      readonly missionId: string;
      readonly embarqueeLe: string;
      readonly etatStockage: EtatStockage;
    }
  | {
      readonly statut: 'refuse';
      readonly motif: MotifRefusEmbarquement;
      /** Cause + action, en français (03 §17.6, §33.2). */
      readonly guidage: string;
      readonly etatStockage: EtatStockage;
    };

/**
 * Une mission a-t-elle été embarquée sur cet appareil ?
 *
 * La marque est posée dans `meta` APRÈS que la persistance a été accordée : elle
 * répond à « puis-je collecter hors ligne sur cette mission ? », pas à « ai-je
 * cliqué quelque part ? ».
 */
export async function missionEmbarquee(base: BaseLocale, missionId: string): Promise<boolean> {
  return (await lireMeta(base, cleEmbarquement(missionId))) !== undefined;
}

/**
 * Étape 1 de l'embarquement : la persistance du stockage (05 §31-2).
 *
 * Livrée et exécutable dès aujourd'hui, indépendamment du pull : c'est elle qui
 * porte le critère de recette « refus de `persist()` ⇒ mission non embarquée »
 * (`LOT_L5.md` §4, E2E @critique).
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
      etatStockage: persistance.etat,
    };
  }

  const alerte = alerteEspace(persistance.etat);
  if (persistance.etat.niveau === 'critique') {
    return {
      statut: 'refuse',
      motif: 'espace_insuffisant',
      guidage:
        alerte ??
        'L’espace de stockage de cet appareil est saturé. Libérez de l’espace avant d’embarquer la mission.',
      etatStockage: persistance.etat,
    };
  }

  const embarqueeLe = maintenant();
  await ecrireMeta(base, cleEmbarquement(missionId), embarqueeLe);
  return { statut: 'embarquee', missionId, embarqueeLe, etatStockage: persistance.etat };
}

/**
 * Étape 2 : le premier pull, COMPLET (05 §9.5 : « premier pull = mission
 * complète »). **Non implémentée à l'incrément L5a.**
 *
 * La signature est publiée pour que L5c et L6b s'y branchent sans rien renommer ;
 * l'implémentation refuse explicitement. Ne pas la « faire marcher » en rendant
 * un succès : ce serait le mensonge décrit en tête de fichier.
 */
export async function embarquerMission(
  base: BaseLocale,
  missionId: string,
): Promise<ResultatEmbarquement> {
  const stockage = await preparerStockagePourMission(base, missionId);
  if (stockage.statut === 'refuse') return stockage;

  return {
    statut: 'refuse',
    motif: 'premier_pull_indisponible',
    guidage:
      'Le téléchargement d’une mission n’est pas encore disponible dans cette version : le questionnaire de mission doit d’abord être figé côté siège. L’espace de stockage de cet appareil est prêt.',
    etatStockage: stockage.etatStockage,
  };
}
