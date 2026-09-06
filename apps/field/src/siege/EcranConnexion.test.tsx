// =============================================================================
// TESTS DE CONCEPTION A23 — l'écran « Rattacher cet appareil ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// CONCEPTION, écrits par A23 en même temps que l'écran. Ce ne sont PAS les
// tests d'acceptation du bloquant : ceux-là reviennent à un agent qui n'a pas
// écrit ce code (09 §5.6), et c'est à eux de porter `@critique`.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
// ① LES QUATRE ÉTATS (03 §33.2) : chargement (squelettes), erreur (cause +
//    action), hors ligne (rappel des capacités locales), nominal — et le
//    cinquième cas de cet écran, « déjà rattaché », qui retire le formulaire ;
// ② la leçon **B1** : champ vide ⇒ l'écran dit CE QUI EST ATTENDU et n'appelle
//    NI le réseau, NI le coffre. Aucun diagnostic sur une erreur qui n'a pas eu
//    lieu ;
// ③ le bouton reste ACTIF, toujours : un bouton grisé muet est le « cadenas
//    muet » que 03 §19.1 interdit ;
// ④ le chemin nominal ferme réellement le bloquant : après connexion,
//    `lireIdentiteAuditeur` rend une identité — c'est-à-dire qu'un entretien
//    peut naître.
//
// Traçabilité : E23 (novice < 30 min), E33 (sécurité / RGPD), E44 (4 états).
// =============================================================================
import 'fake-indexeddb/auto';
import { act, configure, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { FournisseurTerrain, useTerrain, type ValeurTerrain } from '../app/contexte.js';
import { NOM_BASE_LOCALE } from '../local/base.js';
import { contexteLocal } from '../local/contexte.js';
import { lireIdentiteAuditeur, memoriserIdentiteAuditeur } from '../session/auditeur.js';
import { EcranConnexion } from './EcranConnexion.js';

// Chaque attente de cet écran passe par une lecture Dexie DÉCHIFFRÉE. Sous
// charge (plusieurs chantiers en parallèle sur la machine), la seconde par
// défaut de Testing Library ne suffit pas — et un test qui rougit par contention
// ne prouve rien, il coûte une relance et use la confiance dans la suite.
configure({ asyncUtilTimeout: 10_000 });

const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const AUDITEUR_ID = '01922f4e-0000-7000-8000-00000000a23a';

let terrain: ValeurTerrain | null = null;

function Sonde(): ReactNode {
  const valeur = useTerrain();
  useEffect(() => {
    terrain = valeur;
  }, [valeur]);
  return null;
}

function requis<T>(valeur: T | null | undefined, quoi: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`${quoi} manquant`);
  return valeur;
}

/** Monte la coquille, ouvre le coffre, puis pose l'écran. Argon2id est lent : 20 s. */
async function monter(): Promise<RenderResult> {
  terrain = null;
  const rendu = render(
    <FournisseurTerrain>
      <Sonde />
    </FournisseurTerrain>,
  );
  await waitFor(
    () => {
      expect(terrain?.phase).toBe('verrouille');
    },
    { timeout: 15_000 },
  );
  await act(async () => {
    await requis(terrain, 'coquille').ouvrir(MOT_DE_PASSE);
  });
  await waitFor(() => {
    expect(terrain?.phase).toBe('ouvert');
  });
  rendu.rerender(
    <FournisseurTerrain>
      <Sonde />
      <EcranConnexion />
    </FournisseurTerrain>,
  );
  return rendu;
}

function champ(nom: RegExp): HTMLElement {
  return screen.getByLabelText(nom);
}

function bouton(): HTMLElement {
  return screen.getByRole('button', { name: /rattacher/i });
}

