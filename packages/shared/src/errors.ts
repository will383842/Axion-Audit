// =============================================================================
// FORMAT D'ERREUR UNIQUE DE L'API — contrat 11 §3
// « Erreurs : format unique { error: { code, message, details? } } + statut HTTP
//   cohérent. Les codes vivent dans packages/shared (ERROR_CODES const) — JAMAIS de
//   littéral libre. »
// Invariant 5 : les messages sont en FRANÇAIS.
// Traçabilité : E43 (exécutabilité autopilote — conventions API épinglées).
// =============================================================================
import { z } from 'zod';

// =============================================================================
// LOCALE DE VALIDATION — invariant 5 : « Interface 100 % en français ».
//
// `error.details[].message` est recopié depuis Zod et affiché TEL QUEL par la PWA
// terrain (voir `apiErrorSchema.message` ci-dessous). Avec la locale par défaut, un
// auditeur en clientèle lisait « Too small: expected number to be >=1 » et
// « Invalid ISO datetime ». Un message d'erreur d'API affiché tel quel EST de
// l'interface : l'invariant 5 s'y applique sans exception.
//
// « Sans exception » est à prendre au mot, et c'est pour le tenir qu'`errorDetailSchema`
// porte un champ `code` SÉPARÉ (amendement du 2026-08-29, posé au lot L3b) : ce qui
// est destiné à une machine — un état exact, un code de défaut d'import — y va, et
// `message` reste une phrase française. Voir le schéma pour le détail du partage.
//
// Zod 4 EMBARQUE la locale française (`z.locales.fr`, présent dans le paquet épinglé
// 4.4.3 — vérifié avant d'écrire une ligne). AUCUNE dépendance ajoutée : l'escalade
// 11 §8-1 ne s'applique pas.
//
// `z.config()` est GLOBAL au module `zod` du processus. `apps/api`, `apps/worker`,
// `apps/field`, `apps/hq` et `packages/shared` résolvent tous zod@4.4.3 vers le MÊME
// répertoire pnpm : un seul appel suffit, et il est posé ICI parce que c'est le module
// que tout consommateur de `@axion/shared` charge (index.ts le réexporte en premier).
// Il est aussi APPELÉ explicitement par le gestionnaire d'erreurs de l'API : un effet
// de bord d'import est vrai tant que personne ne réorganise les imports, un appel
// nommé reste vrai après.
//
// CE QUI N'EST PAS TRADUIT, ET NE DOIT PAS L'ÊTRE : le CODE. `ERROR_CODES` est ce que
// le front teste (11 §3 : « jamais de littéral libre ») ; seul le MESSAGE est localisé.
// =============================================================================

let localeAppliquee = false;

/** Applique la locale française de Zod au processus. Idempotent. */
export function appliquerLocaleFrancaiseZod(): void {
  if (localeAppliquee) return;
  z.config(z.locales.fr());
  localeAppliquee = true;
}

appliquerLocaleFrancaiseZod();

/**
 * Codes d'erreur du produit. Un code = une cause, jamais une reformulation.
 * Ajouter un code est une décision d'API : elle passe par une entrée DECISIONS.md
 * si elle n'est pas déjà nommée par le pack (11 §8.6).
 *
 * Les codes du contrat de sync (05 §9.3) — `applied`, `duplicate`, `superseded`,
 * `forbidden`, `error` — ne sont PAS des erreurs HTTP : ce sont des RÉSULTATS d'op,
 * livrés au lot L6a dans son propre type. Ne pas les confondre.
 */
