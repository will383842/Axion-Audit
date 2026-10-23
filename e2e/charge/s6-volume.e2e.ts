// =============================================================================
// SCÉNARIO 6 DU 05 §9.8 — 5 000 RÉPONSES + 200 PHOTOS EN FILE (L6c-2, VRAIE API)
//
// Une mission de plusieurs semaines hors ligne : 5 000 réponses et 200 photos dorment
// dans l'outbox d'une tablette. Le réseau revient ; la file doit se vider TOUTE SEULE,
// sans perte, sans doublon, sans geler l'écran. Le test prouve, sur la vraie API et le
// vrai stockage objet :
//   1. la mise en file est LOCALE (fixture `file-massive.ts` : code de production
//      `ecrireLocal` / `ecrirePieceAvecOctets`, vrai coffre) — aucun appel API pour la
//      fabriquer ;
//   2. au retour du réseau, l'outbox atteint 0 et chaque pièce passe « envoyée », en
//      MOINS DE 5 MINUTES ;
//   3. le siège porte 5 000 réponses (+1, la saisie faite pendant la vidange), UNE ligne
//      par id et par couple (session, question) : aucun doublon, aucune perte ;
//   4. les 200 photos sont assemblées dans MinIO : taille ET sha256 identiques à ceux
//      des octets plantés (calculés ici, hors du code de production), y compris les
//      photos à plusieurs morceaux ;
//   5. une saisie faite PENDANT la vidange s'affiche en MOINS DE 1 s.
//
// DÉTERMINISME : aucune minuterie du test — on attend des ÉTATS (comptes locaux, lignes
// du siège), jamais des délais. Les photos sont pseudo-aléatoires mais déterministes.
// BORNE DU PULL : le siège est « vieilli » avant le premier pull (`vieillir`).
// DÉCLENCHEUR : pas de bouton « Synchroniser maintenant » ; le retour du réseau
// (`setOffline(false)` → événement `online`, 05 §9.3) lance la montée.
//
// Photos « à plusieurs morceaux » : la compression de production (JPEG ≤ 2048 px) rend
// une photo d'atelier réelle bien plus petite que 5 Mio ; trois pièces synthétiques de
// 5,5 / 5,5 / 11 Mio sont plantées exprès pour exercer le découpage en 2 et 3 morceaux.
//
// Limite assumée (11 §7) : `context.setOffline` couvre le réseau ; les service workers
// iOS ne sont PAS couverts par Playwright (mode avion réel : à la main, P-C/P-E).
// Invariant 2 : mission et interlocuteur FICTIFS. Secrets factices.
// =============================================================================
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { avecBase, creerAuditeur, creerMission, uuidv7, vieillir } from '../banc/semis-serveur.js';
import { ouvrirAppareilSeme } from '../fixtures/appareil-seme.js';
import { compterLocal, OCTETS_PAR_MORCEAU, planterFileMassive } from '../fixtures/file-massive.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NB_SESSIONS_EN_VOLUME = 25;
const NB_QUESTIONS_EN_VOLUME = 200;
const NB_REPONSES = NB_SESSIONS_EN_VOLUME * NB_QUESTIONS_EN_VOLUME; // 5 000
const NB_PHOTOS = 200;
const PHOTOS_LOURDES = [
  Math.floor(1.1 * OCTETS_PAR_MORCEAU), // 5,5 Mio : 2 morceaux
  Math.floor(1.1 * OCTETS_PAR_MORCEAU),
  Math.floor(2.2 * OCTETS_PAR_MORCEAU), // 11 Mio : 3 morceaux
];

const QUESTION_SAISIE_VIVANTE = 'Quelle saisie faites-vous pendant que la file se vide ?';
const REPONSE_VIVANTE = 'Saisie faite pendant la vidange de la file.';
const NOM_INTERLOCUTEUR = 'Interlocuteur fictif scénario six';

const SEUIL_VIDANGE_MS = 5 * 60_000;
const SEUIL_AFFICHAGE_MS = 1_000;

