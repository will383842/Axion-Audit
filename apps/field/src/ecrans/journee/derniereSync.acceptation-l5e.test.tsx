// =============================================================================
// LE « DERNIER SUCCÈS » DE SYNC, PAR MISSION — la troisième donnée du §34.2
//
// ── STATUT DE CE FICHIER ─────────────────────────────────────────────────────
// GARDE ÉCRITE AVANT SON CORRECTIF (CLAUDE.md §4, étape 2). Écrit par A27, qui
// n'a produit aucune ligne d'`EcranAujourdhui.tsx`, d'`agenda/jour.ts`, de
// `local/port-sync.ts` ni de `local/base.ts` (09 §5.6 : le code de test n'est
// jamais écrit par l'agent qui a écrit le code testé). **A27 ne corrige rien** :
// ce fichier est ROUGE sur `803f0b4` et le reste jusqu'à ce qu'A23 alimente le
// slot.
//
// ── L'EXIGENCE, MOT POUR MOT ─────────────────────────────────────────────────
// 03 §34.2 : « **l'état de sync par mission** (pastille + dernier succès + taille
// d'outbox) » — « données 100 % locales, absorbé L5 ». Critère 07 n° 1 de P-C.
// Arbitrage A01 du 2026-09-08 (D-6) : « Mesuré sur `9a65c25` : deux des trois
// données y sont […]. Le **dernier succès est absent** : `derniereSyncReussieLe`
// vaut `null` en dur, rien ne persiste d'horodatage, et la prop `derniereSync`
// de `PastilleSync` n'est alimentée nulle part dans `apps/field`. Trou L5, pas
// dépendance L6 : sans serveur la valeur locale existe et vaut “jamais
// synchronisée”, statut déjà présent dans le port. Bornes : alimenter ce slot
// avec la vérité locale, “jamais” compris ; jamais de pastille verte sans
// serveur (§3.6). »
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   (a) Aucun succès enregistré ⇒ la carte de la mission dit « jamais
//       synchronisée » — la vérité locale, pas un silence.
//   (b) Un succès enregistré ⇒ la carte rend son instant AU FUSEAU DE MISSION
//       (03 §22.2, invariant 5), ni au fuseau de l'appareil, ni en UTC nu.
//   (c) Aucun succès enregistré ⇒ AUCUNE pastille « Synchronisé ».
//   (d) Un succès enregistré, port inerte ⇒ toujours AUCUNE pastille
//       « Synchronisé » : la borne d'A01, « jamais de pastille verte sans
//       serveur », survit à l'alimentation du slot.
//   (e) La MÊME vérité nourrit l'alerte de l'invariant 8 : un succès de 2 h
//       éteint « aucune synchronisation connue » ; un succès de 30 h allume
//       « aucune synchronisation depuis N h ». Deux sources pour un fait, c'est
//       le défaut B6 (A54, 2026-09-06) — il ne se rejoue pas ici.
//
// ── OÙ VIT LA VÉRITÉ LOCALE (l'interface que ce fichier ATTEND d'A23) ─────────
// Une clé `meta` PAR MISSION, sœur de `sync:since:<missionId>` (le curseur de
// pull, déjà persisté) : `sync:dernier-succes:<missionId>`, valeur ISO 8601 UTC.
// Elle est distincte du curseur de pull À DESSEIN : un pull prouve que des
// données sont DESCENDUES, pas que la collecte est SORTIE de l'appareil — et
// c'est la sortie que l'invariant 8 protège. Personne ne l'écrit en L5 (elle
// vaut donc « jamais »), le moteur L6a l'écrira à chaque push réussi.
// `construireJournee` (`agenda/jour.ts`) la LIT, exactement comme il lit déjà le
// compte d'outbox dans Dexie plutôt que de croire le port — et la passe au slot
// `derniereSyncReussieLe`, donc à `evaluerAlerteSauvegarde` ET à l'écran.
// Quand A23 aura exporté `cleDerniereSyncReussie(missionId)` de `local/base.ts`,
// la constante ci-dessous doit être REMPLACÉE par cet import : « une clé
// littérale ne s'écrit nulle part ailleurs » (`base.ts`), la garde ne fait
// exception que parce qu'elle précède le code.
//
// ── LA MÉTHODE : FAIRE DIVERGER MISSION, APPAREIL ET UTC ─────────────────────
// Reprise d'A26 (`invariant5-fuseau.acceptation-l5d.test.tsx`) : mission à
// `Pacific/Kiritimati` (UTC+14), appareil injecté à `America/Los_Angeles`
// (UTC−7), et un instant choisi pour que les TROIS jours civils diffèrent. Les
// rendus attendus sont CALCULÉS avec le constructeur `Intl` réel, jamais
// recopiés — un changement d'ICU ne peut pas faire dériver ce test en silence —
// et chaque test affirme d'abord que les trois rendus sont bien distincts.
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export — le dernier
// succès est la donnée de l'alerte « sync muette ») · E32 (fuseaux, devises,
// interface française) · E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EcranAujourdhui } from './EcranAujourdhui.js';

