// =============================================================================
// LE JOUR CIVIL DU RITUEL DE FIN DE JOURNÉE — AU FUSEAU DE LA MISSION, PAS EN UTC
//
// ── STATUT DE CE FICHIER ─────────────────────────────────────────────────────
// GARDE ÉCRITE AVANT SON CORRECTIF (CLAUDE.md §4, étape 2). Écrit par A27, qui
// n'a produit aucune ligne d'`agenda/jour.ts` (09 §5.6 : le code de test n'est
// jamais écrit par l'agent qui a écrit le code testé). **A27 ne corrige rien** :
// ce fichier est ROUGE sur `803f0b4` et le reste jusqu'à ce qu'A23 corrige
// `rappelFinDeJournee`.
//
// ── L'EXIGENCE, MOT POUR MOT ─────────────────────────────────────────────────
// 03 §34.2-2 : « rappel discret sur le cockpit tant que le rituel DU JOUR n'est
// pas fait ». 03 §22.2 : « tous les horodatages stockés en UTC […] le suivi
// avance/retard calcule en jours ouvrés DU FUSEAU DE LA MISSION ». 00_INDEX,
// invariant 8 : « aucune donnée ne vit sur un seul appareil > 24 h ouvrées ;
// alerte automatique au-delà » — le rappel est l'INSTRUMENT de cet invariant.
//
// ── LE DÉFAUT (A29, 2026-09-08 ; arbitrage A01 du même jour) ─────────────────
// `agenda/jour.ts:252-253` compare `instantIso.slice(0, 10)` à
// `dernierExportIso.slice(0, 10)` : deux jours UTC. Le rappel se réarme donc à
// minuit UTC — soit 14 h locale sur une mission à UTC+14 : un rituel fait le
// matin « couvre » la matinée du lendemain, et un rituel fait la veille au soir
// éteint le rappel du jour suivant. Pourtant la `journee` que la fonction
// REÇOIT est déjà découpée au fuseau de mission (`local/depots/sessions.ts`,
// `jourCivil`) : le rappel est en désaccord avec l'objet dont il parle. A01 :
// « Le jour civil du rappel se calcule donc au fuseau de la mission concernée :
// ce n'est pas un choix entre deux options, c'est l'alignement sur la journée
// dont il parle. »
//
// ── LA MÉTHODE : DES INSTANTS CALCULÉS, JAMAIS ÉCRITS EN DUR ─────────────────
// Chaque instant est CONSTRUIT depuis une heure murale (« 07:00 le 15/09 à
// Kiritimati ») par `Intl.DateTimeFormat` avec un `timeZone` explicite. Aucune
// chaîne ISO attendue n'est recopiée : un changement d'ICU ne peut pas faire
// dériver le test en silence. Et chaque cas AFFIRME sa propre prémisse avant de
// juger — « même jour de mission, jours UTC différents » (ou l'inverse) — pour
// qu'un fuseau qui cesserait de discriminer fasse échouer la prémisse, pas
// passer la garde. C'est la méthode qu'A26 a posée pour l'invariant 5.
//
// Trois fuseaux, pour que le défaut ne se cache derrière aucun d'eux :
//   · `Pacific/Kiritimati`  UTC+14 — le cas nommé par A29 ;
//   · `America/Los_Angeles` UTC−7 en septembre — la frontière UTC tombe à 17 h ;
//   · `Europe/Paris`        UTC+2 en septembre — la frontière UTC tombe à 02 h,
//     ce qui rend le cas « 07:00 → 23:00 » AVEUGLE (même jour UTC) : c'est le
//     cas des DEUX BORDS (00:30 → 23:30) qui le voit. Les deux sont éprouvés.
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export — le rappel du
// rituel est son instrument) · E32 (fuseaux, devises, interface française).
// =============================================================================
import { describe, expect, it } from 'vitest';
import type { EtatSyncMission } from '../local/port-sync.js';
import { rappelFinDeJournee, type JourneeTerrain, type MissionDuJour } from './jour.js';

// -----------------------------------------------------------------------------
// Fixture FICTIVE (invariant 2) — une mission, rien à synchroniser, une file
// non vide : il y a « quelque chose à protéger », le rappel est donc en jeu.
// -----------------------------------------------------------------------------
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000c111';
const COMPANY_ID = '0191e2a0-0000-7000-8000-0000000c0a01';

/** Un jour de septembre 2026 loin de tout changement d'heure (fin mars / fin octobre). */
const JOUR_J = '2026-09-15';
const JOUR_J_MOINS_1 = '2026-09-14';

const FUSEAUX = ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Paris'] as const;

function journeeAvecMission(fuseau: string): JourneeTerrain {
  const mission: MissionDuJour = {
    id: MISSION_ID,
    status: 'collecte',
    clientUpdatedAt: `${JOUR_J}T00:00:00.000Z`,
    supprimeLe: null,
    titre: 'Mission fictive FIL-GC — antenne lointaine',
    companyId: COMPANY_ID,
    timezone: fuseau,
    auditLevel: 'standard',
    geoScope: 'multi_pays',
    countryCode: null,
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };
  const sync: EtatSyncMission = {
    missionId: MISSION_ID,
    statut: 'indisponible',
    derniereSyncReussieLe: null,
    operationsEnAttente: 3,
    operationsBloquees: 0,
    alerte: { declenchee: true, message: 'Aucune synchronisation connue pour cet appareil.' },
  };
  return {
    missions: [{ mission, sessions: [], aRevoirOuverts: 0, sync }],
    sessionsDuJour: [],
    alertes: [],
    aReprendre: null,
    aValider: [],
  };
}

