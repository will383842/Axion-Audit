// =============================================================================
// ZONE GAUCHE — « liste des blocs + progression (x/y répondues, dont « à
// revoir »), navigation directe » (03 M3.1)
//
// Les compteurs se lisent sur l'INDEX en clair des réponses (`flagReview`,
// `notApplicable`, `withheld`) — aucun déchiffrement pour dessiner la
// progression (`LOT_L5.md` §3.5 : le terrain compte SES lignes, et §3.2 rend ce
// comptage instantané). Le libellé d'un bloc n'est pas dans le snapshot local
// (référentiel siège) : on affiche son numéro, jamais un identifiant technique
// (03 §17.4).
//
// Cette zone est INTERNE : en écran partagé, l'écran ne la rend pas.
// =============================================================================
import type { ReactNode } from 'react';
import { AnneauProgression, Badge } from '@axion/ui';
import type { QuestionLocale } from '../../local/depots/questions.js';
import type { IndexAnswer } from '../../local/formes.js';

export interface BlocDeParcours {
  readonly code: string | null;
  readonly libelle: string;
  readonly questions: readonly QuestionLocale[];
}

/** « bloc_3 » → « Bloc 3 » ; un code inconnu s'affiche tel quel, sans soulignés. */
export function libelleDeBloc(code: string | null): string {
  if (code === null) return 'Hors bloc';
  const numero = /^bloc_(\d+)$/.exec(code);
  if (numero !== null) return `Bloc ${numero[1] ?? ''}`;
  return code.replace(/_/g, ' ');
}

/** Regroupe le questionnaire par bloc, dans l'ordre de parcours. */
export function regrouperParBloc(questions: readonly QuestionLocale[]): BlocDeParcours[] {
  const blocs = new Map<string | null, QuestionLocale[]>();
  for (const question of questions) {
    const liste = blocs.get(question.blockCode);
    if (liste === undefined) blocs.set(question.blockCode, [question]);
    else liste.push(question);
  }
  return [...blocs.entries()].map(([code, liste]) => ({
    code,
    libelle: libelleDeBloc(code),
    questions: liste,
  }));
}

export interface ProprietesZoneBlocs {
  readonly questions: readonly QuestionLocale[];
  /** Index en clair des réponses de la session (sans déchiffrement). */
  readonly reponses: readonly IndexAnswer[];
  readonly questionCouranteId: string | null;
  readonly onAller: (questionId: string) => void;
}

export function ZoneBlocs(proprietes: ProprietesZoneBlocs): ReactNode {
  const { questions, reponses, questionCouranteId, onAller } = proprietes;
  const parQuestion = new Map(reponses.map((reponse) => [reponse.missionQuestionId, reponse]));
  const blocs = regrouperParBloc(questions);

  const total = questions.length;
  const repondues = questions.filter((question) => parQuestion.has(question.id)).length;
  const aRevoir = reponses.filter((reponse) => reponse.flagReview === 1).length;
  const pourcentage = total === 0 ? 0 : Math.round((repondues / total) * 100);

  return (
    <nav className="axn-blocs" aria-label="Blocs du questionnaire">
      <div className="axn-blocs__entete">
        <AnneauProgression valeur={pourcentage} libelle="Avancement" taille="petit" />
        <div>
          <p className="axn-blocs__compte">
            {repondues} / {total} répondue(s)
          </p>
          {aRevoir > 0 && <Badge ton="avertissement">{aRevoir} à revoir</Badge>}
        </div>
      </div>

      <ul className="axn-blocs__liste">
        {blocs.map((bloc) => {
          const courant = bloc.questions.some((question) => question.id === questionCouranteId);
          const repondu = bloc.questions.filter((question) => parQuestion.has(question.id)).length;
          const aRevoirBloc = bloc.questions.filter(
            (question) => parQuestion.get(question.id)?.flagReview === 1,
          ).length;
          return (
            <li key={bloc.code ?? 'hors-bloc'}>
              <details
                className={`axn-blocs__bloc${courant ? ' axn-blocs__bloc--courant' : ''}`}
                open={courant}
              >
                <summary>
                  <span>{bloc.libelle}</span>
                  <span className="axn-blocs__compte">
                    {repondu}/{bloc.questions.length}
                    {aRevoirBloc > 0 ? ` · ${String(aRevoirBloc)} à revoir` : ''}
                  </span>
                </summary>
                <ul className="axn-blocs__questions">
                  {bloc.questions.map((question, rang) => {
                    const reponse = parQuestion.get(question.id);
                    return (
                      <li key={question.id}>
                        <button
                          type="button"
                          className="axn-blocs__question"
                          aria-current={question.id === questionCouranteId ? 'true' : undefined}
                          onClick={() => {
                            onAller(question.id);
                          }}
                        >
                          <span className="axn-blocs__libelle">
                            {String(rang + 1)}. {question.texteSnapshot}
                          </span>
                          <span className="axn-blocs__marque">
                            {marqueDeReponse(reponse, question.addedAdHoc)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Un mot, jamais une couleur seule (03 §33.6). */
function marqueDeReponse(reponse: IndexAnswer | undefined, adHoc: boolean): string {
  const marques: string[] = [];
  if (adHoc) marques.push('ad hoc');
  if (reponse === undefined) return marques.join(' · ');
  if (reponse.flagReview === 1) marques.push('à revoir');
  if (reponse.notApplicable === 1) marques.push('sans objet');
  if (reponse.withheld === 1) marques.push('non communiqué');
  if (reponse.horsParcours === 1) marques.push('hors parcours');
  if (marques.length === 0) marques.push('répondu');
  return marques.join(' · ');
}
