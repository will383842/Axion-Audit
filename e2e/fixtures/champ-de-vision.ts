// =============================================================================
// FIXTURE E2E — « CE NŒUD EST-IL DANS LE CHAMP DE VISION ? », L'INSTRUMENT QUI
// MANQUAIT AU DÉPÔT.
//
// Écrit par A26, testeur E2E offline, qui n'a produit aucune ligne de
// `packages/ui/src/composants/EchelleAncree.tsx` ni de `apps/field/src/` — 09
// §5.6 : le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé. Aucun fichier de production n'est touché par cet incrément.
//
// ── LE DÉFAUT DE MÉTHODE QUE CE FICHIER RÉPARE ──────────────────────────────
// Recette A54 du 2026-09-07 (rejeu), §2.2 : sur iPad PAYSAGE, dans l'écran
// d'entretien terrain, l'ancre du cran 5 commence 285 px SOUS le bord d'une
// fenêtre de 810 px, et quatre ancres sur cinq exigent de faire défiler. La
// garde `@critique` « les ancres se LISENT avant le premier tap » était VERTE,
// et elle l'était SINCÈREMENT.
//
// Pourquoi : `toBeVisible()` de Playwright vérifie qu'un nœud n'est ni
// `display:none`, ni `visibility:hidden`, ni de taille nulle. **Il ne regarde
// pas la fenêtre.** Un nœud à 285 px sous le bord lui est « visible ».
//
// A54 le formule mieux que je ne le ferais : « c'est le même angle mort que
// `jsdom`, remonté d'un cran — on est passé de "le DOM ne dit pas si c'est
// peint" à "le navigateur ne dit pas si c'est regardable" ». L'angle mort de
// `jsdom` est documenté dans ce dépôt ; celui de Playwright ne l'était nulle
// part. Il l'est ici, et il est désormais mesurable.
//
// ── CE QUE CET INSTRUMENT MESURE ────────────────────────────────────────────
// ① `boundingBox()` d'un nœud CONTRE la fenêtre réelle de la page. Trois états
//    distincts — entièrement dans le champ / partiellement coupé / entièrement
//    hors champ — et, dans tous les cas, le DÉBORDEMENT EN PIXELS sur chacun
//    des quatre bords. Un échec doit dire DE COMBIEN il rate : « l'ancre 5
//    déborde de 348 px sous le bord » se corrige ; « l'ancre 5 n'est pas
//    visible » se discute.
// ② LE RECOUVREMENT PAR UN ÉLÉMENT COLLANT. Un nœud peut être entier dans la
//    fenêtre et néanmoins caché sous une barre `position: sticky` — l'en-tête
//    de la coquille en haut, la barre d'actions « Suivant » en bas. Aucune
//    géométrie ne le dit : on le mesure par `elementFromPoint`, qui répond à la
//    seule question qui vaille — « qu'y a-t-il à cet endroit de la dalle ? ».
// ③ LA CO-VISIBILITÉ DE DEUX NŒUDS, en BALAYANT le défilement. Le critère
//    arbitré par A01 le 2026-09-08 ne demande pas que tout tienne à
//    l'ouverture : il demande qu'il EXISTE une position de défilement montrant
//    les deux nœuds entiers en même temps. Cette question-là ne se répond pas
//    par l'arithmétique — les éléments collants se déplacent avec le
//    défilement et rognent une hauteur utile qui n'est pas celle de la fenêtre.
//    On défile donc pour de bon, et on regarde.
//
// ── CE QU'IL NE MESURE PAS, ET QU'IL NE FAUT PAS LUI FAIRE DIRE ─────────────
// ① Il ne dit pas qu'un nœud est LU : contraste, taille de texte et ordre de
//    lecture restent l'affaire d'`axe-core` et de la recette humaine. Cet
//    instrument COMPLÈTE `toBeVisible()`, il ne le remplace pas — les gardes
//    appellent toujours les deux.
// ② Il mesure la fenêtre ÉMULÉE de Chromium. Ce n'est pas une dalle d'iPad :
//    ni la barre d'URL de Safari, ni le clavier logiciel, ni les encoches ne
//    sont modélisés — et tous RÉDUISENT la hauteur réelle. La mesure est donc
//    OPTIMISTE : ce qui déborde ici déborde à coup sûr sur l'appareil ; ce qui
//    tient ici peut encore ne pas tenir sur l'appareil. Le mode avion réel et
//    la mise en page réelle sur iPad se rejouent à la main aux portes P-C et
//    P-E (11 §7, checklist 07 §15, A27 et A54).
// ③ Il ne juge pas la TRANSPARENCE d'un recouvrement : une barre translucide
//    est comptée comme un recouvrement. C'est le sens strict, et c'est le bon
//    par défaut — un texte lu à travers une barre n'est pas un texte lu.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total,
// PC ET tablette), E27 (design moderne, charte, WCAG AA).
// =============================================================================
import { expect, type ElementHandle, type Locator, type Page } from '@playwright/test';

