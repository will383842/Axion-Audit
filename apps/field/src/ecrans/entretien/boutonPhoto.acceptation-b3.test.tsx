// =============================================================================
// TESTS D'ACCEPTATION — bloquant **B3**, moitié « ce que l'œil voit ».
// RÉVISÉS PAR A26 le 2026-10-09 (lot L6c-1), sur décision tracée
// (`DECISIONS.md` [L6c] : « La capture photo devient réelle : les acceptations
// B3 sont révisées par le testeur, jamais par l'auteur »).
// (La moitié « balayage des sources » vit dans `photo.acceptation-b3.test.ts`.)
//
// ── CE QUI A CHANGÉ, ET CE QUI NE CHANGE PAS ────────────────────────────────
// B3 (A27) tenait une promesse NON TENUE : tant que la capture n'existait pas,
// le bouton devait le dire à l'œil (« Photo (bientôt) », désactivé, motif au
// survol) pour que l'auditeur ne sorte pas son téléphone personnel. La capture
// existe désormais (chaîne photo absorbée par L6c-1) : le même principe — ce
// que l'écran montre est VRAI — exige maintenant l'inverse. Un bouton qui dit
// « bientôt » devant une capture qui marche est la même faute, retournée.
//
// Ce qui est exigé, rendu et lu au NŒUD (pas au texte source) :
//   · dans la zone question, un champ « Ajouter une photo » ACTIF :
//     `<input type="file" accept="image/*" capture="environment">`, étiqueté ;
//   · le geste est FONCTIONNEL : choisir un fichier appelle
//     `onAjouterPhoto(fichier)` — l'écran le rattache à la réponse courante ;
//   · ses états en français : `role="status"` pendant l'enregistrement,
//     `role="alert"` en cas d'échec ;
//   · écriture refusée : désactivé ET motif désigné (03 §19.1, jamais muet) ;
//   · écran partagé : absent (03 §33.3) — inchangé depuis A27 ;
//   · `MOTIF_PHOTO_INDISPONIBLE` et « (bientôt) » ont disparu.
//
// ── API ATTENDUE (ajout aux propriétés de `ZoneQuestion`) ───────────────────
//   readonly onAjouterPhoto: (fichier: File) => Promise<boolean>;
//     // `true` SI ET SEULEMENT SI la pièce est persistée (même contrat que
//     // `onCapturerNoteVolante`, bloquant B1 de la revue A29).
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif), E44 (§33.6).
// =============================================================================
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionLocale } from '../../local/depots/questions.js';
import * as moduleZoneQuestion from './ZoneQuestion.js';
import { ZoneQuestion } from './ZoneQuestion.js';

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

type Proprietes = ComponentProps<typeof ZoneQuestion>;

function rendreZoneQuestion(surcharges: Partial<Proprietes> = {}): void {
  const proprietes: Proprietes = {
    question: questionFictive(),
    rang: 1,
    total: 10,
    reponse: null,
    horsParcours: false,
    partage: false,
    ecritureRefusee: null,
    fourchette: false,
    onFourchette: () => undefined,
    onValeur: () => undefined,
    onDrapeau: () => undefined,
    onNote: () => undefined,
    onRecherche: () => undefined,
    onQuestionAdHoc: () => undefined,
    onPrecedent: () => undefined,
    onSuivant: () => undefined,
    onTerminer: () => undefined,
    libelleTerminer: 'Terminer l’entretien',
    peutPrecedent: false,
    peutSuivant: true,
    afficherRaccourcis: true,
    onAjouterPhoto: () => Promise.resolve(true),
    ...surcharges,
  };
  render(<ZoneQuestion {...proprietes} />);
}

/** Le champ « Ajouter une photo » tel qu'il est RENDU, ou `null`. */
function champPhoto(): HTMLInputElement | null {
  const trouve = screen.queryByLabelText(/ajouter une photo/i);
  return trouve instanceof HTMLInputElement ? trouve : null;
}

function champObligatoire(): HTMLInputElement {
  const champ = champPhoto();
  if (champ === null) throw new Error('champ « Ajouter une photo » absent');
  return champ;
}

function fichierImage(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'atelier.jpg', {
    type: 'image/jpeg',
  });
}

async function choisir(champ: HTMLInputElement, fichiers: File[]): Promise<void> {
  await act(async () => {
    fireEvent.change(champ, { target: { files: fichiers } });
    await Promise.resolve();
  });
}

