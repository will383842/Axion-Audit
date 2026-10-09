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
import { reponsePushSchema, type LotPush, type ReponsePush } from '../local/contrat-sync.js';
import type { BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import { maintenant } from '../local/horloge.js';
import {
  effacerJetonRafraichissement,
  enregistrerJetonRafraichissement,
  lireJetonRafraichissement,
} from '../local/jetons.js';

/** Caddy sert l'API sous `/api` et retire le préfixe (CLAUDE.md : même domaine, pas de CORS). */
export const CHEMIN_PUSH = '/api/v1/sync/push';
export const CHEMIN_REFRESH = '/api/v1/auth/refresh';

/** 05 §31-3, mot pour mot sur le fond : la collecte continue, seule la sync attend. */
export const MESSAGE_RECONNEXION_REQUISE =
  'Reconnexion requise pour synchroniser — vos données sont en sécurité sur l’appareil. Vous pouvez continuer la collecte.';

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

export interface TransportSync {
  /** Le jeton d'accès : MÉMOIRE seulement (11 §3). `null` l'oublie. */
  definirJetonAcces(jeton: string | null): void;
  pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>>;
}

type EchecRefresh = 'hors_ligne' | 'reconnexion_requise' | 'refus';

/** Une rotation réussie rend le nouvel accès ; il ne quitte jamais ce module. */
type IssueRefresh = { readonly acces: string } | EchecRefresh;

/** Lit le corps JSON sans jamais lever : un corps illisible vaut `null`. */
async function corpsJson(reponse: Response): Promise<unknown> {
  try {
    return (await reponse.json()) as unknown;
  } catch {
    return null;
  }
}

/** Le message d'un refus, lu dans l'enveloppe 11 §3 ; une phrase neutre sinon. */
function messageDuRefus(corps: unknown): string {
  const enveloppe = apiErrorSchema.safeParse(corps);
  return enveloppe.success ? enveloppe.data.error.message : MESSAGE_REFUS_SANS_RAISON;
}

export function creerTransport(deps: DependancesTransport): TransportSync {
  let jetonAcces: string | null = null;

  /**
   * Une rotation. Fonction PRIVÉE : l'accès qu'elle rend ne sort jamais de cette
   * fermeture, c'est ce qui garantit qu'il ne peut fuir par un résultat.
   */
  async function rafraichir(): Promise<IssueRefresh> {
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
      jetonAcces = null;
      return 'reconnexion_requise';
    }
    if (!reponse.ok) return 'refus';

    const session = authSessionSchema.safeParse(await corpsJson(reponse));
    if (!session.success) return 'refus';

    // Rotation : le serveur a révoqué l'ancien, on range le nouveau (chiffré).
    await enregistrerJetonRafraichissement(deps.base, deps.coffre, {
      valeur: session.data.refreshToken,
      expireLe: session.data.refreshExpiresAt,
      enregistreLe: maintenant(),
    });
    jetonAcces = session.data.accessToken;
    return { acces: session.data.accessToken };
  }

  function traduireIssue(issue: EchecRefresh): ResultatTransport<never> {
    if (issue === 'hors_ligne') return { type: 'hors_ligne' };
    if (issue === 'reconnexion_requise') {
      return { type: 'reconnexion_requise', message: MESSAGE_RECONNEXION_REQUISE };
    }
    return { type: 'refus', statut: 401, message: MESSAGE_REFUS_SANS_RAISON };
  }

  async function envoyer(lot: LotPush, jeton: string): Promise<Response | null> {
    try {
      return await deps.fetch(CHEMIN_PUSH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
        body: JSON.stringify(lot),
      });
    } catch {
      return null;
    }
  }

  return {
    definirJetonAcces(jeton: string | null): void {
      jetonAcces = jeton;
    },

    async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      let dejaRafraichi = false;
      let acces = jetonAcces;
      if (acces === null) {
        const issue = await rafraichir();
        if (typeof issue === 'string') return traduireIssue(issue);
        acces = issue.acces;
        dejaRafraichi = true;
      }

      let reponse = await envoyer(lot, acces);
      if (reponse === null) return { type: 'hors_ligne' };

      if (reponse.status === 401 && !dejaRafraichi) {
        const issue = await rafraichir();
        if (typeof issue === 'string') return traduireIssue(issue);
        reponse = await envoyer(lot, issue.acces);
        if (reponse === null) return { type: 'hors_ligne' };
      }

      const corps = await corpsJson(reponse);
      if (!reponse.ok) {
        // Un second 401 arrête ici : aucune boucle de refresh, aucun jeton effacé.
        return { type: 'refus', statut: reponse.status, message: messageDuRefus(corps) };
      }

      const analyse = reponsePushSchema.safeParse(corps);
      if (!analyse.success) {
        return { type: 'refus', statut: reponse.status, message: MESSAGE_REPONSE_ILLISIBLE };
      }
      return { type: 'ok', donnees: analyse.data };
    },
  };
}
