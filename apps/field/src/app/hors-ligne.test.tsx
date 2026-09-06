// =============================================================================
// LE QUATRIÈME ÉTAT, SUR LES ONZE VUES — §33.2, seconde moitié
//
// ── DÉCLARATION DE CROISEMENT (09 §5.6), FAITE AVANT LES ASSERTIONS ─────────
// Ce fichier est écrit par A21, qui a aussi posé le branchement qu'il mesure. Il
// vaut comme preuve de NON-RÉGRESSION, pas comme revue croisée — celle-ci reste
// due à A29. C'est la même déclaration qu'A28 a faite pour `RappelHorsLigne`, et
// pour la même raison : le dire est plus utile que de le taire.
//
// ── CE QUE CE FICHIER TIENT, ET QU'AUCUN TEST D'ÉCRAN NE PEUT TENIR ─────────
// Le contrôle A02 de P-C a mesuré 3 vues sur 11 rendant le rappel des capacités
// locales. Le défaut n'était pas dans un écran : il était dans le fait que
// PERSONNE ne comptait les onze. Onze tests d'écran, chacun vert chez lui,
// laissent passer exactement ce défaut-là — et le laisseront passer à nouveau au
// douzième écran.
//
// Ce fichier compte, et il compte depuis le REGISTRE (`VUES`) :
//   · `satisfies Record<CodeVue, …>` sur sa propre table d'écrans — une vue
//     ajoutée à `vues.ts` ne compile pas ici tant qu'elle n'y est pas entrée ;
//   · chaque source d'écran est lue : elle doit brancher `RappelHorsLigne` sur
//     SA clé de capacités, pas sur celle du voisin ;
//   · dix des onze écrans sont RÉELLEMENT montés, hors ligne puis en ligne. Le
//     onzième (`entretien`) l'est dans `ecrans/entretien/EcranEntretien.test.tsx`,
//     où vit déjà son harnais — et où se mesure sa garde propre, le mode écran
//     partagé.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E44 (UX/UI 2026-2027 —
// grille §33, les quatre états), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentType } from 'react';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { jetonsDeRecherche } from '../local/formes.js';
import { memoriserIdentiteAuditeur } from '../session/auditeur.js';
import { memoriserQuestionCourante, memoriserSessionCourante } from '../session/position.js';
import { App } from '../App.js';
import { EcranNouvelEntretien } from '../ecrans/entretien/EcranNouvelEntretien.js';
import { EcranAgenda } from '../ecrans/journee/EcranAgenda.js';
import { EcranAujourdhui } from '../ecrans/journee/EcranAujourdhui.js';
import { EcranFinDeJournee } from '../ecrans/journee/EcranFinDeJournee.js';
import { EcranFinDeSession } from '../ecrans/journee/EcranFinDeSession.js';
import { EcranPilote } from '../ecrans/journee/EcranPilote.js';
import { EcranRestauration } from '../ecrans/journee/EcranRestauration.js';
import { CAPACITES_HORS_LIGNE } from './capacites-hors-ligne.js';
import type { ValeurTerrain } from './contexte.js';
import { EcranAccueil } from './EcranAccueil.js';
import { EcranDeverrouillage } from './EcranDeverrouillage.js';
import { EcranStockage } from './EcranStockage.js';
import { VUES, type CodeVue } from './vues.js';

const RACINE_SRC = resolve(import.meta.dirname, '..');

// -----------------------------------------------------------------------------
// La table des écrans — le point où l'oubli devient une erreur de COMPILATION.
// -----------------------------------------------------------------------------
interface Ecran {
  /** Le composant, ou `null` quand il est monté dans son propre fichier. */
  readonly Composant: ComponentType | null;
  /** Sa source, relative à `apps/field/src`. */
  readonly source: string;
}

