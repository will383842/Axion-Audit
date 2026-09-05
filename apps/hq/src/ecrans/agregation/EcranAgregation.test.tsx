// =============================================================================
// L7b — ÉCRAN AGRÉGATION PAR QUESTION, par rôle et pixel par pixel (DOM + trace
// réseau). Tests d'ACCEPTATION écrits par A36 (09 §5.6 : A32 a écrit l'écran).
//
// ── LES QUATRE RENDUS, ET POURQUOI QUATRE TESTS ──────────────────────────────
// §27.4 nomme trois états — non communiqué, sans objet, à revoir — et le contrat
// L7b en rend un quatrième explicite : la question que PERSONNE n'a posée
// (`comptes.posee = 0`). Quatre situations, quatre rendus différents, quatre
// tests : un écran qui en fondrait deux (le « jamais posée » rendu comme un
// « sans objet », le refus rendu comme une cellule vide) resterait vert sur un
// test qui vérifie seulement « le badge existe quelque part ».
//
// ── PROVENANCE ≠ TYPE DE SESSION ─────────────────────────────────────────────
// `answers.source` (5 valeurs) et `interviews.kind` (6 valeurs) sont DEUX
// colonnes, côte à côte, jamais fondues : c'est leur comparaison qui fait le
// §27.6. Une observation dont la réponse vient d'un DOCUMENT doit se lire
// « observation » d'un côté et « Document » de l'autre.
//
// ── AUCUN NOM DE PERSONNE ─────────────────────────────────────────────────────
// Le contrat ne porte pas le nom du répondant (décision conservatoire du
// 2026-09-05) ; la fixture ne peut donc pas en fabriquer un. Ce fichier vérifie
// que l'écran affiche la FONCTION et le SERVICE, et que rien d'autre n'apparaît.
//
// Traçabilité : E14 (consolidation, divergences), E12 (à-revoir), E22 (console), E45 (matrice console rôle × espace), E32 (français, fuseaux), E21 (aucun montant).
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  CHAMPS_FINANCIERS_SURVEILLES,
  ERROR_CODES,
  MOTIFS_NON_COMMUNIQUE,
  PROVENANCES_REPONSE,
  TABLE_FINANCIERE,
} from '@axion/shared';
import {
  balayerStylesEnDur,
  chercherDansLeHtml,
  codesBrutsVisibles,
  jetonsInconnus,
  texteVisibleDEmblee,
} from '../../tests-aide/balayage-dom.js';
import { ID, MISSION_OUEST } from '../../tests-aide/fixtures-console.js';
import {
  AGREGATION_QUATRE_CAS,
  AGREGATION_QUATRE_CAS_OUEST,
  AGREGATION_VIDE,
  MOTIFS_QUATRE_CAS,
  QUESTIONS_QUATRE_CAS,
} from '../../tests-aide/fixtures-pilotage.js';
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
});

const CHEMIN = (id: string): string => `/hq/missions/${id}/agregation`;
const TITRE = /agrégation par question/i;