function sessionServeur(): Record<string, unknown> {
  return {
    accessToken: 'acces-factice',
    refreshToken: 'rafraichissement-factice',
    tokenType: 'Bearer',
    accessExpiresAt: '2026-09-06T09:15:00.000Z',
    refreshExpiresAt: '2026-10-06T09:00:00.000Z',
    userId: AUDITEUR_ID,
  };
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

async function remplirEtSoumettre(courriel: string, motDePasse: string): Promise<void> {
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.change(champ(/adresse/i), { target: { value: courriel } });
  fireEvent.change(champ(/mot de passe/i), { target: { value: motDePasse } });
  await act(async () => {
    fireEvent.click(bouton());
    await Promise.resolve();
  });
}

beforeEach(async () => {
  // Chaque test part d'un appareil NEUF : `fake-indexeddb` survit d'un test à
  // l'autre, et une identité rangée par le test précédent ferait passer un
  // appareil vierge pour un appareil déjà rattaché.
  await Dexie.delete(NOM_BASE_LOCALE);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(reponse(sessionServeur()))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EcranConnexion — le chemin de production de l’identité d’auditeur', () => {
  it('appareil non rattaché : le formulaire est là, le bouton est ACTIF, et le titre ne diagnostique rien', async () => {
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    expect(champ(/mot de passe/i)).toBeTruthy();
    expect(bouton().hasAttribute('disabled')).toBe(false);
    expect(document.body.textContent).not.toMatch(/incorrect/i);
  }, 30_000);

  it('B1 — champ vide : l’écran dit ce qui est attendu, et n’appelle NI le réseau NI le coffre', async () => {
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    const { fireEvent } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.click(bouton());
      await Promise.resolve();
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/adresse/i);
    expect(document.body.textContent).not.toMatch(/incorrect/i);
    const { base, coffre } = contexteLocal();
    expect(await lireIdentiteAuditeur(base, coffre)).toBeNull();
  }, 30_000);

  it('chemin nominal : après le rattachement, une identité EXISTE — un entretien peut naître', async () => {
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    await remplirEtSoumettre('auditeur@exemple.fr', 'un-mot-de-passe-assez-long');

    const { base, coffre } = contexteLocal();
    await waitFor(async () => {
      expect(await lireIdentiteAuditeur(base, coffre)).toEqual({
        id: AUDITEUR_ID,
        profil: 'guide_strict',
      });
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/rattaché/i);
    });
  }, 30_000);

  it('refus du siège : cause ET action affichées, formulaire toujours vivant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          reponse(
            {
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Adresse ou mot de passe incorrect.',
              },
            },
            401,
          ),
        ),
      ),
    );
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    await remplirEtSoumettre('auditeur@exemple.fr', 'un-mot-de-passe-assez-long');

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Adresse ou mot de passe incorrect/);
    });
    expect(document.body.textContent).toMatch(/Vérifiez l’adresse/);
    expect(bouton()).toBeTruthy();
  }, 30_000);

  it('siège injoignable : l’écran dit quoi faire, et rien n’est écrit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    await remplirEtSoumettre('auditeur@exemple.fr', 'un-mot-de-passe-assez-long');

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/n’a pas répondu/);
    });
    const { base, coffre } = contexteLocal();
    expect(await lireIdentiteAuditeur(base, coffre)).toBeNull();
  }, 30_000);

  it('quatrième état — hors ligne : l’écran le dit, énumère ce qui reste possible, et ne grise RIEN', async () => {
    await monter();
    await waitFor(() => {
      expect(champ(/adresse/i)).toBeTruthy();
    });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/hors ligne/i);
    });
    expect(document.body.textContent).toMatch(/restaurer une sauvegarde/i);
    // Le bouton reste ACTIF : c'est la tentative réelle qui tranche, jamais
    // `navigator.onLine` (leçon B6 — un garde-fou ne prédit pas le réseau).
    expect(bouton().hasAttribute('disabled')).toBe(false);
  }, 30_000);

  it('appareil DÉJÀ rattaché : plus de formulaire, et l’écran le dit', async () => {
    const rendu = await monter();
    const { base, coffre } = contexteLocal();
    await act(async () => {
      await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'expert' });
    });
    rendu.rerender(
      <FournisseurTerrain>
        <Sonde />
        <EcranConnexion />
      </FournisseurTerrain>,
    );
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/rattaché/i);
    });
    expect(screen.queryByLabelText(/mot de passe/i)).toBeNull();
  }, 30_000);
});
