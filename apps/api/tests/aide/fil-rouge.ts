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
