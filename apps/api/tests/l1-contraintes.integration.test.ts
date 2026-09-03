// =============================================================================
// LOT L1 — CRITÈRE D'ACCEPTATION 3 : « CONTRAINTES UNIQUE ACTIVES » (07 §12)
//
// Une contrainte ne se prouve pas en lisant le DDL : elle se prouve par une
// insertion que la base REFUSE. Et un index PARTIEL ne se distingue d'un index
// ordinaire que par le cas NULL — c'est ce cas-là qu'une transcription naïve
// rate, et c'est donc celui qui compte le plus ici :
//   • deux `companies` à `siren` NULL doivent être ACCEPTÉES (filiales
//     étrangères, V2.2) ;
//   • deux `questions` ad hoc à `code` NULL doivent être ACCEPTÉES (V2.9) ;
//   • deux `companies` à `external_ref` NULL doivent être ACCEPTÉES — « NULL si
//     local » (amendement du 04 §7.1 du 2026-09-03, E18).
//
// S'y ajoutent les CHECK d'énumération les plus porteuses de sens métier et la
// cohérence composite de `step_validations`.
//
// Écrit depuis la SPÉCIFICATION par A16 (09 §5.6). Base éphémère supprimée en fin.
// =============================================================================
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  attendreAcceptation,
  attendreRefus,
  connecter,
  creerBaseEphemere,
  creerJeuDEssai,
  lancerMigrations,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  tenterMigrations,
  uuidv7,
  versionAvantLaMigrationQui,
  type JeuDEssai,
} from './aide/base-l1.js';
import { ENUMERATIONS_TESTEES } from './aide/specification-l1.js';

let nomBase = '';
let client: Client | undefined;
let jeu: JeuDEssai;

/** Accès non optionnel à la connexion, pour rester compatible `strict`. */
function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('contraintes');
  nomBase = base.nom;
  client = await connecter(base.url);
  await appliquerMontee(base.url);
  jeu = await creerJeuDEssai(client, 'contraintes');
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// -----------------------------------------------------------------------------
// answers(interview_id, mission_question_id) — UNE réponse par question et session
// -----------------------------------------------------------------------------

describe('L1 — unicité answers(interview_id, mission_question_id) (04 §7 V2.2 §32.6)', () => {
  const inserer = `INSERT INTO answers (id, interview_id, mission_question_id, value, source,
                                        client_created_at, client_updated_at, created_at, updated_at)
                   VALUES ($1, $2, $3, $4::jsonb, 'entretien', now(), now(), now(), now())`;

  it('une seconde réponse à la MÊME question dans la MÊME session est refusée', async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), jeu.entretienId, jeu.missionQuestionId, '{"type":"yes_no","v":"oui"}'],
      'Première réponse à une question dans une session : elle doit être acceptée.',
    );

    const erreur = await attendreRefus(
      bd(),
      inserer,
      [uuidv7(), jeu.entretienId, jeu.missionQuestionId, '{"type":"yes_no","v":"non"}'],
      `Règle : 04 §7 — « UNIQUE(interview_id, mission_question_id) — UNE réponse par\n` +
        `question et par session ; toute re-réponse est une RÉVISION (answer_revisions) ».\n` +
        `Sans cette contrainte, une seconde réponse crée une ligne concurrente au lieu\n` +
        `d'une révision tracée : l'invariant 7 (« rien n'est jamais silencieusement\n` +
        `écrasé ») tombe, et l'idempotence du push (07 §13) n'a plus de filet.`,
    );

    expect(
      erreur.code,
      `Refus obtenu, mais pas pour la bonne raison : ${erreur.code} — ${erreur.message}.\n` +
        `Attendu : violation d'unicité (23505).`,
    ).toBe('23505');
  });

  it('la MÊME question posée dans une AUTRE session reste acceptée', async () => {
    const autreEntretien = uuidv7();
    await bd().query(
      `INSERT INTO interviews (id, mission_id, conducted_by, kind, org_unit_id, status,
                               schedule_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'entretien', $4, 'non_demarre', 'a_planifier', now(), now())`,
      [autreEntretien, jeu.missionId, jeu.utilisateurId, jeu.uniteId],
    );

    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), autreEntretien, jeu.missionQuestionId, '{"type":"yes_no","v":"oui"}'],
      `Règle : l'unicité porte sur le COUPLE (interview_id, mission_question_id).\n` +
        `Une même question posée à deux interlocuteurs différents est le fonctionnement\n` +
        `NORMAL de l'audit (c'est même la matière du calcul de divergence\n` +
        `direction/terrain §32.1). Un index posé sur mission_question_id seul rendrait\n` +
        `l'outil inutilisable dès la deuxième session.`,
    );
  });
});

