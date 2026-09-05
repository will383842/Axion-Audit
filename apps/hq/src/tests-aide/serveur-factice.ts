// =============================================================================
// SERVEUR HTTP FACTICE — un `fetch` remplacé dans le test. Lot L7a, écrit par A36.
//
// ── POURQUOI UN `fetch` REMPLACÉ, ET NI `msw` NI LE `webServer` DE PLAYWRIGHT ──
// `msw` n'est pas dans la liste épinglée (11 §1) : l'ajouter est une escalade
// (CLAUDE.md §3-1), et un outil de test n'en vaut pas une. Le `webServer` de
// Playwright, lui, démarre l'API réelle — donc Postgres, Redis, MinIO — pour des
// tests d'INTERFACE qui doivent rester légers (« un seul vitest lourd à la fois »).
// Remplacer `globalThis.fetch` coûte zéro dépendance, rend chaque appel INSPECTABLE
// (méthode, URL, en-têtes, `credentials`, corps) et permet de suspendre une
// réponse à volonté pour photographier l'état « chargement » (§33.2).
//
// ── CE QUE CE SERVEUR GARANTIT, ET QUI FAIT SA VALEUR ────────────────────────
//  1. Il ne rend QUE des corps conformes aux schémas Zod de `packages/shared` :
//     chaque réponse repasse par `pageSchema(missionResponseSchema)`,
//     `missionResponseSchema`, `companyResponseSchema`, `apiErrorSchema`. Une
//     forme inventée dans une fixture fait échouer le test qui la sert.
//  2. Il TRACE tout (`appels`) : c'est la « trace réseau » du mandat A36 — un
//     masquage d'affichage n'est pas une protection ; si la route a répondu, la
//     donnée a fui.
//  3. Il applique le RBAC du serveur réel tel que L2/L3 l'ont livré : la console
//     est ADMIN SEUL (03 §34.1) ; un consultant reçoit `403 FORBIDDEN` sur
//     `/v1/missions` (route `CONFIG_ADMIN`), un anonyme `401 UNAUTHENTICATED`.
//  4. Toute URL qui NOMME une ressource financière est classée `appelsFinanciers`
//     et refusée : la console de L7a n'a AUCUNE raison de l'appeler (invariant 3).
//
// Ce module n'affirme rien : il rapporte. Les `expect` vivent dans les tests.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E22, E43.
// =============================================================================
import { vi } from 'vitest';
import {
  apiErrorSchema,
  companyResponseSchema,
  ERROR_CODES,
  HTTP_STATUS_BY_ERROR_CODE,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  missionResponseSchema,
  pageSchema,
  paginationQuerySchema,
  type ApiError,
  type CompanyResponse,
  type ErrorCode,
  type MissionResponse,
} from '@axion/shared';
import { ENTREPRISES, ID, MISSIONS_CANONIQUES } from './fixtures-console.js';

/** Un appel HTTP tel que la console l'a réellement émis. */
export interface AppelReseau {
  readonly methode: string;
  readonly url: URL;
  readonly enTetes: Headers;
  readonly credentials: RequestCredentials;
  readonly corps: string;
}

export type RoleFactice = 'admin' | 'consultant' | 'anonyme';

export interface ScenarioServeur {
  /** Qui tient la session au démarrage. `anonyme` = aucun cookie de session. */
  readonly role?: RoleFactice;
  readonly missions?: readonly MissionResponse[];
  readonly entreprises?: readonly CompanyResponse[];
  /** Taille de page servie par `GET /v1/missions` (défaut : `limit` demandé). */
  readonly taillePage?: number;
  /**
   * `suspendue` : aucune réponse ne part avant `liberer()` — c'est l'état
   * « chargement ». `immediate` (défaut) : réponse au tour de boucle suivant.
   */
  readonly latence?: 'immediate' | 'suspendue';
  /**
   * `serveur` : tout rend `500 INTERNAL_ERROR`. `reseau` : `fetch` rejette avec un
   * `TypeError` (câble débranché) — l'état « hors ligne » de §33.2.
   */
  readonly panne?: 'aucune' | 'serveur' | 'reseau';
}

