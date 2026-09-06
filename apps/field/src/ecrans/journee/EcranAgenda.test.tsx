// =============================================================================
// L'AGENDA D'ENTRETIENS — lot L5, incrément L5c. Écrit par A27 (09 §5.6), depuis
// 03 §25.2 (agenda, version simple ; chevauchement = avertissement NON
// bloquant), §27.1/§28.1 (les SIX types de session, dont l'atelier et ses
// participants), §32.6-1 (le mode n'existe QUE pour l'entretien ; « complémentaire »
// est un mode, pas un type), §25.3 (proposition d'unité : nom, type,
// rattachement, effectif — et l'arbitrage tracé : PAS de champ « note », le
// schéma n'a nulle part où la poser), 03 §33.2 (quatre états) et 03 §34.2-1 (la
// planification est la moitié amont du « un tap »).
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. Les quatre états. L'état ERREUR est le point dur : l'écran lit ses
//      missions par `useLiveQuery` et doit ATTRAPER un rejet de la base — sinon
//      il tombe, page blanche, exactement l'écart R-L5a-7 / R-L7a-5.
//   B. Les six `kind` sont proposés, avec leurs libellés français ; l'atelier
//      demande des participants et pas un interlocuteur ; le mode n'apparaît que
//      pour l'entretien, et « complémentaire » y est.
//   C. Planifier ÉCRIT une session `non_demarre`/`planifie`, UUID v7, hors ligne,
//      avec tout ce que le « un tap » réutilisera (nom, fonction, unité, type).
//   D. L'anti-collision AVERTIT et NE BLOQUE PAS : la seconde session est créée.
//   E. La proposition d'unité : trois champs et un type, AUCUN champ « note » ;
//      l'unité proposée est immédiatement rattachable.
//
// ── LE HARNAIS ───────────────────────────────────────────────────────────────
// Le même que le cockpit : base Dexie réelle, coffre réel, `useTerrain` simulé.
// L'identité de l'auditeur est rangée chiffrée dans `meta` (05 §9.9 :
// propriétaire des sessions) — sans elle, planifier doit ÉCHOUER en français.
//
// Traçabilité : E12 (entretiens par interlocuteur) · E6 (hors ligne total) ·
// E23 (novice < 30 min) · E44 (UX/UI 2026-2027 : tokens, police locale).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { LIBELLE_TYPE_SESSION } from '../../agenda/sessions.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { appliquerDescente } from '../../local/ecriture.js';
import { TYPES_DE_SESSION } from '../../local/formes.js';
import { maintenant } from '../../local/horloge.js';
import { memoriserIdentiteAuditeur } from '../../session/auditeur.js';
import { lireUnites } from '../../session/missions.js';
import { EcranAgenda } from './EcranAgenda.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f5c1';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000000c5c1';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  const base = new BaseLocale(`axion-test-ecran-agenda-${String(compteur)}`);
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

/**
 * Une mission embarquée avec une unité. L'horloge de l'application est réglée
 * sur l'instant RÉEL : les créneaux saisis « maintenant » sont donc du jour.
 */
async function embarquerMission(base: BaseLocale, avecIdentite = true): Promise<void> {
  const coffre = await installer(base);
  const instant = new Date().toISOString();
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: instant,
    prochainSince: instant,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'en_cours', clientUpdatedAt: instant, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
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
          clientUpdatedAt: instant,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 9,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: instant,
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), instant);
  if (avecIdentite) {
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'guide_strict' });
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
    navigation: { pile: ['agenda'] },
    vue: 'agenda',
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

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

async function monterNominal(base: BaseLocale): Promise<void> {
  terrain = terrainDeBase(base);
  render(<EcranAgenda />);
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
  await screen.findByRole('button', { name: /^planifier$/i });
  // Les unités arrivent par une SECONDE `useLiveQuery` : on attend que le
  // sélecteur « Unité » soit peuplé — c'est ce qu'un auditeur voit avant de taper.
  await waitFor(() => {
    expect(
      within(screen.getByLabelText<HTMLSelectElement>(/^unité$/i)).getAllByRole('option').length,
    ).toBeGreaterThan(0);
  });
}

/** `'AAAA-MM-JJTHH:mm'` en heure LOCALE de l'appareil — ce que `datetime-local` rend. */
function creneauLocal(decalageMinutes: number): string {
  const d = new Date(Date.parse(maintenant()) + decalageMinutes * 60_000);
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

function selection(nom: RegExp): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>(nom);
}

function choisir(nom: RegExp, valeur: string): void {
  fireEvent.change(selection(nom), { target: { value: valeur } });
}

function saisir(nom: RegExp, valeur: string): void {
  fireEvent.change(screen.getByLabelText(nom), { target: { value: valeur } });
}