/** Une mesure : écrite sur la sortie standard ET versée au rapport HTML (annotation). */
function mesure(texte: string): void {
  test.info().annotations.push({ type: 'mesure', description: texte });
  process.stdout.write(`${texte}
`);
}

interface SiegeVolume {
  readonly interviewVivanteId: string;
  readonly interviewIds: string[];
  readonly missionQuestionIds: string[];
}

/** Le siège : 25 sessions terminées, 200 questions, plus UNE session en cours et sa question. */
async function semerSiege(auditeurId: string, missionId: string): Promise<SiegeVolume> {
  const uniteId = uuidv7();
  const interviewVivanteId = uuidv7();
  const interviewIds = Array.from({ length: NB_SESSIONS_EN_VOLUME }, () => uuidv7());
  // La question n° 1 est celle de la saisie vivante ; les 200 suivantes portent le volume.
  const questionIds = Array.from({ length: NB_QUESTIONS_EN_VOLUME + 1 }, () => uuidv7());
  const missionQuestionIds = Array.from({ length: NB_QUESTIONS_EN_VOLUME + 1 }, () => uuidv7());
  const textes = questionIds.map((_, i) =>
    i === 0 ? QUESTION_SAISIE_VIVANTE : `Question de volume n° ${String(i)} de la mission.`,
  );

  await avecBase(async (bd) => {
    const bloc = await bd.query<{ id: string }>('SELECT id FROM blocks ORDER BY code LIMIT 1');
    const blocId = bloc.rows[0]?.id;
    if (blocId === undefined) throw new Error('le seed des référentiels ne contient aucun bloc');
    await bd.query(
      `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                              created_at, updated_at)
       VALUES ($1, $2, NULL, 'service', 'Atelier fictif six', true, 'active', now(), now())`,
      [uniteId, missionId],
    );
    await bd.query(
      `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                              created_at, updated_at)
       SELECT q.id, $1::uuid, 1, 'active', q.texte, 'free_text', 'banque', now(), now()
         FROM unnest($2::uuid[], $3::text[]) AS q(id, texte)`,
      [blocId, questionIds, textes],
    );
    await bd.query(
      `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                      answer_type_snapshot, criticality_snapshot, position, added_ad_hoc)
       SELECT m.id, $1::uuid, m.question_id, 1, m.texte, 'free_text', 'important', m.position, false
         FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::int[])
              AS m(id, question_id, texte, position)`,
      [missionId, missionQuestionIds, questionIds, textes, textes.map((_, i) => i + 1)],
    );
    // Les 25 sessions du volume : terminées, à l'auditeur de l'appareil.
    await bd.query(
      `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                               schedule_status, status, person_name, consent_given, consented_at,
                               scheduled_at, started_at, ended_at, client_created_at,
                               client_updated_at, created_at, updated_at)
       SELECT i.id, $1::uuid, $2::uuid, 'entretien', 'sur_site', $3::uuid,
              'realise', 'termine', 'Interlocuteur fictif volume', true, now(),
              now() - interval '3 hours', now() - interval '2 hours', now() - interval '1 hour',
              now(), now(), now(), now()
         FROM unnest($4::uuid[]) AS i(id)`,
      [missionId, auditeurId, uniteId, interviewIds],
    );
    await bd.query(
      `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                               schedule_status, status, person_name, consent_given, consented_at,
                               scheduled_at, started_at, client_created_at, client_updated_at,
                               created_at, updated_at)
       VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', $5, true, now(),
               now() - interval '2 minutes', now() - interval '1 minute', now(), now(), now(), now())`,
      [interviewVivanteId, missionId, auditeurId, uniteId, NOM_INTERLOCUTEUR],
    );
  });
  // Le premier pull borne à now() - 60 s : sans ce recul, il ne verrait RIEN du semis.
  await vieillir(missionId);
  return {
    interviewVivanteId,
    interviewIds,
    // Les 200 questions du volume (la n° 1 est réservée à la saisie vivante).
    missionQuestionIds: missionQuestionIds.slice(1),
  };
}

