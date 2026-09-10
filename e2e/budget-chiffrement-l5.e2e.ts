// =============================================================================
// E2E — BUDGET DE CHIFFREMENT PAR ÉCRITURE (11 §4 : < 50 ms/écriture) — agent A28
//
// ── LA RÉSERVE QUE CE FICHIER FERME, ET DEPUIS QUAND ELLE COURT ─────────────
// NB6 du contrôle A02 de L5a (2026-09-03), reprise en NB-10 du contrôle A02 de
// L5 (2026-09-06), échéance P-E, en toutes lettres : « Le budget A28
// “chiffrement < 50 ms/écriture” (11 §4) n'est mesuré nulle part. Seule la
// dérivation < 1 s l'est. Il porte pourtant sur `ecrireLocal`, cœur de L5a. »
// Mesuré le 2026-09-07 avant d'écrire une ligne : `grep -rn "50 ms\|50ms"
// apps/field/src e2e/` ne rendait AUCUNE occurrence. Le budget n'existait que
// dans le contrat — c'est-à-dire nulle part où quelque chose puisse rougir.
//
// ── CE QU'UNE ÉCRITURE EST, EXACTEMENT (lire `local/ecriture.ts:153`) ───────
// `ecrireLocal()` fait TROIS choses, dans cet ordre et jamais dans un autre :
//   ① `coffre.chiffrer(demande.charge)`        → l'enveloppe de la LIGNE ;
//   ② `coffre.chiffrer({...enTete, ...charge})` → l'enveloppe de l'OP d'outbox,
//      qui porte l'entité complète (le serveur n'a pas nos index locaux) ;
//   ③ une transaction Dexie `rw` sur DEUX tables : la table miroir et `outbox`.
// Les deux chiffrements ont lieu AVANT la transaction, et l'en-tête du module
// dit pourquoi : une transaction IndexedDB se referme dès qu'elle rend la main à
// `crypto.subtle`. Une écriture = DEUX enveloppes, toujours.
//
// ── LE DOUTE DE SPEC, POSÉ PAR A28 ET TRANCHÉ DEPUIS ───────────────────────
// 11 §4 écrit, sous la puce « Crypto navigateur » : « Budgets d'acceptation
// (A28) : chiffrement < 50 ms/écriture ». Le SUJET est « chiffrement », l'UNITÉ
// est « par écriture ». Deux lectures se défendaient :
//   (a) les deux enveloppes seules, la transaction Dexie n'étant pas de la
//       crypto et n'étant pas ce que la puce nomme ;
//   (b) l'écriture complète, transaction comprise — c'est le geste que
//       l'auditeur attend, et « /écriture » désignerait alors l'opération.
// A28 n'a pas tranché seul (CLAUDE.md §3) et a proposé l'entrée. **A01 a rendu
// l'arbitrage le 2026-09-07 : (a).** Le fait décisif est au fichier 09 §1
// (« LES RÔLES », ligne 23), qui énumère la charge d'A28 — « p95 interactions
// <100 ms, benchmark chiffrement <50 ms/écriture » : DEUX budgets distincts,
// dans la même parenthèse. Les fondre laisserait « p95 interactions » sans objet.
//
// **CE FICHIER PORTE DONC DEUX BORNES SOUS DEUX SEUILS DIFFÉRENTS**, et non
// deux lectures d'un même seuil : les enveloppes sous 50 ms (11 §4), l'écriture
// complète sous 100 ms (09 §1, dont elle est une condition nécessaire). Aucune
// n'est surnuméraire — elles bornent deux choses. Si l'arbitrage était un jour
// rejugé, ce sont ces deux constantes qu'il faudrait changer, sciemment.
//
// ── COMMENT LA MESURE EST PRISE, ET POURQUOI PAS AUTREMENT ─────────────────
// Le chemin mesuré est celui de PRODUCTION : appareil semé par la fixture d'A26,
// coffre ouvert par Argon2id dans le navigateur, entretien créé par les trois
// champs du 03 §17.1, puis des réponses cotées au doigt sur `SegmenteONA`.
// Chaque clic déclenche `enregistrer()` → `ecrireReponse()`
// (`apps/field/src/session/ecriture-reponses.ts:120`) → `ecrireLocal()`.
// Aucune primitive n'est appelée à la main : un micro-banc sur
// `crypto.subtle.encrypt` isolé mesurerait AES-GCM, pas ce que 11 §4 borne.
//
// La SONDE est posée par `page.addInitScript` et n'enveloppe que des API du
// NAVIGATEUR — `SubtleCrypto.prototype.encrypt`, `IDBObjectStore.prototype.put`
// et `.add`. **Aucune ligne d'`ecriture.ts` ni du coffre n'est touchée** (09
// §5.6 : A28 ne modifie pas le code qu'il mesure, et n'y ajoute pas non plus de
// porte d'instrumentation). Les horodatages sont pris DANS la page, en
// `performance.now()` : rien ne transite par le protocole Playwright pendant la
// mesure, dont la granularité aurait été du même ordre que le budget.
//
// Les deux bornes, avec ce qu'elles contiennent et ce qu'elles omettent :
//   · `chiffrementMs` — de l'entrée dans `crypto.subtle.encrypt` de la PREMIÈRE
//     enveloppe jusqu'à l'appel `put` de la ligne miroir. Elle englobe donc les
//     DEUX chiffrements, les deux encodages base64, la sérialisation JSON de la
//     seconde charge, l'`uuidv7()` de l'op et l'ouverture de la transaction
//     Dexie : c'est une borne SUPÉRIEURE du chiffrement, jamais une
//     sous-estimation. Le seul fragment exclu est ce qui précède le premier
//     `encrypt` à l'intérieur du premier `chiffrer` — un `JSON.stringify` et un
//     `TextEncoder.encode` sur une charge de quelques centaines d'octets, plus
//     un nonce de 12 octets. C'est écrit ici parce qu'un intervalle dont on tait
//     les bords n'est pas une mesure.
//   · `ecritureMs` — même départ, arrivée à l'évènement `complete` de la
//     transaction IndexedDB qui porte la ligne ET l'op. C'est l'écriture entière,
//     durabilité locale comprise : la lecture (b) du doute ci-dessus.
//
// ── UNE SEULE ÉCRITURE EST UN BRUIT ────────────────────────────────────────
// Quarante écritures sont mesurées, et l'assertion porte sur le **p95** : le
// contrat borne une écriture typique, pas une chanceuse, et un p95 sur 40
// échantillons ne se laisse pas sauver par deux valeurs basses. La médiane est
// annotée à côté — c'est elle qui se compare d'un lot à l'autre.
//
// ── LE RELEVÉ DU 2026-09-07, POUR QU'IL Y AIT UNE BASE DE COMPARAISON ──────
// Sept exécutions, 40 écritures chacune, Chromium de bureau dans le conteneur de
// développement. Chiffres en millisecondes :
//   · chiffrement (2 enveloppes) — médiane 0,50 à 0,60 · p95 0,60 à 1,80 ·
//     max 0,60 à 3,10  → le budget de 50 ms est tenu avec un facteur ~30 ;
//   · écriture complète (transaction comprise) — médiane 4,40 à 6,90 ·
//     p95 6,30 à 12,50 · max 8,30 à 17,70 → facteur ~8 sur son propre seuil de
//     100 ms (09 §1). Le « facteur ~4 » qu'annonçait ce paragraphe se rapportait
//     aux 50 ms, seuil qui ne la gouverne plus depuis l'arbitrage.
// C'est ce second chiffre qui décide : la crypto n'est pas le coût d'une
// écriture, IndexedDB l'est. Un futur dépassement viendrait donc de la base ou
// de la taille des charges, pas d'AES-GCM — et c'est utile à savoir avant de
// chercher au mauvais endroit. `performance.now()` est grossi à 0,1 ms par
// Chromium hors isolation : la résolution est cent fois plus fine que le seuil.
//
// CONTRE-ÉPREUVE, parce qu'un budget vert dont on n'a pas montré qu'il peut
// rougir ne mesure rien. Rejouée APRÈS l'arbitrage, sur les deux constantes
// telles qu'elles sont écrites ci-dessous — chacune doit pouvoir rougir SEULE :
//   · `BUDGET_MS` → 0,4 ms            → ROUGE sur « chiffrement » (p95 0,80) ;
//   · `BUDGET_INTERACTION_MS` → 3 ms  → ROUGE sur « écriture complète » (p95 6,90) ;
//   · sonde débranchée (le crochet `outbox` visant un magasin inexistant) →
//     ROUGE sur l'anti-vacuité, 0 écriture observée, et NON vert-sans-rien ;
//   · un `encrypt` parasite injecté dans la page (régression de production
//     simulée) → ROUGE sur l'anti-vacuité des enveloppes, « attendu 2, reçu 4 ».
// Les seuils ont été rétablis et le test est reparti vert.
//
// ⚠️ CE PARAGRAPHE EST UNE MESURE, PAS UNE INTENTION — il se rejoue tel quel.
// Sa version précédente annonçait « seuil abaissé à 5 ms → ROUGE sur écriture
// complète » : vrai avant l'arbitrage, quand une seule constante gouvernait les
// deux assertions ; FAUX ensuite, et personne ne l'avait rejoué. Relevé par la
// revue croisée A29 (réserve R2). Si tu changes une constante, rejoue ces
// lignes — une contre-épreuve écrite qui ne se reproduit plus est exactement le
// défaut que ce fichier prétend combattre.
//
// ── LA LIMITE, ÉCRITE PLUTÔT QUE TUE ───────────────────────────────────────
// **Un runner de CI n'est pas un iPad.** 11 §7 nomme déjà cette limite pour le
// service worker iOS, et elle vaut ici. Ce fichier ne prétend pas mesurer la
// tablette : il pose le plancher que la CI peut tenir sur Chromium de bureau, et
// le relevé sur appareil réel reste dû à A27 à la porte P-C. Un chiffre de
// bureau présenté comme un chiffre d'iPad serait exactement le faux vert que ce
// dépôt traque.
//
// Traçabilité : E33 (sécurité / RGPD — la crypto locale), E6 (hors ligne total),
// E36 (CI exécutable), E43 (exécutabilité autopilote — budgets d'acceptation du
// 11 §4).
// =============================================================================
import { appendFileSync } from 'node:fs';

