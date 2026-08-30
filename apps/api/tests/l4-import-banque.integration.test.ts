// =============================================================================
// LOT L4 — L'IMPORT DE LA BANQUE DE QUESTIONS, ÉPROUVÉ SUR UNE BASE RÉELLE.
//
// Écrit par un agent qui n'a produit AUCUNE ligne de
// `apps/api/scripts/import-banque-questions.mjs` (09 §5.6 : « le code de test
// n'est jamais écrit par l'agent qui a écrit le code testé »). Les attentes
// viennent de la SPÉCIFICATION — 03 §36.4 (format et contrôles bloquants),
// 03 §32.1 / 04 §7.3 (forme normée de `questions.scoring` et « toute question
// weight > 0 sans scoring valide est REJETÉE à l'import »), 03 §32.4 (ancres),
// 04 §7.1 (index UNIQUE partiel `questions(code, version)`) — jamais du décalque
// des branches du script.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CE FICHIER EXISTE : L4 ÉTAIT LE SEUL LOT LIVRÉ SANS AUCUN GARDE EN CI.
// ═══════════════════════════════════════════════════════════════════════════════
// Mesure du 2026-08-30 : 26 fichiers de test dans le dépôt, AUCUN n'exécutait le
// script d'import. Le lot livre pourtant la seule porte d'entrée de la banque —
// celle qui décide ce qui sera figé dans `mission_questions` et coté par L8.
//
// ── LES QUATRE PIÈGES QUE CE FICHIER FERME ───────────────────────────────────
// ① « ATOMIQUE » ≠ « ARRÊT À LA PREMIÈRE ERREUR ». Un fichier à UNE seule erreur
//    ne distingue pas les deux mondes : les deux refusent tout et n'écrivent rien.
//    Le fichier du test d'atomicité porte donc QUATRE erreurs sur QUATRE lignes
//    différentes — un script qui s'arrêterait au premier défaut n'en rapporterait
//    qu'une, et le test rougirait. Il porte AUSSI une ligne parfaitement valide,
//    qui ne doit pas être écrite : c'est l'autre moitié de l'atomicité.
// ② « TOUT REFUSER » PASSE TOUS LES TESTS DE REFUS. D'où une contre-épreuve
//    systématique : un fichier conforme DOIT s'importer, et les colonnes écrites
//    sont relues une à une. Sans elle, un script qui refuserait tout serait vert.
// ③ « TOUT ACCEPTER » PASSE TOUS LES TESTS D'ACCEPTATION. D'où le contrôle §32.1
//    joué sur un fichier qui contient la question conforme ET la non conforme :
//    ce qui est prouvé, c'est que le filtre DISCRIMINE.
// ④ UN NUMÉRO DE LIGNE FAUX EST PIRE QU'ABSENT — il envoie l'administrateur
//    corriger la mauvaise ligne. Le test de numérotation place donc une cellule
//    multi-lignes entre guillemets AVANT la ligne fautive : le numéro attendu est
//    celui du TABLEUR, pas celui de l'enregistrement.
// ⑤ CE QUE LE TABLEUR ÉCRIT N'EST PAS CE QU'ON TAPE. Excel FR termine ses lignes
//    en CRLF, y compris À L'INTÉRIEUR d'une cellule entre guillemets : des ancres
//    §32.4 saisies sur trois lignes arrivent séparées par `\r\n`, jamais par `\n`
//    seul. Deux tests de ce fichier travaillent donc en CRLF DANS la cellule —
//    un défaut de cette famille rejette du contenu PARFAITEMENT VALIDE, et c'est
//    le pire refus qui soit : celui que l'administrateur ne peut pas corriger.
// ⑥ UN RÉ-IMPORT NE DOIT PAS INVENTER D'HISTORIQUE. « Inchangée » se décide sur
//    le SENS de la question, pas sur la mise en forme de son fichier : le même
//    contenu réécrit autrement ne crée pas de version, un contenu réellement
//    modifié en crée une.
//
// Le format §36.4 est TRANSCRIT ici (constante `COLONNES_36_4`) et non importé de
// `@axion/shared` : importer la liste du code testé ferait passer le test quelle
// que soit la liste, y compris fausse. Une divergence entre le pack et le code
// DOIT faire rougir la suite.
//
// Traçabilité : E10 (banque UNIQUE versionnée), E37 (contrôle bloquant à
// l'import), E47 (format d'import §36.4) · critère L4 du fichier 07.
// =============================================================================
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  RACINE_API,
  RACINE_DEPOT,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';

const executerFichier = promisify(execFile);

const SCRIPT_IMPORT = resolve(RACINE_API, 'scripts', 'import-banque-questions.mjs');

let nomBase = '';
let urlBase = '';
let client: Client | undefined;
let dossier = '';

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

// -----------------------------------------------------------------------------
// LE FORMAT §36.4 — TRANSCRIT DEPUIS LE PACK, PAS IMPORTÉ DU CODE TESTÉ
// -----------------------------------------------------------------------------
// « CSV UTF-8, en-têtes obligatoires : code* · bloc_code* · texte_fr* ·
//   guidance_fr · answer_type* · options · allow_range · poids · scoring ·
//   criticality · expected_source · secteurs · services_cibles · niveaux ·
//   effectif_min · effectif_max · profils · geo » (03 §36.4).
const COLONNES_36_4 = [
  'code',
  'bloc_code',
  'texte_fr',
  'guidance_fr',
  'answer_type',
  'options',
  'allow_range',
  'poids',
  'scoring',
  'criticality',
  'expected_source',
  'secteurs',
  'services_cibles',
  'niveaux',
  'effectif_min',
  'effectif_max',
  'profils',
  'geo',
] as const;

type Colonne = (typeof COLONNES_36_4)[number];
type LigneImport = Partial<Record<Colonne, string>>;

/**
 * Échappement RFC 4180. Les cellules `scoring` et `options` portent des
 * guillemets : les protéger EST le cas normal du format, pas une curiosité — un
 * fichier de banque réel n'a pas une seule ligne sans JSON en cellule.
 */
