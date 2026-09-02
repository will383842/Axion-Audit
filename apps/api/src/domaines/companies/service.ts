// =============================================================================
// SERVICE DES ENTREPRISES CLIENTES — les deux règles du pack, les refus, la trace.
// Lot L3, incrément L3a.
//
// ── LES DEUX RÈGLES, ET RIEN D'AUTRE ────────────────────────────────────────
//   · **R3 — déduplication** (03 §29) : « le SIREN est la clé de déduplication
//     outil↔console (nom en second) ; alerte si deux fiches partagent un SIREN ».
//     Le SIREN est arbitré par la BASE (index unique partiel) ; le nom, par une
//     ALERTE non bloquante. Voir `verifierDoublonDeNom` pour ce que « en second »
//     veut dire exactement ;
//   · **R4 — secteur pré-rempli** (03 §29) : « à la création d'un client français,
//     le code APE/NAF renseigne automatiquement le secteur ». Voir `resoudreSecteur`.
//
// ── CE QUI VIT ICI, ET NULLE PART AILLEURS ──────────────────────────────────
//   · l'ORDRE des deux règles (le secteur se résout AVANT l'écriture, le doublon de
//     nom se constate AVANT et se rapporte APRÈS) ;
//   · le fait qu'une modification qui NE CHANGE RIEN ne produit NI écriture NI
//     ligne de journal ;
//   · l'appel à la porte d'écriture unique du journal, TOUJOURS après le succès —
//     jamais dedans (`journaliserActivite` écrit par `db`, pas par la transaction,
//     et NE LÈVE JAMAIS : l'appeler dans la transaction n'aurait rien atomisé, et
//     l'appeler avant aurait tracé des actes qui n'ont pas eu lieu).
//
// ── CE QUE LE JOURNAL NE PORTE JAMAIS ───────────────────────────────────────
// Ni le nom, ni le SIREN, ni le code APE, ni les notes. `company.create` porte deux
// BOOLÉENS (« avec SIREN ? », « doublon signalé ? ») et `company.update` les NOMS
// des colonnes touchées. C'est le catalogue partagé qui rend le reste inexprimable,
// pas la vigilance d'ici.
// Traçabilité : E19 (avant-vente : cadrage de l'étendue — entreprise complète,
// filiales) · E18 (liaison clients axion-ia.com : console maîtresse) · E3 (tous
// secteurs d'activité — pré-remplissage sectoriel) · E43 (conventions d'API).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import {
  AppError,
  normaliserNomEntreprise,
  type CHAMPS_ENTREPRISE_JOURNALISABLES,
  type CreateCompanyRequest,
  type HomonymeCompany,
  type PaginationQuery,
  type UpdateCompanyRequest,
} from '@axion/shared';
import { db } from '../../db.js';
import type { PageCurseur } from '../../http/pagination.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import {
  insererEntreprise,
  lireEntreprise,
  lireEntreprisePourEcriture,
  lireNomsEntreprises,
  lireSecteurParCodeNaf,
  listerEntreprises,
  mettreAJourEntreprise,
  type LigneEntreprise,
} from './depot.js';

/** Une colonne dont `company.update` sait dire le NOM (jamais la valeur). */
type ChampJournalisable = (typeof CHAMPS_ENTREPRISE_JOURNALISABLES)[number];

/** Message unique de la fiche introuvable. */
const MESSAGE_ENTREPRISE_INTROUVABLE = "Cette entreprise n'existe pas.";

/**
 * Rendu quand un `UPDATE … RETURNING` ne rend rien alors que la ligne vient d'être
 * lue SOUS VERROU dans la même transaction : inatteignable, mais on échoue plutôt
 * qu'on asserte — une assertion mentirait au compilateur.
 */
function incoherenceInterne(): AppError {
  return new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
}

/** Ce qu'une écriture rend : la fiche, et les deux constats de R3 et R4. */
export interface EcritureEntreprise {
  readonly ligne: LigneEntreprise;
  readonly secteurAQualifier: boolean;
  readonly doublonsNomPossibles: readonly HomonymeCompany[];
}

// -----------------------------------------------------------------------------
// R4 — LE SECTEUR PRÉ-REMPLI
// -----------------------------------------------------------------------------

/** Ce que la résolution du secteur produit : une valeur, et un constat pour l'écran. */
interface SecteurResolu {
  readonly sectorId: string | null;
  readonly secteurAQualifier: boolean;
}