const NOMS_FINANCIERS_INTERDITS: readonly string[] = [
  ...CHAMPS_FINANCIERS_SURVEILLES,
  ...TABLE_FINANCIERE,
];
const VALEURS_SENTINELLES: readonly string[] = [
  '987654.21',
  '13579.02',
  'sentinelle_tjm',
  '1234.56',
];
const TRACE_TECHNIQUE =
  /\bat\s+\w+\s*\(|node_modules|\.tsx?:\d+|TypeError|Failed to fetch|\{"error"/;

async function rendreAgregation(
  scenario: ScenarioServeur = {},
  missionId: string = ID.missionTpe,
): Promise<HTMLElement> {
  serveur = installerServeurFactice(scenario);
  rendreConsole(CHEMIN(missionId));
  await screen.findByRole('heading', { level: 1, name: TITRE });
  return screen.getByRole('main');
}

/** Le bloc d'une question, repéré par son texte (H2). */
async function blocDe(principal: HTMLElement, texte: string): Promise<HTMLElement> {
  const titre = await within(principal).findByRole('heading', { level: 2, name: texte });
  const article = titre.closest('article');
  if (article === null) throw new Error(`question « ${texte} » sans article`);
  return article;
}

/**
 * La ligne des COMPTES d'une question, telle qu'un navigateur la rend : `textContent`
 * compacté. (`texteVisibleDEmblee` joint les nœuds de texte par une espace, ce
 * qui sépare « réponse » de son « s » de pluriel — un artefact du balayage, pas
 * de l'écran.)
 */
function comptesDe(bloc: HTMLElement): string {
  return (bloc.querySelector('.axn-agregation__comptes')?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les cellules d'une ligne, dans l'ordre des colonnes de l'en-tête. */
function cellules(ligne: Element, table: Element): Readonly<Record<string, string>> {
  const tetes = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const cases = [...ligne.querySelectorAll('td')].map((td) => texteVisibleDEmblee(td));
  return Object.fromEntries(tetes.map((tete, i) => [tete, cases[i] ?? '']));
}

// =============================================================================
// 1. LES QUATRE RENDUS — quatre tests, un par situation
// =============================================================================
describe('§27.4 — quatre situations, quatre rendus distincts', () => {
  it('RENSEIGNÉE — la valeur est rendue, sans badge de refus ni de sans-objet ; « à revoir » s’ajoute EN PLUS avec son motif, jamais à la place', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.renseignee);
    const table = bloc.querySelector('table');
    if (table === null) throw new Error('tableau absent');
    const lignes = [...table.querySelectorAll('tbody tr')];
    expect(lignes).toHaveLength(2);
    const alpha = cellules(lignes[0] ?? table, table);
    expect(alpha.Réponse).toBe('Oui');
    expect(alpha.État).toBe('');
    const beta = cellules(lignes[1] ?? table, table);
    expect(beta.Réponse).toMatch(/^Non/);
    expect(beta.Réponse).toContain(MOTIFS_QUATRE_CAS.aRevoir);
    expect(beta.État).toMatch(/à revoir/);
    expect(beta.État).toMatch(/révision 2/);
    expect(beta.État).not.toMatch(/non communiqué|sans objet/);
    expect(comptesDe(bloc)).toMatch(
      /2 réponses · 2 renseignées · 0 non communiquée · 0 sans objet · 1 à revoir · 2 unités/,
    );
  });

  it('NON COMMUNIQUÉE — badge « non communiqué » AVEC son motif en français, aucune valeur, et pas « sans objet »', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.refusee);
    const table = bloc.querySelector('table');
    if (table === null) throw new Error('tableau absent');
    const ligne = cellules(table.querySelector('tbody tr') ?? table, table);
    expect(ligne.État).toMatch(/non communiqué/);
    expect(ligne.État).toMatch(/confidentiel/i);
    expect(ligne.État).not.toMatch(/sans objet|à revoir/);
    // Aucune valeur : un tiret, jamais « null », jamais une chaîne vide muette.
    expect(ligne.Réponse).toBe('—');
    expect(comptesDe(bloc)).toMatch(/1 réponse · 0 renseignée · 1 non communiquée · 0 sans objet/);
    // Le code du motif (`confidentiel`) est rendu par son libellé ; aucun code du
    // contrat n'est affiché tel quel ailleurs.
    for (const motif of MOTIFS_NON_COMMUNIQUE.filter((m) => m !== 'confidentiel')) {
      expect(texteVisibleDEmblee(bloc)).not.toContain(motif);
    }
  });

  it('SANS OBJET — badge « sans objet » et le motif à côté de la valeur absente, distinct du refus', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.sansObjet);
    const table = bloc.querySelector('table');
    if (table === null) throw new Error('tableau absent');
    const ligne = cellules(table.querySelector('tbody tr') ?? table, table);
    expect(ligne.État).toMatch(/sans objet/);
    expect(ligne.État).not.toMatch(/non communiqué|à revoir/);
    expect(ligne.Réponse).toContain(MOTIFS_QUATRE_CAS.sansObjet);
    expect(comptesDe(bloc)).toMatch(/1 réponse · 0 renseignée · 0 non communiquée · 1 sans objet/);
  });

  it('JAMAIS POSÉE — sa PHRASE PROPRE (« posée dans aucune session »), qui dit que ce n’est ni un refus ni un sans-objet ; aucun tableau, aucun badge', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.jamaisPosee);
    const texte = texteVisibleDEmblee(bloc);
    expect(texte).toMatch(/aucune réponse à ce jour/i);
    expect(texte).toMatch(/posée dans aucune session/i);
    expect(texte).toMatch(/ni un refus, ni un « sans objet »/i);
    expect(bloc.querySelector('table')).toBeNull();
    expect(bloc.querySelector('.axn-badge')).toBeNull();
    expect(comptesDe(bloc)).toMatch(/0 réponse · 0 renseignée · 0 non communiquée · 0 sans objet/);
    // Le quatrième cas n'est PAS rendu comme un « sans objet » : la phrase du
    // « jamais posée » n'apparaît nulle part sur les trois autres questions.
    for (const autre of [
      QUESTIONS_QUATRE_CAS.renseignee,
      QUESTIONS_QUATRE_CAS.refusee,
      QUESTIONS_QUATRE_CAS.sansObjet,
    ]) {
      expect(texteVisibleDEmblee(await blocDe(principal, autre))).not.toMatch(
        /posée dans aucune session/i,
      );
    }
    // Et le bandeau de totaux le compte à part : « Jamais posées : 1 ».
    const totaux = principal.querySelector('dl.axn-fiche');
    expect(texteVisibleDEmblee(totaux ?? principal)).toMatch(/jamais posées\s*1\b/i);
    expect(texteVisibleDEmblee(totaux ?? principal)).toMatch(/non communiquées\s*1\b/i);
    expect(texteVisibleDEmblee(totaux ?? principal)).toMatch(/sans objet\s*1\b/i);
  });
});

