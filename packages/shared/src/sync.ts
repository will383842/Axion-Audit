// =============================================================================
// CONTRAT D'OPÉRATIONS DE SYNCHRONISATION — 11 §4, 05 §9.2/§9.3/§9.5
//
// ── POURQUOI CE FICHIER EST ÉCRIT PAR L5a ET NON PAR L6a ─────────────────────
// `docs/conception/LOT_L5.md` §5-3 posait la question ; A01 l'a tranchée : L5a
// l'écrit, L6 l'implémente côté serveur. La raison n'est pas de goût. L'outbox de
// L5a est remplie par CHAQUE écriture terrain ; si sa forme n'était pas déjà celle
// du contrat d'op, L6a devrait réécrire tous les sites d'écriture de L5b et L5c —
// c'est-à-dire la totalité de la collecte, après la porte P-C.
//
// ── CE QUE CE FICHIER NE FAIT PAS ────────────────────────────────────────────
// Aucune logique : ni push, ni pull, ni backoff, ni file. Il ne déclare QUE la
// forme des messages. Le moteur est L6 (05 §9.3) et le port terrain est déclaré
// dans `apps/field/src/sync/port.ts`.
//
// ── NOMMAGE : snake_case dans le pack, camelCase ici ─────────────────────────
// 11 §4 écrit l'op `{op_id, entity, entity_id, action, payload, client_updated_at}`
// et le pull `{server_time, changes, next_since}`. 11 §3 tranche la forme du code :
// « snake_case en base ↔ camelCase en TS ; jamais de mélange ». Les schémas déjà
// livrés dans ce paquet suivent le camelCase (`nextCursor` de `pagination.ts`).
// Les noms ci-dessous sont donc la transcription camelCase des champs du 11 §4,
// champ pour champ, sans ajout ni retrait.
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau), E9 (multi-consultants,
// sync sans conflit).
// =============================================================================
import { z } from 'zod';
import { TYPES_DE_REPONSE } from './banque-questions.js';
import { isoUtcSchema } from './temps.js';

// ─────────────────────────────────────────────────────────────────────────────
// LES ENTITÉS QUI MONTENT — liste FERMÉE du 11 §4
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les cinq entités que le terrain peut créer ou modifier hors ligne (11 §4).
 * Toute autre table est descendante : le terrain la LIT (05 §9.4, « les entités
 * siège ne sont JAMAIS modifiées depuis le terrain »).
 *
 * `org_unit_proposal` est la proposition d'unité du 03 §25.3 ; `question_adhoc`
 * porte À LUI SEUL la question ET sa ligne `mission_questions` (11 §4 : « UNE
 * seule op ; le serveur crée les deux ATOMIQUEMENT »).
 */
export const ENTITES_SYNC = [
  'interview',
  'answer',
  'attachment_meta',
  'org_unit_proposal',
  'question_adhoc',
] as const;

export type EntiteSync = (typeof ENTITES_SYNC)[number];

/**
 * `delete_soft` et non `delete` : invariant 7 — « rien n'est jamais silencieusement
 * écrasé ou supprimé ». 05 §9.2 écrit `upsert|delete` ; 11 §4, plus précis, écrit
 * `upsert|delete_soft`, et le 04 pose `deleted_at` sur les tables métier. Le
 * contrat 11 tranche ce que le pack écrit de deux façons : c'est `delete_soft`.
 */
export const ACTIONS_OP = ['upsert', 'delete_soft'] as const;
export type ActionOp = (typeof ACTIONS_OP)[number];

// ─────────────────────────────────────────────────────────────────────────────
// LA VALEUR D'UNE RÉPONSE — enveloppe seulement (04 : `value JSONB {type, v}`)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * L'ENVELOPPE de `answers.value`, pas son contenu. Le 04 en fixe trois formes :
 * `{type, v}` ordinaire, `{type:'money', v, currency}` (défaut `EUR`, §22.2) et la
 * fourchette `{type:'range', low, high}` (+ `currency` si money, §27.4).
 *
 * **`v` reste `unknown` DÉLIBÉRÉMENT.** Le typage exhaustif des ONZE
 * `TYPES_DE_REPONSE` est le périmètre de L5b (`LOT_L5.md` §1) ; le figer ici
 * reviendrait à écrire le lot d'un autre agent depuis un fichier partagé, et à
 * garantir la divergence le jour où L5b l'affine. L5b resserre, il ne redéfinit pas.
 */
export const valeurReponseSchema = z.union([
  z.object({
    type: z.literal('range'),
    low: z.number().nullable(),
    high: z.number().nullable(),
    currency: z.string().length(3).optional(),
  }),
  z.object({
    type: z.literal('money'),
    v: z.unknown(),
    currency: z.string().length(3).default('EUR'),
  }),
  z.object({
    type: z.enum(TYPES_DE_REPONSE),
    v: z.unknown(),
  }),
]);

export type ValeurReponse = z.infer<typeof valeurReponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// L'OPÉRATION — 11 §4, champ pour champ
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Une opération de la file de montée.
 *
 * `opId` est un **UUID v7 généré sur l'appareil** (invariant 1, P1-4) : il est la
 * clé d'idempotence du serveur (`processed_ops`, 11 §4). `entityId` en est une
 * seconde, par upsert (05 §9.3, « la seconde ceinture d'idempotence »).
 *
 * `payload` est volontairement `unknown` : le contenu appartient à l'entité, et le
 * serveur le valide avec le schéma de SA table. Le typer ici obligerait ce paquet
 * partagé à connaître les cinq formes complètes, dont deux (`question_adhoc`,
 * `org_unit_proposal`) ne sont écrites qu'aux lots L5b et L5c.
 */
export const operationSchema = z.object({
  opId: z.uuid(),
  entity: z.enum(ENTITES_SYNC),
  entityId: z.uuid(),
  action: z.enum(ACTIONS_OP),
  payload: z.unknown(),
  clientUpdatedAt: isoUtcSchema,
});

export type Operation = z.infer<typeof operationSchema>;

/** 11 §4 : « lots de 100 max, ordre de file préservé ». */
export const TAILLE_LOT_PUSH_MAX = 100;

/**
 * Le lot montant.
 *
 * `outboxRemaining` n'est PAS un confort d'affichage : 05 §9.7 (V2.9) en fait la
 * DONNÉE du garde-fou de réinitialisation de mot de passe — « outbox non vide » =
 * dernier `sync_log.outbox_remaining` > 0. Il se compte sur la file réelle après
 * retrait du lot ; il ne se déclare jamais.
 */
export const lotPushSchema = z.object({
  missionId: z.uuid(),
  deviceId: z.string().min(1),
  operations: z.array(operationSchema).min(1).max(TAILLE_LOT_PUSH_MAX),
  outboxRemaining: z.number().int().min(0),
});

export type LotPush = z.infer<typeof lotPushSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// LA RÉPONSE AU PUSH — les cinq résultats du 05 §9.3
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les cinq résultats possibles, contrat V2.2 (05 §9.3). Leur traitement terrain
 * est rappelé ici parce qu'il porte l'invariant 7 :
 *   - `applied` / `duplicate` : l'op SORT de l'outbox ;
 *   - `superseded` : l'op sort ; la valeur perdante est archivée serveur
 *     (`answer_revisions`, origine `sync_arbitrage`) et l'appareil se réaligne au
 *     prochain pull ;
 *   - `forbidden` : l'op sort vers un état « rejetée » VISIBLE (05 §9.9), jamais
 *     rejouée en silence ;
 *   - `error` : backoff ; au 10e échec, statut « à examiner » visible.
 *     **Jamais de suppression silencieuse.**
 */
export const RESULTATS_OP = ['applied', 'duplicate', 'superseded', 'forbidden', 'error'] as const;

export type ResultatOp = (typeof RESULTATS_OP)[number];

/** 05 §9.3 : au 10e echec `error`, l'op passe en « à examiner » visible. */
export const ECHECS_AVANT_EXAMEN = 10;

export const resultatOperationSchema = z.object({
  opId: z.uuid(),
  result: z.enum(RESULTATS_OP),
  /** Message en français destiné à l'auditeur — jamais une trace technique brute (03 §17.6). */
  message: z.string().optional(),
});

export const reponsePushSchema = z.object({
  serverTime: isoUtcSchema,
  results: z.array(resultatOperationSchema),
});

export type ReponsePush = z.infer<typeof reponsePushSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// LE PULL — 11 §4, 05 §9.5
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `changes` est indexé par ENTITÉ DESCENDANTE, et cette liste est plus large que
 * `ENTITES_SYNC` : le terrain reçoit aussi des tables qu'il ne modifie jamais
 * (`missions`, `mission_questions`, `org_units`, `work_assignments` — 05 §9.1).
 */
export const ENTITES_DESCENDANTES = [
  'mission',
  'mission_question',
  'org_unit',
  'work_assignment',
  'interview',
  'answer',
  'attachment_meta',
] as const;

export type EntiteDescendante = (typeof ENTITES_DESCENDANTES)[number];

/**
 * `GET /v1/sync/pull` rend `{serverTime, changes, nextSince}` (11 §4).
 *
 * `serverTime` n'est pas décoratif : c'est la source de l'offset d'horloge du
 * 05 §9.2 (« horloge locale + offset serveur estimé à la dernière sync »), qui
 * neutralise l'appareil déréglé de +3 h du scénario 05 §9.8.
 *
 * `nextSince: null` = fin du delta. Le client persiste ce curseur PAR MISSION.
 */
export const reponsePullSchema = z.object({
  serverTime: isoUtcSchema,
  changes: z.record(z.enum(ENTITES_DESCENDANTES), z.array(z.unknown()).optional()),
  nextSince: isoUtcSchema.nullable(),
});

export type ReponsePull = z.infer<typeof reponsePullSchema>;
