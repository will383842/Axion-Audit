#!/usr/bin/env node
// =============================================================================
// CONVENTIONS PROPRES À LA PILE COOLIFY — les deux qui ont fait échouer un déploiement
//
// POURQUOI CE CONTRÔLE EXISTE. `infra/docker-compose.coolify.yml` obéit à DEUX
// règles que les trois autres piles du dépôt ne connaissent pas. Elles ne sont
// pas des choix de style : chacune a coûté un déploiement raté, et chacune
// n'était tenue, jusqu'ici, que par un commentaire.
//
//   1. AUCUNE INTERPOLATION DANS UNE DÉFINITION DE VOLUME.
//      Coolify refuse par principe tout `${` dans un volume — c'est un garde-fou
//      anti-injection de son analyseur (`bootstrap/helpers/parsers.php:347`) :
//
//        Invalid volume target: contains forbidden character '${'
//        (variable substitution with potential command injection)
//
//      Il s'applique AVANT le clone du dépôt : le dossier applicatif reste vide
//      et l'échec est muet côté serveur. Déploiement `wzigah3ummdyv47uukgop9lt`.
//
//   2. LES CHEMINS RELATIFS PARTENT DE LA RACINE DU DÉPÔT, PAS DE `infra/`.
//      Coolify lance `docker compose --project-directory /artifacts/<uuid>` avec
//      `-f …/infra/docker-compose.coolify.yml`. Compose résout alors les chemins
//      depuis la RACINE — l'inverse de la convention habituelle. Un `context: ..`
//      remonte au-dessus de la racine :
//
//        resolve : lstat /artifacts/apps: no such file or directory
//
//      Déploiement `ylnic2kl7ou5e00cgchrjq4m`.
//
// CE QUE CE CONTRÔLE APPORTE QUE `docker compose config` N'APPORTE PAS.
// A11 l'a établi en le mesurant : `config -q` rend **EXIT=0 DANS LES DEUX
// CONVENTIONS**. Il valide la syntaxe, pas l'existence des chemins. C'est
// précisément ce qui a laissé passer le second bug — et c'est pourquoi ce
// script vérifie que chaque chemin résolu EXISTE SUR LE DISQUE, ce qu'aucune
// commande docker ne fait à notre place.
//
// Traçabilité : E17, E43 · lot L0-b, déploiements du 2026-08-28.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');
const FICHIER = 'infra/docker-compose.coolify.yml';

const ROUGE = '[31m';
const VERT = '[32m';
const GRIS = '[90m';
const RAZ = '[0m';

const chemin = resolve(RACINE, FICHIER);
if (!existsSync(chemin)) {
  console.log(
    `${GRIS}⚠ conventions Coolify : ${FICHIER} absent — contrôle NON APPLIQUÉ (livrable du lot L0-b).${RAZ}`,
  );
  process.exit(0);
}

