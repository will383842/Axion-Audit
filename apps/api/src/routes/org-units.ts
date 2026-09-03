// =============================================================================
// ROUTES DE L'ARBRE ORGANISATIONNEL. Lot L3, incrément L3c.
//
// ── LES SIX ROUTES, ET D'OÙ CHACUNE VIENT ───────────────────────────────────
//   GET   /v1/missions/:id/org-units          ┐ `docs/conception/LOT_L3.md` §2,
//   POST  /v1/missions/:id/org-units          │ qui les nomme une à une. Les deux
//   PATCH /v1/org-units/:id                   ┘ premières servent 03 §16.2.
//   POST  /v1/missions/:id/org-units/import     03 §35.2 (`?verification=true`)
//   POST  /v1/org-units/:id/validate           ┐ 03 §25.3 — les deux gestes de
//   POST  /v1/org-units/:id/merge              ┘ qualification d'une proposition.
//
// SIX ROUTES DÉCLARÉES, **SEPT ENREGISTRÉES** : Fastify ajoute d'office le `HEAD`
// compagnon du `GET` (`exposeHeadRoutes`), qui hérite de `config.acces` et du
// crochet ③ — le même écart « écrit vs enregistré » que celui relevé sur les
// comptes et sur les missions, et pour lequel `app.ts` porte déjà la note.
//
// **Aucune route `DELETE`**, et ce n'est pas un oubli : `org_units` n'a même pas
// de `deleted_at` au fichier 04, et le pack ne dit nulle part ce que supprimer une
// unité signifierait pour ses entretiens, ses réponses et ses scores. Le geste que
// le pack décrit à la place est la SORTIE DE PÉRIMÈTRE (§25.1, `in_scope = false`,
// « données CONSERVÉES, exclues du scoring ») — elle passe par le `PATCH`.
//
// ── CES ROUTES NE DÉCIDENT RIEN, ET C'EST LE POINT ──────────────────────────
// Aucun contrôle du §35.2, aucune condition du §25.3, aucun nom de statut n'apparaît
// dans ce fichier : tout vit dans `domaines/org-units/service.ts`. La traduction de
// l'`AppError` en réponse HTTP est elle-même faite en amont, par le gestionnaire
// d'erreurs global (`erreurs.ts`) — ces gestionnaires laissent simplement l'erreur
// remonter.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — son ABSENCE empêcherait l'API de DÉMARRER
//     (`auth/politique.ts`, crochet `onRoute`) ; sa VALEUR est justifiée plus bas ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE, importés de `packages/shared`
//     (11 §3), en forme DÉCLARATIVE. **Aucun `.parse()` manuel.**
//
// ── PAS DE MARQUE `financier` ───────────────────────────────────────────────
// Aucune de ces routes ne touche au cadrage financier. Elles n'ont donc pas
// `financier: true` — cette marque n'est pas un synonyme d'« admin », elle fait
// poser `request.contexteAdmin`, dont seul le dépôt du cadrage a besoin.
// Traçabilité : E4 (arbre organisationnel à profondeur libre) · E5 (audits
// partiels jusqu'au poste) · E31 (généricité absolue) · E46 (bout en bout
// opérationnel : le format CSV du §35.2) · E43 (conventions d'API) ·
// E33 (sécurité / RGPD).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  createOrgUnitRequestSchema,
  importArbreQuerySchema,
  importArbreRequestSchema,
  mergeOrgUnitRequestSchema,
  missionParamsSchema,
  orgUnitMergeResponseSchema,
  orgUnitParamsSchema,
  orgUnitResponseSchema,
  rapportImportArbreSchema,
  updateOrgUnitRequestSchema,
  validateOrgUnitRequestSchema,
  type OrgUnitMergeResponse,
  type OrgUnitResponse,
} from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { contratDeListe } from '../http/pagination.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { LigneUniteOrg } from '../domaines/org-units/depot.js';
import {
  creerUneUnite,
  fusionnerUneUnite,
  importerLArbre,
  listerLArbre,
  modifierUneUnite,
  validerUneUnite,
  type ResultatFusion,
} from '../domaines/org-units/service.js';

