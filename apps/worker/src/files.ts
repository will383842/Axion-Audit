// =============================================================================
// DÉCLARATION DES FILES BULLMQ — module PUREMENT DÉCLARATIF, sans effet de bord.
//
// POURQUOI CE FICHIER EXISTE. Ces constantes sont lues par DEUX processus : le worker
// (`worker.ts`) et la sonde de santé (`sonde-sante.ts`), que Docker exécute toutes les
// quinze secondes. Les importer depuis `worker.ts` ferait démarrer un worker complet à
// chaque sonde — un consommateur de plus toutes les quinze secondes, qui volerait des
// jobs et mourrait aussitôt. D'où un module sans `bullmq`, sans connexion et sans
// minuterie : le charger ne fait RIEN.
//
// POURQUOI LES NOMS N'ONT PLUS DE DEUX-POINTS. BullMQ 5 refuse au constructeur tout nom
// de file contenant « : » (`classes/queue-base.js` : `if (name.includes(':')) throw new
// Error('Queue name cannot contain :')`), parce qu'il s'en sert LUI-MÊME comme séparateur
// de clé Redis. Les noms `axion:rapports`… faisaient donc échouer le PREMIER `new Queue()`
// du module : le worker n'a jamais démarré, ni en développement, ni en staging.
//
// L'intention du préfixe reste entière — cloisonner nos clés dans un Redis potentiellement
// partagé. BullMQ la sert par l'option `prefix` : `QueueBase` pose `{ prefix: 'bull',
// ...opts }` puis construit ses clés avec `new QueueKeys(opts.prefix)`. Avec
// `prefix: 'axion'`, les clés produites sont EXACTEMENT celles que l'ancien nommage
// visait — `axion:rapports:…` — sans deux-points dans le NOM. Le cloisonnement était le
// besoin, le nom n'était que le moyen : on garde le besoin, on change le moyen.
//
// Traçabilité : E17 (stack imposée), E35 (jobs asynchrones), E43 (exécutabilité).
// =============================================================================
import { hostname } from 'node:os';

/**
 * Préfixe de TOUTES les clés Redis du projet (02 §11.1 — Redis peut être partagé).
 * Il se pose par l'option `prefix` de chaque `Queue` et de chaque `Worker`, jamais dans
 * le nom de la file. Il sert aussi de cloison au nom de connexion que BullMQ enregistre
 * dans Redis (`CLIENT SETNAME axion:<file en base64>`), sur lequel la sonde s'appuie.
 */
export const PREFIXE_REDIS = 'axion';

/**
 * Files déclarées. Une file par NATURE de travail, jamais une file fourre-tout : une
 * purge RGPD qui attend derrière une génération DOCX de dix minutes est un défaut de
 * conformité, pas un défaut de performance.
 *
 * Aucun nom ne contient « : » — voir l'encadré en tête de fichier. Les clés Redis
 * effectives restent préfixées `axion:`.
 */
export const NOMS_DE_FILES = {
  /** L10 — génération DOCX (jobs idempotents et rejouables). */
  rapports: 'rapports',
  /** L11 — appels LLM par bloc, avec journal des coûts. */
  llm: 'llm',
  /** L7 — exports de mission (format §36.3). */
  exports: 'exports',
  /** 06 §10.4 — purges de rétention, planifiées et journalisées. */
  purges: 'purges',
  /** L13 — webhooks console axion-ia.com (HMAC + anti-rejeu). */
  webhooks: 'webhooks',
} as const;

export type CleDeFile = keyof typeof NOMS_DE_FILES;

/** Les clés de `NOMS_DE_FILES`, typées — `Object.keys` rend `string[]`, inutilisable ici. */
export const CLES_DE_FILES = Object.keys(NOMS_DE_FILES) as CleDeFile[];

/**
 * Identité de l'INSTANCE de worker : le nom d'hôte, c'est-à-dire l'identifiant du
 * conteneur sous Docker. Le worker l'inscrit dans le nom de sa connexion Redis et dans
 * la clé de son battement ; la sonde, qui tourne DANS le même conteneur, ne vérifie donc
 * que SON worker. Sans cette identité, un second conteneur en bonne santé sur le même
 * Redis rendrait un conteneur mort « healthy » — le même mensonge, déplacé d'un cran.
 */
export const IDENTITE_INSTANCE = hostname();

/**
 * Clé du battement de cœur, propre à l'instance. « sonde » n'est pas un nom de file :
 * la clé ne peut donc jamais entrer en collision avec les clés que BullMQ dérive de
 * `axion:<nom de file>:…`.
 */
export function cleDeBattement(identite: string = IDENTITE_INSTANCE): string {
  return `${PREFIXE_REDIS}:sonde:battement:${identite}`;
}

/** Période d'écriture du battement par le worker. */
export const INTERVALLE_BATTEMENT_MS = 5_000;

/**
 * Durée de vie du battement dans Redis. Quatre périodes d'écriture : une machine chargée
 * peut sauter un battement sans que la sonde crie, mais une boucle d'événements bloquée
 * plus de vingt secondes est bien une panne. La clé expire SEULE — c'est ce qui rend le
 * signe infalsifiable par un processus mort.
 */
export const TTL_BATTEMENT_SECONDES = 20;

/**
 * Budget d'exécution de la sonde. Tenu SOUS le `timeout` de la sonde Docker (5 s) pour
 * qu'un blocage produise un message explicite dans le journal de santé plutôt qu'un
 * couperet muet du démon.
 */
export const BUDGET_SONDE_MS = 4_000;
