// =============================================================================
// LOT L1 — EMPREINTE REPRODUCTIBLE DU JEU DE RÉFÉRENCE (point 24 du gardien A02)
//
// Le dossier `docs/portes/PORTE_A_2026-08-27.md` publiait une empreinte de seed
// qu'AUCUN outil du dépôt ne produit. La propriété mesurée était vraie ; la
// preuve n'était pas rejouable. `scripts/empreinte-seed.mjs` livre l'artefact
// manquant : UNE chaîne, stable, obtenue en LECTURE SEULE. Ce fichier verrouille
// les trois propriétés sans lesquelles cette chaîne ne vaudrait rien.
//
//   1. DÉTERMINISME — deux exécutions sur la même base rendent la même chaîne.
//   2. REPRODUCTIBILITÉ — deux bases DISTINCTES, semées indépendamment, rendent
//      la même chaîne. C'est la propriété que `seed.mjs --empreinte` NE PEUT PAS
//      avoir : il hache la ligne entière, donc l'`id` UUID v7 tiré à l'exécution.
//      Sans elle, une empreinte publiée dans un dossier de porte n'est pas
//      vérifiable par celui qui la lit — exactement le défaut relevé.
//   3. SENSIBILITÉ — une empreinte qui ne bouge jamais ne prouve rien non plus.
//      La contre-épreuve modifie UNE valeur de référence et exige que la chaîne
//      change. Un test de déterminisme sans contre-épreuve passerait au vert
//      contre une fonction qui renvoie une constante.
//
// -----------------------------------------------------------------------------
// RÉSERVE DE CROISEMENT — À LIRE AVANT DE SIGNER (09 §5.6)
// -----------------------------------------------------------------------------
// La règle du dépôt est que le code de test n'est jamais écrit par l'agent qui a
// écrit le code testé. ELLE N'EST PAS TENUE ICI : A58 a écrit `empreinte-seed.mjs`
// ET ce fichier. Le mandat le prévoyait ; la conséquence est qu'une erreur de
// RAISONNEMENT d'A58 sur ce qu'il faut hacher se retrouverait des deux côtés et
// ne serait attrapée par personne. Un réviseur croisé doit repasser derrière, et
// regarder d'abord la projection de colonnes de `REFERENTIELS` : c'est là que le
// jugement se loge, pas dans la mécanique de hachage.
//
// Les mesures sont toutes prises en `beforeAll`, y compris la mutation de la
// contre-épreuve : les assertions ne dépendent alors d'aucun ordre d'exécution.
// =============================================================================
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
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
} from './aide/base-l1.js';

const executerFichier = promisify(execFile);

const OUTIL = resolve(RACINE_API, 'scripts', 'empreinte-seed.mjs');

/** Les 7 référentiels du 11 §5 — `users` n'en fait PAS partie (04 §7 : applicative). */
const REFERENTIELS_ATTENDUS = [
  'blocks',
  'sectors',
  'services',
  'interlocutor_profiles',
  'size_tiers',
  'naf_sector_map',
  'estimation_params',
] as const;

interface LigneReferentiel {
  table: string;
  lignes: number;
  md5: string;
}

interface RapportEmpreinte {
  empreinteGlobale: string;
  referentiels: LigneReferentiel[];
  comptes: { comptes: number; admins: number; adminsHabilites: number; md5: string };
}

interface Execution {
  code: number;
  sortie: string;
}

/**
 * Exécute l'outil comme un opérateur le ferait (`pnpm seed:empreinte`), en
 * capturant le code de sortie : `--attendue` s'en sert pour signaler une dérive,
 * et un test qui ne regarderait que la sortie standard le manquerait.
 */
async function executerOutil(
  urlBase: string,
  arguments_: readonly string[] = [],
): Promise<Execution> {
  const environnement: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: urlBase };
  try {
    const { stdout, stderr } = await executerFichier(process.execPath, [OUTIL, ...arguments_], {
      cwd: RACINE_DEPOT,
      env: environnement,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, sortie: `${stdout}${stderr}` };
  } catch (erreur) {
    const details = erreur as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: details.code ?? 1,
      sortie: `${details.stdout ?? ''}${details.stderr ?? ''}${details.message ?? ''}`,
    };
  }
}

