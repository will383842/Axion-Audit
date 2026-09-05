// =============================================================================
// L7b — ÉCRAN COUVERTURE, par rôle et pixel par pixel (DOM + trace réseau).
// Tests d'ACCEPTATION écrits par A36 (09 §5.6 : A32 a écrit l'écran, pas ce
// fichier). Sous jsdom, contre le serveur factice de `tests-aide/`.
//
// Ce que chaque cas attrape (implémentation plausible mais fausse) :
//   · un tableau qui ne rend une colonne de source QUE si elle a des sessions —
//     un type absent laisserait croire qu'il n'est pas exigé (§27.1 : les CINQ,
//     toujours) ;
//   · un atelier rendu DANS la grille, comme sixième source — ou disparu ;
//   · des marges rendues dans le `<tbody>`, donc mêlées aux lignes paginées ;
//   · une alerte §16.6 portée par la couleur SEULE — un daltonien ne la voit pas,
//     un lecteur d'écran ne la lit pas (§33.6) ;
//   · un rouge d'alerte emprunté au terracotta d'ACTION (invariant 4 : « l'alerte
//     est un rouge distinct ») ;
//   · un état vide qui constate le rien sans dire quoi faire (§17.6) ;
//   · une différence de rendu entre consultant membre et administrateur que le
//     RBAC ne prescrit pas — ou, à l'inverse, une donnée servie à un non-membre.
//
// ── CE QUE L'ON SAIT DU RBAC RÉEL, ET QUE LE FACTICE REPRODUIT ───────────────
// `GET /v1/missions/:id/coverage` est `type: 'mission'` (routes/pilotage.ts,
// prouvé par `apps/api/tests/l7b-pilotage.integration.test.ts`) : membre → 200,
// non-membre → 404, administrateur → 200. `GET /v1/missions/:id` reste ADMIN SEUL.
// Un consultant membre voit donc la couverture SANS la fiche mission. Ce fichier
// PROUVE ce que cela rend — il ne juge pas si le §34.1 l'admet (voir le rapport).
//
// Traçabilité : E25, E22, E45 (matrice console rôle × espace), E27/E44 (tokens), E32 (français,
// fuseaux), E21 (aucun montant).
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAMPS_FINANCIERS_SURVEILLES,
  ERROR_CODES,
  LIBELLES_SOURCE_COLLECTE,
  SOURCES_COLLECTE,
  TABLE_FINANCIERE,
} from '@axion/shared';
import {
  balayerStylesEnDur,
  chercherDansLeHtml,
  codesBrutsVisibles,
  jetonsInconnus,
  texteVisibleDEmblee,
} from '../../tests-aide/balayage-dom.js';
import { ID } from '../../tests-aide/fixtures-console.js';
import {
  COUVERTURE_AVEC_HORS_PERIMETRE,
  COUVERTURE_GC,
  COUVERTURE_TOUT_EN_ENTRETIENS,
  COUVERTURE_TOUT_SUR_UNE_UNITE,
  COUVERTURE_TPE,
  COUVERTURE_VIDE,
} from '../../tests-aide/fixtures-pilotage.js';
import { rendreConsole } from '../../tests-aide/rendu-console.js';
import {
  installerServeurFactice,
  type ScenarioServeur,
  type ServeurFactice,
} from '../../tests-aide/serveur-factice.js';

let serveur: ServeurFactice | undefined;

afterEach(() => {
  serveur?.restaurer();
  serveur = undefined;
});

const CHEMIN = (id: string): string => `/hq/missions/${id}/couverture`;
const TITRE = /couverture de la mission/i;

