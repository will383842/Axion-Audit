// =============================================================================
// LE TRANSPORT DE SYNC — seul module de l'app terrain autorisé à appeler `/v1/sync/*`
//
// `LOT_L6.md` §3bis (A-2), 11 §3, 05 §31-3. Ce que ce fichier tient, et rien d'autre :
//   · le Bearer : le jeton d'ACCÈS (15 min) vit en mémoire de session, jamais au
//     repos ; seul le refresh (30 j, rotatif) est rangé, CHIFFRÉ (`local/jetons.ts`) ;
//   · 401 → UN refresh → UNE reprise. Un second 401 arrête : pas de boucle, et
//     `/v1/auth/*` est borné à 10 req/min/IP (11 §3) ;
//   · LE PIÈGE DU §31-3 : « pas de réseau » n'est pas « jeton mort ». Une erreur
//     réseau rend `hors_ligne` et CONSERVE le refresh ; seul un refus EXPLICITE du
//     serveur (401/403 sur le refresh) l'efface. Effacer un refresh parce que le
//     réseau est tombé coûterait 30 jours de sync à un auditeur en mission.
//
// Aucun jeton ne sort d'ici : ni dans un résultat, ni dans la console (11 §2).
// Ce fichier ne décide d'aucun sort d'opération : il rend une réponse, le moteur
// (`moteur.ts`) la traduit.
//
// Traçabilité : E7, E38 ; 11 §3 ; 05 §31-3.
// =============================================================================
import { apiErrorSchema, authSessionSchema } from '@axion/shared';
import { z } from 'zod';
import {
  reponsePullSchema,
  reponsePushSchema,
  type LotPush,
  type ReponsePull,
  type ReponsePush,
} from '../local/contrat-sync.js';
import type { BaseLocale } from '../local/base.js';
import type {
  CodeReemission,
  ReponseStatutPieceLocale,
  ResultatTerminerPiece,
  TransportPieces,
} from './chunks.js';
import type { Coffre } from '../local/coffre.js';
import { maintenant } from '../local/horloge.js';
import {
  effacerJetonRafraichissement,
  enregistrerJetonRafraichissement,
  lireJetonRafraichissement,
} from '../local/jetons.js';

/** Caddy sert l'API sous `/api` et retire le préfixe (CLAUDE.md : même domaine, pas de CORS). */
export const CHEMIN_PUSH = '/api/v1/sync/push';
/** 11 §4 : `GET /v1/sync/pull?mission_id=&since=` — la descente (L6b). */
export const CHEMIN_PULL = '/api/v1/sync/pull';
export const CHEMIN_REFRESH = '/api/v1/auth/refresh';

/** 05 §31-3 — texte EXACT arbitré par A01 (2026-10-09) : seule la sync attend. */
export const MESSAGE_RECONNEXION_REQUISE =
  'Reconnexion requise pour synchroniser. Vos saisies restent en sécurité sur cet appareil.';

const MESSAGE_REPONSE_ILLISIBLE =
  'Le siège a répondu dans un format inattendu. Rien n’a été retiré de cet appareil ; la synchronisation sera retentée.';

const MESSAGE_REFUS_SANS_RAISON =
  'Le siège a refusé la synchronisation sans en donner la raison. Rien n’a été retiré de cet appareil.';

export type ResultatTransport<T> =
  | { readonly type: 'ok'; readonly donnees: T }
  | { readonly type: 'hors_ligne' }
  | { readonly type: 'reconnexion_requise'; readonly message: string }
  | { readonly type: 'refus'; readonly statut: number; readonly message: string };

export interface DependancesTransport {
  /** Injecté et résolu à l'appel (comme `siege/connexion.ts`). */
  readonly fetch: typeof fetch;
  readonly base: BaseLocale;
  readonly coffre: Coffre;
}

