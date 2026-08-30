// =============================================================================
// CONTRATS D'INTERFACE DU CRUD UTILISATEURS — lot L2, tâche T3.
//
// ── CE QUE LE PACK ÉCRIT, ET CE QU'IL N'ÉCRIT PAS ────────────────────────────
// Le fichier 07 écrit « CRUD users » sur une ligne. **Une seule route est nommée
// noir sur blanc** : `GET /v1/users`, désignée « premier consommateur réel » de la
// pagination keyset, curseur `(created_at, id)` (note de conception L2 §4.5). Tout
// le reste vient de deux entrées `DECISIONS.md` :
//   · 2026-08-30 « [L2/T3] Le CRUD users n'est pas spécifié : onze silences » —
//     pas de `DELETE` (le « D » n'est jamais instancié et `users` n'a pas de
//     `deleted_at`), `PATCH` et non `PUT` (seule forme de modification nommée par
//     le fichier 05), et **quatre actes distincts = quatre routes** ;
//   · 2026-08-31 « Comment un mot de passe se réinitialise » — mot de passe
//     ENGENDRÉ par le serveur et rendu UNE SEULE FOIS, refus §9.7 sous un code
//     d'erreur DÉDIÉ.
//
// ── POURQUOI QUATRE ROUTES LÀ OÙ UN `PATCH` SUFFIRAIT TECHNIQUEMENT ──────────
// Parce que **le catalogue du journal distingue déjà quatre actes** :
// `user.role_change`, `user.deactivate`, `user.habilitate`, `user.password_reset`
// (`journal.ts`). Les fondre dans un `PATCH` générique rendrait le journal
// INCAPABLE DE NOMMER ce qui s'est passé — or l'invariant 7 exige que toute
// correction soit tracée. **C'est le journal qui impose la forme de l'API**, et non
// l'inverse ; c'est aussi ce qui rend l'`activity_log` lisible le jour où quelqu'un
// conteste une action.
//
// ── CE QUI NE SORT JAMAIS D'ICI ─────────────────────────────────────────────
// `password_hash` n'apparaît dans AUCUN schéma de sortie, et cette absence n'est
// pas déclarative : le sérialiseur Zod REPASSE la réponse par son schéma avant
// l'envoi (`apps/api/src/http/zod.ts`). Un champ ajouté par mégarde au dépôt ne
// peut donc pas atteindre le réseau — il fait échouer la route en 500.
//
// AUCUNE LOGIQUE ICI — ni hachage, ni règle d'accès : ce paquet est importé par la
// PWA terrain et par la console. Ce qui y entre part dans un navigateur.
// Traçabilité : E33 (sécurité), E43 (conventions d'API épinglées), E45 (pilotage
// humain : habilitation §34.4).
// =============================================================================
import { z } from 'zod';
import { MOT_DE_PASSE_PRESENTE_LONGUEUR_MAX, emailUtilisateurSchema } from './auth.js';
import { ROLES_JOURNALISABLES } from './journal.js';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// VOCABULAIRES FERMÉS
// -----------------------------------------------------------------------------

/**
 * Les rôles de `users.role`. **RÉUTILISÉS, PAS RECOPIÉS.**
 *
 * `journal.ts` porte déjà cette liste (`ROLES_JOURNALISABLES`) et documente qu'elle
 * fait doublon avec `apps/api/src/db/schema.ts` — un doublon INÉVITABLE, puisque ce
 * paquet ne peut pas importer le schéma Drizzle de l'API (il part dans un
 * navigateur) et que l'API ne peut pas être la source d'un contrat partagé. En
 * écrire une TROISIÈME copie ici aurait ajouté une troisième occasion de diverger,
 * pour rien. Le nom `ROLES_JOURNALISABLES` est étroit au regard de cet usage : la
 * consolidation (un `roleUtilisateurSchema` unique dont le schéma Drizzle
 * dériverait) reste PROPOSÉE — elle touche un fichier du lot L1.
 */
