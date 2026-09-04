// =============================================================================
// LOT L3 / INCRÉMENT L3d — LE PLAN D'ENTRETIENS (§32.4), LES AFFECTATIONS
// (`work_assignments`, §18.2) ET LA RÉAFFECTATION (§34.4), ÉPROUVÉS SUR UN
// POSTGRESQL RÉEL.
//
// `GET /v1/missions/:id/interview-plan` · `GET|POST /v1/missions/:id/assignments`
// · `PATCH /v1/interviews/:id/reassign`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE, ET SANS L'AVOIR LU.
// ═══════════════════════════════════════════════════════════════════════════════
// 09 §3-2 (« TDD sur les parties critiques — tests écrits AVANT ») et 09 §5.6
// (« le code de test n'est JAMAIS écrit par l'agent qui a écrit le code testé »).
// Au moment de la rédaction, NI `apps/api/src/domaines/plan-entretiens/**`, NI
// `apps/api/src/domaines/assignments/**`, NI `apps/api/src/routes/assignments.ts`,
// NI `apps/api/src/routes/interviews.ts` n'existaient — et aucun n'a été ouvert
// depuis. Les attentes viennent de la SPÉCIFICATION, et d'elle seule :
//   · 03 §32.4 — les règles d'échantillonnage, transcrites RÈGLE PAR RÈGLE
//     ci-dessous, depuis la phrase du pack et non depuis une table de code ;
//   · 03 §17.3 — « pour CHAQUE unité in_scope, l'outil propose les profils à
//     rencontrer » ; « la collecte démarre avec une cible chiffrée par unité » ;
//   · 03 §18.1.2 — le plan prévisionnel est « LA base objective du chiffrage » ;
//   · 03 §18.2 — `work_assignments`, la table et son UNIQUE(mission, user, unité) ;
//   · 03 §18.3 — « l'auditeur voit son plan, ses dates ; il ne voit JAMAIS le TJM,
//     les montants, ni le devis » ;
//   · 03 §34.1 — « Décision V1 : la console est ADMIN SEUL » ;
//   · 03 §34.3 — les pouvoirs du LEAD sur SA mission ;
//   · 03 §34.4 — l'habilitation (« un auditeur non habilité ne touche jamais un
//     client ») et la réaffectation (« autorisé UNIQUEMENT si status ≠
//     en_cours/termine » · « les sessions RÉALISÉES restent à leur auteur ») ;
//   · 03 §25.2 / §25.3 — `schedule_status`, unités `proposee`/`fusionnee` ;
//   · 04 — colonnes de `interviews`, `work_assignments`, `org_units`, `missions`,
//     `mission_users`, `activity_log` ;
//   · 11 §3 — format d'erreur unique, keyset, ISO 8601 UTC, camelCase ;
//   · `docs/conception/LOT_L3D_BRIEF.md` §5, §6, §7, §8 et §9-3 ;
//   · `DECISIONS.md` : 2026-08-31 « `interviews.conducted_by` est NOT NULL » ·
//     2026-09-01 « Le profil de l'interlocuteur est absent du 04 » · 2026-09-01
//     « Aucune route n'écrit `mission_users` » · 2026-09-01 « OÙ VIT LE TEXTE DU
//     MOTIF » (escalade L3b, qui s'applique mot pour mot au motif du §34.4) ·
//     2026-09-01 « [transverse] `details[].code` ».
//
// **CONSÉQUENCE ASSUMÉE** : une divergence de lecture entre l'implémenteur et moi
// DOIT faire rougir cette suite. C'est le dispositif, pas un accident. Les
// hypothèses que la spécification ne tranche pas sont NOMMÉES une à une (bloc
// « HYPOTHÈSES D'INTERFACE ») : un test écrit sur une hypothèse non tracée est un
// faux verdict.
//
// ── LES HUIT PROPRIÉTÉS QUI NE SE VOIENT PAS EN RELISANT LE CODE ─────────────
//   1. LES QUATRE `n` MINIMAUX (1, 3, 4, 6) SONT LE CRITÈRE DU LOT (07, ligne L3,
//      critère n° 4). Un test qui vérifierait « le plan n'est pas vide » serait
//      vert sur un générateur qui propose 1 entretien partout — c'est-à-dire sur
//      un audit sous-dimensionné, vendu et facturé sur cette base (§18.1.2 : le
//      plan EST le chiffrage). Les bornes 10/11, 50/51, 200/201 sont éprouvées
//      DES DEUX CÔTÉS, parce que la faute la plus banale du monde est d'écrire
//      `< 10` pour « ≤ 10 » ou `>= 200` pour « > 200 » — et qu'aucune de ces deux
//      fautes ne se voit sur un jeu d'essai qui n'a pas d'unité à 10 ni à 200 ;
//   2. LES FOURCHETTES SONT DES FOURCHETTES, PAS DES TIRAGES. « 1-2 » et « 6-10 »
//      sont des intervalles rendus tels quels. Une implémentation qui tirerait un
//      nombre dans l'intervalle produirait un plan différent à chaque appel, donc
//      un chiffrage différent à chaque ouverture d'écran, et personne ne saurait
//      dire lequel a été vendu. Le test à douze unités identiques attrape le
//      tirage même quand deux appels successifs auraient pu, par chance, coïncider ;
//   3. LE PLAN N'ÉCRIT RIEN. `interviews.conducted_by` est NOT NULL et l'escalade
//      est OUVERTE (`DECISIONS.md` 2026-08-31) : tant qu'elle l'est, le plan est
//      une fonction pure rendue, jamais persistée. Une implémentation « utile »
//      qui créerait les lignes `interviews` devrait leur inventer un propriétaire
//      — et un propriétaire inventé, c'est 05 §9.9 (propriété d'écriture de sync)
//      qui devient faux sans que rien ne le dise ;
//   4. UNE UNITÉ HORS PÉRIMÈTRE OU PROPOSÉE N'ENTRE PAS DANS LE PLAN, et une
//      unité SANS EFFECTIF y entre AVEC UN DRAPEAU. Ce sont deux façons opposées
//      de ne pas mentir : l'une exclut, l'autre signale. Une implémentation qui
//      confondrait les deux (exclure les effectifs inconnus « pour ne pas fausser
//      le total ») ferait disparaître du chiffrage les unités les moins bien
//      connues — exactement celles qu'il faut aller voir ;
//   5. LA RÉAFFECTATION D'UNE SESSION COMMENCÉE OU TERMINÉE EST REFUSÉE. §34.4 :
//      « les sessions RÉALISÉES restent à leur auteur, `conducted_by` immuable
//      après coup : l'historique d'un audit ne se réécrit jamais ». Une route qui
//      l'autoriserait laisserait réattribuer un entretien déjà conduit, ce qui
//      falsifie la provenance de chaque réponse qu'il porte ;
//   6. LA GARDE D'HABILITATION VAUT AUX DEUX PORTES. §34.4 ferme
//      `mission_users` ; si `work_assignments` et `reassign` ne la reprennent
//      pas, on affecte un auditeur non habilité à des unités réelles sans jamais
//      passer par la porte fermée. Une règle de sécurité qui a une porte de
//      service n'est pas une règle ;
//   7. LE REFUS N'ÉCRIT RIEN — ni la colonne, ni le journal. Un refus qui laisse
//      une trace d'écriture partielle est pire qu'une autorisation : il produit
//      un état que personne n'a voulu et que rien n'explique ;
//   8. AUCUNE DE CES ROUTES NE LAISSE SORTIR UN MONTANT. §18.3 est explicite :
//      l'auditeur voit son plan et ses dates, JAMAIS le TJM. Or le plan est « la
//      base objective du chiffrage » (§18.1.2) : la jointure vers le cadrage est
//      à portée de main, et c'est exactement pour cela qu'elle est éprouvée.
//
// ── HYPOTHÈSES D'INTERFACE (la spécification est muette — elles sont TRACÉES) ─
// Aucune n'est devinée en silence ; chacune est reportée au rapport A16 pour que
// l'implémenteur lise la même. Elles sont TOUTES concentrées dans les schémas et
// les extracteurs de la section « CONTRAT DE SORTIE », un seul endroit à corriger.
//   H1. `GET /v1/missions/:id/interview-plan` rend `{ missionId, unites[] }`,
//       éventuellement enveloppé sous la clé `plan`. Chaque unité porte
//       `orgUnitId`, `effectif` (nombre ou `null`), `effectifInconnu` (booléen —
//       nom LITTÉRAL du brief §5), `entretiens: { min, max }` (forme LITTÉRALE du
//       brief §5 : « rendues comme des fourchettes (`{min: 1, max: 2}`) ») et
//       `sessionsComplementaires[]` portant `kind` parmi les valeurs de
//       `interviews.kind` du 04.
//   H2. Le nom des tranches n'est PAS exigé : il n'est écrit nulle part au pack,
//       et une tranche est intégralement déductible de `{min, max}`. Ce fichier
//       n'assert donc AUCUN libellé de tranche — c'était une invention évitable.
//   H3. `POST /v1/missions/:id/assignments` prend
//       `{ userId, orgUnitId, plannedInterviews?, plannedDays?, dateFrom?, dateTo? }`
//       (camelCase des colonnes du 04) et rend 201 avec la ligne créée.
//       `GET` rend l'enveloppe de page `{ items, nextCursor }` de
//       `packages/shared/src/pagination.ts` — contrat PARTAGÉ, pas code du lot.
//   H4. `PATCH /v1/interviews/:id/reassign` prend `{ newUserId, motif }` (brief
//       §6, verbatim) et rend 200. La VÉRITÉ du résultat est lue en SQL
//       (`interviews.conducted_by`), jamais dans le corps de la réponse : ainsi
//       la forme de la réponse ne peut pas rendre un test faussement vert.
//   H5. Un doublon `(mission, user, unité)` rend `409 CONFLICT` — le code que
//       `ERROR_CODES` porte déjà pour un conflit d'état non nommé autrement.
//   H6. Un consultant NON MEMBRE de la mission se voit refuser le plan. Le statut
//       n'est PAS tranché par le pack (le crochet `type:'mission'` ne vérifie que
//       l'identité, le filtrage appartient au dépôt) : l'assertion porte donc sur
//       le REFUS et sur l'ABSENCE de toute donnée du plan dans la réponse, pas sur
//       le choix entre 403 et 404. La substance est prouvée, le code est signalé.
//   H7. Un plan qui ne peut rien proposer rend `200` avec `unites: []` — jamais
//       404, jamais 500 : une mission dont tout est hors périmètre est un état
//       légitime, pas une erreur.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit franchement ─────────────────────────
//   · il ne prouve RIEN sur un plan PERSISTÉ : l'escalade `conducted_by`
//     (`DECISIONS.md` 2026-08-31) est ouverte, `POST …/interview-plan/apply` est
//     reportée en fiche d'étage 2, et il n'existe aucune table où poser un plan.
//     La reproductibilité est donc éprouvée sur la RESTITUTION (deux appels), pas
//     sur une relecture après redémarrage — ce qui laisse hors d'atteinte le seul
//     défaut qui compterait vraiment le jour où le plan sera enregistré : une
//     dérive entre le plan vendu et le plan relu ;
//   · il ne chiffre AUCUN entretien PAR PROFIL. `interviews.interlocutor_profile_id`
//     n'existe pas au 04 et l'arbitrage du 2026-09-01 refuse de le déduire : un
//     chiffre faux est pire qu'un chiffre absent, et il ne se signale pas ;
//   · il n'éprouve pas l'ADMINISTRATEUR NON MEMBRE sur le plan : §18.3 dit
//     « surtout pas admin » pour la politique de route, le brief §7 en fait un
//     accès `type:'mission'`, et aucun texte ne dit si l'admin est membre d'office.
//     Deviner ici produirait un verdict sur une règle que personne n'a écrite ;
//   · il ne mesure aucune durée et n'éprouve aucune concurrence (deux `POST`
//     simultanés sur le même triplet) : avec `singleFork` et un pool partagé, la
//     mise en scène produirait un test intermittent, et une suite intermittente
//     finit ignorée. La contrainte UNIQUE du 04 est la vraie garantie ; elle est
//     éprouvée en séquence ;
//   · il n'éprouve pas la conservation du TEXTE du motif : où il vit est une
//     ESCALADE OUVERTE (`DECISIONS.md` 2026-09-01, L3b). Ce qui est éprouvé, et
//     qui ne dépend d'aucun arbitrage, c'est qu'il ne soit pas déversé tel quel
//     dans `activity_log`.
//
// Invariant 2 : aucune référence client. Toutes les fixtures portent des libellés
// neutres et des missions fictives.
// Traçabilité : E40 (règles d'échantillonnage §32.4) · E25 (zéro oubli : plan
// d'entretiens) · E30 (3 niveaux d'audit) · E21 (auditeurs jamais d'accès aux
// montants) · E33 (sécurité / RGPD) · E45 (matrice console rôle × espace, pouvoirs
// du lead) · invariants 2, 3, 5 et 7.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ERROR_CODES,
  MOTIFS_REAFFECTATION,
  verifierValeursAtomiques,
  type MotifReaffectation,
} from '@axion/shared';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
// Importé pour sa DÉCLARATION D'AUGMENTATION : c'est elle qui fait connaître
// `app.registreAcces` à TypeScript (11 §3 : « aucun any »).
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
const SECRET_ACCES = '9a'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '4e'.repeat(32);
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';

const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l3d@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// =============================================================================
// LES RÈGLES D'ÉCHANTILLONNAGE DU 03 §32.4 — TRANSCRITES ICI, DEPUIS LE TEXTE
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CETTE TABLE EST RECOPIÉE PLUTÔT QU'IMPORTÉE D'UN MODULE PARTAGÉ.
// ═══════════════════════════════════════════════════════════════════════════════
// Si les règles étaient importées du code (ou d'un futur
// `packages/shared/src/plan-entretiens.ts`), la matrice de test serait bâtie à
// partir de son propre sujet : une ligne fautive le serait des DEUX côtés le même
// jour, et la suite resterait verte en n'éprouvant plus rien. La transcription
// ci-dessous vient de LA PHRASE du pack, recopiée mot pour mot :
//
//   « Échantillonnage (règle affichée au plan d'entretiens, M9/§18.1) :
//     unité ≤ 10 pers. → 1-2 entretiens · 11-50 → 3 entretiens ·
//     51-200 → 4-6 entretiens + 1 observation ·
//     > 200 → 6-10 entretiens + observation + démonstration + relevé de données.
//     Le consultant peut dévier (le plan est un guide) ; l'écart est visible dans
//     la couverture. »
//
// CE QUE LA PHRASE DIT EXACTEMENT, ET CE QU'ELLE NE DIT PAS :
//   · elle donne QUATRE tranches d'effectif, bornes INCLUSES des deux côtés
//     (« ≤ 10 », « 11-50 », « 51-200 », « > 200 ») : il n'y a ni trou ni
//     recouvrement, et 10, 50, 200 appartiennent chacun à la tranche BASSE ;
//   · « 11-50 → 3 entretiens » n'est PAS une fourchette : min = max = 3. C'est la
//     seule tranche où le nombre est fixe, et c'est un piège de transcription
//     (l'œil, ayant lu trois fourchettes, en invente une quatrième) ;
//   · elle ne chiffre PAS les sessions complémentaires de la tranche « > 200 »
//     (« observation + démonstration + relevé de données », sans nombre), alors
//     qu'elle chiffre celle de « 51-200 » (« + 1 observation »). L'AMBIGUÏTÉ est
//     réelle et elle est rapportée : ce fichier éprouve la PRÉSENCE des trois
//     types et un minimum de 1 chacun — la lecture la plus faible qui reste
//     conforme au texte ;
//   · elle ne dit RIEN d'un effectif NUL ou INCONNU. `headcount` est NULLABLE au
//     04. Le brief §5 tranche : NULL → tranche minimale ET drapeau
//     `effectifInconnu` (« jamais un silence »). Pour `0`, ce fichier applique la
//     lettre : 0 ≤ 10, donc tranche minimale — et le signale au rapport ;
//   · « le consultant peut dévier » ne concerne PAS le générateur : c'est une
//     règle d'usage sur le plan RENDU (l'écart se voit à la couverture, L7/L8).
// =============================================================================

/** Les types de session complémentaires du §32.4, en vocabulaire `interviews.kind` (04). */
type KindComplementaire = 'observation' | 'demonstration' | 'releve_donnees';

interface RegleEchantillonnage {
  /** Libellé de la tranche, tel qu'il se lit dans le §32.4 — pour les messages. */
  readonly tranche: string;
  /** Borne basse INCLUSE de l'effectif. */
  readonly effectifMin: number;
  /** Borne haute INCLUSE, ou `null` pour la tranche ouverte « > 200 ». */
  readonly effectifMax: number | null;
  /** LE `n` MINIMAL — ce que le critère n° 4 du fichier 07 vérifie. */
  readonly entretiensMin: number;
  /** Le haut de la fourchette ; égal au min quand le texte donne un nombre fixe. */
  readonly entretiensMax: number;
  /** Les sessions complémentaires exigées, sans doublon, dans l'ordre du texte. */
  readonly complementaires: readonly KindComplementaire[];
}

const REGLES_ECHANTILLONNAGE: readonly RegleEchantillonnage[] = [
  {
    tranche: 'unité ≤ 10 pers.',
    effectifMin: 0,
    effectifMax: 10,
    entretiensMin: 1,
    entretiensMax: 2,
    complementaires: [],
  },
  {
    tranche: '11-50',
    effectifMin: 11,
    effectifMax: 50,
    entretiensMin: 3,
    entretiensMax: 3,
    complementaires: [],
  },
  {
    tranche: '51-200',
    effectifMin: 51,
    effectifMax: 200,
    entretiensMin: 4,
    entretiensMax: 6,
    complementaires: ['observation'],
  },
  {
    tranche: '> 200',
    effectifMin: 201,
    effectifMax: null,
    entretiensMin: 6,
    entretiensMax: 10,
    complementaires: ['observation', 'demonstration', 'releve_donnees'],
  },
];

