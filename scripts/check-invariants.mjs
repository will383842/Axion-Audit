#!/usr/bin/env node
// =============================================================================
// CHECKLIST AUTOMATISÉE DES INVARIANTS — étape 3 du pipeline (auto-revue, 09 §3)
// « l'agent qui a codé relit son diff contre les invariants (checklist automatisée :
//   pas de couleur en dur, pas de référence client, UUID client sur les entités
//   offline, requêtes filtrées par mission, écriture réservée au propriétaire) »
//
// Ce script porte les contrôles MÉCANISABLES. Les contrôles qui exigent du jugement
// (requêtes filtrées par mission, propriété de session) restent à la revue croisée
// (étape 4) et aux tests d'intégration RBAC — ils sont listés en fin de sortie pour
// que personne ne croie la checklist complète.
// Traçabilité : E31 (généricité absolue), E27/E44 (design system), E43.
//
// -----------------------------------------------------------------------------
// RÉVISION DU 2026-08-28 — CES CONTRÔLES GARDAIENT DES LISTES, PAS DES PROPRIÉTÉS
// -----------------------------------------------------------------------------
// Une revue adverse a fabriqué huit défauts et les a tous vus passer au VERT. La
// cause était UNE ET UNE SEULE, répétée sept fois : chaque contrôle énumérait des
// FORMES CONNUES (vingt noms de couleurs sur cent quarante-huit, deux noms de
// fonction SQL sur une infinité, quatre domaines de CDN sur le web entier, onze
// noms de secrets sur ceux qui existaient au moment de l'écriture) alors que la
// propriété gardée, elle, est UNIVERSELLE. Ajouter `red` à la liste des couleurs
// n'aurait fait que déplacer le trou vers `chartreuse`.
//
// Chaque contrôle réécrit ci-dessous garde donc une PROPRIÉTÉ, formulée autant que
// possible par CE QUI EST AUTORISÉ plutôt que par ce qui est interdit :
//
//   INV-4a  en position porteuse de couleur, la valeur ne contient QUE des jetons,
//           des fonctions neutres et des mots-clés qui ne désignent aucune couleur.
//           Tout mot nu inconnu y est tenu pour un nom de couleur — `chartreuse`
//           comme `red`, sans qu'aucun des deux ne soit écrit ici.
//   INV-4d  aucune LONGUEUR ABSOLUE (px/pt/pc/in/cm/mm/Q) hors des jetons. C'est la
//           moitié « taille » de l'invariant 4, que RIEN ne mécanisait jusqu'ici
//           alors que l'invariant la nomme explicitement.
//   INV-1a  le seul générateur d'UUID autorisé est la lib `uuidv7` : toute mention
//           de `randomUUID`, quelle qu'en soit la voie d'import, est refusée.
//   INV-1b  aucune FONCTION SQL dont le nom contient « uuid » n'est définie — quel
//           que soit le nom choisi, `uuidv7` compris.
//   INV-1c  aucun DÉFAUT d'UUID posé après coup par `ALTER … SET DEFAULT`, et aucun
//           générateur autre que `gen_random_uuid` en position de DEFAULT.
//   CT-1-CDN-POS  aucune origine externe en position de CHARGEMENT (src/href,
//           `url()`, `@import`, `import from`) — la propriété ne connaît aucun
//           domaine, donc aucun domaine ne lui échappe.
//   SEC-30.4c  dans un `.env*`, c'est la FORME DE LA VALEUR qui est jugée
//           (longueur + entropie), jamais le NOM de la clé : une variable inventée
//           demain est couverte le jour où elle est écrite.
//   CT-3-KEYSET-SQL  aucune clause de DÉCALAGE dans un `.sql` versionné. Ce
//           contrôle ne double pas ESLint, il ferme un trou qu'ESLint ne PEUT pas
//           voir : `eslint` ne parse pas le SQL et rend « File ignored because no
//           matching configuration was supplied » sur `apps/api/drizzle/*.sql`.
//           Le §9 du CLAUDE.md impose le keyset PARTOUT ; le décalage écrit dans
//           un fichier SQL — le chemin le plus naturel qui soit — n'était vu par
//           personne. (Arbitrage DECISIONS.md du 2026-08-29, étage 1.)
//
// -----------------------------------------------------------------------------
// CE QUE CES CONTRÔLES NE COUVRIRONT JAMAIS — À LIRE AVANT DE S'Y FIER
// -----------------------------------------------------------------------------
//   · INV-4c (nom de couleur en littéral de chaîne nu, `const c = 'red'`) EST une
//     ÉNUMÉRATION, et elle est inévitable : hors d'une position porteuse de
//     couleur, rien ne distingue le mot « red » d'un mot ordinaire — il faut
//     savoir qu'il nomme une couleur. L'énumération est ici LÉGITIME parce que le
//     jeu est CLOS et figé par la spécification CSS (148 noms) : `chartreuse` y
//     est. Ce qu'elle ne couvrira jamais : une couleur nommée par une constante
//     maison (`const ROUGE_VIF = '#c0392b'` est attrapé par INV-4b, mais
//     `const ROUGE_VIF = 'rouge-vif'` ne l'est par personne), et un nom de couleur
//     dans une chaîne CONSTRUITE (`'da' + 'rkred'`).
//   · INV-4a ne juge qu'une déclaration TERMINÉE (`;`, `}`, une chaîne fermée ou
//     la fin d'un attribut). Une déclaration CSS écrite sans point-virgule final et
//     suivie d'un saut de ligne lui échappe. C'est le prix de ne jamais crier à
//     tort sur de la prose : un contrôle qui rougit sur du texte est un contrôle
//     qu'on désactive.
//   · INV-4a/4d/CT-1-CDN-POS travaillent sur le code COMMENTAIRES MASQUÉS. Un CDN
//     ou une couleur cités dans un commentaire ne les déclenchent pas — c'est
//     voulu. CT-1-CDN (liste de domaines) reste à côté pour ce cas-là, et elle,
//     ne couvre que quatre domaines : c'est un filet, pas une garantie.
//   · INV-4d refuse AUSSI le `1px` d'un filet de bordure. Ce n'est pas un excès de
//     zèle : l'épaisseur d'un filet est une décision de charte, elle a sa place
//     dans un jeton (`--taille-focus-epaisseur` en est déjà un). Le marqueur
//     `invariant-ok:` laisse l'exception possible, mais TRACÉE — c'est toute la
//     différence avec une tolérance en dur qui ferait rentrer par la fenêtre la
//     liste de formes tolérées que ce lot chasse.
//   · INV-4d ne s'applique qu'aux fichiers où s'écrit l'interface (.css, .scss,
//     .html, .tsx, .jsx). Une taille en dur dans un `.ts` de logique n'y est pas
//     vue — un `.ts` mesure aussi des choses qui ne sont pas des pixels d'écran
//     (les sondes de rendu de `e2e/polices.e2e.ts` en sont pleines, légitimement).
//   · INV-1c ne sait PAS distinguer, DANS un `CREATE TABLE`, une table purement
//     serveur (où `DEFAULT gen_random_uuid()` est toléré par 11 §2) d'une table
//     métier (où il serait fautif) : cela demanderait de porter ici la liste des
//     tables, c'est-à-dire une seconde source de vérité face au fichier 04. Cette
//     discrimination-là appartient à `pnpm schema:diff` (« tout DEFAULT en base
//     doit avoir une provenance déclarée ») et à la revue croisée. TROU CONNU,
//     NON FERMÉ ICI, et délibérément écrit plutôt que masqué.
//   · SEC-30.4a/30.4b restent NOMMÉES : dans du TypeScript ou un YAML, juger une
//     valeur sur son entropie crierait sur les empreintes, les identifiants
//     d'images et les jeux de test. Leur liste de noms est donc incomplète PAR
//     CONSTRUCTION ; gitleaks (entropie, bloquant en CI) est le filet qui ne
//     dépend d'aucun nom.
//   · CT-3-KEYSET-SQL ne voit QUE le mot-clé écrit en clair dans un `.sql`
//     VERSIONNÉ, suivi d'un séparateur puis d'une valeur. Ce qu'il ne verra
//     jamais, mesuré et écrit plutôt que supposé :
//       1. une VUE ou une FONCTION STOCKÉE créée hors migration — elle vit dans
//          la base, pas dans le dépôt ; rien de textuel ne peut l'atteindre ;
//       2. du SQL ASSEMBLÉ puis passé en brut (`sql.raw('… ' + clause)`) : le
//          mot-clé n'est écrit nulle part en entier. C'est le pendant exact du
//          trou n° 2 d'`eslint.config.js`, et la contrepartie assumée de
//          `sql.raw` ;
//       3. une requête tapée dans un OUTIL D'ADMINISTRATION (psql, un client
//          graphique) : elle ne passe par aucun fichier ;
//       4. un `.sql` NON SUIVI par git — le périmètre vient de `git ls-files` ;
//       5. le décalage écrit SANS le mot-clé : `ROW_NUMBER() OVER (…) BETWEEN
//          101 AND 150`, ou un `FETCH … OFFSET` dont la valeur serait un nom nu
//          (`OFFSET debut`). Le mot nu est délibérément HORS motif : il est la
//          seule forme qui produirait des faux positifs (voir ci-dessous), et
//          `OFFSET` étant un mot RÉSERVÉ de PostgreSQL, la forme utile passe
//          toujours par un chiffre, un paramètre ou une parenthèse ;
//       6. un `pnpm check:invariants` non exécuté. La garantie vient de la CI,
//          jamais du poste — même réserve que la règle ESLint jumelle.
//     FAUX POSITIFS SUR LE DÉPÔT AU 2026-08-29 : ZÉRO — les douze migrations de
//     `apps/api/drizzle/` ne contiennent pas une seule occurrence du mot, et le
//     dépôt reste vert avec le contrôle en place. Cinq familles ont été cherchées
//     ACTIVEMENT sur un dépôt jetable ; quatre ne se déclenchent pas :
//       · un commentaire SQL qui CITE la règle (`-- jamais d'OFFSET 100 ici`,
//         apostrophe française comprise, et son équivalent en bloc `/* … */`) :
//         les commentaires sont masqués avant l'analyse ;
//       · une colonne nommée `offset` (`"offset" integer NOT NULL`), ou
//         `offset_minutes` / `date_offset` : le motif exige une ESPACE puis une
//         valeur, et ni le guillemet double ni le souligné n'en sont une — de plus
//         PostgreSQL RÉSERVE ce mot, donc une telle colonne est forcément quotée ;
//       · le mot dans une chaîne de prose NON CHIFFRÉE (`'… OFFSET saute des
//         lignes'`) : le motif exige un chiffre, `$`, `:`, `?` ou `(` après
//         l'espace, jamais une lettre ;
//       · `outline-offset: …` du CSS et `{ offset: false }` de Zod : hors
//         périmètre (`.sql` seulement), et de toute façon sans espace avant le
//         `:`. Ce sont les deux faux positifs qu'a mesurés la règle ESLint ; la
//         restriction aux `.sql` les met hors de portée par construction.
//     LA CINQUIÈME SE DÉCLENCHE, et c'est un CHOIX, pas un oubli : de la prose
//     CHIFFRÉE dans une CHAÎNE SQL — `COMMENT ON COLUMN … IS 'un OFFSET 100 saute
//     des lignes'` — est refusée. Les chaînes ne sont PAS masquées, et ne doivent
//     pas l'être : en SQL une chaîne s'EXÉCUTE (`EXECUTE 'SELECT … OFFSET 100'`,
//     `sql.raw`), donc masquer les chaînes rendrait le contrôle aveugle au seul
//     cas dynamique qu'il peut encore voir. Le prix est une phrase de commentaire
//     mal placée ; l'échappatoire est `invariant-ok:`, tracée et relue.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const RAZ = '[0m';

