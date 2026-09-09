// =============================================================================
// LES POINTS À REVOIR — la destination du compteur cliquable (03 §34.2)
//
// ── POURQUOI CET ÉCRAN EXISTE ───────────────────────────────────────────────
// 03 §34.2 : « ses à-revoir en attente (**compteur cliquable par mission**) ».
// Le cockpit affichait le nombre ; il n'y avait rien derrière. Un nombre sans
// destination dit à l'auditeur qu'il a trois zones d'ombre et le laisse les
// chercher entretien par entretien — c'est-à-dire exactement la mémoire que
// §17.3 (« purger les zones d'ombre AVANT de partir ») refuse de lui demander.
//
// La destination n'est pas inventée ici : 03 M3 la nomme — « liste consolidée
// des “à revoir” (= la liste des zones d'ombre à éclaircir avant de partir) » —
// et §17.2 dit ce qu'on en fait : « cliquer sur un item incomplet amène
// directement à l'écran qui le résout ». Taper une ligne rouvre donc l'entretien
// SUR la question, par `session/position.ts`.
//
// ── LES QUATRE ÉTATS (03 §33.2) ─────────────────────────────────────────────
// chargement (squelettes) · vide (« aucun point à revoir » AVEC ce qu'il faut
// faire pour en poser un) · erreur (cause + action) · hors ligne (rappel des
// capacités locales — la liste se calcule ici, elle n'attend aucun réseau).
//
// ── LE ZÉRO NE MÈNE PAS ICI, ET C'EST DÉLIBÉRÉ ──────────────────────────────
// Le cockpit ne rend le compteur cliquable QUE s'il est non nul (voir
// `EcranAujourdhui`) : un lien qui ouvre une liste vide est un aller-retour
// gratuit en pleine journée. L'état vide de cet écran reste dû — on l'atteint en
// levant le dernier point alors qu'on y est déjà, ou par la reprise de
// navigation (`meta.vueCourante`) — et il dit alors ce qu'il faut faire.
//
// Traçabilité : E12 (entretiens par interlocuteur, à-revoir), E23 (hyper
// intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================
import { useCallback, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge, Bouton, RappelHorsLigne, ZoneEtat, type EtatZone } from '@axion/ui';
import {
  construireARevoir,
  lireMissionARevoir,
  memoriserMissionARevoir,
  type MissionARevoir,
  type PointARevoir,
} from '../../agenda/a-revoir.js';
import {
  CAPACITES_HORS_LIGNE,
  PASTILLE_PORTEE_PAR_LA_COQUILLE,
} from '../../app/capacites-hors-ligne.js';
import { useTerrain } from '../../app/contexte.js';
import { formaterDateHeure } from '../../session/fuseau.js';
import { useEnLigne } from '../../session/media.js';
import { memoriserQuestionCourante, memoriserSessionCourante } from '../../session/position.js';
import './journee.css';

/** Le total, toutes missions rendues confondues — l'état vide s'y règle. */
function total(listes: readonly MissionARevoir[] | null | undefined): number {
  return (listes ?? []).reduce((somme, liste) => somme + liste.points.length, 0);
}

/**
 * Une ligne : la question figée, la session où le point a été posé, son motif et
 * sa date AU FUSEAU DE LA MISSION (03 §22.2, invariant 5).
 *
 * La ligne entière est le bouton — cible tactile ≥ 44 px portée par
 * `axn-journee__session` (`journee.css`), la même que l'agenda et le cockpit.
 */
function LignePoint({
  point,
  fuseau,
  onOuvrir,
}: {
  readonly point: PointARevoir;
  readonly fuseau: string;
  readonly onOuvrir: (point: PointARevoir) => void;
}): ReactNode {
  const motif = point.motif === null || point.motif.trim() === '' ? null : point.motif;
  return (
    <li>
      <button
        type="button"
        className="axn-journee__session"
        onClick={() => {
          onOuvrir(point);
        }}
      >
        <span className="axn-journee__details">
          <span className="axn-journee__personne">{point.question}</span>
          <span className="axn-journee__contexte">
            {point.session} · signalé le {formaterDateHeure(point.poseLe, fuseau)}
          </span>
          <span className="axn-journee__contexte">
            {motif === null ? 'Aucun motif saisi' : `Motif : ${motif}`}
          </span>
        </span>
      </button>
    </li>
  );
}

