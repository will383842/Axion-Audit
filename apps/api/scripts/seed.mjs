#!/usr/bin/env node
// =============================================================================
// SEED — référentiels administrables (11 §5) et fixtures de démo (lot L1, A12)
//
//   pnpm seed        → référentiels : 9 blocs (§2.1) · secteurs · 11 fonctions
//                      (§16.3) · 9 profils d'interlocuteur avec group_code ·
//                      4 paliers · estimation_params normées · naf_sector_map ·
//                      COMPTE FONDATEUR avec `habilitated_at` POSÉ.
//   pnpm seed:demo   → mission fictive DÉTERMINISTE (2 unités, 12 questions
//                      couvrant TOUS les answer_types, 2 sessions, 1 pièce
//                      jointe). REFUSÉE SAUF si APP_ENV vaut explicitement
//                      dev, staging ou test (garde-fou qui échoue FERMÉ).
//
// CRITÈRE DUR DU LOT L1 : « seed REJOUABLE 2× À L'IDENTIQUE ». Chaque écriture
// est donc un `INSERT … ON CONFLICT` :
//   · DO NOTHING          quand la ligne est administrable ensuite et ne doit
//                         JAMAIS être écrasée par un rejeu (le compte fondateur,
//                         les fixtures de démo) ;
//   · DO UPDATE … WHERE   quand le seed fait autorité sur le libellé (les
//                         référentiels), avec une clause WHERE qui n'écrit que
//                         si quelque chose a RÉELLEMENT changé — sans elle, un
//                         second passage toucherait `updated_at` et le seed ne
//                         serait plus « identique ».
// La preuve n'est pas dans ce commentaire : `--empreinte` imprime, par table, le
// nombre de lignes ET un md5 du contenu ordonné. Deux passages, deux sorties
// strictement identiques, ou le critère n'est pas tenu.
//
// POURQUOI `habilitated_at` EST POSÉ ICI (04 §7 users, V2.8 / §34.4) : sans lui,
// l'affectation `mission_users` est refusée côté serveur, donc le PREMIER
// utilisateur de l'outil ne peut pas s'affecter sa propre première mission.
// C'est un auto-verrouillage, et le contrat le signale nommément.
//
// UUID : v7 côté applicatif (lib `uuidv7`, 11 §2) — PostgreSQL 16 n'a pas de
// `uuidv7()` native. Les fixtures de démo, elles, portent des UUID v7 LITTÉRAUX
// et figés : une fixture « déterministe » qui changerait d'id à chaque exécution
// ne serait pas déterministe.
// Traçabilité : E17, E36, E43 · critère L1 du fichier 07.
// =============================================================================
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { argon2id } from 'hash-wasm';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const GRIS = '[90m';
const RAZ = '[0m';

const RACINE_API = resolve(import.meta.dirname, '..');
const RACINE_DEPOT = resolve(RACINE_API, '../..');

// ---------------------------------------------------------------------------
// Environnement
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL || !process.env.SEED_ADMIN_EMAIL) {
  const fichier = resolve(RACINE_DEPOT, '.env');
  if (existsSync(fichier)) {
    try {
      process.loadEnvFile(fichier);
    } catch {
      /* un .env illisible ne doit pas masquer les messages ci-dessous */
    }
  }
}

const mode = process.argv.includes('--demo') ? 'demo' : 'referentiels';
const empreinteDemandee = process.argv.includes('--empreinte');

