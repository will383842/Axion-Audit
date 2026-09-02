// =============================================================================
// AMORCE DU PROJET `interface` — le nettoyage du DOM ne dépend plus de la mémoire
// de celui qui écrit le test.
// =============================================================================
// POURQUOI CE FICHIER EXISTE, et il vient d'un piège mesuré le 2026-08-31.
//
// `@testing-library/react` enregistre lui-même un `afterEach(cleanup)` — MAIS
// SEULEMENT si `globals: true`. Le projet `interface` ne le déclare pas (et ne
// doit pas : ce dépôt importe `describe`/`it`/`expect` explicitement, ce qui rend
// chaque test lisible sans connaître la configuration). L'enregistrement
// automatique ne se produisait donc JAMAIS.
//
// CONSÉQUENCE, telle que l'agent qui écrivait les tests l'a nommée : chaque
// fichier devait appeler `cleanup()` lui-même, et **un fichier qui l'oublie fait
// fuir son DOM entre les tests**. Relevé sur les 26 fichiers livrés : 25
// l'appelaient, un ne l'appelait pas.
//
// CE QUI REND CE PIÈGE MÉCHANT — et c'est pour cela qu'il est fermé ici plutôt
// que corrigé fichier par fichier : il ne casse RIEN tout de suite. Le DOM
// résiduel d'un test précédent reste dans le document, et le test suivant trouve
// alors DEUX éléments là où il en attend un. Selon l'ordre d'exécution, il rougit,
// ou il passe en interrogeant le mauvais élément — c'est-à-dire qu'il devient un
// test qui ment. Une discipline qui repose sur le souvenir de chaque auteur finit
// toujours par avoir un trou ; celui-ci en avait déjà un sur son premier lot.
//
// Les appels manuels des 25 autres fichiers restent inoffensifs : `cleanup()` est
// idempotent. Ils deviennent simplement superflus.
// =============================================================================
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// -----------------------------------------------------------------------------
// `window.matchMedia` — jsdom ne l'implémente pas, et un composant qui lit
// `prefers-reduced-motion` ou la largeur d'écran (les trois zones de la session,
// 03 §33.3, se réordonnent sous 900 px) lèverait `TypeError` au premier rendu.
// Le shim répond « aucune requête ne correspond » : le rendu par défaut est
// celui d'un écran large sans préférence — l'iPad en paysage, la cible du 03 §22.1.
// Un test qui veut l'autre branche remplace `window.matchMedia` lui-même.
// -----------------------------------------------------------------------------
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// -----------------------------------------------------------------------------
// `Element.prototype.scrollIntoView` — jsdom ne l'implémente pas non plus, et
// l'écran d'entretien fait défiler la question courante à chaque déplacement
// (Suivant / Précédent / raccourci). Sans cette cale, 25 des 29 cas de l'écran
// rougissent sur un `TypeError` qui n'a rien à voir avec ce qu'ils éprouvent.
// Posée ici (réserve A26, rencontre L5b du 2026-09-02) et non dans un fichier de
// test : la discipline qui repose sur le souvenir de chaque auteur a un trou.
// -----------------------------------------------------------------------------
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}
