// =============================================================================
// TESTS PURS DU PARSEUR CSV DE L'ARBRE — lot L3, incrément L3c, R-L3-3 (revue A17).
//
// Écrits par A16, qui n'a écrit aucune ligne de `org-units.ts` (09 §5.6). Seules
// les signatures, les types exportés et la JSDoc de `analyserCsvArbre` et
// `detecterSeparateurCsv` ont été lus — jamais leur corps. Ce que ces tests
// tiennent pour vrai vient du pack et des arbitrages :
//   · 03 §35.2 : UTF-8, `;` ou `,` détecté, en-têtes obligatoires, neuf colonnes,
//     `name`* et `kind`* seuls obligatoires, `ref` unique, `parent_ref` vide =
//     racine, import ATOMIQUE avec rapport ligne par ligne ;
//   · `DECISIONS.md` 2026-09-01 [L3c] : colonne inconnue REFUSÉE et nommée ;
//     ligne vide IGNORÉE et COMPTÉE ; numérotation TABLEUR (en-tête = ligne 1) ;
//   · les bornes exportées : `LIGNES_CSV_ARBRE_MAX`, `REF_CSV_LONGUEUR_MAX`,
//     `NOM_UNITE_LONGUEUR_MAX`, `SEPARATEUR_CSV_ARBRE_DEFAUT`.
//
// ── CE QUE CE FICHIER NE PROUVE PAS ─────────────────────────────────────────
// Rien de ce qui touche la base : `REFERENTIEL_INCONNU` (contrôle serveur des
// codes de service et de secteur), l'atomicité RÉELLE (`COUNT(org_units)`
// inchangé après une erreur en ligne 900), le mode à blanc `?verification=true`,
// `importReelRefuse`. Tout cela vit dans `apps/api/tests/*.integration.test.ts`.
//
// ── INVARIANT 2 ─────────────────────────────────────────────────────────────
// L'exemple du §35.2 est recopié SANS ses noms : « Groupe Alpha », « Filiale
// Nord », « Logistique Sud ».
//
// Traçabilité : E4 (arbre organisationnel profondeur libre — c'est le fichier par
// lequel l'arbre entre) · E43 (exécutabilité autopilote — le rapport d'erreurs
// est le contrat que le front et l'auditeur lisent).
// =============================================================================
import { describe, expect, it } from 'vitest';

import {
  COLONNES_CSV_ARBRE,
  LIGNES_CSV_ARBRE_MAX,
  LIGNE_ENTETE_CSV,
  NOM_UNITE_LONGUEUR_MAX,
  REF_CSV_LONGUEUR_MAX,
  SEPARATEUR_CSV_ARBRE_DEFAUT,
  analyserCsvArbre,
  detecterSeparateurCsv,
  type AnalyseCsvArbre,
  type CodeDefautImportArbre,
  type ColonneCsvArbre,
} from './org-units.js';

// -----------------------------------------------------------------------------
// OUTILS
// -----------------------------------------------------------------------------

const ENTETE = 'ref;name;kind;parent_ref;country_code;headcount;service_code;sector_code;timezone';

/** Un fichier : l'en-tête du §35.2 puis les enregistrements, `\n` entre chaque. */
function csv(...lignes: readonly string[]): string {
  return [ENTETE, ...lignes].join('\n');
}

/** L'exemple du §35.2, sans ses noms. */
const EXEMPLE_35_2 = csv(
  '1;Groupe Alpha;groupe;;FR;6500;;;',
  '2;Filiale Nord;filiale;1;FR;3200;;;',
  '3;Logistique Sud;service;2;FR;85;logistique_operations;;',
);

function codes(analyse: AnalyseCsvArbre): readonly CodeDefautImportArbre[] {
  return analyse.erreurs.map((e) => e.code);
}

function erreur(analyse: AnalyseCsvArbre, code: CodeDefautImportArbre) {
  const trouvee = analyse.erreurs.find((e) => e.code === code);
  if (trouvee === undefined) {
    throw new Error(`aucune erreur « ${code} » ; reçues : ${JSON.stringify(analyse.erreurs)}`);
  }
  return trouvee;
}

