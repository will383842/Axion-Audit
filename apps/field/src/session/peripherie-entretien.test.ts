// =============================================================================
// PÉRIPHÉRIE DE L'ENTRETIEN — valeurs, fuseau, notes volantes, lectures locales
// Lot L5, incrément L5b. Écrit par A26 (09 §5.6 : A22 a écrit le code testé,
// il n'écrit pas ces tests).
//
// ── POURQUOI CE FICHIER EXISTE, ET CE QU'IL RÉPARE ──────────────────────────
// Le module critique « Machine à états de session terrain » (glob
// `apps/field/src/session/**` de `.github/coverage-critical-paths.json`) est
// mesuré sous le seuil de 90 % : lignes 83,74 % · instructions 83,74 % ·
// branches 83,81 % · **fonctions 70,49 %**. Le trou n'est PAS dans `machine.ts`
// (97,77 %) : il est sur les fichiers de périphérie, dont des FONCTIONS ENTIÈRES
// n'étaient atteintes par aucun test.
//
// Le point à ne pas manquer : la note de conception `LOT_L5.md` §4 place ce glob
// sous le seuil parce que « terminer ≠ valider » (03 §19.1 V2.10) en dépend. Or
// une règle de machine à états qui n'est vraie que dans `machine.ts` ne garantit
// rien : c'est `motifRefusEcriture` qui la fait TENIR au moment où l'auditeur
// écrit. Elle est donc testée ici, contre les quatre états.
//
// Et la couverture n'est pas l'objet : ce sont les BARÈMES jamais exercés. Les
// ONZE `TYPES_DE_REPONSE` et les SIX `TYPES_DE_SESSION` sont parcourus
// exhaustivement, par une boucle sur la liste elle-même — un type ajouté demain
// fera rougir ce fichier au lieu de passer inaperçu. « Un type non couvert est un
// barème dont personne n'a jamais vu le refus. »
//
// Traçabilité : E12 (entretiens, à-revoir), E13 (écran 3 zones, notes volantes),
// E6 (hors ligne total), E33 (RGPD — le contenu reste chiffré), E43 (DoD).
// =============================================================================
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TYPES_DE_REPONSE, type TypeDeReponse } from '@axion/shared';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotSessions } from '../local/depots/sessions.js';
import { appliquerDescente } from '../local/ecriture.js';
import { TYPES_DE_SESSION, type TypeDeSession } from '../local/formes.js';
import { PROFIL_PAR_DEFAUT } from './auditeur.js';
import { motifRefusEcriture, sourceDeSession } from './ecriture-reponses.js';
import { creerEntretien, demarrerEntretien } from './ecriture-session.js';
import { formaterDateHeure, formaterHeure } from './fuseau.js';
import { lireMissionLocale, lireMissionsLocales, lireUnites } from './missions.js';
import {
  creerNoteVolante,
  detacherNoteVolante,
  lireNotesVolantes,
  rattacherNoteVolante,
  supprimerNoteVolante,
} from './notes-volantes.js';
import {
  cleQuestionCourante,
  lireQuestionCourante,
  lireSessionCourante,
  memoriserQuestionCourante,
  memoriserSessionCourante,
} from './position.js';
import { codeDOption, codesDOptions } from './questions-adhoc.js';
import {
  colonnesDeTableau,
  COLONNE_PAR_DEFAUT,
  estTypeNumerique,
  fourchetteAdmise,
  lireValeurTypee,
  nombreDepuisSaisie,
  optionsDeQuestion,
  resumerValeur,
  saisieDepuisNombre,
  validerValeurPourQuestion,
  ValeurRefusee,
  type QuestionPourValidation,
  type ValeurTypee,
} from './valeurs.js';

// -----------------------------------------------------------------------------
// Fixtures — identifiants et sentinelles FICTIFS (invariant 2)
// -----------------------------------------------------------------------------
const HORODATAGE = '2026-09-02T08:00:00.000Z';
const MISSION_A = '0191e2a0-0000-7000-8000-0000000aa001';
const MISSION_B = '0191e2a0-0000-7000-8000-0000000aa002';
const UNITE_ACTIVE = '0191e2a0-0000-7000-8000-0000000bb001';
const UNITE_PROPOSEE = '0191e2a0-0000-7000-8000-0000000bb002';
const UNITE_FUSIONNEE = '0191e2a0-0000-7000-8000-0000000bb003';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-0000000cc001';
const CONTENU_NOTE = 'SENTINELLE_NOTE_PERIPHERIE_L5B_XQ7M2V';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function chargeMission(titre: string) {
  return {
    titre,
    companyId: '0191e2a0-0000-7000-8000-0000000dd001',
    timezone: 'Europe/Paris',
    auditLevel: 'operationnel' as const,
    geoScope: 'france' as const,
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur' as const,
  };
}

