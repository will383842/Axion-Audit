// =============================================================================
// FIXTURE E2E — LA MISSION CANONIQUE **FIL-GC** SUR UN APPAREIL TERRAIN
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// 09 §4bis : « Deux missions canoniques vivent en FIXTURES de test dès L1 […]
// Toute porte exige `@filrouge` vert sur LES DEUX missions. C'est aussi la
// preuve continue du "de la TPE au grand groupe" : la même app, le même
// parcours, aux deux échelles. »
//
// Mesuré le 2026-09-09 : le dépôt tient FIL-GC **côté serveur uniquement**
// (`apps/api/tests/aide/fil-rouge.ts` — 150 unités, 4 niveaux, 135 questions,
// 60 sessions). Côté TERRAIN, `e2e/fixtures/appareil-terrain.ts` ne connaît que
// FIL-TPE : un appareil, une unité, trois questions. Le segment L5 du fil rouge
// ne pouvait donc pas être vert « sur les deux », faute d'appareil à la seconde
// échelle. Ce fichier pose cet appareil-là, et rien d'autre.
//
// ── LES DIMENSIONS NE SONT PAS INVENTÉES ICI ────────────────────────────────
// Elles sont RECOPIÉES des constantes canoniques du 09 §4bis, telles que
// `apps/api/tests/aide/fil-rouge.ts` les fige déjà : 1 groupe + 5 filiales +
// 24 directions + 120 services = 150 unités sur 4 niveaux, et 135 questions
// figées. Elles sont réaffirmées ici en toutes lettres parce que ce module ne
// peut pas importer un fichier de tests de l'API (projets TypeScript disjoints),
// et l'écart entre les deux est GARDÉ par une assertion du fil rouge lui-même.
//
// ── CE QUE CETTE ÉCHELLE CHANGE VRAIMENT POUR LE TERRAIN ────────────────────
// Les 8 100 réponses de FIL-GC sont une volumétrie de SIÈGE : sur l'appareil, un
// auditeur ne porte que ses propres lignes (invariant 6). Ce qui change au doigt,
// et que cette fixture met sous test, c'est : une liste déroulante d'unités à
// 150 entrées, un parcours de 135 questions, et un arbre de 4 niveaux dont les
// libellés doivent rester lisibles sur une tablette.
//
// ── AUCUNE CRYPTO RÉÉCRITE (09 §5.7) ────────────────────────────────────────
// Comme `appareil-terrain.ts`, dont ce module reprend la méthode telle quelle :
// les octets viennent du code de PRODUCTION (`deriverKek`, `creerCoffreNeuf`,
// `Coffre.chiffrer`) ; la fixture ne fait que les ranger.
//
// Invariant 2 : entreprise et unités FICTIVES, engendrées par un compteur.
// Aucune référence client, nulle part.
//
// Traçabilité : E6 (hors ligne total) · E23 (intuitif à toute échelle) · E33.
// =============================================================================
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
  type Coffre,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import {
  jetonsDeRecherche,
  type ChargeMission,
  type ChargeMissionQuestion,
  type ChargeOrgUnit,
  type IndexMission,
  type IndexMissionQuestion,
  type IndexOrgUnit,
} from '../../apps/field/src/local/formes.js';
import type { GrainesAppareil } from './appareil-terrain.js';

/**
 * Les dimensions canoniques de FIL-GC (09 §4bis).
 *
 * `unites` est la SOMME de l'arbre, et le fil rouge vérifie cette somme : deux
 * chiffres qui se contredisent dans une fixture donnent un test qui mesure autre
 * chose que ce qu'il annonce.
 */
export const DIMENSIONS_FIL_GC = {
  arbre: { groupes: 1, filiales: 5, directions: 24, services: 120 },
  unites: 150,
  niveaux: 4,
  questions: 135,
} as const;

const MISSION_ID = '01920000-0002-7000-8000-000000000001';
const SOCIETE_ID = '01920000-0002-7000-8000-000000000003';
const AUDITEUR_ID = '01920000-0002-7000-8000-000000000004';
const QUESTION_BANQUE_ID = '01920000-0002-7000-8000-00000000000a';
const APPAREIL_ID = '01920000-0002-7000-8000-0000000000ff';

/** Le fuseau de la mission — le même que le navigateur de test, comme FIL-TPE. */
const FUSEAU_MISSION = 'Europe/Paris';

/** Un identifiant v7 déterministe : la trace d'échec se relit, un tirage non. */
function identifiant(famille: number, rang: number): string {
  const suffixe = (famille * 100_000 + rang).toString(16).padStart(12, '0');
  return `01920000-0002-7000-8000-${suffixe}`;
}

