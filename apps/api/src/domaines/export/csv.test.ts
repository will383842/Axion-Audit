// =============================================================================
// TESTS DE L'ÉCRITURE CSV DE L'EXPORT — écrits AVANT `csv.ts`. Lot L7, L7c.
//
// ⚠ Tests d'A30 (CONCEPTION, TDD). Aucun ne porte `@critique` : les tests
// d'acceptation du §36.3 et des quatre états reviennent à A36 (09 §5.6, décision
// du 2026-09-05 — deux couches).
//
// Ce que ces tests transcrivent, et rien d'autre — 03 §36.3 : « UTF-8 avec BOM
// (Excel FR), séparateur `;` ». Les deux mots comptent :
//   · le BOM, parce qu'Excel FR sans BOM lit « Ã© » là où le fichier dit « é » ;
//   · le point-virgule, parce que la virgule est le séparateur DÉCIMAL français,
//     et qu'un CSV à virgules coupe « 3,5 » en deux cellules.
// Le reste (guillemets, retours à la ligne, injection de formule) n'est pas dans
// le §36.3 : c'est la conséquence mécanique d'écrire du texte d'audit — des notes
// de consultant, des verbatims — dans un tableur.
//
// Traçabilité : E36 (exécutable par lots avec critères) · E14 (consolidation).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { BOM_UTF8, SEPARATEUR_CSV } from '@axion/shared';
import { celluleCsv, ecrireCsv } from './csv.js';

describe('ecrireCsv — la forme imposée par le §36.3', () => {
  it('commence par le BOM UTF-8 (Excel FR)', () => {
    const texte = ecrireCsv([['a', 'b']]);
    expect(texte.startsWith(BOM_UTF8)).toBe(true);
  });

  it('sépare par un point-virgule, jamais par une virgule', () => {
    expect(ecrireCsv([['a', 'b']])).toBe(`${BOM_UTF8}a${SEPARATEUR_CSV}b\r\n`);
    expect(SEPARATEUR_CSV).toBe(';');
  });

  it('termine chaque ligne par CRLF — la fin de ligne que le format CSV nomme', () => {
    expect(ecrireCsv([['a'], ['b']])).toBe(`${BOM_UTF8}a\r\nb\r\n`);
  });

  it('rend une table vide sans en-tête comme un fichier vide, mais présent', () => {
    // Un fichier ABSENT et un fichier VIDE ne disent pas la même chose : le
    // premier fait douter de l'export, le second dit « rien à exporter ».
    expect(ecrireCsv([])).toBe(BOM_UTF8);
  });
});

describe('celluleCsv — le texte d’audit entre dans un tableur sans le casser', () => {
  it('laisse un texte simple intact', () => {
    expect(celluleCsv('Direction générale')).toBe('Direction générale');
  });

  it('rend une cellule vide pour null et undefined — jamais la chaîne « null »', () => {
    expect(celluleCsv(null)).toBe('');
    expect(celluleCsv(undefined)).toBe('');
  });

  it('entoure de guillemets dès qu’un séparateur apparaît', () => {
    expect(celluleCsv('RH ; Paie')).toBe('"RH ; Paie"');
  });

  it('double les guillemets internes — la règle du RFC 4180', () => {
    expect(celluleCsv('il a dit « c\'est "urgent" »')).toBe('"il a dit « c\'est ""urgent"" »"');
  });

  it('protège un retour à la ligne : une note de consultant en contient', () => {
    expect(celluleCsv('ligne 1\nligne 2')).toBe('"ligne 1\r\nligne 2"');
    expect(celluleCsv('ligne 1\r\nligne 2')).toBe('"ligne 1\r\nligne 2"');
  });

  it('rend un booléen en français — l’interface est française, le fichier aussi', () => {
    expect(celluleCsv(true)).toBe('oui');
    expect(celluleCsv(false)).toBe('non');
  });

  it('rend un nombre sans séparateur de milliers, point décimal', () => {
    // Le point : c'est ce que le §36.3 impose indirectement en imposant le
    // point-virgule comme séparateur de colonnes — les deux se complètent.
    expect(celluleCsv(3.5)).toBe('3.5');
    expect(celluleCsv(1500)).toBe('1500');
  });
});

describe('celluleCsv — l’injection de formule, qui n’est pas une hypothèse d’école', () => {
  // Une réponse d'audit est du texte SAISI PAR UN TIERS sur le terrain, et le
  // fichier est ouvert dans Excel par un consultant. `=cmd|…` est le vecteur
  // classique ; un préfixe d'apostrophe suffit à le neutraliser sans altérer la
  // donnée LUE (Excel n'affiche pas l'apostrophe de tête).
  it.each(['=1+1', '+33 1 23 45 67 89', '-2', '@SUM(A1)', '\t=1+1', '\r=1+1'])(
    'neutralise « %s », qu’Excel interpréterait',
    (entree) => {
      const rendu = celluleCsv(entree);
      expect(rendu.startsWith("'") || rendu.startsWith('"\'')).toBe(true);
    },
  );

  it('ne neutralise pas un texte qui commence par une lettre ou un chiffre', () => {
    expect(celluleCsv('2 personnes')).toBe('2 personnes');
    expect(celluleCsv('Oui, en partie')).toBe('Oui, en partie');
  });
});

describe('ecrireCsv — une table complète', () => {
  it('assemble en-tête et lignes dans l’ordre reçu', () => {
    const texte = ecrireCsv([
      ['unite', 'effectif'],
      ['Atelier ; Nord', 12],
      ['Siège', null],
    ]);
    expect(texte).toBe(`${BOM_UTF8}unite;effectif\r\n"Atelier ; Nord";12\r\nSiège;\r\n`);
  });
});
