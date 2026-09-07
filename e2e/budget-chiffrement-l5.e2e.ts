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
// ── LE DOUTE DE SPEC, ASSUMÉ ET NON TRANCHÉ ICI ────────────────────────────
// 11 §4 écrit, sous la puce « Crypto navigateur » : « Budgets d'acceptation
// (A28) : chiffrement < 50 ms/écriture ». Le SUJET est « chiffrement », l'UNITÉ
// est « par écriture ». Deux lectures se défendent :
//   (a) les deux enveloppes seules, la transaction Dexie n'étant pas de la
//       crypto et n'étant pas ce que la puce nomme ;
//   (b) l'écriture complète, transaction comprise — c'est le geste que
//       l'auditeur attend, et « /écriture » désignerait alors l'opération.
// A28 ne tranche pas seul un doute de spec (CLAUDE.md §3, 09 §5.7) : l'entrée
// `DECISIONS.md` est PROPOSÉE dans le rapport A28 du 2026-09-07 et attend son
// arbitre. En attendant, **les deux bornes sont mesurées et les deux sont
// assertées**. C'est la seule position qui ne devine rien : si la borne (b) —
// la plus large — tient sous 50 ms, alors (a) tient a fortiori, et l'arbitrage
// à venir ne pourra pas rendre ce fichier faux, seulement redondant d'une
// assertion.
//
// ── COMMENT LA MESURE EST PRISE, ET POURQUOI PAS AUTREMENT ─────────────────
// Le chemin mesuré est celui de PRODUCTION : appareil semé par la fixture d'A26,
// coffre ouvert par Argon2id dans le navigateur, entretien créé par les trois
// champs du 03 §17.1, puis des réponses cotées au doigt sur `SegmenteONA`.
// Chaque clic déclenche `enregistrer()` → `enregistrerReponse()` →
// `ecrireLocal()`. Aucune primitive n'est appelée à la main : un micro-banc sur
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
import { expect, test, type Locator, type Page } from '@playwright/test';
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
const BUDGET_MS = 0.4;

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

    (globalThis as unknown as Record<string, unknown>)['__sondeA28'] = {
      echantillons,
      /** Repart de zéro : appelée une fois arrivé sur l'écran à mesurer. */
      reinitialiser(): void {
        echantillons.length = 0;
        debutsChiffrement = [];
        putLigneMiroir = null;
      },
    };

    type FonctionOpaque = (...args: unknown[]) => unknown;

    // ① Le départ de chaque enveloppe. On enregistre l'INSTANT D'APPEL, pas la
    //    fin : le début de la première enveloppe est le début de l'écriture.
    const prototypeSubtle = SubtleCrypto.prototype as unknown as Record<string, FonctionOpaque>;
    const chiffrerOrigine = prototypeSubtle['encrypt'] as FonctionOpaque;
    prototypeSubtle['encrypt'] = function (this: SubtleCrypto, ...args: unknown[]): unknown {
      debutsChiffrement.push(performance.now());
      return chiffrerOrigine.apply(this, args);
    };

    const prototypeMagasin = IDBObjectStore.prototype as unknown as Record<string, FonctionOpaque>;
    const poserOrigine = prototypeMagasin['put'] as FonctionOpaque;
    const ajouterOrigine = prototypeMagasin['add'] as FonctionOpaque;

    // ② La fin du chiffrement : le `put` de la ligne miroir, premier geste à
    //    l'intérieur de la transaction. Tout ce qui suit est de la base, pas de
    //    la crypto.
    prototypeMagasin['put'] = function (this: IDBObjectStore, ...args: unknown[]): unknown {
      if (this.name !== 'outbox' && debutsChiffrement.length > 0 && putLigneMiroir === null) {
        putLigneMiroir = performance.now();
      }
      return poserOrigine.apply(this, args);
    };

    // ③ L'`add` dans `outbox` SIGNE l'écriture : `appliquerDescente` n'y écrit
    //    jamais (la garantie est structurelle, sa transaction n'inclut pas la
    //    table). Un échantillon n'est donc jamais fabriqué par une descente.
    prototypeMagasin['add'] = function (this: IDBObjectStore, ...args: unknown[]): unknown {
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
    const sonde = (
      globalThis as unknown as Record<string, { echantillons: Echantillon[] } | undefined>
    )['__sondeA28'];
    if (sonde === undefined) throw new Error('la sonde A28 n’est pas installée');
    return sonde.echantillons.map((echantillon) => ({ ...echantillon }));
  });
}

async function reinitialiserSonde(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sonde = (
      globalThis as unknown as Record<string, { reinitialiser: () => void } | undefined>
    )['__sondeA28'];
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

function titreDEcran(page: Page, texte: string): Locator {
  return page.getByRole('main').getByRole('heading', { name: texte, level: 1 });
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
  await expect(titreDEcran(page, 'Aujourd’hui')).toBeVisible();
  await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();

  await page.getByRole('button', { name: 'Nouvel entretien' }).click();
  await expect(titreDEcran(page, 'Nouvel entretien')).toBeVisible();
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
      .poll(
        async () => (await lireSonde(page)).filter((e) => e.ecritureMs !== null).length,
        {
          message: 'les écritures mesurées doivent toutes avoir commité',
          timeout: 30_000,
        },
      )
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
      `n=${String(echantillons.length)} écriture(s) · budget 11 §4 : ${String(BUDGET_MS)} ms · ` +
      `chiffrement (2 enveloppes) médiane ${arrondi(mediane(chiffrements))} ms, ` +
      `p95 ${arrondi(p95(chiffrements))} ms, max ${arrondi(Math.max(...chiffrements))} ms · ` +
      `écriture complète (transaction Dexie comprise) médiane ${arrondi(mediane(ecritures))} ms, ` +
      `p95 ${arrondi(p95(ecritures))} ms, max ${arrondi(Math.max(...ecritures))} ms · ` +
      'Chromium de bureau — PAS un iPad (11 §7) : le relevé sur tablette reste dû à A27 en P-C.';

    // Le chiffre est LU par A20 et recopié dans le rapport A28 : un budget
    // « vert » sans son chiffre n'est pas une mesure, c'est une opinion. Une
    // ANNOTATION plutôt qu'un `console.log` — `no-console` vaut aussi pour les
    // tests, et l'annotation est portée par le rapporteur `github`, donc lisible
    // en CI même quand le test passe.
    test.info().annotations.push({ type: 'mesure A28', description: releve });

    // ── LES DEUX LECTURES DU 11 §4, ASSERTÉES TOUTES LES DEUX ───────────────
    expect(p95(chiffrements), `chiffrement des deux enveloppes — ${releve}`).toBeLessThan(
      BUDGET_MS,
    );
    expect(p95(ecritures), `écriture complète — ${releve}`).toBeLessThan(BUDGET_MS);
  });
});
