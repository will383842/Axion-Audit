// =============================================================================
// TESTS DES FONCTIONS PURES ET DU CONTRAT D'API DES ENTREPRISES — lot L3, L3a.
//
// Écrits par A18, qui n'a écrit aucune des lignes testées (09 §5.6). `companies.ts`
// a été livré SANS test : normalisation SIREN, clé de Luhn, code NAF, normalisation
// de nom et les onze schémas Zod du contrat n'étaient prouvés par rien. Ce sont des
// fonctions PURES — ni base, ni réseau, ni conteneur — donc les seules du lot dont
// le verdict soit exécutable aujourd'hui. C'est pourquoi elles passent devant.
//
// ── LES QUATRE CHOSES QUE CE FICHIER EXISTE POUR EMPÊCHER ────────────────────
//  1. **UNE CLÉ DE LUHN DÉCORATIVE.** Une implémentation qui ne vérifierait que la
//     LONGUEUR passerait toute suite qui n'essaie que « 8 chiffres » et
//     « 10 chiffres ». Le test qui compte est celui du SIREN à NEUF chiffres dont
//     la clé est fausse — §B4/§B5 l'énumèrent au lieu de l'illustrer.
//  2. **UNE CORRESPONDANCE NAF QUI NE TROUVE JAMAIS RIEN.** `naf_sector_map` est
//     seedée par DIVISION à deux chiffres (`'01'`…`'99'`) alors que
//     `companies.naf_code` porte un code APE complet (`'62.01Z'`) : une jointure
//     naïve serait sortie VERTE en ne consultant jamais la table, et chaque
//     création aurait poliment rendu « secteur à qualifier ». §C fixe
//     `divisionNaf` comme la clé réelle.
//  3. **UNE ALERTE ANTI-DOUBLON MUETTE SUR SON CAS D'USAGE.** `docs/ETAT.md` le
//     rapporte, mesuré par l'auteur avant livraison : la normalisation ramenait
//     d'abord la ponctuation à l'espace, si bien que « Untel SAS » donnait `untel`
//     et « UNTEL S.A.S. » `untel s a s`. Les deux graphies les plus courantes de la
//     MÊME entreprise ne se reconnaissaient pas. §D1 grave la correction.
//  4. **UN `PATCH` QUI CONFOND « NE TOUCHE PAS » ET « EFFACE ».** §E3.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, ET QUI RESTE DÛ ────────────────────────
// Rien de ce qui exige PostgreSQL : le `409 COMPANY_DUPLICATE` sur `uq_companies_
// siren`, les créations multiples à `siren = NULL`, la résolution réelle du secteur,
// la pagination `(name, id)`. Ces quatre points vivent dans
// `apps/api/tests/l3a-companies.integration.test.ts` et Docker est indisponible.
// Écrit ici pour qu'aucun lecteur ne prenne le vert de ce fichier pour le vert du
// lot.
//
// ── INVARIANT 2 ─────────────────────────────────────────────────────────────
// Aucune raison sociale réelle nulle part. Les libellés sont neutres (« Alpha »,
// « Untel », « Générique ») et **les SIREN sont CALCULÉS**, pas recopiés : §B1 les
// revérifie par une seconde lecture INDÉPENDANTE de l'algorithme de Luhn.
// Traçabilité : E19, E18, E3, E43 · critères 1 et 2 du lot L3 (fichier 07).
// =============================================================================
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
// La locale française de Zod est GLOBALE au processus et posée par `errors.ts`,
// que tout consommateur de `@axion/shared` charge via `index.ts`. Importer
// `companies.js` SEUL — ce que fait ce fichier de test, et lui seul — ne la
// déclencherait pas : les messages génériques repartiraient en anglais et §E7
// mesurerait la mauvaise chose. On l'appelle donc NOMMÉMENT, comme le fait le
// gestionnaire d'erreurs de l'API, plutôt que de compter sur un effet de bord
// d'import qui reste vrai jusqu'au jour où quelqu'un réorganise les imports.
import { appliquerLocaleFrancaiseZod } from './errors.js';
import {
  EFFECTIF_MAX,
  LONGUEUR_DIVISION_NAF,
  NOM_ENTREPRISE_LONGUEUR_MAX,
  NOTES_ENTREPRISE_LONGUEUR_MAX,
  PAYS_MAX,
  REF_EXTERNE_LONGUEUR_MAX,
  cleSirenValide,
  companyParamsSchema,
  companyResponseSchema,
  companyWriteResponseSchema,
  createCompanyRequestSchema,
  divisionNaf,
  homonymeCompanySchema,
  nafCodeSchema,
  normaliserCodeNaf,
  normaliserNomEntreprise,
  normaliserSiren,
  sirenSchema,
  updateCompanyRequestSchema,
} from './companies.js';

appliquerLocaleFrancaiseZod();

// =============================================================================
// FIXTURES — des SIREN CALCULÉS, jamais recopiés (invariant 2)
// =============================================================================

/**
 * SIREN de référence. Les huit premiers chiffres sont une suite arbitraire
 * (`12345678`) ; le neuvième est la clé de Luhn CALCULÉE pour cette suite. Aucune
 * entreprise réelle n'est désignée, et §B1 revérifie la clé par une seconde
 * implémentation de l'algorithme.
 */
const SIREN_VALIDE = '123456782';

/** Un second SIREN valide, calculé de la même façon — §D et §E en ont besoin. */
const SIREN_VALIDE_BIS = '402001002';

/**
 * PAIRE DU TROU DE LUHN. Ces deux SIREN sont VALIDES tous les deux et ne diffèrent
 * que par la transposition de leurs deux derniers chiffres (`…09` ↔ `…90`). Voir
 * §B6 : c'est la seule transposition adjacente que Luhn ne voit pas, et il vaut
 * mieux l'avoir mesurée que l'avoir supposée impossible.
 */
const SIREN_TRANSPOSITION_A = '400000709';
const SIREN_TRANSPOSITION_B = '400000790';

/**
 * L'espace INSÉCABLE, écrit par son point de code et non collé dans la source.
 * C'est le séparateur que les traitements de texte et les copier-coller depuis un
 * extrait Kbis insèrent SEULS, et il n'est pas `' '` : le retirer est le motif même
 * pour lequel la classe de séparateurs du code repose sur `\s` et non sur un espace
 * littéral. Un caractère invisible dans un fichier de test est une fixture qu'on ne
 * peut pas relire — et qu'un formateur ou un éditeur remplace un jour sans rien dire.
 */
const ESPACE_INSECABLE = String.fromCharCode(0xa0);

