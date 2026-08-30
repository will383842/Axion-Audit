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
