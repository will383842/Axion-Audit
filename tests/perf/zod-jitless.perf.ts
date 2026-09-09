// =============================================================================
// MESURE A28 — CE QUE LE `jitless` DE ZOD COÛTE, EN MILLISECONDES.
//
// ── LA QUESTION, ET QUI L'A POSÉE ──────────────────────────────────────────
// L'incrément sécurité #112 a désactivé la compilation à la volée de Zod
// (`packages/shared/src/zod-sans-jit.ts`, appelée au PREMIER import de chaque
// `main.tsx`) pour faire taire une `securitypolicyviolation` qui se déclenchait
// à chaque chargement. Son en-tête revendique que ça ne coûte rien : « SOUS LA
// CSP, ILS NE L'AVAIENT DÉJÀ PAS ». La revue croisée A29 du 2026-09-09 n'a pas
// signé cette affirmation : « A28 p95 — non faite ». Ce fichier la mesure.
//
// ── CE QUE LE PAQUET ÉPINGLÉ FAIT, LU DANS SON CODE (zod 4.4.3) ────────────
//   · `v4/core/util.js` : `allowsEval` rend `false` si `globalConfig.jitless`,
//     sinon tente `new Function("")` et rend `false` si ça jette ;
//   · `v4/core/schemas.js:970-972` : `const jit = !globalConfig.jitless` puis
//     `fastEnabled = jit && allowsEval.value`.
// Une conjonction : il suffit que `allowsEval` soit faux pour que la voie
// compilée soit inaccessible, drapeau ou pas. La CSP servie
// (`script-src 'self' 'wasm-unsafe-eval'`, sans `'unsafe-eval'`) fait jeter
// `new Function`. C'est l'argument de l'en-tête ; ce fichier ne le croit pas sur
// parole, il l'éprouve DANS le navigateur, derrière le vrai Caddy.
//
// ── COMMENT L'A/B EST FAIT SANS TOUCHER UNE LIGNE DE PRODUCTION ────────────
// 09 §5.6 interdit à A28 de modifier le code qu'il mesure — construire une
// variante du build avec l'appel retiré serait exactement cela. La bascule est
// donc posée sur un GLOBAL DU NAVIGATEUR, comme la sonde de
// `e2e/budget-chiffrement-l5.e2e.ts` l'est sur `SubtleCrypto.prototype` :
// `globalThis.__zod_globalConfig` est pré-défini avec une propriété `jitless`
// dont le lecteur rend `undefined` et dont l'écrivain ne fait rien. Zod adopte
// cet objet (`(_a = globalThis).__zod_globalConfig ?? …`, vérifié dans le bundle
// livré), `desactiverJitZod()` s'exécute NORMALEMENT et son `z.config({jitless:
// true})` passe par un `Object.assign` que le setter absorbe. Le drapeau est
// donc neutralisé sans qu'une ligne du code livré ait changé, et l'artefact
// mesuré est bit pour bit celui de `5ac6f95`.
//
// ── LES QUATRE CONDITIONS, ET POURQUOI QUATRE ─────────────────────────────
// Le drapeau seul ne prouve rien : sous la CSP, les deux états doivent être
// IDENTIQUES (c'est la thèse). Il faut donc un serveur où le JIT est réellement
// disponible pour voir ce que le drapeau coûterait s'il coûtait quelque chose :
//   ① Caddy (en-têtes réels)   × drapeau POSÉ      → la production ;
//   ② Caddy                    × drapeau NEUTRALISÉ → JIT toujours impossible ;
//   ③ `vite preview` (sans CSP)× drapeau POSÉ      → JIT refusé PAR LE DRAPEAU ;
//   ④ `vite preview`           × drapeau NEUTRALISÉ → JIT RÉELLEMENT ACTIF.
// ③ contre ④ est la seule paire qui isole le coût du drapeau. ① contre ② dit si
// la CSP le rend sans objet. ① contre ④ dit ce que la sécurité coûte en tout.
//
// ── CE QUI EST MESURÉ, ET POURQUOI CE GESTE-LÀ ────────────────────────────
// Le coffre valide CHAQUE charge déchiffrée par un schéma Zod
// (`apps/field/src/local/formes.ts`). Le déverrouillage de FIL-GC en déchiffre
// donc 251 (150 unités + 60 sessions + 40 questions + 1 mission) : c'est le
// geste le plus dense en `parse` de toute l'application, et donc celui où un
// écart de JIT se verrait s'il devait se voir. La cotation, elle, en fait deux :
// elle est là pour montrer qu'un geste ordinaire ne bouge pas non plus.
//
// LA COMMANDE :
//   Caddy sur 4173 (voir le rapport A28) ET `pnpm --filter @axion/field preview
//   --port 4174 --strictPort` en parallèle, puis
//   `pnpm exec playwright test --config=playwright.perf.config.ts zod-jitless`
//
// Traçabilité : E33 (sécurité / RGPD — la CSP est une mesure de sécurité),
// E36 (CI exécutable), E43 (exécutabilité autopilote — budgets d'acceptation).
// =============================================================================
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { armer, installerChrono, relever } from './fixtures/chrono-interaction.js';
import {
  MISSION_FIL_GC,
  MOT_DE_PASSE_FIL_GC,
  planterFilGc,
  semerFilGc,
  type GrainesFilGc,
} from './fixtures/semis-fil-gc.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RELEVE = join(RACINE, 'releves-a28', 'jitless.jsonl');

