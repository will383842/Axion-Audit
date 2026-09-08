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
// ── CE QUE LE REJEU CROISÉ A29 Y A AJOUTÉ (R6 et r2, 2026-09-08) ─────────────
// Deux branches de REPLI traversées par personne, sondées `throw` par A29 sans
// jamais être atteintes : les fuseaux DIVERGENTS de deux missions embarquées
// (`EcranFinDeJournee.tsx:97`, section D) et la mission ABSENTE du fichier de
// secours (`sauvegarde.ts:395`, section E). Un raisonnement juste et une branche
// morte se ressemblent exactement, vus depuis un tableau de bord vert.
// La garde B, elle, énonçait une règle plus large que ce qu'elle appliquait :
// son exclusion est désormais NOMMÉE et bornée (arbitrage A01 du 2026-09-08).
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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { CLE_DERNIER_RITUEL } from '../../agenda/jour.js';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import {
  CoffreVerrouilleError,
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
} from '../../local/coffre.js';
import {
  contexteLocal,
  installerContexteLocal,
  retirerContexteLocal,
} from '../../local/contexte.js';
import { appliquerDescente } from '../../local/ecriture.js';
import type * as Ecriture from '../../local/ecriture.js';
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
 * Le fuseau d'une SECONDE mission embarquée — réserve R6 (A29, 2026-09-08).
 *
 * Deux missions au MÊME fuseau se traitent comme une seule ; c'est leur
 * DIVERGENCE qui ouvre la branche que la sonde d'A29 n'a jamais atteinte.
 */
const FUSEAU_MISSION_B = 'Europe/Paris';
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
/** `07/09/2026 00:30` — l'heure locale de la SECONDE mission (R6). */
const ATTENDU_MISSION_B = dateHeureAu(FUSEAU_MISSION_B);
/** `06/09/2026 15:30` — l'heure du portable de l'auditeur. Jamais affichable. */
const RENDU_APPAREIL = dateHeureAu(FUSEAU_APPAREIL);
/**
 * `06/09/2026 22:30` — l'heure de stockage.
 *
 * NUE, elle n'est jamais affichable : c'est l'écart d'invariant 5 que L5d
 * corrige. NOMMÉE (« … (heure UTC) »), elle est au contraire le seul aveu
 * honnête quand le fuseau de la mission est inconnu ou indécidable. Les deux cas
 * se distinguent par la mention, et les tests ci-dessous en font autant.
 */
const RENDU_UTC = dateHeureAu('UTC');

// -----------------------------------------------------------------------------
// Le harnais d'appareil — base Dexie réelle, coffre réel, `useTerrain` simulé.
// -----------------------------------------------------------------------------
let terrain: ValeurTerrain;
let kek: CryptoKey;
let sauvegarde: FichierSauvegarde;
/** Le même format, sans la ligne `missions` : le repli d'identité inconnue (R6). */
let sauvegardeSansMission: FichierSauvegarde;

const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

// -----------------------------------------------------------------------------
// LE LEVIER DE LA RÉSERVE R7 — une panne qui n'arrive qu'APRÈS l'écriture commise.
//
// `appliquerDescente` est le VRAI, appelé tel quel ; la seule différence est
// qu'une fois résolu — donc une fois les données ÉCRITES — il déclenche ce que le
// test a armé. Rien n'est simulé de l'écriture elle-même : c'est ce qui permet
// d'affirmer, à la fin, que la base contient bien la mission pendant que l'écran
// se prononce. Une panne armée AVANT l'écriture aurait fait échouer l'import
// entier, et « Rien n'a été modifié » aurait alors été VRAI : le test n'aurait
// rien mesuré de R7. Désarmé (`null`), le levier est transparent, et les autres
// sections de ce fichier le traversent sans le voir.
// -----------------------------------------------------------------------------
let apresEcritureCommise: (() => void) | null = null;

vi.mock('../../local/ecriture.js', async (importerReel) => {
  const reel = await importerReel<typeof Ecriture>();
  return {
    ...reel,
    appliquerDescente: async (lot: Ecriture.LotDescendant): Promise<void> => {
      await reel.appliquerDescente(lot);
      apresEcritureCommise?.();
    },
  };
});

