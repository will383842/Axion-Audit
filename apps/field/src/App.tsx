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
import type { ReactNode } from 'react';
import { Bouton, EtatErreur, Squelette } from '@axion/ui';
import { EcranAccueil } from './app/EcranAccueil.js';
import { EcranDeverrouillage } from './app/EcranDeverrouillage.js';
import { EcranStockage } from './app/EcranStockage.js';
import { useTerrain } from './app/contexte.js';
import { VUES } from './app/vues.js';

function ContenuCourant(): ReactNode {
  const { vue } = useTerrain();
  switch (vue) {
    case 'deverrouillage':
      return <EcranDeverrouillage />;
    case 'stockage':
      return <EcranStockage />;
    case 'accueil':
      return <EcranAccueil />;
  }
}

export function App(): ReactNode {
  const { phase, panne, vue, verrou, fermer } = useTerrain();

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
