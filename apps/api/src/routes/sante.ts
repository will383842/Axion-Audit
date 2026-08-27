// =============================================================================
// SONDES DE SANTÉ — support du critère L0 « docker compose up = stack complète »
// et du smoke test de déploiement (02 §30.6 : « santé API »).
//
// DEUX sondes, deux usages, à ne surtout pas confondre :
//   · /v1/health        VIVACITÉ    — le processus répond. Docker le redémarre si
//                                     cette sonde échoue.
//   · /v1/health/ready  PRÉPARATION — les dépendances répondent. Le déploiement
//                                     attend celle-ci avant de basculer le trafic.
// Les confondre ferait redémarrer en boucle une API dont seule la base est
// momentanément indisponible : le remède deviendrait la panne.
//
// Ces routes ne figurent pas aux §8/§24.2 du pack (qui décrivent les routes
// MÉTIER) : elles sont documentées ici et dans apps/api/README.md au titre du
// 11 §8.6. Elles n'exposent RIEN — ni version, ni nom d'hôte, ni message d'erreur
// de dépendance (06 §10.2 : pas d'aide à la reconnaissance).
// Traçabilité : E17, E35 (exploitation).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import { HTTP_STATUS_BY_ERROR_CODE } from '@axion/shared';
import { baseDisponible } from '../db.js';

export const routesSante: FastifyPluginAsync = async (app) => {
  // `logLevel: 'warn'` : les sondes sont interrogées toutes les quelques secondes
  // par Docker. Les journaliser en `info` noierait le journal réel sous le bruit.

  /** Vivacité — ne touche AUCUNE dépendance, par construction. */
  app.get('/health', { logLevel: 'warn' }, () => {
    return { status: 'ok' as const };
  });

  /** Préparation — contrôle les dépendances dont l'API ne peut pas se passer. */
  app.get('/health/ready', { logLevel: 'warn' }, async (_requete, reponse) => {
    const postgresRepond = await baseDisponible();

    if (!postgresRepond) {
      // 503 et non 500 : l'API va bien, c'est une dépendance qui manque. Le corps
      // reste laconique — le détail est dans le journal, pas sur le réseau.
      return reponse
        .code(HTTP_STATUS_BY_ERROR_CODE.SERVICE_UNAVAILABLE)
        .send({ status: 'unavailable' as const });
    }

    return { status: 'ready' as const };
  });

  await Promise.resolve();
};
