// =============================================================================
// ÉCRITURES SUR UNE SESSION — « Nouvel entretien », démarrage, bloc-notes
//
// Trois gestes, tous par `ecrireLocal` (ligne + op dans UNE transaction) :
//   · `creerEntretien`        03 §17.4 — trois champs, une session `non_demarre`,
//                             UUID v7 généré ICI (invariant 1, P1-4).
//   · `demarrerEntretien`     03 M3.2 V2.10 — l'accord de participation est LA
//                             seule étape humaine ; la transition passe par la
//                             machine à états, jamais à côté.
//   · `ecrireNotesGenerales`  03 M3.1 — le bloc-notes de l'entretien, en continu.
//
// Une session se ré-upserte ENTIÈRE : le port d'écriture envoie l'entité
// complète (le serveur n'a pas nos index). `decomposer` sépare l'index en clair
// de la charge chiffrée, champ par champ, et le compilateur refuse qu'un champ
// manque ou change de côté (`satisfies`).
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E33 (RGPD :
// information préalable versionnée, 06 §10.4).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import type { SessionLocale } from '../local/depots/sessions.js';
import { ecrireLocal, type ChargeUtile, type ClesIndex } from '../local/ecriture.js';
import { maintenant } from '../local/horloge.js';
import { etatSession, peutTransiter, type ProfilAuditeur } from './machine.js';

/**
 * La version de la mention d'information lue à l'interviewé (06 §10.4 : « la
 * mention d'information est VERSIONNÉE et sa version est enregistrée sur chaque
 * session »). Le TEXTE de la phrase-script, lui, est « fourni » par le pack
 * (03 M3.2) sans y figurer — voir `DemarrageEntretien.tsx` et le rapport A22.
 */
export const VERSION_MENTION_INFORMATION = 'v1';

export interface DemandeNouvelEntretien {
  readonly missionId: string;
  /** L'unité (03 §17.4 : « nom, fonction, unité »). */
  readonly orgUnitId: string;
  readonly personName: string;
  readonly personRole: string;
  /** Facultatif (03 M3.2). `null` plutôt que chaîne vide : rien n'est deviné. */
  readonly personEmail: string | null;
  /** Le propriétaire (05 §9.9) — l'identité rangée par `auditeur.ts`. */
  readonly conductedBy: string;
}

function decomposer(session: SessionLocale): {
  index: ClesIndex<'interview'>;
  charge: ChargeUtile<'interview'>;
} {
  const index = {
    orgUnitId: session.orgUnitId,
    kind: session.kind,
    status: session.status,
    scheduleStatus: session.scheduleStatus,
    scheduledAt: session.scheduledAt,
  } satisfies ClesIndex<'interview'>;
  const charge = {
    conductedBy: session.conductedBy,
    mode: session.mode,
    personName: session.personName,
    personRole: session.personRole,
    personServiceId: session.personServiceId,
    personEmail: session.personEmail,
    participants: session.participants,
    generalNotes: session.generalNotes,
    linkedReviewAnswerId: session.linkedReviewAnswerId,
    documentRequestId: session.documentRequestId,
    consentGiven: session.consentGiven,
    consentAudio: session.consentAudio,
    consentedAt: session.consentedAt,
    informationNoticeVersion: session.informationNoticeVersion,
    noticeShownAt: session.noticeShownAt,
    scheduledDurationMin: session.scheduledDurationMin,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    valideeLe: session.valideeLe,
    clientCreatedAt: session.clientCreatedAt,
  } satisfies ChargeUtile<'interview'>;
  return { index, charge };
}

async function reecrire(session: SessionLocale): Promise<void> {
  const { index, charge } = decomposer(session);
  await ecrireLocal({
    entite: 'interview',
    id: session.id,
    missionId: session.missionId,
    action: 'upsert',
    index,
    charge,
  });
}

/**
 * Crée un entretien `non_demarre` et rend son identifiant (UUID v7 client).
 *
 * `mode = 'sur_site'` : le 04 dit « défaut APPLICATIF `sur_site` si
 * `kind='entretien'` » sans dire de quel côté ; `LOT_L5.md` §5-5 propose
 * « terrain uniquement — c'est là que la session naît ». Appliqué ici, et
 * signalé au rapport pour confirmation.
 */
export async function creerEntretien(demande: DemandeNouvelEntretien): Promise<string> {
  const id = uuidv7();
  const nom = demande.personName.trim();
  const fonction = demande.personRole.trim();
  if (nom === '' || fonction === '' || demande.orgUnitId === '') {
    throw new Error('Le nom, la fonction et l’unité sont nécessaires pour ouvrir un entretien.');
  }
  const courriel = demande.personEmail?.trim() ?? '';

  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: demande.missionId,
    action: 'upsert',
    index: {
      orgUnitId: demande.orgUnitId,
      kind: 'entretien',
      status: 'non_demarre',
      scheduleStatus: 'a_planifier',
      scheduledAt: null,
    },
    charge: {
      conductedBy: demande.conductedBy,
      mode: 'sur_site',
      personName: nom,
      personRole: fonction,
      personServiceId: null,
      personEmail: courriel === '' ? null : courriel,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: false,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: null,
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: maintenant(),
    },
  });
  return id;
}

/**
 * Démarre la session : `non_demarre` → `en_cours`, par la machine à états.
 *
 * L'accord de participation est exigé ICI, pas seulement à l'écran : une session
 * démarrée sans accord horodaté n'existe pas (03 M3.2 V2.10, 06 §10.4).
 */
export async function demarrerEntretien(
  session: SessionLocale,
  profil: ProfilAuditeur,
  accordDeParticipation: boolean,
): Promise<void> {
  if (!accordDeParticipation) {
    throw new Error(
      'L’accord de participation de l’interlocuteur doit être recueilli avant de démarrer.',
    );
  }
  const autorisation = peutTransiter(etatSession(session), 'demarrer', profil);
  if (!autorisation.autorise) throw new Error(autorisation.motif);

  const instant = maintenant();
  await reecrire({
    ...session,
    status: 'en_cours',
    startedAt: session.startedAt ?? instant,
    consentGiven: true,
    consentedAt: instant,
    informationNoticeVersion: VERSION_MENTION_INFORMATION,
    noticeShownAt: instant,
  });
}

/** Le bloc-notes général de l'entretien (03 M3.1, zone droite) — enregistrement continu. */
export async function ecrireNotesGenerales(session: SessionLocale, texte: string): Promise<void> {
  const notes = texte === '' ? null : texte;
  if (notes === session.generalNotes) return;
  await reecrire({ ...session, generalNotes: notes });
}
