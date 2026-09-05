// =============================================================================
// BANDEAU DE MISE À JOUR APPLICATIVE — 05 §31-1
//
// ── LA RÈGLE, MOT POUR MOT ──────────────────────────────────────────────────
// 05 §31-1 : « le service worker télécharge les nouvelles versions en arrière-plan
// mais **ne les active JAMAIS pendant un entretien en cours** ; bandeau discret
// “Nouvelle version disponible — appliquer” actionné par l'auditeur **entre deux
// entretiens** ».
//
// Trois mots comptent, et chacun a sa contrepartie ici :
//   · **discret** — un bandeau fin, ton informatif, jamais une boîte modale.
//     03 §17.3 : « bandeau discret (jamais de popup en plein entretien) ».
//   · **actionné par l'auditeur** — aucun `skipWaiting()` automatique. Le geste
//     est le sien ; l'application ne se recharge pas sous ses doigts.
//   · **entre deux entretiens** — le bouton est DÉSARMÉ tant qu'une session est
//     en cours, et il DIT pourquoi. Un bouton grisé sans explication ferait
//     croire à une panne.
//
// ── LA MÉCANIQUE N'EST PAS ICI ──────────────────────────────────────────────
// `app/service-worker-client.ts` (L5a) porte l'enregistrement, la détection de la
// version en attente et le garde `activationPermise()` — dont le défaut est
// `null`, c'est-à-dire REFUS, depuis la revue A29 (bloquant B5). Son en-tête dit
// lui-même : « Le bandeau lui-même est L5c ; ce module lui fournit l'état et
// l'action, pour que L5c n'ait pas à réécrire la mécanique du service worker. »
// Ce composant ne fait donc que RENDRE — il ne décide de rien.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E23 (hyper intuitif).
// =============================================================================
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bouton, Message } from '@axion/ui';
import {
  activationPermise,
  surMiseAJour,
  type EtatMiseAJour,
} from '../../app/service-worker-client.js';
import './journee.css';

export function BandeauMiseAJour(): ReactNode {
  const [etat, setEtat] = useState<EtatMiseAJour | null>(null);
  const [refusee, setRefusee] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => surMiseAJour(setEtat), []);

  const appliquer = useCallback((): void => {
    if (etat === null) return;
    setEnCours(true);
    void etat
      .appliquer()
      .then((applique) => {
        // `false` = le garde du 05 §31-1 a refusé (session en cours, ou source
        // d'information absente). On le DIT plutôt que de laisser un bouton qui
        // ne fait rien — c'est la différence entre un refus et une panne.
        setRefusee(!applique);
      })
      .finally(() => {
        setEnCours(false);
      });
  }, [etat]);

  if (etat?.disponible !== true) return null;

  const permise = activationPermise();

  return (
    <div className="axn-journee__bandeau-maj" role="status">
      <span>Une nouvelle version de l’application est prête.</span>
      <Bouton variante="secondaire" chargement={enCours} onClick={appliquer}>
        Appliquer maintenant
      </Bouton>
      {(!permise || refusee) && (
        <Message ton="info">
          La mise à jour attend la fin de votre session en cours : elle ne s’appliquera pas pendant
          un entretien. Terminez la session, puis réessayez — rien n’est perdu entre-temps.
        </Message>
      )}
    </div>
  );
}
