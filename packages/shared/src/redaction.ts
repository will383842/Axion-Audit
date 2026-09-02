// =============================================================================
// POLITIQUE DE REDACTION DES JOURNAUX — SOURCE UNIQUE
//
// Contrat 11 §2 : « Aucune donnée personnelle dans les logs : person_name, emails et
// contenus de réponse INTERDITS dans pino (redaction configurée) — cohérent §10. »
// RGPD 06 §10.4 : les identités ne circulent pas hors de leur finalité.
// Traçabilité : E33 (sécurité/RGPD), E42 (RGPD renforcé).
//
// -----------------------------------------------------------------------------
// ARBITRAGE : UN JOURNAL EXPLOITABLE **ET** SANS DONNÉE PERSONNELLE
// -----------------------------------------------------------------------------
// 06 §10.2 exige des journaux d'exploitation utiles (c'est par eux qu'on diagnostique
// une sync défaillante) ; 06 §10.4 interdit d'y faire figurer des personnes. Les deux
// tiennent ensemble à trois conditions, et l'ordre compte :
//
//   1. ON MASQUE LA VALEUR, ON GARDE LA CLÉ. `remove: false` : savoir qu'une réponse a
//      été traitée sans savoir laquelle est exactement ce qu'un journal doit permettre.
//
//   2. ON MASQUE PAR NOM DE CHAMP, PAS PAR TYPE. Un champ n'est masqué que s'il figure
//      dans la liste ci-dessous, ÉTABLIE COLONNE PAR COLONNE DEPUIS LE FICHIER 04.
//      Corollaire assumé : `company.name`, `org_unit.name`, `tools_inventory.name`,
//      `blocks.label_fr`, `questions.text_fr`, `estimation_params.key`, `mission.title`,
//      `answers.source`, `answers.withheld_reason`, les identifiants, les statuts, les
//      compteurs et les durées RESTENT EN CLAIR. Ce ne sont pas des données de
//      personnes physiques, et ce sont EUX qui rendent un incident diagnosticable.
//      Masquer « tout ce qui est du texte » produirait un journal de `[masqué]` —
//      c'est-à-dire l'absence de journal, au moment précis où l'on en a besoin.
//
//   3. LES CHAMPS OÙ UNE IDENTITÉ ARRIVE PAR ACCIDENT SONT NETTOYÉS, PAS MASQUÉS.
//      Une URL, un `err.message`, un `err.detail`, un `msg` : la donnée personnelle y
//      entre par un chemin que la liste de champs ne voit pas (`/v1/users?email=…`,
//      « échec pour jean.dupont@client.fr »). Les masquer en bloc coûterait la route
//      fautive et la cause de l'erreur — le cœur du diagnostic. On les CONSERVE en
//      retirant chirurgicalement e-mails, jetons porteurs, numéros de téléphone,
//      valeurs de paramètres de requête sensibles, ET LE CONTENU DES CONTENANTS À
//      GABARIT RIGIDE (§6 : `Key (…)=(…)`, `Failing row contains (…)`, valeur refusée
//      à la conversion, extrait de JSON invalide). Ce nettoyage s'applique à TOUTE
//      chaîne, à toute profondeur : c'est le filet sous la liste de champs.
//
//      La distinction qui porte tout le §6 : on ne reconnaît JAMAIS la donnée, on
//      reconnaît le bocal. Un nom de personne n'a aucune forme ; le gabarit dans
//      lequel PostgreSQL le recopie, si.
//
// -----------------------------------------------------------------------------
// POURQUOI UN PARCOURS RÉCURSIF ET NON UNE LISTE DE CHEMINS `*.*.champ`
// -----------------------------------------------------------------------------
// La version précédente énumérait des chemins pino (`email`, `*.email`, `*.*.email`).
// Deux défauts, tous deux mesurés :
//   · elle s'arrêtait à la profondeur déclarée — `{a:{b:{c:{email}}}}` passait en clair ;
//   · l'étendre coûte cher. Mesure locale (pino 9.14, ligne de requête HTTP typique) :
//     sans redaction 2,1 µs/ligne · les 53 chemins d'AVANT 40,7 µs · 210 chemins joker
//     373 µs · 280 chemins 660 µs. Le joker de fast-redact est quadratique : couvrir
//     70 champs sur 4 niveaux aurait rendu la journalisation 300× plus lente que son
//     absence. Le parcours récursif coûte 11,4 µs/ligne pour une couverture COMPLÈTE,
//     contre 66,2 µs pour la couverture PARTIELLE d'avant (même machine, même série) :
//     la version correcte est aussi la plus rapide.
// On déclare donc UN joker de premier niveau (`*`) dont le `censor` est une fonction :
// pino l'appelle une fois par clé racine ET sur `msg`, et cette fonction parcourt le
// sous-arbre UNE fois, en O(taille). Les champs sensibles pouvant apparaître EN RACINE
// sont en plus déclarés nommément — pino ne transmet pas le nom de la clé racine au
// censor du joker (il passe un Symbol), c'est la seule façon de les reconnaître.
//
// PROFONDEUR COUVERTE : illimitée jusqu'à `PROFONDEUR_MAX_JOURNAL` (8). Au-delà, le
// sous-arbre entier est masqué — jamais rendu en clair. 8 parce que la structure la
// plus profonde que ce produit journalise légitimement en compte 5
// (`req.body.entretien.participants[0].nom` = req·body·entretien·participants·0·nom) ;
// 8 laisse trois niveaux de marge et borne le coût du parcours sur un objet cyclique
// ou anormalement profond.
//
// CE QUE LE PARCOURS NE PEUT PAS SUPPOSER : que pino émettra ce qu'il a inspecté.
// Un objet peut détourner sa sérialisation par un `toJSON()`, ou n'être qu'un sac
// d'octets bruts — dans les deux cas, examiner ses propriétés énumérables ne dit
// RIEN de ce qui part sur le réseau. C'est le défaut F-01 (A51, 2026-08-31), fermé
// au §7, où la règle est écrite comme une liste d'AUTORISÉS.
//
// UN SEUL ENDROIT : l'API et le worker consomment `OPTIONS_REDACTION_JOURNAL` tel quel.
// Ajouter un champ ici le masque PARTOUT. Deux copies d'une politique RGPD divergent
// toujours, et divergent en silence.
//
// -----------------------------------------------------------------------------
// CE QUE CETTE POLITIQUE NE COUVRE PAS — dit ici pour qu'on ne le redécouvre pas
// -----------------------------------------------------------------------------
//   · Un NOM DE PERSONNE en texte libre (« échec pour Jean Dupont ») dans un `msg` ou
//     un champ non listé, HORS d'un contenant du §6. Aucune expression régulière ne
//     détecte un nom propre ; 06 §10.4 confie cela à une passe NER, qui n'a pas sa
//     place dans un logger. C'est précisément pourquoi les champs de texte libre du
//     modèle sont MASQUÉS et non nettoyés — et pourquoi « pas de donnée métier dans un
//     `msg` » reste une règle de revue croisée, pas une garantie technique. Le §6
//     rattrape le nom que la BASE recopie dans un gabarit connu ; il ne rattrape pas
//     celui qu'un développeur interpole lui-même dans une phrase.
//   · Un contenant à gabarit qu'on n'a pas relevé. Le §6 couvre ce qui a été MESURÉ
//     contre PG 16 et V8 ; un greffon tiers, un autre SGBD ou une future version de
//     Node peuvent en introduire d'autres. La parade est de mesurer à nouveau, pas
//     d'élargir les motifs « au cas où » — un motif trop large masque le diagnostic
//     et fait croire à une couverture qu'on n'a pas éprouvée.
//   · Une clé RACINE inconnue de la liste : pino appelle le censor du joker clé par
//     clé sans transmettre son nom (voir plus haut). Une donnée personnelle rangée
//     sous une clé racine que le fichier 04 ne nomme pas sortirait en clair si elle
//     n'est ni une chaîne nettoyable, ni sous un champ listé.
//   · Ce qui est journalisé HORS de ces trois instances pino (`console.log`,
//     `process.stdout`, un transport tiers). La redaction est une propriété du logger,
//     pas du processus.
//   · Un `toJSON()` à EFFET DE BORD, ou dont le résultat dépend de la clé que le
//     moteur lui passe (§7 l'appelle sans argument). Le premier est appelé une fois
//     de plus qu'avant ; le second peut rendre autre chose que ce que `JSON.stringify`
//     aurait obtenu — mais c'est la valeur CENSURÉE qui est émise, jamais la sienne.
//   · Un sac d'octets qui n'est ni un `ArrayBuffer` ni une vue sur un `ArrayBuffer`
//     (un tableau de nombres construit à la main, par exemple). Rien ne le distingue
//     d'une série de mesures : c'est une donnée métier tant qu'un type ne dit pas
//     le contraire.
// =============================================================================