/** Un UUID v7 quelconque — les schémas n'exigent qu'une forme d'UUID. */
const UUID_QUELCONQUE = '0198f0c0-0000-7000-8000-000000000000';
const UUID_SECTEUR = '0198f0c0-0000-7000-8000-000000000001';

/** Une fiche de sortie complète et valide, base des variations de §E5. */
const FICHE_VALIDE = {
  id: UUID_QUELCONQUE,
  externalRef: null,
  name: 'Alpha',
  siren: null,
  nafCode: null,
  sectorId: null,
  headcount: null,
  sitesCount: null,
  countries: [],
  notes: null,
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
} as const;

/**
 * LA LISTE DES FORMES JURIDIQUES, RECOPIÉE À LA MAIN depuis `companies.ts`.
 *
 * Elle n'est PAS importée, et ce n'est pas un oubli : la constante est privée au
 * module, et l'importer transformerait §D3 en « la liste est égale à elle-même ».
 * Cette transcription est une seconde lecture indépendante ; sa confrontation à
 * l'implémentation EST le test. Ajouter une forme au code sans l'ajouter ici rend
 * §D3 rouge — c'est le comportement voulu : élargir cette liste fait fusionner des
 * entreprises réellement distinctes, et cela se décide, cela ne se glisse pas.
 */
const FORMES_JURIDIQUES_ATTENDUES = [
  'sas',
  'sasu',
  'sa',
  'sarl',
  'eurl',
  'sci',
  'scic',
  'scop',
  'snc',
  'sca',
  'scs',
  'sem',
  'gie',
  'ei',
  'eirl',
  'asso',
  'association',
  'societe',
  'ste',
  'groupe',
  'holding',
  'gmbh',
  'ltd',
  'plc',
  'bv',
  'nv',
  'spa',
  'srl',
  'ag',
  'inc',
  'corp',
  'llc',
] as const;

// =============================================================================
// OUTILS DE TEST
// =============================================================================

/**
 * LA SOMME DE LUHN, RELUE DE DROITE À GAUCHE — seconde implémentation, délibérée.
 *
 * `cleSirenValide` parcourt la chaîne de GAUCHE à DROITE et compense par une parité
 * d'indice (`position % 2 === 1`) ; son propre commentaire dit qu'« une inversion
 * d'indice est exactement l'erreur que ce contrôle existe pour attraper ailleurs ».
 * Recopier ce parcours ici aurait recopié l'éventuelle inversion avec lui. On écrit
 * donc l'autre sens — celui de la définition — et §B1 confronte les deux lectures.
 */
function sommeDeLuhn(neufChiffres: string): number {
  let somme = 0;
  let rangDepuisLaDroite = 1;
  for (let index = neufChiffres.length - 1; index >= 0; index -= 1) {
    const caractere = neufChiffres[index];
    if (caractere === undefined) throw new Error('Fixture illisible : index hors chaîne.');
    const chiffre = Number.parseInt(caractere, 10);
    const pondere = rangDepuisLaDroite % 2 === 0 ? chiffre * 2 : chiffre;
    somme += pondere > 9 ? pondere - 9 : pondere;
    rangDepuisLaDroite += 1;
  }
  return somme;
}

/** Toutes les variantes d'un SIREN où UN SEUL chiffre a été remplacé. */
function substitutionsSimples(siren: string): string[] {
  const variantes: string[] = [];
  for (let index = 0; index < siren.length; index += 1) {
    for (let chiffre = 0; chiffre <= 9; chiffre += 1) {
      const remplacant = String(chiffre);
      if (siren[index] === remplacant) continue;
      variantes.push(`${siren.slice(0, index)}${remplacant}${siren.slice(index + 1)}`);
    }
  }
  return variantes;
}

/** Toutes les variantes d'un SIREN où deux chiffres ADJACENTS DISTINCTS sont échangés. */
function transpositionsAdjacentes(siren: string): string[] {
  const variantes: string[] = [];
  for (let index = 0; index + 1 < siren.length; index += 1) {
    const gauche = siren[index];
    const droite = siren[index + 1];
    if (gauche === undefined || droite === undefined || gauche === droite) continue;
    variantes.push(`${siren.slice(0, index)}${droite}${gauche}${siren.slice(index + 2)}`);
  }
  return variantes;
}

/**
 * Analyse qui DOIT réussir. Lève avec les messages de refus plutôt que de rendre
 * `undefined` : un test qui échoue doit dire POURQUOI sans qu'on relance rien.
 */
function donneesValidees<Schema extends z.ZodType>(
  schema: Schema,
  entree: unknown,
): z.output<Schema> {
  const analyse = schema.safeParse(entree);
  if (!analyse.success) {
    const motifs = analyse.error.issues.map((probleme) => probleme.message).join(' | ');
    throw new Error(`Analyse attendue en succès, mais refusée : ${motifs}`);
  }
  return analyse.data;
}

/**
 * Les codes et messages d'une analyse qui DOIT échouer.
 *
 * Le schéma est pris en `z.ZodType` NU et non en paramètre générique : le refus ne
 * rend jamais de donnée, donc rien ici ne dépend du type de sortie. Un générique
 * n'apparaissant qu'une fois dans la signature ne contraint rien — il donne
 * seulement l'illusion d'un lien entre l'entrée et le résultat.
 */
function refusDe(
  schema: z.ZodType,
  entree: unknown,
): { readonly codes: readonly string[]; readonly messages: readonly string[] } {
  const analyse = schema.safeParse(entree);
  if (analyse.success) {
    throw new Error('Analyse attendue en échec, mais la valeur a été acceptée.');
  }
  return {
    codes: analyse.error.issues.map((probleme) => probleme.code),
    messages: analyse.error.issues.map((probleme) => probleme.message),
  };
}

// =============================================================================
// §A — `normaliserSiren` : ce qu'elle retire, et ce qu'elle refuse de retirer
// =============================================================================

