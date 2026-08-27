// =============================================================================
// LOT L1 — CRITÈRE D'ACCEPTATION 1 : « MIGRATIONS UP/DOWN PROPRES » (07 §12)
//
// Appliquer, redescendre, réappliquer. Une descente qui laisse un reliquat
// (table, type, index orphelin) est un ÉCHEC : la réversibilité est ce qui rend
// un déploiement rattrapable (02 §11.2, garde-fou dry-run puis apply §30.6).
//
// Écrit depuis la SPÉCIFICATION (fichier 04) par A16, jamais depuis les
// migrations d'A12 (09 §5.6). La base éphémère est créée puis SUPPRIMÉE.
// =============================================================================
import { basename } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliquerDescente,
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  fichiersMigration,
  lancerMigrations,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  photographierCatalogue,
  porteUneDescente,
  reliquats,
  supprimerBaseEphemere,
  type Catalogue,
} from './aide/base-l1.js';
import { TABLES_ATTENDUES_L1, TABLES_PHASE_2_3 } from './aide/specification-l1.js';

let nomBase = '';
let client: Client | undefined;

let apresMontee1: Catalogue;
let apresDescente: Catalogue;
let apresMontee2: Catalogue;

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('migrations');
  nomBase = base.nom;
  client = await connecter(base.url);

  // Le cycle complet est joué UNE fois ; chaque test lit ensuite une photo.
  // Ainsi aucun test ne dépend de l'ordre d'exécution de son voisin.
  await appliquerMontee(base.url);
  apresMontee1 = await photographierCatalogue(client);

  await appliquerDescente(base.url);
  apresDescente = await photographierCatalogue(client);

  await appliquerMontee(base.url);
  apresMontee2 = await photographierCatalogue(client);
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