/** Le serveur qui pose les en-têtes réels, et celui qui n'en pose aucun. */
const SERVEURS = [
  { nom: 'caddy (en-têtes réels)', url: 'http://127.0.0.1:4173/', csp: true },
  { nom: 'vite preview (aucune CSP)', url: 'http://127.0.0.1:4174/', csp: false },
] as const;

const DRAPEAUX = [
  { nom: 'jitless POSÉ (production)', neutraliser: false },
  { nom: 'jitless NEUTRALISÉ', neutraliser: true },
] as const;

const OUVERTURES_MESUREES = 20;
const COTATIONS_MESUREES = 20;

function p95(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(triees.length - 1, Math.ceil(0.95 * triees.length) - 1);
  return triees[rang] ?? 0;
}

function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haut = triees[milieu] ?? 0;
  if (triees.length % 2 === 1) return haut;
  return ((triees[milieu - 1] ?? 0) + haut) / 2;
}

/**
 * Neutralise le drapeau `jitless` SANS toucher au code livré.
 *
 * Le getter rend `undefined` (donc `desactiverJitZod()` ne sort pas par sa garde
 * et fait bien son `z.config()`), le setter absorbe l'écriture. Zod adopte cet
 * objet parce qu'il ne le crée que s'il n'existe pas.
 */
async function neutraliserLeDrapeau(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const configuration: Record<string, unknown> = {};
    Object.defineProperty(configuration, 'jitless', {
      get: (): undefined => undefined,
      set: (): void => {
        /* l'écriture de `desactiverJitZod` est absorbée : le drapeau ne prend pas */
      },
      enumerable: true,
      configurable: true,
    });
    (globalThis as unknown as { __zod_globalConfig: unknown }).__zod_globalConfig = configuration;
  });
}

/**
 * Écoute les violations de CSP que la page se rapporte à elle-même.
 *
 * ── POURQUOI PAS UN `new Function` DANS UN `page.evaluate` ─────────────────
 * Parce que ça MENT, et c'est mesuré : la première version de ce fichier
 * probait `new Function('')` depuis `page.evaluate` et obtenait « permis » sous
 * la CSP la plus stricte. Un script évalué par le protocole de débogage n'est
 * pas soumis à la `script-src` de la page — c'est le contexte du débogueur, pas
 * celui du document. La garde d'anti-vacuité a rougi, et c'est ce qui a permis
 * de s'en apercevoir plutôt que de publier un chiffre faux.
 *
 * Le signal juste est l'événement `securitypolicyviolation`, qui est émis par le
 * document quand SON PROPRE code se fait refuser un `eval`. C'est très
 * exactement ce que la sonde de Zod déclenchait avant #112, et donc ce que le
 * drapeau `jitless` a fait taire.
 */
