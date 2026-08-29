// =============================================================================
// GARDE-FOU : LA CHAÎNE `X-Forwarded-For` — DEUX FICHIERS, UNE SEULE GARANTIE
//   · infra/caddy/Caddyfile        → `trusted_proxies` dans chaque `reverse_proxy`
//   · apps/api/src/app.ts          → `trustProxy` limité aux plages privées
//
// LE DÉFAUT MESURÉ QUI MOTIVE CE FICHIER (DECISIONS.md, 2026-08-29 — « Le plafond
// de 10 req/min/IP sur /v1/auth/* est un seau GLOBAL »). Mesure maillon par maillon
// sur le staging réel puis sur réplique locale :
//
//   client → Traefik → Caddy → API
//   · Traefik ÉCRASE `X-Forwarded-For` par l'adresse réelle du client (correct) ;
//   · mais Caddy la REMPLACE ensuite au lieu de l'AJOUTER. Depuis Caddy 2.7,
//     `reverse_proxy` n'append à `X-Forwarded-For` que si le pair immédiat figure
//     dans `trusted_proxies` — et le Caddyfile n'en déclarait aucun ;
//   · l'API recevait donc `X-Forwarded-For: 10.0.1.6`, l'adresse de Traefik,
//     IDENTIQUE pour tous les clients du monde. `request.ip` constant ;
//   · conséquence : le plafond « /v1/auth/* 10 req/min/IP » (CLAUDE.md §9) n'était
//     pas par IP mais un SEAU UNIQUE ET GLOBAL. Le premier attaquant venu verrouille
//     l'authentification de TOUS les utilisateurs — déni de service à coût nul sur
//     la route la plus sensible du produit.
//
// POURQUOI CE GARDE LIT DEUX FICHIERS ET NON UN. Les deux réglages ne valent que
// l'un par l'autre, et chacun sans l'autre est un défaut :
//
//                             | Caddyfile SANS trusted_proxies | Caddyfile AVEC
//   app.ts `trustProxy: true` | seau global (défaut mesuré)    | FORGERIE ROUVERTE
//   app.ts plages privées     | seau global (défaut mesuré)    | correct
//
// Quelqu'un qui, dans six mois, remettrait `trustProxy: true` « parce que c'est plus
// simple » rouvrirait la forgerie sans qu'aucun test ne rougisse. Un garde qui ne
// vérifierait qu'un seul des deux fichiers serait un garde-fou qui annonce plus
// qu'il ne fait — la famille de défaut que ce dépôt traque depuis trois jours.
//
// 09 §5.6 — ce fichier est écrit par A18, qui n'a écrit NI le `Caddyfile`, NI
// `app.ts`, et qui ne les a pas lus avant d'écrire ces assertions. Il ne les modifie
// pas non plus : s'il est rouge, c'est un RÉSULTAT à rapporter, pas un incident.
//
// COMMENT IL EST ÉPROUVÉ — ET POURQUOI IL NE PEUT PAS ÊTRE VERT PAR ACCIDENT.
// Un garde qui lit un fichier de configuration passe au vert dès que sa lecture
// échoue : un `Caddyfile` renommé, un lecteur qui ne trouve plus rien, et « zéro
// bloc fautif » devient « zéro bloc ». Deux verrous, posés ensemble :
//   · les cas « ÉTAT DU DÉPÔT » exigent qu'AU MOINS UN `reverse_proxy` soit trouvé
//     avant de conclure quoi que ce soit — un lecteur devenu aveugle échoue ;
//   · les cas « LE LECTEUR VOIT-IL LE DÉFAUT ? » rejouent le défaut du 2026-08-29
//     sur des Caddyfile SYNTHÉTIQUES et exigent qu'il soit DÉTECTÉ. Ils restent
//     rouges si le lecteur cesse de mordre, y compris le jour où le dépôt réel est
//     corrigé et où les premiers cas passent au vert pour de bon.
//
// CE QUE CE GARDE NE VOIT PAS — la portée honnête vaut mieux que la portée rassurante :
//   1. il lit du TEXTE de configuration. Il ne prouve RIEN du comportement de Caddy
//      à l'exécution : ni que `trusted_proxies` porte les bonnes plages, ni que
//      l'en-tête est réellement APPENDU sur une requête réelle. Seul un test de bout
//      en bout contre un Caddy vivant le prouverait ;
//   2. il ne prouve pas que le conteneur DÉPLOYÉ porte cette configuration — image
//      figée, montage oublié, configuration éditée à la main sur l'hôte ;
//   3. il ne vérifie pas la valeur des plages de `trustProxy` autrement qu'en
//      refusant les formes qui font confiance à tout le monde ;
//   4. il ne connaît pas les autres maillons : si Traefik cessait d'écraser
//      `X-Forwarded-For`, la forgerie reviendrait par le haut de la chaîne, et ce
//      fichier resterait vert.
//
// Traçabilité : invariant 3 · CLAUDE.md §9 (rate limiting /v1/auth/*) · E17, E43 ·
// DECISIONS.md 2026-08-29 · 09 §5.6.
// =============================================================================
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const CHEMIN_CADDYFILE = 'infra/caddy/Caddyfile';
const CHEMIN_APP_API = 'apps/api/src/app.ts';

