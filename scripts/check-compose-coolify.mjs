#!/usr/bin/env node
// =============================================================================
// CONVENTIONS PROPRES À LA PILE COOLIFY — celles qui ont fait échouer un déploiement
//
// POURQUOI CE CONTRÔLE EXISTE. `infra/docker-compose.coolify.yml` obéit à des
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
//   3. AUCUN FICHIER DU DÉPÔT N'EST MONTÉ — LA CONFIG VOYAGE DANS LES IMAGES.
//      Coolify ne monte jamais depuis le dépôt cloné : il réécrit toute source
//      relative vers son répertoire persistant `/data/coolify/applications/<uuid>/`,
//      où il ne dépose que `docker-compose.yaml` et `.env`. La source n'existant
//      pas, **Docker crée un RÉPERTOIRE VIDE** — et le conteneur reçoit un dossier
//      là où il attend un fichier :
//
//        bind /data/coolify/applications/<uuid>/infra/postgres/postgresql.custom.conf
//          -> /etc/postgresql/postgresql.custom.conf
//        drwxr-xr-x 2 root root 4096 …   ← un répertoire, pas le fichier attendu
//
//        LOG:   input in flex scanner failed at file "…custom.conf" line 1
//        FATAL: configuration file "…custom.conf" contains errors
//
//      Rien ne le signale avant l'exécution : `docker compose config` est content,
//      le build passe, et c'est au démarrage que la base refuse de vivre.
//      Déploiement `wrunr6mwq2oxqq392i4myzjn`.
//
// CE QUE CE CONTRÔLE APPORTE QUE `docker compose config` N'APPORTE PAS.
// A11 l'a établi en le mesurant : `config -q` rend **EXIT=0 DANS LES QUATRE
// CONVENTIONS**. Il valide la syntaxe, pas l'existence des chemins ni la façon
// dont Coolify réécrit les sources. C'est précisément ce qui a laissé passer le
// second bug — et c'est pourquoi ce script vérifie que chaque chemin résolu
// EXISTE SUR LE DISQUE, ce qu'aucune commande docker ne fait à notre place.
//
// -----------------------------------------------------------------------------
// RÉVISION DU 2026-08-28 — POURQUOI CE CONTRÔLE A ÉTÉ RÉÉCRIT
// -----------------------------------------------------------------------------
// La première version cherchait des FORMES D'ÉCRITURE au moyen d'expressions
// régulières appliquées ligne à ligne : `^\s{4}volumes:\s*$`, puis `^\s*-\s`
// pour rester dans le bloc. Une revue croisée l'a mesurée — 5 lignes de volume
// inspectées sur 10 présentes, et le bloc `volumes:` de `caddy` JAMAIS OUVERT.
// La cause : les lignes de commentaire étaient blanchies en chaîne vide, et une
// chaîne vide ne correspond pas à `^\s*-\s` ; le bloc se refermait donc au
// PREMIER commentaire — et celui de `caddy` en compte huit d'affilée. Le
// contrôle attrapait exactement la forme qui avait servi à l'écrire.
//
// Ce fichier ne cherche donc plus des formes : il LIT LA STRUCTURE du document
// et raisonne sur des PROPRIÉTÉS.
//
//   PROPRIÉTÉ GARDÉE : tout montage déclaré par un service de cette pile est un
//   VOLUME NOMMÉ, déclaré dans la section `volumes:` de premier niveau, et sa
//   définition ne contient aucune interpolation ; et tout chemin relatif du
//   fichier (contexte de build, Dockerfile, source de montage, `env_file`,
//   `configs`/`secrets`) se résout DEPUIS LA RACINE du dépôt et existe.
//
// Cette propriété ne dépend d'aucune écriture particulière : forme courte
// (`- nom:/cible`), forme longue (`type:`/`source:`/`target:`), séquence en flux
// (`volumes: ['a:/b']`), tiret aligné sur la clé, commentaires intercalés,
// ancre YAML fusionnée par `<<:` — toutes passent par le même chemin de code.
//
// -----------------------------------------------------------------------------
// CE QUE CE CONTRÔLE NE GARDE PAS — LIMITES ASSUMÉES, À LIRE AVANT DE S'Y FIER
// -----------------------------------------------------------------------------
//   · Il ne lit QUE `infra/docker-compose.coolify.yml`. Un montage ajouté dans
//     l'interface de Coolify (« Persistent Storage »), un `include:` ou un
//     `extends:` vers un autre fichier lui sont INVISIBLES — il n'y a rien à
//     lire dans ce dépôt pour les voir.
//   · Le lecteur YAML embarqué plus bas est un SOUS-ENSEMBLE écrit à la main :
//     11 §1 fige la liste des dépendances et aucun analyseur YAML n'y figure.
//     Il sait : indentation, séquences (tiret indenté ou aligné), collections en
//     flux sur une ou plusieurs lignes, guillemets, commentaires de fin de ligne,
//     scalaires de bloc (`|`, `>`), ancres, alias et fusion `<<:`.
//     Il NE sait PAS : documents multiples (`---`), balises (`!!str`), clés
//     entre guillemets, clés complexes (`? :`), alias vers une ancre définie
//     dans un service (seules les ancres de premier niveau sont résolues).
//     Une écriture qu'il ne sait pas lire n'est pas signalée : elle est IGNORÉE.
//     C'est pourquoi il compte ce qu'il a inspecté et l'AFFICHE — un compte qui
//     s'effondre est le symptôme à surveiller.
//   · Il ne vérifie pas que le CONTENU d'une image contient bien la config qu'on
//     a cessé de monter. Le Dockerfile en répond, pas ce script.
//   · Il ne rejoue pas la substitution des variables : `${VAR:-défaut}` est lu
//     pour sa valeur par défaut uniquement.
//
// Traçabilité : E17, E43 · lot L0-b, déploiements du 2026-08-28.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');
const FICHIER = 'infra/docker-compose.coolify.yml';

