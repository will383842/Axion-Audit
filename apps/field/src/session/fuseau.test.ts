// =============================================================================
// LE REPLI « UTC NOMMÉ » — LE SEUL CHOIX DE CONCEPTION DE L5d, ET SA GARDE
//
// ── POURQUOI CE FICHIER EXISTE ───────────────────────────────────────────────
// Réserve R1 du rejeu croisé A29 (2026-09-08). Écrit par A26, qui n'a produit
// aucune ligne de `session/fuseau.ts` ni d'aucun de ses appelants (09 §5.6).
//
// L5d ferme un écart d'invariant 5 : un fuseau de mission inconnu ne doit JAMAIS
// faire retomber l'affichage sur celui de l'APPAREIL. Le correctif tient dans
// `formaterDateHeureMission`, et dans UN choix — rendre l'instant en UTC et le
// NOMMER, plutôt que le taire (l'auditeur perdrait ce qui distingue deux
// sauvegardes d'une même clé USB) ou le rendre nu (ce serait le mensonge qu'on
// corrige). A29 a mesuré que ce choix n'était gardé par rien : la mutation
// `return enUtc;` laissait 1231 tests verts. Une correction qu'on peut défaire
// intégralement sans un seul rouge n'est pas livrée, elle est posée.
//
// ── CE QUE CHAQUE ASSERTION MORD ─────────────────────────────────────────────
// Chaque `it` a été éprouvé par une mutation de `session/fuseau.ts`, appliquée
// puis annulée dans la même seconde — A26 ne corrige ni ne modifie la production
// (09 §5.6), il vérifie que ses assertions MORDENT :
//   · `return enUtc;` — le repli perd son nom              → 2 `it` rouges ;
//   · `if (fuseauMission !== null)` seul — une graphie      → 2 `it` rouges
//     que le moteur ignore redevient un fuseau, `Intl` lève ;
//   · le garde d'instant illisible retiré (mention          → 1 `it` rouge ;
//     orpheline « (heure UTC) » sans instant devant)
//   · `formaterDateHeure(iso, undefined)` dans le repli —   → 1 `it` rouge dès
//     le fuseau de l'appareil revient par la fenêtre.          que la machine
//                                                              n'est pas à UTC.
// Le dernier point est le seul qui dépende de la machine, et c'est pourquoi il
// est DOUBLÉ par les tests d'écran, qui injectent, eux, un fuseau d'appareil
// divergent (`ecrans/journee/invariant5-fuseau.acceptation-l5d.test.tsx`).
//
// ── OÙ VIVENT LES DEUX AÎNÉES ────────────────────────────────────────────────
// `formaterHeure` / `formaterDateHeure` sont couvertes par la section 4 de
// `session/peripherie-entretien.test.ts`. Ce fichier-ci ne couvre QUE la
// fonction née en L5d, pour que la mutation se rejoue en une seconde.
//
// Traçabilité : E32 (fuseaux, devises, interface française).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { formaterDateHeureMission } from './fuseau.js';

/**
 * L'instant de référence — celui des tests d'écran de L5d.
 *
 * Choisi pour que le JOUR CIVIL lui-même diffère d'un fuseau à l'autre : un
 * décalage d'heure se lit mal dans un échec de test, un décalage de date ne se
 * discute pas.
 */
const INSTANT = '2026-09-06T22:30:00.000Z';

/** Un fuseau de mission très écarté d'UTC (+14), donc impossible à confondre. */
const FUSEAU_MISSION = 'Pacific/Kiritimati';

/**
 * Le rendu attendu, calculé SANS passer par le module testé.
 *
 * Recopier `'07/09/2026 12:30'` en dur dériverait au prochain ICU et l'échec
 * parlerait alors d'autre chose que de l'invariant ; le calculer avec la
 * fonction sous test ne prouverait rien du tout.
 */
function dateHeureAu(fuseau: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Date.parse(INSTANT));
}

