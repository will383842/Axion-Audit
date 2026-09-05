// =============================================================================
// TESTS DE L'ÉCRAN D'EXPORT — écrits AVANT l'écran. Lot L7, incrément L7c.
//
// ⚠ Tests d'A30 (CONCEPTION, TDD). Aucun `@critique` : l'acceptation par rôle,
// les quatre états et axe-core reviennent à A36 (09 §5.6, décision du 2026-09-05).
//
// CE QU'ILS TIENNENT — les trois décisions de l'écran, et rien de cosmétique :
//   1. l'archive est DÉCRITE avant d'être téléchargée. Le critère du §36.3 est
//      « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP » ; onze
//      fichiers sans mode d'emploi renvoient dans l'outil ;
//   2. la porte du nom des répondants est FERMÉE par défaut, et ne s'ouvre qu'en
//      ajoutant `repondants=true` À LA REQUÊTE — pas en dévoilant une colonne
//      déjà reçue (invariant 3 : aucun contrôle uniquement côté client) ;
//   3. un échec de téléchargement se dit EN FRANÇAIS, sans exposer d'objet brut.
//
// Ce fichier n'utilise pas le serveur factice d'A36 : il remplace `fetch` lui-même,
// parce qu'un téléchargement rend un BINAIRE et qu'aucun schéma Zod ne le décrit.
//
// Traçabilité : E22 (console de pilotage) · E32 (interface française) · E36.
// =============================================================================
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, FICHIERS_EXPORT } from '../../api/contrats.js';
import { creerClientApi } from '../../api/client.js';
import { FournisseurClientApi } from '../../api/requetes.js';
import { MISSION_TPE } from '../../tests-aide/fixtures-console.js';
import { EcranExport } from './EcranExport.js';

/** Les URL appelées, dans l'ordre — la trace réseau, qui seule fait foi. */
let appels: string[] = [];

/** Ce que le prochain `GET …/export` rendra. */
let reponseExport: Response = new Response();

/** La sonde de révocation, gardée à part : on l'observe sans la détacher d'`URL`. */
let revoquerUrl = vi.fn();

function fetchFactice(entree: RequestInfo | URL): Promise<Response> {
  // `RequestInfo` couvre `Request`, dont la stringification n'a rien d'utile :
  // on lit son `url`. Le client de la console n'envoie que des chaînes, mais un
  // test ne présume pas de ce qu'il observe.
  const url =
    typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
  appels.push(url);

  if (url.includes('/export')) return Promise.resolve(reponseExport.clone());

  if (url.includes(`/missions/${MISSION_TPE.id}`)) {
    return Promise.resolve(
      new Response(JSON.stringify(MISSION_TPE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  return Promise.resolve(new Response(null, { status: 404 }));
}

function archiveFactice(): Response {
  return new Response(new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="export_mission_${MISSION_TPE.id}_20260905.zip"`,
    },
  });
}

function rendre() {
  const client = creerClientApi({ fetch: fetchFactice });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FournisseurClientApi value={client}>
        <EcranExport id={MISSION_TPE.id} />
      </FournisseurClientApi>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  appels = [];
  reponseExport = archiveFactice();
  // jsdom ne fournit ni `createObjectURL` ni `revokeObjectURL` : ce sont des API
  // de navigateur. On les remplace pour observer que la seconde est TOUJOURS
  // appelée — une URL d'objet non révoquée retient le ZIP entier en mémoire.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:factice'),
  });
  revoquerUrl = vi.fn();
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoquerUrl });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EcranExport — l’archive est décrite avant d’être téléchargée (§36.3)', () => {
  it('nomme les dix fichiers de l’archive', async () => {
    rendre();
    await screen.findByText(FICHIERS_EXPORT.reponses);

    for (const nom of [
      FICHIERS_EXPORT.reponses,
      FICHIERS_EXPORT.mission,
      FICHIERS_EXPORT.arbre,
      FICHIERS_EXPORT.sessions,
      FICHIERS_EXPORT.constats,
      FICHIERS_EXPORT.casUsage,
      FICHIERS_EXPORT.inventaireOutils,
      FICHIERS_EXPORT.registreIa,
      FICHIERS_EXPORT.unitesHorsPerimetre,
      FICHIERS_EXPORT.manifestePiecesJointes,
    ]) {
      expect(screen.getAllByText(nom).length, `${nom} doit être nommé à l’écran`).toBeGreaterThan(
        0,
      );
    }
  });

  it('dit ce que l’archive NE contient PAS, et pourquoi', async () => {
    rendre();
    await screen.findByText(FICHIERS_EXPORT.scores);
    expect(screen.getByRole('heading', { name: /ne contient pas/i })).toBeTruthy();
    expect(document.body.textContent).toMatch(/scoring/i);
    expect(document.body.textContent).toMatch(/pièces jointes|fichiers joints/i);
  });

  it('n’offre AUCUNE case « inclure les fichiers joints » — une option inerte est un mensonge', async () => {
    rendre();
    // On attend le CONTENU, pas le titre : le titre vit HORS de la zone d'état et
    // apparaît pendant que le squelette de chargement est encore à l'écran.
    await screen.findByRole('checkbox');
    const cases = screen.getAllByRole('checkbox');
    expect(cases).toHaveLength(1);
  });

  it('annonce le fuseau des horodatages : un rapport se rédige avec ces heures-là', async () => {
    rendre();
    await screen.findByRole('heading', { name: /export de mission/i });
    expect(document.body.textContent).toMatch(/heure de la mission/i);
  });
});

describe('EcranExport — la porte du nom des répondants', () => {
  it('est FERMÉE par défaut : la requête ne porte pas le paramètre', async () => {
    rendre();
    fireEvent.click(await screen.findByRole('button', { name: /télécharger/i }));

    await waitFor(() => {
      expect(appels.some((url) => url.includes('/export'))).toBe(true);
    });
    const appel = appels.find((url) => url.includes('/export')) ?? '';
    expect(appel, 'sans la case cochée, `repondants` ne doit pas être envoyé').not.toContain(
      'repondants',
    );
  });

  it('s’ouvre par une ACTION, et alors seulement : `repondants=true`', async () => {
    rendre();
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /télécharger/i }));

    await waitFor(() => {
      expect(appels.some((url) => url.includes('repondants=true'))).toBe(true);
    });
  });

  it('dit dans son libellé que la condition est le CONSENTEMENT, pas la case', async () => {
    rendre();
    const boite = await screen.findByRole('checkbox');
    const etiquette = boite.closest('label');
    expect(etiquette?.textContent ?? '').toMatch(/consentement/i);
  });
});

describe('EcranExport — le téléchargement et ses retours', () => {
  it('enregistre le fichier sous le nom donné par le SERVEUR, et révoque l’URL d’objet', async () => {
    rendre();
    fireEvent.click(await screen.findByRole('button', { name: /télécharger/i }));

    await screen.findByText(new RegExp(`export_mission_${MISSION_TPE.id}_20260905\\.zip`));
    expect(revoquerUrl).toHaveBeenCalled();
  });

  it('rend un message FRANÇAIS quand le serveur refuse — jamais un objet brut', async () => {
    reponseExport = new Response(
      JSON.stringify({
        error: { code: ERROR_CODES.NOT_FOUND, message: "Cette mission n'existe pas." },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
    rendre();
    fireEvent.click(await screen.findByRole('button', { name: /télécharger/i }));

    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByText(/n’existe pas|n'existe pas/i)).toBeTruthy();
    expect(alerte.textContent).not.toMatch(/\[object|undefined|Error:/);
  });
});