/** Valide la sortie `--json` sans jamais passer par `any` (11 §3). */
function analyserRapport(sortie: string): RapportEmpreinte {
  const valeur: unknown = JSON.parse(sortie);
  if (typeof valeur !== 'object' || valeur === null) {
    throw new Error(`Sortie --json illisible :\n${sortie}`);
  }
  const objet = valeur as Record<string, unknown>;
  const globale = objet.empreinteGlobale;
  const referentiels = objet.referentiels;
  const comptes = objet.comptes;
  if (
    typeof globale !== 'string' ||
    !Array.isArray(referentiels) ||
    typeof comptes !== 'object' ||
    comptes === null
  ) {
    throw new Error(`Sortie --json incomplète :\n${sortie}`);
  }
  const lignes = (referentiels as unknown[]).map((brut): LigneReferentiel => {
    const l = brut as Record<string, unknown>;
    return {
      table: String(l.table),
      lignes: Number(l.lignes),
      md5: String(l.md5),
    };
  });
  const c = comptes as Record<string, unknown>;
  return {
    empreinteGlobale: globale,
    referentiels: lignes,
    comptes: {
      comptes: Number(c.comptes),
      admins: Number(c.admins),
      adminsHabilites: Number(c.adminsHabilites),
      md5: String(c.md5),
    },
  };
}

/**
 * Photographie brute du contenu des tables semées — sert UNIQUEMENT à prouver
 * que l'outil de mesure n'écrit rien. Elle est volontairement grossière
 * (`t::text`) : ici on veut voir le moindre `updated_at` touché, pas comparer
 * du contenu métier.
 */
async function photographierContenu(client: Client): Promise<string> {
  const morceaux: string[] = [];
  for (const table of [...REFERENTIELS_ATTENDUS, 'users']) {
    const resultat = await client.query<{ md5: string }>(
      `SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), 'vide') AS md5
         FROM "${table}" t`,
    );
    morceaux.push(`${table}=${resultat.rows[0]?.md5 ?? 'illisible'}`);
  }
  return morceaux.join(' ');
}

let nomA = '';
let nomB = '';
let clientA: Client | undefined;
let clientB: Client | undefined;

let rapportA1: RapportEmpreinte | undefined;
let rapportA2: RapportEmpreinte | undefined;
let rapportB: RapportEmpreinte | undefined;
let rapportBapresMutation: RapportEmpreinte | undefined;
let sortieLisible = '';
let contenuAvantMesure = '';
let contenuApresMesure = '';
let executionAttendueJuste: Execution | undefined;
let executionAttendueFausse: Execution | undefined;

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  // ── Base A : semée une fois, mesurée deux fois ────────────────────────────
  const baseA = await creerBaseEphemere('empreinte_a');
  nomA = baseA.nom;
  clientA = await connecter(baseA.url);
  await appliquerMontee(baseA.url);
  await executerSeed(baseA.url, baseA.nom);

  contenuAvantMesure = await photographierContenu(clientA);
  rapportA1 = analyserRapport((await executerOutil(baseA.url, ['--json'])).sortie);
  contenuApresMesure = await photographierContenu(clientA);
  rapportA2 = analyserRapport((await executerOutil(baseA.url, ['--json'])).sortie);
  sortieLisible = (await executerOutil(baseA.url)).sortie;

  // ── Base B : base DISTINCTE, semée indépendamment ─────────────────────────
  const baseB = await creerBaseEphemere('empreinte_b');
  nomB = baseB.nom;
  clientB = await connecter(baseB.url);
  await appliquerMontee(baseB.url);
  await executerSeed(baseB.url, baseB.nom);
  rapportB = analyserRapport((await executerOutil(baseB.url, ['--json'])).sortie);

  // ── Garde-fou `--attendue`, avant toute mutation ──────────────────────────
  executionAttendueJuste = await executerOutil(baseB.url, [
    '--json',
    '--attendue',
    rapportB.empreinteGlobale,
  ]);
  executionAttendueFausse = await executerOutil(baseB.url, [
    '--json',
    '--attendue',
    'ffffffffffffffffffffffffffffffff',
  ]);

  // ── Contre-épreuve : UNE valeur de référence modifiée, sur la base jetable ─
  // Le seuil de complétude de bloc (§32.1) passe de 0.60 à 0.61. C'est le genre
  // de dérive d'un caractère qu'une empreinte existe pour attraper, et qu'un
  // comptage de lignes ne verrait jamais. La base est supprimée en `afterAll` :
  // aucune donnée de référence du dépôt n'est touchée.
  await clientB.query(
    `UPDATE estimation_params SET value = 0.61 WHERE key = 'seuil_completude_bloc'`,
  );
  rapportBapresMutation = analyserRapport((await executerOutil(baseB.url, ['--json'])).sortie);
}, 300_000);