const NOMS_FINANCIERS_INTERDITS: readonly string[] = [
  ...CHAMPS_FINANCIERS_SURVEILLES,
  ...TABLE_FINANCIERE,
];
const VALEURS_SENTINELLES: readonly string[] = [
  '987654.21',
  '13579.02',
  'sentinelle_tjm',
  '1234.56',
];
const VOCABULAIRE_FINANCIER = /€|\bTJM\b|\bdevis\b|\bmontant|\btarif|\bfacture|\bprix\b|\bcoût/i;
const TRACE_TECHNIQUE =
  /\bat\s+\w+\s*\(|node_modules|\.tsx?:\d+|TypeError|Failed to fetch|\{"error"/;

/** Rend l'écran de couverture de FIL-TPE avec une couverture donnée, et attend le tableau. */
async function rendreCouverture(
  scenario: ScenarioServeur & {
    readonly couverture?: Parameters<typeof installerServeurFactice>[0];
  },
): Promise<HTMLElement> {
  serveur = installerServeurFactice(scenario);
  rendreConsole(CHEMIN(ID.missionTpe));
  await screen.findByRole('heading', { level: 1, name: TITRE });
  return screen.getByRole('main');
}

function tableau(principal: HTMLElement): HTMLTableElement {
  const table = principal.querySelector('table.axn-couverture');
  if (!(table instanceof HTMLTableElement)) throw new Error('tableau de couverture absent');
  return table;
}

function enTetes(table: HTMLTableElement): readonly string[] {
  return [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
}

/** La CSS de la console, lue dans le fichier — jamais recopiée. */
function cssConsole(): string {
  return readFileSync(resolve(import.meta.dirname, '../../app/coquille.css'), 'utf8');
}

// =============================================================================
// 1. LES CINQ SOURCES, TOUJOURS — l'atelier hors grille — les marges en pied
// =============================================================================
describe('§27.1 — les CINQ sources de collecte sont des colonnes, toujours, même à zéro', () => {
  it('FIL-TPE (1 entretien, tout le reste à zéro) : cinq en-têtes de source, dans l’ordre du texte, et AUCUNE colonne atelier', async () => {
    const principal = await rendreCouverture({});
    await within(principal).findByText('Établissement unique');
    const table = tableau(principal);
    const libelles = SOURCES_COLLECTE.map((kind) => LIBELLES_SOURCE_COLLECTE[kind]);
    const tetes = enTetes(table);
    // Les cinq, contigus et dans l'ordre du §27.1 — pas « celles qui ont des sessions ».
    const debut = tetes.indexOf(libelles[0] ?? '');
    expect(debut).toBeGreaterThan(0);
    expect(tetes.slice(debut, debut + 5)).toEqual(libelles);
    // Une cellule à ZÉRO est rendue, lisible : « 0 réalisé sur 0 prévu ».
    const ligne = within(table).getByRole('row', { name: /Établissement unique/ });
    const cellules = ligne.querySelectorAll('td.axn-couverture__cellule');
    expect(cellules).toHaveLength(5);
    expect(texteVisibleDEmblee(cellules[1] ?? ligne)).toMatch(/0 réalisé sur 0 prévu/);
    // Aucune colonne « Atelier » quand la mission n'en compte aucun (§9.3 de la note).
    expect(tetes.some((t) => /atelier/i.test(t))).toBe(false);
    expect(table.querySelectorAll('.axn-couverture__hors-grille')).toHaveLength(0);
  });

  it('« tout en entretiens » : l’atelier tenu est rendu HORS grille, détaché, réalisé seul — et ne compte pas comme source couverte', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_EN_ENTRETIENS },
    });
    await within(principal).findByText('Unité 1');
    const table = tableau(principal);
    const tetes = enTetes(table);
    const indexAtelier = tetes.findIndex((t) => /atelier/i.test(t));
    expect(indexAtelier).toBeGreaterThan(0);
    // APRÈS les cinq sources, jamais parmi elles.
    const indexDerniereSource = tetes.indexOf(LIBELLES_SOURCE_COLLECTE.releve_donnees);
    expect(indexAtelier).toBeGreaterThan(indexDerniereSource);
    expect(tetes[indexAtelier]).toMatch(/hors grille/i);
    // La colonne est visuellement détachée : classe dédiée, bordure par jeton.
    const enTeteAtelier = table.querySelectorAll('thead th')[indexAtelier];
    expect(enTeteAtelier?.classList.contains('axn-couverture__hors-grille')).toBe(true);
    expect(cssConsole()).toMatch(/\.axn-couverture__hors-grille\s*\{[^}]*border-left:[^}]*var\(--/);
    // Ligne 1 : « 1 » atelier ; ligne 2 : « — » (aucun) — jamais un « 0 / 0 prévu ».
    const ligne1 = within(table).getByRole('row', { name: /^Unité 1\b/ });
    const ligne2 = within(table).getByRole('row', { name: /^Unité 2\b/ });
    expect(ligne1.querySelector('td.axn-couverture__hors-grille')?.textContent).toBe('1');
    expect(ligne2.querySelector('td.axn-couverture__hors-grille')?.textContent).toBe('—');
    expect(ligne1.querySelector('td.axn-couverture__hors-grille')?.textContent).not.toMatch(
      /prévu/,
    );
    // Sources couvertes : 1 / 4 sur CHAQUE unité, atelier ou pas — il ne comble rien.
    expect(texteVisibleDEmblee(ligne1)).toMatch(/\b1 \/ 4\b/);
    expect(texteVisibleDEmblee(ligne2)).toMatch(/\b1 \/ 4\b/);
  });

  it('les MARGES vivent dans un <tfoot>, jamais parmi les lignes, et disent la mission entière', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_EN_ENTRETIENS },
    });
    await within(principal).findByText('Unité 10');
    const table = tableau(principal);
    const pied = table.querySelector('tfoot');
    expect(pied).not.toBeNull();
    const marges = pied?.querySelector('tr.axn-couverture__marges');
    expect(marges).not.toBeNull();
    expect(
      within(marges instanceof HTMLElement ? marges : table).getByText(/total de la mission/i),
    ).toBeDefined();
    // 10 unités au périmètre, 60 entretiens sur 60 prévus, 0 observation sur 10.
    const texte = texteVisibleDEmblee(marges ?? table);
    expect(texte).toMatch(/10 au périmètre/);
    expect(texte).toMatch(/60 réalisé sur 60–100 prévu/);
    expect(texte).toMatch(/0 réalisé sur 10 prévu/);
    expect(texte).toMatch(/toutes touchées/);
    // Le corps ne porte QUE les unités : dix lignes, pas onze.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(table.querySelector('tbody tr.axn-couverture__marges')).toBeNull();
  });

  it('mission SANS aucun atelier : la marge affiche le décompte à ZÉRO, elle ne se tait pas (LOT_L7.md §9.3 et §9.5-b)', async () => {
    // « il n'est JAMAIS silencieux — la marge de mission porte TOUJOURS le
    // décompte des ateliers, y compris à zéro ; seule la colonne du tableau se
    // replie ». Le contrat le porte (`marges.atelierRealise: 0`) ; l'écran doit le
    // rendre quelque part de lisible — pas forcément dans une colonne.
    const principal = await rendreCouverture({});
    await within(principal).findByText('Établissement unique');
    const texte = texteVisibleDEmblee(principal);
    expect(
      texte,
      'Aucune mention de l’atelier (à zéro) dans l’écran : la marge se tait, ce que la\n' +
        'note de conception §9.3 interdit — « une session invisible est une session perdue ».',
    ).toMatch(/atelier/i);
    expect(texte).toMatch(/atelier[^.]{0,40}\b0\b|\b0\b[^.]{0,20}atelier/i);
  });
});

