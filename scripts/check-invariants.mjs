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
// =============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const RAZ = '[0m';

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
    .filter((f) =>
      /\.(ts|tsx|js|jsx|mjs|css|scss|html|sql|json|yml|yaml|sh|conf)$|Dockerfile$|Caddyfile$/.test(
        f,
      ),
    )
    .filter((f) => !FICHIERS_HORS_ANALYSE.some((re) => re.test(f)));
}

const controles = [
  {
    id: 'INV-2',
    titre: 'Invariant 2 — aucune référence client dans le code',
    explication:
      'Tout ce qui varie est une DONNÉE DE MISSION. Un nom de client dans un identifiant,\n' +
      '  un libellé, une constante ou une condition rend le produit non générique (E31 :\n' +
      '  « des centaines de clients »). Les fixtures de test utilisent FIL-TPE et FIL-GC,\n' +
      '  des entreprises FICTIVES (09 §4bis) — jamais un client réel.',
    // Le nom du client pilote ne doit apparaître NULLE PART dans le code, pas même
    // en commentaire : c'est le test de généricité du §21.1.
    motif: /nom-de-client-surveille/gi,
    // Le pack documentaire cite légitimement le client : il est hors périmètre
    // d'analyse (fichiersSources() ne renvoie pas docs/).
    fichiersExclus: [],
  },
  {
    id: 'INV-4',
    titre: 'Invariant 4 — aucune couleur en dur',
    explication:
      'Tokens du design system UNIQUEMENT (packages/ui). Une couleur littérale dans un\n' +
      '  composant est une dette de charte : elle survit aux changements de token et casse\n' +
      '  le contraste AA (§33.1, E27/E44). Charte : terracotta #c24a1b · ivoire #faf8f3 ·\n' +
      '  bleu #1a4dd9 · mocha #2a2520 — définis UNE FOIS dans packages/ui/src/tokens.css.',
    // Couvre les notations héritées ET modernes. `oklch()` et `lab()` sont la façon
    // dont on écrira les couleurs en 2027 : ne pas les détecter reviendrait à
    // désarmer le contrôle exactement au moment où il commencerait à servir.
    // Les noms CSS sont inclus parce qu'ils échappent à toute détection numérique —
    // `color: crimson` est une couleur en dur au même titre que `#dc143c`.
    motif:
      /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\bokl(?:ch|ab)\s*\(|\bl(?:ch|ab)\s*\(|\bhwb\s*\(|\bcolor(?:-mix)?\s*\(|(?<=[:\s'"`])(?:crimson|tomato|firebrick|salmon|coral|gold|khaki|teal|navy|maroon|olive|indigo|orchid|plum|beige|ivory|silver|fuchsia|aqua|magenta|cyan)(?=[;\s'"`,)])/g,
    // La définition des tokens est le SEUL endroit où une couleur littérale est légitime.
    fichiersExclus: [/^packages\/ui\/src\/tokens\./, /^packages\/ui\/src\/charte\./],
  },
  {
    id: 'INV-1',
    titre: 'Invariant 1 — UUID v7 généré côté applicatif',
    explication:
      "PostgreSQL 16 n'a PAS de fonction uuidv7() native (PG18 seulement). Une génération\n" +
      '  en SQL produirait des identifiants incompatibles avec la création hors ligne\n' +
      '  (11 §2). `crypto.randomUUID()` produit un v4 non ordonnable : interdit sur toute\n' +
      '  entité créable hors ligne. Utiliser la lib `uuidv7`, client ET serveur.',
    motif: /uuid_generate_v7|gen_uuid_v7|crypto\s*\.\s*randomUUID\s*\(/g,
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
    fichiersInclus: [/(\.env|\.sh|\.ya?ml|\.conf|Dockerfile|Caddyfile)$/],
    fichiersExclus: [],
  },
];

const fichiers = fichiersSources();
let echecs = 0;

console.log(`\nChecklist des invariants — ${fichiers.length} fichier(s) analysé(s)\n`);

for (const c of controles) {
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

    c.motif.lastIndex = 0;
    let m;
    while ((m = c.motif.exec(contenu)) !== null) {
      const numero = contenu.slice(0, m.index).split('\n').length;
      const ligne = (lignes[numero - 1] ?? '').trim();
      // EXEMPTION EXPLICITE, et elle seule. La version précédente exemptait toute
      // ligne contenant « interdit », « invariant », « jamais » ou « garde-fou » —
      // dans un dépôt intégralement commenté en français, c'était un passe-partout :
      // `background: '#ff0000' // ne jamais changer` passait au vert.
      // Désormais il faut un marqueur délibéré, qui laisse une trace lisible en revue.
      // Le marqueur vaut pour SA ligne ou celle qui la précède : un bloc JSDoc se
      // marque naturellement au-dessus, pas au milieu.
      const ligneAvant = lignes[numero - 2] ?? '';
      if (/invariant-oks*:/.test(ligne) || /invariant-oks*:/.test(ligneAvant)) continue;
      // Un placeholder n'est pas un secret : c'est même l'inverse, il signale l'absence.
      if (/__CHANGEME__/.test(ligne)) continue;
      trouvailles.push({ fichier, ligne: numero, extrait: ligne.slice(0, 120) });
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
    '  · Invariant 7 : toute correction = révision tracée, jamais d’écrasement silencieux.\n' +
    '  · Invariant 5 : interface 100 % en français (relecture humaine des libellés).\n' +
    '  · Invariant 6 : aucune génération lourde sur la machine terrain.\n' +
    '  Ces points sont couverts par les tests RBAC exhaustifs (07 §13) et la porte P-B.\n',
);

if (echecs > 0) {
  console.error(`${ROUGE}✗ ${echecs} infraction(s) aux invariants. Build rouge.${RAZ}\n`);
  process.exit(1);
}
console.log(`${VERT}✓ Checklist des invariants : aucune infraction mécanisable détectée.${RAZ}\n`);
