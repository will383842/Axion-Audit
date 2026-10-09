// =============================================================================
// L'ÉCRAN DE SYNCHRONISATION — lot L6, incrément L6b « ce qui se voit ».
// ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6 : A22 écrit l'écran, il ne corrige rien ici) depuis
// 05 §9.3 (« n réponse(s) arbitrée(s) », cliquable ; « à examiner » visible,
// jamais de suppression silencieuse), 05 §9.9 (« rejetée » visible, jamais
// rejouée), 03 §33.2 (les QUATRE états), `LOT_L6.md` §3ter C.2 (« au plus UN
// role="alert" par écran, le reste en role="status" et visible · aucune couleur
// ni taille en dur · le statut lit le local, jamais le réseau »), et
// l'invariant 7.
//
// ── API ATTENDUE (pour A22) ─────────────────────────────────────────────────
//   `apps/field/src/ecrans/sync/EcranSynchronisation.tsx` :
//     export function EcranSynchronisation(): ReactNode;   // lit `useTerrain().base`
//   `apps/field/src/app/vues.ts` : nouvelle vue
//     synchronisation: { titre: 'Synchronisation', exigeCoffreOuvert: true }
//   (l'écran ne peint PAS de <h1> : la coquille le fait ; ses sections sont des <h2>.)
//   Le geste « Remettre en file » appelle `portSyncDeLaBase(base).remettreEnFile`.
//   Le compte « n réponse(s) arbitrée(s) » se lit dans `meta`
//   (`cleReponsesArbitrees(missionId)`, `sync/moteur.ts`).
//
// ── AXE-CORE ────────────────────────────────────────────────────────────────
// `axe-core` n'est pas une dépendance de `apps/field` (seul `@axe-core/playwright`
// l'est, à la racine) ; l'ajouter relèverait de 11 §8. Le balayage axe de cette
// vue est porté par `e2e/accessibilite-toutes-vues-l5.e2e.ts` (A28), dont le
// contrôle d'anti-vacuité ROUGIT tant qu'une vue de `VUES` n'a pas de parcours :
// le test « vue déclarée » ci-dessous est donc ce qui ENCLENCHE le balayage axe.
// Ici : les règles structurelles qu'un test de composant peut prouver.
//
// Traçabilité : E7, E38, E44 (grille §33) ; invariants 4, 5, 7, 8.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { VUES } from '../../app/vues.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { cleReponsesArbitrees } from '../../sync/moteur.js';
import { EcranSynchronisation } from './EcranSynchronisation.js';

