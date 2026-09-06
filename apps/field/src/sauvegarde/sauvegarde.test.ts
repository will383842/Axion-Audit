// =============================================================================
// EXPORT DE SECOURS `.axionbackup` — lot L5, incrément L5c.
// **ÉCRIT AVANT LE CODE** (TDD, `CLAUDE.md` §4 : « export de secours chiffré :
// tests écrits AVANT »). Auteur : A23 — même limite déclarée qu'en
// `agenda/validation.test.ts`, et A26 passera derrière.
//
// ── CE QUE CE FICHIER PROUVE, ET POURQUOI CHAQUE POINT COMPTE ───────────────
//   A. LA CLÉ DÉRIVE DU MOT DE PASSE, PAS DE LA DEK D'APPAREIL (11 §4). C'est
//      LA propriété qui rend la sauvegarde utile : un appareil volé, cassé ou
//      noyé est remplacé, et le fichier s'ouvre sur le NOUVEL appareil. Le test
//      décisif restaure sur une base neuve avec une **DEK différente** — si
//      l'export s'appuyait sur la DEK, ce test échouerait, et lui seul.
//   B. LE FICHIER NE LAISSE RIEN EN CLAIR. Le sérialisé complet est balayé à la
//      recherche de sentinelles personnelles (nom, courriel, note, valeur de
//      réponse). L'en-tête est en clair PAR CONSTRUCTION (il porte le sel qu'il
//      faut pour dériver) : il ne doit donc contenir aucune de ces sentinelles.
//   C. UN MAUVAIS MOT DE PASSE EST UN REFUS, JAMAIS UN CONTENU PARTIEL.
//   D. LA FUSION PAR UUID (11 §4) : « une op locale plus récente n'est jamais
//      écrasée par l'import ». Testé dans les deux sens — la ligne protégée
//      reste, la ligne non protégée est restaurée.
//   E. L'IMPORT NE TOUCHE PAS L'HORLOGE. Une sauvegarde faite il y a trois jours
//      ne doit pas rejouer le décalage serveur de ce jour-là : toutes les
//      écritures suivantes porteraient une heure fausse (05 §9.2, §9.4).
//   F. L'OUTBOX EST DANS LA SAUVEGARDE (11 §4 : « données de mission locales +
//      outbox ») — c'est-à-dire précisément le travail que le serveur n'a pas
//      encore reçu, donc le seul qui puisse disparaître avec l'appareil.
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours), E6 (hors ligne
// total), E33 (sécurité / RGPD).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale, CLES_META, cleEmbarquement, ecrireMeta, lireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depuisBase64, versBase64 } from '../local/enveloppe.js';
import { EXTENSION_SAUVEGARDE, nomFichierSauvegarde } from './format.js';
import { depotSessions } from '../local/depots/sessions.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { decalageActuelMs, reglerDecalage, reinitialiserHorloge } from '../local/horloge.js';
import {
  exporterSauvegarde,
  importerSauvegarde,
  MotDePasseExportInvalideError,
  MotDePasseSauvegardeInvalideError,
  SauvegardeIllisibleError,
  VERSION_FORMAT_SAUVEGARDE,
} from './sauvegarde.js';

const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const HORODATAGE = '2026-09-04T07:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f3de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c201';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e201';
const SESSION_ID = '0191e2a0-0000-7000-8000-000000000201';

/** Sentinelles personnelles : aucune ne doit apparaître dans le fichier sérialisé. */
const NOM_SENTINELLE = 'Sentinelle-Nom-Interlocuteur';
const COURRIEL_SENTINELLE = 'sentinelle.courriel@exemple.invalid';
const NOTE_SENTINELLE = 'Sentinelle-Note-Confidentielle';

const NOM_SOURCE = 'axion-test-l5c-sauvegarde-source';
const NOM_CIBLE = 'axion-test-l5c-sauvegarde-cible';

/** Paramètres Argon2id allégés — la robustesse du KDF n'est pas l'objet ici. */
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let baseSource: BaseLocale;
let coffreSource: Coffre;

async function coffreNeuf(sel: number): Promise<Coffre> {
  const kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(sel), KDF_TEST);
  return ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}

