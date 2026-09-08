// =============================================================================
// LA JOURNÉE, VUE DU TERRAIN — matière du cockpit « Aujourd'hui » (03 §34.2)
//
// ── CE QUE LE COCKPIT DOIT MONTRER EN UN ÉCRAN, MOT POUR MOT ────────────────
// 03 §34.2 : « À l'ouverture, l'auditeur voit EN UN ÉCRAN, **toutes missions
// embarquées confondues** : **ses sessions du jour** (agenda §25.2 agrégé, avec
// unité, personne, type, **heure locale du site**) · **ses à-revoir en attente**
// (compteur cliquable par mission) · **l'état de sync par mission** (pastille +
// dernier succès + taille d'outbox) · **ses alertes personnelles** (V2.9 : en
// noyau, alertes **CALCULÉES LOCALEMENT** — à-revoir en attente, sync muette
// > 24 h, entretien commencé non terminé) · le bouton **reprendre là où il s'est
// arrêté**. Zéro navigation pour répondre à “qu'est-ce que je fais
// maintenant ?” »
//
// ── 100 % LOCAL, ET C'EST UNE EXIGENCE, PAS UNE OPTIMISATION ───────────────
// Le titre même du §34.2 dit « données 100 % locales », et sa parenthèse V2.9
// insiste : « les alertes SERVEUR §20.4 rejoignent le pull avec le centre
// d'alertes différable — **le cockpit reste 100 % local** ». Aucune fonction de ce
// module n'appelle le réseau. C'est ce qui rend l'écran d'accueil utilisable en
// mode avion, donc utilisable tout court (invariant 1).
//
// ── ET C'EST AUSSI LA FRONTIÈRE DE L'INVARIANT 6 ───────────────────────────
// `LOT_L5.md` §3.5 : sur l'appareil, « les **compteurs de SES propres lignes**
// (complétude d'une session, à-revoir ouverts, alertes du cockpit — §34.2 V2.9
// les dit calculées localement) » ; jamais « le scoring, l'agrégation
// multi-sessions et la triangulation ». Ce module compte des lignes locales et
// oriente vers la prochaine action. Il ne note rien, ne pondère rien, n'agrège
// aucun auditeur — invariant 6, « le terrain collecte, le siège produit ».
//
// ── LES COMPTEURS SE LISENT SANS DÉCHIFFRER ────────────────────────────────
// Les à-revoir, les statuts et les créneaux vivent dans l'en-tête d'INDEX en
// clair (`LOT_L5.md` §3.2). C'est ce qui rend ce cockpit instantané sur une
// mission à 5 000 réponses (05 §9.8) — et la meilleure preuve que la liste fermée
// des champs en clair a été choisie pour de bonnes raisons. Seules les sessions
// affichées sont déchiffrées, parce qu'il faut leur nom.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total),
// E38 (sauvegarde terrain, invariant 8).
// =============================================================================
import { cleDerniereSyncReussie, lireMeta, type BaseLocale } from '../local/base.js';
import { contexteLocal } from '../local/contexte.js';
import { depotOutbox } from '../local/depots/outbox.js';
import { depotReponses } from '../local/depots/reponses.js';
import { depotSessions, jourCivil, type SessionLocale } from '../local/depots/sessions.js';
import { chargeMissionSchema, type ChargeMission, type IndexMission } from '../local/formes.js';
import {
  evaluerAlerteSauvegarde,
  type EtatSyncMission,
  type PortSync,
} from '../local/port-sync.js';

export type MissionDuJour = IndexMission & ChargeMission;

/**
 * Clé `meta` du dernier rituel de fin de journée accompli (03 §34.2-2).
 * Écrite par l'écran de fin de journée, lue par le cockpit pour son rappel —
 * UNE définition, ici, pour que les deux ne divergent jamais.
 */
export const CLE_DERNIER_RITUEL = 'journee:dernier-rituel';

/** Les trois natures d'alerte que le §34.2 nomme, et RIEN d'autre. */
export type NatureAlerte = 'a_revoir_en_attente' | 'sync_muette' | 'entretien_non_termine';

