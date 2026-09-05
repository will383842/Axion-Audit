// =============================================================================
// POINT D'ACCÈS UNIQUE AU CONTRAT DE SYNC PARTAGÉ
//
// `packages/shared/src/sync.ts` est écrit par L5a (arbitrage A01 sur le point
// `LOT_L5.md` §5-3) mais n'est PAS encore ré-exporté par le baril
// `packages/shared/src/index.ts` : ce fichier appartient à un autre agent et deux
// incréments qui l'écrivent en même temps se marchent dessus.
//
// En attendant la ligne d'export, l'app terrain importe le module par son chemin.
// **Ce détour est concentré dans CE fichier, et nulle part ailleurs** : le jour où
// `export * from './sync.js';` est posé dans le baril, une seule ligne change ici
// et aucun des quinze fichiers qui consomment le contrat n'est touché.
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau).
// =============================================================================
export {
  ACTIONS_OP,
  ECHECS_AVANT_EXAMEN,
  ENTITES_DESCENDANTES,
  ENTITES_SYNC,
  RESULTATS_OP,
  TAILLE_LOT_PUSH_MAX,
  lotPushSchema,
  operationSchema,
  reponsePullSchema,
  reponsePushSchema,
  resultatOperationSchema,
  valeurReponseSchema,
} from '../../../../packages/shared/src/sync.js';

export type {
  ActionOp,
  EntiteDescendante,
  EntiteSync,
  LotPush,
  Operation,
  ReponsePull,
  ReponsePush,
  ResultatOp,
  ValeurReponse,
} from '../../../../packages/shared/src/sync.js';
