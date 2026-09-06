// =============================================================================
// SAISIE D'ENTRETIEN — lot L5, incrément L5b. ÉCRIT AVANT LE CODE, par A26,
// depuis `docs/conception/LOT_L5.md` (§1 ligne L5b, §2, §3.2, §4) et 03 (M3.1,
// §17.4, §27.4) — 09 §5.6 : A22 implémente sans lire ce fichier.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. « Nouvel entretien » en TROIS champs (§17.4) : nom, fonction, unité.
//   B. Les ONZE `TYPES_DE_REPONSE` : chaque saisie produit une valeur conforme
//      au schéma partagé, écrite par `ecrireLocal` (ligne + op), relue CHIFFRÉE.
//   C. Le RESSERREMENT : `valeurReponseSchema` laisse `v: unknown` DÉLIBÉRÉMENT
//      (« L5b resserre, il ne redéfinit pas », `packages/shared/src/sync.ts`).
//      Une implémentation qui accepte tout ce que le schéma partagé accepte est
//      donc plausible — et fausse : elle laisserait un 7 sur une échelle 1-5
//      partir au siège.
//   D. Mode FOURCHETTE (§27.4) : les quatre types numériques et EUX SEULS
//      (`TYPES_NUMERIQUES`), quand la question l'autorise, avec min ≤ max.
//   E. NON COMMUNIQUÉ (§27.4) : sur TOUTE question, distinct de N/A et d'à-revoir.
//   F. À-REVOIR / N-A : drapeaux `0|1` dans l'index (liste fermée §3.2), motif
//      dans la charge, jamais l'inverse.
//   G. UNE réponse par question et par session (04 §32.6) : re-répondre = même
//      ligne, nouvelle op.
//
// ── ÉCHAFAUDAGE (rencontre du 2026-09-02, DECISIONS.md [L5b]) ────────────────
//   Ce fichier a été écrit sur des hypothèses d'interface (`./entretien.js`) ;
//   A22 a livré `ecriture-session.ts` (`creerEntretien` → `non_demarre`, puis
//   `demarrerEntretien(session, profil, accord)` → `en_cours`) et
//   `ecriture-reponses.ts` (`ecrireReponse(contexte, modification)`). Par
//   arbitrage A01, SEUL l'échafaudage s'adapte — imports, amorçage, forme de la
//   saisie — et CHAQUE assertion est gardée telle quelle. Les deux adaptateurs
//   ci-dessous (`ouvrirEntretien`, `enregistrerReponse`) sont cet échafaudage :
//   ils traduisent la saisie des tests vers `ModificationReponse`, sans rien
//   valider eux-mêmes — ce qu'ils laissent passer, c'est le code qui doit le
//   refuser.
//   Le reste vient du socle L5a, tel que publié : `ecrireLocal`,
//   `appliquerDescente`, `depotReponses`, `depotQuestions`, `depotSessions`.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E6 (hors ligne
// total), E33 (sécurité / RGPD), E7 (remontée continue — chaque geste est une op).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TYPES_DE_REPONSE,
  TYPES_NUMERIQUES,
  valeurReponseSchema,
  type TypeDeReponse,
  type ValeurReponse,
} from '@axion/shared';
import { z } from 'zod';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotQuestions, type QuestionLocale } from '../local/depots/questions.js';
import { depotReponses } from '../local/depots/reponses.js';
import { depotSessions } from '../local/depots/sessions.js';
import { appliquerDescente } from '../local/ecriture.js';
import { jetonsDeRecherche, MOTIFS_NON_COMMUNIQUE } from '../local/formes.js';
import { PROFIL_PAR_DEFAUT } from './auditeur.js';
import { ecrireReponse, type ModificationReponse } from './ecriture-reponses.js';
import { creerEntretien, demarrerEntretien } from './ecriture-session.js';
import type { ValeurTypee } from './valeurs.js';

// -----------------------------------------------------------------------------
// Adaptateurs — la forme de saisie de ce fichier, traduite vers celle d'A22
// -----------------------------------------------------------------------------
type MotifNonCommunique = (typeof MOTIFS_NON_COMMUNIQUE)[number];

/** Un geste de saisie tel que ce fichier le formule : absent = inchangé, `null` = levé. */
interface SaisieReponse {
  readonly value?: ValeurReponse | null;
  readonly note?: string | null;
  readonly aRevoir?: { readonly motif: string | null } | null;
  readonly nonApplicable?: { readonly motif: string | null } | null;
  readonly nonCommunique?: { readonly motif: MotifNonCommunique } | null;
  readonly horsParcours?: boolean;
}

/**
 * Traduction champ à champ, SANS validation : la valeur passe telle quelle
 * (le typage `ValeurTypee` d'A22 est un contrat de compilation, pas une garde
 * d'exécution — c'est précisément ce que la section C éprouve).
 */
function traduire(saisie: SaisieReponse): ModificationReponse {
  const modification: {
    -readonly [K in keyof ModificationReponse]: ModificationReponse[K];
  } = {};
  if (saisie.value !== undefined) modification.value = saisie.value as ValeurTypee | null;
  if (saisie.note !== undefined) modification.note = saisie.note;
  if (saisie.aRevoir !== undefined) {
    modification.flagReview = saisie.aRevoir !== null;
    modification.reviewReason = saisie.aRevoir?.motif ?? null;
  }
  if (saisie.nonApplicable !== undefined) {
    modification.notApplicable = saisie.nonApplicable !== null;
    modification.naReason = saisie.nonApplicable?.motif ?? null;
  }
  if (saisie.nonCommunique !== undefined) {
    modification.withheld = saisie.nonCommunique !== null;
    modification.withheldReason = saisie.nonCommunique?.motif ?? null;
  }
  if (saisie.horsParcours !== undefined) modification.horsParcours = saisie.horsParcours;
  return modification;
}