async function ecouterLesViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: { directive: string; bloque: string; echantillon: string }[] = [];
    (globalThis as unknown as { __violationsA28: unknown }).__violationsA28 = violations;
    addEventListener('securitypolicyviolation', (evenement) => {
      violations.push({
        directive: evenement.effectiveDirective,
        bloque: evenement.blockedURI,
        echantillon: evenement.sample,
      });
    });
  });
}

/** Ce que la page dit d'elle-même, une fois l'application chargée. */
async function etatDuNavigateur(page: Page): Promise<{
  violationsEval: number;
  violations: { directive: string; bloque: string; echantillon: string }[];
  isolationCrossOrigin: boolean;
  jitlessEffectif: unknown;
}> {
  return page.evaluate(() => {
    const violations =
      (
        globalThis as unknown as {
          __violationsA28?: { directive: string; bloque: string; echantillon: string }[];
        }
      ).__violationsA28 ?? [];
    const configuration = (globalThis as unknown as { __zod_globalConfig?: { jitless?: unknown } })
      .__zod_globalConfig;
    return {
      violationsEval: violations.filter((violation) => violation.bloque === 'eval').length,
      violations: violations.slice(0, 5),
      isolationCrossOrigin: globalThis.crossOriginIsolated,
      jitlessEffectif: configuration?.jitless,
    };
  });
}

let semis: Promise<GrainesFilGc> | null = null;
function graines(): Promise<GrainesFilGc> {
  semis ??= semerFilGc(MOT_DE_PASSE_FIL_GC);
  return semis;
}

