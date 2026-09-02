// =============================================================================
// LOT L3 / INCRÉMENT L3b — LES MISSIONS ET LEUR MACHINE À ÉTATS, ÉPROUVÉES SUR
// UN POSTGRESQL RÉEL.
//
// `GET|POST /v1/missions` · `GET|PATCH /v1/missions/:id` ·
// `POST /v1/missions/:id/status`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE, ET SANS L'AVOIR LU.
// ═══════════════════════════════════════════════════════════════════════════════
// 09 §3-2 (« TDD sur les parties critiques : sync, RBAC, scoring, MACHINE À ÉTATS
// — tests écrits AVANT ») et 09 §5.6 (« le code de test n'est JAMAIS écrit par
// l'agent qui a écrit le code testé »). L'implémentation de `missions` était
// écrite EN PARALLÈLE, dans les mêmes heures, par un autre agent : ni
// `apps/api/src/domaines/missions/**` ni `apps/api/src/routes/missions.ts` n'ont
// été ouverts pour rédiger une seule ligne de ce fichier.
//
// Les attentes viennent donc de la SPÉCIFICATION, et d'elle seule :
//   · 03 §32.2 — la machine à états, transcrite COUPLE PAR COUPLE ci-dessous ;
//   · 03 §34.1 — « Décision V1 : la console est ADMIN SEUL » ;
//   · 03 §16.2 — « l'arbre est optionnel en pratique : une racine est créée par
//     défaut » ;
//   · 03 §17.2 (V2.9) — une condition dont la fonctionnalité porteuse n'est pas
//     livrée est RÉPUTÉE SATISFAITE ; 03 §17.3 — le pouvoir de forcer ;
//   · 04 — les colonnes de `missions`, `org_units`, `step_validations` ;
//   · 11 §3 — format d'erreur unique, pagination keyset, dates ISO 8601 UTC ;
//   · `docs/conception/LOT_L3.md` §1, §2, §3b ;
//   · les entrées `DECISIONS.md` du 2026-08-31 « Qui a le droit de faire AVANCER
//     une mission ? » et « Le pouvoir de FORCER une transition ».
//
// **CONSÉQUENCE ASSUMÉE** : une divergence de lecture entre l'implémenteur et
// moi DOIT faire rougir cette suite. C'est le dispositif, pas un accident — et
// c'est la seule façon qu'un écart de contrat se voie AVANT la mise en service
// plutôt qu'en clientèle. Les hypothèses d'interface que la spécification ne
// tranche pas sont NOMMÉES une à une (voir « HYPOTHÈSES D'INTERFACE » plus bas),
// jamais devinées en silence : un test écrit sur une hypothèse non tracée est un
// faux verdict.
//
// ── LES SEPT PROPRIÉTÉS QUI NE SE VOIENT PAS EN RELISANT LE CODE ─────────────
//   1. LES VINGT-CINQ COUPLES (5 statuts × 5) sont énumérés, pas échantillonnés.
//      Sept passent, DIX-HUIT sont refusés — dont les cinq identités et les
//      quatre départs de `cloturee`, qui sont la seule façon d'exprimer
//      « TERMINAL ». Un test qui n'éprouverait que les transitions autorisées
//      serait vert sur une machine à états qui n'en refuse aucune ;
//   2. UNE CONDITION ABSENTE VAUT SATISFAITE (03 §17.2 V2.9). C'est l'inverse du
//      réflexe défensif, et c'est mesurable : `livree → cloturee` doit passer
//      alors que `retrospective_faite` n'a AUCUNE table où se poser. Une
//      implémentation « prudente » qui traiterait l'absence comme un refus
//      verrouillerait le produit sur une fonctionnalité non livrée, et personne
//      ne s'en apercevrait avant la première mission réellement close ;
//   3. `preparation → en_cours` N'EST PAS FORÇABLE, même par un admin motivé.
//      C'est la ligne où la surcharge est la plus tentante et la plus coûteuse :
//      la rendre forçable laisserait lancer une collecte SANS questionnaire figé,
//      c'est-à-dire envoyer le terrain avec zéro question ;
//   4. LE CURSEUR `(created_at, id)` SOUS ÉGALITÉ À LA MICROSECONDE. `created_at`
//      est un `TIMESTAMPTZ` (microsecondes) ; `Date.toISOString()` s'arrête à la
//      milliseconde. Un curseur reconstruit depuis cette `Date` est strictement
//      inférieur à la valeur réelle de la ligne frontière, qui se re-sert alors à
//      chaque page — boucle infinie découverte au premier import réel ;
//   5. LA RACINE PAR DÉFAUT porte un UUID **v7**, pas un v4. `org_units` est
//      créable HORS LIGNE (04 : « UUID v7 côté client possible ») : un
//      `gen_random_uuid()` serveur y casserait l'ordonnancement et l'invariant 1,
//      sans qu'aucune erreur ne soit jamais levée ;
//   6. LE STATUT NE SE CHANGE PAS PAR `PATCH`. Une route de modification
//      généreuse qui recopierait le corps contournerait toute la machine à
//      états — le garde-fou le plus cher du lot, désarmé par la route la plus
//      banale ;
//   7. AUCUNE ROUTE MISSION NE LAISSE SORTIR UN MONTANT, y compris pour un
//      administrateur : `missions` n'a aucune colonne financière au 04, donc une
//      valeur de `scoping_financials` dans une réponse `missions` ne peut venir
//      que d'une jointure que personne n'a demandée.
//
// ── HYPOTHÈSES D'INTERFACE (la spécification est muette — elles sont TRACÉES) ─
//   H1. Le corps de `POST /v1/missions/:id/status` est
//       `{ vers, motif?, surcharge? }` — le vocabulaire de
//       `DemandeTransitionMission`. **HYPOTHÈSE LEVÉE, ET IL FAUT DIRE COMMENT** :
//       elle avait d'abord été posée à `{ status }` (le nom de la route, le nom de
//       la colonne au 04), puis TRANCHÉE en lisant `missionStatusRequestSchema`
//       dans `packages/shared/src/missions.ts`. Ce fichier-là est le CONTRAT
//       PARTAGÉ que 11 §3 impose au front d'importer : le lire est exactement ce
//       que fait la console, et c'est la seule source qui puisse trancher un nom
//       de champ. Ce n'est PAS une lecture du service ni de la route — aucune
//       ligne de `apps/api/src/domaines/missions/**` ni de
//       `apps/api/src/routes/missions.ts` n'a été ouverte.
//       Le point d'appui reste unique : `changerStatut`, ci-dessous, est le seul
//       endroit du fichier qui connaisse la forme du corps.
//   H2. Les écritures rendent la mission soit à plat, soit sous une clé
//       `mission` (`missionCreationResponseSchema` = `{ mission, uniteRacineId }`,
//       `missionStatusResponseSchema` = `{ mission, depuis, vers, sens,
//       surchargeUtilisee }`). `extraireMission` accepte les deux : c'est la SEULE
//       tolérance de forme de ce fichier, et elle ne porte que sur l'ENVELOPPE —
//       jamais sur les champs, jamais sur les valeurs, jamais sur un code
//       d'erreur.
//   H3. Une transition refusée rend `409 ILLEGAL_STATE_TRANSITION` (LOT_L3 §3b,
//       verbatim). Chaque cas est doublé d'une assertion de SUBSTANCE — « le
//       statut en base n'a pas bougé » — qui, elle, ne dépend d'aucun choix de
//       code : si l'arbitrage diverge sur le code, la substance reste prouvée.
//   H4. La liste filtre `deleted_at IS NULL` (précédent L3a, colonne présente au
//       04). Éprouvé explicitement plutôt que supposé.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit franchement ─────────────────────────
//   · il ne prouve RIEN sur `roles: ['admin','consultant']` des quatre
//     transitions « avant ». En V1 la route est admin seul (§34.1) : le refus
//     `role_insuffisant` de la table n'est ATTEIGNABLE PAR AUCUN APPEL HTTP.
//     C'est une couverture de `packages/shared`, pas d'intégration — et le dire
//     vaut mieux que de fabriquer un test qui en aurait l'air ;
//   · il ne mesure aucune durée : un seuil de temps est intermittent en CI, et
//     une suite intermittente finit ignorée ;
//   · il n'éprouve pas la CONCURRENCE sur le `SELECT … FOR UPDATE` de la
//     transition (deux demandes simultanées sur la même mission) : avec
//     `singleFork` et un pool partagé, la mise en scène produirait un test
//     intermittent. Remonté plutôt que simulé ;
//   · il ne dit rien de `delivered_at`, que le 04 porte et qu'aucune section du
//     pack ne relie explicitement à la transition `→ livree`.
//
// Invariant 2 : aucune référence client. Les fixtures portent des libellés
// neutres et des missions fictives.
// Traçabilité : E39 (machine à états mission + transitions contrôlées, §32.2) ·
// E43 (conventions d'API : keyset, format d'erreur, UTC) · E33 et E21
// (étanchéité financière) · E45 (matrice console rôle × espace §34.1) ·
// E30 (niveaux d'audit) · invariants 1, 2, 3, 5 et 7.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ERROR_CODES,
  MOTIFS_RETOUR_ARRIERE,
  TRANSITIONS_MISSION,
  verifierValeursAtomiques,
  type CodeConditionMission,
  type MotifRetourArriere,
  type StatutMission,
} from '@axion/shared';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
// Importé pour sa DÉCLARATION D'AUGMENTATION : c'est elle qui fait connaître
// `app.registreAcces` à TypeScript. Le type sert aussi à typer le parcours du
// registre sans assertion (11 §3 : « aucun any »).
import type { EntreeRegistreAcces } from '../src/auth/politique.js';
import {
  balayerSentinellesFinancieres,
  decrireRapport,
  NOMS_FINANCIERS_INTERDITS,
  parametresDuGabarit,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
  type CartographieDeParametres,
} from './aide/sentinelle-financiere.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '5c'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '7d'.repeat(32);
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';

const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l3b@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// =============================================================================
// LA MACHINE À ÉTATS DU 03 §32.2 — TRANSCRITE ICI, INDÉPENDAMMENT DU CODE
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CETTE TABLE EST RECOPIÉE PLUTÔT QU'IMPORTÉE.
// ═══════════════════════════════════════════════════════════════════════════════
// `TRANSITIONS_MISSION` (packages/shared) EST le sujet : bâtir la matrice de test
// à partir d'elle reviendrait à demander au sujet quelles questions lui poser.
// Une ligne oubliée dans la table disparaîtrait des DEUX côtés le même jour, et
// la suite resterait verte en n'éprouvant plus la transition manquante.
//
// La transcription ci-dessous est faite depuis le texte du pack, phrase par
// phrase :
//   « Transitions autorisées (toute autre = rejetée avec motif) :
//     `preparation → en_cours` (conditions : étapes cadrage ET preparation
//     validées dans `step_validations`, questionnaire figé, plan d'entretiens
//     existant) · `en_cours → en_analyse` (étape collecte validée, ou override
//     admin motivé) · `en_analyse → livree` (export réalisé + validation humaine
//     de livraison) · `livree → cloturee` (rétrospective faite).
//     Retours arrière (admin uniquement, motif obligatoire, tracés
//     `activity_log`) : `en_cours → preparation` · `en_analyse → en_cours` ·
//     `livree → en_analyse`. `cloturee` est TERMINAL. »
//
// Les `roles` des quatre « avant » ne viennent PAS du §32.2, qui n'attache de
// rôle qu'aux retours : ils viennent de l'arbitrage tracé du 2026-08-31 (« Qui a
// le droit de faire AVANCER une mission ? », option 2). La source est différente,
// elle est donc citée différemment.
// =============================================================================

interface TransitionAttendue {
  readonly depuis: StatutMission;
  readonly vers: StatutMission;
  readonly sens: 'avant' | 'retour';
  readonly roles: readonly string[];
  readonly conditions: readonly CodeConditionMission[];
  readonly motifRequis: boolean;
  readonly surchargeAdminMotivee: boolean;
}

const TRANSITIONS_ATTENDUES: readonly TransitionAttendue[] = [
  {
    depuis: 'preparation',
    vers: 'en_cours',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    conditions: [
      'etape_cadrage_validee',
      'etape_preparation_validee',
      'questionnaire_fige',
      'plan_entretiens_etabli',
    ],
    motifRequis: false,
    // §17.3 ne nomme que « en analyse » et « livrée » : ce silence-ci est un
    // refus, pas un oubli — voir la propriété n° 3 de l'en-tête.
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_cours',
    vers: 'en_analyse',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    conditions: ['etape_collecte_validee'],
    motifRequis: false,
    // La SEULE surcharge que le §32.2 nomme lui-même.
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'en_analyse',
    vers: 'livree',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    // Une CONJONCTION, donc deux codes : « export réalisé + validation humaine
    // de livraison ». Les fondre en un seul ferait disparaître la validation
    // HUMAINE, qui est précisément ce que le pack refuse d'automatiser.
    conditions: ['export_realise', 'etape_livraison_validee'],
    motifRequis: false,
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'livree',
    vers: 'cloturee',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    conditions: ['retrospective_faite'],
    motifRequis: false,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_cours',
    vers: 'preparation',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_analyse',
    vers: 'en_cours',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'livree',
    vers: 'en_analyse',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
];

/** Les cinq valeurs de `missions.status` (04, CHECK fermé ; ordre du §32.2). */
const STATUTS: readonly StatutMission[] = [
  'preparation',
  'en_cours',
  'en_analyse',
  'livree',
  'cloturee',
];

function transitionAttendue(
  depuis: StatutMission,
  vers: StatutMission,
): TransitionAttendue | undefined {
  return TRANSITIONS_ATTENDUES.find((ligne) => ligne.depuis === depuis && ligne.vers === vers);
}

/** Les 25 couples (identités comprises), dans un ordre stable et lisible. */
const COUPLES: readonly { readonly depuis: StatutMission; readonly vers: StatutMission }[] =
  STATUTS.flatMap((depuis) => STATUTS.map((vers) => ({ depuis, vers })));

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
/** Identifiant du bloc de questionnaire semé, pour figer un questionnaire. */
let blocSeme = '';
/** Palier d'effectif semé (`size_tiers`), pour une création complète. */
let palierSeme = '';

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// APPELS HTTP
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly message: string | null;
  /**
   * `code` est LU ici parce qu’un `z.object` non strict le STRIPPERAIT en silence :
   * le test ne verrait jamais le champ que le contrat vient de poser, et l’assertion
   * des codes bruts échouerait sans que rien n’en dise la cause. Optionnel, parce
   * que les détails de validation Zod, eux, n’en portent pas.
   */
  readonly details: readonly {
    readonly path: string;
    readonly code?: string | undefined;
    readonly message: string;
  }[];
  readonly corps: string;
}

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), code: z.string().optional(), message: z.string() }))
      .optional(),
  }),
});