/**
 * La tolérance sous laquelle un débordement n'en est pas un.
 *
 * La mise en page produit des positions fractionnaires (bordures d'un pixel,
 * hauteurs de ligne, arrondis de rendu) : sans cette marge, un nœud qui affleure
 * le bord au demi-pixel près rendrait la suite rouge par intermittence, pour une
 * raison qui n'a rien à voir avec ce qu'on mesure. Un pixel, pas plus : le
 * défaut N1 se compte en centaines.
 */
export const TOLERANCE_PX = 1;

/**
 * Le pas du balayage de défilement, en pixels.
 *
 * Assez fin pour ne pas manquer une fenêtre de tir étroite, assez grossier pour
 * que la centaine d'étapes reste instantanée — tout se passe dans le navigateur,
 * en une seule évaluation, sans aller-retour par étape.
 */
const PAS_DE_BALAYAGE_PX = 8;

/** Ce que devient un nœud confronté aux bords de la fenêtre. */
export type EtatDansLeChamp =
  /** Les quatre bords du nœud sont dans la fenêtre : le seul état lisible sans geste. */
  | 'entierement_visible'
  /** Une partie seulement est dans la fenêtre : il faut défiler pour lire le reste. */
  | 'partiellement_coupe'
  /** Aucun pixel du nœud n'est dans la fenêtre. C'est le cas de l'ancre 5 en paysage. */
  | 'hors_champ';

/** La boîte d'un nœud, en pixels, relative à la fenêtre. */
export interface BoiteMesuree {
  readonly gauche: number;
  readonly haut: number;
  readonly droite: number;
  readonly bas: number;
  readonly largeur: number;
  readonly hauteur: number;
}

/**
 * De combien le nœud dépasse chaque bord, en pixels.
 *
 * Toujours ≥ 0 : `0` signifie « ne dépasse pas ce bord ». Un nombre positif est
 * la distance à récupérer pour ramener ce bord dans la fenêtre — c'est le
 * chiffre qu'un correctif de mise en page doit viser.
 */
export interface Debordement {
  readonly haut: number;
  readonly bas: number;
  readonly gauche: number;
  readonly droite: number;
}

/** Le verdict complet sur un nœud, chiffres compris. */
export interface MesureChampDeVision {
  /** Le nom que l'échec affichera. En français, comme tout ce que lit un humain ici. */
  readonly nom: string;
  readonly fenetre: { readonly largeur: number; readonly hauteur: number };
  readonly boite: BoiteMesuree;
  readonly debordement: Debordement;
  readonly etat: EtatDansLeChamp;
  /** Part de la SURFACE du nœud réellement dans la fenêtre, de 0 à 1. */
  readonly partVisible: number;
  /**
   * Les éléments collants qui recouvrent ce nœud, nommés.
   *
   * Vide = rien ne le cache. Non vide = le nœud est peut-être dans la fenêtre,
   * mais l'auditeur voit une barre à sa place.
   */
  readonly recouvertPar: readonly string[];
}

