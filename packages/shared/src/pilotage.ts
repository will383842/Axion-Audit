// =============================================================================
// CONTRAT DU PILOTAGE DE MISSION — LA COUVERTURE. 03 §27.1, §16.6, §18.2.
// Lot L7, incrément L7b.
//
//   GET /v1/missions/:id/coverage?limit=&after= → `couvertureMissionSchema`
//
// ── LES DEUX AXES, ET POURQUOI ILS NE SE CONFONDENT PAS ─────────────────────
// Le fichier 07, ligne L7-min, exige « couverture par unité **ET** par type de
// source §27.1 ». Ce sont DEUX lectures d'un même tableau, pas une :
//   · axe A — PAR UNITÉ (§16.6) : « ce service a-t-il été audité ? » ; une ligne
//     par unité de l'arbre, avec l'alerte sur toute unité `in_scope` qui n'a
//     REÇU AUCUNE SESSION ;
//   · axe B — PAR SOURCE DE COLLECTE (§27.1) : « l'a-t-on audité AUTREMENT qu'en
//     parlant ? » ; cinq colonnes, toujours les cinq, même à zéro.
// Un tableau qui ne porterait que l'axe A dirait « couverture complète » d'une
// mission faite à 100 % d'entretiens — c'est exactement le biais que le §27.1
// existe pour corriger.
//
// ── SUR QUEL VOCABULAIRE SE COMPTE L'AXE B ──────────────────────────────────
// `interviews.kind`, et non `answers.source`. Arbitrage rendu (Williams, par
// délégation du 2026-09-02 ; `docs/conception/LOT_L7.md` §9, entrée
// `DECISIONS.md` du 2026-09-05) : le 03 l. 548 pose lui-même l'équivalence — « les
// 5 sources de collecte … GÉNÉRALISE la table `interviews` en SESSIONS DE
// COLLECTE » — et la l. 559 met le plan et la couverture sous le même sujet (« le
// plan de mission planifie les CINQ types … l'écran de couverture contrôle la
// couverture PAR TYPE DE SOURCE »), en réservant le mot PROVENANCE à
// `answers.source`. Raison de fond : **on ne planifie pas une provenance** —
// comptée sur `answers.source`, la couverture n'aurait aucune colonne « prévu »,
// et le critère du 07 (« la couverture reflète le plan d'entretiens ») deviendrait
// inexprimable. `answers.source` est l'axe de l'AGRÉGATION (`agregation.ts`).
//
// ── `atelier` — LE SIXIÈME `kind`, RENDU HORS DE LA GRILLE ──────────────────
// `TYPES_SESSION` en compte six ; le §27.1 en nomme cinq (`atelier` arrive au
// §28.1). La grille porte donc les CINQ sources, et l'atelier voyage à part, avec
// son seul `realise` : le §32.4 n'en propose aucun, un « prévu » y serait une case
// qui ment. Il n'entre pas dans le décompte des sources couvertes — un atelier ne
// comble pas l'absence d'une observation — et il n'est JAMAIS silencieux : la
// marge de mission le porte toujours, y compris à zéro.
//
// ── CE QUI N'ENTRE PAS DANS CETTE RÉPONSE ───────────────────────────────────
// Aucun montant, aucun taux, aucune colonne de `scoping_financials` ni de
// `scoping_estimates` (invariant 3, §18.3 : « l'auditeur ne voit jamais le TJM »).
// La couverture porte des NOMBRES DE SESSIONS et des EFFECTIFS, jamais un euro.
// Aucun nom de personne non plus : elle compte des sessions, elle ne dit pas qui
// a été rencontré (11 §2).
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E22 (console de
// pilotage 7 espaces) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from './temps.js';
import { TYPES_UNITE_ORG } from './missions.js';

// -----------------------------------------------------------------------------
// L'AXE B — LES CINQ SOURCES DE COLLECTE DU §27.1
// -----------------------------------------------------------------------------

/**
 * Les CINQ sources de collecte de la table du 03 §27.1, dans l'ordre du texte.
 *
 * Ce sont des `interviews.kind` (voir l'en-tête) : le sixième `kind`, `atelier`,
 * n'est pas une source de collecte du §27.1 et vit dans `KIND_HORS_GRILLE`.
 * Recopiées des CHECK du fichier 04, comme `TYPES_SESSION` de `plan-entretiens.ts`
 * — et ces deux listes ne peuvent pas diverger : `SOURCES_COLLECTE` est vérifiée
 * comme un sous-ensemble strict de `TYPES_SESSION` par un test unitaire.
 */
export const SOURCES_COLLECTE = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
] as const;

