// =============================================================================
// EXPORT ET IMPORT DE SECOURS `.axionbackup` — 05 §9.7, 11 §4, invariant 8
//
// ── CE QUE CETTE FONCTION EST, ET CE QU'ELLE N'EST PAS ──────────────────────
// C'est la parade au vol, à la casse et à la perte HORS LIGNE (05 §9.7). Ce
// n'est PAS une synchronisation : elle ne touche jamais le réseau, elle
// fonctionne en mode avion, et c'est sa raison d'être. `LOT_L5.md` §3.6 le dit
// sans détour — le port de sync est inerte tant que L6a n'a pas livré, mais
// « l'export `.axionbackup`, lui, fonctionne SANS réseau ». Le bouton « Fin de
// journée » ne pourrait pas exister autrement.
//
// ── LA DÉCISION CENTRALE : DÉCHIFFRER PUIS RE-CHIFFRER ──────────────────────
// 11 §4 : la clé dérive du « **MOT DE PASSE utilisateur** (PAS de la DEK
// appareil — le sel est dans le header) ». Les lignes locales sont chiffrées
// sous la DEK de CET appareil ; les recopier telles quelles donnerait un fichier
// que seul l'appareil perdu saurait relire. L'export les déchiffre donc sous la
// DEK, puis chiffre l'ENSEMBLE sous une clé neuve dérivée du mot de passe et
// d'un sel tiré au hasard, écrit en clair dans l'en-tête.
//
// Conséquence à dire, parce qu'elle est le prix de la propriété qu'on achète :
// **le clair de toute la mission transite en mémoire pendant l'export.** Il n'y
// a pas de contournement — un fichier restaurable ailleurs suppose qu'on
// re-chiffre sous une clé qui n'appartient pas à l'appareil. Le coffre n'est
// jamais approché autrement que par son interface publique ; `coffre.ts` n'est
// pas touché.
//
// ── L'IMPORT PASSE PAR `appliquerDescente`, ET C'EST VOULU ──────────────────
// 11 §4 : « fusion par UUID (une op locale plus récente n'est jamais écrasée par
// l'import) ». C'est MOT POUR MOT le premier garde-fou d'`appliquerDescente`
// (« une ligne qui porte une op NON APPLIQUÉE n'est jamais écrasée »), plus
// l'arbitrage par `clientUpdatedAt` du 05 §9.4. Écrire un second chemin de
// fusion créerait une seconde vérité sur la question la plus dangereuse du lot —
// celle où une divergence se paie en saisie perdue. Le port est donc réutilisé
// tel quel, et les deux effets de bord qu'il porte sont NEUTRALISÉS
// explicitement plus bas, jamais subis.
//
// ── CE QUE L'IMPORT NE FAIT PAS ENCORE, ET LE DIT ───────────────────────────
// Il ne RÉINJECTE PAS les opérations d'outbox. Elles sont dans le fichier (11 §4
// l'exige, et le jour où l'appareil meurt c'est le seul travail irremplaçable),
// mais aucune porte ne permet de les réécrire : `ecrireLocal` fabriquerait de
// NOUVEAUX `opId` — donc des ops que `processed_ops` ne saurait plus dédupliquer
// — et réécrirait `clientUpdatedAt` à l'instant de l'import, ce qui ferait gagner
// une vieille sauvegarde contre une donnée serveur plus fraîche (05 §9.4).
// `appliquerDescente`, lui, n'écrit JAMAIS dans l'outbox, par construction.
// Le rapport d'import ANNONCE donc le nombre d'opérations non réinjectées, et
// l'écran l'affiche. C'est le même parti que le port de sync inerte de
// `LOT_L5.md` §3.6 : « elle rend `{statut: 'indisponible'}` et l'écran l'affiche
// tel quel — jamais une pastille verte ». Le point est remonté pour L6a.
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours), E6 (hors ligne
// total), E33 (sécurité / RGPD).
// =============================================================================
import { z } from 'zod';
import {
  VERSION_SCHEMA_LOCAL,
  CLES_META,
  cleEmbarquement,
  ecrireMeta,
  lireMeta,
} from '../local/base.js';
import { deriverKek, PARAMETRES_KDF_DEFAUT, genererSel } from '../local/coffre.js';
import { deverrouiller, lireCoffreAuRepos } from '../local/coffre-appareil.js';
import { contexteLocal } from '../local/contexte.js';
import {
  depuisBase64,
  versBase64,
  LONGUEUR_NONCE_OCTETS,
  VERSION_ENVELOPPE,
  type Enveloppe,
} from '../local/enveloppe.js';
import {
  appliquerDescente,
  type EnregistrementDescendant,
  type LotDescendant,
} from '../local/ecriture.js';
import { SCHEMA_CHARGE, ligneStockeeSchema } from '../local/formes.js';
import { maintenant } from '../local/horloge.js';
import {
  contenuSauvegardeSchema,
  fichierSauvegardeSchema,
  TABLES_SAUVEGARDEES,
  VERSION_FORMAT_SAUVEGARDE,
  type ContenuSauvegarde,
  type FichierSauvegarde,
  type LigneSauvegardee,
  type OperationSauvegardee,
  type ParametresKdfSauvegarde,
  type TableSauvegardee,
} from './format.js';

// ─────────────────────────────────────────────────────────────────────────────
// LES ERREURS — chacune dit une CAUSE et une ACTION (03 §17.6, §33.2)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Le fichier n'est pas une sauvegarde exploitable : forme invalide, version de
 * format inconnue, en-tête tronqué. Distinct du mot de passe, et la distinction
 * compte : « votre mot de passe est faux » et « ce fichier n'en est pas un »
 * n'appellent pas le même geste.
 */
export class SauvegardeIllisibleError extends Error {
  override readonly name = 'SauvegardeIllisibleError';
  constructor(detail: string) {
    super(
      `Ce fichier n’est pas une sauvegarde Axion exploitable (${detail}). Vérifiez que vous avez choisi le bon fichier ; aucune donnée de cet appareil n’a été modifiée.`,
    );
  }
}

/**
 * La clé dérivée ne déchiffre pas la charge.
 *
 * AES-GCM authentifie : un mot de passe faux et un chiffré altéré échouent tous
 * deux ici, et c'est correct — dans les deux cas, le contenu n'est pas
 * authentique, et le distinguer donnerait à un attaquant un oracle sur ce qui a
 * été modifié.
 */
/**
 * Le mot de passe donné pour CHIFFRER une sauvegarde n'est pas celui de
 * l'appareil — majeur **M5** de la revue A29 (2026-09-05).
 *
 * Le défaut qu'elle ferme est une PERTE SILENCIEUSE, la pire forme : une faute
 * de frappe produisait un `.axionbackup` parfaitement formé, annoncé
 * « sauvegarde produite », et **définitivement inouvrable** — découvert le jour
 * de la restauration, c'est-à-dire le jour où l'appareil est perdu.
 * Invariant 8 : l'export doit être « disponible ET TESTÉ ». Un export dont on ne
 * sait pas s'il s'ouvre n'est pas testé.
 */
export class MotDePasseExportInvalideError extends Error {
  override readonly name = 'MotDePasseExportInvalideError';
  constructor() {
    super(
      'Ce mot de passe n’est pas celui de cet appareil. Aucune sauvegarde n’a été produite : un fichier chiffré avec un mot de passe erroné serait définitivement illisible.',
    );
  }
}

export class MotDePasseSauvegardeInvalideError extends Error {
  override readonly name = 'MotDePasseSauvegardeInvalideError';
  constructor() {
    super(
      'La sauvegarde n’a pas pu être ouverte : le mot de passe ne correspond pas, ou le fichier a été altéré. Aucune donnée de cet appareil n’a été modifiée.',
    );
  }
}

export { VERSION_FORMAT_SAUVEGARDE } from './format.js';

// ─────────────────────────────────────────────────────────────────────────────
// LA CLÉ DU FICHIER — dérivée du MOT DE PASSE, jamais de la DEK
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `deriverKek` est réutilisée telle quelle : son en-tête déclare explicitement
 * que la clé rendue porte `encrypt`/`decrypt` « pour le fichier de secours
 * `.axionbackup` (11 §4), dont la clé dérive DU MOT DE PASSE et non de la DEK
 * d'appareil ». Le sel, lui, est NEUF à chaque export — jamais celui du coffre :
 * deux clés dérivées du même mot de passe avec le même sel seraient la même clé,
 * et un fichier de secours partagerait alors la clé qui protège l'appareil.
 */
async function cleDuFichier(
  motDePasse: string,
  sel: Uint8Array,
  parametres: ParametresKdfSauvegarde,
): Promise<CryptoKey> {
  return deriverKek(motDePasse, sel, parametres);
}

/**
 * Le mot de passe est-il bien celui de CET appareil ? Lève sinon (M5, A29).
 *
 * ── LE SEUL CAS OÙ CETTE FONCTION NE VÉRIFIE RIEN, ET POURQUOI IL N'EXISTE PAS
 * ── EN PRODUCTION ────────────────────────────────────────────────────────────
 * Elle a besoin du coffre AU REPOS (`meta.coffre` : sel + DEK enveloppée). S'il
 * est absent, elle laisse passer. Ce n'est pas un garde-fou permissif oublié —
 * c'est un état inatteignable côté produit : le coffre au repos est posé par
 * `initialiserCoffre` au tout premier déverrouillage, et sans lui AUCUNE donnée
 * locale n'est déchiffrable, donc aucun export n'a de matière. Un appareil qui
 * exporte a forcément un coffre.
 * Fabriquer un refus sur une information absente coûterait ici plus qu'il ne
 * rapporte : il refuserait des appels de test qui montent un coffre en mémoire
 * sans le persister, sans protéger un seul auditeur de plus.
 */
export async function verifierMotDePasseAppareil(motDePasse: string): Promise<void> {
  const { base } = contexteLocal();
  if ((await lireCoffreAuRepos(base)) === null) return;
  const temoin = await deverrouiller(base, motDePasse).catch(() => null);
  if (temoin === null) throw new MotDePasseExportInvalideError();
  temoin.verrouiller();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export interface DemandeExport {
  readonly missionId: string;
  /** Le mot de passe de l'auditeur — la seule clé du fichier (11 §4). */
  readonly motDePasse: string;
  /** Surchargeables pour les tests ; en production, le profil OWASP du coffre. */
  readonly parametresKdf?: ParametresKdfSauvegarde;
}

/**
 * Lit toutes les lignes d'une table pour une mission et DÉCHIFFRE leur charge.
 *
 * `missions` est filtrée sur `id` et non sur `missionId` : elle ne porte pas la
 * seconde colonne, elle EST la mission. Un filtre uniforme aurait produit une
 * sauvegarde sans sa propre mission — donc un fichier qui restaure des sessions
 * rattachées à rien.
 */
/**
 * Le schéma de charge d'une table, vu comme `ZodType<unknown>`.
 *
 * Le RUNTIME reste celui de `SCHEMA_CHARGE` — la validation au déchiffrement a
 * bien lieu, avec le vrai schéma de la table. Seul le type STATIQUE est élargi,
 * parce que `LigneSauvegardee.charge` est de toute façon `unknown` : la ligne
 * traverse un fichier, elle sera revalidée à l'import contre le même
 * `SCHEMA_CHARGE`. Élargir ici évite un paramètre générique qui ne servirait
 * qu'à porter un type immédiatement effacé.
 */
function schemaDeCharge(nom: TableSauvegardee): z.ZodType {
  return SCHEMA_CHARGE[nom];
}

async function lireTable(nom: TableSauvegardee, missionId: string): Promise<LigneSauvegardee[]> {
  const { base, coffre } = contexteLocal();
  const table = base.table<Record<string, unknown> & { id: string }, string>(nom);
  const brutes =
    nom === 'missions'
      ? await table.filter((ligne) => ligne.id === missionId).toArray()
      : await table.filter((ligne) => ligne.missionId === missionId).toArray();

  const lignes: LigneSauvegardee[] = [];
  for (const brute of brutes) {
    // `ligneStockeeSchema` garantit la PAIRE `{id, charge: Enveloppe}` ; le reste
    // de l'en-tête d'index voyage tel quel, sa forme étant retypée à
    // l'application par les types mappés d'`appliquerDescente`.
    const stockee = ligneStockeeSchema.parse(brute);
    // Filtrage explicite plutôt qu'une déstructuration à variable inutilisée :
    // ce qu'on retire ici, c'est la charge CHIFFRÉE, remplacée juste après par la
    // charge en clair. La nommer pour ne pas s'en servir laisserait croire qu'on
    // l'a oubliée.
    const index = Object.fromEntries(Object.entries(brute).filter(([cle]) => cle !== 'charge'));
    lignes.push({
      ...index,
      id: stockee.id,
      charge: await coffre.dechiffrer(stockee.charge, schemaDeCharge(nom)),
    });
  }
  return lignes;
}

/**
 * Produit le fichier de secours. **Aucun réseau, aucune permission, aucun
 * serveur** — il se fabrique en mode avion, et c'est toute sa valeur.
 */
export async function exporterSauvegarde(demande: DemandeExport): Promise<FichierSauvegarde> {
  const { base, coffre } = contexteLocal();
  const parametres: ParametresKdfSauvegarde = demande.parametresKdf ?? PARAMETRES_KDF_DEFAUT;

  // ── M5 : LE MOT DE PASSE EST VÉRIFIÉ AVANT D'ÊTRE UTILISÉ ────────────────
  // `deriverKek` accepte N'IMPORTE QUELLE chaîne : sans ce contrôle, une faute
  // de frappe chiffrait la sauvegarde sous une clé que personne ne saurait
  // reproduire — un fichier bien formé, annoncé « produite », et définitivement
  // inouvrable, découvert le jour où l'appareil est perdu.
  //
  // La vérification est celle du déverrouillage quotidien (`coffre-appareil.ts`,
  // le chemin qu'emprunte `EcranDeverrouillage`) : LOCALE, donc disponible en
  // mode avion, là où l'export a lieu. Le coffre témoin est immédiatement
  // REFERMÉ — celui du contexte n'est pas touché, aucune seconde DEK ne survit.
  await verifierMotDePasseAppareil(demande.motDePasse);

  // ── Les sept tables miroirs, déchiffrées ────────────────────────────────
  const lignes: Partial<Record<TableSauvegardee, LigneSauvegardee[]>> = {};
  for (const nom of TABLES_SAUVEGARDEES) {
    lignes[nom] = await lireTable(nom, demande.missionId);
  }

  // ── L'outbox : le travail que le serveur n'a pas encore reçu ─────────────
  const operations: OperationSauvegardee[] = [];
  for (const op of await base.outbox.where('missionId').equals(demande.missionId).toArray()) {
    operations.push({
      opId: op.opId,
      missionId: op.missionId,
      entite: op.entite,
      entiteId: op.entiteId,
      action: op.action,
      clientUpdatedAt: op.clientUpdatedAt,
      queuedAt: op.queuedAt,
      statut: op.statut,
      tentatives: op.tentatives,
      derniereErreur: op.derniereErreur,
      // `z.unknown()` et non un schéma de table : la charge d'une op porte
      // l'entité COMPLÈTE, index inclus (`ecrireLocal` y met
      // `{...enTete, ...charge}`), et aucune des sept formes de `SCHEMA_CHARGE`
      // ne la décrit. Elle traverse la sauvegarde sans être relue. Le schéma
      // permissif est ici NOMMÉ et borné à ce seul champ — pas un `any` répandu.
      charge: await coffre.dechiffrer(op.charge, z.unknown()),
    });
  }

  const contenu: ContenuSauvegarde = contenuSauvegardeSchema.parse({
    missionId: demande.missionId,
    lignes,
    operations,
  });

  // ── Le chiffrement du payload, sous la clé du MOT DE PASSE ──────────────
  const sel = genererSel();
  const cle = await cleDuFichier(demande.motDePasse, sel, parametres);
  const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
  const chiffre = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cle,
    new TextEncoder().encode(JSON.stringify(contenu)),
  );

  const libelle = await lireMeta(base, CLES_META.libelleAppareil);

  return {
    enTete: {
      versionFormat: VERSION_FORMAT_SAUVEGARDE,
      missionId: demande.missionId,
      libelleAppareil: typeof libelle === 'string' ? libelle : 'Appareil non nommé',
      creeLe: maintenant(),
      versionSchemaLocal: VERSION_SCHEMA_LOCAL,
      operationsIncluses: operations.length,
      kdf: { algo: 'argon2id', sel: versBase64(sel), parametres },
    },
    charge: {
      v: VERSION_ENVELOPPE,
      n: versBase64(nonce),
      c: versBase64(new Uint8Array(chiffre)),
    } satisfies Enveloppe,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Traduit UNE ligne du fichier vers la forme attendue par `appliquerDescente`.
 *
 * ── LA SEULE CONVERSION NON PROUVÉE DE CE MODULE, ET CE QUI LA BORNE ───────
 * `EnregistrementDescendant` est une union discriminée dont chaque branche exige
 * un `IndexDeTable<T>` complet. Le fichier, lui, arrive de l'extérieur : Zod
 * garantit la paire `{id, charge}` mais pas les sept formes d'index, qui
 * n'existent qu'en TypeScript (`local/formes.ts` ne publie aucun schéma Zod
 * d'index). En écrire sept ici fabriquerait une SECONDE description des mêmes
 * formes, et c'est toujours la seconde qui dérive — le remède serait pire.
 *
 * Deux gardes RÉELLES encadrent donc la conversion, au lieu d'une confiance :
 *   ① la CHARGE est validée contre `SCHEMA_CHARGE[nom]`, la source unique. Un
 *      fichier forgé ou corrompu ne peut pas injecter une charge malformée.
 *   ② `clientUpdatedAt` est EXIGÉ. C'est le champ dont l'absence serait
 *      silencieuse et coûteuse : `appliquerDescente` arbitre les conflits
 *      dessus (05 §9.4), et un `undefined` y désarme l'arbitrage — la ligne
 *      importée écraserait alors une ligne locale plus récente, c'est-à-dire
 *      exactement ce que 11 §4 interdit. Une garde vaut mieux là où le défaut
 *      ne se verrait pas.
 */
function versEnregistrement(
  nom: TableSauvegardee,
  ligne: LigneSauvegardee,
): EnregistrementDescendant {
  const { charge, ...index } = ligne;
  if (typeof index.clientUpdatedAt !== 'string') {
    throw new SauvegardeIllisibleError(
      `une ligne de « ${nom} » n’a pas d’horodatage de modification, ce qui rendrait la fusion arbitraire`,
    );
  }
  return {
    table: nom,
    index,
    charge: SCHEMA_CHARGE[nom].parse(charge),
  } as unknown as EnregistrementDescendant;
}

export interface RapportImport {
  readonly missionId: string;
  /** Lignes réellement écrites ou proposées à la fusion. */
  readonly lignesRestaurees: number;
  /**
   * Opérations présentes dans le fichier et NON réinjectées dans la file.
   * Voir l'en-tête : il n'existe pas encore de porte pour les réécrire.
   */
  readonly operationsNonReinjectees: number;
  /** Message en français à afficher tel quel. `null` s'il n'y a rien à signaler. */
  readonly avertissement: string | null;
}

/**
 * Restaure une sauvegarde sur CET appareil.
 *
 * L'ordre est celui du refus le moins coûteux d'abord : forme du fichier, puis
 * version de format, puis déchiffrement, puis forme du contenu. Rien n'est écrit
 * tant que les quatre n'ont pas passé — un import qui échoue à mi-chemin
 * laisserait une base à moitié restaurée, c'est-à-dire pire qu'avant.
 */
export async function importerSauvegarde(
  fichier: unknown,
  motDePasse: string,
): Promise<RapportImport> {
  const { base } = contexteLocal();
  const analyse = fichierSauvegardeSchema.safeParse(fichier);
  if (!analyse.success) {
    throw new SauvegardeIllisibleError('sa structure ne correspond pas au format attendu');
  }
  const valide: FichierSauvegarde = analyse.data;

  if (valide.enTete.versionFormat !== VERSION_FORMAT_SAUVEGARDE) {
    throw new SauvegardeIllisibleError(
      `il a été produit au format ${String(valide.enTete.versionFormat)}, cette version de l’application lit le format ${String(VERSION_FORMAT_SAUVEGARDE)}`,
    );
  }

  let clair: string;
  try {
    const cle = await cleDuFichier(
      motDePasse,
      depuisBase64(valide.enTete.kdf.sel),
      valide.enTete.kdf.parametres,
    );
    const octets = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: depuisBase64(valide.charge.n) },
      cle,
      depuisBase64(valide.charge.c),
    );
    clair = new TextDecoder().decode(octets);
  } catch {
    throw new MotDePasseSauvegardeInvalideError();
  }

  const contenu = contenuSauvegardeSchema.safeParse(JSON.parse(clair));
  if (!contenu.success) {
    throw new SauvegardeIllisibleError('son contenu déchiffré n’a pas la forme attendue');
  }

  // ── Vers la forme du port de descente ───────────────────────────────────
  const enregistrements: EnregistrementDescendant[] = [];
  for (const nom of TABLES_SAUVEGARDEES) {
    for (const ligne of contenu.data.lignes[nom]) {
      enregistrements.push(versEnregistrement(nom, ligne));
    }
  }

  // ── LES DEUX EFFETS DE BORD DU PORT, NEUTRALISÉS EXPLICITEMENT ──────────
  //
  // ① `serverTime` : `appliquerDescente` appelle `reglerDecalage(serverTime)`.
  //    Y passer `enTete.creeLe` rejouerait le décalage du jour de la sauvegarde
  //    — une sauvegarde de mardi ferait écrire vendredi à l'heure de mardi.
  //    `maintenant()` vaut `Date.now() + decalage`, donc `reglerDecalage` en
  //    recalcule `(Date.now() + decalage) - Date.now()`, c'est-à-dire le décalage
  //    COURANT : l'appel devient neutre par construction. Ce n'est pas une
  //    astuce, c'est la seule valeur qui laisse l'horloge où elle est, et un test
  //    @critique l'éprouve avec un décalage de +3 h.
  //
  // ② `prochainSince: null` remet le curseur de pull de la mission à zéro, donc
  //    le prochain pull sera COMPLET (05 §9.5 : « premier pull = mission
  //    complète »). C'est le comportement JUSTE : sur l'appareil de remplacement,
  //    aucun delta n'a de sens, et sur l'appareil d'origine un pull complet est
  //    idempotent. Coûteux en réseau, jamais en données.
  const lot: LotDescendant = {
    missionId: contenu.data.missionId,
    serverTime: maintenant(),
    prochainSince: null,
    enregistrements,
  };
  await appliquerDescente(lot);

  // ── La mission restaurée est EMBARQUÉE ────────────────────────────────────
  // DECISIONS.md 2026-09-02 : « mission embarquée signifie DONNÉES PRÉSENTES,
  // jamais persistance accordée ». Après l'import, les données SONT présentes.
  // Sans cette marque, le cockpit et la règle de vue initiale diraient
  // « aucune mission » à un appareil qui vient d'en restaurer une — et l'écran
  // d'embarquement proposerait de la télécharger. La même clé que `embarquement.ts`
  // (L5a), écrite par la même porte `ecrireMeta`.
  await ecrireMeta(base, cleEmbarquement(contenu.data.missionId), maintenant());

  const operations = contenu.data.operations.length;
  return {
    missionId: contenu.data.missionId,
    lignesRestaurees: enregistrements.length,
    operationsNonReinjectees: operations,
    avertissement:
      operations === 0
        ? null
        : `Cette sauvegarde contient ${String(operations)} élément(s) de collecte qui n’avaient pas encore été synchronisés. Leurs données sont restaurées, mais la file d’envoi ne l’est pas dans cette version : ils repartiront au prochain envoi complet de la mission.`,
  };
}