const ECRANS = {
  deverrouillage: { Composant: EcranDeverrouillage, source: 'app/EcranDeverrouillage.tsx' },
  stockage: { Composant: EcranStockage, source: 'app/EcranStockage.tsx' },
  accueil: { Composant: EcranAccueil, source: 'app/EcranAccueil.tsx' },
  nouvelEntretien: {
    Composant: EcranNouvelEntretien,
    source: 'ecrans/entretien/EcranNouvelEntretien.tsx',
  },
  // Monté par `ecrans/entretien/EcranEntretien.test.tsx` : son harnais y vit
  // déjà (session, questions, réponses), et c'est là que se mesure sa garde
  // propre — rien d'interne ne s'affiche en mode écran partagé.
  entretien: { Composant: null, source: 'ecrans/entretien/EcranEntretien.tsx' },
  aujourdhui: { Composant: EcranAujourdhui, source: 'ecrans/journee/EcranAujourdhui.tsx' },
  agenda: { Composant: EcranAgenda, source: 'ecrans/journee/EcranAgenda.tsx' },
  pilote: { Composant: EcranPilote, source: 'ecrans/journee/EcranPilote.tsx' },
  finDeJournee: { Composant: EcranFinDeJournee, source: 'ecrans/journee/EcranFinDeJournee.tsx' },
  restauration: { Composant: EcranRestauration, source: 'ecrans/journee/EcranRestauration.tsx' },
  finDeSession: { Composant: EcranFinDeSession, source: 'ecrans/journee/EcranFinDeSession.tsx' },
} as const satisfies Record<CodeVue, Ecran>;

const CODES = Object.keys(ECRANS) as readonly CodeVue[];

// -----------------------------------------------------------------------------
// Le harnais — celui des autres fichiers de L5, réduit à ce qui est nécessaire.
// -----------------------------------------------------------------------------
const INSTANT = '2026-09-06T12:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-0000000a1f5f';
const UNITE_ID = '0191e2a0-0000-7000-8000-0000000a1c5f';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000a1e01';
const QUESTION_ID = '0191e2a0-0000-7000-8000-0000000a1401';
const TEXTE_QUESTION = 'Question fictive — la collecte fonctionne-t-elle sans réseau ?';
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('./contexte.js', () => ({
  useTerrain: () => terrain,
}));

const bases: BaseLocale[] = [];
let compteur = 0;

async function baseEmbarquee(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-hors-ligne-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  // L'IDENTITÉ DE L'AUDITEUR — ajoutée le 2026-09-06 (revue A29, réserve ④).
  // Sans elle, `EcranNouvelEntretien` rend son état d'ERREUR (« Auditeur inconnu
  // sur cet appareil », zéro bouton) : le rappel étant posé hors de la
  // `ZoneEtat`, le cas passait au vert en mesurant un écran que l'auditeur ne
  // voit jamais ainsi. Un test vert sur l'état d'erreur d'un écran n'éprouve pas
  // son branchement nominal — et c'était précisément la vue dont la capacité
  // était fausse. On ne fabrique pas un propriétaire de session (05 §9.9) : on
  // sème celui que le harnais des autres fichiers de L5 sème déjà.
  await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'guide_strict' });
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
          companyId: '0191e2a0-0000-7000-8000-0000000a1ccc',
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
      // Une question FIGÉE : sans elle, l'écran d'entretien rend son état vide,
      // et la mesure des pastilles ci-dessous ne prouverait rien — c'est dans le
      // bloc NOMINAL que la pastille retirée par B6 vivait.
      {
        table: 'missionQuestions',
        index: {
          id: QUESTION_ID,
          missionId: MISSION_ID,
          position: 1,
          texteSnapshot: TEXTE_QUESTION,
          motsCles: jetonsDeRecherche(TEXTE_QUESTION),
          answerType: 'yes_no',
          criticality: 'important',
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          questionId: '0191e2a0-0000-7000-8000-0000000a1401',
          questionVersion: 1,
          guidanceSnapshot: null,
          optionsSnapshot: null,
          scoringSnapshot: null,
          weightSnapshot: 1,
          allowRangeSnapshot: false,
          addedAdHoc: false,
          blockCode: 'bloc_fictif',
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);

  const sessionId = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id: sessionId,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'planifie',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
      personRole: 'Fonction fictive',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: INSTANT,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
  // `EcranFinDeSession` et `EcranEntretien` lisent la session COURANTE — et la
  // question courante. Sans elles, ils rendent leur état vide, et l'on mesurerait
  // des écrans que l'auditeur ne voit jamais ainsi.
  await memoriserSessionCourante(base, sessionId);
  await memoriserQuestionCourante(base, sessionId, QUESTION_ID);
  return base;
}

function terrainSur(base: BaseLocale | null, vue: CodeVue): ValeurTerrain {
  return {
    phase: vue === 'deverrouillage' ? 'verrouille' : 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: vue === 'deverrouillage',
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: [vue] },
    vue,
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

function reglerEnLigne(valeur: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valeur });
}

