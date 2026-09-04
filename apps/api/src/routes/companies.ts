// =============================================================================
// ROUTES DES ENTREPRISES CLIENTES — `/v1/companies`. Lot L3, incrément L3a.
//
// ── LES QUATRE ROUTES, ET D'OÙ CHACUNE VIENT ────────────────────────────────
//   GET   /v1/companies       ┐ `docs/conception/LOT_L3.md` §2, qui les nomme les
//   POST  /v1/companies       │ quatre. Le fichier 07 confie à L3 « API missions/
//   GET   /v1/companies/:id   │ companies (dédup SIREN R3, NAF→secteur R4) » —
//   PATCH /v1/companies/:id   ┘ c'est le brief, et il est tenu ici pour `companies`.
//
// **Aucune route `DELETE`**, et ce n'est pas un oubli : le « D » de CRUD n'est
// jamais instancié par le pack. `companies.deleted_at` existe pourtant au fichier
// 04 — mais aucune section fonctionnelle ne décrit ce que supprimer une fiche
// signifierait pour les missions qui la référencent (`missions.company_id` est
// `NOT NULL`). Créer la route exigerait de trancher cela, donc une décision de
// produit, pas une convention.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — `roles: ['admin']` PARTOUT. Son ABSENCE empêcherait l'API de
//     DÉMARRER (`auth/politique.ts`, crochet `onRoute`) ; sa VALEUR, elle, est un
//     silence du pack, tranché au plus restrictif et tracé — voir `CONFIG_ADMIN` ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE, importés de `packages/shared`
//     (11 §3), en forme DÉCLARATIVE (`schema: { … }`). **Aucun `.parse()` manuel** :
//     la dette des routes d'auth a été soldée le 2026-08-30, on ne la recrée pas.
//
// ── PAS DE MARQUE `financier` ───────────────────────────────────────────────
// Aucune de ces routes ne touche `scoping_financials`. Elles n'ont donc pas
// `financier: true` — cette marque n'est pas un synonyme d'« admin », elle fait
// poser `request.contexteAdmin`, dont seul le dépôt financier a besoin.
// Traçabilité : E19 (avant-vente : cadrage de l'étendue — entreprise complète,
// filiales) · E18 (liaison clients axion-ia.com : console maîtresse) · E43
// (conventions d'API épinglées) · E33 (sécurité).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  companyParamsSchema,
  companyResponseSchema,
  companyWriteResponseSchema,
  createCompanyRequestSchema,
  updateCompanyRequestSchema,
  type CompanyResponse,
  type CompanyWriteResponse,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { contratDeListe } from '../http/pagination.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { LigneEntreprise } from '../domaines/companies/depot.js';
import {
  creerUneEntreprise,
  lireUneEntreprise,
  listerLesEntreprises,
  modifierUneEntreprise,
  type EcritureEntreprise,
} from '../domaines/companies/service.js';

/**
 * La politique des quatre routes — et de la CINQUIÈME, que Fastify ajoute seul :
 * `HEAD /v1/companies`, compagne du `GET`. Elle hérite de cette politique sans être
 * écrite nulle part, ce qui est le bon comportement et mérite d'être su.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * `admin` SEUL — ET C'EST UN SILENCE DU PACK, COMBLÉ AU PLUS RESTRICTIF.
 * ═══════════════════════════════════════════════════════════════════════════════
 * **Le pack ne dit nulle part quel rôle accède au référentiel client.** Ni le §8
 * (liste des routes), ni le §24.2, ni la matrice §34.1 ne nomment `/v1/companies`.
 * Trois éléments, et trois seulement, orientent la décision :
 *   · 03 §34.1 : « la console est ADMIN SEUL » en V1 — et une fiche client est un
 *     objet de console, jamais de terrain (la PWA ne connaît que des missions) ;
 *   · §34.3 borne le lead de mission et exclut nommément « les comptes » et le
 *     financier ; rien n'y étend son périmètre au référentiel client ;
 *   · une fiche client porte `external_ref`, la clé de liaison avec la console
 *     commerciale axion-ia.com (04) : l'ouvrir plus largement ouvrirait aussi la
 *     lecture de cette liaison.
 * **Le plus restrictif est donc retenu, et il est TRACÉ** (`DECISIONS.md` du
 * 2026-08-31, « [L3a] Quel rôle accède au référentiel client ? »). Élargir plus tard
 * est un ajout à cette liste et une entrée de décision ; avoir ouvert d'abord aurait
 * été un droit qu'on ne reprend plus.
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * Traduit la ligne de base en contrat d'API : `Date` → ISO 8601 **UTC** (11 §3), et
 * **projection EXPLICITE** — jamais un `...ligne`.
 *
 * C'est ce qui ferait échouer la compilation le jour où le dépôt exposerait un champ
 * de plus sans qu'on l'ait voulu. Le sérialiseur Zod est la ceinture suivante, pas
 * la première.
 */
