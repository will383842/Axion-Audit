// =============================================================================
// LA PAGE `/design` — CE QUE LE TYPE NE TIENT PAS, ET QUI EST MESURÉ ICI
//
// ── LE PARTAGE DES RÔLES ENTRE LE TYPE ET CE FICHIER ───────────────────────
// `catalogue.ts` porte le garde PRINCIPAL : `satisfies Record<NomComposantUI,
// FicheComposant>` refuse de compiler si un composant exporté par `@axion/ui`
// n'a pas sa fiche. Éprouvé le 2026-09-07 en retirant `Badge` de la galerie :
// « Property 'Badge' is missing … but required in type Record<NomComposantUI,
// FicheComposant> », avant qu'aucun test ne tourne.
//
// Ce fichier tient les quatre choses qu'un type ne sait pas dire :
//   ① le compte, MESURÉ à l'exécution sur le TEXTE de `composants/index.ts` —
//      seconde ceinture, indépendante de la première : un `as` malheureux
//      désarmerait le `satisfies` sans que rien ne rougisse, et c'est
//      exactement la famille de défaut que ce dépôt traque ;
//   ② la RICHESSE : deux états DISTINCTS par composant, et les quatre états de
//      §33.2 présents sur la page. Une galerie tout en nominal compile
//      parfaitement et ne vaut rien ;
//   ③ l'invariant 4 sur le DOM RÉELLEMENT RENDU (aucune couleur ni taille en
//      dur, aucun jeton inventé) et l'invariant 5 (aucun mot d'interface
//      anglais hors des citations `lang="en"`) ;
//   ④ la réconciliation avec §33.5 dans les DEUX SENS : chaque nom livré a sa
//      fiche, chaque fiche hors énumération porte sa justification, et les
//      absences déclarées sont AFFICHÉES avec leur motif.
//
// ── UNE RÉSERVE DE PROCÉDURE, ÉCRITE PLUTÔT QUE TUE ────────────────────────
// 09 §5.6 : « le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé ». Ce fichier et la page viennent du même agent (A21), faute d'un second
// agent sur ce chantier. Ce n'est pas conforme, et ça se signale : la revue
// croisée A29 doit relire CES ASSERTIONS autant que la page — un test écrit par
// l'auteur mesure ce qu'il a voulu faire, pas ce qui était dû.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale), E22 (console de pilotage 7 espaces).
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { absencesDe33_5, nomSpecDe, NOMS_33_5, INVENTAIRE_33_5, TOKENS_TAILLE } from '@axion/ui';
import {
  balayerStylesEnDur,
  codesBrutsVisibles,
  jetonsDefinis,
  jetonsInconnus,
  texteVisibleDEmblee,
} from '../../tests-aide/balayage-dom.js';
import { CATALOGUE, NOMS_CATALOGUE } from './catalogue.js';
import { EcranDesign } from './EcranDesign.js';
import { QUATRE_ETATS_33_2 } from './types.js';

const RACINE_UI = resolve(import.meta.dirname, '../../../../../packages/ui/src');

function lire(chemin: string): string {
  return readFileSync(chemin, 'utf8');
}

/**
 * ① Les composants exportés, LUS dans le texte de `composants/index.ts`.
 *
 * Même idiome que `jetonsDefinis()`, qui lit `tokens.css` plutôt que de recopier
 * la charte : la vérité est dans le fichier, jamais dans une liste parallèle.
 * `export type { … }` ne matche pas (la ligne commence par `export type`).
 */
function composantsExportes(): readonly string[] {
  const source = lire(resolve(RACINE_UI, 'composants/index.ts'));
  const noms = new Set<string>();
  for (const bloc of source.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)) {
    for (const brut of (bloc[1] ?? '').split(',')) {
      const nom = brut.trim();
      // La majuscule initiale EST la convention des composants React : `<bouton />`
      // ne se rend pas comme un composant. Les utilitaires en sortent d'eux-mêmes.
      if (/^[A-Z]/.test(nom)) noms.add(nom);
    }
  }
  return [...noms].sort((a, b) => a.localeCompare(b));
}

