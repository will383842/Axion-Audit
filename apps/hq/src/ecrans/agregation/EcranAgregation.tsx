// =============================================================================
// ÉCRAN AGRÉGATION PAR QUESTION — 03 M5.1, §27.1 (provenance), §27.4 (refus).
// Lot L7, incrément L7b.
//
// ── LES DEUX CHOSES QUI DOIVENT SE VOIR, ET QUI SE VOIENT ───────────────────
//   1. LA PROVENANCE de chaque réponse (`answers.source`, cinq valeurs). Le §27.2
//      en dépend : « tout finding s'appuie sur au moins une source tracée,
//      idéalement deux de types différents ». Un rapport qui ne sait pas d'où
//      vient une réponse ne peut pas écrire cette phrase ;
//   2. LE « NON COMMUNIQUÉ » (§27.4), avec SON MOTIF, et **distinct** du
//      « sans objet » et du « à revoir ». Un refus confondu avec une absence de
//      réponse serait un défaut de FOND, pas d'affichage : l'auditeur ne pourrait
//      plus distinguer ce qu'on a refusé de lui dire de ce qu'il n'a pas demandé.
//      C'est de cette distinction que sort la rubrique « Limites et réserves ».
//
// ── QUATRE SITUATIONS, QUATRE RENDUS DISTINCTS ──────────────────────────────
// « renseignée », « non communiquée », « sans objet », « jamais posée ». La
// quatrième est celle qu'on oublie : une question sans AUCUNE ligne. Elle a ici
// sa propre phrase — « personne ne l'a posée » — et n'est pas rendue comme une
// liste vide, qui se confondrait avec un chargement.
//
// ── LE TYPE DE SESSION N'EST PAS LA PROVENANCE ──────────────────────────────
// `interviews.kind` (6 valeurs, dont `atelier`) et `answers.source` (5 valeurs,
// dont `document` et `releve`) sont DEUX vocabulaires. Les deux sont affichés,
// côte à côte et nommés différemment : c'est leur comparaison qui a de la valeur
// (§27.6), et les fondre la supprimerait.
//
// ── AUCUN NOM DE PERSONNE ───────────────────────────────────────────────────
// Le contrat ne porte ni `personName` ni `personEmail` : l'écran affiche la
// FONCTION et le SERVICE du répondant, et son UNITÉ. Voir `agregation.ts` du
// contrat partagé et l'entrée `DECISIONS.md` du 2026-09-05.
//
// ── AUCUN MONTANT HORS ADMIN ────────────────────────────────────────────────
// Les valeurs affichées sont des RÉPONSES D'AUDIT (`answers.value`), la matière
// que le consultant a lui-même collectée sur le terrain. Rien de
// `scoping_financials` ni de `scoping_estimates` n'entre dans ce contrat, ni
// directement ni par agrégat (invariant 3).
//
// Traçabilité : E14 (consolidation, divergences, radar) · E12 (entretiens par
// interlocuteur, à-revoir) · E22 (console de pilotage 7 espaces) · E32 (fuseaux,
// devises, interface française).
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Badge, Bouton, Selection, ZoneEtat } from '@axion/ui';
import {
  LIBELLES_MOTIF_NON_COMMUNIQUE,
  LIBELLES_PROVENANCE_REPONSE,
  type AgregationMission,
  type QuestionAgregee,
  type ReponseAgregee,
} from '../../api/contrats.js';
import {
  FILTRE_AGREGATION_VIDE,
  useAgregation,
  type FiltreAgregationUi,
} from '../../api/requetes-pilotage.js';
import { useMission } from '../../api/requetes.js';
import { etatDeRequete } from '../../app/etats.js';
import { CadreTableau } from '../../app/CadreTableau.js';
import { auClicLienInterne, hrefDeRoute } from '../../app/routeur.js';
import { formaterInstant } from '../../format/dates.js';

/** Le TYPE de session en français — distinct de la provenance, et jamais fondu. */
const LIBELLES_TYPE_SESSION: Record<string, string> = {
  entretien: 'entretien',
  observation: 'observation',
  demonstration: 'démonstration',
  analyse_documentaire: 'analyse documentaire',
  releve_donnees: 'relevé de données',
  atelier: 'atelier',
};

/**
 * L'état d'une réponse, en UN badge — et il y en a trois, jamais deux.
 *
 * L'ordre de priorité est celui du §27.4 : un refus prime sur un « sans objet »
 * (on a demandé, donc la question se posait), et « à revoir » est transverse — il
 * s'affiche EN PLUS, jamais À LA PLACE.
 */
