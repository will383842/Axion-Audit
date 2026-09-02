// =============================================================================
// PETITS CAPTEURS D'ENVIRONNEMENT — requête média et état réseau
//
// `useRequeteMedia` sert deux décisions de l'écran d'entretien : afficher les
// rappels de raccourcis (03 §33.3 : « PC ») seulement quand un pointeur fin est
// présent, et savoir si les zones latérales sont des colonnes ou des panneaux
// (le même seuil que `entretien.css`). `useEnLigne` nourrit la pastille de
// l'état hors ligne (03 §33.2) — une INFORMATION, jamais une condition : tout
// fonctionne pareil dans les deux cas (invariant 1).
// =============================================================================
import { useEffect, useState } from 'react';

/** Le seuil des trois colonnes — le MÊME que dans `entretien.css`. */
export const REQUETE_TROIS_COLONNES = '(min-width: 64rem)';
/** Un pointeur fin = une souris ou un pavé tactile, donc probablement un clavier. */
export const REQUETE_POINTEUR_FIN = '(pointer: fine)';

export function useRequeteMedia(requete: string): boolean {
  const [correspond, setCorrespond] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(requete).matches,
  );
  useEffect(() => {
    const liste = window.matchMedia(requete);
    const auChangement = (evenement: MediaQueryListEvent): void => {
      setCorrespond(evenement.matches);
    };
    setCorrespond(liste.matches);
    liste.addEventListener('change', auChangement);
    return () => {
      liste.removeEventListener('change', auChangement);
    };
  }, [requete]);
  return correspond;
}

export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  useEffect(() => {
    const oui = (): void => {
      setEnLigne(true);
    };
    const non = (): void => {
      setEnLigne(false);
    };
    window.addEventListener('online', oui);
    window.addEventListener('offline', non);
    return () => {
      window.removeEventListener('online', oui);
      window.removeEventListener('offline', non);
    };
  }, []);
  return enLigne;
}