/**
 * La taille de la fenêtre RÉELLE, celle dans laquelle les rectangles sont exprimés.
 *
 * ── UN PIÈGE MESURÉ LE 2026-09-08, ET LA RAISON DE NE PAS LIRE `viewportSize()` ──
 * La première version de ce fichier comparait `boundingBox()` à
 * `page.viewportSize()`. Les deux ne sont PAS dans le même espace dès que
 * l'émulation mobile est active. Mesuré sur `devices['iPad (gen 7)']`,
 * PORTRAIT : `viewportSize()` rend 810 × 1080 — la taille DÉCLARÉE — tandis que
 * `window.innerWidth/innerHeight` rend 835 × 1113, parce que l'émulation
 * applique une échelle de mise en page. Or `boundingBox()` s'exprime dans le
 * même repère que `getBoundingClientRect()`, donc dans le SECOND.
 *
 * Comparer l'un à l'autre inventait un débordement de 33 px que l'auditeur ne
 * voit jamais. Un instrument dont la raison d'être est de dire « de combien ça
 * rate » n'a pas le droit de se tromper de règle : on lit donc la fenêtre DANS
 * la page. En paysage les deux coïncident — c'est précisément ce qui rend ce
 * défaut coûteux : il ne se manifeste que sur une orientation.
 *
 * `viewportSize()` reste interrogé, mais pour une AUTRE question : une page sans
 * fenêtre déclarée suit celle du système, et aucune mesure n'y est reproductible.
 */
async function fenetreDe(page: Page): Promise<{ largeur: number; hauteur: number }> {
  if (page.viewportSize() === null) {
    // `launchPersistentContext` sans `viewport` rend `null` : mieux vaut un refus
    // net qu'une garde qui se tait sur une mesure dépendante de la machine.
    throw new Error(
      'Mesure du champ de vision impossible : cette page n’a pas de fenêtre de taille connue ' +
        '(`viewportSize()` rend `null`). Ouvrez le contexte avec un `viewport` explicite — ' +
        'sinon la mesure dépendrait de l’écran de la machine, pas du code.',
    );
  }
  return page.evaluate(() => ({ largeur: window.innerWidth, hauteur: window.innerHeight }));
}

/** Une boîte brute, telle que le navigateur la rend. */
interface RectBrut {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
}

/**
 * Juge une boîte contre une fenêtre. Fonction PURE : c'est elle qui définit les
 * trois états, et elle sert aussi bien à la mesure isolée qu'à chaque étape du
 * balayage — une seule règle, jamais deux qui dériveraient.
 */
function evaluerBoite(
  nom: string,
  rect: RectBrut,
  fenetre: { largeur: number; hauteur: number },
  recouvertPar: readonly string[],
): MesureChampDeVision {
  const boite: BoiteMesuree = {
    gauche: rect.x,
    haut: rect.y,
    droite: rect.x + rect.largeur,
    bas: rect.y + rect.hauteur,
    largeur: rect.largeur,
    hauteur: rect.hauteur,
  };

  const depasse = (valeur: number): number => (valeur > TOLERANCE_PX ? valeur : 0);
  const debordement: Debordement = {
    haut: depasse(-boite.haut),
    bas: depasse(boite.bas - fenetre.hauteur),
    gauche: depasse(-boite.gauche),
    droite: depasse(boite.droite - fenetre.largeur),
  };

  // La surface d'intersection distingue « coupé » de « hors champ » sans
  // dépendre de l'ordre des bords : un nœud peut sortir par deux côtés à la fois.
  const largeurVue = Math.max(
    0,
    Math.min(boite.droite, fenetre.largeur) - Math.max(boite.gauche, 0),
  );
  const hauteurVue = Math.max(0, Math.min(boite.bas, fenetre.hauteur) - Math.max(boite.haut, 0));
  const surface = boite.largeur * boite.hauteur;
  const partVisible = surface > 0 ? (largeurVue * hauteurVue) / surface : 0;

  const deborde = debordement.haut + debordement.bas + debordement.gauche + debordement.droite > 0;
  const etat: EtatDansLeChamp =
    largeurVue <= 0 || hauteurVue <= 0
      ? 'hors_champ'
      : deborde
        ? 'partiellement_coupe'
        : 'entierement_visible';

  return { nom, fenetre, boite, debordement, etat, partVisible, recouvertPar };
}