function uniteDescendue(id: string, position: number, statut: 'active' | 'proposee' | 'fusionnee') {
  return {
    table: 'orgUnits' as const,
    index: {
      id,
      missionId: MISSION_A,
      parentId: null,
      kind: 'service' as const,
      status: statut,
      position,
      clientUpdatedAt: HORODATAGE,
      supprimeLe: null,
    },
    charge: {
      name: `Unite fictive ${String(position)}`,
      countryCode: null,
      timezone: null,
      headcount: 4,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: null,
      mergedIntoId: null,
      clientCreatedAt: HORODATAGE,
    },
  };
}

let base: BaseLocale;
let coffre: Coffre;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9), {
    algo: 'argon2id',
    memoireKio: 1024,
    iterations: 1,
    parallelisme: 1,
    longueurOctets: 32,
  });
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale('axion-test-l5b-peripherie');
  await base.open();
  installerContexteLocal({ base, coffre });

  await appliquerDescente({
    missionId: MISSION_A,
    serverTime: HORODATAGE,
    prochainSince: HORODATAGE,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_A, status: 'en_cours', clientUpdatedAt: HORODATAGE, supprimeLe: null },
        charge: chargeMission('Zeta mission fictive'),
      },
      {
        table: 'missions',
        index: { id: MISSION_B, status: 'en_cours', clientUpdatedAt: HORODATAGE, supprimeLe: null },
        charge: chargeMission('Alpha mission fictive'),
      },
      uniteDescendue(UNITE_ACTIVE, 1, 'active'),
      uniteDescendue(UNITE_PROPOSEE, 2, 'proposee'),
      uniteDescendue(UNITE_FUSIONNEE, 3, 'fusionnee'),
    ],
  });
});

