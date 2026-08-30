// =============================================================================
// TESTS — CARTE DE SYNTHÈSE D'ENTRETIEN (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.3, FIN D'ENTRETIEN : « l'écran de validation (§19.1) présente la synthèse
// en UNE CARTE LISIBLE : répondu / à revoir / N/A / notes / pièces — puis les
// contrôles bloquants. » Les cinq mesures sont REQUISES par le type ; ce que le
// type ne peut pas garantir, c'est qu'elles ARRIVENT TOUTES à l'écran. C'est
// l'objet du premier test, et l'enjeu est concret : une synthèse à laquelle il
// manque « à revoir » est exactement celle qui laisse un à-revoir non levé filer
// vers la validation d'unité (§19.1).
//
// §27.4 : « non communiqué » est DISTINCT de « sans objet » et de « à revoir ».
// La carte ne l'affiche que si la mission en a rencontré — mais quand elle
// l'affiche, elle ne doit pas le confondre avec les autres.
//
// La carte NE VALIDE RIEN : « Terminer » (geste à chaud) et « Valider » (geste
// qualité, verrouillant) arrivent par `actions` (§19.1 V2.10). Le test vérifie
// qu'aucun de ces deux boutons n'est fabriqué par le composant.
// Traçabilité : E13, E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CarteSyntheseEntretien } from './CarteSyntheseEntretien.js';
import { Bouton } from './Bouton.js';

afterEach(() => {
  cleanup();
});

const BASE = {
  titre: 'Responsable logistique — site Nord',
  repondu: 32,
  total: 40,
  aRevoir: 3,
  na: 4,
  notes: 7,
  pieces: 2,
} as const;

/**
 * Valeur affichée sous une mesure, retrouvée par son libellé (paire `dt`/`dd`).
 * On vise le TERME de la liste de définitions : « Répondu » apparaît aussi comme
 * libellé de l'anneau, et confondre les deux ferait passer un test qui ne lit
 * pas la mesure.
 */
function mesure(libelle: string): string | null {
  const terme = screen.getAllByText(libelle).find((noeud) => noeud.tagName === 'DT');
  expect(terme, `aucune mesure « ${libelle} » dans la synthèse`).not.toBeUndefined();
  return terme?.parentElement?.querySelector('dd')?.textContent ?? null;
}

describe('CarteSyntheseEntretien — les cinq mesures du §33.3 arrivent TOUTES à l’écran', () => {
  it('affiche répondu, à revoir, sans objet, notes et pièces', () => {
    render(<CarteSyntheseEntretien {...BASE} />);
    expect(mesure('Répondu')).toBe('32');
    expect(mesure('À revoir')).toBe('3');
    expect(mesure('Sans objet')).toBe('4');
    expect(mesure('Notes')).toBe('7');
    expect(mesure('Pièces jointes')).toBe('2');
  });

  it('affiche les mesures à ZÉRO plutôt que de les taire', () => {
    // Une mesure absente se lit « pas de donnée » ; une mesure à zéro se lit
    // « rien à lever ». Sur « à revoir », la différence décide d'une validation.
    render(<CarteSyntheseEntretien {...BASE} aRevoir={0} notes={0} />);
    expect(mesure('À revoir')).toBe('0');
    expect(mesure('Notes')).toBe('0');
  });

  it('n’affiche « Non communiqué » que si la mission en a rencontré (§27.4)', () => {
    const { unmount } = render(<CarteSyntheseEntretien {...BASE} />);
    expect(screen.queryByText('Non communiqué')).toBeNull();
    unmount();

    render(<CarteSyntheseEntretien {...BASE} nonCommunique={2} />);
    expect(mesure('Non communiqué')).toBe('2');
  });

  it('distingue « Non communiqué », « Sans objet » et « À revoir » (§27.4)', () => {
    render(<CarteSyntheseEntretien {...BASE} aRevoir={1} na={2} nonCommunique={3} />);
    expect(mesure('À revoir')).toBe('1');
    expect(mesure('Sans objet')).toBe('2');
    expect(mesure('Non communiqué')).toBe('3');
  });
});

describe('CarteSyntheseEntretien — l’identité de la session, et rien d’inventé', () => {
  it('est une région nommée par le titre de la session', () => {
    render(<CarteSyntheseEntretien {...BASE} />);
    expect(
      screen.getByRole('region', { name: 'Synthèse — Responsable logistique — site Nord' }),
    ).not.toBeNull();
  });

  it('affiche le titre en en-tête', () => {
    render(<CarteSyntheseEntretien {...BASE} />);
    expect(
      screen.getByRole('heading', { name: 'Responsable logistique — site Nord' }),
    ).not.toBeNull();
  });

  it('n’affiche sous-titre et durée que s’ils sont fournis', () => {
    const { unmount } = render(<CarteSyntheseEntretien {...BASE} />);
    expect(screen.queryByText(/Durée :/)).toBeNull();
    unmount();

    render(<CarteSyntheseEntretien {...BASE} sousTitre="Entretien individuel" duree="47 min" />);
    expect(screen.getByText('Entretien individuel')).not.toBeNull();
    expect(screen.getByText('Durée : 47 min')).not.toBeNull();
  });

  it('affiche la durée TELLE QU’ELLE ARRIVE : le format n’est pas d’ici', () => {
    render(<CarteSyntheseEntretien {...BASE} duree="1 h 05" />);
    expect(screen.getByText('Durée : 1 h 05')).not.toBeNull();
  });
});

describe('CarteSyntheseEntretien — la progression est LUE, pas seulement dessinée', () => {
  it('nomme l’anneau avec le compte réel, pas avec un pourcentage nu (§33.6)', () => {
    render(<CarteSyntheseEntretien {...BASE} />);
    expect(screen.getByRole('img', { name: '32 questions répondues sur 40' })).not.toBeNull();
  });

  it('accorde le singulier sur une seule question répondue', () => {
    render(<CarteSyntheseEntretien {...BASE} repondu={1} total={40} />);
    expect(screen.getByRole('img', { name: '1 question répondue sur 40' })).not.toBeNull();
  });

  it('ne divise jamais par zéro : un parcours vide affiche 0 %', () => {
    render(<CarteSyntheseEntretien {...BASE} repondu={0} total={0} />);
    expect(screen.getByText('0 %')).not.toBeNull();
  });

  it('affiche un anneau plein quand tout est répondu', () => {
    render(<CarteSyntheseEntretien {...BASE} repondu={40} total={40} />);
    expect(screen.getByText('100 %')).not.toBeNull();
  });
});

describe('CarteSyntheseEntretien — elle NE VALIDE RIEN (§19.1 V2.10)', () => {
  it('ne fabrique aucun bouton de sa propre initiative', () => {
    render(<CarteSyntheseEntretien {...BASE} />);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('rend les deux gestes de fin d’entretien fournis par l’écran, distincts', () => {
    const terminer = vi.fn();
    const valider = vi.fn();
    render(
      <CarteSyntheseEntretien
        {...BASE}
        actions={
          <>
            <Bouton variante="secondaire" onClick={terminer}>
              Terminer l’entretien
            </Bouton>
            <Bouton onClick={valider}>Valider l’entretien</Bouton>
          </>
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’entretien' }));
    expect(terminer).toHaveBeenCalledTimes(1);
    expect(valider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Valider l’entretien' }));
    expect(valider).toHaveBeenCalledTimes(1);
  });
});
