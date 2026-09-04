// =============================================================================
// TESTS DE LA COQUILLE TERRAIN — LE CÂBLAGE DU VERROU (05 §9.7)
//
// Lot L5, incrément L5a. Second volet de la réserve BLOQUANTE B1 du contrôle A02
// du 2026-09-03 : « unique appelant `contexte.tsx:220`, lui aussi à 0,00 % ».
// Écrits par A26, pas par l'auteur du module (09 §5.6).
//
// ── PÉRIMÈTRE, DIT AVANT D'ÊTRE DEMANDÉ ─────────────────────────────────────
// Ce fichier n'éprouve QUE ce que B1 met en cause : le fil qui va de la session
// locale au délai de verrou, du verrou à la fermeture du coffre, et de la
// fermeture à la ressaisie du mot de passe. L'amorçage de la base, la panne
// `BaseTropRecenteError`, l'état du jeton de siège et la persistance de la vue
// courante sont hors de ce périmètre : ils appartiennent à qui reprendra ce
// fichier, et son nom l'y invite. Un test qui prétendrait couvrir `contexte.tsx`
// en entier alors qu'il n'en couvre qu'un fil serait exactement le vert
// trompeur que ce dépôt traque.
//
// ── CE QUE LE CÂBLAGE DOIT PROUVER ──────────────────────────────────────────
// 05 §9.7 : « La KEK n'est tenue qu'en mémoire de session » et « Ressaisie du mot
// de passe au déverrouillage ». En-tête de `contexte.tsx` : « Le passage
// `ouvert → verrouille` ferme le coffre ET retire le contexte local : après lui,
// plus aucun chemin de code n'atteint la DEK. » Un verrou qui tomberait sans
// appeler `retirerContexteLocal` laisserait la DEK vivante dans un onglet
// verrouillé — l'écran mentirait sur l'état réel du coffre.
// 03 §33.7 : « AUCUNE ressaisie de mot de passe pendant une session active de
// 45 min. » Le hook connaît la règle ; c'est ICI qu'on vérifie qu'on lui donne
// bien le booléen qui la déclenche.
//
// ── NIVEAU CHOISI ───────────────────────────────────────────────────────────
// `interface` + minuteurs simulés, pour la même raison qu'au fichier voisin : le
// fait à établir est une échéance de 15 et 60 minutes. Les modules locaux sont
// des doubles — ce fichier éprouve un CÂBLAGE, pas la crypto (couverte, elle,
// par `local/coffre.test.ts` et `local/coffre-appareil.test.ts`).
//
// Sections éprouvées : 05 §9.7 · 03 §33.7 · 06 §10.5.
// Traçabilité : E33 (sécurité / RGPD : chiffrement local — la DEK cesse d'être
// atteignable au verrouillage) · E6 (hors ligne total : le déverrouillage local
// reste possible sans aucun réseau).
// =============================================================================
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FournisseurTerrain, useTerrain, type ValeurTerrain } from './contexte.js';
import { deverrouiller, initialiserCoffre } from '../local/coffre-appareil.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import type * as ModuleBase from '../local/base.js';

// `vi.hoisted` : la fabrique d'un `vi.mock` s'exécute AVANT le corps du fichier.
// Sans lui, ce double serait dans sa zone morte temporelle au premier import — et
// l'atteindre par `depotSessions.sessionEnCours` ferait rougir `unbound-method`.
const { sessionEnCoursFactice } = vi.hoisted(() => ({
  sessionEnCoursFactice: vi.fn((): Promise<boolean> => Promise.resolve(false)),
}));

const MINUTE = 60_000;
const T0 = new Date('2026-09-03T09:00:00.000Z');
const MOT_DE_PASSE_FICTIF = 'phrase-de-passe-de-test-0000';

// Doubles opaques : ce fichier ne teste ni Dexie ni la crypto, il teste le fil
// qui les relie au verrou.
const baseFactice = { nom: 'base-factice' };
const coffreFactice = { dek: 'clef-factice' };