afterAll(() => {
  retirerContexteLocal();
  base.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. « TERMINER ≠ VALIDER » AU POINT OÙ ELLE MORD : LA GARDE À L'ÉCRITURE
// ═════════════════════════════════════════════════════════════════════════════
describe('motifRefusEcriture — la règle V2.10 tenue à l’écriture, pas seulement dans la table', () => {
  it('refuse d’écrire dans une session NON DÉMARRÉE, et dit qu’il faut l’accord', async () => {
    const id = await creerEntretien({
      missionId: MISSION_A,
      orgUnitId: UNITE_ACTIVE,
      conductedBy: AUDITEUR_ID,
      personName: 'Personne fictive',
      personRole: 'Fonction fictive',
      personEmail: null,
    });
    const session = await depotSessions.parId(id);
    expect(session).not.toBeNull();
    if (session === null) return;

    const motif = motifRefusEcriture(session);
    expect(motif).not.toBeNull();
    expect(motif).toContain('accord de participation');
  });

  it('laisse écrire une session EN COURS', async () => {
    const id = await creerEntretien({
      missionId: MISSION_A,
      orgUnitId: UNITE_ACTIVE,
      conductedBy: AUDITEUR_ID,
      personName: 'Personne fictive',
      personRole: 'Fonction fictive',
      personEmail: null,
    });
    const creee = await depotSessions.parId(id);
    if (creee === null) throw new Error('fixture : session absente');
    await demarrerEntretien(creee, PROFIL_PAR_DEFAUT, true);

    const demarree = await depotSessions.parId(id);
    if (demarree === null) throw new Error('fixture : session absente après démarrage');
    expect(motifRefusEcriture(demarree)).toBeNull();
  });

  it('laisse écrire une session TERMINÉE — terminer n’est pas valider (03 §19.1 V2.10)', async () => {
    const id = await creerEntretien({
      missionId: MISSION_A,
      orgUnitId: UNITE_ACTIVE,
      conductedBy: AUDITEUR_ID,
      personName: 'Personne fictive',
      personRole: 'Fonction fictive',
      personEmail: null,
    });
    const creee = await depotSessions.parId(id);
    if (creee === null) throw new Error('fixture : session absente');
    await demarrerEntretien(creee, PROFIL_PAR_DEFAUT, true);
    const demarree = await depotSessions.parId(id);
    if (demarree === null) throw new Error('fixture : session absente');

    // `status: 'termine'` SANS `valideeLe` : c'est très exactement l'état que la
    // règle V2.10 protège — la note de couloir reste possible après la fin de
    // l'entretien, tant que personne n'a validé.
    expect(motifRefusEcriture({ ...demarree, status: 'termine', valideeLe: null })).toBeNull();
  });

  it('REFUSE d’écrire dans une session VALIDÉE, et renvoie vers la révision tracée', async () => {
    const id = await creerEntretien({
      missionId: MISSION_A,
      orgUnitId: UNITE_ACTIVE,
      conductedBy: AUDITEUR_ID,
      personName: 'Personne fictive',
      personRole: 'Fonction fictive',
      personEmail: null,
    });
    const creee = await depotSessions.parId(id);
    if (creee === null) throw new Error('fixture : session absente');
    await demarrerEntretien(creee, PROFIL_PAR_DEFAUT, true);
    const demarree = await depotSessions.parId(id);
    if (demarree === null) throw new Error('fixture : session absente');

    const motif = motifRefusEcriture({
      ...demarree,
      status: 'termine',
      valideeLe: '2026-09-02T12:00:00.000Z',
    });
    expect(motif).not.toBeNull();
    expect(motif).toContain('révision tracée');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LES SIX TYPES DE SESSION — 04 §27.1 en dit SIX, pas cinq
// ═════════════════════════════════════════════════════════════════════════════
describe('sourceDeSession — les six types de session ont chacun leur provenance', () => {
  const ATTENDU: Readonly<Record<TypeDeSession, string>> = {
    entretien: 'entretien',
    // Un atelier EST un entretien collectif (03 §27.1) : même provenance, et
    // c'est la seule des six où deux types partagent une valeur.
    atelier: 'entretien',
    observation: 'observation',
    demonstration: 'demonstration',
    analyse_documentaire: 'document',
    releve_donnees: 'releve',
  };

  // La boucle porte sur TYPES_DE_SESSION, pas sur une liste recopiée : ajouter
  // un septième type fera échouer ce test au lieu de le laisser vert et muet.
  it.each(TYPES_DE_SESSION)('« %s » a une provenance déclarée et non vide', (kind) => {
    expect(sourceDeSession(kind)).toBe(ATTENDU[kind]);
  });

  it('couvre les six types du 04 §27.1, sans en oublier un', () => {
    expect(TYPES_DE_SESSION).toHaveLength(6);
    expect(Object.keys(ATTENDU).sort()).toEqual([...TYPES_DE_SESSION].sort());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LES ONZE TYPES DE RÉPONSE — chacun résumé, chacun validé, chacun refusé
// ═════════════════════════════════════════════════════════════════════════════
/** Une valeur bien formée pour chacun des onze types. */
const VALEUR_VALIDE: Readonly<Record<TypeDeReponse, ValeurTypee>> = {
  yes_no: { type: 'yes_no', v: 'oui' },
  scale_1_5: { type: 'scale_1_5', v: 4 },
  single_choice: { type: 'single_choice', v: 'a' },
  multi_choice: { type: 'multi_choice', v: ['a', 'b'] },
  free_text: { type: 'free_text', v: 'Une réponse libre.' },
  number: { type: 'number', v: 12 },
  percent: { type: 'percent', v: 40 },
  duration: { type: 'duration', v: 90 },
  money: { type: 'money', v: 1200, currency: 'EUR' },
  date: { type: 'date', v: '2026-09-02' },
  table: { type: 'table', v: [{ valeur: 'ligne 1' }] },
};

const OPTIONS = [
  { code: 'a', label: 'Option A' },
  { code: 'b', label: 'Option B' },
];

function question(type: TypeDeReponse, fourchette = false): QuestionPourValidation {
  return {
    answerType: type,
    allowRangeSnapshot: fourchette,
    optionsSnapshot: type === 'single_choice' || type === 'multi_choice' ? OPTIONS : null,
  };
}

describe('les onze TYPES_DE_REPONSE, un par un', () => {
  it('la liste en compte bien onze — le jour où elle change, ce test le dit', () => {
    expect(TYPES_DE_REPONSE).toHaveLength(11);
    expect(Object.keys(VALEUR_VALIDE).sort()).toEqual([...TYPES_DE_REPONSE].sort());
  });

  it.each(TYPES_DE_REPONSE)('« %s » : une valeur bien formée est ACCEPTÉE', (type) => {
    expect(validerValeurPourQuestion(question(type), VALEUR_VALIDE[type])).toEqual(
      VALEUR_VALIDE[type],
    );
  });

  it.each(TYPES_DE_REPONSE)('« %s » : une valeur d’un AUTRE type est refusée', (type) => {
    // On oppose à chaque type la valeur du type suivant dans la liste : chacun
    // des onze voit donc au moins une fois son propre refus.
    const rang = TYPES_DE_REPONSE.indexOf(type);
    const autre = TYPES_DE_REPONSE[(rang + 1) % TYPES_DE_REPONSE.length];
    if (autre === undefined) throw new Error('liste des types vide');
    expect(() => validerValeurPourQuestion(question(type), VALEUR_VALIDE[autre])).toThrow(
      ValeurRefusee,
    );
  });

  /**
   * Le résumé ATTENDU, mot pour mot, pour chacun des onze types.
   *
   * ── NON BLOQUANTE C3 (revue A29, 2026-09-03) ──────────────────────────────
   * Ce bloc n'assérait que `not.toBe('')` — une propriété COMMUNE aux onze, donc
   * une assertion qu'aucun d'eux ne peut échouer seul. Muter le `case` de six
   * types sur onze en `return 'x'` laissait toute la suite verte : le `it.each`
   * prouvait que la fonction rend quelque chose, jamais qu'elle rend LA BONNE
   * CHOSE. C'est le contraire de ce que le parcours exhaustif était censé
   * garantir — un barème dont personne n'a jamais vu le refus.
   *
   * La table ci-dessous est donc la SPÉCIFICATION du rendu, et le `it.each` la
   * vérifie type par type. Un douzième type ajouté à `TYPES_DE_REPONSE` fera
   * échouer la compilation de cette table avant même d'atteindre un test.
   */
  const RESUME_ATTENDU: Readonly<Record<TypeDeReponse, string>> = {
    yes_no: 'Oui',
    scale_1_5: '4 / 5',
    single_choice: 'Option A',
    multi_choice: 'Option A, Option B',
    free_text: 'Une réponse libre.',
    number: '12',
    percent: '40 %',
    duration: '90',
    money: '1200 EUR',
    date: '2026-09-02',
    table: '1 ligne(s)',
  };

  it.each(TYPES_DE_REPONSE)('« %s » : sa valeur se résume EXACTEMENT comme prévu', (type) => {
    expect(resumerValeur(VALEUR_VALIDE[type], OPTIONS)).toBe(RESUME_ATTENDU[type]);
  });
});

describe('resumerValeur — les formes que la zone gauche doit savoir dire', () => {
  it('rend une chaîne vide pour l’absence de réponse', () => {
    expect(resumerValeur(null)).toBe('');
  });

  it('libelle un choix connu, et rend le code brut d’un choix inconnu', () => {
    expect(resumerValeur({ type: 'single_choice', v: 'a' }, OPTIONS)).toBe('Option A');
    expect(resumerValeur({ type: 'single_choice', v: 'z' }, OPTIONS)).toBe('z');
  });

  it('dit « Non » quand la réponse est non, et l’échelle sur son maximum', () => {
    expect(resumerValeur({ type: 'yes_no', v: 'non' })).toBe('Non');
    expect(resumerValeur({ type: 'scale_1_5', v: 3 })).toBe('3 / 5');
  });

  it('résume une fourchette, bornes présentes, manquantes, et avec devise', () => {
    expect(resumerValeur({ type: 'range', low: 10, high: 20 })).toBe('entre 10 et 20');
    expect(resumerValeur({ type: 'range', low: null, high: 20 })).toBe('entre ? et 20');
    expect(resumerValeur({ type: 'range', low: 10, high: null })).toBe('entre 10 et ?');
    expect(resumerValeur({ type: 'range', low: 10, high: 20, currency: 'EUR' })).toBe(
      'entre 10 et 20 EUR',
    );
  });

  it('rend un pourcentage et un montant avec leur unité', () => {
    expect(resumerValeur({ type: 'percent', v: 40 })).toBe('40 %');
    expect(resumerValeur({ type: 'money', v: 1200.5, currency: 'EUR' })).toBe('1200,5 EUR');
  });
});

describe('la fourchette (03 §27.4) — admise seulement où le type ET la question s’y prêtent', () => {
  it.each(TYPES_DE_REPONSE)('« %s » : numérique ou non, la réponse est tranchée', (type) => {
    const numerique = (['number', 'percent', 'duration', 'money'] as const).includes(
      type as 'number',
    );
    expect(estTypeNumerique(type)).toBe(numerique);
    // Une question qui n'autorise pas la fourchette la refuse même si le type s'y prête.
    expect(fourchetteAdmise(type, false)).toBe(false);
    expect(fourchetteAdmise(type, true)).toBe(numerique);
  });

  it('refuse une fourchette sur une question qui ne l’autorise pas', () => {
    expect(() =>
      validerValeurPourQuestion(question('number', false), { type: 'range', low: 1, high: 2 }),
    ).toThrow(/n’admet pas de réponse en fourchette/);
  });

  it('refuse une fourchette sans aucune borne — ce n’est pas une réponse', () => {
    expect(() =>
      validerValeurPourQuestion(question('number', true), {
        type: 'range',
        low: null,
        high: null,
      }),
    ).toThrow(/sans aucune borne/);
  });

  it('refuse une borne basse supérieure à la borne haute', () => {
    expect(() =>
      validerValeurPourQuestion(question('number', true), { type: 'range', low: 9, high: 2 }),
    ).toThrow(/borne basse/);
  });

  it('refuse une devise sur autre chose qu’un montant', () => {
    expect(() =>
      validerValeurPourQuestion(question('percent', true), {
        type: 'range',
        low: 1,
        high: 2,
        currency: 'EUR',
      }),
    ).toThrow(/Seul un montant porte une devise/);
  });

  it('pose la devise par défaut sur un montant et sur une fourchette de montants', () => {
    expect(validerValeurPourQuestion(question('money'), { type: 'money', v: 10 })).toEqual({
      type: 'money',
      v: 10,
      currency: 'EUR',
    });
    expect(
      validerValeurPourQuestion(question('money', true), { type: 'range', low: 1, high: 2 }),
    ).toEqual({ type: 'range', low: 1, high: 2, currency: 'EUR' });
  });
});

describe('validerValeurPourQuestion — les refus qui protègent le dossier d’audit', () => {
  it('refuse une saisie qui n’a aucune forme connue', () => {
    expect(() => validerValeurPourQuestion(question('free_text'), { type: 'inconnu' })).toThrow(
      ValeurRefusee,
    );
  });

  it('refuse un code d’option absent de la question figée', () => {
    expect(() =>
      validerValeurPourQuestion(question('single_choice'), { type: 'single_choice', v: 'zzz' }),
    ).toThrow(/ne fait pas partie des options/);
    expect(() =>
      validerValeurPourQuestion(question('multi_choice'), {
        type: 'multi_choice',
        v: ['a', 'zzz'],
      }),
    ).toThrow(/ne fait pas partie des options/);
  });
});

describe('lireValeurTypee — une forme inconnue ne s’affiche pas, et n’est pas écrasée', () => {
  it('rend null pour une valeur absente', () => {
    expect(lireValeurTypee(null)).toBeNull();
    expect(lireValeurTypee(undefined)).toBeNull();
  });

  it('rend null pour une forme que le schéma ne reconnaît pas', () => {
    expect(lireValeurTypee({ type: 'venu_du_futur', v: 1 } as never)).toBeNull();
  });

  it('rend la valeur pour une forme connue', () => {
    expect(lireValeurTypee({ type: 'yes_no', v: 'oui' })).toEqual({ type: 'yes_no', v: 'oui' });
  });
});

describe('conversions de saisie — le clavier de l’iPad et le copier-coller d’un tableur', () => {
  it('lit les espaces ordinaires, insécables et fins, et la virgule décimale', () => {
    expect(nombreDepuisSaisie('1 200')).toBe(1200);
    expect(nombreDepuisSaisie('1 200')).toBe(1200);
    expect(nombreDepuisSaisie('1 200')).toBe(1200);
    expect(nombreDepuisSaisie('1,5')).toBe(1.5);
    expect(nombreDepuisSaisie('1.5')).toBe(1.5);
    expect(nombreDepuisSaisie('  42  ')).toBe(42);
    expect(nombreDepuisSaisie('-3')).toBe(-3);
    expect(nombreDepuisSaisie('.5')).toBe(0.5);
  });

  it('rend null sur une saisie vide ou illisible, plutôt qu’un zéro trompeur', () => {
    expect(nombreDepuisSaisie('')).toBeNull();
    expect(nombreDepuisSaisie('   ')).toBeNull();
    expect(nombreDepuisSaisie('douze')).toBeNull();
    expect(nombreDepuisSaisie('1,2,3')).toBeNull();
  });

  it('repose un nombre en écriture française, et rien du tout pour l’absence', () => {
    expect(saisieDepuisNombre(1.5)).toBe('1,5');
    expect(saisieDepuisNombre(42)).toBe('42');
    expect(saisieDepuisNombre(null)).toBe('');
    expect(saisieDepuisNombre(undefined)).toBe('');
  });
});

describe('options et colonnes — lecture tolérante d’un snapshot figé', () => {
  it('rend les options lisibles, et une liste vide sinon', () => {
    expect(optionsDeQuestion(OPTIONS)).toEqual(OPTIONS);
    expect(optionsDeQuestion(null)).toEqual([]);
    expect(optionsDeQuestion('pas un tableau')).toEqual([]);
  });

  it('donne une colonne unique à un tableau qui n’en déclare aucune', () => {
    expect(colonnesDeTableau(null)).toEqual([COLONNE_PAR_DEFAUT]);
    expect(colonnesDeTableau(OPTIONS)).toEqual(OPTIONS);
  });
});

describe('codeDOption — un code stable à partir d’un libellé', () => {
  it('translittère, minusculise et remplace ce qui n’est ni lettre ni chiffre', () => {
    expect(codeDOption('Oui, partiellement', 0)).toBe('oui_partiellement');
    expect(codeDOption('Écrit à la main', 1)).toBe('ecrit_a_la_main');
  });

  it('replie sur un code de rang quand le libellé ne laisse rien', () => {
    expect(codeDOption('!!!', 0)).toBe('option_1');
    expect(codeDOption('   ', 4)).toBe('option_5');
  });
});

describe('codesDOptions — deux options distinctes ne deviennent JAMAIS le même code', () => {
  it('suffixe une collision de ponctuation — non bloquante C4 de la revue A29', () => {
    // `codeDOption` écrase la ponctuation : « Oui ! » et « Oui ? » rendaient tous
    // deux `oui`. Deux choix distincts à l'écran devenaient indiscernables une
    // fois écrits dans `answers.value`, et la confusion ne se voyait qu'au
    // dépouillement — quand plus personne ne peut dire lequel a été coché.
    expect(codesDOptions(['Oui !', 'Oui ?'])).toEqual(['oui', 'oui_2']);
  });

  it('la PREMIÈRE occurrence garde le code nu — rien de ce qui marchait ne bouge', () => {
    expect(codesDOptions(['Oui', 'Non'])).toEqual(['oui', 'non']);
  });

  it('compte au-delà de deux, et n’en perd aucune', () => {
    const codes = codesDOptions(['Oui !', 'Oui ?', 'Oui…', 'Non']);
    expect(codes).toEqual(['oui', 'oui_2', 'oui_3', 'non']);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('un libellé qui VAUT DÉJÀ le suffixe généré ne prend pas sa place — réserve R3', () => {
    // Mesuré par A29 sur la première correction de C4 : ['Oui', 'Oui 2', 'Oui !']
    // rendait ['oui', 'oui_2', 'oui_2']. Le suffixe entrait en collision avec un
    // libellé qui vaut déjà `oui_2` — la correction reproduisait le défaut
    // qu'elle fermait. Un compteur par base ne suffit pas : il faut consulter
    // l'ensemble des codes DÉJÀ ATTRIBUÉS.
    expect(codesDOptions(['Oui', 'Oui 2', 'Oui !'])).toEqual(['oui', 'oui_2', 'oui_3']);
  });

  it('reste distinct quel que soit l’ORDRE des libellés', () => {
    // L'ordre change les codes ; il ne doit jamais faire réapparaître un doublon.
    for (const ordre of [
      ['Oui', 'Oui !', 'Oui 2', 'Oui ?'],
      ['Oui 2', 'Oui', 'Oui ?', 'Oui !'],
      ['Oui !', 'Oui 2', 'Oui ?', 'Oui'],
    ]) {
      const codes = codesDOptions(ordre);
      expect(new Set(codes).size, `ordre ${ordre.join('/')} → ${codes.join(',')}`).toBe(
        codes.length,
      );
    }
  });

  it('garantit l’unicité sur un lot ADVERSE de libellés fabriqués pour entrer en collision', () => {
    // La propriété est vérifiée sur la SORTIE, pas sur la recette : c'est elle
    // qu'`answers.value` doit tenir, quelle que soit la façon de l'obtenir.
    const codes = codesDOptions([
      'Oui',
      'Oui !',
      'oui_2',
      'OUI ?',
      'Oui 3',
      'oui___',
      'Oui…',
      '',
      '!!!',
    ]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code !== '')).toBe(true);
  });

  it('reste distinct même quand tous les libellés sont vides de lettres', () => {
    // `codeDOption` replie alors sur le rang : la distinction survit d'elle-même.
    const codes = codesDOptions(['!!!', '???', '***']);
    expect(new Set(codes).size).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LE FUSEAU DE MISSION — UTC en base, fuseau de mission à l'affichage
// ═════════════════════════════════════════════════════════════════════════════
describe('formatage au fuseau de mission (03 §22.2, invariant 5)', () => {
  it('rend l’heure du fuseau demandé, pas celle de la machine', () => {
    // Le même instant UTC, lu à Paris (+2 en septembre) et à Singapour (+8).
    expect(formaterHeure(HORODATAGE, 'Europe/Paris')).toBe('10:00');
    expect(formaterHeure(HORODATAGE, 'Asia/Singapore')).toBe('16:00');
  });

  it('rend la date ET l’heure, au fuseau demandé', () => {
    expect(formaterDateHeure(HORODATAGE, 'Europe/Paris')).toBe('02/09/2026 10:00');
  });

  it('accepte l’absence de fuseau sans lever — le fuseau de l’appareil sert alors', () => {
    expect(formaterHeure(HORODATAGE, undefined)).toMatch(/^\d{2}:\d{2}$/);
    expect(formaterDateHeure(HORODATAGE, undefined)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('rend une chaîne vide sur un horodatage illisible, plutôt qu’« Invalid Date »', () => {
    expect(formaterHeure('pas une date', 'Europe/Paris')).toBe('');
    expect(formaterDateHeure('', 'Europe/Paris')).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. LES NOTES VOLANTES — capture immédiate, rattachement différé, rien de perdu
// ═════════════════════════════════════════════════════════════════════════════
describe('notes volantes (03 §17.4) — le cycle complet, jusqu’à la suppression logique', () => {
  let interviewId: string;

  beforeAll(async () => {
    const id = await creerEntretien({
      missionId: MISSION_A,
      orgUnitId: UNITE_ACTIVE,
      conductedBy: AUDITEUR_ID,
      personName: 'Personne fictive',
      personRole: 'Fonction fictive',
      personEmail: null,
    });
    const session = await depotSessions.parId(id);
    if (session === null) throw new Error('fixture : session absente');
    await demarrerEntretien(session, PROFIL_PAR_DEFAUT, true);
    interviewId = id;
  });

  it('refuse une note vide — une note vide n’a rien à retenir', async () => {
    await expect(
      creerNoteVolante({
        missionId: MISSION_A,
        interviewId,
        createdBy: AUDITEUR_ID,
        content: '   ',
      }),
    ).rejects.toThrow(/rien à retenir/);
  });

  it('capture une note, lui donne un UUID v7 client, et la relit déchiffrée', async () => {
    const id = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: `  ${CONTENU_NOTE}  `,
    });
    expect(id).toMatch(UUID_V7);

    const notes = await lireNotesVolantes(interviewId);
    const note = notes.find((n) => n.id === id);
    expect(note).toBeDefined();
    // Le contenu est rendu ROGNÉ : l'espace de frappe ne devient pas de la donnée.
    expect(note?.content).toBe(CONTENU_NOTE);
    expect(note?.answerId).toBeNull();
    expect(note?.kind).toBe('note');
  });

  it('trie les notes par ordre de capture — l’UUID v7 est ordonnable dans le temps', async () => {
    const premier = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: 'note-tri-1',
    });
    const second = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: 'note-tri-2',
    });
    const ids = (await lireNotesVolantes(interviewId)).map((n) => n.id);
    expect(ids.indexOf(premier)).toBeLessThan(ids.indexOf(second));
  });

  it('rattache une note à une réponse, puis la détache — sans jamais la perdre', async () => {
    const id = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: 'note-rattachement',
    });
    const avant = (await lireNotesVolantes(interviewId)).find((n) => n.id === id);
    if (avant === undefined) throw new Error('fixture : note absente');

    const answerId = '0191e2a0-0000-7000-8000-0000000ee001';
    await rattacherNoteVolante(avant, answerId);
    const rattachee = (await lireNotesVolantes(interviewId)).find((n) => n.id === id);
    expect(rattachee?.answerId).toBe(answerId);
    expect(rattachee?.content).toBe('note-rattachement');

    if (rattachee === undefined) throw new Error('note rattachée absente');
    await detacherNoteVolante(rattachee);
    const detachee = (await lireNotesVolantes(interviewId)).find((n) => n.id === id);
    expect(detachee?.answerId).toBeNull();
    expect(detachee?.content).toBe('note-rattachement');
  });

  it('ne réécrit RIEN quand le rattachement demandé est déjà celui de la note', async () => {
    const id = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: 'note-idempotence',
    });
    const note = (await lireNotesVolantes(interviewId)).find((n) => n.id === id);
    if (note === undefined) throw new Error('fixture : note absente');

    const opsAvant = await base.outbox.count();
    // Déjà détachée : détacher à nouveau ne doit produire aucune opération.
    await detacherNoteVolante(note);
    // Rattacher deux fois au même identifiant : la seconde est sans effet.
    await rattacherNoteVolante(note, 'a');
    await rattacherNoteVolante({ ...note, answerId: 'a' }, 'a');
    expect(await base.outbox.count()).toBe(opsAvant + 1);
  });

  it('supprime LOGIQUEMENT : la note sort de la liste, la ligne reste (invariant 7)', async () => {
    const id = await creerNoteVolante({
      missionId: MISSION_A,
      interviewId,
      createdBy: AUDITEUR_ID,
      content: 'note-supprimee',
    });
    const note = (await lireNotesVolantes(interviewId)).find((n) => n.id === id);
    if (note === undefined) throw new Error('fixture : note absente');

    await supprimerNoteVolante(note);
    expect((await lireNotesVolantes(interviewId)).map((n) => n.id)).not.toContain(id);
    // La LIGNE, elle, est toujours là : rien n'est jamais supprimé en silence.
    expect(await base.attachments.get(id)).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. LECTURES LOCALES — missions, unités, position de reprise
// ═════════════════════════════════════════════════════════════════════════════
describe('lectures de contexte — l’auditeur choisit sur des noms, jamais sur des identifiants', () => {
  it('rend les missions de l’appareil, titre déchiffré, triées en français', async () => {
    const titres = (await lireMissionsLocales()).map((m) => m.titre);
    expect(titres).toContain('Zeta mission fictive');
    expect(titres.indexOf('Alpha mission fictive')).toBeLessThan(
      titres.indexOf('Zeta mission fictive'),
    );
  });

  it('rend une mission par son identifiant, et null pour une mission absente', async () => {
    expect((await lireMissionLocale(MISSION_A))?.titre).toBe('Zeta mission fictive');
    expect(await lireMissionLocale('0191e2a0-0000-7000-8000-0000000fffff')).toBeNull();
  });

  it('rend les unités actives ET proposées, jamais les fusionnées (03 §25.3)', async () => {
    const ids = (await lireUnites(MISSION_A)).map((u) => u.id);
    expect(ids).toContain(UNITE_ACTIVE);
    expect(ids).toContain(UNITE_PROPOSEE);
    expect(ids).not.toContain(UNITE_FUSIONNEE);
  });

  it('rend les unités dans l’ordre de l’arbre', async () => {
    const positions = (await lireUnites(MISSION_A)).map((u) => u.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('position de reprise (03 §17.4) — rouvrir l’app, revenir EXACTEMENT à la question', () => {
  const SESSION = '0191e2a0-0000-7000-8000-0000000aa0aa';
  const QUESTION = '0191e2a0-0000-7000-8000-0000000aa0bb';

  it('rend null tant que rien n’a été mémorisé', async () => {
    expect(await lireSessionCourante(base)).toBeNull();
    expect(await lireQuestionCourante(base, SESSION)).toBeNull();
  });

  it('mémorise puis relit la session et la question courantes', async () => {
    await memoriserSessionCourante(base, SESSION);
    await memoriserQuestionCourante(base, SESSION, QUESTION);
    expect(await lireSessionCourante(base)).toBe(SESSION);
    expect(await lireQuestionCourante(base, SESSION)).toBe(QUESTION);
  });

  it('efface la session courante quand plus aucune n’est ouverte', async () => {
    await memoriserSessionCourante(base, SESSION);
    await memoriserSessionCourante(base, null);
    expect(await lireSessionCourante(base)).toBeNull();
  });

  it('donne une clé DISTINCTE par session — deux entretiens ne se marchent pas dessus', () => {
    expect(cleQuestionCourante('a')).not.toBe(cleQuestionCourante('b'));
    expect(cleQuestionCourante(SESSION)).toContain(SESSION);
  });
});
