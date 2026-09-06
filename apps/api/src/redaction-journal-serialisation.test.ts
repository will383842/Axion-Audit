// =============================================================================
// CONTRE-ÉPREUVE DU CORRECTIF F-01 — « la censure a bien tourné, sur un autre objet »
//
// Ce fichier est le test de REPRODUCTION MINIMAL du défaut F-01 relevé par A51
// (`docs/portes/VERDICT_A51_SECURITE_2026-08-31.md`, §4.3). Il n'est PAS la suite
// de tests du correctif : celle-ci sera écrite par un agent qui n'a pas produit le
// code corrigé (09 §5.6). Il est ici pour une seule raison, exigée avant livraison —
// PROUVER PAR BASCULE : ces quatre cas sont ROUGES sur `main` à `62193b8` et VERTS
// après le correctif. Un test qui n'a jamais été rouge ne prouve rien.
//
// LE DÉFAUT, en une phrase : `parcourir` censurait un objet en itérant ses
// propriétés propres énumérables ; pino sérialise ensuite cet objet par un chemin
// qui ne passe PAS par elles (`toJSON()`, ou un sac d'octets bruts). La censure
// avait bien tourné, son verdict était vrai — pour l'objet qu'elle avait examiné,
// qui n'était pas celui qui partait sur le réseau.
//
// POURQUOI CE FICHIER VIT DANS `apps/api/src/` : même raison que
// `redaction-journal.test.ts` — `packages/shared` ne dépend pas de pino, et éprouver
// la politique sans pino reviendrait à tester une imitation de `redact`.
//
// Traçabilité : E33, E42 · CLAUDE.md §2 (« aucune donnée personnelle dans les logs »).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { pino, type Logger } from 'pino';
import { OPTIONS_REDACTION_JOURNAL } from '@axion/shared';

const NOM = 'Sophie Bernard';
const COURRIEL = 'jean.dupont@exemple.fr';
const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';

interface Banc {
  readonly journal: Logger;
  readonly sortie: () => string;
}

/** Une instance pino nue, portant EXACTEMENT la politique de production. */
function banc(): Banc {
  const bouts: string[] = [];
  const journal = pino(
    {
      level: 'trace',
      redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
    },
    {
      write(morceau: string): void {
        bouts.push(morceau);
      },
    },
  );
  return { journal, sortie: () => bouts.join('') };
}

describe('la sérialisation alternative ne contourne pas la censure', () => {
  it("@critique une `URL` journalisée n'emporte ni adresse ni jeton", () => {
    const { journal, sortie } = banc();

    journal.info({ cible: new URL(`https://axion/v1/users?email=${COURRIEL}&token=${JETON}`) });

    // TÉMOIN — sans lui, ce cas passerait au vert si l'URL disparaissait entièrement
    // du journal : on exige que la ROUTE survive (06 §10.2, journal diagnosticable).
    expect(sortie()).toContain('/v1/users');
    expect(sortie()).not.toContain(COURRIEL);
    expect(sortie()).not.toContain(JETON);
  });

  it('@critique un `Buffer` journalisé ne déverse pas ses octets', () => {
    const { journal, sortie } = banc();
    const morceau = Buffer.from(`person_name=${NOM}`);

    // TÉMOIN de la fuite réelle : sans correctif, pino émet le tableau `data` de
    // `Buffer.prototype.toJSON()`. La sentinelle n'y figure pas EN TOUTES LETTRES —
    // c'est précisément ce qui rendrait un `not.toContain(NOM)` seul menteur.
    const octets = [...morceau].join(',');

    journal.info({ morceau });

    expect(sortie()).not.toContain(octets);
    expect(sortie()).not.toContain(NOM);
  });

  it("@critique un type INCONNU porteur d'un `toJSON` est censuré comme les autres", () => {
    const { journal, sortie } = banc();

    // Ni `URL` ni `Buffer` : la règle porte sur la PROPRIÉTÉ (une sérialisation qui
    // ne passe pas par les propriétés énumérables), pas sur une liste de types.
    class EnveloppeTierce {
      toJSON(): Record<string, string> {
        return { person_name: NOM, contact: COURRIEL };
      }
    }

    journal.info({ enveloppe: new EnveloppeTierce() });

    expect(sortie()).not.toContain(NOM);
    expect(sortie()).not.toContain(COURRIEL);
  });

  it('@critique une `Date` reste lisible — la règle générale ne mange pas les horodatages', () => {
    const { journal, sortie } = banc();

    journal.info({ occurredAt: new Date('2026-08-31T05:10:00.000Z') });

    expect(sortie()).toContain('2026-08-31T05:10:00.000Z');
  });
});