/** Marqueur substitué à la valeur masquée. Explicite : on doit voir qu'on masque. */
export const CENSEUR_JOURNAL = '[masqué:rgpd]';

/** Marqueur d'un sous-arbre coupé parce que trop profond (voir PROFONDEUR_MAX_JOURNAL). */
export const CENSEUR_PROFONDEUR_JOURNAL = '[masqué:profondeur]';

/** Marqueur des identités retirées d'une chaîne conservée (URL, message d'erreur). */
export const CENSEUR_TEXTE_JOURNAL = '[masqué]';

/**
 * Marqueur d'un contenu BINAIRE refusé en bloc (§7). La LONGUEUR en octets survit :
 * « le morceau reçu fait 0 octet » est le diagnostic entier d'un envoi de pièce
 * jointe raté (05 §9.6), et une longueur n'identifie personne.
 */
export const CENSEUR_BINAIRE_JOURNAL = '[masqué:binaire]';

/**
 * Marqueur d'un objet dont la sérialisation alternative a LEVÉ (§7). On ne rend
 * alors PAS l'objet d'origine : un `toJSON()` qui échoue laisse un objet dont on ne
 * sait rien, et rendre l'inconnu en clair est exactement le défaut qu'on ferme.
 */
export const CENSEUR_SERIALISATION_JOURNAL = '[masqué:sérialisation]';

/** Profondeur maximale parcourue. Au-delà, le sous-arbre est masqué en bloc. */
export const PROFONDEUR_MAX_JOURNAL = 8;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. IDENTITÉS ET COORDONNÉES DE PERSONNES PHYSIQUES
//
// Établies colonne par colonne depuis docs/04 : `users(name, email)`,
// `refresh_tokens(device_label)`, `interviews(person_name, person_role,
// person_email, participants)`, `ai_systems(business_owner)`,
// `findings(owner_suggested)`, `activity_log(ip)`.
// Base légale : intérêt légitime avec information préalable (06 §10.4) — un nom
// d'interviewé dans un journal d'exploitation n'est couvert par aucune finalité.
// ═══════════════════════════════════════════════════════════════════════════════
const CHAMPS_IDENTITE = [
  // interviews.person_name / person_role / person_email (04, COLLECTE)
  'person_name',
  'person_role',
  'person_email',
  // users.name : voir CHAMPS_IDENTITE_CONTEXTUELS — `name` seul est trop polysémique.
  'user_name',
  'nom_utilisateur',
  'full_name',
  'display_name',
  'nom',
  'prenom',
  'nom_complet',
  'interviewee',
  'interlocuteur',
  // interviews.participants JSONB : [{nom, fonction}] — masqué en bloc (04, §28.1).
  'participants',
  // Coordonnées.
  'email',
  'mail',
  'courriel',
  'email_address',
  'phone',
  'telephone',
  'tel',
  'mobile',
  'address',
  'adresse',
  // ai_systems.business_owner, findings.owner_suggested (04) : des personnes nommées.
  'business_owner',
  'owner_suggested',
  // refresh_tokens.device_label : « le Pixel de Jean » identifie son porteur.
  'device_label',
  // activity_log.ip (04) + les entêtes qui la portent. RGPD : IP anonymisée à 90 j
  // en base (06 §10.4) ; dans un journal elle n'a aucune durée de vie encadrée.
  'ip',
  'ip_address',
  'client_ip',
  'remote_address',
  'remote_addr',
  'x_forwarded_for',
  'x_real_ip',
];

/**
 * `name` n'est masqué que sous un parent qui en fait un nom de PERSONNE.
 * `users.name` est une donnée personnelle ; `companies.name`, `org_units.name`,
 * `tools_inventory.name`, `ai_systems.name` et `report_templates.name` n'en sont pas
 * — et ce sont eux qu'on lit pour comprendre un incident. Masquer `name` partout
 * reviendrait à masquer l'entreprise et l'unité auditées : condition 2 de l'arbitrage.
 */
const CHAMPS_IDENTITE_CONTEXTUELS: Record<string, readonly string[]> = {
  name: [
    'user',
    'users',
    'utilisateur',
    'utilisateurs',
    'compte',
    'account',
    'person',
    'personne',
    'personnes',
    'participant',
    'participants',
    'interviewee',
    'auteur',
  ],
};

/**
 * Sœurs qui trahissent une LIGNE DE PERSONNE. `users(name, email, password_hash,
 * usage_profile, habilitated_at, last_login_at)` et `interviews(person_name,
 * person_email)` sont reconnaissables à ces colonnes-là et à aucune autre table.
 * Quand l'une d'elles est présente dans le même objet, `name` est masqué même sans
 * parent nommé — c'est le cas du vidage brut d'une ligne (`log.info(ligne)`), où le
 * nom du parent n'existe pas. Sans cette règle, `users.name` — nommément cité par
 * 06 §10.4 (« recherche par nom d'interviewé ») — sortait en clair.
 */
const SOEURS_LIGNE_PERSONNE = [
  'email',
  'password_hash',
  'person_email',
  'person_name',
  'habilitated_at',
  'usage_profile',
  'last_login_at',
];

/**
 * `answers.value` (04) est LA réponse d'audit : masquée. Mais `estimation_params(key
 * PRIMARY KEY, value NUMERIC)` porte la CONFIGURATION de scoring — masquer un seuil
 * rendrait indiagnosticable un score faux, ce que 06 §10.2 refuse.
 * On distingue les deux par la FORME de la table, pas par une intuition :
 * `value` reste en clair uniquement s'il voisine une colonne `key`/`cle` ET qu'il est
 * un nombre ou un booléen. `app_settings(key, value JSONB)` — qui héberge les
 * « secrets chiffrés » (04) — reste donc masqué, comme il doit l'être.
 */