function cellule(valeur: string): string {
  return /["\r\n;]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

/**
 * Fabrique un CSV §36.4. `\r\n` et BOM sont DÉLIBÉRÉS : c'est exactement ce
 * qu'écrit Excel FR, et un import qui ne les tolère pas ne sert à rien à
 * l'administrateur qui remplit son tableur (03 §36.3).
 */
function fichierCsv(...lignes: LigneImport[]): string {
  const enregistrements = lignes.map((ligne) =>
    COLONNES_36_4.map((colonne) => cellule(ligne[colonne] ?? '')).join(';'),
  );
  return `${BOM_UTF8}${[COLONNES_36_4.join(';'), ...enregistrements].join('\r\n')}\r\n`;
}

/**
 * Fabrique un ÉLÉMENT du format JSON équivalent (03 M1.1). Les DIX-HUIT clés du
 * §36.4 sont posées, celles qu'on ne renseigne pas valant `null` : « en-têtes
 * obligatoires » se transpose en « clés obligatoires », et une clé absente est
 * traitée exactement comme une colonne absente d'un CSV. Ce qui reste
 * facultative, c'est la VALEUR — d'où le `null`, forme JSON de la cellule vide.
 */
function elementJson(valeurs: Record<string, unknown>): Record<string, unknown> {
  const element: Record<string, unknown> = {};
  for (const colonne of COLONNES_36_4) element[colonne] = valeurs[colonne] ?? null;
  return element;
}

/**
 * Le BOM UTF-8 qu'Excel FR pose en tête de tout CSV (03 §36.3). Écrit en
 * séquence d'échappement : un caractère invisible en dur dans le source est
 * exactement ce que `no-irregular-whitespace` existe pour empêcher.
 */
const BOM_UTF8 = '\uFEFF';

/** Écrit un fichier de fixture dans le dossier temporaire du fichier de test. */
function ecrire(nom: string, contenu: string): string {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, contenu, 'utf8');
  return chemin;
}

// -----------------------------------------------------------------------------
// LANCEMENT DU SCRIPT — le point d'entrée PUBLIC, jamais une réimplémentation
// -----------------------------------------------------------------------------

interface Resultat {
  readonly code: number;
  readonly sortie: string;
}

/**
 * Exécute `import-banque-questions.mjs` contre la base éphémère et rend son CODE
 * DE SORTIE avec sa sortie complète. Le code de sortie fait partie du contrat du
 * script (0 = importé · 1 = refusé · 2 = erreur d'usage) : c'est lui qu'un
 * enchaînement `pnpm` ou un `deploy.sh` lira, donc il est vérifié partout ici.
 */
async function lancerImport(fichier: string, options: readonly string[] = []): Promise<Resultat> {
  try {
    const { stdout, stderr } = await executerFichier(
      process.execPath,
      [SCRIPT_IMPORT, fichier, ...options],
      { cwd: RACINE_DEPOT, env: { ...process.env, DATABASE_URL: urlBase }, maxBuffer: 16_000_000 },
    );
    return { code: 0, sortie: `${stdout}${stderr}` };
  } catch (erreur) {
    const details = erreur as { code?: unknown; stdout?: unknown; stderr?: unknown };
    const stdout = typeof details.stdout === 'string' ? details.stdout : '';
    const stderr = typeof details.stderr === 'string' ? details.stderr : '';
    return {
      code: typeof details.code === 'number' ? details.code : 1,
      sortie: `${stdout}${stderr}`,
    };
  }
}

interface DefautSignale {
  readonly ligne: number;
  readonly colonne: string | null;
  readonly code: string;
}

/**
 * Retire les séquences ANSI : elles colorent le terminal, pas le sens.
 * Le caractère ESC est fabriqué par `String.fromCharCode(27)` plutôt qu'écrit
 * dans un littéral : la règle `no-control-regex` interdit un caractère de contrôle
 * en dur dans une expression régulière, à juste titre, partout ailleurs.
 */
const SEQUENCE_ANSI = new RegExp(`${String.fromCharCode(27)}[[][0-9]+m`, 'g');

function sansCouleurs(sortie: string): string {
  return sortie.replace(SEQUENCE_ANSI, '');
}

/**
 * Relit le rapport TEL QUE L'ADMINISTRATEUR LE VOIT, ligne par ligne. On analyse
 * la sortie console et pas seulement le rapport JSON : le §36.4 promet un
 * « rapport d'erreurs ligne à ligne », et c'est cette sortie-là que quelqu'un lit
 * à 18 h devant son tableur. Un rapport JSON juste avec une console muette ne
 * remplirait pas la promesse.
 *
 * Seules les ERREURS (✗) sont relevées : les avertissements (⚠) ne bloquent rien
 * et les confondre ferait passer une intention douteuse pour un refus.
 */
function defautsSignales(sortie: string): DefautSignale[] {
  const defauts: DefautSignale[] = [];
  for (const ligne of sansCouleurs(sortie).split(/\r?\n/)) {
    const trouve = /^✗ (?:ligne|élément) (\d+)(?: \[([a-z_]+)\])? ([A-Z_]+) /.exec(ligne);
    if (trouve === null) continue;
    defauts.push({
      ligne: Number(trouve[1]),
      colonne: trouve[2] ?? null,
      code: trouve[3] ?? '',
    });
  }
  return defauts;
}

/** Les numéros de ligne fautifs rapportés, dédoublonnés et triés. */
function lignesFautives(sortie: string): number[] {
  return [...new Set(defautsSignales(sortie).map((d) => d.ligne))].sort((a, b) => a - b);
}

// -----------------------------------------------------------------------------
// LECTURE DE LA BANQUE — l'état réel, jamais ce que la sortie du script raconte
// -----------------------------------------------------------------------------

interface LigneQuestion {
  readonly code: string | null;
  readonly version: number;
  readonly status: string;
  readonly bloc_code: string;
  readonly text_fr: string;
  readonly guidance_fr: string | null;
  readonly answer_type: string;
  readonly options: unknown;
  readonly allow_range: boolean;
  readonly weight: string;
  readonly scoring: unknown;
  readonly criticality: string;
  readonly expected_source: string | null;
  readonly sectors: unknown;
  readonly target_services: unknown;
  readonly levels: unknown;
  readonly headcount_min: number | null;
  readonly headcount_max: number | null;
  readonly profiles: unknown;
  readonly geo: string;
  readonly origin: string;
  readonly created_by: string | null;
}

async function questionsDuCode(code: string): Promise<LigneQuestion[]> {
  const resultat = await bd().query<LigneQuestion>(
    `SELECT q.code, q.version, q.status, b.code AS bloc_code, q.text_fr, q.guidance_fr,
            q.answer_type, q.options, q.allow_range, q.weight::text AS weight, q.scoring,
            q.criticality, q.expected_source, q.sectors, q.target_services, q.levels,
            q.headcount_min, q.headcount_max, q.profiles, q.geo, q.origin, q.created_by
       FROM questions q JOIN blocks b ON b.id = q.block_id
      WHERE q.code = $1 ORDER BY q.version`,
    [code],
  );
  return resultat.rows;
}

/**
 * Compte TOUTES les questions, pas seulement celles du test en cours : « rien
 * n'a été écrit » est une affirmation sur la BASE ENTIÈRE. Un compte filtré sur
 * les codes attendus laisserait passer un script qui écrirait ailleurs.
 */
async function nombreDeQuestions(): Promise<number> {
  const resultat = await bd().query<{ n: string }>('SELECT count(*)::text AS n FROM questions');
  return Number(resultat.rows[0]?.n ?? '0');
}

// -----------------------------------------------------------------------------
// FIXTURES DE LIGNES VALIDES — une par famille de barème du §32.1 / 04 §7.3
// -----------------------------------------------------------------------------
// Invariant 2 : aucune référence client. Les libellés sont neutres et fictifs.

/** `yes_no` : `{"map": {"oui": 5, "non": 0}}` + drapeau rouge sur « non » (§32.1). */
function ligneOuiNon(
  code: string,
  texte = 'Une charte d’usage de l’IA est-elle formalisée ?',
): LigneImport {
  return {
    code,
    bloc_code: 'bloc_1',
    texte_fr: texte,
    guidance_fr: 'Demander le document signé.',
    answer_type: 'yes_no',
    poids: '2',
    scoring: '{"map":{"oui":5,"non":0},"red_flag":{"values":["non"]}}',
    // `bloquant` est OBLIGATOIRE dès qu'un drapeau rouge est posé : le §32.1 ne
    // l'évalue que sur cette criticité, et le script avertit à juste titre sinon.
    criticality: 'bloquant',
    expected_source: 'entretien',
    secteurs: 'commerce|industrie',
    services_cibles: 'dsi_data|rh',
    niveaux: 'diagnostic_cadrage',
    effectif_min: '11',
    effectif_max: '249',
    profils: 'dirigeant',
    geo: 'france',
  };
}

/** `scale_1_5` : `{"map": "identity"}` + les ancres 1/3/5 exigées au §32.4. */
function ligneEchelle(code: string): LigneImport {
  return {
    code,
    bloc_code: 'bloc_2',
    texte_fr: 'Quel est le niveau de formalisation des processus ?',
    guidance_fr:
      '1 = aucun processus documenté · 3 = documenté mais non appliqué · ' +
      '5 = documenté, appliqué, mesuré',
    answer_type: 'scale_1_5',
    // Virgule décimale : un tableur français écrit « 1,5 ». Le refuser ferait
    // échouer un import sur une convention typographique.
    poids: '1,5',
    scoring: '{"map":"identity"}',
    criticality: 'important',
  };
}

/** `single_choice` : `{"source": "options"}` — les scores vivent dans les options. */
function ligneChoix(code: string): LigneImport {
  return {
    code,
    bloc_code: 'bloc_3',
    texte_fr: 'Quel est le degré d’outillage du service ?',
    answer_type: 'single_choice',
    options:
      '[{"code":"aucun","label":"Aucun outil","score":0},' +
      '{"code":"partiel","label":"Outillage partiel","score":3},' +
      '{"code":"complet","label":"Outillage complet","score":5}]',
    poids: '1',
    scoring: '{"source":"options"}',
    criticality: 'informatif',
  };
}

/** `number` : cotation par bandes, dernière bande OUVERTE (§32.1). */
function ligneNombre(code: string): LigneImport {
  return {
    code,
    bloc_code: 'bloc_4',
    texte_fr: 'Combien d’heures par semaine sont consacrées à la saisie manuelle ?',
    answer_type: 'number',
    allow_range: 'vrai',
    poids: '1',
    scoring: '{"bands":[{"max":20,"score":1},{"max":50,"score":3},{"score":5}]}',
    criticality: 'important',
  };
}

/** `free_text` : `weight = 0` obligatoire, aucun barème (04 §7.3). */
function ligneTexteLibre(code: string): LigneImport {
  return {
    code,
    bloc_code: 'bloc_5',
    texte_fr: 'Quelles difficultés rencontrez-vous au quotidien ?',
    answer_type: 'free_text',
    poids: '0',
    criticality: 'informatif',
  };
}

// -----------------------------------------------------------------------------
// MONTAGE
// -----------------------------------------------------------------------------

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l4_import_banque');
  nomBase = base.nom;
  urlBase = base.url;
  await appliquerMontee(base.url);
  // Le seed est INDISPENSABLE : le script vérifie blocs, secteurs, fonctions et
  // profils EN BASE. Sans référentiels il refuse de démarrer (et il a raison :
  // il rejetterait sinon toutes les lignes pour « bloc inconnu »).
  await executerSeed(base.url, base.nom);
  client = await connecter(base.url);

  dossier = mkdtempSync(join(tmpdir(), 'axion-l4-'));
}, 240_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
  if (dossier !== '') rmSync(dossier, { recursive: true, force: true });
});

