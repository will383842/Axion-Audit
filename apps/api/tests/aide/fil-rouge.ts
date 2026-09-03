// =============================================================================
// GÉNÉRATEUR DES DEUX MISSIONS CANONIQUES — OUTILLAGE DE TEST LIVRÉ AU LOT L1
//
// 09 §4bis / 07 §12 : « deux missions canoniques en fixtures DÈS L1 — FIL-TPE
// (micro, 8 pers., 1 entretien) et FIL-GC (grand compte fictif : arbre 150 unités
// / 4 niveaux, 60 sessions, ~8 000 réponses générées par script) ; un test
// @filrouge rejoue à chaque merge le parcours de bout en bout DISPONIBLE À DATE,
// sur LES DEUX échelles. Le générateur de données FIL-GC est un outillage de test
// livré au lot L1. »
//
// Au lot L1, « le parcours disponible à date » est celui que le schéma permet :
// poser les deux missions de bout en bout et vérifier qu'elles TIENNENT — aux
// deux échelles. Les lots suivants ALLONGENT ce parcours (sync, scoring,
// rapport) ; ils ne le réécrivent pas, et ce générateur ne bouge plus.
//
// Invariant 2 : aucune référence client. Les deux missions sont fictives, leurs
// libellés sont neutres, et rien ici ne nomme une entreprise réelle.
// Déterminisme : aucune valeur n'est tirée au hasard — tout est fonction de
// l'index de la ligne. Seuls les UUID v7 varient (P1-4 : générés côté client).
// =============================================================================
import type { Client } from 'pg';
import { uuidv7 } from 'uuidv7';

/** Dimensions canoniques de FIL-TPE (09 §4bis). */
export const FIL_TPE = {
  nom: 'FIL-TPE',
  effectif: 8,
  entretiens: 1,
  questions: 30,
} as const;

/**
 * Dimensions canoniques de FIL-GC (09 §4bis).
 * L'arbre : 1 groupe + 5 filiales + 24 directions + 120 services = 150 unités
 * sur 4 niveaux. 60 sessions × 135 questions = 8 100 réponses (« ~8 000 »).
 */
export const FIL_GC = {
  nom: 'FIL-GC',
  effectif: 12_000,
  unites: 150,
  niveaux: 4,
  entretiens: 60,
  questions: 135,
  reponses: 60 * 135,
  arbre: { groupes: 1, filiales: 5, directions: 24, services: 120 },
} as const;

export interface MissionCanonique {
  nom: string;
  missionId: string;
  entrepriseId: string;
  unites: number;
  entretiens: number;
  reponses: number;
}

/**
 * Insertion en lot : UNE seule requête, quelle que soit la volumétrie. Les
 * colonnes voyagent en tableaux et sont dépliées côté serveur par `unnest` —
 * 8 100 réponses en un aller-retour plutôt qu'en 8 100.
 */
async function insererEnLot(
  client: Client,
  sql: string,
  parametres: readonly unknown[],
): Promise<void> {
  await client.query(sql, [...parametres]);
}

async function creerUtilisateur(client: Client, marqueur: string): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'argon2-factice', 'consultant', 'guide_strict', now(), true, now(), now())`,
    [id, `Auditeur ${marqueur}`, `auditeur.${marqueur}.${id}@exemple.test`],
  );
  return id;
}

/** Bloc porteur des questions de fixture — code préfixé pour ne jamais heurter le seed. */
async function creerBlocFixture(client: Client, marqueur: string): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO blocks (id, code, label_fr, position, is_default, description)
     VALUES ($1, $2, $3, 1, false, $4)`,
    [
      id,
      `fixture_${marqueur.toLowerCase()}_${id.slice(0, 8)}`,
      `Bloc de fixture ${marqueur}`,
      'Bloc technique du fil rouge — jamais exposé à une mission réelle.',
    ],
  );
  return id;
}

/**
 * Crée `nombre` questions de banque et leurs `mission_questions` figées.
 * Le figeage COMPLET (04 §7, V2.9) est reproduit : la mission doit être autonome
 * de la banque, c'est ce qui rend le pull terrain lisible hors ligne.
 */
