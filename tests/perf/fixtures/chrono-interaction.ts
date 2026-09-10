// =============================================================================
// HARNAIS DE MESURE A28 — LE CHRONOMÈTRE « GESTE → PEINTURE ».
//
// Écrit par A28, qui ne modifie AUCUNE ligne du code mesuré (09 §5.6). Comme la
// sonde de `e2e/budget-chiffrement-l5.e2e.ts`, ce chronomètre n'enveloppe que
// des API du NAVIGATEUR : les écouteurs d'événements du document, un
// `MutationObserver`, `requestAnimationFrame`. Aucune porte d'instrumentation
// n'est ajoutée à l'application.
//
// ── CE QU'IL MESURE, ET OÙ SONT SES BORNES ─────────────────────────────────
// Le budget est « p95 interactions < 100 ms » (09 §1 « LES RÔLES », et 09 §4
// pour les listes longues de FIL-GC à la porte P-E). Une interaction commence
// quand le doigt touche le verre et finit quand l'écran a changé. Les deux
// bornes, écrites plutôt que tues :
//
//   · DÉPART — l'horodatage du PREMIER événement d'entrée du geste :
//     `pointerdown` pour un doigt, `keydown` pour un raccourci. Il est pris dans
//     un écouteur de PHASE DE CAPTURE posé sur `document`, donc AVANT tout
//     écouteur de l'application. `event.timeStamp` est utilisé quand il est
//     exploitable : c'est l'instant où le navigateur a créé l'événement, plus
//     proche du doigt que l'instant où l'écouteur s'exécute.
//   · ARRIVÉE — la première macro-tâche qui suit une trame d'animation, ce qui
//     place l'horodatage APRÈS la peinture : `requestAnimationFrame` s'exécute
//     avant que la trame soit peinte, la macro-tâche suivante après.
//
// Deux arrivées sont relevées pour chaque geste, parce qu'elles ne disent pas la
// même chose :
//   · `msPremierePeinture` — la peinture qui suit la PREMIÈRE mutation du DOM.
//     C'est la définition courante d'une latence d'interaction (celle de l'INP).
//     Sur un écran qui affiche d'abord un squelette, elle est optimiste.
//   · `msCible` — la peinture qui suit le moment où l'écran porte réellement ce
//     que l'auditeur attendait (un sélecteur, éventuellement un texte). C'est
//     celle qui compte pour un budget d'usage, et c'est elle qui est assertée.
//     Elle vaut `null` quand l'appelant n'a demandé aucune cible.
//
// ── POURQUOI LA CIBLE EST ÉVALUÉE DANS LA PAGE ─────────────────────────────
// Un `expect(locator).toBeVisible()` de Playwright ferait un aller-retour par le
// protocole CDP à chaque sondage : sa granularité est du même ordre que le
// budget qu'on mesure. Le chronomètre évalue donc la condition d'arrêt DANS la
// page, sur chaque lot de mutations, et ne rend son relevé qu'une fois le geste
// terminé. Rien ne traverse la frontière du navigateur pendant la mesure.
//
// ── ANTI-VACUITÉ ───────────────────────────────────────────────────────────
// Un chronomètre qui ne voit rien rendrait un vert sans rien mesurer. Trois
// refus, tous bruyants :
//   · aucune mutation observée dans le délai → ÉCHEC nommé, jamais un zéro ;
//   · cible demandée et jamais atteinte → ÉCHEC, jamais un repli sur la
//     première peinture ;
//   · geste dont l'événement d'entrée n'a pas été vu → ÉCHEC (le clic n'a pas
//     atteint la page, l'échantillon serait fabriqué).
//
// Traçabilité : E36 (CI exécutable), E43 (exécutabilité autopilote — budgets
// d'acceptation), E6 (hors ligne total : les gestes mesurés sont ceux du terrain).
// =============================================================================
import type { Page } from '@playwright/test';

/** Ce que le chronomètre rend pour un geste. Les durées sont en millisecondes. */
export interface MesureInteraction {
  readonly libelle: string;
  /** Départ → peinture qui suit la première mutation du DOM. */
  readonly msPremierePeinture: number;
  /** Départ → peinture qui suit l'apparition de la cible. `null` sans cible. */
  readonly msCible: number | null;
  /** Écart entre le premier événement d'entrée et le `click` qui le suit. */
  readonly msPointeurVersClic: number | null;
  /** Lots de mutations observés. Zéro est refusé avant d'arriver ici. */
  readonly lotsDeMutations: number;
}