// Les commentaires ne sont pas du code : ce fichier documente abondamment ses
// propres pièges, et cite littéralement `${` dans son en-tête. Lire cette prose
// comme une déclaration produirait un faux positif — la faute exactement inverse
// de celle qu'on traque.
const brut = readFileSync(chemin, 'utf8').split('\n');
const lignes = brut.map((l) => (/^\s*#/.test(l) ? '' : l));

const ecarts = [];

// --- Règle 1 : aucune interpolation dans un volume ---------------------------
// On ne regarde que les entrées d'un bloc `volumes:` DE SERVICE (celles qui
// portent un `:` de montage), pas la section `volumes:` de premier niveau.
let dansVolumes = false;
for (const [i, ligne] of lignes.entries()) {
  if (/^\s{4}volumes:\s*$/.test(ligne)) {
    dansVolumes = true;
    continue;
  }
  if (dansVolumes && !/^\s*-\s/.test(ligne)) {
    dansVolumes = false;
  }
  if (!dansVolumes) continue;
  if (ligne.includes('${')) {
    ecarts.push({
      regle: 'INTERPOLATION DANS UN VOLUME',
      ligne: i + 1,
      extrait: ligne.trim(),
      pourquoi:
        "Coolify REFUSE tout `${` dans un volume (parsers.php:347) et rejette le déploiement\n    AVANT le clone — l'échec est muet côté serveur. Fige le chemin.",
    });
  }
}

// --- Règle 2 : les chemins relatifs existent DEPUIS LA RACINE -----------------
// `context:` et les sources de montage (`- ./chemin:/cible`) sont résolus depuis
// RACINE, jamais depuis `infra/`.
for (const [i, ligne] of lignes.entries()) {
  const ctx = /^\s*context:\s*(\S+)\s*$/.exec(ligne);
  const src = /^\s*-\s+(\.{1,2}\/[^:]+):/.exec(ligne);
  const rel = ctx?.[1] ?? src?.[1];
  if (!rel || !rel.startsWith('.')) continue;

  if (rel.startsWith('..')) {
    ecarts.push({
      regle: 'CHEMIN QUI REMONTE AU-DESSUS DE LA RACINE',
      ligne: i + 1,
      extrait: ligne.trim(),
      pourquoi:
        'Coolify fixe --project-directory sur la RACINE du dépôt. Un `..` sort du dépôt\n    et donne `lstat /artifacts/apps: no such file or directory`.',
    });
    continue;
  }
  const absolu = resolve(RACINE, rel);
  if (!existsSync(absolu)) {
    ecarts.push({
      regle: 'CHEMIN INEXISTANT DEPUIS LA RACINE',
      ligne: i + 1,
      extrait: ligne.trim(),
      pourquoi: `Résolu en ${absolu.slice(RACINE.length + 1) || '.'} — introuvable.\n    Les chemins de CE fichier partent de la racine, pas de infra/.`,
    });
  }
}

// --- Règle 3 : AUCUN montage de fichier depuis le dépôt ----------------------
//
// C'est la convention dont la violation est la PLUS DISCRÈTE, et elle a coûté le
// sixième déploiement. Coolify ne monte jamais depuis le dépôt cloné : il
// réécrit toute source relative vers son répertoire persistant
// `/data/coolify/applications/<uuid>/`, où il ne dépose que `docker-compose.yaml`
// et `.env`. La source n'existant pas, **Docker crée un RÉPERTOIRE VIDE** — et
// le conteneur reçoit un dossier là où il attend un fichier :
//
//     bind /data/coolify/applications/<uuid>/infra/postgres/postgresql.custom.conf
//       -> /etc/postgresql/postgresql.custom.conf
//     drwxr-xr-x 2 root root 4096 …   ← un répertoire, pas le fichier attendu
//
//     LOG:   input in flex scanner failed at file "…custom.conf" line 1
//     FATAL: configuration file "…custom.conf" contains errors
//
// Rien ne le signale avant l'exécution : `docker compose config` est content, le
// build passe, et c'est au démarrage que la base refuse de vivre. D'où ce
// contrôle — c'est A11 qui l'a réclamé en livrant, ayant constaté que les trois
// autres conventions étaient gardées et pas celle-ci.
//
// La configuration voyage donc DANS LES IMAGES (voir les Dockerfiles de
// `infra/postgres` et `infra/caddy`). Les VOLUMES NOMMÉS ne sont pas concernés :
// Coolify les gère normalement, et eux seuls doivent apparaître ici.
for (const [i, ligne] of lignes.entries()) {
  const mont = /^\s*-\s+(\.{1,2}\/[^:]+):/.exec(ligne);
  if (!mont) continue;
  ecarts.push({
    regle: 'MONTAGE DE FICHIER DEPUIS LE DÉPÔT',
    ligne: i + 1,
    extrait: ligne.trim(),
    pourquoi:
      "Coolify ne monte JAMAIS depuis le dépôt cloné : il réécrit la source vers son\n    répertoire persistant, et Docker y crée un RÉPERTOIRE VIDE. Le conteneur reçoit\n    un dossier au lieu du fichier, et meurt au démarrage — sans que rien ne l'ait\n    signalé avant. Embarque ce fichier dans l'image (voir infra/*/Dockerfile).",
  });
}

// --- Règle 2bis : les Dockerfiles désignés existent sous leur contexte --------
// `dockerfile:` reste relatif au `context:` — c'est la seule chose qui ne change
// pas entre les quatre piles, et c'est aussi ce qu'on oublie en corrigeant.
let contexteCourant = null;
for (const [i, ligne] of lignes.entries()) {
  const ctx = /^\s*context:\s*(\S+)\s*$/.exec(ligne);
  if (ctx) {
    contexteCourant = ctx[1];
    continue;
  }
  const df = /^\s*dockerfile:\s*(\S+)\s*$/.exec(ligne);
  if (!df || !contexteCourant) continue;
  const absolu = resolve(RACINE, contexteCourant, df[1]);
  if (!existsSync(absolu)) {
    ecarts.push({
      regle: 'DOCKERFILE INTROUVABLE SOUS SON CONTEXTE',
      ligne: i + 1,
      extrait: ligne.trim(),
      pourquoi: `context « ${contexteCourant} » + dockerfile « ${df[1]}» → ${dirname(absolu)} : rien.`,
    });
  }
}

if (ecarts.length > 0) {
  console.error(
    `${ROUGE}✗ CONVENTIONS COOLIFY — ${String(ecarts.length)} écart(s) dans ${FICHIER}.${RAZ}\n`,
  );
  for (const e of ecarts) {
    console.error(`  ${ROUGE}${e.regle}${RAZ}  ligne ${String(e.ligne)}`);
    console.error(`    ${e.extrait}`);
    console.error(`    ${GRIS}${e.pourquoi}${RAZ}\n`);
  }
  console.error(
    `  Ces deux règles ne sont pas du style : chacune a coûté un déploiement raté.\n` +
      `  Et \`docker compose config -q\` ne les voit PAS — il rend EXIT=0 dans les deux\n` +
      `  conventions, parce qu'il valide la syntaxe et non l'existence des chemins.\n` +
      `  Validation locale correcte :\n` +
      `    docker compose --project-directory . -f ${FICHIER} config\n`,
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} conventions Coolify : aucun \`\${\` dans un volume, tous les chemins résolus depuis la racine existent.`,
);