afterAll(async () => {
  if (clientA !== undefined) await clientA.end();
  if (clientB !== undefined) await clientB.end();
  if (nomA !== '') await supprimerBaseEphemere(nomA);
  if (nomB !== '') await supprimerBaseEphemere(nomB);
});

describe('L1 — empreinte du jeu de référence : déterminisme', () => {
  it('@critique deux exécutions sur la MÊME base rendent la MÊME empreinte globale', () => {
    expect(
      rapportA2?.empreinteGlobale,
      `Deux exécutions successives de l'outil, sur une base que rien n'a modifiée entre\n` +
        `les deux, ont rendu des empreintes différentes :\n` +
        `  1re : ${rapportA1?.empreinteGlobale ?? '?'}\n` +
        `  2e  : ${rapportA2?.empreinteGlobale ?? '?'}\n\n` +
        `Une empreinte non déterministe est PIRE que pas d'empreinte : elle transforme\n` +
        `chaque vérification en faux positif, et on finit par cesser de la regarder.\n` +
        `Causes à chercher, dans cet ordre : un ORDER BY absent ou dépendant de la\n` +
        `collation, une colonne d'horodatage entrée dans la projection, un rendu de\n` +
        `NUMERIC laissé à PostgreSQL.`,
    ).toBe(rapportA1?.empreinteGlobale);
  });

  it('chaque empreinte par table est elle aussi stable entre deux exécutions', () => {
    const derives = (rapportA1?.referentiels ?? [])
      .map((ligne, index) => ({ ligne, autre: rapportA2?.referentiels[index] }))
      .filter(({ ligne, autre }) => autre?.md5 !== ligne.md5)
      .map(({ ligne, autre }) => `${ligne.table} : ${ligne.md5} → ${autre?.md5 ?? 'absente'}`);

    expect(
      derives,
      `Empreintes par table instables :\n  ${derives.join('\n  ')}\n\n` +
        `L'empreinte globale est composée de celles-ci : si une seule bouge, la globale\n` +
        `bouge, et le tableau par table est ce qui permet de dire LAQUELLE. Sa stabilité\n` +
        `est donc une exigence à part entière, pas un corollaire.`,
    ).toEqual([]);
  });

  it("l'ordre des tables est imposé, pas alphabétique ni dicté par la base", () => {
    expect(
      (rapportA1?.referentiels ?? []).map((l) => l.table),
      `L'ordre des référentiels dans le rapport n'est pas celui du 11 §5.\n` +
        `Cet ordre entre DANS le calcul de l'empreinte globale : s'il devient l'ordre\n` +
        `alphabétique d'une locale, ou celui que rend le catalogue, deux machines\n` +
        `calculent deux empreintes différentes sur des données identiques.`,
    ).toEqual([...REFERENTIELS_ATTENDUS]);
  });
});

