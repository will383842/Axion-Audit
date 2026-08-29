// =============================================================================
// TESTS DES DEUX GARDE-FOUS DE CHECKLIST
//   · scripts/check-invariants.mjs
//   · scripts/check-no-skipped-tests.mjs
//
// POURQUOI CE FICHIER EXISTE. Une revue adverse a fabriqué dix défauts et les a vus
// passer au VERT dans ces deux scripts. La cause était unique et répétée : des
// contrôles bâtis sur des LISTES DE FORMES CONNUES (vingt noms de couleurs sur
// cent quarante-huit, deux noms de fonction SQL, quatre domaines de CDN, onze noms
// de secrets) face à des propriétés UNIVERSELLES. Corriger ces scripts ne prouve
// rien tant qu'on ne les a pas VUS passer du vert au rouge sur la mutation exacte :
// c'est la règle qui a fait la valeur des tests de `garde-fous-compose.test.ts`,
// et ce fichier l'applique aux deux garde-fous qui en étaient dépourvus.
//
// 09 §5.6 — ce fichier est écrit par A75, qui n'est l'auteur d'aucun des deux
// scripts testés.
//
// COMMENT ILS SONT ÉPROUVÉS. `check-invariants.mjs` détermine son périmètre par
// `git ls-files` et lit ses fichiers en chemins RELATIFS : il suffit donc de
// l'exécuter avec un RÉPERTOIRE COURANT différent — un dépôt git jetable contenant
// les seuls fichiers de la fixture. On teste le fichier LIVRÉ, sans le modifier,
// sans point d'injection, et sans jamais écrire dans le dépôt réel.
//
// POURQUOI CE FICHIER N'EST PAS EXCLU DE SA PROPRE ANALYSE. `check-invariants.mjs`
// s'exclut lui-même, à juste titre : il ÉNONCE les motifs interdits. Ce fichier-ci
// les énonce aussi — mais l'exclure créerait un angle mort permanent dans un `.ts`.
// Chaque fixture fautive porte donc le marqueur `invariant-ok:` du dépôt, en
// COMMENTAIRE DE FIN DE LIGNE sur la fixture elle-même : l'exemption est explicite,
// locale, et se relit. Le marqueur est de fin de ligne et non au-dessus parce qu'un
// reformatage Prettier peut insérer un retour à la ligne entre les deux, ce qui
// détacherait silencieusement le marqueur de ce qu'il exempte — mesuré ici. Les
// fixtures de l'anti-skip, elles, sont ASSEMBLÉES À L'EXÉCUTION — ce garde-fou-ci
// n'admet aucune exception (sa liste `EXCEPTIONS` doit rester vide, 11 §8.5), et
// on ne lui en fabrique pas une pour ses propres tests.
//
// Traçabilité : invariants 1 et 4 · 02 §30.4 · 11 §1-2 · 09 §5.6, §5.7.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const INVARIANTS = join(RACINE_DEPOT, 'scripts', 'check-invariants.mjs');
const ANTI_SKIP = join(RACINE_DEPOT, 'scripts', 'check-no-skipped-tests.mjs');

interface Verdict {
  readonly code: number;
  readonly sortie: string;
}

const bacs: string[] = [];

// Les couleurs ANSI n'ont rien à faire dans une assertion. Le motif se construit à
// partir du code du caractère d'échappement : écrit en littéral, il déclencherait
// `no-control-regex`, et le désactiver pour un test serait exactement le genre de
// contournement que ce dépôt refuse ailleurs.
const CODES_ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

/**
 * Un dépôt git jetable contenant EXACTEMENT les fichiers donnés.
 *
 * `git add` suffit : `git ls-files` lit l'index, pas l'historique. Aucun commit,
 * donc aucune identité git requise — un test ne doit rien exiger de la machine.
 */
