// =============================================================================
// VÉRIFICATION DES MOTS DE PASSE — Argon2id (06 §10.1). Lot L2, tâche T2.
//
// « Hachage Argon2id » (06 §10.1) ; `hash-wasm` est la bibliothèque épinglée
// (11 §1) et le seed du lot L1 s'en sert DÉJÀ pour frapper l'empreinte du compte
// fondateur (`apps/api/scripts/seed.mjs`). Les paramètres ci-dessous sont RELEVÉS
// DE LÀ, pas réinventés : une vérification qui n'emploie pas les mêmes primitives
// que la frappe ne vérifie rien.
//
// ── LE FORMAT PHC PORTE SES PROPRES PARAMÈTRES ────────────────────────────────
// Le seed produit `outputType: 'encoded'`, c'est-à-dire
// `$argon2id$v=19$m=19456,t=3,p=1$<sel>$<empreinte>`. Le sel ET les paramètres
// voyagent AVEC l'empreinte : `argon2Verify` les relit et n'a besoin d'aucune
// configuration extérieure. Conséquence directe, et c'est une propriété qu'on veut
// garder : le jour où l'on durcira les paramètres, les empreintes existantes
// continueront de se vérifier avec les leurs.
//
// ── CE QUE CE MODULE PROTÈGE, ET QUI N'EST PAS ÉVIDENT ────────────────────────
// L'absence d'oracle ne se joue pas seulement sur le code d'erreur rendu : elle se
// joue aussi sur le TEMPS. Un compte inexistant qui répondrait en 1 ms là où un mot
// de passe faux répond en 40 ms énumère les comptes aussi sûrement qu'un message
// « adresse inconnue ». D'où `consommerLeTempsDUneVerification` — voir son
// commentaire, qui dit aussi ce qu'elle ne garantit pas.
// Traçabilité : E33 (sécurité : secrets hors code, Argon2id 06 §10.1).
// =============================================================================
import { randomBytes } from 'node:crypto';
import { argon2Verify, argon2id } from 'hash-wasm';

/**
 * Paramètres OWASP « m=19 MiB, t≥2, p=1 », relevés à t=3 — IDENTIQUES à ceux du
 * seed (`apps/api/scripts/seed.mjs`, bloc du compte fondateur).
 *
 * Ils ne servent QUE pour l'empreinte-leurre ci-dessous : une vérification lit les
 * siens dans le PHC. Ils sont donc ici pour que le leurre coûte EXACTEMENT ce que
 * coûte une vérification réelle, et pour aucune autre raison.
 */
export const PARAMETRES_ARGON2ID = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19456,
  hashLength: 32,
} as const;

/**
 * Empreinte jetable, calculée UNE FOIS, sur un mot de passe aléatoire que personne
 * — pas même ce processus — ne connaît. Aucun mot de passe ne peut la satisfaire.
 * Elle n'est PAS un secret : elle ne protège rien et n'ouvre rien. Elle sert
 * uniquement à faire consommer à Argon2id le même travail qu'une vérification réelle.
 *
 * `Promise` mémorisée plutôt que valeur : deux connexions simultanées ne doivent pas
 * déclencher deux calculs de 19 Mio.
 */
let empreinteLeurre: Promise<string> | null = null;

function empreinteDeLeurre(): Promise<string> {
  empreinteLeurre ??= argon2id({
    // 32 octets d'aléa : le « mot de passe » du leurre. Il n'est jamais conservé.
    password: randomBytes(32),
    salt: randomBytes(16),
    ...PARAMETRES_ARGON2ID,
    outputType: 'encoded',
  });
  return empreinteLeurre;
}

/**
 * PRÉCHAUFFAGE — appelé à l'enregistrement des routes d'auth, jamais sur requête.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UNE OPTIMISATION : C'EST LA CORRECTION D'UN ORACLE, ET IL A ÉTÉ MESURÉ.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sans cet appel, le leurre est fabriqué PARESSEUSEMENT, à la première tentative de
 * connexion sur un compte inexistant. Cette première tentative-là paie donc DEUX
 * travaux Argon2id — la fabrication du leurre PUIS sa vérification — au lieu d'un.
 * Mesuré au banc d'injection : 450 ms pour « compte inexistant » contre 203 ms pour
 * « compte désactivé », soit un rapport de 2,2. Un attaquant qui frappe une API
 * fraîchement démarrée lisait donc « ce compte n'existe pas » dans le chronomètre —
 * exactement l'énumération que le leurre existe pour empêcher.
 *
 * Le préchauffage déplace ce coût au DÉMARRAGE, où il n'est observable par personne,
 * et charge au passage le module WebAssembly (seconde source de lenteur du premier
 * appel). Après quoi les quatre chemins de refus coûtent la même chose : un SELECT
 * et un Argon2id.
 */
export async function prechaufferVerificationMotDePasse(): Promise<void> {
  await empreinteDeLeurre();
}

/**
 * Fait travailler Argon2id AUTANT qu'une vérification réelle, puis jette le
 * résultat. Appelée quand il n'y a rien à vérifier — compte inexistant, ou empreinte
 * stockée illisible.
 *
 * ── CE QUE ÇA GARANTIT ────────────────────────────────────────────────────────
 * Les deux chemins (« compte inconnu » et « mot de passe faux ») exécutent le même
 * travail dominant : un Argon2id à 19 Mio et 3 passes. L'écart de temps mesurable
 * entre eux cesse d'être un signal exploitable.
 *
 * ── CE QUE ÇA NE GARANTIT PAS, ET QU'IL FAUT SAVOIR ───────────────────────────
 * Ce n'est PAS du temps constant au sens cryptographique. Il reste une différence
 * de quelques dizaines de microsecondes (un aller-retour en base en moins d'un
 * côté, une comparaison de chaînes de l'autre) noyée dans plusieurs dizaines de
 * millisecondes d'Argon2id. On supprime l'ordre de grandeur, pas le bruit.
 */
export async function consommerLeTempsDUneVerification(motDePasse: string): Promise<void> {
  try {
    await argon2Verify({ password: motDePasse, hash: await empreinteDeLeurre() });
  } catch {
    // Le leurre est fabriqué ici même : il ne peut pas être malformé. Ce `catch`
    // existe pour qu'une panne de la bibliothèque WASM ne transforme JAMAIS une
    // tentative de connexion refusée en erreur 500 — laquelle serait, elle, un
    // oracle parfaitement lisible.
  }
}

/**
 * Vérifie un mot de passe contre une empreinte au format PHC.
 *
 * Rend `false` — jamais une exception — quand l'empreinte stockée est illisible
 * (fixture de test `'argon2-factice'`, ligne importée d'un autre système, colonne
 * corrompue). Un tel compte doit se comporter EXACTEMENT comme un mot de passe
 * faux : même code, même message, et — grâce au leurre — même temps de réponse.
 * Sans cela, une empreinte malformée répondrait instantanément et signalerait
 * « ce compte-là est particulier ».
 */
export async function verifierMotDePasse(motDePasse: string, empreinte: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: motDePasse, hash: empreinte });
  } catch {
    await consommerLeTempsDUneVerification(motDePasse);
    return false;
  }
}
