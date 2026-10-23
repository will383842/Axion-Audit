// =============================================================================
// LOT S1 (L8 BRANCHÉ) — RBAC EXHAUSTIF DE `POST /v1/missions/:id/compute-scores`.
//
// ⚠ TESTS ÉCRITS AVANT LE CODE (09 §5.6, CLAUDE.md §4 : RBAC = zone critique). Ils sont
// ROUGES pour la bonne raison : la route n'existe pas, Fastify rend 404
// `Route POST:/v1/missions/:id/compute-scores not found` — pas une erreur de compilation.
//
// ── LA POLITIQUE ÉCRITE ICI (05 §8.5, 06, 03 §34.1) ─────────────────────────
//   · admin (rôle global)                         → 200, membre ou non (la console est la sienne) ;
//   · rôle SUR LA MISSION `lead`                  → 200 (le brief du lot le dit : « admin et lead ») ;
//   · membre `consultant` / `analyste` / `lecteur` → 403 FORBIDDEN : la mission existe pour lui,
//     le droit manque — calculer ÉCRASE les scores affichés, ce n'est pas une lecture ;
//   · NON-MEMBRE (tout rôle global sauf admin)    → 404 NOT_FOUND, jamais 403 : un 403 dirait
//     « elle existe, mais pas pour vous » — l'oracle que la convention L7b ferme
//     (DECISIONS.md 2026-09-02, repris par l'export L7c) ;
//   · sans jeton, jeton invalide, compte désactivé → 401 UNAUTHENTICATED ;
//   · identifiant mal formé → 400 VALIDATION_FAILED ; mission inconnue → 404 NOT_FOUND.
// Un REFUS n'écrit RIEN : `block_scores` et `unit_scores` restent vides.
//
// Invariant 2 : missions FICTIVES. Secrets FACTICES (11 §2).
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@axion/shared';
import {
  calculer,
  creerCompte,
  demarrerContexte,
  lireBlockScores,
  lireUnitScores,
  rattacher,
  semerJeuPrincipal,
  semerMission,
  type Compte,
  type Contexte,
  type JeuPrincipal,
} from './aide/semis-scoring.js';
import { uuidv7 } from './aide/base-l1.js';

let ctx: Contexte | undefined;
function c(): Contexte {
  if (ctx === undefined) throw new Error('contexte non démarré');
  return ctx;
}

let jeu: JeuPrincipal;
let jeuTemoin: JeuPrincipal;

beforeAll(async () => {
  ctx = await demarrerContexte('l8s1_rbac');
  jeu = await semerJeuPrincipal(c());
  jeuTemoin = await semerJeuPrincipal(c());
}, 300_000);

afterAll(async () => {
  if (ctx !== undefined) await ctx.fermer();
});

/**
 * CONTRÔLE DE VACUITÉ COMMUN : la route EXISTE et sert un administrateur.
 * Sans lui, tout test qui attend un 404 serait vert sur une route absente (Fastify
 * rend lui aussi un 404 NOT_FOUND pour une route inconnue). Mission dédiée : ce
 * témoin écrit des scores, que les tests « refus n'écrit rien » ne doivent pas voir.
 */
async function exigerRouteVivante(): Promise<void> {
  const temoin = await calculer(c(), jeuTemoin.mission.id, jeuTemoin.admin.jeton);
  expect(temoin.statut, `la route n'existe pas ou refuse l'admin : ${temoin.texte}`).toBe(200);
}

type RoleGlobal = 'admin' | 'consultant' | 'analyste' | 'lecteur';
type RoleMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

interface CasMatrice {
  readonly libelle: string;
  readonly roleGlobal: RoleGlobal;
  /** `null` = NON rattaché à la mission. */
  readonly roleMission: RoleMission | null;
  readonly statut: number;
  readonly code: string | null;
}

