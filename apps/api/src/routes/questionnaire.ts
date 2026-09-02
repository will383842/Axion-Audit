// =============================================================================
// ROUTES DU QUESTIONNAIRE ET DU PLAN D'ENTRETIENS. Lot L3, incrément L3d, T6.
//
//   GET  /v1/missions/:id/questionnaire-preview    §33.4 — prévisualisation
//   POST /v1/missions/:id/generate-questionnaire   M2   — figeage (201)
//   GET  /v1/missions/:id/interview-plan           §32.4 — plan d'entretiens
//
// Les trois vivent dans le même fichier parce que le découpage du lot les met
// ensemble (brief L3D §2, tâche T6 : « routes questionnaire + plan ») et parce
// qu'elles répondent à la même question sous deux angles : **ce que cette mission
// va demander sur le terrain**, en questions et en sessions.
//
// ── LES TROIS CHEMINS, ET D'OÙ ILS VIENNENT ─────────────────────────────────
// `generate-questionnaire` est listée au 05 §8.3. Les deux autres ne le sont pas :
// elles sont documentées par `DECISIONS.md` du 2026-08-29 (11 §8-6, « créer une
// route non listée aux §8/§24.2 sans la documenter »). ⚠ La note de conception L3
// §2 porte encore l'ancien chemin `POST …/questionnaire/preview` : c'est la
// DÉCISION qui fait foi, et elle a renommé la route en `GET …/questionnaire-preview`
// — une prévisualisation n'écrit rien, elle n'a rien à faire en `POST`.
//
// ── CES ROUTES NE DÉCIDENT RIEN ─────────────────────────────────────────────
// Aucun statut de mission, aucun filtre, aucune règle d'échantillonnage n'apparaît
// ici : la sélection vit dans une fonction PURE (`assembleur.ts`), le dimensionnement
// dans une autre (`generateur.ts`), et les refus dans les services. Ces fonctions
// traduisent une entrée validée en appel de service, et laissent l'`AppError`
// remonter au gestionnaire global (`erreurs.ts`), qui lui donne son statut HTTP.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — son ABSENCE empêcherait l'API de DÉMARRER
//     (`auth/politique.ts`, crochet `onRoute`) ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE importés de `packages/shared` (11 §3),
//     en forme déclarative. **Aucun `.parse()` manuel.**
//
// ── PAS DE MARQUE `financier` ───────────────────────────────────────────────
// Aucune de ces routes ne touche une table financière, et le plan d'entretiens **ne
// lit pas `scoping_estimates`** : il dit combien d'entretiens, jamais combien ils
// coûtent (§18.3 — « l'auditeur ne voit jamais le TJM », invariant 3).
//
// Traçabilité : E39 (machine à états mission : le figeage n'est ouvert qu'en
// préparation et conditionne le passage en collecte) · E25 (zéro oubli : plan
// d'entretiens, couverture) · E40 (règles d'échantillonnage du §32.4) · E30
// (3 niveaux d'audit) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  missionParamsSchema,
  planEntretiensSchema,
  questionnaireFreezeRequestSchema,
  questionnaireFreezeResponseSchema,
  questionnairePreviewResponseSchema,
  type PlanEntretiensApi,
  type QuestionnaireFreezeResponse,
  type QuestionnairePreviewResponse,
} from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { SortieAssemblage } from '../domaines/questionnaire/assembleur.js';
import {
  figerLeQuestionnaire,
  previsualiserQuestionnaire,
  type ResultatFigeage,
} from '../domaines/questionnaire/service.js';
import type { PlanEntretiens } from '../domaines/plan-entretiens/generateur.js';
import { etablirLePlanDEntretiens } from '../domaines/plan-entretiens/service.js';