/** Le texte visible, PRIVÉ des citations en langue étrangère (`lang="en"`). */
function texteFrancaisVisible(racine: HTMLElement): string {
  const copie = racine.cloneNode(true) as HTMLElement;
  for (const cite of copie.querySelectorAll('[lang="en"]')) cite.remove();
  return texteVisibleDEmblee(copie);
}

/** Les mots d'interface qu'un composant laissé dans sa langue d'origine produirait. */
const ANGLAIS =
  /\b(?:loading|error|empty|offline|retry|cancel|submit|close|save|saved|saving|search|yes|none|not applicable|required)\b/i;

describe('§33.5 — la galerie ne peut pas oublier un composant', () => {
  it('① le catalogue couvre EXACTEMENT les composants exportés par @axion/ui', () => {
    const exportes = composantsExportes();
    expect(exportes.length).toBeGreaterThan(20);
    expect([...NOMS_CATALOGUE].sort((a, b) => a.localeCompare(b))).toEqual(exportes);
  });

  it('CONTRE-ÉPREUVE — la comparaison mord si un composant quitte la galerie', () => {
    // Sans cette ligne, une lecture cassée de `composants/index.ts` rendrait le
    // test précédent vert pour toujours. On fabrique le défaut plutôt que de le
    // supposer détecté.
    const ampute = [...NOMS_CATALOGUE]
      .filter((nom) => nom !== 'Badge')
      .sort((a, b) => a.localeCompare(b));
    expect(ampute).not.toEqual(composantsExportes());
  });

  it('la lecture du fichier source voit bien les composants, pas les utilitaires', () => {
    const exportes = composantsExportes();
    expect(exportes).toContain('Bouton');
    expect(exportes).toContain('EchelleAncree');
    expect(exportes).toContain('IconeRotor');
    expect(exportes).not.toContain('classes');
    expect(exportes).not.toContain('useSuperposition');
    expect(exportes).not.toContain('fourchetteIncoherente');
  });
});

describe('§33.2 — la galerie montre les états qu’on oublie, pas seulement le nominal', () => {
  it('② chaque composant montre au moins DEUX états distincts', () => {
    const maigres = NOMS_CATALOGUE.filter((nom) => {
      const etats = new Set(CATALOGUE[nom].demonstrations.map((d) => d.etat));
      return etats.size < 2;
    });
    expect(maigres).toEqual([]);
  });

  it('les quatre états de §33.2 sont chacun montrés au moins une fois', () => {
    const montres = new Set(
      NOMS_CATALOGUE.flatMap((nom) => CATALOGUE[nom].demonstrations.map((d) => d.etat)),
    );
    for (const etat of QUATRE_ETATS_33_2) {
      expect(montres, `état §33.2 absent de la page : ${etat}`).toContain(etat);
    }
  });

  it('l’état « désactivé » est montré, et toujours accompagné d’un motif écrit', () => {
    const avecDesactive = NOMS_CATALOGUE.filter((nom) =>
      CATALOGUE[nom].demonstrations.some((d) => d.etat === 'desactive'),
    );
    expect(avecDesactive.length).toBeGreaterThan(0);
    render(<EcranDesign />);
    // §17.6 : on ne grise jamais sans dire pourquoi. Un motif est rendu par
    // vignette désactivée, dans la classe qui lui est réservée.
    const motifs = document.body.querySelectorAll('.axn-design__motif');
    expect(motifs.length).toBeGreaterThanOrEqual(avecDesactive.length);
  });

  it('chaque aperçu rend au moins un élément — aucune vignette vide', () => {
    for (const nom of NOMS_CATALOGUE) {
      for (const demonstration of CATALOGUE[nom].demonstrations) {
        const { Apercu } = demonstration;
        const { container, unmount } = render(<Apercu />);
        const rendu = container.querySelectorAll('*').length;
        expect(rendu, `${nom} / ${demonstration.intitule} ne rend rien`).toBeGreaterThan(0);
        unmount();
      }
    }
  });
});

