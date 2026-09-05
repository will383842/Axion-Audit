// =============================================================================
// LES FICHIERS DE L'EXPORT — FONCTIONS PURES. Lot L7, incrément L7c.
//
// Une fonction par fichier du §36.3 : elle reçoit des lignes DÉJÀ lues, elle rend
// du texte CSV. Aucune requête, aucune date « maintenant », aucun état — deux
// exports du même état rendent le même octet, et c'est ce qui les rend testables.
//
// ── L'ORDRE DES COLONNES EST CELUI DU §36.3, PUIS CELUI DU 04 ──────────────
// Les quatre fichiers dont le §36.3 énumère les colonnes suivent SON ordre. Les
// cinq qu'il se contente de nommer portent TOUTES les colonnes de leur table, en
// `snake_case` — le nom que le lecteur retrouvera au fichier 04 (`DECISIONS.md`
// 2026-09-05). Un sur-ensemble coûte des colonnes ; un sous-ensemble coûte une
// session de travail au rédacteur, et le critère du §36.3 avec elle.
//
// ── DEUX RÈGLES QUI SE VOIENT DANS LE CODE ────────────────────────────────
//   · `aplatirValeur` est CELLE DE L'AGRÉGATION (`pilotage/valeur.ts`), importée,
//     jamais recopiée : « choix = libellés, fourchette = 20 – 30, tableau = JSON »
//     est une règle unique, et son en-tête annonçait déjà cette réutilisation ;
//   · le NOM du répondant n'est jamais décidé ici. Le dépôt transmet `null` quand
//     la porte est fermée (`?repondants=true` + `consent_given IS TRUE`) ; ce
//     module écrit ce qu'il reçoit. Une porte à deux endroits est une porte qu'on
//     finit par ouvrir d'un seul côté.
//
// ── AUCUNE DONNÉE FINANCIÈRE (invariant 3) ────────────────────────────────
// Aucune ligne de ce fichier ne nomme `scoping_financials`, `scoping_estimates`
// ni `estimation_params`. Les montants qu'on y trouve — `use_cases.gain_low`, une
// réponse de type `money` — sont des chiffres COLLECTÉS chez le client, pas la
// donnée commerciale d'Axion (§18.3).
//
// Traçabilité : E14 · E22 · E32 (français, fuseaux) · E36.
// =============================================================================
import { LIBELLES_MOTIF_NON_COMMUNIQUE, SEPARATEUR_LISTE_CELLULE } from '@axion/shared';
import { aplatirValeur } from '../pilotage/valeur.js';
import { ecrireCsv, type ValeurCellule } from './csv.js';
import { horodatageExport } from './horodatage.js';

// -----------------------------------------------------------------------------
// OUTILS COMMUNS
// -----------------------------------------------------------------------------

/** Une liste d'identifiants dans UNE cellule : `a|b|c`. Vide si la liste l'est. */
function listeDeCellule(valeurs: unknown): string {
  if (!Array.isArray(valeurs)) return '';
  return valeurs.filter((v): v is string => typeof v === 'string').join(SEPARATEUR_LISTE_CELLULE);
}

/** Un JSONB rendu tel quel — la donnée reste LISIBLE, fût-elle brute. */
function jsonDeCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (Array.isArray(valeur)) {
    const textes = valeur.filter((v): v is string => typeof v === 'string');
    if (textes.length === valeur.length) return textes.join(SEPARATEUR_LISTE_CELLULE);
  }
  return JSON.stringify(valeur);
}

/** `numeric` de PostgreSQL : Drizzle le rend en chaîne, on ne le convertit pas. */
type Numerique = string | null;

// -----------------------------------------------------------------------------
// arbre.csv — §36.3 : « ref, nom, kind, parent, effectif, in_scope, sessions »
// -----------------------------------------------------------------------------

export interface LigneArbreExport {
  readonly id: string;
  readonly nom: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly parentNom: string | null;
  /** Le chemin complet dans l'arbre — c'est lui qui rend le fichier LISIBLE. */
  readonly chemin: string;
  readonly effectif: number | null;
  readonly inScope: boolean;
  readonly statut: string;
  readonly sessionsPrevues: number;
  readonly sessionsRealisees: number;
}

const ENTETE_ARBRE = [
  'unite_id',
  'nom',
  'kind',
  'parent_id',
  'parent_nom',
  'chemin',
  'effectif',
  'unite_in_scope',
  'statut',
  'sessions_prevues',
  'sessions_realisees',
] as const;

