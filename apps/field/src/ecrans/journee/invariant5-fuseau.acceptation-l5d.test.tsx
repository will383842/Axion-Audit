// =============================================================================
// INVARIANT 5 À L'ÉCRAN — LE FUSEAU DE MISSION, ET RIEN QUE LUI
//
// ── STATUT DE CE FICHIER ─────────────────────────────────────────────────────
// GARDE ÉCRITE AVANT SON CORRECTIF. Écrit par A26, qui n'a produit aucune ligne
// d'`EcranRestauration.tsx`, d'`EcranFinDeJournee.tsx` ni de `session/fuseau.ts`
// (09 §5.6 : le code de test n'est jamais écrit par l'agent qui a écrit le code
// testé). **A26 ne corrige rien** : ce fichier est ROUGE au moment où il est
// livré, et il le reste jusqu'à ce qu'un autre agent corrige les appelants.
//
// ── LE DÉFAUT, ET POURQUOI IL N'EST PAS UNE COQUILLE ─────────────────────────
// Établi par A20 dans `docs/portes/ATTESTATION_A20_L5B_2026-09-08.md`, à partir
// de la réserve R2 de la recette A54 du 2026-09-07, confirmée par A02 qui
// corrige son propre verdict : les invariants passent de 8/8 à 7/8 + 1 écart.
//
// `session/fuseau.ts` est CONFORME. Son en-tête dit que le fuseau de mission
// « n'intervient qu'ICI », et c'est vrai. Ce sont ses APPELANTS qui le désarment :
//   · `EcranRestauration.tsx:360` — `formaterDateHeure(…, undefined)`. La
//     signature accepte `undefined`, `Intl` retombe alors sur le fuseau de
//     l'APPAREIL, et la ligne « Sauvegarde produite le » ment dès que l'auditeur
//     a voyagé. Il voyage : c'est un auditeur terrain (03 §22.2, « audits dans le
//     monde entier »).
//   · `EcranFinDeJournee.tsx:333` — `{dernierRituel}`, un ISO 8601 UTC rendu tel
//     quel, sans passer par aucun formateur. Ni fuseau de mission, ni format
//     JJ/MM/AAAA (03 §22.2, « formats : dates JJ/MM/AAAA »), ni français.
// Un module d'invariant contourné par son appelant est un défaut de lot.
//
// ── ET UN TROISIÈME DÉFAUT, DISTINCT, QUI VOYAGE AVEC ────────────────────────
// `EcranRestauration.tsx:364` rend `{phase.rapport.missionId}` : un UUID nu sous
// l'étiquette « Mission ». Ce n'est pas un problème de fuseau, c'est le premier
// membre de l'invariant 5 — « interface 100 % en français ». Un identifiant
// technique de 36 caractères ne renseigne PAS l'auditeur sur ce qu'il vient de
// restaurer, ce qui est pourtant l'intention explicite de la carte (constat A27
// du 2026-09-06 : « deux sauvegardes sur la même clé USB ne se distinguaient
// d'aucune façon »). Le titre de la mission, lui, la renseigne — et il est dans
// la base, puisque la restauration vient précisément de l'y écrire.
// Il est gardé SÉPARÉMENT : deux défauts, deux tests, deux causes.
//
// ── LE CŒUR DE LA MÉTHODE : FAIRE DIVERGER APPAREIL ET MISSION ───────────────
// Si l'appareil et la mission sont au même fuseau, le défaut est INVISIBLE — et
// c'est exactement pour cela qu'il a survécu à toute la recette de L5b/L5c. Ces
// tests posent donc trois fuseaux mutuellement distincts :
//   · MISSION  = `Pacific/Kiritimati` (UTC+14) — ce que l'écran DOIT afficher ;
//   · APPAREIL = `America/Los_Angeles` (UTC-7 en septembre) — injecté dans
//     `Intl.DateTimeFormat` quand aucun `timeZone` ne lui est donné ;
//   · l'instant `2026-09-06T22:30:00.000Z`, choisi pour que le JOUR CIVIL lui-
//     même diffère : 07/09 12:30 à la mission, 06/09 15:30 sur l'appareil.
// Un E2E Playwright ne distinguerait pas cela : son navigateur tourne au fuseau
// de la machine, donc au même fuseau que la « mission » de la fixture. Le niveau
// `interface` est ici le plus SÉVÈRE, pas seulement le plus rapide — c'est le
// seul où l'on peut fabriquer la divergence.
//
// ── CE QUE CES TESTS NE VOIENT PAS ───────────────────────────────────────────
// Le service worker sous iOS n'est couvert par aucun test automatisé du dépôt
// (11 §7) : le mode avion réel sur iPad se rejoue à la main aux portes P-C et
// P-E. Rien ici ne le remplace, et rien ici ne prétend le remplacer.
//
// Traçabilité : E32 (fuseaux, devises, interface française) · E38 (sauvegarde
// terrain : sync et export de secours) · E44 (UX/UI 2026-2027).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { CLE_DERNIER_RITUEL } from '../../agenda/jour.js';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente } from '../../local/ecriture.js';
import { EXTENSION_SAUVEGARDE, type FichierSauvegarde } from '../../sauvegarde/format.js';
import { exporterSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { EcranFinDeJournee } from './EcranFinDeJournee.js';
import { EcranRestauration } from './EcranRestauration.js';

// -----------------------------------------------------------------------------
// Fixtures FICTIVES (invariant 2) — aucune référence client, nulle part.
// -----------------------------------------------------------------------------
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000005d001';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000005d002';
const TITRE_MISSION = 'Mission fictive FIL-GC — antenne lointaine';

/** Le fuseau de la MISSION : ce que l'écran doit afficher (03 §22.2). */
const FUSEAU_MISSION = 'Pacific/Kiritimati';
/** Le fuseau de l'APPAREIL : ce que l'écran ne doit JAMAIS afficher. */
const FUSEAU_APPAREIL = 'America/Los_Angeles';
/**
 * L'instant de référence. Choisi pour que les deux fuseaux ne diffèrent pas
 * seulement d'une heure mais d'un JOUR CIVIL — un décalage d'heure se lit mal
 * dans un échec de test, un décalage de date ne se discute pas.
 */
const INSTANT = '2026-09-06T22:30:00.000Z';

/** Argon2id allégé : la robustesse du KDF est prouvée ailleurs, pas ici. */
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

// -----------------------------------------------------------------------------
// L'INJECTION DU FUSEAU D'APPAREIL.
//
// `Intl.DateTimeFormat` est remplacé par une enveloppe qui, lorsqu'AUCUN
// `timeZone` ne lui est passé, en impose un — celui de l'« appareil ». Tout appel
// qui donne un `timeZone` explicite traverse sans être touché.
//
// Pourquoi pas `process.env.TZ` : il agit sur le processus entier, donc sur les
// autres fichiers du projet `interface` qui partagent le worker, et il ne
// distingue pas « l'appelant n'a pas donné de fuseau » de « l'appelant a donné le
// fuseau de la machine ». L'enveloppe, elle, ne modifie QUE le cas fautif.
// La forme est celle, déjà éprouvée, de `packages/shared/src/temps.test.ts`.
// -----------------------------------------------------------------------------
const CONSTRUCTEUR_REEL = Intl.DateTimeFormat;

function poserFuseauDAppareil(fuseau: string): void {
  const enveloppe = function enveloppe(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    const complet =
      options?.timeZone === undefined ? { ...(options ?? {}), timeZone: fuseau } : options;
    return new CONSTRUCTEUR_REEL(locales, complet);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.defineProperty(enveloppe, 'supportedLocalesOf', {
    value: CONSTRUCTEUR_REEL.supportedLocalesOf.bind(CONSTRUCTEUR_REEL),
  });
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: enveloppe,
    configurable: true,
    writable: true,
  });
}