/**
 * Une adresse par appel.
 *
 * Le quota global (11 §3) est de 300 req/min et sa clé est le sujet du jeton, ou
 * `request.ip` en repli — donc pour un anonyme, l'adresse. Sans adresse distincte,
 * l'ORDRE des `it` déciderait des verdicts, et une suite dont le résultat dépend
 * de son ordre ne prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.32.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function appeler(
  methode: 'GET' | 'POST' | 'PATCH',
  url: string,
  options: { readonly jeton?: string; readonly charge?: Readonly<Record<string, unknown>> } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
    ...(options.charge === undefined ? {} : { payload: options.charge }),
  });

  let code: string | null = null;
  let message: string | null = null;
  let details: readonly { path: string; code?: string | undefined; message: string }[] = [];
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      message = analyse.data.error.message;
      details = analyse.data.error.details ?? [];
    }
  }
  return { statut: reponse.statusCode, code, message, details, corps: reponse.body };
}

/**
 * Exige qu'un refus `ILLEGAL_STATE_TRANSITION` nomme EXACTEMENT les conditions
 * manquantes attendues — et rien qu'elles — sous la forme retenue à la revue
 * croisée A17 (`DECISIONS.md` 2026-09-02) :
 *
 *   `{ path: 'conditions', code: <code de condition>, message: <libellé français> }`
 *
 * Trois choses sont tenues, et chacune attrape une implémentation différente :
 *   · le CHEMIN est `conditions` — un `path` qui porterait le code lui-même
 *     (l'ancienne forme) ou une chaîne libre ne passe pas ;
 *   · le CODE est exact et l'ensemble est comparé trié : une condition en trop
 *     (« pour être sûr ») échoue autant qu'une condition oubliée ;
 *   · AUCUN code brut n'apparaît dans un `message`, ni celui de l'erreur ni celui
 *     d'un détail — même règle que pour `depuis`/`vers` : ces textes sont
 *     affichés tels quels en clientèle (invariant 5, en-tête de
 *     `packages/shared/src/errors.ts`).
 *
 * Le `JSON.stringify(details).includes(code)` d'avant ne tenait aucune des
 * trois : il était vert avec le code dans `path`, dans `message`, ou noyé dans
 * une liste plus longue que celle attendue.
 */
function exigerConditionsManquantes(reponse: Reponse, attendues: readonly string[]): void {
  const entrees = reponse.details.filter((une) => une.path === 'conditions');
  const codes = entrees.map((une) => une.code).sort();
  expect(
    codes,
    'Le refus doit nommer CHAQUE condition non remplie (LOT_L3 §3b), et RIEN\n' +
      'd’autre, dans `details[]` sous le chemin `conditions`, avec le code exact\n' +
      'dans `details[].code`. Un refus muet oblige l’utilisateur à deviner ; un refus\n' +
      'qui en dit trop lui fait corriger ce qui n’est pas cassé.\n' +
      `Attendu : ${JSON.stringify([...attendues].sort())}\n` +
      `details reçus : ${JSON.stringify(reponse.details)}`,
  ).toStrictEqual([...attendues].sort());

  expect(
    entrees.every((une) => une.message.trim().length > 0),
    'Chaque détail porte un libellé français NON VIDE dans `message` : c’est lui,\n' +
      'et lui seul, que l’écran affiche.',
  ).toBe(true);

  const textes = [reponse.message ?? '', ...reponse.details.map((une) => une.message)];
  const codesEnClair = attendues.filter((code) => textes.some((texte) => texte.includes(code)));
  expect(
    codesEnClair,
    'Un code de condition apparaît dans un texte destiné à être AFFICHÉ. `message`\n' +
      '— celui de l’erreur comme celui d’un détail — est lu tel quel par un auditeur\n' +
      'en clientèle (invariant 5) : il porte des libellés français, jamais des\n' +
      'identifiants techniques.\n' +
      `message : « ${reponse.message ?? ''} »\ndetails : ${JSON.stringify(reponse.details)}`,
  ).toStrictEqual([]);
}

// -----------------------------------------------------------------------------
// LE CONTRAT DE SORTIE — RÉÉCRIT depuis le 04, jamais importé du code testé
// -----------------------------------------------------------------------------
// Importer le schéma de réponse du lot reviendrait à demander au sujet de valider
// sa propre réponse : une clé retirée du contrat disparaîtrait des deux côtés le
// même jour, et le test resterait vert en n'exigeant plus rien.
//
// `z.object` (et non `strictObject`) : une clé SUPPLÉMENTAIRE n'est pas jugée
// ici — elle l'est, nommément, par le test d'étanchéité financière et par le test
// du contrat de colonnes. Ce partage est délibéré : la forme se juge au champ
// près à UN endroit, pour qu'un écart produise UN rouge lisible et non quarante.

const missionSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  title: z.string().min(1),
  geoScope: z.enum(['france', 'multi_pays']),
  auditLevel: z.enum(['diagnostic_cadrage', 'operationnel', 'strategique_groupe']),
  status: z.enum(['preparation', 'en_cours', 'en_analyse', 'livree', 'cloturee']),
  timezone: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type Mission = z.infer<typeof missionSchema>;

const pageMissionsSchema = z.object({
  items: z.array(missionSchema),
  nextCursor: z.string().nullable(),
});
type PageMissions = z.infer<typeof pageMissionsSchema>;

/**
 * Extrait la mission d'un corps de réponse — À PLAT ou sous la clé `mission`.
 *
 * C'est l'hypothèse H2 de l'en-tête, et la SEULE tolérance de forme du fichier.
 * Elle ne porte que sur l'enveloppe : les champs, eux, sont validés au champ près
 * par `missionSchema`. Rend `null` si aucune des deux formes ne tient — l'appelant
 * en fait un échec explicite plutôt qu'une exception opaque.
 */
function extraireMission(reponse: Reponse): Mission | null {
  if (reponse.corps === '') return null;
  const brut: unknown = JSON.parse(reponse.corps);
  const aPlat = missionSchema.safeParse(brut);
  if (aPlat.success) return aPlat.data;
  const enveloppee = z.object({ mission: missionSchema }).safeParse(brut);
  return enveloppee.success ? enveloppee.data.mission : null;
}

/** Idem, mais échoue le test si la mission est introuvable — cas nominal. */
function mission(reponse: Reponse): Mission {
  const extraite = extraireMission(reponse);
  expect(
    extraite,
    'La réponse ne porte aucune mission reconnaissable — ni à plat, ni sous la clé\n' +
      '`mission`. Les champs attendus sont ceux du 04 : id, companyId, title,\n' +
      'geoScope, auditLevel, status, timezone, createdAt, updatedAt (camelCase,\n' +
      `11 §3). Corps reçu :\n${reponse.corps.slice(0, 800)}`,
  ).not.toBeNull();
  if (extraite === null) throw new Error('mission absente de la réponse');
  return extraite;
}

/** Lit un corps JSON comme un dictionnaire, sans jamais employer `any`. */
function objetJson(valeur: unknown): Record<string, unknown> {
  const analyse = z.record(z.string(), z.unknown()).safeParse(valeur);
  return analyse.success ? analyse.data : {};
}

function page(reponse: Reponse): PageMissions {
  const brut: unknown = JSON.parse(reponse.corps);
  const analyse = pageMissionsSchema.safeParse(brut);
  expect(
    analyse.success,
    'La liste ne respecte pas l’enveloppe de page du contrat (11 §3) :\n' +
      `{ items: [...], nextCursor: string | null }. Corps reçu :\n${reponse.corps.slice(0, 800)}`,
  ).toBe(true);
  return pageMissionsSchema.parse(brut);
}

// -----------------------------------------------------------------------------
// COMPTES — un compte NEUF par test, jamais un compte partagé
// -----------------------------------------------------------------------------

type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte et frappe son jeton d'accès.
 *
 * Ni `POST /v1/auth/login` ni Argon2id : le quota `/v1/auth/*` (10 req/min/IP)
 * ferait dépendre cette suite d'un plafond qui ne la concerne pas, et la
 * dérivation coûte ~19 Mio par appel pour éprouver un chemin qui a déjà sa suite
 * (`l2-auth-routes`). Le jeton est frappé par `app.jwt.sign`, donc par LA MÊME
 * clé que la route de connexion, et il ne porte que `sub` : le crochet
 * d'autorisation relit le rôle EN BASE (06 §10.1), rien n'est court-circuité.
 *
 * `habilitated_at` est posé : la règle §34.4 ne fait pas partie du périmètre de
 * ce fichier, et un compte non habilité y produirait des `403 NOT_HABILITATED`
 * qui masqueraient les refus de RÔLE, seuls éprouvés ici.
 */
async function creerCompte(role: RoleUtilisateur, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [id, `Compte ${suffixe}`, `compte.${suffixe}@exemple.test`, role],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

// -----------------------------------------------------------------------------
// FIXTURES — semées par SQL DIRECT quand elles ne relèvent pas du lot éprouvé
// -----------------------------------------------------------------------------
// Une entreprise est une fixture de L3a, pas le sujet de L3b : la semer par SQL
// évite de faire dépendre 40 tests de missions du contrat d'une AUTRE route.
// C'est une fabrication d'ÉTAT, jamais une fabrication de RÉSULTAT.

let compteurEntreprise = 0;

async function semerEntreprise(): Promise<string> {
  compteurEntreprise += 1;
  const id = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    id,
    `Entreprise fictive ${String(compteurEntreprise)}`,
  ]);
  return id;
}

/** Le statut RÉELLEMENT en base — la seule vérité sur ce qu'une route a écrit. */
async function statutEnBase(missionId: string): Promise<string | null> {
  const resultat = await bd().query<{ status: string }>(
    'SELECT status FROM missions WHERE id = $1',
    [missionId],
  );
  return resultat.rows[0]?.status ?? null;
}

/**
 * Place une mission dans un statut de DÉPART par SQL direct.
 *
 * Il n'y a pas d'autre voie : atteindre `cloturee` par l'API demanderait de
 * franchir quatre transitions et de semer toutes leurs conditions, pour ensuite
 * éprouver… le refus des transitions qui en partent. La mise en scène coûterait
 * plus cher que ce qu'elle prouverait, et elle rendrait chaque cas de la matrice
 * dépendant du succès des précédents — un seul défaut ferait alors tomber
 * dix-huit verdicts sans rapport entre eux.
 */
async function placerStatut(missionId: string, statut: StatutMission): Promise<void> {
  const resultat = await bd().query('UPDATE missions SET status = $2 WHERE id = $1', [
    missionId,
    statut,
  ]);
  expect(resultat.rowCount, 'la mission à repositionner doit exister').toBe(1);
}

/** Valide une étape du pilote de mission (`step_validations`, 04 + §32.2). */
async function validerEtape(
  missionId: string,
  code: 'cadrage' | 'preparation' | 'collecte' | 'analyse' | 'rapport' | 'livraison',
  parQui: string,
): Promise<void> {
  await bd().query(
    `INSERT INTO step_validations (id, mission_id, step_code, scope, validated_by, validated_at)
     VALUES ($1, $2, $3, 'mission', $4, now())`,
    [uuidv7(), missionId, code, parQui],
  );
}

/**
 * Fige un questionnaire minimal : une `questions` + une `mission_questions`.
 *
 * `questionnaire_fige` se mesure à « l'existence de lignes `mission_questions` »
 * (contrat partagé `packages/shared/src/missions.ts`, qui est une DONNÉE de
 * contrat et non l'implémentation du service). Les huit colonnes `*_snapshot` du
 * 04 sont renseignées : un figeage est une CAPTURE, et une capture vide ne
 * prouverait pas qu'on sait la distinguer d'une référence.
 */
