// =============================================================================
// LOT L1 — CRITÈRES D'ACCEPTATION 2, 4 ET 5 (07 §12 ligne L1)
//
//   2. « seed rejouable 2× identique » — critère DUR. Un seed qui n'échoue pas
//      mais DUPLIQUE une ligne est un échec : on compare les comptes de CHAQUE
//      table, pas l'absence d'erreur.
//   4. Le compte fondateur porte `habilitated_at` — sans quoi §34.4 refuse toute
//      affectation de mission et le premier utilisateur s'auto-verrouille.
//   5. Les valeurs littérales du contrat 11 §5 : 9 blocs, 11 fonctions, 9 profils
//      avec `group_code`, 4 paliers avec leurs bornes, `estimation_params` normées.
//
// Écrit depuis la SPÉCIFICATION par A16 (09 §5.6). Base éphémère supprimée en fin.
// =============================================================================
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
} from './aide/base-l1.js';
import {
  CODES_BLOCS,
  CODES_SERVICES,
  GROUPES_INTERLOCUTEUR,
  MARQUEUR_DEFAUT_A_VALIDER,
  PALIERS,
  PARAMETRES_PAR_DEFAUT,
  PROFILS_INTERLOCUTEUR,
  SEUILS_NORMES,
  TABLES_ATTENDUES_L1,
} from './aide/specification-l1.js';

let nomBase = '';
let client: Client | undefined;

let comptesApres1: Record<string, number> = {};
let comptesApres2: Record<string, number> = {};
let empreintesApres1: Record<string, string> = {};
let empreintesApres2: Record<string, string> = {};
let sortieEmpreinte = '';

/** Compte les lignes de chaque table du fichier 04 exigée au lot L1. */
async function compterToutesLesTables(connexion: Client): Promise<Record<string, number>> {
  const comptes: Record<string, number> = {};
  for (const table of TABLES_ATTENDUES_L1) {
    const resultat = await connexion.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${table}"`,
    );
    comptes[table] = Number(resultat.rows[0]?.n ?? '0');
  }
  return comptes;
}

/**
 * Empreinte de CONTENU par table : md5 de toutes les lignes, ordre normalisé.
 *
 * Les comptes ne suffisent pas, et la revue croisée (A17) l'a dit précisément :
 * un seed qui METTRAIT À JOUR une ligne à chaque passage rendrait des comptes
 * rigoureusement identiques tout en modifiant les données. Le critère du 07 §12
 * n'est pas « rejouable 2× sans erreur », c'est « rejouable 2× À L'IDENTIQUE ».
 *
 * L'empreinte est recalculée ici plutôt que lue depuis `seed.mjs --empreinte` :
 * la règle de croisement (09 §5.6) interdit de prouver le code testé AVEC le
 * code testé. Un bug dans le calcul d'empreinte du seed rendrait deux passages
 * « identiques » quoi qu'il arrive.
 */
async function empreindreToutesLesTables(connexion: Client): Promise<Record<string, string>> {
  const empreintes: Record<string, string> = {};
  for (const table of TABLES_ATTENDUES_L1) {
    const resultat = await connexion.query<{ md5: string }>(
      `SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), 'vide') AS md5
         FROM "${table}" t`,
    );
    empreintes[table] = resultat.rows[0]?.md5 ?? 'illisible';
  }
  return empreintes;
}