function attendreValide(analyse: AnalyseCsvArbre): void {
  expect(analyse.erreurs).toEqual([]);
  // La propriété sur laquelle l'import atomique s'appuie (JSDoc de `AnalyseCsvArbre`).
  expect(analyse.lignes.length).toBe(analyse.lignesLues);
}

// -----------------------------------------------------------------------------
// DÉTECTION DU SÉPARATEUR
// -----------------------------------------------------------------------------

describe('detecterSeparateurCsv — on compte, on ne devine pas', () => {
  it('`;` majoritaire sur la ligne d’en-tête ⇒ `;`', () => {
    expect(detecterSeparateurCsv(ENTETE)).toBe(';');
  });

  it('`,` majoritaire ⇒ `,`', () => {
    expect(detecterSeparateurCsv(ENTETE.replaceAll(';', ','))).toBe(',');
  });

  it('@critique égalité (y compris 0 contre 0) ⇒ `;`, celui que le §35.2 nomme en premier', () => {
    // Attrape : un `>=` posé du mauvais côté (l'égalité rendrait `,`), et un
    // fichier vide ou à une colonne qui rendrait `undefined`.
    expect(detecterSeparateurCsv('a;b,c;d,e')).toBe(';');
    expect(detecterSeparateurCsv('ref')).toBe(';');
    expect(detecterSeparateurCsv('')).toBe(';');
    expect(SEPARATEUR_CSV_ARBRE_DEFAUT).toBe(';');
  });

  it('seule la PREMIÈRE ligne physique compte : des virgules dans les données ne changent rien', () => {
    expect(detecterSeparateurCsv(`${ENTETE}\n1;a,b,c,d,e,f,g,h,i,j,k;groupe;;;;;;`)).toBe(';');
  });
});

