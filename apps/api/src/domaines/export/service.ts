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
// ── UN FUSEAU PAR SITE AUDITÉ, ET NON UN POUR TOUTE L'ARCHIVE (M-1) ───────
// Corrigé le 2026-09-06 sur le constat M-1 d'A37. Le §22.2 impose « `missions
// .timezone` **et `org_units.timezone`** (héritage arbre) […] heure locale du site
// audité » ; l'arbitrage du 2026-09-05 écartait d'ailleurs son option 2 en écrivant
// « une mission multi-pays en porte plusieurs » — puis retenait un fuseau unique
// sans traiter le cas qu'il venait de nommer. Un entretien tenu à 16 h 40 à
// Singapour s'écrivait `10:40+02:00` : instant exact, heure fausse pour le rapport.
// `fuseauDeLUnite` remonte l'arbre jusqu'au premier fuseau posé, et retombe sur
// celui de la mission — ce que le `NULL` du 04 signifie exactement.
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
  type UnitePourExport,
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
  'Aucun score n’existe pour cette mission. Le moteur de scoring (03 §32.1) est livré depuis le lot L8, mais il n’est encore relié à aucune route ni à aucun dépôt : les tables block_scores et unit_scores ne sont écrites par personne, et scores.csv est donc absent de cette archive (03 §36.3 : « si L8, sinon absent et signalé »). Il apparaîtra dès que le calcul sera déclenché et persisté.';

const MOTIF_PIECES_JOINTES =
  'Les fichiers eux-mêmes ne sont pas inclus : le téléchargement des pièces jointes appartient au lot L6c et n’est pas livré. Le manifeste liste ce qui a été collecté et permet de le réclamer.';

const REGLE_REPONDANTS_OUVERTE =
  'Le NOM, la FONCTION et le SERVICE du répondant sont écrits UNIQUEMENT pour les sessions dont le consentement a été explicitement recueilli (consent_given = vrai). Un consentement inconnu ou refusé laisse les trois cellules vides : à trois, ces champs identifient une personne dans une petite structure (arbitrage du 2026-09-05, confirmé le 2026-09-06). L’unité auditée, le type de session et la provenance restent renseignés dans tous les cas — ce sont des propriétés de la collecte, pas de la personne.';

const REGLE_REPONDANTS_FERMEE =
  'Cette archive n’identifie AUCUN répondant : l’export a été demandé sans l’option « inclure les répondants », donc ni le nom, ni la fonction, ni le service ne sont écrits. L’unité auditée, le type de session et la provenance le sont — la confrontation direction / terrain se lit sur l’unité (§20.3-4).';

/**
 * LE FUSEAU DE CHAQUE UNITÉ — le sien, sinon celui de son parent, sinon la mission.
 *
 * ── POURQUOI UNE REMONTÉE, ET PAS LA SEULE COLONNE DE L'UNITÉ ──────────────
 * Le 04 pose `org_units.timezone` NULLABLE avec la mention « NULL = fuseau de la
 * mission (héritage par l'arbre) ». « Héritage par l'arbre » veut dire que l'atelier
 * d'une usine de Singapour, dont la colonne est nulle, est à l'heure de Singapour —
 * pas à celle du siège. S'arrêter à la colonne de l'unité ferait retomber toutes les
 * feuilles sur la mission, c'est-à-dire annuler l'héritage en croyant l'appliquer.
 *
 * ── LA BOUCLE EST BORNÉE ───────────────────────────────────────────────────
 * Même garde que `assemblerLignesArbre` : un arbre lu en base peut contenir un
 * cycle, et une remontée nue tournerait indéfiniment. Au-delà du nombre d'unités,
 * on s'arrête sur le fuseau de la mission — un export imparfait vaut mieux qu'un
 * serveur qui ne répond plus.
 *
 * Le résultat est mémorisé par unité : sur FIL-GC, ~8 000 réponses interrogent
 * 150 unités, et une remontée par ligne referait le même chemin des milliers de fois.
 */
function resolveurDeFuseau(
  unites: readonly UnitePourExport[],
  fuseauDeLaMission: string,
): (orgUnitId: string | null | undefined) => string {
  const parId = new Map(unites.map((unite) => [unite.id, unite]));
  const memo = new Map<string, string>();

  return (orgUnitId) => {
    if (orgUnitId === null || orgUnitId === undefined) return fuseauDeLaMission;
    const memorise = memo.get(orgUnitId);
    if (memorise !== undefined) return memorise;

    let courante = parId.get(orgUnitId);
    let garde = 0;
    let trouve: string | null = null;
    while (courante !== undefined && garde <= unites.length) {
      if (courante.timezone !== null && courante.timezone.trim() !== '') {
        trouve = courante.timezone;
        break;
      }
      courante = courante.parentId === null ? undefined : parId.get(courante.parentId);
      garde += 1;
    }

    // `fuseauEffectif` retombe sur UTC si l'identifiant est inconnu d'ICU : une
    // colonne mal renseignée ne fait pas tomber l'export, elle se voit dans le
    // décalage écrit et dans la colonne `fuseau` d'arbre.csv.
    const resolu = trouve === null ? fuseauDeLaMission : fuseauEffectif(trouve);
    memo.set(orgUnitId, resolu);
    return resolu;
  };
}

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

  // ① Le fuseau de chaque site AVANT tout le reste : c'est lui qui date les lignes.
  const fuseauDe = resolveurDeFuseau(unitesBrutes, fuseau);
  const unites = assemblerLignesArbre(unitesBrutes, comptesParUnite, fuseauDe);
  const horsPerimetre = unites.filter((unite) => !unite.inScope).length;

  // ② Chaque ligne reçoit le fuseau de SON site. Le `Omit` du dépôt garantit
  //    qu'aucune ne peut sauter cette étape : elle ne compilerait pas.
  const dater = <T extends { readonly orgUnitId?: string | null }>(
    lignes: readonly T[],
  ): (T & { fuseau: string })[] =>
    lignes.map((ligne) => ({ ...ligne, fuseau: fuseauDe(ligne.orgUnitId) }));

  const sessionsDatees = dater(sessions);
  const reponsesDatees = dater(reponses);
  const constatsDates = dater(constats);
  const casUsageDates = dater(casUsage);
  const outilsDates = dater(outils);
  const systemesIaDates = dater(systemesIa);
  const piecesJointesDatees = dater(piecesJointes);

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
    texte(FICHIERS_EXPORT.sessions, ecrireSessions(sessionsDatees)),
    texte(FICHIERS_EXPORT.reponses, ecrireReponses(reponsesDatees)),
    texte(FICHIERS_EXPORT.constats, ecrireConstats(constatsDates)),
    texte(FICHIERS_EXPORT.casUsage, ecrireCasUsage(casUsageDates)),
    texte(FICHIERS_EXPORT.inventaireOutils, ecrireInventaireOutils(outilsDates)),
    texte(FICHIERS_EXPORT.registreIa, ecrireRegistreIa(systemesIaDates)),
    texte(FICHIERS_EXPORT.unitesHorsPerimetre, ecrireUnitesHorsPerimetre(unites)),
    texte(
      FICHIERS_EXPORT.manifestePiecesJointes,
      ecrireManifestePiecesJointes(piecesJointesDatees),
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
