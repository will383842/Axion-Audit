// =============================================================================
// LE COFFRE — DEK / KEK, 05 §9.7 (« Sécurité locale »), 06 §10.5, 11 §4
//
// ── L'ARCHITECTURE, TRANSCRITE DU 05 §9.7 ET DE RIEN D'AUTRE ─────────────────
// « Une **DEK** AES-256 aléatoire par appareil chiffre les données ; la DEK est
// enveloppée par une **KEK** dérivée du mot de passe (Argon2id + sel local par
// appareil) et stockée enveloppée. Changement de mot de passe EN LIGNE = simple
// ré-enveloppement de la DEK (les données ne sont jamais re-chiffrées). […] La
// KEK n'est tenue qu'en mémoire de session. »
//
// Trois conséquences que ce fichier rend structurelles plutôt que déclarées :
//   1. la DEK obtenue par `unwrapKey` est **non extractable** — elle ne peut plus
//      sortir de WebCrypto, même pour du code qui le voudrait ;
//   2. `verrouiller()` lâche la référence à la DEK et FERME le coffre : toute
//      opération ultérieure lève, elle ne rend pas une valeur vide ;
//   3. `reenvelopperDek` ne touche à AUCUNE donnée — c'est ce qui rend le
//      changement de mot de passe instantané sur une mission de 5 000 réponses.
//
// ── LA DÉCISION GRAVÉE QU'IL NE FAUT PAS RECONTOURNER ────────────────────────
// 05 §9.7 : « AUCUN mécanisme de déverrouillage affaibli en V1 (pas de PIN court,
// pas de schéma — la KEK dérive du mot de passe et de rien d'autre) ». Aucune
// fonction de ce module n'accepte autre chose qu'un mot de passe.
//
// ── CE QUI EST UNE DÉCISION ET DOIT ÊTRE RATIFIÉE (DECISIONS.md) ─────────────
// Le pack impose l'ALGORITHME (Argon2id, 11 §4) mais AUCUN paramètre. Les valeurs
// de `PARAMETRES_KDF_DEFAUT` sont donc un choix, pas une lecture : elles suivent
// la recommandation OWASP (Password Storage Cheat Sheet) pour Argon2id, et elles
// sont ÉCRITES DANS LE COFFRE ET DANS L'EN-TÊTE DE SAUVEGARDE (11 §4 :
// `kdf: {algo, salt, params}`) — c'est ce qui permet de les changer un jour sans
// rendre illisible ce qui a été chiffré avant. 11 §8-4 réserve la décision à
// l'humain : elle est remontée, pas devinée.
//
// Traçabilité : E33 (sécurité / RGPD), E38 (sauvegarde terrain : sync + export).
// =============================================================================
import { argon2id } from 'hash-wasm';
import type { ZodType } from 'zod';
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@axion/shared';
import {
  depuisBase64,
  ErreurEnveloppe,
  LONGUEUR_NONCE_OCTETS,
  versBase64,
  VERSION_ENVELOPPE,
  type Enveloppe,
} from './enveloppe.js';

// Ré-exporté ici parce que c'est le type que le coffre PRODUIT et CONSOMME :
// un appelant qui manipule un coffre n'a aucune raison d'aller chercher la forme
// de l'enveloppe dans un troisième module.
export type { Enveloppe } from './enveloppe.js';

// ─────────────────────────────────────────────────────────────────────────────
// PARAMÈTRES
// ─────────────────────────────────────────────────────────────────────────────
export interface ParametresKdf {
  readonly algo: 'argon2id';
  /** Mémoire en kibioctets (`m`). */
  readonly memoireKio: number;
  /** Nombre de passes (`t`). */
  readonly iterations: number;
  /** Voies parallèles (`p`). `hash-wasm` est mono-thread : rester à 1. */
  readonly parallelisme: number;
  /** Longueur de la clé dérivée, en octets. 32 = AES-256. */
  readonly longueurOctets: number;
}

/**
 * Profil OWASP « m=46 MiB, t=1, p=1 » pour Argon2id.
 *
 * Le choix n'est pas de confort : 11 §4 impose « dérivation de clé < 1 s sur
 * iPad », et c'est un budget d'ACCEPTATION mesuré par A28. Un profil plus lourd
 * (64 MiB, t=3) tiendrait peut-être sur un portable et échouerait sur la cible la
 * plus dure, que 03 §22.1 désigne explicitement comme l'iPad. Le déverrouillage
 * a lieu à chaque reprise après 15 minutes d'inactivité : une seconde de plus
 * est payée dix fois par jour, en entretien.
 */
export const PARAMETRES_KDF_DEFAUT: ParametresKdf = {
  algo: 'argon2id',
  memoireKio: 47_104,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
};

