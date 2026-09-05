// =============================================================================
// LES HORODATAGES DE L'EXPORT — FONCTION PURE. Lot L7, incrément L7c.
//
// ── LA RÈGLE, ET SA RAISON ─────────────────────────────────────────────────
// Tout instant écrit dans le ZIP l'est en ISO 8601 AVEC LE DÉCALAGE DU FUSEAU DE
// MISSION : `2026-10-14T09:30:00+02:00`. Ce n'est pas une entorse à l'invariant 5
// (« UTC en base et en API, fuseau de mission à l'AFFICHAGE ») : l'export EST un
// affichage — c'est le fichier avec lequel le rapport §20.3 se rédige, et un
// rapport dit l'heure à laquelle la chose a eu lieu POUR CEUX QUI L'ONT VÉCUE.
// L'UTC nu ferait écrire « 7 h 30 » pour un entretien tenu à 9 h 30.
// Arbitrage tracé : `DECISIONS.md` 2026-09-05.
//
// ── POURQUOI PAS `date-fns`, QUI EST POURTANT AU 11 §1 ─────────────────────
// `date-fns` ne fait pas les fuseaux IANA sans `date-fns-tz`, qui n'est PAS dans
// la liste. `Intl` est dans le moteur, connaît la base IANA et suit les
// changements d'heure ; c'est déjà le choix fait par `apps/hq/src/format/dates.ts`.
//
// ── LES DATES CIVILES NE PASSENT PAS PAR ICI ───────────────────────────────
// `start_planned`, `nda_signed_at` et les autres colonnes `DATE` n'ont pas
// d'heure, donc pas de fuseau : leur en donner un décalerait le jour d'un côté de
// la planète. Elles s'écrivent telles quelles, en `AAAA-MM-JJ`.
//
// Traçabilité : E32 (audits monde entier : fuseaux) · E14 · E36.
// =============================================================================

/** La phrase que `mission.json` porte, pour que la règle se lise avant les données. */
export const FORMAT_HORODATAGE_EXPORT =
  'ISO 8601 avec le décalage du fuseau de mission (ex. 2026-10-14T09:30:00+02:00). Les dates civiles (AAAA-MM-JJ) n’ont pas d’heure, donc pas de fuseau.';

/** Le fuseau de repli quand `missions.timezone` porte une valeur qu'ICU ignore. */
const FUSEAU_DE_REPLI = 'UTC';

const FUSEAUX_CONNUS = new Map<string, boolean>();

/**
 * Le fuseau réellement utilisable — celui de la mission, ou UTC.
 *
 * `missions.timezone` n'est validé qu'en FORME au fichier 04. Un export qui
 * s'effondrerait sur un identifiant inconnu perdrait la mission entière ; un repli
 * ANNONCÉ dans `mission.json` la rend exploitable, avec l'écart visible.
 */
export function fuseauEffectif(fuseau: string): string {
  const memorise = FUSEAUX_CONNUS.get(fuseau);
  if (memorise !== undefined) return memorise ? fuseau : FUSEAU_DE_REPLI;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau });
    FUSEAUX_CONNUS.set(fuseau, true);
    return fuseau;
  } catch {
    FUSEAUX_CONNUS.set(fuseau, false);
    return FUSEAU_DE_REPLI;
  }
}

/**
 * Un formateur par fuseau, mémorisé.
 *
 * Motif identique à celui mesuré par la revue A51 sur `packages/shared/temps.ts`
 * (F-19) : construire un `Intl.DateTimeFormat` par LIGNE coûtait 1,4 s de CPU sur
 * 5 000 lignes. Un export FIL-GC porte ~8 000 réponses ; le formateur y serait
 * construit 8 000 fois pour un résultat identique.
 */
const FORMATEURS = new Map<string, Intl.DateTimeFormat>();

function formateur(fuseau: string): Intl.DateTimeFormat {
  const existant = FORMATEURS.get(fuseau);
  if (existant !== undefined) return existant;
  const cree = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  });
  FORMATEURS.set(fuseau, cree);
  return cree;
}

function partie(parties: readonly Intl.DateTimeFormatPart[], type: string): string {
  return parties.find((p) => p.type === type)?.value ?? '';
}

/**
 * `GMT+02:00` → `+02:00` · `GMT-4` → `-04:00` · `GMT` → `+00:00`.
 *
 * `longOffset` rend `GMT` tout court pour l'heure de Greenwich. La colonne doit
 * porter UNE seule graphie : un lecteur qui trie ne doit pas trouver deux formes
 * du même décalage.
 */
function decalage(nomDeFuseau: string): string {
  const brut = nomDeFuseau.replace(/^GMT/, '');
  if (brut === '') return '+00:00';
  const analyse = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(brut);
  if (analyse === null) return '+00:00';
  const [, signe = '+', heures = '0', minutes = '00'] = analyse;
  return `${signe}${heures.padStart(2, '0')}:${minutes}`;
}

/**
 * Un instant, écrit dans le fuseau de mission. `null` si la date est absente ou
 * invalide — une cellule vide, jamais la chaîne « Invalid Date ».
 */
export function horodatageExport(instant: Date | null | undefined, fuseau: string): string | null {
  if (instant === null || instant === undefined || Number.isNaN(instant.getTime())) return null;
  const zone = fuseauEffectif(fuseau);
  const parties = formateur(zone).formatToParts(instant);
  const date = `${partie(parties, 'year')}-${partie(parties, 'month')}-${partie(parties, 'day')}`;
  const heure = `${partie(parties, 'hour')}:${partie(parties, 'minute')}:${partie(parties, 'second')}`;
  return `${date}T${heure}${decalage(partie(parties, 'timeZoneName'))}`;
}

/**
 * `AAAAMMJJ` dans le fuseau de mission — la date du nom de fichier (§36.3).
 *
 * Le jour est celui de la MISSION, pas celui d'UTC : à 23 h 30 UTC, Tokyo est
 * déjà au lendemain, et c'est ce jour-là que le consultant a produit l'export.
 */
export function dateDuJourDansLeFuseau(instant: Date, fuseau: string): string {
  const iso = horodatageExport(instant, fuseau);
  if (iso === null) return '00000000';
  return iso.slice(0, 10).replace(/-/g, '');
}
