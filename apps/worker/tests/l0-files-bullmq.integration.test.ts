// =============================================================================
// LES NOMS DE FILES SONT-ILS ACCEPTÉS PAR BULLMQ ? — le test qui manquait au L0
//
// Le worker n'a JAMAIS démarré, ni en développement ni en staging, depuis le lot
// L0 : les files s'appelaient `axion:rapports`, `axion:llm`… et BullMQ 5 refuse
// au constructeur tout nom contenant « : », dont il se sert comme séparateur de
// clé Redis. Le premier `new Queue()` du module levait, et le processus mourait
// avant sa première ligne de journal.
//
// Rien ne l'a vu pendant treize heures parce que la seule chose qui regardait le
// worker était une sonde qui comptait les processus `node` — et trouvait `tsc`.
//
// CE FICHIER EST LE FILET DE PREMIÈRE LIGNE. Il ne vérifie pas une convention de
// nommage dans l'abstrait : il DEMANDE À BULLMQ, en construisant réellement une
// `Queue` par nom déclaré. C'est la seule vérification qui ne peut pas se tromper,
// parce que l'arbitre est la bibliothèque elle-même. Le jour où quelqu'un ajoutera
// une file `axion:sauvegardes` par habitude, ce test rougira en une seconde au
// lieu de coûter un déploiement.
//
// La contrainte « pas de deux-points » est vérifiée séparément — elle explique
// POURQUOI un nom serait refusé, là où la construction prouve QUE tous passent.
// Les deux ensemble donnent un échec qui se lit sans ouvrir BullMQ.
// =============================================================================
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLES_DE_FILES, NOMS_DE_FILES, PREFIXE_REDIS } from '../src/files.js';
import { arreterRedis, clientBrut, demarrerRedis } from './aide/redis-ephemere.js';

let urlRedis = '';

beforeAll(async () => {
  const conteneur = await demarrerRedis();
  urlRedis = conteneur.getConnectionUrl();
}, 180_000);

afterAll(async () => {
  await arreterRedis();
});