// -----------------------------------------------------------------------------
// L'EN-TÊTE
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — en-tête', () => {
  it('l’exemple du §35.2 (sans ses noms) est accepté tel quel', () => {
    const analyse = analyserCsvArbre(EXEMPLE_35_2);
    attendreValide(analyse);
    expect(analyse.separateur).toBe(';');
    expect(analyse.lignesLues).toBe(3);
    expect(analyse.lignesVidesIgnorees).toBe(0);
    expect(analyse.lignes).toEqual([
      {
        ligne: 2,
        ref: '1',
        name: 'Groupe Alpha',
        kind: 'groupe',
        parentIndice: null,
        countryCode: 'FR',
        headcount: 6500,
        serviceCode: null,
        sectorCode: null,
        timezone: null,
      },
      {
        ligne: 3,
        ref: '2',
        name: 'Filiale Nord',
        kind: 'filiale',
        parentIndice: 0,
        countryCode: 'FR',
        headcount: 3200,
        serviceCode: null,
        sectorCode: null,
        timezone: null,
      },
      {
        ligne: 4,
        ref: '3',
        name: 'Logistique Sud',
        kind: 'service',
        parentIndice: 1,
        countryCode: 'FR',
        headcount: 85,
        serviceCode: 'logistique_operations',
        sectorCode: null,
        timezone: null,
      },
    ]);
  });

  it('@critique les neuf colonnes dans un ordre QUELCONQUE sont acceptées, et chaque valeur atterrit dans SA colonne', () => {
    // Attrape : un parseur positionnel (« la 6e cellule est l'effectif ») qui
    // lirait `timezone` comme effectif sans rien dire.
    const contenu = [
      'timezone;headcount;name;sector_code;kind;ref;service_code;parent_ref;country_code',
      'Europe/Paris;12;Unité A;;service;A;rh;;FR',
    ].join('\n');
    const analyse = analyserCsvArbre(contenu);
    attendreValide(analyse);
    expect(analyse.lignes[0]).toEqual({
      ligne: 2,
      ref: 'A',
      name: 'Unité A',
      kind: 'service',
      parentIndice: null,
      countryCode: 'FR',
      headcount: 12,
      serviceCode: 'rh',
      sectorCode: null,
      timezone: 'Europe/Paris',
    });
  });

  it('une marque d’ordre des octets (BOM) en tête est retirée : `ref` n’est pas « U+FEFF ref »', () => {
    const analyse = analyserCsvArbre(`\uFEFF${EXEMPLE_35_2}`);
    attendreValide(analyse);
    expect(analyse.lignes).toHaveLength(3);
  });

  it('le BOM n’est retiré QU’EN TÊTE : au milieu d’un nom, il est une donnée', () => {
    const analyse = analyserCsvArbre(csv('1;Unité \uFEFFX;groupe;;;;;;'));
    attendreValide(analyse);
    expect(analyse.lignes[0]?.name).toBe('Unité \uFEFFX');
  });

  it('la casse et les espaces des en-têtes sont tolérés (« Name », « HEADCOUNT »)', () => {
    const contenu = [
      ' Ref ; Name ;KIND;Parent_Ref;country_code;HEADCOUNT;service_code;sector_code;timezone',
      '1;Unité;groupe;;;;;;',
    ].join('\n');
    attendreValide(analyserCsvArbre(contenu));
  });

  it('@critique une colonne inconnue fait REFUSER le fichier, en la NOMMANT, sur la ligne 1', () => {
    // Attrape : les colonnes inconnues ignorées en silence (option 2 refusée) —
    // `headcont` et l'effectif de tout l'arbre disparaîtrait.
    const contenu = [ENTETE.replace('headcount', 'headcont'), '1;Unité;groupe;;;42;;;'].join('\n');
    const analyse = analyserCsvArbre(contenu);
    expect(analyse.lignes).toEqual([]);
    const inconnu = erreur(analyse, 'ENTETE_INCONNU');
    expect(inconnu.ligne).toBe(LIGNE_ENTETE_CSV);
    expect(inconnu.colonne).toBeNull();
    expect(inconnu.message).toContain('headcont');
    // Et la colonne attendue manque : les deux causes sont rapportées.
    const manquant = erreur(analyse, 'ENTETE_MANQUANT');
    expect(manquant.ligne).toBe(LIGNE_ENTETE_CSV);
    expect(manquant.colonne === 'headcount' || manquant.message.includes('headcount')).toBe(true);
  });

  it('une dixième colonne, même vide de valeurs, est refusée et nommée', () => {
    const analyse = analyserCsvArbre(`${ENTETE};commentaire\n1;Unité;groupe;;;;;;;`);
    expect(erreur(analyse, 'ENTETE_INCONNU').message).toContain('commentaire');
  });

  it('une colonne dupliquée est refusée (ENTETE_DUPLIQUE), en la nommant', () => {
    const contenu = [ENTETE.replace('sector_code', 'name'), '1;Unité;groupe;;;;Unité bis;;'].join(
      '\n',
    );
    const analyse = analyserCsvArbre(contenu);
    const dup = erreur(analyse, 'ENTETE_DUPLIQUE');
    expect(dup.ligne).toBe(LIGNE_ENTETE_CSV);
    expect(dup.colonne === 'name' || dup.message.includes('name')).toBe(true);
  });

  it('un en-tête invalide ARRÊTE l’analyse : aucune erreur de valeur n’est inventée sur les lignes', () => {
    const contenu = [ENTETE.replace('kind', 'type'), '1;;pas_un_kind;;ZZ;abc;;;'].join('\n');
    const analyse = analyserCsvArbre(contenu);
    expect(analyse.erreurs.every((e) => e.ligne === LIGNE_ENTETE_CSV)).toBe(true);
    expect(codes(analyse)).not.toContain('VALEUR_OBLIGATOIRE');
    expect(codes(analyse)).not.toContain('FORMAT_INVALIDE');
  });

  it('un contenu vide ou blanc rend FICHIER_VIDE, sans exception', () => {
    for (const contenu of ['', '   ', '\n\n', '\uFEFF']) {
      const analyse = analyserCsvArbre(contenu);
      expect(codes(analyse)).toContain('FICHIER_VIDE');
      expect(analyse.lignes).toEqual([]);
    }
  });

  it('un en-tête seul, sans enregistrement, ne produit AUCUNE ligne et ne lève pas', () => {
    // Le pack ne dit pas si c'est une erreur ou un import à zéro : on ne fixe que
    // l'invariant « jamais d'unité fantôme ». Doute consigné pour DECISIONS.md.
    const analyse = analyserCsvArbre(ENTETE);
    expect(analyse.lignes).toEqual([]);
    expect(analyse.lignesLues).toBe(0);
  });

  it('COLONNES_CSV_ARBRE est exactement la liste du §35.2, dans son ordre', () => {
    const attendu: readonly ColonneCsvArbre[] = [
      'ref',
      'name',
      'kind',
      'parent_ref',
      'country_code',
      'headcount',
      'service_code',
      'sector_code',
      'timezone',
    ];
    expect([...COLONNES_CSV_ARBRE]).toEqual(attendu);
  });
});