describe('B3 révisé — « Ajouter une photo » est ACTIF, et ce que l’œil voit est vrai', () => {
  // `DECISIONS.md` [L6c] (2026-10-09) : une question SANS réponse garde le champ
  // actif ; la pièce sera rattachée à la session seule (testé dans
  // `session/photos-locales.test.ts`). Un « répondez d'abord » ferait perdre la
  // photo d'un poste qu'on observe avant d'avoir coté.
  it('@critique question SANS réponse : le champ est actif et le geste aboutit', async () => {
    const onAjouterPhoto = vi.fn(() => Promise.resolve(true));
    rendreZoneQuestion({ reponse: null, onAjouterPhoto });
    const champ = champObligatoire();
    expect(champ.disabled).toBe(false);
    await choisir(champ, [fichierImage()]);
    expect(onAjouterPhoto).toHaveBeenCalledTimes(1);
  });

  it('@critique anti-vacuité : le champ est rendu, ACTIF, image + caméra arrière', () => {
    rendreZoneQuestion();
    const champ = champObligatoire();
    expect(champ.type).toBe('file');
    expect(champ.disabled).toBe(false);
    expect(champ.getAttribute('accept')).toBe('image/*');
    expect(champ.getAttribute('capture')).toBe('environment');
  });

  it('@critique le libellé VISIBLE dit « Ajouter une photo » — plus aucun « (bientôt) »', () => {
    rendreZoneQuestion();
    expect(screen.getByText(/ajouter une photo/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bientôt/i);
    // Aucun reliquat : un bouton qui parle de photo n'est jamais grisé d'office.
    for (const bouton of screen.queryAllByRole('button')) {
      if (/photo/i.test(bouton.textContent)) {
        expect(bouton instanceof HTMLButtonElement && bouton.disabled).toBe(false);
      }
    }
  });

  it('@critique le geste est FONCTIONNEL : le fichier choisi part à `onAjouterPhoto`, une fois', async () => {
    const onAjouterPhoto = vi.fn(() => Promise.resolve(true));
    rendreZoneQuestion({ onAjouterPhoto });
    const fichier = fichierImage();
    await choisir(champObligatoire(), [fichier]);
    expect(onAjouterPhoto).toHaveBeenCalledTimes(1);
    expect(onAjouterPhoto).toHaveBeenCalledWith(fichier);
  });

  it('pendant l’enregistrement, un statut en français le dit', async () => {
    let resoudre: (v: boolean) => void = () => undefined;
    const enCours = new Promise<boolean>((ok) => {
      resoudre = ok;
    });
    rendreZoneQuestion({ onAjouterPhoto: () => enCours });
    await choisir(champObligatoire(), [fichierImage()]);
    expect(screen.getByRole('status').textContent).toMatch(/photo/i);
    await act(async () => {
      resoudre(true);
      await enCours;
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('@critique un échec est DIT, en français, jamais avalé', async () => {
    rendreZoneQuestion({ onAjouterPhoto: () => Promise.resolve(false) });
    await choisir(champObligatoire(), [fichierImage()]);
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/photo/i);
  });

  it('annulation de la caméra (aucun fichier) : rien n’est appelé', async () => {
    const onAjouterPhoto = vi.fn(() => Promise.resolve(true));
    rendreZoneQuestion({ onAjouterPhoto });
    await choisir(champObligatoire(), []);
    expect(onAjouterPhoto).not.toHaveBeenCalled();
  });

  it('@critique écriture refusée : désactivé, et le motif est désigné (03 §19.1)', () => {
    rendreZoneQuestion({
      ecritureRefusee: 'Cette session est validée : la saisie est verrouillée.',
    });
    const champ = champObligatoire();
    expect(champ.disabled).toBe(true);
    const idMotif = (champ.getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '';
    expect(idMotif).not.toBe('');
    expect(document.getElementById(idMotif)?.textContent).toBeTruthy();
  });

  it('@critique en mode ÉCRAN PARTAGÉ, le champ n’est pas rendu du tout', () => {
    rendreZoneQuestion({ partage: true });
    expect(champPhoto()).toBeNull();
    expect(screen.queryByText(/photo/i)).toBeNull();
  });

  it('@critique `MOTIF_PHOTO_INDISPONIBLE` n’existe plus : la capture n’est plus « indisponible »', () => {
    expect('MOTIF_PHOTO_INDISPONIBLE' in moduleZoneQuestion).toBe(false);
  });
});
