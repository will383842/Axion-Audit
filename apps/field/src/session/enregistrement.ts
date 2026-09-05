// =============================================================================
// ENREGISTREMENT CONTINU — 03 §17.4 (« aucun bouton sauvegarder nulle part »),
// 03 §33.3 (« micro-indicateur Enregistré : la confiance se voit »)
//
// Deux chemins, un seul indicateur :
//   · `enregistrer(travail)` — IMMÉDIAT : une cote, un drapeau, un choix. L'écrit
//     part tout de suite ; l'indicateur passe « Enregistrement… » puis
//     « Enregistré à HH:mm » — APRÈS que la transaction locale a rendu la main,
//     jamais avant. Un indicateur qui verdit sur une promesse non tenue est
//     exactement le mensonge que ce dépôt traque.
//   · `differer(cle, travail)` — DÉBOUNCÉ, pour le texte : 03 M3.2 « persisté
//     localement en continu, à chaque frappe débouncée ». Une clé par champ ;
//     une nouvelle frappe remplace le travail en attente sous la même clé.
//     **Le travail en attente est PURGÉ quand la page se cache ou se décharge**
//     (`pagehide`, `visibilitychange`) : c'est ce qui borne la perte à zéro sur
//     un onglet tué en pleine saisie (critère P-C), et pas au délai du débounce.
//
// Les écritures sont SÉRIALISÉES : deux `ecrireLocal` concurrents sur la même
// réponse liraient le même `existante` et produiraient deux révisions égales.
// Une file d'une promesse suffit, et elle est ici.
//
// L'échec ne se rattrape pas en silence : `erreur` porte un message français et
// l'indicateur ne dit PAS « Enregistré ».
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E6 (hors ligne total).
// Citait E38 (« sync ≥ 1×/j + export de secours ») : la purge sur `pagehide` protège
// la SAISIE EN COURS sur l’appareil, elle ne remonte rien au siège et ne produit
// aucun export — E38 est servie par L5c et L6, pas ici. Corrigé sur réserve R5.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtatEnregistrement } from '@axion/ui';
import { maintenant } from '../local/horloge.js';
import { formaterHeure } from './fuseau.js';

/** Délai de débounce du texte, en millisecondes. Court : la perte possible est bornée par lui. */
export const DELAI_DEBOUNCE_MS = 300;

export interface EnregistrementContinu {
  readonly etat: EtatEnregistrement;
  /** Heure de la dernière écriture, au fuseau de mission — pour l'indicateur. */
  readonly horodatage: string | undefined;
  readonly erreur: string | null;
  enregistrer: (travail: () => Promise<unknown>) => Promise<void>;
  differer: (cle: string, travail: () => Promise<unknown>) => void;
  /** Exécute tout ce qui attend. À appeler avant de changer de question. */
  purger: () => Promise<void>;
  effacerErreur: () => void;
}

const MESSAGE_ECHEC =
  'L’enregistrement sur cet appareil a échoué. Ce que vous voyez à l’écran n’est pas perdu : ' +
  'reprenez la saisie ou changez de question pour réessayer. Si cela persiste, verrouillez puis déverrouillez l’application.';

export function useEnregistrementContinu(fuseau: string | undefined): EnregistrementContinu {
  const [etat, setEtat] = useState<EtatEnregistrement>('inactif');
  const [horodatage, setHorodatage] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const enAttente = useRef(
    new Map<
      string,
      { minuterie: ReturnType<typeof setTimeout>; travail: () => Promise<unknown> }
    >(),
  );
  const file = useRef<Promise<void>>(Promise.resolve());
  const vivant = useRef(true);
  const fuseauRef = useRef(fuseau);
  fuseauRef.current = fuseau;

  const executer = useCallback((travail: () => Promise<unknown>): Promise<void> => {
    const tour = file.current.then(async () => {
      if (vivant.current) setEtat('enregistrement');
      try {
        await travail();
        if (vivant.current) {
          setHorodatage(formaterHeure(maintenant(), fuseauRef.current));
          setEtat('enregistre');
          setErreur(null);
        }
      } catch (cause: unknown) {
        if (vivant.current) {
          setEtat('inactif');
          setErreur(cause instanceof Error && cause.message !== '' ? cause.message : MESSAGE_ECHEC);
        }
      }
    });
    file.current = tour;
    return tour;
  }, []);

  const purger = useCallback((): Promise<void> => {
    const travaux = [...enAttente.current.values()];
    enAttente.current.clear();
    for (const { minuterie } of travaux) clearTimeout(minuterie);
    let dernier: Promise<void> = file.current;
    for (const { travail } of travaux) dernier = executer(travail);
    return dernier;
  }, [executer]);

  const differer = useCallback(
    (cle: string, travail: () => Promise<unknown>): void => {
      const precedent = enAttente.current.get(cle);
      if (precedent !== undefined) clearTimeout(precedent.minuterie);
      const minuterie = setTimeout(() => {
        enAttente.current.delete(cle);
        void executer(travail);
      }, DELAI_DEBOUNCE_MS);
      enAttente.current.set(cle, { minuterie, travail });
    },
    [executer],
  );

  // Purge sur toute sortie de page : onglet fermé, application mise en arrière-
  // plan (iPad), verrouillage. `pagehide` est le seul évènement fiable sur iOS.
  useEffect(() => {
    vivant.current = true;
    const auDepart = (): void => {
      void purger();
    };
    const auChangementDeVisibilite = (): void => {
      if (document.visibilityState === 'hidden') void purger();
    };
    window.addEventListener('pagehide', auDepart);
    document.addEventListener('visibilitychange', auChangementDeVisibilite);
    return () => {
      vivant.current = false;
      window.removeEventListener('pagehide', auDepart);
      document.removeEventListener('visibilitychange', auChangementDeVisibilite);
      void purger();
    };
  }, [purger]);

  const effacerErreur = useCallback((): void => {
    setErreur(null);
  }, []);

  return useMemo(
    () => ({ etat, horodatage, erreur, enregistrer: executer, differer, purger, effacerErreur }),
    [etat, horodatage, erreur, executer, differer, purger, effacerErreur],
  );
}