/** Remplit une base avec une mission FICTIVE (invariant 2) et une session. */
async function remplir(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'collecte',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          titre: 'Mission fictive de recette',
          companyId: '0191e2a0-0000-7000-8000-00000000a201',
          timezone: 'Europe/Paris',
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
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
          headcount: 8,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
    ],
  });

  // Une session écrite par le PORT : elle laisse donc une op dans l'outbox —
  // c'est exactement le travail que la sauvegarde doit emporter.
  await ecrireLocal({
    entite: 'interview',
    id: SESSION_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'planifie',
      scheduledAt: HORODATAGE,
    },
    charge: {
      conductedBy: AUDITEUR_ID,
      mode: 'sur_site',
      personName: NOM_SENTINELLE,
      personRole: 'Responsable fictif',
      personServiceId: null,
      personEmail: COURRIEL_SENTINELLE,
      participants: null,
      generalNotes: NOTE_SENTINELLE,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: HORODATAGE,
      informationNoticeVersion: 'v1',
      noticeShownAt: HORODATAGE,
      scheduledDurationMin: 45,
      startedAt: HORODATAGE,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: HORODATAGE,
    },
  });
}

beforeAll(async () => {
  baseSource = new BaseLocale(NOM_SOURCE);
  await baseSource.open();
}, 20_000);

beforeEach(async () => {
  reinitialiserHorloge();
  await baseSource.delete();
  await baseSource.open();
  // UN COFFRE NEUF PAR TEST, et ce n'est pas de la prudence : `retirerContexteLocal`
  // VERROUILLE le coffre qu'il tenait (`local/contexte.ts` le dit dans son en-tête).
  // Un coffre partagé entre deux tests serait fermé par le premier `afterEach` et
  // tous les suivants échoueraient sur `CoffreVerrouilleError` — pour une raison
  // d'échafaudage, pas de code testé.
  coffreSource = await coffreNeuf(11);
  installerContexteLocal({ base: baseSource, coffre: coffreSource });
  await ecrireMeta(baseSource, CLES_META.libelleAppareil, 'Tablette de recette');
  await remplir();
});

afterEach(() => {
  retirerContexteLocal();
  reinitialiserHorloge();
});