/** Le bloc de rappel, ou `null`. C'est LA chose que §33.2 réclamait. */
function rappel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.axn-rappel-hors-ligne');
}

function capacitesRendues(): readonly string[] {
  const bloc = rappel();
  if (bloc === null) return [];
  return [...bloc.querySelectorAll('li')].map((li) => li.textContent);
}

/** Monte l'écran et attend qu'aucune zone ne soit plus « occupée ». */
async function monter(Composant: ComponentType, vue: CodeVue): Promise<void> {
  const base = vue === 'deverrouillage' || vue === 'stockage' ? null : await baseEmbarquee();
  terrain = terrainSur(base, vue);
  render(<Composant />);
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(21), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  Reflect.deleteProperty(navigator, 'onLine');
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LE REGISTRE ET LES CAPACITÉS — aucune vue sans les siennes
// ─────────────────────────────────────────────────────────────────────────────
describe('capacités hors ligne — une liste par vue du registre, et rien qui promette à faux', () => {
  it('contrôle d’anti-vacuité : la table compte bien les ONZE vues du registre', () => {
    expect(CODES.length).toBe(Object.keys(VUES).length);
    expect(CODES.length).toBe(11);
    expect(Object.keys(CAPACITES_HORS_LIGNE).sort()).toEqual([...CODES].sort());
  });

  for (const code of CODES) {
    it(`${code} : des capacités énumérables, en français, sans doublon ni promesse de capture`, () => {
      const capacites: readonly string[] = CAPACITES_HORS_LIGNE[code];
      expect(capacites.length, 'une liste vide laisse croire qu’il faut attendre').toBeGreaterThan(
        0,
      );
      expect(new Set(capacites).size, 'deux fois la même ligne').toBe(capacites.length);
      for (const capacite of capacites) {
        // Une phrase, pas une étiquette : elle est lue debout, dans un couloir.
        expect(capacite.length).toBeGreaterThan(15);
        // Invariant 5 — aucun mot d'interface anglais résiduel.
        expect(/\b(?:offline|pending|loading|retry|sync|backup)\b/i.exec(capacite)).toBeNull();
        // B3 — le produit ne promet pas la capture photo tant qu'elle n'existe pas.
        expect(/photo|photographi/i.exec(capacite)).toBeNull();
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LE BRANCHEMENT, LU DANS LES SOURCES — chaque écran sur SA clé
// ─────────────────────────────────────────────────────────────────────────────
describe('branchement — les onze sources rendent le rappel, chacune avec ses capacités', () => {
  const lues = new Map<CodeVue, string>(
    CODES.map((code) => [code, readFileSync(resolve(RACINE_SRC, ECRANS[code].source), 'utf8')]),
  );

  it('contrôle d’anti-vacuité : les onze sources sont lues, et ne sont pas vides', () => {
    expect(lues.size).toBe(11);
    for (const [code, source] of lues) {
      expect(source.length, code).toBeGreaterThan(500);
    }
  });

  for (const code of CODES) {
    it(`${code} : importe \`RappelHorsLigne\` et le branche sur \`CAPACITES_HORS_LIGNE.${code}\``, () => {
      const source = lues.get(code) ?? '';
      expect(source).toContain('RappelHorsLigne');
      expect(source).toContain(`CAPACITES_HORS_LIGNE.${code}`);
      // Le RAPPEL ne rend pas de pastille : la coquille en porte une (décision
      // A01 du 2026-09-05). CE QUE CETTE LIGNE NE DIT PAS — et disait à tort
      // jusqu'au 2026-09-06 (revue A29, réserve ③) : elle n'interdit pas à
      // l'écran d'en rendre une AILLEURS. C'est le comptage du bloc D qui le
      // mesure, sur le DOM, coquille comprise. Un message qui promet plus que sa
      // requête donne le vert à ce qu'il prétend interdire.
      expect(source).toMatch(/avecPastille=\{(?:PASTILLE_PORTEE_PAR_LA_COQUILLE|false)\}/);
    });
  }

  it('CONTRE-ÉPREUVE : le motif cherché ne se trouve pas dans n’importe quelle source', () => {
    // Si l'assertion ci-dessus passait sur un fichier quelconque, elle ne
    // prouverait rien. `vues.ts` est une source réelle de l'application, et elle
    // ne branche évidemment aucun rappel.
    const registre = readFileSync(resolve(RACINE_SRC, 'app/vues.ts'), 'utf8');
    expect(registre).not.toContain('RappelHorsLigne');
  });

  it('plus AUCUN `ZoneEtat` de nature « hors-ligne » : le `<span />` factice a disparu', () => {
    // `ZoneEtat` IGNORE ses enfants sur cette nature — deux écrans lui passaient
    // donc un enfant bidon pour compiler. Le contournement n'a pas à survivre au
    // composant qui le rend inutile.
    for (const [code, source] of lues) {
      expect(source, code).not.toMatch(/nature:\s*'hors-ligne'/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LE RENDU RÉEL — dix écrans montés, hors ligne PUIS en ligne
// ─────────────────────────────────────────────────────────────────────────────
describe('rendu — hors réseau, chaque écran rappelle CE QU’IL sait faire', () => {
  for (const code of CODES) {
    const { Composant } = ECRANS[code];
    if (Composant === null) continue;

    it(`@critique ${code} : le rappel est rendu, avec ses capacités à lui`, async () => {
      reglerEnLigne(false);
      await monter(Composant, code);

      const bloc = rappel();
      expect(bloc, `${code} ne rend AUCUN rappel des capacités locales (§33.2)`).not.toBeNull();
      expect(capacitesRendues()).toEqual([...CAPACITES_HORS_LIGNE[code]]);

      // Hors ligne est le mode NOMINAL (invariant 1) : jamais une alerte.
      for (const alerte of screen.queryAllByRole('alert')) {
        expect(alerte.textContent).not.toMatch(/hors ligne|sans réseau/i);
      }
      // Et la pastille reste celle de l'en-tête : aucune région vivante ici.
      expect(bloc?.querySelector('[role="status"]')).toBeNull();
    });

    it(`${code} : EN LIGNE, le rappel se tait entièrement`, async () => {
      reglerEnLigne(true);
      await monter(Composant, code);
      expect(
        rappel(),
        `${code} affiche ses capacités locales alors que le réseau est là`,
      ).toBeNull();
      for (const capacite of CAPACITES_HORS_LIGNE[code]) {
        expect(document.body.textContent).not.toContain(capacite);
      }
    });
  }

  // Deux écrans remplacent la phrase d'introduction par défaut, parce que leur
  // contexte l'exige : celui d'avant le coffre, et celui d'une tablette de
  // remplacement. Une phrase par défaut y dirait « cet appareil sait encore » à
  // quelqu'un qui n'est pas encore entré, ou qui n'a pas encore ses données.
  it('l’introduction est celle de l’écran quand il en fournit une', async () => {
    reglerEnLigne(false);
    await monter(EcranDeverrouillage, 'deverrouillage');
    expect(rappel()?.textContent).toContain('Sans réseau, cet appareil reste utilisable :');
    cleanup();
    await monter(EcranRestauration, 'restauration');
    expect(rappel()?.textContent).toContain('Sans réseau, cette restauration reste possible :');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. UN FAIT, UNE SOURCE, UNE PASTILLE — le comptage que le bloc B ne fait pas
//
// AJOUTÉ le 2026-09-06 (revue A29, réserves ① et ③). Le bloc B lit les sources
// et vérifie que le RAPPEL ne rend pas de pastille. C'est vrai, et c'est
// insuffisant : deux écrans passaient cette lecture tout en rendant la leur
// ailleurs — `EcranEntretien` en particulier, dont A29 a mesuré, coquille
// complète et RÉSEAU PRÉSENT, « En attente de synchronisation · 4 en attente »
// dans l'en-tête et « Hors ligne · 5 en attente » trois centimètres plus bas.
// Deux états opposés, deux comptes du même fait. Le bloquant B6, resté ouvert
// sur cet écran parce que le geste du 2026-09-06 n'avait porté que sur l'accueil.
//
// Ce bloc compte donc les `.axn-pastille-sync` du DOCUMENT ENTIER, coquille
// comprise, dans les deux états du réseau. La table ci-dessous déclare, écran par
// écran, combien il en reste — et chaque valeur non nulle porte sa raison. Une
// pastille ajoutée quelque part fait rougir la vue concernée, nommément.
// ─────────────────────────────────────────────────────────────────────────────
describe('B6 — combien de pastilles l’auditeur voit-il réellement, coquille comprise', () => {
  /** Pastilles rendues par l'ÉCRAN seul (hors coquille), et leur raison. */
  const PASTILLES_DE_L_ECRAN = {
    // L'écran de déverrouillage est rendu HORS coquille : zéro pastille au total,
    // et c'est l'arbitrage de Williams du 2026-09-04, pas un oubli.
    deverrouillage: 0,
    stockage: 0,
    accueil: 0, // retirée par B6 le 2026-09-06 (recette novice A54).
    nouvelEntretien: 0,
    entretien: 0, // retirée le 2026-09-06 : c'était la TROISIÈME source (A29 ①).
    // Le cockpit rend une pastille PAR CARTE DE MISSION, contextualisée par la
    // mission qu'elle décrit — et toutes traduites par `etat-sync-affiche.ts`,
    // donc jamais en contradiction de mots avec l'en-tête. Le harnais sème UNE
    // mission : une pastille. A29 l'a examiné et l'a jugé acceptable ; il est
    // déclaré ici plutôt que toléré en silence.
    aujourdhui: 1,
    agenda: 0,
    pilote: 0,
    finDeJournee: 0,
    restauration: 0,
    finDeSession: 0,
  } as const satisfies Record<CodeVue, number>;

  function pastilles(): readonly string[] {
    return [...document.querySelectorAll('.axn-pastille-sync')].map((p) => p.textContent.trim());
  }

  for (const code of CODES) {
    const { Composant } = ECRANS[code];
    if (Composant === null) continue;

    for (const enLigne of [true, false]) {
      it(`@critique ${code} (réseau ${enLigne ? 'présent' : 'absent'}) : l’écran seul rend ${String(PASTILLES_DE_L_ECRAN[code])} pastille(s)`, async () => {
        reglerEnLigne(enLigne);
        await monter(Composant, code);
        const vues = pastilles();
        expect(vues.length, `pastilles rendues : ${vues.join(' | ')}`).toBe(
          PASTILLES_DE_L_ECRAN[code],
        );
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LA MESURE D'A29, REJOUÉE — la coquille COMPLÈTE, sur l'écran d'entretien
//
// Les blocs précédents montent les écrans SANS `App` : ils ne peuvent donc pas
// voir la pastille de l'en-tête, et c'est exactement l'angle mort qui a laissé
// B6 ouvert sur cette vue. Ce bloc monte la coquille entière, à l'endroit et
// dans l'état où A29 a relevé les deux pastilles contradictoires.
// ─────────────────────────────────────────────────────────────────────────────
describe('B6 — l’écran d’entretien dans la coquille : une seule pastille, un seul compte', () => {
  async function monterCoquille(vue: CodeVue): Promise<void> {
    const base = await baseEmbarquee();
    terrain = terrainSur(base, vue);
    render(<App />);
    // Attendre le CONTENU, pas la pastille : celle de l'en-tête paraît avant que
    // l'entretien soit lu, et l'on compterait alors les pastilles d'un écran
    // encore en chargement — donc d'un écran où celle qu'on traque n'est pas
    // ENCORE rendue. Mesuré : sans cette attente, le cas se lit sur « Ouverture
    // de l'entretien… ». Un test qui mesure trop tôt est un test qui ment.
    await waitFor(() => {
      expect(document.body.textContent).toContain(TEXTE_QUESTION);
    });
  }

  for (const enLigne of [true, false]) {
    it(`@critique réseau ${enLigne ? 'PRÉSENT' : 'absent'} : UNE pastille sur la vue « entretien », jamais deux qui se contredisent`, async () => {
      reglerEnLigne(enLigne);
      await monterCoquille('entretien');

      const vues = [...document.querySelectorAll('.axn-pastille-sync')].map((p) =>
        p.textContent.trim(),
      );
      expect(
        vues.length,
        `A29 en a mesuré DEUX ici le 2026-09-06 — trouvé : ${vues.join(' | ')}`,
      ).toBe(1);
      // Un seul compte affiché, donc aucun « n en attente » contradictoire.
      expect(
        [...document.querySelectorAll('.axn-pastille-sync__compte')].length,
      ).toBeLessThanOrEqual(1);
      // Et le contenu de l'entretien est bien rendu : sans lui, ce test
      // compterait les pastilles d'un écran vide et ne prouverait rien.
      expect(document.body.textContent).toContain(TEXTE_QUESTION);
    }, 20_000);
  }
});
