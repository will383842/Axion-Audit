// =============================================================================
// LE MOTEUR DE MONTÉE — l'outbox part au siège, par lots, dans l'ordre (L6a)
//
// 05 §9.3, 11 §4, `LOT_L6.md` §3ter C.1 et §5 (PD2, PD5). Le moteur DÉCIDE du sort
// de chaque op à partir de la réponse serveur ; il ne fait aucun réseau lui-même
// (`transport.ts`) et ne déchiffre que par `montee.ts`.
//
// Règles tenues, une par une :
//   · lots ≤ TAILLE_LOT_PUSH_MAX, dans l'ordre de file (`opId` v7, index
//     `[statut+opId]` — la même lecture que `depotOutbox.prochainLot`, faite sur la
//     base INJECTÉE pour que lecture et écriture visent toujours la même base) ;
//   · acquittement PAR `opId`, jamais par entité : une ré-écriture pendant le vol
//     a son propre `opId` et repart ;
//   · `applied` / `duplicate` / `superseded` : l'op SORT ; `superseded` est compté
//     (« n réponse(s) arbitrée(s) ») — la valeur perdante est archivée serveur ;
//   · `forbidden` : l'op RESTE, statut `rejetee` visible, jamais renvoyée (05 §9.9) ;
//   · `error` : l'op reste `en_attente`, `tentatives` + 1 ; à la
//     ECHECS_AVANT_EXAMEN-ième, `a_examiner`. Une op n'est envoyée qu'UNE fois par
//     passage ;
//   · une op sans résultat dans la réponse RESTE (rien ne sort sans réponse) ;
//   · coupure réseau, reconnexion requise, refus du lot : rien ne bouge, rien
//     n'est compté comme un échec d'op (arbitrage du 2026-10-09 : une coupure
//     n'est PAS une tentative) ;
//   · deux passages sur la même mission ne se chevauchent jamais (scénario 3).
//
// LE DERNIER SUCCÈS (A-10, arbitrage du 2026-10-09). `cleDerniereSyncReussie`
// n'est écrite que si le passage a abouti côté transport ET qu'aucune op de la
// mission n'est restée `rejetee`, `a_examiner` ou en `error` : sinon des données
// ne vivent encore que sur l'appareil, et c'est l'invariant 8 que la clé protège.
// L'instant est `maintenant()` (horloge corrigée), le référentiel de son lecteur.
//
// `outboxRemaining` (05 §9.7) : « outbox non vide » est un fait de l'APPAREIL
// (« aucune sync connue de l'appareil »). Il compte donc TOUTE la file de
// l'appareil, toutes missions et tous statuts — une op rejetée ou à examiner ne
// vit, elle aussi, que sur cette tablette — moins le lot en vol.
//
// Traçabilité : E7, E38 ; invariants 1, 7 et 8.
// =============================================================================
import {
  type Operation,
  ECHECS_AVANT_EXAMEN,
  TAILLE_LOT_PUSH_MAX,
  lotPushSchema,
  type ReponsePush,
} from '../local/contrat-sync.js';
import {
  CLES_META,
  cleDerniereSyncReussie,
  ecrireMeta,
  lireMeta,
  type BaseLocale,
  type LigneOutbox,
} from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import { maintenant as horlogeMaintenant } from '../local/horloge.js';
import { MonteeImpossibleError, operationDeLigne } from './montee.js';
import type { TransportSync } from './transport.js';

export interface DependancesMoteur {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
  readonly transport: Pick<TransportSync, 'pousser'>;
  /** ISO UTC ; défaut : `maintenant()` de `local/horloge` (horloge corrigée). */
  readonly maintenant?: () => string;
}

export interface BilanPush {
  readonly statut: 'succes' | 'hors_ligne' | 'reconnexion_requise' | 'refus';
  /** applied + duplicate + superseded. */
  readonly operationsAcquittees: number;
  /** superseded — « n réponse(s) arbitrée(s) » (05 §9.3). */
  readonly arbitrees: number;
  /** forbidden. */
  readonly rejetees: number;
  /** error. */
  readonly enErreur: number;
  /** Ops `en_attente` de la mission après le passage. */
  readonly operationsRestantes: number;
  /** Message du transport quand le passage n'a pas abouti ; `null` sinon. */
  readonly message: string | null;
}

export interface MoteurSync {
  pousser(missionId: string): Promise<BilanPush>;
}

