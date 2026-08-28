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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
