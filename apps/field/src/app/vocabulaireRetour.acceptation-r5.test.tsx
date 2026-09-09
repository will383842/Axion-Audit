// =============================================================================
// R5 — « ON REVIENT », ET DEUX BOUTONS NE PORTENT JAMAIS LE MÊME NOM
// Écrit par A26 le 2026-09-09, sur réserve R4 de la revue croisée A29
// (09 §5.6 : A22 a posé la règle en renommant les libellés, il n'écrit pas ce
// qui la garde). Depuis 03 §33.6 (« libellés explicites sur toute icône seule »,
// aucune information portée par la seule couleur), 03 §17.6 et §17.4
// (vocabulaire métier constant, jamais deux mots pour un geste).
//
// ── LA RÈGLE, ÉCRITE PAR A22 DANS SON COMMIT R5 ─────────────────────────────
//   « On REVIENT — le verbe, jamais le nom. Le bouton de la coquille dit
//     "Revenir" ; un bouton de retour DANS un écran nomme sa destination
//     ("Revenir à ma journée", "Revenir à l'accueil", "Revenir à la collecte"),
//     parce qu'il coexiste avec celui de la coquille et qu'il ne doit pas porter
//     le même nom. »
//
// ── POURQUOI CETTE RÈGLE N'ÉTAIT GARDÉE PAR RIEN ────────────────────────────
// A29 a vérifié À LA MAIN, écran par écran, que le dépôt la respecte AUJOURD'HUI.
// C'est vrai, et ça ne vaut que pour aujourd'hui : un quatorzième écran peut
// réintroduire un « Revenir » nu en silence. Et ce n'est pas une hypothèse —
// c'est ce qu'A22 a FAIT en renommant le bouton de la coquille : quatre écrans
// se sont retrouvés avec deux boutons de même nom à un centimètre l'un de
// l'autre. Seule L'EXÉCUTION l'a révélé (`App.recette-b2` : « Found multiple
// elements »), et par accident : aucun test ne cherchait cela.
//
// Un lecteur d'écran entend deux fois la même chose et ne peut pas les
// distinguer. L'ambiguïté n'était pas dans le test, elle était dans l'écran.
//
// ── DEUX COUCHES, PARCE QU'AUCUNE SEULE NE FERME LE SUJET ───────────────────
//   ① LE RENDU — chaque vue montée DANS LA COQUILLE, avec une pile PROFONDE,
//      donc avec le « Revenir » de l'en-tête RÉELLEMENT présent : c'est la
//      configuration exacte où le défaut d'A22 est apparu. On récolte les NOMS
//      ACCESSIBLES de tous les boutons de la page, et l'on exige qu'ils soient
//      deux à deux distincts. C'est ce qu'entend un lecteur d'écran, pas ce que
//      le code déclare.
//   ② LA SOURCE — la couche ① ne peut pas monter `entretien` (son harnais vit
//      dans `EcranEntretien.test.tsx` : session, questions, réponses). Le mot
//      « Revenir » nu y serait donc invisible. Une lecture des sources ferme ce
//      trou : hors `App.tsx`, aucun composant de production ne rend un bouton
//      dont le texte entier est « Revenir » — ni « Retour », le nom qu'A22 a
//      écarté. C'est un contrôle lexical, il est plus faible que le rendu, et
//      c'est dit ici plutôt que caché.
//
// La table des vues porte `satisfies Record<CodeVue, …>` : une quatorzième vue
// NE COMPILE PAS tant qu'elle n'a pas sa ligne. C'est la méthode d'A21 et d'A28,
// reprise parce qu'elle est la seule qui ait déjà tiré — deux fois.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min) · E27 (design / WCAG AA)
// · E44 (UX/UI 2026-2027 — grille §33).
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Dexie from 'dexie';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { uuidv7 } from 'uuidv7';
import { App } from '../App.js';
import type * as ModuleContexte from './contexte.js';
import type { ValeurTerrain } from './contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { memoriserIdentiteAuditeur } from '../session/auditeur.js';
import { memoriserSessionCourante } from '../session/position.js';
import { EcranAccueil } from './EcranAccueil.js';
import { EcranDeverrouillage } from './EcranDeverrouillage.js';
import { EcranStockage } from './EcranStockage.js';
import { EcranAgenda } from '../ecrans/journee/EcranAgenda.js';
import { EcranARevoir } from '../ecrans/journee/EcranARevoir.js';
import { EcranAujourdhui } from '../ecrans/journee/EcranAujourdhui.js';
import { EcranFinDeJournee } from '../ecrans/journee/EcranFinDeJournee.js';
import { EcranFinDeSession } from '../ecrans/journee/EcranFinDeSession.js';
import { EcranPilote } from '../ecrans/journee/EcranPilote.js';
import { EcranRestauration } from '../ecrans/journee/EcranRestauration.js';
import { EcranNouvelEntretien } from '../ecrans/entretien/EcranNouvelEntretien.js';
import { EcranConnexion } from '../siege/EcranConnexion.js';
import { VUES, type CodeVue } from './vues.js';

