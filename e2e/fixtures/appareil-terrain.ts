// =============================================================================
// FIXTURE E2E — UN APPAREIL TERRAIN DÉJÀ ÉQUIPÉ, FABRIQUÉ HORS LIGNE
//
// ── LE PROBLÈME QUE CE FICHIER RÉSOUT, ET QU'IL NE MASQUE PAS ───────────────
// Sur un appareil neuf, RIEN ne peut être collecté sans serveur : le premier
// pull est descopé vers L6a (`local/embarquement.ts`) et l'identité d'auditeur
// n'est écrite que par la connexion au siège (`session/auditeur.ts` —
// `memoriserIdentiteAuditeur` n'a, à ce jour, aucun appelant de production).
// Les critères 3, 4 et 5 du 07 ligne L5 — « 1 session de chaque type créée hors
// ligne », « coupure en pleine saisie », « export créé puis restauré » — portent
// pourtant sur ce qui se passe APRÈS l'embarquement. Sans mission ni auditeur
// sur l'appareil, ils ne sont pas mesurables du tout : c'est exactement le mur
// sur lequel la recette novice A54 s'est arrêtée.
//
// Cette fixture pose donc l'état d'APRÈS embarquement, et rien de plus.
//
// ── LA RÈGLE QU'ELLE S'IMPOSE : AUCUNE CRYPTO RÉÉCRITE ICI ──────────────────
// Les octets sont produits par le code de PRODUCTION, importé tel quel :
// `deriverKek` (Argon2id, hash-wasm), `creerCoffreNeuf`, `Coffre.chiffrer`. La
// fixture ne fait que les RANGER dans IndexedDB. Ré-implémenter l'enveloppe ou
// la dérivation dans un test reviendrait à éprouver une seconde crypto — celle
// du test — et à passer au vert le jour où les deux divergent. 09 §5.7 : on ne
// simplifie pas la sécurité pour faire passer un scénario.
//
// La conséquence utile : l'application DÉVERROUILLE ensuite ces données par son
// chemin normal (`deverrouiller` → Argon2id → `unwrapKey`). Si le format du
// coffre au repos ou celui de l'enveloppe changeait, ces tests casseraient — ce
// qui est le comportement souhaité.
//
// ── CE QUE LA FIXTURE N'EST PAS ─────────────────────────────────────────────
// Elle n'écrit dans AUCUN fichier de production, elle n'ajoute aucune porte
// d'amorçage à l'application, et elle ne rend vrai aucun chemin qui serait faux
// sans elle. Un appareil réel obtiendra ces mêmes lignes par le premier pull de
// L6a ; le jour où il existera, cette fixture pourra être remplacée par lui.
//
// Invariant 2 : la mission est FIL-TPE, entreprise FICTIVE (09 §4bis). Aucune
// référence client, ici comme ailleurs.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E33 (sécurité / RGPD),
// E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours).
// =============================================================================
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
  type Coffre,
  type Enveloppe,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import {
  jetonsDeRecherche,
  type ChargeMission,
  type ChargeMissionQuestion,
  type ChargeOrgUnit,
  type IndexMission,
  type IndexMissionQuestion,
  type IndexOrgUnit,
} from '../../apps/field/src/local/formes.js';

/** L'URL du front terrain servi par `vite preview` (playwright.config.ts). */
export const URL_TERRAIN = 'http://127.0.0.1:4173/';

/**
 * Le mot de passe de l'appareil d'origine, et celui de l'appareil de secours.
 *
 * Deux mots de passe DIFFÉRENTS, et c'est le cœur du critère 5 : la sauvegarde
 * est chiffrée sous une clé dérivée du mot de passe de l'appareil d'origine
 * (11 §4), donc elle doit s'ouvrir sur un appareil dont la DEK — et le mot de
 * passe — n'ont rien à voir. Secrets FACTICES, comme l'exige `CLAUDE.md` §2.
 */
export const MOT_DE_PASSE_APPAREIL = 'tournee-fil-tpe-2026';
export const MOT_DE_PASSE_SECOND_APPAREIL = 'appareil-de-remplacement-9';

/**
 * Les identifiants sont des LITTÉRAUX v7, pas un tirage.
 *
 * Deux raisons, dans cet ordre. ① Une fixture déterministe se relit dans une
 * trace d'échec ; un identifiant tiré au sort ne se compare à rien. ② Le seul
 * générateur d'UUID autorisé dans ce dépôt est la lib `uuidv7` (invariant 1), et
 * elle n'est pas une dépendance de la racine : en écrire un second ici — fût-ce
 * pour un test — serait précisément ce que l'invariant interdit. Ces valeurs
 * portent la version 7 et la variante RFC : ce sont des UUID v7 valides, figés.
 */