let coffreAuRepos: unknown = { sel: 'sel-factice' };
let sessionSimulee = false;
let dernierInterrogateur: (() => unknown) | null = null;

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (interrogateur: () => unknown) => {
    dernierInterrogateur = interrogateur;
    return sessionSimulee;
  },
}));

vi.mock('../local/base.js', async (importerReel) => {
  const reel = await importerReel<typeof ModuleBase>();
  return {
    ...reel,
    ouvrirBaseLocale: vi.fn(() => Promise.resolve(baseFactice)),
    lireMeta: vi.fn(() => Promise.resolve(undefined)),
    ecrireMeta: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../local/coffre-appareil.js', () => ({
  lireCoffreAuRepos: vi.fn(() => Promise.resolve(coffreAuRepos)),
  deverrouiller: vi.fn(() => Promise.resolve(coffreFactice)),
  initialiserCoffre: vi.fn(() => Promise.resolve(coffreFactice)),
}));

vi.mock('../local/contexte.js', () => ({
  contexteLocal: vi.fn(() => ({ base: baseFactice, coffre: coffreFactice })),
  installerContexteLocal: vi.fn(),
  retirerContexteLocal: vi.fn(),
}));

vi.mock('../local/jetons.js', () => ({
  lireJetonRafraichissement: vi.fn(() => Promise.resolve(null)),
  enregistrerJetonRafraichissement: vi.fn(() => Promise.resolve()),
  effacerJetonRafraichissement: vi.fn(() => Promise.resolve()),
}));

vi.mock('../local/depots/sessions.js', () => ({
  depotSessions: { sessionEnCours: sessionEnCoursFactice },
}));

vi.mock('../local/stockage.js', () => ({
  evaluerStockage: vi.fn(() =>
    Promise.resolve({
      persistant: true,
      quotaOctets: 1,
      utiliseOctets: 0,
      ratio: 0,
      niveau: 'ok',
    }),
  ),
}));

vi.mock('./service-worker-client.js', () => ({
  declarerSourceSessionEnCours: vi.fn(),
}));

let terrain: ValeurTerrain;

function Sonde(): ReactNode {
  terrain = useTerrain();
  return <span data-testid="phase">{terrain.phase}</span>;
}

/** Vide la file des microtâches SANS toucher à l'horloge simulée. */
async function laisserRepondre(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) {
      await Promise.resolve();
    }
  });
}