/** La règle applicable à un effectif CONNU, choisie par la lettre du §32.4. */
function regleDe(effectif: number): RegleEchantillonnage {
  const trouvee = REGLES_ECHANTILLONNAGE.find(
    (regle) =>
      effectif >= regle.effectifMin &&
      (regle.effectifMax === null || effectif <= regle.effectifMax),
  );
  if (trouvee === undefined) {
    throw new Error(`aucune règle §32.4 pour l’effectif ${String(effectif)}`);
  }
  return trouvee;
}

/**
 * LES EFFECTIFS DE CONTRÔLE — un par règle, et un DE CHAQUE CÔTÉ de chaque borne.
 *
 * 10/11, 50/51 et 200/201 sont les trois seuls endroits où une inégalité mal
 * écrite se voit. Un jeu d'essai « raisonnable » (5, 30, 100, 500) reste vert sur
 * les six fautes possibles, et c'est pour cela qu'il ne faut pas l'écrire.
 */
const EFFECTIFS_DE_CONTROLE: readonly number[] = [
  0, 1, 9, 10, 11, 12, 49, 50, 51, 52, 199, 200, 201, 500, 5000,
];

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// APPELS HTTP
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly message: string | null;
  /**
   * `code` est LU sur chaque détail : la convention transverse du 2026-09-01 pose
   * que `code` porte la cause MACHINE et `message` la phrase française affichable.
   * Un `z.object` non strict le stripperait en silence, et le test ne verrait
   * jamais le champ que le contrat vient de poser.
   */
  readonly details: readonly {
    readonly path: string;
    readonly code?: string | undefined;
    readonly message: string;
  }[];
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
 * `request.ip` en repli — donc pour un anonyme, l'adresse. Sans adresse distincte,
 * l'ORDRE des `it` déciderait des verdicts, et une suite dont le résultat dépend
 * de son ordre ne prouve rien.
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
  let details: readonly { path: string; code?: string | undefined; message: string }[] = [];
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      message = analyse.data.error.message;
      details = analyse.data.error.details ?? [];
    }
  }
  return { statut: reponse.statusCode, code, message, details, corps: reponse.body };
}

// =============================================================================
// LE CONTRAT DE SORTIE — ÉCRIT DEPUIS LA SPÉCIFICATION, JAMAIS IMPORTÉ DU LOT
// =============================================================================
// Importer le schéma de réponse du lot reviendrait à demander au sujet de valider
// sa propre réponse : une clé retirée du contrat disparaîtrait des deux côtés le
// même jour, et le test resterait vert en n'exigeant plus rien.
//
// `z.object` (et non `strictObject`) : une clé SUPPLÉMENTAIRE n'est pas jugée ici
// — elle l'est, nommément, par les tests d'étanchéité financière. Ce partage est
// délibéré : la forme se juge au champ près à UN endroit, pour qu'un écart
// produise UN rouge lisible et non quarante.
// =============================================================================

const KINDS_COMPLEMENTAIRES = ['observation', 'demonstration', 'releve_donnees'] as const;

const fourchetteSchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
});

const sessionComplementaireSchema = z.object({
  kind: z.enum(KINDS_COMPLEMENTAIRES),
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
});

const unitePlanSchema = z.object({
  orgUnitId: z.uuid(),
  effectif: z.number().int().nullable(),
  effectifInconnu: z.boolean(),
  entretiens: fourchetteSchema,
  sessionsComplementaires: z.array(sessionComplementaireSchema),
  /**
   * §17.3 et §18.1.2 disent « par unité ET PAR PROFIL ». L'arbitrage du
   * 2026-09-01 tranche : le plan LISTE les profils, il ne les CHIFFRE pas —
   * `interviews.interlocutor_profile_id` n'existe pas au 04. Donc une liste de
   * CODES, et jamais une liste d'objets porteurs d'un compteur.
   */
  profils: z.array(z.string()).optional(),
});
type UnitePlan = z.infer<typeof unitePlanSchema>;

const planSchema = z.object({
  missionId: z.uuid(),
  unites: z.array(unitePlanSchema),
  /** Facultatif : s'il existe, il doit être COHÉRENT avec la somme des unités. */
  totalEntretiens: fourchetteSchema.optional(),
  /** Facultatif ici (le brief §3 le nomme pour la prévisualisation). */
  avertissements: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
});
type Plan = z.infer<typeof planSchema>;

/**
 * Extrait le plan d'un corps de réponse — à plat ou sous la clé `plan`.
 *
 * C'est l'hypothèse H1, et la SEULE tolérance de forme du fichier : elle ne porte
 * que sur l'ENVELOPPE, jamais sur les champs, jamais sur les valeurs, jamais sur
 * un code d'erreur.
 */
function extrairePlan(reponse: Reponse): Plan | null {
  if (reponse.corps === '') return null;
  const brut: unknown = JSON.parse(reponse.corps);
  const aPlat = planSchema.safeParse(brut);
  if (aPlat.success) return aPlat.data;
  const enveloppe = z.object({ plan: planSchema }).safeParse(brut);
  return enveloppe.success ? enveloppe.data.plan : null;
}

/** Idem, mais échoue le test si le plan est illisible — cas nominal. */
function plan(reponse: Reponse): Plan {
  const extrait = extrairePlan(reponse);
  expect(
    extrait,
    'La réponse ne porte aucun plan reconnaissable — ni à plat, ni sous la clé\n' +
      '`plan`. Forme attendue (hypothèse H1, brief L3d §5) :\n' +
      '{ missionId, unites: [{ orgUnitId, effectif, effectifInconnu,\n' +
      '  entretiens: { min, max }, sessionsComplementaires: [{ kind }] }] }\n' +
      `Corps reçu :\n${reponse.corps.slice(0, 900)}`,
  ).not.toBeNull();
  if (extrait === null) throw new Error('plan absent de la réponse');
  return extrait;
}

/** L'unité du plan qui porte cet identifiant, ou `undefined`. */
function unite(p: Plan, orgUnitId: string): UnitePlan | undefined {
  return p.unites.find((u) => u.orgUnitId === orgUnitId);
}

/** Les `kind` complémentaires proposés pour une unité, dédoublonnés et triés. */
function kindsComplementaires(u: UnitePlan): readonly string[] {
  return [...new Set(u.sessionsComplementaires.map((s) => s.kind))].sort();
}

const assignmentSchema = z.object({
  id: z.uuid(),
  missionId: z.uuid(),
  userId: z.uuid(),
  orgUnitId: z.uuid(),
  plannedInterviews: z.number().int().nullable().optional(),
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
});
type Assignment = z.infer<typeof assignmentSchema>;

const pageAssignmentsSchema = z.object({
  items: z.array(assignmentSchema),
  nextCursor: z.string().nullable(),
});
type PageAssignments = z.infer<typeof pageAssignmentsSchema>;

function pageAffectations(reponse: Reponse): PageAssignments {
  const brut: unknown = JSON.parse(reponse.corps);
  const analyse = pageAssignmentsSchema.safeParse(brut);
  expect(
    analyse.success,
    'La liste ne respecte pas l’enveloppe de page du contrat PARTAGÉ (11 §3,\n' +
      '`pageSchema` de packages/shared) : { items: [...], nextCursor: string | null }.\n' +
      `Corps reçu :\n${reponse.corps.slice(0, 800)}`,
  ).toBe(true);
  return pageAssignmentsSchema.parse(brut);
}

function affectation(reponse: Reponse): Assignment {
  const brut: unknown = JSON.parse(reponse.corps);
  const aPlat = assignmentSchema.safeParse(brut);
  if (aPlat.success) return aPlat.data;
  const enveloppe = z.object({ assignment: assignmentSchema }).safeParse(brut);
  expect(
    enveloppe.success,
    'La création d’affectation ne rend pas la ligne créée (hypothèse H3) :\n' +
      '{ id, missionId, userId, orgUnitId, … }, à plat ou sous la clé `assignment`.\n' +
      `Corps reçu :\n${reponse.corps.slice(0, 800)}`,
  ).toBe(true);
  return z.object({ assignment: assignmentSchema }).parse(brut).assignment;
}

// =============================================================================
// FIXTURES — semées par SQL DIRECT quand elles ne relèvent pas du lot éprouvé
// =============================================================================
// Une entreprise, une mission, un arbre : ce sont des fixtures de L3a/L3b/L3c, pas
// le sujet de L3d. Les semer par SQL évite de faire dépendre quarante verdicts du
// contrat d'AUTRES routes — et surtout, cela permet de contrôler l'arbre AU
// BIT PRÈS, ce que `POST /v1/missions` interdit puisqu'il crée une unité racine
// d'office (03 §16.2). C'est une fabrication d'ÉTAT, jamais de RÉSULTAT.

type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte et frappe son jeton d'accès.
 *
 * Ni `POST /v1/auth/login` ni Argon2id : le quota `/v1/auth/*` (10 req/min/IP)
 * ferait dépendre cette suite d'un plafond qui ne la concerne pas, et la
 * dérivation coûte cher pour éprouver un chemin qui a déjà sa suite
 * (`l2-auth-routes`). Le jeton est frappé par `app.jwt.sign`, donc par LA MÊME
 * clé que la route de connexion, et ne porte que `sub` : le crochet
 * d'autorisation relit le rôle EN BASE (06 §10.1), rien n'est court-circuité.
 *
 * `habilite` est un PARAMÈTRE et non un défaut caché : la garde §34.4 est ici un
 * SUJET d'épreuve, pas une gêne à contourner.
 */
async function creerCompte(
  role: RoleUtilisateur,
  marqueur: string,
  options: { readonly habilite?: boolean } = {},
): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  const habilite = options.habilite ?? true;
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             $5, true, now(), now())`,
    [
      id,
      `Compte ${suffixe}`,
      `compte.${suffixe}@exemple.test`,
      role,
      habilite ? new Date().toISOString() : null,
    ],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurEntreprise = 0;

async function semerEntreprise(): Promise<string> {
  compteurEntreprise += 1;
  const id = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    id,
    `Entreprise fictive L3d ${String(compteurEntreprise)}`,
  ]);
  return id;
}

let compteurMission = 0;

interface MissionSemee {
  readonly id: string;
  readonly companyId: string;
}

/**
 * Sème une mission SANS arbre — pas même la racine d'office.
 *
 * Le plan d'entretiens se lit sur l'arbre : une racine surnuméraire fausserait
 * chaque total et rendrait illisible le verdict des `n` minimaux.
 */
async function semerMission(
  options: {
    readonly statut?: 'preparation' | 'en_cours' | 'en_analyse' | 'livree' | 'cloturee';
    readonly companyId?: string;
  } = {},
): Promise<MissionSemee> {
  compteurMission += 1;
  const id = uuidv7();
  const companyId = options.companyId ?? (await semerEntreprise());
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                           created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', $4, now(), now())`,
    [
      id,
      companyId,
      `Mission fictive L3d ${String(compteurMission)}`,
      options.statut ?? 'preparation',
    ],
  );
  return { id, companyId };
}

/** Rattache un compte à une mission (`mission_users` — aucune route ne l'écrit). */
async function rattacher(
  missionId: string,
  userId: string,
  roleSurMission: RoleSurMission,
): Promise<void> {
  await bd().query(
    `INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)`,
    [missionId, userId, roleSurMission],
  );
}

interface SemisUnite {
  readonly missionId: string;
  readonly nom?: string;
  readonly effectif?: number | null;
  readonly dansLePerimetre?: boolean;
  readonly statut?: 'active' | 'proposee' | 'fusionnee';
  readonly parentId?: string | null;
  readonly position?: number | null;
  readonly kind?:
    'groupe' | 'filiale' | 'etablissement' | 'direction' | 'service' | 'equipe' | 'poste';
}

let compteurUnite = 0;

async function semerUnite(semis: SemisUnite): Promise<string> {
  compteurUnite += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                            status, position, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [
      id,
      semis.missionId,
      semis.parentId ?? null,
      semis.kind ?? 'service',
      semis.nom ?? `Unite fictive ${String(compteurUnite)}`,
      semis.effectif === undefined ? null : semis.effectif,
      semis.dansLePerimetre ?? true,
      semis.statut ?? 'active',
      semis.position ?? null,
    ],
  );
  return id;
}

interface SemisEntretien {
  readonly missionId: string;
  readonly orgUnitId: string;
  /**
   * `null` = session PLANIFIÉE sans auditeur — légitime depuis l'amendement du 04 du
   * 2026-09-02 (migration 0014 : `conducted_by` DROP NOT NULL). Une session CONDUITE
   * en a toujours un : cette règle est portée par le service, pas par la base.
   */
  readonly conduitPar: string | null;
  readonly statut?: 'non_demarre' | 'en_cours' | 'termine';
  readonly statutAgenda?:
    'a_planifier' | 'planifie' | 'confirme' | 'realise' | 'reporte' | 'annule';
  readonly nomPersonne?: string | null;
  readonly courrielPersonne?: string | null;
}

/** Sème une session. UUID v7 : `interviews` est créable hors ligne (04, P1-4). */
async function semerEntretien(semis: SemisEntretien): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                             person_name, person_email, schedule_status, status,
                             created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      semis.missionId,
      semis.conduitPar,
      semis.orgUnitId,
      semis.nomPersonne === undefined ? null : semis.nomPersonne,
      semis.courrielPersonne === undefined ? null : semis.courrielPersonne,
      semis.statutAgenda ?? 'planifie',
      semis.statut ?? 'non_demarre',
    ],
  );
  return id;
}

/** Le propriétaire RÉEL d'une session — la seule vérité sur ce qu'une route a écrit. */
async function proprietaireEnBase(interviewId: string): Promise<string | null> {
  const resultat = await bd().query<{ conducted_by: string }>(
    'SELECT conducted_by FROM interviews WHERE id = $1',
    [interviewId],
  );
  return resultat.rows[0]?.conducted_by ?? null;
}

