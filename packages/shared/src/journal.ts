// =============================================================================
// CATALOGUE DU JOURNAL D'ACTIVITÉ — `activity_log`. Lot L2, tâche T4.
//
// Note de conception `docs/conception/LOT_L2.md` §2.4 : « DEUX JOURNAUX, DEUX
// RÉGIMES ». Ce fichier porte le régime de la TABLE, jamais celui de pino.
//
//   ┌──────────────────────┬─────────────────────────┬───────────────────────────┐
//   │                      │ pino (fichiers)         │ `activity_log` (Postgres) │
//   ├──────────────────────┼─────────────────────────┼───────────────────────────┤
//   │ données personnelles │ INTERDITES (11 §2)      │ bornées : `user_id`, `ip` │
//   │ `ip`                 │ masquée (redaction.ts)  │ ÉCRITE (06 §10.4)         │
//   │ rétention            │ rotation de fichiers    │ 12 mois, IP anon. à 90 j  │
//   └──────────────────────┴─────────────────────────┴───────────────────────────┘
//
// LE PIÈGE QUE CE FICHIER EXISTE POUR FERMER. `meta` est du JSONB : il accepte
// TOUT. Un sac libre est exactement le chemin par lequel une identité arrive dans
// une table d'audit huit mois plus tard, écrite de bonne foi « pour aider au
// diagnostic ». La redaction de pino ne protège RIEN ici : elle s'applique à un
// flux de journalisation, pas à un `INSERT`.
//
// ── LES DEUX CEINTURES, ET POURQUOI IL EN FAUT DEUX ──────────────────────────
//  1. `evenementJournalSchema` — union DISCRIMINÉE par action, chaque variante en
//     `strictObject` : une clé non prévue est REFUSÉE, pas ignorée. C'est la
//     fermeture « par action » qu'exige la note §2.4.
//  2. `verifierValeursAtomiques` — un contrôle de FORME sur les valeurs réellement
//     produites, indépendant du schéma. Il existe parce que la ceinture 1 dépend de
//     la vigilance de l'auteur du schéma : le jour où quelqu'un ajoutera un
//     `z.string()` libre à une variante — et ce jour viendra — la ceinture 1 le
//     laissera passer, la ceinture 2 non. Deux garde-fous, deux natures.
//
// ── CE QUE LA CEINTURE 2 NE SAIT PAS FAIRE, ET IL FAUT LE DIRE ───────────────
// Elle reconnaît une FORME. Un e-mail (`@`), un JWT (longueur, casse), un nom
// composé (espace, majuscules, accents) et un montant décimal en français (virgule)
// n'ont pas la forme d'un mot technique : ils sont refusés. Un prénom écrit
// `jeanmartin`, en revanche, a exactement la forme d'un mot technique et PASSE.
// C'est la même doctrine que celle arbitrée le 2026-08-29 sur la redaction pino :
// « on masque ce qui a une forme, jamais ce qui n'en a pas ». La protection contre
// le nom de personne n'est donc PAS ici : elle est dans le fait qu'AUCUNE variante
// du catalogue ne comporte de champ de texte libre. Si une variante en gagne un,
// c'est la revue croisée qui doit la refuser — la machine, elle, ne saura pas.
//
// AUCUNE LOGIQUE D'ACCÈS À LA BASE ICI : ce paquet est importé par la PWA terrain
// et par la console. Ce qui y entre part dans un navigateur.
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention activity_log).
// =============================================================================
import { z } from 'zod';
// Le vocabulaire des statuts vient de la machine à états, jamais d'une seconde
// liste : une action `mission.status_change` qui accepterait un statut absent du
// 03 §32.2 écrirait dans la table d'audit un état que le produit ne connaît pas.
// L'arête est SANS CYCLE À L'EXÉCUTION — `missions.ts` ne prend de ce fichier
// qu'un `import type`, effacé à la compilation.
import { STATUTS_MISSION, TYPES_UNITE_ORG } from './missions.js';
// Même règle pour le vocabulaire de l'arbre : les statuts créables d'une unité
// viennent du contrat de `org_units`, pas d'une liste recopiée. `org-units.ts` ne
// prend RIEN de ce fichier — l'arête ne se referme pas.
import { STATUTS_UNITE_ORG_CREABLES } from './org-units.js';
// Les deux vocabulaires de MOTIFS (arbitrage Williams du 2026-09-02, « motif
// codé »). `motifs.ts` est une FEUILLE : il n'importe rien, donc l'arête ne se
// referme pas — et c'est ce qui permet à la vérification ci-dessous de vivre ICI,
// du côté de la ceinture, avec le motif RÉEL et non une copie.
import { MOTIFS_REAFFECTATION, MOTIFS_RETOUR_ARRIERE } from './motifs.js';

// =============================================================================
// LE VOCABULAIRE ADMISSIBLE — la ceinture 2
// =============================================================================

/**
 * Longueur maximale d'une valeur textuelle du journal. 64 caractères couvrent un
 * UUID (36), un gabarit de route, un code d'énumération — et EXCLUENT un JWT (plus
 * de 100 caractères dès l'en-tête) comme une phrase.
 */
export const LONGUEUR_MAX_VALEUR_JOURNAL = 64;

/**
 * Ce qu'une valeur textuelle du journal a le droit d'être : un mot TECHNIQUE.
 *
 * Lettres, chiffres, `_ . : / -`. Rien d'autre. Ce que ce motif REFUSE, et qui est
 * exactement la liste des choses qu'on ne veut pas voir dans une table d'audit :
 *   · `@`          → toute adresse e-mail ;
 *   · l'espace     → tout nom de personne composé, toute phrase, tout verbatim ;
 *   · `,`          → tout montant décimal écrit à la française (18 500,00) ;
 *   · `+`, `=`, `?`, `&`, `"`, `'` → une URL portant une valeur, un fragment de JSON
 *     recopié, un jeton en base64 « standard » ;
 *   · au-delà de 64 caractères → un JWT, un jeton opaque, un contenu de réponse.
 */
