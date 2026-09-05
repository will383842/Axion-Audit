// =============================================================================
// LECTURES DE CONTEXTE POUR L'ÉCRAN D'ENTRETIEN — missions et unités locales
//
// Le socle L5a n'a pas de dépôt `missions` ni `orgUnits` (l'accueil ne lit que
// des index). L'écran « Nouvel entretien » a besoin du TITRE de la mission et
// du NOM des unités — tous deux dans la charge chiffrée — pour que l'auditeur
// choisisse sans lire un identifiant. Lecture seule, même forme que les dépôts
// du socle : index en clair + charge déchiffrée, à plat.
// Traçabilité : E12 (entretiens par interlocuteur — l’unité où se tient la
// session se choisit sur son NOM, jamais sur un identifiant), E33 (sécurité / RGPD).
// =============================================================================
import { contexteLocal } from '../local/contexte.js';
import {
  chargeMissionSchema,
  chargeOrgUnitSchema,
  type ChargeMission,
  type ChargeOrgUnit,
  type IndexMission,
  type IndexOrgUnit,
} from '../local/formes.js';

export type MissionLocale = IndexMission & ChargeMission;
export type UniteLocale = IndexOrgUnit & ChargeOrgUnit;

/** Les missions présentes sur l'appareil, non supprimées, titre déchiffré. */
export async function lireMissionsLocales(): Promise<MissionLocale[]> {
  const { base, coffre } = contexteLocal();
  const lignes = await base.missions.filter((ligne) => ligne.supprimeLe === null).toArray();
  const missions: MissionLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    missions.push({ ...index, ...(await coffre.dechiffrer(charge, chargeMissionSchema)) });
  }
  return missions.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}

export async function lireMissionLocale(missionId: string): Promise<MissionLocale | null> {
  const { base, coffre } = contexteLocal();
  const ligne = await base.missions.get(missionId);
  if (ligne?.supprimeLe !== null) return null;
  const { charge, ...index } = ligne;
  return { ...index, ...(await coffre.dechiffrer(charge, chargeMissionSchema)) };
}

/**
 * Les unités d'une mission où une session peut se tenir : actives ou PROPOSÉES
 * depuis le terrain (03 §25.3 — une unité proposée reçoit des entretiens sans
 * attendre le siège), jamais fusionnées ni supprimées. Ordre de l'arbre.
 */
export async function lireUnites(missionId: string): Promise<UniteLocale[]> {
  const { base, coffre } = contexteLocal();
  const lignes = await base.orgUnits
    .where('missionId')
    .equals(missionId)
    .filter((ligne) => ligne.supprimeLe === null && ligne.status !== 'fusionnee')
    .sortBy('position');
  const unites: UniteLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    unites.push({ ...index, ...(await coffre.dechiffrer(charge, chargeOrgUnitSchema)) });
  }
  return unites;
}