export interface AlerteCockpit {
  readonly nature: NatureAlerte;
  readonly missionId: string;
  /** Message en français, prêt à afficher. */
  readonly message: string;
  /** La session ou la mission à ouvrir pour la traiter. */
  readonly cible: { readonly type: 'session'; readonly id: string } | { readonly type: 'mission' };
}

export interface EtatMissionDuJour {
  readonly mission: MissionDuJour;
  readonly sessions: readonly SessionLocale[];
  readonly aRevoirOuverts: number;
  readonly sync: EtatSyncMission;
}

export interface JourneeTerrain {
  readonly missions: readonly EtatMissionDuJour[];
  /** Toutes missions confondues, triées par heure prévue (03 §34.2). */
  readonly sessionsDuJour: readonly SessionLocale[];
  readonly alertes: readonly AlerteCockpit[];
  /** La session à reprendre — « le bouton reprendre là où il s'est arrêté ». */
  readonly aReprendre: SessionLocale | null;
  /** Entretiens TERMINÉS non validés : la matière de la validation groupée. */
  readonly aValider: readonly SessionLocale[];
}

/**
 * L'ordre d'affichage : l'heure prévue d'abord, les non planifiées ensuite.
 *
 * Le même comparateur que `depotSessions.duJour`, mais appliqué APRÈS le mélange
 * de plusieurs missions — sans quoi les sessions seraient triées mission par
 * mission et l'auditeur lirait deux fois sa matinée.
 */
function parHeurePrevue(a: SessionLocale, b: SessionLocale): number {
  if (a.scheduledAt === null && b.scheduledAt === null) return a.id.localeCompare(b.id);
  if (a.scheduledAt === null) return 1;
  if (b.scheduledAt === null) return -1;
  return a.scheduledAt.localeCompare(b.scheduledAt);
}

/** Les missions présentes sur l'appareil, titre déchiffré, hors supprimées. */
async function lireMissions(): Promise<MissionDuJour[]> {
  const { base, coffre } = contexteLocal();
  const lignes = await base.missions.filter((ligne) => ligne.supprimeLe === null).toArray();
  const missions: MissionDuJour[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    missions.push({ ...index, ...(await coffre.dechiffrer(charge, chargeMissionSchema)) });
  }
  return missions.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}

/**
 * Le dernier succès de synchronisation d'une mission, LU dans `meta` (03 §34.2,
 * arbitrage A01 D-6 du 2026-09-08 : « alimenter ce slot avec la vérité locale,
 * “jamais” compris »).
 *
 * `null` couvre trois cas, et c'est voulu : la clé absente (aucun push réussi
 * depuis cet appareil — ou une base créée avant l'existence de la clé, invariant
 * 7 : elle se lit, elle ne se répare pas), une valeur d'un autre type, une chaîne
 * qui n'est pas un instant. Dans les trois, la seule phrase honnête est « jamais
 * synchronisée » ; une date illisible affichée comme un succès serait le
 * garde-fou qui annonce plus qu'il ne fait.
 */
async function lireDerniereSyncReussie(
  base: BaseLocale,
  missionId: string,
): Promise<string | null> {
  const valeur = await lireMeta(base, cleDerniereSyncReussie(missionId));
  if (typeof valeur !== 'string' || Number.isNaN(Date.parse(valeur))) return null;
  return valeur;
}

/**
 * Les alertes personnelles d'une mission — les TROIS du §34.2, calculées
 * localement.
 *
 * Aucune n'est inventée et aucune n'est omise. L'ordre est celui de l'urgence
 * pour l'auditeur : ce qui menace la donnée (sync muette) avant ce qui menace la
 * qualité (entretien inachevé, à-revoir ouverts).
 */
