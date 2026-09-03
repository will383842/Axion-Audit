// =============================================================================
// LOT L3 / INCRÉMENT L3d — L'ASSEMBLEUR M2, LA PRÉVISUALISATION §33.4 ET LE
// FIGEAGE, ÉPROUVÉS SUR UN POSTGRESQL RÉEL.
//
// `GET  /v1/missions/:id/questionnaire-preview`  (§33.4)
// `POST /v1/missions/:id/generate-questionnaire` (M2 §4 — le snapshot)
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE, ET SANS L'AVOIR LU.
// ═══════════════════════════════════════════════════════════════════════════════
// 09 §3-2 (« TDD sur les parties critiques — tests écrits AVANT ») et 09 §5.6
// (« le code de test n'est JAMAIS écrit par l'agent qui a écrit le code testé »).
// Au moment de la rédaction, `apps/api/src/domaines/questionnaire/**` et
// `apps/api/src/routes/questionnaire.ts` N'EXISTAIENT PAS ; ils seront écrits
// après, par un autre agent, depuis la même spécification. Aucun de ces fichiers
// n'a été ouvert — y compris s'il apparaît en cours de route.
//
// Les attentes viennent donc de la SPÉCIFICATION, et d'elle seule :
//   · 03 M2 — les cinq règles d'assemblage, dont « Snapshot : les questions
//     sélectionnées sont FIGÉES (copie version + texte) dans `mission_questions` ;
//     la banque peut évoluer ensuite SANS TOUCHER aux missions en cours » ;
//   · 03 §16.3 — « le moteur M2 croise palier × secteur × périmètre × UNITÉS
//     IN_SCOPE de l'arbre (les paquets logistique ne sont générés que si l'arbre
//     contient une unité logistique) × interlocuteur » ;
//   · 03 §32.4 — les ancres de cotation, qui vivent dans `guidance_fr` et doivent
//     donc être CAPTURÉES pour être lisibles hors ligne (§33.3) ;
//   · 03 §33.4 — « avant le snapshot M2 (figeage), un écran montre le
//     questionnaire assemblé — total et répartition par bloc × interlocuteur,
//     liste dépliable — puis demande confirmation » ;
//   · 03 §34.1 — « Décision V1 : la console est ADMIN SEUL » ;
//   · 04 — `questions`, `blocks`, `mission_questions` et SES HUIT COLONNES DE
//     CAPTURE, `activity_log` ;
//   · 11 §2 (UUID v7 applicatif, aucun secret réel), 11 §3 (format d'erreur
//     unique, codes d'`ERROR_CODES`, dates ISO 8601 UTC) ;
//   · `docs/conception/LOT_L3.md` §3.a — « le figeage est une CAPTURE, pas une
//     référence » — et `docs/conception/LOT_L3D_BRIEF.md` §3, §4, §7, §9 ;
//   · `DECISIONS.md` du 2026-08-29 (« Les quatre codes d'erreur du lot »,
//     « Les quatre routes hors §8/§24.2 ») et du 2026-09-01 (date de figeage lue
//     dans `activity_log` · ordre des questions · profil d'interlocuteur absent
//     du 04).
//
// **CONSÉQUENCE ASSUMÉE** : une divergence de lecture entre l'implémenteur et moi
// DOIT faire rougir cette suite. C'est le dispositif, pas un accident. Les
// hypothèses que la spécification ne tranche pas sont NOMMÉES une à une plus bas :
// un test écrit sur une hypothèse non tracée est un faux verdict.
//
// ── LES HUIT PROPRIÉTÉS QUI NE SE VOIENT PAS EN RELISANT LE CODE ─────────────
//   1. LE FIGEAGE EST UNE CAPTURE, PAS UNE RÉFÉRENCE. C'est LE cas `@critique`
//      central (section 5). Une implémentation qui garderait une référence vers la
//      banque — une vue, une jointure, un `text_snapshot` laissé NULL et relu à la
//      volée — passerait TOUS les autres cas de ce fichier et échouerait celui-là
//      SEUL. Et elle ne se verrait jamais en production : elle ne se manifeste que
//      le jour où la banque bouge, c'est-à-dire des mois après la mise en service,
//      sur une mission déjà livrée dont le rapport cesse rétroactivement de
//      correspondre à ce qui a été demandé au client ;
//   2. L'ORDRE EST DÉTERMINISTE. `questions` n'a AUCUNE colonne de position (04) :
//      sans clause de tri totale, deux générations rendent deux ordres, et le
//      figeage capture l'un des deux AU HASARD. Le défaut est invisible sur un jeu
//      de test à trois questions et invisible en revue de code — il faut deux
//      générations comparées pour le voir (section 2) ;
//   3. LA PRÉVISUALISATION N'ÉCRIT RIEN. §33.4 en fait un écran de confirmation :
//      une prévisualisation qui figerait « pour aller plus vite » rendrait la
//      confirmation décorative, et l'utilisateur qui ferme l'onglet aurait figé
//      sans le savoir. Éprouvé par relecture COMPLÈTE de la base, pas par la
//      seule absence de `mission_questions` (section 3) ;
//   4. LE SECOND FIGEAGE EST REFUSÉ, PAS REJOUÉ. Un `INSERT` idempotent « par
//      sécurité » — supprimer puis réinsérer — produirait un questionnaire
//      SILENCIEUSEMENT ACTUALISÉ depuis la banque : exactement ce que `resync`
//      existe pour faire, sous confirmation et avec diff affiché (05 §8.3). Le
//      refus doit donc être un refus, et il doit ne rien écrire (section 6) ;
//   5. UN FILTRE QUI NE REND RIEN N'EST PAS UN SUCCÈS. Figer zéro ligne produirait
//      une mission « figée et vide », indistinguable d'une mission non figée
//      puisqu'il n'existe AUCUNE colonne « figé » : l'existence des lignes EST la
//      preuve (LOT_L3 §3.a). Le terrain partirait avec zéro question (section 1) ;
//   6. LES UNITÉS HORS PÉRIMÈTRE NE TIRENT PAS LEURS PAQUETS. §16.3 : « les
//      paquets logistique ne sont générés que si l'arbre contient une unité
//      logistique ». Une implémentation qui oublierait `in_scope` ou
//      `status = 'active'` gonflerait le questionnaire de blocs entiers sans
//      interlocuteur pour y répondre — et le taux de complétude s'effondrerait
//      sans que personne ne comprenne pourquoi (section 1) ;
//   7. `weight` EST UN `numeric`, PAS UN `number`. Le pilote pg le rend en CHAÎNE ;
//      le faire transiter par un flottant JavaScript arrondit en silence, et un
//      poids arrondi fausse le scoring de toute la mission sans jamais lever
//      d'erreur. Comparé EN CHAÎNE, jamais converti (sections 4 et 5) ;
//   8. AUCUN MONTANT NE SORT PAR CES DEUX ROUTES. Ni le volet financier du
//      cadrage, ni ses noms de champs — pas même pour un administrateur, qui a
//      pourtant le droit de les voir ailleurs. La question n'est pas « qui a le
//      droit » mais « par quelle porte » (section 9).
//
// ── HYPOTHÈSES D'INTERFACE (la spécification est muette — elles sont TRACÉES) ─
//   H1. **Les deux URL** sont `GET /v1/missions/:id/questionnaire-preview` et
//       `POST /v1/missions/:id/generate-questionnaire`. Elles ne sont pas
//       devinées : `DECISIONS.md` du 2026-08-29 (« Les quatre routes hors
//       §8/§24.2 ») les fixe verbatim, la première étant explicitement RENOMMÉE
//       depuis `POST …/questionnaire/preview`. Elles vivent en UN SEUL endroit de
//       ce fichier (`urlPrevisualisation`, `urlFigeage`).
//   H2. **Le corps du figeage est vide** (`{}`) : le brief L3D §7 déclare
//       `body:{}`. Un corps porteur d'options n'est nulle part spécifié.
//   H3. **La réponse de prévisualisation** porte `total` (entier) et `questions`
//       (tableau) ; `parBloc`, `parInterlocuteur` et `avertissements` sont EXIGÉS
//       par des cas DÉDIÉS plutôt que par le schéma commun — une propriété, un
//       rouge : un écart de nom sur `parBloc` ne doit pas rougir les douze cas qui
//       ne parlent que de `total`.
//   H4. **La réponse de figeage** porte `total`. Le reste n'est pas jugé ici.
//   H5. **Le refus de second figeage** rend `409` avec le code littéral
//       `QUESTIONNAIRE_ALREADY_FROZEN` (`DECISIONS.md` 2026-08-29). ⚠ CE CODE
//       N'EXISTE PAS DANS `ERROR_CODES` À LA RÉDACTION : il est écrit ici en clair
//       et signalé au rapport. Je ne l'ajoute pas — `packages/shared/src/errors.ts`
//       est tenu par un autre agent, et un code d'erreur est une décision d'API
//       (11 §8-6).
//   H6. **Le refus de figeage sur sélection vide** rend `409 CONFLICT` (brief L3D
//       §3, « une sélection totalement vide interdit le figeage (409 CONFLICT) »).
//   H7. **Le refus de figeage hors statut `preparation`** rend `409` (brief L3D
//       §8-10). Le CODE n'est tranché nulle part : les deux formes défendables
//       (`CONFLICT`, `ILLEGAL_STATE_TRANSITION`) sont acceptées, et la SUBSTANCE
//       — aucune ligne écrite — est exigée sans tolérance.
//   H8. **La date du refus vient d'`activity_log`** (`DECISIONS.md` 2026-09-01).
//       Le test n'exige donc pas une colonne de date : il exige (a) qu'une trace
//       de l'acte de figeage existe dans `activity_log` pour la mission, et (b)
//       que le corps du 409 porte une date compatible avec elle, à un jour près
//       — la tolérance couvre un rendu au fuseau de mission sans rien concéder sur
//       le fond. ⚠ `ACTIONS_JOURNAL` (`packages/shared/src/journal.ts`) est un
//       catalogue FERMÉ qui ne contient aucune action de figeage : voir le rapport.
//   H9. **`active_blocks` / `active_sectors` portent des CODES**, pas des UUID, et
//       **une liste vide ne restreint rien** (brief L3D §8-1). Mesuré au seed
//       (`blocs.map(b => b.code)`, `'["services"]'`), cohérent avec §36.4.
//  H10. **L'ordre de tri** est `blocks.position`, puis `questions.code` (les
//       absents en DERNIER), puis `questions.id` (`DECISIONS.md` 2026-09-01).
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit franchement ─────────────────────────
//   · il ne prouve RIEN du plan d'entretiens §32.4 ni des routes `assignments` /
//     `reassign` : ils vivent dans l'autre fichier de l'incrément
//     (`l3d-assignments.integration.test.ts`), écrit séparément ;
//   · il ne prouve rien de la PROJECTION par profil au-delà de son effet
//     mesurable : `questions.profiles` n'est pas une colonne de capture (04), le
//     04 n'a aucune place où poser le profil d'un interlocuteur
//     (`DECISIONS.md` 2026-09-01) et le pack ne dit pas comment `parInterlocuteur`
//     compte une question `profiles = []`. Le cas éprouve donc que la projection
//     N'EST PAS UN FILTRE, et rien de plus ;
//   · il ne mesure aucune durée : un seuil de temps est intermittent en CI, et une
//     suite intermittente finit ignorée ;
//   · le garde statique de la section 7 est TEXTUEL. Il ne voit ni un nom de table
//     construit à l'exécution, ni une vue SQL, ni un `ON CONFLICT DO UPDATE`
//     portant des colonnes de capture. Il est bon marché et il le dit ;
//   · il ne dit rien du comportement quand `missions.size_tier_id` est NULL
//     (le 04 l'autorise, aucune section ne tranche le sens du filtre de palier
//     dans ce cas) — remonté au rapport plutôt que deviné.
//
// Invariant 2 : aucune référence client. Toutes les fixtures portent des libellés
// neutres et des entités fictives ; l'exemple CSV du §35.2 n'est jamais recopié.
// Invariant 5 : messages d'erreur en français, horodatages UTC.
// Traçabilité : E11 (questionnaire généré et figé par mission) · E1 (méthodologie
// par blocs) · E2 (paliers de taille) · E3 (secteurs et paquets sectoriels) ·
// E30 (niveaux d'audit) · E40 (ancres de cotation figées avec la question) ·
// E21 (auditeurs jamais d'accès aux montants) · E33 (sécurité) ·
// E31 (généricité absolue, aucune référence client) · E43 (exécutabilité
// autopilote : conventions d'API) · E36 (critères d'acceptation du lot).
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ERROR_CODES } from '@axion/shared';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  RACINE_API,
  RACINE_DEPOT,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
// Importé pour sa DÉCLARATION D'AUGMENTATION : c'est elle qui fait connaître
// `app.registreAcces` à TypeScript. Le type sert aussi à parcourir le registre
// sans assertion (11 §3 : « aucun any »).
import type { EntreeRegistreAcces } from '../src/auth/politique.js';
import {
  balayerSentinellesFinancieres,
  decrireRapport,
  NOMS_FINANCIERS_INTERDITS,
  parametresDuGabarit,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
  type CartographieDeParametres,
} from './aide/sentinelle-financiere.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '3a'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '9f'.repeat(32);
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';

const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l3d@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

/**
 * HYPOTHÈSE H5 — le code du refus de second figeage.
 *
 * Écrit en CLAIR, et pas importé d'`ERROR_CODES`, parce qu'il n'y figure pas au
 * moment où ce fichier est écrit. Ce n'est pas un contournement de la règle
 * « jamais de littéral libre » (11 §3), qui vise le CODE DE PRODUCTION : c'est un
 * test qui exige un code que l'arbitrage du 2026-08-29 a nommé et que le contrat
 * partagé n'a pas encore reçu. L'ajouter moi-même serait deux fautes en une —
 * écrire du code de production (09 §5.6) et décider d'une convention d'API seul
 * (11 §8-6). Il est donc SIGNALÉ, pas posé.
 */
const CODE_DEJA_FIGE = 'QUESTIONNAIRE_ALREADY_FROZEN';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
/** `size_tiers.code` → identifiant, lus une fois au démarrage. */
const paliers = new Map<string, string>();
/** `services.code` → identifiant (les 11 fonctions du §16.3). */
const fonctions = new Map<string, string>();

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

function palier(code: string): string {
  const id = paliers.get(code);
  if (id === undefined) throw new Error(`palier « ${code} » absent du seed`);
  return id;
}

function fonction(code: string): string {
  const id = fonctions.get(code);
  if (id === undefined) throw new Error(`fonction « ${code} » absente du seed`);
  return id;
}

// -----------------------------------------------------------------------------
// APPELS HTTP
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly message: string | null;
  readonly corps: string;
}

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), code: z.string().optional(), message: z.string() }))
      .optional(),
  }),
});

/**
 * Une adresse par appel.
 *
 * Le quota global (11 §3) est de 300 req/min et sa clé est le sujet du jeton, ou
 * `request.ip` en repli — donc, pour un anonyme, l'adresse. Sans adresse distincte,
 * l'ORDRE des `it` déciderait des verdicts, et une suite dont le résultat dépend de
 * son ordre ne prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.34.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function appeler(
  methode: 'GET' | 'POST' | 'PATCH',
  url: string,
  options: { readonly jeton?: string; readonly charge?: Readonly<Record<string, unknown>> } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
    ...(options.charge === undefined ? {} : { payload: options.charge }),
  });

  let code: string | null = null;
  let message: string | null = null;
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      message = analyse.data.error.message;
    }
  }
  return { statut: reponse.statusCode, code, message, corps: reponse.body };
}

/** HYPOTHÈSE H1 — l'unique endroit du fichier qui connaisse ces deux URL. */
function urlPrevisualisation(missionId: string, requete = ''): string {
  return `/v1/missions/${missionId}/questionnaire-preview${requete}`;
}
function urlFigeage(missionId: string): string {
  return `/v1/missions/${missionId}/generate-questionnaire`;
}

// -----------------------------------------------------------------------------
// LES CONTRATS DE SORTIE — RÉÉCRITS depuis la spec, jamais importés du code testé
// -----------------------------------------------------------------------------
// Importer le schéma de réponse du lot reviendrait à demander au sujet de valider
// sa propre réponse : une clé retirée du contrat disparaîtrait des DEUX côtés le
// même jour, et le test resterait vert en n'exigeant plus rien.

/** HYPOTHÈSE H3 — le socle commun, volontairement minimal. */
const previsualisationSchema = z.object({
  total: z.number().int().nonnegative(),
  questions: z.array(z.unknown()),
});
type Previsualisation = z.infer<typeof previsualisationSchema>;

/** HYPOTHÈSE H4. */
const figeageSchema = z.object({ total: z.number().int().nonnegative() });

