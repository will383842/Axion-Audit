// =============================================================================
// L7e — ÉCRAN D'EXPORT : ACCEPTATION PAR RÔLE ET QUATRE ÉTATS.
// Tests d'A36 (09 §5.6 : A30 a écrit l'écran, pas ce fichier).
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CE FICHIER EXISTE : LE COMPTE ÉTAIT 5/6, PAS 6/6
// ═══════════════════════════════════════════════════════════════════════════════
// La console a SIX écrans (`app/routeur.ts` : accueil, portefeuille, mission,
// couverture, agrégation, export — `design` est un outil interne). Cinq portaient
// une étanchéité par rôle marquée `@critique` :
//
//   · accueil, portefeuille, mission → `App.etancheite-roles.test.tsx` ;
//   · couverture                     → `EcranCouverture.test.tsx` ;
//   · agrégation                     → `EcranAgregation.test.tsx`.
//
// L'export n'en avait AUCUNE, et il n'avait pas non plus ses quatre états
// (§33.2) : `EcranExport.test.tsx` porte les trois décisions de l'écran, et son
// en-tête le dit — « Aucun `@critique` : l'acceptation par rôle, les quatre états
// et axe-core reviennent à A36 ». Le risque est FAIBLE (l'écran n'affiche que des
// méta et un mode d'emploi), mais un risque faible non mesuré reste non mesuré,
// et 5/6 n'est pas 6/6. C'est précisément l'écran dont on se dit qu'il n'a rien à
// cacher qui finit par ne jamais être regardé.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE QUE CHAQUE CAS ATTRAPE (implémentation plausible mais fausse)
// ═══════════════════════════════════════════════════════════════════════════════
//   · un écran d'export accessible à un consultant parce que sa route n'est pas
//     gardée — l'archive porte TOUTES les réponses de la mission ;
//   · un ZIP demandé alors que la mission n'a pas encore répondu (une requête
//     d'export émise dans le dos, sans clic : le §36.3 en fait une ACTION) ;
//   · `?repondants=true` posé par défaut, ou par un état résiduel — la porte du
//     nom du répondant s'ouvre alors sans que personne l'ait demandée ;
//   · un état de chargement rendu en page blanche, un état d'erreur rendu en
//     code technique, un `Failed to fetch` affiché tel quel hors ligne ;
//   · une requête vers une route financière « au cas où » sur le seul écran de la
//     console qui produise un FICHIER — celui par lequel une fuite sortirait
//     sans jamais s'afficher.
//
// ── LE RENDU PASSE PAR L'APPLICATION ENTIÈRE, PAS PAR LE COMPOSANT ─────────
// `EcranExport.test.tsx` monte `<EcranExport>` seul avec son propre faux `fetch`.
// C'est le bon choix POUR CE QU'IL TESTE (le téléchargement d'un binaire). Mais
// une garde de rôle ne se prouve pas en montant le composant à la main : elle se
// prouve en ARRIVANT sur l'URL, comme un utilisateur. On passe donc par
// `rendreConsole` et le serveur factice partagé, qui reproduit la politique réelle
// (`GET /v1/missions/:id` = administrateur seul, L7a) et TRACE tous les appels.
//
// Traçabilité : E21 (auditeurs jamais d'accès aux montants) · E22 (console de
// pilotage) · E32 (interface française) · E33 (sécurité / RGPD) · E45 (matrice
// console rôle × espace) · E36.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { CHAMPS_FINANCIERS_SURVEILLES, TABLE_FINANCIERE } from '@axion/shared';
import {
  balayerStylesEnDur,
  chercherDansLeHtml,
  codesBrutsVisibles,
  jetonsInconnus,
  texteVisibleDEmblee,
} from '../../tests-aide/balayage-dom.js';
import { ID } from '../../tests-aide/fixtures-console.js';
import { rendreConsole } from '../../tests-aide/rendu-console.js';
import {
  installerServeurFactice,
  type ScenarioServeur,
  type ServeurFactice,
} from '../../tests-aide/serveur-factice.js';

let serveur: ServeurFactice | undefined;

afterEach(() => {
  serveur?.restaurer();
  serveur = undefined;
  cleanup();
});

