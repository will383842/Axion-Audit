// =============================================================================
// LA TREIZIÈME VUE — « Points à revoir », destination du compteur du cockpit.
// Écrit par A26 (09 §5.6 : A22 a écrit l'écran et `agenda/a-revoir.ts`, il ne
// corrige rien ici et rien d'ici n'est corrigé par lui), depuis 03 §34.2
// (« ses à-revoir en attente — compteur CLIQUABLE par mission »), 03 M3 (« liste
// consolidée des à revoir »), 03 §17.2 (« cliquer sur un item incomplet amène
// directement à l'écran qui le résout »), 03 §33.2 (les quatre états) et
// l'invariant 5 (fuseau de la mission à l'affichage).
//
// ── CE QUE CE FICHIER PROUVE, ET DANS QUEL ORDRE ────────────────────────────
//   A. Les QUATRE états §33.2, chacun atteint avec du contenu PROPRE à cet
//      écran — jamais « `ZoneEtat` est monté ».
//   B. §17.2 : une ligne ne « navigue » pas, elle POSE la session ET la question
//      dans `meta` puis va à l'entretien. Les trois faits sont vérifiés dans la
//      base, pas sur un espion : un `naviguer` appelé sans position mémorisée
//      rouvrirait l'entretien sur la mauvaise question, et l'espion serait vert.
//   C. L'invariant 5 par MUTATION du fuseau : la même date UTC rendue sous deux
//      fuseaux de mission doit donner deux textes DIFFÉRENTS. Une assertion qui
//      se contenterait d'un `toMatch(/\d{2}\/\d{2}/)` passerait aussi bien sur
//      l'heure de l'appareil — c'est-à-dire sur le bug.
//   D. LE ZÉRO, ET SON CHEMIN. A22 a tranché que le compteur à zéro n'est pas un
//      lien mais une phrase, et que l'état vide de CET écran reste dû « pour le
//      cas où le dernier point est levé alors qu'on y est ». Ce chemin-là est
//      joué : la liste est vivante (`useLiveQuery`), le dernier point est levé
//      SOUS l'écran monté, et l'écran doit basculer seul sur son état vide.
//      Sans ce test, la justification du zéro reposerait sur un chemin que
//      personne n'a emprunté.
//   E. Le filtre de mission (`meta['a-revoir:mission']`) et sa sortie.
//
// ── LE HARNAIS ──────────────────────────────────────────────────────────────
// Celui d'`EcranAujourdhui.test.tsx` : base Dexie réelle sur `fake-indexeddb`,
// coffre réel, contexte local installé, seul `useTerrain` simulé pour tenir
// `naviguer` sous espion. Aucune crypto n'est réécrite (09 §5.7) : les charges
// sont chiffrées par le coffre de production, et c'est ce qui rend l'assertion
// sur le texte figé de la question (`questionTextSnapshot`) non triviale.
//
// ── CE QUE J'AI MESURÉ EN ÉCRIVANT CE FICHIER, ET QUE JE NE CORRIGE PAS ─────
// Le cas D a d'abord été écrit « le drapeau est levé SOUS l'écran monté, la
// liste doit se vider seule » — `useLiveQuery` le promet. Mesuré : elle ne se
// vide pas, même après cinq secondes, alors que la ligne en base porte bien
// `flagReview: 0`. Cause isolée par réduction (deux `liveQuery` nus, l'un avec
// et l'autre sans) : **un `await` NON-Dexie — ici le déchiffrement WebCrypto —
// placé AVANT une lecture de table fait perdre à Dexie le suivi des tables lues
// ENSUITE**. Le premier résultat sort, aucun autre ne suit.
//
// Ce n'est PAS un défaut de NB-15 : `construireARevoir` déchiffre les missions
// (`lireMissionsLocales`) avant de lire `answers`, exactement comme
// `construireJournee` le fait depuis L5c — le cockpit a le même comportement, et
// le commentaire d'`EcranAujourdhui.tsx` (« le cockpit se rafraîchit quand la
// base bouge ») est contredit par la mesure. Sans écriture d'arrière-plan, rien
// ne se voit en L5 ; le pull delta de L6b en fera un défaut visible.
// Constat rendu à A22 / A20 (09 §5.6) — aucun code de production touché ici, et
// le cas D est joué au niveau où il est VRAI : le chemin de production, qui
// démonte et remonte l'écran.
//
// Traçabilité : E12 (entretiens, à-revoir) · E6 (hors ligne total) · E23 (hyper
// intuitif, novice < 30 min) · E44 (grille §33).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { CAPACITES_HORS_LIGNE } from '../../app/capacites-hors-ligne.js';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import {
  contexteLocal,
  installerContexteLocal,
  retirerContexteLocal,
} from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { lireQuestionCourante, lireSessionCourante } from '../../session/position.js';
import { EcranARevoir } from './EcranARevoir.js';