/**
 * ADMIN SEUL sur le questionnaire — §34.1, « la console est ADMIN SEUL » en V1.
 *
 * Figer un questionnaire est l'acte qui referme la préparation d'une mission ; le
 * prévisualiser, c'est lire ce que la banque produirait. Ni l'un ni l'autre n'a de
 * sens sur la PWA terrain, qui reçoit le questionnaire DÉJÀ figé par la sync.
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * LE PLAN EST CADRÉ PAR MISSION, ET SURTOUT PAS `admin` SEUL — §18.3.
 *
 * Le plan d'entretiens est l'outil de l'auditeur sur le terrain : le réserver aux
 * administrateurs le rendrait invisible à ceux qui l'exécutent. `type: 'mission'`
 * dit l'intention ; le crochet vérifie l'identité, et **le dépôt** joint
 * `mission_users` (`auth/politique.ts` : la politique « dit QUI ENTRE, pas CE QUE
 * LE SQL RAMÈNE »). Un non-membre reçoit `404` — l'existence de la mission n'est
 * pas divulguée (`DECISIONS.md` 2026-09-02) ; l'admin, lui, voit le plan de toute
 * mission, membre ou non, parce que la console est la sienne.
 */
const CONFIG_MISSION = { acces: { type: 'mission', parametreMission: 'id' } } as const;

/** Rôle global qui ouvre TOUTES les missions à la lecture (§34.1). */
const ROLE_ADMIN = 'admin';

/**
 * Traduit l'assemblage en réponse de prévisualisation — projection EXPLICITE.
 *
 * Ce qui n'est PAS publié, et pourquoi : `entonnoir`, `premierFiltreVidant` et
 * `servicesDuPerimetre` sont des outils de DIAGNOSTIC du service (ils nourrissent
 * le message qui refuse de figer une sélection vide). Les publier ferait entrer
 * dans le contrat d'API une information dont personne n'a défini l'usage, et qu'on
 * ne pourrait plus retirer. `parProfil.questionIds` non plus — voir
 * `parcoursInterlocuteurSchema`.
 *
 * Les `[...]` ne sont pas décoratifs : la fonction pure rend des tableaux en
 * LECTURE SEULE, et le contrat d'API des tableaux ordinaires. Recopier est la seule
 * conversion honnête ; un `as` ferait passer une garantie pour une autre.
 */
function versPrevisualisation(assemblage: SortieAssemblage): QuestionnairePreviewResponse {
  return {
    total: assemblage.total,
    questions: assemblage.questions.map((question) => ({
      position: question.position,
      capture: {
        questionId: question.capture.questionId,
        questionVersion: question.capture.questionVersion,
        textSnapshot: question.capture.textSnapshot,
        guidanceSnapshot: question.capture.guidanceSnapshot,
        answerTypeSnapshot: question.capture.answerTypeSnapshot,
        optionsSnapshot: question.capture.optionsSnapshot,
        weightSnapshot: question.capture.weightSnapshot,
        scoringSnapshot: question.capture.scoringSnapshot,
        criticalitySnapshot: question.capture.criticalitySnapshot,
        allowRangeSnapshot: question.capture.allowRangeSnapshot,
        addedAdHoc: question.capture.addedAdHoc,
      },
      routage: {
        questionCode: question.routage.questionCode,
        blocId: question.routage.blocId,
        blocCode: question.routage.blocCode,
        blocPosition: question.routage.blocPosition,
        profils: [...question.routage.profils],
        servicesCibles: [...question.routage.servicesCibles],
        secteurs: [...question.routage.secteurs],
        niveaux: [...question.routage.niveaux],
        geo: question.routage.geo,
        effectifMin: question.routage.effectifMin,
        effectifMax: question.routage.effectifMax,
        sourceAttendue: question.routage.sourceAttendue,
        conditionAffichage: question.routage.conditionAffichage,
      },
    })),
    parBloc: assemblage.parBloc.map((bloc) => ({
      blocId: bloc.blocId,
      blocCode: bloc.blocCode,
      blocPosition: bloc.blocPosition,
      total: bloc.total,
    })),
    parInterlocuteur: assemblage.parProfil.map((parcours) => ({
      profilCode: parcours.profilCode,
      groupCode: parcours.groupCode,
      total: parcours.total,
    })),
    avertissements: assemblage.avertissements.map((avertissement) => ({
      code: avertissement.code,
      message: avertissement.message,
    })),
  };
}

/** La réponse du figeage : ce qui a été écrit, et comment il se répartit. */
function versReponseFigeage(resultat: ResultatFigeage): QuestionnaireFreezeResponse {
  return {
    total: resultat.total,
    parBloc: resultat.parBloc.map((bloc) => ({
      blocId: bloc.blocId,
      blocCode: bloc.blocCode,
      blocPosition: bloc.blocPosition,
      total: bloc.total,
    })),
  };
}