interface DemandeEntretienDeTest {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly conductedBy: string;
  readonly personName: string;
  readonly personRole: string;
  readonly personEmail?: string | null;
}

/**
 * « Nouvel entretien » puis démarrage AVEC accord de participation : la session
 * rendue est `en_cours`. Le libellé de la phrase-script n'est pas éprouvé ici
 * (en attente de validation par Williams) — seul l'accord l'est.
 */
async function ouvrirEntretien(demande: DemandeEntretienDeTest): Promise<string> {
  const id = await creerEntretien({ ...demande, personEmail: demande.personEmail ?? null });
  const session = await depotSessions.parId(id);
  if (session === null) throw new Error(`échafaudage : session ${id} introuvable après création`);
  await demarrerEntretien(session, PROFIL_PAR_DEFAUT, true);
  return id;
}

async function enregistrerReponse(demande: {
  readonly missionId: string;
  readonly interviewId: string;
  readonly question: QuestionLocale;
  readonly saisie: SaisieReponse;
}): Promise<{ id: string }> {
  const session = await depotSessions.parId(demande.interviewId);
  if (session === null) throw new Error(`échafaudage : session ${demande.interviewId} absente`);
  const ecrite = await ecrireReponse(
    { session, question: demande.question },
    traduire(demande.saisie),
  );
  return { id: ecrite.id };
}

// -----------------------------------------------------------------------------
// Fixture — mission FICTIVE (invariant 2), un questionnaire d'un item par type
// -----------------------------------------------------------------------------
const HORODATAGE = '2026-09-02T08:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Une question par type — l'id serveur est fixe, la position suit l'ordre des 11. */
function idQuestion(type: TypeDeReponse): string {
  const rang = TYPES_DE_REPONSE.indexOf(type) + 1;
  return `0191e2a0-0000-7000-8000-0000000000${rang.toString().padStart(2, '0')}`;
}
/** Une seconde question `number` SANS fourchette autorisée (04 `allow_range=false`). */
const QUESTION_NUMBER_SANS_FOURCHETTE = '0191e2a0-0000-7000-8000-0000000000a0';

const OPTIONS_FICTIVES = [
  { code: 'opt_a', label: 'Option A', score: 5 },
  { code: 'opt_b', label: 'Option B', score: 3 },
  { code: 'opt_c', label: 'Option C', score: 0 },
];

const TEXTES: Record<TypeDeReponse, string> = {
  yes_no: 'Existe-t-il un processus documenté ?',
  scale_1_5: 'Niveau de maturité du processus',
  single_choice: 'Outil principal utilisé',
  multi_choice: 'Canaux de collecte des données',
  free_text: 'Décrivez le flux de traitement',
  number: 'Nombre de dossiers traités par mois',
  percent: 'Part des tâches automatisées',
  duration: 'Temps hebdomadaire consacré à la saisie',
  money: 'Budget annuel de l’outil',
  date: 'Date de la dernière revue',
  table: 'Inventaire des outils du service',
};

async function descendreLaMission(): Promise<void> {
  const questions = TYPES_DE_REPONSE.map((type, rang) => ({
    table: 'missionQuestions' as const,
    index: {
      id: idQuestion(type),
      missionId: MISSION_ID,
      position: rang + 1,
      texteSnapshot: TEXTES[type],
      motsCles: jetonsDeRecherche(TEXTES[type]),
      answerType: type,
      criticality: 'important' as const,
      clientUpdatedAt: HORODATAGE,
      supprimeLe: null,
    },
    charge: {
      questionId: `0191e2a0-0000-7000-8000-00000000b0${(rang + 1).toString().padStart(2, '0')}`,
      questionVersion: 1,
      guidanceSnapshot:
        type === 'scale_1_5'
          ? '1 = aucun processus documenté · 3 = documenté mais non appliqué · 5 = documenté, appliqué, mesuré'
          : null,
      optionsSnapshot:
        type === 'single_choice' || type === 'multi_choice' ? OPTIONS_FICTIVES : null,
      scoringSnapshot: null,
      weightSnapshot: 1,
      // 04 : `allow_range` n'a de sens que sur number/percent/duration/money.
      allowRangeSnapshot: (TYPES_NUMERIQUES as readonly string[]).includes(type),
      addedAdHoc: false,
      blockCode: 'bloc_fictif',
    },
  }));

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
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'operationnel',
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
          headcount: 12,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
      ...questions,
      {
        table: 'missionQuestions',
        index: {
          id: QUESTION_NUMBER_SANS_FOURCHETTE,
          missionId: MISSION_ID,
          position: 12,
          texteSnapshot: 'Effectif du service',
          motsCles: jetonsDeRecherche('Effectif du service'),
          answerType: 'number',
          criticality: 'informatif',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          questionId: '0191e2a0-0000-7000-8000-00000000b0a0',
          questionVersion: 1,
          guidanceSnapshot: null,
          optionsSnapshot: null,
          scoringSnapshot: null,
          weightSnapshot: 0,
          allowRangeSnapshot: false,
          addedAdHoc: false,
          blockCode: 'bloc_fictif',
        },
      },
    ],
  });
}

let base: BaseLocale;
let coffre: Coffre;
const questions = new Map<string, QuestionLocale>();

/** Lève avec un message clair plutôt qu'un `!` : la fixture doit exister. */
function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`fixture : ${libelle} manquant`);
  return valeur;
}

