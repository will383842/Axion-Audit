// =============================================================================
// LE VERROU DE LA PWA — 05 §9.7, règle V2.10 « en deux temps »
//
// ── LA RÈGLE, MOT POUR MOT ──────────────────────────────────────────────────
// « 15 min d'inactivité HORS session de collecte ; **pendant une session
// `en_cours` sur l'appareil, le délai est porté à 60 min** — l'inactivité se
// mesure sur TOUTE interaction (tactile, clavier, scroll), et le **Screen Wake
// Lock** maintient l'écran éveillé tant que la session est active : un
// interlocuteur qui parle 20 minutes, une observation d'atelier ou une
// démonstration d'ERP ne déclenchent JAMAIS une ressaisie de mot de passe en
// pleine collecte. »
//
// C'est une règle ERGONOMIQUE avant d'être une règle de sécurité, et les deux
// tirent dans le même sens : un verrou qui se déclenche en entretien est un verrou
// que l'auditeur contournera — en désactivant la veille, en notant son mot de
// passe, ou en cessant d'utiliser l'outil.
//
// ── CE QUE CE HOOK NE FAIT PAS ──────────────────────────────────────────────
// Il ne déchiffre rien et ne connaît pas le coffre. Il dit QUAND verrouiller ; la
// fermeture effective (DEK lâchée, contexte local retiré) est
// `local/contexte.ts`, appelée par la coquille. Un hook React qui tiendrait la
// clé la ferait vivre aussi longtemps que le composant, ce qui est exactement
// l'inverse du but.
//
// ── LE BOUTON MANUEL ────────────────────────────────────────────────────────
// 05 §9.7 : « Bouton de verrouillage manuel d'un geste sur toutes les vues terrain
// (l'auditeur qui pose sa tablette verrouille lui-même — c'est LUI le premier
// périmètre de sécurité). » D'où `verrouillerMaintenant`, exposé à la coquille.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { instantLocalMs } from '../local/horloge.js';

/** 05 §9.7 : 15 minutes hors session, 60 minutes pendant une session `en_cours`. */
export const DELAI_INACTIVITE_MS = {
  horsSession: 15 * 60 * 1000,
  sessionActive: 60 * 60 * 1000,
} as const;

/**
 * Les évènements qui comptent comme une interaction.
 *
 * `scroll` et `wheel` sont là parce que 05 §9.7 dit « TOUTE interaction (tactile,
 * clavier, scroll) » : relire une longue consigne de question sans rien toucher
 * d'autre EST une activité. Tous sont écoutés en capture et en passif — un
 * écouteur d'inactivité ne doit jamais retarder un défilement au doigt.
 */
const EVENEMENTS_ACTIVITE = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

export interface OptionsVerrou {
  /**
   * Y a-t-il une session `en_cours` SUR CET APPAREIL ? (`depotSessions.sessionEnCours`)
   * C'est ce booléen, et lui seul, qui fait passer le délai de 15 à 60 minutes.
   */
  readonly sessionActive?: boolean;
  /** Appelé au moment exact du verrouillage — la coquille y ferme le coffre. */
  readonly surVerrouillage?: () => void;
}

export interface EtatVerrou {
  readonly verrouille: boolean;
  /** Le délai en vigueur, en millisecondes — 15 ou 60 minutes. */
  readonly delaiCourantMs: number;
  /** L'écran est-il maintenu éveillé ? `false` si l'API manque (Safari < 16.4). */
  readonly ecranMaintenuEveille: boolean;
  /** Millisecondes restantes avant verrouillage. Fonction, et non état : voir plus bas. */
  msAvantVerrouillage: () => number;
  /** Le bouton d'un geste du 05 §9.7. */
  verrouillerMaintenant: () => void;
  /** À appeler après un déverrouillage réussi pour relancer le compte. */
  signalerDeverrouillage: () => void;
}

/**
 * Le verrou.
 *
 * **`msAvantVerrouillage` est une FONCTION, pas un état.** Un compte à rebours en
 * état React re-rendrait l'arbre à chaque seconde et à chaque geste de
 * l'auditeur — sur un écran de saisie tactile, c'est la garantie d'une frappe qui
 * saute. L'échéance vit dans une `ref` ; seul le passage verrouillé/déverrouillé
 * est un état.
 */
