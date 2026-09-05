// =============================================================================
// SERVICE DE L'EXPORT DE MISSION — 03 §36.3. Lot L7, incrément L7c.
//
// ── CE QUE CE SERVICE DÉCIDE ───────────────────────────────────────────────
// Le 404 (mission inexistante ou non partagée), l'instant de génération, et
// l'assemblage des onze fichiers. Le reste vit ailleurs : le SQL dans le dépôt,
// l'écriture des fichiers dans `fichiers.ts` (pur), le conteneur dans `zip.ts`
// (pur), les horodatages dans `horodatage.ts` (pur).
//
// ── LE CRITÈRE D'ACCEPTATION EST UNE PHRASE, PAS UN TÉLÉCHARGEMENT ────────
// §36.3 : « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP, sans
// retourner dans l'outil ». La correspondance rubrique du rapport → fichier de
// l'export est écrite dans `DESCRIPTIONS_FICHIERS_EXPORT` (paquet partagé) et
// affichée par la console AVANT le téléchargement : un auditeur qui reçoit onze
// fichiers sans savoir lequel nourrit quelle rubrique retourne dans l'outil, et
// le critère tombe pour une raison qui n'a rien de technique.
//
// ── INVARIANT 6 : LE SIÈGE PRODUIT ─────────────────────────────────────────
// Tout se fait ici — lecture, tri, aplatissement des valeurs, compression. Rien
// n'est renvoyé au navigateur pour être assemblé, et rien, jamais, à `apps/field`.
//
// ── INVARIANT 3 : AUCUNE DONNÉE FINANCIÈRE ────────────────────────────────
// Aucune des dix lectures ne touche `scoping_financials`, `scoping_estimates`,
// `estimation_params` ni `mission_rebaselines`. La route ne porte donc AUCUNE
// marque `financier`, et un balayage le vérifie table par table.
//
// Traçabilité : E14 (consolidation, divergences) · E21 · E22 · E36 · E43.
// =============================================================================
import {
  AppError,
  DESCRIPTIONS_FICHIERS_EXPORT,
  FICHIERS_EXPORT,
  metaExportSchema,
  nomFichierExport,
  VERSION_EXPORT,
  type ExportMissionQuery,
  type CleFichierExport,
  type MetaExport,
} from '@axion/shared';
import { db } from '../../db.js';
import {
  assemblerLignesArbre,
  ecrireArbre,
  ecrireCasUsage,
  ecrireConstats,
  ecrireInventaireOutils,
  ecrireManifestePiecesJointes,
  ecrireRegistreIa,
  ecrireReponses,
  ecrireSessions,
  ecrireUnitesHorsPerimetre,
} from './fichiers.js';
import {
  compterPourExport,
  compterSessionsParUnitePourExport,
  lireMissionPourExport,
  listerAuditeurs,
  listerCasUsagePourExport,
  listerConstatsPourExport,
  listerOutilsPourExport,
  listerPiecesJointesPourExport,
  listerReponsesPourExport,
  listerSessionsPourExport,
  listerSystemesIaPourExport,
  listerUnitesPourExport,
  type DemandeurDExport,
} from './depot.js';
import {
  dateDuJourDansLeFuseau,
  fuseauEffectif,
  horodatageExport,
  FORMAT_HORODATAGE_EXPORT,
} from './horodatage.js';
import { construireZip, type EntreeZip } from './zip.js';

/** La clé du fichier de scores — absent tant que L8 n'est pas livré (§36.3). */
const CLE_SCORES: CleFichierExport = 'scores';

/** Le même message que partout ailleurs, et il couvre AUSSI le non-membre (L7b). */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/**
 * La définition de la complétude, écrite DANS le fichier.
 *
 * Ce n'est pas la complétude du scoring (§32.1-3), qui exclut les non
 * communiquées et appartient à L8. Une mesure sans sa définition finit citée dans
 * un rapport avec un sens qu'elle n'a pas (`DECISIONS.md` 2026-09-05).
 */
const DEFINITION_COMPLETUDE =
  'Part des questions du questionnaire figé ayant reçu au moins une réponse, quelle qu’elle soit (y compris « non communiqué » et « sans objet »). Ce n’est PAS la complétude du scoring (03 §32.1-3), qui exclut les réponses non communiquées et qui sera calculée par le lot L8.';