function abandon(titre, detail) {
  console.error(`${ROUGE}✗ seed (${mode}) : ${titre}${RAZ}\n${detail}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GARDE-FOU D'ENVIRONNEMENT (11 §5 : « jamais exécutable en prod »)
// ---------------------------------------------------------------------------
// LISTE BLANCHE, ET NON LISTE NOIRE — le sens du test a été INVERSÉ le
// 2026-08-29 (voir DECISIONS.md, entrée du jour). La forme précédente était
// `APP_ENV === 'prod'` → refus : un opt-in. APP_ENV NON DÉFINIE laissait donc
// le seed de démonstration s'exécuter contre le `DATABASE_URL` fourni, QUEL
// QU'IL SOIT — mesuré : variable retirée, le script passait le contrôle et
// tentait la connexion. Or l'oubli d'une variable est le cas NORMAL d'un shell
// d'exploitation, d'un `docker exec` à la main ou d'un cron dépouillé, et c'est
// précisément la situation où l'on est branché sur la production.
//
// Un garde-fou doit exiger la PREUVE QU'ON PEUT AGIR, jamais la preuve qu'on ne
// peut pas : tout ce qui n'est pas explicitement un environnement de
// non-production est traité comme la production. Les trois valeurs acceptées
// sont celles qui existent réellement dans ce dépôt — `dev` et `staging` du
// `appEnvSchema` (packages/shared/src/env.ts, qui énumère dev|staging|prod),
// et `test`, posée par le harnais d'intégration (apps/api/tests/aide/base-l1.ts,
// `executerSeed`). Ajouter une valeur ici est une décision, pas un réflexe.
//
// Le contrôle ne porte QUE sur `--demo` : le seed des référentiels, lui, DOIT
// pouvoir tourner en production — c'est lui qui crée le compte fondateur (11 §5).
// ---------------------------------------------------------------------------
const ENVIRONNEMENTS_DE_DEMO = ['dev', 'staging', 'test'];
const appEnv = process.env.APP_ENV;

if (mode === 'demo' && !ENVIRONNEMENTS_DE_DEMO.includes(appEnv ?? '')) {
  const constate =
    appEnv === undefined || appEnv === ''
      ? 'APP_ENV est ABSENTE (ou vide)'
      : `APP_ENV vaut « ${appEnv} »`;
  abandon(
    'REFUSÉ — environnement de non-production non prouvé.',
    '  Les fixtures de démo sont des données FICTIVES destinées aux E2E et à la\n' +
      "  recette P-E. Les injecter en production polluerait des données d'audit\n" +
      '  réelles, sur lesquelles un client signe un livrable.\n\n' +
      `  Constaté : ${constate}.\n` +
      `  Attendu  : APP_ENV parmi ${ENVIRONNEMENTS_DE_DEMO.join(', ')}.\n\n` +
      "  Ce refus n'est PAS une panne : le garde-fou échoue FERMÉ. Une variable\n" +
      "  absente ne prouve pas qu'on est hors production — elle prouve seulement\n" +
      "  qu'on n'en sait rien, et « on n'en sait rien » ne suffit pas pour écrire\n" +
      '  dans une base. Renseigne APP_ENV dans le .env, ou en variable :\n' +
      '      APP_ENV=dev pnpm seed:demo\n',
  );
}

if (!process.env.DATABASE_URL) {
  abandon('DATABASE_URL absente.', '  Renseigne-la dans le .env de la racine ou en variable.\n');
}

// ---------------------------------------------------------------------------
// DONNÉES DE SEED — valeurs LITTÉRALES du 11 §5, du 01 §2.1/§2.3 et du 03 §16.3.
// Aucune n'est inventée ici : chacune porte sa référence.
// ---------------------------------------------------------------------------

/** 9 blocs — 01 §2.1 (8 blocs d'origine + bloc 9 conformité AI Act). */
const BLOCS = [
  [
    'bloc_1',
    'Cadrage stratégique',
    'Collecte : historique, structure juridique, organigramme, filiales/pays, CA par activité, objectifs à 3 ans, culture du changement. Livrable : note de contexte + cartographie sponsors / freins politiques.',
  ],
  [
    'bloc_2',
    'Cartographie des processus',
    'Collecte : service par service — fréquence, temps passé, effectifs impliqués, outils, taux d’erreur, irritants terrain. Livrable : cartographie CHIFFRÉE = base de calcul ROI.',
  ],
  [
    'bloc_3',
    'Audit de la donnée',
    'Collecte : localisation, qualité, volume, silos, formats, hébergement, conformité RGPD par pays. Livrable : score de maturité data.',
  ],
  [
    'bloc_4',
    'Audit technique & sécurité',
    'Collecte : infra, ERP/CRM, intégrabilité API, sécurité, gestion des accès, souveraineté. Livrable : liste des prérequis techniques à lever.',
  ],
  [
    'bloc_5',
    'Audit humain & compétences',
    'Collecte : littératie IA par service, usages « sauvages », appétence, craintes. Livrable : cahier des charges du plan de formation Qualiopi.',
  ],
  [
    'bloc_6',
    'Cas d’usage',
    'Collecte : croisement des blocs 1-5. Livrable : liste de cas d’usage — gain estimé, coût, complexité, délai, risque.',
  ],
  [
    'bloc_7',
    'Priorisation',
    'Collecte : matrice impact / effort. Livrable : 3 vagues — quick wins 0-3 mois, chantiers 3-12 mois, transformations 12+ mois.',
  ],
  [
    'bloc_8',
    'Feuille de route & gouvernance',
    'Collecte : planning, budget, KPI, comité de pilotage, conduite du changement, charte d’usage IA. Livrable : feuille de route livrable + dispositif de gouvernance.',
  ],
  [
    'bloc_9',
    'Conformité AI Act & registre IA',
    'Collecte : inventaire des systèmes d’IA en usage, qualification par niveau de risque, transparence art. 50, preuve de formation art. 4. Livrable : registre des usages IA + plan de mise en conformité.',
  ],
];

/** Secteurs — couche sectorielle du 01 §2.3 (administrables ensuite en console). */
const SECTEURS = [
  ['artisanat', 'Artisanat', 'Crafts'],
  ['commerce', 'Commerce', 'Retail and wholesale'],
  ['industrie', 'Industrie', 'Manufacturing'],
  ['services', 'Services', 'Services'],
  ['sante', 'Santé', 'Healthcare'],
  ['transport_logistique', 'Transport & logistique', 'Transport and logistics'],
  ['agroalimentaire', 'Agroalimentaire', 'Food and agriculture'],
  ['autre', 'Autre', 'Other'],
];

/** Les 11 fonctions métier — codes 11 §5, libellés 03 §16.3. */
const SERVICES = [
  ['rh', 'RH'],
  ['finance_compta', 'Finance / comptabilité'],
  ['commercial_ventes', 'Commercial / ventes'],
  ['marketing_contenu', 'Marketing / contenu'],
  ['service_client', 'Service client'],
  ['logistique_operations', 'Logistique / opérations'],
  ['production', 'Production'],
  ['juridique_conformite', 'Juridique / conformité'],
  ['dsi_data', 'DSI / data'],
  ['direction_generale', 'Direction générale'],
  ['support_admin', 'Support / administratif'],
];

/** 9 profils d'interlocuteur AVEC leur group_code — 11 §5 (base du calcul §32.1). */
const PROFILS = [
  ['dirigeant', 'Dirigeant', 'direction'],
  ['dsi', 'DSI', 'direction'],
  ['daf', 'DAF', 'direction'],
  ['drh', 'DRH', 'direction'],
  ['resp_metier', 'Responsable métier', 'encadrement'],
  ['chef_equipe', "Chef d'équipe", 'encadrement'],
  ['salarie', 'Salarié', 'terrain'],
  ['technicien_operateur', 'Technicien / opérateur', 'terrain'],
  ['autre', 'Autre', 'terrain'],
];

/** 4 paliers — bornes du 11 §5 (micro 1-10 · pme 11-249 · eti 250-4999 · grand_compte 5000+). */
const PALIERS = [
  ['micro', 'Micro', 1, 10],
  ['pme', 'PME', 11, 249],
  ['eti', 'ETI', 250, 4999],
  ['grand_compte', 'Grand compte', 5000, null],
];

/**
 * `estimation_params` — clés NORMÉES du 04 §7 :
 *   duree_<type_session>_<profil> · preparation_<palier> · analyse_par_bloc ·
 *   redaction_<palier> · deplacement_par_site · taux_horaire_charge_<categorie> ·
 *   seuil_completude_bloc · seuil_fiabilite_answers · seuil_divergence_ecart_type.
 *
 * Les VALEURS citées par le 11 §5 sont reprises telles quelles (duree_entretien_dirigeant
 * 90, duree_entretien_salarie 45, analyse_par_bloc 0.5, taux_horaire_charge_cadre 65,
 * taux_horaire_charge_technicien 38, seuil_completude_bloc 0.60, seuil_fiabilite_answers 3,
 * seuil_divergence_ecart_type 1.5). Les autres sont des défauts RAISONNABLES, et
 * TOUTES portent `description: 'défaut à valider'` : Williams valide ou ajuste
 * AVANT la porte P-A. L'écran d'admin des params est en Phase 2.
 */
const A_VALIDER = 'défaut à valider';
const PARAMS = [
  // duree_<type_session>_<profil> — le 11 §5 ne nomme que deux combinaisons ;
  // les entretiens sont déclinés par profil (les 9 codes ci-dessus), les autres
  // types de session portent un défaut unique. Voir « doutes de spec » du rapport.
  ['duree_entretien_dirigeant', 90, 'min'],
  ['duree_entretien_dsi', 90, 'min'],
  ['duree_entretien_daf', 75, 'min'],
  ['duree_entretien_drh', 75, 'min'],
  ['duree_entretien_resp_metier', 60, 'min'],
  ['duree_entretien_chef_equipe', 60, 'min'],
  ['duree_entretien_salarie', 45, 'min'],
  ['duree_entretien_technicien_operateur', 45, 'min'],
  ['duree_entretien_autre', 45, 'min'],
  ['duree_observation_defaut', 60, 'min'],
  ['duree_demonstration_defaut', 45, 'min'],
  ['duree_analyse_documentaire_defaut', 60, 'min'],
  ['duree_releve_donnees_defaut', 30, 'min'],
  ['duree_atelier_defaut', 120, 'min'],
  // preparation_<palier>
  ['preparation_micro', 0.5, 'jour'],
  ['preparation_pme', 1, 'jour'],
  ['preparation_eti', 2, 'jour'],
  ['preparation_grand_compte', 4, 'jour'],
  // analyse
  ['analyse_par_bloc', 0.5, 'jour'],
  // redaction_<palier>
  ['redaction_micro', 0.5, 'jour'],
  ['redaction_pme', 1.5, 'jour'],
  ['redaction_eti', 3, 'jour'],
  ['redaction_grand_compte', 6, 'jour'],
  // déplacement
  ['deplacement_par_site', 0.25, 'jour'],
  // taux_horaire_charge_<categorie> — §32.4 ROI
  ['taux_horaire_charge_cadre', 65, 'eur_par_heure'],
  ['taux_horaire_charge_technicien', 38, 'eur_par_heure'],
  // seuils §32.1
  ['seuil_completude_bloc', 0.6, 'ratio'],
  ['seuil_fiabilite_answers', 3, 'nombre'],
  ['seuil_divergence_ecart_type', 1.5, 'ecart_type'],
];

/** Divisions NAF (2 chiffres) → secteur. R4 : pré-remplissage, administrable ensuite. */
function plage(debut, fin) {
  const codes = [];
  for (let n = debut; n <= fin; n += 1) codes.push(String(n).padStart(2, '0'));
  return codes;
}
const NAF = [
  [plage(1, 3), 'agroalimentaire'], // agriculture, sylviculture, pêche
  [plage(5, 9), 'industrie'], // industries extractives
  [plage(10, 12), 'agroalimentaire'], // denrées alimentaires, boissons, tabac
  [plage(13, 33), 'industrie'], // industrie manufacturière
  [plage(35, 39), 'industrie'], // énergie, eau, déchets
  [plage(41, 42), 'industrie'], // construction de bâtiments et génie civil
  [['43'], 'artisanat'], // travaux de construction spécialisés
  [plage(45, 47), 'commerce'], // commerce, réparation d'automobiles
  [plage(49, 53), 'transport_logistique'], // transports et entreposage
  [plage(55, 56), 'services'], // hébergement et restauration
  [plage(58, 66), 'services'], // information, communication, finance, assurance
  [plage(68, 75), 'services'], // immobilier, activités spécialisées
  [plage(77, 82), 'services'], // services administratifs et de soutien
  [plage(84, 85), 'services'], // administration publique, enseignement
  [plage(86, 88), 'sante'], // santé humaine et action sociale
  [plage(90, 94), 'services'], // arts, spectacles, associations
  [['95'], 'artisanat'], // réparation d'ordinateurs et de biens personnels
  [plage(96, 99), 'services'], // autres services, ménages, extraterritorial
];

// ---------------------------------------------------------------------------
// Empreinte de rejouabilité
// ---------------------------------------------------------------------------
const TABLES_REFERENTIELS = [
  'blocks',
  'sectors',
  'services',
  'interlocutor_profiles',
  'size_tiers',
  'naf_sector_map',
  'estimation_params',
  'users',
];
const TABLES_DEMO = [
  'companies',
  'missions',
  'mission_users',
  'org_units',
  'questions',
  'mission_questions',
  'interviews',
  'answers',
  'attachments',
];

async function empreinte(client, tables) {
  const lignes = [];
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '—') AS md5
         FROM ${table} t`,
    );
    lignes.push({ table, n: rows[0].n, md5: rows[0].md5.slice(0, 12) });
  }
  return lignes;
}