export function EcranARevoir(): ReactNode {
  const { base, naviguer } = useTerrain();
  const enLigne = useEnLigne();

  // La mission tapée au cockpit. `undefined` = pas encore lue (chargement),
  // `null` = aucune mémorisée, et la liste porte alors TOUTES les missions
  // embarquées — un défaut lisible, jamais un écran vide.
  const missionChoisie = useLiveQuery(
    async (): Promise<string | null | undefined> =>
      base === null ? undefined : await lireMissionARevoir(base),
    [base],
    undefined,
  );

  const listes = useLiveQuery(
    async (): Promise<readonly MissionARevoir[] | null | undefined> => {
      if (base === null || missionChoisie === undefined) return undefined;
      try {
        return await construireARevoir(missionChoisie);
      } catch {
        // La cause technique ne remonte pas à l'écran (11 §2) : il dit la cause
        // MÉTIER et l'action, ce que §33.2 exige.
        return null;
      }
    },
    [base, missionChoisie],
    undefined,
  );

  /** §17.2 : l'item mène à l'écran qui le résout — l'entretien, SUR la question. */
  const ouvrir = useCallback(
    (point: PointARevoir): void => {
      if (base === null) return;
      void (async (): Promise<void> => {
        await memoriserSessionCourante(base, point.interviewId);
        await memoriserQuestionCourante(base, point.interviewId, point.missionQuestionId);
        naviguer({ type: 'aller', vue: 'entretien' });
      })();
    },
    [base, naviguer],
  );

  /** Retirer le filtre de mission : la liste redevient celle de l'appareil. */
  const toutesLesMissions = useCallback((): void => {
    if (base === null) return;
    void memoriserMissionARevoir(base, null);
  }, [base]);

  const filtree = missionChoisie !== null && missionChoisie !== undefined;

  const etat: EtatZone =
    listes === undefined
      ? { nature: 'chargement', libelle: 'Lecture des points à revoir', lignes: 4 }
      : listes === null
        ? {
            nature: 'erreur',
            titre: 'Les points à revoir n’ont pas pu être lus',
            cause: 'Les données locales de cet appareil n’ont pas pu être ouvertes.',
            action:
              'Rechargez la page, puis rouvrez cet écran. Rien n’a été modifié par cette lecture.',
          }
        : total(listes) === 0
          ? {
              nature: 'vide',
              titre: 'Aucun point à revoir',
              description:
                'Pendant un entretien, le bouton « À revoir » signale une zone d’ombre à éclaircir avant de quitter le site. Les points signalés se retrouvent tous ici.',
              actions: (
                <div className="axn-journee__actions">
                  <Bouton
                    onClick={() => {
                      naviguer({ type: 'racine', vue: 'aujourdhui' });
                    }}
                  >
                    Revenir à ma journée
                  </Bouton>
                  {filtree && (
                    <Bouton variante="secondaire" onClick={toutesLesMissions}>
                      Voir toutes les missions
                    </Bouton>
                  )}
                </div>
              ),
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <h1>Points à revoir</h1>

      <ZoneEtat etat={etat}>
        <>
          {(listes ?? []).map((liste) => (
            <div key={liste.mission.id} className="axn-journee__carte">
              <div className="axn-journee__entete-carte">
                <h2 className="axn-journee__titre-carte">{liste.mission.titre}</h2>
                <Badge ton="avertissement">{liste.points.length} point(s) à revoir</Badge>
              </div>
              <ul className="axn-journee__liste">
                {liste.points.map((point) => (
                  <LignePoint
                    key={point.reponseId}
                    point={point}
                    fuseau={liste.mission.timezone}
                    onOuvrir={ouvrir}
                  />
                ))}
              </ul>
            </div>
          ))}
          {filtree && (
            <div className="axn-journee__actions">
              <Bouton variante="secondaire" onClick={toutesLesMissions}>
                Voir toutes les missions
              </Bouton>
            </div>
          )}
        </>
      </ZoneEtat>

      {/* §33.2 — la seconde moitié de l'état hors ligne. Elle vaut d'être dite
          ici : cette liste ressemble à un rapport, et un auditeur sans réseau
          pourrait croire qu'elle attend le siège. Elle ne l'attend pas — elle est
          calculée sur les lignes de cet appareil (invariant 6 : le terrain
          compte SES propres lignes, il n'agrège rien). */}
      <RappelHorsLigne
        enLigne={enLigne}
        capacites={CAPACITES_HORS_LIGNE.aRevoir}
        avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}
      />
    </section>
  );
}
