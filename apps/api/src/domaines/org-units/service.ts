// =============================================================================
// SERVICE DE L'ARBRE ORGANISATIONNEL — et, au centre, l'IMPORT CSV du 03 §35.2.
// Lot L3, incrément L3c.
//
// ═══════════════════════════════════════════════════════════════════════════════
// L'IMPORT EST ATOMIQUE **ET** EXHAUSTIF, ET LES DEUX NE SE CONTREDISENT PAS.
// ═══════════════════════════════════════════════════════════════════════════════
// §35.2 : « import ATOMIQUE (une erreur = rien d'importé + rapport d'erreurs ligne
// par ligne) ». La contradiction n'est qu'apparente, et elle tombe pour une raison
// mécanique : **la validation n'écrit pas**.
//
//   PASSE 1 — entièrement en mémoire, zéro écriture. `analyserCsvArbre`
//     (`packages/shared`) contrôle la forme : en-têtes, séparateur, unicité des
//     `ref`, résolution des `parent_ref`, cycles, valeurs. Ce service y ajoute les
//     deux contrôles qui exigent la base — l'existence de `service_code` et de
//     `sector_code` dans les référentiels. **Toutes** les lignes sont évaluées :
//     jamais d'arrêt à la première erreur.
//   PASSE 2 — uniquement si zéro erreur : UNE transaction, insertion parents avant
//     enfants. Un fichier de 1 000 lignes dont la 900ᵉ est fautive laisse donc
//     `count(org_units)` INCHANGÉ et rapporte 1 000 lignes évaluées.
//
// `?verification=true` s'arrête après la passe 1 et rend le MÊME rapport : c'est
// la définition du mode à blanc — « rapporte exactement ce que ferait l'import
// réel, sans rien écrire ».
//
// ── CE QUI VIT ICI, ET NULLE PART AILLEURS ──────────────────────────────────
//   · le garde-fou de ré-import (`DECISIONS.md` du 2026-09-01) ;
//   · les conditions des deux gestes de qualification du §25.3 ;
//   · la vérification qu'un parent, une cible de fusion et l'unité visée
//     appartiennent à la MÊME mission — qu'aucune contrainte du 04 ne peut faire ;
//   · la détection de cycle au reparentage ;
//   · l'appel à la porte d'écriture unique du journal, TOUJOURS après le succès.
//
// ── CE QUE LE JOURNAL NE PORTE JAMAIS ───────────────────────────────────────
// Ni le nom d'une unité, ni son effectif, ni **le rapport d'import** : il recopie
// des cellules du fichier client, et `DECISIONS.md` du 2026-08-29 l'exclut
// nommément de la journalisation. Le rapport est RENDU, jamais écrit.
// Traçabilité : E4 (arbre organisationnel à profondeur libre) · E5 (audits
// partiels — `in_scope`) · E31 (généricité absolue) · E46 (bout en bout
// opérationnel : le format CSV du §35.2) · E43 (conventions d'API).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import {
  analyserCsvArbre,
  AppError,
  ecreterRapport,
  PROFONDEUR_ARBRE_MAX,
  type CHAMPS_UNITE_JOURNALISABLES,
  type CreateOrgUnitRequest,
  type ImportArbreRequest,
  type LigneArbreCsv,
  type LigneRapportImport,
  type MergeOrgUnitRequest,
  type PaginationQuery,
  type RapportImportArbre,
  type RefusImportReel,
  type UpdateOrgUnitRequest,
} from '@axion/shared';
import { db } from '../../db.js';
import type { PageCurseur } from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import {
  compterUnites,
  insererUnite,
  insererUnites,
  lireReferentiels,
  lireSquelette,
  lireUnite,
  lireUnitePourEcriture,
  listerUnitesDeMission,
  mettreAJourUnite,
  missionVivante,
  poserStatutUnite,
  positionMax,
  reattacherEntretiens,
  reparenterEnfants,
  verrouillerMission,
  type LigneUniteOrg,
  type NouvelleUniteOrg,
} from './depot.js';

/** Une colonne dont `org_unit.update` sait dire le NOM (jamais la valeur). */
type ChampJournalisable = (typeof CHAMPS_UNITE_JOURNALISABLES)[number];

/** Message unique de la mission introuvable — le même que celui des missions. */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/** Message unique de l'unité introuvable. */
const MESSAGE_UNITE_INTROUVABLE = "Cette unité n'existe pas.";

/**
 * Rendu quand un `UPDATE … RETURNING` ne rend rien alors que la ligne vient d'être
 * lue SOUS VERROU dans la même transaction : inatteignable, mais on échoue plutôt
 * qu'on asserte — une assertion mentirait au compilateur.
 */
function incoherenceInterne(): AppError {
  return new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
}

/**
 * Refus commun quand la mission de l'URL n'existe pas (ou est supprimée).
 *
 * `sousVerrou` lit la ligne `missions` `FOR UPDATE` au lieu de la lire simplement :
 * réservé aux chemins qui DÉCIDENT ensuite d'une écriture d'après un décompte de
 * l'arbre (voir `importerLArbre`, étape ①). Une lecture ordinaire ne le prend pas —
 * verrouiller pour lister ferait attendre des consultations derrière une écriture.
 */
async function exigerMission(
  executeur: ExecuteurSql,
  missionId: string,
  sousVerrou = false,
): Promise<void> {
  const vivante = sousVerrou
    ? await verrouillerMission(executeur, missionId)
    : await missionVivante(executeur, missionId);
  if (!vivante) {
    throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
  }
}

