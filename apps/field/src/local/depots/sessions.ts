// =============================================================================
// DÉPÔT DES SESSIONS DE COLLECTE — lecture seule, indexée (`LOT_L5.md` §2)
//
// Les dépôts LISENT ; ils n'écrivent jamais. Toute écriture passe par
// `local/ecriture.ts`, sans exception (voir l'en-tête de ce fichier-là). La
// séparation n'est pas décorative : c'est elle qui garantit que « chaque écriture
// pousse une op dans l'outbox » (05 §9.2-2) reste vrai quand quarante écrans
// auront été écrits.
//
// ── LE DÉCHIFFREMENT A LIEU ICI, PAS DANS LES ÉCRANS ─────────────────────────
// Une `SessionLocale` est l'index en clair FUSIONNÉ avec sa charge déchiffrée :
// les écrans manipulent un objet plat et n'ont aucune raison de connaître
// l'existence d'une `Enveloppe`. Un écran qui déchiffrerait lui-même finirait par
// oublier de valider le schéma, et une donnée corrompue passerait pour vide.
//
// Traçabilité : E12 (entretiens par interlocuteur, à-revoir), E6 (hors ligne total).
// =============================================================================
import type { BaseLocale } from '../base.js';
import { contexteLocal } from '../contexte.js';
import type { Enveloppe } from '../enveloppe.js';
import {
  chargeInterviewSchema,
  type ChargeInterview,
  type IndexInterview,
  type StatutSessionPersiste,
} from '../formes.js';
import { maintenant } from '../horloge.js';

/** Une session lisible : en-tête d'index + charge déchiffrée, à plat. */
export type SessionLocale = IndexInterview & ChargeInterview;

/**
 * Options de lecture du jour.
 *
 * `fuseau` est celui de la MISSION (03 §22.2, `missions.timezone`) : un audit à
 * Singapour n'a pas la même journée que le fuseau du portable de l'auditeur, et
 * « aujourd'hui » est la question la plus posée du cockpit (03 §34.2). Absent, on
 * retombe sur le fuseau de l'appareil — jamais sur une valeur en dur (invariant 2).
 */
export interface OptionsDuJour {
  readonly missionId?: string;
  readonly fuseau?: string;
  /** Instant de référence, ISO UTC. Par défaut `maintenant()` (horloge corrigée). */
  readonly instantIso?: string;
}

/** La date civile (AAAA-MM-JJ) d'un instant UTC, dans un fuseau donné. */
function jourCivil(instantIso: string, fuseau: string | undefined): string {
  const format = new Intl.DateTimeFormat('fr-CA', {
    timeZone: fuseau,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return format.format(new Date(instantIso));
}

async function dechiffrerSessions(
  lignes: readonly (IndexInterview & { charge: Enveloppe })[],
): Promise<SessionLocale[]> {
  const { coffre } = contexteLocal();
  const sessions: SessionLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    sessions.push({ ...index, ...(await coffre.dechiffrer(charge, chargeInterviewSchema)) });
  }
  return sessions;
}

/**
 * Comparateur d'affichage : l'heure prévue d'abord, les non planifiées ensuite.
 * Les sessions sans horaire ne disparaissent pas — 03 §17.3, « zéro oubli ».
 */
function parHeurePrevue(a: SessionLocale, b: SessionLocale): number {
  if (a.scheduledAt === null && b.scheduledAt === null) return a.id.localeCompare(b.id);
  if (a.scheduledAt === null) return 1;
  if (b.scheduledAt === null) return -1;
  return a.scheduledAt.localeCompare(b.scheduledAt);
}

export const depotSessions = {
  /**
   * Les sessions du jour : celles PLANIFIÉES aujourd'hui (fuseau de mission) et
   * celles qui sont EN COURS, quelle que soit leur date.
   *
   * Une session commencée hier et jamais terminée doit rester sous les yeux de
   * l'auditeur : c'est le genre d'oubli que 03 §17.3 traque, et le verrou à
   * 60 minutes (05 §9.7) se règle sur le même fait.
   */
  async duJour(options: OptionsDuJour = {}): Promise<SessionLocale[]> {
    const { base } = contexteLocal();
    const reference = options.instantIso ?? maintenant();
    const jour = jourCivil(reference, options.fuseau);

    const collection =
      options.missionId === undefined
        ? base.interviews.toCollection()
        : base.interviews.where('missionId').equals(options.missionId);

    const lignes = await collection
      .filter(
        (ligne) =>
          ligne.supprimeLe === null &&
          (ligne.status === 'en_cours' ||
            (ligne.scheduledAt !== null && jourCivil(ligne.scheduledAt, options.fuseau) === jour)),
      )
      .toArray();

    return (await dechiffrerSessions(lignes)).sort(parHeurePrevue);
  },

  /** Une session par son identifiant, ou `null`. */
  async parId(id: string): Promise<SessionLocale | null> {
    const { base } = contexteLocal();
    const ligne = await base.interviews.get(id);
    if (ligne === undefined) return null;
    const [session] = await dechiffrerSessions([ligne]);
    return session ?? null;
  },

  /**
   * Y a-t-il une session EN COURS sur cet appareil ?
   *
   * Deux règles en dépendent, et aucune des deux n'est cosmétique : le délai
   * d'inactivité passe de 15 à 60 minutes (05 §9.7) et le service worker REFUSE
   * d'activer une nouvelle version (05 §31-1). Compter par l'index `status` plutôt
   * que de charger les lignes : la question est posée à chaque interaction.
   */
  async sessionEnCours(baseFournie?: BaseLocale): Promise<boolean> {
    // La base peut être FOURNIE, et ce n'est pas une commodité d'appel : le garde
    // de mise à jour du service worker (05 §31-1) doit répondre même coffre
    // fermé, alors que `contexteLocal()` lève dans cet état. Le prédicat reste
    // unique — une seule définition de « une session est en cours » —, seule sa
    // source de base varie.
    const base = baseFournie ?? contexteLocal().base;
    return (await base.interviews.where('status').equals('en_cours').count()) > 0;
  },

  /** Le décompte par statut d'une mission — matière du cockpit (03 §34.2). */
  async compterParStatut(missionId: string): Promise<Record<StatutSessionPersiste, number>> {
    const { base } = contexteLocal();
    const comptes: Record<StatutSessionPersiste, number> = {
      non_demarre: 0,
      en_cours: 0,
      termine: 0,
    };
    await base.interviews
      .where('missionId')
      .equals(missionId)
      .each((ligne) => {
        if (ligne.supprimeLe === null) comptes[ligne.status] += 1;
      });
    return comptes;
  },
};
