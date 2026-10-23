// =============================================================================
// TÉMOIN DU BANC E2E AVEC VRAIE API (L6c-2, étape 1)
//
// Ce fichier ne teste aucun scénario du 05 §9.8 : il prouve que le BANC fonctionne,
// avant que les huit scénarios s'y posent. Si ce témoin est rouge, les huit le seront
// pour une raison qui n'a rien à voir avec la sync.
//
// Ce qu'il traverse, sans double : formulaire de connexion de production → proxy du
// front (`/api` sans CORS) → API construite (processus à part) → PostgreSQL réel →
// retour du réseau → vrai `GET /v1/sync/pull` → ligne `sync_log` écrite par le serveur.
//
// Limite assumée (11 §7) : `context.setOffline` couvre les scénarios réseau ; les
// service workers iOS ne sont PAS couverts par Playwright — le mode avion RÉEL sur
// iPad se rejoue à la main aux portes P-C et P-E.
//
// Invariant 2 : mission et entreprise FICTIVES.
// =============================================================================
import { expect, test } from '@playwright/test';
import { ouvrirAppareilConnecte } from '../fixtures/appareil-connecte.js';
import { avecBase } from '../banc/semis-serveur.js';

test.describe('Banc E2E avec vraie API — témoin', () => {
  test('@critique connexion réelle puis premier pull réel qui réussit', async () => {
    const appareil = await ouvrirAppareilConnecte('temoin-banc');
    try {
      expect(appareil.statutPremierPull, 'le premier pull doit rendre 200').toBe(200);

      const corps = appareil.corpsPremierPull as {
        serverTime?: unknown;
        changes?: unknown;
        nextSince?: unknown;
      } | null;
      expect(corps, 'le corps du pull doit être du JSON').not.toBeNull();
      expect(typeof corps?.serverTime).toBe('string');
      expect(typeof corps?.changes).toBe('object');

      // Preuve CÔTÉ SERVEUR : l'appel est venu de l'auditeur rattaché, et le serveur l'a tracé.
      const lignes = await avecBase((bd) =>
        bd.query<{ direction: string; status: string }>(
          `SELECT direction, status FROM sync_log WHERE user_id = $1 AND direction = 'pull'`,
          [appareil.auditeur.id],
        ),
      );
      expect(
        lignes.rows.length,
        'une ligne sync_log « pull » pour cet auditeur',
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await appareil.contexte.close();
    }
  });
});
