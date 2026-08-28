// =============================================================================
// SOCLE D'AUTORISATION — lot L2, tâche T1.
//
// Invariant 3 : « RBAC serveur SYSTÉMATIQUE ». « Systématique » est un mot qui ne
// s'implémente pas avec de la discipline : il s'implémente avec un refus de démarrer.
//
// ── OÙ VIT LA DÉCISION (note de conception L2 §2.1) ───────────────────────────
// Trois formes ont été écartées :
//   · un décorateur par route est OPT-IN : il échoue par OMISSION, silencieusement ;
//   · une table centrale de chemins DUPLIQUE l'arbre de routage, donc dérive ;
//   · une fonction appelée dans chaque gestionnaire est INVISIBLE en revue.
// Retenu : la politique se déclare À CÔTÉ de la route (`config.acces`), mais sa
// PRÉSENCE est vérifiée CENTRALEMENT — au DÉMARRAGE, pas à la requête.
//
// ── CE QUE ÇA REND IMPOSSIBLE ─────────────────────────────────────────────────
// Une route ajoutée demain sans politique ne « passe » pas discrètement :
// **elle empêche l'API de booter**, avec son nom dans le message. La suite
// d'intégration, qui construit l'app, vire au rouge le jour même. C'est la
// différence entre *improbable* et *impossible*.
//
// ── NÉCESSAIRE, JAMAIS SUFFISANT ──────────────────────────────────────────────
// La politique de route dit QUI ENTRE, pas CE QUE LE SQL RAMÈNE. L'isolation
// « un consultant ne voit pas les missions d'autrui » est portée par le DÉPÔT
// (jointure obligatoire sur `mission_users`), pas par ce crochet. Deux garde-fous,
// deux natures ; confondre les deux, c'est croire qu'une porte fermée trie le
// courrier.
// Traçabilité : E5 (RBAC serveur systématique), E27 (étanchéité financière).
// =============================================================================
import type {
  FastifyInstance,
  FastifyRequest,
  RouteOptions,
  onRequestAsyncHookHandler,
} from 'fastify';
import { AppError } from '@axion/shared';
import type { RoleUtilisateur } from '../db/schema.js';
import { decorerRequete, identification, MESSAGE_AUTH_REQUISE } from './identite.js';
import { lireUtilisateurAuthentifie } from './depot.js';
import { creerContexteAdmin } from './contexte.js';
import { enregistrerJetons } from './jetons.js';

// -----------------------------------------------------------------------------
// LA POLITIQUE — une UNION DISCRIMINÉE, pas un sac d'options facultatives
// -----------------------------------------------------------------------------
// Une forme unique `{ type, roles?, parametreMission? }` autorise les combinaisons
// absurdes : `type: 'roles'` sans `roles`, `type: 'mission'` sans paramètre. L'union
// les rend inexprimables — le compilateur refuse au lieu que le crochet devine.
// -----------------------------------------------------------------------------

/** Aucune identité requise. Réservé à une liste COURTE et instantanée en test. */
export interface AccesPublic {
  readonly type: 'public';
}

/** Un compte actif suffit. */
export interface AccesAuthentifie {
  readonly type: 'authentifie';
}

/** Un compte actif dont le rôle GLOBAL (`users.role`) figure dans la liste. */
export interface AccesRoles {
  readonly type: 'roles';
  readonly roles: readonly RoleUtilisateur[];
  /**
   * Marque la route comme financière (invariant 3 : `scoping_financials` = routes
   * admin EXCLUSIVEMENT). Elle fait poser `request.contexteAdmin`, sans lequel le
   * dépôt financier NE COMPILE PAS chez son appelant (contexte.ts).
   */
  readonly financier?: true;
}

/**
 * Route portant un identifiant de mission. Le crochet vérifie l'identité et le
 * compte ; la restriction aux missions de l'utilisateur est faite PAR LE DÉPÔT.
 * `parametreMission` nomme le paramètre d'URL — sa présence dans l'URL est vérifiée
 * AU DÉMARRAGE (une faute de frappe désactiverait silencieusement le cadrage).
 */
export interface AccesMission {
  readonly type: 'mission';
  readonly parametreMission: string;
}