/**
 * La politique des six routes — **`admin` SEUL, lecture comprise**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEUX PHRASES DU MÊME FICHIER 03 SE LISENT DIFFÉREMMENT, ET L'ARBITRAGE EST DATÉ.
 * ═══════════════════════════════════════════════════════════════════════════════
 * §34.3 donne au lead le pouvoir de « qualifier les unités proposées (§25.3 :
 * valider/fusionner) ». §34.1 écrit « la console est **ADMIN SEUL** » et « le lead y
 * entre en **Phase 2** ». `DECISIONS.md` du 2026-09-01 tranche : **admin seul en V1,
 * sur les six routes**, parce que §34.1 borne le PÉRIMÈTRE de la V1 tandis que §34.3
 * décrit une RÉPARTITION DE POUVOIRS qui n'a pas encore d'interface pour s'exercer.
 * « Ouvrir un droit sans l'écran qui le porte, c'est ouvrir une surface d'attaque
 * pour une fonctionnalité qui n'existe pas. »
 *
 * **Le consultant membre n'est pas privé de la donnée** : il lit l'arbre de sa
 * mission par le pull de sync (05 §9.5), pas par cette route.
 *
 * ── CONSÉQUENCE DIRECTE : UN NON-MEMBRE REÇOIT 403, PAS 404 ────────────────
 * Même décision du 2026-09-01. Le refus est prononcé par le crochet d'autorisation,
 * **sur le RÔLE, avant que la moindre requête ne touche la mission** — le serveur ne
 * sait pas encore si elle existe, il ne peut donc rien en divulguer. Un 404
 * supposerait de lire la ressource pour décider de la cacher, ce qui est l'inverse
 * du but. Précédence : invariant 3.
 *
 * Le jour où le lead entrera dans la console (§34.1, Phase 2), ce sera ici qu'on
 * l'ajoutera — et le cadrage par `mission_users` se posera dans le DÉPÔT, pas dans
 * cette constante : « une porte fermée ne trie pas le courrier » (auth/politique.ts).
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * Traduit la ligne de base en contrat d'API — **projection EXPLICITE**, jamais un
 * `...ligne`. C'est ce qui ferait échouer la compilation le jour où le dépôt
 * exposerait un champ de plus sans qu'on l'ait voulu ; le sérialiseur Zod est la
 * ceinture suivante, pas la première.
 *
 * `createdAt` et `updatedAt` sont des `TIMESTAMPTZ` : ils sortent en **ISO 8601
 * UTC** (11 §3), le fuseau de mission ne servant qu'à l'affichage (§22.2).
 * `timezone`, lui, n'est pas une date : c'est l'identifiant IANA que cette unité
 * SURCHARGE, ou `null` quand elle hérite de celui de la mission.
 */