/** Ce qu'un nœud rend à chaque étape : sa boîte, et ce qui la recouvre. */
interface ReleveBrut {
  readonly rect: RectBrut;
  readonly recouvertPar: string[];
}

/** Une position de défilement, et le relevé des deux nœuds à cette position. */
interface EtapeBrute {
  readonly defilement: number;
  readonly premier: ReleveBrut;
  readonly second: ReleveBrut;
}

/** Tout ce que le balayage rapporte du navigateur. Aucun verdict, que des faits. */
interface ResultatBalayage {
  readonly fenetre: { largeur: number; hauteur: number };
  readonly conteneur: string;
  readonly defilementInitial: number;
  readonly amplitude: { minimum: number; maximum: number; pas: number };
  readonly initiale: EtapeBrute;
  readonly etapes: EtapeBrute[];
}

/**
 * Le code qui s'exécute DANS LE NAVIGATEUR pour balayer le défilement.
 *
 * Il est écrit d'un seul tenant, et c'est délibéré : découpé en fonctions
 * importées, il ne serait plus sérialisable par `page.evaluate`. Ce qu'il rend
 * est de la DONNÉE BRUTE — des rectangles et des noms d'éléments. Aucun verdict
 * n'est prononcé ici : les trois états et les débordements se calculent côté
 * Node, par `evaluerBoite`, pour que la règle vive à un seul endroit.
 */
