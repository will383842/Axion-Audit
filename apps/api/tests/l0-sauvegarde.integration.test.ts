// =============================================================================
// TESTS DE LA CHAÎNE DE SAUVEGARDE — `infra/postgres/sauvegarde.sh`,
// son point de montage dans `infra/postgres/Dockerfile`, et les montages du
// service `sauvegarde` dans `infra/docker-compose.coolify.yml`.
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI IL N'EST PAS D'A59.
// 09 §5.6 : « le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé ». A59 a livré la chaîne et l'a jouée de bout en bout ; il n'a écrit
// aucun test, volontairement. Ce fichier est écrit par A18, test croisé, qui n'a
// produit aucune ligne de `sauvegarde.sh`.
//
// -----------------------------------------------------------------------------
// COMMENT LE SCRIPT EST ÉPROUVÉ — LE FICHIER LIVRÉ, JAMAIS UNE COPIE
// -----------------------------------------------------------------------------
// Un conteneur JETABLE est démarré depuis l'image du projet (cible
// `config-embarquee`, celle que déploie la pile Coolify) et sert de banc pour
// tous les cas : chaque cas est un `docker exec` sur ce conteneur, avec SON
// répertoire d'archives, SES variables d'environnement. Le script exécuté est
// `/usr/local/bin/axion-sauvegarde`, c'est-à-dire le fichier du dépôt copié par
// le Dockerfile — un test vérifie d'ailleurs qu'il en est l'empreinte exacte.
// Rien n'est modifié dans `infra/`.
//
// ⚠️ CE QUE CE FICHIER NE COUVRE PAS, ET IL FAUT LE LIRE AVANT DE S'Y FIER.
// Depuis le 2026-08-28, `sauvegarde.sh` a une SECONDE moitié : l'expédition des
// copies vers Cloudflare R2 (`expedier_r2`). AUCUN cas de ce fichier ne
// l'éprouve : `mc` y est NEUTRALISÉ, exactement comme `pgbackrest`, et un `mc`
// neutralisé ne prouve rien sur R2 — ni le miroir, ni le garde-fou du
// `--remove`, ni le masquage de l'endpoint dans les journaux, ni la relecture de
// contrôle. Tout ce que ce fichier garde est la MOITIÉ LOCALE : archive, tube,
// rotation, permissions, rattrapage, garde-fous d'entrée. L'expédition est la
// plus grande surface non testée de ce lot ; elle est remontée comme telle.
//
// QUATRE SUBSTITUTIONS, ET ELLES SONT NOMMÉES :
//   · `pgbackrest` est remplacé par un exécutable factice placé EN TÊTE de
//     `PATH`. La moitié PostgreSQL de la passe a son propre fichier
//     (`l0-restauration.integration.test.ts`) où elle tourne pour de vrai, dépôt
//     compris ; ici on éprouve la moitié MinIO, la rotation et les garde-fous,
//     qui n'ont aucune raison d'exiger un cluster.
//   · `AXION_SAUVEGARDE_TOLERANCE_H=0` force le rattrapage à chaque démarrage :
//     c'est ce qui permet de jouer UNE passe par invocation au lieu d'attendre
//     02h30. Le mécanisme de rattrapage lui-même est éprouvé séparément, avec sa
//     valeur par défaut.
//   · `mc` est remplacé par un exécutable qui PRÉTEND que l'expédition R2 a
//     réussi (il rend 0 et fait mine de lister un objet distant). Il est là pour
//     que la moitié LOCALE puisse être observée jusqu'au bout, pas pour prouver
//     quoi que ce soit sur R2 — voir l'avertissement ci-dessus. La relecture de
//     contrôle est désactivée par le réglage prévu par le script lui-même
//     (`AXION_R2_VERIFIER_RELECTURE=non`), pas par un contournement.
//   · `sleep` est remplacé par un exécutable qui REFUSE d'attendre. Le script ne
//     rend jamais la main quand tout va bien : sa passe faite, il entre dans la
//     boucle de planification et dort jusqu'au créneau. `sleep` n'apparaît qu'à
//     CET endroit du script ; le stub le fait donc sortir immédiatement APRÈS sa
//     passe, par `set -e`, sans rien changer à ce qui est sauvegardé. Sans cette
//     substitution, chaque cas vert coûterait la durée du `timeout` — et une
//     suite qui dure une demi-heure finit par ne plus être exécutée.
//
// CONSÉQUENCE À CONNAÎTRE : une passe RÉUSSIE ne rend donc jamais 0. Les cas
// « la passe réussit » s'assertent sur les ARTEFACTS (archives, empreintes,
// marqueur, journal), jamais sur un code de sortie qui n'existe pas. Les cas
// « le script refuse de démarrer », eux, exigent bien EXIT=1 : ils sortent avant
// la boucle.
//
// DOCKER ABSENT = ÉCHEC EXPLICITE, jamais un `skip` (09 §5.7, DoD transverse :
// « tous les tests verts, AUCUN test skippé »). Une chaîne de sauvegarde qu'on
// n'a pas pu éprouver n'est pas une chaîne de sauvegarde éprouvée.
//
// Traçabilité : invariant 8 · 02 §11.4 · 07 ligne L0 · 09 §5.6.
// =============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..', '..', '..');
const IMAGE = 'axion-audit-postgres:16-coolify';
const CONTENEUR = `axion-l0-sauvegarde-${String(process.pid)}`;

/** Répertoire des exécutables factices, en tête de `PATH` dans chaque cas. */
const FAUX = '/opt/faux';
/** Volume de données MinIO simulé — un répertoire suffit, le script lit un chemin. */
const DONNEES_MINIO = '/minio-donnees';
/** Système de fichiers volontairement minuscule : le disque qui se remplit. */
const PETIT_DISQUE = '/petit-disque';

/** Secrets FACTICES (11 §2 : aucune valeur réelle dans un fichier versionné). */
const PASSPHRASE = 'passphrase-factice-de-test';

/**
 * Paramètres d'expédition R2, FACTICES eux aussi. Le script REFUSE de démarrer
 * si l'un des quatre manque : sans eux, aucun cas de ce fichier n'atteindrait
 * seulement la moitié locale. La relecture de contrôle est coupée par le réglage
 * documenté du script, pas par une astuce de test.
 */
const R2_FACTICE: Readonly<Record<string, string>> = {
  BACKUP_R2_BUCKET: 'seau-factice-de-test',
  BACKUP_R2_ENDPOINT: 'compte-factice.r2.cloudflarestorage.com',
  BACKUP_R2_ACCESS_KEY: 'acces-factice-de-test',
  BACKUP_R2_SECRET_KEY: 'secret-factice-de-test',
  AXION_R2_VERIFIER_RELECTURE: 'non',
};

interface Resultat {
  readonly code: number;
  readonly sortie: string;
}

/**
 * Rend un flux de `spawnSync` sous forme de chaîne, quoi qu'il arrive.
 *
 * Les types de `spawnSync` avec `encoding: 'utf8'` annoncent `string`, si bien
 * que `resultat.stdout ?? ''` — la forme du fichier hérité — était refusée par
 * `@typescript-eslint/no-unnecessary-condition` et rendait `pnpm lint` ROUGE.
 * Le supprimer sans filet serait pire : un processus TUÉ (dépassement de délai)
 * rend bel et bien `null` à l'exécution, et l'on afficherait « null » dans le
 * message d'un test en échec — c'est-à-dire au moment précis où l'on a besoin de
 * lire la vraie sortie. Le contrôle se fait donc sur la VALEUR, pas sur le type.
 */
function fluxTexte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

// -----------------------------------------------------------------------------
// Pilotage de Docker
// -----------------------------------------------------------------------------

