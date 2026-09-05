// =============================================================================
// FIXTURES DE LA CONSOLE — lot L7, incrément L7a. Écrit par A36 (tests), jamais
// par l'agent qui code la console (09 §5.6).
//
// Deux missions CANONIQUES (09 §4bis : FIL-TPE et FIL-GC) et une variante de fuseau
// pour prouver l'invariant 5. Toutes FICTIVES (invariant 2) : aucun nom réel.
//
// CHAQUE FIXTURE PASSE PAR LE SCHÉMA PARTAGÉ AVANT D'EXISTER. `missionResponseSchema`
// est un `strictObject` : une clé de trop — un montant, un nom de champ financier,
// une forme inventée — ferait échouer le module à l'import, avant tout test. C'est
// la garantie « jamais une forme inventée » du brief : le serveur factice ne peut
// servir que ce que le contrat 11 §3 sait décrire.
// Traçabilité : E22 (console de pilotage), E43 (exécutabilité autopilote — schémas Zod
// partagés, 11 §3).
// =============================================================================
import {
  companyResponseSchema,
  missionResponseSchema,
  type CompanyResponse,
  type MissionResponse,
} from '@axion/shared';

/** UUID v7 figés : lisibles dans une trace, stables d'une exécution à l'autre. */
export const ID = {
  entrepriseTpe: '018f0000-0000-7000-8000-00000000a001',
  entrepriseGc: '018f0000-0000-7000-8000-00000000a002',
  entrepriseOuest: '018f0000-0000-7000-8000-00000000a003',
  missionTpe: '018f0000-0000-7000-8000-00000000b001',
  missionGc: '018f0000-0000-7000-8000-00000000b002',
  missionOuest: '018f0000-0000-7000-8000-00000000b003',
  missionInconnue: '018f0000-0000-7000-8000-00000000bfff',
  admin: '018f0000-0000-7000-8000-00000000c001',
  consultant: '018f0000-0000-7000-8000-00000000c002',
} as const;

const HORODATAGE = '2026-08-20T08:00:00.000Z';

export const ENTREPRISE_TPE: CompanyResponse = companyResponseSchema.parse({
  id: ID.entrepriseTpe,
  externalRef: null,
  name: 'Boulangerie fictive du Fil rouge',
  siren: null,
  nafCode: null,
  sectorId: null,
  headcount: 8,
  sitesCount: 1,
  countries: ['FR'],
  notes: null,
  createdAt: HORODATAGE,
  updatedAt: HORODATAGE,
});

export const ENTREPRISE_GC: CompanyResponse = companyResponseSchema.parse({
  id: ID.entrepriseGc,
  externalRef: null,
  name: 'Groupe fictif du Fil rouge',
  siren: null,
  nafCode: null,
  sectorId: null,
  headcount: 12_000,
  sitesCount: 40,
  countries: ['FR', 'DE', 'ES'],
  notes: null,
  createdAt: HORODATAGE,
  updatedAt: HORODATAGE,
});

export const ENTREPRISE_OUEST: CompanyResponse = companyResponseSchema.parse({
  id: ID.entrepriseOuest,
  externalRef: null,
  name: 'Atelier fictif de la côte Ouest',
  siren: null,
  nafCode: null,
  sectorId: null,
  headcount: 30,
  sitesCount: 1,
  countries: ['US'],
  notes: null,
  createdAt: HORODATAGE,
  updatedAt: HORODATAGE,
});

/** FIL-TPE — micro, 8 personnes, 1 entretien ; collecte en cours. */
export const MISSION_TPE: MissionResponse = missionResponseSchema.parse({
  id: ID.missionTpe,
  companyId: ID.entrepriseTpe,
  parentMissionId: null,
  title: 'FIL-TPE — diagnostic de cadrage',
  geoScope: 'france',
  countryCode: null,
  sizeTierId: null,
  activeSectors: ['artisanat'],
  activeBlocks: ['b1', 'b2'],
  auditLevel: 'diagnostic_cadrage',
  commercialOffer: 'audit_flash',
  timezone: 'Europe/Paris',
  ndaRef: null,
  ndaSignedAt: null,
  status: 'en_cours',
  llmProvider: 'anthropic',
  startPlanned: '2026-09-07',
  endPlanned: '2026-09-11',
  deliveredAt: null,
  createdBy: ID.admin,
  createdAt: HORODATAGE,
  updatedAt: HORODATAGE,
});