// -----------------------------------------------------------------------------
// L'ARITHMÉTIQUE DE FUSEAU — calculée, jamais recopiée.
// -----------------------------------------------------------------------------
/** L'heure murale d'un instant, au fuseau donné, ramenée en ms « comme si UTC ». */
function muraleEnMs(ms: number, fuseau: string): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms);
  const champ = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? Number.NaN);
  return Date.UTC(
    champ('year'),
    champ('month') - 1,
    champ('day'),
    champ('hour'),
    champ('minute'),
    champ('second'),
  );
}

/**
 * L'instant UTC (ISO) dont l'heure murale, AU FUSEAU DONNÉ, est `jour` à
 * `heure`. Résolu par approximations successives sur le décalage réel du fuseau
 * à cet instant — donc juste à travers un changement d'heure, et sans aucune
 * table de décalages écrite à la main.
 */
function instantMural(fuseau: string, jour: string, heure: string): string {
  const [annee, mois, jourDuMois] = jour.split('-').map(Number);
  const [heures, minutes] = heure.split(':').map(Number);
  const voulu = Date.UTC(
    annee ?? 0,
    (mois ?? 1) - 1,
    jourDuMois ?? 1,
    heures ?? 0,
    minutes ?? 0,
    0,
  );
  let candidat = voulu;
  for (let i = 0; i < 3; i += 1) candidat = voulu - (muraleEnMs(candidat, fuseau) - candidat);
  if (muraleEnMs(candidat, fuseau) !== voulu) {
    throw new Error(`harnais : ${jour} ${heure} n'existe pas au fuseau ${fuseau}`);
  }
  return new Date(candidat).toISOString();
}

/** Le jour civil (AAAA-MM-JJ) d'un instant, au fuseau donné — la définition de `sessions.ts`. */
function jourCivilAu(iso: string, fuseau: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: fuseau,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Le jour UTC — ce que `slice(0, 10)` lit, et ce que le rappel ne doit PAS lire. */
function jourUtc(iso: string): string {
  return iso.slice(0, 10);
}

// -----------------------------------------------------------------------------
// LES GARDES
// -----------------------------------------------------------------------------
describe('rappelFinDeJournee — le jour civil du rituel est celui de la MISSION (03 §34.2-2, §22.2 ; invariant 8)', () => {
  it('@critique UTC+14, cas A29 : rituel à 07:00 locale, heure courante 23:00 locale le MÊME jour de mission ⇒ le rappel est ÉTEINT', () => {
    const fuseau = 'Pacific/Kiritimati';
    const rituel = instantMural(fuseau, JOUR_J, '07:00');
    const courant = instantMural(fuseau, JOUR_J, '23:00');

    // La prémisse : même jour de mission, jours UTC différents. Si elle tombe,
    // c'est le harnais qui a tort, pas le code — et le test le dit.
    expect(jourCivilAu(rituel, fuseau)).toBe(JOUR_J);
    expect(jourCivilAu(courant, fuseau)).toBe(JOUR_J);
    expect(jourUtc(rituel)).not.toBe(jourUtc(courant));

    expect(rappelFinDeJournee(rituel, journeeAvecMission(fuseau), courant)).toBeNull();
  });

  describe.each(FUSEAUX)('fuseau de mission %s', (fuseau) => {
    it('@critique rituel à 00:30 locale, heure courante 23:30 locale le MÊME jour de mission ⇒ le rappel est ÉTEINT (les deux bords du jour)', () => {
      const rituel = instantMural(fuseau, JOUR_J, '00:30');
      const courant = instantMural(fuseau, JOUR_J, '23:30');

      expect(jourCivilAu(rituel, fuseau)).toBe(JOUR_J);
      expect(jourCivilAu(courant, fuseau)).toBe(JOUR_J);
      expect(jourUtc(rituel)).not.toBe(jourUtc(courant));

      expect(rappelFinDeJournee(rituel, journeeAvecMission(fuseau), courant)).toBeNull();
    });

    it('@critique rituel à 23:30 locale la VEILLE, heure courante 00:30 locale le jour J ⇒ le rappel est ALLUMÉ (nouveau jour de mission)', () => {
      const rituel = instantMural(fuseau, JOUR_J_MOINS_1, '23:30');
      const courant = instantMural(fuseau, JOUR_J, '00:30');

      // L'inverse : jours de mission différents, MÊME jour UTC. C'est le cas où
      // `slice(0, 10)` éteint le rappel alors qu'un nouveau jour a commencé sur
      // le site — la nuit de données non sauvegardées que l'invariant 8 interdit.
      expect(jourCivilAu(rituel, fuseau)).toBe(JOUR_J_MOINS_1);
      expect(jourCivilAu(courant, fuseau)).toBe(JOUR_J);
      expect(jourUtc(rituel)).toBe(jourUtc(courant));

      const rappel = rappelFinDeJournee(rituel, journeeAvecMission(fuseau), courant);
      expect(
        rappel,
        'le rappel doit être ALLUMÉ : un nouveau jour de mission a commencé',
      ).not.toBeNull();
      expect(rappel).toMatch(/rituel de fin de journée n’a pas encore été fait/);
    });
  });

  it('contrôle d’anti-vacuité : sans rien à protéger, aucun rappel, quel que soit le fuseau', () => {
    const fuseau = 'Pacific/Kiritimati';
    const avecFile = journeeAvecMission(fuseau);
    const journee: JourneeTerrain = {
      ...avecFile,
      missions: avecFile.missions.map((m) => ({
        ...m,
        sync: { ...m.sync, operationsEnAttente: 0 },
      })),
    };
    const courant = instantMural(fuseau, JOUR_J, '23:30');
    expect(rappelFinDeJournee(null, journee, courant)).toBeNull();
  });
});