export interface ServeurFactice {
  /** La trace réseau intégrale, dans l'ordre d'émission. */
  readonly appels: readonly AppelReseau[];
  /** Les appels dont l'URL nomme une ressource financière. DOIT rester vide. */
  readonly appelsFinanciers: readonly AppelReseau[];
  /** Les appels qu'aucune route connue ne sert. DOIT rester vide. */
  readonly appelsInattendus: readonly AppelReseau[];
  /** Le rôle courant — change après un `login` réussi ou un `logout`. */
  role: RoleFactice;
  /**
   * Libère les réponses EN ATTENTE (`latence: 'suspendue'`). Les requêtes qui
   * partiront ensuite sont suspendues à leur tour : un écran qui charge en deux
   * temps (session, puis mission, puis entreprise) montre CHAQUE phase, et le test
   * les photographie une à une. `enAttente` dit combien en sont là.
   */
  liberer(): void;
  readonly enAttente: number;
  /** Rend `fetch` à son état d'origine. À appeler en `afterEach`. */
  restaurer(): void;
}

/** Les identités factices acceptées par `POST /v1/auth/login`. Secrets FACTICES (11 §2). */
export const IDENTITES_FACTICES = {
  admin: { email: 'admin.fictif@exemple.test', password: 'mot-de-passe-factice-admin' },
  consultant: {
    email: 'consultant.fictif@exemple.test',
    password: 'mot-de-passe-factice-consultant',
  },
} as const;

/** Ce qu'une URL ne doit JAMAIS nommer depuis la console de L7a. */
const MOTIF_URL_FINANCIERE = /scoping|financ|devis|tjm|daily[-_]?rates|montant/i;

function erreur(code: ErrorCode, message: string): { statut: number; corps: ApiError } {
  return {
    statut: HTTP_STATUS_BY_ERROR_CODE[code],
    corps: apiErrorSchema.parse({ error: { code, message } }),
  };
}

