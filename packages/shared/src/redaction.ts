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
//      Une URL, un `err.message`, un `msg` : la donnée personnelle y entre par un
//      chemin que la liste de champs ne voit pas (`/v1/users?email=…`, « échec pour
//      jean.dupont@client.fr »). Les masquer en bloc coûterait la route fautive et la
//      cause de l'erreur — le cœur du diagnostic. On les CONSERVE en retirant
//      chirurgicalement e-mails, jetons porteurs, numéros de téléphone et valeurs de
//      paramètres de requête sensibles. Ce nettoyage s'applique à TOUTE chaîne, à
//      toute profondeur : c'est le filet sous la liste de champs.
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
// UN SEUL ENDROIT : l'API et le worker consomment `OPTIONS_REDACTION_JOURNAL` tel quel.
// Ajouter un champ ici le masque PARTOUT. Deux copies d'une politique RGPD divergent
// toujours, et divergent en silence.
//
// -----------------------------------------------------------------------------
// CE QUE CETTE POLITIQUE NE COUVRE PAS — dit ici pour qu'on ne le redécouvre pas
// -----------------------------------------------------------------------------
//   · Un NOM DE PERSONNE en texte libre (« échec pour Jean Dupont ») dans un `msg` ou
//     un champ non listé. Aucune expression régulière ne détecte un nom propre ; 06
//     §10.4 confie cela à une passe NER, qui n'a pas sa place dans un logger. C'est
//     précisément pourquoi les champs de texte libre du modèle sont MASQUÉS et non
//     nettoyés — et pourquoi « pas de donnée métier dans un `msg` » reste une règle de
//     revue croisée, pas une garantie technique.
//   · Une clé RACINE inconnue de la liste : pino appelle le censor du joker clé par
//     clé sans transmettre son nom (voir plus haut). Une donnée personnelle rangée
//     sous une clé racine que le fichier 04 ne nomme pas sortirait en clair si elle
//     n'est ni une chaîne nettoyable, ni sous un champ listé.
//   · Ce qui est journalisé HORS de ces trois instances pino (`console.log`,
//     `process.stdout`, un transport tiers). La redaction est une propriété du logger,
//     pas du processus.
// =============================================================================

/** Marqueur substitué à la valeur masquée. Explicite : on doit voir qu'on masque. */
export const CENSEUR_JOURNAL = '[masqué:rgpd]';

/** Marqueur d'un sous-arbre coupé parce que trop profond (voir PROFONDEUR_MAX_JOURNAL). */
export const CENSEUR_PROFONDEUR_JOURNAL = '[masqué:profondeur]';

/** Marqueur des identités retirées d'une chaîne conservée (URL, message d'erreur). */
export const CENSEUR_TEXTE_JOURNAL = '[masqué]';

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
 * Paramètres de requête dont la VALEUR est personnelle.
 * `code` n'y figure pas volontairement : `?code=CAD-01` est un code de bloc ou de
 * question (04), pas un secret — le masquer coûterait le diagnostic d'un import.
 */
const RX_PARAM_SENSIBLE =
  /\b(email|mail|courriel|person_name|personname|nom|prenom|name|phone|telephone|tel|token|password|mot_de_passe|secret|api_key|apikey|q|search|recherche)=([^&#\s"'<>]*)/gi;

/** Numéro de téléphone français, sous ses formes usuelles. */
const RX_TELEPHONE = /(?:(?:\+|00)33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;

/**
 * Retire les identités d'une chaîne QUE L'ON CONSERVE.
 * C'est le filet sous la liste de champs : il s'applique à toute chaîne journalisée,
 * à toute profondeur, y compris `msg`, `err.message`, `err.stack` et `req.url`.
 * Il ne prétend pas détecter les NOMS DE PERSONNES en texte libre — aucune expression
 * régulière ne le fait (06 §10.4 confie cela à une passe NER, hors d'un journal).
 * C'est la raison pour laquelle les champs de texte libre du modèle, eux, sont MASQUÉS.
 */
export function nettoyerTexteJournal(texte: string): string {
  if (texte.length === 0) return texte;
  let resultat = texte;
  if (resultat.includes('@')) resultat = resultat.replace(RX_EMAIL, CENSEUR_TEXTE_JOURNAL);
  if (resultat.includes(' '))
    resultat = resultat.replace(RX_PORTEUR, `$1 ${CENSEUR_TEXTE_JOURNAL}`);
  if (resultat.includes('=')) {
    resultat = resultat.replace(RX_PARAM_SENSIBLE, `$1=${CENSEUR_TEXTE_JOURNAL}`);
  }
  if (resultat.length >= 10) resultat = resultat.replace(RX_TELEPHONE, CENSEUR_TEXTE_JOURNAL);
  return resultat;
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

/**
 * Parcours récursif d'une valeur journalisée. Retourne la MÊME référence quand rien
 * n'a changé : le cas courant (une ligne de journal sans donnée personnelle) ne paie
 * aucune copie.
 */
function parcourir(
  valeur: unknown,
  parentNormalise: string,
  profondeur: number,
  vus: WeakSet<object>,
): unknown {
  if (typeof valeur === 'string') return nettoyerTexteJournal(valeur);
  if (!estObjet(valeur)) return valeur;
  if (valeur instanceof Date || valeur instanceof RegExp) return valeur;
  if (profondeur >= PROFONDEUR_MAX_JOURNAL) return CENSEUR_PROFONDEUR_JOURNAL;
  if (vus.has(valeur)) return '[cycle]';
  vus.add(valeur);

  try {
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
        stack: typeof valeur.stack === 'string' ? nettoyerTexteJournal(valeur.stack) : undefined,
      };
    }

    const ligneDePersonne = estLigneDePersonne(valeur);
    const valeurDeConfig = estValeurDeConfig(valeur);
    let modifie = false;
    const copie: Record<string, unknown> = {};
    for (const [cle, sousValeur] of Object.entries(valeur)) {
      const cleNormalisee = normaliser(cle);
      if (estMasque(cleNormalisee, parentNormalise, ligneDePersonne, valeurDeConfig)) {
        copie[cle] = CENSEUR_JOURNAL;
        modifie = true;
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
