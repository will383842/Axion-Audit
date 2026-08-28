#!/usr/bin/env node
// =============================================================================
// ISOLATION RÉSEAU DU STAGING — un seul service a le droit de toucher le voisin
//
// POURQUOI CE CONTRÔLE EXISTE, ET IL EST NÉ D'UNE MESURE.
//
// Le staging d'Axion Audit est déployé par Coolify sur `axionia-web`, LA MACHINE
// QUI HÉBERGE LE SITE DE PRODUCTION `axion-ia.com`. Pour être joignable, notre
// frontal doit rejoindre le réseau Docker du proxy Traefik — `coolify` — sur
// lequel vivent aussi les conteneurs du voisin.
//
// L'agent sécurité A54 a mesuré ce réseau : `Options = {}`, donc **ICC activé**.
// Tout conteneur qui le rejoint obtient une route L3 directe vers :
//
//   · `u7zlql3bpb1xy5t4kg6jnvpm:5432`  → PostgreSQL d'axion-ia.com
//   · `hdfknlij6yqebr09p379m9q6:6379`  → son Redis
//   · `coolify-db`, et l'interface Coolify elle-même
//
// Un mot de passe reste exigé, mais **l'isolation réseau — la seule barrière qui
// ne dépend pas d'un secret — disparaît**. Le 02 §30.4-4 est explicite : un
// secret de staging ne doit RIEN pouvoir sur la production.
//
// D'où la règle : **SEUL le service `caddy` rejoint ce réseau.** Il ne détient
// aucun secret, n'ouvre aucune connexion sortante de lui-même, et sert des
// fichiers statiques. La base, Redis, MinIO, l'API et le worker restent sur le
// réseau interne, inatteignables depuis le voisin comme l'inverse.
//
// CE QUE CE CONTRÔLE EMPÊCHE, CONCRÈTEMENT. Un `edge: {}` ajouté sous `api` —
// deux mots, dans un fichier de 750 lignes, par quelqu'un qui veut « juste
// exposer l'API directement ». Rien ne le signalerait : la pile démarrerait, les
// tests passeraient, et l'API de staging aurait une route ouverte vers la base
// de production. C'est A11 qui a relevé que cette exigence n'était tenue que par
// un commentaire ; un commentaire n'a jamais arrêté personne.
//
// Traçabilité : invariant 3 (étanchéité) · 02 §30.4-4 · DECISIONS.md 2026-08-28.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');
const FICHIER = 'infra/docker-compose.coolify.yml';

// Le seul service autorisé à rejoindre le réseau du proxy, et le nom que la pile
// donne à ce réseau. Élargir cette liste est une DÉCISION, pas une correction :
// elle se trace dans DECISIONS.md avec son motif.
const SERVICE_AUTORISE = 'caddy';
const RESEAU_PARTAGE = 'edge';

const ROUGE = '[31m';
const VERT = '[32m';
const GRIS = '[90m';
const RAZ = '[0m';

const chemin = resolve(RACINE, FICHIER);
if (!existsSync(chemin)) {
  // Le fichier est un livrable du lot L0-b. Tant qu'il n'existe pas, ce contrôle
  // n'a rien à comparer — et il le DIT, il ne se déclare pas vert.
  console.log(
    `${GRIS}⚠ isolation réseau : ${FICHIER} absent — contrôle NON APPLIQUÉ (livrable du lot L0-b).${RAZ}`,
  );
  process.exit(0);
}

// Les commentaires ne sont pas du code : ce fichier documente abondamment son
// propre réseau, et lire cette prose comme une déclaration produirait un faux
// positif — la faute exactement inverse de celle qu'on traque ici.
const lignes = readFileSync(chemin, 'utf8')
  .split('\n')
  .map((l) => (/^\s*#/.test(l) ? '' : l));

let serviceCourant = null;
let dansServices = false;
let dansNetworksDuService = false;
const fautifs = [];

for (const [i, ligne] of lignes.entries()) {
  if (/^services:\s*$/.test(ligne)) {
    dansServices = true;
    continue;
  }
  // Toute clé de premier niveau (networks:, volumes:…) referme la section.
  if (/^[a-z]/.test(ligne)) {
    dansServices = /^services:/.test(ligne);
    serviceCourant = null;
    dansNetworksDuService = false;
    continue;
  }
  if (!dansServices) continue;

  const service = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(ligne);
  if (service) {
    serviceCourant = service[1];
    dansNetworksDuService = false;
    continue;
  }
  if (!serviceCourant) continue;

  // `networks:` d'un service est à 4 espaces ; ses entrées à 6.
  if (/^ {4}networks:/.test(ligne)) {
    dansNetworksDuService = true;
    // Forme courte sur une ligne : `networks: [axion, edge]`.
    if (new RegExp(`\\b${RESEAU_PARTAGE}\\b`).test(ligne) && serviceCourant !== SERVICE_AUTORISE) {
      fautifs.push({ service: serviceCourant, ligne: i + 1, extrait: ligne.trim() });
    }
    continue;
  }
  // Une autre clé à 4 espaces referme le bloc `networks:`.
  if (/^ {4}[a-z]/.test(ligne)) {
    dansNetworksDuService = false;
    continue;
  }
  if (!dansNetworksDuService) continue;

  // Forme longue : le réseau est une entrée à 6 espaces.
  if (new RegExp(`^ {6}${RESEAU_PARTAGE}:`).test(ligne) && serviceCourant !== SERVICE_AUTORISE) {
    fautifs.push({ service: serviceCourant, ligne: i + 1, extrait: ligne.trim() });
  }
}

if (fautifs.length > 0) {
  console.error(
    `${ROUGE}✗ ISOLATION RÉSEAU ROMPUE — ${String(fautifs.length)} service(s) rejoignent « ${RESEAU_PARTAGE} ».${RAZ}\n`,
  );
  for (const f of fautifs) {
    console.error(`  ${ROUGE}${f.service}${RAZ}  ${FICHIER}:${String(f.ligne)}   ${f.extrait}`);
  }
  console.error(
    `\n  Ce réseau est celui du proxy Traefik de Coolify, PARTAGÉ avec le site de\n` +
      `  production axion-ia.com. Il a l'ICC activé (mesuré) : tout conteneur qui le\n` +
      `  rejoint obtient une route directe vers la base PostgreSQL et le Redis du\n` +
      `  voisin. Le 02 §30.4-4 exige qu'un secret de staging ne puisse RIEN sur la\n` +
      `  production — l'isolation réseau est la seule barrière qui ne dépende pas\n` +
      `  d'un mot de passe.\n\n` +
      `  Seul « ${SERVICE_AUTORISE} » y a droit : il ne détient aucun secret et n'ouvre aucune\n` +
      `  connexion sortante. Si un autre service DOIT y accéder, ce n'est pas une\n` +
      `  correction, c'est une décision — elle s'écrit dans DECISIONS.md avec son\n` +
      `  motif, et cette liste s'élargit dans le même commit.\n`,
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} isolation réseau : seul « ${SERVICE_AUTORISE} » rejoint « ${RESEAU_PARTAGE} ».\n` +
    `  ${GRIS}base, Redis, MinIO, API et worker restent hors du réseau partagé avec axion-ia.com${RAZ}`,
);