/** Longueur du sel de dérivation, en octets (recommandation Argon2 : 16). */
export const LONGUEUR_SEL_OCTETS = 16;

/** Longueur de la DEK, en bits. 05 §9.7 : « une DEK AES-256 ». */
const LONGUEUR_DEK_BITS = 256;

/**
 * Longueur de la KEK dérivée, en octets — et la SEULE admise (revue A29, R1).
 *
 * Ce n'est pas un réglage : `crypto.subtle.importKey('raw', …, 'AES-GCM')`
 * n'accepte que 16, 24 ou 32 octets et rejette tout le reste par un `DataError:
 * Invalid key length` ; et parmi les trois, la KEK enveloppe une DEK **AES-256**
 * (05 §9.7), donc elle vaut 32. En admettre 16 dégraderait en silence tout le
 * chiffrement local d'un appareil, sur la foi d'une ligne écrite dans IndexedDB.
 */
const LONGUEUR_KEK_OCTETS = LONGUEUR_DEK_BITS / 8;

/**
 * Le TRAVAIL demandé à Argon2id, en kibioctets-passes (`m × t`).
 *
 * C'est la grandeur qui commande le temps de dérivation : la doubler double le
 * coût, qu'on double la mémoire ou le nombre de passes.
 */
export function travailKdf(parametres: ParametresKdf): number {
  return parametres.memoireKio * parametres.iterations;
}

/**
 * BORNES des paramètres de dérivation — verdict A51 du 2026-09-04 (F-25), et
 * revue croisée A29 du 2026-09-05 (R1), qui a mesuré ce que la première version
 * laissait passer.
 *
 * ── POURQUOI BORNER DES PARAMÈTRES QUI SONT LES NÔTRES ──────────────────────
 * Ils ne le sont pas toujours : ils sont **stockés avec le coffre** (et c'est la
 * bonne décision — un coffre créé hier doit s'ouvrir demain), donc **relus d'une
 * entrée non fiable**. A51 l'a mesuré : `{memoireKio: 4 000 000, iterations:
 * 1 000 000}` écrit dans `meta` était accepté, et chaque déverrouillage aurait
 * alors demandé 4 Gio et un million de passes — l'onglet meurt, les données sont
 * intactes et l'auditeur n'y accède plus. Une écriture, sans mot de passe.
 *
 * ── CE QUE LA PREMIÈRE VERSION FERMAIT, ET CE QU'ELLE LAISSAIT OUVERT ───────
 * Elle ne bornait que par le HAUT, et seulement le budget. A29 a mesuré QUATRE
 * jeux de paramètres qui PASSAIENT la vérification et tuaient le déverrouillage
 * un cran plus bas, sur un message technique anglais :
 *   · `longueurOctets: 48` et `64` → `DataError: Invalid key length` (WebCrypto),
 *     `64` étant la borne haute EXACTE de la version précédente ;
 *   · `longueurOctets: 1`          → `Hash length should be at least 4 bytes.` ;
 *   · `memoireKio: 7`              → `Memory size should be at least 8 * parallelism.`
 * Même écriture dans IndexedDB, même conséquence, même appareil définitivement
 * fermé : c'est F-25 dans son INTENTION — « une valeur qui vient du stockage est
 * une entrée non fiable » —, et c'est elle qu'on ferme ici, pas sa lettre.
 *
 * ── D'OÙ VIENNENT CES NOMBRES : DU BUDGET ET DES OUTILS, PAS DE L'INSPIRATION ─
 * · Le PLAFOND DE TRAVAIL (`m × t`) vient du budget 11 §4 (« dérivation de clé
 *   < 1 s sur iPad ») et de l'arbitrage `DECISIONS.md` du 2026-09-04, « [L5a]
 *   Quel plafond pour les paramètres KDF relus du stockage (F-25) ? » :
 *   `travailKdf(défaut) × 4`, **amarré au profil** pour qu'un durcissement humain
 *   (11 §8-4) relève le plafond du même geste. Le profil confirmé a été mesuré à
 *   139 ms par A51, sur une courbe linéaire (500 000 Kio-passes → 861 ms, déjà au
 *   budget). Les trois autres plafonds ne bornent pas le temps mais une
 *   RESSOURCE : allocation, voies, taille de sortie.
 * · Les PLANCHERS ne sont PAS un jugement de sécurité : ce sont les refus que
 *   `hash-wasm` et WebCrypto opposent eux-mêmes, transcrits ici pour être dits en
 *   français AVANT d'être subis en anglais. Ils sont LUS de la bibliothèque
 *   (`hash-wasm@4.12.0`, `lib/argon2.ts`, `validateOptions`) et non devinés :
 *   `iterations ≥ 1`, `parallelisme ≥ 1`, `memoireKio ≥ 8 × p`, et chacun ENTIER.
 *   Un plancher qui ne refuse que ce que la bibliothèque refuse déjà ne peut
 *   fermer aucun coffre qui s'ouvrait la veille — invariant 7.
 * · `longueurOctets` n'est pas une grandeur à borner : c'est une valeur UNIQUE,
 *   `LONGUEUR_KEK_OCTETS`. Plancher et plafond sont donc ÉGAUX, et le dire par
 *   deux bornes plutôt que par une égalité garde un message d'erreur homogène
 *   avec les quatre autres axes (« pour un maximum de », « pour un minimum de »).
 *
 * Aucun autre plancher, et surtout aucun plancher de TRAVAIL : refuser un profil
 * plus faible que le nôtre ne protège rien (un attaquant hors ligne choisit ses
 * propres paramètres) et rendrait illisible un coffre légitime créé sous un autre
 * profil — invariant 7, encore.
 */