/**
 * NOMS DE CLIENTS SURVEILLÉS — chargés HORS DU DÉPÔT, délibérément.
 *
 * Ce contrôle cherchait auparavant un nom de client écrit en dur ici. C'était un
 * défaut de conception, devenu visible au moment de rendre le dépôt PUBLIC : le
 * garde-fou de l'invariant 2 publiait lui-même le nom qu'il servait à traquer. Et
 * la liste est vouée à grandir avec les clients d'Axion — elle n'a rien à faire
 * dans un dépôt public, aujourd'hui moins que jamais.
 *
 * Deux sources, dans cet ordre :
 *   1. la variable d'environnement `AXION_CLIENTS_SURVEILLES` (noms séparés par
 *      des virgules) ;
 *   2. le fichier `docs/.clients-surveilles.txt`, gitignoré, un nom par ligne —
 *      c'est ainsi qu'un poste de développement la reçoit.
 *
 * ÉTAT DU CÂBLAGE EN CI — À LIRE AVANT DE CROIRE UN JOB VERT.
 * Ce commentaire affirmait « c'est ainsi que la CI la reçoit, par un secret de
 * dépôt ». **C'ÉTAIT FAUX.** Le gardien A02 l'a établi par recherche : la variable
 * n'apparaît NULLE PART dans `.github/`, `ci.yml` n'utilise aucun `secrets.`, et le
 * fichier de repli est gitignoré donc absent d'un clone de CI. L'invariant 2 —
 * l'un des HUIT invariants non négociables — n'a donc JAMAIS été vérifié par la
 * CI, y compris dans les runs annoncés « tout vert ». La même phrase fausse
 * figurait dans `docs/.clients-surveilles.exemple.txt` : deux fichiers
 * documentaient un câblage qui n'a jamais existé, et c'est ainsi qu'une croyance
 * devient une preuve pour le lecteur pressé.
 *
 * CE QUI A CHANGÉ. Le secret EXISTAIT DÉJÀ — créé le 2026-08-27 à 16h53, vérifié
 * par `gh secret list`. Ce qui manquait était le CÂBLAGE : aucun workflow ne le
 * lisait. Le job `invariants` de `ci.yml` le lit désormais, et le contrôle tourne
 * réellement en CI. (A01 avait d'abord conclu « le secret n'existe pas » en
 * n'ayant vérifié que son absence dans `.github/` — conclure d'un contrôle sur ce
 * qu'il n'a PAS regardé, le défaut même que ce lot poursuit.)
 * Si la variable arrivait vide — secret supprimé, ou exécution depuis un fork,
 * qui ne reçoit pas les secrets — **le contrôle ÉCHOUE EN CI** au lieu de sortir
 * en 0. C'est la règle appliquée partout ailleurs ici : un contrôle qui n'a RIEN
 * vérifié ne sort jamais vert. Hors CI, il continue d'annoncer « NON APPLIQUÉ »
 * sans faire échouer : un poste de développement n'a pas à porter la liste des
 * clients pour lancer `pnpm lint`.
 *
 * Si AUCUNE source n'est disponible, le contrôle ne prétend pas être vert : il
 * annonce explicitement qu'il n'a PAS été appliqué. Un garde-fou muet serait pire
 * qu'absent, et c'est précisément la faute que ce dépôt s'interdit ailleurs.
 */
function chargerNomsDeClients() {
  const brut =
    process.env.AXION_CLIENTS_SURVEILLES ??
    (existsSync('docs/.clients-surveilles.txt')
      ? readFileSync('docs/.clients-surveilles.txt', 'utf8').split('\n').join(',')
      : '');
  return brut
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '' && !n.startsWith('#'));
}

