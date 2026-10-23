// =============================================================================
// CRÉER UNE PHOTO LOCALE — lot L6c-1 (ex-L5f).
//
// Le chaînon entre le champ de capture (zone question, panneau de notes) et le
// stockage chiffré : compresser (03 §29 R2 : 2048 px, JPEG 0,85, AVANT stockage,
// original non conservé), puis écrire ligne `attachments` + octets + op d'outbox
// dans UNE transaction (05 §9.2, `local/octets.ts`).
//
// Rattachement (DECISIONS [L6c] du 2026-10-09) : la pièce porte la session ; elle
// porte AUSSI la réponse courante quand il y en a une. Une question encore sans
// réponse garde le geste actif — la photo est alors rattachée à la session seule.
//
// Traçabilité : E6, E7 · invariants 1 (UUID v7 client) et 7.
// =============================================================================
import { uuidv7 } from 'uuidv7';
import { maintenant } from '../local/horloge.js';
import { ecrirePieceAvecOctets } from '../local/octets.js';
import { compresserPhoto, renduNavigateur, type RenduImage } from '../sauvegarde/photos.js';

export interface DemandePhotoLocale {
  readonly missionId: string;
  readonly interviewId: string | null;
  readonly answerId: string | null;
  readonly createdBy: string;
  /** Le `File` du champ `<input type="file">`. */
  readonly fichier: Blob;
}

/** Message rendu quand le fichier choisi n'est pas une image. */
export const MESSAGE_PAS_UNE_IMAGE =
  'Ce fichier n’est pas une image : choisissez une photo (JPEG, PNG, HEIC…). Rien n’a été enregistré.';

/** Nom de fichier neutre : l'original peut porter un nom parlant (personne, lieu). */
function nomDeFichier(id: string): string {
  return `photo-${id}.jpg`;
}

/**
 * Compresse puis range la photo. Rend l'id (UUID v7) de la pièce créée.
 * Un fichier qui n'est pas une image, ou qui ne se décode pas, ne laisse RIEN.
 */
export async function creerPhotoLocale(
  demande: DemandePhotoLocale,
  rendu: RenduImage = renduNavigateur,
): Promise<string> {
  if (!demande.fichier.type.startsWith('image/')) throw new Error(MESSAGE_PAS_UNE_IMAGE);

  const photo = await compresserPhoto(demande.fichier, undefined, rendu);
  const octets = new Uint8Array(await photo.donnees.arrayBuffer());
  const id = uuidv7();
  await ecrirePieceAvecOctets(
    {
      entite: 'attachment_meta',
      id,
      missionId: demande.missionId,
      action: 'upsert',
      index: { interviewId: demande.interviewId, answerId: demande.answerId, kind: 'photo' },
      charge: {
        content: null,
        filename: nomDeFichier(id),
        mime: photo.donnees.type === '' ? 'image/jpeg' : photo.donnees.type,
        sizeBytes: octets.byteLength,
        storageKey: null,
        purgeAfter: null,
        createdBy: demande.createdBy,
        clientCreatedAt: maintenant(),
      },
    },
    octets,
  );
  return id;
}