// =============================================================================
// LES DEUX EXPLICATIONS — le message d'échec est la moitié du travail
// -----------------------------------------------------------------------------
// Un message qui CONSTATE l'écart (« trusted_proxies manquant ») se fait désactiver
// par le premier lecteur pressé. Un message qui RACONTE le défaut se fait corriger.
// =============================================================================

const LA_CHAINE = [
  "LA CHAÎNE, MESURÉE LE 2026-08-29 : client → Traefik → Caddy → l'API.",
  '  · Traefik écrase `X-Forwarded-For` par l’adresse réelle du client — correct.',
  '  · Caddy 2.7+ n’AJOUTE à `X-Forwarded-For` que si le pair immédiat figure dans',
  '    `trusted_proxies`. Sans cette directive, il la REMPLACE.',
  '  · L’API reçoit alors `X-Forwarded-For: <adresse de Traefik>` — la MÊME pour tous',
  '    les clients du monde. `request.ip` est constant.',
  '  · Le plafond « /v1/auth/* : 10 req/min/IP » (CLAUDE.md §9) n’est alors pas par IP :',
  '    c’est un SEAU UNIQUE ET GLOBAL. Le premier attaquant venu verrouille',
  '    l’authentification de TOUS les utilisateurs, à coût nul, sur la route la plus',
  '    sensible du produit.',
].join('\n');

const LES_DEUX_ENSEMBLE = [
  'LES DEUX RÉGLAGES NE VALENT QUE L’UN PAR L’AUTRE — chacun seul est un défaut :',
  '',
  '                            | Caddyfile SANS trusted_proxies | Caddyfile AVEC',
  '  app.ts `trustProxy: true` | seau global (défaut mesuré)    | FORGERIE ROUVERTE',
  '  app.ts plages privées     | seau global (défaut mesuré)    | CORRECT',
  '',
  'Mesuré sur la vraie `@fastify/proxy-addr`, chaîne « 9.9.9.9, 37.65.10.24, 10.0.1.6 » :',
  '  · `trustProxy: true` retient 9.9.9.9 — l’adresse que le CLIENT a forgée ;',
  '  · les plages privées retiennent 37.65.10.24 — l’adresse RÉELLE.',
  '',
  'Déclarer `trusted_proxies` dans Caddy SANS restreindre `trustProxy` côté API ne',
  'corrige donc pas le défaut : il l’échange contre une forgerie triviale, où chacun',
  'choisit l’IP sur laquelle il consomme le quota — et celle qu’il fait bannir.',
  'C’est pourquoi ce garde lit LES DEUX FICHIERS.',
].join('\n');

/**
 * Échoue en RACONTANT, et non en constatant.
 *
 * `expect(x, message)` et `toBe` tronquent ou noient les longs textes ; une erreur
 * levée est imprimée telle quelle par Vitest. L'assertion qui suit garde au cas
 * passant une assertion réelle, pour qu'aucun cas ne puisse être vert sans avoir
 * rien vérifié.
 */
function exiger(condition: boolean, message: () => string): void {
  if (!condition) throw new Error(`\n${message()}\n`);
  expect(condition).toBe(true);
}

function lireFichier(relatif: string): string | null {
  const chemin = resolve(RACINE_DEPOT, relatif);
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
}

// =============================================================================
// LECTEUR DE CADDYFILE
// -----------------------------------------------------------------------------
// Le format est à jetons séparés par des espaces, sensible aux fins de ligne : une
// directive court jusqu'au saut de ligne, sauf si elle ouvre un bloc par `{`.
//
// TROIS PIÈGES QUE CE LECTEUR DOIT ÉVITER, ET QUI SONT TESTÉS PLUS BAS :
//   · un `#` en début de jeton ouvre un commentaire — un `trusted_proxies` mis en
//     commentaire ne doit JAMAIS satisfaire ce garde. C'est le piège de la prose,
//     déjà tombé deux fois dans ce dépôt (fil rouge, @critique) ;
//   · un remplaçant Caddy (`{remote_host}`, `{$UPSTREAM_API}`) contient des accolades
//     mais n'ouvre aucun bloc : seul un jeton VALANT exactement `{` en ouvre un ;
//   · `\r` doit être traité comme une espace : le dépôt est édité sous Windows.
// =============================================================================