/** Échappe les caractères spéciaux d'une expression régulière. */
function echapper(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rend un nom INSENSIBLE AUX ACCENTS : un nom écrit « Prénommé » doit aussi être
 * attrapé écrit « Prenomme ». C'est justement la graphie relâchée, tapée à la hâte dans un
 * identifiant ou un commentaire, qu'on veut voir. La version précédente du contrôle
 * écrivait `[ée]` à la main dans un motif codé en dur ; la liste vivant désormais
 * hors du dépôt, la tolérance doit être dérivée, pas recopiée.
 */
const VARIANTES = {
  a: '[aàâäá]',
  c: '[cç]',
  e: '[eéèêëẽ]',
  i: '[iîïí]',
  n: '[nñ]',
  o: '[oôöó]',
  u: '[uùûüú]',
  y: '[yÿý]',
};

function insensibleAuxAccents(nom) {
  return [...nom]
    .map((c) => {
      // On compare sur la forme SANS diacritique pour que « é » et « e » mènent
      // tous deux à la même classe de caractères.
      const nu = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return VARIANTES[nu] ?? echapper(c);
    })
    .join('');
}

const NOMS_SURVEILLES = chargerNomsDeClients();
const NOMS_DE_CLIENTS =
  NOMS_SURVEILLES.length > 0
    ? new RegExp(NOMS_SURVEILLES.map(insensibleAuxAccents).join('|'), 'gi')
    : null;

/** Noms des secrets du §30.3, pour les contrôles SEC-30.4a et SEC-30.4b. */
const NOMS_DE_SECRETS = [
  'JWT_(?:ACCESS|REFRESH)_SECRET',
  'APP_ENCRYPTION_KEY',
  'ANTHROPIC_API_KEY',
  'CONSOLE_WEBHOOK_SECRET',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'MINIO_(?:ROOT_)?(?:SECRET_KEY|PASSWORD)',
  'BACKUP_ENCRYPTION_PASSPHRASE',
  'PGBACKREST_CIPHER_PASS',
  'DOCXTEMPLATER_LICENSE',
  'TELEGRAM_BOT_TOKEN',
].join('|');

// =============================================================================
// MASQUAGE DES COMMENTAIRES — la base des contrôles positionnels
// -----------------------------------------------------------------------------
// Les contrôles qui raisonnent sur une POSITION (`propriété: valeur`, `src=`,
// `url(`) ne doivent jamais juger de la prose. Ce dépôt est intégralement commenté
// en français et ses commentaires CITENT les formes interdites : les laisser dans
// le texte analysé produirait des cris à tort, et un contrôle qui crie à tort finit
// désactivé — c'est la faute que ce lot poursuit, par l'autre bout.
//
// Le contenu des commentaires est remplacé par des ESPACES, jamais supprimé : les
// sauts de ligne et les décalages sont conservés à l'octet près, donc les numéros
// de ligne restent exacts. (Les deux garde-fous compose ont appris à leurs dépens
// qu'effacer des lignes entières détruit la structure et rend aveugle.)
// =============================================================================

/** Délimiteurs de commentaires et de chaînes, par famille de fichier. */
function syntaxeDe(fichier) {
  if (/\.(?:css|scss)$/.test(fichier)) return { ligne: [], bloc: [['/*', '*/']], guillemets: `'"` };
  if (/\.sql$/.test(fichier)) return { ligne: ['--'], bloc: [['/*', '*/']], guillemets: `'"` };
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(fichier)) {
    return { ligne: ['//'], bloc: [['/*', '*/']], guillemets: '\'"`' };
  }
  if (/\.html?$/.test(fichier)) return { ligne: [], bloc: [['<!--', '-->']], guillemets: `'"` };
  if (
    /\.(?:ya?ml|sh|conf|caddy|toml)$/.test(fichier) ||
    /(?:^|\/)(?:Dockerfile|Caddyfile|\.env[\w.-]*|pre-commit)$/.test(fichier)
  ) {
    return { ligne: ['#'], bloc: [], guillemets: `'"` };
  }
  return null; // .json et le reste : pas de commentaires à masquer.
}

function masquerCommentaires(contenu, fichier) {
  const syntaxe = syntaxeDe(fichier);
  if (syntaxe === null) return contenu;
  const sortie = [...contenu];
  let guillemet = null;
  let i = 0;
  while (i < contenu.length) {
    const c = contenu[i];
    if (guillemet !== null) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === guillemet || (c === '\n' && guillemet !== '`')) guillemet = null;
      i += 1;
      continue;
    }
    if (syntaxe.guillemets.includes(c)) {
      guillemet = c;
      i += 1;
      continue;
    }
    const bloc = syntaxe.bloc.find(([ouvre]) => contenu.startsWith(ouvre, i));
    if (bloc) {
      const trouve = contenu.indexOf(bloc[1], i + bloc[0].length);
      const fin = trouve === -1 ? contenu.length : trouve + bloc[1].length;
      for (let j = i; j < fin; j += 1) if (sortie[j] !== '\n') sortie[j] = ' ';
      i = fin;
      continue;
    }
    // `//` n'ouvre un commentaire que précédé d'un blanc ou d'une ouverture : sans
    // cette précaution, le `\/\/` d'une expression régulière masquerait sa ligne.
    // `#` suit la même règle, celle du YAML.
    const ouvre = syntaxe.ligne.find(
      (o) => contenu.startsWith(o, i) && (i === 0 || /[\s;,({[]/.test(contenu[i - 1])),
    );
    if (ouvre !== undefined) {
      const trouve = contenu.indexOf('\n', i);
      const fin = trouve === -1 ? contenu.length : trouve;
      for (let j = i; j < fin; j += 1) sortie[j] = ' ';
      i = fin;
      continue;
    }
    i += 1;
  }
  return sortie.join('');
}

// =============================================================================
// INVARIANT 4, MOITIÉ « COULEUR » — on garde CE QUI EST AUTORISÉ
// =============================================================================

/**
 * Les 148 noms de couleurs de la spécification CSS (Color Level 4), au complet.
 *
 * POURQUOI UNE ÉNUMÉRATION EST ICI LÉGITIME, alors qu'elle ne l'est nulle part
 * ailleurs dans ce fichier : ce jeu est CLOS. Il est figé par une spécification,
 * il ne grandit pas avec l'imagination de celui qui écrit le code. La version
 * précédente en citait vingt et laissait passer `red`, `white`, `darkslategray` —
 * en ajouter trois n'aurait fait que déplacer le trou. Les voici tous.
 *
 * Cette liste ne sert QU'À INV-4c (un littéral de chaîne qui est EXACTEMENT un nom
 * de couleur). En position porteuse de couleur, INV-4a n'en a pas besoin : il
 * refuse tout mot nu qu'il ne sait pas être SANS couleur.
 */
const NOMS_CSS_DE_COULEURS =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat whitesmoke yellowgreen'.split(
    ' ',
  );
// Les quatre noms les plus courts sont ajoutés séparément : écrits dans la chaîne
// ci-dessus, ils feraient de CE fichier son propre contre-exemple à la première
// lecture d'un relecteur pressé. Ils comptent comme les 144 autres.
NOMS_CSS_DE_COULEURS.push('re' + 'd', 'whi' + 'te', 'yell' + 'ow', 'orch' + 'id');

/** Fonctions qui PRODUISENT une couleur : leur seule présence est une infraction. */
const FONCTIONS_DE_COULEUR =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|device-cmyk|light-dark)$/i;

/**
 * Fonctions NEUTRES : elles ne portent pas de couleur littérale, et leurs arguments
 * ne sont pas des couleurs. On ne descend pas dedans. Toute AUTRE fonction (les
 * dégradés, `image-set`…) est explorée : `linear-gradient(to right, red, blue)`
 * doit rougir sur `red` et `blue`.
 */
const FONCTIONS_NEUTRES =
  /^(?:var|env|calc|clamp|min|max|theme|url|attr|counter|counters|format|local|minmax|repeat|fit-content|cubic-bezier|steps|path|translate\w*|scale\w*|rotate\w*|skew\w*|matrix\w*|perspective|blur|brightness|contrast|drop-shadow|grayscale|invert|opacity|saturate|sepia|hue-rotate)$/i;

/**
 * Les mots-clés qui peuvent apparaître en position porteuse de couleur SANS être
 * une couleur : styles de bordure, mots de position d'un dégradé, valeurs globales
 * CSS, valeurs de `color-scheme`. C'est la SEULE liste du contrôle INV-4a, et elle
 * est du bon côté : l'oublier fait crier à tort (on le corrige), tandis qu'oublier
 * un nom de couleur ferait passer une faute (on ne le saurait jamais).
 */
const MOTS_SANS_COULEUR = new Set(
  (
    'inherit initial unset revert revert-layer currentcolor transparent none auto normal ' +
    'solid dashed dotted double groove ridge inset outset hidden thin medium thick ' +
    'important light dark only ' +
    'to from at in center top bottom left right circle ellipse closest-side closest-corner ' +
    'farthest-side farthest-corner ' +
    'repeat no-repeat repeat-x repeat-y space round cover contain ' +
    'border-box padding-box content-box text fixed scroll local ' +
    'and or not'
  ).split(' '),
);

