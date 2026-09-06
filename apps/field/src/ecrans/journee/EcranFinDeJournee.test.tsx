// =============================================================================
// « FIN DE JOURNÉE » — lot L5, incrément L5c. Écrit par A27 (09 §5.6), depuis
// 03 §34.2-2 (« UN geste = sync forcée + export de secours chiffré + synthèse
// […] validation groupée »), 03 §19.1 V2.10 (terminer ≠ valider ; « une seule
// confirmation, un seul récapitulatif cumulé »), 03 §33.7 (critères P-C :
// « Fin de journée » en un geste, Terminer → note → Valider groupé, aucun
// verrou), `LOT_L5.md` §3.6 (le bouton ne doit pas mentir ; export SANS réseau,
// restaurable sur un second appareil), 11 §4 (format `.axionbackup`) et 07
// ligne L5 (« export de secours créé puis restauré sur un 2e appareil »).
//
// ── LE POINT DE CONCEPTION LE PLUS IMPORTANT DE L'ÉCRAN ──────────────────────
// L'ordre est sync → export → validation, et **un échec n'annule pas les
// suivants**. C'est le filet de l'invariant 8 : c'est quand la sync a échoué
// que la sauvegarde compte. Chaque combinaison d'échec a donc SON test :
//   · sync « indisponible » (port inerte)      → export ✓, validation ✓
//   · sync « echec » (résolu)                  → export ✓, validation ✓
//   · sync qui LÈVE (rejet)                    → export ✓, validation ✓
//   · export qui LÈVE                          → sync dite, validation ✓
//   · mot de passe absent (export non produit) → sync dite, validation ✓
//   · validation qui LÈVE                      → le fichier est DÉJÀ déposé
//
// ── LE HARNAIS ───────────────────────────────────────────────────────────────
// Base Dexie réelle, coffre réel, `useTerrain` simulé. Le PORT DE SYNC est
// remplacé par une porte pilotable (`vi.hoisted`) qui, par défaut, délègue au
// port inerte réel. Le dépôt de fichier (`URL.createObjectURL` + `<a download>`)
// n'existe pas dans jsdom : il est capté, et c'est ce qui permet de RELIRE le
// fichier produit — puis de le restaurer sur un SECOND appareil (base neuve,
// DEK neuve) dans ce même test. L'ORDRE des trois gestes est mesuré par un
// journal : la porte de sync, le dépôt du fichier et une écriture Dexie sur
// `interviews` y inscrivent chacun leur passage.
//
// Traçabilité : E38 (sauvegarde terrain, invariant 8) · E24 (validation) ·
// E6 (hors ligne total) · E44 (UX/UI 2026-2027 : tokens, police locale).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta, lireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import type * as ModulePortSync from '../../local/port-sync.js';
import { fichierSauvegardeSchema } from '../../sauvegarde/format.js';
import { importerSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { terminerSession } from '../../agenda/validation.js';
import { ecrireNotesGenerales } from '../../session/ecriture-session.js';
import { EcranFinDeJournee } from './EcranFinDeJournee.js';

// -----------------------------------------------------------------------------
// La PORTE sur le port de sync — hissée, pilotable, passe-plat par défaut.
// -----------------------------------------------------------------------------

const porte = vi.hoisted(() => ({
  comportement: 'inerte',
  journal: [] as string[],
}));

vi.mock('../../local/port-sync.js', async (importOriginal) => {
  const original = await importOriginal<typeof ModulePortSync>();
  const inerte = original.portSyncInerte;
  const pilote: ModulePortSync.PortSync = {
    etat: (missionId) => inerte.etat(missionId),
    synchroniserMaintenant: async (missionId) => {
      porte.journal.push('sync');
      if (porte.comportement === 'leve') {
        throw new Error('panne réseau injectée — non attrapée par le port');
      }
      if (porte.comportement === 'echec') {
        return {
          statut: 'echec',
          message: 'La synchronisation a échoué : le siège est injoignable.',
          operationsMontees: 0,
          operationsRestantes: null,
        };
      }
      return inerte.synchroniserMaintenant(missionId);
    },
  };
  return { ...original, portSyncInerte: pilote };
});

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

// -----------------------------------------------------------------------------
// Fixture — fictive (invariant 2)
// -----------------------------------------------------------------------------
const INSTANT = '2026-09-05T12:00:00.000Z';
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f5d1';
const MISSION_BIS_ID = '0191e2a0-0000-7000-8000-00000000f5d2';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000000c5d1';
const UNITE_BIS_ID = '0191e2a0-0000-7000-8000-00000000c5d2';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const NOTE_DE_COULOIR = 'Note de couloir fictive, dix minutes après';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-fin-journee-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/**
 * Une base dont certaines tables sont en panne — en LECTURE ou en ÉCRITURE — et
 * dont les écritures sur `interviews` s'inscrivent au journal (mesure d'ordre).
 */
async function baseInstrumentee(options: {
  readonly lecturesEnPanne?: readonly string[];
  readonly ecrituresEnPanne?: readonly string[];
}): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'instrumentation-fin-de-journee',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        const refus = () => Promise.reject(new Error(`panne injectée sur ${nomTable}`));
        const lecturesEnPanne = options.lecturesEnPanne?.includes(nomTable) ?? false;
        const ecrituresEnPanne = options.ecrituresEnPanne?.includes(nomTable) ?? false;
        return {
          ...table,
          ...(lecturesEnPanne
            ? { get: refus, getMany: refus, query: refus, openCursor: refus, count: refus }
            : {}),
          mutate: (demande) => {
            if (nomTable === 'interviews' && demande.type === 'put')
              porte.journal.push('validation');
            if (ecrituresEnPanne && nomTable === 'interviews') return refus();
            return table.mutate(demande);
          },
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

function missionDescendue(id: string, titre: string) {
  return {
    table: 'missions' as const,
    index: { id, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
    charge: {
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000000cccc',
      timezone: 'Europe/Paris',
      auditLevel: 'standard',
      geoScope: 'france' as const,
      countryCode: 'FR',
      startPlanned: null,
      endPlanned: null,
      roleSurMission: 'auditeur',
    },
  };
}

function uniteDescendue(id: string, missionId: string) {
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
      name: 'Service fictif',
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

async function embarquer(base: BaseLocale, missions: readonly (readonly [string, string])[]) {
  await installer(base);
  await appliquerDescente({
    missionId: missions[0]?.[0] ?? MISSION_ID,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: missions.flatMap(([id, unite]) => [
      missionDescendue(
        id,
        id === MISSION_ID ? 'Mission fictive FIL-TPE' : 'Mission fictive FIL-GC',
      ),
      uniteDescendue(unite, id),
    ]),
  });
  for (const [id] of missions) await ecrireMeta(base, cleEmbarquement(id), INSTANT);
}

async function semerSession(options: {
  readonly missionId?: string;
  readonly orgUnitId?: string;
  readonly status: 'en_cours' | 'termine';
  readonly personName: string;
  readonly valideeLe?: string | null;
}): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: options.missionId ?? MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: options.orgUnitId ?? UNITE_ID,
      kind: 'entretien',
      status: options.status,
      scheduleStatus: 'realise',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: options.personName,
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
      endedAt: options.status === 'termine' ? INSTANT : null,
      valideeLe: options.valideeLe ?? null,
      clientCreatedAt: INSTANT,
    },
  });
  return id;
}