const MESSAGE_REJET_PAR_DEFAUT =
  'Écriture refusée par le siège : cette opération ne vous appartient pas (05 §9.9).';
const MESSAGE_ERREUR_PAR_DEFAUT =
  'Le siège n’a pas pu appliquer cette opération ; elle sera retentée.';

/**
 * Les passages en cours, par base et par mission. Au niveau du MODULE et non du
 * moteur : deux moteurs sur la même base (bouton manuel, retour du réseau) ne
 * doivent pas plus se chevaucher que deux appels au même.
 */
const passagesEnCours = new WeakMap<BaseLocale, Map<string, Promise<BilanPush>>>();

interface Compteurs {
  acquittees: number;
  arbitrees: number;
  rejetees: number;
  enErreur: number;
}

async function prochainLot(
  base: BaseLocale,
  missionId: string,
  dejaEnvoyees: ReadonlySet<string>,
): Promise<LigneOutbox[]> {
  // Les ops déjà envoyées CE passage et restées `en_attente` (error, sans
  // résultat) sont les premières de la file : on en lit autant de plus, puis on
  // les écarte. Elles ne repartent qu'au passage suivant.
  const lues = await base.outbox
    .where('[statut+opId]')
    .between(['en_attente', ''], ['en_attente', '￿'])
    .filter((op) => op.missionId === missionId)
    .limit(TAILLE_LOT_PUSH_MAX + dejaEnvoyees.size)
    .toArray();
  return lues.filter((op) => !dejaEnvoyees.has(op.opId)).slice(0, TAILLE_LOT_PUSH_MAX);
}

async function appliquerReponse(
  base: BaseLocale,
  lignes: readonly LigneOutbox[],
  reponse: ReponsePush,
  compteurs: Compteurs,
  dejaEnvoyees: Set<string>,
): Promise<void> {
  const resultats = new Map(reponse.results.map((r) => [r.opId, r]));
  await base.transaction('rw', base.outbox, async () => {
    for (const ligne of lignes) {
      const resultat = resultats.get(ligne.opId);
      if (resultat === undefined) {
        // Rien ne sort sans réponse serveur.
        dejaEnvoyees.add(ligne.opId);
        continue;
      }
      switch (resultat.result) {
        case 'superseded':
        case 'applied':
        case 'duplicate':
          // Une op arbitrée est acquittée comme les deux autres ; elle est en plus
          // comptée, pour « n réponse(s) arbitrée(s) » (05 §9.3).
          if (resultat.result === 'superseded') compteurs.arbitrees += 1;
          compteurs.acquittees += 1;
          await base.outbox.delete(ligne.opId);
          break;
        case 'forbidden':
          compteurs.rejetees += 1;
          await base.outbox.update(ligne.opId, {
            statut: 'rejetee',
            derniereErreur: resultat.message ?? MESSAGE_REJET_PAR_DEFAUT,
          });
          break;
        case 'error': {
          compteurs.enErreur += 1;
          const tentatives = ligne.tentatives + 1;
          await base.outbox.update(ligne.opId, {
            tentatives,
            statut: tentatives >= ECHECS_AVANT_EXAMEN ? 'a_examiner' : 'en_attente',
            derniereErreur: resultat.message ?? MESSAGE_ERREUR_PAR_DEFAUT,
          });
          dejaEnvoyees.add(ligne.opId);
          break;
        }
      }
    }
  });
}

/** +1 tentative pour chaque op du lot refusé, motif du siège ; « à examiner » au 10e. */
async function compterEchecDuLot(
  base: BaseLocale,
  lignes: readonly LigneOutbox[],
  motif: string,
): Promise<void> {
  await base.transaction('rw', base.outbox, async () => {
    for (const ligne of lignes) {
      const tentatives = ligne.tentatives + 1;
      await base.outbox.update(ligne.opId, {
        tentatives,
        statut: tentatives >= ECHECS_AVANT_EXAMEN ? 'a_examiner' : 'en_attente',
        derniereErreur: motif,
      });
    }
  });
}

const MOTIF_ILLISIBLE =
  'Cette opération ne se lit plus sur cet appareil : elle n’est pas envoyée et reste à examiner. Rien n’a été supprimé.';

/**
 * A2 et B1 (2026-10-09) : une op qui ne se déchiffre pas, ou ne peut pas monter
 * telle quelle, est ISOLÉE « à examiner » avec son motif — jamais envoyée, jamais
 * supprimée —, et ne bloque pas les autres. Le motif ne porte aucune trace
 * technique (11 §2) : celui de `MonteeImpossibleError` est écrit pour l'auditeur.
 */
