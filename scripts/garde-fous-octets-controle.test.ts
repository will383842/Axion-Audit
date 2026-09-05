// =============================================================================
// TESTS DU GARDE DES OCTETS DE CONTRÔLE
//   · scripts/check-octets-controle.mjs
//
// POURQUOI CE FICHIER EXISTE. Ce dépôt a une bascule ZAP qui n'a rien armé
// pendant huit jours, un `check-jonction` déclaré et branché nulle part, et un
// `check-invariants` qui laissait passer dix mutations : dans les trois cas,
// personne n'avait FABRIQUÉ LA FAUTE pour voir si elle était vue. Un garde
// qu'on n'a jamais vu refuser n'est pas un garde, c'est une ligne de
// configuration qui rassure.
//
// LES DEUX SENS, sans quoi ce fichier ne vaudrait rien :
//   · le témoin SAIN reste VERT — un garde qui refuse tout serait « vert » sur
//     toutes les contre-épreuves et finirait désactivé au premier agacement ;
//   · chaque cas fautif rend EXIT=1 **et NOMME** le fichier, la ligne, la
//     colonne et l'octet. Un refus muet ne se corrige pas, il se contourne.
//
// AUCUN OCTET DE CONTRÔLE N'EST ÉCRIT EN CLAIR ICI, et ce n'est pas une
// coquetterie : le garde balaie TOUS les fichiers versionnés, celui-ci compris.
// Écrire la faute en littéral rendrait la CI rouge — un test qui casse le dépôt
// qu'il protège. Chaque octet fautif vient donc de `String.fromCharCode`, qui
// est aussi, exactement, la parade que le garde recommande. Le test applique
// ainsi la règle qu'il vérifie.
//
// 09 §5.6 — RÉSERVE EXPLICITE : ce fichier a été écrit par A52, qui a aussi
// écrit le garde. La règle veut un agent distinct. Une entrée `DECISIONS.md`
// du 2026-09-05 le trace et demande la contre-lecture par un réviseur croisé.
//
// Traçabilité E36/E43 — contrat 11 §2 et §7.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const GARDE = 'check-octets-controle.mjs';

// Les octets, jamais en littéral (voir l'en-tête).
const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(127);

// La barre oblique inverse vient elle aussi d un appel de fonction : les outils
// d edition de cette chaine d agents COLLAPSENT une barre doublee en barre simple
// a l ecriture (mesure en ecrivant ce fichier), ce qui casse silencieusement toute
// classe de caracteres. Le meme defaut d outillage que celui que ce garde poursuit,
// par une autre porte.
const BARRE = String.fromCharCode(92);

const CODES_ANSI = new RegExp(`${ESC}${BARRE}[${BARRE}d+m`, 'g');

interface Verdict {
  readonly code: number;
  readonly sortie: string;
}

const bacs: string[] = [];