export const MOTIF_VALEUR_JOURNAL = /^[A-Za-z0-9_.:/-]{1,64}$/;

// ─────────────────────────────────────────────────────────────────────────────
// LES MOTIFS CODÉS PASSENT CETTE CEINTURE — VÉRIFIÉ AU CHARGEMENT, PAS ESPÉRÉ.
// ─────────────────────────────────────────────────────────────────────────────
// L'arbitrage du 2026-09-02 (« motif codé ») repose ENTIÈREMENT sur une prémisse :
// « une valeur codée passe la ceinture de redaction par construction ». Un code
// ajouté un jour avec un espace ou un accent ferait tomber `verifierValeursAtomiques`
// et, avec elle, la `meta` ENTIÈRE de la transition (voir `META_REFUSEE`) : la
// trace du §32.2 disparaîtrait au moment précis où elle sert, sans qu'aucun test
// de motif ne rougisse — c'est la famille de défaut que ce dépôt traque.
//
// Trois lignes le rendent impossible. Elles s'exécutent au CHARGEMENT du paquet,
// donc au premier import de n'importe quel test, de l'API ou d'un front ; elles
// utilisent le motif RÉEL, pas une copie qui dériverait ; et elles NOMMENT les
// codes fautifs (ce sont des identifiants techniques, jamais des données).
const CODES_MOTIFS_NON_CONFORMES = [...MOTIFS_RETOUR_ARRIERE, ...MOTIFS_REAFFECTATION].filter(
  (code) => !MOTIF_VALEUR_JOURNAL.test(code),
);
if (CODES_MOTIFS_NON_CONFORMES.length > 0) {
  throw new Error(
    'Motifs codés hors du vocabulaire technique du journal ' +
      `(${String(MOTIF_VALEUR_JOURNAL)}) : ${CODES_MOTIFS_NON_CONFORMES.join(', ')}.`,
  );
}

/** Profondeur maximale d'un `meta`. Au-delà, on ne journalise plus : on stocke. */
const PROFONDEUR_MAX_META = 3;

/** Nombre maximal d'éléments d'un tableau de `meta`. */
const ELEMENTS_MAX_META = 32;

/**
 * Borne des valeurs NUMÉRIQUES admissibles : un entier de |valeur| ≤ 1 000 000.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CETTE BORNE EXISTE CONTRE UNE SEULE CHOSE : LES VALEURS FINANCIÈRES.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La note L2 §2.4 range `total_amount` et `daily_rates` dans le « JAMAIS journalisé » :
 * « on trace la consultation, jamais le montant ». Or un montant est un nombre, et
 * un nombre passait toutes les autres ceintures de forme sans broncher.
 *
 * Un montant de cadrage et un taux journalier ont deux traits qu'un décompte
 * technique n'a pas : ils sont DÉCIMAUX (987654.21 · 1234.56) et souvent GRANDS.
 * Exiger un entier borné les refuse, et ne coûte rien aux seules données numériques
 * du catalogue — `jetonsRevoques` est un petit entier.
 *
 * CE QU'ELLE NE RATTRAPE PAS, ET IL FAUT LE DIRE : un montant en euros ENTIERS
 * inférieur au million (45 000) a exactement la forme d'un décompte et PASSE. La
 * protection contre le montant n'est donc pas ici — elle est dans le fait qu'aucune
 * variante du catalogue ne porte de champ de montant. Cette borne est une SECONDE
 * chance, pas la première.
 */
const VALEUR_NUMERIQUE_MAX = 1_000_000;

/**
 * Décrit ce qui, dans une valeur, n'est PAS une donnée atomique admissible.
 *
 * Rend la liste des chemins fautifs (`meta.champs[2]`), vide si tout va bien. Une
 * LISTE et non un booléen : le journal d'exploitation doit pouvoir dire OÙ, sans
 * jamais dire QUOI — voir `service.ts` côté API, qui ne recopie jamais la valeur.
 *
 * Admis : `null`, booléen, ENTIER borné (voir `VALEUR_NUMERIQUE_MAX`), chaîne conforme
 * à `MOTIF_VALEUR_JOURNAL`, tableau et objet simple dont TOUS les descendants le sont.
 * Refusé, et délibérément : `undefined` (indistinguable d'une clé oubliée une fois
 * sérialisé en JSONB), `Date` (une date se journalise en ISO, pas en objet),
 * `bigint`, fonction, symbole, et toute instance de classe.
 */
export function verifierValeursAtomiques(valeur: unknown, chemin = 'meta'): readonly string[] {
  return collecterViolations(valeur, chemin, 0);
}

function collecterViolations(valeur: unknown, chemin: string, profondeur: number): string[] {
  if (profondeur > PROFONDEUR_MAX_META)
    return [`${chemin} (profondeur > ${String(PROFONDEUR_MAX_META)})`];

  if (valeur === null) return [];
  if (typeof valeur === 'boolean') return [];
  if (typeof valeur === 'number') {
    if (!Number.isInteger(valeur)) return [`${chemin} (nombre non entier — montant ?)`];
    return Math.abs(valeur) <= VALEUR_NUMERIQUE_MAX
      ? []
      : [`${chemin} (entier hors borne ±${String(VALEUR_NUMERIQUE_MAX)})`];
  }

  if (typeof valeur === 'string') {
    return MOTIF_VALEUR_JOURNAL.test(valeur) ? [] : [`${chemin} (hors vocabulaire technique)`];
  }

  if (Array.isArray(valeur)) {
    if (valeur.length > ELEMENTS_MAX_META)
      return [`${chemin} (> ${String(ELEMENTS_MAX_META)} éléments)`];
    return valeur.flatMap((element, index) =>
      collecterViolations(element, `${chemin}[${String(index)}]`, profondeur + 1),
    );
  }

  // Objet SIMPLE uniquement : un objet dont le prototype n'est ni `Object.prototype`
  // ni `null` est une instance de classe (`Date`, `Error`, `URL`…). Sa sérialisation
  // JSONB est imprévisible, et c'est par là qu'un `err` complet entrerait en base.
  if (typeof valeur === 'object') {
    const prototype: unknown = Object.getPrototypeOf(valeur);
    if (prototype !== Object.prototype && prototype !== null) {
      return [`${chemin} (objet non simple)`];
    }
    return Object.entries(valeur).flatMap(([cle, sousValeur]) => {
      const cheminFils = `${chemin}.${cle}`;
      const violationsDeLaCle = MOTIF_VALEUR_JOURNAL.test(cle)
        ? []
        : [`${cheminFils} (clé hors vocabulaire technique)`];
      return [...violationsDeLaCle, ...collecterViolations(sousValeur, cheminFils, profondeur + 1)];
    });
  }

  return [`${chemin} (type ${typeof valeur} non journalisable)`];
}

