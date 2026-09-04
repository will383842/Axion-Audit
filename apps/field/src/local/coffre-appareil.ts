// =============================================================================
// LE COFFRE DE CET APPAREIL — persistance du sel, des paramètres et de la DEK
//
// `coffre.ts` fait la cryptographie et ne connaît pas la base ; ce module fait le
// lien avec `meta`, et rien d'autre. La séparation est ce qui rend `coffre.ts`
// testable sans IndexedDB, donc testable vite, donc testé (`LOT_L5.md` §4 : les
// tests de coffre sont écrits AVANT le code, par A26).
//
// ── CE QUI EST STOCKÉ, ET POURQUOI CE N'EST PAS UN SECRET ────────────────────
// Le sel, les paramètres Argon2id et la DEK **enveloppée**. Aucun des trois ne
// permet de déchiffrer quoi que ce soit sans le mot de passe : c'est toute
// l'architecture du 05 §9.7 (« la KEK n'est tenue qu'en mémoire de session — un
// portable volé ne livre pas les données d'un client grand compte en clair »).
// Les paramètres sont stockés AVEC la DEK et non lus d'une constante : le jour où
// `PARAMETRES_KDF_DEFAUT` change, un coffre créé hier doit continuer à s'ouvrir.
//
// ── « ABSENT » ET « ILLISIBLE » SONT DEUX ÉTATS, ET LE RESTENT ──────────────
// Verdict A51 du 2026-09-04, constat F-22 (CRITIQUE) : `lireCoffreAuRepos`
// rendait `null` pour un coffre absent COMME pour un coffre illisible. La coquille
// en déduisait « premier usage », affichait « Préparer cet appareil », et le mot de
// passe de l'auditeur écrasait l'enveloppe de son ANCIENNE DEK. Mesuré de bout en
// bout : toutes les lignes restaient là — l'invariant 7 tenu à la lettre — et plus
// rien n'était lisible, définitivement, même avec le bon mot de passe.
//
// Le déclencheur n'a pas besoin d'un attaquant : n'importe quel échec de
// `safeParse` suffit — une écriture partielle sur une tablette qui s'éteint, un
// quota atteint, ou une version future qui ajoute un champ requis au schéma. Ce
// jour-là, TOUS les appareils en mission liraient leur coffre comme « absent ».
//
// Trois règles en découlent, et elles ne se négocient pas :
//   1. `lireCoffreAuRepos` rend `null` pour ABSENT et **lève** pour illisible —
//      exactement la doctrine que `jetons.ts` avait déjà écrite pour lui-même ;
//   2. `initialiserCoffre` refuse dès qu'une ligne `meta.coffre` EXISTE, quelle
//      que soit sa lisibilité — et refuse aussi de « préparer » un appareil qui
//      porte déjà des données (seconde ceinture) ;
//   3. l'appelant route l'anomalie vers un écran d'erreur, jamais vers un écran
//      de création (`app/contexte.tsx`).
//
// ── LE GARDE-FOU DU 05 §9.7, CÔTÉ TERRAIN ────────────────────────────────────
// Un changement de mot de passe est un ré-enveloppement, jamais un re-chiffrement.
// Mais le SERVEUR refuse une réinitialisation tant que le dernier
// `sync_log.outbox_remaining` connu est > 0 (05 §9.7, V2.9). L'app terrain ne doit
// pas laisser croire le contraire : `etatAvantChangementDeMotDePasse` compte la
// file RÉELLE, et l'écran avertit avant d'agir (`LOT_L5.md` §3.3-③).
//
// Traçabilité : E33 (sécurité / RGPD).
// =============================================================================
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { CLES_META, ecrireMeta, lireMeta, type BaseLocale } from './base.js';
import {
  CoffreIllisibleError,
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  ouvrirCoffre,
  PARAMETRES_KDF_DEFAUT,
  reenvelopperDek,
  verifierParametresKdf,
  verifierPolitiqueMotDePasse,
  AnomalieCoffreError,
  type Coffre,
  type ParametresKdf,
} from './coffre.js';
import { depuisBase64, enveloppeSchema, versBase64 } from './enveloppe.js';

const parametresKdfSchema = z.object({
  algo: z.literal('argon2id'),
  memoireKio: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelisme: z.number().int().positive(),
  longueurOctets: z.number().int().positive(),
});

const coffreAuReposSchema = z.object({
  /** Sel de dérivation, base64. Un sel par APPAREIL (05 §9.7). */
  sel: z.string().min(1),
  parametres: parametresKdfSchema,
  dekEnveloppee: enveloppeSchema,
});

export type CoffreAuRepos = z.infer<typeof coffreAuReposSchema>;

