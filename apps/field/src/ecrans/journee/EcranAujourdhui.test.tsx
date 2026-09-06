// =============================================================================
// LE COCKPIT « AUJOURD'HUI » — lot L5, incrément L5c. Écrit par A27 (09 §5.6 :
// A23 a écrit l'écran, il ne lit pas ceci), depuis 03 §34.2 (cockpit 100 % local,
// V2.10 : session planifiée démarrée en UN tap, « Fin de journée », rappel
// discret), 03 §33.2 (les quatre états, PROUVÉS écran par écran), 03 §33.7
// (journée terrain simulée) et `LOT_L5.md` §3.6 (aucune pastille ne verdit
// sans serveur).
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. Les QUATRE états, chacun ATTEINT avec un contenu propre à cet écran —
//      pas seulement « `ZoneEtat` est monté » (réserve R-L7a-5, même défaut).
//   B. L'agrégation §34.2 : sessions du jour toutes missions confondues, à-revoir
//      par mission, sync par mission, alertes calculées localement.
//   C. LE TRI APRÈS LE MÉLANGE des missions — testé côté domaine par A23, ici
//      côté RENDU : c'est l'ordre des lignes dans le DOM qui compte.
//   D. « Session planifiée démarrée en UN tap » (§33.7) : un clic, la session
//      courante est mémorisée, la navigation part vers l'entretien — et le
//      cockpit ne porte AUCUN champ de saisie.
//   E. Le port inerte ne ment pas : aucune pastille « synchronisé ».
//
// ── LE HARNAIS ───────────────────────────────────────────────────────────────
// Le même que `app/EcranAccueil.test.tsx` (A26) : base Dexie RÉELLE sur
// `fake-indexeddb`, coffre réel, contexte local installé ; seul `useTerrain` est
// simulé, pour tenir `naviguer` sous espion. L'horloge de l'application est
// FIXÉE par `appliquerDescente` (`serverTime`) — les sessions « du jour » le
// sont donc par construction, pas par la chance de l'heure d'exécution.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min) · E6 (hors ligne total)
// · E38 (sauvegarde terrain, invariant 8) · E44 (UX/UI 2026-2027 : tokens, police locale).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import type { TypeDeSession } from '../../local/formes.js';
import { lireSessionCourante } from '../../session/position.js';
import { EcranAujourdhui } from './EcranAujourdhui.js';

// -----------------------------------------------------------------------------
// Fixture — fictive (invariant 2). Deux missions pour éprouver l'agrégation.
// -----------------------------------------------------------------------------
/** L'instant « serveur » qui fixe l'horloge de l'application : midi UTC. */
const INSTANT = '2026-09-05T12:00:00.000Z';
const MISSION_ALPHA = '0191e2a0-0000-7000-8000-00000000f5a1';
const MISSION_BRAVO = '0191e2a0-0000-7000-8000-00000000f5b2';
const UNITE_ALPHA = '0191e2a0-0000-7000-8000-00000000c5a1';
const UNITE_BRAVO = '0191e2a0-0000-7000-8000-00000000c5b2';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const QUESTION_ID = '0191e2a0-0000-7000-8000-000000000501';

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