function creerDepot(fichiers: Readonly<Record<string, string>>): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-garde-fous-inv-'));
  bacs.push(bac);
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const cible = join(bac, relatif);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, 'utf8');
  }
  const git = (...args: readonly string[]): void => {
    const r = spawnSync('git', [...args], { cwd: bac, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  };
  git('-c', 'init.defaultBranch=main', 'init', '-q');
  git('add', '-A');
  return bac;
}

function executer(script: string, bac: string): Verdict {
  const resultat = spawnSync(process.execPath, [script], {
    cwd: bac,
    encoding: 'utf8',
    env: {
      ...process.env,
      // La liste des clients surveillés vit hors du dépôt ; sans elle, INV-2 échoue
      // EN CI (à dessein). On la fournit pour que ces cas mesurent ce qu'ils
      // prétendent mesurer, et pas la configuration de la machine.
      AXION_CLIENTS_SURVEILLES: 'zzz-aucun-client-dans-ce-bac',
    },
  });
  const sortie = `${resultat.stdout}${resultat.stderr}`.replaceAll(CODES_ANSI, '');
  return { code: resultat.status ?? -1, sortie };
}

const lancerInvariants = (fichiers: Readonly<Record<string, string>>): Verdict =>
  executer(INVARIANTS, creerDepot(fichiers));

const lancerAntiSkip = (fichiers: Readonly<Record<string, string>>): Verdict =>
  executer(ANTI_SKIP, creerDepot(fichiers));

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// =============================================================================
// TÉMOIN SAIN — il vient EN PREMIER, parce qu'un contrôle qui rougit sur du code
// légitime sera désactivé par le premier agacé. Chaque cas fautif ci-dessous est
// ce témoin PLUS une faute, et une seule.
// =============================================================================
const ECRAN_SAIN =
  'export const style = {\n' +
  "  color: 'var(--couleur-texte-principal)',\n" +
  "  background: 'var(--couleur-surface-fond)',\n" +
  "  minHeight: '100dvh',\n" +
  "  padding: 'var(--espacement-6)',\n" +
  '};\n';

const CSS_SAIN =
  ':root {\n' +
  '  --couleur-action-fond: var(--source-terracotta);\n' +
  '}\n' +
  '.carte {\n' +
  '  color: var(--couleur-texte-principal);\n' +
  '  border: var(--taille-filet) solid var(--couleur-bordure-discrete);\n' +
  '  max-width: 32rem;\n' +
  '  padding: var(--espacement-4);\n' +
  '}\n';

describe('check-invariants.mjs — le témoin sain reste vert', () => {
  it('accepte un écran dont toute couleur et toute taille passent par un jeton', () => {
    const { code, sortie } = lancerInvariants({
      'apps/field/src/App.tsx': ECRAN_SAIN,
      'packages/ui/src/carte.css': CSS_SAIN,
    });
    expect(sortie).toContain('aucune infraction mécanisable détectée');
    expect(code).toBe(0);
  });

  it('accepte `1px solid` dans une bordure — la seule taille absolue qui reste lisible', () => {
    // NON-RÉGRESSION VOLONTAIRE : `border: 1px` est refusé par INV-4d comme le
    // reste, et c'est assumé. Ce cas vérifie que le marqueur `invariant-ok:` du
    // dépôt fonctionne sur INV-4d comme sur les autres — une exception tracée
    // reste possible, elle ne se prend simplement pas en silence.
    const { code } = lancerInvariants({
      'packages/ui/src/filet.css':
        '.filet {\n  /* invariant-ok: filet d’un pixel, décision tracée */\n  border-top: 1px solid var(--couleur-bordure-discrete);\n}\n',
    });
    expect(code).toBe(0);
  });

  it("n'accuse pas une URL de documentation citée dans un commentaire", () => {
    const { code } = lancerInvariants({
      'apps/api/src/note.ts': '// Voir https://www.rfc-editor.org/rfc/rfc9562 pour les UUID v7.\n',
    });
    expect(code).toBe(0);
  });
});

// =============================================================================
// INVARIANT 4 — LA MOITIÉ « COULEUR », ET LES TROUS QUE LA REVUE A MESURÉS
// =============================================================================
describe('check-invariants.mjs — invariant 4, couleurs', () => {
  it('INV-4c refuse un nom CSS de couleur en littéral de chaîne nu', () => {
    const { code, sortie } = lancerInvariants({
      'apps/hq/src/theme.ts': "export const c = 'red';\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4c');
    expect(code).toBe(1);
  });

  it('INV-4c connaît les 148 noms de la spécification, pas les vingt les plus connus', () => {
    // `darkslategray` passait au vert : il n'était pas dans la liste de vingt.
    const { code, sortie } = lancerInvariants({
      'apps/hq/src/theme.ts': "export const c = 'darkslategray';\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4c');
    expect(code).toBe(1);
  });

  it('INV-4a refuse un mot nu INCONNU en position de couleur — sans le connaître', () => {
    // `chartreuse` est le contre-exemple du mandat : allonger une liste de noms
    // n'aurait fait que déplacer le trou jusqu'ici. INV-4a ne le connaît pas ; il
    // refuse tout mot qu'il ne sait pas être SANS couleur.
    const { code, sortie } = lancerInvariants({
      'packages/ui/src/carte.css': '.carte {\n  background-color: chartreuse;\n}\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4a');
    expect(code).toBe(1);
  });

  it('INV-4a descend dans un dégradé pour y trouver la couleur', () => {
    const { code, sortie } = lancerInvariants({
      'packages/ui/src/carte.css':
        '.carte {\n  background: linear-gradient(to right, tomato, var(--couleur-action-fond));\n}\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4a');
    expect(code).toBe(1);
  });

  it('INV-4b refuse une notation moderne (`oklch`) autant qu’un hexadécimal', () => {
    const { code, sortie } = lancerInvariants({
      'packages/ui/src/carte.css': '.carte {\n  color: oklch(0.7 0.15 40);\n}\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4b');
    expect(code).toBe(1);
  });
});

// =============================================================================
// INVARIANT 4 — LA MOITIÉ « TAILLE », QUE RIEN NE MÉCANISAIT
// =============================================================================
describe('check-invariants.mjs — invariant 4, tailles (la moitié qui manquait)', () => {
  it('INV-4d refuse une largeur en pixels', () => {
    const { code, sortie } = lancerInvariants({
      'packages/ui/src/carte.css': '.carte {\n  width: 320px;\n}\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4d');
    expect(code).toBe(1);
  });

  it('INV-4d refuse une taille de police en pixels — celle qui casse le zoom', () => {
    const { code, sortie } = lancerInvariants({
      'apps/field/src/App.tsx': "const s = { fontSize: '14px' };\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-4d');
    expect(code).toBe(1);
  });

  it('INV-4d laisse passer les unités RELATIVES : ce sont elles qu’on veut voir', () => {
    const { code } = lancerInvariants({
      'packages/ui/src/carte.css': '.carte {\n  width: 32rem;\n  font-size: 1.125rem;\n}\n',
      'apps/field/src/App.tsx': "const s = { minHeight: '100dvh', width: '50%' };\n",
    });
    expect(code).toBe(0);
  });

  it('INV-4d ne crie pas sur « base 4 px » écrit dans un commentaire', () => {
    const { code } = lancerInvariants({
      'packages/ui/src/carte.css':
        '/* Espacement : base 4px, cible tactile 44px. */\n.carte {\n  padding: var(--espacement-4);\n}\n',
    });
    expect(code).toBe(0);
  });
});

// =============================================================================
// INVARIANT 1 — LES TROIS VOIES D'UN UUID QUI N'EST PAS UN v7 APPLICATIF
// =============================================================================
describe('check-invariants.mjs — invariant 1, génération des UUID', () => {
  it('INV-1b refuse une fonction SQL nommée `uuidv7` — le nom le plus naturel de tous', () => {
    const { code, sortie } = lancerInvariants({
      'apps/api/drizzle/0099_essai.sql':
        'CREATE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-1b');
    expect(code).toBe(1);
  });

  it('INV-1b refuse aussi les deux noms que la version précédente connaissait', () => {
    const { code, sortie } = lancerInvariants({
      'apps/api/drizzle/0099_essai.sql':
        'CREATE OR REPLACE FUNCTION public.gen_uuid_v7() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-1b');
    expect(code).toBe(1);
  });

  it('INV-1c refuse un DEFAULT d’UUID v4 POSÉ APRÈS COUP sur une table métier', () => {
    const { code, sortie } = lancerInvariants({
      'apps/api/drizzle/0099_essai.sql':
        'ALTER TABLE missions ALTER COLUMN id SET DEFAULT gen_random_uuid();\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-1c');
    expect(code).toBe(1);
  });

  it('INV-1c laisse la tolérance 11 §2 intacte à la CRÉATION d’une table serveur', () => {
    // TROU CONNU ET ÉCRIT : dans un `CREATE TABLE`, ce contrôle ne distingue pas
    // une table purement serveur d'une table métier — il faudrait porter ici la
    // liste des tables, donc une seconde source de vérité face au fichier 04.
    // Ce cas verrouille la moitié qui EST tenue : la tolérance ne devient pas un
    // refus, et le dépôt réel (quatre tables de logs) reste vert.
    const { code } = lancerInvariants({
      'apps/api/drizzle/0099_essai.sql':
        'CREATE TABLE sync_log (\n  id UUID NOT NULL DEFAULT gen_random_uuid()\n);\n',
    });
    expect(code).toBe(0);
  });

  it('INV-1a refuse le générateur v4 IMPORTÉ NOMMÉMENT depuis `node:crypto`', () => {
    const { code, sortie } = lancerInvariants({
      'apps/api/src/id.ts':
        "import { randomUUID } from 'node:crypto';\nexport const id = () => randomUUID();\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('INV-1a');
    expect(code).toBe(1);
  });
});

// =============================================================================
// CONTRAT 11 §1 — AUCUNE ORIGINE EXTERNE, ET NON « AUCUN DOMAINE CONNU »
// =============================================================================
describe('check-invariants.mjs — origine externe', () => {
  it('CT-1-CDN-POS refuse un CDN sous un domaine que personne n’a listé', () => {
    const { code, sortie } = lancerInvariants({
      'apps/hq/index.html':
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/x/x.js"></script>\n', // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('CT-1-CDN-POS');
    expect(code).toBe(1);
  });

  it('CT-1-CDN-POS refuse un import de module distant (`esm.sh`)', () => {
    const { code, sortie } = lancerInvariants({
      'apps/hq/src/x.ts': "import { chose } from 'https://esm.sh/chose';\nexport { chose };\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('CT-1-CDN-POS');
    expect(code).toBe(1);
  });

  it('CT-1-CDN-POS refuse une police chargée par `@import` protocole-relatif', () => {
    const { code, sortie } = lancerInvariants({
      'packages/ui/src/polices2.css': "@import url('//exemple-inconnu.test/police.css');\n", // invariant-ok: fixture de test — cette ligne EST le défaut attendu.
    });
    expect(sortie).toContain('CT-1-CDN-POS');
    expect(code).toBe(1);
  });
});

// =============================================================================
// SÉCURITÉ §30.4 — LA FORME DE LA VALEUR, PAS LE NOM DE LA CLÉ
// =============================================================================

/**
 * Une valeur d'allure secrète, ASSEMBLÉE À L'EXÉCUTION.
 *
 * Écrire ici une chaîne dense de quarante caractères reviendrait à déposer dans le
 * dépôt exactement ce que ce contrôle existe pour empêcher — et à faire crier
 * gitleaks sur son propre test. La suite est déterministe (7 est premier avec 16,
 * donc les seize chiffres hexadécimaux reviennent à égalité) : 4,0 bits par
 * caractère, très au-dessus du seuil de 3,5.
 */
const VALEUR_DALLURE_SECRETE = Array.from(
  { length: 40 },
  (_, i) => '0123456789abcdef'[(i * 7 + 3) % 16],
).join('');

describe('check-invariants.mjs — secrets dans un `.env`', () => {
  it('SEC-30.4c refuse une valeur dense sous un nom que la liste §30.3 ignore', () => {
    const { code, sortie } = lancerInvariants({
      '.env.example': `STORAGE_BOX_BORG_PASSPHRASE=${VALEUR_DALLURE_SECRETE}\n`,
    });
    expect(sortie).toContain('SEC-30.4c');
    expect(code).toBe(1);
  });

  it('SEC-30.4c laisse passer tout ce qu’un `.env.example` contient légitimement', () => {
    const { code } = lancerInvariants({
      '.env.example':
        '# Modèle de configuration.\n' +
        'NODE_ENV=development\n' +
        'POSTGRES_PASSWORD=__CHANGEME__\n' +
        'DATABASE_URL=postgresql://axion:__CHANGEME__@postgres:5432/axion_audit\n' +
        'STORAGE_BOX_SSH_KEY_PATH=/root/.ssh/storagebox_ed25519\n' +
        'CONSOLE_BASE_URL=https://console.example.invalid\n' +
        'RESTORE_TEST_CRON="0 3 * * *"\n' +
        'JWT_ACCESS_SECRET=${JETON_INJECTE_AU_DEPLOIEMENT}\n',
    });
    expect(code).toBe(0);
  });
});

// =============================================================================
// ANTI-SKIP — LES DEUX DÉSACTIVATIONS QUI SORTAIENT AU VERT
// -----------------------------------------------------------------------------
// Les fixtures sont ASSEMBLÉES À L'EXÉCUTION, jamais écrites en clair : ce fichier
// est lui-même un `*.test.ts`, donc analysé par le garde-fou qu'il teste. Le
// contourner par une entrée dans sa liste `EXCEPTIONS` serait précisément le trou
// par lequel un test @critique disparaîtrait — cette liste doit rester vide, et
// l'y toucher exige une entrée DECISIONS.md signée par Williams (11 §8.5).
// =============================================================================
const POINT = '.';
const OUVRE = '(';
/** `skip`, jamais écrit d'un seul tenant : ce fichier est analysé par le contrôle. */
const MOT_SKIP = ['sk', 'ip'].join('');

/** `it`, `test`… suivis d'une chaîne de modificateurs, sans jamais l'écrire en clair. */
const appel = (entree: string, ...modificateurs: readonly string[]): string =>
  `${entree}${modificateurs.map((m) => POINT + m).join('')}${OUVRE}`;

const enveloppe = (corps: string): Readonly<Record<string, string>> => ({
  'apps/api/tests/essai.test.ts':
    "import { describe, expect, it } from 'vitest';\n" +
    `describe('essai', () => {\n  ${corps}\n});\n`,
});

describe('check-no-skipped-tests.mjs', () => {
  it('accepte une suite dont aucun test n’est désactivé', () => {
    const { code, sortie } = lancerAntiSkip(
      enveloppe("it('vérifie quelque chose', () => { expect(1).toBe(1); });"),
    );
    expect(sortie).toContain('aucun test désactivé');
    expect(code).toBe(0);
  });

  it('accepte les modificateurs qui organisent l’exécution sans la supprimer', () => {
    const { code } = lancerAntiSkip(
      enveloppe(
        `${appel('it', 'each')}[1, 2])('cas %i', (n: number) => { expect(n).toBeGreaterThan(0); });\n  ` +
          `${appel('it', 'concurrent')}'en parallèle', () => { expect(1).toBe(1); });`,
      ),
    );
    expect(code).toBe(0);
  });

  it('refuse une CHAÎNE de modificateurs terminée par une désactivation, pas une forme listée', () => {
    const { code, sortie } = lancerAntiSkip(
      enveloppe(`${appel('test', 'concurrent', 'skip')}'désactivé', () => {});`),
    );
    expect(sortie).toContain('modificateur non autorisé');
    expect(sortie).toContain('skip');
    expect(code).toBe(1);
  });

  it('refuse une désactivation CONDITIONNELLE (le modificateur « runIf »)', () => {
    const { code, sortie } = lancerAntiSkip(
      enveloppe(`${appel('it', 'runIf')}false)('jamais exécuté', () => {});`),
    );
    expect(sortie).toContain('GARDE-FOU ANTI-SKIP');
    expect(code).toBe(1);
  });

  it('refuse un modificateur INCONNU de ce dépôt — le refus est le comportement par défaut', () => {
    // C'est la propriété qui compte : un modificateur que Vitest ajoutera demain
    // est refusé le jour où il apparaît, sans que personne ait à mettre ce script
    // à jour. Le sens du refus est le bon : on ne laisse pas passer par ignorance.
    const { code, sortie } = lancerAntiSkip(
      enveloppe(`${appel('it', 'desactiveSi')}true)('inconnu', () => {});`),
    );
    expect(sortie).toContain('modificateur non autorisé');
    expect(code).toBe(1);
  });

  it('refuse la désactivation écrite en OPTION d’objet', () => {
    const { code, sortie } = lancerAntiSkip(
      enveloppe(`it('option', { ${MOT_SKIP}: true }, () => {});`),
    );
    expect(sortie).toContain('désactivation par option');
    expect(code).toBe(1);
  });

  it('refuse une désactivation appelée sur un AUTRE receveur que `it`/`test`', () => {
    const { code, sortie } = lancerAntiSkip(
      enveloppe(`${appel('monTest', 'skip')}'échappé au nom', () => {});`),
    );
    expect(sortie).toContain('appel de désactivation');
    expect(code).toBe(1);
  });

  it('ne crie pas sur un NOM DE FICHIER `*.test.ts` cité dans un commentaire', () => {
    // Trois commentaires du dépôt réel citent `…integration.test.ts` : sans le
    // regard arrière, ce contrôle les prenait pour des chaînes de modificateurs.
    const { code } = lancerAntiSkip(
      enveloppe(
        "// Voir apps/api/tests/l0-sauvegarde.integration.test.ts pour le cas complet.\n  it('rien', () => {});",
      ),
    );
    expect(code).toBe(0);
  });

  it('ÉCHOUE quand il n’a AUCUN fichier de test à analyser — il ne se déclare pas vert', () => {
    const { code, sortie } = lancerAntiSkip({ 'README.md': '# dépôt sans tests\n' });
    expect(sortie).toContain('aucun fichier de test trouvé');
    expect(code).toBe(1);
  });
});

// =============================================================================
// PAGINATION KEYSET DANS LES `.sql` VERSIONNÉS — LE TROU QU'ESLINT NE VOIT PAS
// -----------------------------------------------------------------------------
// `CLAUDE.md` §9 : « Pagination : keyset partout (`?limit=50&after=<curseur>`),
// JAMAIS d'offset ». Une règle ESLint tient cette promesse sur le TypeScript ;
// elle ne tient rien du tout sur `apps/api/drizzle/*.sql`, où ESLint rend « File
// ignored because no matching configuration was supplied ». Le décalage était donc
// atteignable par le chemin le plus naturel de tous : écrire du SQL dans un
// fichier SQL. Arbitrage du 2026-08-29 (DECISIONS.md, « La règle anti-décalage ne
// voit pas les fichiers `.sql` ») : un contrôle TEXTUEL dans `check-invariants.mjs`,
// lancé par `pnpm check:invariants`, refuse désormais ce décalage.
//
// 09 §5.6 — ces cas sont écrits par A04, qui n'a pas écrit le contrôle et ne l'a
// pas lu : ils sont dérivés de la SPÉCIFICATION seule. C'est la condition pour
// qu'ils mesurent l'exigence, et non l'implémentation qui prétend la tenir.
//
// LES DEUX MOITIÉS N'ONT PAS LA MÊME DIFFICULTÉ. Refuser est facile ; ne pas
// refuser à tort est le vrai travail. Un contrôle textuel qui crie sur un
// commentaire SQL, sur une colonne dont le nom contient le mot, ou sur
// `outline-offset` finit DÉSACTIVÉ — et un contrôle désactivé est pire que pas de
// contrôle du tout, parce qu'il laisse croire que quelqu'un regarde. Les cas
// « ne se déclenche pas » sont donc aussi nombreux ici que les refus.
//
// Traçabilité : `CLAUDE.md` §9 · DECISIONS.md 2026-08-29 [L3a] · 09 §5.6.
// =============================================================================

/** Fixture fautive. Le numéro `0099` ne contient AUCUN 5 : voir `ligneDuRapport`. */
const MIGRATION_ESSAI = 'apps/api/drizzle/0099_essai.sql';

/**
 * Le mot interdit, dans ses trois casses, ASSEMBLÉ À L'EXÉCUTION.
 *
 * Ce n'est pas une coquetterie : la règle ESLint `no-restricted-syntax` du
 * 2026-08-29 refuse ce mot dans une CLAUSE SQL écrite en littéral `.ts`, et elle a
 * raison de le faire — les scripts de `apps/api/scripts/` écrivent du SQL. Écrire
 * ces fixtures en clair rendrait `pnpm lint` ROUGE, et la seule autre issue serait
 * un `eslint-disable`, c'est-à-dire une exemption prise par le test de la règle
 * qu'il sert. Ce fichier tient déjà exactement cette discipline pour les fixtures
 * de l'anti-skip (`MOT_SKIP`) : on ne se paie pas une dérogation à ce qu'on garde.
 *
 * Le mot n'en arrive pas moins INTACT dans le fichier `.sql` de la fixture, qui est
 * le seul endroit où le contrôle testé le cherche.
 */
const DECALAGE = ['OFF', 'SET'].join('');
/** Le même, en minuscules — SQL est insensible à la casse. */
const DECALAGE_BAS = DECALAGE.toLowerCase();
/** Le même, en casse mixte : « OffSet » s'exécute comme « OFFSET ». */
const DECALAGE_MIXTE = ['Off', 'Set'].join('');

/**
 * La ligne du rapport qui cite `fragment`, ou `undefined`.
 *
 * On n'asserte JAMAIS un gabarit de message (`fichier:ligne`, « ligne N de … », une
 * flèche, une couleur) : ce serait tester la mise en forme du contrôle, pas sa
 * garantie. Ce que la spécification exige est vérifiable sans rien supposer de la
 * forme : le rapport NOMME le fichier, et le numéro de ligne se trouve sur la MÊME
 * ligne de rapport que ce nom.
 */
function ligneDuRapport(sortie: string, fragment: string): string | undefined {
  return sortie.split('\n').find((ligne) => ligne.includes(fragment));
}

describe('check-invariants.mjs — pagination keyset dans les `.sql` versionnés', () => {
  // --- LES REFUS ------------------------------------------------------------

  it('@critique refuse le décalage à VALEUR LITTÉRALE, en nommant le fichier ET la ligne', () => {
    const { code, sortie } = lancerInvariants({
      [MIGRATION_ESSAI]:
        "-- Migration d'essai.\n" +
        'SELECT id, libelle\n' +
        '  FROM missions\n' +
        '  ORDER BY created_at DESC\n' +
        `  LIMIT 50 ${DECALAGE} 100;\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('0099_essai.sql');
    // La faute est en ligne 5, et « 0099_essai » ne contient aucun 5 : le chiffre
    // trouvé sur cette ligne de rapport ne peut venir que du signalement.
    const ligne = ligneDuRapport(sortie, '0099_essai.sql');
    expect(ligne).toBeDefined();
    expect(ligne ?? '').toMatch(/(^|\D)5(\D|$)/);
  });

  it('@critique refuse le décalage à PARAMÈTRE LIÉ — un décalage paramétré reste un décalage', () => {
    // La forme la plus vraisemblable : le décalage vient de l'appelant, donc rien
    // dans le fichier n'a l'air d'un « nombre magique » à surveiller.
    const { code, sortie } = lancerInvariants({
      [MIGRATION_ESSAI]: `SELECT id FROM missions ORDER BY created_at DESC LIMIT $1 ${DECALAGE} $2;\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('0099_essai.sql');
  });

  it('@critique refuse le décalage écrit SUR SA PROPRE LIGNE, loin de son `LIMIT`', () => {
    // Un contrôle bâti sur « LIMIT … OFFSET » dans UNE seule ligne passerait ici au
    // vert : c'est pourtant l'écriture que produit n'importe quel formateur SQL.
    const { code, sortie } = lancerInvariants({
      [MIGRATION_ESSAI]:
        'SELECT id\n' +
        '  FROM missions\n' +
        '  ORDER BY created_at DESC\n' +
        '  LIMIT 50\n' +
        `  ${DECALAGE} 100;\n`,
    });
    expect(code).toBe(1);
    const ligne = ligneDuRapport(sortie, '0099_essai.sql');
    expect(ligne).toBeDefined();
    expect(ligne ?? '').toMatch(/(^|\D)5(\D|$)/);
  });

  it('@critique refuse un décalage SANS `LIMIT` du tout', () => {
    // PostgreSQL accepte le décalage seul. Un contrôle qui exige la présence de
    // `LIMIT` pour crier laisse passer la pagination la plus coûteuse de toutes.
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]: `SELECT id FROM missions ORDER BY created_at DESC ${DECALAGE} 20;\n`,
    });
    expect(code).toBe(1);
  });

  it('@critique refuse le décalage écrit EN MINUSCULES', () => {
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]: `select id from missions order by created_at desc limit 50 ${DECALAGE_BAS} 100;\n`,
    });
    expect(code).toBe(1);
  });

  it('@critique refuse le décalage écrit EN CASSE MIXTE', () => {
    // SQL est insensible à la casse : cette requête s'exécute exactement comme la
    // précédente. Un contrôle sensible à la casse serait contournable par une
    // faute de frappe — donc contournable tout court.
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]: `SELECT id FROM missions ORDER BY id LIMIT 50 ${DECALAGE_MIXTE} 100;\n`,
    });
    expect(code).toBe(1);
  });

  it('@critique refuse le décalage caché dans une VUE — ce qui vit dans le schéma paginera pareil', () => {
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]:
        'CREATE VIEW missions_page AS\n' +
        `  SELECT id, libelle FROM missions ORDER BY created_at DESC LIMIT 50 ${DECALAGE} 100;\n`,
    });
    expect(code).toBe(1);
  });

  it('@critique refuse le décalage dans un `.sql` HORS `apps/api/drizzle/`', () => {
    // La spécification dit « dans un `.sql` VERSIONNÉ », pas « dans une migration ».
    // Le SQL du dépôt ne vit pas qu'en migration : amorçage, import de la banque de
    // questions, initialisation Postgres. Un contrôle restreint au seul dossier des
    // migrations rouvrirait le trou d'un dossier à côté.
    const { code, sortie } = lancerInvariants({
      'apps/api/scripts/amorcage.sql': `SELECT id FROM missions ORDER BY id LIMIT 50 ${DECALAGE} 100;\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('amorcage.sql');
  });

  // --- LES FAUX POSITIFS PLAUSIBLES, CHERCHÉS ACTIVEMENT --------------------

  it('accepte une migration paginée EN KEYSET — le témoin sain du nouveau contrôle', () => {
    const { code, sortie } = lancerInvariants({
      [MIGRATION_ESSAI]:
        '-- Pagination keyset (CLAUDE.md §9) : curseur composite, jamais de décalage.\n' +
        'SELECT id, libelle\n' +
        '  FROM missions\n' +
        '  WHERE (created_at, id) < ($1, $2)\n' +
        '  ORDER BY created_at DESC, id DESC\n' +
        '  LIMIT $3;\n',
    });
    expect(sortie).toContain('aucune infraction mécanisable détectée');
    expect(code).toBe(0);
  });

  it('ne crie pas sur le mot écrit dans un COMMENTAIRE DE LIGNE SQL', () => {
    // C'est le faux positif le plus probable de tous : la façon la plus naturelle
    // d'expliquer la règle dans une migration est d'y écrire le mot interdit.
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]:
        '-- Pagination keyset imposée par le §9 : ni OFFSET, ni curseur dérivé du rang.\n' +
        'SELECT id FROM missions ORDER BY created_at DESC LIMIT $1;\n',
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur le mot écrit dans un COMMENTAIRE DE BLOC SQL, fût-il multiligne', () => {
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]:
        '/*\n' +
        ' * Historique : la première version paginait avec OFFSET.\n' +
        ' * Reprise en keyset le 2026-08-29 (CLAUDE.md §9).\n' +
        ' */\n' +
        'SELECT id FROM missions ORDER BY created_at DESC LIMIT $1;\n',
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur une COLONNE dont le nom contient le mot', () => {
    // `fuseau_offset_minutes` est un nom de colonne parfaitement légitime — et un
    // contrôle en `/offset/i` sans frontière de mot le refuserait.
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]:
        'CREATE TABLE fuseaux (\n' +
        '  id UUID NOT NULL,\n' +
        '  fuseau_offset_minutes INTEGER NOT NULL,\n' +
        '  offset_utc_minutes INTEGER NOT NULL\n' +
        ');\n' +
        'CREATE INDEX idx_fuseaux_offset ON fuseaux (offset_utc_minutes);\n',
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur le mot contenu dans une CHAÎNE LITTÉRALE SQL', () => {
    // Un libellé de référentiel, un message d'erreur semé en base, une clé de
    // traduction : la chaîne n'est pas une clause, elle ne pagine rien.
    const { code } = lancerInvariants({
      [MIGRATION_ESSAI]:
        'INSERT INTO libelles (code, texte) VALUES\n' +
        "  ('PAGINATION_SANS_OFFSET', 'La pagination par OFFSET est interdite (§9).');\n",
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur de la PROSE MARKDOWN — le contrôle vise les `.sql`, pas la documentation', () => {
    // La documentation doit pouvoir NOMMER ce qu'elle interdit, y compris en
    // montrant l'exemple fautif. Un contrôle qui l'en empêche rend la
    // spécification inécrivable — et c'est le pack qui perdrait.
    const { code } = lancerInvariants({
      'docs/11_CONTRAT_TECHNIQUE.md':
        '# Pagination\n' +
        '\n' +
        'Keyset partout, jamais de décalage. La forme interdite est :\n' +
        '\n' +
        '```sql\n' +
        `SELECT * FROM missions ORDER BY created_at LIMIT 50 ${DECALAGE} 100;\n` +
        '```\n',
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur `outline-offset`, présent dans le design system ET dans son test', () => {
    // Reproduction des DEUX écritures réellement versionnées : la propriété CSS et
    // l'assertion de `packages/ui/src/tokens.test.ts` qui la garde. Ni l'une ni
    // l'autre n'a le moindre rapport avec la pagination.
    const { code } = lancerInvariants({
      'packages/ui/src/tokens.css':
        '.bouton:focus-visible {\n' +
        '  outline: var(--taille-focus-epaisseur) solid var(--couleur-focus-anneau);\n' +
        '  outline-offset: var(--taille-focus-decalage);\n' +
        '}\n',
      'packages/ui/src/tokens.test.ts':
        'expect(css).toMatch(/outline-offset:\\s*var\\(--taille-focus-decalage\\)/);\n',
    });
    expect(code).toBe(0);
  });

  it('ne crie pas sur `datetime({ offset: false })`, qui INTERDIT un décalage horaire', () => {
    // Ligne réellement versionnée dans `packages/shared/src/temps.ts`. Le mot y
    // désigne un décalage de FUSEAU, et l'option le refuse : la refuser à son tour
    // reviendrait à interdire l'invariant 5 au nom du §9.
    const { code } = lancerInvariants({
      'packages/shared/src/temps.ts':
        "import { z } from 'zod';\n" +
        'export const isoUtcSchema = z.iso\n' +
        '  .datetime({ offset: false })\n' +
        "  .describe('Horodatage ISO 8601 en UTC (contrat 11 §3)');\n",
    });
    expect(code).toBe(0);
  });
});

// =============================================================================
// NON-RÉGRESSION — LE TÉMOIN SAIN DES CONTRÔLES DÉJÀ EN PLACE
// -----------------------------------------------------------------------------
// L'arbitrage du 2026-08-29 pose une exigence que rien d'autre ne couvre : « son
// témoin sain doit être REVÉRIFIÉ — un garde-fou dont le cas “ne doit pas se
// déclencher” n'est plus valable devient un garde-fou qui MENT ». Il ment d'autant
// mieux qu'il est vert. Les cas ci-dessus isolent chacun UN fichier ; ils ne disent
// donc rien du bruit CROISÉ, celui où un contrôle ajouté fait crier un AUTRE
// contrôle sur une entrée qu'il acceptait la veille.
//
// Deux verrous, parce qu'aucun des deux ne suffit :
//   · le témoin COMPOSITE — toutes les fixtures saines du fichier réunies dans UN
//     seul dépôt jetable, plus la nouvelle. Le LIBELLÉ de succès y est exigé, pas
//     seulement le code de sortie : un script qui signalerait sans faire échouer
//     passerait un `expect(code).toBe(0)` en silence ;
//   · les MIGRATIONS RÉELLES du dépôt — les seuls `.sql` versionnés qui existent,
//     analysés tels quels. C'est le seul cas qui échoue si le nouveau contrôle
//     refuse quelque chose que le lot L1 a déjà livré et fait signer, et il l'attrape
//     AVANT que `pnpm verify` ne s'arrête pour tout le monde.
// =============================================================================

/** Ce qu'un `.env.example` contient légitimement — repris du cas SEC-30.4c ci-dessus. */
const ENV_EXEMPLE_SAIN =
  '# Modèle de configuration.\n' +
  'NODE_ENV=development\n' +
  'POSTGRES_PASSWORD=__CHANGEME__\n' +
  'DATABASE_URL=postgresql://axion:__CHANGEME__@postgres:5432/axion_audit\n' +
  'CONSOLE_BASE_URL=https://console.example.invalid\n';

/** Migration saine : keyset, aucun générateur interdit, tolérance 11 §2 respectée. */
const MIGRATION_SAINE =
  '-- Pagination keyset (CLAUDE.md §9). Décalage : jamais.\n' +
  'CREATE TABLE sync_log (\n' +
  '  id UUID NOT NULL DEFAULT gen_random_uuid(),\n' +
  '  fuseau_offset_minutes INTEGER NOT NULL\n' +
  ');\n' +
  'SELECT id FROM sync_log WHERE id > $1 ORDER BY id LIMIT $2;\n';

describe('check-invariants.mjs — non-régression du témoin sain', () => {
  it('@critique le témoin sain COMPOSITE reste vert, et le reste ENTIÈREMENT', () => {
    const { code, sortie } = lancerInvariants({
      'apps/field/src/App.tsx': ECRAN_SAIN,
      'packages/ui/src/carte.css': CSS_SAIN,
      'packages/ui/src/tokens.css':
        '.bouton:focus-visible {\n  outline-offset: var(--taille-focus-decalage);\n}\n',
      'packages/shared/src/temps.ts':
        "import { z } from 'zod';\nexport const s = z.iso.datetime({ offset: false });\n",
      'apps/api/src/note.ts': '// Voir https://www.rfc-editor.org/rfc/rfc9562 pour les UUID v7.\n',
      'apps/api/drizzle/0001_socle.sql': MIGRATION_SAINE,
      '.env.example': ENV_EXEMPLE_SAIN,
    });
    expect(sortie).toContain('aucune infraction mécanisable détectée');
    expect(code).toBe(0);
  });

  it('@critique les migrations RÉELLEMENT versionnées du dépôt restent acceptées', () => {
    // Le lot L1 a livré et fait signer ces douze fichiers. Si le nouveau contrôle en
    // refuse un seul, ce n'est pas une découverte : c'est une régression.
    const dossier = join(RACINE_DEPOT, 'apps', 'api', 'drizzle');
    const migrations = readdirSync(dossier).filter((nom) => nom.endsWith('.sql'));
    expect(migrations.length).toBeGreaterThan(0);

    const fichiers: Record<string, string> = {};
    for (const nom of migrations) {
      fichiers[`apps/api/drizzle/${nom}`] = readFileSync(join(dossier, nom), 'utf8');
    }
    const { code, sortie } = lancerInvariants(fichiers);
    expect(sortie).toContain('aucune infraction mécanisable détectée');
    expect(code).toBe(0);
  });
});
