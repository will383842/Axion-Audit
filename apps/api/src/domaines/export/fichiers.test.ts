// =============================================================================
// TESTS DES FICHIERS DE L'EXPORT — écrits AVANT `fichiers.ts`. L7c.
//
// ⚠ Tests d'A30 (CONCEPTION, TDD). Aucun `@critique` : l'acceptation du §36.3 —
// « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP » — revient à A36
// (09 §5.6, décision du 2026-09-05).
//
// CE QUE CES TESTS TIENNENT, et qui n'est pas cosmétique :
//   · l'ORDRE de `reponses.csv` (bloc → unité → question), parce que c'est dans
//     cet ordre qu'un rapport se rédige, chapitre par chapitre ;
//   · les unités HORS PÉRIMÈTRE dans le MÊME fichier, marquées — « jamais deux
//     fichiers de réponses » (§36.3, V2.8) ;
//   · la JOINTURE constat → réponse, sans laquelle le §36.6-2 (« tout chiffre du
//     rapport est retrouvable dans reponses.csv ») n'est qu'une intention ;
//   · la PORTE du nom du répondant : masqué par défaut, masqué si le consentement
//     est nul ou faux, écrit seulement si les deux conditions sont réunies.
//
// Traçabilité : E14 · E22 · E36.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { SEPARATEUR_LISTE_CELLULE } from '@axion/shared';
import {
  assemblerLignesArbre,
  ecrireArbre,
  ecrireCasUsage,
  ecrireConstats,
  ecrireInventaireOutils,
  ecrireManifestePiecesJointes,
  ecrireRegistreIa,
  ecrireReponses,
  ecrireSessions,
  ecrireUnitesHorsPerimetre,
  type LigneArbreExport,
  type LigneConstatExport,
  type LigneReponseExport,
  type LigneSessionExport,
} from './fichiers.js';

const FUSEAU = 'Europe/Paris';
/** Le fuseau d'un SITE distant — M-1 : une archive n'a pas UN fuseau, elle en a un par site. */
const FUSEAU_SINGAPOUR = 'Asia/Singapore';

/** Identifiants SYNTHÉTIQUES (invariant 2 : aucune référence client, même en test). */
const U1 = '01890000-0000-7000-8000-000000000001';
const U2 = '01890000-0000-7000-8000-000000000002';
const S1 = '01890000-0000-7000-8000-0000000000a1';
const A1 = '01890000-0000-7000-8000-0000000000b1';
const A2 = '01890000-0000-7000-8000-0000000000b2';

function lignes(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((l) => l !== '');
}

function colonnes(ligne: string): string[] {
  return ligne.split(';');
}

// -----------------------------------------------------------------------------

const ARBRE: LigneArbreExport[] = [
  {
    id: U1,
    nom: 'Direction générale',
    kind: 'entreprise',
    parentId: null,
    parentNom: null,
    chemin: 'Direction générale',
    effectif: 120,
    inScope: true,
    statut: 'valide',
    fuseau: FUSEAU,
    sessionsPrevues: 3,
    sessionsRealisees: 2,
  },
  {
    id: U2,
    nom: 'Atelier Nord',
    kind: 'etablissement',
    parentId: U1,
    parentNom: 'Direction générale',
    chemin: 'Direction générale > Atelier Nord',
    effectif: 40,
    inScope: false,
    statut: 'valide',
    fuseau: FUSEAU,
    sessionsPrevues: 1,
    sessionsRealisees: 1,
  },
];

