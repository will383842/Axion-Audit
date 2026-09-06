// =============================================================================
// TESTS DE LA COQUILLE TERRAIN — LE CÂBLAGE DU VERROU (05 §9.7)
//
// Lot L5, incrément L5a. Second volet de la réserve BLOQUANTE B1 du contrôle A02
// du 2026-09-03 : « unique appelant `contexte.tsx:220`, lui aussi à 0,00 % ».
// Écrits par A26, pas par l'auteur du module (09 §5.6).
//
// ── PÉRIMÈTRE, DIT AVANT D'ÊTRE DEMANDÉ ─────────────────────────────────────
// Ce fichier n'éprouve QUE ce que B1 met en cause : le fil qui va de la session
// locale au délai de verrou, du verrou à la fermeture du coffre, et de la
// fermeture à la ressaisie du mot de passe. L'amorçage de la base, la panne
// `BaseTropRecenteError`, l'état du jeton de siège et la persistance de la vue
// courante sont hors de ce périmètre : ils appartiennent à qui reprendra ce
// fichier, et son nom l'y invite. Un test qui prétendrait couvrir `contexte.tsx`
// en entier alors qu'il n'en couvre qu'un fil serait exactement le vert
// trompeur que ce dépôt traque.
//
// ── CE QUE LE CÂBLAGE DOIT PROUVER ──────────────────────────────────────────
// 05 §9.7 : « La KEK n'est tenue qu'en mémoire de session » et « Ressaisie du mot
// de passe au déverrouillage ». En-tête de `contexte.tsx` : « Le passage
// `ouvert → verrouille` ferme le coffre ET retire le contexte local : après lui,
// plus aucun chemin de code n'atteint la DEK. » Un verrou qui tomberait sans
// appeler `retirerContexteLocal` laisserait la DEK vivante dans un onglet
// verrouillé — l'écran mentirait sur l'état réel du coffre.
// 03 §33.7 : « AUCUNE ressaisie de mot de passe pendant une session active de
// 45 min. » Le hook connaît la règle ; c'est ICI qu'on vérifie qu'on lui donne
// bien le booléen qui la déclenche.
//
// ── NIVEAU CHOISI ───────────────────────────────────────────────────────────
// `interface` + minuteurs simulés, pour la même raison qu'au fichier voisin : le
// fait à établir est une échéance de 15 et 60 minutes. Les modules locaux sont
// des doubles — ce fichier éprouve un CÂBLAGE, pas la crypto (couverte, elle,
// par `local/coffre.test.ts` et `local/coffre-appareil.test.ts`).
//
// Sections éprouvées : 05 §9.7 · 03 §33.7 · 06 §10.5.
// Traçabilité : E33 (sécurité / RGPD : chiffrement local — la DEK cesse d'être
// atteignable au verrouillage) · E6 (hors ligne total : le déverrouillage local
// reste possible sans aucun réseau).
// =============================================================================
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FournisseurTerrain, useTerrain, type ValeurTerrain } from './contexte.js';
import {
  DonneesSansCoffreError,
  deverrouiller,
  initialiserCoffre,
} from '../local/coffre-appareil.js';
import { CoffreIllisibleError, ParametresKdfHorsBornesError } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import type * as ModuleBase from '../local/base.js';
import type * as ModuleCoffreAppareil from '../local/coffre-appareil.js';

// `vi.hoisted` : la fabrique d'un `vi.mock` s'exécute AVANT le corps du fichier.
// Sans lui, ce double serait dans sa zone morte temporelle au premier import — et
// l'atteindre par `depotSessions.sessionEnCours` ferait rougir `unbound-method`.
const { sessionEnCoursFactice } = vi.hoisted(() => ({
  sessionEnCoursFactice: vi.fn((): Promise<boolean> => Promise.resolve(false)),
}));

const MINUTE = 60_000;
const T0 = new Date('2026-09-03T09:00:00.000Z');
const MOT_DE_PASSE_FICTIF = 'phrase-de-passe-de-test-0000';