export interface TransportSync extends TransportPieces {
  /** Le jeton d'accès : MÉMOIRE seulement (11 §3). `null` l'oublie. */
  definirJetonAcces(jeton: string | null): void;
  pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>>;
  /**
   * UNE page de descente (11 §4). `since` nul = premier pull, mission complète :
   * le paramètre est alors ABSENT de la requête.
   */
  tirer(missionId: string, since: string | null): Promise<ResultatTransport<ReponsePull>>;
}

type EchecRefresh = 'hors_ligne' | 'reconnexion_requise' | 'refus';

/** Une requête de sync : `GET` (pull) ou `POST` avec corps JSON (push). */
interface Requete {
  readonly method: 'GET' | 'POST';
  /** JSON (chaîne) ou octets bruts d'un morceau de pièce (L6c, jamais en base64). */
  readonly body?: string | Uint8Array<ArrayBuffer>;
}

/** Une rotation réussie rend le nouvel accès ; il ne quitte jamais ce module. */
type IssueRefresh = { readonly acces: string } | EchecRefresh;

/**
 * A1 (2026-10-09) : le siège est SATURÉ ou sa passerelle muette — 429, 502, 503,
 * 504. Ce n'est pas un refus de l'op : on traite comme une coupure (rien n'est
 * compté, le jeton est intact, on réessaiera).
 */
const STATUTS_INDISPONIBLES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/**
 * A3 (2026-10-09) : l'authentification est un fait de la BASE (un appareil, un
 * auditeur), pas d'un transport. Le refresh TOURNE : deux refresh concurrents
 * présenteraient deux fois le même jeton, et le second serait un REJEU — qui
 * révoque toute la famille côté serveur (11 §3). Un seul vol par base, partagé
 * par tous les transports qui la servent, et l'accès obtenu profite à tous.
 */
interface EtatAuthentification {
  acces: string | null;
  enVol: Promise<IssueRefresh> | null;
}

const authentificationParBase = new WeakMap<BaseLocale, EtatAuthentification>();

function authentificationDe(base: BaseLocale): EtatAuthentification {
  let etat = authentificationParBase.get(base);
  if (etat === undefined) {
    etat = { acces: null, enVol: null };
    authentificationParBase.set(base, etat);
  }
  return etat;
}

