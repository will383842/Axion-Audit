// =============================================================================
// FORMAT DU FICHIER `.axionbackup` — 11 §4, transcrit champ pour champ
//
// ── LE FORMAT DU PACK, ET LA SEULE LIBERTÉ PRISE ────────────────────────────
// 11 §4 écrit : « JSON `{header: {format_version, mission_id, device_label,
// created_at, kdf: {algo: 'argon2id', salt, params}}, payload}` où `payload` =
// données de mission locales + outbox, chiffré AES-256-GCM avec une clé dérivée
// du **MOT DE PASSE utilisateur** (PAS de la DEK appareil — le sel est dans le
// header) → restaurable sur n'importe quel appareil du compte. »
//
// La seule liberté est le NOMMAGE : camelCase, comme 11 §3 l'impose au code TS
// (« snake_case en base ↔ camelCase en TS ; jamais de mélange ») et comme
// `packages/shared/src/sync.ts` l'a déjà tranché pour le contrat d'op du même
// §4. Champ pour champ, sans ajout ni retrait — sauf deux champs d'en-tête
// nommés plus bas, et dits.
//
// ── POURQUOI LE PAYLOAD EST RE-CHIFFRÉ, ET NON RECOPIÉ ──────────────────────
// Les lignes locales sont DÉJÀ chiffrées, sous la DEK de CET appareil. Les
// recopier telles quelles produirait un fichier illisible partout ailleurs — donc
// inutile le jour où l'appareil est perdu, c'est-à-dire le seul jour qui compte.
// L'export DÉCHIFFRE sous la DEK puis RE-CHIFFRE l'ensemble sous une clé dérivée
// du mot de passe. C'est exactement ce que « PAS de la DEK appareil » veut dire,
// et c'est ce que le test décisif éprouve en restaurant sur une DEK différente.
//
// ── DEUX CHAMPS D'EN-TÊTE QUE 11 §4 NE NOMME PAS ────────────────────────────
// Ajoutés délibérément, et signalés au rapport d'auto-revue :
//   · `versionSchemaLocal` — la version du schéma Dexie qui a produit ce fichier.
//     Sans elle, une sauvegarde faite par une version PLUS RÉCENTE de
//     l'application s'importerait « au mieux » dans une plus ancienne, en
//     silence. 05 §31-1 exige que « la compatibilité ascendante du schéma local
//     [soit testée] pour qu'une mise à jour n'invalide jamais des données non
//     synchronisées » ; un fichier qui ne dit pas de quel schéma il vient ne peut
//     pas honorer cette règle.
//   · `operationsIncluses` — le nombre d'opérations d'outbox emportées. Il rend
//     l'écran capable d'annoncer « cette sauvegarde contient 12 éléments non
//     encore synchronisés » AVANT de l'ouvrir. Un chiffre, pas une promesse.
// Aucun des deux n'est une donnée personnelle ; tous deux sont en clair, comme le
// reste de l'en-tête, qui DOIT l'être puisqu'il porte le sel de dérivation.
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours), E33 (sécurité/RGPD).
// =============================================================================
import { z } from 'zod';
import { enveloppeSchema } from '../local/enveloppe.js';
import { ligneStockeeSchema } from '../local/formes.js';

/**
 * La version du FORMAT DE FICHIER. Elle n'a rien à voir avec
 * `VERSION_SCHEMA_LOCAL` (la forme des tables Dexie) : le format peut rester
 * stable pendant que le schéma évolue, et l'inverse. Les confondre reviendrait à
 * refuser un fichier parfaitement lisible parce qu'une table a gagné un index.
 */
export const VERSION_FORMAT_SAUVEGARDE = 1;

/** L'extension du fichier déposé sur l'appareil ou la clé USB (05 §9.7). */
export const EXTENSION_SAUVEGARDE = '.axionbackup';

/** Les paramètres Argon2id, recopiés dans l'en-tête pour être rejouables. */
export const parametresKdfSchema = z.object({
  algo: z.literal('argon2id'),
  memoireKio: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelisme: z.number().int().positive(),
  longueurOctets: z.number().int().positive(),
});
export type ParametresKdfSauvegarde = z.infer<typeof parametresKdfSchema>;

/**
 * L'en-tête, EN CLAIR — et il doit l'être : il porte le sel sans lequel personne,
 * pas même le propriétaire du mot de passe, ne peut dériver la clé. Un en-tête
 * chiffré rendrait le fichier définitivement illisible.
 *
 * **Il ne contient donc AUCUNE donnée personnelle**, et le test de sentinelles
 * le vérifie sur le sérialisé complet. C'est la règle jumelle de la liste fermée
 * du §3.2 et de la redaction pino (11 §2) : ce qui est en clair est choisi, pas
 * subi.
 */
