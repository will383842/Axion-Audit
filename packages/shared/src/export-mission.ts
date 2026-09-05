// =============================================================================
// CONTRAT DE L'EXPORT DE MISSION — 03 §36.3. Lot L7, incrément L7c.
//
//   GET /v1/missions/:id/export?repondants=true → un ZIP (application/zip)
//
// ── CE FICHIER EST LA TRANSCRIPTION DU §36.3, PAS SON INTERPRÉTATION ────────
// Le §36.1 le dit lui-même : ce format « n'avait jamais été spécifié jusqu'ici ».
// Ce qu'il écrit est recopié ; ce qu'il laisse ouvert est tranché dans
// `DECISIONS.md` (neuf entrées du 2026-09-05), jamais deviné en silence.
//
// ── POURQUOI DES CONSTANTES PARTAGÉES ET NON DES LITTÉRAUX ─────────────────
// Le nom des fichiers du ZIP est lu à TROIS endroits : le serveur qui les écrit,
// la console qui annonce à l'auditeur ce qu'il va télécharger, et les tests
// d'acceptation d'A36 qui vérifient que le §36.3 est tenu. Trois copies d'une
// même liste dérivent ; une seule ne le peut pas.
//
// ── CE QUE L'EXPORT NE CONTIENT JAMAIS (invariant 3) ───────────────────────
// Rien de `scoping_financials` ni de `scoping_estimates` : ni montant, ni taux
// journalier, ni frais. Une réponse d'audit de type `money` (`answers.value`) EST
// dans le fichier, et ce n'en est pas une contradiction : c'est un chiffre que le
// client a donné au consultant, pas la donnée commerciale d'Axion (§18.3 —
// « l'auditeur ne voit jamais le TJM »). Les deux ne se confondent que si on
// oublie à qui appartient le chiffre.
//
// ── LE CRITÈRE D'ACCEPTATION, RAPPELÉ ICI PARCE QU'IL SE VÉRIFIE ───────────
// §36.3, dernière ligne : « le rapport §20.3 peut être rédigé EN ENTIER depuis le
// ZIP, sans retourner dans l'outil ». Ce n'est pas « le ZIP se télécharge ».
//
// Traçabilité : E14 (consolidation, divergences) · E22 (console de pilotage) ·
// E36 (exécutable par lots avec critères) · E43 (conventions d'API).
// =============================================================================
import { z } from 'zod';
import { dateCivileSchema } from './missions.js';

// -----------------------------------------------------------------------------
// LA FORME DES FICHIERS TEXTE (§36.3 : « UTF-8 avec BOM (Excel FR), séparateur ; »)
// -----------------------------------------------------------------------------

/**
 * Le BOM UTF-8, en tête de CHAQUE `.csv` — et de nulle part ailleurs.
 *
 * Sans lui, Excel FR lit un fichier UTF-8 en Windows-1252 : « é » devient « Ã© »
 * dans toutes les cellules. Avec lui devant un JSON, `JSON.parse` échoue en mode
 * strict — c'est pourquoi `mission.json` n'en porte pas (`DECISIONS.md`
 * 2026-09-05, entrée sur le conteneur ZIP).
 */
export const BOM_UTF8 = '\uFEFF';

/**
 * Le point-virgule, imposé par le §36.3, et pas par confort : en français, la
 * virgule est le séparateur DÉCIMAL. Un CSV à virgules couperait « 3,5 » en deux
 * cellules dans un tableur configuré en français.
 */
export const SEPARATEUR_CSV = ';';

/** Le séparateur des listes DANS une cellule (identifiants de sources, pays…). */
export const SEPARATEUR_LISTE_CELLULE = '|';

/**
 * VERSION DU FORMAT D'EXPORT — « version d'export » de la liste de méta du §36.3.
 *
 * Elle vit dans `mission.json` et change dès qu'une colonne change de sens. Un
 * ZIP archivé trois ans plus tôt doit pouvoir dire de quelle grammaire il relève :
 * un rapport d'audit se conteste, et l'export en est la pièce.
 */
