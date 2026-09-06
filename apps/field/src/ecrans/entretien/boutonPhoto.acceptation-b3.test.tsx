// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B3**, moitié « ce que l'œil voit ».
// (La moitié « balayage des sources » vit dans `photo.acceptation-b3.test.ts`.)
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne de `ZoneQuestion.tsx`
// ni du correctif (09 §5.6). `@critique`.
//
// ── CE QU'IL TIENT, ET POURQUOI IL REND AU LIEU DE RELIRE ───────────────────
// Le motif du bouton doit être VISIBLE À L'ŒIL. Un `aria-label` seul laisse
// l'auditeur voyant devant un bouton gris et muet — et c'est ce bouton-là qui
// l'envoie sortir son téléphone personnel, avec la pièce d'audit dessus. A20 le
// vérifie en relisant le TEXTE SOURCE du composant ; un test qui lit du source
// dit qu'une chaîne est écrite quelque part, jamais qu'elle est peinte. Celui-ci
// rend le composant et lit le NŒUD, en séparant le texte des attributs
// d'accessibilité — c'est très exactement la distinction que B3 a coûtée.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif), E44 (§33.6).
// =============================================================================
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuestionLocale } from '../../local/depots/questions.js';
import { MOTIF_PHOTO_INDISPONIBLE, ZoneQuestion } from './ZoneQuestion.js';

function questionFictive(): QuestionLocale {
  return {
    id: '0191e2a0-0000-7000-8000-00000027b301',
    missionId: '0191e2a0-0000-7000-8000-00000027b302',
    position: 1,
    texteSnapshot: 'Question fictive de recette A27.',
    motsCles: ['question', 'fictive'],
    answerType: 'free_text',
    criticality: 'important',
    clientUpdatedAt: '2026-09-06T08:00:00.000Z',
    supprimeLe: null,
    questionId: '0191e2a0-0000-7000-8000-00000027b303',
    questionVersion: 1,
    guidanceSnapshot: null,
    optionsSnapshot: null,
    scoringSnapshot: null,
    weightSnapshot: 0,
    allowRangeSnapshot: false,
    addedAdHoc: false,
    blockCode: 'bloc_fictif',
  };
}

function rendreZoneQuestion(): void {
  render(
    <ZoneQuestion
      question={questionFictive()}
      rang={1}
      total={10}
      reponse={null}
      horsParcours={false}
      partage={false}
      ecritureRefusee={null}
      fourchette={false}
      onFourchette={() => undefined}
      onValeur={() => undefined}
      onDrapeau={() => undefined}
      onNote={() => undefined}
      onRecherche={() => undefined}
      onQuestionAdHoc={() => undefined}
      onPrecedent={() => undefined}
      onSuivant={() => undefined}
      peutPrecedent={false}
      peutSuivant
      afficherRaccourcis
    />,
  );
}

/** Le bouton « Photo » tel qu'il est RENDU, ou `null`. */
function boutonPhoto(): HTMLButtonElement | null {
  const trouve = screen.getAllByRole('button').find((bouton) => /photo/i.test(bouton.textContent));
  return trouve instanceof HTMLButtonElement ? trouve : null;
}

describe('B3 — le motif du bouton est LU PAR UN ŒIL, pas seulement par un lecteur d’écran', () => {
  it('@critique anti-vacuité : le bouton est bien rendu, et il est désactivé', () => {
    rendreZoneQuestion();
    const photo = boutonPhoto();
    expect(photo).not.toBeNull();
    expect(photo?.disabled).toBe(true);
  });

  it('@critique son libellé VISIBLE dit que la capture n’est pas là — « Photo » nu est refusé', () => {
    rendreZoneQuestion();
    const photo = boutonPhoto();
    expect(photo?.textContent).toMatch(/bientôt/i);
    expect(photo?.textContent.trim()).not.toBe('Photo');
  });

  it('@critique le motif COMPLET reste au survol et au lecteur d’écran, et dit quoi faire à la place', () => {
    rendreZoneQuestion();
    const photo = boutonPhoto();
    expect(photo?.getAttribute('title')).toBe(MOTIF_PHOTO_INDISPONIBLE);
    expect(photo?.getAttribute('aria-label')).toContain(MOTIF_PHOTO_INDISPONIBLE);
    // Cause ET action (03 §17.6), et le contournement nommé pour être empêché.
    expect(MOTIF_PHOTO_INDISPONIBLE).toMatch(/n’est pas disponible/);
    expect(MOTIF_PHOTO_INDISPONIBLE).toMatch(/note/);
    expect(MOTIF_PHOTO_INDISPONIBLE).toMatch(/appareil personnel/);
  });

  it('@critique en mode ÉCRAN PARTAGÉ, le bouton n’est pas rendu du tout', () => {
    // Le bord opposé : la barre d'actions internes est retirée devant
    // l'interlocuteur (03 §33.3). Sans ce test, « le bouton porte son motif »
    // pourrait être tenu par un bouton affiché là où rien d'interne ne doit
    // paraître.
    render(
      <ZoneQuestion
        question={questionFictive()}
        rang={1}
        total={10}
        reponse={null}
        horsParcours={false}
        partage
        ecritureRefusee={null}
        fourchette={false}
        onFourchette={() => undefined}
        onValeur={() => undefined}
        onDrapeau={() => undefined}
        onNote={() => undefined}
        onRecherche={() => undefined}
        onQuestionAdHoc={() => undefined}
        onPrecedent={() => undefined}
        onSuivant={() => undefined}
        peutPrecedent={false}
        peutSuivant
        afficherRaccourcis
      />,
    );
    expect(boutonPhoto()).toBeNull();
  });
});