// -----------------------------------------------------------------------------
// Fixture FICTIVE (invariant 2).
// -----------------------------------------------------------------------------
const MISSION_ID = '0191e2a0-0000-7000-8000-00000005e001';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000005e002';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000005e003';
const TITRE_MISSION = 'Mission fictive FIL-GC — antenne lointaine';

/** Le fuseau de la MISSION : ce que la carte doit afficher (03 §22.2). */
const FUSEAU_MISSION = 'Pacific/Kiritimati';
/** Le fuseau de l'APPAREIL : ce que la carte ne doit JAMAIS afficher. */
const FUSEAU_APPAREIL = 'America/Los_Angeles';

/**
 * L'instant du dernier succès. 12:30 le 07/09 à la mission, 15:30 le 06/09 sur
 * l'appareil, 22:30 le 06/09 en UTC : trois JOURS civils distincts, pas
 * seulement trois heures — un décalage de date ne se discute pas.
 */
const INSTANT_SUCCES = '2026-09-06T22:30:00.000Z';
/** L'horloge de l'application : 2 h après le succès. */
const INSTANT = '2026-09-07T00:30:00.000Z';
/** Un succès trop vieux : 30 h avant l'horloge, au-delà des 24 h de l'invariant 8. */
const INSTANT_SUCCES_PERIME = '2026-09-05T18:30:00.000Z';

/**
 * LA CLÉ ATTENDUE — voir l'en-tête. À remplacer par
 * `cleDerniereSyncReussie(MISSION_ID)` importée de `local/base.ts` dès qu'A23
 * l'aura exportée.
 */
const PREFIXE_DERNIERE_SYNC_REUSSIE = 'sync:dernier-succes:';
function cleDerniereSyncReussieAttendue(missionId: string): string {
  return `${PREFIXE_DERNIERE_SYNC_REUSSIE}${missionId}`;
}

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

// -----------------------------------------------------------------------------
// L'INJECTION DU FUSEAU D'APPAREIL — la forme d'A26 : tout appel SANS `timeZone`
// reçoit celui de l'appareil ; tout appel qui en donne un traverse intact.
// -----------------------------------------------------------------------------
const CONSTRUCTEUR_REEL = Intl.DateTimeFormat;

function poserFuseauDAppareil(fuseau: string): void {
  const enveloppe = function enveloppe(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    const complet =
      options?.timeZone === undefined ? { ...(options ?? {}), timeZone: fuseau } : options;
    return new CONSTRUCTEUR_REEL(locales, complet);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.defineProperty(enveloppe, 'supportedLocalesOf', {
    value: CONSTRUCTEUR_REEL.supportedLocalesOf.bind(CONSTRUCTEUR_REEL),
  });
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: enveloppe,
    configurable: true,
    writable: true,
  });
}

function retirerFuseauDAppareil(): void {
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: CONSTRUCTEUR_REEL,
    configurable: true,
    writable: true,
  });
}

