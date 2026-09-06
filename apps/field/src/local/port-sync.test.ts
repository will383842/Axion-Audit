// =============================================================================
// TESTS DU PORT DE SYNC INERTE ET DE L'ALERTE DE L'INVARIANT 8 — lot L5 / L5a.
//
// Écrits par A26 depuis `LOT_L5.md` §3.6 (« Elle rend `{ statut: 'indisponible' }`
// et l'écran l'affiche tel quel — jamais une pastille verte »), 05 §9.7 (« alerte
// automatique “aucune sync depuis 24 h” »), l'invariant 8 (« aucune donnée ne vit
// sur un seul appareil > 24 h ») et les signatures/JSDoc exportées de
// `port-sync.ts`.
//
// Traçabilité : E38 (sauvegarde terrain — sync ≥ 1×/j + alerte) · E7 (remontée
// continue — le port existe pour que L6a le remplace, pas l'étende).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  DELAI_ALERTE_SANS_SYNC_MS,
  creerPortSyncInerte,
  evaluerAlerteSauvegarde,
  portSyncInerte,
} from './port-sync.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const MAINTENANT_MS = Date.parse('2026-09-02T18:00:00.000Z');
const UNE_HEURE_MS = 60 * 60 * 1000;

function il_y_a(ms: number): string {
  return new Date(MAINTENANT_MS - ms).toISOString();
}

// =============================================================================
// A. evaluerAlerteSauvegarde — fonction pure, énumérée
// =============================================================================
describe('evaluerAlerteSauvegarde (invariant 8, 05 §9.7)', () => {
  it('le délai d’alerte est 24 h — la plus stricte des deux lectures (calendaire vs ouvrée)', () => {
    expect(DELAI_ALERTE_SANS_SYNC_MS).toBe(24 * UNE_HEURE_MS);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une alerte calculée sur la date de la
  // dernière TENTATIVE au lieu du dernier SUCCÈS, ou qui se tait quand la
  // dernière sync est inconnue — c'est précisément l'appareil qui n'a jamais
  // poussé qui porte le plus de données uniques.
  it('@critique jamais synchronisé + opérations en attente ⇒ alerte déclenchée, message en français', () => {
    const alerte = evaluerAlerteSauvegarde(null, 12, MAINTENANT_MS);
    expect(alerte.declenchee).toBe(true);
    expect(alerte.message).toMatch(/[a-zéèêàç]/);
  });

  it('@critique dernière sync il y a 25 h + opérations en attente ⇒ déclenchée', () => {
    const alerte = evaluerAlerteSauvegarde(il_y_a(25 * UNE_HEURE_MS), 3, MAINTENANT_MS);
    expect(alerte.declenchee).toBe(true);
    expect(alerte.message).not.toBeNull();
  });

  it('dernière sync il y a 1 h ⇒ pas d’alerte, message null', () => {
    const alerte = evaluerAlerteSauvegarde(il_y_a(UNE_HEURE_MS), 3, MAINTENANT_MS);
    expect(alerte.declenchee).toBe(false);
    expect(alerte.message).toBeNull();
  });

  it('la frontière est le délai lui-même : 24 h − 1 s ne déclenche pas, 24 h + 1 s déclenche', () => {
    const avant = evaluerAlerteSauvegarde(
      il_y_a(DELAI_ALERTE_SANS_SYNC_MS - 1000),
      1,
      MAINTENANT_MS,
    );
    const apres = evaluerAlerteSauvegarde(
      il_y_a(DELAI_ALERTE_SANS_SYNC_MS + 1000),
      1,
      MAINTENANT_MS,
    );
    expect(avant.declenchee).toBe(false);
    expect(apres.declenchee).toBe(true);
  });

  it('le compte d’opérations non mesuré (`null`) ne fait pas taire l’alerte de délai', () => {
    const alerte = evaluerAlerteSauvegarde(il_y_a(30 * UNE_HEURE_MS), null, MAINTENANT_MS);
    expect(alerte.declenchee).toBe(true);
  });

  it('propriété : `message` est non nul SI ET SEULEMENT SI `declenchee` — sur toute la grille', () => {
    const dernieres = [
      null,
      il_y_a(0),
      il_y_a(UNE_HEURE_MS),
      il_y_a(23 * UNE_HEURE_MS),
      il_y_a(25 * UNE_HEURE_MS),
      il_y_a(72 * UNE_HEURE_MS),
    ];
    const attentes = [null, 0, 1, 250];
    for (const derniere of dernieres) {
      for (const attente of attentes) {
        const alerte = evaluerAlerteSauvegarde(derniere, attente, MAINTENANT_MS);
        expect(alerte.message !== null).toBe(alerte.declenchee);
      }
    }
  });

  it('une date de dernière sync illisible est traitée comme « jamais » (jamais comme « à l’instant »)', () => {
    const alerte = evaluerAlerteSauvegarde('pas une date', 5, MAINTENANT_MS);
    expect(alerte.declenchee).toBe(true);
  });
});

// =============================================================================
// B. Le port inerte — il ne ment pas
// =============================================================================
describe('portSyncInerte (LOT_L5.md §3.6)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : la tentation nommée par la note — un port
  // « qui répond tout va bien ». `succes`, `a_jour` ou `0 en attente` par défaut
  // seraient chacun une pastille verte sans serveur.
  it('@critique synchroniserMaintenant rend `indisponible`, 0 opération montée, un message en français', async () => {
    const resultat = await portSyncInerte.synchroniserMaintenant(MISSION_ID);
    expect(resultat.statut).toBe('indisponible');
    expect(resultat.operationsMontees).toBe(0);
    expect(resultat.message).toMatch(/[a-zéèêàç]/);
  });

  it('@critique etat() avant tout rafraîchissement : `indisponible`, compteurs `null` (non mesuré ≠ 0), alerte déclenchée', () => {
    const port = creerPortSyncInerte();
    const etat = port.etat(MISSION_ID);
    expect(etat.missionId).toBe(MISSION_ID);
    expect(etat.statut).toBe('indisponible');
    expect(etat.derniereSyncReussieLe).toBeNull();
    expect(etat.operationsEnAttente).toBeNull();
    expect(etat.operationsBloquees).toBeNull();
    expect(etat.alerte.declenchee).toBe(true);
  });

  it('rafraichirEtat expose un compte VRAI sans changer le statut', () => {
    const port = creerPortSyncInerte();
    port.rafraichirEtat(MISSION_ID, 7, 2);
    const etat = port.etat(MISSION_ID);
    expect(etat.statut).toBe('indisponible');
    expect(etat.operationsEnAttente).toBe(7);
    expect(etat.operationsBloquees).toBe(2);
    expect(etat.alerte.declenchee).toBe(true);
  });

  it('les instantanés sont PAR mission : rafraîchir l’une ne renseigne pas l’autre', () => {
    const port = creerPortSyncInerte();
    port.rafraichirEtat(MISSION_ID, 4, 0);
    expect(port.etat('0191e2a0-0000-7000-8000-00000000f2de').operationsEnAttente).toBeNull();
    expect(port.etat(MISSION_ID).operationsEnAttente).toBe(4);
  });

  it('deux fabriques sont indépendantes (aucun état de module partagé)', () => {
    const a = creerPortSyncInerte();
    const b = creerPortSyncInerte();
    a.rafraichirEtat(MISSION_ID, 1, 0);
    expect(b.etat(MISSION_ID).operationsEnAttente).toBeNull();
  });
});
