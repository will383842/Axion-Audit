// =============================================================================
// BALAYAGE SENTINELLE FINANCIER — ceinture 4 de l'étanchéité. Lot L2, tâche T5.
// Note de conception `docs/conception/LOT_L2.md` §2.2-4 et §5 (test `@critique`).
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
// ═══════════════════════════════════════════════════════════════════════════════
// C'est un MOTEUR, pas un test : il n'affirme rien, il RAPPORTE. Les assertions
// vivent dans le fichier de tests (A16, 09 §5.6) ; ce fichier ne contient aucun
// `expect`, aucun `it`, et peut donc être écrit par l'agent du lot sans que
// personne ne teste son propre code.
//
// ── LE PRINCIPE, ET POURQUOI IL DIFFÈRE D'UNE LISTE DE ROUTES ────────────────
// On sème un cadrage dont les montants sont des valeurs SENTINELLES improbables,
// puis on appelle TOUTES LES ROUTES ÉNUMÉRÉES À L'EXÉCUTION (`app.registreAcces`,
// peuplé par le crochet `onRoute` du socle) avec des jetons NON administrateurs, et
// on exige qu'aucun corps de réponse ne contienne une sentinelle.
// Ce balayage ne vérifie donc pas les routes auxquelles on a pensé : il vérifie
// CELLES QUI EXISTENT. Une route ajoutée demain y entre d'elle-même.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LE DÉFAUT QUE CE MODULE REFUSE DE REPRODUIRE — À LIRE AVANT DE LE MODIFIER
// ═══════════════════════════════════════════════════════════════════════════════
// Un balayage naïf substitue un UUID quelconque aux paramètres d'URL. Toutes les
// routes rendent alors 404, aucune sentinelle n'apparaît nulle part, et le test est
// VERT — vert parce qu'il n'a rien traversé, pas parce que rien ne fuit. C'est
// exactement la famille de garde-fou « qui rassure sans protéger » que ce dépôt
// traque : un contrôle vert dont l'énoncé affirme l'absence du défaut qu'il ne
// regarde pas.
//
// Trois mécanismes ferment ce trou, et ils sont la valeur de ce fichier :
//
//  ① CARTOGRAPHIE OBLIGATOIRE DES PARAMÈTRES. Chaque `:parametre` d'une URL doit
//     avoir une valeur RÉELLE, semée, déclarée par l'appelant. Un paramètre non
//     cartographié est REMONTÉ comme une anomalie — pas ignoré. Conséquence
//     voulue : la route `/v1/missions/:id/interview-plan` ajoutée demain oblige son
//     auteur à semer une mission réelle, sans quoi le balayage rougit. C'est ce qui
//     maintient la puissance du contrôle dans le temps.
//
//  ② COMPTE RENDU DE COUVERTURE. Le rapport distingue « refusé » (401/403 — la
//     route a bien tenu), « exercé » (2xx — la route a VRAIMENT rendu un corps, et
//     ce corps a été lu) et « non exercé » (autre chose : 404, 400, 500). Un
//     balayage dont rien n'est « exercé » n'a rien prouvé, et il le DIT.
//
//  ③ AUTO-CONTRÔLE D'OBJET. Si aucune route du registre ne porte
//     `financier: true`, le balayage n'a pas d'objet et le signale. C'est le
//     constat qu'A17 avait écrit à la main dans `.github/coverage-critical-paths
//     .json` le 2026-08-29 (« le balayage promis n'a pas d'objet aujourd'hui ») :
//     il devient ici une propriété mesurée à chaque exécution.
//
// La preuve de SENSIBILITÉ, elle, ne peut pas venir de ce fichier : c'est au test
// d'INJECTER une route fautive et d'exiger que le balayage la voie (voir
// `MODE_D_EMPLOI_INJECTION` en fin de fichier). Un garde-fou vert sur un dépôt sain
// ne prouve rien.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33.
// =============================================================================
import type { FastifyInstance } from 'fastify';
import type { EntreeRegistreAcces } from '../../src/auth/politique.js';

/**
 * Les valeurs semées dans `scoping_financials` pour le balayage.
 *
 * Choisies pour être IMPROBABLES et TEXTUELLEMENT RECONNAISSABLES : un montant
 * décimal à deux décimales qui n'apparaît dans aucun jeu de données réaliste, et un
 * profil de taux journalier nommé `sentinelle`. Une valeur ronde (10 000) se
 * confondrait avec un seuil ; une valeur courte (42) apparaîtrait par hasard dans
 * un identifiant.
 *
 * ⚠ Ces valeurs sont des LEURRES DE TEST, jamais un secret (11 §2 : « les tests
 * utilisent des secrets factices »).
 */