function EtatReponse({ reponse }: { reponse: ReponseAgregee }): ReactNode {
  return (
    <>
      {reponse.nonCommunique && (
        <Badge ton="avertissement">
          non communiqué
          {reponse.motifNonCommunique === null
            ? ''
            : ` · ${LIBELLES_MOTIF_NON_COMMUNIQUE[reponse.motifNonCommunique].toLowerCase()}`}
        </Badge>
      )}
      {reponse.sansObjet && <Badge ton="neutre">sans objet</Badge>}
      {reponse.aRevoir && <Badge ton="info">à revoir</Badge>}
      {reponse.horsParcours && <Badge ton="neutre">hors parcours</Badge>}
      {reponse.revision > 1 && <Badge ton="neutre">révision {reponse.revision}</Badge>}
    </>
  );
}

function LigneReponse({ reponse, timezone }: { reponse: ReponseAgregee; timezone: string }) {
  return (
    <tr>
      <td className="axn-tableau__principal">
        {reponse.orgUnitNom}
        {!reponse.orgUnitInScope && <Badge ton="neutre">hors périmètre</Badge>}
      </td>
      <td>{reponse.fonctionRepondant ?? '—'}</td>
      <td>{reponse.serviceRepondant ?? '—'}</td>
      <td>{LIBELLES_TYPE_SESSION[reponse.sessionKind] ?? reponse.sessionKind}</td>
      <td>{LIBELLES_PROVENANCE_REPONSE[reponse.provenance]}</td>
      <td className="axn-agregation__valeur">
        {reponse.valeurLisible ?? <span className="axn-agregation__sans-valeur">—</span>}
        {reponse.motifSansObjet !== null && ` (${reponse.motifSansObjet})`}
        {reponse.motifARevoir !== null && ` (${reponse.motifARevoir})`}
      </td>
      <td>
        <EtatReponse reponse={reponse} />
      </td>
      <td>{formaterInstant(reponse.misAJourLe, timezone)}</td>
    </tr>
  );
}

/** Une question et toutes ses réponses côte à côte — c'est la définition de M5.1. */
function BlocQuestion({
  question,
  timezone,
}: {
  question: QuestionAgregee;
  timezone: string;
}): ReactNode {
  const { comptes } = question;
  return (
    <article className="axn-agregation__question">
      <header>
        <h2>{question.texte}</h2>
        <p className="axn-agregation__meta">
          {question.blocLibelle}
          {question.criticite === null ? '' : ` · criticité ${question.criticite}`}
          {question.sourceAttendue === null
            ? ''
            : ` · source attendue : ${LIBELLES_PROVENANCE_REPONSE[question.sourceAttendue].toLowerCase()}`}
        </p>
        <p className="axn-agregation__comptes">
          {comptes.posee} réponse{comptes.posee > 1 ? 's' : ''} · {comptes.renseignees} renseignée
          {comptes.renseignees > 1 ? 's' : ''} · {comptes.nonCommuniquees} non communiquée
          {comptes.nonCommuniquees > 1 ? 's' : ''} · {comptes.sansObjet} sans objet ·{' '}
          {comptes.aRevoir} à revoir · {comptes.unitesTouchees} unité
          {comptes.unitesTouchees > 1 ? 's' : ''}
        </p>
      </header>
      {question.reponses.length === 0 ? (
        // LE QUATRIÈME CAS — et il a sa phrase, parce qu'une liste vide se
        // confondrait avec un chargement ou avec un refus (§27.4).
        <p className="axn-agregation__jamais-posee">
          Aucune réponse à ce jour : cette question n’a été posée dans aucune session de la mission.
          Ce n’est ni un refus, ni un «&nbsp;sans objet&nbsp;».
        </p>
      ) : (
        <CadreTableau libelle={`Réponses à la question : ${question.texte}`}>
          <table className="axn-tableau">
            <caption className="axn-visuellement-masque">
              Réponses à la question «&nbsp;{question.texte}&nbsp;»
            </caption>
            <thead>
              <tr>
                <th scope="col">Unité</th>
                <th scope="col">Fonction</th>
                <th scope="col">Service</th>
                <th scope="col">Type de session</th>
                <th scope="col">Provenance</th>
                <th scope="col">Réponse</th>
                <th scope="col">État</th>
                <th scope="col">Mise à jour (heure de mission)</th>
              </tr>
            </thead>
            <tbody>
              {question.reponses.map((reponse) => (
                <LigneReponse key={reponse.answerId} reponse={reponse} timezone={timezone} />
              ))}
            </tbody>
          </table>
        </CadreTableau>
      )}
    </article>
  );
}

