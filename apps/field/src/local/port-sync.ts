// =============================================================================
// LE PORT DE SYNCHRONISATION — DÉCLARÉ ICI (L5a), IMPLÉMENTÉ PAR L6a
//
// ── LA TENTATION QUE CE FICHIER REFUSE ──────────────────────────────────────
// `LOT_L5.md` §3.6 la nomme sans détour : « Fin de journée » (03 §34.2) = sync
// forcée + export de secours + synthèse. Or L6 n'existe pas quand L5c se code. La
// tentation est de livrer une implémentation qui répond « tout va bien ».
//
// **Elle rend `{ statut: 'indisponible' }`, et l'écran l'affiche tel quel.** Jamais
// une pastille verte. Une pastille qui verdit sans serveur, c'est exactement le
// garde-fou qui annonce plus qu'il ne fait — et sur l'invariant 8 (« aucune donnée
// ne vit sur un seul appareil plus de 24 h ouvrées »), le prix d'un faux vert est
// une journée d'entretiens perdue avec la tablette.
//
// L6a **REMPLACE** `portSyncInerte`, il ne l'étend pas.
//
// ── POURQUOI CE FICHIER N'EST PAS SOUS `src/sync/` ──────────────────────────
// Parce que `apps/field/src/sync/**` est le glob RÉSERVÉ au moteur de sync de
// L6a dans `.github/coverage-critical-paths.json` (`cheminsAttendus`, statut
// « non livre »), et que le mode d'emploi de ce fichier est explicite : « la CI
// échoue si du code correspondant à un glob attendu existe alors que
// `cheminsCritiques` est encore vide ». Un port DÉCLARATIF posé là ferait donc
// rougir la CI pour une raison qui n'a rien à voir avec sa qualité — et un
// rouge dont on sait qu'il est faux est le début d'un garde-fou qu'on ignore.
//
// Sa place est ici : `LOT_L5.md` §3.6 le décrit comme une pièce du SOCLE (une
// interface plus une implémentation inerte), pas comme un moteur. Le moteur, lui,
// arrivera bien sous `src/sync/`, avec L6a et son propre seuil de couverture.
//
// ── POURQUOI `etat()` EST SYNCHRONE ─────────────────────────────────────────
// La signature publiée (`LOT_L5.md` §2) est `etat(missionId): EtatSyncMission`,
// sans promesse : elle est appelée à chaque rendu par la pastille de l'en-tête.
// Elle lit donc un INSTANTANÉ tenu en mémoire, alimenté par `rafraichirEtat()`.
// Les champs que seule la base peut fournir valent `null` tant qu'aucun
// rafraîchissement n'a eu lieu — `null` et non `0`, parce que « je ne sais pas »
// n'est pas « il n'y a rien en attente ».
//
// Traçabilité : E38 (sauvegarde terrain : sync + export), E7 (remontée continue
// dès qu'il y a du réseau).
// =============================================================================
import { instantMs } from './horloge.js';

export type StatutSync = 'indisponible' | 'jamais_synchronisee' | 'a_jour' | 'en_attente' | 'echec';

/** L'alerte de l'invariant 8, calculée LOCALEMENT (05 §9.7, cloche 01 §20.4). */
export interface AlerteSauvegarde {
  readonly declenchee: boolean;
  /** Message en français, prêt à afficher. `null` si rien à signaler. */
  readonly message: string | null;
}

export interface EtatSyncMission {
  readonly missionId: string;
  readonly statut: StatutSync;
  /** ISO 8601 UTC du dernier succès, ou `null` si aucun n'est connu. */
  readonly derniereSyncReussieLe: string | null;
  /** `null` = non mesuré (voir l'en-tête). Jamais 0 par défaut. */
  readonly operationsEnAttente: number | null;
  /** Opérations `rejetee` (05 §9.9) ou `a_examiner` (05 §9.3) — toujours visibles. */
  readonly operationsBloquees: number | null;
  readonly alerte: AlerteSauvegarde;
}

export interface ResultatSync {
  readonly statut: 'indisponible' | 'succes' | 'echec';
  /** Ce qui s'est passé, en français, pour l'auditeur (03 §17.6). */
  readonly message: string;
  readonly operationsMontees: number;
  readonly operationsRestantes: number | null;
}

/**
 * Le port. **Déclaré ici, implémenté par L6a.**
 *
 * `synchroniserMaintenant` correspond au déclencheur manuel du 05 §9.3 ; les deux
 * autres déclencheurs (retour du réseau, timer 30 s) appartiennent au moteur, pas
 * à l'interface.
 */