async function question(type: TypeDeReponse): Promise<QuestionLocale> {
  const id = idQuestion(type);
  const memo = questions.get(id);
  if (memo !== undefined) return memo;
  const lue = await depotQuestions.parId(id);
  if (lue === null) throw new Error(`question fictive « ${type} » absente`);
  questions.set(id, lue);
  return lue;
}

/** Un entretien neuf par test : l'unicité (04 §32.6) se juge PAR session. */
let interviewId: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(5), {
    algo: 'argon2id',
    memoireKio: 1024,
    iterations: 1,
    parallelisme: 1,
    longueurOctets: 32,
  });
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale('axion-test-l5b-entretien');
  await base.open();
  installerContexteLocal({ base, coffre });
  await descendreLaMission();
}, 20_000);

beforeEach(async () => {
  interviewId = await ouvrirEntretien({
    missionId: MISSION_ID,
    orgUnitId: ORG_UNIT_ID,
    conductedBy: AUDITEUR_ID,
    personName: 'Interlocuteur fictif',
    personRole: 'Responsable fictif',
  });
});

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete('axion-test-l5b-entretien');
});

// -----------------------------------------------------------------------------
// Aides de lecture — la ligne BRUTE (index en clair) et l'op de l'outbox
// -----------------------------------------------------------------------------
async function ligneBrute(id: string): Promise<Record<string, unknown>> {
  const ligne = (await base.answers.get(id)) as unknown as Record<string, unknown> | undefined;
  if (ligne === undefined) throw new Error(`réponse ${id} absente`);
  return ligne;
}

async function opsDeLaReponse(id: string) {
  return base.outbox.where('entiteId').equals(id).sortBy('opId');
}

async function repondre(type: TypeDeReponse, saisie: SaisieReponse): Promise<string> {
  const { id } = await enregistrerReponse({
    missionId: MISSION_ID,
    interviewId,
    question: await question(type),
    saisie,
  });
  return id;
}

// =============================================================================
// A. « Nouvel entretien » — trois champs (03 §17.4), et ce qu'ils produisent
// =============================================================================
describe('nouvel entretien — trois champs (03 §17.4, M3.2)', () => {
  it('@critique rend un UUID v7 GÉNÉRÉ SUR L’APPAREIL, et la session existe en base', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : un id v4 (`crypto.randomUUID()`), ou un id
    // laissé au serveur — le premier casse l'ordre de file (11 §4, opId/entityId
    // ordonnables), le second casse le hors-ligne intégral (invariant 1, P1-4).
    expect(interviewId).toMatch(UUID_V7);
    const session = await depotSessions.parId(interviewId);
    expect(session).not.toBeNull();
    expect(session?.missionId).toBe(MISSION_ID);
    expect(session?.orgUnitId).toBe(ORG_UNIT_ID);
  });

  it('@critique la session démarre EN COURS, de type entretien — pas « non démarrée »', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : créer la ligne en `non_demarre` et
    // attendre un second geste. Conséquences réelles : le verrou reste à 15 min
    // au lieu de 60 (05 §9.7), et le service worker s'autoriserait à activer
    // une mise à jour en pleine saisie (05 §31-1) — les deux se règlent sur
    // `status = 'en_cours'` (voir `depotSessions.sessionEnCours`).
    const session = await depotSessions.parId(interviewId);
    expect(session?.kind).toBe('entretien');
    expect(session?.status).toBe('en_cours');
    expect(await depotSessions.sessionEnCours()).toBe(true);
  });

  it('les trois champs sont portés — nom et fonction CHIFFRÉS, l’unité en clair dans l’index', async () => {
    const session = await depotSessions.parId(interviewId);
    expect(session?.personName).toBe('Interlocuteur fictif');
    expect(session?.personRole).toBe('Responsable fictif');
    expect(session?.conductedBy).toBe(AUDITEUR_ID);
    // L'e-mail est OPTIONNEL (M3.2) : absent, il est `null`, pas une chaîne vide.
    expect(session?.personEmail).toBeNull();

    const brute = (await base.interviews.get(interviewId)) as unknown as Record<string, unknown>;
    expect(brute.orgUnitId).toBe(ORG_UNIT_ID);
    expect(brute).not.toHaveProperty('personName');
    expect(brute).not.toHaveProperty('personRole');
  });

  it('le mode par défaut d’un entretien est « sur_site » (04 : défaut APPLICATIF, note L5 §5-5)', async () => {
    // Le 04 ne peut pas le poser en SQL (« un DEFAULT SQL conditionnel n'existe
    // pas ») : c'est donc à la création terrain de le faire. Si A01 tranche
    // « serveur uniquement », ce test est le lieu de la divergence à tracer.
    const session = await depotSessions.parId(interviewId);
    expect(session?.mode).toBe('sur_site');
  });

  it('@critique la création est UNE op `interview` dans l’outbox, sur ce même id', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `base.interviews.put()` direct, sans
    // passer par `ecrireLocal` — la session ne remonterait jamais au siège.
    // Échafaudage : chez A22 la création et le démarrage sont deux gestes ;
    // l'assertion porte sur la CRÉATION seule, donc sur une session tout juste
    // créée — puis vérifie que le démarrage n'est, lui aussi, qu'une op de plus.
    const id = await creerEntretien({
      missionId: MISSION_ID,
      orgUnitId: ORG_UNIT_ID,
      conductedBy: AUDITEUR_ID,
      personName: 'Interlocuteur fictif',
      personRole: 'Responsable fictif',
      personEmail: null,
    });
    const ops = await base.outbox.where('entiteId').equals(id).toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entite).toBe('interview');
    expect(ops[0]?.action).toBe('upsert');
    expect(ops[0]?.statut).toBe('en_attente');

    await demarrerEntretien(
      requis(await depotSessions.parId(id), 'session'),
      PROFIL_PAR_DEFAUT,
      true,
    );
    const apresDemarrage = await base.outbox.where('entiteId').equals(id).toArray();
    expect(apresDemarrage).toHaveLength(2);
    expect(apresDemarrage.every((op) => op.entite === 'interview')).toBe(true);
  });

  it('un nom vide est refusé — les trois champs sont les trois SEULS obligatoires (§17.4)', async () => {
    const avant = await base.interviews.count();
    await expect(
      ouvrirEntretien({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        conductedBy: AUDITEUR_ID,
        personName: '   ',
        personRole: 'Responsable fictif',
      }),
    ).rejects.toThrow();
    expect(await base.interviews.count()).toBe(avant);
  });

  it('@critique sans accord de participation, la session ne démarre PAS ; avec, elle passe en cours (03 M3.2 V2.10, 06 §10.4)', async () => {
    // Le libellé de la phrase-script n'est pas éprouvé (en attente de validation
    // par Williams) : seul compte le refus sans accord, et l'horodatage avec.
    const id = await creerEntretien({
      missionId: MISSION_ID,
      orgUnitId: ORG_UNIT_ID,
      conductedBy: AUDITEUR_ID,
      personName: 'Interlocuteur fictif non démarré',
      personRole: 'Responsable fictif',
      personEmail: null,
    });
    const creee = requis(await depotSessions.parId(id), 'session créée');
    expect(creee.status).toBe('non_demarre');
    expect(creee.consentGiven).toBe(false);

    await expect(demarrerEntretien(creee, PROFIL_PAR_DEFAUT, false)).rejects.toThrow();
    const toujoursCreee = requis(await depotSessions.parId(id), 'session après refus');
    expect(toujoursCreee.status).toBe('non_demarre');
    expect(toujoursCreee.consentedAt).toBeNull();

    await demarrerEntretien(toujoursCreee, PROFIL_PAR_DEFAUT, true);
    const demarree = requis(await depotSessions.parId(id), 'session démarrée');
    expect(demarree.status).toBe('en_cours');
    expect(demarree.consentGiven).toBe(true);
    expect(demarree.consentedAt).not.toBeNull();
    expect(demarree.informationNoticeVersion).not.toBeNull();
  });
});