export function useVerrou(options: OptionsVerrou = {}): EtatVerrou {
  const { sessionActive = false, surVerrouillage } = options;

  const [verrouille, setVerrouille] = useState(false);
  const [ecranMaintenuEveille, setEcranMaintenuEveille] = useState(false);

  const delaiCourantMs = sessionActive
    ? DELAI_INACTIVITE_MS.sessionActive
    : DELAI_INACTIVITE_MS.horsSession;

  const echeanceRef = useRef<number>(instantLocalMs() + delaiCourantMs);
  const minuterieRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surVerrouillageRef = useRef(surVerrouillage);
  surVerrouillageRef.current = surVerrouillage;

  const verrouiller = useCallback(() => {
    setVerrouille((deja) => {
      if (!deja) surVerrouillageRef.current?.();
      return true;
    });
  }, []);

  const armer = useCallback(() => {
    if (minuterieRef.current !== null) clearTimeout(minuterieRef.current);
    const restant = Math.max(0, echeanceRef.current - instantLocalMs());
    minuterieRef.current = setTimeout(verrouiller, restant);
  }, [verrouiller]);

  const repousser = useCallback(() => {
    echeanceRef.current = instantLocalMs() + delaiCourantMs;
    armer();
  }, [armer, delaiCourantMs]);

  // ── Écoute de l'activité ──────────────────────────────────────────────────
  useEffect(() => {
    if (verrouille) return undefined;
    repousser();
    const options = { capture: true, passive: true } as const;
    for (const nom of EVENEMENTS_ACTIVITE) {
      window.addEventListener(nom, repousser, options);
    }
    return () => {
      for (const nom of EVENEMENTS_ACTIVITE) {
        window.removeEventListener(nom, repousser, options);
      }
      if (minuterieRef.current !== null) clearTimeout(minuterieRef.current);
    };
  }, [repousser, verrouille]);

  // ── Retour au premier plan ────────────────────────────────────────────────
  // Un onglet en arrière-plan voit ses minuteries ralenties par le navigateur :
  // sans ce contrôle, une tablette posée pendant deux heures pourrait revenir
  // DÉVERROUILLÉE parce que le `setTimeout` n'a pas été honoré à l'heure. On
  // recompare donc à l'horloge, jamais à la minuterie.
  useEffect(() => {
    const auRetour = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (instantLocalMs() >= echeanceRef.current) verrouiller();
      else armer();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [armer, verrouiller]);

  // ── Screen Wake Lock (05 §9.7) ────────────────────────────────────────────
  // Demandé UNIQUEMENT pendant une session active : maintenir un iPad éveillé en
  // permanence viderait la batterie d'une journée d'audit pour rien. Le verrou
  // est relâché par le système à chaque passage en arrière-plan, d'où la
  // redemande au retour — ce n'est pas une précaution, c'est le fonctionnement
  // normal de l'API.
  useEffect(() => {
    if (!sessionActive || verrouille) return undefined;
    const api = navigator.wakeLock as WakeLock | undefined;
    if (api === undefined) return undefined;

    let verrouEcran: WakeLockSentinel | null = null;
    let abandonne = false;

    const demander = async (): Promise<void> => {
      try {
        const obtenu = await api.request('screen');
        if (abandonne) {
          await obtenu.release();
          return;
        }
        verrouEcran = obtenu;
        setEcranMaintenuEveille(true);
        obtenu.addEventListener('release', () => {
          setEcranMaintenuEveille(false);
        });
      } catch {
        // Refus du navigateur (batterie faible, onglet caché) : l'écran s'éteindra,
        // et c'est tout. Aucune donnée n'est en jeu — inutile d'alerter l'auditeur.
        setEcranMaintenuEveille(false);
      }
    };

    void demander();
    const auRetour = (): void => {
      if (document.visibilityState === 'visible' && verrouEcran === null) void demander();
    };
    document.addEventListener('visibilitychange', auRetour);

    return () => {
      abandonne = true;
      document.removeEventListener('visibilitychange', auRetour);
      void verrouEcran?.release();
      setEcranMaintenuEveille(false);
    };
  }, [sessionActive, verrouille]);

  const verrouillerMaintenant = useCallback(() => {
    echeanceRef.current = instantLocalMs();
    verrouiller();
  }, [verrouiller]);

  const signalerDeverrouillage = useCallback(() => {
    setVerrouille(false);
    echeanceRef.current = instantLocalMs() + delaiCourantMs;
  }, [delaiCourantMs]);

  const msAvantVerrouillage = useCallback(
    () => Math.max(0, echeanceRef.current - instantLocalMs()),
    [],
  );

  return {
    verrouille,
    delaiCourantMs,
    ecranMaintenuEveille,
    msAvantVerrouillage,
    verrouillerMaintenant,
    signalerDeverrouillage,
  };
}
