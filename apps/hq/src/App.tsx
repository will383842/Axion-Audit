// =============================================================================
// LA COQUILLE DE LA CONSOLE SIÈGE — AppShell §33.4. Lot L7a.
//
// Barre latérale fixe (7 espaces), en-tête avec fil d'ariane constant (§22.3),
// contenu = l'écran que la route désigne. Elle porte aussi les DEUX fournisseurs
// que tout écran suppose — le client d'API et le cache TanStack — créés UNE fois
// par instance : rendre `<App />` deux fois (deux tests) ne partage rien.
//
// `fetch` est résolu À L'APPEL : `(entree, init) => fetch(entree, init)`. En
// production c'est celui du navigateur ; sous test, celui que A36 a installé
// AVANT de rendre — sans qu'aucune propriété ne traverse l'arbre.
//
// La console est ADMIN SEUL (§34.1). Ce n'est pas la coquille qui le garantit :
// c'est l'API qui refuse (`FORBIDDEN`), et l'écran le dit alors en français
// (`etats.ts`). Une console qui masquerait ses menus selon le rôle donnerait
// l'illusion d'un contrôle — invariant 3 : « aucun contrôle uniquement côté
// client ». Le seul état que la coquille tient est « pas de session » (401) :
// elle montre alors l'écran de connexion À LA PLACE du contenu, et rien du
// contenu n'est demandé ni rendu entre-temps.
//
// Traçabilité : E22 (console de pilotage 7 espaces), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================
import { useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EtatVide } from '@axion/ui';
import { creerClientApi, type ClientApi } from './api/client.js';
import { FournisseurClientApi } from './api/requetes.js';
import { BarreLaterale } from './app/BarreLaterale.js';
import { ESPACES } from './app/espaces.js';
import {
  auClicLienInterne,
  hrefDeRoute,
  ROUTE_ACCUEIL,
  ROUTE_PORTEFEUILLE,
  useRoute,
  type Route,
} from './app/routeur.js';
import { EcranAccueil } from './ecrans/EcranAccueil.js';
import { EcranAvancementMission } from './ecrans/EcranAvancementMission.js';
import { EcranConnexion } from './ecrans/EcranConnexion.js';
import { EcranPortefeuille } from './ecrans/EcranPortefeuille.js';

/** Version injectée par la CI (SHA court) — `dev` en local. Voir le Dockerfile. */
const VERSION: string =
  typeof import.meta.env.VITE_APP_VERSION === 'string' ? import.meta.env.VITE_APP_VERSION : 'dev';

/**
 * Le cache : PAS de nouvelle tentative automatique. Un 403 rejoué trois fois est
 * une tempête, pas de la résilience (A36 le mesure) ; une panne réseau se
 * relance d'un bouton « Réessayer », visible, au lieu d'un compteur invisible.
 */
function creerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: true },
    },
  });
}

function FilDAriane({ route }: { route: Route }): ReactNode {
  return (
    <nav aria-label="Fil d’Ariane">
      <ol className="axn-fil">
        <li>
          {route.type === 'accueil' ? (
            <span aria-current="page">{ESPACES.tour_de_controle.titre}</span>
          ) : (
            <a href={hrefDeRoute(ROUTE_ACCUEIL)} onClick={auClicLienInterne(ROUTE_ACCUEIL)}>
              {ESPACES.tour_de_controle.titre}
            </a>
          )}
        </li>
        {route.type === 'portefeuille' && (
          <li>
            <span aria-current="page">Portefeuille</span>
          </li>
        )}
        {route.type === 'mission' && (
          <>
            <li>
              <a
                href={hrefDeRoute(ROUTE_PORTEFEUILLE)}
                onClick={auClicLienInterne(ROUTE_PORTEFEUILLE)}
              >
                Portefeuille
              </a>
            </li>
            <li>
              <span aria-current="page">Mission</span>
            </li>
          </>
        )}
        {route.type === 'inconnue' && (
          <li>
            <span aria-current="page">Page introuvable</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

function Contenu({ route }: { route: Route }): ReactNode {
  switch (route.type) {
    case 'accueil':
      return <EcranAccueil />;
    case 'portefeuille':
      return <EcranPortefeuille />;
    case 'mission':
      return <EcranAvancementMission id={route.id} />;
    case 'inconnue':
      return (
        <EtatVide
          titre="Cette page n’existe pas"
          description="Le lien est peut-être périmé, ou l’espace visé n’est pas encore livré. Revenez à la tour de contrôle."
          actions={
            <a href={hrefDeRoute(ROUTE_ACCUEIL)} onClick={auClicLienInterne(ROUTE_ACCUEIL)}>
              Retour à la tour de contrôle
            </a>
          }
        />
      );
  }
}

interface EtatSession {
  /** Un 401 a été reçu et aucune connexion n'a été acceptée depuis. */
  readonly absente: boolean;
  /** Une connexion a été acceptée, puis un 401 est revenu (serveur sans cookie, A-006). */
  readonly nonEtablie: boolean;
}

/** Un 401 reçu moins de N ms après un `login` accepté = le serveur n'a pas ouvert de session. */
const DELAI_SESSION_NON_ETABLIE_MS = 5_000;

export function App(): ReactNode {
  const [session, setSession] = useState<EtatSession>({ absente: false, nonEtablie: false });
  const derniereConnexionA = useRef<number | null>(null);
  const [queryClient] = useState(creerQueryClient);
  const [client] = useState<ClientApi>(() =>
    creerClientApi({
      fetch: (entree, init) => fetch(entree, init),
      onNonAuthentifie: () => {
        const acceptee = derniereConnexionA.current;
        const nonEtablie =
          acceptee !== null && Date.now() - acceptee < DELAI_SESSION_NON_ETABLIE_MS;
        setSession({ absente: true, nonEtablie });
      },
    }),
  );
  const route = useRoute();

  function apresConnexion(): void {
    // La prochaine réponse dira si le serveur a réellement ouvert une session :
    // un 401 immédiat remettra `absente` à vrai, avec `nonEtablie` pour le dire.
    derniereConnexionA.current = Date.now();
    setSession({ absente: false, nonEtablie: false });
    void queryClient.invalidateQueries();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <FournisseurClientApi value={client}>
        <div className="axn-console">
          <a className="axn-console__evitement" href="#contenu">
            Aller au contenu
          </a>
          <BarreLaterale routeCourante={route} version={VERSION} />
          <div className="axn-console__colonne">
            <header className="axn-console__entete">
              <FilDAriane route={route} />
            </header>
            <main id="contenu" className="axn-console__corps" tabIndex={-1}>
              {session.absente ? (
                <EcranConnexion
                  onConnecte={apresConnexion}
                  sessionNonEtablie={session.nonEtablie}
                />
              ) : (
                <Contenu route={route} />
              )}
            </main>
          </div>
        </div>
      </FournisseurClientApi>
    </QueryClientProvider>
  );
}