export const SENTINELLES_FINANCIERES = {
  totalAmount: '987654.21',
  travelCosts: '13579.02',
  profilTauxJournalier: 'sentinelle_tjm',
  tauxJournalier: '1234.56',
} as const;

/** La liste plate, telle que le balayage la cherche dans les réponses. */
export const VALEURS_SENTINELLES: readonly string[] = [
  SENTINELLES_FINANCIERES.totalAmount,
  SENTINELLES_FINANCIERES.travelCosts,
  SENTINELLES_FINANCIERES.profilTauxJournalier,
  SENTINELLES_FINANCIERES.tauxJournalier,
];

/** Ce qu'est devenu un appel du balayage. */
export type IssueAppel =
  /** Une sentinelle a été trouvée dans la réponse. C'est LA fuite. */
  | 'fuite'
  /** 401/403 — la route a refusé. Le garde-fou a tenu. */
  | 'refus'
  /** 2xx — la route a rendu un corps, et ce corps a été LU sans sentinelle. */
  | 'exerce'
  /** Autre statut (404, 400, 429, 5xx) : la route n'a rien prouvé. */
  | 'non_exerce';

export interface AppelBalaye {
  readonly porteur: string;
  readonly methode: string;
  /** Le GABARIT tel qu'il figure au registre (`/v1/scoping/:id/financials`). */
  readonly gabarit: string;
  /** L'URL réellement appelée, paramètres substitués. */
  readonly url: string;
  readonly statut: number;
  readonly issue: IssueAppel;
  /** Les sentinelles trouvées, s'il y en a. Vide sinon. */
  readonly sentinellesTrouvees: readonly string[];
}

export interface RapportBalayage {
  readonly appels: readonly AppelBalaye[];
  /** LE résultat qui compte. Vide = aucune fuite observée par CE balayage. */
  readonly fuites: readonly AppelBalaye[];
  /**
   * Paramètres d'URL sans valeur réelle déclarée. NON VIDE = le balayage a tapé
   * dans le vide sur ces routes ; son silence ne vaut rien pour elles.
   */
  readonly parametresNonCartographies: readonly string[];
  /** Les routes que le registre déclare financières (`financier: true`). */
  readonly routesFinancieres: readonly string[];
  readonly couverture: {
    readonly exerces: number;
    readonly refuses: number;
    readonly nonExerces: number;
  };
  /**
   * Ce qui rend le balayage NON CONCLUANT. Une liste non vide ne dit pas « ça
   * fuit » : elle dit « ce vert ne prouve rien », ce qui doit faire échouer le test
   * tout autant.
   */
  readonly anomaliesDeCouverture: readonly string[];
}

export interface OptionsBalayage {
  readonly app: FastifyInstance;
  /**
   * Les porteurs NON ADMINISTRATEURS à essayer : libellé → jeton (`null` pour
   * l'anonyme). L'administrateur est délibérément ABSENT — il a le droit de voir
   * les montants (03 §34.1), l'y inclure produirait une fausse fuite et le
   * balayage finirait désarmé.
   */
  readonly porteurs: Readonly<Record<string, string | null>>;
  /**
   * Valeur RÉELLE et semée pour chaque nom de paramètre d'URL (`id`, `missionId`…).
   * Un paramètre absent de cette table est remonté dans
   * `parametresNonCartographies` : le balayage appelle quand même, mais il déclare
   * que son résultat ne vaut rien pour cette route.
   */
  readonly valeursDeParametre: Readonly<Record<string, string>>;
  /** Les valeurs cherchées. Par défaut `VALEURS_SENTINELLES`. */
  readonly sentinelles?: readonly string[];
}

/** UUID de bouchage quand un paramètre n'est pas cartographié. */
const UUID_INCONNU = '018f0000-0000-7000-8000-0000000000ff';

/** Méthodes auxquelles on envoie un corps vide plutôt que rien. */
const METHODES_AVEC_CORPS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Les méthodes que `app.inject` accepte. La liste existe pour que le passage du
 * registre (des `string`) à l'injection se fasse par un GARDE DE TYPE et non par
 * une assertion — « aucun `any`, aucune assertion » (note L2 §2.1). Une méthode
 * inconnue est REMONTÉE, pas silencieusement convertie.
 */
const METHODES_HTTP = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type MethodeHttp = (typeof METHODES_HTTP)[number];