import { expect, test, type Locator, type Page } from '@playwright/test';
import { VUES, type CodeVue } from '../apps/field/src/app/vues.js';
import {
  deverrouillerAppareil,
  lireTableLocale,
  MISSION_FIL_TPE,
  MOT_DE_PASSE_APPAREIL,
  planterAppareil,
  semerAppareil,
  type GrainesAppareil,
} from './fixtures/appareil-terrain.js';

/** 11 §4, en toutes lettres : « chiffrement < 50 ms/écriture ». */
const BUDGET_MS = 50;

/**
 * 09 §1, en toutes lettres : « A28 agent accessibilité/perf (… **p95 interactions
 * < 100 ms**, benchmark chiffrement < 50 ms/écriture) ». DEUX budgets distincts,
 * dans la même parenthèse — et c'est ce qui tranche le périmètre du 11 §4.
 *
 * L'écriture locale complète n'est donc PAS bornée par les 50 ms ci-dessus : le
 * budget du 11 §4 porte sur les enveloppes (arbitrage A01, `DECISIONS.md`
 * 2026-09-07). Elle n'est pas pour autant sans borne — elle relève du SECOND
 * budget d'A28, dont elle est une **condition nécessaire** : si la transaction
 * seule dépassait 100 ms, aucune interaction ne pourrait tenir. Ce n'est pas la
 * mesure complète du budget d'interactions pour autant : le trajet tap → peinture
 * n'est pas mesuré ici, et reste dû sur les listes longues de FIL-GC à P-E.
 */