/** Marqueur de fin de directive. Un jeton du fichier ne peut pas lui être égal. */
const SAUT = '\n';

interface Jeton {
  readonly texte: string;
  readonly ligne: number;
}

function decouper(source: string): readonly Jeton[] {
  const jetons: Jeton[] = [];
  let courant = '';
  let ligne = 1;
  let ligneDuJeton = 1;
  let i = 0;

  const ajouter = (texte: string): void => {
    if (courant === '') ligneDuJeton = ligne;
    courant += texte;
  };
  const pousser = (): void => {
    if (courant !== '') {
      jetons.push({ texte: courant, ligne: ligneDuJeton });
      courant = '';
    }
  };

  while (i < source.length) {
    const c = source.charAt(i);

    // Commentaire : uniquement en DÉBUT de jeton (règle Caddy).
    if (c === '#' && courant === '') {
      while (i < source.length && source.charAt(i) !== '\n') i += 1;
      continue;
    }

    // Jeton entre guillemets : son contenu n'ouvre pas de bloc et ne coupe rien.
    if (c === '"' || c === '`') {
      const fermeture = c;
      i += 1;
      let contenu = '';
      while (i < source.length && source.charAt(i) !== fermeture) {
        if (source.charAt(i) === '\\' && i + 1 < source.length) {
          contenu += source.charAt(i + 1);
          i += 2;
          continue;
        }
        contenu += source.charAt(i);
        i += 1;
      }
      i += 1;
      ajouter(contenu);
      continue;
    }

    if (c === '\n') {
      pousser();
      jetons.push({ texte: SAUT, ligne });
      ligne += 1;
      i += 1;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r') {
      pousser();
      i += 1;
      continue;
    }

    ajouter(c);
    i += 1;
  }

  pousser();
  return jetons;
}

const texteDe = (jetons: readonly Jeton[], index: number): string => jetons[index]?.texte ?? '';

/** Un jeton est en position de DIRECTIVE s'il ouvre une ligne ou suit une accolade. */
function estDebutDeDirective(jetons: readonly Jeton[], index: number): boolean {
  if (index === 0) return true;
  const precedent = texteDe(jetons, index - 1);
  return precedent === SAUT || precedent === '{' || precedent === '}';
}

/** Noms des directives de PREMIER niveau du bloc ouvert par le `{` en `depart`. */
function directivesDuBloc(jetons: readonly Jeton[], depart: number): readonly string[] {
  const directives: string[] = [];
  let profondeur = 0;
  for (let i = depart; i < jetons.length; i += 1) {
    const texte = texteDe(jetons, i);
    if (texte === '{') {
      profondeur += 1;
      continue;
    }
    if (texte === '}') {
      profondeur -= 1;
      if (profondeur === 0) return directives;
      continue;
    }
    if (profondeur === 1 && texte !== SAUT && estDebutDeDirective(jetons, i)) {
      directives.push(texte);
    }
  }
  return directives;
}

/** Position du `{` qui suit les arguments d'une directive, ou `null` s'il n'y en a pas. */
function accoladeApres(jetons: readonly Jeton[], depuis: number): number | null {
  let i = depuis;
  while (i < jetons.length) {
    const texte = texteDe(jetons, i);
    if (texte === SAUT) return null;
    if (texte === '{') return i;
    i += 1;
  }
  return null;
}

interface BlocProxy {
  readonly ligne: number;
  readonly cibles: readonly string[];
  readonly aUnBloc: boolean;
  readonly directives: readonly string[];
}

/**
 * Tous les `reverse_proxy` du fichier, DÉCOUVERTS et non codés en dur.
 *
 * Le Caddyfile en porte plusieurs (un par domaine servi). Un garde qui n'en
 * vérifierait qu'un — celui qu'il connaît — laisserait l'autre dériver en silence :
 * c'est exactement ainsi que la production et la pré-production divergent.
 */