async function planifier(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^planifier$/i }));
    await Promise.resolve();
  });
}

function reglerEnLigne(valeur: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valeur });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(28), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  Reflect.deleteProperty(navigator, 'onLine');
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LES QUATRE ÉTATS
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAgenda — état CHARGEMENT', () => {
  it('avant la lecture des missions : squelette occupé, aucun formulaire, aucune alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranAgenda />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('button', { name: /^planifier$/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
  });
});

describe('EcranAgenda — état VIDE', () => {
  it('@critique aucune mission embarquée ⇒ « aucune mission », ce qu’il faut faire, et un retour à l’accueil qui navigue', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranAgenda />);
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
    expect(document.body.textContent).toMatch(/aucune mission sur cet appareil/i);
    expect(document.body.textContent).toMatch(/embarquez une mission/i);
    expect(screen.queryByRole('button', { name: /^planifier$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /revenir à l’accueil/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'accueil' });
  });
});

describe('EcranAgenda — état ERREUR (l’écart R-L5a-7, rejoué sur cet écran)', () => {
  // 03 §33.2 : « erreur (cause + action, français clair) ». La lecture des
  // missions passe par `useLiveQuery` ; si la base REJETTE et que rien ne
  // l'attrape, `dexie-react-hooks` relance l'erreur au rendu et l'écran tombe.
  // Si ce test rougit, c'est CE défaut — constaté, remonté, pas corrigé (09 §5.6).
  it('@critique si la lecture locale REJETTE, une erreur en français (cause + action) — l’écran ne tombe pas', async () => {
    const base = await baseDontLesLecturesEchouent();
    await installer(base);
    terrain = terrainDeBase(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let rendu: (() => void) | null = null;
      expect(() => {
        rendu = () => render(<EcranAgenda />);
        rendu();
      }).not.toThrow();
      const alerte = await screen.findByRole('alert');
      expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
      expect(alerte.textContent.length).toBeGreaterThan(20);
      expect(alerte.textContent).toMatch(/recharg|réessay|sauvegarde/i);
    } finally {
      silence.mockRestore();
    }
  });
});

