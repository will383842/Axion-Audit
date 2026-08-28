// =============================================================================
// LOT L1 — CE QUE LE SCHÉMA DOIT PORTER AU-DELÀ DES CRITÈRES DE LA TABLE 07 §12
//
// Quatre endroits où une transcription du fichier 04 se trompe sans que rien ne
// casse tout de suite :
//   • les FK CIRCULAIRES (interviews → answers, interviews → document_requests),
//     que le fichier 04 impose de créer par ALTER TABLE en FIN de migration ;
//   • les index GIN du §7.1 sur les colonnes JSONB d'étiquetage des questions ;
//   • la séparation `scoping_estimates` / `scoping_financials` (P1-3, E21) ;
//   • l'interdit d'une fonction SQL de génération d'UUID v7 (11 §2).
//
// Aucun de ces défauts ne se voit à l'usage avant le lot qui en dépend ; tous se
// paient cher à ce moment-là. Écrit depuis la SPÉCIFICATION par A16 (09 §5.6).
// =============================================================================
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
} from './aide/base-l1.js';
import {
  COLONNES_FINANCIERES_INTERDITES,
  COLONNES_GIN_QUESTIONS,
  TABLES_UUID_CLIENT,
} from './aide/specification-l1.js';

let nomBase = '';
let client: Client | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('structure');
  nomBase = base.nom;
  client = await connecter(base.url);
  await appliquerMontee(base.url);
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// -----------------------------------------------------------------------------
// FK circulaires — créées par ALTER TABLE en fin de migration
// -----------------------------------------------------------------------------

describe('L1 — FK circulaires du fichier 04 §7', () => {
  it('interviews.linked_review_answer_id référence answers, et interviews.document_request_id référence document_requests', async () => {
    const resultat = await bd().query<{ colonne: string; cible: string }>(
      `SELECT a.attname AS colonne, c.confrelid::regclass::text AS cible
       FROM pg_constraint c
       JOIN LATERAL unnest(c.conkey) AS k(num) ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num
       WHERE c.conrelid = 'interviews'::regclass AND c.contype = 'f'`,
    );
    const liens = new Map(resultat.rows.map((l) => [l.colonne, l.cible]));

    expect(
      liens.get('linked_review_answer_id'),
      `interviews.linked_review_answer_id ne porte aucune clé étrangère vers answers.\n` +
        `Le fichier 04 §7 l'annote « §25.6 : l'entretien complémentaire lève un à-revoir »,\n` +
        `et les conventions en tête du §7 précisent : « FK avant/circulaires\n` +
        `(interviews.linked_review_answer_id → answers, interviews.document_request_id →\n` +
        `document_requests) : créées par ALTER TABLE en FIN de migration — une\n` +
        `transcription table par table dans l'ordre du fichier NE COMPILE PAS sans cela ».\n` +
        `Le piège : la transcription compile quand même si l'on se contente d'OMETTRE la\n` +
        `contrainte. L'entretien complémentaire pointe alors une réponse qui peut avoir\n` +
        `disparu, et la levée d'un à-revoir devient intraçable.\n` +
        `FK trouvées sur interviews : ${JSON.stringify([...liens])}`,
    ).toBe('answers');

    expect(
      liens.get('document_request_id'),
      `interviews.document_request_id ne porte aucune clé étrangère vers document_requests.\n` +
        `04 §7 : « §27.1 analyse_documentaire ». Même piège que ci-dessus : la seconde FK\n` +
        `circulaire est celle qu'on oublie une fois la première rattrapée.\n` +
        `FK trouvées sur interviews : ${JSON.stringify([...liens])}`,
    ).toBe('document_requests');
  });
});

// -----------------------------------------------------------------------------
// Index GIN du §7.1
// -----------------------------------------------------------------------------