afterAll(async () => {
  baseSource.close();
  await Dexie.delete(NOM_SOURCE);
  await Dexie.delete(NOM_CIBLE);
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LA PROPRIÉTÉ QUI FAIT TOUT : restaurable sur un AUTRE appareil
// ─────────────────────────────────────────────────────────────────────────────
describe('la clé dérive du MOT DE PASSE, jamais de la DEK d’appareil (11 §4)', () => {
  it('@critique une sauvegarde se restaure sur un appareil dont la DEK est DIFFÉRENTE', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    retirerContexteLocal();

    // Un SECOND appareil : base neuve, DEK neuve — rien de commun avec la source
    // hormis le mot de passe de l'auditeur.
    const coffreCible = await coffreNeuf(99);
    const baseCible = new BaseLocale(NOM_CIBLE);
    await baseCible.open();
    installerContexteLocal({ base: baseCible, coffre: coffreCible });

    const rapport = await importerSauvegarde(fichier, MOT_DE_PASSE);
    expect(rapport.lignesRestaurees).toBeGreaterThan(0);

    const session = await depotSessions.parId(SESSION_ID);
    expect(session).not.toBeNull();
    expect(session?.personName).toBe(NOM_SENTINELLE);
    expect(session?.personEmail).toBe(COURRIEL_SENTINELLE);
    expect(session?.generalNotes).toBe(NOTE_SENTINELLE);
    expect(session?.clientUpdatedAt).not.toBeUndefined();

    retirerContexteLocal();
    baseCible.close();
    await Dexie.delete(NOM_CIBLE);
  }, 30_000);

  it('@critique l’en-tête déclare sa version de format, sa mission et son sel', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });

    expect(fichier.enTete.versionFormat).toBe(VERSION_FORMAT_SAUVEGARDE);
    expect(fichier.enTete.missionId).toBe(MISSION_ID);
    expect(fichier.enTete.libelleAppareil).toBe('Tablette de recette');
    expect(fichier.enTete.kdf.algo).toBe('argon2id');
    expect(fichier.enTete.kdf.sel.length).toBeGreaterThan(0);
    expect(Date.parse(fichier.enTete.creeLe)).not.toBeNaN();
  }, 30_000);

  it('@critique deux exports successifs ne portent JAMAIS le même sel', async () => {
    const a = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const b = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(a.enTete.kdf.sel).not.toBe(b.enTete.kdf.sel);
    expect(a.charge.n).not.toBe(b.charge.n);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// B. RIEN EN CLAIR DANS LE FICHIER
// ─────────────────────────────────────────────────────────────────────────────
describe('le fichier sérialisé ne laisse AUCUNE donnée personnelle en clair', () => {
  it('@critique aucune sentinelle ne survit à la sérialisation complète', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const serialise = JSON.stringify(fichier);

    for (const sentinelle of [NOM_SENTINELLE, COURRIEL_SENTINELLE, NOTE_SENTINELLE]) {
      expect(serialise).not.toContain(sentinelle);
    }
  }, 30_000);

  it('@critique le mot de passe lui-même n’apparaît nulle part', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(JSON.stringify(fichier)).not.toContain(MOT_DE_PASSE);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LES REFUS
// ─────────────────────────────────────────────────────────────────────────────
describe('un refus est un refus — jamais un contenu partiel', () => {
  it('@critique un MAUVAIS mot de passe est refusé, et rien n’est écrit', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    await baseSource.interviews.clear();

    await expect(importerSauvegarde(fichier, 'mauvais-mot-de-passe')).rejects.toBeInstanceOf(
      MotDePasseSauvegardeInvalideError,
    );
    expect(await baseSource.interviews.count()).toBe(0);
  }, 30_000);

  it('@critique un fichier dont la forme est fausse est refusé par le schéma, avant tout déchiffrement', async () => {
    await expect(
      importerSauvegarde({ enTete: { versionFormat: 1 } }, MOT_DE_PASSE),
    ).rejects.toBeInstanceOf(SauvegardeIllisibleError);
  });

  it('@critique une version de format INCONNUE est refusée — jamais lue « au mieux »', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const futur = { ...fichier, enTete: { ...fichier.enTete, versionFormat: 999 } };
    await expect(importerSauvegarde(futur, MOT_DE_PASSE)).rejects.toBeInstanceOf(
      SauvegardeIllisibleError,
    );
  }, 30_000);

  it('@critique un chiffré ALTÉRÉ est refusé — AES-GCM authentifie, on ne bricole pas autour', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const altere = {
      ...fichier,
      charge: { ...fichier.charge, c: `${fichier.charge.c.slice(0, -4)}AAAA` },
    };
    await expect(importerSauvegarde(altere, MOT_DE_PASSE)).rejects.toBeInstanceOf(
      MotDePasseSauvegardeInvalideError,
    );
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// D. LA FUSION PAR UUID (11 §4)
// ─────────────────────────────────────────────────────────────────────────────
describe('fusion par UUID — une op locale plus récente n’est jamais écrasée (11 §4)', () => {
  it('@critique une ligne locale qui porte une op EN ATTENTE survit à l’import', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });

    // L'auditeur continue de travailler APRÈS l'export : le nom change, et cette
    // écriture n'a pas encore été synchronisée (elle est dans l'outbox).
    const session = await depotSessions.parId(SESSION_ID);
    if (session === null) throw new Error('fixture : session absente');
    await ecrireLocal({
      entite: 'interview',
      id: SESSION_ID,
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        orgUnitId: session.orgUnitId,
        kind: session.kind,
        status: session.status,
        scheduleStatus: session.scheduleStatus,
        scheduledAt: session.scheduledAt,
      },
      charge: { ...session, personName: 'Nom postérieur à la sauvegarde' },
    });

    await importerSauvegarde(fichier, MOT_DE_PASSE);

    const apres = await depotSessions.parId(SESSION_ID);
    expect(apres?.personName).toBe('Nom postérieur à la sauvegarde');
  }, 30_000);

  it('@critique une ligne ABSENTE localement est restaurée par l’import', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    await baseSource.interviews.clear();
    await baseSource.outbox.clear();

    await importerSauvegarde(fichier, MOT_DE_PASSE);
    expect((await depotSessions.parId(SESSION_ID))?.personName).toBe(NOM_SENTINELLE);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// E. L'IMPORT NE TOUCHE PAS L'HORLOGE
// ─────────────────────────────────────────────────────────────────────────────
describe('l’horloge de l’appareil n’est pas rejouée depuis une vieille sauvegarde', () => {
  it('@critique le décalage serveur est INCHANGÉ après un import', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });

    // Un décalage franc, du même ordre que le scénario « horloge locale +3 h »
    // du 05 §9.8 : s'il était réécrit depuis la sauvegarde, on le verrait.
    reglerDecalage(new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString());
    const avant = decalageActuelMs();

    await importerSauvegarde(fichier, MOT_DE_PASSE);

    // Tolérance d'une seconde : les deux lectures d'horloge ne sont pas au même
    // instant. Un décalage REJOUÉ depuis la sauvegarde s'écarterait d'heures.
    expect(Math.abs(decalageActuelMs() - avant)).toBeLessThan(1000);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F. L'OUTBOX EST DANS LA SAUVEGARDE
// ─────────────────────────────────────────────────────────────────────────────
describe('la sauvegarde emporte la file d’attente (11 §4)', () => {
  it('@critique le rapport d’export compte les opérations non synchronisées', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.operationsIncluses).toBe(await baseSource.outbox.count());
    expect(fichier.enTete.operationsIncluses).toBeGreaterThan(0);
  }, 30_000);

  it('@critique l’import ANNONCE les opérations qu’il ne réinjecte pas — il ne les tait pas', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const rapport = await importerSauvegarde(fichier, MOT_DE_PASSE);

    expect(rapport.operationsNonReinjectees).toBe(fichier.enTete.operationsIncluses);
    expect(rapport.avertissement).toMatch(/[a-zéèêàç]/);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// G. LES CHEMINS QUE LA PREMIÈRE PASSE N'AVAIT PAS ÉPROUVÉS
//
// Ajoutés après MESURE de couverture, et non pour faire monter un chiffre :
// chacun porte une décision de conception qui, si elle se retournait, ne
// casserait aucun écran mais changerait ce qui sort de l'appareil.
// ─────────────────────────────────────────────────────────────────────────────
describe('les bords du format, éprouvés parce que mesurés à découvert', () => {
  it('@critique un appareil SANS libellé ne bloque pas l’export — il le dit', async () => {
    // Le libellé est une commodité humaine, pas une clé. Un export refusé faute
    // de nom d'appareil rendrait la sauvegarde indisponible le jour où elle
    // compte, pour une raison cosmétique.
    await baseSource.meta.delete(CLES_META.libelleAppareil);

    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.libelleAppareil).toBe('Appareil non nommé');
  }, 30_000);

  it('@critique une sauvegarde SANS opération en file ne fabrique aucun avertissement', async () => {
    await baseSource.outbox.clear();

    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.operationsIncluses).toBe(0);

    const rapport = await importerSauvegarde(fichier, MOT_DE_PASSE);
    // `null` et non une phrase rassurante : un écran qui affiche « 0 élément non
    // synchronisé » à chaque import apprend à être ignoré.
    expect(rapport.avertissement).toBeNull();
    expect(rapport.operationsNonReinjectees).toBe(0);
  }, 30_000);

  it('@critique une ligne SANS horodatage de modification est refusée, pas fusionnée au hasard', async () => {
    // C'est le défaut qui ne se verrait pas : `appliquerDescente` arbitre sur
    // `clientUpdatedAt` (05 §9.4) et un `undefined` DÉSARME l'arbitrage — la
    // ligne importée écraserait alors une ligne locale plus récente, c'est-à-dire
    // exactement ce que 11 §4 interdit. Le refus est préférable au silence.
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });

    // On reconstruit un fichier dont UNE ligne a perdu son horodatage.
    const cle = await deriverKek(
      MOT_DE_PASSE,
      depuisBase64(fichier.enTete.kdf.sel),
      fichier.enTete.kdf.parametres,
    );
    const clair = new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: depuisBase64(fichier.charge.n) },
        cle,
        depuisBase64(fichier.charge.c),
      ),
    );
    const contenu = JSON.parse(clair) as {
      lignes: Record<string, { clientUpdatedAt?: string }[]>;
    };
    const premiere = contenu.lignes.interviews?.[0];
    if (premiere === undefined) throw new Error('fixture : aucune session dans la sauvegarde');
    delete premiere.clientUpdatedAt;

    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const rechiffre = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cle,
      new TextEncoder().encode(JSON.stringify(contenu)),
    );
    const altere = {
      ...fichier,
      charge: { v: 1, n: versBase64(nonce), c: versBase64(new Uint8Array(rechiffre)) },
    };

    await expect(importerSauvegarde(altere, MOT_DE_PASSE)).rejects.toBeInstanceOf(
      SauvegardeIllisibleError,
    );
  }, 30_000);
});