test.describe('A28 — ce que le `jitless` de Zod coûte, mesuré sur les quatre conditions', () => {
  for (const serveur of SERVEURS) {
    for (const drapeau of DRAPEAUX) {
      test(`${serveur.nom} × ${drapeau.nom}`, async ({ page }) => {
        test.setTimeout(300_000);

        await installerChrono(page);
        await ecouterLesViolations(page);
        if (drapeau.neutraliser) await neutraliserLeDrapeau(page);

        const deverrouillages: number[] = [];
        const ouvertures: number[] = [];
        let etat = {
          violationsEval: 0,
          violations: [] as { directive: string; bloque: string; echantillon: string }[],
          isolationCrossOrigin: false,
          jitlessEffectif: undefined as unknown,
        };

        for (let tour = 0; tour < OUVERTURES_MESUREES; tour += 1) {
          if (tour > 0) {
            await page.evaluate(
              async () =>
                new Promise<void>((resoudre) => {
                  const demande = indexedDB.deleteDatabase('axion-terrain');
                  demande.onsuccess = (): void => {
                    resoudre();
                  };
                  demande.onerror = (): void => {
                    resoudre();
                  };
                  demande.onblocked = (): void => {
                    resoudre();
                  };
                }),
            );
          }
          await planterFilGc(page, await graines(), serveur.url);
          if (tour === 0) etat = await etatDuNavigateur(page);

          // Le déverrouillage : Argon2id, puis 251 charges déchiffrées et
          // VALIDÉES par Zod. Le geste le plus dense en `parse` de l'app.
          await expect(
            page.getByRole('heading', { name: 'Déverrouiller la collecte' }),
          ).toBeVisible();
          await page.getByLabel(/^Mot de passe/).fill(MOT_DE_PASSE_FIL_GC);
          await armer(
            page,
            'déverrouillage',
            { selecteur: 'main h1', texte: 'Aujourd’hui' },
            60_000,
          );
          await page.getByRole('button', { name: 'Déverrouiller' }).click();
          deverrouillages.push((await relever(page)).msCible ?? 0);
          await expect(page.getByRole('heading', { name: MISSION_FIL_GC.titre })).toBeVisible();

          // L'ouverture d'une session : 40 questions déchiffrées et validées.
          const lignes = page.locator('button.axn-journee__session');
          await expect(lignes.first()).toBeVisible();
          await armer(
            page,
            'ouvrir une session',
            { selecteur: 'main h2', texte: 'Avant la première question' },
            30_000,
          );
          await lignes.nth(tour % 20).click();
          ouvertures.push((await relever(page)).msCible ?? 0);
        }

        // La cotation, pour montrer qu'un geste ordinaire ne bouge pas non plus.
        await page.getByLabel('Accord de participation recueilli').check();
        await armer(page, 'démarrer', { selecteur: 'main', texte: 'Question 1 / 40' }, 30_000);
        await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
        await relever(page);
        for (let rang = 1; rang <= 37; rang += 1) {
          await page.getByRole('button', { name: /^Suivant/ }).click();
          await expect(page.getByText(`Question ${String(rang + 1)} / 40`)).toBeVisible();
        }
        const cotations: number[] = [];
        const oui = page.getByRole('radio', { name: /^Oui/ });
        const non = page.getByRole('radio', { name: /^Non/ });
        await expect(oui).toBeVisible();
        for (let tour = 0; tour < COTATIONS_MESUREES; tour += 1) {
          const pair = tour % 2 === 0;
          await armer(
            page,
            'cotation',
            {
              selecteur: 'label.axn-choix__option:has(.axn-choix__marque)',
              texte: pair ? 'Oui' : 'Non',
            },
            15_000,
          );
          await (pair ? oui : non).locator('xpath=..').click();
          cotations.push((await relever(page)).msCible ?? 0);
        }

        const releve = {
          serveur: serveur.nom,
          cspServie: serveur.csp,
          drapeau: drapeau.nom,
          violationsEvalAuChargement: etat.violationsEval,
          violations: etat.violations,
          isolationCrossOrigin: etat.isolationCrossOrigin,
          jitlessEffectif: etat.jitlessEffectif,
          deverrouillage: {
            n: deverrouillages.length,
            mediane: mediane(deverrouillages),
            p95: p95(deverrouillages),
            valeurs: deverrouillages.map((v) => Number(v.toFixed(2))),
          },
          ouvertureDeSession: {
            n: ouvertures.length,
            mediane: mediane(ouvertures),
            p95: p95(ouvertures),
            valeurs: ouvertures.map((v) => Number(v.toFixed(2))),
          },
          cotation: {
            n: cotations.length,
            mediane: mediane(cotations),
            p95: p95(cotations),
            valeurs: cotations.map((v) => Number(v.toFixed(2))),
          },
        };
        test.info().annotations.push({
          type: 'mesure A28 jitless',
          description: JSON.stringify(releve),
        });
        try {
          mkdirSync(dirname(RELEVE), { recursive: true });
          appendFileSync(RELEVE, `${JSON.stringify(releve)}\n`, 'utf8');
        } catch {
          /* l'annotation reste la preuve */
        }

        // ── ANTI-VACUITÉ ────────────────────────────────────────────────────
        // La condition doit être CE QU'ELLE PRÉTEND ÊTRE, sans quoi les quatre
        // cases mesureraient la même chose et la comparaison serait un décor.
        // La condition doit être CE QU'ELLE PRÉTEND ÊTRE. Sous la CSP servie,
        // le drapeau neutralisé fait rejouer la sonde `new Function` de Zod :
        // le document DOIT alors se rapporter une violation `eval`. Avec le
        // drapeau posé — la production — il ne doit y en avoir AUCUNE : c'est
        // très exactement ce que l'incrément #112 promettait.
        if (serveur.csp && drapeau.neutraliser) {
          expect(
            etat.violationsEval,
            'sous la CSP servie, la sonde de Zod doit être refusée et rapportée — ' +
              'sans violation, le drapeau n’est pas vraiment neutralisé',
          ).toBeGreaterThanOrEqual(1);
        } else {
          expect(
            etat.violationsEval,
            'aucune violation `eval` n’est attendue dans cette condition',
          ).toBe(0);
        }
        expect(
          etat.jitlessEffectif,
          `« ${drapeau.nom} » : le drapeau lu dans la page doit valoir ` +
            (drapeau.neutraliser ? 'undefined' : 'true'),
        ).toBe(drapeau.neutraliser ? undefined : true);
        expect(deverrouillages.length).toBe(OUVERTURES_MESUREES);
        expect(cotations.length).toBe(COTATIONS_MESUREES);
      });
    }
  }
});