const BALAYER_DANS_LE_NAVIGATEUR = ([premier, second, pas]: [
  HTMLElement | SVGElement,
  HTMLElement | SVGElement,
  number,
]): ResultatBalayage => {
  /** Nomme un élément de façon qu'un humain le retrouve dans les sources. */
  const nommer = (element: Element): string => {
    const classes = element.className;
    const suffixe =
      typeof classes === 'string' && classes.trim() !== ''
        ? `.${classes.trim().split(/\s+/).join('.')}`
        : '';
    return `${element.tagName.toLowerCase()}${suffixe}`;
  };

  /** Le conteneur qui défile réellement autour d'un nœud. */
  const conteneurDefilant = (depart: Element): Element => {
    let noeud: Element | null = depart.parentElement;
    while (noeud !== null) {
      const style = getComputedStyle(noeud);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        noeud.scrollHeight > noeud.clientHeight + 1
      ) {
        return noeud;
      }
      noeud = noeud.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
  };

  /**
   * Les éléments collants qui RECOUVRENT un nœud, à cet instant.
   *
   * On interroge la dalle, pas la géométrie : `elementFromPoint` rend ce que
   * l'œil rencontrerait. Cinq points suffisent — les quatre coins rentrés d'un
   * pixel et le centre — parce qu'une barre collante coupe toujours un nœud par
   * un bord entier, jamais par un trou au milieu.
   */
  const recouvrements = (cible: Element): string[] => {
    const rect = cible.getBoundingClientRect();
    const marge = 2;
    const points: [number, number][] = [
      [rect.left + marge, rect.top + marge],
      [rect.right - marge, rect.top + marge],
      [rect.left + marge, rect.bottom - marge],
      [rect.right - marge, rect.bottom - marge],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
    ];
    const trouves = new Set<string>();
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const dessus = document.elementFromPoint(x, y);
      if (dessus === null) continue;
      if (dessus === cible || cible.contains(dessus) || dessus.contains(cible)) continue;
      // On remonte jusqu'à la raison du recouvrement : c'est l'ancêtre collant
      // ou fixe qui a le pouvoir de passer par-dessus, pas le texte qu'il porte.
      let noeud: Element | null = dessus;
      while (noeud !== null) {
        const position = getComputedStyle(noeud).position;
        if (position === 'sticky' || position === 'fixed') {
          trouves.add(`${nommer(noeud)} (position: ${position})`);
          break;
        }
        noeud = noeud.parentElement;
      }
      if (noeud === null) trouves.add(`${nommer(dessus)} (élément non collant)`);
    }
    return [...trouves];
  };

  const mesurer = (cible: Element): ReleveBrut => {
    const rect = cible.getBoundingClientRect();
    return {
      rect: { x: rect.x, y: rect.y, largeur: rect.width, hauteur: rect.height },
      recouvertPar: recouvrements(cible),
    };
  };

  const conteneur = conteneurDefilant(premier);
  const defilementInitial = conteneur.scrollTop;
  const maximum = Math.max(0, conteneur.scrollHeight - conteneur.clientHeight);

  const etapes: EtapeBrute[] = [];

  // L'état SANS AUCUN GESTE d'abord : c'est ce que voit l'auditeur qui arrive.
  const initiale: EtapeBrute = {
    defilement: defilementInitial,
    premier: mesurer(premier),
    second: mesurer(second),
  };

  for (let y = 0; y <= maximum + pas; y += pas) {
    conteneur.scrollTop = Math.min(y, maximum);
    etapes.push({
      defilement: conteneur.scrollTop,
      premier: mesurer(premier),
      second: mesurer(second),
    });
    if (conteneur.scrollTop >= maximum) break;
  }

  // On repose l'écran là où on l'a trouvé : une garde qui déplace la page
  // fausserait toute assertion écrite après elle.
  conteneur.scrollTop = defilementInitial;

  return {
    fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
    conteneur: nommer(conteneur),
    defilementInitial,
    amplitude: { minimum: 0, maximum, pas },
    initiale,
    etapes,
  };
};

/**
 * Mesure un nœud contre la fenêtre, À LA POSITION DE DÉFILEMENT COURANTE.
 *
 * Le nœud doit déjà satisfaire `toBeVisible()` — `boundingBox()` l'attend. Les
 * deux contrôles se cumulent donc naturellement : « peint » PUIS « regardable ».
 */
export async function mesurerChampDeVision(
  page: Page,
  cible: Locator,
  nom: string,
): Promise<MesureChampDeVision> {
  const fenetre = await fenetreDe(page);
  const brute = await cible.boundingBox();
  if (brute === null) {
    throw new Error(
      `Mesure du champ de vision impossible pour « ${nom} » : le nœud n’a aucune boîte. ` +
        'Trois causes, dans l’ordre où elles se rencontrent : (a) le nœud est absent du rendu ; ' +
        '(b) il est de taille nulle ; (c) il porte `display: contents`, et alors il n’a JAMAIS ' +
        'de boîte — seuls ses enfants en ont une. Ce dernier cas a été mesuré le 2026-09-08 sur ' +
        '`.axn-choix__paire`, qui n’existe que pour la clé de rendu React : viser un nœud qui ' +
        'PEINT quelque chose, ici le `dd` de l’ancre.',
    );
  }
  const recouvertPar = await cible.evaluate((element: Element) => {
    const rect = element.getBoundingClientRect();
    const marge = 2;
    const points: [number, number][] = [
      [rect.left + marge, rect.top + marge],
      [rect.right - marge, rect.top + marge],
      [rect.left + marge, rect.bottom - marge],
      [rect.right - marge, rect.bottom - marge],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
    ];
    const trouves = new Set<string>();
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const dessus = document.elementFromPoint(x, y);
      if (dessus === null) continue;
      if (dessus === element || element.contains(dessus) || dessus.contains(element)) continue;
      let noeud: Element | null = dessus;
      while (noeud !== null) {
        const position = getComputedStyle(noeud).position;
        if (position === 'sticky' || position === 'fixed') {
          const classes = noeud.className;
          const suffixe =
            typeof classes === 'string' && classes.trim() !== ''
              ? `.${classes.trim().split(/\s+/).join('.')}`
              : '';
          trouves.add(`${noeud.tagName.toLowerCase()}${suffixe} (position: ${position})`);
          break;
        }
        noeud = noeud.parentElement;
      }
    }
    return [...trouves];
  });

  return evaluerBoite(
    nom,
    { x: brute.x, y: brute.y, largeur: brute.width, hauteur: brute.height },
    fenetre,
    recouvertPar,
  );
}

