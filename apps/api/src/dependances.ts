// =============================================================================
// SONDAGE DES DÉPENDANCES — support de `/v1/health/ready` (préparation).
//
// CE FICHIER RÉPOND À UNE SEULE QUESTION : « cette API est-elle en état de servir
// le trafic ? » Pas « tout va-t-il bien ? » — les deux questions n'ont pas la même
// réponse, et les confondre est précisément ce qui provoque les bascules en cascade.
//
// -----------------------------------------------------------------------------
// LA DISTINCTION QUI FONDE CE FICHIER : CRITIQUE vs DÉGRADANTE
// -----------------------------------------------------------------------------
// · CRITIQUE   — sans elle, AUCUNE requête utile ne peut aboutir. L'API est INAPTE
//                à servir : elle doit être retirée du trafic (503), car la laisser
//                dedans ne fait que transformer des requêtes en erreurs.
// · DÉGRADANTE — sans elle, UNE FONCTION tombe, le reste sert normalement. Retirer
//                l'API du trafic coûterait alors PLUS que la fonction perdue : on
//                sacrifierait la collecte et la sync (invariant 6, invariant 1)
//                pour une pièce jointe indisponible. On journalise, on ne rougit pas.
//
// Le piège que cette distinction évite : une préparation qui échoue « largement »
// pendant qu'une dépendance secondaire redémarre fait basculer tout le trafic
// ailleurs — sur des instances qui voient la MÊME dépendance absente, et qui
// rougissent à leur tour. La panne d'un service périphérique devient une panne
// totale. Une sonde de préparation doit donc être AVARE de ses 503.
//
// -----------------------------------------------------------------------------
// CLASSIFICATION RETENUE (et pourquoi)
// -----------------------------------------------------------------------------
// · PostgreSQL — CRITIQUE. Tout passe par lui : missions, questionnaire, collecte,
//   sync. Sans base, l'API ne sert rien du tout.
// · Redis      — DÉGRADANTE À CE STADE. L'API ne s'y connecte pas encore ; Redis
//   porte les files BullMQ, consommées par le WORKER. Son absence retarde des
//   travaux asynchrones (DOCX, exports, purges) sans empêcher NI la collecte, NI la
//   sync, NI la consultation. ⚠ À RÉARBITRER AU LOT L2 : si la révocation de jetons
//   ou le compteur de quota y vivent, Redis devient CRITIQUE — le changement passe
//   par une entrée DECISIONS.md, pas par une modification silencieuse d'un booléen.
// · MinIO      — DÉGRADANTE. Pièces jointes et rapports indisponibles ; la collecte
//   et la sync des données continuent. « Le terrain collecte » (invariant 6) ne
//   dépend pas du stockage objet.
// · Worker et files — DÉLIBÉRÉMENT NON SONDÉS ICI. Le worker porte sa PROPRE sonde
//   (battement Redis + attachement aux cinq files). Si l'API rougissait parce que le
//   worker redémarre, un simple déploiement du worker retirerait l'API du trafic :
//   c'est l'exemple canonique de la cascade qu'on refuse. La connectivité Redis
//   mesurée ci-dessus est ce que l'API peut honnêtement affirmer des files ;
//   la santé du CONSOMMATEUR n'est pas la sienne à déclarer.
//
// Traçabilité : E17, E35 (exploitation).
// =============================================================================
import net from 'node:net';
import { config, configMinio } from './config.js';
import { logger } from './logger.js';
import { baseDisponible } from './db.js';

/**
 * Budget accordé à CHAQUE sonde, en millisecondes. Les sondes tournent en
 * parallèle : le budget total de la route est donc celui-ci, pas leur somme.
 *
 * Il est délibérément inférieur aux délais qui l'encadrent en amont — `timeout: 3s`
 * du HEALTHCHECK de l'image, `timeout: 5s` du healthcheck Compose : une sonde qui
 * dépasserait son budget rendrait un verdict que l'orchestrateur a déjà cessé
 * d'attendre, ce qui revient à ne pas répondre du tout.
 *
 * Ce délai n'est PAS redondant avec `connectionTimeoutMillis` du pool (db.ts) :
 * celui-là borne l'ÉTABLISSEMENT d'une connexion, pas une requête sur une connexion
 * DÉJÀ établie. Un PostgreSQL gelé (verrou, disque saturé) accepte la connexion et
 * ne répond jamais — sans ce garde-fou, la sonde pendrait indéfiniment.
 */
