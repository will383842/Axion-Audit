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
// ═══════════════════════════════════════════════════════════════════════════════
// LE DÉFAUT QUE CE MODULE A LUI-MÊME PORTÉ (mesuré par A02, corrigé le 2026-08-31)
// ═══════════════════════════════════════════════════════════════════════════════
// La première rédaction promettait ce qu'elle ne mesurait pas, et il faut l'écrire
// ici pour que personne ne le réintroduise « par simplicité » :
//
//   · la cartographie était PLATE — `Record<nomDeParametre, valeur>`. Une valeur
//     déclarée pour `:id` (un `scoping_estimate` réel) servait donc de repli
//     universel à TOUT `:id` du dépôt. La route `/v1/companies/:id`, ajoutée en L3,
//     recevait l'id d'un cadrage, rendait 404, était classée `non_exerce`, et
//     `parametresNonCartographies` restait VIDE. Le balayage restait VERT sur une
//     route qu'il n'avait jamais traversée — le défaut ci-dessus, reproduit par le
//     mécanisme censé le fermer.
//   · `non_exerce` était COMPTÉ, et rien de plus. Une route muette pour tous les
//     porteurs disparaissait du raisonnement au lieu d'être dénoncée.
//
// Quatre mécanismes ferment ces trous, et ils sont la valeur de ce fichier :
//
//  ① CARTOGRAPHIE PAR (GABARIT, PARAMÈTRE) — JAMAIS PAR NOM SEUL. La valeur d'un
//     paramètre se déclare POUR UN GABARIT PRÉCIS
//     (`{ '/v1/scoping/:id/financials': { id: <cadrage réel> } }`) et ne déborde sur
//     AUCUN autre. Forme retenue : `Record<gabarit, Record<parametre, valeur>>`.
//     POURQUOI CELLE-LÀ, et pas une liste d'entrées ni un repli global :
//       — le gabarit est la clé NATURELLE du registre (`EntreeRegistreAcces.url`) ;
//         la table se lit et se relit à côté du registre, sans index intermédiaire ;
//       — la nidification rend le débordement INEXPRIMABLE : il n'existe aucun
//         endroit où écrire « `:id` en général ». Une liste plate d'entrées
//         `{gabarit, parametre, valeur}` aurait la même sémantique mais autoriserait
//         deux lignes contradictoires pour un même couple ; le `Record` imbriqué,
//         non ;
//       — un REPLI GLOBAL, quelle que soit sa mise en scène, ressusciterait
//         exactement le défaut corrigé : il rendrait vert un gabarit que personne
//         n'a semé. Il est donc REFUSÉ, pas oublié.
//     Conséquence VOULUE et désormais MESURÉE : la route `/v1/missions/:id`
//     ajoutée demain est remontée dans `parametresNonCartographies` tant que son
//     auteur n'a pas déclaré de valeur POUR ELLE. Le balayage rougit chez celui qui
//     ajoute la route, pas trois lots plus tard.
//     Symétrique du même mécanisme : une déclaration qui ne correspond à AUCUN
//     gabarit du registre (route renommée, supprimée, faute de frappe) est remontée
//     dans `declarationsInutiles`. Sans quoi la cartographie dérive en silence et
//     l'on croit semer une route qui n'existe plus.
//
//  ② COMPTE RENDU DE COUVERTURE. Le rapport distingue « refusé » (401/403 — la
//     route a bien tenu), « exercé » (2xx — la route a VRAIMENT rendu une réponse,
//     et cette réponse a été lue) et « non exercé » (autre chose : 404, 400, 500).
//     Un balayage dont rien n'est « exercé » n'a rien prouvé, et il le DIT.
//
//  ②bis REFUS DU `non_exerce` SILENCIEUX — voir `natureDuSilence`. Un couple
//     (gabarit, méthode) dont AUCUN porteur n'a été ni refusé (401/403) ni servi
//     (2xx) n'a rien prouvé. Le rapport ne le compte plus : il le NOMME.
//
//  ③ AUTO-CONTRÔLE D'OBJET. Si aucune route du registre ne porte
//     `financier: true`, le balayage n'a pas d'objet et le signale. C'est le
//     constat qu'A17 avait écrit à la main dans `.github/coverage-critical-paths
//     .json` le 2026-08-29 (« le balayage promis n'a pas d'objet aujourd'hui ») :
//     il devient ici une propriété mesurée à chaque exécution.
//
// ── CE QUE ① ET ②bis PROUVENT ENSEMBLE, ET QU'AUCUN DES DEUX NE PROUVE SEUL ───
// ① garantit qu'une valeur a été DÉCLARÉE pour ce gabarit ; il ne peut pas savoir
// si elle DÉSIGNE quelque chose. ②bis, lui, dénonce le gabarit que personne n'a
// traversé — donc la valeur déclarée mais MORTE (un UUID bien formé qui ne
// correspond à aucune ligne rend 404 pour tous les porteurs). « Valeur RÉELLE,
// semée » cesse ainsi d'être une promesse d'en-tête pour devenir une propriété
// MESURÉE. Une exception à connaître : sur une route que le RBAC refuse à tous les
// porteurs du balayage (401/403 avant le gestionnaire), la valeur n'est jamais
// déréférencée — elle peut donc être morte sans que rien ne le dise. Ce n'est pas
// un trou : une route qui refuse tout le monde ne peut rien laisser fuir, et c'est
// précisément ce que le balayage cherche.
//
// La preuve de SENSIBILITÉ, elle, ne peut pas venir de ce fichier : c'est au test
// d'injecter le défaut et d'exiger que le balayage le voie (voir
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
  /** 2xx — la route a rendu une réponse, et cette réponse a été LUE sans sentinelle. */
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