const MISSION_ID = '01920000-0000-7000-8000-000000000001';
const UNITE_ID = '01920000-0000-7000-8000-000000000002';
const SOCIETE_ID = '01920000-0000-7000-8000-000000000003';
const AUDITEUR_ID = '01920000-0000-7000-8000-000000000004';
const QUESTION_BANQUE_ID = '01920000-0000-7000-8000-00000000000a';
const APPAREIL_ID = '01920000-0000-7000-8000-0000000000ff';

/**
 * Le fuseau de la mission.
 *
 * Le MÊME que celui du navigateur de test (playwright.config.ts) et ce n'est pas
 * une facilité : le cockpit découpe la journée au fuseau de la MISSION (03
 * §34.2). Deux fuseaux distincts feraient basculer « aujourd'hui » d'un jour
 * selon l'heure d'exécution, et la suite deviendrait rouge une nuit sur deux
 * pour une raison qui n'a rien à voir avec le hors ligne.
 */
const FUSEAU_MISSION = 'Europe/Paris';

/**
 * Le type de réponse, lu DEPUIS la forme de l'index locale.
 *
 * `@axion/shared` n'est pas une dépendance de la racine — le projet TypeScript
 * qui couvre `e2e/` ne sait donc pas le résoudre, et un import direct y donnerait
 * un type d'erreur qu'ESLint refuse à juste titre. L'accès indexé, lui, passe par
 * `formes.ts`, qui le résout depuis SON répertoire : une seule source, et pas de
 * seconde liste de types de réponse.
 */
type TypeDeReponse = IndexMissionQuestion['answerType'];

/** Les questions figées de la fixture. La première est libre : c'est celle qu'on saisit. */
const QUESTIONS: readonly {
  readonly id: string;
  readonly texte: string;
  readonly type: TypeDeReponse;
}[] = [
  {
    id: '01920000-0000-7000-8000-000000000011',
    texte: 'Décrivez le déroulement d’une commande, de sa réception à sa livraison.',
    type: 'free_text',
  },
  {
    id: '01920000-0000-7000-8000-000000000012',
    texte: 'Les procédures de l’atelier sont-elles écrites ?',
    type: 'yes_no',
  },
  {
    id: '01920000-0000-7000-8000-000000000013',
    texte: 'À quel point l’outil de gestion couvre-t-il vos besoins ?',
    type: 'scale_1_5',
  },
];

/** Le texte de la première question : les tests le cherchent à l'écran. */
export const PREMIERE_QUESTION = QUESTIONS[0]?.texte ?? '';

export const MISSION_FIL_TPE = {
  id: MISSION_ID,
  uniteId: UNITE_ID,
  titre: 'FIL-TPE — atelier de mécanique',
  unite: 'Atelier de production',
} as const;

/** Une ligne prête à être rangée dans IndexedDB : index en clair + charge chiffrée. */
type LignePlantee = Record<string, unknown> & { readonly id: string; readonly charge: Enveloppe };

/** Ce que `planterAppareil` dépose : les tables miroirs, puis `meta`. */
export interface GrainesAppareil {
  readonly tables: Readonly<Record<string, readonly LignePlantee[]>>;
  readonly meta: readonly { readonly cle: string; readonly valeur: unknown }[];
}

/** L'identité d'auditeur, dans la forme qu'`identiteAuditeurSchema` valide. */
async function chiffrerIdentite(coffre: Coffre, id: string): Promise<Enveloppe> {
  return coffre.chiffrer({ id, profil: 'guide_strict' });
}

/**
 * Fabrique le coffre de l'appareil ET les lignes de mission qu'il protège.
 *
 * Tout est chiffré par le coffre RÉEL. Le déchiffrement, lui, aura lieu dans le
 * navigateur, par le code de production, à partir du seul mot de passe.
 */