const BUDGET_INTERACTION_MS = 100;

/**
 * Le nombre d'écritures mesurées.
 *
 * Quarante, et pas dix : un p95 se lit sur au moins deux dizaines d'échantillons
 * pour vouloir dire quelque chose, et quarante clics tiennent en quelques
 * secondes. Ce n'est pas une charge de tenue en régime (elle appartient à k6 et
 * aux listes longues de FIL-GC) : c'est l'échantillon d'un geste unitaire.
 */
const ECRITURES_MESUREES = 40;

/** Un interlocuteur FICTIF (invariant 2) — l'entretien créé par ce fichier. */
const INTERLOCUTEUR = 'Camille Ferrand';
const FONCTION = 'Responsable d’atelier';

/** Ce que la sonde rend, une ligne par écriture observée. */
interface Echantillon {
  /** Enveloppes chiffrées pendant l'écriture. Vaut 2, ou le port a changé. */
  readonly enveloppes: number;
  /** Borne SUPÉRIEURE des deux `coffre.chiffrer`, en millisecondes. */
  readonly chiffrementMs: number;
  /** L'écriture entière, transaction Dexie comprise. `null` = non terminée. */
  readonly ecritureMs: number | null;
}

/**
 * Ce que la sonde pose sur `globalThis` de la page.
 *
 * Type de COMPILATION seulement : rien ne traverse la frontière du navigateur:
 * il décrit le même objet des deux côtés, ce qui évite qu'un renommage d'un
 * côté passe inaperçu de l'autre.
 */