// -----------------------------------------------------------------------------
// Fixture — fictive (invariant 2). Deux missions, DEUX FUSEAUX : c'est le fuseau
// qui rend l'invariant 5 falsifiable, et deux missions qui rendent le filtre
// vérifiable. Kiritimati (UTC+14) et Honolulu (UTC-10) encadrent l'appareil.
// -----------------------------------------------------------------------------
const INSTANT = '2026-09-05T12:00:00.000Z';
/** 23 h 40 UTC : à Kiritimati on est DÉJÀ le 6, à Honolulu ENCORE le 5. */
const POSE_LE = '2026-09-05T23:40:00.000Z';

const MISSION_EST = '0191e2a0-0000-7000-8000-0000000a4e01';
const MISSION_OUEST = '0191e2a0-0000-7000-8000-0000000a4002';
const UNITE_EST = '0191e2a0-0000-7000-8000-0000000a4c01';
const UNITE_OUEST = '0191e2a0-0000-7000-8000-0000000a4c02';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000a4e99';
const Q_UN = '0191e2a0-0000-7000-8000-0000000a4901';
const Q_DEUX = '0191e2a0-0000-7000-8000-0000000a4902';

const TITRE_EST = 'Est — mission fictive FIL-TPE';
const TITRE_OUEST = 'Ouest — mission fictive FIL-GC';
const QUESTION_UN = 'Les habilitations sont-elles revues à date fixe ?';
const QUESTION_DEUX = 'Qui valide une dépense hors budget ?';
const MOTIF = 'à confirmer avec le responsable des accès';

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