// -----------------------------------------------------------------------------
// companies(siren) — index UNIQUE PARTIEL WHERE siren IS NOT NULL
// -----------------------------------------------------------------------------

describe('L1 — unicité partielle companies(siren) WHERE siren IS NOT NULL (04 §7.1)', () => {
  const inserer = `INSERT INTO companies (id, name, siren, created_at, updated_at)
                   VALUES ($1, $2, $3, now(), now())`;

  it('deux entreprises au MÊME siren sont refusées', async () => {
    const siren = '000000001';
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive Alpha', siren],
      'Première entreprise portant ce SIREN : acceptée.',
    );

    const erreur = await attendreRefus(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive Alpha (doublon)', siren],
      `Règle : 04 §7.1 — index UNIQUE partiel companies(siren) WHERE siren IS NOT NULL.\n` +
        `Le SIREN est « la clé de dédup R3, alerte doublon » (04 §7) : sans unicité, deux\n` +
        `fiches de la même entreprise coexistent et les missions se répartissent entre\n` +
        `elles sans que rien ne le signale.`,
    );

    expect(
      erreur.code,
      `Refus obtenu, mais pas pour la bonne raison : ${erreur.code} — ${erreur.message}.`,
    ).toBe('23505');
  });

  it("deux entreprises à siren NULL sont ACCEPTÉES — c'est ce qui distingue l'index PARTIEL", async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Filiale étrangère fictive 1', null],
      `Règle : 04 §7 — « siren TEXT NULL, V2.2 : NULL autorisé (filiales étrangères) ;\n` +
        `index UNIQUE PARTIEL WHERE siren IS NOT NULL ».`,
    );

    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Filiale étrangère fictive 2', null],
      `Règle : 04 §7.1 — l'index est PARTIEL (WHERE siren IS NOT NULL).\n` +
        `Postgres ne considère jamais deux NULL comme égaux dans un UNIQUE ordinaire,\n` +
        `mais un « UNIQUE NULLS NOT DISTINCT » (PG15+) ou une contrainte de table\n` +
        `transcrite sans sa clause WHERE refuserait ce cas. Une mission multi-pays\n` +
        `(04 §7 missions.geo_scope) compte plusieurs filiales étrangères sans SIREN :\n` +
        `les refuser rend le périmètre groupe insaisissable. C'est le cas qu'une\n` +
        `transcription naïve rate.`,
    );
  });
});

