// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B4** du contrôle A02 de P-C (2026-09-06) :
// `EcranRestauration.tsx`, 267 lignes, **11,11 % de couverture, AUCUN fichier de
// test**. C'est l'écran qui RESTAURE un export de secours — le geste de
// l'invariant 8, celui qu'on ne fait qu'une fois, le jour où l'appareil est mort.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne d'`EcranRestauration.tsx`
// ni du domaine `sauvegarde/` (09 §5.6). **A27 ne corrige rien** : ce qui est
// trouvé se laisse ROUGE, isolé, et se décrit au rapport.
//
// ── CE QU'IL TIENT DE PLUS QUE LES TESTS DU DOMAINE ─────────────────────────
// `sauvegarde.test.ts` prouve magnifiquement le FICHIER : clé dérivée du mot de
// passe, restauration sur une DEK différente, refus d'un chiffré altéré, fusion
// par UUID. Il ne prouve RIEN de l'écran. Or à P-C, ce n'est pas le domaine que
// l'auditeur touche à l'hôtel avec une tablette de remplacement : c'est ce
// formulaire-là, et lui seul. 07 ligne L5 dit « export de secours créé puis
// **restauré sur un 2ᵉ appareil** » — le 2ᵉ appareil, ici, c'est une base neuve
// et une **DEK différente**, et le fichier traverse un vrai `<input type="file">`.
//
// Ce que ce fichier éprouve, dans l'ordre :
//   A. les QUATRE états de 03 §33.2 — vide, chargement, erreur, hors ligne ;
//   B. le chemin heureux, de bout en bout, sur un appareil dont la DEK n'a
//      jamais vu ces données, et ce que l'écran DIT ensuite à l'auditeur ;
//   C. les refus — mauvais mot de passe, fichier altéré, fichier qui n'en est
//      pas un, persistance refusée : lisibles, nommant l'action, et **rien
//      d'écrit** ;
//   D. la panne de stockage. C'est le défaut exact qu'A02 a trouvé dans
//      `EcranFinDeSession` (`catch { return null; }` rendu « Aucune session
//      ouverte ») ; on vérifie ici qu'`EcranRestauration` ne le reproduit pas —
//      **et il ne le reproduit pas ; il en fabrique un autre**, voir §D.
//   E. la porte d'entrée `AccesRestauration`, et la grille tactile §22.1.
//
// Traçabilité : E38 (sauvegarde terrain, invariant 8), E6 (hors ligne total),
// E33 (sécurité / RGPD), E44 (UX/UI — les 4 états §33.2).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta, lireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EXTENSION_SAUVEGARDE, type FichierSauvegarde } from '../../sauvegarde/format.js';
import type * as ModuleSauvegarde from '../../sauvegarde/sauvegarde.js';
import { exporterSauvegarde } from '../../sauvegarde/sauvegarde.js';
import { AccesRestauration, EcranRestauration } from './EcranRestauration.js';

// -----------------------------------------------------------------------------
// Fixtures FICTIVES (invariant 2) — aucun nom réel, nulle part.
// -----------------------------------------------------------------------------
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const INSTANT = '2026-09-06T08:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-0000002741b0';
const UNITE_ID = '0191e2a0-0000-7000-8000-0000002741b1';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000002741b2';
const SESSION_ID = '0191e2a0-0000-7000-8000-0000002741b3';
/** Une sentinelle : si elle réapparaît dans la base cible, la mission est bien là. */
const NOM_SENTINELLE = 'Sentinelle-A27-Interlocuteur';

/** Argon2id allégé — la robustesse du KDF est prouvée ailleurs, pas ici. */
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
/** Deux KEK distinctes : l'appareil d'origine, et l'appareil de remplacement. */
let kekOrigine: CryptoKey;
let kekRemplacement: CryptoKey;
/** Le fichier `.axionbackup` produit une fois, relu par chaque test. */
let sauvegardeAvecOutbox: FichierSauvegarde;
let sauvegardeSansOutbox: FichierSauvegarde;

const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

