// =============================================================================
// TESTS DU VERROU DE LA PWA — lot L5, incrément L5a (réserve BLOQUANTE B1 du
// contrôle A02 du 2026-09-03 : 227 lignes livrées, couverture mesurée 0,00 %).
//
// Écrits par A26 contre 05 §9.7 et 03 §33.7, PAS par l'auteur du module (09 §5.6).
//
// ── LA RÈGLE ÉPROUVÉE, MOT POUR MOT ─────────────────────────────────────────
// 05 §9.7 : « 15 min d'inactivité HORS session de collecte ; pendant une session
// `en_cours` sur l'appareil, le délai est porté à 60 min — l'inactivité se mesure
// sur TOUTE interaction (tactile, clavier, scroll), et le Screen Wake Lock
// maintient l'écran éveillé tant que la session est active […] Bouton de
// verrouillage manuel d'un geste sur toutes les vues terrain. »
// 03 §33.7 : « AUCUNE ressaisie de mot de passe pendant une session active de
// 45 min (verrou §9.7). » C'est le scénario de recette de la porte P-C, et c'est
// la seule raison d'être des DEUX seuils : un verrou qui tombe au milieu d'un
// entretien fait perdre la parole de l'interlocuteur pendant que l'auditeur
// retape un mot de passe.
//
// ── POURQUOI CE NIVEAU, ET PAS PLAYWRIGHT (la justification en deux lignes) ──
// Le fait à prouver est une ÉCHÉANCE : rien ne l'établit sans faire s'écouler
// 15, 45 et 60 minutes, qu'aucun test ne peut attendre pour de vrai. Des
// minuteurs simulés au niveau `interface` (jsdom + `vi.useFakeTimers`) avancent
// ce temps à la milliseconde et donnent accès aux trois seules entrées du hook —
// l'horloge, les évènements de `window`, `visibilitychange` — là où Playwright
// devrait soit attendre 45 minutes réelles, soit piloter la même horloge
// simulée : le même fait, prouvé plus lentement et moins finement.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, ET QUI RESTE DÛ ────────────────────────
// Le Screen Wake Lock est ici un DOUBLE : jsdom n'a pas d'écran à maintenir
// éveillé. Que l'écran d'un iPad reste réellement allumé pendant une session
// relève du mode avion RÉEL rejoué à la main aux portes P-C et P-E (11 §7,
// limite Playwright assumée). Ce fichier prouve le CÂBLAGE de l'API, jamais son
// effet physique, et il le dit plutôt que de laisser croire l'inverse.
//
// Sections éprouvées : 05 §9.7 · 03 §33.7 · 06 §10.5 · docs/conception/LOT_L5.md §4.
// Traçabilité : E33 (sécurité / RGPD : chiffrement local, le verrou étant ce qui
// referme le coffre) · E23 (hyper intuitif, novice autonome : un verrou qui tombe
// en entretien est un verrou que l'auditeur contournera).
// =============================================================================
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELAI_INACTIVITE_MS, useVerrou, type OptionsVerrou } from './verrou.js';

const MINUTE = 60_000;
const T0 = new Date('2026-09-03T08:00:00.000Z');

// ── Doubles du Screen Wake Lock (05 §9.7) ──────────────────────────────────
class SentinelleFactice extends EventTarget {
  public readonly type = 'screen';
  public relachee = false;
  public readonly release = vi.fn(async (): Promise<void> => {
    this.relachee = true;
    this.dispatchEvent(new Event('release'));
    await Promise.resolve();
  });
}

interface WakeLockFactice {
  readonly demandes: ReturnType<typeof vi.fn>;
  readonly sentinelles: SentinelleFactice[];
  /** N'a de sens qu'en mode `differe` : accorde la demande restée en attente. */
  readonly accorder: () => SentinelleFactice;
}

