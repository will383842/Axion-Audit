// =============================================================================
// NB-15 — « ses à-revoir en attente (**compteur CLIQUABLE par mission**) »
// (03 §34.2). Écrit par A26 (09 §5.6 : A22 a livré le compteur, il n'écrit pas
// ce qui le mesure), après le contrôle A02 du 2026-09-09 qui refusait de cocher
// le critère 1 de P-C tant que le nombre ne menait nulle part.
//
// ── CE QUE CE FICHIER PROUVE, ET CE QU'IL ÉPROUVE ───────────────────────────
//   A. Le compteur EST un bouton, et il mène : la mission est mémorisée dans
//      `meta` PUIS la vue `aRevoir` s'ouvre. Les deux, dans cet ordre — une
//      navigation sans mission mémorisée ouvrirait la liste de la MAUVAISE
//      mission, et un espion sur `naviguer` serait vert quand même.
//   B. « PAR mission » : deux missions, deux compteurs, deux destinations. Le
//      compteur de l'une ne mémorise jamais l'autre.
//   C. LE ZÉRO, et c'est le point qu'A22 a tranché seul : à zéro, ce n'est plus
//      un lien mais la phrase « Aucun point à revoir ». Le choix est éprouvé
//      dans les deux sens — le bouton EXISTE au-dessus de zéro, il N'EXISTE PAS
//      à zéro, et la phrase de remplacement est là. Un écran qui rendrait un
//      bouton grisé, ou rien du tout, échouerait ici.
//   D. UN SEUL compteur par carte. A22 a retiré le nombre de la phrase de
//      synthèse en le promouvant en bouton ; deux fois le même fait sur la même
//      carte est la faute que B6 a déjà coûtée avec les pastilles de sync.
//   E. L'ALERTE porte le même geste. Une alerte qu'on ne peut pas traiter depuis
//      l'endroit où on la lit se lit deux fois (03 §17.3, rappels passifs).
//
// ── LE HARNAIS ──────────────────────────────────────────────────────────────
// Celui d'`EcranAujourdhui.test.tsx` : base Dexie réelle sur `fake-indexeddb`,
// coffre réel, `useTerrain` simulé pour tenir `naviguer` sous espion. Les points
// à revoir sont posés par le PORT D'ÉCRITURE de production (`ecrireLocal`), donc
// chiffrés par le coffre de production : aucune crypto n'est réécrite (09 §5.7).
//
// Traçabilité : E12 (à-revoir) · E23 (hyper intuitif) · E6 (hors ligne total).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { lireMissionARevoir } from '../../agenda/a-revoir.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EcranAujourdhui } from './EcranAujourdhui.js';

const INSTANT = '2026-09-05T12:00:00.000Z';
const MISSION_ALPHA = '0191e2a0-0000-7000-8000-0000000b1501';
const MISSION_BRAVO = '0191e2a0-0000-7000-8000-0000000b1502';
const UNITE_ALPHA = '0191e2a0-0000-7000-8000-0000000b15c1';
const UNITE_BRAVO = '0191e2a0-0000-7000-8000-0000000b15c2';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000b15e1';
const Q_UN = '0191e2a0-0000-7000-8000-0000000b1591';
const Q_DEUX = '0191e2a0-0000-7000-8000-0000000b1592';

const TITRE_ALPHA = 'Alpha — mission fictive FIL-TPE';
const TITRE_BRAVO = 'Bravo — mission fictive FIL-GC';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