// =============================================================================
// B. Les ONZE types — une saisie valide par type, conforme au schéma partagé
// =============================================================================
/** Une valeur valide par type, et ce qu'on attend de la relire. */
const SAISIE_VALIDE: Record<TypeDeReponse, ValeurReponse> = {
  yes_no: { type: 'yes_no', v: 'oui' },
  scale_1_5: { type: 'scale_1_5', v: 4 },
  single_choice: { type: 'single_choice', v: 'opt_b' },
  multi_choice: { type: 'multi_choice', v: ['opt_a', 'opt_c'] },
  free_text: { type: 'free_text', v: 'Un flux décrit en une phrase.' },
  number: { type: 'number', v: 1250 },
  percent: { type: 'percent', v: 37.5 },
  duration: { type: 'duration', v: 6 },
  money: { type: 'money', v: 48_000, currency: 'EUR' },
  date: { type: 'date', v: '2026-06-15' },
  table: {
    type: 'table',
    v: [
      { outil: 'Tableur', usage: 'Suivi' },
      { outil: 'Messagerie', usage: 'Échanges' },
    ],
  },
};

describe('les onze types de réponse — la saisie produit une valeur conforme (03 M1.1, 04 `answers.value`)', () => {
  it('la table de saisies couvre EXACTEMENT les onze types — un type oublié ici est un type jamais éprouvé', () => {
    expect(Object.keys(SAISIE_VALIDE).sort()).toEqual([...TYPES_DE_REPONSE].sort());
    expect(TYPES_DE_REPONSE).toHaveLength(11);
  });

  it.each(TYPES_DE_REPONSE)(
    '@critique « %s » : écrit, relu CHIFFRÉ à l’identique, conforme au schéma partagé',
    async (type) => {
      // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `switch` sur le type qui oublie un cas
      // et tombe dans un `default` muet — la valeur est perdue, le geste semble
      // avoir réussi. C'est le « TYPES_DE_REPONSE non exhaustivement traité » de
      // la note §4.
      const id = await repondre(type, { value: SAISIE_VALIDE[type] });
      expect(id).toMatch(UUID_V7);

      const relue = await depotReponses.parQuestion(interviewId, idQuestion(type));
      expect(relue).not.toBeNull();
      expect(relue?.value).toEqual(SAISIE_VALIDE[type]);
      expect(valeurReponseSchema.safeParse(relue?.value).success).toBe(true);
      expect(relue?.questionTextSnapshot).toBe(TEXTES[type]);
      expect(relue?.source).toBe('entretien');

      // Rien de la valeur dans l'index en clair.
      const brute = await ligneBrute(id);
      expect(brute).not.toHaveProperty('value');
      expect(JSON.stringify(brute)).not.toContain(JSON.stringify(SAISIE_VALIDE[type].type));
    },
  );

  it.each(TYPES_DE_REPONSE)(
    '@critique « %s » : le geste est UNE op `answer` dont la charge chiffrée porte la valeur',
    async (type) => {
      const id = await repondre(type, { value: SAISIE_VALIDE[type] });
      const ops = await opsDeLaReponse(id);
      expect(ops).toHaveLength(1);
      expect(ops[0]?.entite).toBe('answer');
      expect(ops[0]?.action).toBe('upsert');
      expect(ops[0]?.missionId).toBe(MISSION_ID);
      const charge = await coffre.dechiffrer(
        requis(ops[0], 'op').charge,
        z.looseObject({ value: z.unknown(), interviewId: z.string() }),
      );
      expect(charge.value).toEqual(SAISIE_VALIDE[type]);
      expect(charge.interviewId).toBe(interviewId);
    },
  );

  it('« money » sans devise explicite est stocké avec « EUR » (04, 03 §22.2)', async () => {
    const id = await repondre('money', { value: { type: 'money', v: 900 } });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('money'));
    expect(relue?.id).toBe(id);
    expect(relue?.value).toEqual({ type: 'money', v: 900, currency: 'EUR' });
  });

  it('« yes_no » accepte « non » aussi — et rien d’autre que les deux valeurs de `VALEURS_OUI_NON`', async () => {
    await repondre('yes_no', { value: { type: 'yes_no', v: 'non' } });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('yes_no'));
    expect(relue?.value).toEqual({ type: 'yes_no', v: 'non' });
  });

  it('les drapeaux d’une réponse ordinaire sont tous à 0 — des NOMBRES, pas des booléens', async () => {
    // IndexedDB n'indexe pas `true`/`false` (en-tête de `formes.ts`) : un `false`
    // rendrait la réponse INTROUVABLE par l'index `flagReview`, sans erreur.
    const id = await repondre('free_text', { value: SAISIE_VALIDE.free_text });
    const brute = await ligneBrute(id);
    expect(brute.flagReview).toBe(0);
    expect(brute.notApplicable).toBe(0);
    expect(brute.withheld).toBe(0);
    expect(brute.horsParcours).toBe(0);
  });
});

