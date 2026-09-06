// =============================================================================
// TESTS DE CONCEPTION A22 — majeur **M1** de la recette novice n°1 (A54,
// 2026-09-06), repris par A02 comme réserve de la porte **P-C** :
// « trois boutons grisés muets dans un parcours qui se veut guidé strict ».
// 03 §19.1 : « chaque étape verrouillée affiche PRÉCISÉMENT ce qui manque […],
// jamais un simple cadenas muet. » La règle vaut pour un GESTE comme pour un
// verrou — c'est ce que B3 (le bouton Photo) a déjà coûté une fois.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION, écrits par A22 AVANT le correctif. L'ACCEPTATION revient
// à A27 (09 §5.6). Aucun cas n'est `@critique`.
//
// ── LA FORME DU TEST, ET POURQUOI ELLE EST GÉNÉRIQUE ────────────────────────
// Nommer les trois boutons connus ne tiendrait que jusqu'au quatrième. Le cas
// central BALAIE donc tous les `<button disabled>` rendus par les composants
// d'entretien : chacun doit porter un motif ATTEIGNABLE — un `aria-describedby`
// qui résout vers du texte réellement rendu, ou un `title`. Le jour où un
// nouveau bouton grisé arrive sans motif, c'est ce cas-là qui le dit, et pas une
// relecture.
//
// Un `aria-label` NE COMPTE PAS : c'est très précisément le défaut de B3 — un
// lecteur d'écran l'entend, un auditeur voyant ne le lit jamais.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E44 (UX/UI §33.6),
// E13 (écran 3 zones).
// =============================================================================
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuestionLocale } from '../../local/depots/questions.js';
import { DemarrageEntretien } from './DemarrageEntretien.js';
import { DialogueQuestionAdHoc } from './DialogueQuestionAdHoc.js';
import { DialogueDrapeau } from './DialogueDrapeau.js';
import { PanneauNotes } from './PanneauNotes.js';
import { ZoneQuestion } from './ZoneQuestion.js';

const HORODATAGE = '2026-09-06T08:00:00.000Z';

function questionFictive(partiel: Partial<QuestionLocale> = {}): QuestionLocale {
  return {
    id: '0191e2a0-0000-7000-8000-0000000a1001',
    missionId: '0191e2a0-0000-7000-8000-0000000a1002',
    position: 1,
    texteSnapshot: 'Question fictive de recette M1.',
    motsCles: [],
    answerType: 'free_text',
    criticality: 'important',
    clientUpdatedAt: HORODATAGE,
    supprimeLe: null,
    questionId: '0191e2a0-0000-7000-8000-0000000a1003',
    questionVersion: 1,
    guidanceSnapshot: null,
    optionsSnapshot: null,
    scoringSnapshot: null,
    weightSnapshot: 1,
    allowRangeSnapshot: false,
    addedAdHoc: false,
    blockCode: 'bloc_fictif',
    ...partiel,
  };
}

/**
 * Le motif VISIBLE d'un bouton désactivé, ou `null` s'il est muet.
 *
 * Trois sources acceptées, dans cet ordre : le texte du bouton lui-même (« Photo
 * (bientôt) »), un `aria-describedby` qui résout vers un nœud RENDU et non
 * visuellement masqué, un `title`. `aria-label` est délibérément absent de la
 * liste — voir l'en-tête.
 */
function motifVisible(bouton: HTMLButtonElement): string | null {
  const propre = bouton.textContent.trim();
  if (/bientôt|indisponible|à venir/i.test(propre)) return propre;

  const decrits = (bouton.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '');
  for (const id of decrits) {
    const noeud = document.getElementById(id);
    if (noeud === null) continue;
    if (noeud.classList.contains('axn-visuellement-masque')) continue;
    const texte = noeud.textContent.trim();
    if (texte !== '') return texte;
  }

  const titre = (bouton.getAttribute('title') ?? '').trim();
  return titre === '' ? null : titre;
}

/** Tous les boutons désactivés du DOM courant, avec leur libellé pour le message. */
function boutonsMuets(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button[disabled]')]
    .filter((bouton) => motifVisible(bouton) === null)
    .map((bouton) => bouton.textContent.trim() || '(bouton sans libellé)');
}