/**
 * Écriture de sync : réservée au PROPRIÉTAIRE de la session (invariant 3, 05 §9.9).
 * Même règle que ci-dessus : le crochet garantit l'identité, la propriété est
 * prouvée sur la ligne par le service de sync (lot L6a).
 */
export interface AccesProprietaireSession {
  readonly type: 'proprietaire_session';
  readonly parametreSession: string;
}

export type PolitiqueAcces =
  AccesPublic | AccesAuthentifie | AccesRoles | AccesMission | AccesProprietaireSession;

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * OPTIONNEL DANS LE TYPE, OBLIGATOIRE À L'EXÉCUTION — et c'est délibéré.
     * La rendre obligatoire ici n'apporterait rien : une route déclarée SANS aucun
     * `config` compilerait quand même. La totalité ne peut donc venir que du
     * crochet `onRoute` ci-dessous — et un type qui promet ce qu'il ne tient pas
     * est pire qu'un type honnête.
     */
    acces?: PolitiqueAcces;
  }

  interface FastifyInstance {
    /**
     * Toutes les routes de cette instance avec leur politique, telles
     * qu'ENREGISTRÉES À L'EXÉCUTION.
     *
     * C'est le socle des deux tests qui comptent (note L2 §2.2-4 et §5) : le
     * balayage sentinelle financier et la matrice rôle × route n'énumèrent pas les
     * routes auxquelles on a pensé, ils énumèrent CELLES QUI EXISTENT. Une route
     * ajoutée demain y entre d'elle-même.
     */
    registreAcces: readonly EntreeRegistreAcces[];
  }
}

/** Une ligne du registre des routes. */
export interface EntreeRegistreAcces {
  readonly methodes: readonly string[];
  readonly url: string;
  readonly acces: PolitiqueAcces;
}

// =============================================================================
// CROCHET ③ — AUTORISATION
// =============================================================================

/**
 * Lève si la requête n'a pas le droit d'atteindre le gestionnaire.
 *
 * C'est le SEUL crochet qui refuse. Il s'exécute après le quota (voir
 * `enregistrerSocleAutorisation`), ce qui garantit qu'un flot de jetons invalides
 * reste borné par le compteur au lieu de le contourner.
 */
const autorisation: onRequestAsyncHookHandler = async function autorisation(
  requete: FastifyRequest,
): Promise<void> {
  const acces = requete.routeOptions.config.acces;

  // Ceinture : `onRoute` a déjà rendu ce cas impossible au démarrage. S'il survenait
  // malgré tout, on REFUSE — jamais on ne laisse passer par défaut.
  if (acces === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }

  if (acces.type === 'public') return;

  // --- L'échec mémorisé par ① est levé ICI, et seulement si la route l'exige ---
  if (requete.echecIdentification !== null) throw requete.echecIdentification;
  if (requete.identite === null) {
    throw new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
  }

  // --- Révocation instantanée (06 §10.1) : les droits viennent de la BASE ---
  const utilisateur = await lireUtilisateurAuthentifie(requete.identite.utilisateurId);
  if (utilisateur?.estActif !== true) {
    // Compte inconnu et compte désactivé rendent la MÊME chose : dire lequel
    // transformerait la route en oracle d'existence de comptes (06 §10.2).
    throw new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
  }
  requete.utilisateur = utilisateur;

  switch (acces.type) {
    case 'authentifie':
      return;

    case 'roles': {
      if (!acces.roles.includes(utilisateur.role)) {
        throw new AppError(
          'FORBIDDEN',
          "Vous n'avez pas les droits nécessaires pour cette action.",
        );
      }
      if (acces.financier === true) {
        // La marque n'est posée que pour un rôle `admin` RELU EN BASE — et
        // `creerContexteAdmin` revérifie le rôle plutôt que de faire confiance à la
        // liste déclarée par la route. Deux clés pour un même coffre.
        requete.contexteAdmin = creerContexteAdmin(utilisateur.id, utilisateur.role);
      }
      return;
    }

    case 'mission':
    case 'proprietaire_session':
      // ATTENTION — CE QUI EST VÉRIFIÉ ICI, ET CE QUI NE L'EST PAS.
      // Vérifié : identité, compte actif. Rien d'autre, et c'est CORRECT :
      // « un consultant ne voit pas les missions d'autrui » et « une écriture de
      // sync appartient au propriétaire de la session » (05 §9.9) sont des
      // propriétés de LIGNES, pas d'URL. Elles sont portées par le dépôt (jointure
      // obligatoire sur `mission_users`) et par le service de sync.
      //
      // Ces deux variantes ne sont donc PAS équivalentes à `authentifie` par
      // paresse : elles portent une INTENTION que la revue croisée et la matrice
      // rôle × route lisent, et que le démarrage vérifie (le paramètre d'URL doit
      // exister). Une route qui les déclare SANS que son dépôt filtre est un défaut
      // de revue — pas un trou de ce crochet.
      return;
  }
};

