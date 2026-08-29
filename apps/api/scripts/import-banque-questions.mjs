#!/usr/bin/env node
// =============================================================================
// IMPORT DE LA BANQUE DE QUESTIONS — lot L4, agent A41
//
// Format : 03 §36.4 (CSV UTF-8, en-têtes obligatoires) et son équivalent JSON
// (03 M1.1 : « Import/export de la banque en CSV/JSON »).
// Contrôles bloquants : 03 §36.4 + §32.1 (barème) + §32.4 (ancres de cotation).
// Cible : la table `questions` du fichier 04 — ce script n'invente AUCUN DDL et ne
// touche à AUCUNE migration.
//
// ─────────────────────────────────────────────────────────────────────────────
// « ATOMIQUE » ET « RAPPORT D'ERREURS » NE SE CONTREDISENT PAS : DEUX PASSES.
//
// La solution est celle qu'a tranchée le lot L3 pour l'import de l'arbre
// (docs/conception/LOT_L3.md §3-c), reprise ICI À L'IDENTIQUE — deux mécanismes
// différents pour la même exigence finissent toujours par diverger :
//
//   PASSE 1 — VALIDATION, ENTIÈREMENT EN MÉMOIRE, ZÉRO ÉCRITURE.
//     Toutes les lignes sont évaluées, jamais d'arrêt à la première erreur ; la
//     base n'est lue que pour les référentiels (blocs, secteurs, fonctions,
//     profils) et les codes déjà en banque. S'il reste UNE erreur : rapport
//     complet, code de sortie 1, et RIEN n'a été écrit — la contradiction tombe
//     parce que la validation n'écrit pas.
//
//   PASSE 2 — ÉCRITURE, UNE SEULE TRANSACTION, seulement si zéro erreur.
//     Un `INSERT` qui échouerait malgré tout (course, contrainte) fait ROLLBACK
//     de l'import ENTIER.
//
//   --verification — VÉRIFICATION À BLANC : s'arrête après la passe 1. Permet
//     d'itérer sur un fichier de 200 questions sans jamais toucher la base.
// ─────────────────────────────────────────────────────────────────────────────
//
// UTILISATION
//   node scripts/import-banque-questions.mjs <fichier> [options]
//     --verification         vérifie sans rien écrire (à blanc)
//     --format=csv|json      force le format (défaut : déduit de l'extension)
//     --statut=active|draft  statut des questions importées (défaut : active)
//     --versionner           un code déjà en banque crée une NOUVELLE VERSION
//                            (04 : nouvelle ligne, version+1, l'ancienne archivée)
//                            au lieu d'être refusé
//     --rapport=<chemin>     écrit le rapport complet en JSON à ce chemin
//     --limite-rapport=<n>   nombre d'erreurs détaillées affichées (défaut 500)
//
// CODES DE SORTIE : 0 = importé (ou vérification verte) · 1 = REFUSÉ (rapport) ·
// 2 = erreur d'usage ou d'environnement (fichier illisible, base injoignable).
//
// CE QUE CE SCRIPT NE FAIT PAS : il n'importe pas les ~200 questions réelles.
// Le contenu suit son propre jalon (07 §14) ; le livrable du lot est CE script et
// son jeu de recette, rejoués plus tard avec les vraies questions.
// Traçabilité : E10 (banque de questions UNIQUE versionnée), E37 (contrôle bloquant
// à l'import), E47 (format d'import de la banque, 03 §36.4) · critère L4 du fichier 07.
// =============================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import {
  analyserLigneBanque,
  CODES_DEFAUT_IMPORT,
  COLONNES_IMPORT_BANQUE,
  empreinteQuestion,
  SEPARATEUR_LISTE,
  STATUTS_QUESTION,
} from '@axion/shared';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const GRIS = '[90m';
const RAZ = '[0m';

const RACINE_API = resolve(import.meta.dirname, '..');
const RACINE_DEPOT = resolve(RACINE_API, '../..');

const LIMITE_RAPPORT_DEFAUT = 500;

// ---------------------------------------------------------------------------
// Environnement — même convention que les autres scripts du dépôt.
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  const fichierEnv = resolve(RACINE_DEPOT, '.env');
  if (existsSync(fichierEnv)) {
    try {
      process.loadEnvFile(fichierEnv);
    } catch {
      // Un .env illisible ne doit pas masquer le message utile ci-dessous.
    }
  }
}