function alertesDe(etat: {
  readonly mission: MissionDuJour;
  readonly sessions: readonly SessionLocale[];
  readonly aRevoirOuverts: number;
  readonly sync: EtatSyncMission;
}): AlerteCockpit[] {
  const alertes: AlerteCockpit[] = [];

  if (etat.sync.alerte.declenchee && etat.sync.alerte.message !== null) {
    alertes.push({
      nature: 'sync_muette',
      missionId: etat.mission.id,
      message: etat.sync.alerte.message,
      cible: { type: 'mission' },
    });
  }

  for (const session of etat.sessions) {
    if (session.status !== 'en_cours') continue;
    alertes.push({
      nature: 'entretien_non_termine',
      missionId: etat.mission.id,
      message: `La session avec ${session.personName ?? 'un interlocuteur'} est commencée et n’a pas été terminée. Reprenez-la ou terminez-la.`,
      cible: { type: 'session', id: session.id },
    });
  }

  if (etat.aRevoirOuverts > 0) {
    alertes.push({
      nature: 'a_revoir_en_attente',
      missionId: etat.mission.id,
      message: `${String(etat.aRevoirOuverts)} point(s) à revoir attendent d’être levés sur « ${etat.mission.titre} ».`,
      cible: { type: 'mission' },
    });
  }

  return alertes;
}

/**
 * Construit la journée. Une seule lecture, toutes missions confondues.
 *
 * `port` est le port de sync (`local/port-sync.ts`). Tant que L6a n'a pas livré,
 * il rend `statut: 'indisponible'` et le cockpit l'affiche TEL QUEL —
 * `LOT_L5.md` §3.6 : « jamais une pastille verte. Une pastille qui verdit sans
 * serveur, c'est exactement le garde-fou qui annonce plus qu'il ne fait. » Le
 * compte d'opérations en attente, lui, est VRAI : il vient de `depotOutbox`, qui
 * lit la file réelle.
 */
export async function construireJournee(
  port: PortSync,
  instantIso?: string,
): Promise<JourneeTerrain> {
  const { base } = contexteLocal();
  const missions = await lireMissions();
  const etats: EtatMissionDuJour[] = [];
  const toutesSessions: SessionLocale[] = [];
  const alertes: AlerteCockpit[] = [];

  for (const mission of missions) {
    const sessions = await depotSessions.duJour({
      missionId: mission.id,
      // 03 §34.2 : « heure locale du site ». Le jour civil se découpe donc au
      // fuseau DE LA MISSION, pas à celui de l'appareil — un auditeur en France
      // sur une mission au Vietnam ne doit pas voir la journée d'hier.
      fuseau: mission.timezone,
      ...(instantIso === undefined ? {} : { instantIso }),
    });
    const aRevoirOuverts = await depotReponses.aRevoirOuverts(mission.id);

    // Le compte d'opérations est LU, pas supposé — c'est ce qui rend
    // `sync_log.outbox_remaining` vrai par construction (`LOT_L5.md` §3.3-②).
    const comptes = await depotOutbox.compterParStatut(mission.id);
    const bloquees = comptes.rejetee + comptes.a_examiner;

    // Le dernier succès est LU lui aussi — dans `meta`, comme le compte ci-dessus
    // dans l'outbox — et non pris au port, qui ne persiste rien. Il nourrit À LA
    // FOIS l'alerte de l'invariant 8 et la carte du cockpit : une source pour un
    // fait (B6). Le STATUT, lui, reste celui du port : une clé `meta` prouve
    // qu'une sync a réussi UN JOUR, pas que l'appareil est à jour maintenant —
    // « jamais de pastille verte sans serveur » (LOT_L5.md §3.6, borne A01).
    const derniereSyncReussieLe = await lireDerniereSyncReussie(base, mission.id);

    const etatPort = port.etat(mission.id);
    const sync: EtatSyncMission = {
      ...etatPort,
      derniereSyncReussieLe,
      operationsEnAttente: comptes.en_attente,
      operationsBloquees: bloquees,
      alerte: evaluerAlerteSauvegarde(derniereSyncReussieLe, comptes.en_attente),
    };

    const etat = { mission, sessions, aRevoirOuverts, sync };
    etats.push(etat);
    toutesSessions.push(...sessions);
    alertes.push(...alertesDe(etat));
  }

  toutesSessions.sort(parHeurePrevue);

  // « Reprendre là où il s'est arrêté » : la session EN COURS. S'il y en a
  // plusieurs — ce que rien n'interdit —, la plus récemment commencée, parce que
  // c'est celle devant laquelle l'auditeur se trouve.
  const enCours = toutesSessions
    .filter((session) => session.status === 'en_cours')
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  return {
    missions: etats,
    sessionsDuJour: toutesSessions,
    alertes,
    aReprendre: enCours[0] ?? null,
    // TERMINÉES et NON validées : exactement ce que la validation groupée du
    // §19.1 V2.10 propose de cocher en fin de journée.
    aValider: toutesSessions.filter(
      (session) => session.status === 'termine' && session.valideeLe === null,
    ),
  };
}