/** La matrice complète : chaque rôle global × chaque rattachement possible. */
const MATRICE: readonly CasMatrice[] = [
  // — AUTORISÉS —
  {
    libelle: 'admin, non rattaché',
    roleGlobal: 'admin',
    roleMission: null,
    statut: 200,
    code: null,
  },
  {
    libelle: 'admin, rattaché lead',
    roleGlobal: 'admin',
    roleMission: 'lead',
    statut: 200,
    code: null,
  },
  {
    libelle: 'consultant, lead de la mission',
    roleGlobal: 'consultant',
    roleMission: 'lead',
    statut: 200,
    code: null,
  },
  {
    libelle: 'analyste, lead de la mission',
    roleGlobal: 'analyste',
    roleMission: 'lead',
    statut: 200,
    code: null,
  },
  // — MEMBRES SANS LE DROIT : 403 —
  {
    libelle: 'consultant membre (non lead)',
    roleGlobal: 'consultant',
    roleMission: 'consultant',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  {
    libelle: 'consultant rôle mission analyste',
    roleGlobal: 'consultant',
    roleMission: 'analyste',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  {
    libelle: 'consultant rôle mission lecteur',
    roleGlobal: 'consultant',
    roleMission: 'lecteur',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  {
    libelle: 'analyste membre analyste',
    roleGlobal: 'analyste',
    roleMission: 'analyste',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  {
    libelle: 'lecteur membre lecteur',
    roleGlobal: 'lecteur',
    roleMission: 'lecteur',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  {
    libelle: 'lecteur membre consultant',
    roleGlobal: 'lecteur',
    roleMission: 'consultant',
    statut: 403,
    code: ERROR_CODES.FORBIDDEN,
  },
  // — NON-MEMBRES : 404, jamais 403 —
  {
    libelle: 'consultant NON rattaché',
    roleGlobal: 'consultant',
    roleMission: null,
    statut: 404,
    code: ERROR_CODES.NOT_FOUND,
  },
  {
    libelle: 'analyste NON rattaché',
    roleGlobal: 'analyste',
    roleMission: null,
    statut: 404,
    code: ERROR_CODES.NOT_FOUND,
  },
  {
    libelle: 'lecteur NON rattaché',
    roleGlobal: 'lecteur',
    roleMission: null,
    statut: 404,
    code: ERROR_CODES.NOT_FOUND,
  },
];

describe('@critique la matrice rôles × route — chaque case, autorisations ET refus', () => {
  for (const cas of MATRICE) {
    it(`@critique ${cas.libelle} → ${String(cas.statut)}${cas.code === null ? '' : ` ${cas.code}`}`, async () => {
      // Une mission NEUVE par case : un refus doit laisser SA mission intacte, et
      // un succès ne doit pas servir de preuve à la case suivante.
      const mission = await semerMission(c());
      const compte = await creerCompte(c(), cas.roleGlobal, 'matrice');
      if (cas.roleMission !== null) await rattacher(c(), mission.id, compte.id, cas.roleMission);

      const reponse = await calculer(c(), mission.id, compte.jeton);

      expect(reponse.statut, reponse.texte).toBe(cas.statut);
      if (cas.statut === 404) await exigerRouteVivante();
      if (cas.code !== null) {
        const erreur = (reponse.json as { error?: { code?: string } } | null)?.error;
        expect(erreur?.code).toBe(cas.code);
        // Le refus n'écrit RIEN.
        expect(await lireBlockScores(c(), mission.id)).toHaveLength(0);
        expect(await lireUnitScores(c(), mission.id)).toHaveLength(0);
      }
    });
  }

  it('@critique CONTRÔLE DE VACUITÉ : la matrice contient bien des cases de chaque famille', () => {
    // Si quelqu'un vidait une famille de la matrice, le reste resterait vert.
    expect(MATRICE.filter((x) => x.statut === 200).length).toBeGreaterThanOrEqual(3);
    expect(MATRICE.filter((x) => x.statut === 403).length).toBeGreaterThanOrEqual(5);
    expect(MATRICE.filter((x) => x.statut === 404).length).toBeGreaterThanOrEqual(3);
    // Les quatre rôles globaux sont éprouvés.
    expect(new Set(MATRICE.map((x) => x.roleGlobal))).toEqual(
      new Set(['admin', 'consultant', 'analyste', 'lecteur']),
    );
  });
});

describe('@critique les refus d’identité — 401, et rien n’est écrit', () => {
  it('@critique sans jeton → 401 UNAUTHENTICATED', async () => {
    const reponse = await calculer(c(), jeu.mission.id);
    expect(reponse.statut, reponse.texte).toBe(401);
    expect((reponse.json as { error: { code: string } }).error.code).toBe(
      ERROR_CODES.UNAUTHENTICATED,
    );
    expect(await lireBlockScores(c(), jeu.mission.id)).toHaveLength(0);
  });

  it('@critique jeton invalide → 401', async () => {
    const reponse = await calculer(c(), jeu.mission.id, 'jeton.bidon.invalide');
    expect(reponse.statut, reponse.texte).toBe(401);
    expect(await lireBlockScores(c(), jeu.mission.id)).toHaveLength(0);
  });

  it('@critique un admin DÉSACTIVÉ → 401 (un jeton valide ne suffit pas)', async () => {
    const admin: Compte = await creerCompte(c(), 'admin', 'desactive');
    await c().bd.query('UPDATE users SET is_active = false WHERE id = $1', [admin.id]);
    const reponse = await calculer(c(), jeu.mission.id, admin.jeton);
    expect(reponse.statut, reponse.texte).toBe(401);
    expect(await lireBlockScores(c(), jeu.mission.id)).toHaveLength(0);
  });
});

describe('@critique mission inconnue, mission d’un autre périmètre, identifiant mal formé', () => {
  it('@critique une mission INCONNUE → 404 NOT_FOUND, même pour un admin', async () => {
    const admin = await creerCompte(c(), 'admin', 'inconnue');
    const reponse = await calculer(c(), uuidv7(), admin.jeton);
    await exigerRouteVivante();
    expect(reponse.statut, reponse.texte).toBe(404);
    expect((reponse.json as { error: { code: string } }).error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('@critique le LEAD d’une mission ne calcule PAS celle d’une autre : 404, rien d’écrit', async () => {
    // `jeu.lead` est lead de `jeu.mission` UNIQUEMENT.
    const autre = await semerMission(c());
    const reponse = await calculer(c(), autre.id, jeu.lead.jeton);
    expect(reponse.statut, reponse.texte).toBe(404);
    expect((reponse.json as { error: { code: string } }).error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(await lireBlockScores(c(), autre.id)).toHaveLength(0);
    // Et la SIENNE, elle, est servie : sans ce contrôle un 404 de route absente suffirait.
    const sienne = await calculer(c(), jeu.mission.id, jeu.lead.jeton);
    expect(sienne.statut, sienne.texte).toBe(200);
  });

  it('@critique le message du 404 d’un non-membre est celui d’une mission inexistante', async () => {
    const etranger = await creerCompte(c(), 'consultant', 'oracle');
    const inexistante = await calculer(c(), uuidv7(), etranger.jeton);
    const existante = await calculer(c(), jeu.mission.id, etranger.jeton);
    await exigerRouteVivante();
    expect(existante.statut).toBe(404);
    expect(inexistante.statut).toBe(404);
    expect(existante.texte).toBe(inexistante.texte);
  });

  it('un identifiant qui n’est pas un UUID → 400 VALIDATION_FAILED', async () => {
    const admin = await creerCompte(c(), 'admin', 'uuid-invalide');
    const reponse = await calculer(c(), 'pas-un-uuid', admin.jeton);
    expect(reponse.statut, reponse.texte).toBe(400);
    expect((reponse.json as { error: { code: string } }).error.code).toBe(
      ERROR_CODES.VALIDATION_FAILED,
    );
  });
});