// =============================================================================
// ① LA CONTRE-ÉPREUVE : UN FICHIER CONFORME S'IMPORTE, ET CE QUI EST ÉCRIT EST JUSTE
// =============================================================================
describe('import d’un fichier conforme (§36.4)', () => {
  it('@critique les cinq familles de barème du §32.1 sont écrites, colonne par colonne', async () => {
    // SANS CE TEST, TOUT LE RESTE DU FICHIER SERAIT VERT SUR UN SCRIPT QUI REFUSE
    // TOUT. C'est le premier test du fichier pour cette raison : on prouve que la
    // porte s'ouvre avant de prouver ce qu'elle arrête.
    //
    // Les cinq lignes couvrent les cinq formes de `scoring` du 04 §7.3 (map
    // oui/non, identity, source:options, bands, aucun barème sur weight = 0) :
    // une famille non couverte serait un barème dont personne n'a jamais vu
    // l'écriture réussir.
    const fichier = ecrire(
      'valide.csv',
      fichierCsv(
        ligneOuiNon('t4_ok_ouinon'),
        ligneEchelle('t4_ok_echelle'),
        ligneChoix('t4_ok_choix'),
        ligneNombre('t4_ok_nombre'),
        ligneTexteLibre('t4_ok_libre'),
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code, `sortie du script :\n${resultat.sortie}`).toBe(0);
    expect(sansCouleurs(resultat.sortie)).toContain('IMPORT RÉUSSI');
    expect(await nombreDeQuestions()).toBe(avant + 5);

    // --- Le oui/non, relu champ par champ ------------------------------------
    // Relire TOUTES les colonnes n'est pas de la minutie : un import qui perdrait
    // `sectors` ou `headcount_min` produirait des questions qui ne seraient
    // sélectionnées pour AUCUNE mission (M2, règles d'assemblage) — et le fichier
    // aurait quand même l'air importé.
    const [ouiNon] = await questionsDuCode('t4_ok_ouinon');
    expect(ouiNon?.version, 'une première importation crée la version 1').toBe(1);
    expect(ouiNon?.status).toBe('active');
    expect(ouiNon?.bloc_code, 'le `bloc_code` du fichier doit être RÉSOLU en block_id').toBe(
      'bloc_1',
    );
    expect(ouiNon?.origin, 'une question importée vient de la banque, pas d’une mission').toBe(
      'banque',
    );
    expect(ouiNon?.created_by, 'un script n’a pas d’auteur humain').toBeNull();
    expect(ouiNon?.answer_type).toBe('yes_no');
    expect(Number(ouiNon?.weight)).toBe(2);
    expect(ouiNon?.scoring).toEqual({
      map: { oui: 5, non: 0 },
      red_flag: { values: ['non'] },
    });
    expect(ouiNon?.criticality).toBe('bloquant');
    expect(ouiNon?.expected_source).toBe('entretien');
    expect(ouiNon?.sectors, 'les listes « a|b » du §36.4 deviennent des tableaux').toEqual([
      'commerce',
      'industrie',
    ]);
    expect(ouiNon?.target_services).toEqual(['dsi_data', 'rh']);
    expect(ouiNon?.levels).toEqual(['diagnostic_cadrage']);
    expect(ouiNon?.profiles).toEqual(['dirigeant']);
    expect(ouiNon?.headcount_min).toBe(11);
    expect(ouiNon?.headcount_max).toBe(249);
    expect(ouiNon?.geo).toBe('france');
    expect(ouiNon?.allow_range, 'colonne vide = faux, jamais NULL').toBe(false);

    // --- L'échelle : ancres CONSERVÉES et virgule décimale lue ---------------
    const [echelle] = await questionsDuCode('t4_ok_echelle');
    expect(echelle?.scoring).toEqual({ map: 'identity' });
    expect(
      Number(echelle?.weight),
      'Un poids « 1,5 » saisi dans un tableur français doit valoir 1.5, pas 15 ni un refus.',
    ).toBe(1.5);
    expect(
      echelle?.guidance_fr,
      'Les ancres §32.4 sont figées telles quelles dans `guidance_fr` : le terrain les\n' +
        'lit hors ligne depuis `mission_questions.guidance_snapshot` (§33.3).',
    ).toContain('3 = documenté mais non appliqué');

    // --- Le choix : options JSON en cellule ----------------------------------
    const [choix] = await questionsDuCode('t4_ok_choix');
    expect(choix?.scoring).toEqual({ source: 'options' });
    expect(choix?.options).toEqual([
      { code: 'aucun', label: 'Aucun outil', score: 0 },
      { code: 'partiel', label: 'Outillage partiel', score: 3 },
      { code: 'complet', label: 'Outillage complet', score: 5 },
    ]);

    // --- Le nombre : bandes et fourchette ------------------------------------
    const [nombre] = await questionsDuCode('t4_ok_nombre');
    expect(nombre?.scoring).toEqual({
      bands: [{ max: 20, score: 1 }, { max: 50, score: 3 }, { score: 5 }],
    });
    expect(nombre?.allow_range, '« vrai » est un booléen : le fichier est saisi à la main').toBe(
      true,
    );

    // --- Le texte libre : hors scoring ---------------------------------------
    const [libre] = await questionsDuCode('t4_ok_libre');
    expect(Number(libre?.weight)).toBe(0);
    expect(libre?.scoring, 'free_text ne porte JAMAIS de barème (04 §7.3)').toBeNull();
  });

  it('@critique `--verification` ne touche PAS la base, même sur un fichier vert', async () => {
    // La vérification à blanc est ce qui permet d'itérer sur un fichier de 200
    // questions sans rien engager. Si elle écrivait, l'administrateur créerait une
    // banque à moitié importée en croyant faire un essai — et le §36.4 promet
    // « une erreur = rien d'importé », pas « un essai = un import ».
    const fichier = ecrire('verification.csv', fichierCsv(ligneOuiNon('t4_blanc_ouinon')));

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier, ['--verification']);

    expect(resultat.code).toBe(0);
    expect(sansCouleurs(resultat.sortie)).toContain('VÉRIFICATION VERTE');
    expect(
      await nombreDeQuestions(),
      'Le mode à blanc a écrit en base : la promesse du drapeau est rompue.',
    ).toBe(avant);
    expect(await questionsDuCode('t4_blanc_ouinon')).toHaveLength(0);
  });
});