const MOTIF_SCORES_ABSENTS =
  'Le scoring (03 §32.1) n’est pas livré à cette version de l’outil : aucun score par bloc ou par unité n’existe encore, et scores.csv est donc absent de cette archive (03 §36.3 : « si L8, sinon absent et signalé »).';

const MOTIF_PIECES_JOINTES =
  'Les fichiers eux-mêmes ne sont pas inclus : le téléchargement des pièces jointes appartient au lot L6c et n’est pas livré. Le manifeste liste ce qui a été collecté et permet de le réclamer.';

const REGLE_REPONDANTS_OUVERTE =
  'Les noms des répondants sont écrits UNIQUEMENT pour les sessions dont le consentement a été explicitement recueilli (consent_given = vrai). Un consentement inconnu ou refusé laisse la cellule vide.';

const REGLE_REPONDANTS_FERMEE =
  'Aucun nom de répondant n’est écrit dans cette archive : l’export a été demandé sans l’option « inclure les répondants ». Les fonctions et les services restent renseignés.';

/** Ce que la route rend : un nom de fichier et des octets. */
export interface ArchiveExport {
  readonly nomFichier: string;
  readonly archive: Buffer;
  /** Pour le journal d'accès de la route : combien de fichiers, quelle taille. */
  readonly nombreDeFichiers: number;
}

/**
 * `GET /v1/missions/:id/export` — le ZIP du §36.3.
 *
 * Onze lectures, puis des fonctions pures. Rien n'est persisté : un export n'est
 * pas un objet du modèle, c'est une PHOTO d'un état, et deux appels successifs ne
 * diffèrent que par `genereLe`.
 */