interface SondeA28 {
  readonly echantillons: readonly Echantillon[];
  readonly reinitialiser: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA SONDE — posée sur les API du NAVIGATEUR, jamais sur le code mesuré
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Installe la sonde avant tout script de l'application.
 *
 * `addInitScript` rejoue à CHAQUE navigation, y compris le `page.reload()` de
 * `planterAppareil` : la sonde survit donc au semis, et son relevé repart à zéro
 * avec la page, ce qui est le comportement voulu.
 */
async function installerSonde(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface EchantillonMutable {
      enveloppes: number;
      chiffrementMs: number;
      ecritureMs: number | null;
    }

    const echantillons: EchantillonMutable[] = [];
    let debutsChiffrement: number[] = [];
    let putLigneMiroir: number | null = null;

    (globalThis as unknown as { __sondeA28: SondeA28 }).__sondeA28 = {
      echantillons,
      /** Repart de zéro : appelée une fois arrivé sur l'écran à mesurer. */
      reinitialiser(): void {
        echantillons.length = 0;
        debutsChiffrement = [];
        putLigneMiroir = null;
      },
    };

    // Les prototypes, vus au travers du strict minimum qu'on leur emprunte. Les
    // signatures d'origine sont surchargées et paramétrées ; les retyper ici
    // n'apprendrait rien à personne, alors que `unknown` dit exactement ce que
    // la sonde sait de ces valeurs : qu'elle les fait passer, sans les lire.
    interface PrototypeChiffrant {
      encrypt: (...args: unknown[]) => unknown;
    }
    interface PrototypeMagasin {
      put: (...args: unknown[]) => unknown;
      add: (...args: unknown[]) => unknown;
    }

    // ① Le départ de chaque enveloppe. On enregistre l'INSTANT D'APPEL, pas la
    //    fin : le début de la première enveloppe est le début de l'écriture.
    const prototypeSubtle = SubtleCrypto.prototype as unknown as PrototypeChiffrant;
    const chiffrerOrigine = prototypeSubtle.encrypt;
    prototypeSubtle.encrypt = function (this: SubtleCrypto, ...args: unknown[]): unknown {
      debutsChiffrement.push(performance.now());
      return chiffrerOrigine.apply(this, args);
    };

    const prototypeMagasin = IDBObjectStore.prototype as unknown as PrototypeMagasin;
    const poserOrigine = prototypeMagasin.put;
    const ajouterOrigine = prototypeMagasin.add;

    // ② La fin du chiffrement : le `put` de la ligne miroir, premier geste à
    //    l'intérieur de la transaction. Tout ce qui suit est de la base, pas de
    //    la crypto.
    prototypeMagasin.put = function (this: IDBObjectStore, ...args: unknown[]): unknown {
      if (this.name !== 'outbox' && debutsChiffrement.length > 0 && putLigneMiroir === null) {
        putLigneMiroir = performance.now();
      }
      return poserOrigine.apply(this, args);
    };

    // ③ L'`add` dans `outbox` SIGNE l'écriture : `appliquerDescente` n'y écrit
    //    jamais (la garantie est structurelle, sa transaction n'inclut pas la
    //    table). Un échantillon n'est donc jamais fabriqué par une descente.
    prototypeMagasin.add = function (this: IDBObjectStore, ...args: unknown[]): unknown {
      const transaction = this.name === 'outbox' ? this.transaction : null;
      const resultat = ajouterOrigine.apply(this, args);
      const debut = debutsChiffrement[0];
      if (transaction !== null && debut !== undefined && putLigneMiroir !== null) {
        const echantillon: EchantillonMutable = {
          enveloppes: debutsChiffrement.length,
          chiffrementMs: putLigneMiroir - debut,
          ecritureMs: null,
        };
        echantillons.push(echantillon);
        transaction.addEventListener(
          'complete',
          () => {
            echantillon.ecritureMs = performance.now() - debut;
          },
          { once: true },
        );
        debutsChiffrement = [];
        putLigneMiroir = null;
      }
      return resultat;
    };
  });
}

