// =============================================================================
// L'AGRÉGATION — moyennes pondérées, complétude, roll-up. 03 §32.1-1 à -4, §27.4.
// Lot L8. FONCTIONS PURES : aucune E/S, aucune horloge, aucun aléa.
//
// ── LES QUATRE FORMULES DU §32.1, ET RIEN D'AUTRE ──────────────────────────
//   1. score d'une QUESTION pour une unité = moyenne des réponses VALIDES ;
//   2. score d'un BLOC = Σ(poids × score) / Σ(poids) sur les questions RÉPONDUES ;
//   3. COMPLÉTUDE = répondues / posées, sous le seuil → « indicatif » ;
//   4. ROLL-UP = moyenne pondérée par `headcount` (NULL → poids 1).
// Elles sont écrites ici une fois, et le §35.3 en dépend : « à défaut, calcul
// manuel sur l'export selon les formules §32.1 (tableur) ». Ce fichier EST ce
// tableur — si un analyste doit refaire un score à la main, c'est cet ordre
// d'opérations qu'il suivra.
//
// ── LE PARENT EST UN TERME DE SA PROPRE CONSOLIDATION ──────────────────────
// LECTURE DOCUMENTÉE, ET C'EST UN CHOIX, PAS UNE ÉVIDENCE. Le §32.1-4 dit
// « moyenne pondérée par `headcount` DES ENFANTS » et ne dit pas ce que devient
// une unité PARENTE qui a été interrogée pour elle-même (une direction où l'on a
// mené deux entretiens, en plus de ses cinq services). Deux lectures existaient :
//   · n'agréger que les enfants — les réponses propres du parent DISPARAÎTRAIENT
//     du score consolidé, alors qu'elles ont coûté deux entretiens ;
//   · compter le parent comme un terme de plus, pondéré par SON `headcount`.
// La seconde est retenue : aucune lecture ne peut vouloir qu'une donnée collectée
// s'évapore, et l'invariant 7 (« rien n'est jamais silencieusement écrasé ») dit
// la même chose d'un autre côté. Le score PROPRE reste publié à côté du score
// CONSOLIDÉ : les deux lectures restent disponibles, personne n'a à croire la
// nôtre sur parole. Porté à `DECISIONS.md`.
//
// ── LE SANS-OBJET SORT, LE REFUS RESTE ─────────────────────────────────────
// §27.4 : un refus « sort du CALCUL » (jamais de pénalité) mais ABAISSE la
// complétude — l'exemple du pack le dit au chiffre près : « score 3,2/5, établi
// sur 84 % des questions — 6 non communiquées ». Un sans-objet, lui, sort des
// DEUX : une question qui ne se pose pas ici ne manque pas. Confondre les deux
// ferait mentir la rubrique « Limites et réserves » qui protège le cabinet.
//
// Traçabilité : E14 (consolidation, scores) · E15 (complétude au rapport).
// =============================================================================
import type { Completude, NoeudScore, ScoreBloc } from '@axion/shared';

// -----------------------------------------------------------------------------
// LES QUATRE ÉTATS D'UNE QUESTION POSÉE À UNE UNITÉ (§27.4)
// -----------------------------------------------------------------------------

/**
 * Ils PARTITIONNENT les questions scorables posées : chaque question tombe dans
 * un état et un seul, et la somme des quatre compteurs redonne `posees`. Une
 * partition qui ne somme pas est le signe qu'une réponse s'est perdue — le moteur
 * et ses tests le vérifient plutôt que de l'espérer.
 */
export const ETATS_QUESTION = ['cotee', 'non_communiquee', 'sans_objet', 'non_repondue'] as const;
export type EtatQuestion = (typeof ETATS_QUESTION)[number];

/** Les cinq compteurs, avant que le ratio et le seuil ne s'y appliquent. */
export interface Compteur {
  readonly posees: number;
  readonly cotees: number;
  readonly nonCommuniquees: number;
  readonly sansObjet: number;
  readonly nonRepondues: number;
}

export const COMPTEUR_VIDE: Compteur = {
  posees: 0,
  cotees: 0,
  nonCommuniquees: 0,
  sansObjet: 0,
  nonRepondues: 0,
};

/** Ajoute UNE question dans son état. `posees` s'incrémente dans tous les cas. */
export function compter(compteur: Compteur, etat: EtatQuestion): Compteur {
  return {
    posees: compteur.posees + 1,
    cotees: compteur.cotees + (etat === 'cotee' ? 1 : 0),
    nonCommuniquees: compteur.nonCommuniquees + (etat === 'non_communiquee' ? 1 : 0),
    sansObjet: compteur.sansObjet + (etat === 'sans_objet' ? 1 : 0),
    nonRepondues: compteur.nonRepondues + (etat === 'non_repondue' ? 1 : 0),
  };
}