async function compterAffectations(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM work_assignments WHERE mission_id = $1',
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterEntretiens(missionId: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM interviews WHERE mission_id = $1',
    [missionId],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function lignesJournal(
  entityId: string,
): Promise<
  readonly { action: string; user_id: string | null; entity_type: string | null; meta: unknown }[]
> {
  const resultat = await bd().query<{
    action: string;
    user_id: string | null;
    entity_type: string | null;
    meta: unknown;
  }>('SELECT action, user_id, entity_type, meta FROM activity_log WHERE entity_id = $1', [
    entityId,
  ]);
  return resultat.rows;
}

// -----------------------------------------------------------------------------
// RACCOURCIS D'APPEL — le sujet, lui, passe TOUJOURS par la route
// -----------------------------------------------------------------------------

async function lirePlan(missionId: string, jeton: string | undefined): Promise<Reponse> {
  return appeler('GET', `/v1/missions/${missionId}/interview-plan`, {
    ...(jeton === undefined ? {} : { jeton }),
  });
}

/**
 * Crée une affectation. **C'est ici, et seulement ici, que vit l'hypothèse H3**
 * sur la forme du corps : un seul point à corriger si le contrat partagé diffère.
 */
async function creerAffectation(
  jeton: string | undefined,
  missionId: string,
  corps: Readonly<Record<string, unknown>>,
): Promise<Reponse> {
  return appeler('POST', `/v1/missions/${missionId}/assignments`, {
    ...(jeton === undefined ? {} : { jeton }),
    charge: corps,
  });
}

/** Demande une réaffectation. **Hypothèse H4**, concentrée ici. */
async function reaffecter(
  jeton: string | undefined,
  interviewId: string,
  corps: Readonly<Record<string, unknown>>,
): Promise<Reponse> {
  return appeler('PATCH', `/v1/interviews/${interviewId}/reassign`, {
    ...(jeton === undefined ? {} : { jeton }),
    charge: corps,
  });
}

/**
 * LE MOTIF EST UN CODE, PAS UN TEXTE — arbitrage de Williams du 2026-09-02.
 *
 * L'escalade L3b « où vit le texte du motif » est tranchée par l'option 3 : un
 * vocabulaire FERMÉ (`MOTIFS_REAFFECTATION`, sept codes, `packages/shared/src/motifs.ts`),
 * dont le français vit dans `LIBELLES_MOTIF_REAFFECTATION`. Conséquence pour le
 * journal : `meta.motif` porte exactement le code, et le vocabulaire technique de
 * `journal.ts` n'est plus contourné — il est satisfait par construction.
 *
 * La valeur est TYPÉE par le contrat partagé : si le vocabulaire change, ce fichier
 * ne compile plus, ce qui vaut mieux qu'un 400 découvert à l'exécution.
 */
const MOTIF_REAFFECTATION: MotifReaffectation = 'indisponibilite_auditeur';

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l3d_plan');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit
  // être posée avant le premier `import()` dynamique, jamais après.
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
// 1. LA TRANSCRIPTION DU §32.4 CONTRE ELLE-MÊME
// =============================================================================
// Une table de règles recopiée à la main peut être fausse. Ces deux cas ne
// touchent AUCUNE route : ils vérifient que la transcription ci-dessus est une
// partition de l'axe des effectifs et qu'elle porte bien les quatre `n` du texte.
// Sans eux, une faute de recopie rendrait TOUS les verdicts suivants faux dans le
// même sens — c'est-à-dire silencieusement.
describe('§32.4 — la transcription des règles, éprouvée avant de s’en servir', () => {
  it('@critique les quatre tranches couvrent l’axe des effectifs sans trou ni recouvrement', () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Il n'attrape pas une implémentation : il attrape MA PROPRE transcription.
    // Un « 51-200 » recopié « 50-200 » créerait un recouvrement à 50, et le test
    // des bornes deviendrait un test de ma faute, pas du code.
    for (let effectif = 0; effectif <= 400; effectif += 1) {
      const applicables = REGLES_ECHANTILLONNAGE.filter(
        (r) => effectif >= r.effectifMin && (r.effectifMax === null || effectif <= r.effectifMax),
      );
      expect(
        applicables.length,
        `L’effectif ${String(effectif)} tombe dans ${String(applicables.length)} tranche(s) ` +
          'du §32.4 au lieu d’exactement une. La phrase du pack ne laisse ni trou ni ' +
          'recouvrement : « ≤ 10 · 11-50 · 51-200 · > 200 ».',
      ).toBe(1);
    }
  });

  it('@critique les quatre `n` minimaux du §32.4 sont 1, 3, 4 et 6 — et « 11-50 » n’est PAS une fourchette', () => {
    // QUELLE FAUTE CE CAS ATTRAPE-T-IL ?
    //   · le `n` minimal recopié depuis le HAUT de la fourchette (2, 3, 6, 10) —
    //     l'audit serait alors surdimensionné, donc invendable ;
    //   · « 11-50 → 3 » lu comme une fourchette « 3-… », l'œil ayant pris le pli
    //     des trois autres lignes. Le pack écrit « 3 entretiens », un nombre.
    expect(REGLES_ECHANTILLONNAGE.map((r) => r.entretiensMin)).toStrictEqual([1, 3, 4, 6]);
    expect(REGLES_ECHANTILLONNAGE.map((r) => r.entretiensMax)).toStrictEqual([2, 3, 6, 10]);

    const tranche11a50 = REGLES_ECHANTILLONNAGE[1];
    expect(tranche11a50?.entretiensMin).toBe(tranche11a50?.entretiensMax);
  });
});

// =============================================================================
// 2. LES `n` MINIMAUX — LE CRITÈRE N° 4 DU FICHIER 07, RÈGLE PAR RÈGLE
// =============================================================================
// « plan d'entretiens généré conforme aux n minimaux §32.4 » (07, ligne L3).
// C'est ICI que ce critère se coche, et nulle part ailleurs.
describe('GET /v1/missions/:id/interview-plan — les n minimaux du §32.4', () => {
  it('@critique chaque tranche du §32.4 rend SON `n` minimal et SA fourchette, aux quinze effectifs de contrôle', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // ═══════════════════════════════════════════════════════════════════════════
    // Cinq, et chacune a l'air juste en relecture :
    //   · celle qui écrit `effectif < 10` pour « ≤ 10 » : une unité de 10
    //     personnes bascule en tranche 11-50 et reçoit 3 entretiens au lieu de 1.
    //     Sur un arbre de TPE, le chiffrage double ;
    //   · celle qui écrit `effectif >= 200` pour « > 200 » : une unité de 200
    //     personnes reçoit 6-10 au lieu de 4-6, et le devis part 50 % trop haut ;
    //   · celle qui rend le MAXIMUM de la fourchette comme cible unique (« autant
    //     prévoir large ») : l'audit devient invendable, et personne ne saura dire
    //     que c'est le générateur qui a décidé ;
    //   · celle qui rend le MINIMUM partout (« 1 entretien par unité, on ajustera
    //     sur place ») : l'audit est sous-dimensionné, la couverture s'effondre au
    //     rapport, et §18.1.2 — « LA base objective du chiffrage » — est faux ;
    //   · celle qui recopie « 11-50 → 3 » en fourchette « 3-4 » ou « 3-6 » par
    //     symétrie avec les lignes voisines.
    //
    // Un plan « non vide » passe les cinq. Seules les valeurs les attrapent.
    const admin = await creerCompte('admin', 'n-minimaux');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'lead');

    const unites = new Map<number, string>();
    let position = 0;
    for (const effectif of EFFECTIFS_DE_CONTROLE) {
      position += 1;
      unites.set(
        effectif,
        await semerUnite({
          missionId: mission.id,
          nom: `Unite de controle ${String(effectif)} personnes`,
          effectif,
          position,
        }),
      );
    }

    const reponse = await lirePlan(mission.id, admin.jeton);
    expect(
      reponse.statut,
      `Le plan doit être servi à un membre de la mission. Réponse : ${String(reponse.statut)} ` +
        reponse.corps.slice(0, 500),
    ).toBe(200);
    const rendu = plan(reponse);

    const ecarts: string[] = [];
    for (const effectif of EFFECTIFS_DE_CONTROLE) {
      const attendue = regleDe(effectif);
      const orgUnitId = unites.get(effectif) ?? '';
      const proposee = unite(rendu, orgUnitId);
      if (proposee === undefined) {
        ecarts.push(`effectif ${String(effectif)} : unité ABSENTE du plan`);
        continue;
      }
      if (proposee.entretiens.min !== attendue.entretiensMin) {
        ecarts.push(
          `effectif ${String(effectif)} (tranche « ${attendue.tranche} ») : min = ` +
            `${String(proposee.entretiens.min)}, attendu ${String(attendue.entretiensMin)}`,
        );
      }
      if (proposee.entretiens.max !== attendue.entretiensMax) {
        ecarts.push(
          `effectif ${String(effectif)} (tranche « ${attendue.tranche} ») : max = ` +
            `${String(proposee.entretiens.max)}, attendu ${String(attendue.entretiensMax)}`,
        );
      }
    }

    expect(
      ecarts,
      'Le plan ne respecte pas les règles d’échantillonnage du §32.4 :\n' +
        '  unité ≤ 10 → 1-2 · 11-50 → 3 · 51-200 → 4-6 · > 200 → 6-10.\n' +
        'C’est le critère n° 4 du fichier 07 pour le lot L3, et c’est aussi la base\n' +
        'objective du chiffrage (§18.1.2) : un écart ici se retrouve dans un devis.\n' +
        `Écarts :\n  ${ecarts.join('\n  ')}`,
    ).toStrictEqual([]);
  });

  it('@critique les bornes 10/11, 50/51 et 200/201 basculent au BON endroit', async () => {
    // Le cas précédent contient déjà ces six effectifs ; celui-ci les ISOLE, et
    // c'est délibéré. Quand la table entière rougit, on lit « le plan est faux » ;
    // quand ce cas-ci rougit seul, on lit « l'inégalité est du mauvais côté », ce
    // qui est un diagnostic, pas un constat.
    const admin = await creerCompte('admin', 'bornes');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const paires: readonly { readonly bas: number; readonly haut: number }[] = [
      { bas: 10, haut: 11 },
      { bas: 50, haut: 51 },
      { bas: 200, haut: 201 },
    ];

    const ids = new Map<number, string>();
    let position = 0;
    for (const paire of paires) {
      for (const effectif of [paire.bas, paire.haut]) {
        position += 1;
        ids.set(effectif, await semerUnite({ missionId: mission.id, effectif, position }));
      }
    }

    const rendu = plan(await lirePlan(mission.id, admin.jeton));

    for (const paire of paires) {
      const enDessous = unite(rendu, ids.get(paire.bas) ?? '');
      const auDessus = unite(rendu, ids.get(paire.haut) ?? '');
      expect(
        enDessous?.entretiens.min,
        `La borne ${String(paire.bas)} appartient à la tranche BASSE : le §32.4 écrit ` +
          '« ≤ 10 », « 11-50 », « 51-200 » — bornes INCLUSES. Une inégalité stricte ' +
          'écrite à cet endroit fait basculer toute une catégorie d’unités.',
      ).toBe(regleDe(paire.bas).entretiensMin);
      expect(
        auDessus?.entretiens.min,
        `La borne ${String(paire.haut)} appartient à la tranche SUPÉRIEURE.`,
      ).toBe(regleDe(paire.haut).entretiensMin);
      expect(
        enDessous?.entretiens.min === auDessus?.entretiens.min,
        `Les effectifs ${String(paire.bas)} et ${String(paire.haut)} reçoivent le MÊME ` +
          'nombre minimal d’entretiens : la bascule de tranche n’a pas eu lieu du tout.',
      ).toBe(false);
    }
  });

  it('@critique les sessions complémentaires suivent la tranche : aucune sous 51, observation seule de 51 à 200, les trois au-delà de 200', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui propose une observation à TOUTES les unités « parce que c'est
    //     une bonne pratique » : le §32.4 ne la prévoit qu'à partir de 51, et
    //     l'ajouter partout gonfle le chiffrage d'une ligne par unité ;
    //   · celle qui oublie `releve_donnees` (le troisième d'une liste de trois est
    //     le plus souvent oublié) : les grandes unités perdent la seule session
    //     qui rapporte des chiffres, et le rapport se retrouve sans données dures ;
    //   · celle qui conserve l'observation de la tranche 51-200 mais laisse tomber
    //     la démonstration au-delà.
    const admin = await creerCompte('admin', 'complementaires');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const cas: readonly { readonly effectif: number; readonly attendus: readonly string[] }[] = [
      { effectif: 5, attendus: [] },
      { effectif: 30, attendus: [] },
      { effectif: 50, attendus: [] },
      { effectif: 51, attendus: ['observation'] },
      { effectif: 200, attendus: ['observation'] },
      { effectif: 201, attendus: ['demonstration', 'observation', 'releve_donnees'] },
      { effectif: 900, attendus: ['demonstration', 'observation', 'releve_donnees'] },
    ];

    const ids = new Map<number, string>();
    let position = 0;
    for (const item of cas) {
      position += 1;
      ids.set(
        item.effectif,
        await semerUnite({ missionId: mission.id, effectif: item.effectif, position }),
      );
    }

    const rendu = plan(await lirePlan(mission.id, admin.jeton));

    const ecarts: string[] = [];
    for (const item of cas) {
      const proposee = unite(rendu, ids.get(item.effectif) ?? '');
      if (proposee === undefined) {
        ecarts.push(`effectif ${String(item.effectif)} : unité absente du plan`);
        continue;
      }
      const obtenus = kindsComplementaires(proposee);
      if (JSON.stringify(obtenus) !== JSON.stringify([...item.attendus].sort())) {
        ecarts.push(
          `effectif ${String(item.effectif)} : [${obtenus.join(', ')}] ` +
            `au lieu de [${[...item.attendus].sort().join(', ')}]`,
        );
      }
      // « + 1 observation » est chiffré par le texte pour 51-200 ; la tranche
      // « > 200 » ne chiffre RIEN (ambiguïté rapportée au rapport A16). On exige
      // donc la lecture la plus faible compatible : au moins une de chaque.
      for (const session of proposee.sessionsComplementaires) {
        if (session.min !== undefined && session.min < 1) {
          ecarts.push(
            `effectif ${String(item.effectif)} : session ${session.kind} proposée à ` +
              `min = ${String(session.min)} — une session complémentaire annoncée puis ` +
              'chiffrée à zéro est un mensonge d’affichage',
          );
        }
      }
    }

    expect(
      ecarts,
      'Les sessions complémentaires du §32.4 ne suivent pas la tranche :\n' +
        '  51-200 → « + 1 observation » · > 200 → « observation + démonstration + relevé\n' +
        '  de données ». En dessous de 51, le pack n’en prévoit AUCUNE.\n' +
        `Écarts :\n  ${ecarts.join('\n  ')}`,
    ).toStrictEqual([]);
  });

  it('@critique un effectif INCONNU tombe dans la tranche minimale ET porte le drapeau `effectifInconnu`', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // DEUX FAÇONS OPPOSÉES DE NE PAS MENTIR — ET LA TENTATION DE LES CONFONDRE.
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui EXCLUT du plan les unités sans effectif « pour ne pas fausser
    //     le total » : elle fait disparaître du chiffrage les unités les moins
    //     bien connues, c'est-à-dire exactement celles qu'il faut aller voir. Et
    //     l'omission ne laisse aucune trace : le plan a l'air complet ;
    //   · celle qui traite `NULL` comme `0` SANS drapeau : le chiffre est le même,
    //     mais l'auditeur ne sait plus si « 1 entretien » vient d'une petite unité
    //     mesurée ou d'une unité dont personne n'a saisi l'effectif ;
    //   · celle qui range l'inconnu dans la tranche HAUTE « par prudence » :
    //     10 entretiens sur une unité de trois personnes.
    //
    // Le brief §5 tranche : tranche minimale ET drapeau — « jamais un silence ».
    const admin = await creerCompte('admin', 'effectif-inconnu');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const inconnue = await semerUnite({ missionId: mission.id, effectif: null, position: 1 });
    const connue = await semerUnite({ missionId: mission.id, effectif: 4, position: 2 });

    const rendu = plan(await lirePlan(mission.id, admin.jeton));

    const uInconnue = unite(rendu, inconnue);
    expect(
      uInconnue,
      'L’unité sans effectif a DISPARU du plan. Une unité qu’on ne sait pas dimensionner\n' +
        'reste une unité à auditer : la retirer, c’est décider en silence de ne pas y aller.',
    ).toBeDefined();
    expect(
      uInconnue?.effectifInconnu,
      'Le drapeau `effectifInconnu` doit valoir `true` : sans lui, « 1 entretien » ne se\n' +
        'distingue pas d’une petite unité réellement mesurée, et l’admin ne sait pas quelle\n' +
        'ligne de son arbre reste à renseigner.',
    ).toBe(true);
    expect(uInconnue?.effectif).toBeNull();
    expect(
      uInconnue?.entretiens.min,
      'Tranche MINIMALE pour un effectif inconnu (brief §5) : ni zéro, ni la tranche haute.',
    ).toBe(REGLES_ECHANTILLONNAGE[0]?.entretiensMin);
    expect(uInconnue?.entretiens.max).toBe(REGLES_ECHANTILLONNAGE[0]?.entretiensMax);

    const uConnue = unite(rendu, connue);
    expect(
      uConnue?.effectifInconnu,
      'CONTRE-ÉPREUVE : une unité dont l’effectif est saisi ne porte PAS le drapeau.\n' +
        'Sans elle, une implémentation qui met `true` partout serait verte ci-dessus.',
    ).toBe(false);
    expect(uConnue?.effectif).toBe(4);
  });

  it('@critique le total du plan, s’il est rendu, est la somme des unités — pas un chiffre indépendant', async () => {
    // Un total calculé à part dérive du détail à la première évolution des règles,
    // et c'est le total qui part au devis (§18.1.2). Deux chemins de calcul pour
    // un même chiffre, c'est un chiffre qui aura deux valeurs.
    const admin = await creerCompte('admin', 'total');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    for (const [index, effectif] of [3, 25, 120, 800].entries()) {
      await semerUnite({ missionId: mission.id, effectif, position: index + 1 });
    }

    const rendu = plan(await lirePlan(mission.id, admin.jeton));
    const sommeMin = rendu.unites.reduce((acc, u) => acc + u.entretiens.min, 0);
    const sommeMax = rendu.unites.reduce((acc, u) => acc + u.entretiens.max, 0);

    expect(sommeMin, 'somme des minima attendue : 1 + 3 + 4 + 6').toBe(14);
    expect(sommeMax, 'somme des maxima attendue : 2 + 3 + 6 + 10').toBe(21);

    if (rendu.totalEntretiens !== undefined) {
      expect(rendu.totalEntretiens.min).toBe(sommeMin);
      expect(rendu.totalEntretiens.max).toBe(sommeMax);
    }
  });
});