describe('§A — normalisation du SIREN', () => {
  it("laisserait deux graphies du même SIREN coexister en base si les espaces et les points n'étaient pas retirés", () => {
    // Les trois graphies qu'un extrait Kbis, un tableur ou un copier-coller
    // produisent réellement. L'espace INSÉCABLE est inclus : les traitements de
    // texte l'insèrent seuls, et il n'est pas ' '.
    expect(normaliserSiren('123 456 782')).toBe(SIREN_VALIDE);
    expect(normaliserSiren('123.456.782')).toBe(SIREN_VALIDE);
    expect(normaliserSiren('123' + ESPACE_INSECABLE + '456' + ESPACE_INSECABLE + '782')).toBe(
      SIREN_VALIDE,
    );
    expect(normaliserSiren(' 123456782 ')).toBe(SIREN_VALIDE);
    expect(normaliserSiren(SIREN_VALIDE)).toBe(SIREN_VALIDE);
  });

  it('normaliserait silencieusement une saisie qui n’est PAS un SIREN si le tiret était retiré', () => {
    // Décision explicite du code (commentaire de `SEPARATEURS_SIREN`) : un SIREN
    // français ne s'écrit jamais avec des tirets ; une chaîne tirettée est plus
    // probablement un numéro de TVA tronqué ou une référence interne. Elle traverse
    // donc la normalisation INTACTE, et c'est le schéma qui la refuse ensuite.
    expect(normaliserSiren('123-456-782')).toBe('123-456-782');
    expect(cleSirenValide(normaliserSiren('123-456-782'))).toBe(false);
  });

  it('confondrait la faute de l’utilisateur avec une valeur transformée par nos soins si la normalisation validait', () => {
    // La normalisation ne juge rien : elle rend ce qui reste, fût-ce du texte.
    expect(normaliserSiren('pas un siren')).toBe('pasunsiren');
    expect(normaliserSiren('')).toBe('');
  });
});

// =============================================================================
// §B — `cleSirenValide` : LA clé de Luhn, et la mesure de son trou
// =============================================================================

describe('§B — clé de contrôle du SIREN', () => {
  it('reposerait sur des fixtures non vérifiées si la clé de Luhn n’était pas recalculée par une seconde lecture', () => {
    // §B1 — la garantie que les fixtures de tout ce fichier sont RÉELLEMENT
    // valides, établie de droite à gauche (voir `sommeDeLuhn`), donc sans réutiliser
    // la parité d'indice de l'implémentation.
    for (const siren of [
      SIREN_VALIDE,
      SIREN_VALIDE_BIS,
      SIREN_TRANSPOSITION_A,
      SIREN_TRANSPOSITION_B,
    ]) {
      expect(sommeDeLuhn(siren) % 10, `somme de Luhn de ${siren}`).toBe(0);
      expect(cleSirenValide(siren), `clé de ${siren}`).toBe(true);
    }
  });

  it('accepterait un identifiant tronqué ou surnuméraire si la longueur n’était pas exigée à neuf chiffres', () => {
    expect(cleSirenValide('12345678')).toBe(false); // huit
    expect(cleSirenValide('1234567820')).toBe(false); // dix
    expect(cleSirenValide('')).toBe(false);
    expect(cleSirenValide('12345678A')).toBe(false); // neuf caractères, pas neuf chiffres
    expect(cleSirenValide('123 456 782')).toBe(false); // NON normalisé : la fonction ne normalise pas
  });

  it('rendrait la clé de Luhn purement décorative si un numéro à neuf chiffres mal clé passait', () => {
    // §B3 — LE test qui compte. Sans lui, une implémentation qui ne vérifierait que
    // `/^\d{9}$/` serait verte sur toute la suite ci-dessus.
    expect(cleSirenValide('123456783')).toBe(false);
    expect(cleSirenValide('123456780')).toBe(false);
    expect(cleSirenValide('999999999')).toBe(false);
  });

  it('laisserait passer une faute de frappe si une substitution d’UN SEUL chiffre restait valide', () => {
    // §B4 — énumération exhaustive : 9 positions × 9 chiffres de remplacement, sur
    // quatre SIREN valides. Luhn détecte TOUTE substitution simple ; le vérifier par
    // énumération plutôt que par un exemple évite un test vert par chance.
    for (const base of [SIREN_VALIDE, SIREN_VALIDE_BIS, SIREN_TRANSPOSITION_A]) {
      for (const variante of substitutionsSimples(base)) {
        expect(cleSirenValide(variante), `substitution ${variante} (base ${base})`).toBe(false);
      }
    }
  });

  it('laisserait passer une inversion de frappe si une transposition adjacente restait valide', () => {
    // §B5 — CE QUE CE TEST ÉTABLIT : sur `SIREN_VALIDE`, les huit transpositions de
    // deux chiffres adjacents DISTINCTS sont toutes rejetées.
    // CE QU'IL N'ÉTABLIT PAS : que Luhn détecte TOUTE transposition adjacente. Il ne
    // le fait pas — voir §B6, qui mesure l'exception au lieu de la taire.
    const variantes = transpositionsAdjacentes(SIREN_VALIDE);
    expect(variantes).toHaveLength(8);
    for (const variante of variantes) {
      expect(cleSirenValide(variante), `transposition ${variante}`).toBe(false);
    }
  });

  it('promettrait plus qu’il ne mesure si le trou connu de Luhn sur la paire 0/9 n’était pas écrit noir sur blanc', () => {
    // §B6 — LE SEUL TROU DE L'ALGORITHME, MESURÉ. Transposer deux chiffres adjacents
    // `a` et `b` change la somme de Luhn de |a − b| ± 9 ; l'écart est nul, donc la
    // faute est INVISIBLE, exactement quand {a, b} = {0, 9}. Ces deux SIREN sont donc
    // valides tous les deux alors que l'un est la faute de frappe de l'autre.
    //
    // Ce n'est PAS un défaut de l'implémentation : c'est une propriété de Luhn, que
    // l'INSEE assume comme tout le monde. Le test existe pour qu'on ne prête jamais à
    // ce contrôle une exhaustivité qu'il n'a pas — et parce que R3 fait reposer la
    // déduplication sur le SIREN : deux fiches distinctes de cette paire ne
    // déclencheraient AUCUNE alerte (SIREN différents, index unique satisfait), et
    // seule la moitié « nom en second » pourrait les rapprocher.
    expect(SIREN_TRANSPOSITION_A.slice(0, 7)).toBe(SIREN_TRANSPOSITION_B.slice(0, 7));
    expect(cleSirenValide(SIREN_TRANSPOSITION_A)).toBe(true);
    expect(cleSirenValide(SIREN_TRANSPOSITION_B)).toBe(true);
  });

  it('ouvrirait un trou permanent dans le contrôle d’intégrité si une exception « au cas où » était câblée pour les neuf zéros', () => {
    // §B7 — DÉCISION DE TEST, écrite parce que ni le code ni le pack ne la tranchent.
    // `'000000000'` a une somme de Luhn nulle, donc multiple de 10 : il PASSE.
    //
    // Le test EXIGE ce comportement plutôt que de le corriger, pour trois raisons :
    //   · le code dit expressément « Aucune exception n'est donc câblée ici — en
    //     câbler une "au cas où" aurait ouvert un trou permanent » ; un cas
    //     particulier appelle le suivant, et une liste d'exceptions dans un contrôle
    //     d'intégrité est une porte qu'on n'referme jamais ;
    //   · le code dit AUSSI ce que ce contrôle ne fait pas : « il ne prouve pas que
    //     l'entreprise EXISTE, il prouve que le nombre est bien formé. Un SIREN
    //     valide mais fantaisiste passe donc — c'est assumé. » Neuf zéros sont
    //     exactement ce cas, et le traiter à part ferait croire au lecteur que les
    //     autres SIREN fantaisistes sont, eux, filtrés ;
    //   · aucune exigence du pack (03 §29, R3) ne demande un contrôle d'existence.
    // Interdire cette valeur relève d'une fiche AMELIORATIONS d'étage 2 (elle change
    // le périmètre fonctionnel), pas d'un test qui l'imposerait unilatéralement.
    expect(sommeDeLuhn('000000000') % 10).toBe(0);
    expect(cleSirenValide('000000000')).toBe(true);
    expect(donneesValidees(sirenSchema, '000 000 000')).toBe('000000000');
  });
});