// =============================================================================
// ② L'ATOMICITÉ — LE PIÈGE CENTRAL DU LOT
// =============================================================================
describe('atomicité et rapport complet (§36.4 : « une erreur = rien d’importé + rapport »)', () => {
  it('@critique QUATRE erreurs sur quatre lignes sont TOUTES rapportées, et rien n’est écrit', async () => {
    // CE TEST EST LE CŒUR DU FICHIER.
    //
    // Un fichier à UNE erreur ne prouve rien : « atomique » et « arrêt à la
    // première erreur » y produisent le même verdict (refus, base intacte). Il
    // faut PLUSIEURS erreurs, sur des lignes DIFFÉRENTES, et vérifier qu'elles
    // sont toutes présentes — un script qui s'arrêterait à la ligne 3 laisserait
    // l'administrateur découvrir les trois suivantes en trois relances, alors que
    // le §36.4 lui promet un rapport.
    //
    // Les quatre défauts sont de NATURES différentes, chacun issu d'un contrôle
    // bloquant distinct du §36.4 : référentiel (bloc), barème (§32.1),
    // vocabulaire fermé (answer_type), unicité du code. Quatre erreurs du même
    // type ne prouveraient qu'une seule branche.
    //
    // La ligne 2 est VALIDE et ne doit PAS être écrite : c'est l'autre moitié de
    // l'atomicité, celle qu'un script « j'écris ce que je peux » raterait.
    const fichier = ecrire(
      'quatre-erreurs.csv',
      fichierCsv(
        // ligne 2 — irréprochable
        { ...ligneOuiNon('t4_atome_valide') },
        // ligne 3 — bloc absent du référentiel
        { ...ligneOuiNon('t4_atome_bloc'), bloc_code: 'bloc_inexistant' },
        // ligne 4 — poids > 0 sans barème (contrôle bloquant §32.1)
        { ...ligneOuiNon('t4_atome_bareme'), scoring: '', criticality: 'important' },
        // ligne 5 — type de réponse hors des onze du 04
        { ...ligneOuiNon('t4_atome_type'), answer_type: 'oui_non' },
        // ligne 6 — code déjà utilisé ligne 2
        { ...ligneOuiNon('t4_atome_valide'), texte_fr: 'Un doublon de code.' },
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code, 'un fichier fautif sort en 1 (REFUSÉ), jamais en 0').toBe(1);

    const rapporte = sansCouleurs(resultat.sortie);
    expect(
      lignesFautives(resultat.sortie),
      'LE TEST DE L’ATOMICITÉ. Les quatre lignes fautives doivent TOUTES figurer au\n' +
        'rapport. Si seule la ligne 3 apparaît, le script s’arrête au premier défaut :\n' +
        'il refuse bien tout, mais il ne RAPPORTE pas tout, et l’administrateur\n' +
        'découvrira ses erreurs une par une, en autant de relances.\n\n' +
        `Rapport obtenu :\n${rapporte}`,
    ).toEqual([3, 4, 5, 6]);

    const codes = defautsSignales(resultat.sortie).map((d) => d.code);
    expect(codes, 'chaque nature de défaut a son propre code de rapport').toEqual(
      expect.arrayContaining([
        'BLOC_INCONNU',
        'SCORING_MANQUANT',
        'VALEUR_HORS_ENUM',
        'CODE_DUPLIQUE_DANS_FICHIER',
      ]),
    );

    expect(
      await nombreDeQuestions(),
      'Aucune ligne ne doit avoir été écrite : le §36.4 est sans nuance.',
    ).toBe(avant);
    expect(
      await questionsDuCode('t4_atome_valide'),
      'LA LIGNE VALIDE NE DOIT PAS ÊTRE ÉCRITE. Un import « je garde ce qui passe »\n' +
        'laisserait une banque à moitié remplie, sans que personne sache laquelle des\n' +
        '200 questions y est.',
    ).toHaveLength(0);
  });

  it('le rapport JSON `--rapport` porte les mêmes lignes et déclare n’avoir rien écrit', async () => {
    // Le rapport JSON est ce qu'une CI ou un futur écran d'admin lira. S'il
    // divergeait de la console, l'un des deux mentirait — et on ne saurait pas
    // lequel. Ils sont donc comparés sur le seul point qui compte : les lignes.
    const fichier = ecrire(
      'rapport.csv',
      fichierCsv(
        { ...ligneOuiNon('t4_rapport_a'), bloc_code: 'bloc_absent' },
        { ...ligneEchelle('t4_rapport_b'), guidance_fr: 'Sans la moindre ancre.' },
      ),
    );
    const cheminRapport = join(dossier, 'rapport.json');

    const resultat = await lancerImport(fichier, [`--rapport=${cheminRapport}`]);
    expect(resultat.code).toBe(1);

    const rapport = JSON.parse(readFileSync(cheminRapport, 'utf8')) as {
      erreurs: { ligne: number; colonne: string | null; code: string }[];
      ecrit: boolean;
      lignesEcrites: number;
      lignesLues: number;
    };

    expect(rapport.lignesLues).toBe(2);
    expect(rapport.ecrit).toBe(false);
    expect(rapport.lignesEcrites).toBe(0);
    expect(rapport.erreurs.map((e) => e.ligne).sort((a, b) => a - b)).toEqual([2, 3]);
    expect(rapport.erreurs.map((e) => e.code)).toEqual(
      expect.arrayContaining(['BLOC_INCONNU', 'ANCRES_ABSENTES']),
    );
    expect(
      rapport.erreurs.map((e) => e.ligne).sort((a, b) => a - b),
      'Console et rapport JSON doivent désigner les MÊMES lignes.',
    ).toEqual(lignesFautives(resultat.sortie));
  });
});

// =============================================================================
// ③ LE CONTRÔLE BLOQUANT §32.1 — IL DOIT DISCRIMINER, PAS TRANCHER EN BLOC
// =============================================================================
describe('§32.1 — « toute question weight > 0 sans scoring valide est REJETÉE »', () => {
  it('@critique dans UN MÊME fichier, la conforme et les non conformes sont distinguées', async () => {
    // LE PIÈGE QUE CE TEST FERME : un script qui refuserait TOUTE question, et un
    // script qui n'appliquerait AUCUN contrôle, passeraient chacun un test à une
    // seule ligne. Ici, les trois lignes portent le MÊME type de réponse et le
    // MÊME poids : la seule variable est le barème. Le rapport doit citer les
    // lignes 3 et 4, et se taire sur la ligne 2.
    const fichier = ecrire(
      'scoring-discriminant.csv',
      fichierCsv(
        // ligne 2 — poids 2 AVEC un barème valide : rien à lui reprocher.
        { ...ligneOuiNon('t4_bareme_ok'), criticality: 'bloquant' },
        // ligne 3 — poids 2 SANS barème : la question compterait dans le score du
        // bloc sans qu'on sache la coter.
        { ...ligneOuiNon('t4_bareme_absent'), scoring: '', criticality: 'important' },
        // ligne 4 — poids 2 avec un `scoring` PRÉSENT mais qui ne cote rien : il
        // ne porte qu'un drapeau rouge. « Valide » ne veut pas dire « présent »,
        // et c'est exactement l'écart que ce cas mesure.
        {
          ...ligneOuiNon('t4_bareme_creux'),
          scoring: '{"red_flag":{"values":["non"]}}',
          criticality: 'bloquant',
        },
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);
    expect(resultat.code).toBe(1);

    const defauts = defautsSignales(resultat.sortie);
    expect(
      defauts.filter((d) => d.ligne === 2),
      'La ligne CONFORME ne doit recevoir AUCUN reproche : un contrôle qui refuse\n' +
        'tout n’est pas un contrôle, c’est une porte fermée.',
    ).toEqual([]);
    expect(lignesFautives(resultat.sortie), 'Les deux lignes fautives, et elles seules.').toEqual([
      3, 4,
    ]);
    expect(
      defauts.filter((d) => d.code === 'SCORING_MANQUANT').map((d) => d.ligne),
      'CHACUNE des deux doit porter le refus du §32.1 sur la colonne `scoring` — celle\n' +
        'qui n’a pas de barème du tout comme celle dont le barème ne cote rien. La\n' +
        'ligne 4 reçoit en plus un SCORING_INCOHERENT (un oui/non se cote par « map ») :\n' +
        'un même défaut peut se dire de deux façons, c’est le poids > 0 sans cotation\n' +
        'qui est vérifié ici.',
    ).toEqual([3, 4]);
    expect(defauts.every((d) => d.colonne === 'scoring')).toBe(true);
    expect(await nombreDeQuestions()).toBe(avant);
  });

  it('@critique le poids commande le barème : la MÊME question à poids 0 est acceptée', async () => {
    // La contre-épreuve du test ci-dessus, et elle est indispensable : sans elle,
    // un script qui exigerait un barème sur TOUTE question passerait le refus
    // ci-dessus sans discriminer quoi que ce soit. Le §32.1 conditionne l'exigence
    // au POIDS (« weight > 0 »), pas au type de réponse — « 0 = hors scoring »
    // (03 M1.1) doit donc entrer en banque sans barème.
    const fichier = ecrire(
      'poids-zero.csv',
      fichierCsv(
        { ...ligneOuiNon('t4_poids_zero'), poids: '0', scoring: '', criticality: 'important' },
        { ...ligneOuiNon('t4_poids_deux'), criticality: 'bloquant' },
      ),
    );

    const resultat = await lancerImport(fichier);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);

    const [horsScore] = await questionsDuCode('t4_poids_zero');
    expect(Number(horsScore?.weight)).toBe(0);
    expect(
      horsScore?.scoring,
      'aucun barème n’a été inventé pour combler la cellule vide',
    ).toBeNull();
    expect(await questionsDuCode('t4_poids_deux')).toHaveLength(1);
  });

  it('@critique un barème incohérent avec le type de réponse est refusé (04 §7.3)', async () => {
    // « Valide » se lit dans le tableau du 04 §7.3 : chaque type a SA forme. Un
    // barème syntaxiquement correct mais posé sur le mauvais type est du barème
    // mort — il passerait l'INSERT (la colonne est un JSONB, la base ne vérifie
    // RIEN) et ne se manifesterait qu'au calcul du score L8, sur une mission déjà
    // collectée, c'est-à-dire au pire moment.
    const fichier = ecrire(
      'bareme-incoherent.csv',
      fichierCsv(
        // ligne 2 — bandes numériques sur un oui/non : rien à borner.
        {
          ...ligneOuiNon('t4_incoherent_bands'),
          scoring: '{"bands":[{"max":20,"score":1},{"score":5}]}',
          criticality: 'important',
        },
        // ligne 3 — une échelle 1-5 cotée autrement que par « identity ».
        { ...ligneEchelle('t4_incoherent_echelle'), scoring: '{"map":{"1":1,"5":5}}' },
        // ligne 4 — un JSON qui n'est même pas lisible.
        {
          ...ligneOuiNon('t4_incoherent_json'),
          scoring: '{map: identity',
          criticality: 'important',
        },
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code).toBe(1);
    expect(lignesFautives(resultat.sortie)).toEqual([2, 3, 4]);
    const codes = defautsSignales(resultat.sortie).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['SCORING_INCOHERENT', 'SCORING_JSON_INVALIDE']));
    expect(await nombreDeQuestions()).toBe(avant);
  });

  it('@critique une échelle 1-5 sans ancres 1/3/5 est refusée, une échelle ancrée passe (§32.4)', async () => {
    // Le §36.4 en fait un contrôle bloquant nommé : « ancres présentes dans
    // guidance_fr si answer_type = scale_1_5 ». Sans ancres, deux auditeurs cotent
    // deux choses différentes et la divergence mesurée au §32.1 devient du bruit.
    // Les deux lignes sont dans le même fichier : on prouve que le contrôle vise
    // l'échelle non ancrée, pas les échelles en général.
    const fichier = ecrire(
      'ancres.csv',
      fichierCsv(ligneEchelle('t4_ancres_ok'), {
        ...ligneEchelle('t4_ancres_ko'),
        guidance_fr: 'Apprécier le niveau de maturité.',
      }),
    );

    const resultat = await lancerImport(fichier);
    expect(resultat.code).toBe(1);
    expect(defautsSignales(resultat.sortie)).toEqual([
      { ligne: 3, colonne: 'guidance_fr', code: 'ANCRES_ABSENTES' },
    ]);
  });

  it('@critique des ancres saisies UNE PAR LIGNE en CRLF sont lues comme des ancres', async () => {
    // CE QUE CE TEST PROTÈGE : le §32.4 demande les ancres dans `guidance_fr`, et
    // personne ne les écrit sur une seule ligne — on tape Alt+Entrée dans la
    // cellule, une ancre par ligne. EXCEL FR ÉCRIT ALORS `\r\n`, pas `\n`.
    //
    // Le contrôle d'ancrage découpe `guidance_fr` sur ses séparateurs. Si le `\r`
    // n'est pas du nombre, chaque fragment garde un `\r` final, la lecture d'une
    // ancre échoue (`.` ne matche pas `\r`, qui est un terminateur de ligne en JS)
    // et SEULE LA DERNIÈRE ancre est vue : une échelle parfaitement ancrée est
    // rejetée pour « ancrage incomplet ». C'est le refus le plus coûteux qui
    // soit — l'administrateur a fait exactement ce que le pack demande, et il n'a
    // aucun moyen de corriger un fichier qui n'a rien de faux.
    //
    // Le fichier porte les DEUX cas pour que le test ne puisse pas devenir vert
    // par relâchement du contrôle : l'échelle ancrée en CRLF ne doit recevoir
    // AUCUN reproche, et l'échelle réellement non ancrée du même fichier doit
    // rester refusée.
    const ancresCrlf =
      '1 = aucun processus documenté\r\n' +
      '3 = documenté mais non appliqué\r\n' +
      '5 = documenté, appliqué, mesuré';

    const mixte = ecrire(
      'ancres-crlf-mixte.csv',
      fichierCsv(
        { ...ligneEchelle('t4_crlf_ok'), guidance_fr: ancresCrlf },
        {
          ...ligneEchelle('t4_crlf_ko'),
          guidance_fr: 'Apprécier la maturité, au jugé.',
        },
      ),
    );

    // Géométrie du fichier — l'ancrage CRLF occupe TROIS lignes de tableur, si
    // bien que l'échelle non ancrée est la ligne 5 et non la ligne 3 :
    //   ligne 1     en-têtes
    //   lignes 2-4  l'échelle ancrée en CRLF, une ancre par ligne
    //   ligne 5     l'échelle sans la moindre ancre
    const avant = await nombreDeQuestions();
    const refus = await lancerImport(mixte);
    expect(refus.code).toBe(1);
    expect(
      defautsSignales(refus.sortie),
      'Un défaut sur les lignes 2 à 4 signifierait que les ancres en CRLF ne sont\n' +
        'plus reconnues : le contrôle §32.4 refuserait alors du contenu conforme.\n' +
        'Aucun défaut du tout signifierait l’inverse — que le contrôle a cessé de\n' +
        'contrôler.',
    ).toEqual([{ ligne: 5, colonne: 'guidance_fr', code: 'ANCRES_ABSENTES' }]);
    expect(await nombreDeQuestions()).toBe(avant);

    // Et la moitié qui compte autant : seule, la même échelle S'IMPORTE.
    const seule = ecrire(
      'ancres-crlf.csv',
      fichierCsv({ ...ligneEchelle('t4_crlf_ok'), guidance_fr: ancresCrlf }),
    );
    const accepte = await lancerImport(seule);
    expect(accepte.code, `sortie du script :\n${sansCouleurs(accepte.sortie)}`).toBe(0);

    const [question] = await questionsDuCode('t4_crlf_ok');
    expect(
      question?.guidance_fr,
      'La fixture doit VRAIMENT avoir voyagé en CRLF de bout en bout : si les fins\n' +
        'de ligne étaient normalisées en chemin, ce test ne prouverait plus rien du\n' +
        'cas qu’il prétend couvrir.',
    ).toContain('\r\n');
    expect(question?.guidance_fr).toContain('1 = aucun processus documenté');
    expect(question?.guidance_fr).toContain('5 = documenté, appliqué, mesuré');
  });
});