async function preparer(
  base: BaseLocale,
  coffre: Coffre,
  lues: readonly LigneOutbox[],
): Promise<{ readonly ligne: LigneOutbox; readonly operation: Operation }[]> {
  const preparees: { readonly ligne: LigneOutbox; readonly operation: Operation }[] = [];
  for (const ligne of lues) {
    try {
      preparees.push({ ligne, operation: await operationDeLigne(ligne, coffre) });
    } catch (cause) {
      await base.outbox.update(ligne.opId, {
        statut: 'a_examiner',
        derniereErreur: cause instanceof MonteeImpossibleError ? cause.message : MOTIF_ILLISIBLE,
      });
    }
  }
  return preparees;
}

async function compterEnAttente(base: BaseLocale, missionId: string): Promise<number> {
  return base.outbox
    .where('statut')
    .equals('en_attente')
    .filter((op) => op.missionId === missionId)
    .count();
}

async function bloqueesDeLaMission(base: BaseLocale, missionId: string): Promise<number> {
  return base.outbox
    .filter((op) => op.missionId === missionId && op.statut !== 'en_attente')
    .count();
}

async function passage(deps: DependancesMoteur, missionId: string): Promise<BilanPush> {
  const { base, coffre, transport } = deps;
  const deviceId = await lireMeta(base, CLES_META.appareil);
  if (typeof deviceId !== 'string' || deviceId === '') {
    throw new Error(
      'Cet appareil n’a pas d’identifiant : la synchronisation est impossible. Vos données restent sur l’appareil.',
    );
  }

  const compteurs: Compteurs = { acquittees: 0, arbitrees: 0, rejetees: 0, enErreur: 0 };
  const dejaEnvoyees = new Set<string>();
  let statut: BilanPush['statut'] = 'succes';
  let message: string | null = null;

  for (;;) {
    const lues = await prochainLot(base, missionId, dejaEnvoyees);
    if (lues.length === 0) break;

    const preparees = await preparer(base, coffre, lues);
    if (preparees.length === 0) continue;
    const lignes = preparees.map((p) => p.ligne);
    const operations = preparees.map((p) => p.operation);
    const lot = lotPushSchema.parse({
      missionId,
      deviceId,
      operations,
      outboxRemaining: (await base.outbox.count()) - lignes.length,
    });

    const resultat = await transport.pousser(lot);
    if (resultat.type !== 'ok') {
      statut = resultat.type;
      message = resultat.type === 'hors_ligne' ? null : resultat.message;
      // Un refus du LOT entier (400, 403, 5xx) compte UNE tentative pour chaque
      // op envoyée — sinon un lot refusé en permanence ne passerait jamais « à
      // examiner ». Un 401 (authentification) et une coupure ne comptent pas :
      // l'op n'y est pour rien (arbitrage du 2026-10-09).
      if (resultat.type === 'refus' && resultat.statut !== 401) {
        await compterEchecDuLot(base, lignes, resultat.message);
      }
      break;
    }
    await appliquerReponse(base, lignes, resultat.donnees, compteurs, dejaEnvoyees);
  }

  if (
    statut === 'succes' &&
    dejaEnvoyees.size === 0 &&
    (await bloqueesDeLaMission(base, missionId)) === 0
  ) {
    await ecrireMeta(
      base,
      cleDerniereSyncReussie(missionId),
      (deps.maintenant ?? horlogeMaintenant)(),
    );
  }

  return {
    statut,
    operationsAcquittees: compteurs.acquittees,
    arbitrees: compteurs.arbitrees,
    rejetees: compteurs.rejetees,
    enErreur: compteurs.enErreur,
    operationsRestantes: await compterEnAttente(base, missionId),
    message,
  };
}

export function creerMoteurSync(deps: DependancesMoteur): MoteurSync {
  return {
    pousser(missionId: string): Promise<BilanPush> {
      let parMission = passagesEnCours.get(deps.base);
      if (parMission === undefined) {
        parMission = new Map();
        passagesEnCours.set(deps.base, parMission);
      }
      const table = parMission;
      const precedent = table.get(missionId);
      const suivant = (precedent ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => passage(deps, missionId));
      table.set(missionId, suivant);
      const liberer = (): void => {
        if (table.get(missionId) === suivant) table.delete(missionId);
      };
      suivant.then(liberer, liberer);
      return suivant;
    },
  };
}