// =============================================================================
// §C — code NAF/APE : la DIVISION est la clé réelle de `naf_sector_map`
// =============================================================================

describe('§C — code NAF/APE et division', () => {
  it('empêcherait R4 de trouver un seul secteur si la division ne se lisait pas de la même façon sur les trois graphies d’un code APE', () => {
    // §C1 — LE PIÈGE CENTRAL DU LOT. `naf_sector_map` est seedée par DIVISION à deux
    // chiffres ; `companies.naf_code` porte un code APE complet. Les trois graphies
    // ci-dessous arrivent réellement d'un Kbis, d'un tableur ou d'une saisie : si
    // elles ne rendaient pas la MÊME division, la correspondance échouerait pour
    // certaines saisies seulement — le pire des deux mondes, parce qu'elle
    // marcherait « la plupart du temps ».
    expect(divisionNaf('62.01Z')).toBe('62');
    expect(divisionNaf('6201Z')).toBe('62');
    expect(divisionNaf('62.01 Z')).toBe('62');
    expect(divisionNaf(normaliserCodeNaf('62 01 z'))).toBe('62');
    expect(LONGUEUR_DIVISION_NAF).toBe(2);
    expect(divisionNaf('62.01Z')).toHaveLength(LONGUEUR_DIVISION_NAF);
  });

  it('rendrait deux graphies du même code APE distinctes en base si la casse n’était pas normalisée', () => {
    // §C2 — MESURÉ : la normalisation passe en MAJUSCULES. `'62.01z'` et `'62.01Z'`
    // rendent donc la même forme canonique, et le schéma accepte les deux.
    expect(normaliserCodeNaf('62.01z')).toBe('62.01Z');
    expect(normaliserCodeNaf('6201z')).toBe('62.01Z');
    expect(normaliserCodeNaf('62 01 z')).toBe('62.01Z');
    expect(donneesValidees(nafCodeSchema, '62.01z')).toBe('62.01Z');
    // Et la forme COMPACTE ressort CANONIQUE : c'est ce qui est stocké.
    expect(donneesValidees(nafCodeSchema, '6201Z')).toBe('62.01Z');
  });

  it('rendrait indécidable, à la lecture d’un message d’erreur, si la valeur fautive est celle de l’utilisateur ou la nôtre, si la normalisation validait', () => {
    // §C3 — La normalisation NE VALIDE PAS : elle rend la forme compacte majuscule
    // telle quelle quand le motif n'est pas reconnu. C'est le schéma qui refuse.
    expect(normaliserCodeNaf('62.1Z')).toBe('621Z');
    expect(normaliserCodeNaf('abc')).toBe('ABC');
    expect(normaliserCodeNaf('')).toBe('');
    // `divisionNaf` ne valide pas davantage — elle DÉCOUPE. Sa documentation exige un
    // code déjà canonique ; appelée sur autre chose elle rend deux caractères
    // absurdes, sans lever. Fixé ici pour qu'un appelant futur sache que l'ordre
    // « normaliser, valider, PUIS découper » n'est pas facultatif.
    expect(divisionNaf('Z6201')).toBe('Z6');
    expect(divisionNaf('')).toBe('');
  });

  it('accepterait n’importe quelle chaîne comme code APE si le motif canonique n’éprouvait qu’une seule forme de malformation', () => {
    // §C4 — Plusieurs malformations, pas une. Un test qui n'essaie que `'abc'` ne
    // prouve rien : il resterait vert avec un motif qui n'exigerait que « pas de
    // lettres au début ».
    const malformes = [
      '62.1Z', // division à deux chiffres, mais classe à UN chiffre
      '6.01Z', // division à UN chiffre
      '6201', // la lettre finale manque
      '62011', // cinq chiffres : ressemble à un code, n'en est pas un
      'Z6201', // la lettre au mauvais bout
      '62.0AZ', // une lettre à la place d'un chiffre
      '62.01ZZ', // deux lettres finales
      '', // vide
      'abc',
    ];
    for (const malforme of malformes) {
      const refus = refusDe(nafCodeSchema, malforme);
      expect(refus.codes, `code APE malformé ${JSON.stringify(malforme)}`).toContain(
        'invalid_format',
      );
      expect(refus.messages[0]).toBe(
        'Le code APE/NAF doit comporter quatre chiffres et une lettre (par exemple 62.01Z).',
      );
    }
  });

  it('ferait croire à un contrôle de POSITION des séparateurs, alors que la normalisation les retire tous, si ce cas n’était pas fixé', () => {
    // §C5 — CONSTAT, NON UN DÉFAUT — mais il doit être écrit. `'620.1Z'` porte son
    // point à la MAUVAISE place ; la normalisation retire tous les séparateurs avant
    // d'éprouver le motif, donc cette saisie est ACCEPTÉE et rendue `'62.01Z'`.
    // C'est la contrepartie assumée d'une normalisation tolérante (« accepte 6201Z,
    // 62.01 z, 62 01 Z »), et le résultat reste le bon code. Fixé ici pour qu'un
    // lecteur ne déduise pas de §C4 une exigence de placement qui n'existe pas.
    expect(donneesValidees(nafCodeSchema, '620.1Z')).toBe('62.01Z');
    expect(donneesValidees(nafCodeSchema, '6 2 0 1 Z')).toBe('62.01Z');
  });
});

// =============================================================================
// §D — `normaliserNomEntreprise` : la déduplication « en second »
// =============================================================================