async function codesDe(connexion: Client, table: string): Promise<string[]> {
  const resultat = await connexion.query<{ code: string }>(
    `SELECT code FROM "${table}" ORDER BY code`,
  );
  return resultat.rows.map((l) => l.code);
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('seed');
  nomBase = base.nom;
  client = await connecter(base.url);
  await appliquerMontee(base.url);

  // Le seed est joué DEUX fois : c'est le critère d'acceptation lui-même.
  await executerSeed(base.url, base.nom);
  comptesApres1 = await compterToutesLesTables(client);
  empreintesApres1 = await empreindreToutesLesTables(client);

  sortieEmpreinte = await executerSeed(base.url, base.nom, ['--empreinte']);
  comptesApres2 = await compterToutesLesTables(client);
  empreintesApres2 = await empreindreToutesLesTables(client);
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

describe('L1 — seed rejouable (07 §12, critère 2)', () => {
  it('rejouer le seed une seconde fois ne change AUCUN compte de table', () => {
    const ecarts = TABLES_ATTENDUES_L1.filter(
      (table) => comptesApres1[table] !== comptesApres2[table],
    ).map(
      (table) => `${table} : ${String(comptesApres1[table])} → ${String(comptesApres2[table])}`,
    );

    expect(
      ecarts,
      `Le seed n'est pas idempotent — comptes modifiés au 2e passage :\n  ${ecarts.join('\n  ')}\n\n` +
        `Attendu (07 §12 ligne L1) : « seed rejouable 2× IDENTIQUE ». Le critère ne porte\n` +
        `pas sur l'absence d'erreur : un seed qui insère une seconde fois un référentiel\n` +
        `duplique silencieusement des codes et fausse tout ce qui compte des lignes\n` +
        `(complétude, divergence direction/terrain, assemblage du questionnaire).\n` +
        `Remède attendu : INSERT … ON CONFLICT (code) DO NOTHING/UPDATE, jamais un INSERT nu.`,
    ).toEqual([]);
  });

  it("@critique rejouer le seed ne change AUCUNE EMPREINTE DE CONTENU — c'est le critère « à l'identique »", () => {
    const derives = TABLES_ATTENDUES_L1.filter(
      (table) => empreintesApres1[table] !== empreintesApres2[table],
    ).map(
      (table) => `${table} : ${empreintesApres1[table] ?? '?'} → ${empreintesApres2[table] ?? '?'}`,
    );

    expect(
      derives,
      `Le CONTENU de ${String(derives.length)} table(s) a changé au second passage du seed,\n` +
        `alors que les comptes de lignes, eux, sont restés identiques :\n  ${derives.join('\n  ')}\n\n` +
        `Attendu (07 §12 ligne L1) : « seed rejouable 2× À L'IDENTIQUE ». Compter les\n` +
        `lignes ne suffit pas — un ON CONFLICT DO UPDATE qui réécrit une valeur, ou qui\n` +
        `touche un updated_at, laisse les comptes intacts et modifie les données.\n` +
        `Le seed peuple des RÉFÉRENTIELS dont les identifiants sont déjà référencés par\n` +
        `les missions en base. Une valeur qui dérive à chaque déploiement fait dériver\n` +
        `avec elle l'assemblage du questionnaire et le calcul de divergence\n` +
        `direction/terrain, sans qu'aucune erreur ne soit jamais levée.\n` +
        `(Empreintes recalculées ici indépendamment de « seed.mjs --empreinte » : on ne\n` +
        `prouve pas le code testé avec le code testé — 09 §5.6.)`,
    ).toEqual([]);
  });

  it("le seed expose son empreinte par table (« --empreinte ») — l'outil de preuve reste câblé", () => {
    expect(
      sortieEmpreinte,
      `« seed.mjs --empreinte » n'imprime pas le tableau d'empreintes attendu.\n` +
        `C'est l'outil que la revue et les portes utilisent pour PROUVER la rejouabilité\n` +
        `à la main, sans écrire de test. S'il cesse d'être câblé, cette vérification\n` +
        `disparaît du dépôt en silence.\n\nSortie obtenue :\n${sortieEmpreinte}`,
    ).toMatch(/empreinte/i);

    const absentes = ['blocks', 'services', 'interlocutor_profiles', 'size_tiers'].filter(
      (table) => !sortieEmpreinte.includes(table),
    );
    expect(
      absentes,
      `Tables absentes du rapport d'empreinte : ${absentes.join(', ')}.\n` +
        `Une empreinte qui ne couvre pas les référentiels du 11 §5 ne prouve rien sur eux.`,
    ).toEqual([]);
  });

  it('les référentiels à code contiennent exactement les mêmes codes après le second passage', async () => {
    if (client === undefined) throw new Error('connexion absente');
    for (const table of ['blocks', 'services', 'interlocutor_profiles', 'size_tiers', 'sectors']) {
      const codes = await codesDe(client, table);
      const uniques = [...new Set(codes)];
      expect(
        codes.length,
        `La table « ${table} » contient des codes DUPLIQUÉS après deux seeds :\n` +
          `${String(codes.length)} lignes pour ${String(uniques.length)} codes distincts.\n` +
          `04 §7 déclare « code UNIQUE » sur ce référentiel : si des doublons existent,\n` +
          `la contrainte UNIQUE manque OU le seed contourne le conflit.`,
      ).toBe(uniques.length);
    }
  });
});

describe('L1 — valeurs littérales du seed (11 §5, critère 5)', () => {
  it('9 blocs, aux codes bloc_1 … bloc_9', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const codes = await codesDe(client, 'blocks');
    expect(
      codes,
      `Blocs seedés : ${String(codes.length)} (${codes.join(', ')}).\n` +
        `Attendu (11 §5 + 01 §2.1) : 9 blocs, codes bloc_1…bloc_9. Le référentiel des 9\n` +
        `blocs structure TOUT l'outil (assemblage du questionnaire, block_scores,\n` +
        `chapitres du rapport) : un bloc manquant retire un chapitre entier de l'audit.`,
    ).toEqual([...CODES_BLOCS]);
  });

  it('11 fonctions métier, aux codes exacts de la taxonomie', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const codes = await codesDe(client, 'services');
    expect(
      codes,
      `Fonctions seedées : ${String(codes.length)} (${codes.join(', ')}).\n` +
        `Attendu (11 §5) : 11 fonctions — ${CODES_SERVICES.join(', ')}.\n` +
        `Ces codes sont des CLÉS (paquets de questions par service §16.3,\n` +
        `interviews.person_service_id, org_units.service_ref_id) : un code approximatif\n` +
        `ne se rattrape pas par un libellé correct.`,
    ).toEqual([...CODES_SERVICES].sort());
  });

  it("9 profils d'interlocuteur, chacun avec son group_code (direction | encadrement | terrain)", async () => {
    if (client === undefined) throw new Error('connexion absente');
    const resultat = await client.query<{ code: string; group_code: string | null }>(
      `SELECT code, group_code FROM interlocutor_profiles ORDER BY code`,
    );
    const obtenus = resultat.rows.map((l) => ({ code: l.code, groupe: l.group_code }));
    const attendus = [...PROFILS_INTERLOCUTEUR].sort((a, b) => a.code.localeCompare(b.code));

    expect(
      obtenus,
      `Profils seedés : ${JSON.stringify(obtenus)}.\n` +
        `Attendu (11 §5) : ${JSON.stringify(attendus)}.\n` +
        `Le group_code n'est pas une étiquette d'affichage : c'est « la base du calcul de\n` +
        `divergence direction/terrain » (04 §7, V2.2 §32.1). Un profil sans groupe sort du\n` +
        `calcul sans que personne ne le voie.`,
    ).toEqual(attendus);

    const horsEnumeration = obtenus.filter(
      (p) => p.groupe === null || !GROUPES_INTERLOCUTEUR.includes(p.groupe),
    );
    expect(
      horsEnumeration,
      `Profils dont le group_code est NULL ou hors énumération : ${JSON.stringify(horsEnumeration)}.\n` +
        `04 §7 : group_code CHECK IN ('direction','encadrement','terrain').`,
    ).toEqual([]);
  });

  it("4 paliers de taille avec leurs bornes d'effectif", async () => {
    if (client === undefined) throw new Error('connexion absente');
    const resultat = await client.query<{
      code: string;
      headcount_min: number | null;
      headcount_max: number | null;
    }>(`SELECT code, headcount_min, headcount_max FROM size_tiers ORDER BY headcount_min`);

    const obtenus = resultat.rows.map((l) => ({
      code: l.code,
      min: l.headcount_min,
      max: l.headcount_max,
    }));

    expect(
      obtenus,
      `Paliers seedés : ${JSON.stringify(obtenus)}.\n` +
        `Attendu (11 §5) : ${JSON.stringify(PALIERS)}.\n` +
        `Les bornes pilotent la couche dimensionnelle du questionnaire (01 §2.3) et le\n` +
        `chiffrage : un chevauchement ou un trou entre deux paliers rend le classement\n` +
        `d'une entreprise ambigu. Note : le fichier 01 §2.3 énonce des bornes de LECTURE\n` +
        `qui se chevauchent (10-250, 250-5 000) ; le contrat 11 §5, référence\n` +
        `d'implémentation du seed, donne les bornes disjointes ci-dessus.`,
    ).toEqual([...PALIERS]);
  });
});