function previsualisation(reponse: Reponse): Previsualisation {
  expect(
    reponse.statut,
    `La prévisualisation a échoué : ${String(reponse.statut)} ${reponse.corps.slice(0, 600)}`,
  ).toBe(200);
  const analyse = previsualisationSchema.safeParse(JSON.parse(reponse.corps));
  expect(
    analyse.success,
    'La réponse de prévisualisation ne porte pas les deux champs que le §33.4 rend\n' +
      'indispensables : `total` (entier) et `questions` (tableau — « liste dépliable »).\n' +
      `Corps reçu :\n${reponse.corps.slice(0, 800)}`,
  ).toBe(true);
  return previsualisationSchema.parse(JSON.parse(reponse.corps));
}

/** Lit un corps JSON comme un dictionnaire, sans jamais employer `any`. */
function objetJson(brut: string): Record<string, unknown> {
  const analyse = z.record(z.string(), z.unknown()).safeParse(JSON.parse(brut));
  return analyse.success ? analyse.data : {};
}

/** Lit une clé de la réponse comme un tableau, sans jamais employer `any`. */
function tableauDe(brut: string, cle: string): readonly unknown[] | null {
  const analyse = z.array(z.unknown()).safeParse(objetJson(brut)[cle]);
  return analyse.success ? analyse.data : null;
}

// -----------------------------------------------------------------------------
// COMPTES — un compte NEUF par test, jamais un compte partagé
// -----------------------------------------------------------------------------

type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte et frappe son jeton d'accès.
 *
 * Ni `POST /v1/auth/login` ni Argon2id : le quota `/v1/auth/*` (10 req/min/IP)
 * ferait dépendre cette suite d'un plafond qui ne la concerne pas, et la dérivation
 * coûte ~19 Mio par appel pour éprouver un chemin qui a déjà sa suite
 * (`l2-auth-routes`). Le jeton est frappé par `app.jwt.sign`, donc par LA MÊME clé
 * que la route de connexion, et il ne porte que `sub` : le crochet d'autorisation
 * relit le rôle EN BASE (06 §10.1), rien n'est court-circuité.
 *
 * `habilitated_at` est posé : la garde §34.4 n'est pas le sujet de ce fichier, et un
 * compte non habilité y produirait des refus qui masqueraient les refus de RÔLE,
 * seuls éprouvés ici.
 */
async function creerCompte(role: RoleUtilisateur, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [id, `Compte ${suffixe}`, `compte.${suffixe}@exemple.test`, role],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

// =============================================================================
// FIXTURES — semées par SQL DIRECT
// =============================================================================
// La banque de questions relève du lot L4, les missions du lot L3b, l'arbre du lot
// L3c : les semer par SQL évite de faire dépendre quarante cas de l'assembleur du
// contrat de TROIS autres routes. C'est une fabrication d'ÉTAT, jamais une
// fabrication de RÉSULTAT — le sujet, lui, passe toujours par la route.

let compteurBloc = 0;

interface BlocSeme {
  readonly id: string;
  readonly code: string;
}

/** Un bloc dédié par famille de cas : `active_blocks` isole alors chaque test. */
async function semerBloc(position: number): Promise<BlocSeme> {
  compteurBloc += 1;
  const code = `l3d_bloc_${String(compteurBloc).padStart(3, '0')}`;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO blocks (id, code, label_fr, position, is_default, description)
     VALUES ($1, $2, $3, $4, false, $5)`,
    [id, code, `Bloc factice ${code}`, position, 'Fixture L3d — libellé neutre (invariant 2).'],
  );
  return { id, code };
}

interface SemisQuestion {
  readonly blocId: string;
  /** `NULL` est LÉGITIME au 04 (« NULL pour les ad hoc non versées »). */
  readonly code?: string | null;
  readonly id?: string;
  readonly version?: number;
  readonly status?: 'draft' | 'active' | 'archived';
  readonly origin?: 'banque' | 'ad_hoc';
  readonly texte?: string;
  readonly guidance?: string | null;
  readonly answerType?: string;
  readonly options?: unknown;
  readonly allowRange?: boolean;
  /** EN CHAÎNE, toujours — voir la propriété n° 7 de l'en-tête. */
  readonly poids?: string;
  readonly scoring?: unknown;
  readonly criticality?: 'bloquant' | 'important' | 'informatif';
  readonly secteurs?: readonly string[];
  readonly servicesCibles?: readonly string[];
  readonly niveaux?: readonly string[];
  readonly effectifMin?: number | null;
  readonly effectifMax?: number | null;
  readonly profils?: readonly string[];
  readonly geo?: 'france' | 'multi_pays' | 'tous';
}

let compteurQuestion = 0;

async function semerQuestion(semis: SemisQuestion): Promise<string> {
  compteurQuestion += 1;
  const id = semis.id ?? uuidv7();
  await bd().query(
    `INSERT INTO questions
       (id, code, block_id, version, status, text_fr, guidance_fr, answer_type, options,
        allow_range, weight, scoring, criticality, sectors, target_services, levels,
        headcount_min, headcount_max, profiles, geo, origin, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::numeric, $12::jsonb, $13,
             $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb, $20, $21, NULL)`,
    [
      id,
      semis.code === undefined ? `L3D-Q-${String(compteurQuestion).padStart(4, '0')}` : semis.code,
      semis.blocId,
      semis.version ?? 1,
      semis.status ?? 'active',
      semis.texte ?? `Question factice ${String(compteurQuestion)} — libellé neutre.`,
      semis.guidance === undefined ? 'Consigne factice de fixture.' : semis.guidance,
      semis.answerType ?? 'scale_1_5',
      semis.options === undefined || semis.options === null ? null : JSON.stringify(semis.options),
      semis.allowRange ?? false,
      semis.poids ?? '1',
      semis.scoring === undefined || semis.scoring === null ? null : JSON.stringify(semis.scoring),
      semis.criticality ?? 'important',
      JSON.stringify(semis.secteurs ?? []),
      JSON.stringify(semis.servicesCibles ?? []),
      JSON.stringify(semis.niveaux ?? []),
      semis.effectifMin ?? null,
      semis.effectifMax ?? null,
      JSON.stringify(semis.profils ?? []),
      semis.geo ?? 'tous',
      semis.origin ?? 'banque',
    ],
  );
  return id;
}

interface SemisMission {
  readonly createur: string;
  /** CODES de blocs (hypothèse H9). */
  readonly blocsActifs: readonly string[];
  readonly secteursActifs?: readonly string[];
  readonly niveau?: 'diagnostic_cadrage' | 'operationnel' | 'strategique_groupe';
  readonly geo?: 'france' | 'multi_pays';
  readonly palier?: string | null;
  readonly statut?: 'preparation' | 'en_cours' | 'en_analyse' | 'livree' | 'cloturee';
}

let compteurMission = 0;

interface MissionSemee {
  readonly id: string;
  readonly entrepriseId: string;
}

async function semerMission(semis: SemisMission): Promise<MissionSemee> {
  compteurMission += 1;
  const suffixe = String(compteurMission).padStart(3, '0');
  const entrepriseId = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entrepriseId,
    `Entreprise fictive L3d ${suffixe}`,
  ]);
  const id = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, size_tier_id, active_sectors,
                           active_blocks, audit_level, timezone, status, created_by,
                           created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'Europe/Paris', $9, $10, now(), now())`,
    [
      id,
      entrepriseId,
      `Mission fictive L3d ${suffixe}`,
      semis.geo ?? 'france',
      semis.palier === null ? null : palier(semis.palier ?? 'pme'),
      JSON.stringify(semis.secteursActifs ?? []),
      JSON.stringify(semis.blocsActifs),
      semis.niveau ?? 'operationnel',
      semis.statut ?? 'preparation',
      semis.createur,
    ],
  );
  return { id, entrepriseId };
}

interface SemisUnite {
  readonly missionId: string;
  readonly nom: string;
  /** Code de `services` (les 11 fonctions), ou `null` pour une unité sans fonction. */
  readonly service: string | null;
  readonly inScope?: boolean;
  readonly statut?: 'active' | 'proposee' | 'fusionnee';
  readonly effectif?: number | null;
  readonly position?: number;
}

async function semerUnite(semis: SemisUnite): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, service_ref_id,
                            in_scope, status, position, created_at, updated_at)
     VALUES ($1, $2, NULL, 'service', $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      semis.missionId,
      semis.nom,
      semis.effectif ?? null,
      semis.service === null ? null : fonction(semis.service),
      semis.inScope ?? true,
      semis.statut ?? 'active',
      semis.position ?? 1,
    ],
  );
  return id;
}

// -----------------------------------------------------------------------------
// LECTURES DIRECTES — la seule vérité sur ce qu'une route a écrit
// -----------------------------------------------------------------------------

/**
 * Une ligne figée, LUE TELLE QUELLE.
 *
 * Les trois colonnes `jsonb` et la colonne `numeric` sont converties **en texte
 * PAR POSTGRESQL** (`::text`), jamais par JavaScript : c'est la seule façon de
 * comparer « au bit près » sans qu'un flottant IEEE754 ou une réécriture d'objet ne
 * s'interpose entre la base et l'assertion. `jsonb::text` est canonique (clés
 * ordonnées, espaces normalisés) : deux valeurs égales rendent la même chaîne, et
 * deux valeurs différentes ne peuvent pas rendre la même.
 */
interface LigneFigee {
  readonly id: string;
  readonly question_id: string;
  readonly question_version: number | null;
  readonly text_snapshot: string | null;
  readonly guidance_snapshot: string | null;
  readonly answer_type_snapshot: string | null;
  readonly options_snapshot: string | null;
  readonly weight_snapshot: string | null;
  readonly scoring_snapshot: string | null;
  readonly criticality_snapshot: string | null;
  readonly allow_range_snapshot: boolean | null;
  readonly position: number | null;
  readonly added_ad_hoc: boolean;
  /** Jointure de confort : le code de banque de la question pointée. */
  readonly code: string | null;
}

async function lireFigees(missionId: string): Promise<readonly LigneFigee[]> {
  const resultat = await bd().query<LigneFigee>(
    `SELECT mq.id,
            mq.question_id,
            mq.question_version,
            mq.text_snapshot,
            mq.guidance_snapshot,
            mq.answer_type_snapshot,
            mq.options_snapshot::text  AS options_snapshot,
            mq.weight_snapshot::text   AS weight_snapshot,
            mq.scoring_snapshot::text  AS scoring_snapshot,
            mq.criticality_snapshot,
            mq.allow_range_snapshot,
            mq.position,
            mq.added_ad_hoc,
            q.code
       FROM mission_questions mq
       JOIN questions q ON q.id = mq.question_id
      WHERE mq.mission_id = $1
      ORDER BY mq.position, mq.id`,
    [missionId],
  );
  return resultat.rows;
}

/** La ligne de banque, lue avec EXACTEMENT les mêmes conversions. */
interface LigneBanque {
  readonly version: number;
  readonly status: string;
  readonly text_fr: string;
  readonly guidance_fr: string | null;
  readonly answer_type: string;
  readonly options: string | null;
  readonly weight: string;
  readonly scoring: string | null;
  readonly criticality: string;
  readonly allow_range: boolean;
}

async function lireBanque(questionId: string): Promise<LigneBanque> {
  const resultat = await bd().query<LigneBanque>(
    `SELECT version, status, text_fr, guidance_fr, answer_type,
            options::text AS options, weight::text AS weight, scoring::text AS scoring,
            criticality, allow_range
       FROM questions WHERE id = $1`,
    [questionId],
  );
  const ligne = resultat.rows[0];
  if (ligne === undefined) throw new Error('question absente de la banque');
  return ligne;
}