describe('L1 — empreinte du jeu de référence : reproductibilité entre bases', () => {
  it('@critique deux bases DISTINCTES semées indépendamment rendent la MÊME empreinte globale', () => {
    expect(
      rapportB?.empreinteGlobale,
      `Deux bases fraîches, migrées et semées séparément, rendent deux empreintes\n` +
        `différentes :\n` +
        `  base A : ${rapportA1?.empreinteGlobale ?? '?'}\n` +
        `  base B : ${rapportB?.empreinteGlobale ?? '?'}\n\n` +
        `C'est LA propriété qui distingue cet outil de « seed.mjs --empreinte », et la\n` +
        `raison d'être du point 24 du gardien : une empreinte qui change d'une base à\n` +
        `l'autre ne peut pas être publiée dans un dossier de porte, puisque le lecteur\n` +
        `qui la rejoue obtiendra autre chose et n'en saura rien conclure.\n` +
        `Cause quasi certaine : une colonne d'ALLOCATION est entrée dans la projection —\n` +
        `un \`id\` UUID v7, un \`updated_at\` posé par now(), une FK non résolue en code.`,
    ).toBe(rapportA1?.empreinteGlobale);
  });

  it('les comptes de lignes des 7 référentiels sont ceux du contrat 11 §5', () => {
    const parTable = new Map((rapportA1?.referentiels ?? []).map((l) => [l.table, l.lignes]));
    const attendus: Record<string, number> = {
      blocks: 9,
      services: 11,
      interlocutor_profiles: 9,
      size_tiers: 4,
    };
    const ecarts = Object.entries(attendus)
      .filter(([table, n]) => parTable.get(table) !== n)
      .map(([table, n]) => `${table} : ${String(parTable.get(table) ?? 0)} (attendu ${String(n)})`);

    expect(
      ecarts,
      `Comptes divergents :\n  ${ecarts.join('\n  ')}\n\n` +
        `Une empreinte stable sur le MAUVAIS jeu de données resterait verte indéfiniment.\n` +
        `Ces quatre cardinalités sont littérales au 11 §5 : elles ancrent l'empreinte à\n` +
        `un contenu connu au lieu de la laisser certifier n'importe quoi.`,
    ).toEqual([]);
  });
});

describe('L1 — empreinte du jeu de référence : sensibilité (contre-épreuve)', () => {
  it("@critique modifier UNE valeur de référence change l'empreinte globale", () => {
    expect(
      rapportBapresMutation?.empreinteGlobale,
      `Le seuil « seuil_completude_bloc » est passé de 0.60 à 0.61 et l'empreinte\n` +
        `globale n'a pas bougé (${rapportB?.empreinteGlobale ?? '?'}).\n\n` +
        `Un test de déterminisme seul passerait au vert contre une fonction qui renvoie\n` +
        `une constante : c'est cette assertion-ci qui prouve que l'empreinte MESURE\n` +
        `quelque chose. Et la valeur choisie n'est pas anodine — ce seuil pilote\n` +
        `block_scores.is_indicative (§32.1) : une dérive d'un caractère y change ce qui\n` +
        `est présenté au client comme fiable ou comme indicatif.`,
    ).not.toBe(rapportB?.empreinteGlobale);
  });

  it("la table modifiée est DÉSIGNÉE, et elle seule — l'outil dit où chercher", () => {
    const avant = new Map((rapportB?.referentiels ?? []).map((l) => [l.table, l.md5]));
    const bougees = (rapportBapresMutation?.referentiels ?? [])
      .filter((l) => avant.get(l.table) !== l.md5)
      .map((l) => l.table);

    expect(
      bougees,
      `Tables dont l'empreinte a changé : ${bougees.join(', ') || '(aucune)'}.\n` +
        `Attendu : « estimation_params » seule. Une empreinte globale qui bouge sans\n` +
        `désigner sa cause oblige à fouiller sept tables à la main ; si PLUSIEURS lignes\n` +
        `bougent pour une seule valeur modifiée, c'est que les tables ne sont pas\n` +
        `hachées indépendamment et le tableau de diagnostic ne vaut rien.`,
    ).toEqual(['estimation_params']);
  });
});

describe("L1 — empreinte du jeu de référence : l'instrument n'écrit pas", () => {
  it('@critique mesurer ne modifie AUCUNE donnée', () => {
    expect(
      contenuApresMesure,
      `Le contenu des tables a changé pendant la MESURE :\n` +
        `  avant : ${contenuAvantMesure}\n` +
        `  après : ${contenuApresMesure}\n\n` +
        `Un instrument qui écrit n'est pas un instrument. C'est le défaut de\n` +
        `« seed.mjs --empreinte », qui seede avant de mesurer et ne peut donc pas servir\n` +
        `à constater l'état d'une base de production. L'outil déclare une transaction\n` +
        `READ ONLY : si cette assertion rougit, cette déclaration a sauté.`,
    ).toBe(contenuAvantMesure);
  });
});