function terrainDeBase(base: BaseLocale | null): ValeurTerrain {
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
    navigation: { pile: ['aujourdhui', 'finDeJournee'] },
    vue: 'finDeJournee',
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

async function monter(base: BaseLocale): Promise<void> {
  terrain = terrainDeBase(base);
  render(<EcranFinDeJournee />);
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

// -----------------------------------------------------------------------------
// Le dépôt de fichier, capté. jsdom n'a ni `URL.createObjectURL` ni navigation.
// -----------------------------------------------------------------------------
const fichiersDeposes: { nom: string; contenu: Promise<string> }[] = [];
let blobCourant: Blob | null = null;

beforeAll(async () => {
  kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(30), KDF_TEST);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobCourant = blob;
      porte.journal.push('export');
      return 'blob:axion-test';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  HTMLAnchorElement.prototype.click = function captureDepot(this: HTMLAnchorElement) {
    if (blobCourant !== null && this.download !== '') {
      fichiersDeposes.push({ nom: this.download, contenu: blobCourant.text() });
    }
    blobCourant = null;
  };
}, 20_000);

beforeEach(() => {
  porte.comportement = 'inerte';
  porte.journal.length = 0;
  fichiersDeposes.length = 0;
});

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

function saisirMotDePasse(valeur = MOT_DE_PASSE): void {
  fireEvent.change(screen.getByLabelText(/votre mot de passe/i), { target: { value: valeur } });
}

async function terminerLaJournee(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
    await Promise.resolve();
  });
  await screen.findByRole('heading', { name: /ce qui a été fait/i }, { timeout: 30_000 });
}

