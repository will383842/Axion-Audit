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

/**
 * MÉMOÏSATION DE LA VALIDITÉ D'UN FUSEAU — deux caches, et deux régimes distincts.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * `new Intl.DateTimeFormat` COÛTE, ET IL ÉTAIT CONSTRUIT UNE FOIS PAR LIGNE DE CSV.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mesuré par la revue de sécurité A51 (F-19) : un import de 5 000 unités dont la
 * colonne `timezone` est renseignée construisait 5 000 formateurs — **1,4 s de CPU
 * synchrone**, payées **sous le verrou de mission** de l'import, donc en sérialisant
 * toutes les écritures d'arbre de cette mission pendant ce temps. Le contrôle est
 * pourtant PUR : la validité d'un identifiant IANA ne change pas d'un appel à
 * l'autre, et un organigramme réel n'emploie qu'une poignée de fuseaux distincts.
 *
 * ── POURQUOI DEUX CACHES ET NON UN SEUL ────────────────────────────────────
 * Un cache unique non borné serait un vecteur d'épuisement mémoire : l'appelant
 * choisit les chaînes, et 5 000 chaînes INVALIDES distinctes rempliraient la table
 * aussi bien que des valides. Les deux régimes sont donc séparés :
 *
 *   · **les VALIDES sont mémorisées sans borne** — et ce n'est pas une négligence :
 *     l'ensemble des identifiants IANA est FINI et petit (moins de 600 zones, alias
 *     compris). Une entrée n'y entre que si `Intl` l'a acceptée, donc l'appelant ne
 *     peut pas faire grossir cette table au-delà de ce que la bibliothèque connaît ;
 *
 *   · **les INVALIDES sont mémorisées dans une table BORNÉE**, vidée d'un bloc
 *     quand elle est pleine. Elle sert le cas réel — une faute de frappe répétée sur
 *     toutes les lignes d'un fichier — sans offrir de prise : au pire, un attaquant
 *     provoque une purge, jamais une croissance.
 *
 * La purge est TOTALE et non « la plus ancienne » : une éviction fine (LRU) coûterait
 * une structure ordonnée et un suivi d'accès pour un gain nul à cette échelle. Vider
 * fait perdre un cache, pas une garantie — le contrôle reste exact dans tous les cas.
 */
const FUSEAUX_VALIDES = new Set<string>();

/** Table des fuseaux REFUSÉS. Bornée : voir le bloc ci-dessus. */
const FUSEAUX_INVALIDES = new Set<string>();

/**
 * Taille maximale de la table des fuseaux refusés. Généreuse au regard d'un usage
 * réel (un fichier contient une poignée de graphies fautives) et négligeable en
 * mémoire (des chaînes courtes), tout en restant très en deçà des 5 000 lignes
 * qu'un import peut porter.
 */
const FUSEAUX_INVALIDES_MAX = 256;

/**
 * Longueur maximale d'un identifiant IANA accepté À L'EXAMEN.
 *
 * Le plus long identifiant réel (`America/Argentina/ComodRivadavia`) fait 31
 * caractères. Cette borne écarte une chaîne démesurée AVANT de la donner à `Intl` et
 * AVANT de la mémoriser — un cache dont les clés sont choisies par l'appelant ne doit
 * pas pouvoir stocker des mégaoctets.
 */
const FUSEAU_LONGUEUR_MAX = 64;

/**
 * FORME D'UN IDENTIFIANT IANA — pré-filtre, pas validation.
 *
 * Un identifiant réel est fait de segments alphanumériques séparés par des barres
 * obliques (`Europe/Paris`, `America/Argentina/Buenos_Aires`, `Etc/GMT+5`), ou d'un
 * nom simple hérité (`UTC`, `CET`, `EST5EDT`, `W-SU`). Tout ce qui n'a pas cette
 * forme ne peut PAS être un fuseau, et n'a donc rien à faire dans un
 * `Intl.DateTimeFormat` — dont la construction coûte, mesurée, 0,3 ms par appel.
 *
 * ⚠ **CE MOTIF NE VALIDE RIEN** : `Europe/Atlantide` le franchit sans difficulté.
 * Il écarte le BRUIT (une phrase, une charge utile, un chemin de fichier) sans jamais
 * refuser un identifiant réel — c'est `Intl` qui tranche ensuite, et lui seul. Un
 * pré-filtre qui prétendrait décider serait le « contrôle inventé qui refuse du
 * vrai » que ce dépôt écarte partout ailleurs.
 *
 * **CE QU'IL NE FERME PAS, ET IL FAUT LE DIRE** : un appelant qui envoie 5 000
 * chaînes BIEN FORMÉES et toutes inconnues paie encore 5 000 constructions, soit
 * ~1,6 s — le coût est borné par `LIGNES_CSV_ARBRE_MAX`, jamais nul. Le fermer
 * demanderait d'énumérer les identifiants acceptables, ce qu'aucune API ne permet :
 * `Intl.supportedValuesOf('timeZone')` ne rend que les zones CANONIQUES et ignore les
 * alias (`Asia/Calcutta`, `US/Eastern`), qui sont légitimes. Remonté, pas masqué.
 */
const MOTIF_FUSEAU_IANA = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * La validité d'un identifiant IANA, calculée UNE FOIS par graphie.
 *
 * ⚠ LA CLÉ DU CACHE EST LA CHAÎNE TELLE QUELLE, sans normalisation de casse — parce
 * que `Intl` est lui-même insensible à la casse (`europe/paris` est accepté) et que
 * ce schéma ne normalise pas. Normaliser ici ferait mentir le cache sur ce qu'il a
 * réellement mesuré.
 */
function fuseauIanaValide(tz: string): boolean {
  if (tz.length === 0 || tz.length > FUSEAU_LONGUEUR_MAX) return false;
  // Le bruit est écarté sans toucher à `Intl` — voir `MOTIF_FUSEAU_IANA`.
  if (!MOTIF_FUSEAU_IANA.test(tz)) return false;
  if (FUSEAUX_VALIDES.has(tz)) return true;
  if (FUSEAUX_INVALIDES.has(tz)) return false;

  let valide: boolean;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    valide = true;
  } catch {
    valide = false;
  }

  if (valide) {
    FUSEAUX_VALIDES.add(tz);
  } else {
    if (FUSEAUX_INVALIDES.size >= FUSEAUX_INVALIDES_MAX) FUSEAUX_INVALIDES.clear();
    FUSEAUX_INVALIDES.add(tz);
  }
  return valide;
}

/**
 * Identifiant IANA de fuseau (ex. « Europe/Paris »), porté par la MISSION.
 * La validité est mémoïsée — voir `fuseauIanaValide` et le constat A51 F-19.
 */
export const fuseauIanaSchema = z
  .string()
  .min(1)
  .refine(fuseauIanaValide, { message: 'Fuseau horaire IANA inconnu' });

/** Instant courant, toujours en UTC. Seul point d'entrée autorisé pour « maintenant ». */
export function maintenantUtc(): IsoUtc {
  return new Date().toISOString();
}
