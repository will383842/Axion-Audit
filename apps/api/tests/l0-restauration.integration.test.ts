// =============================================================================
// RESTAURATION — LA FORME AUTOMATISABLE DE LA PROCÉDURE JOUÉE À LA MAIN
//
// `infra/README.md` §5.4 et §5.5 décrivent deux restaurations JOUÉES le
// 2026-08-28 : PostgreSQL depuis le dépôt pgBackRest, MinIO depuis l'archive
// chiffrée. Jouées à la main, elles prouvent ce jour-là. Ce fichier les rejoue à
// chaque exécution de la suite — c'est la différence entre « nous l'avons fait »
// et « cela marche ».
//
// 09 §5.6 : ces tests sont écrits par le test croisé, qui n'a produit aucune
// ligne de `sauvegarde.sh`, du Dockerfile ni du compose.
//
// -----------------------------------------------------------------------------
// POURQUOI TOUT EST ASYNCHRONE ICI — CE N'EST PAS UN CHOIX DE STYLE
// -----------------------------------------------------------------------------
// La première version de ce fichier pilotait Docker en `spawnSync`. Elle avait
// TOUS SES CAS VERTS et la suite sortait quand même EN 1 :
//
//     Vitest caught 1 unhandled error during the test run.
//     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
//     Tests 7 passed (7)   Errors 1 error        →  exit 1
//
// MESURÉ et isolé le 2026-08-28 sur un cas jetable réduit à un seul appel
// synchrone de 70 s : le RPC du worker vitest a une tolérance d'environ 60 s, et
// un processus qui retient la boucle d'événements plus longtemps l'épuise. Les
// `beforeAll` de ce fichier (démarrage de clusters, attente d'un MinIO, archive,
// restauration) dépassent cette minute à chaque exécution.
//
// C'est le même défaut de famille que ceux que ce lot démonte, pris à l'envers :
// une suite qui AFFICHE sept cas verts et qui rend un build ROUGE. Le pilotage
// asynchrone rend la main entre deux commandes, le RPC répond, et le code de
// sortie redevient une information.
//
// -----------------------------------------------------------------------------
// CE QUE CHAQUE MOITIÉ PROUVE, ET COMMENT ELLE POURRAIT MENTIR
// -----------------------------------------------------------------------------
// PostgreSQL. Le critère n'est pas « le cluster redémarre » — un cluster vide
// redémarre très bien. C'est l'EMPREINTE DU JEU DE RÉFÉRENCE : `pnpm
// seed:empreinte --attendue <valeur>` compare le CONTENU MÉTIER canonisé de sept
// tables, hors identifiants et hors horodatages. Pour qu'elle ne puisse pas être
// vraie par accident, le cas jumeau exige qu'une empreinte FAUSSE soit REFUSÉE :
// un outil qui rend 0 quoi qu'on lui donne validerait n'importe quelle
// restauration.
//
// MinIO. Le critère n'est pas seulement « les objets reviennent » : `mc mirror`
// les ramenait aussi, et perdait le versioning et les politiques (README §5.5).
// Ce qui distingue la voie retenue — le `tar` du volume — est la restitution de
// `.minio.sys`. Les cas ci-dessous posent donc des réglages NON PAR DÉFAUT
// (versioning activé, politique anonyme `download`, compte de service) avant
// d'archiver : sur un MinIO neuf, aucun de ces trois-là ne peut réapparaître
// tout seul.
//
// DOCKER ABSENT = ÉCHEC EXPLICITE, jamais un skip (09 §5.7).
//
// Traçabilité : invariant 8 · 02 §11.4 · 07 ligne L0 (« restauration Postgres ET
// MinIO testée depuis zéro ») · 09 §5.6.
// =============================================================================
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..', '..', '..');
const IMAGE_POSTGRES = 'axion-audit-postgres:16-coolify';
const IMAGE_MINIO = 'minio/minio:RELEASE.2025-04-22T22-12-26Z';
const IMAGE_MC = 'minio/mc:RELEASE.2025-04-16T18-13-26Z';

/**
 * Empreinte du jeu de référence, publiée par `docs/portes/` et vérifiée à la
 * main le 2026-08-28 des DEUX côtés de la restauration (infra/README.md §5.4).
 * Ce n'est pas un secret : c'est le md5 d'un contenu entièrement versionné.
 */
const EMPREINTE_ATTENDUE = '65929446c5c682592befc43c033229b6';

// Secrets FACTICES (11 §2 : aucune valeur réelle dans un fichier versionné).
const MOT_DE_PASSE_PG = 'motdepasse-factice-de-test';
const PASSPHRASE_DEPOT = 'passphrase-factice-du-depot';
const PASSPHRASE_ARCHIVES = 'passphrase-factice-des-archives';
const MINIO_UTILISATEUR = 'racine-factice';

/**
 * Expédition R2 NEUTRALISÉE — quatrième substitution nommée, comme dans le
 * fichier jumeau. Depuis le 2026-08-28 le script refuse de démarrer sans ces
 * quatre variables, et sa passe ne se termine qu'apres avoir expedie vers R2.
 * Le faux `mc` rend 0 et fait mine de lister un objet distant : il permet
 * d'observer la RESTAURATION, il ne prouve RIEN sur R2.
 */
const R2_FACTICE =
  'BACKUP_R2_BUCKET=seau-factice-de-test BACKUP_R2_ENDPOINT=compte-factice.r2.cloudflarestorage.com ' +
  'BACKUP_R2_ACCESS_KEY=acces-factice-de-test BACKUP_R2_SECRET_KEY=secret-factice-de-test ' +
  'AXION_R2_VERIFIER_RELECTURE=non';
