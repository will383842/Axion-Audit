// =============================================================================
// L7a — THÈME 5 : ce que voit un admin, ce qu'un consultant ne voit PAS — pixel
// par pixel, c'est-à-dire DOM ET trace réseau (09 §1, A36). Tests écrits AVANT le
// code par A36 (09 §3-2, §5.6).
//
// Le cadre : « la console est ADMIN SEUL » (03 §34.1) ; « les montants ne sortent
// JAMAIS d'un écran admin de chiffrage » (§18.1.4, §18.3) — et L7a n'a AUCUN écran
// de chiffrage. Donc, quel que soit le rôle : ZÉRO élément financier dans le DOM,
// ZÉRO requête vers une route financière. Et pour un consultant : ZÉRO donnée de
// mission, un refus en français.
//
// Les sentinelles et les noms interdits sont IMPORTÉS de la ceinture L2
// (`apps/api/tests/aide/sentinelle-financiere.ts`), jamais recopiés : une copie
// dériverait au premier champ ajouté, et ferait de ce fichier une infraction à la
// ceinture 3 (balayage des sources).
//
// Ce que chaque `@critique` attrape (implémentation plausible mais fausse) :
//   · une carte « Devis » ou une colonne « Montant » posée « pour plus tard » sur
//     la tour de contrôle, vide aujourd'hui, remplie demain ;
//   · un `GET /v1/scoping/…/financials` lancé « au cas où » puis ignoré à
//     l'affichage : la route a répondu, la donnée a fui ;
//   · un écran consultant qui MASQUE les cartes en CSS au lieu de ne pas les
//     demander — le DOM les porte, le réseau les a reçues ;
//   · un 403 rendu comme un code brut (`FORBIDDEN`) ou une page blanche ;
//   · un client qui, refusé, RÉESSAIE en boucle (tempête de requêtes).
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33 (sécurité / RGPD — côté
// client, rien n'est demandé qui ne doive l'être), E22 (console de pilotage), E43
// (exécutabilité autopilote).
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { apiErrorSchema, ERROR_CODES } from '@axion/shared';
import {
  NOMS_FINANCIERS_INTERDITS,
  VALEURS_SENTINELLES,
} from '../../api/tests/aide/sentinelle-financiere.js';
import {
  chercherDansLeHtml,
  codesBrutsVisibles,
  texteVisibleDEmblee,
} from './tests-aide/balayage-dom.js';
import { ID, MISSION_GC, MISSION_TPE } from './tests-aide/fixtures-console.js';
import {
  elementsMission,
  LIBELLES,
  rendreConsole,
  ROUTES_CONSOLE,
} from './tests-aide/rendu-console.js';
import { installerServeurFactice, type ServeurFactice } from './tests-aide/serveur-factice.js';

let serveur: ServeurFactice | undefined;

afterEach(() => {
  serveur?.restaurer();
  serveur = undefined;
});

const ECRANS: readonly (readonly [string, string])[] = [
  ['accueil', ROUTES_CONSOLE.accueil],
  ['portefeuille', ROUTES_CONSOLE.portefeuille],
  ['mission', ROUTES_CONSOLE.mission(ID.missionTpe)],
];

/** Vocabulaire d'un écran de chiffrage — absent de L7a par construction (§18.1.4). */
const VOCABULAIRE_FINANCIER = /€|\bTJM\b|\bdevis\b|\bmontant|\btarif|\bfacture|\bprix\b|\bcoût/i;

/**
 * Les noms interdits ET leur graphie en tirets (`data-total-amount`) : un attribut
 * HTML ne s'écrit ni en snake_case ni en camelCase, et c'est là qu'une valeur
 * « posée pour plus tard » se glisse le plus naturellement.
 */
const NOMS_FINANCIERS_TOUTES_GRAPHIES: readonly string[] = [
  ...NOMS_FINANCIERS_INTERDITS,
  ...NOMS_FINANCIERS_INTERDITS.map((nom) =>
    nom
      .replace(/_/g, '-')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase(),
  ),
];

function urlsAppelees(): readonly string[] {
  return (serveur?.appels ?? []).map((appel) => `${appel.url.pathname}${appel.url.search}`);
}

describe('@critique étanchéité financière — session ADMIN, écran par écran', () => {
  it.each(ECRANS)(
    '@critique %s — DOM : aucune sentinelle, aucun NOM de champ financier, aucun vocabulaire de chiffrage',
    async (_nom, chemin) => {
      serveur = installerServeurFactice();
      rendreConsole(chemin);
      await screen.findByText(MISSION_TPE.title);

      // Le HTML COMPLET (texte + attributs) : un `data-montant`, un `title`, un champ
      // masqué en CSS y sont, et c'est précisément ce qu'on cherche.
      expect(chercherDansLeHtml(document.body, VALEURS_SENTINELLES)).toEqual([]);
      expect(chercherDansLeHtml(document.body, NOMS_FINANCIERS_TOUTES_GRAPHIES)).toEqual([]);
      // Le texte ENTIER, caché compris : un « Devis : — € » sous `hidden` est dans le
      // DOM, donc dans la page — c'est la définition même de « pixel par pixel ».
      expect(document.body.textContent).not.toMatch(VOCABULAIRE_FINANCIER);
    },
  );

  it.each(ECRANS)(
    '@critique %s — RÉSEAU : aucune requête vers une ressource financière, aucune route inattendue',
    async (_nom, chemin) => {
      serveur = installerServeurFactice();
      rendreConsole(chemin);
      await screen.findByText(MISSION_TPE.title);
      // Laisser passer un tour de boucle : une requête « au cas où » part souvent APRÈS
      // le premier rendu (préchargement, second `useEffect`).
      await new Promise((r) => setTimeout(r, 50));

      expect(serveur.appelsFinanciers.map((a) => a.url.pathname)).toEqual([]);
      expect(serveur.appelsInattendus.map((a) => a.url.pathname)).toEqual([]);
      for (const url of urlsAppelees()) {
        for (const nom of NOMS_FINANCIERS_INTERDITS) expect(url).not.toContain(nom);
        expect(url).not.toMatch(/scoping|financ|estimate|devis/i);
      }
      // Ce que la console DEMANDE est exactement ce qu'elle affiche : missions et
      // entreprises. Rien d'autre n'existe dans L7a.
      for (const url of urlsAppelees()) {
        expect(url).toMatch(/\/v1\/(?:missions|companies|auth)(?:[/?]|$)/);
      }
    },
  );
});

describe('@critique étanchéité par rôle — session CONSULTANT : rien de la console, en français', () => {
  it.each(ECRANS)(
    '@critique %s — aucune donnée de mission dans le DOM, un refus français, aucun code brut',
    async (_nom, chemin) => {
      serveur = installerServeurFactice({ role: 'consultant' });
      rendreConsole(chemin);
      const alerte = await screen.findByRole('alert');
      const principal = screen.getByRole('main');

      const visible = texteVisibleDEmblee(alerte);
      expect(visible).toMatch(/réservé|administrateur|autoris|accès/i);
      expect(visible).not.toContain(ERROR_CODES.FORBIDDEN);
      expect(codesBrutsVisibles(texteVisibleDEmblee(principal))).toEqual([]);

      // PIXEL PAR PIXEL : pas de carte cachée, pas de titre de mission, pas de bouton
      // de pagination, pas de chiffres clés. Le DOM entier, attributs compris.
      expect(elementsMission(principal)).toHaveLength(0);
      expect(document.body.outerHTML).not.toContain(MISSION_TPE.title);
      expect(document.body.outerHTML).not.toContain(MISSION_GC.title);
      expect(document.body.outerHTML).not.toContain(ID.missionTpe);
      expect(screen.queryByRole('button', { name: LIBELLES.chargerLaSuite })).toBeNull();
      expect(chercherDansLeHtml(document.body, VALEURS_SENTINELLES)).toEqual([]);
      expect(chercherDansLeHtml(document.body, NOMS_FINANCIERS_TOUTES_GRAPHIES)).toEqual([]);
      expect(document.body.textContent).not.toMatch(VOCABULAIRE_FINANCIER);
    },
  );

  it.each(ECRANS)(
    '@critique %s — RÉSEAU : le refus est accepté, pas contourné ni rejoué en boucle',
    async (_nom, chemin) => {
      serveur = installerServeurFactice({ role: 'consultant' });
      rendreConsole(chemin);
      await screen.findByRole('alert');
      // TanStack Query rejoue par défaut 3 fois, première reprise vers ~1 s : c'est
      // exactement la « tempête » qu'on veut voir — ou ne pas voir. On attend au-delà.
      await new Promise((r) => setTimeout(r, 1_300));

      expect(serveur.appelsFinanciers).toEqual([]);
      expect(serveur.appelsInattendus).toEqual([]);
      // Un 403 n'est pas une panne : on ne le rejoue pas. Quelques appels (mission +
      // entreprise + éventuel second effet), jamais une tempête.
      expect(serveur.appels.length).toBeLessThanOrEqual(3);
      // Et surtout : AUCUN corps de mission n'a été reçu — le serveur a refusé.
      expect(serveur.appels.every((appel) => appel.methode === 'GET')).toBe(true);
    },
  );
});

describe('les différences ATTENDUES entre rôles, listées et vérifiées une par une (03 §34.1)', () => {
  it('admin : cartes + chiffres clés + navigation · consultant : le refus, et rien de cela', async () => {
    serveur = installerServeurFactice();
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByText(MISSION_TPE.title);
    let principal = screen.getByRole('main');
    const admin = {
      cartes: elementsMission(principal).length,
      chiffresCles: /missions?\s+actives?/i.test(texteVisibleDEmblee(principal)),
      refus: within(principal).queryByRole('alert') !== null,
    };
    expect(admin).toEqual({ cartes: 2, chiffresCles: true, refus: false });
    serveur.restaurer();
    cleanup();

    serveur = installerServeurFactice({ role: 'consultant' });
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByRole('alert');
    principal = screen.getByRole('main');
    const consultant = {
      cartes: elementsMission(principal).length,
      chiffresCles: /\d+\s+missions?\s+actives?/i.test(texteVisibleDEmblee(principal)),
      refus: within(principal).queryByRole('alert') !== null,
    };
    expect(consultant).toEqual({ cartes: 0, chiffresCles: false, refus: true });
  });

  it('anonyme : le formulaire de connexion, aucune donnée, aucune requête de données réussie', async () => {
    serveur = installerServeurFactice({ role: 'anonyme' });
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByRole('button', { name: LIBELLES.seConnecter });
    expect(document.body.outerHTML).not.toContain(MISSION_TPE.title);
    expect(elementsMission(document.body)).toHaveLength(0);
    expect(serveur.appelsFinanciers).toEqual([]);
  });
});

describe('CONTRE-ÉPREUVES — les balayages MORDENT sur une fuite fabriquée', () => {
  it('le balayage du DOM voit une sentinelle glissée dans un attribut, pas seulement dans un texte', () => {
    const cobaye = document.createElement('section');
    const [sentinelle] = VALEURS_SENTINELLES;
    const [nomInterdit] = NOMS_FINANCIERS_INTERDITS;
    expect(sentinelle).toBeDefined();
    expect(nomInterdit).toBeDefined();
    cobaye.setAttribute('data-valeur', sentinelle ?? '');
    cobaye.setAttribute('data-champ', nomInterdit ?? '');
    expect(chercherDansLeHtml(cobaye, VALEURS_SENTINELLES)).toEqual([sentinelle]);
    expect(chercherDansLeHtml(cobaye, NOMS_FINANCIERS_INTERDITS)).toEqual([nomInterdit]);
    // Et la variante à virgule, telle qu'une couche d'affichage française la rendrait.
    const virgule = document.createElement('p');
    virgule.textContent = (sentinelle ?? '').replace('.', ',');
    expect(chercherDansLeHtml(virgule, VALEURS_SENTINELLES)).toEqual([sentinelle]);
  });

  it('la trace réseau classe et REFUSE une route financière forcée depuis le client', async () => {
    serveur = installerServeurFactice();
    const reponse = await fetch('/api/v1/scoping/018f0000-0000-7000-8000-000000000001/financials');
    expect(reponse.status).toBe(403);
    expect(serveur.appelsFinanciers).toHaveLength(1);
    const corps = apiErrorSchema.parse(await reponse.json());
    expect(corps.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('le serveur factice ne sert JAMAIS une sentinelle à un admin non plus (L7a n’a pas d’écran de chiffrage)', async () => {
    serveur = installerServeurFactice();
    for (const chemin of ['/api/v1/missions?limit=50', `/api/v1/missions/${ID.missionTpe}`]) {
      const corps = await (await fetch(chemin)).text();
      expect(VALEURS_SENTINELLES.filter((v) => corps.includes(v))).toEqual([]);
      expect(NOMS_FINANCIERS_INTERDITS.filter((n) => corps.includes(n))).toEqual([]);
    }
  });
});