// =============================================================================
// 3. LA REPRODUCTIBILITÉ — DEUX GÉNÉRATIONS, UN SEUL PLAN
// =============================================================================
describe('GET /v1/missions/:id/interview-plan — reproductibilité', () => {
  it('@critique deux générations sur les mêmes données rendent le MÊME plan, unité par unité', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI C'EST UNE PROPRIÉTÉ DE PREMIER RANG, ET PAS UN CONFORT.
    // ═══════════════════════════════════════════════════════════════════════════
    // Le plan EST le chiffrage (§18.1.2) et il part au devis. S'il change entre
    // deux ouvertures d'écran, personne ne peut dire lequel a été vendu — et
    // l'écart réel/prévu de §18.3 se mesure alors contre une référence mouvante.
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · le tirage au sort dans la fourchette (« 1-2 → tirer 1 ou 2 ») ;
    //   · l'ordre laissé au SGBD : un `SELECT` sans `ORDER BY` total rend les
    //     lignes dans l'ordre physique, qui change dès qu'une ligne est mise à
    //     jour. Le plan a alors le même contenu et un ordre différent — assez pour
    //     qu'un `toEqual` d'export, un diff de PDF ou une comparaison de version
    //     signalent une modification qui n'a pas eu lieu ;
    //   · l'horodatage de génération glissé DANS chaque unité plutôt qu'en tête.
    const admin = await creerCompte('admin', 'reproductible');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    for (const [index, effectif] of [7, 40, 150, 400, 12, 60].entries()) {
      await semerUnite({ missionId: mission.id, effectif, position: index + 1 });
    }

    const premier = plan(await lirePlan(mission.id, admin.jeton));
    const second = plan(await lirePlan(mission.id, admin.jeton));

    expect(
      second.unites,
      'Les deux générations diffèrent. Tout ce qui est comparé ici est de la DONNÉE\n' +
        'de plan : identifiants d’unité, effectifs, fourchettes, sessions. L’ordre\n' +
        'compte aussi — `toStrictEqual` sur un tableau est ordonné, et c’est voulu :\n' +
        'un plan dont les lignes se réordonnent d’un appel à l’autre est illisible en\n' +
        'diff, donc invérifiable en revue.',
    ).toStrictEqual(premier.unites);
  });

  it('@critique aucune part de tirage : douze unités au MÊME effectif reçoivent la MÊME fourchette', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE CAS EXISTE PARCE QUE LE PRÉCÉDENT PEUT ÊTRE VERT PAR CHANCE.
    // ═══════════════════════════════════════════════════════════════════════════
    // Un générateur qui tire au sort dans « 1-2 » a une chance sur deux de rendre
    // deux fois la même valeur sur UNE unité. Sur douze unités, il faudrait que
    // les vingt-quatre tirages coïncident deux à deux : la probabilité tombe à
    // 2^-12, et le cas devient une preuve plutôt qu'un indice.
    //
    // C'est aussi la seule façon d'éprouver le mécanisme de reproductibilité EN
    // L'ABSENCE DE GRAINE : le §32.4 ne prescrit AUCUN échantillonnage aléatoire —
    // il donne des intervalles. Le brief §5 en tire la seule conclusion tenable :
    // « les fourchettes sont rendues comme des fourchettes, jamais tirées au sort
    // dans l'intervalle — un intervalle est une donnée, pas un tirage ». Aucune
    // graine n'est donc inventée ici : son absence EST le constat, et il est
    // remonté au rapport A16.
    const admin = await creerCompte('admin', 'sans-tirage');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    for (let index = 0; index < 12; index += 1) {
      await semerUnite({ missionId: mission.id, effectif: 6, position: index + 1 });
    }

    const rendu = plan(await lirePlan(mission.id, admin.jeton));
    expect(rendu.unites.length).toBe(12);

    const fourchettes = new Set(
      rendu.unites.map((u) => `${String(u.entretiens.min)}-${String(u.entretiens.max)}`),
    );
    expect(
      [...fourchettes],
      'Douze unités de six personnes ont reçu des fourchettes DIFFÉRENTES. Le §32.4\n' +
        'n’attache aucune variabilité à l’effectif : « ≤ 10 pers. → 1-2 entretiens » est\n' +
        'une règle, pas une distribution. Une valeur tirée au sort rendrait le chiffrage\n' +
        'non reproductible et, surtout, non justifiable devant le client.',
    ).toStrictEqual(['1-2']);
  });

  it('@critique la génération n’écrit RIEN : ni `interviews`, ni `work_assignments`', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LA LIMITE ARBITRÉE, ÉPROUVÉE COMME UNE PROPRIÉTÉ — PAS COMME UNE ABSENCE.
    // ═══════════════════════════════════════════════════════════════════════════
    // `interviews.conducted_by` est NOT NULL (04 + migration 0004) et l'escalade
    // est OUVERTE chez Williams (`DECISIONS.md` 2026-08-31). Tant qu'elle l'est,
    // le plan est une CIBLE : il ne nomme aucun auditeur et n'a nulle part où se
    // poser. Le 07 dit « plan d'entretiens GÉNÉRÉ », pas « persisté ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui, pour rendre le plan « utile », crée les lignes `interviews`
    // planifiées en leur donnant un propriétaire par défaut — l'appelant, le lead,
    // ou le premier membre venu. Ce propriétaire inventé devient alors le
    // fondement de la propriété d'écriture de sync (05 §9.9) : un auditeur
    // hériterait du droit d'écrire sur des sessions que personne ne lui a
    // confiées, et le `GET` d'un écran deviendrait un acte d'écriture.
    const admin = await creerCompte('admin', 'lecture-pure');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    await semerUnite({ missionId: mission.id, effectif: 300, position: 1 });
    await semerUnite({ missionId: mission.id, effectif: 8, position: 2 });

    const entretiensAvant = await compterEntretiens(mission.id);
    const affectationsAvant = await compterAffectations(mission.id);

    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Sans lui, ce cas serait VERT sur une route qui n'existe pas : un 404 n'écrit
    // rien non plus. Un test qui ne peut pas rougir ne prouve rien — on exige donc
    // que la génération ait EU LIEU avant de constater qu'elle n'a rien écrit.
    const premiere = await lirePlan(mission.id, admin.jeton);
    expect(
      premiere.statut,
      `Le plan doit être SERVI avant qu'on puisse dire qu'il n'écrit rien. Réponse : ` +
        `${String(premiere.statut)} ${premiere.corps.slice(0, 300)}`,
    ).toBe(200);
    expect(plan(premiere).unites.length).toBe(2);
    await lirePlan(mission.id, admin.jeton);

    expect(
      await compterEntretiens(mission.id),
      'La génération du plan a créé des lignes `interviews`. Elle ne le peut pas :\n' +
        '`conducted_by` est NOT NULL et le plan ne nomme aucun auditeur — le\n' +
        'propriétaire aurait donc été inventé. L’escalade est ouverte\n' +
        '(`DECISIONS.md` 2026-08-31) ; elle se tranche chez Williams, pas dans un\n' +
        'gestionnaire de route.',
    ).toBe(entretiensAvant);
    expect(
      await compterAffectations(mission.id),
      'La génération du plan a créé des `work_assignments`. Le plan est une CIBLE par\n' +
        'unité (§32.4) ; l’affectation à un auditeur est un acte SÉPARÉ et explicite\n' +
        '(§18.2), qui passe par `POST /v1/missions/:id/assignments`.',
    ).toBe(affectationsAvant);
  });
});

// =============================================================================
// 4. LE PLAN FACE À UN ARBRE RÉEL
// =============================================================================
describe('GET /v1/missions/:id/interview-plan — le plan face à l’arbre', () => {
  it('@critique les unités HORS PÉRIMÈTRE, PROPOSÉES et FUSIONNÉES n’entrent pas dans le plan', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui oublie `in_scope` : la règle V2.2 du §25.1 dit qu’une unité
    //     sortie du périmètre garde ses données mais est « exclue du scoring et de
    //     la couverture ». La replanifier revient à revendre ce qu’on a descopé ;
    //   · celle qui oublie `status` : une unité `proposee` (§25.3) est une
    //     HYPOTHÈSE du terrain que le siège n’a pas encore qualifiée. La chiffrer
    //     fait entrer dans le devis une unité qui n’existe peut-être pas ;
    //   · celle qui garde les `fusionnee` : leurs entretiens ont été re-rattachés
    //     à l’unité cible (§25.3), donc chaque entretien serait compté deux fois.
    const admin = await creerCompte('admin', 'perimetre');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const retenue = await semerUnite({ missionId: mission.id, effectif: 30, position: 1 });
    const horsPerimetre = await semerUnite({
      missionId: mission.id,
      effectif: 30,
      dansLePerimetre: false,
      position: 2,
    });
    const proposee = await semerUnite({
      missionId: mission.id,
      effectif: 30,
      statut: 'proposee',
      position: 3,
    });
    const fusionnee = await semerUnite({
      missionId: mission.id,
      effectif: 30,
      statut: 'fusionnee',
      position: 4,
    });

    const rendu = plan(await lirePlan(mission.id, admin.jeton));

    expect(
      rendu.unites.map((u) => u.orgUnitId),
      'Le plan ne retient QUE les unités `in_scope = true` ET `status = active`\n' +
        '(brief L3d §5 ; 03 §25.1 et §25.3). Toute autre entrée gonfle un chiffrage\n' +
        'qui part au devis.',
    ).toStrictEqual([retenue]);
    expect(unite(rendu, horsPerimetre)).toBeUndefined();
    expect(unite(rendu, proposee)).toBeUndefined();
    expect(unite(rendu, fusionnee)).toBeUndefined();
  });

  it('@critique une mission dont TOUTES les unités sont hors périmètre rend un plan VIDE, pas une erreur', async () => {
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · le 404 « pas de plan » : l'écran affiche « mission introuvable » alors
    //     que la mission existe, et l'admin cherche un bug là où il y a un
    //     périmètre entièrement descopé ;
    //   · le 500 sur un tableau vide (division par zéro d'une moyenne, `unites[0]`
    //     lu sans garde) ;
    //   · le 200 avec une liste vide et RIEN d'autre — techniquement correct, et
    //     inexploitable : c'est l'état vide sans son message (03 §17.6).
    const admin = await creerCompte('admin', 'perimetre-vide');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    await semerUnite({ missionId: mission.id, effectif: 12, dansLePerimetre: false, position: 1 });
    await semerUnite({ missionId: mission.id, effectif: 90, statut: 'proposee', position: 2 });

    const reponse = await lirePlan(mission.id, admin.jeton);
    expect(
      reponse.statut,
      'Une mission dont tout le périmètre est exclu est un ÉTAT LÉGITIME, pas une\n' +
        'erreur : le plan doit être servi, vide (hypothèse H7).',
    ).toBe(200);

    const rendu = plan(reponse);
    expect(rendu.unites).toStrictEqual([]);
    if (rendu.totalEntretiens !== undefined) {
      expect(rendu.totalEntretiens.min).toBe(0);
      expect(rendu.totalEntretiens.max).toBe(0);
    }
  });

  it('@critique un plan vide DIT POURQUOI il est vide — un état vide sans message est un bug d’affichage', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE CAS EST SÉPARÉ DU PRÉCÉDENT EXPRÈS.
    // ═══════════════════════════════════════════════════════════════════════════
    // Le précédent prouve que le produit ne CASSE pas ; celui-ci prouve qu'il
    // PARLE. Séparés, un rouge se lit du premier coup ; fondus, on ne sait pas si
    // c'est la route ou le message qui manque.
    //
    // 03 §17.6 (« états vides et messages d'erreur ») et la doctrine du brief §5
    // sur l'effectif inconnu (« jamais un silence ») convergent : un plan qui ne
    // peut rien proposer doit nommer la cause. `code` porte la cause machine,
    // `message` la phrase française affichable — convention transverse du
    // 2026-09-01. Le libellé du code n'est PAS asserté ici : il appartient à
    // l'implémenteur, et l'exiger serait inventer du vocabulaire.
    const admin = await creerCompte('admin', 'plan-vide-motive');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    await semerUnite({ missionId: mission.id, effectif: 12, dansLePerimetre: false, position: 1 });

    const rendu = plan(await lirePlan(mission.id, admin.jeton));
    expect(rendu.unites).toStrictEqual([]);
    expect(
      rendu.avertissements ?? [],
      'Le plan est vide et ne porte AUCUN avertissement. L’écran affichera une liste\n' +
        'vide sans cause, et l’admin ne saura pas s’il manque un arbre, si tout est hors\n' +
        'périmètre, ou si la génération a échoué. Forme attendue : [{ code, message }] —\n' +
        '`message` est une phrase française affichable (invariant 5), `code` la cause\n' +
        'machine (convention transverse du 2026-09-01).',
    ).not.toStrictEqual([]);

    for (const avertissement of rendu.avertissements ?? []) {
      expect(
        avertissement.message.trim().length,
        'Un avertissement à message vide ne vaut pas mieux qu’un silence.',
      ).toBeGreaterThan(0);
    }
  });

  it('@critique une mission SANS AUCUNE unité rend un plan vide et servi — pas un 404', async () => {
    // La mission existe, son arbre n'a pas encore été importé (03 §16.2 : l'arbre
    // est optionnel en pratique). C'est l'état NORMAL d'une mission le jour de sa
    // création, et c'est le premier écran qu'un admin ouvre.
    const admin = await creerCompte('admin', 'sans-arbre');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const reponse = await lirePlan(mission.id, admin.jeton);
    expect(reponse.statut).toBe(200);
    expect(plan(reponse).unites).toStrictEqual([]);
  });

  it('@critique une mission à UNE SEULE unité rend exactement une ligne, avec sa fourchette', async () => {
    // Le cas dégénéré des TPE, qui est le cas le plus fréquent de la Phase 1 : un
    // arbre à une unité. Une implémentation qui exigerait un parent, ou qui
    // écarterait la racine (« ce n'est pas une vraie unité »), rendrait un plan
    // vide sur toute une catégorie de missions.
    const admin = await creerCompte('admin', 'unite-seule');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    const seule = await semerUnite({
      missionId: mission.id,
      kind: 'etablissement',
      effectif: 9,
      position: 1,
    });

    const rendu = plan(await lirePlan(mission.id, admin.jeton));
    expect(rendu.unites.length).toBe(1);
    expect(unite(rendu, seule)?.entretiens).toStrictEqual({ min: 1, max: 2 });
  });

  it('@critique un arbre PROFOND : les sept niveaux du 04 sont tous planifiés, dans l’ordre `position, id`', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // ═══════════════════════════════════════════════════════════════════════════
    //   · celle qui ne retient que les FEUILLES : c'est l'intuition « on n'audite
    //     pas une direction, on audite ses services ». Le §17.3 dit l'inverse mot
    //     pour mot : « pour CHAQUE unité in_scope, l'outil propose les profils à
    //     rencontrer ». Une direction de 400 personnes disparaîtrait du plan avec
    //     ses six à dix entretiens — et §26.3 prévoit explicitement des audits
    //     partiels jusqu'au POSTE, donc des arbres où la feuille est un poste ;
    //   · celle qui s'arrête à une profondeur fixe (le `WITH RECURSIVE` borné à
    //     trois niveaux, ou la jointure écrite à la main pour « parent, enfant ») ;
    //   · celle qui trie sur `name` ou laisse le SGBD décider : deux exports du
    //     même plan ne se compareraient plus.
    //
    // NOTE D'HYPOTHÈSE : « toutes les unités in_scope, parents compris » est la
    // lecture littérale du §17.3. Elle implique qu'un effectif de parent recouvre
    // celui de ses enfants — le pack ne dit pas de le déduire, et déduire ici
    // inventerait une règle d'agrégation que personne n'a écrite. C'est remonté au
    // rapport A16 comme point à confirmer.
    const admin = await creerCompte('admin', 'arbre-profond');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');

    const niveaux = [
      { kind: 'groupe' as const, effectif: 4000 },
      { kind: 'filiale' as const, effectif: 900 },
      { kind: 'etablissement' as const, effectif: 210 },
      { kind: 'direction' as const, effectif: 180 },
      { kind: 'service' as const, effectif: 45 },
      { kind: 'equipe' as const, effectif: 11 },
      { kind: 'poste' as const, effectif: 1 },
    ];

    const ids: string[] = [];
    let parent: string | null = null;
    for (const [index, niveau] of niveaux.entries()) {
      const id: string = await semerUnite({
        missionId: mission.id,
        kind: niveau.kind,
        effectif: niveau.effectif,
        parentId: parent,
        // Positions VOLONTAIREMENT décroissantes : si le générateur triait par
        // profondeur, par `created_at` ou par ordre d'insertion, ce test serait
        // vert par coïncidence. Ici l'ordre attendu est l'INVERSE de l'insertion.
        position: niveaux.length - index,
      });
      ids.push(id);
      parent = id;
    }

    const rendu = plan(await lirePlan(mission.id, admin.jeton));

    expect(
      rendu.unites.length,
      'Les SEPT niveaux `org_units.kind` du 04 sont in_scope et actifs : les sept\n' +
        'doivent être planifiés. Un plan plus court signale une descente d’arbre bornée\n' +
        'ou une sélection réduite aux feuilles.',
    ).toBe(7);

    expect(
      rendu.unites.map((u) => u.orgUnitId),
      'L’ordre du plan doit être `org_units.position, id` (brief §5 : « l’ordre de\n' +
        'parcours est total et stable »). Les positions semées ici sont décroissantes\n' +
        'par rapport à l’ordre d’insertion : un tri par date de création ou par ordre\n' +
        'physique rendrait la liste à l’envers.',
    ).toStrictEqual([...ids].reverse());

    const ecarts = rendu.unites.flatMap((u) => {
      const effectif = u.effectif;
      if (effectif === null) return [`unité ${u.orgUnitId} : effectif perdu en route`];
      const attendue = regleDe(effectif);
      return u.entretiens.min === attendue.entretiensMin
        ? []
        : [
            `effectif ${String(effectif)} : min ${String(u.entretiens.min)} au lieu de ${String(attendue.entretiensMin)}`,
          ];
    });
    expect(
      ecarts,
      `Les n minimaux ne tiennent pas sur l’arbre profond :\n  ${ecarts.join('\n  ')}`,
    ).toStrictEqual([]);
  });

  it('@critique le plan LISTE les profils sans jamais les CHIFFRER (arbitrage du 2026-09-01)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LA LIMITE, ÉPROUVÉE DANS LE SENS OÙ ELLE PEUT ÊTRE VIOLÉE.
    // ═══════════════════════════════════════════════════════════════════════════
    // §17.3 et §18.1.2 réclament un plan « par unité ET PAR PROFIL ». La colonne
    // qui porterait le profil d'un interlocuteur (`interviews.interlocutor_profile_id`)
    // N'EXISTE PAS au 04. L'arbitrage du 2026-09-01 tranche : lister, jamais
    // chiffrer — « un chiffre faux est pire qu'un chiffre absent, et il ne se
    // signale pas ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // Celle qui, pour « rendre le plan complet », répartit les 4-6 entretiens
    // entre les profils (« 1 dirigeant, 2 encadrants, 3 terrain ») à partir d'une
    // clé inventée. Le chiffre a l'air d'une donnée, il sort au devis, et rien
    // dans le produit ne dit qu'il a été fabriqué.
    const admin = await creerCompte('admin', 'profils');
    const mission = await semerMission();
    await rattacher(mission.id, admin.id, 'consultant');
    await semerUnite({ missionId: mission.id, effectif: 120, position: 1 });

    const rendu = plan(await lirePlan(mission.id, admin.jeton));
    const profils = rendu.unites[0]?.profils;

    if (profils !== undefined) {
      const codesConnus = await bd().query<{ code: string }>(
        'SELECT code FROM interlocutor_profiles',
      );
      const referentiel = new Set(codesConnus.rows.map((ligne) => ligne.code));
      const inconnus = profils.filter((code) => !referentiel.has(code));
      expect(
        inconnus,
        'Le plan nomme des profils qui ne sont pas dans `interlocutor_profiles` (seed\n' +
          '11 §5 : dirigeant, dsi, daf, drh, resp_metier, chef_equipe, salarie,\n' +
          'technicien_operateur, autre). Un vocabulaire inventé ne se recroise avec rien.',
      ).toStrictEqual([]);
    }

    // La preuve NÉGATIVE, qui est celle qui compte : aucun chiffrage par profil,
    // sous quelque forme que ce soit. Le corps entier est balayé, pas seulement le
    // champ `profils` — une clé `entretiensParProfil` posée ailleurs serait la
    // même faute.
    const corps: unknown = JSON.parse((await lirePlan(mission.id, admin.jeton)).corps);
    const texte = JSON.stringify(corps);
    for (const motif of [
      'ParProfil',
      'parProfil',
      'par_profil',
      'profileCounts',
      'profilsChiffres',
    ]) {
      expect(
        texte.includes(motif),
        `Le plan porte « ${motif} » : un chiffrage par profil, alors que la donnée qui le\n` +
          'fonderait n’existe pas au 04. C’est exactement l’option 3 refusée le\n' +
          '2026-09-01 — déduire un chiffre d’une donnée que personne n’a saisie.',
      ).toBe(false);
    }
  });
});