/**
 * Le rappel discret du rituel de fin de journée (03 §34.2-2 : « rappel discret
 * sur le cockpit tant que le rituel du jour n'est pas fait »).
 *
 * Il est calculé sur le DERNIER EXPORT, pas sur l'heure : un auditeur qui a
 * exporté à midi avant de reprendre la route a fait son rituel. Rendre `null`
 * quand il n'y a rien à dire — un rappel permanent n'est plus un rappel.
 *
 * ── « DU JOUR » : LE JOUR CIVIL DE LA MISSION, PAS LE JOUR UTC ──────────────
 * Ce rappel comparait deux `slice(0, 10)` — deux jours UTC. À UTC+14, minuit
 * UTC tombe à 14 h locale : un rituel fait le matin « couvrait » la matinée du
 * lendemain, et un rituel fait la veille au soir éteignait le rappel d'un jour
 * qui venait de commencer sur le site — la nuit de données non sauvegardées que
 * l'invariant 8 interdit. Or la `journee` reçue est déjà découpée au fuseau de
 * MISSION (`depotSessions.duJour`, `jourCivil`) : le rappel était en désaccord
 * avec l'objet dont il parle. Arbitrage A01 du 2026-09-08 : « le jour civil du
 * rappel se calcule au fuseau de la mission concernée — ce n'est pas un choix
 * entre deux options, c'est l'alignement sur la journée dont il parle ».
 *
 * ── PLUSIEURS MISSIONS, PLUSIEURS FUSEAUX : `every`, PAS `some` ─────────────
 * Le rituel est UN geste pour tout l'appareil, mais « l'invariant 8 se compte
 * par mission, pas par soirée » (`EcranFinDeJournee`, B4). Le rappel ne s'éteint
 * donc que si le rituel couvre le jour courant de CHAQUE mission embarquée : dès
 * qu'un nouveau jour a commencé sur l'un des sites, il y a un jour de collecte
 * possible que rien n'a encore protégé. `some` éteindrait le rappel sur la foi
 * du fuseau le plus en retard — et un rituel fait à 22 h à Paris tairait le
 * rappel du matin déjà entamé à Hô Chi Minh-Ville. Le conservateur est la seule
 * lecture qui n'expose jamais de données par indulgence ; son coût est un
 * `Message` d'information de plus, sans verrou (03 §33.7).
 */
export function rappelFinDeJournee(
  dernierExportIso: string | null,
  journee: JourneeTerrain,
  instantIso: string,
): string | null {
  const aQuelqueChoseAProteger =
    journee.aValider.length > 0 ||
    journee.missions.some((m) => (m.sync.operationsEnAttente ?? 0) > 0);
  if (!aQuelqueChoseAProteger) return null;

  if (dernierExportIso !== null) {
    // Sans mission embarquée, le fuseau de l'appareil — jamais une valeur en dur
    // (invariant 2) ; et `every` sur une liste vide ne doit pas valoir « couvert ».
    const fuseaux: readonly (string | undefined)[] =
      journee.missions.length === 0
        ? [undefined]
        : journee.missions.map(({ mission }) => mission.timezone);
    const couvreChaqueMission = fuseaux.every(
      (fuseau) => jourCivil(dernierExportIso, fuseau) === jourCivil(instantIso, fuseau),
    );
    if (couvreChaqueMission) return null;
  }

  return 'Le rituel de fin de journée n’a pas encore été fait : synchronisation, sauvegarde de secours et validation des entretiens terminés.';
}