function missionDescendue(id: string, titre: string, auditLevel = 'standard') {
  return {
    table: 'missions' as const,
    index: { id, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
    charge: {
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000000cccc',
      timezone: 'Europe/Paris',
      auditLevel,
      geoScope: 'france' as const,
      countryCode: 'FR',
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

interface OptionsSession {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly kind?: TypeDeSession;
  readonly status?: 'non_demarre' | 'en_cours' | 'termine';
  readonly scheduledAt?: string | null;
  readonly personName?: string | null;
  readonly personRole?: string | null;
  readonly startedAt?: string | null;
  readonly valideeLe?: string | null;
}

/** Sème une session ; rend son identifiant (UUID v7, comme sur l'appareil). */
async function semerSession(options: OptionsSession): Promise<string> {
  const id = uuidv7();
  const status = options.status ?? 'non_demarre';
  const scheduledAt = options.scheduledAt === undefined ? null : options.scheduledAt;
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: options.missionId,
    action: 'upsert',
    index: {
      orgUnitId: options.orgUnitId,
      kind: options.kind ?? 'entretien',
      status,
      scheduleStatus: scheduledAt === null ? 'a_planifier' : 'planifie',
      scheduledAt,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: (options.kind ?? 'entretien') === 'entretien' ? ('sur_site' as const) : null,
      personName: options.personName === undefined ? 'Interlocuteur fictif' : options.personName,
      personRole: options.personRole === undefined ? 'Fonction fictive' : options.personRole,
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: status !== 'non_demarre',
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: options.startedAt ?? (status === 'non_demarre' ? null : INSTANT),
      endedAt: status === 'termine' ? INSTANT : null,
      valideeLe: options.valideeLe ?? null,
      clientCreatedAt: INSTANT,
    },
  });
  return id;
}

/** Une réponse À REVOIR sur une session : ce qui alimente le compteur §34.2. */
async function semerAReVoir(missionId: string, interviewId: string): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId,
    action: 'upsert',
    index: {
      interviewId,
      missionQuestionId: QUESTION_ID,
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'scale_1_5', v: 2 },
      note: null,
      reviewReason: 'à confirmer avec le responsable',
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-aujourdhui-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/** Fait échouer TOUTE lecture de `missions` : la panne locale que l'écran doit attraper. */
async function baseDontLesLecturesEchouent(): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'panne-lecture-missions',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== 'missions') return table;
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

async function installer(base: BaseLocale): Promise<Coffre> {
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return coffre;
}

/** Deux missions embarquées, une unité chacune — et l'horloge fixée à `INSTANT`. */
async function embarquerDeuxMissions(base: BaseLocale): Promise<void> {
  await installer(base);
  await appliquerDescente({
    missionId: MISSION_ALPHA,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      missionDescendue(MISSION_ALPHA, 'Alpha — mission fictive FIL-TPE'),
      missionDescendue(MISSION_BRAVO, 'Bravo — mission fictive FIL-GC'),
      uniteDescendue(UNITE_ALPHA, MISSION_ALPHA, 'Service fictif Alpha'),
      uniteDescendue(UNITE_BRAVO, MISSION_BRAVO, 'Service fictif Bravo'),
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ALPHA), INSTANT);
  await ecrireMeta(base, cleEmbarquement(MISSION_BRAVO), INSTANT);
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
    navigation: { pile: ['aujourdhui'] },
    vue: 'aujourdhui',
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

/** Ce que le harnais exige d'avoir : lève avec un message clair plutôt qu'un `!`. */
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

/** Les lignes de la liste « Vos sessions du jour », dans l'ordre du DOM. */
function lignesDeSessions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button.axn-journee__session')];
}

/** La carte d'une mission (section ④ du cockpit), par son titre. */
function carte(titre: RegExp): HTMLElement {
  return requis(
    screen.getByRole('heading', { name: titre }).closest<HTMLElement>('.axn-journee__carte'),
    'carte de mission',
  );
}

function reglerEnLigne(valeur: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valeur });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(27), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  Reflect.deleteProperty(navigator, 'onLine');
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LES QUATRE ÉTATS (03 §33.2) — atteints, avec le contenu de CET écran
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAujourdhui — état CHARGEMENT', () => {
  it('avant la lecture locale : un squelette occupé, jamais un écran blanc ni une alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    // Le squelette dit ce qu'il charge — un libellé de CET écran, pas un générique.
    expect(document.body.textContent).toMatch(/journée/i);
    await attendreLecture();
  });
});

describe('EcranAujourdhui — état VIDE', () => {
  it('@critique aucune session aujourd’hui ⇒ le titre le dit ET les deux gestes possibles sont offerts (§17.6)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).toMatch(/aucune session prévue aujourd’hui/i);
    // 03 §17.6 : dire QUOI FAIRE. Les deux actions mènent bien quelque part.
    fireEvent.click(
      requis(screen.getAllByRole('button', { name: /ouvrir l’agenda/i })[0], 'bouton agenda'),
    );
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'agenda' });
    fireEvent.click(
      requis(
        screen.getAllByRole('button', { name: /nouvel entretien/i })[0],
        'bouton nouvel entretien',
      ),
    );
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'nouvelEntretien' });
  });

  it('l’état vide ne cache PAS l’état des missions : les deux cartes de mission restent visibles', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();
    expect(screen.getByRole('heading', { name: /Alpha — mission fictive/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Bravo — mission fictive/ })).toBeTruthy();
  });
});

