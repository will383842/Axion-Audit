// =============================================================================
// LE MOTEUR DE SCORING — 03 §32.1 de bout en bout. Lot L8.
// FONCTION PURE : on lui remet un instantané, il rend un résultat. Aucune base,
// aucun Fastify, aucune horloge — deux exécutions sur le même jeu rendent le même
// résultat à l'octet près, et c'est la moitié du critère d'acceptation du lot.
//
// ── INVARIANT 6 — LE TERRAIN COLLECTE, LE SIÈGE PRODUIT ────────────────────
// Ce calcul vit CÔTÉ SERVEUR et n'en sort jamais. Aucun composant React ne
// recalcule un score : la console affiche `ResultatScoringMission`, elle ne le
// fabrique pas. Un score recalculé dans deux langages est un score qui finira par
// différer, et c'est le dossier d'audit qui perdrait.
//
// ── INVARIANT 7 — `answers`, JAMAIS `answer_revisions` ─────────────────────
// L'entrée ne porte que la révision COURANTE (cf. `entree.ts`). Lire l'archive
// compterait DEUX FOIS une réponse corrigée et ferait pencher la moyenne du
// §32.1-1 vers la valeur que l'auditeur a justement rectifiée. Rien n'est écrasé
// pour autant : l'archive existe, elle n'entre simplement pas dans un score.
//
// ── LE CRITÈRE QUI DÉCIDE DU LOT ───────────────────────────────────────────
// « Un drapeau rouge n'est JAMAIS masqué par la moyenne » (07, ligne L8). Ce n'est
// pas un test, c'est une PROPRIÉTÉ DE STRUCTURE, et elle tient à quatre choses
// visibles dans ce fichier :
//   1. le drapeau se décide dans `bareme.ts`, sur la CRITICITÉ de la question —
//      avant qu'aucune moyenne n'existe, et sans jamais consulter un poids ;
//   2. il remonte l'arbre par UNION (`drapeauxDuSousArbre`), jamais par moyenne,
//      jamais par seuil, jamais par déduplication ;
//   3. aucune branche de ce fichier ne FILTRE un drapeau : il n'existe pas de
//      chemin où un drapeau construit ne ressorte pas dans `drapeauxRouges` ;
//   4. l'autre façon de masquer — ne jamais ÉVALUER la question qui fâche — est
//      comptée en anomalie `QUESTION_BLOQUANTE_NON_EVALUEE`. Un refus poli sur la
//      seule question bloquante ne produit pas un silence, il produit une ligne.
//
// ── CE QUI EST ÉCARTÉ EST DIT, JAMAIS TU ───────────────────────────────────
// Le moteur ne lève jamais. Une réponse orpheline, une unité inconnue, un barème
// malformé : il les ÉCARTE et les RAPPORTE. Échouer priverait l'analyste de toute
// la mission pour une ligne bancale ; écarter en silence lui mentirait.
//
// Traçabilité : E14 (consolidation, scores, divergences, drapeaux) · E15 (rapport :
// complétude et réserves) · E43.
// =============================================================================
import {
  CODES_ANOMALIE_SCORING,
  type AnomalieScoring,
  type CodeAnomalieScoring,
  type CotationReponse,
  type Divergence,
  type GroupeInterlocuteurPlan,
  type NoeudScore,
  type PropositionDrapeauRouge,
  type ResultatScoringMission,
  type ResultatUnite,
  type TypeDivergence,
} from '@axion/shared';

import {
  arrondirScore,
  compter,
  consolider,
  cumuler,
  ecartTypePopulation,
  figerNoeud,
  moyennePonderee,
  noeudVide,
  COMPTEUR_VIDE,
  type BlocBrut,
  type Compteur,
  type EtatQuestion,
  type NoeudBrut,
  type TermeRollup,
} from './agregation.js';
import { coterReponse, lireBareme, poidsDeQuestion, questionEstScorable } from './bareme.js';
import type { CotationDetaillee } from './bareme.js';
import type { EntreeScoring, QuestionFigee, ReponseACoter, UnitePourScoring } from './entree.js';

// -----------------------------------------------------------------------------
// STRUCTURES DE TRAVAIL
// -----------------------------------------------------------------------------

