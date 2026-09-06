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
//
// ── LE REFUS EST UN FAIT D'AUDIT (doute de spec D-1, tranché le 2026-09-06) ──
// La recette novice A54 (§8-2) l'a nommé : « rien n'est prévu si l'interlocuteur
// REFUSE ; la case non cochée est un cul-de-sac muet ». Or un refus a une cause,
// il explique un trou dans les données, et 03 §17.3 pose la doctrine applicable
// — « terminer reste possible mais **l'état est tracé** ».
//
// Ce que cet écran fait, et ce qu'il NE fait PAS. Il offre une sortie nommée ;
// l'écran d'entretien écrit une NOTE horodatée sur la session, qui reste
// `non_demarre` et sans accord. Il ne touche NI le 04, NI le sens d'un champ
// d'index remonté au siège : la modélisation (`schedule_status='annule'`, ou un
// état dédié) est une fiche `AMELIORATIONS.md` d'étage 2, arbitrage Williams.
// Voir `DECISIONS.md`, 2026-09-06, « Que fait l'application quand l'interlocuteur
// REFUSE de participer ? ».
//
// Traçabilité : E33 (sécurité / RGPD — accord de participation horodaté), E12 (entretiens par interlocuteur).
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Bouton, CaseACocher, Message, ZoneNotes } from '@axion/ui';
import { VERSION_MENTION_INFORMATION } from '../../session/ecriture-session.js';

/** La phrase-script lue à l'interlocuteur (version `VERSION_MENTION_INFORMATION`). */
export const PHRASE_SCRIPT_ACCORD =
  'Cet entretien s’inscrit dans un audit commandé par votre entreprise. Vos réponses servent à établir un diagnostic ; ' +
  'elles sont consignées sous votre nom et votre fonction, conservées de façon sécurisée, et ne servent à aucune évaluation individuelle. ' +
  'Vous pouvez ne pas répondre à une question, ou demander qu’une information ne soit pas communiquée. Acceptez-vous de participer ?';

/**
 * Le préfixe qui rend un refus RETROUVABLE dans les notes d'une session.
 *
 * Exporté et unique : c'est ce que cherchera la fiche `AMELIORATIONS.md` le jour
 * où le refus recevra son propre état, et c'est ce que lit un auditeur qui
 * relit sa journée. Une phrase recopiée à deux endroits finit par dire deux
 * choses — c'est le défaut de la liste de capacités, déjà payé une fois.
 */
export const PREFIXE_REFUS_PARTICIPATION = 'REFUS DE PARTICIPATION';

/**
 * La note écrite sur la session quand l'interlocuteur refuse.
 *
 * `horodatageAffiche` est déjà formaté au FUSEAU DE MISSION par l'appelant
 * (invariant 5 : UTC en base, fuseau de mission à l'affichage). Cette fonction
 * ne connaît ni horloge ni fuseau — c'est ce qui la rend testable sans l'un ni
 * l'autre, et ce qui garantit qu'elle n'invente pas une heure locale.
 */
export function construireNoteDeRefus(motif: string, horodatageAffiche: string): string {
  const rapporte = motif.trim();
  return (
    `${PREFIXE_REFUS_PARTICIPATION} — ${horodatageAffiche}. ` +
    'L’interlocuteur n’a pas donné son accord de participation ; aucune question n’a été posée. ' +
    `Motif rapporté : ${rapporte === '' ? 'non précisé.' : rapporte}`
  );
}

export interface ProprietesDemarrageEntretien {
  readonly personName: string;
  readonly onDemarrer: (accord: boolean) => Promise<void>;
  /**
   * Trace le refus (D-1). Le motif peut être vide : un refus sans explication
   * reste un refus, et l'exiger reviendrait à rendre le refus impossible à
   * enregistrer — donc à le faire disparaître, ce que D-1 corrige.
   */
  readonly onRefus: (motif: string) => Promise<void>;
}

export function DemarrageEntretien(proprietes: ProprietesDemarrageEntretien): ReactNode {
  const { personName, onDemarrer, onRefus } = proprietes;
  const [accord, setAccord] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le volet de refus est-il ouvert ? Un refus ne se tape jamais par mégarde. */
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [motifRefus, setMotifRefus] = useState('');

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

  const refuser = (): void => {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    void onRefus(motifRefus)
      .catch((cause: unknown) => {
        setErreur(
          cause instanceof Error ? cause.message : 'Le refus n’a pas pu être enregistré ici.',
        );
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

      {erreur !== null && (
        <Message ton="alerte" titre={refusOuvert ? 'Refus non enregistré' : 'Démarrage impossible'}>
          {erreur}
        </Message>
      )}

      {refusOuvert ? (
        // ── D-1 : le refus s'écrit, il ne se devine pas ──────────────────────
        <>
          <Message ton="info" titre="L’interlocuteur refuse de participer">
            C’est un fait d’audit, pas une absence de donnée : il est écrit dans les notes de cette
            session, avec l’heure. L’entretien ne démarre pas, et aucune question n’est posée.
          </Message>
          <ZoneNotes
            libelle="Ce qui a motivé le refus (facultatif)"
            aide="Ce que l’interlocuteur a dit, dans ses termes. Un refus sans explication reste un refus."
            value={motifRefus}
            rows={3}
            onChange={(evenement) => {
              setMotifRefus(evenement.target.value);
            }}
          />
          <Bouton variante="secondaire" pleineLargeur chargement={enCours} onClick={refuser}>
            Enregistrer le refus et fermer l’entretien
          </Bouton>
          <Bouton
            variante="discret"
            pleineLargeur
            onClick={() => {
              setRefusOuvert(false);
              setErreur(null);
            }}
          >
            Revenir au démarrage
          </Bouton>
        </>
      ) : (
        <>
          <CaseACocher
            libelle="Accord de participation recueilli"
            checked={accord}
            onChange={(evenement) => {
              setAccord(evenement.target.checked);
            }}
          />
          {/* M1 (recette novice A54, 2026-09-06) : ce bouton était le deuxième des
              trois « boutons grisés muets » du parcours. Il reste grisé — l'accord
              est un fait d'audit horodaté, pas une case de confort — mais il DIT
              pourquoi, à l'œil comme au lecteur d'écran. 03 §19.1 : « précisément ce
              qui manque […] jamais un simple cadenas muet ». */}
          {!accord && (
            <p id="axn-demarrage-verrou" className="axn-champ__aide">
              Le bouton s’active dès que la case ci-dessus est cochée : l’accord de participation
              est enregistré et horodaté avec la session.
            </p>
          )}
          <Bouton
            taille="large"
            pleineLargeur
            chargement={enCours}
            disabled={!accord}
            {...(accord ? {} : { 'aria-describedby': 'axn-demarrage-verrou' })}
            onClick={demarrer}
          >
            Démarrer l’entretien
          </Bouton>
          <Bouton
            variante="discret"
            pleineLargeur
            onClick={() => {
              setRefusOuvert(true);
              setErreur(null);
            }}
          >
            L’interlocuteur refuse de participer
          </Bouton>
        </>
      )}
    </section>
  );
}
