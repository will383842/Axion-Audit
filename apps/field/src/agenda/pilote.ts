// =============================================================================
// PILOTE DE MISSION CÔTÉ TERRAIN, ET PARCOURS EXPRESS R1
// 03 §17.2 (les 6 étapes) · §32.2 (codes d'étape, CHECK fermé) · §29 R1
//
// ── LES CODES D'ÉTAPE NE SONT PAS INVENTÉS ICI ──────────────────────────────
// 03 §32.2 : « **Codes d'étape** (`step_validations.step_code`, CHECK fermé —
// fichier 04) : `cadrage`, `preparation`, `collecte`, `analyse`, `rapport`,
// `livraison` (scope mission) · `entretien` (scope interview) · `unite` (scope
// org_unit). » Les huit sont recopiés ci-dessous **et un test les compare au
// texte du pack**, dans l'ordre — la recopie est gardée, pas crue sur parole.
//
// **Duplication assumée et remontée** : la même énumération vit déjà dans
// `apps/api/src/db/schema.ts` (`CODES_ETAPE`). Le front terrain ne peut pas
// importer d'`apps/api`, et `packages/shared` n'est pas un répertoire du mandat
// L5c (`LOT_L5.md` §1 : le seul fichier partagé est `app/vues.ts`). Les deux
// copies sont donc tenues par la MÊME source — le pack — via un test qui lit le
// pack. L'extraction vers `packages/shared` appartient à A20.
//
// ── R1, LE PARCOURS EXPRESS — TRANSCRIT MOT POUR MOT ────────────────────────
// 03 §29, R1 : « en niveau `diagnostic_cadrage` sur structure **mono-unité**, les
// étapes du pilote **trivialement satisfaites se valident automatiquement** ;
// pilote **condensé (3 étapes visibles)**. **Guidé intégral dès > 1 unité ou
// > 3 entretiens.** »
//
// Les deux seuils — 1 unité, 3 entretiens — sont la SPÉCIFICATION, pas des
// réglages : ils sont écrits tels quels et comparés au texte du pack par un test.
//
// ── CE QUE LE PACK NE DIT PAS, ET QUE JE NE DEVINE DONC PAS EN SILENCE ──────
// R1 donne le NOMBRE d'étapes visibles (3) mais pas LESQUELLES. Plutôt que d'en
// choisir trois, ce module les CALCULE : sont visibles les étapes qui ne sont pas
// automatiquement validées, `analyse` et `rapport` étant présentées ENSEMBLE
// parce que 03 §32.2 les projette lui-même sur un seul statut de mission
// (« `en_analyse` ⇔ Analyse + Rapport »). Le « 3 » du pack devient alors une
// VÉRIFICATION de ce calcul — un test l'exige — au lieu d'un choix recopié. Si
// la lecture est fausse, c'est le test qui le dira, pas la recette.
// **Le point est remonté dans `DECISIONS.md` : seul Williams peut confirmer que
// les trois étapes visibles sont bien celles-là.**
//
// ── CE MODULE NE VALIDE RIEN CÔTÉ SERVEUR ──────────────────────────────────
// La machine à états de la MISSION (`packages/shared/src/missions.ts`,
// `TRANSITIONS_MISSION`) est SERVEUR et appartient à L3 ; elle n'est ni recopiée
// ni contournée ici. Ce module lit des données LOCALES et dit à l'auditeur où il
// en est — invariant 6 : « le terrain collecte, le siège produit », et
// `LOT_L5.md` §3.5 : le terrain « ne calcule que ce qui porte sur ses propres
// lignes locales et sert la prochaine action ».
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E23 (hyper
// intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================

/**
 * Les huit codes d'étape du 03 §32.2 (`step_validations.step_code`).
 * Recopie GARDÉE : `pilote.test.ts` les relit dans le pack, dans cet ordre.
 */
export const CODES_ETAPE = [
  'cadrage',
  'preparation',
  'collecte',
  'analyse',
  'rapport',
  'livraison',
  'entretien',
  'unite',
] as const;
export type CodeEtape = (typeof CODES_ETAPE)[number];

/** Les SIX étapes du pilote de mission (03 §17.2). `entretien` et `unite` ont une autre portée. */
export const ETAPES_PILOTE = [
  'cadrage',
  'preparation',
  'collecte',
  'analyse',
  'rapport',
  'livraison',
] as const satisfies readonly CodeEtape[];
export type EtapePilote = (typeof ETAPES_PILOTE)[number];

/** Libellés français, ceux du 03 §17.2 — jamais un code technique à l'écran. */
export const LIBELLE_ETAPE: Record<EtapePilote, string> = {
  cadrage: 'Cadrage',
  preparation: 'Préparation',
  collecte: 'Collecte',
  analyse: 'Analyse',
  rapport: 'Rapport',
  livraison: 'Livraison',
};

// ─────────────────────────────────────────────────────────────────────────────
// R1 — LE PARCOURS EXPRESS MICRO
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 03 §29 R1 — « structure **mono**-unité ». Exactement UNE, ni plus ni moins.
 *
 * Le nom garde son `MAX` : il est importé par les tests croisés d'A27, et une
 * constante publique ne se renomme pas pour un confort de lecture. La BORNE, elle,
 * est désormais une ÉGALITÉ.
 *
 * Le `<=` d'origine acceptait ZÉRO unité (majeur M2, A29) : une mission sans
 * arbre n'est pas « mono-unité », c'est une mission qu'on n'a pas encore cadrée.
 * L'express s'y appliquait, `cadrage` redevenait visible faute d'être
 * trivialement satisfaite, et le pilote affichait QUATRE étapes en annonçant
 * « structure mono-unité » — faux sur les deux points.
 */
export const UNITES_MAX_EXPRESS = 1;

/** 03 §29 R1 — « guidé intégral dès […] > 3 entretiens ». */
export const ENTRETIENS_MAX_EXPRESS = 3;

/** 03 §29 R1 — le seul niveau d'audit éligible. */
export const NIVEAU_AUDIT_EXPRESS = 'diagnostic_cadrage';

/** 03 §29 R1 — « pilote condensé (3 étapes visibles) ». */
export const ETAPES_VISIBLES_EXPRESS = 3;

/** Ce que le terrain sait de la mission, en local, sans réseau. */
export interface MesureMission {
  readonly auditLevel: string;
  /** Unités du périmètre, hors fusionnées et supprimées. */
  readonly unites: number;
  /** Sessions de collecte de la mission, tous `kind` confondus. */
  readonly entretiens: number;
  /** Questions figées descendues du siège — 0 = questionnaire non généré. */
  readonly questions: number;
}

/**
 * Le parcours express s'applique-t-il ?
 *
 * Les trois conditions sont CUMULATIVES et lues telles quelles au 03 §29 R1.
 * Le seuil des entretiens est un « > 3 » dans le pack : trois entretiens restent
 * donc express, quatre ne le sont plus. Recopier « >= 3 » aurait inversé la borne
 * sur le cas exact qui la définit.
 */
export function estParcoursExpress(mesure: MesureMission): boolean {
  return (
    mesure.auditLevel === NIVEAU_AUDIT_EXPRESS &&
    mesure.unites === UNITES_MAX_EXPRESS &&
    mesure.entretiens <= ENTRETIENS_MAX_EXPRESS
  );
}

/**
 * Pourquoi le parcours N'EST PAS express — en français, pour l'écran.
 *
 * 03 §19.1 : « chaque étape verrouillée affiche PRÉCISÉMENT ce qui manque […],
 * jamais un simple cadenas muet ». La règle vaut aussi dans l'autre sens :
 * l'auditeur qui voit six étapes au lieu de trois doit pouvoir savoir pourquoi.
 */
export function motifGuideIntegral(mesure: MesureMission): string | null {
  if (estParcoursExpress(mesure)) return null;
  if (mesure.auditLevel !== NIVEAU_AUDIT_EXPRESS) {
    return 'Le parcours condensé est réservé au niveau « diagnostic de cadrage ». Cette mission suit le parcours guidé complet.';
  }
  if (mesure.unites !== UNITES_MAX_EXPRESS) {
    return mesure.unites === 0
      ? 'Cette mission n’a encore aucune unité : le parcours guidé complet s’applique tant que l’arbre organisationnel n’est pas posé.'
      : `Cette mission couvre ${String(mesure.unites)} unités : le parcours guidé complet s’applique dès la deuxième.`;
  }
  return `Cette mission compte ${String(mesure.entretiens)} sessions de collecte : le parcours guidé complet s’applique au-delà de ${String(ENTRETIENS_MAX_EXPRESS)}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LES ÉTAPES, ET CE QUI LES VALIDE TRIVIALEMENT
// ─────────────────────────────────────────────────────────────────────────────
export type OrigineValidation =
  /** Validée à la main, `step_validations` (03 §19.1, geste humain explicite). */
  | 'humaine'
  /** R1 : « trivialement satisfaite », donc validée automatiquement. */
  | 'automatique_express';

export interface EtatEtapePilote {
  readonly code: EtapePilote;
  readonly libelle: string;
  readonly validee: boolean;
  readonly origine: OrigineValidation | null;
  /** Visible dans le pilote CONDENSÉ ? (03 §29 R1) */
  readonly visible: boolean;
  /**
   * Ce qui manque, en français et cliquable côté écran (03 §19.1, §17.2).
   * Vide quand l'étape est validée.
   */
  readonly manques: readonly string[];
}

/**
 * Une étape est-elle TRIVIALEMENT satisfaite au sens de R1 ?
 *
 * « Trivialement » n'est pas « d'office » : les conditions du 03 §17.2 sont
 * MESURÉES sur les données locales, elles sont simplement toutes vraies par
 * construction sur une structure mono-unité.
 *   · `cadrage` = « périmètre géo tranché + arbre confirmé » → l'arbre existe
 *     (au moins une unité) ;
 *   · `preparation` = « questionnaire généré + plan d'entretiens établi + NDA
 *     référencé » → le questionnaire figé est descendu (au moins une question).
 * Une mission express SANS unité ni question n'est donc PAS auto-validée : ce
 * serait valider l'absence de travail, et 09 §5.7 l'interdit nommément.
 *
 * `collecte`, `analyse`, `rapport` et `livraison` ne sont jamais triviales :
 * elles décrivent du travail, pas une structure.
 */
function trivialementSatisfaite(etape: EtapePilote, mesure: MesureMission): boolean {
  switch (etape) {
    case 'cadrage':
      return mesure.unites >= 1;
    case 'preparation':
      return mesure.questions >= 1;
    case 'collecte':
    case 'analyse':
    case 'rapport':
    case 'livraison':
      return false;
  }
}

/**
 * Ce qui manque à une étape non validée — les conditions du 03 §17.2, V1.
 *
 * ── LE CAS QU'UNE PREMIÈRE VERSION AVAIT LAISSÉ MUET ────────────────────────
 * 03 §19.1 : « Une validation = **deux conditions cumulées** : ① conditions
 * automatiques remplies […] ② **validation humaine explicite**. » Une étape dont
 * les conditions automatiques sont TOUTES remplies n'est donc pas validée pour
 * autant — il manque le geste. La première version de cette fonction rendait
 * alors une liste VIDE : l'écran affichait une étape non validée sans dire
 * pourquoi, c'est-à-dire le « cadenas muet » que §19.1 interdit nommément. Le
 * test l'a attrapé. Le dernier message ci-dessous est ce geste manquant.
 */
function manquesDe(etape: EtapePilote, mesure: MesureMission): string[] {
  const manques: string[] = [];
  switch (etape) {
    case 'cadrage':
      if (mesure.unites < 1) manques.push('L’arbre organisationnel n’a aucune unité.');
      break;
    case 'preparation':
      if (mesure.questions < 1) {
        manques.push('Le questionnaire de la mission n’est pas descendu sur cet appareil.');
      }
      break;
    case 'collecte':
      if (mesure.entretiens < 1) manques.push('Aucune session de collecte n’a encore été ouverte.');
      break;
    case 'analyse':
    case 'rapport':
    case 'livraison':
      manques.push('Cette étape se conduit depuis la console, après remontée de la collecte.');
      break;
  }
  if (manques.length === 0) {
    manques.push('Les conditions sont réunies : il reste à valider cette étape explicitement.');
  }
  return manques;
}

/**
 * L'étape est-elle VISIBLE dans le pilote ?
 *
 * En parcours guidé intégral : les six, toujours. En express : celles qui ne sont
 * pas auto-validées, `rapport` étant replié sur `analyse` — 03 §32.2 les projette
 * lui-même sur un seul statut (« `en_analyse` ⇔ Analyse + Rapport »). Le compte
 * qui en résulte est VÉRIFIÉ contre le « 3 » du pack par un test ; il n'est pas
 * posé à la main. Voir l'en-tête, et l'entrée `DECISIONS.md` qui attend Williams.
 */
function visibleEnExpress(etape: EtapePilote, mesure: MesureMission): boolean {
  if (trivialementSatisfaite(etape, mesure)) return false;
  return etape !== 'rapport';
}

export interface PiloteMission {
  readonly express: boolean;
  /** Pourquoi le parcours complet s'applique. `null` en express. */
  readonly motifGuideIntegral: string | null;
  readonly etapes: readonly EtatEtapePilote[];
  /** Les étapes réellement affichées — trois en express (03 §29 R1). */
  readonly etapesVisibles: readonly EtatEtapePilote[];
}

/**
 * Construit le pilote pour l'écran, à partir de mesures LOCALES et des étapes
 * déjà validées à la main (descendues du siège dans `step_validations`).
 *
 * `validationsHumaines` prévaut TOUJOURS sur l'automatisme : une étape validée
 * par un humain le reste, y compris hors express. L'inverse laisserait un
 * changement de périmètre effacer une validation posée par quelqu'un — invariant
 * 7, rien n'est silencieusement écrasé.
 */
export function construirePilote(
  mesure: MesureMission,
  validationsHumaines: readonly EtapePilote[] = [],
): PiloteMission {
  const express = estParcoursExpress(mesure);
  const humaines = new Set(validationsHumaines);

  const etapes = ETAPES_PILOTE.map<EtatEtapePilote>((code) => {
    const parHumain = humaines.has(code);
    const parExpress = express && trivialementSatisfaite(code, mesure);
    const validee = parHumain || parExpress;
    return {
      code,
      libelle: LIBELLE_ETAPE[code],
      validee,
      origine: parHumain ? 'humaine' : parExpress ? 'automatique_express' : null,
      visible: express ? visibleEnExpress(code, mesure) : true,
      manques: validee ? [] : manquesDe(code, mesure),
    };
  });

  return {
    express,
    motifGuideIntegral: motifGuideIntegral(mesure),
    etapes,
    etapesVisibles: etapes.filter((etape) => etape.visible),
  };
}
