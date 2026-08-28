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
// -----------------------------------------------------------------------------
// RÉVISION DU 2026-08-28 — CE CONTRÔLE GARDAIT UN MOT, PAS UNE PROPRIÉTÉ
// -----------------------------------------------------------------------------
// La première version cherchait le NOM `edge` : `^ {6}edge:` pour la forme
// longue, `\bedge\b` sur la ligne `networks:` pour la forme en flux. Une revue
// croisée l'a mise en échec de six façons, dont la PLUS COURANTE de toutes —
// la séquence YAML :
//
//     networks:
//       - axion
//       - edge        ← un tiret suffisait à passer
//
// et deux qui ne prononcent jamais le mot `edge` : un SECOND ALIAS du même
// réseau (`proxy: {name: coolify, external: true}` attaché à `api`), et un
// `network_mode: 'service:caddy'` sur `worker`, qui n'attache aucun réseau mais
// hérite de la PILE RÉSEAU de Caddy — donc de sa route vers le voisin.
//
// Ce fichier ne garde donc plus un nom. Il garde une PROPRIÉTÉ :
//
//   PROPRIÉTÉ GARDÉE : aucun service autre que `caddy` n'obtient de route vers
//   un réseau que cette pile ne crée pas elle-même — ni en le déclarant sous un
//   nom quelconque, ni en héritant de la pile réseau d'un autre conteneur.
//
// UN RÉSEAU EST TENU POUR PARTAGÉ (donc hors de notre contrôle) DÈS QU'IL EST :
//   a) `external: true` — par définition, il existe déjà sur la machine et nous
//      ne savons pas qui d'autre s'y trouve ; ou
//   b) porteur d'un `name:` explicite qui ne commence pas par le nom de projet
//      déclaré en tête du fichier (`name:`) — car Compose RÉUTILISE un réseau
//      existant qui porte ce nom, même sans `external: true` ; ou
//   c) porteur d'un `name:` qu'on ne peut pas résoudre (`${VAR}` sans valeur par
//      défaut) — on ne suppose pas, on refuse.
// Un service sans clé `networks:` rejoint le réseau `default` : il est examiné
// comme les autres, car un `default` redéfini est un passage silencieux.
//
// Le nom `edge` n'apparaît nulle part dans le code ci-dessous. C'était le défaut.
//
// -----------------------------------------------------------------------------
// CE QUE CE CONTRÔLE NE GARDE PAS — LIMITES ASSUMÉES, À LIRE AVANT DE S'Y FIER
// -----------------------------------------------------------------------------
//   · Il ne lit QUE `infra/docker-compose.coolify.yml`. Un réseau attaché depuis
//     l'interface de Coolify, un `docker network connect` passé à la main sur le
//     serveur, un `include:`/`extends:` lui sont INVISIBLES. L'isolation réelle
//     se vérifie sur la machine :
//       docker network inspect coolify --format '{{range .Containers}}{{.Name}}
//       {{end}}'
//   · Le critère b) REFUSE une écriture légitime : renommer le réseau interne
//     hors du préfixe du projet (`name: axion-interne`) fait échouer ce contrôle
//     alors que rien n'est cassé. C'est délibéré et c'est le prix du critère —
//     un nom hors préfixe est INDISCERNABLE d'un réseau du voisin. Garde le
//     préfixe, ou trace la décision et amende ce fichier dans le même commit.
//   · Il raisonne sur les RÉSEAUX, donc sur les routes L3. Il ne dit rien d'une
//     exfiltration par un canal qui ne passe pas par un réseau Docker (volume
//     partagé, socket monté, `pid: host`).
//   · Le lecteur YAML embarqué plus bas est un SOUS-ENSEMBLE écrit à la main :
//     11 §1 fige la liste des dépendances et aucun analyseur YAML n'y figure.
//     Il sait : indentation, séquences (tiret indenté ou aligné), collections en
//     flux sur une ou plusieurs lignes, guillemets, commentaires de fin de ligne,
//     scalaires de bloc (`|`, `>`), ancres, alias et fusion `<<:`.
//     Il NE sait PAS : documents multiples (`---`), balises (`!!str`), clés entre
//     guillemets, clés complexes (`? :`), alias vers une ancre définie dans un
//     service. Une écriture qu'il ne sait pas lire est IGNORÉE, pas signalée —
//     c'est pourquoi il AFFICHE ce qu'il a inspecté : un compte qui s'effondre
//     est le symptôme à surveiller.
//   · Ce lecteur est DUPLIQUÉ dans `scripts/check-compose-coolify.mjs`. La
//     duplication est assumée : factoriser créerait un troisième fichier, et ces
//     deux garde-fous doivent pouvoir être lus et exécutés seuls.
//
// Traçabilité : invariant 3 (étanchéité) · 02 §30.4-4 · DECISIONS.md 2026-08-28.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');
const FICHIER = 'infra/docker-compose.coolify.yml';