describe('M1 — aucun bouton désactivé n’est muet (03 §19.1)', () => {
  it('la barre d’actions en LECTURE SEULE dit pourquoi tout est grisé', () => {
    const motif = 'Cette session est validée : la saisie est verrouillée.';
    render(
      <ZoneQuestion
        question={questionFictive()}
        rang={1}
        total={2}
        reponse={null}
        horsParcours={false}
        partage={false}
        ecritureRefusee={motif}
        fourchette={false}
        onFourchette={() => undefined}
        onValeur={() => undefined}
        onDrapeau={() => undefined}
        onNote={() => undefined}
        onRecherche={() => undefined}
        onQuestionAdHoc={() => undefined}
        onPrecedent={() => undefined}
        onSuivant={() => undefined}
        onTerminer={() => undefined}
        libelleTerminer="Terminer l’entretien"
        peutPrecedent
        peutSuivant
        afficherRaccourcis={false}
      />,
    );
    expect(boutonsMuets()).toEqual([]);
    // Et le motif est bien celui de la session, pas une phrase générique.
    const aRevoir = screen.getByRole<HTMLButtonElement>('button', { name: /à revoir/i });
    expect(motifVisible(aRevoir)).toContain(motif);
  });

  it('« Précédent » grisé sur la PREMIÈRE question dit qu’on est au début', () => {
    render(
      <ZoneQuestion
        question={questionFictive()}
        rang={1}
        total={2}
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
        onTerminer={() => undefined}
        libelleTerminer="Terminer l’entretien"
        peutPrecedent={false}
        peutSuivant
        afficherRaccourcis={false}
      />,
    );
    expect(boutonsMuets()).toEqual([]);
    const precedent = screen.getByRole<HTMLButtonElement>('button', { name: /précédent/i });
    expect(motifVisible(precedent)).toMatch(/première question/i);
  });

  it('« Démarrer l’entretien » grisé dit ce qui manque — l’accord', () => {
    render(
      <DemarrageEntretien
        personName="Interlocuteur fictif"
        onDemarrer={() => Promise.resolve()}
        onRefus={() => Promise.resolve()}
      />,
    );
    expect(boutonsMuets()).toEqual([]);
  });

  it('« Créer et y répondre » grisé dit qu’il manque le texte de la question', () => {
    render(
      <DialogueQuestionAdHoc ouvert onCreer={() => Promise.resolve()} onFermer={() => undefined} />,
    );
    expect(boutonsMuets()).toEqual([]);
    const creer = screen.getByRole<HTMLButtonElement>('button', { name: /créer et y répondre/i });
    expect(motifVisible(creer)).toMatch(/question/i);
  });

  it('« Confirmer » grisé sur « Non communiqué » dit qu’il manque le motif', () => {
    render(
      <DialogueDrapeau
        nature="non_communique"
        dejaPose={false}
        motifActuel={null}
        motifNonCommuniqueActuel={null}
        onDecider={() => undefined}
        onFermer={() => undefined}
      />,
    );
    expect(boutonsMuets()).toEqual([]);
    const confirmer = screen.getByRole<HTMLButtonElement>('button', { name: /confirmer/i });
    expect(motifVisible(confirmer)).toMatch(/motif/i);
  });

  it('« Garder cette note volante » grisé dit qu’il n’y a rien à garder', () => {
    render(
      <PanneauNotes
        cleNoteDeQuestion="q1"
        noteDeQuestion=""
        onNoteDeQuestion={() => undefined}
        ecriturePossible
        cleBlocNotes="s1"
        notesGenerales=""
        onNotesGenerales={() => undefined}
        notesVolantes={[]}
        onCapturerNoteVolante={() => Promise.resolve(true)}
        reponseCouranteId={null}
        onRattacher={() => undefined}
        onDetacher={() => undefined}
        onSupprimer={() => undefined}
        fuseau="Europe/Paris"
      />,
    );
    expect(boutonsMuets()).toEqual([]);
  });

  it('le panneau de notes en LECTURE SEULE dit pourquoi il est grisé', () => {
    render(
      <PanneauNotes
        cleNoteDeQuestion="q1"
        noteDeQuestion=""
        onNoteDeQuestion={() => undefined}
        ecriturePossible={false}
        motifLectureSeule="Cette session est validée : la saisie est verrouillée."
        cleBlocNotes="s1"
        notesGenerales=""
        onNotesGenerales={() => undefined}
        notesVolantes={[]}
        onCapturerNoteVolante={() => Promise.resolve(true)}
        reponseCouranteId={null}
        onRattacher={() => undefined}
        onDetacher={() => undefined}
        onSupprimer={() => undefined}
        fuseau="Europe/Paris"
      />,
    );
    expect(boutonsMuets()).toEqual([]);
  });
});
