// =============================================================================
// LA PORTE D'ÉCRITURE DU JOURNAL D'ACTIVITÉ — `journaliserActivite`. L2, T4.
// Note de conception `docs/conception/LOT_L2.md` §2.4 : « une seule porte ».
//
// ═══════════════════════════════════════════════════════════════════════════════
// LA RÈGLE QUI GOUVERNE TOUT CE FICHIER : LE JOURNAL NE JOURNALISE PAS SA PROPRE
// CHARGE UTILE.
// ═══════════════════════════════════════════════════════════════════════════════
// C'est LE piège nommé par la note §2.4, et il est vicieux parce que le geste qui
// le déclenche est un bon réflexe : passer la ligne qu'on vient d'écrire à
// `request.log.info()` « pour déboguer ». Or c'est le MÊME objet, et il porte `ip`.
// L'adresse sort alors de son régime légal (table, 12 mois, anonymisée à 90 j,
// 06 §10.4) pour entrer dans les FICHIERS de pino, où 11 §2 l'interdit — et où la
// redaction ne la rattrapera pas, puisqu'elle n'y est plus sous la clé qu'elle
// surveille.
//
// Conséquence pratique, appliquée sans exception dans ce fichier : ce qui part vers
// pino se limite à `{ action, entityType, entityId }` — et, en cas de charge utile
// refusée, aux CHEMINS fautifs, jamais aux valeurs. Une trace d'exploitation dit
// OÙ, jamais QUOI.
//
// ── LA DÉCISION D'ÉCHEC, PRISE UNE FOIS ET ÉCRITE ICI ────────────────────────
// Une écriture de journal qui échoue NE FAIT PAS ÉCHOUER la requête de l'auditeur.
// Ce n'est pas un réflexe de confort, c'est un arbitrage, et il a un coût qu'il
// faut nommer :
//   · POUR : une table d'audit pleine, un disque saturé, un verrou — et toute la
//     collecte terrain s'arrête. Pire : sur `auth.reuse_detected`, la révocation de
//     famille est DÉJÀ validée en base ; lever une autre erreur remplacerait le
//     `TOKEN_REUSE_DETECTED` que la PWA sait interpréter par un 500 muet, et
//     masquerait le signal de sécurité au moment précis où il compte.
//   · CONTRE, ET C'EST UN VRAI TROU : une ligne perdue ne se voit QUE dans pino,
//     en niveau `error`. Rien, dans la table, ne dit qu'il manque une ligne. Un
//     attaquant capable de faire échouer l'insertion (saturation) rendrait donc son
//     passage invisible à l'audit tout en restant visible à l'exploitation.
// La correction de ce trou n'est pas dans ce fichier : elle est dans la supervision
// (une alerte sur `journal_activite_ecriture_echouee`) et, à terme, dans une
// contrainte d'infrastructure. Elle est REMONTÉE, pas simulée par un `throw`.
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention activity_log).
// =============================================================================
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import {
  META_REFUSEE,
  evenementJournalSchema,
  verifierValeursAtomiques,
  versLigneJournal,
  type EvenementJournal,
} from '@axion/shared';
import { insererLigneJournal } from './depot.js';

/**
 * Ce que la porte a besoin de savoir de la requête, et rien de plus.
 *
 * Le journal d'exploitation est passé EXPLICITEMENT plutôt que pris sur une
 * instance globale : les traces d'une requête portent son `reqId`, et une ligne
 * d'audit perdue doit pouvoir se rattacher à la requête qui l'a perdue.
 */
export interface ContexteJournal {
  /** `request.ip`, ou `null` hors contexte HTTP (job, migration, amorçage). */
  readonly ip: string | null;
  readonly journal: FastifyBaseLogger;
}

/**
 * Longueur maximale d'une adresse IP textuelle : 45 caractères
 * (`ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255`, la forme IPv4-mappée la plus
 * longue).
 */
const LONGUEUR_MAX_IP = 45;

/**
 * Ce qu'une adresse a le droit de contenir : chiffres hexadécimaux, `.`, `:` et le
 * `%` des adresses de portée locale (`fe80::1%eth0` — les lettres de l'interface
 * sont couvertes par `a-f` seulement, ce qui est une restriction assumée : une
 * adresse à zone non hexadécimale sera écartée plutôt qu'écrite).
 */
const MOTIF_IP = /^[0-9a-fA-F.:%]{1,45}$/;

/**
 * Borne l'adresse avant de l'écrire. Rend `null` pour tout ce qui n'a pas la forme
 * d'une adresse.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE CONTRÔLE EXISTE — ce n'est pas de la coquetterie défensive.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `request.ip` N'EST PAS TOUJOURS UNE ADRESSE. Avec `trustProxy` (app.ts), Fastify
 * lit `X-Forwarded-For` et rend l'entrée la plus à gauche hors du périmètre de
 * confiance — une CHAÎNE FOURNIE PAR LE CLIENT, que Fastify ne valide pas. Le bloc
 * d'en-tête d'`app.ts` documente d'ailleurs le cas résiduel où la forgerie reste
 * atteignable (« si le frontal le plus externe n'ajoute RIEN à `X-Forwarded-For` »).
 *
 * Sans cette borne, un client anonyme écrit ce qu'il veut dans `activity_log.ip`,
 * sur une route PUBLIQUE (`/v1/auth/login`), à raison de 10 lignes par minute : du
 * texte libre, une adresse e-mail, un fragment de charge utile — dans la colonne
 * même que le RGPD (06 §10.4) place sous un régime strict, et dans la table dont
 * tout ce module garantit qu'elle ne contient pas de donnée personnelle. La
 * garantie de pureté serait alors fausse par une entrée que personne ne regarde.
 *
 * On écarte plutôt qu'on tronque : une adresse tronquée est une adresse FAUSSE, et
 * une fausse adresse dans un journal d'audit est pire qu'une absence d'adresse.
 */
