// =============================================================================
// ROUTES DES MISSIONS — `/v1/missions`. Lot L3, incrément L3b.
//
// ── LES CINQ ROUTES, ET D'OÙ CHACUNE VIENT ──────────────────────────────────
//   GET   /v1/missions            ┐ 05 §8.3, « CRUD /v1/missions ». Les quatre
//   POST  /v1/missions            │ verbes sont nommés par
//   GET   /v1/missions/:id        │ `docs/conception/LOT_L3.md` §2.
//   PATCH /v1/missions/:id        ┘
//   POST  /v1/missions/:id/status   05 §8.3, « transitions contrôlées (machine à
//                                   états) » — la seule porte du 03 §32.2.
//
// **Aucune route `DELETE`**, et ce n'est pas un oubli : le « D » de CRUD n'est
// jamais instancié par le pack. `missions.deleted_at` existe pourtant au fichier
// 04 — mais aucune section fonctionnelle ne dit ce que supprimer une mission
// signifierait pour son arbre, ses entretiens, ses réponses et son questionnaire
// figé. Créer la route exigerait de trancher cela : une décision de produit, pas
// une convention. Même raisonnement, et mêmes mots, que `routes/companies.ts`.
//
// ── CETTE ROUTE NE DÉCIDE RIEN, ET C'EST LE POINT ───────────────────────────
// `docs/conception/LOT_L3.md` §3b : la machine à états est « appliquée dans le
// SERVICE (`transitionnerMission`), pas dans la route (qui ne fait que valider
// l'I/O et traduire l'`AppError`) ». On peut le vérifier d'un coup d'œil : aucun
// nom de statut, aucune condition, aucun `if` métier n'apparaît dans ce fichier.
// La traduction de l'`AppError` en réponse HTTP est elle-même faite en amont, par
// le gestionnaire d'erreurs global (`erreurs.ts`) — ces gestionnaires laissent
// donc simplement l'erreur remonter.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — son ABSENCE empêcherait l'API de DÉMARRER
//     (`auth/politique.ts`, crochet `onRoute`) ; sa VALEUR est justifiée plus bas ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE, importés de `packages/shared`
//     (11 §3), en forme DÉCLARATIVE (`schema: { … }`). **Aucun `.parse()` manuel.**
//
// ── PAS DE MARQUE `financier` ───────────────────────────────────────────────
// Aucune de ces routes ne touche `scoping_financials`. Elles n'ont donc pas
// `financier: true` — cette marque n'est pas un synonyme d'« admin », elle fait
// poser `request.contexteAdmin`, dont seul le dépôt financier a besoin
// (invariant 3 : « données financières : routes admin exclusivement »).
// Traçabilité : E39 (Machine à états mission) · E4 (Arbre organisationnel
// profondeur libre — racine créée d'office §16.2) · E30 (3 niveaux d'audit) ·
// E43 (Exécutabilité autopilote — conventions d'API) · E33 (Sécurité / RGPD).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  createMissionRequestSchema,
  missionCreationResponseSchema,
  missionParamsSchema,
  missionResponseSchema,
  missionStatusRequestSchema,
  missionStatusResponseSchema,
  updateMissionRequestSchema,
  type MissionCreationResponse,
  type MissionResponse,
  type MissionStatusResponse,
} from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { contratDeListe } from '../http/pagination.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { LigneMission } from '../domaines/missions/depot.js';
import {
  creerUneMission,
  lireUneMission,
  listerLesMissions,
  modifierUneMission,
  transitionnerMission,
  type CreationMission,
  type ResultatTransition,
} from '../domaines/missions/service.js';