// =============================================================================
// ④ LE NUMÉRO DE LIGNE — CELUI DU TABLEUR, PAS CELUI DE L'ENREGISTREMENT
// =============================================================================
describe('rapport ligne à ligne — le numéro désigne la ligne du tableur', () => {
  it('@critique un ancrage multi-lignes entre guillemets ne décale pas la ligne fautive', async () => {
    // LE PIÈGE : `guidance_fr` porte les ancres de cotation (§32.4), et un
    // ancrage réel s'écrit sur plusieurs lignes dans la cellule du tableur — une
    // ancre par ligne, c'est ainsi qu'on les relit. Le CSV les protège par des
    // guillemets (RFC 4180) : le deuxième ENREGISTREMENT du fichier est alors la
    // cinquième LIGNE du tableur. Un compteur qui numéroterait les
    // enregistrements dirait « ligne 3 » et enverrait l'administrateur corriger
    // une ligne saine — pire qu'un rapport muet, parce qu'il a l'air juste.
    //
    // Le fichier est écrit À LA MAIN pour que la géométrie soit lisible ici :
    //   ligne 1     en-têtes
    //   lignes 2-4  une échelle valide, une ancre par ligne
    //   ligne 5     la ligne fautive (bloc inconnu)
    const enTete = COLONNES_36_4.join(';');
    const ancrageMultiligne = [
      't4_multi_ok',
      'bloc_2',
      'Quel est le niveau de formalisation des processus ?',
      '"1 = aucun processus documenté\r\n3 = documenté mais non appliqué\r\n5 = documenté, appliqué, mesuré"',
      'scale_1_5',
      '',
      '',
      '1',
      '"{""map"":""identity""}"',
      'important',
      ...Array.from({ length: 8 }, () => ''),
    ].join(';');
    const ligneFautive = [
      't4_multi_ko',
      'bloc_qui_nexiste_pas',
      'Une question dont le bloc est inconnu.',
      '',
      'yes_no',
      '',
      '',
      '0',
      ...Array.from({ length: 10 }, () => ''),
    ].join(';');

    const fichier = ecrire(
      'multiligne.csv',
      `${BOM_UTF8}${enTete}\r\n${ancrageMultiligne}\r\n${ligneFautive}\r\n`,
    );

    // `--verification` : ce test porte sur la NUMÉROTATION, pas sur l'écriture ;
    // il n'a aucune raison de laisser une trace dans la banque.
    const resultat = await lancerImport(fichier, ['--verification']);

    expect(resultat.code).toBe(1);
    expect(
      defautsSignales(resultat.sortie),
      'Attendu : « ligne 5 » — le numéro que l’administrateur voit dans son tableur.\n' +
        'Un « ligne 3 » signifierait que le script compte les enregistrements et non\n' +
        'les lignes physiques : l’ancrage multi-lignes ci-dessus en occupe trois.\n' +
        'Et l’absence de tout défaut sur les lignes 2-4 prouve du même coup que\n' +
        'l’enregistrement multi-lignes a été lu correctement, ancres comprises.',
    ).toEqual([{ ligne: 5, colonne: 'bloc_code', code: 'BLOC_INCONNU' }]);
  });

  it('un en-tête manquant ou inconnu est refusé avant toute lecture de ligne', async () => {
    // Une colonne absente n'est pas une colonne vide : c'est un fichier d'un autre
    // format, et l'importer reviendrait à écrire des questions dont personne ne
    // sait ce qui manque. Une colonne INCONNUE est le symétrique : ignorée en
    // silence, elle serait une donnée que l'administrateur croit avoir importée.
    const sansScoring = COLONNES_36_4.filter((c) => c !== 'scoring');
    const enTete = [...sansScoring, 'commentaire_interne'].join(';');
    const ligne = [
      't4_entete',
      'bloc_1',
      'Une question quelconque.',
      '',
      'yes_no',
      '',
      '',
      '0',
      ...Array.from({ length: 9 }, () => ''),
      'note libre',
    ].join(';');

    const fichier = ecrire('entetes.csv', `${BOM_UTF8}${enTete}\r\n${ligne}\r\n`);
    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code).toBe(1);
    const codes = defautsSignales(resultat.sortie).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['ENTETE_MANQUANT', 'ENTETE_INCONNU']));
    expect(await nombreDeQuestions()).toBe(avant);
  });
});

