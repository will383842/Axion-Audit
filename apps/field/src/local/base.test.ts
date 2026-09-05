// =============================================================================
// TESTS DE LA BASE LOCALE — ouverture, garde de version, `meta` — lot L5 / L5a.
//
// Écrits par A26 depuis 05 §31-1 (schéma local versionné, compatibilité
// ascendante) et les signatures/JSDoc exportées de `base.ts` :
// `ouvrirBaseLocale(nom?)`, `BaseTropRecenteError`, `lireMeta` / `ecrireMeta` /
// `effacerMeta`, `cleCurseurPull`, `cleEmbarquement`, `SCHEMA_LOCAL`,
// `VERSION_SCHEMA_LOCAL`, `NOM_BASE_LOCALE`.
//
// Traçabilité : E6 (hors ligne total — une base plus récente que l'app ne doit
// jamais être ouverte « en dégradé » : c'est ainsi qu'on perd des données).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BaseLocale,
  BaseTropRecenteError,
  CLES_META,
  NOM_BASE_LOCALE,
  SCHEMA_LOCAL,
  VERSION_SCHEMA_LOCAL,
  cleCurseurPull,
  cleEmbarquement,
  ecrireMeta,
  effacerMeta,
  lireMeta,
  ouvrirBaseLocale,
} from './base.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const noms: string[] = [];
let compteur = 0;
function nomUnique(): string {
  compteur += 1;
  const nom = `axion-test-base-${String(compteur)}`;
  noms.push(nom);
  return nom;
}

afterEach(async () => {
  for (const nom of noms.splice(0)) await Dexie.delete(nom);
});

describe('SCHEMA_LOCAL / VERSION_SCHEMA_LOCAL (05 §31-1)', () => {
  it('le schéma est une suite de versions strictement croissantes à partir de 1', () => {
    expect(SCHEMA_LOCAL.length).toBeGreaterThan(0);
    SCHEMA_LOCAL.forEach((etape, i) => {
      expect(etape.version).toBe(i + 1);
    });
  });

  it('VERSION_SCHEMA_LOCAL est la dernière version déclarée', () => {
    expect(VERSION_SCHEMA_LOCAL).toBe(SCHEMA_LOCAL[SCHEMA_LOCAL.length - 1]?.version);
  });

  it('le nom par défaut de la base ne contient aucune référence client (invariant 2)', () => {
    expect(NOM_BASE_LOCALE).toMatch(/^[a-z-]+$/);
  });
});