describe('L1 — estimation_params normées (11 §5, 04 §7)', () => {
  it('les trois seuils normés portent leur valeur exacte', async () => {
    if (client === undefined) throw new Error('connexion absente');
    for (const { cle, valeur } of SEUILS_NORMES) {
      const resultat = await client.query<{ value: string | null }>(
        `SELECT value::text AS value FROM estimation_params WHERE key = $1`,
        [cle],
      );
      const ligne = resultat.rows[0];
      expect(
        ligne,
        `estimation_params « ${cle} » absent.\n` +
          `04 §7 cite explicitement les clés normées du seed L1, dont ${cle} = ${String(valeur)}.\n` +
          `Ce seuil est LU par le calcul (block_scores.is_indicative, unit_scores.answers_count,\n` +
          `divergence §32.1) : absent, le code se rabattra sur une constante en dur — exactement\n` +
          `ce que la table estimation_params existe pour empêcher.`,
      ).toBeDefined();

      expect(
        Number(ligne?.value ?? 'NaN'),
        `estimation_params « ${cle} » = ${ligne?.value ?? 'NULL'}, attendu ${String(valeur)}\n` +
          `(11 §5 et 04 §7 le citent DEUX fois avec cette valeur : ce n'est pas un exemple).`,
      ).toBe(valeur);
    }
  });

  it('les paramètres de charge par défaut sont seedés aux valeurs du contrat 11 §5', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const resultat = await client.query<{ key: string; value: string | null }>(
      `SELECT key, value::text AS value FROM estimation_params`,
    );
    const parCle = new Map(resultat.rows.map((l) => [l.key, l.value]));

    const manquants = PARAMETRES_PAR_DEFAUT.filter((p) => !parCle.has(p.cle)).map((p) => p.cle);
    expect(
      manquants,
      `Clés estimation_params manquantes : ${manquants.join(', ')}.\n` +
        `Attendu (11 §5) : le seed L1 pose des valeurs par défaut RAISONNABLES pour les\n` +
        `familles normées (duree_<type>_<profil>, analyse_par_bloc, taux_horaire_charge_<catégorie>).\n` +
        `Le contrat en donne les valeurs ; Williams les valide ou les ajuste AVANT la porte\n` +
        `P-A. Une clé absente n'est pas ajustable — elle est invisible.`,
    ).toEqual([]);

    const ecarts = PARAMETRES_PAR_DEFAUT.filter(
      (p) => parCle.has(p.cle) && Number(parCle.get(p.cle) ?? 'NaN') !== p.valeur,
    ).map((p) => `${p.cle} = ${parCle.get(p.cle) ?? 'NULL'} (contrat 11 §5 : ${String(p.valeur)})`);

    expect(
      ecarts,
      `Valeurs par défaut divergentes :\n  ${ecarts.join('\n  ')}\n\n` +
        `Le contrat 11 §5 donne ces chiffres. S'ils ont été délibérément changés, c'est un\n` +
        `arbitrage à tracer dans DECISIONS.md (11 §8.2), pas un choix d'implémentation.`,
    ).toEqual([]);
  });

  it('les valeurs par défaut portent le marqueur « défaut à valider » exigé', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const cles = PARAMETRES_PAR_DEFAUT.map((p) => p.cle);
    const resultat = await client.query<{ key: string; description: string | null }>(
      `SELECT key, description FROM estimation_params WHERE key = ANY($1::text[])`,
      [cles],
    );
    const sansMarqueur = resultat.rows
      .filter((l) => !(l.description ?? '').toLowerCase().includes(MARQUEUR_DEFAUT_A_VALIDER))
      .map((l) => `${l.key} → « ${l.description ?? 'NULL'} »`);

    expect(
      sansMarqueur,
      `Paramètres sans le marqueur « ${MARQUEUR_DEFAUT_A_VALIDER} » :\n  ${sansMarqueur.join('\n  ')}\n\n` +
        `11 §5 : ces valeurs sont seedées « marquées description: '${MARQUEUR_DEFAUT_A_VALIDER}' ».\n` +
        `Le marqueur EST le mécanisme de l'arbitrage avant P-A : sans lui, une valeur\n` +
        `provisoire devient définitive par oubli, et l'écran d'admin est en Phase 2.`,
    ).toEqual([]);
  });
});