export const BORNES_KDF = {
  /** Allocation mémoire maximale acceptée, en kibioctets. */
  memoireKioMax: 4 * PARAMETRES_KDF_DEFAUT.memoireKio,
  /**
   * Mémoire minimale PAR VOIE, en kibioctets — `hash-wasm` : « Memory size should
   * be at least 8 * parallelism ». Un COEFFICIENT et non une valeur : le plancher
   * dépend de `parallelisme`, et l'écrire en dur le rendrait faux au premier `p`
   * différent de 1.
   */
  memoireKioMinParVoie: 8,
  /** Nombre de passes maximal accepté. */
  iterationsMax: 8,
  /** Passes minimales — `hash-wasm` : « Iterations should be a positive number ». */
  iterationsMin: 1,
  /** Voies parallèles maximales. `hash-wasm` est mono-thread ; au-delà, c'est du coût pur. */
  parallelismeMax: 4,
  /** Voies minimales — `hash-wasm` : « Parallelism should be a positive number ». */
  parallelismeMin: 1,
  /** Longueur de clé dérivée maximale, en octets (AES-256 en demande 32). */
  longueurOctetsMax: LONGUEUR_KEK_OCTETS,
  /** …et minimale : la MÊME. Ce n'est pas une plage — voir `LONGUEUR_KEK_OCTETS`. */
  longueurOctetsMin: LONGUEUR_KEK_OCTETS,
  /** Travail total maximal (`m × t`), en kibioctets-passes. */
  travailMax: 4 * travailKdf(PARAMETRES_KDF_DEFAUT),
} as const;

/**
 * Refuse d'exécuter des paramètres hors bornes — par une erreur EXPLICITE.
 *
 * Le refus ne passe volontairement pas par un `.max()` ni par un `.min()` du
 * schéma Zod du coffre au repos : Zod dirait « ce coffre est illisible » là où la
 * vérité est « ce coffre est parfaitement lisible et ses paramètres sont hors
 * bornes ». Confondre deux états distincts est exactement ce que F-22 a coûté ;
 * on ne le réintroduit pas ici pour gagner trois lignes.
 *
 * Tous les écarts sont collectés avant de lever, jamais le premier venu : celui
 * qui lira ce message une seule fois, sur le terrain, doit y trouver TOUT ce qui
 * cloche.
 */