export interface PortSync {
  synchroniserMaintenant(missionId: string): Promise<ResultatSync>;
  etat(missionId: string): EtatSyncMission;
}

// ─────────────────────────────────────────────────────────────────────────────
// L'ALERTE DE L'INVARIANT 8
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Le délai au-delà duquel l'absence de synchronisation devient une alerte.
 *
 * 05 §9.7 écrit « alerte automatique “aucune sync depuis 24 h” » ; l'invariant 8
 * du 00_INDEX écrit « plus de 24 h OUVRÉES ». Les deux ne coïncident pas un
 * week-end. La valeur retenue est 24 h calendaires — la plus STRICTE des deux,
 * donc celle qui n'expose jamais de données par excès d'indulgence — et l'écart
 * est remonté dans le rapport d'auto-revue A24 plutôt que tranché en silence.
 */
export const DELAI_ALERTE_SANS_SYNC_MS = 24 * 60 * 60 * 1000;

/**
 * Calcule l'alerte. Fonction PURE : c'est ce qui la rend testable sans horloge
 * système ni réseau, et donc réellement testée.
 */
export function evaluerAlerteSauvegarde(
  derniereSyncReussieLe: string | null,
  operationsEnAttente: number | null,
  instantCourantMs: number = instantMs(),
): AlerteSauvegarde {
  if (operationsEnAttente === 0) {
    return { declenchee: false, message: null };
  }
  if (derniereSyncReussieLe === null) {
    return {
      declenchee: true,
      message:
        'Aucune synchronisation connue pour cet appareil. Vos données ne sont nulle part ailleurs : synchronisez dès que possible (au besoin par partage de connexion) ou exportez une sauvegarde de secours.',
    };
  }
  const ecart = instantCourantMs - Date.parse(derniereSyncReussieLe);
  if (ecart < DELAI_ALERTE_SANS_SYNC_MS) {
    return { declenchee: false, message: null };
  }
  const heures = Math.floor(ecart / (60 * 60 * 1000));
  return {
    declenchee: true,
    message: `Aucune synchronisation depuis ${String(heures)} h. Des données de collecte ne vivent que sur cet appareil : synchronisez ou exportez une sauvegarde de secours maintenant.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// L'IMPLÉMENTATION INERTE
// ─────────────────────────────────────────────────────────────────────────────
const MESSAGE_INDISPONIBLE =
  'La synchronisation n’est pas encore disponible dans cette version. Vos données sont enregistrées sur cet appareil ; exportez une sauvegarde de secours en fin de journée.';

/**
 * Le port inerte. Il ne ment pas, et c'est sa seule fonction.
 *
 * `rafraichirEtat` existe pour que L5c puisse afficher un compte d'opérations
 * VRAI (lu par `depotOutbox`) tout en sachant que la sync, elle, est indisponible.
 * Sans lui, l'écran devrait choisir entre afficher « 0 en attente » (faux) ou ne
 * rien afficher (inutile).
 */
export function creerPortSyncInerte(): PortSync & {
  rafraichirEtat(missionId: string, operationsEnAttente: number, operationsBloquees: number): void;
} {
  const instantanes = new Map<string, { enAttente: number; bloquees: number }>();

  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- la signature du port est asynchrone (L6a fera du réseau) ; l'implémentation inerte n'a rien à attendre.
    async synchroniserMaintenant(): Promise<ResultatSync> {
      return {
        statut: 'indisponible',
        message: MESSAGE_INDISPONIBLE,
        operationsMontees: 0,
        operationsRestantes: null,
      };
    },

    etat(missionId: string): EtatSyncMission {
      const instantane = instantanes.get(missionId) ?? null;
      const enAttente = instantane?.enAttente ?? null;
      return {
        missionId,
        statut: 'indisponible',
        derniereSyncReussieLe: null,
        operationsEnAttente: enAttente,
        operationsBloquees: instantane?.bloquees ?? null,
        alerte: evaluerAlerteSauvegarde(null, enAttente),
      };
    },

    rafraichirEtat(missionId: string, operationsEnAttente: number, operationsBloquees: number) {
      instantanes.set(missionId, { enAttente: operationsEnAttente, bloquees: operationsBloquees });
    },
  };
}

/** L'instance utilisée par la coquille tant que L6a n'a pas livré. */
export const portSyncInerte = creerPortSyncInerte();