const ROUGE = '\u001B[31m';
const VERT = '\u001B[32m';
const GRIS = '\u001B[90m';
const RAZ = '\u001B[0m';

const chemin = resolve(RACINE, FICHIER);
if (!existsSync(chemin)) {
  console.log(
    `${GRIS}⚠ conventions Coolify : ${FICHIER} absent — contrôle NON APPLIQUÉ (livrable du lot L0-b).${RAZ}`,
  );
  process.exit(0);
}

// =============================================================================
// LECTEUR YAML MINIMAL
// -----------------------------------------------------------------------------
// Il rend un arbre de nœuds { type, cle, valeur, indent, ligne, enfants }. Les
// commentaires sont retirés PAR LEUR SYNTAXE (un `#` précédé d'un blanc, hors
// guillemets), jamais en blanchissant la ligne entière : blanchir détruisait la
// structure et c'est ce qui a rendu la version précédente aveugle.
// =============================================================================

/** Retire un commentaire de fin de ligne sans toucher aux `#` entre guillemets. */
function retirerCommentaire(ligne) {
  let simple = false;
  let doubles = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '\\' && doubles) {
      i += 1;
      continue;
    }
    if (c === "'" && !doubles) simple = !simple;
    else if (c === '"' && !simple) doubles = !doubles;
    else if (c === '#' && !simple && !doubles && (i === 0 || /\s/.test(ligne[i - 1]))) {
      return ligne.slice(0, i);
    }
  }
  return ligne;
}

/** Profondeur des collections en flux (`[`, `{`) hors guillemets, cumulée. */
function profondeurFlux(ligne, depart) {
  let p = depart;
  let simple = false;
  let doubles = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '\\' && doubles) {
      i += 1;
      continue;
    }
    if (c === "'" && !doubles) simple = !simple;
    else if (c === '"' && !simple) doubles = !doubles;
    else if (!simple && !doubles) {
      if (c === '[' || c === '{') p += 1;
      else if (c === ']' || c === '}') p -= 1;
    }
  }
  return p < 0 ? 0 : p;
}

function creerNoeud(type, cle, valeur, indent, ligne, brut) {
  return { type, cle, valeur, indent, ligne, brut, ancre: null, enfants: [] };
}

