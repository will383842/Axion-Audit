// =============================================================================
// TESTS DE CONCEPTION A22 — majeur **M2** de la recette novice n°1 (A54,
// 2026-09-06), repris par A02 comme réserve de la porte **P-C** :
// « il n'existe AUCUN bouton “Terminer” dans l'écran d'entretien. Sur la
// dernière question, “Suivant” est grisé et le seul geste est “Quitter
// l'entretien” — un libellé qui dit *abandonner*, pas *finir*. »
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION, écrits par A22 AVANT le correctif, pour guider le code.
// L'ACCEPTATION revient à A27 (09 §5.6) : aucun cas n'est marqué `@critique`,
// et ce que le relecteur croisé doit encore éprouver est listé au rapport.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
//   1. Sur la dernière question, l'action PRINCIPALE dit qu'on TERMINE, et elle
//      est cliquable — le « Suivant » grisé n'est plus le dernier mot.
//   2. Elle mène à `finDeSession`, c'est-à-dire à la chaîne Terminer → note →
//      Valider groupé du §33.7, SANS oublier la session courante (sinon l'écran
//      d'arrivée rendrait son état vide « Aucune session ouverte »).
//   3. « Quitter » reste offert et reste DISTINCT : abandonner et finir ne sont
//      pas le même fait d'audit (03 §19.1 — terminer est une transition d'état).
//   4. Avant la dernière question, rien ne change : « Suivant » reste l'action
//      principale, et aucun bouton « Terminer » ne traîne dans la barre.
//
// Traçabilité : E13 (écran 3 zones), E24 (validation obligatoire de chaque
// étape), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { uuidv7 } from 'uuidv7';
import { FournisseurTerrain, useTerrain, type ValeurTerrain } from '../../app/contexte.js';
import { contexteLocal } from '../../local/contexte.js';
import type { QuestionLocale } from '../../local/depots/questions.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { jetonsDeRecherche } from '../../local/formes.js';
import { memoriserIdentiteAuditeur } from '../../session/auditeur.js';
import {
  lireSessionCourante,
  memoriserQuestionCourante,
  memoriserSessionCourante,
} from '../../session/position.js';
import { EcranEntretien } from './EcranEntretien.js';
import { ZoneQuestion } from './ZoneQuestion.js';

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

// -----------------------------------------------------------------------------
// Fixture — fictive (invariant 2), sans couleur ni taille (invariant 4).
// -----------------------------------------------------------------------------
const HORODATAGE = '2026-09-06T08:00:00.000Z';
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-0000000a2001';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-0000000a2c01';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000a2e01';
const Q_PREMIERE = '0191e2a0-0000-7000-8000-0000000a2301';
const Q_DERNIERE = '0191e2a0-0000-7000-8000-0000000a2302';
const TEXTE_PREMIERE = 'Première question fictive du parcours';
const TEXTE_DERNIERE = 'Dernière question fictive du parcours';

function questionDescendue(id: string, position: number, texte: string) {
  return {
    table: 'missionQuestions' as const,
    index: {
      id,
      missionId: MISSION_ID,
      position,
      texteSnapshot: texte,
      motsCles: jetonsDeRecherche(texte),
      answerType: 'free_text' as const,
      criticality: 'important' as const,
      clientUpdatedAt: HORODATAGE,
      supprimeLe: null,
    },
    charge: {
      questionId: `0191e2a0-0000-7000-8000-0000000a24${position.toString().padStart(2, '0')}`,
      questionVersion: 1,
      guidanceSnapshot: null,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: 1,
      allowRangeSnapshot: false,
      addedAdHoc: false,
      blockCode: 'bloc_fictif',
    },
  };
}

// -----------------------------------------------------------------------------
// Le harnais — coquille réelle, déverrouillée (même parti que
// `EcranEntretien.test.tsx` : l'écran ne reçoit aucune prop, il lit la session
// courante mémorisée dans `meta`).
// -----------------------------------------------------------------------------
let terrain: ValeurTerrain | null = null;
function Sonde() {
  terrain = useTerrain();
  return null;
}