describe('ouvrirBaseLocale', () => {
  it('ouvre une base neuve à la version courante, avec ses neuf tables', async () => {
    const base = await ouvrirBaseLocale(nomUnique());
    expect(base).toBeInstanceOf(BaseLocale);
    expect(base.isOpen()).toBe(true);
    expect(base.verno).toBe(VERSION_SCHEMA_LOCAL);
    expect(base.tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'missions',
        'interviews',
        'answers',
        'attachments',
        'outbox',
        'meta',
      ]),
    );
    base.close();
  });

  // POURQUOI UN MARQUEUR, ET NON `VersionError` : prouvé ici, sur la base
  // livrée. Dexie 4 ouvre SANS ERREUR une base dont la version IndexedDB sur
  // disque est plus récente que celle que le code déclare — `verno` rend la
  // version déclarée, jamais celle du disque. Un garde fondé sur `VersionError`
  // est donc du code mort (constat A26 du 2026-09-02). Ce test documente le trou
  // que le marqueur `meta['schema:version']` ferme.
  it('preuve : Dexie 4 n’émet PAS VersionError sur une base plus récente — la version IndexedDB ne suffit pas', async () => {
    const nom = nomUnique();
    const future = new Dexie(nom);
    future.version(VERSION_SCHEMA_LOCAL + 1).stores({ outbox: 'opId', meta: 'cle' });
    await future.open();
    future.close();

    const base = new BaseLocale(nom);
    await expect(base.open()).resolves.toBeDefined();
    expect(base.verno).toBe(VERSION_SCHEMA_LOCAL);
    base.close();
  }, 20_000);

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un garde qui compare la version IndexedDB
  // (voir la preuve ci-dessus), ou pire, qui supprime et recrée la base « pour
  // repartir propre » — avec les ops non synchronisées d'une version plus
  // récente de l'app.
  it('@critique un marqueur `schema:version` SUPÉRIEUR à VERSION_SCHEMA_LOCAL ⇒ `BaseTropRecenteError` {trouvée, attendue}, base intacte', async () => {
    const nom = nomUnique();
    // Une base ouverte NORMALEMENT par une app « future » : elle y laisse une op
    // en file et un marqueur de schéma plus grand que le nôtre.
    const future = await ouvrirBaseLocale(nom);
    await future.outbox.add({
      opId: '0191e2a0-0000-7000-8000-00000000fu7r',
      missionId: MISSION_ID,
      entite: 'answer',
      entiteId: '0191e2a0-0000-7000-8000-00000000d0aa',
      action: 'upsert',
      clientUpdatedAt: '2026-09-02T08:00:00.000Z',
      queuedAt: '2026-09-02T08:00:00.000Z',
      statut: 'en_attente',
      tentatives: 0,
      derniereErreur: null,
      charge: { v: 1, n: 'AAAA', c: 'AAAA' },
    });
    await ecrireMeta(future, CLES_META.versionSchema, VERSION_SCHEMA_LOCAL + 1);
    future.close();

    let erreur: unknown = null;
    try {
      await ouvrirBaseLocale(nom);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(BaseTropRecenteError);
    if (erreur instanceof BaseTropRecenteError) {
      expect(erreur.versionTrouvee).toBe(VERSION_SCHEMA_LOCAL + 1);
      expect(erreur.versionAttendue).toBe(VERSION_SCHEMA_LOCAL);
    }

    // Rien n'a été touché : l'op est toujours là, le marqueur n'a pas été abaissé.
    const relecture = new BaseLocale(nom);
    await relecture.open();
    expect(await relecture.outbox.count()).toBe(1);
    expect(await lireMeta(relecture, CLES_META.versionSchema)).toBe(VERSION_SCHEMA_LOCAL + 1);
    relecture.close();
  }, 20_000);

  it('une ouverture réussie écrit le marqueur `schema:version` = VERSION_SCHEMA_LOCAL', async () => {
    const base = await ouvrirBaseLocale(nomUnique());
    expect(await lireMeta(base, CLES_META.versionSchema)).toBe(VERSION_SCHEMA_LOCAL);
    base.close();
  });

  it('le message de `BaseTropRecenteError` est en français et guide (mettre à jour l’app)', async () => {
    const nom = nomUnique();
    const future = await ouvrirBaseLocale(nom);
    await ecrireMeta(future, CLES_META.versionSchema, VERSION_SCHEMA_LOCAL + 1);
    future.close();
    let message = '';
    try {
      await ouvrirBaseLocale(nom);
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : '';
    }
    expect(message).toMatch(/[a-zéèêàç]/);
    expect(message).toMatch(/mettez|mise à jour|rechargez/i);
  });
});

describe('meta — lireMeta / ecrireMeta / effacerMeta', () => {
  it('une clé absente se lit `undefined` ; écrite, elle se relit ; effacée, elle redevient absente', async () => {
    const base = await ouvrirBaseLocale(nomUnique());
    expect(await lireMeta(base, 'inconnue')).toBeUndefined();
    await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette fictive');
    expect(await lireMeta(base, CLES_META.libelleAppareil)).toBe('Tablette fictive');
    await ecrireMeta(base, CLES_META.libelleAppareil, 'Tablette fictive 2');
    expect(await lireMeta(base, CLES_META.libelleAppareil)).toBe('Tablette fictive 2');
    await effacerMeta(base, CLES_META.libelleAppareil);
    expect(await lireMeta(base, CLES_META.libelleAppareil)).toBeUndefined();
    base.close();
  });

  it('une valeur `null` écrite se relit `null` (distinct d’« absente »)', async () => {
    const base = await ouvrirBaseLocale(nomUnique());
    await ecrireMeta(base, cleCurseurPull(MISSION_ID), null);
    expect(await lireMeta(base, cleCurseurPull(MISSION_ID))).toBeNull();
    base.close();
  });

  it('les clés par mission sont préfixées et distinctes par mission', () => {
    expect(cleCurseurPull(MISSION_ID)).toBe(`${CLES_META.prefixeCurseurPull}${MISSION_ID}`);
    expect(cleEmbarquement(MISSION_ID)).toBe(`${CLES_META.prefixeEmbarquement}${MISSION_ID}`);
    expect(cleCurseurPull(MISSION_ID)).not.toBe(
      cleCurseurPull('0191e2a0-0000-7000-8000-00000000f2de'),
    );
    expect(cleCurseurPull(MISSION_ID)).not.toBe(cleEmbarquement(MISSION_ID));
  });
});