/** La carte « Ce qui a été fait », et ses trois messages par titre. */
function resultat(titre: RegExp): string {
  const carte = requis(
    screen
      .getByRole('heading', { name: /ce qui a été fait/i })
      .closest<HTMLElement>('.axn-journee__carte'),
    'carte « Ce qui a été fait »',
  );
  const messages = [...carte.querySelectorAll<HTMLElement>('.axn-message')];
  const message = messages.find((m) =>
    titre.test(m.querySelector('.axn-message__titre')?.textContent ?? ''),
  );
  expect(message, `message « ${titre.source} » absent`).toBeDefined();
  return message?.textContent ?? '';
}

async function sessionsValidees(): Promise<number> {
  const toutes = await depotSessions.duJour({ missionId: MISSION_ID, fuseau: 'Europe/Paris' });
  return toutes.filter((s) => s.valideeLe !== null).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. LES QUATRE ÉTATS
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — état CHARGEMENT', () => {
  it('avant la lecture : squelette occupé, pas de bouton « Terminer la journée », aucune alerte', async () => {
    const base = await nouvelleBase();
    await installer(base);
    terrain = terrainDeBase(base);
    render(<EcranFinDeJournee />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('button', { name: /terminer la journée/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
  });
});

describe('EcranFinDeJournee — état VIDE', () => {
  it('aucune mission ⇒ « Rien à clôturer », et pourquoi ; aucun geste proposé', async () => {
    const base = await nouvelleBase();
    await installer(base);
    await monter(base);
    expect(document.body.textContent).toMatch(/rien à clôturer/i);
    expect(document.body.textContent).toMatch(/aucune mission n’est embarquée/i);
    expect(screen.queryByRole('button', { name: /terminer la journée/i })).toBeNull();
  });
});

describe('EcranFinDeJournee — état ERREUR', () => {
  it('@critique si la lecture locale REJETTE, une erreur en français (cause + action) — l’écran ne tombe pas', async () => {
    const base = await baseInstrumentee({ lecturesEnPanne: ['missions'] });
    await installer(base);
    terrain = terrainDeBase(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<EcranFinDeJournee />);
      const alerte = await screen.findByRole('alert');
      expect(alerte.textContent).toMatch(/synthèse du jour n’a pas pu être lue/i);
      expect(alerte.textContent).toMatch(/rechargez/i);
      expect(screen.queryByRole('button', { name: /terminer la journée/i })).toBeNull();
    } finally {
      silence.mockRestore();
    }
  });
});

describe('EcranFinDeJournee — HORS LIGNE : le rituel ENTIER se joue sans réseau (invariant 1, 11 §4)', () => {
  it('@critique sans réseau : la sync se dit indisponible, la sauvegarde est PRODUITE, les entretiens sont validés', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Terminée Hors Ligne' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      await monter(base);
      saisirMotDePasse();
      await terminerLaJournee();
      expect(resultat(/synchronisation/i)).toMatch(/pas encore disponible/i);
      expect(resultat(/sauvegarde de secours/i)).toMatch(/sauvegarde chiffrée produite/i);
      expect(fichiersDeposes.length).toBe(1);
      expect(await sessionsValidees()).toBe(1);
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  }, 40_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LA SYNTHÈSE ET LA VALIDATION GROUPÉE (03 §19.1 V2.10)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — synthèse du jour', () => {
  it('compte les sessions au programme, les terminées, les à-revoir et les éléments en attente de remontée', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Une' });
    await semerSession({ status: 'en_cours', personName: 'Deux' });
    await monter(base);
    expect(document.body.textContent).toMatch(/2 session\(s\) au programme, 1 terminée\(s\)/);
    expect(document.body.textContent).toMatch(/0 point\(s\) à revoir/);
    // Deux écritures locales = deux opérations en attente, comptées dans la file RÉELLE.
    expect(document.body.textContent).toMatch(/2 élément\(s\) de collecte en attente/);
  });
});