export const VERSION_EXPORT = '1.0';

// -----------------------------------------------------------------------------
// LES FICHIERS DU ZIP — la liste du §36.3, dans son ordre
// -----------------------------------------------------------------------------

/**
 * Les noms de fichiers du §36.3, recopiés à la lettre.
 *
 * `scores` est déclaré ici bien qu'il ne soit PAS écrit tant que L8 n'existe
 * pas : le §36.3 en fait un fichier conditionnel (« si L8, sinon absent et
 * signalé »), et le déclarer permet à L8 de le remplir sans réinventer son nom.
 */
export const FICHIERS_EXPORT = {
  mission: 'mission.json',
  arbre: 'arbre.csv',
  sessions: 'sessions.csv',
  reponses: 'reponses.csv',
  constats: 'constats.csv',
  casUsage: 'cas_usage.csv',
  inventaireOutils: 'inventaire_outils.csv',
  registreIa: 'registre_ia.csv',
  unitesHorsPerimetre: 'unites_hors_perimetre.csv',
  scores: 'scores.csv',
  manifestePiecesJointes: 'pieces_jointes/manifest.csv',
} as const;

export type CleFichierExport = keyof typeof FICHIERS_EXPORT;

/**
 * Ce que chaque fichier apporte au rapport §20.3 — le texte que la console
 * affiche AVANT le téléchargement.
 *
 * Ce n'est pas de la décoration : le critère d'acceptation du §36.3 est « le
 * rapport peut être rédigé EN ENTIER depuis le ZIP ». Un auditeur qui reçoit onze
 * fichiers sans savoir lequel nourrit quelle rubrique retourne dans l'outil, et le
 * critère tombe pour une raison qui n'a rien de technique.
 */
export const DESCRIPTIONS_FICHIERS_EXPORT: Record<CleFichierExport, string> = {
  mission:
    'Méta de la mission : client, niveau, périmètre, dates, auditeurs, complétude globale, paramètres, présence des scores, version d’export. Nourrit la page de garde et le chapitre « Contexte, périmètre et méthodologie » (§20.3-1 et 3).',
  arbre:
    'Les unités de l’organisation, aplaties, avec leur effectif, leur appartenance au périmètre et leurs sessions prévues / réalisées. Nourrit la cartographie de l’organisation (§20.3-4).',
  sessions:
    'Une ligne par session de collecte : type, mode, unité, fonction de la personne, auditeur, planifié / réalisé, durée, statut. Nourrit « entretiens menés » de la méthodologie (§20.3-3).',
  reponses:
    'LE fichier central : une ligne par réponse, triée bloc → unité → question, avec provenance, non communiqué, sans objet, à revoir, hors parcours, note et horodatage. Nourrit toutes les rubriques d’analyse, et c’est lui que chaque constat cite (§36.6-2).',
  constats:
    'Les constats (`findings`) avec leurs sources : identifiants de réponses, de sessions et de pièces jointes, à relire dans reponses.csv. Nourrit les frictions, les drapeaux rouges et la synthèse (§20.3-2, 4 et 5).',
  casUsage:
    'Les cas d’usage, y compris ceux ÉCARTÉS avec leur motif — dire non fait partie du rapport (§36.6-5). Nourrit les opportunités et les recommandations chiffrées (§20.3-7 et 8).',
  inventaireOutils:
    'L’inventaire des outils et systèmes par unité (§27.3-3). Nourrit la cartographie applicative (§20.3-4 et 7).',
  registreIa:
    'Le registre des usages IA : rôle d’acteur, niveau de risque, obligations, statut de conformité. Nourrit le chapitre AI Act et RGPD (§20.3-6).',
  unitesHorsPerimetre:
    'Les unités sorties du périmètre et leur motif (annexe §25.1). Leurs réponses restent dans reponses.csv, marquées `unite_in_scope = non`.',
  scores:
    'Scores par bloc × unité, complétude et caractère indicatif. Écrit par le scoring (L8) ; absent tant qu’il n’est pas livré, et son absence est signalée dans mission.json.',
  manifestePiecesJointes:
    'Le manifeste des pièces jointes : identifiant, session, question, type, fichier. Les fichiers eux-mêmes ne sont pas inclus à cette version (voir mission.json).',
};