async function avancer(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function phase(): string | null {
  return screen.getByTestId('phase').textContent;
}

/** Monte la coquille et pousse jusqu'à l'écran de déverrouillage. */
async function monterCoquille(): Promise<void> {
  render(
    <FournisseurTerrain>
      <Sonde />
    </FournisseurTerrain>,
  );
  await laisserRepondre();
}

/** Le geste réel de l'auditeur : il tape son mot de passe. */
async function deverrouillerLApplication(): Promise<void> {
  await act(async () => {
    await terrain.ouvrir(MOT_DE_PASSE_FICTIF);
  });
  await laisserRepondre();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  coffreAuRepos = { sel: 'sel-factice' };
  sessionSimulee = false;
  dernierInterrogateur = null;
  vi.mocked(deverrouiller).mockClear();
  vi.mocked(initialiserCoffre).mockClear();
  vi.mocked(installerContexteLocal).mockClear();
  vi.mocked(retirerContexteLocal).mockClear();
  sessionEnCoursFactice.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — le verrou ferme réellement le coffre', () => {
  it('@critique 15 min d’inactivité hors session : coffre fermé, contexte local retiré', async () => {
    await monterCoquille();
    await deverrouillerLApplication();
    expect(phase()).toBe('ouvert');
    expect(retirerContexteLocal).not.toHaveBeenCalled();

    await avancer(15 * MINUTE);

    expect(phase()).toBe('verrouille');
    // La preuve qui compte : la DEK n'est plus atteignable par aucun chemin.
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('@critique le bouton d’un geste (05 §9.7) ferme le coffre sur-le-champ', async () => {
    sessionSimulee = true;
    await monterCoquille();
    await deverrouillerLApplication();

    await act(async () => {
      terrain.verrou.verrouillerMaintenant();
      await Promise.resolve();
    });

    expect(phase()).toBe('verrouille');
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('le verrou qui tombe alors que l’app est DÉJÀ verrouillée ne casse rien', async () => {
    await monterCoquille();
    expect(phase()).toBe('verrouille');

    await avancer(60 * MINUTE);

    expect(phase()).toBe('verrouille');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — le déverrouillage repasse par la dérivation de clé', () => {
  it('@critique après un verrouillage, rouvrir REDÉRIVE la clé depuis le mot de passe', async () => {
    // 05 §9.7 : « La KEK n'est tenue qu'en mémoire de session » et « AUCUN
    // mécanisme de déverrouillage affaibli en V1 ». Le seul chemin de retour est
    // `deverrouiller(base, motDePasse)` — jamais une DEK conservée quelque part.
    await monterCoquille();
    await deverrouillerLApplication();
    expect(deverrouiller).toHaveBeenCalledTimes(1);
    expect(deverrouiller).toHaveBeenCalledWith(baseFactice, MOT_DE_PASSE_FICTIF);

    await avancer(15 * MINUTE);
    expect(phase()).toBe('verrouille');

    await deverrouillerLApplication();

    expect(phase()).toBe('ouvert');
    expect(deverrouiller).toHaveBeenCalledTimes(2);
    expect(installerContexteLocal).toHaveBeenCalledTimes(2);
  });

  it('@critique un déverrouillage relance un compte PLEIN : 15 min de plus, pas moins', async () => {
    await monterCoquille();
    await deverrouillerLApplication();
    await avancer(15 * MINUTE);
    await deverrouillerLApplication();
    expect(phase()).toBe('ouvert');

    await avancer(15 * MINUTE - 1);
    expect(phase()).toBe('ouvert');
    await avancer(1);
    expect(phase()).toBe('verrouille');
  });

  it('au tout premier usage, le mot de passe CRÉE le coffre au lieu de l’ouvrir', async () => {
    coffreAuRepos = null;
    await monterCoquille();

    await deverrouillerLApplication();

    expect(initialiserCoffre).toHaveBeenCalledTimes(1);
    expect(deverrouiller).not.toHaveBeenCalled();
    expect(phase()).toBe('ouvert');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — la session en cours porte le délai à 60 min', () => {
  it('@critique SESSION ACTIVE : 45 MIN SANS AUCUNE RESSAISIE (03 §33.7, recette P-C)', async () => {
    // Le scénario qui justifie l'existence des deux seuils, joué de bout en bout
    // dans la coquille : un entretien de trois quarts d'heure, l'auditeur ne
    // touche rien, l'interlocuteur parle. Le mot de passe n'est jamais redemandé.
    sessionSimulee = true;
    await monterCoquille();
    await deverrouillerLApplication();
    expect(terrain.verrou.delaiCourantMs).toBe(60 * MINUTE);

    await avancer(45 * MINUTE);

    expect(phase()).toBe('ouvert');
    expect(retirerContexteLocal).not.toHaveBeenCalled();
    expect(deverrouiller).toHaveBeenCalledTimes(1);
  });

  it('contrôle d’anti-vacuité : les mêmes 45 min SANS session ferment bien le coffre', async () => {
    sessionSimulee = false;
    await monterCoquille();
    await deverrouillerLApplication();
    expect(terrain.verrou.delaiCourantMs).toBe(15 * MINUTE);

    await avancer(45 * MINUTE);

    expect(phase()).toBe('verrouille');
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('la source du délai est bien l’index LOCAL des sessions, pas une constante', async () => {
    // Sans ce contrôle, les deux tests ci-dessus resteraient verts même si le
    // booléen venait d'ailleurs — et le délai de 60 min s'appliquerait à un
    // appareil sans aucune session ouverte.
    await monterCoquille();
    expect(dernierInterrogateur).not.toBeNull();

    await act(async () => {
      await dernierInterrogateur?.();
    });

    expect(sessionEnCoursFactice).toHaveBeenCalledWith(baseFactice);
  });
});
