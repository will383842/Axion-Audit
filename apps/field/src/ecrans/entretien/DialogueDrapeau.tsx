// =============================================================================
// LES TROIS DRAPEAUX QUI DEMANDENT UN MOT — à revoir (motif facultatif, 03
// M3.1), sans objet (« avec motif », 03 M3.1), non communiqué (motif dans une
// liste FERMÉE + note, 03 §27.4)
//
// Une seule fenêtre, trois natures. Ce sont des ÉTATS explicites (invariant 7 :
// « l'à-revoir et le NA sont des états explicites, pas des absences »), et
// chacun se retire d'un geste — on ne « supprime » pas un drapeau, on le lève.
// =============================================================================
import { useId, useState, type ReactNode } from 'react';
import { Bouton, Dialogue, IconeCoche, ZoneNotes } from '@axion/ui';
import { MOTIFS_NON_COMMUNIQUE } from '../../local/formes.js';
import {
  LIBELLE_MOTIF_NON_COMMUNIQUE,
  type MotifNonCommunique,
} from '../../session/ecriture-reponses.js';

export type NatureDrapeau = 'a_revoir' | 'sans_objet' | 'non_communique';

export interface DecisionDrapeau {
  readonly nature: NatureDrapeau;
  /** `true` = poser le drapeau ; `false` = le lever. */
  readonly pose: boolean;
  readonly motif: string | null;
  readonly motifNonCommunique: MotifNonCommunique | null;
}

export interface ProprietesDialogueDrapeau {
  readonly nature: NatureDrapeau | null;
  /** Le drapeau est-il DÉJÀ posé sur la réponse courante ? */
  readonly dejaPose: boolean;
  readonly motifActuel: string | null;
  readonly motifNonCommuniqueActuel: MotifNonCommunique | null;
  readonly onDecider: (decision: DecisionDrapeau) => void;
  readonly onFermer: () => void;
}

const TITRES: Record<NatureDrapeau, string> = {
  a_revoir: 'Marquer « à revoir »',
  sans_objet: 'Marquer « sans objet »',
  non_communique: 'Marquer « non communiqué »',
};

const DESCRIPTIONS: Record<NatureDrapeau, string> = {
  a_revoir: 'Une zone d’ombre à éclaircir avant de partir. Le motif est facultatif.',
  sans_objet: 'La question ne s’applique pas à cet interlocuteur. Dites pourquoi.',
  non_communique:
    'L’information a été demandée et n’a pas été obtenue. Ce n’est pas une anomalie : la question sort du calcul, sans pénalité, et le rapport le mentionne dans « Limites et réserves ».',
};

export function DialogueDrapeau(proprietes: ProprietesDialogueDrapeau): ReactNode {
  const { nature, dejaPose, motifActuel, motifNonCommuniqueActuel, onDecider, onFermer } =
    proprietes;
  const [motif, setMotif] = useState(motifActuel ?? '');
  const [motifNc, setMotifNc] = useState<MotifNonCommunique | null>(motifNonCommuniqueActuel);
  const nomGroupe = useId();

  if (nature === null) return null;

  const confirmer = (): void => {
    onDecider({
      nature,
      pose: true,
      motif: motif.trim() === '' ? null : motif.trim(),
      motifNonCommunique: nature === 'non_communique' ? motifNc : null,
    });
  };

  const peutConfirmer = nature !== 'non_communique' || motifNc !== null;

  return (
    <Dialogue
      ouvert
      titre={TITRES[nature]}
      description={DESCRIPTIONS[nature]}
      onFermer={onFermer}
      actions={
        <>
          {dejaPose && (
            <Bouton
              variante="secondaire"
              onClick={() => {
                onDecider({ nature, pose: false, motif: null, motifNonCommunique: null });
              }}
            >
              Lever ce marquage
            </Bouton>
          )}
          <Bouton variante="discret" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton variante="principal" disabled={!peutConfirmer} onClick={confirmer}>
            {dejaPose ? 'Mettre à jour' : 'Confirmer'}
          </Bouton>
        </>
      }
    >
      {nature === 'non_communique' && (
        <fieldset className="axn-choix">
          <legend className="axn-choix__intitule">Motif</legend>
          <div className="axn-choix__pistes">
            {MOTIFS_NON_COMMUNIQUE.map((code) => (
              <label key={code} className="axn-choix__option">
                <input
                  className="axn-visuellement-masque"
                  type="radio"
                  name={nomGroupe}
                  value={code}
                  checked={motifNc === code}
                  onChange={() => {
                    setMotifNc(code);
                  }}
                />
                <span>{LIBELLE_MOTIF_NON_COMMUNIQUE[code]}</span>
                {motifNc === code && <IconeCoche className="axn-choix__marque" />}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <ZoneNotes
        libelle={nature === 'a_revoir' ? 'Motif (facultatif)' : 'Précision'}
        value={motif}
        rows={3}
        autoFocus={nature !== 'non_communique'}
        onChange={(evenement) => {
          setMotif(evenement.target.value);
        }}
      />
    </Dialogue>
  );
}
