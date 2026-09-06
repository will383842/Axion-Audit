// =============================================================================
// MULTI-APPAREILS, CE QUI EST VÉRIFIABLE EN JSDOM — lot L5, incrément L5c.
// Écrit par A27 (09 §1 : « installation PWA, persistance, quotas, tactile
// ≥ 44 px »), depuis 03 §22.1 (cibles tactiles ≥ 44 px), invariant 4 (aucune
// couleur ni taille en dur : jetons uniquement), 03 §33.1 / 11 §1 (police
// AUTO-HÉBERGÉE, jamais de CDN), 03 §33.7 (aucun verrou en session active de
// 45 min) et `LOT_L5.md` §3.1 (précache : shell, polices, icônes — jamais `/api`).
//
// ── CE QUE JSDOM PEUT MESURER, ET CE QU'IL NE PEUT PAS ───────────────────────
// jsdom ne PEINT rien : aucune boîte, aucun pixel. Ce fichier ne mesure donc
// pas des hauteurs — il mesure le CONTRAT entre le DOM rendu et les feuilles de
// style : chaque élément interactif des quatre écrans porte une classe dont la
// règle CSS pose `min-height` sur un jeton dont la VALEUR est ≥ 44 px. C'est
// vérifiable, falsifiable, et c'est tout ce que jsdom permet. Le rendu peint sur
// iPad Safari reste dû à un appareil réel (P-C, checklist 07 §15) — dit au
// rapport, jamais affirmé ici.
//
// Traçabilité : E27 (design/WCAG), E44 (UX/UI 2026-2027 : tokens, police locale), E6 (hors ligne total),
// E33 (sécurité / RGPD — verrou §9.7).
// =============================================================================
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Dexie from 'dexie';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EcranAgenda } from './EcranAgenda.js';
import { EcranAujourdhui } from './EcranAujourdhui.js';
import { EcranFinDeJournee } from './EcranFinDeJournee.js';
import { EcranPilote } from './EcranPilote.js';

// -----------------------------------------------------------------------------
// Chemins — depuis ce fichier, jamais depuis le répertoire courant.
// -----------------------------------------------------------------------------
const RACINE_FIELD = resolve(import.meta.dirname, '../../..');
const RACINE_DEPOT = resolve(RACINE_FIELD, '../..');
const RACINE_UI = resolve(RACINE_DEPOT, 'packages/ui/src');
const DOSSIERS_L5C = [
  resolve(RACINE_FIELD, 'src/ecrans/journee'),
  resolve(RACINE_FIELD, 'src/agenda'),
  resolve(RACINE_FIELD, 'src/sauvegarde'),
];

function lire(chemin: string): string {
  return readFileSync(chemin, 'utf8');
}

function fichiersSources(dossier: string): string[] {
  return readdirSync(dossier)
    .map((nom) => resolve(dossier, nom))
    .filter((chemin) => statSync(chemin).isFile())
    .filter((chemin) => /\.(tsx?|css)$/.test(chemin) && !/\.test\.tsx?$/.test(chemin));
}

/** Retire les commentaires CSS et JS/TS (blocs et lignes). */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// -----------------------------------------------------------------------------
// Les JETONS — lus dans `tokens.css`, résolus en pixels quand ce sont des tailles.
// -----------------------------------------------------------------------------
const TOKENS_CSS = lire(resolve(RACINE_UI, 'tokens.css'));
const BASE_PX = 16;