// =============================================================================
// ⑤ LE RÉ-IMPORT — CE QUE FAIT RÉELLEMENT LE SCRIPT FACE À UN CODE DÉJÀ EN BANQUE
// =============================================================================
// Le §36.4 écrit « code* (unique — clé de ré-import/versionnage) » sans dire si
// l'unicité porte sur le FICHIER ou sur la BANQUE. Le 04 §7.1 pose l'index UNIQUE
// partiel `questions(code, version) WHERE code IS NOT NULL` : une base peut donc
// porter plusieurs lignes d'un même code, à condition qu'elles diffèrent par la
// version. Le 04 tranche le reste : « une NOUVELLE VERSION = une NOUVELLE LIGNE
// (même code, version+1, l'ancienne passe archived) — JAMAIS de mutation en
// place », parce que des `mission_questions` citent la ligne précédente.
//
// CE QUE LES TESTS CI-DESSOUS CONSTATENT (comportement réel, à valider en porte) :
//   · sans drapeau, un code déjà en banque est REFUSÉ (le fichier entier avec) ;
//   · avec `--versionner` et un contenu IDENTIQUE, rien n'est écrit ni archivé ;
//   · avec `--versionner` et un contenu MODIFIÉ, une version+1 est créée et
//     l'ancienne est archivée.
// L'arbitrage du défaut — refus plutôt que versionnage automatique — appartient à
// Williams ; ce que la suite garantit, c'est qu'il ne changera pas en silence.
// =============================================================================
describe('ré-import du même fichier (04 §7.1 : UNIQUE(code, version))', () => {
  const codeStable = 't4_reimport_stable';
  const codeModifie = 't4_reimport_modifie';

  it('@critique premier import : deux questions en version 1', async () => {
    const fichier = ecrire(
      'reimport-1.csv',
      fichierCsv(
        ligneOuiNon(codeStable),
        ligneOuiNon(codeModifie, 'Texte initial de la question ?'),
      ),
    );

    const resultat = await lancerImport(fichier);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);
    expect(await questionsDuCode(codeStable)).toHaveLength(1);
    expect((await questionsDuCode(codeModifie))[0]?.version).toBe(1);
  });

  it('@critique rejouer le MÊME fichier sans drapeau est REFUSÉ, et n’écrase rien', async () => {
    // Le point qui compte n'est pas le refus, c'est ce qu'il PROTÈGE : écraser
    // une question en place ferait mentir tous les `mission_questions` qui la
    // citent (invariant 7 — rien n'est jamais silencieusement écrasé). On vérifie
    // donc que la banque est EXACTEMENT dans l'état d'avant.
    const fichier = ecrire(
      'reimport-2.csv',
      fichierCsv(
        ligneOuiNon(codeStable),
        ligneOuiNon(codeModifie, 'Texte initial de la question ?'),
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code).toBe(1);
    expect(
      defautsSignales(resultat.sortie).map((d) => ({ ligne: d.ligne, code: d.code })),
      'Les DEUX lignes doivent être signalées : le rapport reste complet, y compris\n' +
        'quand le défaut vient de la banque et non du fichier.',
    ).toEqual([
      { ligne: 2, code: 'CODE_DEJA_EN_BANQUE' },
      { ligne: 3, code: 'CODE_DEJA_EN_BANQUE' },
    ]);
    expect(await nombreDeQuestions()).toBe(avant);

    const [stable] = await questionsDuCode(codeStable);
    expect(stable?.version, 'aucune version n’a été créée').toBe(1);
    expect(stable?.status, 'et la ligne existante n’a pas été archivée au passage').toBe('active');
  });

  it('@critique `--versionner` sur un contenu INCHANGÉ ne crée aucune version', async () => {
    // Un fichier rejoué à l'identique — le cas le plus banal : on relance l'import
    // après avoir corrigé DEUX lignes sur 200. Créer une version pour les 198
    // autres archiverait 198 lignes citées par des missions en cours et
    // fabriquerait un historique qui ne s'est jamais produit.
    const fichier = ecrire(
      'reimport-3.csv',
      fichierCsv(
        ligneOuiNon(codeStable),
        ligneOuiNon(codeModifie, 'Texte initial de la question ?'),
      ),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier, ['--versionner']);

    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);
    expect(sansCouleurs(resultat.sortie)).toContain('inchangée');
    expect(await nombreDeQuestions()).toBe(avant);

    const stable = await questionsDuCode(codeStable);
    expect(stable).toHaveLength(1);
    expect(stable[0]?.version).toBe(1);
    expect(stable[0]?.status, 'une question inchangée reste ACTIVE').toBe('active');
  });

  it('@critique `--versionner` sur un contenu MODIFIÉ crée la version 2 et archive la 1', async () => {
    // La règle du 04, prise au mot : une nouvelle LIGNE, jamais une mutation. Le
    // contenu de la version 1 doit rester intact — c'est lui que citent les
    // missions déjà parties sur le terrain.
    const fichier = ecrire(
      'reimport-4.csv',
      fichierCsv(
        ligneOuiNon(codeStable),
        ligneOuiNon(codeModifie, 'Texte REFORMULÉ après retour terrain ?'),
      ),
    );

    const resultat = await lancerImport(fichier, ['--versionner']);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);

    const versions = await questionsDuCode(codeModifie);
    expect(
      versions.map((v) => v.version),
      'deux LIGNES, pas une ligne mutée',
    ).toEqual([1, 2]);
    expect(versions[0]?.status).toBe('archived');
    expect(
      versions[0]?.text_fr,
      'Le contenu de la version archivée est FIGÉ : seul son statut bouge.',
    ).toBe('Texte initial de la question ?');
    expect(versions[1]?.status).toBe('active');
    expect(versions[1]?.text_fr).toBe('Texte REFORMULÉ après retour terrain ?');

    // La question NON modifiée du même fichier ne doit pas avoir bougé : le
    // versionnage se décide question par question, pas fichier par fichier.
    const stable = await questionsDuCode(codeStable);
    expect(stable).toHaveLength(1);
    expect(stable[0]?.status).toBe('active');
  });

  it('l’index UNIQUE(code, version) du 04 §7.1 est bien en place après ces écritures', async () => {
    // Ceinture : le versionnage ci-dessus ne vaut que si la base REFUSE deux
    // lignes de même (code, version). Sans cette contrainte active, le « v1
    // archivée + v2 active » ne serait qu'une convention du script — et une
    // convention se contourne au premier import concurrent.
    // L'identifiant est un UUID v7 fabriqué CÔTÉ APPLICATIF (invariant 1) :
    // même dans une fixture qui doit échouer, on n'introduit pas la convention
    // qu'on interdit ailleurs.
    const doublon = bd().query(
      `INSERT INTO questions (id, code, block_id, version, status, text_fr, answer_type, origin)
       SELECT $1, code, block_id, version, status, text_fr, answer_type, origin
         FROM questions WHERE code = $2 AND version = 2`,
      [uuidv7(), codeModifie],
    );
    await expect(
      doublon,
      'La base doit refuser un second (code, version) : index UNIQUE partiel du 04 §7.1.',
    ).rejects.toThrow();
  });
});