describe('L1 — empreinte du jeu de référence : périmètre et confidentialité', () => {
  it('la sortie lisible annonce 7 référentiels et les nomme tous', () => {
    expect(
      sortieLisible,
      `La sortie n'annonce pas « 7 référentiels ».\n` +
        `Le dossier de porte disait « 7 référentiels » là où l'outil imprimait 8 lignes :\n` +
        `le chiffre affiché doit dire de QUEL ensemble il parle, sinon la confusion\n` +
        `revient au prochain dossier.`,
    ).toMatch(/7 référentiels/);

    const absentes = REFERENTIELS_ATTENDUS.filter((table) => !sortieLisible.includes(table));
    expect(
      absentes,
      `Référentiels absents de la sortie : ${absentes.join(', ')}.\n` +
        `Une empreinte qui ne couvre pas un référentiel du 11 §5 ne prouve rien sur lui —\n` +
        `et son absence est silencieuse, ce qui est le pire des cas.`,
    ).toEqual([]);
  });

  it("`users` est mesurée À PART et n'entre pas dans l'empreinte globale", () => {
    expect(
      (rapportA1?.referentiels ?? []).map((l) => l.table),
      `« users » figure parmi les référentiels du rapport.\n` +
        `04 §7 la classe comme table APPLICATIVE (avec refresh_tokens), pas comme\n` +
        `référentiel. Et surtout : son contenu dépend de SEED_ADMIN_EMAIL et d'un sel\n` +
        `aléatoire — l'inclure rendrait l'empreinte globale non comparable d'une machine\n` +
        `à l'autre, c'est-à-dire inutile.`,
    ).not.toContain('users');

    expect(
      rapportA1?.comptes.admins,
      `Le rapport ne voit aucun compte admin. Le compte fondateur est un livrable du\n` +
        `lot L1 (11 §5) : la ligne « users » du rapport est le contrôle de sa présence.`,
    ).toBeGreaterThan(0);

    expect(
      rapportA1?.comptes.adminsHabilites,
      `Aucun admin habilité. §34.4 refuse toute affectation dans mission_users si\n` +
        `habilitated_at est NULL : le premier utilisateur s'auto-verrouille. L'outil\n` +
        `remonte cette forme précisément pour que la porte puisse la constater.`,
    ).toBeGreaterThan(0);
  });

  it('aucune donnée personnelle ne fuit dans la sortie destinée au dossier de porte', () => {
    const courriel = process.env.SEED_ADMIN_EMAIL;
    expect(
      sortieLisible.includes('@'),
      `La sortie de l'outil contient une arobase. Cette sortie est faite pour être\n` +
        `COPIÉE dans docs/portes/, un fichier versionné : aucune adresse ne doit s'y\n` +
        `trouver (11 §2, 06 §10.4). Sortie obtenue :\n${sortieLisible}`,
    ).toBe(false);

    if (courriel !== undefined && courriel !== '') {
      expect(
        sortieLisible.includes(courriel),
        `L'adresse du compte fondateur apparaît telle quelle dans la sortie.`,
      ).toBe(false);
    }
  });
});

describe('L1 — empreinte du jeu de référence : garde-fou `--attendue`', () => {
  it('sort en code 0 quand le jeu est conforme', () => {
    expect(
      executionAttendueJuste?.code,
      `« --attendue <la bonne empreinte> » n'a pas rendu 0.\n` +
        `C'est ce code de sortie qui permet de câbler la vérification dans la CI : sans\n` +
        `lui, la comparaison reste un geste humain, donc un geste qu'on oublie.\n\n` +
        `Sortie :\n${executionAttendueJuste?.sortie ?? ''}`,
    ).toBe(0);
  });

  it('@critique sort en code 1 et NOMME l’écart quand le jeu a dérivé', () => {
    expect(
      executionAttendueFausse?.code,
      `« --attendue <une empreinte fausse> » n'a pas rendu 1.\n` +
        `Un garde-fou qui rend 0 sur un désaccord est un garde-fou qui n'existe pas : la\n` +
        `CI resterait verte pendant que le jeu de référence dérive.\n\n` +
        `Sortie :\n${executionAttendueFausse?.sortie ?? ''}`,
    ).toBe(1);

    expect(
      executionAttendueFausse?.sortie,
      `Le message d'écart ne rappelle pas l'empreinte attendue et l'obtenue côte à côte.\n` +
        `Un échec doit dire ce qui était attendu, ce qui a été trouvé, et où regarder.`,
    ).toMatch(/attendue[\s\S]*obtenue/i);
  });
});