function blocsReverseProxy(jetons: readonly Jeton[]): readonly BlocProxy[] {
  const blocs: BlocProxy[] = [];
  for (let i = 0; i < jetons.length; i += 1) {
    if (texteDe(jetons, i) !== 'reverse_proxy' || !estDebutDeDirective(jetons, i)) continue;
    const accolade = accoladeApres(jetons, i + 1);
    const cibles: string[] = [];
    for (let k = i + 1; k < jetons.length; k += 1) {
      const texte = texteDe(jetons, k);
      if (texte === SAUT || texte === '{') break;
      cibles.push(texte);
    }
    blocs.push({
      ligne: jetons[i]?.ligne ?? 0,
      cibles,
      aUnBloc: accolade !== null,
      directives: accolade === null ? [] : directivesDuBloc(jetons, accolade),
    });
  }
  return blocs;
}

/**
 * `trusted_proxies` peut aussi être posé UNE FOIS pour tous les serveurs, dans les
 * options globales (`{ servers { trusted_proxies … } }`). Cette forme couvre chaque
 * `reverse_proxy` du fichier ; la refuser rendrait ce garde rouge sur une
 * configuration CORRECTE, et un garde rouge à tort finit désactivé.
 */
function confianceGlobale(jetons: readonly Jeton[]): boolean {
  for (let i = 0; i < jetons.length; i += 1) {
    if (texteDe(jetons, i) !== 'servers' || !estDebutDeDirective(jetons, i)) continue;
    const accolade = accoladeApres(jetons, i + 1);
    if (accolade === null) continue;
    if (directivesDuBloc(jetons, accolade).includes('trusted_proxies')) return true;
  }
  return false;
}

interface LectureCaddy {
  readonly blocs: readonly BlocProxy[];
  readonly globale: boolean;
  readonly fautifs: readonly BlocProxy[];
}

function lireCaddyfile(source: string): LectureCaddy {
  const jetons = decouper(source);
  const blocs = blocsReverseProxy(jetons);
  const globale = confianceGlobale(jetons);
  return {
    blocs,
    globale,
    fautifs: globale ? [] : blocs.filter((b) => !b.directives.includes('trusted_proxies')),
  };
}

const decrireBloc = (b: BlocProxy): string =>
  `    ligne ${String(b.ligne)} : reverse_proxy ${b.cibles.join(' ')}` +
  (b.aUnBloc ? '' : '   (aucun bloc `{ … }` : la directive ne peut rien déclarer)');

// =============================================================================
// LECTEUR DE `app.ts`
// -----------------------------------------------------------------------------
// Les commentaires sont RETIRÉS avant l'analyse : un `// trustProxy: true` mis de
// côté n'est pas un défaut, et le compter en serait un — le garde deviendrait
// impossible à documenter.
// =============================================================================

function sansCommentairesTs(source: string): string {
  let sortie = '';
  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);
    const suivant = source.charAt(i + 1);

    if (c === '/' && suivant === '/') {
      while (i < source.length && source.charAt(i) !== '\n') i += 1;
      continue;
    }
    if (c === '/' && suivant === '*') {
      i += 2;
      while (i < source.length && !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')) {
        if (source.charAt(i) === '\n') sortie += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const fermeture = c;
      sortie += c;
      i += 1;
      while (i < source.length) {
        const d = source.charAt(i);
        sortie += d;
        i += 1;
        if (d === '\\') {
          sortie += source.charAt(i);
          i += 1;
          continue;
        }
        if (d === fermeture) break;
      }
      continue;
    }
    sortie += c;
    i += 1;
  }
  return sortie;
}

