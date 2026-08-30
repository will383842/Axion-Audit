// =============================================================================
// TESTS DU GARDE-FOU DE LA MATRICE E1-E47
//   · scripts/check-tracabilite-exigences.mjs
//
// POURQUOI CE FICHIER EXISTE. Ce garde est né d'un défaut RÉEL : le 2026-08-29,
// vingt-cinq fichiers du socle d'authentification portaient une citation qui
// pointait vers une carte de chaleur. Il a été écrit en réponse, câblé, et jamais
// éprouvé. Or il est lui-même de la famille qu'il traque : il ANNONCE deux
// contrôles et une échappatoire plafonnée, et personne n'avait vérifié qu'aucun
// des trois ne mentait. Un garde de la traçabilité qui se trompe rend la matrice
// — l'instrument qui valide la porte — moins fiable qu'aucune matrice du tout,
// parce qu'il lui donne l'apparence d'avoir été vérifiée.
//
// 09 §5.6 — écrit par un agent qui n'a pas écrit le garde et ne le modifie pas.
//
// COMMENT IL EST ÉPROUVÉ. Chaque cas fabrique un DÉPÔT GIT JETABLE portant le
// garde LIVRÉ (copié dans `<bac>/scripts/`, d'où il résout sa racine) et les DEUX
// tables de libellés RÉELLES du dépôt. Les libellés ne sont donc jamais réécrits
// pour l'occasion : un test qui fabriquerait ses propres libellés mesurerait ses
// fixtures, pas le dépôt.
//
// LES DEUX SENS : un témoin conforme reste VERT (un garde qui refuse tout serait
// désactivé à la première citation légitime) et chaque faute fabriquée rend
// EXIT=1 en NOMMANT la faute — le site, la glose écrite, ET le libellé officiel
// qu'elle contredit. Un refus qui ne montre pas le libellé oblige à ouvrir la
// table à la main, ce qui ne se fait pas.
//
// POURQUOI LES CITATIONS FAUTIVES SONT ASSEMBLÉES À L'EXÉCUTION. Le garde balaie
// ce fichier-ci comme les autres. Une citation d'exigence inexistante écrite en
// clair ferait rougir la CI. Le dépôt offre bien une échappatoire — un marqueur de
// ligne — mais elle est PLAFONNÉE À DOUZE et quatre sont déjà prises par la
// documentation du garde : la dépenser pour des fixtures reviendrait à occuper la
// place d'un vrai contre-exemple. Les citations, comme le marqueur lui-même, sont
// donc concaténées à l'exécution. Les formes de FRONTIÈRE (`E48bis`, `E2E`…)
// restent écrites en clair, elles : le fait qu'elles ne déclenchent rien EST ce
// qu'elles prouvent.
//
// Traçabilité : E36 (exécutable par lots avec critères), E43 (exécutabilité
// autopilote), E47 (profondeur fonctionnelle et conventions) ·
// CLAUDE.md §4 étape 6 (« code → exigences ») · 09 §5.6.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const GARDE = 'check-tracabilite-exigences.mjs';
const TABLE_EXECUTION = 'docs/TRACABILITE_E1-E47.md';
const TABLE_CONCEPTION = 'docs/08_TRACABILITE.md';

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
 * `E<n>` assemblé à l'exécution — pour les FIXTURES comme pour les ASSERTIONS.
 * Le numéro n'apparaît jamais collé à son `E` dans CE fichier, donc jamais comme
 * citation aux yeux du garde qui le balaie.
 */
const exigence = (numero: number): string => `E${String(numero)}`;

/** Le numéro qui n'existera jamais : la table s'arrête à 47. */
const INEXISTANTE = 48;

/**
 * Le marqueur d'exemption du dépôt, lui aussi assemblé. Écrit en clair ici, il
 * ferait EXEMPTER les lignes de fixtures qui n'en ont aucun besoin (elles ne
 * portent aucune citation littérale) — et ces exemptions inutiles mangeraient un
 * plafond de douze partagé avec les vrais contre-exemples du dépôt.
 */
const MARQUEUR = ['citation', 'exemple'].join('-');

/** Une ligne de traçabilité complète, glose comprise. */
function citer(numero: number, glose?: string): string {
  const suffixe = glose === undefined ? '' : ` (${glose})`;
  return `// Tracabilite : ${exigence(numero)}${suffixe}.\n`;
}

/**
 * Les tables sont RÉELLES par défaut. Un cas peut en remplacer une pour éprouver
 * la vacuité : une chaîne vide signifie « table absente ».
 */
type Tables = Readonly<Record<string, string>>;