function reponseJson(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Le chemin SANS le préfixe `/api` que Caddy pose devant l'API (11 §2 : même domaine). */
function cheminApi(url: URL): string {
  return url.pathname.replace(/^\/api(?=\/)/, '');
}

function encoderCurseur(index: number): string {
  return `curseur-factice-${String(index)}`;
}

function decoderCurseur(curseur: string): number | null {
  const correspondance = /^curseur-factice-(\d+)$/.exec(curseur);
  if (correspondance === null) return null;
  return Number(correspondance[1]);
}

export function installerServeurFactice(scenario: ScenarioServeur = {}): ServeurFactice {
  const missions = scenario.missions ?? MISSIONS_CANONIQUES;
  const entreprises = scenario.entreprises ?? ENTREPRISES;
  const panne = scenario.panne ?? 'aucune';
  const appels: AppelReseau[] = [];
  const appelsFinanciers: AppelReseau[] = [];
  const appelsInattendus: AppelReseau[] = [];
  const suspendues: (() => void)[] = [];

  const serveur: ServeurFactice = {
    appels,
    appelsFinanciers,
    appelsInattendus,
    role: scenario.role ?? 'admin',
    liberer() {
      for (const reprendre of suspendues.splice(0)) reprendre();
    },
    get enAttente() {
      return suspendues.length;
    },
    restaurer() {
      vi.unstubAllGlobals();
    },
  };

  function attendre(): Promise<void> {
    if (scenario.latence !== 'suspendue') return Promise.resolve();
    return new Promise((resoudre) => {
      suspendues.push(resoudre);
    });
  }

  function router(appel: AppelReseau): { statut: number; corps: unknown } {
    const chemin = cheminApi(appel.url);
    const { methode } = appel;

    // ── Authentification : ouverte à tous, c'est la porte d'entrée ────────────
    if (chemin === '/v1/auth/login' && methode === 'POST') {
      const lecture = loginRequestSchema.safeParse(
        appel.corps === '' ? {} : (JSON.parse(appel.corps) as unknown),
      );
      if (!lecture.success) return erreur('VALIDATION_FAILED', 'Identifiants incomplets.');
      const { email, password } = lecture.data;
      const role = (Object.keys(IDENTITES_FACTICES) as (keyof typeof IDENTITES_FACTICES)[]).find(
        (candidat) =>
          IDENTITES_FACTICES[candidat].email === email &&
          IDENTITES_FACTICES[candidat].password === password,
      );
      if (role === undefined) {
        return erreur('INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.');
      }
      serveur.role = role;
      return {
        statut: 200,
        corps: loginResponseSchema.parse({
          accessToken: 'jeton-acces-factice-ne-doit-pas-etre-stocke',
          refreshToken: 'jeton-rafraichissement-factice-ne-doit-pas-etre-stocke',
          tokenType: 'Bearer',
          accessExpiresAt: '2026-09-02T09:15:00.000Z',
          refreshExpiresAt: '2026-10-02T09:00:00.000Z',
          userId: role === 'admin' ? ID.admin : ID.consultant,
        }),
      };
    }
    if (chemin === '/v1/auth/logout' && methode === 'POST') {
      serveur.role = 'anonyme';
      return { statut: 200, corps: logoutResponseSchema.parse({ loggedOut: true }) };
    }

    // ── Garde d'identité, puis garde de rôle — comme le socle réel (L2) ───────
    if (serveur.role === 'anonyme') {
      return erreur('UNAUTHENTICATED', 'Connectez-vous pour accéder à la console.');
    }
    if (panne === 'serveur') {
      return erreur('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    if (serveur.role !== 'admin') {
      return erreur('FORBIDDEN', 'Cet espace est réservé aux administrateurs.');
    }

    // ── Missions ───────────────────────────────────────────────────────────────
    if (chemin === '/v1/missions' && methode === 'GET') {
      const requete = paginationQuerySchema.safeParse(
        Object.fromEntries(appel.url.searchParams.entries()),
      );
      if (!requete.success) return erreur('VALIDATION_FAILED', 'Pagination invalide.');
      const depart = requete.data.after === undefined ? 0 : decoderCurseur(requete.data.after);
      if (depart === null) return erreur('INVALID_CURSOR', 'Curseur inconnu.');
      const taille = scenario.taillePage ?? requete.data.limit;
      const items = missions.slice(depart, depart + taille);
      const fin = depart + items.length;
      return {
        statut: 200,
        corps: pageSchema(missionResponseSchema).parse({
          items,
          nextCursor: fin < missions.length ? encoderCurseur(fin) : null,
        }),
      };
    }
    const detailMission = /^\/v1\/missions\/([^/]+)$/.exec(chemin);
    if (detailMission !== null && methode === 'GET') {
      const mission = missions.find((candidate) => candidate.id === detailMission[1]);
      if (mission === undefined) return erreur('NOT_FOUND', 'Mission introuvable.');
      return { statut: 200, corps: missionResponseSchema.parse(mission) };
    }

    // ── Entreprises ────────────────────────────────────────────────────────────
    const detailEntreprise = /^\/v1\/companies\/([^/]+)$/.exec(chemin);
    if (detailEntreprise !== null && methode === 'GET') {
      const entreprise = entreprises.find((candidate) => candidate.id === detailEntreprise[1]);
      if (entreprise === undefined) return erreur('NOT_FOUND', 'Entreprise introuvable.');
      return { statut: 200, corps: companyResponseSchema.parse(entreprise) };
    }

    appelsInattendus.push(appel);
    return erreur('NOT_FOUND', 'Route inconnue du serveur factice.');
  }

  const fauxFetch = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // `Request` (undici) exige une URL ABSOLUE ; la console, elle, parle en relatif
    // (`/api/v1/…`, même domaine — 11 §2). On résout comme le navigateur le ferait.
    const cible =
      typeof entree === 'string'
        ? new URL(entree, window.location.href).toString()
        : entree instanceof URL
          ? entree.toString()
          : entree;
    const requete = new Request(cible, init);
    const appel: AppelReseau = {
      methode: requete.method.toUpperCase(),
      url: new URL(requete.url, 'http://localhost'),
      enTetes: requete.headers,
      credentials: requete.credentials,
      corps: await requete.text(),
    };
    appels.push(appel);

    await attendre();

    if (MOTIF_URL_FINANCIERE.test(appel.url.pathname + appel.url.search)) {
      appelsFinanciers.push(appel);
      const refus = erreur(ERROR_CODES.FORBIDDEN, 'Ressource financière : administrateur seul.');
      return reponseJson(refus.statut, refus.corps);
    }
    if (panne === 'reseau') {
      throw new TypeError('Failed to fetch');
    }
    const { statut, corps } = router(appel);
    return reponseJson(statut, corps);
  };

  vi.stubGlobal('fetch', fauxFetch);
  return serveur;
}
