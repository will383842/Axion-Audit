// =============================================================================
// LE PORT DE SYNC RÉEL — remplace `portSyncInerte` (L6a, `LOT_L6.md` §3ter A et B-2)
//
// L'interface (`PortSync`, `EtatSyncMission`, `ResultatSync`) et la fonction pure
// d'alerte (`evaluerAlerteSauvegarde`) sont celles de `local/port-sync.ts` : ce
// fichier les IMPLÉMENTE, il ne les redéclare pas.
//
// R2 d'A29 (A-10) : l'alerte de l'invariant 8 se calcule ici depuis `meta` (le
// dernier succès écrit par le moteur) et la file réelle — la MÊME lecture que le
// cockpit (`agenda/jour.ts`), donc le même verdict sur les deux écrans.
//
// Correspondance tenue (StatutSync / ResultatSync.statut) :
//   push abouti, rien de bloqué     → 'a_jour' ou 'en_attente' / 'succes'
//   jamais de succès connu           → 'jamais_synchronisee'
//   réseau absent, refus du lot      → 'echec' / 'echec'
//   op rejetée, en erreur, à examiner → 'echec' / 'echec' (rien n'est caché)
//   refresh refusé (05 §31-3)        → 'indisponible' / 'indisponible' + message §31-3
//
// Toute décision vit ici et dans `moteur.ts` ; l'écran ne fait que rendre.
// Traçabilité : E7, E38 ; invariant 8 ; 05 §31-3.
// =============================================================================
import { cleDerniereSyncReussie, lireMeta, type BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import { instantMs } from '../local/horloge.js';
import {
  evaluerAlerteSauvegarde,
  type EtatSyncMission,
  type PortSync,
  type ResultatSync,
  type StatutSync,
} from '../local/port-sync.js';
import { creerDescente, type BilanPull } from './descente.js';
import { creerMoteurSync, remettreOpsEnFile, type BilanPush } from './moteur.js';
import { MESSAGE_RECONNEXION_REQUISE, type TransportSync } from './transport.js';

/**
 * Arbitrage A01 (2026-10-09) : `indisponible` reste UN statut (interface gelée),
 * mais il recouvre trois faits que l'écran ne doit pas confondre. Le TEXTE vient
 * d'ici — `messageAffiche` —, les écrans l'affichent sans le recomposer.
 */
export const MESSAGE_VERIFICATION_SYNC = 'Vérification de la synchronisation…';
export const MESSAGE_AUCUNE_MISSION = 'Aucune mission à synchroniser sur cet appareil.';

export interface DependancesPort {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
  /**
   * `tirer` est facultatif au TYPE seulement : un port sans descente est celui
   * de L6a (montée seule), que ses tests d'origine construisent encore. En
   * production (`app/port-sync-terrain.ts`) le transport réel porte les deux.
   */
  readonly transport: Pick<TransportSync, 'pousser'> & Partial<Pick<TransportSync, 'tirer'>>;
}

export interface PortSyncReel extends PortSync {
  /** Relit `meta` (dernier succès) et l'outbox, met à jour l'instantané de `etat()`. */
  actualiser(missionId: string): Promise<EtatSyncMission>;
}

/**
 * Le port réel tel que `creerPortSync` le rend : avec le TEXTE de ses états.
 * Séparé de `PortSyncReel` pour que les doubles de test d'un port réel (qui ne
 * simulent que l'état) restent des `PortSyncReel` valides.
 */
export interface PortSyncAffichable extends PortSyncReel {
  /**
   * Le texte d'un `indisponible` : reconnexion requise (refresh refusé), état
   * pas encore lu, ou — `null` en entrée — aucune mission sur l'appareil.
   * Tout autre statut : `null`, l'écran n'a rien à ajouter.
   */
  messageAffiche(missionId: string | null): string | null;
  /**
   * Remet « en attente » les ops `a_examiner` désignées de la mission ;
   * `tentatives` → 0. Ne touche NI la charge, NI l'opId, NI clientUpdatedAt.
   * Une op `rejetee` ou d'une autre mission est ignorée. Rend le nombre remis,
   * puis actualise l'état de la mission. Porté ici et non par `PortSyncReel`,
   * pour que ses doubles de test restent valides (même raison que ci-dessus).
   */
  remettreEnFile(missionId: string, opIds: readonly string[]): Promise<number>;
}

const MESSAGE_HORS_LIGNE =
  'Le siège est injoignable. Vos données sont enregistrées sur cet appareil ; la synchronisation reprendra au retour du réseau.';

const MESSAGE_PANNE_LOCALE =
  'La synchronisation n’a pas pu lire la file locale. Rien n’a été retiré de cet appareil ; exportez une sauvegarde de secours.';

/** Le dernier essai qui n'a pas abouti, retenu jusqu'au prochain essai. */
type EchecRetenu = 'echec' | 'indisponible';

/** Ce qu'un passage laisse à l'état de la mission, tant qu'un autre ne l'a pas remplacé. */
const ECHEC_RETENU: Record<BilanPush['statut'], EchecRetenu | null> = {
  succes: null,
  hors_ligne: 'echec',
  refus: 'echec',
  reconnexion_requise: 'indisponible',
};

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`;
}

/** Le message en français d'un passage abouti côté transport. */
function messageDuBilan(bilan: BilanPush): string {
  const parties = [pluriel(bilan.operationsAcquittees, 'opération montée', 'opérations montées')];
  if (bilan.arbitrees > 0) {
    parties.push(pluriel(bilan.arbitrees, 'réponse arbitrée', 'réponses arbitrées'));
  }
  if (bilan.rejetees > 0) {
    parties.push(pluriel(bilan.rejetees, 'opération rejetée', 'opérations rejetées'));
  }
  if (bilan.enErreur > 0) {
    parties.push(pluriel(bilan.enErreur, 'opération en erreur', 'opérations en erreur'));
  }
  return `Synchronisation : ${parties.join(', ')}.`;
}

const MESSAGE_DESCENTE_HORS_LIGNE =
  'Vos saisies sont montées, mais les nouveautés du siège n’ont pas pu descendre : elles arriveront à la prochaine synchronisation.';

/** Ce qu'une descente en échec laisse à l'état de la mission. */
const ECHEC_DESCENTE: Record<Exclude<BilanPull['statut'], 'succes'>, EchecRetenu> = {
  hors_ligne: 'echec',
  refus: 'echec',
  reconnexion_requise: 'indisponible',
};

/**
 * Le résultat d'un passage complet : la montée, puis la descente. Une descente en
 * échec rend le passage en échec (le message le dit), sans retirer à la montée
 * ce qu'elle a fait — le dernier succès, écrit par le moteur, reste acquis.
 */
function resultatDuPassage(
  montee: ResultatSync,
  descente: BilanPull | null,
): { readonly resultat: ResultatSync; readonly retenu: EchecRetenu | null } {
  if (descente === null || descente.statut === 'succes') {
    const illisibles = descente?.enregistrementsIllisibles ?? 0;
    const message =
      illisibles === 0
        ? montee.message
        : `${montee.message} ${pluriel(illisibles, 'ligne du siège non lisible', 'lignes du siège non lisibles')} sur cet appareil.`;
    return { resultat: { ...montee, message }, retenu: null };
  }
  const retenu = ECHEC_DESCENTE[descente.statut];
  return {
    resultat: {
      ...montee,
      statut: retenu,
      message:
        descente.statut === 'reconnexion_requise'
          ? MESSAGE_RECONNEXION_REQUISE
          : (descente.message ?? MESSAGE_DESCENTE_HORS_LIGNE),
    },
    retenu,
  };
}

function resultatDuBilan(bilan: BilanPush): ResultatSync {
  const base = {
    operationsMontees: bilan.operationsAcquittees,
    operationsRestantes: bilan.operationsRestantes,
  };
  const retenu = ECHEC_RETENU[bilan.statut];
  if (retenu === null) {
    return {
      ...base,
      statut: bilan.rejetees + bilan.enErreur > 0 ? 'echec' : 'succes',
      message: messageDuBilan(bilan),
    };
  }
  // Le transport porte le message d'un refus et du §31-3 ; une coupure n'en a pas.
  return { ...base, statut: retenu, message: bilan.message ?? MESSAGE_HORS_LIGNE };
}

/**
 * L'état d'une mission dont rien n'a encore été lu. L'alerte est le verdict de
 * la fonction pure sur ce qui est SU — rien —, jamais une alerte éteinte en dur :
 * « je ne sais pas » n'est pas « rien à signaler ».
 */
function etatNonLu(missionId: string): EtatSyncMission {
  const nonLu = { derniereSyncReussieLe: null, operationsEnAttente: null } as const;
  return {
    missionId,
    statut: 'indisponible',
    ...nonLu,
    operationsBloquees: null,
    alerte: evaluerAlerteSauvegarde(nonLu.derniereSyncReussieLe, nonLu.operationsEnAttente),
  };
}

function porteLaDescente(
  transport: DependancesPort['transport'],
): transport is Pick<TransportSync, 'pousser' | 'tirer'> {
  return typeof transport.tirer === 'function';
}

export function creerPortSync(deps: DependancesPort): PortSyncAffichable {
  const moteur = creerMoteurSync(deps);
  const descente = porteLaDescente(deps.transport)
    ? creerDescente({
        base: deps.base,
        get coffre(): Coffre {
          return deps.coffre;
        },
        transport: deps.transport,
      })
    : null;
  const instantanes = new Map<string, EtatSyncMission>();
  const echecs = new Map<string, EchecRetenu>();

  async function actualiser(missionId: string): Promise<EtatSyncMission> {
    const valeur = await lireMeta(deps.base, cleDerniereSyncReussie(missionId));
    const derniereSyncReussieLe = typeof valeur === 'string' ? valeur : null;
    let enAttente = 0;
    let bloquees = 0;
    await deps.base.outbox
      .where('missionId')
      .equals(missionId)
      .each((op) => {
        if (op.statut === 'en_attente') enAttente += 1;
        else bloquees += 1;
      });

    let statut: StatutSync;
    const echec = echecs.get(missionId);
    if (echec !== undefined) statut = echec;
    else if (bloquees > 0) statut = 'echec';
    else if (derniereSyncReussieLe === null) statut = 'jamais_synchronisee';
    else statut = enAttente > 0 ? 'en_attente' : 'a_jour';

    const etat: EtatSyncMission = {
      missionId,
      statut,
      derniereSyncReussieLe,
      operationsEnAttente: enAttente,
      operationsBloquees: bloquees,
      // B2 (2026-10-09) : ce qui ne vit QUE sur l'appareil = en attente + rejeté +
      // à examiner. Même somme que le cockpit (`agenda/jour.ts`), même verdict.
      alerte: evaluerAlerteSauvegarde(derniereSyncReussieLe, enAttente + bloquees, instantMs()),
    };
    instantanes.set(missionId, etat);
    return etat;
  }

  return {
    actualiser,

    async synchroniserMaintenant(missionId: string): Promise<ResultatSync> {
      let resultat: ResultatSync;
      let retenu: EchecRetenu | null;
      try {
        const bilan = await moteur.pousser(missionId);
        resultat = resultatDuBilan(bilan);
        retenu = ECHEC_RETENU[bilan.statut];
        // Montée PUIS descente, au même geste. Pas de descente si le siège est
        // injoignable ou l'authentification à refaire : elle échouerait de même.
        if (descente !== null && (bilan.statut === 'succes' || bilan.statut === 'refus')) {
          const tiree = await descente.tirer(missionId);
          if (retenu === null) {
            ({ resultat, retenu } = resultatDuPassage(resultat, tiree));
          }
        }
      } catch {
        // Une panne locale (coffre, base) n'est pas un succès ; elle ne sort
        // aucune op de la file et se dit en français, sans trace technique.
        resultat = {
          statut: 'echec',
          message: MESSAGE_PANNE_LOCALE,
          operationsMontees: 0,
          operationsRestantes: null,
        };
        retenu = 'echec';
      }
      if (retenu === null) echecs.delete(missionId);
      else echecs.set(missionId, retenu);
      await actualiser(missionId);
      return resultat;
    },

    async remettreEnFile(missionId: string, opIds: readonly string[]): Promise<number> {
      const remises = await remettreOpsEnFile(deps.base, missionId, opIds);
      await actualiser(missionId);
      return remises;
    },

    messageAffiche(missionId: string | null): string | null {
      if (missionId === null) return MESSAGE_AUCUNE_MISSION;
      if (echecs.get(missionId) === 'indisponible') return MESSAGE_RECONNEXION_REQUISE;
      return instantanes.has(missionId) ? null : MESSAGE_VERIFICATION_SYNC;
    },

    etat(missionId: string): EtatSyncMission {
      // Rien de lu encore : « je ne sais pas » n'est ni « jamais », ni « rien en
      // attente ». L'état dit `indisponible` (jamais une pastille verte) et les
      // comptes `null` ; `actualiser` le remplace dès la première lecture.
      return instantanes.get(missionId) ?? etatNonLu(missionId);
    },
  };
}