async function compterFigees(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM mission_questions WHERE mission_id = $1',
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterBanque(): Promise<number> {
  const resultat = await bd().query<{ total: string }>('SELECT count(*) AS total FROM questions');
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterJournal(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM activity_log WHERE entity_id = $1',
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function dernierJournal(missionId: string): Promise<Date | null> {
  const resultat = await bd().query<{ created_at: Date }>(
    'SELECT created_at FROM activity_log WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1',
    [missionId],
  );
  return resultat.rows[0]?.created_at ?? null;
}

async function majMission(missionId: string): Promise<string | null> {
  const resultat = await bd().query<{ updated_at: Date; status: string }>(
    'SELECT updated_at, status FROM missions WHERE id = $1',
    [missionId],
  );
  const ligne = resultat.rows[0];
  return ligne === undefined ? null : `${ligne.updated_at.toISOString()}|${ligne.status}`;
}

/** Tout ce qu'une lecture ne doit PAS avoir touché. */
interface Photo {
  readonly figees: readonly LigneFigee[];
  readonly journal: number;
  readonly mission: string | null;
  readonly banque: number;
}

async function photographier(missionId: string): Promise<Photo> {
  return {
    figees: await lireFigees(missionId),
    journal: await compterJournal(missionId),
    mission: await majMission(missionId),
    banque: await compterBanque(),
  };
}

// -----------------------------------------------------------------------------
// RACCOURCIS DU SUJET — le figeage passe TOUJOURS par la route
// -----------------------------------------------------------------------------

/** HYPOTHÈSE H2 : corps vide. */
async function figer(missionId: string, jeton: string): Promise<Reponse> {
  return appeler('POST', urlFigeage(missionId), { jeton, charge: {} });
}

async function figerEtExiger201(missionId: string, jeton: string): Promise<number> {
  const reponse = await figer(missionId, jeton);
  expect(
    reponse.statut,
    'Le figeage a été refusé alors que la sélection n’est pas vide et que la mission\n' +
      `est en « preparation ». Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 600)}`,
  ).toBe(201);
  const analyse = figeageSchema.safeParse(JSON.parse(reponse.corps));
  expect(
    analyse.success,
    'La réponse du figeage ne porte pas `total`. C’est le seul chiffre que l’opérateur\n' +
      'voit après avoir confirmé l’écran de prévisualisation : sans lui, il ne peut pas\n' +
      `vérifier que ce qu’il a vu est ce qui a été figé. Corps :\n${reponse.corps.slice(0, 600)}`,
  ).toBe(true);
  return figeageSchema.parse(JSON.parse(reponse.corps)).total;
}

// -----------------------------------------------------------------------------
// LA GRAMMAIRE DES CAS D'ASSEMBLAGE
// -----------------------------------------------------------------------------
// Chaque famille de filtre déclare ses questions avec, pour CHACUNE, le verdict
// attendu — retenue ou écartée. Les REFUS sont donc dans la même table que les
// admissions : un filtre qui ne filtre plus rien se voit exactement comme un filtre
// qui filtre trop. C'est l'invariant 3 appliqué à la sélection.

interface CasQuestion {
  readonly code: string;
  readonly attendu: boolean;
  /** Pourquoi ce verdict — recopié dans le message d'échec. */
  readonly motif: string;
  readonly champs: Omit<SemisQuestion, 'blocId' | 'code'>;
}

function verifierSelection(
  cas: readonly CasQuestion[],
  lignes: readonly LigneFigee[],
  contexte: string,
): void {
  const presents = new Set(
    lignes.map((ligne) => ligne.code).filter((c): c is string => c !== null),
  );
  const manquants = cas
    .filter((c) => c.attendu && !presents.has(c.code))
    .map((c) => `${c.code} — ÉCARTÉE À TORT : ${c.motif}`);
  const enTrop = cas
    .filter((c) => !c.attendu && presents.has(c.code))
    .map((c) => `${c.code} — RETENUE À TORT : ${c.motif}`);

  expect(
    { manquants, enTrop },
    `${contexte}\n` +
      'Chaque ligne « ÉCARTÉE À TORT » est une question que le client ne se verra jamais\n' +
      'poser ; chaque ligne « RETENUE À TORT » est une question posée à quelqu’un qui n’a\n' +
      'aucune raison d’y répondre — et dont la non-réponse fera baisser la complétude.',
  ).toStrictEqual({ manquants: [], enTrop: [] });

  expect(
    lignes.length,
    'Le nombre de lignes figées ne correspond pas au nombre de questions attendues.\n' +
      'Une ligne EN PLUS sans code identifiable (doublon, question d’un autre bloc)\n' +
      'échapperait à la comparaison par code ci-dessus : elle se voit ici.',
  ).toBe(cas.filter((c) => c.attendu).length);
}

/** Sème une famille complète et rend les lignes figées. */
async function eprouverFamille(options: {
  readonly mission: MissionSemee;
  readonly blocId: string;
  readonly cas: readonly CasQuestion[];
  readonly jeton: string;
}): Promise<readonly LigneFigee[]> {
  for (const c of options.cas) {
    await semerQuestion({ blocId: options.blocId, code: c.code, ...c.champs });
  }
  await figerEtExiger201(options.mission.id, options.jeton);
  return lireFigees(options.mission.id);
}

// -----------------------------------------------------------------------------
// UUID v7 — vérifié SANS la bibliothèque qui les fabrique
// -----------------------------------------------------------------------------

/** Version d'un UUID : le 13ᵉ chiffre hexadécimal (`xxxxxxxx-xxxx-Vxxx-…`). */
function versionUuid(id: string): string {
  return id.slice(14, 15);
}

/** Variante RFC 4122 : le 17ᵉ chiffre doit être 8, 9, a ou b. */
function varianteUuid(id: string): string {
  return id.slice(19, 20).toLowerCase();
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l3d_questionnaire');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  // Le seed peuple `size_tiers` et `services` : sans eux, ni filtre de palier ni
  // filtre de paquet par fonction ne sont exprimables. Il ne peuple AUCUNE
  // `questions` (les fixtures de démonstration sont derrière `seed:demo`, jamais
  // jouées ici) : la banque de ce fichier est donc EXACTEMENT ce que ce fichier y
  // sème, et les comptes sont lisibles.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  const lignesPaliers = await bd().query<{ id: string; code: string }>(
    'SELECT id, code FROM size_tiers',
  );
  for (const ligne of lignesPaliers.rows) paliers.set(ligne.code, ligne.id);
  if (!paliers.has('pme')) throw new Error('le seed n’a pas posé les 4 paliers (11 §5)');

  const lignesServices = await bd().query<{ id: string; code: string }>(
    'SELECT id, code FROM services',
  );
  for (const ligne of lignesServices.rows) fonctions.set(ligne.code, ligne.id);
  if (!fonctions.has('logistique_operations')) {
    throw new Error('le seed n’a pas posé les 11 fonctions (11 §5, 03 §16.3)');
  }

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit être
  // posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = TTL_ACCES;
  process.env.JWT_REFRESH_TTL = TTL_RAFRAICHISSEMENT;
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// 0. LA BANQUE VIDE — AVANT TOUT SEMIS, ET C'EST POURQUOI CE BLOC EST PREMIER
// =============================================================================
// `questions` est une table GLOBALE : dès qu'un cas ci-dessous y sème une ligne,
// plus aucun test de ce fichier ne peut observer une banque vide (aucun cas ne
// supprime — le produit ne supprime jamais, et un test qui vide une table
// partagée invaliderait tous ses voisins). Le seed exécuté en `beforeAll` pose les
// paliers et les fonctions, jamais une question. Ce bloc est donc PREMIER, et il
// commence par PROUVER la précondition : déplacé plus bas, il rougit sur elle
// avant de rougir sur le sujet — un ordre, ici, est une hypothèse écrite.
describe('POST generate-questionnaire — sur une banque VIDE', () => {
  it('@critique aucune question exploitable : 409, la cause `banque_sans_question`, aucun filtre accusé', async () => {
    // Le refus « sélection vide » nomme d'ordinaire LE FILTRE qui a vidé
    // l'ensemble (c'est l'information actionnable). Quand la banque est vide, AUCUN
    // filtre n'est responsable : accuser « bloc actif » enverrait l'administrateur
    // corriger un cadrage qui n'a rien à se reprocher. Le message doit dire que la
    // banque ne contient rien, et le `code` machine doit permettre au front de
    // proposer l'IMPORT de la banque (L4) plutôt qu'un changement de cadrage.
    expect(
      await compterBanque(),
      'PRÉCONDITION : ce bloc doit s’exécuter AVANT tout semis de question. S’il\n' +
        'rougit ici, il a été déplacé — remettez-le en tête du fichier.',
    ).toBe(0);

    const admin = await creerCompte('admin', 'banque-vide');
    const bloc = await semerBloc(1);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    const refus = await figer(mission.id, admin.jeton);
    expect(refus.statut, `Attendu 409. Reçu : ${refus.corps.slice(0, 400)}`).toBe(409);
    expect(refus.code).toBe(ERROR_CODES.CONFLICT);
    const details = erreurSchema.parse(JSON.parse(refus.corps)).error.details ?? [];
    expect(
      details.map((detail) => detail.code),
      'la cause machine est « banque_sans_question », pas le nom d’un filtre',
    ).toContain('banque_sans_question');
    expect(refus.message, 'le message nomme la banque, pas un réglage de cadrage').toMatch(
      /banque/i,
    );
    expect(await compterFigees(mission.id), 'un refus n’écrit rien').toBe(0);
  });
});

// =============================================================================
// 1. L'ASSEMBLEUR M2 — UN CAS PAR FILTRE, REFUS COMPRIS
// =============================================================================
// 03 M2-1 : « Sélection = questions ACTIVES dont les étiquettes matchent (palier
// dans [min,max], secteur ∈ secteurs activés OU universelle, périmètre compatible,
// bloc actif) », complété par §16.3 (unités in_scope) et 01 §20.1 (niveau d'audit).
//
// L'observation se fait sur les LIGNES FIGÉES, pas sur la réponse de la
// prévisualisation : l'assemblage est ce qui finit en base, et la forme du DTO ne
// doit pouvoir ni masquer ni fabriquer une sélection.
describe('assembleur M2 — la sélection', () => {
  it('@critique le statut et l’origine : ni brouillon, ni version archivée, ni ad hoc', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui filtre sur `status = 'active'` en oubliant `origin = 'banque'` —
    // l'oubli le plus naturel du monde, puisque `origin` n'est pas une étiquette de
    // ciblage mais une provenance. Conséquence : la question ad hoc qu'un consultant
    // a créée sur UNE AUTRE mission (04 : `origin_mission_id`) entre dans le
    // questionnaire figé de celle-ci. Personne ne s'en apercevrait : elle est
    // `active`, elle a un bloc, elle a l'air d'une question de banque.
    // Et le symétrique : une version ARCHIVÉE retenue ferait figer un texte que la
    // banque a explicitement retiré — le contraire même de ce que le versionnement
    // du 04 protège.
    const admin = await creerCompte('admin', 'statut-origine');
    const bloc = await semerBloc(101);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-ST-ACTIVE',
        attendu: true,
        motif: 'active + origine banque : la seule combinaison admissible',
        champs: { status: 'active', origin: 'banque' },
      },
      {
        code: 'L3D-ST-BROUILLON',
        attendu: false,
        motif: 'statut `draft` — un brouillon n’est pas encore de la banque (M1.1)',
        champs: { status: 'draft', origin: 'banque' },
      },
      {
        code: 'L3D-ST-ARCHIVEE',
        attendu: false,
        motif: 'statut `archived` — la version retirée ne se fige plus (04)',
        champs: { status: 'archived', origin: 'banque' },
      },
      {
        code: 'L3D-ST-ADHOC',
        attendu: false,
        motif: 'origine `ad_hoc` — les ad hoc entrent par la sync (M2-5, L6), jamais par M2',
        champs: { status: 'active', origin: 'ad_hoc' },
      },
    ];

    const lignes = await eprouverFamille({
      mission,
      blocId: bloc.id,
      cas,
      jeton: admin.jeton,
    });
    verifierSelection(cas, lignes, 'Filtre STATUT / ORIGINE (M2-1, 04 versionnement).');
  });

  it('@critique le bloc actif : une question d’un bloc non retenu n’entre pas', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui compare `active_blocks` à des UUID de blocs alors que la colonne
    // porte des CODES (mesuré au seed, hypothèse H9) : la comparaison ne rend jamais
    // vrai, le filtre écarte tout, et la mission part en 409 « sélection vide » —
    // ou, pire, celle qui « replie » sur « aucun filtre » en cas de non-appariement
    // et fige les NEUF blocs du référentiel pour une mission qui en avait choisi un.
    const admin = await creerCompte('admin', 'bloc-actif');
    const blocRetenu = await semerBloc(102);
    const blocEcarte = await semerBloc(103);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [blocRetenu.code] });

    await semerQuestion({ blocId: blocRetenu.id, code: 'L3D-BL-DEDANS' });
    await semerQuestion({ blocId: blocEcarte.id, code: 'L3D-BL-DEHORS' });

    await figerEtExiger201(mission.id, admin.jeton);
    const codes = (await lireFigees(mission.id)).map((ligne) => ligne.code);

    expect(
      codes,
      'Le filtre de bloc ne tient pas. `active_blocks` porte les blocs QUE LE CADRAGE A\n' +
        'RETENUS : les ignorer transforme un audit ciblé en audit complet, avec des\n' +
        'dizaines de questions que personne n’a vendues ni prévues au calendrier.',
    ).toStrictEqual(['L3D-BL-DEDANS']);
  });

  it('@critique le palier : recouvrement d’intervalles, bornes NULL ouvertes, aux valeurs limites', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Deux, et elles sont l'une et l'autre parfaitement raisonnables à la lecture :
    //   · l'INCLUSION au lieu du RECOUVREMENT — exiger que [headcount_min,
    //     headcount_max] de la question CONTIENNE tout le palier. Une question
    //     étiquetée « 200 à 300 personnes » disparaîtrait alors du palier PME
    //     [11-249], alors qu'elle le concerne sur 50 personnes ;
    //   · les BORNES NULL traitées comme 0 ou comme l'infini par défaut de langage
    //     (`null` devient 0 en SQL implicite, `undefined` devient NaN en JS). Une
    //     question sans bornes — le cas le plus fréquent de la banque — serait alors
    //     écartée de tous les paliers, ou retenue dans tous.
    // Les couples 10/11 et 249/250 sont AUX BORNES du palier PME (11 §5) : c'est là,
    // et seulement là, qu'un `<` écrit pour un `<=` se voit.
    const admin = await creerCompte('admin', 'palier');
    const bloc = await semerBloc(104);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      palier: 'pme',
    });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-PA-SANS-BORNE',
        attendu: true,
        motif: 'deux bornes NULL = question universelle en taille',
        champs: { effectifMin: null, effectifMax: null },
      },
      {
        code: 'L3D-PA-CHEVAUCHE',
        attendu: true,
        motif: '[200,300] recouvre [11,249] sur [200,249]',
        champs: { effectifMin: 200, effectifMax: 300 },
      },
      {
        code: 'L3D-PA-TOUCHE-BAS',
        attendu: true,
        motif: '[1,11] touche la borne basse du palier — 11 est DANS le palier',
        champs: { effectifMin: 1, effectifMax: 11 },
      },
      {
        code: 'L3D-PA-TOUCHE-HAUT',
        attendu: true,
        motif: '[249,4999] touche la borne haute du palier — 249 est DANS le palier',
        champs: { effectifMin: 249, effectifMax: 4999 },
      },
      {
        code: 'L3D-PA-TROP-PETIT',
        attendu: false,
        motif: '[1,10] s’arrête AVANT le palier : aucun recouvrement',
        champs: { effectifMin: 1, effectifMax: 10 },
      },
      {
        code: 'L3D-PA-TROP-GRAND',
        attendu: false,
        motif: '[250,NULL] commence APRÈS le palier : aucun recouvrement',
        champs: { effectifMin: 250, effectifMax: null },
      },
      {
        code: 'L3D-PA-BORNE-BASSE-OUVERTE',
        attendu: true,
        motif: '[NULL,50] = « jusqu’à 50 » et recouvre [11,50]',
        champs: { effectifMin: null, effectifMax: 50 },
      },
      {
        code: 'L3D-PA-BORNE-BASSE-OUVERTE-COURTE',
        attendu: false,
        motif: '[NULL,10] = « jusqu’à 10 » : s’arrête juste avant le palier',
        champs: { effectifMin: null, effectifMax: 10 },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(
      cas,
      lignes,
      'Filtre PALIER (M2-1 « palier dans [min,max] », 11 §5 : PME = [11,249]).',
    );
  });

  it('@critique le secteur : universelle OU intersection, et la liste vide de la mission ne restreint rien', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui traite `sectors = []` comme « aucun secteur » plutôt que comme
    // « universelle ». Le 04 l'écrit noir sur blanc (« [] = universelle »), mais un
    // `sectors && sectors.some(...)` naïf écarte le tableau vide — et c'est LE SOCLE
    // de la banque (~150 questions, 11 §5) qui disparaît d'un coup. La mission serait
    // figée avec les seules questions sectorielles : un audit sans ses fondations.
    const admin = await creerCompte('admin', 'secteur');
    const bloc = await semerBloc(105);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      secteursActifs: ['industrie'],
    });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-SE-UNIVERSELLE',
        attendu: true,
        motif: '`sectors = []` — universelle (04, verbatim)',
        champs: { secteurs: [] },
      },
      {
        code: 'L3D-SE-INTERSECTION',
        attendu: true,
        motif: '[industrie, sante] ∩ [industrie] ≠ ∅',
        champs: { secteurs: ['industrie', 'sante'] },
      },
      {
        code: 'L3D-SE-DISJOINTE',
        attendu: false,
        motif: '[commerce] ∩ [industrie] = ∅',
        champs: { secteurs: ['commerce'] },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(cas, lignes, 'Filtre SECTEUR (M2-1, 04 « [] = universelle »).');
  });

  it('@critique le niveau d’audit : liste vide = tous niveaux, sinon appartenance', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui ignore `levels` — la colonne la plus facile à oublier, parce que le
    // §16.3 n'en parle pas et que M2 dit « périmètre compatible » sans la nommer.
    // Conséquence exacte : un « diagnostic de cadrage » (le niveau le plus léger,
    // 01 §20.1) recevrait les questions réservées au niveau « stratégique groupe »,
    // c'est-à-dire un questionnaire vendu court et livré long.
    const admin = await creerCompte('admin', 'niveau');
    const bloc = await semerBloc(106);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      niveau: 'operationnel',
    });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-NI-TOUS',
        attendu: true,
        motif: '`levels = []` — applicable à tous les niveaux',
        champs: { niveaux: [] },
      },
      {
        code: 'L3D-NI-EXACT',
        attendu: true,
        motif: '[operationnel] contient le niveau de la mission',
        champs: { niveaux: ['operationnel'] },
      },
      {
        code: 'L3D-NI-AUTRE',
        attendu: false,
        motif: '[strategique_groupe] ne contient pas le niveau de la mission',
        champs: { niveaux: ['strategique_groupe'] },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(cas, lignes, 'Filtre NIVEAU D’AUDIT (01 §20.1, trois niveaux).');
  });

  it('@critique la portée géographique : `tous` OU égalité stricte au périmètre de la mission', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui compare `geo` au `country_code` de la mission plutôt qu'à son
    // `geo_scope` : les deux colonnes existent au 04, elles sont voisines, et l'une
    // est presque toujours NULL. Le filtre deviendrait alors muet, et les questions
    // multi-pays (fiscalité de plusieurs juridictions, transferts hors UE) seraient
    // posées à une entreprise mono-site française.
    const admin = await creerCompte('admin', 'geo');
    const bloc = await semerBloc(107);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      geo: 'france',
    });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-GE-TOUS',
        attendu: true,
        motif: '`geo = tous` — défaut du 04, applicable partout',
        champs: { geo: 'tous' },
      },
      {
        code: 'L3D-GE-FRANCE',
        attendu: true,
        motif: '`geo = france` = `geo_scope` de la mission',
        champs: { geo: 'france' },
      },
      {
        code: 'L3D-GE-MULTI',
        attendu: false,
        motif: '`geo = multi_pays` sur une mission `france`',
        champs: { geo: 'multi_pays' },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(cas, lignes, 'Filtre GÉO (04 `questions.geo` vs `missions.geo_scope`).');
  });

  it('@critique les paquets par fonction : seules les unités `in_scope` ET `active` tirent leur paquet', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // C'EST ICI, ET NULLE PART AILLEURS, QUE VIT LA PHRASE DU §16.3.
    // ═══════════════════════════════════════════════════════════════════════════
    // « Les paquets logistique ne sont générés QUE SI l'arbre contient une unité
    // logistique. »
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Trois, par ordre de vraisemblance :
    //   · celle qui lit TOUTES les `org_units` de la mission sans filtrer
    //     `in_scope = true`. Or §25.1 est explicite : une unité sortie du périmètre
    //     garde ses données mais est EXCLUE du scoring et de la couverture. Tirer
    //     son paquet de 25-40 questions, c'est réintroduire par la fenêtre ce que le
    //     cadrage a sorti par la porte ;
    //   · celle qui oublie `status = 'active'` : une unité PROPOSÉE par le terrain
    //     (§25.3) — donc non encore qualifiée par le lead — déciderait seule de
    //     l'entrée d'un paquet entier dans le questionnaire figé ;
    //   · celle qui plante ou écarte tout quand une unité n'a pas de
    //     `service_ref_id` (le cas le plus courant : une racine, un établissement).
    const admin = await creerCompte('admin', 'services');
    const bloc = await semerBloc(108);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    await semerUnite({
      missionId: mission.id,
      nom: 'Unité factice ressources humaines',
      service: 'rh',
      position: 1,
    });
    await semerUnite({
      missionId: mission.id,
      nom: 'Unité factice sans fonction rattachée',
      service: null,
      position: 2,
    });
    await semerUnite({
      missionId: mission.id,
      nom: 'Unité factice hors périmètre',
      service: 'production',
      inScope: false,
      position: 3,
    });
    await semerUnite({
      missionId: mission.id,
      nom: 'Unité factice proposée par le terrain',
      service: 'logistique_operations',
      statut: 'proposee',
      position: 4,
    });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-SV-TRANSVERSE',
        attendu: true,
        motif: '`target_services = []` — transverse (§16.3, verbatim)',
        champs: { servicesCibles: [] },
      },
      {
        code: 'L3D-SV-PRESENTE',
        attendu: true,
        motif: 'paquet `rh` et l’arbre porte une unité RH active et in_scope',
        champs: { servicesCibles: ['rh'] },
      },
      {
        code: 'L3D-SV-HORS-PERIMETRE',
        attendu: false,
        motif: 'paquet `production` : l’unité existe mais elle est `in_scope = false` (§25.1)',
        champs: { servicesCibles: ['production'] },
      },
      {
        code: 'L3D-SV-UNITE-PROPOSEE',
        attendu: false,
        motif: 'paquet `logistique_operations` : l’unité est `proposee`, pas `active` (§25.3)',
        champs: { servicesCibles: ['logistique_operations'] },
      },
      {
        code: 'L3D-SV-ABSENTE',
        attendu: false,
        motif: 'paquet `juridique_conformite` : aucune unité de cette fonction dans l’arbre',
        champs: { servicesCibles: ['juridique_conformite'] },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(cas, lignes, 'Filtre PAQUETS PAR FONCTION (03 §16.3).');
  });

  it('@critique l’interlocuteur est une PROJECTION, pas un filtre — et il n’est pas capturé', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui lit la liste « palier × secteur × unités × niveau × INTERLOCUTEUR »
    // du §16.3 comme cinq filtres de même nature, et écarte donc toute question dont
    // `profiles` ne recoupe pas… rien du tout, puisqu'une MISSION n'a pas de profil.
    // Selon l'écriture, le résultat est soit « toutes les questions ciblées
    // disparaissent » (ne restent que les `profiles = []`), soit « le filtre est
    // toujours faux » et le questionnaire est vide. M2-3 est pourtant sans ambiguïté :
    // le questionnaire est PROJETÉ en parcours par profil, et l'ensemble figé est
    // l'UNION des parcours — la sélection du dirigeant n'exclut pas celle du salarié.
    const admin = await creerCompte('admin', 'profils');
    const bloc = await semerBloc(109);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    const cas: readonly CasQuestion[] = [
      {
        code: 'L3D-PR-TOUS',
        attendu: true,
        motif: '`profiles = []` — posée à tous les profils',
        champs: { profils: [] },
      },
      {
        code: 'L3D-PR-DIRIGEANT',
        attendu: true,
        motif: 'ciblée `dirigeant` : elle entre dans l’UNION des parcours (M2-3)',
        champs: { profils: ['dirigeant'] },
      },
      {
        code: 'L3D-PR-TERRAIN',
        attendu: true,
        motif: 'ciblée `salarie` + `technicien_operateur` : même raison',
        champs: { profils: ['salarie', 'technicien_operateur'] },
      },
    ];

    const lignes = await eprouverFamille({ mission, blocId: bloc.id, cas, jeton: admin.jeton });
    verifierSelection(cas, lignes, 'PROJECTION par interlocuteur (M2-3, §16.3).');

    // Et le corollaire : `profiles` n'est PAS une colonne de capture (04). La note
    // LOT_L3 §3.a le justifie — c'est du ROUTAGE, relu à la volée sur une ligne
    // immuable. Si un jour quelqu'un veut le figer, il devra amender le 04, donc
    // obtenir une signature. Ce cas rend cette contrainte visible.
    const colonnes = await bd().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'mission_questions' AND column_name LIKE '%profil%'`,
    );
    expect(
      colonnes.rows.map((ligne) => ligne.column_name),
      'Une colonne de profil est apparue sur `mission_questions`. Le 04 n’en porte\n' +
        'aucune, et en ajouter une EST une modification du fichier 04 (11 §8-2) : la\n' +
        'signature de Williams, pas une commodité d’implémentation.',
    ).toStrictEqual([]);
  });

  it('@critique un filtre qui ne rend RIEN interdit le figeage, et n’écrit pas une ligne', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // FIGER ZÉRO LIGNE SERAIT PIRE QU'ÉCHOUER, ET VOICI POURQUOI.
    // ═══════════════════════════════════════════════════════════════════════════
    // Il n'existe AUCUNE colonne « figé » : l'existence des lignes EST la preuve du
    // figeage (LOT_L3 §3.a). Une mission figée à zéro ligne est donc, pour tout le
    // reste du produit, INDISTINGUABLE d'une mission jamais figée. Deux conséquences
    // en cascade, l'une administrative et l'autre opérationnelle :
    //   · la condition `questionnaire_fige` du §32.2 resterait fausse, et personne ne
    //     comprendrait pourquoi la mission refuse de passer « en cours » alors que
    //     l'écran a affiché « figeage réussi » ;
    //   · au deuxième essai, le refus `QUESTIONNAIRE_ALREADY_FROZEN` ne se
    //     déclencherait pas (zéro ligne) — donc rien ne protègerait plus, et un
    //     figeage tardif écraserait le cadrage initial.
    // QUELLE IMPLÉMENTATION FAUSSE CE CAS ATTRAPE-T-IL ? Celle qui rend `201 {total:
    // 0}` parce que « la requête s'est bien passée ». C'est le réflexe REST correct
    // et la mauvaise réponse métier.
    const admin = await creerCompte('admin', 'selection-vide');
    const blocVide = await semerBloc(110);
    const blocPeuple = await semerBloc(111);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [blocVide.code] });

    // Le bloc peuplé n'est PAS actif : il existe pour que la base ne soit pas vide,
    // et que le 409 prouve le FILTRE et non l'absence de banque.
    await semerQuestion({ blocId: blocPeuple.id, code: 'L3D-VIDE-AILLEURS' });

    const reponse = await figer(mission.id, admin.jeton);

    expect(
      reponse.statut,
      'Une sélection totalement vide doit être REFUSÉE (brief L3D §3 : « figer zéro\n' +
        'ligne produirait une mission figée et vide, indistinguable d’une mission non\n' +
        `figée »). Réponse reçue : ${String(reponse.statut)} ${reponse.corps.slice(0, 500)}`,
    ).toBe(409);
    expect(reponse.code, 'Hypothèse H6 : le code générique du conflit.').toBe(ERROR_CODES.CONFLICT);
    expect(
      await compterFigees(mission.id),
      'Le refus a quand même écrit. Un refus qui écrit est le pire des deux mondes :\n' +
        'l’opérateur croit avoir échoué, la base croit avoir réussi.',
    ).toBe(0);
    expect(
      reponse.message,
      'Le message du refus doit être une phrase FRANÇAISE (invariant 5) : c’est un\n' +
        'écran d’administrateur en cadrage de mission, pas une trace de journal.',
    ).not.toBeNull();
  });

  it('une liste de blocs VIDE ne restreint rien — la mission reçoit le socle, jamais zéro question', async () => {
    // HYPOTHÈSE H9, seconde moitié (brief L3D §8-1). Ce n'est PAS un arbitrage du
    // pack : c'est une recommandation du brief d'implémentation, et elle est testée
    // comme telle. Elle est signalée au rapport pour que l'écart, s'il y en a un, se
    // discute plutôt qu'il ne se découvre.
    //
    // QUELLE IMPLÉMENTATION FAUSSE CE CAS ATTRAPE-T-IL ? Celle qui écrit
    // `WHERE blocks.code = ANY(active_blocks)` sans traiter le tableau vide : une
    // mission créée sans choix de blocs — le cas d'une saisie rapide — recevrait ZÉRO
    // question et partirait en 409, sans que le message dise « vous n'avez coché
    // aucun bloc ».
    const admin = await creerCompte('admin', 'blocs-vides');
    const blocA = await semerBloc(112);
    const blocB = await semerBloc(113);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [] });

    await semerQuestion({ blocId: blocA.id, code: 'L3D-TOUS-BLOCS-A' });
    await semerQuestion({ blocId: blocB.id, code: 'L3D-TOUS-BLOCS-B' });

    await figerEtExiger201(mission.id, admin.jeton);
    const codes = new Set((await lireFigees(mission.id)).map((ligne) => ligne.code));

    expect(
      [codes.has('L3D-TOUS-BLOCS-A'), codes.has('L3D-TOUS-BLOCS-B')],
      '`active_blocks = []` doit valoir « aucune restriction », et non « aucun bloc ».\n' +
        'Les deux questions viennent de DEUX blocs différents : leur présence simultanée\n' +
        'est la seule façon de distinguer « pas de filtre » d’un filtre qui aurait, par\n' +
        'hasard, retenu un bloc.',
    ).toStrictEqual([true, true]);
  });
});