export const ERROR_CODES = {
  // --- 400 : la requête est mal formée ou invalide ---------------------------
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CURSOR: 'INVALID_CURSOR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',

  // --- 401 / 403 : identité et droits (invariant 3) --------------------------
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_HABILITATED: 'NOT_HABILITATED',

  // --- 404 / 409 : état de la ressource --------------------------------------
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',
  /**
   * REFUS DU GARDE-FOU 05 §9.7 — lot L2/T3, ajouté sur arbitrage de Williams
   * (DECISIONS.md 2026-08-31 « Comment un mot de passe se réinitialise »).
   *
   * Rendu quand une réinitialisation de mot de passe détruirait des données que
   * personne n'a encore reçues : la KEK de l'appareil dérive du mot de passe, donc
   * tout ce qui reste dans l'outbox devient DÉFINITIVEMENT illisible. La condition
   * est celle du 05 §9.7, mot pour mot : « dernier `sync_log.outbox_remaining` > 0
   * OU aucune sync connue de l'appareil ».
   *
   * ── POURQUOI UN CODE À LUI, ET NON `CONFLICT` ────────────────────────────────
   * Le refus est SURMONTABLE : l'admin peut confirmer « perte locale possible » et
   * forcer. Sous `CONFLICT`, le front ne pourrait pas distinguer ce refus-là d'un
   * conflit ordinaire — donc ne saurait pas qu'il a une confirmation à proposer, et
   * le garde-fou deviendrait un mur muet. Or il existe précisément pour que
   * l'administrateur sache CE QU'IL DÉTRUIT avant de le détruire.
   *
   * ── POURQUOI LE STATUT 409 MALGRÉ TOUT ──────────────────────────────────────
   * La requête est bien formée (400 serait faux) et l'appelant a bien les droits
   * (403 serait faux) : c'est l'ÉTAT de la ressource — des données non synchronisées
   * — qui s'y oppose, ce qui est la définition de 409. Le statut classe la famille,
   * le code nomme la cause ; c'est déjà la répartition de `ILLEGAL_STATE_TRANSITION`.
   */
  UNSYNCED_DATA_AT_RISK: 'UNSYNCED_DATA_AT_RISK',
  /**
   * `POST|PATCH /v1/companies` — le SIREN présenté est DÉJÀ porté par une autre
   * fiche. Arbitré par `DECISIONS.md` du 2026-08-29 (« Les quatre codes d'erreur du
   * lot »), option 3 : **retenu, périmètre RÉDUIT au SIREN**.
   *
   * Le générique `CONFLICT` suffirait AUJOURD'HUI — cette route n'a qu'un seul 409
   * possible. Le code dédié est une assurance, et A01 en écrit le prix : 05 §8.3 et
   * M8.1 annoncent un référentiel partagé avec `external_ref` ; le jour où un second
   * conflit arrivera sur ces routes, un branchement front bâti sur un conflit nu
   * deviendrait faux **en silence**.
   *
   * ⚠ IL NE COUVRE PAS LA COLLISION DE NOM. Le nom n'a aucune unicité en base (04 :
   * l'index unique est PARTIEL, sur `siren` seul) ; une collision de nom rend donc
   * un **201 avec avertissement**, jamais ce code. Voir `companies.ts`.
   *
   * ── CE QUE LE MESSAGE DIT DE PLUS QUE LE CONFLIT (depuis le 2026-09-05) ──────
   * `uq_companies_siren` **n'exclut PAS les fiches supprimées** : une fiche archivée
   * (`deleted_at IS NOT NULL`) CONSERVE son SIREN (invariant 7 : une archive garde
   * ses liens). Un 409 muet là-dessus envoyait « rapprocher » une fiche que `GET /:id`
   * rend en 404 et qu'aucune liste ne montre — mesuré par A16 sur la livraison du
   * 2026-09-04, qui avait réglé ce cas pour `external_ref` et l'avait laissé ouvert
   * pour le SIREN. Arbitré par A01 le 2026-09-05 : **symétrie complète**. Quand la
   * fiche en conflit est archivée, le message LE NOMME et oriente vers sa
   * RESTAURATION, pas vers le rapprochement.
   *
   * ── LE CONTRAT DE `details` SUR LES 409 D'UNICITÉ DE `companies` ────────────
   * Vaut pour ce code ET pour `COMPANY_EXTERNAL_REF_DUPLICATE`, à l'identique :
   *   · **garantis** : le statut 409 et `error.code`, décidés par la contrainte ;
   *   · **au mieux** : `details[0]`, relu APRÈS coup. Quand il est présent, il porte
   *     TOUJOURS `path` (`siren` | `externalRef`), **`code ∈ { fiche_active,
   *     fiche_archivee }`** — vocabulaire FERMÉ, l'état de la fiche fautive pour une
   *     machine — et `message` (son identifiant, pour un humain). Quand la fiche a
   *     disparu entre la violation et la relecture (course), le 409 sort **sans
   *     `details`** : jamais un `details` partiel, jamais un état présumé.
   * Un front branche sur `error.code`, puis sur `details[0]?.code` s'il existe, et
   * traite son absence comme « conflit constaté, fiche non nommée » — pas comme une
   * anomalie. Le chemin dégradé est un contrat tenu, pas un accident toléré ; c'est
   * le principe déjà écrit dans `companies/depot.ts` (« dégrade le message, jamais la
   * décision »), formulé ici en contrat parce qu'un front l'importe d'ici.
   */
  COMPANY_DUPLICATE: 'COMPANY_DUPLICATE',
  /**
   * `POST|PATCH /v1/companies` — la **RÉFÉRENCE CONSOLE** (`external_ref`) présentée
   * est DÉJÀ portée par une autre fiche. Décidée par l'index unique partiel
   * `uq_companies_external_ref` (migration `0015`, amendement du 04 §7.1 du
   * 2026-09-03), jamais par une lecture préalable — comme pour le SIREN.
   *
   * ── D'OÙ IL VIENT ───────────────────────────────────────────────────────────
   * Fermeture du **défaut ①** rendu aux producteurs le 2026-09-03 : `0015` a posé une
   * SECONDE contrainte unique sur des routes L3a qui ne nommaient que
   * `uq_companies_siren`, et une référence console en double sortait en **500
   * INTERNAL_ERROR**. C'est exactement le jour que le commentaire de
   * `companies/depot.ts` annonçait au futur ; il est arrivé.
   *
   * ── POURQUOI UN CODE À LUI, ET NON `COMPANY_DUPLICATE` ÉTENDU ───────────────
   * Décision du pilote du 2026-09-04, sur délégation de Williams. Étendre le code du
   * SIREN aurait été la symétrie paresseuse : son message parle du SIREN, et
   * `depot.ts` écrit lui-même qu'« un message d'erreur faux envoie chercher au
   * mauvais endroit, ce qui coûte plus cher qu'un message absent ». Les deux conflits
   * n'ont d'ailleurs PAS la même réparation — un SIREN en double se rapproche entre
   * deux fiches d'audit, une référence console en double se règle du côté de la
   * LIAISON M8.1 avec la console axion-ia.com. Distinguer les deux en analysant une
   * phrase française est précisément ce que le 11 §3 refuse. C'est aussi, mot pour
   * mot, le « second conflit sur ces routes » que `COMPANY_DUPLICATE` annonçait
   * ci-dessus pour justifier son propre périmètre réduit.
   *
   * ── CE QUE LE MESSAGE DIT DE PLUS QUE LE CONFLIT ────────────────────────────
   * `uq_companies_external_ref` **n'exclut PAS les fiches supprimées** : une fiche
   * archivée (`deleted_at IS NOT NULL`) CONSERVE sa référence console. C'est voulu, et
   * tranché le 2026-09-04 (invariant 7 : rien n'est silencieusement écrasé ; une
   * référence console désigne une ENTREPRISE, pas une ligne vivante). Mais un 409 muet
   * sur ce point enverrait l'utilisateur créer un doublon sous une AUTRE référence :
   * quand la fiche en conflit est archivée, le message LE NOMME et oriente vers sa
   * RESTAURATION plutôt que vers une création. C'est la différence entre un conflit
   * constaté et un conflit actionnable.
   *
   * `details[0].code` porte l'état de la fiche fautive — `fiche_active` |
   * `fiche_archivee` — pour que le front branche sans lire le français, selon le
   * partage message/code documenté sur `errorDetailSchema`. **Le même contrat vaut
   * pour `COMPANY_DUPLICATE` depuis le 2026-09-05** — même vocabulaire, même chemin
   * dégradé (un 409 sans `details` si la fiche a disparu entre la violation et la
   * relecture) : il est écrit UNE fois, sur ce code-là, et s'applique aux deux.
   *
   * ── POURQUOI 409 ────────────────────────────────────────────────────────────
   * Requête bien formée (400 serait faux), appelant habilité (403 serait faux) : c'est
   * l'ÉTAT de la ressource qui s'y oppose, définition de 409. Le statut classe la
   * famille, le code nomme la cause.
   */
  COMPANY_EXTERNAL_REF_DUPLICATE: 'COMPANY_EXTERNAL_REF_DUPLICATE',
  /**
   * `POST /v1/missions/:id/generate-questionnaire` — le questionnaire de cette
   * mission est **DÉJÀ FIGÉ**. Arbitré par `DECISIONS.md` du 2026-08-29, précisé le
   * 2026-09-02 : le message porte le COMPTE de questions figées **et la DATE**, lue
   * dans `activity_log` faute de colonne au fichier 04.
   *
   * ── POURQUOI UN CODE À LUI, ET NON `CONFLICT` ────────────────────────────────
   * Le figeage a **trois** refus, tous en 409, et le front doit proposer trois
   * choses différentes : « déjà figé » → montrer le questionnaire existant (rien à
   * corriger, l'acte a eu lieu) ; `ILLEGAL_STATE_TRANSITION` → la mission n'est plus
   * en préparation ; `CONFLICT` → la sélection est vide, il faut reprendre le
   * cadrage. Sous un `CONFLICT` unique, distinguer les trois demanderait d'analyser
   * une phrase française — exactement ce que le 11 §3 refuse.
   *
   * ── POURQUOI 409 ────────────────────────────────────────────────────────────
   * La requête est bien formée (400 serait faux), l'appelant a les droits (403 serait
   * faux) : c'est l'ÉTAT de la ressource qui s'y oppose, définition de 409. Le statut
   * classe la famille, le code nomme la cause — même répartition que
   * `ILLEGAL_STATE_TRANSITION`.
   *
   * ⚠ **UN REFUS QUI N'ÉCRIT RIEN.** Il est prononcé sous le `FOR UPDATE` de la
   * mission et AVANT tout `INSERT` : deux appels concurrents produisent une création
   * et ce code, jamais deux jeux de lignes figées (note de conception L3 §3.a).
   */
  QUESTIONNAIRE_ALREADY_FROZEN: 'QUESTIONNAIRE_ALREADY_FROZEN',

  // --- 422 : le document a été LU, et rejeté ---------------------------------
  /**
   * UN IMPORT DE FICHIER A ÉTÉ REJETÉ. Premier appelant : l'import CSV de l'arbre
   * organisationnel (03 §35.2, lot L3c). Arbitré par `DECISIONS.md` du 2026-08-29
   * (« Les quatre codes d'erreur du lot »), option 3.
   *
   * ── POURQUOI `IMPORT_REJECTED` ET NON `CSV_IMPORT_REJECTED` ─────────────────
   * La décision renomme le code proposé par la note de conception, et le motif est
   * écrit : « `banque-questions.ts` annonce déjà un `BANK_IMPORT_REJECTED` pour le
   * lot L9. Deux codes, une seule action front, une seule forme de rapport, et deux
   * imports qui sont tous deux du CSV : “CSV” nomme le MÉDIUM, pas le sujet. »
   * Un seul code, donc, la route disant ce qui a été importé — un code aujourd'hui,
   * un code évité au lot L9.
   *
   * ── POURQUOI 422, ET POURQUOI C'EST LE PREMIER DE LA TABLE ─────────────────
   * Sur une route d'import, **400 est déjà consommé par le compilateur Zod** : le
   * corps `{ csv: "…" }` est validé comme n'importe quel autre. Faire cohabiter
   * « votre appel HTTP est malformé » et « votre document a été lu et rejeté sur
   * 12 lignes » sous un statut unique rendrait la distinction dépendante du seul
   * code, alors que la route peut lever les deux. 422 dit exactement ce qui s'est
   * passé : la requête était bien formée, son CONTENU ne l'était pas.
   *
   * ── CE QUI VOYAGE DANS `details[]`, ET CE QUI N'Y VOYAGE PAS ───────────────
   * Le rapport ligne à ligne du §35.2 (`{ligne, colonne, code, message}`) : `path`
   * porte « ligne[.colonne] », `code` la cause machine, `message` la phrase
   * française. **Ce rapport n'est JAMAIS journalisé** — même décision du
   * 2026-08-29 : il recopie des cellules du fichier client (noms d'unités,
   * effectifs), et le §2 du contrat interdit tout déversement de données client
   * dans les journaux.
   *
   * ⚠ **LA VALIDATION À BLANC NE LÈVE JAMAIS CE CODE** : `?verification=true` rend
   * `200` avec le même rapport, parce qu'une validation à blanc qui trouve des
   * erreurs a RÉUSSI son travail.
   */
  IMPORT_REJECTED: 'IMPORT_REJECTED',

  // --- 413 / 415 / 429 -------------------------------------------------------
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',

  // --- 500 / 503 -------------------------------------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * FILET DE L'INVARIANT 5 — dernier recours, pas mécanisme principal.
 *
 * La locale ci-dessus couvre les messages produits par Zod. Elle ne couvre PAS un
 * `message:` littéral écrit en anglais par un auteur de schéma, ni un éventuel trou de
 * la locale. Ce garde-fou attrape ces cas-là et rend un message français générique
 * plutôt qu'un message anglais : mieux vaut un message pauvre en français qu'un message
 * riche dans la mauvaise langue, sur un écran d'auditeur en clientèle.
 *
 * Aucun message français de la locale `fr` de Zod ne commence par l'un de ces
 * préfixes (« Entrée invalide », « Trop petit », « Trop grand », « Chaîne invalide »,
 * « Nombre invalide », « Clé non reconnue », « Valeur invalide ») : le filet ne peut
 * pas dégrader un message déjà correct.
 */
const PREFIXES_ANGLAIS = [
  'Invalid',
  'Too small',
  'Too big',
  'Unrecognized',
  'Required',
  'Expected',
  'Must be',
  'Not a',
  'String must',
  'Number must',
  'Array must',
] as const;

/** Message rendu quand un message de validation est resté en anglais. */
export const MESSAGE_VALIDATION_GENERIQUE = 'Valeur invalide.';

/** Rend `message` s'il est en français, le message générique français sinon. */
export function messageValidationFrancais(message: string): string {
  return PREFIXES_ANGLAIS.some((prefixe) => message.startsWith(prefixe))
    ? MESSAGE_VALIDATION_GENERIQUE
    : message;
}

/**
 * Détail d'erreur : pointe le champ fautif d'une validation Zod, et — depuis
 * l'amendement du 2026-08-29 — peut porter un CODE de défaut lisible par une machine.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `message` ET `code` NE S'ADRESSENT PAS AU MÊME LECTEUR, ET C'EST TOUT LEUR SENS.
 * ══════════════════════════════════════════════════════════════════════════════
 *   · **`message` est de l'INTERFACE.** Il est affiché TEL QUEL (voir l'en-tête de
 *     ce fichier), donc **l'invariant 5 s'y applique sans exception** : une phrase
 *     française, lisible par un auditeur en clientèle. C'est la raison d'être de
 *     la locale `z.locales.fr` posée plus haut ;
 *   · **`code` est pour une MACHINE, et n'est JAMAIS rendu à un humain.** Il porte
 *     un identifiant technique stable — un code de défaut métier, une valeur
 *     d'énumération — sur lequel un front branche sans avoir à analyser une phrase.
 *     Il est **optionnel** : la grande majorité des détails, ceux qui viennent du
 *     compilateur Zod, n'en ont pas.
 *
 * Écrire un identifiant technique dans `message` « parce que le support en a
 * besoin » revient à afficher `en_analyse` à un utilisateur ; l'écrire dans `code`
 * sert le support **sans** toucher à ce que l'utilisateur lit. Les deux besoins
 * cohabitent sur la même ligne de `details`, chacun dans son champ.
 *
 * ── D'OÙ VIENT CE CHAMP, ET POURQUOI IL ARRIVE MAINTENANT ───────────────────
 * `DECISIONS.md` du **2026-08-29** (« Les quatre codes d'erreur du lot ») le retient
 * comme amendement de convention 11 §3, au motif que le rapport ligne à ligne du
 * 03 §35.2 (`{ligne, colonne, code, message}`) est autrement **inexprimable**, et
 * que `banque-questions.ts` promet déjà que « les codes voyageront dans `details[]`,
 * inchangés ». `DECISIONS.md` du **2026-08-31** constate qu'il était resté sur le
 * papier et le déclare **« dû aux lots L3c et L9, qui le poseront avec leur premier
 * usage »** — un code sans appelant étant précisément le « code mort » que la
 * première entrée refuse. **Ce premier usage est arrivé** : le refus de transition
 * du 03 §32.2 (`domaines/missions/service.ts`) a besoin de rendre les états EXACTS
 * au support sans dégrader le message français. Poser ce champ ici n'est donc pas
 * une décision, c'est l'exécution d'un arbitrage daté — même geste, et même
 * raison, que `COMPANY_DUPLICATE` au lot L3a.
 *
 * ⚠ CE QUE `code` N'EST PAS : un code d'erreur HTTP ni une valeur d'`ERROR_CODES`.
 * Celui-là vit dans `error.code`, une seule fois par réponse. Confondre les deux
 * ferait croire à un front qu'une ligne de détail peut changer le sens de la
 * réponse entière.
 *
 * ⚠ CE QUI N'ÉTAIT PAS POSÉ ICI À L'ORIGINE, ET QUI L'EST DEPUIS : le statut **422**
 * et `IMPORT_REJECTED`, seconds amendements de la même entrée du 2026-08-29. Ils
 * appartenaient à l'import CSV (L3c) et à l'import de banque (L9), « qui les
 * poseront avec LEUR premier appelant ». **Ce premier appelant est arrivé** :
 * l'import CSV de l'arbre organisationnel du lot L3c. Voir `ERROR_CODES` ci-dessus.
 */
export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
  /** Identifiant technique, pour une machine. JAMAIS affiché. Voir ci-dessus. */
  code: z.string().optional(),
});

/** L'enveloppe d'erreur, identique sur TOUTES les routes. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]),
    /** Message en français, destiné à être affiché tel quel (invariant 5). */
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Statut HTTP canonique de chaque code — « + statut HTTP cohérent » (11 §3). */
export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  INVALID_PAYLOAD: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REUSE_DETECTED: 401,
  FORBIDDEN: 403,
  NOT_HABILITATED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ILLEGAL_STATE_TRANSITION: 409,
  UNSYNCED_DATA_AT_RISK: 409,
  COMPANY_DUPLICATE: 409,
  COMPANY_EXTERNAL_REF_DUPLICATE: 409,
  QUESTIONNAIRE_ALREADY_FROZEN: 409,
  IMPORT_REJECTED: 422,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Erreur applicative portant son code. Le gestionnaire d'erreurs de Fastify la
 * traduit en réponse — aucune route ne construit d'enveloppe à la main.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: readonly z.infer<typeof errorDetailSchema>[] | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    details?: readonly z.infer<typeof errorDetailSchema>[],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_ERROR_CODE[code];
    this.details = details;
  }

  toResponse(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: [...this.details] } : {}),
      },
    };
  }
}
