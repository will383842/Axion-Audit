// =============================================================================
// TESTS DE CONCEPTION A24 — l'écran de restauration après A27-D1 et D-A27-1.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// RECETTE, pas acceptation. Écrit par A24 EN MÊME TEMPS que le correctif, pour
// que chaque branche neuve soit exercée et que la couverture de
// `EcranRestauration.tsx` reste à 100 %. L'ACCEPTATION du correctif revient au
// réviseur croisé (09 §5.6) : `restauration.acceptation-b4.test.tsx` est à A27,
// et il n'a pas été touché d'une ligne — ses 23 cas passent par le code, pas par
// leur réécriture.
//
// ── CE QU'IL COUVRE, ET QUE LE FICHIER D'A27 NE POUVAIT PAS COUVRIR ─────────
// A27 a écrit ses tests contre la spec d'AVANT l'arbitrage : sans persistance,
// rien ne se restaure. Ils restent vrais — le premier geste reste un refus
// guidé, et rien n'est écrit. Ce qui est neuf commence APRÈS ce refus :
//   A. le stockage qui LÈVE (A27-D1) nomme sa cause, et n'enferme plus ;
//   B. D-A27-1 : passer outre restaure POUR DE VRAI, et l'écran alerte fort ;
//   C. la reprise n'est pas offerte devant n'importe quel refus ;
//   D. l'identité du fichier restauré (constat A27 : « le BON fichier ? ») — la
//      mission y est NOMMÉE, et non plus identifiée par son UUID : amendement
//      de l'incrément L5d, motivé en tête de la section D ;
//   E. le ré-export mis en avant — ce qui rend D-A27-1 tenable (invariant 8).
//
// Traçabilité : E38 (sauvegarde terrain), E6 (hors ligne total), E44 (4 états).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, CLES_META, ecrireMeta } from '../../local/base.js';
import { initialiserCoffre } from '../../local/coffre-appareil.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente } from '../../local/ecriture.js';
import { EXTENSION_SAUVEGARDE, type FichierSauvegarde } from '../../sauvegarde/format.js';
import { exporterSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { EcranRestauration } from './EcranRestauration.js';

// -----------------------------------------------------------------------------
// Fixtures FICTIVES (invariant 2) — aucun nom réel, nulle part.
// -----------------------------------------------------------------------------
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const INSTANT = '2026-09-06T08:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000027a240';
/**
 * Le TITRE de la mission — ce que la carte d'identité montre depuis L5d.
 * Il n'est pas décoratif : c'est lui qui distingue deux sauvegardes de la même
 * clé USB (constat A27), ce que l'UUID ne faisait pas. Voir la section D.
 */
const TITRE_MISSION = 'Mission fictive de recette A24';
const LIBELLE_ORIGINE = 'Tablette fictive n° 2 (recette A24)';

/** Argon2id allégé — la robustesse du KDF est prouvée dans `coffre.test.ts`. */
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let sauvegarde: FichierSauvegarde;
const bases: BaseLocale[] = [];
let compteur = 0;
/** Les noms de fichiers réellement déposés par `<a download>`, captés. */
let fichiersDeposes: string[] = [];

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

// -----------------------------------------------------------------------------
// Le harnais d'appareil : base Dexie RÉELLE, coffre RÉEL et PERSISTÉ.
//
// Le coffre est persisté (`initialiserCoffre`) et non monté en mémoire : c'est ce
// qui rend `verifierMotDePasseAppareil` opérante, donc ce qui permet d'éprouver
// le refus M5 du ré-export. Un coffre en mémoire laisserait passer n'importe quel
// mot de passe — et le test aurait prouvé le contraire de ce qu'il annonce.
// -----------------------------------------------------------------------------
async function appareilNeuf(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a24-reprise-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await initialiserCoffre(base, MOT_DE_PASSE, KDF_TEST);
  installerContexteLocal({ base, coffre });
  return base;
}

function terrainDeRestauration(base: BaseLocale): ValeurTerrain {
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
    navigation: { pile: ['accueil', 'restauration'] },
    vue: 'restauration',
    stockage: null,
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

interface StockageSimule {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<StorageEstimate>;
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

const STOCKAGE_REFUSE: StockageSimule = {
  persist: () => Promise.resolve(false),
  persisted: () => Promise.resolve(false),
  estimate: () => Promise.resolve({ quota: 10 * 1024 ** 3, usage: 1024 ** 3 }),
};

/** WebKit en navigation privée / hors contexte sécurisé : l'API LÈVE. */
const STOCKAGE_QUI_LEVE: StockageSimule = {
  persist: () => Promise.reject(new Error('SecurityError fictive')),
  persisted: () => Promise.reject(new Error('SecurityError fictive')),
  estimate: () => Promise.reject(new Error('SecurityError fictive')),
};

function fichierDe(contenu: unknown): File {
  return new File([JSON.stringify(contenu)], `secours${EXTENSION_SAUVEGARDE}`, {
    type: 'application/json',
  });
}

function restaurer(fichier: File, motDePasse: string): void {
  fireEvent.change(screen.getByLabelText(/fichier de sauvegarde/i), {
    target: { files: [fichier] },
  });
  fireEvent.change(screen.getByLabelText(/votre mot de passe/i), {
    target: { value: motDePasse },
  });
  fireEvent.click(screen.getByRole('button', { name: /restaurer sur cet appareil/i }));
}

function boutonQuandMeme(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: /restaurer quand même/i });
}

/**
 * Le texte de la définition qui suit une étiquette de la carte d'identité.
 *
 * On vise le `<dd>` et non `document.body` : « la carte affiche une date »
 * n'est vérifié que si l'on regarde LA ligne concernée — sur le corps entier,
 * n'importe quelle autre date suffirait à contenter l'assertion.
 */
function definitionSuivant(etiquette: RegExp): string {
  return screen.getByText(etiquette).nextElementSibling?.textContent ?? '';
}

/** Le scénario complet de D-A27-1 : refus lu, puis reprise assumée. */
async function passerOutre(fichier: File): Promise<void> {
  restaurer(fichier, MOT_DE_PASSE);
  await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
  await act(async () => {
    fireEvent.click(boutonQuandMeme());
    await Promise.resolve();
  });
  await screen.findByText(/sauvegarde restaurée/i);
}

beforeAll(async () => {
  poserStockage(STOCKAGE_ACCORDE);
  const origine = await appareilNeuf();
  await ecrireMeta(origine, CLES_META.libelleAppareil, LIBELLE_ORIGINE);
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
          companyId: '0191e2a0-0000-7000-8000-00000027a241',
          timezone: 'Europe/Paris',
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
        },
      },
    ],
  });
  sauvegarde = await exporterSauvegarde({
    missionId: MISSION_ID,
    motDePasse: MOT_DE_PASSE,
    parametresKdf: KDF_TEST,
  });
  retirerContexteLocal();
}, 60_000);