// =============================================================================
// 2. L'ORDRE — LE GARDE-FOU DE TOUT LE RESTE
// =============================================================================
// `DECISIONS.md` 2026-09-01 : « position du bloc, code (les absents en dernier),
// identifiant ». Sans cet ordre, deux générations divergent et la capture fige
// l'une des deux au hasard.
describe('assembleur M2 — l’ordre est déterministe', () => {
  it('@critique l’ordre figé est (position du bloc, code NULLS LAST, identifiant) — vérifié à l’envers du semis', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI LES FIXTURES SONT SEMÉES DANS L'ORDRE INVERSE DE L'ORDRE ATTENDU
    // ═══════════════════════════════════════════════════════════════════════════
    // Parce qu'un `SELECT` sans `ORDER BY` rend, sur une petite table fraîchement
    // écrite, les lignes DANS L'ORDRE D'INSERTION — et qu'un test dont les fixtures
    // sont semées dans le bon ordre serait donc VERT sur une implémentation qui ne
    // trie pas du tout. Semer à l'envers est la seule mise en scène où l'absence de
    // tri se voit. Même raison pour le bloc : celui qui doit sortir en PREMIER
    // (position 10) est créé en SECOND.
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · le tri sans dernier départage (`ORDER BY position, code` seulement) : les
    //     deux questions à `code` NULL du même bloc sortent dans un ordre laissé au
    //     SGBD, qui change avec un VACUUM, un plan parallèle ou une restauration ;
    //   · le tri par `created_at` : deux questions importées dans la même
    //     transaction partagent la même valeur (`now()` est figé par transaction) ;
    //   · les NULL en tête (`ORDER BY code DESC`, ou un tri JavaScript où
    //     `undefined` remonte) : les questions non encore codées passeraient devant
    //     le socle.
    const admin = await creerCompte('admin', 'ordre');
    const blocSecond = await semerBloc(220);
    const blocPremier = await semerBloc(210);

    // Deux identifiants CHOISIS pour que l'ordre lexicographique soit connu, et
    // insérés à l'envers de cet ordre.
    const idHaut = '01999999-0000-7000-8000-00000000ff02';
    const idBas = '01999999-0000-7000-8000-00000000ff01';

    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [blocSecond.code, blocPremier.code],
    });

    // Semis À L'ENVERS de l'ordre attendu, systématiquement.
    await semerQuestion({ blocId: blocSecond.id, code: null, id: idHaut });
    await semerQuestion({ blocId: blocSecond.id, code: null, id: idBas });
    await semerQuestion({ blocId: blocPremier.id, code: null });
    await semerQuestion({ blocId: blocPremier.id, code: 'L3D-ORD-B' });
    await semerQuestion({ blocId: blocPremier.id, code: 'L3D-ORD-A' });

    await figerEtExiger201(mission.id, admin.jeton);
    const lignes = await lireFigees(mission.id);

    expect(
      lignes.map((ligne) => ligne.code),
      'L’ordre figé ne suit pas la règle arbitrée le 2026-09-01. Un ordre non\n' +
        'déterministe dans une CAPTURE est une dérive silencieuse : deux missions\n' +
        'identiques rendraient deux questionnaires numérotés différemment, et la\n' +
        '`position` — qui pilote la navigation terrain et l’export §36.3 — n’aurait plus\n' +
        'aucune signification stable.',
    ).toStrictEqual(['L3D-ORD-A', 'L3D-ORD-B', null, null, null]);

    // Le départage par identifiant, isolé : les deux dernières lignes appartiennent
    // au bloc de position 220 et n'ont pas de code.
    const idsDuSecondBloc = lignes.slice(3).map((ligne) => ligne.question_id);
    expect(
      idsDuSecondBloc,
      'Le dernier départage (par identifiant) manque. Sans lui, deux questions sans\n' +
        'code dans le même bloc sortent dans un ordre décidé par le SGBD — c’est-à-dire\n' +
        'un ordre qui peut changer sans qu’aucune donnée n’ait bougé.',
    ).toStrictEqual([idBas, idHaut]);

    expect(
      lignes.map((ligne) => ligne.position),
      '`position` doit être le rang 1..n dans cet ordre, TOUJOURS renseigné (04 + brief\n' +
        'L3D §4). Un `position` NULL rendrait l’écran terrain incapable de numéroter.',
    ).toStrictEqual([1, 2, 3, 4, 5]);
  });

  it('@critique deux générations sur les mêmes données rendent la MÊME liste, dans le MÊME ordre', async () => {
    // C'EST LE GARDE-FOU DE TOUT LE RESTE, et il ne peut pas être remplacé par le cas
    // précédent : celui-là vérifie l'ordre contre une règle écrite, celui-ci vérifie
    // la REPRODUCTIBILITÉ, qui est une propriété différente. Une implémentation peut
    // trier correctement ET rester non reproductible — il suffit qu'un `LIMIT` sans
    // `ORDER BY` intermédiaire, un `DISTINCT ON` ou une jointure qui duplique
    // s'intercale avant le tri final.
    //
    // Deux missions JUMELLES plutôt que deux appels sur la même mission : le figeage
    // est unique par construction (section 6), il n'y a donc pas d'autre façon
    // honnête de générer deux fois.
    const admin = await creerCompte('admin', 'reproductible');
    const bloc = await semerBloc(230);

    // Un jeu volontairement varié : codes, absence de code, filtres qui passent et
    // qui ne passent pas. Un jeu homogène rendrait la reproductibilité triviale.
    const semis: readonly SemisQuestion[] = [
      { blocId: bloc.id, code: 'L3D-REP-03', secteurs: [] },
      { blocId: bloc.id, code: 'L3D-REP-01', profils: ['dirigeant'] },
      { blocId: bloc.id, code: null },
      { blocId: bloc.id, code: 'L3D-REP-02', effectifMin: 11, effectifMax: 249 },
      { blocId: bloc.id, code: null },
      { blocId: bloc.id, code: 'L3D-REP-04', niveaux: ['operationnel'] },
    ];
    for (const question of semis) await semerQuestion(question);

    const premiere = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    const seconde = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    await figerEtExiger201(premiere.id, admin.jeton);
    await figerEtExiger201(seconde.id, admin.jeton);

    const empreinte = (lignes: readonly LigneFigee[]): readonly string[] =>
      lignes.map(
        (ligne) =>
          `${String(ligne.position)}·${ligne.question_id}·${String(ligne.question_version)}·${String(ligne.text_snapshot)}`,
      );

    expect(
      empreinte(await lireFigees(seconde.id)),
      'Deux missions strictement identiques ont produit deux questionnaires différents.\n' +
        'C’est LA dérive que ce lot existe pour empêcher : la capture fige alors l’une\n' +
        'des deux générations AU HASARD, et rien dans le produit ne dira jamais laquelle.',
    ).toStrictEqual(empreinte(await lireFigees(premiere.id)));
  });

  it('@critique deux prévisualisations successives rendent le MÊME corps, à l’octet', async () => {
    // Le pendant en LECTURE du cas précédent, et il attrape autre chose : une
    // sérialisation dont l'ordre des clés ou des éléments dépend d'un `Map`, d'un
    // `Set` ou d'un `GROUP BY` non trié. L'écran de §33.4 sert à CONFIRMER : deux
    // affichages successifs qui montrent le même questionnaire dans deux ordres
    // différents détruisent la confiance dans l'écran, sans qu'aucune donnée n'ait
    // bougé.
    const admin = await creerCompte('admin', 'previsualisation-stable');
    const bloc = await semerBloc(231);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (const code of ['L3D-PVS-B', 'L3D-PVS-A', 'L3D-PVS-C']) {
      await semerQuestion({ blocId: bloc.id, code });
    }

    const premiere = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    const seconde = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });

    expect(premiere.statut, `prévisualisation refusée : ${premiere.corps.slice(0, 400)}`).toBe(200);
    expect(
      seconde.corps,
      'Deux prévisualisations consécutives, aucune écriture entre les deux, et deux\n' +
        'corps différents. L’écran de confirmation §33.4 ne peut pas servir à confirmer\n' +
        'quelque chose qui change à chaque rafraîchissement.',
    ).toBe(premiere.corps);
  });
});