function retirerFuseauDAppareil(): void {
  Object.defineProperty(Intl, 'DateTimeFormat', {
    value: CONSTRUCTEUR_REEL,
    configurable: true,
    writable: true,
  });
}

/**
 * Le rendu ATTENDU, calculé avec le constructeur RÉEL et un fuseau explicite.
 *
 * Il n'est jamais recopié en dur : une chaîne figée dériverait au prochain ICU et
 * l'échec parlerait alors d'autre chose que de l'invariant. La sanité de la
 * comparaison est garantie autrement — par l'assertion, faite dans chaque test,
 * que le rendu MISSION diffère bel et bien du rendu APPAREIL.
 */
function dateHeureAu(fuseau: string): string {
  return new CONSTRUCTEUR_REEL('fr-FR', {
    timeZone: fuseau,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Date.parse(INSTANT));
}

/** `07/09/2026 12:30` — l'heure locale du site audité. */
const ATTENDU_MISSION = dateHeureAu(FUSEAU_MISSION);
/** `06/09/2026 15:30` — l'heure du portable de l'auditeur. Jamais affichable. */
const RENDU_APPAREIL = dateHeureAu(FUSEAU_APPAREIL);
/** `06/09/2026 22:30` — l'heure de stockage. Elle non plus n'est pas affichable. */
const RENDU_UTC = dateHeureAu('UTC');

// -----------------------------------------------------------------------------
// Le harnais d'appareil — base Dexie réelle, coffre réel, `useTerrain` simulé.
// -----------------------------------------------------------------------------
let terrain: ValeurTerrain;
let kek: CryptoKey;
let sauvegarde: FichierSauvegarde;

const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

async function appareilNeuf(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a26-l5d-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

/** Une mission fictive dont le fuseau n'est PAS celui de l'appareil. */
async function semerMission(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: INSTANT,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'collecte', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: TITRE_MISSION,
          companyId: '0191e2a0-0000-7000-8000-00000005d0c0',
          timezone: FUSEAU_MISSION,
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'multi_pays',
          countryCode: 'KI',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
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
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif lointain',
          countryCode: null,
          timezone: null,
          headcount: 6,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: INSTANT,
        },
      },
    ],
  });
}