beforeEach(() => {
  poserStockage(STOCKAGE_ACCORDE);
  fichiersDeposes = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:axion-a24',
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  HTMLAnchorElement.prototype.click = function capturer(this: HTMLAnchorElement) {
    if (this.download !== '') fichiersDeposes.push(this.download);
  };
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  retirerContexteLocal();
  poserStockage(null);
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// A. A27-D1 — LE STOCKAGE QUI LÈVE NOMME SA CAUSE, ET N'ENFERME PLUS
// ═════════════════════════════════════════════════════════════════════════════
describe('A27-D1 — un `navigator.storage` qui rejette', () => {
  it('@critique la cause est NOMMÉE : navigation privée, contexte non sécurisé', async () => {
    poserStockage(STOCKAGE_QUI_LEVE);
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/n’a pas pu être interrogé/i);
    expect(document.body.textContent).toMatch(/navigation privée/i);
    // Et surtout : l'écran n'est plus occupé. C'est le défaut, mesuré à l'envers.
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique une panne du stockage n’interdit pas de restaurer (D-A27-1)', async () => {
    poserStockage(STOCKAGE_QUI_LEVE);
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    await passerOutre(fichierDe(sauvegarde));

    expect(await base.missions.count()).toBe(1);
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// B. D-A27-1 — PASSER OUTRE RESTAURE POUR DE VRAI, ET L'ÉCRAN LE DIT FORT
// ═════════════════════════════════════════════════════════════════════════════
describe('D-A27-1 — la restauration procède sans persistance, l’embarquement reste refusé', () => {
  it('@critique le refus vient D’ABORD, et rien n’est écrit tant qu’on n’a pas repris', async () => {
    poserStockage(STOCKAGE_REFUSE);
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    // Le guidage garde son geste (05 §31-2) mais PERD sa conclusion
    // d'embarquement : elle contredirait le bouton juste en dessous.
    expect(document.body.textContent).toMatch(/sur l’écran d’accueil/i);
    expect(document.body.textContent).not.toMatch(/ne peut pas être embarquée/i);
    expect(boutonQuandMeme()).toBeInstanceOf(HTMLButtonElement);
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique passer outre écrit RÉELLEMENT la mission, et l’écran ALERTE', async () => {
    poserStockage(STOCKAGE_REFUSE);
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    await passerOutre(fichierDe(sauvegarde));

    expect(await base.missions.count()).toBe(1);
    // « avertissement fort et lisible — pas une pastille discrète » : `alerte`
    // prend `role="alert"`, qui interrompt le lecteur d'écran.
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toMatch(/stockage non garanti sur cet appareil/i);
    expect(alerte.textContent).toMatch(/produisez une sauvegarde maintenant/i);
  }, 30_000);

  it('@critique le ré-export est l’action MISE EN AVANT quand rien n’est garanti', async () => {
    poserStockage(STOCKAGE_REFUSE);
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    await passerOutre(fichierDe(sauvegarde));

    // Mis en avant, pas enfoui : c'est le bouton principal, et « Ouvrir ma
    // journée » passe en second. C'est ce qui rend l'arbitrage tenable.
    const exporter = screen.getByRole('button', { name: /exporter une sauvegarde depuis/i });
    const ouvrir = screen.getByRole('button', { name: /ouvrir ma journée/i });
    expect(exporter.className).toMatch(/axn-bouton--principal/);
    expect(ouvrir.className).toMatch(/axn-bouton--secondaire/);
  }, 30_000);

  it('@critique avec la persistance ACCORDÉE, aucune alerte et « Ouvrir ma journée » redevient principal', async () => {
    // L'anti-vacuité de l'alerte : un écran qui alerterait toujours n'alerte plus.
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), MOT_DE_PASSE);
    await screen.findByText(/sauvegarde restaurée/i);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toMatch(/stockage non garanti/i);
    expect(screen.getByRole('button', { name: /ouvrir ma journée/i }).className).toMatch(
      /axn-bouton--principal/,
    );
    expect(
      screen.getByRole('button', { name: /exporter une sauvegarde depuis/i }).className,
    ).toMatch(/axn-bouton--secondaire/);
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// C. LA REPRISE N'EST PAS OFFERTE DEVANT N'IMPORTE QUEL REFUS
// ═════════════════════════════════════════════════════════════════════════════
describe('« quand même » ne s’offre que là où il répare quelque chose', () => {
  it('@critique un mauvais mot de passe n’ouvre AUCUNE reprise', async () => {
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), 'mot-de-passe-fictif-errone');

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    // Proposer « quand même » ici apprendrait à cliquer sans lire — et ne
    // réparerait rien : la clé du fichier n'a rien à voir avec le stockage.
    expect(screen.queryByRole('button', { name: /restaurer quand même/i })).toBeNull();
    expect(screen.getByRole('button', { name: /recommencer/i })).toBeInstanceOf(HTMLButtonElement);
  }, 30_000);

  it('@critique un fichier illisible non plus, et l’action nomme l’extension', async () => {
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    const pasUnJson = new File(['%PDF-1.7'], 'rapport.pdf', { type: 'application/pdf' });
    restaurer(pasUnJson, MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/n’est pas lisible comme une sauvegarde axion/i);
    expect(document.body.textContent).toContain(EXTENSION_SAUVEGARDE);
    expect(screen.queryByRole('button', { name: /restaurer quand même/i })).toBeNull();
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// D. L'IDENTITÉ DU FICHIER RESTAURÉ — « est-ce le BON fichier ? »
//
// ── AMENDEMENT DE L'INCRÉMENT L5d (2026-09-08, A24, auteur du fichier) ──────
// Ce bloc exigeait `getByText(MISSION_ID)` : l'UUID de la mission AFFICHÉ à
// l'auditeur. C'était un verrou posé sur un DÉFAUT — l'un des trois que L5d
// corrige. Un identifiant de 36 caractères hexadécimaux n'est pas de
// l'interface en français (invariant 5), et il ne renseigne personne sur ce qui
// vient d'être restauré, ce qui est pourtant la raison d'être de cette carte
// (constat A27 du 2026-09-06 : deux sauvegardes de la même clé USB ne se
// distinguaient d'aucune façon). Le défaut a été débusqué par la contre-épreuve
// d'A26 ; l'amendement revient à l'auteur du test (09 §5.6).
//
// L'amendement ne relâche rien : il déplace l'exigence de l'identifiant vers ce
// que la carte existe pour DIRE. Un titre distingue deux fichiers, un UUID non.
// Le titre est disponible sans réseau : `missions` est l'une des tables
// sauvegardées, il voyage donc DANS le `.axionbackup`, pas dans une requête.
// ═════════════════════════════════════════════════════════════════════════════
describe('après un succès, l’écran dit D’OÙ vient ce qu’il vient d’écrire', () => {
  it('@critique l’appareil d’origine, l’instant de la sauvegarde et la mission NOMMÉE', async () => {
    const base = await appareilNeuf();
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), MOT_DE_PASSE);
    await screen.findByText(/sauvegarde restaurée/i);

    expect(screen.getByText(LIBELLE_ORIGINE)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(TITRE_MISSION)).toBeInstanceOf(HTMLElement);

    // L'horodatage est FORMATÉ, pas recraché en ISO : l'auditeur compare deux
    // fichiers de sa clé USB, il ne lit pas du 8601. Les deux assertions vont
    // ensemble — la première interdit l'absence de forme, la seconde interdit
    // que l'ISO se soit glissé À CÔTÉ d'une date formatée.
    const produiteLe = definitionSuivant(/sauvegarde produite le/i);
    expect(produiteLe).toMatch(/\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}/);
    expect(produiteLe).not.toContain(sauvegarde.enTete.creeLe);

    // CE QUE CETTE LIGNE NE PROTÈGE PAS, ET QUI EST GARDÉ AILLEURS : le FUSEAU.
    // La forme JJ/MM/AAAA HH:MM est la même au fuseau de la mission et à celui
    // de l'appareil ; cette recette-ci les laisse confondus (fixture
    // `Europe/Paris`), elle est donc structurellement aveugle à leur divergence.
    // Que l'instant soit rendu au fuseau de la MISSION (03 §22.2, invariant 5)
    // est gardé — délibérément une seule fois, une garde dupliquée dérivant
    // toujours — par
    // `apps/field/src/ecrans/journee/invariant5-fuseau.acceptation-l5d.test.tsx`,
    // qui fait diverger les deux fuseaux d'un JOUR CIVIL entier.
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// E. LE RÉ-EXPORT — ce qui rend D-A27-1 tenable au regard de l'invariant 8
// ═════════════════════════════════════════════════════════════════════════════
describe('le ré-export depuis l’appareil qui vient de restaurer', () => {
  async function restaurerPuisDemanderLExport(base: BaseLocale): Promise<void> {
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegarde), MOT_DE_PASSE);
    await screen.findByText(/sauvegarde restaurée/i);
    fireEvent.click(screen.getByRole('button', { name: /exporter une sauvegarde depuis/i }));
  }

  it('@critique produit un fichier, le dépose, et nomme le geste qui reste à faire', async () => {
    const base = await appareilNeuf();
    await restaurerPuisDemanderLExport(base);

    // Le mot de passe est REDEMANDÉ — celui de la restauration a été effacé au
    // succès. Le libellé est distinct : ce n'est plus la clé du fichier reçu.
    const champ = screen.getByLabelText(/mot de passe de cet appareil/i);
    expect(screen.queryByLabelText(/votre mot de passe/i)).toBeNull();
    fireEvent.change(champ, { target: { value: MOT_DE_PASSE } });
    fireEvent.click(screen.getByRole('button', { name: /produire le fichier de sauvegarde/i }));

    await screen.findByText(/nouvelle sauvegarde produite/i);
    expect(fichiersDeposes).toHaveLength(1);
    expect(fichiersDeposes[0]).toContain(EXTENSION_SAUVEGARDE);
    expect(document.body.textContent).toMatch(/24 h ouvrées/i);
  }, 60_000);

  it('@critique le bouton reste indisponible sans mot de passe', async () => {
    const base = await appareilNeuf();
    await restaurerPuisDemanderLExport(base);

    const produire = screen.getByRole<HTMLButtonElement>('button', {
      name: /produire le fichier de sauvegarde/i,
    });
    expect(produire.disabled).toBe(true);
  }, 30_000);

  it('@critique un mot de passe qui n’est pas celui de cet appareil ne produit RIEN (M5)', async () => {
    const base = await appareilNeuf();
    await restaurerPuisDemanderLExport(base);

    fireEvent.change(screen.getByLabelText(/mot de passe de cet appareil/i), {
      target: { value: 'un-autre-mot-de-passe-fictif-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /produire le fichier de sauvegarde/i }));

    await screen.findByText(/sauvegarde non produite/i);
    expect(document.body.textContent).toMatch(/n’est pas celui de cet appareil/i);
    // Un fichier chiffré sous un mot de passe erroné serait définitivement
    // illisible : ne rien déposer est la seule réponse honnête.
    expect(fichiersDeposes).toHaveLength(0);
  }, 60_000);

  it('@critique un échec technique est DIT, sans jamais promettre un fichier', async () => {
    const base = await appareilNeuf();
    await restaurerPuisDemanderLExport(base);

    fireEvent.change(screen.getByLabelText(/mot de passe de cet appareil/i), {
      target: { value: MOT_DE_PASSE },
    });
    // La base fermée sous les pieds de l'export : onglet tué, quota atteint.
    base.close();
    fireEvent.click(screen.getByRole('button', { name: /produire le fichier de sauvegarde/i }));

    await screen.findByText(/sauvegarde non produite/i);
    expect(document.body.textContent).toMatch(/n’a pas pu être produite sur cet appareil/i);
    expect(document.body.textContent).not.toMatch(/nouvelle sauvegarde produite/i);
    expect(fichiersDeposes).toHaveLength(0);
  }, 30_000);

  it('l’état intermédiaire existe : le bouton se ferme pendant la dérivation Argon2id', async () => {
    const base = await appareilNeuf();
    await restaurerPuisDemanderLExport(base);

    fireEvent.change(screen.getByLabelText(/mot de passe de cet appareil/i), {
      target: { value: MOT_DE_PASSE },
    });
    const produire = screen.getByRole<HTMLButtonElement>('button', {
      name: /produire le fichier de sauvegarde/i,
    });
    fireEvent.click(produire);
    // Une seconde pression pendant la dérivation ne doit pas produire deux
    // fichiers : sur tablette, l'auditeur qui ne voit rien venir re-tape.
    expect(produire.disabled).toBe(true);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/nouvelle sauvegarde produite/i);
    });
    expect(fichiersDeposes).toHaveLength(1);
  }, 60_000);
});