// =============================================================================
// 5. `work_assignments` — QUI PEUT AFFECTER, ET CE QUI EST REFUSÉ (§18.2, §34.4)
// =============================================================================
describe('POST /v1/missions/:id/assignments', () => {
  it('@critique un admin affecte un auditeur habilité à une unité de la mission — et la ligne est en base', async () => {
    // La CONTRE-ÉPREUVE des refus qui suivent. Sans elle, une route qui refuse
    // tout le monde rendrait cette section entièrement verte — c'est-à-dire un
    // produit inutilisable, déclaré sûr.
    const admin = await creerCompte('admin', 'affect-ok');
    const auditeur = await creerCompte('consultant', 'affect-ok-cible');
    const mission = await semerMission();
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 40, position: 1 });

    const reponse = await creerAffectation(admin.jeton, mission.id, {
      userId: auditeur.id,
      orgUnitId: uniteId,
      plannedInterviews: 3,
      dateFrom: '2026-10-05',
      dateTo: '2026-10-09',
    });

    expect(
      reponse.statut,
      `L’affectation d’un auditeur habilité à une unité de la mission doit rendre 201.\n` +
        `Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 500)}`,
    ).toBe(201);

    const creee = affectation(reponse);
    expect(creee.missionId).toBe(mission.id);
    expect(creee.userId).toBe(auditeur.id);
    expect(creee.orgUnitId).toBe(uniteId);

    const enBase = await bd().query<{
      user_id: string;
      org_unit_id: string;
      planned_interviews: number | null;
    }>('SELECT user_id, org_unit_id, planned_interviews FROM work_assignments WHERE id = $1', [
      creee.id,
    ]);
    expect(
      enBase.rowCount,
      'La réponse annonce une affectation qui n’existe pas en base. Une route qui rend\n' +
        '201 sans écrire produit un plan de charge fantôme : l’écran d’équipe montre\n' +
        'l’auditeur affecté, et personne ne l’est.',
    ).toBe(1);
    expect(enBase.rows[0]?.user_id).toBe(auditeur.id);
    expect(enBase.rows[0]?.planned_interviews).toBe(3);
  });

  it('@critique affecter un auditeur NON HABILITÉ est refusé — la garde §34.4 n’a pas de porte de service', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // ═══════════════════════════════════════════════════════════════════════════
    // Celle qui applique la garde à `mission_users` — le seul endroit que le
    // §34.4 nomme littéralement — et pas à `work_assignments`. Elle est de bonne
    // foi : le texte dit « l'affectation à une mission réelle (`mission_users`)
    // est REFUSÉE si `habilitated_at` est NULL ». Mais la phrase qui la précède
    // dit ce qu'on protège : « un auditeur non habilité ne touche JAMAIS un
    // client ». Or `work_assignments` est ce qui envoie quelqu'un sur des unités
    // réelles avec des dates (§18.2), et aucune route n'écrit `mission_users`
    // (`DECISIONS.md` 2026-09-01) : la porte nommée est fermée, celle qu'on
    // emprunte réellement resterait ouverte.
    const admin = await creerCompte('admin', 'affect-non-habilite');
    const novice = await creerCompte('consultant', 'novice', { habilite: false });
    const mission = await semerMission();
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });

    const reponse = await creerAffectation(admin.jeton, mission.id, {
      userId: novice.id,
      orgUnitId: uniteId,
    });

    expect(
      reponse.statut,
      'Affecter un auditeur dont `habilitated_at` est NULL doit être REFUSÉ (§34.4,\n' +
        'brief §8-11). Le bac à sable et la cotation croisée sont la condition d’entrée\n' +
        'chez un client — les contourner par la porte de service annule le dispositif.',
    ).toBe(403);
    expect(
      reponse.code,
      'Le code doit distinguer « pas habilité » de « pas le droit » : ce sont deux\n' +
        'causes, deux gestes correctifs (habiliter vs changer de rôle), et\n' +
        '`ERROR_CODES.NOT_HABILITATED` existe exactement pour cela.',
    ).toBe(ERROR_CODES.NOT_HABILITATED);

    expect(
      await compterAffectations(mission.id),
      'Le refus a laissé une ligne. Un refus qui écrit est pire qu’une autorisation :\n' +
        'il produit un état que personne n’a voulu et que rien n’explique.',
    ).toBe(0);
  });

  it('@critique le doublon `(mission, auditeur, unité)` est refusé et n’écrit pas une seconde ligne', async () => {
    // La contrainte UNIQUE du 04 (§18.2) est la vraie garantie ; ce qui est
    // éprouvé ici, c'est qu'elle remonte en ERREUR MÉTIER et non en 500. Une
    // violation de contrainte qui traverse la couche HTTP telle quelle apprend au
    // client le nom des tables et rend l'écran inutilisable.
    const admin = await creerCompte('admin', 'affect-doublon');
    const auditeur = await creerCompte('consultant', 'affect-doublon-cible');
    const mission = await semerMission();
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 15, position: 1 });

    const premiere = await creerAffectation(admin.jeton, mission.id, {
      userId: auditeur.id,
      orgUnitId: uniteId,
    });
    expect(premiere.statut).toBe(201);

    const seconde = await creerAffectation(admin.jeton, mission.id, {
      userId: auditeur.id,
      orgUnitId: uniteId,
      plannedInterviews: 9,
    });

    expect(
      seconde.statut,
      'Le 04 pose `UNIQUE(mission_id, user_id, org_unit_id)` : un second appel sur le\n' +
        'même triplet est un CONFLIT, pas une erreur interne et pas un doublon silencieux.',
    ).toBe(409);
    expect(seconde.code).toBe(ERROR_CODES.CONFLICT);
    expect(
      await compterAffectations(mission.id),
      'Une seule ligne doit subsister : ni doublon, ni écrasement silencieux de la\n' +
        'première (invariant 7 — rien n’est jamais silencieusement écrasé).',
    ).toBe(1);

    const inchangee = await bd().query<{ planned_interviews: number | null }>(
      'SELECT planned_interviews FROM work_assignments WHERE mission_id = $1',
      [mission.id],
    );
    expect(
      inchangee.rows[0]?.planned_interviews,
      'Le refus ne doit pas avoir mis à jour la ligne existante au passage : un `POST`\n' +
        'qui se transforme en `UPDATE` sur conflit est une modification que l’appelant\n' +
        'n’a pas demandée.',
    ).toBeNull();
  });

  it('@critique affecter à une unité d’une AUTRE mission est refusé, et rien n’est écrit', async () => {
    // Le 04 ne porte AUCUNE contrainte croisée entre `work_assignments.mission_id`
    // et `org_units.mission_id` : les deux FK sont indépendantes, et rien
    // n'empêche la base d'accepter la ligne. La cohérence doit donc venir du
    // service — sinon un auditeur se voit affecter une unité qui n'appartient pas
    // à la mission, et l'écran de couverture (§16.6) croise deux arbres.
    //
    // LE STATUT N'EST PAS TRANCHÉ PAR LE PACK : l'assertion porte sur le REFUS et
    // sur l'absence d'écriture, pas sur le choix entre 400, 404 et 409. C'est
    // signalé au rapport A16 plutôt que deviné.
    const admin = await creerCompte('admin', 'affect-croisee');
    const auditeur = await creerCompte('consultant', 'affect-croisee-cible');
    const mission = await semerMission();
    const autre = await semerMission();
    const uniteEtrangere = await semerUnite({ missionId: autre.id, effectif: 20, position: 1 });

    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une route absente refuse tout : sans cette affectation NOMINALE préalable,
    // le cas serait vert sur un 404 générique et ne prouverait rien du cloisonnement.
    const uniteLegitime = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const nominale = await creerAffectation(admin.jeton, mission.id, {
      userId: auditeur.id,
      orgUnitId: uniteLegitime,
    });
    expect(
      nominale.statut,
      `La route doit accepter une affectation légitime, sinon le refus qui suit ne ` +
        `prouve rien. Réponse : ${String(nominale.statut)} ${nominale.corps.slice(0, 300)}`,
    ).toBe(201);

    const reponse = await creerAffectation(admin.jeton, mission.id, {
      userId: auditeur.id,
      orgUnitId: uniteEtrangere,
    });

    expect(
      reponse.statut >= 400,
      `L’unité appartient à une autre mission : l’affectation doit être refusée.\n` +
        `Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 400)}`,
    ).toBe(true);
    expect(
      reponse.statut,
      'Et le refus doit être une erreur MÉTIER, jamais un 500 : une violation de\n' +
        'cohérence qui remonte en erreur interne dit au client que le serveur a planté\n' +
        'là où il a simplement refusé.',
    ).toBeLessThan(500);
    expect(
      await compterAffectations(mission.id),
      'Seule l’affectation légitime doit subsister : celle qui pointe une unité d’une\n' +
        'autre mission n’a pas été écrite.',
    ).toBe(1);
    expect(await compterAffectations(autre.id)).toBe(0);
  });

  it('@critique un corps invalide est refusé en 400, avec le format d’erreur unique (11 §3)', async () => {
    const admin = await creerCompte('admin', 'affect-invalide');
    const mission = await semerMission();

    const reponse = await creerAffectation(admin.jeton, mission.id, {
      userId: 'ceci-n-est-pas-un-uuid',
      orgUnitId: 42,
    });

    expect(reponse.statut).toBe(400);
    expect(
      reponse.code,
      'Les codes vivent dans `ERROR_CODES` (packages/shared) — jamais un littéral libre\n' +
        '(11 §3). Un code inventé côté route casse le front, qui compare à la constante.',
    ).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(
      reponse.message,
      'Le message est en FRANÇAIS et affichable (invariant 5, 11 §3).',
    ).not.toBeNull();
  });
});

describe('GET /v1/missions/:id/assignments', () => {
  it('@critique la liste est paginée en KEYSET : aucune ligne sautée ni servie deux fois', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    // ═══════════════════════════════════════════════════════════════════════════
    //   · `LIMIT/OFFSET` déguisé en curseur : sur une liste qui bouge, l'offset
    //     saute ou duplique des lignes (11 §3, « jamais d'offset ») ;
    //   · le curseur qui rend la ligne frontière une seconde fois (`>=` au lieu de
    //     `>`) : la pagination boucle, l'écran d'équipe se remplit du même
    //     auditeur, et cela ne se voit qu'au-delà d'une page ;
    //   · `nextCursor` toujours non nul : le client ne sait jamais qu'il a fini.
    const admin = await creerCompte('admin', 'liste-keyset');
    const auditeur = await creerCompte('consultant', 'liste-keyset-cible');
    const mission = await semerMission();

    const attendues: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const uniteId = await semerUnite({
        missionId: mission.id,
        effectif: 12,
        position: index + 1,
      });
      const reponse = await creerAffectation(admin.jeton, mission.id, {
        userId: auditeur.id,
        orgUnitId: uniteId,
      });
      expect(reponse.statut, `création ${String(index)} : ${reponse.corps.slice(0, 300)}`).toBe(
        201,
      );
      attendues.push(affectation(reponse).id);
    }

    const vues: string[] = [];
    let curseur: string | null = null;
    let gardeFou = 0;
    do {
      gardeFou += 1;
      expect(gardeFou, 'la pagination boucle : plus de 10 pages pour 5 lignes').toBeLessThan(10);
      const url =
        `/v1/missions/${mission.id}/assignments?limit=2` +
        (curseur === null ? '' : `&after=${encodeURIComponent(curseur)}`);
      const reponse = await appeler('GET', url, { jeton: admin.jeton });
      expect(reponse.statut, `liste refusée : ${reponse.corps.slice(0, 300)}`).toBe(200);
      const page = pageAffectations(reponse);
      vues.push(...page.items.map((item) => item.id));
      curseur = page.nextCursor;
    } while (curseur !== null);

    expect(
      [...new Set(vues)].length,
      'Une ligne a été servie DEUX FOIS : le curseur reprend à la ligne frontière au\n' +
        'lieu de la dépasser. Sur une liste plus longue, la pagination ne se termine\n' +
        'jamais.',
    ).toBe(vues.length);
    expect(
      [...vues].sort(),
      'La pagination a perdu des lignes en route. Un plan de charge incomplet ne se\n' +
        'signale pas : il ressemble à un plan de charge.',
    ).toStrictEqual([...attendues].sort());
  });

  it('@critique la liste ne rend QUE les affectations de la mission demandée', async () => {
    // Le filtre par mission est la première chose qu'on oublie quand on écrit un
    // dépôt à partir d'un `SELECT *`. Ici la fuite est douce : on voit des
    // auditeurs affectés à d'autres clients, sur un écran qui a l'air normal.
    const admin = await creerCompte('admin', 'liste-cloisonnee');
    const auditeur = await creerCompte('consultant', 'liste-cloisonnee-cible');
    const mission = await semerMission();
    const autre = await semerMission();

    const uniteA = await semerUnite({ missionId: mission.id, effectif: 12, position: 1 });
    const uniteB = await semerUnite({ missionId: autre.id, effectif: 12, position: 1 });
    const chezNous = affectation(
      await creerAffectation(admin.jeton, mission.id, { userId: auditeur.id, orgUnitId: uniteA }),
    );
    await creerAffectation(admin.jeton, autre.id, { userId: auditeur.id, orgUnitId: uniteB });

    const page = pageAffectations(
      await appeler('GET', `/v1/missions/${mission.id}/assignments?limit=50`, {
        jeton: admin.jeton,
      }),
    );
    expect(page.items.map((item) => item.id)).toStrictEqual([chezNous.id]);
  });

  it('@critique les dates rendues ne portent JAMAIS de décalage local (11 §3, invariant 5)', async () => {
    // `date_from`/`date_to` sont des DATE au 04 : ni heure, ni fuseau. Les rendre
    // comme un instant local (`2026-10-05T00:00:00+02:00`) décale la journée d'un
    // cran pour la moitié de l'année, et la mission qui commence « le 5 » démarre
    // le 4 sur l'écran d'un auditeur. Le fuseau de mission est un geste
    // d'AFFICHAGE (§22.2), jamais un geste d'API.
    const admin = await creerCompte('admin', 'dates');
    const auditeur = await creerCompte('consultant', 'dates-cible');
    const mission = await semerMission();
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 12, position: 1 });

    const creee = affectation(
      await creerAffectation(admin.jeton, mission.id, {
        userId: auditeur.id,
        orgUnitId: uniteId,
        dateFrom: '2026-10-05',
        dateTo: '2026-10-09',
      }),
    );

    for (const [nom, valeur] of [
      ['dateFrom', creee.dateFrom],
      ['dateTo', creee.dateTo],
    ] as const) {
      if (valeur === null || valeur === undefined) continue;
      expect(
        /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(valeur),
        `\`${nom}\` vaut « ${valeur} » : ce n’est ni une date simple (AAAA-MM-JJ) ni un\n` +
          'instant UTC terminé par Z. Le 11 §3 impose ISO 8601 UTC en API ; un décalage\n' +
          'local (+02:00) fait glisser la journée d’un cran une partie de l’année.',
      ).toBe(true);
    }
    expect(creee.dateFrom).toBe('2026-10-05');
  });
});

// =============================================================================
// 6. `PATCH /v1/interviews/:id/reassign` — §34.4
// =============================================================================
describe('PATCH /v1/interviews/:id/reassign — ce qui est autorisé', () => {
  it('@critique un admin réaffecte une session PLANIFIÉE NON COMMENCÉE, et la base le montre', async () => {
    const admin = await creerCompte('admin', 'reassign-admin');
    const ancien = await creerCompte('consultant', 'reassign-ancien');
    const nouveau = await creerCompte('consultant', 'reassign-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
      statut: 'non_demarre',
      statutAgenda: 'planifie',
    });

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });

    expect(
      reponse.statut,
      `La réaffectation d’une session non commencée est le geste NOMINAL du runbook de\n` +
        `sortie (§34.4-3). Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 500)}`,
    ).toBe(200);
    expect(
      await proprietaireEnBase(entretien),
      'La VÉRITÉ est en base : `interviews.conducted_by` doit désigner le nouvel\n' +
        'auditeur, sans quoi il ne récupérera rien à son prochain pull (§34.4-3) et\n' +
        'l’ancien gardera un droit d’écriture de sync (05 §9.9) qu’on croyait retiré.',
    ).toBe(nouveau.id);
  });

  it('@critique le LEAD de la mission peut réaffecter — §34.3, et ce droit ne vient pas du rôle global', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI CE CAS NE PEUT PAS ÊTRE COUVERT PAR LA POLITIQUE DE ROUTE.
    // ═══════════════════════════════════════════════════════════════════════════
    // `PolitiqueAcces` est une union exclusive et « lead » n'est PAS un rôle
    // global (`users.role`) : c'est `mission_users.role_on_mission`, une propriété
    // de LIGNE. Le crochet d'autorisation ne peut donc pas l'exprimer, et A01 a
    // refusé de l'élargir (`DECISIONS.md` 2026-08-29). La garde vit dans le
    // service — donc elle n'est PAS couverte par la vérification de totalité au
    // démarrage, et elle se teste explicitement, ici, ou nulle part.
    const lead = await creerCompte('consultant', 'reassign-lead');
    const ancien = await creerCompte('consultant', 'reassign-lead-ancien');
    const nouveau = await creerCompte('consultant', 'reassign-lead-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, lead.id, 'lead');
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
    });

    const reponse = await reaffecter(lead.jeton, entretien, {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });

    expect(
      reponse.statut,
      'Le §34.3 donne au lead, SUR SA MISSION, le pouvoir de « réaffecter une session\n' +
        'PLANIFIÉE non commencée ». Un refus ici enlève au lead le seul geste qui lui\n' +
        'permet d’absorber l’absence d’un auditeur sans appeler l’admin.',
    ).toBe(200);
    expect(await proprietaireEnBase(entretien)).toBe(nouveau.id);
  });
});

