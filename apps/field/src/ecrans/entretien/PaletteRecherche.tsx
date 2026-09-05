// =============================================================================
// RECHERCHE HORS-PARCOURS — 03 §25.4, §33.3 (« le champ hors-parcours sert de
// palette de saut »)
//
// « En entretien : recherche plein texte dans TOUTES les questions figées de la
// mission (locale, hors ligne). » Le dépôt du socle fait la recherche sur
// l'index `motsCles` ; ce panneau ne fait que taper et choisir. Le bouton
// « Recherche » est VISIBLE dans la barre d'actions (V2.10 : « le raccourci /
// est un accélérateur PC, jamais le seul accès »).
//
// Les quatre états (03 §33.2) : vide avant frappe (dit quoi faire), chargement
// pendant la recherche, erreur si le dépôt lève, nominal avec les résultats.
//
// Le focus : `Panneau` (design system, figé) pose le focus sur son PREMIER
// élément focalisable à l'ouverture — son bouton de fermeture — et son effet
// court APRÈS ceux de ses enfants, donc après un `autoFocus`. La palette
// reprend donc le focus pour son champ juste après le montage, en différé :
// « / » doit mettre l'auditeur en train de taper, pas sur « Fermer ».
// Traçabilité : E13 (écran 3 zones, enregistrement continu — la recherche
// hors-parcours §25.4 s’ouvre depuis la question courante), E6 (hors ligne total).
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChampTexte, Panneau, ZoneEtat, type EtatZone } from '@axion/ui';
import { depotQuestions, type ResultatRecherche } from '../../local/depots/questions.js';
import { libelleDeBloc } from './ZoneBlocs.js';

export interface ProprietesPaletteRecherche {
  readonly ouvert: boolean;
  readonly missionId: string;
  readonly onChoisir: (questionId: string) => void;
  readonly onFermer: () => void;
}

export function PaletteRecherche(proprietes: ProprietesPaletteRecherche): ReactNode {
  const { ouvert, missionId, onChoisir, onFermer } = proprietes;
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<readonly ResultatRecherche[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const zoneChamp = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const minuterie = window.setTimeout(() => {
      zoneChamp.current?.querySelector('input')?.focus();
    }, 0);
    return () => {
      window.clearTimeout(minuterie);
    };
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) {
      setTexte('');
      setResultats(null);
      setErreur(null);
      return;
    }
    if (texte.trim() === '') {
      setResultats(null);
      return;
    }
    let vivant = true;
    setEnCours(true);
    depotQuestions
      .rechercher(texte, missionId)
      .then((trouves) => {
        if (vivant) {
          setResultats(trouves);
          setErreur(null);
        }
      })
      .catch((cause: unknown) => {
        if (vivant) {
          setErreur(
            cause instanceof Error
              ? cause.message
              : 'La recherche dans le questionnaire a échoué sur cet appareil.',
          );
        }
      })
      .finally(() => {
        if (vivant) setEnCours(false);
      });
    return () => {
      vivant = false;
    };
  }, [ouvert, texte, missionId]);

  const etat: EtatZone =
    erreur !== null
      ? {
          nature: 'erreur',
          cause: erreur,
          action:
            'Reformulez votre recherche. Si cela persiste, verrouillez puis déverrouillez l’application.',
        }
      : texte.trim() === ''
        ? {
            nature: 'vide',
            titre: 'Tapez un ou deux mots',
            description:
              'La recherche parcourt toutes les questions figées de la mission, sans réseau. Choisir une question l’ouvre hors parcours, sur cet entretien.',
          }
        : enCours && resultats === null
          ? { nature: 'chargement', libelle: 'Recherche dans le questionnaire', lignes: 4 }
          : resultats !== null && resultats.length === 0
            ? {
                nature: 'vide',
                titre: 'Aucune question ne correspond',
                description:
                  'Essayez un mot plus court ou un synonyme. Si la question n’existe pas, ajoutez-la comme question ad hoc.',
              }
            : { nature: 'nominal' };

  return (
    <Panneau
      ouvert={ouvert}
      titre="Rechercher une question"
      description="Hors parcours — la réponse sera enregistrée sur cet entretien, avec son badge."
      position="cote"
      onFermer={onFermer}
    >
      <div ref={zoneChamp}>
        <ChampTexte
          libelle="Mots de la question"
          nature="recherche"
          value={texte}
          autoComplete="off"
          onChange={(evenement) => {
            setTexte(evenement.target.value);
          }}
        />
      </div>
      <ZoneEtat etat={etat}>
        <ul className="axn-recherche__resultats" aria-label="Questions trouvées">
          {(resultats ?? []).map((resultat) => (
            <li key={resultat.question.id}>
              <button
                type="button"
                className="axn-recherche__resultat"
                onClick={() => {
                  onChoisir(resultat.question.id);
                }}
              >
                <span className="axn-blocs__marque">
                  {libelleDeBloc(resultat.question.blockCode)}
                  {resultat.question.addedAdHoc ? ' · ad hoc' : ''}
                </span>
                <span>{resultat.question.texteSnapshot}</span>
              </button>
            </li>
          ))}
        </ul>
      </ZoneEtat>
    </Panneau>
  );
}