describe('§D — normalisation du nom d’entreprise', () => {
  it('rendrait l’alerte anti-doublon muette sur le cas même qui la justifie si « Untel SAS » et « UNTEL S.A.S. » ne se reconnaissaient pas', () => {
    // §D1 — LE TEST QUI GRAVE LA CORRECTION rapportée dans `docs/ETAT.md`. Avant
    // elle, la ponctuation devenait un espace AVANT tout le reste : « Untel SAS »
    // rendait `untel`, « UNTEL S.A.S. » rendait `untel s a s`, et les deux graphies
    // les plus courantes de la même entreprise ne se croisaient jamais. Le point est
    // désormais SUPPRIMÉ d'abord, ce qui ramène `S.A.S.` à `sas`, que la liste des
    // formes juridiques écarte ensuite.
    expect(normaliserNomEntreprise('Untel SAS')).toBe('untel');
    expect(normaliserNomEntreprise('UNTEL S.A.S.')).toBe('untel');
    expect(normaliserNomEntreprise('Untel SAS')).toBe(normaliserNomEntreprise('UNTEL S.A.S.'));
    // Le point final facultatif ne change rien non plus.
    expect(normaliserNomEntreprise('untel s.a.s')).toBe('untel');

    // ── LA TROISIÈME GRAPHIE, ET ELLE N'EST PAS RATTRAPÉE. MESURÉ. ──────────
    // « UNTEL S A S » — initiales séparées par des ESPACES et SANS points — reste
    // `untel s a s`. Rien ne recolle trois jetons d'une lettre, et rien ne le
    // devrait : le faire supposerait de deviner qu'une suite d'initiales EST un
    // sigle, ce qui rapprocherait aussi des entreprises réellement distinctes.
    // Écrit ici plutôt que tu, parce que la correction rapportée par `ETAT.md`
    // pourrait laisser croire que TOUTES les graphies de « S.A.S. » se rejoignent
    // désormais. Deux se rejoignent, la troisième non — et un doublon de cette
    // forme-là passera sans alerte, à moins que le SIREN ne le rattrape.
    expect(normaliserNomEntreprise('UNTEL S A S')).toBe('untel s a s');
    expect(normaliserNomEntreprise('UNTEL S A S')).not.toBe(normaliserNomEntreprise('Untel SAS'));
  });

  it('laisserait deux fiches accentuées différemment se croiser sans alerte si les diacritiques n’étaient pas retirés', () => {
    // §D2 — Une saisie sans accents (clavier étranger, import CSV mal encodé) doit
    // rejoindre la saisie accentuée. NFD + suppression des marques combinantes.
    expect(normaliserNomEntreprise('Société Générique')).toBe('generique');
    expect(normaliserNomEntreprise('Societe Generique')).toBe('generique');
    expect(normaliserNomEntreprise('Alpha Réseaux')).toBe(normaliserNomEntreprise('ALPHA RESEAUX'));
    expect(normaliserNomEntreprise('Ålpha')).toBe('alpha');
  });

  it('cesserait de reconnaître une forme juridique retirée du jour où quelqu’un modifierait la liste sans le décider', () => {
    // §D3 — La liste est recopiée en tête de ce fichier (voir le commentaire de
    // `FORMES_JURIDIQUES_ATTENDUES` : transcription indépendante, jamais un import).
    // Chaque forme, écrite en MAJUSCULES comme sur un Kbis, doit disparaître.
    for (const forme of FORMES_JURIDIQUES_ATTENDUES) {
      expect(normaliserNomEntreprise(`Alpha ${forme.toUpperCase()}`), `forme ${forme}`).toBe(
        'alpha',
      );
    }
  });

  it('massacrerait des mots au lieu de retirer des formes juridiques si le filtre ne portait pas sur une liste fermée', () => {
    // §D4 — La contre-épreuve de §D3, et elle vaut autant : des sigles qui RESSEMBLENT
    // à des formes juridiques mais n'y sont pas doivent être CONSERVÉS. Sans ce test,
    // un filtre bien plus large (toute abréviation de deux ou trois lettres) resterait
    // vert — et ferait fusionner des entreprises réellement distinctes.
    expect(normaliserNomEntreprise('Alpha SCM')).toBe('alpha scm');
    expect(normaliserNomEntreprise('Alpha SEL')).toBe('alpha sel');
    expect(normaliserNomEntreprise('Alpha KG')).toBe('alpha kg');
    expect(normaliserNomEntreprise('Alpha SASP')).toBe('alpha sasp');
    // Les mots ordinaires ne sont jamais touchés, ni les chiffres.
    expect(normaliserNomEntreprise('Alpha 2000')).toBe('alpha 2000');
    expect(normaliserNomEntreprise('Atelier Générique 3')).toBe('atelier generique 3');
  });

  it('déclarerait homonymes entre elles toutes les fiches nommées d’après leur seule forme juridique si celles-ci ne rendaient pas la chaîne vide', () => {
    // §D5 — LE CAS LIMITE QUI COMMANDE UN COMPORTEMENT DE SERVICE.
    // `apps/api/src/domaines/companies/service.ts`, `chercherHomonymes` :
    //   « if (recherche === '') return []; »
    // Une fiche nommée « SAS » se normalise en chaîne vide ; sans ce court-circuit,
    // toutes les fiches de ce genre se signaleraient mutuellement, et l'avertissement
    // R3 se mettrait à crier sur du bruit — un avertissement qui crie tout le temps
    // n'est plus lu. Ce test est le contrat DONT DÉPEND ce court-circuit.
    expect(normaliserNomEntreprise('SAS')).toBe('');
    expect(normaliserNomEntreprise('S.A.S.')).toBe('');
    expect(normaliserNomEntreprise('Groupe Holding')).toBe('');
    expect(normaliserNomEntreprise('')).toBe('');
    expect(normaliserNomEntreprise('   ')).toBe('');
    expect(normaliserNomEntreprise('- . -')).toBe('');
  });

  it('prouverait qu’on écrase les noms, et non qu’on les discrimine, si la suite ne testait que des égalités', () => {
    // §D6 — La moitié qu'on oublie. Deux entreprises RÉELLEMENT distinctes ne doivent
    // pas se confondre, sinon la normalisation ne « déduplique » plus : elle aplatit.
    expect(normaliserNomEntreprise('Alpha Réseaux')).not.toBe(
      normaliserNomEntreprise('Beta Réseaux'),
    );
    expect(normaliserNomEntreprise('Untel SAS')).not.toBe(normaliserNomEntreprise('Untela SAS'));
    expect(normaliserNomEntreprise('Alpha 2000')).not.toBe(normaliserNomEntreprise('Alpha 2001'));
    // L'ORDRE DES MOTS compte : la normalisation ne trie pas les jetons.
    expect(normaliserNomEntreprise('Alpha Beta')).not.toBe(normaliserNomEntreprise('Beta Alpha'));
  });

  it('ferait passer pour un défaut une sur-détection ASSUMÉE si les deux collisions connues n’étaient pas fixées', () => {
    // §D7 — MESURÉ, ET C'EST LE COMPORTEMENT VOULU, pas un accident :
    //   · le tiret et l'apostrophe deviennent des espaces, donc « Alpha-Beta » et
    //     « Alpha Beta » se rejoignent — c'est le but ;
    //   · « Groupe Alpha » et « Alpha Holding » rendent tous deux `alpha`, parce que
    //     `groupe` ET `holding` sont dans la liste. Deux entités d'un même groupe se
    //     signaleront donc mutuellement.
    // Ce n'est acceptable QUE parce que le constat est un AVERTISSEMENT NON BLOQUANT
    // (R3 dit « alerte ») : la fiche est créée, l'humain trie. Le jour où quelqu'un
    // voudrait en faire un refus, ce test est la raison de ne pas le faire.
    expect(normaliserNomEntreprise('Alpha-Beta')).toBe(normaliserNomEntreprise('Alpha Beta'));
    expect(normaliserNomEntreprise('L’Atelier Alpha')).toBe(
      normaliserNomEntreprise("L'Atelier Alpha"),
    );
    expect(normaliserNomEntreprise('Groupe Alpha')).toBe('alpha');
    expect(normaliserNomEntreprise('Alpha Holding')).toBe('alpha');
  });
});