describe('L1 — migrations up/down (07 §12, critère 1)', () => {
  it('@critique la montée crée les 43 tables du fichier 04 exigées au lot L1', () => {
    const presentes = new Set(apresMontee1.tables);
    const manquantes = TABLES_ATTENDUES_L1.filter((t) => !presentes.has(t));

    expect(
      manquantes,
      `Tables absentes après application des migrations : ${manquantes.join(', ')}.\n` +
        `Attendu (07 §12 ligne L1) : « Schéma SQL fichier 04 V2.2 INTÉGRAL — toutes tables\n` +
        `et colonnes des avenants ». Le fichier 04 §7 est la source UNIQUE du lot L1 et se\n` +
        `transcrit LITTÉRALEMENT (11 §2). Une table oubliée ne se voit qu'au lot qui en a\n` +
        `besoin — c'est-à-dire trop tard.`,
    ).toEqual([]);
  });

  it('les tables « PHASE 2/3 » du fichier 04 ne sont pas créées au lot L1, elles appartiennent aux migrations de leurs lots', () => {
    const presentes = new Set(apresMontee1.tables);
    const enAvance = TABLES_PHASE_2_3.filter((t) => presentes.has(t));

    expect(
      enAvance,
      `DIVERGENCE DE LECTURE À ARBITRER (A01, DECISIONS.md) — pas un défaut constaté.\n` +
        `Tables de Phase 2/3 présentes après le lot L1 : ${enAvance.join(', ')}.\n\n` +
        `Le pack se contredit sur ce point précis, et aucune règle de précédence ne le\n` +
        `tranche (la précédence §32-36 > §24-31 > §16-22 > §1-15 vaut À L'INTÉRIEUR d'un\n` +
        `fichier) :\n` +
        `  • fichier 04 §7 range surveys, survey_responses et solutions_catalog sous\n` +
        `    « PHASE 2/3 (DDL de référence — créées par les migrations de LEURS lots) » ;\n` +
        `  • fichier 07 §12 ligne L1 commande « Schéma SQL fichier 04 V2.2 INTÉGRAL\n` +
        `    (toutes tables + colonnes des avenants) », et CLAUDE.md §0 pose que « le brief\n` +
        `    d'un lot vient EXCLUSIVEMENT de la table du fichier 07 ».\n\n` +
        `Ce test porte la lecture d'A16 (fichier 04) ; A12 a retenu celle du fichier 07.\n` +
        `L'enjeu n'est pas cosmétique : le diff schéma-vs-04 de la CI (11 §7) compare le\n` +
        `schéma réel à un manifeste EXTRAIT du fichier 04 — les deux lectures produisent\n` +
        `deux manifestes différents, et c'est la porte P-A qui trancherait au pire moment.\n` +
        `Attendu : une entrée DECISIONS.md signée A01, puis UNE ligne à corriger — soit\n` +
        `ce test, soit la migration 0007. Aucun des deux agents ne décide seul (11 §8.2).`,
    ).toEqual([]);
  });

  it("chaque migration livrée porte sa DESCENTE — sans quoi le critère « up/down » n'est pas vérifiable", () => {
    const migrations = fichiersMigration();

    expect(
      migrations.length,
      `Aucun fichier .sql dans apps/api/drizzle/ (07 §12 ligne L1).`,
    ).toBeGreaterThan(0);

    const sansDescente = migrations.filter((f) => !porteUneDescente(f)).map((f) => basename(f));

    expect(
      sansDescente,
      `Migrations sans descente : ${sansDescente.join(', ')}.\n` +
        `Attendu (07 §12 ligne L1) : « migrations up/down propres ». Le pack ne tranche pas\n` +
        `la convention d'écriture : ce test accepte une section sentinelle « -- @DOWN »\n` +
        `dans le fichier, ou un fichier frère « <nom>.down.sql ». Ce qu'il exige, c'est\n` +
        `qu'une descente EXISTE — une migration irréversible bloque le garde-fou de\n` +
        `déploiement (02 §11.2, §30.6) le jour où il faut reculer.`,
    ).toEqual([]);
  });

  it('@critique la descente ne laisse AUCUN reliquat en base', () => {
    const restes = reliquats(apresDescente);

    expect(
      restes,
      `La descente laisse ${String(restes.length)} objet(s) orphelin(s) :\n  ${restes.join('\n  ')}\n\n` +
        `Attendu (07 §12 ligne L1) : « migrations up/down PROPRES ». Une descente\n` +
        `partielle est pire qu'une descente absente : le rollback suivant échouera sur un\n` +
        `objet déjà présent, en pleine fenêtre d'incident. Seul le journal de migration a\n` +
        `le droit de survivre.`,
    ).toEqual([]);
  });

  it('@critique la remontée après descente reproduit EXACTEMENT le même schéma', () => {
    expect(
      apresMontee2.tables,
      `Les tables diffèrent entre la 1re et la 2e montée : une migration n'est pas\n` +
        `rejouable. Attendu : up → down → up rend un schéma identique (07 §12 ligne L1).`,
    ).toEqual(apresMontee1.tables);

    expect(
      apresMontee2.colonnes,
      `Les colonnes diffèrent entre la 1re et la 2e montée.\n` +
        `Cause classique : une descente incomplète laisse une colonne, et la remontée\n` +
        `l'ignore silencieusement (CREATE TABLE IF NOT EXISTS). Le schéma « à jour » sur\n` +
        `staging cesse alors de correspondre au fichier 04 sans qu'aucune migration n'ait\n` +
        `échoué.`,
    ).toEqual(apresMontee1.colonnes);

    expect(
      apresMontee2.contraintes,
      `Les contraintes diffèrent entre la 1re et la 2e montée : une contrainte\n` +
        `(UNIQUE, CHECK, FK) n'a pas été recréée. Une base sans ses contraintes accepte\n` +
        `les données qu'elle devait refuser — le défaut le plus coûteux du lot L1.`,
    ).toEqual(apresMontee1.contraintes);

    expect(
      apresMontee2.index,
      `Les index diffèrent entre la 1re et la 2e montée (04 §7.1 : index critiques).`,
    ).toEqual(apresMontee1.index);
  });

  it("le dry-run `db:migrate:check` n'applique RIEN sur une base vierge (02 §30.6)", async () => {
    // `infra/scripts/deploy.sh` appelle `pnpm db:migrate:check` PUIS `pnpm db:migrate`
    // à chaque déploiement. Un dry-run qui écrit serait un garde-fou qui casse ce
    // qu'il prétend protéger : on vérifie qu'après le check, la base est INTACTE.
    const base = await creerBaseEphemere('dryrun');
    try {
      await lancerMigrations(base.url, ['--check']);

      const verification = await connecter(base.url);
      try {
        const catalogue = await photographierCatalogue(verification);
        const creees = catalogue.tables.filter((t) => TABLES_ATTENDUES_L1.includes(t));
        expect(
          creees,
          `Le dry-run a créé ${String(creees.length)} table(s) : ${creees.join(', ')}.\n` +
            `02 §30.6 : « migration avec garde-fou : DRY-RUN puis apply ». Un dry-run qui\n` +
            `applique retire au déploiement sa seule étape réversible.`,
        ).toEqual([]);
      } finally {
        await verification.end();
      }
    } finally {
      await supprimerBaseEphemere(base.nom);
    }
  }, 180_000);
});