// -----------------------------------------------------------------------------
// LA REQUÊTE
// -----------------------------------------------------------------------------

/**
 * `?repondants=true` — LA PORTE DU NOM DU RÉPONDANT, ET ELLE EST SERVEUR.
 *
 * Arbitrage A01 du 2026-09-05 : le nom, la fonction et le service ne s'écrivent
 * que si `consent_given = true` STRICT (le nul vaut non) **et** derrière une
 * action explicite. La porte est ici, dans la requête, et non dans un composant
 * qui masquerait un nom déjà arrivé au navigateur — « masqué » n'est pas « non
 * transmis » (invariant 3 : aucun contrôle uniquement côté client).
 *
 * UNE SEULE GRAPHIE EST ACCEPTÉE (`true`), et c'est délibéré : `z.coerce.boolean()`
 * rendrait `true` pour la chaîne `"false"` — le contraire exact de la demande, sur
 * une donnée personnelle. Une énumération ne peut pas se tromper de sens.
 */
const consentementExplicite = z
  .enum(['true', 'false'])
  .default('false')
  .transform((valeur) => valeur === 'true');

export const exportMissionQuerySchema = z.object({
  repondants: consentementExplicite,
});

export type ExportMissionQuery = z.infer<typeof exportMissionQuerySchema>;

// -----------------------------------------------------------------------------
// `mission.json` — LA MÉTA, VALIDÉE AVANT D'ENTRER DANS L'ARCHIVE
// -----------------------------------------------------------------------------
// La route rend un binaire et n'a donc pas de schéma Zod de SORTIE (11 §3,
// écart tracé le 2026-09-05). Ce qui, DANS le ZIP, est du JSON est validé par ce
// schéma avant sérialisation : le seul fichier structuré de l'export ne part pas
// sans contrat.

/**
 * Un horodatage de l'export : ISO 8601 **avec le décalage du fuseau de mission**
 * (`2026-10-14T09:30:00+02:00`), et non l'UTC nu de l'API.
 *
 * `isoUtcSchema` refuse un décalage ; celui-ci l'EXIGE. Ce n'est pas une entorse à
 * l'invariant 5 : l'export est un affichage — un rapport se rédige avec l'heure à
 * laquelle la chose a eu lieu pour ceux qui l'ont vécue (`DECISIONS.md`
 * 2026-09-05, « dans quel fuseau les horodatages de l'export sont-ils écrits ? »).
 */
export const isoAvecDecalageSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/,
    'Horodatage ISO 8601 avec décalage de fuseau (03 §36.3, DECISIONS.md 2026-09-05)',
  );

// La date civile (`AAAA-MM-JJ`, sans heure donc sans fuseau) est celle que
// `missions.ts` définit déjà : le paquet partagé n’en porte qu’une définition.

/** Un auditeur de la mission — nom et rôle sur la mission, jamais son adresse. */
export const auditeurExportSchema = z.strictObject({
  utilisateurId: z.uuid(),
  nom: z.string(),
  roleSurMission: z.string(),
});

/**
 * La complétude, AVEC sa définition dans le fichier.
 *
 * Ce n'est PAS la complétude du scoring (§32.1-3), qui exclut les non
 * communiquées et appartient à L8. Une mesure qui ne porte pas sa définition finit
 * citée dans un rapport avec un sens qu'elle n'a pas (`DECISIONS.md` 2026-09-05).
 */