// =============================================================================
// LES ACTIONS — un catalogue FERMÉ (note L2 §2.4)
// =============================================================================

/**
 * Les actions journalisées au lot L2, et elles seules.
 *
 * `auth.*` est livré et câblé par T4 · `user.*` par T3 · `rbac.refus` et
 * `financier.consultation` par T5. Le CATALOGUE est unique et vit ici : c'est ce
 * qui permet au balayage de pureté (plan de tests L2 §5) d'énumérer ce qui EXISTE
 * plutôt que ce à quoi on a pensé.
 *
 * Ce qui n'y est PAS, et c'est un choix documenté par la note §2.4 : les rotations
 * de routine (~96/j/appareil — elles noieraient la table sans rien prouver ; seule
 * l'ANOMALIE mérite une ligne), les mots de passe, empreintes et jetons, les
 * e-mails, `person_name`, contenus de réponse et de note, et **les valeurs
 * financières** — on trace QUI a vu l'argent, jamais COMBIEN.
 */
export const ACTIONS_JOURNAL = [
  'auth.login.ok',
  'auth.login.echec',
  'auth.reuse_detected',
  'auth.logout',
  'user.create',
  'user.update',
  'user.role_change',
  'user.deactivate',
  'user.habilitate',
  'user.password_reset',
  'rbac.refus',
  'financier.consultation',
  // ── companies (lot L3, incrément L3a) ──────────────────────────────────────
  // DEUX actions, et deux seulement.
  //   · pas de `company.read` : le catalogue ne trace aucune consultation
  //     ordinaire — une liste se rafraîchit à chaque ouverture d'écran et noierait
  //     la table. La seule consultation tracée du produit reste
  //     `financier.consultation`, parce que 06 §10.5 l'exige nommément ;
  //   · pas de `company.delete` : aucune route de ce lot n'écrit
  //     `companies.deleted_at`, et le catalogue ne nomme que ce qui existe.
  'company.create',
  'company.update',
  // ── missions (lot L3, incrément L3b) ───────────────────────────────────────
  // TROIS actions, et la troisième est une EXIGENCE du pack, pas un confort :
  // 03 §32.2 écrit que les retours arrière sont « tracés `activity_log` ». Sans
  // `mission.status_change` au catalogue, la porte d'écriture du journal (fermée
  // par construction) refuserait l'événement et la trace n'existerait pas.
  //   · pas de `mission.read` : même raison que `company.read` ;
  //   · pas de `mission.delete` : aucune route de ce lot n'écrit
  //     `missions.deleted_at`, et le catalogue ne nomme que ce qui existe.
  'mission.create',
  'mission.update',
  'mission.status_change',
  // ── org_units (lot L3, incrément L3c) ──────────────────────────────────────
  // CINQ actions. Les deux dernières sont les gestes de qualification du 03 §25.3,
  // et elles sont séparées de `org_unit.update` pour la même raison que
  // `mission.status_change` est séparée de `mission.update` : un changement d'ÉTAT
  // n'est pas une modification de champ, et une trace qui dirait « le statut a
  // changé » sans dire en quoi ne serait pas une trace.
  //   · pas de `org_unit.read` : le catalogue ne trace aucune consultation
  //     ordinaire (même raison que `company.read`) ;
  //   · pas de `org_unit.delete` : **aucune route ne supprime une unité**, et
  //     `org_units` n'a même pas de `deleted_at` au fichier 04. Une fusion
  //     CONSERVE la ligne source (invariant 7) ;
  //   · `org_unit.import` porte sur la MISSION, pas sur une unité : un import en
  //     crée n cent, et écrire n cent lignes de journal pour un seul acte
  //     noierait la table sans rien apprendre de plus.
  'org_unit.create',
  'org_unit.update',
  'org_unit.import',
  'org_unit.validate',
  'org_unit.merge',
  // ── questionnaire et sessions (lot L3, incrément L3d) ──────────────────────
  // DEUX actions, et chacune est une EXIGENCE, pas un confort :
  //   · `mission.questionnaire_freeze` — le refus d'un second figeage doit porter
  //     « le compte ET la date » (`DECISIONS.md` 2026-08-29), or `mission_questions`
  //     n'a AUCUNE colonne de date au fichier 04. La date du figeage n'existe donc
  //     que dans cette ligne de journal. L'entrée du 2026-09-02 le constate en
  //     toutes lettres : « ma décision de la veille supposait que le journal traçait
  //     déjà le figeage — la prémisse était fausse ». Elle devient vraie ici ;
  //   · `interview.reassign` — 03 §34.4 écrit que la réaffectation est tracée dans
  //     `activity_log`. Sans cette action au catalogue, la porte d'écriture (fermée
  //     par construction) refuserait l'événement et la trace n'existerait pas.
  // Et ce qui n'y est PAS : aucune action de PRÉVISUALISATION du questionnaire ni
  // de génération du PLAN d'entretiens. Les deux sont des lectures, et le catalogue
  // ne trace aucune consultation hors du financier (06 §10.5) ; surtout, le plan
  // recopie des noms d'unités et des effectifs du client, que la table d'audit
  // garantit de ne pas contenir (11 §2). Aucune action d'AFFECTATION non plus
  // (`work_assignments`) : aucune section du pack ne l'exige, et une action sans
  // appelant ni exigence est du code mort.
  'mission.questionnaire_freeze',
  'interview.reassign',
] as const;

