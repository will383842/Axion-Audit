// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B5** de la recette novice n°1 (A54,
// 2026-09-06) : l'échec de lecture déguisé en état vide.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne de
// `EcranFinDeSession.tsx` ni du correctif (09 §5.6). `@critique` : l'auditeur
// vient de passer quarante-cinq minutes sur cet entretien, et l'écran lui
// annonçait qu'il n'existe pas.
//
// ── CE QU'IL TIENT DE PLUS QUE LES TESTS DE CONCEPTION ──────────────────────
// La panne y est injectée sur `lireSessionCourante`, c'est-à-dire sur le PREMIER
// appel de la lecture. Or le `try` de l'écran en enveloppe CINQ (position,
// session, avancement, questions, pièces) : une garde posée seulement autour du
// premier laisserait les quatre autres retomber dans « Aucune session ouverte ».
// Ce fichier casse donc plus loin — `depotSessions.parId`, puis
// `depotReponses.avancement` —, là où l'auditeur a déjà une session identifiée,
// et vérifie que l'écran dit encore la bonne chose.
//
// Les trois exigences du bloquant, éprouvées ensemble :
//   ① l'état d'erreur est DISTINCT de l'état vide ;
//   ② il dit que rien n'a été supprimé — c'est ce que l'auditeur doit entendre
//      avant de refaire son entretien ;
//   ③ l'état vide reste l'état vide quand la lecture réussit sans session : un
//      correctif qui rendrait « erreur » partout serait aussi faux, en sens
//      inverse.
//
// Traçabilité : E44 (UX/UI, 4 états), E23, invariant 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { depotReponses } from '../../local/depots/reponses.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { ecrireLocal } from '../../local/ecriture.js';
import { memoriserSessionCourante } from '../../session/position.js';
import { EcranFinDeSession } from './EcranFinDeSession.js';

const INSTANT = '2026-09-06T12:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000027b501';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000027b502';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000027b503';

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

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a27-b5-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

async function semerSessionCourante(base: BaseLocale): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: INSTANT,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: 'Interlocuteur Fictif',
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
  await memoriserSessionCourante(base, id);
  return id;
}

function terrainSur(base: BaseLocale): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui', 'finDeSession'] },
    vue: 'finDeSession',
    stockage: null,
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

/** Le texte de l'état VIDE, mot pour mot — celui qu'A54 a lu sur une panne. */
const PHRASE_ETAT_VIDE = 'Aucune session ouverte';

beforeAll(async () => {
  kek = await deriverKek('mot-de-passe-fictif-a27-b5', new Uint8Array(16).fill(29), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B5 — une panne de lecture ne dit JAMAIS que la session n’existe pas', () => {
  /** Les points de rupture, du plus tôt au plus tard dans la même lecture. */
  const RUPTURES = [
    {
      nom: 'la session elle-même (`depotSessions.parId`)',
      casser: (): void => {
        vi.spyOn(depotSessions, 'parId').mockRejectedValue(
          new Error('panne fictive de lecture du stockage local'),
        );
      },
    },
    {
      nom: 'l’avancement des réponses (`depotReponses.avancement`)',
      casser: (): void => {
        vi.spyOn(depotReponses, 'avancement').mockRejectedValue(
          new Error('panne fictive de lecture du stockage local'),
        );
      },
    },
  ] as const;

  for (const rupture of RUPTURES) {
    it(`@critique panne sur ${rupture.nom} : état d’ERREUR, jamais « ${PHRASE_ETAT_VIDE} »`, async () => {
      const base = await nouvelleBase();
      await semerSessionCourante(base);
      rupture.casser();
      terrain = terrainSur(base);
      render(<EcranFinDeSession />);

      await screen.findByText(/n’a pas pu être lue/i);

      // ① l'erreur est DISTINCTE du vide — c'est tout B5.
      expect(document.body.textContent).not.toContain(PHRASE_ETAT_VIDE);
      // ② elle dit que rien n'a été supprimé, et elle le dit en toutes lettres.
      expect(document.body.textContent).toMatch(/rien n’a été supprimé/i);
      expect(document.body.textContent).toMatch(
        /ne veut PAS dire que votre entretien n’existe pas/i,
      );
      // ③ cause ET action (03 §17.6) : l'action nomme la sauvegarde de secours.
      expect(document.body.textContent).toMatch(/rechargez la page/i);
      expect(document.body.textContent).toMatch(/sauvegarde de secours/i);
    });
  }

  it('@critique l’état d’erreur garde une SORTIE : l’auditeur n’est pas enfermé dessus (B2)', async () => {
    const base = await nouvelleBase();
    await semerSessionCourante(base);
    vi.spyOn(depotSessions, 'parId').mockRejectedValue(new Error('panne fictive'));
    terrain = terrainSur(base);
    render(<EcranFinDeSession />);

    await screen.findByText(/n’a pas pu être lue/i);
    const retour = await screen.findByRole('button', { name: /revenir à ma journée/i });
    expect(retour).toBeInstanceOf(HTMLButtonElement);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B5 — le bord opposé : une lecture RÉUSSIE sans session reste un état vide', () => {
  it('@critique aucune session ouverte : l’état vide, avec son conseil et sa sortie', async () => {
    // Anti-vacuité de tout ce fichier. Un correctif qui rendrait « erreur » sur
    // toute absence ferait passer les tests ci-dessus et dirait à l'auditeur que
    // son stockage est en panne chaque fois qu'il n'a rien ouvert.
    const base = await nouvelleBase();
    terrain = terrainSur(base);
    render(<EcranFinDeSession />);

    await screen.findByText(new RegExp(PHRASE_ETAT_VIDE, 'i'));
    expect(document.body.textContent).not.toMatch(/n’a pas pu être lue/i);
    expect(document.body.textContent).toMatch(/ouvrez une session depuis votre journée/i);
    expect(await screen.findByRole('button', { name: /revenir à ma journée/i })).toBeInstanceOf(
      HTMLButtonElement,
    );
  });
});
