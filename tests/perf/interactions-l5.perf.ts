// =============================================================================
// MESURE A28 — p95 DES INTERACTIONS DU TERRAIN, SOUS LE VRAI CADDY.
//
// ── LA RÉSERVE QUE CE FICHIER FERME ────────────────────────────────────────
// Revue croisée A29 du 2026-09-09 (`docs/portes/REVUE_A29_SECURITE_2026-09-09.md`)
// : la sécurité est signée, « **A28 p95 — non faite** » ne l'est pas. Et
// `packages/shared/src/zod-sans-jit.ts` porte la condition de l'arbitrage A01 en
// toutes lettres : « A28 mesure le p95 < 100 ms avant signature ».
//
// ── LE SEUIL, ET D'OÙ IL VIENT ─────────────────────────────────────────────
// 09 §1 (« LES RÔLES », ligne 23) : « A28 agent accessibilité/perf (axe-core en
// CI, contraste AA, **p95 interactions <100 ms**, benchmark chiffrement <50
// ms/écriture) ». 09 §4, porte P-E : le même seuil, explicitement « sur les
// listes longues » de FIL-GC (150 unités). C'est un p95, pas une moyenne.
//
// ── POURQUOI DERRIÈRE CADDY, ET PAS SOUS `vite preview` ────────────────────
// `vite preview` ne pose AUCUN des en-têtes servis. Or trois d'entre eux
// changent ce que fait le navigateur : la CSP sans `'unsafe-eval'` (qui décide
// si Zod peut compiler à la volée), COEP `require-corp` et COOP `same-origin`
// (qui décident de `crossOriginIsolated`, donc de la résolution de
// `performance.now()` et du droit à `SharedArrayBuffer`). Mesurer le budget
// ailleurs que derrière les en-têtes réels reviendrait à mesurer une autre
// application. Le montage reprend celui d'A54 (recette novice du 2026-09-09) :
// image du `FROM` d'`infra/caddy/Dockerfile`, `Caddyfile` du dépôt,
// `fronts.static.caddy`, les `dist/` réellement construits.
//
// ── CE QUI N'EST PAS MESURÉ ICI, ET QUI EST MESURÉ AILLEURS ────────────────
// Le budget de chiffrement du 11 §4 (< 50 ms/écriture) a déjà son banc :
// `e2e/budget-chiffrement-l5.e2e.ts`. Il n'est pas réécrit ici — il est REJOUÉ
// tel quel contre ce même Caddy, et c'est ce que dit le rapport. Réécrire un
// banc existant pour en changer le serveur serait perdre ses quatre
// contre-épreuves.
//
// Traçabilité : E36 (CI exécutable), E43 (exécutabilité autopilote — budgets
// d'acceptation), E6 (hors ligne total : tous les gestes mesurés sont hors ligne).
// =============================================================================
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  MISSION_FIL_TPE,
  MOT_DE_PASSE_APPAREIL,
  planterAppareil,
  semerAppareil,
  type GrainesAppareil,
} from '../../e2e/fixtures/appareil-terrain.js';
import {
  armer,
  evenementsLents,
  installerChrono,
  relever,
  type CibleInteraction,
  type MesureInteraction,
} from './fixtures/chrono-interaction.js';
import {
  MISSION_FIL_GC,
  MOT_DE_PASSE_FIL_GC,
  planterFilGc,
  semerFilGc,
  SESSIONS_FIL_GC,
  UNITES_FIL_GC,
  type GrainesFilGc,
} from './fixtures/semis-fil-gc.js';

/** 09 §1 et 09 §4 (P-E), en toutes lettres : « p95 interactions < 100 ms ». */
const BUDGET_INTERACTION_MS = 100;

/** 11 §4 : « dérivation de clé < 1 s sur iPad ». Mesurée ici sur PC. */
const BUDGET_DERIVATION_MS = 1000;

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RELEVE = join(RACINE, 'releves-a28', 'interactions.jsonl');

