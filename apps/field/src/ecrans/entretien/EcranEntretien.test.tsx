// =============================================================================
// L'ÉCRAN D'ENTRETIEN 3 ZONES — lot L5, incrément L5b. ÉCRIT AVANT LE CODE, par
// A26, depuis `docs/conception/LOT_L5.md` (§1 L5b, §3.7, §4 ligne `interface`)
// et 03 (M3.1, §17.4, §33.2, §33.3) — 09 §5.6 : A22 implémente sans lire ceci.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. « Nouvel entretien » : trois champs, et un tap — la session existe.
//   B. Les QUATRE états §33.2 par écran, via `ZoneEtat` : vide, chargement,
//      erreur, nominal (le « hors ligne » est le mode NOMINAL du terrain).
//   C. Raccourcis §33.3 : ACTIFS sur l'écran, INACTIFS dans un champ de saisie —
//      « taper "Rien à signaler" dans une note ne déclenche jamais rien ; Échap
//      rend le focus ». C'est le piège nommé par la note (§4).
//   D. Mode ÉCRAN PARTAGÉ : masque TOUT ce qui est interne — par NON-RENDU, pas
//      par CSS (le test de `BandeauPartage` explique pourquoi : un `display:none`
//      reste dans une capture, un « inspecter », un lecteur d'écran).
//   E. Indicateur « Enregistré » : passe à « enregistré » APRÈS l'écriture
//      locale, jamais avant — et jamais si elle échoue.
//   F. Ancres de cotation VISIBLES (§33.3), boutons fixes (§17.4), progression.
//
// ── LE HARNAIS ───────────────────────────────────────────────────────────────
// L'écran est monté sous le VRAI `FournisseurTerrain` (socle L5a), déverrouillé
// avec un mot de passe factice, données semées par le socle (`appliquerDescente`,
// `ecrireLocal`). Ainsi le test ne présume pas de la façon dont l'écran atteint
// la base — `useTerrain()` ou `contexteLocal()` — les deux marchent ici.
// Les touches sont émises depuis un élément DE L'ÉCRAN (le texte de la question),
// pour atteindre un gestionnaire posé sur `window` comme un gestionnaire posé sur
// la racine de l'écran.
//
// ── ÉCHAFAUDAGE (rencontre du 2026-09-02, DECISIONS.md [L5b]) ────────────────
//   Écrit sur l'hypothèse `<EcranEntretien missionId interviewId>` ; A22 a livré
//   un écran SANS prop qui lit la session courante mémorisée dans `meta`
//   (`session/position.ts`, reprise 03 §17.4) et un `EcranNouvelEntretien` sans
//   prop non plus (identité de l'auditeur lue dans `meta`, navigation par
//   `useTerrain().naviguer`). Par arbitrage A01, seul l'échafaudage s'adapte :
//   `monterEntretien` mémorise session et question courantes AVANT le rendu ;
//   `monterNouvelEntretien` mémorise l'identité. Chaque assertion est gardée.
//   · Libellés : ceux du pack (§17.4 : « Précédent », « À revoir », « Suivant »,
//     « Recherche ») et ceux de `packages/ui` (figé).
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E23 (intuitif),
// E27 (design/WCAG), E33 (RGPD — écran partagé), E44.
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { uuidv7 } from 'uuidv7';
import { FournisseurTerrain, useTerrain, type ValeurTerrain } from '../../app/contexte.js';
import { contexteLocal } from '../../local/contexte.js';
import { depotReponses } from '../../local/depots/reponses.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import type * as ModuleEcriture from '../../local/ecriture.js';
import { jetonsDeRecherche } from '../../local/formes.js';
import { memoriserIdentiteAuditeur } from '../../session/auditeur.js';
import {
  lireSessionCourante,
  memoriserQuestionCourante,
  memoriserSessionCourante,
} from '../../session/position.js';
import { REQUETE_TROIS_COLONNES } from '../../session/media.js';
import { EcranEntretien } from './EcranEntretien.js';
import { EcranNouvelEntretien } from './EcranNouvelEntretien.js';

// -----------------------------------------------------------------------------
// La PORTE sur `ecrireLocal` — pour prouver que « Enregistré » suit l'écriture.
// `vi.mock` est hissé au-dessus des imports : l'état partagé passe par `vi.hoisted`.
// Par défaut la porte est ouverte (passe-plat) ; un test la ferme, puis la libère.
// -----------------------------------------------------------------------------
const porte = vi.hoisted(() => ({
  intercepter: null as null | ((suite: () => Promise<void>) => Promise<void>),
}));

vi.mock('../../local/ecriture.js', async (importOriginal) => {
  const original = await importOriginal<typeof ModuleEcriture>();
  return {
    ...original,
    ecrireLocal: (demande: Parameters<typeof original.ecrireLocal>[0]) =>
      porte.intercepter === null
        ? original.ecrireLocal(demande)
        : porte.intercepter(() => original.ecrireLocal(demande)),
  };
});

// Le cale `window.matchMedia` (jsdom) vit désormais dans `vitest.setup.interface.ts`.
//
// jsdom n'implémente pas non plus `Element.scrollIntoView` — l'écran le fait à
// chaque changement de question (remettre l'ascenseur en haut, §17.4), ce que tout
// navigateur offre. Sans ce cale, le premier rendu nominal lève et aucun test ne
// dit plus rien (mesuré : 25/29 rougissaient sur lui). Le cale ne fait rien : il
// n'y a pas d'ascenseur dans jsdom. À DÉPLACER dans `vitest.setup.interface.ts`
// (hors de mon périmètre d'écriture) : signalé à A20 dans le rapport.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