export async function semerAppareil(motDePasse: string): Promise<GrainesAppareil> {
  const sel = genererSel();
  const kek = await deriverKek(motDePasse, sel, PARAMETRES_KDF_DEFAUT);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);

  const instant = new Date().toISOString();

  const mission: IndexMission = {
    id: MISSION_ID,
    status: 'en_cours',
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const chargeMission: ChargeMission = {
    titre: MISSION_FIL_TPE.titre,
    companyId: SOCIETE_ID,
    timezone: FUSEAU_MISSION,
    auditLevel: 'standard',
    geoScope: 'france',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };

  const unite: IndexOrgUnit = {
    id: UNITE_ID,
    missionId: MISSION_ID,
    parentId: null,
    kind: 'service',
    status: 'active',
    position: 1,
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const chargeUnite: ChargeOrgUnit = {
    name: MISSION_FIL_TPE.unite,
    countryCode: 'FR',
    timezone: FUSEAU_MISSION,
    headcount: 12,
    serviceRefId: null,
    sectorId: null,
    inScope: true,
    proposedBy: null,
    mergedIntoId: null,
    clientCreatedAt: instant,
  };

  const questions: LignePlantee[] = [];
  for (const [rang, question] of QUESTIONS.entries()) {
    const index: IndexMissionQuestion = {
      id: question.id,
      missionId: MISSION_ID,
      position: rang + 1,
      texteSnapshot: question.texte,
      // La tokenisation vient du code de production : la recherche hors-parcours
      // (03 §25.4) compare des jetons normalisés, et deux normalisations
      // différentes rendraient la fixture introuvable par l'écran qui la cherche.
      motsCles: jetonsDeRecherche(question.texte),
      answerType: question.type,
      criticality: 'important',
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeMissionQuestion = {
      questionId: QUESTION_BANQUE_ID,
      questionVersion: 1,
      guidanceSnapshot: null,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: null,
      allowRangeSnapshot: false,
      addedAdHoc: false,
      blockCode: 'B1',
    };
    questions.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  return {
    tables: {
      missions: [{ ...mission, charge: await coffre.chiffrer(chargeMission) }],
      orgUnits: [{ ...unite, charge: await coffre.chiffrer(chargeUnite) }],
      missionQuestions: questions,
    },
    meta: [
      // Le coffre au repos, dans la forme EXACTE que `lireCoffreAuRepos` valide.
      {
        cle: 'coffre',
        valeur: { sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT, dekEnveloppee },
      },
      { cle: 'appareil', valeur: APPAREIL_ID },
      { cle: 'appareil:libelle', valeur: 'Appareil de tournée (fixture E2E)' },
      // L'identité de l'auditeur : `conducted_by` de toute session créée ici
      // (05 §9.9). Chiffrée sous la DEK, comme le ferait la connexion au siège.
      { cle: 'auth:utilisateur', valeur: await chiffrerIdentite(coffre, AUDITEUR_ID) },
      // Les DONNÉES sont présentes : c'est ce que la marque d'embarquement dit,
      // et rien d'autre (DECISIONS.md 2026-09-02).
      { cle: `mission:embarquee:${MISSION_ID}`, valeur: instant },
      { cle: `mission:persistance:${MISSION_ID}`, valeur: instant },
    ],
  };
}

/**
 * Range les graines dans l'IndexedDB de l'onglet courant, puis recharge.
 *
 * L'ordre importe : la page est chargée UNE fois pour que Dexie crée les magasins
 * — le test ne redéclare donc aucun schéma local, et une copie du schéma ne peut
 * pas dériver de l'original. Les lignes sont ensuite déposées par l'API IndexedDB
 * brute, et le rechargement fait relire le tout à l'application.
 */
export async function planterAppareil(page: Page, graines: GrainesAppareil): Promise<void> {
  await page.goto(URL_TERRAIN);
  await expect(page.getByRole('heading', { name: 'Préparer cet appareil' })).toBeVisible();

  await page.evaluate(async (semences: GrainesAppareil) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = () => {
        resoudre(demande.result);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
      };
    });

    const magasins = [...Object.keys(semences.tables), 'meta'];
    const transaction = base.transaction(magasins, 'readwrite');
    for (const [nom, lignes] of Object.entries(semences.tables)) {
      for (const ligne of lignes) transaction.objectStore(nom).put(ligne);
    }
    for (const ligne of semences.meta) transaction.objectStore('meta').put(ligne);

    await new Promise<void>((resoudre, rejeter) => {
      transaction.oncomplete = () => {
        resoudre();
      };
      transaction.onerror = () => {
        rejeter(transaction.error ?? new Error('transaction de semis refusée'));
      };
    });
    base.close();
  }, graines);

  await page.reload();
}

/**
 * Saisit le mot de passe et attend que le coffre soit ouvert.
 *
 * C'est le chemin de production intégral : Argon2id dans le navigateur, DEK
 * désenveloppée par WebCrypto, contexte local installé. Aucun raccourci.
 */
export async function deverrouillerAppareil(page: Page, motDePasse: string): Promise<void> {
  const titre = page.getByRole('heading', { name: 'Déverrouiller la collecte' });
  await expect(titre).toBeVisible();
  // Le libellé accessible porte l'astérisque d'obligation (« Mot de passe* ») :
  // une correspondance EXACTE sur « Mot de passe » ne trouve rien, et une
  // correspondance partielle attrape aussi « Confirmer le mot de passe ». Un
  // ancrage en début de chaîne dit exactement ce qu'on veut.
  await page.getByLabel(/^Mot de passe/).fill(motDePasse);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  // 11 §4 : la dérivation peut prendre jusqu'à une seconde sur tablette. On
  // attend l'ÉCRAN, jamais un délai — un `waitForTimeout` transformerait une
  // machine lente en échec et une machine rapide en test qui ne prouve rien.
  await expect(titre).toBeHidden({ timeout: 30_000 });
}