export type SourceCollecte = (typeof SOURCES_COLLECTE)[number];

/**
 * Le `kind` qui n'est PAS une source de collecte du §27.1, et qui ne disparaît
 * pas pour autant : un atelier réellement tenu est un travail fait.
 */
export const KIND_HORS_GRILLE = 'atelier';

/** Libellés français des colonnes de la grille (invariant 5). */
export const LIBELLES_SOURCE_COLLECTE: Record<SourceCollecte, string> = {
  entretien: 'Entretien',
  observation: 'Observation',
  demonstration: 'Démonstration',
  analyse_documentaire: 'Analyse documentaire',
  releve_donnees: 'Relevé de données',
};

/** Ce que chaque source de collecte recouvre (§27.1) — infobulle de colonne. */
export const DESCRIPTIONS_SOURCE_COLLECTE: Record<SourceCollecte, string> = {
  entretien: 'On interroge une personne.',
  observation: 'On regarde le travail réel : un poste, un atelier, un flux.',
  demonstration: 'Un utilisateur montre son outil en conditions réelles.',
  analyse_documentaire: 'On lit les documents remis.',
  releve_donnees: 'On collecte des chiffres : volumétries, temps, effectifs.',
};

// -----------------------------------------------------------------------------
// LES ÉLÉMENTS DE LA COUVERTURE
// -----------------------------------------------------------------------------

/**
 * LA FOURCHETTE DU PRÉVU, rendue comme une fourchette.
 *
 * Le §32.4 chiffre « 11-50 → 3 entretiens » mais aussi « ≤ 10 → 1 à 2 » : réduire
 * le prévu à un seul nombre choisirait à la place de l'auditeur. Même forme que
 * `fourchetteEntretiensSchema` du plan, et pour la même raison — un intervalle est
 * une donnée, pas un tirage. `min` est le **n minimal** contre lequel `couvert`
 * s'évalue.
 */