const BUDGET_SONDE_MS = 2_000;

/**
 * Durée de mise en cache d'un verdict, en millisecondes.
 *
 * RAISON D'ÊTRE : la route de préparation est EXEMPTÉE du quota global (voir
 * routes/sante.ts). Sans ce cache, une rafale de 340 requêtes sur `/v1/health/ready`
 * déclencherait 340 `select 1`, 340 connexions TCP à Redis et 340 requêtes MinIO :
 * l'exemption, posée pour empêcher un redémarrage de conteneur, deviendrait un
 * amplificateur de charge visant les dépendances mêmes qu'elle protège.
 *
 * Le choix de la valeur : très inférieure à l'intervalle des sondes (10 s en
 * Compose, 15 s dans l'image), donc CHAQUE interrogation de l'orchestrateur voit un
 * verdict frais ; assez longue pour qu'une rafale n'en produise qu'un seul.
 */
const DUREE_CACHE_MS = 2_000;

/** Ce qu'une sonde peut constater. */
export type EtatDependance = 'ok' | 'ko' | 'non_configure';

/** Ce que l'absence d'une dépendance coûte — voir l'en-tête de ce fichier. */
export type CriticiteDependance = 'critique' | 'degradante';

export interface ResultatDependance {
  readonly nom: string;
  readonly criticite: CriticiteDependance;
  readonly etat: EtatDependance;
  /** Durée du sondage, en millisecondes — utile pour repérer une lenteur qui monte. */
  readonly dureeMs: number;
}

/**
 * Verdict global.
 * · `ready`       — toutes les dépendances critiques répondent, aucune dégradation.
 * · `degraded`    — les critiques répondent, une dégradante manque. L'API SERT :
 *                   ce verdict s'accompagne d'un 200, pas d'un 503 (voir en-tête).
 * · `unavailable` — une dépendance critique manque. L'API est inapte à servir.
 */
export type EtatPreparation = 'ready' | 'degraded' | 'unavailable';

export interface VerdictPreparation {
  readonly etat: EtatPreparation;
  readonly dependances: readonly ResultatDependance[];
}

/**
 * Borne une promesse dans le temps. La promesse perdante n'est PAS annulée — elle
 * continue et son résultat est ignoré ; c'est sans conséquence ici, les sondes
 * n'écrivent rien.
 */
async function avecBudget<T>(promesse: Promise<T>, valeurSiDepassement: T): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  const garde = new Promise<T>((resoudre) => {
    minuteur = setTimeout(() => {
      resoudre(valeurSiDepassement);
    }, BUDGET_SONDE_MS);
    // Le minuteur ne doit pas retenir la boucle d'événements à l'arrêt du processus.
    minuteur.unref();
  });
  try {
    return await Promise.race([promesse, garde]);
  } finally {
    clearTimeout(minuteur);
  }
}

/** Encode une commande au protocole RESP (tableau de chaînes en vrac). */
function commandeResp(...arguments_: readonly string[]): Buffer {
  const parties: Buffer[] = [Buffer.from(`*${String(arguments_.length)}\r\n`)];
  for (const argument of arguments_) {
    const valeur = Buffer.from(argument, 'utf8');
    parties.push(Buffer.from(`$${String(valeur.length)}\r\n`), valeur, Buffer.from('\r\n'));
  }
  return Buffer.concat(parties);
}

/**
 * Sonde Redis : `AUTH` puis `PING`, en RESP brut sur une socket TCP.
 *
 * POURQUOI PAS UN CLIENT REDIS : l'API n'a AUCUN client Redis dans ses dépendances,
 * et en ajouter un est une décision qui relève de l'humain (CLAUDE.md §3.1, contrat
 * 11 §8). Une sonde de santé ne justifie pas d'élargir la surface de dépendances :
 * quarante lignes de protocole documenté coûtent moins qu'un paquet de plus.
 *
 * `AUTH` et pas seulement `PING` : un `-NOAUTH` prouverait que Redis vit, mais pas
 * que l'API peut S'EN SERVIR. Un mot de passe faux est un Redis inutilisable ;
 * la sonde doit le voir.
 */