// Doubles opaques : ce fichier ne teste ni Dexie ni la crypto, il teste le fil
// qui les relie au verrou.
//
// `close` a été ajouté au double le 2026-09-05 par A24, avec le correctif de la
// réserve R6 (la coquille FERME désormais la connexion Dexie sur le chemin qui
// lève). C'est une FIXTURE, pas une assertion : le double doit répondre à ce que
// le module appelle. Éprouver qu'il est bien appelé — et une seule fois, et
// jamais sur le chemin nominal — appartient à A26 (09 §5.6).
const baseFactice = { nom: 'base-factice', close: vi.fn() };
const coffreFactice = { dek: 'clef-factice' };

let coffreAuRepos: unknown = { sel: 'sel-factice' };
/**
 * L’anomalie que `lireCoffreAuRepos` doit LEVER, ou `null` pour une lecture qui
 * réussit. Le double d’origine ne savait que RÉSOUDRE : il ne pouvait donc pas
 * jouer le cas F-22, où la lecture lève et où la coquille doit router vers une
 * page d’anomalie plutôt que vers l’écran de création (verdict A51, 2026-09-04).
 */
let erreurLectureCoffre: Error | null = null;
let sessionSimulee = false;
let dernierInterrogateur: (() => unknown) | null = null;

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (interrogateur: () => unknown) => {
    dernierInterrogateur = interrogateur;
    return sessionSimulee;
  },
}));

vi.mock('../local/base.js', async (importerReel) => {
  const reel = await importerReel<typeof ModuleBase>();
  return {
    ...reel,
    ouvrirBaseLocale: vi.fn(() => Promise.resolve(baseFactice)),
    lireMeta: vi.fn(() => Promise.resolve(undefined)),
    ecrireMeta: vi.fn(() => Promise.resolve()),
  };
});

// Les TROIS fonctions sont doublées ; le reste du module — dont la classe
// `DonneesSansCoffreError`, qui est le cas R3 du premier usage — vient du module
// RÉEL. Doubler une classe d'erreur reviendrait à éprouver le câblage contre une
// erreur qui n'existe pas : `instanceof AnomalieCoffreError` serait faux, et
// c'est précisément le test qui compte ici.
vi.mock('../local/coffre-appareil.js', async (importerReel) => {
  const reel = await importerReel<typeof ModuleCoffreAppareil>();
  return {
    ...reel,
    lireCoffreAuRepos: vi.fn(() =>
      erreurLectureCoffre === null
        ? Promise.resolve(coffreAuRepos)
        : Promise.reject(erreurLectureCoffre),
    ),
    deverrouiller: vi.fn(() => Promise.resolve(coffreFactice)),
    initialiserCoffre: vi.fn(() => Promise.resolve(coffreFactice)),
  };
});

vi.mock('../local/contexte.js', () => ({
  contexteLocal: vi.fn(() => ({ base: baseFactice, coffre: coffreFactice })),
  installerContexteLocal: vi.fn(),
  retirerContexteLocal: vi.fn(),
}));

vi.mock('../local/jetons.js', () => ({
  lireJetonRafraichissement: vi.fn(() => Promise.resolve(null)),
  enregistrerJetonRafraichissement: vi.fn(() => Promise.resolve()),
  effacerJetonRafraichissement: vi.fn(() => Promise.resolve()),
}));

vi.mock('../local/depots/sessions.js', () => ({
  depotSessions: { sessionEnCours: sessionEnCoursFactice },
}));

vi.mock('../local/stockage.js', () => ({
  evaluerStockage: vi.fn(() =>
    Promise.resolve({
      persistant: true,
      quotaOctets: 1,
      utiliseOctets: 0,
      ratio: 0,
      niveau: 'ok',
    }),
  ),
}));

vi.mock('./service-worker-client.js', () => ({
  declarerSourceSessionEnCours: vi.fn(),
}));

let terrain: ValeurTerrain;

function Sonde(): ReactNode {
  terrain = useTerrain();
  return <span data-testid="phase">{terrain.phase}</span>;
}

/** Vide la file des microtâches SANS toucher à l'horloge simulée. */
async function laisserRepondre(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) {
      await Promise.resolve();
    }
  });
}