async function creerQuestionnaire(
  client: Client,
  missionId: string,
  blocId: string,
  marqueur: string,
  nombre: number,
): Promise<string[]> {
  const questionIds: string[] = [];
  const missionQuestionIds: string[] = [];
  const codes: string[] = [];
  const textes: string[] = [];
  const positions: number[] = [];

  for (let i = 0; i < nombre; i += 1) {
    questionIds.push(uuidv7());
    missionQuestionIds.push(uuidv7());
    codes.push(`fixture_${marqueur.toLowerCase()}_q${String(i + 1).padStart(3, '0')}`);
    textes.push(`Question ${String(i + 1)} du fil rouge ${marqueur} ?`);
    positions.push(i + 1);
  }

  await insererEnLot(
    client,
    `INSERT INTO questions (id, code, block_id, version, status, text_fr, answer_type,
                            weight, criticality, origin, created_at, updated_at)
     SELECT q.id, q.code, $3::uuid, 1, 'active', q.texte, 'yes_no', 1, 'important',
            'banque', now(), now()
     FROM unnest($1::uuid[], $2::text[], $4::text[]) AS q(id, code, texte)`,
    [questionIds, codes, blocId, textes],
  );

  await insererEnLot(
    client,
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version,
                                    text_snapshot, answer_type_snapshot, weight_snapshot,
                                    criticality_snapshot, position, added_ad_hoc)
     SELECT m.id, $2::uuid, m.question_id, 1, m.texte, 'yes_no', 1, 'important',
            m.position, false
     FROM unnest($1::uuid[], $3::uuid[], $4::text[], $5::int[])
          AS m(id, question_id, texte, position)`,
    [missionQuestionIds, missionId, questionIds, textes, positions],
  );

  return missionQuestionIds;
}

/** Crée les sessions de collecte et une réponse à CHAQUE question figée. */
async function creerSessionsEtReponses(
  client: Client,
  missionId: string,
  auditeurId: string,
  uniteIds: readonly string[],
  missionQuestionIds: readonly string[],
  nombreSessions: number,
): Promise<{ entretiens: number; reponses: number }> {
  const entretienIds: string[] = [];
  const unitesDesSessions: string[] = [];

  for (let i = 0; i < nombreSessions; i += 1) {
    // Répartition déterministe des sessions sur l'arbre : aucune unité n'est tirée
    // au hasard, la même graine produit toujours le même plan de charge.
    const unite = uniteIds[i % uniteIds.length];
    if (unite === undefined) {
      throw new Error('Fil rouge : aucune unité disponible pour porter les sessions.');
    }
    entretienIds.push(uuidv7());
    unitesDesSessions.push(unite);
  }

  await insererEnLot(
    client,
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                             status, schedule_status, consent_given, consent_audio,
                             client_created_at, client_updated_at, created_at, updated_at)
     SELECT s.id, $2::uuid, $3::uuid, 'entretien', 'sur_site', s.unite,
            'termine', 'realise', true, false, now(), now(), now(), now()
     FROM unnest($1::uuid[], $4::uuid[]) AS s(id, unite)`,
    [entretienIds, missionId, auditeurId, unitesDesSessions],
  );

  const reponseIds: string[] = [];
  const reponseEntretiens: string[] = [];
  const reponseQuestions: string[] = [];
  const reponseValeurs: string[] = [];

  let rang = 0;
  for (const entretienId of entretienIds) {
    for (const missionQuestionId of missionQuestionIds) {
      reponseIds.push(uuidv7());
      reponseEntretiens.push(entretienId);
      reponseQuestions.push(missionQuestionId);
      // Alternance déterministe oui/non : aucune donnée aléatoire dans une fixture.
      reponseValeurs.push(JSON.stringify({ type: 'yes_no', v: rang % 2 === 0 ? 'oui' : 'non' }));
      rang += 1;
    }
  }

  await insererEnLot(
    client,
    `INSERT INTO answers (id, interview_id, mission_question_id, value, source,
                          revision, client_created_at, client_updated_at, created_at, updated_at)
     SELECT r.id, r.entretien, r.question, r.valeur::jsonb, 'entretien', 1,
            now(), now(), now(), now()
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[])
          AS r(id, entretien, question, valeur)`,
    [reponseIds, reponseEntretiens, reponseQuestions, reponseValeurs],
  );

  return { entretiens: entretienIds.length, reponses: reponseIds.length };
}