export function verifierParametresKdf(parametres: ParametresKdf): void {
  const ecarts: string[] = [];
  const trop = (valeur: number, maximum: number, axe: string): string =>
    `${axe} ${String(valeur)} pour un maximum de ${String(maximum)}`;
  const pasAssez = (valeur: number, minimum: number, axe: string): string =>
    `${axe} ${String(valeur)} pour un minimum de ${String(minimum)}`;

  // Argon2id refuse tout paramètre non entier (`Number.isInteger`, dans son
  // propre `validateOptions`). Le dire ici évite qu'une valeur fractionnaire
  // relue du stockage ne meure un cran plus bas, en anglais. `NaN` tombe dans le
  // même filet : il n'est entier pour personne, et aucune comparaison de borne ne
  // le retiendrait — toutes rendent `false`.
  const AXES: readonly { readonly axe: string; readonly valeur: number }[] = [
    { axe: 'mémoire de', valeur: parametres.memoireKio },
    { axe: 'passes :', valeur: parametres.iterations },
    { axe: 'voies parallèles :', valeur: parametres.parallelisme },
    { axe: 'longueur de clé :', valeur: parametres.longueurOctets },
  ];
  for (const { axe, valeur } of AXES) {
    if (!Number.isInteger(valeur)) {
      ecarts.push(`${axe} ${String(valeur)} n’est pas un nombre entier`);
    }
  }

  if (parametres.memoireKio > BORNES_KDF.memoireKioMax) {
    ecarts.push(trop(parametres.memoireKio, BORNES_KDF.memoireKioMax, 'mémoire de'));
  }
  // Le plancher de mémoire SUIT le parallélisme, comme la contrainte d'Argon2id
  // elle-même (`m ≥ 8 × p`). Écrit en dur, il serait faux dès `p = 2`.
  const memoireKioMin = BORNES_KDF.memoireKioMinParVoie * parametres.parallelisme;
  if (parametres.memoireKio < memoireKioMin) {
    ecarts.push(pasAssez(parametres.memoireKio, memoireKioMin, 'mémoire de'));
  }
  if (parametres.iterations > BORNES_KDF.iterationsMax) {
    ecarts.push(trop(parametres.iterations, BORNES_KDF.iterationsMax, 'passes :'));
  }
  if (parametres.iterations < BORNES_KDF.iterationsMin) {
    ecarts.push(pasAssez(parametres.iterations, BORNES_KDF.iterationsMin, 'passes :'));
  }
  if (parametres.parallelisme > BORNES_KDF.parallelismeMax) {
    ecarts.push(trop(parametres.parallelisme, BORNES_KDF.parallelismeMax, 'voies parallèles :'));
  }
  if (parametres.parallelisme < BORNES_KDF.parallelismeMin) {
    ecarts.push(
      pasAssez(parametres.parallelisme, BORNES_KDF.parallelismeMin, 'voies parallèles :'),
    );
  }
  if (parametres.longueurOctets > BORNES_KDF.longueurOctetsMax) {
    ecarts.push(trop(parametres.longueurOctets, BORNES_KDF.longueurOctetsMax, 'longueur de clé :'));
  }
  if (parametres.longueurOctets < BORNES_KDF.longueurOctetsMin) {
    ecarts.push(
      pasAssez(parametres.longueurOctets, BORNES_KDF.longueurOctetsMin, 'longueur de clé :'),
    );
  }
  if (travailKdf(parametres) > BORNES_KDF.travailMax) {
    ecarts.push(trop(travailKdf(parametres), BORNES_KDF.travailMax, 'travail total de'));
  }
  if (ecarts.length > 0) {
    throw new ParametresKdfHorsBornesError(ecarts.join(' ; '));
  }
}

/**
 * La politique de mot de passe du coffre local — verdict A51, F-23.
 *
 * ── CE QUE CE MOT DE PASSE PROTÈGE, ET QUI JUSTIFIE LA CONTRAINTE ───────────
 * Sur cet appareil, il est la racine de TOUT : les réponses, les notes, les noms
 * et courriels d'interviewés, et le jeton de rafraîchissement de 30 jours — donc
 * un accès au serveur. Un iPad volé livre `sel`, `parametres` et `dekEnveloppee`
 * à qui sait ouvrir IndexedDB : l'attaque se poursuit HORS LIGNE, au rythme de
 * l'attaquant, et aucun compteur d'essais côté écran n'y changerait quoi que ce
 * soit. Le seul rempart est le coût par essai (61 ms mesurés) MULTIPLIÉ par
 * l'entropie du mot de passe. `deriverKek` ne refusait que la chaîne vide : un
 * mot de passe d'UN caractère créait un coffre (mesuré par A51).
 *
 * ── LÀ OÙ ELLE S'APPLIQUE, ET LÀ OÙ ELLE NE S'APPLIQUE JAMAIS ───────────────
 * À la CRÉATION du coffre et au CHANGEMENT de mot de passe — c'est-à-dire au
 * moment où l'auditeur choisit. **Jamais au déverrouillage** : une politique
 * appliquée à l'ouverture d'un coffre existant ne renforce rien et interdirait
 * l'accès à des données déjà chiffrées. Un durcissement futur de la politique ne
 * doit jamais rendre une base illisible (invariant 7).
 *
 * Le seuil n'est pas inventé ici : `MOT_DE_PASSE_LONGUEUR_MIN` de
 * `@axion/shared` transcrit 06 §10.1 (« 12+ caractères »), et l'API l'applique
 * déjà. Le terrain applique le même, et ce n'est plus une réserve de spec : la
 * question « le mot de passe du coffre local est-il celui du compte ? » est
 * TRANCHÉE — `DECISIONS.md`, entrée du 2026-09-04, arbitrage A01 : **oui**. La
 * preuve y est tirée du pack et non d'une préférence : le 07 §14 traite le risque
 * « reset de mot de passe pendant une mission hors ligne » par « garde-fou serveur
 * §9.7 **+ ré-enveloppement de la DEK en ligne** », et ré-envelopper la DEK après
 * un reset n'a de sens que si la KEK dérive du mot de passe du COMPTE. L'import de
 * `MOT_DE_PASSE_LONGUEUR_MIN` est donc fondé, pas commode.
 */