describe('une mission restaurée est EMBARQUÉE (DECISIONS.md 2026-09-02 : données présentes)', () => {
  it('@critique après l’import, la marque d’embarquement de la mission est posée', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    await baseSource.meta.delete(cleEmbarquement(MISSION_ID));
    expect(await lireMeta(baseSource, cleEmbarquement(MISSION_ID))).toBeUndefined();

    await importerSauvegarde(fichier, MOT_DE_PASSE);
    expect(typeof (await lireMeta(baseSource, cleEmbarquement(MISSION_ID)))).toBe('string');
  }, 30_000);

  it('@critique un import REFUSÉ (mauvais mot de passe) ne pose PAS la marque', async () => {
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    await baseSource.meta.delete(cleEmbarquement(MISSION_ID));
    await expect(importerSauvegarde(fichier, 'faux')).rejects.toBeInstanceOf(
      MotDePasseSauvegardeInvalideError,
    );
    expect(await lireMeta(baseSource, cleEmbarquement(MISSION_ID))).toBeUndefined();
  }, 30_000);
});

describe('le nom du fichier proposé à l’auditeur', () => {
  it('@critique il ne porte NI nom de client NI donnée personnelle (invariant 2)', () => {
    const nom = nomFichierSauvegarde(MISSION_ID, '2026-09-04T07:00:00.000Z');

    expect(nom).toContain(MISSION_ID);
    expect(nom.endsWith(EXTENSION_SAUVEGARDE)).toBe(true);
    // Aucun deux-points : un nom de fichier doit survivre à tous les systèmes de
    // fichiers, y compris ceux qui les refusent.
    expect(nom).not.toContain(':');
    expect(nom).toBe('axion-0191e2a0-0000-7000-8000-00000000f3de-20260904T070000Z.axionbackup');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. LE MOT DE PASSE D'EXPORT EST VÉRIFIÉ (majeur M5, revue A29 du 2026-09-05)
//
// Le défaut fermé est une PERTE SILENCIEUSE : `deriverKek` accepte n'importe
// quelle chaîne, donc une faute de frappe produisait un fichier bien formé,
// annoncé « produite », et définitivement inouvrable — découvert le jour de la
// restauration, c'est-à-dire le jour où l'appareil est perdu.
// ─────────────────────────────────────────────────────────────────────────────
describe('le mot de passe d’export est vérifié contre le coffre de l’appareil', () => {
  /** Installe un coffre AU REPOS (`meta.coffre`) — ce que fait le 1er déverrouillage. */
  async function installerCoffreAuRepos(motDePasse: string): Promise<void> {
    const sel = new Uint8Array(16).fill(21);
    const kek = await deriverKek(motDePasse, sel, KDF_TEST);
    await ecrireMeta(baseSource, CLES_META.coffre, {
      sel: versBase64(sel),
      parametres: KDF_TEST,
      dekEnveloppee: await creerDekEnveloppee(kek),
    });
  }

  it('@critique un mot de passe FAUX est refusé, et AUCUN fichier n’est produit', async () => {
    await installerCoffreAuRepos(MOT_DE_PASSE);
    await expect(
      exporterSauvegarde({
        missionId: MISSION_ID,
        motDePasse: 'faute-de-frappe',
        parametresKdf: KDF_TEST,
      }),
    ).rejects.toBeInstanceOf(MotDePasseExportInvalideError);
  }, 30_000);

  it('@critique le BON mot de passe passe, et la sauvegarde est produite', async () => {
    await installerCoffreAuRepos(MOT_DE_PASSE);
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.missionId).toBe(MISSION_ID);
  }, 30_000);

  it('@critique le refus dit qu’aucune sauvegarde n’a été produite — jamais un « peut-être »', async () => {
    await installerCoffreAuRepos(MOT_DE_PASSE);
    await expect(
      exporterSauvegarde({ missionId: MISSION_ID, motDePasse: 'x', parametresKdf: KDF_TEST }),
    ).rejects.toThrow(/aucune sauvegarde n’a été produite/i);
  }, 30_000);

  it('sans coffre AU REPOS, la vérification laisse passer — état inatteignable en production', async () => {
    // Documenté dans l'en-tête de `verifierMotDePasseAppareil` : le coffre au
    // repos est posé au premier déverrouillage, et sans lui aucune donnée locale
    // n'est déchiffrable — un appareil qui exporte en a forcément un.
    expect(await baseSource.meta.get(CLES_META.coffre)).toBeUndefined();
    const fichier = await exporterSauvegarde({
      missionId: MISSION_ID,
      motDePasse: 'peu importe',
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.missionId).toBe(MISSION_ID);
  }, 30_000);
});