// =============================================================================
// C. Le RESSERREMENT — ce que le schéma partagé laisse passer et que L5b refuse
// =============================================================================
interface CasRefus {
  readonly libelle: string;
  readonly type: TypeDeReponse;
  readonly valeur: unknown;
}

const REFUS: readonly CasRefus[] = [
  {
    libelle: 'échelle 1-5 : 7 est hors échelle',
    type: 'scale_1_5',
    valeur: { type: 'scale_1_5', v: 7 },
  },
  {
    libelle: 'échelle 1-5 : 0 est hors échelle',
    type: 'scale_1_5',
    valeur: { type: 'scale_1_5', v: 0 },
  },
  {
    libelle: 'échelle 1-5 : 2,5 n’est pas une note',
    type: 'scale_1_5',
    valeur: { type: 'scale_1_5', v: 2.5 },
  },
  {
    libelle: 'échelle 1-5 : « 3 » en chaîne n’est pas une note',
    type: 'scale_1_5',
    valeur: { type: 'scale_1_5', v: '3' },
  },
  {
    libelle: 'oui/non : « peut-être »',
    type: 'yes_no',
    valeur: { type: 'yes_no', v: 'peut-être' },
  },
  {
    libelle: 'oui/non : un booléen (le 04 dit « oui »/« non »)',
    type: 'yes_no',
    valeur: { type: 'yes_no', v: true },
  },
  {
    libelle: 'choix unique : code absent des options figées',
    type: 'single_choice',
    valeur: { type: 'single_choice', v: 'opt_z' },
  },
  {
    libelle: 'choix multiple : un code inconnu parmi des connus',
    type: 'multi_choice',
    valeur: { type: 'multi_choice', v: ['opt_a', 'opt_z'] },
  },
  {
    libelle: 'choix multiple : une chaîne au lieu d’une liste',
    type: 'multi_choice',
    valeur: { type: 'multi_choice', v: 'opt_a' },
  },
  { libelle: 'nombre : une chaîne', type: 'number', valeur: { type: 'number', v: '12' } },
  { libelle: 'nombre : NaN', type: 'number', valeur: { type: 'number', v: Number.NaN } },
  { libelle: 'pourcentage : une chaîne', type: 'percent', valeur: { type: 'percent', v: '50 %' } },
  { libelle: 'durée : négative', type: 'duration', valeur: { type: 'duration', v: -3 } },
  {
    libelle: 'monnaie : devise sur 4 lettres',
    type: 'money',
    valeur: { type: 'money', v: 10, currency: 'EURO' },
  },
  {
    libelle: 'date : pas une date ISO (AAAA-MM-JJ)',
    type: 'date',
    valeur: { type: 'date', v: '15/06/2026' },
  },
  { libelle: 'date : 31 février', type: 'date', valeur: { type: 'date', v: '2026-02-31' } },
  { libelle: 'texte libre : un nombre', type: 'free_text', valeur: { type: 'free_text', v: 42 } },
  {
    libelle: 'tableau : pas une liste de lignes',
    type: 'table',
    valeur: { type: 'table', v: 'ligne 1' },
  },
  // Le type de la VALEUR doit être celui de la QUESTION.
  {
    libelle: 'type discordant : une note d’échelle sur une question oui/non',
    type: 'yes_no',
    valeur: { type: 'scale_1_5', v: 3 },
  },
  {
    libelle: 'type discordant : un texte sur une question nombre',
    type: 'number',
    valeur: { type: 'free_text', v: 'douze' },
  },
  {
    libelle: 'type discordant : une monnaie sur une question durée',
    type: 'duration',
    valeur: { type: 'money', v: 5, currency: 'EUR' },
  },
];

