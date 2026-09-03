// =============================================================================
// ACCÈS À L'ENTRETIEN DEPUIS L'ACCUEIL — raccordement L5b, une ligne dans
// `app/EcranAccueil.tsx`
//
// Le cockpit « Aujourd'hui » (03 §34.2, L5c) remplacera ce bloc par l'agenda et
// le démarrage pré-rempli en un tap. D'ici là : ouvrir un nouvel entretien, ou
// reprendre celui qui est mémorisé (03 §17.4, reprise instantanée).
// Traçabilité : E12 (entretiens par interlocuteur), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { lireSessionCourante } from '../../session/position.js';

export function AccesEntretien(): ReactNode {
  const { base, naviguer } = useTerrain();
  const sessionCourante = useLiveQuery(
    async () => {
      if (base === null) return null;
      const id = await lireSessionCourante(base);
      return id === null ? null : depotSessions.parId(id);
    },
    [base],
    null,
  );

  return (
    <div className="axn-coquille__indicateurs">
      <Bouton
        onClick={() => {
          naviguer({ type: 'aller', vue: 'nouvelEntretien' });
        }}
      >
        Nouvel entretien
      </Bouton>
      {sessionCourante !== null && (
        <Bouton
          variante="secondaire"
          onClick={() => {
            naviguer({ type: 'aller', vue: 'entretien' });
          }}
        >
          Reprendre l’entretien de {sessionCourante.personName ?? 'l’interlocuteur'}
        </Bouton>
      )}
    </div>
  );
}
