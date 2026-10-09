// =============================================================================
// TESTS DE LA CAPTURE PHOTO DEPUIS LE PANNEAU DE NOTES — lot L6c-1 (ex-L5f).
// ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 03 §29 R2 (photo compressée avant stockage
// local), 03 §19.1 (« jamais un simple cadenas muet » : un geste refusé dit
// pourquoi), 03 §33 (interface 100 % en français) et 05 §9.6.
//
// ── API ATTENDUE (ajout à `ProprietesPanneauNotes`) ─────────────────────────
//   readonly onCapturerPhoto: (fichier: File) => Promise<boolean>;
//     // même contrat que `onCapturerNoteVolante` (bloquant B1 de la revue A29) :
//     // `true` SI ET SEULEMENT SI la pièce est persistée — l'appelant branche
//     // `creerPhotoLocale` (session/photos-locales.ts).
// Le panneau rend un `<input type="file" accept="image/*" capture="environment">`
// ÉTIQUETÉ en français (le libellé contient « photo »), et deux états :
//   · pendant l'enregistrement : un `role="status"` qui le dit (« … photo … ») ;
//   · en cas d'échec (`false` ou exception) : un `role="alert"` en français.
// Écriture refusée (`ecriturePossible={false}`) : le champ est désactivé.
//
// NB pour l'auteur : le balayage B3 (`photo.acceptation-b3.test.ts`) refuse
// « Prendre … photo », « Photographier … », « Joindre une photo ». Un libellé
// comme « Ajouter une photo » passe ; la révision de B3 relève d'une décision.
//
// Rouge attendu tant que le champ n'existe pas — pour cette seule raison.
// Traçabilité : E13 (écran 3 zones), E44, E6.
// =============================================================================
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanneauNotes, type ProprietesPanneauNotes } from './PanneauNotes.js';

function rendre(surcharges: Partial<ProprietesPanneauNotes> = {}) {
  const proprietes: ProprietesPanneauNotes = {
    cleNoteDeQuestion: 'q1',
    noteDeQuestion: '',
    onNoteDeQuestion: () => undefined,
    ecriturePossible: true,
    cleBlocNotes: 's1',
    notesGenerales: '',
    onNotesGenerales: () => undefined,
    notesVolantes: [],
    onCapturerNoteVolante: () => Promise.resolve(true),
    onCapturerPhoto: () => Promise.resolve(true),
    reponseCouranteId: null,
    onRattacher: () => undefined,
    onDetacher: () => undefined,
    onSupprimer: () => undefined,
    fuseau: 'Europe/Paris',
    ...surcharges,
  };
  return render(<PanneauNotes {...proprietes} />);
}

function champPhoto(): HTMLInputElement {
  const champ = screen.getByLabelText(/photo/i);
  if (!(champ instanceof HTMLInputElement)) throw new Error('le champ photo n’est pas un <input>');
  return champ;
}

function fichierImage(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'atelier.jpg', {
    type: 'image/jpeg',
  });
}

/** Une promesse dont on tient la résolution. */
function promesseTenue<T>() {
  let resoudre: (v: T) => void = () => undefined;
  let rejeter: (e: unknown) => void = () => undefined;
  const promesse = new Promise<T>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

describe('PanneauNotes — champ de capture photo', () => {
  it('@critique un champ fichier image, caméra arrière, étiqueté en français', () => {
    rendre();
    const champ = champPhoto();
    expect(champ.type).toBe('file');
    expect(champ.getAttribute('accept')).toBe('image/*');
    expect(champ.getAttribute('capture')).toBe('environment');
    expect(champ.disabled).toBe(false);
  });

  it('@critique choisir un fichier appelle `onCapturerPhoto` avec CE fichier, une fois', async () => {
    const onCapturerPhoto = vi.fn(() => Promise.resolve(true));
    rendre({ onCapturerPhoto });
    const fichier = fichierImage();
    await act(async () => {
      fireEvent.change(champPhoto(), { target: { files: [fichier] } });
      await Promise.resolve();
    });
    expect(onCapturerPhoto).toHaveBeenCalledTimes(1);
    expect(onCapturerPhoto).toHaveBeenCalledWith(fichier);
  });

  it('@critique pendant l’enregistrement, un statut le dit ; il disparaît au succès, sans alerte', async () => {
    const tenue = promesseTenue<boolean>();
    rendre({ onCapturerPhoto: () => tenue.promesse });
    await act(async () => {
      fireEvent.change(champPhoto(), { target: { files: [fichierImage()] } });
      await Promise.resolve();
    });
    const statut = screen.getByRole('status');
    expect(statut.textContent).toMatch(/photo/i);
    expect(statut.textContent).toMatch(/enregistr/i);

    await act(async () => {
      tenue.resoudre(true);
      await tenue.promesse;
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/enregistrement de la photo/i)).toBeNull();
  });

  it('@critique un échec (`false`) affiche une alerte en français qui nomme la photo', async () => {
    rendre({ onCapturerPhoto: () => Promise.resolve(false) });
    await act(async () => {
      fireEvent.change(champPhoto(), { target: { files: [fichierImage()] } });
      await Promise.resolve();
    });
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/photo/i);
    expect(alerte.textContent).toMatch(/pas pu|impossible|échec|n’a pas|n'a pas/i);
  });

  it('une exception de l’appelant est traduite en alerte, jamais avalée', async () => {
    rendre({
      onCapturerPhoto: () => Promise.reject(new Error('Ce fichier n’est pas une image.')),
    });
    await act(async () => {
      fireEvent.change(champPhoto(), { target: { files: [fichierImage()] } });
      await Promise.resolve();
    });
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/[a-zéèàù]/i);
  });

  it('aucun fichier choisi (annulation de la caméra) : rien n’est appelé', async () => {
    const onCapturerPhoto = vi.fn(() => Promise.resolve(true));
    rendre({ onCapturerPhoto });
    await act(async () => {
      fireEvent.change(champPhoto(), { target: { files: [] } });
      await Promise.resolve();
    });
    expect(onCapturerPhoto).not.toHaveBeenCalled();
  });

  it('écriture refusée : le champ est désactivé et dit pourquoi', () => {
    rendre({
      ecriturePossible: false,
      motifLectureSeule: 'Cette session est validée : la saisie est verrouillée.',
    });
    const champ = champPhoto();
    expect(champ.disabled).toBe(true);
    expect(champ.getAttribute('aria-describedby')).toBeTruthy();
  });
});