// =============================================================================
// §E — les schémas Zod du contrat
// =============================================================================

describe('§E1 — `sirenSchema` : valider ne suffit pas, il faut TRANSFORMER', () => {
  it('laisserait deux graphies du même SIREN coexister malgré l’index unique si la sortie n’était pas la valeur normalisée', () => {
    // `companies(siren) WHERE siren IS NOT NULL` compare des CHAÎNES. Un schéma qui
    // validerait « 123 456 782 » sans le transformer insérerait la saisie brute :
    // l'index n'y verrait pas le doublon de « 123456782 », et R3 tomberait
    // silencieusement — le pire mode de panne, parce que la contrainte a l'air posée.
    expect(donneesValidees(sirenSchema, '123 456 782')).toBe(SIREN_VALIDE);
    expect(donneesValidees(sirenSchema, '123.456.782')).toBe(SIREN_VALIDE);
    expect(
      donneesValidees(sirenSchema, '123' + ESPACE_INSECABLE + '456' + ESPACE_INSECABLE + '782'),
    ).toBe(SIREN_VALIDE);
    expect(donneesValidees(sirenSchema, SIREN_VALIDE)).toBe(SIREN_VALIDE);
  });

  it('enverrait chercher la faute à deux endroits si un SIREN trop court accumulait « mauvaise longueur » et « clé invalide »', () => {
    // Les deux contrôles sont chaînés par `.pipe`, donc SÉQUENTIELS : un seul motif
    // remonte. Une faute = un message.
    const trop = refusDe(sirenSchema, '12345678');
    expect(trop.messages).toEqual(['Le SIREN doit comporter exactement 9 chiffres.']);

    const cle = refusDe(sirenSchema, '123456783');
    expect(cle.messages).toEqual(['La clé de contrôle de ce SIREN est invalide.']);

    // Le tiret n'étant pas un séparateur, il échoue sur la LONGUEUR — pas sur la clé.
    const tirets = refusDe(sirenSchema, '123-456-782');
    expect(tirets.messages).toEqual(['Le SIREN doit comporter exactement 9 chiffres.']);
  });
});