describe('@critique noms de files BullMQ (défaut de production du lot L0)', () => {
  it('aucun nom de file ne contient « : » — le caractère que BullMQ 5 réserve à ses clés', () => {
    const fautifs = Object.entries(NOMS_DE_FILES)
      .filter(([, nom]) => nom.includes(':'))
      .map(([cle, nom]) => `${cle} → « ${nom} »`);

    expect(
      fautifs,
      `Noms de files contenant « : » : ${fautifs.join(', ')}.\n\n` +
        `BullMQ 5 lève « Queue name cannot contain : » DANS LE CONSTRUCTEUR\n` +
        `(classes/queue-base.js) : le module de déclaration ne se charge même pas, et le\n` +
        `worker meurt avant d'avoir journalisé quoi que ce soit. C'est exactement le\n` +
        `défaut qui a fait tourner la stack treize heures sans worker.\n` +
        `Le cloisonnement des clés se fait par l'option « prefix », JAMAIS par le nom —\n` +
        `voir l'encadré en tête de apps/worker/src/files.ts.`,
    ).toEqual([]);
  });

  it('BULLMQ ACCEPTE chaque nom déclaré : « new Queue(nom, …) » ne lève pour aucun', async () => {
    const refus: string[] = [];
    const ouvertes: Queue[] = [];

    try {
      // Garde de cardinalité. Ce test tire sa couverture d'une LISTE : vidée, la boucle
      // ne tourne pas, le constat reste vide et le test passe au VERT en n'ayant rien
      // vérifié. Prouvé par injection le 28/08 — liste mise à zéro, fichier « 10 passed ».
      // Vitest attrape le fichier qui n'enregistre AUCUN test ; il ne peut rien contre un
      // test qui s'exécute à vide. La borne est un plancher, pas un gel : les cinq files déclarées sont le minimum.
      expect(
        CLES_DE_FILES.length,
        `La liste CLES_DE_FILES est tombée sous 5 entrées : ce test perdrait de la
` +
          `couverture en silence. Ajouter des cas est souhaitable, en retirer doit être
` +
          `un geste conscient — et alors cette borne se met à jour dans le même commit.`,
      ).toBeGreaterThanOrEqual(5);

      for (const cle of CLES_DE_FILES) {
        const nom = NOMS_DE_FILES[cle];
        try {
          ouvertes.push(new Queue(nom, { connection: { url: urlRedis }, prefix: PREFIXE_REDIS }));
        } catch (erreur) {
          const details = erreur instanceof Error ? erreur.message : String(erreur);
          refus.push(`${cle} → « ${nom} » : ${details}`);
        }
      }

      expect(
        refus,
        `BullMQ REFUSE ${String(refus.length)} des ${String(CLES_DE_FILES.length)} files déclarées :\n  ` +
          `${refus.join('\n  ')}\n\n` +
          `C'est LE test qui aurait attrapé le défaut au lot L0. Il ne juge pas le nom\n` +
          `selon une règle que nous aurions transcrite — il le soumet à la bibliothèque\n` +
          `qui l'acceptera ou non en production. Un nom refusé ici est un worker qui ne\n` +
          `démarrera pas, et aucune sonde ne pourra rattraper cela.`,
      ).toEqual([]);

      expect(
        ouvertes.length,
        `Toutes les files déclarées doivent être constructibles (${String(CLES_DE_FILES.length)} attendues).`,
      ).toBe(CLES_DE_FILES.length);
    } finally {
      await Promise.all(ouvertes.map((f) => f.close()));
    }
  }, 60_000);

  it('BullMQ REFUSE bien un nom à deux-points — sans quoi les deux tests ci-dessus ne prouveraient rien', () => {
    // Ancrage. Les deux tests précédents montrent que les noms ACTUELS passent ; ils
    // seraient tout aussi verts si BullMQ avait cessé de contrôler quoi que ce soit,
    // ou si l'on avait mal lu la règle. On vérifie donc que le garde-fou est VIVANT,
    // en soumettant le nom exact qui a fait tomber le worker au lot L0.
    // Le nom est un littéral local : il ne revient JAMAIS dans `files.ts`.
    let leve: Error | undefined;
    try {
      new Queue(`${PREFIXE_REDIS}:rapports`, {
        connection: { url: urlRedis },
        prefix: PREFIXE_REDIS,
      });
    } catch (erreur) {
      leve = erreur instanceof Error ? erreur : new Error(String(erreur));
    }

    expect(
      leve,
      `BullMQ a ACCEPTÉ le nom « ${PREFIXE_REDIS}:rapports », celui-là même qui empêchait\n` +
        `le worker de démarrer. Deux lectures possibles, toutes deux à traiter :\n` +
        `  · la version de BullMQ a changé de comportement — alors la contrainte de\n` +
        `    nommage doit être réexaminée, pas subie ;\n` +
        `  · ou le diagnostic d'origine était inexact.\n` +
        `Dans les deux cas, les tests de ce fichier ne prouvent plus ce qu'ils annoncent.`,
    ).toBeDefined();

    expect(
      leve?.message ?? '',
      `BullMQ lève, mais pas pour le motif attendu : « ${leve?.message ?? ''} ».`,
    ).toMatch(/cannot contain/i);
  });

  it("les clés Redis produites restent cloisonnées sous « axion: » — l'intention du nommage d'origine est PRÉSERVÉE", async () => {
    const file = new Queue(NOMS_DE_FILES.rapports, {
      connection: { url: urlRedis },
      prefix: PREFIXE_REDIS,
    });

    try {
      expect(
        file.qualifiedName,
        `Le nom qualifié de la file devrait être « ${PREFIXE_REDIS}:${NOMS_DE_FILES.rapports} ».\n` +
          `Retirer les deux-points du NOM ne devait rien retirer au CLOISONNEMENT : le\n` +
          `préfixe était le besoin (Redis peut être partagé, 02 §11.1), le nom n'était que\n` +
          `le moyen. Si les clés ne sont plus préfixées, la correction du défaut BullMQ a\n` +
          `emporté avec elle ce qu'elle devait préserver.`,
      ).toBe(`${PREFIXE_REDIS}:${NOMS_DE_FILES.rapports}`);

      // On ne se contente pas du nom qualifié : on regarde ce qui atterrit VRAIMENT
      // dans Redis. Une file n'écrit rien tant qu'on ne l'a pas sollicitée.
      const client = await clientBrut(file);
      await file.add('sonde-de-nommage', { origine: 'test A16' });

      const clefs = await client.keys('*');
      const horsCloison = clefs.filter((c) => !c.startsWith(`${PREFIXE_REDIS}:`));

      expect(
        horsCloison,
        `Clés Redis écrites HORS du préfixe « ${PREFIXE_REDIS}: » :\n  ${horsCloison.join('\n  ')}\n\n` +
          `Toutes les clés du projet doivent vivre sous le préfixe : le Redis de\n` +
          `production peut être partagé avec d'autres applications, et une clé qui\n` +
          `s'en échappe est une collision qui attend son heure.\n` +
          `Clés observées : ${clefs.join(', ')}`,
      ).toEqual([]);

      expect(
        clefs.some((c) => c.startsWith(`${PREFIXE_REDIS}:${NOMS_DE_FILES.rapports}:`)),
        `Aucune clé « ${PREFIXE_REDIS}:${NOMS_DE_FILES.rapports}:… » après l'ajout d'un job.\n` +
          `Le test ne prouverait rien : il faut que la file ait réellement écrit pour que\n` +
          `l'absence de clé hors cloison ait un sens.\nClés observées : ${clefs.join(', ')}`,
      ).toBe(true);
    } finally {
      await file.obliterate({ force: true });
      await file.close();
    }
  }, 60_000);
});