// -----------------------------------------------------------------------------
// LECTURE
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions/:id/org-units` — l'arbre d'une mission, page par page.
 *
 * La mission est vérifiée AVANT la liste : sans ce contrôle, une mission inconnue
 * rendrait une page vide, et l'appelant ne saurait pas distinguer « cette mission
 * n'existe pas » de « cette mission n'a pas d'unité » — ce qui, pour un arbre dont
 * la racine est créée d'office (§16.2), est un état impossible et donc un signal
 * qu'il faut rendre lisible.
 *
 * Aucune journalisation : le catalogue ne trace aucune consultation ordinaire.
 */
export async function listerLArbre(
  missionId: string,
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneUniteOrg>> {
  await exigerMission(db, missionId);
  return listerUnitesDeMission(missionId, pagination);
}

// -----------------------------------------------------------------------------
// CRÉATION D'UNE UNITÉ
// -----------------------------------------------------------------------------

/**
 * Vérifie qu'un parent est utilisable : il existe, et il appartient À LA MÊME
 * MISSION.
 *
 * ⚠ **AUCUNE CONTRAINTE DU FICHIER 04 NE LE FAIT.** `org_units_parent_id_fkey`
 * garantit que le parent EXISTE, pas qu'il appartient à la bonne mission. Sans ce
 * contrôle, un arbre pourrait enjamber deux missions — et la couverture, le plan
 * d'entretiens et le scoring compteraient alors des unités qui ne sont pas dans le
 * périmètre audité, sans que rien ne le signale.
 */
async function exigerParentDeLaMission(
  executeur: ExecuteurSql,
  missionId: string,
  parentId: string,
): Promise<LigneUniteOrg> {
  const parent = await lireUnite(executeur, parentId);
  if (parent?.missionId !== missionId) {
    throw new AppError('VALIDATION_FAILED', "L'unité parente n'appartient pas à cette mission.", [
      { path: 'parentId', message: "L'unité parente n'appartient pas à cette mission." },
    ]);
  }
  return parent;
}

/** Ce qu'une création rend : la ligne, et d'où venait son identifiant. */
export interface CreationUnite {
  readonly ligne: LigneUniteOrg;
  readonly idFourniParLAppelant: boolean;
}

/**
 * `POST /v1/missions/:id/org-units`.
 *
 * ── L'IDENTIFIANT VIENT DU CLIENT OU DU SERVEUR, JAMAIS DE LA BASE ─────────
 * 04, règle P1-4 : une unité est une entité créable hors ligne, elle porte donc un
 * **UUID v7 généré côté client** quand le client en fournit un. Sinon, le serveur
 * en frappe un — côté APPLICATIF (11 §2, lib `uuidv7`), jamais en SQL : PostgreSQL
 * 16 n'a pas d'`uuidv7()` native et une fonction SQL de génération v7 est
 * explicitement interdite.
 *
 * ── LA POSITION EST CALCULÉE SOUS TRANSACTION ──────────────────────────────
 * `max(position) + 1` lu hors transaction laisserait deux créations concurrentes
 * choisir le même rang. Ce n'est pas grave (rien n'impose l'unicité), mais c'est
 * évitable pour le prix d'une lecture déjà dans la transaction — et un arbre dont
 * deux unités partagent un rang se trie ensuite par `id`, c'est-à-dire dans un
 * ordre que personne n'a voulu.
 */
export async function creerUneUnite(
  auteurId: string,
  missionId: string,
  entree: CreateOrgUnitRequest,
  contexte: ContexteJournal,
): Promise<CreationUnite> {
  const maintenant = new Date();
  const idFourniParLAppelant = entree.id !== undefined;
  const id = entree.id ?? uuidv7();

  const ligne = await db.transaction(async (tx) => {
    await exigerMission(tx, missionId);

    if (entree.parentId !== null) {
      await exigerParentDeLaMission(tx, missionId, entree.parentId);
    }

    const position = entree.position ?? (await positionMax(tx, missionId)) + 1;

    return insererUnite(
      tx,
      {
        id,
        missionId,
        parentId: entree.parentId,
        kind: entree.kind,
        name: entree.name,
        countryCode: entree.countryCode,
        timezone: entree.timezone,
        headcount: entree.headcount,
        serviceRefId: entree.serviceRefId,
        sectorId: entree.sectorId,
        inScope: entree.inScope,
        status: entree.status,
        // `proposed_by` reste NUL : le §25.3 en fait l'auteur TERRAIN de la
        // proposition, et l'administrateur qui saisit n'est pas celui qui a proposé.
        // Une trace fausse coûte plus cher qu'une trace absente ; le chemin de sync
        // (L6) le renseignera avec l'auteur réel.
        proposedBy: null,
        position,
      },
      maintenant,
    );
  });

  await journaliserActivite(
    {
      action: 'org_unit.create',
      utilisateurId: auteurId,
      uniteId: ligne.id,
      missionId: ligne.missionId,
      kind: ligne.kind,
      statut: entree.status,
      idFourniParLAppelant,
    },
    contexte,
  );

  return { ligne, idFourniParLAppelant };
}

// -----------------------------------------------------------------------------
// MODIFICATION
// -----------------------------------------------------------------------------

/**
 * Compare un champ demandé à sa valeur actuelle, et n'enregistre le changement que
 * s'il en est un. `undefined` = « ne touche pas » ; `null` = « efface ».
 */
function comparer<Valeur>(
  demande: Valeur | undefined,
  actuelle: Valeur,
): { readonly change: false } | { readonly change: true; readonly valeur: Valeur } {
  if (demande === undefined || demande === actuelle) return { change: false };
  return { change: true, valeur: demande };
}

/**
 * Le nouveau parent créerait-il un CYCLE ?
 *
 * On remonte la chaîne des ancêtres DEPUIS le parent visé : si l'on retombe sur
 * l'unité déplacée, le rattachement la ferait descendre d'elle-même. La remontée
 * est BORNÉE (`PROFONDEUR_ARBRE_MAX`) — un arbre déjà corrompu en base ne doit
 * jamais faire boucler une requête, sinon une donnée fausse rend l'API muette au
 * lieu de bruyante.
 *
 * Le squelette entier de la mission est chargé en une requête plutôt qu'une
 * remontée par allers-retours : 150 couples `(id, parent_id)` tiennent en mémoire
 * (FIL-GC), et une remontée niveau par niveau ferait autant de requêtes que
 * l'arbre a d'étages.
 */
async function exigerAbsenceDeCycle(
  executeur: ExecuteurSql,
  missionId: string,
  uniteId: string,
  nouveauParentId: string,
): Promise<void> {
  if (nouveauParentId === uniteId) {
    throw new AppError('VALIDATION_FAILED', 'Une unité ne peut pas être son propre parent.', [
      { path: 'parentId', message: 'Une unité ne peut pas être son propre parent.' },
    ]);
  }

  const squelette = await lireSquelette(executeur, missionId);
  const parents = new Map(squelette.map((noeud) => [noeud.id, noeud.parentId]));

  let courant: string | null = nouveauParentId;
  for (let profondeur = 0; profondeur <= PROFONDEUR_ARBRE_MAX; profondeur += 1) {
    if (courant === null) return;
    if (courant === uniteId) {
      throw new AppError(
        'VALIDATION_FAILED',
        "Ce rattachement créerait une boucle : l'unité descendrait d'elle-même.",
        [
          {
            path: 'parentId',
            message: "Ce rattachement créerait une boucle dans l'arbre organisationnel.",
          },
        ],
      );
    }
    courant = parents.get(courant) ?? null;
  }

  throw new AppError(
    'VALIDATION_FAILED',
    `La chaîne de rattachement dépasse ${String(PROFONDEUR_ARBRE_MAX)} niveaux.`,
    [{ path: 'parentId', message: 'La chaîne de rattachement est anormalement profonde.' }],
  );
}

/**
 * `PATCH /v1/org-units/:id`.
 *
 * ── LA COMPARAISON AVANT/APRÈS N'EST PAS UNE OPTIMISATION ───────────────────
 * On n'écrit QUE les champs qui changent VRAIMENT, et on ne journalise QUE
 * ceux-là. Un `PATCH` qui renvoie le nom déjà en base produirait autrement une
 * ligne `org_unit.update` décrivant une modification qui n'a pas eu lieu.
 *
 * ⚠ **`status` NE PASSE PAS PAR ICI** : `updateOrgUnitRequestSchema` est un
 * `strictObject` sans clé `status`, et `ChampsUniteModifiables` n'en déclare pas.
 * Les deux transitions d'état d'une unité ont leurs routes (§25.3).
 *
 * ⚠ **AUCUN GARDE-FOU DE STATUT DE MISSION**, et c'est écrit plutôt que supposé :
 * le pack ne dit nulle part qu'une mission close gèlerait son arbre. Le §25.1 fait
 * même le contraire — sortir une unité du périmètre (`in_scope = false`) est un
 * geste de RECALAGE, qui arrive par définition après le cadrage. Inventer ici un
 * verrou que le pack ne demande pas empêcherait une correction légitime, que
 * l'invariant 7 suppose possible. Remonté comme candidat `DECISIONS.md`.
 */
export async function modifierUneUnite(
  auteurId: string,
  uniteId: string,
  corps: UpdateOrgUnitRequest,
  contexte: ContexteJournal,
): Promise<LigneUniteOrg> {
  const resultat = await db.transaction(async (tx) => {
    const avant = await lireUnitePourEcriture(tx, uniteId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_UNITE_INTROUVABLE);

    // UNE UNITÉ FUSIONNÉE N'EST PLUS MODIFIABLE — 409, pas 404.
    //
    // Elle n'est plus un nœud de l'arbre (`listerUnitesDeMission` ne la sert plus) :
    // elle est de l'HISTOIRE, et l'histoire ne se corrige pas. La renommer ou la
    // reparenter modifierait une trace que la fusion a précisément figée, et le
    // ferait en silence — l'invariant 7 vise exactement ce geste-là.
    //
    // **409 et non 404** : la ressource EXISTE, et le dire est utile — un 404 ferait
    // croire à sa disparition, c'est-à-dire à la suppression que ce produit ne fait
    // jamais. C'est l'ÉTAT qui s'oppose à la demande, ce qui est la définition du 409.
    if (avant.status === 'fusionnee') {
      throw new AppError(
        'CONFLICT',
        'Cette unité a été fusionnée : elle ne peut plus être modifiée. Modifiez plutôt l’unité dans laquelle elle a été fusionnée.',
        [{ path: 'status', code: avant.status, message: "L'unité a été fusionnée." }],
      );
    }

    const champs: {
      name?: string;
      kind?: LigneUniteOrg['kind'];
      parentId?: string | null;
      countryCode?: string | null;
      timezone?: string | null;
      headcount?: number | null;
      serviceRefId?: string | null;
      sectorId?: string | null;
      inScope?: boolean;
      position?: number;
    } = {};
    const touches: ChampJournalisable[] = [];

    const nom = comparer(corps.name, avant.name);
    if (nom.change) {
      champs.name = nom.valeur;
      touches.push('name');
    }

    const type = comparer(corps.kind, avant.kind);
    if (type.change) {
      champs.kind = type.valeur;
      touches.push('kind');
    }

    const parent = comparer(corps.parentId, avant.parentId);
    if (parent.change) {
      // ═══════════════════════════════════════════════════════════════════════════
      // LE VERROU DE MISSION — SANS LUI, DEUX `PATCH` CROISÉS COMMETTENT UN CYCLE.
      // ═══════════════════════════════════════════════════════════════════════════
      // A51, F-13. `lireUnitePourEcriture` ne verrouille QUE la ligne modifiée, or un
      // reparentage ne décide pas sur cette ligne : il décide sur TOUT L'ARBRE. Deux
      // requêtes concurrentes — « A devient enfant de B » et « B devient enfant de
      // A » — verrouillent donc deux lignes DISTINCTES, lisent chacune un squelette
      // qui ignore l'écriture non committée de l'autre, passent toutes deux le
      // contrôle, et committent un cycle. Aucune contrainte du fichier 04 ne s'y
      // oppose, et aucun `CHECK` ne pourrait l'exprimer — une propriété de graphe ne
      // se dit pas ligne à ligne.
      //
      // C'est exactement la règle que `importerLArbre` applique déjà (décision B-2 de
      // la revue croisée A17) : **toute route qui décide sur l'arbre lit la mission
      // `FOR UPDATE`**. Le `PATCH` la contredisait ; il s'y range.
      //
      // ── COÛT, ET ORDRE DES VERROUS — CE QUI EST VRAI, ET CE QUI NE L'EST PAS ──
      // Coût NUL hors reparentage : le verrou n'est pris que dans cette branche — un
      // simple changement de nom ne fait attendre personne.
      //
      // L'ordre est ici « ligne PUIS mission ». Deux `PATCH` concurrents convergent
      // sur LA MÊME mission et se sérialisent — c'est l'effet recherché : le second
      // relit un squelette à jour.
      //
      // ⚠ **UN INTERBLOCAGE RESTE POSSIBLE, ET LE PRÉTENDRE IMPOSSIBLE SERAIT FAUX**
      // (A51) : deux `PATCH` de reparentage croisés prennent chacun le `FOR UPDATE`
      // de LEUR ligne, puis le verrou de mission — mais l'écriture de `parent_id`
      // demande en plus, par la clé étrangère, un `FOR KEY SHARE` sur la ligne du
      // NOUVEAU PARENT, c'est-à-dire sur la ligne que l'autre transaction tient
      // déjà. Les deux peuvent donc s'attendre. **Ce qui est vrai, et qui suffit** :
      // l'issue n'est ni un cycle commité ni un 500 — PostgreSQL tranche par un
      // `40P01` que `erreurs-postgres.ts` traduit en **409 lisible** (F-14), et
      // l'invariant de graphe, lui, n'est jamais violé. Une transaction annulée est
      // un refus ; un arbre faux est une donnée que l'invariant 7 interdit de
      // nettoyer par suppression.
      await exigerMission(tx, avant.missionId, true);

      if (parent.valeur !== null) {
        await exigerParentDeLaMission(tx, avant.missionId, parent.valeur);
        await exigerAbsenceDeCycle(tx, avant.missionId, uniteId, parent.valeur);
      }
      champs.parentId = parent.valeur;
      touches.push('parent_id');
    }

    const pays = comparer(corps.countryCode, avant.countryCode);
    if (pays.change) {
      champs.countryCode = pays.valeur;
      touches.push('country_code');
    }

    const fuseau = comparer(corps.timezone, avant.timezone);
    if (fuseau.change) {
      champs.timezone = fuseau.valeur;
      touches.push('timezone');
    }

    const effectif = comparer(corps.headcount, avant.headcount);
    if (effectif.change) {
      champs.headcount = effectif.valeur;
      touches.push('headcount');
    }

    const fonction = comparer(corps.serviceRefId, avant.serviceRefId);
    if (fonction.change) {
      champs.serviceRefId = fonction.valeur;
      touches.push('service_ref_id');
    }

    const secteur = comparer(corps.sectorId, avant.sectorId);
    if (secteur.change) {
      champs.sectorId = secteur.valeur;
      touches.push('sector_id');
    }

    const perimetre = comparer(corps.inScope, avant.inScope);
    if (perimetre.change) {
      champs.inScope = perimetre.valeur;
      touches.push('in_scope');
    }

    // Écrit à la main plutôt que par `comparer`, et pour une raison de TYPE qui est
    // aussi une règle métier : `avant.position` peut être nulle (le 04 l'autorise),
    // `corps.position` ne le peut PAS (le schéma d'entrée ne l'admet pas). Un
    // `PATCH` peut donc DONNER un rang à une unité qui n'en avait pas — il ne peut
    // jamais lui en RETIRER un. On accepte l'existant, on ne le fabrique pas.
    if (corps.position !== undefined && corps.position !== avant.position) {
      champs.position = corps.position;
      touches.push('position');
    }

    if (touches.length === 0) {
      return { ligne: avant, touches };
    }

    const apres = await mettreAJourUnite(tx, uniteId, champs, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, touches };
  });

  const [premier, ...reste] = resultat.touches;
  if (premier !== undefined) {
    await journaliserActivite(
      {
        action: 'org_unit.update',
        utilisateurId: auteurId,
        uniteId,
        champs: [premier, ...reste],
      },
      contexte,
    );
  }

  return resultat.ligne;
}

// =============================================================================
// LES DEUX GESTES DE QUALIFICATION — 03 §25.3
// =============================================================================

/**
 * `POST /v1/org-units/:id/validate` — « devient `active`, entre dans la couverture
 * et le scoring » (§25.3).
 *
 * ── SEULE UNE UNITÉ `proposee` SE VALIDE ────────────────────────────────────
 * Une unité déjà `active` rend **409** : elle n'a rien à valider, et prétendre le
 * contraire ferait croire à un acte qui n'a pas eu lieu. Une unité `fusionnee` rend
 * 409 aussi — la ressusciter reviendrait à défaire une fusion en silence, ce que
 * l'invariant 7 refuse.
 *
 * ── IDEMPOTENCE : CE QUE LE MOT VEUT DIRE ICI ───────────────────────────────
 * Rejouer la MÊME demande ne produit jamais un second changement d'état ni une
 * seconde ligne de journal : la deuxième fois, l'unité est déjà `active` et la
 * demande est refusée en 409 sans rien écrire. L'état final est le même qu'après un
 * seul appel — c'est l'idempotence de l'EFFET, exactement celle que la machine à
 * états des missions tient déjà.
 */
export async function validerUneUnite(
  auteurId: string,
  uniteId: string,
  contexte: ContexteJournal,
): Promise<LigneUniteOrg> {
  const ligne = await db.transaction(async (tx) => {
    const avant = await lireUnitePourEcriture(tx, uniteId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_UNITE_INTROUVABLE);

    if (avant.status !== 'proposee') {
      throw new AppError(
        'CONFLICT',
        avant.status === 'active'
          ? "Cette unité est déjà active : il n'y a rien à valider."
          : 'Cette unité a été fusionnée : elle ne peut plus être validée.',
        [{ path: 'status', code: avant.status, message: "L'unité n'est pas une proposition." }],
      );
    }

    const apres = await poserStatutUnite(tx, uniteId, 'proposee', 'active', undefined, new Date());
    if (apres === null) throw incoherenceInterne();
    return apres;
  });

  await journaliserActivite(
    {
      action: 'org_unit.validate',
      utilisateurId: auteurId,
      uniteId,
      missionId: ligne.missionId,
    },
    contexte,
  );

  return ligne;
}

/**
 * La CIBLE d'une fusion descend-elle de la SOURCE ? Si oui, on refuse (A51, F-21).
 *
 * On remonte les ancêtres de la cible : si l'on rencontre la source, la cible est
 * dans sa descendance, et la fusion produirait un arbre cassé — voir le point
 * d'appel, qui écrit ce qui se passerait exactement.
 *
 * ── POURQUOI 409 ET NON 400 ────────────────────────────────────────────────
 * La requête est bien formée et les deux unités existent : ce qui s'y oppose est la
 * FORME DE L'ARBRE au moment de la demande, c'est-à-dire l'état de la ressource —
 * la définition de 409, et le même raisonnement que les deux refus de statut qui
 * précèdent. Le même corps de requête redeviendra valide dès que l'administrateur
 * aura reparenté la cible : c'est bien l'état qui change, pas la requête.
 *
 * La remontée est BORNÉE (`PROFONDEUR_ARBRE_MAX`) pour la raison qui vaut partout
 * ailleurs dans ce fichier : un arbre déjà corrompu ne doit jamais faire boucler une
 * requête — une donnée fausse rend l'API bruyante, pas muette.
 */
async function exigerCibleNonDescendante(
  executeur: ExecuteurSql,
  missionId: string,
  sourceId: string,
  cibleId: string,
): Promise<void> {
  const squelette = await lireSquelette(executeur, missionId);
  const parents = new Map(squelette.map((noeud) => [noeud.id, noeud.parentId]));

  let courant: string | null = parents.get(cibleId) ?? null;
  for (let profondeur = 0; profondeur <= PROFONDEUR_ARBRE_MAX; profondeur += 1) {
    if (courant === null) return;
    if (courant === sourceId) {
      const message =
        "L'unité cible descend de l'unité à fusionner : la fusion casserait l'arbre. " +
        "Reparentez d'abord la cible en dehors de cette branche, puis refaites la fusion.";
      throw new AppError('CONFLICT', message, [
        { path: 'mergedIntoId', code: 'cible_descendante', message },
      ]);
    }
    courant = parents.get(courant) ?? null;
  }

  throw new AppError(
    'CONFLICT',
    `La chaîne de rattachement de l'unité cible dépasse ${String(PROFONDEUR_ARBRE_MAX)} niveaux : la fusion est refusée tant que l'arbre n'est pas corrigé.`,
    [
      {
        path: 'mergedIntoId',
        code: 'cible_descendante',
        message: 'Chaîne de rattachement anormale.',
      },
    ],
  );
}