// -----------------------------------------------------------------------------
// Fixture — fictive (invariant 2). Aucune couleur, aucune taille (invariant 4).
// -----------------------------------------------------------------------------
const HORODATAGE = '2026-09-02T08:00:00.000Z';
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_VIDE_ID = '0191e2a0-0000-7000-8000-00000000f1df';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const Q_ECHELLE = '0191e2a0-0000-7000-8000-000000000301';
const Q_OUI_NON = '0191e2a0-0000-7000-8000-000000000302';
const Q_TEXTE = '0191e2a0-0000-7000-8000-000000000303';
const Q_NOMBRE = '0191e2a0-0000-7000-8000-000000000304';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TEXTE_ECHELLE = 'Niveau de maturité du processus de traitement';
const TEXTE_OUI_NON = 'Existe-t-il une procédure écrite ?';
const TEXTE_TEXTE = 'Décrivez le circuit de validation';
const TEXTE_NOMBRE = 'Nombre de dossiers traités par mois';
const ANCRE_3 = 'documenté mais non appliqué';
const GUIDANCE_ECHELLE = `1 = aucun processus documenté · 3 = ${ANCRE_3} · 5 = documenté, appliqué, mesuré`;

const SENTINELLES = {
  noteQuestion: 'SENTINELLE_NOTE_PARTAGE_UI_MK3D8Q',
  motifARevoir: 'SENTINELLE_MOTIF_PARTAGE_UI_ZP6W2R',
  blocNotes: 'SENTINELLE_BLOC_NOTES_PARTAGE_UI_HV9T4N',
  noteVolante: 'SENTINELLE_VOLANTE_PARTAGE_UI_CJ5L7B',
} as const;

function questionDescendue(
  id: string,
  position: number,
  texte: string,
  answerType: 'scale_1_5' | 'yes_no' | 'free_text' | 'number',
  guidance: string | null,
  allowRange: boolean,
  missionId: string = MISSION_ID,
) {
  return {
    table: 'missionQuestions' as const,
    index: {
      id,
      missionId,
      position,
      texteSnapshot: texte,
      motsCles: jetonsDeRecherche(texte),
      answerType,
      criticality: 'important' as const,
      clientUpdatedAt: HORODATAGE,
      supprimeLe: null,
    },
    charge: {
      questionId: `0191e2a0-0000-7000-8000-0000000004${position.toString().padStart(2, '0')}`,
      questionVersion: 1,
      guidanceSnapshot: guidance,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: 1,
      allowRangeSnapshot: allowRange,
      addedAdHoc: false,
      blockCode: 'bloc_fictif',
    },
  };
}

function missionDescendue(id: string, titre: string) {
  return {
    table: 'missions' as const,
    index: { id, status: 'en_cours', clientUpdatedAt: HORODATAGE, supprimeLe: null },
    charge: {
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000000cccc',
      timezone: 'Europe/Paris',
      auditLevel: 'operationnel',
      geoScope: 'france' as const,
      countryCode: 'FR',
      startPlanned: null,
      endPlanned: null,
      roleSurMission: 'auditeur',
    },
  };
}

const CHARGE_INTERVIEW = {
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
  consentedAt: null,
  informationNoticeVersion: null,
  noticeShownAt: null,
  scheduledDurationMin: null,
  startedAt: HORODATAGE,
  endedAt: null,
  valideeLe: null,
  clientCreatedAt: HORODATAGE,
};

async function semerEntretien(
  missionId: string,
  generalNotes: string | null = null,
): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: null,
    },
    charge: { ...CHARGE_INTERVIEW, generalNotes },
  });
  return id;
}

// -----------------------------------------------------------------------------
// Le harnais — coquille réelle, déverrouillée
// -----------------------------------------------------------------------------
let terrain: ValeurTerrain | null = null;
function Sonde() {
  terrain = useTerrain();
  return null;
}

/** Ce que le harnais exige d'avoir : lève avec un message clair plutôt qu'un `!`. */
function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

type Rendu = ReturnType<typeof render>;