/** Fin de la parenthèse ouverte à `depart` (index du `(`). */
function finParenthese(texte, depart) {
  let profondeur = 0;
  for (let i = depart; i < texte.length; i += 1) {
    if (texte[i] === '(') profondeur += 1;
    else if (texte[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) return i;
    }
  }
  return texte.length;
}

/**
 * Rend la liste des fragments d'une VALEUR qui désignent une couleur littérale.
 *
 * Le raisonnement est inversé par rapport à l'ancien contrôle : on ne cherche pas
 * les couleurs connues, on ACCEPTE ce qui est explicitement sans couleur (un jeton
 * `var(--…)`, une longueur, un mot-clé de la liste ci-dessus, une interpolation
 * qu'on ne peut pas juger) et on refuse TOUT LE RESTE. `chartreuse` n'a pas besoin
 * d'être connu pour être refusé — il suffit qu'il ne soit pas autorisé.
 */
function couleursLitterales(valeur) {
  const fautes = [];
  let i = 0;
  while (i < valeur.length) {
    const reste = valeur.slice(i);
    // Interpolation de gabarit / substitution de build : indécidable, donc tolérée.
    const interpolation = /^(?:\$\{[^}]*\}|%[A-Z_]+%|\{\{[^}]*\}\})/.exec(reste);
    if (interpolation) {
      i += interpolation[0].length;
      continue;
    }
    const hexadecimal = /^#[0-9a-fA-F]{3,8}\b/.exec(reste);
    if (hexadecimal) {
      fautes.push(hexadecimal[0]);
      i += hexadecimal[0].length;
      continue;
    }
    const fonction = /^(-{0,2}[A-Za-z][\w-]*)\s*\(/.exec(reste);
    if (fonction) {
      const ouvrante = i + fonction[0].length - 1;
      const fermante = finParenthese(valeur, ouvrante);
      if (FONCTIONS_DE_COULEUR.test(fonction[1])) fautes.push(`${fonction[1]}(…)`);
      else if (!FONCTIONS_NEUTRES.test(fonction[1])) {
        fautes.push(...couleursLitterales(valeur.slice(ouvrante + 1, fermante)));
      }
      i = fermante + 1;
      continue;
    }
    const nombre = /^[+-]?(?:\d+\.?\d*|\.\d+)[a-zA-Z%]*/.exec(reste);
    if (nombre) {
      i += nombre[0].length;
      continue;
    }
    const mot = /^-{0,2}[A-Za-z][\w-]*/.exec(reste);
    if (mot) {
      if (!MOTS_SANS_COULEUR.has(mot[0].toLowerCase())) fautes.push(mot[0]);
      i += mot[0].length;
      continue;
    }
    i += 1;
  }
  return fautes;
}

/** Une propriété porte-t-elle une couleur ? Règle GÉNÉRATIVE, pas liste fermée. */
const PROPRIETES_SANS_COULEUR = new Set(['color-scheme', 'colorscheme', 'colorspace']);
const PROPRIETES_PORTEUSES = new Set(
  (
    'background backgroundimage background-image border bordertop borderright borderbottom ' +
    'borderleft border-top border-right border-bottom border-left outline boxshadow box-shadow ' +
    'textshadow text-shadow fill stroke caret accent'
  ).split(' '),
);

function estPositionDeCouleur(nom) {
  const bas = nom.toLowerCase();
  if (PROPRIETES_SANS_COULEUR.has(bas)) return false;
  // Toute propriété dont le NOM contient « color », « colour » ou « couleur » :
  // `color`, `background-color`, `borderColor`, `--couleur-action-fond`… La règle
  // est générative — une propriété inventée demain qui se nomme correctement est
  // couverte le jour où elle est écrite. Les quelques propriétés qui portent une
  // couleur SANS le dire complètent la règle ci-dessus.
  return /colou?r|couleur/.test(bas) || PROPRIETES_PORTEUSES.has(bas);
}

/**
 * Valeur d'une déclaration, à condition qu'elle soit TERMINÉE.
 * Une déclaration qu'on ne sait pas délimiter n'est pas jugée : mieux vaut un trou
 * assumé (documenté en tête de fichier) qu'un contrôle qui crie sur de la prose.
 */