/**
 * Le plan, projeté sur SON CONTRAT — celui du brief L3D §5, pas la forme interne
 * du générateur (arbitrage A01 du 2026-09-02).
 *
 * ── LES TROIS TRADUCTIONS QUE CETTE FONCTION FAIT, ET POURQUOI ──────────────
 *  1. **`parUnite` devient `unites[]`**, réduit aux six clés du brief. Le nom de
 *     l'unité, son parent et la règle appliquée ne disparaissent pas : ils restent
 *     lisibles dans `sessions[]` et `reglesAppliquees[]`. Une donnée publiée à deux
 *     endroits finit par y différer ;
 *  2. **`{kind, nombre}` devient `{kind, min, max}`** partout où il s'agit d'une
 *     EXIGENCE de règle : le §32.4 chiffre « 1 observation » et ne chiffre rien
 *     au-delà de 200, donc `min = max = nombre` aujourd'hui. Le DÉCOMPTE de
 *     `totaux.parKind`, lui, reste un nombre — ce n'est pas une règle, c'est une
 *     somme ;
 *  3. **`profilsACouvrir` devient `profils`**, une liste de CODES sans aucun
 *     chiffre. La preuve négative est structurelle : le contrat ne porte nulle part
 *     de répartition par profil.
 *
 * `totalEntretiens` est calculé ICI, depuis `unites[]`, et non recopié de
 * `plan.totaux.entretiens` : le testeur vérifie qu'il EST la somme des unités. Le
 * générateur calcule déjà la même chose — mais un total recopié d'ailleurs peut
 * diverger de la liste qu'il prétend résumer, alors qu'un total dérivé ne le peut
 * pas. Les deux valeurs restent publiées et doivent coïncider ; si elles cessaient
 * de coïncider, ce serait un défaut du générateur, rendu VISIBLE plutôt que masqué.
 */
function versReponsePlan(plan: PlanEntretiens): PlanEntretiensApi {
  const unites = plan.parUnite.map((cible) => ({
    orgUnitId: cible.orgUnitId,
    /** Le `headcount` BRUT, `null` s'il est absent ou inexploitable. */
    effectif: cible.effectif,
    effectifInconnu: cible.effectifInconnu,
    entretiens: { min: cible.entretiens.min, max: cible.entretiens.max },
    sessionsComplementaires: cible.sessionsComplementaires.map((session) => ({
      kind: session.kind,
      min: session.nombre,
      max: session.nombre,
    })),
    profils: cible.profilsACouvrir.map((profil) => profil.code),
  }));

  const totalEntretiens = unites.reduce(
    (cumul, unite) => ({
      min: cumul.min + unite.entretiens.min,
      max: cumul.max + unite.entretiens.max,
    }),
    { min: 0, max: 0 },
  );

  return {
    missionId: plan.missionId,
    niveauAudit: plan.niveauAudit,
    genereLe: plan.genereLe,
    unites,
    totalEntretiens,
    sessions: plan.sessions.map((session) => ({
      rang: session.rang,
      rangDansUnite: session.rangDansUnite,
      orgUnitId: session.orgUnitId,
      orgUnitNom: session.orgUnitNom,
      kind: session.kind,
      mode: session.mode,
      regle: session.regle,
      justification: session.justification,
    })),
    reglesAppliquees: plan.reglesAppliquees.map((application) => ({
      regle: application.regle,
      libelle: application.libelle,
      effectifMin: application.effectifMin,
      effectifMax: application.effectifMax,
      nMinimalEntretiens: application.nMinimalEntretiens,
      nMaximalEntretiens: application.nMaximalEntretiens,
      sessionsComplementaires: application.sessionsComplementaires.map((session) => ({
        kind: session.kind,
        min: session.nombre,
        max: session.nombre,
      })),
      unitesConcernees: application.unitesConcernees,
      entretiensProposes: application.entretiensProposes,
      sessionsComplementairesProposees: application.sessionsComplementairesProposees,
    })),
    totaux: {
      unitesRetenues: plan.totaux.unitesRetenues,
      unitesEcartees: plan.totaux.unitesEcartees,
      entretiens: { min: plan.totaux.entretiens.min, max: plan.totaux.entretiens.max },
      sessionsProposees: plan.totaux.sessionsProposees,
      parKind: plan.totaux.parKind.map((session) => ({
        kind: session.kind,
        nombre: session.nombre,
      })),
    },
    // `{ code, message }`, sans les `orgUnitIds` du générateur : le contrat du
    // brief s'arrête là, et les unités concernées sont déjà dans `unites[]` (une
    // unité à effectif inconnu y porte son propre `effectifInconnu`). Publier une
    // seconde liste d'identifiants inviterait à la lire au lieu de lire les unités.
    avertissements: plan.avertissements.map((avertissement) => ({
      code: avertissement.code,
      message: avertissement.message,
    })),
  };
}