/** `07/09/2026 12:30` — l'heure locale du site audité. */
const ATTENDU_MISSION = dateHeureAu(FUSEAU_MISSION);
/** `06/09/2026 22:30` — l'instant en UTC, NU. Il ne s'affiche jamais ainsi. */
const UTC_NU = dateHeureAu('UTC');

describe('formaterDateHeureMission — le fuseau de la MISSION, ou l’aveu (03 §22.2)', () => {
  it('@critique fuseau connu : l’heure locale du site, et rien à avouer', () => {
    expect(ATTENDU_MISSION).not.toBe(UTC_NU); // le harnais voit-il la différence ?

    const rendu = formaterDateHeureMission(INSTANT, FUSEAU_MISSION);

    expect(rendu).toBe(ATTENDU_MISSION);
    // Aucune mention parasite : quand le cadre est connu, il n'y a rien à dire
    // de plus, et une mention systématique finirait par ne plus être lue.
    expect(rendu).not.toMatch(/UTC/);
  });

  it('@critique fuseau inconnu (`null`) : l’instant en UTC, NOMMÉ comme tel', () => {
    const rendu = formaterDateHeureMission(INSTANT, null);

    // ① L'instant n'est pas perdu — c'est lui qui distingue la sauvegarde de
    //    mardi de celle de mercredi (constat A27 du 2026-09-06).
    expect(rendu).toContain(UTC_NU);
    // ② Et il est NOMMÉ. C'est l'assertion que la mutation `return enUtc;` mord :
    //    sans elle, le repli redevient un UTC nu présenté comme heure du site,
    //    c'est-à-dire l'écart d'invariant 5 que L5d corrige.
    expect(rendu).toMatch(/UTC/);
    expect(rendu).not.toBe(UTC_NU);
    // ③ Ce n'est pas l'heure du site : elle est inconnue, et on ne la devine pas.
    expect(rendu).not.toContain(ATTENDU_MISSION);
  });

  it('@critique fuseau vide : « inconnu », jamais « celui de la machine »', () => {
    // `missions.timezone` arrive du serveur, et rien en base n'interdit la chaîne
    // vide. `Intl` la refuse (`RangeError`) : la passer ferait planter l'écran, la
    // confondre avec « absent » ferait emprunter le fuseau de l'appareil. Elle
    // vaut « inconnu » — le même aveu, exactement.
    expect(formaterDateHeureMission(INSTANT, '')).toBe(formaterDateHeureMission(INSTANT, null));
    expect(formaterDateHeureMission(INSTANT, '')).toMatch(/UTC/);
  });

  it('@critique graphie inconnue du moteur : inconnue aussi, jamais une exception', () => {
    // `missions.timezone` est un `TEXT` (04) qu'aucune contrainte ne tient en
    // IANA, et qu'un `.axionbackup` écrit par un autre appareil peut remplir de
    // « UTC+2 ». `Intl` LÈVE dessus, au milieu d'un rendu : l'écran de
    // restauration tombe. L'aveu dû est le même que pour un fuseau absent —
    // l'instant est exact, son cadre n'est pas exploitable.
    for (const graphie of ['UTC+2', 'Europe/Pariss', 'Paris', '  ']) {
      expect(formaterDateHeureMission(INSTANT, graphie), graphie).toBe(
        formaterDateHeureMission(INSTANT, null),
      );
    }
  });

  it('@critique instant illisible : chaîne vide, sans mention orpheline', () => {
    // Le contrat des deux aînées (`''` plutôt qu'« Invalid Date »), et rien de
    // plus : « (heure UTC) » seul, sans instant devant, dirait qu'on sait quelque
    // chose qu'on ne sait pas.
    expect(formaterDateHeureMission('pas une date', null)).toBe('');
    expect(formaterDateHeureMission('', null)).toBe('');
    expect(formaterDateHeureMission('pas une date', FUSEAU_MISSION)).toBe('');
  });
});
