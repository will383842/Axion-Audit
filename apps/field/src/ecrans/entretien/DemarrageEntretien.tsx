// =============================================================================
// DÉMARRAGE D'UNE SESSION — 03 M3.2 V2.10 : « case sur l'écran de démarrage de
// session […], libellé "Accord de participation" et non "consentement" (la base
// RGPD de la collecte est l'intérêt légitime), avec une phrase-script fournie
// que l'auditeur lit à l'interlocuteur ; horodatée. »
//
// C'est la SEULE étape humaine restante entre l'ouverture et la première
// question. Le pack dit la phrase « fournie » sans en donner le texte : celui
// ci-dessous est une rédaction NEUTRE, sans nom de client, versionnée `v1`
// (`VERSION_MENTION_INFORMATION`) — à faire valider par Williams, signalé au
// rapport A22. La version est enregistrée sur la session (06 §10.4).
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Bouton, CaseACocher, Message } from '@axion/ui';
import { VERSION_MENTION_INFORMATION } from '../../session/ecriture-session.js';

/** La phrase-script lue à l'interlocuteur (version `VERSION_MENTION_INFORMATION`). */
export const PHRASE_SCRIPT_ACCORD =
  'Cet entretien s’inscrit dans un audit commandé par votre entreprise. Vos réponses servent à établir un diagnostic ; ' +
  'elles sont consignées sous votre nom et votre fonction, conservées de façon sécurisée, et ne servent à aucune évaluation individuelle. ' +
  'Vous pouvez ne pas répondre à une question, ou demander qu’une information ne soit pas communiquée. Acceptez-vous de participer ?';

export interface ProprietesDemarrageEntretien {
  readonly personName: string;
  readonly onDemarrer: (accord: boolean) => Promise<void>;
}

export function DemarrageEntretien(proprietes: ProprietesDemarrageEntretien): ReactNode {
  const { personName, onDemarrer } = proprietes;
  const [accord, setAccord] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const demarrer = (): void => {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    void onDemarrer(accord)
      .catch((cause: unknown) => {
        setErreur(cause instanceof Error ? cause.message : 'Le démarrage a échoué.');
      })
      .finally(() => {
        setEnCours(false);
      });
  };

  return (
    <section className="axn-question axn-pile" aria-labelledby="axn-demarrage-titre">
      <h2 id="axn-demarrage-titre">Avant la première question</h2>
      <p>
        À lire à {personName} (mention d’information {VERSION_MENTION_INFORMATION}) :
      </p>
      <blockquote className="axn-question__consigne">{PHRASE_SCRIPT_ACCORD}</blockquote>
      <CaseACocher
        libelle="Accord de participation recueilli"
        checked={accord}
        onChange={(evenement) => {
          setAccord(evenement.target.checked);
        }}
      />
      {erreur !== null && (
        <Message ton="alerte" titre="Démarrage impossible">
          {erreur}
        </Message>
      )}
      <Bouton
        taille="large"
        pleineLargeur
        chargement={enCours}
        disabled={!accord}
        onClick={demarrer}
      >
        Démarrer l’entretien
      </Bouton>
    </section>
  );
}
