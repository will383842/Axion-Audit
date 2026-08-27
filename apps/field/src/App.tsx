// =============================================================================
// Coquille de l'application terrain — lot L0.
//
// Ce composant existe pour que l'image se construise et que le conteneur serve
// quelque chose de vérifiable. Les écrans réels (3 zones, types de réponse,
// agenda, validation d'entretien) sont le lot L5 — les esquisser ici créerait du
// code à jeter et enfreindrait la règle « jamais deux lots en parallèle ».
//
// Aucune couleur en dur (invariant 4) : tout passe par les variables de
// packages/ui. C'est déjà vrai sur cet écran d'attente.
// Traçabilité : E17.
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
          Axion Audit — Terrain
        </h1>
        <p
          style={{
            color: 'var(--couleur-texte-secondaire)',
            lineHeight: 'var(--typo-interligne-normal)',
          }}
        >
          Socle technique en place. Les écrans de collecte arrivent au lot L5.
        </p>
      </div>
    </main>
  );
}