export const routesQuestionnaire: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * L'utilisateur qui agit.
   *
   * Ceinture d'exécution : sur une route `roles` ou `mission`, le crochet a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — on ne fabrique pas un demandeur. Un cadrage d'accès calculé sur un
   * utilisateur deviné ne serait pas un cadrage.
   */
  function demandeur(utilisateur: UtilisateurAuthentifie | null): UtilisateurAuthentifie {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return utilisateur;
  }

  /**
   * `GET /v1/missions/:id/questionnaire-preview` — §33.4.
   *
   * **N'ÉCRIT RIEN** : ni ligne figée, ni entrée de journal. C'est ce qui permet de
   * l'appeler autant de fois qu'on veut avant de se décider — et c'est le sens même
   * de l'écran (« plus jamais 240 questions découvertes après figeage »).
   *
   * **NON PAGINÉE, délibérément** : un questionnaire est un tout. La pagination
   * keyset du 11 §3 s'applique aux LISTES de ressources, pas au résultat d'un
   * calcul dont les totaux ne veulent rien dire à moitié.
   */
  instance.get(
    '/missions/:id/questionnaire-preview',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        response: { 200: questionnairePreviewResponseSchema },
      },
    },
    async (requete) => {
      return versPrevisualisation(await previsualiserQuestionnaire(requete.params.id));
    },
  );

  /**
   * `POST /v1/missions/:id/generate-questionnaire` — LE FIGEAGE, **201**.
   *
   * `POST` et non `PATCH` : c'est un ACTE, pas la modification d'un champ — et il
   * crée des ressources (`mission_questions`), d'où le 201.
   *
   * Les trois refus possibles sont des `409`, et chacun dit lequel :
   * `QUESTIONNAIRE_ALREADY_FROZEN` (déjà figé, avec le compte et la date),
   * `ILLEGAL_STATE_TRANSITION` (mission hors préparation),
   * `CONFLICT` (sélection vide, en nommant le filtre qui a vidé l'ensemble).
   * Le corps est vide et `strictObject` le fait respecter : rien n'est paramétrable.
   */
  instance.post(
    '/missions/:id/generate-questionnaire',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        body: questionnaireFreezeRequestSchema,
        response: { 201: questionnaireFreezeResponseSchema },
      },
    },
    async (requete, reponse) => {
      const resultat = await figerLeQuestionnaire(
        demandeur(requete.utilisateur).id,
        requete.params.id,
        contexteDepuisRequete(requete),
      );

      reponse.code(201);
      return versReponseFigeage(resultat);
    },
  );

  /**
   * `GET /v1/missions/:id/interview-plan` — le plan §32.4.
   *
   * **NON PERSISTÉ** : le plan est une CIBLE, pas des lignes `interviews`
   * (`conducted_by` est nullable depuis le 2026-09-02, migration 0014 ; c'est
   * `POST …/interview-plan/apply`, non encore livrée — fiche d'étage 2 — qui
   * persistera le plan, pas cette lecture).
   * **NON JOURNALISÉ** : il recopie des noms d'unités et des effectifs du client
   * (11 §2). **NON PAGINÉ** : un plan est un tout.
   */
  instance.get(
    '/missions/:id/interview-plan',
    {
      config: CONFIG_MISSION,
      schema: { params: missionParamsSchema, response: { 200: planEntretiensSchema } },
    },
    async (requete) => {
      const utilisateur = demandeur(requete.utilisateur);
      const plan = await etablirLePlanDEntretiens(requete.params.id, {
        utilisateurId: utilisateur.id,
        estAdmin: utilisateur.role === ROLE_ADMIN,
      });

      return versReponsePlan(plan);
    },
  );

  await Promise.resolve();
};
