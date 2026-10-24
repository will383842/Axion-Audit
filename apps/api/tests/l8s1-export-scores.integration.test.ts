// =============================================================================
// LOT S1 (L8 BRANCHÉ) — `scores.csv` DANS L'EXPORT DE MISSION (03 §36.3).
//
// ⚠ TESTS ÉCRITS AVANT LE CODE (09 §5.6). ROUGES pour la bonne raison : l'export
// livre aujourd'hui `scores: { presents: false }` et AUCUN `scores.csv`, même quand
// `block_scores` / `unit_scores` sont remplies.
//
// §36.3 : « `scores.csv` (bloc × unité + complétude + indicatif — si L8, sinon absent et
// signalé) ». Donc :
//   · aucun calcul fait → fichier ABSENT, `mission.json.scores.presents = false` + motif ;
//   · un calcul fait    → fichier PRÉSENT, `presents = true`, `motif = null`.
// Le contenu est vérifié LIGNE À LIGNE sur le jeu principal, calculé à la main (voir
// `aide/semis-scoring.ts`) ; le format est figé dans `aide/colonnes-scores-csv.ts`.
//
// L'archive est décompressée par le lecteur INDÉPENDANT `aide/archive-export.ts`.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cellulesDeLigne,
  lignesDuCsv,
  lireArchiveExport,
  texteDuFichier,
  type ArchiveLue,
} from './aide/archive-export.js';
import { COLONNES_SCORES_CSV, ENTETE_SCORES_CSV } from './aide/colonnes-scores-csv.js';
import {
  calculer,
  corrigerReponse,
  creerCompte,
  demarrerContexte,
  ipUnique,
  rattacher,
  semerJeuPrincipal,
  semerMission,
  type Contexte,
  type JeuPrincipal,
} from './aide/semis-scoring.js';
import {
  detecterSentinelles,
  NOMS_FINANCIERS_INTERDITS,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
} from './aide/sentinelle-financiere.js';
import { uuidv7 } from './aide/base-l1.js';

let ctx: Contexte | undefined;
function c(): Contexte {
  if (ctx === undefined) throw new Error('contexte non démarré');
  return ctx;
}

beforeAll(async () => {
  ctx = await demarrerContexte('l8s1_export');
}, 300_000);

afterAll(async () => {
  if (ctx !== undefined) await ctx.fermer();
});

async function exporter(missionId: string, jeton: string): Promise<ArchiveLue> {
  const reponse = await c().api.inject({
    method: 'GET',
    url: `/v1/missions/${missionId}/export`,
    headers: { 'x-forwarded-for': ipUnique(), authorization: `Bearer ${jeton}` },
  });
  expect(reponse.statusCode, reponse.body).toBe(200);
  return lireArchiveExport(reponse.rawPayload);
}

interface MetaScores {
  scores: { presents: boolean; motif: string | null };
  fichiers: { nom: string }[];
}

function meta(archive: ArchiveLue): MetaScores {
  return JSON.parse(texteDuFichier(archive, 'mission.json')) as MetaScores;
}

async function libelleDeBloc(code: string): Promise<string> {
  const r = await c().bd.query<{ label_fr: string }>(
    'SELECT label_fr FROM blocks WHERE code = $1',
    [code],
  );
  const libelle = r.rows[0]?.label_fr;
  if (libelle === undefined) throw new Error(`bloc ${code} absent`);
  return libelle;
}

