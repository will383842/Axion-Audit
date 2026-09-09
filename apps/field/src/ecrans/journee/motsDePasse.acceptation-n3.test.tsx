// =============================================================================
// N3 — DIRE QUEL MOT DE PASSE, ET NE PAS DIRE LE MÊME PARTOUT.
// Écrit par A26 (09 §5.6 : A22 a changé les libellés, il n'écrit pas ce qui les
// mesure), depuis le constat A54 du 2026-09-09 et 11 §4 (« clé dérivée du MOT DE
// PASSE utilisateur, restaurable sur n'importe quel appareil du compte »).
//
// ── CE QUE CE FICHIER GARDE, ET C'EST L'INVERSE D'UNE UNIFORMISATION ────────
// Trois champs de mot de passe vivent sur deux écrans, et ils ne parlent PAS du
// même secret :
//
//   1. « Fin de journée » → sauvegarde produite ICI  → mot de passe DE CET
//      APPAREIL (`verifierMotDePasseAppareil`, chemin du déverrouillage) ;
//   2. « Restaurer une sauvegarde » → champ d'IMPORT → mot de passe de
//      L'APPAREIL QUI A PRODUIT LE FICHIER. Ce n'est pas celui d'ici : une
//      sauvegarde se restaure sur un appareil de REMPLACEMENT, qui a son propre
//      coffre, et le sel est dans l'en-tête du fichier (11 §4) ;
//   3. « Restaurer une sauvegarde » → champ de RÉ-EXPORT, plus bas sur le même
//      écran, après une restauration réussie → de nouveau CET APPAREIL.
//
// **Un test qui exigerait le même libellé partout réintroduirait la
// contre-vérité que N3 vient de retirer.** Ce fichier fait donc l'inverse d'une
// garde d'uniformité : il fige la DIFFÉRENCE entre 1/3 et 2, et il vérifie que
// le champ 3 — que N3 ne touchait pas — n'a pas été emporté par le passage.
//
// La méthode : on lit les libellés RENDUS, jamais la source. Un `grep` sur le
// `.tsx` dirait qu'une chaîne existe, jamais qu'elle est le nom accessible d'un
// champ — et c'est ce nom-là, et lui seul, que l'auditeur entend et que le
// novice lit avant de taper.
//
// Traçabilité : E38 (sauvegarde terrain, invariant 8) · E23 (novice < 30 min)
// · E33 (sécurité / RGPD).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EXTENSION_SAUVEGARDE, type FichierSauvegarde } from '../../sauvegarde/format.js';
import { exporterSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { EcranFinDeJournee } from './EcranFinDeJournee.js';
import { EcranRestauration } from './EcranRestauration.js';

// -----------------------------------------------------------------------------
// Fixtures FICTIVES (invariant 2).
// -----------------------------------------------------------------------------
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const INSTANT = '2026-09-06T08:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000003a001';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000003a002';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000003a003';
const SESSION_ID = '0191e2a0-0000-7000-8000-00000003a004';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

/** Les trois libellés, écrits UNE fois ici : ils sont l'objet du test. */
const LIBELLE_CET_APPAREIL = 'Mot de passe de cet appareil';
const LIBELLE_APPAREIL_ORIGINE = 'Mot de passe de l’appareil qui a produit la sauvegarde';
/** Ce que N3 a retiré, et qui ne doit revenir sur aucun des deux écrans. */
const LIBELLE_RETIRE = /^Votre mot de passe$/;

let terrain: ValeurTerrain;
let kekOrigine: CryptoKey;
let kekRemplacement: CryptoKey;
let sauvegarde: FichierSauvegarde;

const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

interface StockageSimule {
  persist: () => Promise<boolean>;
  persisted: () => Promise<boolean>;
  estimate: () => Promise<{ quota: number; usage: number }>;
}

function poserStockage(simule: StockageSimule | null): void {
  if (simule === null) {
    Reflect.deleteProperty(navigator, 'storage');
    return;
  }
  Object.defineProperty(navigator, 'storage', { configurable: true, value: simule });
}

const STOCKAGE_ACCORDE: StockageSimule = {
  persist: () => Promise.resolve(true),
  persisted: () => Promise.resolve(true),
  estimate: () => Promise.resolve({ quota: 10 * 1024 ** 3, usage: 1024 ** 3 }),
};

async function appareilNeuf(kek: CryptoKey): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a26-n3-${String(compteur)}`);
  await base.open();
  bases.push(base);
  installerContexteLocal({ base, coffre: await ouvrirCoffre(kek, await creerDekEnveloppee(kek)) });
  return base;
}

async function semerMission(base: BaseLocale): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: INSTANT,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'collecte', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: 'Mission fictive N3',
          companyId: '0191e2a0-0000-7000-8000-00000003a0c0',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
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
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 8,
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
  await ecrireLocal({
    entite: 'interview',
    id: SESSION_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'termine',
      scheduleStatus: 'realise',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
      personRole: 'Fonction fictive',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: INSTANT,
      informationNoticeVersion: 'v1',
      noticeShownAt: INSTANT,
      scheduledDurationMin: 45,
      startedAt: INSTANT,
      endedAt: INSTANT,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);
}

function terrainDeBase(base: BaseLocale): ValeurTerrain {
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

async function attendreLecture(): Promise<void> {
  await waitFor(() => {
    expect(estOccupe()).toBe(false);
  });
}

function fichierDe(contenu: unknown): File {
  return new File([JSON.stringify(contenu)], `secours${EXTENSION_SAUVEGARDE}`, {
    type: 'application/json',
  });
}

beforeAll(async () => {
  kekOrigine = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(41), KDF_TEST);
  kekRemplacement = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(97), KDF_TEST);
  poserStockage(STOCKAGE_ACCORDE);
  // Un vrai `.axionbackup`, produit par la crypto de PRODUCTION sur un appareil
  // d'origine qui meurt ensuite. C'est ce qui rend le champ de ré-export
  // atteignable par un geste, et non par une prop de test.
  const origine = await appareilNeuf(kekOrigine);
  await ecrireMeta(origine, CLES_META.libelleAppareil, 'Tablette fictive d’origine');
  await semerMission(origine);
  sauvegarde = await exporterSauvegarde({
    missionId: MISSION_ID,
    motDePasse: MOT_DE_PASSE,
    parametresKdf: KDF_TEST,
  });
  retirerContexteLocal();
}, 60_000);

beforeEach(() => {
  poserStockage(STOCKAGE_ACCORDE);
});

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  poserStockage(null);
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. FIN DE JOURNÉE — la sauvegarde est produite ICI, la clé est celle d'ICI
// ─────────────────────────────────────────────────────────────────────────────
describe('N3 — « Fin de journée » : le champ dit QUEL mot de passe, avant la saisie', () => {
  it('@critique le champ s’appelle « Mot de passe de cet appareil », et plus « Votre mot de passe »', async () => {
    const base = await appareilNeuf(kekRemplacement);
    await semerMission(base);
    terrain = terrainDeBase(base);
    render(<EcranFinDeJournee />);
    await attendreLecture();

    const champ = screen.getByLabelText<HTMLInputElement>(LIBELLE_CET_APPAREIL);
    expect(champ.type).toBe('password');
    expect(screen.queryByLabelText(LIBELLE_RETIRE)).toBeNull();
  });

  it('@critique l’aide dit qu’il n’y a RIEN À CRÉER — c’est la confusion qui coûtait la sauvegarde', async () => {
    const base = await appareilNeuf(kekRemplacement);
    await semerMission(base);
    terrain = terrainDeBase(base);
    render(<EcranFinDeJournee />);
    await attendreLecture();

    // Le champ porte son aide par `aria-describedby` : c'est elle que le lecteur
    // d'écran énonce, et c'est donc elle qu'on lit — pas un `<p>` voisin.
    const champ = screen.getByLabelText<HTMLInputElement>(LIBELLE_CET_APPAREIL);
    const idAide = champ.getAttribute('aria-describedby');
    expect(idAide).not.toBeNull();
    const aide = document.getElementById(idAide ?? '');
    expect(aide?.textContent ?? '').toMatch(/déverrouille cette application/i);
    expect(aide?.textContent ?? '').toMatch(/pas d’autre à créer/i);
  });

  it('@critique le mot de passe VIDE : le refus nomme le même mot de passe que le libellé', async () => {
    const base = await appareilNeuf(kekRemplacement);
    await semerMission(base);
    terrain = terrainDeBase(base);
    render(<EcranFinDeJournee />);
    await attendreLecture();

    fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
    // C'est le point de N3 : l'échec ne doit plus être le premier endroit où
    // l'auditeur apprend LEQUEL. Il dit le même mot que le libellé.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/sauvegarde non produite/i);
    });
    expect(document.body.textContent).toMatch(/le mot de passe de cet appareil/i);
    expect(document.body.textContent).not.toMatch(/votre mot de passe/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. RESTAURATION — deux champs, deux secrets, et ils ne se confondent pas
// ─────────────────────────────────────────────────────────────────────────────
describe('N3 — « Restaurer une sauvegarde » : le champ d’IMPORT désigne l’appareil d’ORIGINE', () => {
  it('@critique le champ d’import ne dit NI « votre » NI « cet appareil » : il nomme l’appareil qui a produit le fichier', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeBase(base);
    render(<EcranRestauration />);

    expect(screen.getByLabelText<HTMLInputElement>(LIBELLE_APPAREIL_ORIGINE).type).toBe('password');
    expect(screen.queryByLabelText(LIBELLE_RETIRE)).toBeNull();
    // La contre-vérité que N3 écarte : à cette phase, AUCUN champ ne prétend que
    // la clé est celle d'ici. L'appareil de remplacement n'a jamais vu ces données.
    expect(screen.queryByLabelText(LIBELLE_CET_APPAREIL)).toBeNull();
  });

  it('@critique l’aide écarte les DEUX confusions : ni cet appareil-ci, ni un mot de passe à créer', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeBase(base);
    render(<EcranRestauration />);

    const champ = screen.getByLabelText<HTMLInputElement>(LIBELLE_APPAREIL_ORIGINE);
    const aide = document.getElementById(champ.getAttribute('aria-describedby') ?? '');
    expect(aide?.textContent ?? '').toMatch(/pas celui de cet appareil-ci/i);
    expect(aide?.textContent ?? '').toMatch(/ni un mot de passe à créer/i);
  });

  it('@critique après une restauration RÉUSSIE, le champ de ré-export dit toujours « de cet appareil »', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeBase(base);
    render(<EcranRestauration />);

    // Le geste complet, par l'écran, avec un vrai fichier et une DEK différente.
    fireEvent.change(screen.getByLabelText(/fichier de sauvegarde/i), {
      target: { files: [fichierDe(sauvegarde)] },
    });
    fireEvent.change(screen.getByLabelText(LIBELLE_APPAREIL_ORIGINE), {
      target: { value: MOT_DE_PASSE },
    });
    fireEvent.click(screen.getByRole('button', { name: /restaurer sur cet appareil/i }));
    await screen.findByText(/sauvegarde restaurée/i, undefined, { timeout: 20_000 });

    // Anti-vacuité : le champ n'existe PAS encore. Sans cette ligne, l'assertion
    // finale pourrait porter sur le champ d'import resté à l'écran.
    expect(screen.queryByLabelText(LIBELLE_CET_APPAREIL)).toBeNull();

    // Le ré-export : c'est de nouveau CET appareil qui chiffrera, donc de nouveau
    // SON mot de passe. C'est le champ que N3 ne touchait pas, et le seul moyen
    // de prouver qu'il n'a pas été emporté est de l'atteindre.
    fireEvent.click(
      screen.getByRole('button', { name: /exporter une sauvegarde depuis cet appareil/i }),
    );
    expect(screen.getByLabelText<HTMLInputElement>(LIBELLE_CET_APPAREIL).type).toBe('password');
    expect(screen.queryByLabelText(LIBELLE_RETIRE)).toBeNull();
  }, 40_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// LA GARDE QUI COMPTE : LES DEUX PHRASES SONT DIFFÉRENTES, ET EXPRÈS
// ─────────────────────────────────────────────────────────────────────────────
describe('N3 — l’uniformisation est le défaut, pas la qualité', () => {
  /**
   * Les noms accessibles des champs de mot de passe de l'écran RENDU.
   *
   * On récolte le `<label for>` de chaque `input[type="password"]` : c'est ce
   * qu'un lecteur d'écran énonce, et c'est la seule chose que la production
   * décide. Aucune constante de ce fichier n'entre dans la récolte — c'est ce
   * qui rend la comparaison qui suit falsifiable.
   */
  function nomsDesChampsMotDePasse(): string[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].map(
      (champ) => document.querySelector(`label[for="${champ.id}"]`)?.textContent.trim() ?? '',
    );
  }

  /**
   * ── POURQUOI CE TEST A ÉTÉ RÉÉCRIT (revue croisée A29, réserve R3) ─────────
   * Sa première version comparait `LIBELLE_CET_APPAREIL` à
   * `LIBELLE_APPAREIL_ORIGINE` — deux constantes déclarées vingt lignes plus
   * haut DANS CE FICHIER. Elle était donc TAUTOLOGIQUE : uniformiser les deux
   * libellés en production ne l'aurait pas fait rougir d'un pouce, alors que son
   * commentaire promettait exactement l'inverse (« la seule forme qui survit à
   * quelqu'un qui harmoniserait les libellés un matin »).
   *
   * C'est la famille même que ce lot a passé la journée à démonter — un test qui
   * rassure sans rien garder — et elle était de ma main. A29 a eu raison de me
   * la rendre.
   *
   * La version ci-dessous MONTE LES DEUX ÉCRANS et compare ce qu'ils RENDENT.
   * Falsification vérifiée avant de la livrer : en alignant le libellé d'import
   * d'`EcranRestauration` sur celui de `EcranFinDeJournee`, ce test rougit —
   * production restaurée aussitôt, aucune ligne livrée (09 §5.6).
   */
  it('@critique les deux écrans NOMMENT deux secrets différents — mesuré sur ce qu’ils rendent', async () => {
    const un = await appareilNeuf(kekRemplacement);
    await semerMission(un);
    terrain = terrainDeBase(un);
    const rendu = render(<EcranFinDeJournee />);
    await attendreLecture();
    const surFinDeJournee = nomsDesChampsMotDePasse();
    rendu.unmount();

    const deux = await appareilNeuf(kekRemplacement);
    terrain = terrainDeBase(deux);
    render(<EcranRestauration />);
    const surRestauration = nomsDesChampsMotDePasse();

    // Anti-vacuité : deux écrans muets se ressembleraient parfaitement, et la
    // comparaison ci-dessous passerait sans avoir rien comparé.
    expect(surFinDeJournee, 'Fin de journée doit porter UN champ de mot de passe').toHaveLength(1);
    expect(surRestauration, 'Restauration doit porter UN champ de mot de passe').toHaveLength(1);
    const nomFinDeJournee = requis(surFinDeJournee[0], 'nom du champ de Fin de journée');
    const nomRestauration = requis(surRestauration[0], 'nom du champ de Restauration');
    expect(nomFinDeJournee.length).toBeGreaterThan(10);
    expect(nomRestauration.length).toBeGreaterThan(10);

    // LA GARDE. Les deux écrans demandent deux secrets DIFFÉRENTS ; le jour où
    // ils se mettent à les nommer pareil, la contre-vérité que N3 a retirée est
    // de retour, et c'est ici qu'on l'apprend.
    expect(
      nomRestauration,
      'les deux écrans nomment le même secret — la contre-vérité de N3 est revenue',
    ).not.toBe(nomFinDeJournee);
    // Ni l'un préfixe de l'autre : « Mot de passe de cet appareil » suivi de
    // « …de cet appareil qui a produit » se lirait comme une précision, pas comme
    // un autre secret.
    expect(nomRestauration.startsWith(nomFinDeJournee)).toBe(false);

    // Et chacun désigne le BON appareil — lu à l'écran, jamais dans ce fichier.
    expect(nomFinDeJournee).toContain('cet appareil');
    expect(nomRestauration).toContain('qui a produit la sauvegarde');
    expect(
      nomRestauration,
      'le champ d’import prétend que la clé est celle d’ici — elle ne l’est pas (11 §4)',
    ).not.toContain('cet appareil');
  });

  it('@critique sur les DEUX écrans montés, aucun champ ne s’appelle « Votre mot de passe »', async () => {
    const un = await appareilNeuf(kekRemplacement);
    await semerMission(un);
    terrain = terrainDeBase(un);
    const rendu = render(<EcranFinDeJournee />);
    await attendreLecture();
    expect(screen.queryByLabelText(LIBELLE_RETIRE)).toBeNull();
    rendu.unmount();

    const deux = await appareilNeuf(kekRemplacement);
    terrain = terrainDeBase(deux);
    render(<EcranRestauration />);
    expect(screen.queryByLabelText(LIBELLE_RETIRE)).toBeNull();
  });
});