// =============================================================================
// 3. LA PRÉVISUALISATION §33.4 — ELLE MONTRE, ELLE N'ÉCRIT PAS
// =============================================================================
describe('GET questionnaire-preview (§33.4)', () => {
  it('@critique la prévisualisation n’écrit RIEN — la base est identique après', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui factorise « bien » : un service `assemblerEtFiger()` appelé par les
    // deux routes, la prévisualisation passant un drapeau `simulation: true` que le
    // dépôt oublie de transmettre à la transaction. L'écran afficherait alors le bon
    // total, ET la mission serait figée — l'utilisateur n'aurait plus jamais
    // l'occasion de dire non, et l'écran de confirmation serait devenu un écran
    // d'information sur un fait accompli.
    //
    // La photographie porte sur QUATRE choses, pas seulement sur `mission_questions` :
    // le journal (le brief L3D §9-6 interdit de journaliser une prévisualisation, qui
    // recopie des noms d'unités et des effectifs du client — 11 §2), la ligne de
    // mission (`updated_at`, `status`) et la taille de la banque. Ne regarder que la
    // table évidente laisserait passer les trois autres.
    const admin = await creerCompte('admin', 'previsualisation-lecture');
    const bloc = await semerBloc(300);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (const code of ['L3D-PV-01', 'L3D-PV-02', 'L3D-PV-03']) {
      await semerQuestion({ blocId: bloc.id, code });
    }

    const avant = await photographier(mission.id);
    const reponse = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    const vue = previsualisation(reponse);
    const apres = await photographier(mission.id);

    expect(vue.total, 'La prévisualisation doit montrer les trois questions assemblées.').toBe(3);
    expect(
      apres,
      'La prévisualisation a modifié la base. Les quatre points observés sont :\n' +
        '  · `mission_questions` — le figeage aurait eu lieu sans confirmation ;\n' +
        '  · `activity_log` — une prévisualisation journalisée déverse des noms d’unités\n' +
        '    et des effectifs du client dans les journaux (11 §2) ;\n' +
        '  · la ligne `missions` (updated_at, status) — un effet de bord sur le pilote ;\n' +
        '  · le nombre de `questions` — une prévisualisation ne crée pas de banque.',
    ).toStrictEqual(avant);
  });

  it('@critique la prévisualisation montre EXACTEMENT ce qui sera figé — même total, mêmes questions', async () => {
    // « Plus jamais de 240 questions découvertes après figeage » (§33.4, verbatim).
    // Cette phrase n'a de sens que si le nombre affiché AVANT est le nombre écrit
    // APRÈS. Deux chemins de code distincts — une requête pour l'écran, une autre
    // pour l'écriture — divergeront un jour, et ce jour-là personne ne le saura :
    // l'écart ne produit aucune erreur, seulement un écran qui a menti.
    const admin = await creerCompte('admin', 'previsualisation-fidele');
    const bloc = await semerBloc(301);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      secteursActifs: ['services'],
      palier: 'pme',
      niveau: 'operationnel',
    });
    // Un jeu où les filtres MORDENT : si les deux chemins divergent, ils divergent
    // sur les cas limites, pas sur les questions universelles.
    await semerQuestion({ blocId: bloc.id, code: 'L3D-FI-UNIV' });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-FI-SECTEUR', secteurs: ['services'] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-FI-HORS-SECTEUR', secteurs: ['sante'] });
    await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-FI-PALIER',
      effectifMin: 11,
      effectifMax: 249,
    });
    await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-FI-HORS-PALIER',
      effectifMin: 5000,
      effectifMax: null,
    });

    const vue = previsualisation(
      await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton }),
    );
    const totalFige = await figerEtExiger201(mission.id, admin.jeton);
    const lignes = await lireFigees(mission.id);

    expect(
      [vue.total, vue.questions.length, totalFige, lignes.length],
      'Le total prévisualisé, la longueur de la liste dépliable, le total rendu par le\n' +
        'figeage et le nombre de lignes réellement écrites doivent être UN SEUL ET MÊME\n' +
        'nombre. Toute divergence signifie que l’écran de confirmation §33.4 décrit autre\n' +
        'chose que ce qu’il fait confirmer.',
    ).toStrictEqual([3, 3, 3, 3]);
  });

  it('@critique la répartition par bloc et par interlocuteur est rendue — c’est ce que l’écran affiche', async () => {
    // HYPOTHÈSE H3 : ce cas, et lui seul, juge les noms `parBloc` et
    // `parInterlocuteur`. §33.4 les exige nommément (« total ET RÉPARTITION PAR BLOC
    // × INTERLOCUTEUR »), et un total sans répartition ne répond pas à la question
    // que l'écran pose : « d'où viennent ces 240 questions ? ».
    //
    // La mission est construite pour que TOUS ses blocs actifs portent des
    // questions : sinon, `parBloc` pourrait légitimement compter les blocs vides à
    // zéro, et la longueur attendue deviendrait ambiguë.
    const admin = await creerCompte('admin', 'repartitions');
    const blocA = await semerBloc(310);
    const blocB = await semerBloc(311);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [blocA.code, blocB.code],
    });
    await semerQuestion({ blocId: blocA.id, code: 'L3D-RE-A1', profils: ['dirigeant'] });
    await semerQuestion({ blocId: blocA.id, code: 'L3D-RE-A2', profils: [] });
    await semerQuestion({ blocId: blocB.id, code: 'L3D-RE-B1', profils: ['salarie'] });

    const reponse = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    previsualisation(reponse);

    const parBloc = tableauDe(reponse.corps, 'parBloc');
    const parInterlocuteur = tableauDe(reponse.corps, 'parInterlocuteur');

    expect(
      parBloc === null ? 'clé `parBloc` absente ou non tabulaire' : String(parBloc.length),
      'La répartition PAR BLOC manque. C’est la moitié de l’écran §33.4 : sans elle,\n' +
        'l’administrateur voit un total qu’il ne peut ni expliquer ni corriger — il ne\n' +
        'sait pas quel bloc décocher pour revenir à un questionnaire tenable.',
    ).toBe('2');

    expect(
      parInterlocuteur === null,
      'La répartition PAR INTERLOCUTEUR manque. §33.4 l’exige au même titre que la\n' +
        'répartition par bloc, et c’est elle qui dit combien de questions chaque profil\n' +
        'devra encaisser — donc si l’entretien tiendra dans le créneau prévu.',
    ).toBe(false);
    expect(
      parInterlocuteur === null ? 0 : parInterlocuteur.length,
      'La répartition par interlocuteur est VIDE alors que trois questions sont\n' +
        'assemblées. Un tableau vide n’est pas une répartition.',
    ).toBeGreaterThan(0);
  });

  it('un bloc actif SANS question produit un avertissement, et n’empêche pas le figeage', async () => {
    // Brief L3D §3 : « un bloc actif sans question n’est pas une erreur — c’est un
    // AVERTISSEMENT nommé dans la réponse, et le figeage continue ».
    //
    // QUELLE IMPLÉMENTATION FAUSSE CE CAS ATTRAPE-T-IL ? Les deux extrêmes : celle
    // qui refuse le figeage (un bloc de la banque encore vide bloquerait toutes les
    // missions), et celle qui se tait (l'administrateur croirait avoir couvert un
    // domaine que personne n’interrogera). L’avertissement est le seul point où
    // « la banque est incomplète » devient visible AVANT la mission.
    const admin = await creerCompte('admin', 'avertissement');
    const blocPeuple = await semerBloc(320);
    const blocVide = await semerBloc(321);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [blocPeuple.code, blocVide.code],
    });
    await semerQuestion({ blocId: blocPeuple.id, code: 'L3D-AV-01' });

    const reponse = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    previsualisation(reponse);
    const avertissements = tableauDe(reponse.corps, 'avertissements');

    expect(
      avertissements === null ? -1 : avertissements.length,
      'Aucun avertissement n’est rendu alors qu’un bloc actif ne porte AUCUNE question.\n' +
        'Attendu : une clé `avertissements` (tableau) portant au moins une entrée. Une\n' +
        'valeur -1 ci-dessous signifie que la clé est absente ou n’est pas un tableau.',
    ).toBeGreaterThan(0);

    // Et le figeage continue : l'avertissement n'est pas un refus.
    const total = await figerEtExiger201(mission.id, admin.jeton);
    expect(total, 'Le bloc vide ne doit pas empêcher le figeage du bloc peuplé.').toBe(1);
  });

  it('@critique la prévisualisation n’est PAS paginée — 55 questions sortent toutes', async () => {
    // `DECISIONS.md` 2026-08-29 : « La réponse n’est délibérément PAS paginée — la
    // prévisualisation est un tout, et la paginer viderait l’écran de son sens. »
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui réutilise `paginerParCurseur` (livré au L3a, et qui est LA bonne
    // pratique partout ailleurs — 11 §3 « keyset PARTOUT »). L'écran afficherait
    // alors 50 questions sur 240, silencieusement : exactement le défaut que §33.4
    // existe pour supprimer, reproduit par excès de conformité.
    //
    // 55 > la limite par défaut usuelle (50) : le seuil se franchit, il ne s'effleure
    // pas.
    const admin = await creerCompte('admin', 'volume');
    const bloc = await semerBloc(330);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (let rang = 1; rang <= 55; rang += 1) {
      await semerQuestion({ blocId: bloc.id, code: `L3D-VOL-${String(rang).padStart(2, '0')}` });
    }

    const vue = previsualisation(
      await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton }),
    );
    expect(
      [vue.total, vue.questions.length],
      'La prévisualisation a tronqué sa liste. `total` peut rester juste tout en\n' +
        'n’envoyant que la première page : c’est la forme la plus discrète du défaut,\n' +
        'parce que le chiffre affiché reste bon.',
    ).toStrictEqual([55, 55]);

    // Et un paramètre de pagination ne doit pas ouvrir une porte dérobée vers la
    // troncature. Les deux issues défendables sont admises — le refuser (schéma de
    // requête strict) ou l'ignorer — jamais la troisième : servir 10 lignes.
    const avecLimite = await appeler('GET', urlPrevisualisation(mission.id, '?limit=10'), {
      jeton: admin.jeton,
    });
    const tronque =
      avecLimite.statut === 200 && (tableauDe(avecLimite.corps, 'questions') ?? []).length !== 55;
    expect(
      tronque,
      'Un `?limit=` a tronqué la prévisualisation. Refuser le paramètre (400) ou\n' +
        'l’ignorer sont deux choix défendables ; obéir ne l’est pas, parce que rien à\n' +
        'l’écran ne dirait qu’il manque des questions.',
    ).toBe(false);
  });
});

// =============================================================================
// 4. LE FIGEAGE — LES HUIT COLONNES DE CAPTURE
// =============================================================================
describe('POST generate-questionnaire — la capture', () => {
  it('@critique les 8 colonnes `*_snapshot` sont copiées depuis la LIGNE DE BANQUE, telles quelles', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ? TROIS.
    // ═══════════════════════════════════════════════════════════════════════════
    //   1. LA CAPTURE PARTIELLE. Ne copier que `text_snapshot` et
    //      `options_snapshot` — les deux que M2-4 nomme (« copie version + texte »)
    //      — en laissant les six autres à NULL. Rien ne casse : les colonnes sont
    //      NULLABLES au 04. Le défaut se manifeste EN CLIENTÈLE, hors ligne, quand
    //      l'écran d'entretien n'a ni le type de saisie, ni les ancres de cotation
    //      §32.4 à afficher sous le curseur (§33.3) — c'est-à-dire au pire moment
    //      possible, et sans réseau pour aller les chercher ;
    //   2. LE POIDS ARRONDI. `weight` est un `numeric` : le pilote pg le rend en
    //      CHAÎNE. Le faire transiter par un `number` JavaScript perd les zéros
    //      significatifs et, sur des valeurs plus riches, la précision décimale.
    //      Un poids faux ne lève aucune erreur : il fausse tout le scoring §32.1 de
    //      la mission, en silence. La fixture porte `1.500` EXPRÈS ;
    //   3. LE PASSAGE PAR UN SCHÉMA ZOD STRICT. Faire transiter `options` ou
    //      `scoring` par un `strictObject` du contrat partagé REJETTERAIT une ligne
    //      de banque légitime portant une clé de plus — et une banque de questions
    //      administrée par des humains en portera. Les fixtures embarquent une clé
    //      inconnue EXPRÈS : si elle disparaît de la capture, un objet a été
    //      recomposé au lieu d'être copié.
    const admin = await creerCompte('admin', 'capture');
    const bloc = await semerBloc(400);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    const idChoix = await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-CAP-CHOIX',
      texte: 'Question factice à choix — texte de capture (libellé neutre).',
      guidance:
        'Ancres de cotation (§32.4) — 1 = aucun processus documenté · ' +
        '3 = documenté mais non appliqué · 5 = documenté, appliqué, mesuré.',
      answerType: 'single_choice',
      options: [
        { code: 'a', label: 'Option factice A', score: 5, cle_hors_contrat: 'valeur' },
        { code: 'b', label: 'Option factice B', score: 0 },
      ],
      poids: '1.500',
      scoring: { source: 'options', aggregate: 'max', cle_hors_contrat: true },
      criticality: 'bloquant',
      allowRange: false,
    });
    const idMontant = await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-CAP-MONTANT',
      texte: 'Question factice de montant — texte de capture (libellé neutre).',
      guidance: null,
      answerType: 'money',
      options: null,
      poids: '0',
      scoring: null,
      criticality: 'informatif',
      allowRange: true,
    });

    await figerEtExiger201(mission.id, admin.jeton);
    const lignes = await lireFigees(mission.id);
    expect(lignes.length, 'les deux questions doivent être figées').toBe(2);

    for (const questionId of [idChoix, idMontant]) {
      const source = await lireBanque(questionId);
      const ligne = lignes.find((candidate) => candidate.question_id === questionId);
      expect(ligne, `la question ${questionId} n’a pas été figée`).toBeDefined();
      if (ligne === undefined) continue;

      expect(
        {
          text_snapshot: ligne.text_snapshot,
          guidance_snapshot: ligne.guidance_snapshot,
          answer_type_snapshot: ligne.answer_type_snapshot,
          options_snapshot: ligne.options_snapshot,
          weight_snapshot: ligne.weight_snapshot,
          scoring_snapshot: ligne.scoring_snapshot,
          criticality_snapshot: ligne.criticality_snapshot,
          allow_range_snapshot: ligne.allow_range_snapshot,
          question_version: ligne.question_version,
        },
        `Les huit colonnes de capture de ${String(ligne.code)} ne reproduisent pas la ligne\n` +
          'de banque. Les valeurs comparées sont converties EN TEXTE PAR POSTGRESQL des\n' +
          'deux côtés : un écart ici est un écart réel, jamais un artefact de\n' +
          'sérialisation. Rappel du 04 : la mission doit être AUTONOME de la banque —\n' +
          'ce qui n’est pas capturé n’existera pas hors ligne.',
      ).toStrictEqual({
        text_snapshot: source.text_fr,
        guidance_snapshot: source.guidance_fr,
        answer_type_snapshot: source.answer_type,
        options_snapshot: source.options,
        weight_snapshot: source.weight,
        scoring_snapshot: source.scoring,
        criticality_snapshot: source.criticality,
        allow_range_snapshot: source.allow_range,
        question_version: source.version,
      });
    }

    // La clé hors contrat a survécu au voyage : la capture est une COPIE, pas une
    // recomposition à partir d'un DTO.
    const ligneChoix = lignes.find((ligne) => ligne.question_id === idChoix);
    expect(
      ligneChoix?.options_snapshot?.includes('cle_hors_contrat') ?? false,
      'La clé inconnue du contrat a disparu des options figées. Un objet a donc été\n' +
        'RECOMPOSÉ champ par champ, et non copié : le jour où la banque portera une clé\n' +
        'de plus (un score par palier, un libellé long), elle sera silencieusement\n' +
        'perdue au figeage.',
    ).toBe(true);
    expect(
      ligneChoix?.scoring_snapshot?.includes('cle_hors_contrat') ?? false,
      'Même défaut sur le barème. Le §32.1 fait du barème une donnée versionnée et\n' +
        'extensible : le figer à travers un schéma fermé le tronque.',
    ).toBe(true);
  });

  it('@critique chaque ligne figée porte un UUID v7 applicatif, `added_ad_hoc = false`, et une position 1..n', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui laisse PostgreSQL générer l'identifiant. C'est le geste par défaut
    // partout ailleurs dans le dépôt (`DEFAULT gen_random_uuid()` est toléré pour les
    // tables purement serveur, 11 §2) — mais `mission_questions` n'est PAS une table
    // purement serveur : la règle P1-4 du 04 la NOMME parmi les entités créables hors
    // ligne (question ad hoc, §36.4 + 11 §4). Un UUID v4 y casse l'ordonnancement
    // temporel et l'invariant 1, sans qu'aucune erreur ne soit jamais levée.
    // `added_ad_hoc` a la même nature : le laisser à sa valeur par défaut est correct
    // aujourd'hui, l'écrire explicitement à `false` reste ce que le brief demande, et
    // seule la lecture le dit.
    const admin = await creerCompte('admin', 'identifiants');
    const bloc = await semerBloc(401);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (const code of ['L3D-ID-01', 'L3D-ID-02', 'L3D-ID-03']) {
      await semerQuestion({ blocId: bloc.id, code });
    }

    await figerEtExiger201(mission.id, admin.jeton);
    const lignes = await lireFigees(mission.id);

    const versions = lignes.map((ligne) => versionUuid(ligne.id));
    expect(
      versions,
      'Une ligne figée porte un UUID qui n’est pas de version 7. La règle P1-4 du 04\n' +
        'vise nommément `mission_questions` : une question ad hoc créée hors ligne y\n' +
        'arrivera avec un identifiant fabriqué par le CLIENT, et deux familles d’UUID\n' +
        'dans la même table rendent l’ordonnancement par identifiant faux — donc le\n' +
        'départage de tri de la section 2 faux avec lui.',
    ).toStrictEqual(['7', '7', '7']);

    const variantes = lignes.map((ligne) => varianteUuid(ligne.id));
    expect(
      variantes.every((variante) => ['8', '9', 'a', 'b'].includes(variante)),
      `Variante RFC 4122 invalide : ${variantes.join(', ')}.`,
    ).toBe(true);

    expect(
      lignes.map((ligne) => ligne.added_ad_hoc),
      'Une ligne issue de M2 est marquée `added_ad_hoc = true`. Le drapeau distingue ce\n' +
        'que la banque a fourni de ce que le terrain a inventé (M1.1, file « à\n' +
        'qualifier ») : le brouiller rendrait la qualification de la banque impossible.',
    ).toStrictEqual([false, false, false]);

    expect(
      lignes.map((ligne) => ligne.position),
      'Les positions doivent être 1..n, contiguës et sans trou.',
    ).toStrictEqual([1, 2, 3]);
  });

  it('@critique le figeage n’est ouvert qu’en `preparation`, et le refus n’écrit rien', async () => {
    // HYPOTHÈSE H7. Brief L3D §8-10 : « sinon une mission `en_cours` verrait son
    // questionnaire réécrit sous les pieds du terrain ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui ne vérifie que l'absence de lignes figées. Une mission qui a démarré
    // sans questionnaire — parce qu'un administrateur a forcé, ou parce qu'un
    // correctif a nettoyé une table — pourrait alors être figée EN PLEINE COLLECTE.
    // Les réponses déjà saisies pointent des `mission_question_id` : elles
    // deviendraient orphelines, et l'unicité `answers(interview_id,
    // mission_question_id)` ne protège plus rien puisque les identifiants ont changé.
    const admin = await creerCompte('admin', 'statut-mission');
    const bloc = await semerBloc(402);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      statut: 'en_cours',
    });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-STM-01' });

    const reponse = await figer(mission.id, admin.jeton);

    expect(
      reponse.statut,
      `Une mission « en_cours » ne se fige pas. Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 400)}`,
    ).toBe(409);
    // Le pack ne tranche pas ENTRE ces deux codes (voir l'hypothèse H7) : les deux
    // sont admis, et l'ambiguïté est remontée au rapport plutôt que tranchée ici.
    // La SUBSTANCE, elle, ne se négocie pas — voir juste après.
    const codesAdmisIci: readonly string[] = [
      ERROR_CODES.CONFLICT,
      ERROR_CODES.ILLEGAL_STATE_TRANSITION,
    ];
    expect(
      codesAdmisIci.includes(reponse.code ?? ''),
      `Code inattendu : ${String(reponse.code)}. Attendu CONFLICT ou ILLEGAL_STATE_TRANSITION.`,
    ).toBe(true);
    expect(
      await compterFigees(mission.id),
      'Le refus a écrit. Sur une mission EN COURS, cela signifie un questionnaire\n' +
        'remplacé alors que des entretiens sont ouverts dessus.',
    ).toBe(0);
  });
});