function installerWakeLock(
  comportement: 'accorde' | 'refuse' | 'differe' = 'accorde',
): WakeLockFactice {
  const sentinelles: SentinelleFactice[] = [];
  const enAttente: ((sentinelle: SentinelleFactice) => void)[] = [];
  const demandes = vi.fn(async (): Promise<unknown> => {
    if (comportement === 'refuse') {
      throw new Error('refus simulé du navigateur (batterie faible)');
    }
    if (comportement === 'differe') {
      return new Promise<SentinelleFactice>((resoudre) => enAttente.push(resoudre));
    }
    const sentinelle = new SentinelleFactice();
    sentinelles.push(sentinelle);
    return sentinelle;
  });
  const accorder = (): SentinelleFactice => {
    const sentinelle = new SentinelleFactice();
    sentinelles.push(sentinelle);
    enAttente.shift()?.(sentinelle);
    return sentinelle;
  };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: demandes },
  });
  return { demandes, sentinelles, accorder };
}

// ── Outils de temps et d'évènements ────────────────────────────────────────
function monter(options: OptionsVerrou = {}) {
  return renderHook((props: OptionsVerrou) => useVerrou(props), { initialProps: options });
}

/** Avance le temps SIMULÉ, minuteries comprises. */
async function avancer(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Déplace l'horloge SANS honorer les minuteries — c'est exactement ce que fait un
 * onglet passé en arrière-plan, dont le navigateur bride les `setTimeout`.
 */
function sauterHorlogeSansMinuteries(ms: number): void {
  vi.setSystemTime(new Date(Date.now() + ms));
}

async function interagir(nom: string, cible: EventTarget = window): Promise<void> {
  await act(async () => {
    cible.dispatchEvent(new Event(nom, { bubbles: true }));
    await Promise.resolve();
  });
}

async function reglerVisibilite(etat: 'visible' | 'hidden'): Promise<void> {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — les deux seuils du 05 §9.7', () => {
  it('les deux délais valent EXACTEMENT 15 et 60 minutes', () => {
    expect(DELAI_INACTIVITE_MS.horsSession).toBe(15 * MINUTE);
    expect(DELAI_INACTIVITE_MS.sessionActive).toBe(60 * MINUTE);
  });

  it('le délai en vigueur suit la présence d’une session `en_cours`', () => {
    expect(monter({ sessionActive: false }).result.current.delaiCourantMs).toBe(15 * MINUTE);
    expect(monter({ sessionActive: true }).result.current.delaiCourantMs).toBe(60 * MINUTE);
  });

  it('@critique hors session : rien à 14 min 59 s 999, verrouillé à 15 min pile', async () => {
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await avancer(15 * MINUTE - 1);
    expect(result.current.verrouille).toBe(false);
    expect(surVerrouillage).not.toHaveBeenCalled();

    await avancer(1);
    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(1);
  });

  it('@critique UNE SESSION ACTIVE DE 45 MIN NE SE VERROUILLE JAMAIS (03 §33.7)', async () => {
    // Le scénario de recette P-C, joué tel qu'il se vit : l'interlocuteur parle,
    // l'auditeur écoute et ne touche RIEN pendant trois quarts d'heure.
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: true, surVerrouillage });

    await avancer(45 * MINUTE);

    expect(result.current.verrouille).toBe(false);
    expect(surVerrouillage).not.toHaveBeenCalled();
    // Et il reste bien un quart d'heure au compteur : le seuil de 60 min court.
    expect(result.current.msAvantVerrouillage()).toBe(15 * MINUTE);
  });

  it('contrôle d’anti-vacuité : les MÊMES 45 min HORS session verrouillent bien', async () => {
    // Sans ce contrôle, le test précédent passerait aussi avec une horloge qui
    // n'avance pas — c'est-à-dire en ne prouvant rien du tout.
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await avancer(45 * MINUTE);

    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(1);
  });

  it('@critique session active : rien à 59 min 59 s 999, verrouillé à 60 min pile', async () => {
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: true, surVerrouillage });

    await avancer(60 * MINUTE - 1);
    expect(result.current.verrouille).toBe(false);

    await avancer(1);
    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(1);
  });

  it('le compte à rebours décroît du temps réellement écoulé', async () => {
    const { result } = monter({ sessionActive: false });
    expect(result.current.msAvantVerrouillage()).toBe(15 * MINUTE);
    await avancer(4 * MINUTE);
    expect(result.current.msAvantVerrouillage()).toBe(11 * MINUTE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — la bascule 15 ↔ 60 min', () => {
  it('@critique une session qui DÉMARRE à la 14ᵉ minute repousse le verrou', async () => {
    // Le cas qui coûte le plus cher : l'auditeur a préparé son entretien
    // 14 minutes en silence, puis démarre la session. Le verrou ne doit pas
    // tomber une minute plus tard, en plein accord de participation.
    const surVerrouillage = vi.fn();
    const { result, rerender } = monter({ sessionActive: false, surVerrouillage });

    await avancer(14 * MINUTE);
    expect(result.current.verrouille).toBe(false);

    rerender({ sessionActive: true, surVerrouillage });
    expect(result.current.delaiCourantMs).toBe(60 * MINUTE);

    await avancer(45 * MINUTE);
    expect(result.current.verrouille).toBe(false);
    expect(surVerrouillage).not.toHaveBeenCalled();
  });

  it('la session terminée ramène le délai à 15 min, et le verrou tombe dans ce délai', async () => {
    const surVerrouillage = vi.fn();
    const { result, rerender } = monter({ sessionActive: true, surVerrouillage });

    await avancer(30 * MINUTE);
    rerender({ sessionActive: false, surVerrouillage });
    expect(result.current.delaiCourantMs).toBe(15 * MINUTE);

    await avancer(15 * MINUTE - 1);
    expect(result.current.verrouille).toBe(false);
    await avancer(1);
    expect(result.current.verrouille).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — « l’inactivité se mesure sur TOUTE interaction »', () => {
  // 05 §9.7 nomme « tactile, clavier, scroll ». Les six évènements écoutés par le
  // module sont éprouvés un par un : un seul qui ne repousserait pas le verrou, et
  // l'auditeur qui relit une longue consigne se fait verrouiller en la lisant.
  const EVENEMENTS = [
    'pointerdown',
    'pointermove',
    'keydown',
    'wheel',
    'scroll',
    'touchstart',
  ] as const;

  it.each(EVENEMENTS)('@critique « %s » à la 14ᵉ minute repousse le verrou', async (nom) => {
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await avancer(14 * MINUTE);
    await interagir(nom);

    // L'échéance initiale (15 min) passe sans rien verrouiller…
    await avancer(2 * MINUTE);
    expect(result.current.verrouille).toBe(false);
    expect(surVerrouillage).not.toHaveBeenCalled();

    // …et la nouvelle échéance tombe bien 15 min après le geste.
    await avancer(13 * MINUTE);
    expect(result.current.verrouille).toBe(true);
  });

  it('un geste au fond de l’arbre remonte au verrou (écoute en capture)', async () => {
    const champ = document.createElement('input');
    document.body.append(champ);
    const { result } = monter({ sessionActive: false });

    await avancer(14 * MINUTE);
    await interagir('keydown', champ);
    await avancer(2 * MINUTE);

    expect(result.current.verrouille).toBe(false);
    champ.remove();
  });

  it('contrôle d’anti-vacuité : un évènement NON listé ne repousse rien', async () => {
    // `resize` n'est pas une interaction de l'auditeur. S'il repoussait le verrou,
    // le test paramétré ci-dessus passerait pour une mauvaise raison.
    const { result } = monter({ sessionActive: false });

    await avancer(14 * MINUTE);
    await interagir('resize');
    await avancer(1 * MINUTE);

    expect(result.current.verrouille).toBe(true);
  });

  it('une fois verrouillé, AUCUN geste ne déverrouille : seul le mot de passe le peut', async () => {
    // 05 §9.7 : « Ressaisie du mot de passe au déverrouillage » — et la décision
    // gravée « AUCUN mécanisme de déverrouillage affaibli en V1 ». Un `pointerdown`
    // qui rouvrirait le coffre serait exactement ce mécanisme affaibli.
    const { result } = monter({ sessionActive: false });
    await avancer(15 * MINUTE);
    expect(result.current.verrouille).toBe(true);

    await interagir('pointerdown');
    await interagir('keydown');
    await avancer(30 * MINUTE);

    expect(result.current.verrouille).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — le bouton manuel d’un geste (05 §9.7)', () => {
  it('@critique verrouille SUR-LE-CHAMP, même en pleine session active', async () => {
    // « L'auditeur qui pose sa tablette verrouille lui-même — c'est LUI le premier
    // périmètre de sécurité. » Le seuil de 60 min ne doit pas le retarder.
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: true, surVerrouillage });

    await avancer(1 * MINUTE);
    await act(async () => {
      result.current.verrouillerMaintenant();
      await Promise.resolve();
    });

    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(1);
    expect(result.current.msAvantVerrouillage()).toBe(0);
  });

  it('le coffre n’est fermé qu’UNE fois, quoi qu’il arrive ensuite', async () => {
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await avancer(15 * MINUTE);
    await act(async () => {
      result.current.verrouillerMaintenant();
      await Promise.resolve();
    });
    await avancer(60 * MINUTE);

    expect(surVerrouillage).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — le déverrouillage relance le compte', () => {
  it('@critique après `signalerDeverrouillage`, un compte PLEIN redémarre', async () => {
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await avancer(15 * MINUTE);
    expect(result.current.verrouille).toBe(true);

    await act(async () => {
      result.current.signalerDeverrouillage();
      await Promise.resolve();
    });
    expect(result.current.verrouille).toBe(false);
    expect(result.current.msAvantVerrouillage()).toBe(15 * MINUTE);

    await avancer(15 * MINUTE - 1);
    expect(result.current.verrouille).toBe(false);
    await avancer(1);
    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — l’onglet en arrière-plan', () => {
  it('@critique une tablette posée 2 h revient VERROUILLÉE, minuterie bridée ou non', async () => {
    // Le défaut que ce contrôle ferme : un onglet en arrière-plan voit ses
    // `setTimeout` ralentis par le navigateur. Sans recomparaison à l'horloge au
    // retour, une tablette oubliée deux heures reviendrait DÉVERROUILLÉE.
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: false, surVerrouillage });

    await reglerVisibilite('hidden');
    sauterHorlogeSansMinuteries(120 * MINUTE);
    expect(result.current.verrouille).toBe(false); // la minuterie n'a PAS été honorée

    await reglerVisibilite('visible');

    expect(result.current.verrouille).toBe(true);
    expect(surVerrouillage).toHaveBeenCalledTimes(1);
  });

  it('un retour avant l’échéance ne verrouille pas et ne perd pas le compte', async () => {
    const { result } = monter({ sessionActive: false });

    await reglerVisibilite('hidden');
    sauterHorlogeSansMinuteries(5 * MINUTE);
    await reglerVisibilite('visible');
    expect(result.current.verrouille).toBe(false);
    expect(result.current.msAvantVerrouillage()).toBe(10 * MINUTE);

    await avancer(10 * MINUTE - 1);
    expect(result.current.verrouille).toBe(false);
    await avancer(1);
    expect(result.current.verrouille).toBe(true);
  });

  it('un onglet qui devient caché ne verrouille jamais à lui seul', async () => {
    const { result } = monter({ sessionActive: true });
    await reglerVisibilite('hidden');
    expect(result.current.verrouille).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('verrou de la PWA — Screen Wake Lock (05 §9.7)', () => {
  it('@critique pendant une session active, l’écran est maintenu éveillé', async () => {
    const { demandes } = installerWakeLock();
    const { result } = monter({ sessionActive: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(demandes).toHaveBeenCalledWith('screen');
    expect(result.current.ecranMaintenuEveille).toBe(true);
  });

  it('HORS session, aucun Wake Lock n’est demandé (batterie d’une journée d’audit)', async () => {
    const { demandes } = installerWakeLock();
    const { result } = monter({ sessionActive: false });

    await avancer(10 * MINUTE);

    expect(demandes).not.toHaveBeenCalled();
    expect(result.current.ecranMaintenuEveille).toBe(false);
  });

  it('@critique API absente (Safari < 16.4) : les deux seuils tiennent quand même', async () => {
    // `navigator.wakeLock` n'est PAS installé ici. Le Wake Lock est un confort ;
    // les deux seuils, eux, sont la règle de sécurité — ils ne dépendent de rien.
    const surVerrouillage = vi.fn();
    const { result } = monter({ sessionActive: true, surVerrouillage });

    expect(result.current.ecranMaintenuEveille).toBe(false);

    await avancer(45 * MINUTE);
    expect(result.current.verrouille).toBe(false);
    await avancer(15 * MINUTE);
    expect(result.current.verrouille).toBe(true);
  });

  it('le navigateur refuse : aucune exception, aucun état menteur', async () => {
    const { demandes } = installerWakeLock('refuse');
    const { result } = monter({ sessionActive: true });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(demandes).toHaveBeenCalledTimes(1);
    expect(result.current.ecranMaintenuEveille).toBe(false);
  });

  it('après un refus, le retour au premier plan redemande le verrou d’écran', async () => {
    const { demandes } = installerWakeLock('refuse');
    monter({ sessionActive: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(demandes).toHaveBeenCalledTimes(1);

    await reglerVisibilite('visible');

    expect(demandes).toHaveBeenCalledTimes(2);
  });

  it('le système relâche le verrou d’écran : l’état le DIT, il ne le cache pas', async () => {
    const { sentinelles } = installerWakeLock();
    const { result } = monter({ sessionActive: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.ecranMaintenuEveille).toBe(true);

    await act(async () => {
      sentinelles[0]?.dispatchEvent(new Event('release'));
      await Promise.resolve();
    });

    expect(result.current.ecranMaintenuEveille).toBe(false);
  });

  it('la fin de session RELÂCHE le verrou d’écran', async () => {
    const { sentinelles } = installerWakeLock();
    const { result, rerender } = monter({ sessionActive: true });
    await act(async () => {
      await Promise.resolve();
    });

    rerender({ sessionActive: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sentinelles[0]?.release).toHaveBeenCalled();
    expect(result.current.ecranMaintenuEveille).toBe(false);
  });

  it('un verrou d’écran accordé APRÈS la fin de session est relâché aussitôt', async () => {
    // La course que le module ferme explicitement : la demande met un instant à
    // aboutir, la session se termine entre-temps. Sans ce relâchement, l'iPad
    // resterait allumé toute la journée pour une session qui n'existe plus — la
    // batterie qui ne tient pas jusqu'au dernier entretien.
    const { accorder, sentinelles } = installerWakeLock('differe');
    const { result, rerender } = monter({ sessionActive: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sentinelles).toHaveLength(0); // la demande est encore en vol

    rerender({ sessionActive: false });
    await act(async () => {
      accorder();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sentinelles[0]?.release).toHaveBeenCalledTimes(1);
    expect(result.current.ecranMaintenuEveille).toBe(false);
  });

  it('le démontage relâche le verrou d’écran et n’arme plus aucune minuterie', async () => {
    const { sentinelles } = installerWakeLock();
    const surVerrouillage = vi.fn();
    const { unmount } = monter({ sessionActive: true, surVerrouillage });
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    await avancer(120 * MINUTE);

    expect(sentinelles[0]?.release).toHaveBeenCalled();
    expect(surVerrouillage).not.toHaveBeenCalled();
  });
});
