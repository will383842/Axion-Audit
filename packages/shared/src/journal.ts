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
import { STATUTS_MISSION } from './missions.js';

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
] as const;

export type ActionJournal = (typeof ACTIONS_JOURNAL)[number];

/**
 * Valeurs d'`entity_type`. L'index `activity_log(entity_type, entity_id)` (04 §7.1)
 * n'a de sens que si le vocabulaire est fermé : deux orthographes pour la même
 * entité rendraient toute recherche d'audit incomplète — et une recherche d'audit
 * incomplète ne se voit pas, elle rend simplement moins de lignes.
 */
export const ENTITES_JOURNAL = ['user', 'scoping_estimate', 'company', 'mission'] as const;
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
     * ⚠ **UN BOOLÉEN, PAS LE MOTIF.** Le §32.2 exige un motif « obligatoire » et
     * une trace `activity_log` ; `activity_log.meta` est la seule colonne libre du
     * 04, et la ceinture 2 de ce fichier (`verifierValeursAtomiques`) n'y accepte
     * que du VOCABULAIRE TECHNIQUE — un motif rédigé en français y serait refusé
     * en bloc, emportant avec lui `statutAvant` et `statutApres` (voir
     * `META_REFUSEE`). Le texte du motif n'a donc, à ce jour, AUCUN endroit où se
     * poser : ni colonne dédiée dans `missions` (04), ni exception à la ceinture.
     * On enregistre donc QU'IL Y EN A EU UN, on refuse la transition quand il
     * manque — et on remonte le trou plutôt que de l'enterrer : c'est un candidat
     * `DECISIONS.md` de l'incrément L3b, pas une décision d'agent.
     */
    avecMotif: z.boolean(),
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
          avec_motif: evenement.avecMotif,
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