interface QuestionPreparee {
  readonly question: QuestionFigee;
  /** Entre dans les moyennes du §32.1-2 : poids > 0 ET barème exploitable. */
  readonly scorable: boolean;
  readonly poids: number;
}

interface ReponseCotee {
  readonly reponse: ReponseACoter;
  readonly cotation: CotationDetaillee;
}

interface NoeudArbre {
  readonly unite: UnitePourScoring;
  /** Le parent RETENU, ou `null` — jamais un identifiant absent d'`unites`. */
  readonly parentId: string | null;
  readonly niveau: number;
  readonly enfants: readonly string[];
}

/** `headcount` NULL → poids 1 (§32.1-4, « règle affichée dans l'UI »). */
function poidsDUnite(unite: UnitePourScoring): number {
  return unite.headcount ?? 1;
}

// -----------------------------------------------------------------------------
// LES ANOMALIES — français, sans donnée personnelle, sans référence client
// -----------------------------------------------------------------------------

const MESSAGES_ANOMALIE: Record<CodeAnomalieScoring, string> = {
  REPONSE_SANS_QUESTION_FIGEE:
    'Réponse rattachée à une question absente du questionnaire figé de la mission : écartée du calcul.',
  REPONSE_UNITE_INCONNUE:
    "Réponse rattachée à une unité absente de l'arbre de la mission : écartée du calcul.",
  REPONSE_HORS_PERIMETRE:
    'Réponse rattachée à une unité hors périmètre : conservée, exclue du scoring et de la couverture.',
  REPONSE_SANS_UNITE:
    "Réponse issue d'une session sans unité organisationnelle : elle ne peut être rattachée à aucun périmètre.",
  BAREME_INVALIDE:
    "Barème figé d'une forme non reconnue : la question sort du calcul, aucun score n'est deviné.",
  VALEUR_INEXPLOITABLE:
    "Valeur que le barème figé ne sait pas coter : aucun score, et surtout pas un zéro.",
  QUESTION_BLOQUANTE_NON_EVALUEE:
    "Question bloquante non évaluée : son drapeau rouge n'a donc pas pu être vérifié.",
};

function anomalie(
  code: CodeAnomalieScoring,
  cibles: {
    reponseId?: string | null;
    missionQuestionId?: string | null;
    orgUnitId?: string | null;
  } = {},
): AnomalieScoring {
  return {
    code,
    message: MESSAGES_ANOMALIE[code],
    reponseId: cibles.reponseId ?? null,
    missionQuestionId: cibles.missionQuestionId ?? null,
    orgUnitId: cibles.orgUnitId ?? null,
  };
}

// -----------------------------------------------------------------------------
// LES BLOCS — l'ordre d'affichage, et aucune question perdue
// -----------------------------------------------------------------------------

/**
 * L'ordre des blocs déclarés (`blocks.position`), PUIS les blocs qu'une question
 * référence sans être déclarés.
 *
 * Le radar §33.4 a besoin de tous ses axes, y compris vides — un axe manquant
 * change la forme de la figure. Et une question dont le bloc n'a pas été déclaré
 * ne se PERD pas : elle apparaît en fin de liste. Un score juste dans un bloc
 * invisible serait un score que personne ne lit.
 */
function ordonnerBlocs(entree: EntreeScoring): readonly string[] {
  const ordre: string[] = [];
  const vus = new Set<string>();
  for (const code of entree.blocs) {
    if (!vus.has(code)) {
      vus.add(code);
      ordre.push(code);
    }
  }
  for (const question of entree.questions) {
    if (!vus.has(question.blocCode)) {
      vus.add(question.blocCode);
      ordre.push(question.blocCode);
    }
  }
  return ordre;
}

// -----------------------------------------------------------------------------
// L'ARBRE — parents avant enfants, sans jamais boucler
// -----------------------------------------------------------------------------