describe('L1 — index GIN sur les colonnes JSONB de questions (04 §7.1)', () => {
  it('questions.sectors, questions.profiles et questions.target_services portent chacune un index GIN', async () => {
    const resultat = await bd().query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'questions'`,
    );
    const definitions = resultat.rows.map((l) => l.indexdef);

    // Garde de cardinalité. Ce test tire sa couverture d'une LISTE : vidée, la boucle
    // ne tourne pas, le constat reste vide et le test passe au VERT en n'ayant rien
    // vérifié. Prouvé par injection le 28/08 — liste mise à zéro, fichier « 10 passed ».
    // Vitest attrape le fichier qui n'enregistre AUCUN test ; il ne peut rien contre un
    // test qui s'exécute à vide. La borne est un plancher, pas un gel : les trois colonnes GIN du 04 §7.1 sont le minimum.
    expect(
      COLONNES_GIN_QUESTIONS.length,
      `La liste COLONNES_GIN_QUESTIONS est tombée sous 3 entrées : ce test perdrait de la
` +
        `couverture en silence. Ajouter des cas est souhaitable, en retirer doit être
` +
        `un geste conscient — et alors cette borne se met à jour dans le même commit.`,
    ).toBeGreaterThanOrEqual(3);

    const sansGin = COLONNES_GIN_QUESTIONS.filter(
      (colonne) =>
        !definitions.some((d) => /USING\s+gin/i.test(d) && new RegExp(`\\b${colonne}\\b`).test(d)),
    );

    expect(
      sansGin,
      `Colonnes sans index GIN : ${sansGin.join(', ')}.\n` +
        `04 §7.1 énumère « GIN sur questions.sectors, questions.profiles,\n` +
        `questions.target_services ». Ces trois colonnes JSONB sont les MATRICES\n` +
        `D'ÉTIQUETTES de l'assemblage du questionnaire (§16.3, §20.1) : chaque génération\n` +
        `de questionnaire les interroge par appartenance. Sans index GIN, la requête est\n` +
        `un parcours complet de la banque — invisible sur 200 questions de recette,\n` +
        `insupportable sur la banque réelle.\n` +
        `Index présents sur questions : ${JSON.stringify(definitions)}`,
    ).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Cloison financière P1-3 / E21
// -----------------------------------------------------------------------------

describe('L1 — cloison scoping_estimates / scoping_financials (04 §7, P1-3, E21)', () => {
  it("aucune colonne financière n'a atterri dans scoping_estimates", async () => {
    const resultat = await bd().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'scoping_estimates'`,
    );
    const colonnes = resultat.rows.map((l) => l.column_name.toLowerCase());

    const suspectes = colonnes.filter((colonne) =>
      COLONNES_FINANCIERES_INTERDITES.some((motif) => colonne.includes(motif)),
    );

    expect(
      suspectes,
      `Colonnes financières trouvées dans scoping_estimates : ${suspectes.join(', ')}.\n` +
        `04 §7 porte le commentaire « P1-3 : AUCUNE colonne financière ici — voir\n` +
        `scoping_financials », et scoping_financials est annotée « Accès : routes et\n` +
        `requêtes admin EXCLUSIVEMENT ; aucune jointure côté endpoints consultants (E21) ».\n` +
        `La séparation en DEUX tables EST le mécanisme de la règle : c'est elle qui rend\n` +
        `impossible, par construction, qu'un SELECT de cadrage écrit par un futur lot\n` +
        `remonte un montant à un consultant. Une colonne financière rapatriée dans\n` +
        `scoping_estimates au nom de la commodité annule l'exigence E21 sans qu'aucun\n` +
        `test de RBAC ne s'en aperçoive — le RBAC protège des routes, pas des colonnes.\n` +
        `Colonnes présentes : ${colonnes.join(', ')}`,
    ).toEqual([]);
  });

  it('scoping_financials existe en table SÉPARÉE, clé primaire portée par scoping_estimate_id', async () => {
    const colonnes = await bd().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'scoping_financials'`,
    );
    const noms = colonnes.rows.map((l) => l.column_name);

    expect(
      noms.length,
      `La table scoping_financials est absente. 04 §7 la déclare explicitement :\n` +
        `scoping_financials(scoping_estimate_id PK FK, daily_rates JSONB, travel_costs,\n` +
        `total_amount, currency DEFAULT 'EUR', updated_by FK, updated_at).`,
    ).toBeGreaterThan(0);

    const cle = await bd().query<{ colonne: string }>(
      `SELECT a.attname AS colonne
       FROM pg_constraint c
       JOIN LATERAL unnest(c.conkey) AS k(num) ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num
       WHERE c.conrelid = 'scoping_financials'::regclass AND c.contype = 'p'`,
    );

    expect(
      cle.rows.map((l) => l.colonne),
      `Clé primaire de scoping_financials inattendue.\n` +
        `04 §7 : « scoping_financials(scoping_estimate_id PK FK, …) » — la clé primaire\n` +
        `EST la clé étrangère vers scoping_estimates. Ce n'est pas un détail de modèle :\n` +
        `c'est ce qui garantit UN volet financier par chiffrage, et rend la jointure\n` +
        `financière explicite partout où elle apparaît.`,
    ).toEqual(['scoping_estimate_id']);
  });
});

// -----------------------------------------------------------------------------
// Interdits du contrat 11 §2 — UUID
// -----------------------------------------------------------------------------

