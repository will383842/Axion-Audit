// =============================================================================
// LA SONDE DE SANTÉ DIT-ELLE LA VÉRITÉ ? — le test qui interdit le retour du mensonge
//
// L'ancienne sonde était `pgrep -f node`. Elle a affiché « Up 13 hours (healthy) »
// sur un conteneur dont la première ligne de journal était une pile d'exception,
// parce qu'en développement `tsc --watch` tourne à côté du worker et que `tsc` EST
// un processus node. Le critère d'acceptation du lot L0 — « docker compose up =
// stack complète » — a été coché sur cette apparence.
//
// Une sonde ne se teste pas en la regardant dire « sain ». Elle se teste en
// FABRIQUANT LA PANNE et en vérifiant qu'elle la voit. Les quatre situations
// couvertes ici sont celles où une sonde naïve reste verte :
//   · aucun worker (la panne d'origine) ;
//   · worker attaché mais battement absent — le processus figé, que `pgrep` ne
//     voyait jamais puisque le processus existe toujours ;
//   · quatre travailleurs sur cinq files — le mensonge en plus petit, qu'un
//     contrôle « au moins un » laisserait passer ;
//   · un conteneur voisin en bonne santé sur le même Redis — le mensonge déplacé
//     d'un cran.
//
// La sonde éprouvée est `dist/sonde-sante.js`, le fichier même que le HEALTHCHECK
// exécute. Les situations sont fabriquées avec de VRAIS objets BullMQ, jamais en
// réimplémentant le raisonnement de la sonde : un test qui refait le calcul du
// code testé se contente de vérifier qu'il sait recopier.
// =============================================================================
import { Queue, Worker, type Processor } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleDeBattement,
  IDENTITE_INSTANCE,
  NOMS_DE_FILES,
  PREFIXE_REDIS,
  TTL_BATTEMENT_SECONDES,
} from '../src/files.js';
import {
  arreterRedis,
  assurerConstruction,
  clientBrut,
  attendreSonde,
  demarrerRedis,
  demarrerWorker,
  executerSonde,
  type ClientRedisBrut,
  type WorkerLance,
} from './aide/redis-ephemere.js';

let urlRedis = '';
let fileTechnique: Queue | undefined;
/** Ce que chaque test doit refermer, quoi qu'il arrive. */
let aFermer: { travailleurs: Worker[]; worker: WorkerLance | undefined } = {
  travailleurs: [],
  worker: undefined,
};

/** Connexion Redis brute, empruntée à une file — aucun client de plus à installer. */
async function redis(): Promise<ClientRedisBrut> {
  fileTechnique ??= new Queue(NOMS_DE_FILES.rapports, {
    connection: { url: urlRedis },
    prefix: PREFIXE_REDIS,
  });
  return clientBrut(fileTechnique);
}

/** Processeur inerte : aucun job n'est déposé, il ne sera jamais appelé. */
const processeurInerte: Processor = () => Promise.resolve();

/**
 * Attache de vrais travailleurs BullMQ aux files voulues, sous l'identité voulue.
 * C'est la MISE EN SITUATION, pas une imitation de la sonde : ces objets sont ceux
 * que `worker.ts` crée, avec les mêmes options.
 */
async function attacherTravailleurs(files: readonly string[], identite: string): Promise<Worker[]> {
  const travailleurs = files.map(
    (nom) =>
      new Worker(nom, processeurInerte, {
        connection: { url: urlRedis },
        prefix: PREFIXE_REDIS,
        name: identite,
        concurrency: 1,
      }),
  );
  await Promise.all(travailleurs.map((t) => t.waitUntilReady()));
  aFermer.travailleurs.push(...travailleurs);
  return travailleurs;
}

/** Écrit un battement frais pour l'identité voulue, comme le ferait le worker. */
async function ecrireBattement(identite: string): Promise<void> {
  const client = await redis();
  await client.set(
    cleDeBattement(identite),
    new Date().toISOString(),
    'EX',
    TTL_BATTEMENT_SECONDES,
  );
}

beforeAll(async () => {
  await assurerConstruction();
  const conteneur = await demarrerRedis();
  urlRedis = conteneur.getConnectionUrl();
}, 300_000);

afterEach(async () => {
  await Promise.all(aFermer.travailleurs.map((t) => t.close()));
  if (aFermer.worker !== undefined) await aFermer.worker.arreter();
  aFermer = { travailleurs: [], worker: undefined };
  const client = await redis();
  await client.flushall();
});

afterAll(async () => {
  if (fileTechnique !== undefined) await fileTechnique.close();
  await arreterRedis();
});