function versReponse(ligne: LigneEntreprise): CompanyResponse {
  return {
    id: ligne.id,
    externalRef: ligne.externalRef,
    name: ligne.name,
    siren: ligne.siren,
    nafCode: ligne.nafCode,
    sectorId: ligne.sectorId,
    headcount: ligne.headcount,
    sitesCount: ligne.sitesCount,
    countries: [...ligne.countries],
    notes: ligne.notes,
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

/** La réponse d'une écriture : la fiche, plus les deux constats de R3 et R4. */
function versReponseEcriture(ecriture: EcritureEntreprise): CompanyWriteResponse {
  return {
    company: versReponse(ecriture.ligne),
    secteurAQualifier: ecriture.secteurAQualifier,
    doublonsNomPossibles: ecriture.doublonsNomPossibles.map((homonyme) => ({
      id: homonyme.id,
      name: homonyme.name,
    })),
  };
}

export const routesCompanies: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * Identifiant de l'administrateur qui agit.
   *
   * Ceinture d'exécution : sur une route `roles`, le crochet ③ a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — on ne fabrique pas un auteur. Une ligne d'`activity_log` dont l'auteur
   * est deviné vaut moins que pas de ligne du tout : elle accuse quelqu'un.
   */
  function auteur(utilisateur: { readonly id: string } | null): string {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return utilisateur.id;
  }

  /**
   * `GET /v1/companies` — la liste du référentiel client.
   *
   * Curseur **`(name, id)`, ascendant** — l'ordre alphabétique, celui dans lequel on
   * cherche une fiche (voir `domaines/companies/depot.ts` pour la justification
   * complète, et pour la raison précise qui rend le `::text` de `users` inutile
   * ici). Opaque et NON signé : le cadrage d'accès vit dans `config.acces` et dans
   * le dépôt, jamais dans le curseur. `contratDeListe` fournit d'un bloc la chaîne
   * de requête keyset (`?limit=&after=`) et l'enveloppe `{ items, nextCursor }`.
   */
  instance.get(
    '/companies',
    { config: CONFIG_ADMIN, schema: contratDeListe(companyResponseSchema) },
    async (requete) => {
      const page = await listerLesEntreprises(requete.query);
      return { items: page.items.map(versReponse), nextCursor: page.nextCursor };
    },
  );

  /**
   * `POST /v1/companies` — création, avec R3 (dédup SIREN) et R4 (NAF→secteur).
   *
   * **`201`**, et la réponse porte les deux constats de l'écriture :
   * `secteurAQualifier` (R4 : le code APE est valide mais sa division n'est pas au
   * référentiel) et `doublonsNomPossibles` (R3, moitié « nom en second » : des
   * fiches homonymes existent). **Ni l'un ni l'autre n'est un échec** — un doublon
   * de NOM est un avertissement, jamais un refus, parce que l'unicité en base est
   * PARTIELLE (`siren` seul, `WHERE siren IS NOT NULL`) et que deux entités
   * homonymes dans deux pays sont légitimes (§16).
   *
   * Le seul refus de cette route est **`409 COMPANY_DUPLICATE`**, sur un SIREN déjà
   * pris — décidé par l'index unique partiel, pas par une lecture préalable.
   */
  instance.post(
    '/companies',
    {
      config: CONFIG_ADMIN,
      schema: { body: createCompanyRequestSchema, response: { 201: companyWriteResponseSchema } },
    },
    async (requete, reponse) => {
      const ecriture = await creerUneEntreprise(
        auteur(requete.utilisateur),
        requete.body,
        contexteDepuisRequete(requete),
      );

      reponse.code(201);
      return versReponseEcriture(ecriture);
    },
  );

  /** `GET /v1/companies/:id` — une fiche. `404` si elle n'existe pas ou est supprimée. */
  instance.get(
    '/companies/:id',
    {
      config: CONFIG_ADMIN,
      schema: { params: companyParamsSchema, response: { 200: companyResponseSchema } },
    },
    async (requete) => {
      return versReponse(await lireUneEntreprise(requete.params.id));
    },
  );

  /**
   * `PATCH /v1/companies/:id` — modification.
   *
   * `PATCH` et non `PUT` : les seules routes de modification nommées dans tout le
   * fichier 05 sont des `PATCH` (`/v1/answers/:id`, `/v1/interviews/:id/reassign`).
   * Convention observée, pas inventée.
   *
   * Même forme de réponse que la création — la modification peut, elle aussi,
   * changer le code APE (donc rejouer R4) ou le nom (donc lever l'alerte R3).
   */
  instance.patch(
    '/companies/:id',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: companyParamsSchema,
        body: updateCompanyRequestSchema,
        response: { 200: companyWriteResponseSchema },
      },
    },
    async (requete) => {
      const ecriture = await modifierUneEntreprise(
        auteur(requete.utilisateur),
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponseEcriture(ecriture);
    },
  );

  await Promise.resolve();
};