/**
 * R4, INTÉGRALEMENT — et ses trois issues, qui ne se ressemblent pas.
 *
 * ┌────────────────────────────────┬──────────────┬──────────────────────────────┐
 * │ situation                      │ `sectorId`   │ `secteurAQualifier`          │
 * ├────────────────────────────────┼──────────────┼──────────────────────────────┤
 * │ secteur IMPOSÉ par l'appelant  │ le sien      │ `false` — rien à qualifier   │
 * │ code APE connu du référentiel  │ celui de la  │ `false`                      │
 * │                                │ division     │                              │
 * │ code APE VALIDE mais inconnu   │ `null`       │ **`true`** — succès, pas 404 │
 * │ aucun code APE                 │ `null`       │ `false` — rien n'a été tenté │
 * └────────────────────────────────┴──────────────┴──────────────────────────────┘
 *
 * Cette table décrit la CRÉATION. À la modification, la troisième ligne n'est pas
 * reprise telle quelle : il y a un secteur en place à ne pas détruire — voir
 * `modifierUneEntreprise`.
 *
 * ── LES DEUX DÉCISIONS QUE CETTE TABLE PORTE ────────────────────────────────
 * **1. Le secteur explicite l'emporte sur R4.** « Pré-rempli » (03 §29) décrit une
 * commodité de saisie, pas une contrainte : un consultant qui choisit le secteur
 * d'une holding multi-activités en sait plus qu'une division NAF. Faire l'inverse
 * — écraser un choix humain par une correspondance automatique — serait la faute
 * exacte que R6 corrige déjà pour les unités d'organisation (« le moteur applique
 * le paquet sectoriel de l'unité s'il existe, celui de la mission sinon »).
 *
 * **2. Un code APE valide mais inconnu est un SUCCÈS.** Un format invalide est un
 * `400` rendu par le compilateur Zod ; une division absente des 88 lignes de
 * `naf_sector_map` n'est pas une faute de l'utilisateur mais un TROU du référentiel,
 * lequel est administrable depuis la console (R4 : « administrée, console espace
 * Contenu »). On rend donc la fiche, avec `secteurAQualifier: true` — et **on
 * n'invente JAMAIS un secteur par défaut** : un secteur faux traverserait ensuite le
 * moteur M2 (qui croise « palier × secteur × … », 03 §16.3) et produirait un
 * questionnaire faux, sans que rien ne signale d'où vient l'erreur.
 */
async function resoudreSecteur(
  sectorIdDemande: string | null,
  codeNaf: string | null,
): Promise<SecteurResolu> {
  if (sectorIdDemande !== null) {
    return { sectorId: sectorIdDemande, secteurAQualifier: false };
  }
  if (codeNaf === null) {
    return { sectorId: null, secteurAQualifier: false };
  }

  const sectorId = await lireSecteurParCodeNaf(codeNaf);
  return { sectorId, secteurAQualifier: sectorId === null };
}

// -----------------------------------------------------------------------------
// R3 — L'ALERTE DE DOUBLON, MOITIÉ « NOM EN SECOND »
// -----------------------------------------------------------------------------

/**
 * Les fiches existantes dont le NOM NORMALISÉ est identique. **Ne lève jamais.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'EST LE POINT OÙ UNE DÉDUPLICATION NAÏVE CASSE LE PRODUIT, ET IL FAUT LE DIRE
 * SANS DÉTOUR.
 * ═══════════════════════════════════════════════════════════════════════════════
 * L'index du fichier 04 est `companies(siren) WHERE siren IS NOT NULL` : **PARTIEL**.
 * Plusieurs fiches à `siren = NULL` sont donc parfaitement légales, et c'est le cas
 * NORMAL des filiales étrangères (§16). Une déduplication qui traiterait `NULL`
 * comme une valeur — un `SELECT … WHERE siren IS NOT DISTINCT FROM $1`, ou pire un
 * refus sur le nom — REFUSERAIT DES CRÉATIONS VALIDES, et le premier groupe
 * européen audité rendrait l'outil inutilisable.
 *
 * D'où la forme de cette fonction : elle CONSTATE, elle ne décide pas. Son résultat
 * accompagne un `201`/`200` ; aucun appelant n'en fait un refus. C'est ce que R3
 * écrit — « **alerte** si deux fiches partagent un SIREN » — et ce que
 * `DECISIONS.md` du 2026-08-29 a explicitement substitué au 409 que la note de
 * conception proposait pour le nom.
 *
 * ── POURQUOI LE CONSTAT EST FAIT AVANT L'ÉCRITURE ───────────────────────────
 * Parce qu'après, la fiche que l'on vient de créer serait elle-même dans la liste
 * des candidats, et il faudrait l'en retirer par son identifiant — une soustraction
 * qui marche jusqu'au jour où elle est oubliée. Le constat porte donc sur l'état
 * d'avant, ce qui est aussi le sens utile : « au moment où vous créez cette fiche,
 * en voici d'autres qui lui ressemblent ». La liste peut être périmée d'une
 * milliseconde en cas de création concurrente — c'est un AVERTISSEMENT, pas une
 * contrainte d'intégrité, et il n'y a rien à sérialiser.
 */
