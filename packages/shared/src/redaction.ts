// =============================================================================
// POLITIQUE DE REDACTION DES JOURNAUX — SOURCE UNIQUE
//
// Contrat 11 §2 : « Aucune donnée personnelle dans les logs : person_name, emails et
// contenus de réponse INTERDITS dans pino (redaction configurée) — cohérent §10. »
// RGPD 06 §10.4 : les identités ne circulent pas hors de leur finalité.
//
// POURQUOI CE FICHIER EXISTE. L'API et le worker ont d'abord porté chacun leur
// liste. Celle du worker était plus COURTE de dix champs — dont `password`, `token`
// et `phone` — alors que le worker est, de son propre aveu, « le processus où une
// fuite de journal serait la plus fournie » : c'est lui qui manipule les réponses
// d'entretien pour la génération et les appels LLM. Deux copies d'une même politique
// RGPD divergent toujours, et divergent en silence.
//
// Un seul endroit, donc. Ajouter un champ ici le masque PARTOUT.
// Traçabilité : E33 (sécurité/RGPD), E42 (RGPD renforcé).
// =============================================================================

/**
 * Chemins masqués par pino. `*` traverse UN niveau : pino ne fait pas de
 * correspondance récursive, les chemins profonds sont donc déclarés explicitement.
 *
 * Trois familles, et chacune a sa raison :
 *   1. **Identités** — la base légale du traitement est l'intérêt légitime, avec
 *      information préalable (06 §10.4). Un nom d'interviewé dans un journal
 *      d'exploitation n'est couvert par aucune finalité.
 *   2. **Contenus de collecte** — c'est la matière même de l'audit. Un verbatim
 *      dans un journal, c'est un salarié identifiable qui parle de son employeur.
 *   3. **Secrets d'authentification** — un jeton journalisé est un jeton compromis.
 */
export const CHEMINS_MASQUES_JOURNAL: readonly string[] = [
  // --- 1. Identités ---------------------------------------------------------
  'person_name',
  'personName',
  '*.person_name',
  '*.personName',
  '*.*.person_name',
  'email',
  '*.email',
  '*.*.email',
  'phone',
  '*.phone',
  'interviewee',
  '*.interviewee',
  'nom',
  '*.nom',

  // --- 2. Contenus de collecte ---------------------------------------------
  'answer',
  '*.answer',
  'answers',
  '*.answers',
  'value_text',
  '*.value_text',
  'valueText',
  '*.valueText',
  'note',
  '*.note',
  'notes',
  '*.notes',
  'verbatim',
  '*.verbatim',
  'verbatims',
  '*.verbatims',
  'payload',
  '*.payload',
  // Le prompt LLM contient les réponses pseudonymisées : il ne doit pas plus
  // apparaître qu'elles (06 §10.4, pseudonymisation en deux passes).
  'prompt',
  '*.prompt',
  'completion',
  '*.completion',

  // --- 3. Secrets d'authentification ---------------------------------------
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'secret',
  '*.secret',
  'dek',
  '*.dek',
  'kek',
  '*.kek',
];

/** Marqueur substitué à la valeur masquée. Explicite : on doit voir qu'on masque. */
export const CENSEUR_JOURNAL = '[masqué:rgpd]';

/**
 * Options de redaction, prêtes à passer à pino.
 *
 * `remove: false` est délibéré : on garde la CLÉ et on remplace la VALEUR. Supprimer
 * la clé ferait disparaître l'information qu'un champ existait — or savoir qu'une
 * réponse a été traitée, sans savoir laquelle, est précisément ce qu'un journal
 * d'exploitation doit permettre.
 */
export const OPTIONS_REDACTION_JOURNAL = {
  paths: [...CHEMINS_MASQUES_JOURNAL],
  censor: CENSEUR_JOURNAL,
  remove: false,
} as const;