/** La DATE (jj/mm/aaaa) et l'HEURE (HH:mm) d'un instant, au fuseau donné — constructeur RÉEL. */
function dateEtHeureAu(iso: string, fuseau: string): { date: string; heure: string } {
  const epoque = Date.parse(iso);
  return {
    date: new CONSTRUCTEUR_REEL('fr-FR', {
      timeZone: fuseau,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(epoque),
    heure: new CONSTRUCTEUR_REEL('fr-FR', {
      timeZone: fuseau,
      hour: '2-digit',
      minute: '2-digit',
    }).format(epoque),
  };
}

/** `07/09/2026` · `12:30` — l'heure locale du site audité. La seule affichable. */
const ATTENDU_MISSION = dateEtHeureAu(INSTANT_SUCCES, FUSEAU_MISSION);
/** `06/09/2026` · `15:30` — l'heure du portable de l'auditeur. Jamais. */
const RENDU_APPAREIL = dateEtHeureAu(INSTANT_SUCCES, FUSEAU_APPAREIL);
/** `06/09/2026` · `22:30` — l'heure de stockage, nue. Jamais. */
const RENDU_UTC = dateEtHeureAu(INSTANT_SUCCES, 'UTC');

// -----------------------------------------------------------------------------
// Le harnais d'appareil — base Dexie réelle, coffre réel, `useTerrain` simulé.
// -----------------------------------------------------------------------------
let terrain: ValeurTerrain;
let kek: CryptoKey;
const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a27-l5e-derniere-sync-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

/** Une mission embarquée à `FUSEAU_MISSION`, une unité — et l'horloge fixée à `INSTANT`. */
async function embarquerMission(base: BaseLocale): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: TITRE_MISSION,
          companyId: '0191e2a0-0000-7000-8000-00000005e0cc',
          timezone: FUSEAU_MISSION,
          auditLevel: 'standard',
          geoScope: 'multi_pays',
          countryCode: null,
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: UNITE_ID,
          missionId: MISSION_ID,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif lointain',
          countryCode: null,
          timezone: null,
          headcount: 5,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: INSTANT,
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);
}