// Le seul service autorisé à rejoindre un réseau que la pile ne crée pas.
// Élargir cette liste est une DÉCISION, pas une correction : elle se trace dans
// DECISIONS.md avec son motif.
const SERVICE_AUTORISE = 'caddy';

const ROUGE = '\u001B[31m';
const VERT = '\u001B[32m';
const GRIS = '\u001B[90m';
const RAZ = '\u001B[0m';

const chemin = resolve(RACINE, FICHIER);
if (!existsSync(chemin)) {
  // Le fichier est un livrable du lot L0-b. Tant qu'il n'existe pas, ce contrôle
  // n'a rien à comparer — et il le DIT, il ne se déclare pas vert.
  console.log(
    `${GRIS}⚠ isolation réseau : ${FICHIER} absent — contrôle NON APPLIQUÉ (livrable du lot L0-b).${RAZ}`,
  );
  process.exit(0);
}

// =============================================================================
// LECTEUR YAML MINIMAL
// -----------------------------------------------------------------------------
// Il rend un arbre de nœuds { type, cle, valeur, indent, ligne, enfants }. Les
// commentaires sont retirés PAR LEUR SYNTAXE (un `#` précédé d'un blanc, hors
// guillemets), jamais en blanchissant la ligne entière : blanchir détruit la
// structure, et c'est ce qui a rendu le contrôle voisin aveugle à un bloc entier.
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
 * Sans cela, un `networks:` glissé dans une ancre partagée serait invisible.
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

/** Découpe une collection en flux au premier niveau (guillemets respectés). */
function decouperFlux(interieur) {
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
  return sortie.filter((s) => s.trim() !== '');
}

/** `[a, b]` → ['a','b'] ; rend null si la valeur n'est pas une séquence en flux. */
function elementsFlux(valeur) {
  const v = valeur.trim();
  if (!v.startsWith('[')) return null;
  const fin = v.lastIndexOf(']');
  return decouperFlux(v.slice(1, fin === -1 ? v.length : fin)).map(deguillemeter);
}

/** `{a: 1, b: {…}}` → Map(a→'1', b→'{…}') ; null si ce n'est pas un mapping en flux. */
function pairesFlux(valeur) {
  const v = valeur.trim();
  if (!v.startsWith('{')) return null;
  const fin = v.lastIndexOf('}');
  const paires = new Map();
  for (const morceau of decouperFlux(v.slice(1, fin === -1 ? v.length : fin))) {
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(morceau);
    if (m) paires.set(deguillemeter(m[1]), m[2].trim());
    else paires.set(deguillemeter(morceau), '');
  }
  return paires;
}

// =============================================================================
// LECTURE DU FICHIER
// =============================================================================
const racine = analyserYaml(readFileSync(chemin, 'utf8'));
const ancres = collecterAncres(racine);
const NOM_PROJET = deguillemeter(enfant(racine, ancres, 'name')?.valeur ?? '');
const services = enfantsEffectifs(enfant(racine, ancres, 'services'), ancres).filter(
  (n) => n.type === 'mapping' && n.cle,
);

if (services.length === 0) {
  console.error(
    `${ROUGE}✗ ISOLATION RÉSEAU — aucun service lu dans ${FICHIER}.${RAZ}\n` +
      `  Le lecteur YAML de ce script n'a rien reconnu : soit le fichier a changé de\n` +
      `  forme, soit le lecteur est cassé. Dans les deux cas il n'a RIEN vérifié —\n` +
      `  et un contrôle qui ne vérifie rien ne rend pas EXIT=0.\n`,
  );
  process.exit(1);
}

// =============================================================================
// QUELS RÉSEAUX SONT HORS DU CONTRÔLE DE LA PILE
// =============================================================================
/** Résout `${VAR:-defaut}` ; rend null si la valeur est indéterminable. */
function resoudreValeur(v) {
  if (!v.includes('${')) return v;
  const m = /^\$\{([^:}]+)(?::-([^}]*))?\}$/.exec(v.trim());
  return m && m[2] !== undefined ? m[2] : null;
}

function estVrai(v) {
  return ['true', 'yes', 'on', '1'].includes(deguillemeter(v).toLowerCase());
}

