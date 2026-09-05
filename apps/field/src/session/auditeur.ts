// =============================================================================
// L'IDENTITÉ DE L'AUDITEUR SUR CET APPAREIL — L5b
//
// Toute session créée ici porte un `conductedBy` (05 §9.9 : « écritures de sync
// réservées au PROPRIÉTAIRE de la session ») et toute note volante un
// `createdBy` (04, amendement S-3). Le socle L5a range le jeton de
// rafraîchissement mais pas l'identité qui va avec ; ce module la range, au même
// endroit et de la même façon — CHIFFRÉE dans `meta`, sous la DEK.
//
// **Aucun identifiant n'est inventé.** Sans identité, l'écran « Nouvel
// entretien » affiche son état d'erreur (cause + action) : une session dont le
// propriétaire serait fabriqué localement serait refusée par le serveur
// (`forbidden`, 05 §9.9) et resterait bloquée dans la file — une journée
// d'entretiens découverte perdue au moment de la sync.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total).
// =============================================================================
import { z } from 'zod';
import { CLES_META, ecrireMeta, lireMeta, type BaseLocale } from '../local/base.js';
import { DonneeLocaleCorrompueError, type Coffre } from '../local/coffre.js';
import { estEnveloppe } from '../local/enveloppe.js';
import type { ProfilAuditeur } from './machine.js';

export const PROFILS_AUDITEUR = [
  'guide_strict',
  'expert',
] as const satisfies readonly ProfilAuditeur[];

export const identiteAuditeurSchema = z.object({
  /** `users.id` — le propriétaire des sessions écrites sur cet appareil. */
  id: z.uuid(),
  /** 03 §19.1 : réglé par l'administrateur, par utilisateur. */
  profil: z.enum(PROFILS_AUDITEUR),
});
export type IdentiteAuditeur = z.infer<typeof identiteAuditeurSchema>;

/** Le profil retenu quand rien n'est connu : le plus STRICT (03 §19.1, « aucune dérogation »). */
export const PROFIL_PAR_DEFAUT: ProfilAuditeur = 'guide_strict';

export async function memoriserIdentiteAuditeur(
  base: BaseLocale,
  coffre: Coffre,
  identite: IdentiteAuditeur,
): Promise<void> {
  const enveloppe = await coffre.chiffrer(identiteAuditeurSchema.parse(identite));
  await ecrireMeta(base, CLES_META.utilisateur, enveloppe);
}

/**
 * L'identité, ou `null` si aucune n'a jamais été rangée.
 *
 * Même règle que le jeton : `null` veut dire ABSENT. Une valeur présente mais
 * illisible LÈVE — un chiffrement local qui cesse de fonctionner ne doit pas se
 * lire « pas encore connecté ».
 */
export async function lireIdentiteAuditeur(
  base: BaseLocale,
  coffre: Coffre,
): Promise<IdentiteAuditeur | null> {
  const brut = await lireMeta(base, CLES_META.utilisateur);
  if (brut === undefined || brut === null) return null;
  if (!estEnveloppe(brut)) {
    throw new DonneeLocaleCorrompueError(
      'l’identité de l’auditeur enregistrée sur cet appareil n’est pas une enveloppe chiffrée',
    );
  }
  return coffre.dechiffrer(brut, identiteAuditeurSchema);
}
