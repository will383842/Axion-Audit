// =============================================================================
// LOT L3 / L3c — LE TRADUCTEUR D'ÉCHECS DE CONTRAINTE DU DÉPÔT `org_units`, ÉPROUVÉ
// À SEC : erreurs SYNTHÉTIQUES, aucune base.
//
// ÉCRIT SUR LA SIGNATURE ET LE JSDOC, PAS SUR LE CORPS (09 §5.6) : « lit `code` et
// `constraint` en REMONTANT la chaîne `cause`, sans `instanceof` » ; « la clé
// primaire est un 409 » ; « traduit les échecs de contrainte que ces routes peuvent
// provoquer, et relance tout le reste ». Et, depuis le défaut rendu le 2026-09-02
// (« `position: 2147483648` → 500 »), le SQLSTATE `22003` (valeur numérique hors
// limites) est DÛ en 400 : une valeur calculée en interne (`positionMax + 1` à
// l'import) peut déborder sans passer par Zod — le dépôt est la seconde ceinture.
//
// ⚠ TDD : `traduireEchecDeContrainte` n'est PAS exporté au moment d'écrire ceci.
// Ce fichier rougit à l'import jusqu'à ce que l'implémenteur l'exporte — c'est le
// signal attendu, pas un accident. Aucune ligne de `depot.ts` n'a été modifiée ici.
//
// POURQUOI `../../db.js` EST REMPLACÉ : `depot.ts` importe le pool (qui lit la
// configuration à l'import). Le sujet de ce fichier n'y touche jamais ; le remplacer
// par un objet vide garde le test PUR et exécutable sans variable d'environnement.
// Ce n'est pas un double sur le chemin testé — le chemin testé n'a pas de base.
//
// Traçabilité : E43 (exécutabilité autopilote — conventions d’API, 11 §3) · E33 · 04 (contraintes nommées
// de `org_units`) · P1-4 (identifiant client : conflit, jamais écrasement).
// =============================================================================
import { describe, expect, it, vi } from 'vitest';
import { AppError, ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE } from '@axion/shared';

vi.mock('../../db.js', () => ({ db: {} }));

const { traduireEchecDeContrainte } = await import('./depot.js');

/** Ce que `pg` lève : une `Error` portant `code` (SQLSTATE) et, parfois, `constraint`. */
function erreurPg(code: string, constraint?: string): Error {
  return Object.assign(new Error(`échec factice ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });
}

/** Ce que Drizzle lève : une enveloppe dont `cause` est l'erreur du pilote. */
function enveloppeDrizzle(cause: unknown): Error {
  return new Error('Failed query: insert into "org_units" …', { cause });
}

/** Capture l'`AppError` levée, ou échoue si rien (ou autre chose) n'est levé. */
function capturer(erreur: unknown): AppError {
  try {
    traduireEchecDeContrainte(erreur);
  } catch (levee: unknown) {
    if (levee instanceof AppError) return levee;
    throw new Error(`autre chose qu’une AppError a été levée : ${String(levee)}`);
  }
  throw new Error('rien n’a été levé — la signature promet `never`');
}

/** Assère que l'erreur est RELANCÉE TELLE QUELLE : même objet, pas une copie. */
function attendreRelance(erreur: unknown): void {
  let levee: unknown = Symbol('rien');
  try {
    traduireEchecDeContrainte(erreur);
  } catch (e: unknown) {
    levee = e;
  }
  expect(levee, 'la relance conserve l’IDENTITÉ de l’erreur').toBe(erreur);
}

describe('traduireEchecDeContrainte — la clé primaire (23505)', () => {
  it('@critique `org_units_pkey` ⇒ 409 CONFLICT, `details[].path = id`, et le nom SQL ne fuit pas', () => {
    // P1-4 : l'identifiant vient du client ; deux appareils, un même id : CONFLIT,
    // jamais écrasement. Un 400 dirait « requête malformée » — elle ne l'est pas.
    const levee = capturer(enveloppeDrizzle(erreurPg('23505', 'org_units_pkey')));
    expect(levee.code).toBe(ERROR_CODES.CONFLICT);
    expect(levee.status).toBe(HTTP_STATUS_BY_ERROR_CODE.CONFLICT);
    expect(levee.status).toBe(409);
    expect(levee.details?.map((d) => d.path)).toEqual(['id']);
    expect(levee.message).not.toContain('pkey');
    expect(levee.message, 'phrase française (invariant 5)').toMatch(/[à-ÿ]|identifiant/);
  });

  it('une unicité d’une AUTRE contrainte n’est pas de son ressort : relancée telle quelle', () => {
    attendreRelance(enveloppeDrizzle(erreurPg('23505', 'uq_companies_siren')));
  });
});

describe('traduireEchecDeContrainte — les clés étrangères (23503)', () => {
  // Les six FK de `org_units` au 04, chacune vers le CHAMP camelCase de l'API
  // (11 §3 : snake_case en base ↔ camelCase en TS, jamais de mélange).
  const cas: readonly [string, string][] = [
    ['org_units_mission_id_fkey', 'missionId'],
    ['org_units_parent_id_fkey', 'parentId'],
    ['org_units_service_ref_id_fkey', 'serviceRefId'],
    ['org_units_sector_id_fkey', 'sectorId'],
    ['org_units_proposed_by_fkey', 'proposedBy'],
    ['org_units_merged_into_id_fkey', 'mergedIntoId'],
  ];
  for (const [contrainte, champ] of cas) {
    it(`@critique \`${contrainte}\` ⇒ 400 VALIDATION_FAILED nommant \`${champ}\``, () => {
      const levee = capturer(enveloppeDrizzle(erreurPg('23503', contrainte)));
      expect(levee.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(levee.status).toBe(400);
      expect(levee.details?.map((d) => d.path)).toEqual([champ]);
      expect(levee.message).not.toContain('fkey');
    });
  }

  it('une clé étrangère d’une autre table est relancée telle quelle', () => {
    attendreRelance(enveloppeDrizzle(erreurPg('23503', 'interviews_org_unit_id_fkey')));
  });
});

