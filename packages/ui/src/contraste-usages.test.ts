// =============================================================================
// TESTS — CONTRASTE AA SUR LES COMBINAISONS RÉELLEMENT PEINTES (A28)
//
// ── CE QUE `tokens.test.ts` MESURE DÉJÀ, ET CE QU'IL NE PEUT PAS MESURER ─────
// `tokens.test.ts` éprouve une liste de paires « premier plan sur arrière-plan »
// ÉCRITE À LA MAIN. C'est la bonne mesure, et elle a un angle mort structurel :
// la liste ne connaît que les paires qu'on a pensé à y inscrire. Une paire
// nouvelle, introduite par une règle CSS écrite six semaines plus tard, n'y entre
// pas — et le contrôle reste vert sans avoir rien regardé. §33.6 demande un
// « contraste AA vérifié PAR TOKEN (test automatisé sur la palette, pas au cas par
// cas) » : la palette est vérifiée, l'USAGE ne l'était pas.
//
// Ce fichier prend le problème par l'autre bout : il lit `composants.css`, relève
// TOUTE règle qui déclare ensemble une couleur de texte et un fond, et mesure. Le
// périmètre n'est plus une liste tenue par quelqu'un, c'est la feuille elle-même.
//
// ── CE QU'IL NE VOIT PAS, DIT AVANT QU'ON LE LUI DEMANDE ─────────────────────
//   · un texte dont le fond est HÉRITÉ d'un ancêtre (règle sans `background`) :
//     la cascade n'est pas rejouée ici, il faudrait un navigateur — c'est le rôle
//     d'axe-core sur les écrans montés (`e2e/accessibilite-*.e2e.ts`) ;
//   · les feuilles des APPLICATIONS (`coquille.css`, `journee.css`,
//     `entretien.css`) : elles ne sont pas dans ce paquet, et un test de
//     `packages/ui` qui irait les lire inverserait la dépendance ;
//   · le texte posé sur une image ou un dégradé — il n'y en a aucun.
// Ce fichier ne remplace donc pas axe-core : il attrape en amont, dans la source,
// ce qu'axe-core n'attraperait qu'une fois l'écran écrit, monté et balayé.
//
// Traçabilité : E27 (WCAG AA), E44 (UX/UI 2026-2027) · invariant 4 du 00_INDEX.
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Seuil WCAG 2.1 niveau AA pour du texte courant. Toute la typographie du paquet en relève. */
const SEUIL_AA_TEXTE = 4.5;