export async function produireExportDeMission(
  missionId: string,
  demandeur: DemandeurDExport,
  requete: ExportMissionQuery,
): Promise<ArchiveExport> {
  const mission = await lireMissionPourExport(db, missionId, demandeur);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

  const fuseau = fuseauEffectif(mission.timezone);
  const maintenant = new Date();
  const avecNoms = requete.repondants;

  const [
    auditeurs,
    unitesBrutes,
    comptesParUnite,
    sessions,
    reponses,
    constats,
    casUsage,
    outils,
    systemesIa,
    piecesJointes,
    comptes,
  ] = await Promise.all([
    listerAuditeurs(db, missionId),
    listerUnitesPourExport(db, missionId),
    compterSessionsParUnitePourExport(db, missionId),
    listerSessionsPourExport(db, missionId, avecNoms),
    listerReponsesPourExport(db, missionId, avecNoms),
    listerConstatsPourExport(db, missionId),
    listerCasUsagePourExport(db, missionId),
    listerOutilsPourExport(db, missionId),
    listerSystemesIaPourExport(db, missionId),
    listerPiecesJointesPourExport(db, missionId),
    compterPourExport(db, missionId),
  ]);

  const unites = assemblerLignesArbre(unitesBrutes, comptesParUnite);
  const horsPerimetre = unites.filter((unite) => !unite.inScope).length;

  const meta: MetaExport = metaExportSchema.parse({
    versionExport: VERSION_EXPORT,
    genereLe: horodatageExport(maintenant, fuseau),
    fuseau,
    formatHorodatage: FORMAT_HORODATAGE_EXPORT,
    mission: {
      id: mission.id,
      titre: mission.titre,
      statut: mission.statut,
      niveauAudit: mission.niveauAudit,
      offreCommerciale: mission.offreCommerciale,
      ndaRef: mission.ndaRef,
      ndaSigneeLe: mission.ndaSigneeLe,
      debutPrevu: mission.debutPrevu,
      finPrevue: mission.finPrevue,
      livreeLe: horodatageExport(mission.livreeLe, fuseau),
      creeeLe: horodatageExport(mission.creeeLe, fuseau),
    },
    client: mission.client,
    parametres: {
      fuseau: mission.timezone,
      perimetreGeo: mission.perimetreGeo,
      paysCode: mission.paysCode,
      blocsActifs: [...mission.blocsActifs],
      secteursActifs: [...mission.secteursActifs],
    },
    perimetre: {
      unites: unites.length,
      unitesDansLePerimetre: unites.length - horsPerimetre,
      unitesHorsPerimetre: horsPerimetre,
    },
    auditeurs: [...auditeurs],
    completudeGlobale: {
      definition: DEFINITION_COMPLETUDE,
      questionsFigees: comptes.questionsFigees,
      questionsAvecAuMoinsUneReponse: comptes.questionsAvecAuMoinsUneReponse,
      part: partDeCompletude(comptes.questionsAvecAuMoinsUneReponse, comptes.questionsFigees),
      reponsesCollectees: comptes.reponsesCollectees,
      nonCommuniquees: comptes.nonCommuniquees,
      sansObjet: comptes.sansObjet,
      aRevoir: comptes.aRevoir,
      horsParcours: comptes.horsParcours,
      sessionsPlanifiees: comptes.sessionsPlanifiees,
      sessionsRealisees: comptes.sessionsRealisees,
    },
    scores: { presents: false, motif: MOTIF_SCORES_ABSENTS },
    piecesJointes: {
      manifeste: FICHIERS_EXPORT.manifestePiecesJointes,
      nombre: piecesJointes.length,
      fichiersInclus: false,
      motif: MOTIF_PIECES_JOINTES,
    },
    repondants: {
      nomsInclus: avecNoms,
      regle: avecNoms ? REGLE_REPONDANTS_OUVERTE : REGLE_REPONDANTS_FERMEE,
    },
    fichiers: inventaireDesFichiers(),
  });

  const entrees: EntreeZip[] = [
    texte(FICHIERS_EXPORT.mission, `${JSON.stringify(meta, null, 2)}\n`),
    texte(FICHIERS_EXPORT.arbre, ecrireArbre(unites)),
    texte(FICHIERS_EXPORT.sessions, ecrireSessions(sessions, fuseau)),
    texte(FICHIERS_EXPORT.reponses, ecrireReponses(reponses, fuseau)),
    texte(FICHIERS_EXPORT.constats, ecrireConstats(constats, fuseau)),
    texte(FICHIERS_EXPORT.casUsage, ecrireCasUsage(casUsage, fuseau)),
    texte(FICHIERS_EXPORT.inventaireOutils, ecrireInventaireOutils(outils, fuseau)),
    texte(FICHIERS_EXPORT.registreIa, ecrireRegistreIa(systemesIa, fuseau)),
    texte(FICHIERS_EXPORT.unitesHorsPerimetre, ecrireUnitesHorsPerimetre(unites)),
    texte(
      FICHIERS_EXPORT.manifestePiecesJointes,
      ecrireManifestePiecesJointes(piecesJointes, fuseau),
    ),
    // `scores.csv` est ABSENT, et son absence est dite dans `mission.json` —
    // §36.3 : « si L8, sinon absent et signalé ». Un fichier vide se lirait
    // « aucun score n'a été calculé », ce qui est un autre message.
  ];

  return {
    nomFichier: nomFichierExport(mission.id, dateDuJourDansLeFuseau(maintenant, fuseau)),
    archive: construireZip(entrees),
    nombreDeFichiers: entrees.length,
  };
}

/** Un fichier texte du ZIP. L'UTF-8 est le seul encodage produit (§36.3). */
function texte(nom: string, contenu: string): EntreeZip {
  return { nom, contenu: Buffer.from(contenu, 'utf8') };
}

/**
 * La part de questionnaire abordée, au millième. `null` si le questionnaire est
 * vide — une division par zéro rendrait `NaN`, que `JSON.stringify` écrit `null`
 * de toute façon, mais par accident plutôt que par décision.
 */
function partDeCompletude(avecReponse: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((avecReponse / total) * 1000) / 1000;
}

/**
 * L'inventaire du ZIP, écrit DANS le ZIP.
 *
 * `scores.csv` n'y figure pas : il n'est pas dans l'archive, et l'annoncer ferait
 * chercher un fichier absent. Son absence est dite au champ `scores`.
 */
function inventaireDesFichiers(): { nom: string; contenu: string }[] {
  return Object.entries(FICHIERS_EXPORT)
    .filter(([cle]) => cle !== CLE_SCORES)
    .map(([cle, nom]) => ({
      nom,
      contenu: DESCRIPTIONS_FICHIERS_EXPORT[cle as CleFichierExport],
    }));
}
