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
//
// -----------------------------------------------------------------------------
// POURQUOI CES DEUX ROUTES SONT EXEMPTÉES DU QUOTA GLOBAL — et elles seules
// -----------------------------------------------------------------------------
// Le quota global (300 req/min, app.ts) s'applique par défaut à TOUTE route. Il
// s'appliquait donc à `/v1/health` — la route que la sonde Docker interroge.
//
// Conséquence mesurée en recette : pendant une rafale, les sondes de l'orchestrateur
// se sont fait refuser trois fois de suite. Avec `retries: 12`, le conteneur a
// survécu de justesse ; une pointe de deux minutes — « cinquante consultants qui
// rentrent le vendredi soir », le scénario écrit dans db.ts — l'aurait marqué
// `unhealthy`. LE QUOTA, POSÉ POUR PROTÉGER L'API, LA TUAIT : un pic de charge se
// serait transformé en redémarrage de conteneur, donc en coupure de service à
// l'instant précis où le service est le plus demandé. Le trafic légitime d'un pic
// est déjà refusé par le quota sur les routes métier ; y ajouter la mort du
// conteneur, c'est punir deux fois.
//
// CE QUI REND CES DEUX ROUTES-LÀ ÉLIGIBLES, ET PAS D'AUTRES :
//   1. leur appelant n'est pas un client, c'est l'INFRASTRUCTURE — orchestrateur et
//      déploiement, à fréquence fixe, depuis la boucle locale ;
//   2. leur échec ne signifie pas « ce client va trop vite » mais « ce conteneur est
//      mort » : leur appliquer un quota, c'est FABRIQUER cette seconde information
//      à partir de la première ;
//   3. elles ne lisent aucune donnée métier et ne rendent rien qu'on puisse
//      exfiltrer en les martelant.
// Aucune route métier ne réunit ces trois conditions. L'exemption ne se généralise
// donc pas — et surtout, elle est posée ROUTE PAR ROUTE et non par préfixe : une
// route ajoutée demain sous `/health/...` ne sera PAS exemptée par héritage.
//
// LE REVERS, ET SON TRAITEMENT : une route sans quota est un vecteur d'amplification.
// `/v1/health` ne touche rien, elle est inerte. `/v1/health/ready`, elle, interroge
// des dépendances — c'est pourquoi son verdict est MIS EN CACHE quelques secondes
// (dependances.ts) : une rafale n'y déclenche qu'un seul sondage réel.
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import { HTTP_STATUS_BY_ERROR_CODE } from '@axion/shared';
import { evaluerPreparation } from '../dependances.js';

/**
 * Exemption du quota global. `false` est la valeur que `@fastify/rate-limit`
 * reconnaît pour ne poser AUCUN compteur sur la route (toute autre valeur non-objet
 * fait échouer l'enregistrement — c'est un garde-fou du plugin, pas un effet de bord).
 */
const HORS_QUOTA = { rateLimit: false } as const;

export const routesSante: FastifyPluginAsync = async (app) => {
  // `logLevel: 'warn'` : les sondes sont interrogées toutes les quelques secondes
  // par Docker. Les journaliser en `info` noierait le journal réel sous le bruit.

  /** Vivacité — ne touche AUCUNE dépendance, par construction. */
  app.get('/health', { logLevel: 'warn', config: HORS_QUOTA }, () => {
    return { status: 'ok' as const };
  });

  /**
   * Préparation — contrôle les dépendances dont l'API ne peut pas se passer.
   *
   * CE QU'ELLE COUVRE (voir dependances.ts pour la classification et ses raisons) :
   *   · PostgreSQL — CRITIQUE : absent ⇒ 503, l'API est retirée du trafic ;
   *   · Redis      — DÉGRADANT : absent ⇒ 200 `degraded` + journal ;
   *   · MinIO      — DÉGRADANT : absent ⇒ 200 `degraded` + journal.
   *
   * CE QU'ELLE NE COUVRE PAS, DÉLIBÉRÉMENT : la vivacité du worker et l'état des
   * files. Rougir parce que le worker redémarre retirerait l'API du trafic à chaque
   * déploiement du worker — la cascade même qu'une sonde de préparation doit éviter.
   *
   * Le corps reste LACONIQUE : trois valeurs, aucune topologie. Le détail par
   * dépendance vit dans le journal (06 §10.2).
   */
  app.get('/health/ready', { logLevel: 'warn', config: HORS_QUOTA }, async (_requete, reponse) => {
    const { etat } = await evaluerPreparation();

    if (etat === 'unavailable') {
      // 503 et non 500 : l'API va bien, c'est une dépendance CRITIQUE qui manque.
      // Le corps reste laconique — le détail est dans le journal, pas sur le réseau.
      return reponse
        .code(HTTP_STATUS_BY_ERROR_CODE.SERVICE_UNAVAILABLE)
        .send({ status: 'unavailable' as const });
    }

    // 200 y compris pour `degraded` : l'API SERT. Un 503 ici retirerait du trafic une
    // instance capable de collecter et de synchroniser, au prétexte qu'une pièce
    // jointe serait indisponible — et toutes les instances voyant la même dépendance
    // absente rougiraient ensemble. L'exploitant est prévenu par le journal et par
    // ce `status`, pas par une bascule.
    return { status: etat === 'degraded' ? ('degraded' as const) : ('ready' as const) };
  });

  await Promise.resolve();
};
