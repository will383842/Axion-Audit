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
// 03 §33.3) lèverait `TypeError` au premier rendu.
//
// ── POURQUOI CE SHIM A ÉTÉ RÉÉCRIT (bloquant C5 de la revue A29, 2026-09-03) ──
// La version précédente répondait `matches: false` À TOUTE REQUÊTE, en affirmant
// dans son propre commentaire que « le rendu par défaut est celui d'un écran
// large — l'iPad en paysage ». C'était l'inverse : `(min-width: 64rem)` rendait
// FAUX, donc les 29 cas d'`EcranEntretien.test.tsx` rendaient la disposition en
// PANNEAUX et jamais les TROIS COLONNES, qui sont le livrable-titre de L5b.
// Un outil de test qui mesure autre chose que ce qu'il annonce est le pire des
// deux mondes : il est vert, et il documente son propre mensonge.
//
// LE SHIM NE DÉCIDE PLUS À LA PLACE DE PERSONNE : il RÉPOND À PARTIR DE JSDOM.
// `window.innerWidth` vaut 1024 px par défaut dans jsdom, soit exactement les
// 64rem du seuil des trois colonnes — c'est donc la largeur qu'il faut consulter,
// pas une constante recopiée ici. Un test qui veut l'autre branche pose
// `window.innerWidth` et rejoue, ou remplace `window.matchMedia` lui-même.
// -----------------------------------------------------------------------------
/** Largeur de référence en pixels d'une requête `min-width` / `max-width`. */
function largeurDemandee(requete: string): { borne: 'min' | 'max'; pixels: number } | null {
  const m = /\((min|max)-width:\s*([\d.]+)(px|rem|em)\)/.exec(requete);
  if (m === null) return null;
  const valeur = Number(m[2]);
  const unite = m[3];
  // 1rem = 1em = 16px, la taille racine par défaut — celle de jsdom comme celle
  // du navigateur tant que rien ne la change (et rien ne la change ici).
  return { borne: m[1] === 'min' ? 'min' : 'max', pixels: unite === 'px' ? valeur : valeur * 16 };
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      get matches(): boolean {
        const largeur = largeurDemandee(query);
        if (largeur !== null) {
          return largeur.borne === 'min'
            ? window.innerWidth >= largeur.pixels
            : window.innerWidth <= largeur.pixels;
        }
        // Un pointeur FIN : l'environnement de test est un poste, pas un doigt.
        // C'est ce qui rend visibles les rappels de raccourcis du 03 §33.3, donc
        // ce qui les met sous test au lieu de les masquer.
        if (/\(pointer:\s*fine\)/.test(query)) return true;
        if (/\(pointer:\s*coarse\)/.test(query)) return false;
        // Aucune préférence d'accessibilité déclarée : le cas nominal.
        if (query.includes('prefers-')) return false;
        return false;
      },
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