async function figerQuestionnaire(missionId: string): Promise<void> {
  const questionId = uuidv7();
  await bd().query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, guidance_fr, answer_type,
                            criticality, weight, origin)
     VALUES ($1, $2, 1, 'active', $3, $4, 'scale_1_5', 'important', 1, 'banque')`,
    [
      questionId,
      blocSeme,
      'Question fictive de figeage — libellé neutre (invariant 2).',
      '1 = jamais, 3 = parfois, 5 = systematiquement.',
    ],
  );
  await bd().query(
    `INSERT INTO mission_questions
       (id, mission_id, question_id, question_version, text_snapshot, options_snapshot,
        weight_snapshot, scoring_snapshot, guidance_snapshot, answer_type_snapshot,
        criticality_snapshot, allow_range_snapshot, position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, NULL, 1, NULL, $5, 'scale_1_5', 'important', false, 1, false)`,
    [
      uuidv7(),
      missionId,
      questionId,
      'Question fictive de figeage — libellé neutre (invariant 2).',
      '1 = jamais, 3 = parfois, 5 = systematiquement.',
    ],
  );
}

// -----------------------------------------------------------------------------
// RACCOURCIS D'ÉCRITURE PAR L'API — le sujet, lui, passe TOUJOURS par la route
// -----------------------------------------------------------------------------

interface CorpsCreation {
  readonly companyId: string;
  readonly title: string;
  readonly geoScope: 'france' | 'multi_pays';
  readonly auditLevel: 'diagnostic_cadrage' | 'operationnel' | 'strategique_groupe';
  readonly [autre: string]: unknown;
}

let compteurMission = 0;

function corpsMissionMinimal(companyId: string, marqueur: string): CorpsCreation {
  compteurMission += 1;
  return {
    companyId,
    title: `Mission fictive ${marqueur} ${String(compteurMission)}`,
    geoScope: 'france',
    auditLevel: 'operationnel',
  };
}

/** Crée une mission par l'API et exige un 201. */
async function creerMission(
  jeton: string,
  marqueur: string,
  entrepriseId?: string,
): Promise<Mission> {
  const companyId = entrepriseId ?? (await semerEntreprise());
  const reponse = await appeler('POST', '/v1/missions', {
    jeton,
    charge: corpsMissionMinimal(companyId, marqueur),
  });
  expect(
    reponse.statut,
    'La création d’une mission avec les quatre champs NOT NULL du 04 (companyId,\n' +
      'title, geoScope, auditLevel) doit rendre 201. Réponse reçue :\n' +
      `${String(reponse.statut)} ${reponse.corps.slice(0, 600)}`,
  ).toBe(201);
  return mission(reponse);
}

/**
 * Demande une transition. **C'est ici, et seulement ici, que vit l'hypothèse H1**
 * sur la forme du corps (`{ vers, motif?, surcharge? }`, vocabulaire de
 * `missionStatusRequestSchema` / `DemandeTransitionMission`). Un seul point à
 * corriger si le contrat partagé change, et tout le reste du fichier tient.
 */
async function changerStatut(
  jeton: string | undefined,
  missionId: string,
  vers: StatutMission,
  options: { readonly motif?: MotifRetourArriere; readonly surcharge?: boolean } = {},
): Promise<Reponse> {
  return appeler('POST', `/v1/missions/${missionId}/status`, {
    ...(jeton === undefined ? {} : { jeton }),
    charge: {
      vers,
      ...(options.motif === undefined ? {} : { motif: options.motif }),
      ...(options.surcharge === undefined ? {} : { surcharge: options.surcharge }),
    },
  });
}

/**
 * Sème TOUT ce qu'exige une transition « avant » pour être franchissable.
 *
 * Ne sème QUE les conditions mesurables : `plan_entretiens_etabli`,
 * `export_realise` et `retrospective_faite` n'ont aucune table où se poser en
 * Phase 1 et sont réputées satisfaites (03 §17.2 V2.9). Les semer serait
 * impossible ; les exiger rendrait le produit infranchissable.
 */
async function semerConditions(
  missionId: string,
  vers: StatutMission,
  parQui: string,
): Promise<void> {
  if (vers === 'en_cours') {
    await validerEtape(missionId, 'cadrage', parQui);
    await validerEtape(missionId, 'preparation', parQui);
    await figerQuestionnaire(missionId);
    return;
  }
  if (vers === 'en_analyse') {
    await validerEtape(missionId, 'collecte', parQui);
    return;
  }
  if (vers === 'livree') {
    await validerEtape(missionId, 'livraison', parQui);
    return;
  }
  // `cloturee` : `retrospective_faite` n'a aucune table — rien à semer, et c'est
  // exactement ce que la propriété n° 2 de l'en-tête met à l'épreuve.
}

// -----------------------------------------------------------------------------
// UUID v7 — vérifié SANS la bibliothèque qui les fabrique
// -----------------------------------------------------------------------------

/** Version d'un UUID : le 13ᵉ chiffre hexadécimal (`xxxxxxxx-xxxx-Vxxx-…`). */
function versionUuid(id: string): string {
  return id.slice(14, 15);
}

/** Variante RFC 4122 : le 17ᵉ chiffre doit être 8, 9, a ou b. */
function varianteUuid(id: string): string {
  return id.slice(19, 20).toLowerCase();
}

/** Les 48 premiers bits d'un UUID v7 = l'instant de création, en ms Unix. */
function horodatageUuidV7(id: string): number {
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l3b_missions');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  // Le seed peuple `blocks` et `size_tiers` : sans eux, ni questionnaire figé
  // (donc aucune transition `preparation → en_cours` franchissable) ni création
  // complète possible.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  const bloc = await bd().query<{ id: string }>(
    "SELECT id FROM blocks WHERE code = 'bloc_1' LIMIT 1",
  );
  blocSeme = bloc.rows[0]?.id ?? '';
  if (blocSeme === '') throw new Error('le seed n’a pas posé `bloc_1` : le figeage est impossible');

  const palier = await bd().query<{ id: string }>(
    "SELECT id FROM size_tiers WHERE code = 'pme' LIMIT 1",
  );
  palierSeme = palier.rows[0]?.id ?? '';
  if (palierSeme === '') throw new Error('le seed n’a pas posé le palier `pme`');

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit
  // être posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = TTL_ACCES;
  process.env.JWT_REFRESH_TTL = TTL_RAFRAICHISSEMENT;
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// 1. LA TABLE PARTAGÉE CONTRE LE §32.2 — L'ÉCART SE VOIT ICI OU NULLE PART
// =============================================================================
describe('TRANSITIONS_MISSION (packages/shared) vs 03 §32.2', () => {
  it('@critique la table partagée porte EXACTEMENT les sept lignes du §32.2, et rien d’autre', () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Trois, et toutes les trois ont déjà été écrites ailleurs par quelqu'un :
    //   · la table à qui l'on AJOUTE une ligne de confort (`cloturee → livree`,
    //     « pour pouvoir corriger ») — c'est la fin de « TERMINAL », et cela ne
    //     se verrait dans aucun test qui n'énumère que les cas autorisés ;
    //   · la table où `motifRequis` est faux sur un retour, parce que le champ a
    //     été recopié d'une ligne « avant » : le journal dirait QU'ON est revenu
    //     en arrière, jamais POURQUOI (invariant 7) ;
    //   · la table où `surchargeAdminMotivee` est vrai partout, « puisque l'admin
    //     peut tout » : un admin lancerait alors une collecte sans questionnaire.
    //
    // La console (`apps/hq`) lit cette table pour décider quels boutons griser
    // SANS appeler l'API : un écart ici se paie deux fois, à l'écran et au
    // serveur, et personne ne verrait lequel des deux a tort.
    const decrire = (ligne: {
      depuis: string;
      vers: string;
      sens: string;
      roles: readonly string[];
      conditions: readonly string[];
      motifRequis: boolean;
      surchargeAdminMotivee: boolean;
    }): string =>
      [
        `${ligne.depuis} → ${ligne.vers}`,
        ligne.sens,
        `roles=[${[...ligne.roles].sort((a, b) => a.localeCompare(b)).join(',')}]`,
        `conditions=[${[...ligne.conditions].sort((a, b) => a.localeCompare(b)).join(',')}]`,
        `motifRequis=${String(ligne.motifRequis)}`,
        `surcharge=${String(ligne.surchargeAdminMotivee)}`,
      ].join(' · ');

    const attendues = TRANSITIONS_ATTENDUES.map(decrire).sort((a, b) => a.localeCompare(b));
    const livrees = TRANSITIONS_MISSION.map(decrire).sort((a, b) => a.localeCompare(b));

    expect(
      livrees,
      'La table livrée diverge de la transcription du 03 §32.2 faite dans ce fichier.\n' +
        'Ce n’est PAS un désaccord de style : cette table est lue par la console pour\n' +
        'griser des boutons ET par le service pour refuser des transitions. Si les deux\n' +
        'lectures divergent, l’écran promet ce que le serveur refuse — ou l’inverse, ce\n' +
        'qui est pire. Toute correction se trace dans `DECISIONS.md`, jamais en\n' +
        'alignant le test sur le code.',
    ).toStrictEqual(attendues);
  });

  it('@critique `cloturee` n’apparaît en `depuis` sur AUCUNE ligne — c’est ainsi que « TERMINAL » s’écrit', () => {
    // Le §32.2 écrit « `cloturee` est TERMINAL (jamais rouvert ; suite = ré-audit,
    // nouvelle mission §6.4) ». Un drapeau `terminal: true` serait une seconde
    // source de vérité, qu'un jour on oublierait de tenir à jour : c'est
    // l'ABSENCE qui porte la règle, et une absence ne se relit pas — elle se
    // teste.
    expect(
      TRANSITIONS_MISSION.filter((ligne) => ligne.depuis === 'cloturee').map(
        (ligne) => `${ligne.depuis} → ${ligne.vers}`,
      ),
      'Une transition part de `cloturee` : une mission close redeviendrait modifiable,\n' +
        'et le rapport livré au client cesserait d’être un état arrêté.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 2. CRÉATION — CE QUE LA ROUTE ÉCRIT, ET CE QU'ELLE REFUSE D'ÉCRIRE
// =============================================================================
describe('POST /v1/missions', () => {
  it('@critique une mission naît en `preparation`, quoi que demande l’appelant', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui recopie le corps de la requête dans la ligne (`{ ...corps }`),
    // qui est le geste le plus naturel du monde avec un ORM typé. Une mission
    // pourrait alors naître `livree` : toute la machine à états serait
    // contournée non pas en la cassant, mais en ne la traversant JAMAIS. Le
    // §32.2 ne décrit un cycle de vie que si l'entrée du cycle est unique.
    //
    // Les DEUX issues acceptables sont admises — refus explicite, ou champ
    // ignoré — parce que le pack ne tranche pas entre elles ; ce qui n'est PAS
    // négociable, c'est la substance : la ligne écrite est en `preparation`.
    const admin = await creerCompte('admin', 'creation-statut');
    const entreprise = await semerEntreprise();

    const reponse = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: { ...corpsMissionMinimal(entreprise, 'statut-impose'), status: 'livree' },
    });

    if (reponse.statut === 201) {
      const creee = mission(reponse);
      expect(
        creee.status,
        'La mission a été créée dans le statut DEMANDÉ. Une mission peut donc naître\n' +
          '« livrée » sans qu’aucune condition du §32.2 n’ait été vérifiée : la machine à\n' +
          'états n’est plus un garde-fou, c’est une décoration.',
      ).toBe('preparation');
      expect(await statutEnBase(creee.id)).toBe('preparation');
    } else {
      expect(
        reponse.statut,
        'Un `status` refusé à la création est un choix DÉFENDABLE (le statut se change\n' +
          'par `POST /v1/missions/:id/status`, et par là seulement) — mais alors le refus\n' +
          'est une erreur de validation, pas un 500 ni un 403.',
      ).toBe(400);
      expect(reponse.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }

    const enPreparation = await bd().query<{ total: string }>(
      "SELECT count(*) AS total FROM missions WHERE company_id = $1 AND status <> 'preparation'",
      [entreprise],
    );
    expect(
      Number(enPreparation.rows[0]?.total ?? '0'),
      'Aucune mission de cette entreprise ne doit exister hors `preparation`.',
    ).toBe(0);
  });

  it('@critique la mission créée porte un UUID **v7** applicatif, pas un v4 de base', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // `DEFAULT gen_random_uuid()` posé sur la table, ou un `crypto.randomUUID()`
    // côté service. Les deux produisent un UUID parfaitement valide : rien ne
    // casse, rien ne lève, et l'ordonnancement temporel des identifiants —
    // c'est-à-dire le tri de secours du curseur keyset et la fusion hors ligne —
    // disparaît en silence. Le 11 §2 l'écrit sans détour : « UUID v7 généré CÔTÉ
    // APPLICATIF, client ET serveur ».
    //
    // La version SEULE ne suffirait pas : un v4 dont le 13ᵉ chiffre vaudrait 7
    // par hasard passerait. On vérifie donc aussi que les 48 bits de tête
    // portent un instant PROCHE DE MAINTENANT — ce qu'un aléa ne fait pas.
    const admin = await creerCompte('admin', 'uuid-v7');
    const creee = await creerMission(admin.jeton, 'uuid');

    expect(
      versionUuid(creee.id),
      `L’identifiant « ${creee.id} » n’est pas un UUID v7 (13ᵉ chiffre hexadécimal).`,
    ).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(varianteUuid(creee.id));

    const ecart = Math.abs(Date.now() - horodatageUuidV7(creee.id));
    expect(
      ecart,
      'Les 48 bits de tête d’un UUID v7 SONT l’instant de création. Un écart de plus\n' +
        'de cinq minutes signifie que ces bits ne portent pas un horodatage : le\n' +
        'préfixe est aléatoire, donc l’identifiant n’est pas ordonnable, et le curseur\n' +
        'keyset perd son départage.',
    ).toBeLessThan(5 * 60 * 1000);
  });

  it('@critique la création d’une mission crée SA racine d’organisation, et une seule', async () => {
    // 03 §16.2 : « le boulanger 5 personnes → 1 seule unité racine. Zéro friction
    // (l’arbre est optionnel en pratique : UNE RACINE EST CRÉÉE PAR DÉFAUT) ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui ne crée rien : l'auditeur d'une TPE devrait alors inventer un
    //     arbre avant de poser sa première question, et `interviews.org_unit_id`
    //     (NOT NULL au 04) n'aurait aucune valeur à recevoir — la collecte serait
    //     bloquée au premier entretien, en clientèle, hors ligne ;
    //   · celle qui en crée DEUX (une par appel de service, un `INSERT` rejoué
    //     dans une transaction retentée) : l'arbre naîtrait ambigu, et §3c de la
    //     note de conception — « re-import refusé SAUF si l'arbre ne contient que
    //     la racine créée par défaut » — deviendrait indécidable ;
    //   · celle qui crée la racine avec un `gen_random_uuid()` : `org_units` est
    //     créable HORS LIGNE (04), son identifiant doit être un v7.
    const admin = await creerCompte('admin', 'racine');
    const entreprise = await semerEntreprise();
    const reponseCreation = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: corpsMissionMinimal(entreprise, 'racine'),
    });
    expect(
      reponseCreation.statut,
      `création refusée : ${reponseCreation.corps.slice(0, 400)}`,
    ).toBe(201);
    const creee = mission(reponseCreation);

    const unites = await bd().query<{
      id: string;
      parent_id: string | null;
      status: string;
      in_scope: boolean;
      name: string;
      kind: string;
    }>('SELECT id, parent_id, status, in_scope, name, kind FROM org_units WHERE mission_id = $1', [
      creee.id,
    ]);

    expect(
      unites.rowCount,
      'Exactement UNE unité doit exister après la création : ni zéro (l’arbre est\n' +
        'optionnel, donc il doit exister sans que personne ne le saisisse), ni deux\n' +
        '(l’arbre naîtrait ambigu et la règle de ré-import du §3c deviendrait\n' +
        'indécidable).',
    ).toBe(1);

    const racine = unites.rows[0];
    if (racine === undefined) throw new Error('racine absente');

    expect(racine.parent_id, 'une racine n’a pas de parent').toBeNull();
    expect(
      racine.status,
      'La racine est `active`. `proposee` la ferait apparaître dans la file de\n' +
        'qualification du §25.3 alors que personne ne l’a proposée.',
    ).toBe('active');
    expect(
      racine.in_scope,
      'Une racine hors périmètre exclurait du scoring TOUTE la mission (§25.1).',
    ).toBe(true);
    expect(racine.name.trim().length, 'la racine porte un libellé non vide').toBeGreaterThan(0);
    expect(
      versionUuid(racine.id),
      `La racine « ${racine.id} » n’a pas un UUID v7. Le 04 écrit « UUID v7 côté client\n` +
        'possible (proposition terrain §25.3) » : une unité créée par le serveur avec un\n' +
        'v4 casse l’ordonnancement que le terrain, lui, respecte.',
    ).toBe('7');

    // La réponse doit DÉSIGNER cette racine : sans son identifiant, l'appelant ne
    // peut pas la renommer et devrait la retrouver en listant l'arbre — c'est-à-
    // dire deviner laquelle des unités est celle qu'on vient de créer pour lui.
    const enveloppe = objetJson(JSON.parse(reponseCreation.corps));
    expect(
      enveloppe.uniteRacineId,
      'La réponse de création ne désigne pas l’unité racine créée d’office.',
    ).toBe(racine.id);
  });

  it('le contrat de sortie porte les colonnes de `missions` (04)', async () => {
    // CE TEST EST UN INVENTAIRE, PAS UN JUGEMENT DE STYLE — et il est isolé
    // exprès : un champ manquant produit UN rouge nommant tous les manquants,
    // plutôt que quarante rouges sans rapport apparent.
    //
    // `deletedAt` est délibérément ABSENT de l'attendu : aucune route de ce lot
    // ne rend une mission supprimée (précédent L3a), un champ qui ne prendrait
    // jamais qu’une valeur mentirait sur ce qu’il documente.
    const admin = await creerCompte('admin', 'contrat-colonnes');
    const entreprise = await semerEntreprise();
    const reponse = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: {
        ...corpsMissionMinimal(entreprise, 'colonnes'),
        geoScope: 'multi_pays',
        countryCode: 'BE',
        sizeTierId: palierSeme,
        activeSectors: ['industrie'],
        activeBlocks: ['bloc_1'],
        commercialOffer: 'mission_pme',
        timezone: 'Europe/Brussels',
        ndaRef: 'NDA-FICTIF-001',
        llmProvider: 'anthropic',
      },
    });
    expect(reponse.statut, `création complète refusée : ${reponse.corps.slice(0, 600)}`).toBe(201);

    const contenu = objetJson(JSON.parse(reponse.corps));
    expect(Object.keys(contenu).length, 'la réponse est un objet JSON non vide').toBeGreaterThan(0);
    const source = 'mission' in contenu ? objetJson(contenu.mission) : contenu;

    const attendus = [
      'id',
      'companyId',
      'parentMissionId',
      'title',
      'geoScope',
      'countryCode',
      'sizeTierId',
      'activeSectors',
      'activeBlocks',
      'auditLevel',
      'commercialOffer',
      'timezone',
      'ndaRef',
      'ndaSignedAt',
      'status',
      'llmProvider',
      'startPlanned',
      'endPlanned',
      'deliveredAt',
      'createdBy',
      'createdAt',
      'updatedAt',
    ];
    const manquants = attendus.filter((champ) => !(champ in source));

    expect(
      manquants,
      'Ces colonnes du 04 ne sortent pas de l’API. Ce n’est pas une question de\n' +
        'confort : `activeSectors`/`activeBlocks` pilotent l’assemblage M2, `timezone`\n' +
        'décide de l’heure affichée au terrain (§22.2), `sizeTierId` sélectionne les\n' +
        'questions par palier. Un champ absent du contrat est un champ que la console\n' +
        'ne peut pas montrer — et que personne ne réclamera avant la recette.',
    ).toStrictEqual([]);

    expect(
      source.countryCode,
      'Une mission `multi_pays` porte son `country_code` (04, V2.9).',
    ).toBe('BE');
    expect(source.timezone, 'le fuseau de mission est celui qu’on a demandé').toBe(
      'Europe/Brussels',
    );
  });

  it('les champs NOT NULL du 04 sont exigés : une création incomplète est refusée', async () => {
    const admin = await creerCompte('admin', 'creation-invalide');
    const entreprise = await semerEntreprise();
    const complet = corpsMissionMinimal(entreprise, 'invalide');

    const cas: readonly { readonly quoi: string; readonly charge: Record<string, unknown> }[] = [
      { quoi: 'sans title', charge: { ...complet, title: undefined } },
      { quoi: 'title vide', charge: { ...complet, title: '   ' } },
      { quoi: 'sans companyId', charge: { ...complet, companyId: undefined } },
      { quoi: 'geoScope hors énumération', charge: { ...complet, geoScope: 'monde' } },
      { quoi: 'auditLevel hors énumération', charge: { ...complet, auditLevel: 'express' } },
      // « Europe/Bruxelles » N’EST PAS un identifiant IANA — le nom réel est
      // « Europe/Brussels ». Ce cas est né d’une faute de MA part, attrapée par la
      // validation de la route : il reste ici parce qu’un fuseau plausible mais
      // inexistant est exactement ce qu’un humain saisit, et parce qu’une mission
      // au mauvais fuseau afficherait à l’auditeur des heures d’entretien fausses
      // (§22.2) sans qu’aucune erreur ne soit jamais levée.
      {
        quoi: 'timezone hors référentiel IANA',
        charge: { ...complet, timezone: 'Europe/Bruxelles' },
      },
      { quoi: 'timezone vide', charge: { ...complet, timezone: '' } },
    ];

    const acceptes: string[] = [];
    for (const cas_ of cas) {
      const reponse = await appeler('POST', '/v1/missions', {
        jeton: admin.jeton,
        charge: cas_.charge,
      });
      if (reponse.statut !== 400 || reponse.code !== ERROR_CODES.VALIDATION_FAILED) {
        acceptes.push(`${cas_.quoi} → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }

    expect(
      acceptes,
      'Les CHECK du 04 sont le dernier cran, pas le premier : une valeur hors\n' +
        'énumération doit être refusée par le schéma Zod de la route (11 §3), avec le\n' +
        'champ fautif nommé — pas par un 500 remonté du pilote PostgreSQL.',
    ).toStrictEqual([]);
  });

  it('une entreprise inexistante est un 400 nommant le champ, jamais un 500', async () => {
    const admin = await creerCompte('admin', 'entreprise-absente');
    const reponse = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: corpsMissionMinimal(uuidv7(), 'orpheline'),
    });

    expect(
      reponse.statut,
      'Une clé étrangère violée (23503) doit être traduite. Sans traduction, la\n' +
        'console affiche « une erreur interne est survenue » là où l’utilisateur doit\n' +
        'lire « cette entreprise n’existe pas ».',
    ).toBe(400);
    expect(reponse.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(reponse.details.map((detail) => detail.path)).toStrictEqual(['companyId']);
  });
});