describe('@critique la sonde de santé du worker voit les pannes', () => {
  it('sort en 1 quand AUCUN worker ne tourne — la panne qui a vécu treize heures', async () => {
    const resultat = await executerSonde(urlRedis);

    expect(
      resultat.code,
      `La sonde a rendu ${String(resultat.code)} alors qu'AUCUN worker ne tourne.\n\n` +
        `C'est le mensonge exact que la sonde remplace : « Up 13 hours (healthy) » sur un\n` +
        `conteneur mort au démarrage. Si ce test ne rougit pas quand rien ne tourne, la\n` +
        `sonde ne vaut pas mieux que le \`pgrep -f node\` qu'elle a remplacé — et le\n` +
        `critère L0 « docker compose up = stack complète » redevient invérifiable.\n\n` +
        `Sortie de la sonde :\n${resultat.sortie}`,
    ).toBe(1);
  }, 120_000);

  it('sort en 0 quand le VRAI worker tourne — sinon la sonde serait rouge en permanence', async () => {
    const worker = demarrerWorker(urlRedis);
    aFermer.worker = worker;

    const resultat = await attendreSonde(urlRedis, 0, 45_000);

    expect(
      resultat.code,
      `La sonde reste à ${String(resultat.code)} alors que dist/worker.js tourne.\n\n` +
        `Une sonde qui ne passe jamais au vert est aussi inutilisable qu'une sonde qui\n` +
        `ment : Docker redémarrerait le conteneur en boucle. Ce test est le pendant\n` +
        `indispensable du précédent — ensemble, ils prouvent que la sonde DISCRIMINE.\n\n` +
        `Sortie de la sonde :\n${resultat.sortie}\n\nJournal du worker :\n${worker.journal()}`,
    ).toBe(0);
  }, 120_000);

  it('sort en 1 quand le battement manque alors que les travailleurs sont attachés — le processus GELÉ', async () => {
    // Les cinq files ont bien un travailleur de cette instance : la vérification
    // d'attachement passe. Seul le battement manque — c'est la signature d'un
    // processus dont la boucle d'événements ne tourne plus, alors que ses
    // connexions Redis, elles, restent ouvertes. `pgrep` voyait un processus vivant.
    await attacherTravailleurs(Object.values(NOMS_DE_FILES), IDENTITE_INSTANCE);

    const resultat = await executerSonde(urlRedis);

    expect(
      resultat.code,
      `La sonde a rendu ${String(resultat.code)} alors que le battement est ABSENT.\n\n` +
        `C'est le cas le plus subtil des quatre, et le seul qui distingue vraiment cette\n` +
        `sonde d'un test de vivacité : un processus figé garde ses connexions ouvertes,\n` +
        `donc reste « attaché » à ses files, mais n'écrit plus rien. Seule l'EXPIRATION\n` +
        `de la clé de battement le trahit — et c'est pour cela qu'elle expire seule\n` +
        `(${String(TTL_BATTEMENT_SECONDES)} s) plutôt que d'être effacée par quelqu'un.\n\n` +
        `Sortie :\n${resultat.sortie}`,
    ).toBe(1);

    expect(
      resultat.sortie,
      `La sonde échoue sans nommer le battement : l'exploitant qui lit\n` +
        `\`docker inspect\` doit savoir SI c'est le battement ou l'attachement qui manque,\n` +
        `sinon le diagnostic recommence à zéro à chaque incident.\n\n${resultat.sortie}`,
    ).toMatch(/battement/i);
  }, 120_000);

  it("sort en 1 quand UNE SEULE file sur cinq n'a pas de travailleur", async () => {
    const toutes = Object.values(NOMS_DE_FILES);
    const quatre = toutes.slice(0, -1);
    const orpheline = toutes[toutes.length - 1] ?? '';

    await attacherTravailleurs(quatre, IDENTITE_INSTANCE);
    await ecrireBattement(IDENTITE_INSTANCE);

    const resultat = await executerSonde(urlRedis);

    expect(
      resultat.code,
      `La sonde a rendu ${String(resultat.code)} avec 4 travailleurs sur 5 files.\n\n` +
        `Une sonde qui se contente de « au moins un travailleur quelque part » serait le\n` +
        `même mensonge en plus petit : la file « ${orpheline} » n'aurait plus personne\n` +
        `pour la dépiler, et les jobs s'y accumuleraient en silence derrière un conteneur\n` +
        `« healthy ». Chaque file déclarée est une NATURE de travail distincte — une\n` +
        `purge RGPD qui n'est jamais dépilée est un défaut de conformité.\n\n` +
        `Sortie :\n${resultat.sortie}`,
    ).toBe(1);

    expect(
      resultat.sortie,
      `La sonde doit NOMMER la file orpheline (« ${orpheline} ») : c'est la seule\n` +
        `information qui rende l'incident actionnable.\n\n${resultat.sortie}`,
    ).toContain(orpheline);
  }, 120_000);

  it('sort en 1 malgré une AUTRE instance en parfaite santé sur le même Redis', async () => {
    // Un second conteneur, sain, branché sur les cinq files et battant régulièrement.
    // Rien de tout cela n'appartient à NOTRE instance.
    const etrangere = `instance-etrangere-${String(process.pid)}`;
    expect(
      etrangere,
      `L'identité étrangère ne doit pas coïncider avec celle de cette machine\n` +
        `(« ${IDENTITE_INSTANCE} »), sinon le test ne prouverait rien.`,
    ).not.toBe(IDENTITE_INSTANCE);

    await attacherTravailleurs(Object.values(NOMS_DE_FILES), etrangere);
    await ecrireBattement(etrangere);

    const resultat = await executerSonde(urlRedis);

    expect(
      resultat.code,
      `La sonde a rendu ${String(resultat.code)} alors que SEULE une autre instance est saine.\n\n` +
        `C'est le mensonge déplacé d'un cran : sans cloisonnement par identité, un\n` +
        `conteneur voisin en bonne santé rendrait « healthy » un conteneur mort, et le\n` +
        `défaut d'origine réapparaîtrait dès qu'on met deux workers sur un Redis partagé\n` +
        `— c'est-à-dire au premier passage à l'échelle. La sonde ne doit compter QUE les\n` +
        `travailleurs et le battement portant « ${IDENTITE_INSTANCE} ».\n\n` +
        `Sortie :\n${resultat.sortie}`,
    ).toBe(1);
  }, 120_000);

  it('sort en 0 pour NOTRE instance sans se laisser troubler par une instance voisine', async () => {
    // L'autre sens de l'isolation : la présence d'un voisin ne doit pas rendre
    // malade une instance qui va bien. Un cloisonnement trop zélé serait tout aussi
    // inexploitable — le conteneur redémarrerait sans raison.
    const etrangere = `instance-etrangere-${String(process.pid)}`;
    await attacherTravailleurs(Object.values(NOMS_DE_FILES), etrangere);
    await ecrireBattement(etrangere);

    const worker = demarrerWorker(urlRedis);
    aFermer.worker = worker;

    const resultat = await attendreSonde(urlRedis, 0, 45_000);

    expect(
      resultat.code,
      `La sonde reste à ${String(resultat.code)} alors que NOTRE worker tourne, au seul motif\n` +
        `qu'une autre instance est branchée sur le même Redis.\n\n` +
        `L'isolation doit filtrer, pas s'affoler : sur un Redis partagé, chaque conteneur\n` +
        `ne juge QUE lui-même. Un faux rouge ici provoquerait des redémarrages en boucle\n` +
        `dès qu'un second worker existe.\n\n` +
        `Sortie :\n${resultat.sortie}\n\nJournal du worker :\n${worker.journal()}`,
    ).toBe(0);
  }, 120_000);

  it('le battement porte une EXPIRATION — un worker mort cesse de tenir la sonde au vert', async () => {
    // Sans expiration, la toute première panne serait invisible pour toujours : la
    // clé écrite à 09 h resterait là à 23 h, et la sonde certifierait un cadavre.
    // C'est la propriété qui rend le signe infalsifiable par un processus mort.
    const worker = demarrerWorker(urlRedis);
    aFermer.worker = worker;
    await attendreSonde(urlRedis, 0, 45_000);

    const client = await redis();
    const dureeRestante = await client.ttl(cleDeBattement(IDENTITE_INSTANCE));

    expect(
      dureeRestante,
      `La clé de battement n'a PAS d'expiration (TTL = ${String(dureeRestante)} ; -1 signifie\n` +
        `« persistante », -2 « absente »).\n\n` +
        `Une clé de battement persistante est pire qu'aucune clé : elle survit au\n` +
        `processus qui l'a écrite et rend la sonde définitivement verte. Toute la\n` +
        `mécanique repose sur le fait que ce signe s'efface TOUT SEUL.`,
    ).toBeGreaterThan(0);

    expect(
      dureeRestante,
      `Le TTL observé (${String(dureeRestante)} s) dépasse la durée déclarée\n` +
        `(${String(TTL_BATTEMENT_SECONDES)} s) : la sonde mettrait plus longtemps que prévu à\n` +
        `voir une panne.`,
    ).toBeLessThanOrEqual(TTL_BATTEMENT_SECONDES);
  }, 120_000);
});