function normaliserIp(ip: string | null): string | null {
  if (ip === null || ip === '') return null;
  if (ip.length > LONGUEUR_MAX_IP) return null;
  return MOTIF_IP.test(ip) ? ip : null;
}

/**
 * Le contexte de journal d'une requête HTTP. Sucre, pour que les points d'appel
 * restent d'une ligne — un point d'appel verbeux finit par être oublié.
 */
export function contexteDepuisRequete(requete: FastifyRequest): ContexteJournal {
  return { ip: requete.ip, journal: requete.log };
}

/**
 * ÉCRIT UNE LIGNE DANS `activity_log`. C'est le SEUL chemin d'écriture de
 * l'application (voir l'en-tête de `depot.ts` pour les trois ceintures).
 *
 * NE LÈVE JAMAIS : voir « la décision d'échec » en tête de fichier. Un appelant qui
 * l'entoure d'un `try/catch` a mal lu ; un appelant qui oublie l'`await` sera repris
 * par `no-floating-promises`.
 *
 * L'ORDRE DES CONTRÔLES EST LA GARANTIE, pas la fonction :
 *   ① `safeParse` — l'événement appartient-il au catalogue fermé ? (ceinture 1)
 *   ② projection sur les colonnes du fichier 04 (fonction pure, exhaustive) ;
 *   ③ `verifierValeursAtomiques` — la charge utile a-t-elle la FORME de données
 *      techniques ? (ceinture 2, indépendante du schéma) ;
 *   ④ bornage de l'adresse (voir `normaliserIp` — l'entrée non validée par Fastify) ;
 *   ⑤ insertion.
 */
export async function journaliserActivite(
  evenement: EvenementJournal,
  contexte: ContexteJournal,
): Promise<void> {
  // ① Le catalogue fermé. Un appelant TypeScript conforme ne peut pas échouer ici ;
  //    un appelant qui a reconstruit son événement depuis de l'`unknown` (une file,
  //    un import) le peut. On refuse plutôt qu'on écrit une ligne informe : une
  //    ligne dont l'action n'est pas au catalogue rendrait le balayage de pureté
  //    incapable de savoir ce qu'il regarde.
  const analyse = evenementJournalSchema.safeParse(evenement);
  if (!analyse.success) {
    contexte.journal.error(
      {
        // Le nom de l'action, jamais l'événement : c'est justement l'événement
        // dont on vient d'établir qu'on ne sait pas ce qu'il contient.
        action: evenement.action,
        chemins: analyse.error.issues.map((probleme) => probleme.path.join('.')),
      },
      "Journal d'activité : événement hors catalogue — ligne NON écrite",
    );
    return;
  }

  // ② Projection sur les colonnes (pure, exhaustive : voir `versLigneJournal`).
  const contenu = versLigneJournal(analyse.data);

  // ③ La ceinture indépendante du schéma.
  const violations = contenu.meta === null ? [] : verifierValeursAtomiques(contenu.meta);
  const metaEcrite = violations.length === 0 ? contenu.meta : META_REFUSEE;

  if (violations.length > 0) {
    contexte.journal.error(
      // LES CHEMINS, JAMAIS LES VALEURS — recopier la valeur fautive ferait entrer
      // dans pino exactement ce qu'on vient de refuser d'écrire en base.
      { action: contenu.action, chemins: violations },
      "Journal d'activité : charge utile hors vocabulaire technique — `meta` écartée",
    );
  }

  try {
    // ④ + ⑤
    const idLigne = await insererLigneJournal({
      ...contenu,
      meta: metaEcrite,
      ip: normaliserIp(contexte.ip),
    });

    // Trace d'exploitation MINIMALE : de quoi corréler, jamais de quoi divulguer.
    // Ni `meta`, ni `ip`, ni `user_id` — la note §2.4 borne cette ligne à
    // « au plus { action, entity_type, entity_id } ».
    contexte.journal.debug(
      {
        action: contenu.action,
        entityType: contenu.entityType,
        entityId: contenu.entityId,
        idLigne,
      },
      "Journal d'activité : ligne écrite",
    );
  } catch (erreur: unknown) {
    // Voir « la décision d'échec » en tête de fichier : on ne relance PAS.
    // `{ err }` est admis ici — la politique de redaction partagée nettoie
    // `err.message` et la pile (`packages/shared/src/redaction.ts`), et une panne
    // d'écriture d'audit sans son message serait indiagnosticable.
    contexte.journal.error(
      { err: erreur, action: contenu.action },
      "Journal d'activité : écriture impossible — LIGNE PERDUE (journal_activite_ecriture_echouee)",
    );
  }
}