describe('§33.5 — la réconciliation avec le pack, dans les deux sens', () => {
  it('④ chaque composant que §33.5 déclare livré a exactement une fiche', () => {
    for (const nomSpec of NOMS_33_5) {
      const { statut } = INVENTAIRE_33_5[nomSpec];
      if (statut.etat !== 'livre') continue;
      expect(NOMS_CATALOGUE, `§33.5 « ${nomSpec} » sans fiche`).toContain(statut.composant);
    }
  });

  it('chaque fiche hors énumération §33.5 porte sa justification ET son renvoi', () => {
    for (const nom of NOMS_CATALOGUE) {
      const { origine } = CATALOGUE[nom];
      const nomSpec = nomSpecDe(nom);
      if (nomSpec === null) {
        expect(origine.source, `${nom} n’est pas dans §33.5 et ne le déclare pas`).toBe(
          'hors-33.5',
        );
        if (origine.source === 'hors-33.5') {
          expect(origine.justification.length).toBeGreaterThan(40);
          expect(origine.renvoi.length).toBeGreaterThan(0);
        }
      } else {
        expect(origine.source, `${nom} est dans §33.5 et se déclare hors`).toBe('33.5');
      }
    }
  });

  it('les absences déclarées sont AFFICHÉES sur la page, avec leur motif', () => {
    const absences = absencesDe33_5();
    expect(absences.length).toBeGreaterThanOrEqual(4);
    render(<EcranDesign />);
    // Le tableau est trouvé par son NOM ACCESSIBLE (sa légende) : c'est ainsi
    // qu'un lecteur d'écran le trouve, et c'est donc ce qu'on veut éprouver.
    const tableau = screen.getByRole('table', { name: /Absences déclarées de l’inventaire/i });
    const lignes = within(tableau).getAllByRole('row');
    for (const absence of absences) {
      const ligne = lignes.find((candidate) => candidate.textContent.includes(absence.nom));
      expect(ligne, `aucune ligne pour ${absence.nom}`).toBeDefined();
      expect(ligne?.textContent ?? '', `motif absent pour ${absence.nom}`).toContain(
        absence.motif.slice(0, 30),
      );
    }
  });

  it('les quatre composants écartés de L5 sont nommés — la galerie ne tait pas ses trous', () => {
    render(<EcranDesign />);
    const texte = document.body.textContent;
    for (const attendu of ['TimelinePilote', 'Radar', 'Heatmap', 'CourbePrévuRéel']) {
      expect(texte, `${attendu} n’est pas signalé absent`).toContain(attendu);
    }
  });
});

describe('la page rendue — invariants 2, 4 et 5', () => {
  it('rend un titre unique et une fiche par composant', () => {
    render(<EcranDesign />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/design system/i);
    expect(document.body.querySelectorAll('.axn-design__fiche').length).toBe(NOMS_CATALOGUE.length);
  });

  it('③ invariant 4 — aucune couleur ni taille en dur dans le DOM rendu', () => {
    render(<EcranDesign />);
    expect(balayerStylesEnDur(document.body)).toEqual([]);
  });

  it('③ invariant 4 — chaque `var(--…)` consommée existe dans tokens.css', () => {
    render(<EcranDesign />);
    expect(jetonsInconnus(document.body)).toEqual([]);
  });

  it('③ invariant 5 — aucun mot d’interface anglais hors citation `lang="en"`', () => {
    render(<EcranDesign />);
    const texte = texteFrancaisVisible(document.body);
    expect(texte.length).toBeGreaterThan(2_000);
    expect(ANGLAIS.exec(texte)?.[0] ?? null).toBeNull();
  });

  it('CONTRE-ÉPREUVE — le filtre anglais mord, et respecte les citations', () => {
    expect(ANGLAIS.exec('Loading, please wait')).not.toBeNull();
    expect(ANGLAIS.exec('Chargement en cours')).toBeNull();
    const cobaye = document.createElement('div');
    cobaye.innerHTML = '<p>Le socle nomme <code lang="en">Skeleton</code> et rien d’autre.</p>';
    expect(texteFrancaisVisible(cobaye)).not.toContain('Skeleton');
  });

  it('aucun code brut du contrat ni scorie technique visible d’emblée', () => {
    render(<EcranDesign />);
    // Le code technique de l'état d'erreur vit dans un `<details>` FERMÉ : c'est
    // sa seule place légitime (§33.2), et `texteVisibleDEmblee` ne l'y voit pas.
    expect(codesBrutsVisibles(texteVisibleDEmblee(document.body))).toEqual([]);
  });

  it('invariant 2 — aucun nom d’entreprise réelle : les exemples sont génériques', () => {
    render(<EcranDesign />);
    const texte = document.body.textContent;
    // Les seuls noms propres tolérés sont ceux d'outils et de normes.
    expect(texte).toContain('Responsable logistique');
    expect(texte).not.toMatch(/\bSAS\b|\bSARL\b|\bS\.A\.\b/);
  });
});