describe('§E2 — `createCompanyRequestSchema` : `null` par défaut, jamais `undefined`', () => {
  it('ferait traverser l’insertion différemment à un champ omis et à un champ nul si les défauts ne matérialisaient pas `null`', () => {
    // §E2 — Une filiale étrangère n'a ni SIREN ni code APE (03 §16, V2.2 du fichier
    // 04) : le contrat DIT que ces champs sont nuls plutôt que de laisser l'appelant
    // deviner qu'omettre vaut « inconnu ». La clé doit donc être PRÉSENTE et porter
    // `null` — `undefined` n'atteindrait pas la colonne de la même façon, et le
    // dépôt distingue précisément ces deux valeurs au `PATCH` (voir §E3).
    const cree = donneesValidees(createCompanyRequestSchema, { name: 'Alpha' });

    expect(Object.keys(cree).sort((a, b) => a.localeCompare(b, 'fr'))).toEqual([
      'countries',
      'externalRef',
      'headcount',
      'nafCode',
      'name',
      'notes',
      'sectorId',
      'siren',
      'sitesCount',
    ]);
    expect(cree.siren).toBeNull();
    expect(cree.nafCode).toBeNull();
    expect(cree.sectorId).toBeNull();
    expect(cree.externalRef).toBeNull();
    expect(cree.headcount).toBeNull();
    expect(cree.sitesCount).toBeNull();
    expect(cree.notes).toBeNull();
    // `countries` fait exception, et c'est cohérent : la colonne est un JSONB de
    // tableau, dont l'absence se dit par la liste vide, pas par `null`.
    expect(cree.countries).toEqual([]);
  });

  it('rendrait tout regroupement par pays incomplet — et une liste incomplète ne se voit pas — si les codes pays n’étaient pas normalisés en majuscules', () => {
    const cree = donneesValidees(createCompanyRequestSchema, {
      name: '  Alpha  ',
      siren: '123 456 782',
      nafCode: '6201z',
      countries: ['fr', ' de '],
    });
    expect(cree.name).toBe('Alpha'); // le `trim` s'applique AVANT `min(1)`
    expect(cree.siren).toBe(SIREN_VALIDE);
    expect(cree.nafCode).toBe('62.01Z');
    expect(cree.countries).toEqual(['FR', 'DE']);
    expect(refusDe(createCompanyRequestSchema, { name: 'A', countries: ['FRA'] }).messages).toEqual(
      ['Code pays ISO 3166-1 alpha-2 attendu (par exemple FR).'],
    );
  });

  it('donnerait à l’appelant de quoi écraser une fiche par un POST, ou antidater un client, si les champs du dépôt n’étaient pas refusés', () => {
    // `strictObject` : `id`, `createdAt`, `updatedAt` et `deletedAt` appartiennent au
    // serveur (UUID v7 frappé côté applicatif, 11 §2). Une clé non déclarée est
    // REFUSÉE, pas ignorée — ignorer laisserait l'appelant croire qu'elle a été prise.
    for (const clef of ['id', 'createdAt', 'updatedAt', 'deletedAt', 'secteurAQualifier']) {
      const refus = refusDe(createCompanyRequestSchema, { name: 'Alpha', [clef]: 'x' });
      expect(refus.codes, `clé interdite ${clef}`).toContain('unrecognized_keys');
    }
  });

  it('accepterait une entrée démesurée AVANT la base si les bornes applicatives n’étaient pas éprouvées à leur limite exacte', () => {
    // `companies.name` et `notes` sont des `TEXT` sans borne au fichier 04 : les
    // bornes sont APPLICATIVES, donc elles n'existent que si elles sont testées.
    // Éprouvées à N (accepté) et N+1 (refusé) — une borne testée « au milieu » ne
    // distingue pas `<` de `<=`.
    const nom = 'a'.repeat(NOM_ENTREPRISE_LONGUEUR_MAX);
    expect(donneesValidees(createCompanyRequestSchema, { name: nom }).name).toBe(nom);
    expect(refusDe(createCompanyRequestSchema, { name: `${nom}a` }).codes).toContain('too_big');

    const notes = 'n'.repeat(NOTES_ENTREPRISE_LONGUEUR_MAX);
    expect(donneesValidees(createCompanyRequestSchema, { name: 'A', notes }).notes).toBe(notes);
    expect(refusDe(createCompanyRequestSchema, { name: 'A', notes: `${notes}n` }).codes).toContain(
      'too_big',
    );

    const ref = 'r'.repeat(REF_EXTERNE_LONGUEUR_MAX);
    expect(
      donneesValidees(createCompanyRequestSchema, { name: 'A', externalRef: ref }).externalRef,
    ).toBe(ref);
    expect(
      refusDe(createCompanyRequestSchema, { name: 'A', externalRef: `${ref}r` }).codes,
    ).toContain('too_big');

    // Bornes de VRAISEMBLANCE : elles écartent un chiffre d'affaires saisi dans la
    // case des effectifs, sans refuser un client réel.
    expect(
      donneesValidees(createCompanyRequestSchema, { name: 'A', headcount: EFFECTIF_MAX }).headcount,
    ).toBe(EFFECTIF_MAX);
    expect(
      refusDe(createCompanyRequestSchema, { name: 'A', headcount: EFFECTIF_MAX + 1 }).codes,
    ).toContain('too_big');
    expect(refusDe(createCompanyRequestSchema, { name: 'A', headcount: -1 }).codes).toContain(
      'too_small',
    );
    expect(refusDe(createCompanyRequestSchema, { name: 'A', headcount: 1.5 }).codes).toContain(
      'invalid_type',
    );

    expect(
      donneesValidees(createCompanyRequestSchema, {
        name: 'A',
        countries: Array<string>(PAYS_MAX).fill('FR'),
      }).countries,
    ).toHaveLength(PAYS_MAX);
    expect(
      refusDe(createCompanyRequestSchema, {
        name: 'A',
        countries: Array<string>(PAYS_MAX + 1).fill('FR'),
      }).codes,
    ).toContain('too_big');

    // Un nom vide ou blanc n'est pas un nom : `trim` puis `min(1)`.
    expect(refusDe(createCompanyRequestSchema, { name: '   ' }).codes).toContain('too_small');
  });
});

describe('§E3 — `updateCompanyRequestSchema` : absent ≠ `null`, c’est toute la sémantique du PATCH', () => {
  it('rendrait impossible ou involontaire l’effacement d’un SIREN saisi par erreur si « absent » et « null » se confondaient', () => {
    // §E3 — LE CŒUR DU `PATCH`. Le service lit cette distinction telle quelle
    // (`comparer()` : `undefined` n'entre jamais dans le `SET`, `null` oui). Si le
    // schéma les confondait, ou bien un champ omis serait effacé — perte de donnée
    // silencieuse — ou bien un `null` explicite serait ignoré, et l'invariant 7
    // (« toute correction de donnée est possible et tracée ») deviendrait faux pour
    // le SIREN, seul champ que l'index unique rend coûteux à corriger en base.
    const efface = donneesValidees(updateCompanyRequestSchema, { siren: null });
    expect(Object.keys(efface)).toEqual(['siren']);
    expect('siren' in efface).toBe(true);
    expect(efface.siren).toBeNull();

    const intouche = donneesValidees(updateCompanyRequestSchema, { name: 'Alpha' });
    expect(Object.keys(intouche)).toEqual(['name']);
    expect('siren' in intouche).toBe(false);
    expect(intouche.siren).toBeUndefined();

    // Aucun défaut n'est appliqué : un `PATCH` ne remplit jamais les blancs.
    expect(Object.keys(donneesValidees(updateCompanyRequestSchema, { notes: null }))).toEqual([
      'notes',
    ]);
  });

  it('produirait une ligne de journal vide et un `updated_at` bousculé pour rien si le corps vide était accepté', () => {
    const refus = refusDe(updateCompanyRequestSchema, {});
    expect(refus.messages).toEqual(['Indiquez au moins un champ à modifier.']);
    expect(refus.codes).toEqual(['custom']);
  });

  it('accepterait un champ du dépôt sur une route de modification si l’objet n’était pas strict', () => {
    expect(
      refusDe(updateCompanyRequestSchema, { name: 'Alpha', id: UUID_QUELCONQUE }).codes,
    ).toContain('unrecognized_keys');
    // Les transformations valent aussi au `PATCH` : ce qui entre normalisé sort normalisé.
    expect(donneesValidees(updateCompanyRequestSchema, { siren: '123 456 782' }).siren).toBe(
      SIREN_VALIDE,
    );
    expect(donneesValidees(updateCompanyRequestSchema, { nafCode: '6201z' }).nafCode).toBe(
      '62.01Z',
    );
  });
});

describe('§E4 — `companyParamsSchema` et `homonymeCompanySchema`', () => {
  it('laisserait une chaîne libre atteindre une requête SQL paramétrée par un identifiant si l’UUID n’était pas exigé', () => {
    expect(donneesValidees(companyParamsSchema, { id: UUID_QUELCONQUE }).id).toBe(UUID_QUELCONQUE);
    expect(refusDe(companyParamsSchema, { id: 'pas-un-uuid' }).codes).toContain('invalid_format');
    expect(refusDe(companyParamsSchema, { id: UUID_QUELCONQUE, autre: 1 }).codes).toContain(
      'unrecognized_keys',
    );
  });

  it('inviterait à fixer un seuil, donc à décider à la place de l’humain, si l’homonyme portait autre chose que son identité', () => {
    // R3 dit « alerte », pas « score ». Le schéma rend l'IDENTIFIANT et le NOM, et
    // `strictObject` empêche qu'un score de ressemblance s'y glisse un jour.
    const homonyme = donneesValidees(homonymeCompanySchema, { id: UUID_QUELCONQUE, name: 'Alpha' });
    expect(homonyme).toEqual({ id: UUID_QUELCONQUE, name: 'Alpha' });
    expect(
      refusDe(homonymeCompanySchema, { id: UUID_QUELCONQUE, name: 'Alpha', score: 0.9 }).codes,
    ).toContain('unrecognized_keys');
  });
});