function afficherEmpreinte(lignes) {
  console.log(`\n${GRIS}  table                    lignes  empreinte${RAZ}`);
  for (const l of lignes) {
    console.log(`  ${l.table.padEnd(24)} ${String(l.n).padStart(6)}  ${l.md5}`);
  }
}

// ---------------------------------------------------------------------------
// Seed des référentiels
// ---------------------------------------------------------------------------
async function seedReferentiels(client) {
  // — 9 blocs ---------------------------------------------------------------
  for (const [i, [code, label, description]] of BLOCS.entries()) {
    await client.query(
      `INSERT INTO blocks (id, code, label_fr, position, is_default, description)
            VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (code) DO UPDATE
              SET label_fr = EXCLUDED.label_fr,
                  position = EXCLUDED.position,
                  description = EXCLUDED.description
            WHERE blocks.label_fr    IS DISTINCT FROM EXCLUDED.label_fr
               OR blocks.position    IS DISTINCT FROM EXCLUDED.position
               OR blocks.description IS DISTINCT FROM EXCLUDED.description`,
      [uuidv7(), code, label, i + 1, description],
    );
  }

  // — secteurs --------------------------------------------------------------
  for (const [code, fr, en] of SECTEURS) {
    await client.query(
      `INSERT INTO sectors (id, code, label_fr, label_en, is_active)
            VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (code) DO UPDATE
              SET label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en
            WHERE sectors.label_fr IS DISTINCT FROM EXCLUDED.label_fr
               OR sectors.label_en IS DISTINCT FROM EXCLUDED.label_en`,
      [uuidv7(), code, fr, en],
    );
  }

  // — 11 fonctions ----------------------------------------------------------
  for (const [code, label] of SERVICES) {
    await client.query(
      `INSERT INTO services (id, code, label_fr)
            VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET label_fr = EXCLUDED.label_fr
            WHERE services.label_fr IS DISTINCT FROM EXCLUDED.label_fr`,
      [uuidv7(), code, label],
    );
  }

  // — 9 profils d'interlocuteur --------------------------------------------
  for (const [code, label, groupe] of PROFILS) {
    await client.query(
      `INSERT INTO interlocutor_profiles (id, code, label_fr, group_code)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
              SET label_fr = EXCLUDED.label_fr, group_code = EXCLUDED.group_code
            WHERE interlocutor_profiles.label_fr   IS DISTINCT FROM EXCLUDED.label_fr
               OR interlocutor_profiles.group_code IS DISTINCT FROM EXCLUDED.group_code`,
      [uuidv7(), code, label, groupe],
    );
  }

  // — 4 paliers -------------------------------------------------------------
  for (const [code, label, min, max] of PALIERS) {
    await client.query(
      `INSERT INTO size_tiers (id, code, label, headcount_min, headcount_max)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE
              SET label = EXCLUDED.label,
                  headcount_min = EXCLUDED.headcount_min,
                  headcount_max = EXCLUDED.headcount_max
            WHERE size_tiers.label         IS DISTINCT FROM EXCLUDED.label
               OR size_tiers.headcount_min IS DISTINCT FROM EXCLUDED.headcount_min
               OR size_tiers.headcount_max IS DISTINCT FROM EXCLUDED.headcount_max`,
      [uuidv7(), code, label, min, max],
    );
  }

  // — naf_sector_map (R4) ---------------------------------------------------
  const { rows: secteurs } = await client.query('SELECT id, code FROM sectors');
  const idSecteur = new Map(secteurs.map((s) => [s.code, s.id]));
  for (const [codes, secteur] of NAF) {
    for (const naf of codes) {
      await client.query(
        `INSERT INTO naf_sector_map (naf_code, sector_id)
              VALUES ($1, $2)
         ON CONFLICT (naf_code) DO UPDATE SET sector_id = EXCLUDED.sector_id
              WHERE naf_sector_map.sector_id IS DISTINCT FROM EXCLUDED.sector_id`,
        [naf, idSecteur.get(secteur)],
      );
    }
  }

  // — estimation_params -----------------------------------------------------
  for (const [key, value, unit] of PARAMS) {
    await client.query(
      `INSERT INTO estimation_params (key, value, unit, description)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, unit = EXCLUDED.unit, description = EXCLUDED.description
            WHERE estimation_params.value       IS DISTINCT FROM EXCLUDED.value
               OR estimation_params.unit        IS DISTINCT FROM EXCLUDED.unit
               OR estimation_params.description IS DISTINCT FROM EXCLUDED.description`,
      [key, value, unit, A_VALIDER],
    );
  }

  // — compte fondateur ------------------------------------------------------
  await seedCompteFondateur(client);
}

