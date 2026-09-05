// =============================================================================
// LA VUE INITIALE EST UNE RÈGLE, PAS UNE CONSTANTE — arbitrage A01 du 2026-09-05
//
// ── LA RÈGLE, MOT POUR MOT ──────────────────────────────────────────────────
// « Le cockpit “Aujourd'hui” est la vue initiale QUAND une mission est embarquée ;
// `accueil` reste la vue initiale QUAND aucune ne l'est. » `accueil` (L5a) est
// l'écran d'EMBARQUEMENT — il sert avant qu'il y ait une journée ; `aujourdhui`
// (03 §34.2) est l'écran de la JOURNÉE — il n'a pas de sens sans mission. Les
// deux existent, chacun dans son état.
//
// ── CE QUE LA RÈGLE NE TOUCHE PAS : LA REPRISE INSTANTANÉE ─────────────────
// 03 §17.4 : « rouvrir l'app = revenir EXACTEMENT à la question en cours ». Si la
// vue restaurée n'est PAS la vue par défaut — un entretien en cours, l'agenda —
// la règle ne s'applique pas : on revient là où l'auditeur était. Elle ne joue
// que sur l'ATTERRISSAGE par défaut, c'est-à-dire quand `navigation.ts` n'a rien
// eu à restaurer et a posé `VUE_INITIALE` faute de mieux.
//
// ── POURQUOI UNE FONCTION PURE ──────────────────────────────────────────────
// Pour qu'elle soit testable sur ses deux cas sans monter d'application, ce que
// l'arbitrage exige nommément (« un test qui couvre les deux cas »). La lecture
// de la base est à côté, et séparée.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================
import { CLES_META, type BaseLocale } from '../../local/base.js';
import { VUE_INITIALE, type CodeVue } from '../../app/vues.js';

export interface SituationAuDemarrage {
  /** Au moins une mission a ses DONNÉES sur l'appareil (`missionEmbarquee`, L5a). */
  readonly missionEmbarquee: boolean;
  /** La vue sur laquelle `navigation.ts` a fait atterrir l'application. */
  readonly vueAtterrissage: CodeVue;
  /** Profondeur de la pile : 1 = aucune navigation n'a encore eu lieu. */
  readonly profondeurPile: number;
}

/**
 * La vue que l'application doit AFFICHER au démarrage.
 *
 * Trois conditions cumulatives pour basculer vers le cockpit ; si l'une manque,
 * la vue d'atterrissage est rendue telle quelle — c'est la reprise instantanée.
 */
export function vueInitiale(situation: SituationAuDemarrage): CodeVue {
  const atterrissageParDefaut =
    situation.vueAtterrissage === VUE_INITIALE && situation.profondeurPile === 1;
  return situation.missionEmbarquee && atterrissageParDefaut
    ? 'aujourdhui'
    : situation.vueAtterrissage;
}

/**
 * Une mission au moins est-elle embarquée sur cet appareil ?
 *
 * Lit les marques `mission:embarquee:<id>` de `meta` — la même définition que
 * `missionEmbarquee(base, id)` de L5a (« données présentes », jamais
 * « persistance accordée », DECISIONS.md 2026-09-02), sans connaître les ids.
 */
export async function aUneMissionEmbarquee(base: BaseLocale): Promise<boolean> {
  const prefixe = CLES_META.prefixeEmbarquement;
  return (await base.meta.where('cle').between(prefixe, `${prefixe}￿`).count()) > 0;
}