/** La cible d'arrêt : ce que l'écran doit porter pour que le geste soit fini. */
export interface CibleInteraction {
  /** Sélecteur CSS cherché dans le document. */
  readonly selecteur: string;
  /** Sous-chaîne exigée dans le `textContent` de l'élément trouvé. */
  readonly texte?: string;
  /** Nombre minimal d'éléments correspondants (listes longues). */
  readonly aumoins?: number;
}

interface ChronoDansLaPage {
  armer: (libelle: string, cible: CibleInteraction | null, delaiMs: number) => void;
  relever: () => Promise<MesureInteraction>;
  toutes: () => MesureInteraction[];
  evenementsLents: () => { readonly nom: string; readonly duree: number }[];
}

declare global {
  var __chronoA28: ChronoDansLaPage | undefined;
}

/**
 * Installe le chronomètre avant tout script de l'application.
 *
 * `addInitScript` rejoue à CHAQUE navigation, y compris le `page.reload()` du
 * semis : le chronomètre survit donc à la mise en place de l'appareil, et son
 * relevé repart à zéro avec la page.
 */
export async function installerChrono(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface MesureMutable {
      libelle: string;
      msPremierePeinture: number;
      msCible: number | null;
      msPointeurVersClic: number | null;
      lotsDeMutations: number;
    }
    interface Cible {
      selecteur: string;
      texte?: string;
      aumoins?: number;
    }

    const toutes: MesureMutable[] = [];
    const evenementsLents: { nom: string; duree: number }[] = [];

    let libelle: string | null = null;
    let cible: Cible | null = null;
    let depart: number | null = null;
    let instantClic: number | null = null;
    let lots = 0;
    let premierePeinture: number | null = null;
    let observateur: MutationObserver | null = null;
    let echeance = 0;
    let rendre: ((mesure: MesureMutable) => void) | null = null;
    let refuser: ((erreur: Error) => void) | null = null;
    let promesse: Promise<MesureMutable> | null = null;

    /** L'horodatage APRÈS la peinture de la trame courante. */
    const apresPeinture = (suite: (instant: number) => void): void => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          suite(performance.now());
        }, 0);
      });
    };

    const cibleAtteinte = (): boolean => {
      if (cible === null) return false;
      const noeuds = document.querySelectorAll(cible.selecteur);
      const minimum = cible.aumoins ?? 1;
      if (noeuds.length < minimum) return false;
      if (cible.texte === undefined) return true;
      for (const noeud of Array.from(noeuds)) {
        if (noeud.textContent.includes(cible.texte)) return true;
      }
      return false;
    };

    const nettoyer = (): void => {
      observateur?.disconnect();
      observateur = null;
      libelle = null;
      cible = null;
      depart = null;
      instantClic = null;
      premierePeinture = null;
      lots = 0;
      rendre = null;
      refuser = null;
    };

    const echouer = (raison: string): void => {
      const rejet = refuser;
      nettoyer();
      rejet?.(new Error(raison));
    };

    const terminer = (): void => {
      apresPeinture((instant) => {
        if (depart === null || libelle === null || rendre === null) return;
        const mesure: MesureMutable = {
          libelle,
          msPremierePeinture: premierePeinture ?? instant - depart,
          msCible: cible === null ? null : instant - depart,
          msPointeurVersClic: instantClic === null ? null : instantClic - depart,
          lotsDeMutations: lots,
        };
        toutes.push(mesure);
        const suite = rendre;
        nettoyer();
        suite(mesure);
      });
    };

    const surMutations = (): void => {
      if (depart === null) return;
      lots += 1;
      if (premierePeinture === null) {
        const depuis = depart;
        apresPeinture((instant) => {
          premierePeinture ??= instant - depuis;
        });
      }
      if (cible === null || cibleAtteinte()) terminer();
    };

    const noterDepart = (evenement: Event): void => {
      if (libelle === null || depart !== null) return;
      const horodatage = evenement.timeStamp;
      depart = horodatage > 0 && horodatage <= performance.now() ? horodatage : performance.now();
    };

    document.addEventListener('pointerdown', noterDepart, { capture: true });
    document.addEventListener('keydown', noterDepart, { capture: true });
    document.addEventListener(
      'click',
      () => {
        if (libelle !== null && depart !== null && instantClic === null) {
          instantClic = performance.now();
        }
      },
      { capture: true },
    );

    // Corroboration par la mesure du navigateur lui-même. Le seuil minimal de
    // `durationThreshold` est de 16 ms : les événements plus courts ne sont pas
    // rapportés, et leur ABSENCE est déjà un fait utile.
    try {
      new PerformanceObserver((liste) => {
        for (const entree of liste.getEntries()) {
          evenementsLents.push({ nom: entree.name, duree: entree.duration });
        }
        // `durationThreshold` n'est pas encore dans les typages du DOM livrés
        // avec TypeScript 5.9 ; l'option existe bel et bien dans Chromium (Event
        // Timing, niveau 1). Le `satisfies` serait un mensonge, le cast est la
        // vérité : on passe une option que le type ne connaît pas encore.
      }).observe({
        type: 'event',
        durationThreshold: 16,
        buffered: true,
      } as PerformanceObserverInit);
    } catch {
      /* Event Timing indisponible : le chronomètre manuel reste la mesure. */
    }

    globalThis.__chronoA28 = {
      armer(nom: string, quoi: Cible | null, delaiMs: number): void {
        nettoyer();
        libelle = nom;
        cible = quoi;
        // ANTI-VACUITÉ LA PLUS IMPORTANTE : une cible déjà satisfaite AVANT le
        // geste rendrait une durée quasi nulle sans que rien n'ait été mesuré.
        // Le refus est bruyant, et il l'est AVANT le clic.
        if (quoi !== null && cibleAtteinte()) {
          const selecteur = quoi.selecteur;
          nettoyer();
          throw new Error(
            `« ${nom} » : la cible « ${selecteur} » est DÉJÀ satisfaite avant le geste — ` +
              'la mesure serait un zéro fabriqué.',
          );
        }
        echeance = performance.now() + delaiMs;
        promesse = new Promise<MesureMutable>((resoudre, rejette) => {
          rendre = resoudre;
          refuser = rejette;
        });
        observateur = new MutationObserver(surMutations);
        observateur.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const veiller = (): void => {
          if (rendre === null) return;
          if (performance.now() > echeance) {
            echouer(
              depart === null
                ? `« ${nom} » : aucun événement d’entrée n’a atteint la page.`
                : lots === 0
                  ? `« ${nom} » : aucune mutation du DOM en ${String(delaiMs)} ms — ` +
                    'le geste n’a rien peint, la mesure serait vide.'
                  : `« ${nom} » : la cible « ${quoi?.selecteur ?? ''} » n’est jamais ` +
                    `apparue en ${String(delaiMs)} ms (${String(lots)} lot(s) de mutations).`,
            );
            return;
          }
          setTimeout(veiller, 50);
        };
        setTimeout(veiller, 50);
      },
      async relever(): Promise<MesureInteraction> {
        if (promesse === null) throw new Error('le chronomètre A28 n’a pas été armé');
        return promesse;
      },
      toutes(): MesureInteraction[] {
        return toutes.map((mesure) => ({ ...mesure }));
      },
      evenementsLents(): { nom: string; duree: number }[] {
        return evenementsLents.map((entree) => ({ ...entree }));
      },
    };
  });
}