export const roleUtilisateurSchema = z.enum(ROLES_JOURNALISABLES);
export type RoleUtilisateur = z.infer<typeof roleUtilisateurSchema>;

/**
 * `users.usage_profile` — 04 : `CHECK IN ('guide_strict','expert')`, et 03 §19.1
 * pour ce que chacun veut dire (mode guidé strict par défaut, mode expert pour un
 * auditeur habilité).
 *
 * ⚠ MÊME DOUBLON ASSUMÉ que ci-dessus vis-à-vis de `db/schema.ts` (`PROFILS_USAGE`),
 * et pour la même raison. La divergence, si elle survenait, ferait échouer
 * l'insertion sur le CHECK de la base — donc bruyamment, à l'écriture, jamais en
 * silence.
 */
export const PROFILS_USAGE_UTILISATEUR = ['guide_strict', 'expert'] as const;
export const profilUsageSchema = z.enum(PROFILS_USAGE_UTILISATEUR);
export type ProfilUsageUtilisateur = z.infer<typeof profilUsageSchema>;

// -----------------------------------------------------------------------------
// BORNES D'ENTRÉE
// -----------------------------------------------------------------------------

/**
 * Longueur maximale du nom affiché. `users.name` est un `TEXT` sans borne au
 * fichier 04 : la borne est donc APPLICATIVE, et elle existe pour la même raison
 * que celle de l'adresse — refuser une entrée démesurée AVANT la base, pas après.
 * 200 caractères couvrent large un nom, un prénom composé et une particule.
 */
export const NOM_UTILISATEUR_LONGUEUR_MAX = 200;

/**
 * LA POLITIQUE DE MOT DE PASSE — 12 caractères, et ce n'est pas une invention.
 *
 * 06 §10.1, mot pour mot : « Politique de mot de passe : 12+ caractères ». Elle
 * s'applique à la CRÉATION et au CHANGEMENT — **jamais à la connexion**, où
 * `auth.ts` explique pourquoi (un compte antérieur à la politique doit pouvoir se
 * connecter pour aller la corriger, et un refus de longueur y rendrait un 400 là où
 * le contrat exige un 401 indifférencié).
 *
 * Le mot de passe ENGENDRÉ par la réinitialisation admin est tenu à la même règle :
 * il fait 20 caractères (voir `apps/api/src/domaines/users/mots-de-passe.ts`).
 */
export const MOT_DE_PASSE_LONGUEUR_MIN = 12;

/**
 * Borne haute, reprise TELLE QUELLE de la connexion : Argon2id coûte ~19 Mio et
 * trois passes par frappe, et une entrée non bornée offrirait un amplificateur de
 * charge. Réutilisée plutôt que redéfinie — deux bornes du même secret qui
 * divergeraient laisseraient créer un mot de passe impossible à présenter ensuite.
 */
export const MOT_DE_PASSE_LONGUEUR_MAX = MOT_DE_PASSE_PRESENTE_LONGUEUR_MAX;

const nomUtilisateurSchema = z
  .string()
  .trim()
  .pipe(z.string().min(1).max(NOM_UTILISATEUR_LONGUEUR_MAX));

const motDePasseSchema = z.string().min(MOT_DE_PASSE_LONGUEUR_MIN).max(MOT_DE_PASSE_LONGUEUR_MAX);

// -----------------------------------------------------------------------------
// PARAMÈTRE D'URL
// -----------------------------------------------------------------------------

/** `:id` des cinq routes qui visent UN compte. */
export const userParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type UserParams = z.infer<typeof userParamsSchema>;

// -----------------------------------------------------------------------------
// SORTIE — la seule forme sous laquelle un compte sort de l'API
// -----------------------------------------------------------------------------