/**
 * La table des valeurs d'URL : **gabarit → paramètre → valeur**.
 *
 * Le premier niveau est le gabarit EXACT du registre (`/v1/companies/:id`), pas un
 * préfixe ni un motif : une route montée deux fois sous deux préfixes (c'est le cas
 * des bancs `/essai/socle-casse/…`) est DEUX gabarits, et doit être semée deux
 * fois. C'est plus verbeux, et c'est le prix de la propriété qu'on achète : rien ne
 * déborde d'un gabarit à l'autre.
 */
export type CartographieDeParametres = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface RapportBalayage {
  readonly appels: readonly AppelBalaye[];
  /** LE résultat qui compte. Vide = aucune fuite observée par CE balayage. */
  readonly fuites: readonly AppelBalaye[];
  /**
   * Paramètres d'URL sans valeur réelle déclarée POUR LEUR GABARIT, sous la forme
   * `« <gabarit> → :<nom> »`. NON VIDE = le balayage a tapé dans le vide sur ces
   * routes ; son silence ne vaut rien pour elles.
   */
  readonly parametresNonCartographies: readonly string[];
  /**
   * Déclarations de la cartographie qui ne correspondent à AUCUN couple (gabarit,
   * paramètre) du registre : gabarit inconnu, ou paramètre absent de ce gabarit.
   * C'est la dérive silencieuse de la table — on croit semer, on ne sème rien.
   */
  readonly declarationsInutiles: readonly string[];
  /** Les routes que le registre déclare financières (`financier: true`). */
  readonly routesFinancieres: readonly string[];
  readonly couverture: {
    readonly exerces: number;
    readonly refuses: number;
    readonly nonExerces: number;
  };
  /**
   * Couples (méthode, gabarit) qu'AUCUN porteur n'a ni fait refuser ni fait servir,
   * et dont le silence n'est PAS structurellement explicable (voir
   * `natureDuSilence`). C'est le `non_exerce` qu'on refuse désormais de compter
   * sans le nommer. Repris dans `anomaliesDeCouverture`.
   */
  readonly gabaritsMuets: readonly string[];
  /**
   * Couples (méthode, gabarit) silencieux pour une raison STRUCTURELLE, donc
   * attendue : un `POST` auquel le balayage n'envoie qu'un corps vide, une méthode
   * non servie à ce chemin. Rapportés — pour qu'on sache ce que le balayage ne
   * traverse pas — mais PAS comptés comme anomalies.
   */
  readonly gabaritsNonTraversables: readonly string[];
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
   * Valeur RÉELLE et semée pour chaque couple (gabarit, paramètre) — voir
   * `CartographieDeParametres` et le mécanisme ① de l'en-tête. Un couple absent est
   * remonté dans `parametresNonCartographies` : le balayage appelle quand même,
   * mais il déclare que son résultat ne vaut rien pour cette route.
   *
   * Le nom a changé (`valeursDeParametre` → `cartographieDeParametres`) EXPRÈS : il
   * force chaque appelant à relire ce qu'il déclare au lieu de recompiler par
   * habitude.
   */
  readonly cartographieDeParametres: CartographieDeParametres;
  /** Les valeurs cherchées. Par défaut `VALEURS_SENTINELLES`. */
  readonly sentinelles?: readonly string[];
}