/**
 * Un interrupteur pour faire rejeter le domaine avec autre chose qu'une `Error`.
 *
 * Le reste du module reste RÉEL — `exporterSauvegarde` produit de vrais fichiers,
 * `importerSauvegarde` restaure pour de bon dans les vingt autres cas. Seul le
 * cas défensif est fabriqué, parce qu'aucune fixture ne peut le produire.
 */
const domaine = vi.hoisted(() => ({ rejetSansError: false }));

vi.mock('../../sauvegarde/sauvegarde.js', async (importOriginal) => {
  const reel = await importOriginal<typeof ModuleSauvegarde>();
  return {
    ...reel,
    importerSauvegarde: (fichier: unknown, motDePasse: string) => {
      if (domaine.rejetSansError) {
        // Une chaîne nue : ce que rendent certaines API navigateur et tout code
        // qui fait `throw 'message'`. L'écran ne doit pas rester muet devant ça.
        // Rejeter autre chose qu'une `Error` est EXACTEMENT ce que ce cas éprouve :
        // c'est le seul moyen d'atteindre le garde `erreur instanceof Error ? … : …`.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('panne fictive rendue sous forme de chaîne');
      }
      return reel.importerSauvegarde(fichier, motDePasse);
    },
  };
});

// -----------------------------------------------------------------------------
// Le harnais d'appareil : une base Dexie RÉELLE, un coffre RÉEL.
// -----------------------------------------------------------------------------
async function appareilNeuf(kek: CryptoKey): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a27-b4-${String(compteur)}`);
  await base.open();
  bases.push(base);
  // Une DEK NEUVE à chaque ouverture (`creerDekEnveloppee` tire au hasard) : deux
  // appareils ne partagent jamais la clé de leurs données locales. C'est
  // exactement la condition qui rend la restauration non triviale.
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

/** Remplit l'appareil d'origine d'une mission fictive : 3 lignes, 1 op d'outbox. */
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
          titre: 'Mission fictive de recette A27',
          companyId: '0191e2a0-0000-7000-8000-0000002741a0',
          timezone: 'Europe/Paris',
          auditLevel: 'diagnostic_cadrage',
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

  // Écrite par le PORT : elle laisse donc une op dans l'outbox — c'est-à-dire le
  // travail que le serveur n'a pas reçu, le seul qui meure avec l'appareil.
  await ecrireLocal({
    entite: 'interview',
    id: SESSION_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: NOM_SENTINELLE,
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
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
}

/**
 * Produit un vrai `.axionbackup` depuis un appareil d'origine, puis démonte cet
 * appareil. Le fichier survit ; l'appareil, non — c'est le scénario réel.
 */
async function produireSauvegarde(options: {
  readonly outbox: boolean;
}): Promise<FichierSauvegarde> {
  const base = await appareilNeuf(kekOrigine);
  await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette fictive d’origine');
  await semerMission();
  if (!options.outbox) await base.outbox.clear();
  const fichier = await exporterSauvegarde({
    missionId: MISSION_ID,
    motDePasse: MOT_DE_PASSE,
    parametresKdf: KDF_TEST,
  });
  retirerContexteLocal();
  return fichier;
}

function fichierDe(contenu: unknown, nom = `secours${EXTENSION_SAUVEGARDE}`): File {
  return new File([typeof contenu === 'string' ? contenu : JSON.stringify(contenu)], nom, {
    type: 'application/json',
  });
}

/** Une copie profonde et modifiable du fichier — jamais la fixture partagée. */
function copie(fichier: FichierSauvegarde): FichierSauvegarde {
  return JSON.parse(JSON.stringify(fichier)) as FichierSauvegarde;
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

// -----------------------------------------------------------------------------
// `navigator.storage` — absent de jsdom, et l'écran l'EXIGE avant d'écrire
// (05 §31-2). On le pose explicitement à chaque test : ce que le navigateur
// répond est une VARIABLE de la recette, jamais un décor.
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Les trois gestes de l'auditeur, nommés comme il les vit.
// -----------------------------------------------------------------------------
function choisirLeFichier(fichier: File): void {
  const entree = screen.getByLabelText(/fichier de sauvegarde/i);
  fireEvent.change(entree, { target: { files: [fichier] } });
}

function saisirLeMotDePasse(valeur: string): void {
  fireEvent.change(screen.getByLabelText(/appareil qui a produit la sauvegarde/i), {
    target: { value: valeur },
  });
}

function boutonRestaurer(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: /restaurer sur cet appareil/i });
}

/** Le geste complet, tel que la checklist §15 le décrit à l'auditeur. */
function restaurer(fichier: File, motDePasse: string): void {
  choisirLeFichier(fichier);
  saisirLeMotDePasse(motDePasse);
  fireEvent.click(boutonRestaurer());
}

beforeAll(async () => {
  kekOrigine = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(41), KDF_TEST);
  kekRemplacement = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(97), KDF_TEST);
  poserStockage(STOCKAGE_ACCORDE);
  sauvegardeAvecOutbox = await produireSauvegarde({ outbox: true });
  sauvegardeSansOutbox = await produireSauvegarde({ outbox: false });
}, 60_000);

beforeEach(() => {
  poserStockage(STOCKAGE_ACCORDE);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  domaine.rejetSansError = false;
  retirerContexteLocal();
  poserStockage(null);
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// A. LES QUATRE ÉTATS (03 §33.2) — « un écran sans ses 4 états ne passe pas »
// ═════════════════════════════════════════════════════════════════════════════
describe('§33.2 — les quatre états, sur l’écran qui restaure', () => {
  it('@critique VIDE : aucun fichier choisi, et l’écran dit QUOI FAIRE', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);

    // §17.6 : l'état vide ne constate pas, il instruit.
    expect(document.body.textContent).toMatch(/aucun fichier choisi/i);
    expect(document.body.textContent).toMatch(
      /sélectionnez la sauvegarde produite sur l’appareil d’origine/i,
    );
    // Et il nomme l'extension attendue plutôt que de laisser deviner.
    expect(document.body.textContent).toContain(EXTENSION_SAUVEGARDE);
    // Le geste est INDISPONIBLE tant qu'il est impossible — jamais un bouton
    // actif qui échouerait ensuite.
    expect(boutonRestaurer().disabled).toBe(true);
  });

  it('le bouton reste indisponible avec un fichier SANS mot de passe, et l’inverse', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);

    choisirLeFichier(fichierDe(sauvegardeAvecOutbox));
    expect(document.body.textContent).toMatch(/fichier choisi : secours/i);
    expect(boutonRestaurer().disabled).toBe(true);

    saisirLeMotDePasse(MOT_DE_PASSE);
    expect(boutonRestaurer().disabled).toBe(false);

    // Le fichier retiré : on retombe dans l'état vide, sans message d'erreur.
    fireEvent.change(screen.getByLabelText(/fichier de sauvegarde/i), { target: { files: [] } });
    expect(boutonRestaurer().disabled).toBe(true);
    expect(document.body.textContent).toMatch(/aucun fichier choisi/i);
  });

  it('@critique CHARGEMENT : squelette annoncé, jamais un écran figé sans mot', async () => {
    // La dérivation Argon2id prend une seconde sur tablette : l'auditeur DOIT
    // savoir que quelque chose se passe. On tient la persistance ouverte pour
    // observer l'état intermédiaire, au lieu de courir après lui.
    let libererLaPersistance: () => void = () => undefined;
    const attente = new Promise<boolean>((resoudre) => {
      libererLaPersistance = () => {
        resoudre(true);
      };
    });
    poserStockage({ ...STOCKAGE_ACCORDE, persisted: () => attente });

    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    const occupe = await screen.findByRole('status');
    expect(occupe.getAttribute('aria-busy')).toBe('true');
    expect(occupe.textContent).toMatch(/déchiffrement et restauration en cours/i);
    // Un squelette, pas un spinner plein écran (§33.2).
    expect(document.querySelectorAll('.axn-squelette').length).toBeGreaterThan(0);

    await act(async () => {
      libererLaPersistance();
      await attente;
    });
    await screen.findByText(/sauvegarde restaurée/i);
  }, 30_000);

  it('@critique ERREUR : cause, action, et une SORTIE — l’auditeur n’est pas enfermé', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), 'ce-n-est-pas-le-bon-mot-de-passe');

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/le mot de passe ne correspond pas/i);
    expect(document.body.textContent).toMatch(/vérifiez le mot de passe et le fichier/i);
    // La sortie : on peut recommencer, et recommencer rend le formulaire.
    fireEvent.click(screen.getByRole('button', { name: /recommencer/i }));
    expect(screen.getByLabelText(/fichier de sauvegarde/i)).toBeInstanceOf(HTMLInputElement);
    expect(document.body.textContent).not.toMatch(/la sauvegarde n’a pas été restaurée/i);
  }, 30_000);

  it('@critique « Revenir » existe et ramène : l’écran n’est pas un cul-de-sac (B2)', async () => {
    // La restauration se tente sur un appareil de remplacement, souvent à tort —
    // un auditeur qui ouvre l'écran par curiosité doit pouvoir en sortir sans
    // choisir de fichier. `navigation.pile` porte deux vues : le retour a un sens.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);

    fireEvent.click(screen.getByRole('button', { name: /^revenir à l’accueil$/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'retour' });
  });

  it('@critique HORS LIGNE : la capacité locale est RAPPELÉE, pas seulement constatée', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);

    // En ligne : rien ne s'affiche — l'état hors ligne n'est pas un décor permanent.
    expect(document.body.textContent).not.toMatch(/intégralement sans réseau/i);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // §33.2 : « pastille discrète + rappel des capacités locales ». C'est le
    // rappel qui compte : sur un appareil de remplacement, à l'hôtel, l'auditeur
    // doit lire que ceci marche SANS réseau, sinon il attend du wifi pour rien.
    expect(document.body.textContent).toMatch(
      /restaurer une sauvegarde de secours, intégralement sans réseau/i,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. LE 2ᵉ APPAREIL — 07 ligne L5, « restauré sur un 2ᵉ appareil »
// ═════════════════════════════════════════════════════════════════════════════
describe('un `.axionbackup` valide, restauré par l’ÉCRAN sur un appareil dont la DEK est DIFFÉRENTE', () => {
  it('@critique les données arrivent réellement dans la base cible, et la mission est EMBARQUÉE', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    expect(await base.interviews.count()).toBe(0);

    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/sauvegarde restaurée/i);

    // Ce n'est pas le message qui prouve la restauration : c'est la base.
    const session = await depotSessions.parId(SESSION_ID);
    expect(session).not.toBeNull();
    expect(session?.personName).toBe(NOM_SENTINELLE);
    expect(await base.missions.count()).toBe(1);
    // Sans cette marque, le cockpit dirait « aucune mission » à un appareil qui
    // vient d'en restaurer une, et proposerait de la télécharger — sans réseau.
    expect(await lireMeta(base, cleEmbarquement(MISSION_ID))).not.toBeNull();
  }, 30_000);

  it('@critique l’écran dit COMBIEN, puis offre le seul geste utile : ouvrir sa journée', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/sauvegarde restaurée/i);
    // 3 lignes semées : la mission, l'unité, la session.
    expect(document.body.textContent).toMatch(/3 élément\(s\) de mission restauré\(s\)/i);
    expect(document.body.textContent).toMatch(
      /la mission est maintenant présente sur cet appareil/i,
    );

    // Le formulaire a disparu : on ne restaure pas deux fois par distraction.
    expect(screen.queryByLabelText(/appareil qui a produit la sauvegarde/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ouvrir ma journée/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'racine', vue: 'aujourdhui' });
  }, 30_000);

  it('@critique la file d’envoi NON réinjectée est DITE, jamais tue', async () => {
    // DECISIONS.md 2026-09-05 : les données sont restaurées, la file ne l'est
    // pas. Même parti que le port de sync inerte — jamais une pastille verte.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/sauvegarde restaurée/i);
    expect(document.body.textContent).toMatch(/file d’envoi non restaurée/i);
    expect(document.body.textContent).toMatch(
      /1 élément\(s\) de collecte qui n’avaient pas encore été synchronisés/i,
    );
    expect(document.body.textContent).toMatch(/repartiront au prochain envoi complet/i);
  }, 30_000);

  it('anti-vacuité : sans op en attente, l’avertissement N’EST PAS affiché', async () => {
    // Un écran qui afficherait l'avertissement en permanence apprendrait à
    // l'auditeur à ne plus le lire — c'est ainsi qu'un vrai avertissement meurt.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeSansOutbox), MOT_DE_PASSE);

    await screen.findByText(/sauvegarde restaurée/i);
    expect(document.body.textContent).not.toMatch(/file d’envoi non restaurée/i);
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// C. LES REFUS — lisibles, nommant l'action, et RIEN d'écrit
// ═════════════════════════════════════════════════════════════════════════════
describe('un refus est un refus : le message nomme le geste, et la base reste intacte', () => {
  it('@critique MAUVAIS MOT DE PASSE : refus lisible, et aucune ligne écrite', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), 'mot-de-passe-fictif-errone');

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/aucune donnée de cet appareil n’a été modifiée/i);
    expect(await base.interviews.count()).toBe(0);
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique FICHIER ALTÉRÉ : le chiffré modifié est refusé comme un mauvais mot de passe', async () => {
    // AES-GCM authentifie : altération et mauvais mot de passe se ressemblent, et
    // c'est correct — les distinguer donnerait un oracle sur ce qui a été modifié.
    const altere = copie(sauvegardeAvecOutbox);
    const octets = Uint8Array.from(atob(altere.charge.c), (c) => c.charCodeAt(0));
    octets[10] = (octets[10] ?? 0) ^ 0xff;
    const mute = {
      ...altere,
      charge: { ...altere.charge, c: btoa(String.fromCharCode(...octets)) },
    };

    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(mute), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/ou le fichier a été altéré/i);
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique UN FICHIER QUI N’EN EST PAS UN : l’action nomme l’extension attendue', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    // Un PDF renommé, une photo, un fichier tronqué par un transfert : le cas
    // banal d'un auditeur qui fouille sa clé USB à 22 h.
    restaurer(fichierDe('%PDF-1.7 ceci n’est pas du JSON', 'rapport.pdf'), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/n’est pas lisible comme une sauvegarde axion/i);
    expect(document.body.textContent).toContain(EXTENSION_SAUVEGARDE);
    expect(await base.missions.count()).toBe(0);
  });

  it('@critique UN JSON DE LA MAUVAISE FORME est refusé AVANT tout déchiffrement', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe({ enTete: { versionFormat: 1 } }), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/sa structure ne correspond pas au format attendu/i);
    expect(await base.missions.count()).toBe(0);
  });

  it('@critique UNE SAUVEGARDE D’UNE VERSION PLUS RÉCENTE : refus qui dit de mettre à jour', async () => {
    const future = copie(sauvegardeAvecOutbox);
    const mute = {
      ...future,
      enTete: { ...future.enTete, versionSchemaLocal: future.enTete.versionSchemaLocal + 100 },
    };
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(mute), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/mettez cet appareil à jour avant de restaurer/i);
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique PERSISTANCE REFUSÉE : le guidage s’affiche, et RIEN n’est écrit (05 §31-2)', async () => {
    // Restaurer dans un stockage que le navigateur peut effacer, ce serait
    // recréer la perte qu'on vient de réparer.
    poserStockage({
      persist: () => Promise.resolve(false),
      persisted: () => Promise.resolve(false),
      estimate: () => Promise.resolve({ quota: 10 * 1024 ** 3, usage: 1024 ** 3 }),
    });
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(
      /le navigateur ne garantit pas de conserver les données/i,
    );
    // L'action est le geste iPad, écrit en toutes lettres (03 §22.1).
    expect(document.body.textContent).toMatch(/sur l’écran d’accueil/i);
    expect(await base.missions.count()).toBe(0);
  }, 30_000);

  it('@critique API DE PERSISTANCE ABSENTE : ni oui ni non arrondi — le navigateur est nommé', async () => {
    poserStockage(null);
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/ne sait pas garantir la conservation/i);
    expect(document.body.textContent).toMatch(/safari \(ipad, version 16\.4 ou plus\)/i);
    expect(await base.missions.count()).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. LA PANNE DE STOCKAGE — le défaut B5 cherché ici, et celui qu'on a trouvé
// ═════════════════════════════════════════════════════════════════════════════
describe('une panne du stockage local ne se déguise ni en état vide, ni en succès', () => {
  it('@critique APPLICATION VERROUILLÉE : erreur nommée, jamais un faux succès', async () => {
    // `importerSauvegarde` appelle `contexteLocal()`, qui lève quand le coffre est
    // fermé. C'est le chemin PROPRE : l'écran l'attrape et le dit.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    choisirLeFichier(fichierDe(sauvegardeAvecOutbox));
    saisirLeMotDePasse(MOT_DE_PASSE);
    retirerContexteLocal();
    fireEvent.click(boutonRestaurer());

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/l’application est verrouillée/i);
    expect(document.body.textContent).not.toMatch(/sauvegarde restaurée/i);
  }, 30_000);

  it('@critique UN REJET QUI N’EST PAS UNE `Error` reste un message, jamais un écran muet', async () => {
    // Le garde-fou défensif de l'écran (`erreur instanceof Error ? … : …`). Il ne
    // sert à rien tant que le domaine lève proprement — et c'est précisément
    // pourquoi il faut l'éprouver : le jour où une API navigateur rejette une
    // chaîne, ce garde est la seule chose entre l'auditeur et un écran figé.
    domaine.rejetSansError = true;
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).toMatch(/la restauration a échoué/i);
    expect(document.body.textContent).toMatch(/rien n’a été modifié/i);
    // Le détail technique ne fuit pas dans l'écran (§33.2 : « code technique replié »).
    expect(document.body.textContent).not.toMatch(/panne fictive rendue sous forme de chaîne/i);
  }, 30_000);

  it('@critique ÉCRITURE DEXIE IMPOSSIBLE : erreur affichée, et aucune promesse de succès', async () => {
    // La base fermée sous les pieds de l'import : quota atteint, onglet tué,
    // migration en cours. `appliquerDescente` lève, et l'écran doit le dire.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);
    choisirLeFichier(fichierDe(sauvegardeAvecOutbox));
    saisirLeMotDePasse(MOT_DE_PASSE);
    base.close();
    fireEvent.click(boutonRestaurer());

    await screen.findByText(/la sauvegarde n’a pas été restaurée/i);
    expect(document.body.textContent).not.toMatch(/sauvegarde restaurée/i);
    expect(document.body.textContent).toMatch(/vérifiez le mot de passe et le fichier/i);
  }, 30_000);

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ CE TEST EST **ROUGE**, ET IL EST LAISSÉ ROUGE (09 §5.6).
  //
  // DÉFAUT A27-D1, `EcranRestauration.tsx:67-69` :
  //
  //     void (async (): Promise<void> => {
  //       const persistance = await exigerPersistance();   // ← hors de tout try
  //
  // `exigerPersistance()` est le SEUL appel de la fonction qui ne soit pas gardé.
  // S'il REJETTE — et il rejette : `navigator.storage.persist()` et
  // `.estimate()` lèvent `SecurityError` sur WebKit en navigation privée et en
  // contexte non sécurisé, c'est-à-dire sur l'iPad de 03 §22.1 — la promesse de
  // l'IIFE part en rejet non géré, `setPhase` n'est jamais rappelé, et l'écran
  // reste **définitivement** sur « Déchiffrement et restauration en cours ».
  //
  // Ce n'est pas le défaut B5 (l'erreur déguisée en vide) : c'est son cousin, et
  // il est PIRE pour l'auditeur. Le vide dit une chose fausse ; le squelette
  // perpétuel ne dit rien du tout, et invite à attendre — sur un appareil de
  // remplacement, un soir, avec une journée de collecte dans un seul fichier.
  // Aucun bouton n'existe pour en sortir : l'état `en_cours` retire le
  // formulaire, `Recommencer` n'appartient qu'à l'état d'erreur.
  //
  // ATTENDU : un état d'ERREUR, avec cause et action, comme les six refus du §C.
  // OBTENU  : `role="status"` `aria-busy="true"`, indéfiniment.
  // RENDU À : A20 → A22/A23/A24. **A27 ne corrige aucun code de production.**
  // ───────────────────────────────────────────────────────────────────────────
  it('@critique le stockage qui LÈVE ne laisse pas l’écran en chargement perpétuel', async () => {
    // Le rejet non géré est le SYMPTÔME, pas l'objet du test : on met en sourdine
    // le bruit de Node pour que l'échec lu par le pilote soit l'assertion, une
    // seule, et pas une pile de rejets. Les écouteurs sont rendus à la fin.
    const ecouteurs = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => undefined);
    try {
      poserStockage({
        persist: () => Promise.reject(new Error('SecurityError fictive — stockage indisponible')),
        persisted: () => Promise.reject(new Error('SecurityError fictive — stockage indisponible')),
        estimate: () => Promise.reject(new Error('SecurityError fictive — stockage indisponible')),
      });
      const base = await appareilNeuf(kekRemplacement);
      terrain = terrainDeRestauration(base);
      render(<EcranRestauration />);
      restaurer(fichierDe(sauvegardeAvecOutbox), MOT_DE_PASSE);

      await waitFor(
        () => {
          expect(
            document.body.textContent,
            'DÉFAUT A27-D1 : `exigerPersistance()` est appelé hors de tout `try` ' +
              '(EcranRestauration.tsx:69). Son rejet fige l’écran sur le squelette ' +
              '« Déchiffrement et restauration en cours », sans cause, sans action et ' +
              'sans issue. Attendu : un état d’erreur.',
          ).toMatch(/la sauvegarde n’a pas été restaurée/i);
        },
        { timeout: 3_000 },
      );
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const ecouteur of ecouteurs) {
        process.on('unhandledRejection', ecouteur as (raison: unknown) => void);
      }
    }
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// E. LA PORTE D'ENTRÉE, ET LA GRILLE TACTILE §22.1
// ═════════════════════════════════════════════════════════════════════════════
describe('AccesRestauration — la porte, là où un appareil neuf en a besoin', () => {
  it('@critique un bouton, atteignable AVANT toute mission, qui mène à la restauration', async () => {
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<AccesRestauration />);

    const bouton = screen.getByRole('button', { name: /restaurer une sauvegarde de secours/i });
    fireEvent.click(bouton);
    expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'aller', vue: 'restauration' });
  });
});

describe('§22.1 — les cibles tactiles de l’écran de restauration', () => {
  it('@critique chaque élément interactif porte une classe du design system, aucune taille en dur', async () => {
    // jsdom ne peint rien : ce qui est vérifiable ici est le CONTRAT entre le DOM
    // et la feuille de style — chaque contrôle porte une classe dont la règle CSS
    // pose une hauteur sur un jeton. Le rendu peint sur iPad Safari reste dû à un
    // appareil réel (P-C, checklist 07 §15), et n'est pas affirmé ici.
    const base = await appareilNeuf(kekRemplacement);
    terrain = terrainDeRestauration(base);
    render(<EcranRestauration />);

    const interactifs = [...document.querySelectorAll('button, input, select, textarea')];
    expect(interactifs.length, 'un écran sans contrôle ne prouve rien').toBeGreaterThan(0);

    const sansClasse = interactifs
      .filter((e) => !/axn-bouton|axn-champ__saisie/.test(e.className))
      .map((e) => `<${e.tagName.toLowerCase()} class="${e.className}">`);
    expect(sansClasse, sansClasse.join('\n')).toEqual([]);

    // Invariant 4 : aucune couleur ni taille en ligne, sur aucun nœud rendu.
    const enDur = [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style'));
    expect(enDur).toEqual([]);
  });
});