/**
 * L'arbre aplati, trié par CHEMIN : une lecture en profondeur d'abord, celle
 * qu'on attend d'un organigramme. Trier par identifiant rendrait la liste exacte
 * et illisible.
 */
export function ecrireArbre(unites: readonly LigneArbreExport[]): string {
  const triees = [...unites].sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  return ecrireCsv([
    [...ENTETE_ARBRE],
    ...triees.map((u) => [
      u.id,
      u.nom,
      u.kind,
      u.parentId,
      u.parentNom,
      u.chemin,
      u.effectif,
      u.inScope,
      u.statut,
      u.sessionsPrevues,
      u.sessionsRealisees,
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// unites_hors_perimetre.csv — annexe §25.1
// -----------------------------------------------------------------------------

const ENTETE_HORS_PERIMETRE = [
  'unite_id',
  'nom',
  'kind',
  'parent_nom',
  'chemin',
  'effectif',
  'statut',
  'sessions_prevues',
  'sessions_realisees',
] as const;

/**
 * Les unités SORTIES du périmètre — et rien d'autre.
 *
 * ⚠ PAS DE COLONNE `motif`, et ce n'est pas un oubli : le §25.1 dit « unités
 * `in_scope=false` AVEC MOTIF », mais le fichier 04 ne porte aucun motif SUR
 * L'UNITÉ — la décision de recalage vit dans `mission_rebaselines` (une note par
 * DÉCISION, pas par unité) et cette table est visible « ADMIN SEUL » (§25.1).
 * Recopier une note de mission en face de chaque unité inventerait un motif
 * individuel qui n'existe pas. Le point est tracé dans `DECISIONS.md`.
 *
 * Leurs réponses restent dans `reponses.csv`, marquées `unite_in_scope = non` :
 * « jamais deux fichiers de réponses » (§36.3, V2.8).
 */
export function ecrireUnitesHorsPerimetre(unites: readonly LigneArbreExport[]): string {
  const sorties = unites
    .filter((u) => !u.inScope)
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  return ecrireCsv([
    [...ENTETE_HORS_PERIMETRE],
    ...sorties.map((u) => [
      u.id,
      u.nom,
      u.kind,
      u.parentNom,
      u.chemin,
      u.effectif,
      u.statut,
      u.sessionsPrevues,
      u.sessionsRealisees,
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// sessions.csv — §36.3 : « id, type, mode, unité, fonction, auditeur, planifié /
// réalisé, durée, statut »
// -----------------------------------------------------------------------------

export interface LigneSessionExport {
  readonly id: string;
  readonly kind: string;
  readonly mode: string | null;
  readonly orgUnitId: string;
  readonly orgUnitNom: string;
  readonly fonctionPersonne: string | null;
  readonly servicePersonne: string | null;
  /** `null` tant que la porte du §26 n'est pas ouverte — décidé dans le dépôt. */
  readonly nomPersonne: string | null;
  readonly consentement: boolean | null;
  readonly auditeurNom: string | null;
  readonly planifieeLe: Date | null;
  readonly dureePrevueMin: number | null;
  readonly statutPlanification: string;
  readonly statut: string;
  readonly debutLe: Date | null;
  readonly finLe: Date | null;
  readonly notesGenerales: string | null;
}

const ENTETE_SESSIONS = [
  'session_id',
  'type',
  'mode',
  'unite_id',
  'unite_nom',
  'fonction_repondant',
  'service_repondant',
  'nom_repondant',
  'consentement',
  'auditeur',
  'planifiee_le',
  'statut_planification',
  'statut',
  'debut_le',
  'fin_le',
  'duree_prevue_min',
  'duree_reelle_min',
  'notes_generales',
] as const;

/** Minutes entre deux instants, ou `null` : une session non terminée n'a pas de durée. */
function dureeEnMinutes(debut: Date | null, fin: Date | null): number | null {
  if (debut === null || fin === null) return null;
  const millisecondes = fin.getTime() - debut.getTime();
  if (!Number.isFinite(millisecondes) || millisecondes < 0) return null;
  return Math.round(millisecondes / 60_000);
}

export function ecrireSessions(sessions: readonly LigneSessionExport[], fuseau: string): string {
  return ecrireCsv([
    [...ENTETE_SESSIONS],
    ...sessions.map((s) => [
      s.id,
      s.kind,
      s.mode,
      s.orgUnitId,
      s.orgUnitNom,
      s.fonctionPersonne,
      s.servicePersonne,
      s.nomPersonne,
      s.consentement,
      s.auditeurNom,
      horodatageExport(s.planifieeLe, fuseau),
      s.statutPlanification,
      s.statut,
      horodatageExport(s.debutLe, fuseau),
      horodatageExport(s.finLe, fuseau),
      s.dureePrevueMin,
      dureeEnMinutes(s.debutLe, s.finLe),
      s.notesGenerales,
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// reponses.csv — LE fichier central (§36.3), trié bloc → unité → question
// -----------------------------------------------------------------------------

export interface LigneReponseExport {
  readonly answerId: string;
  readonly sessionId: string;
  readonly blocCode: string;
  readonly blocLibelle: string;
  readonly blocPosition: number | null;
  readonly questionCode: string | null;
  readonly questionTexte: string;
  readonly questionPosition: number | null;
  readonly criticite: string | null;
  readonly poids: Numerique;
  readonly typeReponse: string | null;
  readonly sourceAttendue: string | null;
  readonly orgUnitId: string;
  readonly orgUnitNom: string;
  readonly orgUnitInScope: boolean;
  readonly sessionKind: string;
  readonly sessionMode: string | null;
  readonly provenance: string;
  readonly fonctionRepondant: string | null;
  readonly serviceRepondant: string | null;
  readonly nomRepondant: string | null;
  readonly valeur: unknown;
  readonly optionsSnapshot: unknown;
  readonly nonCommunique: boolean;
  readonly motifNonCommunique: string | null;
  readonly sansObjet: boolean;
  readonly motifSansObjet: string | null;
  readonly aRevoir: boolean;
  readonly motifARevoir: string | null;
  readonly horsParcours: boolean;
  readonly note: string | null;
  readonly revision: number;
  readonly misAJourLe: Date;
}

const ENTETE_REPONSES = [
  // Les deux clés de jointure d'abord : c'est ce que `constats.csv` cite, et
  // c'est ce qui rend le §36.6-2 vérifiable au lieu d'être une intention.
  'answer_id',
  'session_id',
  'bloc_code',
  'bloc_libelle',
  'question_code',
  'question_texte',
  'criticite',
  'poids',
  'type_reponse',
  'source_attendue',
  'unite_id',
  'unite_nom',
  'unite_in_scope',
  'session_type',
  'session_mode',
  'provenance',
  'fonction_repondant',
  'service_repondant',
  'nom_repondant',
  'valeur',
  'non_communique',
  'motif_non_communique',
  'sans_objet',
  'motif_sans_objet',
  'a_revoir',
  'motif_a_revoir',
  'hors_parcours',
  'note_consultant',
  'revision',
  'horodatage',
] as const;

/** Le rang d'une position nullable — même réconciliation que dans les dépôts. */
function rang(position: number | null): number {
  return position ?? Number.MAX_SAFE_INTEGER;
}

/** Le motif de refus en FRANÇAIS (§27.4) — c'est ce qui ira aux « Limites et réserves ». */
function motifNonCommuniqueLisible(motif: string | null): string | null {
  if (motif === null) return null;
  return motif in LIBELLES_MOTIF_NON_COMMUNIQUE
    ? LIBELLES_MOTIF_NON_COMMUNIQUE[motif as keyof typeof LIBELLES_MOTIF_NON_COMMUNIQUE]
    : motif;
}

/**
 * `reponses.csv`, trié **bloc → unité → question** comme le §36.3 l'impose.
 *
 * Cet ordre n'est pas un confort : c'est l'ordre dans lequel le rapport se rédige,
 * chapitre par chapitre (un chapitre = un bloc), et unité par unité à l'intérieur.
 * Le tri final sur `answer_id` rend l'ordre TOTAL : deux exports du même état
 * produisent le même fichier, donc se comparent.
 *
 * ⚠ Aucune colonne de score : le §36.3 les conditionne à L8, qui n'est pas livré.
 * Une colonne vide se lirait « aucun score pour cette réponse » (`DECISIONS.md`).
 */
export function ecrireReponses(reponses: readonly LigneReponseExport[], fuseau: string): string {
  const triees = [...reponses].sort(
    (a, b) =>
      rang(a.blocPosition) - rang(b.blocPosition) ||
      a.blocCode.localeCompare(b.blocCode, 'fr') ||
      a.orgUnitNom.localeCompare(b.orgUnitNom, 'fr') ||
      rang(a.questionPosition) - rang(b.questionPosition) ||
      a.questionTexte.localeCompare(b.questionTexte, 'fr') ||
      a.answerId.localeCompare(b.answerId),
  );

  return ecrireCsv([
    [...ENTETE_REPONSES],
    ...triees.map((r): ValeurCellule[] => [
      r.answerId,
      r.sessionId,
      r.blocCode,
      r.blocLibelle,
      r.questionCode,
      r.questionTexte,
      r.criticite,
      r.poids,
      r.typeReponse,
      r.sourceAttendue,
      r.orgUnitId,
      r.orgUnitNom,
      r.orgUnitInScope,
      r.sessionKind,
      r.sessionMode,
      r.provenance,
      r.fonctionRepondant,
      r.serviceRepondant,
      r.nomRepondant,
      aplatirValeur(r.valeur, r.optionsSnapshot),
      r.nonCommunique,
      motifNonCommuniqueLisible(r.motifNonCommunique),
      r.sansObjet,
      r.motifSansObjet,
      r.aRevoir,
      r.motifARevoir,
      r.horsParcours,
      r.note,
      r.revision,
      horodatageExport(r.misAJourLe, fuseau),
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// constats.csv — `findings` + sources (§36.3, §27.2, §36.6-2)
// -----------------------------------------------------------------------------

export interface LigneConstatExport {
  readonly id: string;
  readonly orgUnitId: string | null;
  readonly orgUnitNom: string | null;
  readonly blocCode: string | null;
  readonly severite: string;
  readonly titre: string;
  readonly enonce: string | null;
  readonly sources: unknown;
  readonly recommandation: string | null;
  readonly responsableSuggere: string | null;
  readonly statutRemediation: string;
  readonly vague: string | null;
  readonly statut: string;
  readonly creeLe: Date;
  readonly misAJourLe: Date;
}

const ENTETE_CONSTATS = [
  'finding_id',
  'severite',
  'titre',
  'enonce',
  'unite_id',
  'unite_nom',
  'bloc_code',
  'sources_reponses',
  'sources_sessions',
  'sources_pieces_jointes',
  'recommandation',
  'responsable_suggere',
  'statut_remediation',
  'vague',
  'statut',
  'cree_le',
  'mis_a_jour_le',
] as const;

/** `findings.sources` : `{answer_ids, session_ids, attachment_ids}` (04, §27.2). */
function sourcesDuConstat(brut: unknown): {
  reponses: string;
  sessions: string;
  piecesJointes: string;
} {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    // Forme inattendue : on rend le brut dans la colonne des réponses plutôt que
    // de perdre la source. Un constat sans source citée est un constat qu'on ne
    // peut pas défendre (§27.2) ; l'afficher laid vaut mieux que le taire.
    return {
      reponses: brut === null || brut === undefined ? '' : JSON.stringify(brut),
      sessions: '',
      piecesJointes: '',
    };
  }
  const objet = brut as Record<string, unknown>;
  return {
    reponses: listeDeCellule(objet.answer_ids ?? objet.answerIds),
    sessions: listeDeCellule(objet.session_ids ?? objet.sessionIds),
    piecesJointes: listeDeCellule(objet.attachment_ids ?? objet.attachmentIds),
  };
}

export function ecrireConstats(constats: readonly LigneConstatExport[], fuseau: string): string {
  return ecrireCsv([
    [...ENTETE_CONSTATS],
    ...constats.map((c): ValeurCellule[] => {
      const sources = sourcesDuConstat(c.sources);
      return [
        c.id,
        c.severite,
        c.titre,
        c.enonce,
        c.orgUnitId,
        c.orgUnitNom,
        c.blocCode,
        sources.reponses,
        sources.sessions,
        sources.piecesJointes,
        c.recommandation,
        c.responsableSuggere,
        c.statutRemediation,
        c.vague,
        c.statut,
        horodatageExport(c.creeLe, fuseau),
        horodatageExport(c.misAJourLe, fuseau),
      ];
    }),
  ]);
}

// -----------------------------------------------------------------------------
// cas_usage.csv — toutes les colonnes de `use_cases` (§36.6-5 : les ÉCARTÉS aussi)
// -----------------------------------------------------------------------------

export interface LigneCasUsageExport {
  readonly id: string;
  readonly titre: string;
  readonly description: string | null;
  readonly orgUnitId: string | null;
  readonly orgUnitNom: string | null;
  readonly serviceNom: string | null;
  readonly statut: string;
  readonly conditions: string | null;
  readonly gainEstime: string | null;
  readonly coutEstime: string | null;
  readonly complexite: string | null;
  readonly delaiMois: number | null;
  readonly niveauRisque: string | null;
  readonly vague: string | null;
  readonly valeurInitiale: Numerique;
  readonly uniteInitiale: string | null;
  readonly sessionSourceInitiale: string | null;
  readonly valeurCible: Numerique;
  readonly donneesRequises: string | null;
  readonly donneesDisponibles: string | null;
  readonly approche: string | null;
  readonly indicateurSucces: string | null;
  readonly hypotheses: string | null;
  readonly gainBas: Numerique;
  readonly gainHaut: Numerique;
  readonly retourMois: number | null;
  readonly refTaxonomie: string | null;
  readonly creeLe: Date;
  readonly misAJourLe: Date;
}

const ENTETE_CAS_USAGE = [
  'use_case_id',
  'titre',
  'description',
  'statut',
  'unite_id',
  'unite_nom',
  'service',
  'vague',
  'complexite',
  'delai_mois',
  'niveau_risque',
  'gain_estime',
  'cout_estime',
  'gain_bas',
  'gain_haut',
  'retour_mois',
  'valeur_initiale',
  'unite_de_mesure',
  'session_source_initiale',
  'valeur_cible',
  'indicateur_succes',
  'hypotheses',
  'conditions',
  'donnees_requises',
  'donnees_disponibles',
  'approche',
  'ref_taxonomie',
  'cree_le',
  'mis_a_jour_le',
] as const;

/**
 * Les cas d'usage, **y compris ceux écartés**, avec leur motif dans `conditions`.
 *
 * §36.6-5 : « dire NON fait partie du rapport ». Filtrer les `ecarte` d'un export
 * ferait disparaître le livrable le plus fort de la page publique.
 */
export function ecrireCasUsage(casUsage: readonly LigneCasUsageExport[], fuseau: string): string {
  return ecrireCsv([
    [...ENTETE_CAS_USAGE],
    ...casUsage.map((c): ValeurCellule[] => [
      c.id,
      c.titre,
      c.description,
      c.statut,
      c.orgUnitId,
      c.orgUnitNom,
      c.serviceNom,
      c.vague,
      c.complexite,
      c.delaiMois,
      c.niveauRisque,
      c.gainEstime,
      c.coutEstime,
      c.gainBas,
      c.gainHaut,
      c.retourMois,
      c.valeurInitiale,
      c.uniteInitiale,
      c.sessionSourceInitiale,
      c.valeurCible,
      c.indicateurSucces,
      c.hypotheses,
      c.conditions,
      c.donneesRequises,
      c.donneesDisponibles,
      c.approche,
      c.refTaxonomie,
      horodatageExport(c.creeLe, fuseau),
      horodatageExport(c.misAJourLe, fuseau),
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// inventaire_outils.csv — `tools_inventory` (§27.3-3)
// -----------------------------------------------------------------------------

export interface LigneOutilExport {
  readonly id: string;
  readonly nom: string;
  readonly categorie: string;
  readonly editeur: string | null;
  readonly orgUnitId: string | null;
  readonly orgUnitNom: string | null;
  readonly descriptionUsage: string | null;
  readonly nombreUtilisateurs: number | null;
  readonly criticite: string | null;
  readonly noteQualiteDonnees: string | null;
  readonly sessionSourceId: string | null;
  readonly creeLe: Date;
}

const ENTETE_OUTILS = [
  'tool_id',
  'nom',
  'categorie',
  'editeur',
  'unite_id',
  'unite_nom',
  'description_usage',
  'nombre_utilisateurs',
  'criticite',
  'note_qualite_donnees',
  'session_source_id',
  'cree_le',
] as const;

export function ecrireInventaireOutils(
  outils: readonly LigneOutilExport[],
  fuseau: string,
): string {
  return ecrireCsv([
    [...ENTETE_OUTILS],
    ...outils.map((o): ValeurCellule[] => [
      o.id,
      o.nom,
      o.categorie,
      o.editeur,
      o.orgUnitId,
      o.orgUnitNom,
      o.descriptionUsage,
      o.nombreUtilisateurs,
      o.criticite,
      o.noteQualiteDonnees,
      o.sessionSourceId,
      horodatageExport(o.creeLe, fuseau),
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// registre_ia.csv — `ai_systems`, bloc 9 (§20.3-6 : AI Act et RGPD)
// -----------------------------------------------------------------------------

export interface LigneSystemeIaExport {
  readonly id: string;
  readonly nom: string;
  readonly editeur: string | null;
  readonly orgUnitId: string | null;
  readonly orgUnitNom: string | null;
  readonly serviceNom: string | null;
  readonly descriptionUsage: string | null;
  readonly categoriesDonnees: unknown;
  readonly responsableMetier: string | null;
  readonly roleActeur: string | null;
  readonly niveauRisque: string | null;
  readonly obligations: unknown;
  readonly statutConformite: string | null;
  readonly source: string | null;
  readonly notes: string | null;
  readonly creeLe: Date;
  readonly misAJourLe: Date;
}

const ENTETE_REGISTRE_IA = [
  'ai_system_id',
  'nom',
  'editeur',
  'unite_id',
  'unite_nom',
  'service',
  'description_usage',
  'categories_donnees',
  'responsable_metier',
  'role_acteur',
  'niveau_risque',
  'obligations',
  'statut_conformite',
  'source',
  'notes',
  'cree_le',
  'mis_a_jour_le',
] as const;

export function ecrireRegistreIa(
  systemes: readonly LigneSystemeIaExport[],
  fuseau: string,
): string {
  return ecrireCsv([
    [...ENTETE_REGISTRE_IA],
    ...systemes.map((s): ValeurCellule[] => [
      s.id,
      s.nom,
      s.editeur,
      s.orgUnitId,
      s.orgUnitNom,
      s.serviceNom,
      s.descriptionUsage,
      jsonDeCellule(s.categoriesDonnees),
      s.responsableMetier,
      s.roleActeur,
      s.niveauRisque,
      jsonDeCellule(s.obligations),
      s.statutConformite,
      s.source,
      s.notes,
      horodatageExport(s.creeLe, fuseau),
      horodatageExport(s.misAJourLe, fuseau),
    ]),
  ]);
}

// -----------------------------------------------------------------------------
// pieces_jointes/manifest.csv — §36.3 : « id, session, question, type, fichier »
// -----------------------------------------------------------------------------

export interface LignePieceJointeExport {
  readonly id: string;
  readonly sessionId: string | null;
  readonly answerId: string | null;
  readonly questionTexte: string | null;
  readonly kind: string;
  readonly nomFichier: string | null;
  readonly mime: string | null;
  readonly tailleOctets: number | null;
  readonly contenu: string | null;
  readonly creeLe: Date;
}

const ENTETE_MANIFESTE = [
  'attachment_id',
  'session_id',
  'answer_id',
  'question_texte',
  'type',
  'fichier',
  'mime',
  'taille_octets',
  'contenu_note',
  'cree_le',
] as const;

/**
 * Le manifeste — SANS les fichiers eux-mêmes.
 *
 * Le §36.3 en fait une option ; elle n'est pas livrable en L7c (aucun client
 * d'objet dans l'API, le téléchargement appartient à L6c). `mission.json` le dit
 * en clair plutôt que de laisser croire à un oubli (`DECISIONS.md` 2026-09-05).
 *
 * `contenu_note` porte le corps des NOTES VOLANTES (`attachments.content`, P1-5) :
 * ce sont des observations d'auditeur, et elles n'ont pas de fichier derrière.
 */
export function ecrireManifestePiecesJointes(
  pieces: readonly LignePieceJointeExport[],
  fuseau: string,
): string {
  return ecrireCsv([
    [...ENTETE_MANIFESTE],
    ...pieces.map((p): ValeurCellule[] => [
      p.id,
      p.sessionId,
      p.answerId,
      p.questionTexte,
      p.kind,
      p.nomFichier,
      p.mime,
      p.tailleOctets,
      p.contenu,
      horodatageExport(p.creeLe, fuseau),
    ]),
  ]);
}