// =============================================================================
// 3. LES SEPT TRANSITIONS AUTORISÉES — LA CONTRE-ÉPREUVE DES DIX-HUIT REFUS
// =============================================================================
// Sans cette section, « toute transition interdite est refusée » serait VERT sur
// une route qui refuse TOUT LE MONDE, y compris ce qu'elle doit laisser passer.
// Un test de refus sans son pendant ne prouve rien d'autre que l'existence d'un
// mur.
describe('POST /v1/missions/:id/status — les transitions AUTORISÉES (§32.2)', () => {
  for (const attendue of TRANSITIONS_ATTENDUES) {
    const intitule =
      `@critique ${attendue.depuis} → ${attendue.vers} (${attendue.sens}) passe ` +
      `quand ses conditions sont réunies${attendue.motifRequis ? ' et le motif fourni' : ''}`;

    it(intitule, async () => {
      const admin = await creerCompte('admin', `ok-${attendue.depuis}-${attendue.vers}`);
      const creee = await creerMission(admin.jeton, 'transition');
      await placerStatut(creee.id, attendue.depuis);
      await semerConditions(creee.id, attendue.vers, admin.id);

      const reponse = await changerStatut(admin.jeton, creee.id, attendue.vers, {
        // Un motif est fourni même quand il n'est pas requis : sa présence ne peut
        // JAMAIS être une cause de refus, donc elle n'affaiblit aucun verdict —
        // tandis que son absence en aurait été une sur les trois retours.
        motif: 'demande_du_client',
      });

      expect(
        reponse.statut,
        `La transition ${attendue.depuis} → ${attendue.vers} est autorisée par le §32.2 et\n` +
          'toutes ses conditions MESURABLES ont été semées. Un refus ici signifie que la\n' +
          'route refuse ce que la spécification autorise — le produit est alors bloqué à\n' +
          `l’étape correspondante, sans recours.\nRéponse : ${reponse.corps.slice(0, 600)}`,
      ).toBe(200);

      expect(
        await statutEnBase(creee.id),
        'Le 200 doit correspondre à une ÉCRITURE. Une route qui répond « c’est fait »\n' +
          'sans écrire produirait une console qui affiche un statut que la base ignore.',
      ).toBe(attendue.vers);
    });
  }

  it('la réponse d’une transition rend la mission À JOUR', async () => {
    // Isolé du test précédent (qui, lui, ne dépend que de la BASE) : si
    // l'enveloppe de réponse diverge de l'hypothèse H2, un seul cas rougit, et
    // les sept transitions restent prouvées.
    const admin = await creerCompte('admin', 'reponse-transition');
    const creee = await creerMission(admin.jeton, 'reponse');
    await placerStatut(creee.id, 'en_cours');

    const reponse = await changerStatut(admin.jeton, creee.id, 'preparation', {
      motif: 'perimetre_a_reprendre',
    });
    expect(reponse.statut).toBe(200);
    expect(
      mission(reponse).status,
      'La réponse doit porter le NOUVEAU statut : une console qui devrait relire la\n' +
        'mission après chaque transition afficherait, entre les deux appels, un état\n' +
        'périmé.',
    ).toBe('preparation');
  });
});

// =============================================================================
// 4. LES DIX-HUIT COUPLES INTERDITS — ÉNUMÉRÉS, JAMAIS ÉCHANTILLONNÉS
// =============================================================================
describe('POST /v1/missions/:id/status — les transitions INTERDITES (§32.2 : « toute autre = rejetée »)', () => {
  for (const couple of COUPLES) {
    if (transitionAttendue(couple.depuis, couple.vers) !== undefined) continue;

    const identite = couple.depuis === couple.vers;
    const terminal = couple.depuis === 'cloturee';
    const intitule =
      `@critique ${couple.depuis} → ${couple.vers} est refusée` +
      (identite ? ' (identité : un clic n’est pas une transition)' : '') +
      (terminal ? ' (`cloturee` est TERMINAL)' : '');

    it(intitule, async () => {
      // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CES CAS ATTRAPENT-ILS ?
      //   · le `switch` sur le statut CIBLE seul, qui autorise `preparation →
      //     livree` parce que `livree` « est un statut valide » ;
      //   · la table écrite comme un ensemble d'états ACCESSIBLES plutôt que de
      //     COUPLES, qui rend `cloturee → en_cours` franchissable dès lors
      //     qu'`en_cours` figure quelque part ;
      //   · l'identité tolérée « parce qu'elle ne change rien » : elle écrit une
      //     ligne d'`activity_log` pour un non-événement, et la trace d'audit se
      //     remplit d'actes qui n'ont pas eu lieu.
      //
      // Un motif est TOUJOURS fourni : ainsi la seule cause possible du refus est
      // le couple lui-même, jamais un motif manquant.
      const admin = await creerCompte('admin', `ko-${couple.depuis}-${couple.vers}`);
      const creee = await creerMission(admin.jeton, 'interdite');
      await placerStatut(creee.id, couple.depuis);
      // Les conditions de la cible sont semées MALGRÉ TOUT : un refus obtenu
      // parce qu'une condition manquait ne prouverait pas que le COUPLE est
      // refusé.
      await semerConditions(creee.id, couple.vers, admin.id);

      const reponse = await changerStatut(admin.jeton, creee.id, couple.vers, {
        motif: 'erreur_de_manipulation',
      });

      expect(
        reponse.statut,
        `${couple.depuis} → ${couple.vers} ne figure pas au §32.2 : elle doit être REFUSÉE.\n` +
          'Un 200 ici signifie que la machine à états ne connaît pas ce couple, donc\n' +
          'qu’elle ne connaît probablement aucun couple — et le §32.2 devient une\n' +
          `intention.\nRéponse : ${reponse.corps.slice(0, 400)}`,
      ).toBe(409);
      expect(
        reponse.code,
        'Le code est `ILLEGAL_STATE_TRANSITION` (LOT_L3 §3b, verbatim) : la requête est\n' +
          'bien formée et l’appelant a les droits — c’est l’ÉTAT de la ressource qui s’y\n' +
          'oppose, ce qui est la définition de 409.',
      ).toBe(ERROR_CODES.ILLEGAL_STATE_TRANSITION);

      // ── CE QUE LE REFUS DOIT NOMMER, ET DANS QUEL CHAMP ───────────────────
      // ARBITRAGE A01 du 2026-09-01, corrigé le même jour sur constat de
      // l’implémenteur — et la correction vaut d’être écrite, parce qu’elle
      // désigne la bonne case :
      //
      //   · le code brut (`en_analyse`) va dans `details[].code`, champ optionnel
      //     retenu par `DECISIONS.md` du 2026-08-29 et posé ici par son premier
      //     usage. C’est une valeur pour une MACHINE : le support et la console
      //     la lisent sans traduire une phrase ;
      //   · le libellé français (« analyse ») va dans `details[].message`, parce
      //     que l’en-tête de `packages/shared/src/errors.ts` promet que ce
      //     message est AFFICHÉ TEL QUEL par la PWA terrain — invariant 5 « sans
      //     exception ». Un code brut y serait la seule chaîne technique que
      //     verrait un auditeur en clientèle.
      //
      // La règle vaut AUSSI pour les cinq identités, dont le message dédié (« la
      // mission est déjà à cet état ») est délibérément meilleur qu’un « de X
      // vers X est impossible » : il apprend au lecteur où il en est, et n’a donc
      // pas à nommer deux bornes identiques.
      const codesDeChemin = (chemin: string): string =>
        reponse.details
          .filter((une) => une.path === chemin)
          .map((une) => une.code ?? '')
          .join(' | ');

      expect(
        codesDeChemin('depuis').includes(couple.depuis) &&
          codesDeChemin('vers').includes(couple.vers),
        'Le refus doit porter les CODES BRUTS de l’état de départ et de l’état visé\n' +
          'dans `details[].code`, sous les chemins `depuis` et `vers`. Sans eux, le\n' +
          'support lit une phrase française et doit la retraduire en statut —\n' +
          'c’est-à-dire deviner, sur le seul message que l’utilisateur aura recopié.\n' +
          `Attendu : depuis=« ${couple.depuis} », vers=« ${couple.vers} ».\n` +
          `details reçus : ${JSON.stringify(reponse.details)}`,
      ).toBe(true);

      // ── ET LA PORTE REFERMÉE DANS L’AUTRE SENS ────────────────────────────
      // Sans cette assertion, rien n’empêcherait de recopier le code brut dans
      // les DEUX champs « pour être sûr » : `details[].code` serait respecté, et
      // l’auditeur lirait quand même `en_analyse` sur son iPad. C’est la moitié
      // que l’arbitrage initial ne protégeait pas, et elle est plus solide que ce
      // qu’il exigeait — un test qui interdit est plus difficile à satisfaire par
      // accident qu’un test qui réclame.
      const messagesDeDetail = reponse.details.map((une) => une.message).join(' | ');
      const codesEnClair = [couple.depuis, couple.vers].filter(
        (code) => messagesDeDetail.includes(code) || (reponse.message ?? '').includes(code),
      );
      expect(
        codesEnClair,
        'Un code brut apparaît dans un texte destiné à être AFFICHÉ. `message` — celui\n' +
          'de l’erreur comme celui d’un détail — est lu tel quel par un auditeur en\n' +
          'clientèle (invariant 5, en-tête de `packages/shared/src/errors.ts`) : il\n' +
          'porte des libellés français, jamais des identifiants d’énumération.\n' +
          `message : « ${reponse.message ?? ''} »\ndetails : ${JSON.stringify(reponse.details)}`,
      ).toStrictEqual([]);

      expect(
        (reponse.message ?? '').trim().length,
        'Le refus doit malgré tout PARLER : un `message` vide laisse la console sans\n' +
          'rien à afficher, et `details` n’est pas fait pour être montré tel quel.',
      ).toBeGreaterThan(0);

      expect(
        await statutEnBase(creee.id),
        'LA SUBSTANCE : quoi qu’il soit répondu, la ligne ne bouge pas.',
      ).toBe(couple.depuis);
    });
  }
});