/**
 * FIL-TPE — la plus petite mission qui existe : micro-entreprise mono-site,
 * 8 personnes, UN entretien dirigeant, ~30 questions (01 §2.3, palier micro).
 */
export async function genererFilTpe(client: Client): Promise<MissionCanonique> {
  const auditeurId = await creerUtilisateur(client, 'fil-tpe');

  const entrepriseId = uuidv7();
  await client.query(
    `INSERT INTO companies (id, name, siren, headcount, sites_count, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, 1, now(), now())`,
    [entrepriseId, 'Micro-entreprise fictive du fil rouge', FIL_TPE.effectif],
  );

  const missionId = uuidv7();
  await client.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, commercial_offer,
                           status, timezone, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'diagnostic_cadrage', 'audit_flash', 'en_cours',
             'Europe/Paris', $4, now(), now())`,
    [missionId, entrepriseId, `Mission canonique ${FIL_TPE.nom}`, auditeurId],
  );

  const uniteId = uuidv7();
  await client.query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                            status, position, created_at, updated_at)
     VALUES ($1, $2, NULL, 'etablissement', $3, $4, true, 'active', 1, now(), now())`,
    [uniteId, missionId, 'Établissement unique', FIL_TPE.effectif],
  );

  const blocId = await creerBlocFixture(client, FIL_TPE.nom);
  const missionQuestionIds = await creerQuestionnaire(
    client,
    missionId,
    blocId,
    FIL_TPE.nom,
    FIL_TPE.questions,
  );

  const collecte = await creerSessionsEtReponses(
    client,
    missionId,
    auditeurId,
    [uniteId],
    missionQuestionIds,
    FIL_TPE.entretiens,
  );

  return {
    nom: FIL_TPE.nom,
    missionId,
    entrepriseId,
    unites: 1,
    entretiens: collecte.entretiens,
    reponses: collecte.reponses,
  };
}

/**
 * FIL-GC — l'autre extrémité de l'échelle : grand compte fictif, arbre de
 * 150 unités sur 4 niveaux (§26.3 : groupe → filiale → direction → service),
 * 60 sessions, ~8 000 réponses. C'est la mission qui prouve que « la même app,
 * le même parcours » tient de la TPE au groupe.
 */