/** Le relevé de la sonde, recopié hors de la page. */
async function lireSonde(page: Page): Promise<readonly Echantillon[]> {
  return page.evaluate(() => {
    const { __sondeA28: sonde } = globalThis as unknown as { __sondeA28?: SondeA28 };
    if (sonde === undefined) throw new Error('la sonde A28 n’est pas installée');
    return sonde.echantillons.map((echantillon) => ({ ...echantillon }));
  });
}

async function reinitialiserSonde(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { __sondeA28: sonde } = globalThis as unknown as { __sondeA28?: SondeA28 };
    if (sonde === undefined) throw new Error('la sonde A28 n’est pas installée');
    sonde.reinitialiser();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LES STATISTIQUES — nommées, pour qu'on sache laquelle est assertée
// ─────────────────────────────────────────────────────────────────────────────
function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haut = triees[milieu] ?? 0;
  if (triees.length % 2 === 1) return haut;
  return ((triees[milieu - 1] ?? 0) + haut) / 2;
}

/**
 * p95 par RANG LE PLUS PROCHE (pas d'interpolation) : sur 40 échantillons, c'est
 * la 38ᵉ valeur triée. Deux valeurs hautes peuvent donc tomber sans emporter le
 * verdict, une troisième l'emporte — ce qui est exactement ce qu'on veut d'un
 * seuil qui tourne sur un runner partagé.
 */
function p95(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(triees.length - 1, Math.ceil(0.95 * triees.length) - 1);
  return triees[rang] ?? 0;
}