const reseaux = new Map();
for (const decl of enfantsEffectifs(enfant(racine, ancres, 'networks'), ancres)) {
  if (decl.type !== 'mapping' || !decl.cle) continue;

  const paires = pairesFlux(decl.valeur);
  const lire = (cle) => {
    if (paires?.has(cle)) return { valeur: paires.get(cle), ligne: decl.ligne, brut: decl.brut };
    const n = enfant(decl, ancres, cle);
    return n ? { valeur: n.valeur, ligne: n.ligne, brut: n.brut } : null;
  };

  const externe = lire('external');
  const nomDeclare = lire('name');
  // `external:` peut aussi porter un `name:` en sous-clé (forme dépréciée).
  const nomSousExterne = externe ? enfant(enfant(decl, ancres, 'external'), ancres, 'name') : null;

  const estExterne = externe !== null && (externe.valeur === '' || estVrai(externe.valeur));
  const nomBrut = nomSousExterne
    ? deguillemeter(nomSousExterne.valeur)
    : nomDeclare
      ? deguillemeter(nomDeclare.valeur)
      : null;
  const nomResolu = nomBrut === null ? null : resoudreValeur(nomBrut);

  let motif = null;
  if (estExterne) {
    motif =
      `il est déclaré \`external: true\`.\n` +
      `    Il existe DÉJÀ sur la machine et cette pile ne maîtrise pas qui d'autre s'y trouve.`;
  } else if (nomBrut !== null && nomResolu === null) {
    motif =
      `son nom « ${nomBrut} » n'est pas résoluble ici (variable sans valeur par défaut).\n` +
      `    Impossible d'affirmer qu'aucun réseau de ce nom n'existe déjà sur la machine.`;
  } else if (nomResolu !== null && NOM_PROJET !== '' && !nomResolu.startsWith(NOM_PROJET)) {
    motif =
      `son nom « ${nomResolu} » ne commence pas par le nom de projet « ${NOM_PROJET} ».\n` +
      `    Compose RÉUTILISE un réseau existant qui porte ce nom, même sans \`external: true\`.`;
  }

  reseaux.set(decl.cle, {
    cle: decl.cle,
    nom: nomResolu ?? nomBrut ?? `${NOM_PROJET}_${decl.cle}`,
    partage: motif !== null,
    motif,
    ligne: nomDeclare?.ligne ?? externe?.ligne ?? decl.ligne,
  });
}

// =============================================================================
// QUELS RÉSEAUX CHAQUE SERVICE REJOINT — toutes les écritures, un seul chemin
// =============================================================================
function reseauxDuService(service) {
  const n = enfant(service, ancres, 'networks');
  if (!n) {
    // Aucune clé `networks:` : Compose attache le service au réseau `default`.
    return [
      {
        cle: 'default',
        ligne: service.ligne,
        extrait: `${service.cle}: (aucune clé \`networks:\` → réseau « default » implicite)`,
        implicite: true,
      },
    ];
  }
  const entrees = [];
  const ajouter = (cle, ligne, extrait) => {
    if (cle !== '') entrees.push({ cle, ligne, extrait });
  };

  // Formes en flux sur la clé : `networks: [a, b]` et `networks: {a: {}, b: {}}`.
  for (const el of elementsFlux(n.valeur) ?? []) ajouter(el, n.ligne, n.brut);
  for (const cle of pairesFlux(n.valeur)?.keys() ?? []) ajouter(cle, n.ligne, n.brut);
  // Forme scalaire tolérée : `networks: a`.
  if (
    n.valeur !== '' &&
    !n.valeur.startsWith('[') &&
    !n.valeur.startsWith('{') &&
    !n.valeur.startsWith('*')
  ) {
    ajouter(deguillemeter(n.valeur), n.ligne, n.brut);
  }

  for (const e of enfantsEffectifs(n, ancres)) {
    // Séquence : `- a` (tiret indenté OU aligné sur la clé).
    if (e.type === 'sequence' && e.valeur.trim() !== '') {
      ajouter(deguillemeter(e.valeur), e.ligne, e.brut);
      continue;
    }
    // Mapping : `a:` / `a: {}` / `a:` + `aliases:`.
    if (e.type === 'mapping' && e.cle) ajouter(e.cle, e.ligne, e.brut);
  }
  return entrees;
}

const fautifs = [];
let attachementsInspectes = 0;