export async function genererFilGc(client: Client): Promise<MissionCanonique> {
  const auditeurId = await creerUtilisateur(client, 'fil-gc');

  const entrepriseId = uuidv7();
  await client.query(
    `INSERT INTO companies (id, name, siren, headcount, sites_count, countries, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, 40, $4::jsonb, now(), now())`,
    [
      entrepriseId,
      'Groupe fictif du fil rouge',
      FIL_GC.effectif,
      JSON.stringify(['FR', 'DE', 'ES']),
    ],
  );

  const missionId = uuidv7();
  await client.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, country_code, audit_level,
                           commercial_offer, status, timezone, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'multi_pays', 'FR', 'strategique_groupe', 'grand_programme',
             'en_cours', 'Europe/Paris', $4, now(), now())`,
    [missionId, entrepriseId, `Mission canonique ${FIL_GC.nom}`, auditeurId],
  );

  // --- L'arbre, niveau par niveau : un parent doit exister avant son enfant ---
  const niveaux: string[][] = [];
  const gabarits: readonly { nombre: number; kind: string; libelle: string }[] = [
    { nombre: FIL_GC.arbre.groupes, kind: 'groupe', libelle: 'Groupe' },
    { nombre: FIL_GC.arbre.filiales, kind: 'filiale', libelle: 'Filiale' },
    { nombre: FIL_GC.arbre.directions, kind: 'direction', libelle: 'Direction' },
    { nombre: FIL_GC.arbre.services, kind: 'service', libelle: 'Service' },
  ];

  for (const [niveau, gabarit] of gabarits.entries()) {
    const parents = niveau === 0 ? [] : (niveaux[niveau - 1] ?? []);

    const ids: string[] = [];
    const parentsDeLaLigne: (string | null)[] = [];
    const noms: string[] = [];
    const positions: number[] = [];

    for (let i = 0; i < gabarit.nombre; i += 1) {
      ids.push(uuidv7());
      parentsDeLaLigne.push(niveau === 0 ? null : (parents[i % parents.length] ?? null));
      noms.push(`${gabarit.libelle} ${String(i + 1)}`);
      positions.push(i + 1);
    }

    await insererEnLot(
      client,
      `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                              status, position, created_at, updated_at)
       SELECT u.id, $2::uuid, u.parent, $3::text, u.nom, 80, true, 'active', u.position,
              now(), now()
       FROM unnest($1::uuid[], $4::uuid[], $5::text[], $6::int[])
            AS u(id, parent, nom, position)`,
      [ids, missionId, gabarit.kind, parentsDeLaLigne, noms, positions],
    );

    niveaux.push(ids);
  }

  const toutesLesUnites = niveaux.flat();
  // Les sessions se tiennent au niveau le plus fin : c'est là que vit le terrain.
  const unitesFeuilles = niveaux.at(-1) ?? [];

  const blocId = await creerBlocFixture(client, FIL_GC.nom);
  const missionQuestionIds = await creerQuestionnaire(
    client,
    missionId,
    blocId,
    FIL_GC.nom,
    FIL_GC.questions,
  );

  const collecte = await creerSessionsEtReponses(
    client,
    missionId,
    auditeurId,
    unitesFeuilles,
    missionQuestionIds,
    FIL_GC.entretiens,
  );

  return {
    nom: FIL_GC.nom,
    missionId,
    entrepriseId,
    unites: toutesLesUnites.length,
    entretiens: collecte.entretiens,
    reponses: collecte.reponses,
  };
}

// =============================================================================
// EXTENSION L3 — LE PARCOURS PAR L'API : entreprise → mission → arbre §35.2 →
// prévisualisation §33.4 → figeage M2
//
// `DECISIONS.md` 2026-08-31 (« [L3 → A01] La migration du fil rouge vers
// Playwright est datée au L3 ») : « le fil rouge d'intégration est ÉTENDU au
// parcours que L3 rend disponible — création de mission, import d'arbre, figeage
// du questionnaire — sur FIL-TPE ET FIL-GC ». Revue croisée A17 du 2026-09-02,
// bloquant B-4 : ce qui suit est ce correctif.
//
// CE QUE CETTE EXTENSION AJOUTE, ET CE QU'ELLE NE TOUCHE PAS. Rien au-dessus de
// cette ligne ne bouge : `genererFilTpe` / `genererFilGc` restent le générateur
// SQL du L1 (schéma seul, sans route), et `l1-filrouge` rend le même verdict
// qu'avant. Ici, tout ce que L3 expose passe PAR LA ROUTE ; seule la BANQUE de
// questions est semée par SQL — elle relève de l'import L4 (§36.4), dont le fil
// rouge n'a pas encore l'étape (09 §4bis : « import banque de recette (L4) »).
//
// Invariant 2 : libellés neutres, aucune entreprise réelle. Déterminisme : tout
// est fonction de l'index de la ligne ; seuls les UUID v7 varient.
// =============================================================================

/** Les sept `kind` du §35.2, dans l'ordre du pack. */
export type KindUniteCsv =
  'groupe' | 'filiale' | 'etablissement' | 'direction' | 'service' | 'equipe' | 'poste';

/** Une ligne d'unité du CSV §35.2 — les neuf colonnes, vides quand absentes. */
export interface LigneArbreCsv {
  readonly ref: string;
  readonly name: string;
  readonly kind: KindUniteCsv;
  readonly parentRef: string;
  readonly countryCode: string;
  readonly headcount: string;
  readonly serviceCode: string;
  readonly sectorCode: string;
  readonly timezone: string;
}

/** Ce que le test attend de l'ARBRE après import — compté depuis les lignes. */
export interface AttentesArbre {
  /** Lignes du fichier = unités créées par l'import (la racine d'office est EN PLUS). */
  readonly unites: number;
  /** Profondeur maximale du sous-arbre importé (racine importée = niveau 1). */
  readonly niveaux: number;
  /** Nombre d'unités par `kind`. */
  readonly parKind: Readonly<Partial<Record<KindUniteCsv, number>>>;
  /** Unités qui portent un `service_code` (donc un `service_ref_id` en base). */
  readonly avecFonction: number;
  /** Les codes de `services` (11 §5) que l'arbre porte — ceux que M2 « voit ». */
  readonly fonctionsPresentes: readonly string[];
}

/**
 * Le plan de la BANQUE semée pour une fixture. Les questions « ciblées » portent
 * `target_services` ; celles qui visent une fonction ABSENTE de l'arbre doivent
 * être écartées par le filtre `services_arbre` (03 §16.3 : « les paquets
 * logistique ne sont générés que si l'arbre contient une unité logistique »).
 * C'est la seule preuve qu'un fil rouge apporte et qu'aucune suite unitaire ne
 * donne : l'étape 2 (l'arbre) DÉCIDE de l'étape 4 (le questionnaire).
 */
export interface PlanBanque {
  readonly transverses: number;
  readonly cibleesPresentes: number;
  readonly cibleesAbsentes: number;
  /** Code de `services` porté par l'arbre. */
  readonly fonctionPresente: string;
  /** Code de `services` ABSENT de l'arbre. */
  readonly fonctionAbsente: string;
}

/** Une fixture du parcours L3, prête à être jouée PAR L'API. */
export interface FixtureParcoursL3 {
  readonly nom: string;
  /** Minuscules + tirets bas : entre dans un code de bloc (`codeReferentielSchema`). */
  readonly marqueur: string;
  readonly entreprise: {
    readonly nom: string;
    readonly effectif: number;
    readonly sites: number;
    readonly pays: readonly string[];
  };
  readonly mission: {
    readonly titre: string;
    readonly geoScope: 'france' | 'multi_pays';
    readonly countryCode: string | null;
    readonly auditLevel: 'diagnostic_cadrage' | 'operationnel' | 'strategique_groupe';
    readonly commercialOffer: string;
    /** Code de `size_tiers` (seed 11 §5). */
    readonly palier: string;
    readonly secteursActifs: readonly string[];
  };
  readonly lignesArbre: readonly LigneArbreCsv[];
  readonly arbre: AttentesArbre;
  readonly banque: PlanBanque;
  /** Questions attendues au figeage : transverses + ciblées présentes. */
  readonly questionsAttendues: number;
}

// -----------------------------------------------------------------------------
// FABRIQUE DU CSV §35.2
// -----------------------------------------------------------------------------

/**
 * Les neuf colonnes, DANS L'ORDRE du §35.2. Transcrites ici, jamais importées de
 * `@axion/shared` : un fil rouge qui lirait le format dans le code testé passerait
 * quel que soit le format.
 */
export const ENTETE_CSV_35_2 =
  'ref;name;kind;parent_ref;country_code;headcount;service_code;sector_code;timezone';

/** Le BOM UTF-8 qu'un tableur francophone pose en tête — construit, jamais collé. */
const BOM_UTF8 = String.fromCharCode(0xfe_ff);

function cellule(valeur: string): string {
  return valeur.includes(';') || valeur.includes('"') || /[\r\n]/.test(valeur)
    ? `"${valeur.replace(/"/g, '""')}"`
    : valeur;
}