/** Arme le chronomètre pour le geste suivant. */
export async function armer(
  page: Page,
  libelle: string,
  cible: CibleInteraction | null,
  delaiMs = 15_000,
): Promise<void> {
  await page.evaluate(
    ([nom, quoi, delai]) => {
      const chrono = globalThis.__chronoA28;
      if (chrono === undefined) throw new Error('le chronomètre A28 n’est pas installé');
      chrono.armer(nom, quoi, delai);
    },
    [libelle, cible, delaiMs] as const,
  );
}

/** Attend la fin du geste armé et rend sa mesure. */
export async function relever(page: Page): Promise<MesureInteraction> {
  return page.evaluate(async () => {
    const chrono = globalThis.__chronoA28;
    if (chrono === undefined) throw new Error('le chronomètre A28 n’est pas installé');
    return chrono.relever();
  });
}

/** Les événements d'entrée que le NAVIGATEUR lui-même a jugés ≥ 16 ms. */
export async function evenementsLents(
  page: Page,
): Promise<{ readonly nom: string; readonly duree: number }[]> {
  return page.evaluate(() => {
    const chrono = globalThis.__chronoA28;
    if (chrono === undefined) throw new Error('le chronomètre A28 n’est pas installé');
    return chrono.evenementsLents();
  });
}