function arrondi(valeur: number): string {
  return valeur.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// LE PARCOURS DE PRODUCTION QUI MÈNE AUX ÉCRITURES
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Le semis, fabriqué une fois par processus : `semerAppareil` dérive une KEK
 * Argon2id avec les paramètres de production, et c'est long.
 */
let semis: Promise<GrainesAppareil> | null = null;
function graines(): Promise<GrainesAppareil> {
  semis ??= semerAppareil(MOT_DE_PASSE_APPAREIL);
  return semis;
}

/**
 * Le titre de la VUE, cherché dans le `<main>` — et LU DANS LE REGISTRE.
 *
 * ── DEUX CORRECTIONS, ET LA SECONDE EST LA VRAIE ───────────────────────────
 * ① 2026-09-10, matin : ce helper cherchait un `<h1>` dans `<main>`, c'est-à-dire
 *    le titre propre de l'ÉCRAN — le SECOND des deux titres de niveau 1 que la
 *    page portait (constat A28-1). Le repère est le même qu'aujourd'hui, mais
 *    l'élément visé est un AUTRE : le titre de l'écran, pas celui de la vue, et
 *    c'est le premier qui a disparu. Le `h1` canonique est celui de la COQUILLE
 *    (règle A01), alimenté par `app/vues.ts` ; les écrans sous `<main>` n'en
 *    portent plus. Le helper vise donc l'élément qui a SURVÉCU au correctif d'A22.
 * ② 2026-09-10, après-coup : il prenait encore une CHAÎNE recopiée à la main. Le
 *    registre a changé le libellé de `stockage` le matin même, et trois tests
 *    sont tombés — sur leur `atteindre`, pas sur une assertion de titre. Le NOM
 *    du test, lui, était engendré depuis `VUES[code].titre` : le nom et
 *    l'assertion ne parlaient donc plus du même écran.
 *    C'est mot pour mot la famille de défaut que le chapeau de ce fichier
 *    dénonce — « une liste écrite à la main se désynchronise du registre en
 *    silence ». Le helper prend désormais un CODE DE VUE : le compilateur refuse
 *    un code inconnu, et le libellé ne peut plus être périmé puisqu'il n'est plus
 *    recopié.
 *
 * ── ③ 2026-09-10, RÉSERVE R1 D'A29 : DU BANNER AU `<main>` ─────────────────
 * Le titre a quitté le `<header>` de la coquille pour devenir le premier enfant
 * du `<main>` (A22, `App.tsx`). Deux raisons, et le helper les suit :
 * · `role="banner"` désigne PAR SPÉCIFICATION du contenu répété de page en page ;
 *   un titre qui change à chaque vue y était un contresens sémantique ;
 * · le `<main>` n'avait AUCUN nom accessible — qui saute au repère principal, le
 *   geste le plus courant au lecteur d'écran, n'entendait jamais le titre de la
 *   vue. Il tombe désormais dessus, puisque le titre l'ouvre.
 * LE PRINCIPE NE BOUGE PAS : la source reste le registre, unique. Seul
 * l'emplacement change — et c'est aussi ce qui met la coquille d'accord avec
 * `EcranDeverrouillage`, qui plaçait déjà son `h1` dans le `<main>`.
 *
 * Ce que l'assertion dit exactement : « la coquille affiche le titre de CETTE
 * vue-là, en `h1` de niveau 1, au premier rang du repère `main`, sous son nom
 * EXACT ». Le LIBELLÉ, lui, est une donnée du registre — il s'y lit, il ne se
 * redouble pas ici.
 */
function titreDeCoquille(page: Page, code: CodeVue): Locator {
  return page
    .getByRole('main')
    .getByRole('heading', { name: VUES[code].titre, level: 1, exact: true });
}

/**
 * L'étiquette qui ENTOURE un bouton radio de `SegmenteONA`.
 *
 * Le composant masque visuellement l'`<input type="radio">`
 * (`axn-visuellement-masque`) et peint un gros pavé tactile à sa place (§33.5).
 * Playwright refuse donc de cliquer l'input — « `<span>Oui</span>` intercepts
 * pointer events », ce qui est LA BONNE RÉPONSE : personne ne clique un élément
 * masqué. On remonte au parent, qui est le pavé, et c'est lui qu'on touche.
 */
function etiquetteDe(radio: Locator): Locator {
  return radio.locator('xpath=..');
}

/**
 * Ouvre l'appareil, crée un entretien, démarre la collecte et s'arrête sur la
 * question à choix — la seule dont chaque geste écrit IMMÉDIATEMENT.
 *
 * Le texte libre, lui, passe par `differer()` et ses 300 ms de débounce
 * (`session/enregistrement.ts`) : mesurer là-dessus mêlerait une temporisation
 * d'interface au budget crypto, et le chiffre ne voudrait plus rien dire.
 */
async function allerQuestionAChoix(page: Page): Promise<void> {
  await planterAppareil(page, await graines());
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);
  await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
  await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();

  await page.getByRole('button', { name: 'Nouvel entretien' }).click();
  await expect(titreDeCoquille(page, 'nouvelEntretien')).toBeVisible();
  await page.getByLabel('Nom de l’interlocuteur').fill(INTERLOCUTEUR);
  await page.getByLabel('Fonction').fill(FONCTION);
  await page.getByLabel('Unité').selectOption({ label: MISSION_FIL_TPE.unite });
  await page.getByRole('button', { name: 'Ouvrir l’entretien' }).click();

  await expect(page.getByRole('heading', { name: 'Avant la première question' })).toBeVisible();
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

  // Question 1 de la fixture est un texte libre : on passe à la 2, qui est un
  // oui/non (`e2e/fixtures/appareil-terrain.ts`, QUESTIONS).
  await expect(page.getByText('Question 1 / 3')).toBeVisible();
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await expect(page.getByText('Question 2 / 3')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Oui/ })).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// LA MESURE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('L5 — budget de chiffrement par écriture (11 §4 : < 50 ms)', () => {
  test('quarante écritures locales réelles tiennent le budget, chiffrement ET transaction', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await installerSonde(page);
    await allerQuestionAChoix(page);

    // Le relevé repart d'ici : la création du coffre et celle de l'entretien
    // sont de vraies écritures, mais elles ne sont pas le geste mesuré.
    await reinitialiserSonde(page);

    const oui = page.getByRole('radio', { name: /^Oui/ });
    const non = page.getByRole('radio', { name: /^Non/ });
    for (let tour = 0; tour < ECRITURES_MESUREES; tour += 1) {
      // On ALTERNE : un bouton radio déjà coché ne rend pas d'évènement, donc
      // pas d'écriture. Chaque clic est un auditeur qui se reprend — un geste
      // que 03 §17.4 rend possible à tout moment, et qui repasse par le port.
      const choix = tour % 2 === 0 ? oui : non;
      // On clique l'ÉTIQUETTE, pas l'`<input>` : `SegmenteONA` masque
      // visuellement le bouton radio (§33.5, gros boutons tactiles) et c'est le
      // gros pavé qui reçoit le doigt de l'auditeur. Cliquer l'input masqué
      // n'est pas un geste que quiconque fait.
      await etiquetteDe(choix).click();
      // Chaque tour attend son effet : sans cela, quarante clics partiraient
      // plus vite que les écritures et l'on ne mesurerait plus un geste mais
      // une rafale.
      await expect(choix).toBeChecked();
    }

    // On attend les ÉCRITURES, pas les clics : `enregistrer()` sérialise la file
    // et rend la main avant que la transaction ait commité.
    await expect
      .poll(async () => (await lireSonde(page)).filter((e) => e.ecritureMs !== null).length, {
        message: 'les écritures mesurées doivent toutes avoir commité',
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(ECRITURES_MESUREES);

    const echantillons = (await lireSonde(page)).filter((e) => e.ecritureMs !== null);

    // ── ANTI-VACUITÉ ────────────────────────────────────────────────────────
    // Une sonde qui ne voit rien rendrait un vert sans rien mesurer. Trois
    // contrôles, et le dernier ne passe pas par la sonde du tout.
    expect(
      echantillons.length,
      'la sonde n’a pas observé les écritures attendues — elle mesure autre chose',
    ).toBeGreaterThanOrEqual(ECRITURES_MESUREES);
    for (const [rang, echantillon] of echantillons.entries()) {
      expect(
        echantillon.enveloppes,
        `écriture ${String(rang + 1)} : une écriture chiffre DEUX enveloppes ` +
          '(ligne + op d’outbox, `local/ecriture.ts`)',
      ).toBe(2);
    }
    const outbox = await lireTableLocale(page, 'outbox');
    expect(
      outbox.length,
      'les écritures mesurées doivent exister dans `outbox` — sinon rien n’a été écrit',
    ).toBeGreaterThanOrEqual(ECRITURES_MESUREES);

    // ── LES CHIFFRES ────────────────────────────────────────────────────────
    const chiffrements = echantillons.map((e) => e.chiffrementMs);
    const ecritures = echantillons.map((e) => e.ecritureMs ?? 0);

    const releve =
      `n=${String(echantillons.length)} écriture(s) · budgets : 11 §4 ${String(BUDGET_MS)} ms ` +
      `sur les enveloppes, 09 §1 ${String(BUDGET_INTERACTION_MS)} ms sur l'écriture complète · ` +
      `chiffrement (2 enveloppes) médiane ${arrondi(mediane(chiffrements))} ms, ` +
      `p95 ${arrondi(p95(chiffrements))} ms, max ${arrondi(Math.max(...chiffrements))} ms · ` +
      `écriture complète (transaction Dexie comprise) médiane ${arrondi(mediane(ecritures))} ms, ` +
      `p95 ${arrondi(p95(ecritures))} ms, max ${arrondi(Math.max(...ecritures))} ms · ` +
      'Chromium de bureau — PAS un iPad (11 §7) : le relevé sur tablette reste dû à A27 en P-C.';

    // Le chiffre est LU par A20 et recopié dans le rapport A28 : un budget
    // « vert » sans son chiffre n'est pas une mesure, c'est une opinion. Une
    // ANNOTATION plutôt qu'un `console.log` — `no-console` vaut aussi pour les
    // tests — et elle est portée par le rapport HTML.
    test.info().annotations.push({ type: 'mesure A28', description: releve });

    // MAIS L'ANNOTATION SEULE NE SUFFIT PAS, ET C'EST MESURÉ. Le rapporteur
    // `github` ne remonte les annotations que sur un ÉCHEC : sur le run vert du
    // 2026-09-07 (job `5 · e2e`, PR #92), le journal de CI ne contient que
    // « 84 passed » — le relevé n'y figure nulle part. Il ne vivait que dans un
    // artefact de 5 Mo que personne ne téléchargera. Un chiffre qu'il faut
    // déterrer n'est pas un chiffre publié, et « lisible en CI » était donc une
    // promesse que le code ne tenait pas — le défaut même que ce dépôt traque.
    //
    // Le résumé de job, lui, est rendu sur la page du run sans rien télécharger.
    // CE QUI EST MESURÉ ICI, ET CE QUI NE L'EST PAS : l'écriture de la ligne
    // quand la variable est posée est vérifiée (relevé complet, contrôlé sur un
    // fichier local). Que GitHub la RENDE ne l'est pas — les résumés de job ne
    // sont exposés par aucun point d'entrée de l'API REST (`output` du check-run
    // est vide, vérifié), donc c'est le comportement documenté de la variable qui
    // est invoqué, pas une mesure. À regarder sur la page du job du prochain run.
    // Échec silencieux assumé : hors CI la variable n'existe pas, et une panne
    // d'écriture ne doit JAMAIS faire rougir une mesure de performance.
    const resume = process.env.GITHUB_STEP_SUMMARY;
    if (resume !== undefined && resume !== '') {
      try {
        appendFileSync(resume, `\n**Mesure A28 — budget de chiffrement** — ${releve}\n`, 'utf8');
      } catch {
        /* le relevé reste dans l'annotation et dans le rapport HTML */
      }
    }

    // ── DEUX BORNES, CHACUNE SOUS LA RÈGLE QUI LA POSSÈDE ───────────────────
    // Et non deux lectures d'un même seuil : l'arbitrage A01 du 2026-09-07 a
    // tranché que le 11 §4 borne les ENVELOPPES, la transaction relevant du
    // second budget d'A28 (09 §1). Aucune des deux n'est surnuméraire — elles
    // bornent deux choses différentes, et la seconde couvre ce que la première
    // ne couvre pas. Les marges sont d'ailleurs dissymétriques : facteur ~30 sur
    // les enveloppes, ~8 sur l'écriture complète. La première ne peut pas rougir
    // sur un runner chargé ; la seconde le peut, et c'est pour ça qu'elle porte
    // le seuil de la règle qui la possède plutôt qu'un seuil emprunté.
    expect(p95(chiffrements), `chiffrement des deux enveloppes (11 §4) — ${releve}`).toBeLessThan(
      BUDGET_MS,
    );
    expect(
      p95(ecritures),
      `écriture complète, condition nécessaire du budget d'interactions (09 §1) — ${releve}`,
    ).toBeLessThan(BUDGET_INTERACTION_MS);
  });
});