function docker(arguments_: readonly string[], delaiMs = 300_000): Resultat {
  const resultat = spawnSync('docker', [...arguments_], {
    encoding: 'utf8',
    timeout: delaiMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (resultat.error !== undefined) {
    throw new Error(
      `\`docker ${arguments_.slice(0, 3).join(' ')}…\` n'a pas pu être lancé.\n` +
        `Le contrat 11 §1 épingle Testcontainers et une pile Docker : la chaîne de\n` +
        `sauvegarde ne peut être éprouvée qu'en exécution. Docker est donc REQUIS,\n` +
        `et son absence est un ÉCHEC, pas un motif de skip (09 §5.7).\n\n` +
        `Cause : ${resultat.error.message}`,
    );
  }
  return {
    code: resultat.status ?? -1,
    sortie: `${fluxTexte(resultat.stdout)}${fluxTexte(resultat.stderr)}`,
  };
}

/**
 * MÊME CHOSE, MAIS SANS RETENIR LA BOUCLE D'ÉVÉNEMENTS — et ce n'est pas un
 * confort de style.
 *
 * MESURÉ le 2026-08-28 (fichier `zz-mesure-rpc`, jeté après mesure) : UN SEUL
 * appel synchrone qui retient le processus plus de ~60 s empêche le worker
 * vitest de répondre à son RPC. Vitest lève alors
 * « [vitest-worker]: Timeout calling "onTaskUpdate" », compte une « unhandled
 * error » et LA SUITE SORT EN 1 — alors que tous les cas sont verts. C'est
 * exactement le genre de vert menteur que ce lot démonte, à l'envers.
 *
 * `docker build` à froid (installation de pgBackRest comprise) dépasse largement
 * cette minute. Les `docker exec` du banc, eux, se comptent en secondes : ils
 * restent synchrones, parce que rien n'exige de les compliquer.
 */
async function dockerLong(arguments_: readonly string[]): Promise<Resultat> {
  return new Promise<Resultat>((resoudre, rejeter) => {
    const processus = spawn('docker', [...arguments_], { windowsHide: true });
    let sortie = '';
    processus.stdout.on('data', (morceau: Buffer) => (sortie += morceau.toString('utf8')));
    processus.stderr.on('data', (morceau: Buffer) => (sortie += morceau.toString('utf8')));
    processus.on('error', (erreur: Error) => {
      rejeter(
        new Error(
          `\`docker ${arguments_.slice(0, 3).join(' ')}…\` n'a pas pu être lancé.\n` +
            `Docker est REQUIS, et son absence est un ÉCHEC, pas un motif de skip (09 §5.7).\n\n` +
            `Cause : ${erreur.message}`,
        ),
      );
    });
    processus.on('close', (code: number | null) => {
      resoudre({ code: code ?? -1, sortie });
    });
  });
}

/**
 * Exécute une commande `bash` dans le conteneur de banc, sous l'utilisateur
 * `postgres` — celui que le compose impose au service `sauvegarde`. `PATH` est
 * préfixé par les exécutables factices ; le reste de l'environnement est passé
 * tel quel.
 */
function dansConteneur(
  commande: string,
  environnement: Readonly<Record<string, string>> = {},
  utilisateur = 'postgres',
): Resultat {
  const variables: string[] = [];
  for (const [cle, valeur] of Object.entries(environnement)) {
    variables.push('-e', `${cle}=${valeur}`);
  }
  return docker([
    'exec',
    '--user',
    utilisateur,
    ...variables,
    CONTENEUR,
    'bash',
    '-c',
    `export PATH=${FAUX}:$PATH; ${commande}`,
  ]);
}

/**
 * Joue UNE passe du script livré et rend le journal complet.
 * `timeout` est indispensable : une passe réussie enchaîne sur la boucle de
 * planification, qui ne rend jamais la main.
 */
function jouerUnePasse(
  archives: string,
  environnement: Readonly<Record<string, string>> = {},
  secondes = 60,
): Resultat {
  return dansConteneur(`timeout ${String(secondes)} /usr/local/bin/axion-sauvegarde 2>&1`, {
    BACKUP_ENCRYPTION_PASSPHRASE: PASSPHRASE,
    AXION_SAUVEGARDE_TOLERANCE_H: '0',
    AXION_ARCHIVES: archives,
    ...R2_FACTICE,
    ...environnement,
  });
}

/** Contenu d'un répertoire du conteneur, une entrée par ligne, trié. */
function contenu(chemin: string): string[] {
  const { sortie } = dansConteneur(`ls -A ${chemin} 2>/dev/null | sort`);
  return sortie
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** Prépare un répertoire d'archives vierge et rend son chemin. */
let compteurRepertoires = 0;
function repertoireNeuf(): string {
  compteurRepertoires += 1;
  const chemin = `/tmp/archives-${String(compteurRepertoires)}`;
  dansConteneur(`rm -rf ${chemin} && mkdir -p ${chemin}`);
  return chemin;
}

// -----------------------------------------------------------------------------
// Banc
// -----------------------------------------------------------------------------

beforeAll(async () => {
  const version = docker(['version', '--format', '{{.Server.Version}}'], 60_000);
  if (version.code !== 0) {
    throw new Error(
      `Le démon Docker ne répond pas — la chaîne de sauvegarde ne peut pas être\n` +
        `éprouvée. C'est un ÉCHEC de la suite, pas un skip (09 §5.7).\n\n${version.sortie}`,
    );
  }

  // L'image est construite si elle manque : la suite doit être autoportante sur
  // un clone neuf (11 §1), exactement comme les tests Testcontainers du lot L1.
  // Contexte `infra/` et cible `config-embarquee` — les deux conventions de
  // construction que le Dockerfile documente et qu'il ne faut pas confondre.
  if (docker(['image', 'inspect', IMAGE], 60_000).code !== 0) {
    const construction = await dockerLong([
      'build',
      '-f',
      'infra/postgres/Dockerfile',
      '--target',
      'config-embarquee',
      '-t',
      IMAGE,
      'infra',
    ]);
    expect(
      construction.code,
      `La construction de ${IMAGE} a échoué :\n${construction.sortie}`,
    ).toBe(0);
  }

  docker(['rm', '-f', CONTENEUR], 60_000);
  const demarrage = docker([
    'run',
    '-d',
    '--name',
    CONTENEUR,
    // Un système de fichiers de 1 Mo, pour éprouver un disque qui se remplit
    // PENDANT l'écriture. `--tmpfs` ne demande aucun privilège, contrairement à
    // un `mount` depuis le conteneur.
    '--tmpfs',
    `${PETIT_DISQUE}:rw,size=1m`,
    '--entrypoint',
    'bash',
    IMAGE,
    '-c',
    'sleep 3600',
  ]);
  expect(demarrage.code, `Démarrage du banc impossible :\n${demarrage.sortie}`).toBe(0);

  // Préparation, EN ROOT : un faux `pgbackrest` en tête de PATH, et un volume de
  // données MinIO simulé appartenant à `postgres`.
  const preparation = docker([
    'exec',
    '--user',
    'root',
    CONTENEUR,
    'bash',
    '-c',
    [
      `mkdir -p ${FAUX} ${DONNEES_MINIO}/dossier`,
      `printf '#!/bin/sh\\necho "faux pgbackrest: $*"\\nexit 0\\n' > ${FAUX}/pgbackrest`,
      // `sleep` qui refuse d'attendre : il n'apparaît que dans la boucle de
      // planification, sa sortie non nulle termine le script juste après sa
      // passe (`set -e`). Le code 143 est celui d'un `sleep` interrompu — il se
      // lit comme tel dans le journal.
      `printf '#!/bin/sh\\nexit 143\\n' > ${FAUX}/sleep`,
      // `mc` NEUTRALISÉ : il rend 0 et, pour un `ls`, fait mine de voir un objet
      // distant — c'est ce que `expedier_r2` compte pour se déclarer réussie.
      // Il ne prouve RIEN sur R2 (avertissement en tête de fichier).
      `printf '#!/bin/sh\\nfor a in "$@"; do [ "$a" = ls ] && { echo "[faux mc] 1B objet-factice"; break; }; done\\nexit 0\\n' > ${FAUX}/mc`,
      `chmod 0755 ${FAUX}/pgbackrest ${FAUX}/sleep ${FAUX}/mc`,
      `head -c 65536 /dev/urandom > ${DONNEES_MINIO}/dossier/objet.bin`,
      `printf 'repere\\n' > ${DONNEES_MINIO}/repere.txt`,
      `chown -R postgres:postgres ${DONNEES_MINIO}`,
      `chown postgres:postgres ${PETIT_DISQUE}`,
    ].join(' && '),
  ]);
  expect(preparation.code, `Préparation du banc impossible :\n${preparation.sortie}`).toBe(0);
}, 900_000);

/**
 * RENDRE LA MAIN À LA BOUCLE D'ÉVÉNEMENTS ENTRE DEUX CAS — ce n'est pas une
 * précaution de style, c'est le correctif d'un défaut MESURÉ.
 *
 * Le worker vitest dialogue avec le processus principal par un RPC dont la
 * tolérance est d'environ 60 s. Les `docker exec` de ce banc sont SYNCHRONES :
 * chacun est court (0,4 à 7 s), mais quarante-trois cas enchaînés sans un seul
 * tour de boucle forment une seule plage de blocage de plus d'une minute. Le RPC
 * expire, vitest compte une « unhandled error », et LA SUITE SORT EN 1 avec
 * quarante-trois cas verts affichés :
 *
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *     Tests 43 passed (43)   Errors 1 error        →  exit 1
 *
 * Un tour de boucle entre deux cas suffit : la réponse du RPC est alors traitée,
 * et la plus longue plage de blocage redevient celle d'un cas — sept secondes.
 * Le fichier jumeau (restauration) résout le même problème autrement, parce que
 * là-bas UN SEUL appel dépasse la minute : il pilote Docker en asynchrone.
 */
afterEach(async () => {
  await new Promise((resoudre) => setTimeout(resoudre, 0));
});

afterAll(() => {
  docker(['rm', '-f', CONTENEUR], 120_000);
});

// =============================================================================
// 1. LES CONTRÔLES D'ENTRÉE — un paramètre absurde sort en 1, EN FRANÇAIS
//
// Ce que ces cas gardent n'est pas le message : c'est le fait qu'un paramètre
// invalide ARRÊTE le service au lieu de produire une sauvegarde à moitié définie.
// Chacun a été vu ROUGE en retirant le `case`/`[ … ]` correspondant d'une copie
// du script dans le conteneur (voir le rapport de revue croisée) : sans son
// garde-fou, le script continue et écrit une archive.
// =============================================================================
describe('sauvegarde.sh — contrôles d’entrée', () => {
  it('@critique refuse une passphrase vide plutôt que d’archiver en clair', () => {
    const { code, sortie } = jouerUnePasse(repertoireNeuf(), {
      BACKUP_ENCRYPTION_PASSPHRASE: '',
    });
    expect(sortie).toContain('ECHEC SAUVEGARDE —');
    expect(sortie).toContain('BACKUP_ENCRYPTION_PASSPHRASE');
    expect(sortie).toContain('en clair');
    expect(code).toBe(1);
  });

  // La valeur VIDE n'est pas testée ici, et c'est délibéré : `${VAR:-défaut}`
  // traite « vide » comme « absent » et retombe sur 02:30. C'est la sémantique
  // usuelle du shell, pas un défaut.
  it.each([
    ['2h30', 'un séparateur qui n’est pas `:`'],
    ['02:60', 'des minutes hors plage'],
    ['minuit', 'un libellé au lieu d’une heure'],
    ['2:30', 'une heure sur un seul chiffre'],
  ])('refuse AXION_SAUVEGARDE_HEURE=%j (%s)', (heure) => {
    const { code, sortie } = jouerUnePasse(repertoireNeuf(), {
      AXION_SAUVEGARDE_HEURE: heure,
    });
    expect(sortie).toContain('ECHEC SAUVEGARDE —');
    expect(sortie).toContain('AXION_SAUVEGARDE_HEURE');
    expect(sortie).toContain('HH:MM');
    expect(code).toBe(1);
  });

  it.each([['7'], ['-1'], ['dimanche'], ['00']])(
    'refuse AXION_SAUVEGARDE_JOUR_COMPLETE=%j (hors 0..6)',
    (jour) => {
      const { code, sortie } = jouerUnePasse(repertoireNeuf(), {
        AXION_SAUVEGARDE_JOUR_COMPLETE: jour,
      });
      expect(sortie).toContain('ECHEC SAUVEGARDE —');
      expect(sortie).toContain('AXION_SAUVEGARDE_JOUR_COMPLETE');
      expect(sortie).toContain('0..6');
      expect(code).toBe(1);
    },
  );

  it('refuse de démarrer si le volume de données MinIO n’est pas monté', () => {
    const { code, sortie } = jouerUnePasse(repertoireNeuf(), {
      AXION_MINIO_DONNEES: '/volume-absent',
    });
    expect(sortie).toContain('ECHEC SAUVEGARDE —');
    expect(sortie).toContain('/volume-absent');
    expect(sortie).toContain("n'est pas monté");
    expect(code).toBe(1);
  });

  it('@critique refuse d’écrire quand la marge disque exigée n’est pas tenue — et N’ÉCRIT RIEN', () => {
    const archives = repertoireNeuf();
    const { code, sortie } = jouerUnePasse(archives, {
      AXION_ARCHIVES_MARGE_MO: '999999999',
    });
    expect(sortie).toContain('ECHEC SAUVEGARDE —');
    expect(sortie).toContain('marge exigée');
    expect(sortie).toContain('Aucune archive écrite');
    expect(code).toBe(1);
    // La promesse du message est vérifiée, pas seulement affichée : le
    // répertoire est VIDE — pas de `.partiel`, pas de marqueur de passe réussie.
    expect(contenu(archives)).toEqual([]);
  });

  it('refuse de continuer quand le répertoire d’archives dépasse son plafond', () => {
    const { code, sortie } = jouerUnePasse(repertoireNeuf(), {
      AXION_ARCHIVES_MAX_MO: '0',
    });
    expect(sortie).toContain('ECHEC SAUVEGARDE —');
    expect(sortie).toContain('au-delà du plafond');
    expect(code).toBe(1);
  });
});

// =============================================================================
// 2. ROTATION — par RANG, et l'empreinte part avec l'archive
// =============================================================================
describe('sauvegarde.sh — rotation des archives MinIO', () => {
  it('@critique garde exactement N archives sur N+1 passes, avec leur `.sha256`', () => {
    const archives = repertoireNeuf();
    const gardees = 2;

    // Un `.partiel` d'une passe interrompue est posé AVANT la première passe :
    // il ne doit jamais compter dans la rétention, sans quoi la N-ième vraie
    // archive serait supprimée pour lui faire de la place.
    dansConteneur(`: > ${archives}/minio-20200101T000000Z.tar.zst.gpg.partiel`);

    // `/usr/bin/sleep` — le VRAI, pas le stub de la boucle : l'horodatage du nom
    // est à la seconde, et deux passes dans la même seconde porteraient le même
    // nom. C'est une propriété du script, pas du test ; elle est signalée au
    // rapport de revue croisée. Ici on veut trois archives DISTINCTES pour
    // éprouver le rang.
    for (let passe = 0; passe < gardees + 1; passe += 1) {
      const journal = jouerUnePasse(archives, {
        AXION_MINIO_ARCHIVES_GARDEES: String(gardees),
      });
      expect(journal.sortie).toContain('passe terminée avec succès');
      if (passe < gardees) dansConteneur('/usr/bin/sleep 1.2');
    }

    const fichiers = contenu(archives);
    const gpg = fichiers.filter((f) => f.endsWith('.tar.zst.gpg'));
    const empreintes = fichiers.filter((f) => f.endsWith('.tar.zst.gpg.sha256'));

    expect(
      gpg,
      `Attendu ${String(gardees)} archives, obtenu :\n${fichiers.join('\n')}`,
    ).toHaveLength(gardees);
    expect(empreintes).toHaveLength(gardees);
    // L'empreinte suit l'archive : une `.sha256` orpheline signerait une
    // suppression à moitié faite.
    expect(empreintes.map((f) => f.replace(/\.sha256$/, '')).sort()).toEqual([...gpg].sort());
    // Les deux CONSERVÉES sont les deux plus RÉCENTES (le nom est trié
    // chronologiquement) : la plus ancienne des trois a bien disparu.
    expect([...gpg].sort()).toEqual([...gpg].sort().slice(-gardees));
    // Le `.partiel` posé au départ n'a jamais été compté comme une archive.
    expect(fichiers).toContain('minio-20200101T000000Z.tar.zst.gpg.partiel');
  }, 300_000);

  it('chaque `.sha256` publié vérifie réellement son archive (`sha256sum -c`)', () => {
    const archives = repertoireNeuf();
    expect(jouerUnePasse(archives).sortie).toContain('passe terminée avec succès');
    const { code, sortie } = dansConteneur(
      `cd ${archives} && for s in *.sha256; do sha256sum -c "$s"; done`,
    );
    expect(sortie).toContain(': OK');
    expect(code).toBe(0);
  });
});

// =============================================================================
// 3. INTÉGRITÉ — l'archive est RELUE avant d'être publiée
//
// Deux injections, parce qu'il y a deux façons pour une archive de mentir :
//   · le chiffré est abîmé      → le redéchiffrement échoue ;
//   · le chiffré est intact mais son CONTENU diffère de ce qui a été lu.
// Dans les deux cas la seule issue acceptable est la même : aucune archive
// publiée, aucun marqueur de passe réussie.
// =============================================================================
describe('sauvegarde.sh — vérification de bout en bout avant publication', () => {
  it('@critique un octet altéré dans le chiffré empêche la publication', () => {
    const archives = repertoireNeuf();
    // `gpg` est enveloppé : il fait son travail, puis retourne UN octet du
    // fichier produit. Le script ne sait rien de cette enveloppe — c'est bien
    // son comportement à lui que l'on observe.
    dansConteneur(
      [
        `cat > ${FAUX}/gpg <<'FIN'`,
        '#!/bin/bash',
        'set -e',
        'cible=""',
        'precedent=""',
        'for a in "$@"; do if [ "$precedent" = "-o" ]; then cible="$a"; fi; precedent="$a"; done',
        '/usr/bin/gpg "$@"',
        'code=$?',
        'if [ -n "$cible" ] && [ -s "$cible" ]; then',
        '  printf "\\xff" | dd of="$cible" bs=1 seek=64 count=1 conv=notrunc status=none',
        'fi',
        'exit $code',
        'FIN',
        `chmod 0755 ${FAUX}/gpg`,
      ].join('\n'),
      {},
      'root',
    );

    try {
      const { code, sortie } = jouerUnePasse(archives);
      expect(sortie).not.toContain('passe terminée avec succès');
      expect(code).not.toBe(0);
      // Rien de publié : ni archive, ni empreinte, ni marqueur.
      const fichiers = contenu(archives);
      expect(fichiers.filter((f) => f.endsWith('.tar.zst.gpg'))).toEqual([]);
      expect(fichiers).not.toContain('.derniere-passe');
    } finally {
      dansConteneur(`rm -f ${FAUX}/gpg`, {}, 'root');
    }
  }, 300_000);

  it('@critique un contenu qui ne se relit pas à l’identique fait ÉCHOUER la passe en français', () => {
    const archives = repertoireNeuf();
    // `zstd` est enveloppé : la COMPRESSION est intacte, seule la
    // DÉCOMPRESSION (celle de la relecture) rend un octet de plus. L'archive
    // est donc parfaitement valide et son contenu diffère : exactement la panne
    // que la double empreinte existe pour attraper.
    dansConteneur(
      [
        `cat > ${FAUX}/zstd <<'FIN'`,
        '#!/bin/bash',
        'for a in "$@"; do if [ "$a" = "-d" ]; then /usr/bin/zstd "$@"; printf "octet-en-trop"; exit 0; fi; done',
        'exec /usr/bin/zstd "$@"',
        'FIN',
        `chmod 0755 ${FAUX}/zstd`,
      ].join('\n'),
      {},
      'root',
    );

    try {
      const { code, sortie } = jouerUnePasse(archives);
      expect(sortie).toContain('ECHEC SAUVEGARDE —');
      expect(sortie).toContain("ne se relit pas à l'identique");
      expect(code).toBe(1);
      const fichiers = contenu(archives);
      expect(fichiers.filter((f) => f.endsWith('.tar.zst.gpg'))).toEqual([]);
      // Le `.partiel` est retiré : une archive refusée ne doit pas rester à
      // occuper le disque sous un nom que la rotation ignore.
      expect(fichiers.filter((f) => f.endsWith('.partiel'))).toEqual([]);
      expect(fichiers).not.toContain('.derniere-passe');
    } finally {
      dansConteneur(`rm -f ${FAUX}/zstd`, {}, 'root');
    }
  }, 300_000);
});

// =============================================================================
// 4. PERMISSIONS — `umask 077`, et il se mesure sur les fichiers produits
// =============================================================================
describe('sauvegarde.sh — permissions des fichiers produits', () => {
  it('@critique archives, empreintes et marqueur sont en 0600', () => {
    const archives = repertoireNeuf();
    expect(jouerUnePasse(archives).sortie).toContain('passe terminée avec succès');
    const { sortie } = dansConteneur(`stat -c '%a %n' ${archives}/* ${archives}/.derniere-passe`);
    const lignes = sortie
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    // Trois fichiers au moins : l'archive, son empreinte, le marqueur de passe.
    expect(lignes.length).toBeGreaterThanOrEqual(3);
    for (const ligne of lignes) {
      const [mode, chemin] = ligne.split(/\s+/, 2);
      expect(
        mode,
        `un fichier de sauvegarde n'est pas en 0600 : ${chemin ?? ligne} (mode ${mode ?? '?'})`,
      ).toBe('600');
    }
  }, 300_000);
});

// =============================================================================
// 5. RATTRAPAGE AU DÉMARRAGE — le défaut mesuré le 2026-08-28 était une pile en
// bonne santé SANS le moindre point de départ.
// =============================================================================
describe('sauvegarde.sh — rattrapage au démarrage', () => {
  it('@critique joue une passe IMMÉDIATE quand aucun marqueur n’existe', () => {
    const archives = repertoireNeuf();
    const { sortie } = jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' });
    expect(sortie).toContain('aucune passe récente');
    expect(sortie).toContain('passe terminée avec succès');
    expect(contenu(archives).filter((f) => f.endsWith('.tar.zst.gpg'))).toHaveLength(1);
  }, 300_000);

  it('ne rejoue AUCUNE passe quand le marqueur est plus récent que la tolérance', () => {
    const archives = repertoireNeuf();
    expect(jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' }).sortie).toContain(
      'passe terminée avec succès',
    );
    const avant = contenu(archives);

    const seconde = jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' }, 20);
    expect(seconde.sortie).not.toContain('=== passe du');
    expect(seconde.sortie).toContain('prochaine passe dans');
    expect(contenu(archives)).toEqual(avant);
  }, 300_000);

  it('rattrape quand le marqueur est plus VIEUX que la tolérance', () => {
    const archives = repertoireNeuf();
    expect(jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' }).sortie).toContain(
      'passe terminée avec succès',
    );
    // Marqueur reculé de 48 h : deux jours sans sauvegarde, invariant 8 violé.
    dansConteneur(`echo $(( $(date -u +%s) - 172800 )) > ${archives}/.derniere-passe`);
    const { sortie } = jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' });
    expect(sortie).toContain('aucune passe récente');
    expect(sortie).toContain('passe terminée avec succès');
  }, 300_000);

  it('rattrape quand le marqueur est VIDE — une écriture tronquée ne vaut pas une preuve', () => {
    const archives = repertoireNeuf();
    dansConteneur(`: > ${archives}/.derniere-passe`);
    const { sortie } = jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' });
    expect(sortie).toContain('passe terminée avec succès');
  }, 300_000);
});

// =============================================================================
// 6. TYPE CALENDAIRE — complète le jour dit, incrémentale les autres
// =============================================================================
describe('sauvegarde.sh — type de sauvegarde PostgreSQL', () => {
  function jourUtc(decalage: number): string {
    const { sortie } = dansConteneur(`echo $(( ( $(date -u +%w) + ${String(decalage)} ) % 7 ))`);
    return sortie.trim();
  }

  it('@critique demande `--type=full` le jour déclaré comme jour de complète', () => {
    const { sortie } = jouerUnePasse(repertoireNeuf(), {
      AXION_SAUVEGARDE_JOUR_COMPLETE: jourUtc(0),
    });
    expect(sortie).toContain('--type=full');
    expect(sortie).not.toContain('--type=incr');
  }, 300_000);

  it('@critique demande `--type=incr` tous les autres jours', () => {
    const { sortie } = jouerUnePasse(repertoireNeuf(), {
      AXION_SAUVEGARDE_JOUR_COMPLETE: jourUtc(1),
    });
    expect(sortie).toContain('--type=incr');
    expect(sortie).not.toContain('--type=full');
  }, 300_000);
});

// =============================================================================
// LA RAISON D'ÊTRE DU `bash` — `set -o pipefail`, PROUVÉ PAR SON ABSENCE
//
// L'en-tête du script et celui du Dockerfile affirment tous deux qu'un `tar` qui
// échoue en tête de `tar | zstd | gpg` laisserait, sans `pipefail`, une archive
// PARFAITEMENT VALIDE d'un contenu TRONQUÉ, publiée avec un code 0. Ce couple de
// cas ne se contente pas de le croire :
//   · un fichier ILLISIBLE est posé dans le volume MinIO — `tar` le saute, écrit
//     le reste et sort en 2 ;
//   · le script LIVRÉ échoue et ne publie rien ;
//   · un TÉMOIN, copie du même script dans /tmp du conteneur avec `set -eu` au
//     lieu de `set -euo pipefail`, publie l'archive, écrit le marqueur, annonce
//     « passe terminée avec succès » — et l'archive publiée NE CONTIENT PAS le
//     fichier illisible.
// Le témoin ne touche jamais au dépôt : il est fabriqué par `sed` dans le
// conteneur, et il est la démonstration que la ligne `set -o pipefail` porte à
// elle seule la différence entre une sauvegarde et un mensonge.
// =============================================================================
describe('sauvegarde.sh — `set -o pipefail` porte la sûreté du tube', () => {
  const ILLISIBLE = `${DONNEES_MINIO}/dossier/illisible.bin`;

  beforeAll(() => {
    docker([
      'exec',
      '--user',
      'root',
      CONTENEUR,
      'bash',
      '-c',
      `head -c 131072 /dev/urandom > ${ILLISIBLE} && chown root:root ${ILLISIBLE} && chmod 000 ${ILLISIBLE}`,
    ]);
  });

  afterAll(() => {
    docker(['exec', '--user', 'root', CONTENEUR, 'bash', '-c', `rm -f ${ILLISIBLE}`]);
  });

  it('@critique le script LIVRÉ échoue sur un `tar` en erreur et ne publie rien', () => {
    const archives = repertoireNeuf();
    const { code, sortie } = jouerUnePasse(archives);
    expect(sortie).toContain('Cannot open');
    expect(sortie).not.toContain('passe terminée avec succès');
    expect(code).not.toBe(0);
    const fichiers = contenu(archives);
    expect(fichiers.filter((f) => f.endsWith('.tar.zst.gpg'))).toEqual([]);
    expect(fichiers).not.toContain('.derniere-passe');
  }, 300_000);

  it('@critique le TÉMOIN sans `pipefail` publie une archive VALIDE d’un contenu TRONQUÉ', () => {
    const archives = repertoireNeuf();
    const temoin = '/tmp/temoin-sans-pipefail';
    // Une seule ligne change, et elle est vérifiée : si le `set -euo pipefail`
    // du script livré disparaissait, ce `grep` rendrait le témoin identique à
    // l'original et le test perdrait tout sens.
    const fabrication = dansConteneur(
      `grep -qx 'set -euo pipefail' /usr/local/bin/axion-sauvegarde &&` +
        ` sed 's/^set -euo pipefail$/set -eu/' /usr/local/bin/axion-sauvegarde > ${temoin} &&` +
        ` chmod 0755 ${temoin} && grep -c '^set -eu$' ${temoin}`,
    );
    expect(fabrication.code, `Fabrication du témoin impossible :\n${fabrication.sortie}`).toBe(0);
    expect(fabrication.sortie.trim()).toBe('1');

    const { sortie } = dansConteneur(`timeout 120 ${temoin} 2>&1`, {
      BACKUP_ENCRYPTION_PASSPHRASE: PASSPHRASE,
      AXION_SAUVEGARDE_TOLERANCE_H: '0',
      AXION_ARCHIVES: archives,
      ...R2_FACTICE,
    });

    // Le témoin ment : `tar` a échoué, il annonce le succès.
    expect(sortie).toContain('Cannot open');
    expect(sortie).toContain('passe terminée avec succès');
    const publiees = contenu(archives).filter((f) => f.endsWith('.tar.zst.gpg'));
    expect(publiees).toHaveLength(1);

    // …et l'archive publiée est parfaitement lisible, AMPUTÉE du fichier que
    // `tar` n'a pas pu lire. C'est LA panne que `pipefail` empêche.
    const liste = dansConteneur(
      `gpg --batch --quiet --decrypt --passphrase '${PASSPHRASE}' --pinentry-mode loopback` +
        ` ${archives}/${publiees[0] ?? ''} | zstd -d -q | tar -tf -`,
    );
    expect(liste.code, `L'archive du témoin devait être lisible :\n${liste.sortie}`).toBe(0);
    expect(liste.sortie).toContain('./repere.txt');
    expect(liste.sortie).not.toContain('illisible.bin');

    dansConteneur(`rm -f ${temoin}`);
  }, 300_000);
});

// =============================================================================
// CE QUE LE SCRIPT FAIT QUAND L'ENVIRONNEMENT LÂCHE — au-delà de la liste
//
// Ces cas ne sont pas dans la liste d'A59 : ils cherchent les pannes qu'on ne
// pense pas à écrire quand on vient d'écrire le code. Ce qu'ils gardent est
// toujours la même propriété, la seule qui compte pour une sauvegarde : ÉCHOUER
// SANS PUBLIER vaut infiniment mieux que publier sans savoir.
// =============================================================================
describe('sauvegarde.sh — pannes d’environnement', () => {
  it('@critique un disque qui se remplit PENDANT l’écriture ne publie aucune archive', () => {
    // La marge est neutralisée EXPRÈS : sans cela le garde-fou de marge
    // refuserait AVANT d'écrire, et l'on n'éprouverait que lui. Ce que l'on veut
    // voir ici, c'est le comportement quand le disque lâche EN COURS de `gpg`.
    // Le contenu à archiver (4 Mo aléatoires, incompressibles) est très
    // au-dessus du disque de 1 Mo : le remplissage est certain, pas espéré.
    const gros = dansConteneur(
      `head -c 4000000 /dev/urandom > ${DONNEES_MINIO}/dossier/gros.bin`,
      {},
      'root',
    );
    expect(gros.code).toBe(0);
    dansConteneur(`rm -f ${PETIT_DISQUE}/* ${PETIT_DISQUE}/.derniere-passe`);

    try {
      const { code, sortie } = jouerUnePasse(PETIT_DISQUE, {
        AXION_ARCHIVES_MARGE_MO: '0',
        AXION_ARCHIVES_MAX_MO: '999999',
      });
      expect(sortie).toContain('No space left on device');
      expect(sortie).not.toContain('passe terminée avec succès');
      expect(code).not.toBe(0);
      const fichiers = contenu(PETIT_DISQUE);
      expect(fichiers.filter((f) => f.endsWith('.tar.zst.gpg'))).toEqual([]);
      expect(fichiers).not.toContain('.derniere-passe');
    } finally {
      dansConteneur(`rm -f ${DONNEES_MINIO}/dossier/gros.bin`, {}, 'root');
      dansConteneur(`rm -f ${PETIT_DISQUE}/*`);
    }
  }, 300_000);

  it('@critique `gpg` absent de l’image ne produit AUCUNE archive publiée', () => {
    const archives = repertoireNeuf();
    // Un `PATH` complet SAUF `gpg` : tout le reste du script fonctionne, la
    // seule chose qui manque est le chiffrement. Une archive publiée ici serait
    // une archive en clair, ou pire, un fichier vide portant le bon nom.
    const sansGpg = '/tmp/sans-gpg';
    dansConteneur(
      `rm -rf ${sansGpg} && mkdir -p ${sansGpg} && for c in tar zstd sha256sum df du wc mktemp find date awk grep sort ls rm mv cat sleep cut basename mkdir chmod tee sed timeout; do ln -sf "$(command -v $c)" ${sansGpg}/$c; done && ln -sf ${FAUX}/pgbackrest ${sansGpg}/pgbackrest && ln -sf ${FAUX}/mc ${sansGpg}/mc`,
    );
    const { code, sortie } = docker([
      'exec',
      '--user',
      'postgres',
      '-e',
      `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE}`,
      '-e',
      'AXION_SAUVEGARDE_TOLERANCE_H=0',
      '-e',
      `AXION_ARCHIVES=${archives}`,
      ...Object.entries(R2_FACTICE).flatMap(([cle, valeur]) => ['-e', `${cle}=${valeur}`]),
      '-e',
      `PATH=${sansGpg}`,
      CONTENEUR,
      '/usr/bin/timeout',
      '120',
      '/usr/local/bin/axion-sauvegarde',
    ]);
    // `toContain('gpg')` NE SUFFIT PAS et c'est le piège : le nom de l'archive
    // annoncé au journal (`minio-….tar.zst.gpg`) contient déjà « gpg », si bien
    // que l'assertion était vraie même quand le script chiffrait correctement.
    // MESURÉ ici : `bash` sort en 127 avec « gpg: command not found », et le
    // répertoire d'archives reste ENTIÈREMENT vide — pas même un `.partiel`.
    expect(sortie).toContain('gpg: command not found');
    expect(sortie).not.toContain('passe terminée avec succès');
    expect(code).toBe(127);
    expect(contenu(archives)).toEqual([]);
  }, 300_000);

  it('@critique l’archive publiée est bien CHIFFRÉE — lisible avec la passphrase, illisible sans', () => {
    // CE CAS REMPLACE CELUI D'AVANT, ET LA RAISON EST MESURÉE.
    // Le cas hérité (« une passphrase qui CHANGE rend l'archive illisible »)
    // n'assertait que deux propriétés de `gpg` et de `sha256sum`, jamais une
    // propriété du script : il est resté VERT sous un mutant où `gpg` était
    // remplacé par `cat`, c'est-à-dire sur une chaîne qui expédiait les pièces
    // jointes d'audit EN CLAIR. Un cas qui survit à ça ne garde rien.
    //
    // Ce qu'il faut garder est l'inverse, et c'est vérifiable : le fichier publié
    // est un message GPG symétrique, il se relit avec LA passphrase configurée,
    // et il ne se relit PAS avec une autre.
    const archives = repertoireNeuf();
    expect(jouerUnePasse(archives).sortie).toContain('passe terminée avec succès');

    const nature = dansConteneur(`gpg --list-packets --batch ${archives}/minio-*.tar.zst.gpg 2>&1`);
    expect(
      nature.sortie,
      `Le fichier publié n'est pas un message GPG symétrique :\n${nature.sortie}`,
    ).toContain('symkey enc packet');

    const avecLaBonne = dansConteneur(
      `gpg --batch --quiet --decrypt --passphrase '${PASSPHRASE}' --pinentry-mode loopback` +
        ` ${archives}/minio-*.tar.zst.gpg | zstd -d -q | tar -tf - | head -5`,
    );
    expect(avecLaBonne.code, avecLaBonne.sortie).toBe(0);
    expect(avecLaBonne.sortie).toContain('./repere.txt');

    const avecUneAutre = dansConteneur(
      `gpg --batch --quiet --decrypt --passphrase 'une-autre-passphrase' --pinentry-mode loopback ${archives}/minio-*.tar.zst.gpg > /dev/null`,
    );
    expect(avecUneAutre.code).not.toBe(0);
  }, 300_000);

  // ---------------------------------------------------------------------------
  // CE QUE PERSONNE N'AVAIT DEMANDÉ — les pannes qu'on ne pense pas à écrire
  // quand on vient d'écrire le code (elles ne sont dans AUCUNE liste d'A59).
  // ---------------------------------------------------------------------------

  it('@critique deux passes SIMULTANÉES ne publient jamais une archive corrompue', () => {
    // Le script n'a AUCUN verrou. Rien n'empêche deux passes de se chevaucher :
    // un rattrapage au démarrage pendant qu'une passe planifiée tourne encore,
    // ou deux conteneurs lancés sur le même volume d'archives. Elles écrivent
    // toutes deux dans `$ARCHIVES/minio-<horodatage>.tar.zst.gpg.partiel`, et
    // l'horodatage est à LA SECONDE.
    //
    // Ce cas ne prétend pas que le script se protège : il garde la seule chose
    // qui compte, à savoir qu'AUCUNE archive publiée ne peut être illisible.
    // Toute archive présente à la fin doit se relire ET porter une empreinte
    // juste. Le défaut de conception (absence de verrou) est remonté au rapport.
    const archives = repertoireNeuf();
    const r2 = Object.entries(R2_FACTICE)
      .map(([cle, valeur]) => `${cle}=${valeur}`)
      .join(' ');
    const lancer =
      `BACKUP_ENCRYPTION_PASSPHRASE=${PASSPHRASE} AXION_SAUVEGARDE_TOLERANCE_H=0` +
      ` AXION_ARCHIVES=${archives} ${r2} /usr/bin/timeout 120 /usr/local/bin/axion-sauvegarde`;
    const { sortie } = dansConteneur(`( ${lancer} & ${lancer} & wait ) 2>&1 || true`);
    expect(sortie).toContain('=== passe du');

    // Toute archive PUBLIÉE (hors `.partiel`) doit se relire et son `.sha256`
    // doit être juste. Une seule qui échoue et la propriété tombe.
    const verification = dansConteneur(
      `cd ${archives} && for a in minio-*.tar.zst.gpg; do [ -e "$a" ] || continue;` +
        ` sha256sum -c "$a.sha256" >/dev/null || { echo "EMPREINTE FAUSSE $a"; exit 1; };` +
        ` gpg --batch --quiet --decrypt --passphrase '${PASSPHRASE}' --pinentry-mode loopback "$a"` +
        ` | zstd -d -q | tar -tf - >/dev/null || { echo "ILLISIBLE $a"; exit 1; }; done; echo TOUTES_LISIBLES`,
    );
    expect(
      verification.sortie,
      `Deux passes simultanées ont laissé une archive que personne ne peut relire :\n${verification.sortie}`,
    ).toContain('TOUTES_LISIBLES');
  }, 300_000);

  it('@critique une horloge qui RECULE ne fait pas sauter la sauvegarde', () => {
    // Le marqueur porte un `date +%s`. Si l'horloge du serveur recule — NTP qui
    // corrige une dérive, machine virtuelle restaurée depuis un instantané — le
    // marqueur devient FUTUR, et l'âge calculé par `doit_rattraper` devient
    // NÉGATIF. La question n'est pas théorique : un âge négatif est toujours
    // inférieur à la tolérance, donc le rattrapage ne partirait jamais.
    //
    // Ce qui est gardé ici : avec un marqueur daté de dix jours dans le FUTUR,
    // le service doit soit rattraper, soit au minimum ne pas mentir sur ce
    // qu'il a fait. Le comportement RÉEL est mesuré et asserté tel quel.
    const archives = repertoireNeuf();
    dansConteneur(`echo $(( $(date -u +%s) + 864000 )) > ${archives}/.derniere-passe`);
    const { sortie } = jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' }, 30);
    // Aucune passe n'est jouée — c'est le comportement constaté, et il est
    // remonté comme défaut (le service dort sur un marqueur invraisemblable).
    // Ce que le cas VERROUILLE, c'est qu'il ne peut pas y avoir de faux succès :
    // rien n'est publié et le journal ne prétend rien.
    expect(sortie).not.toContain('passe terminée avec succès');
    expect(contenu(archives).filter((f) => f.endsWith('.tar.zst.gpg'))).toEqual([]);
  }, 300_000);

  it('@critique un marqueur piégé ne peut pas faire EXÉCUTER une commande', () => {
    // `marqueur_perime` injecte le contenu du marqueur dans une évaluation
    // arithmétique bash : `age=$(( ( $(date -u +%s) - derniere ) / 3600 ))`.
    // L'arithmétique de bash évalue les INDICES DE TABLEAU, et un indice peut
    // contenir une substitution de commande. MESURÉ le 2026-08-28 : dans un shell
    // SANS `set -u`, un marqueur valant `x[$(touch …)]` fait bel et bien
    // s'exécuter le `touch`.
    //
    // Ce qui protège le script livré n'est donc PAS une validation du marqueur —
    // il n'y en a aucune — mais le `-u` de `set -euo pipefail` : `x` étant une
    // variable non définie, l'évaluation s'arrête avant la substitution. La
    // propriété est réelle, elle tient à un caractère, et personne ne l'avait
    // écrite. Ce cas la verrouille.
    //
    // Le marqueur vit dans le volume d'archives, que seul ce service écrit : le
    // risque n'est pas une élévation de privilège, c'est une défense en
    // profondeur. « Faible » n'est pas « mesuré ».
    const archives = repertoireNeuf();
    dansConteneur('rm -f /tmp/preuve-injection');
    dansConteneur(
      `printf '%s\\n' 'x[$(touch /tmp/preuve-injection)]' > ${archives}/.derniere-passe`,
    );
    // Le marqueur est bien la charge utile, pas une version échappée d'elle-même.
    expect(dansConteneur(`cat ${archives}/.derniere-passe`).sortie.trim()).toBe(
      'x[$(touch /tmp/preuve-injection)]',
    );
    jouerUnePasse(archives, { AXION_SAUVEGARDE_TOLERANCE_H: '26' }, 30);
    const preuve = dansConteneur('test -e /tmp/preuve-injection && echo EXECUTE || echo INERTE');
    expect(
      preuve.sortie.trim(),
      "Le contenu du marqueur a été EXÉCUTÉ par l'évaluation arithmétique de bash.",
    ).toContain('INERTE');
  }, 300_000);

  it('l’argument hérité de l’image (`postgres`) est bien inerte', () => {
    // Le compose l'affirme : « Le `CMD ["postgres"]` hérité est passé en argument
    // à notre point d'entrée, qui ne lit aucun argument : il est inerte. »
    // Personne ne l'avait vérifié. Si le script se mettait un jour à faire
    // `exec "$@"`, ce cas le dirait.
    const archives = repertoireNeuf();
    const { sortie } = dansConteneur(`timeout 60 /usr/local/bin/axion-sauvegarde postgres 2>&1`, {
      BACKUP_ENCRYPTION_PASSPHRASE: PASSPHRASE,
      AXION_SAUVEGARDE_TOLERANCE_H: '0',
      AXION_ARCHIVES: archives,
      ...R2_FACTICE,
    });
    expect(sortie).toContain('passe terminée avec succès');
    expect(contenu(archives).filter((f) => f.endsWith('.tar.zst.gpg'))).toHaveLength(1);
  }, 300_000);
});

// =============================================================================
// 11. LE DOCKERFILE — ce que l'image doit porter pour que tout ce qui précède
// puisse seulement démarrer.
// =============================================================================
describe('Dockerfile — le script et son point de montage', () => {
  it('@critique `/sauvegarde` existe, appartient à `postgres`, et est en 0700', () => {
    const { code, sortie } = dansConteneur("stat -c '%a %U:%G' /sauvegarde", {}, 'root');
    expect(code).toBe(0);
    expect(sortie.trim()).toBe('700 postgres:postgres');
  });

  it('@critique `axion-sauvegarde` est présent, en 0755, et syntaxiquement valide en bash', () => {
    const permissions = dansConteneur("stat -c '%a' /usr/local/bin/axion-sauvegarde", {}, 'root');
    expect(permissions.sortie.trim()).toBe('755');
    const syntaxe = dansConteneur('bash -n /usr/local/bin/axion-sauvegarde', {}, 'root');
    expect(syntaxe.code, `\`bash -n\` a refusé le script :\n${syntaxe.sortie}`).toBe(0);
  });

  it('@critique le script embarqué est le fichier du dépôt, à l’octet près', () => {
    // Sans ce cas, toute la suite pourrait être verte sur une image périmée —
    // le Dockerfile copie à la CONSTRUCTION, et « corriger le fichier et
    // redémarrer le conteneur » n'existe pas ici (encadré du Dockerfile).
    const { sortie } = dansConteneur('sha256sum /usr/local/bin/axion-sauvegarde', {}, 'root');
    const dansImage = sortie.trim().split(/\s+/)[0] ?? '';
    const surDisque = createHash('sha256')
      .update(readFileSync(resolve(RACINE_DEPOT, 'infra', 'postgres', 'sauvegarde.sh')))
      .digest('hex');
    expect(
      dansImage,
      "L'image ne porte pas la version du dépôt : reconstruire `axion-audit-postgres:16-coolify`\n" +
        '(contexte `infra/`, cible `config-embarquee`) avant de conclure quoi que ce soit\n' +
        'de cette suite.',
    ).toBe(surDisque);
  });

  it('bash reste EXIGÉ : le script ne doit pas pouvoir être relu comme du POSIX `sh`', () => {
    // `set -o pipefail` n'existe pas en POSIX. Si `dash` acceptait ce fichier,
    // c'est que la ligne aurait disparu — et avec elle la seule chose qui
    // distingue une archive d'un mensonge (voir le couple de cas ci-dessus).
    const { sortie } = dansConteneur(
      'grep -c "^set -euo pipefail$" /usr/local/bin/axion-sauvegarde',
    );
    expect(sortie.trim()).toBe('1');
  });
});

// =============================================================================
// 7 & 8. LES MONTAGES DU SERVICE `sauvegarde` DANS LA PILE COOLIFY
//
// POURQUOI ICI ET PAS DANS `scripts/garde-fous-compose.test.ts`. Les deux
// garde-fous de ce dépôt (`check-compose-coolify.mjs`, `check-isolation-reseau
// .mjs`) ne connaissent AUCUNE règle de propriété de montage : les y ajouter
// serait écrire du code de production, ce que le mandat d'un test croisé
// interdit. Les propriétés sont donc gardées ici, contre le fichier RÉEL.
//
// POURQUOI `docker compose config` ET PAS UN LECTEUR MAISON. Le lecteur YAML des
// deux garde-fous a été mis en défaut six fois par une revue croisée sur des
// écritures parfaitement légales. En écrire un septième pour ce test
// reproduirait le défaut plutôt que de le garder. Compose est l'autorité : c'est
// littéralement lui qui décide ce qui sera monté.
// =============================================================================
interface ServiceCompose {
  readonly volumes?: readonly {
    readonly type: string;
    readonly source?: string;
    readonly target: string;
    readonly read_only?: boolean;
  }[];
  readonly environment?: Readonly<Record<string, string | null>>;
}
interface ConfigCompose {
  readonly services: Readonly<Record<string, ServiceCompose>>;
}

const CHEMIN_COMPOSE = resolve(RACINE_DEPOT, 'infra', 'docker-compose.coolify.yml');

/**
 * Valeurs FACTICES pour les variables que le compose exige (`${VAR:?…}`), LUES
 * DANS LE COMPOSE LUI-MÊME.
 *
 * La première version de ce fichier portait la liste EN DUR. Elle a cessé d'être
 * juste le jour même (2026-08-28) : quatre variables `BACKUP_R2_*` sont apparues
 * dans le service `sauvegarde`, et les quatre cas ci-dessous se sont mis à
 * échouer sur « required variable … is missing a value » — un rouge qui ne
 * parlait pas de la propriété gardée. Une liste recopiée à la main d'un fichier
 * qui vit est une liste qui sera fausse ; celle-ci se dérive.
 *
 * Aucun secret n'est écrit ici (11 §2) : la même chaîne factice sert à toutes.
 */
function variablesExigees(texteCompose: string): readonly string[] {
  const noms = new Set<string>();
  for (const trouve of texteCompose.matchAll(/\$\{([A-Z0-9_]+):\?/g)) {
    if (trouve[1] !== undefined) noms.add(trouve[1]);
  }
  return [...noms].sort();
}

function lireCompose(): ConfigCompose {
  const environnement: NodeJS.ProcessEnv = { ...process.env };
  for (const nom of variablesExigees(readFileSync(CHEMIN_COMPOSE, 'utf8'))) {
    environnement[nom] = 'valeur-factice-de-test';
  }
  const resultat = spawnSync(
    'docker',
    ['compose', '-f', 'infra/docker-compose.coolify.yml', 'config', '--format', 'json'],
    {
      cwd: RACINE_DEPOT,
      encoding: 'utf8',
      env: environnement,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (resultat.status !== 0) {
    throw new Error(
      `\`docker compose config\` a refusé infra/docker-compose.coolify.yml :\n` +
        `${fluxTexte(resultat.stdout)}${fluxTexte(resultat.stderr)}`,
    );
  }
  return JSON.parse(resultat.stdout) as ConfigCompose;
}

describe('docker-compose.coolify.yml — propriété des volumes de la sauvegarde', () => {
  let configuration: ConfigCompose;

  beforeAll(() => {
    configuration = lireCompose();
  }, 120_000);

  /** Services qui montent `source`, séparés selon qu'ils l'écrivent ou non. */
  function porteurs(source: string): { ecriture: string[]; lecture: string[] } {
    const ecriture: string[] = [];
    const lecture: string[] = [];
    for (const [nom, service] of Object.entries(configuration.services)) {
      for (const montage of service.volumes ?? []) {
        if (montage.type !== 'volume' || montage.source !== source) continue;
        (montage.read_only === true ? lecture : ecriture).push(nom);
      }
    }
    return { ecriture: ecriture.sort(), lecture: lecture.sort() };
  }

  it('@critique `postgres_data` n’est ÉCRIT que par `postgres` et `createstanza`', () => {
    const { ecriture, lecture } = porteurs('postgres_data');
    expect(
      ecriture,
      'Le répertoire de données du cluster ne doit être ouvert en écriture qu’au serveur\n' +
        'et au job qui crée la stanza. Tout autre service qui l’écrit peut corrompre la base\n' +
        'que la sauvegarde est censée protéger.',
    ).toEqual(['createstanza', 'postgres']);
    // Et la sauvegarde, elle, le monte — mais en LECTURE SEULE.
    expect(lecture).toContain('sauvegarde');
  });

  it('@critique `postgres_socket` est monté par EXACTEMENT `postgres` et `sauvegarde`', () => {
    const { ecriture, lecture } = porteurs('postgres_socket');
    expect(
      [...ecriture, ...lecture].sort(),
      'Le socket UNIX est la seule voie de pgBackRest vers le cluster : l’ouvrir à un\n' +
        'troisième service donnerait un accès local à la base sans passer par le réseau\n' +
        'ni par le RBAC (invariant 3, 06 §10.3).',
    ).toEqual(['postgres', 'sauvegarde']);
  });

  it('@critique `sauvegarde_archives` est monté par EXACTEMENT `sauvegarde`', () => {
    const { ecriture, lecture } = porteurs('sauvegarde_archives');
    expect(
      [...ecriture, ...lecture],
      'Les archives sont des copies chiffrées de pièces jointes d’audit : un second\n' +
        'service qui les monte est un second chemin vers ces données (02 §30.4).',
    ).toEqual(['sauvegarde']);
  });

  it('@critique `minio_data` n’est monté par `sauvegarde` qu’en LECTURE SEULE', () => {
    const { ecriture, lecture } = porteurs('minio_data');
    expect(ecriture).toEqual(['minio']);
    expect(lecture).toEqual(['sauvegarde']);
  });

  it('@critique `pgbackrest_repo` est monté par EXACTEMENT les trois services du dépôt', () => {
    // Ce volume PORTE les sauvegardes PostgreSQL. Trois services ont une raison
    // d'y toucher : le serveur (`archive-push`), le job qui crée la stanza, et
    // le service de sauvegarde. Un quatrième serait un second chemin vers des
    // données de production chiffrées (02 §30.4).
    const { ecriture, lecture } = porteurs('pgbackrest_repo');
    expect([...ecriture, ...lecture].sort()).toEqual(['createstanza', 'postgres', 'sauvegarde']);
  });

  /** Valeur d'une variable d'environnement d'un service, telle que Compose la rend. */
  function variable(service: string, nom: string): string {
    const valeur = configuration.services[service]?.environment?.[nom];
    expect(valeur, `${service} ne déclare pas ${nom}`).toBeTypeOf('string');
    return valeur ?? '';
  }

  it('@critique la sauvegarde vise le MÊME dépôt et la MÊME stanza que le serveur', () => {
    // Le compose l'écrit — « LES MÊMES VALEURS QUE LE SERVEUR. Une divergence
    // produirait des sauvegardes valides dans un dépôt que `archive_command`
    // n'alimente pas » — et rien ne le vérifiait. C'est la panne la plus
    // silencieuse de la famille : tout est vert des deux côtés, et il n'y a
    // aucun point de restauration là où on ira le chercher.
    for (const nom of ['PGBACKREST_STANZA', 'PGBACKREST_REPO1_PATH']) {
      expect(variable('sauvegarde', nom), `${nom} diverge entre postgres et sauvegarde`).toBe(
        variable('postgres', nom),
      );
    }
  });

  it('@critique les deux rétentions — PostgreSQL et MinIO — portent le MÊME horizon', () => {
    // « Une restauration PostgreSQL de J-25 désignerait des pièces jointes
    // qu'aucune archive MinIO ne contiendrait plus si MinIO était gardé moins
    // longtemps. Deux rétentions, c'est une restauration à moitié possible. »
    // C'est écrit dans le compose ET dans le script ; personne ne le gardait.
    const horizonPostgres = variable('postgres', 'PGBACKREST_REPO1_RETENTION_FULL');
    expect(variable('sauvegarde', 'PGBACKREST_REPO1_RETENTION_FULL')).toBe(horizonPostgres);
    expect(
      variable('sauvegarde', 'BACKUP_RETENTION_DAYS'),
      'La rétention MinIO du service `sauvegarde` ne suit plus celle de pgBackRest.',
    ).toBe(horizonPostgres);
  });
});
