// =============================================================================
// TESTS DES HORODATAGES DE L'EXPORT — écrits AVANT `horodatage.ts`. L7c.
//
// ⚠ Tests d'A30 (CONCEPTION, TDD). Aucun `@critique` — A36 pour l'acceptation.
//
// CE QUI SE JOUE ICI : un rapport d'audit se rédige AVEC ces heures-là. Écrire
// « 07:30 » pour un entretien tenu à 9 h 30 à Paris n'est pas un défaut
// d'affichage, c'est une erreur de fait dans un livrable opposable. La règle est
// tranchée (`DECISIONS.md` 2026-09-05) : ISO 8601 AVEC le décalage du fuseau de
// MISSION, jamais l'UTC nu de l'API.
//
// Traçabilité : E32 (fuseaux, devises, interface française) · E36.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  dateDuJourDansLeFuseau,
  fuseauEffectif,
  horodatageExport,
  FORMAT_HORODATAGE_EXPORT,
} from './horodatage.js';

/** 14 octobre 2026, 07:30:00 UTC — 09:30 à Paris (heure d'été). */
const INSTANT_ETE = new Date('2026-10-14T07:30:00.000Z');
/** 14 janvier 2026, 07:30:00 UTC — 08:30 à Paris (heure d'hiver). */
const INSTANT_HIVER = new Date('2026-01-14T07:30:00.000Z');

describe('horodatageExport — l’heure telle qu’elle a été vécue', () => {
  it('rend l’heure de Paris avec son décalage d’été', () => {
    expect(horodatageExport(INSTANT_ETE, 'Europe/Paris')).toBe('2026-10-14T09:30:00+02:00');
  });

  it('suit le changement d’heure — le décalage n’est pas une constante', () => {
    expect(horodatageExport(INSTANT_HIVER, 'Europe/Paris')).toBe('2026-01-14T08:30:00+01:00');
  });

  it('rend un décalage NÉGATIF pour une mission à Montréal', () => {
    expect(horodatageExport(INSTANT_ETE, 'America/Toronto')).toBe('2026-10-14T03:30:00-04:00');
  });

  it('rend `+00:00` en UTC, jamais `Z` ni `GMT`', () => {
    // Une seule graphie dans tout le fichier : un lecteur qui trie une colonne
    // ne doit pas tomber sur deux formes du même décalage.
    expect(horodatageExport(INSTANT_ETE, 'UTC')).toBe('2026-10-14T07:30:00+00:00');
  });

  it('traverse le changement de jour — Tokyo est le lendemain', () => {
    expect(horodatageExport(new Date('2026-10-14T16:00:00.000Z'), 'Asia/Tokyo')).toBe(
      '2026-10-15T01:00:00+09:00',
    );
  });

  it('rend `null` pour une date absente — une colonne vide, jamais « Invalid Date »', () => {
    expect(horodatageExport(null, 'Europe/Paris')).toBeNull();
    expect(horodatageExport(undefined, 'Europe/Paris')).toBeNull();
  });

  it('rend `null` pour une date invalide plutôt que de lever', () => {
    expect(horodatageExport(new Date('n’importe quoi'), 'Europe/Paris')).toBeNull();
  });

  it('respecte la forme annoncée dans `mission.json`', () => {
    expect(FORMAT_HORODATAGE_EXPORT).toContain('ISO 8601');
  });
});

describe('fuseauEffectif — un fuseau inconnu ne fait pas tomber un export', () => {
  it('rend le fuseau quand il est connu du moteur', () => {
    expect(fuseauEffectif('Europe/Paris')).toBe('Europe/Paris');
  });

  it('retombe sur UTC quand `missions.timezone` porte une valeur que ICU ignore', () => {
    // `missions.timezone` n'est validé qu'en FORME au 04. Un export qui
    // s'effondrerait sur un fuseau exotique perdrait la mission entière, alors
    // qu'un repli sur UTC — ANNONCÉ dans `mission.json` — la rend exploitable.
    expect(fuseauEffectif('Mars/Olympus_Mons')).toBe('UTC');
    expect(fuseauEffectif('')).toBe('UTC');
  });
});

describe('dateDuJourDansLeFuseau — le nom du fichier porte la date de la mission', () => {
  it('rend AAAAMMJJ dans le fuseau de mission', () => {
    expect(dateDuJourDansLeFuseau(INSTANT_ETE, 'Europe/Paris')).toBe('20261014');
  });

  it('rend la date LOCALE, pas celle d’UTC, quand les deux diffèrent', () => {
    // 23:30 UTC le 14 = 08:30 le 15 à Tokyo. Le nom du fichier doit dire le 15 :
    // c'est le jour où le consultant a produit l'export, là où il se trouve.
    expect(dateDuJourDansLeFuseau(new Date('2026-10-14T23:30:00.000Z'), 'Asia/Tokyo')).toBe(
      '20261015',
    );
  });
});