const INSTANT = '2026-10-09T09:00:00.000Z';
const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const MOTIF_EXAMEN = 'Cette opération ne se lit plus sur cet appareil : elle reste à examiner.';
const MOTIF_REJET = 'Écriture refusée par le siège : cette session ne vous appartient pas.';

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
  const base = new BaseLocale(`axion-test-ecran-sync-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/** Fait échouer TOUTE lecture de l'outbox : la panne locale que l'écran doit attraper. */
async function baseDontLaFileEstIllisible(): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'panne-lecture-outbox',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== 'outbox') return table;
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

async function installerCoffre(base: BaseLocale): Promise<void> {
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
}

async function installer(base: BaseLocale): Promise<void> {
  await installerCoffre(base);
  await appliquerDescente({
    missionId: MISSION,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
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
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION), INSTANT);
}

async function saisirReponse(): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION,
    action: 'upsert',
    index: {
      interviewId: uuidv7(),
      missionQuestionId: uuidv7(),
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 3 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive ?',
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
  return id;
}

async function marquer(
  base: BaseLocale,
  entiteId: string,
  statut: 'a_examiner' | 'rejetee',
  motif: string,
): Promise<string> {
  const op = (await base.outbox.toArray()).find((o) => o.entiteId === entiteId);
  if (op === undefined) throw new Error('banc : op absente');
  await base.outbox.update(op.opId, { statut, tentatives: 10, derniereErreur: motif });
  return op.opId;
}

/** La file nominale : 2 en attente, 1 à examiner, 1 rejetée ; 2 réponses arbitrées. */
async function semerFileNominale(base: BaseLocale) {
  await saisirReponse();
  await saisirReponse();
  const aExaminer = await saisirReponse();
  const rejetee = await saisirReponse();
  const opExamen = await marquer(base, aExaminer, 'a_examiner', MOTIF_EXAMEN);
  await marquer(base, rejetee, 'rejetee', MOTIF_REJET);
  await ecrireMeta(base, cleReponsesArbitrees(MISSION), 2);
  return { opExamen };
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
    navigation: { pile: ['accueil', 'synchronisation'] } as unknown as ValeurTerrain['navigation'],
    vue: 'synchronisation' as ValeurTerrain['vue'],
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

async function attendreLecture(): Promise<void> {
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

let fetchEspion: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(91), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  vi.unstubAllGlobals();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

function espionnerReseau(): void {
  fetchEspion = vi.fn(() => Promise.reject(new Error('le statut ne lit JAMAIS le réseau')));
  vi.stubGlobal('fetch', fetchEspion);
}

// =============================================================================
// LA VUE EST DÉCLARÉE (ce qui enclenche aussi le balayage axe e2e d'A28)
// =============================================================================
describe('EcranSynchronisation — vue déclarée', () => {
  it('la vue « synchronisation » existe, titrée en français, coffre ouvert exigé', () => {
    const vues: Record<string, { titre: string; exigeCoffreOuvert: boolean }> = VUES;
    expect(vues.synchronisation).toEqual({ titre: 'Synchronisation', exigeCoffreOuvert: true });
  });
});

// =============================================================================
// LES QUATRE ÉTATS (03 §33.2)
// =============================================================================
describe('EcranSynchronisation — les quatre états', () => {
  it('CHARGEMENT : avant la lecture locale, un statut occupé (jamais un écran blanc, jamais une alerte)', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    await attendreLecture();
  });

  it('VIDE : file vide ⇒ une phrase qui le dit, aucune alerte, aucun geste de remise en file', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    espionnerReseau();
    render(<EcranSynchronisation />);
    await attendreLecture();
    expect(screen.getByText(/aucune opération en attente/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /remettre en file/i })).toBeNull();
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('@critique ERREUR : file illisible ⇒ UNE alerte en français (cause + action), l’écran ne tombe pas', async () => {
    const base = await baseDontLaFileEstIllisible();
    await installerCoffre(base);
    terrain = terrainDeBase(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<EcranSynchronisation />);
      const alerte = await screen.findByRole('alert');
      expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
      expect(alerte.textContent.length).toBeGreaterThan(20);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    } finally {
      silence.mockRestore();
    }
  });

  it('@critique NOMINAL : en attente, à examiner (avec motif), rejetées (avec motif), arbitrées — lus dans le LOCAL', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    espionnerReseau();
    render(<EcranSynchronisation />);
    await attendreLecture();

    expect(screen.getByText(/2 opérations en attente/i)).toBeTruthy();
    expect(screen.getByText(MOTIF_EXAMEN)).toBeTruthy();
    expect(screen.getByText(MOTIF_REJET)).toBeTruthy();
    expect(screen.getByRole('button', { name: /2 réponses arbitrées/i })).toBeTruthy();
    // Un seul geste de remise : celui de l'op à examiner — jamais pour une rejetée (05 §9.9).
    expect(screen.getAllByRole('button', { name: /remettre en file/i })).toHaveLength(1);
    expect(fetchEspion).not.toHaveBeenCalled();
  });
});

// =============================================================================
// ACCESSIBILITÉ STRUCTURELLE
// =============================================================================
describe('EcranSynchronisation — au plus UNE alerte, le reste en statut', () => {
  it('@critique file à examiner + rejetée + appareil jamais synchronisé : au plus UN role="alert", des role="status" visibles', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();

    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
    const statuts = screen.getAllByRole('status');
    expect(statuts.length).toBeGreaterThanOrEqual(1);
    for (const statut of statuts) expect(statut.hidden).toBe(false);
  });

  it('aucun <h1> peint par l’écran (la coquille le fait) ; des sections titrées en <h2>', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();
    expect(document.querySelectorAll('h1')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: /à examiner/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /rejet/i })).toBeTruthy();
  });

  it('chaque bouton a un nom accessible en français', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();
    for (const bouton of screen.getAllByRole('button')) {
      expect(bouton.textContent.trim() || bouton.getAttribute('aria-label')).toMatch(
        /[a-zéèàç]{3}/i,
      );
    }
  });
});

// =============================================================================
// LES GESTES
// =============================================================================
describe('EcranSynchronisation — gestes', () => {
  it('@critique « Remettre en file » : l’op repasse en attente, compteur à zéro, rien n’est supprimé', async () => {
    const base = await nouvelleBase();
    await installer(base);
    const { opExamen } = await semerFileNominale(base);
    const totalAvant = await base.outbox.count();
    terrain = terrainDeBase(base);
    espionnerReseau();
    render(<EcranSynchronisation />);
    await attendreLecture();

    fireEvent.click(screen.getByRole('button', { name: /remettre en file/i }));

    await waitFor(async () => {
      const op = await base.outbox.get(opExamen);
      expect(op?.statut).toBe('en_attente');
      expect(op?.tentatives).toBe(0);
    });
    expect(await base.outbox.count()).toBe(totalAvant);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /remettre en file/i })).toBeNull();
    });
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('« n réponses arbitrées » est cliquable et dit ce qui s’est passé (la version perdante est archivée, rien n’est perdu)', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();

    const bouton = screen.getByRole('button', { name: /2 réponses arbitrées/i });
    fireEvent.click(bouton);
    const detail = await screen.findByText(/archivée/i);
    expect(detail).toBeTruthy();
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('le singulier est juste : « 1 réponse arbitrée », « 1 opération en attente »', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await saisirReponse();
    await ecrireMeta(base, cleReponsesArbitrees(MISSION), 1);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();
    expect(screen.getByRole('button', { name: /1 réponse arbitrée\b/i })).toBeTruthy();
    expect(screen.getByText(/1 opération en attente\b/i)).toBeTruthy();
  });

  it('les sections « à examiner » et « rejetées » nomment la mission de chaque op', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await semerFileNominale(base);
    terrain = terrainDeBase(base);
    render(<EcranSynchronisation />);
    await attendreLecture();
    const section = screen
      .getByRole('heading', { level: 2, name: /à examiner/i })
      .closest('section');
    if (section === null) throw new Error('section « à examiner » absente');
    expect(within(section).getByText(/Mission fictive FIL-TPE/)).toBeTruthy();
  });
});

// =============================================================================
// INVARIANT 4 — aucune couleur ni taille en dur dans `ecrans/sync/**`
// =============================================================================
describe('EcranSynchronisation — tokens du design system uniquement', () => {
  function fichiersSources(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return fichiersSources(chemin);
      return /\.(tsx?|css)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
    });
  }

  it('aucun code couleur, rgb(), hsl() ni taille en px/rem dans les sources de l’écran', () => {
    const dossier = fileURLToPath(new URL('.', import.meta.url));
    const sources = fichiersSources(dossier);
    expect(sources.length).toBeGreaterThan(0);
    const interdits = [
      /#[0-9a-f]{3,8}\b/i,
      /\brgba?\(/i,
      /\bhsla?\(/i,
      /\b\d+(\.\d+)?(px|rem|em)\b/,
    ];
    for (const fichier of sources) {
      const texte = readFileSync(fichier, 'utf8')
        .split('\n')
        .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
        .join('\n');
      for (const motif of interdits) {
        expect(motif.test(texte), `${fichier} : ${String(motif)}`).toBe(false);
      }
    }
  });
});