// =============================================================================
// 2. PROVENANCE ≠ TYPE DE SESSION — côte à côte, jamais fondus
// =============================================================================
describe('§27.1 / §27.6 — la provenance de la réponse et le type de la session', () => {
  it('deux colonnes distinctes, adjacentes : « Type de session » puis « Provenance » ; une observation peut rendre une réponse « Document »', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.renseignee);
    const table = bloc.querySelector('table');
    if (table === null) throw new Error('tableau absent');
    const tetes = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const iType = tetes.indexOf('Type de session');
    const iProv = tetes.indexOf('Provenance');
    expect(iType).toBeGreaterThanOrEqual(0);
    expect(iProv).toBe(iType + 1);
    const lignes = [...table.querySelectorAll('tbody tr')];
    const alpha = cellules(lignes[0] ?? table, table);
    const beta = cellules(lignes[1] ?? table, table);
    expect(alpha['Type de session']).toBe('entretien');
    expect(alpha.Provenance).toBe('Entretien');
    expect(beta['Type de session']).toBe('observation');
    expect(beta.Provenance).toBe('Document');
    // La source ATTENDUE (§27.6) est dite en tête de question, pour la comparaison.
    expect(texteVisibleDEmblee(bloc)).toMatch(/source attendue : entretien/i);
    // Les codes bruts des provenances et des types ne s'affichent jamais.
    const texte = texteVisibleDEmblee(principal);
    for (const code of ['releve_donnees', 'analyse_documentaire', 'releve']) {
      expect(texte).not.toMatch(new RegExp(`(?<![\\w-])${code}(?![\\w-])`));
    }
    expect(PROVENANCES_REPONSE).toHaveLength(5);
  });

  it('le bandeau « Par provenance » porte les CINQ provenances, même à zéro', async () => {
    const principal = await rendreAgregation();
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    const totaux = texteVisibleDEmblee(principal.querySelector('dl.axn-fiche') ?? principal);
    expect(totaux).toMatch(/Entretien 4 · Observation 0 · Démonstration 0 · Document 1 · Relevé 0/);
  });

  it('la fonction et le service du répondant sont rendus ; aucune colonne « Nom », aucun courriel', async () => {
    const principal = await rendreAgregation();
    const bloc = await blocDe(principal, QUESTIONS_QUATRE_CAS.renseignee);
    const table = bloc.querySelector('table');
    if (table === null) throw new Error('tableau absent');
    const tetes = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(tetes).toContain('Fonction');
    expect(tetes).toContain('Service');
    expect(tetes.some((t) => /\bnom\b|e-mail|courriel/i.test(t))).toBe(false);
    const alpha = cellules(table.querySelector('tbody tr') ?? table, table);
    expect(alpha.Fonction).toBe('Directeur fictif');
    expect(alpha.Service).toBe('Direction générale');
    expect(document.body.outerHTML).not.toMatch(/@exemple\.test/);
  });
});