/**
 * Une unité est une RACINE si elle n'a pas de parent, si son parent est absent de
 * l'arbre fourni, ou si la chaîne des parents boucle.
 *
 * Le rattachement fantôme et le cycle sont des données bancales, pas des cas de
 * programmation : un import CSV mal formé peut les produire. Les traiter en
 * racines garantit que TOUTE unité est parcourue exactement une fois — une unité
 * qu'un cycle rendrait inatteignable disparaîtrait du résultat sans un mot, et
 * c'est la disparition silencieuse que le dépôt refuse partout ailleurs.
 */
function estRacine(unite: UnitePourScoring, index: ReadonlyMap<string, UnitePourScoring>): boolean {
  if (unite.parentId === null) return true;
  let courante = index.get(unite.parentId);
  let pas = 0;
  while (courante !== undefined) {
    if (courante.id === unite.id) return true;
    if (pas > index.size) return true;
    if (courante.parentId === null) return false;
    courante = index.get(courante.parentId);
    pas += 1;
  }
  return true;
}

/**
 * Parcourt l'arbre en PRÉ-ORDRE depuis les racines, sans jamais descendre dans une
 * unité hors périmètre.
 *
 * §25.1 : une unité `in_scope = false` voit ses données CONSERVÉES et exclues du
 * scoring. Son sous-arbre part avec elle : un service rattaché à une direction
 * sortie du périmètre n'a plus de parent dans le périmètre, et le publier
 * fabriquerait une racine que l'arbre réel n'a pas.
 */
function parcourirArbre(unites: readonly UnitePourScoring[]): readonly NoeudArbre[] {
  const index = new Map<string, UnitePourScoring>();
  for (const unite of unites) if (!index.has(unite.id)) index.set(unite.id, unite);

  const racines: UnitePourScoring[] = [];
  const enfantsPar = new Map<string, string[]>();
  for (const unite of unites) {
    if (!index.has(unite.id)) continue;
    if (estRacine(unite, index)) {
      racines.push(unite);
      continue;
    }
    const parentId = unite.parentId;
    if (parentId === null) continue;
    const fratrie = enfantsPar.get(parentId);
    if (fratrie === undefined) enfantsPar.set(parentId, [unite.id]);
    else fratrie.push(unite.id);
  }

  const noeuds: NoeudArbre[] = [];
  const pile: { readonly unite: UnitePourScoring; readonly parentId: string | null; readonly niveau: number }[] =
    racines
      .slice()
      .reverse()
      .map((unite) => ({ unite, parentId: null, niveau: 0 }));

  while (pile.length > 0) {
    const courant = pile.pop();
    if (courant === undefined) break;
    if (!courant.unite.inScope) continue;
    const enfants = (enfantsPar.get(courant.unite.id) ?? []).filter(
      (id) => index.get(id)?.inScope === true,
    );
    noeuds.push({
      unite: courant.unite,
      parentId: courant.parentId,
      niveau: courant.niveau,
      enfants,
    });
    for (let i = enfants.length - 1; i >= 0; i -= 1) {
      const enfant = index.get(enfants[i] ?? '');
      if (enfant === undefined) continue;
      pile.push({ unite: enfant, parentId: courant.unite.id, niveau: courant.niveau + 1 });
    }
  }

  return noeuds;
}

// -----------------------------------------------------------------------------
// LE SCORE PROPRE D'UNE UNITÉ — §32.1-1, -2 et -3
// -----------------------------------------------------------------------------

/**
 * Dans quel état est une question, pour une unité donnée ?
 *
 * Ordre de priorité, et il vient du §27.4 : COTÉE dès qu'une réponse valide existe
 * (une divergence entre deux sessions ne rend pas la question sans réponse) ; puis
 * NON COMMUNIQUÉE — un refus l'emporte, parce qu'il doit se retrouver aux
 * « Limites et réserves » ; puis SANS OBJET ; puis NON RÉPONDUE, qui recouvre
 * l'absence totale de ligne comme la ligne sans valeur exploitable.
 */
function etatDeQuestion(reponses: readonly ReponseCotee[]): EtatQuestion {
  if (reponses.some((r) => r.cotation.score !== null)) return 'cotee';
  if (reponses.some((r) => r.cotation.motifNonCotable === 'non_communique')) {
    return 'non_communiquee';
  }
  if (reponses.some((r) => r.cotation.motifNonCotable === 'sans_objet')) return 'sans_objet';
  return 'non_repondue';
}