/** Une cellule CSV telle que l'écrivain l'échappe : entre guillemets si elle porte `;`, `"` ou un saut de ligne. */
function cellule(valeur: string): string {
  return /[;"\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur;
}

// =============================================================================
// 1. ABSENT AVEC MOTIF tant qu'aucun calcul n'a eu lieu
// =============================================================================
describe('@critique `scores.csv` absent et signalé quand rien n’est calculé (§36.3)', () => {
  it('@critique des réponses mais AUCUN calcul : pas de `scores.csv`, `presents=false`, un motif', async () => {
    const jeu = await semerJeuPrincipal(c());
    const archive = await exporter(jeu.mission.id, jeu.lead.jeton);

    expect(archive.has('scores.csv')).toBe(false);
    const m = meta(archive);
    expect(m.scores.presents).toBe(false);
    expect(m.scores.motif).toBeTruthy();
    expect(m.fichiers.map((f) => f.nom)).not.toContain('scores.csv');
    // VACUITÉ : l'archive contient bien les réponses — l'absence n'est pas une archive vide.
    expect(lignesDuCsv(archive, 'reponses.csv').length).toBeGreaterThan(10);
  });
});

// =============================================================================
// 2. PRÉSENT, CONTENU EXACT
// =============================================================================
describe('@critique `scores.csv` présent après calcul — contenu exact vérifié sur un cas calculé à la main', () => {
  let jeu: JeuPrincipal;
  let archive: ArchiveLue;
  let calculeLe: string;

  beforeAll(async () => {
    jeu = await semerJeuPrincipal(c());
    const calcul = await calculer(c(), jeu.mission.id, jeu.admin.jeton);
    expect(calcul.statut, calcul.texte).toBe(200);
    calculeLe = String(calcul.json?.calculeLe);
    archive = await exporter(jeu.mission.id, jeu.lead.jeton);
  });

  it('@critique le fichier est présent, `presents=true`, motif nul, et inventorié dans `mission.json`', () => {
    expect(archive.has('scores.csv')).toBe(true);
    const m = meta(archive);
    expect(m.scores.presents).toBe(true);
    expect(m.scores.motif).toBeNull();
    expect(m.fichiers.map((f) => f.nom)).toContain('scores.csv');
    // Les dix fichiers habituels y sont toujours : on en AJOUTE un, on n'en retire aucun.
    expect(archive.size).toBe(11);
  });

  it('@critique UTF-8 avec BOM, séparateur `;`, fin de ligne CRLF', () => {
    const octets = archive.get('scores.csv');
    expect(octets?.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const texte = texteDuFichier(archive, 'scores.csv');
    expect(texte).toContain('\r\n');
    expect(texte.replaceAll('\r\n', '')).not.toContain('\n');
    expect(texte.split('\r\n')[0]).toBe(ENTETE_SCORES_CSV);
    // Les accents « Unité » survivent à l'UTF-8 (pas de mojibake).
    expect(texte).toContain('Unité racine P');
  });

  it('@critique l’en-tête est exactement celui de la grille, dans l’ordre', () => {
    const lignes = lignesDuCsv(archive, 'scores.csv');
    expect(cellulesDeLigne(lignes[0] ?? '')).toEqual([...COLONNES_SCORES_CSV]);
  });

  it('@critique les lignes, une à une : portée mission puis unités dans l’ordre d’`arbre.csv`, blocs par position', async () => {
    const lignes = lignesDuCsv(archive, 'scores.csv');
    const libelle1 = cellule(await libelleDeBloc('bloc_1'));
    const libelle2 = cellule(await libelleDeBloc('bloc_2'));

    // L'ordre des unités est celui d'arbre.csv, lu dans l'archive elle-même.
    const arbre = lignesDuCsv(archive, 'arbre.csv');
    const enteteArbre = cellulesDeLigne(arbre[0] ?? '');
    const colId = enteteArbre.indexOf('unite_id');
    expect(colId).toBeGreaterThanOrEqual(0);
    const ordre = arbre.slice(1).map((l) => cellulesDeLigne(l)[colId]);
    expect(ordre).toEqual([jeu.unites.p, jeu.unites.a, jeu.unites.b]);

    const horodatage = new Date(calculeLe).toISOString();
    const attendu = [
      ENTETE_SCORES_CSV,
      // portée mission : un score d'entreprise par bloc actif
      `mission;;;bloc_1;${libelle1};2.32;${String(2 / 3)};non;${horodatage}`,
      `mission;;;bloc_2;${libelle2};1.67;${String(1 / 3)};oui;${horodatage}`,
      // portée unité : P (racine, lecture consolidée), A, B
      `unite;${jeu.unites.p};Unité racine P;bloc_1;${libelle1};2.32;${String(2 / 3)};non;${horodatage}`,
      `unite;${jeu.unites.p};Unité racine P;bloc_2;${libelle2};1.67;${String(1 / 3)};oui;${horodatage}`,
      `unite;${jeu.unites.a};Unité A;bloc_1;${libelle1};2.5;1;non;${horodatage}`,
      `unite;${jeu.unites.a};Unité A;bloc_2;${libelle2};1.67;1;non;${horodatage}`,
      `unite;${jeu.unites.b};Unité B;bloc_1;${libelle1};2.2;1;non;${horodatage}`,
      // B / bloc_2 : rien de cotable → score VIDE (jamais 0), complétude 0, indicatif
      `unite;${jeu.unites.b};Unité B;bloc_2;${libelle2};;0;oui;${horodatage}`,
    ];
    expect(lignes).toEqual(attendu);
  });

  it('@critique `calcule_le` est de l’UTC (suffixe Z) et vaut l’horodatage rendu par la route de calcul', () => {
    const lignes = lignesDuCsv(archive, 'scores.csv').slice(1);
    const colonne = COLONNES_SCORES_CSV.indexOf('calcule_le');
    for (const ligne of lignes) {
      const valeur = cellulesDeLigne(ligne)[colonne] ?? '';
      expect(valeur).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      expect(new Date(valeur).toISOString()).toBe(new Date(calculeLe).toISOString());
    }
  });

  it('@critique deux exports successifs rendent exactement le même `scores.csv`', async () => {
    const encore = await exporter(jeu.mission.id, jeu.lead.jeton);
    expect(encore.get('scores.csv')?.equals(archive.get('scores.csv') ?? Buffer.alloc(0))).toBe(
      true,
    );
  });

  it('@critique un consultant MEMBRE (non lead) lit lui aussi `scores.csv` : l’export reste une lecture de membre', async () => {
    const membre = await creerCompte(c(), 'consultant', 'export-scores-membre');
    await rattacher(c(), jeu.mission.id, membre.id, 'consultant');
    const vue = await exporter(jeu.mission.id, membre.jeton);
    expect(vue.has('scores.csv')).toBe(true);
  });
});

// =============================================================================
// 3. LE CSV SUIT LE DERNIER CALCUL
// =============================================================================
describe('@critique `scores.csv` suit le dernier calcul — une correction recalculée apparaît', () => {
  it('@critique après correction + nouveau calcul, le fichier porte 2,68 et plus 2,32', async () => {
    const jeu = await semerJeuPrincipal(c());
    await calculer(c(), jeu.mission.id, jeu.admin.jeton);
    await corrigerReponse(c(), jeu.reponses.a2q2, { type: 'scale_1_5', v: 4 });
    const second = await calculer(c(), jeu.mission.id, jeu.admin.jeton);
    expect(second.statut, second.texte).toBe(200);

    const archive = await exporter(jeu.mission.id, jeu.admin.jeton);
    const texte = texteDuFichier(archive, 'scores.csv');
    expect(texte).toContain(';2.68;');
    expect(texte).not.toContain(';2.32;');
    // Toujours 8 lignes de données : le remplacement n'a pas dupliqué.
    expect(lignesDuCsv(archive, 'scores.csv')).toHaveLength(9);
  });

  it('@critique une mission SANS calcul voisine d’une mission calculée n’hérite pas de ses scores', async () => {
    const calculee = await semerJeuPrincipal(c());
    const calcul = await calculer(c(), calculee.mission.id, calculee.admin.jeton);
    expect(calcul.statut, calcul.texte).toBe(200);
    const vierge = await semerMission(c());
    const admin = await creerCompte(c(), 'admin', 'export-vierge');
    const archive = await exporter(vierge.id, admin.jeton);
    expect(archive.has('scores.csv')).toBe(false);
    expect(meta(archive).scores.presents).toBe(false);
  });
});

// =============================================================================
// 4. INVARIANT 3 — l'archive ne porte aucun montant, scores présents ou non
// =============================================================================
describe('@critique invariant 3 — `scores.csv` et l’archive restent étanches aux montants', () => {
  it('@critique aucune sentinelle financière dans l’archive décompressée, `scores.csv` compris', async () => {
    const jeu = await semerJeuPrincipal(c());
    const cadrage = uuidv7();
    await c().bd.query(
      `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                      calendar_days, status, created_by)
       VALUES ($1, $2, $3, 18, 3, 30, 'brouillon', $4)`,
      [cadrage, jeu.mission.companyId, jeu.mission.id, jeu.admin.id],
    );
    await semerVoletFinancierSentinelle(c().bd, cadrage, jeu.admin.id);
    await calculer(c(), jeu.mission.id, jeu.admin.jeton);

    const archive = await exporter(jeu.mission.id, jeu.admin.jeton);
    expect(archive.has('scores.csv')).toBe(true); // VACUITÉ : on balaie bien le nouveau fichier
    for (const [nom, octets] of archive) {
      const texte = octets.toString('utf8');
      expect(detecterSentinelles(texte, VALEURS_SENTINELLES), `${nom} porte un montant`).toEqual(
        [],
      );
    }
    const scores = texteDuFichier(archive, 'scores.csv');
    for (const interdit of NOMS_FINANCIERS_INTERDITS) {
      expect(scores, `scores.csv nomme « ${interdit} »`).not.toContain(interdit);
    }
  });
});