async function avancer(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function phase(): string | null {
  return screen.getByTestId('phase').textContent;
}

/** Monte la coquille et pousse jusqu'à l'écran de déverrouillage. */
async function monterCoquille(): Promise<void> {
  render(
    <FournisseurTerrain>
      <Sonde />
    </FournisseurTerrain>,
  );
  await laisserRepondre();
}

/** Le geste réel de l'auditeur : il tape son mot de passe. */
async function deverrouillerLApplication(): Promise<void> {
  await act(async () => {
    await terrain.ouvrir(MOT_DE_PASSE_FICTIF);
  });
  await laisserRepondre();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  coffreAuRepos = { sel: 'sel-factice' };
  erreurLectureCoffre = null;
  sessionSimulee = false;
  dernierInterrogateur = null;
  vi.mocked(deverrouiller).mockClear();
  vi.mocked(initialiserCoffre).mockClear();
  vi.mocked(installerContexteLocal).mockClear();
  vi.mocked(retirerContexteLocal).mockClear();
  sessionEnCoursFactice.mockClear();
  baseFactice.close.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — le verrou ferme réellement le coffre', () => {
  it('@critique 15 min d’inactivité hors session : coffre fermé, contexte local retiré', async () => {
    await monterCoquille();
    await deverrouillerLApplication();
    expect(phase()).toBe('ouvert');
    expect(retirerContexteLocal).not.toHaveBeenCalled();

    await avancer(15 * MINUTE);

    expect(phase()).toBe('verrouille');
    // La preuve qui compte : la DEK n'est plus atteignable par aucun chemin.
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('@critique le bouton d’un geste (05 §9.7) ferme le coffre sur-le-champ', async () => {
    sessionSimulee = true;
    await monterCoquille();
    await deverrouillerLApplication();

    await act(async () => {
      terrain.verrou.verrouillerMaintenant();
      await Promise.resolve();
    });

    expect(phase()).toBe('verrouille');
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('le verrou qui tombe alors que l’app est DÉJÀ verrouillée ne casse rien', async () => {
    await monterCoquille();
    expect(phase()).toBe('verrouille');

    await avancer(60 * MINUTE);

    expect(phase()).toBe('verrouille');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — le déverrouillage repasse par la dérivation de clé', () => {
  it('@critique après un verrouillage, rouvrir REDÉRIVE la clé depuis le mot de passe', async () => {
    // 05 §9.7 : « La KEK n'est tenue qu'en mémoire de session » et « AUCUN
    // mécanisme de déverrouillage affaibli en V1 ». Le seul chemin de retour est
    // `deverrouiller(base, motDePasse)` — jamais une DEK conservée quelque part.
    await monterCoquille();
    await deverrouillerLApplication();
    expect(deverrouiller).toHaveBeenCalledTimes(1);
    expect(deverrouiller).toHaveBeenCalledWith(baseFactice, MOT_DE_PASSE_FICTIF);

    await avancer(15 * MINUTE);
    expect(phase()).toBe('verrouille');

    await deverrouillerLApplication();

    expect(phase()).toBe('ouvert');
    expect(deverrouiller).toHaveBeenCalledTimes(2);
    expect(installerContexteLocal).toHaveBeenCalledTimes(2);
  });

  it('@critique un déverrouillage relance un compte PLEIN : 15 min de plus, pas moins', async () => {
    await monterCoquille();
    await deverrouillerLApplication();
    await avancer(15 * MINUTE);
    await deverrouillerLApplication();
    expect(phase()).toBe('ouvert');

    await avancer(15 * MINUTE - 1);
    expect(phase()).toBe('ouvert');
    await avancer(1);
    expect(phase()).toBe('verrouille');
  });

  it('au tout premier usage, le mot de passe CRÉE le coffre au lieu de l’ouvrir', async () => {
    coffreAuRepos = null;
    await monterCoquille();

    await deverrouillerLApplication();

    expect(initialiserCoffre).toHaveBeenCalledTimes(1);
    expect(deverrouiller).not.toHaveBeenCalled();
    expect(phase()).toBe('ouvert');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — la session en cours porte le délai à 60 min', () => {
  it('@critique SESSION ACTIVE : 45 MIN SANS AUCUNE RESSAISIE (03 §33.7, recette P-C)', async () => {
    // Le scénario qui justifie l'existence des deux seuils, joué de bout en bout
    // dans la coquille : un entretien de trois quarts d'heure, l'auditeur ne
    // touche rien, l'interlocuteur parle. Le mot de passe n'est jamais redemandé.
    sessionSimulee = true;
    await monterCoquille();
    await deverrouillerLApplication();
    expect(terrain.verrou.delaiCourantMs).toBe(60 * MINUTE);

    await avancer(45 * MINUTE);

    expect(phase()).toBe('ouvert');
    expect(retirerContexteLocal).not.toHaveBeenCalled();
    expect(deverrouiller).toHaveBeenCalledTimes(1);
  });

  it('contrôle d’anti-vacuité : les mêmes 45 min SANS session ferment bien le coffre', async () => {
    sessionSimulee = false;
    await monterCoquille();
    await deverrouillerLApplication();
    expect(terrain.verrou.delaiCourantMs).toBe(15 * MINUTE);

    await avancer(45 * MINUTE);

    expect(phase()).toBe('verrouille');
    expect(retirerContexteLocal).toHaveBeenCalledTimes(1);
  });

  it('la source du délai est bien l’index LOCAL des sessions, pas une constante', async () => {
    // Sans ce contrôle, les deux tests ci-dessus resteraient verts même si le
    // booléen venait d'ailleurs — et le délai de 60 min s'appliquerait à un
    // appareil sans aucune session ouverte.
    await monterCoquille();
    expect(dernierInterrogateur).not.toBeNull();

    await act(async () => {
      await dernierInterrogateur?.();
    });

    expect(sessionEnCoursFactice).toHaveBeenCalledWith(baseFactice);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNE ANOMALIE DE COFFRE VA VERS L'ERREUR, JAMAIS VERS « PREMIER USAGE »
//
// Ajouté le 2026-09-05 par A26, depuis le verdict A51 du 2026-09-04 (F-22,
// CRITIQUE). C'est le test qui manquait à ce fichier : `setPremierUsage(coffre
// === null)` était vrai aussi bien pour un appareil neuf que pour un coffre
// devenu illisible, et l'écran proposait alors de « préparer cet appareil ».
// Le mot de passe de l'auditeur écrasait sa propre DEK.
//
// Ce qui est éprouvé ici est le CÂBLAGE, pas la crypto : quand la lecture du
// coffre LÈVE, la coquille doit router vers `phase: 'erreur'` avec une cause et
// une action, et `premierUsage` doit rester FAUX — aucun chemin ne doit mener à
// l'écran de création quand une ligne de coffre existe.
// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — une anomalie de coffre ne devient jamais « premier usage » (A51, F-22)', () => {
  const ANOMALIES = [
    {
      nom: 'CoffreIllisibleError',
      erreur: (): Error =>
        new CoffreIllisibleError('sa forme n’est pas celle attendue sur : parametres.memoireKio'),
    },
    {
      nom: 'ParametresKdfHorsBornesError',
      erreur: (): Error =>
        new ParametresKdfHorsBornesError('mémoire de 4000000 pour un maximum de 188416'),
    },
  ];

  for (const { nom, erreur } of ANOMALIES) {
    it(`@critique ${nom} à l’amorçage : phase « erreur », cause et action non vides, premierUsage FAUX`, async () => {
      erreurLectureCoffre = erreur();
      await monterCoquille();

      expect(phase()).toBe('erreur');
      expect(terrain.premierUsage).toBe(false);
      expect(terrain.panne).not.toBeNull();
      expect((terrain.panne?.cause ?? '').length).toBeGreaterThan(0);
      expect((terrain.panne?.action ?? '').length).toBeGreaterThan(0);
      // L'action doit dire ce qu'il ne faut SURTOUT pas faire : c'est elle qui
      // sépare « on vous explique » de « on vous invite à détruire votre journée ».
      expect(terrain.panne?.action).toMatch(/ne créez pas/i);
      // Et aucun chemin n'a pu créer ni ouvrir quoi que ce soit.
      expect(initialiserCoffre).not.toHaveBeenCalled();
      expect(deverrouiller).not.toHaveBeenCalled();
    });
  }

  it('contrôle d’anti-vacuité : le MÊME montage avec un coffre réellement ABSENT mène bien à `premierUsage === true`', async () => {
    // Sans ce contrôle, les deux tests ci-dessus resteraient verts sur une
    // coquille qui ne saurait jamais dire « premier usage » — et le faux vert
    // porterait précisément sur le drapeau qu'ils sont censés surveiller.
    coffreAuRepos = null;
    await monterCoquille();

    expect(phase()).toBe('verrouille');
    expect(terrain.premierUsage).toBe(true);
    expect(terrain.panne).toBeNull();
  });

  it('un coffre présent et LISIBLE ne déclenche pas non plus « premier usage »', async () => {
    await monterCoquille();
    expect(phase()).toBe('verrouille');
    expect(terrain.premierUsage).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3 — UNE ANOMALIE DÉCOUVERTE À LA SOUMISSION N'EST PLUS UN « PREMIER USAGE »
//
// Ajouté le 2026-09-05 par A26, depuis la revue croisée A29 du même jour (R3) et
// le correctif d'A24 qui la ferme. Je n'ai écrit aucune ligne du module éprouvé.
//
// Le cas de F-22 découvert à l'AMORÇAGE était déjà couvert (bloc ci-dessus).
// Celui-ci est l'autre porte, et A29 l'a décrite : `DonneesSansCoffreError` n'est
// levée que par `initialiserCoffre`, donc seulement quand `premierUsage === true`.
// L'échec était rattrapé DANS l'écran, `premierUsage` restait `true`, et
// l'auditeur gardait sous les yeux un bouton actif « Créer la protection de cet
// appareil » au-dessus d'une alerte qui dit « Ne créez PAS de protection ».
//
// Ce qui est éprouvé ici est le CÂBLAGE : la coquille doit retirer elle-même le
// drapeau, indépendamment de ce que l'écran affiche. Les deux gardes sont
// volontairement redondantes — celle qui manque est celle qui détruit une
// journée de collecte.
// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — R3 : une anomalie À LA SOUMISSION retire « premier usage »', () => {
  /** Monte la coquille sur un appareil SANS coffre : `premierUsage` est vrai. */
  async function monterEnPremierUsage(): Promise<void> {
    coffreAuRepos = null;
    await monterCoquille();
    // Anti-vacuité : sans ce contrôle, un `premierUsage` déjà faux rendrait le
    // test ci-dessous vert sans que rien ne l'ait fait basculer.
    expect(terrain.premierUsage).toBe(true);
  }

  /** Le geste de l'auditeur, dont on attend qu'il ÉCHOUE. */
  async function tenterDOuvrir(): Promise<unknown> {
    let erreur: unknown = null;
    await act(async () => {
      erreur = await terrain.ouvrir(MOT_DE_PASSE_FICTIF).then(
        () => null,
        (cause: unknown) => cause,
      );
    });
    await laisserRepondre();
    return erreur;
  }

  it('@critique `DonneesSansCoffreError` au premier usage : `premierUsage` passe à FAUX, et l’erreur est propagée', async () => {
    await monterEnPremierUsage();
    const anomalie = new DonneesSansCoffreError(37);
    vi.mocked(initialiserCoffre).mockRejectedValueOnce(anomalie);

    const erreur = await tenterDOuvrir();

    expect(erreur).toBe(anomalie);
    // Le drapeau tombe : plus aucun chemin ne mène à l'écran de création.
    expect(terrain.premierUsage).toBe(false);
    // Et rien n'a été ouvert : la phase reste « verrouille », le contexte local
    // n'a pas été installé.
    expect(phase()).toBe('verrouille');
    expect(installerContexteLocal).not.toHaveBeenCalled();
    // L'action que l'auditeur doit lire avant de faire le geste destructeur.
    expect(anomalie.action).toContain('sans recharger ni réinstaller');
  });

  it('@critique anti-vacuité de R3 : une erreur ORDINAIRE laisse `premierUsage` intact', async () => {
    // Le bord opposé. Une coquille qui retirerait le drapeau sur TOUTE erreur
    // renverrait un auditeur ayant tapé douze caractères de travers vers
    // « Déverrouiller la collecte » — sur un appareil qui n'a pas de coffre.
    await monterEnPremierUsage();
    vi.mocked(initialiserCoffre).mockRejectedValueOnce(new Error('Mot de passe incorrect.'));

    const erreur = await tenterDOuvrir();

    expect(erreur).toBeInstanceOf(Error);
    expect(terrain.premierUsage).toBe(true);
    expect(phase()).toBe('verrouille');
  });

  it('@critique le chemin nominal du premier usage n’est pas touché : ouvrir CRÉE et publie le coffre', async () => {
    // Non-régression : la garde ajoutée ne doit pas s'appliquer au succès.
    await monterEnPremierUsage();
    await deverrouillerLApplication();

    expect(initialiserCoffre).toHaveBeenCalledTimes(1);
    expect(deverrouiller).not.toHaveBeenCalled();
    expect(terrain.premierUsage).toBe(false);
    expect(phase()).toBe('ouvert');
    expect(installerContexteLocal).toHaveBeenCalledWith({
      base: baseFactice,
      coffre: coffreFactice,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R6 — LA CONNEXION DEXIE EST FERMÉE SUR LE CHEMIN QUI LÈVE, ET SUR LUI SEUL
//
// Ajouté le 2026-09-05 par A26, depuis la revue croisée A29 du même jour (R6) et
// le correctif d'A24 qui la ferme.
//
// Le chemin est NOUVEAU : avant le correctif de F-22, `lireCoffreAuRepos` ne
// levait jamais. Depuis, une anomalie de coffre laissait une connexion Dexie
// vivante que plus personne ne référençait (`setBase` n'avait pas eu lieu) — et
// une connexion vivante bloque un `versionchange` jusqu'au rechargement de la
// page, c'est-à-dire la compatibilité ascendante du schéma local (05 §31-1). Sur
// un appareil dont le coffre est déjà en anomalie, refuser en plus la mise à jour
// du schéma est la seconde panne de trop.
//
// Trois faits, et il faut les trois : elle est fermée, elle l'est UNE seule fois,
// et elle ne l'est JAMAIS quand tout va bien. Le troisième est le plus important
// des trois : une base fermée sur le chemin nominal ferait tomber toute la
// collecte, et « close a bien été appelé » serait quand même vert.
// ═══════════════════════════════════════════════════════════════════════════
describe('coquille terrain — R6 : la base Dexie est fermée quand `lireCoffreAuRepos` lève', () => {
  it('@critique anomalie de coffre à l’amorçage ⇒ `close()` appelé EXACTEMENT une fois, et la base n’est pas publiée', async () => {
    erreurLectureCoffre = new CoffreIllisibleError('sa forme n’est pas celle attendue sur : sel');
    await monterCoquille();

    // Anti-vacuité : on est bien sur le chemin qui lève, pas sur un montage muet.
    expect(phase()).toBe('erreur');
    expect(terrain.panne).not.toBeNull();

    expect(baseFactice.close).toHaveBeenCalledTimes(1);
    // La référence n'a jamais été remise à l'application : c'est ce qui rendait
    // la connexion irrattrapable, et c'est pourquoi il fallait fermer ici.
    expect(terrain.base).toBeNull();
  });

  it('@critique chemin NOMINAL : la base n’est JAMAIS fermée, et elle est publiée', async () => {
    // Le contrôle qui empêche la correction d'aller trop loin. Une coquille qui
    // fermerait la base à chaque amorçage rendrait l'application inutilisable, et
    // le test précédent resterait vert.
    await monterCoquille();

    expect(phase()).toBe('verrouille');
    expect(baseFactice.close).not.toHaveBeenCalled();
    expect(terrain.base).toBe(baseFactice);
  });

  it('@critique chemin nominal PUIS déverrouillage complet : toujours aucune fermeture', async () => {
    // Le cas d'usage réel de bout en bout — amorçage, saisie du mot de passe,
    // coffre ouvert. `close()` n'a rien à y faire.
    await monterCoquille();
    await deverrouillerLApplication();

    expect(phase()).toBe('ouvert');
    expect(baseFactice.close).not.toHaveBeenCalled();
  });

  it('@critique une anomalie de PARAMÈTRES ferme aussi : c’est la famille qui commande, pas la classe', async () => {
    erreurLectureCoffre = new ParametresKdfHorsBornesError(
      'longueur de clé : 48 pour un maximum de 32',
    );
    await monterCoquille();

    expect(phase()).toBe('erreur');
    expect(baseFactice.close).toHaveBeenCalledTimes(1);
  });
});
