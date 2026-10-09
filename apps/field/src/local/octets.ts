// =============================================================================
// LES OCTETS DES PIÈCES, SUR L'APPAREIL — lot L6c-1 « les octets » (ex-L5f).
//
// 05 §9.6 : « Une réponse peut être synchronisée avant sa photo ; l'attachement
// porte son propre statut. » 05 §9.7 : IndexedDB chiffré au niveau applicatif.
// 03 §29 R2 : la photo est compressée AVANT stockage, l'original n'est pas gardé
// (c'est `session/photos-locales.ts` qui compresse ; ce module range).
//
// ── CE QUE CE MODULE GARANTIT ────────────────────────────────────────────────
//   · les octets ne sont JAMAIS en clair dans IndexedDB : ils passent par
//     l'enveloppe AES-GCM du coffre, comme toute charge locale ;
//   · ligne `attachments` + octets + op d'outbox s'écrivent dans UNE transaction
//     (05 §9.2) : une pièce n'existe jamais sans ses octets, ni l'inverse ;
//   · le statut d'envoi (`a_envoyer` → `envoyee` | `en_echec`) est persistant —
//     il survit à un redémarrage, et la reprise d'un envoi s'appuie dessus ;
//   · marquer « envoyée » ne supprime rien (invariant 7).
//
// Traçabilité : E6, E33, E38 · invariants 1, 7 et 8 · 05 §9.2, §9.6, §9.7.
// =============================================================================
import { z } from 'zod';
import type { Table } from 'dexie';
import type { BaseLocale, LigneOctetsPiece, StatutEnvoiLocal } from './base.js';
import type { Coffre } from './coffre.js';
import { contexteLocal } from './contexte.js';
import { depuisBase64, versBase64 } from './enveloppe.js';
import {
  ecrireLocalAvecAnnexe,
  ecrireStatutEnvoiPiece,
  rangerLigneOctetsPiece,
  type AnnexeEcriture,
  type DemandeEcriture,
} from './ecriture.js';

/** La table Dexie des octets (schéma local v2), clé = id de la pièce. */
export const TABLE_OCTETS = 'octetsPieces';

/** Les statuts d'envoi d'une pièce, en français, dans l'ordre de leur vie. */
export const STATUTS_ENVOI = [
  'a_envoyer',
  'envoyee',
  'en_echec',
] as const satisfies readonly StatutEnvoiLocal[];
export type StatutEnvoi = (typeof STATUTS_ENVOI)[number];

/** Ce que l'enveloppe contient : les octets en base64 — DANS le chiffré, jamais dehors. */
const octetsChiffresSchema = z.string();

function tableOctets(base: BaseLocale): Table<LigneOctetsPiece, string> {
  return base.table<LigneOctetsPiece, string>(TABLE_OCTETS);
}

/** Chiffre des octets pour la table locale (aussi utilisé par la restauration). */
export async function chiffrerOctets(
  coffre: Coffre,
  octets: Uint8Array,
): Promise<LigneOctetsPiece['octets']> {
  return coffre.chiffrer(versBase64(octets));
}

/**
 * Écrit une pièce AVEC ses octets : ligne `attachments` + octets chiffrés + op
 * d'outbox, dans une seule transaction. Le contexte vient de `contexteLocal()`,
 * comme pour `ecrireLocal` : application verrouillée → rien n'est écrit.
 */
export async function ecrirePieceAvecOctets(
  demande: DemandeEcriture<'attachment_meta'>,
  octets: Uint8Array,
): Promise<void> {
  const { base, coffre } = contexteLocal();
  const ligne: LigneOctetsPiece = {
    id: demande.id,
    missionId: demande.missionId,
    statutEnvoi: 'a_envoyer',
    octets: await chiffrerOctets(coffre, octets),
  };
  const annexe: AnnexeEcriture = {
    table: base.table(TABLE_OCTETS),
    ligne: { ...ligne },
  };
  await ecrireLocalAvecAnnexe(demande, annexe);
}

/** Les octets d'une pièce, déchiffrés ; `null` si la pièce n'en a pas sur cet appareil. */
export async function lireOctetsPiece(
  base: BaseLocale,
  coffre: Coffre,
  id: string,
): Promise<Uint8Array | null> {
  const ligne = await tableOctets(base).get(id);
  if (ligne === undefined) return null;
  return depuisBase64(await coffre.dechiffrer(ligne.octets, octetsChiffresSchema));
}

/** Le statut d'envoi d'une pièce, ou `null` si elle n'a pas d'octets ici. */
export async function lireStatutEnvoi(base: BaseLocale, id: string): Promise<StatutEnvoi | null> {
  const ligne = await tableOctets(base).get(id);
  return ligne?.statutEnvoi ?? null;
}

/**
 * Change le statut d'envoi. Ne touche ni aux octets ni à la ligne `attachments`.
 * L'écriture elle-même vit dans `ecriture.ts`, seul module autorisé à écrire
 * dans Dexie (garde-fou ESLint, 05 §9.2-2).
 */
export async function marquerStatutEnvoi(
  base: BaseLocale,
  id: string,
  statut: StatutEnvoi,
): Promise<void> {
  await ecrireStatutEnvoiPiece(base, TABLE_OCTETS, id, statut);
}

/** Les lignes d'octets d'une mission (chiffrées), dans l'ordre des ids (UUID v7 = ordre de capture). */
export async function lignesOctetsDeMission(
  base: BaseLocale,
  missionId: string,
): Promise<LigneOctetsPiece[]> {
  const lignes = await tableOctets(base).where('missionId').equals(missionId).toArray();
  return lignes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Range une ligne d'octets déjà chiffrée (restauration d'une sauvegarde). */
export async function rangerOctets(base: BaseLocale, ligne: LigneOctetsPiece): Promise<void> {
  await rangerLigneOctetsPiece(base, TABLE_OCTETS, ligne);
}