// -----------------------------------------------------------------------------
// companies(external_ref) — index UNIQUE PARTIEL WHERE external_ref IS NOT NULL
// -----------------------------------------------------------------------------
// Traçabilité : E18 — « Liaison automatique clients axion-ia.com : console
// maîtresse, devis signé → mission » (08_TRACABILITE.md, ligne E18 → M8, §20.6).
// Règle éprouvée : 04 §7.1, AMENDEMENT DU 2026-09-03 — « index UNIQUE partiel
// `companies(external_ref) WHERE external_ref IS NOT NULL` — symétrique exact de
// l'unicité partielle qui existe déjà sur `siren` ». Arbitrage : DECISIONS.md du
// 2026-09-03, « `companies.external_ref` reçoit son unicité », option 1, décideur
// Williams. Le critère 3 du lot L1 (07 §12 : « contraintes UNIQUE (answers, siren
// partiel, questions code+version) actives ») est ANTÉRIEUR à cet amendement et ne
// cite donc pas cet index : il s'étend ici, il ne se recopie pas.
//
// POURQUOI DEUX MOITIÉS, ET POURQUOI C'EST LA SECONDE QUI EST FRAGILE.
// La première — un doublon est refusé — est la raison d'être de l'index : 03 M8.1
// fait d'`external_ref` la clé du référentiel client partagé (« id_console conservé
// en clé étrangère `external_ref` »), et le webhook `client.updated` du 05 §8.6
// n'aurait aucune cible déterminée si deux fiches la portaient.
// La seconde — des `external_ref` NULL répétés restent acceptés — est celle qu'une
// transcription rate : le 04 marque la colonne « NULL si local », et une entreprise
// créée localement n'a AUCUN pendant dans la console. Un index non partiel
// interdirait la deuxième création locale.
//
// CE QUE LE CAS NULL NE PEUT PAS PROUVER À LUI SEUL, dit ici pour qu'on ne s'y fie
// pas plus qu'il ne le mérite : sur PostgreSQL 16, un UNIQUE ORDINAIRE accepte lui
// aussi plusieurs NULL (ils y sont distincts par défaut). Le cas NULL attrape donc
// un `NULLS NOT DISTINCT` ou un `NOT NULL` mal transcrits, mais PAS la perte de la
// clause `WHERE` — il resterait vert sur un index devenu total. La moitié
// STRUCTURELLE est donc éprouvée à part, dans le troisième test.
describe('L1 — unicité partielle companies(external_ref) WHERE external_ref IS NOT NULL (04 §7.1, amendement du 2026-09-03)', () => {
  const inserer = `INSERT INTO companies (id, name, external_ref, created_at, updated_at)
                   VALUES ($1, $2, $3, now(), now())`;

  it('deux entreprises à la MÊME external_ref sont refusées', async () => {
    const reference = 'console-essai-unicite-0001';
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive Sigma', reference],
      'Première fiche portant cette référence console : acceptée.',
    );

    const erreur = await attendreRefus(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive Sigma (doublon)', reference],
      `Règle : 04 §7.1 (amendement du 2026-09-03) — index UNIQUE partiel\n` +
        `companies(external_ref) WHERE external_ref IS NOT NULL.\n` +
        `external_ref est « l'id client console axion-ia.com » (04 §7) et la clé du\n` +
        `référentiel client partagé (03 M8.1). Deux fiches d'audit pour une même\n` +
        `entreprise de la console : ni la liaison M8.1 ni le webhook « client.updated »\n` +
        `(05 §8.6) n'ont plus de cible déterminée. Le défaut ne se manifesterait qu'au\n` +
        `lot L13, très loin de sa cause.`,
    );

    expect(
      erreur.code,
      `Refus obtenu, mais pas pour la bonne raison : ${erreur.code} — ${erreur.message}.\n` +
        `Attendu : violation d'unicité (23505).`,
    ).toBe('23505');
  });

  it("deux entreprises à external_ref NULL sont ACCEPTÉES — la moitié qu'on oublie", async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive locale 1', null],
      `Règle : 04 §7 — « external_ref : id client console axion-ia.com (NULL si local) ».`,
    );

    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'Entreprise fictive locale 2', null],
      `Règle : 04 §7.1 — l'index est PARTIEL (WHERE external_ref IS NOT NULL).\n` +
        `03 M8.1 prévoit explicitement la « création locale seulement si le client\n` +
        `n'existe pas encore côté console » : ces fiches-là n'ont pas de référence, et\n` +
        `elles sont la NORME tant que la liaison console (L13, Phase 2) n'existe pas —\n` +
        `toute entreprise créée aujourd'hui porte external_ref NULL. Un\n` +
        `UNIQUE … NULLS NOT DISTINCT (PG15+) ou une colonne passée NOT NULL\n` +
        `n'accepterait qu'UNE SEULE entreprise dans tout l'outil.`,
    );
  });

  it("l'index est PARTIEL dans le catalogue — ce que le cas NULL ne peut pas montrer", async () => {
    const trouves = await bd().query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'companies'
          AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(external_ref)%'`,
    );

    expect(
      trouves.rows.length,
      `Attendu EXACTEMENT un index unique sur companies(external_ref) (04 §7.1,\n` +
        `amendement du 2026-09-03). Trouvé ${String(trouves.rows.length)} :\n  ` +
        trouves.rows.map((l) => l.indexdef).join('\n  '),
    ).toBe(1);

    const definition = trouves.rows[0]?.indexdef ?? '';

    expect(
      definition,
      `L'index existe mais n'est PAS partiel : « ${definition} ».\n` +
        `04 §7.1 exige « WHERE external_ref IS NOT NULL ». Sans cette clause l'index est\n` +
        `total — et sur PostgreSQL 16 les deux tests de comportement ci-dessus\n` +
        `resteraient VERTS, puisqu'un UNIQUE ordinaire tient déjà deux NULL pour\n` +
        `distincts. La régression vers l'unicité totale ne se voit donc QUE d'ici.`,
    ).toMatch(/WHERE \(external_ref IS NOT NULL\)/i);

    expect(
      definition,
      `L'index porte NULLS NOT DISTINCT : « ${definition} ».\n` +
        `Les fiches sans référence console (04 §7, « NULL si local ») seraient alors\n` +
        `limitées à UNE SEULE dans toute la base.`,
    ).not.toMatch(/NULLS NOT DISTINCT/i);
  });

  it("la montée REFUSE de poser l'unicité sur une base qui porte DÉJÀ des doublons", async () => {
    // POURQUOI CE TEST EXISTE, alors qu'il éprouve un cas qui n'arrive jamais dans
    // cette suite. Le garde `DO $$` de la migration ne peut s'exécuter utilement que
    // sur une base contenant déjà deux fiches à la même référence console — une
    // situation que ni un clone neuf, ni la CI, ni aucun autre test ne produit. Sa
    // PREMIÈRE exécution réelle serait donc celle du déploiement, sur la base qui a
    // le défaut, au pire moment pour découvrir qu'il ne mord pas. C'est la seule
    // logique APPLICATIVE de cette migration ; tout le reste est du DDL, déjà tenu
    // par le comparateur schéma-vs-04.
    //
    // Ce qui est vérifié n'est pas la prose du message, mais quatre faits : la montée
    // ÉCHOUE ; elle échoue en NOMMANT la colonne ; le refus ne vient PAS de l'erreur
    // brute de PostgreSQL (preuve que le garde a mordu AVANT le CREATE INDEX) ; elle
    // ne laisse RIEN derrière elle, ni index ni ligne de journal. Ce dernier point est
    // celui qui rend le déploiement rattrapable (02 §30.6, dry-run puis apply).
    //
    // La base est ramenée JUSTE AVANT la migration visée, désignée par ce qu'elle fait
    // et non par son numéro. Base éphémère dédiée, supprimée en `finally` — celle du
    // fichier ne bouge pas.
    const cible = versionAvantLaMigrationQui(/ON companies \(external_ref\)/i);
    const base = await creerBaseEphemere('gardeexternalref');
    try {
      await appliquerMontee(base.url);
      await lancerMigrations(base.url, ['--down-to', cible]);

      const bac = await connecter(base.url);
      try {
        const avant = await bac.query(
          `SELECT indexname FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'companies'
              AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(external_ref)%'`,
        );
        expect(
          avant.rows.length,
          `La descente n'a pas retiré l'index : le doublon ne pourra pas être créé, et ce\n` +
            `test ne prouverait plus rien. 07 §12 ligne L1 : « migrations up/down propres ».`,
        ).toBe(0);

        const reference = 'console-essai-doublon-preexistant';
        await bac.query(inserer, [uuidv7(), 'Entreprise fictive Tau', reference]);
        await bac.query(inserer, [uuidv7(), 'Entreprise fictive Tau (doublon)', reference]);

        const tentative = await tenterMigrations(base.url);

        expect(
          tentative.code,
          `La montée a RÉUSSI sur une base portant deux fiches à la même référence\n` +
            `console : l'unicité n'est donc pas réellement posée.\n\nSortie :\n${tentative.sortie}`,
        ).not.toBe(0);

        expect(
          tentative.sortie,
          `La montée a échoué sans jamais nommer external_ref. Un refus qui ne dit pas CE\n` +
            `QUI bloque envoie chercher au mauvais endroit, en fenêtre de déploiement.\n\n` +
            `Sortie :\n${tentative.sortie}`,
        ).toMatch(/external_ref/);

        expect(
          tentative.sortie,
          `Le refus vient de PostgreSQL lui-même (« could not create unique index »), pas\n` +
            `du garde de la migration : celui-ci n'a donc pas mordu AVANT la création de\n` +
            `l'index. Le résultat final est le même, l'explication non — et c'est\n` +
            `l'explication qui décide du temps qu'il faudra pour réconcilier les deux\n` +
            `fiches, un geste MÉTIER (invariant 7 : révision tracée, rien d'écrasé).\n\n` +
            `Sortie :\n${tentative.sortie}`,
        ).not.toMatch(/could not create unique index/i);

        const apres = await bac.query(
          `SELECT indexname FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'companies'
              AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(external_ref)%'`,
        );
        expect(
          apres.rows.length,
          `La migration a échoué MAIS a laissé son index : le schéma est à moitié posé.\n` +
            `Chaque migration s'exécute dans SA transaction (02 §30.6) — un échec doit\n` +
            `laisser la base exactement où elle était.`,
        ).toBe(0);

        const journal = await bac.query<{ version: string }>(
          `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`,
        );
        expect(
          journal.rows[0]?.version,
          `Le journal des migrations est passé au-delà de « ${cible} » alors que la montée\n` +
            `a échoué : une base annoncée à jour sans l'être est pire qu'une base en\n` +
            `retard, parce que plus rien ne rejouera la migration manquante.`,
        ).toBe(cible);
      } finally {
        await bac.end();
      }
    } finally {
      await supprimerBaseEphemere(base.nom);
    }
  }, 180_000);
});