function estMethodeHttp(methode: string): methode is MethodeHttp {
  const connues: readonly string[] = METHODES_HTTP;
  return connues.includes(methode);
}

/**
 * Les variantes textuelles sous lesquelles une sentinelle peut apparaître.
 *
 * `987654.21` peut sortir tel quel (chaîne d'un `NUMERIC`, cas normal), en JSON
 * numérique (identique), ou formaté à la française par une couche d'affichage
 * (`987654,21`). On cherche donc les deux séparateurs décimaux.
 *
 * CE QU'ON NE CHERCHE PAS, ET POURQUOI : la valeur tronquée (`987654`) ou arrondie
 * (`987654.2`), qui produirait des faux positifs sur des identifiants ; la valeur
 * encodée (base64, chiffrée) ; la valeur RECALCULÉE (un total divisé par le nombre
 * de jours). Ces angles morts sont énumérés dans le rapport du lot, pas cachés.
 */
function variantes(sentinelle: string): readonly string[] {
  const virgule = sentinelle.replace('.', ',');
  return virgule === sentinelle ? [sentinelle] : [sentinelle, virgule];
}

/**
 * Cherche les sentinelles dans un texte. Exposée pour que le test puisse prouver
 * la SENSIBILITÉ du détecteur sans passer par une route.
 */
export function detecterSentinelles(
  texte: string,
  sentinelles: readonly string[] = VALEURS_SENTINELLES,
): readonly string[] {
  return sentinelles.filter((sentinelle) =>
    variantes(sentinelle).some((variante) => texte.includes(variante)),
  );
}

/** Extrait les noms de paramètres d'un gabarit d'URL (`:id`, `:missionId`). */
export function parametresDuGabarit(gabarit: string): readonly string[] {
  return gabarit
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\(.*$/, ''));
}

function substituer(
  gabarit: string,
  valeurs: Readonly<Record<string, string>>,
): { readonly url: string; readonly manquants: readonly string[] } {
  const manquants: string[] = [];
  const url = gabarit
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const nom = segment.slice(1).replace(/\(.*$/, '');
      const valeur = valeurs[nom];
      if (valeur === undefined) {
        manquants.push(nom);
        return UUID_INCONNU;
      }
      return valeur;
    })
    .join('/');
  return { url, manquants };
}

function classer(statut: number, sentinellesTrouvees: readonly string[]): IssueAppel {
  if (sentinellesTrouvees.length > 0) return 'fuite';
  if (statut === 401 || statut === 403) return 'refus';
  if (statut >= 200 && statut < 300) return 'exerce';
  return 'non_exerce';
}

/**
 * LE BALAYAGE. Appelle chaque route du registre avec chaque porteur non
 * administrateur et rend un rapport — jamais une assertion.
 *
 * Les en-têtes sont inspectés au même titre que le corps : une réponse peut fuir
 * par un `x-total` ou un `location` tout aussi bien que par son JSON.
 */