/**
 * Le coffre de cet appareil, ou `null`.
 *
 * **`null` veut dire ABSENT, et rien d'autre.** Une ligne `meta.coffre` présente
 * mais que le schéma refuse LÈVE une `CoffreIllisibleError` ; des paramètres de
 * dérivation hors bornes lèvent une `ParametresKdfHorsBornesError` (F-25). Rendre
 * `null` dans l'un de ces cas ferait dire « appareil neuf » à un appareil qui
 * porte une journée de collecte — et la suite est écrite en tête de fichier.
 *
 * La règle est celle que `jetons.ts` s'était déjà appliquée à lui-même : la
 * doctrine existait, elle n'avait simplement pas été appliquée au coffre.
 */
export async function lireCoffreAuRepos(base: BaseLocale): Promise<CoffreAuRepos | null> {
  const brut = await lireMeta(base, CLES_META.coffre);
  if (brut === undefined || brut === null) return null;

  const verdict = coffreAuReposSchema.safeParse(brut);
  if (!verdict.success) {
    // Les CHEMINS, jamais les VALEURS (11 §2) : un message d'erreur ne republie
    // pas le contenu de `meta`, fût-il chiffré.
    const chemins = verdict.error.issues
      .map((probleme) => probleme.path.join('.'))
      .filter((chemin) => chemin.length > 0);
    throw new CoffreIllisibleError(
      chemins.length > 0
        ? `sa forme n’est pas celle attendue sur : ${[...new Set(chemins)].join(', ')}`
        : 'sa forme n’est pas celle attendue',
    );
  }

  verifierParametresKdf(verdict.data.parametres);
  return verdict.data;
}

/**
 * Y a-t-il déjà de la collecte sur cet appareil ? — seconde ceinture de F-22.
 *
 * On ne « prépare » pas un appareil qui porte déjà des données : si les tables
 * miroirs ou l'outbox ne sont pas vides alors qu'aucun coffre n'est enregistré,
 * quelque chose s'est passé qu'aucun mot de passe ne réparera, et créer une DEK
 * neuve rendrait ces lignes illisibles pour toujours. Compter coûte deux
 * millisecondes sur un appareil neuf, où tout est à zéro.
 */
async function compterDonneesLocales(base: BaseLocale): Promise<number> {
  const comptes = await Promise.all([
    base.missions.count(),
    base.missionQuestions.count(),
    base.orgUnits.count(),
    base.interviews.count(),
    base.answers.count(),
    base.attachments.count(),
    base.workAssignments.count(),
    base.outbox.count(),
  ]);
  return comptes.reduce((total, compte) => total + compte, 0);
}

/** Des données locales, mais aucun coffre pour les ouvrir : on ne recrée rien. */
export class DonneesSansCoffreError extends AnomalieCoffreError {
  override readonly name = 'DonneesSansCoffreError';
  override readonly action =
    'Ne créez PAS de protection sur cet appareil : ces enregistrements deviendraient définitivement illisibles. ' +
    'Signalez-le au siège avant toute autre manœuvre, et poursuivez la collecte sur un autre appareil.';
  constructor(lignes: number) {
    super(
      `Cet appareil porte déjà ${String(lignes)} enregistrement(s) locaux alors qu’aucun coffre n’y est enregistré. Rien n’a été supprimé ni modifié.`,
    );
  }
}

/**
 * Premier déverrouillage d'un appareil : crée le sel, dérive la KEK, tire une DEK
 * neuve et range son enveloppe. Rend le coffre OUVERT.
 *
 * N'écrase JAMAIS un coffre : écraser, ce serait rendre illisibles toutes les
 * données locales — la forme la plus brutale de l'écrasement silencieux que
 * l'invariant 7 interdit. La garde porte sur la PRÉSENCE de la ligne `meta.coffre`
 * et non sur sa lisibilité (F-22) : une ligne illisible fait lever, jamais tirer un
 * sel neuf. Quand la ligne est présente et lisible, l'appel est un déverrouillage
 * ordinaire — un mot de passe faux y est refusé comme partout ailleurs.
 */
export async function initialiserCoffre(
  base: BaseLocale,
  motDePasse: string,
  parametres: ParametresKdf = PARAMETRES_KDF_DEFAUT,
): Promise<Coffre> {
  const ligneExistante = await lireMeta(base, CLES_META.coffre);
  if (ligneExistante !== undefined && ligneExistante !== null) {
    // `deverrouiller` relit par `lireCoffreAuRepos`, qui lèvera si la ligne est
    // illisible : c'est le seul chemin, et il ne crée rien.
    return deverrouiller(base, motDePasse);
  }

  const lignesLocales = await compterDonneesLocales(base);
  if (lignesLocales > 0) {
    throw new DonneesSansCoffreError(lignesLocales);
  }

  verifierPolitiqueMotDePasse(motDePasse);
  const sel = genererSel();
  const kek = await deriverKek(motDePasse, sel, parametres);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);
  const auRepos: CoffreAuRepos = { sel: versBase64(sel), parametres, dekEnveloppee };
  await ecrireMeta(base, CLES_META.coffre, auRepos);

  // L'identifiant d'appareil naît en même temps que le coffre : `lotPushSchema`
  // l'exige (11 §4) et l'en-tête `.axionbackup` le nomme `device_label`.
  if ((await lireMeta(base, CLES_META.appareil)) === undefined) {
    await ecrireMeta(base, CLES_META.appareil, uuidv7());
  }

  return coffre;
}

