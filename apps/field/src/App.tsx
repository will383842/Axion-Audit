// =============================================================================
// LA COQUILLE DE L'APPLICATION TERRAIN — lot L5a
//
// Elle n'affiche presque rien : elle décide QUEL écran est légitime selon l'état
// du socle, et porte le seul élément qui doit exister sur toutes les vues — le
// bouton de verrouillage d'un geste (05 §9.7 : « l'auditeur qui pose sa tablette
// verrouille lui-même — c'est LUI le premier périmètre de sécurité »).
//
// ── LA SORTIE EST DANS LA COQUILLE, UNE FOIS, POUR TOUS LES ÉCRANS ──────────
// Bloquant **B2** de la recette novice n°1 (A54, 2026-09-06) : `peutRevenir()`
// existait, documentait en toutes lettres que « le bouton retour de l'en-tête
// s'y règle », et n'était câblé sur AUCUN bouton. Deux écrans n'offraient donc
// que « Verrouiller » — en PWA installée, sans barre d'adresse, l'auditeur était
// enfermé. Le geste retour système sauvait le navigateur, pas la tablette.
//
// Le retour est posé ICI et nulle part ailleurs : un bouton par écran, ce sont
// onze occasions d'en oublier un, et c'est très exactement ce qui s'est produit
// (deux écrans sur onze avaient leurs `actions`, les autres non). La coquille,
// elle, ne peut pas oublier un écran : elle les rend tous.
//
// ── LE VERROU EST STRUCTUREL, PAS VISUEL ────────────────────────────────────
// Quand le coffre est fermé, l'écran de déverrouillage n'est pas POSÉ DEVANT les
// données : les données ne sont pas lisibles du tout, parce que le contexte local
// a été retiré (`local/contexte.ts`). C'est la différence entre un verrou et un
// rideau.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total, PC ET tablette).
// =============================================================================
import { useCallback, type ReactNode } from 'react';
import { Bouton, EtatErreur, Squelette } from '@axion/ui';
import { EcranAccueil } from './app/EcranAccueil.js';
import { EcranDeverrouillage } from './app/EcranDeverrouillage.js';
import { EcranStockage } from './app/EcranStockage.js';
import { useTerrain } from './app/contexte.js';
import { peutRevenir } from './app/navigation.js';
import { VUES } from './app/vues.js';
import { EcranEntretien } from './ecrans/entretien/EcranEntretien.js';
import { EcranNouvelEntretien } from './ecrans/entretien/EcranNouvelEntretien.js';
import { EcranAgenda } from './ecrans/journee/EcranAgenda.js';
import { EcranARevoir } from './ecrans/journee/EcranARevoir.js';
import { EcranAujourdhui } from './ecrans/journee/EcranAujourdhui.js';
import { EcranFinDeJournee } from './ecrans/journee/EcranFinDeJournee.js';
import { EcranFinDeSession } from './ecrans/journee/EcranFinDeSession.js';
import { EcranPilote } from './ecrans/journee/EcranPilote.js';
import { EcranRestauration } from './ecrans/journee/EcranRestauration.js';
import {
  ComplementAccueil,
  IndicateursCoquille,
  useVueInitiale,
} from './ecrans/journee/coquille-l5c.js';
import { EcranConnexion } from './siege/EcranConnexion.js';
import { AccesRattachement } from './siege/coquille-siege.js';

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
          <ComplementAccueil />
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
    case 'finDeSession':
      return <EcranFinDeSession />;
    // ── Rattachement de l'appareil à son auditeur (A23) ──
    case 'connexionSiege':
      return <EcranConnexion />;
    // ── Le compteur « à revoir » du cockpit mène ici (03 §34.2, NB-15) ──
    case 'aRevoir':
      return <EcranARevoir />;
  }
}

export function App(): ReactNode {
  const { phase, panne, vue, verrou, fermer, navigation, naviguer } = useTerrain();
  useVueInitiale();

  // B2 — la sortie. Elle n'apparaît que s'il y a réellement où revenir : sur une
  // racine, un bouton « Revenir » qui ne fait rien serait le même mensonge que la
  // pastille qui annonce plus qu'elle ne fait.
  //
  // ── R5 : UN SEUL MOT POUR REVENIR EN ARRIÈRE, ET C'EST UN VERBE ─────────
  // « Retour » et « Revenir » cohabitaient — huit occurrences contre une. Trois
  // raisons de garder le verbe : il domine, le design system l'emploie déjà
  // (« Revenir en écran privé », `BandeauPartage`), et TOUS les autres boutons
  // de l'application sont des verbes à l'infinitif (« Verrouiller »,
  // « Planifier », « Terminer la journée »). Un nom au milieu de verbes est
  // l'exception qu'on lit deux fois. La règle, désormais : on REVIENT, et quand
  // la destination n'est pas évidente on la nomme (« Revenir à ma journée »).
  const retourPossible = peutRevenir(navigation);
  const revenir = useCallback((): void => {
    naviguer({ type: 'retour' });
  }, [naviguer]);

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
      {/* Ce bandeau ne porte QUE des gestes permanents — revenir, l'état de
          sync, verrouiller. Le titre de la vue n'y est plus : `role="banner"`
          désigne, par spécification, du contenu RÉPÉTÉ de page en page, et un
          titre qui change à chaque vue y était un contresens (réserve R1 d'A29,
          2026-09-10). Ce qui reste ici est bien répété partout. */}
      <header className="axn-coquille__entete">
        {/* En premier : l'ordre de lecture d'un en-tête, et l'ordre de
            tabulation. Le libellé est écrit, pas seulement une flèche — §33.6
            interdit qu'une information soit portée par une icône seule. */}
        {retourPossible && (
          <Bouton variante="discret" onClick={revenir}>
            Revenir
          </Bouton>
        )}
        {/* Le groupe de droite. Il était poussé par le `flex` du titre ; le
            titre parti, c'est ce conteneur qui le fait, à géométrie inchangée —
            « Revenir » à gauche, la pastille et « Verrouiller » à droite. */}
        <div className="axn-coquille__actions">
          {/* Décision A01 (2026-09-05) : l'état de synchronisation est visible
              sur TOUS les écrans. « Hors ligne = nominal » veut dire pas une
              erreur, pas invisible. Posée dans la coquille — le fichier
              partagé — plutôt que répétée dans chaque écran. */}
          <IndicateursCoquille />
          <Bouton variante="discret" onClick={fermer}>
            Verrouiller
          </Bouton>
        </div>
      </header>
      <main className="axn-coquille__corps">
        {/* LE titre de la vue, et le seul `<h1>` du document. Sa SOURCE est
            inchangée — le registre `app/vues.ts`, un endroit unique — seul son
            emplacement bouge : PREMIER enfant de `<main>`, pour que le saut au
            repère principal, le geste le plus courant au lecteur d'écran, tombe
            immédiatement sur le sujet de la page. C'est aussi ce qui met la
            coquille d'accord avec elle-même : coffre fermé, le `h1` d'
            `EcranDeverrouillage` est déjà dans ce `<main>` (plus haut). */}
        <h1 className="axn-coquille__titre">{VUES[vue].titre}</h1>
        {/* Un appareil sans identité d'auditeur ne peut ouvrir aucun entretien
            (05 §9.9). Le rappel et son geste sont posés dans la coquille, comme
            le bouton Revenir : depuis n'importe quel écran, et sans qu'aucun
            écran ait à s'en souvenir. Il ne rend rien une fois l'appareil
            rattaché. */}
        <AccesRattachement />
        <ContenuCourant />
      </main>
    </div>
  );
}