/** Arrondit à l'entier pour l'affichage : personne ne corrige un demi-pixel. */
function px(valeur: number): string {
  return `${String(Math.round(valeur))} px`;
}

/**
 * La phrase qu'un échec affiche.
 *
 * Elle nomme le nœud, donne sa position, la taille de la fenêtre, le
 * débordement bord par bord et ce qui le recouvre. C'est le contraire d'un
 * « expected visible » : elle se recopie telle quelle dans un rapport de porte.
 */
export function decrireMesure(mesure: MesureChampDeVision): string {
  const { nom, boite, fenetre, debordement, etat, partVisible, recouvertPar } = mesure;
  const bords = (['haut', 'bas', 'gauche', 'droite'] as const)
    .filter((bord) => debordement[bord] > 0)
    .map((bord) => `${bord} de ${px(debordement[bord])}`);
  const depassements =
    bords.length === 0 ? 'aucun débordement' : `déborde par le ${bords.join(', par le ')}`;
  const cache =
    recouvertPar.length === 0 ? 'rien ne le recouvre' : `recouvert par ${recouvertPar.join(', ')}`;
  return (
    `« ${nom} » — état : ${etat} · ` +
    `haut ${px(boite.haut)}, bas ${px(boite.bas)}, ` +
    `gauche ${px(boite.gauche)}, droite ${px(boite.droite)} · ` +
    `fenêtre ${px(fenetre.largeur)} × ${px(fenetre.hauteur)} · ` +
    `${depassements} · ` +
    `${String(Math.round(partVisible * 100))} % de sa surface est dans le champ de vision · ` +
    cache
  );
}

/**
 * Exige qu'un nœud soit ENTIÈREMENT dans le champ de vision, sans aucun geste.
 *
 * L'assertion porte sur l'ÉTAT, et le message porte les chiffres : `toBe`
 * affiche « attendu entierement_visible, reçu hors_champ » ET la description
 * complète. Un correcteur sait immédiatement combien de pixels récupérer.
 */
export async function exigerDansLeChampDeVision(
  page: Page,
  cible: Locator,
  nom: string,
): Promise<MesureChampDeVision> {
  const mesure = await mesurerChampDeVision(page, cible, nom);
  expect(
    mesure.etat,
    `${nom} doit être lisible SANS défiler. Rappel : toBeVisible() ne regarde pas la ` +
      `fenêtre (A54, 2026-09-07, §2.2). Mesure : ${decrireMesure(mesure)}`,
  ).toBe('entierement_visible');
  return mesure;
}

/** Une position de défilement, et ce qu'on y voit des deux nœuds. */
export interface EtapeCoVisibilite {
  readonly defilement: number;
  readonly premier: MesureChampDeVision;
  readonly second: MesureChampDeVision;
  /** Somme des débordements des deux nœuds : le « de combien ça rate » à cette position. */
  readonly manque: number;
}