describe('EcranAgenda — HORS LIGNE : le mode nominal de la planification (invariant 1)', () => {
  it('@critique sans réseau, le formulaire est ENTIER et planifier ÉCRIT la session localement', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    reglerEnLigne(false);
    await monterNominal(base);

    expect(screen.queryByRole('alert')).toBeNull();
    saisir(/nom de l’interlocuteur/i, 'Hors Ligne Fictive');
    saisir(/^fonction/i, 'Responsable fictif');
    saisir(/créneau/i, creneauLocal(60));
    await planifier();
    await waitFor(async () => {
      expect(
        (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
      ).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LES SIX TYPES DE SESSION (03 §27.1, §28.1, §32.6-1)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAgenda — les six types de session', () => {
  it('@critique le sélecteur propose EXACTEMENT les six `kind` du 04, avec leurs libellés français', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    const options = within(selection(/type de session/i)).getAllByRole<HTMLOptionElement>('option');
    expect(options.map((o) => o.value)).toEqual([...TYPES_DE_SESSION]);
    expect(TYPES_DE_SESSION.length).toBe(6);
    for (const kind of TYPES_DE_SESSION) {
      expect(options.map((o) => o.textContent)).toContain(LIBELLE_TYPE_SESSION[kind]);
    }
    expect(options.map((o) => o.textContent)).toContain('Atelier collectif');
  });

  it('@critique le MODE n’existe que pour l’entretien (dont « complémentaire ») ; il DISPARAÎT pour les autres types', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    const modes = within(selection(/^mode$/i)).getAllByRole<HTMLOptionElement>('option');
    expect(modes.map((o) => o.value)).toEqual(['sur_site', 'distanciel', 'complementaire']);
    expect(modes.map((o) => o.textContent).join(' ')).toMatch(/complémentaire/i);

    for (const kind of TYPES_DE_SESSION.filter((k) => k !== 'entretien')) {
      choisir(/type de session/i, kind);
      expect(screen.queryByLabelText(/^mode$/i), `mode visible pour « ${kind} »`).toBeNull();
    }
    choisir(/type de session/i, 'entretien');
    expect(screen.getByLabelText(/^mode$/i)).toBeTruthy();
  });

  // 03 §28.1-3 : l'atelier porte une « liste des participants ». L'aide du champ
  // dit « Un par ligne » — le champ doit donc ACCEPTER des lignes. Si ce test
  // rougit avec UN seul participant enregistré, c'est que le champ est un
  // `<input>` (qui, par la spécification HTML, retire les sauts de ligne de sa
  // valeur) et non une zone multiligne : un atelier ne pourrait jamais avoir
  // plus d'un participant. Constaté, remonté, PAS corrigé ici (09 §5.6).
  it('@critique l’ATELIER demande des participants — pas un interlocuteur — et les enregistre un par ligne', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    choisir(/type de session/i, 'atelier');
    expect(screen.queryByLabelText(/nom de l’interlocuteur/i)).toBeNull();
    expect(screen.queryByLabelText(/^fonction/i)).toBeNull();
    saisir(/participants/i, 'Alice Fictive — DRH\nBob Fictif — DSI');
    saisir(/créneau/i, creneauLocal(90));
    await planifier();

    await waitFor(async () => {
      const [atelier] = await depotSessions.duJour({
        missionId: MISSION_ID,
        fuseau: 'Europe/Paris',
      });
      expect(atelier?.kind).toBe('atelier');
      expect(atelier?.mode).toBeNull();
      expect(atelier?.participants).toEqual([
        { nom: 'Alice Fictive', fonction: 'DRH' },
        { nom: 'Bob Fictif', fonction: 'DSI' },
      ]);
    });
  });

  it('un atelier SANS participant est refusé en français, et rien n’est écrit', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);
    choisir(/type de session/i, 'atelier');
    saisir(/créneau/i, creneauLocal(90));
    await planifier();
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/au moins un participant/i);
    expect(
      (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. PLANIFIER — la moitié amont du « un tap » (03 §34.2-1)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAgenda — planifier une session', () => {
  it('@critique la session écrite porte nom, fonction, unité, type, créneau UTC, `non_demarre`/`planifie`, UUID v7 — tout ce que le « un tap » réutilise', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    saisir(/nom de l’interlocuteur/i, 'Planifiée Fictive');
    saisir(/^fonction/i, 'Responsable fictif');
    choisir(/^mode$/i, 'distanciel');
    const creneau = creneauLocal(120);
    saisir(/créneau/i, creneau);
    saisir(/durée prévue/i, '30');
    await planifier();

    await waitFor(async () => {
      expect(
        (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
      ).toBe(1);
    });
    const [session] = await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' });
    expect(session?.id).toMatch(UUID_V7);
    expect(session?.kind).toBe('entretien');
    expect(session?.mode).toBe('distanciel');
    expect(session?.personName).toBe('Planifiée Fictive');
    expect(session?.personRole).toBe('Responsable fictif');
    expect(session?.orgUnitId).toBe(UNITE_ID);
    expect(session?.status).toBe('non_demarre');
    expect(session?.scheduleStatus).toBe('planifie');
    expect(session?.scheduledDurationMin).toBe(30);
    expect(session?.conductedBy).toBe(AUDITEUR_ID);
    // Le créneau est en UTC (invariant 5), converti UNE fois depuis l'heure locale.
    expect(session?.scheduledAt).toBe(new Date(creneau).toISOString());
    expect(session?.consentGiven).toBe(false);

    // Le message dit ce qui vient de se passer, et la liste du jour la montre.
    expect(
      screen
        .getAllByRole('status')
        .map((s) => s.textContent)
        .join(' '),
    ).toMatch(/prête à démarrer en un tap/i);
    expect(document.querySelector('.axn-journee__liste')?.textContent).toMatch(/Planifiée Fictive/);
    expect(document.querySelector('.axn-journee__liste')?.textContent).toMatch(/À distance/);
  });

  it('@critique sans identité d’auditeur sur l’appareil, planifier ÉCHOUE en français et n’écrit rien (05 §9.9 : le propriétaire n’est jamais inventé)', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base, false);
    await monterNominal(base);
    saisir(/nom de l’interlocuteur/i, 'Sans Identité');
    saisir(/créneau/i, creneauLocal(60));
    await planifier();
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/identité d’auditeur/i);
    expect(alerte.textContent).toMatch(/connectez-vous/i);
    expect(
      (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
    ).toBe(0);
  });

  it('une session sans créneau est créée quand même, « à planifier » — elle ne figure pas dans la liste du jour', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);
    saisir(/nom de l’interlocuteur/i, 'Sans Créneau');
    await planifier();
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .map((s) => s.textContent)
          .join(' '),
      ).toMatch(/session planifiée/i);
    });
    const lignes = await base.interviews.where('missionId').equals(MISSION_ID).toArray();
    expect(lignes.length).toBe(1);
    expect(lignes[0]?.scheduleStatus).toBe('a_planifier');
    expect(lignes[0]?.scheduledAt).toBeNull();
    expect(
      (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. L'ANTI-COLLISION — un avertissement, jamais un verrou (03 §25.2, §34.6, §19.1)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAgenda — chevauchement', () => {
  it('@critique deux sessions du MÊME interlocuteur sur le même créneau : la seconde est CRÉÉE et un avertissement (non bloquant) le dit', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    const creneau = creneauLocal(180);
    saisir(/nom de l’interlocuteur/i, 'Doublon Fictif');
    saisir(/créneau/i, creneau);
    await planifier();
    await waitFor(async () => {
      expect(
        (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
      ).toBe(1);
    });

    saisir(/nom de l’interlocuteur/i, 'Doublon Fictif');
    saisir(/créneau/i, creneau);
    await planifier();
    await waitFor(async () => {
      expect(
        (await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' })).length,
      ).toBe(2);
    });
    const statuts = screen.getAllByRole('status').map((s) => s.textContent);
    expect(statuts.join(' ')).toMatch(/créneau déjà occupé/i);
    expect(statuts.join(' ')).toMatch(/vous pouvez tout de même planifier/i);
    // Un avertissement, pas une alerte : rien n'a été refusé.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LA PROPOSITION D'UNITÉ (03 §25.3) — et l'arbitrage « pas de note »
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAgenda — proposition d’unité depuis le terrain', () => {
  it('@critique nom, type, effectif — et AUCUN champ « note » (arbitrage tracé : accepter puis jeter serait une perte silencieuse)', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    fireEvent.click(screen.getByRole('button', { name: /l’unité n’est pas dans la liste/i }));
    expect(screen.getByLabelText(/nom de l’unité/i)).toBeTruthy();
    expect(screen.getByLabelText(/type d’unité/i)).toBeTruthy();
    expect(screen.getByLabelText(/effectif estimé/i)).toBeTruthy();
    // Le rattachement supposé est l'unité sélectionnée au-dessus (§25.3).
    expect(screen.getByLabelText(/^unité$/i)).toBeTruthy();
    // Pas de note : ni libellé, ni zone de texte libre.
    expect(screen.queryByLabelText(/note/i)).toBeNull();
    expect(document.querySelectorAll('textarea').length).toBe(0);
    // Les sept types d'unité du 04 sont proposés.
    expect(within(selection(/type d’unité/i)).getAllByRole('option').length).toBe(7);
  });

  it('@critique l’unité proposée est ÉCRITE `proposee`, SÉLECTIONNÉE aussitôt, et une session s’y rattache immédiatement', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);

    fireEvent.click(screen.getByRole('button', { name: /l’unité n’est pas dans la liste/i }));
    saisir(/nom de l’unité/i, 'Cellule fictive proposée');
    choisir(/type d’unité/i, 'equipe');
    saisir(/effectif estimé/i, '4');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /proposer cette unité/i }));
      await Promise.resolve();
    });

    let proposeeId = '';
    await waitFor(async () => {
      const unites = await lireUnites(MISSION_ID);
      const proposee = unites.find((u) => u.status === 'proposee');
      expect(proposee).toBeDefined();
      proposeeId = proposee?.id ?? '';
    });
    const proposee = (await lireUnites(MISSION_ID)).find((u) => u.id === proposeeId);
    expect(proposee?.name).toBe('Cellule fictive proposée');
    expect(proposee?.kind).toBe('equipe');
    expect(proposee?.headcount).toBe(4);
    expect(proposee?.parentId).toBe(UNITE_ID);
    expect(proposee?.proposedBy).toBe(AUDITEUR_ID);
    expect(proposee?.id).toMatch(UUID_V7);

    // Sélectionnée, marquée « (proposée) », et le formulaire de proposition s'est replié.
    await waitFor(() => {
      expect(selection(/^unité$/i).value).toBe(proposeeId);
    });
    const option = within(selection(/^unité$/i)).getByRole<HTMLOptionElement>('option', {
      name: /Cellule fictive proposée \(proposée\)/,
    });
    expect(option.value).toBe(proposeeId);
    expect(screen.queryByLabelText(/nom de l’unité/i)).toBeNull();

    // Et une session s'y rattache sans attendre le siège (§25.3).
    saisir(/nom de l’interlocuteur/i, 'Rattachée Fictive');
    saisir(/créneau/i, creneauLocal(240));
    await planifier();
    await waitFor(async () => {
      const [session] = await depotSessions.duJour({
        missionId: MISSION_ID,
        fuseau: 'Europe/Paris',
      });
      expect(session?.orgUnitId).toBe(proposeeId);
    });
  });

  it('une proposition sans nom est refusée en français, sans écriture', async () => {
    const base = await nouvelleBase();
    await embarquerMission(base);
    await monterNominal(base);
    fireEvent.click(screen.getByRole('button', { name: /l’unité n’est pas dans la liste/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /proposer cette unité/i }));
      await Promise.resolve();
    });
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/besoin d’un nom/i);
    expect((await lireUnites(MISSION_ID)).length).toBe(1);
  });
});
