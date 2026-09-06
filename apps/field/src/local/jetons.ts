// =============================================================================
// LE JETON DE RAFRAÎCHISSEMENT, CHIFFRÉ DANS DEXIE — 11 §3, 05 §31-3
//
// 11 §3 : « terrain (`apps/field`) = Bearer + refresh token stocké **CHIFFRÉ dans
// Dexie** (nécessaire hors ligne, §31.3) ». Le mot « chiffré » n'est pas
// décoratif : un jeton de 30 jours en clair dans IndexedDB est, sur une tablette
// volée, un accès complet au compte de l'auditeur — donc à toutes ses missions,
// serveur compris. Il est donc rangé dans une `Enveloppe` sous la DEK, et n'est
// lisible que coffre OUVERT.
//
// ── LA CONSÉQUENCE, QUI EST UNE FONCTIONNALITÉ ───────────────────────────────
// 05 §31-3 : « si le refresh token (30 j) expire pendant une longue période hors
// ligne, le déverrouillage local continue de fonctionner, la collecte se poursuit
// sans interruption ; seule la synchronisation attend une reconnexion ». Ce
// module ne participe donc JAMAIS au déverrouillage : la KEK dérive du mot de
// passe et de rien d'autre (05 §9.7). Un jeton absent, expiré ou illisible
// n'empêche pas de collecter — il empêche de synchroniser, et c'est tout.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total, PC ET tablette).
// =============================================================================
import { z } from 'zod';
import { CLES_META, ecrireMeta, effacerMeta, lireMeta, type BaseLocale } from './base.js';
import { DonneeLocaleCorrompueError, type Coffre } from './coffre.js';
import { estEnveloppe } from './enveloppe.js';

const jetonSchema = z.object({
  /** Le jeton opaque lui-même. Jamais journalisé, jamais affiché (11 §2). */
  valeur: z.string().min(1),
  /** Expiration annoncée par le serveur, ISO 8601 UTC. Informative : le serveur tranche. */
  expireLe: z.string().nullable(),
  /** Quand ce jeton a-t-il été rangé ici ? Sert au message du 05 §31-3. */
  enregistreLe: z.string(),
});

export type JetonRafraichissement = z.infer<typeof jetonSchema>;

export async function enregistrerJetonRafraichissement(
  base: BaseLocale,
  coffre: Coffre,
  jeton: JetonRafraichissement,
): Promise<void> {
  const enveloppe = await coffre.chiffrer(jetonSchema.parse(jeton));
  await ecrireMeta(base, CLES_META.jetonRafraichissement, enveloppe);
}

/**
 * Rend le jeton, ou `null` s'il n'y en a pas.
 *
 * **`null` veut dire ABSENT, et rien d'autre.** Une valeur présente mais qui
 * n'est pas une enveloppe chiffrée LÈVE, tout comme une enveloppe que le coffre
 * n'arrive pas à ouvrir. Le code rendait `null` dans le premier cas, à rebours de
 * ce paragraphe : le testeur l'a relevé, et l'écart n'était pas cosmétique — un
 * jeton corrompu qui se lit « absent » envoie l'auditeur se reconnecter et
 * personne n'apprend jamais que le chiffrement local a cessé de fonctionner. Or
 * ce même chiffrement protège les réponses d'audit, pas seulement ce jeton.
 */
export async function lireJetonRafraichissement(
  base: BaseLocale,
  coffre: Coffre,
): Promise<JetonRafraichissement | null> {
  const brut = await lireMeta(base, CLES_META.jetonRafraichissement);
  if (brut === undefined || brut === null) return null;
  if (!estEnveloppe(brut)) {
    throw new DonneeLocaleCorrompueError(
      'le jeton de connexion enregistré sur cet appareil n’est pas une enveloppe chiffrée',
    );
  }
  return coffre.dechiffrer(brut, jetonSchema);
}

/** Déconnexion, ou détection de réutilisation côté serveur (11 §3). */
export async function effacerJetonRafraichissement(base: BaseLocale): Promise<void> {
  await effacerMeta(base, CLES_META.jetonRafraichissement);
}