async function sonderRedis(): Promise<boolean> {
  let cible: URL;
  try {
    cible = new URL(config.REDIS_URL);
  } catch {
    logger.warn('REDIS_URL illisible — dépendance Redis non sondée');
    return false;
  }

  // TLS (`rediss://`) non géré : Redis vit sur le réseau Docker INTERNE (06 §10.3)
  // et n'est jamais joint en clair depuis l'extérieur. Si cette hypothèse change,
  // c'est `node:tls` qu'il faut ici — et une entrée DECISIONS.md.
  if (cible.protocol !== 'redis:') {
    logger.warn(
      { protocole: cible.protocol },
      'Protocole Redis non géré par la sonde — dépendance considérée comme non sondable',
    );
    return false;
  }

  const hote = cible.hostname;
  const port = Number(cible.port === '' ? '6379' : cible.port);
  // `URL` rend les identifiants encodés : un mot de passe contenant `@` ou `:` est
  // percent-encodé dans l'URL et doit être rendu à sa valeur réelle avant l'envoi.
  const motDePasse = decodeURIComponent(cible.password);
  const utilisateur = decodeURIComponent(cible.username);

  return new Promise<boolean>((resoudre) => {
    let termine = false;
    const conclure = (repond: boolean, motif?: string): void => {
      if (termine) return;
      termine = true;
      if (!repond) {
        // JAMAIS l'URL ni le mot de passe dans le journal (11 §2, 06 §10.2).
        logger.error({ motif: motif ?? 'inconnu' }, 'Redis injoignable');
      }
      socket.destroy();
      resoudre(repond);
    };

    const socket = net.connect({ host: hote, port }, () => {
      if (motDePasse !== '') {
        socket.write(
          utilisateur === ''
            ? commandeResp('AUTH', motDePasse)
            : commandeResp('AUTH', utilisateur, motDePasse),
        );
      }
      socket.write(commandeResp('PING'));
    });
    socket.setTimeout(BUDGET_SONDE_MS);

    let recu = '';
    socket.on('data', (morceau: Buffer) => {
      recu += morceau.toString('utf8');
      if (recu.includes('+PONG')) {
        conclure(true);
      } else if (recu.startsWith('-')) {
        // Réponse d'erreur RESP : on ne garde que le CODE (`NOAUTH`, `WRONGPASS`…),
        // jamais le message complet, qui peut refléter ce qu'on a envoyé.
        conclure(false, recu.slice(1).split(' ')[0]);
      }
    });
    socket.on('timeout', () => {
      conclure(false, 'delai_depasse');
    });
    socket.on('error', (erreur: Error) => {
      conclure(false, erreur.message);
    });
    socket.on('close', () => {
      conclure(false, 'connexion_fermee');
    });
  });
}

/**
 * Sonde MinIO : point de santé natif du serveur, en HTTP simple.
 *
 * `/minio/health/live` et non un appel authentifié sur un bucket : la sonde vérifie
 * que le SERVICE répond, pas que les droits sont bons. Un contrôle authentifié à
 * chaque sonde ferait porter à la préparation le poids d'une vérification qui relève
 * du démarrage — et exposerait les clés applicatives à un chemin de code chaud.
 *
 * Pas de client S3 ici, pour la raison exposée dans `sonderRedis` : aucune
 * dépendance nouvelle pour une sonde. `fetch` est natif en Node 22.
 */