/** Le bandeau de totaux — mission entière, filtres appliqués, jamais la page. */
function Totaux({ agregation }: { agregation: AgregationMission }): ReactNode {
  const { totaux } = agregation;
  return (
    <dl className="axn-fiche">
      <div>
        <dt>Questions du questionnaire figé</dt>
        <dd>{totaux.questions}</dd>
      </div>
      <div>
        <dt>Jamais posées</dt>
        <dd>{totaux.questionsSansReponse}</dd>
      </div>
      <div>
        <dt>Réponses collectées</dt>
        <dd>{totaux.reponses}</dd>
      </div>
      <div>
        <dt>Non communiquées</dt>
        <dd>{totaux.nonCommuniquees}</dd>
      </div>
      <div>
        <dt>Sans objet</dt>
        <dd>{totaux.sansObjet}</dd>
      </div>
      <div>
        <dt>À revoir</dt>
        <dd>{totaux.aRevoir}</dd>
      </div>
      <div>
        <dt>Par provenance</dt>
        <dd>
          {totaux.parProvenance
            .map((p) => `${LIBELLES_PROVENANCE_REPONSE[p.provenance]} ${String(p.nombre)}`)
            .join(' · ')}
        </dd>
      </div>
    </dl>
  );
}

export function EcranAgregation({ id }: { id: string }): ReactNode {
  const [filtre, setFiltre] = useState<FiltreAgregationUi>(FILTRE_AGREGATION_VIDE);
  const mission = useMission(id);
  const requete = useAgregation(id, filtre);
  const pages = requete.data?.pages ?? [];
  const premiere = pages[0];
  const questions = pages.flatMap((page) => page.questions);
  const timezone = mission.data?.timezone ?? premiere?.timezone ?? 'UTC';

  const retourMission = (
    <a
      href={hrefDeRoute({ type: 'mission', id })}
      onClick={auClicLienInterne({ type: 'mission', id })}
    >
      Retour à la mission
    </a>
  );

  const etat = etatDeRequete(
    { enAttente: requete.isPending, erreur: requete.error, vide: questions.length === 0 },
    {
      vide: {
        titre:
          filtre.block === null
            ? 'Aucune donnée collectée à ce jour'
            : 'Aucune question dans ce bloc',
        description:
          filtre.block === null
            ? 'Le questionnaire de cette mission n’est pas encore figé, ou il ne porte aucune question. Figez-le depuis la préparation de la mission : l’agrégation se remplira au fil des synchronisations du terrain.'
            : 'Ce bloc ne porte aucune question dans le questionnaire figé de cette mission. Choisissez un autre bloc, ou revenez à tous les blocs.',
        actions:
          filtre.block === null ? (
            retourMission
          ) : (
            <Bouton
              variante="secondaire"
              onClick={() => {
                setFiltre(FILTRE_AGREGATION_VIDE);
              }}
            >
              Voir tous les blocs
            </Bouton>
          ),
      },
      actions: (
        <Bouton variante="secondaire" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      ),
      actionsIntrouvable: retourMission,
      chargement: { lignes: 10, libelle: 'Chargement de l’agrégation' },
    },
  );

  return (
    <section className="axn-pile" aria-labelledby="titre-agregation">
      <div className="axn-entete-ecran">
        <h1 id="titre-agregation">Agrégation par question</h1>
        {questions.length > 0 && (
          <span className="axn-entete-ecran__compteur">
            {questions.length} question{questions.length > 1 ? 's' : ''} affichée
            {questions.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p>
        Toutes les réponses d’une question côte à côte, avec <strong>leur provenance</strong> et le
        statut «&nbsp;non communiqué&nbsp;» rendu visible — distinct du «&nbsp;sans objet&nbsp;» et
        du «&nbsp;à revoir&nbsp;».
      </p>
      {premiere !== undefined && premiere.blocs.length > 0 && (
        <div className="axn-agregation__filtres">
          <Selection
            libelle="Bloc"
            value={filtre.block ?? ''}
            options={[
              { valeur: '', libelle: 'Tous les blocs' },
              ...premiere.blocs.map((bloc) => ({ valeur: bloc.code, libelle: bloc.libelle })),
            ]}
            onChange={(evenement) => {
              const valeur = evenement.target.value;
              setFiltre((precedent) => ({ ...precedent, block: valeur === '' ? null : valeur }));
            }}
          />
        </div>
      )}
      <ZoneEtat etat={etat}>
        <div className="axn-pile">
          {premiere !== undefined && <Totaux agregation={premiere} />}
          {questions.map((question) => (
            <BlocQuestion
              key={question.missionQuestionId}
              question={question}
              timezone={timezone}
            />
          ))}
          {requete.hasNextPage && (
            <div className="axn-tableau__pied">
              <Bouton
                variante="secondaire"
                chargement={requete.isFetchingNextPage}
                onClick={() => void requete.fetchNextPage()}
              >
                Charger la suite
              </Bouton>
            </div>
          )}
        </div>
      </ZoneEtat>
    </section>
  );
}
