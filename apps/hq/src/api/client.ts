// =============================================================================
// CLIENT HTTP TYPÉ DE LA CONSOLE — lot L7a.
//
// Un seul chemin pour parler à l'API, et il est étroit par construction :
//   · l'URL est TOUJOURS `/api/v1/…` sur la même origine (11 §2 : « pas de
//     CORS », Caddy sert `/hq` et `/api` sous le même domaine) ;
//   · toute réponse 2xx est passée au schéma Zod de la route AVANT d'atteindre
//     un écran (11 §3 : « le front importe LES MÊMES schémas ») — une réponse
//     que le contrat ne connaît pas est une ERREUR DE CONTRAT, pas une donnée ;
//   · toute réponse non-2xx est lue dans l'enveloppe unique
//     `{ error: { code, message, details? } }` et rendue comme `ErreurApi`, dont
//     le `message` est du français prêt à afficher (invariant 5) ;
//   · une écriture (POST) porte son corps validé par le schéma d'ENTRÉE de la
//     route, et l'en-tête anti-CSRF si le serveur a déposé un jeton (`auth.ts`).
//
// `fetch` est INJECTÉ, et résolu À L'APPEL (`(e, i) => fetch(e, i)` dans
// `App.tsx`) : c'est ce qui rend la console testable AVANT que l'API de L3 soit
// sur `main` — les tests de A36 servent un serveur factice qui répond À TRAVERS
// les mêmes schémas, jamais un mock qui invente une forme.
//
// Traçabilité : E43 (exécutabilité autopilote — conventions d'API), E32
// (fuseaux, devises, interface française).
// =============================================================================
import type { z } from 'zod';
import { apiErrorSchema, ERROR_CODES, type ErrorCode } from './contrats.js';
import { enTetesAuth, lireJetonAntiCsrf } from './auth.js';

/** Préfixe des routes : Caddy retire `/api`, l'API voit `/v1/…`. */
export const BASE_API = '/api/v1';

/** Une réponse d'erreur de l'API, lue dans l'enveloppe 11 §3. */
export class ErreurApi extends Error {
  readonly code: ErrorCode;
  readonly statut: number;
  readonly details: readonly { path: string; message: string }[];

  constructor(
    code: ErrorCode,
    message: string,
    statut: number,
    details: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ErreurApi';
    this.code = code;
    this.statut = statut;
    this.details = details;
  }

  /** 401 sous toutes ses formes : la console doit (re)demander une session. */
  get nonAuthentifie(): boolean {
    return (
      this.code === ERROR_CODES.UNAUTHENTICATED ||
      this.code === ERROR_CODES.TOKEN_EXPIRED ||
      this.code === ERROR_CODES.TOKEN_REUSE_DETECTED
    );
  }
}

/**
 * Le serveur a répondu 2xx avec une forme que le contrat ne connaît pas. Ce n'est
 * pas une erreur de l'utilisateur ni du réseau : c'est un désaccord entre la
 * console et l'API, et il se remonte tel quel — l'écran ne « répare » jamais une
 * réponse.
 */
export class ErreurContrat extends Error {
  readonly chemin: string;
  readonly problemes: readonly string[];

  constructor(chemin: string, problemes: readonly string[]) {
    super(`La réponse de ${chemin} ne respecte pas le contrat.`);
    this.name = 'ErreurContrat';
    this.chemin = chemin;
    this.problemes = problemes;
  }
}

/** Le réseau n'a pas répondu du tout (coupure, DNS, serveur absent). */
export class ErreurReseau extends Error {
  constructor(cause: unknown) {
    super("Le serveur n'a pas répondu.", { cause });
    this.name = 'ErreurReseau';
  }
}

export interface OptionsLecture {
  /** Paramètres de chaîne de requête ; `undefined` = omis. */
  query?: Readonly<Record<string, string | number | undefined>>;
  signal?: AbortSignal;
}

/** Un fichier reçu de l'API : ses octets, et le nom que le serveur lui donne. */
export interface FichierTelecharge {
  readonly blob: Blob;
  readonly nomFichier: string;
  readonly typeMime: string;
}

export interface ClientApi {
  /** `GET` typé : la réponse est validée par `schema` avant d'être rendue. */
  lire<T>(chemin: string, schema: z.ZodType<T>, options?: OptionsLecture): Promise<T>;
  /**
   * `GET` d'un FICHIER — la seule lecture qui ne passe par aucun schéma Zod.
   *
   * Ajoutée en L7c pour l'export §36.3, et à n'utiliser que pour un contenu
   * destiné à être ENREGISTRÉ : il n'y a pas de « forme » à valider dans un ZIP,
   * et l'encoder en base64 dans une enveloppe JSON coûterait +33 % d'octets et un
   * décodage navigateur pour un fichier que l'on va écrire sur un disque.
   * Les erreurs, elles, restent lues dans l'enveloppe unique du 11 §3 : un
   * téléchargement refusé rend un `ErreurApi` comme n'importe quel appel.
   */
  telecharger(chemin: string, options?: OptionsLecture): Promise<FichierTelecharge>;
  /** `POST` typé : le corps est validé par `entree`, la réponse par `sortie`. */
  ecrire<E, S>(
    chemin: string,
    entree: z.ZodType<E>,
    corps: E,
    sortie: z.ZodType<S>,
    options?: { signal?: AbortSignal },
  ): Promise<S>;
}