// -----------------------------------------------------------------------------
// LA TABLE DES VUES — engendrée depuis le registre, pas recopiée
// -----------------------------------------------------------------------------
interface VueMontable {
  /** `null` = non montable ici ; la couche ② la couvre, et le dit. */
  readonly Composant: ComponentType | null;
}

const VUES_MONTEES = {
  deverrouillage: { Composant: EcranDeverrouillage },
  stockage: { Composant: EcranStockage },
  accueil: { Composant: EcranAccueil },
  nouvelEntretien: { Composant: EcranNouvelEntretien },
  // Non montable ici : son harnais (session, questions, réponses) vit dans
  // `ecrans/entretien/EcranEntretien.test.tsx`. La couche ② la couvre.
  entretien: { Composant: null },
  aujourdhui: { Composant: EcranAujourdhui },
  agenda: { Composant: EcranAgenda },
  pilote: { Composant: EcranPilote },
  finDeJournee: { Composant: EcranFinDeJournee },
  restauration: { Composant: EcranRestauration },
  finDeSession: { Composant: EcranFinDeSession },
  connexionSiege: { Composant: EcranConnexion },
  aRevoir: { Composant: EcranARevoir },
} as const satisfies Record<CodeVue, VueMontable>;

const CODES = Object.keys(VUES_MONTEES) as readonly CodeVue[];

// -----------------------------------------------------------------------------
// Fixture FICTIVE (invariant 2)
// -----------------------------------------------------------------------------
const INSTANT = '2026-09-05T12:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-0000000a5001';
const UNITE_ID = '0191e2a0-0000-7000-8000-0000000a5002';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000a5003';
const QUESTION_ID = '0191e2a0-0000-7000-8000-0000000a5004';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;
const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('./contexte.js', async (importOriginal) => {
  const reel = await importOriginal<typeof ModuleContexte>();
  return { ...reel, useTerrain: () => terrain };
});