describe('la feuille de style de la page ne pose aucune valeur en dur', () => {
  const css = lire(resolve(import.meta.dirname, 'design.css'));
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('aucune longueur en unité absolue (px, pt, cm…)', () => {
    const absolues = sansCommentaires.match(/(?<![\w.-])\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|Q)\b/g);
    expect(absolues).toBeNull();
  });

  it('aucune notation de couleur — tout passe par un jeton', () => {
    expect(sansCommentaires).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sansCommentaires).not.toMatch(/\b(?:rgba?|hsla?|oklch|lab|lch|color-mix)\s*\(/);
  });

  it('chaque jeton consommé est défini par tokens.css', () => {
    const definis = jetonsDefinis();
    const inconnus = [...sansCommentaires.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)]
      .map((m) => (m[1] ?? '').toLowerCase())
      .filter((jeton) => !definis.has(jeton));
    expect([...new Set(inconnus)]).toEqual([]);
  });

  it('les deux liens neufs respectent la cible tactile de 44 px (A27)', () => {
    // Mesuré sur la RÈGLE, pas sur le rendu : jsdom ne met rien en page. Les deux
    // sélecteurs interactifs ajoutés par ce chantier déclarent une hauteur
    // minimale, et cette hauteur vient d'un jeton qui vaut au moins 44 px.
    const sommaire = /\.axn-design__sommaire a \{[^}]*min-height:\s*var\((--taille-[a-z-]+)\)/.exec(
      sansCommentaires,
    );
    expect(sommaire?.[1]).toBe('--taille-cible-tactile-min');
    // Le PLANCHER est vérifié, pas une égalité : le jour où A27 monte la cible,
    // ce test ne doit pas rougir pour une bonne nouvelle. La valeur n'est jamais
    // recopiée — elle vient du jeton, seule source (invariant 4).
    expect(TOKENS_TAILLE['cible-tactile-min'].endsWith('px')).toBe(true);
    expect(Number.parseFloat(TOKENS_TAILLE['cible-tactile-min'])).toBeGreaterThanOrEqual(44);

    const coquille = lire(resolve(import.meta.dirname, '../../app/coquille.css'));
    const outillage =
      /\.axn-console__outillage a \{[^}]*min-height:\s*var\((--taille-[a-z-]+)\)/.exec(
        coquille.replace(/\/\*[\s\S]*?\*\//g, ''),
      );
    expect(outillage?.[1]).toBe('--taille-controle-hauteur');
    // Exprimé en rem, il SUIT la taille de police système — ce qu'une valeur en
    // pixels ne ferait pas. 2,75 rem valent le plancher d'A27 au réglage par défaut.
    expect(TOKENS_TAILLE['controle-hauteur'].endsWith('rem')).toBe(true);
    expect(Number.parseFloat(TOKENS_TAILLE['controle-hauteur']) * 16).toBeGreaterThanOrEqual(44);
  });
});
