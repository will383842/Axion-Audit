// =============================================================================
// LE PILOTE DE MISSION ET LE PARCOURS EXPRESS R1 — lot L5, incrément L5c.
// Écrit par A27 (09 §5.6), depuis 03 §29 R1 (« en niveau `diagnostic_cadrage`
// sur structure mono-unité […] pilote condensé (3 étapes visibles). Guidé
// intégral dès > 1 unité ou > 3 entretiens »), 03 §19.1 (« jamais un simple
// cadenas muet »), 03 §17.2 (cliquer sur un manque amène à l'écran qui le
// résout) et 03 §33.2 (quatre états).
//
// ── LES DEUX SEUILS, AUX BORNES EXACTES ──────────────────────────────────────
// A23 a testé la relecture des seuils DANS le pack (`pilote.test.ts`) : « > 3 »,
// pas « >= 3 ». Ce fichier les mesure côté ÉCRAN, en montant deux missions de
// part et d'autre de chaque borne : 3 entretiens = condensé, 4 = complet ;
// 1 unité = condensé, 2 = complet. Une borne recopiée à l'envers dans l'écran
// (ou dans `mesurer`, qui compte les lignes locales) rougit ici.
//
// Traçabilité : E24 (validation obligatoire de chaque étape) · E23 (novice
// < 30 min) · E6 (hors ligne total) · E44 (UX/UI 2026-2027 : tokens, police locale).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import {
  ENTRETIENS_MAX_EXPRESS,
  ETAPES_VISIBLES_EXPRESS,
  ETAPES_PILOTE,
  NIVEAU_AUDIT_EXPRESS,
  UNITES_MAX_EXPRESS,
} from '../../agenda/pilote.js';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import {
  appliquerDescente,
  ecrireLocal,
  type EnregistrementDescendant,
} from '../../local/ecriture.js';
import { jetonsDeRecherche } from '../../local/formes.js';
import { EcranPilote } from './EcranPilote.js';

const INSTANT = '2026-09-05T12:00:00.000Z';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';

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

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-pilote-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

async function baseDontLesLecturesEchouent(): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'panne-lecture-missions',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== 'missions') return table;
        const refus = () => Promise.reject(new Error('panne injectée en lecture'));
        return {
          ...table,
          get: refus,
          getMany: refus,
          query: refus,
          openCursor: refus,
          count: refus,
        };
      },
    }),
  });
  await base.open();
  return base;
}

async function installer(base: BaseLocale): Promise<Coffre> {
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return coffre;
}

interface FormeMission {
  readonly id: string;
  readonly titre: string;
  readonly auditLevel: string;
  readonly unites: number;
  readonly questions: number;
  readonly entretiens: number;
}

/** Descend une mission avec N unités, N questions figées, puis sème N sessions. */
async function semerMission(forme: FormeMission): Promise<void> {
  const enregistrements: EnregistrementDescendant[] = [
    {
      table: 'missions',
      index: { id: forme.id, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
      charge: {
        titre: forme.titre,
        companyId: '0191e2a0-0000-7000-8000-00000000cccc',
        timezone: 'Europe/Paris',
        auditLevel: forme.auditLevel,
        geoScope: 'france',
        countryCode: 'FR',
        startPlanned: null,
        endPlanned: null,
        roleSurMission: 'auditeur',
      },
    },
  ];
  const unites: string[] = [];
  for (let i = 0; i < forme.unites; i += 1) {
    const id = uuidv7();
    unites.push(id);
    enregistrements.push({
      table: 'orgUnits',
      index: {
        id,
        missionId: forme.id,
        parentId: null,
        kind: 'service',
        status: 'active',
        position: i + 1,
        clientUpdatedAt: INSTANT,
        supprimeLe: null,
      },
      charge: {
        name: `Unité fictive ${String(i + 1)}`,
        countryCode: null,
        timezone: null,
        headcount: 3,
        serviceRefId: null,
        sectorId: null,
        inScope: true,
        proposedBy: null,
        mergedIntoId: null,
        clientCreatedAt: INSTANT,
      },
    });
  }
  for (let i = 0; i < forme.questions; i += 1) {
    const texte = `Question fictive ${String(i + 1)}`;
    enregistrements.push({
      table: 'missionQuestions',
      index: {
        id: uuidv7(),
        missionId: forme.id,
        position: i + 1,
        texteSnapshot: texte,
        motsCles: jetonsDeRecherche(texte),
        answerType: 'yes_no',
        criticality: 'important',
        clientUpdatedAt: INSTANT,
        supprimeLe: null,
      },
      charge: {
        questionId: uuidv7(),
        questionVersion: 1,
        guidanceSnapshot: null,
        optionsSnapshot: null,
        scoringSnapshot: null,
        weightSnapshot: 1,
        allowRangeSnapshot: false,
        addedAdHoc: false,
        blockCode: 'bloc_fictif',
      },
    });
  }
  await appliquerDescente({
    missionId: forme.id,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements,
  });
  for (let i = 0; i < forme.entretiens; i += 1) {
    await ecrireLocal({
      entite: 'interview',
      id: uuidv7(),
      missionId: forme.id,
      action: 'upsert',
      index: {
        orgUnitId: unites[0] ?? uuidv7(),
        kind: 'entretien',
        status: 'termine',
        scheduleStatus: 'realise',
        scheduledAt: null,
      },
      charge: {
        conductedBy: AUDITEUR_ID,
        mode: 'sur_site',
        personName: `Personne fictive ${String(i + 1)}`,
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
        scheduledDurationMin: null,
        startedAt: INSTANT,
        endedAt: INSTANT,
        valideeLe: null,
        clientCreatedAt: INSTANT,
      },
    });
  }
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
    navigation: { pile: ['pilote'] },
    vue: 'pilote',
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

/** Ce que le harnais exige d'avoir : lève avec un message clair plutôt qu'un `!`. */
function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

async function monter(base: BaseLocale): Promise<void> {
  terrain = terrainDeBase(base);
  render(<EcranPilote />);
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

/** La carte d'une mission, par son titre. */
function carte(titre: RegExp): HTMLElement {
  return requis(
    screen.getByRole('heading', { name: titre }).closest<HTMLElement>('.axn-journee__carte'),
    'carte de mission',
  );
}

function etapes(c: HTMLElement): HTMLElement[] {
  return [...c.querySelectorAll<HTMLElement>('li.axn-journee__etape')];
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(29), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LES QUATRE ÉTATS
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranPilote — état CHARGEMENT', () => {
  it('avant la lecture : squelette occupé (six lignes, la hauteur finale du pilote), aucune alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranPilote />);
    expect(estOccupe()).toBe(true);
    expect(document.body.textContent).toMatch(/avancement/i);
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
  });
});

describe('EcranPilote — état VIDE', () => {
  it('aucune mission ⇒ « aucune mission », et ce qu’il faut faire — sans réseau', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await monter(base);
    expect(document.body.textContent).toMatch(/aucune mission sur cet appareil/i);
    expect(document.body.textContent).toMatch(/embarquez une mission/i);
    expect(document.body.textContent).toMatch(/sans réseau/i);
    expect(document.querySelectorAll('li.axn-journee__etape').length).toBe(0);
  });
});