function missionDescendue(id: string, titre: string) {
  return {
    table: 'missions' as const,
    index: { id, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
    charge: {
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000000cccc',
      timezone: 'Europe/Paris',
      auditLevel: 'standard',
      geoScope: 'france' as const,
      countryCode: 'FR',
      startPlanned: null,
      endPlanned: null,
      roleSurMission: 'auditeur',
    },
  };
}

function uniteDescendue(id: string, missionId: string, name: string) {
  return {
    table: 'orgUnits' as const,
    index: {
      id,
      missionId,
      parentId: null,
      kind: 'service' as const,
      status: 'active' as const,
      position: 1,
      clientUpdatedAt: INSTANT,
      supprimeLe: null,
    },
    charge: {
      name,
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
  };
}

async function semerSession(missionId: string, orgUnitId: string): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId,
    action: 'upsert',
    index: {
      orgUnitId,
      kind: 'entretien',
      status: 'termine',
      scheduleStatus: 'planifie',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site' as const,
      personName: 'Interlocuteur fictif',
      personRole: 'Fonction fictive',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: INSTANT,
      endedAt: INSTANT,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
  return id;
}

async function semerPoint(
  missionId: string,
  interviewId: string,
  missionQuestionId: string,
): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId,
    action: 'upsert',
    index: {
      interviewId,
      missionQuestionId,
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'scale_1_5' as const, v: 2 },
      note: null,
      reviewReason: 'à confirmer',
      naReason: null,
      withheldReason: null,
      source: 'entretien' as const,
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-compteur-a-revoir-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

async function embarquerDeuxMissions(base: BaseLocale): Promise<void> {
  installerContexteLocal({ base, coffre: await ouvrirCoffre(kek, await creerDekEnveloppee(kek)) });
  await appliquerDescente({
    missionId: MISSION_ALPHA,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      missionDescendue(MISSION_ALPHA, TITRE_ALPHA),
      missionDescendue(MISSION_BRAVO, TITRE_BRAVO),
      uniteDescendue(UNITE_ALPHA, MISSION_ALPHA, 'Service fictif Alpha'),
      uniteDescendue(UNITE_BRAVO, MISSION_BRAVO, 'Service fictif Bravo'),
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ALPHA), INSTANT);
  await ecrireMeta(base, cleEmbarquement(MISSION_BRAVO), INSTANT);
}

function terrainDeBase(base: BaseLocale | null): ValeurTerrain {
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

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

async function attendreLecture(): Promise<void> {
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

/** La carte d'une mission (section ④ du cockpit), par son titre. */
function carte(titre: string): HTMLElement {
  return requis(
    screen.getByRole('heading', { name: titre }).closest<HTMLElement>('.axn-journee__carte'),
    `carte « ${titre} »`,
  );
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(15), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LE COMPTEUR MÈNE QUELQUE PART (03 §34.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('NB-15 — le compteur « à revoir » du cockpit est un bouton, et il mène', () => {
  it('@critique taper le compteur mémorise SA mission puis ouvre la liste consolidée', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_ALPHA, UNITE_ALPHA);
    await semerPoint(MISSION_ALPHA, session, Q_UN);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const bouton = within(carte(TITRE_ALPHA)).getByRole('button', {
      name: /1 point\(s\) à revoir/,
    });
    fireEvent.click(bouton);

    // L'ordre compte : sans mission mémorisée, la liste s'ouvrirait sur TOUTES
    // les missions. Un espion sur `naviguer` seul serait vert malgré tout.
    await waitFor(async () => {
      expect(await lireMissionARevoir(base)).toBe(MISSION_ALPHA);
    });
    await waitFor(() => {
      expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'aRevoir' });
    });
  });

  it('@critique « par mission » : le compteur de Bravo mémorise Bravo, jamais Alpha', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const sessionAlpha = await semerSession(MISSION_ALPHA, UNITE_ALPHA);
    const sessionBravo = await semerSession(MISSION_BRAVO, UNITE_BRAVO);
    await semerPoint(MISSION_ALPHA, sessionAlpha, Q_UN);
    await semerPoint(MISSION_BRAVO, sessionBravo, Q_UN);
    await semerPoint(MISSION_BRAVO, sessionBravo, Q_DEUX);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    // Anti-vacuité : les deux compteurs disent des nombres DIFFÉRENTS, donc
    // chacun compte bien ses propres lignes (invariant 6).
    expect(within(carte(TITRE_ALPHA)).getByRole('button', { name: /1 point\(s\)/ })).toBeTruthy();
    fireEvent.click(
      within(carte(TITRE_BRAVO)).getByRole('button', { name: /2 point\(s\) à revoir/ }),
    );

    await waitFor(async () => {
      expect(await lireMissionARevoir(base)).toBe(MISSION_BRAVO);
    });
  });

  it('@critique UN SEUL compteur par carte — le nombre ne se dit pas deux fois (leçon B6)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_ALPHA, UNITE_ALPHA);
    await semerPoint(MISSION_ALPHA, session, Q_UN);
    await semerPoint(MISSION_ALPHA, session, Q_DEUX);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const texte = carte(TITRE_ALPHA).textContent;
    const occurrences = texte.match(/point\(s\) à revoir/g) ?? [];
    expect(occurrences).toHaveLength(1);
    // …et c'est bien le BOUTON qui le porte, pas une phrase morte à côté.
    expect(
      within(carte(TITRE_ALPHA)).getByRole('button', { name: /2 point\(s\) à revoir/ }),
    ).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LE ZÉRO — le choix d'A22, éprouvé dans les deux sens
// ─────────────────────────────────────────────────────────────────────────────
describe('NB-15 — à zéro, le compteur n’est pas un lien mais une phrase', () => {
  it('@critique aucun point à revoir ⇒ AUCUN bouton, et la phrase qui répond à sa place', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const alpha = carte(TITRE_ALPHA);
    // Ni bouton actif, ni bouton grisé : un bouton désactivé promettrait une
    // destination et la refuserait — la phrase, elle, RÉPOND.
    expect(within(alpha).queryByRole('button', { name: /point\(s\) à revoir/ })).toBeNull();
    expect(within(alpha).getByText('Aucun point à revoir')).toBeTruthy();
    // Le zéro n'est écrit nulle part comme un nombre : « 0 point(s) » serait la
    // formulation que la phrase remplace.
    expect(alpha.textContent).not.toMatch(/0 point\(s\)/);
  });

  it('@critique la bascule est portée par le NOMBRE, pas par la mission : 1 point suffit à faire le bouton', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_ALPHA, UNITE_ALPHA);
    await semerPoint(MISSION_ALPHA, session, Q_UN);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    // Sur la MÊME page : Alpha a son bouton, Bravo a sa phrase. C'est la
    // falsification du choix d'A22 — un écran qui rendrait toujours l'un ou
    // toujours l'autre échoue ici.
    expect(
      within(carte(TITRE_ALPHA)).getByRole('button', { name: /1 point\(s\) à revoir/ }),
    ).toBeTruthy();
    expect(
      within(carte(TITRE_BRAVO)).queryByRole('button', { name: /point\(s\) à revoir/ }),
    ).toBeNull();
    expect(within(carte(TITRE_BRAVO)).getByText('Aucun point à revoir')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. L'ALERTE PORTE LE MÊME GESTE (03 §17.3 — rappels passifs, jamais muets)
// ─────────────────────────────────────────────────────────────────────────────
describe('NB-15 — l’alerte « à revoir en attente » se traite là où on la lit', () => {
  it('@critique l’alerte offre « Voir les points à revoir », qui mémorise SA mission et ouvre la liste', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_BRAVO, UNITE_BRAVO);
    await semerPoint(MISSION_BRAVO, session, Q_UN);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    // L'alerte existe et NOMME le nombre (anti-vacuité : sans elle, le geste
    // ci-dessous prouverait qu'un bouton existe, pas qu'une alerte est traitable).
    expect(screen.getByText(/1 point\(s\) à revoir attendent d’être levés/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les points à revoir' }));
    await waitFor(async () => {
      expect(await lireMissionARevoir(base)).toBe(MISSION_BRAVO);
    });
    await waitFor(() => {
      expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'aRevoir' });
    });
  });

  it('sans point à revoir, aucune alerte de ce genre n’est levée', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();
    expect(screen.queryByRole('button', { name: 'Voir les points à revoir' })).toBeNull();
    expect(screen.queryByText(/attendent d’être levés/)).toBeNull();
  });
});