// ─────────────────────────────────────────────────────────────────────────────
// STATISTIQUES — nommées, pour qu'on sache laquelle est assertée
// ─────────────────────────────────────────────────────────────────────────────
interface Resume {
  readonly libelle: string;
  readonly n: number;
  readonly mediane: number;
  readonly moyenne: number;
  readonly ecartType: number;
  readonly p95: number;
  readonly max: number;
  /** Les valeurs brutes : un p95 dont on ne peut pas relire l'échantillon ne se vérifie pas. */
  readonly valeurs: readonly number[];
}

function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haut = triees[milieu] ?? 0;
  if (triees.length % 2 === 1) return haut;
  return ((triees[milieu - 1] ?? 0) + haut) / 2;
}

/**
 * p95 par RANG LE PLUS PROCHE, sans interpolation — la même définition que le
 * banc de chiffrement d'A28, pour que les deux chiffres se comparent.
 */
function p95(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(triees.length - 1, Math.ceil(0.95 * triees.length) - 1);
  return triees[rang] ?? 0;
}

function resumer(libelle: string, valeurs: readonly number[]): Resume {
  const n = valeurs.length;
  const moyenne = valeurs.reduce((somme, valeur) => somme + valeur, 0) / (n || 1);
  const variance = valeurs.reduce((somme, v) => somme + (v - moyenne) ** 2, 0) / (n || 1);
  return {
    libelle,
    n,
    mediane: mediane(valeurs),
    moyenne,
    ecartType: Math.sqrt(variance),
    p95: p95(valeurs),
    max: n === 0 ? 0 : Math.max(...valeurs),
    valeurs: valeurs.map((valeur) => Number(valeur.toFixed(2))),
  };
}

function arrondi(valeur: number): string {
  return valeur.toFixed(2);
}

function enUneLigne(resume: Resume): string {
  return (
    `${resume.libelle} — n=${String(resume.n)} · médiane ${arrondi(resume.mediane)} ms · ` +
    `moyenne ${arrondi(resume.moyenne)} ms · écart-type ${arrondi(resume.ecartType)} ms · ` +
    `p95 ${arrondi(resume.p95)} ms · max ${arrondi(resume.max)} ms`
  );
}

/**
 * Publie le relevé : annotation du rapport Playwright ET fichier JSONL.
 *
 * Le fichier existe parce qu'une annotation ne se compare pas d'un lot à
 * l'autre. Le rapport A28 recopie ces chiffres ; le fichier est ce qui permet
 * de les rejouer et de les diffuser sans relire un HTML de 5 Mo.
 */
