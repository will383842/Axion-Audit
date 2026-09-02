// =============================================================================
// NOTES VOLANTES — 03 §17.4 : « rien de ce qui se dit ne doit attendre qu'on
// trouve la bonne case »
//
// Une note volante est une PIÈCE JOINTE de type `note` (04, P1-5 :
// `attachments.kind = 'note'`), dont le corps vit dans la charge chiffrée
// (`content` — contenu libre, donc donnée personnelle potentielle). Elle est
// rattachée à la SESSION dès sa capture (l'auditeur est en entretien) et à une
// RÉPONSE plus tard, ou jamais (`answerId`, « rattachement différé »).
//
// La lecture est ici parce que le socle n'a pas de dépôt `attachments` : même
// forme que les dépôts, lecture seule, index en clair + charge déchiffrée.
// L'écriture passe par `ecrireLocal` — entité `attachment_meta` (11 §4).
//
// Traçabilité : E13, E14 (notes volantes), E33 (contenu chiffré).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import { contexteLocal } from '../local/contexte.js';
import { ecrireLocal, type ChargeUtile, type ClesIndex } from '../local/ecriture.js';
import {
  chargeAttachmentSchema,
  type ChargeAttachment,
  type IndexAttachment,
} from '../local/formes.js';
import { maintenant } from '../local/horloge.js';

export type NoteVolanteLocale = IndexAttachment & ChargeAttachment;

/** Les notes volantes d'une session, de la plus ancienne à la plus récente. */
export async function lireNotesVolantes(interviewId: string): Promise<NoteVolanteLocale[]> {
  const { base, coffre } = contexteLocal();
  const lignes = await base.attachments
    .where('interviewId')
    .equals(interviewId)
    .filter((ligne) => ligne.kind === 'note' && ligne.supprimeLe === null)
    .toArray();
  const notes: NoteVolanteLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    notes.push({ ...index, ...(await coffre.dechiffrer(charge, chargeAttachmentSchema)) });
  }
  // L'UUID v7 est ordonnable dans le temps : trier par id = trier par capture.
  return notes.sort((a, b) => a.id.localeCompare(b.id));
}

function decomposer(note: NoteVolanteLocale): {
  index: ClesIndex<'attachment_meta'>;
  charge: ChargeUtile<'attachment_meta'>;
} {
  const index = {
    interviewId: note.interviewId,
    answerId: note.answerId,
    kind: note.kind,
  } satisfies ClesIndex<'attachment_meta'>;
  const charge = {
    content: note.content,
    filename: note.filename,
    mime: note.mime,
    sizeBytes: note.sizeBytes,
    storageKey: note.storageKey,
    purgeAfter: note.purgeAfter,
    createdBy: note.createdBy,
    clientCreatedAt: note.clientCreatedAt,
  } satisfies ChargeUtile<'attachment_meta'>;
  return { index, charge };
}

async function reecrire(note: NoteVolanteLocale, action: 'upsert' | 'delete_soft'): Promise<void> {
  const { index, charge } = decomposer(note);
  await ecrireLocal({
    entite: 'attachment_meta',
    id: note.id,
    missionId: note.missionId,
    action,
    index,
    charge,
  });
}

export interface DemandeNoteVolante {
  readonly missionId: string;
  readonly interviewId: string;
  readonly createdBy: string;
  readonly content: string;
}

/** Capture immédiate. Rend l'identifiant (UUID v7 client). */
export async function creerNoteVolante(demande: DemandeNoteVolante): Promise<string> {
  const contenu = demande.content.trim();
  if (contenu === '') throw new Error('Une note volante vide n’a rien à retenir.');
  const id = uuidv7();
  await ecrireLocal({
    entite: 'attachment_meta',
    id,
    missionId: demande.missionId,
    action: 'upsert',
    index: { interviewId: demande.interviewId, answerId: null, kind: 'note' },
    charge: {
      content: contenu,
      filename: null,
      mime: null,
      sizeBytes: null,
      storageKey: null,
      purgeAfter: null,
      createdBy: demande.createdBy,
      clientCreatedAt: maintenant(),
    },
  });
  return id;
}

/** Rattachement différé à une réponse (03 §17.4). */
export async function rattacherNoteVolante(
  note: NoteVolanteLocale,
  answerId: string,
): Promise<void> {
  if (note.answerId === answerId) return;
  await reecrire({ ...note, answerId }, 'upsert');
}

/** Détache une note de sa réponse — elle redevient volante, rien n'est perdu. */
export async function detacherNoteVolante(note: NoteVolanteLocale): Promise<void> {
  if (note.answerId === null) return;
  await reecrire({ ...note, answerId: null }, 'upsert');
}

/** Suppression LOGIQUE (invariant 7) : la ligne reste, marquée, et remonte. */
export async function supprimerNoteVolante(note: NoteVolanteLocale): Promise<void> {
  await reecrire(note, 'delete_soft');
}