/**
 * Fragment shell qui écrit le faux `mc` dans un répertoire de PATH prioritaire.
 *
 * LA SOURCE DE VÉRITÉ EST `aide/faux-mc.sh`, ET ELLE EST UNIQUE — c'est le point
 * de ce bloc. Ce fichier portait sa PROPRE copie du faux, en une ligne, qui ne
 * connaissait que `ls`. Quand `fix/miroir-backup-info` a remplacé le comptage
 * d'objets distants par une comparaison d'inventaires (`mc find`), les deux
 * copies sont devenues fausses en même temps, et cette suite est tombée avec
 * l'autre. Deux faux à réviser, c'est un faux qu'on oublie.
 *
 * L'encodage base64 n'est pas une coquetterie : le fragment est concaténé dans
 * une commande shell, elle-même passée à `docker exec` depuis une chaîne
 * JavaScript. Trois niveaux de citation sur un script qui contient guillemets,
 * apostrophes et `$` — le base64 traverse les trois sans qu'aucun ne le morde,
 * et le fichier écrit est celui du dépôt À L'OCTET PRÈS.
 */
const FAUX_MC = `printf '%s' '${readFileSync(
  resolve(import.meta.dirname, 'aide', 'faux-mc.sh'),
).toString('base64')}' | base64 -d`;

const MINIO_MOT_DE_PASSE = 'motdepasse-minio-factice';

const SUFFIXE = String(process.pid);

interface Resultat {
  readonly code: number;
  readonly sortie: string;
}

/**
 * Lance un exécutable SANS retenir la boucle d'événements (voir l'encadré du
 * haut). `delaiMs` tue le processus plutôt que de laisser la suite pendre.
 */
async function lancer(
  executable: string,
  arguments_: readonly string[],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly delaiMs?: number },
): Promise<Resultat> {
  return new Promise<Resultat>((resoudre, rejeter) => {
    const processus = spawn(executable, [...arguments_], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });
    let sortie = '';
    const minuteur = setTimeout(() => {
      sortie += `\n[le test a tué \`${executable}\` après ${String(options.delaiMs ?? 0)} ms]`;
      processus.kill('SIGKILL');
    }, options.delaiMs ?? 600_000);
    processus.stdout.on('data', (morceau: Buffer) => (sortie += morceau.toString('utf8')));
    processus.stderr.on('data', (morceau: Buffer) => (sortie += morceau.toString('utf8')));
    processus.on('error', (erreur: Error) => {
      clearTimeout(minuteur);
      rejeter(
        new Error(
          `\`${executable} ${arguments_.slice(0, 3).join(' ')}…\` n'a pas pu être lancé.\n` +
            `La restauration ne se prouve qu'en exécution : Docker est REQUIS, et son\n` +
            `absence est un ÉCHEC, pas un motif de skip (09 §5.7).\n\nCause : ${erreur.message}`,
        ),
      );
    });
    processus.on('close', (code: number | null) => {
      clearTimeout(minuteur);
      resoudre({ code: code ?? -1, sortie });
    });
  });
}

async function docker(arguments_: readonly string[], delaiMs = 600_000): Promise<Resultat> {
  return lancer('docker', arguments_, { delaiMs });
}

/** Ressources créées par ce fichier, retirées quoi qu'il arrive. */
const conteneurs: string[] = [];
const volumes: string[] = [];
const reseaux: string[] = [];

function nommerConteneur(role: string): string {
  const nom = `axion-l0-${role}-${SUFFIXE}`;
  conteneurs.push(nom);
  return nom;
}

async function creerVolume(role: string): Promise<string> {
  const nom = `axion-l0-${role}-${SUFFIXE}`;
  await docker(['volume', 'rm', '-f', nom], 60_000);
  expect((await docker(['volume', 'create', nom], 60_000)).code).toBe(0);
  volumes.push(nom);
  return nom;
}

async function creerReseau(role: string): Promise<string> {
  const nom = `axion-l0-${role}-${SUFFIXE}`;
  await docker(['network', 'rm', nom], 60_000);
  expect((await docker(['network', 'create', nom], 60_000)).code).toBe(0);
  reseaux.push(nom);
  return nom;
}

/** Port hôte publié par un conteneur pour un port interne donné. */
async function portPublie(conteneur: string, portInterne: number): Promise<number> {
  const { code, sortie } = await docker(['port', conteneur, `${String(portInterne)}/tcp`], 60_000);
  expect(code, `Aucun port publié pour ${conteneur} :\n${sortie}`).toBe(0);
  const trouve = /:(\d+)\s*$/m.exec(sortie.trim());
  expect(trouve, `Port illisible pour ${conteneur} : « ${sortie} »`).not.toBeNull();
  return Number(trouve?.[1] ?? 0);
}

/** Attend qu'une commande rende 0 dans le conteneur, sinon échoue en le disant. */
async function attendre(
  conteneur: string,
  commande: readonly string[],
  essais = 90,
): Promise<void> {
  for (let i = 0; i < essais; i += 1) {
    if ((await docker(['exec', conteneur, ...commande], 60_000)).code === 0) return;
  }
  const journal = await docker(['logs', '--tail', '40', conteneur], 60_000);
  throw new Error(
    `${conteneur} n'a jamais répondu à \`${commande.join(' ')}\`.\n\nJournal :\n${journal.sortie}`,
  );
}

