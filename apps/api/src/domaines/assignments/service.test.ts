// =============================================================================
// LA GARDE « SESSION CONDUITE ⇒ AUDITEUR OBLIGATOIRE » — TESTÉE EN PUR
//
// Arbitrage de Williams du 2026-09-02 (« conducted_by nullable »), clause (d) :
// « la règle métier explicite dans le service, ET TESTÉE ». La revue croisée A17
// (B-3) a mesuré que la garde était exportée, documentée, appelée à un endroit
// qui ne peut pas la faire lever — et testée nulle part. Une garde qu'on n'a
// jamais vue refuser ne prouve rien de plus qu'une garde qu'on n'a jamais vue
// accepter. Ce fichier la fait refuser.
//
// POURQUOI EN PUR (projet `unit`, aucune base) : `exigerAuditeurSiSessionConduite`
// est une fonction pure sur un couple `{ status, conductedBy }`, exportée AVANT
// son appelant réel — la synchronisation L6a, seule à faire passer une session
// au-delà de `non_demarre` (mesuré : aucune route de L3 n'écrit
// `interviews.status`). L'éprouver ici, sans conteneur, coûte quinze lignes et
// rend la clause (d) vraie ; l'éprouver par HTTP est impossible tant que L6a
// n'existe pas.
//
// Écrit par le pilote A01 — qui n'a pas écrit la garde (09 §5.6 : le code de test
// n'est jamais écrit par l'agent qui a écrit le code testé).
//
// Traçabilité : E39 (machine à états mission) · E25 (zéro oubli : plan
// d'entretiens, transitions gardées) · E43 (exécutabilité autopilote — contrat
// d'ops) · invariants 3 et 7.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { AppError, STATUTS_SESSION, estSessionConduite } from '@axion/shared';
import { uuidv7 } from 'uuidv7';

// `config.ts` valide `process.env` à l'import : les valeurs sont FACTICES et
// posées avant l'import dynamique du service (même dispositif que les tests
// unitaires du socle d'authentification).
process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_assignments';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

// -----------------------------------------------------------------------------
// PRÉCHAUFFAGE — le coût du PREMIER import, payé hors chronomètre.
//
// CE QUI SE PASSAIT, MESURÉ (A16, 2026-09-09, Node 24, 8 cœurs) : les cinq cas de
// ce fichier sont de la logique pure et coûtent 1 à 12 ms — SAUF UN, toujours le
// même, le premier à appeler `chargerGarde()`. Celui-là payait seul le chargement
// à froid de `./service.js` et de son graphe (`db.js` → Drizzle et le pilote
// postgres, `depot.js`, `journal/service.js`, `@axion/shared`) :
//
//   fichier isolé, cache Vite tiède ........................ 2 733 – 2 760 ms
//   suite unitaire complète, machine au repos .............. 5 313 ms → ÉCHEC
//   suite unitaire complète, 6 cœurs sur 8 occupés ......... 5 190 ms → ÉCHEC
//   fichier isolé, cache Vite chaud ........................ 1 418 ms
//
// Les cas SUIVANTS, qui appellent le MÊME `chargerGarde()`, mettent 1 à 4 ms : le
// module est alors dans le cache ESM. La preuve est là — ce n’était jamais
// l’assertion qui coûtait, c’était l’import, facturé à qui le déclenche.
//
// Un plafond plus grand aurait rendu le cas vert sans le rendre rapide, et aurait
// converti un signal en silence. Le coût est donc déplacé ici, où il n’est sur le
// chronomètre d’AUCUN cas : les cinq gardent leur budget de 5 s intact et mesurent
// enfin ce qu’ils prétendent mesurer — la garde, et non le temps que met cette
// machine à résoudre des modules.
//
// MÊME MOTIF, MÊME REMÈDE que `auth/socle.test.ts` et `en-tetes-amont-jumeau.test.ts`
// (2026-09-01), et le plafond du crochet est le leur, pour leur raison : un
// chargement de module n’a pas de budget de temps à tenir. Si ce crochet met
// vraiment deux minutes, ce n’est plus une contention, c’est une panne — et il
// échouera.
// -----------------------------------------------------------------------------
beforeAll(async () => {
  await import('./service.js');
}, 120_000);

async function chargerGarde() {
  const { exigerAuditeurSiSessionConduite } = await import('./service.js');
  return exigerAuditeurSiSessionConduite;
}

describe('estSessionConduite — un cas par statut de l’énumération du 04', () => {
  it('@critique `non_demarre` n’est pas conduite ; `en_cours` et `termine` le sont', () => {
    // Attrape une implémentation qui listerait un statut de trop ou de moins :
    // l'énumération du 04 a exactement trois valeurs, chacune est nommée ici.
    expect(STATUTS_SESSION).toStrictEqual(['non_demarre', 'en_cours', 'termine']);
    expect(estSessionConduite('non_demarre')).toBe(false);
    expect(estSessionConduite('en_cours')).toBe(true);
    expect(estSessionConduite('termine')).toBe(true);
  });
});

describe('exigerAuditeurSiSessionConduite — planifiée sans auditeur possible, conduite avec', () => {
  it('@critique une session PLANIFIÉE sans auditeur passe — c’est exactement ce que le plan §32.4 produit', async () => {
    const garde = await chargerGarde();
    expect(() => {
      garde({ status: 'non_demarre', conductedBy: null });
    }).not.toThrow();
  });

  it('@critique une session EN COURS sans auditeur est refusée : 409, code `auditeur_requis`, message français', async () => {
    // Attrape l'implémentation qui ne vérifie que `termine`, ou qui lève un 400
    // (la requête est parfaite, c'est l'ÉTAT de la ressource qui s'y oppose —
    // même raisonnement que le motif manquant d'une transition, 2026-09-01).
    const garde = await chargerGarde();
    let levee: unknown;
    try {
      garde({ status: 'en_cours', conductedBy: null });
    } catch (erreur) {
      levee = erreur;
    }
    expect(levee).toBeInstanceOf(AppError);
    const erreur = levee as AppError;
    expect(erreur.code).toBe('ILLEGAL_STATE_TRANSITION');
    expect(erreur.status).toBe(409);
    expect(erreur.details).toBeDefined();
    const detail = erreur.details?.find((d) => d.path === 'conductedBy');
    expect(detail?.code).toBe('auditeur_requis');
    expect(detail?.message ?? '').toMatch(/auditeur/);
    // Invariant 5 : le message est de l'interface, jamais un code brut.
    expect(erreur.message).not.toMatch(/auditeur_requis|en_cours|conductedBy/);
  });

  it('@critique une session TERMINÉE sans auditeur est refusée de la même façon', async () => {
    const garde = await chargerGarde();
    expect(() => {
      garde({ status: 'termine', conductedBy: null });
    }).toThrow(AppError);
  });

  it('une session conduite AVEC auditeur passe — la garde ne refuse que l’absence', async () => {
    // Attrape une garde inversée, ou une garde qui refuserait tout ce qui n'est
    // pas planifié.
    const garde = await chargerGarde();
    expect(() => {
      garde({ status: 'en_cours', conductedBy: uuidv7() });
    }).not.toThrow();
    expect(() => {
      garde({ status: 'termine', conductedBy: uuidv7() });
    }).not.toThrow();
  });
});