// =============================================================================
// CROCHETS `onRoute` — LA TOTALITÉ, VÉRIFIÉE AU DÉMARRAGE
// =============================================================================

/** Ce que rend `FastifyInstance.printRoutes()` quand aucune route n'est déclarée. */
const ARBRE_DE_ROUTES_VIDE = '(empty tree)';

interface EntreeInterne extends EntreeRegistreAcces {
  /** A reçu le crochet ③. Contrôlé à `onReady` — voir plus bas. */
  protegee: boolean;
}

function decrireRoute(options: RouteOptions): string {
  const methodes = Array.isArray(options.method) ? options.method.join(',') : options.method;
  return `${methodes} ${options.url}`;
}

/**
 * Ajoute un crochet `onRequest` DE ROUTE en respectant ce qui s'y trouve déjà.
 * `@fastify/rate-limit` utilise exactement ce mécanisme : notre crochet vient donc
 * APRÈS le sien dans le tableau, ce qui est précisément l'ordre voulu.
 */
function ajouterCrochetOnRequest(options: RouteOptions, crochet: onRequestAsyncHookHandler): void {
  const existant = options.onRequest;
  if (Array.isArray(existant)) {
    options.onRequest = [...existant, crochet];
  } else if (typeof existant === 'function') {
    options.onRequest = [existant, crochet];
  } else {
    options.onRequest = [crochet];
  }
}

/** Vérifie qu'un paramètre nommé par la politique existe VRAIMENT dans l'URL. */
function exigerParametre(options: RouteOptions, parametre: string): void {
  const segments = options.url.split('/');
  const present = segments.some((s) => s === `:${parametre}` || s.startsWith(`:${parametre}(`));
  if (!present) {
    throw new Error(
      `Route « ${decrireRoute(options)} » : la politique d'accès nomme le paramètre ` +
        `« :${parametre} », absent de l'URL. Une faute de frappe ici désactiverait ` +
        `silencieusement le cadrage par mission ou la règle de propriété (05 §9.9) : ` +
        `l'API refuse de démarrer plutôt que de servir une route mal cadrée.`,
    );
  }
}

/**
 * Pose, DANS L'ORDRE, tout le socle d'autorisation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE QUOTA EST PASSÉ EN ARGUMENT — ce n'est pas une coquetterie
 * ═══════════════════════════════════════════════════════════════════════════════
 * L'ordre imposé est ① identification → ② quota → ③ autorisation (note L2 §2.1),
 * et il n'est PAS obtenable avec trois `app.addHook('onRequest', …)` :
 *
 *   · ① est un crochet d'INSTANCE, donc il précède tout crochet de route ;
 *   · ② n'est PAS un crochet d'instance : `@fastify/rate-limit` s'installe via son
 *     propre `onRoute`, qui pousse son gestionnaire dans le `onRequest` DE CHAQUE
 *     ROUTE. Or Fastify exécute TOUS les crochets d'instance AVANT ceux de route ;
 *   · ③ posé en crochet d'instance passerait donc AVANT ② — exactement l'inversion
 *     que la note interdit : les jetons invalides cesseraient d'être comptés.
 *
 * ③ est donc lui aussi un crochet de ROUTE, injecté par un `onRoute` enregistré
 * APRÈS celui du quota. Faire de la pose du quota un ARGUMENT de cette fonction
 * rend cet ordre impossible à casser par un déplacement de ligne dans `app.ts` :
 * il est dans la SIGNATURE, pas dans une convention.
 *
 * Le second effet est de fermer la fenêtre où une route échapperait au socle : entre
 * les deux `onRoute`, il ne se passe rien d'autre que l'enregistrement du plugin de
 * quota, qui ne déclare aucune route. Et si cela devenait faux, le contrôle
 * `onReady` ci-dessous ferait échouer le démarrage.
 */