describe('EcranFinDeJournee — terminer ≠ valider, côté écran', () => {
  it('@critique seuls les entretiens TERMINÉS non validés sont proposés, TOUS cochés par défaut ; en cours et déjà validés ne le sont pas', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Terminée Une' });
    await semerSession({ status: 'termine', personName: 'Terminée Deux' });
    await semerSession({ status: 'en_cours', personName: 'Encore En Cours' });
    await semerSession({ status: 'termine', personName: 'Déjà Validée', valideeLe: INSTANT });
    await monter(base);

    const cases = screen.getAllByRole<HTMLInputElement>('checkbox');
    expect(cases.length).toBe(2);
    expect(cases.every((c) => c.checked)).toBe(true);
    const libelles = cases.map((c) => c.closest('label')?.textContent ?? '');
    expect(libelles.join(' ')).toMatch(/Terminée Une/);
    expect(libelles.join(' ')).toMatch(/Terminée Deux/);
    expect(libelles.join(' ')).not.toMatch(/Encore En Cours|Déjà Validée/);
    expect(document.body.textContent).toMatch(/2 entretien\(s\) seront validés/);

    // Décocher est le geste d'exception — et le récapitulatif suit.
    fireEvent.click(requis(cases[0], 'première case'));
    expect(document.body.textContent).toMatch(/1 entretien\(s\) seront validés/);
  });

  it('@critique « Terminer → note → Valider groupé » (§33.7) : une note ajoutée APRÈS terminer, SANS révision, survit à la validation groupée', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    const id = await semerSession({ status: 'en_cours', personName: 'Note De Couloir' });
    const enCours = await depotSessions.parId(id);
    if (enCours === null) throw new Error('harnais : session absente');
    await terminerSession(enCours, 'guide_strict');
    const terminee = await depotSessions.parId(id);
    if (terminee === null) throw new Error('harnais : session absente');
    expect(terminee.status).toBe('termine');
    await ecrireNotesGenerales(terminee, NOTE_DE_COULOIR);

    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();

    const validee = await depotSessions.parId(id);
    expect(validee?.valideeLe).not.toBeNull();
    expect(validee?.generalNotes).toBe(NOTE_DE_COULOIR);
    expect(resultat(/validation des entretiens/i)).toMatch(/1 entretien\(s\) validé\(s\)/);
  }, 40_000);

  it('une session décochée reste OUVERTE : rien n’est validé à son insu (invariant 7)', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    const gardee = await semerSession({ status: 'termine', personName: 'Gardée Ouverte' });
    await semerSession({ status: 'termine', personName: 'Validée Ce Soir' });
    await monter(base);
    const caseGardee = screen
      .getAllByRole<HTMLInputElement>('checkbox')
      .find((c) => (c.closest('label')?.textContent ?? '').includes('Gardée Ouverte'));
    fireEvent.click(requis(caseGardee, 'case « Gardée Ouverte »'));
    saisirMotDePasse();
    await terminerLaJournee();
    expect((await depotSessions.parId(gardee))?.valideeLe).toBeNull();
    expect(await sessionsValidees()).toBe(1);
  }, 40_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LE GESTE UNIQUE, SON ORDRE, ET UN TEST PAR COMBINAISON D'ÉCHEC
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — UN geste : sync → export → validation', () => {
  it('@critique l’ordre est sync, PUIS export, PUIS validation — mesuré, pas déclaré', async () => {
    const base = await baseInstrumentee({});
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Ordre Fictif' });
    porte.journal.length = 0;
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();

    expect(porte.journal).toEqual(['sync', 'export', 'validation']);
    // Et le rituel est daté dans `meta` : c'est ce que le rappel du cockpit lira.
    expect(typeof (await lireMeta(base, 'journee:dernier-rituel'))).toBe('string');
    expect(document.body.textContent).toMatch(/Dernier rituel/);
  }, 40_000);

  it('@critique le fichier déposé est un `.axionbackup` valide (11 §4) : en-tête en clair, charge chiffrée, sel présent, mission désignée par UUID', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Nom Sentinelle À Chiffrer' });
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();

    expect(fichiersDeposes.length).toBe(1);
    const [depose] = fichiersDeposes;
    expect(depose?.nom).toMatch(new RegExp(`^axion-${MISSION_ID}-\\d{8}T\\d{6}Z\\.axionbackup$`));
    const contenu = await (depose?.contenu ?? Promise.resolve(''));
    const fichier = fichierSauvegardeSchema.parse(JSON.parse(contenu));
    expect(fichier.enTete.missionId).toBe(MISSION_ID);
    expect(fichier.enTete.kdf.algo).toBe('argon2id');
    expect(fichier.enTete.kdf.sel.length).toBeGreaterThan(0);
    expect(fichier.enTete.operationsIncluses).toBeGreaterThan(0);
    // Aucune donnée personnelle en clair, ni le mot de passe.
    expect(contenu).not.toMatch(/Nom Sentinelle/);
    expect(contenu).not.toContain(MOT_DE_PASSE);
    expect(resultat(/sauvegarde de secours/i)).toMatch(
      /élément\(s\) non encore synchronisé\(s\) inclus/,
    );
  }, 40_000);
});