/** Valeur d'une propriété, lue jusqu'au séparateur de PREMIER niveau. */
function lireValeur(texte: string, depuis: number): string {
  let profondeur = 0;
  let valeur = '';
  let i = depuis;
  while (i < texte.length) {
    const c = texte.charAt(i);
    if (c === "'" || c === '"' || c === '`') {
      const fermeture = c;
      valeur += c;
      i += 1;
      while (i < texte.length) {
        const d = texte.charAt(i);
        valeur += d;
        i += 1;
        if (d === '\\') {
          valeur += texte.charAt(i);
          i += 1;
          continue;
        }
        if (d === fermeture) break;
      }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') profondeur += 1;
    if (c === ')' || c === ']' || c === '}') {
      if (profondeur === 0) break;
      profondeur -= 1;
    }
    if (profondeur === 0 && (c === ',' || c === ';' || c === '\n')) break;
    valeur += c;
    i += 1;
  }
  return valeur.trim();
}

interface DeclarationTrustProxy {
  readonly valeur: string;
  readonly ligne: number;
}

function declarationsTrustProxy(source: string): readonly DeclarationTrustProxy[] {
  const propre = sansCommentairesTs(source);
  const trouvees: DeclarationTrustProxy[] = [];
  const motif = /\btrustProxy\s*:\s*/g;
  let occurrence = motif.exec(propre);
  while (occurrence !== null) {
    const entete = occurrence[0];
    trouvees.push({
      valeur: lireValeur(propre, occurrence.index + entete.length),
      ligne: propre.slice(0, occurrence.index).split('\n').length,
    });
    occurrence = motif.exec(propre);
  }
  return trouvees;
}

/** `true`, `1`, `0.0.0.0/0`, `::/0` : quatre écritures d'une même confiance aveugle. */
const CONFIANCE_AVEUGLE = /^(?:true|\d+)$/;
const TOUTES_LES_ADRESSES = /0\.0\.0\.0\/0|::\/0/;

function decrireDeclaration(d: DeclarationTrustProxy): string {
  return `    ligne ${String(d.ligne)} : trustProxy: ${d.valeur}`;
}

// =============================================================================
// ÉTAT DU DÉPÔT — les deux fichiers, tels qu'ils sont aujourd'hui
// =============================================================================

describe('infra/caddy/Caddyfile — la chaîne X-Forwarded-For', () => {
  it('@critique le Caddyfile existe et déclare au moins un `reverse_proxy`', () => {
    // ANTI-VACUITÉ. Sans ce cas, un fichier renommé, vidé ou devenu illisible ferait
    // passer tous les suivants au vert : « zéro bloc fautif » n'est rassurant que si
    // le lecteur a trouvé des blocs. C'est la forme la plus commune du garde-fou qui
    // annonce plus qu'il ne fait.
    const source = lireFichier(CHEMIN_CADDYFILE);
    exiger(
      source !== null,
      () =>
        `Le fichier \`${CHEMIN_CADDYFILE}\` est INTROUVABLE.\n\n` +
        'Tous les autres cas de ce fichier deviendraient verts sans rien vérifier.\n' +
        "Si le fichier a été déplacé, c'est ce garde qu'il faut mettre à jour — pas le\n" +
        'désactiver.\n\n' +
        LA_CHAINE,
    );
    const blocs = lireCaddyfile(source ?? '').blocs;
    exiger(
      blocs.length > 0,
      () =>
        `Aucune directive \`reverse_proxy\` trouvée dans \`${CHEMIN_CADDYFILE}\`.\n\n` +
        "Soit l'API n'est plus servie par Caddy — auquel cas toute l'analyse de ce\n" +
        'garde est caduque et doit être refaite — soit le lecteur de ce fichier est\n' +
        'devenu aveugle au format. Dans les deux cas, le vert des cas suivants ne\n' +
        'vaudrait rien.\n\n' +
        LA_CHAINE,
    );
  });

  it('@critique chaque bloc `reverse_proxy` déclare `trusted_proxies`', () => {
    const source = lireFichier(CHEMIN_CADDYFILE) ?? '';
    const { blocs, fautifs, globale } = lireCaddyfile(source);
    exiger(blocs.length > 0, () => `Aucun \`reverse_proxy\` lu dans \`${CHEMIN_CADDYFILE}\`.`);
    exiger(
      fautifs.length === 0,
      () =>
        `${String(fautifs.length)} bloc(s) \`reverse_proxy\` sur ${String(blocs.length)} ne ` +
        `déclarent PAS \`trusted_proxies\` :\n` +
        `${fautifs.map(decrireBloc).join('\n')}\n\n` +
        `${LA_CHAINE}\n\n` +
        'CORRECTIF ARBITRÉ (DECISIONS.md, 2026-08-29) : déclarer `trusted_proxies` dans\n' +
        'CHAQUE bloc `reverse_proxy` du Caddyfile — ou une fois pour toutes dans les\n' +
        'options globales (`{ servers { trusted_proxies … } }`), que ce garde accepte\n' +
        `aussi (couverture globale détectée ici : ${globale ? 'oui' : 'non'}).\n\n` +
        'Le Caddyfile en porte PLUSIEURS. Corriger celui qu’on a sous les yeux et\n' +
        'oublier l’autre laisse la pré-production — ou la production — dériver seule,\n' +
        'avec le même déni de service et aucun signal.\n\n' +
        LES_DEUX_ENSEMBLE,
    );
  });
});

describe('apps/api/src/app.ts — le pair de confiance côté Fastify', () => {
  it('@critique `app.ts` existe et déclare `trustProxy`', () => {
    const source = lireFichier(CHEMIN_APP_API);
    exiger(source !== null, () => `Le fichier \`${CHEMIN_APP_API}\` est INTROUVABLE.`);
    const declarations = declarationsTrustProxy(source ?? '');
    exiger(
      declarations.length > 0,
      () =>
        `Aucune option \`trustProxy\` déclarée dans \`${CHEMIN_APP_API}\`.\n\n` +
        'L’ABSENCE EST UN DÉFAUT, PAS UNE NEUTRALITÉ. Sans `trustProxy`, Fastify prend\n' +
        '`request.ip` sur la socket — c’est-à-dire l’adresse du conteneur Caddy, la même\n' +
        'pour tous les clients. On retombe EXACTEMENT sur le seau global du 2026-08-29,\n' +
        'et un garde qui ne vérifierait que « trustProxy n’est pas `true` » serait vert.\n\n' +
        `${LA_CHAINE}\n\n${LES_DEUX_ENSEMBLE}`,
    );
  });

  it('@critique `trustProxy` ne revient ni à `true` ni à un nombre', () => {
    const source = lireFichier(CHEMIN_APP_API) ?? '';
    const declarations = declarationsTrustProxy(source);
    exiger(declarations.length > 0, () => `Aucun \`trustProxy\` lu dans \`${CHEMIN_APP_API}\`.`);
    const aveugles = declarations.filter((d) => CONFIANCE_AVEUGLE.test(d.valeur));
    exiger(
      aveugles.length === 0,
      () =>
        `\`trustProxy\` fait confiance à n’importe quel en-tête entrant :\n` +
        `${aveugles.map(decrireDeclaration).join('\n')}\n\n` +
        `${LES_DEUX_ENSEMBLE}\n\n` +
        'ET LA FORME NUMÉRIQUE N’EST PAS UNE ÉCHAPPATOIRE : `trustProxy: <nombre>` (le\n' +
        'nombre de sauts de confiance) échoue FERMÉ dans Fastify 5 — fausse piste déjà\n' +
        'écartée par mesure le 2026-08-29. La seule forme correcte reste la liste des\n' +
        'PLAGES PRIVÉES par lesquelles la requête transite réellement.',
    );
  });

  it('@critique `trustProxy` ne fait pas confiance à toutes les adresses', () => {
    // `0.0.0.0/0` et `::/0` sont `true` écrit en CIDR : la même forgerie, avec l’air
    // d’une liste de plages. C’est la façon la plus probable de rouvrir le trou tout
    // en satisfaisant un garde qui n’aurait cherché que le littéral `true`.
    const source = lireFichier(CHEMIN_APP_API) ?? '';
    const declarations = declarationsTrustProxy(source);
    const universelles = declarations.filter((d) => TOUTES_LES_ADRESSES.test(d.valeur));
    exiger(
      universelles.length === 0,
      () =>
        '`trustProxy` accepte TOUTES les adresses :\n' +
        `${universelles.map(decrireDeclaration).join('\n')}\n\n` +
        '`0.0.0.0/0` (ou `::/0`) est `true` déguisé en liste de plages : n’importe quel\n' +
        'client redevient l’auteur de son propre `X-Forwarded-For`.\n\n' +
        LES_DEUX_ENSEMBLE,
    );
  });
});

describe('la cohérence des DEUX fichiers — c’est elle, la garantie', () => {
  it('@critique Caddy AJOUTE l’adresse réelle et l’API ne croit que les plages privées', () => {
    // Ce cas ne mesure rien de neuf : il RÉUNIT les deux moitiés dans une seule
    // assertion, pour que le rapport d’échec dise « la garantie est rompue » plutôt
    // que « deux tests sans rapport ont échoué ». C’est le seul cas dont le titre
    // énonce la propriété réellement protégée.
    const caddy = lireCaddyfile(lireFichier(CHEMIN_CADDYFILE) ?? '');
    const declarations = declarationsTrustProxy(lireFichier(CHEMIN_APP_API) ?? '');
    const caddyOk = caddy.blocs.length > 0 && caddy.fautifs.length === 0;
    const apiOk =
      declarations.length > 0 &&
      declarations.every(
        (d) => !CONFIANCE_AVEUGLE.test(d.valeur) && !TOUTES_LES_ADRESSES.test(d.valeur),
      );
    exiger(
      caddyOk && apiOk,
      () =>
        'LA GARANTIE « 10 req/min PAR IP » N’EST PAS TENUE.\n\n' +
        `  Caddyfile (${String(caddy.blocs.length)} bloc(s) reverse_proxy) : ` +
        `${caddyOk ? 'conforme' : `${String(caddy.fautifs.length)} sans \`trusted_proxies\``}\n` +
        `  app.ts (${String(declarations.length)} déclaration(s) trustProxy) : ` +
        `${apiOk ? 'conforme' : 'confiance aveugle ou absente'}\n\n` +
        `${LES_DEUX_ENSEMBLE}\n\n${LA_CHAINE}`,
    );
  });
});

// =============================================================================
// LE LECTEUR VOIT-IL LE DÉFAUT ? — les cas qui restent utiles quand le dépôt est vert
// -----------------------------------------------------------------------------
// Les cas ci-dessus deviendront verts le jour où la directive sera posée, et ils le
// resteront. À partir de ce jour-là, RIEN ne prouverait plus qu'ils regardent encore
// quelque chose : un lecteur cassé rendrait « zéro bloc fautif » sur n'importe quoi.
// Les cas suivants rejouent le défaut du 2026-08-29 sur des fichiers SYNTHÉTIQUES et
// exigent qu'il soit DÉTECTÉ. Ce sont eux qui empêchent ce garde de devenir décoratif.
// =============================================================================

const DEUX_BLOCS = (bloc1: string, bloc2: string): string => `axion-api.example.invalid {
	handle /api/* {
		reverse_proxy axion-api:3000 {
${bloc1}
		}
	}
}

staging-api.example.invalid {
	handle /api/* {
		reverse_proxy staging-api:3000 {
${bloc2}
		}
	}
}
`;

const CONFIANCE = '\t\t\ttrusted_proxies static 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16';
const ENTETE_SEULE = '\t\t\theader_up X-Real-IP {remote_host}';

describe('le lecteur de Caddyfile mord — sinon ce garde est décoratif', () => {
  it('@critique DÉFAUT DU 2026-08-29 : aucun bloc ne déclare `trusted_proxies`', () => {
    const { blocs, fautifs } = lireCaddyfile(DEUX_BLOCS(ENTETE_SEULE, ENTETE_SEULE));
    expect(blocs).toHaveLength(2);
    expect(fautifs).toHaveLength(2);
  });

  it('@critique le SECOND bloc oublié est vu — le trou d’un garde qui n’en lirait qu’un', () => {
    // C'est le scénario le plus probable de régression : on corrige le bloc de
    // production, on oublie celui de pré-production, et les deux environnements
    // divergent en silence.
    const { blocs, fautifs } = lireCaddyfile(DEUX_BLOCS(CONFIANCE, ENTETE_SEULE));
    expect(blocs).toHaveLength(2);
    expect(fautifs).toHaveLength(1);
    expect(fautifs[0]?.cibles).toContain('staging-api:3000');
  });

  it('@critique les deux blocs corrigés sortent propres — le garde ne rougit pas à tort', () => {
    const { blocs, fautifs } = lireCaddyfile(DEUX_BLOCS(CONFIANCE, CONFIANCE));
    expect(blocs).toHaveLength(2);
    expect(fautifs).toHaveLength(0);
  });

  it('@critique un `trusted_proxies` mis EN COMMENTAIRE ne satisfait pas le garde', () => {
    // Le piège de la prose, tombé deux fois dans ce dépôt (fil rouge, @critique) :
    // une phrase qui ANNONCE la protection n'est pas la protection.
    const { fautifs } = lireCaddyfile(
      DEUX_BLOCS(`\t\t\t# ${CONFIANCE.trim()}`, `\t\t\t# TODO ${CONFIANCE.trim()}`),
    );
    expect(fautifs).toHaveLength(2);
  });

  it('@critique un `reverse_proxy` SANS bloc est fautif — il ne peut rien déclarer', () => {
    const { blocs, fautifs } = lireCaddyfile(
      'api.example.invalid {\n\treverse_proxy axion-api:3000\n}\n',
    );
    expect(blocs).toHaveLength(1);
    expect(blocs[0]?.aUnBloc).toBe(false);
    expect(fautifs).toHaveLength(1);
  });

  it('@critique un remplaçant `{…}` n’est pas pris pour une ouverture de bloc', () => {
    // `header_up X-Real-IP {remote_host}` contient des accolades. Un lecteur qui les
    // compterait comme des blocs perdrait le fil de l'imbrication et rendrait
    // n'importe quoi — vert compris.
    const source = `api.example.invalid {
	reverse_proxy {$UPSTREAM_API} {
		header_up X-Real-IP {remote_host}
		header_up Host {upstream_hostport}
${CONFIANCE}
	}
}
`;
    const { blocs, fautifs } = lireCaddyfile(source);
    expect(blocs).toHaveLength(1);
    expect(fautifs).toHaveLength(0);
  });

  it('@critique les options globales `servers { trusted_proxies … }` couvrent tout le fichier', () => {
    const source = `{
	servers {
		trusted_proxies static private_ranges
	}
}

${DEUX_BLOCS(ENTETE_SEULE, ENTETE_SEULE)}`;
    const { blocs, globale, fautifs } = lireCaddyfile(source);
    expect(blocs).toHaveLength(2);
    expect(globale).toBe(true);
    expect(fautifs).toHaveLength(0);
  });

  it('@critique un `servers {}` SANS `trusted_proxies` ne couvre rien', () => {
    const source = `{
	servers {
		protocols h1 h2
	}
}

${DEUX_BLOCS(ENTETE_SEULE, ENTETE_SEULE)}`;
    const { globale, fautifs } = lireCaddyfile(source);
    expect(globale).toBe(false);
    expect(fautifs).toHaveLength(2);
  });

  it('@critique les fins de ligne Windows (CRLF) ne rendent pas le lecteur aveugle', () => {
    // Le dépôt est édité sous Windows. Un `\r` traité comme un caractère ordinaire
    // transformerait `trusted_proxies` en `trusted_proxies\r` — jamais reconnu, et le
    // garde deviendrait rouge en permanence, donc désactivé.
    const { blocs, fautifs } = lireCaddyfile(
      DEUX_BLOCS(CONFIANCE, CONFIANCE).replaceAll('\n', '\r\n'),
    );
    expect(blocs).toHaveLength(2);
    expect(fautifs).toHaveLength(0);
  });
});

describe('le lecteur de `app.ts` mord — sinon ce garde est décoratif', () => {
  const enveloppe = (option: string): string =>
    `import Fastify from 'fastify';\nexport const app = Fastify({\n  ${option}\n  logger: true,\n});\n`;

  it('@critique `trustProxy: true` est vu — la forgerie que personne ne verrait revenir', () => {
    const trouvees = declarationsTrustProxy(enveloppe('trustProxy: true,'));
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]?.valeur).toBe('true');
    expect(CONFIANCE_AVEUGLE.test(trouvees[0]?.valeur ?? '')).toBe(true);
  });

  it('@critique `trustProxy: 2` est vu — la fausse piste écartée par mesure', () => {
    const trouvees = declarationsTrustProxy(enveloppe('trustProxy: 2,'));
    expect(CONFIANCE_AVEUGLE.test(trouvees[0]?.valeur ?? '')).toBe(true);
  });

  it('@critique une liste de plages privées passe — le garde ne rougit pas à tort', () => {
    const trouvees = declarationsTrustProxy(
      enveloppe("trustProxy: '127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16',"),
    );
    expect(trouvees).toHaveLength(1);
    expect(CONFIANCE_AVEUGLE.test(trouvees[0]?.valeur ?? '')).toBe(false);
    expect(TOUTES_LES_ADRESSES.test(trouvees[0]?.valeur ?? '')).toBe(false);
  });

  it('@critique `0.0.0.0/0` est vu — `true` déguisé en liste de plages', () => {
    const trouvees = declarationsTrustProxy(enveloppe("trustProxy: '0.0.0.0/0',"));
    expect(TOUTES_LES_ADRESSES.test(trouvees[0]?.valeur ?? '')).toBe(true);
  });

  it('@critique un tableau de plages est lu ENTIER, virgules comprises', () => {
    const trouvees = declarationsTrustProxy(
      enveloppe("trustProxy: ['10.0.0.0/8', '192.168.0.0/16'],"),
    );
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]?.valeur).toBe("['10.0.0.0/8', '192.168.0.0/16']");
    expect(CONFIANCE_AVEUGLE.test(trouvees[0]?.valeur ?? '')).toBe(false);
  });

  it('@critique un `trustProxy: true` MIS EN COMMENTAIRE n’est pas compté comme un défaut', () => {
    // La contrepartie du piège de la prose : un garde qui accuserait un commentaire
    // serait rouge sur une configuration correcte, donc désactivé dans la semaine.
    const source =
      'export const app = Fastify({\n' +
      '  // trustProxy: true, — refusé le 2026-08-29 : rouvrirait la forgerie.\n' +
      '  /* trustProxy: 1 */\n' +
      "  trustProxy: '10.0.0.0/8',\n" +
      '});\n';
    const trouvees = declarationsTrustProxy(source);
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]?.valeur).toBe("'10.0.0.0/8'");
  });

  it('@critique une absence totale de `trustProxy` est détectée comme telle', () => {
    expect(declarationsTrustProxy(enveloppe('disableRequestLogging: false,'))).toHaveLength(0);
  });
});