describe('resserrement — ce que `v: unknown` laisse passer et que L5b doit refuser', () => {
  it.each(REFUS)(
    '@critique refuse « $libelle » et n’écrit RIEN (ni ligne, ni op)',
    async ({ type, valeur }) => {
      // IMPLÉMENTATION FAUSSE ATTRAPÉE : valider avec `valeurReponseSchema` seul.
      // Il accepte TOUT ce qui précède (le `v` y est `unknown` par décision), et
      // la valeur part au serveur, qui la refusera — ou pire, la scorera.
      const reponsesAvant = await base.answers.count();
      const opsAvant = await base.outbox.count();
      await expect(repondre(type, { value: valeur as ValeurReponse })).rejects.toThrow();
      expect(await base.answers.count()).toBe(reponsesAvant);
      expect(await base.outbox.count()).toBe(opsAvant);
    },
  );

  it('@critique une saisie refusée ne dégrade pas une réponse VALIDE déjà enregistrée', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : écrire la ligne PUIS valider — la ligne
    // valide est écrasée par la ligne invalide avant que l'erreur ne remonte.
    const id = await repondre('scale_1_5', { value: { type: 'scale_1_5', v: 4 } });
    await expect(repondre('scale_1_5', { value: { type: 'scale_1_5', v: 9 } })).rejects.toThrow();
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('scale_1_5'));
    expect(relue?.id).toBe(id);
    expect(relue?.value).toEqual({ type: 'scale_1_5', v: 4 });
    expect(await opsDeLaReponse(id)).toHaveLength(1);
  });
});

// =============================================================================
// D. Mode FOURCHETTE (03 §27.4) — quatre types, min ≤ max, question consentante
// =============================================================================
describe('mode fourchette (03 §27.4, 04 `allow_range`)', () => {
  it.each(TYPES_NUMERIQUES)(
    '@critique « %s » avec fourchette autorisée : `{type:"range", low, high}` écrit et relu',
    async (type) => {
      const fourchette: ValeurReponse =
        type === 'money'
          ? { type: 'range', low: 40_000, high: 60_000, currency: 'EUR' }
          : { type: 'range', low: 10, high: 20 };
      await repondre(type, { value: fourchette });
      const relue = await depotReponses.parQuestion(interviewId, idQuestion(type));
      expect(relue?.value).toEqual(fourchette);
      expect(valeurReponseSchema.safeParse(relue?.value).success).toBe(true);
      // Une fourchette est une RÉPONSE, pas un refus : `withheld` reste à 0.
      expect((await ligneBrute(requis(relue, 'réponse').id)).withheld).toBe(0);
    },
  );

  it('@critique « money » en fourchette sans devise reçoit « EUR » (04 : « + currency si money »)', async () => {
    await repondre('money', { value: { type: 'range', low: 1, high: 2 } });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('money'));
    expect(relue?.value).toEqual({ type: 'range', low: 1, high: 2, currency: 'EUR' });
  });

  it.each(TYPES_NUMERIQUES)(
    '@critique « %s » : borne basse > borne haute est refusée',
    async (type) => {
      // IMPLÉMENTATION FAUSSE ATTRAPÉE : faire confiance à `SaisieFourchette`, qui
      // n'affiche qu'un message (`fourchetteIncoherente`) et n'empêche rien.
      const opsAvant = await base.outbox.count();
      await expect(
        repondre(type, { value: { type: 'range', low: 50, high: 10 } }),
      ).rejects.toThrow();
      expect(await base.outbox.count()).toBe(opsAvant);
    },
  );

  it('une fourchette sans AUCUNE borne n’est pas une réponse — refusée', async () => {
    await expect(
      repondre('number', { value: { type: 'range', low: null, high: null } }),
    ).rejects.toThrow();
  });

  const NON_NUMERIQUES = TYPES_DE_REPONSE.filter(
    (type) => !(TYPES_NUMERIQUES as readonly string[]).includes(type),
  );
  it.each(NON_NUMERIQUES)(
    '@critique « %s » n’admet PAS la fourchette (`TYPES_NUMERIQUES` : « seuls types fourchette »)',
    async (type) => {
      await expect(repondre(type, { value: { type: 'range', low: 1, high: 2 } })).rejects.toThrow();
    },
  );

  it('@critique une question `number` dont `allow_range` est FAUX refuse la fourchette', async () => {
    // Le 04 pose `allow_range BOOL DEFAULT false` : la fourchette est une
    // AUTORISATION portée par la question figée, pas une propriété du type.
    const sansFourchette = await depotQuestions.parId(QUESTION_NUMBER_SANS_FOURCHETTE);
    expect(sansFourchette?.allowRangeSnapshot).toBe(false);
    await expect(
      enregistrerReponse({
        missionId: MISSION_ID,
        interviewId,
        question: requis(sansFourchette, 'question sans fourchette'),
        saisie: { value: { type: 'range', low: 1, high: 2 } },
      }),
    ).rejects.toThrow();
    // Le même item accepte un nombre EXACT : le refus porte sur la fourchette seule.
    await enregistrerReponse({
      missionId: MISSION_ID,
      interviewId,
      question: requis(sansFourchette, 'question sans fourchette'),
      saisie: { value: { type: 'number', v: 12 } },
    });
    const relue = await depotReponses.parQuestion(interviewId, QUESTION_NUMBER_SANS_FOURCHETTE);
    expect(relue?.value).toEqual({ type: 'number', v: 12 });
  });
});

