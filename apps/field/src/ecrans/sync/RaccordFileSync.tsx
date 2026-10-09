// =============================================================================
// LE RACCORD VERS LA FILE DE SYNCHRONISATION — accueil et « Aujourd'hui » (L6b)
//
// `LOT_L6.md` §3ter C.2 : la pastille de l'accueil et du cockpit est RACCORDÉE à
// l'écran de synchronisation — du raccordement, aucun calcul dans ces écrans.
// Ce composant rend ce que `lireResumeFileSync` lit dans le LOCAL (jamais le
// réseau) : les ops « à examiner » sont DITES, « n réponse(s) arbitrée(s) » est
// cliquable (05 §9.3), et la file est à un geste. Aucun role="alert" ici : l'écran
// hôte porte déjà, au plus, l'alerte de l'invariant 8.
//
// Traçabilité : E7, E38, E44 ; invariant 8.
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { lireResumeFileSync, type ResumeFileSync } from '../../sync/file-locale.js';

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`;
}

/** `afficherComptes` : « Aujourd'hui » dit les ops à examiner et les arbitrages. */
export function RaccordFileSync({
  afficherComptes = false,
}: {
  readonly afficherComptes?: boolean;
}): ReactNode {
  const { base, naviguer } = useTerrain();
  const resume = useLiveQuery(
    async (): Promise<ResumeFileSync | null> => {
      if (base === null || !afficherComptes) return null;
      try {
        return await lireResumeFileSync(base);
      } catch {
        // Le geste reste offert : l'écran de synchronisation dira la panne.
        return null;
      }
    },
    [base, afficherComptes],
    null,
  );
  const allerALaFile = (): void => {
    naviguer({ type: 'aller', vue: 'synchronisation' });
  };

  return (
    <div className="axn-journee__actions">
      {resume !== null && resume.aExaminer > 0 && (
        <p role="status" className="axn-coquille__mention">
          {pluriel(resume.aExaminer, 'opération à examiner', 'opérations à examiner')}
        </p>
      )}
      {resume !== null && resume.arbitrees > 0 && (
        <Bouton variante="secondaire" onClick={allerALaFile}>
          {pluriel(resume.arbitrees, 'réponse arbitrée', 'réponses arbitrées')}
        </Bouton>
      )}
      <Bouton variante="discret" onClick={allerALaFile}>
        Voir la file de synchronisation
      </Bouton>
    </div>
  );
}
