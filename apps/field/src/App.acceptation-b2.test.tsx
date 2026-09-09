// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B2** de la recette novice n°1 (A54,
// 2026-09-06) : « je suis le conseil, et je tombe dans un cul-de-sac ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne de `App.tsx` ni de
// `navigation.ts` (09 §5.6). `@critique` : en PWA installée, sans barre
// d'adresse, un écran sans sortie enferme l'auditeur chez le client.
//
// ── CE QUE CE FICHIER ÉPROUVE, ET QUE LA RECETTE NE POUVAIT PAS VOIR ────────
// A54 a constaté le cul-de-sac par la NAVIGATION (accueil → « Nouvel entretien »).
// Le défaut vivait aussi — et surtout — sur l'autre chemin, celui qu'aucune
// session de recette ne joue parce qu'il demande de FERMER l'application : la
// REPRISE. `restaurerNavigation` rendait une pile d'UN élément quelle que soit la
// vue mémorisée. L'auditeur qui verrouille sur « Où en est la mission » et rouvre
// atterrissait donc sur cet écran avec `peutRevenir() === false` : le bouton de
// l'en-tête, même posé, n'aurait pas été rendu. Corriger la coquille sans
// corriger la reprise aurait laissé le blocage intact sur le chemin le plus
// fréquent d'une journée d'audit.
//
// Ces tests parcourent donc la chaîne ENTIÈRE, dans l'ordre réel :
//   valeur mémorisée dans `meta` → `restaurerNavigation` → action `restaurer` du
//   réducteur → `App` rendue → bouton « Revenir » → **le titre d'en-tête change**.
// Rien n'est simulé entre les deux bouts, et l'assertion finale porte sur ce que
// l'auditeur VOIT, pas sur un appel de fonction : un `naviguer` espionné dirait
// que le geste a été demandé, jamais qu'il a abouti.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total),
// E44 (UX/UI, 4 états).
// =============================================================================
import 'fake-indexeddb/auto';
import { useState, type ReactNode } from 'react';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { ValeurTerrain } from './app/contexte.js';
import {
  peutRevenir,
  reducteurNavigation,
  restaurerNavigation,
  vueCourante,
  type ActionNavigation,
  type EtatNavigation,
} from './app/navigation.js';
import { VUES, VUE_INITIALE, type CodeVue } from './app/vues.js';
import { BaseLocale } from './local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from './local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './local/contexte.js';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('./app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a27-sortie-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

function terrainSur(
  base: BaseLocale,
  navigation: EtatNavigation,
  naviguer: (action: ActionNavigation) => void,
): ValeurTerrain {
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
    navigation,
    vue: vueCourante(navigation),
    stockage: null,
    jetonSiege: 'absent',
    naviguer,
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

/**
 * La coquille montée sur le VRAI réducteur.
 *
 * `terrain` est réaffecté à chaque rendu, avant que `App` ne lise `useTerrain()` :
 * c'est ce qui rend le retour réellement effectif au lieu d'être seulement
 * demandé. Sans cela, le test dirait « le bouton appelle `naviguer` » — la même
 * chose que disait `peutRevenir()` avant B2, et qui ne suffisait pas.
 */
function CoquilleVivante({
  base,
  depart,
}: {
  readonly base: BaseLocale;
  readonly depart: EtatNavigation;
}): ReactNode {
  const [navigation, setNavigation] = useState<EtatNavigation>(depart);
  terrain = terrainSur(base, navigation, (action) => {
    setNavigation((precedent) => reducteurNavigation(precedent, action));
  });
  return <App />;
}

/** Les erreurs d'écrans profonds sans données ne sont pas l'objet du test. */
function silence(): { restaurer: () => void } {
  const espion = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return {
    restaurer: () => {
      espion.mockRestore();
    },
  };
}

beforeAll(async () => {
  kek = await deriverKek(
    'mot-de-passe-fictif-a27-navigation',
    new Uint8Array(16).fill(23),
    KDF_TEST,
  );
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

/** Les écrans PROFONDS : ceux d'où « remonter » a un sens. */
const VUES_PROFONDES: readonly CodeVue[] = [
  'nouvelEntretien',
  'pilote',
  'agenda',
  'finDeJournee',
  'finDeSession',
  'restauration',
];

// ─────────────────────────────────────────────────────────────────────────────
describe('B2 — la reprise sur une vue mémorisée PROFONDE laisse une sortie', () => {
  for (const vue of VUES_PROFONDES) {
    it(`@critique « ${vue} » mémorisée : la pile restaurée n’a PAS un seul élément`, () => {
      const restauree = restaurerNavigation(vue);
      // Le sommet ne change pas : 03 §17.4 exige de revenir EXACTEMENT où on était.
      expect(vueCourante(restauree)).toBe(vue);
      // Mais il y a désormais un dessous, et donc une sortie. C'est tout B2.
      expect(restauree.pile.length).toBeGreaterThan(1);
      expect(peutRevenir(restauree)).toBe(true);
    });
  }

  it('@critique une vue RACINE mémorisée reste seule : un « Revenir » qui ne mène nulle part serait un mensonge', () => {
    for (const racine of ['accueil', 'aujourdhui'] as const) {
      const restauree = restaurerNavigation(racine);
      expect(restauree.pile).toEqual([racine]);
      expect(peutRevenir(restauree)).toBe(false);
    }
  });

  it('@critique une valeur mémorisée illisible ne fabrique aucun écran : retour à la vue initiale', () => {
    for (const valeur of [null, undefined, '', 'ecranQuiNExistePas', 42, { vue: 'pilote' }]) {
      expect(restaurerNavigation(valeur).pile).toEqual([VUE_INITIALE]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B2 — l’auditeur qui rouvre son iPad sur un écran profond en SORT', () => {
  it('@critique de la valeur mémorisée au titre d’en-tête : « Revenir » ramène réellement à la racine', async () => {
    const base = await nouvelleBase();
    const bruit = silence();
    try {
      // ① ce que `meta.vueCourante` contenait quand l'auditeur a verrouillé.
      const depart = restaurerNavigation('pilote');
      render(<CoquilleVivante base={base} depart={depart} />);

      // ② il retrouve EXACTEMENT son écran — la reprise instantanée est intacte.
      //
      // Le PREMIER titre de niveau 1 est celui de l'en-tête de coquille : il est
      // rendu avant le contenu. Il y en a DEUX sur la page, l'écran portant le
      // sien — c'est le bégaiement visuel relevé par A54 (majeur M8), constaté
      // ici et remonté, non corrigé (09 §5.6).
      await screen.findByRole('button', { name: 'Verrouiller' });
      const titreEntete = (): string | null =>
        screen.getAllByRole('heading', { level: 1 })[0]?.textContent ?? null;
      expect(titreEntete()).toBe(VUES.pilote.titre);

      // ③ et cette fois, il y a une sortie, écrite en toutes lettres.
      const retour = screen.getByRole('button', { name: 'Revenir' });
      fireEvent.click(retour);

      // ④ le geste ABOUTIT : le titre change, la sortie disparaît sur la racine.
      await waitFor(() => {
        expect(titreEntete()).toBe(VUES[VUE_INITIALE].titre);
      });
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull();
    } finally {
      bruit.restaurer();
    }
  });

  it('@critique l’écran EXACT du blocage — « Nouvel entretien » — n’offre plus « Verrouiller » pour seule issue', async () => {
    const base = await nouvelleBase();
    const bruit = silence();
    try {
      render(<CoquilleVivante base={base} depart={restaurerNavigation('nouvelEntretien')} />);
      await screen.findByRole('button', { name: 'Verrouiller' });

      const libelles = screen.getAllByRole('button').map((b) => b.textContent);
      // Anti-vacuité : l'écran EST bien rendu, avec le bouton qu'A54 a relevé.
      expect(libelles).toContain('Verrouiller');
      expect(libelles).toContain('Revenir');
      expect(libelles.filter((libelle) => libelle === 'Verrouiller')).toHaveLength(1);
    } finally {
      bruit.restaurer();
    }
  });

  it('@critique sur une racine, aucune sortie n’est proposée — et « Verrouiller » reste', async () => {
    const base = await nouvelleBase();
    const bruit = silence();
    try {
      render(<CoquilleVivante base={base} depart={restaurerNavigation('accueil')} />);
      await screen.findByRole('button', { name: 'Verrouiller' });
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull();
    } finally {
      bruit.restaurer();
    }
  });
});