// -----------------------------------------------------------------------------
// questions(code, version) — index UNIQUE PARTIEL WHERE code IS NOT NULL
// -----------------------------------------------------------------------------

describe('L1 — unicité partielle questions(code, version) WHERE code IS NOT NULL (04 §7.1, V2.9)', () => {
  const inserer = `INSERT INTO questions (id, code, block_id, version, status, text_fr,
                                          answer_type, origin, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'active', $5, 'yes_no', $6, now(), now())`;

  it('deux questions de banque au même couple (code, version) sont refusées', async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'q_essai_unicite', jeu.blocId, 1, 'Question de banque, version 1 ?', 'banque'],
      'Première question de banque portant ce code en version 1 : acceptée.',
    );

    const erreur = await attendreRefus(
      bd(),
      inserer,
      [uuidv7(), 'q_essai_unicite', jeu.blocId, 1, 'Doublon de code et version', 'banque'],
      `Règle : 04 §7.1 — index UNIQUE partiel questions(code, version) WHERE code IS NOT NULL.\n` +
        `Le code est « l'identifiant STABLE de banque, clé de l'import/ré-import §36.4 » :\n` +
        `deux lignes au même (code, version) rendent le ré-import non déterministe et les\n` +
        `mission_questions figées ambiguës.`,
    );

    expect(
      erreur.code,
      `Refus obtenu, mais pas pour la bonne raison : ${erreur.code} — ${erreur.message}.`,
    ).toBe('23505');
  });

  it('le même code en version SUIVANTE est accepté — une nouvelle version est une NOUVELLE LIGNE', async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), 'q_essai_unicite', jeu.blocId, 2, 'Question de banque, version 2 ?', 'banque'],
      `Règle : 04 §7 — « une NOUVELLE VERSION = une NOUVELLE LIGNE (même code,\n` +
        `version+1, l'ancienne passe 'archived') — JAMAIS de mutation en place ».\n` +
        `L'unicité porte sur le COUPLE : la poser sur le code seul interdirait le\n` +
        `versionnage, donc l'immuabilité des snapshots de mission.`,
    );
  });

  it('deux questions ad hoc à code NULL sont ACCEPTÉES — le cas que rate une transcription naïve', async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), null, jeu.blocId, 1, 'Question ad hoc terrain 1 ?', 'ad_hoc'],
      `Règle : 04 §7 — « code NULL pour les ad hoc non versées ».`,
    );

    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), null, jeu.blocId, 1, 'Question ad hoc terrain 2 ?', 'ad_hoc'],
      `Règle : 04 §7.1 — l'index est PARTIEL (WHERE code IS NOT NULL).\n` +
        `Les questions ad hoc naissent sur le terrain, hors ligne, sans code de banque\n` +
        `(§36.4, op 'question_adhoc' du contrat 11 §4). Un index NON partiel — ou un\n` +
        `UNIQUE NULLS NOT DISTINCT — n'accepterait qu'UNE SEULE question ad hoc par\n` +
        `version dans TOUT l'outil : la seconde serait rejetée à la synchronisation,\n` +
        `hors ligne, sans recours pour l'auditeur.`,
    );
  });
});