function missionDescendue(id: string, titre: string, timezone: string) {
  return {
    table: 'missions' as const,
    index: { id, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
    charge: {
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000000cccc',
      timezone,
      auditLevel: 'standard',
      geoScope: 'multi_pays' as const,
      countryCode: 'KI',
      startPlanned: null,
      endPlanned: null,
      roleSurMission: 'auditeur',
    },
  };
}

function uniteDescendue(id: string, missionId: string, name: string) {
  return {
    table: 'orgUnits' as const,
    index: {
      id,
      missionId,
      parentId: null,
      kind: 'service' as const,
      status: 'active' as const,
      position: 1,
      clientUpdatedAt: INSTANT,
      supprimeLe: null,
    },
    charge: {
      name,
      countryCode: null,
      timezone: null,
      headcount: 5,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: null,
      mergedIntoId: null,
      clientCreatedAt: INSTANT,
    },
  };
}

/** Une session terminée, porteuse des points — nommée, pour être reconnue. */
async function semerSession(
  missionId: string,
  orgUnitId: string,
  personName: string | null,
): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId,
    action: 'upsert',
    index: {
      orgUnitId,
      kind: 'entretien',
      status: 'termine',
      scheduleStatus: 'planifie',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site' as const,
      personName,
      personRole: 'Fonction fictive',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: INSTANT,
      endedAt: INSTANT,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
  return id;
}

interface OptionsPoint {
  readonly missionId: string;
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly question: string;
  readonly motif?: string | null;
  readonly poseLe?: string;
  readonly flag?: 0 | 1;
}

/** Une réponse, drapeau « à revoir » posé (ou levé). Rend son identifiant. */
async function semerPoint(options: OptionsPoint): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: options.missionId,
    action: 'upsert',
    index: {
      interviewId: options.interviewId,
      missionQuestionId: options.missionQuestionId,
      flagReview: options.flag ?? 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'scale_1_5' as const, v: 2 },
      note: null,
      reviewReason: options.motif === undefined ? MOTIF : options.motif,
      naReason: null,
      withheldReason: null,
      source: 'entretien' as const,
      questionTextSnapshot: options.question,
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
  // `ecrireLocal` horodate lui-même, avec l'horloge corrigée du serveur
  // (`local/horloge.ts`), et c'est bien ainsi : le port ne se laisse pas dicter
  // son en-tête. Le test, lui, a besoin d'un instant CHOISI — c'est lui qui rend
  // l'invariant 5 falsifiable. La seule clé d'index concernée est donc reposée
  // APRÈS coup, en clair : aucune charge chiffrée n'est touchée, aucune crypto
  // n'est réécrite (09 §5.7).
  await contexteLocal().base.answers.update(id, {
    clientUpdatedAt: options.poseLe ?? POSE_LE,
  });
  return id;
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-a-revoir-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/** Fait échouer TOUTE lecture d'`answers` : la panne locale que l'écran doit dire. */
async function baseDontLesReponsesEchouent(): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'panne-lecture-answers',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== 'answers') return table;
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

async function installer(base: BaseLocale): Promise<void> {
  installerContexteLocal({ base, coffre: await ouvrirCoffre(kek, await creerDekEnveloppee(kek)) });
}

/** Deux missions embarquées, deux fuseaux opposés, une unité chacune. */
async function embarquerDeuxMissions(base: BaseLocale): Promise<void> {
  await installer(base);
  await appliquerDescente({
    missionId: MISSION_EST,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      missionDescendue(MISSION_EST, TITRE_EST, 'Pacific/Kiritimati'),
      missionDescendue(MISSION_OUEST, TITRE_OUEST, 'Pacific/Honolulu'),
      uniteDescendue(UNITE_EST, MISSION_EST, 'Service fictif Est'),
      uniteDescendue(UNITE_OUEST, MISSION_OUEST, 'Service fictif Ouest'),
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_EST), INSTANT);
  await ecrireMeta(base, cleEmbarquement(MISSION_OUEST), INSTANT);
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
    navigation: { pile: ['aujourdhui', 'aRevoir'] },
    vue: 'aRevoir',
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

function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

async function attendreLecture(): Promise<void> {
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

/** Les lignes de la liste, dans l'ordre du DOM — l'ordre EST une assertion. */
function lignes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button.axn-journee__session')];
}

/** La carte d'une mission, par son titre. */
function carte(titre: string): HTMLElement {
  return requis(
    screen.getByRole('heading', { name: titre }).closest<HTMLElement>('.axn-journee__carte'),
    `carte « ${titre} »`,
  );
}

function reglerEnLigne(valeur: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valeur });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(41), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  Reflect.deleteProperty(navigator, 'onLine');
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LES QUATRE ÉTATS (03 §33.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranARevoir — état CHARGEMENT', () => {
  it('avant la lecture locale : un squelette occupé, jamais un écran blanc ni une alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    // Le squelette dit ce qu'il CHARGE. Le titre de l'écran, lui, est rendu de
    // toute façon : le lire ne prouverait rien.
    expect(document.body.textContent).toMatch(/lecture des points à revoir/i);
    await attendreLecture();
  });
});