// =============================================================================
// E. NON COMMUNIQUÉ (03 §27.4) — sur TOUTE question, traitement normal
// =============================================================================
describe('non communiqué (03 §27.4) — « sur toute question », distinct de N/A et d’à-revoir', () => {
  it.each(TYPES_DE_REPONSE)(
    '@critique « %s » : refus sans valeur → `withheld = 1` en index, motif dans la charge, valeur nulle',
    async (type) => {
      // IMPLÉMENTATION FAUSSE ATTRAPÉE : exiger une valeur pour enregistrer quoi
      // que ce soit — l'auditeur ne pourrait pas consigner un refus sans inventer
      // un chiffre. Ou : n'offrir « non communiqué » qu'aux types numériques.
      const id = await repondre(type, { nonCommunique: { motif: 'confidentiel' } });
      const brute = await ligneBrute(id);
      expect(brute.withheld).toBe(1);
      expect(brute.notApplicable).toBe(0);
      expect(brute.flagReview).toBe(0);
      expect(brute).not.toHaveProperty('withheldReason');

      const relue = await depotReponses.parQuestion(interviewId, idQuestion(type));
      expect(relue?.withheldReason).toBe('confidentiel');
      expect(relue?.value).toBeNull();
    },
  );

  it.each(MOTIFS_NON_COMMUNIQUE)(
    'le motif « %s » est admis (liste fermée du 04)',
    async (motif) => {
      await repondre('money', { nonCommunique: { motif } });
      const relue = await depotReponses.parQuestion(interviewId, idQuestion('money'));
      expect(relue?.withheldReason).toBe(motif);
    },
  );

  it('@critique un motif hors de la liste fermée est refusé', async () => {
    await expect(
      repondre('money', {
        nonCommunique: { motif: 'secret_defense' as (typeof MOTIFS_NON_COMMUNIQUE)[number] },
      }),
    ).rejects.toThrow();
  });

  it('le refus se complète d’une note (§27.4 : « + note ») — la note vit dans la charge', async () => {
    const id = await repondre('money', {
      nonCommunique: { motif: 'autre' },
      note: 'Le directeur financier n’est pas disponible cette semaine.',
    });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('money'));
    expect(relue?.note).toContain('directeur financier');
    expect(await ligneBrute(id)).not.toHaveProperty('note');
  });

  it('lever le refus remet `withheld` à 0 et efface le motif', async () => {
    const id = await repondre('money', { nonCommunique: { motif: 'confidentiel' } });
    await repondre('money', { nonCommunique: null });
    expect((await ligneBrute(id)).withheld).toBe(0);
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('money'));
    expect(relue?.withheldReason).toBeNull();
  });

  it('les trois statuts sont indépendants : non communiqué + à revoir + N/A coexistent sans s’effacer', async () => {
    // §27.4 : « Distinct de « N/A » (sans objet) et de « à revoir » (à creuser) ».
    // Un « statut » unique à trois valeurs serait l'implémentation naturelle — et
    // fausse : poser un à-revoir sur un refus effacerait le refus.
    const id = await repondre('money', { nonCommunique: { motif: 'confidentiel' } });
    await repondre('money', { aRevoir: { motif: 'Revenir avec le NDA signé' } });
    const brute = await ligneBrute(id);
    expect(brute.withheld).toBe(1);
    expect(brute.flagReview).toBe(1);
    expect((await depotReponses.avancement(interviewId)).nonCommuniquees).toBe(1);
    expect((await depotReponses.avancement(interviewId)).aRevoir).toBe(1);
  });
});

// =============================================================================
// F. À-REVOIR et N/A — drapeau en clair (0|1), motif chiffré, jamais l'inverse
// =============================================================================
describe('à-revoir et non applicable (M3.1) — drapeaux dans l’index, motifs dans la charge', () => {
  it('@critique « à revoir » : `flagReview = 1` (nombre), motif CHIFFRÉ, valeur conservée', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE (deux) : `flagReview: true` — la réponse
    // sort de l'index et le compteur du cockpit ment ; `reviewReason` recopié
    // dans l'index « pour l'afficher dans la liste » — un motif est une phrase
    // d'auditeur sur un salarié, c'est une donnée personnelle (§3.2).
    const id = await repondre('scale_1_5', { value: { type: 'scale_1_5', v: 2 } });
    await repondre('scale_1_5', { aRevoir: { motif: 'Vérifier auprès du responsable' } });

    const brute = await ligneBrute(id);
    expect(brute.flagReview).toBe(1);
    expect(brute.flagReview).not.toBe(true);
    expect(brute).not.toHaveProperty('reviewReason');

    const relue = await depotReponses.parQuestion(interviewId, idQuestion('scale_1_5'));
    expect(relue?.reviewReason).toBe('Vérifier auprès du responsable');
    expect(relue?.value).toEqual({ type: 'scale_1_5', v: 2 });
    expect(relue?.flagReview).toBe(1);
  });

  it('« à revoir » sans motif est admis (M3.1 : « motif optionnel »)', async () => {
    const id = await repondre('yes_no', { aRevoir: { motif: null } });
    expect((await ligneBrute(id)).flagReview).toBe(1);
  });

  it('lever « à revoir » remet le drapeau à 0 et efface le motif', async () => {
    const id = await repondre('yes_no', { aRevoir: { motif: 'à creuser' } });
    await repondre('yes_no', { aRevoir: null });
    expect((await ligneBrute(id)).flagReview).toBe(0);
    expect(
      (await depotReponses.parQuestion(interviewId, idQuestion('yes_no')))?.reviewReason,
    ).toBeNull();
  });

  it('@critique « non applicable » : `notApplicable = 1`, motif chiffré', async () => {
    const id = await repondre('table', {
      nonApplicable: { motif: 'Pas d’outillage dans ce service' },
    });
    const brute = await ligneBrute(id);
    expect(brute.notApplicable).toBe(1);
    expect(brute.withheld).toBe(0);
    expect(brute).not.toHaveProperty('naReason');
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('table'));
    expect(relue?.naReason).toBe('Pas d’outillage dans ce service');
  });

  it('les drapeaux sont INDEXÉS : la réponse à revoir se retrouve par `where("flagReview")`', async () => {
    const id = await repondre('date', { aRevoir: { motif: 'date à confirmer' } });
    const trouvees = await base.answers.where('flagReview').equals(1).primaryKeys();
    expect(trouvees).toContain(id);
  });

  it('l’avancement (calculé LOCALEMENT, note §3.5) reflète les gestes de cette session seule', async () => {
    await repondre('yes_no', { value: { type: 'yes_no', v: 'oui' } });
    await repondre('scale_1_5', { value: { type: 'scale_1_5', v: 3 }, aRevoir: { motif: null } });
    await repondre('table', { nonApplicable: { motif: null } });
    await repondre('money', { nonCommunique: { motif: 'confidentiel' } });
    expect(await depotReponses.avancement(interviewId)).toEqual({
      repondues: 4,
      aRevoir: 1,
      nonApplicables: 1,
      nonCommuniquees: 1,
      horsParcours: 0,
    });
  });
});