// -----------------------------------------------------------------------------
// SÉPARATEUR, GUILLEMETS, FINS DE LIGNE
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — séparateur `,`, guillemets RFC 4180, fins de ligne', () => {
  it('un fichier à virgules est lu avec `,`, valeurs identiques', () => {
    const analyse = analyserCsvArbre(EXEMPLE_35_2.replaceAll(';', ','));
    attendreValide(analyse);
    expect(analyse.separateur).toBe(',');
    expect(analyse.lignes.map((l) => l.name)).toEqual([
      'Groupe Alpha',
      'Filiale Nord',
      'Logistique Sud',
    ]);
  });

  it('@critique un séparateur entre guillemets fait partie de la valeur, un guillemet doublé est un guillemet', () => {
    // Attrape : un `split(';')` naïf — « Achats; logistique » deviendrait deux
    // cellules et la ligne serait refusée pour NOMBRE_DE_CHAMPS, ou pire, décalée.
    const analyse = analyserCsvArbre(csv('1;"Achats; logistique ""Sud""";service;;;;;;'));
    attendreValide(analyse);
    expect(analyse.lignes[0]?.name).toBe('Achats; logistique "Sud"');
  });

  it('un retour à la ligne INTERNE à un champ entre guillemets ne coupe pas l’enregistrement ; la numérotation reste PHYSIQUE', () => {
    // La ligne 2 occupe deux lignes physiques (2-3) ; l'enregistrement suivant est
    // donc en ligne 4 — et c'est là que l'auditeur pose les yeux dans son tableur.
    const analyse = analyserCsvArbre(
      csv('1;"Unité\nsur deux lignes";groupe;;;;;;', '2;;service;1;;;;;'),
    );
    expect(analyse.lignes[0]?.name).toBe('Unité\nsur deux lignes');
    const obligatoire = erreur(analyse, 'VALEUR_OBLIGATOIRE');
    expect(obligatoire.ligne).toBe(4);
    expect(obligatoire.colonne).toBe('name');
  });

  it('les fins de ligne `\\r\\n` sont acceptées et ne laissent pas de `\\r` dans les valeurs', () => {
    const analyse = analyserCsvArbre(EXEMPLE_35_2.replaceAll('\n', '\r\n'));
    attendreValide(analyse);
    expect(analyse.lignes[2]?.serviceCode).toBe('logistique_operations');
    expect(analyse.lignes[0]?.name).toBe('Groupe Alpha');
  });

  it('une ligne au mauvais nombre de cellules est rapportée NOMBRE_DE_CHAMPS, colonne nulle, à son numéro', () => {
    const analyse = analyserCsvArbre(csv('1;Unité;groupe;;;;;;', '2;Trop courte;service'));
    const e = erreur(analyse, 'NOMBRE_DE_CHAMPS');
    expect(e.ligne).toBe(3);
    expect(e.colonne).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// LIGNES VIDES ET NUMÉROTATION TABLEUR
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — lignes vides comptées, numérotation tableur', () => {
  it('@critique une ligne vide est IGNORÉE et COMPTÉE, jamais une unité fantôme', () => {
    // Attrape : la ligne vide refusée (option 2) ; la ligne vide muette (compte
    // absent) ; la ligne vide devenue une unité sans nom.
    // Trois formes de « vide » qu'un tableur produit : rien, que des séparateurs,
    // que des espaces. Le saut de ligne FINAL du fichier n'est pas une ligne.
    const analyse = analyserCsvArbre(
      csv('1;Unité;groupe;;;;;;', '', ';;;;;;;;', '   ', '2;Fille;service;1;;;;;'),
    );
    attendreValide(analyse);
    expect(analyse.lignes).toHaveLength(2);
    expect(analyse.lignesLues).toBe(2);
    expect(analyse.lignesVidesIgnorees).toBe(3);
  });

  it('un saut de ligne final ne crée ni unité fantôme ni erreur', () => {
    const analyse = analyserCsvArbre(`${EXEMPLE_35_2}
`);
    attendreValide(analyse);
    expect(analyse.lignes).toHaveLength(3);
  });

  it('@critique l’en-tête est la ligne 1 ; une ligne vide occupe son numéro ; l’erreur porte le numéro du TABLEUR', () => {
    // Attrape : un index d'enregistrement (la 3e donnée = « ligne 3 ») et un
    // compteur qui saute les lignes vides — dans les deux cas, l'auditeur cherche
    // au mauvais endroit.
    const analyse = analyserCsvArbre(
      csv(
        '1;Unité;groupe;;;;;;', // ligne 2
        '', // ligne 3
        '2;Fille;service;1;;;;;', // ligne 4
        '3;;service;1;;;;;', // ligne 5 : nom manquant
      ),
    );
    expect(erreur(analyse, 'VALEUR_OBLIGATOIRE').ligne).toBe(5);
    expect(analyse.lignes.map((l) => l.ligne)).toEqual([2, 4]);
    expect(LIGNE_ENTETE_CSV).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// LES VALEURS
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — valeurs de chaque colonne', () => {
  it('`name` et `kind` vides ⇒ VALEUR_OBLIGATOIRE, chacun sur SA colonne, les deux rapportés sur la même ligne', () => {
    const analyse = analyserCsvArbre(csv('1;;;;;;;;'));
    const obligatoires = analyse.erreurs.filter((e) => e.code === 'VALEUR_OBLIGATOIRE');
    expect(obligatoires.map((e) => e.colonne).sort()).toEqual(['kind', 'name']);
    expect(obligatoires.every((e) => e.ligne === 2)).toBe(true);
  });

  it('`kind` hors des sept types du 04 ⇒ VALEUR_HORS_ENUM sur `kind`', () => {
    const analyse = analyserCsvArbre(csv('1;Unité;departement;;;;;;'));
    const e = erreur(analyse, 'VALEUR_HORS_ENUM');
    expect(e.colonne).toBe('kind');
    expect(e.ligne).toBe(2);
  });

  it('les sept `kind` du 04 sont acceptés', () => {
    const kinds = ['groupe', 'filiale', 'etablissement', 'direction', 'service', 'equipe', 'poste'];
    const analyse = analyserCsvArbre(
      csv(...kinds.map((k, i) => `${String(i)};Unité ${String(i)};${k};;;;;;`)),
    );
    attendreValide(analyse);
    expect(analyse.lignes.map((l) => l.kind)).toEqual(kinds);
  });

  it('@critique `headcount` « 6 500 » avec espace insécable (et fine insécable) est lu 6500 ; « 6.500 » est refusé', () => {
    // Attrape : `parseInt('6.500')` = 6 (un effectif divisé par mille en silence),
    // `Number('6 500')` = NaN (un tableur francophone refusé sur sa graphie normale).
    const ok = analyserCsvArbre(
      csv(
        '1;Unité;groupe;;;6\u00A0500;;;',
        '2;Unité 2;groupe;;;6\u202F500;;;',
        '3;Unité 3;groupe;;;6 500;;;',
      ),
    );
    attendreValide(ok);
    expect(ok.lignes.map((l) => l.headcount)).toEqual([6500, 6500, 6500]);

    const ko = analyserCsvArbre(csv('1;Unité;groupe;;;6.500;;;'));
    const e = erreur(ko, 'FORMAT_INVALIDE');
    expect(e.colonne).toBe('headcount');
    expect(ko.lignes).toEqual([]);
  });

  it('`headcount` : vide ⇒ `null` ; « 0 » ⇒ 0 ; négatif, décimal, texte ⇒ FORMAT_INVALIDE', () => {
    const ok = analyserCsvArbre(csv('1;Unité;groupe;;;;;;', '2;Unité 2;groupe;;;0;;;'));
    attendreValide(ok);
    expect(ok.lignes.map((l) => l.headcount)).toEqual([null, 0]);

    for (const valeur of ['-3', '12,5', 'douze', '1e3']) {
      const ko = analyserCsvArbre(csv(`1;Unité;groupe;;;${valeur};;;`));
      expect(erreur(ko, 'FORMAT_INVALIDE').colonne).toBe('headcount');
    }
  });

  it('`country_code` : deux lettres ISO ; « FRA » ou « F » ⇒ FORMAT_INVALIDE sur `country_code`', () => {
    attendreValide(analyserCsvArbre(csv('1;Unité;groupe;;FR;;;;', '2;Unité 2;groupe;;DE;;;;')));
    for (const valeur of ['FRA', 'F', '12']) {
      const ko = analyserCsvArbre(csv(`1;Unité;groupe;;${valeur};;;;`));
      expect(erreur(ko, 'FORMAT_INVALIDE').colonne).toBe('country_code');
    }
  });

  it('`timezone` : un fuseau IANA valide passe, vide = héritage (`null`), « Paris » ⇒ FORMAT_INVALIDE', () => {
    const ok = analyserCsvArbre(csv('1;Unité;groupe;;;;;;Europe/Paris', '2;Unité 2;groupe;;;;;;'));
    attendreValide(ok);
    expect(ok.lignes.map((l) => l.timezone)).toEqual(['Europe/Paris', null]);
    expect(
      erreur(analyserCsvArbre(csv('1;Unité;groupe;;;;;;Paris')), 'FORMAT_INVALIDE').colonne,
    ).toBe('timezone');
  });

  it('`ref` trop long (> REF_CSV_LONGUEUR_MAX) et `name` trop long (> NOM_UNITE_LONGUEUR_MAX) ⇒ VALEUR_TROP_LONGUE, sur leur colonne', () => {
    const refLong = 'r'.repeat(REF_CSV_LONGUEUR_MAX + 1);
    const nomLong = 'n'.repeat(NOM_UNITE_LONGUEUR_MAX + 1);
    const analyse = analyserCsvArbre(csv(`${refLong};${nomLong};groupe;;;;;;`));
    const longues = analyse.erreurs.filter((e) => e.code === 'VALEUR_TROP_LONGUE');
    expect(longues.map((e) => e.colonne).sort()).toEqual(['name', 'ref']);
    // Aux bornes exactes, les deux passent.
    attendreValide(
      analyserCsvArbre(
        csv(
          `${'r'.repeat(REF_CSV_LONGUEUR_MAX)};${'n'.repeat(NOM_UNITE_LONGUEUR_MAX)};groupe;;;;;;`,
        ),
      ),
    );
  });

  it('toutes les erreurs d’une ligne sont rapportées ensemble : jamais d’arrêt à la première', () => {
    const analyse = analyserCsvArbre(csv('1;;pas_un_kind;;FRA;abc;;;Nulle/Part'));
    const surLigne2 = analyse.erreurs.filter((e) => e.ligne === 2);
    expect(surLigne2.map((e) => e.colonne).sort()).toEqual([
      'country_code',
      'headcount',
      'kind',
      'name',
      'timezone',
    ]);
  });

  it('les valeurs sont élaguées : « Unité  » devient « Unité », un `ref` « 1 » et «  1 » sont le même', () => {
    const analyse = analyserCsvArbre(csv(' 1 ;  Unité  ;groupe;;;;;;', '2;Fille;service; 1;;;;;'));
    attendreValide(analyse);
    expect(analyse.lignes[0]?.name).toBe('Unité');
    expect(analyse.lignes[0]?.ref).toBe('1');
    expect(analyse.lignes[1]?.parentIndice).toBe(0);
  });

  it('`ref` vide est permis (une feuille n’a besoin d’aucune référence) et rendu `null`', () => {
    const analyse = analyserCsvArbre(csv('1;Racine;groupe;;;;;;', ';Feuille;poste;1;;;;;'));
    attendreValide(analyse);
    expect(analyse.lignes[1]?.ref).toBeNull();
    expect(analyse.lignes[1]?.parentIndice).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// LE GRAPHE : REF UNIQUE, PARENT, CYCLE
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — références, rattachements, cycles', () => {
  it('@critique un `ref` porté deux fois ⇒ REF_DUPLIQUEE sur `ref`, à la ligne de la répétition', () => {
    // Attrape : un dédoublonnage silencieux (la seconde écrase la première) — un
    // `parent_ref` qui vise « 1 » aurait deux parents possibles, et l'arbre choisi
    // au hasard.
    const analyse = analyserCsvArbre(
      csv('1;Unité A;groupe;;;;;;', '1;Unité B;groupe;;;;;;', '2;Fille;service;1;;;;;'),
    );
    const e = erreur(analyse, 'REF_DUPLIQUEE');
    expect(e.colonne).toBe('ref');
    expect([2, 3]).toContain(e.ligne);
    // Le rapport suffit : l'import est atomique, une erreur = rien d'importé.
    expect(analyse.erreurs).toHaveLength(1);
  });

  it('@critique le parent peut être déclaré APRÈS l’enfant : `parentIndice` est un indice dans `lignes`', () => {
    // Attrape : une résolution en un seul passage (« parent introuvable » parce
    // qu'il n'est pas encore lu) — un organigramme exporté n'est jamais trié.
    const analyse = analyserCsvArbre(
      csv('C;Petit-fils;poste;B;;;;;', 'B;Fils;service;A;;;;;', 'A;Racine;groupe;;;;;;'),
    );
    attendreValide(analyse);
    expect(analyse.lignes.map((l) => [l.ref, l.parentIndice])).toEqual([
      ['C', 1],
      ['B', 2],
      ['A', null],
    ]);
  });

  it('un `parent_ref` qui ne désigne aucune ligne ⇒ PARENT_INTROUVABLE sur `parent_ref`', () => {
    const analyse = analyserCsvArbre(csv('1;Racine;groupe;;;;;;', '2;Orpheline;service;9;;;;;'));
    const e = erreur(analyse, 'PARENT_INTROUVABLE');
    expect(e.colonne).toBe('parent_ref');
    expect(e.ligne).toBe(3);
  });

  it('le `ref` d’une ligne FAUTIVE compte pour la résolution : sa descendance n’est pas noyée sous PARENT_INTROUVABLE', () => {
    // Contrat écrit dans la JSDoc de `analyserCsvArbre` (ordre des contrôles, point 6 :
    // « contre TOUS les `ref` du fichier, y compris ceux de lignes fautives : sinon
    // une seule ligne cassée ferait cascader "parent introuvable" sur toute sa
    // descendance et noierait la cause réelle »). Le pack est muet ; c'est le
    // producteur qui a écrit cette règle, et c'est elle qui est vérifiée.
    const analyse = analyserCsvArbre(
      csv('A;;groupe;;;;;;', 'B;Fils;service;A;;;;;', 'C;Petit-fils;poste;B;;;;;'),
    );
    expect(codes(analyse)).toEqual(['VALEUR_OBLIGATOIRE']);
  });

  it('@critique un cycle A → B → A ⇒ CYCLE ; l’auto-parent A → A aussi', () => {
    // Attrape : une remontée d'ancêtres sans garde (boucle infinie : l'API
    // deviendrait muette au lieu de bruyante), et l'auto-parent traité comme racine.
    const cycle = analyserCsvArbre(csv('A;Unité A;groupe;B;;;;;', 'B;Unité B;filiale;A;;;;;'));
    expect(codes(cycle)).toContain('CYCLE');
    expect(cycle.lignes.length).toBeLessThan(cycle.lignesLues);

    const auto = analyserCsvArbre(csv('A;Unité A;groupe;A;;;;;'));
    expect(codes(auto)).toContain('CYCLE');
    expect(auto.lignes).toEqual([]);
  });

  it('un cycle long (A → B → C → D → A) est détecté, et les lignes hors cycle restent valides', () => {
    const analyse = analyserCsvArbre(
      csv(
        'A;A;groupe;D;;;;;',
        'B;B;filiale;A;;;;;',
        'C;C;etablissement;B;;;;;',
        'D;D;direction;C;;;;;',
        'R;Racine saine;groupe;;;;;;',
      ),
    );
    expect(codes(analyse)).toContain('CYCLE');
    expect(analyse.lignes.map((l) => l.ref)).toContain('R');
  });

  it('un arbre profond (10 niveaux) est accepté : la profondeur est LIBRE (E4)', () => {
    const lignes = Array.from({ length: 10 }, (_, i) =>
      i === 0
        ? `n0;Niveau 0;groupe;;;;;;`
        : `n${String(i)};Niveau ${String(i)};service;n${String(i - 1)};;;;;`,
    );
    const analyse = analyserCsvArbre(csv(...lignes));
    attendreValide(analyse);
    expect(analyse.lignes[9]?.parentIndice).toBe(8);
  });
});

// -----------------------------------------------------------------------------
// LA BORNE DE VOLUME
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — LIGNES_CSV_ARBRE_MAX', () => {
  function fichierDe(n: number): string {
    return csv(
      ...Array.from({ length: n }, (_, i) => `${String(i)};Unité ${String(i)};poste;;;;;;`),
    );
  }

  it('@critique 5 001 enregistrements ⇒ TROP_DE_LIGNES et aucune ligne rendue', () => {
    // Attrape : un `>` posé pour un `>=` (5 000 refusées), ou l'absence de borne.
    expect(LIGNES_CSV_ARBRE_MAX).toBe(5000);
    const analyse = analyserCsvArbre(fichierDe(LIGNES_CSV_ARBRE_MAX + 1));
    expect(codes(analyse)).toContain('TROP_DE_LIGNES');
    expect(analyse.lignes).toEqual([]);
  });

  it('exactement 5 000 enregistrements passent', () => {
    const analyse = analyserCsvArbre(fichierDe(LIGNES_CSV_ARBRE_MAX));
    attendreValide(analyse);
    expect(analyse.lignes).toHaveLength(LIGNES_CSV_ARBRE_MAX);
  });

  it('les lignes vides ne comptent pas dans la borne : 5 000 enregistrements + 10 lignes vides passent', () => {
    const contenu = `${fichierDe(LIGNES_CSV_ARBRE_MAX)}\n${'\n'.repeat(10)}`;
    const analyse = analyserCsvArbre(contenu);
    attendreValide(analyse);
    expect(analyse.lignesVidesIgnorees).toBeGreaterThanOrEqual(10);
  });
});

// -----------------------------------------------------------------------------
// PURETÉ ET FORME DU RAPPORT
// -----------------------------------------------------------------------------

describe('analyserCsvArbre — pureté et forme du rapport', () => {
  it('deux analyses du même contenu rendent le même JSON', () => {
    const contenu = csv(
      '1;Unité;groupe;;;;;;',
      '2;;service;1;;FRA;;;',
      '',
      '3;Fille;service;9;;;;;',
    );
    expect(JSON.stringify(analyserCsvArbre(contenu))).toBe(
      JSON.stringify(analyserCsvArbre(contenu)),
    );
  });

  it('chaque erreur porte un `message` français non vide et un `code` de la liste fermée', () => {
    const analyse = analyserCsvArbre(
      csv('1;;departement;;FRA;x;;;Nulle/Part', '1;Bis;groupe;;;;;;', '2;Fille;service;9;;;;;'),
    );
    expect(analyse.erreurs.length).toBeGreaterThanOrEqual(5);
    for (const e of analyse.erreurs) {
      expect(e.message.trim().length).toBeGreaterThan(0);
      expect(e.ligne).toBeGreaterThanOrEqual(LIGNE_ENTETE_CSV);
      expect(e.colonne === null || COLONNES_CSV_ARBRE.includes(e.colonne)).toBe(true);
    }
  });
});