// =============================================================================
// 5. LA PREUVE DE NON-DÉRIVE — LE CAS `@critique` CENTRAL DE L'INCRÉMENT
// =============================================================================
// `docs/conception/LOT_L3.md` §3.a, troisième temps, et `LOT_L3D_BRIEF.md` §4, où
// ce cas est écrit EN TOUTES LETTRES, en six étapes. Il est suivi ici pas à pas.
describe('non-dérive du figeage (LOT_L3 §3.a)', () => {
  it('@critique figer, muter la banque, relire : les captures sont identiques au bit près', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE SEUL CAS ATTRAPE-T-IL ?
    // ═══════════════════════════════════════════════════════════════════════════
    // CELLE QUI GARDE UNE RÉFÉRENCE AU LIEU D'UNE CAPTURE. Elle passe TOUS les
    // autres cas de ce fichier — les filtres, l'ordre, les totaux, la prévisualisation,
    // le refus de second figeage — et elle échoue ici, seule. Elle prend trois formes,
    // toutes défendables en revue de code :
    //   · `mission_questions` peuplée avec `question_id` seul, les `*_snapshot`
    //     laissés NULL, et une VUE (ou une jointure dans le dépôt de lecture) qui les
    //     « résout » à la lecture. Le code est plus court, il ne duplique rien, et
    //     c'est même ce qu'un réflexe de normalisation recommande ;
    //   · le pull terrain (§9.5) qui lit `questions` au lieu des snapshots « parce
    //     que c'est la même chose » ;
    //   · un `resync` involontaire : une tâche de fond, un `ON CONFLICT DO UPDATE`
    //     qui rafraîchit les captures « pour rester cohérent ».
    //
    // CE QUE COÛTE CE DÉFAUT, dit précisément : une mission livrée en janvier verrait
    // son rapport changer en mars parce qu'un rédacteur de banque a reformulé une
    // question. Le client aurait répondu à un texte, le rapport en citerait un autre,
    // et les réponses collectées seraient rattachées à un barème qu'elles n'ont jamais
    // rencontré. Aucune erreur ne serait levée, aucun test existant ne rougirait, et
    // la découverte se ferait en relecture client — c'est-à-dire au moment où la
    // confiance dans l'outil se joue entièrement.
    //
    // La mutation appliquée ci-dessous est celle que la banque subit RÉELLEMENT
    // (04 : « une NOUVELLE VERSION = une NOUVELLE LIGNE, l'ancienne passe
    // `archived` ») — pas une mutation de laboratoire.
    const admin = await creerCompte('admin', 'non-derive');
    const bloc = await semerBloc(500);
    // ÉTAPE 1 — semer SA PROPRE mission : la mission de démonstration a déjà ses
    // `mission_questions` et partirait en 409 (brief L3D §9-4).
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    const idV1 = await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-DERIVE-01',
      version: 1,
      status: 'active',
      texte: 'Texte T1 — version 1, celle que le client verra (libellé neutre).',
      guidance: 'Ancres v1 — 1 = jamais · 3 = parfois · 5 = systématiquement.',
      answerType: 'single_choice',
      options: [{ code: 'o1', label: 'Option v1', score: 1 }],
      poids: '1',
      scoring: { source: 'options', aggregate: 'max' },
      criticality: 'important',
      allowRange: false,
    });

    // ÉTAPE 2 — figer, puis mémoriser les huit colonnes TELLES QUELLES.
    await figerEtExiger201(mission.id, admin.jeton);
    const avant = await lireFigees(mission.id);
    expect(avant.length, 'une seule question devait être figée').toBe(1);
    const captureAvant = avant[0];
    if (captureAvant === undefined) throw new Error('capture absente');

    // ÉTAPE 3 — muter la banque COMME ELLE MUTE RÉELLEMENT.
    await bd().query("UPDATE questions SET status = 'archived' WHERE id = $1", [idV1]);
    const idV2 = await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-DERIVE-01',
      version: 2,
      status: 'active',
      texte: 'Texte T2 — version 2, reformulée après le figeage (libellé neutre).',
      guidance: 'Ancres v2 — 1 = absent · 3 = partiel · 5 = piloté.',
      answerType: 'scale_1_5',
      options: [{ code: 'o2', label: 'Option v2', score: 5 }],
      poids: '3',
      scoring: { map: 'identity' },
      criticality: 'bloquant',
      allowRange: true,
    });

    // ÉTAPE 4 — relire. Les trois assertions du brief, dans l'ordre.
    const apres = await lireFigees(mission.id);
    const captureApres = apres[0];
    if (captureApres === undefined) throw new Error('capture disparue après mutation de la banque');

    expect(
      {
        text_snapshot: captureApres.text_snapshot,
        guidance_snapshot: captureApres.guidance_snapshot,
        answer_type_snapshot: captureApres.answer_type_snapshot,
        options_snapshot: captureApres.options_snapshot,
        weight_snapshot: captureApres.weight_snapshot,
        scoring_snapshot: captureApres.scoring_snapshot,
        criticality_snapshot: captureApres.criticality_snapshot,
        allow_range_snapshot: captureApres.allow_range_snapshot,
      },
      'ASSERTION 1 — LA CAPTURE A DÉRIVÉ. Les huit colonnes figées ne sont plus celles\n' +
        'qui ont été écrites au figeage : la banque a bougé, et la mission a bougé avec\n' +
        'elle. C’est exactement ce que M2-4 interdit (« la banque peut évoluer ensuite\n' +
        'SANS TOUCHER aux missions en cours ») et ce que `resync-questionnaire` — une\n' +
        'route SÉPARÉE, admin, avec diff affiché (05 §8.3) — existe pour faire, sous\n' +
        'confirmation humaine. Voir l’en-tête de ce cas pour les trois formes que prend\n' +
        'ce défaut.',
    ).toStrictEqual({
      text_snapshot: captureAvant.text_snapshot,
      guidance_snapshot: captureAvant.guidance_snapshot,
      answer_type_snapshot: captureAvant.answer_type_snapshot,
      options_snapshot: captureAvant.options_snapshot,
      weight_snapshot: captureAvant.weight_snapshot,
      scoring_snapshot: captureAvant.scoring_snapshot,
      criticality_snapshot: captureAvant.criticality_snapshot,
      allow_range_snapshot: captureAvant.allow_range_snapshot,
    });

    expect(
      { question_id: captureApres.question_id, question_version: captureApres.question_version },
      'ASSERTION 2 — la ligne figée doit continuer de pointer la VERSION 1, désormais\n' +
        'archivée. Pointer la v2 « parce qu’elle est active » ferait perdre le lien avec\n' +
        'ce qui a été réellement demandé — et la ligne v1 existe précisément pour rester\n' +
        'pointable après son archivage (04).',
    ).toStrictEqual({ question_id: idV1, question_version: 1 });
    expect(idV2, 'la v2 doit exister, sinon la mutation n’a rien éprouvé').not.toBe(idV1);

    expect(
      apres.length,
      'ASSERTION 3 — la v2 est entrée d’elle-même dans le questionnaire figé. L’ajout\n' +
        'volontaire d’une nouvelle version est le rôle de `resync-questionnaire` (hors\n' +
        'lot), avec diff affiché et confirmation. Un ajout automatique ferait apparaître\n' +
        'des questions dans la PWA d’un auditeur en pleine mission.',
    ).toBe(1);

    // ÉTAPE 5 — le second appel refuse, ET NE TOUCHE À RIEN.
    const refus = await figer(mission.id, admin.jeton);
    expect(
      refus.statut,
      `Le second figeage doit être refusé : ${String(refus.statut)} ${refus.corps.slice(0, 400)}`,
    ).toBe(409);
    const encore = await lireFigees(mission.id);
    expect(
      encore,
      'Un refus qui écrit serait pire qu’un refus. Ici, le questionnaire de la mission\n' +
        'aurait été remplacé par la version 2 de la banque À L’OCCASION D’UN REFUS —\n' +
        'c’est-à-dire à l’occasion d’un double-clic.',
    ).toStrictEqual(apres);

    // ÉTAPE 6 — la mutation ILLÉGITIME (une modification EN PLACE de la ligne
    // pointée, que le 04 interdit et que L4/L9 doivent empêcher) ne se répare pas
    // toute seule, et surtout ne contamine pas la capture.
    await bd().query('UPDATE questions SET version = 9 WHERE id = $1', [idV1]);
    const apresCorruption = await lireFigees(mission.id);
    expect(
      apresCorruption,
      'Après une modification EN PLACE de la ligne de banque pointée — la seule chose\n' +
        'que le 04 interdise formellement (« JAMAIS de mutation en place ») — les lignes\n' +
        'figées ont bougé. Aucun chemin de code de ce lot ne doit ni suivre, ni réparer,\n' +
        'ni recopier : la capture est la mémoire de ce qui a été demandé, et une mémoire\n' +
        'qui se corrige toute seule n’est plus une mémoire.',
    ).toStrictEqual(apres);
  });
});

// =============================================================================
// 6. IDEMPOTENCE ET UNICITÉ DU FIGEAGE
// =============================================================================
describe('POST generate-questionnaire — refus du second figeage', () => {
  it('@critique le second appel rend 409 QUESTIONNAIRE_ALREADY_FROZEN, et porte le compte et la date', async () => {
    // `DECISIONS.md` 2026-08-29 : « le message doit porter LE COMPTE ET LA DATE,
    // seule façon pour l’opérateur de distinguer “mon ré-essai a abouti” de “ma
    // demande a échoué” » ; 2026-09-01 : la date se lit dans `activity_log`, faute de
    // colonne au 04.
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui rend un 409 nu. Le scénario est banal : l’écran met huit secondes à
    // assembler 240 questions, l’administrateur reclique, reçoit « conflit », et n’a
    // AUCUN moyen de savoir si son premier clic a marché. Il ira vérifier ailleurs —
    // ou, pire, supprimera pour recommencer.
    //
    // Le compte est SEPT : un chiffre isolé, qui ne peut pas apparaître par hasard
    // dans un horodatage ISO (tous les champs y sont à deux ou quatre chiffres).
    const admin = await creerCompte('admin', 'deja-fige');
    const bloc = await semerBloc(600);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (let rang = 1; rang <= 7; rang += 1) {
      await semerQuestion({ blocId: bloc.id, code: `L3D-DF-${String(rang).padStart(2, '0')}` });
    }

    const total = await figerEtExiger201(mission.id, admin.jeton);
    expect(total, 'sept questions doivent être figées').toBe(7);

    const refus = await figer(mission.id, admin.jeton);
    expect(refus.statut, `Attendu 409. Reçu : ${refus.corps.slice(0, 400)}`).toBe(409);
    expect(
      refus.code,
      'HYPOTHÈSE H5 — le code arbitré le 2026-08-29 est `QUESTIONNAIRE_ALREADY_FROZEN`,\n' +
        'et il est DISTINCT de `CONFLICT` par décision motivée : 05 §8.3 liste `generate`\n' +
        'et `resync` comme deux routes, et le front doit pouvoir proposer la seconde\n' +
        'quand la première refuse. Un conflit générique lui retire ce branchement.\n' +
        '⚠ Ce code n’était pas dans `ERROR_CODES` à la rédaction de ce test : il doit y\n' +
        'entrer, avec son statut 409 dans `HTTP_STATUS_BY_ERROR_CODE`.',
    ).toBe(CODE_DEJA_FIGE);

    // LE COMPTE — un « 7 » isolé, cherché dans tout le corps (message ou `details`).
    expect(
      /(^|\D)7(\D|$)/.test(refus.corps),
      `Le refus ne porte pas le COMPTE de questions déjà figées. Corps :\n${refus.corps.slice(0, 500)}`,
    ).toBe(true);

    // LA DATE — l'acte de figeage doit avoir laissé une trace, et le refus doit la
    // citer. Hypothèse H8 : la tolérance d'un jour couvre un rendu au fuseau de
    // mission sans rien concéder sur le fond.
    const trace = await dernierJournal(mission.id);
    expect(
      trace,
      'Aucune trace de l’acte de figeage dans `activity_log` pour cette mission. Or\n' +
        'l’arbitrage du 2026-09-01 fonde LA DATE DU REFUS sur cette table, faute de\n' +
        'colonne temporelle au 04 : sans trace, la date exigée par l’arbitrage du\n' +
        '2026-08-29 n’a nulle part où être lue.\n' +
        '⚠ `ACTIONS_JOURNAL` (packages/shared/src/journal.ts) est un catalogue FERMÉ qui\n' +
        'ne contient aucune action de figeage — le signaler est le rôle de ce test, pas\n' +
        'le corriger.',
    ).not.toBeNull();

    const dates = refus.corps.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    expect(
      dates.length,
      `Le refus ne porte AUCUNE date. Corps :\n${refus.corps.slice(0, 500)}`,
    ).toBeGreaterThan(0);
    if (trace !== null) {
      const jour = 24 * 60 * 60 * 1000;
      const proche = dates.some(
        (date) => Math.abs(new Date(`${date}T00:00:00Z`).getTime() - trace.getTime()) <= jour,
      );
      expect(
        proche,
        `La date portée par le refus (${dates.join(', ')}) ne correspond pas à l’acte de\n` +
          `figeage tracé (${trace.toISOString()}). Une date fausse est pire qu’une date\n` +
          'absente : l’opérateur conclura que son figeage date d’une autre session.',
      ).toBe(true);
    }
  });

  it('@critique le refus n’écrit RIEN — ni ligne, ni renumérotation, ni ligne de journal de plus', async () => {
    // Le complément indispensable du cas précédent. Un `DELETE` + `INSERT` « pour
    // être idempotent » rendrait un 409 parfaitement conforme APRÈS avoir remplacé le
    // questionnaire — et les `answers` déjà saisies pointeraient des
    // `mission_question_id` qui n’existent plus. Le 409 rassurerait pendant que la
    // donnée disparaît.
    //
    // Le journal est observé lui aussi : un refus n’est pas un acte, et journaliser
    // un double-clic comme un figeage rendrait la date du refus (cas précédent)
    // fausse au deuxième essai.
    const admin = await creerCompte('admin', 'refus-sans-ecriture');
    const bloc = await semerBloc(601);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (const code of ['L3D-RF-01', 'L3D-RF-02']) {
      await semerQuestion({ blocId: bloc.id, code });
    }

    await figerEtExiger201(mission.id, admin.jeton);
    const avant = await photographier(mission.id);

    await figer(mission.id, admin.jeton);
    await figer(mission.id, admin.jeton);

    expect(
      await photographier(mission.id),
      'Deux refus consécutifs ont modifié quelque chose. Les identifiants des lignes\n' +
        'figées sont observés eux aussi : un remplacement à l’identique (même contenu,\n' +
        'nouveaux identifiants) casserait toutes les `answers` déjà collectées sans\n' +
        'qu’aucun contenu ne change — le défaut le plus difficile à diagnostiquer qui\n' +
        'soit.',
    ).toStrictEqual(avant);
  });

  it('@critique deux figeages SIMULTANÉS : un seul aboutit, et il n’y a qu’un jeu de lignes', async () => {
    // LOT_L3 §3.a : « transaction + SELECT … FOR UPDATE sur la mission ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui vérifie l’absence de lignes AVANT d’ouvrir la transaction — le
    // « check-then-act », qui est correct dans 99,9 % des exécutions et faux dans le
    // cas qui arrive vraiment : le double-clic. Les deux requêtes lisent zéro, les
    // deux insèrent, et la mission se retrouve avec DEUX exemplaires de chaque
    // question. Le terrain les verrait toutes, l’unicité `answers(interview_id,
    // mission_question_id)` ne l’empêcherait pas (les identifiants diffèrent), et le
    // scoring compterait deux fois chaque bloc.
    const admin = await creerCompte('admin', 'concurrence');
    const bloc = await semerBloc(602);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    for (const code of ['L3D-CC-01', 'L3D-CC-02', 'L3D-CC-03']) {
      await semerQuestion({ blocId: bloc.id, code });
    }

    const [premiere, seconde] = await Promise.all([
      figer(mission.id, admin.jeton),
      figer(mission.id, admin.jeton),
    ]);

    const statuts = [premiere.statut, seconde.statut].sort((a, b) => a - b);
    expect(
      statuts,
      'Deux figeages simultanés doivent donner EXACTEMENT un 201 et un 409. Deux 201\n' +
        'signifient que la sérialisation manque ; deux 409 qu’aucun n’a abouti (le\n' +
        `verrou refuse au lieu d’attendre).\nCorps : ${premiere.corps.slice(0, 200)} | ${seconde.corps.slice(0, 200)}`,
    ).toStrictEqual([201, 409]);

    expect(
      await compterFigees(mission.id),
      'Le nombre de lignes figées trahit un double figeage : trois questions assemblées,\n' +
        'donc trois lignes — jamais six.',
    ).toBe(3);
  });
});

