// =============================================================================
// FORMATAGE DES DATES — français, fuseau de MISSION à l'affichage (invariant 5).
//
// L'API parle ISO 8601 UTC (11 §3) ; la base est en TIMESTAMPTZ ; **c'est ici,
// et seulement ici, que l'heure prend un fuseau** — celui de la mission
// (`missions.timezone`, 03 §22.2), jamais celui du poste qui regarde l'écran.
// Un siège à Paris qui pilote un audit à Montréal doit lire « entretien terminé
// à 10 h 12 » à l'heure de Montréal : c'est l'heure à laquelle la chose a eu
// lieu pour les gens qui l'ont vécue.
//
// Deux natures de valeur, deux fonctions, aucun mélange :
//   · un INSTANT (`*_at`, ISO UTC) se formate AVEC un fuseau ;
//   · une DATE CIVILE (`AAAA-MM-JJ`, colonne `DATE`) n'a PAS d'heure, donc pas de
//     fuseau — la lui en donner un décalerait le jour d'un côté de la planète.
//
// `Intl` seul : `date-fns` est au 11 §1 mais rien ici ne le justifie encore.
//
// Traçabilité : E32 (fuseaux, devises, interface française).
// =============================================================================

const LOCALE = 'fr-FR';

/** Le fuseau est-il connu du moteur ? (`missions.timezone` n'est validé qu'en forme.) */
export function fuseauValide(fuseau: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

/**
 * Un instant ISO UTC, rendu dans le fuseau de la mission : « 2 sept. 2026, 10:12 ».
 * Fuseau inconnu → UTC, et la mention « UTC » est rendue pour que l'écart se voie.
 */
export function formaterInstant(iso: string, fuseau: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const timeZone = fuseauValide(fuseau) ? fuseau : 'UTC';
  const texte = new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
  return timeZone === fuseau ? texte : `${texte} (UTC)`;
}

/** Une date civile `AAAA-MM-JJ`, rendue sans fuseau : « 2 sept. 2026 ». */
export function formaterDateCivile(date: string): string {
  const parties = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parties) return '—';
  const [, annee, mois, jour] = parties;
  const utc = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' }).format(utc);
}

/** Un pourcentage entier : 84 → « 84 % » (espace insécable, typographie française). */
export function formaterPourcentage(numerateur: number, denominateur: number): string {
  if (denominateur <= 0) return '—';
  const INSECABLE = ' ';
  return `${String(Math.round((numerateur / denominateur) * 100))}${INSECABLE}%`;
}
