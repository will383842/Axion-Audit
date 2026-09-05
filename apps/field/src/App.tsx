// =============================================================================
// LA COQUILLE DE L'APPLICATION TERRAIN — lot L5a
//
// Elle n'affiche presque rien : elle décide QUEL écran est légitime selon l'état
// du socle, et porte le seul élément qui doit exister sur toutes les vues — le
// bouton de verrouillage d'un geste (05 §9.7 : « l'auditeur qui pose sa tablette
// verrouille lui-même — c'est LUI le premier périmètre de sécurité »).
//
// ── LE VERROU EST STRUCTUREL, PAS VISUEL ────────────────────────────────────
// Quand le coffre est fermé, l'écran de déverrouillage n'est pas POSÉ DEVANT les
// données : les données ne sont pas lisibles du tout, parce que le contexte local
// a été retiré (`local/contexte.ts`). C'est la différence entre un verrou et un
// rideau.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total, PC ET tablette).
// =============================================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { Bouton, EtatErreur, Squelette } from '@axion/ui';
import { EcranAccueil } from './app/EcranAccueil.js';
import { EcranDeverrouillage } from './app/EcranDeverrouillage.js';
import { EcranStockage } from './app/EcranStockage.js';
import { useTerrain } from './app/contexte.js';
import { vueCourante } from './app/navigation.js';
import { VUES } from './app/vues.js';
import { EcranEntretien } from './ecrans/entretien/EcranEntretien.js';
import { EcranNouvelEntretien } from './ecrans/entretien/EcranNouvelEntretien.js';
import { EcranAgenda } from './ecrans/journee/EcranAgenda.js';
import { EcranAujourdhui } from './ecrans/journee/EcranAujourdhui.js';
import { EcranFinDeJournee } from './ecrans/journee/EcranFinDeJournee.js';
import { EcranPilote } from './ecrans/journee/EcranPilote.js';
import { AccesRestauration, EcranRestauration } from './ecrans/journee/EcranRestauration.js';
import { PastilleSyncCoquille } from './ecrans/journee/PastilleSyncCoquille.js';
import { aUneMissionEmbarquee, vueInitiale } from './ecrans/journee/vue-initiale.js';

function ContenuCourant(): ReactNode {
  const { vue } = useTerrain();
  switch (vue) {
    case 'deverrouillage':
      return <EcranDeverrouillage />;
    case 'stockage':
      return <EcranStockage />;
    case 'accueil':
      // `AccesRestauration` est COMPOSÉ ici, sous l'écran de L5a, et non ajouté
      // dans `EcranAccueil.tsx` : ce fichier appartient à L5a et un correctif de
      // sécurité y atterrit (A24). La coquille est le fichier partagé déclaré
      // (LOT_L5.md §1, amendement 2026-09-05) ; c'est le seul endroit où L5c
      // peut poser une porte d'entrée sans écrire chez un autre incrément.
      return (
        <>
          <EcranAccueil />
          <AccesRestauration />
        </>
      );
    // ── L5b (A22) ──
    case 'nouvelEntretien':
      return <EcranNouvelEntretien />;
    case 'entretien':
      return <EcranEntretien />;
    // ── L5c (A23) ──
    case 'aujourdhui':
      return <EcranAujourdhui />;
    case 'agenda':
      return <EcranAgenda />;
    case 'pilote':
      return <EcranPilote />;
    case 'finDeJournee':
      return <EcranFinDeJournee />;
    case 'restauration':
      return <EcranRestauration />;
  }
}

/**
 * La vue initiale est une RÈGLE, pas une constante (arbitrage A01, 2026-09-05) :
 * cockpit « Aujourd'hui » quand une mission est embarquée, `accueil` sinon.
 *
 * Appliquée UNE fois par chargement de page, à l'ouverture du coffre, et
 * seulement si l'application a atterri sur la vue par défaut avec une pile
 * vierge — la reprise instantanée (03 §17.4) n'est jamais détournée. La règle
 * elle-même vit dans `ecrans/journee/vue-initiale.ts` (L5c), testée sur ses deux
 * cas ; ce crochet ne fait que la lire et naviguer.
 */
function useVueInitiale(): void {
  const { base, phase, navigation, naviguer } = useTerrain();
  const appliquee = useRef(false);
  useEffect(() => {
    if (appliquee.current || base === null || phase !== 'ouvert') return;
    appliquee.current = true;
    void aUneMissionEmbarquee(base).then((missionEmbarquee) => {
      const cible = vueInitiale({
        missionEmbarquee,
        vueAtterrissage: vueCourante(navigation),
        profondeurPile: navigation.pile.length,
      });
      if (cible !== vueCourante(navigation)) naviguer({ type: 'racine', vue: cible });
    });
  }, [base, phase, navigation, naviguer]);
}

export function App(): ReactNode {
  const { phase, panne, vue, verrou, fermer } = useTerrain();
  useVueInitiale();

  if (phase === 'chargement') {
    return (
      <div className="axn-coquille">
        <main className="axn-coquille__corps axn-pile" aria-busy="true">
          <Squelette forme="titre" />
          <Squelette forme="ligne" lignes={3} />
        </main>
      </div>
    );
  }

  if (phase === 'erreur') {
    return (
      <div className="axn-coquille">
        <main className="axn-coquille__corps axn-pile axn-pile--large">
          <EtatErreur
            titre="Les données locales sont inaccessibles"
            cause={panne?.cause ?? 'Cause inconnue.'}
            action={panne?.action ?? 'Rechargez la page.'}
          />
        </main>
      </div>
    );
  }

  // Coffre fermé : une seule vue possible, et aucune donnée derrière elle.
  if (phase === 'verrouille' || verrou.verrouille) {
    return (
      <div className="axn-coquille">
        <main className="axn-coquille__corps">
          <EcranDeverrouillage />
        </main>
      </div>
    );
  }

  return (
    <div className="axn-coquille">
      <header className="axn-coquille__entete">
        <h1 className="axn-coquille__titre">{VUES[vue].titre}</h1>
        {/* Décision A01 (2026-09-05) : l'état de synchronisation est visible sur
            TOUS les écrans. « Hors ligne = nominal » veut dire pas une erreur,
            pas invisible. Posée dans la coquille — le fichier partagé — plutôt
            que répétée dans chaque écran. */}
        <PastilleSyncCoquille />
        <Bouton variante="discret" onClick={fermer}>
          Verrouiller
        </Bouton>
      </header>
      <main className="axn-coquille__corps">
        <ContenuCourant />
      </main>
    </div>
  );
}