function terrainDe(base: BaseLocale, vue: 'restauration' | 'finDeJournee'): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['accueil', vue] },
    vue,
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

/** `navigator.storage`, absent de jsdom, et exigé par l'écran avant d'écrire. */
function poserStockageAccorde(): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve({ quota: 10 * 1024 ** 3, usage: 1024 ** 3 }),
    },
  });
}

beforeAll(async () => {
  kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(53), KDF_TEST);
  poserStockageAccorde();

  // L'appareil d'ORIGINE produit un vrai `.axionbackup`, puis disparaît — c'est
  // le scénario de l'invariant 8, et c'est ce fichier que l'écran relira.
  const base = await appareilNeuf();
  await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette fictive dorigine');
  await semerMission();
  const produit = await exporterSauvegarde({
    missionId: MISSION_ID,
    motDePasse: MOT_DE_PASSE,
    parametresKdf: KDF_TEST,
  });
  retirerContexteLocal();

  // L'en-tête est EN CLAIR et n'entre pas dans l'authentification AES-GCM
  // (`importerSauvegarde` n'y lit que le sel, les paramètres KDF et le nonce) :
  // on peut donc y poser l'instant de référence sans invalider le fichier. C'est
  // la seule façon de rendre `sauvegardeCreeeLe` déterministe sans toucher à
  // l'horloge, qui est du code de production.
  sauvegarde = JSON.parse(JSON.stringify(produit)) as FichierSauvegarde;
  sauvegarde.enTete.creeLe = INSTANT;
}, 60_000);

beforeEach(() => {
  poserStockageAccorde();
  poserFuseauDAppareil(FUSEAU_APPAREIL);
});