// =============================================================================
// 5. LE MOTIF DES RETOURS ARRIÈRE — INVARIANT 7 RENDU EXÉCUTABLE
// =============================================================================
// ARBITRAGE DE WILLIAMS du 2026-09-02 : le motif n’est plus un texte libre, c’est
// un CODE d’un vocabulaire fermé (`MOTIFS_RETOUR_ARRIERE`, `packages/shared`),
// doublé d’un libellé français. Deux conséquences que cette section éprouve :
//   · l’ABSENCE de motif sur un retour reste un refus d’ÉTAT (409) : la requête
//     est bien formée, c’est la transition visée qui exige une justification ;
//   · un motif HORS VOCABULAIRE ou en texte libre est un refus de FORME (400) :
//     Zod le rejette avant que le service ne voie la demande — et c’est ce qui
//     garantit qu’aucune phrase saisie par un humain n’atteindra jamais
//     `activity_log` (11 §2 : aucune donnée personnelle dans les journaux).
// La liste est IMPORTÉE, jamais recopiée : un test qui la recopierait dériverait.
describe('POST /v1/missions/:id/status — motif obligatoire sur les retours (§32.2)', () => {
  const retours = TRANSITIONS_ATTENDUES.filter((ligne) => ligne.motifRequis);

  /**
   * Un code du vocabulaire — le premier, quel qu’il soit, pris dans la liste
   * partagée (tuple `as const` : l’index 0 est typé, une liste vide ne compile pas).
   */
  const unMotifDuVocabulaire = (): MotifRetourArriere => MOTIFS_RETOUR_ARRIERE[0];

  for (const retour of retours) {
    it(`@critique ${retour.depuis} → ${retour.vers} SANS motif est refusée (409), AVEC un code elle passe`, async () => {
      // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
      // Celle qui déclare `motif` optionnel dans le schéma Zod « parce qu’il ne
      // l’est pas sur les quatre transitions avant », et qui ne le REVÉRIFIE pas
      // dans le service. Le retour arrière passe alors sans justification : la
      // ligne d’`activity_log` du §32.2 dirait QU’ON est revenu en arrière,
      // jamais POURQUOI — et l’invariant 7 (« toute correction de donnée =
      // révision tracée ») perd la moitié qui vaut quelque chose.
      const admin = await creerCompte('admin', `motif-${retour.depuis}`);
      const creee = await creerMission(admin.jeton, 'motif');
      await placerStatut(creee.id, retour.depuis);

      const sansMotif = await changerStatut(admin.jeton, creee.id, retour.vers);
      expect(
        sansMotif.statut,
        'Un retour arrière sans motif est un refus d’ÉTAT : la requête est bien formée,\n' +
          'c’est la transition visée qui exige une justification (arbitrage A01 du\n' +
          '2026-09-01, confirmé le 2026-09-02).',
      ).toBe(409);
      expect(sansMotif.code).toBe(ERROR_CODES.ILLEGAL_STATE_TRANSITION);
      expect(await statutEnBase(creee.id)).toBe(retour.depuis);

      // La CONTRE-ÉPREUVE, sans laquelle le refus ci-dessus serait vert sur une
      // route qui refuse tout.
      const avecMotif = await changerStatut(admin.jeton, creee.id, retour.vers, {
        motif: unMotifDuVocabulaire(),
      });
      expect(avecMotif.statut, `refus d’un retour pourtant motivé : ${avecMotif.corps}`).toBe(200);
      expect(await statutEnBase(creee.id)).toBe(retour.vers);
    });
  }

  it('@critique un motif HORS VOCABULAIRE est refusé en 400, et le statut en base n’a pas bougé', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LA PORTE PAR LAQUELLE UNE PHRASE ENTRERAIT DANS LE JOURNAL.
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui a gardé `motif: z.string()` — ou un `z.string().min(1)` — et qui
    // journalise la valeur telle quelle. Elle accepterait « Reprise demandée par
    // M. Untel, tél. 06… », et cette phrase irait dans `activity_log.meta`, une
    // table sans régime de redaction. Le vocabulaire fermé n’existe QUE pour
    // fermer cette porte : s’il laisse passer une seule chaîne hors liste, il
    // n’existe pas.
    //
    // Quatre formes sont éprouvées, parce qu’un `z.enum` mal posé peut en
    // laisser passer une sans laisser passer les autres : un code plausible mais
    // absent, une phrase, une chaîne vide, une chaîne d’espaces.
    const admin = await creerCompte('admin', 'motif-hors-liste');
    const creee = await creerMission(admin.jeton, 'motif-hors-liste');
    await placerStatut(creee.id, 'en_analyse');

    const intrus = [
      { quoi: 'code plausible mais absent de la liste', valeur: 'retour_client' },
      { quoi: 'texte libre', valeur: 'Reprise demandee par le client apres la reunion.' },
      { quoi: 'chaîne vide', valeur: '' },
      { quoi: 'espaces', valeur: '   ' },
    ];
    const codesConnus: readonly string[] = MOTIFS_RETOUR_ARRIERE;
    expect(
      intrus.filter((cas) => codesConnus.includes(cas.valeur)),
      'Une valeur « intruse » figure dans le vocabulaire : le test n’éprouverait plus\n' +
        'un refus mais une acceptation légitime.',
    ).toStrictEqual([]);

    const acceptes: string[] = [];
    for (const cas of intrus) {
      const reponse = await appeler('POST', `/v1/missions/${creee.id}/status`, {
        jeton: admin.jeton,
        charge: { vers: 'en_cours', motif: cas.valeur },
      });
      if (reponse.statut !== 400 || reponse.code !== ERROR_CODES.VALIDATION_FAILED) {
        acceptes.push(`${cas.quoi} → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }
    expect(
      acceptes,
      'Un motif hors vocabulaire a franchi la validation. C’est la porte par laquelle\n' +
        'une phrase — donc un nom, un numéro, un montant — entre dans `activity_log`.',
    ).toStrictEqual([]);

    expect(
      await statutEnBase(creee.id),
      'LA SUBSTANCE : aucune des quatre tentatives ne doit avoir écrit le statut.',
    ).toBe('en_analyse');
  });

  it('les neuf codes du vocabulaire sont TOUS acceptés sur un retour arrière', async () => {
    // La contre-épreuve du cas précédent, élargie : sans elle, un `z.enum` qui
    // n’accepterait que le premier code serait vert sur les deux tests d’avant.
    // Chaque code est joué sur une mission neuve, pour que l’échec nomme le code
    // fautif et lui seul.
    const admin = await creerCompte('admin', 'motif-tous');
    const refuses: string[] = [];
    for (const code of MOTIFS_RETOUR_ARRIERE) {
      const creee = await creerMission(admin.jeton, `motif-${code}`);
      await placerStatut(creee.id, 'livree');
      const reponse = await changerStatut(admin.jeton, creee.id, 'en_analyse', { motif: code });
      if (reponse.statut !== 200 || (await statutEnBase(creee.id)) !== 'en_analyse') {
        refuses.push(`${code} → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }
    expect(
      refuses,
      'Un code du vocabulaire partagé est refusé par la route : la console proposera\n' +
        'un choix que le serveur n’accepte pas.',
    ).toStrictEqual([]);
  });
});
// =============================================================================
// 6. LA SURCHARGE ADMIN MOTIVÉE — DEUX LIGNES SEULEMENT, ET PAS UNE DE PLUS
// =============================================================================
describe('POST /v1/missions/:id/status — surcharge admin (§32.2 « override admin motivé », §17.3)', () => {
  it('@critique `preparation → en_cours` N’EST PAS forçable, même par un admin motivé', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE TEST LE PLUS IMPORTANT DE CETTE SECTION.
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE ATTRAPE-T-IL ?
    // Celle qui traite la surcharge comme un POUVOIR DU RÔLE (« si admin et
    // motif, alors passe ») plutôt que comme une PROPRIÉTÉ DE LA LIGNE. C'est la
    // lecture la plus naturelle du §17.3 lu seul, et elle est fausse : ni le
    // §32.2 ni le §17.3 n'accordent de forcer l'entrée en collecte.
    //
    // CE QUE CETTE ERREUR COÛTERAIT : un administrateur pourrait lancer une
    // collecte SANS questionnaire figé. Le terrain partirait avec zéro question,
    // hors ligne, chez le client — et tout le dispositif de figeage deviendrait
    // décoratif. C'est exactement l'argument de l'entrée `DECISIONS.md` du
    // 2026-08-31 (« Le pouvoir de FORCER une transition », option 3).
    const admin = await creerCompte('admin', 'surcharge-interdite');
    const creee = await creerMission(admin.jeton, 'surcharge-preparation');
    // Cadrage et préparation validés, mais AUCUN questionnaire figé : c'est la
    // seule condition qui manque, et c'est celle qui compte.
    await validerEtape(creee.id, 'cadrage', admin.id);
    await validerEtape(creee.id, 'preparation', admin.id);

    const force = await changerStatut(admin.jeton, creee.id, 'en_cours', {
      motif: 'demande_du_client',
      surcharge: true,
    });

    expect(
      force.statut,
      'La collecte a été lancée SANS questionnaire figé. Les auditeurs partiront avec\n' +
        'zéro question, et le figeage — le garde-fou le plus cher du lot — n’aura servi\n' +
        'à rien.',
    ).toBe(409);
    expect(force.code).toBe(ERROR_CODES.ILLEGAL_STATE_TRANSITION);
    expect(await statutEnBase(creee.id)).toBe('preparation');

    // CONTRE-ÉPREUVE : une fois le questionnaire figé, la MÊME demande passe.
    // Sans elle, le refus ci-dessus serait vert sur une transition cassée.
    await figerQuestionnaire(creee.id);
    const legitime = await changerStatut(admin.jeton, creee.id, 'en_cours');
    expect(legitime.statut, `refus d’une transition pourtant complète : ${legitime.corps}`).toBe(
      200,
    );
    expect(await statutEnBase(creee.id)).toBe('en_cours');
  });

  it('@critique `en_cours → en_analyse` est forçable AVEC motif, refusée sans surcharge, refusée sans motif', async () => {
    // Les trois moitiés dans le même `it`, et c'est la raison d'être du test :
    // séparées, « forçable » serait vert sur une route qui laisse tout passer, et
    // « refusée sans surcharge » serait vert sur une route qui refuse tout.
    // §32.2, verbatim : « étape collecte validée, OU override admin motivé ».
    const admin = await creerCompte('admin', 'surcharge-analyse');
    const creee = await creerMission(admin.jeton, 'surcharge-analyse');
    await placerStatut(creee.id, 'en_cours');
    // L'étape `collecte` n'est PAS validée : la condition manque réellement.

    const sansRien = await changerStatut(admin.jeton, creee.id, 'en_analyse');
    expect(
      sansRien.statut,
      'Sans surcharge et sans collecte validée, le passage doit être refusé : sinon la\n' +
        'condition du §32.2 n’existe pas.',
    ).toBe(409);
    expect(sansRien.code).toBe(ERROR_CODES.ILLEGAL_STATE_TRANSITION);
    // Le refus doit dire CE QUI MANQUE (LOT_L3 §3b : « dans details[], CHAQUE
    // condition non remplie ») — et le dire dans la bonne case : le code dans
    // `details[].code`, le français dans `details[].message`.
    exigerConditionsManquantes(sansRien, ['etape_collecte_validee']);

    const forceSansMotif = await changerStatut(admin.jeton, creee.id, 'en_analyse', {
      surcharge: true,
    });
    expect(
      forceSansMotif.statut,
      '§17.3 : « l’admin peut forcer, AVEC motif journalisé ». Forcer sans dire\n' +
        'pourquoi est exactement ce que cette phrase interdit — et la dérogation\n' +
        'deviendrait invisible dans le journal.',
    ).toBeGreaterThanOrEqual(400);
    expect(await statutEnBase(creee.id)).toBe('en_cours');

    const force = await changerStatut(admin.jeton, creee.id, 'en_analyse', {
      surcharge: true,
      motif: 'manques_assumes',
    });
    expect(
      force.statut,
      `La surcharge nommée par le §32.2 lui-même doit fonctionner : ${force.corps}`,
    ).toBe(200);
    expect(await statutEnBase(creee.id)).toBe('en_analyse');
  });

  it('`en_analyse → livree` est forçable par un admin motivé (§17.3)', async () => {
    // Le §32.2 est MUET sur cette ligne, le §17.3 la nomme (« passer en analyse
    // OU LIVRÉE […] l’admin peut forcer, avec motif journalisé »). Muet n’est pas
    // contraire : la règle de précédence ne s’arme que sur une divergence — voir
    // l’entrée `DECISIONS.md` du 2026-08-31.
    const admin = await creerCompte('admin', 'surcharge-livree');
    const creee = await creerMission(admin.jeton, 'surcharge-livree');
    await placerStatut(creee.id, 'en_analyse');
    // `etape_livraison_validee` n'est PAS posée ; `export_realise` n'a aucune
    // table et vaut satisfaite (§17.2 V2.9).

    const sansRien = await changerStatut(admin.jeton, creee.id, 'livree');
    expect(sansRien.statut, 'sans validation humaine de livraison, le passage est refusé').toBe(
      409,
    );

    const force = await changerStatut(admin.jeton, creee.id, 'livree', {
      surcharge: true,
      motif: 'demande_du_client',
    });
    expect(
      force.statut,
      `refus d’une surcharge pourtant nommée par le §17.3 : ${force.corps}`,
    ).toBe(200);
    expect(await statutEnBase(creee.id)).toBe('livree');
  });

  it('@critique DEUX lignes seulement sont déclarées forçables — celles que le §17.3 nomme', () => {
    // ── POURQUOI CE CAS N'EST PAS UN APPEL HTTP, ET POURQUOI IL EST QUAND MÊME
    //    NÉCESSAIRE ─────────────────────────────────────────────────────────────
    // Sur `livree → cloturee`, la seule condition (`retrospective_faite`) n'a
    // aucune table : elle vaut satisfaite, la transition passe de toute façon, et
    // la surcharge n'y est donc JAMAIS observable de l'extérieur. Le jour où la
    // rétrospective sera livrée, un drapeau resté à `true` deviendra un pouvoir
    // réel — sans qu'aucune ligne de code n'ait changé, et sans qu'aucun test
    // HTTP ne puisse le voir aujourd'hui. On éprouve donc la DÉCLARATION, qui est
    // le seul endroit où l'erreur est visible avant qu'elle ne coûte.
    //
    // §17.3 nomme deux passages, et deux seulement : « passer EN ANALYSE ou
    // LIVRÉE ». Tout le reste est faux par défaut — en particulier
    // `preparation → en_cours`, dont la surcharge lancerait une collecte sans
    // questionnaire.
    const forcables = TRANSITIONS_MISSION.filter((ligne) => ligne.surchargeAdminMotivee).map(
      (ligne) => `${ligne.depuis} → ${ligne.vers}`,
    );
    expect(
      forcables.sort((a, b) => a.localeCompare(b)),
      'La liste des transitions forçables diverge du §17.3. Une ligne forçable en trop\n' +
        'est un pouvoir accordé à un administrateur que le pack ne lui donne pas ; une\n' +
        'en moins est une dérogation légitime rendue inatteignable.',
    ).toStrictEqual(['en_analyse → livree', 'en_cours → en_analyse']);
  });
});

// =============================================================================
// 7. UNE CONDITION ABSENTE VAUT SATISFAITE — 03 §17.2 (V2.9)
// =============================================================================
describe('POST /v1/missions/:id/status — conditions non livrées (03 §17.2 V2.9)', () => {
  it('@critique `livree → cloturee` passe alors que `retrospective_faite` n’a AUCUNE table', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // C'EST L'INVERSE DU RÉFLEXE DÉFENSIF, ET C'EST ÉCRIT DANS LE PACK.
    // ═══════════════════════════════════════════════════════════════════════════
    // 03 §17.2 (V2.9), verbatim : « une condition dont la fonctionnalité porteuse
    // n'est pas livrée est RÉPUTÉE SATISFAITE, jamais un verrou sur une feature
    // absente ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // La plus prudente en apparence : « je ne sais pas mesurer cette condition,
    // donc je refuse ». Elle rendrait `livree → cloturee` DÉFINITIVEMENT
    // infranchissable en Phase 1 — aucune mission ne pourrait jamais être close,
    // et le défaut ne se verrait qu'à la toute fin de la première mission réelle,
    // c'est-à-dire au pire moment.
    const admin = await creerCompte('admin', 'condition-absente');
    const creee = await creerMission(admin.jeton, 'cloture');
    await placerStatut(creee.id, 'livree');

    const reponse = await changerStatut(admin.jeton, creee.id, 'cloturee');
    expect(
      reponse.statut,
      'La clôture est refusée parce qu’une condition SANS SUPPORT en Phase 1 est\n' +
        'traitée comme fausse. Le produit se verrouille sur l’absence d’une\n' +
        `fonctionnalité au lieu de s’en passer.\n${reponse.corps.slice(0, 500)}`,
    ).toBe(200);
    expect(await statutEnBase(creee.id)).toBe('cloturee');
  });

  it('@critique `preparation → en_cours` passe sans plan d’entretiens persisté', async () => {
    // Même règle, sur la transition la plus chargée en conditions :
    // `plan_entretiens_etabli` n'a aucune table où se poser (l'escalade du
    // 2026-08-31 sur `interviews.conducted_by` l'explique). Les trois autres
    // conditions, elles, sont MESURABLES et sont semées : ce test n'est donc pas
    // une permission générale, c'est l'application d'une règle nommée.
    const admin = await creerCompte('admin', 'plan-absent');
    const creee = await creerMission(admin.jeton, 'plan');
    await validerEtape(creee.id, 'cadrage', admin.id);
    await validerEtape(creee.id, 'preparation', admin.id);
    await figerQuestionnaire(creee.id);

    const reponse = await changerStatut(admin.jeton, creee.id, 'en_cours');
    expect(reponse.statut, `entrée en collecte refusée : ${reponse.corps.slice(0, 500)}`).toBe(200);
    expect(await statutEnBase(creee.id)).toBe('en_cours');
  });

  it('@critique une condition MESURABLE et fausse bloque, et le refus les énumère TOUTES', async () => {
    // La contre-épreuve du test précédent : sans elle, « les conditions absentes
    // passent » serait indistinguable de « aucune condition n'est jamais
    // vérifiée ». Les trois manques mesurables sont réunis d'un coup, et le refus
    // doit les nommer tous les trois — s'arrêter au premier imposerait à
    // l'utilisateur autant d'allers-retours qu'il y a de manques (LOT_L3 §3b).
    const admin = await creerCompte('admin', 'conditions-fausses');
    const creee = await creerMission(admin.jeton, 'conditions');

    const refus = await changerStatut(admin.jeton, creee.id, 'en_cours');
    expect(refus.statut).toBe(409);
    expect(refus.code).toBe(ERROR_CODES.ILLEGAL_STATE_TRANSITION);

    // Les TROIS manques, et seulement eux : s'arrêter au premier ferait corriger
    // l'utilisateur en trois allers-retours là où un seul message suffisait ; en
    // ajouter un quatrième (`plan_entretiens_etabli`, sans support en Phase 1) lui
    // ferait chercher une fonctionnalité qui n'existe pas — c'est la règle
    // « condition absente = satisfaite » du test précédent, vue depuis le refus.
    exigerConditionsManquantes(refus, [
      'etape_cadrage_validee',
      'etape_preparation_validee',
      'questionnaire_fige',
    ]);
    expect(await statutEnBase(creee.id)).toBe('preparation');
  });

  it('@critique les conditions se mesurent SUR CETTE MISSION, jamais sur la table entière', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE `WHERE mission_id = $1` OUBLIÉ — le défaut le plus discret du lot.
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui mesure `etape_cadrage_validee` par « existe-t-il une ligne
    // `step_validations` de code `cadrage` ? » sans borner à la mission, ou qui
    // mesure `questionnaire_fige` par « la table `mission_questions` est-elle non
    // vide ? ». Sur une base neuve — c'est-à-dire en développement et dans la
    // plupart des suites de tests — les deux rendent le bon résultat. Le défaut
    // n'apparaît qu'à partir de la DEUXIÈME mission, en production, et il ouvre
    // toutes les collectes dès qu'une seule mission a été préparée.
    //
    // La mise en scène est donc l'inverse de l'habituelle : tout est semé sur une
    // mission VOISINE, et rien sur la mission éprouvée.
    const admin = await creerCompte('admin', 'etancheite-conditions');
    const voisine = await creerMission(admin.jeton, 'voisine');
    await validerEtape(voisine.id, 'cadrage', admin.id);
    await validerEtape(voisine.id, 'preparation', admin.id);
    await figerQuestionnaire(voisine.id);

    const eprouvee = await creerMission(admin.jeton, 'eprouvee');
    const refus = await changerStatut(admin.jeton, eprouvee.id, 'en_cours');

    expect(
      refus.statut,
      'Les conditions d’une AUTRE mission ont suffi à lancer celle-ci. Le filtre par\n' +
        'mission manque quelque part, et à partir de la deuxième mission le §32.2 ne\n' +
        'protège plus rien.',
    ).toBe(409);
    expect(await statutEnBase(eprouvee.id)).toBe('preparation');
    expect(
      await statutEnBase(voisine.id),
      'la mission voisine n’a pas bougé non plus — on n’a pas transitionné la mauvaise',
    ).toBe('preparation');
  });
});

