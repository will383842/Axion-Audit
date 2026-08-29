// =============================================================================
// COMPILATEURS ZOD DE FASTIFY — lot L3, incrément L3a (note de conception §1).
//
// Contrat 11 §3 : « chaque route déclare son schéma Zod in/out depuis
// `packages/shared` ; les types TS sont dérivés (`z.infer`), le front importe LES
// MÊMES schémas. Aucun `any`. »
//
// ── CE QUE CE MODULE FAIT, EXACTEMENT ────────────────────────────────────────
// Il branche Zod SUR LES DEUX COMPILATEURS de Fastify, qui sont les deux seuls
// points où Fastify accepte un validateur autre qu'AJV :
//   · `setValidatorCompiler`  → `schema.{body,querystring,params,headers}` ;
//   · `setSerializerCompiler` → `schema.response[<statut>]`.
// Une route écrit alors `schema: { body: xSchema, response: { 200: ySchema } }`
// avec des schémas Zod NUS — pas de JSON Schema, pas de double déclaration.
//
// ── CE QU'IL NE FAIT PAS — À LIRE AVANT DE S'Y FIER ──────────────────────────
// Il n'OBLIGE PERSONNE à déclarer un schéma. Une route sans `schema` reste
// acceptée par Fastify (`compileSchemasForValidation` sort immédiatement) et donc
// par ce module. L'obligation « in ET out sur CHAQUE route » demanderait un
// crochet `onRoute` refusant le démarrage, comme le fait `config.acces`
// (auth/politique.ts) — il n'est PAS posé ici, et c'est délibéré : les routes
// d'authentification du lot L2 valident leurs entrées/sorties DANS le
// gestionnaire (`loginRequestSchema.parse(requete.body)`) et non dans `schema:`.
// Un tel crochet les refuserait alors qu'elles tiennent l'exigence. Trancher
// entre les deux formes est une décision de convention (11 §8-2), escaladée au
// rapport du lot, pas devinée ici.
// CE QUI EST DONC VRAI AUJOURD'HUI : ce module rend la déclaration `schema:`
// POSSIBLE et CORRECTE ; il ne la rend pas OBLIGATOIRE.
//
// ── POURQUOI PAS `fastify-type-provider-zod` ─────────────────────────────────
// Ce serait une dépendance hors de la liste épinglée du 11 §1 : escalade 11 §8-1.
// Le contenu utile tient en une soixantaine de lignes, les voici.
// Traçabilité : E43 (conventions d'API épinglées).
// =============================================================================
import type { FastifyInstance, FastifyTypeProvider } from 'fastify';
// `z` n'est utilisé ICI qu'en position de TYPE (`z.ZodType`, `z.output`,
// `z.input`) : la reconnaissance d'un schéma se fait par capacité (voir
// `estSchemaZod`), jamais par `instanceof`. L'import est donc `import type` —
// aucun code de zod n'entre dans le module compilé.
import type { z } from 'zod';
import { AppError } from '@axion/shared';
import { logger } from '../logger.js';

/**
 * FOURNISSEUR DE TYPES — ce qui relie le schéma Zod aux types du gestionnaire.
 *
 * Sans lui, `requete.body` reste `unknown` et chaque route se retrouverait à
 * re-parser à la main (ou pire, à asserter). Avec lui, `app.withTypeProvider
 * <FournisseurZod>()` fait dériver `requete.body`, `requete.query`,
 * `requete.params` et le type de retour du gestionnaire DES SCHÉMAS EUX-MÊMES.
 *
 * ASYMÉTRIE VOULUE entre les deux lignes :
 *   · `validator` rend `z.output` — ce que le gestionnaire REÇOIT, donc l'APRÈS
 *     des `coerce`/`default`/`transform` (`limit` est un `number`, pas la chaîne
 *     `"50"` de la chaîne de requête) ;
 *   · `serializer` rend `z.input` — ce que le gestionnaire a le droit de RENDRE,
 *     donc l'AVANT des mêmes transformations.
 * Les inverser ferait mentir le type au moment précis où un schéma transforme.
 */
export interface FournisseurZod extends FastifyTypeProvider {
  readonly validator: this['schema'] extends z.ZodType ? z.output<this['schema']> : unknown;
  readonly serializer: this['schema'] extends z.ZodType ? z.input<this['schema']> : unknown;
}