async function appareilNeuf(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a26-l5d-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

/** Ce qu'il faut d'une mission fictive pour la semer — invariant 2, aucun client. */
interface MissionFictive {
  readonly id: string;
  readonly uniteId: string;
  readonly titre: string;
  readonly fuseau: string;
  readonly pays: string;
  readonly unite: string;
}

const MISSION_A: MissionFictive = {
  id: MISSION_ID,
  uniteId: UNITE_ID,
  titre: TITRE_MISSION,
  fuseau: FUSEAU_MISSION,
  pays: 'KI',
  unite: 'Service fictif lointain',
};

/** La seconde mission embarquée sur le même appareil, à un AUTRE fuseau (R6). */
const MISSION_B: MissionFictive = {
  id: '0191e2a0-0000-7000-8000-00000005d011',
  uniteId: '0191e2a0-0000-7000-8000-00000005d012',
  titre: 'Mission fictive FIL-TPE — atelier métropolitain',
  fuseau: FUSEAU_MISSION_B,
  pays: 'FR',
  unite: 'Atelier fictif de proximité',
};

/**
 * La mission dont le fichier de secours ne porte PAS sa propre ligne (R6).
 *
 * Ce n'est pas un cas d'école : `lireTable('missions', …)` filtre sur l'`id`, et
 * une sauvegarde produite pour une mission que l'appareil n'a jamais reçue —
 * descente interrompue, ligne purgée, fichier d'une version antérieure — sort
 * avec ses unités et sans sa mission. La sonde d'A29 n'a jamais atteint ce repli.
 */
const MISSION_SANS_LIGNE = '0191e2a0-0000-7000-8000-00000005d021';
const UNITE_SANS_MISSION = '0191e2a0-0000-7000-8000-00000005d022';

/** Une mission fictive dont le fuseau n'est PAS celui de l'appareil. */
async function semerMission(mission: MissionFictive = MISSION_A): Promise<void> {
  await appliquerDescente({
    missionId: mission.id,
    serverTime: INSTANT,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: { id: mission.id, status: 'collecte', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: mission.titre,
          companyId: '0191e2a0-0000-7000-8000-00000005d0c0',
          timezone: mission.fuseau,
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'multi_pays',
          countryCode: mission.pays,
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: mission.uniteId,
          missionId: mission.id,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: mission.unite,
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

/** Une unité rattachée à une mission dont AUCUNE ligne n'existe dans la base. */
async function semerUniteOrpheline(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_SANS_LIGNE,
    serverTime: INSTANT,
    prochainSince: null,
    enregistrements: [
      {
        table: 'orgUnits',
        index: {
          id: UNITE_SANS_MISSION,
          missionId: MISSION_SANS_LIGNE,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif sans mission connue',
          countryCode: null,
          timezone: null,
          headcount: 3,
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
  await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette fictive d’origine');
  await semerMission();
  await semerUniteOrpheline();
  const produit = await exporterSauvegarde({
    missionId: MISSION_ID,
    motDePasse: MOT_DE_PASSE,
    parametresKdf: KDF_TEST,
  });
  // Le MÊME appareil produit le second fichier : `lireTable('missions', …)`
  // filtre sur l'`id`, donc l'export d'une mission sans ligne sort avec ses
  // unités et sans elle. Rien n'est bricolé à la main — c'est le vrai
  // exportateur, sur une vraie base, qui fabrique le cas (R6).
  const produitSansMission = await exporterSauvegarde({
    missionId: MISSION_SANS_LIGNE,
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
  sauvegardeSansMission = JSON.parse(JSON.stringify(produitSansMission)) as FichierSauvegarde;
  sauvegardeSansMission.enTete.creeLe = INSTANT;
}, 60_000);

beforeEach(() => {
  poserStockageAccorde();
  poserFuseauDAppareil(FUSEAU_APPAREIL);
});

afterEach(async () => {
  cleanup();
  retirerFuseauDAppareil();
  apresEcritureCommise = null;
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

/** La phrase FAUSSE — la seule que l'écran de restauration puisse prononcer (R2). */
const RIEN_MODIFIE = /rien n.a été modifié/i;
/** La phrase attendue une fois les données écrites. */
const SUCCES = /sauvegarde restaurée/i;

/**
 * Les gestes de l'auditeur sur l'appareil de remplacement — sans attendre le
 * verdict. Séparés de l'attente pour que la section F puisse attendre l'UN OU
 * L'AUTRE des deux verdicts : un test qui n'attendrait que le succès rougirait
 * par expiration, et un échec qui expire ne dit pas ce qu'il a vu.
 */
function lancerRestaurationParLEcran(base: BaseLocale, fichier: FichierSauvegarde): void {
  terrain = terrainDe(base, 'restauration');
  render(<EcranRestauration />);
  fireEvent.change(screen.getByLabelText(/fichier de sauvegarde/i), {
    target: {
      files: [
        new File([JSON.stringify(fichier)], `secours${EXTENSION_SAUVEGARDE}`, {
          type: 'application/json',
        }),
      ],
    },
  });
  fireEvent.change(screen.getByLabelText(/votre mot de passe/i), {
    target: { value: MOT_DE_PASSE },
  });
  fireEvent.click(screen.getByRole('button', { name: /restaurer sur cet appareil/i }));
}

/** Le geste de l'auditeur sur l'appareil de remplacement, en un appel. */
async function restaurerParLEcran(
  base: BaseLocale,
  fichier: FichierSauvegarde = sauvegarde,
): Promise<void> {
  lancerRestaurationParLEcran(base, fichier);
  await screen.findByText(SUCCES, undefined, { timeout: 20_000 });
}

/** Attend que l'écran se soit PRONONCÉ — succès ou échec — sans préjuger duquel. */
async function attendreLeVerdict(): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryByText(SUCCES) ?? screen.queryByText(RIEN_MODIFIE)).not.toBeNull();
    },
    { timeout: 20_000 },
  );
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
//
// L'EXCLUSION EST NOMMÉE, PAS ÉVITÉE (arbitrage A01 du 2026-09-08, remarque r2).
// Cette garde est écrite comme une RÈGLE GÉNÉRALE — « un UUID canonique, où qu'il
// soit dans le texte rendu ». Elle ne l'était qu'en apparence : elle était verte
// par le CHEMIN qu'elle emprunte, celui d'une restauration sans ré-export, et non
// par la règle qu'elle énonce. Appliquée à `EcranFinDeJournee` après un export,
// elle aurait rougi À TORT — et on l'aurait crue cassée alors qu'elle était mal
// écrite. A01 a tranché : `axion-<uuid>-<horodatage>.axionbackup` est une CLÉ que
// l'auditeur recopie à l'identique dans son gestionnaire de fichiers pour
// retrouver sa sauvegarde sur sa clé USB, pas une phrase d'interface ; la
// franciser supprimerait le seul lien entre le message et le fichier déposé, et
// s'il porte un UUID plutôt qu'un titre, c'est l'invariant 2 qui l'exige.
// La règle est donc : tout UUID, SAUF celui d'un nom de fichier de sauvegarde —
// et cette exception est retirée du texte explicitement, puis éprouvée.
// =============================================================================

/** Un UUID canonique : 36 caractères qui n'apprennent rien à un auditeur. */
const UUID_CANONIQUE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** `axion-<uuid>-<horodatage compacté>.axionbackup` — cf. `nomFichierSauvegarde`. */
const NOM_FICHIER_SAUVEGARDE = new RegExp(
  `axion-[0-9a-f-]{36}-\\d{8}T\\d{6}Z${EXTENSION_SAUVEGARDE.replace('.', '\\.')}`,
  'gi',
);

/** Le texte de l'écran, privé des seuls UUID que l'invariant 5 ne réclame pas. */
function sansNomDeFichier(texte: string): string {
  return texte.replace(NOM_FICHIER_SAUVEGARDE, '<nom de fichier de sauvegarde>');
}

// =============================================================================
describe('EcranRestauration — invariant 5 : interface 100 % en français', () => {
  it('@critique aucun UUID nu n’est affiché à l’auditeur', async () => {
    const base = await appareilNeuf();
    await restaurerParLEcran(base);

    // Un UUID canonique, où qu'il soit dans le texte rendu — moins l'exclusion
    // ci-dessus, qui est NOMMÉE et non évitée.
    expect(sansNomDeFichier(document.body.textContent)).not.toMatch(UUID_CANONIQUE);
  }, 40_000);

  it('@critique l’exclusion du nom de fichier est bornée à un nom de fichier', () => {
    // Une exclusion non éprouvée est un trou qui s'ignore : celle-ci doit laisser
    // passer le nom de fichier ET rien d'autre. Trois textes, une seule règle.
    const nom = `axion-${MISSION_ID}-20260906T223000Z${EXTENSION_SAUVEGARDE}`;
    expect(sansNomDeFichier(`Sauvegarde chiffrée produite : ${nom} (0 élément(s)).`)).not.toMatch(
      UUID_CANONIQUE,
    );
    expect(sansNomDeFichier(`Mission ${MISSION_ID}`)).toMatch(UUID_CANONIQUE);
    // Et surtout : la présence d'un nom de fichier dans la phrase ne blanchit pas
    // l'UUID nu qui l'accompagne. Sans cette ligne, l'exclusion serait une porte.
    expect(sansNomDeFichier(`Mission ${MISSION_ID} — fichier ${nom}`)).toMatch(UUID_CANONIQUE);
  });

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

// =============================================================================
// D. DEUX MISSIONS, DEUX FUSEAUX — l'écran ne tranche pas à la place de personne
//
// Réserve R6 (A29, 2026-09-08). La sonde `throw` posée sur la branche « fuseaux
// divergents » d'`EcranFinDeJournee.tsx:97` n'a JAMAIS été atteinte par la suite
// `apps/field` complète : toutes les fixtures n'embarquaient qu'une mission, et
// la règle d'unanimité écrite par A22 était, de son propre aveu, « raisonnée,
// pas éprouvée ». Un raisonnement juste et une branche morte se ressemblent
// exactement, vus depuis un tableau de bord vert.
//
// Le rituel du soir est un geste d'APPAREIL, pas de mission : quand deux missions
// à deux fuseaux sont embarquées, aucune ne peut prétendre seule au « site
// audité ». L'écran n'en élit donc aucune — et surtout, il ne retombe pas sur
// celui de la machine, qui serait un TROISIÈME fuseau sans rapport avec l'un ni
// avec l'autre. Il rend l'instant en UTC, nommé. C'est l'aveu, pas l'arbitrage.
// =============================================================================
describe('EcranFinDeJournee — invariant 5 : deux missions, deux fuseaux', () => {
  beforeEach(async () => {
    const base = await appareilNeuf();
    await semerMission(MISSION_A);
    await semerMission(MISSION_B);
    await ecrireMeta(base, cleEmbarquement(MISSION_A.id), INSTANT);
    await ecrireMeta(base, cleEmbarquement(MISSION_B.id), INSTANT);
    await ecrireMeta(base, CLE_DERNIER_RITUEL, INSTANT);
    terrain = terrainDe(base, 'finDeJournee');
  });

  it('@critique fuseaux divergents : l’instant est rendu en UTC, NOMMÉ comme tel', async () => {
    // Le harnais doit pouvoir voir le défaut : quatre rendus, quatre valeurs.
    expect(new Set([ATTENDU_MISSION, ATTENDU_MISSION_B, RENDU_APPAREIL, RENDU_UTC]).size).toBe(4);

    render(<EcranFinDeJournee />);
    // `ZoneEtat` ne rend ses enfants qu'en état NOMINAL : trouver cette ligne
    // prouve que la journée est CHARGÉE, donc que les deux missions sont lues.
    // Sans cela, l'assertion pourrait passer sur le premier rendu, quand
    // `journee` vaut encore `undefined` — un vert qui ne prouverait rien.
    const texte = (await screen.findByText(/dernier rituel/i)).textContent;

    expect(texte).toContain(RENDU_UTC);
    expect(texte).toMatch(/UTC/);
    // Aucune des deux missions n'est élue — c'est la branche que R6 vise.
    expect(texte).not.toContain(ATTENDU_MISSION);
    expect(texte).not.toContain(ATTENDU_MISSION_B);
    // Et surtout pas le fuseau de la machine, qui n'est ni l'un ni l'autre.
    expect(texte).not.toContain(RENDU_APPAREIL);
  }, 30_000);
});

// =============================================================================
// E. UNE SAUVEGARDE SANS SA PROPRE MISSION — l'appareil l'avoue deux fois
//
// Réserve R6 (A29, 2026-09-08). Second repli jamais exercé : `lireIdentiteMission`
// (`sauvegarde/sauvegarde.ts:395`) rend `{titre: null, fuseau: null}` quand la
// base n'a pas la ligne de mission après l'import. Deux effets à l'écran, et un
// seul test les tient ensemble parce qu'ils naissent du même `null` :
//   · le titre manque → l'écran le DIT, il n'invente ni titre ni UUID de repli ;
//   · le fuseau manque → l'instant part en UTC NOMMÉ, jamais au fuseau du
//     portable de l'auditeur, qui est ici divergent des deux missions.
// Le fichier n'est pas forgé : c'est le vrai exportateur qui le produit, sur une
// mission dont la ligne n'a jamais été descendue (voir `semerUniteOrpheline`).
// =============================================================================
describe('EcranRestauration — invariant 5 : une sauvegarde dont la mission est inconnue', () => {
  it('@critique l’instant part en UTC nommé, jamais au fuseau de l’appareil', async () => {
    verifierQueLesFuseauxDivergent();
    const base = await appareilNeuf();
    await restaurerParLEcran(base, sauvegardeSansMission);

    const rendu = definitionDe(/sauvegarde produite le/i);

    expect(rendu).toContain(RENDU_UTC);
    expect(rendu).toMatch(/UTC/);
    expect(rendu).not.toContain(RENDU_APPAREIL);
    expect(rendu).not.toContain(INSTANT);
  }, 40_000);

  it('@critique le titre manquant est AVOUÉ, jamais remplacé par un identifiant', async () => {
    const base = await appareilNeuf();
    await restaurerParLEcran(base, sauvegardeSansMission);

    const rendu = definitionDe(/^mission/i);

    // Ni le titre d'une AUTRE mission (l'appareil en connaît deux), ni un UUID
    // ressorti faute de mieux : une phrase en français qui dit ce qui manque et
    // ce que l'auditeur peut faire (03 §17.6, cause et action).
    expect(rendu).not.toContain(TITRE_MISSION);
    expect(rendu).not.toMatch(UUID_CANONIQUE);
    expect(rendu.trim()).not.toBe('');
    expect(sansNomDeFichier(document.body.textContent)).not.toMatch(UUID_CANONIQUE);
  }, 40_000);
});

// =============================================================================
// F. UNE LECTURE DE CONFORT QUI LÈVE APRÈS L'ÉCRITURE — le compte rendu tient
//
// Réserve R7 (A29, rejeu final L5d, 2026-09-08). Le `catch` de
// `lireIdentiteMission` (`sauvegarde/sauvegarde.ts:420`), écrit par A22 pour
// fermer R2, n'était gardé par rien : sonde `throw` dedans → 1240/1240 verte ;
// correctif R2 retiré en entier → 1240/1240 verte. La couverture le disait, elle
// (« Uncovered Line #s : 421-422 »), mais une ligne non couverte sur le chemin du
// SECOURS n'est pas une ligne qu'on laisse : la porte P-C prouve l'invariant 8.
//
// Ce que ces tests tiennent, et pourquoi c'est l'ORDRE DES EFFETS qui tranche :
// `appliquerDescente` a résolu, la marque d'embarquement est écrite, les données
// SONT sur l'appareil. Une lecture de confort — un déchiffrement, un `get` — qui
// lève à cet instant ne doit pas pouvoir retirer le compte rendu d'une écriture
// déjà commise, parce que la phrase de repli de l'écran (« Rien n'a été
// modifié ») serait alors FAUSSE, et prononcée sur le chemin du secours à un
// auditeur qui vient de perdre sa tablette. Le titre et le fuseau tombent à
// `null`, et l'écran le MONTRE — la section E dit déjà ce que « montrer » veut
// dire ; ici, seule la CAUSE du `null` change.
//
// Deux causes, un `it` chacune, parce qu'elles n'ont pas le même statut :
//   · le coffre qui lève — le cas RÉEL que R2 visait (verrou tombé entre deux
//     `await`, enveloppe corrompue) ;
//   · une erreur de PROGRAMMATION dans le bloc — le `catch` l'avale aussi, et
//     A29 l'a constaté : sa sonde sur `ligne === undefined` a été masquée.
//     C'est le comportement voulu (après une écriture commise, plus rien n'en
//     retire le compte rendu), mais un comportement voulu s'ASSERTE, il ne se
//     subit pas. Son prix est nommé ici : un défaut de code dans ce bloc se
//     manifestera par « identité inconnue », jamais par une panne — quiconque
//     retouche ce bloc doit le savoir, et ce test le lui dit.
//
// Chaque `it` prouve d'abord que la panne a bien été RENCONTRÉE (compteur) : un
// vert obtenu parce que la sonde n'a pas été atteinte serait le défaut même que
// R7 dénonce.
// =============================================================================
describe('EcranRestauration — réserve R7 : une lecture qui lève APRÈS l’écriture commise', () => {
  /** Ce que l'écran doit dire quand l'écriture est commise et l'identité illisible. */
  function verifierSuccesAvecIdentiteInconnue(): void {
    // ① Le succès est annoncé, et la seule phrase fausse n'est PAS prononcée.
    expect(
      screen.queryByText(RIEN_MODIFIE),
      'L’écran dit « Rien n’a été modifié » alors que `appliquerDescente` a RÉSOLU :\n' +
        'la lecture de confort qui suit l’écriture a été laissée remonter jusqu’au\n' +
        '`.catch` terminal de l’écran, et le compte rendu d’une écriture commise a été retiré.',
    ).toBeNull();
    expect(screen.getByText(SUCCES)).toBeTruthy();

    // ② Le titre est AVOUÉ manquant — ni le titre (illisible), ni un UUID.
    const mission = definitionDe(/^mission/i);
    expect(mission).not.toContain(TITRE_MISSION);
    expect(mission).not.toMatch(UUID_CANONIQUE);
    expect(mission.trim()).not.toBe('');

    // ③ Le fuseau est inconnu → UTC NOMMÉ, jamais la mission (illisible) ni
    //    l'appareil (divergent des deux).
    const instant = definitionDe(/sauvegarde produite le/i);
    expect(instant).toContain(RENDU_UTC);
    expect(instant).toMatch(/UTC/);
    expect(instant).not.toContain(ATTENDU_MISSION);
    expect(instant).not.toContain(RENDU_APPAREIL);
    expect(instant).not.toContain(INSTANT);
  }

  it('@critique le coffre lève après l’écriture : le succès est annoncé, l’identité avouée', async () => {
    verifierQueLesFuseauxDivergent();
    const base = await appareilNeuf();
    const { coffre } = contexteLocal();
    let pannesRencontrees = 0;

    // Armé pour l'INSTANT où l'écriture est commise, pas avant : jusque-là, le
    // vrai coffre chiffre les vraies lignes. Après, tout déchiffrement lève ce
    // que lève un coffre dont le verrou est tombé entre deux `await`.
    apresEcritureCommise = () => {
      vi.spyOn(coffre, 'dechiffrer').mockImplementation(() => {
        pannesRencontrees += 1;
        return Promise.reject(new CoffreVerrouilleError());
      });
    };

    lancerRestaurationParLEcran(base, sauvegarde);
    await attendreLeVerdict();

    // Le harnais doit pouvoir voir le défaut : si la panne n'a pas été
    // rencontrée, le vert qui suit ne prouverait rien.
    expect(pannesRencontrees).toBeGreaterThan(0);
    verifierSuccesAvecIdentiteInconnue();

    // Et l'écriture est bien COMMISE : la ligne de mission est dans la base
    // pendant que l'écran se prononce. C'est ce qui rend « Rien n'a été
    // modifié » faux, et c'est ce que ce test tient.
    expect(await base.missions.get(MISSION_ID)).toBeDefined();
  }, 40_000);

  it('@critique une erreur de PROGRAMMATION dans la lecture d’identité ne retire pas le compte rendu', async () => {
    verifierQueLesFuseauxDivergent();
    const base = await appareilNeuf();
    let pannesRencontrees = 0;

    // Pas un rejet du domaine : un `TypeError` synchrone, la forme d'un défaut
    // de code — exactement la sonde d'A29, celle que le `catch` a masquée.
    apresEcritureCommise = () => {
      vi.spyOn(base.missions, 'get').mockImplementation(() => {
        pannesRencontrees += 1;
        throw new TypeError('sonde A29 : erreur de programmation (fictive)');
      });
    };

    lancerRestaurationParLEcran(base, sauvegarde);
    await attendreLeVerdict();

    expect(pannesRencontrees).toBeGreaterThan(0);
    verifierSuccesAvecIdentiteInconnue();

    // La sonde est retirée AVANT de relire la base : c'est la vraie table qui
    // atteste que l'écriture était commise au moment du verdict.
    vi.restoreAllMocks();
    expect(await base.missions.get(MISSION_ID)).toBeDefined();
  }, 40_000);
});