describe('PATCH /v1/interviews/:id/reassign — ce qui est refusé', () => {
  it('@critique une session EN COURS ou TERMINÉE n’est jamais réaffectée — `conducted_by` est immuable après coup', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE CŒUR DU §34.4, ET LA FAUTE QUI NE SE VOIT QU'AU RAPPORT.
    // ═══════════════════════════════════════════════════════════════════════════
    // « Les sessions RÉALISÉES restent à leur auteur (`conducted_by` immuable
    // après coup : l'historique d'un audit ne se réécrit jamais) ».
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui teste `schedule_status` au lieu de `status` : ce sont deux
    //     colonnes distinctes au 04 (§25.2 vs V2.9), et une session peut être
    //     `schedule_status = 'planifie'` ET `status = 'en_cours'` — l'auditeur a
    //     commencé sans que l'agenda soit rafraîchi. Le test ci-dessous met
    //     précisément les deux colonnes en désaccord ;
    //   · celle qui autorise `termine` « puisque de toute façon c'est fini » :
    //     chaque réponse portée par cet entretien change alors d'auteur, et la
    //     provenance de la donnée d'audit devient fausse rétroactivement ;
    //   · celle qui refuse mais écrit quand même la colonne avant de refuser.
    const admin = await creerCompte('admin', 'reassign-en-cours');
    const ancien = await creerCompte('consultant', 'reassign-en-cours-ancien');
    const nouveau = await creerCompte('consultant', 'reassign-en-cours-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });

    for (const statut of ['en_cours', 'termine'] as const) {
      const entretien = await semerEntretien({
        missionId: mission.id,
        orgUnitId: uniteId,
        conduitPar: ancien.id,
        statut,
        // L'agenda dit « planifié » alors que la session est commencée : c'est le
        // cas réel d'un auditeur qui démarre sans toucher son planning, et c'est
        // celui qui piège une garde posée sur la mauvaise colonne.
        statutAgenda: 'planifie',
      });

      const reponse = await reaffecter(admin.jeton, entretien, {
        newUserId: nouveau.id,
        motif: MOTIF_REAFFECTATION,
      });

      expect(
        reponse.statut,
        `Session au statut « ${statut} » : la réaffectation est refusée par le §34.4\n` +
          '(« autorisé UNIQUEMENT si status ≠ en_cours/termine »). C’est un CONFLIT\n' +
          'd’état, pas un défaut de droit : l’appelant a bien le droit, c’est la session\n' +
          'qui ne peut plus changer de main.',
      ).toBe(409);
      expect(reponse.code).toBe(ERROR_CODES.CONFLICT);
      expect(
        reponse.message,
        'Le message doit NOMMER l’état qui bloque (brief §6), en français : sans cela,\n' +
          'l’admin voit « conflit » et ne sait pas s’il doit attendre, annuler ou forcer.',
      ).not.toBeNull();
      expect(
        await proprietaireEnBase(entretien),
        'Le refus a tout de même écrit `conducted_by`. C’est la pire des issues :\n' +
          'l’historique est réécrit ET l’appelant croit que rien ne s’est passé.',
      ).toBe(ancien.id);
    }
  });

  it('@critique réaffecter vers un auditeur NON HABILITÉ est refusé (§34.4)', async () => {
    // La même porte de service que pour `work_assignments`, dans l'autre sens :
    // si `reassign` ne reprend pas la garde, il suffit de créer la session au nom
    // d’un habilité puis de la réaffecter au novice pour le mettre en clientèle.
    const admin = await creerCompte('admin', 'reassign-non-habilite');
    const ancien = await creerCompte('consultant', 'reassign-nh-ancien');
    const novice = await creerCompte('consultant', 'reassign-nh-novice', { habilite: false });
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, novice.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
    });

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: novice.id,
      motif: MOTIF_REAFFECTATION,
    });

    expect(reponse.statut).toBe(403);
    expect(reponse.code).toBe(ERROR_CODES.NOT_HABILITATED);
    expect(await proprietaireEnBase(entretien)).toBe(ancien.id);
  });

  it('@critique réaffecter vers quelqu’un qui n’est PAS MEMBRE de la mission est refusé', async () => {
    // Sans cette garde, la réaffectation devient une porte d'entrée dans une
    // mission : elle donne à un compte extérieur la propriété d'une session, donc
    // le droit d'y écrire par sync (05 §9.9) — sans qu'aucune ligne de
    // `mission_users` ne l'y ait jamais rattaché.
    const admin = await creerCompte('admin', 'reassign-etranger');
    const ancien = await creerCompte('consultant', 'reassign-etranger-ancien');
    const etranger = await creerCompte('consultant', 'reassign-etranger-cible');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
    });

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: etranger.id,
      motif: MOTIF_REAFFECTATION,
    });

    expect(reponse.statut).toBe(403);
    expect(await proprietaireEnBase(entretien)).toBe(ancien.id);
  });

  it('@critique un motif absent, vide, en texte libre ou hors vocabulaire est refusé en 400', async () => {
    // §34.4 écrit la route avec son motif : `{new_user_id, motif}`. Un motif
    // facultatif rendrait la trace inutilisable — « qui » sans « pourquoi » ne
    // permet ni de contester ni de comprendre après coup.
    //
    // ARBITRAGE DU 2026-09-02 : le motif est un CODE de `MOTIFS_REAFFECTATION`.
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui garde `z.string().min(1)` « pour ne pas casser les appelants » :
    //     un texte libre passe, arrive dans `meta.motif`, et le journal redevient
    //     l'endroit où un nom de personne peut être écrit à la main — exactement ce
    //     que l'option 2 de l'escalade refusait ;
    //   · celle qui accepte un code PLAUSIBLE mais absent de la liste
    //     (`indisponibilite`, `depart`) : deux orthographes pour un même motif, et
    //     toute recherche d'audit par motif devient incomplète sans le dire.
    const admin = await creerCompte('admin', 'reassign-motif');
    const ancien = await creerCompte('consultant', 'reassign-motif-ancien');
    const nouveau = await creerCompte('consultant', 'reassign-motif-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });

    // Texte libre PLAUSIBLE : c'est l'ancien contrat, et c'est le refus qui compte.
    const texteLibre = 'Auditeur indisponible sur la periode : reprise par un collegue.';
    for (const corps of [
      { newUserId: nouveau.id },
      { newUserId: nouveau.id, motif: '' },
      { newUserId: nouveau.id, motif: '   ' },
      { newUserId: nouveau.id, motif: texteLibre },
      { newUserId: nouveau.id, motif: 'indisponibilite' },
      { newUserId: nouveau.id, motif: 'INDISPONIBILITE_AUDITEUR' },
    ]) {
      const entretien = await semerEntretien({
        missionId: mission.id,
        orgUnitId: uniteId,
        conduitPar: ancien.id,
      });
      const reponse = await reaffecter(admin.jeton, entretien, corps);
      expect(
        reponse.statut,
        `Corps ${JSON.stringify(corps)} : le motif est obligatoire (§34.4) et doit être un\n` +
          `code de MOTIFS_REAFFECTATION (${MOTIFS_REAFFECTATION.join(', ')}). Un texte libre,\n` +
          'un code approchant ou une casse différente sont des motifs qui ont passé la\n' +
          'validation sans appartenir au vocabulaire.',
      ).toBe(400);
      expect(reponse.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(await proprietaireEnBase(entretien)).toBe(ancien.id);
    }
  });

  it('@critique une session PLANIFIÉE SANS AUDITEUR reçoit son premier auditeur par `reassign` — trace avec `auditeur_avant: null`', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // L'AMENDEMENT DU 04 DU 2026-09-02, ÉPROUVÉ LÀ OÙ IL CHANGE QUELQUE CHOSE.
    // ═══════════════════════════════════════════════════════════════════════════
    // `interviews.conducted_by` est désormais NULLABLE (migration 0014) : une
    // session planifiée peut n'avoir aucun auditeur — c'est la ligne que le plan
    // §32.4 produira le jour où `/apply` existera. `reassign` sur une telle session
    // est une PREMIÈRE AFFECTATION, permise.
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui lit `conducted_by` comme un `string` et refuse le `null` en 409
    //     ou plante en 500 : la session sans auditeur devient INAFFECTABLE, et le
    //     seul chemin qui restait est un UPDATE à la main ;
    //   · celle qui journalise `auditeur_avant` avec un identifiant INVENTÉ (celui de
    //     l'appelant, ou une chaîne vide) parce que le schéma « veut un uuid » :
    //     la trace dit qu'un auditeur a été dépossédé alors qu'il n'y en avait pas ;
    //   · celle qui, comparant `null === newUserId`, tombe dans la branche « même
    //     auditeur → 409 » par un `??` mal placé.
    const admin = await creerCompte('admin', 'premiere-affectation');
    const nouveau = await creerCompte('consultant', 'premiere-affectation-cible');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: null,
      statut: 'non_demarre',
      statutAgenda: 'planifie',
    });
    expect(
      await proprietaireEnBase(entretien),
      'prérequis : la base accepte NULL (0014)',
    ).toBeNull();

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: nouveau.id,
      motif: 'repartition_revue',
    });
    expect(
      reponse.statut,
      `La première affectation d'une session sans auditeur doit passer (arbitrage du\n` +
        `2026-09-02). Réponse : ${String(reponse.statut)} ${reponse.corps.slice(0, 500)}`,
    ).toBe(200);

    const corps = z
      .object({ conductedByAvant: z.uuid().nullable(), conductedByApres: z.uuid() })
      .safeParse(JSON.parse(reponse.corps));
    expect(
      corps.success,
      'La réponse doit porter `conductedByAvant` (nullable) et `conductedByApres`.\n' +
        `Corps reçu : ${reponse.corps.slice(0, 400)}`,
    ).toBe(true);
    if (corps.success) {
      expect(
        corps.data.conductedByAvant,
        '`conductedByAvant` doit être `null` : il n’y avait personne. Un identifiant ici\n' +
          'est un auditeur inventé.',
      ).toBeNull();
      expect(corps.data.conductedByApres).toBe(nouveau.id);
    }
    expect(await proprietaireEnBase(entretien)).toBe(nouveau.id);

    const lignes = (await lignesJournal(entretien)).filter((l) => l.entity_type === 'interview');
    expect(lignes.length, 'une première affectation est tracée comme toute réaffectation').toBe(1);
    const meta = z
      .object({
        auditeur_avant: z.uuid().nullable(),
        auditeur_apres: z.uuid(),
        motif: z.string(),
        mission_id: z.uuid(),
      })
      .safeParse(lignes[0]?.meta);
    expect(
      meta.success,
      `\`meta\` doit porter auditeur_avant (nullable), auditeur_apres, motif et mission_id — en snake_case : le journal PROJETTE les clés avant d’écrire (11 §3, snake_case en base), et cette lecture est faite EN BASE. Reçu :\n` +
        JSON.stringify(lignes[0]?.meta),
    ).toBe(true);
    if (meta.success) {
      expect(
        meta.data.auditeur_avant,
        '`auditeur_avant: null` — personne n’a été dépossédé',
      ).toBeNull();
      expect(meta.data.auditeur_apres).toBe(nouveau.id);
      expect(meta.data.motif).toBe('repartition_revue');
      expect(meta.data.mission_id).toBe(mission.id);
    }
  });

  it('@critique réaffecter vers l’auditeur DÉJÀ en place est refusé en 409 — sauf depuis une session sans auditeur', async () => {
    // Une réaffectation vers soi-même n'est pas un geste : elle ne change rien, mais
    // elle laisserait une trace disant qu'un changement a eu lieu. Le refus protège
    // le journal d'événements vides. La CONTRE-ÉPREUVE (depuis `null`) est portée
    // par le cas précédent : ici, on vérifie que le 409 ne déborde pas sur elle.
    const admin = await creerCompte('admin', 'reassign-meme');
    const auditeur = await creerCompte('consultant', 'reassign-meme-auditeur');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, auditeur.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: auditeur.id,
    });

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: auditeur.id,
      motif: MOTIF_REAFFECTATION,
    });
    expect(
      reponse.statut,
      'Réaffecter une session à l’auditeur qui la détient déjà est un 409 (arbitrage du\n' +
        '2026-09-02) : rien ne change, rien ne doit être tracé.',
    ).toBe(409);
    expect(await proprietaireEnBase(entretien)).toBe(auditeur.id);
    expect(
      (await lignesJournal(entretien)).filter((l) => l.entity_type === 'interview'),
      'Un refus « même auditeur » ne laisse aucune trace d’entité.',
    ).toStrictEqual([]);
  });

  it('@critique une session inexistante rend 404, sans rien apprendre de plus', async () => {
    const admin = await creerCompte('admin', 'reassign-inconnu');
    const ancien = await creerCompte('consultant', 'reassign-inconnu-ancien');
    const nouveau = await creerCompte('consultant', 'reassign-inconnu-cible');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const existante = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
    });

    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une route non montée rend 404 sur TOUT : sans cette réaffectation réelle,
    // le cas serait vert précisément quand la route n'existe pas.
    const nominale = await reaffecter(admin.jeton, existante, {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });
    expect(
      nominale.statut,
      `La route doit servir une session RÉELLE, sinon le 404 qui suit ne distingue pas ` +
        `« session inconnue » de « route absente ». Réponse : ${String(nominale.statut)} ` +
        nominale.corps.slice(0, 300),
    ).toBe(200);

    const reponse = await reaffecter(admin.jeton, uuidv7(), {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });
    expect(reponse.statut).toBe(404);
    expect(reponse.code).toBe(ERROR_CODES.NOT_FOUND);
  });
});