function abandon(titre, detail) {
  console.error(`${ROUGE}✗ import banque : ${titre}${RAZ}\n${detail}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// ARGUMENTS
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--aide') || args.includes('--help')) {
  console.log(
    'Import de la banque de questions (03 §36.4)\n\n' +
      '  node scripts/import-banque-questions.mjs <fichier.csv|.json> [options]\n\n' +
      '  --verification         valide sans rien écrire (à blanc)\n' +
      '  --format=csv|json      force le format\n' +
      `  --statut=${STATUTS_QUESTION.filter((s) => s !== 'archived').join('|')}   statut des questions importées (défaut : active)\n` +
      '  --versionner           un code déjà en banque crée une nouvelle version\n' +
      '  --rapport=<chemin>     écrit le rapport JSON complet\n' +
      `  --limite-rapport=<n>   erreurs détaillées affichées (défaut ${String(LIMITE_RAPPORT_DEFAUT)})\n`,
  );
  process.exit(args.length === 0 ? 2 : 0);
}

function option(nom) {
  const prefixe = `--${nom}=`;
  const trouve = args.find((a) => a.startsWith(prefixe));
  return trouve === undefined ? null : trouve.slice(prefixe.length);
}

const positionnels = args.filter((a) => !a.startsWith('--'));
if (positionnels.length !== 1) {
  abandon(
    'un seul fichier attendu.',
    `  Reçu : ${positionnels.length === 0 ? 'aucun' : positionnels.map((p) => `« ${p} »`).join(', ')}.\n` +
      '  Usage : node scripts/import-banque-questions.mjs <fichier> [--verification]\n',
  );
}

const cheminFichier = resolve(process.cwd(), positionnels[0]);
const verificationSeule = args.includes('--verification');
const versionner = args.includes('--versionner');
const cheminRapport = option('rapport');

const statut = option('statut') ?? 'active';
if (statut !== 'active' && statut !== 'draft') {
  abandon(
    `statut « ${statut} » non accepté.`,
    '  Une question importée est soit prête à servir (« active »), soit un brouillon\n' +
      '  à qualifier (« draft »). « archived » n’a pas de sens à l’import : on\n' +
      "  n'importe pas ce qu'on retire aussitôt de la circulation.\n",
  );
}

const limiteBrute = option('limite-rapport');
const limiteRapport = limiteBrute === null ? LIMITE_RAPPORT_DEFAUT : Number(limiteBrute);
if (!Number.isInteger(limiteRapport) || limiteRapport < 1) {
  abandon('--limite-rapport attend un entier ≥ 1.', `  Reçu : « ${limiteBrute} ».\n`);
}

let format = option('format');
if (format === null) {
  if (cheminFichier.toLowerCase().endsWith('.json')) format = 'json';
  else if (cheminFichier.toLowerCase().endsWith('.csv')) format = 'csv';
  else {
    abandon(
      'format indéterminable.',
      `  Le fichier « ${cheminFichier} » n’a ni l’extension .csv ni .json.\n` +
        '  Précise --format=csv ou --format=json.\n',
    );
  }
} else if (format !== 'csv' && format !== 'json') {
  abandon(`format « ${format} » inconnu.`, '  Attendu : --format=csv ou --format=json.\n');
}

if (!existsSync(cheminFichier)) {
  abandon('fichier introuvable.', `  Chemin : ${cheminFichier}\n`);
}

// ---------------------------------------------------------------------------
// LECTURE ET DÉCOUPAGE
// ---------------------------------------------------------------------------

/** Retire le BOM UTF-8 : Excel FR l'écrit systématiquement (§36.3). */
function sansBom(texte) {
  return texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
}

/**
 * Détecte le séparateur sur la ligne d'en-tête, hors guillemets.
 * Le §35.2 pose la règle (« séparateur `;` (ou `,` détecté) ») ; §36.4 hérite du
 * même format. En cas d'égalité, `;` gagne : c'est la convention du pack.
 */
function detecterSeparateur(texte) {
  let dansGuillemets = false;
  let pointsVirgules = 0;
  let virgules = 0;
  for (const c of texte) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && (c === '\n' || c === '\r')) break;
    else if (!dansGuillemets && c === ';') pointsVirgules += 1;
    else if (!dansGuillemets && c === ',') virgules += 1;
  }
  return virgules > pointsVirgules ? ',' : ';';
}

/**
 * Analyseur CSV (RFC 4180 : guillemets, `""` échappé, sauts de ligne dans les
 * cellules — le champ `guidance_fr` porte des ancres multi-lignes).
 * Écrit à la main : aucune dépendance hors de la liste 11 §1, et en ajouter une
 * serait une escalade (11 §8-1), pas une décision d'agent.
 * Rend, pour chaque enregistrement, le numéro de la ligne PHYSIQUE où il commence :
 * c'est ce numéro que l'administrateur voit dans son tableur.
 */
function analyserCsv(texte, separateur) {
  const enregistrements = [];
  let champs = [];
  let champ = '';
  let dansGuillemets = false;
  let ligne = 1;
  let ligneDebut = 1;
  let commence = false;

  const finDeChamp = () => {
    champs.push(champ);
    champ = '';
  };
  const finDEnregistrement = () => {
    finDeChamp();
    enregistrements.push({ ligne: ligneDebut, champs });
    champs = [];
    commence = false;
  };

  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (!commence && !dansGuillemets && (c === '\n' || c === '\r')) {
      // Ligne vide entre deux enregistrements : ignorée, jamais une erreur.
      if (c === '\n') ligne += 1;
      continue;
    }
    if (!commence) {
      commence = true;
      ligneDebut = ligne;
    }

    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else dansGuillemets = false;
      } else {
        if (c === '\n') ligne += 1;
        champ += c;
      }
      continue;
    }

    if (c === '"' && champ === '') dansGuillemets = true;
    else if (c === separateur) finDeChamp();
    else if (c === '\r') continue;
    else if (c === '\n') {
      ligne += 1;
      finDEnregistrement();
    } else champ += c;
  }

  if (commence || champs.length > 0 || champ !== '') finDEnregistrement();
  return { enregistrements, guillemetsNonFermes: dansGuillemets };
}

/**
 * Rend une valeur JSON sous la forme de CELLULE (chaîne), pour que les deux formats
 * traversent EXACTEMENT le même validateur. Un objet est re-sérialisé : l'auteur d'un
 * JSON écrit `"scoring": {"map": "identity"}` sans double encodage, et le validateur
 * reçoit la même chaîne que depuis un CSV.
 *
 * UN TABLEAU DE CHAÎNES est la seule traduction, et elle est nécessaire : le §36.4
 * encode les listes de codes « séparés par `|` » parce qu'une CELLULE de tableur n'a
 * pas de structure. En JSON, écrire `"secteurs": ["commerce", "industrie"]` est la
 * forme naturelle — la refuser ferait de l'équivalent JSON un format en trompe-l'œil,
 * qui accepte le fichier et n'y comprend rien.
 */
function celluleDepuisJson(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  if (Array.isArray(valeur) && valeur.every((v) => typeof v === 'string')) {
    return valeur.join(SEPARATEUR_LISTE);
  }
  return JSON.stringify(valeur);
}

// ---------------------------------------------------------------------------
// RAPPORT
// ---------------------------------------------------------------------------
const erreurs = [];
const avertissements = [];

function signaler(liste, ligne, colonne, code, message) {
  liste.push({ ligne, colonne, code, message });
}

function emplacement(ligne) {
  return format === 'json' ? `élément ${String(ligne)}` : `ligne ${String(ligne)}`;
}

// ---------------------------------------------------------------------------
// PASSE 1 — STRUCTURE DU FICHIER (aucune connexion à la base à ce stade)
// ---------------------------------------------------------------------------
const brut = sansBom(readFileSync(cheminFichier, 'utf8'));
const lignesBrutes = [];
let separateur = null;

if (format === 'csv') {
  separateur = detecterSeparateur(brut);
  const { enregistrements, guillemetsNonFermes } = analyserCsv(brut, separateur);
  if (guillemetsNonFermes) {
    signaler(
      erreurs,
      1,
      null,
      CODES_DEFAUT_IMPORT.NOMBRE_DE_CHAMPS,
      'Guillemet ouvert et jamais refermé : le découpage du fichier n’est pas fiable.',
    );
  }
  const entete = enregistrements[0];
  if (entete === undefined) {
    signaler(erreurs, 1, null, CODES_DEFAUT_IMPORT.FICHIER_VIDE, 'Fichier vide : aucun en-tête.');
  } else {
    const colonnes = entete.champs.map((c) => c.trim());
    verifierEntetes(colonnes);
    for (const enregistrement of enregistrements.slice(1)) {
      if (enregistrement.champs.length !== colonnes.length) {
        signaler(
          erreurs,
          enregistrement.ligne,
          null,
          CODES_DEFAUT_IMPORT.NOMBRE_DE_CHAMPS,
          `${String(enregistrement.champs.length)} champ(s) pour ${String(colonnes.length)} colonne(s) : ` +
            'un séparateur non protégé par des guillemets décalerait toutes les valeurs.',
        );
        continue;
      }
      const cellules = {};
      colonnes.forEach((colonne, i) => {
        cellules[colonne] = enregistrement.champs[i] ?? '';
      });
      lignesBrutes.push({ ligne: enregistrement.ligne, cellules });
    }
  }
} else {
  let racine;
  try {
    racine = JSON.parse(brut);
  } catch (cause) {
    abandon('JSON illisible.', `  ${cause instanceof Error ? cause.message : String(cause)}\n`);
  }
  const elements = Array.isArray(racine) ? racine : racine?.questions;
  if (!Array.isArray(elements)) {
    signaler(
      erreurs,
      1,
      null,
      CODES_DEFAUT_IMPORT.JSON_RACINE_INVALIDE,
      'Racine JSON invalide : un tableau de questions est attendu, ou un objet {"questions": [...]}.',
    );
  } else if (elements.length === 0) {
    signaler(erreurs, 1, null, CODES_DEFAUT_IMPORT.FICHIER_VIDE, 'Fichier vide : aucune question.');
  } else {
    // L'en-tête d'un JSON, ce sont les clés : elles sont contrôlées comme telles,
    // sur l'UNION des clés rencontrées — sinon un élément incomplet passerait.
    const clefs = new Set();
    for (const element of elements) {
      if (element === null || typeof element !== 'object' || Array.isArray(element)) continue;
      for (const clef of Object.keys(element)) clefs.add(clef);
    }
    verifierEntetes([...clefs]);
    elements.forEach((element, i) => {
      const numero = i + 1;
      if (element === null || typeof element !== 'object' || Array.isArray(element)) {
        signaler(
          erreurs,
          numero,
          null,
          CODES_DEFAUT_IMPORT.JSON_RACINE_INVALIDE,
          'Élément qui n’est pas un objet de question.',
        );
        return;
      }
      const cellules = {};
      for (const colonne of COLONNES_IMPORT_BANQUE) {
        cellules[colonne] = celluleDepuisJson(element[colonne]);
      }
      lignesBrutes.push({ ligne: numero, cellules });
    });
  }
}

/**
 * Les en-têtes du §36.4 sont OBLIGATOIRES : une colonne absente n'est pas une
 * colonne vide, c'est un fichier d'un autre format. On refuse aussi l'inconnue —
 * une colonne qu'on ignore silencieusement est une donnée qu'on croit avoir
 * importée.
 */
function verifierEntetes(colonnes) {
  const vues = new Set();
  for (const colonne of colonnes) {
    if (vues.has(colonne)) {
      signaler(
        erreurs,
        1,
        null,
        CODES_DEFAUT_IMPORT.ENTETE_DUPLIQUE,
        `En-tête en double : « ${colonne} ». Laquelle des deux colonnes ferait foi ?`,
      );
    }
    vues.add(colonne);
    if (!COLONNES_IMPORT_BANQUE.includes(colonne)) {
      signaler(
        erreurs,
        1,
        null,
        CODES_DEFAUT_IMPORT.ENTETE_INCONNU,
        `En-tête inconnu : « ${colonne} ». Le format §36.4 est fermé ; une colonne ignorée ` +
          'serait une donnée qu’on croit avoir importée.',
      );
    }
  }
  for (const attendue of COLONNES_IMPORT_BANQUE) {
    if (!vues.has(attendue)) {
      signaler(
        erreurs,
        1,
        null,
        CODES_DEFAUT_IMPORT.ENTETE_MANQUANT,
        `En-tête obligatoire absent : « ${attendue} » (§36.4).`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CONNEXION — en LECTURE pour la passe 1 ; l'écriture n'ouvre sa transaction
// qu'après un verdict vert.
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  abandon(
    'DATABASE_URL absente.',
    '  Les référentiels (blocs, secteurs, fonctions, profils) se vérifient EN BASE :\n' +
      '  un import qui les devinerait écrirait des étiquettes qui ne ciblent rien.\n' +
      '  Exemple : DATABASE_URL=postgresql://… node scripts/import-banque-questions.mjs f.csv\n',
  );
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
} catch (cause) {
  abandon('base injoignable.', `  ${cause instanceof Error ? cause.message : String(cause)}\n`);
}

let codeDeSortie = 0;

try {
  // Invariant 5 : la session vit en UTC, comme le serveur.
  await client.query("SET TIME ZONE 'UTC'");

  const referentiels = {
    blocs: new Map(),
    secteurs: new Set(),
    services: new Set(),
    profils: new Set(),
  };
  const { rows: blocs } = await client.query('SELECT id, code FROM blocks');
  for (const bloc of blocs) referentiels.blocs.set(bloc.code, bloc.id);
  for (const [table, cible] of [
    ['sectors', referentiels.secteurs],
    ['services', referentiels.services],
    ['interlocutor_profiles', referentiels.profils],
  ]) {
    const { rows } = await client.query(`SELECT code FROM ${table}`);
    for (const ligne of rows) cible.add(ligne.code);
  }

  if (referentiels.blocs.size === 0) {
    abandon(
      'référentiels vides.',
      '  Aucun bloc en base : le seed des référentiels (pnpm seed) n’a pas tourné.\n' +
        '  Importer maintenant rejetterait TOUTES les lignes pour « bloc inconnu ».\n',
    );
  }

  const referentielsPourValidation = {
    blocs: new Set(referentiels.blocs.keys()),
    secteurs: referentiels.secteurs,
    services: referentiels.services,
    profils: referentiels.profils,
  };

  // -------------------------------------------------------------------------
  // PASSE 1 — validation ligne à ligne. ZÉRO écriture, AUCUN arrêt anticipé.
  // -------------------------------------------------------------------------
  const questions = [];
  const premiereApparition = new Map();

  for (const { ligne, cellules } of lignesBrutes) {
    const verdict = analyserLigneBanque(cellules, referentielsPourValidation);
    for (const defaut of verdict.erreurs) {
      signaler(erreurs, ligne, defaut.colonne, defaut.code, defaut.message);
    }
    for (const defaut of verdict.avertissements) {
      signaler(avertissements, ligne, defaut.colonne, defaut.code, defaut.message);
    }

    const code = (cellules.code ?? '').trim();
    if (code !== '') {
      const deja = premiereApparition.get(code);
      if (deja !== undefined) {
        signaler(
          erreurs,
          ligne,
          'code',
          CODES_DEFAUT_IMPORT.CODE_DUPLIQUE_DANS_FICHIER,
          `Code « ${code} » déjà utilisé ${emplacement(deja)} : le code est la clé de ré-import ` +
            'de la banque (§36.4), deux lignes ne peuvent pas la partager.',
        );
      } else {
        premiereApparition.set(code, ligne);
      }
    }

    if (verdict.question !== null) questions.push({ ligne, question: verdict.question });
  }

  // --- Confrontation à la banque existante ---------------------------------
  // Le §36.4 exige « code unique » sans dire si l'unicité porte sur le FICHIER ou
  // sur la BANQUE (voir le rapport de lot, POINT OUVERT n° 2). Par défaut, les
  // deux : un code déjà en banque est refusé. `--versionner` applique alors la
  // règle de versionnage du 04 (nouvelle LIGNE, version+1, l'ancienne archivée) —
  // jamais de mutation en place, exigence que le lot L3 pose sur nous (§3-a).
  const codes = [...premiereApparition.keys()];
  const enBanque = new Map();
  if (codes.length > 0) {
    const { rows } = await client.query(
      `SELECT q.code, q.id, q.version, b.code AS bloc_code, q.text_fr, q.guidance_fr,
              q.answer_type, q.options, q.allow_range, q.weight, q.scoring, q.criticality,
              q.expected_source, q.sectors, q.target_services, q.levels, q.headcount_min,
              q.headcount_max, q.profiles, q.geo
         FROM questions q
         JOIN blocks b ON b.id = q.block_id
        WHERE q.code = ANY($1::text[])`,
      [codes],
    );
    for (const ligne of rows) {
      const precedent = enBanque.get(ligne.code);
      if (precedent === undefined || ligne.version > precedent.version)
        enBanque.set(ligne.code, ligne);
    }
  }

  /** Rebâtit, depuis une ligne de la base, la forme comparée par `empreinteQuestion`. */
  function questionDepuisBase(ligne) {
    return {
      code: ligne.code,
      blocCode: ligne.bloc_code,
      textFr: ligne.text_fr,
      guidanceFr: ligne.guidance_fr,
      answerType: ligne.answer_type,
      options: ligne.options,
      allowRange: ligne.allow_range,
      weight: Number(ligne.weight),
      scoring: ligne.scoring,
      criticality: ligne.criticality,
      expectedSource: ligne.expected_source,
      sectors: ligne.sectors ?? [],
      targetServices: ligne.target_services ?? [],
      levels: ligne.levels ?? [],
      headcountMin: ligne.headcount_min,
      headcountMax: ligne.headcount_max,
      profiles: ligne.profiles ?? [],
      geo: ligne.geo,
    };
  }

  const aEcrire = [];
  let inchangees = 0;

  for (const { ligne, question } of questions) {
    const existante = enBanque.get(question.code);
    if (existante === undefined) {
      aEcrire.push({ ligne, question, version: 1, archiver: false });
      continue;
    }
    if (!versionner) {
      signaler(
        erreurs,
        ligne,
        'code',
        CODES_DEFAUT_IMPORT.CODE_DEJA_EN_BANQUE,
        `Le code « ${question.code} » existe déjà en banque (version ${String(existante.version)}). ` +
          'Écraser une question serait perdre l’historique des réponses qui la citent : relancer ' +
          'avec --versionner pour en créer une NOUVELLE VERSION (04), ou changer le code.',
      );
      continue;
    }
    if (empreinteQuestion(questionDepuisBase(existante)) === empreinteQuestion(question)) {
      inchangees += 1;
      continue;
    }
    aEcrire.push({ ligne, question, version: existante.version + 1, archiver: true });
  }

  // -------------------------------------------------------------------------
  // VERDICT
  // -------------------------------------------------------------------------
  erreurs.sort((a, b) => a.ligne - b.ligne);
  avertissements.sort((a, b) => a.ligne - b.ligne);

  const cheminAffiche = relative(RACINE_DEPOT, cheminFichier) || cheminFichier;
  const entete =
    `${GRIS}fichier${RAZ} ${cheminAffiche}  ${GRIS}format${RAZ} ${format}` +
    (separateur === null ? '' : ` ${GRIS}séparateur${RAZ} « ${separateur} »`) +
    `  ${GRIS}lignes lues${RAZ} ${String(lignesBrutes.length)}`;
  console.log(entete);

  for (const avertissement of avertissements.slice(0, limiteRapport)) {
    console.log(
      `${JAUNE}⚠ ${emplacement(avertissement.ligne)}${RAZ}` +
        `${avertissement.colonne === null ? '' : ` [${avertissement.colonne}]`}` +
        ` ${GRIS}${avertissement.code}${RAZ} ${avertissement.message}`,
    );
  }

  const rapport = {
    fichier: cheminAffiche,
    format,
    separateur,
    mode: verificationSeule ? 'verification' : 'import',
    versionner,
    statut,
    horodatage: new Date().toISOString(),
    lignesLues: lignesBrutes.length,
    erreurs,
    avertissements,
    aEcrire: aEcrire.length,
    inchangees,
    ecrit: false,
    lignesEcrites: 0,
  };

  if (erreurs.length > 0) {
    for (const erreur of erreurs.slice(0, limiteRapport)) {
      console.error(
        `${ROUGE}✗ ${emplacement(erreur.ligne)}${RAZ}` +
          `${erreur.colonne === null ? '' : ` [${erreur.colonne}]`}` +
          ` ${GRIS}${erreur.code}${RAZ} ${erreur.message}`,
      );
    }
    if (erreurs.length > limiteRapport) {
      console.error(
        `${GRIS}… ${String(erreurs.length - limiteRapport)} erreur(s) supplémentaire(s) non détaillée(s) ` +
          `(--limite-rapport pour en voir plus).${RAZ}`,
      );
    }
    console.error(
      `\n${ROUGE}✗ IMPORT REFUSÉ${RAZ} — ${String(erreurs.length)} erreur(s) sur ` +
        `${String(lignesBrutes.length)} ligne(s).\n` +
        `${VERT}AUCUNE LIGNE N'A ÉTÉ ÉCRITE${RAZ} : la validation (passe 1) ne touche jamais la base ;\n` +
        "la transaction d'écriture (passe 2) n'est même pas ouverte. Corrige le fichier et\n" +
        'relance — au besoin avec --verification pour itérer sans rien engager.\n',
    );
    codeDeSortie = 1;
  } else if (verificationSeule) {
    console.log(
      `\n${VERT}✓ VÉRIFICATION VERTE${RAZ} — ${String(aEcrire.length)} question(s) prête(s) à écrire` +
        `${inchangees > 0 ? `, ${String(inchangees)} inchangée(s)` : ''}` +
        `${avertissements.length > 0 ? `, ${String(avertissements.length)} avertissement(s)` : ''}.\n` +
        `${GRIS}Rien n'a été écrit (--verification). Relance sans l'option pour importer.${RAZ}\n`,
    );
  } else {
    // -----------------------------------------------------------------------
    // PASSE 2 — écriture, une SEULE transaction.
    // -----------------------------------------------------------------------
    let ecrites = 0;
    try {
      await client.query('BEGIN');
      for (const { question, version, archiver } of aEcrire) {
        if (archiver) {
          // 04 : « une NOUVELLE VERSION = une NOUVELLE LIGNE (même code, version+1,
          // l'ancienne passe 'archived') — JAMAIS de mutation en place ». Seul le
          // STATUT de l'ancienne ligne bouge : son contenu est figé pour toujours,
          // parce que des `mission_questions` le référencent (L3 §3-a).
          await client.query(
            `UPDATE questions SET status = 'archived', updated_at = now()
              WHERE code = $1 AND status <> 'archived'`,
            [question.code],
          );
        }
        const resultat = await client.query(
          `INSERT INTO questions (id, code, block_id, version, status, text_fr, guidance_fr,
                                  answer_type, options, allow_range, weight, scoring, criticality,
                                  expected_source, sectors, target_services, levels,
                                  headcount_min, headcount_max, profiles, geo, origin, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13, $14,
                        $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20::jsonb, $21, 'banque', NULL)`,
          [
            // UUID v7 côté APPLICATIF (invariant 1, 11 §2) : PostgreSQL 16 n'a pas
            // de fonction native, et l'ordonnancement temporel des ids sert au keyset.
            uuidv7(),
            question.code,
            referentiels.blocs.get(question.blocCode),
            version,
            statut,
            question.textFr,
            question.guidanceFr,
            question.answerType,
            question.options === null ? null : JSON.stringify(question.options),
            question.allowRange,
            question.weight,
            question.scoring === null ? null : JSON.stringify(question.scoring),
            question.criticality,
            question.expectedSource,
            JSON.stringify(question.sectors),
            JSON.stringify(question.targetServices),
            JSON.stringify(question.levels),
            question.headcountMin,
            question.headcountMax,
            JSON.stringify(question.profiles),
            question.geo,
          ],
        );
        ecrites += resultat.rowCount;
      }

      if (ecrites !== aEcrire.length) {
        // Ceinture : une ligne planifiée qui n'aboutit pas est une incohérence, et
        // une incohérence ne se garde pas « à moitié ».
        throw new Error(
          `${String(ecrites)} ligne(s) écrite(s) pour ${String(aEcrire.length)} planifiée(s).`,
        );
      }
      await client.query('COMMIT');
      rapport.ecrit = true;
      rapport.lignesEcrites = ecrites;
      console.log(
        `\n${VERT}✓ IMPORT RÉUSSI${RAZ} — ${String(ecrites)} question(s) écrite(s) en statut ` +
          `« ${statut} »${inchangees > 0 ? `, ${String(inchangees)} inchangée(s)` : ''}` +
          `${avertissements.length > 0 ? `, ${String(avertissements.length)} avertissement(s)` : ''}.\n`,
      );
    } catch (cause) {
      await client.query('ROLLBACK');
      console.error(
        `\n${ROUGE}✗ IMPORT REFUSÉ EN ÉCRITURE${RAZ} — ${cause instanceof Error ? cause.message : String(cause)}\n` +
          `${VERT}La transaction a été ANNULÉE : aucune ligne ne subsiste.${RAZ}\n`,
      );
      codeDeSortie = 1;
    }
  }

  if (cheminRapport !== null) {
    writeFileSync(
      resolve(process.cwd(), cheminRapport),
      `${JSON.stringify(rapport, null, 2)}\n`,
      'utf8',
    );
    console.log(`${GRIS}Rapport JSON écrit : ${cheminRapport}${RAZ}`);
  }
} finally {
  await client.end();
}

process.exit(codeDeSortie);