export class CoffreAbsentError extends Error {
  override readonly name = 'CoffreAbsentError';
  constructor() {
    super(
      'Aucune donnée locale sur cet appareil. Connectez-vous une première fois pour embarquer une mission.',
    );
  }
}

/**
 * Déverrouillage : dérive la KEK depuis le mot de passe et ouvre le coffre.
 *
 * Aucun réseau n'est requis — c'est la condition du 05 §31-3 (« le déverrouillage
 * local continue de fonctionner » même refresh token expiré) et de l'invariant 1.
 */
export async function deverrouiller(base: BaseLocale, motDePasse: string): Promise<Coffre> {
  const auRepos = await lireCoffreAuRepos(base);
  if (auRepos === null) throw new CoffreAbsentError();
  const kek = await deriverKek(motDePasse, depuisBase64(auRepos.sel), auRepos.parametres);
  return ouvrirCoffre(kek, auRepos.dekEnveloppee);
}

export interface EtatAvantChangement {
  /** Nombre d'opérations encore en file — la donnée du garde-fou 05 §9.7 (V2.9). */
  readonly operationsEnAttente: number;
  /** L'avertissement à afficher, ou `null` s'il n'y a rien à craindre. */
  readonly avertissement: string | null;
}

/**
 * Ce qu'il faut dire à l'auditeur AVANT de changer son mot de passe.
 *
 * Le changement local (ré-enveloppement) réussirait de toute façon ; c'est la
 * RÉINITIALISATION côté serveur que 05 §9.7 bloque. Annoncer « c'est fait » quand
 * le serveur refusera est précisément le mensonge que `LOT_L5.md` §3.3 interdit.
 */
export async function etatAvantChangementDeMotDePasse(
  base: BaseLocale,
): Promise<EtatAvantChangement> {
  const operationsEnAttente = await base.outbox.where('statut').equals('en_attente').count();
  return {
    operationsEnAttente,
    avertissement:
      operationsEnAttente > 0
        ? `${String(operationsEnAttente)} élément(s) de collecte ne sont pas encore synchronisés. ` +
          'Synchronisez d’abord : tant qu’ils sont en attente, une réinitialisation de mot de passe par un administrateur est refusée par le serveur, et le rétablir de force exposerait ces données à une perte.'
        : null,
  };
}

/**
 * Changement de mot de passe EN LIGNE (05 §9.7) : ré-enveloppement de la DEK.
 *
 * Les données ne sont pas touchées — c'est la propriété qui rend l'opération
 * instantanée sur une mission de 5 000 réponses, et c'est aussi pourquoi elle ne
 * peut pas servir de réparation : un coffre dont la DEK est perdue reste perdu.
 */
export async function changerMotDePasse(
  base: BaseLocale,
  ancienMotDePasse: string,
  nouveauMotDePasse: string,
  parametres: ParametresKdf = PARAMETRES_KDF_DEFAUT,
): Promise<Coffre> {
  const auRepos = await lireCoffreAuRepos(base);
  if (auRepos === null) throw new CoffreAbsentError();

  // La politique porte sur le mot de passe CHOISI, jamais sur l'ancien : refuser
  // l'ancien reviendrait à interdire de corriger un mot de passe trop court.
  verifierPolitiqueMotDePasse(nouveauMotDePasse);

  const kekActuelle = await deriverKek(
    ancienMotDePasse,
    depuisBase64(auRepos.sel),
    auRepos.parametres,
  );
  // Sel NEUF : réutiliser l'ancien laisserait un attaquant qui aurait capté
  // l'ancienne enveloppe attaquer les deux mots de passe avec le même précalcul.
  const selNouveau = genererSel();
  const kekNouvelle = await deriverKek(nouveauMotDePasse, selNouveau, parametres);
  const dekEnveloppee = await reenvelopperDek(auRepos.dekEnveloppee, kekActuelle, kekNouvelle);

  await ecrireMeta(base, CLES_META.coffre, {
    sel: versBase64(selNouveau),
    parametres,
    dekEnveloppee,
  } satisfies CoffreAuRepos);

  return ouvrirCoffre(kekNouvelle, dekEnveloppee);
}