interface ClientMinio {
  getObject(bucket: string, cle: string): Promise<AsyncIterable<Buffer>>;
}

/** Le client MinIO du banc, résolu depuis `apps/api` (aucune dépendance neuve à la racine). */
function clientMinio(): ClientMinio {
  const requireApi = createRequire(resolve(RACINE, 'apps', 'api', 'package.json'));
  const { Client } = requireApi('minio') as { Client: new (options: object) => ClientMinio };
  const variable = (nom: string): string => {
    const valeur = process.env[nom];
    if (valeur === undefined || valeur === '') throw new Error(`${nom} absente : banc non démarré`);
    return valeur;
  };
  return new Client({
    endPoint: variable('MINIO_ENDPOINT'),
    port: Number(variable('MINIO_PORT')),
    useSSL: false,
    accessKey: variable('MINIO_ACCESS_KEY'),
    secretKey: variable('MINIO_SECRET_KEY'),
  });
}

async function empreinteObjet(
  client: ClientMinio,
  cle: string,
): Promise<{ sha256: string; taille: number }> {
  const hachage = createHash('sha256');
  let taille = 0;
  for await (const morceau of await client.getObject(
    process.env.MINIO_BUCKET_ATTACHMENTS ?? '',
    cle,
  )) {
    hachage.update(morceau);
    taille += morceau.byteLength;
  }
  return { sha256: hachage.digest('hex'), taille };
}