async function seedCompteFondateur(client) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const motDePasse = process.env.SEED_ADMIN_PASSWORD;
  const nom = process.env.SEED_ADMIN_FULL_NAME ?? 'Administrateur';

  if (!email || !motDePasse) {
    abandon(
      'SEED_ADMIN_EMAIL ou SEED_ADMIN_PASSWORD absente.',
      '  Le compte fondateur est un livrable du lot L1 (11 §5). Sans lui, personne ne\n' +
        "  peut se connecter, et personne ne peut s'affecter la première mission.\n",
    );
  }
  if (motDePasse.length < 12) {
    abandon(
      'SEED_ADMIN_PASSWORD trop court.',
      '  Politique de mot de passe : 12 caractères minimum (06 §10.1).\n',
    );
  }

  // Argon2id (06 §10.1). Paramètres OWASP « m=19 MiB, t≥2, p=1 », relevés à t=3.
  // Sortie au format PHC (`$argon2id$v=19$m=…,t=…,p=…$sel$empreinte`) : le sel et
  // les paramètres voyagent AVEC l'empreinte, la vérification (lot L2) n'a rien à
  // stocker à côté.
  const passwordHash = await argon2id({
    password: motDePasse,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 3,
    memorySize: 19456,
    hashLength: 32,
    outputType: 'encoded',
  });

  // 1. Création — JAMAIS d'écrasement : un rejeu ne doit ni régénérer l'empreinte
  //    du mot de passe (elle changerait à chaque passage, sel aléatoire oblige),
  //    ni écraser un mot de passe que l'administrateur aurait déjà changé.
  await client.query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active)
          VALUES ($1, $2, $3, $4, 'admin', 'guide_strict', now(), true)
     ON CONFLICT (email) DO NOTHING`,
    [uuidv7(), nom, email, passwordHash],
  );

  // 2. Pose de l'habilitation si elle manque — c'est CETTE ligne qui lève
  //    l'auto-verrouillage §34.4, et elle doit rester vraie même sur une base où
  //    le compte existait déjà sans habilitation.
  const { rowCount } = await client.query(
    `UPDATE users SET habilitated_at = now(), updated_at = now()
      WHERE email = $1 AND habilitated_at IS NULL`,
    [email],
  );
  if (rowCount > 0) {
    console.log(
      `  ${JAUNE}habilitated_at posé sur le compte fondateur (anti-verrouillage §34.4)${RAZ}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixtures de démo (11 §5) — UUID v7 LITTÉRAUX, donc déterministes.