/** Crée un coffre NEUF par l'écran de première utilisation — un appareil vierge. */
export async function preparerAppareilNeuf(page: Page, motDePasse: string): Promise<void> {
  const titre = page.getByRole('heading', { name: 'Préparer cet appareil' });
  await expect(titre).toBeVisible();
  await page.getByLabel(/^Mot de passe/).fill(motDePasse);
  await page.getByLabel(/^Confirmer le mot de passe/).fill(motDePasse);
  await page.getByRole('button', { name: 'Créer la protection de cet appareil' }).click();
  await expect(titre).toBeHidden({ timeout: 30_000 });
}

/**
 * Un PROFIL NAVIGATEUR SUR DISQUE, remis à neuf, autorisé à conserver ses données.
 *
 * ── POURQUOI SUR DISQUE ─────────────────────────────────────────────────────
 * `browser.newContext()` range son stockage dans un dossier détruit à la
 * fermeture : un test qui « prouverait » la perte de données par la mécanique du
 * test ne prouverait rien. Les scénarios qui ferment puis rouvrent l'appareil —
 * coupure brutale, appareil de remplacement — exigent un vrai profil.
 *
 * ── POURQUOI UN CHEMIN EN ASCII, POSÉ À LA MAIN ─────────────────────────────
 * Mesuré le 2026-09-06, sous Windows : `test.info().outputPath()` dérive son
 * chemin du NOM DU TEST, lequel contient ici des caractères accentués et des
 * apostrophes typographiques. Le service worker lancé sur un profil dont le
 * chemin les porte reste indéfiniment « installing » — le précache n'aboutit
 * jamais et le mode avion échoue pour une raison qui n'a rien à voir avec
 * l'application. Le dossier est donc nommé ici, en ASCII.
 *
 * ── POURQUOI LE STOCKAGE DURABLE EST ACCORDÉ EXPLICITEMENT ──────────────────
 * 05 §31-2 fait de `navigator.storage.persist()` une CONDITION : refus = mission
 * non embarquée, et l'écran de restauration refuse d'écrire. Chromium ne
 * l'accorde qu'à une application installée ou fortement fréquentée — jamais à un
 * navigateur de test. Le refuser ici ferait échouer les scénarios sur le seul
 * fait que Playwright n'installe pas de PWA, alors que l'iPad de l'auditeur,
 * lui, l'a installée (03 §22.1). On accorde donc ce que l'appareil réel a déjà.
 * Ce n'est pas un contournement du garde-fou : c'est son état nominal.
 */
export async function ouvrirProfilSurDisque(
  nom: string,
  options: Parameters<typeof chromium.launchPersistentContext>[1],
  /**
   * `'neuf'` efface le dossier avant d'ouvrir — un profil résiduel ferait passer
   * un test sans que rien n'ait été éprouvé. `'tel_quel'` le rouvre : c'est la
   * machine qui redémarre après la coupure.
   */
  etat: 'neuf' | 'tel_quel' = 'neuf',
): Promise<{ contexte: BrowserContext; page: Page }> {
  const dossier = join(test.info().project.outputDir, `${nom}-${String(process.pid)}`);
  if (etat === 'neuf') rmSync(dossier, { recursive: true, force: true });
  const contexte = await chromium.launchPersistentContext(dossier, options);
  const page = contexte.pages()[0] ?? (await contexte.newPage());
  await page.goto(URL_TERRAIN);
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Browser.grantPermissions', {
    origin: new URL(URL_TERRAIN).origin,
    permissions: ['durableStorage'],
  });
  return { contexte, page };
}

/**
 * Lit une table locale par l'API IndexedDB brute.
 *
 * Le test regarde les INDEX EN CLAIR (`kind`, `status`, `interviewId`…), jamais
 * une charge : il n'a pas la DEK et n'a pas à l'avoir. C'est aussi ce qui rend
 * ces lectures indépendantes de l'écran qui les a produites — un affichage peut
 * mentir, une ligne écrite, non.
 */
export async function lireTableLocale(page: Page, nom: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (table: string) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = () => {
        resoudre(demande.result);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
      };
    });
    const lignes = await new Promise<Record<string, unknown>[]>((resoudre, rejeter) => {
      const demande = base.transaction(table).objectStore(table).getAll();
      demande.onsuccess = () => {
        resoudre(demande.result as Record<string, unknown>[]);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('lecture locale refusée'));
      };
    });
    base.close();
    return lignes;
  }, nom);
}