/** Le score d'une question pour une unité = MOYENNE de ses réponses valides (§32.1-1). */
function scoreDeQuestion(reponses: readonly ReponseCotee[]): number | null {
  const scores = reponses
    .map((r) => r.cotation.score)
    .filter((score): score is number => score !== null);
  if (scores.length === 0) return null;
  return scores.reduce((somme, score) => somme + score, 0) / scores.length;
}

interface AccumulateurBloc {
  numerateur: number;
  poidsTotal: number;
  completude: Compteur;
}

/**
 * Le nœud PROPRE d'une unité : ses réponses à elle, et rien de son sous-arbre.
 *
 * Le score de l'unité n'est PAS la moyenne des scores de ses blocs : ce sont les
 * POIDS des questions qui pondèrent, d'un bout à l'autre (§32.1-2). Faire la
 * moyenne des blocs donnerait le même poids à un bloc de deux questions et à un
 * bloc de vingt — une pondération que personne n'a écrite.
 */
function noeudPropre(
  ordreBlocs: readonly string[],
  questionsScorables: readonly QuestionPreparee[],
  reponsesParQuestion: ReadonlyMap<string, readonly ReponseCotee[]>,
): NoeudBrut {
  const accumulateurs = new Map<string, AccumulateurBloc>();
  for (const blocCode of ordreBlocs) {
    accumulateurs.set(blocCode, { numerateur: 0, poidsTotal: 0, completude: COMPTEUR_VIDE });
  }

  for (const preparee of questionsScorables) {
    const blocCode = preparee.question.blocCode;
    const accumulateur = accumulateurs.get(blocCode);
    if (accumulateur === undefined) continue;
    const reponses = reponsesParQuestion.get(preparee.question.missionQuestionId) ?? [];
    const etat = etatDeQuestion(reponses);
    accumulateur.completude = compter(accumulateur.completude, etat);
    if (etat !== 'cotee') continue;
    const score = scoreDeQuestion(reponses);
    if (score === null) continue;
    accumulateur.numerateur += preparee.poids * score;
    accumulateur.poidsTotal += preparee.poids;
  }

  const blocs: BlocBrut[] = ordreBlocs.map((blocCode) => {
    const accumulateur = accumulateurs.get(blocCode) ?? {
      numerateur: 0,
      poidsTotal: 0,
      completude: COMPTEUR_VIDE,
    };
    return {
      blocCode,
      score: accumulateur.poidsTotal > 0 ? accumulateur.numerateur / accumulateur.poidsTotal : null,
      poidsTotal: accumulateur.poidsTotal,
      completude: accumulateur.completude,
    };
  });

  let numerateur = 0;
  let poidsTotal = 0;
  let completude = COMPTEUR_VIDE;
  for (const bloc of blocs) {
    if (bloc.score !== null) numerateur += bloc.score * bloc.poidsTotal;
    poidsTotal += bloc.poidsTotal;
    completude = cumuler(completude, bloc.completude);
  }

  return {
    score: poidsTotal > 0 ? numerateur / poidsTotal : null,
    completude,
    blocs,
  };
}

// -----------------------------------------------------------------------------
// LA DIVERGENCE — §32.1-5
// -----------------------------------------------------------------------------

/** L'écart-type se lit à 4 décimales : au-delà, on comparerait du bruit binaire. */
function arrondirEcartType(valeur: number): number {
  return Math.round(valeur * 10_000) / 10_000;
}

/** La valeur BRUTE d'une réponse, pour détecter une contradiction oui/non. */
function valeurBrute(reponse: ReponseACoter): unknown {
  const value = reponse.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  return 'v' in value ? value.v : undefined;
}

function moyennesParGroupe(
  reponses: readonly ReponseCotee[],
): Partial<Record<GroupeInterlocuteurPlan, number>> {
  const parGroupe = new Map<GroupeInterlocuteurPlan, number[]>();
  for (const { reponse, cotation } of reponses) {
    const groupe = reponse.groupeInterlocuteur;
    if (groupe === undefined || groupe === null || cotation.score === null) continue;
    const scores = parGroupe.get(groupe);
    if (scores === undefined) parGroupe.set(groupe, [cotation.score]);
    else scores.push(cotation.score);
  }
  const moyennes: Partial<Record<GroupeInterlocuteurPlan, number>> = {};
  for (const [groupe, scores] of parGroupe) {
    moyennes[groupe] = arrondirScore(scores.reduce((somme, s) => somme + s, 0) / scores.length);
  }
  return moyennes;
}

