// =============================================================================
// LE CHAMP « AJOUTER UNE PHOTO » — lot L6c-1 (ex-L5f).
//
// Un seul composant pour les deux endroits où l'auditeur ajoute une photo : la
// zone question (rattachée à la réponse courante, ou à la session seule si la
// question n'a pas encore de réponse — DECISIONS [L6c]) et le panneau de notes
// (rattachée à la session). Ce qu'il garantit :
//   · un vrai `<input type="file" accept="image/*" capture="environment">`,
//     ÉTIQUETÉ en français (le libellé visible EST l'étiquette) ;
//   · ses quatre états : prêt · enregistrement (`role="status"`) · échec
//     (`role="alert"`, jamais avalé) · désactivé avec son motif désigné
//     (`aria-describedby`, 03 §19.1 : jamais un cadenas muet) ;
//   · `onCapturer` rend `true` SI ET SEULEMENT SI la pièce est persistée — même
//     contrat que la note volante (bloquant B1 de la revue A29).
// Jetons du design system uniquement (invariant 4) : classes de `@axion/ui` et
// de `entretien.css`.
//
// Traçabilité : E13, E44, E6 · 03 §19.1, §29 R2, §33 · 05 §9.6.
// =============================================================================
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import { Message } from '@axion/ui';

const MESSAGE_ENREGISTREMENT = 'Enregistrement de la photo sur cet appareil…';
const MESSAGE_ECHEC =
  'La photo n’a pas pu être enregistrée sur cet appareil. Réessayez ; si le problème persiste, décrivez l’élément dans une note.';

export interface ProprietesChampPhoto {
  /** Le libellé visible, qui est aussi l'étiquette du champ (il contient « photo »). */
  readonly libelle: string;
  readonly desactive: boolean;
  /** L'identifiant du motif rendu par l'appelant quand le champ est désactivé. */
  readonly idMotif: string | null;
  /** `true` si et seulement si la photo est persistée sur l'appareil. */
  readonly onCapturer: (fichier: File) => Promise<boolean>;
}

type Etat = 'pret' | 'enregistrement' | 'echec';

export function ChampPhoto(proprietes: ProprietesChampPhoto): ReactNode {
  const { libelle, desactive, idMotif, onCapturer } = proprietes;
  const [etat, setEtat] = useState<Etat>('pret');
  const idChamp = `${useId()}-photo`;

  const choisir = (evenement: ChangeEvent<HTMLInputElement>): void => {
    const champ = evenement.target;
    const fichier = champ.files?.[0];
    // Annulation de la caméra : aucun fichier, aucun geste.
    if (fichier === undefined) return;
    // Le même fichier doit pouvoir être choisi à nouveau après un échec.
    champ.value = '';
    setEtat('enregistrement');
    onCapturer(fichier).then(
      (persistee) => {
        setEtat(persistee ? 'pret' : 'echec');
      },
      () => {
        setEtat('echec');
      },
    );
  };

  return (
    <div className="axn-photo">
      <label
        htmlFor={idChamp}
        className={`axn-bouton axn-bouton--discret axn-photo__declencheur${
          desactive ? ' axn-photo__declencheur--desactive' : ''
        }`}
      >
        {libelle}
        <input
          id={idChamp}
          className="axn-visuellement-masque"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={desactive || etat === 'enregistrement'}
          {...(desactive && idMotif !== null ? { 'aria-describedby': idMotif } : {})}
          onChange={choisir}
        />
      </label>
      {etat === 'enregistrement' && (
        <p role="status" className="axn-champ__aide">
          {MESSAGE_ENREGISTREMENT}
        </p>
      )}
      {etat === 'echec' && (
        <Message ton="alerte" titre="Photo non enregistrée">
          {MESSAGE_ECHEC}
        </Message>
      )}
    </div>
  );
}