// -----------------------------------------------------------------------------
// CHECK d'énumération — une valeur hors énumération doit être REFUSÉE
// -----------------------------------------------------------------------------

describe("L1 — les CHECK d'énumération du fichier 04 sont ACTIVES", () => {
  it('une valeur hors énumération est refusée sur chaque colonne éprouvée', async () => {
    // Garde de cardinalité. Ce test tire sa couverture d'une LISTE : vidée, la boucle
    // ne tourne pas, le constat reste vide et le test passe au VERT en n'ayant rien
    // vérifié. Prouvé par injection le 28/08 — liste mise à zéro, fichier « 10 passed ».
    // Vitest attrape le fichier qui n'enregistre AUCUN test ; il ne peut rien contre un
    // test qui s'exécute à vide. La borne est un plancher, pas un gel : la couverture peut croître, jamais se réduire sans le dire.
    expect(
      ENUMERATIONS_TESTEES.length,
      `La liste ENUMERATIONS_TESTEES est tombée sous 6 entrées : ce test perdrait de la
` +
        `couverture en silence. Ajouter des cas est souhaitable, en retirer doit être
` +
        `un geste conscient — et alors cette borne se met à jour dans le même commit.`,
    ).toBeGreaterThanOrEqual(6);

    const refusManquants: string[] = [];

    for (const enumeration of ENUMERATIONS_TESTEES) {
      const { table, colonne, invalide } = enumeration;
      let refusee = false;
      let codeErreur = '';

      try {
        await bd().query('BEGIN');
        await bd().query(requeteEnumeration(table, colonne, invalide, jeu));
        await bd().query('ROLLBACK');
      } catch (erreur) {
        await bd().query('ROLLBACK');
        const details = erreur as { code?: unknown };
        codeErreur = typeof details.code === 'string' ? details.code : '';
        // 23514 = violation de CHECK. Tout autre code signale un refus pour une
        // AUTRE raison (colonne absente, FK, NOT NULL) : ce n'est pas la preuve.
        refusee = codeErreur === '23514';
      }

      if (!refusee) {
        refusManquants.push(
          `${table}.${colonne} = '${invalide}' → ${
            codeErreur === '' ? 'ACCEPTÉ' : `refusé avec ${codeErreur} (attendu 23514)`
          } · ${enumeration.section}`,
        );
      }
    }

    expect(
      refusManquants,
      `CHECK d'énumération absentes ou inopérantes :\n  ${refusManquants.join('\n  ')}\n\n` +
        `Règle : le fichier 04 §7 écrit « CHECK IN (…) » sur ces colonnes, et les\n` +
        `conventions en tête du §7 précisent « contraintes CHECK sur les enums ».\n` +
        `Ces énumérations sont la dernière barrière : la validation Zod protège l'API,\n` +
        `pas les jobs worker, les migrations de données ni la reprise manuelle. Une\n` +
        `valeur de statut inventée casse silencieusement la machine à états (§32.2) et\n` +
        `tous les filtres de la console.`,
    ).toEqual([]);
  });
});