describe('EcranAujourdhui — état ERREUR', () => {
  it('@critique si la lecture locale REJETTE, une erreur en français (cause + action) — et l’écran ne tombe pas', async () => {
    const base = await baseDontLesLecturesEchouent();
    await installer(base);
    terrain = terrainDeBase(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<EcranAujourdhui />);
      const alerte = await screen.findByRole('alert');
      // Cause ET action, en français (03 §33.2) — spécifiques à cet écran.
      expect(alerte.textContent).toMatch(/votre journée n’a pas pu être lue/i);
      expect(alerte.textContent).toMatch(/données locales/i);
      expect(alerte.textContent).toMatch(/rechargez|sauvegarde de secours/i);
      // Et aucun contenu nominal ne s'affiche à côté d'une erreur de lecture.
      expect(lignesDeSessions()).toEqual([]);
    } finally {
      silence.mockRestore();
    }
  });
});

describe('EcranAujourdhui — état HORS LIGNE', () => {
  it('@critique hors réseau : une pastille de statut (jamais une alerte) rappelle les capacités locales, et le contenu reste ENTIER', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      scheduledAt: '2026-09-05T09:00:00.000Z',
      personName: 'Personne hors ligne',
    });
    reglerEnLigne(false);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    // Hors ligne n'est pas une panne (invariant 1) : `role="status"`, pas `alert`.
    // Ciblé sur l'ÉTAT hors ligne (`EtatHorsLigne`, qui liste les capacités) —
    // pas sur la `PastilleSync` de chaque mission, qui dit aussi « Hors ligne ».
    const horsLigne = [...document.querySelectorAll<HTMLElement>('.axn-etat[role="status"]')].find(
      (s) => s.querySelector('.axn-etat__capacites') !== null,
    );
    expect(horsLigne, 'l’état hors ligne doit être rendu, avec ses capacités').toBeDefined();
    const capacites = within(requis(horsLigne, 'état hors ligne')).getAllByRole('listitem');
    expect(capacites.length).toBeGreaterThanOrEqual(3);
    expect(capacites.map((c) => c.textContent).join(' ')).toMatch(/sauvegarde de secours/i);
    // L'absence de réseau n'a déclenché AUCUNE alerte : celles qui existent sont
    // celles de l'invariant 8 (file non vide, jamais synchronisé), pas « hors ligne ».
    for (const alerte of screen.queryAllByRole('alert')) {
      expect(alerte.textContent).not.toMatch(/hors ligne|sans réseau/i);
    }
    // Le contenu nominal est là : la session du jour est bien listée.
    expect(
      lignesDeSessions()
        .map((l) => l.textContent)
        .join(' '),
    ).toMatch(/Personne hors ligne/);
  });

  it('contrôle d’anti-vacuité : EN LIGNE, aucune liste de capacités hors ligne n’est rendue', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    reglerEnLigne(true);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();
    expect(document.body.textContent).not.toMatch(/Exporter une sauvegarde de secours chiffrée/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. L'AGRÉGATION DU §34.2 — toutes missions confondues, calculée localement
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAujourdhui — cockpit §34.2', () => {
  it('@critique chaque session du jour porte heure LOCALE DU SITE, personne, fonction et type', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      kind: 'observation',
      scheduledAt: '2026-09-05T09:00:00.000Z',
      personName: 'Camille Fictive',
      personRole: 'Cheffe d’atelier',
    });
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const [ligne] = lignesDeSessions();
    expect(ligne).toBeDefined();
    const texte = ligne?.textContent ?? '';
    // 09:00 UTC = 11:00 à Paris (fuseau de la mission, 03 §22.2), jamais l'UTC brut.
    expect(texte).toMatch(/11:00/);
    expect(texte).not.toMatch(/09:00/);
    expect(texte).toMatch(/Camille Fictive/);
    expect(texte).toMatch(/Cheffe d’atelier/);
    expect(texte).toMatch(/Observation de poste/);
  });

  it('@critique les à-revoir sont comptés PAR MISSION, et le compte est celui des lignes locales', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const session = await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      status: 'termine',
      scheduledAt: '2026-09-05T09:00:00.000Z',
    });
    await semerAReVoir(MISSION_ALPHA, session);
    await semerAReVoir(MISSION_ALPHA, session);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const carteAlpha = carte(/Alpha — mission fictive/);
    const carteBravo = carte(/Bravo — mission fictive/);
    expect(carteAlpha.textContent).toMatch(/2 point\(s\) à revoir/);
    expect(carteBravo.textContent).toMatch(/0 point\(s\) à revoir/);
    // Et l'alerte personnelle correspondante est là, calculée localement.
    expect(document.body.textContent).toMatch(/2 point\(s\) à revoir attendent/);
  });

  it('@critique l’état de sync par mission ne VERDIT JAMAIS sans serveur, et le compte en attente est VRAI (LOT_L5.md §3.6)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    // Trois écritures locales sur Alpha = trois opérations dans la file.
    const s = await semerSession({ missionId: MISSION_ALPHA, orgUnitId: UNITE_ALPHA });
    await semerAReVoir(MISSION_ALPHA, s);
    await semerAReVoir(MISSION_ALPHA, s);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const pastilles = document.querySelectorAll('.axn-pastille-sync');
    expect(pastilles.length).toBe(2);
    for (const pastille of pastilles) {
      expect(pastille.textContent).not.toMatch(/synchronis[ée]e?\b|à jour/i);
    }
    const carteAlpha = carte(/Alpha — mission fictive/);
    expect(carteAlpha.textContent).toMatch(/3 élément\(s\) à remonter/);
    expect(carteAlpha.textContent).toMatch(/n’est pas encore disponible/);
    // Et l'alerte de l'invariant 8 (jamais synchronisé + file non vide) interrompt.
    const alertes = screen.getAllByRole('alert');
    expect(alertes.map((a) => a.textContent).join(' ')).toMatch(/aucune synchronisation connue/i);
  });

  it('« Où en est cette mission ? » mène au pilote, « Fin de journée » au rituel', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();
    fireEvent.click(
      requis(
        screen.getAllByRole('button', { name: /où en est cette mission/i })[0],
        'bouton pilote',
      ),
    );
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'pilote' });
    fireEvent.click(screen.getByRole('button', { name: /^fin de journée$/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'finDeJournee' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LE TRI APRÈS LE MÉLANGE — côté RENDU
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAujourdhui — tri des sessions après le mélange des missions', () => {
  // 03 §34.2 : « ses sessions du jour (agenda §25.2 AGRÉGÉ) » ; `agenda/jour.ts`
  // trie `sessionsDuJour` APRÈS le mélange, et son en-tête dit pourquoi : « sans
  // quoi les sessions seraient triées mission par mission et l'auditeur lirait
  // deux fois sa matinée ». A23 l'a prouvé côté domaine. Ce test le mesure côté
  // RENDU. S'il rougit, c'est que l'écran n'itère pas `journee.sessionsDuJour`
  // mais chaque mission tour à tour — constaté, remonté, PAS corrigé ici.
  it('@critique les lignes sont dans l’ordre de l’HEURE, pas mission par mission ; les non planifiées ferment la liste', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    // Alpha (première par titre) a la session la plus TARDIVE ; Bravo la plus tôt.
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      scheduledAt: '2026-09-05T10:00:00.000Z',
      personName: 'Tardive Alpha',
    });
    await semerSession({
      missionId: MISSION_BRAVO,
      orgUnitId: UNITE_BRAVO,
      scheduledAt: '2026-09-05T08:30:00.000Z',
      personName: 'Matinale Bravo',
    });
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      scheduledAt: '2026-09-05T09:15:00.000Z',
      personName: 'Milieu Alpha',
    });
    // En cours, SANS créneau : « du jour » par son statut, et rangée en dernier.
    await semerSession({
      missionId: MISSION_BRAVO,
      orgUnitId: UNITE_BRAVO,
      status: 'en_cours',
      scheduledAt: null,
      personName: 'Imprévue Bravo',
    });
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const personnes = lignesDeSessions().map(
      (l) => l.querySelector('.axn-journee__personne')?.textContent ?? '',
    );
    expect(personnes).toEqual([
      'Matinale Bravo',
      'Milieu Alpha',
      'Tardive Alpha',
      'Imprévue Bravo',
    ]);

    // Anti-vacuité : les CARTES de mission, elles, sont bien Alpha puis Bravo —
    // si la liste suivait cet ordre, « Tardive Alpha » serait première.
    const titres = [...document.querySelectorAll('.axn-journee__titre-carte')].map(
      (t) => t.textContent,
    );
    const iAlpha = titres.findIndex((t) => t.includes('Alpha — mission'));
    const iBravo = titres.findIndex((t) => t.includes('Bravo — mission'));
    expect(iAlpha).toBeGreaterThanOrEqual(0);
    expect(iAlpha).toBeLessThan(iBravo);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. LA JOURNÉE TERRAIN SIMULÉE (03 §33.7) — le geste d'UN tap
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAujourdhui — session planifiée démarrée en UN tap (§34.2-1, §33.7)', () => {
  it('@critique UN clic sur la session planifiée : elle devient la session courante et la navigation part vers l’entretien — zéro champ à ressaisir sur le cockpit', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const id = await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      scheduledAt: '2026-09-05T09:00:00.000Z',
      personName: 'Planifiée Fictive',
      personRole: 'Responsable fictif',
    });
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    // Le cockpit ne demande RIEN : aucune saisie n'y vit (« zéro champ à ressaisir »).
    expect(document.querySelectorAll('input, textarea, select').length).toBe(0);

    const [ligne] = lignesDeSessions();
    expect(ligne?.textContent).toMatch(/Planifiée Fictive/);
    await act(async () => {
      fireEvent.click(requis(ligne, 'ligne de session'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'entretien' });
    });
    expect(await lireSessionCourante(base)).toBe(id);
    expect(terrain.naviguer).toHaveBeenCalledTimes(1);
  });

  it('@critique une session EN COURS offre « Reprendre là où vous vous êtes arrêté » ET une alerte « session commencée » qui la rouvre', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const id = await semerSession({
      missionId: MISSION_BRAVO,
      orgUnitId: UNITE_BRAVO,
      status: 'en_cours',
      scheduledAt: '2026-09-05T09:00:00.000Z',
      personName: 'Reprise Fictive',
    });
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    expect(document.body.textContent).toMatch(/Reprendre là où vous vous êtes arrêté/);
    expect(document.body.textContent).toMatch(/Reprise Fictive/);
    const statuts = screen.getAllByRole('status').map((s) => s.textContent);
    expect(statuts.join(' ')).toMatch(/commencée et n’a pas été terminée/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^reprendre la session$/i }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'entretien' });
    });
    expect(await lireSessionCourante(base)).toBe(id);
  });

  it('une session TERMINÉE non validée est marquée « à valider », une validée « Validée » — terminer ≠ valider se VOIT (§19.1)', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      status: 'termine',
      scheduledAt: '2026-09-05T09:00:00.000Z',
      personName: 'Terminée Fictive',
    });
    await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      status: 'termine',
      scheduledAt: '2026-09-05T10:00:00.000Z',
      personName: 'Validée Fictive',
      valideeLe: INSTANT,
    });
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    const [terminee, validee] = lignesDeSessions();
    expect(terminee?.textContent).toMatch(/Terminée, à valider/);
    expect(terminee?.textContent).not.toMatch(/Validée$/);
    expect(validee?.textContent).toMatch(/Validée/);
    expect(validee?.textContent).not.toMatch(/à valider/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LE RAPPEL DISCRET DU RITUEL (03 §34.2-2)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranAujourdhui — rappel discret tant que le rituel du jour n’est pas fait', () => {
  // 03 §34.2-2, mot pour mot : « rappel discret sur le cockpit tant que le rituel
  // du jour n'est pas fait ». Le domaine le calcule (`rappelFinDeJournee`,
  // `agenda/jour.ts`) ; ce test vérifie que le COCKPIT le rend. S'il rougit,
  // c'est que la fonction est orpheline — constaté à la lecture, remonté au
  // rapport, PAS corrigé ici (09 §5.6).
  it('@critique une file non vide et aucun rituel aujourd’hui ⇒ le cockpit rappelle le rituel de fin de journée', async () => {
    const base = await nouvelleBase();
    await embarquerDeuxMissions(base);
    const s = await semerSession({
      missionId: MISSION_ALPHA,
      orgUnitId: UNITE_ALPHA,
      status: 'termine',
    });
    await semerAReVoir(MISSION_ALPHA, s);
    terrain = terrainDeBase(base);
    render(<EcranAujourdhui />);
    await attendreLecture();

    expect(document.body.textContent).toMatch(/rituel de fin de journée n’a pas encore été fait/i);
  });
});