const SOEURS_CLE_CONFIG = ['key', 'cle'];

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CONTENUS DE COLLECTE ET TEXTES LIBRES
//
// C'est la matière même de l'audit : `answers(value, note, review_reason, na_reason,
// question_text_snapshot)`, `answer_revisions(previous_value)`,
// `attachments(content, transcription, filename)`, `interviews(general_notes)`,
// `findings(statement, recommendation)`, `use_cases(description, conditions,
// assumptions)`, `tools_inventory(usage_description, data_quality_note)`,
// `ai_systems(usage_description, notes)`, `report_sections(raw_data, generated_text,
// validated_text)`, `alerts(ack_reason)`, `step_validations(override_reason)`,
// `mission_rebaselines(note)`, `companies(notes)`.
// Un verbatim dans un journal, c'est un salarié identifiable qui parle de son employeur
// — et §10.4 rappelle que les tiers cités en note (« Jean-Marc de la compta ») y sont
// fréquents. Le prompt LLM contient ces réponses : il ne doit pas plus apparaître.
// ═══════════════════════════════════════════════════════════════════════════════
const CHAMPS_CONTENU = [
  // ── Le tableau POSITIONNEL d'une requête préparée (A51, F-12) ──────────────
  // `params` est la propriété propre que `DrizzleQueryError` expose en plus de son
  // message. Il n'a AUCUNE clé : rien, dans son contenu, ne peut être reconnu par la
  // politique par nom — c'est précisément ce qui la contournait intégralement.
  //
  // Masqué EN BLOC, et c'est le seul traitement honnête : un tableau de valeurs de
  // colonnes porte aujourd'hui des identifiants et des codes, et portera
  // `person_name` et `participants` dès que L5/L6 écriront ces tables. Le nettoyage
  // de chaînes (§6) traite le MESSAGE ; ce masquage-ci traite le CHAMP. Il faut les
  // deux : pino sérialise les deux, et l'un ne voit pas ce que l'autre voit.
  //
  // ⚠ EFFET DE BORD ASSUMÉ ET VÉRIFIÉ : `req.params` (les paramètres d'URL de
  // Fastify) porte le même nom et sera masqué aussi. On y perd des identifiants de
  // ressource dans le journal d'exploitation — l'`url` complète, elle, reste
  // journalisée et nettoyée, donc le diagnostic ne disparaît pas. Un champ de trop
  // masqué coûte une gêne ; un champ de moins coûte une divulgation.
  'params',
  // answers / answer_revisions
  'value', // exempté sur la forme `(key, value NUMERIC)` — voir SOEURS_CLE_CONFIG
  'previous_value',
  'answer',
  'answers',
  'reponse',
  'reponses',
  'note',
  'notes',
  'general_notes',
  'review_reason',
  'na_reason',
  'ack_reason',
  'override_reason',
  'data_quality_note',
  // attachments
  'content',
  'contenu',
  'transcription',
  // Un nom de fichier porte régulièrement l'identité (« CR-entretien-Dupont.pdf »).
  // `mime`, `size_bytes` et `storage_key` (opaque) restent en clair : ce sont eux
  // qui servent à diagnostiquer un envoi raté.
  'filename',
  'original_filename',
  'originalname',
  // findings / use_cases / roadmap_items / inventaires
  'statement',
  'recommendation',
  'description',
  'conditions',
  'assumptions',
  'usage_description',
  // report_sections + chaîne LLM (06 §10.4, pseudonymisation en deux passes)
  'raw_data',
  'generated_text',
  'validated_text',
  'verbatim',
  'verbatims',
  'prompt',
  'completion',
  'messages',
  // Corps de requête et enveloppes d'op : entrée non maîtrisée, masquée en bloc.
  'body',
  'payload',
];

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SECRETS D'AUTHENTIFICATION — un jeton journalisé est un jeton compromis.
//
// C'est ici que la version précédente échouait le plus gravement : `password` était
// absent de la liste des champs imbriqués, si bien que le mot de passe d'un corps de
// requête sortait EN CLAIR à côté d'un e-mail correctement masqué. Le lot L2 pose
// l'authentification : la barrière censée rendre la fuite impossible était trouée
// avant d'exister.
// Colonnes du fichier 04 : `users.password_hash`, `refresh_tokens.token_hash`,
// `integration_events.nonce` (anti-rejeu §8.6 — un nonce divulgué autorise le rejeu),
// `app_settings.value` (secrets chiffrés).
// ═══════════════════════════════════════════════════════════════════════════════
const CHAMPS_SECRET = [
  'password',
  'password_hash',
  'new_password',
  'old_password',
  'current_password',
  'mot_de_passe',
  'token',
  'token_hash',
  'access_token',
  'refresh_token',
  'id_token',
  'jwt',
  'bearer',
  'authorization',
  'cookie',
  'cookies',
  'set_cookie',
  'secret',
  'api_key',
  'client_secret',
  'private_key',
  'passphrase',
  'credential',
  'credentials',
  'session_id',
  'signature',
  'nonce',
  'salt',
  'hash',
  'dek',
  'kek',
  // Chaînes de connexion : elles PORTENT le mot de passe.
  'connection_string',
  'database_url',
  'redis_url',
  'dsn',
  'secret_access_key',
  'access_key_id',
];

/**
 * Fragments déclenchant le masquage même sur un nom de champ non listé.
 * Raison : le lot L2 (auth) et le lot L6 (sync) introduiront des champs que cette
 * liste ne peut pas nommer aujourd'hui. Un garde-fou qui ne couvre que le passé
 * est le défaut qu'on corrige ici — il ne doit pas être réintroduit sous une
 * autre forme.
 */
const FRAGMENTS_SECRET = [
  'password',
  'passwd',
  'motdepasse',
  'secret',
  'token',
  'apikey',
  'privatekey',
  'passphrase',
  'credential',
  'authorization',
];

/**
 * Exceptions au règle des fragments — condition 2 de l'arbitrage.
 * `llm_calls(tokens_in, tokens_out)` et `report_sections.llm_tokens` (04) sont des
 * COMPTEURS de jetons LLM : ils portent le coût d'une génération, pas un secret.
 * Les masquer rendrait le suivi de coût (§26.2) impossible.
 */
const TOLERES_MALGRE_FRAGMENT = [
  'tokens',
  'tokensin',
  'tokensout',
  'tokens_in',
  'tokens_out',
  'llmtokens',
  'llm_tokens',
  'tokenscount',
  'nbtokens',
  'tokencount',
];

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DONNÉES FINANCIÈRES — invariant 3, E21.
// `scoping_financials` est en base une table SÉPARÉE, accessible aux seules routes
// admin. Un journal partagé avec l'exploitation annulerait cette séparation.
// ═══════════════════════════════════════════════════════════════════════════════
const CHAMPS_FINANCIERS = ['daily_rates', 'travel_costs', 'total_amount'];

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CHAMPS NETTOYÉS (conservés) — condition 3 de l'arbitrage.
// Ils ne sont pas listés pour être masqués : ils le sont pour documenter que le
// nettoyage de chaînes existe d'abord POUR EUX. Le nettoyage s'applique en réalité à
// TOUTE chaîne rencontrée, quel que soit son nom : c'est ce qui rattrape le champ
// qu'on n'a pas su nommer.
// ═══════════════════════════════════════════════════════════════════════════════
export const CHAMPS_NETTOYES_JOURNAL: readonly string[] = [
  'msg',
  'message',
  'error',
  'err',
  'stack',
  'url',
  'original_url',
  'path',
  'reason',
  'title',
  'details',
  // `detail` (singulier) est le champ où le driver `pg` range le DETAIL de PostgreSQL
  // — donc `Key (…)=(…)` et `Failing row contains (…)`. Mesuré : c'est LÀ que vivait
  // la fuite de `person_name`, et non dans `err.message` comme on pouvait le croire.
  'detail',
  // `query` : le SQL que `DrizzleQueryError` expose comme propriété propre. NETTOYÉ
  // et non masqué — il ne porte que des identifiants SQL et des emplacements
  // numérotés, et c'est le diagnostic entier d'un import qui échoue. Son jumeau
  // `params`, lui, est MASQUÉ (voir §2, CHAMPS_CONTENU) : c'est un tableau
  // POSITIONNEL, donc rien dans son contenu ne peut être reconnu.
  'query',
];

/** Tous les noms de champs masqués, forme canonique du fichier 04 (snake_case). */
export const CHAMPS_MASQUES_JOURNAL: readonly string[] = [
  ...CHAMPS_IDENTITE,
  ...CHAMPS_CONTENU,
  ...CHAMPS_SECRET,
  ...CHAMPS_FINANCIERS,
];

/**
 * Champs masqués EN RACINE de l'objet journalisé, en plus des précédents.
 * `name` seul y figure : à la racine, `{ name: … }` est presque toujours le vidage
 * brut d'une ligne (`log.info(ligneUtilisateur)`) — le seul cas où la règle des
 * sœurs (SOEURS_LIGNE_PERSONNE) ne peut PAS s'appliquer, puisque pino appelle le
 * censor clé par clé et ne montre jamais les voisines. Imbriqué, `name` reste en
 * clair : `mission.entreprise.name` et `unite.name` sont des repères de diagnostic.
 */
const CHAMPS_MASQUES_RACINE: readonly string[] = [...CHAMPS_MASQUES_JOURNAL, 'name'];

// ═══════════════════════════════════════════════════════════════════════════════
// MISE EN ŒUVRE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Forme comparable d'un nom de champ : `person_name`, `personName`, `Person-Name` et
 * `PERSON_NAME` deviennent `personname`. C'est la traduction directe de la convention
 * 11 §3 (`snake_case` en base ↔ `camelCase` en TS) : une politique déclarée dans une
 * seule des deux graphies laisse forcément passer l'autre — c'est exactement ce qui
 * arrivait à `personName` face à `*.*.person_name`.
 */