/** UUID de bouchage quand un couple (gabarit, paramètre) n'est pas cartographié. */
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
 * Une adresse DIFFÉRENTE par appel du balayage — et ce n'est pas une commodité.
 *
 * Le quota `/v1/auth/*` est de 10 req/min PAR IP (`domaines/auth/routes.ts`). Le
 * balayage appelle chaque route avec chaque porteur : trois routes `/v1/auth/*` ×
 * quatre porteurs = douze requêtes, donc DEUX 429 depuis une adresse unique — et le
 * 429 tombait précisément sur les porteurs de fin de liste, dont l'anonyme, c'est-à-
 * dire sur le REFUS que le balayage devait observer. Un balayage étranglé par le
 * quota est vert par étranglement : il ne prouve rien, et depuis ②bis il le dit
 * (429 = silence ANORMAL). Étaler les adresses est donc ce qui rend le nouveau
 * garde-fou honnête au lieu de faux positif permanent.
 *
 * `10.x.y.z` est une adresse privée, donc de confiance pour `trustProxy`
 * (`loopback|linklocal|uniquelocal`, app.ts) : Fastify la retient comme `request.ip`.
 * Même geste que `ipUnique()` côté test, pour la même raison.
 */
let compteurAdresses = 0;
function adresseDeBalayage(): string {
  compteurAdresses += 1;
  const c = compteurAdresses;
  return `10.${String(Math.floor(c / 62_500) % 250)}.${String(Math.floor(c / 250) % 250)}.${String(c % 250)}`;
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

/** Ce que vaut le silence d'un couple (gabarit, méthode). Voir `natureDuSilence`. */
export type NatureDuSilence = 'structurel' | 'anormal';

/**
 * LA FRONTIÈRE ENTRE « STRUCTURELLEMENT NON TRAVERSABLE » ET « ANORMALEMENT MUET ».
 *
 * Elle s'applique à un couple (gabarit, méthode) dont AUCUN appel n'a été ni refusé
 * (401/403) ni servi (2xx) : la route n'a donc rien prouvé, et il faut décider si
 * c'est de sa faute ou de celle du balayage. Écrire cette frontière plutôt que la
 * sous-entendre est le point : sans elle, on choisit entre un compteur muet
 * (l'ancien défaut) et un test rouge en permanence.
 *
 * EST STRUCTUREL — attendu, non anormal :
 *   · `405` : la méthode n'est pas servie à ce chemin. Le balayage n'a pas à
 *     l'expliquer, il n'a pas à s'en plaindre non plus ;
 *   · `415` : type de média refusé, même famille ;
 *   · `400` SUR UNE MÉTHODE À CORPS (`POST`/`PUT`/`PATCH`) : le balayage envoie un
 *     corps VIDE, faute de pouvoir fabriquer un corps valide pour une route
 *     quelconque. Une route à schéma le refuse légitimement, et son gestionnaire
 *     n'a jamais tourné — rien n'a donc pu fuir par là.
 *
 * EST ANORMAL — le balayage doit le dire :
 *   · `404` pour tous : la valeur cartographiée ne DÉSIGNE rien (ou le chemin est
 *     faux). C'est le cœur du défaut historique ; le silence est ici celui du
 *     balayage, pas celui du produit ;
 *   · `400` sur une méthode SANS corps (`GET`/`HEAD`/`DELETE`) : la valeur
 *     substituée est malformée — un paramètre mal semé, pas une route qui refuse ;
 *   · `429` : le balayage a été freiné par le quota. Son silence est celui du
 *     compteur ;
 *   · `5xx` : la route tombe pour tout le monde. Elle n'a rien prouvé non plus, et
 *     un 500 généralisé mérite d'être crié, pas absorbé.
 *
 * CE QUE LA FRONTIÈRE NE PRÉTEND PAS : un `400` sur `POST` peut aussi masquer une
 * route cassée. Le balayage assume ce faux négatif — il est le seul qui ne remplace
 * pas un contrôle par un préavis de rougeur permanente. Un `POST` dont la réponse
 * doit être lue se teste avec un corps valide, dans un test dédié, pas ici.
 *
 * @param statuts les statuts observés pour ce couple. Vide = aucun appel, donc
 * aucune preuve : ANORMAL.
 */
export function natureDuSilence(methode: string, statuts: readonly number[]): NatureDuSilence {
  if (statuts.length === 0) return 'anormal';
  const porteUnCorps = METHODES_AVEC_CORPS.has(methode.toUpperCase());
  const toutEstExplicable = statuts.every((statut) => {
    if (statut === 405 || statut === 415) return true;
    return statut === 400 && porteUnCorps;
  });
  return toutEstExplicable ? 'structurel' : 'anormal';
}

function substituer(
  gabarit: string,
  cartographie: CartographieDeParametres,
): { readonly url: string; readonly manquants: readonly string[] } {
  // Lecture PAR GABARIT, et RIEN D'AUTRE : il n'y a délibérément aucune ligne de
  // repli sur un autre gabarit ni sur une table globale. Un gabarit absent donne
  // `undefined`, donc `manquants`. C'est cette ABSENCE de ligne qui tient le
  // mécanisme ① — voir l'en-tête avant de « factoriser » quoi que ce soit ici.
  const pourCeGabarit = cartographie[gabarit];
  const manquants: string[] = [];
  const url = gabarit
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const nom = segment.slice(1).replace(/\(.*$/, '');
      const valeur = pourCeGabarit?.[nom];
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

/** Un couple (gabarit, méthode) et ce que le balayage y a observé. */
interface CouvertureDeCouple {
  readonly gabarit: string;
  readonly methode: string;
  readonly statuts: number[];
  /** Au moins un porteur a été refusé (401/403) ou servi (2xx). */
  prouve: boolean;
}

/**
 * LE BALAYAGE. Appelle chaque route du registre avec chaque porteur non
 * administrateur et rend un rapport — jamais une assertion.
 *
 * Les en-têtes sont inspectés au même titre que le corps : une réponse peut fuir
 * par un `x-total` ou un `location` tout aussi bien que par son JSON.
 *
 * ⚠ LIMITE CONNUE, ÉCRITE PLUTÔT QUE TUE : une réponse à `HEAD` n'a PAS de corps
 * par protocole. Un `HEAD` en 2xx est donc compté « exercé » alors que seuls ses
 * en-têtes ont été lus. C'est pourquoi la couverture est établie par couple
 * (gabarit, MÉTHODE) et non par gabarit : le `GET` d'une route doit se prouver
 * lui-même, le `HEAD` engendré par Fastify ne le fait pas à sa place.
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
  const couples = new Map<string, CouvertureDeCouple>();
  /** Les couples (gabarit, paramètre) réellement portés par le registre. */
  const couplesDuRegistre = new Set<string>();

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

    for (const nom of parametresDuGabarit(entree.url)) {
      couplesDuRegistre.add(`${entree.url} → :${nom}`);
    }

    const { url, manquants } = substituer(entree.url, options.cartographieDeParametres);
    for (const nom of manquants) manquantsGlobaux.add(`${entree.url} → :${nom}`);

    for (const methode of entree.methodes) {
      if (!estMethodeHttp(methode)) {
        nonBalayables.push(
          `${entree.url} : méthode « ${methode} » inconnue du balayage — route NON couverte.`,
        );
        continue;
      }

      const cle = `${methode} ${entree.url}`;
      let couple = couples.get(cle);
      if (couple === undefined) {
        couple = { gabarit: entree.url, methode, statuts: [], prouve: false };
        couples.set(cle, couple);
      }

      for (const [porteur, jeton] of Object.entries(options.porteurs)) {
        const reponse = await options.app.inject({
          method: methode,
          url,
          headers: {
            // Voir `adresseDeBalayage` : sans étalement, le quota `/v1/auth/*`
            // (10/min/IP) rendait muettes les dernières routes d'authentification.
            'x-forwarded-for': adresseDeBalayage(),
            ...(jeton === null ? {} : { authorization: `Bearer ${jeton}` }),
            ...(METHODES_AVEC_CORPS.has(methode) ? { 'content-type': 'application/json' } : {}),
          },
          ...(METHODES_AVEC_CORPS.has(methode) ? { payload: {} } : {}),
        });

        const matiere = `${reponse.body}\n${JSON.stringify(reponse.headers)}`;
        const trouvees = detecterSentinelles(matiere, sentinelles);
        const issue = classer(reponse.statusCode, trouvees);

        couple.statuts.push(reponse.statusCode);
        // Une `fuite` compte comme une traversée : la route a bel et bien rendu
        // quelque chose, et ce quelque chose est le pire des cas. La dénoncer comme
        // « muette » par-dessus noierait le seul message qui compte.
        if (issue !== 'non_exerce') couple.prouve = true;

        appels.push({
          porteur,
          methode,
          gabarit: entree.url,
          url,
          statut: reponse.statusCode,
          issue,
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

  // --- ①bis : les déclarations qui ne sèment plus rien ------------------------
  const declarationsInutiles: string[] = [];
  for (const [gabarit, parametres] of Object.entries(options.cartographieDeParametres)) {
    for (const nom of Object.keys(parametres)) {
      const couple = `${gabarit} → :${nom}`;
      if (!couplesDuRegistre.has(couple)) declarationsInutiles.push(couple);
    }
  }
  declarationsInutiles.sort((a, b) => a.localeCompare(b, 'fr'));

  // --- ②bis : le silence, nommé et qualifié -----------------------------------
  const gabaritsMuets: string[] = [];
  const gabaritsNonTraversables: string[] = [];
  for (const couple of couples.values()) {
    if (couple.prouve) continue;
    const observes = [...new Set(couple.statuts)].sort((a, b) => a - b).map(String);
    const description = `${couple.methode} ${couple.gabarit} (statuts observés : ${observes.join(', ') || 'aucun appel'})`;
    if (natureDuSilence(couple.methode, couple.statuts) === 'structurel') {
      gabaritsNonTraversables.push(description);
    } else {
      gabaritsMuets.push(description);
    }
  }
  gabaritsMuets.sort((a, b) => a.localeCompare(b, 'fr'));
  gabaritsNonTraversables.sort((a, b) => a.localeCompare(b, 'fr'));

  const parametresNonCartographies = [...manquantsGlobaux].sort((a, b) => a.localeCompare(b, 'fr'));

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
      'Aucun appel n’a rendu 2xx : aucune réponse n’a réellement été lue. ' +
        'Un balayage qui ne traverse rien est vert par vacuité.',
    );
  }
  for (const manquant of parametresNonCartographies) {
    anomalies.push(
      `Paramètre NON cartographié : ${manquant} — aucune valeur n’est déclarée pour CE ` +
        'gabarit, et la valeur d’un autre gabarit ne sert JAMAIS de repli (mécanisme ①). ' +
        'Le balayage a tapé dans le vide sur cette route.',
    );
  }
  for (const inutile of declarationsInutiles) {
    anomalies.push(
      `Déclaration INUTILE : ${inutile} — la cartographie sème une route qui n’existe pas ` +
        '(gabarit renommé, supprimé, ou paramètre absent). On croit couvrir, on ne couvre rien.',
    );
  }
  for (const muet of gabaritsMuets) {
    anomalies.push(
      `Route ANORMALEMENT MUETTE : ${muet} — aucun porteur n’a été refusé (401/403) ni servi ` +
        '(2xx). Cette route n’a RIEN prouvé : le silence du balayage sur elle ne vaut rien.',
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
    parametresNonCartographies,
    declarationsInutiles,
    routesFinancieres,
    couverture,
    gabaritsMuets,
    gabaritsNonTraversables,
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
    // Rapportés SANS être une anomalie : savoir ce que le balayage ne traverse pas
    // fait partie du résultat, sinon on relit le compteur en croyant relire une preuve.
    ...rapport.gabaritsNonTraversables.map(
      (structurel) => `Silence STRUCTUREL (attendu) : ${structurel}`,
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
 * Un balayage vert sur un dépôt sain ne prouve pas qu'il verrait le défaut. Chaque
 * mécanisme se prouve en SEMANT ce qu'il doit voir. Trois épreuves, trois défauts
 * différents — et aucune n'est facultative :
 *
 *  ① LA FUITE (le mécanisme historique) :
 *   1. enregistrer, DANS LE FICHIER DE TESTS UNIQUEMENT, une route d'épreuve
 *      ouverte à un rôle non administrateur, dont le gestionnaire lit la ligne
 *      financière PAR UNE REQUÊTE SQL DIRECTE (pas par le dépôt : le dépôt ne
 *      compile pas sans la marque, ce qui est précisément la ceinture 2) ;
 *   2. lancer le balayage : il DOIT rendre au moins une `fuite` sur cette route ;
 *   3. retirer la route et relancer : `fuites` DOIT être vide.
 *   Le point 3 sans le point 2 est un test qui se félicite. Le point 2 est le test.
 *
 *  ② LA CARTOGRAPHIE QUI NE DÉBORDE PAS (mécanisme ①) — épreuve BON MARCHÉ, à ne
 *  pas sauter pour autant : relancer le balayage avec une cartographie qui déclare
 *  `:id` POUR UN SEUL gabarit, et exiger que `parametresNonCartographies` NOMME les
 *  autres gabarits porteurs de `:id`. Si la liste revient vide, le repli global est
 *  revenu par une porte dérobée et le mécanisme ① est mort sans bruit — c'est très
 *  exactement ce qui s'était produit jusqu'au 2026-08-31.
 *
 *  ③ LE SILENCE QUALIFIÉ (mécanisme ②bis) : `natureDuSilence` est exportée pour
 *  être éprouvée DIRECTEMENT, sans route — comme `detecterSentinelles`. Le test doit
 *  au minimum exiger `('GET', [404])` → `anormal` (le défaut historique),
 *  `('GET', [400])` → `anormal` (paramètre malformé), `('GET', [429])` → `anormal`
 *  (balayage étranglé) et `('POST', [400])` → `structurel` (corps vide, faux positif
 *  à éviter). Éprouver la frontière PAR SES DEUX CÔTÉS est le point : un
 *  classificateur qui dirait « anormal » à tout serait rouge en permanence, donc
 *  débranché sous quinze jours.
 */