/** Lit le corps JSON sans jamais lever : un corps illisible vaut `null`. */
async function corpsJson(reponse: Response): Promise<unknown> {
  try {
    return (await reponse.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * L'enveloppe 11 §3 lue pour son MESSAGE seulement. Un code que cette version
 * du terrain ne connaît pas encore (siège plus récent) ne doit pas faire perdre
 * la phrase française que le siège a écrite pour l'auditeur.
 */
const enveloppeTolerante = apiErrorSchema.extend({
  error: apiErrorSchema.shape.error.extend({ code: z.string() }),
});

/** Le message d'un refus, lu dans l'enveloppe 11 §3 ; une phrase neutre sinon. */
function messageDuRefus(corps: unknown): string {
  const enveloppe = enveloppeTolerante.safeParse(corps);
  return enveloppe.success ? enveloppe.data.error.message : MESSAGE_REFUS_SANS_RAISON;
}

export function creerTransport(deps: DependancesTransport): TransportSync {
  const auth = authentificationDe(deps.base);

  /**
   * Un accès neuf pour remplacer `echoue` : celui qu'un autre vient d'obtenir,
   * sinon le vol en cours, sinon un nouveau vol — jamais deux à la fois.
   */
  function rafraichir(echoue: string | null): Promise<IssueRefresh> {
    if (auth.acces !== null && auth.acces !== echoue) {
      return Promise.resolve({ acces: auth.acces });
    }
    if (auth.enVol === null) {
      const vol = tourner();
      auth.enVol = vol;
      const atterrir = (): void => {
        if (auth.enVol === vol) auth.enVol = null;
      };
      vol.then(atterrir, atterrir);
    }
    return auth.enVol;
  }

  /**
   * Une rotation. Fonction PRIVÉE : l'accès qu'elle rend ne sort jamais de ce
   * module, c'est ce qui garantit qu'il ne peut fuir par un résultat.
   */
  async function tourner(): Promise<IssueRefresh> {
    const stocke = await lireJetonRafraichissement(deps.base, deps.coffre);
    if (stocke === null) return 'reconnexion_requise';

    let reponse: Response;
    try {
      reponse = await deps.fetch(CHEMIN_REFRESH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: stocke.valeur }),
      });
    } catch {
      // Réseau absent : le refresh est CONSERVÉ (le piège du §31-3).
      return 'hors_ligne';
    }

    if (reponse.status === 401 || reponse.status === 403) {
      // Refus EXPLICITE : le jeton est mort, le garder ferait marteler `/auth/*`.
      await effacerJetonRafraichissement(deps.base);
      auth.acces = null;
      return 'reconnexion_requise';
    }
    if (STATUTS_INDISPONIBLES.has(reponse.status)) return 'hors_ligne';
    if (!reponse.ok) return 'refus';

    const session = authSessionSchema.safeParse(await corpsJson(reponse));
    if (!session.success) return 'refus';

    // Rotation : le serveur a révoqué l'ancien, on range le nouveau (chiffré).
    await enregistrerJetonRafraichissement(deps.base, deps.coffre, {
      valeur: session.data.refreshToken,
      expireLe: session.data.refreshExpiresAt,
      enregistreLe: maintenant(),
    });
    auth.acces = session.data.accessToken;
    return { acces: session.data.accessToken };
  }

  function traduireIssue(issue: EchecRefresh): ResultatTransport<never> {
    if (issue === 'hors_ligne') return { type: 'hors_ligne' };
    if (issue === 'reconnexion_requise') {
      return { type: 'reconnexion_requise', message: MESSAGE_RECONNEXION_REQUISE };
    }
    return { type: 'refus', statut: 401, message: MESSAGE_REFUS_SANS_RAISON };
  }

  /** Une requête authentifiée ; `null` = le réseau n'a pas répondu. */
  async function envoyer(
    chemin: string,
    requete: Requete,
    jeton: string,
  ): Promise<Response | null> {
    const headers: Record<string, string> = { authorization: `Bearer ${jeton}` };
    if (typeof requete.body === 'string') headers['content-type'] = 'application/json';
    else if (requete.body !== undefined) headers['content-type'] = 'application/octet-stream';
    try {
      return await deps.fetch(chemin, { ...requete, headers });
    } catch {
      return null;
    }
  }

  /**
   * Le protocole COMMUN au push et au pull : l'accès en mémoire, sinon UN
   * refresh ; 401 → UN refresh → UNE reprise ; indisponibilité = `hors_ligne` ;
   * réponse validée par `schema` — illisible = `refus` en français, jamais une
   * exception.
   */
  async function appeler<S extends z.ZodType, R = never>(
    chemin: string,
    requete: Requete,
    schema: S,
    /** Lecture d'un refus PARTICULIER (L6c : le 409 de `complete`) ; `null` = refus ordinaire. */
    surRefus?: (statut: number, corps: unknown) => R | null,
  ): Promise<ResultatTransport<z.infer<S>> | R> {
    let dejaRafraichi = false;
    let acces = auth.acces;
    if (acces === null) {
      const issue = await rafraichir(null);
      if (typeof issue === 'string') return traduireIssue(issue);
      acces = issue.acces;
      dejaRafraichi = true;
    }

    let reponse = await envoyer(chemin, requete, acces);
    if (reponse === null) return { type: 'hors_ligne' };

    if (reponse.status === 401 && !dejaRafraichi) {
      const issue = await rafraichir(acces);
      if (typeof issue === 'string') return traduireIssue(issue);
      reponse = await envoyer(chemin, requete, issue.acces);
      if (reponse === null) return { type: 'hors_ligne' };
    }

    if (STATUTS_INDISPONIBLES.has(reponse.status)) return { type: 'hors_ligne' };
    const corps = await corpsJson(reponse);
    if (!reponse.ok) {
      const particulier = surRefus?.(reponse.status, corps) ?? null;
      if (particulier !== null) return particulier;
      // Un second 401 arrête ici : aucune boucle de refresh, aucun jeton effacé.
      return { type: 'refus', statut: reponse.status, message: messageDuRefus(corps) };
    }

    const analyse = schema.safeParse(corps);
    if (!analyse.success) {
      return { type: 'refus', statut: reponse.status, message: MESSAGE_REPONSE_ILLISIBLE };
    }
    return { type: 'ok', donnees: analyse.data };
  }

  return {
    definirJetonAcces(jeton: string | null): void {
      auth.acces = jeton;
    },

    pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      return appeler(CHEMIN_PUSH, { method: 'POST', body: JSON.stringify(lot) }, reponsePushSchema);
    },

    tirer(missionId: string, since: string | null): Promise<ResultatTransport<ReponsePull>> {
      // Paramètres en snake_case (11 §4) ; `since` ABSENT au premier pull.
      const parametres = new URLSearchParams({ mission_id: missionId });
      if (since !== null) parametres.set('since', since);
      return appeler(
        `${CHEMIN_PULL}?${parametres.toString()}`,
        { method: 'GET' },
        reponsePullSchema,
      );
    },

    // ── L6c-1 — les trois routes de chunks (05 §9.6), même authentification ──
    statutPiece(id: string): Promise<ResultatTransport<ReponseStatutPieceLocale>> {
      return appeler(`${CHEMIN_PIECES}/${id}/status`, { method: 'GET' }, statutPieceSchema);
    },

    envoyerMorceau(
      id: string,
      index: number,
      octets: Uint8Array,
    ): Promise<ResultatTransport<unknown>> {
      return appeler(
        `${CHEMIN_PIECES}/${id}/chunks/${String(index)}`,
        // Copie : le corps doit être un tampon à lui, jamais une vue sur la pièce entière.
        { method: 'POST', body: new Uint8Array(octets) },
        z.unknown(),
      );
    },

    terminerPiece(
      id: string,
      corps: { readonly sha256: string; readonly chunks: number },
    ): Promise<ResultatTerminerPiece> {
      return appeler(
        `${CHEMIN_PIECES}/${id}/complete`,
        { method: 'POST', body: JSON.stringify({ sha256: corps.sha256, chunks: corps.chunks }) },
        terminerPieceSchema,
        lireReemission,
      );
    },
  };
}

/** Racine des routes de pièces (05 §9.6). */
export const CHEMIN_PIECES = '/api/v1/sync/attachments';

const statutPieceSchema = z.object({
  statut: z.string(),
  chunksRecus: z.array(z.number().int().min(0)),
});

const terminerPieceSchema = z.object({ statut: z.literal('assemble') });

/**
 * Le 409 de `complete` (DECISIONS [L6c]) : SEULS les deux codes du protocole,
 * avec une liste d'entiers NON VIDE, deviennent une réémission. Tout autre 409
 * reste un refus — jamais une réémission inventée.
 */
const reemissionSchema = z.object({
  error: z.object({
    code: z.enum(['UPLOAD_CHUNKS_MISSING', 'UPLOAD_CHECKSUM_MISMATCH']),
    details: z.array(z.number().int().min(0)).min(1),
  }),
});

function lireReemission(
  statut: number,
  corps: unknown,
): {
  readonly type: 'a_reemettre';
  readonly code: CodeReemission;
  readonly index: number[];
} | null {
  if (statut !== 409) return null;
  const lu = reemissionSchema.safeParse(corps);
  if (!lu.success) return null;
  return { type: 'a_reemettre', code: lu.data.error.code, index: lu.data.error.details };
}