async function baseEquipee(options: { readonly identite: boolean }): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a26-r5-${String(compteur)}`);
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
          titre: 'Mission fictive R5',
          companyId: '0191e2a0-0000-7000-8000-0000000a50c0',
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
          headcount: 6,
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
  if (options.identite) {
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'guide_strict' });
  }

  // Une session EN COURS et un point à revoir : c'est l'état où les écrans
  // rendent le PLUS de boutons — donc celui où deux d'entre eux ont le plus de
  // chances de porter le même nom. Un écran mesuré vide ne prouverait pas grand-
  // chose.
  const session = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id: session,
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
      consentedAt: INSTANT,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: INSTANT,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: session,
      missionQuestionId: QUESTION_ID,
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: null,
      note: null,
      reviewReason: 'à confirmer',
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive à revoir',
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
  await memoriserSessionCourante(base, session);
  return base;
}

/**
 * Le terrain, avec une pile PROFONDE : c'est ce qui fait rendre le « Revenir »
 * de la coquille (`App.tsx` : `peutRevenir(navigation)`). Sans profondeur, la
 * coquille n'en rend aucun et le test ne mesurerait rien de ce qu'il annonce.
 */
function terrainSur(base: BaseLocale | null, vue: CodeVue): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 15 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui', vue] },
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

/**
 * Le NOM ACCESSIBLE d'un bouton — ce qu'un lecteur d'écran énonce.
 *
 * `aria-label` l'emporte sur le contenu (c'est ce que fait `Bouton` quand il est
 * `iconeSeule`, §33.6 : « libellés explicites sur toute icône seule »).
 */
function nomAccessible(bouton: Element): string {
  return (bouton.getAttribute('aria-label') ?? bouton.textContent).replace(/\s+/g, ' ').trim();
}

function nomsDesBoutons(): string[] {
  return [...document.querySelectorAll('button')].map(nomAccessible).filter((nom) => nom !== '');
}

async function monterDansLaCoquille(vue: CodeVue, Composant: ComponentType): Promise<void> {
  const base =
    vue === 'deverrouillage' || vue === 'stockage'
      ? null
      : await baseEquipee({ identite: vue !== 'connexionSiege' });
  terrain = terrainSur(base, vue);
  // La coquille EST le sujet : c'est elle qui rend le « Revenir » avec lequel
  // les boutons d'écran entrent en collision. On rend donc `App` — qui choisit
  // la vue depuis `terrain` — plutôt que le composant seul.
  render(<App />);
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
  // Anti-vacuité : l'écran demandé est bien celui qui est peint.
  expect(document.querySelector('.axn-coquille__titre')?.textContent).toBe(VUES[vue].titre);
  expect(Composant).not.toBeNull();
}

const RACINE_FIELD = resolve(import.meta.dirname, '..');

/**
 * Retire les commentaires — LES ACCOLADES JSX D'ABORD, et l'ordre EST le sujet.
 *
 * Mesuré en falsifiant ce fichier : en retirant les blocs de commentaire AVANT
 * les commentaires JSX, il restait un `{}` orphelin entre le `>` et le libellé,
 * et le motif plus bas ne trouvait plus rien. La couche ② restait donc VERTE sur
 * une faute que la couche ① voyait — exactement le faux vert que ce fichier
 * existe pour empêcher. C'est la falsification qui l'a dit, pas la relecture.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Tous les `.tsx` de production sous `apps/field/src`, récursivement. */
function sourcesDeProduction(dossier: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = resolve(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...sourcesDeProduction(chemin));
      continue;
    }
    if (chemin.endsWith('.tsx') && !chemin.endsWith('.test.tsx')) trouves.push(chemin);
  }
  return trouves;
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(55), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ① LE RENDU — deux boutons ne portent jamais le même nom, coquille comprise
// ═════════════════════════════════════════════════════════════════════════════
describe('R5 — dans la coquille, aucun écran ne porte deux boutons de même nom', () => {
  it('contrôle d’anti-vacuité : la table couvre le registre, et le « Revenir » de la coquille est bien rendu', async () => {
    expect([...CODES].sort()).toEqual([...Object.keys(VUES)].sort());
    // Sans cette preuve, tout ce fichier mesurerait des écrans SANS le bouton
    // avec lequel la collision se produit — et serait vert pour rien.
    await monterDansLaCoquille('finDeJournee', EcranFinDeJournee);
    expect(nomsDesBoutons()).toContain('Revenir');
  });

  for (const code of CODES) {
    const { Composant } = VUES_MONTEES[code];
    if (Composant === null) continue;

    it(`@critique ${code} : deux boutons ne portent jamais le même nom accessible`, async () => {
      await monterDansLaCoquille(code, Composant);

      const noms = nomsDesBoutons();
      expect(noms.length, 'un écran sans aucun bouton ne prouve rien').toBeGreaterThan(0);

      const vus = new Map<string, number>();
      for (const nom of noms) vus.set(nom, (vus.get(nom) ?? 0) + 1);
      const doubles = [...vus.entries()]
        .filter(([, compte]) => compte > 1)
        .map(([nom, compte]) => `« ${nom} » ×${String(compte)}`);

      expect(
        doubles,
        `un lecteur d’écran entend ${String(doubles.length)} nom(s) en double sur « ${code} » :\n` +
          `${doubles.join('\n')}\nRègle R5 : un bouton de retour DANS un écran nomme sa destination.`,
      ).toEqual([]);
    });

    it(`@critique ${code} : « Revenir » nu appartient à la coquille, et à elle seule`, async () => {
      await monterDansLaCoquille(code, Composant);
      const nus = nomsDesBoutons().filter((nom) => nom === 'Revenir');
      expect(
        nus,
        'la coquille en rend UN ; un second viendrait de l’écran, et porterait le nom de l’autre',
      ).toHaveLength(1);
      // Le nom qu'A22 a écarté ne revient pas non plus : on REVIENT, verbe.
      expect(nomsDesBoutons()).not.toContain('Retour');
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ② LA SOURCE — ce que la couche ① ne peut pas monter (`entretien`)
// ═════════════════════════════════════════════════════════════════════════════
describe('R5 — hors de la coquille, aucune source ne rend un « Revenir » nu', () => {
  it('@critique un seul composant de production écrit « Revenir » seul : `App.tsx`', () => {
    const fautifs: string[] = [];
    const sources = sourcesDeProduction(RACINE_FIELD);
    // Anti-vacuité : la lecture trouve bien un dépôt, pas un dossier vide.
    expect(sources.length).toBeGreaterThan(20);

    for (const chemin of sources) {
      if (chemin.endsWith(`${String.fromCharCode(92)}App.tsx`) || chemin.endsWith('/App.tsx')) {
        continue;
      }
      const source = sansCommentaires(readFileSync(chemin, 'utf8'));
      // Le texte ENTIER d'un élément JSX, entre `>` et `<`. « Revenir à ma
      // journée » ne matche pas ; « Revenir » seul, si.
      if (/>\s*(Revenir|Retour)\s*</.test(source)) fautifs.push(chemin.slice(RACINE_FIELD.length));
    }

    expect(
      fautifs,
      'Règle R5 : « Revenir » nu appartient à la coquille ; un écran nomme sa ' +
        `destination.\n${fautifs.join('\n')}`,
    ).toEqual([]);
  });

  it('contrôle d’anti-vacuité : le motif TROUVE bien le « Revenir » de la coquille', () => {
    const coquille = sansCommentaires(readFileSync(resolve(RACINE_FIELD, 'App.tsx'), 'utf8'));
    expect(/>\s*Revenir\s*</.test(coquille), 'le motif ne détecte plus rien').toBe(true);
    // …et il ne se déclenche PAS sur un libellé qui nomme sa destination.
    expect(/>\s*(Revenir|Retour)\s*</.test('<Bouton>Revenir à ma journée</Bouton>')).toBe(false);
  });
});