/**
 * Attend un cluster RÉELLEMENT joignable, et c'est tout le sujet du lot.
 *
 * `pg_isready` SANS `-h` interroge le SOCKET UNIX — donc aussi le serveur
 * TEMPORAIRE que l'entrypoint de l'image officielle lance pour `initdb`, qui
 * n'écoute sur AUCUNE adresse TCP et qui sera arrêté juste après. Mesuré ici :
 * `pg_isready` répondait « accepting connections » pendant que le port publié
 * refusait tout, et `migrations.mjs` sortait sur « Connection terminated
 * unexpectedly ». C'est la MÊME sonde menteuse que celle qui déclarait `healthy`
 * un cluster qui se réinitialisait 275 fois — et la raison d'être de
 * `infra/postgres/healthcheck.sh`.
 *
 * On exige donc TROIS SUCCÈS CONSÉCUTIFS d'une vraie requête sur TCP : la
 * réinitialisation qui suit l'arrêt du serveur temporaire (l'`archive_command`
 * tué au vol y compte pour un plantage) casse la série au lieu de passer
 * inaperçue.
 */
async function attendreCluster(conteneur: string, motDePasse: string, essais = 120): Promise<void> {
  let consecutifs = 0;
  for (let i = 0; i < essais; i += 1) {
    const requete = await docker(
      [
        'exec',
        '-e',
        `PGPASSWORD=${motDePasse}`,
        conteneur,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'axion',
        '-d',
        'axion_audit',
        '-tAc',
        'select 1',
      ],
      60_000,
    );
    consecutifs = requete.code === 0 && requete.sortie.includes('1') ? consecutifs + 1 : 0;
    if (consecutifs >= 3) return;
  }
  const journal = await docker(['logs', '--tail', '40', conteneur], 60_000);
  throw new Error(
    `${conteneur} n'a jamais offert trois requêtes TCP consécutives.\n\nJournal :\n${journal.sortie}`,
  );
}

/** Exécute un script Node du dépôt contre une base, comme un opérateur le ferait. */
async function scriptApi(
  fichier: string,
  arguments_: readonly string[],
  urlBase: string,
): Promise<Resultat> {
  return lancer(
    process.execPath,
    [resolve(RACINE_DEPOT, 'apps', 'api', 'scripts', fichier), ...arguments_],
    {
      cwd: RACINE_DEPOT,
      env: { ...process.env, DATABASE_URL: urlBase, DATABASE_URL_TEST: urlBase },
      delaiMs: 300_000,
    },
  );
}

beforeAll(async () => {
  const version = await docker(['version', '--format', '{{.Server.Version}}'], 60_000);
  if (version.code !== 0) {
    throw new Error(
      `Le démon Docker ne répond pas — la restauration ne peut pas être rejouée.\n` +
        `C'est un ÉCHEC de la suite, pas un skip (09 §5.7).\n\n${version.sortie}`,
    );
  }
  if ((await docker(['image', 'inspect', IMAGE_POSTGRES], 60_000)).code !== 0) {
    const construction = await docker(
      [
        'build',
        '-f',
        'infra/postgres/Dockerfile',
        '--target',
        'config-embarquee',
        '-t',
        IMAGE_POSTGRES,
        'infra',
      ],
      900_000,
    );
    expect(
      construction.code,
      `La construction de ${IMAGE_POSTGRES} a échoué :\n${construction.sortie}`,
    ).toBe(0);
  }
}, 1_200_000);

afterAll(async () => {
  for (const nom of conteneurs) await docker(['rm', '-f', nom], 120_000);
  for (const nom of volumes) await docker(['volume', 'rm', '-f', nom], 120_000);
  for (const nom of reseaux) await docker(['network', 'rm', nom], 120_000);
}, 600_000);