/** Un dépôt git jetable portant le garde LIVRÉ, copié tel quel. */
function creerBac(fichiers: Readonly<Record<string, string>>, avecGit = true): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-octets-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  copyFileSync(join(RACINE_DEPOT, 'scripts', GARDE), join(bac, 'scripts', GARDE));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const cible = join(bac, relatif);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, 'utf8');
  }
  if (avecGit) {
    const git = (...args: readonly string[]): void => {
      const r = spawnSync('git', [...args], { cwd: bac, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
    };
    git('-c', 'init.defaultBranch=main', 'init', '-q');
    git('add', '-A');
  }
  return bac;
}

function lancer(fichiers: Readonly<Record<string, string>>, avecGit = true): Verdict {
  const bac = creerBac(fichiers, avecGit);
  const r = spawnSync(process.execPath, [join(bac, 'scripts', GARDE)], {
    cwd: bac,
    encoding: 'utf8',
  });
  return { code: r.status ?? -1, sortie: `${r.stdout}${r.stderr}`.replaceAll(CODES_ANSI, '') };
}

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// LE TÉMOIN SAIN — il vient en premier. Chaque cas fautif est ce témoin PLUS une
// faute, et une seule.
// -----------------------------------------------------------------------------
const TEMOIN: Readonly<Record<string, string>> = {
  '.gitattributes': '* text=auto eol=lf\n*.png binary\n',
  'src/service.ts': 'export const cle = (a: string, b: string): string => `${a}/${b}`;\n',
  'docs/note.md': '# Une note\n\nDu texte ordinaire.\n',
};

describe('check-octets-controle.mjs — le témoin sain reste vert', () => {
  it('accepte un dépôt de texte ordinaire, et PROUVE qu’il a balayé', () => {
    // LE PIÈGE QUE CE CAS FERME : un garde peut sortir vert parce qu'il n'a RIEN
    // vu. On n'assère donc pas seulement EXIT=0, mais le NOMBRE de fichiers
    // analysés. Si le périmètre se refermait un jour sur zéro fichier, ce cas
    // rougirait au lieu de décorer la CI d'une coche.
    const { code, sortie } = lancer(TEMOIN);
    expect(sortie).toContain('4 fichier(s) texte analysé(s)');
    expect(code).toBe(0);
  });

  it('accepte TAB et CR — ce sont deux des trois octets de contrôle légitimes', () => {
    const { code } = lancer({
      ...TEMOIN,
      'src/tabule.ts': `const t = {${TAB}a: 1,${TAB}b: 2 };${CR}\nexport default t;\n`,
    });
    expect(code).toBe(0);
  });
});

describe('check-octets-controle.mjs — il MORD sur un octet de contrôle', () => {
  it('refuse le NUL, et le nomme avec fichier, ligne, colonne et valeur', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'src/couverture.ts': `const cle = [a, b].join('${NUL}');\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('0x00 (NUL)');
    expect(sortie).toContain('src/couverture.ts:1:26');
    expect(sortie).toContain('1 octet(s) dans 1 fichier(s)');
  });

  it('voit le NUL AU-DELÀ des 8 000 octets, là où git cesse de regarder', () => {
    // LE CAS RÉEL DU 2026-09-04 : la détection binaire de git s'arrête à 8 000
    // octets ; le premier NUL de `couverture.ts` était à 8 114. Git diffait donc
    // encore le fichier — c'est ce qui a rendu le défaut invisible aussi
    // longtemps — pendant que ripgrep et grep, eux, l'avaient déjà abandonné.
    // Un garde qui n'inspecterait que le début du fichier serait vert ici.
    const bourrage = `// ${'x'.repeat(76)}\n`;
    let contenu = '';
    while (contenu.length < 8100) contenu += bourrage;
    contenu += `const cle = [a, b].join('${NUL}');\n`;

    const { code, sortie } = lancer({ ...TEMOIN, 'src/couverture.ts': contenu });
    expect(code).toBe(1);
    expect(sortie).toContain('0x00 (NUL)');
    expect(sortie).toContain('src/couverture.ts:103:');
  });

  it('refuse les DEUX NUL et les compte, sans s’arrêter au premier', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'src/a.ts': `const x = '${NUL}';\n`,
      'src/b.ts': `const y = '${NUL}';\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('2 octet(s) dans 2 fichier(s)');
    expect(sortie).toContain('src/a.ts:1:');
    expect(sortie).toContain('src/b.ts:1:');
  });

  it("refuse l'ESC — la famille ne se limite pas au NUL", () => {
    // Les 41 ESC des dix scripts du dépôt sont arrivés par le MÊME geste que les
    // trois NUL : une séquence d'échappement écrite à la main, convertie en octet
    // par l'outillage. Un garde qui ne viserait que le NUL laisserait la cause
    // intacte et n'attraperait qu'un de ses effets.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'src/couleurs.ts': `const rouge = '${ESC}[31m';\n`,
    });
    expect(code).toBe(1);
    expect(sortie).toContain('0x1b (ESC');
  });

  it('refuse DEL (0x7F), qui n’est pas inférieur à 0x20', () => {
    // Une borne écrite « octet < 0x20 » laisserait passer DEL. Ce cas fixe la
    // borne haute autant que la basse.
    const { code, sortie } = lancer({ ...TEMOIN, 'src/del.ts': `const d = '${DEL}';\n` });
    expect(code).toBe(1);
    expect(sortie).toContain('0x7f (DEL)');
  });
});

describe('check-octets-controle.mjs — son périmètre et son message', () => {
  it('ÉCARTE les binaires que `.gitattributes` déclare, sans les lire', () => {
    // Un .png est fait d'octets de contrôle par construction. Le garde interroge
    // `git check-attr` plutôt que de recopier la liste des extensions : le jour
    // où `.gitattributes` accueille un nouveau type binaire, il suit tout seul.
    const png = `\u0089PNG${NUL}${NUL}${NUL}`;
    const { code, sortie } = lancer({ ...TEMOIN, 'assets/logo.png': png });
    expect(code).toBe(0);
    expect(sortie).toContain('1 binaire(s) déclaré(s) écarté(s)');
    expect(sortie).not.toContain('logo.png');
  });

  it('NE SORT PAS VERT quand il n’a rien analysé', () => {
    // Sans dépôt git, `git ls-files` ne rend aucun chemin. Le garde afficherait
    // « aucun octet de contrôle » sans avoir ouvert un fichier : c'est la panne
    // qui a déjà coûté au dépôt (anti-skip, 2026-08-28). Elle est fermée ici.
    const { code, sortie } = lancer(TEMOIN, false);
    expect(code).toBe(1);
    expect(sortie).toContain('rien à analyser');
  });

  it('DIT LA PARADE, et dit surtout de ne PAS écrire la séquence d’échappement', () => {
    // LE POINT LE PLUS IMPORTANT DE CE FICHIER. Un message qui dirait seulement
    // « octet interdit » enverrait le prochain agent écrire l'échappement — le
    // correctif évident, celui qu'A32 a tenté le 2026-09-04, et qui a REPRODUIT
    // le défaut dans le geste même qui le corrigeait, parce que l'outillage
    // d'édition convertit l'échappement en octet réel. Le message doit donc
    // porter la contre-indication, pas seulement le refus.
    const { sortie } = lancer({ ...TEMOIN, 'src/x.ts': `const x = '${NUL}';\n` });
    expect(sortie).toContain('String.fromCharCode');
    expect(sortie).toContain("N'ÉCRIS JAMAIS LA SÉQUENCE D'ÉCHAPPEMENT");
    expect(sortie).toContain('CONVERTIT EN OCTET RÉEL');
    expect(sortie).toContain('cat -v');
  });

  it("dit POURQUOI l'octet est refusé, en termes de conséquence mesurée", () => {
    const { sortie } = lancer({ ...TEMOIN, 'src/x.ts': `const x = '${NUL}';\n` });
    expect(sortie).toContain('ripgrep OMET le fichier en silence');
    expect(sortie).toContain('étapes 3, 4 et 6');
  });
});