export const completudeExportSchema = z.strictObject({
  definition: z.string(),
  questionsFigees: z.number().int().min(0),
  questionsAvecAuMoinsUneReponse: z.number().int().min(0),
  /** Entre 0 et 1, arrondi au millième. `null` si le questionnaire est vide. */
  part: z.number().min(0).max(1).nullable(),
  reponsesCollectees: z.number().int().min(0),
  nonCommuniquees: z.number().int().min(0),
  sansObjet: z.number().int().min(0),
  aRevoir: z.number().int().min(0),
  horsParcours: z.number().int().min(0),
  sessionsPlanifiees: z.number().int().min(0),
  sessionsRealisees: z.number().int().min(0),
});

export const metaExportSchema = z.strictObject({
  versionExport: z.literal(VERSION_EXPORT),
  genereLe: isoAvecDecalageSchema,
  /** Le fuseau dans lequel TOUS les horodatages du ZIP sont écrits. */
  fuseau: z.string(),
  formatHorodatage: z.string(),
  mission: z.strictObject({
    id: z.uuid(),
    titre: z.string(),
    statut: z.string(),
    niveauAudit: z.string(),
    offreCommerciale: z.string().nullable(),
    ndaRef: z.string().nullable(),
    ndaSigneeLe: dateCivileSchema.nullable(),
    debutPrevu: dateCivileSchema.nullable(),
    finPrevue: dateCivileSchema.nullable(),
    livreeLe: isoAvecDecalageSchema.nullable(),
    creeeLe: isoAvecDecalageSchema,
  }),
  client: z.strictObject({
    id: z.uuid(),
    nom: z.string(),
    siren: z.string().nullable(),
    codeNaf: z.string().nullable(),
    effectif: z.number().int().nullable(),
    nombreDeSites: z.number().int().nullable(),
    pays: z.array(z.string()),
  }),
  /** « Paramètres » du §36.3 = ceux de la MISSION, jamais les abaques d'Axion. */
  parametres: z.strictObject({
    fuseau: z.string(),
    perimetreGeo: z.string(),
    paysCode: z.string().nullable(),
    blocsActifs: z.array(z.string()),
    secteursActifs: z.array(z.string()),
  }),
  perimetre: z.strictObject({
    unites: z.number().int().min(0),
    unitesDansLePerimetre: z.number().int().min(0),
    unitesHorsPerimetre: z.number().int().min(0),
  }),
  auditeurs: z.array(auditeurExportSchema),
  completudeGlobale: completudeExportSchema,
  /** §36.3 : « présence ou non des scores (L8) ». */
  scores: z.strictObject({
    presents: z.boolean(),
    motif: z.string().nullable(),
  }),
  /** L'option « fichiers inclus » du §36.3, et pourquoi elle ne l'est pas. */
  piecesJointes: z.strictObject({
    manifeste: z.string(),
    nombre: z.number().int().min(0),
    fichiersInclus: z.boolean(),
    motif: z.string().nullable(),
  }),
  /** L'état de la porte du nom du répondant, écrit dans le fichier lui-même. */
  repondants: z.strictObject({
    nomsInclus: z.boolean(),
    regle: z.string(),
  }),
  fichiers: z.array(z.strictObject({ nom: z.string(), contenu: z.string() })),
});

export type MetaExport = z.infer<typeof metaExportSchema>;

/**
 * Le nom du ZIP — `export_mission_<ref>_<AAAAMMJJ>.zip` (§36.3).
 *
 * `<ref>` est l'identifiant de la mission : le fichier 04 ne porte AUCUNE
 * référence de mission lisible, et `companies.external_ref` nommerait le client
 * (`DECISIONS.md` 2026-09-05). La date est celle du jour DANS LE FUSEAU DE
 * MISSION, comme tous les horodatages du ZIP.
 */
export function nomFichierExport(missionId: string, dateAaaammjj: string): string {
  return `export_mission_${missionId}_${dateAaaammjj}.zip`;
}