// =============================================================================
// POSTGRESQL — DÉPÔT → CLUSTER JETABLE → EMPREINTE DU JEU DE RÉFÉRENCE
// =============================================================================
describe('restauration PostgreSQL depuis le dépôt pgBackRest', () => {
  let urlOrigine = '';
  let urlRestauree = '';
  let conteneurRestaure = '';
  /** Volumes de l'origine, réutilisés par le cas « montages du compose ». */
  let volumeDonnees = '';
  let volumeDepot = '';
  let volumeSocket = '';
  /** Volume du cluster RESTAURÉ — relu tel quel par le cas de l'archivage. */
  let volumeRestaurePg = '';

  beforeAll(async () => {
    volumeDonnees = await creerVolume('pg-donnees');
    volumeDepot = await creerVolume('pg-depot');
    volumeSocket = await creerVolume('pg-socket');
    const origine = nommerConteneur('pg-origine');

    // 1. Un cluster de la MÊME image que la pile, avec SA configuration
    //    embarquée : `archive_mode = on`, `archive_command = pgbackrest
    //    archive-push`. Sans elle, il n'y aurait rien à restaurer.
    //
    //    Le SOCKET est un volume nommé, comme dans le compose : c'est la seule
    //    voie de pgBackRest vers le serveur depuis un conteneur séparé, et le
    //    cas « montages du compose » plus bas en dépend.
    expect(
      (
        await docker([
          'run',
          '-d',
          '--name',
          origine,
          '-p',
          '0:5432',
          '-v',
          `${volumeDonnees}:/var/lib/postgresql/data`,
          '-v',
          `${volumeDepot}:/var/lib/pgbackrest`,
          '-v',
          `${volumeSocket}:/var/run/postgresql`,
          '-e',
          'POSTGRES_USER=axion',
          '-e',
          `POSTGRES_PASSWORD=${MOT_DE_PASSE_PG}`,
          '-e',
          'POSTGRES_DB=axion_audit',
          '-e',
          'PGBACKREST_STANZA=axion',
          '-e',
          'PGBACKREST_REPO1_PATH=/var/lib/pgbackrest',
          '-e',
          `PGBACKREST_REPO1_CIPHER_PASS=${PASSPHRASE_DEPOT}`,
          '-e',
          'PGBACKREST_PG1_USER=axion',
          '-e',
          'PGBACKREST_PG1_DATABASE=axion_audit',
          IMAGE_POSTGRES,
          '-c',
          'config_file=/etc/postgresql/postgresql.custom.conf',
        ])
      ).code,
    ).toBe(0);
    // 2. LA STANZA D'ABORD, ET L'ORDRE EST LE FRUIT D'UNE MESURE.
    //
    // La première version de ce fichier attendait le cluster AVANT de créer la
    // stanza. Elle passait seule et ÉCHOUAIT par intermittence quand la suite
    // complète tournait — `n'a jamais offert trois requêtes TCP consécutives`,
    // avec dans le journal du conteneur :
    //     server process (PID …) exited with exit code 103
    //     FATAL: archive command was terminated by signal 3: Quit
    //     all server processes terminated; reinitializing
    //     …
    // MESURÉ le 2026-08-28 sur deux conteneurs jetables lancés côte à côte,
    // 75 secondes chacun, même image, mêmes volumes :
    //     archive_command = `pgbackrest archive-push`, stanza ABSENTE → 2 réinitialisations
    //     archive_command = /bin/true                                → 0 réinitialisation
    // Autrement dit : TANT QUE LA STANZA N'EXISTE PAS, LE CLUSTER SE
    // RÉINITIALISE EN BOUCLE. C'est le phénomène des « 275 réinitialisations en
    // 46 minutes », vu ici en laboratoire. Le défaut appartient à
    // l'ordonnancement de la pile, pas à ce test ; il est remonté au rapport.
    //
    // `axion-stanza-create` n'a PAS besoin d'un serveur vivant (`--no-online` ;
    // il attend seulement `global/pg_control`). On le joue donc EN PREMIER : la
    // boucle de réinitialisation cesse, et l'attente du cluster redevient une
    // mesure de disponibilité au lieu d'une loterie.
    //
    // ⚠ LA REPRISE N'EST PAS UNE POLITESSE. `pgbackrest.conf` porte
    // `archive-async=y` : dès que le cluster démarre, `archive_command` lance un
    // archiveur asynchrone qui prend `/tmp/pgbackrest/axion-archive-1.lock`.
    // `stanza-create` réclame le MÊME verrou et sort alors en 50 (« unable to
    // acquire lock … is another pgBackRest process running? »). Mesuré ici même
    // le 2026-08-28. Ce test reprend jusqu'à ce que le verrou se libère ; le
    // job `createstanza` du compose, lui, n'a AUCUNE reprise et porte
    // `restart: 'no'` — le défaut est remonté au rapport de revue croisée, il
    // n'est pas corrigé ici (un testeur croisé ne corrige pas le code testé).
    let stanza: Resultat = { code: -1, sortie: '' };
    for (let essai = 0; essai < 60; essai += 1) {
      stanza = await docker(['exec', '--user', 'postgres', origine, 'axion-stanza-create']);
      if (stanza.code === 0) break;
      if (!stanza.sortie.includes('unable to acquire lock')) break;
    }
    expect(stanza.code, `axion-stanza-create a échoué :\n${stanza.sortie}`).toBe(0);

    // 3. Le cluster, MAINTENANT que plus rien ne le fait redémarrer.
    await attendreCluster(origine, MOT_DE_PASSE_PG);

    urlOrigine = `postgresql://axion:${MOT_DE_PASSE_PG}@127.0.0.1:${String(await portPublie(origine, 5432))}/axion_audit`;

    // 4. Le schéma et le jeu de référence, par les points d'entrée publics.
    const migrations = await scriptApi('migrations.mjs', [], urlOrigine);
    expect(migrations.code, `migrations.mjs a échoué :\n${migrations.sortie}`).toBe(0);
    const seed = await scriptApi('seed.mjs', [], urlOrigine);
    expect(seed.code, `seed.mjs a échoué :\n${seed.sortie}`).toBe(0);

    // 5. LA SAUVEGARDE, par le script livré — pas par un `pgbackrest backup`
    //    écrit ici. Le jour choisi est celui du jour courant : la passe demande
    //    donc `--type=full`, seul type restaurable sans point de départ.
    const jour = (await docker(['exec', origine, 'date', '-u', '+%w'])).sortie.trim();
    const preparation = await docker([
      'exec',
      '--user',
      'postgres',
      origine,
      'bash',
      '-c',
      // `sleep` qui refuse d'attendre : la passe faite, le script partirait
      // dormir jusqu'au créneau. `pgbackrest`, LUI, N'EST PAS NEUTRALISÉ ICI —
      // c'est tout l'objet de ce fichier.
      'mkdir -p /tmp/minio-simule /tmp/archives /tmp/faux && echo objet > /tmp/minio-simule/o.txt && ' +
        'printf "#!/bin/sh\\nexit 143\\n" > /tmp/faux/sleep && ' +
        `${FAUX_MC} > /tmp/faux/mc && chmod 0755 /tmp/faux/sleep /tmp/faux/mc`,
    ]);
    expect(preparation.code, preparation.sortie).toBe(0);
    const passe = await docker([
      'exec',
      '--user',
      'postgres',
      '-e',
      `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE_ARCHIVES}`,
      '-e',
      'AXION_SAUVEGARDE_TOLERANCE_H=0',
      '-e',
      `AXION_SAUVEGARDE_JOUR_COMPLETE=${jour}`,
      '-e',
      'AXION_MINIO_DONNEES=/tmp/minio-simule',
      '-e',
      'AXION_ARCHIVES=/tmp/archives',
      ...R2_FACTICE.split(' ').flatMap((paire) => ['-e', paire]),
      origine,
      'bash',
      '-c',
      'export PATH=/tmp/faux:$PATH; exec /usr/bin/timeout 300 /usr/local/bin/axion-sauvegarde',
    ]);
    expect(passe.sortie).toContain('--type=full');
    expect(passe.sortie, `La passe de sauvegarde a échoué :\n${passe.sortie}`).toContain(
      'passe terminée avec succès',
    );

    // 6. RESTAURATION sur un volume NEUF, sans réseau, dépôt en LECTURE SEULE :
    //    le test ne peut pas abîmer ce qu'il vérifie (README §5.4).
    const restaure = await creerVolume('pg-restaure');
    volumeRestaurePg = restaure;
    const restauration = await docker([
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      'postgres',
      '-v',
      `${volumeDepot}:/var/lib/pgbackrest:ro`,
      '-v',
      `${restaure}:/var/lib/postgresql/data`,
      '-e',
      `PGBACKREST_REPO1_CIPHER_PASS=${PASSPHRASE_DEPOT}`,
      '--entrypoint',
      'pgbackrest',
      IMAGE_POSTGRES,
      '--stanza=axion',
      '--archive-mode=off',
      '--log-level-console=info',
      'restore',
    ]);
    expect(restauration.code, `pgbackrest restore a échoué :\n${restauration.sortie}`).toBe(0);

    // 7. Démarrage du cluster restauré. `listen_addresses` est forcé sur la
    //    ligne de commande : la configuration de la pile vit HORS de PGDATA
    //    (`-c config_file=…`) et n'est donc pas dans la sauvegarde — un point
    //    d'exploitation qui vaut d'être connu avant d'en avoir besoin.
    conteneurRestaure = nommerConteneur('pg-restaure');
    expect(
      (
        await docker([
          'run',
          '-d',
          '--name',
          conteneurRestaure,
          '-p',
          '0:5432',
          '--user',
          'postgres',
          '-v',
          `${volumeDepot}:/var/lib/pgbackrest:ro`,
          '-v',
          `${restaure}:/var/lib/postgresql/data`,
          '-e',
          `PGBACKREST_REPO1_CIPHER_PASS=${PASSPHRASE_DEPOT}`,
          '--entrypoint',
          '/usr/lib/postgresql/16/bin/postgres',
          IMAGE_POSTGRES,
          '-D',
          '/var/lib/postgresql/data',
          '-c',
          'listen_addresses=*',
        ])
      ).code,
    ).toBe(0);
    await attendreCluster(conteneurRestaure, MOT_DE_PASSE_PG);
    urlRestauree = `postgresql://axion:${MOT_DE_PASSE_PG}@127.0.0.1:${String(await portPublie(conteneurRestaure, 5432))}/axion_audit`;
  }, 1_200_000);

  it('@critique l’empreinte du jeu de référence est IDENTIQUE après restauration', async () => {
    const origine = await scriptApi(
      'empreinte-seed.mjs',
      ['--attendue', EMPREINTE_ATTENDUE],
      urlOrigine,
    );
    expect(
      origine.code,
      `La base d'ORIGINE ne porte déjà pas l'empreinte publiée — la restauration ne\n` +
        `peut alors rien prouver. Sortie :\n${origine.sortie}`,
    ).toBe(0);

    const restauree = await scriptApi(
      'empreinte-seed.mjs',
      ['--attendue', EMPREINTE_ATTENDUE],
      urlRestauree,
    );
    expect(
      restauree.code,
      `Le jeu de référence n'a PAS traversé la sauvegarde à la valeur près.\n` +
        `C'est le critère 07 ligne L0 (« restauration Postgres testée depuis zéro »)\n` +
        `et l'invariant 8. Sortie :\n${restauree.sortie}`,
    ).toBe(0);
    expect(restauree.sortie).toContain(EMPREINTE_ATTENDUE);
  }, 600_000);

  it('@critique une empreinte FAUSSE est refusée — la preuve n’est pas complaisante', async () => {
    // Sans ce cas, `--attendue` pourrait rendre 0 sur n'importe quoi et le cas
    // précédent serait vert sur du vide. C'est exactement le défaut que ce lot a
    // passé sa journée à démonter.
    const fausse = await scriptApi(
      'empreinte-seed.mjs',
      ['--attendue', '00000000000000000000000000000000'],
      urlRestauree,
    );
    expect(fausse.code).not.toBe(0);
  }, 300_000);

  it('@critique le restore a PINÉ `archive_mode=off` — pas hérité du défaut de PostgreSQL', async () => {
    // ATTENTION, PIÈGE MESURÉ. La première version de ce cas se contentait de
    // `SHOW archive_mode` = `off`. Elle restait VERTE quand on retirait
    // `--archive-mode=off` de la commande de restauration — parce que le cluster
    // restauré démarre sans `-c config_file=…`, lit le `postgresql.conf` de PGDATA,
    // et que `archive_mode` y vaut `off` PAR DÉFAUT. Le cas n'assertait donc pas
    // l'effet du drapeau : il assertait un défaut de PostgreSQL, et il aurait été
    // vert sur une procédure de restauration dangereuse.
    //
    // Ce qui dépend RÉELLEMENT du drapeau est la ligne que pgBackRest écrit dans
    // `postgresql.auto.conf` du volume restauré. On assert donc les deux : la
    // trace ÉCRITE par le restore, et l'effet observable sur le serveur.
    const auto = await docker([
      'run',
      '--rm',
      '-v',
      `${volumeRestaurePg}:/pgdata:ro`,
      '--entrypoint',
      'cat',
      IMAGE_POSTGRES,
      '/pgdata/postgresql.auto.conf',
    ]);
    expect(auto.code, `postgresql.auto.conf illisible :\n${auto.sortie}`).toBe(0);
    expect(
      auto.sortie,
      'Le restore n’a pas figé `archive_mode` : sans ce réglage écrit par\n' +
        '`--archive-mode=off`, un cluster de test démarré avec la configuration de la\n' +
        'pile pousserait ses propres WAL dans le dépôt qu’il vient de lire (README §5.4).\n' +
        `Contenu de postgresql.auto.conf :\n${auto.sortie}`,
    ).toMatch(/archive_mode\s*=\s*'?off'?/);

    const { code, sortie } = await docker([
      'exec',
      conteneurRestaure,
      'psql',
      '-U',
      'axion',
      '-d',
      'axion_audit',
      '-tAc',
      'SHOW archive_mode',
    ]);
    expect(code).toBe(0);
    expect(sortie.trim()).toBe('off');
  }, 300_000);

  // ---------------------------------------------------------------------------
  // LE CAS QUE PERSONNE N'AVAIT JOUÉ — la passe telle que le COMPOSE la monte.
  //
  // Toutes les passes éprouvées jusqu'ici tournent DANS le conteneur du serveur,
  // qui écrit son propre répertoire de données. Le compose, lui, fait tourner la
  // sauvegarde dans un conteneur SÉPARÉ où `postgres_data` est monté `:ro`, où
  // la seule voie vers le serveur est le socket partagé, et où le volume
  // d'archives est un volume nommé neuf. Rien ne prouvait que `pgbackrest
  // backup` sait travailler dans ces conditions : si pgBackRest avait besoin
  // d'écrire un seul octet dans PGDATA, la panne n'apparaîtrait qu'en
  // production, la nuit, et le service serait `Restarting` sans qu'on sache
  // pourquoi.
  //
  // Ce cas rejoue les QUATRE montages du service `sauvegarde` du compose, avec
  // leurs modes exacts, et sans réseau — puisque le socket suffit.
  // ---------------------------------------------------------------------------
  it('@critique la passe réussit avec `postgres_data` en LECTURE SEULE, comme le compose la monte', async () => {
    const archives = await creerVolume('sauvegarde-archives');
    const minioSimule = await creerVolume('minio-simule');

    // Un volume MinIO simulé, rempli par un conteneur jetable : le service le
    // monte ensuite en LECTURE SEULE, exactement comme le compose.
    const remplissage = await docker([
      'run',
      '--rm',
      '-v',
      `${minioSimule}:/donnees`,
      '--entrypoint',
      'bash',
      IMAGE_POSTGRES,
      '-c',
      'mkdir -p /donnees/seau && echo objet > /donnees/seau/o.txt',
    ]);
    expect(remplissage.code, remplissage.sortie).toBe(0);

    const passe = await docker([
      'run',
      '--rm',
      // Aucun réseau : le socket UNIX est la seule voie, et le compose ne lui
      // en demande pas d'autre. Si ce cas passe sans réseau, la promesse tient.
      '--network',
      'none',
      '--user',
      'postgres',
      '-v',
      `${volumeDonnees}:/var/lib/postgresql/data:ro`,
      '-v',
      `${volumeDepot}:/var/lib/pgbackrest`,
      '-v',
      `${volumeSocket}:/var/run/postgresql`,
      '-v',
      `${minioSimule}:/minio-donnees:ro`,
      '-v',
      `${archives}:/sauvegarde`,
      '-e',
      'PGBACKREST_STANZA=axion',
      '-e',
      'PGBACKREST_REPO1_PATH=/var/lib/pgbackrest',
      '-e',
      `PGBACKREST_REPO1_CIPHER_PASS=${PASSPHRASE_DEPOT}`,
      '-e',
      'PGBACKREST_PG1_USER=axion',
      '-e',
      'PGBACKREST_PG1_DATABASE=axion_audit',
      '-e',
      `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE_ARCHIVES}`,
      '-e',
      'AXION_SAUVEGARDE_TOLERANCE_H=0',
      ...R2_FACTICE.split(' ').flatMap((paire) => ['-e', paire]),
      '--entrypoint',
      'bash',
      IMAGE_POSTGRES,
      '-c',
      'mkdir -p /tmp/faux && printf "#!/bin/sh\\nexit 143\\n" > /tmp/faux/sleep && ' +
        `${FAUX_MC} > /tmp/faux/mc && ` +
        'chmod 0755 /tmp/faux/sleep /tmp/faux/mc && export PATH=/tmp/faux:$PATH && ' +
        'exec /usr/bin/timeout 600 /usr/local/bin/axion-sauvegarde',
    ]);

    expect(
      passe.sortie,
      'La passe échoue avec les montages RÉELS du service `sauvegarde`. Aucun test ne\n' +
        'couvrait cette configuration : toutes les autres passes tournent dans le\n' +
        'conteneur du serveur, où le répertoire de données est accessible en écriture.\n' +
        `Sortie complète :\n${passe.sortie}`,
    ).toContain('passe terminée avec succès');

    // Les deux moitiés du critère L0 sont bien là : une sauvegarde pgBackRest
    // DE PLUS dans le dépôt, et une archive MinIO chiffrée dans le volume neuf.
    expect(passe.sortie).toMatch(/--type=(full|incr)/);
    const contenuArchives = await docker([
      'run',
      '--rm',
      '-v',
      `${archives}:/sauvegarde:ro`,
      '--entrypoint',
      'ls',
      IMAGE_POSTGRES,
      '-A',
      '/sauvegarde',
    ]);
    expect(contenuArchives.sortie).toMatch(/minio-\d{8}T\d{6}Z\.tar\.zst\.gpg\b/);
    expect(contenuArchives.sortie).toContain('.derniere-passe');
  }, 900_000);
});