/** Cumule deux compteurs — le roll-up somme les sous-arbres, il ne les pondère pas. */
export function cumuler(a: Compteur, b: Compteur): Compteur {
  return {
    posees: a.posees + b.posees,
    cotees: a.cotees + b.cotees,
    nonCommuniquees: a.nonCommuniquees + b.nonCommuniquees,
    sansObjet: a.sansObjet + b.sansObjet,
    nonRepondues: a.nonRepondues + b.nonRepondues,
  };
}

/**
 * `cotees / (posees − sansObjet)` — `null` quand le dénominateur est nul.
 *
 * Le NON COMMUNIQUÉ reste au dénominateur (§27.4), le SANS OBJET en sort. Jamais
 * de NaN : une division par zéro rendrait un « score » que rien ne fonde, et un
 * NaN qui traverse une moyenne contamine tout ce qu'il touche en silence.
 *
 * Le ratio n'est PAS arrondi : il se compare à un seuil, et un arrondi peut faire
 * traverser un seuil à un score qui ne l'a pas traversé.
 */
export function ratioCompletude(compteur: Compteur): number | null {
  const denominateur = compteur.posees - compteur.sansObjet;
  if (denominateur <= 0) return null;
  return compteur.cotees / denominateur;
}

/**
 * Fige un compteur en `Completude` du contrat partagé.
 *
 * `sousSeuil` est FAUX quand le ratio est inconnu : un périmètre sans question
 * posée n'est pas un périmètre mal couvert, il est vide. Marquer « indicatif » un
 * score inexistant ajouterait une alarme là où il n'y a rien à alarmer.
 */
export function figerCompletude(compteur: Compteur, seuil: number): Completude {
  const ratio = ratioCompletude(compteur);
  return { ...compteur, ratio, sousSeuil: ratio !== null && ratio < seuil };
}

// -----------------------------------------------------------------------------
// LES MOYENNES
// -----------------------------------------------------------------------------

/**
 * Arrondit un score à 2 décimales, une seule fois, À LA SORTIE.
 *
 * Les calculs intermédiaires gardent leur pleine précision : arrondir à chaque
 * étage ferait dériver un roll-up de 4 niveaux, et surtout rendrait le contrôle
 * du jeu de référence FIL-GC impossible — il vérifie qu'on retrouve le MÊME
 * nombre par deux chemins (par bloc et par question).
 *
 * L'`EPSILON` corrige le cas d'école du binaire : `2.675 × 100` vaut
 * `267.49999…`, et `Math.round` seul rendrait 2,67 pour une valeur qui est 2,675.
 */