/** Monte la coquille, la déverrouille, puis y rend `contenu`. */
async function monter(contenu: ReactNode = null): Promise<Rendu> {
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

/**
 * Monte l'écran d'entretien SUR une session : l'écran ne reçoit pas de prop, il
 * lit la session courante mémorisée (`position.ts`). La question courante est
 * remise au début (`Q_ECHELLE`) pour que chaque test parte du même endroit —
 * l'écran mémorise la dernière position, et un test précédent a pu naviguer.
 */
async function monterEntretien(
  interviewId: string,
  questionId: string | null = Q_ECHELLE,
): Promise<Rendu> {
  const rendu = await monter();
  const { base } = contexteLocal();
  await memoriserSessionCourante(base, interviewId);
  if (questionId !== null) await memoriserQuestionCourante(base, interviewId, questionId);
  rendu.rerender(
    <FournisseurTerrain>
      <Sonde />
      <EcranEntretien />
    </FournisseurTerrain>,
  );
  return rendu;
}

/** Monte « Nouvel entretien » : aucune session courante, l'identité déjà rangée (beforeAll). */
async function monterNouvelEntretien(): Promise<Rendu> {
  const rendu = await monter();
  await memoriserSessionCourante(contexteLocal().base, null);
  rendu.rerender(
    <FournisseurTerrain>
      <Sonde />
      <EcranNouvelEntretien />
    </FournisseurTerrain>,
  );
  return rendu;
}

/**
 * Remplit les trois champs de « Nouvel entretien ». Deux missions sont sur
 * l'appareil (fixture) : l'écran demande d'abord la mission — échafaudage,
 * pas un quatrième champ obligatoire de la spec.
 */
async function remplirTroisChamps(nom: string, fonction: string): Promise<void> {
  const champNom = await screen.findByLabelText(/^nom/i);
  fireEvent.change(champNom, { target: { value: nom } });
  fireEvent.change(screen.getByLabelText(/fonction/i), { target: { value: fonction } });

  const mission = screen.queryByLabelText<HTMLSelectElement>(/^mission/i);
  if (mission !== null) {
    const optionMission = within(mission).getByRole<HTMLOptionElement>('option', {
      name: /FIL-TPE/,
    });
    fireEvent.change(mission, { target: { value: optionMission.value } });
  }
  const unite = await screen.findByLabelText<HTMLSelectElement>(/unité|service/i);
  await waitFor(() => {
    expect(within(unite).getByRole<HTMLOptionElement>('option', { name: /Service fictif/ }));
  });
  const option = within(unite).getByRole<HTMLOptionElement>('option', { name: /Service fictif/ });
  fireEvent.change(unite, { target: { value: option.value } });
}

function boutonOuvrir(): HTMLElement {
  return screen.getByRole('button', { name: /ouvrir|démarrer|commencer/i });
}

/** Le `code` DOM d'une touche — au cas où l'écran lit `event.code` plutôt que `event.key`. */
function codeDeTouche(key: string): string {
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (key === '/') return 'Slash';
  return key;
}

/** Émet une touche DEPUIS un élément de l'écran (texte de la question) — voir l'en-tête. */
function touche(key: string, cible: Element) {
  fireEvent.keyDown(cible, { key, code: codeDeTouche(key) });
}

/** La question courante, affichée au centre (tolère un rappel du texte ailleurs). */
function questionAffichee(texte: string): Element {
  const occurrences = screen.getAllByText(texte);
  expect(occurrences.length).toBeGreaterThanOrEqual(1);
  return requis(occurrences[0], 'question affichée');
}

/** Tout ce que le DOM porte : texte rendu ET valeurs des champs (React ne met pas `value` dans `textContent`). */
function contenuDom(): string {
  const valeurs = [
    ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input'),
  ]
    .map((champ) => champ.value)
    .join('\n');
  return `${document.body.textContent}\n${document.body.innerHTML}\n${valeurs}`;
}

/** Le textarea de note — marqué `data-saisie-libre` par `ZoneNotes` (packages/ui). */
function zoneDeNote(): HTMLTextAreaElement {
  const zones = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-saisie-libre]');
  expect(
    zones.length,
    'la zone droite doit porter au moins une zone de notes (M3.1)',
  ).toBeGreaterThan(0);
  return requis(zones[0], 'zone de notes');
}

function pause(ms: number) {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

let interviewId: string;
let interviewVideId: string;
let interviewPartageId: string;

beforeAll(async () => {
  const rendu = await monter();

  // L'identité de l'auditeur (05 §9.9 : propriétaire des sessions) — rangée
  // CHIFFRÉE dans `meta`, comme le fait la connexion au siège.
  {
    const { base, coffre } = contexteLocal();
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'guide_strict' });
  }

  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: HORODATAGE,
    enregistrements: [
      missionDescendue(MISSION_ID, 'Mission fictive FIL-TPE'),
      missionDescendue(MISSION_VIDE_ID, 'Mission fictive sans questionnaire'),
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
      questionDescendue(Q_ECHELLE, 1, TEXTE_ECHELLE, 'scale_1_5', GUIDANCE_ECHELLE, false),
      questionDescendue(Q_OUI_NON, 2, TEXTE_OUI_NON, 'yes_no', null, false),
      questionDescendue(Q_TEXTE, 3, TEXTE_TEXTE, 'free_text', null, false),
      questionDescendue(Q_NOMBRE, 4, TEXTE_NOMBRE, 'number', null, true),
    ],
  });

  interviewId = await semerEntretien(MISSION_ID);
  interviewVideId = await semerEntretien(MISSION_VIDE_ID);

  // La session du mode écran partagé porte TOUT ce qui est interne.
  interviewPartageId = await semerEntretien(MISSION_ID, SENTINELLES.blocNotes);
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: interviewPartageId,
      missionQuestionId: Q_ECHELLE,
      flagReview: 1,
      notApplicable: 0,
      withheld: 1,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'scale_1_5', v: 2 },
      note: SENTINELLES.noteQuestion,
      reviewReason: SENTINELLES.motifARevoir,
      naReason: null,
      withheldReason: 'confidentiel',
      source: 'entretien',
      questionTextSnapshot: TEXTE_ECHELLE,
      revision: 1,
      clientCreatedAt: HORODATAGE,
    },
  });
  await ecrireLocal({
    entite: 'attachment_meta',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: { interviewId: interviewPartageId, answerId: null, kind: 'note' },
    charge: {
      content: SENTINELLES.noteVolante,
      filename: null,
      mime: null,
      sizeBytes: null,
      storageKey: null,
      purgeAfter: null,
      createdBy: AUDITEUR_ID,
      clientCreatedAt: HORODATAGE,
    },
  });

  rendu.unmount();
}, 30_000);

afterEach(() => {
  porte.intercepter = null;
});

afterAll(() => {
  // La coquille ferme le coffre elle-même au démontage ; rien d'autre à libérer.
  terrain = null;
});