export function verifierPolitiqueMotDePasse(motDePasse: string): void {
  if (motDePasse.length < MOT_DE_PASSE_LONGUEUR_MIN) {
    throw new MotDePasseTropCourtError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERREURS — chacune dit une CAUSE et une ACTION (03 §17.6, §33.2)
// ─────────────────────────────────────────────────────────────────────────────
/** Le coffre est fermé : la DEK n'est plus en mémoire (verrou 05 §9.7). */
export class CoffreVerrouilleError extends Error {
  override readonly name = 'CoffreVerrouilleError';
  constructor() {
    super(
      'Le coffre est verrouillé. Saisissez votre mot de passe pour reprendre la collecte — vos données sont en sécurité sur l’appareil.',
    );
  }
}

/** Mot de passe faux, ou enveloppe de DEK altérée. Les deux se ressemblent, et c'est voulu. */
export class MotDePasseInvalideError extends Error {
  override readonly name = 'MotDePasseInvalideError';
  constructor() {
    super('Mot de passe incorrect. Aucune donnée locale n’a été modifiée.');
  }
}

/**
 * Anomalie du coffre AU REPOS — la famille d'erreurs qui doit conduire à une page
 * d'anomalie, JAMAIS à une ré-initialisation.
 *
 * Verdict A51, F-22 : `lireCoffreAuRepos` rendait `null` aussi bien pour un coffre
 * ABSENT que pour un coffre ILLISIBLE ; la coquille affichait alors « Préparer cet
 * appareil » et le mot de passe de l'auditeur détruisait sa propre DEK. Ces deux
 * états sont distincts et le restent désormais sur TOUT le chemin — lecture,
 * initialisation, phase de la coquille, écran. Une anomalie porte donc une CAUSE
 * (le message) ET une ACTION (03 §17.6, §33.2), et l'action ne propose jamais de
 * repartir de zéro : ce serait proposer d'effacer la journée de collecte.
 */
export abstract class AnomalieCoffreError extends Error {
  /** Ce que l'auditeur doit faire — et ce qu'il ne doit surtout pas faire. */
  abstract readonly action: string;
}

/**
 * L'action commune à toutes les anomalies de coffre : ne rien recréer, signaler.
 *
 * Le premier réflexe devant un appareil qui ne s'ouvre pas est de « repartir
 * propre ». C'est précisément le geste qui rend les données définitivement
 * illisibles, et l'écran doit le dire avant que l'auditeur ne le pense.
 */
const ACTION_ANOMALIE_COFFRE =
  'Ne créez PAS de nouvelle protection sur cet appareil : les données qui s’y trouvent deviendraient définitivement illisibles. ' +
  'Signalez cette anomalie au siège sans recharger ni réinstaller, et poursuivez la collecte sur un autre appareil si vous devez collecter maintenant.';

/**
 * Une ligne de coffre EXISTE mais cette version de l'application ne sait pas la
 * lire. Ce n'est ni un coffre absent, ni un mauvais mot de passe.
 *
 * Le déclencheur le plus probable n'est pas un attaquant : c'est une écriture
 * partielle sur une tablette qui s'éteint, un quota atteint en pleine écriture de
 * `meta`, ou une version future qui ajoute un champ requis au schéma du coffre.
 * D'où le ton : la donnée est là, elle n'a pas été touchée, et personne ne doit
 * la « réparer » en la remplaçant.
 */
export class CoffreIllisibleError extends AnomalieCoffreError {
  override readonly name = 'CoffreIllisibleError';
  override readonly action = ACTION_ANOMALIE_COFFRE;
  constructor(detail: string) {
    super(
      `Cet appareil porte bien un coffre, mais l’application ne sait pas le lire : ${detail}. Aucune donnée locale n’a été supprimée ni modifiée.`,
    );
  }
}

/**
 * Les paramètres de dérivation enregistrés sortent des bornes admises (F-25).
 *
 * Le coffre est lisible ; ce sont ses paramètres qui demandent plus que ce que
 * l'application accepte d'exécuter. Le dire ainsi, et non « illisible », est ce
 * qui permettra à quelqu'un de comprendre en une lecture ce qui s'est passé.
 */
export class ParametresKdfHorsBornesError extends AnomalieCoffreError {
  override readonly name = 'ParametresKdfHorsBornesError';
  override readonly action = ACTION_ANOMALIE_COFFRE;
  constructor(detail: string) {
    super(
      `Les paramètres de chiffrement enregistrés sur cet appareil sortent de ce que l’application accepte (${detail}). Aucune donnée locale n’a été supprimée ni modifiée.`,
    );
  }
}

/**
 * L'ouverture du coffre a échoué sur une panne TECHNIQUE du chiffrement — le
 * dernier filet de F-25, posé par la revue A29 (R1).
 *
 * ── POURQUOI UN FILET EN PLUS DES BORNES ────────────────────────────────────
 * `verifierParametresKdf` transcrit les refus d'Argon2id et d'AES *connus au
 * 2026-09-05*. Mais tout ce qui sert à ouvrir un coffre est relu du stockage —
 * le sel autant que les paramètres —, et une bibliothèque a le droit d'ajouter
 * un refus demain sans nous prévenir. Ce que ce filet garantit ne dépend donc
 * d'aucune liste tenue à jour : **aucune erreur technique brute n'atteint
 * l'écran** (03 §17.6), et **l'auditeur reçoit toujours l'action** « ne créez PAS
 * de nouvelle protection » — celle qui, sur cette famille de pannes, est la seule
 * chose qui empêche la destruction. A29 l'a mesuré sur un coffre trafiqué :
 * `deverrouiller(base, bonMotDePasse)` rendait `DataError: Invalid key length`,
 * en anglais, sans action, sur un appareil définitivement fermé.
 *
 * ── CE QUI EST DIT, ET CE QUI NE L'EST PAS ──────────────────────────────────
 * Le message est en français et ne cite AUCUN détail technique. L'erreur
 * d'origine n'est pas perdue pour autant : elle voyage dans `cause` (option
 * standard d'`Error`), atteignable pour un diagnostic, jamais affichée. C'est la
 * même doctrine que partout ici — les CHEMINS, jamais les VALEURS.
 */
export class CoffreInexploitableError extends AnomalieCoffreError {
  override readonly name = 'CoffreInexploitableError';
  override readonly action = ACTION_ANOMALIE_COFFRE;
  constructor(cause: unknown) {
    super(
      'Cet appareil porte bien un coffre, mais son ouverture a échoué : le chiffrement enregistré ici ne peut pas être exécuté par cette version de l’application. Aucune donnée locale n’a été supprimée ni modifiée.',
      { cause },
    );
  }
}

/** Le mot de passe choisi est trop court pour protéger quoi que ce soit (F-23). */
export class MotDePasseTropCourtError extends Error {
  override readonly name = 'MotDePasseTropCourtError';
  constructor() {
    super(
      `Choisissez un mot de passe d’au moins ${String(MOT_DE_PASSE_LONGUEUR_MIN)} caractères : sur cet appareil, il protège à lui seul les données d’audit et l’accès au siège. Aucune donnée locale n’a été modifiée.`,
    );
  }
}

/** Une ligne déchiffrée ne respecte pas son schéma : donnée corrompue, jamais ignorée. */
export class DonneeLocaleCorrompueError extends Error {
  override readonly name = 'DonneeLocaleCorrompueError';
  constructor(detail: string) {
    super(
      `Une donnée locale est illisible et n’a PAS été supprimée : ${detail}. Exportez une sauvegarde de secours et signalez-le avant de continuer.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DÉRIVATION ET ENVELOPPEMENT
// ─────────────────────────────────────────────────────────────────────────────
/** Un sel neuf, tiré du CSPRNG du navigateur. Un sel par APPAREIL (05 §9.7). */
export function genererSel(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL_OCTETS));
}

/**
 * Dérive la KEK à partir du mot de passe et du sel de l'appareil (Argon2id).
 *
 * La clé rendue porte les usages `wrapKey`/`unwrapKey` ET `encrypt`/`decrypt` :
 * les deux premiers servent la DEK, les deux suivants servent le fichier de
 * secours `.axionbackup` (11 §4), dont la clé dérive DU MOT DE PASSE et non de la
 * DEK d'appareil — c'est ce qui le rend restaurable sur un second appareil.
 *
 * Elle est **non extractable** : rien, pas même ce module, ne peut la relire.
 */
export async function deriverKek(
  motDePasse: string,
  sel: Uint8Array,
  parametres: ParametresKdf = PARAMETRES_KDF_DEFAUT,
): Promise<CryptoKey> {
  if (motDePasse === '') {
    throw new MotDePasseInvalideError();
  }
  // Seconde ceinture de F-25 : quel que soit l'appelant — coffre au repos,
  // changement de mot de passe, futur `.axionbackup` —, aucun paramètre hors
  // bornes n'atteint `argon2id`. Le premier contrôle a lieu à la RELECTURE
  // (`coffre-appareil.ts`) ; celui-ci ferme les chemins qu'on n'a pas encore
  // écrits. La politique de longueur, elle, N'EST PAS ici : `deriverKek` sert
  // aussi à OUVRIR un coffre existant (voir `verifierPolitiqueMotDePasse`).
  verifierParametresKdf(parametres);
  const brut = await argon2id({
    password: motDePasse,
    salt: sel,
    memorySize: parametres.memoireKio,
    iterations: parametres.iterations,
    parallelism: parametres.parallelisme,
    hashLength: parametres.longueurOctets,
    outputType: 'binary',
  });
  // `Uint8Array.from` et non `brut` directement : `hash-wasm` rend un
  // `Uint8Array<ArrayBufferLike>`, que la signature de WebCrypto refuse (un tampon
  // partagé n'est pas une source de clé valide). La copie est de 32 octets.
  return crypto.subtle.importKey('raw', Uint8Array.from(brut), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
    'wrapKey',
    'unwrapKey',
  ]);
}

/**
 * Crée une DEK neuve ET son enveloppe sous la KEK — le premier embarquement d'un
 * appareil. La DEK rendue est déjà **non extractable** : la version extractable
 * qui a servi à l'enveloppement n'est jamais publiée hors de cette fonction.
 */
export async function creerDekEnveloppee(kek: CryptoKey): Promise<Enveloppe> {
  const dekExtractible = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: LONGUEUR_DEK_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
  return envelopper(dekExtractible, kek);
}

/**
 * Ré-enveloppe la DEK sous une nouvelle KEK — c'est TOUT ce que fait un changement
 * de mot de passe en ligne (05 §9.7 : « les données ne sont jamais re-chiffrées »).
 *
 * `LOT_L5.md` §3.3-③ rappelle la contrepartie, qui n'est pas dans ce fichier mais
 * doit être dite au même endroit : l'écran avertit quand l'outbox n'est pas vide,
 * parce que le garde-fou SERVEUR refusera la réinitialisation (05 §9.7, V2.9).
 * L'application terrain ne doit pas laisser croire le contraire.
 */
export async function reenvelopperDek(
  dekEnveloppee: Enveloppe,
  kekActuelle: CryptoKey,
  kekNouvelle: CryptoKey,
): Promise<Enveloppe> {
  const dek = await deballer(dekEnveloppee, kekActuelle, true);
  return envelopper(dek, kekNouvelle);
}

async function envelopper(dek: CryptoKey, kek: CryptoKey): Promise<Enveloppe> {
  const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
  const enveloppee = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: nonce,
  });
  return { v: VERSION_ENVELOPPE, n: versBase64(nonce), c: versBase64(new Uint8Array(enveloppee)) };
}

async function deballer(
  dekEnveloppee: Enveloppe,
  kek: CryptoKey,
  extractible: boolean,
): Promise<CryptoKey> {
  if (dekEnveloppee.v !== VERSION_ENVELOPPE) {
    throw new ErreurEnveloppe(
      `Enveloppe de clé en version ${String(dekEnveloppee.v)}, attendue ${String(VERSION_ENVELOPPE)}.`,
    );
  }
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      depuisBase64(dekEnveloppee.c),
      kek,
      { name: 'AES-GCM', iv: depuisBase64(dekEnveloppee.n) },
      { name: 'AES-GCM', length: LONGUEUR_DEK_BITS },
      extractible,
      ['encrypt', 'decrypt'],
    );
  } catch {
    // AES-GCM ne distingue pas « mauvaise clé » de « chiffré altéré » : les deux
    // sont un échec d'authentification. Ne pas prétendre le contraire à l'écran.
    throw new MotDePasseInvalideError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LE COFFRE OUVERT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Un coffre ouvert : la DEK, et les deux seules opérations qu'on en fait.
 *
 * Il n'expose PAS la clé. C'est délibéré : un `Coffre` peut circuler dans le
 * contexte React (`app/contexte.tsx`) sans qu'aucun écran ne puisse en extraire
 * de quoi déchiffrer ailleurs, ni l'écrire par mégarde dans un journal.
 */
export interface Coffre {
  /** `false` dès que `verrouiller()` a été appelé. */
  readonly ouvert: boolean;
  /** Chiffre une valeur JSON-sérialisable. Rendu : une `Enveloppe`. */
  chiffrer(valeur: unknown): Promise<Enveloppe>;
  /**
   * Déchiffre PUIS valide contre un schéma Zod. Les deux, toujours : une donnée
   * déchiffrée qui ne respecte plus sa forme est corrompue, et la traiter comme
   * valide propagerait la corruption dans la sync (invariant 7).
   */
  dechiffrer<T>(enveloppe: Enveloppe, schema: ZodType<T>): Promise<T>;
  /**
   * Ferme le coffre : la référence à la DEK est lâchée et le coffre devient
   * inutilisable. **Aucun code JavaScript ne peut effacer la mémoire d'une
   * `CryptoKey`** — c'est le moteur qui la détient, hors du tas JS. Ce que cette
   * méthode garantit, et c'est ce qui compte pour 05 §9.7, c'est qu'après elle
   * plus AUCUN chemin de code de l'application n'atteint la clé.
   */
  verrouiller(): void;
}

/**
 * Ouvre le coffre : déballe la DEK sous la KEK. La DEK obtenue est **non
 * extractable** — elle ne peut plus jamais être relue, seulement utilisée.
 */
export async function ouvrirCoffre(kek: CryptoKey, dekEnveloppee: Enveloppe): Promise<Coffre> {
  const dekInitiale = await deballer(dekEnveloppee, kek, false);
  let dek: CryptoKey | null = dekInitiale;

  const clef = (): CryptoKey => {
    if (dek === null) throw new CoffreVerrouilleError();
    return dek;
  };

  return {
    get ouvert() {
      return dek !== null;
    },

    async chiffrer(valeur: unknown): Promise<Enveloppe> {
      const cle = clef();
      const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
      const clair = new TextEncoder().encode(JSON.stringify(valeur ?? null));
      const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cle, clair);
      return {
        v: VERSION_ENVELOPPE,
        n: versBase64(nonce),
        c: versBase64(new Uint8Array(chiffre)),
      };
    },

    async dechiffrer<T>(enveloppe: Enveloppe, schema: ZodType<T>): Promise<T> {
      const cle = clef();
      if (enveloppe.v !== VERSION_ENVELOPPE) {
        throw new ErreurEnveloppe(
          `Enveloppe en version ${String(enveloppe.v)}, attendue ${String(VERSION_ENVELOPPE)}.`,
        );
      }
      let clair: ArrayBuffer;
      try {
        clair = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: depuisBase64(enveloppe.n) },
          cle,
          depuisBase64(enveloppe.c),
        );
      } catch {
        throw new DonneeLocaleCorrompueError('le chiffré ne s’authentifie pas');
      }
      let brut: unknown;
      try {
        brut = JSON.parse(new TextDecoder().decode(clair));
      } catch {
        throw new DonneeLocaleCorrompueError('le contenu déchiffré n’est pas du JSON');
      }
      const verdict = schema.safeParse(brut);
      if (!verdict.success) {
        // Le message d'erreur Zod cite les CHEMINS, jamais les VALEURS : 11 §2
        // interdit toute donnée personnelle dans un journal, et une exception
        // finit toujours par être journalisée quelque part.
        const chemins = verdict.error.issues.map((i) => i.path.join('.')).join(', ');
        throw new DonneeLocaleCorrompueError(`forme inattendue sur : ${chemins || '(racine)'}`);
      }
      return verdict.data;
    },

    verrouiller(): void {
      dek = null;
    },
  };
}

/**
 * Crée un coffre NEUF sous une KEK donnée : une DEK fraîche, son enveloppe, et le
 * coffre déjà ouvert dessus.
 *
 * ── POURQUOI CETTE FABRIQUE EXISTE, EN PLUS D'`ouvrirCoffre` ────────────────
 * `ouvrirCoffre` OUVRE un coffre existant : elle exige une enveloppe de DEK, donc
 * un appareil déjà préparé. Créer un coffre neuf demandait jusqu'ici d'enchaîner
 * `creerDekEnveloppee` puis `ouvrirCoffre` — deux appels et un invariant implicite
 * (la même KEK des deux côtés) que chaque appelant devait retenir. Ici, il est
 * porté par la fonction.
 *
 * `coffre-appareil.ts` s'en sert pour le premier déverrouillage ; elle est aussi
 * ce qui permet d'exercer le coffre SANS `meta` ni IndexedDB, ce qu'un test de
 * crypto doit pouvoir faire (`LOT_L5.md` §4 : les tests de coffre sont écrits
 * AVANT le code, et ils ne testent pas Dexie).
 *
 * La signature d'`ouvrirCoffre` n'est pas touchée : c'est elle qui est publiée
 * (`LOT_L5.md` §2), celle-ci s'ajoute à côté.
 */
export async function creerCoffreNeuf(
  kek: CryptoKey,
): Promise<{ coffre: Coffre; dekEnveloppee: Enveloppe }> {
  const dekEnveloppee = await creerDekEnveloppee(kek);
  return { coffre: await ouvrirCoffre(kek, dekEnveloppee), dekEnveloppee };
}