/** Extrait une ancre `&nom` en tête de valeur et la retire de la valeur. */
function extraireAncre(noeud) {
  const m = /^&([^\s[\]{},]+)\s*(.*)$/.exec(noeud.valeur);
  if (!m) return;
  noeud.ancre = m[1];
  noeud.valeur = m[2].trim();
}

function rattacher(pile, noeud, estSequence) {
  while (pile.length > 1) {
    const sommet = pile[pile.length - 1];
    if (sommet.indent < noeud.indent) break;
    // Un tiret ALIGNÉ sur sa clé appartient bien à cette clé : c'est une écriture
    // parfaitement légale, et la plus courante après la forme indentée.
    if (
      estSequence &&
      sommet.indent === noeud.indent &&
      sommet.type === 'mapping' &&
      sommet.valeur === ''
    ) {
      break;
    }
    pile.pop();
  }
  pile[pile.length - 1].enfants.push(noeud);
  pile.push(noeud);
}

function analyserYaml(texte) {
  const brutes = texte.split('\n');

  // 1. Neutraliser le CONTENU des scalaires de bloc (`|`, `>`) : ce n'est pas du
  //    YAML, c'est du texte — le script `createbuckets` en est plein.
  const masque = new Array(brutes.length).fill(false);
  for (let i = 0; i < brutes.length; i += 1) {
    if (masque[i]) continue;
    const sansCom = retirerCommentaire(brutes[i]);
    if (sansCom.trim() === '' || !/(^|[\s:-])[|>][+-]?\d*\s*$/.test(sansCom)) continue;
    const indent = sansCom.length - sansCom.trimStart().length;
    for (let j = i + 1; j < brutes.length; j += 1) {
      if (brutes[j].trim() === '') {
        masque[j] = true;
        continue;
      }
      if (brutes[j].length - brutes[j].trimStart().length <= indent) break;
      masque[j] = true;
    }
  }

  // 2. Lignes logiques : une collection en flux ouverte absorbe les suivantes.
  const logiques = [];
  for (let i = 0; i < brutes.length; i += 1) {
    if (masque[i]) continue;
    let texteL = retirerCommentaire(brutes[i]);
    const debut = i;
    let p = profondeurFlux(texteL, 0);
    while (p > 0 && i + 1 < brutes.length) {
      i += 1;
      const suite = masque[i] ? '' : retirerCommentaire(brutes[i]);
      texteL += ` ${suite.trim()}`;
      p = profondeurFlux(suite, p);
    }
    if (texteL.trim() !== '') logiques.push({ texte: texteL, ligne: debut + 1 });
  }

  // 3. Arbre par indentation.
  const racine = creerNoeud('racine', null, '', -1, 0, '');
  const pile = [racine];
  for (const l of logiques) {
    let indent = l.texte.length - l.texte.trimStart().length;
    let reste = l.texte.trim();
    let dernierItem = null;

    for (;;) {
      const m = /^-(\s+|$)/.exec(reste);
      if (!m) break;
      const item = creerNoeud('sequence', null, '', indent, l.ligne, l.texte.trim());
      rattacher(pile, item, true);
      dernierItem = item;
      indent += m[0].length;
      reste = reste.slice(m[0].length);
    }
    if (reste === '') continue;

    const mm = /^([^:\s'"[\]{}][^:]*?)\s*:(?:\s+(.*))?$/.exec(reste);
    if (mm) {
      const noeud = creerNoeud(
        'mapping',
        mm[1].trim(),
        (mm[2] ?? '').trim(),
        indent,
        l.ligne,
        reste,
      );
      extraireAncre(noeud);
      rattacher(pile, noeud, false);
    } else if (dernierItem) {
      dernierItem.valeur = reste;
      extraireAncre(dernierItem);
    } else {
      const noeud = creerNoeud('scalaire', null, reste, indent, l.ligne, reste);
      rattacher(pile, noeud, false);
    }
  }
  return racine;
}

/** Registre des ancres, tous niveaux confondus. */
function collecterAncres(noeud, registre = new Map()) {
  for (const e of noeud.enfants) {
    if (e.ancre) registre.set(e.ancre, e);
    collecterAncres(e, registre);
  }
  return registre;
}

/**
 * Enfants d'un nœud, fusion `<<:` et alias direct (`cle: *ancre`) RÉSOLUS.
 * Sans cela, `volumes:` ou `networks:` glissés dans une ancre seraient invisibles.
 */
function enfantsEffectifs(noeud, ancres, vus = new Set()) {
  if (!noeud) return [];
  const sortie = [];
  for (const e of noeud.enfants) {
    if (e.type === 'mapping' && e.cle === '<<') {
      for (const nom of e.valeur.match(/\*[^\s[\]{},]+/g) ?? []) {
        const cle = nom.slice(1);
        const cible = ancres.get(cle);
        if (cible && !vus.has(cle)) {
          sortie.push(...enfantsEffectifs(cible, ancres, new Set([...vus, cle])));
        }
      }
      continue;
    }
    sortie.push(e);
  }
  const alias = /^\*([^\s[\]{},]+)$/.exec(noeud.valeur ?? '');
  if (alias && ancres.has(alias[1]) && !vus.has(alias[1])) {
    sortie.push(...enfantsEffectifs(ancres.get(alias[1]), ancres, new Set([...vus, alias[1]])));
  }
  return sortie;
}

function enfant(noeud, ancres, cle) {
  return enfantsEffectifs(noeud, ancres).find((e) => e.type === 'mapping' && e.cle === cle);
}

function deguillemeter(v) {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === "'" && t.at(-1) === "'") || (t[0] === '"' && t.at(-1) === '"'))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Découpe une collection en flux `[a, b]` en ses éléments (guillemets respectés). */
function elementsFlux(valeur) {
  const v = valeur.trim();
  if (!v.startsWith('[')) return null;
  const fin = v.lastIndexOf(']');
  const interieur = v.slice(1, fin === -1 ? v.length : fin);
  const sortie = [];
  let courant = '';
  let simple = false;
  let doubles = false;
  let prof = 0;
  for (const c of interieur) {
    if (c === "'" && !doubles) simple = !simple;
    else if (c === '"' && !simple) doubles = !doubles;
    if (!simple && !doubles) {
      if (c === '[' || c === '{') prof += 1;
      else if (c === ']' || c === '}') prof -= 1;
      else if (c === ',' && prof === 0) {
        sortie.push(courant);
        courant = '';
        continue;
      }
    }
    courant += c;
  }
  sortie.push(courant);
  return sortie.map(deguillemeter).filter((s) => s !== '');
}

// =============================================================================
// LECTURE DU FICHIER
// =============================================================================
const racine = analyserYaml(readFileSync(chemin, 'utf8'));
const ancres = collecterAncres(racine);
const noeudServices = enfant(racine, ancres, 'services');
const services = enfantsEffectifs(noeudServices, ancres).filter(
  (n) => n.type === 'mapping' && n.cle,
);

const ecarts = [];
let montagesInspectes = 0;
let cheminsInspectes = 0;

// Un lecteur qui ne trouve plus rien est un lecteur cassé, pas un fichier propre.
// Ce contrôle-ci a déjà été vert en n'inspectant que la moitié du fichier : il
// refuse désormais de se déclarer vert sur un arbre vide.
if (services.length === 0) {
  console.error(
    `${ROUGE}✗ CONVENTIONS COOLIFY — aucun service lu dans ${FICHIER}.${RAZ}\n` +
      `  Le lecteur YAML de ce script n'a rien reconnu : soit le fichier a changé de\n` +
      `  forme, soit le lecteur est cassé. Dans les deux cas il n'a RIEN vérifié —\n` +
      `  et un contrôle qui ne vérifie rien ne rend pas EXIT=0.\n`,
  );
  process.exit(1);
}

// =============================================================================
// COLLECTE DES MONTAGES — toutes les écritures, un seul chemin de code
// =============================================================================
const volumesDeclares = new Set(
  enfantsEffectifs(enfant(racine, ancres, 'volumes'), ancres)
    .filter((n) => n.type === 'mapping' && n.cle)
    .map((n) => n.cle),
);

/** Découpe `source:cible:mode` en respectant les `${VAR:-défaut}`. */
function couperMontage(entree) {
  const parts = [];
  let courant = '';
  let prof = 0;
  for (let i = 0; i < entree.length; i += 1) {
    const c = entree[i];
    if (c === '$' && entree[i + 1] === '{') {
      prof += 1;
      courant += '${';
      i += 1;
      continue;
    }
    if (c === '}' && prof > 0) {
      prof -= 1;
      courant += c;
      continue;
    }
    if (c === ':' && prof === 0) {
      parts.push(courant);
      courant = '';
      continue;
    }
    courant += c;
  }
  parts.push(courant);
  return parts;
}

const NOM_DE_VOLUME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Rend la liste des montages d'un service, quelle qu'en soit l'écriture. */
function montagesDuService(service) {
  const noeudVolumes = enfant(service, ancres, 'volumes');
  if (!noeudVolumes) return [];
  const montages = [];

  // Forme en flux sur la clé : `volumes: ['a:/b', 'c:/d']`.
  for (const el of elementsFlux(noeudVolumes.valeur) ?? []) {
    montages.push({ court: el, ligne: noeudVolumes.ligne, extrait: `volumes: … ${el}` });
  }

  for (const item of enfantsEffectifs(noeudVolumes, ancres)) {
    if (item.type !== 'sequence') continue;
    if (item.valeur.trim() !== '') {
      // Forme courte : `- nom:/cible[:mode]`.
      montages.push({
        court: deguillemeter(item.valeur),
        ligne: item.ligne,
        extrait: item.brut,
      });
      continue;
    }
    // Forme longue : `- type: bind` / `source:` / `target:`.
    const champs = new Map();
    for (const c of enfantsEffectifs(item, ancres)) {
      if (c.type === 'mapping' && c.cle) champs.set(c.cle, c);
    }
    if (champs.size === 0) continue;
    const ligne = champs.get('source')?.ligne ?? champs.get('type')?.ligne ?? item.ligne;
    montages.push({
      long: champs,
      ligne,
      extrait: [...champs.entries()]
        .map(([k, v]) => `${k}: ${deguillemeter(v.valeur)}`)
        .join(' · '),
    });
  }
  return montages;
}

const POURQUOI_INTERPOLATION =
  'Coolify REFUSE tout `${` dans un volume (parsers.php:347) et rejette le déploiement\n' +
  "    AVANT le clone — l'échec est muet côté serveur. Fige le chemin.";

const POURQUOI_BIND =
  'Coolify ne monte JAMAIS un chemin de la machine ni du dépôt cloné : il réécrit la\n' +
  '    source vers son répertoire persistant /data/coolify/applications/<uuid>/, où seuls\n' +
  '    docker-compose.yaml et .env existent. Docker CRÉE ALORS UN RÉPERTOIRE VIDE : le\n' +
  '    conteneur reçoit un dossier au lieu du fichier attendu et meurt au démarrage\n' +
  "    (postgres bouclait en Restarting (1)), sans que rien ne l'ait signalé avant.\n" +
  "    Embarque ce fichier dans l'image (voir infra/*/Dockerfile).";

const cheminsARésoudre = [];

for (const service of services) {
  for (const m of montagesDuService(service)) {
    montagesInspectes += 1;
    const base = { ligne: m.ligne, extrait: m.extrait, service: service.cle };

    // --- Règle 1 : aucune interpolation, où qu'elle soit dans la définition ---
    const texteMontage = m.court ?? m.extrait;
    if (texteMontage.includes('${')) {
      ecarts.push({
        regle: 'INTERPOLATION DANS UN VOLUME',
        ...base,
        pourquoi: POURQUOI_INTERPOLATION,
      });
    }

    // --- Détermination de la source, quelle que soit la forme ---------------
    let source = null;
    let type = null;
    if (m.long) {
      type = m.long.has('type') ? deguillemeter(m.long.get('type').valeur) : null;
      source = m.long.has('source') ? deguillemeter(m.long.get('source').valeur) : null;
      if (type === 'tmpfs' || type === 'npipe') continue; // sans source, hors sujet
      if (type && type !== 'bind' && type !== 'volume') {
        ecarts.push({
          regle: 'FORME DE MONTAGE NON RECONNUE',
          ...base,
          pourquoi:
            `Type de montage « ${type} » inconnu de ce contrôle : il ne peut RIEN garantir\n` +
            '    dessus. Refusé par défaut plutôt que toléré en silence.',
        });
        continue;
      }
    } else {
      const parts = couperMontage(m.court);
      if (parts.length < 2) {
        ecarts.push({
          regle: 'MONTAGE ANONYME',
          ...base,
          pourquoi:
            'Un montage sans source nommée crée un VOLUME ANONYME : son nom est tiré au sort\n' +
            '    par Docker, il échappe au préfixe `axion-coolify-` et rien ne le rattache à\n' +
            '    cette pile. Nomme-le dans la section `volumes:` de premier niveau.',
        });
        continue;
      }
      source = parts[0];
    }
    if (source === null) continue;

    // --- Règle 2 : la source est un VOLUME NOMMÉ, et il est déclaré ---------
    const estChemin =
      type === 'bind' ||
      source.startsWith('.') ||
      source.startsWith('~') ||
      source.startsWith('/') ||
      source.includes('/') ||
      source.includes('\\');

    if (estChemin) {
      ecarts.push({
        regle: 'MONTAGE DEPUIS LA MACHINE OU LE DÉPÔT',
        ...base,
        pourquoi: POURQUOI_BIND,
      });
      if (source.startsWith('.')) {
        cheminsARésoudre.push({ rel: source, ligne: m.ligne, extrait: m.extrait, base: '.' });
      }
      continue;
    }
    if (source.includes('${')) continue; // déjà signalé par la règle 1
    if (!NOM_DE_VOLUME.test(source)) {
      ecarts.push({
        regle: 'FORME DE MONTAGE NON RECONNUE',
        ...base,
        pourquoi:
          `Source « ${source} » : ni un chemin, ni un nom de volume lisible. Ce contrôle ne\n` +
          '    sait pas ce que Coolify en fera — il refuse plutôt que de supposer.',
      });
      continue;
    }
    if (!volumesDeclares.has(source)) {
      ecarts.push({
        regle: 'VOLUME NOMMÉ NON DÉCLARÉ',
        ...base,
        pourquoi:
          `« ${source} » n'apparaît pas dans la section \`volumes:\` de premier niveau. Compose\n` +
          '    le créerait avec un nom préfixé par le projet imposé par Coolify — donc sans le\n' +
          '    préfixe `axion-coolify-`, avec un risque de collision avec les volumes du site\n' +
          '    voisin sur la même machine.',
      });
    }
  }
}

// =============================================================================
// CHEMINS RELATIFS — contexte, Dockerfile, env_file, configs, secrets
// =============================================================================
for (const service of services) {
  const build = enfant(service, ancres, 'build');
  if (build) {
    let contexte = null;
    let noeudContexte = build;
    if (build.valeur.trim() !== '' && !build.valeur.startsWith('*')) {
      contexte = deguillemeter(build.valeur); // forme courte `build: ./infra`
    } else {
      const c = enfant(build, ancres, 'context');
      if (c) {
        contexte = deguillemeter(c.valeur);
        noeudContexte = c;
      }
    }
    if (contexte !== null) {
      cheminsARésoudre.push({
        rel: contexte,
        ligne: noeudContexte.ligne,
        extrait: noeudContexte.brut,
        base: '.',
      });
    }
    const df = enfant(build, ancres, 'dockerfile');
    if (df) {
      cheminsARésoudre.push({
        rel: deguillemeter(df.valeur),
        ligne: df.ligne,
        extrait: df.brut,
        base: contexte ?? '.',
        dockerfile: true,
        contexte: contexte ?? '.',
      });
    }
  }

  const envFile = enfant(service, ancres, 'env_file');
  if (envFile) {
    const valeurs = [
      ...(elementsFlux(envFile.valeur) ??
        (envFile.valeur.trim() ? [deguillemeter(envFile.valeur)] : [])),
      ...enfantsEffectifs(envFile, ancres)
        .filter((n) => n.type === 'sequence' && n.valeur.trim() !== '')
        .map((n) => deguillemeter(n.valeur)),
    ];
    for (const v of valeurs) {
      cheminsARésoudre.push({ rel: v, ligne: envFile.ligne, extrait: envFile.brut, base: '.' });
    }
  }
}

// `configs:` et `secrets:` de premier niveau désignent, eux aussi, des FICHIERS
// DU DÉPÔT : ils subissent exactement la réécriture décrite plus haut. C'est le
// même trou que les montages, par une autre porte.
for (const section of ['configs', 'secrets']) {
  for (const decl of enfantsEffectifs(enfant(racine, ancres, section), ancres)) {
    const f = enfant(decl, ancres, 'file');
    if (!f) continue;
    const valeur = deguillemeter(f.valeur);
    ecarts.push({
      regle: `FICHIER DU DÉPÔT EXPOSÉ PAR \`${section}:\``,
      ligne: f.ligne,
      extrait: f.brut,
      pourquoi:
        `\`${section}: … file:\` monte un fichier du dépôt dans les conteneurs, exactement comme\n` +
        '    un volume bind — et se heurte à la même réécriture de source par Coolify, donc au\n' +
        '    même RÉPERTOIRE VIDE. La configuration voyage dans les IMAGES, sans exception.',
    });
    if (valeur.startsWith('.')) {
      cheminsARésoudre.push({ rel: valeur, ligne: f.ligne, extrait: f.brut, base: '.' });
    }
  }
}

for (const c of cheminsARésoudre) {
  if (c.rel === '' || c.rel.includes('${') || isAbsolute(c.rel)) continue;
  cheminsInspectes += 1;

  if (c.rel.startsWith('..') || c.rel.includes('/../')) {
    ecarts.push({
      regle: 'CHEMIN QUI REMONTE AU-DESSUS DE LA RACINE',
      ligne: c.ligne,
      extrait: c.extrait,
      pourquoi:
        'Coolify fixe --project-directory sur la RACINE du dépôt. Un `..` sort du dépôt\n    et donne `lstat /artifacts/apps: no such file or directory`.',
    });
    continue;
  }
  const absolu = resolve(RACINE, c.base, c.rel);
  if (existsSync(absolu)) continue;

  if (c.dockerfile) {
    ecarts.push({
      regle: 'DOCKERFILE INTROUVABLE SOUS SON CONTEXTE',
      ligne: c.ligne,
      extrait: c.extrait,
      pourquoi: `context « ${c.contexte} » + dockerfile « ${c.rel} » → ${dirname(absolu)} : rien.`,
    });
    continue;
  }
  ecarts.push({
    regle: 'CHEMIN INEXISTANT DEPUIS LA RACINE',
    ligne: c.ligne,
    extrait: c.extrait,
    pourquoi:
      `Résolu en ${absolu.slice(RACINE.length + 1) || '.'} — introuvable.\n` +
      '    Les chemins de CE fichier partent de la racine, pas de infra/.',
  });
}

// =============================================================================
// VERDICT
// =============================================================================
if (ecarts.length > 0) {
  ecarts.sort((a, b) => a.ligne - b.ligne);
  console.error(
    `${ROUGE}✗ CONVENTIONS COOLIFY — ${String(ecarts.length)} écart(s) dans ${FICHIER}.${RAZ}\n`,
  );
  for (const e of ecarts) {
    const ou = e.service ? `  (service « ${e.service} »)` : '';
    console.error(`  ${ROUGE}${e.regle}${RAZ}  ligne ${String(e.ligne)}${ou}`);
    console.error(`    ${e.extrait}`);
    console.error(`    ${GRIS}${e.pourquoi}${RAZ}\n`);
  }
  console.error(
    `  Ces règles ne sont pas du style : chacune a coûté un déploiement raté.\n` +
      `  Et \`docker compose config -q\` ne les voit PAS — il rend EXIT=0 dans toutes,\n` +
      `  parce qu'il valide la syntaxe et non l'existence des chemins.\n` +
      `  Validation locale correcte :\n` +
      `    docker compose --project-directory . -f ${FICHIER} config\n`,
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} conventions Coolify : ${String(montagesInspectes)} montage(s) inspecté(s) sur ` +
    `${String(services.length)} service(s), tous volumes nommés et déclarés, sans \`\${\` ; ` +
    `${String(cheminsInspectes)} chemin(s) relatif(s) résolu(s) depuis la racine et existants.`,
);