// =============================================================================
// 2. L'ALERTE §16.6 — un rouge DISTINCT, par jeton, et TOUJOURS doublée d'un texte
// =============================================================================
describe('§16.6 — l’alerte sur une unité du périmètre sans aucune session', () => {
  it('« tout sur une unité » : neuf lignes en alerte, une seule sans — et chaque alerte est DOUBLÉE d’un texte, jamais la couleur seule (§33.6)', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_SUR_UNE_UNITE },
    });
    await within(principal).findByText('Unité 10');
    const table = tableau(principal);
    const enAlerte = [...table.querySelectorAll('tbody tr[data-alerte="true"]')];
    const sansAlerte = [...table.querySelectorAll('tbody tr[data-alerte="false"]')];
    expect(enAlerte).toHaveLength(9);
    expect(sansAlerte).toHaveLength(1);
    expect(texteVisibleDEmblee(sansAlerte[0] ?? table)).toMatch(/^Unité 1\b/);
    for (const ligne of enAlerte) {
      // LE DOUBLAGE TEXTUEL : un badge lisible, visible d'emblée, dans la ligne.
      expect(texteVisibleDEmblee(ligne)).toMatch(/aucune session/i);
      const badge = ligne.querySelector('.axn-badge--alerte');
      expect(badge, 'le badge d’alerte porte le TON alerte du design system').not.toBeNull();
    }
    expect(texteVisibleDEmblee(sansAlerte[0] ?? table)).not.toMatch(/aucune session/i);
    // La marge dit le compte : « 9 sans session ».
    expect(texteVisibleDEmblee(table.querySelector('tfoot') ?? table)).toMatch(/9 sans session/);
  });

  it('la couleur de l’alerte vient des jetons `--couleur-alerte-*` — ni le terracotta d’action, ni un hexadécimal', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_SUR_UNE_UNITE },
    });
    await within(principal).findByText('Unité 10');
    // Dans la CSS de la console : la règle qui cible `[data-alerte='true']` consomme
    // un jeton d'ALERTE et aucun jeton d'ACTION ; aucune couleur en dur.
    const css = cssConsole();
    const regles = [...css.matchAll(/[^{}]*\[data-alerte=['"]true['"]\][^{]*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    );
    expect(regles.length, 'aucune règle CSS ne cible l’attribut data-alerte').toBeGreaterThan(0);
    for (const corps of regles) {
      expect(corps).toMatch(/var\(--couleur-alerte-/);
      expect(corps).not.toMatch(/--couleur-action-/);
      expect(corps).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
    // Le badge : ton `alerte` du design system, dont la CSS consomme les mêmes jetons.
    const cssUi = readFileSync(
      resolve(import.meta.dirname, '../../../../../packages/ui/src/composants.css'),
      'utf8',
    );
    const badge = /\.axn-badge--alerte\s*\{([^}]*)\}/.exec(cssUi)?.[1] ?? '';
    expect(badge).toMatch(/var\(--couleur-alerte-fond\)/);
    expect(badge).not.toMatch(/--couleur-action-/);
    // Et le DOM rendu : aucun style en dur, aucun jeton inconnu de la charte.
    expect(balayerStylesEnDur(principal)).toEqual([]);
    expect(jetonsInconnus(principal)).toEqual([]);
  });

  it('une source EXIGÉE et non couverte se lit dans la phrase accessible (« source non couverte »), pas seulement au fond ambré', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_EN_ENTRETIENS },
    });
    await within(principal).findByText('Unité 1');
    const ligne = within(tableau(principal)).getByRole('row', { name: /^Unité 1\b/ });
    const manquantes = [...ligne.querySelectorAll('td[data-manquante="true"]')];
    expect(manquantes).toHaveLength(3); // observation, démonstration, relevé
    for (const cellule of manquantes) {
      expect(texteVisibleDEmblee(cellule)).toMatch(/source non couverte/);
    }
    const couverte = ligne.querySelector('td[data-manquante="false"][data-attendue="true"]');
    expect(texteVisibleDEmblee(couverte ?? ligne)).toMatch(/source couverte/);
    // L'abrégé « 6 / 6–10 » est masqué aux lecteurs d'écran ; la phrase, elle, est lue.
    expect(couverte?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('une unité HORS PÉRIMÈTRE est rendue, badgée, sans alerte et sans prévu (§25.1)', async () => {
    const principal = await rendreCouverture({
      couvertures: { [ID.missionTpe]: COUVERTURE_AVEC_HORS_PERIMETRE },
    });
    await within(principal).findByText('Unité sortie du périmètre');
    const table = tableau(principal);
    const sortie = within(table).getByRole('row', { name: /Unité sortie du périmètre/ });
    expect(sortie.getAttribute('data-alerte')).toBe('false');
    expect(texteVisibleDEmblee(sortie)).toMatch(/hors périmètre/i);
    expect(texteVisibleDEmblee(sortie)).not.toMatch(/aucune session/i);
    const oubliee = within(table).getByRole('row', { name: /Unité oubliée/ });
    expect(oubliee.getAttribute('data-alerte')).toBe('true');
    expect(texteVisibleDEmblee(table.querySelector('tfoot') ?? table)).toMatch(/1 hors périmètre/);
  });
});

