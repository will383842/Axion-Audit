// =============================================================================
// TEMPS — invariant 5 et contrat 11 §3
// « Dates : ISO 8601 UTC en API (TIMESTAMPTZ en base) ; formatage au fuseau de
//   mission à l'affichage UNIQUEMENT (§22.2). »
// Le fuseau de mission est une donnée de mission (invariant 2 : rien en dur), il ne
// vit donc jamais dans une constante de code — d'où l'absence volontaire de valeur
// par défaut ici.
// Traçabilité : E32 (audits monde entier : fuseaux horaires), E43.
// =============================================================================
import { z } from 'zod';

/** Horodatage d'API : ISO 8601 **en UTC**. Un décalage non nul est refusé. */
export const isoUtcSchema = z.iso
  .datetime({ offset: false })
  .describe('Horodatage ISO 8601 en UTC (contrat 11 §3)');

export type IsoUtc = z.infer<typeof isoUtcSchema>;

/** Identifiant IANA de fuseau (ex. « Europe/Paris »), porté par la MISSION. */
export const fuseauIanaSchema = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Fuseau horaire IANA inconnu' },
  );

/** Instant courant, toujours en UTC. Seul point d'entrée autorisé pour « maintenant ». */
export function maintenantUtc(): IsoUtc {
  return new Date().toISOString();
}