export function arrondirScore(valeur: number): number {
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

/** Un terme d'une moyenne pondérée : un poids, et une valeur qui peut manquer. */
export interface Terme {
  readonly poids: number;
  readonly valeur: number | null;
}

/**
 * Σ(poids × valeur) / Σ(poids), sur les seuls termes qui ONT une valeur.
 *
 * Un terme sans valeur sort du numérateur ET du dénominateur : c'est la règle du
 * §32.1 pour le non communiqué, et c'est la même arithmétique pour une unité
 * qu'on n'a pas interrogée. Une unité muette ne tire aucune moyenne vers le bas —
 * elle se voit à la COMPLÉTUDE, pas au score.
 *
 * Un terme UNIQUE est rendu tel quel, sans multiplier puis diviser : `(h × x) / h`
 * n'est pas exactement `x` en binaire, et une feuille de l'arbre doit avoir un
 * score consolidé IDENTIQUE à son score propre, au dernier bit.
 */
export function moyennePonderee(termes: readonly Terme[]): number | null {
  const retenus = termes.filter((terme) => terme.valeur !== null && terme.poids > 0);
  if (retenus.length === 0) return null;
  const premier = retenus[0];
  if (retenus.length === 1 && premier !== undefined) return premier.valeur;

  let numerateur = 0;
  let denominateur = 0;
  for (const terme of retenus) {
    numerateur += terme.poids * (terme.valeur ?? 0);
    denominateur += terme.poids;
  }
  return denominateur > 0 ? numerateur / denominateur : null;
}

// -----------------------------------------------------------------------------
// LES NŒUDS BRUTS — scores NON ARRONDIS, jusqu'à la sérialisation
// -----------------------------------------------------------------------------

/** Le score d'un bloc avant arrondi et avant application du seuil. */
export interface BlocBrut {
  readonly blocCode: string;
  readonly score: number | null;
  readonly poidsTotal: number;
  readonly completude: Compteur;
}

/** Un nœud de score (unité propre, sous-arbre consolidé, ou mission) avant sortie. */
export interface NoeudBrut {
  readonly score: number | null;
  readonly completude: Compteur;
  /** Dans l'ORDRE d'affichage des blocs — le radar en dépend (§33.4). */
  readonly blocs: readonly BlocBrut[];
}

/** Un nœud vide mais COMPLET : tous les axes du radar, à zéro. */
export function noeudVide(ordreBlocs: readonly string[]): NoeudBrut {
  return {
    score: null,
    completude: COMPTEUR_VIDE,
    blocs: ordreBlocs.map((blocCode) => ({
      blocCode,
      score: null,
      poidsTotal: 0,
      completude: COMPTEUR_VIDE,
    })),
  };
}

/** Un terme du roll-up : un nœud et le `headcount` qui le pondère. */
export interface TermeRollup {
  readonly poids: number;
  readonly noeud: NoeudBrut;
}

/**
 * LE ROLL-UP §32.1-4 — les scores se pondèrent, les compteurs se somment.
 *
 * Deux arithmétiques différentes dans la même fonction, et c'est volontaire :
 *   · un SCORE est une moyenne pondérée par `headcount` — cent personnes pèsent
 *     dix fois dix personnes ;
 *   · une COMPLÉTUDE est un COMPTE — trente unités jamais interrogées font trente
 *     unités jamais interrogées, quel que soit leur effectif. Les pondérer ferait
 *     disparaître une petite unité oubliée derrière une grosse bien couverte,
 *     c'est-à-dire exactement le genre de dissimulation par la moyenne que ce lot
 *     existe pour empêcher.
 *
 * `poidsTotal` se somme aussi : c'est la masse de barème qui a nourri le
 * sous-arbre, la grandeur avec laquelle un analyste refait le calcul à la main.
 */
export function consolider(
  termes: readonly TermeRollup[],
  ordreBlocs: readonly string[],
): NoeudBrut {
  if (termes.length === 0) return noeudVide(ordreBlocs);

  const score = moyennePonderee(
    termes.map((terme) => ({ poids: terme.poids, valeur: terme.noeud.score })),
  );

  let completude = COMPTEUR_VIDE;
  for (const terme of termes) completude = cumuler(completude, terme.noeud.completude);

  const blocs = ordreBlocs.map((blocCode) => {
    const parts = termes.map((terme) => ({
      poids: terme.poids,
      bloc: terme.noeud.blocs.find((candidat) => candidat.blocCode === blocCode),
    }));
    let compteurBloc = COMPTEUR_VIDE;
    let poidsTotal = 0;
    for (const part of parts) {
      if (part.bloc === undefined) continue;
      compteurBloc = cumuler(compteurBloc, part.bloc.completude);
      poidsTotal += part.bloc.poidsTotal;
    }
    return {
      blocCode,
      score: moyennePonderee(
        parts.map((part) => ({ poids: part.poids, valeur: part.bloc?.score ?? null })),
      ),
      poidsTotal,
      completude: compteurBloc,
    };
  });

  return { score, completude, blocs };
}

// -----------------------------------------------------------------------------
// LA SORTIE — arrondi, seuil, et le contrat partagé
// -----------------------------------------------------------------------------

/**
 * Fige un nœud brut en `NoeudScore` publiable.
 *
 * `indicatif` REPREND `sousSeuil` : le §32.1-3 marque le score, il ne le masque
 * pas. Un score calculé sur 40 % des questions reste affiché, avec sa réserve —
 * le cacher priverait l'analyste de la seule information dont il dispose sur ce
 * périmètre, et le §27.4 est explicite : un refus n'est pas une anomalie.
 */
export function figerNoeud(brut: NoeudBrut, seuil: number): NoeudScore {
  const completude = figerCompletude(brut.completude, seuil);
  const blocs: ScoreBloc[] = brut.blocs.map((bloc) => {
    const completudeBloc = figerCompletude(bloc.completude, seuil);
    return {
      blocCode: bloc.blocCode,
      score: bloc.score === null ? null : arrondirScore(bloc.score),
      poidsTotal: bloc.poidsTotal,
      completude: completudeBloc,
      indicatif: completudeBloc.sousSeuil,
    };
  });
  return {
    score: brut.score === null ? null : arrondirScore(brut.score),
    completude,
    indicatif: completude.sousSeuil,
    blocs,
  };
}

// -----------------------------------------------------------------------------
// LA DIVERGENCE — §32.1-5
// -----------------------------------------------------------------------------

/**
 * Écart-type de la POPULATION observée (diviseur `n`), et non de l'échantillon.
 *
 * Les réponses recueillies dans une unité ne sont pas un tirage dans une
 * population plus large dont on estimerait la variance : ce sont TOUTES les
 * réponses obtenues sur cette question dans cette unité. Le seuil de 1,5 du
 * §32.1-5 se lit sur cette grandeur — un diviseur `n − 1` déclencherait plus
 * souvent, et personne n'a calibré le seuil sur cette lecture-là.
 *
 * `null` à moins de deux réponses : « n = 1 : pas de divergence, jamais de NaN »
 * (§32.1-5, V2.9).
 */
export function ecartTypePopulation(scores: readonly number[]): number | null {
  if (scores.length < 2) return null;
  const moyenne = scores.reduce((somme, score) => somme + score, 0) / scores.length;
  const variance =
    scores.reduce((somme, score) => somme + (score - moyenne) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}