/** Construit l'INSERT minimal qui exerce une énumération donnée. */
function requeteEnumeration(
  table: string,
  colonne: string,
  valeur: string,
  essai: JeuDEssai,
): string {
  const echappe = (v: string): string => `'${v.replace(/'/g, "''")}'`;
  const id = echappe(uuidv7());

  switch (`${table}.${colonne}`) {
    case 'missions.status':
      return `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                                    created_by, created_at, updated_at)
              VALUES (${id}, ${echappe(essai.entrepriseId)}, 'Mission hors énumération',
                      'france', 'diagnostic_cadrage', ${echappe(valeur)},
                      ${echappe(essai.utilisateurId)}, now(), now())`;
    case 'interviews.kind':
      return `INSERT INTO interviews (id, mission_id, conducted_by, kind, org_unit_id, status,
                                      schedule_status, created_at, updated_at)
              VALUES (${id}, ${echappe(essai.missionId)}, ${echappe(essai.utilisateurId)},
                      ${echappe(valeur)}, ${echappe(essai.uniteId)}, 'non_demarre',
                      'a_planifier', now(), now())`;
    case 'interviews.schedule_status':
      return `INSERT INTO interviews (id, mission_id, conducted_by, kind, org_unit_id, status,
                                      schedule_status, created_at, updated_at)
              VALUES (${id}, ${echappe(essai.missionId)}, ${echappe(essai.utilisateurId)},
                      'entretien', ${echappe(essai.uniteId)}, 'non_demarre',
                      ${echappe(valeur)}, now(), now())`;
    case 'answers.source':
      return `INSERT INTO answers (id, interview_id, mission_question_id, value, source,
                                   client_created_at, client_updated_at, created_at, updated_at)
              VALUES (${id}, ${echappe(essai.entretienId)}, ${echappe(essai.missionQuestionId)},
                      '{"type":"yes_no","v":"oui"}'::jsonb, ${echappe(valeur)},
                      now(), now(), now(), now())`;
    case 'findings.severity':
      // `sources` est RENSEIGNÉE avec une source réelle, jamais laissée vide :
      // 04 §7 écrit « sources JSONB — {answer_ids[], session_ids[],
      // attachment_ids[]} : ≥ 1 SOURCE OBLIGATOIRE ». Un constat sans source est
      // une affirmation sans preuve — exactement ce qu'un rapport d'audit ne peut
      // pas se permettre. La colonne étant NOT NULL et sans DEFAULT, l'omettre
      // ferait lever un 23502 (not-null) AVANT le 23514 (check) que ce test
      // éprouve : l'insertion serait refusée pour la mauvaise raison, et le test
      // passerait au vert sans rien prouver sur l'énumération `severity`.
      return `INSERT INTO findings (id, mission_id, severity, title, statement, sources,
                                    created_by, created_at, updated_at)
              VALUES (${id}, ${echappe(essai.missionId)}, ${echappe(valeur)},
                      'Constat hors énumération', 'Énoncé de test',
                      ${echappe(
                        JSON.stringify({
                          answer_ids: [],
                          session_ids: [essai.entretienId],
                          attachment_ids: [],
                        }),
                      )}::jsonb,
                      ${echappe(essai.utilisateurId)}, now(), now())`;
    case 'users.role':
      return `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                                 is_active, created_at, updated_at)
              VALUES (${id}, 'Compte hors énumération', ${echappe(`${uuidv7()}@exemple.test`)},
                      'argon2-factice', ${echappe(valeur)}, 'guide_strict', true, now(), now())`;
    default:
      throw new Error(`Énumération non outillée : ${table}.${colonne}`);
  }
}