describe('EcranARevoir — état VIDE', () => {
  it('@critique aucun point : le titre le dit, ET l’écran dit COMMENT on en pose un (§17.6)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Aucun point à revoir')).toBeTruthy();
    // §17.6 : un état vide dit QUOI FAIRE. Ici : le geste qui pose un point.
    expect(document.body.textContent).toMatch(/bouton « À revoir »/);
    // …et il offre une sortie qui MÈNE quelque part.
    fireEvent.click(screen.getByRole('button', { name: /revenir à ma journée/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'racine', vue: 'aujourdhui' });
    expect(lignes()).toHaveLength(0);
  });
});

describe('EcranARevoir — état ERREUR', () => {
  it('@critique si la lecture locale REJETTE : cause + action en français, et l’écran ne tombe pas', async () => {
    const base = await baseDontLesReponsesEchouent();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    const texte = document.body.textContent;
    expect(texte).toMatch(/n’ont pas pu être lus/i);
    // La CAUSE et l'ACTION, toutes deux — c'est la règle du §33.2, pas un titre.
    expect(texte).toMatch(/données locales de cet appareil/i);
    expect(texte).toMatch(/rechargez la page/i);
    // 11 §2 : aucune cause technique brute n'atteint l'écran.
    expect(texte).not.toMatch(/panne injectée|DexieError|Error:/);
    expect(lignes()).toHaveLength(0);
  });
});

