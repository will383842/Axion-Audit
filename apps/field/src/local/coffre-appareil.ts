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
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  ouvrirCoffre,
  PARAMETRES_KDF_DEFAUT,
  reenvelopperDek,
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

/** Le coffre existe-t-il déjà sur cet appareil ? */
export async function lireCoffreAuRepos(base: BaseLocale): Promise<CoffreAuRepos | null> {
  const brut = await lireMeta(base, CLES_META.coffre);
  if (brut === undefined || brut === null) return null;
  const verdict = coffreAuReposSchema.safeParse(brut);
  return verdict.success ? verdict.data : null;
}

/**
 * Premier déverrouillage d'un appareil : crée le sel, dérive la KEK, tire une DEK
 * neuve et range son enveloppe. Rend le coffre OUVERT.
 *
 * Ne fait rien si un coffre existe déjà : écraser un coffre, ce serait rendre
 * illisibles toutes les données locales — la forme la plus brutale de l'écrasement
 * silencieux que l'invariant 7 interdit.
 */
export async function initialiserCoffre(
  base: BaseLocale,
  motDePasse: string,
  parametres: ParametresKdf = PARAMETRES_KDF_DEFAUT,
): Promise<Coffre> {
  const existant = await lireCoffreAuRepos(base);
  if (existant !== null) {
    return deverrouiller(base, motDePasse);
  }

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