// -----------------------------------------------------------------------------
// step_validations — cohérence COMPOSITE step_code ↔ scope
// -----------------------------------------------------------------------------

describe('L1 — cohérence step_validations (04 §7 : step_code ↔ scope)', () => {
  const inserer = `INSERT INTO step_validations (id, mission_id, step_code, scope, scope_id,
                                                 validated_by, validated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, now())`;

  it('les combinaisons cohérentes sont acceptées', async () => {
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), jeu.missionId, 'entretien', 'interview', jeu.entretienId, jeu.utilisateurId],
      "Règle : 04 §7 — step_code 'entretien' impose scope 'interview'.",
    );
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), jeu.missionId, 'unite', 'org_unit', jeu.uniteId, jeu.utilisateurId],
      "Règle : 04 §7 — step_code 'unite' impose scope 'org_unit'.",
    );
    await attendreAcceptation(
      bd(),
      inserer,
      [uuidv7(), jeu.missionId, 'cadrage', 'mission', jeu.missionId, jeu.utilisateurId],
      "Règle : 04 §7 — les autres step_code imposent scope 'mission'.",
    );
  });

  it('une combinaison INCOHÉRENTE step_code/scope est refusée par une CHECK composite', async () => {
    const combinaisonsInterdites: readonly [string, string][] = [
      ['entretien', 'mission'],
      ['unite', 'mission'],
      ['cadrage', 'interview'],
      ['rapport', 'org_unit'],
    ];

    const acceptees: string[] = [];
    for (const [code, portee] of combinaisonsInterdites) {
      try {
        await bd().query('BEGIN');
        await bd().query(inserer, [
          uuidv7(),
          jeu.missionId,
          code,
          portee,
          jeu.missionId,
          jeu.utilisateurId,
        ]);
        acceptees.push(`step_code='${code}' + scope='${portee}'`);
        await bd().query('ROLLBACK');
      } catch {
        await bd().query('ROLLBACK');
      }
    }

    expect(
      acceptees,
      `Combinaisons incohérentes ACCEPTÉES : ${acceptees.join(' · ')}.\n\n` +
        `Règle : 04 §7 — « Cohérence : step_code ∈ {entretien} → scope = interview ·\n` +
        `{unite} → scope = org_unit · autres → scope = mission ». Cette ligne du pack\n` +
        `n'est pas un commentaire d'intention : c'est une CHECK COMPOSITE à écrire.\n` +
        `Sans elle, une validation d'étape pointe un scope_id qui n'existe pas dans la\n` +
        `table visée — et l'écart ne se découvre qu'à la lecture du rapport, quand plus\n` +
        `personne ne peut dire quelle étape a réellement été validée.`,
    ).toEqual([]);
  });
});