export type ActionJournal = (typeof ACTIONS_JOURNAL)[number];

/**
 * Valeurs d'`entity_type`. L'index `activity_log(entity_type, entity_id)` (04 §7.1)
 * n'a de sens que si le vocabulaire est fermé : deux orthographes pour la même
 * entité rendraient toute recherche d'audit incomplète — et une recherche d'audit
 * incomplète ne se voit pas, elle rend simplement moins de lignes.
 */
export const ENTITES_JOURNAL = [
  'user',
  'scoping_estimate',
  'company',
  'mission',
  'org_unit',
  // Lot L3d : la réaffectation §34.4 porte sur la SESSION, pas sur la mission —
  // une recherche d'audit part de la session dont on conteste le changement de
  // main, et l'index `activity_log(entity_type, entity_id)` la sert directement.
  'interview',
] as const;
export type EntiteJournal = (typeof ENTITES_JOURNAL)[number];

/**
 * Les rôles de `users.role` (04 : `CHECK IN ('admin','consultant','analyste',
 * 'lecteur')`).
 *
 * ⚠ RECOPIE ASSUMÉE. `apps/api/src/db/schema.ts` porte la même liste, et c'est un
 * doublon : `packages/shared` ne peut pas importer le schéma Drizzle de l'API (il
 * part dans un navigateur), et l'API ne peut pas être la source d'un contrat
 * partagé. La consolidation — un `roleUtilisateurSchema` unique dans `shared`, dont
 * le schéma Drizzle dériverait — touche un fichier du lot L1 et le contrat d'API :
 * elle est PROPOSÉE, pas faite ici. Le garde-fou en attendant : la divergence ferait
 * échouer la validation d'une ligne `user.role_change`, donc perdre une ligne
 * d'audit — pas planter une route. C'est un défaut SILENCIEUX, et c'est pour ça
 * qu'il est écrit ici plutôt que sous-entendu.
 */
export const ROLES_JOURNALISABLES = ['admin', 'consultant', 'analyste', 'lecteur'] as const;

/** Pourquoi une connexion a été refusée. JAMAIS l'adresse tentée (note §2.4). */
export const RAISONS_ECHEC_CONNEXION = [
  /** Aucun compte ne porte cette adresse. `utilisateurId` est nul : pas de trace sur une non-personne. */
  'compte_inconnu',
  'mot_de_passe_invalide',
  'compte_desactive',
] as const;

/** Champs d'un compte modifiables par `user.update` — le NOM du champ, pas sa valeur. */
export const CHAMPS_UTILISATEUR_JOURNALISABLES = [
  'name',
  'email',
  'usage_profile',
  'is_active',
  'password_hash',
] as const;

/**
 * Champs d'une fiche client modifiables par `company.update` — le NOM du champ,
 * jamais sa valeur.
 *
 * ⚠ CETTE LISTE EST EN `snake_case` PARCE QU'ELLE NOMME DES COLONNES, pas des
 * propriétés TypeScript : c'est ce que `CHAMPS_UTILISATEUR_JOURNALISABLES` fait
 * déjà, et c'est ce qui rend une ligne d'audit relisible par un `psql` huit mois
 * plus tard, sans traduction mentale.
 *
 * `siren` y figure — le NOM du champ, jamais le numéro. Un SIREN est une donnée
 * IDENTIFIANTE du client : le journaliser reviendrait à recopier une cellule du
 * dossier client dans une table d'audit, exactement ce que la décision du
 * 2026-08-29 refuse pour le rapport d'import CSV.
 */
export const CHAMPS_ENTREPRISE_JOURNALISABLES = [
  'name',
  'siren',
  'naf_code',
  'sector_id',
  'external_ref',
  'headcount',
  'sites_count',
  'countries',
  'notes',
] as const;

/**
 * Champs d'une mission modifiables par `mission.update` — le NOM de la colonne,
 * jamais sa valeur. En `snake_case`, comme les deux listes ci-dessus, et pour la
 * même raison : une ligne d'audit doit se relire dans un `psql` sans traduction.
 *
 * ⚠ **`status` N'Y FIGURE PAS, ET C'EST STRUCTUREL.** Le statut ne se modifie pas
 * par `PATCH` (`updateMissionRequestSchema` refuse la clé) : il a sa propre action,
 * `mission.status_change`, qui dit d'OÙ l'on venait et où l'on va. L'admettre ici
 * rendrait exprimable une ligne d'audit disant « le statut a changé » sans dire en
 * quoi — c'est-à-dire précisément la trace que le §32.2 refuse.
 * `company_id` n'y figure pas non plus : aucune route ne le modifie après coup.
 */
export const CHAMPS_MISSION_JOURNALISABLES = [
  'title',
  'parent_mission_id',
  'geo_scope',
  'country_code',
  'size_tier_id',
  'active_sectors',
  'active_blocks',
  'audit_level',
  'commercial_offer',
  'timezone',
  'nda_ref',
  'nda_signed_at',
  'llm_provider',
  'start_planned',
  'end_planned',
] as const;

/**
 * Champs d'une unité d'arbre modifiables par `org_unit.update` — le NOM de la
 * colonne, jamais sa valeur. En `snake_case`, comme les trois listes ci-dessus.
 *
 * ⚠ **`status` ET `merged_into_id` N'Y FIGURENT PAS**, pour la raison exacte qui
 * exclut `status` de `CHAMPS_MISSION_JOURNALISABLES` : les deux transitions d'état
 * d'une unité (03 §25.3) ont leurs propres actions, `org_unit.validate` et
 * `org_unit.merge`, qui disent d'où l'on vient et où l'on va. Les admettre ici
 * rendrait exprimable une ligne d'audit muette sur le seul point qui compte.
 * `mission_id` n'y figure pas non plus : une unité ne change jamais de mission.
 *
 * ⚠ **`name` EST LE NOM DU CHAMP, JAMAIS SA VALEUR.** Un nom d'unité est une
 * donnée du client : le journaliser reviendrait à recopier une cellule du dossier
 * client dans une table d'audit, ce que la décision du 2026-08-29 refuse déjà pour
 * le rapport d'import.
 */