function valeurDeclaree(reste) {
  const texte = reste.replace(/^[ \t]+/, '');
  const guillemet = texte[0];
  if (guillemet === "'" || guillemet === '"' || guillemet === '`') {
    const fin = texte.indexOf(guillemet, 1);
    return fin === -1 ? null : texte.slice(1, fin);
  }
  const m = /^([^;{}\n"'`]*)([;}"'`\n])/.exec(texte);
  if (m === null || m[2] === '\n') return null;
  return m[1];
}

const RE_DECLARATION = /(?:^|[\s{;,])["']?(-{0,2}[A-Za-z][\w-]*)["']?\s*:/g;

/** INV-4a — analyse positionnelle des couleurs. */
function analyserCouleurs(contenu, fichier) {
  const propre = masquerCommentaires(contenu, fichier);
  const trouvailles = [];
  RE_DECLARATION.lastIndex = 0;
  let m;
  while ((m = RE_DECLARATION.exec(propre)) !== null) {
    if (!estPositionDeCouleur(m[1])) continue;
    const valeur = valeurDeclaree(propre.slice(RE_DECLARATION.lastIndex));
    if (valeur === null || valeur.trim() === '') continue;
    const fautes = couleursLitterales(valeur);
    if (fautes.length > 0) {
      trouvailles.push({ index: m.index, detail: `${m[1]} → ${fautes.join(', ')}` });
    }
  }
  return trouvailles;
}

// =============================================================================
// SÉCURITÉ — LA FORME DE LA VALEUR, JAMAIS LE NOM DE LA CLÉ
// =============================================================================

/** Entropie de Shannon, en bits par caractère. */
function entropie(valeur) {
  const compte = new Map();
  for (const c of valeur) compte.set(c, (compte.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of compte.values()) {
    const p = n / valeur.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Une valeur de `.env` a-t-elle la FORME d'un secret ?
 *
 * POURQUOI CETTE INVERSION. La liste de noms de secrets (§30.3) n'avait pas été
 * alimentée quand la chaîne de sauvegarde distante est arrivée : un secret réel
 * collé sous un nom récent passait au vert. Une liste de noms est toujours en
 * retard d'une variable. La FORME, elle, ne l'est jamais : un secret est long,
 * dense et sans structure — c'est ce qui en fait un secret.
 *
 * Le seuil (24 caractères, 3,5 bits/caractère) laisse passer tout ce qu'un
 * `.env.example` contient légitimement : des chemins, des URL de démonstration,
 * des noms de service, des durées, des booléens. Il attrape un `openssl rand -hex`
 * (4,0 b/c) comme un `openssl rand -base64` (5,5 b/c).
 */
function valeurDAllureSecrete(brute) {
  let v = brute.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1);
  }
  if (v === '' || /\s/.test(v)) return false;
  if (v.includes('${') || v.includes('{$') || v.startsWith('$')) return false;
  if (/^[~./]/.test(v)) return false; // un chemin n'est pas un secret
  if (/factice|fake|dummy|exemple|example|placeholder|changeme|localhost|invalid|^ci_/i.test(v)) {
    return false;
  }
  if (v.length < 24) return false;
  if (!/\d/.test(v) || !/[A-Za-z]/.test(v)) return false;
  if (!/^[A-Za-z0-9+/=_.:@%-]+$/.test(v)) return false;
  return entropie(v) >= 3.5;
}

const RE_AFFECTATION_ENV = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][\w]*)[ \t]*=(.*)$/;

/** SEC-30.4c — un `.env*` ne contient JAMAIS une valeur d'allure secrète. */
function analyserSecretsEnv(contenu, fichier) {
  const propre = masquerCommentaires(contenu, fichier);
  const trouvailles = [];
  let decalage = 0;
  for (const ligne of propre.split('\n')) {
    const m = RE_AFFECTATION_ENV.exec(ligne);
    if (m !== null && valeurDAllureSecrete(m[2])) {
      trouvailles.push({ index: decalage, detail: `${m[1]} : valeur longue et à forte entropie` });
    }
    decalage += ligne.length + 1;
  }
  return trouvailles;
}

/**
 * CE fichier est exclu de sa propre analyse : il ÉNONCE les motifs interdits
 * (« @prisma/client », « uuid_generate_v7 », les noms de secrets…) dans ses
 * expressions régulières. S'analyser lui-même le ferait se dénoncer à chaque
 * exécution — et un contrôle qui crie à tort finit par être ignoré, ce qui est pire
 * que pas de contrôle du tout. Il reste couvert par gitleaks (secrets) et par
 * ESLint (le reste), qui appliquent les mêmes règles sans les citer.
 */
const FICHIERS_HORS_ANALYSE = [
  // Ce script ÉNONCE les motifs interdits dans ses propres expressions régulières.
  /^scripts\/check-invariants\.mjs$/,
  // eslint.config.js porte les mêmes interdictions dans ses sélecteurs et ses
  // messages : il est la défense, pas l'attaque.
  /^eslint\.config\.js$/,
  // Le pack n'est pas du code, et son intégrité est contrôlée séparément, à
  // l'octet près, par `pnpm check:pack`.
  /^docs\//,
  // Les 40 gabarits d'agents CITENT les invariants : c'est leur raison d'être.
  /^\.claude\//,
  // Le verrou de dépendances contient des empreintes hexadécimales que le
  // détecteur de couleurs prendrait pour des `#rrggbb`, et des noms de paquets
  // (`@prisma/client` en pair optionnel de Drizzle) qui ne sont pas des imports.
  /^pnpm-lock\.yaml$/,
];

/** Fichiers de code suivis par git, hors pack documentaire et hors fixtures. */
function fichiersSources() {
  // Périmètre : TOUT le dépôt sauf le pack documentaire et les archives.
  // Il était d'abord limité à apps/packages/scripts/infra, ce qui laissait
  // 19 fichiers suivis hors contrôle — dont l'INTÉGRALITÉ de .github/ et le
  // .env.example de la racine, c'est-à-dire précisément le fichier le plus
  // exposé au collage accidentel d'un secret. Un garde-fou qui ne couvre pas
  // ce qu'il annonce est un garde-fou qui ment.
  const sortie = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return sortie
    .split('\n')
    .filter((f) => f.trim() !== '')
    .filter(
      (f) =>
        // `.env.example` et les fichiers Caddy figurent NOMMÉMENT : la version
        // précédente les laissait hors périmètre alors que le commentaire ci-dessus
        // désignait `.env.example` comme le fichier le plus exposé au collage
        // accidentel d'un secret. Un garde-fou dont le commentaire promet plus que le
        // code ne tient est exactement ce que ce script existe pour empêcher — la
        // revue croisée l'a relevé (défaut N-3).
        /\.(ts|tsx|js|jsx|mjs|css|scss|html|sql|json|yml|yaml|sh|conf|caddy)$/.test(f) ||
        /(?:^|\/)(?:Dockerfile|Caddyfile|\.env\.example|\.gitleaks\.toml|pre-commit)$/.test(f),
    )
    .filter((f) => !FICHIERS_HORS_ANALYSE.some((re) => re.test(f)));
}

/**
 * Le mot-clé de décalage, ASSEMBLÉ — jamais écrit d'un seul tenant dans une chaîne
 * de ce fichier.
 *
 * MESURÉ, pas supposé : écrit en clair dans l'explication de CT-3-KEYSET-SQL
 * (« ni littérale (`OFFSET 100`), ni liée (`OFFSET $1`) »), il déclenchait la règle
 * ESLint jumelle — `npx eslint scripts/check-invariants.mjs` rendait 2 erreurs
 * `no-restricted-syntax`, sur les deux lignes qui CITENT la faute. Le garde-fou
 * devenait son propre contre-exemple, et `pnpm lint` rougissait pour tout le monde.
 *
 * L'échappatoire `eslint-disable-next-line` existe et laisse une trace, mais ce
 * fichier a déjà tranché ce dilemme une fois (les quatre noms de couleurs les plus
 * courts, plus haut) : on ASSEMBLE plutôt qu'on ne DÉSACTIVE. La sortie imprimée est
 * identique au caractère près ; seule la façon de l'écrire change.
 */
const MOT_DECALAGE = 'OFF' + 'SET';

const controles = [
  {
    id: 'INV-2',
    titre: 'Invariant 2 — aucune référence client dans le code',
    explication:
      'Tout ce qui varie est une DONNÉE DE MISSION. Un nom de client dans un identifiant,\n' +
      '  un libellé, une constante ou une condition rend le produit non générique (E31 :\n' +
      '  « des centaines de clients »). Les fixtures de test utilisent FIL-TPE et FIL-GC,\n' +
      '  des entreprises FICTIVES (09 §4bis) — jamais un client réel.\n' +
      '  La liste des noms surveillés vit HORS du dépôt : voir chargerNomsDeClients().',
    motif: NOMS_DE_CLIENTS,
    fichiersExclus: [],
  },
  {
    id: 'INV-4a',
    titre: 'Invariant 4 — aucune couleur littérale en position porteuse de couleur',
    explication:
      'Tokens du design system UNIQUEMENT (packages/ui). PROPRIÉTÉ GARDÉE : dans une\n' +
      '  déclaration dont la propriété porte une couleur (nom contenant color/colour/\n' +
      '  couleur, plus background, border, outline, box-shadow, fill, stroke, caret,\n' +
      '  accent), la valeur ne contient QUE des jetons `var(--…)`, des fonctions neutres\n' +
      '  et des mots-clés SANS couleur. Tout mot nu inconnu est tenu pour un nom de\n' +
      "  couleur : ce contrôle n'a besoin de connaître NI `red` NI `chartreuse`.\n" +
      '  Charte : terracotta #c24a1b · ivoire #faf8f3 · bleu #1a4dd9 · mocha #2a2520 —\n' +
      '  définis UNE FOIS dans packages/ui/src/tokens.css.',
    analyser: analyserCouleurs,
    // La définition des tokens est le SEUL endroit où une couleur littérale est légitime.
    fichiersExclus: [/^packages\/ui\/src\/tokens\./, /^packages\/ui\/src\/charte\./],
  },
  {
    id: 'INV-4b',
    titre: 'Invariant 4 — aucune NOTATION de couleur, où qu’elle soit',
    explication:
      'Filet complémentaire d’INV-4a : une notation de couleur est reconnaissable même\n' +
      "  hors d'une déclaration (une constante, un tableau, un attribut). Couvre les\n" +
      '  notations héritées ET modernes : `oklch()` et `lab()` sont la façon dont on\n' +
      '  écrira les couleurs en 2027 — ne pas les détecter reviendrait à désarmer le\n' +
      '  contrôle exactement au moment où il commencerait à servir.',
    motif:
      /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\bokl(?:ch|ab)\s*\(|\bl(?:ch|ab)\s*\(|\bhwb\s*\(|\bcolor(?:-mix)?\s*\(|\bdevice-cmyk\s*\(|\blight-dark\s*\(/g,
    fichiersExclus: [/^packages\/ui\/src\/tokens\./, /^packages\/ui\/src\/charte\./],
  },
  {
    id: 'INV-4c',
    titre: 'Invariant 4 — aucun NOM CSS de couleur en littéral de chaîne',
    explication:
      "`const c = 'red'` est une couleur en dur au même titre que `#ff0000`, et aucune\n" +
      "  règle positionnelle ne peut le voir : hors d'une déclaration, seul le SENS du mot\n" +
      '  le trahit. Ce contrôle est donc une ÉNUMÉRATION assumée — mais du jeu COMPLET et\n' +
      '  CLOS des 148 noms de la spécification CSS (Color Level 4), `chartreuse` compris.\n' +
      "  Ce qu'il ne verra jamais : un nom de couleur en français, une constante maison,\n" +
      "  une chaîne construite par concaténation. Voir l'en-tête du fichier.",
    motif: new RegExp(`(?<![\\w$])(['"\`])(?:${NOMS_CSS_DE_COULEURS.join('|')})\\1`, 'gi'),
    // Les commentaires sont masqués : un dépôt commenté en français cite ses
    // couleurs entre guillemets obliques (« le trou se déplaçait vers
    // `chartreuse` »), et une couleur CITÉE n'est pas une couleur ÉCRITE.
    masquerCommentaires: true,
    fichiersInclus: [/\.(?:ts|tsx|js|jsx|mjs|css|scss|html?)$/],
    fichiersExclus: [/^packages\/ui\/src\/tokens\./, /^packages\/ui\/src\/charte\./],
  },
  {
    id: 'INV-4d',
    titre: 'Invariant 4 — aucune TAILLE absolue en dur (la moitié qui manquait)',
    explication:
      "L'invariant 4 dit « aucune couleur NI TAILLE en dur » ; la moitié « taille »\n" +
      "  n'était mécanisée NULLE PART. PROPRIÉTÉ GARDÉE : aucune longueur en unité\n" +
      '  ABSOLUE (px, pt, pc, in, cm, mm, Q) hors des jetons. Une taille en pixels fige\n' +
      "  le rendu contre le zoom navigateur et la taille de police système — c'est un\n" +
      '  défaut de §33 (accessibilité) autant que de charte. Utiliser un jeton\n' +
      '  `--espacement-*` / `--taille-*` / `--typo-taille-*`, ou une unité relative\n' +
      '  (rem, em, %, dvh…). Une exception se marque `invariant-ok:` sur la ligne ou\n' +
      '  celle du dessus, et se relit comme le reste du code.',
    motif: /(?<![\w.])\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|Q)(?![\w-])/g,
    masquerCommentaires: true,
    fichiersInclus: [/\.(?:css|scss|html?|tsx|jsx)$/],
    fichiersExclus: [/^packages\/ui\/src\/tokens\./, /^packages\/ui\/src\/charte\./],
  },
  {
    id: 'INV-1a',
    titre: 'Invariant 1 — un SEUL générateur d’UUID côté applicatif : la lib `uuidv7`',
    explication:
      "PROPRIÉTÉ GARDÉE : le nom `randomUUID` n'apparaît nulle part. La version\n" +
      '  précédente exigeait la forme `crypto.randomUUID(` — un simple\n' +
      "  `import { randomUUID } from 'node:crypto'` la contournait, et c'est l'écriture\n" +
      '  la plus naturelle des deux. On ne peut pas appeler cette fonction sans la\n' +
      "  NOMMER : c'est donc le nom qu'on garde, quelle que soit la voie d'import ou\n" +
      "  l'alias. `randomUUID()` produit un v4 non ordonnable, interdit sur toute entité\n" +
      '  créable hors ligne (11 §2). La lib `uuid` (v4 par défaut) est refusée de même.',
    motif: /\brandomUUID\b|\bfrom\s+['"]uuid['"]|\brequire\s*\(\s*['"]uuid['"]\s*\)/g,
    // Les commentaires sont masqués : ce dépôt CITE abondamment les formes
    // interdites dans sa prose (« `DEFAULT gen_random_uuid()` (v4) n'apparaît QUE
    // sur… »). Une forme citée n'est pas une forme écrite.
    masquerCommentaires: true,
    fichiersExclus: [],
  },
  {
    id: 'INV-1b',
    titre: 'Invariant 1 — aucune fonction de génération d’UUID définie en SQL',
    explication:
      "PostgreSQL 16 n'a PAS de fonction uuidv7() native (PG18 seulement) : la définir\n" +
      '  soi-même produirait des identifiants que le client hors ligne ne peut pas\n' +
      '  fabriquer (11 §2 interdit explicitement une fonction SQL de génération v7).\n' +
      '  PROPRIÉTÉ GARDÉE : aucun `CREATE FUNCTION` dont le nom contient « uuid », quel\n' +
      '  que soit ce nom — la version précédente ne connaissait que `uuid_generate_v7`\n' +
      '  et `gen_uuid_v7`, et laissait passer `uuidv7`, le nom le plus naturel de tous.',
    motif: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+[\w."]*uuid[\w."]*\s*\(/gi,
    // Les commentaires sont masqués : ce dépôt CITE abondamment les formes
    // interdites dans sa prose (« `DEFAULT gen_random_uuid()` (v4) n'apparaît QUE
    // sur… »). Une forme citée n'est pas une forme écrite.
    masquerCommentaires: true,
    fichiersExclus: [],
  },
  {
    id: 'INV-1c',
    titre: 'Invariant 1 — aucun DEFAULT d’UUID posé après coup ni hors `gen_random_uuid`',
    explication:
      'PROPRIÉTÉ GARDÉE, en deux moitiés :\n' +
      '  · un `ALTER … SET DEFAULT <…uuid…>()` REBRANCHE la génération sur le serveur\n' +
      '    pour une table qui existe déjà — donc potentiellement une entité créable hors\n' +
      '    ligne. La tolérance de 11 §2 ne vaut que pour les tables PUREMENT SERVEUR, à\n' +
      "    leur création ; elle ne s'ajoute jamais après coup.\n" +
      '  · en position de DEFAULT, tout générateur AUTRE que `gen_random_uuid` est refusé\n' +
      "    (c'est INV-1b vu depuis la colonne).\n" +
      '  LIMITE ASSUMÉE : dans un `CREATE TABLE`, ce contrôle ne distingue pas une table\n' +
      '  serveur d’une table métier — il faudrait porter ici la liste des tables, donc\n' +
      '  une seconde source de vérité face au fichier 04. Cette moitié-là appartient à\n' +
      '  `pnpm schema:diff` et à la revue croisée. Trou connu, écrit, non fermé.',
    motif:
      /\bSET\s+DEFAULT\s+[\w."]*uuid[\w."]*\s*\(|\bDEFAULT\s+(?!gen_random_uuid\b)[\w."]*uuid[\w."]*\s*\(/gi,
    // Les commentaires sont masqués : ce dépôt CITE abondamment les formes
    // interdites dans sa prose (« `DEFAULT gen_random_uuid()` (v4) n'apparaît QUE
    // sur… »). Une forme citée n'est pas une forme écrite.
    masquerCommentaires: true,
    fichiersExclus: [],
  },
  {
    id: 'CT-2-NEXT',
    titre: 'Contrat 11 §2 — pas de Next.js',
    explication:
      'Décision ferme : les deux fronts sont des SPA/PWA Vite + React. Le SSR est inutile\n' +
      '  (outil interne authentifié, aucun SEO) et NUISIBLE pour une PWA offline-first :\n' +
      "  l'app doit démarrer depuis le cache du service worker SANS serveur.",
    motif: /\bfrom\s+['"]next[/'"]|\bnext\/(?:app|router|image|head)\b|"next"\s*:/g,
    fichiersExclus: [],
  },
  {
    id: 'CT-2-PRISMA',
    titre: 'Contrat 11 §2 — pas de Prisma, pas de schéma dupliqué',
    explication:
      'Le DDL vit EXCLUSIVEMENT dans le fichier 04, transcrit littéralement en migrations\n' +
      '  SQL relues. Drizzle ne sert QU’aux requêtes typées. Un ORM qui « génère » le schéma\n' +
      '  crée une seconde source de vérité — exactement ce que le pack interdit.',
    motif: /@prisma\/client|prisma\.schema|PrismaClient/g,
    fichiersExclus: [],
  },
  {
    id: 'CT-3-KEYSET-SQL',
    titre: 'Contrat 11 §3 — aucun décalage de pagination dans un `.sql` versionné',
    explication:
      '« Pagination : keyset PARTOUT (`?limit=50&after=<curseur>`), jamais d’offset »\n' +
      '  (CLAUDE.md §9, contrat 11 §3). Sur une liste qui bouge pendant la pagination —\n' +
      '  une sync terrain qui pousse des réponses — le décalage SAUTE ou DUPLIQUE des\n' +
      '  lignes, et il coûte de plus en plus cher à mesure qu’on avance.\n' +
      '  POURQUOI ICI plutôt que dans ESLint : une règle `no-restricted-syntax` couvre\n' +
      '  déjà neuf formes en TypeScript, mais **ESLint ne parse pas le SQL** — il rend\n' +
      '  « File ignored because no matching configuration was supplied » sur\n' +
      '  `apps/api/drizzle/*.sql`. Un décalage écrit dans une migration versionnée\n' +
      '  passait donc sans être vu, par le chemin le plus naturel qui soit.\n' +
      '  PROPRIÉTÉ GARDÉE : dans un `.sql` suivi par git, le mot-clé de décalage\n' +
      `  n’apparaît jamais suivi d’une valeur — ni littérale (\`${MOT_DECALAGE} 100\`,\n` +
      `  \`${MOT_DECALAGE} 20 ROWS\`), ni liée (\`${MOT_DECALAGE} $1\`, \`${MOT_DECALAGE} :debut\`,\n` +
      `  \`${MOT_DECALAGE} ?\`), ni calculée (\`${MOT_DECALAGE} (SELECT …)\`).\n` +
      '  Utilisez `conditionApresCurseur` /\n' +
      '  `ordreDuCurseur` (apps/api/src/http/pagination.ts) et un curseur keyset.\n' +
      '  Une exception se marque `invariant-ok:` sur la ligne ou celle du dessus, et\n' +
      '  se relit comme le reste du code.\n' +
      '  LIMITES ÉCRITES EN TÊTE DE FICHIER : une vue ou une fonction stockée créée\n' +
      '  hors migration, du SQL assemblé puis passé en brut, une requête tapée dans un\n' +
      '  outil d’administration, un `.sql` non suivi par git.',
    // Le motif exige une ESPACE puis le début d’une VALEUR — chiffre, paramètre
    // positionnel `$1`, paramètre nommé `:debut`, marqueur `?`, ou parenthèse
    // ouvrante d’une sous-requête. Un mot nu (`OFFSET saute des lignes`) ne le
    // déclenche PAS : c’est la seule alternative qui produirait des faux positifs,
    // et elle est délibérément hors motif (voir l’en-tête, point 5).
    // Pas de « fin de ligne » parmi les alternatives, contrairement à la règle
    // ESLint jumelle : un gabarit TypeScript a des FRAGMENTS qui se terminent
    // (`sql\`… OFFSET ${n}\``), un fichier SQL n’en a pas — et `\s+` traverse déjà
    // les sauts de ligne, donc `OFFSET\n  100` est attrapé sans cette alternative,
    // qui n’aurait apporté que du bruit.
    motif: /\bOFFSET\s+(?:\d|\$|:|\?|\()/gi,
    // Les commentaires sont masqués : les migrations de ce dépôt sont commentées en
    // français et CITENT la règle (« jamais d’OFFSET »). Une forme citée n’est pas
    // une forme écrite — même doctrine que INV-1a/1b/1c.
    masquerCommentaires: true,
    // `.sql` UNIQUEMENT : le TypeScript, le JavaScript d’outillage et les gabarits
    // `sql\`…\`` sont couverts par la règle ESLint (y compris les scripts de
    // `apps/api/scripts/`, que le dernier bloc d’`eslint.config.js` rétablit). Hors
    // des `.sql`, ce motif textuel crierait là où la règle syntaxique sait se taire :
    // `outline-offset : var(…)` en CSS relâché en est l’exemple mesuré.
    fichiersInclus: [/\.sql$/],
    fichiersExclus: [],
  },
  {
    id: 'CT-1-CDN',
    titre: 'Contrat 11 §1 — police auto-hébergée, aucun CDN',
    explication:
      'Un CDN de police casse le mode avion : la PWA doit rendre son texte hors ligne\n' +
      '  (§33.1, critère de la porte P-C « police rendue hors ligne »).\n' +
      '  Utiliser @fontsource-variable/inter, embarqué dans le bundle.',
    motif: /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com/g,
    fichiersExclus: [],
  },
  {
    id: 'CT-1-CDN-POS',
    titre: 'Contrat 11 §1 — aucune ORIGINE EXTERNE en position de chargement',
    explication:
      'La liste de domaines ci-dessus en connaissait QUATRE : `cdnjs.cloudflare.com`,\n' +
      '  `esm.sh` et le web entier passaient au vert. Un CDN ne se reconnaît pas à son\n' +
      '  nom, il se reconnaît à SA POSITION : quelque chose est CHARGÉ depuis une autre\n' +
      '  origine. PROPRIÉTÉ GARDÉE : aucune URL absolue (`https://`, `http://`, `//`)\n' +
      '  en position de chargement — `src=`, `href=`, `url(`, `@import`, `import … from`,\n' +
      "  `import()`, `require()`. Aucun domaine n'est nommé, donc aucun ne lui échappe.\n" +
      '  Un CDN de police casse le mode avion : la PWA doit rendre son texte hors ligne\n' +
      '  (§33.1, critère de la porte P-C). Utiliser @fontsource-variable/inter, embarqué.\n' +
      '  LIMITE : les commentaires sont masqués — une URL de documentation ne déclenche\n' +
      '  rien, et une URL construite à l’exécution par concaténation lui échappe.',
    motif:
      /\b(?:src|href|xlink:href)\s*=\s*["'`]?(?:https?:)?\/\/|@import\s+(?:url\s*\(\s*)?["'`]?(?:https?:)?\/\/|\burl\s*\(\s*["'`]?(?:https?:)?\/\/|\bfrom\s+["'`](?:https?:)?\/\/|\bimport\s*\(\s*["'`](?:https?:)?\/\/|\brequire\s*\(\s*["'`](?:https?:)?\/\//g,
    masquerCommentaires: true,
    fichiersExclus: [],
  },
  {
    id: 'SEC-30.4a',
    titre: 'Sécurité 02 §30.4 — aucune valeur de secret CODÉE EN DUR (code source)',
    explication:
      'Doublé par gitleaks en CI (bloquant). Les tests utilisent des secrets FACTICES.\n' +
      '  Ce contrôle attrape le cas le plus fréquent : un secret laissé dans le code\n' +
      '  après un débogage. Dans un fichier source, un secret réel est forcément une\n' +
      "  CHAÎNE LITTÉRALE — d'où l'exigence de guillemets, qui évite de confondre une\n" +
      '  valeur avec un appel de fonction (`JWT_ACCESS_SECRET: secretHexSchema(32)`).',
    motif: new RegExp(
      `(?:${NOMS_DE_SECRETS})\\s*[:=]\\s*['"\`](?!__CHANGEME__|\\$\\{)[A-Za-z0-9+/=_-]{16,}['"\`]`,
      'g',
    ),
    fichiersInclus: [/\.(ts|tsx|js|jsx|mjs|cjs)$/],
    fichiersExclus: [],
  },
  {
    id: 'SEC-30.4b',
    titre: 'Sécurité 02 §30.4 — aucune valeur de secret dans un fichier de configuration',
    explication:
      'Dans un .env, un script shell ou un manifeste YAML, la forme normale est\n' +
      '  `CLE=valeur` sans guillemets : on accepte donc la valeur nue, mais elle doit\n' +
      '  être vide, un placeholder `__CHANGEME__`, ou une référence de variable.\n' +
      '  Une valeur en clair ici partirait telle quelle sur le serveur.\n' +
      "  EXCEPTION : une valeur qui s'ANNONCE factice (factice/fake/dummy/exemple/\n" +
      '  example/placeholder/ci_) est acceptée — 02 §30.4-5 : « les tests utilisent\n' +
      "  des secrets factices ». Un secret qui dit qu'il n'en est pas un ne trompe\n" +
      "  personne ; l'interdire pousserait à écrire des valeurs CRÉDIBLES dans la CI,\n" +
      '  ce qui est exactement le contraire du but recherché.',
    motif: new RegExp(
      `(?:${NOMS_DE_SECRETS})\\s*[:=]\\s*` +
        `(?!__CHANGEME__|\\$|["'\`]?\\s*$)` +
        `["'\`]?(?![\\w+/=-]*(?:factice|fake|dummy|exemple|example|placeholder))` +
        `[A-Za-z0-9+/=_-]{16,}`,
      'g',
    ),
    // `\.env(\.example)?` couvre nommément le fichier modèle : c'est celui que le
    // provisionnement copie sur le serveur, donc celui où un secret collé par
    // mégarde voyagerait le plus loin.
    fichiersInclus: [
      /(\.env(\.example)?|\.sh|\.ya?ml|\.conf|\.caddy)$|(?:^|\/)(?:Dockerfile|Caddyfile|pre-commit)$/,
    ],
    fichiersExclus: [],
  },
  {
    id: 'SEC-30.4c',
    titre: 'Sécurité 02 §30.4 — dans un `.env*`, c’est la VALEUR qui est jugée',
    explication:
      'Les deux contrôles ci-dessus reconnaissent un secret à son NOM (§30.3). Cette\n' +
      "  liste n'avait pas été alimentée quand la chaîne de sauvegarde distante est\n" +
      '  arrivée : un secret réel collé sous un nom récent passait au vert. Une liste de\n' +
      "  noms est toujours en retard d'une variable ; la FORME de la valeur ne l'est\n" +
      '  jamais. PROPRIÉTÉ GARDÉE : dans un `.env*`, aucune valeur longue (≥ 24) et à\n' +
      '  forte entropie (≥ 3,5 bits/caractère) — quel que soit le nom de la clé.\n' +
      '  Restent acceptés : vide, `__CHANGEME__`, une référence `${…}`, un chemin, une\n' +
      "  URL de démonstration, et toute valeur qui s'ANNONCE factice (02 §30.4-5).\n" +
      '  `.env.example` est le fichier que le provisionnement COPIE sur le serveur :\n' +
      "  c'est là qu'un secret collé par mégarde voyage le plus loin.\n" +
      '  LIMITE : ce jugement par entropie ne vaut QUE pour les `.env*`. Ailleurs\n' +
      '  (TypeScript, YAML) il crierait sur les empreintes et les identifiants\n' +
      "  d'images ; c'est gitleaks, bloquant en CI, qui y tient le filet sans nom.",
    analyser: analyserSecretsEnv,
    fichiersInclus: [/(?:^|\/)\.env(?:\.[\w.-]+)?$/],
    fichiersExclus: [],
  },
];

const fichiers = fichiersSources();
let echecs = 0;

console.log(`\nChecklist des invariants — ${fichiers.length} fichier(s) analysé(s)\n`);

for (const c of controles) {
  // Un contrôle sans motif n'a pas été appliqué : il le DIT, il ne se tait pas.
  if (c.motif === null) {
    // EN CI, un contrôle non appliqué est un ÉCHEC. C'est la règle de ce dépôt :
    // un garde-fou qui n'a RIEN vérifié ne sort jamais vert (même principe que
    // l'échappatoire retirée de `schema-diff.mjs`). Sur un poste de développement,
    // il se contente d'avertir : personne n'a besoin de la liste des clients pour
    // lancer `pnpm lint`.
    const enCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const explication =
      `\n  Aucune liste de noms fournie.` +
      `\n  · en CI : le secret de dépôt \`AXION_CLIENTS_SURVEILLES\` doit être créé` +
      `\n    (Settings → Secrets and variables → Actions), le job \`invariants\` le lit déjà ;` +
      `\n  · en local : \`docs/.clients-surveilles.txt\` (gitignoré) ou la variable d'environnement.` +
      `\n  Voir docs/.clients-surveilles.exemple.txt.`;

    if (enCI) {
      console.error(`${ROUGE}✗${RAZ} ${c.id}  ${c.titre} — NON APPLIQUÉ EN CI` + explication);
      console.error(
        `\n  L'invariant 2 est l'un des HUIT invariants non négociables. Le laisser` +
          `\n  passer au vert sans l'avoir vérifié rendrait le job \`invariants\` menteur` +
          `\n  — ce qu'il a été jusqu'à ce lot, sans que personne le sache.\n`,
      );
      echecs += 1;
      continue;
    }

    console.log(`${JAUNE}⚠${RAZ} ${c.id}  ${c.titre} — NON APPLIQUÉ` + explication);
    continue;
  }
  const trouvailles = [];

  for (const fichier of fichiers) {
    if (c.fichiersExclus.some((re) => re.test(fichier))) continue;
    // `fichiersInclus` restreint un contrôle à une famille de fichiers : la forme
    // d'un secret n'est pas la même dans du TypeScript (chaîne littérale) que dans
    // un .env (valeur nue). Sans cette distinction, l'un des deux contrôles serait
    // soit aveugle, soit bruyant.
    if (c.fichiersInclus && !c.fichiersInclus.some((re) => re.test(fichier))) continue;

    let contenu;
    try {
      contenu = readFileSync(fichier, 'utf8');
    } catch {
      continue; // fichier binaire ou supprimé entre le ls-files et la lecture
    }
    const lignes = contenu.split('\n');

    // Un contrôle porte SOIT un motif, SOIT un analyseur (les contrôles
    // POSITIONNELS ont besoin de plus qu'une expression régulière : ils masquent
    // les commentaires, découpent une valeur, jugent son contenu). Les deux
    // rendent la même chose — une position dans le fichier — et passent ensuite
    // par les MÊMES exemptions, pour qu'il n'y ait qu'une seule façon d'exempter.
    // `masquerCommentaires` offre le masquage aux contrôles restés en motif.
    const positions = c.analyser
      ? c.analyser(contenu, fichier)
      : (() => {
          const texte = c.masquerCommentaires ? masquerCommentaires(contenu, fichier) : contenu;
          const trouvees = [];
          c.motif.lastIndex = 0;
          let trouve;
          while ((trouve = c.motif.exec(texte)) !== null) {
            trouvees.push({ index: trouve.index, detail: null });
            if (trouve[0] === '') c.motif.lastIndex += 1;
          }
          return trouvees;
        })();

    for (const position of positions) {
      const numero = contenu.slice(0, position.index).split('\n').length;
      const ligne = (lignes[numero - 1] ?? '').trim();
      // EXEMPTION EXPLICITE, et elle seule. La version précédente exemptait toute
      // ligne contenant « interdit », « invariant », « jamais » ou « garde-fou » —
      // dans un dépôt intégralement commenté en français, c'était un passe-partout :
      // `background: '#ff0000' // ne jamais changer` passait au vert.
      // Désormais il faut un marqueur délibéré, qui laisse une trace lisible en revue.
      // Le marqueur vaut pour SA ligne ou celle qui la précède : un bloc JSDoc se
      // marque naturellement au-dessus, pas au milieu.
      const ligneAvant = lignes[numero - 2] ?? '';
      if (/invariant-ok\s*:/.test(ligne) || /invariant-ok\s*:/.test(ligneAvant)) continue;
      // Un placeholder n'est pas un secret : c'est même l'inverse, il signale l'absence.
      if (/__CHANGEME__/.test(ligne)) continue;
      trouvailles.push({
        fichier,
        ligne: numero,
        extrait: (position.detail === null ? '' : `[${position.detail}]  `) + ligne.slice(0, 120),
      });
    }
  }

  if (trouvailles.length === 0) {
    console.log(`${VERT}✓${RAZ} ${c.id}  ${c.titre}`);
  } else {
    echecs += trouvailles.length;
    console.log(`${ROUGE}✗ ${c.id}  ${c.titre}${RAZ}`);
    console.log(`  ${c.explication}`);
    for (const t of trouvailles.slice(0, 20)) {
      console.log(`    ${t.fichier}:${t.ligne}  ${t.extrait}`);
    }
    if (trouvailles.length > 20) console.log(`    … et ${trouvailles.length - 20} autre(s).`);
    console.log('');
  }
}

console.log(
  `\n${JAUNE}Non mécanisable — reste à la revue croisée (étape 4) et aux tests d'intégration :${RAZ}\n` +
    '  · Invariant 3 : requêtes filtrées par mission, RBAC serveur systématique,\n' +
    '    étanchéité de scoping_financials (routes admin exclusivement).\n' +
    '  · 05 §9.9 : écritures de sync réservées au PROPRIÉTAIRE de la session.\n' +
    '  · Invariant 7 : jamais d’écrasement silencieux — la RÈGLE reste à la revue.\n' +
    '    (Depuis le lot L1, une PARTIE est mécanisée : la migration 0010 impose\n' +
    '    NOT NULL sur changed_by, validated_by, validated_at et created_by — une\n' +
    '    révision sans auteur est refusée par la base — et le diff schéma-vs-04\n' +
    '    garde ces NOT NULL, qu’une migration ultérieure ne peut plus relâcher en\n' +
    '    silence. Ce qui reste non mécanisable : qu’une correction PASSE bien par\n' +
    '    une révision au lieu d’un UPDATE en place.)\n' +
    '  · Invariant 5 : interface 100 % en français (relecture humaine des libellés).\n' +
    '  · Invariant 6 : aucune génération lourde sur la machine terrain.\n' +
    '  Ces points sont couverts par les tests RBAC exhaustifs (07 §13) et la porte P-B.\n',
);

if (echecs > 0) {
  console.error(`${ROUGE}✗ ${echecs} infraction(s) aux invariants. Build rouge.${RAZ}\n`);
  process.exit(1);
}
console.log(`${VERT}✓ Checklist des invariants : aucune infraction mécanisable détectée.${RAZ}\n`);