function luminanceRelative(hex: string): number {
  const c = hex.replace('#', '');
  const canaux = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = canaux.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

function contraste(a: string, b: string): number {
  const la = luminanceRelative(a);
  const lb = luminanceRelative(b);
  const [haut, bas] = la > lb ? [la, lb] : [lb, la];
  return (haut + 0.05) / (bas + 0.05);
}

const RACINE = import.meta.dirname;

/** Les jetons de couleur, lus dans `tokens.css` — jamais recopiés ici (invariant 4). */
function jetonsDeCouleur(): ReadonlyMap<string, string> {
  const css = readFileSync(resolve(RACINE, 'tokens.css'), 'utf8');
  const jetons = new Map<string, string>();
  for (const m of css.matchAll(/--(couleur-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    if (!jetons.has(m[1] ?? '')) jetons.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  return jetons;
}

interface Combinaison {
  selecteur: string;
  texte: string;
  fond: string;
  ratio: number;
  /** WCAG 2.1 §1.4.3 « Incidental » : un composant DÉSACTIVÉ n'a aucune exigence. */
  desactive: boolean;
}

/**
 * Le sélecteur vise-t-il un contrôle DÉSACTIVÉ ?
 *
 * Les groupes `:not(…)` sont retirés AVANT le test, et ce n'est pas une finesse :
 * `.axn-bouton--discret:hover:not(:disabled)` vise exactement le contraire — un
 * bouton ACTIF, survolé. Sans ce retrait, la règle la plus vivante de la feuille
 * serait classée « exemptée » et sortirait silencieusement de la mesure. Défaut
 * trouvé par le test d'inventaire ci-dessous, pas par relecture.
 */
function estDesactive(selecteur: string): boolean {
  return /:disabled\b/.test(selecteur.replace(/:not\([^)]*\)/g, ''));
}

/**
 * Relève toute règle qui déclare ENSEMBLE une couleur de texte et un fond, et
 * mesure le contraste. Fonction pure sur une chaîne CSS : c'est ce qui permet de
 * lui donner une feuille FAUTIVE fabriquée et de vérifier qu'elle la refuse.
 */
function combinaisons(css: string, jetons: ReadonlyMap<string, string>): Combinaison[] {
  const releve: Combinaison[] = [];
  const epure = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const bloc of epure.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = (bloc[1] ?? '').trim().replace(/\s+/g, ' ');
    const corps = bloc[2] ?? '';
    const texte = /(?:^|;|\s)color\s*:\s*var\(\s*--(couleur-[a-z0-9-]+)\s*\)/.exec(corps)?.[1];
    const fond = /background(?:-color)?\s*:\s*var\(\s*--(couleur-[a-z0-9-]+)\s*\)/.exec(corps)?.[1];
    if (texte === undefined || fond === undefined) continue;
    const valeurTexte = jetons.get(texte);
    const valeurFond = jetons.get(fond);
    // Un jeton absent de `tokens.css` est DÉJÀ refusé par `invariant-tokens.test.tsx` :
    // on ne mesure ici que ce qui est mesurable, sans doubler ce contrôle-là.
    if (valeurTexte === undefined || valeurFond === undefined) continue;
    releve.push({
      selecteur,
      texte,
      fond,
      ratio: contraste(valeurTexte, valeurFond),
      desactive: estDesactive(selecteur),
    });
  }
  return releve;
}

/**
 * ── LE REGISTRE DES ÉCARTS MESURÉS, ET POURQUOI CE N'EST PAS UNE DÉROGATION ──
 * Une entrée ici n'excuse rien : elle FIGE un chiffre. Le test exige que la mesure
 * soit ÉGALE à la valeur enregistrée, pas qu'elle lui soit supérieure.
 *   · si le contraste se dégrade → rouge ;
 *   · si quelqu'un le CORRIGE → rouge aussi, avec le message qui dit de retirer
 *     l'entrée. Le registre ne peut donc pas survivre à sa raison d'être.
 * Éclaircir un jeton de charte pour faire passer une paire serait un arbitrage
 * (CLAUDE.md §3-2), pas un correctif d'implémentation : A28 mesure et rend ; il ne
 * relève aucun seuil et ne repeint aucune charte. Choisir un AUTRE jeton existant
 * pour une déclaration, en revanche, est un correctif ordinaire — c'est le chemin
 * pris le 2026-09-06, décrit ci-dessous.
 */
// LE REGISTRE EST VIDE, ET C'EST SON RÉSULTAT LE PLUS UTILE.
//
// Il a porté une entrée quelques heures : `.axn-badge--action`, mesuré à 4,13:1
// par A28 le 2026-09-06, sous AA de 0,37. Le mécanisme conçu par A28 a
// fonctionné exactement comme prévu — l'entrée exige l'ÉGALITÉ du ratio, donc
// corriger l'écart sans retirer l'entrée rend ce fichier rouge. Un registre qui
// peut survivre à sa raison d'être est une dérogation ; celui-ci ne le peut pas.
//
// Ce qui a été arbitré le même jour, et il faut le lire exactement : la variante
// `action` de `Badge` est RESTÉE. Retirer la variante avait été envisagé, puis
// ÉCARTÉ PAR LA MESURE — elle est employée, par une TABLE (`TON_STATUT` dans
// `EcranPortefeuille.tsx`, où `en_cours` vaut `action`) que le `grep` de A28 ne
// voyait pas, et c'est le compilateur qui l'a dit en refusant le type. Ce qui a
// changé est la DÉCLARATION de `.axn-badge--action` dans `composants.css` : la
// couleur du texte passe à un autre jeton EXISTANT de la famille terracotta,
// au-dessus de AA. Aucun jeton de charte n'est modifié, aucun écran ne change de
// sens. L'entrée du registre est partie parce que l'écart qu'elle figeait n'existe
// plus, pas parce que son objet aurait disparu.
//
// Laisser la carte vide plutôt que de supprimer ce bloc est délibéré : la
// prochaine dérogation devra s'écrire ICI, avec son chiffre et son motif, et
// personne n'aura à réinventer le mécanisme qui l'empêche de dormir.
const ECARTS_MESURES: ReadonlyMap<string, { ratio: number; motif: string }> = new Map();

const JETONS = jetonsDeCouleur();
const RELEVE = combinaisons(readFileSync(resolve(RACINE, 'composants.css'), 'utf8'), JETONS);

describe('A28 — contraste AA sur les combinaisons déclarées par `composants.css`', () => {
  it('trouve des combinaisons à mesurer (sinon ce fichier serait vert pour rien)', () => {
    expect(RELEVE.length).toBeGreaterThanOrEqual(20);
  });

  const aMesurer = RELEVE.filter((c) => !c.desactive && !ECARTS_MESURES.has(c.selecteur));

  it.each(aMesurer.map((c) => [c.selecteur, c] as const))(
    '« %s » tient le contraste AA',
    (_selecteur, combinaison) => {
      expect(
        combinaison.ratio,
        `${combinaison.texte} sur ${combinaison.fond} = ${combinaison.ratio.toFixed(2)}:1 ` +
          `(seuil AA ${String(SEUIL_AA_TEXTE)}:1) sur « ${combinaison.selecteur} »`,
      ).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    },
  );
});

describe('A28 — le registre des écarts mesurés ne survit pas à sa raison d’être', () => {
  it.each([...ECARTS_MESURES.entries()])(
    '« %s » vaut TOUJOURS le chiffre enregistré',
    (selecteur, ecart) => {
      const combinaison = RELEVE.find((c) => c.selecteur === selecteur);
      expect(
        combinaison,
        `« ${selecteur} » n’existe plus dans composants.css : retirez son entrée du registre`,
      ).toBeDefined();
      if (combinaison === undefined) return;
      expect(
        combinaison.ratio,
        combinaison.ratio >= SEUIL_AA_TEXTE
          ? `« ${selecteur} » est passé à ${combinaison.ratio.toFixed(2)}:1 : l’écart est ` +
              `CORRIGÉ, retirez son entrée d’ECARTS_MESURES dans le même commit`
          : `« ${selecteur} » mesure ${combinaison.ratio.toFixed(2)}:1 au lieu de ` +
              `${ecart.ratio.toFixed(2)}:1 enregistré — le contraste a bougé. Motif : ${ecart.motif}`,
      ).toBeCloseTo(ecart.ratio, 2);
    },
  );

  it('n’enregistre aucun écart qui, en réalité, tiendrait AA', () => {
    // Un registre qui contient des lignes inutiles finit par contenir des lignes
    // fausses. Chaque entrée doit être un vrai écart, sinon elle sort.
    for (const [selecteur, ecart] of ECARTS_MESURES) {
      expect(ecart.ratio, `« ${selecteur} » n’est pas un écart`).toBeLessThan(SEUIL_AA_TEXTE);
    }
  });
});

describe('A28 — ce que WCAG 2.1 §1.4.3 exempte, compté plutôt que caché', () => {
  // « Incidental : text or images of text that are part of an INACTIVE user
  //   interface component have no contrast requirement. » Les contrôles
  //   désactivés sont donc hors seuil — mais pas hors du rapport : ils sont
  //   énumérés ici pour qu'un nouveau ne s'ajoute pas en silence.
  it('ne connaît QUE les combinaisons désactivées relevées à ce jour', () => {
    const desactivees = RELEVE.filter((c) => c.desactive)
      .map((c) => c.selecteur)
      .sort();
    expect(desactivees).toEqual(['.axn-bouton:disabled', '.axn-champ__saisie:disabled']);
  });
});

describe('A28 — contre-épreuve : le relevé DÉTECTE une faute fabriquée', () => {
  // Sans ce bloc, une expression régulière cassée rendrait tout ce fichier vert
  // et silencieux — le défaut exact que ce dépôt traque.
  // Deux gris voisins, FABRIQUÉS pour être fautifs : ils n'appartiennent à aucune
  // charte et ne peuvent atteindre aucun écran — ils ne servent qu'à éprouver le
  // relevé lui-même. Sans une vraie valeur, il n'y a pas de ratio à mesurer.
  const JETONS_FICTIFS = new Map([
    // invariant-ok: fixture de contre-épreuve — gris fabriqué, hors charte.
    ['couleur-faux-texte', '#999999'],
    // invariant-ok: fixture de contre-épreuve — gris fabriqué, hors charte.
    ['couleur-faux-fond', '#aaaaaa'],
  ]);

  it('relève une paire fautive et la mesure sous le seuil', () => {
    const releve = combinaisons(
      '.epreuve { color: var(--couleur-faux-texte); background: var(--couleur-faux-fond); }',
      JETONS_FICTIFS,
    );
    expect(releve).toHaveLength(1);
    expect(releve[0]?.ratio).toBeLessThan(SEUIL_AA_TEXTE);
    expect(releve[0]?.desactive).toBe(false);
  });

  it('reconnaît l’exemption d’un contrôle désactivé', () => {
    const releve = combinaisons(
      '.epreuve:disabled { color: var(--couleur-faux-texte); background: var(--couleur-faux-fond); }',
      JETONS_FICTIFS,
    );
    expect(releve[0]?.desactive).toBe(true);
  });

  it('ne prend PAS `:not(:disabled)` pour une exemption', () => {
    // Le piège qui a réellement mordu : `:not(:disabled)` vise l'état ACTIF.
    // Le classer « exempté » retirerait de la mesure une règle qui, elle, est peinte.
    const releve = combinaisons(
      '.epreuve:hover:not(:disabled) { color: var(--couleur-faux-texte); background: var(--couleur-faux-fond); }',
      JETONS_FICTIFS,
    );
    expect(releve[0]?.desactive).toBe(false);
  });

  it('ignore une règle qui ne déclare qu’une moitié de la paire', () => {
    expect(combinaisons('.epreuve { color: var(--couleur-faux-texte); }', JETONS_FICTIFS)).toEqual(
      [],
    );
  });
});