/** Ce qu'une fusion rend : les deux unités, et ce qui a été déplacé. */
export interface ResultatFusion {
  readonly unite: LigneUniteOrg;
  readonly cible: LigneUniteOrg;
  readonly entretiensReattaches: number;
  readonly enfantsReattaches: number;
}

/**
 * `POST /v1/org-units/:id/merge` — « fusionner avec une unité existante
 * (`fusionnee` + `merged_into_id` ; les entretiens sont re-rattachés
 * automatiquement) » (§25.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNE FUSION TRACE, ELLE N'EFFACE PAS — INVARIANT 7, TENU SANS UNE COLONNE DE PLUS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La ligne source SURVIT POUR TOUJOURS : `status = 'fusionnee'`, `merged_into_id`
 * pointant la cible. Rien n'est supprimé, rien n'est écrasé. L'ancien rattachement
 * d'un entretien reste donc lisible par **deux chemins indépendants** : la ligne
 * `activity_log` (qui dit combien ont bougé, et vers où) et la ligne `org_units`
 * elle-même (qui dit d'où l'on vient).
 *
 * ── LES CINQ GARDE-FOUS, ET CE QUE CHACUN EMPÊCHE ──────────────────────────
 *  1. **seule une `proposee` se fusionne** — §25.3 décrit la qualification d'une
 *     PROPOSITION. Fusionner deux unités actives serait une réorganisation
 *     d'arbre, que le pack ne décrit nulle part et qui poserait des questions
 *     auxquelles il ne répond pas (que deviennent les scores déjà calculés ?) ;
 *  2. **la cible doit être `active`** — `docs/conception/LOT_L3.md` §3e : « pas de
 *     chaîne ». Fusionner dans une unité elle-même fusionnée créerait un chemin à
 *     deux sauts que rien ne garantit sans boucle ;
 *  3. **même mission** — sinon un entretien changerait de mission par ricochet,
 *     et la couverture de deux missions deviendrait fausse d'un coup ;
 *  4. **la cible n'est pas la source** — une unité fusionnée dans elle-même serait
 *     une ligne qui dit avoir disparu vers elle-même ;
 *  5. **la cible ne DESCEND PAS de la source** (A51, F-21) — sinon le re-parentage
 *     des enfants donnerait à la cible son propre identifiant comme parent, et la
 *     branche entière sortirait de l'arbre sans qu'aucune contrainte du fichier 04
 *     ne s'y oppose. Refus, jamais réécriture silencieuse (invariant 7).
 *
 * ── L'ORDRE DES DEUX VERROUS EST CANONIQUE, PAS CELUI DE LA REQUÊTE ────────
 * A51, F-14 : les deux unités sont verrouillées **par identifiant croissant**, et
 * non « celle de l'URL puis celle du corps ». Deux fusions symétriques concurrentes
 * ne peuvent donc plus s'interbloquer — voir le commentaire au point du verrou.
 *
 * ── L'ORDRE DES ÉCRITURES, DANS UNE SEULE TRANSACTION ──────────────────────
 * Les enfants sont re-parentés AVANT que la source ne passe `fusionnee` ; les
 * entretiens ensuite. L'ordre est indifférent au résultat (tout est dans la même
 * transaction) mais il est fixé pour que la relecture d'un journal de base montre
 * toujours la même séquence.
 *
 * ⚠ **LES `unit_scores` NE SONT PAS MIGRÉS** (`LOT_L3.md` §3e) : ils sont
 * RECALCULÉS par le lot L8. Les déplacer ici mélangerait des scores calculés sur
 * deux périmètres différents — un score est une agrégation, pas une propriété
 * transportable.
 */
