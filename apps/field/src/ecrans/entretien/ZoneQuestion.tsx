// =============================================================================
// ZONE CENTRE — « UNE question à la fois, gros caractères, consigne consultant,
// zone de saisie adaptée au type, boutons Précédent/Suivant » (03 M3.1)
//
// La barre d'actions est celle du 03 §17.4, dans cet ordre et à ces places :
// Précédent · À revoir · N/A · Note · Photo · Recherche · Suivant (en bas à
// droite). « Non communiqué » (§27.4, sur TOUTE question) et « Fourchette »
// (§27.4, où la question l'admet) sont sur la question elle-même, à côté des
// états. Photo est L5c : le bouton garde sa place, désactivé, et le dit.
//
// PAS d'avancement automatique après cotation (V2.10) : coter n'est pas finir
// une question. L'avance est toujours volontaire — Suivant, ↵ ou balayage.
//
// En écran partagé (§33.3), cette zone ne montre QUE la question, la consigne,
// la saisie et Précédent/Suivant : ni drapeaux, ni motifs, ni badges internes.
// Traçabilité : E13 (écran 3 zones — question au centre), E23 (hyper intuitif, consigne consultant).
// =============================================================================
import type { ReactNode } from 'react';
import { lireAncresDeCotation } from '@axion/shared';
import { Badge, Bascule, Bouton, Message } from '@axion/ui';
import type { QuestionLocale } from '../../local/depots/questions.js';
import type { ReponseLocale } from '../../local/depots/reponses.js';
import { LIBELLE_MOTIF_NON_COMMUNIQUE } from '../../session/ecriture-reponses.js';
import { fourchetteAdmise, lireValeurTypee, type ValeurTypee } from '../../session/valeurs.js';
import type { NatureDrapeau } from './DialogueDrapeau.js';
import { SaisieReponse, type Cadence } from './SaisieReponse.js';
import { libelleDeBloc } from './ZoneBlocs.js';

export interface ProprietesZoneQuestion {
  readonly question: QuestionLocale;
  readonly rang: number;
  readonly total: number;
  readonly reponse: ReponseLocale | null;
  /** La question a été ouverte depuis la recherche (§25.4). */
  readonly horsParcours: boolean;
  readonly partage: boolean;
  /** Motif du refus d'écrire, ou `null` si la saisie est permise. */
  readonly ecritureRefusee: string | null;
  readonly fourchette: boolean;
  readonly onFourchette: (actif: boolean) => void;
  readonly onValeur: (valeur: ValeurTypee | null, cadence: Cadence) => void;
  readonly onDrapeau: (nature: NatureDrapeau) => void;
  readonly onNote: () => void;
  readonly onRecherche: () => void;
  readonly onQuestionAdHoc: () => void;
  readonly onPrecedent: () => void;
  readonly onSuivant: () => void;
  readonly peutPrecedent: boolean;
  readonly peutSuivant: boolean;
  readonly afficherRaccourcis: boolean;
}