/** Les neuf cellules d'une ligne, dans l'ordre de l'en-tête — `kind` reçu en chaîne. */
function cellules(ligne: LigneArbreCsv, kind: string): readonly string[] {
  return [
    ligne.ref,
    ligne.name,
    kind,
    ligne.parentRef,
    ligne.countryCode,
    ligne.headcount,
    ligne.serviceCode,
    ligne.sectorCode,
    ligne.timezone,
  ];
}

function ligneCsv(ligne: LigneArbreCsv): string {
  return cellules(ligne, ligne.kind).map(cellule).join(';');
}

/**
 * Le fichier tel qu'un tableur FR l'écrit : BOM, `;`, CRLF, saut de ligne final.
 * C'est la forme que le sponsor remet au cadrage (§35.2 : « souvent depuis leur
 * organigramme Excel »).
 */
export function csvArbre(lignes: readonly LigneArbreCsv[]): string {
  return `${BOM_UTF8}${[ENTETE_CSV_35_2, ...lignes.map(ligneCsv)].join('\r\n')}\r\n`;
}

/**
 * Le MÊME fichier, sa DERNIÈRE ligne corrompue (`kind` hors énumération). Sert à
 * prouver l'atomicité sur le vrai volume : une implémentation qui insère ligne à
 * ligne aurait écrit n−1 unités avant de rencontrer le défaut.
 */
