// =============================================================================
// MÉTA-TEST — LE COMPARATEUR SCHÉMA-VS-04 DÉTECTE-T-IL VRAIMENT ?
//
// Ce fichier ne teste PAS le schéma : il teste LE CONTRÔLE QUI TESTE LE SCHÉMA.
// C'est toute sa valeur, et c'est pourquoi il porte `@critique` — le pack nomme
// la famille « diff schéma-vs-04 » parmi les trois qui la méritent (09 §2,
// repris au 11 §7), aux côtés des 8 scénarios offline et du RBAC/propriété.
//
// POURQUOI IL EXISTE (revue croisée A17). En injectant 25 mutations dans le
// schéma, A17 en a vu passer 8 sous le radar de `schema:diff`. La pire :
// `users_role_check` retournée de `= ANY (...)` en `<> ALL (...)` — le
// comparateur annonçait ZÉRO ÉCART pendant qu'en base `role='admin'` était
// REFUSÉ et `role='pirate'` ACCEPTÉ. Le critère d'acceptation le plus dur du lot
// (« diff schéma-vs-04 = zéro écart ») était donc satisfait par un comparateur
// aveugle. A12 a corrigé ; ce travail d'A17, lui, vivait à la main dans une
// session qui a disparu. Ce fichier le rend permanent.
//
// PROTOCOLE, pour chaque classe de mutation :
//   base jetable → migrations → diff (doit être VERT) → injecter la mutation →
//   diff (doit être ROUGE, code de sortie non nul) → réparer → diff (VERT).
// La réparation passe par `finally` : une mutation ne fuit jamais sur la
// suivante, même si l'assertion échoue.
//
// Les objets mutés sont retrouvés PAR LEUR FORME dans le catalogue, jamais par
// un nom codé en dur : le pack ne normalise pas les noms de contraintes, et un
// test qui les figerait casserait au premier renommage sans rien prouver.
// =============================================================================
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  expressionCheck,
  lancerSchemaDiff,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  remplacerContrainte,
  supprimerBaseEphemere,
  trouverContrainte,
} from './aide/base-l1.js';

let nomBase = '';
let urlBase = '';
let client: Client | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  const base = await creerBaseEphemere('schemadiff');
  nomBase = base.nom;
  urlBase = base.url;
  client = await connecter(base.url);
  await appliquerMontee(base.url);
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

/**
 * Joue une classe de mutation de bout en bout. `injecter` altère le schéma,
 * `reparer` le remet à l'identique ; le diff doit virer au rouge entre les deux
 * et redevenir vert après.
 */
async function prouverDetection(
  intitule: string,
  consequence: string,
  injecter: () => Promise<void>,
  reparer: () => Promise<void>,
): Promise<void> {
  await injecter();
  try {
    const apresMutation = await lancerSchemaDiff(urlBase);
    expect(
      apresMutation.code,
      `MUTATION NON DÉTECTÉE — ${intitule}\n\n` +
        `Le schéma a été altéré et \`schema:diff\` a pourtant rendu 0 (« zéro écart »).\n` +
        `Conséquence en base : ${consequence}\n\n` +
        `Le critère d'acceptation du lot L1 est « diff automatisé schéma réel vs fichier\n` +
        `04 = ZÉRO ÉCART » (07 §12). Un comparateur qui ne voit pas cette mutation rend\n` +
        `le critère décoratif : il certifierait un schéma faux. C'est exactement le\n` +
        `défaut relevé par A17 en revue croisée — 8 mutations sur 25 passaient.\n\n` +
        `Base de comparaison (11 §7) : tables, colonnes, contraintes PK/FK/UNIQUE/CHECK\n` +
        `et index du §7.1, comparés au manifeste apps/api/schema-manifest.json extrait\n` +
        `du fichier 04.\n\nSortie du comparateur :\n${apresMutation.sortie}`,
    ).not.toBe(0);
  } finally {
    await reparer();
  }

  const apresReparation = await lancerSchemaDiff(urlBase);
  expect(
    apresReparation.code,
    `Après réparation de « ${intitule} », le comparateur reste ROUGE.\n` +
      `Soit la réparation du test est incomplète — et les mutations suivantes seront\n` +
      `jugées sur un schéma déjà sale — soit le comparateur signale un écart PRÉEXISTANT.\n` +
      `Dans les deux cas il faut le savoir avant d'aller plus loin.\n\n${apresReparation.sortie}`,
  ).toBe(0);
}