// =============================================================================
// ⑥ « INCHANGÉE » SE DÉCIDE SUR LE SENS DE LA QUESTION, PAS SUR SA MISE EN FORME
// =============================================================================
// Le ré-import compare ce que dit le fichier à ce que porte la base. Or CE QUI
// REVIENT DE LA BASE N'EST JAMAIS LE TEXTE QU'ON Y A MIS : PostgreSQL range les
// clés d'un `jsonb` dans SON ordre (longueur, puis octets), si bien qu'une option
// écrite `{label, score, code}` en revient toujours `{code, label, score}`.
//
// Une comparaison sensible à cet ordre déclarerait « modifiée » une question que
// personne n'a touchée : à chaque ré-import, une version+1 naîtrait et la
// précédente — celle que citent les `mission_questions` des missions en cours —
// passerait `archived`. Silencieusement, et sur toutes les questions à options du
// fichier à la fois. C'est un historique FABRIQUÉ, exactement ce que l'invariant 7
// interdit.
// =============================================================================
describe('ré-import — la forme du fichier ne fait pas une version', () => {
  const code = 't4_options_ordre';

  /** Les options du §36.4 dans l'ordre du pack : `[{code, label, score}]`. */
  const CANONIQUES =
    '[{"code":"aucun","label":"Aucun outil","score":0},' +
    '{"code":"complet","label":"Outillage complet","score":5}]';

  /** LE MÊME CONTENU, clés réécrites dans un autre ordre — un JSON équivalent. */
  const REORDONNEES =
    '[{"label":"Aucun outil","score":0,"code":"aucun"},' +
    '{"score":5,"code":"complet","label":"Outillage complet"}]';

  /** Un contenu RÉELLEMENT différent : le score de la seconde option change. */
  const MODIFIEES =
    '[{"code":"aucun","label":"Aucun outil","score":0},' +
    '{"code":"complet","label":"Outillage complet","score":3}]';

  it('@critique premier import : une question à options, en version 1', async () => {
    const fichier = ecrire(
      'options-1.csv',
      fichierCsv({ ...ligneChoix(code), options: CANONIQUES }),
    );

    const resultat = await lancerImport(fichier);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);

    const versions = await questionsDuCode(code);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.options).toEqual([
      { code: 'aucun', label: 'Aucun outil', score: 0 },
      { code: 'complet', label: 'Outillage complet', score: 5 },
    ]);
  });

  it('@critique les MÊMES options, clés dans un autre ordre : aucune version créée', async () => {
    // LE PIÈGE. Rien n'a changé pour l'auditeur : mêmes codes, mêmes libellés,
    // mêmes scores. Seul l'ordre d'écriture des clés diffère — ce qu'un export,
    // un tableur ou une main humaine produit sans y penser. Créer une v2 ici
    // archiverait une question vivante pour une virgule déplacée.
    const fichier = ecrire(
      'options-2.csv',
      fichierCsv({ ...ligneChoix(code), options: REORDONNEES }),
    );

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier, ['--versionner']);

    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);
    expect(sansCouleurs(resultat.sortie)).toContain('inchangée');
    expect(await nombreDeQuestions()).toBe(avant);

    const versions = await questionsDuCode(code);
    expect(
      versions.map((v) => v.version),
      'Une v2 ici signifierait que la comparaison de ré-import dépend de l’ORDRE\n' +
        'des clés JSON — un ordre que PostgreSQL réécrit de toute façon. Chaque\n' +
        'ré-import archiverait alors des questions que personne n’a modifiées.',
    ).toEqual([1]);
    expect(versions[0]?.status, 'la version 1 reste ACTIVE').toBe('active');
  });

  it('@critique un score d’option réellement modifié crée bien la v2 et archive la v1', async () => {
    // LA CONTRE-ÉPREUVE, sans laquelle le test ci-dessus serait vert sur un script
    // qui ne versionnerait JAMAIS rien. Ici le sens change : « Outillage complet »
    // ne vaut plus 5 mais 3, et toute mission future cotera différemment. Le 04
    // exige alors une NOUVELLE LIGNE, l'ancienne archivée et FIGÉE.
    const fichier = ecrire(
      'options-3.csv',
      fichierCsv({ ...ligneChoix(code), options: MODIFIEES }),
    );

    const resultat = await lancerImport(fichier, ['--versionner']);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);

    const versions = await questionsDuCode(code);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0]?.status).toBe('archived');
    expect(
      versions[0]?.options,
      'Le barème de la version archivée est FIGÉ : c’est lui qu’ont utilisé les\n' +
        'missions déjà collectées.',
    ).toEqual([
      { code: 'aucun', label: 'Aucun outil', score: 0 },
      { code: 'complet', label: 'Outillage complet', score: 5 },
    ]);
    expect(versions[1]?.status).toBe('active');
    expect(versions[1]?.options).toEqual([
      { code: 'aucun', label: 'Aucun outil', score: 0 },
      { code: 'complet', label: 'Outillage complet', score: 3 },
    ]);
  });
});