export function csvArbreCorrompuEnFin(lignes: readonly LigneArbreCsv[]): string {
  const derniere = lignes.at(-1);
  if (derniere === undefined) throw new Error('Fil rouge : arbre vide, rien à corrompre.');
  // « departement » n'est pas un des sept `kind` du §35.2 : `VALEUR_HORS_ENUM`.
  const corrompue = cellules(derniere, 'departement').map(cellule).join(';');
  const contenu = [ENTETE_CSV_35_2, ...lignes.slice(0, -1).map(ligneCsv), corrompue];
  return `${BOM_UTF8}${contenu.join('\r\n')}\r\n`;
}

function ligne(
  base: Pick<LigneArbreCsv, 'ref' | 'name' | 'kind' | 'parentRef'>,
  reste: Partial<Omit<LigneArbreCsv, 'ref' | 'name' | 'kind' | 'parentRef'>> = {},
): LigneArbreCsv {
  return {
    ...base,
    countryCode: reste.countryCode ?? '',
    headcount: reste.headcount ?? '',
    serviceCode: reste.serviceCode ?? '',
    sectorCode: reste.sectorCode ?? '',
    timezone: reste.timezone ?? '',
  };
}

// -----------------------------------------------------------------------------
// FIL-TPE — « quelques unités » : un établissement et deux équipes
// -----------------------------------------------------------------------------

const FONCTIONS_TPE = ['production', 'support_admin'] as const;

function lignesArbreFilTpe(): LigneArbreCsv[] {
  return [
    ligne(
      { ref: 'e1', name: 'Atelier unique', kind: 'etablissement', parentRef: '' },
      { countryCode: 'FR', headcount: String(FIL_TPE.effectif) },
    ),
    ligne(
      { ref: 'q1', name: 'Équipe production', kind: 'equipe', parentRef: 'e1' },
      { headcount: '5', serviceCode: FONCTIONS_TPE[0] },
    ),
    ligne(
      { ref: 'q2', name: 'Équipe administration', kind: 'equipe', parentRef: 'e1' },
      { headcount: '3', serviceCode: FONCTIONS_TPE[1] },
    ),
  ];
}

export const PARCOURS_FIL_TPE: FixtureParcoursL3 = {
  nom: FIL_TPE.nom,
  marqueur: 'fil_tpe',
  entreprise: {
    nom: 'Micro-entreprise fictive du fil rouge',
    effectif: FIL_TPE.effectif,
    sites: 1,
    pays: ['FR'],
  },
  mission: {
    titre: `Mission canonique ${FIL_TPE.nom} (parcours L3)`,
    geoScope: 'france',
    countryCode: 'FR',
    auditLevel: 'diagnostic_cadrage',
    commercialOffer: 'audit_flash',
    palier: 'micro',
    secteursActifs: ['artisanat'],
  },
  lignesArbre: lignesArbreFilTpe(),
  arbre: {
    unites: 3,
    niveaux: 2,
    parKind: { etablissement: 1, equipe: 2 },
    avecFonction: 2,
    fonctionsPresentes: FONCTIONS_TPE,
  },
  banque: {
    transverses: 27,
    cibleesPresentes: 3,
    cibleesAbsentes: 2,
    fonctionPresente: 'production',
    fonctionAbsente: 'dsi_data',
  },
  // 27 + 3 = 30 : la dimension canonique du L1 (`FIL_TPE.questions`), retrouvée
  // par l'assembleur et non plus posée par SQL.
  questionsAttendues: FIL_TPE.questions,
};