export interface OptionsClientApi {
  /** L'implémentation de `fetch`. En production : celle du navigateur, résolue à l'appel. */
  fetch: typeof fetch;
  /** Lecture du jeton anti-CSRF (double-soumission, voir `auth.ts`). */
  lireJeton?: () => string | null;
  /** Appelé à chaque 401 : la coquille affiche alors l'écran de connexion. */
  onNonAuthentifie?: () => void;
}

function construireUrl(chemin: string, query: OptionsLecture['query']): string {
  const url = `${BASE_API}${chemin}`;
  if (!query) return url;
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(query)) {
    if (valeur !== undefined) parametres.set(cle, String(valeur));
  }
  const chaine = parametres.toString();
  return chaine === '' ? url : `${url}?${chaine}`;
}

/** Traduit une réponse non-2xx en `ErreurApi`, même si le corps n'est pas l'enveloppe. */
async function lireErreur(reponse: Response): Promise<ErreurApi> {
  let corps: unknown = null;
  try {
    corps = await reponse.json();
  } catch {
    corps = null;
  }
  const enveloppe = apiErrorSchema.safeParse(corps);
  if (enveloppe.success) {
    const { code, message, details } = enveloppe.data.error;
    return new ErreurApi(code, message, reponse.status, details ?? []);
  }
  // Réponse hors enveloppe (proxy, panne) : on garde le statut, on ne devine
  // pas de code métier. `SERVICE_UNAVAILABLE` est le seul code honnête ici.
  return new ErreurApi(
    reponse.status === 401 ? ERROR_CODES.UNAUTHENTICATED : ERROR_CODES.SERVICE_UNAVAILABLE,
    'Le serveur a répondu de façon inattendue.',
    reponse.status,
  );
}

function decoder<T>(chemin: string, schema: z.ZodType<T>, corps: unknown): T {
  const resultat = schema.safeParse(corps);
  if (!resultat.success) {
    throw new ErreurContrat(
      chemin,
      resultat.error.issues.map(
        (p) => `${p.path.map(String).join('.') || '(racine)'} : ${p.message}`,
      ),
    );
  }
  return resultat.data;
}

export function creerClientApi(options: OptionsClientApi): ClientApi {
  const { fetch: appeler, lireJeton = lireJetonAntiCsrf, onNonAuthentifie } = options;

  async function requeter<T>(
    methode: 'GET' | 'POST',
    chemin: string,
    schema: z.ZodType<T>,
    lecture: OptionsLecture & { corps?: string } = {},
  ): Promise<T> {
    const url = construireUrl(chemin, lecture.query);
    let reponse: Response;
    try {
      reponse = await appeler(url, {
        method: methode,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(lecture.corps === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...enTetesAuth(methode, lireJeton()),
        },
        ...(lecture.corps === undefined ? {} : { body: lecture.corps }),
        ...(lecture.signal === undefined ? {} : { signal: lecture.signal }),
      });
    } catch (cause) {
      // Une annulation n'est pas une panne : TanStack la gère lui-même.
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ErreurReseau(cause);
    }

    if (!reponse.ok) {
      const erreur = await lireErreur(reponse);
      if (erreur.nonAuthentifie) onNonAuthentifie?.();
      throw erreur;
    }

    let corps: unknown;
    try {
      corps = await reponse.json();
    } catch {
      throw new ErreurContrat(chemin, ['le corps de la réponse n’est pas du JSON']);
    }
    return decoder(chemin, schema, corps);
  }

  /**
   * Le nom de fichier proposé par le serveur (`Content-Disposition`).
   *
   * Repli sur le nom fourni par l'appelant si l'en-tête manque : un fichier
   * téléchargé sans nom atterrit sous un identifiant opaque dans le dossier de
   * téléchargement, et le consultant ne le retrouve pas.
   */
  function nomPropose(reponse: Response, defaut: string): string {
    const entete = reponse.headers.get('Content-Disposition') ?? '';
    const analyse = /filename="?([^";]+)"?/.exec(entete);
    return analyse?.[1] ?? defaut;
  }

  async function telecharger(
    chemin: string,
    lecture: OptionsLecture = {},
  ): Promise<FichierTelecharge> {
    const url = construireUrl(chemin, lecture.query);
    let reponse: Response;
    try {
      reponse = await appeler(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/zip', ...enTetesAuth('GET', lireJeton()) },
        ...(lecture.signal === undefined ? {} : { signal: lecture.signal }),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ErreurReseau(cause);
    }

    if (!reponse.ok) {
      const erreur = await lireErreur(reponse);
      if (erreur.nonAuthentifie) onNonAuthentifie?.();
      throw erreur;
    }

    const blob = await reponse.blob();
    return {
      blob,
      nomFichier: nomPropose(reponse, 'export.zip'),
      typeMime: reponse.headers.get('Content-Type') ?? 'application/zip',
    };
  }

  return {
    lire: (chemin, schema, lecture) => requeter('GET', chemin, schema, lecture),
    telecharger,
    ecrire: (chemin, entree, corps, sortie, options) => {
      // Le corps est validé AVANT de partir : un client qui envoie ce que le
      // contrat refuse ne mérite pas un aller-retour pour l'apprendre.
      const valide = entree.parse(corps);
      return requeter('POST', chemin, sortie, {
        corps: JSON.stringify(valide),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
    },
  };
}