/**
 * Le compte, tel qu'il est rendu. `strictObject` : une clé non déclarée est
 * REFUSÉE, pas ignorée — sur une réponse, la différence compte (voir l'en-tête).
 *
 * **`passwordHash` N'Y EST PAS, ET NE PEUT PAS Y ENTRER.** L'interdiction écrite
 * du pack ne portait que sur le JOURNAL ; son absence de l'API est tranchée par
 * `DECISIONS.md` du 2026-08-30 et rendue exécutoire ici.
 *
 * `email` et `name` SONT des données personnelles (11 §2) : elles sortent parce que
 * la console d'administration ne peut pas gérer des comptes sans les voir, et parce
 * que TOUTES les routes de ce fichier sont `admin` (03 §34.1 « la console est ADMIN
 * SEUL »). Elles n'entrent en revanche JAMAIS dans un journal — ni pino (11 §2), ni
 * `activity_log` (le catalogue n'a aucune variante qui puisse les porter).
 */
export const userResponseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(NOM_UTILISATEUR_LONGUEUR_MAX),
  email: z.string().min(1),
  role: roleUtilisateurSchema,
  usageProfile: profilUsageSchema,
  /** §34.4 — `null` tant que l'habilitation n'est pas prononcée par un admin. */
  habilitatedAt: isoUtcSchema.nullable(),
  isActive: z.boolean(),
  lastLoginAt: isoUtcSchema.nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});

export type UserResponse = z.infer<typeof userResponseSchema>;

// -----------------------------------------------------------------------------
// ENTRÉES
// -----------------------------------------------------------------------------

/**
 * `POST /v1/users` — création.
 *
 * ── LES TROIS CHAMPS QUE CE SCHÉMA REFUSE, ET POURQUOI ──────────────────────
 *  · **`isActive`** : un compte se crée ACTIF. 03 §34.4 décrit l'entrée d'un
 *    auditeur — « compte créé → bac à sable → cotation croisée → habilitation » :
 *    les trois premières étapes exigent un compte utilisable. Le seul chemin vers
 *    l'inactivité est la route dédiée, qui est aussi le seul acte que le journal
 *    sait nommer (`user.deactivate`). Un booléen ici l'aurait rendu innommable.
 *  · **`habilitatedAt`** : §34.4 en fait un ACTE de l'admin, postérieur au bac à
 *    sable et à la cotation croisée. Le poser à la création reviendrait à habiliter
 *    quelqu'un qui n'a rien passé — et le journal l'écrirait « create », pas
 *    « habilitate ».
 *  · **`role: 'admin'` interdit ?** NON — le pack ne l'interdit nulle part, et le
 *    refuser inventerait une règle. Un administrateur crée qui il veut ; l'acte est
 *    journalisé avec son rôle (`user.create` porte `role`).
 *
 * `usageProfile` a un DÉFAUT applicatif, `guide_strict`, et il vient du pack :
 * 03 §34.4 (« profil guidé strict par défaut §19.1 »). Le défaut SQL a été retiré
 * par la migration `0011` — « créé actif » et consorts sont des décisions
 * FONCTIONNELLES, qui appartiennent à l'application et non à la colonne. Le voici,
 * écrit une fois, à l'endroit que le front lit aussi.
 */
export const createUserRequestSchema = z.strictObject({
  name: nomUtilisateurSchema,
  email: emailUtilisateurSchema,
  password: motDePasseSchema,
  role: roleUtilisateurSchema,
  usageProfile: profilUsageSchema.default('guide_strict'),
});

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/**
 * `PATCH /v1/users/:id` — modification ORDINAIRE d'un compte.
 *
 * Trois champs, et trois seulement : le rôle, l'activité, l'habilitation et le mot
 * de passe ont chacun leur route, parce que le journal les nomme chacun (en-tête).
 * Ce qui reste est exactement ce que `user.update` sait décrire — voir
 * `CHAMPS_UTILISATEUR_JOURNALISABLES`.
 *
 * `refine` plutôt qu'un objet libre : un `PATCH {}` n'est pas une modification,
 * c'est une requête sans objet. La refuser évite une ligne de journal vide et un
 * `updated_at` bousculé pour rien.
 */