/** Une écriture locale = une opération dans la file : de quoi rendre l'alerte de l'invariant 8 pertinente. */
async function semerUneOperation(): Promise<void> {
  await ecrireLocal({
    entite: 'interview',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'non_demarre',
      scheduleStatus: 'a_planifier',
      scheduledAt: null,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
      personRole: 'Fonction fictive',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: false,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
}

function terrainDeBase(base: BaseLocale): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 15 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui'] },
    vue: 'aujourdhui',
    stockage: {
      persistant: true,
      quotaOctets: 10 * 1024 ** 3,
      utiliseOctets: 1024 ** 3,
      ratio: 0.1,
      niveau: 'ok',
    },
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

async function attendreLecture(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
}

/** La carte de la mission (section ④ du cockpit), par son titre. */
function carteMission(): HTMLElement {
  return requis(
    screen
      .getByRole('heading', { name: new RegExp(TITRE_MISSION) })
      .closest<HTMLElement>('.axn-journee__carte'),
    'carte de mission',
  );
}

/**
 * « Jamais de pastille verte » se juge sur l'ÉTAT de la pastille — sa classe
 * d'état du design system et son MOT d'état exact (`ETATS.synchronise.mot` dans
 * `packages/ui`) — et non sur une expression floue : « jamais synchronisée »
 * contient « synchronisée », et une garde qui rougirait sur la vérité qu'elle
 * réclame ne garde rien. L'emplacement du dernier succès (dans la pastille ou
 * à côté) reste le choix d'A23 ; cette garde n'en dépend pas.
 */
function attendreAucunePastilleVerte(carte: HTMLElement): void {
  const pastille = requis(carte.querySelector('.axn-pastille-sync'), 'pastille de la carte');
  expect(pastille.className).not.toMatch(/axn-pastille-sync--synchronise(?![\w-])/);
  const mots = [...pastille.querySelectorAll('span')].map((span) => span.textContent.trim());
  expect(mots).not.toContain('Synchronisé');
  expect(mots).not.toContain('À jour');
}

/** Monte l'écran sur une base neuve, avec ou sans succès enregistré. */
async function monterCockpit(dernierSucces: string | null): Promise<HTMLElement> {
  const base = await nouvelleBase();
  await embarquerMission(base);
  await semerUneOperation();
  if (dernierSucces !== null) {
    await ecrireMeta(base, cleDerniereSyncReussieAttendue(MISSION_ID), dernierSucces);
  }
  terrain = terrainDeBase(base);
  poserFuseauDAppareil(FUSEAU_APPAREIL);
  render(<EcranAujourdhui />);
  await attendreLecture();
  return carteMission();
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(27), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerFuseauDAppareil();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// -----------------------------------------------------------------------------
// LES GARDES
// -----------------------------------------------------------------------------
describe('EcranAujourdhui — le dernier succès de sync, par mission (03 §34.2 ; critère 07 n° 1 de P-C)', () => {
  it('@critique (a) aucun succès enregistré ⇒ la carte dit « jamais synchronisée », et ne rend aucune date', async () => {
    const carte = await monterCockpit(null);

    expect(carte.textContent).toMatch(/jamais synchronisée/i);
    for (const rendu of [ATTENDU_MISSION, RENDU_APPAREIL, RENDU_UTC]) {
      expect(carte.textContent).not.toContain(rendu.date);
    }
  });

  it('@critique (b) un succès enregistré ⇒ la carte rend sa DATE et son HEURE au fuseau de la MISSION — jamais celles de l’appareil, jamais l’UTC nu', async () => {
    // La prémisse : les trois rendus diffèrent bel et bien, sinon la garde ne
    // prouverait rien. Un appareil et une mission au même fuseau rendent le
    // défaut invisible — c'est ainsi qu'il a survécu à toute la recette L5.
    expect(ATTENDU_MISSION.date).not.toBe(RENDU_APPAREIL.date);
    expect(ATTENDU_MISSION.heure).not.toBe(RENDU_APPAREIL.heure);
    expect(ATTENDU_MISSION.heure).not.toBe(RENDU_UTC.heure);

    const carte = await monterCockpit(INSTANT_SUCCES);
    const texte = carte.textContent;

    expect(texte).not.toMatch(/jamais synchronisée/i);
    expect(texte).toContain(ATTENDU_MISSION.date);
    expect(texte).toContain(ATTENDU_MISSION.heure);
    expect(texte).not.toContain(RENDU_APPAREIL.heure);
    expect(texte).not.toContain(RENDU_UTC.heure);
    // Ni l'ISO brut : « 2026-09-06T22:30:00.000Z » n'est pas du français (03 §22.2).
    expect(texte).not.toContain(INSTANT_SUCCES);
  });

  it('@critique (c) aucun succès enregistré ⇒ aucune pastille « Synchronisé » (LOT_L5.md §3.6)', async () => {
    const carte = await monterCockpit(null);

    attendreAucunePastilleVerte(carte);
  });

  it('@critique (d) un succès enregistré, port INERTE ⇒ toujours aucune pastille « Synchronisé » — jamais de pastille verte sans serveur (borne A01)', async () => {
    const carte = await monterCockpit(INSTANT_SUCCES);

    attendreAucunePastilleVerte(carte);
  });

  it('@critique (e) la MÊME vérité nourrit l’alerte de l’invariant 8 : un succès de 2 h l’éteint, un succès de 30 h la date', async () => {
    await monterCockpit(INSTANT_SUCCES);
    const alertesRecentes = screen.queryAllByRole('alert').map((a) => a.textContent);
    expect(alertesRecentes.join(' ')).not.toMatch(/aucune synchronisation/i);

    cleanup();
    retirerFuseauDAppareil();
    retirerContexteLocal();

    await monterCockpit(INSTANT_SUCCES_PERIME);
    const alertesPerimees = screen.getAllByRole('alert').map((a) => a.textContent);
    const texte = alertesPerimees.join(' ');
    expect(texte).toMatch(/aucune synchronisation depuis \d+ h/i);
    expect(texte).not.toMatch(/aucune synchronisation connue/i);
  });
});