for (const service of services) {
  const autorise = service.cle === SERVICE_AUTORISE;

  // --- Chemin 1 : hériter de la pile réseau d'un autre conteneur -------------
  // `network_mode: service:caddy` n'attache AUCUN réseau — le conteneur partage
  // la pile réseau de sa cible, donc TOUTES ses routes. `host` fait pire encore.
  const mode = enfant(service, ancres, 'network_mode');
  if (mode) {
    const valeur = deguillemeter(mode.valeur);
    if (valeur !== 'none') {
      fautifs.push({
        service: service.cle,
        ligne: mode.ligne,
        extrait: mode.brut,
        chemin: `network_mode: ${valeur}`,
        consequence:
          valeur.startsWith('service:') || valeur.startsWith('container:')
            ? `ce conteneur ne crée PAS sa pile réseau : il partage celle de « ${valeur.split(':')[1]} »,\n` +
              `    donc TOUTES ses routes, réseau du proxy compris. AUCUNE clé \`networks:\` ne le\n` +
              `    montre — c'est le chemin le plus discret, et un contrôle qui lit les réseaux\n` +
              `    déclarés passe entièrement à côté.`
            : `\`network_mode: ${valeur}\` sort le conteneur du réseau interne de la pile et le place\n` +
              `    hors de tout contrôle exercé par ce fichier.`,
      });
    }
  }

  // --- Chemin 2 : rejoindre un réseau que la pile ne crée pas ---------------
  for (const attache of reseauxDuService(service)) {
    attachementsInspectes += 1;
    const reseau = reseaux.get(attache.cle);

    if (!reseau) {
      // `default` non déclaré = réseau créé par Compose pour ce projet : sain.
      if (attache.implicite) continue;
      fautifs.push({
        service: service.cle,
        ligne: attache.ligne,
        extrait: attache.extrait,
        chemin: `réseau « ${attache.cle} » non déclaré`,
        consequence:
          `Aucune section \`networks:\` de premier niveau ne définit « ${attache.cle} » : ce contrôle\n` +
          `    ne peut PAS établir si ce réseau est interne ou partagé. Il refuse plutôt que de\n` +
          `    supposer — déclare-le, ou corrige le nom.`,
      });
      continue;
    }
    if (!reseau.partage || autorise) continue;

    fautifs.push({
      service: service.cle,
      ligne: attache.ligne,
      extrait: attache.extrait,
      chemin: `réseau « ${reseau.cle} » → « ${reseau.nom} »`,
      consequence:
        `Réseau tenu pour PARTAGÉ (déclaré ligne ${String(reseau.ligne)}) parce que ${reseau.motif}\n` +
        `    Ce service obtient donc une route L3 vers les conteneurs du voisin.`,
    });
  }
}

// =============================================================================
// VERDICT
// =============================================================================
if (fautifs.length > 0) {
  fautifs.sort((a, b) => a.ligne - b.ligne);
  console.error(
    `${ROUGE}✗ ISOLATION RÉSEAU ROMPUE — ${String(fautifs.length)} route(s) ouverte(s) hors de la pile.${RAZ}\n`,
  );
  for (const f of fautifs) {
    console.error(
      `  ${ROUGE}${f.service}${RAZ}  ${FICHIER}:${String(f.ligne)}   ${f.chemin}\n` +
        `    ${f.extrait}\n` +
        `    ${GRIS}${f.consequence}${RAZ}\n`,
    );
  }
  console.error(
    `  Le réseau du proxy Traefik de Coolify est PARTAGÉ avec le site de production\n` +
      `  axion-ia.com. Il a l'ICC activé (mesuré) : tout conteneur qui obtient une route\n` +
      `  vers lui joint directement la base PostgreSQL (u7zlql3bpb1xy5t4kg6jnvpm:5432) et\n` +
      `  le Redis (hdfknlij6yqebr09p379m9q6:6379) du voisin. Le 02 §30.4-4 exige qu'un\n` +
      `  secret de staging ne puisse RIEN sur la production — l'isolation réseau est la\n` +
      `  seule barrière qui ne dépende pas d'un mot de passe.\n\n` +
      `  Seul « ${SERVICE_AUTORISE} » y a droit : il ne détient aucun secret et n'ouvre aucune\n` +
      `  connexion sortante. Si un autre service DOIT y accéder, ce n'est pas une\n` +
      `  correction, c'est une décision — elle s'écrit dans DECISIONS.md avec son\n` +
      `  motif, et SERVICE_AUTORISE s'élargit dans le même commit.\n`,
  );
  process.exit(1);
}

const partages = [...reseaux.values()].filter((r) => r.partage);
const listePartages =
  partages.length > 0
    ? partages.map((r) => `« ${r.cle} » → « ${r.nom} »`).join(', ')
    : 'aucun réseau partagé déclaré';

console.log(
  `${VERT}✓${RAZ} isolation réseau : ${String(attachementsInspectes)} attachement(s) inspecté(s) sur ` +
    `${String(services.length)} service(s) ; seul « ${SERVICE_AUTORISE} » rejoint un réseau hors de la pile ` +
    `(${listePartages}).\n` +
    `  ${GRIS}base, Redis, MinIO, API et worker restent hors du réseau partagé avec axion-ia.com ; ` +
    `aucun \`network_mode\` n'emprunte la pile d'un autre conteneur${RAZ}`,
);