describe('L1 — compte fondateur habilité (07 §12 critère 4, §34.4)', () => {
  it('le seed crée un compte admin dont habilitated_at est NON NULL', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const resultat = await client.query<{ email: string; habilitated_at: Date | null }>(
      `SELECT email, habilitated_at FROM users WHERE role = 'admin' ORDER BY created_at`,
    );

    expect(
      resultat.rows.length,
      `Aucun compte admin seedé.\n` +
        `Attendu (11 §5 + 07 §12 ligne L1) : « le seed L1 crée l'admin AVEC habilitated_at posé ».`,
    ).toBeGreaterThan(0);

    const habilites = resultat.rows.filter((l) => l.habilitated_at !== null);
    expect(
      habilites.length,
      `Aucun des ${String(resultat.rows.length)} compte(s) admin n'a habilitated_at renseigné.\n` +
        `§34.4 REFUSE côté serveur toute affectation dans mission_users si habilitated_at\n` +
        `est NULL. Sans cette valeur, le premier utilisateur de l'outil ne peut pas\n` +
        `s'affecter sa propre première mission : auto-verrouillage complet, et personne\n` +
        `pour l'habiliter puisqu'il est le seul compte. C'est le défaut que le pack\n` +
        `nomme explicitement (V2.8) et que ce test existe pour attraper.`,
    ).toBeGreaterThan(0);
  });
});