// =============================================================================
// 3. LES QUATRE ÉTATS (§33.2) — avec un contenu PROPRE à cet écran
// =============================================================================
describe('§33.2 — les quatre états de l’écran couverture', () => {
  it('CHARGEMENT — un role="status" occupé qui dit « chargement de la couverture », jamais un spinner', async () => {
    const suspendu = installerServeurFactice({ latence: 'suspendue' });
    serveur = suspendu;
    rendreConsole(CHEMIN(ID.missionTpe));
    const statut = await screen.findByRole('status');
    expect(statut.getAttribute('aria-busy')).toBe('true');
    expect(statut.textContent).toMatch(/chargement de la couverture/i);
    expect(document.body.querySelector('[class*="spinner"], [class*="loader"]')).toBeNull();
    expect(texteVisibleDEmblee(document.body)).not.toMatch(/loading/i);
    // Libérer : le contenu remplace le squelette, et aucune zone occupée ne subsiste.
    for (let tour = 0; tour < 6 && suspendu.enAttente > 0; tour += 1) {
      suspendu.liberer();
      await new Promise((r) => setTimeout(r, 20));
    }
    await screen.findByText('Établissement unique');
    await waitFor(() => {
      expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('VIDE — aucune unité : un message PROPRE à la couverture qui dit QUOI FAIRE (importer/créer l’arbre), et un lien de retour', async () => {
    const principal = await rendreCouverture({ couvertures: { [ID.missionTpe]: COUVERTURE_VIDE } });
    await within(principal).findByText(/aucune unité/i);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/arbre/i);
    expect(texte).toMatch(/import(?:er|ez)|cré(?:er|ez)/i);
    expect(texte).toMatch(/périmètre/i);
    expect(within(principal).getByRole('link', { name: /retour à la mission/i })).toBeDefined();
    expect(principal.querySelector('table')).toBeNull();
    expect(within(principal).queryByRole('alert')).toBeNull();
  });

  it('ERREUR — un 500 rend un role="alert" français, cause + action, code technique REPLIÉ, bouton Réessayer qui relance', async () => {
    serveur = installerServeurFactice({ panne: 'serveur' });
    rendreConsole(CHEMIN(ID.missionTpe));
    const alerte = await screen.findByRole('alert');
    const visible = texteVisibleDEmblee(alerte);
    expect(visible).toMatch(/réessay|support/i);
    expect(visible).not.toContain(ERROR_CODES.INTERNAL_ERROR);
    expect(visible).not.toMatch(TRACE_TECHNIQUE);
    expect(codesBrutsVisibles(visible)).toEqual([]);
    const details = alerte.querySelector('details');
    if (details !== null) expect(details.hasAttribute('open')).toBe(false);
    const avant = serveur.appels.filter((a) => a.url.pathname.endsWith('/coverage')).length;
    expect(avant).toBeGreaterThanOrEqual(1);
    within(alerte)
      .getByRole('button', { name: /réessayer/i })
      .click();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      serveur.appels.filter((a) => a.url.pathname.endsWith('/coverage')).length,
    ).toBeGreaterThan(avant);
  });

  it('HORS LIGNE — câble coupé : « hors ligne », le texte de la CONSOLE (rien n’est saisi ici), pas celui du terrain', async () => {
    serveur = installerServeurFactice({ panne: 'reseau' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByText(/hors ligne/i);
    const visible = texteVisibleDEmblee(screen.getByRole('main'));
    expect(visible).toMatch(/serveur est injoignable|réseau/i);
    expect(visible).not.toMatch(/enregistré sur cet appareil/i);
    expect(visible).not.toMatch(TRACE_TECHNIQUE);
    expect(codesBrutsVisibles(visible)).toEqual([]);
  });

  it('INTROUVABLE — un identifiant inconnu rend « introuvable » et un lien de retour, aucun code brut', async () => {
    serveur = installerServeurFactice();
    rendreConsole(CHEMIN(ID.missionInconnue));
    const alerte = await screen.findByRole('alert');
    const visible = texteVisibleDEmblee(alerte);
    expect(visible).toMatch(/introuvable|n[’']existe (?:pas|plus)/i);
    expect(visible).not.toContain(ERROR_CODES.NOT_FOUND);
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /retour à la mission/i }),
    ).toBeDefined();
  });
});

// =============================================================================
// 4. CONSULTANT vs ADMIN — pixel par pixel
// =============================================================================
describe('@critique consultant vs administrateur — DOM et trace réseau, comparés', () => {
  /** Le HTML du <main>, débarrassé de ce qui varie entre deux montages (identifiants React). */
  function empreinte(principal: HTMLElement): string {
    return principal.innerHTML
      .replace(/id="[^"]*:r[0-9a-z]+:[^"]*"/g, 'id="…"')
      .replace(/for="[^"]*:r[0-9a-z]+:[^"]*"/g, 'for="…"');
  }

  it('@critique un consultant MEMBRE voit EXACTEMENT le même tableau que l’administrateur — et rien de plus', async () => {
    // Administrateur.
    let principal = await rendreCouverture({ role: 'admin' });
    await within(principal).findByText('Établissement unique');
    await new Promise((r) => setTimeout(r, 50));
    const admin = {
      html: empreinte(principal),
      appels: serveur?.appels.map((a) => a.url.pathname) ?? [],
    };
    serveur?.restaurer();
    cleanup();

    // Consultant membre de FIL-TPE.
    principal = await rendreCouverture({
      role: 'consultant',
      missionsDuConsultant: [ID.missionTpe],
    });
    await within(principal).findByText('Établissement unique');
    await new Promise((r) => setTimeout(r, 50));
    const consultant = {
      html: empreinte(principal),
      appels: serveur?.appels.map((a) => a.url.pathname) ?? [],
    };

    // LA PREUVE : aucune différence de DOM. Le RBAC serveur ne prescrit aucune
    // différence entre les deux rôles sur cette route (`type: 'mission'`) ; la
    // fiche mission, refusée au consultant (403), ne change pas le rendu — le
    // fuseau vient de la couverture elle-même.
    expect(consultant.html).toBe(admin.html);
    // La trace : les deux ont demandé la couverture ET la fiche mission ; le
    // consultant a été REFUSÉ sur la fiche (403 accepté, pas rejoué), servi sur la
    // couverture. Aucune route financière, aucune route inattendue.
    expect(consultant.appels.filter((u) => u.endsWith('/coverage'))).toHaveLength(1);
    expect(admin.appels.filter((u) => u.endsWith('/coverage'))).toHaveLength(1);
    expect(serveur?.appelsFinanciers).toEqual([]);
    expect(serveur?.appelsInattendus).toEqual([]);
  });

  it('@critique un consultant NON MEMBRE ne voit RIEN de la mission : « introuvable », aucun nom d’unité dans le DOM, aucun rejeu', async () => {
    serveur = installerServeurFactice({ role: 'consultant', missionsDuConsultant: [] });
    rendreConsole(CHEMIN(ID.missionTpe));
    const alerte = await screen.findByRole('alert');
    await new Promise((r) => setTimeout(r, 1_300));
    expect(texteVisibleDEmblee(alerte)).toMatch(/introuvable|n[’']existe/i);
    expect(document.body.outerHTML).not.toContain('Établissement unique');
    expect(screen.getByRole('main').querySelector('table')).toBeNull();
    // Le 404 n'est pas rejoué : au plus un appel de couverture, un de fiche.
    expect(serveur.appels.filter((a) => a.url.pathname.endsWith('/coverage'))).toHaveLength(1);
    expect(serveur.appels.length).toBeLessThanOrEqual(3);
  });

  it('@critique étanchéité financière — DOM (attributs compris) et trace : rien, pour les deux rôles', async () => {
    for (const scenario of [
      { role: 'admin' as const },
      { role: 'consultant' as const, missionsDuConsultant: [ID.missionTpe] },
    ]) {
      const principal = await rendreCouverture({
        ...scenario,
        couvertures: { [ID.missionTpe]: COUVERTURE_TOUT_SUR_UNE_UNITE },
      });
      await within(principal).findByText('Unité 10');
      await new Promise((r) => setTimeout(r, 50));
      expect(chercherDansLeHtml(document.body, VALEURS_SENTINELLES)).toEqual([]);
      expect(chercherDansLeHtml(document.body, NOMS_FINANCIERS_INTERDITS)).toEqual([]);
      expect(document.body.textContent).not.toMatch(VOCABULAIRE_FINANCIER);
      expect(serveur?.appelsFinanciers).toEqual([]);
      for (const appel of serveur?.appels ?? []) {
        expect(`${appel.url.pathname}${appel.url.search}`).not.toMatch(
          /scoping|financ|estimate|devis/i,
        );
      }
      serveur?.restaurer();
      cleanup();
    }
  });

  it('anonyme — le formulaire de connexion, aucune donnée de couverture demandée ni rendue', async () => {
    serveur = installerServeurFactice({ role: 'anonyme' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByRole('button', { name: /se connecter/i });
    expect(document.body.outerHTML).not.toContain('Établissement unique');
    expect(document.body.querySelector('table.axn-couverture')).toBeNull();
  });
});

// =============================================================================
// 5. FIL-GC — 150 unités, keyset, arbre navigable ; français ; fuseau
// =============================================================================
describe('FIL-GC — 150 unités sur 4 niveaux, chargées par curseur', () => {
  /**
   * BUDGET DE TEMPS EXPLICITE — 30 s. C'est le HARNAIS qu'on desserre, jamais une
   * assertion.
   *
   * Mesuré le 2026-09-05 : ce cas prend **10 304 ms** sur la machine de
   * développement, contre les 10 000 ms du défaut Vitest. Il ne s'était PAS mis à
   * échouer en CI, plus rapide — mais il vivait à 103 % de son budget, donc à un
   * cheveu du rouge intermittent. Un test qui échoue une fois sur deux est un test
   * qui ment (`playwright.config.ts` le dit déjà pour l'E2E) : il se corrige avant
   * de flaker, pas après.
   *
   * Ce que ce cas fait réellement : monter 150 unités × 9 colonnes dans jsdom, en
   * TROIS pages, et relire tout le DOM entre chacune. Dix secondes n'est pas une
   * exigence produit — le budget produit est le p95 < 100 ms de la ROUTE (porte
   * P-E, mesuré avec A28), et il ne se lit pas dans jsdom.
   *
   * Aucune assertion n'est retirée ni assouplie : le nombre de lignes, les trois
   * appels, le curseur opaque, l'absence d'offset, les 150 noms distincts et les
   * marges inchangées sont exactement les mêmes qu'avant.
   */
  it(
    'trois pages de 50 par « Charger la suite », curseur OPAQUE rendu tel quel, marges inchangées, aucun doublon',
    { timeout: 30_000 },
    async () => {
      serveur = installerServeurFactice();
      rendreConsole(CHEMIN(ID.missionGc));
      await screen.findByRole('heading', { level: 1, name: TITRE });
      const principal = screen.getByRole('main');
      await within(principal).findByText('Groupe 1');
      const table = tableau(principal);
      expect(table.querySelectorAll('tbody tr')).toHaveLength(50);
      const margesAvant = texteVisibleDEmblee(table.querySelector('tfoot') ?? table);
      expect(margesAvant).toMatch(/150 au périmètre/);
      expect(margesAvant).toMatch(/90 sans session/);

      for (const attendu of [100, 150]) {
        within(principal)
          .getByRole('button', { name: /charger la suite/i })
          .click();
        await waitFor(() => {
          expect(table.querySelectorAll('tbody tr')).toHaveLength(attendu);
        });
      }
      expect(within(principal).queryByRole('button', { name: /charger la suite/i })).toBeNull();
      // Trois appels, `after` = le curseur rendu par la page précédente, jamais un offset.
      const appels = serveur.appels.filter((a) => a.url.pathname.endsWith('/coverage'));
      expect(appels).toHaveLength(3);
      expect(appels[0]?.url.searchParams.get('after')).toBeNull();
      expect(appels[1]?.url.searchParams.get('after')).toBe('curseur-couverture-50');
      expect(appels[2]?.url.searchParams.get('after')).toBe('curseur-couverture-100');
      for (const appel of appels) {
        expect([...appel.url.searchParams.keys()].some((k) => /offset|page|skip/i.test(k))).toBe(
          false,
        );
      }
      // Aucune ligne dupliquée : 150 unités distinctes, l'arbre entier navigable.
      const noms = [...table.querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent);
      expect(new Set(noms).size).toBe(150);
      expect(noms.at(-1)).toContain('Service 120');
      // Les marges n'ont pas bougé d'une page à l'autre (elles viennent de la première).
      expect(texteVisibleDEmblee(table.querySelector('tfoot') ?? table)).toBe(margesAvant);
      // L'indentation de l'arbre est un multiple d'un JETON d'espacement, jamais un px.
      const service = within(table).getByRole('row', { name: /Service 120/ });
      expect(service.querySelector('.axn-couverture__unite')?.getAttribute('style')).toMatch(
        /var\(--espacement-/,
      );
      expect(balayerStylesEnDur(table)).toEqual([]);
    },
  );

  it('interface 100 % française : aucun code brut du contrat, aucun mot d’interface anglais — et l’horodatage au fuseau de MISSION', async () => {
    const principal = await rendreCouverture({});
    await within(principal).findByText('Établissement unique');
    const texte = texteVisibleDEmblee(principal);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    expect(texte).not.toMatch(/\b(?:loading|error|retry|coverage|planned|done|load more)\b/i);
    // Les codes des sources (`releve_donnees`, `analyse_documentaire`) ne sont jamais affichés.
    for (const kind of SOURCES_COLLECTE.filter((k) => k.includes('_')))
      expect(texte).not.toContain(kind);
    // `calculeLe` = 2026-09-05T08:00Z → 10:00 à Paris (fuseau de FIL-TPE), dit tel quel.
    expect(texte).toMatch(/calculée le 5 sept\. 2026,? 10:00/i);
    expect(texte).toMatch(/heure de la mission/i);
  });

  it('la couverture du contrat rendue : « 60 réalisé sur 600–900 prévu » sur FIL-GC, lisible en marge', async () => {
    serveur = installerServeurFactice();
    rendreConsole(CHEMIN(ID.missionGc));
    await screen.findByRole('heading', { level: 1, name: TITRE });
    const principal = screen.getByRole('main');
    await within(principal).findByText('Groupe 1');
    const marges = texteVisibleDEmblee(tableau(principal).querySelector('tfoot') ?? principal);
    expect(marges).toMatch(/60 réalisé sur 600–900 prévu/);
    expect(marges).toMatch(/0 réalisé sur 150 prévu/);
    expect(COUVERTURE_GC.unites).toHaveLength(150);
    expect(COUVERTURE_TPE.unites).toHaveLength(1);
  });
});
