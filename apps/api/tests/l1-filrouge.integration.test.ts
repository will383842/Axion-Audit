// =============================================================================
// FIL ROUGE CUMULATIF — LOT L1 (09 §4bis, 07 §12 et §13)
//
// « Deux missions canoniques en fixtures DÈS L1 — FIL-TPE (micro, 8 pers.,
// 1 entretien) et FIL-GC (grand compte fictif : arbre 150 unités / 4 niveaux,
// 60 sessions, ~8 000 réponses générées par script) ; un test @filrouge rejoue à
// chaque merge le parcours de bout en bout disponible à date, sur LES DEUX
// échelles ; toute porte l'exige vert. »
//
// CE QUE CE TEST EST, ET CE QU'IL N'EST PAS ENCORE.
// Au lot L1, il n'existe ni route, ni écran, ni moteur de sync : le parcours
// « disponible à date » s'arrête au schéma. Ce test pose donc les deux missions
// ENTIÈREMENT et prouve qu'elles tiennent aux deux échelles — y compris que
// l'unicité answers(interview_id, mission_question_id) tient sur 8 100 lignes,
// ce qu'aucun test à deux lignes ne montre. Les lots suivants ALLONGENT ce
// parcours (L3 questionnaire, L5 terrain, L6 sync, L8 scoring) ; ils ne le
// réécrivent pas.
//
// L3 A ALLONGÉ LE PARCOURS : `l3-filrouge.integration.test.ts` joue, PAR LES
// ROUTES, création d'entreprise et de mission → import de l'arbre §35.2 (FIL-GC :
// 150 unités sur 4 niveaux) → prévisualisation §33.4 → figeage M2, sur les deux
// fixtures. Ce fichier-ci ne bouge pas : il reste la preuve « schéma seul ».
//
// Marqué @filrouge : jamais skippable (09 §5.7, DoD transverse).
// =============================================================================
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
} from './aide/base-l1.js';
import {
  FIL_GC,
  FIL_TPE,
  genererFilGc,
  genererFilTpe,
  type MissionCanonique,
} from './aide/fil-rouge.js';

let nomBase = '';
let client: Client | undefined;
let tpe: MissionCanonique;
let gc: MissionCanonique;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('filrouge');
  nomBase = base.nom;
  client = await connecter(base.url);
  await appliquerMontee(base.url);

  tpe = await genererFilTpe(client);
  gc = await genererFilGc(client);
}, 300_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