/** Ouvre la session semée et attend sa question. */
async function ouvrirLaQuestion(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
  const reprise = page.getByRole('button', { name: 'Reprendre la session' });
  await expect(reprise).toBeVisible({ timeout: 30_000 });
  await reprise.click();
  await expect(page.getByRole('heading', { name: QUESTION_SAISIE_VIVANTE })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Scénario 6 du 05 §9.8 — 5 000 réponses et 200 photos en file', () => {
  test('@critique la file se vide sans perte ni doublon en moins de 5 min, et une saisie pendant la vidange s’affiche en moins de 1 s', async () => {
    test.setTimeout(900_000);

    const auditeur = await creerAuditeur('s6-volume');
    const mission = await creerMission('s6-volume', auditeur);
    const siege = await semerSiege(auditeur.id, mission.missionId);
    const appareil = await ouvrirAppareilSeme('s6-volume', auditeur, mission);
    const { page, contexte } = appareil;

    // Le journal des appels de synchronisation (statuts), pour le rapport et pour
    // détecter un quota qui répondrait 429 sans que l'état final le montre.
    const appels = new Map<string, number>();
    page.on('response', (reponse) => {
      const url = new URL(reponse.url());
      if (!url.pathname.includes('/api/v1/sync/')) return;
      const nature = url.pathname
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')
        .replace(/\d+$/, ':n');
      const cle = `${reponse.request().method()} ${nature} -> ${String(reponse.status())}`;
      appels.set(cle, (appels.get(cle) ?? 0) + 1);
    });

    try {
      await ouvrirLaQuestion(page);

      // ── HORS LIGNE : 5 000 réponses + 200 photos plantées dans la file locale ──
      await contexte.setOffline(true);
      const debutPlantation = Date.now();
      const plantee = await planterFileMassive(page, {
        coffre: appareil.coffre,
        missionId: mission.missionId,
        auditeurId: auditeur.id,
        interviewIds: siege.interviewIds,
        missionQuestionIds: siege.missionQuestionIds,
        nombreReponses: NB_REPONSES,
        nombrePhotos: NB_PHOTOS,
        taillesPhotosLourdes: PHOTOS_LOURDES,
      });
      mesure(`[s6] file plantée en ${String(Date.now() - debutPlantation)} ms`);
      expect(plantee.reponses).toHaveLength(NB_REPONSES);
      expect(plantee.photos).toHaveLength(NB_PHOTOS);
      expect(
        plantee.photos.filter((p) => p.morceaux > 1).map((p) => p.morceaux),
        'des photos à plusieurs morceaux (2, 2 et 3)',
      ).toEqual([2, 2, 3]);

      // La file locale EST pleine, et rien n'a quitté l'appareil.
      expect(await compterLocal(page, 'answers')).toBe(NB_REPONSES);
      expect(await compterLocal(page, 'outbox'), '5 000 ops de réponse + 200 ops de pièce').toBe(
        NB_REPONSES + NB_PHOTOS,
      );
      expect(
        await compterLocal(page, 'octetsPieces', { nom: 'statutEnvoi', valeur: 'a_envoyer' }),
      ).toBe(NB_PHOTOS);
      expect(
        (
          await avecBase((bd) =>
            bd.query<{ n: string }>(
              `SELECT count(*)::text AS n FROM answers a
               JOIN interviews i ON i.id = a.interview_id WHERE i.mission_id = $1`,
              [mission.missionId],
            ),
          )
        ).rows[0]?.n,
        'avant le retour du réseau, le siège n’a AUCUNE réponse',
      ).toBe('0');

      // ── RETOUR DU RÉSEAU : la file se vide toute seule ─────────────────────────
      const debutVidange = Date.now();
      await contexte.setOffline(false);

      // La vidange est en cours : on attend un ÉTAT (file entamée), pas un délai.
      await expect
        .poll(async () => compterLocal(page, 'outbox'), {
          message: 'la file doit commencer à se vider',
          timeout: 120_000,
          intervals: [250],
        })
        .toBeLessThan(NB_REPONSES);

      // ── Saisie PENDANT la vidange : affichée en moins de 1 s ──────────────────
      const restantAvant = await compterLocal(page, 'outbox');
      expect(
        restantAvant,
        'la file n’est pas déjà vide : la saisie a bien lieu pendant la vidange',
      ).toBeGreaterThan(0);
      const champ = page.getByLabel('Votre réponse');
      const debutSaisie = Date.now();
      await champ.fill(REPONSE_VIVANTE);
      await expect(page.getByText(/Enregistré à/)).toBeVisible({ timeout: 15_000 });
      const dureeAffichage = Date.now() - debutSaisie;
      const restantApres = await compterLocal(page, 'outbox');
      mesure(
        `[s6] saisie pendant la vidange affichée en ${String(dureeAffichage)} ms (file : ${String(restantAvant)} -> ${String(restantApres)})`,
      );
      expect(restantApres, 'la vidange était toujours en cours à l’affichage').toBeGreaterThan(0);
      expect(
        dureeAffichage,
        `la saisie pendant la vidange doit s’afficher en moins de ${String(SEUIL_AFFICHAGE_MS)} ms`,
      ).toBeLessThan(SEUIL_AFFICHAGE_MS);

      // ── La file est VIDÉE : outbox à 0, toutes les pièces « envoyées » ─────────
      await expect
        .poll(async () => compterLocal(page, 'outbox'), {
          message: 'l’outbox doit atteindre 0',
          timeout: SEUIL_VIDANGE_MS,
          intervals: [1_000],
        })
        .toBe(0);
      mesure(
        `[s6] outbox à 0 après ${String(Date.now() - debutVidange)} ms (réponses et méta montées ; restent les octets des photos)`,
      );
      await expect
        .poll(
          async () => compterLocal(page, 'octetsPieces', { nom: 'statutEnvoi', valeur: 'envoyee' }),
          {
            message: 'les 200 photos doivent passer « envoyée »',
            timeout: SEUIL_VIDANGE_MS,
            intervals: [1_000],
          },
        )
        .toBe(NB_PHOTOS);
      const dureeVidange = Date.now() - debutVidange;
      mesure(`[s6] file vidée en ${String(dureeVidange)} ms (seuil ${String(SEUIL_VIDANGE_MS)})`);
      mesure(
        `[s6] appels de synchronisation :\n${[...appels].map(([k, n]) => `  ${k} x${String(n)}`).join('\n')}`,
      );
      expect(
        dureeVidange,
        'les 5 000 réponses et 200 photos doivent partir en moins de 5 min',
      ).toBeLessThan(SEUIL_VIDANGE_MS);
      expect(
        await compterLocal(page, 'octetsPieces', { nom: 'statutEnvoi', valeur: 'en_echec' }),
        'aucune pièce en échec',
      ).toBe(0);

      // ── SIÈGE : 5 000 réponses (+ la saisie vivante), une ligne par id ─────────
      const reponses = await avecBase((bd) =>
        bd.query<{ id: string; interview_id: string; mission_question_id: string; valeur: string }>(
          `SELECT a.id, a.interview_id, a.mission_question_id, a.value->>'v' AS valeur
             FROM answers a JOIN interviews i ON i.id = a.interview_id
            WHERE i.mission_id = $1`,
          [mission.missionId],
        ),
      );
      expect(reponses.rows, 'les 5 000 réponses plantées + la saisie vivante').toHaveLength(
        NB_REPONSES + 1,
      );
      expect(new Set(reponses.rows.map((r) => r.id)).size, 'aucun id en double').toBe(
        NB_REPONSES + 1,
      );
      expect(
        new Set(reponses.rows.map((r) => `${r.interview_id}/${r.mission_question_id}`)).size,
        'aucun couple (session, question) en double',
      ).toBe(NB_REPONSES + 1);
      const parId = new Map(reponses.rows.map((r) => [r.id, r]));
      const manquantes = plantee.reponses.filter((r) => parId.get(r.id)?.valeur !== r.valeur);
      expect(
        manquantes.map((r) => r.id),
        'chaque réponse plantée est au siège, avec sa valeur',
      ).toEqual([]);
      expect(
        reponses.rows.filter(
          (r) => r.valeur === REPONSE_VIVANTE && r.interview_id === siege.interviewVivanteId,
        ),
        'la saisie faite pendant la vidange est au siège',
      ).toHaveLength(1);

      // ── SIÈGE + MINIO : 200 photos assemblées, taille et sha256 exacts ─────────
      const pieces = await avecBase((bd) =>
        bd.query<{ id: string; storage_key: string | null; statut: string | null }>(
          `SELECT a.id, a.storage_key, u.statut
             FROM attachments a
             LEFT JOIN attachment_uploads u ON u.attachment_id = a.id
            WHERE a.mission_id = $1 AND a.kind = 'photo'`,
          [mission.missionId],
        ),
      );
      expect(pieces.rows, 'une ligne de pièce par photo').toHaveLength(NB_PHOTOS);
      expect(
        pieces.rows.filter((p) => p.statut !== 'assemble').map((p) => p.id),
        'toutes les photos sont « assemblé »',
      ).toEqual([]);
      const parPiece = new Map(pieces.rows.map((p) => [p.id, p]));
      const client = clientMinio();
      const ecarts: string[] = [];
      for (let debut = 0; debut < plantee.photos.length; debut += 10) {
        await Promise.all(
          plantee.photos.slice(debut, debut + 10).map(async (photo) => {
            const cle = parPiece.get(photo.id)?.storage_key;
            if (cle !== `pieces/${mission.missionId}/${photo.id}`) {
              ecarts.push(`${photo.id} : clé de stockage ${String(cle)}`);
              return;
            }
            const objet = await empreinteObjet(client, cle);
            if (objet.taille !== photo.taille) {
              ecarts.push(`${photo.id} : taille ${String(objet.taille)} ≠ ${String(photo.taille)}`);
            } else if (objet.sha256 !== photo.sha256) {
              ecarts.push(`${photo.id} : sha256 différent`);
            }
          }),
        );
      }
      expect(ecarts, '200 objets MinIO, taille et sha256 exacts').toEqual([]);
    } finally {
      await contexte.close();
    }
  });
});