describe('EcranFinDeJournee — un échec n’annule pas les suivants', () => {
  it('@critique sync « echec » (résolu) ⇒ l’écran le DIT, l’export est produit, la validation est faite', async () => {
    porte.comportement = 'echec';
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Après Échec Sync' });
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();
    expect(resultat(/synchronisation/i)).toMatch(/a échoué/i);
    expect(fichiersDeposes.length).toBe(1);
    expect(await sessionsValidees()).toBe(1);
  }, 40_000);

  // Le port de L6a rendra `echec` plutôt que de lever ; mais une panne réseau qui
  // ÉCHAPPE au port ne doit pas priver l'auditeur du filet de l'invariant 8 —
  // « c'est quand la sync est indisponible que la sauvegarde compte » (en-tête
  // de l'écran). Si ce test rougit, c'est que l'appel du port n'est pas gardé :
  // un rejet de la sync annule l'export ET la validation. Constaté, remonté,
  // PAS corrigé ici (09 §5.6).
  it('@critique sync qui LÈVE ⇒ l’export est produit quand même, la validation aussi, et l’écran dit ce qui s’est passé', async () => {
    porte.comportement = 'leve';
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Après Rejet Sync' });
    await monter(base);
    saisirMotDePasse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
      await Promise.resolve();
    });
    // Le rituel se termine d'une façon ou d'une autre : par la carte de résultat,
    // ou par une alerte. On attend l'une des deux, puis on mesure ce qui a été FAIT.
    await waitFor(
      () => {
        const fini =
          screen.queryByRole('heading', { name: /ce qui a été fait/i }) !== null ||
          screen.queryByRole('alert') !== null;
        expect(fini).toBe(true);
      },
      { timeout: 30_000 },
    );
    expect(fichiersDeposes.length).toBe(1);
    expect(await sessionsValidees()).toBe(1);
    expect(document.body.textContent).toMatch(/sauvegarde chiffrée produite/i);
  }, 40_000);

  it('@critique export qui LÈVE ⇒ la sync est dite, l’échec de sauvegarde est dit (données intactes), la validation est FAITE', async () => {
    // `exporterSauvegarde` lit les sept tables miroirs ; `attachments` en panne
    // ne touche que lui — la synthèse et la validation n'y lisent rien.
    const base = await baseInstrumentee({ lecturesEnPanne: ['attachments'] });
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Après Échec Export' });
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();
    expect(resultat(/synchronisation/i)).toMatch(/pas encore disponible/i);
    expect(resultat(/sauvegarde de secours/i)).toMatch(/n’a pas pu être produite/i);
    expect(resultat(/sauvegarde de secours/i)).toMatch(/données restent intactes/i);
    expect(fichiersDeposes.length).toBe(0);
    expect(await sessionsValidees()).toBe(1);
    expect(resultat(/validation des entretiens/i)).toMatch(/1 entretien\(s\) validé\(s\)/);
  }, 40_000);

  it('@critique mot de passe ABSENT ⇒ la sauvegarde n’est pas produite et l’écran dit POURQUOI ; sync et validation ont lieu', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Sans Mot De Passe' });
    await monter(base);
    await terminerLaJournee();
    expect(resultat(/sauvegarde de secours/i)).toMatch(/non produite/i);
    expect(resultat(/sauvegarde de secours/i)).toMatch(/mot de passe/i);
    expect(fichiersDeposes.length).toBe(0);
    expect(await sessionsValidees()).toBe(1);
    expect(porte.journal).toContain('sync');
  }, 40_000);
});