/**
 * La politique des cinq routes — et des deux que Fastify ajoute seul (`HEAD` sur
 * chaque `GET`, qui héritent de cette politique sans être écrites nulle part).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * `admin` SEUL — ET C'EST LA MOITIÉ « ROUTE » D'UNE DÉCISION EN DEUX COUCHES.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `DECISIONS.md` du 2026-08-31, « [L3b] Qui a le droit de faire AVANCER une
 * mission ? », option 2 retenue : **la TABLE porte la règle métier durable**
 * (§32.2 — retours admin seuls, avances ouvertes à l'équipe de mission), **la ROUTE
 * porte la restriction V1** (§34.1 — « Décision V1 : la console est ADMIN SEUL »).
 * Les deux se vérifient séparément, et aucune n'a besoin de mentir sur l'autre.
 *
 * C'est le même partage que celui qu'`auth/politique.ts` écrit en toutes lettres :
 * la politique de route « dit QUI ENTRE, pas CE QUE LE SQL RAMÈNE » — « croire
 * qu'une porte fermée trie le courrier » est la faute que ce partage évite. La
 * conséquence pratique est écrite dans la décision : `TRANSITIONS_MISSION` autorise
 * plus large que cette route, et c'est la propriété NORMALE d'un garde-fou de
 * couche. Le socle refuse de démarrer sur une route sans politique, ce qui borne le
 * risque à « politique déclarée trop large », jamais à « politique absente ».
 *
 * Le jour où le lead entrera dans la console (§34.1 : « Le lead y entre en Phase 2,
 * borné à SES missions »), ce sera ici qu'on l'ajoutera — et le cadrage par
 * `mission_users` se posera dans le DÉPÔT, pas dans cette constante.
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * Traduit la ligne de base en contrat d'API — **projection EXPLICITE**, jamais un
 * `...ligne`. C'est ce qui ferait échouer la compilation le jour où le dépôt
 * exposerait un champ de plus sans qu'on l'ait voulu ; le sérialiseur Zod est la
 * ceinture suivante, pas la première.
 *
 * ── LES DEUX FAMILLES DE DATES, ET POURQUOI ELLES NE SE TRAITENT PAS PAREIL ──
 * `createdAt`, `updatedAt` et `deliveredAt` sont des `TIMESTAMPTZ` : ils sortent en
 * **ISO 8601 UTC** (11 §3), et le fuseau de mission ne sert qu'à l'AFFICHAGE
 * (§22.2). `ndaSignedAt`, `startPlanned` et `endPlanned` sont des `DATE` : ils
 * sortent **tels quels**, en `AAAA-MM-JJ`. Leur faire traverser une `Date`
 * JavaScript leur donnerait une heure, donc un fuseau, et une date de début
 * planifié basculerait d'un jour pour toute mission à l'ouest de Greenwich.
 *
 * ── AUCUNE CONVERSION DE TYPE, ET C'EST UNE PROPRIÉTÉ, PAS UNE CHANCE ────────
 * `geoScope`, `auditLevel`, `commercialOffer` et `llmProvider` traversent SANS
 * `as` : le dépôt les type déjà avec les unions de `packages/shared`, qui sont la
 * transcription des CHECK du 04. Une conversion aurait été le seul endroit où une
 * valeur hors énumération pouvait entrer sans que rien ne s'en aperçoive. Le
 * sérialiseur Zod reste la ceinture suivante : une ligne de base modifiée à la main
 * sort en erreur de sérialisation, bruyamment, plutôt qu'en réponse fausse.
 */