function normaliser(cle: string): string {
  return cle.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const MASQUES = new Set(CHAMPS_MASQUES_JOURNAL.map(normaliser));
const MASQUES_RACINE = new Set(CHAMPS_MASQUES_RACINE.map(normaliser));
const TOLERES = new Set(TOLERES_MALGRE_FRAGMENT.map(normaliser));
const SOEURS_CONFIG = new Set(SOEURS_CLE_CONFIG.map(normaliser));
const SOEURS_PERSONNE = new Set(SOEURS_LIGNE_PERSONNE.map(normaliser));
const CONTEXTUELS = new Map<string, ReadonlySet<string>>(
  Object.entries(CHAMPS_IDENTITE_CONTEXTUELS).map(([champ, parents]) => [
    normaliser(champ),
    new Set(parents.map(normaliser)),
  ]),
);

/** Adresses e-mail, y compris dans une chaîne libre ou une query string. */
const RX_EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Jeton porteur d'un en-tête ou d'une chaîne recopiée. */
const RX_PORTEUR = /\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/**
 * JETON JWT **NU**, sans préfixe et sans champ porteur.
 *
 * `RX_PORTEUR` ci-dessus ne voit le jeton que s'il est annoncé (`Bearer eyJ…`), et la
 * liste de champs ne le voit que s'il est rangé sous `authorization`/`token`. Or les
 * bibliothèques de jetons le recopient NU au milieu d'une phrase — `jwt malformed:
 * eyJ…`, `signature invalid for eyJ…`. Mesuré : il sortait alors en clair, dans le
 * message ET dans la pile. Le mot « token » voisin dans un échantillon donnait
 * l'illusion inverse — c'est lui, et non le jeton, qui déclenchait l'assainisseur.
 *
 * POURQUOI CE MOTIF EST LÉGITIME LÀ OÙ « DÉTECTER UN NOM » NE LE SERAIT PAS : un JWT a
 * une forme RIGIDE et vérifiable — des segments base64url séparés par des points, dont
 * le premier commence par `eyJ` parce qu'un en-tête JWT encode toujours `{"`. On ne
 * devine rien, on reconnaît une structure. C'est l'exact inverse d'un nom de personne,
 * qui n'a aucune forme et dont la « détection » ne serait qu'une promesse (voir §6).
 *
 * On masque le JETON, pas la PHRASE : « jwt malformed » et « signature invalid » sont
 * le diagnostic et survivent — même équilibre que `Key (colonne)=(valeur)` au §6.
 * Le champ `authorization` et les noms de champs porteurs restent masqués EN BLOC par
 * le §3 : ce motif n'est pas leur remplaçant, il est le filet sous eux.
 *
 * CE QUE CE MOTIF NE VOIT PAS, et qu'aucune forme ne trahit :
 *   · un jeton OPAQUE (chaîne aléatoire sans structure) — jeton de rafraîchissement,
 *     clé d'API maison, identifiant de session. Rien ne le distingue d'un identifiant
 *     métier. Il reste couvert par le NOM DE CHAMP (§3) et par lui seul.
 *   · un jeton TRONQUÉ avant son deuxième point (« eyJhbGciOiJIUzI1NiJ9… ») : le
 *     fragment restant ne prouve plus rien, mais il ne suffit pas non plus à rejouer.
 *   · un secret sans forme (mot de passe, phrase de passe) recopié dans un texte libre.
 *     Comme le nom de personne : hors de portée d'un motif, par nature.
 */
const RX_JETON_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*){0,3}/g;

/**
 * Paramètres de requête dont la VALEUR est personnelle.
 * `code` n'y figure pas volontairement : `?code=CAD-01` est un code de bloc ou de
 * question (04), pas un secret — le masquer coûterait le diagnostic d'un import.
 */