describe('EcranFinDeJournee — un échec n’annule pas les suivants (suite) : la validation qui LÈVE', () => {
  it('@critique le fichier est déposé AVANT la validation ; si elle lève, l’écran le dit et rien n’est perdu', async () => {
    // Base dont la panne d'écriture sur `interviews` est ARMÉE après le semis,
    // par un drapeau lu à chaque mutation — la session, elle, doit exister.
    let panneArmee = false;
    const base = await nouvelleBase();
    base.close();
    base.use({
      stack: 'dbcore',
      name: 'panne-ecriture-armable',
      create: (aval) => ({
        ...aval,
        table: (nomTable) => {
          const table = aval.table(nomTable);
          return {
            ...table,
            mutate: (demande) =>
              panneArmee && nomTable === 'interviews'
                ? Promise.reject(new Error('panne injectée en écriture'))
                : table.mutate(demande),
          };
        },
      }),
    });
    await base.open();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'termine', personName: 'Validation En Panne' });
    panneArmee = true;

    await monter(base);
    saisirMotDePasse();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
      await Promise.resolve();
    });
    const alerte = await screen.findByRole('alert', {}, { timeout: 30_000 });
    expect(alerte.textContent).toMatch(/n’a pas pu aller à son terme/i);
    expect(alerte.textContent).toMatch(/aucune donnée n’a été perdue/i);
    expect(fichiersDeposes.length).toBe(1);
    panneArmee = false;
    expect(await sessionsValidees()).toBe(0);
  }, 40_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// D. TOUTES LES MISSIONS EMBARQUÉES (03 §34.2 : « toutes missions embarquées