function jetonsDefinis(): Map<string, string> {
  const jetons = new Map<string, string>();
  for (const m of sansCommentaires(TOKENS_CSS).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    jetons.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  return jetons;
}

/** `44px` → 44 ; `2.75rem` → 44 ; `var(--x)` → valeur de x ; sinon `null`. */
function enPixels(valeur: string, jetons: Map<string, string>, profondeur = 0): number | null {
  if (profondeur > 5) return null;
  const v = valeur.trim();
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (ref !== null) {
    const cible = jetons.get(ref[1] ?? '');
    return cible === undefined ? null : enPixels(cible, jetons, profondeur + 1);
  }
  const px = /^([\d.]+)px$/.exec(v);
  if (px !== null) return Number(px[1]);
  const rem = /^([\d.]+)rem$/.exec(v);
  if (rem !== null) return Number(rem[1]) * BASE_PX;
  const calc = /^calc\(\s*var\((--[a-z0-9-]+)\)\s*\*\s*([\d.]+)\s*\)$/.exec(v);
  if (calc !== null) {
    const base = enPixels(`var(${calc[1] ?? ''})`, jetons, profondeur + 1);
    return base === null ? null : base * Number(calc[2]);
  }
  return null;
}

// -----------------------------------------------------------------------------
// Les RÈGLES `min-height` — sélecteur simple → pixels résolus.
// -----------------------------------------------------------------------------
interface RegleHauteur {
  /** Classe portée par l'élément lui-même. */
  readonly classe: string;
  /** Pour `.parent > *` : la classe du PARENT. */
  readonly parent: string | null;
  readonly pixels: number | null;
}

function reglesMinHeight(css: string, jetons: Map<string, string>): RegleHauteur[] {
  const regles: RegleHauteur[] = [];
  for (const bloc of sansCommentaires(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declaration = /min-height\s*:\s*([^;]+);/.exec(bloc[2] ?? '');
    if (declaration === null) continue;
    const pixels = enPixels(declaration[1] ?? '', jetons);
    for (const selecteur of (bloc[1] ?? '').split(',')) {
      const s = selecteur.trim();
      const enfant = /^\.([a-z0-9_-]+)\s*>\s*\*$/i.exec(s);
      if (enfant !== null) {
        regles.push({ classe: '*', parent: enfant[1] ?? '', pixels });
        continue;
      }
      const simple = /^\.([a-z0-9_-]+)(?::[a-z-]+(?:\([^)]*\))?)*$/i.exec(s);
      if (simple !== null) regles.push({ classe: simple[1] ?? '', parent: null, pixels });
    }
  }
  return regles;
}

const CIBLE_MIN_PX = 44;

/** La hauteur minimale que les feuilles garantissent à cet élément, ou `null`. */
function hauteurGarantie(element: Element, regles: readonly RegleHauteur[]): number | null {
  let meilleure: number | null = null;
  const considerer = (px: number | null): void => {
    if (px !== null && (meilleure === null || px > meilleure)) meilleure = px;
  };
  // ① l'élément lui-même, par ses classes.
  for (const classe of element.classList) {
    for (const regle of regles) {
      if (regle.parent === null && regle.classe === classe) considerer(regle.pixels);
    }
  }
  // ② `.parent > *` : le parent direct porte la classe.
  const parent = element.parentElement;
  if (parent !== null) {
    for (const classe of parent.classList) {
      for (const regle of regles) {
        if (regle.parent === classe) considerer(regle.pixels);
      }
    }
  }
  // ③ une case à cocher vit DANS son `label` (la cible tactile est le label).
  const label = element.closest('label');
  if (label !== null && label !== element) {
    for (const classe of label.classList) {
      for (const regle of regles) {
        if (regle.parent === null && regle.classe === classe) considerer(regle.pixels);
      }
    }
  }
  return meilleure;
}

function elementsInteractifs(): Element[] {
  return [
    ...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
  ].filter((e) => e.getAttribute('type') !== 'hidden');
}

// -----------------------------------------------------------------------------
// Le harnais d'écran — le même que les autres fichiers de cet incrément.
// -----------------------------------------------------------------------------
const INSTANT = '2026-09-05T12:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f5f1';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000000c5f1';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

const bases: BaseLocale[] = [];
let compteur = 0;

async function baseEmbarquee(options: { readonly sessionEnCours: boolean }): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-multi-appareils-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: UNITE_ID,
          missionId: MISSION_ID,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 5,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: INSTANT,
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);
  for (const status of ['termine', options.sessionEnCours ? 'en_cours' : 'non_demarre'] as const) {
    await ecrireLocal({
      entite: 'interview',
      id: uuidv7(),
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        orgUnitId: UNITE_ID,
        kind: 'entretien',
        status,
        scheduleStatus: 'planifie',
        scheduledAt: INSTANT,
      },
      charge: {
        conductedBy: AUDITEUR_ID,
        mode: 'sur_site',
        personName: `Personne fictive ${status}`,
        personRole: 'Fonction fictive',
        personServiceId: null,
        personEmail: null,
        participants: null,
        generalNotes: null,
        linkedReviewAnswerId: null,
        documentRequestId: null,
        consentGiven: status !== 'non_demarre',
        consentAudio: false,
        consentedAt: null,
        informationNoticeVersion: null,
        noticeShownAt: null,
        scheduledDurationMin: 45,
        startedAt: status === 'non_demarre' ? null : INSTANT,
        endedAt: status === 'termine' ? INSTANT : null,
        valideeLe: null,
        clientCreatedAt: INSTANT,
      },
    });
  }
  return base;
}