export async function balayerSentinellesFinancieres(
  options: OptionsBalayage,
): Promise<RapportBalayage> {
  const sentinelles = options.sentinelles ?? VALEURS_SENTINELLES;
  const registre: readonly EntreeRegistreAcces[] = options.app.registreAcces;

  const appels: AppelBalaye[] = [];
  const manquantsGlobaux = new Set<string>();
  const nonBalayables: string[] = [];
  const routesFinancieres: string[] = [];

  for (const entree of registre) {
    // Fastify appelle `onRoute` DEUX FOIS pour un `GET` (la route et le `HEAD`
    // qu'il engendre) : le registre porte donc deux entrées de même URL. On
    // dédoublonne pour que le rapport se lise, sans toucher au registre — c'est le
    // socle qui décide de ce qu'il enregistre, pas le balayage.
    if (
      entree.acces.type === 'roles' &&
      entree.acces.financier === true &&
      !routesFinancieres.includes(entree.url)
    ) {
      routesFinancieres.push(entree.url);
    }

    const { url, manquants } = substituer(entree.url, options.valeursDeParametre);
    for (const nom of manquants) manquantsGlobaux.add(`${entree.url} → :${nom}`);

    for (const methode of entree.methodes) {
      if (!estMethodeHttp(methode)) {
        nonBalayables.push(
          `${entree.url} : méthode « ${methode} » inconnue du balayage — route NON couverte.`,
        );
        continue;
      }
      for (const [porteur, jeton] of Object.entries(options.porteurs)) {
        const reponse = await options.app.inject({
          method: methode,
          url,
          headers: {
            ...(jeton === null ? {} : { authorization: `Bearer ${jeton}` }),
            ...(METHODES_AVEC_CORPS.has(methode) ? { 'content-type': 'application/json' } : {}),
          },
          ...(METHODES_AVEC_CORPS.has(methode) ? { payload: {} } : {}),
        });

        const matiere = `${reponse.body}\n${JSON.stringify(reponse.headers)}`;
        const trouvees = detecterSentinelles(matiere, sentinelles);

        appels.push({
          porteur,
          methode,
          gabarit: entree.url,
          url,
          statut: reponse.statusCode,
          issue: classer(reponse.statusCode, trouvees),
          sentinellesTrouvees: trouvees,
        });
      }
    }
  }

  const couverture = {
    exerces: appels.filter((appel) => appel.issue === 'exerce').length,
    refuses: appels.filter((appel) => appel.issue === 'refus').length,
    nonExerces: appels.filter((appel) => appel.issue === 'non_exerce').length,
  };

  const anomalies: string[] = [...nonBalayables];
  if (registre.length === 0) {
    anomalies.push('Le registre des routes est VIDE : le balayage n’a rien parcouru.');
  }
  if (routesFinancieres.length === 0) {
    anomalies.push(
      'Aucune route du registre ne porte `financier: true` : le balayage n’a PAS D’OBJET. ' +
        'Son silence ne prouve pas l’étanchéité — il prouve seulement qu’il n’y a rien à protéger.',
    );
  }
  if (couverture.exerces === 0) {
    anomalies.push(
      'Aucun appel n’a rendu 2xx : aucun corps de réponse n’a réellement été lu. ' +
        'Un balayage qui ne traverse rien est vert par vacuité.',
    );
  }
  for (const financiere of routesFinancieres) {
    const atteintes = appels.filter(
      (appel) => appel.gabarit === financiere && appel.issue !== 'refus',
    );
    for (const atteinte of atteintes) {
      anomalies.push(
        `Route financière ${atteinte.methode} ${financiere} atteinte par « ${atteinte.porteur} » ` +
          `sans refus (statut ${String(atteinte.statut)}) : la ceinture 1 ne tient pas.`,
      );
    }
  }

  return {
    appels,
    fuites: appels.filter((appel) => appel.issue === 'fuite'),
    parametresNonCartographies: [...manquantsGlobaux].sort((a, b) => a.localeCompare(b)),
    routesFinancieres,
    couverture,
    anomaliesDeCouverture: anomalies,
  };
}

/** Rendu lisible du rapport, pour le message d'échec du test. */
export function decrireRapport(rapport: RapportBalayage): string {
  const lignes = [
    `Routes financières déclarées : ${rapport.routesFinancieres.join(' · ') || 'AUCUNE'}`,
    `Couverture : ${String(rapport.couverture.exerces)} exercés · ` +
      `${String(rapport.couverture.refuses)} refusés · ` +
      `${String(rapport.couverture.nonExerces)} non exercés`,
    ...rapport.parametresNonCartographies.map(
      (manquant) => `Paramètre NON cartographié : ${manquant}`,
    ),
    ...rapport.anomaliesDeCouverture.map((anomalie) => `Anomalie : ${anomalie}`),
    ...rapport.fuites.map(
      (fuite) =>
        `FUITE : ${fuite.methode} ${fuite.gabarit} → « ${fuite.porteur} » a reçu ` +
        `${fuite.sentinellesTrouvees.join(', ')} (statut ${String(fuite.statut)})`,
    ),
  ];
  return lignes.join('\n');
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MODE D'EMPLOI DE LA PREUVE PAR INJECTION — à exécuter par le test, pas ici.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un balayage vert sur un dépôt sain ne prouve pas qu'il verrait une fuite. La
 * sensibilité se prouve en SEMANT le défaut :
 *
 *   1. enregistrer, DANS LE FICHIER DE TESTS UNIQUEMENT, une route d'épreuve
 *      ouverte à un rôle non administrateur, dont le gestionnaire lit la ligne
 *      financière PAR UNE REQUÊTE SQL DIRECTE (pas par le dépôt : le dépôt ne
 *      compile pas sans la marque, ce qui est précisément la ceinture 2) ;
 *   2. lancer le balayage : il DOIT rendre au moins une `fuite` sur cette route ;
 *   3. retirer la route et relancer : `fuites` DOIT être vide.
 *
 * Le point 3 sans le point 2 est un test qui se félicite. Le point 2 est le test.
 */