/** Le nom d'une unité, par niveau — lisible sur une tablette, et fictif. */
const NOMS_DE_NIVEAU = ['Groupe', 'Filiale', 'Direction', 'Service'] as const;

/** Les `kind` du 04 (`TYPES_UNITE`), dans l'ordre des quatre niveaux du §4bis. */
const KIND_PAR_NIVEAU: readonly IndexOrgUnit['kind'][] = [
  'groupe',
  'filiale',
  'direction',
  'service',
];

export interface UniteFilGc {
  readonly id: string;
  readonly nom: string;
  readonly niveau: number;
  readonly parentId: string | null;
}

/**
 * L'arbre des 150 unités, sur 4 niveaux, engendré et non recopié.
 *
 * Le rattachement est DÉTERMINISTE (modulo sur le rang) : chaque exécution
 * produit le même arbre, donc la même trace d'échec.
 */
export function arbreFilGc(): readonly UniteFilGc[] {
  const { groupes, filiales, directions, services } = DIMENSIONS_FIL_GC.arbre;
  const parNiveau: UniteFilGc[][] = [];
  const tous: UniteFilGc[] = [];
  const comptes = [groupes, filiales, directions, services];

  for (const [niveau, compte] of comptes.entries()) {
    const parents = niveau === 0 ? [] : (parNiveau[niveau - 1] ?? []);
    const courant: UniteFilGc[] = [];
    for (let rang = 0; rang < compte; rang += 1) {
      const parent = niveau === 0 ? null : (parents[rang % parents.length]?.id ?? null);
      const unite: UniteFilGc = {
        id: identifiant(niveau + 1, rang + 1),
        nom: `${NOMS_DE_NIVEAU[niveau] ?? 'Unité'} fictive ${String(rang + 1)}`,
        niveau: niveau + 1,
        parentId: parent,
      };
      courant.push(unite);
      tous.push(unite);
    }
    parNiveau.push(courant);
  }
  return tous;
}

/**
 * Les 135 questions figées, à la même échelle que le questionnaire de FIL-GC.
 *
 * Trois types en rotation — texte libre, oui/non, échelle 1-5 — parce que le
 * parcours terrain doit rester praticable au clavier ET au doigt sur les trois.
 * La première est un texte libre : c'est celle que le fil rouge saisit.
 */
export interface QuestionFilGc {
  readonly id: string;
  readonly texte: string;
  readonly type: IndexMissionQuestion['answerType'];
  readonly guidance: string | null;
}

/**
 * Les ancres §32.4 de FIL-GC, sous leur forme LUE.
 *
 * Déclarées ici, et la chaîne `guidance_fr` est FABRIQUÉE à partir d'elles : le
 * fil rouge compare l'écran à cette liste, jamais à une seconde copie du même
 * texte qui dériverait le jour où l'une des deux est retouchée. Même méthode que
 * `ANCRES_ECHELLE_FIL_TPE`. Les niveaux 1, 3 et 5 — et eux seuls — parce que
 * c'est ce que `ANCRES_REQUISES` exige et ce que la banque contient réellement.
 */
export const ANCRES_ECHELLE_FIL_GC = [
  { niveau: 1, libelle: 'le sujet n’est pas traité et personne n’en répond' },
  { niveau: 3, libelle: 'une pratique existe, elle dépend des personnes en place' },
  { niveau: 5, libelle: 'la pratique est outillée, mesurée et revue périodiquement' },
] as const;

const ANCRES_GC = ANCRES_ECHELLE_FIL_GC.map(
  (ancre) => `${String(ancre.niveau)} = ${ancre.libelle}`,
).join(' · ');

const CONSIGNE_GC =
  'Faire raconter un cas récent de bout en bout avant de coter, ' +
  'en demandant qui décide, qui exécute et qui vérifie.';

export function questionsFilGc(): readonly QuestionFilGc[] {
  const types: IndexMissionQuestion['answerType'][] = ['free_text', 'yes_no', 'scale_1_5'];
  const questions: QuestionFilGc[] = [];
  for (let rang = 0; rang < DIMENSIONS_FIL_GC.questions; rang += 1) {
    const type = types[rang % types.length] ?? 'free_text';
    questions.push({
      id: identifiant(9, rang + 1),
      texte: `Question fictive ${String(rang + 1)} — ${LIBELLES_QUESTION[rang % LIBELLES_QUESTION.length] ?? 'thème générique'}`,
      type,
      guidance: type === 'scale_1_5' ? `${ANCRES_GC} · ${CONSIGNE_GC}` : null,
    });
  }
  return questions;
}