// =============================================================================
// G. UNE réponse par question et par session (04 §32.6) — re-répondre = même ligne
// =============================================================================
describe('unicité (session, question) — 04 §32.6, 05 §9.3', () => {
  it('@critique re-répondre à la même question garde le MÊME id : une ligne, deux ops', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `uuidv7()` à chaque geste — deux lignes
    // locales pour une question, et le serveur refuse la seconde (UNIQUE).
    const premier = await repondre('scale_1_5', { value: { type: 'scale_1_5', v: 2 } });
    const second = await repondre('scale_1_5', { value: { type: 'scale_1_5', v: 5 } });
    expect(second).toBe(premier);

    const lignes = await base.answers
      .where('[interviewId+missionQuestionId]')
      .equals([interviewId, idQuestion('scale_1_5')])
      .toArray();
    expect(lignes).toHaveLength(1);
    expect(await opsDeLaReponse(premier)).toHaveLength(2);

    const relue = await depotReponses.parQuestion(interviewId, idQuestion('scale_1_5'));
    expect(relue?.value).toEqual({ type: 'scale_1_5', v: 5 });
  });

  it('@critique un geste PARTIEL conserve ce qu’il ne touche pas (valeur, note, drapeaux)', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : reconstruire la charge depuis la seule
    // `saisie` — la note disparaît quand on cote, la cote disparaît quand on note.
    await repondre('free_text', { value: { type: 'free_text', v: 'Première version' } });
    await repondre('free_text', { note: 'Note prise pendant la réponse' });
    await repondre('free_text', { aRevoir: { motif: 'compléter' } });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('free_text'));
    expect(relue?.value).toEqual({ type: 'free_text', v: 'Première version' });
    expect(relue?.note).toBe('Note prise pendant la réponse');
    expect(relue?.reviewReason).toBe('compléter');
    expect(relue?.flagReview).toBe(1);
  });

  it('les ops d’une même réponse sont ordonnées dans la file (opId v7 croissant, 11 §4)', async () => {
    const id = await repondre('number', { value: { type: 'number', v: 1 } });
    await repondre('number', { value: { type: 'number', v: 2 } });
    await repondre('number', { value: { type: 'number', v: 3 } });
    const ops = await opsDeLaReponse(id);
    expect(ops).toHaveLength(3);
    const valeurs: number[] = [];
    for (const op of ops) {
      const charge = await coffre.dechiffrer(
        op.charge,
        z.looseObject({ value: z.looseObject({ v: z.number() }) }),
      );
      valeurs.push(charge.value.v);
    }
    expect(valeurs).toEqual([1, 2, 3]);
    expect(ops.every((op) => UUID_V7.test(op.opId))).toBe(true);
  });

  it('la même question dans DEUX sessions donne deux lignes distinctes', async () => {
    const id1 = await repondre('yes_no', { value: { type: 'yes_no', v: 'oui' } });
    const autreSession = await ouvrirEntretien({
      missionId: MISSION_ID,
      orgUnitId: ORG_UNIT_ID,
      conductedBy: AUDITEUR_ID,
      personName: 'Second interlocuteur fictif',
      personRole: 'Opérateur fictif',
    });
    const { id: id2 } = await enregistrerReponse({
      missionId: MISSION_ID,
      interviewId: autreSession,
      question: await question('yes_no'),
      saisie: { value: { type: 'yes_no', v: 'non' } },
    });
    expect(id2).not.toBe(id1);
    expect((await depotReponses.parQuestion(interviewId, idQuestion('yes_no')))?.value).toEqual({
      type: 'yes_no',
      v: 'oui',
    });
    expect((await depotReponses.parQuestion(autreSession, idQuestion('yes_no')))?.value).toEqual({
      type: 'yes_no',
      v: 'non',
    });
  });

  it('la révision locale reste ≥ 1 et le siège archive (05 §9.3 : le terrain n’émet pas d’op de révision)', async () => {
    const id = await repondre('date', { value: { type: 'date', v: '2026-01-01' } });
    await repondre('date', { value: { type: 'date', v: '2026-02-01' } });
    const relue = await depotReponses.parQuestion(interviewId, idQuestion('date'));
    expect(relue?.id).toBe(id);
    expect(relue?.revision).toBeGreaterThanOrEqual(1);
    const ops = await opsDeLaReponse(id);
    expect(ops.every((op) => op.action === 'upsert')).toBe(true);
  });
});