export const CHAMPS_UNITE_JOURNALISABLES = [
  'name',
  'kind',
  'parent_id',
  'country_code',
  'timezone',
  'headcount',
  'service_ref_id',
  'sector_id',
  'in_scope',
  'position',
] as const;

/** Pourquoi le crochet d'autorisation a refusé (note §2.4 : routes admin et financières). */
export const MOTIFS_REFUS_RBAC = ['role_insuffisant', 'non_authentifie', 'non_habilite'] as const;

// =============================================================================
// LES ÉVÉNEMENTS — une variante par action, chacune FERMÉE
// =============================================================================

/**
 * Identifiant d'utilisateur. `z.uuid()` et non `z.string()` : la colonne
 * `activity_log.user_id` est un `UUID` avec une FK vers `users` — une chaîne libre
 * y échouerait à l'insertion, c'est-à-dire au pire endroit possible (après la
 * décision métier, dans le chemin d'erreur).
 */
const idUtilisateur = z.uuid();

/**
 * L'union. `strictObject` sur CHAQUE variante : une clé non déclarée est refusée.
 *
 * Un `z.object()` ordinaire se contente de l'IGNORER — et une clé ignorée est
 * exactement le mode de défaillance qu'on veut éviter : l'appelant croit journaliser
 * un champ, la table ne le porte pas, personne ne s'en aperçoit avant l'audit.
 */