describe('traduireEchecDeContrainte — les contrôles de valeur (23514)', () => {
  it('@critique un `CHECK` de `org_units_*` ⇒ 400 VALIDATION_FAILED, `path = orgUnit`, la contrainte nommée', () => {
    const levee = capturer(enveloppeDrizzle(erreurPg('23514', 'org_units_kind_check')));
    expect(levee.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(levee.status).toBe(400);
    expect(levee.details?.map((d) => d.path)).toEqual(['orgUnit']);
    expect(levee.details?.[0]?.message).toContain('org_units_kind_check');
  });

  it('un `CHECK` d’une autre table est relancé tel quel', () => {
    attendreRelance(enveloppeDrizzle(erreurPg('23514', 'missions_status_check')));
  });
});

describe('traduireEchecDeContrainte — valeur numérique hors limites (22003)', () => {
  it('@critique un débordement d’entier ⇒ 400 VALIDATION_FAILED avec un détail nommé, jamais un 500', () => {
    // Défaut du 2026-09-02 : `position: 2147483648` remontait en 500. `pg` ne
    // nomme AUCUNE contrainte ni colonne sur ce SQLSTATE : le traducteur doit
    // quand même le reconnaître (c'est une entrée invalide, pas une panne) et
    // rendre un détail exploitable. Le NOM de la colonne pour ce cas n'est fixé
    // par aucun arbitrage — seule sa présence est exigée ici (doute remonté).
    const levee = capturer(enveloppeDrizzle(erreurPg('22003')));
    expect(levee.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(levee.status).toBe(400);
    expect(levee.details?.length ?? 0).toBeGreaterThan(0);
    expect(levee.details?.[0]?.path.length ?? 0).toBeGreaterThan(0);
    expect(levee.message).toMatch(/[à-ÿ]/);
  });
});

describe('traduireEchecDeContrainte — la chaîne `cause`, et tout le reste', () => {
  it('@critique l’erreur du pilote est lue À PLAT (sans enveloppe) comme SOUS enveloppe', () => {
    // « sans `instanceof` » : c'est la FORME (`code` + `constraint`) qui compte,
    // et elle peut se trouver au niveau 0 (pilote nu) ou 1 (Drizzle).
    const aPlat = capturer(erreurPg('23505', 'org_units_pkey'));
    const enveloppee = capturer(enveloppeDrizzle(erreurPg('23505', 'org_units_pkey')));
    expect(aPlat.code).toBe(enveloppee.code);
    expect(aPlat.status).toBe(409);
  });

  it('un SQLSTATE inconnu (`42P01`, table absente) est relancé tel quel — ce n’est pas une faute du client', () => {
    attendreRelance(enveloppeDrizzle(erreurPg('42P01', 'org_units')));
  });

  it('une erreur sans `code` (pas un échec du pilote) est relancée telle quelle', () => {
    attendreRelance(new Error('coupure réseau factice'));
  });

  it('une valeur qui n’est même pas un objet est relancée telle quelle', () => {
    attendreRelance('chaîne factice');
    attendreRelance(null);
  });

  it('un `code` porté par une valeur non textuelle n’est pas un SQLSTATE : relancé', () => {
    attendreRelance(
      Object.assign(new Error('factice'), { code: 23_505, constraint: 'org_units_pkey' }),
    );
  });
});