describe('§E5 — schémas de RÉPONSE : ce que le sérialiseur laisse passer', () => {
  it('laisserait un champ ajouté par mégarde à une réponse atteindre le réseau si l’objet de sortie n’était pas strict', () => {
    // §E5 — LA « CEINTURE 5 » DE `scoping.ts`, MESURÉE ICI POUR `companies`.
    //
    // ⚠ ATTENTION AU LIBELLÉ EMPLOYÉ AILLEURS. L'en-tête de `scoping.ts` écrit que
    // « le sérialiseur Zod RETIRE tout champ non déclaré ». Ce n'est PAS ce que fait
    // `z.strictObject`, et ce fichier-ci le dit correctement dans son propre
    // commentaire : « une clé non déclarée est REFUSÉE, pas ignorée ». MESURÉ :
    // `companyResponseSchema.safeParse({…, totalAmount})` ÉCHOUE avec
    // `unrecognized_keys`. Le champ ne part donc pas — mais par un 500 tracé, pas par
    // un retrait discret. C'est la garantie la PLUS forte des deux : une fuite
    // financière devient une panne visible plutôt qu'un silence.
    expect(donneesValidees(companyResponseSchema, FICHE_VALIDE)).toEqual(FICHE_VALIDE);

    for (const clef of ['totalAmount', 'dailyRates', 'travelCosts', 'deletedAt']) {
      const refus = refusDe(companyResponseSchema, { ...FICHE_VALIDE, [clef]: 'x' });
      expect(refus.codes, `champ non déclaré ${clef}`).toContain('unrecognized_keys');
    }
  });

  it('afficherait une heure fausse au fuseau de mission si un horodatage à décalage non nul était accepté', () => {
    // Invariant 5 / contrat 11 §3 : ISO 8601 **UTC** en API. Le fuseau de mission ne
    // s'applique qu'à l'AFFICHAGE ; laisser entrer un `+02:00` ferait porter le
    // décalage deux fois.
    expect(
      refusDe(companyResponseSchema, {
        ...FICHE_VALIDE,
        createdAt: '2026-08-31T02:00:00.000+02:00',
      }).codes,
    ).toContain('invalid_format');
  });

  it('obligerait la lecture à recalculer les constats d’écriture, ou à les rendre faux, si la fiche n’était pas imbriquée dans la réponse d’écriture', () => {
    // `secteurAQualifier` et `doublonsNomPossibles` sont des constats sur l'ACTE, pas
    // des propriétés de l'entreprise : d'où l'imbrication, assumée asymétrique avec
    // le `GET`. Le contrôle strict porte AUSSI à l'intérieur de `company`.
    const ecriture = donneesValidees(companyWriteResponseSchema, {
      company: FICHE_VALIDE,
      secteurAQualifier: true,
      doublonsNomPossibles: [{ id: UUID_QUELCONQUE, name: 'Alpha' }],
    });
    expect(ecriture.company.id).toBe(UUID_QUELCONQUE);
    expect(ecriture.secteurAQualifier).toBe(true);
    expect(ecriture.doublonsNomPossibles).toHaveLength(1);

    // Le cas COURANT : aucun homonyme, rien à qualifier. La liste vide est une valeur,
    // pas une absence — elle doit être présente.
    const courant = donneesValidees(companyWriteResponseSchema, {
      company: { ...FICHE_VALIDE, sectorId: UUID_SECTEUR },
      secteurAQualifier: false,
      doublonsNomPossibles: [],
    });
    expect(courant.doublonsNomPossibles).toEqual([]);

    expect(
      refusDe(companyWriteResponseSchema, {
        company: { ...FICHE_VALIDE, dailyRates: { consultant: 900 } },
        secteurAQualifier: false,
        doublonsNomPossibles: [],
      }).codes,
    ).toContain('unrecognized_keys');
  });
});

describe('§E6 — la langue des refus (invariant 5, contrat 11 §3)', () => {
  it('afficherait un message anglais sur l’écran d’un auditeur en clientèle si les refus n’étaient pas rendus en français', () => {
    // §E6 — `error.details[].message` est recopié depuis Zod et affiché TEL QUEL par
    // la PWA. Deux familles de messages, et les deux comptent :
    //   · les messages ÉCRITS dans `companies.ts` — français par construction ;
    //   · les messages GÉNÉRIQUES de Zod — français seulement parce que
    //     `appliquerLocaleFrancaiseZod()` a été appelée (voir l'import en tête).
    // Sans cet appel, ce test lirait « Invalid input: expected string, received
    // undefined » : c'est la mesure, pas une supposition.
    expect(refusDe(sirenSchema, '12345678').messages).toEqual([
      'Le SIREN doit comporter exactement 9 chiffres.',
    ]);
    expect(refusDe(updateCompanyRequestSchema, {}).messages).toEqual([
      'Indiquez au moins un champ à modifier.',
    ]);

    const manquant = refusDe(createCompanyRequestSchema, {});
    expect(manquant.messages[0]).toBe('Entrée invalide : chaîne attendu, indéfini reçu');

    const inconnue = refusDe(createCompanyRequestSchema, { name: 'Alpha', inconnu: 1 });
    expect(inconnue.messages[0]).toBe('Clé non reconnue : "inconnu"');

    // Filet du garde-fou d'`errors.ts` : aucun message ne doit commencer par un
    // préfixe anglais connu. Vérifié sur l'ensemble des refus de ce test.
    const tous = [
      ...manquant.messages,
      ...inconnue.messages,
      ...refusDe(createCompanyRequestSchema, { name: 'A', headcount: -1 }).messages,
      ...refusDe(nafCodeSchema, 'abc').messages,
      ...refusDe(companyParamsSchema, { id: 'x' }).messages,
    ];
    for (const message of tous) {
      expect(
        /^(Invalid|Too |Unrecognized|Required|Expected|Not a|String |Number |Array )/.test(message),
        `message non francisé : ${message}`,
      ).toBe(false);
    }
  });
});