// -----------------------------------------------------------------------------
// FIL-GC — 150 unités sur 4 niveaux, POUR DE VRAI, par le CSV §35.2
// -----------------------------------------------------------------------------

/** Huit des onze fonctions (11 §5) réparties sur les 120 services : 15 chacune. */
const FONCTIONS_GC = [
  'rh',
  'finance_compta',
  'commercial_ventes',
  'service_client',
  'logistique_operations',
  'production',
  'dsi_data',
  'direction_generale',
] as const;

/** Les pays des filiales, dans l'ordre de `companies.countries` du L1. */
const PAYS_FILIALES = ['FR', 'DE', 'ES', 'FR', 'DE'] as const;
const FUSEAUX_FILIALES = [
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
] as const;

function lignesArbreFilGc(): LigneArbreCsv[] {
  const { groupes, filiales, directions, services } = FIL_GC.arbre;
  const lignes: LigneArbreCsv[] = [];

  for (let i = 0; i < groupes; i += 1) {
    lignes.push(
      ligne(
        {
          ref: `g${String(i + 1)}`,
          name: `Groupe ${String(i + 1)}`,
          kind: 'groupe',
          parentRef: '',
        },
        { countryCode: 'FR', headcount: String(FIL_GC.effectif), sectorCode: 'services' },
      ),
    );
  }
  for (let i = 0; i < filiales; i += 1) {
    lignes.push(
      ligne(
        {
          ref: `f${String(i + 1)}`,
          name: `Filiale ${String(i + 1)}`,
          kind: 'filiale',
          parentRef: 'g1',
        },
        {
          countryCode: PAYS_FILIALES[i % PAYS_FILIALES.length] ?? 'FR',
          headcount: '2400',
          timezone: FUSEAUX_FILIALES[i % FUSEAUX_FILIALES.length] ?? '',
        },
      ),
    );
  }
  for (let i = 0; i < directions; i += 1) {
    lignes.push(
      ligne(
        {
          ref: `d${String(i + 1)}`,
          name: `Direction ${String(i + 1)}`,
          kind: 'direction',
          parentRef: `f${String((i % filiales) + 1)}`,
        },
        { headcount: '500' },
      ),
    );
  }
  for (let i = 0; i < services; i += 1) {
    lignes.push(
      ligne(
        {
          ref: `s${String(i + 1)}`,
          name: `Service ${String(i + 1)}`,
          kind: 'service',
          parentRef: `d${String((i % directions) + 1)}`,
        },
        { headcount: '80', serviceCode: FONCTIONS_GC[i % FONCTIONS_GC.length] ?? '' },
      ),
    );
  }
  return lignes;
}

export const PARCOURS_FIL_GC: FixtureParcoursL3 = {
  nom: FIL_GC.nom,
  marqueur: 'fil_gc',
  entreprise: {
    nom: 'Groupe fictif du fil rouge',
    effectif: FIL_GC.effectif,
    sites: 40,
    pays: ['FR', 'DE', 'ES'],
  },
  mission: {
    titre: `Mission canonique ${FIL_GC.nom} (parcours L3)`,
    geoScope: 'multi_pays',
    countryCode: 'FR',
    auditLevel: 'strategique_groupe',
    commercialOffer: 'grand_programme',
    palier: 'grand_compte',
    secteursActifs: ['services', 'transport_logistique'],
  },
  lignesArbre: lignesArbreFilGc(),
  arbre: {
    unites: FIL_GC.unites,
    niveaux: FIL_GC.niveaux,
    parKind: {
      groupe: FIL_GC.arbre.groupes,
      filiale: FIL_GC.arbre.filiales,
      direction: FIL_GC.arbre.directions,
      service: FIL_GC.arbre.services,
    },
    avecFonction: FIL_GC.arbre.services,
    fonctionsPresentes: FONCTIONS_GC,
  },
  banque: {
    transverses: 120,
    cibleesPresentes: 15,
    cibleesAbsentes: 5,
    // Le cas nommé par le §16.3 : le paquet logistique n'existe que si l'arbre
    // porte une unité logistique — ici, 15 services en portent une.
    fonctionPresente: 'logistique_operations',
    // Absente des huit fonctions réparties sur les services.
    fonctionAbsente: 'juridique_conformite',
  },
  // 120 + 15 = 135 : la dimension canonique du L1 (`FIL_GC.questions`).
  questionsAttendues: FIL_GC.questions,
};