export function ZoneQuestion(proprietes: ProprietesZoneQuestion): ReactNode {
  const {
    question,
    rang,
    total,
    reponse,
    horsParcours,
    partage,
    ecritureRefusee,
    fourchette,
    onFourchette,
    onValeur,
    onDrapeau,
    onNote,
    onRecherche,
    onQuestionAdHoc,
    onPrecedent,
    onSuivant,
    peutPrecedent,
    peutSuivant,
    afficherRaccourcis,
  } = proprietes;

  const valeur = lireValeurTypee(reponse?.value);
  const desactive = ecritureRefusee !== null;
  const aRevoir = reponse?.flagReview === 1;
  const sansObjet = reponse?.notApplicable === 1;
  const nonCommunique = reponse?.withheld === 1;
  const admetFourchette = fourchetteAdmise(question.answerType, question.allowRangeSnapshot);

  // La consigne à AFFICHER ici. Sur une échelle, les ancres sont déjà rendues
  // sous l'échelle par `EchelleAncree` : on ne montre que la PROSE, sinon
  // l'auditeur lit deux fois « 1 = … 5 = … » et cesse de lire. Sur les dix
  // autres types, la guidance n'a pas d'ancres à extraire, on la rend entière.
  // Le retrait est fait par le parseur du pack (`lireAncresDeCotation`), jamais
  // par un découpage local : un second découpage du même texte dériverait.
  const consigneAffichee =
    question.answerType === 'scale_1_5'
      ? lireAncresDeCotation(question.guidanceSnapshot).consigne
      : question.guidanceSnapshot;

  return (
    <article className="axn-question" aria-labelledby="axn-question-texte">
      <div className="axn-question__repere">
        <span>
          Question {rang} / {total}
        </span>
        <span>·</span>
        <span>{libelleDeBloc(question.blockCode)}</span>
        {!partage && question.addedAdHoc && <Badge ton="info">ad hoc</Badge>}
        {!partage && (horsParcours || reponse?.horsParcours === 1) && (
          <Badge ton="info">hors parcours</Badge>
        )}
        {!partage && reponse !== null && reponse.revision > 1 && (
          <Badge ton="neutre">révision {reponse.revision}</Badge>
        )}
      </div>

      <h2 id="axn-question-texte" className="axn-question__texte">
        {question.texteSnapshot}
      </h2>

      {/*
        LA CONSIGNE CONSULTANT — 03 M3.1 (« au centre »), 03 §17.5 (« la consigne
        porte le savoir-faire ; la banque de questions EST le manuel de formation »).

        Bloquant B2 de la revue A29 (2026-09-03). Cette ligne excluait `scale_1_5`
        pour ne pas afficher deux fois les ancres — que `EchelleAncree` rend déjà
        sous l'échelle. L'intention était juste ; l'effet ne l'était pas : sur le
        type de question LE PLUS FRÉQUENT d'un audit, la consigne n'apparaissait
        alors NULLE PART, et avec elle les relances et les pièges. C'est un coup
        direct au critère « novice autonome en moins de 30 minutes ».

        La composition retenue (DECISIONS.md du 2026-09-03) : les ancres restent
        SOUS l'échelle, où l'auditeur les lit en cotant ; la consigne reste ICI,
        à la même place pour les onze types — c'est cette constance de place qui
        sert le novice, plus qu'un placement optimal par type.
      */}
      {consigneAffichee !== null && <p className="axn-question__consigne">{consigneAffichee}</p>}

      {!partage && reponse !== null && (aRevoir || sansObjet || nonCommunique) && (
        <div className="axn-question__etats" aria-label="États de la réponse">
          {aRevoir && (
            <Badge ton="avertissement">
              À revoir{reponse.reviewReason === null ? '' : ` — ${reponse.reviewReason}`}
            </Badge>
          )}
          {sansObjet && (
            <Badge ton="neutre">
              Sans objet{reponse.naReason === null ? '' : ` — ${reponse.naReason}`}
            </Badge>
          )}
          {nonCommunique && (
            <Badge ton="info">
              Non communiqué
              {reponse.withheldReason === null
                ? ''
                : ` — ${LIBELLE_MOTIF_NON_COMMUNIQUE[reponse.withheldReason]}`}
            </Badge>
          )}
        </div>
      )}

      {ecritureRefusee !== null && (
        <Message ton="info" titre="Lecture seule">
          {ecritureRefusee}
        </Message>
      )}

      <div className="axn-question__saisie">
        {admetFourchette && !partage && (
          <Bascule
            libelle="Répondre en fourchette"
            actif={fourchette}
            disabled={desactive}
            onBasculer={onFourchette}
          />
        )}
        <SaisieReponse
          key={`${question.id}-${fourchette ? 'fourchette' : 'exact'}`}
          question={question}
          valeur={valeur}
          onChangement={onValeur}
          sansObjet={sansObjet}
          onSansObjet={() => {
            onDrapeau('sans_objet');
          }}
          fourchette={fourchette && admetFourchette}
          afficherRaccourcis={afficherRaccourcis && !partage}
          desactive={desactive}
        />
      </div>

      {!partage && (
        <div className="axn-question__etats">
          <Bouton
            variante={nonCommunique ? 'secondaire' : 'discret'}
            aria-pressed={nonCommunique}
            disabled={desactive}
            onClick={() => {
              onDrapeau('non_communique');
            }}
          >
            Non communiqué
          </Bouton>
          <Bouton variante="discret" disabled={desactive} onClick={onQuestionAdHoc}>
            Ajouter une question
          </Bouton>
        </div>
      )}

      <div className="axn-question__actions" role="toolbar" aria-label="Actions sur la question">
        <Bouton variante="secondaire" disabled={!peutPrecedent} onClick={onPrecedent}>
          Précédent
        </Bouton>
        {!partage && (
          <>
            <Bouton
              variante={aRevoir ? 'secondaire' : 'discret'}
              aria-pressed={aRevoir}
              disabled={desactive}
              onClick={() => {
                onDrapeau('a_revoir');
              }}
            >
              À revoir{afficherRaccourcis ? ' (R)' : ''}
            </Bouton>
            <Bouton
              variante={sansObjet ? 'secondaire' : 'discret'}
              aria-pressed={sansObjet}
              disabled={desactive}
              onClick={() => {
                onDrapeau('sans_objet');
              }}
            >
              N/A{afficherRaccourcis ? ' (A)' : ''}
            </Bouton>
            <Bouton variante="discret" disabled={desactive} onClick={onNote}>
              Note
            </Bouton>
            <Bouton
              variante="discret"
              disabled
              libelleAccessible="Photo — disponible dans une prochaine version"
            >
              Photo
            </Bouton>
            <Bouton variante="discret" onClick={onRecherche}>
              Recherche{afficherRaccourcis ? ' (/)' : ''}
            </Bouton>
          </>
        )}
        <Bouton
          className="axn-question__actions--suivant"
          variante="principal"
          disabled={!peutSuivant}
          onClick={onSuivant}
        >
          Suivant{afficherRaccourcis ? ' (↵)' : ''}
        </Bouton>
      </div>
    </article>
  );
}
