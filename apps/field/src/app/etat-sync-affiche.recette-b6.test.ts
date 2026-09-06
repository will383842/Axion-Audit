// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B6** de la recette novice n°1 (A54,
// 2026-09-06) : « deux pastilles contradictoires sur le même écran ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient
// à A27 (09 §5.6). Aucun n'est marqué `@critique`.
//
// ── CE QU'ILS TIENNENT, ET CE QU'ILS NE TRANCHENT PAS ──────────────────────
// Ils tiennent la RÈGLE : un fait, une source. L'état affiché vient du port de
// sync, la traduction est unique, et l'appareil affiche le statut le plus
// défavorable de ses missions. Ils ne tiennent PAS l'énoncé — quel mot la
// pastille doit porter avant L6a est un doute de spec ouvert, arbitré par
// Williams (rapport A54 §8-5). C'est pourquoi aucun de ces tests n'attend un
// libellé : ils attendent un ÉTAT, et l'état ne changera pas avec le mot.
//
// La seule chose qu'ils interdisent explicitement, parce que le pack l'interdit
// (`LOT_L5.md` §3.6), c'est `synchronise` tant que rien n'a été synchronisé.
//
// Traçabilité : E7 (remontée continue), E38 (sauvegarde terrain), E6 (hors ligne).
// =============================================================================
import { describe, expect, it } from 'vitest';
import type { StatutSync } from '../local/port-sync.js';
import {
  MENTION_SYNC_INDISPONIBLE,
  statutSyncAppareil,
  versEtatPastille,
} from './etat-sync-affiche.js';

describe('B6 — la traduction du statut est unique et ne verdit jamais à tort', () => {
  it('`indisponible` ne devient JAMAIS `synchronise` (LOT_L5 §3.6)', () => {
    expect(versEtatPastille('indisponible')).not.toBe('synchronise');
    expect(versEtatPastille('jamais_synchronisee')).not.toBe('synchronise');
  });

  it('chaque statut du port a exactement un état de pastille', () => {
    const tous: readonly StatutSync[] = [
      'indisponible',
      'jamais_synchronisee',
      'a_jour',
      'en_attente',
      'echec',
    ];
    expect(tous.map(versEtatPastille)).toEqual([
      'hors-ligne',
      'hors-ligne',
      'synchronise',
      'en-attente',
      'echec',
    ]);
  });
});

describe('B6 — l’appareil affiche le statut le plus DÉFAVORABLE de ses missions', () => {
  it('un échec parmi trois est un échec : l’auditeur a des données quelque part', () => {
    expect(statutSyncAppareil(['a_jour', 'echec', 'en_attente'])).toBe('echec');
  });

  it('« en attente » l’emporte sur « à jour » : une file non vide n’est pas un appareil à jour', () => {
    expect(statutSyncAppareil(['a_jour', 'en_attente'])).toBe('en_attente');
  });

  it('aucune mission ⇒ `indisponible`, jamais `a_jour` : « rien à dire » n’est pas « tout va bien »', () => {
    expect(statutSyncAppareil([])).toBe('indisponible');
  });

  it('toutes les missions indisponibles ⇒ indisponible — l’état de cette version', () => {
    expect(statutSyncAppareil(['indisponible', 'indisponible'])).toBe('indisponible');
  });
});

describe('B6 — la mention dit ce que la pastille ne peut pas tenir en deux mots', () => {
  it('elle nomme l’indisponibilité ET le geste qui protège la journée', () => {
    expect(MENTION_SYNC_INDISPONIBLE).toMatch(/n’est pas encore disponible/i);
    expect(MENTION_SYNC_INDISPONIBLE).toMatch(/sauvegarde de secours/i);
  });
});