/**
 * Les divergences d'une question pour une unité — zéro, une, ou deux.
 *
 * L'ÉCART-TYPE ne s'évalue que « sur échelle » (§32.1-5, mot pour mot) : sur un
 * oui/non, un écart de 2,5 est le seul écart possible entre deux réponses
 * opposées et ne dit rien de plus que la contradiction elle-même.
 *
 * La CONTRADICTION oui/non se lit sur les valeurs BRUTES, pas sur les scores : le
 * barème étant inversable question par question, comparer des scores ferait
 * dépendre la détection d'un choix de cotation.
 *
 * Signaler n'est PAS refuser de compter : la moyenne du §32.1-1 reste calculée. Un
 * désaccord est une piste d'analyse (M5.4 : « à creuser »), pas une donnée retirée.
 */
function divergencesDeQuestion(
  question: QuestionFigee,
  orgUnitId: string,
  reponses: readonly ReponseCotee[],
  seuilEcartType: number,
): readonly Divergence[] {
  const valides = reponses.filter((r) => r.cotation.score !== null);
  if (valides.length < 2) return [];

  const scores = valides.map((r) => r.cotation.score ?? 0);
  const groupes = moyennesParGroupe(valides);
  const base = {
    missionQuestionId: question.missionQuestionId,
    orgUnitId,
    nbReponses: valides.length,
    scores,
    moyennesParGroupe: groupes,
  };
  const trouvees: Divergence[] = [];

  if (question.answerType === 'scale_1_5') {
    const ecart = ecartTypePopulation(scores);
    if (ecart !== null && ecart >= seuilEcartType) {
      trouvees.push({
        ...base,
        type: 'ecart_type' satisfies TypeDivergence,
        ecartType: arrondirEcartType(ecart),
      });
    }
  }

  if (question.answerType === 'yes_no') {
    const distinctes = new Set(valides.map((r) => JSON.stringify(valeurBrute(r.reponse) ?? null)));
    if (distinctes.size >= 2) {
      trouvees.push({
        ...base,
        type: 'contradiction_oui_non' satisfies TypeDivergence,
        // L'écart-type n'a pas de sens ici : le §32.1-5 le réserve aux échelles.
        ecartType: null,
      });
    }
  }

  return trouvees;
}

// -----------------------------------------------------------------------------
// LE POINT D'ENTRÉE
// -----------------------------------------------------------------------------

/**
 * CALCULE LE SCORING D'UNE MISSION — barème, agrégation, complétude, roll-up,
 * divergences et drapeaux rouges, en une passe et sans effet de bord.
 */
