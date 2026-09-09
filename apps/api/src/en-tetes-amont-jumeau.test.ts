// =============================================================================
// GARDE DE COHÉRENCE — LE JUMEAU DES EN-TÊTES DE HELMET NE DÉRIVE PAS.
//
// Écrit par A26 (testeur E2E), qui n'a produit aucune ligne d'app.ts (09 §5.6).
// Traçabilité : E36, E43 · 06 §10.2 · DOSSIER_ZAP §4-A · revue A29, réserve R5.
//
// `e2e/fixtures/amont-api-factice.caddy` recopie les en-têtes que helmet pose
// dans apps/api/src/app.ts, pour que le harnais Caddy prouve l'écrasement §4-A
// sur un amont qui émet la VRAIE CSP de l'API. Cette copie était maintenue à la
// main, sans garde : si app.ts change sa configuration helmet, l'E2E se compare
// à une chaîne périmée et son test §4-A passe À VIDE — la dérive silencie
// précisément le test qui documente l'écrasement.
//
// Ici : `app.inject` sur l'app RÉELLE (`construireApp`, pas une reconstitution),
// et le `.caddy` doit dire EXACTEMENT ce que helmet émet — dans les deux sens.
//   → un en-tête du `.caddy` absent ou différent chez helmet : ROUGE ;
//   → un en-tête de helmet absent du `.caddy` : ROUGE (refus par défaut — seuls
//     les en-têtes de transport, qui ne relèvent pas de helmet, sont exemptés).
// Éprouvé par mutation : une valeur changée dans le `.caddy` rougit ce test.
//
// Pourquoi `unit` : `/v1/health` est publique et ne touche aucune base.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CHEMIN_AMONT_FACTICE,
  enTetesAmontFactice,
} from '../../../e2e/fixtures/amont-api-factice.js';

process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_jumeau';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

/**
 * Les en-têtes d'une réponse `/v1/health` qui ne viennent PAS de helmet : le
 * transport (Fastify) et le corps. Tout autre en-tête émis est réputé de helmet
 * et DOIT figurer dans le `.caddy`. `content-type` est bien dans le `.caddy` —
 * l'amont factice doit rendre du JSON — mais il n'est pas de helmet : on ne le
 * compare pas à celui de Fastify (le charset est posé par la sérialisation).
 */
const HORS_HELMET = new Set(['content-type', 'content-length', 'date', 'connection', 'keep-alive']);

describe('le jumeau des en-têtes de helmet (amont-api-factice.caddy)', () => {
  let app: FastifyInstance;
  let helmet: Map<string, string>;

  // ── POURQUOI CE CROCHET PORTE UN DÉLAI EXPLICITE ────────────────────────────
  // MESURÉ (2026-09-09, deux passages de `pnpm test:unit` complet) : ce crochet
  // met 6,9 s à 10,1 s selon la charge, contre 4,5 s quand le fichier tourne
  // seul. Au-delà du plafond PAR DÉFAUT des crochets (10 s), Vitest annule le
  // fichier et compte ses cas en « skipped » — la sortie lue était
  // « 2 tests | 2 skipped … Test Files 1 failed », et le `pre-push` rougissait
  // un passage sur deux. C'est la famille de défauts que ce dépôt a déjà nommée
  // (auth/socle.test.ts, auth/quota.test.ts, même signature ; ETAT.md,
  // assignments/service.test.ts) et que playwright.config.ts résume : « un test
  // qui échoue par intermittence est un test qui ment ».
  //
  // CE QUE CE CROCHET FAIT, ET POURQUOI ÇA COÛTE : il monte le socle Fastify
  // RÉEL (`construireApp` — plugins, compilateurs Zod, politique d'accès,
  // quota, helmet) pendant que 74 autres fichiers tournent en parallèle. Ce
  // n'est pas un coût qu'on peut retirer : mesurer les en-têtes sur une app
  // reconstruite à la main reviendrait à RECOPIER la configuration de helmet —
  // exactement la dérive que ce fichier existe pour interdire (R5). Le prix de
  // ne pas recopier les en-têtes, c'est de démarrer le vrai socle.
  //
  // 120 s n'est pas une tolérance à la lenteur, et le seuil du test lui-même ne
  // bouge pas : les deux `it` ci-dessous restent sous le plafond ordinaire du
  // projet `unit`, parce qu'ils ne font que comparer deux cartes déjà en
  // mémoire. Si ce crochet met vraiment deux minutes, ce n'est plus une
  // contention, c'est une panne — et il échouera.
  beforeAll(async () => {
    const { construireApp } = await import('./app.js');
    app = await construireApp();
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(reponse.statusCode).toBe(200);
    helmet = new Map(
      Object.entries(reponse.headers)
        .filter(([nom]) => !HORS_HELMET.has(nom.toLowerCase()))
        .map(([nom, valeur]) => [nom.toLowerCase(), String(valeur)]),
    );
  }, 120_000);

  // Même plafond, même raison : la fermeture attend les crochets `onClose` du
  // socle sous la même contention. Un `afterAll` qui expire fait échouer un
  // fichier dont tous les cas sont passés — le rouge le plus trompeur qui soit.
  afterAll(async () => {
    await app.close();
  }, 120_000);

  it('@critique chaque en-tête du .caddy est émis par helmet, à l’octet près', () => {
    const jumeau = enTetesAmontFactice();
    jumeau.delete('content-type');
    for (const [nom, valeur] of jumeau) {
      expect(
        helmet.get(nom),
        `${CHEMIN_AMONT_FACTICE} pose « ${nom}: ${valeur} » ; helmet (app.ts) émet ` +
          `« ${String(helmet.get(nom))} ». Le .caddy est le jumeau déclaré du bloc helmet : ` +
          `il suit app.ts, jamais l'inverse (09 §5.6 : ce test ne corrige pas app.ts).`,
      ).toBe(valeur);
    }
  });

  it('@critique chaque en-tête émis par helmet figure dans le .caddy — aucun oubli', () => {
    const jumeau = enTetesAmontFactice();
    const oublies = [...helmet.keys()].filter((nom) => !jumeau.has(nom));
    expect(
      oublies,
      `helmet émet ${oublies.join(', ')} et ${CHEMIN_AMONT_FACTICE} ne les pose pas : ` +
        `l'amont factice n'est plus le jumeau de l'API. Ajoutez-les au .caddy, ou à HORS_HELMET ` +
        `s'ils ne relèvent pas de helmet — en le justifiant.`,
    ).toEqual([]);
  });
});