function versReponse(ligne: LigneUniteOrg): OrgUnitResponse {
  return {
    id: ligne.id,
    missionId: ligne.missionId,
    parentId: ligne.parentId,
    kind: ligne.kind,
    name: ligne.name,
    countryCode: ligne.countryCode,
    timezone: ligne.timezone,
    headcount: ligne.headcount,
    serviceRefId: ligne.serviceRefId,
    sectorId: ligne.sectorId,
    inScope: ligne.inScope,
    status: ligne.status,
    proposedBy: ligne.proposedBy,
    mergedIntoId: ligne.mergedIntoId,
    position: ligne.position,
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

/** La réponse d'une fusion : les deux unités, et ce qui a été déplacé. */
function versReponseFusion(resultat: ResultatFusion): OrgUnitMergeResponse {
  return {
    unite: versReponse(resultat.unite),
    cible: versReponse(resultat.cible),
    entretiensReattaches: resultat.entretiensReattaches,
    enfantsReattaches: resultat.enfantsReattaches,
  };
}

export const routesOrgUnits: FastifyPluginAsync = async (app) => {
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
   * `GET /v1/missions/:id/org-units` — l'arbre d'une mission.
   *
   * Curseur **`(position, id)`, ascendant** — figé par `LOT_L3.md` §2 (voir
   * `domaines/org-units/depot.ts` pour la justification complète, et pour l'écart
   * assumé avec la nullabilité de `position` au fichier 04). Opaque et NON signé :
   * le cadrage d'accès vit dans `config.acces` et dans le dépôt, jamais dans le
   * curseur.
   *
   * L'ordre des positions est celui du fichier importé, parents avant enfants : la
   * liste rend donc l'arbre dans l'ordre où le sponsor l'a écrit. Une unité sans
   * position (le fichier 04 l'autorise) se range en fin de liste, une seule fois.
   *
   * ⚠ **CETTE LISTE SERT L'ARBRE VIVANT** : les unités `active` et `proposee` —
   * l'administrateur doit voir ce qu'il a à qualifier (§25.3) — et **pas** les
   * `fusionnee`, qui feraient doublon avec leur cible. Ce n'est pas une
   * suppression : la ligne survit en base avec son `merged_into_id` (invariant 7).
   * Voir `domaines/org-units/depot.ts` pour le raisonnement complet.
   */
  instance.get(
    '/missions/:id/org-units',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        ...contratDeListe(orgUnitResponseSchema),
      },
    },
    async (requete) => {
      const page = await listerLArbre(requete.params.id, requete.query);
      return { items: page.items.map(versReponse), nextCursor: page.nextCursor };
    },
  );

  /**
   * `POST /v1/missions/:id/org-units` — création d'UNE unité.
   *
   * **`201`**, et la réponse porte l'unité complète : l'appelant y lit la `position`
   * que le serveur a calculée et l'identifiant, qu'il l'ait fourni ou non.
   *
   * L'identifiant PEUT venir du client (UUID v7, règle P1-4 du fichier 04 : une
   * unité est une entité créable hors ligne). S'il est déjà pris, la route rend
   * **409** — jamais un écrasement : l'upsert idempotent de P1-4 appartient au
   * chemin de sync (05 §9.2), qui porte sa propre déduplication.
   */
  instance.post(
    '/missions/:id/org-units',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        body: createOrgUnitRequestSchema,
        response: { 201: orgUnitResponseSchema },
      },
    },
    async (requete, reponse) => {
      const creation = await creerUneUnite(
        auteur(requete.utilisateur).id,
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      reponse.code(201);
      return versReponse(creation.ligne);
    },
  );

  /**
   * `POST /v1/missions/:id/org-units/import` — l'import CSV du 03 §35.2.
   *
   * ── LE TRANSPORT, LE STATUT, ET LE MODE À BLANC ────────────────────────────
   * Corps `application/json` `{ csv: "<contenu>" }` — `DECISIONS.md` du 2026-09-01 :
   * `multipart/form-data` aurait exigé une dépendance hors de la liste épinglée, et
   * un corps brut `text/csv` n'aurait pas de schéma Zod à déclarer (11 §3).
   *
   * **`200` dans les deux modes** (même décision) : un `201` engagerait un en-tête
   * `Location` vers LA ressource créée, or un import en crée n cent et ce qu'il rend
   * n'est pas une ressource mais un RAPPORT.
   *
   * `?verification=true` rend le MÊME rapport sans rien écrire — et rend **200 même
   * quand le fichier est fautif** : « une validation à blanc qui trouve des erreurs
   * a réussi son travail » (`DECISIONS.md` du 2026-08-29). L'import RÉEL, lui, rend
   * **422 `IMPORT_REJECTED`** avec le rapport dans `details[]`, et **rien n'est
   * écrit** : l'atomicité du §35.2 tient parce que la validation ne fait que lire.
   */
  instance.post(
    '/missions/:id/org-units/import',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        querystring: importArbreQuerySchema,
        body: importArbreRequestSchema,
        response: { 200: rapportImportArbreSchema },
      },
    },
    async (requete) => {
      return importerLArbre(
        auteur(requete.utilisateur).id,
        requete.params.id,
        requete.body,
        requete.query.verification,
        contexteDepuisRequete(requete),
      );
    },
  );

  /**
   * `PATCH /v1/org-units/:id` — modification d'une unité.
   *
   * `PATCH` et non `PUT` : les seules routes de modification nommées dans tout le
   * fichier 05 sont des `PATCH`. Convention observée, pas inventée.
   *
   * ⚠ **`status` n'y passe pas** : `updateOrgUnitRequestSchema` est un `strictObject`
   * qui ne déclare pas cette clé, donc `PATCH {status}` sort en **400** sans jamais
   * atteindre le service. C'est la garantie que les deux gestes du §25.3 n'ont
   * chacun qu'une porte.
   *
   * **La sortie de périmètre passe ici** (`inScope: false`, §25.1) : c'est le geste
   * que le pack met à la place d'une suppression, et il conserve toutes les données
   * déjà collectées.
   *
   * Une unité `fusionnee` rend **409** : elle n'est plus un nœud de l'arbre mais une
   * trace, et une trace ne se corrige pas. 409 et non 404 — la ressource existe, et
   * un 404 ferait croire à une suppression que ce produit ne fait jamais.
   */
  instance.patch(
    '/org-units/:id',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: orgUnitParamsSchema,
        body: updateOrgUnitRequestSchema,
        response: { 200: orgUnitResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await modifierUneUnite(
        auteur(requete.utilisateur).id,
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `POST /v1/org-units/:id/validate` — §25.3, « devient `active`, entre dans la
   * couverture et le scoring ».
   *
   * Le corps est vide et facultatif : l'acte n'a aucun paramètre. Une unité qui
   * n'est pas `proposee` rend **409** — l'état de la ressource s'oppose à la
   * demande, ce qui est la définition de ce statut.
   */
  instance.post(
    '/org-units/:id/validate',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: orgUnitParamsSchema,
        body: validateOrgUnitRequestSchema,
        response: { 200: orgUnitResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await validerUneUnite(
        auteur(requete.utilisateur).id,
        requete.params.id,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `POST /v1/org-units/:id/merge` — §25.3, « fusionner avec une unité existante
   * (`fusionnee` + `merged_into_id` ; les entretiens sont re-rattachés
   * automatiquement) ».
   *
   * Le corps porte `{ mergedIntoId, motif? }` — le nom du champ est le camelCase de
   * la colonne du fichier 04 (`DECISIONS.md` du 2026-09-01 : « `targetId` inventerait
   * un troisième vocabulaire pour désigner la même chose »).
   *
   * **Rien n'est supprimé** : la réponse rend l'unité source, désormais `fusionnee`
   * et portant sa cible, ET les deux décomptes de ce qui a changé de rattachement —
   * la preuve, vérifiable sans lire la base, qu'aucune donnée n'a été perdue en
   * chemin (invariant 7).
   */
  instance.post(
    '/org-units/:id/merge',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: orgUnitParamsSchema,
        body: mergeOrgUnitRequestSchema,
        response: { 200: orgUnitMergeResponseSchema },
      },
    },
    async (requete) => {
      const resultat = await fusionnerUneUnite(
        auteur(requete.utilisateur).id,
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponseFusion(resultat);
    },
  );

  await Promise.resolve();
};