const RX_PARAM_SENSIBLE =
  /\b(email|mail|courriel|person_name|personname|nom|prenom|name|phone|telephone|tel|token|password|mot_de_passe|secret|api_key|apikey|q|search|recherche)=([^&#\s"'<>]*)/gi;

/** Numéro de téléphone français, sous ses formes usuelles. */
const RX_TELEPHONE = /(?:(?:\+|00)33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CONTENANTS À VALEUR — on ne reconnaît pas la donnée, on reconnaît le BOCAL
//
// Les motifs ci-dessus reposent tous sur une donnée AUTO-DESCRIPTIVE : une adresse a
// une arobase, un jeton porteur a son préfixe, un numéro français a sa forme. Un NOM
// DE PERSONNE n'a rien de tel — et il ne faut SURTOUT PAS essayer de « détecter ce qui
// ressemble à un nom » : ce garde-fou-là annoncerait bien plus qu'il ne tiendrait.
//
// Ce qui est reconnaissable n'est pas la valeur, c'est le CONTENANT. PostgreSQL et V8
// produisent des gabarits rigides et documentés dans lesquels une valeur utilisateur
// ARBITRAIRE est recopiée. On masque la case « valeur » de ces gabarits sans jamais
// regarder de quelle colonne il s'agit — donc en couvrant `person_name` exactement
// comme `answers.value` ou une colonne que le fichier 04 ne connaît pas encore.
//
// LE PRINCIPE, EN UNE LIGNE : le nom de colonne, le nom de contrainte, le nom de type
// et le SQLSTATE sont du DIAGNOSTIC et doivent SURVIVRE ; ce qui est entre parenthèses
// ou entre guillemets après eux est de la DONNÉE et doit disparaître. C'est ce qui
// rend un incident encore lisible (06 §10.2) sans divulguer de personne (06 §10.4).
//
// OÙ LA VALEUR VIT RÉELLEMENT — mesuré contre PostgreSQL 16 + driver `pg` 8.23, pas
// supposé : le driver NE concatène PAS le DETAIL dans `err.message`. Il l'expose dans
// un champ `err.detail` distinct, que pino sérialise tel quel. `err.message` ne porte
// que la constante (« duplicate key value violates unique constraint "…" »). La fuite
// vivait donc dans `err.detail` — d'où le nettoyage appliqué à TOUTE chaîne, à toute
// profondeur, plutôt qu'à une liste de champs qu'on aurait encore fallu deviner.
// Contre-exemple conservé : `err.message` PORTE la valeur pour le SQLSTATE 22P02
// (« invalid input syntax for type uuid: "…" »). Les deux champs devaient être traités.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PostgreSQL — violation d'unicité (23505), d'exclusion (23P01) et de clé étrangère
 * (23503). Formes RELEVÉES sur PG 16, pas citées de mémoire :
 *   `Key (email)=(jean@client.fr) already exists.`
 *   `Key (mission_id, person_name)=(10, Jean Dupont) already exists.`
 *   `Key (user_id)=(999) is not present in table "users".`
 *   `Key (id)=(1) is still referenced from table "interviews".`
 * Le groupe capturé — la liste des COLONNES — est réinjecté : c'est lui qui dit quelle
 * contrainte a sauté, et il ne contient que des identifiants SQL, jamais de donnée.
 * La partie valeur est prise GLOUTONNEMENT jusqu'au dernier `)` de la LIGNE : une
 * valeur peut elle-même contenir des parenthèses (« Acme (SARL) ») et s'arrêter à la
 * première fermante laisserait fuiter la fin. Le bornage à la ligne (`[^\n]`) est ce
 * qui empêche cette gourmandise d'avaler la pile d'appels qui suit.
 */
const RX_PG_CLE = /\bKey \(([^()\n]*)\)=\([^\n]*\)/g;

/**
 * PostgreSQL — violation de CHECK (23514) et de NOT NULL (23502). C'est le contenant
 * le plus dangereux du lot : il ne recopie pas une colonne, il déverse la LIGNE
 * ENTIÈRE, colonnes non fautives comprises.
 *   `Failing row contains (4, 12, Sophie Bernard, STAGIAIRE, null).`
 * Rien n'y est réinjecté : contrairement à `Key (…)=(…)`, ce gabarit ne nomme aucune
 * colonne, donc il ne contient AUCUN diagnostic à préserver. Le nom de la contrainte
 * et le SQLSTATE, eux, vivent dans d'autres champs et ne sont pas touchés.
 */
const RX_PG_LIGNE_FAUTIVE = /\bFailing row contains \([^\n]*\)/g;

/**
 * PostgreSQL — valeur refusée à la conversion (22P02 et voisins) :
 *   `invalid input syntax for type uuid: "Paul Martin"`
 *   `invalid input value for enum role_personne: "Paul Martin"`
 * Celui-ci vit dans `err.message`, pas dans `err.detail` — d'où sa présence ici alors
 * que les deux précédents auraient pu laisser croire que seul `detail` était en cause.
 * Le NOM DU TYPE est conservé : « ce n'est pas un uuid » est le diagnostic entier.
 */
const RX_PG_SYNTAXE_TYPE =
  /\b(invalid input (?:syntax for type|value for enum) [^:\n"]*): "[^\n]*"/g;

/**
 * V8 / `JSON.parse` — le moteur recopie un extrait de l'entrée refusée :
 *   `Unexpected token 'p', "person_nam"... is not valid JSON`
 * Atteignable ici : l'import de banque (L4) recopie `cause.message` dans le libellé de
 * son défaut (`banque-questions.ts`, cellules `options` et `scoring`). L'extrait est
 * tronqué par V8, jamais assaini : dix caractères de corps de requête suffisent à
 * porter un début de nom.
 */
const RX_JSON_INVALIDE = /"[^\n]*"(\.\.\.)? is not valid JSON/g;

/**
 * DRIZZLE — le message d'une requête échouée recopie **la requête ET TOUS SES
 * PARAMÈTRES**. Vérifié dans `drizzle-orm`, `errors.js` : le constructeur concatène
 * la requête et le tableau des paramètres dans le message, puis les expose en plus
 * comme propriétés propres (`query`, `params`) — que le sérialiseur d'erreur de pino
 * recopie telles quelles.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE CONTENANT-CI CONTOURNE INTÉGRALEMENT LE MASQUAGE PAR NOM DE CHAMP.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Relevé par la revue de sécurité A51 (F-12), MESURÉ sur une `DrizzleQueryError`
 * reconstruite et passée à pino avec la politique de ce fichier : une cellule de
 * fichier client ressortait **en clair**, deux fois — dans le message et dans
 * `params`.
 *
 * Ce qui rend ce gabarit différent des trois précédents : `params` est un tableau
 * **POSITIONNEL**. Il n'a pas de clés, donc il n'y a aucun nom de champ à
 * reconnaître — toute la politique par nom (§1 à §4) est aveugle devant lui, quelle
 * que soit la colonne concernée. Aujourd'hui il transporte des identifiants et des
 * codes ; dès qu'un `INSERT` d'import échoue sur une erreur NON TRADUITE
 * (interblocage `40P01`, rupture de connexion, `22001`, une contrainte future), il
 * transporte **tout le lot de lignes du fichier client**. Et dès L5/L6, ces lignes
 * porteront `person_name` et `participants`.
 *
 * ── CE QUI SURVIT, ET POURQUOI ──────────────────────────────────────────────
 * **La REQUÊTE est conservée** : c'est le diagnostic entier — quelle table, quelles
 * colonnes, quelle forme. Elle ne contient que des identifiants SQL et des
 * emplacements numérotés, jamais une valeur. **Le segment des paramètres
 * disparaît**, remplacé par un DÉCOMPTE : « combien de valeurs » reste utile pour
 * comprendre un lot qui échoue, « lesquelles » ne l'est jamais assez pour valoir une
 * fuite.
 *
 * ── LE BORNAGE : JUSQU'À LA FIN DE LA CHAÎNE, ET C'EST UN CORRECTIF ────────
 * La première version s'arrêtait sur la forme d'une trame de pile (`\n    at `).
 * A51 (F-20) a montré que ce terminateur est DANS LE TEXTE QUE L'APPELANT CONTRÔLE :
 * une cellule de CSV entre guillemets peut porter un saut de ligne (RFC 4180, admis
 * par `analyserCsvArbre`), donc une valeur peut contenir une FAUSSE trame — et tout
 * ce qui la suivait repartait en clair. **On ne borne jamais un masquage par un
 * motif que la donnée peut contenir** : le segment est donc masqué jusqu'à la fin de
 * la chaîne, sans exception et sans condition.
 *
 * Les trames de pile ne sont pas perdues pour autant : elles sont récupérées par une
 * borne que l'appelant ne contrôle pas — la LONGUEUR du message, propriété distincte
 * de l'erreur. Voir `nettoyerPileJournal`, et le pourquoi complet qui y est écrit.
 */
const RX_DRIZZLE_PARAMS = /\nparams:[\s\S]*?(?=\n {4}at |$)/;

/**
 * Emplacements de paramètres d'une requête préparée (`$1`, `$42`).
 * Sert UNIQUEMENT à compter : le décompte est lu sur la REQUÊTE, jamais sur les
 * valeurs — un comptage par virgules serait faux dès qu'une valeur en contient une
 * (« Direction, Sud »), et un décompte faux dans un journal est pire qu'aucun.
 */
const RX_EMPLACEMENT_PARAM = /\$(\d+)/g;

/**
 * Combien de paramètres la requête qui précède déclare-t-elle ?
 * Le MAXIMUM des emplacements, et non leur nombre d'occurrences : un même
 * emplacement peut être cité deux fois dans une requête.
 */
function compterParametres(requete: string): number {
  let maximum = 0;
  for (const trouve of requete.matchAll(RX_EMPLACEMENT_PARAM)) {
    const rang = Number(trouve[1]);
    if (Number.isFinite(rang) && rang > maximum) maximum = rang;
  }
  return maximum;
}

/**
 * PRÉFILTRE — un seul balayage pour écarter le cas courant.
 *
 * Mesuré, et c'est la raison d'être de cette ligne : garder chaque motif par son propre
 * `includes` coûtait +41 % sur une chaîne qui n'en contient AUCUN — c'est-à-dire sur
 * l'écrasante majorité du trafic, piles d'appels comprises. Cette alternance de
 * littéraux purs est compilée par V8 en un automate à préfiltre : elle tranche en une
 * passe, et les gardes fines ne sont payées que par les chaînes qui ont mordu.
 *
 * Les CINQ motifs ajoutés (quatre contenants du §6 + le jeton JWT nu) partagent ce
 * préfiltre unique : deux préfiltres séparés coûtaient deux balayages là où un seul
 * suffit. Toute nouvelle alternative ajoutée ici doit rester un LITTÉRAL — une
 * alternative à quantificateur ferait perdre l'automate, donc tout le bénéfice.
 */
const RX_INDICE_MOTIF = /\)=\(|row contains \(|invalid input |valid JSON|eyJ|\nparams:/;

/**
 * Retire les identités d'une chaîne QUE L'ON CONSERVE.
 * C'est le filet sous la liste de champs : il s'applique à toute chaîne journalisée,
 * à toute profondeur, y compris `msg`, `err.message`, `err.stack` et `req.url`.
 * Il ne prétend pas détecter les NOMS DE PERSONNES en texte libre — aucune expression
 * régulière ne le fait (06 §10.4 confie cela à une passe NER, hors d'un journal).
 * C'est la raison pour laquelle les champs de texte libre du modèle, eux, sont MASQUÉS.
 * Il vide en revanche les CONTENANTS à gabarit rigide (§6) dans lesquels une base ou un
 * moteur JSON recopie une valeur utilisateur arbitraire — un nom y compris.
 *
 * Chaque motif est gardé par un test très sélectif. Ce n'est pas de la superstition
 * d'optimisation : cette fonction s'exécute sur CHAQUE chaîne journalisée, piles
 * d'appels comprises, et une pile est longue. Le cas courant — une chaîne qui ne
 * contient aucun de ces gabarits — ne paie qu'un balayage, jamais les substitutions.
 * L'ordre des gardes est mesuré, pas supposé : voir `RX_INDICE_CONTENANT`.
 */
export function nettoyerTexteJournal(texte: string): string {
  if (texte.length === 0) return texte;
  let resultat = texte;
  // Les contenants d'abord : ils englobent la valeur, donc les vider dispense les
  // motifs suivants de retravailler ce qui vient déjà d'être remplacé. Le préfiltre
  // écarte en une passe les chaînes qui n'en contiennent aucun — le cas courant.
  if (RX_INDICE_MOTIF.test(resultat)) {
    if (resultat.includes(')=(')) {
      resultat = resultat.replace(RX_PG_CLE, `Key ($1)=(${CENSEUR_TEXTE_JOURNAL})`);
    }
    if (resultat.includes('row contains (')) {
      resultat = resultat.replace(
        RX_PG_LIGNE_FAUTIVE,
        `Failing row contains (${CENSEUR_TEXTE_JOURNAL})`,
      );
    }
    if (resultat.includes('invalid input ')) {
      resultat = resultat.replace(RX_PG_SYNTAXE_TYPE, `$1: "${CENSEUR_TEXTE_JOURNAL}"`);
    }
    if (resultat.includes('valid JSON')) {
      resultat = resultat.replace(
        RX_JSON_INVALIDE,
        `"${CENSEUR_TEXTE_JOURNAL}"$1 is not valid JSON`,
      );
    }
    // Drizzle : la requête survit, les paramètres deviennent un décompte. Placé
    // APRÈS les gabarits PostgreSQL et AVANT le jeton nu : une erreur de requête peut
    // porter les deux — le SQL de Drizzle et le DETAIL de PostgreSQL — et vider le
    // segment des paramètres d'abord épargne aux motifs suivants de le retravailler.
    if (resultat.includes('\nparams:')) {
      resultat = resultat.replace(
        RX_DRIZZLE_PARAMS,
        (_coincidence: string, decalage: number, entier: string) => {
          const nombre = compterParametres(entier.slice(0, decalage));
          // L'accord suit le décompte : « 1 paramètre masqué », « 4 paramètres
          // masqués ». Invariant 5 — une ligne de journal est lue par un humain,
          // et un pluriel fautif dans un fichier d'exploitation se recopie ensuite
          // dans une interface.
          if (nombre === 0) return '\nparams: [paramètres masqués]';
          const marque = nombre > 1 ? 's' : '';
          return `\nparams: [${String(nombre)} paramètre${marque} masqué${marque}]`;
        },
      );
    }
    // Le jeton nu partage le préfiltre. Le masquer AVANT `RX_PORTEUR` ne change rien
    // aux cas déjà couverts — `Bearer eyJ…` devient `Bearer [masqué]` par l'un ou par
    // l'autre — et c'est vérifié : zéro écart sur les entrées que la version
    // précédente traitait déjà.
    if (resultat.includes('eyJ')) resultat = resultat.replace(RX_JETON_JWT, CENSEUR_TEXTE_JOURNAL);
  }
  if (resultat.includes('@')) resultat = resultat.replace(RX_EMAIL, CENSEUR_TEXTE_JOURNAL);
  if (resultat.includes(' '))
    resultat = resultat.replace(RX_PORTEUR, `$1 ${CENSEUR_TEXTE_JOURNAL}`);
  if (resultat.includes('=')) {
    resultat = resultat.replace(RX_PARAM_SENSIBLE, `$1=${CENSEUR_TEXTE_JOURNAL}`);
  }
  if (resultat.length >= 10) resultat = resultat.replace(RX_TELEPHONE, CENSEUR_TEXTE_JOURNAL);
  return resultat;
}

/**
 * Marge de recherche de l'en-tête d'une pile V8 : « RangeError: » et ses voisins
 * tiennent très en deçà. Elle borne un balayage dont la longueur serait sinon
 * choisie par l'appelant.
 */
const MARGE_ENTETE_PILE = 256;

/**
 * NETTOIE UNE PILE D'APPELS EN PRÉSERVANT SES TRAMES — sans jamais chercher un
 * terminateur DANS la donnée.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CETTE FONCTION FERME (A51, F-20) : UN TERMINATEUR FALSIFIABLE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La première version de `RX_DRIZZLE_PARAMS` s'arrêtait sur `\n    at ` — la forme
 * d'une trame de pile. Or ce terminateur EST DANS LE TEXTE QUE L'APPELANT CONTRÔLE :
 * une cellule de CSV entre guillemets peut légitimement contenir un saut de ligne
 * (RFC 4180, admis par `analyserCsvArbre`), donc une valeur peut porter
 * `"Direction\n    at feint (/app/x.js:1:1)\nla suite"` — et tout ce qui suit la
 * fausse trame repartait EN CLAIR, dans `message` comme dans `stack`. Un garde-fou
 * dont la borne est choisie par l'attaquant n'est pas un garde-fou.
 *
 * ── LA RÈGLE, ET ELLE VAUT AU-DELÀ DE CE CAS ────────────────────────────────
 * **On ne borne jamais un masquage par un motif que la donnée peut contenir.** Le
 * motif masque donc désormais jusqu'à la FIN DE LA CHAÎNE. Les trames, elles, ne
 * sont pas perdues pour autant : elles sont récupérées par une borne que l'appelant
 * ne contrôle PAS — la LONGUEUR du message, qui est une propriété distincte de
 * l'erreur. V8 construit `stack` comme « Nom: message » suivi des trames ; couper à
 * la fin du message sépare donc exactement ce que l'appelant a écrit de ce que le
 * moteur a produit.
 *
 * Les deux moitiés sont ensuite nettoyées SÉPARÉMENT : si une fausse trame a été
 * glissée dans le message, elle est dans la première moitié, donc masquée ; les
 * vraies trames sont dans la seconde, donc préservées.
 *
 * ⚠ REPLI SÛR : si le message est introuvable dans la pile (forme inattendue, pile
 * réécrite, moteur non-V8), on masque la pile ENTIÈRE par le nettoyage ordinaire. On
 * ne préserve rien qu'on ne sait pas délimiter.
 */
export function nettoyerPileJournal(message: string, pile: string): string {
  if (message.length === 0) return nettoyerTexteJournal(pile);

  // Recherche BORNÉE : le message d'une erreur V8 commence dans les tout premiers
  // caractères de la pile (« RangeError: » et consorts). Chercher dans la pile
  // entière ferait payer un balayage proportionnel au produit des deux longueurs sur
  // une charge utile que l'appelant choisit.
  const zone = pile.slice(0, message.length + MARGE_ENTETE_PILE);
  const debut = zone.indexOf(message);
  if (debut < 0) return nettoyerTexteJournal(pile);

  const coupure = debut + message.length;
  return nettoyerTexteJournal(pile.slice(0, coupure)) + nettoyerTexteJournal(pile.slice(coupure));
}

/** Vrai si la clé désigne une valeur à masquer intégralement, dans ce contexte. */
function estMasque(
  cleNormalisee: string,
  parentNormalise: string,
  ligneDePersonne = false,
  valeurDeConfig = false,
): boolean {
  if (TOLERES.has(cleNormalisee)) return false;
  if (cleNormalisee === 'value' && valeurDeConfig) return false;
  if (MASQUES.has(cleNormalisee)) return true;
  const contextuel = CONTEXTUELS.get(cleNormalisee);
  if (contextuel !== undefined && (ligneDePersonne || contextuel.has(parentNormalise))) return true;
  return FRAGMENTS_SECRET.some((fragment) => cleNormalisee.includes(fragment));
}

/** Vrai si l'objet porte une colonne qui n'existe que sur une ligne de personne. */
function estLigneDePersonne(valeur: Record<string, unknown>): boolean {
  for (const cle of Object.keys(valeur)) {
    if (SOEURS_PERSONNE.has(normaliser(cle))) return true;
  }
  return false;
}

/** Vrai si l'objet a la forme `estimation_params(key, value NUMERIC)` du fichier 04. */
function estValeurDeConfig(valeur: Record<string, unknown>): boolean {
  const type = typeof valeur.value;
  if (type !== 'number' && type !== 'boolean') return false;
  for (const cle of Object.keys(valeur)) {
    if (SOEURS_CONFIG.has(normaliser(cle))) return true;
  }
  return false;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SÉRIALISATIONS QUI NE PASSENT PAS PAR LES PROPRIÉTÉS ÉNUMÉRABLES
//
// -----------------------------------------------------------------------------
// LE DÉFAUT FERMÉ ICI — A51, finding F-01, 2026-08-31
// -----------------------------------------------------------------------------
// C'est la forme la plus pure du défaut que ce dépôt traque, et il faut la dire
// telle quelle : LA CENSURE AVAIT BIEN TOURNÉ, ET SON RÉSULTAT ÉTAIT VRAI — POUR
// L'OBJET QU'ELLE AVAIT EXAMINÉ. Cet objet n'était simplement pas celui qui partait
// sur le réseau. Un garde-fou qui rend un verdict juste sur la mauvaise valeur ne
// se distingue d'un garde-fou correct par AUCUN symptôme : ni erreur, ni lenteur,
// ni test rouge. C'est pourquoi il a fallu une sonde pour le voir.
//
// Mesuré à la sonde, sur ces options exactes (`OPTIONS_REDACTION_JOURNAL`) :
//   new URL('…?email=…&token=eyJ…')       → "cible":"https://…?email=jean.…&token=eyJ…"
//   Buffer.from('person_name=Sophie …')   → "morceau":{"type":"Buffer","data":[112,101,…]}
//
// LE MÉCANISME : `parcourir` itérait `Object.entries`. Sur une `URL`, toute la
// donnée vit derrière des accesseurs de PROTOTYPE — aucune clé propre énumérable,
// donc rien à masquer, `modifie` restait faux et la MÊME RÉFÉRENCE était rendue.
// C'est ensuite le `JSON.stringify` de pino qui appelait `toJSON()`, APRÈS la
// censure, sur un objet que la censure avait laissé intact. La chaîne réellement
// émise n'avait jamais été examinée.
//
// -----------------------------------------------------------------------------
// LA PROPRIÉTÉ GARDÉE — et pourquoi ce n'est PAS une liste de types
// -----------------------------------------------------------------------------
// Exempter `URL` et `Buffer` nommément aurait reproduit le défaut sous une autre
// forme : la prochaine classe à `toJSON` (une enveloppe de bibliothèque tierce, un
// `Temporal.*`, un type maison de L6) serait repassée en clair, en silence, et
// personne ne l'aurait su. Le dépôt a déjà réécrit son garde anti-skip pour
// exactement cette raison (`scripts/check-no-skipped-tests.mjs` : liste
// d'AUTORISÉS, refus par défaut de l'inconnu) ; on applique ici la même posture.
//
// La propriété se formule sans citer un seul type, parce qu'elle EST la fourche de
// l'algorithme de `JSON.stringify` sur une valeur objet — il n'y a que trois issues :
//
//   1. l'objet porte un `toJSON` appelable        → c'est SON RÉSULTAT qui est émis ;
//   2. c'est un tableau                            → ses ÉLÉMENTS sont émis ;
//   3. sinon                                       → ses PROPRIÉTÉS PROPRES
//                                                    ÉNUMÉRABLES à clé chaîne.
//
// Le parcours d'avant ne couvrait que 2 et 3. Il couvre désormais 1 en censurant le
// RÉSULTAT de la sérialisation au lieu de l'objet qui la porte — donc `URL`,
// `Buffer`, et tout ce qui n'existe pas encore. Après ce correctif, l'ensemble de ce
// que pino peut émettre est exactement l'ensemble de ce que `parcourir` a examiné.
//
// UN QUATRIÈME CAS, DISTINCT, QUE LA SONDE A CONFONDU AVEC LE PREMIER : le sac
// d'OCTETS BRUTS. A51 range `Buffer` avec `URL`, mais fermer la route 1 ne suffit
// pas pour lui : `Buffer.prototype.toJSON()` rend `{type:'Buffer', data:[112,101,…]}`,
// que la route 3 examine consciencieusement pour n'y trouver AUCUN nom de champ à
// masquer — et les octets repartent en clair, décodables. (Un `Uint8Array` nu, lui,
// fuit directement par la route 3 : `{"0":112,"1":101,…}`.) La politique par NOM DE
// CHAMP est structurellement incapable de qualifier un octet : il n'a ni nom, ni
// forme, ni gabarit. Or à L6c ces octets seront des morceaux de pièces jointes — une
// photo d'atelier, un verbatim audio. On les refuse donc en bloc, en gardant la
// LONGUEUR, qui est le seul diagnostic qu'ils portaient.
// ═══════════════════════════════════════════════════════════════════════════════

type ConstructeurExempte = abstract new (...parametres: never[]) => object;

/**
 * LISTE D'AUTORISÉS — les SEULS objets rendus TELS QUELS, sans examen.
 * Refus par défaut de l'inconnu : tout ce qui n'est pas ici passe par la règle
 * générale ci-dessus. Oublier un autorisé fait crier à tort et se corrige ; oublier
 * un interdit laisse passer une fuite et ne se sait jamais.
 *
 * Ces deux-là étaient déjà exemptés AVANT le correctif, et ils le RESTENT — mais
 * pour deux raisons différentes, qu'il faut écrire pour qu'on ne les élargisse pas
 * par analogie :
 *
 *   · `Date` porte bien un `toJSON`, et c'est un membre de la famille fautive. Il
 *     est exempt parce que sa sérialisation est CLOSE : elle rend un ISO 8601
 *     dérivé du SEUL nombre de millisecondes que porte l'objet. Aucune donnée du
 *     graphe journalisé ne peut y transiter — il n'y a rien à examiner. L'exempter
 *     n'est pas une tolérance, c'est une conséquence. Et l'invariant 5 exige ces
 *     horodatages UTC : les faire passer par l'assainisseur de chaînes les
 *     exposerait à un motif (le numéro de téléphone, notamment) pour zéro gain.
 *
 *   · `RegExp` n'a AUCUN `toJSON` : `JSON.stringify(/x/)` rend `{}`, sa source
 *     n'atteint jamais le journal. Il n'est donc pas exempté de la règle nouvelle —
 *     il ne la rencontre pas. Il est exempté du PARCOURS, qui n'aurait rien à
 *     parcourir (zéro propriété propre énumérable) et rendrait la même référence de
 *     toute façon. C'est un raccourci, pas une dérogation.
 *
 * Ajouter un type ici exige de démontrer LA MÊME CHOSE que pour `Date` : que sa
 * sérialisation est close sur des données non personnelles. « C'est un type
 * standard » n'est pas une démonstration — `URL` en est un.
 */
const SERIALISATIONS_SANS_DONNEE: readonly ConstructeurExempte[] = [Date, RegExp];

/**
 * Boucle et non `.some()` : ce test est sur le chemin chaud (une fois par objet
 * journalisé, piles d'appels comprises) et une fermeture y serait allouée à chaque
 * appel. Même raison que `estLigneDePersonne` ci-dessus.
 */
function estSerialisationSansDonnee(valeur: object): boolean {
  for (const constructeur of SERIALISATIONS_SANS_DONNEE) {
    if (valeur instanceof constructeur) return true;
  }
  return false;
}

/**
 * Vrai si la valeur est un SAC D'OCTETS BRUTS. Prédicat STRUCTUREL, pas énumération :
 * `ArrayBuffer.isView` est la définition même de « vue sur de la mémoire binaire » et
 * couvre `Buffer`, les onze `TypedArray` et `DataView` — y compris ceux qu'une future
 * version de Node ajouterait.
 */
function estOctetsBruts(valeur: object): valeur is ArrayBufferView | ArrayBuffer {
  return ArrayBuffer.isView(valeur) || valeur instanceof ArrayBuffer;
}

/**
 * Vrai si la valeur détourne sa sérialisation par un `toJSON` (propre ou hérité) —
 * la route 1 de `JSON.stringify`. C'est le test que fait le moteur lui-même : on ne
 * devine pas le type, on regarde ce que le moteur regardera.
 */
function aUneSerialisationAlternative(valeur: object): valeur is { toJSON: () => unknown } {
  return typeof (valeur as { toJSON?: unknown }).toJSON === 'function';
}

/**
 * Parcours récursif d'une valeur journalisée. Retourne la MÊME référence quand rien
 * n'a changé : le cas courant (une ligne de journal sans donnée personnelle) ne paie
 * aucune copie.
 *
 * COROLLAIRE DEVENU UNE RÈGLE (§7) : rendre la même référence n'est sûr que si pino
 * sérialisera cette référence par les chemins que ce parcours a inspectés. Tout objet
 * qui détourne sa sérialisation est donc remplacé par une valeur NEUVE — un objet
 * neuf ne porte plus de `toJSON`, donc plus de porte dérobée.
 */
function parcourir(
  valeur: unknown,
  parentNormalise: string,
  profondeur: number,
  vus: WeakSet<object>,
): unknown {
  if (typeof valeur === 'string') return nettoyerTexteJournal(valeur);
  if (!estObjet(valeur)) return valeur;
  // §7 — LISTE D'AUTORISÉS : les deux seuls objets rendus sans examen.
  if (estSerialisationSansDonnee(valeur)) return valeur;
  if (profondeur >= PROFONDEUR_MAX_JOURNAL) return CENSEUR_PROFONDEUR_JOURNAL;
  if (vus.has(valeur)) return '[cycle]';
  vus.add(valeur);

  try {
    // §7 — SAC D'OCTETS BRUTS. Avant le `toJSON`, car `Buffer` porte les deux et
    // sa sérialisation n'est qu'un déguisement du même déversement.
    if (estOctetsBruts(valeur)) return `${CENSEUR_BINAIRE_JOURNAL} ${String(valeur.byteLength)} o`;

    // §7 — SÉRIALISATION ALTERNATIVE. Placé avant le tableau et avant l'erreur parce
    // que c'est l'ordre du moteur : `JSON.stringify` consulte `toJSON` EN PREMIER,
    // y compris sur une sous-classe de `Array` ou d'`Error`. On censure le RÉSULTAT.
    //
    // `vus` contient déjà `valeur` : un `toJSON()` qui se rend lui-même est arrêté
    // par la détection de cycle, et `profondeur + 1` borne les chaînes de renvois.
    //
    // Le moteur passe la CLÉ à `toJSON(cle)` ; on appelle sans argument. Divergence
    // assumée et bornée : aucune sérialisation standard n'en dépend, et la valeur
    // émise sera la NÔTRE, jamais celle qu'un second appel du moteur produirait.
    if (aUneSerialisationAlternative(valeur)) {
      let serialise: unknown;
      try {
        serialise = valeur.toJSON();
      } catch {
        // Une sérialisation qui lève laisse un objet dont on ne sait RIEN. Le rendre
        // tel quel rouvrirait la porte exacte qu'on ferme.
        return CENSEUR_SERIALISATION_JOURNAL;
      }
      return parcourir(serialise, parentNormalise, profondeur + 1, vus);
    }

    if (Array.isArray(valeur)) {
      let modifieTableau = false;
      const copieTableau: unknown[] = new Array<unknown>(valeur.length);
      for (let i = 0; i < valeur.length; i += 1) {
        const element: unknown = valeur[i];
        // Un index de tableau n'est pas un nom de champ : le parent reste celui du
        // tableau, sinon `participants[0].nom` perdrait son contexte `participants`.
        const assaini = parcourir(element, parentNormalise, profondeur + 1, vus);
        if (assaini !== element) modifieTableau = true;
        copieTableau[i] = assaini;
      }
      return modifieTableau ? copieTableau : valeur;
    }

    if (valeur instanceof Error) {
      return {
        type: valeur.name,
        message: nettoyerTexteJournal(valeur.message),
        stack:
          typeof valeur.stack === 'string'
            ? nettoyerPileJournal(valeur.message, valeur.stack)
            : undefined,
      };
    }

    const ligneDePersonne = estLigneDePersonne(valeur);
    const valeurDeConfig = estValeurDeConfig(valeur);
    // ── UNE ERREUR DÉJÀ SÉRIALISÉE PORTE SA PILE COMME UNE CLÉ ORDINAIRE ───────
    // pino appelle son sérialiseur d'erreur AVANT la redaction : ce qui arrive ici
    // n'est donc pas une `Error` mais un objet `{ type, message, stack, … }`, et la
    // branche `instanceof Error` ci-dessus ne le voit jamais. Sans ce cas-ci, `stack`
    // serait nettoyée comme une chaîne quelconque — donc masquée jusqu'à sa fin,
    // trames comprises. On récupère le message VOISIN pour délimiter (A51, F-20).
    const messageVoisin = typeof valeur.message === 'string' ? valeur.message : null;
    let modifie = false;
    const copie: Record<string, unknown> = {};
    for (const [cle, sousValeur] of Object.entries(valeur)) {
      const cleNormalisee = normaliser(cle);
      if (estMasque(cleNormalisee, parentNormalise, ligneDePersonne, valeurDeConfig)) {
        copie[cle] = CENSEUR_JOURNAL;
        modifie = true;
        continue;
      }
      if (cleNormalisee === 'stack' && messageVoisin !== null && typeof sousValeur === 'string') {
        const pile = nettoyerPileJournal(messageVoisin, sousValeur);
        if (pile !== sousValeur) modifie = true;
        copie[cle] = pile;
        continue;
      }
      const assaini = parcourir(sousValeur, cleNormalisee, profondeur + 1, vus);
      if (assaini !== sousValeur) modifie = true;
      copie[cle] = assaini;
    }
    return modifie ? copie : valeur;
  } finally {
    vus.delete(valeur);
  }
}

/**
 * Point d'entrée testable : assainit une valeur journalisée comme le fera pino.
 * @param valeur la valeur à journaliser
 * @param cleRacine nom de la clé racine s'il est connu (pino ne le transmet pas au
 *        joker : voir l'en-tête). Une clé racine sensible masque la valeur entière.
 */
export function assainirJournal(valeur: unknown, cleRacine?: string): unknown {
  if (cleRacine !== undefined) {
    const cleNormalisee = normaliser(cleRacine);
    if (MASQUES_RACINE.has(cleNormalisee) || estMasque(cleNormalisee, '')) return CENSEUR_JOURNAL;
    return parcourir(valeur, cleNormalisee, 1, new WeakSet());
  }
  return parcourir(valeur, '', 0, new WeakSet());
}

/**
 * Censor pino. Il reçoit `(valeur, chemin)` ; `chemin[0]` vaut :
 *   · une CHAÎNE quand le chemin a été déclaré nommément (champs sensibles racine) ;
 *   · un SYMBOL quand c'est le joker `*` — pino ne transmet alors pas le nom de la clé,
 *     d'où la double déclaration dans `CHEMINS_MASQUES_JOURNAL`.
 */
function censurer(valeur: unknown, chemin?: readonly PropertyKey[]): unknown {
  const racine = chemin?.[0];
  return assainirJournal(valeur, typeof racine === 'string' ? racine : undefined);
}

/**
 * Chemins passés à pino.
 * `'*'` : un censor par clé racine ET sur `msg` — c'est lui qui déclenche le parcours.
 * Les noms qui suivent : les mêmes champs sensibles, déclarés pour que le censor
 * reçoive leur NOM quand ils apparaissent à la racine de l'objet journalisé.
 */
export const CHEMINS_MASQUES_JOURNAL: readonly string[] = ['*', ...CHAMPS_MASQUES_RACINE];

/**
 * Options de redaction, prêtes à passer à pino (API et worker, sans divergence).
 *
 * `remove: false` est délibéré : on garde la CLÉ et on remplace la VALEUR. Supprimer
 * la clé ferait disparaître l'information qu'un champ existait — or savoir qu'une
 * réponse a été traitée, sans savoir laquelle, est précisément ce qu'un journal
 * d'exploitation doit permettre.
 */
export const OPTIONS_REDACTION_JOURNAL = {
  paths: [...CHEMINS_MASQUES_JOURNAL],
  censor: censurer,
  remove: false,
} as const;