// =============================================================================
// A. « Nouvel entretien » — trois champs (03 §17.4), un tap
// =============================================================================
describe('« Nouvel entretien » — trois champs, tout le reste optionnel (03 §17.4, M3.2)', () => {
  it('@critique nom + fonction + unité, « Démarrer » → une session EN COURS existe, id v7 rendu', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : un formulaire qui exige l'e-mail, la
    // durée ou la date (« tout le reste est optionnel ou différable »), ou qui
    // crée la session `non_demarre` en attendant un second écran.
    // Échafaudage : l'écran d'A22 ne rend pas l'id par un rappel — il le
    // mémorise comme session courante et navigue vers l'entretien, où l'accord
    // de participation (03 M3.2 V2.10) est la seule étape avant la première
    // question. Le parcours complet est joué ; les assertions sont inchangées.
    const rendu = await monterNouvelEntretien();
    const { base } = contexteLocal();
    await remplirTroisChamps('Interlocutrice fictive', 'Responsable fictive');
    fireEvent.click(boutonOuvrir());

    await waitFor(async () => {
      expect(await lireSessionCourante(base)).not.toBeNull();
    });
    const id = requis(await lireSessionCourante(base), 'session courante');
    expect(id).toMatch(UUID_V7);
    await waitFor(() => {
      expect(terrain?.vue).toBe('entretien');
    });

    rendu.rerender(
      <FournisseurTerrain>
        <Sonde />
        <EcranEntretien />
      </FournisseurTerrain>,
    );
    const accord = await screen.findByLabelText<HTMLInputElement>(/accord de participation/i);
    fireEvent.click(accord);
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /démarrer/i }).disabled).toBe(
        false,
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /démarrer/i }));

    await waitFor(async () => {
      expect((await depotSessions.parId(id))?.status).toBe('en_cours');
    });
    const session = await depotSessions.parId(id);
    expect(session?.status).toBe('en_cours');
    expect(session?.kind).toBe('entretien');
    expect(session?.personName).toBe('Interlocutrice fictive');
    expect(session?.personRole).toBe('Responsable fictive');
    expect(session?.orgUnitId).toBe(ORG_UNIT_ID);
  });

  it('@critique sans accord de participation, l’entretien reste NON DÉMARRÉ — avec, il passe en cours et l’accord est horodaté', async () => {
    // Le libellé de la phrase-script n'est pas éprouvé (en attente de validation
    // par Williams) : seul le refus sans accord, puis le passage avec, le sont.
    const rendu = await monterNouvelEntretien();
    const { base } = contexteLocal();
    await remplirTroisChamps('Interlocuteur fictif prudent', 'Opérateur fictif');
    fireEvent.click(boutonOuvrir());
    await waitFor(async () => {
      expect(await lireSessionCourante(base)).not.toBeNull();
    });
    const id = requis(await lireSessionCourante(base), 'session courante');
    expect((await depotSessions.parId(id))?.status).toBe('non_demarre');

    rendu.rerender(
      <FournisseurTerrain>
        <Sonde />
        <EcranEntretien />
      </FournisseurTerrain>,
    );
    const accord = await screen.findByLabelText<HTMLInputElement>(/accord de participation/i);
    expect(accord.checked).toBe(false);
    const bouton = screen.getByRole<HTMLButtonElement>('button', { name: /démarrer/i });
    expect(bouton.disabled).toBe(true);
    fireEvent.click(bouton);
    await pause(150);
    expect((await depotSessions.parId(id))?.status).toBe('non_demarre');
    // Aucune question n'est saisissable tant que l'accord n'est pas recueilli.
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.click(accord);
    await waitFor(() => {
      expect(bouton.disabled).toBe(false);
    });
    fireEvent.click(bouton);
    await waitFor(async () => {
      expect((await depotSessions.parId(id))?.status).toBe('en_cours');
    });
    const session = requis(await depotSessions.parId(id), 'session démarrée');
    expect(session.consentGiven).toBe(true);
    expect(session.consentedAt).not.toBeNull();
    expect(session.informationNoticeVersion).not.toBeNull();
    // Et la première question apparaît.
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
  });

  it('le nom est obligatoire : sans lui, rien n’est créé et l’erreur DIT quoi faire (§33.2)', async () => {
    await monterNouvelEntretien();
    await screen.findByLabelText(/^nom/i);
    const { base } = contexteLocal();
    const avant = await base.interviews.count();
    fireEvent.click(boutonOuvrir());
    await pause(150);
    expect(await lireSessionCourante(base)).toBeNull();
    expect(await base.interviews.count()).toBe(avant);
    // Un message visible, en français, ou le champ marqué invalide — l'un des deux.
    const champInvalide = document.querySelector('[aria-invalid="true"]');
    const message = document.querySelector('.axn-champ__erreur, [role="alert"]');
    expect(champInvalide !== null || message !== null).toBe(true);
  });

  it('l’e-mail est présent mais OPTIONNEL', async () => {
    await monterNouvelEntretien();
    const courriel = await screen.findByLabelText<HTMLInputElement>(/courriel|e-mail|email/i);
    expect(courriel.required).toBe(false);
    // §33.3 : clavier virtuel adapté — « e-mail sur e-mails ».
    expect(courriel.type).toBe('email');
  });
});

// =============================================================================
// B. Les quatre états (03 §33.2) — via `ZoneEtat`
// =============================================================================
describe('les quatre états de l’écran d’entretien (03 §33.2, note §3.7)', () => {
  it('CHARGEMENT : des squelettes aux dimensions finales, jamais un spinner plein écran', async () => {
    await monterEntretien(interviewId);
    // Le premier rendu précède la lecture d'IndexedDB : c'est l'état chargement.
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('NOMINAL : la question courante, la consigne, la saisie adaptée au type — et pas d’alerte', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    // Une échelle 1-5 = cinq boutons radio (EchelleAncree).
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('VIDE : un questionnaire sans question dit QUOI FAIRE (03 §17.6) — ni squelette ni alerte', async () => {
    await monterEntretien(interviewVideId, null);
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      expect(document.querySelector('.axn-etat')).not.toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    const etat = requis(document.querySelector('.axn-etat'), 'état vide');
    const paragraphes = [...etat.querySelectorAll('p')].map((p) => p.textContent.trim());
    expect(paragraphes.filter((t) => t.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(etat.textContent).toMatch(/question/i);
  });

  it('ERREUR : une session introuvable → cause + action (role alert), pas un écran blanc', async () => {
    await monterEntretien(uuidv7(), null);
    const alerte = await screen.findByRole('alert');
    const paragraphes = [...alerte.querySelectorAll('p')].map((p) => p.textContent.trim());
    expect(paragraphes.filter((t) => t.length > 0).length).toBeGreaterThanOrEqual(3);
    // Jamais de jargon interne à l'écran (§17.4).
    expect(alerte.textContent).not.toMatch(/interview_id|mission_questions|dexie|indexeddb/i);
  });
});

// =============================================================================
// F. La disposition 3 zones — boutons fixes, ancres, progression
// =============================================================================
describe('disposition 3 zones (M3.1) — boutons fixes §17.4, ancres visibles §33.3, progression', () => {
  it('les boutons sont toujours là : Précédent · À revoir · Recherche · Suivant', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /précédent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /à revoir/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /recherche/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeTruthy();
    // « Photo » est HORS L5b (note §1) — ne pas exiger, ne pas interdire.
  });

  it('@critique les ANCRES de cotation (guidance figée) sont passées à l’échelle — visibles, pas mémorisées', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `ancres={[]}` — `EchelleAncree` rend alors
    // « Sélectionnez une note… » et l'auditeur cote de mémoire (§33.3, §32.4).
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(document.body.textContent).toContain(ANCRE_3);
  });

  it('la zone gauche affiche la progression x/y (M3.1 : « x/y répondues »)', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(document.body.textContent).toMatch(/\d+\s*(\/|sur)\s*4/);
  });

  it('Suivant / Précédent parcourent le questionnaire, sans avancement automatique après cotation (§17.4)', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    fireEvent.click(requis(screen.getAllByRole('radio')[1], 'radio 2')); // cote 2
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).toEqual({
        type: 'scale_1_5',
        v: 2,
      });
    });
    // Toujours sur la question 1 : coter n'est pas finir une question.
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => {
      expect(screen.getAllByText(TEXTE_OUI_NON).length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /précédent/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(5);
    });
  });
});