export const evenementJournalSchema = z.discriminatedUnion('action', [
  // ── auth (câblé par T4) ────────────────────────────────────────────────────
  z.strictObject({
    action: z.literal('auth.login.ok'),
    utilisateurId: idUtilisateur,
  }),
  z.strictObject({
    action: z.literal('auth.login.echec'),
    /**
     * NUL quand aucun compte ne porte l'adresse tentée. La note §2.4 interdit de
     * journaliser l'adresse ; l'absence d'identifiant est la conséquence directe.
     * Renseigné quand le compte EXISTE : c'est ce qui rend le bourrage
     * d'identifiants contre un compte réel visible à l'audit. La table étant
     * réservée aux administrateurs (§34.1), elle n'est un oracle pour personne.
     */
    utilisateurId: idUtilisateur.nullable(),
    raison: z.enum(RAISONS_ECHEC_CONNEXION),
  }),
  z.strictObject({
    action: z.literal('auth.reuse_detected'),
    utilisateurId: idUtilisateur,
    /** Taille de la famille révoquée. Un décompte, jamais une empreinte. */
    jetonsRevoques: z.number().int().min(0),
  }),
  z.strictObject({
    action: z.literal('auth.logout'),
    utilisateurId: idUtilisateur,
  }),

  // ── users (câblé par T3 — le catalogue est livré ici, pas les appels) ───────
  z.strictObject({
    action: z.literal('user.create'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
    role: z.enum(ROLES_JOURNALISABLES),
  }),
  z.strictObject({
    action: z.literal('user.update'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
    /** Les NOMS des champs touchés. Jamais l'avant, jamais l'après. */
    champs: z.array(z.enum(CHAMPS_UTILISATEUR_JOURNALISABLES)).min(1),
  }),
  z.strictObject({
    action: z.literal('user.role_change'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
    roleAvant: z.enum(ROLES_JOURNALISABLES),
    roleApres: z.enum(ROLES_JOURNALISABLES),
  }),
  z.strictObject({
    action: z.literal('user.deactivate'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
  }),
  z.strictObject({
    action: z.literal('user.habilitate'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
  }),
  z.strictObject({
    action: z.literal('user.password_reset'),
    utilisateurId: idUtilisateur,
    cibleId: idUtilisateur,
    /**
     * `true` quand le garde-fou §9.7 (outbox non vide, ou aucune sync connue) a été
     * OUTREPASSÉ. La note §2.4 exige journalisation ET alerte : cette ligne est la
     * moitié « journalisation ». L'alerte appartient à T3.
     */
    forcage: z.boolean(),
  }),

  // ── RBAC et financier (câblé par T5) ───────────────────────────────────────
  z.strictObject({
    action: z.literal('rbac.refus'),
    utilisateurId: idUtilisateur.nullable(),
    methode: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    /**
     * Le GABARIT de la route (`/v1/scoping/:id/financials`), JAMAIS `request.url`.
     * Une URL réelle porte des valeurs — un identifiant de mission aujourd'hui, un
     * filtre par adresse e-mail demain. Un gabarit ne porte que des noms de
     * paramètres : il est, par construction, sans donnée.
     */
    gabaritRoute: z.string().regex(MOTIF_VALEUR_JOURNAL),
    motif: z.enum(MOTIFS_REFUS_RBAC),
  }),
  z.strictObject({
    action: z.literal('financier.consultation'),
    /** L'ADMINISTRATEUR qui consulte — « qui a vu l'argent » (06 §10.5). */
    utilisateurId: idUtilisateur,
    cadrageId: z.uuid(),
    // Aucun montant, aucun taux journalier. Jamais. Voir la note §2.4.
  }),

  // ── companies (câblé par L3a) ──────────────────────────────────────────────
  z.strictObject({
    action: z.literal('company.create'),
    utilisateurId: idUtilisateur,
    entrepriseId: z.uuid(),
    /**
     * `true` si la fiche naît AVEC un SIREN. Un BOOLÉEN, jamais le numéro : la
     * question à laquelle le journal doit répondre est « cette fiche a-t-elle été
     * créée sans clé de rapprochement ? » (R3), pas « quel est son SIREN ? ». Le
     * numéro appartient à la fiche ; la table d'audit n'a aucune raison d'en tenir
     * une seconde copie, avec une rétention et un régime d'accès différents.
     */
    avecSiren: z.boolean(),
    /**
     * `true` quand la création a levé l'alerte de doublon de nom (R3, « nom en
     * second »). C'est la moitié « création tracée » de la note de conception L3
     * §3d : sans elle, rien ne distinguerait a posteriori une fiche créée en toute
     * connaissance d'un homonyme d'une fiche créée dans l'ignorance.
     */
    doublonNomSignale: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('company.update'),
    utilisateurId: idUtilisateur,
    entrepriseId: z.uuid(),
    /** Les NOMS des colonnes touchées. Jamais l'avant, jamais l'après. */
    champs: z.array(z.enum(CHAMPS_ENTREPRISE_JOURNALISABLES)).min(1),
  }),

  // ── missions (lot L3, incrément L3b) ───────────────────────────────────────
  z.strictObject({
    action: z.literal('mission.create'),
    utilisateurId: idUtilisateur,
    missionId: z.uuid(),
    /** L'entreprise auditée — un identifiant, jamais son nom ni son SIREN. */
    entrepriseId: z.uuid(),
    /**
     * L'unité racine a-t-elle été créée d'office (03 §16.2) ? Toujours `true`
     * aujourd'hui ; le booléen existe pour que le jour où une création SANS racine
     * deviendra possible, les lignes d'avant restent lisibles sans deviner.
     */
    avecRacine: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('mission.update'),
    utilisateurId: idUtilisateur,
    missionId: z.uuid(),
    /** Les NOMS des colonnes touchées. Jamais l'avant, jamais l'après. */
    champs: z.array(z.enum(CHAMPS_MISSION_JOURNALISABLES)).min(1),
  }),
  z.strictObject({
    action: z.literal('mission.status_change'),
    utilisateurId: idUtilisateur,
    missionId: z.uuid(),
    /**
     * D'OÙ et VERS OÙ. Les deux, toujours : « le statut a changé » n'est pas une
     * trace, et le §32.2 exige que les retours arrière soient tracés — donc
     * reconnaissables comme tels à la relecture, ce que `sens` rend explicite.
     */
    statutAvant: z.enum(STATUTS_MISSION),
    statutApres: z.enum(STATUTS_MISSION),
    sens: z.enum(['avant', 'retour']),
    /** Une dérogation §17.3 a-t-elle RÉELLEMENT porté la décision ? */
    surcharge: z.boolean(),
    /**
     * ⚠ **LE MOTIF LUI-MÊME, EN CODE** — arbitrage Williams du 2026-09-02, « le
     * motif d'un retour arrière est un CODE, pas un texte ». Ce champ portait un
     * BOOLÉEN (`avecMotif`) tant que le texte libre n'avait aucun endroit où se
     * poser : la ceinture 2 de ce fichier n'accepte que du vocabulaire technique,
     * et une phrase française aurait fait écarter la `meta` entière (voir
     * `META_REFUSEE`). Un code de `MOTIFS_RETOUR_ARRIERE` la passe par
     * construction — vérifié au chargement, plus haut dans ce fichier.
     *
     * **OPTIONNEL, et c'est la lecture exacte de `TRANSITIONS_MISSION`** : les
     * quatre progressions du §32.2 n'exigent aucun motif. `undefined` ici veut donc
     * dire « aucun motif n'était exigé, aucun n'a été donné » ; la projection
     * l'écrit `null`, pour que la forme de `meta` reste la même sur les sept
     * transitions et qu'un `GROUP BY` n'ait pas à distinguer clé absente et clé
     * nulle. Il n'existe AUCUN cas où un motif est exigé et absent : la transition
     * est alors refusée en 409, et rien n'est journalisé.
     */
    motif: z.enum(MOTIFS_RETOUR_ARRIERE).optional(),
  }),

  // ── org_units (lot L3, incrément L3c) ──────────────────────────────────────
  z.strictObject({
    action: z.literal('org_unit.create'),
    utilisateurId: idUtilisateur,
    uniteId: z.uuid(),
    missionId: z.uuid(),
    /**
     * Le TYPE de l'unité (`groupe`, `service`, `poste`…) : un code d'énumération,
     * pas une donnée du client. C'est ce qui permet de relire une mission et de
     * voir la forme de l'arbre qu'on lui a construit, sans jamais lire un nom.
     */
    kind: z.enum(TYPES_UNITE_ORG),
    /** L'unité naît-elle comme PROPOSITION (§25.3) ou comme unité du siège ? */
    statut: z.enum(STATUTS_UNITE_ORG_CREABLES),
    /**
     * L'identifiant venait-il du CLIENT (UUID v7, règle P1-4 du 04) ou a-t-il été
     * frappé par le serveur ? La question se pose le jour où deux appareils
     * revendiquent la même unité ; sans ce booléen, elle est indécidable.
     */
    idFourniParLAppelant: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('org_unit.update'),
    utilisateurId: idUtilisateur,
    uniteId: z.uuid(),
    /** Les NOMS des colonnes touchées. Jamais l'avant, jamais l'après. */
    champs: z.array(z.enum(CHAMPS_UNITE_JOURNALISABLES)).min(1),
  }),
  z.strictObject({
    action: z.literal('org_unit.import'),
    utilisateurId: idUtilisateur,
    /** L'import porte sur la MISSION : il crée n unités d'un seul geste. */
    missionId: z.uuid(),
    /** Combien d'unités l'arbre a reçues. Un décompte, jamais un contenu. */
    unitesCreees: z.number().int().min(0),
    /**
     * ⚠ **LE RAPPORT D'ERREURS N'EST JAMAIS JOURNALISÉ**, et cette variante n'a
     * aucun champ pour l'accueillir (`DECISIONS.md` du 2026-08-29) : il recopie des
     * cellules du fichier client — noms d'unités, effectifs — et la table d'audit
     * garantit de n'en contenir aucune. Un import REJETÉ ne produit d'ailleurs
     * aucune ligne du tout : il n'a rien changé.
     */
  }),
  z.strictObject({
    action: z.literal('org_unit.validate'),
    utilisateurId: idUtilisateur,
    uniteId: z.uuid(),
    missionId: z.uuid(),
  }),
  z.strictObject({
    action: z.literal('org_unit.merge'),
    utilisateurId: idUtilisateur,
    /** La SOURCE — celle qui passe en `fusionnee` et qui SURVIT (invariant 7). */
    uniteId: z.uuid(),
    missionId: z.uuid(),
    /** La CIBLE, `org_units.merged_into_id`. */
    cibleId: z.uuid(),
    /**
     * Les deux décomptes de ce que la fusion a DÉPLACÉ.
     *
     * `docs/conception/LOT_L3.md` §3e demande une entrée portant
     * `{interviewIds, avant, apres, motif}`. Les IDENTIFIANTS d'entretiens n'y
     * entrent PAS : la ceinture 2 de ce fichier plafonne un tableau à 32 éléments,
     * et une fusion peut en déplacer davantage — le journal perdrait alors sa
     * `meta` ENTIÈRE (voir `META_REFUSEE`), donc aussi la cible et les décomptes.
     * On garde ce qui répond à la question d'audit (« combien de données ont
     * changé de rattachement ? ») ; le DÉTAIL reste lisible en base par
     * `interviews.org_unit_id`, qui pointe désormais la cible, et par
     * `org_units.merged_into_id`, qui dit d'où elles viennent. **L'ancien
     * rattachement reste donc lisible par deux chemins indépendants.**
     */
    entretiensReattaches: z.number().int().min(0),
    enfantsReattaches: z.number().int().min(0),
    /**
     * ⚠ **UN BOOLÉEN, PAS LE MOTIF** — même limite, même raison, et même remontée
     * que `mission.status_change` : `verifierValeursAtomiques` n'accepte que du
     * vocabulaire technique, une phrase française y ferait écarter la `meta`
     * entière. Le texte du motif n'a aujourd'hui aucun endroit où se poser.
     */
    avecMotif: z.boolean(),
  }),

  // ── questionnaire et sessions (lot L3, incrément L3d) ──────────────────────
  z.strictObject({
    action: z.literal('mission.questionnaire_freeze'),
    utilisateurId: idUtilisateur,
    missionId: z.uuid(),
    /**
     * COMBIEN de questions ont été figées. Un décompte, jamais un contenu — ni les
     * textes, ni les codes, ni les blocs : le questionnaire figé est lisible dans
     * `mission_questions`, et la table d'audit n'a aucune raison d'en tenir une
     * seconde copie sous un autre régime d'accès.
     *
     * ⚠ **C'EST LA DATE DE CETTE LIGNE QUI FAIT FOI** pour le refus d'un second
     * figeage (`activity_log.created_at`) : `mission_questions` n'a aucune colonne
     * de date au fichier 04, et en ajouter une serait la signature de Williams.
     */
    questionsFigees: z.number().int().min(1),
  }),
  z.strictObject({
    action: z.literal('interview.reassign'),
    /** L'admin ou le lead qui réaffecte — jamais la personne rencontrée. */
    utilisateurId: idUtilisateur,
    interviewId: z.uuid(),
    missionId: z.uuid(),
    /**
     * D'OÙ et VERS OÙ, en IDENTIFIANTS. Les deux, toujours : « les sessions
     * réalisées restent à leur auteur » (§34.4) n'a de sens vérifiable que si l'on
     * sait qui était l'auteur avant. Aucun nom, aucune adresse — ni de l'auditeur,
     * ni de la personne rencontrée (11 §2).
     *
     * ⚠ **`auditeurAvant` EST NULLABLE depuis l'amendement du 2026-09-02** :
     * `interviews.conducted_by` accepte NULL pour une session PLANIFIÉE sans
     * auditeur (plan §32.4), et `reassign` est la porte qui en pose un — la ligne
     * de journal dit alors « personne → quelqu'un », ce qui est une PREMIÈRE
     * AFFECTATION et non un changement de mains. La distinction se lit dans la
     * table d'audit sans rien deviner, ce qui est le seul but de ce champ.
     * `null` traverse la ceinture 2 (`verifierValeursAtomiques` l'admet
     * explicitement) ; `auditeurApres`, lui, ne peut PAS être nul : on ne réaffecte
     * pas une session à personne.
     */
    auditeurAvant: idUtilisateur.nullable(),
    auditeurApres: idUtilisateur,
    /**
     * ⚠ **LE MOTIF LUI-MÊME, EN CODE** — même arbitrage que
     * `mission.status_change` (Williams, 2026-09-02 : « motif codé »), appliqué au
     * §34.4 qui exige un motif à la réaffectation et sa trace `activity_log`.
     *
     * **OBLIGATOIRE ici**, contrairement au motif de transition : le §34.4 n'a pas
     * de cas « réaffectation sans motif », et le schéma de requête le refuse en
     * 400 avant d'atteindre le service. Une ligne `interview.reassign` sans motif
     * n'est donc pas seulement improbable : elle est inexprimable.
     */
    motif: z.enum(MOTIFS_REAFFECTATION),
  }),
]);

export type EvenementJournal = z.infer<typeof evenementJournalSchema>;

// =============================================================================
// LA LIGNE — projection de l'événement sur les colonnes du fichier 04
// =============================================================================

/**
 * Les colonnes d'`activity_log` qu'un appelant peut renseigner, en `camelCase`
 * (11 §3). `id`, `createdAt` et `ip` n'en font PAS partie : les deux premiers
 * appartiennent au dépôt, la troisième au contexte de la requête. Un appelant qui
 * pourrait choisir son horodatage pourrait antidater une trace d'audit.
 */
export interface ContenuLigneJournal {
  readonly action: ActionJournal;
  readonly utilisateurId: string | null;
  readonly entityType: EntiteJournal | null;
  readonly entityId: string | null;
  readonly meta: Readonly<Record<string, unknown>> | null;
}

/**
 * Projette un événement validé sur les colonnes. Fonction PURE et TOTALE : le
 * `switch` est exhaustif (`noImplicitReturns` + `switch-exhaustiveness-check`),
 * donc ajouter une variante à l'union sans la projeter NE COMPILE PAS.
 *
 * C'est ici que se décide ce qui va dans `entity_*` plutôt que dans `meta` : les
 * actions `user.*` portent DEUX personnes — l'administrateur qui agit (`user_id`)
 * et le compte touché (`entity_id`). Les confondre rendrait le journal illisible
 * le jour où il sert vraiment, c'est-à-dire quand quelqu'un conteste une action.
 */
export function versLigneJournal(evenement: EvenementJournal): ContenuLigneJournal {
  switch (evenement.action) {
    case 'auth.login.ok':
    case 'auth.logout':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: null,
        entityId: null,
        meta: null,
      };

    case 'auth.login.echec':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: null,
        entityId: null,
        meta: { raison: evenement.raison },
      };

    case 'auth.reuse_detected':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: null,
        entityId: null,
        meta: { jetons_revoques: evenement.jetonsRevoques },
      };

    case 'user.create':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'user',
        entityId: evenement.cibleId,
        meta: { role: evenement.role },
      };

    case 'user.update':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'user',
        entityId: evenement.cibleId,
        meta: { champs: [...evenement.champs] },
      };

    case 'user.role_change':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'user',
        entityId: evenement.cibleId,
        meta: { role_avant: evenement.roleAvant, role_apres: evenement.roleApres },
      };

    case 'user.deactivate':
    case 'user.habilitate':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'user',
        entityId: evenement.cibleId,
        meta: null,
      };

    case 'user.password_reset':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'user',
        entityId: evenement.cibleId,
        meta: { forcage: evenement.forcage },
      };

    case 'rbac.refus':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: null,
        entityId: null,
        meta: {
          methode: evenement.methode,
          gabarit_route: evenement.gabaritRoute,
          motif: evenement.motif,
        },
      };

    case 'financier.consultation':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'scoping_estimate',
        entityId: evenement.cadrageId,
        meta: null,
      };

    case 'company.create':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'company',
        entityId: evenement.entrepriseId,
        meta: {
          avec_siren: evenement.avecSiren,
          doublon_nom_signale: evenement.doublonNomSignale,
        },
      };

    case 'company.update':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'company',
        entityId: evenement.entrepriseId,
        meta: { champs: [...evenement.champs] },
      };

    case 'mission.create':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'mission',
        entityId: evenement.missionId,
        meta: { entreprise_id: evenement.entrepriseId, avec_racine: evenement.avecRacine },
      };

    case 'mission.update':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'mission',
        entityId: evenement.missionId,
        meta: { champs: [...evenement.champs] },
      };

    case 'mission.status_change':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'mission',
        entityId: evenement.missionId,
        meta: {
          statut_avant: evenement.statutAvant,
          statut_apres: evenement.statutApres,
          sens: evenement.sens,
          surcharge: evenement.surcharge,
          // `?? null` plutôt qu'une clé omise : `meta` garde la MÊME forme sur les
          // sept transitions, et « aucun motif n'était exigé » se lit sans deviner
          // si la clé manque parce qu'il n'y en avait pas ou parce qu'un appelant
          // l'a oubliée. La ceinture 2 admet `null` explicitement.
          motif: evenement.motif ?? null,
        },
      };

    case 'org_unit.create':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'org_unit',
        entityId: evenement.uniteId,
        meta: {
          mission_id: evenement.missionId,
          kind: evenement.kind,
          statut: evenement.statut,
          id_fourni: evenement.idFourniParLAppelant,
        },
      };

    case 'org_unit.update':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'org_unit',
        entityId: evenement.uniteId,
        meta: { champs: [...evenement.champs] },
      };

    // L'IMPORT PORTE SUR LA MISSION, et son `entity_type` le dit : c'est la seule
    // action `org_unit.*` dont la cible n'est pas une unité. Écrire ici l'id d'une
    // des unités créées désignerait une ligne au hasard parmi cent.
    case 'org_unit.import':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'mission',
        entityId: evenement.missionId,
        meta: { unites_creees: evenement.unitesCreees },
      };

    case 'org_unit.validate':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'org_unit',
        entityId: evenement.uniteId,
        meta: { mission_id: evenement.missionId },
      };

    case 'org_unit.merge':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        // La SOURCE, jamais la cible : c'est elle que la fusion a changée, et
        // c'est sur elle qu'une recherche d'audit part (index `activity_log
        // (entity_type, entity_id)`). La cible est dans `meta`.
        entityType: 'org_unit',
        entityId: evenement.uniteId,
        meta: {
          mission_id: evenement.missionId,
          cible_id: evenement.cibleId,
          entretiens_reattaches: evenement.entretiensReattaches,
          enfants_reattaches: evenement.enfantsReattaches,
          avec_motif: evenement.avecMotif,
        },
      };

    // Le figeage porte sur la MISSION : c'est d'elle qu'on demandera « quand son
    // questionnaire a-t-il été figé ? », et c'est cette ligne qui répond.
    case 'mission.questionnaire_freeze':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'mission',
        entityId: evenement.missionId,
        meta: { questions_figees: evenement.questionsFigees },
      };

    // La réaffectation porte sur la SESSION, jamais sur l'un des deux auditeurs :
    // une recherche d'audit part de la session dont on conteste le changement de
    // main. Les deux auditeurs sont dans `meta`, en identifiants.
    case 'interview.reassign':
      return {
        action: evenement.action,
        utilisateurId: evenement.utilisateurId,
        entityType: 'interview',
        entityId: evenement.interviewId,
        meta: {
          mission_id: evenement.missionId,
          auditeur_avant: evenement.auditeurAvant,
          auditeur_apres: evenement.auditeurApres,
          motif: evenement.motif,
        },
      };
  }
}

/**
 * `meta` de remplacement quand la ceinture 2 a refusé la charge utile.
 *
 * ON NE PERD PAS L'ÉVÉNEMENT : la ligne est écrite, avec la trace du fait que son
 * `meta` a été écarté. Invariant 7 — « rien n'est jamais silencieusement écrasé ou
 * supprimé » : perdre la ligne entière pour un champ suspect ferait disparaître
 * l'événement de sécurité lui-même, ce qui est exactement le résultat qu'un
 * attaquant chercherait à provoquer en empoisonnant un champ.
 */
export const META_REFUSEE: Readonly<Record<string, unknown>> = Object.freeze({
  meta_refusee: true,
});