/** Ce que deux nœuds peuvent, ou ne peuvent pas, montrer en même temps. */
export interface MesureCoVisibilite {
  readonly nom: string;
  readonly fenetre: { readonly largeur: number; readonly hauteur: number };
  /** Le conteneur réellement défilé, nommé — pour qu'un échec ne soit pas une devinette. */
  readonly conteneur: string;
  readonly amplitude: { readonly minimum: number; readonly maximum: number; readonly pas: number };
  /** Les voit-on tous les deux entiers À L'ARRIVÉE, sans aucun geste ? */
  readonly coVisiblesSansGeste: boolean;
  /**
   * LETTRE DU CRITÈRE A01 (2026-09-08) : existe-t-il une position de défilement
   * où les deux nœuds sont ENTIERS dans la fenêtre ? Géométrie seule.
   */
  readonly positionGeometrique: number | null;
  /**
   * MÊME CRITÈRE, HONNÊTEMENT MESURÉ : la même position, à condition qu'aucune
   * barre collante ne recouvre l'un des deux nœuds. Un nœud sous l'en-tête
   * collant est dans la fenêtre et n'est pas regardé.
   */
  readonly positionRegardable: number | null;
  /** La meilleure position atteinte, celle qui rate de le moins possible. */
  readonly meilleure: EtapeCoVisibilite;
  /** Tous les éléments collants rencontrés pendant le balayage, nommés. */
  readonly collantsRencontres: readonly string[];
}

/**
 * Cherche, EN DÉFILANT POUR DE BON, une position qui montre les deux nœuds.
 *
 * ── POURQUOI ON DÉFILE AU LIEU DE CALCULER ─────────────────────────────────
 * L'arbitrage A01 du 2026-09-08 a écarté la lecture « tout doit tenir à
 * l'ouverture » : la hauteur d'une ancre est une donnée de banque (§32.4,
 * longueur libre), donc un critère de tenue dans la fenêtre serait cassable par
 * un rédacteur de guidance qui écrit trois lignes de plus. Le critère retenu est
 * qu'il EXISTE une position de défilement montrant l'ancre du cran ET la bande
 * des cinq pastilles, entières, en même temps.
 *
 * Cette question ne se répond pas à l'arithmétique. Les barres collantes —
 * en-tête de coquille, bandeau d'écran partagé, barre d'actions « Suivant » —
 * se déplacent avec le défilement et rognent une hauteur utile qui n'est PAS
 * celle de la fenêtre. A01 l'a écrit sans détour : « la garde décide, pas
 * l'arithmétique ». On balaie donc toutes les positions et on regarde.
 */