afterEach(async () => {
  cleanup();
  retirerFuseauDAppareil();
  vi.restoreAllMocks();
  retirerContexteLocal();
  Reflect.deleteProperty(navigator, 'storage');
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

afterAll(() => {
  retirerFuseauDAppareil();
});

/** Le harnais lui-même doit être capable de voir le défaut. */
function verifierQueLesFuseauxDivergent(): void {
  expect(ATTENDU_MISSION).not.toBe(RENDU_APPAREIL);
  expect(ATTENDU_MISSION).not.toBe(RENDU_UTC);
}

/** Le geste de l'auditeur sur l'appareil de remplacement, en un appel. */
async function restaurerParLEcran(base: BaseLocale): Promise<void> {
  terrain = terrainDe(base, 'restauration');
  render(<EcranRestauration />);
  fireEvent.change(screen.getByLabelText(/fichier de sauvegarde/i), {
    target: {
      files: [
        new File([JSON.stringify(sauvegarde)], `secours${EXTENSION_SAUVEGARDE}`, {
          type: 'application/json',
        }),
      ],
    },
  });
  fireEvent.change(screen.getByLabelText(/votre mot de passe/i), {
    target: { value: MOT_DE_PASSE },
  });
  fireEvent.click(screen.getByRole('button', { name: /restaurer sur cet appareil/i }));
  await screen.findByText(/sauvegarde restaurée/i, undefined, { timeout: 20_000 });
}

/** Le texte de la définition qui suit une étiquette donnée, dans la carte `<dl>`. */
function definitionDe(etiquette: RegExp): string {
  const dt = screen.getAllByRole('term').find((terme) => etiquette.test(terme.textContent));
  expect(dt, `étiquette introuvable : ${String(etiquette)}`).toBeDefined();
  const dd = dt?.nextElementSibling;
  return dd?.textContent ?? '';
}

// =============================================================================
// A. « SAUVEGARDE PRODUITE LE » — l'heure locale du SITE, jamais du portable
// =============================================================================
describe('EcranRestauration — invariant 5 : le fuseau de mission à l’affichage', () => {
  it('@critique l’instant de la sauvegarde est rendu au fuseau de la MISSION', async () => {
    verifierQueLesFuseauxDivergent();
    const base = await appareilNeuf();
    await restaurerParLEcran(base);

    const rendu = definitionDe(/sauvegarde produite le/i);

    // CE QUE L'ÉCRAN DOIT DIRE : 03 §22.2, « heure locale du site audité ».
    expect(rendu).toContain(ATTENDU_MISSION);
    // CE QU'IL NE DOIT DIRE À AUCUN PRIX : l'heure du portable de l'auditeur.
    // C'est l'assertion qui rougit aujourd'hui — `formaterDateHeure(…, undefined)`
    // laisse `Intl` retomber sur le fuseau de l'appareil.
    expect(rendu).not.toContain(RENDU_APPAREIL);
    // Ni l'heure de stockage : UTC vit en base et en API, pas à l'écran.
    expect(rendu).not.toContain(RENDU_UTC);
    // Ni l'ISO nu : 03 §22.2, « formats : dates JJ/MM/AAAA ».
    expect(rendu).not.toContain(INSTANT);
  }, 40_000);

  it('@critique aucun horodatage de l’écran n’est rendu au fuseau de l’appareil', async () => {
    verifierQueLesFuseauxDivergent();
    const base = await appareilNeuf();
    await restaurerParLEcran(base);

    // La règle vaut pour l'écran ENTIER, pas pour la ligne qu'A20 a nommée : le
    // défaut est un motif d'appel, et un motif se reproduit à la ligne suivante.
    const ecran = document.body.textContent;
    expect(ecran).not.toContain(RENDU_APPAREIL);
    expect(ecran).not.toContain(RENDU_UTC);
    expect(ecran).toContain(ATTENDU_MISSION);
  }, 40_000);
});

// =============================================================================
// B. « MISSION » — un UUID n'est pas de l'interface en français
// =============================================================================
describe('EcranRestauration — invariant 5 : interface 100 % en français', () => {
  it('@critique aucun UUID nu n’est affiché à l’auditeur', async () => {
    const base = await appareilNeuf();
    await restaurerParLEcran(base);

    // Un UUID canonique, où qu'il soit dans le texte rendu. L'auditeur qui vient
    // de perdre sa tablette lit cet écran ; 36 caractères hexadécimaux ne lui
    // apprennent rien et ne sont pas du français.
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(document.body.textContent).not.toMatch(uuid);
  }, 40_000);

  it('@critique la mission restaurée est NOMMÉE, pas seulement identifiée', async () => {
    const base = await appareilNeuf();
    await restaurerParLEcran(base);

    // Retirer l'UUID sans rien mettre à la place ferait perdre ce que la carte
    // existe pour dire (constat A27 du 2026-09-06 : distinguer deux sauvegardes
    // de la même clé USB). Le titre est dans la base — la restauration vient de
    // l'y écrire — et c'est une donnée de mission, donc conforme à l'invariant 2.
    expect(definitionDe(/^mission/i)).toContain(TITRE_MISSION);
  }, 40_000);
});

// =============================================================================
// C. « DERNIER RITUEL » — un ISO 8601 rendu tel quel n'est pas une interface
// =============================================================================
describe('EcranFinDeJournee — invariant 5 : le dernier rituel est une heure lisible', () => {
  beforeEach(async () => {
    const base = await appareilNeuf();
    await semerMission();
    await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);
    await ecrireMeta(base, CLE_DERNIER_RITUEL, INSTANT);
    terrain = terrainDe(base, 'finDeJournee');
  });

  it('@critique l’instant du dernier rituel est formaté au fuseau de la MISSION', async () => {
    verifierQueLesFuseauxDivergent();
    render(<EcranFinDeJournee />);
    const ligne = await screen.findByText(/dernier rituel/i);

    // Aujourd'hui, `{dernierRituel}` est interpolé tel quel : la ligne contient
    // l'ISO UTC brut. Ni fuseau de mission, ni format JJ/MM/AAAA, ni français.
    expect(ligne.textContent).toContain(ATTENDU_MISSION);
  }, 30_000);

  it('@critique aucun ISO 8601 nu n’apparaît sur l’écran de fin de journée', async () => {
    render(<EcranFinDeJournee />);
    await screen.findByText(/dernier rituel/i);

    // La forme `AAAA-MM-JJTHH:MM` est celle de la base et de l'API (11 §3), et
    // elle n'a rien à faire dans une interface : c'est le motif générique, pas
    // la seule occurrence connue.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  }, 30_000);

  it('@critique le fuseau de l’appareil n’apparaît nulle part sur l’écran', async () => {
    verifierQueLesFuseauxDivergent();
    render(<EcranFinDeJournee />);
    await screen.findByText(/dernier rituel/i);

    const ecran = document.body.textContent;
    expect(ecran).not.toContain(RENDU_APPAREIL);
    expect(ecran).not.toContain(RENDU_UTC);
  }, 30_000);
});