/** FIL-GC — grand compte fictif, 150 unités / 60 sessions ; en préparation. */
export const MISSION_GC: MissionResponse = missionResponseSchema.parse({
  id: ID.missionGc,
  companyId: ID.entrepriseGc,
  parentMissionId: null,
  title: 'FIL-GC — audit stratégique groupe',
  geoScope: 'multi_pays',
  countryCode: 'FR',
  sizeTierId: null,
  activeSectors: ['industrie', 'logistique'],
  activeBlocks: ['b1', 'b2', 'b3', 'b4', 'b9'],
  auditLevel: 'strategique_groupe',
  commercialOffer: 'grand_programme',
  timezone: 'Europe/Paris',
  ndaRef: 'NDA-FIL-GC-2026',
  ndaSignedAt: '2026-08-03',
  status: 'preparation',
  llmProvider: 'ue_hosted',
  startPlanned: '2026-09-14',
  endPlanned: '2026-10-15',
  deliveredAt: null,
  createdBy: ID.admin,
  createdAt: HORODATAGE,
  updatedAt: HORODATAGE,
});

/**
 * Variante de FUSEAU — mission fictive livrée, fuseau `America/Los_Angeles`
 * (UTC−7 en septembre). Elle porte deux pièges volontaires :
 *
 *   · `deliveredAt` = `2026-09-02T03:30:00.000Z` : c'est le **1er septembre, 20 h 30**
 *     au fuseau de mission. Formaté au fuseau de la machine (Europe/Paris) ou en UTC,
 *     il tombe le **2 septembre** — la date CHANGE, pas seulement l'heure ;
 *   · `ndaSignedAt` = `2026-08-03` est une date CIVILE (`DATE` au 04). Passée par
 *     `new Date('2026-08-03')` puis formatée au fuseau de mission, elle recule au
 *     **2 août**. Une date civile ne se convertit jamais.
 */
export const MISSION_OUEST: MissionResponse = missionResponseSchema.parse({
  id: ID.missionOuest,
  companyId: ID.entrepriseOuest,
  parentMissionId: null,
  title: 'FIL-TPE (côte Ouest) — mission livrée',
  geoScope: 'multi_pays',
  countryCode: 'US',
  sizeTierId: null,
  activeSectors: ['artisanat'],
  activeBlocks: ['b1'],
  auditLevel: 'operationnel',
  commercialOffer: null,
  timezone: 'America/Los_Angeles',
  ndaRef: 'NDA-OUEST-2026',
  ndaSignedAt: '2026-08-03',
  status: 'livree',
  llmProvider: 'anthropic',
  startPlanned: '2026-08-10',
  endPlanned: '2026-08-21',
  deliveredAt: '2026-09-02T03:30:00.000Z',
  createdBy: ID.admin,
  createdAt: HORODATAGE,
  updatedAt: '2026-09-02T03:30:00.000Z',
});

export const MISSIONS_CANONIQUES: readonly MissionResponse[] = [MISSION_TPE, MISSION_GC];
export const ENTREPRISES: readonly CompanyResponse[] = [
  ENTREPRISE_TPE,
  ENTREPRISE_GC,
  ENTREPRISE_OUEST,
];

/**
 * N missions fictives supplémentaires, pour la pagination. Toutes dérivées de
 * FIL-TPE, donc toutes valides par construction — et repassées par le schéma.
 */
export function missionsSupplementaires(nombre: number): readonly MissionResponse[] {
  return Array.from({ length: nombre }, (_, rang) => {
    const suffixe = String(rang + 1).padStart(4, '0');
    return missionResponseSchema.parse({
      ...MISSION_TPE,
      id: `018f0000-0000-7000-8000-00000000${suffixe}`,
      title: `Mission fictive de pagination n° ${String(rang + 1)}`,
    });
  });
}