// =============================================================================
// 8. LA TRACE — §32.2 : « retours arrière […] TRACÉS `activity_log` »
// =============================================================================
describe('activity_log — la trace des retours arrière (§32.2, invariant 7)', () => {
  it('@critique un retour arrière motivé laisse une ligne d’`activity_log` sur la mission', async () => {
    // C'est une exigence LITTÉRALE du §32.2, pas une commodité : un retour
    // arrière défait un travail validé. Sans ligne d'audit, l'outil qui sert à
    // auditer les autres serait incapable de dire qui a défait quoi — et
    // l'invariant 7 (« toute correction de donnée = révision tracée ») ne
    // couvrirait pas le geste le plus destructeur du produit.
    const admin = await creerCompte('admin', 'journal-retour');
    const creee = await creerMission(admin.jeton, 'journal');
    await placerStatut(creee.id, 'en_analyse');

    const avant = await bd().query<{ total: string }>(
      'SELECT count(*) AS total FROM activity_log WHERE entity_id = $1',
      [creee.id],
    );

    const reponse = await changerStatut(admin.jeton, creee.id, 'en_cours', {
      motif: 'collecte_a_completer',
    });
    expect(reponse.statut, `retour arrière refusé : ${reponse.corps.slice(0, 400)}`).toBe(200);

    const apres = await bd().query<{ action: string; user_id: string | null; meta: unknown }>(
      'SELECT action, user_id, meta FROM activity_log WHERE entity_id = $1',
      [creee.id],
    );
    expect(
      apres.rowCount ?? 0,
      'Aucune ligne d’`activity_log` ne porte cette mission après un retour arrière.\n' +
        'Le §32.2 l’exige mot pour mot (« retours arrière : admin uniquement, motif\n' +
        'obligatoire, TRACÉS activity_log ») — et c’est la seule trace qui reste une\n' +
        'fois le statut réécrit.',
    ).toBeGreaterThan(Number(avant.rows[0]?.total ?? '0'));

    const auteurs = apres.rows.map((ligne) => ligne.user_id);
    expect(
      auteurs.includes(admin.id),
      'La ligne doit porter l’AUTEUR du retour. Une trace anonyme dit qu’il s’est\n' +
        'passé quelque chose, jamais qui l’a fait.',
    ).toBe(true);
  });

  it('@critique `meta.motif` porte EXACTEMENT le code envoyé, et rien d’autre que ce code', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE QUE LE VOCABULAIRE FERMÉ ACHÈTE, ET CE TEST EST SON REÇU.
    // ═══════════════════════════════════════════════════════════════════════════
    // Arbitrage de Williams du 2026-09-02 : le motif est un CODE, donc il PEUT
    // vivre dans `activity_log.meta` — c’est un mot technique, ni une phrase ni
    // une identité. La propriété qui protège la redaction (11 §2) reste entière
    // et se mesure ici de trois façons :
    //   1. la ligne `mission.status_change` existe et `meta.motif` vaut le code,
    //      ni un libellé français, ni une reformulation ;
    //   2. TOUT `meta` respecte le vocabulaire technique du journal
    //      (`verifierValeursAtomiques`, contrat partagé) — un code y passe, une
    //      phrase n’y passe pas ;
    //   3. sur une PROGRESSION, `meta.motif` est `null` : un motif inventé pour
    //      « remplir la case » serait une trace qui ment.
    // Le nom des clés (`motif`) et de l’action (`mission.status_change`) sont ceux
    // du contrat publié, pas une devinette.
    const admin = await creerCompte('admin', 'journal-vocabulaire');
    const creee = await creerMission(admin.jeton, 'journal-motif');
    await placerStatut(creee.id, 'livree');

    const code: MotifRetourArriere = 'rapport_a_corriger';
    const retour = await changerStatut(admin.jeton, creee.id, 'en_analyse', { motif: code });
    expect(retour.statut, `retour arrière refusé : ${retour.corps.slice(0, 400)}`).toBe(200);

    const metaSchema = z.object({ motif: z.string().nullable() });
    const lireLignes = async (): Promise<{ action: string; motif: string | null }[]> => {
      const resultat = await bd().query<{ action: string; meta: unknown }>(
        `SELECT action, meta FROM activity_log WHERE entity_id = $1 ORDER BY created_at`,
        [creee.id],
      );
      return resultat.rows.map((ligne) => {
        const analyse = metaSchema.safeParse(ligne.meta);
        return { action: ligne.action, motif: analyse.success ? analyse.data.motif : null };
      });
    };

    const apresRetour = (await lireLignes()).filter(
      (ligne) => ligne.action === 'mission.status_change',
    );
    expect(
      apresRetour.map((ligne) => ligne.motif),
      'La ligne `mission.status_change` du retour arrière doit porter `meta.motif` =\n' +
        `« ${code} » — le CODE, pas son libellé français ni une paraphrase. Un libellé\n` +
        'serait une seconde source de vérité ; une paraphrase, du texte libre.',
    ).toContain(code);

    const violations = (
      await bd().query<{ meta: unknown }>('SELECT meta FROM activity_log WHERE entity_id = $1', [
        creee.id,
      ])
    ).rows.flatMap((ligne) => verifierValeursAtomiques(ligne.meta));
    expect(
      violations,
      'Une valeur du journal sort du vocabulaire technique de `packages/shared` : une\n' +
        'phrase, un espace, une adresse, un montant décimal. Le vocabulaire fermé des\n' +
        'motifs existe précisément pour que cette liste reste vide.',
    ).toStrictEqual([]);

    // 3. Une PROGRESSION ne porte AUCUN motif : `null`, jamais un code de\n
    //    complaisance. `en_analyse → livree` a besoin de la validation humaine de\n
    //    livraison ; elle est semée.
    await validerEtape(creee.id, 'livraison', admin.id);
    const progression = await changerStatut(admin.jeton, creee.id, 'livree');
    expect(progression.statut, `progression refusée : ${progression.corps.slice(0, 400)}`).toBe(
      200,
    );
    const toutes = (await lireLignes()).filter((ligne) => ligne.action === 'mission.status_change');
    expect(
      toutes.length,
      'Deux transitions ont eu lieu : deux lignes `mission.status_change` sont dues.',
    ).toBeGreaterThanOrEqual(2);
    expect(
      toutes[toutes.length - 1]?.motif,
      'La progression vient d’être journalisée avec un motif. Une progression n’en a\n' +
        'pas (§32.2 ne l’exige que sur les retours) : `null`, sinon la trace prétend à\n' +
        'une justification que personne n’a donnée.',
    ).toBeNull();
  });
});

