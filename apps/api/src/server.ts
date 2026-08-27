// =============================================================================
// POINT D'ENTRÉE DE L'API — démarrage et ARRÊT PROPRE.
//
// L'arrêt propre n'est pas un raffinement. Au déploiement (02 §30.6 :
// `docker compose pull && up -d` sur des images neuves), une requête de sync en vol
// coupée brutalement laisserait une op à moitié traitée. L'idempotence du push
// (invariant 1) la rattraperait — mais on ne s'autorise pas à sauter mal sous
// prétexte qu'il y a un filet.
// Traçabilité : E17, E35.
// =============================================================================
import { construireApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { fermerBase } from './db.js';

const app = await construireApp();

async function arreterProprement(signal: string): Promise<void> {
  logger.info({ signal }, "Arrêt demandé — fermeture propre de l'API");
  try {
    // 1. Fastify cesse d'accepter, puis laisse finir les requêtes en cours.
    await app.close();
    // 2. Seulement ensuite, on rend les connexions à la base.
    await fermerBase();
    logger.info('API arrêtée proprement');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Échec de l'arrêt propre");
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void arreterProprement(signal);
  });
}

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ port: config.API_PORT, env: config.APP_ENV }, 'API Axion Audit démarrée');
} catch (err) {
  logger.fatal({ err }, "L'API n'a pas pu démarrer");
  process.exit(1);
}