// =============================================================================
// G. Saisie adaptée au type — nombre, fourchette, non communiqué depuis l'écran
// =============================================================================
describe('saisie adaptée au type (M3.1, §27.4, §33.3) — depuis l’écran jusqu’à la base', () => {
  async function allerALaQuestionNombre() {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    for (const attendu of [TEXTE_OUI_NON, TEXTE_TEXTE, TEXTE_NOMBRE]) {
      fireEvent.click(screen.getByRole('button', { name: /suivant/i }));
      await waitFor(() => questionAffichee(attendu));
    }
  }

  it('une question « nombre » ouvre le clavier numérique (inputMode decimal), jamais `type="number"`', async () => {
    await allerALaQuestionNombre();
    const champs = [...document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
    expect(champs.length).toBeGreaterThanOrEqual(1);
    expect(champs.every((c) => c.type !== 'number')).toBe(true);
  });

  it('@critique le mode fourchette (§27.4) écrit `{type:"range", low, high}` — et refuse min > max', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : écrire `{type:'number', v: low}` en
    // ignorant la borne haute ; ou écrire la fourchette incohérente que
    // `SaisieFourchette` ne fait que SIGNALER.
    await allerALaQuestionNombre();
    // Échafaudage : la bascule d'A22 est un `role="switch"` (design system), pas un bouton.
    fireEvent.click(screen.getByRole('switch', { name: /fourchette/i }));
    const bas = await screen.findByLabelText(/borne basse/i);
    const haut = screen.getByLabelText(/borne haute/i);
    fireEvent.change(bas, { target: { value: '10' } });
    fireEvent.change(haut, { target: { value: '20' } });
    await waitFor(
      async () => {
        expect((await depotReponses.parQuestion(interviewId, Q_NOMBRE))?.value).toEqual({
          type: 'range',
          low: 10,
          high: 20,
        });
      },
      { timeout: 4_000 },
    );
    fireEvent.change(bas, { target: { value: '50' } });
    // Bien au-delà du débounce (300 ms) : un délai trop court donnait un faux
    // vert — l'écriture différée n'avait simplement pas encore eu lieu.
    await pause(1_000);
    expect(screen.getByText(/borne basse doit être inférieure/i)).toBeTruthy();
    expect((await depotReponses.parQuestion(interviewId, Q_NOMBRE))?.value).toEqual({
      type: 'range',
      low: 10,
      high: 20,
    });
  });

  it('@critique « non communiqué » depuis l’écran : motif choisi dans la liste fermée, `withheld = 1`', async () => {
    await allerALaQuestionNombre();
    fireEvent.click(screen.getByRole('button', { name: /non communiqué/i }));
    // Échafaudage : chez A22 la liste fermée est un groupe de boutons radio dans
    // une fenêtre, confirmée d'un tap — pas un `<select>`. Le motif choisi est
    // le même, et l'assertion (« confidentiel » dans la charge, `withheld = 1`) aussi.
    const motif = await screen.findByRole('radio', { name: /confidentiel/i });
    fireEvent.click(motif);
    fireEvent.click(screen.getByRole('button', { name: /^confirmer$/i }));
    await waitFor(async () => {
      const reponse = await depotReponses.parQuestion(interviewId, Q_NOMBRE);
      expect(reponse?.withheld).toBe(1);
      expect(reponse?.withheldReason).toBe('confidentiel');
    });
    // §27.4 : « traitement normal, pas une anomalie » — aucune alerte à l'écran.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// =============================================================================
// C. Raccourcis §33.3 — actifs sur l'écran, INACTIFS dans un champ de saisie
// =============================================================================
describe('raccourcis clavier (03 §33.3) — actifs hors saisie', () => {
  it('@critique « 3 » cote l’échelle à 3, et la cote est ÉCRITE localement', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    touche('3', questionAffichee(TEXTE_ECHELLE));
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).toEqual({
        type: 'scale_1_5',
        v: 3,
      });
    });
    await waitFor(() => {
      expect((screen.getAllByRole('radio')[2] as HTMLInputElement).checked).toBe(true);
    });
  });

  it('« R » marque à revoir, « A » marque non applicable — des drapeaux 0|1 dans l’index', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    // Échafaudage : chez A22, « R » et « A » ouvrent d'abord la fenêtre de motif
    // (facultatif pour l'à-revoir, M3.1) ; la confirmation est le geste qui
    // écrit. L'assertion — le drapeau, en `0|1`, dans l'index — est inchangée.
    touche('r', questionAffichee(TEXTE_ECHELLE));
    fireEvent.click(await screen.findByRole('button', { name: /^confirmer$/i }));
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.flagReview).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^confirmer$/i })).toBeNull();
    });
    touche('a', questionAffichee(TEXTE_ECHELLE));
    fireEvent.click(await screen.findByRole('button', { name: /^confirmer$/i }));
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.notApplicable).toBe(1);
    });
  });

  it('« ↵ » passe à la question suivante ; « O » / « N » répondent oui / non', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    touche('Enter', questionAffichee(TEXTE_ECHELLE));
    await waitFor(() => {
      expect(screen.getAllByText(TEXTE_OUI_NON).length).toBeGreaterThanOrEqual(1);
    });
    const cible = questionAffichee(TEXTE_OUI_NON);
    touche('o', cible);
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_OUI_NON))?.value).toEqual({
        type: 'yes_no',
        v: 'oui',
      });
    });
    touche('n', cible);
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_OUI_NON))?.value).toEqual({
        type: 'yes_no',
        v: 'non',
      });
    });
  });

  it('« / » donne le focus à la recherche hors-parcours — et le bouton « Recherche » reste visible', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    touche('/', questionAffichee(TEXTE_ECHELLE));
    await waitFor(() => {
      const actif = document.activeElement as HTMLInputElement | null;
      expect(actif?.tagName).toBe('INPUT');
      expect(actif?.type === 'search' || actif?.getAttribute('role') === 'searchbox').toBe(true);
    });
    // §17.4 V2.10 : « bouton visible : le raccourci / est un accélérateur PC, jamais le seul accès ».
    expect(screen.getByRole('button', { name: /recherche/i })).toBeTruthy();
  });

  it('@critique dans une zone de notes, « 3 », « r », « a », « e », « / » ne déclenchent RIEN', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `window.addEventListener('keydown')`
    // sans test du `data-saisie-libre` — taper « Rien à signaler » dans la note
    // cote la question à… rien, mais « R » la marque à revoir, « A » la passe en
    // N/A, « E » bascule l'écran partagé sous les yeux de l'interviewé.
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    // Point de départ connu : ni cote, ni drapeau sur la question 3 (texte libre).
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => questionAffichee(TEXTE_OUI_NON));
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => questionAffichee(TEXTE_TEXTE));
    const note = zoneDeNote();
    note.focus();
    expect(document.activeElement).toBe(note);

    for (const key of [
      'R',
      'i',
      'e',
      'n',
      ' ',
      'à',
      ' ',
      's',
      'i',
      'g',
      'n',
      'a',
      'l',
      'e',
      'r',
      '3',
      '/',
    ]) {
      fireEvent.keyDown(note, { key });
    }
    await pause(200);

    const reponse = await depotReponses.parQuestion(interviewId, Q_TEXTE);
    expect(reponse?.flagReview ?? 0).toBe(0);
    expect(reponse?.notApplicable ?? 0).toBe(0);
    expect(reponse?.value ?? null).toBeNull();
    expect(document.activeElement).toBe(note);
    expect(screen.queryByText(/écran partagé — les éléments internes sont masqués/i)).toBeNull();
  });

  it('@critique « Échap » rend le focus, et les raccourcis redeviennent actifs', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    const note = zoneDeNote();
    note.focus();
    fireEvent.keyDown(note, { key: 'Escape' });
    await waitFor(() => {
      expect(document.activeElement).not.toBe(note);
    });
    touche('4', questionAffichee(TEXTE_ECHELLE));
    await waitFor(async () => {
      expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).toEqual({
        type: 'scale_1_5',
        v: 4,
      });
    });
  });

  it('la note tapée dans la zone est ENREGISTRÉE (débouncée) — et jamais interprétée', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    const note = zoneDeNote();
    fireEvent.change(note, { target: { value: 'Rien à signaler' } });
    await waitFor(
      async () => {
        expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.note).toBe(
          'Rien à signaler',
        );
      },
      { timeout: 4_000 },
    );
  });
});

