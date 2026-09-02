// =============================================================================
// L7a — THÈME 4 : l'avancement d'une mission, rendu DEPUIS LE SCHÉMA DE MISSION
// (`missionResponseSchema`, packages/shared). Tests écrits AVANT le code par A36.
//
// Ce que le 03 §18.4 / §22.3 nomme sur une carte et sur l'écran mission, et que
// le schéma de L3 sait porter : le CLIENT (via `companyId` → `GET /v1/companies/
// :id`), le NIVEAU d'audit, le STATUT (§32.2), l'échéance (`endPlanned`), la
// période, le NDA, la date de livraison. Ce que le schéma ne porte PAS — jauge de
// couverture, avance/retard, auditeurs, dernière sync — attend la route de
// couverture §27.1 (incrément suivant) et n'est pas exigé ici.
//
// Deux invariants y sont jugés :
//   · invariant 5, FRANÇAIS : le statut vient de `LIBELLES_STATUT_MISSION`, jamais
//     du code brut `en_cours` ; idem niveau d'audit, offre, périmètre ;
//   · invariant 5, FUSEAU : un TIMESTAMPTZ s'affiche au fuseau DE LA MISSION, une
//     date civile (`DATE`) ne se convertit JAMAIS. La fixture `MISSION_OUEST`
//     (America/Los_Angeles) fait basculer la date dans les deux cas fautifs.
// Traçabilité : E22 (console de pilotage), E39 (machine à états mission — libellés), E43
// (exécutabilité autopilote — conventions d'API).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { LIBELLES_STATUT_MISSION, STATUTS_MISSION } from '@axion/shared';
import { codesBrutsVisibles, texteVisibleDEmblee } from './tests-aide/balayage-dom.js';
import {
  ENTREPRISE_GC,
  ENTREPRISE_OUEST,
  ENTREPRISE_TPE,
  ID,
  MISSION_GC,
  MISSION_OUEST,
  MISSION_TPE,
} from './tests-aide/fixtures-console.js';
import { elementsMission, rendreConsole, ROUTES_CONSOLE } from './tests-aide/rendu-console.js';
import { installerServeurFactice, type ServeurFactice } from './tests-aide/serveur-factice.js';

let serveur: ServeurFactice;

beforeEach(() => {
  serveur = installerServeurFactice({ missions: [MISSION_TPE, MISSION_GC, MISSION_OUEST] });
});

afterEach(() => {
  serveur.restaurer();
});

async function ecranMission(id: string, titre: string): Promise<HTMLElement> {
  rendreConsole(ROUTES_CONSOLE.mission(id));
  await screen.findByRole('heading', { level: 1, name: titre });
  return screen.getByRole('main');
}

describe('§18.4 — l’écran mission montre ce que le schéma de mission porte', () => {
  it('le CLIENT est nommé (résolu par `GET /v1/companies/:id`), pas son identifiant', async () => {
    const principal = await ecranMission(ID.missionTpe, MISSION_TPE.title);
    await screen.findByText(new RegExp(ENTREPRISE_TPE.name));
    expect(texteVisibleDEmblee(principal)).not.toContain(ID.entrepriseTpe);
    expect(
      serveur.appels.some((appel) =>
        appel.url.pathname.endsWith(`/v1/companies/${ID.entrepriseTpe}`),
      ),
    ).toBe(true);
  });

  it('le STATUT est le libellé français de `LIBELLES_STATUT_MISSION`, jamais le code', async () => {
    const principal = await ecranMission(ID.missionTpe, MISSION_TPE.title);
    const texte = texteVisibleDEmblee(principal);
    expect(texte.toLowerCase()).toContain(
      LIBELLES_STATUT_MISSION[MISSION_TPE.status].toLowerCase(),
    );
    for (const statut of STATUTS_MISSION) {
      expect(texte).not.toMatch(new RegExp(`(?<![\\w-])${statut}(?![\\w-])`));
    }
  });

  it('chaque statut du contrat a un libellé rendu — les cinq, pas seulement celui de la fixture', async () => {
    // FIL-TPE : collecte en cours · FIL-GC : préparation · Ouest : livrée. Les deux
    // restants (analyse, clôturée) sont couverts par le type `Record<StatutMission,
    // string>` de `packages/shared` : un sixième statut ne compilerait pas.
    const attendus = [MISSION_TPE, MISSION_GC, MISSION_OUEST].map(
      (mission) => LIBELLES_STATUT_MISSION[mission.status],
    );
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_OUEST.title);
    const principal = screen.getByRole('main');
    const texte = texteVisibleDEmblee(principal).toLowerCase();
    for (const libelle of attendus) expect(texte).toContain(libelle.toLowerCase());
  });

  it('le NIVEAU d’audit et le PÉRIMÈTRE sont en français — aucun code brut du contrat visible', async () => {
    const principal = await ecranMission(ID.missionGc, MISSION_GC.title);
    await screen.findByText(new RegExp(ENTREPRISE_GC.name));
    const texte = texteVisibleDEmblee(principal);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    // `strategique_groupe` → un libellé qui contient « stratégique » ; `multi_pays`
    // → « multi-pays » ou « plusieurs pays » ou « international ».
    expect(texte).toMatch(/stratégique/i);
    expect(texte).toMatch(/multi[- ]pays|plusieurs pays|international/i);
  });

  it('la période prévue et le NDA sont rendus depuis `startPlanned`/`endPlanned`/`ndaRef`', async () => {
    const principal = await ecranMission(ID.missionGc, MISSION_GC.title);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toContain(MISSION_GC.ndaRef ?? '');
    // 2026-09-14 → « 14 sept. 2026 » ou « 14 septembre 2026 » ou « 14/09/2026 ».
    expect(texte).toMatch(/14(?:\/09\/| sept(?:\.|embre) )2026/);
    expect(texte).toMatch(/15(?:\/10\/| oct(?:\.|obre) )2026/);
  });
});

