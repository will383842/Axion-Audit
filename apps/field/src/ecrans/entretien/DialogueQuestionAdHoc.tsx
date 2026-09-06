// =============================================================================
// AJOUT D'UNE QUESTION AD HOC — 03 M3.1 (« ajout de question ad hoc »), 11 §4
//
// Trois champs : le texte, le type de réponse (les onze), une consigne
// facultative — et les options quand le type en veut. La création est UNE op
// (`session/questions-adhoc.ts`) ; l'écran enchaîne directement sur la question
// créée, pour y répondre pendant que l'interlocuteur parle.
// Traçabilité : E13 (écran 3 zones — question ad hoc), E23 (hyper intuitif).
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Bouton, ChampTexte, Dialogue, Message, Selection, ZoneNotes } from '@axion/ui';
import { TYPES_DE_REPONSE, type TypeDeReponse } from '@axion/shared';
import { LIBELLE_TYPE_DE_REPONSE } from '../../session/valeurs.js';

export interface SaisieQuestionAdHoc {
  readonly texte: string;
  readonly answerType: TypeDeReponse;
  readonly guidance: string | null;
  readonly options: readonly string[];
}

export interface ProprietesDialogueQuestionAdHoc {
  readonly ouvert: boolean;
  readonly onCreer: (saisie: SaisieQuestionAdHoc) => Promise<void>;
  readonly onFermer: () => void;
}

const OPTIONS_TYPES = TYPES_DE_REPONSE.map((type) => ({
  valeur: type,
  libelle: LIBELLE_TYPE_DE_REPONSE[type],
}));

function estTypeDeReponse(valeur: string): valeur is TypeDeReponse {
  return (TYPES_DE_REPONSE as readonly string[]).includes(valeur);
}

export function DialogueQuestionAdHoc(proprietes: ProprietesDialogueQuestionAdHoc): ReactNode {
  const { ouvert, onCreer, onFermer } = proprietes;
  const [texte, setTexte] = useState('');
  const [type, setType] = useState<TypeDeReponse>('free_text');
  const [guidance, setGuidance] = useState('');
  const [options, setOptions] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const aDesOptions = type === 'single_choice' || type === 'multi_choice';

  const creer = (): void => {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    void onCreer({
      texte,
      answerType: type,
      guidance: guidance.trim() === '' ? null : guidance,
      options: options.split(/\r?\n/),
    })
      .then(() => {
        setTexte('');
        setGuidance('');
        setOptions('');
        setType('free_text');
      })
      .catch((cause: unknown) => {
        setErreur(cause instanceof Error ? cause.message : 'La question n’a pas pu être créée.');
      })
      .finally(() => {
        setEnCours(false);
      });
  };

  return (
    <Dialogue
      ouvert={ouvert}
      titre="Ajouter une question"
      description="Une question posée sur le moment. Elle rejoint le questionnaire de cette mission, sans barème : elle alimente le rapport, pas le score."
      onFermer={onFermer}
      actions={
        <>
          <Bouton variante="discret" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton
            variante="principal"
            chargement={enCours}
            disabled={texte.trim() === ''}
            onClick={creer}
          >
            Créer et y répondre
          </Bouton>
        </>
      }
    >
      {erreur !== null && (
        <Message ton="alerte" titre="Question non créée">
          {erreur}
        </Message>
      )}
      <ZoneNotes
        libelle="Question"
        obligatoire
        value={texte}
        rows={3}
        autoFocus
        onChange={(evenement) => {
          setTexte(evenement.target.value);
        }}
      />
      <Selection
        libelle="Type de réponse"
        options={OPTIONS_TYPES}
        value={type}
        onChange={(evenement) => {
          const choisi = evenement.target.value;
          if (estTypeDeReponse(choisi)) setType(choisi);
        }}
      />
      {aDesOptions && (
        <ZoneNotes
          libelle="Options (une par ligne, au moins deux)"
          value={options}
          rows={4}
          onChange={(evenement) => {
            setOptions(evenement.target.value);
          }}
        />
      )}
      <ChampTexte
        libelle="Consigne (facultative)"
        value={guidance}
        {...(type === 'scale_1_5'
          ? { aide: 'Pour une échelle, écrivez les ancres : « 1 = … · 3 = … · 5 = … ».' }
          : {})}
        onChange={(evenement) => {
          setGuidance(evenement.target.value);
        }}
      />
    </Dialogue>
  );
}