// =============================================================================
// 7. LA TRACE DE LA RÉAFFECTATION — INVARIANT 7, ET LA LIMITE DU JOURNAL
// =============================================================================
describe('reassign — ce qui est TRACÉ (invariant 7, 11 §2)', () => {
  it('@critique une réaffectation laisse une trace nommant la session, son auteur, l’avant et l’après', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI LA TRACE EST LE VRAI LIVRABLE DE CETTE ROUTE.
    // ═══════════════════════════════════════════════════════════════════════════
    // Invariant 7 : « toute correction de donnée = révision tracée ; rien n'est
    // jamais silencieusement écrasé ». Une réaffectation ÉCRASE la seule colonne
    // qui dit à qui appartient une session — et donc qui a le droit d'y écrire
    // (05 §9.9). Une fois écrasée, l'ancienne valeur n'existe plus nulle part :
    // s'il n'y a pas de trace, il n'y a plus de moyen de savoir que la session a
    // changé de main, ni depuis qui.
    //
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ?
    //   · celle qui écrit `conducted_by` et journalise « quelque chose » sans
    //     l'ANCIENNE valeur : on sait qu'il y a eu réaffectation, on ne sait plus
    //     d'où elle vient. C'est le cas le plus fréquent, parce que l'ancienne
    //     valeur est justement celle qu'on vient d'écraser ;
    //   · celle qui journalise sans `user_id` : une trace anonyme dit qu'il s'est
    //     passé quelque chose, jamais qui l'a fait.
    const admin = await creerCompte('admin', 'trace-reassign');
    const ancien = await creerCompte('consultant', 'trace-ancien');
    const nouveau = await creerCompte('consultant', 'trace-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
    });

    expect((await lignesJournal(entretien)).length).toBe(0);

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });
    expect(reponse.statut, `réaffectation refusée : ${reponse.corps.slice(0, 400)}`).toBe(200);

    const lignes = await lignesJournal(entretien);
    expect(
      lignes.length,
      'Aucune ligne d’`activity_log` ne porte cette session. Le §34.4 écrit la route\n' +
        'AVEC sa trace (« admin/lead, `activity_log` »), et l’invariant 7 en fait une\n' +
        'règle du produit entier : le seul acte qui écrase un propriétaire ne peut pas\n' +
        'être le seul à ne rien laisser derrière lui.',
    ).toBeGreaterThan(0);

    expect(
      lignes.map((ligne) => ligne.user_id).includes(admin.id),
      'La trace doit porter l’AUTEUR du geste.',
    ).toBe(true);
    expect(
      lignes.map((ligne) => ligne.entity_type),
      'L’`entity_type` doit désigner la session (`interview`) : l’index\n' +
        '`activity_log(entity_type, entity_id)` du 04 §7.1 n’a de sens que si le\n' +
        'vocabulaire est fermé — deux orthographes rendent toute recherche d’audit\n' +
        'incomplète, et une recherche incomplète ne se signale pas.',
    ).toContain('interview');

    const texte = JSON.stringify(lignes.map((ligne) => ligne.meta));
    expect(
      texte.includes(ancien.id),
      'L’ANCIEN propriétaire ne figure pas dans la trace. C’est la valeur qui vient\n' +
        'd’être écrasée : si elle n’est pas là, elle n’est nulle part.',
    ).toBe(true);
    expect(
      texte.includes(nouveau.id),
      'Le NOUVEAU propriétaire ne figure pas dans la trace : on sait ce qu’on a perdu,\n' +
        'pas ce qu’on a mis à la place.',
    ).toBe(true);
  });

  it('@critique la trace porte le CODE du motif, et AUCUNE donnée personnelle (11 §2)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // L'ARBITRAGE DU 2026-09-02, ÉPROUVÉ DANS LES DEUX SENS.
    // ═══════════════════════════════════════════════════════════════════════════
    // Williams a tranché l'escalade « où vit le texte du motif » : le motif est un
    // CODE d'un vocabulaire fermé, et c'est ce code — exactement lui — qui va dans
    // `meta.motif`. Deux propriétés en découlent, et il faut les deux :
    //   · POSITIVE : le code est dans la trace (une réaffectation sans son
    //     « pourquoi » ne permet ni de contester ni de comprendre après coup) ;
    //   · NÉGATIVE : rien d'autre que des identifiants et des codes — ni le
    //     libellé français du motif, ni le nom, ni l'adresse de la personne
    //     interviewée.
    //
    // La session semée porte volontairement `person_name` et `person_email` : ce
    // sont les deux champs que 11 §2 nomme explicitement, et une implémentation
    // qui journalise « le contexte de la session pour faciliter le diagnostic »
    // les emporte tous les deux sans y penser.
    const admin = await creerCompte('admin', 'trace-redaction');
    const ancien = await creerCompte('consultant', 'trace-red-ancien');
    const nouveau = await creerCompte('consultant', 'trace-red-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });

    const nomPersonne = 'Camille Fictive Duchemin';
    const courrielPersonne = 'camille.fictive@exemple.test';
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
      nomPersonne,
      courrielPersonne,
    });

    const motif: MotifReaffectation = 'depart_auditeur';
    expect(
      (await reaffecter(admin.jeton, entretien, { newUserId: nouveau.id, motif })).statut,
    ).toBe(200);

    const lignes = await lignesJournal(entretien);
    const motifsJournalises = lignes
      .filter((ligne) => ligne.entity_type === 'interview')
      .map((ligne) => z.object({ motif: z.string() }).safeParse(ligne.meta))
      .map((analyse) => (analyse.success ? analyse.data.motif : null));
    expect(
      motifsJournalises,
      'La trace de réaffectation doit porter `meta.motif` = LE CODE envoyé, exactement.\n' +
        'Sans lui, le journal dit qui a réaffecté et vers qui, jamais pourquoi — et le\n' +
        '§34.4 exige le motif ET sa trace.',
    ).toStrictEqual([motif]);
    const violations = lignes.flatMap((ligne) => verifierValeursAtomiques(ligne.meta));
    expect(
      violations,
      'Une valeur du journal sort du vocabulaire technique de `packages/shared`\n' +
        '(`MOTIF_VALEUR_JOURNAL` : 64 caractères, [A-Za-z0-9_.:/-], ni espace ni @).\n' +
        'Le cas le plus probable est le MOTIF recopié tel quel — du texte libre saisi\n' +
        'par un humain, donc un endroit où un nom, une adresse ou un verbatim peut\n' +
        'arriver, et `activity_log` n’a ni la rétention ni le régime d’accès pour ça.',
    ).toStrictEqual([]);

    const texte = JSON.stringify(lignes);
    expect(
      texte.includes('Départ de l’auditeur'),
      'Le LIBELLÉ français du motif figure dans le journal. Le journal porte le CODE ;\n' +
        'le français vit dans `LIBELLES_MOTIF_REAFFECTATION` et se rend à l’AFFICHAGE\n' +
        '(invariant 5) — recopié en base, il dériverait à la première retouche.',
    ).toBe(false);
    expect(
      texte.includes(nomPersonne),
      'Le NOM de la personne interviewée est dans le journal. 11 §2 : « aucune donnée\n' +
        'personnelle dans les logs » — et un journal d’audit se conserve bien plus\n' +
        'longtemps que la donnée de mission qu’il décrit.',
    ).toBe(false);
    expect(texte.includes(courrielPersonne)).toBe(false);
  });

  it('@critique un refus n’écrit AUCUNE trace — le journal ne raconte que ce qui a eu lieu', async () => {
    // Un journal qui enregistre les tentatives refusées AU MÊME TITRE que les
    // actes accomplis rend l'audit illisible : on ne distingue plus, en relisant,
    // une session réaffectée d'une réaffectation qu'on a empêchée. (Le refus RBAC
    // a son propre canal, `rbac.refus`, avec son propre vocabulaire — ce n'est pas
    // une trace d'entité.)
    const admin = await creerCompte('admin', 'trace-refus');
    const ancien = await creerCompte('consultant', 'trace-refus-ancien');
    const nouveau = await creerCompte('consultant', 'trace-refus-nouveau');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, ancien.id, 'consultant');
    await rattacher(mission.id, nouveau.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: ancien.id,
      statut: 'termine',
    });

    const reponse = await reaffecter(admin.jeton, entretien, {
      newUserId: nouveau.id,
      motif: MOTIF_REAFFECTATION,
    });
    expect(reponse.statut).toBe(409);

    const lignes = await lignesJournal(entretien);
    expect(
      lignes.filter((ligne) => ligne.entity_type === 'interview'),
      'Un refus a produit une trace d’entité. La ligne dira « réaffectation » sur une\n' +
        'session qui n’a jamais changé de main.',
    ).toStrictEqual([]);
  });

  it('@critique deux réaffectations successives laissent DEUX traces — l’historique ne se compacte pas', async () => {
    // Une trace écrasée par la suivante (`UPSERT` sur (entity_type, entity_id))
    // donnerait un journal qui ne connaît que le dernier geste : l'auditeur
    // intermédiaire disparaîtrait de l'histoire de la session.
    const admin = await creerCompte('admin', 'trace-deux');
    const a = await creerCompte('consultant', 'trace-deux-a');
    const b = await creerCompte('consultant', 'trace-deux-b');
    const c = await creerCompte('consultant', 'trace-deux-c');
    const mission = await semerMission({ statut: 'en_cours' });
    for (const compte of [a, b, c]) await rattacher(mission.id, compte.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 20, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: a.id,
    });

    expect(
      (await reaffecter(admin.jeton, entretien, { newUserId: b.id, motif: MOTIF_REAFFECTATION }))
        .statut,
    ).toBe(200);
    expect(
      (await reaffecter(admin.jeton, entretien, { newUserId: c.id, motif: MOTIF_REAFFECTATION }))
        .statut,
    ).toBe(200);

    expect(await proprietaireEnBase(entretien)).toBe(c.id);
    const lignes = await lignesJournal(entretien);
    expect(
      lignes.filter((ligne) => ligne.entity_type === 'interview').length,
      'Deux réaffectations, deux lignes. Un journal qui ne garde que la dernière fait\n' +
        'disparaître l’auditeur intermédiaire — et avec lui la raison pour laquelle la\n' +
        'session a bougé deux fois.',
    ).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// 8. RBAC — CHAQUE SUJET × CHAQUE ROUTE, AUTORISATIONS **ET** REFUS
// =============================================================================
// Invariant 3 : « RBAC serveur systématique ». Un droit non testé est un droit non
// tenu — et un REFUS non testé est un refus qu'on croit avoir.
//
// LES SEPT SUJETS. Ils ne sont pas « les rôles » : `users.role` ne suffit pas à
// décrire qui est qui sur cette surface. Le lead est une propriété de LIGNE
// (`mission_users.role_on_mission`), l'appartenance à la mission en est une autre,
// et les deux décident de droits que le rôle global ne décide pas. Une matrice
// qui n'énumérerait que les quatre rôles du 04 manquerait exactement les trois
// distinctions qui portent le §34.3 et le §18.3.
//
// LES QUATRE ROUTES : les trois du périmètre L3d, plus la lecture de la liste
// d'affectations. Chaque case est éprouvée dans les DEUX sens — ce qui passe et
// ce qui est refusé — parce qu'une politique qui refuse tout le monde est verte
// sur la moitié refus et ne se voit pas.
// =============================================================================
describe('RBAC des quatre routes L3d (§34.1, §34.3, §18.3, invariant 3)', () => {
  interface Sujet {
    readonly nom: string;
    readonly jeton: string | undefined;
    /** Statut attendu sur la route, ou `null` quand le pack ne le tranche pas. */
    readonly plan: number | null;
    readonly listeAffectations: number;
    readonly creationAffectation: number;
    readonly reassign: number;
  }

  it('@critique la matrice complète : sept sujets × quatre routes, autorisations ET refus', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CETTE MATRICE ATTRAPE-T-ELLE ?
    // ═══════════════════════════════════════════════════════════════════════════
    //   · le plan d'entretiens déclaré `roles: ['admin']` par mimétisme avec le
    //     reste de la console : le §18.3 est catégorique — l'auditeur voit SON
    //     plan et ses dates. Un plan réservé à l'admin oblige le terrain à
    //     redemander sa cible par message, ce qui est exactement ce que le produit
    //     existe pour supprimer ;
    //   · les affectations ouvertes au consultant « puisqu'il est concerné » :
    //     l'espace 3 (équipe & plan de charge) est admin seul (§34.1), et le plan
    //     de charge porte la disponibilité et la performance de rythme de TOUS les
    //     auditeurs — donc des données sur des personnes qui ne demandent qu'à
    //     rester chez l'admin (§34.5, RGPD) ;
    //   · `reassign` ouvert à tout membre de la mission : n'importe quel
    //     consultant pourrait se réattribuer les sessions d'un collègue et gagner
    //     le droit d'écrire dessus (05 §9.9) ;
    //   · le crochet posé sur trois routes et oublié sur la quatrième, qui est
    //     toujours celle qu'on a ajoutée en dernier.
    const admin = await creerCompte('admin', 'matrice-admin');
    const lead = await creerCompte('consultant', 'matrice-lead');
    const membre = await creerCompte('consultant', 'matrice-membre');
    const etranger = await creerCompte('consultant', 'matrice-etranger');
    const analyste = await creerCompte('analyste', 'matrice-analyste');
    const lecteur = await creerCompte('lecteur', 'matrice-lecteur');
    const cible = await creerCompte('consultant', 'matrice-cible');

    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, admin.id, 'lead');
    await rattacher(mission.id, lead.id, 'lead');
    await rattacher(mission.id, membre.id, 'consultant');
    await rattacher(mission.id, cible.id, 'consultant');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 40, position: 1 });

    const sujets: readonly Sujet[] = [
      {
        nom: 'admin (membre)',
        jeton: admin.jeton,
        plan: 200,
        listeAffectations: 200,
        creationAffectation: 201,
        reassign: 200,
      },
      {
        // §34.3 : le lead ajuste le plan et les `work_assignments` de SA mission.
        // §34.1 : la console est admin seul en V1, et l'espace 3 (plan de charge)
        // n'y entre qu'en Phase 2. Le brief §7 tranche pour L3d : `roles:['admin']`
        // sur les deux routes d'affectation. La TENSION est réelle, elle est
        // remontée au rapport A16 — elle n'est pas arbitrée ici.
        nom: 'consultant LEAD de la mission',
        jeton: lead.jeton,
        plan: 200,
        listeAffectations: 403,
        creationAffectation: 403,
        reassign: 200,
      },
      {
        nom: 'consultant membre NON lead',
        jeton: membre.jeton,
        plan: 200,
        listeAffectations: 403,
        creationAffectation: 403,
        reassign: 403,
      },
      {
        // Le crochet `type:'mission'` ne vérifie QUE l'identité : le filtrage par
        // appartenance appartient au dépôt. Le statut du refus n'est donc pas
        // tranché par le pack — d'où le `null`, traité à part ci-dessous.
        nom: 'consultant HORS mission',
        jeton: etranger.jeton,
        plan: null,
        listeAffectations: 403,
        creationAffectation: 403,
        reassign: 404,
      },
      {
        nom: 'analyste',
        jeton: analyste.jeton,
        plan: null,
        listeAffectations: 403,
        creationAffectation: 403,
        reassign: 403,
      },
      {
        nom: 'lecteur',
        jeton: lecteur.jeton,
        plan: null,
        listeAffectations: 403,
        creationAffectation: 403,
        reassign: 403,
      },
      {
        nom: 'anonyme',
        jeton: undefined,
        plan: 401,
        listeAffectations: 401,
        creationAffectation: 401,
        reassign: 401,
      },
    ];

    const ecarts: string[] = [];

    for (const sujet of sujets) {
      // Une session NEUVE par sujet : le succès de l'admin ne doit pas décider du
      // verdict du lecteur. Une matrice dont les cases dépendent les unes des
      // autres ne mesure que son propre ordre d'exécution.
      const entretien = await semerEntretien({
        missionId: mission.id,
        orgUnitId: uniteId,
        conduitPar: cible.id,
      });
      const uniteDeCeSujet = await semerUnite({ missionId: mission.id, effectif: 12, position: 9 });

      const appels: readonly {
        readonly libelle: string;
        readonly attendu: number | null;
        readonly reponse: Reponse;
      }[] = [
        {
          libelle: 'GET  …/interview-plan',
          attendu: sujet.plan,
          reponse: await lirePlan(mission.id, sujet.jeton),
        },
        {
          libelle: 'GET  …/assignments',
          attendu: sujet.listeAffectations,
          reponse: await appeler('GET', `/v1/missions/${mission.id}/assignments?limit=5`, {
            ...(sujet.jeton === undefined ? {} : { jeton: sujet.jeton }),
          }),
        },
        {
          libelle: 'POST …/assignments',
          attendu: sujet.creationAffectation,
          reponse: await creerAffectation(sujet.jeton, mission.id, {
            userId: cible.id,
            orgUnitId: uniteDeCeSujet,
          }),
        },
        {
          libelle: 'PATCH …/reassign',
          attendu: sujet.reassign,
          reponse: await reaffecter(sujet.jeton, entretien, {
            newUserId: membre.id,
            motif: MOTIF_REAFFECTATION,
          }),
        },
      ];

      for (const appel of appels) {
        if (appel.attendu === null) {
          // Statut non tranché par le pack (hypothèse H6) : on exige le REFUS et
          // l'ABSENCE de toute donnée du plan, pas un code particulier.
          if (appel.reponse.statut < 400 || appel.reponse.statut >= 500) {
            ecarts.push(
              `${sujet.nom} → ${appel.libelle} : ${String(appel.reponse.statut)} ` +
                '(attendu un refus 4xx — voir hypothèse H6)',
            );
          }
          if (appel.reponse.corps.includes(uniteId)) {
            ecarts.push(
              `${sujet.nom} → ${appel.libelle} : la réponse de refus contient un ` +
                'identifiant d’unité de la mission — le refus fuit ce qu’il refuse',
            );
          }
          continue;
        }
        if (appel.reponse.statut !== appel.attendu) {
          ecarts.push(
            `${sujet.nom} → ${appel.libelle} : ${String(appel.reponse.statut)} ` +
              `${String(appel.reponse.code)} (attendu ${String(appel.attendu)})`,
          );
        }
        if (appel.attendu === 401 && appel.reponse.code !== ERROR_CODES.UNAUTHENTICATED) {
          ecarts.push(
            `${sujet.nom} → ${appel.libelle} : code ${String(appel.reponse.code)} au lieu de UNAUTHENTICATED`,
          );
        }
        if (appel.attendu === 403 && appel.reponse.code !== ERROR_CODES.FORBIDDEN) {
          ecarts.push(
            `${sujet.nom} → ${appel.libelle} : code ${String(appel.reponse.code)} au lieu de FORBIDDEN`,
          );
        }
      }
    }

    expect(
      ecarts,
      'La matrice rôle × route de L3d n’est pas tenue. Chaque ligne ci-dessous est un\n' +
        'droit ouvert qu’on croyait fermé, ou un droit fermé qu’on croyait ouvert :\n' +
        '  · le plan appartient à l’auditeur de la mission (§18.3) ;\n' +
        '  · les affectations sont l’espace 3, admin seul en V1 (§34.1) ;\n' +
        '  · `reassign` est admin OU lead de CETTE mission (§34.3, §34.4).\n' +
        `Écarts :\n  ${ecarts.join('\n  ')}`,
    ).toStrictEqual([]);
  });

  it('@critique le refus PRÉCÈDE la validation du corps — un lecteur n’apprend rien du contrat', async () => {
    // Si la validation Zod s'exécutait avant le crochet d'autorisation, un rôle
    // non autorisé recevrait un `400 VALIDATION_FAILED` détaillant les champs
    // attendus : la DESCRIPTION du contrat d'une route à laquelle il n'a pas
    // droit, et la confirmation que la route existe. L'ordre des crochets Fastify
    // le garantit aujourd'hui (`onRequest` avant l'analyse du corps) ; rien ne
    // l'écrit ailleurs que dans ce test.
    const lecteur = await creerCompte('lecteur', 'ordre-crochets');
    const mission = await semerMission();

    const creation = await creerAffectation(lecteur.jeton, mission.id, { champInexistant: 42 });
    expect(creation.statut).toBe(403);
    expect(creation.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(
      creation.details,
      'Le refus ne porte AUCUN détail de validation : il ne dit pas quels champs la\n' +
        'route attend, ni lequel est mal formé.',
    ).toStrictEqual([]);
  });

  it('@critique les trois routes L3d sont enregistrées AVEC une politique d’accès déclarée', () => {
    // Le socle L2 refuse de démarrer sur une route sans politique — mais il ne
    // peut rien dire d'une route qu'on aurait oublié de MONTER. Ce cas lit le
    // registre : il énumère ce qui EXISTE, pas ce à quoi on a pensé. Une route
    // absente rend ici un rouge lisible plutôt que quarante 404 ailleurs.
    const registre: readonly EntreeRegistreAcces[] = api().registreAcces;
    const urls = registre.map((entree) => entree.url);

    const attendues = [
      '/v1/missions/:id/interview-plan',
      '/v1/missions/:id/assignments',
      '/v1/interviews/:id/reassign',
    ];
    const manquantes = attendues.filter(
      (gabarit) =>
        !urls.some((url) => {
          const normalise = (valeur: string): string => valeur.replace(/:[A-Za-z0-9_]+/g, ':param');
          return normalise(url) === normalise(gabarit);
        }),
    );

    expect(
      manquantes,
      'Ces gabarits ne sont pas montés (le nom du paramètre est ignoré dans la\n' +
        'comparaison — seul le CHEMIN compte). Le brief L3d §7 les liste tous les\n' +
        'trois ; deux d’entre eux ont leur entrée `DECISIONS.md` du 2026-08-29 comme\n' +
        `routes hors §8/§24.2.\nRegistre observé :\n  ${urls.join('\n  ')}`,
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 9. ÉTANCHÉITÉ FINANCIÈRE — §18.3, INVARIANT 3, E21/E33
// =============================================================================
// « L'auditeur voit son avance/retard, son plan, ses dates — il ne voit JAMAIS le
// TJM, les montants, ni le devis » (§18.3, « exigence ferme »).
//
// LE PIÈGE EST ICI PLUS RÉEL QU'AILLEURS : le plan d'entretiens est « LA base
// objective du chiffrage » (§18.1.2), le cadrage porte `planned_interviews` en
// JSONB, et le cadrage est rattaché à la mission par `mission_id`. La jointure qui
// ferait sortir un montant par la route du plan est à portée d'un `LEFT JOIN`, et
// elle aurait l'air d'une optimisation.
//
// Le volet financier ne passe QUE par `semerVoletFinancierSentinelle` — l'unique
// porte de test (`aide/sentinelle-financiere.ts`). Aucune autre ligne de ce
// fichier ne nomme la table ni ses colonnes.
// =============================================================================
describe('étanchéité financière sur les routes L3d', () => {
  /** Sème un cadrage RATTACHÉ à la mission — la jointure tentante — et son volet. */
  async function semerCadrageSurLaMission(
    missionId: string,
    entrepriseId: string,
    adminId: string,
  ): Promise<void> {
    const cadrage = uuidv7();
    await bd().query(
      `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                      calendar_days, status, created_by)
       VALUES ($1, $2, $3, 18, 3, 30, 'brouillon', $4)`,
      [cadrage, entrepriseId, missionId, adminId],
    );
    await semerVoletFinancierSentinelle(bd(), cadrage, adminId);
  }

  it('@critique un CONSULTANT membre lit son plan sans jamais voir un montant ni le NOM d’un champ financier', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // C'EST LE CAS QUE LE §18.3 DÉCRIT MOT POUR MOT.
    // ═══════════════════════════════════════════════════════════════════════════
    // Un consultant a le droit d'ouvrir son plan ; il n'a aucun droit sur l'argent.
    // La route qui lui sert le plan est donc la seule du produit qui donne à un
    // non-admin une vue sur une mission chiffrée — et la sentinelle vérifie qu'elle
    // ne rapporte rien d'autre que le plan.
    //
    // Les VALEURS cherchées sont des leurres improbables : leur présence ne peut
    // pas être une coïncidence, c'est une jointure. Les NOMS sont vérifiés aussi,
    // parce qu'un champ à `null` annonce que la jointure existe — et un champ qui
    // existe finit par être rempli.
    const admin = await creerCompte('admin', 'etancheite-admin');
    const consultant = await creerCompte('consultant', 'etancheite-consultant');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, consultant.id, 'consultant');
    await rattacher(mission.id, admin.id, 'lead');
    await semerCadrageSurLaMission(mission.id, mission.companyId, admin.id);
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 120, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: consultant.id,
    });

    const reponsesBalayees = [
      await lirePlan(mission.id, consultant.jeton),
      await appeler('GET', `/v1/missions/${mission.id}/assignments?limit=50`, {
        jeton: consultant.jeton,
      }),
      await reaffecter(consultant.jeton, entretien, {
        newUserId: admin.id,
        motif: MOTIF_REAFFECTATION,
      }),
    ];
    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une sentinelle qui ne cherche que dans des corps de 404 est verte pour
    // n'avoir rien traversé — c'est le défaut nommé au brief §9-3. On exige donc
    // que les routes AIENT RÉPONDU avant de conclure qu’elles ne fuient pas.
    expect(
      reponsesBalayees[0]?.statut,
      'Le plan doit être SERVI au consultant membre (§18.3) : sans réponse à examiner,\n' +
        'la sentinelle ne prouve rien.',
    ).toBe(200);
    expect(
      reponsesBalayees.filter((reponse) => reponse.statut === 404).length,
      'Une des routes L3d rend 404 : elle n’est pas montée, et son silence rend le vert\n' +
        'de ce cas sans valeur.',
    ).toBe(0);

    const corpus = reponsesBalayees.map((reponse) => reponse.corps).join('\n');

    expect(
      VALEURS_SENTINELLES.filter((valeur) => corpus.includes(valeur)),
      'Un montant est sorti par une route L3d, vers un CONSULTANT. §18.3 est une\n' +
        '« exigence ferme » : l’auditeur ne voit jamais le TJM, les montants ni le devis.',
    ).toStrictEqual([]);
    expect(
      NOMS_FINANCIERS_INTERDITS.filter((champ) => corpus.includes(champ)),
      'Le NOM d’un champ financier apparaît dans une réponse L3d. Même à `null`, il\n' +
        'annonce que la jointure existe.',
    ).toStrictEqual([]);
  });

  it('@critique pas même à un ADMINISTRATEUR : le plan ne rapporte pas le chiffrage de la mission', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI ÉPROUVER L'ADMIN, QUI A POURTANT LE DROIT DE VOIR L'ARGENT.
    // ═══════════════════════════════════════════════════════════════════════════
    // Parce que la question n'est pas « qui a le droit » mais « par quelle porte ».
    // Une jointure écrite pour l'admin sur la route du plan devient la ligne que
    // le prochain élargissement de rôle emportera avec lui — et le §18.3 ouvre le
    // plan aux consultants. C'est ainsi que l'étanchéité se perd : un cran à la
    // fois, sans qu'aucun test ne rougisse.
    const admin = await creerCompte('admin', 'etancheite-admin-seul');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, admin.id, 'lead');
    await semerCadrageSurLaMission(mission.id, mission.companyId, admin.id);
    await semerUnite({ missionId: mission.id, effectif: 300, position: 1 });

    const reponsesBalayees = [
      await lirePlan(mission.id, admin.jeton),
      await appeler('GET', `/v1/missions/${mission.id}/assignments?limit=50`, {
        jeton: admin.jeton,
      }),
    ];
    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une sentinelle qui ne cherche que dans des corps de 404 est verte pour
    // n'avoir rien traversé — c'est le défaut nommé au brief §9-3. On exige donc
    // que les routes AIENT RÉPONDU avant de conclure qu’elles ne fuient pas.
    expect(
      reponsesBalayees.map((reponse) => reponse.statut),
      'Les deux routes doivent SERVIR l’administrateur : une sentinelle qui n’examine\n' +
        'que des 404 est verte pour n’avoir rien traversé.',
    ).toStrictEqual([200, 200]);

    const corpus = reponsesBalayees.map((reponse) => reponse.corps).join('\n');

    expect(VALEURS_SENTINELLES.filter((valeur) => corpus.includes(valeur))).toStrictEqual([]);
    expect(NOMS_FINANCIERS_INTERDITS.filter((champ) => corpus.includes(champ))).toStrictEqual([]);
  });

  it('@critique balayage sentinelle sur TOUS les gabarits `/v1/missions` et `/v1/interviews` du registre', async () => {
    // Le balayage appelle les routes QUI EXISTENT, pas celles auxquelles on a
    // pensé : une route ajoutée demain sous ces deux préfixes y entre d'elle-même,
    // et son auteur voit rougir ce test plutôt qu'un lot ultérieur.
    //
    // PIÈGE CONNU, ET C'EST LE §9-3 DU BRIEF : la cartographie doit porter des
    // identifiants RÉELLEMENT SEMÉS. Un UUID de complaisance rendrait 404 partout
    // et le balayage serait vert pour n'avoir traversé aucune route — le défaut
    // exact corrigé le 2026-08-31, à ne pas recréer. Les nouveaux gabarits
    // `/v1/interviews/:id/*` reçoivent donc une SESSION semée, pas une mission.
    const admin = await creerCompte('admin', 'balayage-admin');
    const consultant = await creerCompte('consultant', 'balayage-consultant');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, admin.id, 'lead');
    await rattacher(mission.id, consultant.id, 'consultant');
    await semerCadrageSurLaMission(mission.id, mission.companyId, admin.id);
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 120, position: 1 });
    const entretien = await semerEntretien({
      missionId: mission.id,
      orgUnitId: uniteId,
      conduitPar: consultant.id,
    });

    const cartographie: Record<string, Record<string, string>> = {};
    const registre: readonly EntreeRegistreAcces[] = api().registreAcces;
    for (const entree of registre) {
      const estMission = entree.url.startsWith('/v1/missions');
      const estSession = entree.url.startsWith('/v1/interviews');
      if (!estMission && !estSession) continue;
      const parametres: Record<string, string> = {};
      for (const nom of parametresDuGabarit(entree.url)) {
        parametres[nom] = estSession ? entretien : mission.id;
      }
      if (Object.keys(parametres).length > 0) cartographie[entree.url] = parametres;
    }

    expect(
      Object.keys(cartographie).length,
      'Le registre ne porte AUCUN gabarit à paramètre sous `/v1/missions` ou\n' +
        '`/v1/interviews` : soit les routes ne sont pas montées, soit elles n’ont pas\n' +
        'déclaré leur politique d’accès — et le socle L2 refuse de démarrer sur une\n' +
        'route sans politique.',
    ).toBeGreaterThan(0);

    // ── LE PIÈGE DU BRIEF §9-3, ÉPROUVÉ PLUTÔT QUE COMMENTÉ ────────────────
    // « Les nouveaux gabarits doivent entrer dans la cartographie avec des
    //   identifiants RÉELLEMENT semés, sinon ils seront comptés non exercés et le
    //   garde restera vert sur des routes jamais traversées — exactement le défaut
    //   corrigé le 2026-08-31, à ne pas recréer. »
    // Sans cette assertion, ce cas est vert quand les trois routes L3d sont absentes :
    // le balayage n'aurait alors rien traversé, et son silence passerait pour une
    // preuve.
    const gabaritsCartographies = Object.keys(cartographie).map((url) =>
      url.replace(/:[A-Za-z0-9_]+/g, ':param'),
    );
    const absents = [
      '/v1/missions/:param/interview-plan',
      '/v1/missions/:param/assignments',
      '/v1/interviews/:param/reassign',
    ].filter((gabarit) => !gabaritsCartographies.includes(gabarit));
    expect(
      absents,
      'Ces gabarits L3d n’entrent pas dans la cartographie du balayage : soit ils ne\n' +
        'sont pas montés, soit ils ne portent aucun paramètre d’URL. Dans les deux cas,\n' +
        'le vert de ce balayage ne dit rien d’eux.',
    ).toStrictEqual([]);

    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      // L'ADMINISTRATEUR est délibérément ABSENT : il a le droit de voir les
      // montants (§34.1). L'inclure produirait une fausse fuite, et un garde-fou
      // qui crie à tort finit désarmé.
      porteurs: {
        consultant: consultant.jeton,
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

    const muettesDuLot = rapport.gabaritsMuets.filter(
      (entree) =>
        entree.includes('/v1/interviews') ||
        entree.includes('/interview-plan') ||
        entree.includes('/assignments'),
    );
    expect(
      muettesDuLot,
      'Une route L3d n’a été ni refusée (401/403) ni servie (2xx) par AUCUN porteur :\n' +
        '404 pour tous, 429 (balayage étranglé) ou 5xx. Dans les trois cas, le vert du\n' +
        `balayage ne vaut rien pour elle.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 10. LES CONVENTIONS D'API — 11 §3, SUR LES TROIS ROUTES DU LOT
// =============================================================================
describe('conventions d’API (11 §3) sur les routes L3d', () => {
  it('@critique toute erreur porte le format unique `{ error: { code, message } }`, code issu d’`ERROR_CODES`', async () => {
    // Un seul littéral libre suffit à casser le front, qui compare à la constante
    // partagée. Et un code absent du catalogue est un code que personne ne peut
    // traiter : l'écran affiche « une erreur est survenue » sur un cas que le
    // produit sait pourtant nommer.
    const lecteur = await creerCompte('lecteur', 'conventions-lecteur');
    const admin = await creerCompte('admin', 'conventions-admin');
    const mission = await semerMission();

    const reponses = [
      await lirePlan(mission.id, undefined),
      await appeler('GET', `/v1/missions/${mission.id}/assignments`, { jeton: lecteur.jeton }),
      await creerAffectation(admin.jeton, mission.id, { userId: 'pas-un-uuid' }),
      await reaffecter(admin.jeton, uuidv7(), { newUserId: uuidv7(), motif: MOTIF_REAFFECTATION }),
      await lirePlan(uuidv7(), admin.jeton),
    ];

    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une route non montée rend 404 dans le bon format : ce cas serait donc vert
    // sur un produit qui n'a aucune de ces routes. On exige qu'au moins un refus
    // vienne d'une DÉCISION de la route (403 de rôle, 400 de validation) et non de
    // l'absence de route.
    expect(
      reponses.some((reponse) => reponse.statut === 400 || reponse.statut === 403),
      'Les cinq appels rendent tous 404 : les routes ne sont pas montées, et le format\n' +
        'd’erreur observé est celui du gestionnaire par défaut, pas celui des routes L3d.',
    ).toBe(true);

    const codesConnus = new Set<string>(Object.values(ERROR_CODES));
    const ecarts: string[] = [];
    for (const reponse of reponses) {
      if (reponse.statut < 400) continue;
      if (reponse.code === null) {
        ecarts.push(
          `statut ${String(reponse.statut)} : corps hors format (${reponse.corps.slice(0, 160)})`,
        );
        continue;
      }
      if (!codesConnus.has(reponse.code)) {
        ecarts.push(`code « ${reponse.code} » absent d’ERROR_CODES`);
      }
      if (reponse.message === null || reponse.message.trim() === '') {
        ecarts.push(`code « ${reponse.code} » sans message français`);
      }
      for (const detail of reponse.details) {
        // Convention transverse du 2026-09-01 : `code` porte la cause machine,
        // `message` la phrase française affichable — l’en-tête d’`errors.ts`
        // promet que `details[].message` est affiché TEL QUEL par la PWA.
        if (/^[a-z0-9_]+$/.test(detail.message)) {
          ecarts.push(
            `détail « ${detail.message} » : ressemble à un code machine dans le champ ` +
              '`message`, qui est affiché tel quel à un auditeur (invariant 5). Sa place ' +
              'est dans `details[].code`.',
          );
        }
      }
    }

    expect(
      ecarts,
      `Le format d’erreur unique du 11 §3 n’est pas tenu :\n  ${ecarts.join('\n  ')}`,
    ).toStrictEqual([]);
  });

  it('@critique aucun horodatage rendu par ces routes ne porte de décalage local', async () => {
    // 11 §3 : « ISO 8601 UTC en API ; formatage au fuseau de mission à l'AFFICHAGE
    // uniquement ». Un `+02:00` dans une réponse d'API est un fuseau serveur qui a
    // fuité, et il rendra des journées décalées la moitié de l'année.
    const admin = await creerCompte('admin', 'utc-admin');
    const auditeur = await creerCompte('consultant', 'utc-cible');
    const mission = await semerMission({ statut: 'en_cours' });
    await rattacher(mission.id, admin.id, 'lead');
    const uniteId = await semerUnite({ missionId: mission.id, effectif: 60, position: 1 });
    await creerAffectation(admin.jeton, mission.id, { userId: auditeur.id, orgUnitId: uniteId });

    const reponsesDatees = [
      await lirePlan(mission.id, admin.jeton),
      await appeler('GET', `/v1/missions/${mission.id}/assignments?limit=50`, {
        jeton: admin.jeton,
      }),
    ];
    // ── CONTRÔLE DE VACUITÉ ────────────────────────────────────────────────
    // Une sentinelle qui ne cherche que dans des corps de 404 est verte pour
    // n'avoir rien traversé — c'est le défaut nommé au brief §9-3. On exige donc
    // que les routes AIENT RÉPONDU avant de conclure qu’elles ne fuient pas.
    expect(
      reponsesDatees.map((reponse) => reponse.statut),
      'Les deux routes doivent SERVIR : un corps de 404 ne porte aucun horodatage, et\n' +
        'ce cas serait vert sans avoir rien examiné.',
    ).toStrictEqual([200, 200]);

    const corpus = reponsesDatees.map((reponse) => reponse.corps).join('\n');

    const decalages = corpus.match(/\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}/g) ?? [];
    expect(
      decalages,
      'Un horodatage porte un décalage local au lieu de `Z`. Le fuseau de mission est\n' +
        'un geste d’AFFICHAGE (§22.2) ; en base et en API, tout est UTC.',
    ).toStrictEqual([]);
  });
});