export function calculerScoringMission(entree: EntreeScoring): ResultatScoringMission {
  const ordreBlocs = ordonnerBlocs(entree);
  const anomalies: AnomalieScoring[] = [];

  // ── 1. LES QUESTIONS FIGÉES ────────────────────────────────────────────────
  const questions = new Map<string, QuestionPreparee>();
  const questionsScorables: QuestionPreparee[] = [];
  for (const question of entree.questions) {
    if (questions.has(question.missionQuestionId)) continue;
    if (lireBareme(question).forme === 'invalide') {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.BAREME_INVALIDE, {
          missionQuestionId: question.missionQuestionId,
        }),
      );
    }
    const preparee: QuestionPreparee = {
      question,
      scorable: questionEstScorable(question),
      poids: poidsDeQuestion(question),
    };
    questions.set(question.missionQuestionId, preparee);
    if (preparee.scorable) questionsScorables.push(preparee);
  }

  // ── 2. L'ARBRE ─────────────────────────────────────────────────────────────
  const noeuds = parcourirArbre(entree.unites);
  const retenues = new Set(noeuds.map((noeud) => noeud.unite.id));
  const connues = new Set(entree.unites.map((unite) => unite.id));

  // ── 3. LA VENTILATION DES RÉPONSES ─────────────────────────────────────────
  const cotations: CotationReponse[] = [];
  const drapeauxRouges: PropositionDrapeauRouge[] = [];
  /** unité → question → réponses cotées. */
  const parUnite = new Map<string, Map<string, ReponseCotee[]>>();

  for (const reponse of entree.reponses) {
    const preparee = questions.get(reponse.missionQuestionId);
    if (preparee === undefined) {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.REPONSE_SANS_QUESTION_FIGEE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
          orgUnitId: reponse.orgUnitId,
        }),
      );
      continue;
    }
    const orgUnitId = reponse.orgUnitId;
    if (orgUnitId === null) {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.REPONSE_SANS_UNITE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
        }),
      );
      continue;
    }
    if (!connues.has(orgUnitId)) {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.REPONSE_UNITE_INCONNUE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
          orgUnitId,
        }),
      );
      continue;
    }
    if (!retenues.has(orgUnitId)) {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.REPONSE_HORS_PERIMETRE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
          orgUnitId,
        }),
      );
      continue;
    }

    const cotation = coterReponse(preparee.question, reponse);
    cotations.push({
      reponseId: cotation.reponseId,
      missionQuestionId: cotation.missionQuestionId,
      score: cotation.score,
      motifNonCotable: cotation.motifNonCotable,
    });

    if (cotation.motifNonCotable === 'valeur_inexploitable') {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.VALEUR_INEXPLOITABLE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
          orgUnitId,
        }),
      );
    }

    // L'AUTRE FAÇON DE MASQUER UN DRAPEAU ROUGE, et la plus discrète : un refus
    // poli sur la question qui fâche, et le drapeau ne se déclenche jamais. Elle
    // est comptée, quel que soit le poids de la question — une bloquante de
    // poids 0 est hors de toutes les moyennes, donc hors de toute alerte de score.
    if (preparee.question.criticality === 'bloquant' && cotation.motifNonCotable !== null) {
      anomalies.push(
        anomalie(CODES_ANOMALIE_SCORING.QUESTION_BLOQUANTE_NON_EVALUEE, {
          reponseId: reponse.id,
          missionQuestionId: reponse.missionQuestionId,
          orgUnitId,
        }),
      );
    }

    if (cotation.declencheurDrapeau !== null) {
      drapeauxRouges.push({
        reponseId: reponse.id,
        entretienId: reponse.interviewId,
        missionQuestionId: reponse.missionQuestionId,
        orgUnitId,
        blocCode: preparee.question.blocCode,
        criticite: preparee.question.criticality,
        declencheur: cotation.declencheurDrapeau,
        seuil: cotation.seuilDrapeau,
        score: cotation.score,
        valeurDeclenchante: cotation.valeurDeclenchante ?? '',
        statut: 'propose',
      });
    }

    const parQuestion = parUnite.get(orgUnitId) ?? new Map<string, ReponseCotee[]>();
    parUnite.set(orgUnitId, parQuestion);
    const liste = parQuestion.get(reponse.missionQuestionId);
    if (liste === undefined) parQuestion.set(reponse.missionQuestionId, [{ reponse, cotation }]);
    else liste.push({ reponse, cotation });
  }

  // ── 4. LE SCORE PROPRE ET LES DIVERGENCES, UNITÉ PAR UNITÉ ────────────────
  const propres = new Map<string, NoeudBrut>();
  const divergencesParUnite = new Map<string, Divergence[]>();
  const toutesDivergences: Divergence[] = [];

  for (const noeud of noeuds) {
    const reponsesParQuestion = parUnite.get(noeud.unite.id) ?? new Map<string, ReponseCotee[]>();
    propres.set(
      noeud.unite.id,
      noeudPropre(ordreBlocs, questionsScorables, reponsesParQuestion),
    );

    const trouvees: Divergence[] = [];
    for (const [missionQuestionId, reponses] of reponsesParQuestion) {
      const preparee = questions.get(missionQuestionId);
      if (preparee === undefined) continue;
      trouvees.push(
        ...divergencesDeQuestion(
          preparee.question,
          noeud.unite.id,
          reponses,
          entree.parametres.seuilDivergenceEcartType,
        ),
      );
    }
    divergencesParUnite.set(noeud.unite.id, trouvees);
    toutesDivergences.push(...trouvees);
  }

  // ── 5. LE ROLL-UP §32.1-4 ET L'UNION DES DRAPEAUX ─────────────────────────
  // Le parcours est en PRÉ-ORDRE : un parent précède toujours ses enfants. Le
  // remonter à l'envers traite donc chaque enfant AVANT son parent, sans
  // récursion — un arbre profond ne peut pas faire déborder la pile.
  const consolides = new Map<string, NoeudBrut>();
  const drapeauxParUnite = new Map<string, PropositionDrapeauRouge[]>();
  for (const drapeau of drapeauxRouges) {
    if (drapeau.orgUnitId === null) continue;
    const liste = drapeauxParUnite.get(drapeau.orgUnitId);
    if (liste === undefined) drapeauxParUnite.set(drapeau.orgUnitId, [drapeau]);
    else liste.push(drapeau);
  }
  const drapeauxDuSousArbre = new Map<string, PropositionDrapeauRouge[]>();

  for (let i = noeuds.length - 1; i >= 0; i -= 1) {
    const noeud = noeuds[i];
    if (noeud === undefined) continue;
    const propre = propres.get(noeud.unite.id) ?? noeudVide(ordreBlocs);

    const termes: TermeRollup[] = [{ poids: poidsDUnite(noeud.unite), noeud: propre }];
    // UNION, jamais moyenne : le drapeau du niveau 4 arrive intact au niveau 0.
    const cumulDrapeaux = [...(drapeauxParUnite.get(noeud.unite.id) ?? [])];
    for (const enfantId of noeud.enfants) {
      const consolideEnfant = consolides.get(enfantId);
      const uniteEnfant = entree.unites.find((unite) => unite.id === enfantId);
      if (consolideEnfant !== undefined && uniteEnfant !== undefined) {
        termes.push({ poids: poidsDUnite(uniteEnfant), noeud: consolideEnfant });
      }
      cumulDrapeaux.push(...(drapeauxDuSousArbre.get(enfantId) ?? []));
    }

    consolides.set(noeud.unite.id, consolider(termes, ordreBlocs));
    drapeauxDuSousArbre.set(noeud.unite.id, cumulDrapeaux);
  }

  // ── 6. LA MISSION — le roll-up des RACINES (§32.1-4, « et l'entreprise ») ──
  const racines = noeuds.filter((noeud) => noeud.parentId === null);
  const noeudMission = consolider(
    racines.map((noeud) => ({
      poids: poidsDUnite(noeud.unite),
      noeud: consolides.get(noeud.unite.id) ?? noeudVide(ordreBlocs),
    })),
    ordreBlocs,
  );

  // ── 7. LA SORTIE ──────────────────────────────────────────────────────────
  const seuil = entree.parametres.seuilCompletudeBloc;
  const unites: ResultatUnite[] = noeuds.map((noeud) => ({
    orgUnitId: noeud.unite.id,
    parentId: noeud.parentId,
    niveau: noeud.niveau,
    headcount: noeud.unite.headcount,
    propre: figerNoeud(propres.get(noeud.unite.id) ?? noeudVide(ordreBlocs), seuil),
    consolide: figerNoeud(consolides.get(noeud.unite.id) ?? noeudVide(ordreBlocs), seuil),
    drapeauxRouges: drapeauxDuSousArbre.get(noeud.unite.id) ?? [],
    divergences: divergencesParUnite.get(noeud.unite.id) ?? [],
  }));

  const mission: NoeudScore = figerNoeud(noeudMission, seuil);

  return {
    missionId: entree.missionId,
    parametres: entree.parametres,
    mission,
    unites,
    drapeauxRouges,
    divergences: toutesDivergences,
    cotations,
    anomalies,
  };
}

// `moyennePonderee` est réexportée pour les tests d'acceptation croisés : la
// formule du §32.1-4 doit pouvoir être éprouvée seule, sans monter un jeu complet.
export { moyennePonderee };
