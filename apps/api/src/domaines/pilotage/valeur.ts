// =============================================================================
// APLATISSEMENT D'UNE VALEUR DE RÉPONSE — FONCTION PURE. Lot L7, incrément L7b.
//
// ── POURQUOI CÔTÉ SERVEUR (invariant 6 : le terrain collecte, le siège produit) ─
// L'écran d'agrégation lit ~8 000 réponses par mission FIL-GC. Les aplatir dans le
// navigateur à chaque rendu ferait le même travail à chaque frappe d'un filtre ;
// les aplatir ici les rend une fois, et le §36.3 (export L7c) relira exactement la
// même fonction — « choix = libellés, fourchette = 20 – 30, tableau = JSON » est
// une règle unique, elle ne peut pas vivre à deux endroits.
//
// ── CE QUE CE MODULE TRANSCRIT, ET RIEN DE PLUS ─────────────────────────────
// Le fichier 04, l. 149-150, mot pour mot : « value JSONB — {type, v} ; money :
// {type:'money', v, currency (déf. 'EUR')} ; fourchette : {type:'range', low,
// high} (+ currency si money) ». Les libellés de choix viennent de
// `mission_questions.options_snapshot`, dont le 04 §7.3 fixe la forme normée
// `[{code, label, score}]`.
//
// ── UNE VALEUR MALFORMÉE NE FAIT PAS TOMBER UN ÉCRAN DE PILOTAGE ────────────
// Toute forme que le 04 ne décrit pas est rendue en JSON plutôt que perdue ou
// levée en exception : la donnée d'audit reste VISIBLE, fût-elle laide. Une
// console qui refuserait d'afficher une mission entière à cause d'une réponse
// bizarre serait un défaut bien plus coûteux que la laideur.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E13 (écran 3 zones,
// enregistrement continu — les types de réponse qu'il produit).
// =============================================================================

/** Une option de choix, forme normée du 04 §7.3. */
interface OptionSnapshot {
  readonly code: string;
  readonly label: string;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Les options exploitables d'une question, ou une liste vide. */
function optionsLisibles(brut: unknown): readonly OptionSnapshot[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter(
    (option): option is OptionSnapshot =>
      estObjet(option) && typeof option.code === 'string' && typeof option.label === 'string',
  );
}

/** Le libellé d'un code de choix — ou le code lui-même, jamais rien. */
function libelleDuCode(code: unknown, options: readonly OptionSnapshot[]): string {
  const texte = typeof code === 'string' ? code : JSON.stringify(code);
  return options.find((option) => option.code === code)?.label ?? texte;
}

/** Un scalaire rendu en texte. Les objets et tableaux passent par JSON. */
function scalaire(valeur: unknown): string {
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  return JSON.stringify(valeur);
}

/**
 * Rend une valeur de réponse LISIBLE PAR UN HUMAIN, en français.
 *
 * `null` quand il n'y a rien à lire — ce qui est le cas NORMAL d'un « non
 * communiqué » et d'un « sans objet » : ces deux états se lisent à leurs
 * drapeaux (§27.4), jamais à une chaîne vide qu'on confondrait avec un oubli.
 */
export function aplatirValeur(brut: unknown, optionsSnapshot: unknown): string | null {
  if (brut === null || brut === undefined) return null;
  const options = optionsLisibles(optionsSnapshot);

  if (!estObjet(brut)) return scalaire(brut);

  const type = typeof brut.type === 'string' ? brut.type : null;

  // La FOURCHETTE (§27.4) — deux bornes, et la devise si c'en est une.
  if (type === 'range') {
    const { low, high, currency } = brut;
    if (low === undefined && high === undefined) return null;
    const devise = typeof currency === 'string' ? ` ${currency}` : '';
    return `${scalaire(low)} – ${scalaire(high)}${devise}`;
  }

  const v = brut.v;
  // Un objet qui ne suit NI `{type, v}` NI `{type:'range', …}` n'est pas une
  // valeur vide : c'est une valeur d'une forme que le 04 ne décrit pas. On la
  // rend entière plutôt que de la faire disparaître — une donnée d'audit perdue
  // silencieusement coûte plus cher qu'une cellule laide.
  if (type === null && v === undefined) return JSON.stringify(brut);
  if (v === undefined || v === null) return null;

  switch (type) {
    case 'yes_no':
      // Le français, jamais le code : c'est ce que l'auditeur relit.
      return v === 'oui' ? 'Oui' : v === 'non' ? 'Non' : scalaire(v);
    case 'scale_1_5':
      // La borne haute voyage avec la note : « 3 » seul ne dit pas sur combien.
      return `${scalaire(v)} / 5`;
    case 'single_choice':
      return libelleDuCode(v, options);
    case 'multi_choice':
      return Array.isArray(v)
        ? // L'ordre des OPTIONS, pas celui de la saisie : deux réponses identiques
          // doivent se lire identiquement, sinon on croit voir une divergence.
          options
            .filter((option) => v.includes(option.code))
            .map((option) => option.label)
            .concat(v.filter((code) => !options.some((o) => o.code === code)).map(scalaire))
            .join(', ')
        : libelleDuCode(v, options);
    case 'money': {
      const devise = typeof brut.currency === 'string' ? ` ${brut.currency}` : '';
      return `${scalaire(v)}${devise}`;
    }
    case 'percent':
      // Espace insécable avant le signe : la typographie française l'exige.
      return `${scalaire(v)} %`;
    case 'table':
      return JSON.stringify(v);
    case null:
      // `{v: 3}` sans `type` : le 04 ne le décrit pas, mais la valeur est là.
      return scalaire(v);
    default:
      // `number`, `duration`, `date`, `free_text` et tout type à venir : la
      // valeur brute est déjà lisible, et lui inventer une unité serait mentir.
      return scalaire(v);
  }
}