function terrainDeBase(base: BaseLocale, sessionActive: boolean): ValeurTerrain {
  const delai = (sessionActive ? 60 : 15) * 60 * 1000;
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: delai,
      ecranMaintenuEveille: sessionActive,
      msAvantVerrouillage: () => delai,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui'] },
    vue: 'aujourdhui',
    stockage: {
      persistant: true,
      quotaOctets: 10 * 1024 ** 3,
      utiliseOctets: 1024 ** 3,
      ratio: 0.1,
      niveau: 'ok',
    },
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

const ECRANS = [
  { nom: 'EcranAujourdhui', Composant: EcranAujourdhui },
  { nom: 'EcranAgenda', Composant: EcranAgenda },
  { nom: 'EcranPilote', Composant: EcranPilote },
  { nom: 'EcranFinDeJournee', Composant: EcranFinDeJournee },
] as const;

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(32), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  vi.useRealTimers();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. CIBLES TACTILES ≥ 44 px (03 §22.1) — mesurées sur le contrat DOM ↔ CSS
// ─────────────────────────────────────────────────────────────────────────────
describe('tactile ≥ 44 px — chaque élément interactif des quatre écrans', () => {
  const jetons = jetonsDefinis();
  const regles = [
    ...reglesMinHeight(lire(resolve(RACINE_UI, 'composants.css')), jetons),
    ...reglesMinHeight(lire(resolve(RACINE_FIELD, 'src/ecrans/journee/journee.css')), jetons),
    ...reglesMinHeight(lire(resolve(RACINE_FIELD, 'src/app/coquille.css')), jetons),
  ];

  it('le jeton de cible tactile vaut EXACTEMENT 44 px, et le contrôle standard l’atteint (2,75 rem)', () => {
    expect(enPixels('var(--taille-cible-tactile-min)', jetons)).toBe(CIBLE_MIN_PX);
    expect(enPixels('var(--taille-controle-hauteur)', jetons)).toBeGreaterThanOrEqual(CIBLE_MIN_PX);
    expect(enPixels('var(--taille-controle-hauteur-large)', jetons)).toBeGreaterThanOrEqual(
      CIBLE_MIN_PX,
    );
  });

  it('contrôle d’anti-vacuité : le lecteur de règles trouve les règles connues, et refuse une classe inconnue', () => {
    expect(regles.length).toBeGreaterThan(5);
    const bouton = document.createElement('button');
    bouton.className = 'axn-bouton';
    expect(hauteurGarantie(bouton, regles)).toBe(CIBLE_MIN_PX);
    const inconnu = document.createElement('button');
    inconnu.className = 'classe-inventee-par-a27';
    expect(hauteurGarantie(inconnu, regles)).toBeNull();
  });

  for (const { nom, Composant } of ECRANS) {
    it(`@critique ${nom} : aucun élément interactif sous 44 px — chacun nommé s’il manque`, async () => {
      const base = await baseEmbarquee({ sessionEnCours: true });
      terrain = terrainDeBase(base, true);
      render(<Composant />);
      await waitFor(() => {
        expect(estOccupe()).toBe(false);
      });
      // L'agenda : les unités arrivent par une seconde requête.
      if (nom === 'EcranAgenda') {
        await waitFor(() => {
          expect(document.querySelectorAll('select').length).toBeGreaterThan(0);
        });
      }
      const elements = elementsInteractifs();
      expect(
        elements.length,
        'un écran sans aucun élément interactif ne prouve rien',
      ).toBeGreaterThan(0);
      const fautifs = elements
        .map((e) => ({ e, px: hauteurGarantie(e, regles) }))
        .filter(({ px }) => px === null || px < CIBLE_MIN_PX)
        .map(
          ({ e, px }) =>
            `<${e.tagName.toLowerCase()} class="${e.className}"> « ${e.textContent.trim().slice(0, 40)} » : ${px === null ? 'aucune règle' : `${String(px)} px`}`,
        );
      expect(fautifs, fautifs.join('\n')).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B. AUCUN JETON INVENTÉ, AUCUNE VALEUR EN DUR (invariant 4)
// ─────────────────────────────────────────────────────────────────────────────
describe('invariant 4 — les sources L5c ne consomment que des jetons qui EXISTENT', () => {
  const jetons = jetonsDefinis();
  const fichiers = DOSSIERS_L5C.flatMap(fichiersSources);

  function jetonsConsommes(source: string): string[] {
    return [...sansCommentaires(source).matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1] ?? '');
  }

  it('balaie un inventaire NON VIDE, qui contient bien les quatre écrans et la feuille de style', () => {
    expect(fichiers.length).toBeGreaterThan(10);
    expect(fichiers.some((f) => f.endsWith('journee.css'))).toBe(true);
    expect(fichiers.some((f) => f.endsWith('EcranFinDeJournee.tsx'))).toBe(true);
  });

  it('@critique chaque `var(--jeton)` des sources L5c est DÉFINI dans `tokens.css` (A23 en avait inventé quatre ; il ne doit plus en rester)', () => {
    const manquants: string[] = [];
    let total = 0;
    for (const fichier of fichiers) {
      for (const jeton of jetonsConsommes(lire(fichier))) {
        total += 1;
        if (!jetons.has(jeton)) manquants.push(`${fichier.replace(RACINE_DEPOT, '')} → ${jeton}`);
      }
    }
    expect(total, 'aucun jeton consommé : le balayage serait vide de sens').toBeGreaterThan(20);
    expect(manquants, manquants.join('\n')).toEqual([]);
  });

  it('contrôle d’anti-vacuité : un jeton inventé est bien vu comme manquant', () => {
    const faux = jetonsConsommes('.x { color: var(--jeton-invente-par-a27); }');
    expect(faux).toEqual(['--jeton-invente-par-a27']);
    expect(jetons.has('--jeton-invente-par-a27')).toBe(false);
  });

  it('@critique `journee.css` n’écrit ni couleur hexadécimale, ni fonction de couleur, ni longueur absolue', () => {
    const css = sansCommentaires(lire(resolve(RACINE_FIELD, 'src/ecrans/journee/journee.css')));
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch|color-mix)\(/i);
    // Les longueurs absolues : toute valeur `Npx`/`Npt`/`Nmm` autre que 0.
    expect(css.match(/\b(?!0)\d+(?:\.\d+)?(px|pt|mm|cm|in)\b/g) ?? []).toEqual([]);
    // Et elle ne DÉFINIT aucun jeton : elle ne fait que les consommer.
    expect(css).not.toMatch(/^\s*--[a-z0-9-]+\s*:/m);
  });

  it('@critique aucun écran L5c ne porte de style en ligne avec une couleur ou une taille', () => {
    for (const fichier of fichiers.filter((f) => f.endsWith('.tsx'))) {
      const source = sansCommentaires(lire(fichier));
      expect(source, fichier).not.toMatch(/style=\{\{/);
      expect(source, fichier).not.toMatch(/#[0-9a-f]{6}\b/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. POLICE AUTO-HÉBERGÉE (03 §33.1, 11 §1) — aucun CDN, précachée
// ─────────────────────────────────────────────────────────────────────────────
describe('police auto-hébergée — rendue sans réseau', () => {
  it('@critique `polices.css` charge Inter depuis `@fontsource-variable/inter`, par des URL RELATIVES — jamais http(s), jamais Google Fonts', () => {
    const css = sansCommentaires(lire(resolve(RACINE_UI, 'polices.css')));
    const sources = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1] ?? '');
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const src of sources) {
      expect(src).toMatch(/^@fontsource-variable\/inter\//);
      expect(src).not.toMatch(/^https?:|^\/\//);
    }
    expect(css).not.toMatch(/googleapis|gstatic|typekit|fonts\.bunny/i);
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
  });

  it('@critique `index.html` de l’app terrain ne référence AUCUNE ressource externe (police ou autre)', () => {
    const html = lire(resolve(RACINE_FIELD, 'index.html'));
    const hrefs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((m) => m[1] ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).not.toMatch(/^https?:|^\/\//);
    }
    expect(html).not.toMatch(/googleapis|gstatic|preconnect/i);
  });

  it('@critique le précache du service worker inclut les `.woff2` et EXCLUT `/api` (LOT_L5.md §3.1)', () => {
    const construction = sansCommentaires(lire(resolve(RACINE_FIELD, 'scripts/build-sw.mjs')));
    expect(construction).toMatch(/woff2/);
    // Source BRUTE ici : le motif `/^\/api\//` contient `//`, qu'un retrait de
    // commentaires prendrait pour une ligne à effacer. Les mentions en commentaire
    // de `StaleWhileRevalidate` sont exclues par la seconde lecture, épurée.
    const swBrut = lire(resolve(RACINE_FIELD, 'sw/service-worker.ts'));
    expect(swBrut).toMatch(/denylist:\s*\[\s*\/\^\\\/api\\\/\/\s*\]/);
    const swCode = swBrut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(swCode).not.toMatch(/StaleWhileRevalidate|NetworkFirst|CacheFirst/);
    expect(swCode).toMatch(/precacheAndRoute\(self\.__WB_MANIFEST\)/);
  });

  it('les jetons typographiques nomment Inter Variable avec un repli système', () => {
    const jetons = jetonsDefinis();
    const police = jetons.get('--typo-police-corps') ?? '';
    expect(police).toMatch(/Inter Variable/);
    expect(police).toMatch(/system-ui/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. AUCUN VERROU EN SESSION ACTIVE DE 45 MIN (03 §33.7) — les écrans L5c montés
// ─────────────────────────────────────────────────────────────────────────────
describe('aucun verrou en session active de 45 min — les écrans L5c ne verrouillent rien d’eux-mêmes', () => {
  // La RÈGLE du verrou (15/60 min) est prouvée sur `useVerrou` par
  // `app/verrou.test.tsx` (L5a, @critique « UNE SESSION ACTIVE DE 45 MIN NE SE
  // VERROUILLE JAMAIS »). Ce que ce fichier ajoute : montés avec une session en
  // cours et 45 min de temps SIMULÉ, aucun des quatre écrans de L5c n'appelle
  // le verrou, ne ferme le coffre, ni ne navigue vers le déverrouillage — et
  // aucun n'importe `verrou.ts`. Un écran qui verrouillerait « pour la sécurité »
  // serait exactement le verrou que §33.7 interdit.
  it('@critique aucun écran L5c n’importe le verrou ni ne ferme le coffre', () => {
    for (const fichier of fichiersSources(resolve(RACINE_FIELD, 'src/ecrans/journee'))) {
      const source = sansCommentaires(lire(fichier));
      expect(source, fichier).not.toMatch(/verrou\.js|verrouillerMaintenant|fermer\(\)/);
      expect(source, fichier).not.toMatch(/vue:\s*'deverrouillage'/);
    }
  });

  for (const { nom, Composant } of ECRANS) {
    it(`@critique ${nom} monté 45 min avec une session en cours : ni verrou, ni fermeture, ni navigation`, async () => {
      const base = await baseEmbarquee({ sessionEnCours: true });
      terrain = terrainDeBase(base, true);
      render(<Composant />);
      await waitFor(() => {
        expect(estOccupe()).toBe(false);
      });
      // Minuteries et horloge SIMULÉES — pas les micro-tâches ni `setImmediate`,
      // dont Dexie et fake-indexeddb ont besoin pour répondre.
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45 * 60 * 1000);
      });
      vi.useRealTimers();
      expect(terrain.verrou.verrouillerMaintenant).not.toHaveBeenCalled();
      expect(terrain.fermer).not.toHaveBeenCalled();
      expect(terrain.naviguer).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')?.textContent ?? '').not.toMatch(/verrou|mot de passe/i);
    });
  }
});