describe('arbre.csv — la structure, avec sa couverture (§36.3)', () => {
  it('porte les colonnes du §36.3 : ref, nom, kind, parent, effectif, in_scope, sessions', () => {
    const entete = colonnes(lignes(ecrireArbre(ARBRE))[0] ?? '');
    expect(entete).toContain('unite_id');
    expect(entete).toContain('nom');
    expect(entete).toContain('kind');
    expect(entete).toContain('parent_id');
    expect(entete).toContain('effectif');
    expect(entete).toContain('unite_in_scope');
    expect(entete).toContain('sessions_prevues');
    expect(entete).toContain('sessions_realisees');
  });

  it('écrit `oui` / `non` pour l’appartenance au périmètre, jamais `true`', () => {
    const corps = lignes(ecrireArbre(ARBRE)).slice(1);
    expect(corps[0]).toContain(';oui;');
    expect(corps[1]).toContain(';non;');
  });

  it('rend un fichier PRÉSENT même sans aucune unité — l’en-tête suffit à le dire', () => {
    expect(lignes(ecrireArbre([]))).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------

function session(sur: Partial<LigneSessionExport> = {}): LigneSessionExport {
  return {
    id: S1,
    fuseau: FUSEAU,
    kind: 'entretien',
    mode: 'sur_site',
    orgUnitId: U1,
    orgUnitNom: 'Direction générale',
    fonctionPersonne: 'Responsable de production',
    servicePersonne: 'Production',
    nomPersonne: null,
    consentement: true,
    auditeurNom: 'A. Consultant',
    planifieeLe: new Date('2026-10-14T07:30:00.000Z'),
    dureePrevueMin: 90,
    statutPlanification: 'realise',
    statut: 'termine',
    debutLe: new Date('2026-10-14T07:32:00.000Z'),
    finLe: new Date('2026-10-14T09:02:00.000Z'),
    notesGenerales: null,
    ...sur,
  };
}

describe('sessions.csv — « entretiens menés » du chapitre méthodologie (§20.3-3)', () => {
  it('écrit l’horodatage dans le fuseau de MISSION, avec son décalage', () => {
    const ligne = lignes(ecrireSessions([session()]))[1] ?? '';
    expect(ligne).toContain('2026-10-14T09:30:00+02:00');
  });

  it('calcule la durée réelle en minutes — le chiffrage M9 s’en nourrit', () => {
    const entete = colonnes(lignes(ecrireSessions([session()]))[0] ?? '');
    const ligne = colonnes(lignes(ecrireSessions([session()]))[1] ?? '');
    expect(ligne[entete.indexOf('duree_reelle_min')]).toBe('90');
  });

  it('laisse la durée réelle VIDE quand la session n’est pas terminée', () => {
    const sansFin = session({ finLe: null, statut: 'en_cours' });
    const entete = colonnes(lignes(ecrireSessions([sansFin]))[0] ?? '');
    const ligne = colonnes(lignes(ecrireSessions([sansFin]))[1] ?? '');
    expect(ligne[entete.indexOf('duree_reelle_min')]).toBe('');
  });

  it('n’écrit AUCUN nom de personne quand le dépôt n’en a pas transmis', () => {
    const csv = ecrireSessions([session()]);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const ligne = colonnes(lignes(csv)[1] ?? '');
    expect(ligne[entete.indexOf('nom_repondant')]).toBe('');
  });

  it('écrit le nom quand le dépôt l’a transmis — la porte est en amont', () => {
    const csv = ecrireSessions([session({ nomPersonne: 'Camille Martin' })]);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const ligne = colonnes(lignes(csv)[1] ?? '');
    expect(ligne[entete.indexOf('nom_repondant')]).toBe('Camille Martin');
  });
});

// -----------------------------------------------------------------------------

function reponse(sur: Partial<LigneReponseExport> = {}): LigneReponseExport {
  return {
    answerId: A1,
    sessionId: S1,
    fuseau: FUSEAU,
    blocCode: 'bloc_2',
    blocLibelle: 'Processus',
    blocPosition: 2,
    questionCode: 'Q-B2-001',
    questionTexte: 'Combien de temps prend la saisie des commandes ?',
    questionPosition: 10,
    criticite: 'majeur',
    poids: '2',
    typeReponse: 'scale_1_5',
    sourceAttendue: 'entretien',
    orgUnitId: U1,
    orgUnitNom: 'Direction générale',
    orgUnitInScope: true,
    sessionKind: 'entretien',
    sessionMode: 'sur_site',
    provenance: 'entretien',
    fonctionRepondant: 'Responsable de production',
    serviceRepondant: 'Production',
    nomRepondant: null,
    valeur: { type: 'scale_1_5', v: 3 },
    optionsSnapshot: null,
    nonCommunique: false,
    motifNonCommunique: null,
    sansObjet: false,
    motifSansObjet: null,
    aRevoir: false,
    motifARevoir: null,
    horsParcours: false,
    note: null,
    revision: 1,
    misAJourLe: new Date('2026-10-14T07:30:00.000Z'),
    ...sur,
  };
}

describe('reponses.csv — LE fichier central (§36.3)', () => {
  it('porte `answer_id` et `session_id` en tête : c’est ce que les constats citent', () => {
    const entete = colonnes(lignes(ecrireReponses([reponse()]))[0] ?? '');
    expect(entete[0]).toBe('answer_id');
    expect(entete[1]).toBe('session_id');
  });

  it('trie bloc → unité → question, l’ordre dans lequel un rapport se rédige', () => {
    const csv = ecrireReponses([
      reponse({ answerId: A2, blocCode: 'bloc_3', blocPosition: 3, orgUnitNom: 'A' }),
      reponse({ answerId: A1, blocCode: 'bloc_2', blocPosition: 2, orgUnitNom: 'Z' }),
    ]);
    const corps = lignes(csv).slice(1);
    expect(corps[0]).toContain('bloc_2');
    expect(corps[1]).toContain('bloc_3');
  });

  it('aplatit la valeur en texte lisible — jamais du JSON de base', () => {
    const ligne = lignes(ecrireReponses([reponse()]))[1] ?? '';
    expect(ligne).toContain('3 / 5');
  });

  it('rend une fourchette « 20 – 30 », comme le §36.3 l’écrit', () => {
    const ligne =
      lignes(ecrireReponses([reponse({ valeur: { type: 'range', low: 20, high: 30 } })]))[1] ?? '';
    expect(ligne).toContain('20 – 30');
  });

  it('garde les réponses des unités HORS PÉRIMÈTRE, marquées — jamais deux fichiers', () => {
    const csv = ecrireReponses([reponse({ orgUnitInScope: false })]);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const ligne = colonnes(lignes(csv)[1] ?? '');
    expect(lignes(csv)).toHaveLength(2);
    expect(ligne[entete.indexOf('unite_in_scope')]).toBe('non');
  });

  it('distingue non communiqué, sans objet et à revoir — trois colonnes, trois motifs', () => {
    const csv = ecrireReponses([
      reponse({
        valeur: null,
        nonCommunique: true,
        motifNonCommunique: 'confidentiel',
        aRevoir: true,
        motifARevoir: 'à recouper avec la DAF',
      }),
    ]);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const ligne = colonnes(lignes(csv)[1] ?? '');
    expect(ligne[entete.indexOf('non_communique')]).toBe('oui');
    expect(ligne[entete.indexOf('motif_non_communique')]).toBe('Confidentiel');
    expect(ligne[entete.indexOf('sans_objet')]).toBe('non');
    expect(ligne[entete.indexOf('a_revoir')]).toBe('oui');
    expect(ligne[entete.indexOf('valeur')]).toBe('');
  });

  it('n’expose AUCUNE colonne de score tant que L8 n’est pas livré', () => {
    const entete = colonnes(lignes(ecrireReponses([reponse()]))[0] ?? '');
    expect(entete.some((c) => c.includes('score'))).toBe(false);
  });

  it('ne porte le nom du répondant que si le dépôt l’a transmis', () => {
    const sans = colonnes(lignes(ecrireReponses([reponse()]))[1] ?? '');
    const avec = colonnes(
      lignes(ecrireReponses([reponse({ nomRepondant: 'Camille Martin' })]))[1] ?? '',
    );
    const entete = colonnes(lignes(ecrireReponses([reponse()]))[0] ?? '');
    expect(sans[entete.indexOf('nom_repondant')]).toBe('');
    expect(avec[entete.indexOf('nom_repondant')]).toBe('Camille Martin');
  });
});

// -----------------------------------------------------------------------------

describe('reponses.csv et sessions.csv — un fuseau PAR SITE (M-1, §22.2)', () => {
  it('date deux lignes de deux sites dans DEUX fuseaux différents', () => {
    // Le défaut que ce test ferme : un entretien tenu à 16 h 40 à Singapour
    // s'écrivait « 10:40+02:00 » — instant exact, heure fausse pour le rapport.
    const csv = ecrireReponses([
      reponse({ answerId: A1, orgUnitNom: 'Siège', fuseau: FUSEAU }),
      reponse({ answerId: A2, orgUnitNom: 'Usine', fuseau: FUSEAU_SINGAPOUR }),
    ]);
    const corps = lignes(csv).slice(1);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const horodatage = (i: number) => colonnes(corps[i] ?? '')[entete.indexOf('horodatage')];

    expect(horodatage(0)).toBe('2026-10-14T09:30:00+02:00');
    expect(horodatage(1)).toBe('2026-10-14T15:30:00+08:00');
  });

  it('date les sessions au fuseau du site, pas à celui du siège', () => {
    const csv = ecrireSessions([session({ fuseau: FUSEAU_SINGAPOUR })]);
    expect(lignes(csv)[1]).toContain('+08:00');
  });

  it('publie le fuseau EFFECTIF de chaque unité dans arbre.csv', () => {
    // Sans cette colonne, un lecteur qui voit deux décalages dans sessions.csv
    // n'a aucun moyen de savoir pourquoi.
    const entete = colonnes(lignes(ecrireArbre(ARBRE))[0] ?? '');
    expect(entete).toContain('fuseau');
  });
});

describe('constats.csv — la citation d’une source est vérifiable (§36.6-2)', () => {
  const constat: LigneConstatExport = {
    id: '01890000-0000-7000-8000-0000000000c1',
    fuseau: FUSEAU,
    orgUnitId: U1,
    orgUnitNom: 'Direction générale',
    blocCode: 'bloc_2',
    severite: 'majeur',
    titre: 'Double saisie des commandes',
    enonce: 'La commande est ressaisie dans deux outils.',
    sources: { answer_ids: [A1, A2], session_ids: [S1], attachment_ids: [] },
    recommandation: null,
    responsableSuggere: null,
    statutRemediation: 'ouvert',
    vague: 'quick_win',
    statut: 'valide',
    creeLe: new Date('2026-10-14T07:30:00.000Z'),
    misAJourLe: new Date('2026-10-14T07:30:00.000Z'),
  };

  it('éclate `sources` en trois colonnes de listes séparées par une barre', () => {
    const csv = ecrireConstats([constat]);
    const entete = colonnes(lignes(csv)[0] ?? '');
    const ligne = colonnes(lignes(csv)[1] ?? '');
    expect(ligne[entete.indexOf('sources_reponses')]).toBe(`${A1}${SEPARATEUR_LISTE_CELLULE}${A2}`);
    expect(ligne[entete.indexOf('sources_sessions')]).toBe(S1);
    expect(ligne[entete.indexOf('sources_pieces_jointes')]).toBe('');
  });

  it('les identifiants cités se retrouvent tels quels dans reponses.csv', () => {
    // C'est TOUT le §36.6-2 : la citation doit être un RECHERCHEV, pas une
    // promesse. On le vérifie sur les deux fichiers, ensemble.
    const constats = lignes(ecrireConstats([constat]))[1] ?? '';
    const reponses = ecrireReponses([reponse({ answerId: A1 }), reponse({ answerId: A2 })]);
    for (const identifiant of [A1, A2]) {
      expect(constats).toContain(identifiant);
      expect(reponses).toContain(identifiant);
    }
  });

  it('supporte un `sources` malformé sans faire tomber l’export', () => {
    const abime = { ...constat, sources: 'ceci n’est pas un objet' };
    expect(() => ecrireConstats([abime])).not.toThrow();
  });
});

// -----------------------------------------------------------------------------

describe('les fichiers d’annexe — présents même vides, jamais absents', () => {
  it.each([
    ['cas_usage', () => ecrireCasUsage([])],
    ['inventaire_outils', () => ecrireInventaireOutils([])],
    ['registre_ia', () => ecrireRegistreIa([])],
    ['unites_hors_perimetre', () => ecrireUnitesHorsPerimetre([])],
    ['manifest', () => ecrireManifestePiecesJointes([])],
  ])('%s porte son en-tête et rien d’autre quand il n’y a rien', (_nom, ecrire) => {
    const contenu = lignes(ecrire());
    expect(contenu).toHaveLength(1);
    expect(contenu[0]?.length).toBeGreaterThan(0);
  });

  it('unites_hors_perimetre ne liste QUE les unités sorties du périmètre', () => {
    const corps = lignes(ecrireUnitesHorsPerimetre(ARBRE)).slice(1);
    expect(corps).toHaveLength(1);
    expect(corps[0]).toContain('Atelier Nord');
  });
});

// -----------------------------------------------------------------------------

describe('assemblerLignesArbre — le chemin, et les comptes de sessions', () => {
  const BRUTES = [
    {
      id: U1,
      nom: 'Groupe',
      kind: 'entreprise',
      parentId: null,
      effectif: 500,
      inScope: true,
      statut: 'valide',
    },
    {
      id: U2,
      nom: 'Usine Nord',
      kind: 'etablissement',
      parentId: U1,
      effectif: 80,
      inScope: true,
      statut: 'valide',
    },
  ];

  it('construit le chemin complet, du sommet à la feuille', () => {
    const lignesArbre = assemblerLignesArbre(BRUTES, [], () => FUSEAU);
    expect(lignesArbre[0]?.chemin).toBe('Groupe');
    expect(lignesArbre[1]?.chemin).toBe('Groupe > Usine Nord');
  });

  it('compte 0 et 0 pour une unité sans session — jamais une cellule vide', () => {
    const lignesArbre = assemblerLignesArbre(BRUTES, [], () => FUSEAU);
    expect(lignesArbre[0]?.sessionsPrevues).toBe(0);
    expect(lignesArbre[0]?.sessionsRealisees).toBe(0);
  });

  it('reporte les comptes de la couverture sur la bonne unité', () => {
    const lignesArbre = assemblerLignesArbre(
      BRUTES,
      [{ orgUnitId: U2, planifiees: 4, realisees: 3 }],
      () => FUSEAU,
    );
    expect(lignesArbre[1]?.sessionsPrevues).toBe(4);
    expect(lignesArbre[1]?.sessionsRealisees).toBe(3);
  });

  it('ne boucle pas sur un arbre CYCLIQUE — un export ne fige jamais le serveur', () => {
    const cycle = [
      {
        id: U1,
        nom: 'A',
        kind: 'service',
        parentId: U2,
        effectif: null,
        inScope: true,
        statut: 'valide',
      },
      {
        id: U2,
        nom: 'B',
        kind: 'service',
        parentId: U1,
        effectif: null,
        inScope: true,
        statut: 'valide',
      },
    ];
    const lignesArbre = assemblerLignesArbre(cycle, [], () => FUSEAU);
    expect(lignesArbre).toHaveLength(2);
    expect(lignesArbre[0]?.chemin.length).toBeGreaterThan(0);
  });
});