//    confondues » ; invariant 8 : aucune donnée sur un seul appareil)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — deux missions embarquées', () => {
  // Le fichier `.axionbackup` est PAR MISSION (11 §4 : `mission_id` dans
  // l'en-tête). Un appareil qui porte deux missions doit donc produire DEUX
  // sauvegardes et synchroniser les deux ; sinon la seconde mission « vit sur
  // un seul appareil » sans que l'écran le dise — l'invariant 8 rompu en
  // silence, derrière un message « Sauvegarde chiffrée produite ». Si ce test
  // rougit, c'est que le rituel ne traite que `missions[0]`. Constaté, remonté,
  // PAS corrigé ici (09 §5.6).
  it('@critique le rituel synchronise ET sauvegarde CHAQUE mission embarquée', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [
      [MISSION_ID, UNITE_ID],
      [MISSION_BIS_ID, UNITE_BIS_ID],
    ]);
    await semerSession({ status: 'termine', personName: 'Mission Une' });
    await semerSession({
      missionId: MISSION_BIS_ID,
      orgUnitId: UNITE_BIS_ID,
      status: 'termine',
      personName: 'Mission Deux',
    });
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();

    expect(porte.journal.filter((e) => e === 'sync').length).toBe(2);
    expect(fichiersDeposes.length).toBe(2);
    const noms = fichiersDeposes.map((f) => f.nom).join(' ');
    expect(noms).toContain(MISSION_ID);
    expect(noms).toContain(MISSION_BIS_ID);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// E. CRÉÉ ICI, RESTAURÉ SUR UN SECOND APPAREIL (07 ligne L5 ; 11 §4)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — la sauvegarde déposée se restaure sur un AUTRE appareil', () => {
  it('@critique le fichier produit par l’ÉCRAN se restaure sur une base neuve, sous une DEK DIFFÉRENTE, données identiques', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    const id = await semerSession({ status: 'termine', personName: 'Personne À Restaurer' });
    const origine = await depotSessions.parId(id);
    await monter(base);
    saisirMotDePasse();
    await terminerLaJournee();
    const contenu = await (fichiersDeposes[0]?.contenu ?? Promise.resolve(''));
    expect(contenu.length).toBeGreaterThan(0);

    // ── Le second appareil : base neuve, DEK neuve, rien de commun sauf le mot de passe.
    retirerContexteLocal();
    const kekAutre = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(99), KDF_TEST);
    const coffreAutre = await ouvrirCoffre(kekAutre, await creerDekEnveloppee(kekAutre));
    const autre = await nouvelleBase();
    installerContexteLocal({ base: autre, coffre: coffreAutre });

    const rapport = await importerSauvegarde(JSON.parse(contenu), MOT_DE_PASSE);
    expect(rapport.missionId).toBe(MISSION_ID);
    expect(rapport.lignesRestaurees).toBeGreaterThan(0);
    const restauree = await depotSessions.parId(id);
    expect(restauree).not.toBeNull();
    expect(restauree?.personName).toBe('Personne À Restaurer');
    expect(restauree?.status).toBe('termine');
    // La validation posée par le rituel a voyagé avec le fichier ? Non : l'export
    // précède la validation (ordre voulu) — la session restaurée est donc
    // NON validée, comme elle l'était au moment du dépôt. C'est cohérent, et dit.
    expect(restauree?.valideeLe).toBe(origine?.valideeLe ?? null);
    expect(restauree?.clientCreatedAt).toBe(origine?.clientCreatedAt);
    // Et le mauvais mot de passe est refusé sur ce second appareil aussi.
    await expect(importerSauvegarde(JSON.parse(contenu), 'faux-mot-de-passe')).rejects.toThrow();
  }, 90_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F. AUCUN VERROU (03 §33.7, §19.1)
// ─────────────────────────────────────────────────────────────────────────────
describe('EcranFinDeJournee — aucun verrou', () => {
  it('une session EN COURS n’empêche ni le rituel ni le retour ; l’écran ne verrouille jamais lui-même', async () => {
    const base = await nouvelleBase();
    await embarquer(base, [[MISSION_ID, UNITE_ID]]);
    await semerSession({ status: 'en_cours', personName: 'Encore En Cours' });
    await semerSession({ status: 'termine', personName: 'À Valider' });
    await monter(base);
    const bouton = screen.getByRole<HTMLButtonElement>('button', { name: /terminer la journée/i });
    expect(bouton.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^revenir$/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'retour' });
    expect(terrain.verrou.verrouillerMaintenant).not.toHaveBeenCalled();
    expect(terrain.fermer).not.toHaveBeenCalled();
    // Un mot de passe faux ne fait rien perdre : l'export échoue-t-il ? Non — la
    // clé du fichier dérive du mot de passe SAISI, quel qu'il soit ; c'est à la
    // restauration qu'il devra être le bon. Rien ici ne vérifie le mot de passe,
    // donc rien ici ne peut verrouiller.
    expect(within(bouton).queryByText(/verrou/i)).toBeNull();
  });
});