function versReponse(ligne: LigneMission): MissionResponse {
  return {
    id: ligne.id,
    companyId: ligne.companyId,
    parentMissionId: ligne.parentMissionId,
    title: ligne.title,
    geoScope: ligne.geoScope,
    countryCode: ligne.countryCode,
    sizeTierId: ligne.sizeTierId,
    activeSectors: [...ligne.activeSectors],
    activeBlocks: [...ligne.activeBlocks],
    auditLevel: ligne.auditLevel,
    commercialOffer: ligne.commercialOffer,
    timezone: ligne.timezone,
    ndaRef: ligne.ndaRef,
    ndaSignedAt: ligne.ndaSignedAt,
    status: ligne.status,
    llmProvider: ligne.llmProvider,
    startPlanned: ligne.startPlanned,
    endPlanned: ligne.endPlanned,
    deliveredAt: ligne.deliveredAt === null ? null : ligne.deliveredAt.toISOString(),
    createdBy: ligne.createdBy,
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

/** La réponse d'une création : la mission, et la racine née avec elle (§16.2). */
function versReponseCreation(creation: CreationMission): MissionCreationResponse {
  return { mission: versReponse(creation.ligne), uniteRacineId: creation.uniteRacineId };
}

/** La réponse d'une transition : la mission après coup, et ce que la transition a été. */
function versReponseTransition(resultat: ResultatTransition): MissionStatusResponse {
  return {
    mission: versReponse(resultat.ligne),
    depuis: resultat.depuis,
    vers: resultat.transition.vers,
    sens: resultat.transition.sens,
    surchargeUtilisee: resultat.surchargeUtilisee,
  };
}

export const routesMissions: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * L'administrateur qui agit.
   *
   * Ceinture d'exécution : sur une route `roles`, le crochet ③ a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — on ne fabrique pas un auteur. Une ligne d'`activity_log` dont l'auteur
   * est deviné vaut moins que pas de ligne du tout : elle accuse quelqu'un.
   */
  function auteur(utilisateur: UtilisateurAuthentifie | null): UtilisateurAuthentifie {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return utilisateur;
  }

  /**
   * `GET /v1/missions` — la liste des missions.
   *
   * Curseur **`(created_at, id)`, ascendant** — figé par `LOT_L3.md` §2 (voir
   * `domaines/missions/depot.ts` pour la justification complète, et pour la raison
   * précise qui impose ici le `::text` dont `companies` se passait). Opaque et NON
   * signé : le cadrage d'accès vit dans `config.acces` et dans le dépôt, jamais dans
   * le curseur. `contratDeListe` fournit d'un bloc la chaîne de requête keyset
   * (`?limit=&after=`) et l'enveloppe `{ items, nextCursor }`.
   */
  instance.get(
    '/missions',
    { config: CONFIG_ADMIN, schema: contratDeListe(missionResponseSchema) },
    async (requete) => {
      const page = await listerLesMissions(requete.query);
      return { items: page.items.map(versReponse), nextCursor: page.nextCursor };
    },
  );

  /**
   * `POST /v1/missions` — création de la mission **et de son unité racine** (03
   * §16.2 : « l'arbre est optionnel en pratique : une racine est créée par défaut »).
   *
   * **`201`**, et la réponse porte l'identifiant de la racine : sans lui, l'appelant
   * devrait relire l'arbre pour retrouver une unité qu'il vient de créer sans le
   * savoir. Les deux écritures sont UNE transaction — une mission sans unité n'est
   * pas une mission incomplète, c'est une mission sur laquelle rien du produit ne
   * fonctionne (ni entretien, ni couverture, ni scoring).
   *
   * Le statut initial n'est pas demandé : il vaut `preparation`, et le schéma
   * `strictObject` refuse la clé `status`. C'est la porte d'entrée de la machine à
   * états, et elle n'a qu'une valeur possible.
   */
  instance.post(
    '/missions',
    {
      config: CONFIG_ADMIN,
      schema: {
        body: createMissionRequestSchema,
        response: { 201: missionCreationResponseSchema },
      },
    },
    async (requete, reponse) => {
      const creation = await creerUneMission(
        auteur(requete.utilisateur).id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      reponse.code(201);
      return versReponseCreation(creation);
    },
  );

  /** `GET /v1/missions/:id` — une mission. `404` si elle n'existe pas ou est supprimée. */
  instance.get(
    '/missions/:id',
    {
      config: CONFIG_ADMIN,
      schema: { params: missionParamsSchema, response: { 200: missionResponseSchema } },
    },
    async (requete) => {
      return versReponse(await lireUneMission(requete.params.id));
    },
  );

  /**
   * `PATCH /v1/missions/:id` — modification du cadrage.
   *
   * `PATCH` et non `PUT` : les seules routes de modification nommées dans tout le
   * fichier 05 sont des `PATCH` (`/v1/answers/:id`, `/v1/interviews/:id/reassign`).
   * Convention observée, pas inventée.
   *
   * ⚠ **`status` n'y passe pas** : `updateMissionRequestSchema` est un `strictObject`
   * qui ne déclare pas cette clé, donc `PATCH {status}` sort en **400** sans jamais
   * atteindre le service. C'est la garantie que la machine à états n'a qu'une porte.
   */
  instance.patch(
    '/missions/:id',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        body: updateMissionRequestSchema,
        response: { 200: missionResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await modifierUneMission(
        auteur(requete.utilisateur).id,
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `POST /v1/missions/:id/status` — **la seule porte de la machine à états §32.2.**
   *
   * Le corps porte `{ vers, motif?, surcharge? }` — le vocabulaire de
   * `DemandeTransitionMission`, pour qu'aucune traduction ne s'intercale entre le
   * contrat de fil et la table des transitions. **`depuis` n'est pas demandé** : il
   * est lu sous verrou sur la ligne, parce qu'un `depuis` fourni par l'appelant
   * serait une supposition que la base pourrait démentir entre l'affichage de
   * l'écran et le clic.
   *
   * **Cette fonction ne juge rien.** Elle appelle le service, qui parcourt
   * `TRANSITIONS_MISSION` ; un refus remonte en `AppError` et le gestionnaire global
   * lui donne son statut HTTP — **409 `ILLEGAL_STATE_TRANSITION`** pour un passage
   * non autorisé, des conditions manquantes ou un motif absent (l'état de la
   * ressource s'oppose à la demande), **403** pour un rôle insuffisant. Le fichier
   * 07 demande que « toute transition de statut interdite [soit] rejetée avec
   * motif » : le motif est dans le message, et le détail des conditions manquantes
   * dans `details[]`, une entrée par condition.
   *
   * ⚠ **DEUX REFUS DE MOTIF, DEUX STATUTS** — arbitrage Williams du 2026-09-02
   * (« motif codé ») croisé avec celui d'A01 du 2026-09-01 : le motif ABSENT sur
   * une transition qui l'exige sort en **409** (c'est l'état qui l'exige, pas la
   * forme) ; un motif HORS du vocabulaire `MOTIFS_RETOUR_ARRIERE` sort en **400
   * `VALIDATION_FAILED`**, prononcé par le schéma, sans que le service soit appelé.
   *
   * **`POST` et non `PATCH`** : c'est le verbe qu'écrit le 05 §8.3
   * (`POST /v1/missions/:id/status`). Une transition n'est pas la modification d'un
   * champ, c'est un ACTE — et il a des effets de bord (la trace `activity_log`, la
   * date de livraison) qu'un `PATCH` de champ n'aurait pas.
   */
  instance.post(
    '/missions/:id/status',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        body: missionStatusRequestSchema,
        response: { 200: missionStatusResponseSchema },
      },
    },
    async (requete) => {
      const utilisateur = auteur(requete.utilisateur);
      const resultat = await transitionnerMission(
        { id: utilisateur.id, role: utilisateur.role },
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponseTransition(resultat);
    },
  );

  await Promise.resolve();
};