// =============================================================================
// ⑦ L'ÉQUIVALENT JSON — MÊME VALIDATEUR, MÊME ATOMICITÉ, AUTRE VOCABULAIRE
// =============================================================================
describe('format JSON (03 M1.1 : « import/export de la banque en CSV/JSON »)', () => {
  it('@critique un JSON mixte est refusé en entier et désigne l’ÉLÉMENT fautif', async () => {
    // Le JSON n'a pas de lignes : parler de « ligne 2 » à quelqu'un qui édite un
    // tableau d'objets ne l'aide pas. Ce qui est vérifié ici, c'est que le second
    // format n'est pas un trompe-l'œil : même validateur, même atomicité, et un
    // vocabulaire adapté au fichier qu'on a réellement sous les yeux.
    //
    // Les listes de codes sont écrites en TABLEAU (`["commerce","industrie"]`) et
    // non en `"a|b"` : le pipe est un encodage de CELLULE de tableur, imposé par
    // le CSV. Un JSON qui l'exigerait accepterait le fichier sans y comprendre
    // quoi que ce soit.
    const contenu = JSON.stringify([
      elementJson({
        code: 't4_json_ok',
        bloc_code: 'bloc_1',
        texte_fr: 'Une question importée depuis un JSON ?',
        answer_type: 'yes_no',
        poids: 2,
        scoring: { map: { oui: 5, non: 0 } },
        criticality: 'important',
        secteurs: ['commerce', 'industrie'],
      }),
      elementJson({
        code: 't4_json_ko',
        bloc_code: 'bloc_1',
        texte_fr: 'Une question à poids fort et sans barème ?',
        answer_type: 'yes_no',
        poids: 3,
        criticality: 'important',
      }),
    ]);
    const fichier = ecrire('banque.json', contenu);

    const avant = await nombreDeQuestions();
    const resultat = await lancerImport(fichier);

    expect(resultat.code).toBe(1);
    expect(sansCouleurs(resultat.sortie)).toContain('élément 2');
    expect(defautsSignales(resultat.sortie)).toEqual([
      { ligne: 2, colonne: 'scoring', code: 'SCORING_MANQUANT' },
    ]);
    expect(await nombreDeQuestions(), 'atomicité : le JSON obéit à la même règle').toBe(avant);
    expect(await questionsDuCode('t4_json_ok')).toHaveLength(0);
  });

  it('@critique le même JSON, corrigé, s’importe et rend les listes en tableaux', async () => {
    // Contre-épreuve du test précédent — sans elle, un lecteur JSON complètement
    // cassé (qui refuserait tout fichier .json) serait vert ci-dessus.
    const contenu = JSON.stringify({
      questions: [
        elementJson({
          code: 't4_json_ok',
          bloc_code: 'bloc_1',
          texte_fr: 'Une question importée depuis un JSON ?',
          answer_type: 'yes_no',
          poids: 2,
          scoring: { map: { oui: 5, non: 0 } },
          criticality: 'important',
          secteurs: ['commerce', 'industrie'],
          profils: ['dirigeant', 'dsi'],
        }),
      ],
    });
    const fichier = ecrire('banque-corrigee.json', contenu);

    const resultat = await lancerImport(fichier);
    expect(resultat.code, `sortie du script :\n${sansCouleurs(resultat.sortie)}`).toBe(0);

    const [question] = await questionsDuCode('t4_json_ok');
    expect(question?.scoring).toEqual({ map: { oui: 5, non: 0 } });
    expect(
      question?.sectors,
      'Un tableau JSON doit atterrir en base comme la liste « a|b » d’un CSV.',
    ).toEqual(['commerce', 'industrie']);
    expect(question?.profiles).toEqual(['dirigeant', 'dsi']);
    expect(Number(question?.weight)).toBe(2);
  });
});