function publier(resumes: readonly Resume[], contexte: Record<string, unknown>): void {
  for (const resume of resumes) {
    test.info().annotations.push({ type: 'mesure A28', description: enUneLigne(resume) });
  }
  try {
    mkdirSync(dirname(RELEVE), { recursive: true });
    appendFileSync(RELEVE, `${JSON.stringify({ ...contexte, resumes })}\n`, 'utf8');
  } catch {
    /* l'annotation reste la preuve ; un relevé illisible ne fait pas rougir une mesure */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LES GESTES — repris des parcours d'A26/A28 (`e2e/accessibilite-toutes-vues-l5`)
// ─────────────────────────────────────────────────────────────────────────────
const INTERLOCUTEUR = 'Camille Ferrand';
const FONCTION = 'Responsable d’atelier';

let semisTpe: Promise<GrainesAppareil> | null = null;
function grainesTpe(): Promise<GrainesAppareil> {
  semisTpe ??= semerAppareil(MOT_DE_PASSE_APPAREIL);
  return semisTpe;
}

let semisGc: Promise<GrainesFilGc> | null = null;
function grainesGc(): Promise<GrainesFilGc> {
  semisGc ??= semerFilGc(MOT_DE_PASSE_FIL_GC);
  return semisGc;
}

/** L'étiquette qui ENTOURE un bouton radio de `SegmenteONA` — le pavé tactile. */
function etiquetteDe(radio: Locator): Locator {
  return radio.locator('xpath=..');
}

/** La cible d'un pavé de cotation coché : la coche a bougé sous le doigt. */
function cibleCotation(texte: string): CibleInteraction {
  return { selecteur: 'label.axn-choix__option:has(.axn-choix__marque)', texte };
}

/** Un geste mesuré : arme, joue, relève. */
async function mesurer(
  page: Page,
  libelle: string,
  cible: CibleInteraction | null,
  geste: () => Promise<void>,
  delaiMs = 15_000,
): Promise<MesureInteraction> {
  await armer(page, libelle, cible, delaiMs);
  await geste();
  return relever(page);
}

/** Efface la base locale : l'appareil repart neuf, vue mémorisée comprise. */
async function effacerBaseLocale(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>((resoudre) => {
        const demande = indexedDB.deleteDatabase('axion-terrain');
        demande.onsuccess = (): void => {
          resoudre();
        };
        demande.onerror = (): void => {
          resoudre();
        };
        demande.onblocked = (): void => {
          resoudre();
        };
      }),
  );
}

/** Le déverrouillage, qui porte la dérivation Argon2id du 11 §4. */
async function mesurerDeverrouillage(page: Page, motDePasse: string): Promise<MesureInteraction> {
  await expect(page.getByRole('heading', { name: 'Déverrouiller la collecte' })).toBeVisible();
  await page.getByLabel(/^Mot de passe/).fill(motDePasse);
  return mesurer(
    page,
    'déverrouillage (dérivation Argon2id incluse)',
    { selecteur: '.axn-coquille__titre', texte: 'Aujourd’hui' },
    async () => {
      await page.getByRole('button', { name: 'Déverrouiller' }).click();
    },
    60_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A. LE GESTE UNITAIRE — la cotation, sur FIL-TPE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('A28 — p95 des interactions du terrain, derrière Caddy', () => {
  test('@critique FIL-TPE — cotation, navigation de question, bascule d’écran partagé', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await installerChrono(page);
    await planterAppareil(page, await grainesTpe());

    const deverrouillage = await mesurerDeverrouillage(page, MOT_DE_PASSE_APPAREIL);

    // ── OUVRIR UN ENTRETIEN, DOUZE FOIS ───────────────────────────────────
    // Trois gestes DISTINCTS (03 §17.1 : trois champs, puis l'accord, puis la
    // collecte), donc trois séries distinctes : les fondre en une seule aurait
    // donné un p95 sur trois valeurs hétérogènes, c'est-à-dire un maximum
    // déguisé. Douze tours, et l'appareil s'alourdit d'un entretien à chaque
    // fois — la dérive éventuelle se voit.
    const versNouvelEntretien: number[] = [];
    const ouvrir: number[] = [];
    const demarrer: number[] = [];
    const quitter: number[] = [];
    for (let tour = 0; tour < 12; tour += 1) {
      versNouvelEntretien.push(
        (
          await mesurer(
            page,
            'aller à « Nouvel entretien »',
            { selecteur: 'main h1', texte: 'Nouvel entretien' },
            async () => {
              await page.getByRole('button', { name: 'Nouvel entretien' }).click();
            },
          )
        ).msCible ?? 0,
      );
      await page.getByLabel('Nom de l’interlocuteur').fill(`${INTERLOCUTEUR} ${String(tour + 1)}`);
      await page.getByLabel('Fonction').fill(FONCTION);
      await page.getByLabel('Unité').selectOption({ label: MISSION_FIL_TPE.unite });
      ouvrir.push(
        (
          await mesurer(
            page,
            'ouvrir l’entretien',
            { selecteur: 'main h2', texte: 'Avant la première question' },
            async () => {
              await page.getByRole('button', { name: 'Ouvrir l’entretien' }).click();
            },
          )
        ).msCible ?? 0,
      );
      await page.getByLabel('Accord de participation recueilli').check();
      demarrer.push(
        (
          await mesurer(
            page,
            'démarrer l’entretien',
            { selecteur: 'main', texte: 'Question 1 / 3' },
            async () => {
              await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
            },
          )
        ).msCible ?? 0,
      );
      if (tour < 11) {
        quitter.push(
          (
            await mesurer(
              page,
              'quitter l’entretien',
              { selecteur: 'main h1', texte: 'Aujourd’hui' },
              async () => {
                await page.getByRole('button', { name: 'Quitter l’entretien' }).click();
              },
            )
          ).msCible ?? 0,
        );
      }
    }

    // La question 1 est un texte libre ; la 2 est un oui/non, la 3 une échelle.
    await expect(page.getByText('Question 1 / 3')).toBeVisible();

    // ── Navigation de question : « Suivant » puis « Précédent », 30 fois ────
    const navigations: number[] = [];
    for (let tour = 0; tour < 15; tour += 1) {
      navigations.push(
        (
          await mesurer(
            page,
            'question suivante',
            { selecteur: 'main', texte: 'Question 2 / 3' },
            async () => {
              await page.getByRole('button', { name: /^Suivant/ }).click();
            },
          )
        ).msCible ?? 0,
      );
      navigations.push(
        (
          await mesurer(
            page,
            'question précédente',
            { selecteur: 'main', texte: 'Question 1 / 3' },
            async () => {
              await page.getByRole('button', { name: /^Précédent/ }).click();
            },
          )
        ).msCible ?? 0,
      );
    }

    // ── Cotation oui/non : 40 pavés, en alternant (un pavé déjà coché ne
    //    déclenche rien, et la cible serait satisfaite d'avance) ─────────────
    await mesurer(
      page,
      'question suivante (vers oui/non)',
      { selecteur: 'main', texte: 'Question 2 / 3' },
      async () => {
        await page.getByRole('button', { name: /^Suivant/ }).click();
      },
    );
    const cotationsOuiNon: number[] = [];
    const oui = page.getByRole('radio', { name: /^Oui/ });
    const non = page.getByRole('radio', { name: /^Non/ });
    for (let tour = 0; tour < 40; tour += 1) {
      const pair = tour % 2 === 0;
      const mesure = await mesurer(
        page,
        `cotation oui/non (${pair ? 'Oui' : 'Non'})`,
        cibleCotation(pair ? 'Oui' : 'Non'),
        async () => {
          await etiquetteDe(pair ? oui : non).click();
        },
      );
      cotationsOuiNon.push(mesure.msCible ?? 0);
    }

    // ── Cotation à l'échelle 1-5 (03 §32.4, les ancres) ────────────────────
    await mesurer(
      page,
      'question suivante (vers l’échelle)',
      { selecteur: 'main', texte: 'Question 3 / 3' },
      async () => {
        await page.getByRole('button', { name: /^Suivant/ }).click();
      },
    );
    const cotationsEchelle: number[] = [];
    const crans = page.getByRole('radio');
    const nombreDeCrans = await crans.count();
    expect(nombreDeCrans, 'la question à échelle doit porter ses crans').toBeGreaterThanOrEqual(5);
    for (let tour = 0; tour < 40; tour += 1) {
      const rang = tour % nombreDeCrans;
      const cran = crans.nth(rang);
      const nom = (await cran.getAttribute('aria-label')) ?? (await cran.inputValue());
      const mesure = await mesurer(page, `cotation échelle (cran ${nom})`, null, async () => {
        await etiquetteDe(cran).click();
      });
      cotationsEchelle.push(mesure.msPremierePeinture);
    }

    // ── Bascule d'écran partagé (03 §33.3) ────────────────────────────────
    const bascules: number[] = [];
    for (let tour = 0; tour < 20; tour += 1) {
      const versPartage = tour % 2 === 0;
      const mesure = await mesurer(
        page,
        `bascule écran ${versPartage ? 'partagé' : 'privé'}`,
        {
          selecteur: '.axn-bandeau-partage__bouton',
          texte: versPartage ? 'Revenir en écran privé' : 'Passer en écran partagé',
        },
        async () => {
          await page
            .getByRole('button', {
              name: versPartage ? 'Passer en écran partagé' : 'Revenir en écran privé',
            })
            .click();
        },
      );
      bascules.push(mesure.msCible ?? 0);
    }

    const lents = await evenementsLents(page);
    const resumes = [
      resumer('FIL-TPE · cotation oui/non (geste → peinture)', cotationsOuiNon),
      resumer('FIL-TPE · cotation échelle 1-5 (geste → peinture)', cotationsEchelle),
      resumer('FIL-TPE · navigation de question', navigations),
      resumer('FIL-TPE · bascule écran partagé/privé', bascules),
      resumer('FIL-TPE · cockpit → « Nouvel entretien »', versNouvelEntretien),
      resumer('FIL-TPE · « Ouvrir l’entretien » (création locale chiffrée)', ouvrir),
      resumer('FIL-TPE · « Démarrer l’entretien » (entrée en collecte)', demarrer),
      resumer('FIL-TPE · « Quitter l’entretien » (retour au cockpit)', quitter),
      resumer('FIL-TPE · déverrouillage (Argon2id)', [deverrouillage.msCible ?? 0]),
    ];
    publier(resumes, {
      lot: 'FIL-TPE',
      evenementsDEntree: lents.length,
      dureeMaxEventTiming: lents.reduce((max, e) => Math.max(max, e.duree), 0),
      dureesEventTimingDistinctes: [...new Set(lents.map((e) => e.duree))].sort((a, b) => a - b),
      pointeurVersClicDeverrouillage: deverrouillage.msPointeurVersClic,
    });

    // ── ANTI-VACUITÉ ──────────────────────────────────────────────────────
    expect(cotationsOuiNon.length, 'aucune cotation mesurée').toBe(40);
    expect(cotationsEchelle.length, 'aucune cotation à l’échelle mesurée').toBe(40);
    expect(ouvrir.length, 'aucune ouverture d’entretien mesurée').toBe(12);
    for (const valeur of [...cotationsOuiNon, ...navigations, ...bascules, ...ouvrir]) {
      expect(valeur, 'une durée nulle est un chronomètre qui n’a rien vu').toBeGreaterThan(0);
    }

    // ── LES BUDGETS ───────────────────────────────────────────────────────
    for (const resume of resumes.slice(0, 8)) {
      expect(resume.p95, `09 §1 — ${enUneLigne(resume)}`).toBeLessThan(BUDGET_INTERACTION_MS);
    }
    expect(
      deverrouillage.msCible ?? 0,
      `11 §4 — dérivation de clé : ${arrondi(deverrouillage.msCible ?? 0)} ms ` +
        '(seuil 1000 ms, énoncé POUR IPAD ; mesuré ici sur PC)',
    ).toBeLessThan(BUDGET_DERIVATION_MS);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. LES LISTES LONGUES — FIL-GC, le critère explicite de la porte P-E
  // ───────────────────────────────────────────────────────────────────────────
  test('@critique FIL-GC — 150 unités, 60 sessions : les listes longues tiennent le budget', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await installerChrono(page);
    await planterFilGc(page, await grainesGc());

    const deverrouillage = await mesurerDeverrouillage(page, MOT_DE_PASSE_FIL_GC);

    // La mission est LUE dans une charge chiffrée : l'anti-vacuité du volume.
    await expect(page.getByRole('heading', { name: MISSION_FIL_GC.titre })).toBeVisible();

    const versAgenda: number[] = [];
    const versPilote: number[] = [];
    const versNouvel: number[] = [];
    const retours: number[] = [];

    for (let tour = 0; tour < 10; tour += 1) {
      versAgenda.push(
        (
          await mesurer(
            page,
            'FIL-GC → agenda (60 sessions, 150 unités)',
            { selecteur: 'main h1', texte: 'Agenda' },
            async () => {
              await page.getByRole('button', { name: /l’agenda/ }).click();
            },
          )
        ).msCible ?? 0,
      );
      retours.push(
        (
          await mesurer(
            page,
            'FIL-GC → retour au cockpit',
            { selecteur: 'main h1', texte: 'Aujourd’hui' },
            async () => {
              await page
                .getByRole('button', { name: /^Retour|^Revenir/ })
                .first()
                .click();
            },
          )
        ).msCible ?? 0,
      );
      versPilote.push(
        (
          await mesurer(
            page,
            'FIL-GC → où en est la mission (couverture 150 unités)',
            { selecteur: 'main h1', texte: 'Où en est la mission' },
            async () => {
              await page.getByRole('button', { name: 'Où en est cette mission ?' }).click();
            },
          )
        ).msCible ?? 0,
      );
      retours.push(
        (
          await mesurer(
            page,
            'FIL-GC → retour au cockpit',
            { selecteur: 'main h1', texte: 'Aujourd’hui' },
            async () => {
              await page
                .getByRole('button', { name: /^Retour|^Revenir/ })
                .first()
                .click();
            },
          )
        ).msCible ?? 0,
      );
      versNouvel.push(
        (
          await mesurer(
            page,
            'FIL-GC → nouvel entretien (liste de 150 unités)',
            { selecteur: 'main h1', texte: 'Nouvel entretien' },
            async () => {
              await page.getByRole('button', { name: 'Nouvel entretien' }).click();
            },
          )
        ).msCible ?? 0,
      );
      retours.push(
        (
          await mesurer(
            page,
            'FIL-GC → retour au cockpit',
            { selecteur: 'main h1', texte: 'Aujourd’hui' },
            async () => {
              await page
                .getByRole('button', { name: /^Retour|^Revenir/ })
                .first()
                .click();
            },
          )
        ).msCible ?? 0,
      );
    }

    // ── « TROUVER SA SESSION DU JOUR » (09 §4, P-E) ───────────────────────
    // La liste du cockpit porte les 60 sessions planifiées aujourd'hui. Le geste
    // mesuré est celui de l'auditeur qui ouvre la sienne : un clic sur une ligne
    // de la liste longue, jusqu'à l'écran d'entretien.
    //
    // POURQUOI L'APPAREIL EST REMIS À NEUF ENTRE DEUX MESURES, ET C'EST UN
    // CONSTAT, PAS UN CONFORT : « Quitter l'entretien » navigue vers `accueil`
    // (`EcranEntretien.tsx:541`, `naviguer({type:'racine', vue:'accueil'})`), et
    // depuis `accueil` AUCUN geste ne ramène au cockpit `aujourdhui` — c'est la
    // réserve R3 d'A54, ouverte et non arbitrée. Le harnais ne contourne rien :
    // il repart d'un appareil neuf, ce qui a l'avantage de donner dix mesures de
    // la dérivation Argon2id sur les 150 unités de FIL-GC au lieu d'une.
    const lignesDuJour = page.locator('button.axn-journee__session');
    const ouvertureDepuisLaListe: number[] = [];
    const derivations: number[] = [deverrouillage.msCible ?? 0];
    for (let tour = 0; tour < 20; tour += 1) {
      if (tour > 0) {
        await effacerBaseLocale(page);
        await planterFilGc(page, await grainesGc());
        derivations.push((await mesurerDeverrouillage(page, MOT_DE_PASSE_FIL_GC)).msCible ?? 0);
      }
      await expect(lignesDuJour.first()).toBeVisible();
      const nombreDeLignes = await lignesDuJour.count();
      expect(
        nombreDeLignes,
        'la liste du jour doit porter les sessions de FIL-GC — sinon la mesure ne porte sur rien',
      ).toBeGreaterThanOrEqual(20);
      const rang = (tour * 5) % nombreDeLignes;
      ouvertureDepuisLaListe.push(
        (
          await mesurer(
            page,
            `FIL-GC → ouvrir la session ${String(rang + 1)} de la liste du jour`,
            { selecteur: 'main h2', texte: 'Avant la première question' },
            async () => {
              await lignesDuJour.nth(rang).click();
            },
          )
        ).msCible ?? 0,
      );
    }

    // ── LE RÉGIME ÉTABLI, À L'ÉCHELLE DE FIL-GC ───────────────────────────
    // L'ouverture ci-dessus est le PREMIER geste d'une page fraîchement chargée.
    // Elle ne dit donc rien du régime établi, qui est ce que l'auditeur vit
    // pendant les 45 minutes suivantes : 40 questions à parcourir et à coter,
    // avec 150 unités et 60 sessions en mémoire. On le mesure ici, dans la
    // session qui vient d'être ouverte.
    await page.getByLabel('Accord de participation recueilli').check();
    await mesurer(
      page,
      'FIL-GC → démarrer l’entretien',
      { selecteur: 'main', texte: 'Question 1 / 40' },
      async () => {
        await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
      },
    );

    const navigationsGc: number[] = [];
    for (let rang = 1; rang < 40; rang += 1) {
      navigationsGc.push(
        (
          await mesurer(
            page,
            `FIL-GC → question ${String(rang + 1)} / 40`,
            { selecteur: 'main', texte: `Question ${String(rang + 1)} / 40` },
            async () => {
              await page.getByRole('button', { name: /^Suivant/ }).click();
            },
          )
        ).msCible ?? 0,
      );
    }

    // La question 38 est un `yes_no` (rang % 3 === 2 dans le semis) : on y
    // revient pour coter au doigt, quarante fois, en alternant.
    for (let rang = 39; rang >= 38; rang -= 1) {
      await mesurer(
        page,
        'FIL-GC → question précédente',
        { selecteur: 'main', texte: `Question ${String(rang)} / 40` },
        async () => {
          await page.getByRole('button', { name: /^Précédent/ }).click();
        },
      );
    }
    const cotationsGc: number[] = [];
    const ouiGc = page.getByRole('radio', { name: /^Oui/ });
    const nonGc = page.getByRole('radio', { name: /^Non/ });
    await expect(ouiGc).toBeVisible();
    for (let tour = 0; tour < 40; tour += 1) {
      const pair = tour % 2 === 0;
      cotationsGc.push(
        (
          await mesurer(
            page,
            `FIL-GC → cotation (${pair ? 'Oui' : 'Non'})`,
            cibleCotation(pair ? 'Oui' : 'Non'),
            async () => {
              await etiquetteDe(pair ? ouiGc : nonGc).click();
            },
          )
        ).msCible ?? 0,
      );
    }

    const lents = await evenementsLents(page);
    const resumes = [
      resumer('FIL-GC · cockpit → agenda (60 sessions)', versAgenda),
      resumer('FIL-GC · cockpit → couverture (150 unités × 40 questions)', versPilote),
      resumer('FIL-GC · cockpit → nouvel entretien (liste de 150)', versNouvel),
      resumer('FIL-GC · retour au cockpit (sessions du jour)', retours),
      resumer('FIL-GC · navigation de question (40 questions figées)', navigationsGc),
      resumer('FIL-GC · cotation en régime établi (150 unités en mémoire)', cotationsGc),
      resumer(
        'FIL-GC · ouvrir sa session du jour depuis la liste (60 lignes), page FROIDE',
        ouvertureDepuisLaListe,
      ),
      resumer('FIL-GC · déverrouillage (Argon2id, 150 unités à ouvrir)', derivations),
    ];
    publier(resumes, {
      lot: 'FIL-GC',
      unites: UNITES_FIL_GC,
      sessions: SESSIONS_FIL_GC,
      evenementsDEntree: lents.length,
      dureeMaxEventTiming: lents.reduce((max, e) => Math.max(max, e.duree), 0),
      dureesEventTimingDistinctes: [...new Set(lents.map((e) => e.duree))].sort((a, b) => a - b),
    });

    expect(versPilote.length, 'aucune navigation vers la couverture mesurée').toBe(10);
    expect(cotationsGc.length, 'aucune cotation en régime établi mesurée').toBe(40);
    for (const valeur of [
      ...versAgenda,
      ...versPilote,
      ...versNouvel,
      ...retours,
      ...cotationsGc,
    ]) {
      expect(valeur, 'une durée nulle est un chronomètre qui n’a rien vu').toBeGreaterThan(0);
    }

    for (const resume of resumes.slice(0, 7)) {
      expect(resume.p95, `09 §4 (P-E) — ${enUneLigne(resume)}`).toBeLessThan(BUDGET_INTERACTION_MS);
    }
  });
});
