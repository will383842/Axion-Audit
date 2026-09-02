// =============================================================================
// ROUTES DES SESSIONS DE COLLECTE — la SEULE de ce lot : la réaffectation §34.4.
// Lot L3, incrément L3d, tâche T6.
//
//   PATCH /v1/interviews/:id/reassign   05 §24.2 — route LISTÉE, aucune entrée
//                                       `DECISIONS.md` de création n'est requise.
//
// Le reste du cycle de vie d'une session (création, planification, validation,
// réponses) appartient au terrain et à la sync — lots L5 et L6. Ce fichier ne
// portera donc qu'une route tant que ces lots ne sont pas ouverts, et c'est
// volontaire : la réaffectation est un geste de SIÈGE (§34.4, runbook de sortie
// d'un auditeur), pas un geste de terrain.
//
// ── LA POLITIQUE EST EN DEUX COUCHES, ET C'EST ASSUMÉ ───────────────────────
// `roles: ['admin','consultant']` dit QUI ENTRE ; « lead de CETTE mission » se
// vérifie DANS LE SERVICE, parce que « lead » n'est pas un rôle global mais une
// ligne de `mission_users` — et que `PolitiqueAcces` est une union exclusive qu'A01
// a refusé d'élargir (`DECISIONS.md` 2026-08-29). Conséquence écrite plutôt que
// découverte : cette garde n'est PAS couverte par la vérification de totalité du
// démarrage, elle se teste explicitement (consultant membre non lead → 403 ;
// consultant hors mission → 404).
//
// ── CETTE ROUTE NE DÉCIDE RIEN ──────────────────────────────────────────────
// Ni l'état de la session, ni l'habilitation du destinataire, ni la trace : tout
// vit dans le service. Ici : valider l'I/O, appeler, projeter.
//
// Traçabilité : E33 (sécurité / RGPD : habilitation §34.4, aucune donnée
// personnelle rendue ni journalisée) · E25 (zéro oubli : le plan et les
// affectations tiennent parce que les sessions suivent leur auditeur) · E43
// (exécutabilité autopilote : conventions d'API).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  interviewParamsSchema,
  interviewReassignRequestSchema,
  interviewReassignResponseSchema,
  type InterviewReassignResponse,
} from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import {
  reaffecterUneSession,
  type ResultatReaffectation,
} from '../domaines/assignments/service.js';

/** Voir l'en-tête : la moitié « rôle global » d'une décision en deux couches. */
const CONFIG_REASSIGN = { acces: { type: 'roles', roles: ['admin', 'consultant'] } } as const;

/**
 * La réponse d'une réaffectation : des IDENTIFIANTS et deux états.
 *
 * ⚠ **Aucune donnée personnelle** — ni `personName`, ni `personEmail`, ni les notes
 * de la session. Le `strictObject` du sérialiseur en fait une garantie mécanique :
 * un champ ajouté par mégarde au service ne traverserait pas (11 §2).
 *
 * `conductedByAvant` est rendu parce que c'est ce que l'appelant ne peut PLUS lire
 * après coup, et c'est le cœur de la trace §34.4 : la session change de mains, la
 * mémoire du changement reste.
 */
function versReponse(resultat: ResultatReaffectation): InterviewReassignResponse {
  return {
    id: resultat.session.id,
    missionId: resultat.session.missionId,
    orgUnitId: resultat.session.orgUnitId,
    conductedByAvant: resultat.conductedByAvant,
    conductedByApres: resultat.conductedByApres,
    status: resultat.session.status,
    scheduleStatus: resultat.session.scheduleStatus,
    updatedAt: resultat.session.updatedAt.toISOString(),
  };
}

export const routesInterviews: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * L'utilisateur qui agit. Ceinture d'exécution : le crochet a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — une ligne d'`activity_log` dont l'auteur est deviné vaut moins que pas
   * de ligne du tout : elle accuse quelqu'un.
   */
  function auteur(utilisateur: UtilisateurAuthentifie | null): UtilisateurAuthentifie {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return utilisateur;
  }

  /**
   * `PATCH /v1/interviews/:id/reassign {newUserId, motif}` — §34.4.
   *
   * `PATCH` est le verbe du 05 §24.2, et il est juste : on change UN champ
   * (`conducted_by`), pas l'état de la session — `schedule_status` et `status` ne
   * bougent pas, et le nouvel auditeur « récupère la session à son prochain pull ».
   *
   * **`motif` est obligatoire, et c'est un CODE** de `MOTIFS_REAFFECTATION`
   * (arbitrage Williams du 2026-09-02, « motif codé ») : absent OU hors
   * vocabulaire, le schéma le refuse en `400 VALIDATION_FAILED` avant d'atteindre
   * le service. La valeur codée, elle, va jusque dans `activity_log.meta` : la
   * ceinture technique du journal l'accepte par construction, et l'escalade « le
   * texte du motif n'est écrit nulle part » est close.
   *
   * ⚠ **UNE SESSION SANS AUDITEUR SE RÉAFFECTE**, et c'est une PREMIÈRE
   * AFFECTATION : `conducted_by` est nullable depuis l'amendement du 04 du
   * 2026-09-02, le plan §32.4 produit des sessions planifiées sans auditeur, et
   * cette route est aujourd'hui la seule porte qui en pose un (arbitrage A01 du
   * 2026-09-02). `conductedByAvant` vaut alors `null` dans la réponse comme dans
   * `activity_log` ; le refus `deja_proprietaire` ne s'applique évidemment pas.
   *
   * Refus possibles : `404` session inconnue **ou** demandeur hors mission ·
   * `403` consultant membre non lead, destinataire hors mission, compte désactivé,
   * `NOT_HABILITATED` destinataire non habilité · `409` session `en_cours` ou
   * `termine` (« les sessions réalisées restent à leur auteur »), ou destinataire
   * déjà propriétaire.
   */
  instance.patch(
    '/interviews/:id/reassign',
    {
      config: CONFIG_REASSIGN,
      schema: {
        params: interviewParamsSchema,
        body: interviewReassignRequestSchema,
        response: { 200: interviewReassignResponseSchema },
      },
    },
    async (requete) => {
      const utilisateur = auteur(requete.utilisateur);
      const resultat = await reaffecterUneSession(
        { id: utilisateur.id, role: utilisateur.role },
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponse(resultat);
    },
  );

  await Promise.resolve();
};