export const fourchettePrevuSchema = z.strictObject({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

export type FourchettePrevu = z.infer<typeof fourchettePrevuSchema>;

/**
 * UNE CELLULE DE LA GRILLE — trois colonnes, jamais un ratio unique.
 *
 * `prevu → planifie` est un défaut d'AGENDA ; `planifie → realise` est un défaut
 * de TERRAIN. Ce ne sont pas les mêmes alertes et elles ne s'adressent pas aux
 * mêmes personnes : les fondre en un pourcentage perdrait précisément ce qui rend
 * l'écran actionnable.
 *
 * Définitions, écrites ici parce qu'elles se relisent et ne se devinent pas :
 *   · `prevu` — la CIBLE du plan §32.4, obtenue du service de plan de L3 et
 *     jamais recalculée (une seconde implémentation des tranches d'effectif
 *     divergerait de la première au premier amendement) ;
 *   · `planifie` — les sessions qui ont une place dans l'agenda :
 *     `schedule_status` ∈ {`planifie`, `confirme`, `realise`}. Confirmer une
 *     session ne peut pas FAIRE BAISSER le planifié — un compte qui reculerait
 *     quand l'agenda avance serait faux au sens le plus littéral ;
 *   · `realise` — les sessions `status = 'termine'`. Rien d'autre : une session
 *     commencée n'est pas une session tenue.
 */
export const celluleCouvertureSchema = z.strictObject({
  kind: z.enum(SOURCES_COLLECTE),
  prevu: fourchettePrevuSchema,
  planifie: z.number().int().min(0),
  realise: z.number().int().min(0),
  /** `realise >= prevu.min` — lecture directe du plan, aucun seuil inventé. */
  couvert: z.boolean(),
});

export type CelluleCouverture = z.infer<typeof celluleCouvertureSchema>;

/**
 * UNE LIGNE DU TABLEAU — une unité de l'arbre, ses cinq colonnes, son alerte.
 *
 * Les unités HORS PÉRIMÈTRE (§25.1) sont RENDUES, marquées `inScope: false`,
 * jamais retirées : « rien ne peut passer sous le radar sans que ce soit visible
 * et justifié » (§16.6). Leur `prevu` est nul — le plan ne les dimensionne pas —
 * et elles ne portent aucune alerte.
 */
export const uniteCouverteSchema = z.strictObject({
  orgUnitId: z.uuid(),
  nom: z.string(),
  kind: z.enum(TYPES_UNITE_ORG),
  parentId: z.uuid().nullable(),
  /** Profondeur dans l'arbre, 0 pour la racine — l'indentation des 4 niveaux FIL-GC. */
  profondeur: z.number().int().min(0),
  inScope: z.boolean(),
  /** `headcount` brut ; `null` s'il est absent ou inexploitable (§32.4). */
  effectif: z.number().int().nullable(),
  /** LES CINQ, TOUJOURS — un type absent laisserait croire qu'il n'est pas exigé. */
  parSource: z.array(celluleCouvertureSchema),
  /** L'atelier (§28.1), hors grille : seul le réalisé existe. */
  atelierRealise: z.number().int().min(0),
  /** Sources dont `prevu.min > 0` et pour lesquelles `couvert` est vrai. */
  sourcesCouvertes: z.number().int().min(0),
  /** Sources dont `prevu.min > 0`. Zéro = le plan n'exige rien de cette unité. */
  sourcesAttendues: z.number().int().min(0),
  /**
   * Codes de blocs actifs de la mission dont AUCUNE réponse ne provient d'une
   * session de cette unité (§16.6, « blocs non couverts »). Une réponse « non
   * communiquée » COMPTE : le bloc a été abordé, et c'est ce que cette colonne
   * mesure — la complétude, elle, est au §32.1 et n'est pas d'ici.
   */
  blocsNonCouverts: z.array(z.string()),
  /** §16.6 — L'ALERTE : unité `in_scope` qui n'a reçu aucune session non annulée. */
  aucuneSession: z.boolean(),
});

export type UniteCouverte = z.infer<typeof uniteCouverteSchema>;

/**
 * LES MARGES DE MISSION — calculées sur la mission ENTIÈRE, jamais sur la page.
 *
 * « Une marge calculée sur une page est un chiffre faux qui a l'air juste » : ces
 * totaux voyagent donc HORS de l'enveloppe paginée, et un test croisé vérifie
 * qu'ils sont identiques page 1 et page 3.
 */
export const margesCouvertureSchema = z.strictObject({
  /** Les cinq sources, cumulées sur les unités du PÉRIMÈTRE (`in_scope`, actives). */
  parSource: z.array(celluleCouvertureSchema),
  /** L'atelier ne se tait jamais : ce compte est présent même à zéro. */
  atelierRealise: z.number().int().min(0),
  unitesInScope: z.number().int().min(0),
  unitesHorsPerimetre: z.number().int().min(0),
  /** §16.6 — le nombre que le chef de mission regarde en premier. */
  unitesSansAucuneSession: z.number().int().min(0),
});

export type MargesCouverture = z.infer<typeof margesCouvertureSchema>;

/**
 * `GET /v1/missions/:id/coverage` — le tableau de couverture d'une mission.
 *
 * ── PAGINATION KEYSET (11 §3), ET CE QU'ELLE PAGINE ─────────────────────────
 * `unites` est la PAGE ; curseur **`(position, id)` ascendant**, opaque, identique
 * à celui de `GET /v1/missions/:id/org-units` — les deux listes rendent l'arbre
 * dans le même ordre, sinon la couverture ne se lirait pas à côté de l'arbre.
 * `nextCursor: null` = fin de liste. **Jamais d'offset** : sur 150 unités qu'une
 * sync fait bouger, l'offset saute ou duplique des lignes.
 * `marges`, `blocsActifs` et `avertissements` NE SE PAGINENT PAS.
 */
export const couvertureMissionSchema = z.strictObject({
  missionId: z.uuid(),
  /** Fuseau de la mission — l'affichage lui doit ses heures (invariant 5, §22.2). */
  timezone: z.string(),
  calculeLe: isoUtcSchema,
  /** Codes des blocs actifs de la mission — le dénominateur de `blocsNonCouverts`. */
  blocsActifs: z.array(z.string()),
  unites: z.array(uniteCouverteSchema),
  nextCursor: z.string().nullable(),
  marges: margesCouvertureSchema,
  /** Repris du plan §32.4 : la couverture ne tait pas ce que le plan avertit. */
  avertissements: z.array(z.strictObject({ code: z.string(), message: z.string() })),
});

export type CouvertureMission = z.infer<typeof couvertureMissionSchema>;