const CHEMIN = (id: string): string => `/hq/missions/${id}/export`;
const TITRE = /export de mission/i;

/**
 * Les noms interdits — DÉRIVÉS de `@axion/shared`, jamais recopiés : la même
 * source que la sentinelle de l'API. Une copie dériverait au premier champ ajouté
 * à `scoping_financials`, et ce fichier deviendrait vert pour rien.
 */
const NOMS_FINANCIERS_INTERDITS: readonly string[] = [
  ...CHAMPS_FINANCIERS_SURVEILLES,
  ...TABLE_FINANCIERE,
];

/** Les mêmes leurres que la sentinelle de l'API — improbables, reconnaissables. */
const VALEURS_SENTINELLES: readonly string[] = [
  '987654.21',
  '13579.02',
  'sentinelle_tjm',
  '1234.56',
];

/** Vocabulaire d'un écran de chiffrage — l'export n'en est pas un (§18.1.4). */
const VOCABULAIRE_FINANCIER = /€|\bTJM\b|\bdevis\b|\bmontant|\btarif|\bfacture|\bprix\b|\bcoût/i;

/** Une trace technique qui aurait fui jusqu'à l'écran. */
const TRACE_TECHNIQUE =
  /\bat\s+\w+\s*\(|node_modules|\.tsx?:\d+|TypeError|Failed to fetch|\{"error"/;

/**
 * Les noms interdits ET leur graphie en tirets : un attribut HTML ne s'écrit ni
 * en `snake_case` ni en `camelCase`, et c'est là qu'une valeur « posée pour plus
 * tard » se glisse le plus naturellement.
 */
const NOMS_TOUTES_GRAPHIES: readonly string[] = [
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

/** Rend l'écran d'export et attend son titre — le chemin d'un utilisateur réel. */
async function rendreExport(scenario: ScenarioServeur = {}): Promise<HTMLElement> {
  serveur = installerServeurFactice(scenario);
  rendreConsole(CHEMIN(ID.missionTpe));
  await screen.findByRole('heading', { level: 1, name: TITRE });
  // Le titre appartient a la COQUILLE : il est rendu avant que la mission soit
  // lue. On attend donc un marqueur du CORPS, sans quoi chaque assertion
  // porterait sur un ecran encore en chargement -- et serait verte pour rien.
  // `findAllBy` : deux descriptions citent `reponses.csv` (36.3 et 25.1).
  await screen.findAllByText(/reponses\.csv/);
  return screen.getByRole('main');
}

// =============================================================================
// 1. ÉTANCHÉITÉ FINANCIÈRE — le sixième écran, celui qui manquait
// =============================================================================
describe('@critique étanchéité financière de l’écran d’export — DOM, attributs et trace réseau', () => {
  it('@critique administrateur — aucune sentinelle, aucun NOM de champ financier, aucun vocabulaire de chiffrage', async () => {
    const principal = await rendreExport({ role: 'admin' });

    // Le HTML COMPLET : texte ET attributs. Un `data-montant` vide « pour plus
    // tard » ne se voit pas à l'écran et se lit très bien dans le DOM.
    expect(chercherDansLeHtml(principal, VALEURS_SENTINELLES)).toEqual([]);
    expect(chercherDansLeHtml(principal, NOMS_TOUTES_GRAPHIES)).toEqual([]);

    const texte = texteVisibleDEmblee(principal);
    expect(
      VOCABULAIRE_FINANCIER.test(texte),
      `vocabulaire de chiffrage sur l’écran d’export : « ${texte.slice(0, 200)} »`,
    ).toBe(false);

    // CONTRÔLE DE VACUITÉ — sans lui, un écran en panne rendrait ce test vert.
    expect(texte).toMatch(/reponses\.csv/);
    expect(texte).toMatch(/télécharger l’archive/i);
  });

  it('@critique administrateur — la trace réseau ne porte AUCUNE route financière, et aucun export non demandé', async () => {
    await rendreExport({ role: 'admin' });

    expect(serveur?.appelsFinanciers ?? []).toEqual([]);
    expect(serveur?.appelsInattendus ?? []).toEqual([]);

    // Le §36.3 fait de l'export une ACTION : rien ne se télécharge à l'ARRIVÉE
    // sur l'écran. Un ZIP demandé au montage serait un fichier de plusieurs
    // mégaoctets tiré dans le dos de l'utilisateur, à chaque visite.
    const exports = urlsAppelees().filter((url) => url.includes('/export'));
    expect(exports, `un export a été demandé sans clic : ${exports.join(', ')}`).toEqual([]);

    // Et le seul appel légitime est la lecture de la mission.
    expect(urlsAppelees()).toContain(`/api/v1/missions/${ID.missionTpe}`);
  });

  it('@critique la porte du nom des répondants est FERMÉE à l’arrivée — aucun `repondants=true` nulle part', async () => {
    const principal = await rendreExport({ role: 'admin' });

    expect(urlsAppelees().filter((url) => url.includes('repondants'))).toEqual([]);
    // Ni dans le DOM : un lien préconstruit avec le paramètre serait une porte
    // ouverte que personne n'a poussée.
    expect(principal.outerHTML).not.toContain('repondants=true');

    const case_ = screen.getByRole('checkbox', { name: /répondants/i });
    expect(
      (case_ as HTMLInputElement).checked,
      'la case des répondants est cochée à l’arrivée : une donnée personnelle ne s’ouvre ' +
        'jamais par défaut',
    ).toBe(false);
  });

  it('@critique une route financière FORCÉE depuis le client est refusée par le serveur — contre-épreuve', async () => {
    await rendreExport({ role: 'admin' });

    const reponse = await fetch(`/api/v1/scoping/${ID.missionTpe}/financials`);
    expect(reponse.status, 'le serveur a servi une ressource financière').toBe(403);
    expect(
      serveur?.appelsFinanciers.length,
      'le balayage ne CLASSE pas les routes financières : il ne mesure rien',
    ).toBe(1);
  });
});

// =============================================================================
// 2. LA DIFFÉRENCE ENTRE RÔLES, VÉRIFIÉE — pas supposée
// =============================================================================
describe('@critique l’écran d’export par rôle (03 §34.1 — la console est admin seul)', () => {
  it('@critique consultant — le refus, en français, et RIEN de l’archive : ni liste de fichiers, ni bouton', async () => {
    serveur = installerServeurFactice({ role: 'consultant' });
    rendreConsole(CHEMIN(ID.missionTpe));

    const alerte = await screen.findByRole('alert');
    const principal = screen.getByRole('main');
    expect(texteVisibleDEmblee(alerte)).toMatch(/reserve|administrateur|autoris|acces/i);
    const texte = texteVisibleDEmblee(principal);

    // La différence ATTENDUE, vérifiée une par une : le consultant ne voit ni le
    // mode d'emploi de l'archive, ni l'option des répondants, ni le bouton.
    expect(texte).not.toMatch(/reponses\.csv/);
    expect(screen.queryByRole('checkbox', { name: /répondants/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /télécharger l’archive/i })).toBeNull();

    // Le refus est une PHRASE, jamais un code brut ni une page blanche.
    expect(codesBrutsVisibles(texte), 'un code technique est affiché au consultant').toEqual([]);
    expect(texte.trim().length, 'page blanche : le refus ne se dit pas').toBeGreaterThan(20);
    expect(TRACE_TECHNIQUE.test(principal.outerHTML)).toBe(false);
  });

  it('@critique consultant — aucun export n’est TENTÉ, et aucune donnée d’archive ne transite', async () => {
    serveur = installerServeurFactice({ role: 'consultant' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByRole('alert');
    // TanStack Query rejoue par defaut trois fois, premiere reprise vers ~1 s :
    // on attend AU-DELA, sans quoi la tempete qu'on cherche n'a pas eu le temps
    // de se produire et l'assertion est verte pour la mauvaise raison.
    await new Promise((resoudre) => setTimeout(resoudre, 1_300));

    expect(urlsAppelees().filter((url) => url.includes('/export'))).toEqual([]);
    expect(serveur.appelsFinanciers).toEqual([]);
    // Refusé, le client NE RÉESSAIE PAS : un 403 qui déclenche une boucle est
    // une tempête de requêtes déguisée en robustesse.
    const lectures = urlsAppelees().filter((url) => url.includes(`/missions/${ID.missionTpe}`));
    expect(lectures.length, `le client a réessayé ${String(lectures.length)} fois`).toBeLessThan(3);
  });

  it('@critique anonyme — le formulaire de connexion, aucune donnée d’archive', async () => {
    serveur = installerServeurFactice({ role: 'anonyme' });
    rendreConsole(CHEMIN(ID.missionTpe));

    await screen.findByRole('button', { name: /se connecter/i });
    const texte = texteVisibleDEmblee(document.body);
    expect(texte).not.toMatch(/reponses\.csv/);
    expect(chercherDansLeHtml(document.body, VALEURS_SENTINELLES)).toEqual([]);
    expect(urlsAppelees().filter((url) => url.includes('/export'))).toEqual([]);
  });
});

// =============================================================================
// 3. LES QUATRE ÉTATS (§33.2) — l'écran n'en avait AUCUN de testé
// =============================================================================
describe('@critique §33.2 — les quatre états de l’écran d’export', () => {
  it('@critique CHARGEMENT — un squelette et un libellé, jamais une page blanche ni un spinner nu', async () => {
    serveur = installerServeurFactice({ role: 'admin', latence: 'suspendue' });
    rendreConsole(CHEMIN(ID.missionTpe));

    // Le titre est rendu tout de suite : c'est la coquille. Le CORPS, lui, est
    // en attente — et il doit le DIRE.
    await screen.findByRole('heading', { level: 1, name: TITRE });
    const principal = screen.getByRole('main');

    expect(
      serveur.enAttente,
      'aucune requête en vol : l’état de chargement n’est pas atteint',
    ).toBeGreaterThan(0);
    const texte = texteVisibleDEmblee(principal);
    expect(texte, 'le chargement ne se dit pas').toMatch(/chargement/i);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    // Rien de l'archive n'est annoncé tant que la mission n'est pas lue : une
    // liste rendue « en avance » ferait cliquer sur un bouton sans mission.
    expect(screen.queryByRole('button', { name: /télécharger l’archive/i })).toBeNull();

    serveur.liberer();
    await screen.findAllByText(/reponses\.csv/);
  });

  it('@critique ERREUR — cause et action en français, code technique REPLIÉ, « Réessayer » qui relance vraiment', async () => {
    serveur = installerServeurFactice({ role: 'admin', panne: 'serveur' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByRole('heading', { level: 1, name: TITRE });

    const principal = screen.getByRole('main');
    const reessayer = await screen.findByRole('button', { name: /réessayer/i });
    const texte = texteVisibleDEmblee(principal);

    expect(codesBrutsVisibles(texte), 'un code technique est affiché tel quel').toEqual([]);
    expect(TRACE_TECHNIQUE.test(principal.outerHTML)).toBe(false);
    expect(texte.trim().length).toBeGreaterThan(20);

    // Un `<details>` de détail technique, s'il existe, est REPLIÉ : le lecteur
    // voit la cause en français, pas la pile.
    for (const details of principal.querySelectorAll('details')) {
      expect(details.open, 'le détail technique est ouvert par défaut').toBe(false);
    }

    // « Réessayer » RELANCE : sans cela, c'est un bouton décoratif.
    const avant = urlsAppelees().length;
    reessayer.click();
    await new Promise((resoudre) => setTimeout(resoudre, 0));
    expect(urlsAppelees().length, '« Réessayer » n’a relancé aucune requête').toBeGreaterThan(
      avant,
    );
  });

  it('@critique HORS LIGNE — un message français, jamais le « Failed to fetch » du navigateur', async () => {
    serveur = installerServeurFactice({ role: 'admin', panne: 'reseau' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByRole('heading', { level: 1, name: TITRE });

    const principal = screen.getByRole('main');
    await screen.findByRole('button', { name: /réessayer/i });
    const texte = texteVisibleDEmblee(principal);

    expect(
      TRACE_TECHNIQUE.test(texte),
      `la panne réseau du navigateur est affichée telle quelle : « ${texte.slice(0, 200)} »`,
    ).toBe(false);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    // Un message qui parle de connexion, pas une erreur générique de serveur.
    expect(texte).toMatch(/connexion|réseau|hors ligne|serveur n’a pas répondu/i);
  });

  it('@critique NOMINAL — les dix fichiers annoncés, ce qui manque et pourquoi, et aucun état résiduel', async () => {
    const principal = await rendreExport({ role: 'admin' });
    const texte = texteVisibleDEmblee(principal);

    for (const fichier of [
      'mission.json',
      'arbre.csv',
      'sessions.csv',
      'reponses.csv',
      'constats.csv',
      'cas_usage.csv',
      'inventaire_outils.csv',
      'registre_ia.csv',
      'unites_hors_perimetre.csv',
      'pieces_jointes/manifest.csv',
    ]) {
      expect(texte, `${fichier} n’est pas annoncé avant le téléchargement`).toContain(fichier);
    }
    // Ce qui manque est DIT — c'est ce qui évite le retour dans l'outil.
    expect(texte).toContain('scores.csv');
    expect(texte).toMatch(/scoring/i);

    // Le libelle EXACT du squelette. Un /chargement/i naif mordrait sur
    // « telechargement des pieces jointes », qui est du contenu nominal.
    expect(texte).not.toMatch(/Chargement de la mission/i);
    expect(codesBrutsVisibles(texte)).toEqual([]);
  });

  it('@critique l’ABSENCE d’état vide est un CHOIX, pas un oubli : une mission qui existe est toujours exportable', async () => {
    // L'en-tête de l'écran l'affirme (« il n'y a pas d'état vide ») ; on le
    // VÉRIFIE : sur une mission introuvable, l'écran rend une ERREUR nommée avec
    // un retour, et jamais un « rien à exporter » qui empêcherait de télécharger
    // précisément l'archive prouvant qu'il n'y a rien encore.
    serveur = installerServeurFactice({ role: 'admin' });
    rendreConsole(CHEMIN(ID.missionInconnue));
    await screen.findByRole('heading', { level: 1, name: TITRE });

    const principal = screen.getByRole('main');
    const lien = await screen.findByRole('link', { name: /retour à la mission/i });
    expect(lien).toBeTruthy();

    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/introuvable|n’existe pas/i);
    expect(
      texte,
      'un état « vide » est rendu là où le §36.3 veut une archive : voir l’en-tête de l’écran',
    ).not.toMatch(/rien à exporter|aucune donnée à exporter/i);
    expect(codesBrutsVisibles(texte)).toEqual([]);
  });
});

// =============================================================================
// 4. LA CHARTE ET LA LANGUE — invariants 4 et 5, sur le sixième écran
// =============================================================================
describe('@critique l’écran d’export tient les invariants 4 et 5', () => {
  it('@critique aucune couleur ni taille en dur, aucun jeton inconnu de la charte (invariant 4)', async () => {
    const principal = await rendreExport({ role: 'admin' });
    expect(balayerStylesEnDur(principal)).toEqual([]);
    expect(jetonsInconnus(principal)).toEqual([]);
  });

  it('@critique interface 100 % française : aucun mot-clé d’interface anglais visible (invariant 5)', async () => {
    const principal = await rendreExport({ role: 'admin' });
    const texte = texteVisibleDEmblee(principal);

    // Les NOMS DE FICHIERS du §36.3 sont des données, pas de l'interface : le
    // pack les écrit `mission.json`, `cas_usage.csv`. On balaie donc les mots
    // d'INTERFACE, en excluant les lignes qui ne sont qu'un nom de fichier.
    const ANGLAIS =
      /\b(download|export file|loading|error|retry|cancel|submit|settings|search|close|next|previous)\b/i;
    expect(
      ANGLAIS.test(texte),
      `mot d’interface anglais sur l’écran d’export : « ${texte.slice(0, 300)} »`,
    ).toBe(false);

    // Contrôle de vacuité : l'écran parle bien français, et de la bonne chose.
    expect(texte).toMatch(/archive/i);
    expect(texte).toMatch(/consentement/i);
  });
});