describe('@filrouge parcours de bout en bout disponible au lot L1 (09 §4bis)', () => {
  it("@filrouge la mission FIL-TPE tient à l'échelle micro : 8 personnes, 1 unité, 1 entretien, 30 réponses", async () => {
    expect(tpe.unites, `FIL-TPE doit compter UNE unité (micro mono-site, 01 §2.3).`).toBe(1);
    expect(tpe.entretiens, `FIL-TPE : ${String(FIL_TPE.entretiens)} entretien dirigeant.`).toBe(
      FIL_TPE.entretiens,
    );
    expect(
      tpe.reponses,
      `FIL-TPE : ${String(FIL_TPE.questions)} réponses attendues (1 entretien × ${String(FIL_TPE.questions)} questions).`,
    ).toBe(FIL_TPE.entretiens * FIL_TPE.questions);

    const effectif = await bd().query<{ headcount: number | null }>(
      `SELECT headcount FROM companies WHERE id = $1`,
      [tpe.entrepriseId],
    );
    expect(
      effectif.rows[0]?.headcount,
      `FIL-TPE porte un effectif de ${String(FIL_TPE.effectif)} personnes (palier micro : 1-10).`,
    ).toBe(FIL_TPE.effectif);
  });

  it("@filrouge la mission FIL-GC tient à l'échelle grand compte : 150 unités sur 4 niveaux, 60 sessions, ~8 000 réponses", async () => {
    expect(
      gc.unites,
      `FIL-GC doit compter ${String(FIL_GC.unites)} unités (09 §4bis : arbre 150 unités).`,
    ).toBe(FIL_GC.unites);
    expect(gc.entretiens, `FIL-GC : ${String(FIL_GC.entretiens)} sessions.`).toBe(
      FIL_GC.entretiens,
    );
    expect(
      gc.reponses,
      `FIL-GC : ~8 000 réponses attendues, ${String(FIL_GC.reponses)} générées.`,
    ).toBe(FIL_GC.reponses);

    const compte = await bd().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM answers a
       JOIN interviews i ON i.id = a.interview_id
       WHERE i.mission_id = $1`,
      [gc.missionId],
    );
    expect(
      Number(compte.rows[0]?.n ?? '0'),
      `Les réponses de FIL-GC ne sont pas toutes en base. La volumétrie n'est pas\n` +
        `décorative : c'est elle qui révèle un index manquant ou une contrainte qui\n` +
        `s'effondre à l'échelle, longtemps avant la mission réelle d'un grand compte.`,
    ).toBe(FIL_GC.reponses);
  });

  it("@filrouge l'arbre d'unités de FIL-GC a bien 4 niveaux de profondeur (§26.3)", async () => {
    const profondeur = await bd().query<{ profondeur: string }>(
      `WITH RECURSIVE arbre AS (
         SELECT id, 1 AS niveau FROM org_units
          WHERE mission_id = $1 AND parent_id IS NULL
         UNION ALL
         SELECT u.id, a.niveau + 1 FROM org_units u
           JOIN arbre a ON u.parent_id = a.id
       )
       SELECT max(niveau)::text AS profondeur FROM arbre`,
      [gc.missionId],
    );

    expect(
      Number(profondeur.rows[0]?.profondeur ?? '0'),
      `L'arbre de FIL-GC doit descendre sur ${String(FIL_GC.niveaux)} niveaux\n` +
        `(groupe → filiale → direction → service, 04 §7 org_units.kind, §26.3).\n` +
        `Une hiérarchie qui s'aplatit à la génération ne teste plus le roll-up de\n` +
        `scores par unité (unit_scores) ni la consolidation groupe (§32.3).`,
    ).toBe(FIL_GC.niveaux);
  });

  it("@filrouge l'unicité answers(interview_id, mission_question_id) tient sur les deux missions", async () => {
    const doublons = await bd().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM (
         SELECT interview_id, mission_question_id
         FROM answers GROUP BY interview_id, mission_question_id HAVING count(*) > 1
       ) AS d`,
    );

    expect(
      Number(doublons.rows[0]?.n ?? '0'),
      `Des couples (interview_id, mission_question_id) apparaissent plusieurs fois\n` +
        `alors que ${String(FIL_TPE.entretiens * FIL_TPE.questions + FIL_GC.reponses)} réponses ont été insérées sur les deux missions.\n` +
        `04 §7 (V2.2 §32.6) : UNE réponse par question et par session ; toute re-réponse\n` +
        `est une révision. Prouvé ici À L'ÉCHELLE, pas seulement sur deux lignes.`,
    ).toBe(0);
  });

  it('@filrouge les deux missions coexistent sans se mélanger — le cloisonnement par mission tient', async () => {
    const repartition = await bd().query<{ mission_id: string; unites: string; sessions: string }>(
      `SELECT m.id AS mission_id,
              (SELECT count(*)::text FROM org_units o WHERE o.mission_id = m.id) AS unites,
              (SELECT count(*)::text FROM interviews i WHERE i.mission_id = m.id) AS sessions
       FROM missions m WHERE m.id = ANY($1::uuid[]) ORDER BY m.created_at`,
      [[tpe.missionId, gc.missionId]],
    );

    const parMission = new Map(
      repartition.rows.map((l) => [
        l.mission_id,
        { unites: Number(l.unites), sessions: Number(l.sessions) },
      ]),
    );

    expect(
      parMission.get(tpe.missionId),
      `FIL-TPE doit rester à 1 unité et 1 session malgré la présence de FIL-GC dans la\n` +
        `même base. Un compteur qui déborde d'une mission sur l'autre est le défaut que\n` +
        `le fil rouge « aux DEUX échelles » existe pour attraper : il ne se voit jamais\n` +
        `quand on ne teste qu'une seule mission à la fois.`,
    ).toEqual({ unites: 1, sessions: FIL_TPE.entretiens });

    expect(
      parMission.get(gc.missionId),
      `FIL-GC doit porter ses ${String(FIL_GC.unites)} unités et ses ${String(FIL_GC.entretiens)} sessions.`,
    ).toEqual({ unites: FIL_GC.unites, sessions: FIL_GC.entretiens });
  });
});