// =============================================================================
// 7. GARDE STATIQUE — AUCUN CHEMIN DE CODE N'ÉCRIT SUR UNE CAPTURE
// =============================================================================
// Brief L3D §4, temps (2) : « aucun chemin de code L3 n'émet d'UPDATE sur une
// colonne `*_snapshot` (le seul écrivain légitime, `resync`, est hors lot) ».
// Le test dynamique de la section 5 prouve que la capture n'a pas bougé PENDANT LE
// SCÉNARIO ÉPROUVÉ ; ce garde-ci prouve qu'aucun chemin, même non emprunté par les
// tests, ne peut la faire bouger. Les deux ne se remplacent pas.
//
// ⚠ IL EST TEXTUEL, ET IL LE DIT : voir « CE QUE CE FICHIER NE PROUVE PAS ».
describe('garde statique — `mission_questions` ne se met jamais à jour en L3', () => {
  const EXTENSIONS = ['.ts', '.mts', '.mjs', '.js', '.sql'];
  const IGNORES = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo', '.vite']);

  /** Vide les commentaires sans déplacer les numéros de ligne. */
  function retirerCommentaires(contenu: string): string {
    return contenu
      .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
      .split('\n')
      .map((ligne) => {
        const ligneSql = ligne.indexOf('--');
        const ligneTs = ligne.indexOf('//');
        const coupe = [ligneSql, ligneTs].filter((index) => index >= 0).sort((a, b) => a - b)[0];
        return coupe === undefined ? ligne : ligne.slice(0, coupe);
      })
      .join('\n');
  }

  function fichiers(racine: string): readonly string[] {
    const trouves: string[] = [];
    const parcourir = (dossier: string): void => {
      for (const entree of readdirSync(dossier)) {
        if (IGNORES.has(entree)) continue;
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) {
          parcourir(chemin);
        } else if (EXTENSIONS.some((extension) => entree.endsWith(extension))) {
          trouves.push(chemin);
        }
      }
    };
    parcourir(racine);
    return trouves;
  }

  it('@critique aucune source de `apps/api/src` n’émet un UPDATE, un DELETE ou un TRUNCATE sur `mission_questions`', () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui rend le figeage « rejouable » : `DELETE FROM mission_questions WHERE
    // mission_id = $1` puis réinsertion. C'est le geste le plus naturel pour rendre
    // une opération idempotente, et il transforme `generate` en `resync` silencieux —
    // sans diff, sans confirmation, sans trace. Le cas dynamique de la section 6 ne
    // l'attrape que si le refus 409 est correctement placé AVANT ; ici, il est
    // attrapé même si le chemin n'est jamais emprunté par un test.
    //
    // Les quatre motifs cherchés sont des DÉBUTS D'INSTRUCTION : un `ON CONFLICT DO
    // UPDATE` (l'upsert d'une question ad hoc, L6) ne les déclenche pas. C'est
    // délibéré — cet upsert est légitime et il arrivera.
    const motifs: readonly { readonly nom: string; readonly motif: RegExp }[] = [
      { nom: 'UPDATE mission_questions', motif: /\bUPDATE\s+mission_questions\b/i },
      { nom: 'DELETE FROM mission_questions', motif: /\bDELETE\s+FROM\s+mission_questions\b/i },
      {
        nom: 'TRUNCATE mission_questions',
        motif: /\bTRUNCATE\s+(?:TABLE\s+)?mission_questions\b/i,
      },
      { nom: '.update(missionQuestions)', motif: /\.\s*update\s*\(\s*missionQuestions\b/ },
      { nom: '.delete(missionQuestions)', motif: /\.\s*delete\s*\(\s*missionQuestions\b/ },
    ];

    const infractions: string[] = [];
    for (const chemin of fichiers(join(RACINE_API, 'src'))) {
      const lignes = retirerCommentaires(readFileSync(chemin, 'utf8')).split('\n');
      lignes.forEach((ligne, index) => {
        for (const { nom, motif } of motifs) {
          if (motif.test(ligne)) {
            const relatif = relative(RACINE_DEPOT, chemin).split(sep).join('/');
            infractions.push(`${relatif}:${String(index + 1)} — ${nom}`);
          }
        }
      });
    }

    expect(
      infractions,
      'Un chemin de code écrit sur `mission_questions` après sa création. En L3, il n’en\n' +
        'existe AUCUN de légitime : le seul écrivain prévu par le pack est\n' +
        '`resync-questionnaire` (05 §8.3), qui est hors de ce lot et qui, lui, affichera\n' +
        'un diff et demandera confirmation. Si ce lot en a besoin, ce n’est plus un\n' +
        'figeage.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 8. RBAC SERVEUR — LA MATRICE RÔLE × ROUTE, REFUS COMPRIS (invariant 3)
// =============================================================================
// « RBAC serveur systématique. » Un droit non testé est un droit non tenu — et un
// REFUS non testé est un refus qu'on découvre absent en recette.
//
// CE QUE LE PACK TRANCHE, et donc ce qui est asséré SANS AUCUNE CELLULE AMBIGUË :
// les deux routes sont `roles: ['admin']` (brief L3D §7, sur 03 §34.1 « Décision
// V1 : la console est ADMIN SEUL »). Contrairement aux routes d'unités du L3c, il
// n'y a ici aucun pouvoir de LEAD à arbitrer : le §34.1 place le cadrage de mission
// dans l'espace admin, et le §18.3 réserve la préparation à la console. Le membre
// de mission et le lead sont donc éprouvés comme REFUSÉS, pas comme ambigus.
describe('RBAC des routes du questionnaire (invariant 3)', () => {
  it('@critique matrice rôle × route : six sujets × deux routes, chaque refus tenu et sans effet de bord', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui déclare `{type: 'mission'}` au lieu de `{type: 'roles', roles:
    // ['admin']}` sur la prévisualisation — un choix qui a l'air PLUS restrictif
    // (« seuls les membres de la mission ») alors qu'il est plus large : tout
    // consultant affecté verrait, avant même le démarrage, l'intégralité du
    // questionnaire assemblé. Or §33.4 est un écran de CADRAGE, et §34.1 met le
    // cadrage chez l'admin.
    //
    // Le second défaut attrapé est plus grossier et plus fréquent : la route de
    // figeage protégée, la route de prévisualisation oubliée — parce qu'« elle ne
    // fait que lire ». Elle laisse pourtant sortir la totalité des textes de
    // questions de la banque, filtrés pour un client nommé.
    const admin = await creerCompte('admin', 'rbac-admin');
    const bloc = await semerBloc(800);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });

    // Le texte de la question est une SENTINELLE DE FUITE : sa présence dans une
    // réponse signifierait qu'un porteur refusé a lu le questionnaire.
    const sentinelleTexte = 'TexteFactice sentinelle de fuite RBAC L3d';
    await semerQuestion({ blocId: bloc.id, code: 'L3D-RBAC-01', texte: sentinelleTexte });

    const consultantMembre = await creerCompte('consultant', 'rbac-membre');
    await bd().query(
      `INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, 'consultant')`,
      [mission.id, consultantMembre.id],
    );
    const leadMembre = await creerCompte('consultant', 'rbac-lead');
    await bd().query(
      `INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, 'lead')`,
      [mission.id, leadMembre.id],
    );

    const routes = [
      {
        gabarit: 'GET /v1/missions/:id/questionnaire-preview',
        methode: 'GET' as const,
        url: urlPrevisualisation(mission.id),
      },
      {
        gabarit: 'POST /v1/missions/:id/generate-questionnaire',
        methode: 'POST' as const,
        url: urlFigeage(mission.id),
        charge: {},
      },
    ];

    const sujets: readonly { readonly nom: string; readonly jeton: string | undefined }[] = [
      { nom: 'anonyme', jeton: undefined },
      { nom: 'consultant hors mission', jeton: (await creerCompte('consultant', 'rbac-h1')).jeton },
      { nom: 'analyste hors mission', jeton: (await creerCompte('analyste', 'rbac-h2')).jeton },
      { nom: 'lecteur hors mission', jeton: (await creerCompte('lecteur', 'rbac-h3')).jeton },
      { nom: 'consultant MEMBRE de la mission', jeton: consultantMembre.jeton },
      { nom: 'lead de la mission', jeton: leadMembre.jeton },
    ];

    const manquements: string[] = [];
    const fuites: string[] = [];
    let cellules = 0;

    for (const sujet of sujets) {
      for (const route of routes) {
        cellules += 1;
        const reponse = await appeler(route.methode, route.url, {
          ...(sujet.jeton === undefined ? {} : { jeton: sujet.jeton }),
          ...('charge' in route ? { charge: route.charge } : {}),
        });

        if (sujet.jeton === undefined) {
          if (reponse.statut !== 401 || reponse.code !== ERROR_CODES.UNAUTHENTICATED) {
            manquements.push(
              `${sujet.nom} → ${route.gabarit} : ${String(reponse.statut)} ${String(reponse.code)} (attendu 401 UNAUTHENTICATED)`,
            );
          }
        } else if (![403, 404].includes(reponse.statut)) {
          // 403 (le rôle ne suffit pas) et 404 (la mission n'existe pas POUR CE
          // PORTEUR) sont les deux formes défendables du refus. Un 2xx ne l'est pas,
          // et un 5xx non plus : il signifierait que le refus vient d'un plantage et
          // non d'une politique.
          manquements.push(
            `${sujet.nom} → ${route.gabarit} : ${String(reponse.statut)} ${String(reponse.code)} (attendu 403 ou 404)`,
          );
        }

        if (reponse.corps.includes(sentinelleTexte)) {
          fuites.push(`${sujet.nom} → ${route.gabarit}`);
        }
      }
    }

    expect(
      manquements,
      'Un refus attendu n’a pas été tenu. Chaque ligne est un droit que le pack ne donne\n' +
        'pas et que le code accorde — ou un plantage déguisé en refus.',
    ).toStrictEqual([]);

    expect(
      fuites,
      'Le TEXTE d’une question est sorti dans la réponse d’un porteur refusé. Un refus\n' +
        'qui décrit ce qu’il refuse n’est pas un refus — et la banque de questions est\n' +
        'la propriété intellectuelle centrale du produit (E10).',
    ).toStrictEqual([]);

    expect(
      await compterFigees(mission.id),
      'Une route refusée a figé le questionnaire. Un refus qui écrit d’abord et refuse\n' +
        'ensuite laisse une mission figée par quelqu’un qui n’en avait pas le droit, et\n' +
        'le figeage est IRRÉVERSIBLE en L3 (aucune route ne défige).',
    ).toBe(0);

    expect(
      cellules,
      'Le nombre de cellules réellement éprouvées est lui-même asséré : sans cela, on\n' +
        'désarmerait la matrice en retirant un sujet ou une route, et elle resterait\n' +
        'verte en n’exigeant plus rien. Six sujets × deux routes.',
    ).toBe(12);
  });

  it('@critique contre-épreuve : l’administrateur passe sur les DEUX routes', async () => {
    // SANS CE TEST, LA MATRICE CI-DESSUS EST VERTE POUR UNE API QUI REFUSE TOUT — y
    // compris à l'administrateur, c'est-à-dire pour une API inutilisable. C'est la
    // forme de vert la plus trompeuse qui soit : tous les refus sont tenus.
    const admin = await creerCompte('admin', 'contre-epreuve');
    const bloc = await semerBloc(801);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-CE-01' });

    const vue = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    expect(vue.statut, `prévisualisation refusée à l’admin : ${vue.corps.slice(0, 400)}`).toBe(200);

    const figeage = await figer(mission.id, admin.jeton);
    expect(figeage.statut, `figeage refusé à l’admin : ${figeage.corps.slice(0, 400)}`).toBe(201);
  });

  it('@critique une mission inconnue ou supprimée rend 404 sur les deux routes', async () => {
    // Le filtre `deleted_at IS NULL` doit exister PARTOUT dès maintenant : le jour où
    // une suppression existera, une mission supprimée dont on pourrait encore figer
    // le questionnaire ne se remarquerait pas avant de reparaître dans un tableau de
    // bord. Et le 404 sur mission inconnue est ce qui empêche d'énumérer les missions
    // par différence de codes d'erreur.
    const admin = await creerCompte('admin', 'introuvable');
    const inconnue = uuidv7();

    for (const reponse of [
      await appeler('GET', urlPrevisualisation(inconnue), { jeton: admin.jeton }),
      await figer(inconnue, admin.jeton),
    ]) {
      expect(reponse.statut, `mission inconnue : ${reponse.corps.slice(0, 300)}`).toBe(404);
      expect(reponse.code).toBe(ERROR_CODES.NOT_FOUND);
    }

    const bloc = await semerBloc(802);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-SUP-01' });
    await bd().query('UPDATE missions SET deleted_at = now() WHERE id = $1', [mission.id]);

    for (const reponse of [
      await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton }),
      await figer(mission.id, admin.jeton),
    ]) {
      expect(
        reponse.statut,
        'Une mission supprimée doit rendre 404 — pas 403, qui apprendrait qu’elle a\n' +
          `existé. Corps : ${reponse.corps.slice(0, 300)}`,
      ).toBe(404);
    }
    expect(
      await compterFigees(mission.id),
      'Le questionnaire d’une mission supprimée a été figé.',
    ).toBe(0);
  });

  it('un identifiant de mission mal formé est refusé en validation, jamais en 500', async () => {
    // 11 §3 : chaque route déclare son schéma Zod in/out. Un `:id` non-UUID atteignant
    // le dépôt produit une erreur PostgreSQL 22P02 traduite en 500 — c'est-à-dire un
    // défaut de l'utilisateur présenté comme un défaut du serveur, et une trace
    // d'erreur de plus dans les journaux à chaque robot d'exploration.
    const admin = await creerCompte('admin', 'uuid-invalide');
    for (const reponse of [
      await appeler('GET', urlPrevisualisation('pas-un-uuid'), { jeton: admin.jeton }),
      await appeler('POST', urlFigeage('pas-un-uuid'), { jeton: admin.jeton, charge: {} }),
    ]) {
      expect(reponse.statut, `Corps : ${reponse.corps.slice(0, 300)}`).toBe(400);
      expect(reponse.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(
        reponse.message,
        'Le message de validation doit être en FRANÇAIS (invariant 5, locale `fr` de Zod\n' +
          'posée dans `packages/shared/src/errors.ts`).',
      ).not.toBeNull();
    }
  });
});

// =============================================================================
// 9. ÉTANCHÉITÉ FINANCIÈRE — INVARIANT 3, E21, E33
// =============================================================================
// « Données financières : routes ADMIN EXCLUSIVEMENT » (invariant 3) · 03 §18.3 :
// l'auditeur ne voit jamais le TJM · 03 §34.1 : l'espace « Chiffrage & devis » est
// admin SEUL.
describe('étanchéité financière des routes du questionnaire', () => {
  /** Sème un cadrage RATTACHÉ à la mission — la jointure tentante. */
  async function semerCadrageSentinelle(
    missionId: string,
    entrepriseId: string,
    adminId: string,
  ): Promise<void> {
    const cadrage = uuidv7();
    await bd().query(
      `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                      calendar_days, status, created_by)
       VALUES ($1, $2, $3, 12, 2, 30, 'brouillon', $4)`,
      [cadrage, entrepriseId, missionId, adminId],
    );
    // Le volet chiffré passe par L'UNIQUE PORTE de test prévue à cet effet
    // (`aide/sentinelle-financiere.ts`, seul fichier de la liste blanche à pouvoir
    // nommer la table). Un `INSERT` écrit ici ouvrirait une seconde porte — c'est
    // exactement ce que la ceinture de balayage des sources a dénoncé le 2026-08-31,
    // à raison : la garantie « une seule porte » vaut ce que vaut le chemin le plus
    // laxiste.
    await semerVoletFinancierSentinelle(bd(), cadrage, adminId);
  }

  it('@critique ni la prévisualisation ni le figeage ne laissent sortir un montant — pas même à un ADMIN', async () => {
    // POURQUOI ÉPROUVER L'ADMINISTRATEUR, QUI A POURTANT LE DROIT DE VOIR L'ARGENT ?
    // Parce que la question n'est pas « qui a le droit » mais « par quelle porte ».
    // Le cadrage semé porte `mission_id` : la jointure est à portée d'un `LEFT JOIN`
    // depuis n'importe quelle route `/v1/missions/:id/*`, ce qui rend le piège RÉEL
    // et non théorique. Et une jointure écrite pour l'admin devient la ligne que le
    // prochain élargissement de rôle emportera avec lui — c'est ainsi que
    // l'étanchéité se perd, un cran à la fois, sans qu'aucun test ne rougisse.
    const admin = await creerCompte('admin', 'financier');
    const bloc = await semerBloc(900);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-FIN-01' });
    await semerCadrageSentinelle(mission.id, mission.entrepriseId, admin.id);

    const vue = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    const figeage = await figer(mission.id, admin.jeton);
    const refus = await figer(mission.id, admin.jeton);

    const corpus = [vue.corps, figeage.corps, refus.corps].join('\n');

    expect(
      VALEURS_SENTINELLES.filter((valeur) => corpus.includes(valeur)),
      'Un montant est sorti par une route du questionnaire. Ces valeurs sont des\n' +
        'sentinelles improbables : leur présence ne peut pas être une coïncidence, c’est\n' +
        'une jointure.',
    ).toStrictEqual([]);

    expect(
      NOMS_FINANCIERS_INTERDITS.filter((champ) => corpus.includes(champ)),
      'Le NOM d’un champ financier apparaît dans une réponse du questionnaire. Même à\n' +
        '`null`, il annonce que la jointure existe — et un champ qui existe finit par\n' +
        'être rempli.',
    ).toStrictEqual([]);
  });

  it('@critique balayage sentinelle : aucune route ne laisse sortir un montant à un non-administrateur', async () => {
    // Le balayage appelle TOUTES les routes du registre — pas celles auxquelles on a
    // pensé, CELLES QUI EXISTENT. Une route ajoutée demain y entre d'elle-même.
    //
    // La cartographie est construite DEPUIS LE REGISTRE : le nom du paramètre (`:id`,
    // `:missionId`…) est celui que l'implémenteur a choisi, et le test ne le devine
    // pas. La VALEUR, elle, est une mission RÉELLEMENT semée — jamais un UUID de
    // complaisance, qui rendrait 404 partout et ferait un balayage vert pour n'avoir
    // rien traversé (brief L3D §9-3, défaut corrigé le 2026-08-31 et à ne pas
    // recréer).
    const admin = await creerCompte('admin', 'balayage');
    const bloc = await semerBloc(901);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-BAL-01' });
    await semerCadrageSentinelle(mission.id, mission.entrepriseId, admin.id);

    const cartographie: Record<string, Record<string, string>> = {};
    const registre: readonly EntreeRegistreAcces[] = api().registreAcces;
    for (const entree of registre) {
      if (!entree.url.startsWith('/v1/missions')) continue;
      const parametres: Record<string, string> = {};
      for (const nom of parametresDuGabarit(entree.url)) parametres[nom] = mission.id;
      if (Object.keys(parametres).length > 0) cartographie[entree.url] = parametres;
    }

    expect(
      Object.keys(cartographie).length,
      'Le registre ne porte AUCUN gabarit `/v1/missions` à paramètre : soit les routes\n' +
        'ne sont pas montées, soit elles n’ont pas déclaré leur politique d’accès — et le\n' +
        'socle L2 refuse de démarrer sur une route sans politique.',
    ).toBeGreaterThan(0);

    const gabaritsDuLot = Object.keys(cartographie).filter(
      (gabarit) => gabarit.includes('questionnaire') || gabarit.includes('generate'),
    );
    expect(
      gabaritsDuLot.length,
      'Aucun gabarit de L3d n’est entré dans la cartographie du balayage. Son silence\n' +
        'ne prouverait alors rien pour les deux routes de cet incrément — c’est le défaut\n' +
        'nommé au brief L3D §9-3 : un garde-fou vert sur des routes jamais traversées.',
    ).toBeGreaterThan(0);

    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      // L'ADMINISTRATEUR est délibérément ABSENT : il a le droit de voir les montants
      // (03 §34.1). L'inclure produirait une fausse fuite, et un garde-fou qui crie à
      // tort finit désarmé.
      porteurs: {
        consultant: (await creerCompte('consultant', 'balayage')).jeton,
        analyste: (await creerCompte('analyste', 'balayage')).jeton,
        lecteur: (await creerCompte('lecteur', 'balayage')).jeton,
        anonyme: null,
      },
      cartographieDeParametres: cartographie satisfies CartographieDeParametres,
    });

    expect(
      rapport.fuites,
      `Une route a laissé sortir un montant :\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    const muettes = rapport.gabaritsMuets.filter(
      (entree) => entree.includes('questionnaire') || entree.includes('generate'),
    );
    expect(
      muettes,
      'Une route du questionnaire n’a été ni refusée (401/403) ni servie (2xx) par AUCUN\n' +
        `porteur. Le vert du balayage ne vaut rien pour elle.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 10. CONVENTIONS D'API (11 §3) — CE QUI VAUT POUR TOUTES LES ROUTES
// =============================================================================
describe('conventions d’API sur les deux routes du questionnaire', () => {
  it('@critique tout refus respecte l’enveloppe unique et n’emploie que des codes du contrat partagé', async () => {
    // 11 §3 : « format unique { error: { code, message, details? } } ; les codes vivent
    // dans `packages/shared` (ERROR_CODES) — JAMAIS de littéral libre. »
    //
    // QUELLE IMPLÉMENTATION FAUSSE CE CAS ATTRAPE-T-IL ? Celle qui laisse une erreur
    // remonter nue — un `throw new Error('déjà figé')` qui devient un 500 avec le
    // message de Fastify, ou un `reply.code(409).send({ message: '…' })` écrit à la
    // main. Le front, qui branche sur `error.code`, ne verrait rien du tout : ni
    // erreur affichable, ni action proposée.
    //
    // `QUESTIONNAIRE_ALREADY_FROZEN` est admis EN PLUS d'`ERROR_CODES` parce qu'il
    // doit y entrer et qu'il n'y est pas encore (hypothèse H5) — la tolérance est
    // nommée, bornée à un code, et signalée au rapport.
    const admin = await creerCompte('admin', 'enveloppe');
    const bloc = await semerBloc(1000);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-EN-01' });
    await figerEtExiger201(mission.id, admin.jeton);

    const codesAdmis = new Set<string>([...Object.values(ERROR_CODES), CODE_DEJA_FIGE]);
    const refus = [
      await figer(mission.id, admin.jeton),
      await appeler('GET', urlPrevisualisation(uuidv7()), { jeton: admin.jeton }),
      await appeler('GET', urlPrevisualisation(mission.id)),
      await appeler('POST', urlFigeage('pas-un-uuid'), { jeton: admin.jeton, charge: {} }),
    ];

    const anomalies = refus
      .map((reponse) => {
        if (reponse.code === null) {
          return `statut ${String(reponse.statut)} sans enveloppe d’erreur : ${reponse.corps.slice(0, 200)}`;
        }
        if (!codesAdmis.has(reponse.code)) return `code hors contrat : ${reponse.code}`;
        if (reponse.message === null || reponse.message === '') {
          return `code ${reponse.code} sans message français`;
        }
        return null;
      })
      .filter((anomalie): anomalie is string => anomalie !== null);

    expect(anomalies, 'Enveloppe d’erreur non conforme au 11 §3.').toStrictEqual([]);
  });

  it('les horodatages éventuellement rendus sont des ISO 8601 UTC canoniques', async () => {
    // 11 §3 : « ISO 8601 UTC en API, fuseau de mission à l'AFFICHAGE uniquement ». Ni
    // la prévisualisation ni le figeage ne sont TENUS de rendre une date (aucune des
    // deux n'a de colonne temporelle au 04) — mais s'ils en rendent une, elle obéit à
    // la convention. Un décalage non nul rend deux missions incomparables, et
    // l'anomalie reste plausible à l'œil : c'est pour cela qu'elle se teste.
    const admin = await creerCompte('admin', 'horodatage');
    const bloc = await semerBloc(1001);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-HO-01' });

    const vue = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    const figeage = await figer(mission.id, admin.jeton);

    // Toute chaîne qui RESSEMBLE à un horodatage doit être un UTC canonique.
    const suspects = `${vue.corps}\n${figeage.corps}`.match(/"\d{4}-\d{2}-\d{2}T[^"]*"/g) ?? [];
    const formeUtc = /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z"$/;
    expect(
      suspects.filter((valeur) => !formeUtc.test(valeur)),
      'Un horodatage n’est pas rendu en UTC canonique (suffixe `Z`). Le fuseau de\n' +
        'mission ne s’applique QU’À L’AFFICHAGE (11 §3, invariant 5) : une date décalée\n' +
        'côté API se propage silencieusement dans tout ce qui la compare.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 9. LES BRANCHES QUE LA MESURE A DÉNONCÉES — palier NUL, figeage SANS trace
// =============================================================================
// `.github/coverage-critical-paths.json` (2026-09-02) place ce module sous le
// seuil de 90 % sur les quatre métriques ; mesuré avant cette section : 96,8
// lignes / 96,8 instructions / 100 fonctions / 86,7 branches. Les deux cas
// ci-dessous exercent les deux branches du DÉPÔT et du SERVICE qu'aucun test
// n'atteignait — et chacun assère un comportement.

/** Sème une ligne figée PAR SQL, sans aucune trace au journal — l'état « figé, mais sans date ». */
async function semerFigeeSansTrace(missionId: string, questionId: string): Promise<void> {
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version,
                                    text_snapshot, position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, 1, false)`,
    [uuidv7(), missionId, questionId, 'Question factice figée sans trace — libellé neutre.'],
  );
}

describe('mission SANS palier d’effectif — le dépôt ne résout rien, l’assembleur avertit', () => {
  it('@critique `size_tier_id` NUL : le filtre de palier n’est pas appliqué, PALIER_ABSENT est rendu, et le figeage aboutit', async () => {
    // 04 : `missions.size_tier_id` est NULLABLE — une mission en avant-vente n'a
    // pas toujours son palier. Arbitrage `[L3d]` du 2026-09-02 : palier absent ⇒
    // filtre NON appliqué (jamais « rien ne passe »), avec un avertissement.
    // La preuve est prise sur une question réservée aux GRANDS effectifs : avec le
    // palier PME elle serait exclue ; sans palier, elle entre.
    const admin = await creerCompte('admin', 'palier-nul');
    const bloc = await semerBloc(910);
    const mission = await semerMission({
      createur: admin.id,
      blocsActifs: [bloc.code],
      palier: null,
    });
    await semerQuestion({ blocId: bloc.id, code: 'L3D-PN-UNIVERSELLE' });
    await semerQuestion({
      blocId: bloc.id,
      code: 'L3D-PN-GRANDS-EFFECTIFS',
      effectifMin: 5001,
      effectifMax: null,
    });

    const reponse = await appeler('GET', urlPrevisualisation(mission.id), { jeton: admin.jeton });
    const apercu = previsualisation(reponse);
    expect(apercu.total, 'sans palier, la question des grands effectifs entre aussi').toBe(2);
    const avertissements = tableauDe(reponse.corps, 'avertissements') ?? [];
    const codes = avertissements.map(
      (a) => z.looseObject({ code: z.string() }).safeParse(a).data?.code ?? '',
    );
    expect(codes, 'l’absence de palier est DITE, jamais tue').toContain('PALIER_ABSENT');

    const total = await figerEtExiger201(mission.id, admin.jeton);
    expect(total).toBe(2);
    expect((await lireFigees(mission.id)).map((l) => l.code).sort()).toEqual([
      'L3D-PN-GRANDS-EFFECTIFS',
      'L3D-PN-UNIVERSELLE',
    ]);
  });
});

describe('POST generate-questionnaire — déjà figé, mais SANS trace de figeage au journal', () => {
  it('@critique le refus porte le compte et DIT que la date est inconnue du journal, au lieu d’en inventer une', async () => {
    // `DECISIONS.md` 2026-09-01 : la date du figeage se lit dans `activity_log`,
    // faute de colonne au 04. Une mission figée AVANT que cette trace n'existe
    // (reprise de données, seed de démonstration, restauration partielle) a des
    // lignes et pas de date. Le refus doit rester un 409 `QUESTIONNAIRE_ALREADY_FROZEN`
    // avec le COMPTE — et dire que la date manque plutôt que d'afficher `now()`,
    // l'epoch, ou une date d'une autre entité. Une date fausse est pire qu'absente.
    const admin = await creerCompte('admin', 'fige-sans-trace');
    const bloc = await semerBloc(920);
    const mission = await semerMission({ createur: admin.id, blocsActifs: [bloc.code] });
    const questionId = await semerQuestion({ blocId: bloc.id, code: 'L3D-ST-01' });
    await semerFigeeSansTrace(mission.id, questionId);
    expect(
      await dernierJournal(mission.id),
      'précondition : aucune trace pour cette mission',
    ).toBeNull();

    const refus = await figer(mission.id, admin.jeton);
    expect(refus.statut, `Attendu 409. Reçu : ${refus.corps.slice(0, 400)}`).toBe(409);
    expect(refus.code).toBe(CODE_DEJA_FIGE);
    expect(/(^|\D)1(\D|$)/.test(refus.message ?? ''), 'le COMPTE (une question) est porté').toBe(
      true,
    );
    expect(
      refus.message,
      'la date n’est pas connue : le message le DIT, et ne porte aucune date fabriquée',
    ).toMatch(/journal/i);
    expect(refus.message?.match(/\d{4}-\d{2}-\d{2}/g) ?? [], 'aucune date inventée').toEqual([]);
    expect(await compterFigees(mission.id), 'le refus n’écrit rien').toBe(1);
    expect(await dernierJournal(mission.id), 'et ne trace rien non plus').toBeNull();
  });
});
