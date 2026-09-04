// =============================================================================
// CALCUL DE LA COUVERTURE — FONCTION PURE. 03 §27.1 (axe B), §16.6 (axe A).
// Lot L7, incrément L7b.
//
// ── CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT SURTOUT PAS ───────────
// Elle CONFRONTE trois choses déjà établies ailleurs, et n'en calcule aucune :
//   1. le PRÉVU — le plan §32.4, produit par `plan-entretiens/generateur.ts`. Les
//      tranches d'effectif ne sont PAS relues ici. « La couverture se confronte au
//      plan d'entretiens, elle ne se recalcule pas dans son coin » : une seconde
//      implémentation des tranches divergerait de la première au premier
//      amendement, et la couverture affirmerait alors un prévu que le plan ne
//      reconnaît pas. Le mot `headcount` n'apparaît nulle part dans ce fichier,
//      et c'est la forme la plus courte de cette garantie ;
//   2. le PLANIFIÉ et le RÉALISÉ — des décomptes AGRÉGÉS EN SQL (`depot.ts`,
//      invariant 6 : 150 unités × 6 types font 900 cellules, les recompter dans
//      un navigateur tuerait le p95) ;
//   3. les BLOCS TOUCHÉS — même chose, agrégés en SQL depuis les réponses.
//
// ── PURE, DONC REPRODUCTIBLE ────────────────────────────────────────────────
// Aucune E/S, aucune horloge, aucun aléa : `calculeLe` est REÇU. Deux appels sur
// les mêmes données rendent le même objet, comparable par `toEqual` strict — la
// même discipline que le générateur de plan, et pour la même raison.
//
// ── LES MARGES NE SE CALCULENT PAS SUR LA PAGE ──────────────────────────────
// `unitesDeLaPage` sert les LIGNES ; `toutesLesUnites` sert les MARGES. Une marge
// calculée sur une page est un chiffre faux qui a l'air juste : le total par
// source changerait en tournant la page, et personne ne le verrait.
//
// ── AUCUNE DONNÉE FINANCIÈRE N'ENTRE ICI ────────────────────────────────────
// Ce module ne connaît que des unités, des sessions et des blocs. Il n'importe ni
// `scoping_estimates`, ni `scoping_financials`, et il ne pourrait pas : ses types
// d'entrée ne portent aucun montant (invariant 3, §18.3).
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E4 (arbre
// organisationnel à profondeur libre) · E12 (entretiens par interlocuteur,
// à-revoir).
// =============================================================================
import {
  SOURCES_COLLECTE,
  type CelluleCouverture,
  type CouvertureMission,
  type FourchettePrevu,
  type MargesCouverture,
  type SourceCollecte,
  type UniteCouverte,
} from '@axion/shared';
import type { TypeSession } from '../../db/schema.js';
import type { CibleUnite, PlanEntretiens, UnitePourPlan } from '../plan-entretiens/generateur.js';

// -----------------------------------------------------------------------------
// LES ENTRÉES
// -----------------------------------------------------------------------------

/**
 * LES DÉCOMPTES DE SESSIONS D'UNE UNITÉ POUR UN TYPE, agrégés en SQL.
 *
 * Les trois nombres répondent à trois questions différentes, et c'est pourquoi ils
 * voyagent séparément plutôt que sous forme d'un ratio :
 *   · `planifie` — la session a une place dans l'agenda (`schedule_status` ∈
 *     planifie | confirme | realise). Confirmer ne peut pas faire BAISSER ce
 *     compte ;
 *   · `realise` — la session est TENUE (`status = 'termine'`) ;
 *   · `nonAnnulees` — tout ce qui n'est ni annulé ni reporté : c'est le seul
 *     compte qui décide de l'alerte §16.6, parce qu'une unité qui a une session
 *     à planifier n'est pas une unité oubliée.
 */
export interface CompteSessionsUnite {
  readonly orgUnitId: string;
  readonly kind: TypeSession;
  readonly planifie: number;
  readonly realise: number;
  readonly nonAnnulees: number;
}

/** Un bloc effectivement abordé par une réponse d'une session de cette unité. */
export interface BlocTouche {
  readonly orgUnitId: string;
  readonly blocCode: string;
}

export interface EntreeCouverture {
  /** LA CIBLE — produite par L3, jamais recalculée ici (voir l'en-tête). */
  readonly plan: PlanEntretiens;
  /** Tout l'arbre vivant de la mission : sert les MARGES et la profondeur. */
  readonly toutesLesUnites: readonly UnitePourPlan[];
  /** La page keyset : sert les LIGNES, et elles seules. */
  readonly unitesDeLaPage: readonly UnitePourPlan[];
  readonly comptes: readonly CompteSessionsUnite[];
  readonly blocsTouches: readonly BlocTouche[];
  /** `missions.active_blocks` — le dénominateur de `blocsNonCouverts`. */
  readonly blocsActifs: readonly string[];
  readonly timezone: string;
  /** ISO 8601 UTC, FOURNI (11 §3) : une fonction qui lit l'heure n'est pas pure. */
  readonly calculeLe: string;
  readonly nextCursor: string | null;
}

// -----------------------------------------------------------------------------
// OUTILS
// -----------------------------------------------------------------------------

const AUCUN_PREVU: FourchettePrevu = { min: 0, max: 0 };

/** Le `kind` hors grille (§28.1) — repris du contrat partagé, jamais réécrit. */
const KIND_ATELIER: TypeSession = 'atelier';

/**
 * Le prévu d'une source pour une unité, LU dans la cible du plan.
 *
 * `entretien` a sa fourchette propre (§32.4) ; les autres sources viennent des
 * sessions complémentaires exigées par la règle appliquée. Une unité que le plan
 * n'a pas retenue (hors périmètre, non active) n'attend rien : `AUCUN_PREVU`.
 */
function prevuDeLaSource(cible: CibleUnite | undefined, kind: SourceCollecte): FourchettePrevu {
  if (cible === undefined) return AUCUN_PREVU;
  if (kind === 'entretien') return { min: cible.entretiens.min, max: cible.entretiens.max };
  const complementaire = cible.sessionsComplementaires.find((s) => s.kind === kind);
  if (complementaire === undefined) return AUCUN_PREVU;
  return { min: complementaire.nombre, max: complementaire.nombre };
}

/** Additionne deux fourchettes — l'agrégation d'un prévu est une somme de bornes. */
function additionner(a: FourchettePrevu, b: FourchettePrevu): FourchettePrevu {
  return { min: a.min + b.min, max: a.max + b.max };
}

/**
 * Une cellule finie. `couvert` est une LECTURE du plan (`realise >= prevu.min`),
 * jamais un seuil choisi ici : un seuil non spécifié viendrait des
 * `estimation_params` (11 §5), pas d'une constante d'agent.
 */
function cellule(
  kind: SourceCollecte,
  prevu: FourchettePrevu,
  planifie: number,
  realise: number,
): CelluleCouverture {
  return { kind, prevu, planifie, realise, couvert: realise >= prevu.min };
}

/**
 * La profondeur d'une unité dans l'arbre, racine à 0.
 *
 * Bornée par le nombre d'unités : un `parent_id` qui boucle (donnée corrompue,
 * import malheureux) rendrait une remontée naïve infinie, et l'écran de pilotage
 * se figerait au lieu d'afficher un arbre légèrement faux. On préfère un arbre
 * légèrement faux, VISIBLE, à une console qui ne répond plus.
 */
function profondeurs(unites: readonly UnitePourPlan[]): ReadonlyMap<string, number> {
  const parents = new Map(unites.map((u) => [u.id, u.parentId]));
  const resultat = new Map<string, number>();
  for (const unite of unites) {
    let profondeur = 0;
    let courant = unite.parentId;
    while (courant !== null && parents.has(courant) && profondeur < unites.length) {
      profondeur += 1;
      courant = parents.get(courant) ?? null;
    }
    resultat.set(unite.id, profondeur);
  }
  return resultat;
}

/** Index (unité, type) → décomptes, pour ne parcourir la liste plate qu'une fois. */
function indexerComptes(
  comptes: readonly CompteSessionsUnite[],
): ReadonlyMap<string, CompteSessionsUnite> {
  const index = new Map<string, CompteSessionsUnite>();
  for (const compte of comptes) {
    const cle = `${compte.orgUnitId} ${compte.kind}`;
    const existant = index.get(cle);
    index.set(
      cle,
      existant === undefined
        ? compte
        : {
            orgUnitId: compte.orgUnitId,
            kind: compte.kind,
            planifie: existant.planifie + compte.planifie,
            realise: existant.realise + compte.realise,
            nonAnnulees: existant.nonAnnulees + compte.nonAnnulees,
          },
    );
  }
  return index;
}

/** Les trois nombres d'un couple (unité, type), sans le couple lui-même. */
interface Decomptes {
  readonly planifie: number;
  readonly realise: number;
  readonly nonAnnulees: number;
}

/**
 * Le repli d'un couple (unité, type) ABSENT de l'agrégat SQL.
 *
 * L'absence de ligne signifie « aucune session de ce type pour cette unité », et
 * elle doit se lire ZÉRO, jamais « inconnu » : c'est exactement l'information que
 * l'écran de couverture existe pour rendre visible.
 */
const COMPTE_NUL: Decomptes = { planifie: 0, realise: 0, nonAnnulees: 0 };

// -----------------------------------------------------------------------------
// LE CALCUL
// -----------------------------------------------------------------------------

/**
 * La couverture d'une mission : une ligne par unité de la page, et les marges de
 * la mission entière.
 *
 * L'ordre des lignes est celui de `unitesDeLaPage` — c'est-à-dire celui du `ORDER
 * BY` du dépôt, lui-même identique à celui de l'arbre (`(position, id)`). Cette
 * fonction ne retrie RIEN : un second tri, ici, pourrait contredire le curseur et
 * faire sauter des lignes à la page suivante sans jamais lever d'erreur.
 */
export function calculerCouverture(entree: EntreeCouverture): CouvertureMission {
  const cibles = new Map(entree.plan.parUnite.map((cible) => [cible.orgUnitId, cible]));
  const comptes = indexerComptes(entree.comptes);
  const rangs = profondeurs(entree.toutesLesUnites);

  const touchesParUnite = new Map<string, Set<string>>();
  for (const touche of entree.blocsTouches) {
    const existant = touchesParUnite.get(touche.orgUnitId);
    if (existant === undefined) touchesParUnite.set(touche.orgUnitId, new Set([touche.blocCode]));
    else existant.add(touche.blocCode);
  }

  function comptesDe(orgUnitId: string, kind: TypeSession): Decomptes {
    return comptes.get(`${orgUnitId} ${kind}`) ?? COMPTE_NUL;
  }

  function ligne(unite: UnitePourPlan): UniteCouverte {
    const cible = cibles.get(unite.id);
    const parSource = SOURCES_COLLECTE.map((kind) => {
      const compte = comptesDe(unite.id, kind);
      return cellule(kind, prevuDeLaSource(cible, kind), compte.planifie, compte.realise);
    });
    const attendues = parSource.filter((c) => c.prevu.min > 0);
    const sessionsVivantes = [...SOURCES_COLLECTE, KIND_ATELIER].reduce(
      (total, kind) => total + comptesDe(unite.id, kind).nonAnnulees,
      0,
    );
    const touches = touchesParUnite.get(unite.id);

    return {
      orgUnitId: unite.id,
      nom: unite.name,
      kind: unite.kind,
      parentId: unite.parentId,
      profondeur: rangs.get(unite.id) ?? 0,
      inScope: unite.inScope,
      effectif: unite.headcount,
      parSource,
      atelierRealise: comptesDe(unite.id, KIND_ATELIER).realise,
      sourcesCouvertes: attendues.filter((c) => c.couvert).length,
      sourcesAttendues: attendues.length,
      blocsNonCouverts: entree.blocsActifs.filter((code) => touches?.has(code) !== true),
      // L'alerte ne vise QUE le périmètre : une unité sortie du périmètre (§25.1)
      // sans session n'est pas un oubli, c'est une décision déjà prise et tracée.
      aucuneSession: unite.inScope && sessionsVivantes === 0,
    };
  }

  return {
    missionId: entree.plan.missionId,
    timezone: entree.timezone,
    calculeLe: entree.calculeLe,
    blocsActifs: [...entree.blocsActifs],
    unites: entree.unitesDeLaPage.map(ligne),
    nextCursor: entree.nextCursor,
    marges: marges(entree, cibles, comptes),
    // Le plan avertit (« 12 unités proposées que personne n'a validées ») : la
    // couverture le répète plutôt que de le taire. Les identifiants d'unités du
    // plan restent DANS le plan — ici ne voyagent que le code et le message.
    avertissements: entree.plan.avertissements.map(({ code, message }) => ({ code, message })),
  };
}

/**
 * LES MARGES — sur la mission entière, et sur le PÉRIMÈTRE seul.
 *
 * Le prévu de mission est la somme des prévus des unités du périmètre ; le
 * planifié et le réalisé, la somme de leurs sessions. Les unités hors périmètre
 * sont COMPTÉES (`unitesHorsPerimetre`) mais n'entrent dans aucun total de
 * couverture : additionner leurs sessions ferait croire à une couverture que le
 * plan n'a jamais demandée.
 */
function marges(
  entree: EntreeCouverture,
  cibles: ReadonlyMap<string, CibleUnite>,
  comptes: ReadonlyMap<string, CompteSessionsUnite>,
): MargesCouverture {
  function comptesDe(orgUnitId: string, kind: TypeSession): Decomptes {
    return comptes.get(`${orgUnitId} ${kind}`) ?? COMPTE_NUL;
  }

  const duPerimetre = entree.toutesLesUnites.filter((u) => u.inScope);
  const horsPerimetre = entree.toutesLesUnites.length - duPerimetre.length;

  const parSource = SOURCES_COLLECTE.map((kind) => {
    let prevu = AUCUN_PREVU;
    let planifie = 0;
    let realise = 0;
    for (const unite of duPerimetre) {
      prevu = additionner(prevu, prevuDeLaSource(cibles.get(unite.id), kind));
      const compte = comptesDe(unite.id, kind);
      planifie += compte.planifie;
      realise += compte.realise;
    }
    return cellule(kind, prevu, planifie, realise);
  });

  const sansAucuneSession = duPerimetre.filter(
    (unite) =>
      [...SOURCES_COLLECTE, KIND_ATELIER].reduce(
        (total, kind) => total + comptesDe(unite.id, kind).nonAnnulees,
        0,
      ) === 0,
  ).length;

  return {
    parSource,
    atelierRealise: duPerimetre.reduce(
      (total, unite) => total + comptesDe(unite.id, KIND_ATELIER).realise,
      0,
    ),
    unitesInScope: duPerimetre.length,
    unitesHorsPerimetre: horsPerimetre,
    unitesSansAucuneSession: sansAucuneSession,
  };
}