describe('@critique méta-test du comparateur schéma-vs-04 (07 §12, 11 §7)', () => {
  it('le schéma issu des migrations est déclaré CONFORME — sans quoi tout le reste est vide de sens', async () => {
    const resultat = await lancerSchemaDiff(urlBase);
    expect(
      resultat.code,
      `Le comparateur signale un écart sur le schéma NON MUTÉ.\n` +
        `Ce test est la ligne de base : si le schéma de référence est déjà rouge, aucune\n` +
        `des détections ci-dessous ne prouve quoi que ce soit — elles seraient rouges\n` +
        `pour la mauvaise raison.\n\n${resultat.sortie}`,
    ).toBe(0);
  }, 120_000);

  // --- Classe 1 : opérateur de CHECK inversé (le cas qui a motivé la revue) ---
  it("détecte une CHECK dont l'opérateur est inversé (= ANY → <> ALL)", async () => {
    const origine = await trouverContrainte(bd(), 'users', /role/);
    await prouverDetection(
      `users.role : ${origine.definition} → <> ALL(...)`,
      `role='admin' devient REFUSÉ et role='pirate' ACCEPTÉ. Les quatre rôles du\n` +
        `04 §7 sont exactement inversés : plus personne ne peut se connecter avec un\n` +
        `rôle légitime, et n'importe quelle valeur inventée passe.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'users',
          origine.nom,
          `CHECK (role <> ALL (ARRAY['admin'::text, 'consultant'::text, 'analyste'::text, 'lecteur'::text]))`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'users', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 2 : CHECK neutralisée par un OR toujours vrai -------------------
  it('détecte une CHECK neutralisée par un « OR true »', async () => {
    const origine = await trouverContrainte(bd(), 'missions', /status/);
    await prouverDetection(
      `missions.status neutralisée par OR true`,
      `la machine à états mission (§32.2) n'a plus de garde-fou : n'importe quel\n` +
        `statut inventé est accepté, et les filtres de la console cessent d'être fiables.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'missions',
          origine.nom,
          `CHECK ((${expressionCheck(origine.definition)}) OR true)`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'missions', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 3 : CHECK neutralisée par un OR « colonne IS NOT NULL » ---------
  it('détecte une CHECK neutralisée par un « OR colonne IS NOT NULL »', async () => {
    const origine = await trouverContrainte(bd(), 'interviews', /kind/);
    await prouverDetection(
      `interviews.kind neutralisée par OR kind IS NOT NULL`,
      `les 6 types de session du 04 §7 ne sont plus contrôlés dès que la colonne est\n` +
        `renseignée — c'est-à-dire toujours. La neutralisation est plus discrète qu'un\n` +
        `« OR true » : elle a l'air d'une garde de nullité.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'interviews',
          origine.nom,
          `CHECK ((${expressionCheck(origine.definition)}) OR kind IS NOT NULL)`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'interviews', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 4 : CHECK posée NOT VALID --------------------------------------
  it('détecte une CHECK posée NOT VALID', async () => {
    const origine = await trouverContrainte(bd(), 'answers', /source/);
    await prouverDetection(
      `answers.source posée NOT VALID`,
      `la contrainte existe, porte le bon nom et la bonne expression — mais elle n'a\n` +
        `JAMAIS été vérifiée sur les lignes déjà en base. Un comparateur qui ne lit que\n` +
        `le nom et l'expression la déclare conforme alors qu'elle ne garantit rien du\n` +
        `passé. C'est la mutation la plus sournoise du lot : tout « a l'air » correct.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'answers',
          origine.nom,
          `${origine.definition.replace(/\s+NOT VALID$/i, '')} NOT VALID`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'answers', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 5 : CHECK composite reparenthésée, littéraux INCHANGÉS ---------
  it('détecte une CHECK composite reparenthésée sans changer un seul littéral', async () => {
    const origine = await trouverContrainte(bd(), 'step_validations', /step_code/);
    await prouverDetection(
      `step_validations : cohérence step_code ↔ scope reparenthésée`,
      `la règle du 04 §7 (« entretien → interview · unite → org_unit · autres →\n` +
        `mission ») change de sens sans qu'aucune chaîne de caractères ne bouge :\n` +
        `la validation d'une unité, pourtant légitime, devient REFUSÉE. Une comparaison\n` +
        `qui normalise l'expression en triant ses littéraux ne verra jamais rien.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'step_validations',
          origine.nom,
          `CHECK (step_code = 'entretien' AND scope = 'interview'
                  OR step_code = 'unite'
                     AND (scope = 'org_unit' OR step_code NOT IN ('entretien', 'unite'))
                     AND scope = 'mission')`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'step_validations', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 6 : index UNIQUE non déclaré ajouté ----------------------------
  it('détecte un index UNIQUE non déclaré ajouté sur answers', async () => {
    await prouverDetection(
      `index UNIQUE surnuméraire sur answers(mission_question_id)`,
      `répondre à la MÊME question dans DEUX sessions différentes devient impossible —\n` +
        `l'inverse exact de la règle du 04 §7, qui pose l'unicité sur le COUPLE\n` +
        `(interview_id, mission_question_id). L'audit s'arrête au deuxième entretien.\n` +
        `Un comparateur qui ne cherche que les objets MANQUANTS ne voit pas ceux qui\n` +
        `sont EN TROP : le schéma réel doit être un miroir du 04, pas un sur-ensemble.`,
      async () => {
        await bd().query(
          `CREATE UNIQUE INDEX mutation_a16_answers_mq ON answers (mission_question_id)`,
        );
      },
      async () => {
        await bd().query(`DROP INDEX IF EXISTS mutation_a16_answers_mq`);
      },
    );
  }, 120_000);

  // --- Classe 7 : colonne rendue nullable ------------------------------------
  it('détecte une colonne NOT NULL rendue nullable', async () => {
    const cible = await bd().query<{ table_name: string; column_name: string }>(
      `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.is_nullable = 'NO'
          AND c.table_name = ANY (ARRAY['missions', 'interviews', 'answers', 'org_units'])
          AND NOT EXISTS (
                SELECT 1 FROM pg_constraint pk
                 JOIN LATERAL unnest(pk.conkey) AS k(num) ON true
                 JOIN pg_attribute a ON a.attrelid = pk.conrelid AND a.attnum = k.num
                WHERE pk.conrelid = c.table_name::regclass AND pk.contype = 'p'
                  AND a.attname = c.column_name)
        ORDER BY c.table_name, c.ordinal_position
        LIMIT 1`,
    );
    const ligne = cible.rows[0];
    expect(
      ligne,
      `Aucune colonne NOT NULL hors clé primaire sur les tables de collecte : la\n` +
        `mutation « colonne rendue nullable » ne peut pas être jouée. Si le schéma ne\n` +
        `pose AUCUN NOT NULL métier, c'est en soi un constat à remonter.`,
    ).toBeDefined();
    const table = ligne?.table_name ?? '';
    const colonne = ligne?.column_name ?? '';

    await prouverDetection(
      `${table}.${colonne} : NOT NULL retiré`,
      `une colonne obligatoire devient facultative. Rien ne casse le jour du\n` +
        `déploiement : les lignes vides n'arrivent que plus tard, et l'absence se\n` +
        `découvre à la génération du rapport.`,
      async () => {
        await bd().query(`ALTER TABLE ${table} ALTER COLUMN ${colonne} DROP NOT NULL`);
      },
      async () => {
        await bd().query(`ALTER TABLE ${table} ALTER COLUMN ${colonne} SET NOT NULL`);
      },
    );
  }, 120_000);

  // --- Classe 8 : DEFAULT modifié --------------------------------------------
  it('détecte un DEFAULT de colonne modifié', async () => {
    const actuel = await bd().query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'timezone'`,
    );
    const origine = actuel.rows[0]?.column_default ?? null;

    await prouverDetection(
      `missions.timezone : DEFAULT ${origine ?? 'absent'} → 'UTC'`,
      `toute mission créée sans fuseau explicite bascule sur UTC au lieu du fuseau du\n` +
        `04 §7. Les horodatages restent justes en base (invariant 5) mais l'AFFICHAGE\n` +
        `des créneaux d'entretien glisse d'une ou deux heures — un décalage qu'un\n` +
        `auditeur sur le terrain découvre en arrivant à la mauvaise heure.`,
      async () => {
        await bd().query(`ALTER TABLE missions ALTER COLUMN timezone SET DEFAULT 'UTC'`);
      },
      async () => {
        await bd().query(
          origine === null
            ? `ALTER TABLE missions ALTER COLUMN timezone DROP DEFAULT`
            : `ALTER TABLE missions ALTER COLUMN timezone SET DEFAULT ${origine}`,
        );
      },
    );
  }, 120_000);

  // --- Classe 9 : type substitué (précision numérique) -----------------------
  it('détecte un numeric(4,1) substitué à un numeric', async () => {
    await prouverDetection(
      `block_scores.score : numeric → numeric(4,1)`,
      `les scores sont silencieusement ARRONDIS à une décimale et plafonnés à 999,9.\n` +
        `Aucune erreur n'est levée : le calcul du 04 §7 continue de tourner, ses\n` +
        `résultats sont simplement faux. Une perte de précision ne se voit jamais dans\n` +
        `un test fonctionnel — seulement dans une comparaison de types.`,
      async () => {
        await bd().query(`ALTER TABLE block_scores ALTER COLUMN score TYPE numeric(4,1)`);
      },
      async () => {
        await bd().query(`ALTER TABLE block_scores ALTER COLUMN score TYPE numeric`);
      },
    );
  }, 120_000);

  // --- Classe 10 : clé étrangère repointée (acquis à préserver) --------------
  it('détecte une clé étrangère repointée vers une autre table', async () => {
    const origine = await trouverContrainte(bd(), 'interviews', /org_unit_id/);
    await prouverDetection(
      `interviews.org_unit_id : FK repointée de org_units vers missions`,
      `l'unité d'audit d'une session ne référence plus l'arbre d'organisation.\n` +
        `Les colonnes gardent leur nom et leur type ; seule la CIBLE change. Le roll-up\n` +
        `de scores par unité (unit_scores) agrège alors sur un identifiant qui n'est\n` +
        `plus une unité.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'interviews',
          origine.nom,
          `FOREIGN KEY (org_unit_id) REFERENCES missions(id)`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'interviews', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 11 : valeur d'énumération retirée (acquis à préserver) ---------
  it("détecte une valeur retirée d'une énumération CHECK", async () => {
    const origine = await trouverContrainte(bd(), 'findings', /severity/);
    await prouverDetection(
      `findings.severity : 'point_fort' retiré de l'énumération`,
      `l'audit ne peut plus enregistrer de POINT FORT. Les trois autres sévérités\n` +
        `fonctionnent, la contrainte existe toujours, et le rapport perd la moitié de\n` +
        `son équilibre : un audit qui ne sait dire que ce qui va mal.`,
      async () => {
        await remplacerContrainte(
          bd(),
          'findings',
          origine.nom,
          `CHECK (severity = ANY (ARRAY['drapeau_rouge'::text, 'majeur'::text, 'mineur'::text]))`,
        );
      },
      async () => {
        await remplacerContrainte(bd(), 'findings', origine.nom, origine.definition);
      },
    );
  }, 120_000);

  // --- Classe 12 : index du §7.1 supprimé (acquis à préserver) ---------------
  it("détecte la suppression d'un index critique du §7.1", async () => {
    const cible = await bd().query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'answers'
          AND indexdef NOT ILIKE '%UNIQUE%' AND indexdef ILIKE '%(interview_id)%'
        LIMIT 1`,
    );
    const index = cible.rows[0];
    expect(
      index,
      `Aucun index simple sur answers(interview_id) : il est pourtant énuméré en tête\n` +
        `du 04 §7.1. Son absence est déjà, en soi, un écart au fichier 04.`,
    ).toBeDefined();
    const nom = index?.indexname ?? '';
    const definition = index?.indexdef ?? '';

    await prouverDetection(
      `index answers(interview_id) supprimé`,
      `chaque ouverture de session relit la table answers en entier. Invisible sur la\n` +
        `mission FIL-TPE, insupportable sur FIL-GC et ses 8 100 réponses — la lenteur\n` +
        `n'arrive qu'en clientèle grand compte, là où elle coûte le plus cher.`,
      async () => {
        await bd().query(`DROP INDEX "${nom}"`);
      },
      async () => {
        await bd().query(definition);
      },
    );
  }, 120_000);
});