// =============================================================================
// 3. LES QUATRE ÉTATS (§33.2) — avec un contenu PROPRE à cet écran
// =============================================================================
describe('§33.2 — les quatre états de l’écran agrégation', () => {
  it('CHARGEMENT — role="status" occupé, « chargement de l’agrégation », jamais un spinner', async () => {
    const suspendu = installerServeurFactice({ latence: 'suspendue' });
    serveur = suspendu;
    rendreConsole(CHEMIN(ID.missionTpe));
    const statut = await screen.findByRole('status');
    expect(statut.getAttribute('aria-busy')).toBe('true');
    expect(statut.textContent).toMatch(/chargement de l[’']agrégation/i);
    expect(document.body.querySelector('[class*="spinner"], [class*="loader"]')).toBeNull();
    for (let tour = 0; tour < 6 && suspendu.enAttente > 0; tour += 1) {
      suspendu.liberer();
      await new Promise((r) => setTimeout(r, 20));
    }
    await screen.findByRole('heading', { level: 2, name: QUESTIONS_QUATRE_CAS.renseignee });
    await waitFor(() => {
      expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('VIDE — aucune question figée : un message PROPRE à l’agrégation qui dit QUOI FAIRE (figer le questionnaire)', async () => {
    const principal = await rendreAgregation({ agregations: { [ID.missionTpe]: AGREGATION_VIDE } });
    await within(principal).findByText(/aucune donnée collectée/i);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/questionnaire/i);
    expect(texte).toMatch(/fig(?:er|ez)/i);
    expect(within(principal).getByRole('link', { name: /retour à la mission/i })).toBeDefined();
    expect(principal.querySelector('table')).toBeNull();
    expect(within(principal).queryByRole('alert')).toBeNull();
  });

  it('VIDE (filtre) — un bloc sans question dit « aucune question dans ce bloc » et propose de revenir à tous les blocs', async () => {
    const principal = await rendreAgregation();
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.renseignee);
    const selection = within(principal).getByLabelText(/^bloc$/i);
    // Un code de bloc absent des fixtures : la liste du sélecteur vient du serveur ;
    // on force la valeur pour rendre la situation (le serveur rend zéro question).
    const option = document.createElement('option');
    option.value = 'bloc_9';
    option.textContent = 'Conformité';
    selection.appendChild(option);
    fireEvent.change(selection, { target: { value: 'bloc_9' } });
    await within(principal).findByText(/aucune question dans ce bloc/i);
    const bouton = within(principal).getByRole('button', { name: /voir tous les blocs/i });
    expect(serveur?.appels.at(-1)?.url.searchParams.get('block')).toBe('bloc_9');
    bouton.click();
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.renseignee);
  });

  it('ERREUR — un 500 rend un role="alert" français, code REPLIÉ, « Réessayer » qui relance', async () => {
    serveur = installerServeurFactice({ panne: 'serveur' });
    rendreConsole(CHEMIN(ID.missionTpe));
    const alerte = await screen.findByRole('alert');
    const visible = texteVisibleDEmblee(alerte);
    expect(visible).toMatch(/réessay|support/i);
    expect(visible).not.toContain(ERROR_CODES.INTERNAL_ERROR);
    expect(visible).not.toMatch(TRACE_TECHNIQUE);
    expect(codesBrutsVisibles(visible)).toEqual([]);
    const avant = serveur.appels.filter((a) => a.url.pathname.endsWith('/aggregation')).length;
    within(alerte)
      .getByRole('button', { name: /réessayer/i })
      .click();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      serveur.appels.filter((a) => a.url.pathname.endsWith('/aggregation')).length,
    ).toBeGreaterThan(avant);
  });

  it('HORS LIGNE — câble coupé : le texte de la CONSOLE, aucune trace technique', async () => {
    serveur = installerServeurFactice({ panne: 'reseau' });
    rendreConsole(CHEMIN(ID.missionTpe));
    await screen.findByText(/hors ligne/i);
    const visible = texteVisibleDEmblee(screen.getByRole('main'));
    expect(visible).not.toMatch(/enregistré sur cet appareil/i);
    expect(visible).not.toMatch(TRACE_TECHNIQUE);
    expect(codesBrutsVisibles(visible)).toEqual([]);
  });
});

// =============================================================================
// 4. CONSULTANT vs ADMIN — pixel par pixel
// =============================================================================
describe('@critique consultant vs administrateur — DOM et trace réseau, comparés', () => {
  function empreinte(principal: HTMLElement): string {
    return principal.innerHTML
      .replace(/id="[^"]*:r[0-9a-z]+:[^"]*"/g, 'id="…"')
      .replace(/for="[^"]*:r[0-9a-z]+:[^"]*"/g, 'for="…"');
  }

  it('@critique un consultant MEMBRE voit EXACTEMENT la même agrégation que l’administrateur', async () => {
    let principal = await rendreAgregation({ role: 'admin' });
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    await new Promise((r) => setTimeout(r, 50));
    const admin = empreinte(principal);
    serveur?.restaurer();
    cleanup();

    principal = await rendreAgregation({
      role: 'consultant',
      missionsDuConsultant: [ID.missionTpe],
    });
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    await new Promise((r) => setTimeout(r, 50));
    expect(empreinte(principal)).toBe(admin);
    expect(serveur?.appelsFinanciers).toEqual([]);
    expect(serveur?.appelsInattendus).toEqual([]);
    expect(serveur?.appels.filter((a) => a.url.pathname.endsWith('/aggregation'))).toHaveLength(1);
  });

  it('@critique un consultant NON MEMBRE : « introuvable », aucune question ni réponse dans le DOM, aucun rejeu', async () => {
    serveur = installerServeurFactice({ role: 'consultant', missionsDuConsultant: [] });
    rendreConsole(CHEMIN(ID.missionTpe));
    const alerte = await screen.findByRole('alert');
    await new Promise((r) => setTimeout(r, 1_300));
    expect(texteVisibleDEmblee(alerte)).toMatch(/introuvable|n[’']existe/i);
    expect(document.body.outerHTML).not.toContain(QUESTIONS_QUATRE_CAS.renseignee);
    expect(document.body.outerHTML).not.toContain('Directeur fictif');
    expect(serveur.appels.filter((a) => a.url.pathname.endsWith('/aggregation'))).toHaveLength(1);
    expect(serveur.appels.length).toBeLessThanOrEqual(3);
  });

  it('@critique étanchéité financière — DOM (attributs compris), trace, et aucun style en dur, pour les deux rôles ; la réponse d’audit `money` est RENDUE et ne trompe pas la sentinelle', async () => {
    // ── LE GARDE-FOU QUI S'APPLIQUE ICI, ET CELUI QUI NE S'APPLIQUE PAS ─────
    // Sur cet écran, les VALEURS affichées sont des réponses d'audit (`answers.
    // value`), collectées par le consultant lui-même : un client qui parle de ses
    // coûts, une réponse `money` avec sa devise. Le vocabulaire français de L7a
    // (`€`, « coût », « montant ») rougirait sur une donnée légitime et pousserait
    // à casser M5.1 pour protéger un invariant qui n'est pas menacé (revue A37, M7).
    // Ce qui est interdit ici, c'est `scoping_financials` : ses NOMS de champs,
    // sa table, ses VALEURS sentinelles — jamais le mot « euro ».
    for (const scenario of [
      { role: 'admin' as const },
      { role: 'consultant' as const, missionsDuConsultant: [ID.missionTpe] },
    ]) {
      const principal = await rendreAgregation(scenario);
      await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
      await new Promise((r) => setTimeout(r, 50));
      // CONTRÔLE DE VACUITÉ : la réponse `money` est bien là, avec sa devise.
      const budget = await blocDe(principal, QUESTIONS_QUATRE_CAS.budget);
      expect(texteVisibleDEmblee(budget)).toContain('4200 EUR');
      expect(chercherDansLeHtml(document.body, VALEURS_SENTINELLES)).toEqual([]);
      expect(chercherDansLeHtml(document.body, NOMS_FINANCIERS_INTERDITS)).toEqual([]);
      expect(serveur?.appelsFinanciers).toEqual([]);
      for (const appel of serveur?.appels ?? []) {
        expect(`${appel.url.pathname}${appel.url.search}`).not.toMatch(
          /scoping|financ|estimate|devis/i,
        );
      }
      expect(balayerStylesEnDur(principal)).toEqual([]);
      expect(jetonsInconnus(principal)).toEqual([]);
      serveur?.restaurer();
      cleanup();
    }
  });
});

// =============================================================================
// 5. FRANÇAIS, FUSEAU DE MISSION, FILTRE PAR BLOC
// =============================================================================
describe('invariant 5 — français et fuseau de mission ; le filtre de bloc passe par la route', () => {
  it('interface française : aucun code brut, aucun mot anglais d’interface ; l’en-tête dit « heure de mission »', async () => {
    const principal = await rendreAgregation();
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    const texte = texteVisibleDEmblee(principal);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    expect(texte).not.toMatch(
      /\b(?:loading|error|retry|aggregation|answer|withheld|review|block)\b/i,
    );
    expect(texte).toMatch(/heure de mission/i);
  });

  it('un horodatage `2026-09-02T03:30Z` se lit « 1 sept. 2026 20:30 » sur la mission de la côte Ouest — la DATE change, pas seulement l’heure', async () => {
    const principal = await rendreAgregation(
      {
        missions: [MISSION_OUEST],
        agregations: { [ID.missionOuest]: AGREGATION_QUATRE_CAS_OUEST },
      },
      ID.missionOuest,
    );
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.renseignee);
    const texte = texteVisibleDEmblee(principal);
    expect(texte).toMatch(/1 sept\. 2026,? 20:30/);
    expect(texte).not.toMatch(/2 sept\. 2026,? 0[35]:30/);
    // Et sur FIL-TPE (Europe/Paris), la même valeur se lit le 2 septembre à 05:30.
    serveur?.restaurer();
    cleanup();
    const paris = await rendreAgregation();
    await within(paris).findByText(QUESTIONS_QUATRE_CAS.renseignee);
    expect(texteVisibleDEmblee(paris)).toMatch(/2 sept\. 2026,? 05:30/);
  });

  it('choisir un bloc envoie `?block=<code>` à la route (jamais un filtre côté client) et ne rend que ses questions', async () => {
    const principal = await rendreAgregation();
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    const selection = within(principal).getByLabelText(/^bloc$/i);
    fireEvent.change(selection, { target: { value: 'bloc_2' } });
    await waitFor(() => {
      expect(within(principal).queryByText(QUESTIONS_QUATRE_CAS.renseignee)).toBeNull();
    });
    await within(principal).findByText(QUESTIONS_QUATRE_CAS.jamaisPosee);
    expect(within(principal).getByText(QUESTIONS_QUATRE_CAS.sansObjet)).toBeDefined();
    const dernier = serveur?.appels.filter((a) => a.url.pathname.endsWith('/aggregation')).at(-1);
    expect(dernier?.url.searchParams.get('block')).toBe('bloc_2');
    expect(dernier?.url.searchParams.get('service')).toBeNull();
    // Les totaux suivent le filtre : deux questions, une jamais posée.
    const totaux = texteVisibleDEmblee(principal.querySelector('dl.axn-fiche') ?? principal);
    expect(totaux).toMatch(/questionnaire figé\s*2\b/i);
    expect(totaux).toMatch(/jamais posées\s*1\b/i);
    expect(AGREGATION_QUATRE_CAS.questions).toHaveLength(5);
  });
});