/**
 * Reconnaît un schéma Zod SANS `instanceof` sur une classe précise.
 *
 * `instanceof z.ZodType` échoue dès qu'un schéma vient d'une AUTRE copie de zod
 * dans l'arbre `node_modules` — le cas classique et silencieux d'un monorepo.
 * `packages/shared` et `apps/api` résolvent aujourd'hui la MÊME copie (zod 4.4.3,
 * `save-exact`), mais un garde-fou qui dépend de la topologie d'installation est
 * un garde-fou qui tombera un jour sans prévenir. On reconnaît donc la CAPACITÉ
 * (`safeParse`), pas la classe.
 */
function estSchemaZod(schema: unknown): schema is z.ZodType {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'safeParse' in schema &&
    typeof schema.safeParse === 'function'
  );
}

/** Message d'un schéma non-Zod : il fait échouer le DÉMARRAGE, pas une requête. */
function messageSchemaInvalide(quoi: string, method: string, url: string): string {
  return (
    `Route « ${method} ${url} » : le schéma « ${quoi} » n'est pas un schéma Zod. ` +
    `Contrat 11 §3 — chaque route déclare ses schémas Zod in/out importés de ` +
    `\`packages/shared\`. Un JSON Schema brut n'est plus compilé par ce dépôt : ` +
    `l'API refuse de démarrer plutôt que de valider avec un contrat que le front ` +
    `n'a pas.`
  );
}

/**
 * Branche Zod sur les deux compilateurs de l'instance.
 *
 * À APPELER AVANT TOUT ENREGISTREMENT DE ROUTE : les compilateurs sont lus au
 * moment où la route est déclarée (`compileSchemasForValidation`), pas à la
 * requête. Posés après, ils ne s'appliqueraient qu'aux routes suivantes — un
 * demi-branchement silencieux, exactement ce qu'on refuse.
 */
export function enregistrerCompilateursZod(app: FastifyInstance): void {
  // ── ENTRÉE ────────────────────────────────────────────────────────────────
  //
  // POURQUOI `{ error }` ET SURTOUT PAS UN `throw` — vérifié dans le code de
  // Fastify 5.12.1 (`lib/validation.js`, `validateParam`) : une fonction de
  // validation qui LÈVE voit son erreur estampillée `statusCode = 500`. Un
  // corps malformé serait sorti en « erreur interne », c'est-à-dire en panne
  // serveur imputée au client. Rendre `{ error }` fait passer l'erreur par
  // `wrapValidationError`, qui la laisse intacte parce qu'elle est déjà une
  // `Error` — la `ZodError` arrive donc TELLE QUELLE au gestionnaire d'erreurs
  // (erreurs.ts, branche 2), qui rend `400 VALIDATION_FAILED` avec le chemin de
  // chaque champ fautif, en français, et SANS la valeur fautive (11 §2).
  app.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    if (!estSchemaZod(schema)) {
      throw new Error(messageSchemaInvalide(httpPart ?? 'entrée', method, url));
    }
    return (donnees: unknown) => {
      const resultat = schema.safeParse(donnees);
      return resultat.success ? { value: resultat.data } : { error: resultat.error };
    };
  });

  // ── SORTIE ────────────────────────────────────────────────────────────────
  //
  // La sortie est REPASSÉE par son schéma avant l'envoi : ce n'est pas une
  // formalité, c'est le seul mécanisme qui empêche un champ ajouté par mégarde
  // dans un service (une empreinte de mot de passe, un montant de
  // `scoping_financials`) d'atteindre le réseau. Zod retire ce qui n'est pas
  // déclaré ; `fast-json-stringify` faisait la même chose, on ne perd rien.
  //
  // UN ÉCHEC ICI N'EST JAMAIS LA FAUTE DU CLIENT : c'est NOTRE réponse qui viole
  // NOTRE contrat. D'où `INTERNAL_ERROR` (500) et non une erreur de validation,
  // et d'où la journalisation en `error` — un contrat de sortie rompu doit
  // réveiller quelqu'un. On ne journalise QUE les CHEMINS des champs fautifs :
  // la valeur, elle, est précisément ce qui peut être une donnée personnelle
  // (11 §2, 06 §10.4).
  app.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    if (!estSchemaZod(schema)) {
      throw new Error(messageSchemaInvalide(`response.${httpStatus ?? '?'}`, method, url));
    }
    return (donnees: unknown) => {
      const resultat = schema.safeParse(donnees);
      if (!resultat.success) {
        logger.error(
          {
            methode: method,
            url,
            statut: httpStatus,
            champs: resultat.error.issues.map((probleme) => probleme.path.join('.')),
          },
          'Réponse non conforme à son schéma de sortie : envoi refusé',
        );
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      return JSON.stringify(resultat.data);
    };
  });
}
