// =============================================================================
// Coquille de la console siège — lot L0.
//
// Ce composant existe pour que l'image se construise et que le conteneur serve
// quelque chose de vérifiable. Les 7 espaces de la console (§22.3) sont les lots
// L7-L8 puis la Phase 2 — les esquisser ici créerait du code à jeter et
// enfreindrait la règle « jamais deux lots en parallèle sur les mêmes fichiers ».
//
// Aucune couleur en dur (invariant 4) : tout passe par les variables de
// packages/ui. C'est déjà vrai sur cet écran d'attente.
// Traçabilité : E17, E22.
// =============================================================================
import type * as React from 'react';

export function App(): React.JSX.Element {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--espacement-6)',
        background: 'var(--couleur-surface-fond)',
        color: 'var(--couleur-texte-principal)',
        fontFamily: 'var(--typo-police-corps)',
      }}
    >
      <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'var(--typo-taille-2xl)',
            fontWeight: 'var(--typo-graisse-semi)',
            lineHeight: 'var(--typo-interligne-serre)',
            marginBottom: 'var(--espacement-3)',
          }}
        >
          Axion Audit — Console
        </h1>
        <p
          style={{
            color: 'var(--couleur-texte-secondaire)',
            lineHeight: 'var(--typo-interligne-normal)',
          }}
        >
          Socle technique en place. Les espaces de pilotage arrivent au lot L7.
        </p>
      </div>
    </main>
  );
}