function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

async function monter(contenu: ReactNode = null) {
  terrain = null;
  const rendu = render(
    <FournisseurTerrain>
      <Sonde />
    </FournisseurTerrain>,
  );
  await waitFor(
    () => {
      expect(terrain?.phase).toBe('verrouille');
    },
    { timeout: 8_000 },
  );
  await act(async () => {
    await requis(terrain, 'coquille').ouvrir(MOT_DE_PASSE);
  });
  await waitFor(() => {
    expect(terrain?.phase).toBe('ouvert');
  });
  rendu.rerender(
    <FournisseurTerrain>
      <Sonde />
      {contenu}
    </FournisseurTerrain>,
  );
  return rendu;
}

async function monterEntretien(interviewId: string, questionId: string) {
  const rendu = await monter();
  const { base } = contexteLocal();
  await memoriserSessionCourante(base, interviewId);
  await memoriserQuestionCourante(base, interviewId, questionId);
  rendu.rerender(
    <FournisseurTerrain>
      <Sonde />
      <EcranEntretien />
    </FournisseurTerrain>,
  );
  return rendu;
}

async function semerEntretien(): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: null,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site' as const,
      personName: 'Interlocuteur fictif',
      personRole: 'Responsable fictif',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: HORODATAGE,
      informationNoticeVersion: 'v1',
      noticeShownAt: HORODATAGE,
      scheduledDurationMin: null,
      startedAt: HORODATAGE,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: HORODATAGE,
    },
  });
  return id;
}

let interviewId: string;

beforeAll(async () => {
  const rendu = await monter();
  {
    const { base, coffre } = contexteLocal();
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'guide_strict' });
  }
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: HORODATAGE,
    enregistrements: [
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'en_cours',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          titre: 'Mission fictive de recette M2',
          companyId: '0191e2a0-0000-7000-8000-0000000a2ccc',
          timezone: 'Europe/Paris',
          auditLevel: 'operationnel',
          geoScope: 'france' as const,
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: ORG_UNIT_ID,
          missionId: MISSION_ID,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 9,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
      questionDescendue(Q_PREMIERE, 1, TEXTE_PREMIERE),
      questionDescendue(Q_DERNIERE, 2, TEXTE_DERNIERE),
    ],
  });
  interviewId = await semerEntretien();
  rendu.unmount();
}, 30_000);

afterAll(() => {
  terrain = null;
});

// =============================================================================
// A. La barre d'actions, isolée — ce que la DERNIÈRE question doit offrir
// =============================================================================
function questionFictive(): QuestionLocale {
  return {
    id: Q_DERNIERE,
    missionId: MISSION_ID,
    position: 2,
    texteSnapshot: TEXTE_DERNIERE,
    motsCles: [],
    answerType: 'free_text',
    criticality: 'important',
    clientUpdatedAt: HORODATAGE,
    supprimeLe: null,
    questionId: '0191e2a0-0000-7000-8000-0000000a2402',
    questionVersion: 1,
    guidanceSnapshot: null,
    optionsSnapshot: null,
    scoringSnapshot: null,
    weightSnapshot: 1,
    allowRangeSnapshot: false,
    addedAdHoc: false,
    blockCode: 'bloc_fictif',
  };
}

function rendreZone(options: {
  readonly peutSuivant: boolean;
  readonly onTerminer?: () => void;
  readonly libelleTerminer?: string;
}) {
  render(
    <ZoneQuestion
      question={questionFictive()}
      rang={options.peutSuivant ? 1 : 2}
      total={2}
      reponse={null}
      horsParcours={false}
      partage={false}
      ecritureRefusee={null}
      fourchette={false}
      onFourchette={() => undefined}
      onValeur={() => undefined}
      onDrapeau={() => undefined}
      onNote={() => undefined}
      onRecherche={() => undefined}
      onQuestionAdHoc={() => undefined}
      onPrecedent={() => undefined}
      onSuivant={() => undefined}
      onTerminer={options.onTerminer ?? (() => undefined)}
      libelleTerminer={options.libelleTerminer ?? 'Terminer l’entretien'}
      peutPrecedent
      peutSuivant={options.peutSuivant}
      afficherRaccourcis={false}
    />,
  );
}