function creerBac(fichiers: Readonly<Record<string, string>>, options?: Tables): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-tracabilite-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  copyFileSync(join(RACINE_DEPOT, 'scripts', GARDE), join(bac, 'scripts', GARDE));

  mkdirSync(join(bac, 'docs'), { recursive: true });
  const remplacees = options ?? {};
  for (const table of [TABLE_EXECUTION, TABLE_CONCEPTION]) {
    const remplacement = remplacees[table];
    if (remplacement === undefined) {
      copyFileSync(join(RACINE_DEPOT, table), join(bac, table));
    } else if (remplacement !== '') {
      writeFileSync(join(bac, table), remplacement, 'utf8');
    }
    // `''` signifie « table absente » : on n'écrit rien du tout.
  }

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

function executer(bac: string, options: readonly string[] = []): Verdict {
  const r = spawnSync(process.execPath, [join(bac, 'scripts', GARDE), ...options], {
    cwd: bac,
    encoding: 'utf8',
  });
  return {
    code: r.status ?? -1,
    sortie: `${r.stdout}${r.stderr}`.replaceAll(CODES_ANSI, ''),
  };
}

const lancer = (
  fichiers: Readonly<Record<string, string>>,
  options?: readonly string[],
  tables?: Tables,
): Verdict => executer(creerBac(fichiers, tables), options);

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// LE TÉMOIN CONFORME — il vient en premier.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — le témoin conforme reste vert', () => {
  it('accepte une citation dont la glose reprend les mots du libellé officiel', () => {
    const { code, sortie } = lancer({
      'apps/api/src/rbac/etancheite.ts': citer(21, "auditeurs jamais d'accès aux montants"),
    });
    expect(sortie).toContain('aucune incohérence');
    expect(code).toBe(0);
  });

  it('accepte une glose écrite SANS ACCENTS — une glose ASCII reste recevable', () => {
    // LE PIÈGE : un rapprochement sur chaînes exactes refuserait « securite » face
    // à « Sécurité ». Un garde qui exige la bonne touche du clavier finit contourné
    // par des citations sans glose, c'est-à-dire par le trou qu'il devait fermer.
    const { code } = lancer({ 'apps/api/src/app.ts': citer(33, 'securite') });
    expect(code).toBe(0);
  });

  it('accepte une racine de mot plus courte que le libellé (« sauvegardes » ↔ « sauvegarde »)', () => {
    const { code } = lancer({ 'infra/scripts/copie.sh': citer(35, 'sauvegardes 3-2-1 nocturnes') });
    expect(code).toBe(0);
  });

  it('prouve qu’il a réellement lu la table — 47 exigences, pas zéro', () => {
    // LE PIÈGE QUE CE CAS FERME : un garde peut sortir vert parce que sa table est
    // devenue illisible et qu'il n'a donc rien à comparer. On assère le NOMBRE
    // d'exigences lues, pas seulement le code de sortie.
    const { code, sortie } = lancer({ 'apps/api/src/app.ts': citer(33, 'securite') }, [
      '--verbeux',
    ]);
    expect(sortie).toContain(`47 exigences dans ${TABLE_EXECUTION}`);
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// C1 — LE NUMÉRO EXISTE-T-IL ? Contrôle minimal, et le garde le dit lui-même.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — C1, l’exigence inventée', () => {
  it('refuse un numéro hors table et nomme le site, le numéro et la ligne', () => {
    const { code, sortie } = lancer({
      'apps/api/src/domaines/auth/routes.ts': `export const x = 1;\n${citer(INEXISTANTE, 'inventee')}`,
    });
    expect(sortie).toContain('C1');
    expect(sortie).toContain("QUI N'EXISTE PAS");
    expect(sortie).toContain('apps/api/src/domaines/auth/routes.ts:2');
    expect(sortie).toContain(exigence(INEXISTANTE));
    expect(code).toBe(1);
  });

  it('refuse le numéro zéro — la table commence à 1, pas à 0', () => {
    const { code, sortie } = lancer({ 'apps/api/src/app.ts': citer(0, 'origine') });
    expect(sortie).toContain('C1');
    expect(code).toBe(1);
  });

  it('ne prend PAS pour des citations les formes de frontière', () => {
    // LE PIÈGE, et il est double. Trop lâche, le motif accuserait `E2E` — un mot
    // que ce dépôt écrit partout — et le garde serait désactivé dans la semaine.
    // La fixture n'emploie donc QUE des numéros INEXISTANTS : si une seule de ces
    // formes était lue comme une citation, C1 rougirait. Le vert prouve les cinq
    // frontières d'un coup, sans rien affirmer sur le motif lui-même.
    const { code } = lancer({
      'apps/api/src/frontieres.ts':
        '// AE48F 1E48 E2E E48_TRUC E48bis — aucune de ces formes n’est une citation.\n' +
        'export const marqueur = 1;\n',
    });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// C2 — LA GLOSE DIT-ELLE CE QUE DIT LE LIBELLÉ ? C'est lui qui attrape E5/E27/E4.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — C2, la glose qui pointe ailleurs', () => {
  it('refuse une glose sans aucun mot commun, et IMPRIME le libellé officiel', () => {
    // Un refus qui ne montrerait que la glose obligerait à ouvrir la table à la
    // main — ce que personne ne fait devant un rouge de CI. Le libellé doit être
    // DANS le message : c'est lui qui dit si c'est la glose ou le NUMÉRO qui est
    // faux, et c'était toute la question le 2026-08-29.
    const { code, sortie } = lancer({
      'apps/api/src/scoring/bareme.ts': citer(5, 'coquelicot brumeux du dimanche'),
    });
    expect(sortie).toContain('C2');
    expect(sortie).toContain('coquelicot brumeux du dimanche');
    expect(sortie).toContain('Scoring par unité, heatmap');
    expect(sortie).toContain('soit la glose est fausse, soit le NUMÉRO');
    expect(code).toBe(1);
  });

  it('rattache la glose au DERNIER numéro cité, jamais aux deux', () => {
    // « Une glose ne se partage pas. » Ici elle décrit le SECOND numéro : elle lui
    // convient, le premier reste simplement non glosé. Vert.
    const { code } = lancer({
      'apps/api/src/rbac/etancheite.ts': citer(21, "auditeurs jamais d'accès aux montants").replace(
        'E21',
        'E10/E21',
      ),
    });
    expect(code).toBe(0);
  });

  it('refuse la même glose quand l’ordre des deux numéros est inversé', () => {
    // LE PIÈGE QUE CE COUPLE DE CAS FERME : si la glose était rapprochée de
    // N'IMPORTE LEQUEL des numéros de la ligne, les deux cas seraient verts et le
    // garde ne vérifierait plus rien dès qu'un auteur cite deux exigences. Ici la
    // glose retombe sur le premier numéro, à qui elle ne convient pas. Rouge.
    const { code, sortie } = lancer({
      'apps/api/src/rbac/etancheite.ts': citer(21, "auditeurs jamais d'accès aux montants").replace(
        'E21',
        'E21/E10',
      ),
    });
    expect(sortie).toContain('C2');
    expect(code).toBe(1);
  });

  it('ignore une parenthèse qui n’est PAS une glose — un renvoi de section', () => {
    // Un renvoi `(§32.1)` ne prétend rien sur le sens : l'accuser serait accuser
    // une pratique correcte du dépôt.
    const { code } = lancer({ 'apps/api/src/scoring/bareme.ts': citer(5, '§32.1') });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// L'ÉCHAPPATOIRE — un garde doit pouvoir NOMMER le défaut qu'il ferme.
// Trois propriétés en font autre chose qu'un trou : elle est explicite, COMPTÉE,
// et PLAFONNÉE. Les trois sont éprouvées ici, la troisième surtout.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — l’échappatoire est bornée', () => {
  it('tolère une citation impossible sur une ligne marquée, et la COMPTE', () => {
    const { code, sortie } = lancer({
      'apps/api/src/note.ts': `${citer(INEXISTANTE, 'inventee').trimEnd()} // ${MARQUEUR}\n`,
    });
    expect(sortie).toContain('ligne(s) exemptée(s)');
    expect(code).toBe(0);
  });

  it('REFUSE quand les exemptions dépassent le plafond', () => {
    // LE PIÈGE : une échappatoire qu'on ne peut pas saturer n'est plus une
    // échappatoire, c'est une décharge. Le garde promet un plafond ; ce cas est la
    // seule preuve que le plafond mord. Le refus est un REFUS, pas un avertissement
    // — un garde qui avertit est un garde qu'on ignore.
    const ligne = `${citer(INEXISTANTE, 'inventee').trimEnd()} // ${MARQUEUR}\n`;
    const { code, sortie } = lancer({ 'apps/api/src/note.ts': ligne.repeat(16) });
    expect(sortie).toContain("PLAFOND D'EXEMPTIONS DÉPASSÉ");
    expect(code).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// LA PORTÉE DÉCLARÉE — figée ici pour qu'elle ne s'élargisse ni ne se rétrécisse
// en silence. Ces cas ne sont PAS des garanties : ce sont les limites que le
// garde annonce dans `--angles-morts`, rendues mesurables.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — ce qu’il ne voit pas, mesuré', () => {
  it('ANGLE MORT 3 — une glose qui partage UN mot passe, même si elle est fausse', () => {
    // C'EST LE TROU QUE LE GARDE DÉCLARE, ET IL EST RÉEL. Le rapprochement est
    // LEXICAL, pas sémantique. « sauvegardes » suffit à valider une citation d'E35
    // sur un fichier qui ne sauvegarde rien — la règle citée n'est PAS vérifiée
    // appliquée, seulement vérifiée VRAISEMBLABLE.
    // Ce cas ne célèbre pas ce comportement : il l'ÉPINGLE. Le jour où quelqu'un
    // resserre le rapprochement, ce test rougit et force à relire l'arbitrage
    // plutôt qu'à découvrir le changement en porte. La seule barrière qui ferme
    // vraiment ce trou est la revue croisée (étape 4), et elle n'est pas mécanisable.
    const { code } = lancer({
      'apps/api/src/domaines/missions/service.ts':
        citer(35, 'sauvegardes') + 'export const cloturer = () => undefined;\n',
    });
    expect(code).toBe(0);
  });

  it('ANGLE MORT 2 — une citation SANS glose n’est vérifiée que par C1', () => {
    // Le numéro existe, donc vert : l'auteur n'a rien affirmé, donc rien n'est
    // falsifiable. C'est pourquoi l'en-tête RECOMMANDE de gloser l'exigence
    // principale — une recommandation, pas un contrôle, et il faut le savoir.
    const { code } = lancer({ 'apps/api/src/scoring/bareme.ts': citer(5) });
    expect(code).toBe(0);
  });

  it('ANGLE MORT 4 — `docs/` est hors périmètre, y compris pour du code', () => {
    const { code } = lancer({ 'docs/conception/exemple.ts': citer(INEXISTANTE, 'inventee') });
    expect(code).toBe(0);
  });

  it('voit en revanche un fichier NEUF, non encore indexé', () => {
    // LE PIÈGE SYMÉTRIQUE : un garde qui ne lirait que `git ls-files` arriverait
    // toujours un commit trop tard, et le fichier qui porte une citation NEUVE est
    // justement celui qui n'est pas encore indexé.
    const bac = creerBac({});
    const fautif = join(bac, 'apps/api/src/neuf.ts');
    mkdirSync(dirname(fautif), { recursive: true });
    writeFileSync(fautif, citer(INEXISTANTE, 'inventee'), 'utf8');
    const { code, sortie } = executer(bac);
    expect(sortie).toContain('apps/api/src/neuf.ts');
    expect(code).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// VACUITÉ — un contrôle qui n'a rien vérifié ne doit JAMAIS sortir vert.
// C'est la propriété la plus importante de ce fichier : sans elle, toutes les
// autres se dissolvent le jour où la table change de forme.
// -----------------------------------------------------------------------------
describe('check-tracabilite-exigences.mjs — il ne peut pas être vert par accident', () => {
  it('sort en 2 quand la table d’exécution n’a plus le format attendu', () => {
    const tableTronquee =
      '# MATRICE\n\n| ex | libellé | état |\n| --- | --- | --- |\n' +
      '| E1 | Méthodologie 8+1 blocs | couverte |\n' +
      '| E2 | Toutes tailles, 4 paliers | couverte |\n';
    const { code, sortie } = lancer({ 'apps/api/src/app.ts': citer(33, 'securite') }, [], {
      [TABLE_EXECUTION]: tableTronquee,
    });
    expect(sortie).toContain('ne peut plus rien garantir');
    expect(code).toBe(2);
  });

  it('sort en 2 quand la table est carrément absente', () => {
    const { code, sortie } = lancer({ 'apps/api/src/app.ts': citer(33, 'securite') }, [], {
      [TABLE_EXECUTION]: '',
    });
    expect(sortie).toContain('Table introuvable');
    expect(code).toBe(2);
  });

  it('imprime ses angles morts sur demande, et sort en 0', () => {
    const { code, sortie } = lancer({}, ['--angles-morts']);
    expect(sortie).toContain('CE QUE CE CONTRÔLE NE VOIT PAS');
    expect(sortie).toContain('LA LIMITE FONDAMENTALE');
    expect(code).toBe(0);
  });

  it('rappelle sa portée DANS le message de refus', () => {
    const { sortie } = lancer({ 'apps/api/src/app.ts': citer(INEXISTANTE, 'inventee') });
    expect(sortie).toContain('CE QUE CE CONTRÔLE NE VOIT PAS');
  });
});