// ---------------------------------------------------------------------------
const DEMO = {
  company: '01996000-0000-7000-8000-000000000001',
  mission: '01996000-0000-7000-8000-000000000002',
  unite: ['01996000-0000-7000-8000-000000000010', '01996000-0000-7000-8000-000000000011'],
  session: ['01996000-0000-7000-8000-000000000020', '01996000-0000-7000-8000-000000000021'],
  piece: '01996000-0000-7000-8000-000000000030',
  question: (n) => `01996000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  missionQuestion: (n) => `01996000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
  answer: (n) => `01996000-0000-7000-8000-0000000003${String(n).padStart(2, '0')}`,
};

/**
 * 12 questions couvrant les 11 `answer_type` du 04 (la 12e double `scale_1_5`
 * pour rendre la DIVERGENCE §32.1-5 observable : elle a besoin de 2 réponses).
 * `scoring` respecte le format normé du 04 §7.3 ; `weight = 0` là où le 04
 * l'IMPOSE (free_text, date, table).
 */
const QUESTIONS_DEMO = [
  ['yes_no', 'Disposez-vous d’une charte d’usage de l’IA ?', { map: { oui: 5, non: 0 } }, 1, null],
  [
    'scale_1_5',
    'Comment évaluez-vous la maturité data de votre service ?',
    { map: 'identity' },
    1,
    null,
  ],
  [
    'single_choice',
    'Quel est votre principal outil métier ?',
    { source: 'options' },
    1,
    [
      { code: 'erp', label: 'ERP', score: 5 },
      { code: 'excel', label: 'Tableur', score: 1 },
      { code: 'papier', label: 'Papier', score: 0 },
    ],
  ],
  [
    'multi_choice',
    'Quelles données produisez-vous ?',
    { source: 'options', aggregate: 'max' },
    1,
    [
      { code: 'client', label: 'Données client', score: 4 },
      { code: 'production', label: 'Données de production', score: 5 },
    ],
  ],
  ['free_text', 'Décrivez votre principal irritant quotidien.', null, 0, null],
  [
    'number',
    'Combien de dossiers traitez-vous par semaine ?',
    { bands: [{ max: 20, score: 1 }, { max: 50, score: 3 }, { score: 5 }] },
    1,
    null,
  ],
  [
    'percent',
    'Quelle part de vos saisies est automatisée ?',
    { bands: [{ max: 20, score: 1 }, { max: 60, score: 3 }, { score: 5 }] },
    1,
    null,
  ],
  [
    'duration',
    'Combien de temps prend une clôture mensuelle ?',
    { bands: [{ max: 120, score: 5 }, { max: 480, score: 3 }, { score: 1 }] },
    1,
    null,
  ],
  [
    'money',
    'Quel est le budget logiciel annuel du service ?',
    { bands: [{ max: 5000, score: 1 }, { max: 50000, score: 3 }, { score: 5 }] },
    1,
    null,
  ],
  ['date', 'Date de la dernière mise à jour de votre ERP ?', null, 0, null],
  ['table', 'Listez vos exports récurrents (nom, fréquence, destinataire).', null, 0, null],
  [
    'scale_1_5',
    'Comment évaluez-vous l’appétence de vos équipes pour l’IA ?',
    { map: 'identity' },
    1,
    null,
  ],
];