describe('L1 — référentiels administrés seedés (07 §12 ligne L1)', () => {
  it('secteurs et correspondance NAF → secteur sont peuplés', async () => {
    if (client === undefined) throw new Error('connexion absente');
    const secteurs = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM sectors`);
    const naf = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM naf_sector_map`);

    expect(
      Number(secteurs.rows[0]?.n ?? '0'),
      `Aucun secteur seedé. 07 §12 ligne L1 : « seed référentiels (9 blocs, SECTEURS,\n` +
        `11 fonctions, profils avec group_code, paliers, estimation_params normées,\n` +
        `naf_sector_map, compte admin fondateur…) ». Le pack ne fige pas la liste des\n` +
        `secteurs (couche sectorielle construite « au fil des missions », 01 §2.3) :\n` +
        `ce test n'exige donc pas des codes, il exige que le référentiel ne soit pas vide.`,
    ).toBeGreaterThan(0);

    expect(
      Number(naf.rows[0]?.n ?? '0'),
      `naf_sector_map est vide. 04 §7 : « R4 — pré-remplissage secteur ». Sans une seule\n` +
        `correspondance, la règle R4 ne pré-remplit jamais rien et la saisie de secteur\n` +
        `redevient manuelle à chaque création d'entreprise.`,
    ).toBeGreaterThan(0);
  });
});