// =============================================================================
// D. Mode ÉCRAN PARTAGÉ — masque tout ce qui est interne, par non-rendu
// =============================================================================
describe('mode écran partagé (03 §33.3) — rien d’interne dans le DOM', () => {
  it('en écran PRIVÉ, les éléments internes sont là : note, bloc-notes, note volante', async () => {
    await monterEntretien(interviewPartageId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    await waitFor(() => {
      expect(contenuDom()).toContain(SENTINELLES.noteQuestion);
      expect(contenuDom()).toContain(SENTINELLES.blocNotes);
      expect(contenuDom()).toContain(SENTINELLES.noteVolante);
    });
    expect(screen.getByText(/écran privé — les éléments internes sont visibles/i)).toBeTruthy();
  });

  it('@critique en écran PARTAGÉ, aucune sentinelle interne n’est dans le DOM — ni texte, ni champ, ni motif', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `className={partage ? 'masque' : ''}` —
    // le contenu reste dans le DOM (capture, inspecteur, lecteur d'écran, et
    // `textContent` le voit). Le masquage doit être un NON-RENDU.
    await monterEntretien(interviewPartageId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    await waitFor(() => {
      expect(contenuDom()).toContain(SENTINELLES.noteQuestion);
    });

    fireEvent.click(screen.getByRole('button', { name: /passer en écran partagé/i }));
    await screen.findByText(/écran partagé — les éléments internes sont masqués/i);

    for (const sentinelle of Object.values(SENTINELLES)) {
      expect(contenuDom(), `fuite en écran partagé : ${sentinelle}`).not.toContain(sentinelle);
    }
    // Le motif de non-communiqué est interne (§33.3) : le mot ne doit pas apparaître.
    expect(document.body.textContent).not.toMatch(/confidentiel/i);
    // Aucune zone de saisie interne : ni note de question, ni bloc-notes.
    expect(document.querySelectorAll('textarea[data-saisie-libre]')).toHaveLength(0);
    // La question, elle, reste : c'est ce qu'on montre à l'interviewé.
    expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
  });

  it('@critique la touche « E » bascule le mode, et l’état est affiché en permanence dans les deux sens', async () => {
    await monterEntretien(interviewPartageId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(screen.getByText(/écran privé — les éléments internes sont visibles/i)).toBeTruthy();
    touche('e', questionAffichee(TEXTE_ECHELLE));
    await screen.findByText(/écran partagé — les éléments internes sont masqués/i);
    expect(contenuDom()).not.toContain(SENTINELLES.noteQuestion);
    touche('e', questionAffichee(TEXTE_ECHELLE));
    await screen.findByText(/écran privé — les éléments internes sont visibles/i);
    await waitFor(() => {
      expect(contenuDom()).toContain(SENTINELLES.noteQuestion);
    });
  });
});

// =============================================================================
// E. Indicateur « Enregistré » — après l'écriture locale, jamais avant
// =============================================================================
describe('indicateur « Enregistré » (03 §33.3) — la confiance se voit, et ne ment pas', () => {
  it('avant tout geste, l’indicateur ne prétend rien', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    expect(screen.queryByText(/^Enregistré/)).toBeNull();
  });

  it('@critique « Enregistré » n’apparaît qu’APRÈS que `ecrireLocal` a rendu la main', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `setEtat('enregistre')` dans le
    // gestionnaire de clic, avant (ou sans) `await ecrireLocal(...)`. La pastille
    // verdit, la tablette s'éteint, la cote n'a jamais existé.
    let liberer: (() => void) | undefined;
    const retenue = new Promise<void>((resoudre) => {
      liberer = resoudre;
    });
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    // La porte se ferme APRÈS le montage : seul le geste de l'auditeur est retenu.
    porte.intercepter = async (suite) => {
      await retenue;
      await suite();
    };
    touche('5', questionAffichee(TEXTE_ECHELLE));
    await pause(250);

    expect(screen.queryByText(/^Enregistré/)).toBeNull();
    expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).not.toEqual({
      type: 'scale_1_5',
      v: 5,
    });

    await act(async () => {
      requis(liberer, 'libération de la porte')();
      await pause(0);
    });
    await screen.findByText(/^Enregistré/);
    expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).toEqual({
      type: 'scale_1_5',
      v: 5,
    });
  });

  it('@critique si l’écriture ÉCHOUE, « Enregistré » n’apparaît pas et l’échec est VISIBLE', async () => {
    // Note §3.3-① : un échec local va « vers un état VISIBLE, jamais vers une
    // suppression ». Une pastille qui verdit sur une exception avalée est le
    // garde-fou qui annonce plus qu'il ne fait.
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    porte.intercepter = () => Promise.reject(new Error('QuotaExceededError simulée'));
    touche('1', questionAffichee(TEXTE_ECHELLE));
    await screen.findByRole('alert');
    expect(screen.queryByText(/^Enregistré/)).toBeNull();
    expect((await depotReponses.parQuestion(interviewId, Q_ECHELLE))?.value).not.toEqual({
      type: 'scale_1_5',
      v: 1,
    });
  });

  it('l’indicateur est une zone `status` (lue par les lecteurs d’écran, §33.6), et se met à jour à chaque écriture', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });
    touche('2', questionAffichee(TEXTE_ECHELLE));
    const indicateur = await screen.findByText(/^Enregistré/);
    expect(indicateur.closest('[role="status"]')).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R1 — LA SECONDE FACE DE B1, ÉPROUVÉE CHEZ LE PRODUCTEUR ET PLUS SEULEMENT