export const updateUserRequestSchema = z
  .strictObject({
    name: nomUtilisateurSchema.optional(),
    email: emailUtilisateurSchema.optional(),
    usageProfile: profilUsageSchema.optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/** `PATCH /v1/users/:id/role` — le seul acte que `user.role_change` sait décrire. */
export const changeRoleRequestSchema = z.strictObject({
  role: roleUtilisateurSchema,
});

export type ChangeRoleRequest = z.infer<typeof changeRoleRequestSchema>;

/**
 * Corps VIDE des deux routes qui n'ont rien à porter : `deactivate` et
 * `habilitate`. L'acte est dans l'URL, pas dans un champ.
 *
 * `strictObject` **quand même**, et `.default({})` pour accepter l'absence totale de
 * corps : un client qui enverrait `{"role":"admin"}` à `/deactivate` serait REFUSÉ
 * plutôt que silencieusement ignoré. Ignorer un champ que l'appelant croyait
 * appliquer est exactement le mode de défaillance que `strictObject` existe pour
 * fermer.
 */
export const actionSansCorpsSchema = z.strictObject({}).default({});

/**
 * `PATCH /v1/users/:id/password-reset` — entrée.
 *
 * `force` EST la « confirmation explicite “perte locale possible” » du 05 §9.7. Son
 * défaut est `false` : on ne détruit pas par omission. Quand il vaut `true` ET que
 * le garde-fou avait quelque chose à dire, la ligne `user.password_reset` porte
 * `forcage: true` — c'est la moitié « journalisation » qu'exige la note L2 §2.4.
 */
export const passwordResetRequestSchema = z
  .strictObject({
    force: z.boolean().default(false),
  })
  .default({ force: false });

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/**
 * `PATCH /v1/users/:id/password-reset` — sortie.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE SEUL ENDROIT DU PRODUIT OÙ UN MOT DE PASSE EN CLAIR CIRCULE, ET IL N'Y PASSE
 * QU'UNE FOIS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le mot de passe est ENGENDRÉ par le serveur (DECISIONS.md 2026-08-31) : les deux
 * autres voies ont été écartées sur des motifs mesurés — le lien d'invitation exige
 * un service d'e-mail absent de la liste épinglée §1, et un mot de passe choisi par
 * l'admin transiterait par un canal non maîtrisé (oral, messagerie) avant
 * d'atteindre son destinataire.
 *
 * IL N'EST NI RELISIBLE, NI JOURNALISÉ. Le serveur n'en garde que l'empreinte
 * Argon2id ; l'`activity_log` reçoit l'ACTE (`user.password_reset`) et jamais la
 * VALEUR — le catalogue est fermé par action et aucune de ses variantes ne porte de
 * champ de texte libre, donc l'y écrire est INEXPRIMABLE, pas seulement interdit.
 * Le champ est nommé `password` À DESSEIN : c'est la clé que la redaction de pino
 * surveille (`packages/shared/src/redaction.ts`), donc celle qui serait masquée si
 * cette réponse atterrissait un jour par mégarde dans une trace.
 *
 * `forced` DIT LA VÉRITÉ SUR CE QUI VIENT DE SE PASSER : `true` signifie que le
 * garde-fou §9.7 avait quelque chose à signaler et qu'il a été OUTREPASSÉ — donc
 * que des données de collecte locales sont probablement perdues. La console doit
 * l'afficher ; c'est la contrepartie du forçage.
 */
export const passwordResetResponseSchema = z.strictObject({
  userId: z.uuid(),
  /** À AFFICHER UNE SEULE FOIS. Le serveur ne saura plus le redire. */
  password: z.string().min(MOT_DE_PASSE_LONGUEUR_MIN),
  forced: z.boolean(),
});

export type PasswordResetResponse = z.infer<typeof passwordResetResponseSchema>;