describe("L1 — aucune fabrication SQL d'UUID v7 (11 §2)", () => {
  it("aucune fonction SQL de génération d'UUID v7 n'existe en base", async () => {
    const fonctions = await bd().query<{ nom: string }>(
      `SELECT n.nspname || '.' || p.proname AS nom
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND p.proname ~* '(uuid.*v7|v7.*uuid|uuid7)'`,
    );

    expect(
      fonctions.rows.map((l) => l.nom),
      `Fonctions suspectes : ${fonctions.rows.map((l) => l.nom).join(', ')}.\n` +
        `11 §2 : « PostgreSQL 16 n'a PAS de fonction uuidv7() native (n'existe qu'en PG18)\n` +
        `— INTERDICTION d'utiliser une fonction SQL de génération v7. » Les UUID v7 sont\n` +
        `générés CÔTÉ APPLICATIF (lib uuidv7), client ET serveur, parce que la règle P1-4\n` +
        `veut que l'identifiant d'une entité créable hors ligne naisse SUR L'APPAREIL,\n` +
        `avant toute connexion : c'est lui la clé d'idempotence du push.\n` +
        `Une fonction v7 maison en base est une bombe à retardement double : elle fabrique\n` +
        `des identifiants serveur là où le client fait autorité, et elle entrera en\n` +
        `collision de nom avec la uuidv7() native le jour de la montée en PG18.`,
    ).toEqual([]);
  });

  it("aucune colonne du schéma n'a un DEFAULT qui fabrique un UUID v7", async () => {
    const colonnes = await bd().query<{ nom: string; defaut: string }>(
      `SELECT table_name || '.' || column_name AS nom, column_default AS defaut
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_default ~* '(uuid.*v7|v7.*uuid|uuid7)'`,
    );

    expect(
      colonnes.rows.map((l) => `${l.nom} DEFAULT ${l.defaut}`),
      `DEFAULT interdits : ${colonnes.rows.map((l) => l.nom).join(', ')} (11 §2).`,
    ).toEqual([]);
  });

  it("les tables à UUID client (P1-4) n'ont pas de DEFAULT gen_random_uuid() sur leur clé", async () => {
    const colonnes = await bd().query<{ table_name: string; column_name: string; defaut: string }>(
      `SELECT table_name, column_name, column_default AS defaut
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_default ILIKE '%gen_random_uuid%'`,
    );

    // Garde de cardinalité. Ce test tire sa couverture d'une LISTE : vidée, la boucle
    // ne tourne pas, le constat reste vide et le test passe au VERT en n'ayant rien
    // vérifié. Prouvé par injection le 28/08 — liste mise à zéro, fichier « 10 passed ».
    // Vitest attrape le fichier qui n'enregistre AUCUN test ; il ne peut rien contre un
    // test qui s'exécute à vide. La borne est un plancher, pas un gel : les six tables à UUID client (P1-4) sont le minimum.
    expect(
      TABLES_UUID_CLIENT.length,
      `La liste TABLES_UUID_CLIENT est tombée sous 6 entrées : ce test perdrait de la
` +
        `couverture en silence. Ajouter des cas est souhaitable, en retirer doit être
` +
        `un geste conscient — et alors cette borne se met à jour dans le même commit.`,
    ).toBeGreaterThanOrEqual(6);

    const fautives = colonnes.rows
      .filter((l) => TABLES_UUID_CLIENT.includes(l.table_name))
      .map((l) => `${l.table_name}.${l.column_name} DEFAULT ${l.defaut}`);

    expect(
      fautives,
      `DEFAULT gen_random_uuid() posé sur des tables à identifiant CLIENT :\n  ${fautives.join('\n  ')}\n\n` +
        `11 §2 : « DEFAULT gen_random_uuid() (v4) toléré UNIQUEMENT pour les tables\n` +
        `purement serveur (logs, events) ». Or 04 §7 (règle P1-4) énonce que\n` +
        `${TABLES_UUID_CLIENT.join(', ')} portent un UUID v7 GÉNÉRÉ CÔTÉ CLIENT, « le\n` +
        `serveur upsert par cet id, idempotent ».\n` +
        `Le danger n'est pas théorique : un DEFAULT sur ces clés ne se déclenche que si\n` +
        `l'INSERT omet l'id. Le jour où un chemin de code l'omet — une reprise, un import,\n` +
        `un job — la ligne reçoit un identifiant SERVEUR ; le rejeu du même lot d'ops\n` +
        `depuis le terrain en crée alors une SECONDE. L'idempotence du push tombe en\n` +
        `silence, et le doublon se découvre dans le rapport.\n` +
        `Colonnes v4 trouvées (toutes tables) : ${colonnes.rows.map((l) => `${l.table_name}.${l.column_name}`).join(', ')}`,
    ).toEqual([]);
  });
});