//      CHEZ LE CONSOMMATEUR (réserve R1 du rejeu A29, 2026-09-03)
// ═════════════════════════════════════════════════════════════════════════════
// Les deux cas de `revue-a29.test.tsx` posent `mockResolvedValue(false)` sur
// `PanneauNotes` : ils prouvent que le PANNEAU honore un booléen. Ils ne prouvent
// pas que `capturerNoteVolante` REND `false` quand la transaction Dexie échoue —
// qui est précisément la face trouvée en corrigeant B1, et celle qu'un `throw` sur
// l'identité n'aurait pas fermée. Ici la porte d'écriture rejette pour de vrai, et
// c'est l'écran complet qui est monté.
const NOTE_VOLANTE_R1 = 'SENTINELLE_VOLANTE_R1_KP7X2M — le circuit d’achat n’est pas écrit';

/** La zone de capture d'une note volante, dans la colonne de droite. */
function zoneCaptureVolante(): HTMLTextAreaElement {
  const zone = screen.getByLabelText(/où la mettre/i);
  if (!(zone instanceof HTMLTextAreaElement)) throw new Error('zone de capture introuvable');
  return zone;
}

describe('R1 — l’écran d’entretien ne perd pas une note volante quand l’écriture échoue', () => {
  it('CONSERVE le texte quand `ecrireLocal` rejette — la promesse ne ment plus', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });

    const zone = zoneCaptureVolante();
    fireEvent.change(zone, { target: { value: NOTE_VOLANTE_R1 } });

    // La porte se ferme APRÈS la saisie : seul l'enregistrement échoue.
    porte.intercepter = () => Promise.reject(new Error('QuotaExceededError simulée'));
    fireEvent.click(screen.getByRole('button', { name: 'Garder cette note volante' }));

    // L'échec est ANNONCÉ (03 §17.6 : une cause et une action, jamais un silence).
    await screen.findByRole('alert');
    // ET LE TEXTE EST TOUJOURS LÀ. Avant B1, il avait disparu.
    await waitFor(() => {
      expect(zoneCaptureVolante().value).toBe(NOTE_VOLANTE_R1);
    });
    // Rien n'a été rangé : la liste des notes de la session ne l'a pas reçue.
    expect(contenuDom()).not.toContain(NOTE_VOLANTE_R1.slice(0, 30) + '\u200b');
  });

  it('EFFACE le texte quand l’écriture RÉUSSIT — sinon le test précédent ne prouverait rien', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });

    const zone = zoneCaptureVolante();
    fireEvent.change(zone, { target: { value: `${NOTE_VOLANTE_R1} (celle-ci passe)` } });
    fireEvent.click(screen.getByRole('button', { name: 'Garder cette note volante' }));

    await waitFor(() => {
      expect(zoneCaptureVolante().value).toBe('');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R4 — LES TROIS ZONES SONT ÉPROUVÉES, ET PLUS SEULEMENT RENDUES
// ═════════════════════════════════════════════════════════════════════════════
// A29 a mesuré que basculer le shim `matchMedia` de `false` à `true` change la
// disposition et laisse TOUT vert : aucune assertion de la suite ne dépendait des
// trois colonnes. Le livrable-titre de L5b (03 M3.1) était rendu et jamais éprouvé.
//
// CE QUE JSDOM PERMET ET CE QU'IL NE PERMET PAS, dit avant d'asserter : la mise en
// colonnes est portée par une MEDIA QUERY CSS (`entretien.css`), et jsdom
// n'évalue pas les media queries d'une feuille de style. Prétendre vérifier ici
// « trois colonnes peintes » serait refaire le défaut qu'on répare — un test qui
// annonce autre chose que ce qu'il mesure. On éprouve donc les TROIS choses
// réellement observables, et elles suffisent à attraper une régression :
//   ① la STRUCTURE : les trois zones coexistent dans le DOM, la colonne de droite
//     porte ses champs SANS qu'aucun panneau ait été ouvert ;
//   ② le COMPORTEMENT piloté par le seuil : au-dessus, « Note » pose le focus dans
//     la note de la colonne ; en dessous, il OUVRE le panneau ;
//   ③ le CONTRAT JS ↔ CSS : le seuil de `REQUETE_TROIS_COLONNES` est le même que
//     celui déclaré par `entretien.css`. C'est la dérive que personne ne verrait.
describe('R4 — les trois zones de M3.1, au-dessus du seuil', () => {
  it('① monte les trois zones de M3.1 au premier rendu, aucune derrière un panneau', async () => {
    const { container } = await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });

    expect(container.querySelector('aside[aria-label="Blocs et progression"]')).not.toBeNull();
    expect(container.querySelector('.axn-entretien__zone--centre')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="Notes"]')).not.toBeNull();

    // CE QUE CE CAS PROUVE, ET CE QU'IL NE PROUVE PAS — réserve N1 du second
    // rejeu A29. Le commentaire précédent affirmait « c'est ce qui distingue une
    // colonne d'un panneau » : c'est FAUX, et c'est nous qui l'avions écrit.
    // Mesuré par A29 : les deux `<aside>` ne dépendent que de `!partage`, jamais
    // de la largeur — `troisColonnes` n'est consommé qu'à UN endroit
    // (`EcranEntretien.tsx`, `ouvrirNote`). Ce cas passerait donc À L'IDENTIQUE
    // à 500 px.
    //
    // Ce qu'il prouve réellement, et qui vaut d'être gardé : les trois zones de
    // M3.1 sont TOUTES MONTÉES au premier rendu, et la zone de droite porte ses
    // champs sans qu'aucun geste ait été fait — donc aucune n'est derrière un
    // panneau à ouvrir, à aucune largeur. C'est une garde de STRUCTURE.
    // La garde de DISPOSITION, elle, est portée par ② (le geste bascule de part
    // et d'autre du seuil) et ③ (le seuil du JS est celui du CSS) ; la mise en
    // colonnes PEINTE se constate sur appareil réel à P-C — voir la recette
    // manuelle de `docs/conception/LOT_L5.md` §4.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zoneCaptureVolante()).toBeTruthy();
  });

  it('② « Note » pose le focus dans la colonne, et n’ouvre PAS de panneau', async () => {
    await monterEntretien(interviewId);
    await waitFor(() => {
      expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('axn-note-de-question');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('② en DESSOUS du seuil, le même geste ouvre le panneau — la bascule existe', async () => {
    const largeur = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      await monterEntretien(interviewId);
      await waitFor(() => {
        expect(questionAffichee(TEXTE_ECHELLE)).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Note' }));
      // Le panneau s'ouvre : c'est l'autre moitié du composant, celle que le
      // shim menteur rendait SEULE pendant tout le lot.
      await screen.findByRole('dialog');
      expect(document.activeElement?.id).not.toBe('axn-note-de-question');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: largeur });
    }
  });

  it('③ le seuil du JS et celui du CSS sont le MÊME nombre', () => {
    // `media.ts` affirme en commentaire « le MÊME seuil que `entretien.css` ».
    // Une affirmation en commentaire ne tient pas : on la mesure. Si l'un des deux
    // bouge un jour, ce test le dit — sinon la disposition et la logique de
    // navigation divergeraient sans qu'aucun écran ne casse visiblement.
    // Le CSS est lu SUR LE DISQUE, pas importé : sous Vitest, un import
    // `?raw` d'une feuille de style rend une chaîne VIDE — et un `toContain`
    // sur une chaîne vide passerait pour une vérification alors qu’il ne
    // vérifie rien. Mesuré ici même avant de le remplacer.
    const css = readFileSync('apps/field/src/ecrans/entretien/entretien.css', 'utf8');
    const seuilJs = /min-width:\s*([\d.]+)rem/.exec(REQUETE_TROIS_COLONNES)?.[1];
    expect(seuilJs).toBeDefined();
    expect(css).toContain(`@media (min-width: ${String(seuilJs)}rem)`);
  });
});