/** De quoi que les 135 énoncés ne soient pas 135 fois le même mot. */
const LIBELLES_QUESTION = [
  'suivi des commandes',
  'traçabilité des décisions',
  'gestion des habilitations',
  'traitement des réclamations',
  'passation entre équipes',
  'contrôle des dépenses',
  'sauvegarde des données',
  'accueil des nouveaux arrivants',
  'planification des interventions',
] as const;

/**
 * La mission FIL-GC telle que les tests la nomment à l'écran.
 *
 * `unite` est LUE dans l'arbre engendré, jamais recopiée : une constante qui
 * double un générateur se périme à la première retouche du générateur, et le
 * test échoue alors sur « option introuvable » — un message qui ne désigne pas
 * sa cause. (Mesuré : c'est exactement ce qui est arrivé au premier jet.)
 */
const PREMIERE_FEUILLE = arbreFilGc().find((unite) => unite.niveau === 4);

export const MISSION_FIL_GC = {
  id: MISSION_ID,
  titre: 'FIL-GC — groupe industriel fictif',
  /** L'unité où le fil rouge tient sa session : une FEUILLE de l'arbre. */
  unite: PREMIERE_FEUILLE?.nom ?? '',
} as const;

async function chiffrerIdentite(coffre: Coffre, id: string): Promise<ReturnType<Coffre['chiffrer']>> {
  return coffre.chiffrer({ id, profil: 'guide_strict' });
}

/**
 * Fabrique le coffre de l'appareil ET les lignes de FIL-GC qu'il protège.
 *
 * La forme rendue est EXACTEMENT celle de `semerAppareil` (FIL-TPE) : le même
 * `planterAppareil` la range, et le fil rouge ne connaît donc qu'un seul chemin
 * d'installation, quelle que soit l'échelle.
 */
export async function semerAppareilFilGc(motDePasse: string): Promise<GrainesAppareil> {
  const sel = genererSel();
  const kek = await deriverKek(motDePasse, sel, PARAMETRES_KDF_DEFAUT);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);
  const instant = new Date().toISOString();

  const mission: IndexMission = {
    id: MISSION_ID,
    status: 'en_cours',
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const chargeMission: ChargeMission = {
    titre: MISSION_FIL_GC.titre,
    companyId: SOCIETE_ID,
    timezone: FUSEAU_MISSION,
    auditLevel: 'standard',
    geoScope: 'multi_pays',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };

  const unites = [];
  for (const [rang, unite] of arbreFilGc().entries()) {
    const index: IndexOrgUnit = {
      id: unite.id,
      missionId: MISSION_ID,
      parentId: unite.parentId,
      // Le `kind` suit le NIVEAU, avec les valeurs du 04 (`TYPES_UNITE`) :
      // groupe → filiale → direction → service, l'arbre exact du 09 §4bis.
      kind: KIND_PAR_NIVEAU[unite.niveau - 1] ?? 'service',
      status: 'active',
      position: rang + 1,
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeOrgUnit = {
      name: unite.nom,
      countryCode: 'FR',
      timezone: FUSEAU_MISSION,
      headcount: 80,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: null,
      mergedIntoId: null,
      clientCreatedAt: instant,
    };
    unites.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  const questions = [];
  for (const [rang, question] of questionsFilGc().entries()) {
    const index: IndexMissionQuestion = {
      id: question.id,
      missionId: MISSION_ID,
      position: rang + 1,
      texteSnapshot: question.texte,
      motsCles: jetonsDeRecherche(question.texte),
      answerType: question.type,
      criticality: 'important',
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeMissionQuestion = {
      questionId: QUESTION_BANQUE_ID,
      questionVersion: 1,
      guidanceSnapshot: question.guidance,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: null,
      allowRangeSnapshot: false,
      addedAdHoc: false,
      blockCode: 'B1',
    };
    questions.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  return {
    tables: {
      missions: [{ ...mission, charge: await coffre.chiffrer(chargeMission) }],
      orgUnits: unites,
      missionQuestions: questions,
    },
    meta: [
      {
        cle: 'coffre',
        valeur: { sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT, dekEnveloppee },
      },
      { cle: 'appareil', valeur: APPAREIL_ID },
      { cle: 'appareil:libelle', valeur: 'Appareil de tournée FIL-GC (fixture E2E)' },
      { cle: 'auth:utilisateur', valeur: await chiffrerIdentite(coffre, AUDITEUR_ID) },
      { cle: `mission:embarquee:${MISSION_ID}`, valeur: instant },
      { cle: `mission:persistance:${MISSION_ID}`, valeur: instant },
    ],
  };
}
