// =============================================================================
// BARRE LATÉRALE — les 7 espaces (03 §22.3), fixe (§33.4). Lot L7a.
//
// Chaque espace est un VRAI lien (`<a href>`) quand il est ouvert : le clic
// modifié ouvre un onglet, le clavier navigue, le lecteur d'écran lit une liste
// de liens. Un espace fermé n'est PAS un lien désactivé — c'est un élément de
// liste avec sa mention : on ne pose pas un `<a>` sans destination.
//
// Traçabilité : E22 (console de pilotage 7 espaces), E27 (design moderne,
// charte, WCAG AA).
// =============================================================================
import type { ReactNode } from 'react';
import {
  CODES_ESPACES,
  ESPACES,
  espaceOuvert,
  mentionLivraison,
  type CodeEspace,
} from './espaces.js';
import {
  auClicLienInterne,
  hrefDeRoute,
  ROUTE_ACCUEIL,
  ROUTE_PORTEFEUILLE,
  type Route,
} from './routeur.js';

/** Quel espace la route courante éclaire — `null` pour une route inconnue. */
export function espaceDeRoute(route: Route): CodeEspace | null {
  switch (route.type) {
    case 'accueil':
      return 'tour_de_controle';
    case 'portefeuille':
    case 'mission':
    // Les deux sous-écrans de L7b restent SOUS l'espace 2 : la barre latérale
    // continue d'éclairer « Pilotage mission » pendant qu'on lit la couverture
    // ou l'agrégation d'une mission — on n'a pas changé d'espace, on a creusé.
    // L'export (L7c) est de la même famille : produire l'archive d'une mission,
    // c'est encore piloter CETTE mission — la barre n'a aucune raison de sauter
    // d'espace parce qu'on descend d'un cran.
    // eslint-disable-next-line no-fallthrough -- cases groupés, aucun corps intercalé
    case 'couverture':
    case 'agregation':
    // eslint-disable-next-line no-fallthrough -- idem
    case 'export':
      return 'pilotage_mission';
    case 'inconnue':
      return null;
  }
}

/** La route d'atterrissage d'un espace ouvert. `pilotage_mission` sans mission → portefeuille. */
function routeDEspace(code: CodeEspace): Route {
  switch (code) {
    case 'tour_de_controle':
      return ROUTE_ACCUEIL;
    case 'pilotage_mission':
      return ROUTE_PORTEFEUILLE;
    case 'equipe':
    case 'chiffrage':
    case 'contenu':
    case 'analyse':
    case 'administration':
      return { type: 'inconnue', chemin: ESPACES[code].chemin };
  }
}

interface ProprietesBarreLaterale {
  routeCourante: Route;
  /** Numéro de version affiché en pied de barre (injecté par la CI). */
  version: string;
}

export function BarreLaterale({ routeCourante, version }: ProprietesBarreLaterale): ReactNode {
  const actif = espaceDeRoute(routeCourante);

  return (
    <nav className="axn-console__barre" aria-label="Espaces de la console">
      <p className="axn-console__marque">
        Axion Audit
        <small>Console siège · {version}</small>
      </p>
      <ul className="axn-console__espaces">
        {CODES_ESPACES.map((code) => {
          const espace = ESPACES[code];
          const numero = <span className="axn-console__numero">{espace.numero}</span>;
          if (!espaceOuvert(code)) {
            return (
              <li key={code}>
                <span
                  className="axn-console__espace axn-console__espace--ferme"
                  aria-disabled="true"
                >
                  {numero}
                  {espace.titre}
                  <span className="axn-console__mention">{mentionLivraison(espace.livraison)}</span>
                </span>
              </li>
            );
          }
          const route = routeDEspace(code);
          return (
            <li key={code}>
              <a
                className="axn-console__espace"
                href={hrefDeRoute(route)}
                aria-current={actif === code ? 'page' : undefined}
                onClick={auClicLienInterne(route)}
              >
                {numero}
                {espace.titre}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