// -----------------------------------------------------------------------------
// LA BANQUE — semée par SQL, en attendant l'étape L4 du fil rouge
// -----------------------------------------------------------------------------

export interface BanqueSemee {
  readonly blocId: string;
  readonly blocCode: string;
  /** Toutes les questions semées, ciblées absentes comprises. */
  readonly questionIds: readonly string[];
  /** Les codes des questions qui visent la fonction ABSENTE — à ne jamais figer. */
  readonly codesHorsPerimetre: readonly string[];
}

/**
 * Sème un bloc dédié et la banque d'une fixture. Le bloc est propre à la fixture
 * (`active_blocks` de la mission le nomme) : FIL-TPE et FIL-GC partagent la base
 * sans partager une question — c'est le cloisonnement que le L1 prouvait déjà.
 */
export async function semerBanqueParcours(
  client: Client,
  fixture: FixtureParcoursL3,
): Promise<BanqueSemee> {
  const blocId = uuidv7();
  const blocCode = `filrouge_l3_${fixture.marqueur}_${blocId.slice(-8)}`;
  await client.query(
    `INSERT INTO blocks (id, code, label_fr, position, is_default, description)
     VALUES ($1, $2, $3, 90, false, $4)`,
    [
      blocId,
      blocCode,
      `Bloc de fixture ${fixture.nom} (parcours L3)`,
      'Bloc technique du fil rouge — jamais exposé à une mission réelle.',
    ],
  );

  const ids: string[] = [];
  const codes: string[] = [];
  const textes: string[] = [];
  const cibles: string[] = [];
  const codesHorsPerimetre: string[] = [];

  const { transverses, cibleesPresentes, cibleesAbsentes, fonctionPresente, fonctionAbsente } =
    fixture.banque;
  const total = transverses + cibleesPresentes + cibleesAbsentes;

  for (let i = 0; i < total; i += 1) {
    const code = `filrouge_l3_${fixture.marqueur}_q${String(i + 1).padStart(3, '0')}`;
    ids.push(uuidv7());
    codes.push(code);
    textes.push(`Question ${String(i + 1)} du parcours L3 ${fixture.nom} ?`);
    if (i < transverses) {
      cibles.push('[]');
    } else if (i < transverses + cibleesPresentes) {
      cibles.push(JSON.stringify([fonctionPresente]));
    } else {
      cibles.push(JSON.stringify([fonctionAbsente]));
      codesHorsPerimetre.push(code);
    }
  }

  await client.query(
    `INSERT INTO questions (id, code, block_id, version, status, text_fr, guidance_fr,
                            answer_type, options, allow_range, weight, scoring, criticality,
                            sectors, target_services, levels, headcount_min, headcount_max,
                            profiles, geo, origin, created_at, updated_at)
     SELECT q.id, q.code, $3::uuid, 1, 'active', q.texte, $4::text,
            'scale_1_5', NULL, false, 1, '{"map":"identity"}'::jsonb, 'important',
            '[]'::jsonb, q.cibles::jsonb, '[]'::jsonb, NULL, NULL,
            '[]'::jsonb, 'tous', 'banque', now(), now()
     FROM unnest($1::uuid[], $2::text[], $5::text[], $6::text[]) AS q(id, code, texte, cibles)`,
    [
      ids,
      codes,
      blocId,
      'Ancres de cotation (§32.4) — 1 = aucune pratique · 3 = pratique partielle · 5 = pratique systématique.',
      textes,
      cibles,
    ],
  );

  return { blocId, blocCode, questionIds: ids, codesHorsPerimetre };
}