async function chercherHomonymes(
  nom: string,
  idAExclure: string | null,
): Promise<readonly HomonymeCompany[]> {
  const recherche = normaliserNomEntreprise(nom);
  // Un nom réduit à sa seule forme juridique (« SAS ») se normalise en chaîne vide.
  // La comparer signalerait comme homonymes toutes les autres fiches de ce genre :
  // on s'abstient plutôt que de produire une alerte qui n'apprend rien.
  if (recherche === '') return [];

  const existantes = await lireNomsEntreprises(idAExclure);
  return existantes
    .filter((existante) => normaliserNomEntreprise(existante.name) === recherche)
    .map((existante) => ({ id: existante.id, name: existante.name }));
}

// -----------------------------------------------------------------------------
// LECTURES
// -----------------------------------------------------------------------------

/**
 * `GET /v1/companies`. Aucune journalisation : le catalogue ne connaît pas d'action
 * de consultation de fiche client, et en inventer une noierait la table (une liste
 * se rafraîchit à chaque ouverture d'écran). La consultation FINANCIÈRE, elle, est
 * tracée — parce que 06 §10.5 l'exige nommément, et pour elle seule.
 */
export async function listerLesEntreprises(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneEntreprise>> {
  return listerEntreprises(pagination);
}

/** `GET /v1/companies/:id`. `NOT_FOUND` si la fiche n'existe pas ou est supprimée. */
export async function lireUneEntreprise(id: string): Promise<LigneEntreprise> {
  const ligne = await lireEntreprise(id);
  if (ligne === null) throw new AppError('NOT_FOUND', MESSAGE_ENTREPRISE_INTROUVABLE);
  return ligne;
}

// -----------------------------------------------------------------------------
// CRÉATION
// -----------------------------------------------------------------------------

/**
 * `POST /v1/companies`.
 *
 * L'`id` est un **UUID v7 frappé côté applicatif** (11 §2 : « côté applicatif,
 * client ET serveur » ; PostgreSQL 16 n'a pas d'`uuidv7()` native, et une fonction
 * SQL de génération v7 est explicitement interdite).
 *
 * ── L'ORDRE DES TROIS OPÉRATIONS EST LA LOGIQUE, PAS UNE COMMODITÉ ──────────
 *  1. R4 — le secteur est résolu AVANT l'écriture : la valeur écrite doit être la
 *     valeur définitive, sinon il faudrait un second `UPDATE` et la fiche existerait
 *     un instant avec un secteur nul que rien ne distinguerait d'un secteur absent ;
 *  2. R3 — les homonymes sont constatés AVANT l'écriture (voir `chercherHomonymes`) ;
 *  3. l'INSERTION, dont l'échec sur `uq_companies_siren` est le SEUL arbitre du
 *     conflit de SIREN. Aucune lecture préalable : entre un `SELECT` et l'`INSERT`,
 *     une autre requête peut prendre le SIREN, et le contrôle n'aurait donné que
 *     l'illusion d'une garantie.
 *
 * Aucune transaction : les deux lectures ne décident rien qui doive être atomique
 * avec l'écriture, et la seule contrainte d'intégrité est tenue par l'index. Ouvrir
 * une transaction ici tiendrait un verrou pendant un balayage de noms, pour rien.
 */
export async function creerUneEntreprise(
  auteurId: string,
  entree: CreateCompanyRequest,
  contexte: ContexteJournal,
): Promise<EcritureEntreprise> {
  const secteur = await resoudreSecteur(entree.sectorId, entree.nafCode);
  const doublonsNomPossibles = await chercherHomonymes(entree.name, null);

  const ligne = await insererEntreprise(
    {
      id: uuidv7(),
      name: entree.name,
      siren: entree.siren,
      nafCode: entree.nafCode,
      sectorId: secteur.sectorId,
      externalRef: entree.externalRef,
      headcount: entree.headcount,
      sitesCount: entree.sitesCount,
      countries: entree.countries,
      notes: entree.notes,
    },
    new Date(),
  );

  await journaliserActivite(
    {
      action: 'company.create',
      utilisateurId: auteurId,
      entrepriseId: ligne.id,
      // Deux booléens, jamais le SIREN ni le nom : « cette fiche est-elle née sans
      // clé de rapprochement ? » et « l'a-t-on créée en connaissance d'un homonyme ? ».
      avecSiren: ligne.siren !== null,
      doublonNomSignale: doublonsNomPossibles.length > 0,
    },
    contexte,
  );

  return { ligne, secteurAQualifier: secteur.secteurAQualifier, doublonsNomPossibles };
}

// -----------------------------------------------------------------------------
// MODIFICATION
// -----------------------------------------------------------------------------

/**
 * Compare un champ demandé à sa valeur actuelle, et n'enregistre le changement que
 * s'il en est un.
 *
 * `undefined` = « ne touche pas » ; `null` = « efface ». Le premier n'entre jamais
 * dans le `SET`, le second oui — c'est toute la différence entre un `PATCH` et un
 * `PUT`, et la confondre rendrait impossible de retirer un SIREN saisi par erreur.
 */
function comparer<Valeur>(
  demande: Valeur | undefined,
  actuelle: Valeur,
): { readonly change: false } | { readonly change: true; readonly valeur: Valeur } {
  if (demande === undefined || demande === actuelle) return { change: false };
  return { change: true, valeur: demande };
}

/**
 * Deux listes de pays sont égales si elles portent les mêmes codes DANS LE MÊME
 * ORDRE. L'ordre compte parce que la colonne est un JSONB — un tableau, pas un
 * ensemble : réordonner les pays d'implantation EST une modification de la donnée
 * stockée, et la taire produirait une fiche dont la valeur en base ne correspond
 * plus à la dernière écriture acceptée.
 */
function memesPays(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

/**
 * `PATCH /v1/companies/:id`.
 *
 * ── LA COMPARAISON AVANT/APRÈS N'EST PAS UNE OPTIMISATION ───────────────────
 * On n'écrit QUE les champs qui changent VRAIMENT, et on ne journalise QUE
 * ceux-là. Un `PATCH` qui renvoie le nom déjà en base produirait autrement une
 * ligne `company.update` décrivant une modification qui n'a pas eu lieu, et un
 * `updated_at` bousculé sans raison. Un journal d'audit qui décrit des
 * non-événements se lit moins bien qu'un journal court — et c'est ce journal-là
 * qu'on relit le jour où quelqu'un conteste une donnée de mission.
 *
 * ── R4 SE REJOUE, ET SEULEMENT QUAND IL LE DOIT ─────────────────────────────
 * Le secteur n'est re-résolu que si le code APE change ET que l'appelant n'impose
 * pas de secteur. Le rejouer à chaque `PATCH` écraserait un secteur choisi à la main
 * lors d'une modification qui ne concerne que les effectifs — exactement le
 * comportement que la décision 1 de `resoudreSecteur` refuse à la création.
 *
 * **Et le rejeu qui NE TROUVE RIEN n'écrase pas davantage** : division inconnue du
 * référentiel ⇒ le secteur en place RESTE, la réponse porte `secteurAQualifier:
 * true` (invariant 7 ; `DECISIONS.md` du 2026-08-31, option 2). Effacer un secteur
 * reste possible, mais seulement en le demandant : `sectorId: null` dans le corps.
 *
 * Transaction + `FOR UPDATE` : le lire-puis-écrire doit voir un état stable, sinon
 * la liste des champs journalisés décrit une transition qui n'a pas eu lieu.
 */
export async function modifierUneEntreprise(
  auteurId: string,
  cibleId: string,
  corps: UpdateCompanyRequest,
  contexte: ContexteJournal,
): Promise<EcritureEntreprise> {
  const doublonsNomPossibles =
    corps.name === undefined ? [] : await chercherHomonymes(corps.name, cibleId);

  const resultat = await db.transaction(async (tx) => {
    const avant = await lireEntreprisePourEcriture(tx, cibleId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_ENTREPRISE_INTROUVABLE);

    // Objet MUTABLE ici, `ChampsEntrepriseModifiables` (en lecture seule) au
    // passage : on construit, puis on transmet une valeur que le dépôt ne peut plus
    // altérer.
    const champs: {
      name?: string;
      siren?: string | null;
      nafCode?: string | null;
      sectorId?: string | null;
      externalRef?: string | null;
      headcount?: number | null;
      sitesCount?: number | null;
      countries?: string[];
      notes?: string | null;
    } = {};
    const touches: ChampJournalisable[] = [];

    const nom = comparer(corps.name, avant.name);
    if (nom.change) {
      champs.name = nom.valeur;
      touches.push('name');
    }

    const siren = comparer(corps.siren, avant.siren);
    if (siren.change) {
      champs.siren = siren.valeur;
      touches.push('siren');
    }

    const naf = comparer(corps.nafCode, avant.nafCode);
    if (naf.change) {
      champs.nafCode = naf.valeur;
      touches.push('naf_code');
    }

    const refExterne = comparer(corps.externalRef, avant.externalRef);
    if (refExterne.change) {
      champs.externalRef = refExterne.valeur;
      touches.push('external_ref');
    }

    const effectif = comparer(corps.headcount, avant.headcount);
    if (effectif.change) {
      champs.headcount = effectif.valeur;
      touches.push('headcount');
    }

    const sites = comparer(corps.sitesCount, avant.sitesCount);
    if (sites.change) {
      champs.sitesCount = sites.valeur;
      touches.push('sites_count');
    }

    const paysDemandes = corps.countries;
    if (paysDemandes !== undefined && !memesPays(paysDemandes, avant.countries)) {
      champs.countries = [...paysDemandes];
      touches.push('countries');
    }

    const notes = comparer(corps.notes, avant.notes);
    if (notes.change) {
      champs.notes = notes.valeur;
      touches.push('notes');
    }

    // ── R4 REJOUÉ, ET SEULEMENT QUAND IL LE DOIT ───────────────────────────
    // QUATRE cas, dans cet ordre de priorité :
    //   · l'appelant IMPOSE un secteur (y compris `null`, qui veut dire « efface »)
    //     — il l'emporte, comme à la création ;
    //   · le code APE CHANGE pour une valeur non nulle et la division EST CONNUE
    //     du référentiel — la correspondance se rejoue, c'est exactement ce que R4
    //     promet ;
    //   · le code APE CHANGE pour une valeur non nulle mais la division est
    //     INCONNUE — le secteur en place est CONSERVÉ, et l'appelant reçoit
    //     `secteurAQualifier: true`. (2026-09-02 — application de l'arbitrage
    //     `DECISIONS.md` du 2026-08-31, « Un `PATCH` de code APE vers une division
    //     inconnue EFFACE un secteur choisi à la main », option 2 : un trou de
    //     `naf_sector_map` est un fait d'administration, le laisser détruire une
    //     saisie humaine casserait l'invariant 7. L'effacement délibéré garde le
    //     chemin qui l'exprime : `sectorId: null` explicite dans le corps.) ;
    //   · sinon — on garde le secteur en place. Rejouer R4 à chaque `PATCH`
    //     écraserait un secteur choisi à la main lors d'une modification qui ne
    //     concerne que les effectifs.
    let secteur: SecteurResolu;
    if (corps.sectorId !== undefined) {
      secteur = { sectorId: corps.sectorId, secteurAQualifier: false };
    } else if (naf.change && naf.valeur !== null) {
      const rejoue = await resoudreSecteur(null, naf.valeur);
      secteur =
        rejoue.sectorId === null ? { sectorId: avant.sectorId, secteurAQualifier: true } : rejoue;
    } else {
      secteur = { sectorId: avant.sectorId, secteurAQualifier: false };
    }

    if (secteur.sectorId !== avant.sectorId) {
      champs.sectorId = secteur.sectorId;
      touches.push('sector_id');
    }

    if (touches.length === 0) {
      return { ligne: avant, touches, secteurAQualifier: secteur.secteurAQualifier };
    }

    const apres = await mettreAJourEntreprise(tx, cibleId, champs, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, touches, secteurAQualifier: secteur.secteurAQualifier };
  });

  const [premier, ...reste] = resultat.touches;
  if (premier !== undefined) {
    // Le tableau est reconstruit NON VIDE pour le schéma partagé (`min(1)`) : la
    // variante `company.update` refuse une liste de champs vide, et elle a raison —
    // « j'ai modifié quelque chose, je ne sais pas quoi » n'est pas une trace.
    await journaliserActivite(
      {
        action: 'company.update',
        utilisateurId: auteurId,
        entrepriseId: cibleId,
        champs: [premier, ...reste],
      },
      contexte,
    );
  }

  return {
    ligne: resultat.ligne,
    secteurAQualifier: resultat.secteurAQualifier,
    doublonsNomPossibles,
  };
}