// =============================================================================
// MINIO — VOLUME → ARCHIVE CHIFFRÉE → VOLUME NEUF → MINIO NEUF
// =============================================================================
describe('restauration MinIO depuis l’archive chiffrée du volume', () => {
  const OBJETS: readonly { readonly chemin: string; readonly octets: number }[] = [
    { chemin: 'axion-attachments/piece.bin', octets: 1_048_576 },
    { chemin: 'axion-reports/rapport.txt', octets: 4_096 },
    { chemin: 'axion-templates/modele.bin', octets: 262_144 },
  ];

  let empreintesOrigine: Readonly<Record<string, string>> = {};
  let reseau = '';

  /** Exécute un script `mc` contre le MinIO joignable sous `hote` dans `reseau`. */
  async function mc(hote: string, script: string): Promise<Resultat> {
    return docker([
      'run',
      '--rm',
      '--network',
      reseau,
      '--entrypoint',
      'sh',
      IMAGE_MC,
      '-c',
      `set -eu\nmc --quiet alias set s "http://${hote}:9000" "${MINIO_UTILISATEUR}" "${MINIO_MOT_DE_PASSE}" >/dev/null\n${script}`,
    ]);
  }

  /** Lit les lignes « EMPREINTE <chemin> <sha256> » produites par `mc`. */
  function empreintes(sortie: string): Record<string, string> {
    const table: Record<string, string> = {};
    for (const ligne of sortie.split('\n')) {
      const trouve = /^EMPREINTE\s+(\S+)\s+([0-9a-f]{64})\s*$/.exec(ligne.trim());
      if (trouve?.[1] !== undefined && trouve[2] !== undefined) table[trouve[1]] = trouve[2];
    }
    return table;
  }

  async function demarrerMinio(role: string, volume: string): Promise<string> {
    const nom = nommerConteneur(role);
    expect(
      (
        await docker([
          'run',
          '-d',
          '--name',
          nom,
          '--network',
          reseau,
          '--network-alias',
          role,
          '-v',
          `${volume}:/data`,
          '-e',
          `MINIO_ROOT_USER=${MINIO_UTILISATEUR}`,
          '-e',
          `MINIO_ROOT_PASSWORD=${MINIO_MOT_DE_PASSE}`,
          IMAGE_MINIO,
          'server',
          '/data',
        ])
      ).code,
    ).toBe(0);
    await attendre(nom, ['mc', '--version'], 5);
    // La sonde du compose interroge `/minio/health/live` ; ici on attend que
    // `mc` puisse réellement parler au serveur — c'est plus fort qu'un port
    // ouvert, et c'est la leçon du `pg_isready` menteur du 2026-08-28.
    for (let i = 0; i < 60; i += 1) {
      if ((await mc(role, 'mc ls s >/dev/null')).code === 0) return nom;
    }
    const journal = await docker(['logs', '--tail', '40', nom], 60_000);
    throw new Error(`${nom} n'a jamais répondu à \`mc ls\`.\n\n${journal.sortie}`);
  }

  beforeAll(async () => {
    for (const image of [IMAGE_MINIO, IMAGE_MC]) {
      if ((await docker(['image', 'inspect', image], 60_000)).code !== 0) {
        const tirage = await docker(['pull', image], 900_000);
        expect(tirage.code, `\`docker pull ${image}\` a échoué :\n${tirage.sortie}`).toBe(0);
      }
    }

    reseau = await creerReseau('minio-reseau');
    const volumeOrigine = await creerVolume('minio-origine');
    await demarrerMinio('minio-origine', volumeOrigine);

    // Un jeu d'objets connu ET trois réglages NON PAR DÉFAUT, qui ne peuvent pas
    // réapparaître seuls sur un MinIO neuf : versioning, politique anonyme, et
    // un compte de service. Ce sont eux qui distinguent l'archive du volume d'un
    // simple `mc mirror` (README §5.5).
    const mise = await mc(
      'minio-origine',
      [
        'mc mb --ignore-existing s/axion-attachments s/axion-reports s/axion-templates',
        'mc version enable s/axion-attachments',
        'mc anonymous set download s/axion-reports',
        'mc anonymous set none s/axion-attachments',
        `mc admin user add s compte-applicatif-factice ${MINIO_MOT_DE_PASSE}`,
        'mc admin policy attach s readwrite --user compte-applicatif-factice',
        ...OBJETS.map(
          ({ chemin, octets }) =>
            `head -c ${String(octets)} /dev/urandom > /tmp/objet && mc cp --quiet /tmp/objet s/${chemin} >/dev/null && echo "EMPREINTE ${chemin} $(sha256sum /tmp/objet | cut -d" " -f1)"`,
        ),
      ].join('\n'),
    );
    expect(mise.code, `Mise en place du MinIO d'origine impossible :\n${mise.sortie}`).toBe(0);
    empreintesOrigine = empreintes(mise.sortie);
    expect(Object.keys(empreintesOrigine)).toHaveLength(OBJETS.length);

    // Le serveur est ARRÊTÉ avant l'archive : la copie du volume est « cohérente
    // au crash » et non transactionnelle (README §5.5). Arrêter rend le test
    // déterministe ; c'est le seul écart avec l'exploitation, et il est nommé.
    expect((await docker(['stop', `axion-l0-minio-origine-${SUFFIXE}`], 120_000)).code).toBe(0);

    // ARCHIVE — par le script livré, avec `pgbackrest` neutralisé : cette moitié
    // de la passe a son propre fichier de tests, et aucun cluster ne vit ici.
    const archives = await creerVolume('minio-archives');
    const archivage = await docker([
      'run',
      '--rm',
      '-v',
      `${volumeOrigine}:/minio-donnees:ro`,
      '-v',
      `${archives}:/sauvegarde`,
      '-e',
      `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE_ARCHIVES}`,
      '-e',
      'AXION_SAUVEGARDE_TOLERANCE_H=0',
      '--entrypoint',
      'bash',
      IMAGE_POSTGRES,
      '-c',
      [
        // `pgbackrest` neutralisé (aucun cluster ici) et `sleep` qui refuse
        // d'attendre : sans ce second stub, le script partirait dormir jusqu'à
        // 02h30 après sa passe et le test attendrait avec lui. `sleep` n'est
        // appelé que par la boucle de planification.
        'mkdir -p /opt/faux',
        'printf "#!/bin/sh\\nexit 0\\n" > /opt/faux/pgbackrest',
        'printf "#!/bin/sh\\nexit 143\\n" > /opt/faux/sleep',
        `${FAUX_MC} > /opt/faux/mc`,
        'chmod 0755 /opt/faux/pgbackrest /opt/faux/sleep /opt/faux/mc',
        'chown -R postgres:postgres /sauvegarde',
        'su postgres -s /bin/bash -c ' +
          `'PATH=/opt/faux:$PATH AXION_ARCHIVES=/sauvegarde AXION_MINIO_DONNEES=/minio-donnees ` +
          `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE_ARCHIVES} AXION_SAUVEGARDE_TOLERANCE_H=0 ` +
          `${R2_FACTICE} ` +
          `/usr/bin/timeout 300 /usr/local/bin/axion-sauvegarde'`,
      ].join(' && '),
    ]);
    expect(archivage.sortie, `L'archivage MinIO a échoué :\n${archivage.sortie}`).toContain(
      'passe terminée avec succès',
    );

    // RESTAURATION dans un volume NEUF — la chaîne inverse, rien d'autre.
    const volumeRestaure = await creerVolume('minio-restaure');
    const restauration = await docker([
      'run',
      '--rm',
      '-v',
      `${archives}:/sauvegarde:ro`,
      '-v',
      `${volumeRestaure}:/restaure`,
      '--entrypoint',
      'bash',
      IMAGE_POSTGRES,
      '-c',
      'set -euo pipefail; archive=$(ls /sauvegarde/minio-*.tar.zst.gpg | tail -1); ' +
        `gpg --batch --quiet --decrypt --passphrase '${PASSPHRASE_ARCHIVES}' --pinentry-mode loopback "$archive" ` +
        '| zstd -d -q | tar -C /restaure -xf -; ls -A /restaure',
    ]);
    expect(restauration.code, `La restauration MinIO a échoué :\n${restauration.sortie}`).toBe(0);
    expect(restauration.sortie).toContain('.minio.sys');

    await demarrerMinio('minio-restaure', volumeRestaure);
  }, 1_800_000);

  it('@critique les objets reviennent à l’octet près (sha256 identiques)', async () => {
    const releve = await mc(
      'minio-restaure',
      OBJETS.map(
        ({ chemin }) =>
          `mc cat s/${chemin} > /tmp/objet && echo "EMPREINTE ${chemin} $(sha256sum /tmp/objet | cut -d' ' -f1)"`,
      ).join('\n'),
    );
    expect(releve.code, `Relecture des objets impossible :\n${releve.sortie}`).toBe(0);
    expect(empreintes(releve.sortie)).toEqual(empreintesOrigine);
  }, 600_000);

  it('@critique le versioning survit à la restauration', async () => {
    // `mc mirror` le PERDAIT (README §5.5). C'est la propriété qui a décidé du
    // design : une sauvegarde qui oblige à se souvenir d'un réglage le perdra.
    const { code, sortie } = await mc('minio-restaure', 'mc version info s/axion-attachments');
    expect(code, sortie).toBe(0);
    expect(sortie.toLowerCase()).toContain('enabled');
  }, 300_000);

  it('@critique les politiques d’accès survivent — la publique comme la privée', async () => {
    // `--json` et non la sortie humaine : `mc` tronque et met en forme ses
    // colonnes selon la largeur du terminal. Un test qui lit une colonne tronquée
    // est un test qui rougira le jour où quelqu'un renomme un bucket.
    // MinIO nomme `private` l'absence d'accès anonyme, y compris après un
    // `mc anonymous set none` — c'est la valeur que pose le job `createbuckets`.
    const publique = await mc('minio-restaure', 'mc --json anonymous get s/axion-reports');
    expect(publique.code, publique.sortie).toBe(0);
    expect(publique.sortie).toContain('"permission":"download"');

    const privee = await mc('minio-restaure', 'mc --json anonymous get s/axion-attachments');
    expect(privee.code, privee.sortie).toBe(0);
    expect(privee.sortie).toContain('"permission":"private"');
    expect(privee.sortie).not.toContain('download');
  }, 300_000);

  it('@critique les comptes de service reviennent avec le volume (`.minio.sys`)', async () => {
    const { code, sortie } = await mc('minio-restaure', 'mc --json admin user list s');
    expect(code, sortie).toBe(0);
    expect(sortie).toContain('"accessKey":"compte-applicatif-factice"');
    expect(sortie).toContain('"userStatus":"enabled"');
  }, 300_000);
});