describe('EcranPilote — état ERREUR', () => {
  it('@critique si la lecture locale REJETTE, une erreur en français (cause + action) — l’écran ne tombe pas', async () => {
    const base = await baseDontLesLecturesEchouent();
    await installer(base);
    terrain = terrainDeBase(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<EcranPilote />);
      const alerte = await screen.findByRole('alert');
      expect(alerte.textContent).toMatch(/l’avancement n’a pas pu être lu/i);
      expect(alerte.textContent).toMatch(/données locales/i);
      expect(alerte.textContent).toMatch(/rechargez/i);
      expect(document.querySelectorAll('li.axn-journee__etape').length).toBe(0);
    } finally {
      silence.mockRestore();
    }
  });
});

describe('EcranPilote — HORS LIGNE : nominal, tout est calculé sur les lignes locales', () => {
  it('sans réseau, le pilote se rend entièrement, sans alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive hors ligne',
      auditLevel: 'standard',
      unites: 1,
      questions: 1,
      entretiens: 1,
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      await monter(base);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(etapes(carte(/hors ligne/)).length).toBe(ETAPES_PILOTE.length);
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. R1 — LES DEUX SEUILS AUX BORNES EXACTES, CÔTÉ RENDU
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranPilote — parcours express R1 (03 §29), borne des ENTRETIENS', () => {
  it('@critique 3 entretiens = condensé (3 étapes visibles) ; 4 entretiens = guidé complet (6 étapes) — « > 3 », pas « >= 3 »', async () => {
    const base = await nouvelleBase();
    await installer(base);
    const auSeuil = uuidv7();
    const auDela = uuidv7();
    await semerMission({
      id: auSeuil,
      titre: 'Mission fictive au seuil',
      auditLevel: NIVEAU_AUDIT_EXPRESS,
      unites: 1,
      questions: 1,
      entretiens: ENTRETIENS_MAX_EXPRESS,
    });
    await semerMission({
      id: auDela,
      titre: 'Mission fictive au-delà',
      auditLevel: NIVEAU_AUDIT_EXPRESS,
      unites: 1,
      questions: 1,
      entretiens: ENTRETIENS_MAX_EXPRESS + 1,
    });
    expect(ENTRETIENS_MAX_EXPRESS).toBe(3);
    await monter(base);

    const condensee = carte(/au seuil/);
    expect(
      within(condensee).getByText('Parcours condensé', { selector: '.axn-badge, span' }),
    ).toBeTruthy();
    expect(etapes(condensee).length).toBe(ETAPES_VISIBLES_EXPRESS);
    expect(ETAPES_VISIBLES_EXPRESS).toBe(3);
    // Le motif du condensé est affiché — un pilote qui change de forme sans le dire ressemble à un bug.
    expect(condensee.textContent).toMatch(/mono-unité/i);
    expect(condensee.textContent).toMatch(/diagnostic de cadrage/i);
    // Les étapes auto-validées ne sont pas visibles : ni « Cadrage » ni « Préparation ».
    const libellesCondense = etapes(condensee).map(
      (e) => e.querySelector('.axn-journee__etape-libelle')?.textContent ?? '',
    );
    expect(libellesCondense).not.toContain('Cadrage');
    expect(libellesCondense).not.toContain('Préparation');

    const complete = carte(/au-delà/);
    expect(complete.textContent).toMatch(/Parcours complet/);
    expect(etapes(complete).length).toBe(ETAPES_PILOTE.length);
    expect(ETAPES_PILOTE.length).toBe(6);
    // Le motif nomme le compte RÉEL et le seuil du pack.
    expect(complete.textContent).toMatch(/4 sessions de collecte/);
    expect(complete.textContent).toMatch(/au-delà de 3/);
  });
});

describe('EcranPilote — parcours express R1 (03 §29), borne des UNITÉS', () => {
  it('@critique 1 unité = condensé ; 2 unités = guidé complet, motif « dès la deuxième »', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive mono-unité',
      auditLevel: NIVEAU_AUDIT_EXPRESS,
      unites: UNITES_MAX_EXPRESS,
      questions: 1,
      entretiens: 0,
    });
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive bi-unité',
      auditLevel: NIVEAU_AUDIT_EXPRESS,
      unites: UNITES_MAX_EXPRESS + 1,
      questions: 1,
      entretiens: 0,
    });
    expect(UNITES_MAX_EXPRESS).toBe(1);
    await monter(base);

    const mono = carte(/mono-unité/);
    expect(mono.textContent).toMatch(/Parcours condensé/);
    expect(etapes(mono).length).toBe(ETAPES_VISIBLES_EXPRESS);

    const bi = carte(/bi-unité/);
    expect(bi.textContent).toMatch(/Parcours complet/);
    expect(etapes(bi).length).toBe(ETAPES_PILOTE.length);
    expect(bi.textContent).toMatch(/2 unités/);
    expect(bi.textContent).toMatch(/dès la deuxième/);
  });

  it('@critique le niveau d’audit est la troisième condition : « standard » mono-unité reste en parcours complet, et le dit', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive standard',
      auditLevel: 'standard',
      unites: 1,
      questions: 1,
      entretiens: 1,
    });
    await monter(base);
    const c = carte(/standard/);
    expect(c.textContent).toMatch(/Parcours complet/);
    expect(etapes(c).length).toBe(ETAPES_PILOTE.length);
    expect(c.textContent).toMatch(/réservé au niveau « diagnostic de cadrage »/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. JAMAIS UN CADENAS MUET (03 §19.1, §17.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranPilote — chaque étape non validée dit ce qui manque', () => {
  it('@critique aucune étape « À faire » sans au moins un manque écrit ; la Collecte sans session offre « Planifier une session », qui navigue', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive sans collecte',
      auditLevel: 'standard',
      unites: 1,
      questions: 0,
      entretiens: 0,
    });
    await monter(base);
    const c = carte(/sans collecte/);
    for (const etape of etapes(c)) {
      if (!etape.textContent.includes('À faire')) continue;
      const manques = etape.querySelectorAll('.axn-journee__manques li');
      expect(manques.length, `étape muette : ${etape.textContent}`).toBeGreaterThan(0);
    }
    expect(c.textContent).toMatch(/questionnaire de la mission n’est pas descendu/i);
    expect(c.textContent).toMatch(/aucune session de collecte/i);
    // Ce qui se résout au siège le DIT, plutôt qu'un bouton vers un écran absent.
    expect(c.textContent).toMatch(/depuis la console/i);

    fireEvent.click(within(c).getByRole('button', { name: /planifier une session/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'agenda' });
    // Un seul bouton d'action sur le pilote : les autres étapes ne mènent nulle part ici.
    expect(within(c).getAllByRole('button').length).toBe(1);
  });

  it('en express, une étape validée d’office est marquée « Validée d’office » — si elle est visible ; le Cadrage validé ne l’est pas', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerMission({
      id: uuidv7(),
      titre: 'Mission fictive express partielle',
      auditLevel: NIVEAU_AUDIT_EXPRESS,
      unites: 1,
      questions: 0,
      entretiens: 1,
    });
    await monter(base);
    const c = carte(/express partielle/);
    // Sans question descendue, « Préparation » n'est PAS trivialement satisfaite :
    // elle reste visible, avec son manque — R1 ne valide jamais l'absence de travail.
    const libelles = etapes(c).map(
      (e) => e.querySelector('.axn-journee__etape-libelle')?.textContent,
    );
    expect(libelles).toContain('Préparation');
    expect(libelles).not.toContain('Cadrage');
    expect(c.textContent).toMatch(/questionnaire de la mission n’est pas descendu/i);
  });
});