export async function chercherCoVisibilite(
  page: Page,
  premier: Locator,
  second: Locator,
  nom: string,
  nomPremier = 'premier bloc',
  nomSecond = 'second bloc',
): Promise<MesureCoVisibilite> {
  // `elementHandle()` ATTEND le nœud et lève si le délai expire : il n'y a donc
  // aucun `null` à traiter ici, et le vérifier serait une branche morte que le
  // lint refuse à juste titre. Un nœud absent produit un échec qui le nomme.
  const poignePremier = await premier.elementHandle();
  const poigneSecond = await second.elementHandle();

  try {
    // Les types de l'argument sont DONNÉS et non inférés : Playwright déballe
    // les poignées d'élément en nœuds DOM côté navigateur, et laisser TypeScript
    // remonter cette transformation à l'envers le fait tomber en récursion
    // (« Type instantiation is excessively deep », mesuré ici même).
    const brut = await page.evaluate<
      ResultatBalayage,
      [ElementHandle<HTMLElement | SVGElement>, ElementHandle<HTMLElement | SVGElement>, number]
    >(BALAYER_DANS_LE_NAVIGATEUR, [poignePremier, poigneSecond, PAS_DE_BALAYAGE_PX]);

    const fenetre = brut.fenetre;
    const evaluerEtape = (etape: EtapeBrute): EtapeCoVisibilite => {
      const a = evaluerBoite(nomPremier, etape.premier.rect, fenetre, etape.premier.recouvertPar);
      const b = evaluerBoite(nomSecond, etape.second.rect, fenetre, etape.second.recouvertPar);
      const somme = (mesure: MesureChampDeVision): number =>
        mesure.debordement.haut +
        mesure.debordement.bas +
        mesure.debordement.gauche +
        mesure.debordement.droite;
      return { defilement: etape.defilement, premier: a, second: b, manque: somme(a) + somme(b) };
    };

    const etapes = brut.etapes.map(evaluerEtape);
    const arrivee = evaluerEtape(brut.initiale);

    const entiers = (etape: EtapeCoVisibilite): boolean =>
      etape.premier.etat === 'entierement_visible' && etape.second.etat === 'entierement_visible';
    const regardables = (etape: EtapeCoVisibilite): boolean =>
      entiers(etape) &&
      etape.premier.recouvertPar.length === 0 &&
      etape.second.recouvertPar.length === 0;

    const geometrique = etapes.find(entiers);
    const regardable = etapes.find(regardables);

    // La « meilleure » position sert au message d'échec : celle qui rate de le
    // moins possible, et à égalité celle qui est la moins recouverte. Elle donne
    // au correcteur le nombre de pixels à récupérer, pas une impression.
    const meilleure = etapes.reduce((gagnante, candidate) => {
      const cout = (etape: EtapeCoVisibilite): number =>
        etape.manque + etape.premier.recouvertPar.length + etape.second.recouvertPar.length;
      return cout(candidate) < cout(gagnante) ? candidate : gagnante;
    }, etapes[0] ?? arrivee);

    const collants = new Set<string>();
    for (const etape of [...etapes, arrivee]) {
      for (const nomCollant of etape.premier.recouvertPar) collants.add(nomCollant);
      for (const nomCollant of etape.second.recouvertPar) collants.add(nomCollant);
    }

    return {
      nom,
      fenetre,
      conteneur: brut.conteneur,
      amplitude: brut.amplitude,
      coVisiblesSansGeste: regardables(arrivee),
      positionGeometrique: geometrique === undefined ? null : geometrique.defilement,
      positionRegardable: regardable === undefined ? null : regardable.defilement,
      meilleure,
      collantsRencontres: [...collants],
    };
  } finally {
    await poignePremier.dispose();
    await poigneSecond.dispose();
  }
}

/** La phrase qu'un échec de co-visibilité affiche. */
export function decrireCoVisibilite(mesure: MesureCoVisibilite): string {
  const position = (valeur: number | null): string =>
    valeur === null ? 'AUCUNE' : `défilement ${px(valeur)}`;
  const collants =
    mesure.collantsRencontres.length === 0
      ? 'aucun élément collant rencontré'
      : `éléments collants rencontrés : ${mesure.collantsRencontres.join(', ')}`;
  return (
    `« ${mesure.nom} » · fenêtre ${px(mesure.fenetre.largeur)} × ${px(mesure.fenetre.hauteur)} · ` +
    `conteneur défilé ${mesure.conteneur} (0 → ${px(mesure.amplitude.maximum)}, pas de ${px(mesure.amplitude.pas)}) · ` +
    `vus ensemble sans aucun geste : ${mesure.coVisiblesSansGeste ? 'oui' : 'non'} · ` +
    `position où les deux sont entiers dans la fenêtre : ${position(mesure.positionGeometrique)} · ` +
    `position où ils sont en plus DÉGAGÉS de toute barre collante : ${position(mesure.positionRegardable)} · ` +
    `meilleure position atteinte : défilement ${px(mesure.meilleure.defilement)}, il y manque ${px(mesure.meilleure.manque)} · ` +
    `[${decrireMesure(mesure.meilleure.premier)}] · [${decrireMesure(mesure.meilleure.second)}] · ` +
    collants
  );
}