describe('M2 — la dernière question offre un geste qui dit « finir »', () => {
  it('remplace le « Suivant » grisé par une action principale qui parle de TERMINER', () => {
    rendreZone({ peutSuivant: false });

    // Le défaut : `Suivant` restait là, désactivé, dernier mot de l'écran.
    expect(screen.queryByRole('button', { name: /^suivant/i })).toBeNull();

    const terminer = screen.getByRole<HTMLButtonElement>('button', { name: /terminer/i });
    expect(terminer.disabled).toBe(false);
    // « Quitter » dit abandonner ; ce bouton-ci doit dire finir.
    expect(terminer.textContent).not.toMatch(/quitter/i);
  });

  it('le clic appelle `onTerminer`, une seule fois', () => {
    const onTerminer = vi.fn();
    rendreZone({ peutSuivant: false, onTerminer });
    fireEvent.click(screen.getByRole('button', { name: /terminer/i }));
    expect(onTerminer).toHaveBeenCalledTimes(1);
  });

  it('le libellé vient de l’écran : une session déjà terminée ne se « termine » pas deux fois', () => {
    rendreZone({ peutSuivant: false, libelleTerminer: 'Fin de session' });
    expect(screen.getByRole('button', { name: 'Fin de session' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /terminer l’entretien/i })).toBeNull();
  });

  it('avant la dernière question, rien ne change : « Suivant » reste l’action principale', () => {
    rendreZone({ peutSuivant: true });
    const suivant = screen.getByRole<HTMLButtonElement>('button', { name: /^suivant/i });
    expect(suivant.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /terminer/i })).toBeNull();
  });
});

// =============================================================================
// B. L'écran entier — le chemin vers `finDeSession`, et « Quitter » qui reste
// =============================================================================
describe('M2 — depuis la dernière question, le geste mène à la fin de session', () => {
  it('« Terminer l’entretien » ouvre `finDeSession` SANS oublier la session courante', async () => {
    await monterEntretien(interviewId, Q_DERNIERE);
    await waitFor(() => {
      expect(screen.getAllByText(TEXTE_DERNIERE).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /terminer l’entretien/i }));

    await waitFor(() => {
      expect(terrain?.vue).toBe('finDeSession');
    });
    // Le piège : `fermerEntretien` efface la session courante. L'écran d'arrivée
    // la RELIT (`lireSessionCourante`) — l'effacer le renverrait sur son état
    // vide « Aucune session ouverte », juste après quarante-cinq minutes.
    expect(await lireSessionCourante(contexteLocal().base)).toBe(interviewId);
  });

  it('« Quitter l’entretien » reste offert, et reste un bouton DISTINCT', async () => {
    await monterEntretien(interviewId, Q_DERNIERE);
    await waitFor(() => {
      expect(screen.getAllByText(TEXTE_DERNIERE).length).toBeGreaterThanOrEqual(1);
    });
    const quitter = screen.getByRole('button', { name: /quitter l’entretien/i });
    const terminer = screen.getByRole('button', { name: /terminer l’entretien/i });
    expect(quitter).not.toBe(terminer);
  });

  it('sur une question qui n’est pas la dernière, l’écran n’offre pas « Terminer »', async () => {
    await monterEntretien(interviewId, Q_PREMIERE);
    await waitFor(() => {
      expect(screen.getAllByText(TEXTE_PREMIERE).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole('button', { name: /terminer l’entretien/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^suivant/i })).toBeTruthy();
  });
});