export async function enregistrerSocleAutorisation(
  app: FastifyInstance,
  poserLeQuota: (app: FastifyInstance) => Promise<void>,
): Promise<void> {
  // --- Fenêtre AVANT le socle : fermée ici, pas laissée à la vigilance ---------
  // Un `onRoute` ne voit QUE les routes déclarées après lui. Une route enregistrée
  // avant cet appel n'aurait donc ni politique exigée, ni crochet d'autorisation —
  // un trou d'autant plus dangereux qu'il serait TOTALEMENT SILENCIEUX. Fastify
  // n'expose pas la liste de ses routes, mais `printRoutes()` rend exactement
  // « (empty tree) » tant qu'aucune n'est déclarée : cela suffit à transformer la
  // consigne « n'enregistrez rien avant le socle » en refus de démarrer.
  if (app.printRoutes() !== ARBRE_DE_ROUTES_VIDE) {
    throw new Error(
      `Des routes ont été enregistrées AVANT le socle d'autorisation : elles ` +
        `échapperaient à la fois à la vérification de totalité et au crochet ` +
        `d'autorisation. Déplacez \`enregistrerSocleAutorisation\` avant toute route.\n` +
        app.printRoutes(),
    );
  }

  const registre: EntreeInterne[] = [];
  const parOptions = new Map<RouteOptions, EntreeInterne>();

  app.decorate('registreAcces', registre);

  // --- Jetons + décorations, avant tout crochet qui les lit -------------------
  await enregistrerJetons(app);
  decorerRequete(app);

  // --- ① identification : crochet d'INSTANCE, il précède tout -----------------
  app.addHook('onRequest', identification);

  // --- Totalité : ce crochet-ci refuse le DÉMARRAGE, pas la requête -----------
  app.addHook('onRoute', (options: RouteOptions) => {
    const acces = options.config?.acces;
    if (acces === undefined) {
      throw new Error(
        `Route « ${decrireRoute(options)} » enregistrée SANS politique d'accès ` +
          `(\`config.acces\`). Invariant 3 : le RBAC serveur est SYSTÉMATIQUE — une ` +
          `route sans politique n'est pas une route ouverte, c'est un défaut de ` +
          `conception, et l'API refuse de démarrer tant qu'il n'est pas corrigé. ` +
          `Déclarez par exemple : config: { acces: { type: 'authentifie' } }.`,
      );
    }
    if (acces.type === 'mission') exigerParametre(options, acces.parametreMission);
    if (acces.type === 'proprietaire_session') exigerParametre(options, acces.parametreSession);

    const entree: EntreeInterne = {
      methodes: Array.isArray(options.method) ? [...options.method] : [options.method],
      url: options.url,
      acces,
      protegee: false,
    };
    registre.push(entree);
    parOptions.set(options, entree);
  });

  // --- ② quota : ses crochets de route sont posés par son propre `onRoute` ----
  await poserLeQuota(app);

  // --- ③ autorisation : crochet de ROUTE, donc APRÈS celui du quota -----------
  app.addHook('onRoute', (options: RouteOptions) => {
    ajouterCrochetOnRequest(options, autorisation);
    const entree = parOptions.get(options);
    if (entree !== undefined) entree.protegee = true;
  });

  // --- Cohérence des deux `onRoute` : preuve, pas confiance -------------------
  app.addHook('onReady', (fait) => {
    const orphelines = registre.filter((e) => !e.protegee);
    if (orphelines.length > 0) {
      fait(
        new Error(
          `Routes enregistrées ENTRE les deux crochets du socle d'autorisation, donc ` +
            `sans crochet d'autorisation : ${orphelines.map((e) => `${e.methodes.join(',')} ${e.url}`).join(' · ')}. ` +
            `Aucune route ne doit être déclarée pendant l'installation du socle.`,
        ),
      );
      return;
    }
    fait();
  });
}