describe('invariant 5 — dates au fuseau DE LA MISSION, dates civiles jamais converties', () => {
  it('@critique un TIMESTAMPTZ (livrée le) s’affiche au fuseau de la mission, pas à celui de la machine', async () => {
    // `deliveredAt` = 2026-09-02T03:30Z. Au fuseau de mission (America/Los_Angeles,
    // UTC−7) : 1er septembre, 20 h 30. Au fuseau de la machine de test (Europe/
    // Paris) : 2 septembre, 05 h 30. En UTC brut : 2 septembre, 03 h 30.
    // Attrape : `toLocaleString()` sans `timeZone`, `date-fns/format` sans fuseau,
    // et l'affichage de l'ISO tel quel.
    const principal = await ecranMission(ID.missionOuest, MISSION_OUEST.title);
    await screen.findByText(/livrée le/i);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/(?<!\d)1(?:er)?(?:\/09\/| sept(?:\.|embre) )2026/);
    expect(texte).toMatch(/20[:h ]?30/);
    expect(texte).not.toMatch(/05[:h ]?30|03[:h ]?30/);
    expect(texte).not.toContain('T03:30');
  });

  it('@critique une date CIVILE (NDA signé le 2026-08-03) reste le 3 août, quel que soit le fuseau', async () => {
    // Attrape : `new Date('2026-08-03')` (minuit UTC) formaté au fuseau de mission
    // UTC−7 → « 2 août ». Une `DATE` du 04 n'a pas d'heure ; elle se rend telle quelle.
    const principal = await ecranMission(ID.missionOuest, MISSION_OUEST.title);
    await screen.findByText(/livrée le/i);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/(?<!\d)3(?:\/08\/| août )2026/);
    expect(texte).not.toMatch(/(?<!\d)2(?:\/08\/| août )2026/);
  });

  it('le fuseau de la mission est LISIBLE sur l’écran (l’auditeur sait à quelle heure il lit)', async () => {
    const principal = await ecranMission(ID.missionOuest, MISSION_OUEST.title);
    await screen.findByText(new RegExp(ENTREPRISE_OUEST.name));
    expect(texteVisibleDEmblee(principal)).toMatch(
      /Los_Angeles|Los Angeles|UTC[−-]0?7|heure de la mission/i,
    );
  });
});

describe('§22.3 espace 1 — la tour de contrôle rend les cartes et les chiffres clés', () => {
  it('une carte par mission avec client, statut français et niveau', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    await screen.findByText(new RegExp(ENTREPRISE_TPE.name));
    const cartes = elementsMission(principal);
    expect(cartes.length).toBe(3);
    const carteTpe = cartes.find((carte) => carte.textContent.includes(MISSION_TPE.title));
    expect(carteTpe).toBeDefined();
    if (carteTpe === undefined) return;
    const texte = texteVisibleDEmblee(carteTpe).toLowerCase();
    expect(texte).toContain(ENTREPRISE_TPE.name.toLowerCase());
    expect(texte).toContain(LIBELLES_STATUT_MISSION.en_cours);
    expect(codesBrutsVisibles(texte)).toEqual([]);
  });

  it('« missions actives » compte les missions NON clôturées — ici 3 sur 3', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/3\s+missions?\s+actives?/i);
  });

  it('les chiffres clés sont en chiffres TABULAIRES (classe `axn-chiffres` du design system)', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    expect(principal.querySelector('.axn-chiffres')).not.toBeNull();
  });
});