async function seedDemo(client) {
  const { rows: admins } = await client.query(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
  );
  if (admins.length === 0) {
    abandon(
      'aucun compte admin en base.',
      '  Joue d’abord `pnpm seed` : les fixtures de démo s’appuient sur le compte\n' +
        '  fondateur (propriétaire des sessions, `conducted_by` §9.9).\n',
    );
  }
  const admin = admins[0].id;

  const { rows: secteurs } = await client.query(`SELECT id FROM sectors WHERE code = 'services'`);
  const { rows: paliers } = await client.query(`SELECT id FROM size_tiers WHERE code = 'pme'`);
  const { rows: blocs } = await client.query('SELECT id, code FROM blocks ORDER BY position');
  const { rows: fonctions } = await client.query(`SELECT id FROM services WHERE code = 'dsi_data'`);
  if (blocs.length === 0) {
    abandon('référentiels absents.', '  Joue d’abord `pnpm seed`.\n');
  }

  await client.query(
    `INSERT INTO companies (id, name, siren, naf_code, sector_id, headcount, sites_count, countries, notes)
          VALUES ($1, 'Société de démonstration', NULL, '62.01Z', $2, 42, 2, '["FR"]'::jsonb,
                  'Fixture DÉTERMINISTE des E2E et de la recette P-E — données entièrement fictives.')
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.company, secteurs[0]?.id ?? null],
  );

  await client.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, size_tier_id, active_sectors,
                           active_blocks, audit_level, commercial_offer, timezone, status,
                           llm_provider, created_by)
          VALUES ($1, $2, 'Mission de démonstration', 'france', $3, '["services"]'::jsonb,
                  $4, 'operationnel', 'mission_pme', 'Europe/Paris', 'en_cours', 'anthropic', $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      DEMO.mission,
      DEMO.company,
      paliers[0]?.id ?? null,
      JSON.stringify(blocs.map((b) => b.code)),
      admin,
    ],
  );

  await client.query(
    `INSERT INTO mission_users (mission_id, user_id, role_on_mission)
          VALUES ($1, $2, 'lead')
     ON CONFLICT (mission_id, user_id) DO NOTHING`,
    [DEMO.mission, admin],
  );

  // 2 unités : une racine, un service enfant (l'arbre §26.3 en miniature).
  await client.query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope, status, position)
          VALUES ($1, $2, NULL, 'etablissement', 'Siège (démo)', 42, true, 'active', 1)
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.unite[0], DEMO.mission],
  );
  await client.query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, service_ref_id,
                            in_scope, status, position)
          VALUES ($1, $2, $3, 'service', 'Service informatique (démo)', 6, $4, true, 'active', 2)
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.unite[1], DEMO.mission, DEMO.unite[0], fonctions[0]?.id ?? null],
  );

  // 12 questions + leurs mission_questions (snapshot COMPLET, V2.9).
  for (const [i, [type, texte, scoring, poids, options]] of QUESTIONS_DEMO.entries()) {
    const n = i + 1;
    const guidance =
      type === 'scale_1_5'
        ? 'Ancres de cotation (§32.4) — 1 = aucune pratique formalisée · 3 = pratique partielle et documentée · 5 = pratique systématique, mesurée et pilotée.'
        : 'Consigne de démonstration : reformuler la question et noter le verbatim.';

    await client.query(
      `INSERT INTO questions (id, code, block_id, version, status, text_fr, guidance_fr, answer_type,
                              options, allow_range, weight, scoring, criticality, sectors,
                              target_services, levels, profiles, geo, origin, created_by)
            VALUES ($1, $2, $3, 1, 'active', $4, $5, $6, $7, $8, $9, $10, 'important',
                    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'tous', 'banque', $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        DEMO.question(n),
        `DEMO-${String(n).padStart(2, '0')}`,
        blocs[i % blocs.length].id,
        texte,
        guidance,
        type,
        options ? JSON.stringify(options) : null,
        ['number', 'percent', 'duration', 'money'].includes(type),
        poids,
        scoring ? JSON.stringify(scoring) : null,
        admin,
      ],
    );

    await client.query(
      `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                      options_snapshot, weight_snapshot, scoring_snapshot,
                                      guidance_snapshot, answer_type_snapshot, criticality_snapshot,
                                      allow_range_snapshot, position, added_ad_hoc)
            VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, 'important', $10, $11, false)
       ON CONFLICT (id) DO NOTHING`,
      [
        DEMO.missionQuestion(n),
        DEMO.mission,
        DEMO.question(n),
        texte,
        options ? JSON.stringify(options) : null,
        poids,
        scoring ? JSON.stringify(scoring) : null,
        guidance,
        type,
        ['number', 'percent', 'duration', 'money'].includes(type),
        n,
      ],
    );
  }

  // 2 sessions : un entretien dirigeant au siège, une observation au service.
  await client.query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, person_name, person_role,
                             person_service_id, org_unit_id, consent_given, consent_audio,
                             schedule_status, status, general_notes,
                             client_created_at, client_updated_at)
          VALUES ($1, $2, $3, 'entretien', 'sur_site', 'Personne fictive 1', 'Dirigeant', $4, $5,
                  true, false, 'realise', 'termine', 'Session de démonstration — données fictives.',
                  timestamptz '2026-08-01 09:00:00+00', timestamptz '2026-08-01 10:30:00+00')
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.session[0], DEMO.mission, admin, fonctions[0]?.id ?? null, DEMO.unite[0]],
  );
  await client.query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                             schedule_status, status, general_notes,
                             client_created_at, client_updated_at)
          VALUES ($1, $2, $3, 'observation', NULL, $4, 'realise', 'termine',
                  'Observation de poste — données fictives.',
                  timestamptz '2026-08-01 14:00:00+00', timestamptz '2026-08-01 15:00:00+00')
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.session[1], DEMO.mission, admin, DEMO.unite[1]],
  );

  // Réponses. L'unicité (interview_id, mission_question_id) est respectée par
  // construction : la question 2 est posée aux DEUX sessions, jamais deux fois à
  // la même — c'est exactement ce que la contrainte protège.
  const REPONSES = [
    [1, DEMO.session[0], 1, { type: 'yes_no', v: 'non' }, 'entretien'],
    [2, DEMO.session[0], 2, { type: 'scale_1_5', v: 4 }, 'entretien'],
    [3, DEMO.session[0], 3, { type: 'single_choice', v: 'excel' }, 'entretien'],
    [
      4,
      DEMO.session[0],
      5,
      { type: 'free_text', v: 'Ressaisies manuelles entre deux outils.' },
      'entretien',
    ],
    [5, DEMO.session[0], 9, { type: 'money', v: 24000, currency: 'EUR' }, 'entretien'],
    [6, DEMO.session[1], 2, { type: 'scale_1_5', v: 2 }, 'observation'],
    [7, DEMO.session[1], 6, { type: 'range', low: 30, high: 45 }, 'observation'],
    [8, DEMO.session[1], 12, { type: 'scale_1_5', v: 3 }, 'observation'],
  ];
  for (const [n, session, question, valeur, source] of REPONSES) {
    await client.query(
      `INSERT INTO answers (id, interview_id, mission_question_id, value, source,
                            question_text_snapshot, revision, client_created_at, client_updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, 1,
                    timestamptz '2026-08-01 09:15:00+00', timestamptz '2026-08-01 09:15:00+00')
       ON CONFLICT (id) DO NOTHING`,
      [
        DEMO.answer(n),
        session,
        DEMO.missionQuestion(question),
        JSON.stringify(valeur),
        source,
        QUESTIONS_DEMO[question - 1][1],
      ],
    );
  }

  // 1 pièce jointe — une NOTE VOLANTE (P1-5) : pas de fichier, un `content`.
  await client.query(
    `INSERT INTO attachments (id, interview_id, mission_id, kind, content,
                              client_created_at, client_updated_at)
          VALUES ($1, $2, $3, 'note',
                  'Note volante de démonstration : vérifier le circuit de validation des factures.',
                  timestamptz '2026-08-01 10:00:00+00', timestamptz '2026-08-01 10:00:00+00')
     ON CONFLICT (id) DO NOTHING`,
    [DEMO.piece, DEMO.session[0], DEMO.mission],
  );
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
} catch (err) {
  abandon('PostgreSQL injoignable.', `  ${err.message}\n`);
}

try {
  await client.query("SET TIME ZONE 'UTC'");

  const { rows: presence } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'blocks'`,
  );
  if (presence[0].n === 0) {
    abandon(
      'schéma absent.',
      '  Joue d’abord `pnpm db:migrate` : le seed peuple un schéma, il ne le crée pas.\n',
    );
  }

  console.log(`seed (${mode}) …`);
  if (mode === 'demo') await seedDemo(client);
  else await seedReferentiels(client);

  const tables = mode === 'demo' ? [...TABLES_DEMO] : TABLES_REFERENTIELS;
  const lignes = await empreinte(client, tables);
  console.log(`${VERT}✓${RAZ} seed (${mode}) terminé.`);
  if (empreinteDemandee) afficherEmpreinte(lignes);
  else {
    console.log(
      `  ${GRIS}${lignes.map((l) => `${l.table}=${String(l.n)}`).join(' · ')}${RAZ}\n` +
        `  ${GRIS}(\`--empreinte\` imprime le md5 par table : c'est la preuve de rejouabilité)${RAZ}`,
    );
  }
} finally {
  await client.end();
}