async function sonderMinio(): Promise<boolean> {
  const parametres = configMinio;
  if (parametres === null) return false;

  const schema = parametres.MINIO_USE_SSL ? 'https' : 'http';
  const adresse = `${schema}://${parametres.MINIO_ENDPOINT}:${String(parametres.MINIO_PORT)}/minio/health/live`;
  try {
    const reponse = await fetch(adresse, {
      method: 'GET',
      signal: AbortSignal.timeout(BUDGET_SONDE_MS),
    });
    if (!reponse.ok) {
      logger.error({ statut: reponse.status }, 'MinIO répond mais se déclare indisponible');
      return false;
    }
    return true;
  } catch (err) {
    // MOTIF COURT, PAS L'OBJET D'ERREUR. Une `DOMException` de `fetch` sérialisée par
    // pino occupe une vingtaine de lignes (pile + toutes ses constantes numériques) —
    // à chaque sondage, sur une dépendance qui peut rester absente des heures. Le
    // journal doit rester lisible quand ça va mal : c'est justement à ce moment-là
    // qu'on le lit. Même parti pris que la sonde Redis ci-dessus.
    logger.error({ motif: err instanceof Error ? err.name : 'inconnu' }, 'MinIO injoignable');
    return false;
  }
}

async function mesurer(
  nom: string,
  criticite: CriticiteDependance,
  sonde: () => Promise<boolean>,
  configuree = true,
): Promise<ResultatDependance> {
  if (!configuree) {
    return { nom, criticite, etat: 'non_configure', dureeMs: 0 };
  }
  const debut = performance.now();
  // `avecBudget` rend `false` si la sonde dépasse son temps : une sonde qui ne
  // conclut pas est un échec, jamais une attente indéfinie.
  const repond = await avecBudget(
    sonde().catch(() => false),
    false,
  );
  return {
    nom,
    criticite,
    etat: repond ? 'ok' : 'ko',
    dureeMs: Math.round(performance.now() - debut),
  };
}

/** Dernier verdict rendu, et l'instant où il l'a été (voir `DUREE_CACHE_MS`). */
let cache: { verdict: VerdictPreparation; expireA: number } | null = null;
/** Sondage en cours, s'il y en a un : deux rafales simultanées n'en déclenchent qu'un. */
let sondageEnCours: Promise<VerdictPreparation> | null = null;

async function sonderToutesLesDependances(): Promise<VerdictPreparation> {
  // En parallèle : le budget de la route est celui d'UNE sonde, pas de leur somme.
  const dependances = await Promise.all([
    mesurer('postgres', 'critique', baseDisponible),
    mesurer('redis', 'degradante', sonderRedis),
    // `configMinio === null` ⇒ « non configuré », état DISTINCT de « en panne » :
    // une dépendance non configurée n'est pas une dépendance défaillante, et ne doit
    // ni rougir ni dégrader. Elle est visible dans le journal, c'est tout.
    mesurer('minio', 'degradante', sonderMinio, configMinio !== null),
  ]);

  const critiqueAbsente = dependances.some((d) => d.criticite === 'critique' && d.etat === 'ko');
  const degradanteAbsente = dependances.some(
    (d) => d.criticite === 'degradante' && d.etat === 'ko',
  );

  const etat: EtatPreparation = critiqueAbsente
    ? 'unavailable'
    : degradanteAbsente
      ? 'degraded'
      : 'ready';

  if (etat !== 'ready') {
    // Le DÉTAIL vit dans le journal, jamais dans la réponse HTTP (06 §10.2 : la
    // topologie des dépendances n'aide que celui qui cherche par où entrer).
    logger.warn({ etat, dependances }, 'Préparation dégradée ou indisponible');
  }

  return { etat, dependances };
}

/**
 * Verdict de préparation, mis en cache pendant `DUREE_CACHE_MS`.
 * Les sondages concurrents partagent un seul aller-retour vers les dépendances.
 */
export async function evaluerPreparation(): Promise<VerdictPreparation> {
  const maintenant = Date.now();
  if (cache !== null && cache.expireA > maintenant) {
    return cache.verdict;
  }
  sondageEnCours ??= sonderToutesLesDependances()
    .then((verdict) => {
      cache = { verdict, expireA: Date.now() + DUREE_CACHE_MS };
      return verdict;
    })
    .finally(() => {
      sondageEnCours = null;
    });
  return sondageEnCours;
}

/** Vide le cache — réservé aux tests, qui ne doivent pas hériter d'un verdict voisin. */
export function reinitialiserCachePreparation(): void {
  cache = null;
}