export const enTeteSauvegardeSchema = z.object({
  versionFormat: z.number().int().positive(),
  missionId: z.uuid(),
  /** Libellé lisible de l'appareil d'origine (`device_label` du 11 §4). */
  libelleAppareil: z.string(),
  /** ISO 8601 UTC (11 §3, invariant 5) — jamais l'heure locale de l'appareil. */
  creeLe: z.iso.datetime(),
  versionSchemaLocal: z.number().int().positive(),
  operationsIncluses: z.number().int().nonnegative(),
  kdf: z.object({
    algo: z.literal('argon2id'),
    /** Le sel de dérivation, base64. « le sel est dans le header » (11 §4). */
    sel: z.string().min(1),
    parametres: parametresKdfSchema,
  }),
});
export type EnTeteSauvegarde = z.infer<typeof enTeteSauvegardeSchema>;

/** Le fichier complet : en-tête en clair + charge chiffrée sous la clé du mot de passe. */
export const fichierSauvegardeSchema = z.object({
  enTete: enTeteSauvegardeSchema,
  charge: enveloppeSchema,
});
export type FichierSauvegarde = z.infer<typeof fichierSauvegardeSchema>;

/**
 * Une opération d'outbox telle qu'elle voyage dans la sauvegarde : les champs de
 * la file, plus la charge DÉCHIFFRÉE (elle sera re-chiffrée avec tout le reste).
 *
 * `opId` est conservé, et ce n'est pas un détail : c'est la clé de déduplication
 * serveur (`processed_ops`, 11 §4). Une op restaurée sous un NOUVEL identifiant
 * serait rejouée une seconde fois par le serveur, et la déduplication ne pourrait
 * plus rien pour elle.
 */
export const operationSauvegardeeSchema = z.object({
  opId: z.uuid(),
  missionId: z.uuid(),
  entite: z.string(),
  entiteId: z.uuid(),
  action: z.string(),
  clientUpdatedAt: z.string(),
  queuedAt: z.string(),
  statut: z.string(),
  tentatives: z.number().int().nonnegative(),
  derniereErreur: z.string().nullable(),
  /** La charge de l'op, EN CLAIR dans le payload — lui-même chiffré. */
  charge: z.unknown(),
});
export type OperationSauvegardee = z.infer<typeof operationSauvegardeeSchema>;

/**
 * Une ligne de table miroir, index EN CLAIR + charge DÉCHIFFRÉE.
 *
 * `looseObject` et non un schéma par table : le contenu exact est retypé à
 * l'application par `appliquerDescente`, dont les types mappés (`IndexDeTable`,
 * `ChargeDeTable`) sont la source unique. Redéclarer ici les sept paires de
 * formes en ferait une seconde — et c'est toujours la seconde qui dérive.
 * Ce que ce schéma garantit à la frontière, c'est ce qui doit l'être : la ligne a
 * un identifiant, et elle a une charge.
 */
export const ligneSauvegardeeSchema = z.looseObject({
  id: z.uuid(),
  charge: z.unknown(),
});
export type LigneSauvegardee = z.infer<typeof ligneSauvegardeeSchema>;

/** Les sept tables miroirs du 05 §9.1 (`outbox` et `meta` n'en sont pas). */
export const TABLES_SAUVEGARDEES = [
  'missions',
  'missionQuestions',
  'orgUnits',
  'interviews',
  'answers',
  'attachments',
  'workAssignments',
] as const;
export type TableSauvegardee = (typeof TABLES_SAUVEGARDEES)[number];

/** Le contenu DÉCHIFFRÉ : « données de mission locales + outbox » (11 §4). */
export const contenuSauvegardeSchema = z.object({
  missionId: z.uuid(),
  lignes: z.record(z.enum(TABLES_SAUVEGARDEES), z.array(ligneSauvegardeeSchema)),
  operations: z.array(operationSauvegardeeSchema),
});
export type ContenuSauvegarde = z.infer<typeof contenuSauvegardeSchema>;

/** Ce que la ligne stockée doit être AVANT déchiffrement (garde de lecture locale). */
export { ligneStockeeSchema };

/**
 * Nom de fichier proposé à l'auditeur.
 *
 * Aucune donnée personnelle, aucun nom de client (invariant 2) : la mission est
 * désignée par son UUID, pas par son titre. L'horodatage est celui de l'export,
 * en UTC, sans séparateur — un nom de fichier doit survivre à tous les systèmes
 * de fichiers, y compris ceux qui refusent les deux-points.
 */
export function nomFichierSauvegarde(missionId: string, creeLe: string): string {
  const horodatage = creeLe.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `axion-${missionId}-${horodatage}${EXTENSION_SAUVEGARDE}`;
}
