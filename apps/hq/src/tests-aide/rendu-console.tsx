// =============================================================================
// RENDU DE LA CONSOLE SOUS TEST — lot L7a, écrit par A36.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LES HYPOTHÈSES D'INTERFACE, TOUTES ICI ET NULLE PART AILLEURS
// ═══════════════════════════════════════════════════════════════════════════════
// Ces tests sont écrits AVANT le code (09 §3-2) et sans lire `apps/hq/src/**`
// (09 §5.6). Ils doivent donc PARIER sur des noms. Les paris sont regroupés dans
// ce fichier pour qu'un désaccord avec l'implémentation d'A30 se règle en UN
// endroit — et qu'il se règle en revue croisée, pas en réécrivant vingt tests.
//
//   H1. Routage par CHEMIN sous la base Vite `/hq/` (apps/hq/vite.config.ts) :
//       `/hq/` = accueil « Tour de contrôle » (03 §22.3 espace 1),
//       `/hq/missions` = portefeuille, `/hq/missions/:id` = avancement d'une mission.
//       Aucun routeur n'est dans la liste 11 §1 : la console lit `location` et
//       écoute `popstate` ; un clic sur un lien interne fait `pushState` sans
//       recharger. Un routage par fragment (`#/missions`) invaliderait H1.
//   H2. L'API est appelée en RELATIF sur le même domaine, sous `/api/v1/…`
//       (Caddy : `/api` → API, 11 §2 « pas de CORS »). Le serveur factice tolère
//       aussi `/v1/…` : ce n'est pas ce que ces tests prouvent.
//   H3. La barre latérale est un `<nav aria-label="Espaces">` ; le lien de l'espace
//       courant porte `aria-current="page"`. Le contenu vit dans un `<main>` avec
//       un `<h1>` par vue : « Tour de contrôle », « Portefeuille », le titre de la
//       mission.
//   H4. Sans session (401), la console montre un formulaire « Adresse e-mail » /
//       « Mot de passe » / bouton « Se connecter » qui poste `loginRequestSchema`
//       sur `/api/v1/auth/login`. Le branchement cookie réel est A-006 (hors L7a) ;
//       ici seul le CÔTÉ CLIENT est jugé.
//   H5. La liste du portefeuille propose un bouton « Charger la suite » tant que
//       `nextCursor` n'est pas `null`.
//   H6. Chaque carte ou ligne de mission est repérable par `role="article"` (carte)
//       ou `role="row"` (tableau dense §33.4) — les deux formes sont acceptées.
//   H7. L'écran d'une mission affiche « Livrée le … » pour `deliveredAt` non nul,
//       au fuseau de la mission (§22.2).
// Traçabilité : E22 (console de pilotage), E43.
// =============================================================================
import { configure, render, within, type RenderResult } from '@testing-library/react';
import { App } from '../App.js';

// Le premier rendu d'un fichier paie le démarrage de jsdom et de React : sous la
// seconde par défaut, un `findBy*` peut rougir pour une raison de machine, pas de
// code. Quatre secondes restent très en deçà du `testTimeout` du projet (10 s).
configure({ asyncUtilTimeout: 4_000 });

export const ROUTES_CONSOLE = {
  accueil: '/hq/',
  portefeuille: '/hq/missions',
  mission: (id: string): string => `/hq/missions/${id}`,
} as const;

export const TITRES = {
  accueil: /tour de contrôle/i,
  portefeuille: /portefeuille/i,
} as const;

export const LIBELLES = {
  navigation: /espaces/i,
  chargerLaSuite: /charger la suite/i,
  seConnecter: /se connecter/i,
  adresseEmail: /adresse e-mail/i,
  motDePasse: /mot de passe/i,
} as const;

/** Rend la console à un chemin donné, comme si l'utilisateur y arrivait par l'URL. */
export function rendreConsole(chemin: string): RenderResult {
  window.history.replaceState(null, '', chemin);
  return render(<App />);
}

/** Les cartes/lignes de mission rendues (H6) — rôles implicites compris. */
export function elementsMission(racine: HTMLElement): readonly HTMLElement[] {
  const requete = within(racine);
  const cartes = requete.queryAllByRole('article');
  if (cartes.length > 0) return cartes;
  return requete.queryAllByRole('row').filter((ligne) => ligne.closest('thead') === null);
}