export async function fusionnerUneUnite(
  auteurId: string,
  uniteId: string,
  corps: MergeOrgUnitRequest,
  contexte: ContexteJournal,
): Promise<ResultatFusion> {
  const resultat = await db.transaction(async (tx) => {
    // ④ — VÉRIFIÉ AVANT TOUT VERROU. C'est le seul cas où « source » et « cible »
    // désignent la même ligne : le contrôler ici évite d'avoir à décider ce que
    // signifierait un ordre canonique sur deux identifiants égaux.
    if (corps.mergedIntoId === uniteId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Une unité ne peut pas être fusionnée avec elle-même.',
        [{ path: 'mergedIntoId', message: 'Choisissez une unité cible différente.' }],
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LES DEUX VERROUS SONT PRIS DANS L'ORDRE DES IDENTIFIANTS, PAS DANS CELUI DE
    // LA REQUÊTE.
    // ═══════════════════════════════════════════════════════════════════════════
    // A51, F-14. Verrouiller « d'abord l'unité de l'URL, puis celle du corps »
    // laissait l'APPELANT choisir l'ordre d'acquisition : deux fusions symétriques
    // concurrentes — `A→B` et `B→A` — prenaient donc les deux mêmes verrous dans des
    // ordres opposés et s'interbloquaient (ABBA). PostgreSQL tranchait par un
    // `40P01`, et la victime recevait une erreur là où elle n'avait rien fait de mal.
    //
    // **L'ordre canonique supprime la classe des interblocages ENTRE FUSIONS** — et
    // rien de plus, ce qu'il faut dire précisément : deux transactions qui
    // verrouillent les MÊMES lignes dans le MÊME ordre ne peuvent pas s'attendre
    // mutuellement. La seconde attend la première, puis relit un état à jour et sort
    // en 409 — le refus lisible qu'on voulait. C'est la même doctrine que le verrou
    // de mission du `PATCH` (F-13) : ce qu'on sérialise, c'est la décision, pas la
    // ligne.
    //
    // L'ordre retenu est celui des identifiants, croissant, **comparés en minuscules**.
    // Il est ARBITRAIRE mais TOTAL et STABLE — les deux seules propriétés qui
    // comptent : tout appelant, sur n'importe quelle paire, en déduit la même
    // séquence sans se concerter.
    //
    // ⚠ LA NORMALISATION DE CASSE N'EST PAS COSMÉTIQUE, ET SANS ELLE LA PHRASE
    // CI-DESSUS SERAIT FAUSSE (A51) : `z.uuid()` accepte les majuscules, et la
    // comparaison de chaînes de JavaScript est sensible à la casse. Deux appelants
    // qui écriraient le MÊME couple d'identifiants dans deux casses différentes en
    // déduiraient donc deux ordres OPPOSÉS, et l'ABBA reviendrait par la porte que
    // l'ordre canonique était censé fermer. Deux lignes, et la propriété redevient
    // vraie pour toutes les graphies d'un même identifiant.
    //
    // ⚠ La traduction du `40P01` reste en place (`erreurs-postgres.ts`) et n'est pas
    // devenue inutile : cet ordre ne couvre que les fusions ENTRE ELLES. Un
    // interblocage reste possible avec un autre chemin d'écriture — un `PATCH` de
    // reparentage, un import qui tient la mission, une sync à venir — et une erreur
    // non traduite rallumerait F-12 en journalisant la requête et ses paramètres.
    const cleSource = uniteId.toLowerCase();
    const cleCible = corps.mergedIntoId.toLowerCase();
    const [premierId, secondId] =
      cleSource < cleCible ? [uniteId, corps.mergedIntoId] : [corps.mergedIntoId, uniteId];

    const premier = await lireUnitePourEcriture(tx, premierId);
    const second = await lireUnitePourEcriture(tx, secondId);

    const source = premierId === uniteId ? premier : second;
    const cible = premierId === uniteId ? second : premier;

    if (source === null) throw new AppError('NOT_FOUND', MESSAGE_UNITE_INTROUVABLE);

    // ① — seule une proposition se fusionne.
    if (source.status !== 'proposee') {
      throw new AppError(
        'CONFLICT',
        source.status === 'active'
          ? 'Seule une unité proposée peut être fusionnée. Cette unité est active : sortez-la du périmètre si elle ne doit plus être auditée.'
          : 'Cette unité a déjà été fusionnée.',
        [{ path: 'status', code: source.status, message: "L'unité n'est pas une proposition." }],
      );
    }

    if (cible === null) {
      throw new AppError('VALIDATION_FAILED', "L'unité cible de la fusion n'existe pas.", [
        { path: 'mergedIntoId', message: "L'unité cible de la fusion n'existe pas." },
      ]);
    }

    // ③ — même mission.
    if (cible.missionId !== source.missionId) {
      throw new AppError('VALIDATION_FAILED', "L'unité cible n'appartient pas à la même mission.", [
        { path: 'mergedIntoId', message: "L'unité cible n'appartient pas à la même mission." },
      ]);
    }

    // ② — pas de chaîne de fusions.
    if (cible.status !== 'active') {
      throw new AppError('CONFLICT', 'Une unité ne se fusionne que dans une unité active.', [
        {
          path: 'mergedIntoId',
          code: cible.status,
          message: "L'unité cible n'est pas active.",
        },
      ]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ⑤ — LA CIBLE NE DOIT PAS DESCENDRE DE LA SOURCE.
    // ═══════════════════════════════════════════════════════════════════════════
    // A51, F-21. Fusionner `A` dans `C` alors que `C` descend de `A` produisait un
    // arbre CASSÉ, en silence : `reparenterEnfants` donne à tous les enfants de `A`
    // le parent `C`, donc `C` — qui est l'un de ses descendants — reçoit
    // `parent_id = C`. Une unité devient son propre parent, et **aucune contrainte
    // du fichier 04 ne s'y oppose** : il n'y a ni `CHECK (parent_id <> id)` ni
    // contrainte de graphe, et une propriété de graphe ne s'exprime pas ligne à
    // ligne. La branche entière sortait alors de l'arbre — invisible à la lecture,
    // puisque `listerUnitesDeMission` rend une liste à plat.
    //
    // ── REFUSER, ET DIRE QUOI FAIRE ────────────────────────────────────────────
    // `DECISIONS.md` du 2026-09-02 écarte le reparentage implicite (« la cible prend
    // la place de la source ») : ce serait inventer une sémantique que personne n'a
    // demandée et réécrire un arbre en silence — invariant 7. On refuse, et le
    // message dit le geste qui débloque : reparenter la cible d'abord.
    //
    // ── LE SQUELETTE EST LU SOUS LES VERROUS DÉJÀ PRIS ────────────────────────
    // Même doctrine que le reparentage du `PATCH` (F-13) : la mission est verrouillée
    // avant la lecture, de sorte que deux fusions concurrentes ne jugent pas chacune
    // sur un arbre que l'autre est en train de changer. Le verrou vient APRÈS les
    // deux verrous d'unités, comme dans le `PATCH` — même ordre relatif, donc pas
    // d'inversion entre ces deux chemins.
    await exigerMission(tx, source.missionId, true);
    await exigerCibleNonDescendante(tx, source.missionId, uniteId, cible.id);

    const maintenant = new Date();
    const enfantsReattaches = await reparenterEnfants(tx, uniteId, cible.id, maintenant);
    const entretiensReattaches = await reattacherEntretiens(tx, uniteId, cible.id, maintenant);

    const apres = await poserStatutUnite(
      tx,
      uniteId,
      'proposee',
      'fusionnee',
      cible.id,
      maintenant,
    );
    if (apres === null) throw incoherenceInterne();

    return { unite: apres, cible, entretiensReattaches, enfantsReattaches };
  });

  await journaliserActivite(
    {
      action: 'org_unit.merge',
      utilisateurId: auteurId,
      uniteId,
      missionId: resultat.unite.missionId,
      cibleId: resultat.cible.id,
      entretiensReattaches: resultat.entretiensReattaches,
      enfantsReattaches: resultat.enfantsReattaches,
      // Le FAIT qu'il y en ait eu un, jamais son texte — voir la variante
      // `org_unit.merge` de `packages/shared/src/journal.ts`.
      avecMotif: corps.motif !== undefined,
    },
    contexte,
  );

  return resultat;
}

// =============================================================================
// L'IMPORT CSV — 03 §35.2
// =============================================================================

/**
 * Résout `service_code` et `sector_code` contre les référentiels, et ajoute au
 * rapport les codes inconnus.
 *
 * **C'est le seul contrôle de la passe 1 qui touche la base**, et il ne lit que
 * deux tables de seed (11 §5 : 11 fonctions, 8 secteurs), en UNE requête chacune.
 * Un code inconnu est une erreur de l'utilisateur — il a écrit un code qui
 * n'existe pas — et non un référentiel incomplet : contrairement à la
 * correspondance NAF→secteur de `companies` (R4), le §35.2 ne prévoit aucun
 * comportement de repli, et deviner un service à partir d'un code inconnu écrirait
 * une donnée fausse dans la colonne qui sert au routage du questionnaire (M2).
 */
function resoudreReferentiels(
  lignes: readonly LigneArbreCsv[],
  servicesParCode: ReadonlyMap<string, string>,
  secteursParCode: ReadonlyMap<string, string>,
  erreurs: LigneRapportImport[],
): readonly { readonly serviceRefId: string | null; readonly sectorId: string | null }[] {
  return lignes.map((ligne) => {
    let serviceRefId: string | null = null;
    let sectorId: string | null = null;

    if (ligne.serviceCode !== null) {
      const trouve = servicesParCode.get(ligne.serviceCode);
      if (trouve === undefined) {
        erreurs.push({
          ligne: ligne.ligne,
          colonne: 'service_code',
          code: 'REFERENTIEL_INCONNU',
          message: `La fonction « ${ligne.serviceCode} » n'existe pas dans le référentiel des fonctions.`,
        });
      } else {
        serviceRefId = trouve;
      }
    }

    if (ligne.sectorCode !== null) {
      const trouve = secteursParCode.get(ligne.sectorCode);
      if (trouve === undefined) {
        erreurs.push({
          ligne: ligne.ligne,
          colonne: 'sector_code',
          code: 'REFERENTIEL_INCONNU',
          message: `Le secteur « ${ligne.sectorCode} » n'existe pas dans le référentiel des secteurs actifs.`,
        });
      } else {
        sectorId = trouve;
      }
    }

    return { serviceRefId, sectorId };
  });
}

/**
 * Ordonne les lignes PARENTS AVANT ENFANTS, en conservant l'ordre du fichier
 * partout où il ne contredit pas cette contrainte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TRI EXISTE : LA CLÉ ÉTRANGÈRE N'EST PAS DIFFÉRÉE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `org_units_parent_id_fkey` est vérifiée à chaque ligne (elle n'est pas
 * `DEFERRABLE` au fichier 04). Insérer dans l'ordre du fichier échouerait donc dès
 * qu'un sponsor a listé une filiale AVANT le groupe qui la porte — ce qui est
 * ordinaire dans un organigramme saisi à la main, et que le §35.2 n'interdit nulle
 * part.
 *
 * L'ordre du fichier est CONSERVÉ entre frères et sœurs : c'est lui qui devient la
 * `position`, donc l'ordre d'affichage de l'arbre. Un tri par niveau aurait
 * remélangé un organigramme que le sponsor avait rangé.
 *
 * L'analyse a déjà garanti l'absence de cycle ; la borne de boucle est une seconde
 * ceinture — une fonction qui ne se termine pas est un défaut sans message.
 */
function ordonnerParentsAvantEnfants(lignes: readonly LigneArbreCsv[]): readonly number[] {
  const ordre: number[] = [];
  const place = new Set<number>();

  const placer = (indice: number, profondeur: number): void => {
    if (place.has(indice) || profondeur > PROFONDEUR_ARBRE_MAX) return;
    const ligne = lignes[indice];
    if (ligne === undefined) return;
    if (ligne.parentIndice !== null) placer(ligne.parentIndice, profondeur + 1);
    if (place.has(indice)) return;
    place.add(indice);
    ordre.push(indice);
  };

  lignes.forEach((_, indice) => {
    placer(indice, 0);
  });

  return ordre;
}

/** Le tronc commun d'un rapport, avant qu'on sache s'il y a eu écriture. */
interface EnTeteRapport {
  readonly verification: boolean;
  readonly separateur: RapportImportArbre['separateur'];
  readonly lignesLues: number;
  readonly lignesVidesIgnorees: number;
  readonly unites: number;
  /**
   * L'obstacle d'ÉTAT, ou `null`. Il ne vit PAS dans `erreurs` : celui-ci décrit un
   * fichier, ligne par ligne et colonne par colonne, et un arbre déjà peuplé n'a ni
   * l'une ni l'autre. Les mêler obligerait à inventer un numéro de ligne et
   * brouillerait la seule question à laquelle `erreurs` répond.
   */
  readonly importReelRefuse: RefusImportReel | null;
}

/**
 * Assemble le rapport rendu.
 *
 * Les tableaux sont RECOPIÉS : l'écrêtage rend une vue en lecture seule, et le
 * contrat de sortie (`rapportImportArbreSchema`) décrit un tableau ordinaire. Une
 * conversion de type aurait fait la même chose en le cachant.
 */
function construireRapport(
  entete: EnTeteRapport,
  applique: boolean,
  erreurs: readonly LigneRapportImport[],
): RapportImportArbre {
  const ecrete = ecreterRapport(erreurs);
  return {
    ...entete,
    applique,
    erreurs: [...ecrete.erreurs],
    totalErreurs: ecrete.totalErreurs,
    erreursTronquees: ecrete.erreursTronquees,
  };
}

/**
 * `POST /v1/missions/:id/org-units/import` — LE cœur de l'incrément.
 *
 * ── LE GARDE-FOU DE RÉ-IMPORT, ET CE QU'IL FAIT DANS CHAQUE MODE ───────────
 * `DECISIONS.md` du 2026-09-01 : « import refusé si l'arbre porte autre chose que
 * sa racine d'office, arbre inchangé au bit près ». L'absorption de la racine par
 * défaut est explicitement écartée — elle demanderait de décider ce qu'on fait des
 * unités déjà rattachées à cette racine, ce que le pack ne dit pas ; vider l'arbre
 * est écarté par l'invariant 7.
 *
 * **Le mode réel rend 409 ; le mode à blanc rend 200 ET LE DIT.** Arbitrage A01 du
 * 2026-09-02, qui tranche deux exigences réelles et opposées : un contrôle à blanc
 * ne TENTE pas l'import, il ne peut donc pas se heurter à l'état de l'arbre
 * (`DECISIONS.md` du 2026-08-29) — mais un rapport qui annoncerait « 32 unités
 * seraient créées » sur un arbre où rien ne peut être créé mentirait. Le mode à
 * blanc analyse donc le fichier **quand même** et rend l'obstacle dans
 * `importReelRefuse`. L'auditeur apprend les deux choses qui l'intéressent — son
 * fichier est-il bon, et peut-il l'importer — sans avoir touché à son arbre.
 *
 * ── L'ORDRE DES SIX ÉTAPES ──────────────────────────────────────────────────
 *  1. la mission existe (404 sinon) — **et, en mode réel, sa ligne est lue
 *     `FOR UPDATE` AVANT le décompte** : c'est ce verrou, et non le décompte, qui
 *     rend le garde-fou vrai face à deux imports concurrents (le mode à blanc s'en
 *     passe : il n'écrit rien) ;
 *  2. l'arbre est vide ou réduit à sa racine d'office — sinon **409 en mode réel**,
 *     et en mode à blanc on poursuit en notant l'obstacle ;
 *  3. **passe 1** — analyse pure du contenu, puis résolution des référentiels ;
 *  4. mode à blanc : on rend le rapport, `applique: false`, **rien n'est écrit** ;
 *  5. des erreurs : `422 IMPORT_REJECTED`, rapport dans `details[]`, **rien n'est
 *     écrit** — la transaction n'a encore rien inséré, donc il n'y a rien à annuler ;
 *  6. **passe 2** — insertion parents avant enfants, positions à la suite de
 *     l'existant, journal APRÈS le commit.
 */
export async function importerLArbre(
  auteurId: string,
  missionId: string,
  entree: ImportArbreRequest,
  verification: boolean,
  contexte: ContexteJournal,
): Promise<RapportImportArbre> {
  const maintenant = new Date();

  const resultat = await db.transaction(async (tx) => {
    // ① La mission — et, EN MODE RÉEL, son VERROU.
    //
    // ═══════════════════════════════════════════════════════════════════════════
    // LA RÈGLE, ÉCRITE ICI UNE FOIS : TOUTE ROUTE QUI DÉCIDE SUR UN DÉCOMPTE
    // D'ARBRE LIT LA MISSION `FOR UPDATE`.
    // ═══════════════════════════════════════════════════════════════════════════
    // Le garde-fou ② compte les unités PUIS décide d'en insérer : c'est un
    // lire-décider-écrire, et `org_units` ne porte aucun `UNIQUE` qui rattraperait
    // la course. Sans ce verrou, deux imports concurrents comptent tous deux « arbre
    // vide », passent tous deux le garde-fou, et la mission se retrouve avec DEUX
    // arbres — qu'aucune route ne sait réparer, et que l'invariant 7 interdit de
    // corriger en supprimant l'un des deux. Le verrou porte sur la MISSION, comme au
    // figeage (`questionnaire/depot.ts`, `lireMissionPourFigeage`), parce qu'on ne
    // verrouille pas des lignes qui n'existent pas encore : le second appel attend le
    // commit du premier, compte n non nul, et sort en 409.
    //
    // **Le mode à blanc ne le prend PAS, et c'est délibéré : il n'écrit rien.** Il
    // n'a donc aucune décision d'écriture à sérialiser, et le verrouiller ferait
    // attendre un simple contrôle de fichier derrière un import réel en cours.
    //
    // Posé le 2026-09-02 — revue croisée A17, constat B-2.
    await exigerMission(tx, missionId, !verification);

    // ② Le garde-fou de ré-import.
    //
    // ═══════════════════════════════════════════════════════════════════════════
    // LES DEUX MODES NE FONT PAS LA MÊME CHOSE DE CET OBSTACLE, ET C'EST JUSTE.
    // ═══════════════════════════════════════════════════════════════════════════
    // `DECISIONS.md` du 2026-09-01 : « import refusé si l'arbre porte autre chose
    // que sa racine d'office, arbre inchangé au bit près ».
    //
    //   · **MODE RÉEL** — il TENTE l'import : il se heurte à l'obstacle et rend
    //     `409 CONFLICT`, avant même d'avoir lu le fichier. Rien n'est écrit.
    //   · **MODE À BLANC** — il ne tente rien, donc il ne peut se heurter à rien :
    //     il rend `200` (`DECISIONS.md` du 2026-08-29, « un contrôle à blanc qui a
    //     fait son travail a réussi »). Mais il **analyse quand même le fichier** et
    //     **dit** que l'import réel serait refusé, dans `importReelRefuse`.
    //
    // Les deux exigences que cette dissymétrie concilie sont réelles et opposées :
    // un rapport qui annoncerait « n unités seraient créées » sur un arbre où rien
    // ne peut être créé MENTIRAIT ; et un auditeur doit pouvoir vérifier son fichier
    // AVANT de toucher à son arbre — s'il fallait vider l'arbre pour savoir si le
    // fichier est bon, le mode à blanc ne servirait plus à rien.
    const existant = await compterUnites(tx, missionId);
    const arbreHabite = existant.total > 1 || (existant.total === 1 && existant.racines === 0);

    const importReelRefuse: RefusImportReel | null = arbreHabite
      ? {
          code: 'ARBRE_NON_VIDE',
          message: `L'arbre de cette mission porte déjà ${String(existant.total)} unités : l'import réel serait refusé pour ne rien écraser. Videz l'arbre à la main ou complétez-le unité par unité.`,
        }
      : null;

    if (importReelRefuse !== null && !verification) {
      throw new AppError('CONFLICT', importReelRefuse.message, [
        {
          path: 'orgUnits',
          code: importReelRefuse.code,
          message: `Cette mission porte déjà ${String(existant.total)} unités.`,
        },
      ]);
    }

    // ③ Passe 1 — analyse pure, puis les deux contrôles de référentiel.
    const analyse = analyserCsvArbre(entree.csv);
    const erreurs: LigneRapportImport[] = [...analyse.erreurs];

    const { servicesParCode, secteursParCode } = await lireReferentiels(tx);
    const codes = resoudreReferentiels(analyse.lignes, servicesParCode, secteursParCode, erreurs);

    const commun: EnTeteRapport = {
      verification,
      // Toujours `null` en mode réel : s'il y avait un obstacle, on aurait déjà
      // rendu 409 ci-dessus et ce rapport n'existerait pas.
      importReelRefuse,
      separateur: analyse.separateur,
      lignesLues: analyse.lignesLues,
      lignesVidesIgnorees: analyse.lignesVidesIgnorees,
      // Les lignes EXPLOITABLES. Quand le fichier est conforme, c'est exactement
      // `lignesLues` — et c'est ce que l'import écrit. Quand il ne l'est pas, l'écart
      // entre les deux dit combien de lignes ont été écartées, ce qu'un rapport
      // d'erreurs à 500 entrées écrêtées ne dirait plus.
      unites: analyse.lignes.length,
    };

    // ④ Mode à blanc : le même rapport, et RIEN d'écrit.
    if (verification) {
      return { rapport: construireRapport(commun, false, erreurs), unitesCreees: 0 };
    }

    // ⑤ Le rejet. Aucune écriture n'a eu lieu : la passe 1 ne fait que lire.
    if (erreurs.length > 0) {
      const ecrete = ecreterRapport(erreurs);
      throw new AppError(
        'IMPORT_REJECTED',
        `L'import est refusé : ${String(ecrete.totalErreurs)} erreur(s) ont été relevées dans le fichier. Aucune unité n'a été créée.`,
        ecrete.erreurs.map((entree_) => ({
          // `path` porte « ligne » ou « ligne.colonne » — la convention de chemin de
          // ce dépôt (les détails Zod joignent leur chemin par des points). `code`
          // porte la cause machine, `message` la phrase française : arbitrage
          // `[transverse]` du 2026-09-01.
          path:
            entree_.colonne === null
              ? String(entree_.ligne)
              : `${String(entree_.ligne)}.${entree_.colonne}`,
          code: entree_.code,
          message: `Ligne ${String(entree_.ligne)} : ${entree_.message}`,
        })),
      );
    }

    // ⑥ Passe 2. Les positions reprennent APRÈS l'existant — la racine d'office
    // porte 1, les unités importées suivent, et l'arbre se lit dans l'ordre du
    // fichier du sponsor.
    const depart = await positionMax(tx, missionId);
    const ordre = ordonnerParentsAvantEnfants(analyse.lignes);

    // Les identifiants sont frappés AVANT l'insertion parce qu'un enfant a besoin de
    // celui de son parent : un UUID v7 par ligne, côté applicatif (11 §2).
    const identifiants = analyse.lignes.map(() => uuidv7());

    const aInserer: NouvelleUniteOrg[] = [];
    for (const indice of ordre) {
      const ligne = analyse.lignes[indice];
      const resolus = codes[indice];
      const id = identifiants[indice];
      if (ligne === undefined || resolus === undefined || id === undefined) {
        throw incoherenceInterne();
      }
      const parentId = ligne.parentIndice === null ? null : identifiants[ligne.parentIndice];
      if (parentId === undefined) throw incoherenceInterne();

      aInserer.push({
        id,
        missionId,
        parentId,
        kind: ligne.kind,
        name: ligne.name,
        countryCode: ligne.countryCode,
        timezone: ligne.timezone,
        headcount: ligne.headcount,
        serviceRefId: resolus.serviceRefId,
        sectorId: resolus.sectorId,
        // Une unité importée par le siège est ACTIVE et DANS le périmètre : le §35.2
        // décrit l'arbre convenu au cadrage, pas des propositions.
        inScope: true,
        status: 'active',
        proposedBy: null,
        // La position suit l'ORDRE DU FICHIER (`ligne.ligne` croît avec le fichier),
        // pas l'ordre d'insertion — sans quoi un enfant listé avant son parent
        // remonterait dans l'affichage.
        position: depart + indice + 1,
      });
    }

    const unitesCreees = await insererUnites(tx, aInserer, maintenant);

    return { rapport: construireRapport(commun, true, erreurs), unitesCreees };
  });

  // Le journal APRÈS le commit, et SEULEMENT si l'arbre a changé : un mode à blanc
  // n'est pas un acte. ⚠ Le RAPPORT n'y entre jamais (`DECISIONS.md` du 2026-08-29).
  if (resultat.rapport.applique) {
    await journaliserActivite(
      {
        action: 'org_unit.import',
        utilisateurId: auteurId,
        missionId,
        unitesCreees: resultat.unitesCreees,
      },
      contexte,
    );
  }

  return resultat.rapport;
}