// =============================================================================
// 9. RBAC — CHAQUE RÔLE × CHAQUE ROUTE, AUTORISATIONS **ET** REFUS
// =============================================================================
// Invariant 3 : « RBAC serveur systématique ». 03 §34.1 : « Décision V1 : la
// console est ADMIN SEUL ». Un droit non testé est un droit non tenu.
describe('RBAC des cinq routes missions (§34.1, invariant 3)', () => {
  it('@critique consultant, analyste, lecteur et anonyme sont refusés sur LES CINQ routes, sans effet de bord', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · la route de LECTURE laissée ouverte « parce qu'elle ne modifie rien » :
    //     la liste des missions porte le nom du client, son NDA, ses dates — la
    //     lecture est précisément ce qu'on protège ;
    //   · le crochet posé sur quatre routes et oublié sur la cinquième, qui est
    //     toujours celle qu'on a ajoutée en dernier ;
    //   · le refus rendu APRÈS le gestionnaire : la mission serait créée, puis la
    //     réponse refusée. Le compteur ci-dessous est ce qui le voit.
    const admin = await creerCompte('admin', 'rbac-admin');
    const cible = await creerMission(admin.jeton, 'rbac');
    await placerStatut(cible.id, 'en_cours');
    const entreprise = await semerEntreprise();

    const routes = [
      { methode: 'GET' as const, url: '/v1/missions' },
      {
        methode: 'POST' as const,
        url: '/v1/missions',
        charge: corpsMissionMinimal(entreprise, 'interdite'),
      },
      { methode: 'GET' as const, url: `/v1/missions/${cible.id}` },
      {
        methode: 'PATCH' as const,
        url: `/v1/missions/${cible.id}`,
        charge: { title: 'Titre qui ne doit jamais être écrit' },
      },
      {
        methode: 'POST' as const,
        url: `/v1/missions/${cible.id}/status`,
        charge: { vers: 'preparation', motif: 'erreur_de_manipulation' },
      },
    ];

    const sujets = [
      { nom: 'consultant', jeton: (await creerCompte('consultant', 'rbac')).jeton, attendu: 403 },
      { nom: 'analyste', jeton: (await creerCompte('analyste', 'rbac')).jeton, attendu: 403 },
      { nom: 'lecteur', jeton: (await creerCompte('lecteur', 'rbac')).jeton, attendu: 403 },
      { nom: 'anonyme', jeton: undefined, attendu: 401 },
    ];

    const avant = await bd().query<{ total: string }>('SELECT count(*) AS total FROM missions');
    const fuites: string[] = [];

    for (const sujet of sujets) {
      for (const route of routes) {
        const reponse = await appeler(route.methode, route.url, {
          ...(sujet.jeton === undefined ? {} : { jeton: sujet.jeton }),
          ...('charge' in route ? { charge: route.charge } : {}),
        });
        const codeAttendu =
          sujet.attendu === 401 ? ERROR_CODES.UNAUTHENTICATED : ERROR_CODES.FORBIDDEN;
        if (reponse.statut !== sujet.attendu || reponse.code !== codeAttendu) {
          fuites.push(
            `${sujet.nom} → ${route.methode} ${route.url} : ` +
              `${String(reponse.statut)} ${String(reponse.code)} ` +
              `(attendu ${String(sujet.attendu)} ${codeAttendu})`,
          );
        }
      }
    }

    expect(
      fuites,
      'La console est ADMIN SEUL en V1 (03 §34.1) : « le cockpit du consultant, c’est\n' +
        'la PWA — il n’a JAMAIS besoin de la console pour travailler ». Un 200 sur l’une\n' +
        'de ces routes ouvre le dossier client (titre, NDA, dates, périmètre) à trois\n' +
        'rôles qui n’y ont pas droit ; un 500 serait presque aussi grave, car le refus\n' +
        'viendrait d’un plantage et non d’une politique.',
    ).toStrictEqual([]);

    const apres = await bd().query<{ total: string }>('SELECT count(*) AS total FROM missions');
    expect(
      apres.rows[0]?.total,
      'AUCUN effet de bord : le refus doit intervenir AVANT le gestionnaire. Une route\n' +
        'qui écrirait puis refuserait laisserait des missions fantômes que personne ne\n' +
        'saurait rattacher à un acte.',
    ).toBe(avant.rows[0]?.total);

    const relue = await appeler('GET', `/v1/missions/${cible.id}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(mission(relue).status, 'le statut de la mission cible n’a pas bougé').toBe('en_cours');
    expect(mission(relue).title, 'le titre n’a pas bougé').toBe(cible.title);
  });

  it('@critique la CONTRE-ÉPREUVE : l’administrateur passe sur les cinq routes', async () => {
    // Sans elle, le test précédent serait vert sur cinq routes qui refusent TOUT
    // LE MONDE — c'est-à-dire sur un produit inutilisable, déclaré sûr.
    const admin = await creerCompte('admin', 'rbac-contre-epreuve');
    const cible = await creerMission(admin.jeton, 'contre-epreuve');
    const entreprise = await semerEntreprise();

    const liste = await appeler('GET', '/v1/missions?limit=5', { jeton: admin.jeton });
    expect(liste.statut, `GET /v1/missions refusé à un admin : ${liste.corps}`).toBe(200);

    const creation = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: corpsMissionMinimal(entreprise, 'contre-epreuve'),
    });
    expect(creation.statut).toBe(201);

    const detail = await appeler('GET', `/v1/missions/${cible.id}`, { jeton: admin.jeton });
    expect(detail.statut).toBe(200);

    const modification = await appeler('PATCH', `/v1/missions/${cible.id}`, {
      jeton: admin.jeton,
      charge: { title: 'Mission fictive renommee par l’administrateur' },
    });
    expect(modification.statut).toBe(200);

    await placerStatut(cible.id, 'en_cours');
    const transition = await changerStatut(admin.jeton, cible.id, 'preparation', {
      motif: 'perimetre_a_reprendre',
    });
    expect(transition.statut).toBe(200);
  });

  it('@critique le refus de rôle PRÉCÈDE la validation du corps — un lecteur n’apprend rien du contrat', async () => {
    // Si la validation Zod s'exécutait avant le crochet d'autorisation, un rôle
    // non autorisé recevrait un `400 VALIDATION_FAILED` détaillant les champs
    // attendus : la DESCRIPTION DU CONTRAT d'une route à laquelle il n'a pas
    // droit, et la confirmation que la route existe. L'ordre des crochets Fastify
    // le garantit aujourd'hui (`onRequest` avant l'analyse du corps) ; rien ne
    // l'écrit ailleurs que dans ce test.
    const admin = await creerCompte('admin', 'rbac-ordre-admin');
    const cible = await creerMission(admin.jeton, 'ordre');
    const lecteur = await creerCompte('lecteur', 'rbac-ordre');

    const creation = await appeler('POST', '/v1/missions', {
      jeton: lecteur.jeton,
      charge: { champInexistant: 42 },
    });
    expect(creation.statut).toBe(403);
    expect(creation.code).toBe(ERROR_CODES.FORBIDDEN);

    const transition = await appeler('POST', `/v1/missions/${cible.id}/status`, {
      jeton: lecteur.jeton,
      charge: { vers: 'statut-qui-n-existe-pas' },
    });
    expect(transition.statut).toBe(403);
    expect(
      transition.details,
      'Le refus ne porte AUCUN détail de validation : il ne dit pas quels statuts la\n' +
        'route accepte, ni que celui proposé est hors énumération.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 10. `PATCH` — CE QU'IL A LE DROIT DE CHANGER, ET CE QU'IL N'A PAS
// =============================================================================
describe('PATCH /v1/missions/:id', () => {
  it('@critique le `PATCH` NE CHANGE PAS le statut — la machine à états n’a qu’une porte', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE GARDE-FOU LE PLUS CHER DU LOT, DÉSARMÉ PAR LA ROUTE LA PLUS BANALE.
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui construit son `UPDATE` à partir des clés présentes dans le corps.
    // C'est le geste le plus courant d'un `PATCH`, il est parfaitement correct
    // pour `title` ou `timezone`, et il fait de `status` un champ comme un autre.
    // Toute la section 4 de ce fichier — dix-huit refus — serait alors
    // contournable par un appel qui ne prétend rien transitionner.
    const admin = await creerCompte('admin', 'patch-statut');
    const creee = await creerMission(admin.jeton, 'patch-statut');

    for (const vise of ['en_cours', 'livree', 'cloturee'] as const) {
      const reponse = await appeler('PATCH', `/v1/missions/${creee.id}`, {
        jeton: admin.jeton,
        charge: { status: vise },
      });
      expect(
        await statutEnBase(creee.id),
        `Le statut est passé à « ${vise} » par un PATCH. Le §32.2 n’a plus aucune prise :\n` +
          'ni conditions, ni motif, ni trace — et les dix-huit refus de la section 4\n' +
          'deviennent contournables par la route la plus banale du lot.',
      ).toBe('preparation');
      expect(
        reponse.statut,
        'Le refus est une erreur de validation (400) ou un statut ignoré (200) : les\n' +
          'deux sont défendables. Un 500 ne l’est pas — il signifierait que le champ a\n' +
          'été accepté puis a fait tomber la requête plus loin.',
      ).toBeLessThan(500);
    }
  });

  it('une modification RÉELLE bouscule `updated_at` ; le champ absent n’est pas touché', async () => {
    const admin = await creerCompte('admin', 'patch-champs');
    const creee = await creerMission(admin.jeton, 'patch-champs');

    const modifiee = await appeler('PATCH', `/v1/missions/${creee.id}`, {
      jeton: admin.jeton,
      charge: { title: 'Mission fictive au titre corrige' },
    });
    expect(modifiee.statut).toBe(200);
    const apres = mission(modifiee);

    expect(apres.title).toBe('Mission fictive au titre corrige');
    expect(
      apres.timezone,
      'Un champ ABSENT du corps n’est pas touché — c’est toute la différence entre un\n' +
        '`PATCH` et un `PUT`, et la confondre écraserait en silence des valeurs que\n' +
        'personne n’a voulu changer.',
    ).toBe(creee.timezone);
    expect(
      apres.updatedAt,
      'Une modification réelle doit dater la ligne : sans cela, `updated_at` est\n' +
        'inutilisable comme curseur de delta de synchronisation (05 §9.5).',
    ).not.toBe(creee.updatedAt);
  });

  it('un `PATCH` vide est refusé — « j’ai modifié quelque chose, je ne sais pas quoi » n’est pas une trace', async () => {
    const admin = await creerCompte('admin', 'patch-vide');
    const creee = await creerMission(admin.jeton, 'patch-vide');

    const refus = await appeler('PATCH', `/v1/missions/${creee.id}`, {
      jeton: admin.jeton,
      charge: {},
    });
    expect(refus.statut).toBe(400);
    expect(refus.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('une mission inexistante rend 404, un identifiant non-UUID rend 400', async () => {
    const admin = await creerCompte('admin', 'lecture-absente');

    const absente = await appeler('GET', `/v1/missions/${uuidv7()}`, { jeton: admin.jeton });
    expect(absente.statut).toBe(404);
    expect(absente.code).toBe(ERROR_CODES.NOT_FOUND);

    const modifiee = await appeler('PATCH', `/v1/missions/${uuidv7()}`, {
      jeton: admin.jeton,
      charge: { title: 'sans objet' },
    });
    expect(modifiee.statut).toBe(404);

    const transition = await changerStatut(admin.jeton, uuidv7(), 'en_cours', {
      motif: 'erreur_de_manipulation',
    });
    expect(
      transition.statut,
      'Transitionner une mission qui n’existe pas est un 404, pas un 409 : il n’y a\n' +
        'aucun état à opposer.',
    ).toBe(404);

    const malforme = await appeler('GET', '/v1/missions/pas-un-uuid', { jeton: admin.jeton });
    expect(
      malforme.statut,
      'Un identifiant qui n’a pas la forme d’un UUID est une requête mal formée, pas\n' +
        'une ressource absente : le distinguer évite d’aller chercher en base une clé\n' +
        'qui ne peut correspondre à rien.',
    ).toBe(400);
  });
});

// =============================================================================
// 11. HORODATAGES — ISO 8601 **UTC** EN API, TIMESTAMPTZ EN BASE (11 §3, inv. 5)
// =============================================================================
describe('horodatages (11 §3 : ISO 8601 UTC en API)', () => {
  it('@critique `createdAt` et `updatedAt` sortent en UTC canonique, et correspondent à la base', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui laisse une couche formater la date au fuseau du SERVEUR
    // (`2026-09-01T14:00:00+02:00`) ou, pire, au fuseau de la MISSION — ce que le
    // 11 §3 réserve explicitement à l'affichage. Une mission au Québec et une
    // mission en France produiraient alors des horodatages incomparables, et le
    // curseur de synchronisation (§9.5), qui compare des instants, deviendrait
    // faux d'un décalage horaire sans que rien ne le signale.
    //
    // Le fuseau de la mission est posé à `America/Montreal` EXPRÈS : si une
    // couche d'affichage s'était glissée dans la sérialisation, c'est ici qu'elle
    // se verrait.
    const admin = await creerCompte('admin', 'utc');
    const entreprise = await semerEntreprise();
    const reponse = await appeler('POST', '/v1/missions', {
      jeton: admin.jeton,
      charge: {
        ...corpsMissionMinimal(entreprise, 'utc'),
        geoScope: 'multi_pays',
        countryCode: 'CA',
        timezone: 'America/Montreal',
      },
    });
    expect(reponse.statut, `création refusée : ${reponse.corps.slice(0, 400)}`).toBe(201);
    const creee = mission(reponse);

    const formeUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
    for (const [nom, valeur] of [
      ['createdAt', creee.createdAt],
      ['updatedAt', creee.updatedAt],
    ] as const) {
      expect(
        formeUtc.test(valeur),
        `« ${nom} » = « ${valeur} » n’est pas un ISO 8601 UTC canonique. Le contrat\n` +
          '11 §3 est explicite : UTC en base et en API, fuseau de mission à l’AFFICHAGE\n' +
          'uniquement. Un décalage non nul rend deux missions incomparables.',
      ).toBe(true);
    }

    const enBase = await bd().query<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM missions WHERE id = $1',
      [creee.id],
    );
    const ligne = enBase.rows[0];
    if (ligne === undefined) throw new Error('mission absente de la base');
    expect(
      Math.abs(new Date(creee.createdAt).getTime() - ligne.created_at.getTime()),
      'L’instant rendu par l’API et celui de la base doivent être LE MÊME instant.\n' +
        'Un écart d’une heure ou deux est la signature d’une conversion de fuseau à la\n' +
        'sérialisation — l’erreur qui ne se voit pas, parce que la valeur reste\n' +
        'plausible.',
    ).toBeLessThanOrEqual(1);
    expect(creee.timezone, 'le fuseau de MISSION est bien conservé, lui').toBe('America/Montreal');
  });
});

// =============================================================================
// 12. ÉTANCHÉITÉ FINANCIÈRE — INVARIANT 3, E21, E33
// =============================================================================
// « Données financières (`scoping_financials`) : routes ADMIN EXCLUSIVEMENT »
// (invariant 3) · 03 §18.3 : le financier est admin seul · 03 §34.1 : espace 4
// « Chiffrage & devis » = admin SEUL.
describe('étanchéité de `scoping_financials` sur les routes missions', () => {
  /** Sème un cadrage financier RATTACHÉ à la mission — la jointure tentante. */
  async function semerFinancierSurLaMission(
    missionId: string,
    entrepriseId: string,
    adminId: string,
  ): Promise<void> {
    const cadrage = uuidv7();
    await bd().query(
      `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                      calendar_days, status, created_by)
       VALUES ($1, $2, $3, 12, 2, 30, 'brouillon', $4)`,
      [cadrage, entrepriseId, missionId, adminId],
    );
    // Le volet financier passe par L'UNIQUE PORTE (`aide/sentinelle-financiere.ts`,
    // seul fichier de la liste blanche à pouvoir nommer la table). L'`INSERT` brut
    // qui vivait ici ouvrait une SECONDE porte vers `scoping_financials` — la
    // ceinture 3 l'a dénoncé, et elle avait raison.
    await semerVoletFinancierSentinelle(bd(), cadrage, adminId);
  }

  it('@critique aucune route missions ne rend un champ ni une valeur de `scoping_financials` — pas même à un ADMIN', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI ÉPROUVER L'ADMINISTRATEUR, QUI A POURTANT LE DROIT DE VOIR L'ARGENT
    // ═══════════════════════════════════════════════════════════════════════════
    // Parce que la question n'est pas « qui a le droit » mais « par quelle
    // porte ». Le 04 ne donne à `missions` AUCUNE colonne financière : un montant
    // dans une réponse `missions` ne peut venir que d'une jointure que personne
    // n'a demandée. Et une jointure, une fois écrite pour l'admin, devient la
    // ligne que le prochain élargissement de rôle emportera avec lui — c'est
    // exactement ainsi que l'étanchéité se perd, un cran à la fois, sans qu'aucun
    // test ne rougisse.
    //
    // Le cadrage semé porte `mission_id` : la jointure est donc à portée d'un
    // `LEFT JOIN`, ce qui rend le piège RÉEL et non théorique.
    const admin = await creerCompte('admin', 'financier');
    const entreprise = await semerEntreprise();
    const creee = await creerMission(admin.jeton, 'financier', entreprise);
    await semerFinancierSurLaMission(creee.id, entreprise, admin.id);

    const detail = await appeler('GET', `/v1/missions/${creee.id}`, { jeton: admin.jeton });
    const liste = await appeler('GET', '/v1/missions?limit=50', { jeton: admin.jeton });
    await placerStatut(creee.id, 'en_cours');
    const transition = await changerStatut(admin.jeton, creee.id, 'preparation', {
      motif: 'donnees_a_corriger',
    });
    const modification = await appeler('PATCH', `/v1/missions/${creee.id}`, {
      jeton: admin.jeton,
      charge: { title: 'Mission fictive au titre modifie' },
    });

    const corpus = [detail, liste, transition, modification]
      .map((reponse) => reponse.corps)
      .join('\n');

    const valeursFuitees = VALEURS_SENTINELLES.filter((valeur) => corpus.includes(valeur));
    expect(
      valeursFuitees,
      'Un montant de `scoping_financials` est sorti par une route `missions`. Ces\n' +
        'valeurs sont des sentinelles improbables : leur présence ne peut pas être une\n' +
        'coïncidence, c’est une jointure.',
    ).toStrictEqual([]);

    // La liste des noms interdits est DÉRIVÉE du contrat partagé et servie par le
    // module d'aide (`NOMS_FINANCIERS_INTERDITS`). La recopier ici, comme c'était le
    // cas, avait deux défauts : elle faisait de ce fichier une infraction à la
    // ceinture 3 — un balayage textuel ne distingue pas un test vertueux d'une
    // jointure — et elle aurait vieilli au premier champ ajouté au contrat.
    const champsFuites = NOMS_FINANCIERS_INTERDITS.filter((champ) => corpus.includes(champ));
    expect(
      champsFuites,
      'Le NOM d’un champ financier apparaît dans une réponse `missions`. Même à\n' +
        '`null`, il annonce que la jointure existe — et un champ qui existe finit par\n' +
        'être rempli.',
    ).toStrictEqual([]);
  });

  it('@critique balayage sentinelle : aucune route ne laisse sortir un montant à un non-administrateur', async () => {
    // Le balayage appelle TOUTES les routes du registre — pas celles auxquelles
    // on a pensé, CELLES QUI EXISTENT. Une route missions ajoutée demain y entre
    // d'elle-même, et son auteur voit rougir ce test plutôt qu'un lot ultérieur.
    //
    // La cartographie des paramètres est construite DEPUIS LE REGISTRE pour les
    // gabarits `/v1/missions` : le nom du paramètre (`:id`, `:missionId`…) est
    // celui que l'implémenteur a choisi, et le test ne le devine pas. La VALEUR,
    // elle, est une mission RÉELLEMENT semée — jamais un UUID de complaisance,
    // qui rendrait 404 partout et ferait un balayage vert pour n'avoir rien
    // traversé.
    const admin = await creerCompte('admin', 'balayage');
    const entreprise = await semerEntreprise();
    const creee = await creerMission(admin.jeton, 'balayage', entreprise);
    await semerFinancierSurLaMission(creee.id, entreprise, admin.id);

    const cartographie: Record<string, Record<string, string>> = {};
    const registre: readonly EntreeRegistreAcces[] = api().registreAcces;
    for (const entree of registre) {
      if (!entree.url.startsWith('/v1/missions')) continue;
      const parametres: Record<string, string> = {};
      for (const nom of parametresDuGabarit(entree.url)) parametres[nom] = creee.id;
      if (Object.keys(parametres).length > 0) cartographie[entree.url] = parametres;
    }

    expect(
      Object.keys(cartographie).length,
      'Le registre ne porte AUCUN gabarit `/v1/missions` à paramètre : soit les routes\n' +
        'ne sont pas montées, soit elles n’ont pas déclaré leur politique d’accès — et\n' +
        'le socle L2 refuse de démarrer sur une route sans politique.',
    ).toBeGreaterThan(0);

    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      // L'ADMINISTRATEUR est délibérément ABSENT : il a le droit de voir les
      // montants (03 §34.1). L'inclure produirait une fausse fuite, et un
      // garde-fou qui crie à tort finit désarmé.
      porteurs: {
        consultant: (await creerCompte('consultant', 'balayage')).jeton,
        analyste: (await creerCompte('analyste', 'balayage')).jeton,
        lecteur: (await creerCompte('lecteur', 'balayage')).jeton,
        anonyme: null,
      },
      cartographieDeParametres: cartographie satisfies CartographieDeParametres,
    });

    expect(
      rapport.fuites,
      `Une route a laissé sortir un montant :\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    const missionsMuettes = rapport.gabaritsMuets.filter((entree) =>
      entree.includes('/v1/missions'),
    );
    expect(
      missionsMuettes,
      'Une route missions n’a été ni refusée (401/403) ni servie (2xx) par AUCUN\n' +
        'porteur : 404 pour tous, 429 (balayage étranglé) ou 5xx. Dans les trois cas le\n' +
        `vert du balayage ne vaut rien pour elle.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 13. LA MISSION SUPPRIMÉE — LE FILTRE `deleted_at IS NULL`, ÉCRIT UNE FOIS
// =============================================================================
describe('mission supprimée (missions.deleted_at)', () => {
  it('@critique une mission `deleted_at` non nul rend 404 en lecture, en modification et en transition', async () => {
    // Aucune route ne pose `deleted_at` aujourd'hui (le « D » de CRUD n'est
    // jamais instancié par le pack). Le filtre, lui, doit exister PARTOUT dès
    // maintenant : le jour où une suppression existera, une mission supprimée qui
    // resterait transitionnable ne se remarquerait pas avant de figurer dans un
    // rapport. Écrire le test d'abord est le bon ordre.
    const admin = await creerCompte('admin', 'supprimee');
    const creee = await creerMission(admin.jeton, 'supprimee');

    const avant = await appeler('GET', `/v1/missions/${creee.id}`, { jeton: admin.jeton });
    expect(avant.statut, 'la mission est bien lisible AVANT la suppression').toBe(200);

    await bd().query('UPDATE missions SET deleted_at = now() WHERE id = $1', [creee.id]);

    const apres = await appeler('GET', `/v1/missions/${creee.id}`, { jeton: admin.jeton });
    expect(apres.statut).toBe(404);
    expect(
      apres.code,
      'Le refus est NOT_FOUND, pas FORBIDDEN : une mission supprimée n’existe plus\n' +
        'pour l’API, et distinguer les deux apprendrait qu’elle a existé.',
    ).toBe(ERROR_CODES.NOT_FOUND);

    const modification = await appeler('PATCH', `/v1/missions/${creee.id}`, {
      jeton: admin.jeton,
      charge: { title: 'tentative de modification après suppression' },
    });
    expect(
      modification.statut,
      'La lecture SOUS VERROU du `PATCH` porte le même filtre que la lecture simple.\n' +
        'Deux filtres écrits à deux endroits finissent par diverger — et celui qui\n' +
        'diverge est toujours celui que personne n’a testé.',
    ).toBe(404);

    const transition = await changerStatut(admin.jeton, creee.id, 'en_cours');
    expect(
      transition.statut,
      'Transitionner une mission supprimée la ferait revivre dans les tableaux de\n' +
        'bord, sans qu’aucun écran ne montre d’où elle sort.',
    ).toBe(404);
  });
});

// =============================================================================
// 14. PAGINATION KEYSET — LE CURSEUR `(created_at, id)` (11 §3, LOT_L3 §2)
// =============================================================================
// ⚠ CETTE SECTION EST LA DERNIÈRE DU FICHIER, ET CE N'EST PAS UN HASARD : elle
// met TOUTES les missions existantes de côté (`deleted_at`) pour rendre la
// position des lignes de fixture déterministe. Placée plus haut, elle priverait
// les tests suivants de leurs missions.
describe('GET /v1/missions — curseur (created_at, id)', () => {
  it('@critique aucune ligne sautée ni servie deux fois, avec quatre missions au MÊME `created_at` à la microseconde', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LA DISPOSITION DES FIXTURES EST LE TEST — elle n'est pas décorative.
    // ═══════════════════════════════════════════════════════════════════════════
    // Sept missions, `limit = 3`. Les positions 2 à 5 partagent EXACTEMENT le même
    // `created_at`, à la microseconde près, et la frontière de la première page
    // tombe AU MILIEU de ce groupe. C'est la seule disposition où les deux
    // défauts classiques du keyset se trahissent, et ils se trahissent
    // différemment :
    //
    //   · CURSEUR NON COMPOSITE (`WHERE created_at > $1`) : la reprise « après
    //     l'instant » enjambe les positions 4 et 5, qui portent le même instant
    //     que la position 3. Deux missions DISPARAISSENT de la liste, en silence,
    //     et personne ne recompte une liste ;
    //   · CURSEUR TRONQUÉ À LA MILLISECONDE (`new Date(created_at)
    //     .toISOString()`, qui perd les microsecondes) : la valeur du curseur est
    //     STRICTEMENT INFÉRIEURE à celle de la ligne frontière, qui se re-sert
    //     donc à chaque page — la pagination boucle, et l'appelant tourne jusqu'à
    //     la garde de 100 pages ci-dessous. C'est le défaut mesuré au lot L2 sur
    //     `users`, avec la même cause exacte : `TIMESTAMPTZ` porte des
    //     microsecondes, `Date` s'arrête à la milliseconde.
    //
    // Et deux insertions ont lieu EN COURS DE PARCOURS : l'une avant le point de
    // reprise — c'est elle qu'une pagination par décalage re-servirait, et le
    // test exige qu'elle ne réapparaisse pas —, l'autre après, qui a le droit
    // d'apparaître (l'affirmer inventerait une garantie que le keyset ne donne
    // pas).
    const admin = await creerCompte('admin', 'curseur');
    const entreprise = await semerEntreprise();

    // ── POURQUOI LE RÉFÉRENTIEL EST MIS DE CÔTÉ AVANT CE TEST ─────────────────
    // La démonstration repose sur la POSITION des lignes : elle dépend de tout ce
    // que les `it` précédents ont créé. Sans remise à zéro, la frontière de page
    // se déplacerait au gré de l'ordre des tests, et le jour où elle cesserait de
    // tomber dans le groupe d'égalité, ce test resterait VERT en n'éprouvant plus
    // rien. On écarte donc les missions existantes par `deleted_at` — la mise à
    // l'écart que le produit connaît déjà, jamais un `DELETE` — et l'on ASSERTE
    // que la liste est vide avant de poser les fixtures : si le filtre
    // `deleted_at IS NULL` fléchissait, l'échec tomberait ici plutôt que de vider
    // le test de son sens.
    await bd().query('UPDATE missions SET deleted_at = now() WHERE deleted_at IS NULL');
    const videe = await appeler('GET', '/v1/missions?limit=200', { jeton: admin.jeton });
    expect(videe.statut).toBe(200);
    expect(
      page(videe).items.length,
      'La liste doit être vide au départ. Elle ne l’est pas : soit le filtre\n' +
        '`deleted_at IS NULL` n’est pas appliqué à la liste (hypothèse H4), soit la\n' +
        'position des fixtures ci-dessous ne sera pas déterministe — et ce test\n' +
        'deviendrait vert sans plus rien démontrer.',
    ).toBe(0);

    // Position :        1        2        3        4        5        6        7
    // created_at :   .100000  .500000  .500000  .500000  .500000  .900000  .900001
    //                                        ↑ frontière de la 1re page (limit=3)
    const instants = [
      '2026-03-01T08:00:00.100000Z',
      '2026-03-01T08:00:00.500000Z',
      '2026-03-01T08:00:00.500000Z',
      '2026-03-01T08:00:00.500000Z',
      '2026-03-01T08:00:00.500000Z',
      '2026-03-01T08:00:00.900000Z',
      '2026-03-01T08:00:00.900001Z',
    ];

    const fixtures: string[] = [];
    for (const [position, instant] of instants.entries()) {
      const id = uuidv7();
      await bd().query(
        `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                               created_at, updated_at)
         VALUES ($1, $2, $3, 'france', 'operationnel', 'preparation', $4::timestamptz,
                 $4::timestamptz)`,
        [id, entreprise, `Mission fictive de pagination ${String(position + 1)}`, instant],
      );
      fixtures.push(id);
    }
    expect(new Set(fixtures).size, 'sept missions distinctes').toBe(7);

    /** Insère une mission hors du groupe, à un instant choisi. */
    async function insererA(instant: string, libelle: string): Promise<string> {
      const id = uuidv7();
      await bd().query(
        `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                               created_at, updated_at)
         VALUES ($1, $2, $3, 'france', 'operationnel', 'preparation', $4::timestamptz,
                 $4::timestamptz)`,
        [id, entreprise, libelle, instant],
      );
      return id;
    }

    const limite = 3;
    const vus: string[] = [];
    const pagesNonFinales: { readonly rang: number; readonly taille: number }[] = [];
    let curseur: string | null = null;
    let rang = 0;
    let decroissant: boolean | null = null;
    let idAvantLeCurseur: string | null = null;

    for (;;) {
      rang += 1;
      if (rang > 100) {
        throw new Error(
          'La pagination ne s’est pas terminée en 100 pages : le curseur ne progresse\n' +
            'pas. C’est la signature de la troncature à la milliseconde — la ligne\n' +
            'frontière se re-sert indéfiniment, et un client réel boucle jusqu’à\n' +
            'épuisement du réseau ou de la batterie.',
        );
      }

      const url =
        curseur === null
          ? `/v1/missions?limit=${String(limite)}`
          : `/v1/missions?limit=${String(limite)}&after=${encodeURIComponent(curseur)}`;
      const reponse = await appeler('GET', url, { jeton: admin.jeton });
      expect(reponse.statut, `page ${String(rang)} : ${reponse.corps.slice(0, 400)}`).toBe(200);
      const lue = page(reponse);
      vus.push(...lue.items.map((item) => item.id));

      if (rang === 1) {
        expect(
          lue.items.length,
          'La première page doit être pleine : sans elle, la frontière ne tombe pas dans\n' +
            'le groupe d’égalité et le test n’éprouve plus le curseur composite.',
        ).toBe(limite);

        // Le SENS du tri n'est pas spécifié : on le CONSTATE plutôt que de
        // l'imposer. Affirmer un ordre que le pack ne fixe pas rendrait ce test
        // faux pour une raison qui n'intéresse personne.
        const premier = lue.items[0];
        const second = lue.items[1];
        if (premier === undefined || second === undefined) throw new Error('page 1 incomplète');
        decroissant =
          premier.createdAt === second.createdAt
            ? premier.id > second.id
            : premier.createdAt > second.createdAt;
      }

      if (lue.nextCursor === null) {
        expect(
          lue.items.length,
          'La dernière page rend au plus `limit` éléments. En rendre davantage\n' +
            'signifierait que la ligne excédentaire lue pour détecter la suite a été\n' +
            'servie au client.',
        ).toBeLessThanOrEqual(limite);
        break;
      }

      pagesNonFinales.push({ rang, taille: lue.items.length });
      curseur = lue.nextCursor;

      // L'insertion concurrente, une seule fois, APRÈS la première page.
      if (idAvantLeCurseur === null) {
        const tresTot = '2026-02-01T08:00:00.000000Z';
        const tresTard = '2026-04-01T08:00:00.000000Z';
        // « Avant le point de reprise » dépend du sens du tri : en ordre
        // croissant c'est la ligne la plus ANCIENNE, en ordre décroissant la plus
        // RÉCENTE. C'est celle-là qu'une pagination par décalage re-servirait.
        idAvantLeCurseur = await insererA(
          decroissant === true ? tresTard : tresTot,
          'Mission fictive inseree avant le point de reprise',
        );
        await insererA(
          decroissant === true ? tresTot : tresTard,
          'Mission fictive inseree apres le point de reprise',
        );
      }
    }

    const tropCourtes = pagesNonFinales.filter((p) => p.taille !== limite);
    expect(
      tropCourtes.map((p) => `page ${String(p.rang)} : ${String(p.taille)} élément(s)`),
      'Une page qui rend MOINS que `limit` tout en fournissant un curseur suivant\n' +
        'signale une suite qui n’existe pas : le client boucle sur une page vide, ou\n' +
        'croit la liste plus longue qu’elle ne l’est. `nextCursor` non nul ⇒ la page\n' +
        'est pleine.',
    ).toStrictEqual([]);

    expect(
      rang,
      'Sept missions par pages de trois : au moins trois pages. Moins signifierait que\n' +
        '`limit` n’est pas appliqué, et le parcours ne franchirait jamais la frontière\n' +
        'qu’il existe pour éprouver.',
    ).toBeGreaterThanOrEqual(3);

    const doublons = vus.filter((id, index) => vus.indexOf(id) !== index);
    expect(
      [...new Set(doublons)],
      'Une ligne a été servie DEUX FOIS. Deux causes possibles, toutes deux graves :\n' +
        'la reprise par décalage (l’insertion concurrente a décalé la liste), ou le\n' +
        'curseur tronqué à la milliseconde qui repointe avant la ligne frontière.',
    ).toStrictEqual([]);

    const manquants = fixtures.filter((id) => !vus.includes(id));
    expect(
      manquants,
      'Des missions qui EXISTAIENT avant l’insertion n’ont jamais été servies. C’est\n' +
        'ici que se joue le curseur COMPOSITE : avec `WHERE created_at > $1`, les lignes\n' +
        'qui partagent l’instant de la frontière sont enjambées. Elles seraient absentes\n' +
        'd’une liste que personne ne recompte — et une mission absente d’un tableau de\n' +
        'bord ne se réclame pas, elle s’oublie.',
    ).toStrictEqual([]);

    expect(
      idAvantLeCurseur,
      'Aucune insertion concurrente n’a eu lieu : le test n’a éprouvé aucune\n' +
        'concurrence, et son intitulé mentirait.',
    ).not.toBeNull();
    expect(
      idAvantLeCurseur === null || vus.includes(idAvantLeCurseur),
      'La mission insérée AVANT le point de reprise a réapparu. C’est la moitié que la\n' +
        'pagination par décalage rate : elle décale toute la liste d’un rang et re-sert\n' +
        'une ligne déjà lue.',
    ).toBe(false);
  });

  it('les bornes de `limit` et un curseur illisible sont refusés proprement', async () => {
    // Le curseur est OPAQUE mais NON SIGNÉ : un client peut en fabriquer un. Ce
    // n'est pas une fuite — le cadrage d'accès vit dans la politique de route —
    // mais un curseur bruité ne doit pas être décodé « en quelque chose », sous
    // peine de produire une page absurde. Et l'absurdité d'une page ne se voit
    // pas.
    const admin = await creerCompte('admin', 'curseur-invalide');

    const bornes = ['0', '-1', '201', 'beaucoup'];
    const acceptees: string[] = [];
    for (const limite of bornes) {
      const reponse = await appeler('GET', `/v1/missions?limit=${limite}`, { jeton: admin.jeton });
      if (reponse.statut !== 400 || reponse.code !== ERROR_CODES.VALIDATION_FAILED) {
        acceptees.push(`limit=${limite} → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }
    expect(
      acceptees,
      'Le contrat partagé borne `limit` entre 1 et 200. Une borne non tenue laisse un\n' +
        'appelant demander la table entière en une requête.',
    ).toStrictEqual([]);

    const curseurEtranger = Buffer.from(
      JSON.stringify(['companies', 'Entreprise fictive', uuidv7()]),
    ).toString('base64url');
    const curseurs = ['pas-du-base64!!', 'YWJj', curseurEtranger];
    const anomalies: string[] = [];
    for (const curseur of curseurs) {
      const reponse = await appeler(
        'GET',
        `/v1/missions?limit=3&after=${encodeURIComponent(curseur)}`,
        { jeton: admin.jeton },
      );
      if (reponse.statut !== 400 || reponse.code !== ERROR_CODES.INVALID_CURSOR) {
        anomalies.push(`« ${curseur} » → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }
    expect(
      anomalies,
      'Un curseur d’une AUTRE ressource doit être refusé, pas décodé en silence.',
    ).toStrictEqual([]);
  });
});