describe('EcranARevoir — état HORS LIGNE (le 4ᵉ, et le mode NOMINAL du terrain)', () => {
  it('@critique réseau coupé : le rappel des capacités locales, RECOPIÉ du registre', async () => {
    reglerEnLigne(false);
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    // Le marqueur vient du REGISTRE (`capacites-hors-ligne.ts`), jamais d'un
    // texte recopié ici : une capacité reformulée dans le registre doit faire
    // rougir ce test, pas glisser en silence.
    for (const capacite of CAPACITES_HORS_LIGNE.aRevoir) {
      expect(screen.getByText(capacite)).toBeTruthy();
    }
    // Anti-vacuité du 4ᵉ état : la liste reste RENDUE réseau coupé (invariant 1).
    expect(lignes()).toHaveLength(1);
  });

  it('en ligne, le rappel ne s’affiche pas — un écran qui le peint toujours ne dit plus rien', async () => {
    reglerEnLigne(true);
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();
    const premiere = requis(CAPACITES_HORS_LIGNE.aRevoir[0], 'première capacité');
    expect(screen.queryByText(premiere)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. §17.2 — « cliquer sur un item amène directement à l'écran qui le résout »
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranARevoir — une ligne rouvre l’entretien SUR la question (03 §17.2)', () => {
  it('@critique la session ET la question sont mémorisées dans `meta` AVANT la navigation', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    // Une position ANTÉRIEURE, sur une autre question : sans elle, un écran qui
    // n'écrirait RIEN passerait le test par la valeur par défaut.
    await ecrireMeta(base, CLES_META.missionARevoir, MISSION_EST);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    fireEvent.click(requis(lignes()[0], 'ligne du point'));

    await waitFor(async () => {
      expect(await lireSessionCourante(base)).toBe(session);
    });
    expect(await lireQuestionCourante(base, session)).toBe(Q_UN);
    await waitFor(() => {
      expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'entretien' });
    });
  });

  it('@critique la ligne PORTE ce qu’il faut pour décider : question figée, session, motif', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    const ligne = requis(lignes()[0], 'ligne du point');
    // Le texte FIGÉ de la question vit dans une charge CHIFFRÉE : le lire prouve
    // que le coffre s'est ouvert, ce qu'aucun contrôle de titre ne prouverait.
    expect(ligne.textContent).toContain(QUESTION_UN);
    expect(ligne.textContent).toContain('Personne fictive Est');
    expect(ligne.textContent).toContain(MOTIF);
  });

  it('un point sans motif dit « Aucun motif saisi » plutôt que de laisser un blanc', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
      motif: null,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();
    expect(requis(lignes()[0], 'ligne').textContent).toContain('Aucun motif saisi');
  });

  it('une session absente de cet appareil ne rend pas un identifiant à l’écran (§17.4)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const fantome = uuidv7();
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: fantome,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();
    const ligne = requis(lignes()[0], 'ligne');
    expect(ligne.textContent).toContain('Session introuvable sur cet appareil');
    expect(ligne.textContent).not.toContain(fantome);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. INVARIANT 5 — la date est au fuseau DE LA MISSION, éprouvé par mutation
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranARevoir — invariant 5 : les dates au fuseau de la MISSION', () => {
  it('@critique le même instant UTC, sous deux missions de fuseaux opposés, donne deux dates DIFFÉRENTES', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const sessionEst = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const sessionOuest = await semerSession(MISSION_OUEST, UNITE_OUEST, 'Personne fictive Ouest');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: sessionEst,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    await semerPoint({
      missionId: MISSION_OUEST,
      interviewId: sessionOuest,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    const est = within(carte(TITRE_EST)).getByText(/signalé le/).textContent;
    const ouest = within(carte(TITRE_OUEST)).getByText(/signalé le/).textContent;

    // La mutation : mêmes octets en base, deux fuseaux de mission, deux textes.
    // Un écran qui formaterait à l'heure de l'APPAREIL rendrait les deux égaux.
    expect(est).not.toBe(ouest);
    // Et le sens du décalage est le bon : 23 h 40 UTC, c'est déjà le 6 à
    // Kiritimati (UTC+14) et encore le 5 à Honolulu (UTC-10).
    expect(est).toContain('06/09/2026');
    expect(ouest).toContain('05/09/2026');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. LE ZÉRO — et le chemin par lequel on l'atteint quand même
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranARevoir — le dernier point levé, et le retour sur la liste', () => {
  /**
   * LE CHEMIN RÉEL, ET POURQUOI C'EST CELUI-LÀ QU'ON JOUE.
   *
   * A22 justifie le compteur non cliquable à zéro par l'existence d'un autre
   * chemin vers l'état vide : « on l'atteint en levant le dernier point alors
   * qu'on y est déjà ». Ce chemin est EXACTEMENT celui-ci, et il passe par
   * l'entretien : la liste ne porte aucun geste de levée — taper une ligne ouvre
   * l'entretien (§17.2), c'est là que le drapeau se baisse, et le retour
   * REMONTE la vue (`app/navigation.ts` dépile, React démonte puis remonte).
   *
   * Le démontage/remontage est donc REJOUÉ ici, et ce n'est pas une commodité de
   * test : c'est le geste de production. Ce qui est prouvé, c'est que l'écran ne
   * garde AUCUN état de son passage précédent — ni la liste, ni le filtre — et
   * qu'il rend l'état vide que sa justification lui suppose.
   */
  it('@critique le drapeau levé dans l’entretien, le retour sur la liste rend l’état vide', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const point = await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    const rendu = render(<EcranARevoir />);
    await attendreLecture();
    expect(lignes()).toHaveLength(1);

    // Le geste de l'entretien : le drapeau est LEVÉ sur la MÊME ligne (même id,
    // révision suivante) — pas de suppression, rien d'écrasé (invariant 7).
    await semerPointLeve(point, session);
    // Anti-vacuité : si la BASE n'avait pas changé, l'écran aurait raison de ne
    // rien changer, et ce test mesurerait le mauvais objet.
    expect((await base.answers.get(point))?.flagReview).toBe(0);

    // Le retour : la vue est dépilée, l'écran remonté.
    rendu.unmount();
    render(<EcranARevoir />);
    await attendreLecture();

    expect(screen.getByText('Aucun point à revoir')).toBeTruthy();
    expect(lignes()).toHaveLength(0);
  });

  /** Réécrit la MÊME réponse, drapeau baissé — ce que fait `DialogueDrapeau`. */
  async function semerPointLeve(id: string, interviewId: string): Promise<void> {
    await ecrireLocal({
      entite: 'answer',
      id,
      missionId: MISSION_EST,
      action: 'upsert',
      index: {
        interviewId,
        missionQuestionId: Q_UN,
        flagReview: 0,
        notApplicable: 0,
        withheld: 0,
        horsParcours: 0,
      },
      charge: {
        value: { type: 'scale_1_5' as const, v: 2 },
        note: null,
        reviewReason: null,
        naReason: null,
        withheldReason: null,
        source: 'entretien' as const,
        questionTextSnapshot: QUESTION_UN,
        revision: 2,
        clientCreatedAt: INSTANT,
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LE FILTRE DE MISSION — le compteur du cockpit est « par mission » (§34.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranARevoir — le filtre de mission posé par le compteur', () => {
  it('@critique une mission mémorisée ⇒ SEULE sa carte est rendue, et l’autre mission ne fuit pas', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const sessionEst = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const sessionOuest = await semerSession(MISSION_OUEST, UNITE_OUEST, 'Personne fictive Ouest');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: sessionEst,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    await semerPoint({
      missionId: MISSION_OUEST,
      interviewId: sessionOuest,
      missionQuestionId: Q_DEUX,
      question: QUESTION_DEUX,
    });
    await ecrireMeta(base, CLES_META.missionARevoir, MISSION_EST);
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    expect(screen.getByRole('heading', { name: TITRE_EST })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: TITRE_OUEST })).toBeNull();
    expect(screen.queryByText(QUESTION_DEUX)).toBeNull();

    // La sortie du filtre : « Voir toutes les missions » ramène les deux cartes.
    fireEvent.click(screen.getByRole('button', { name: 'Voir toutes les missions' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: TITRE_OUEST })).toBeTruthy();
    });
    expect(screen.getByText(QUESTION_DEUX)).toBeTruthy();
  });

  it('aucune mission mémorisée ⇒ TOUTES les missions embarquées, et aucun bouton de sortie de filtre', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const sessionEst = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const sessionOuest = await semerSession(MISSION_OUEST, UNITE_OUEST, 'Personne fictive Ouest');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: sessionEst,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    await semerPoint({
      missionId: MISSION_OUEST,
      interviewId: sessionOuest,
      missionQuestionId: Q_DEUX,
      question: QUESTION_DEUX,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    expect(screen.getByRole('heading', { name: TITRE_EST })).toBeTruthy();
    expect(screen.getByRole('heading', { name: TITRE_OUEST })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Voir toutes les missions' })).toBeNull();
  });

  it('chaque carte compte SES propres points, jamais le total (invariant 6)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const sessionEst = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const sessionOuest = await semerSession(MISSION_OUEST, UNITE_OUEST, 'Personne fictive Ouest');
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: sessionEst,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    await semerPoint({
      missionId: MISSION_EST,
      interviewId: sessionEst,
      missionQuestionId: Q_DEUX,
      question: QUESTION_DEUX,
    });
    await semerPoint({
      missionId: MISSION_OUEST,
      interviewId: sessionOuest,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();

    expect(within(carte(TITRE_EST)).getByText('2 point(s) à revoir')).toBeTruthy();
    expect(within(carte(TITRE_OUEST)).getByText('1 point(s) à revoir')).toBeTruthy();
    expect(within(carte(TITRE_EST)).getAllByRole('button')).toHaveLength(2);
  });

  it('une réponse SUPPRIMÉE ne compte plus — rien n’est jamais ressuscité par une liste', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession(MISSION_EST, UNITE_EST, 'Personne fictive Est');
    const point = await semerPoint({
      missionId: MISSION_EST,
      interviewId: session,
      missionQuestionId: Q_UN,
      question: QUESTION_UN,
    });
    await base.answers.update(point, { supprimeLe: INSTANT });
    terrain = terrainDeBase(base);
    render(<EcranARevoir />);
    await attendreLecture();
    expect(screen.getByText('Aucun point à revoir')).toBeTruthy();
  });
});
