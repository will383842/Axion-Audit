// =============================================================================
// FIXTURE — LA MISSION DE SÉANCE **FIL-TPE**, SOUS FORME DE `.axionbackup`
//
// ── LE MUR QUE CE FICHIER CONTOURNE, ET COMMENT ─────────────────────────────
// `SEANCE_MATERIELLE_P-C.md` V-0.7 demande de « tirer la mission FIL-TPE
// (premier pull) », et V-1 à V-9 en dépendent toutes. Or le premier pull est du
// L6, et L6 n'a pas une ligne : mesuré en navigateur sur staging le 2026-09-09,
// « Nouvel entretien » répond « Aucune mission sur cet appareil » et
// « Aujourd'hui » répond « Le téléchargement d'une mission arrive AVEC LA
// SYNCHRONISATION ». La séance a besoin de L6 ; L6 ne s'ouvre qu'après P-C.
//
// La boucle se casse par la porte que l'application OUVRE DÉJÀ, et sans réseau :
// « Restaurer une sauvegarde de secours ». `importerSauvegarde` (11 §4) écrit
// les SEPT tables miroirs par `appliquerDescente` — mission, questionnaire figé,
// arbre d'unités, sessions, réponses — puis POSE LA MARQUE D'EMBARQUEMENT. Ce
// n'est donc pas « seulement les données de collecte » : c'est une mission
// utilisable, et c'est ce qui rend l'option tenable.
//
// ── AUCUNE CRYPTO RÉÉCRITE (09 §5.7) ────────────────────────────────────────
// Les octets viennent du code de PRODUCTION : `deriverKek` (Argon2id, hash-wasm,
// profil OWASP `PARAMETRES_KDF_DEFAUT`), `genererSel`, `crypto.subtle` en
// AES-256-GCM, `versBase64`. Aucun paramètre affaibli, aucun mock : un fichier
// produit autrement serait refusé par l'iPad, et ce serait tant mieux.
//
// Le payload d'une sauvegarde est en CLAIR sous la clé du fichier (11 §4 : « PAS
// de la DEK appareil ») — aucun coffre n'est donc monté ici. C'est
// `appliquerDescente` qui re-chiffre chaque ligne sous la DEK de l'appareil qui
// restaure, ce qui est exactement ce qui rend le fichier portable.
//
// ── CE QUE CE FICHIER N'EST PAS ─────────────────────────────────────────────
// Il n'écrit dans aucun fichier de production, n'ajoute aucune porte d'amorçage
// et ne rend vrai aucun chemin qui serait faux sans lui. Un appareil réel
// obtiendra ces lignes par le premier pull de L6a le jour où il existera.
//
// Invariant 2 : mission FIL-TPE, entreprise, unités et PERSONNES toutes
// INVENTÉES. Aucune référence client, nulle part.
//
// Traçabilité : E6 (hors ligne total) · E38 (export de secours chiffré, création
// et restauration testées) · E31 (généricité absolue, aucune référence client) ·
// E44 (ancres de cotation visibles, mode écran partagé) · E33 (sécurité / RGPD).
//
// ── LE FICHIER DÉJÀ LIVRÉ EST ANTÉRIEUR À CE CORRECTIF, ET ON NE LE REFAIT PAS ─
// Le `.axionbackup` de `docs/portes/preuves/P-C/`, produit et éprouvé le
// 2026-09-09, a été fabriqué AVANT la correction du 2026-09-10 sur la question 12
// (voir plus bas). Il contient donc encore cette question dans l'état impossible :
// `scale_1_5` + `guidance: null` + `addedAdHoc: false`.
//
// Il n'est PAS refabriqué. Son SHA-256 `e6267aab…2bf3dcde` est consigné dans
// `docs/ETAT.md` et dans `DECISIONS.md` ; le refabriquer changerait l'empreinte et
// invaliderait une preuve déjà tracée, sans rien gagner pour la séance — V-5.5 a
// été amendée le 2026-09-10 et se joue désormais par le CHEMIN AD HOC, créé à
// l'écran sur l'iPad.
//
// QUICONQUE REFABRIQUE OBTIENDRA UN FICHIER DIFFÉRENT DE CELUI DU 2026-09-09, ET
// C'EST NORMAL : l'empreinte consignée vaut pour le fichier livré, pas pour la
// sortie de cet outil à une date ultérieure (le sel, le nonce et les instants sont
// neufs à chaque exécution — deux fabrications n'ont jamais la même empreinte).
// =============================================================================
import {
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
} from '../../apps/field/src/local/coffre.js';
import {
  LONGUEUR_NONCE_OCTETS,
  versBase64,
  VERSION_ENVELOPPE,
} from '../../apps/field/src/local/enveloppe.js';
import { VERSION_SCHEMA_LOCAL } from '../../apps/field/src/local/base.js';
import {
  jetonsDeRecherche,
  type ChargeAnswer,
  type ChargeInterview,
  type ChargeMission,
  type ChargeMissionQuestion,
  type ChargeOrgUnit,
  type IndexAnswer,
  type IndexInterview,
  type IndexMission,
  type IndexMissionQuestion,
  type IndexOrgUnit,
} from '../../apps/field/src/local/formes.js';
import {
  contenuSauvegardeSchema,
  nomFichierSauvegarde,
  VERSION_FORMAT_SAUVEGARDE,
  type ContenuSauvegarde,
  type FichierSauvegarde,
  type LigneSauvegardee,
} from '../../apps/field/src/sauvegarde/format.js';
import { MISSION_FIL_TPE } from '../fixtures/appareil-terrain.js';

/**
 * Le mot de passe du FICHIER — pas celui de l'appareil.
 *
 * 11 §4 : la clé du `.axionbackup` dérive du mot de passe utilisateur, et le sel
 * est dans l'en-tête. Il n'a donc RIEN à voir avec le mot de passe que Williams
 * a créé sur son iPad : l'un ouvre le fichier, l'autre ouvre l'appareil. C'est
 * précisément ce qui rend une sauvegarde restaurable sur un appareil neuf.
 *
 * Secret FACTICE (CLAUDE.md §2), ≥ `MOT_DE_PASSE_LONGUEUR_MIN` caractères.
 */
export const MOT_DE_PASSE_SAUVEGARDE_SEANCE = 'SeanceAudit2026';

/**
 * Le fuseau de la mission. Le cockpit découpe « aujourd'hui » DESSUS (03 §34.2),
 * jamais au fuseau de l'appareil : c'est lui qui décide de ce que V-0.7 montre.
 */
const FUSEAU_MISSION = 'Europe/Paris';

/**
 * Combien de journées d'agenda le fichier emporte.
 *
 * Un `.axionbackup` est FIGÉ : une seule journée planifiée le rendrait périmé le
 * lendemain, et V-0.7 (« l'agenda du jour porte au moins une session planifiée »)
 * échouerait pour une raison qui n'a rien à voir avec l'application. La séance
 * n'a pas de date arrêtée ; le fichier couvre donc deux semaines à partir du jour
 * de sa fabrication, et l'écran n'en montre qu'une — `depotSessions.duJour`
 * filtre sur le jour civil du fuseau de mission.
 */
const JOURNEES_PLANIFIEES = 14;

/**
 * Identifiants v7 LITTÉRAUX, comme dans `appareil-terrain.ts` et pour les mêmes
 * raisons : une fixture déterministe se relit dans une trace, et le seul
 * générateur d'UUID autorisé (`uuidv7`, invariant 1) n'est pas une dépendance de
 * la racine. La famille `0003` est libre — `0000` est FIL-TPE E2E, `0002` FIL-GC.
 */
const MISSION_ID = MISSION_FIL_TPE.id;
const SOCIETE_ID = '01920000-0003-7000-8000-000000000003';
const AUDITEUR_ID = '01920000-0003-7000-8000-000000000004';
const QUESTION_BANQUE_ID = '01920000-0003-7000-8000-00000000000a';

function identifiant(famille: number, rang: number): string {
  const suffixe = (famille * 100_000 + rang).toString(16).padStart(12, '0');
  return `01920000-0003-7000-8000-${suffixe}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// L'ARBRE D'UNITÉS — cinq unités, deux niveaux, toutes inventées
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Assez large pour que V-2.7 (« une session de deux types différents ») ait de
 * quoi choisir et que la liste d'unités ne soit pas un champ à une seule option,
 * assez court pour rester lisible sur une tablette. La feuille canonique porte
 * l'identifiant de `MISSION_FIL_TPE` : le même atelier que l'E2E, à l'écran.
 */
interface UniteSeance {
  readonly id: string;
  readonly nom: string;
  readonly kind: IndexOrgUnit['kind'];
  readonly parentId: string | null;
  readonly effectif: number;
}

const RACINE_ID = identifiant(1, 1);

const UNITES: readonly UniteSeance[] = [
  { id: RACINE_ID, nom: 'Site de production', kind: 'etablissement', parentId: null, effectif: 38 },
  {
    id: MISSION_FIL_TPE.uniteId,
    nom: MISSION_FIL_TPE.unite,
    kind: 'service',
    parentId: RACINE_ID,
    effectif: 14,
  },
  {
    id: identifiant(1, 3),
    nom: 'Bureau d’études',
    kind: 'service',
    parentId: RACINE_ID,
    effectif: 5,
  },
  {
    id: identifiant(1, 4),
    nom: 'Service commercial',
    kind: 'service',
    parentId: RACINE_ID,
    effectif: 6,
  },
  {
    id: identifiant(1, 5),
    nom: 'Administration et comptabilité',
    kind: 'service',
    parentId: RACINE_ID,
    effectif: 4,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LE QUESTIONNAIRE FIGÉ — et ses ancres de cotation §32.4
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les ancres sont DÉCLARÉES, la chaîne `guidance_fr` est FABRIQUÉE à partir
 * d'elles : V-5.1 et V-5.2 comparent l'écran à cette liste, jamais à une seconde
 * copie du même texte. Les niveaux 1, 3 et 5 seulement — c'est ce
 * qu'`ANCRES_REQUISES` exige et ce que la banque contient réellement ; ancrer les
 * cinq crans masquerait la mention « Ancre dérivée » que V-5.6 fait lire.
 *
 * Aucun chiffre suivi de « = » ou « : » dans une consigne : le parseur du pack le
 * lirait comme une ancre et amputerait la consigne. C'est une contrainte de
 * rédaction de la banque, pas du test.
 */
interface JeuAncres {
  readonly ancres: readonly { readonly niveau: number; readonly libelle: string }[];
  readonly consigne: string;
}

function guidance(jeu: JeuAncres): string {
  return [
    ...jeu.ancres.map((ancre) => `${String(ancre.niveau)} = ${ancre.libelle}`),
    jeu.consigne,
  ].join(' · ');
}

/** Les ancres de la question que V-5.1 et V-5.2 font lire à l'œil. */
export const ANCRES_QUESTION_OUTIL: JeuAncres = {
  ancres: [
    { niveau: 1, libelle: 'aucun outil, tout vit sur des carnets et dans les mémoires' },
    { niveau: 3, libelle: 'un outil existe et sert la facturation, mais l’atelier le contourne' },
    {
      niveau: 5,
      libelle: 'l’outil porte le flux de bout en bout, et ses écarts sont revus chaque semaine',
    },
  ],
  consigne:
    'Faire décrire une commande récente de bout en bout avant de coter, ' +
    'en demandant qui ressaisit quoi, et à quel moment.',
};

const ANCRES_PASSATION: JeuAncres = {
  ancres: [
    { niveau: 1, libelle: 'la consigne se transmet oralement, et se perd avec la personne' },
    { niveau: 3, libelle: 'un cahier de liaison existe, tenu quand le temps le permet' },
    { niveau: 5, libelle: 'la passation est écrite, relue à la prise de poste et tracée' },
  ],
  consigne:
    'Demander comment l’équipe du matin apprend ce qui s’est passé la nuit, ' +
    'puis faire montrer le support cité.',
};

const ANCRES_SAUVEGARDE: JeuAncres = {
  ancres: [
    { niveau: 1, libelle: 'aucune copie hors du poste qui produit les données' },
    { niveau: 3, libelle: 'une copie existe, personne n’a jamais tenté de la relire' },
    {
      niveau: 5,
      libelle: 'la copie est automatique, externalisée, et sa restauration est éprouvée',
    },
  ],
  consigne:
    'Faire raconter le dernier incident de perte de données, et ce qui a permis de repartir.',
};

interface QuestionSeance {
  readonly id: string;
  readonly texte: string;
  readonly type: IndexMissionQuestion['answerType'];
  readonly criticite: IndexMissionQuestion['criticality'];
  readonly bloc: string;
  readonly guidance: string | null;
  /**
   * Question créée AU TERRAIN (03 §25.3) plutôt que tirée de la banque.
   *
   * Champ OBLIGATOIRE et non optionnel, et c'est délibéré : le compilateur force
   * ainsi chaque question future à répondre, et la garde de
   * `mission-seance.test.ts` vérifie que la réponse est compatible avec
   * l'absence d'ancre. Un défaut par omission n'est plus possible.
   */
  readonly addedAdHoc: boolean;
}

/**
 * Douze questions sur trois blocs.
 *
 * Trois blocs et non un seul : la zone gauche de l'écran d'entretien (03 M3.1)
 * est une liste de BLOCS, et V-4.2 demande de la voir peinte à côté des deux
 * autres. Un questionnaire mono-bloc y afficherait une colonne à une ligne, donc
 * ne montrerait pas ce que la ligne 1 de `LOT_L5.md` §4 fait vérifier.
 *
 * ── LA QUESTION 12 EST UNE QUESTION AD HOC DU TERRAIN, ET ELLE DOIT L'ÊTRE ──
 * V-5.5 demande de lire le repli « Aucune ancre de cotation n'est fournie pour
 * cette question. » Il faut donc une `scale_1_5` SANS ancre — et la première
 * version de cette fixture en fabriquait une en la posant dans le questionnaire
 * figé, drapeau `addedAdHoc` à `false`.
 *
 * C'ÉTAIT UN FAUX TÉMOIN, et la qualification d'A30 du 2026-09-10 l'a établi :
 * `ANCRES_ABSENTES` (`packages/shared/src/banque-questions.ts`) est un contrôle
 * BLOQUANT d'admission sur toute `scale_1_5` sans ancre (§32.4). Une question de
 * BANQUE dans cet état ne peut donc JAMAIS atteindre un appareil réel : l'écran
 * serait passé au vert sur une donnée que la production refuse. C'est exactement
 * le défaut qu'`e2e/hors-ligne-l5.e2e.ts` avait corrigé de son côté — même angle
 * mort, n'avoir regardé que le chemin banque.
 *
 * LE REPLI N'EST PAS DU CODE MORT POUR AUTANT, et c'est le second acquis d'A30 :
 * il s'atteint par la QUESTION AD HOC du terrain — `DialogueQuestionAdHoc.tsx`
 * propose `scale_1_5`, le champ « Consigne (facultative) » peut rester vide, et
 * `questions-adhoc.ts` écrit alors `guidanceSnapshot: null` avec `addedAdHoc`
 * à `true`. La fixture atteignait le bon état par un chemin faux.
 *
 * La question 12 est donc CONSERVÉE, mais comme ce qu'elle est réellement : une
 * question ad hoc créée lors d'une session antérieure de la mission, restituée
 * par la sauvegarde. Elle porte pour cela TOUT ce que `creerQuestionAdHoc` écrit,
 * et pas seulement le drapeau — `criticality: 'informatif'`, `weightSnapshot: 0`,
 * et un `questionId` PROPRE (une question ad hoc ne cite aucune entrée de
 * banque). Un drapeau vrai posé sur une charge de banque aurait seulement déplacé
 * l'état impossible d'un champ à l'autre.
 *
 * ELLE NE PORTE PLUS V-5.5 À ELLE SEULE : la ligne a été amendée le 2026-09-10
 * pour passer par le chemin ad hoc, créé à l'écran pendant la séance. Elle reste
 * ici pour deux raisons — c'est la seule ligne du fichier qui fasse traverser une
 * charge ad hoc à `appliquerDescente`, et elle laisse le repli observable même si
 * la création en direct achoppe, ce que la séance doit pouvoir distinguer d'un
 * défaut d'affichage.
 *
 * L'INVARIANT EST GARDÉ, ET AILLEURS : `e2e/outils/mission-seance.test.ts` refuse
 * toute `scale_1_5` sans ancre qui ne serait pas ad hoc. Il tourne dans le projet
 * vitest `unit`, donc dans `pnpm verify:rapide` et au `pre-push`, sans réseau ni
 * staging. Sans cette garde, le défaut reviendrait à la prochaine question ajoutée.
 */
const QUESTIONS: readonly QuestionSeance[] = [
  {
    id: identifiant(9, 1),
    texte: 'Décrivez le déroulement d’une commande, de sa réception à sa livraison.',
    type: 'free_text',
    criticite: 'important',
    bloc: 'B1',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 2),
    texte: 'Les procédures de l’atelier sont-elles écrites ?',
    type: 'yes_no',
    criticite: 'important',
    bloc: 'B1',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 3),
    texte: 'À quel point l’outil de gestion couvre-t-il vos besoins ?',
    type: 'scale_1_5',
    criticite: 'bloquant',
    bloc: 'B1',
    addedAdHoc: false,
    guidance: guidance(ANCRES_QUESTION_OUTIL),
  },
  {
    id: identifiant(9, 4),
    texte: 'Qui décide de lancer une production, et sur quelle information ?',
    type: 'free_text',
    criticite: 'important',
    bloc: 'B1',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 5),
    texte: 'Comment la consigne passe-t-elle d’une équipe à la suivante ?',
    type: 'scale_1_5',
    criticite: 'important',
    bloc: 'B2',
    addedAdHoc: false,
    guidance: guidance(ANCRES_PASSATION),
  },
  {
    id: identifiant(9, 6),
    texte: 'Un point de coordination réunit-il régulièrement les responsables ?',
    type: 'yes_no',
    criticite: 'informatif',
    bloc: 'B2',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 7),
    texte: 'Combien de personnes interviennent sur une même commande ?',
    type: 'number',
    criticite: 'informatif',
    bloc: 'B2',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 8),
    texte: 'Que se passe-t-il quand une pièce livrée revient non conforme ?',
    type: 'free_text',
    criticite: 'bloquant',
    bloc: 'B2',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 9),
    texte: 'Les données de gestion sont-elles sauvegardées hors du poste qui les produit ?',
    type: 'scale_1_5',
    criticite: 'bloquant',
    bloc: 'B3',
    addedAdHoc: false,
    guidance: guidance(ANCRES_SAUVEGARDE),
  },
  {
    id: identifiant(9, 10),
    texte: 'Quelle part des commandes part en retard sur un mois ordinaire ?',
    type: 'percent',
    criticite: 'important',
    bloc: 'B3',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 11),
    texte: 'Un nouvel arrivant est-il accompagné pendant ses premiers jours ?',
    type: 'yes_no',
    criticite: 'informatif',
    bloc: 'B3',
    addedAdHoc: false,
    guidance: null,
  },
  {
    id: identifiant(9, 12),
    texte: 'À quel point les habilitations d’accès sont-elles tenues à jour ?',
    type: 'scale_1_5',
    // 'informatif' et non 'important' : `creerQuestionAdHoc` ne propose pas la
    // criticité et l'écrit en dur. Une ad hoc « importante » serait un second
    // état que le terrain ne sait pas produire.
    criticite: 'informatif',
    bloc: 'B3',
    // LE SEUL `true` du fichier, et ce qui rend cette ligne possible sur un
    // appareil réel — voir l'en-tête du tableau.
    addedAdHoc: true,
    /**
     * Volontairement SANS ancre : c'est ce que le terrain obtient en laissant
     * vide « Consigne (facultative) » du dialogue de question ad hoc. Interdit à
     * une question de banque (`ANCRES_ABSENTES`), atteignable par ce chemin-là.
     */
    guidance: null,
  },
];

/** Ce que l'outil annonce à l'opérateur, et ce que la séance cherche à l'écran. */
export const REPERES_SEANCE = {
  missionId: MISSION_ID,
  titre: MISSION_FIL_TPE.titre,
  uniteCanonique: MISSION_FIL_TPE.unite,
  questionEchelleAncree: QUESTIONS[2]?.texte ?? '',
  questionEchelleSansAncre: QUESTIONS[11]?.texte ?? '',
  premiereQuestion: QUESTIONS[0]?.texte ?? '',
  unites: UNITES.length,
  questions: QUESTIONS.length,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LES INSTANTS — posés au fuseau de la MISSION, jamais à celui de la machine
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Le décalage d'un fuseau à un instant donné, en minutes.
 *
 * Passer par `Intl` plutôt que par une constante « Paris = UTC+2 » n'est pas de
 * la coquetterie : le fichier couvre quatorze jours, et un changement d'heure
 * dans l'intervalle décalerait les créneaux d'une heure — assez pour faire
 * basculer une session de 00 h 30 au jour précédent, donc pour la faire
 * disparaître de « Aujourd'hui » sans que rien ne le dise.
 */
function decalageMinutes(instant: Date, fuseau: string): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const champ = (nom: string): number =>
    Number(parties.find((partie) => partie.type === nom)?.value ?? '0');
  const commeSiUtc = Date.UTC(
    champ('year'),
    champ('month') - 1,
    champ('day'),
    champ('hour') % 24,
    champ('minute'),
    champ('second'),
  );
  return (commeSiUtc - instant.getTime()) / 60_000;
}

/** L'instant UTC correspondant à une heure LOCALE de mission (11 §3, invariant 5). */
function instantAuFuseau(
  annee: number,
  mois: number,
  jour: number,
  heure: number,
  minute: number,
): string {
  const naif = Date.UTC(annee, mois - 1, jour, heure, minute);
  let estimation = naif;
  // Deux passes : la première corrige le gros du décalage, la seconde rattrape
  // le cas où l'estimation initiale tombait de l'autre côté d'un changement
  // d'heure. Au-delà, le point est fixe.
  for (let passe = 0; passe < 2; passe += 1) {
    estimation = naif - decalageMinutes(new Date(estimation), FUSEAU_MISSION) * 60_000;
  }
  return new Date(estimation).toISOString();
}

/** Le jour civil courant AU FUSEAU DE MISSION, décomposé. */
function jourCourant(): { annee: number; mois: number; jour: number } {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_MISSION,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [annee = '1970', mois = '01', jour = '01'] = parties.split('-');
  return { annee: Number(annee), mois: Number(mois), jour: Number(jour) };
}

/** Le même jour, décalé de `ecart` jours, toujours au fuseau de mission. */
function jourDecale(ecart: number): { annee: number; mois: number; jour: number } {
  const base = jourCourant();
  const pivot = new Date(Date.UTC(base.annee, base.mois - 1, base.jour + ecart));
  return {
    annee: pivot.getUTCFullYear(),
    mois: pivot.getUTCMonth() + 1,
    jour: pivot.getUTCDate(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// L'AGENDA — des sessions planifiées, une reprise, un passé coté
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les interlocuteurs sont INVENTÉS (invariant 2). Leur nom voyage dans la
 * charge CHIFFRÉE (`ChargeInterview.personName`), jamais dans l'index en clair —
 * c'est la liste fermée du `LOT_L5.md` §3.2, et c'est aussi ce que V-6.3 fait
 * constater : le tiers ne doit pas pouvoir nommer l'interviewé en écran partagé.
 */
interface InterlocuteurSeance {
  readonly nom: string;
  readonly fonction: string;
}

const INTERLOCUTEURS: readonly InterlocuteurSeance[] = [
  { nom: 'Camille Berthier', fonction: 'Responsable d’atelier' },
  { nom: 'Dominique Anselme', fonction: 'Chargée d’affaires' },
  { nom: 'Sacha Vaneau', fonction: 'Technicien méthodes' },
  { nom: 'Noor Delatte', fonction: 'Assistante de gestion' },
];

interface SessionSeance {
  readonly index: IndexInterview;
  readonly charge: ChargeInterview;
}

function session(
  rang: number,
  options: {
    readonly orgUnitId: string;
    readonly kind: IndexInterview['kind'];
    readonly statut: IndexInterview['status'];
    readonly planification: IndexInterview['scheduleStatus'];
    readonly scheduledAt: string | null;
    readonly interlocuteur: InterlocuteurSeance | null;
    readonly startedAt?: string | null;
    readonly endedAt?: string | null;
    readonly valideeLe?: string | null;
    readonly notes?: string | null;
  },
): SessionSeance {
  const horodatage = options.scheduledAt ?? new Date().toISOString();
  return {
    index: {
      id: identifiant(2, rang),
      missionId: MISSION_ID,
      orgUnitId: options.orgUnitId,
      kind: options.kind,
      status: options.statut,
      scheduleStatus: options.planification,
      scheduledAt: options.scheduledAt,
      clientUpdatedAt: horodatage,
      supprimeLe: null,
    },
    charge: {
      // 05 §9.9 : le propriétaire. Voir l'en-tête du builder — cet identifiant
      // est celui de la FIXTURE, pas celui du compte rattaché sur l'iPad.
      conductedBy: AUDITEUR_ID,
      mode: options.kind === 'entretien' ? 'sur_site' : null,
      personName: options.interlocuteur?.nom ?? null,
      personRole: options.interlocuteur?.fonction ?? null,
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: options.notes ?? null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      // 06 §10.4 : l'accord de participation se donne À L'ÉCRAN, au début de la
      // session (V-4.1 le fait donner). Une fixture qui le pré-coche ferait
      // sauter le geste que la séance doit précisément observer.
      consentGiven: options.statut !== 'non_demarre',
      consentAudio: false,
      consentedAt: options.statut === 'non_demarre' ? null : (options.startedAt ?? null),
      informationNoticeVersion: options.statut === 'non_demarre' ? null : '1.0',
      noticeShownAt: options.statut === 'non_demarre' ? null : (options.startedAt ?? null),
      scheduledDurationMin: 60,
      startedAt: options.startedAt ?? null,
      endedAt: options.endedAt ?? null,
      valideeLe: options.valideeLe ?? null,
      clientCreatedAt: horodatage,
    },
  };
}

const ATELIER_ID = MISSION_FIL_TPE.uniteId;
const ETUDES_ID = identifiant(1, 3);
const COMMERCIAL_ID = identifiant(1, 4);
const ADMINISTRATION_ID = identifiant(1, 5);

/** La session TERMINÉE et validée de l'avant-veille — le passé coté de V-9.4. */
const SESSION_PASSEE = session(1, {
  orgUnitId: ETUDES_ID,
  kind: 'entretien',
  statut: 'termine',
  planification: 'realise',
  scheduledAt: (() => {
    const { annee, mois, jour } = jourDecale(-2);
    return instantAuFuseau(annee, mois, jour, 9, 30);
  })(),
  interlocuteur: INTERLOCUTEURS[2] ?? null,
  startedAt: (() => {
    const { annee, mois, jour } = jourDecale(-2);
    return instantAuFuseau(annee, mois, jour, 9, 32);
  })(),
  endedAt: (() => {
    const { annee, mois, jour } = jourDecale(-2);
    return instantAuFuseau(annee, mois, jour, 10, 41);
  })(),
  valideeLe: (() => {
    const { annee, mois, jour } = jourDecale(-2);
    return instantAuFuseau(annee, mois, jour, 10, 45);
  })(),
  notes: 'Visite du poste de traçage. Le tableau de suivi est tenu au crayon.',
});

/**
 * La session EN COURS de la veille — celle que le cockpit propose de « reprendre
 * là où il s'est arrêté » (03 §34.2), et qui déclenche l'alerte « entretien
 * commencé non terminé ». Elle reste visible quel que soit le jour :
 * `depotSessions.duJour` retient les sessions `en_cours` sans regarder leur date,
 * et c'est exactement l'oubli que 03 §17.3 traque.
 */
const SESSION_REPRISE = session(2, {
  orgUnitId: COMMERCIAL_ID,
  kind: 'entretien',
  statut: 'en_cours',
  planification: 'realise',
  scheduledAt: (() => {
    const { annee, mois, jour } = jourDecale(-1);
    return instantAuFuseau(annee, mois, jour, 14, 0);
  })(),
  interlocuteur: INTERLOCUTEURS[1] ?? null,
  startedAt: (() => {
    const { annee, mois, jour } = jourDecale(-1);
    return instantAuFuseau(annee, mois, jour, 14, 3);
  })(),
  notes: 'Reprise à faire sur le bloc B2.',
});

/**
 * Les sessions PLANIFIÉES, deux par jour sur quatorze jours.
 *
 * Voir `JOURNEES_PLANIFIEES` : c'est ce qui rend V-0.7 et V-4.1 jouables quel que
 * soit le jour où la séance a lieu, sans avoir à refabriquer le fichier.
 */
function sessionsPlanifiees(): readonly SessionSeance[] {
  const posees: SessionSeance[] = [];
  for (let ecart = 0; ecart < JOURNEES_PLANIFIEES; ecart += 1) {
    const { annee, mois, jour } = jourDecale(ecart);
    posees.push(
      session(10 + ecart * 2, {
        orgUnitId: ATELIER_ID,
        kind: 'entretien',
        statut: 'non_demarre',
        planification: 'confirme',
        scheduledAt: instantAuFuseau(annee, mois, jour, 9, 0),
        interlocuteur: INTERLOCUTEURS[0] ?? null,
      }),
      session(11 + ecart * 2, {
        orgUnitId: ADMINISTRATION_ID,
        kind: 'observation',
        statut: 'non_demarre',
        planification: 'planifie',
        scheduledAt: instantAuFuseau(annee, mois, jour, 14, 30),
        interlocuteur: INTERLOCUTEURS[3] ?? null,
      }),
    );
  }
  return posees;
}

// ─────────────────────────────────────────────────────────────────────────────
// LES RÉPONSES DÉJÀ COTÉES — de quoi que le cockpit ne soit pas vide
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Six réponses, dont une À-REVOIR.
 *
 * Sans elles, V-2.4 (« l'agenda du jour ET les à-revoir sont là ») lirait un
 * compteur à zéro, ce qui ne distingue pas « rien à revoir » de « le compteur ne
 * compte rien ». Et V-9.4 (« parcourir les deux questions précédentes, rien
 * n'est revenu à un état antérieur ») n'aurait pas de précédent à parcourir.
 *
 * `flagReview` est un `0 | 1` et non un booléen : IndexedDB n'indexe pas les
 * booléens (`formes.ts`), et c'est ce compteur-là qui en dépend.
 */
interface ReponseSeance {
  readonly index: IndexAnswer;
  readonly charge: ChargeAnswer;
}

function reponse(
  rang: number,
  options: {
    readonly interviewId: string;
    readonly question: QuestionSeance;
    readonly valeur: ChargeAnswer['value'];
    readonly note: string | null;
    readonly instant: string;
    readonly aRevoir?: string | null;
  },
): ReponseSeance {
  return {
    index: {
      id: identifiant(3, rang),
      missionId: MISSION_ID,
      interviewId: options.interviewId,
      missionQuestionId: options.question.id,
      flagReview: options.aRevoir === undefined || options.aRevoir === null ? 0 : 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
      clientUpdatedAt: options.instant,
      supprimeLe: null,
    },
    charge: {
      value: options.valeur,
      note: options.note,
      reviewReason: options.aRevoir ?? null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      // Redondance volontaire (04, décision V1) : la question TELLE QU'ELLE A ÉTÉ
      // POSÉE, figée avec la réponse.
      questionTextSnapshot: options.question.texte,
      revision: 1,
      clientCreatedAt: options.instant,
    },
  };
}

function reponsesSemees(): readonly ReponseSeance[] {
  const veille = (heure: number, minute: number): string => {
    const { annee, mois, jour } = jourDecale(-1);
    return instantAuFuseau(annee, mois, jour, heure, minute);
  };
  const avantVeille = (heure: number, minute: number): string => {
    const { annee, mois, jour } = jourDecale(-2);
    return instantAuFuseau(annee, mois, jour, heure, minute);
  };
  const q = (rang: number): QuestionSeance => {
    const trouvee = QUESTIONS[rang];
    if (trouvee === undefined) throw new Error(`question ${String(rang)} absente du questionnaire`);
    return trouvee;
  };

  return [
    reponse(1, {
      interviewId: SESSION_PASSEE.index.id,
      question: q(0),
      valeur: {
        type: 'free_text',
        v: 'La commande arrive par courriel, elle est recopiée sur un carnet, puis ressaisie dans l’outil de facturation le soir.',
      },
      note: 'Deux ressaisies pour une seule commande.',
      instant: avantVeille(9, 48),
    }),
    reponse(2, {
      interviewId: SESSION_PASSEE.index.id,
      question: q(1),
      valeur: { type: 'yes_no', v: false },
      note: 'Rien d’écrit ; la consigne se transmet de vive voix.',
      instant: avantVeille(9, 59),
    }),
    reponse(3, {
      interviewId: SESSION_PASSEE.index.id,
      question: q(2),
      valeur: { type: 'scale_1_5', v: 2 },
      note: 'L’outil sert la facturation seule ; l’atelier travaille à côté.',
      instant: avantVeille(10, 12),
    }),
    reponse(4, {
      interviewId: SESSION_PASSEE.index.id,
      question: q(8),
      valeur: { type: 'scale_1_5', v: 1 },
      note: 'Aucune copie hors du poste de gestion.',
      instant: avantVeille(10, 33),
      aRevoir:
        'À recouper avec l’administration : une sauvegarde externalisée serait souscrite depuis peu.',
    }),
    reponse(5, {
      interviewId: SESSION_REPRISE.index.id,
      question: q(4),
      valeur: { type: 'scale_1_5', v: 3 },
      note: 'Un cahier de liaison existe, tenu quand le temps le permet.',
      instant: veille(14, 21),
    }),
    reponse(6, {
      interviewId: SESSION_REPRISE.index.id,
      question: q(6),
      valeur: { type: 'number', v: 4 },
      note: null,
      instant: veille(14, 30),
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// LE FICHIER — en-tête EN CLAIR, charge chiffrée sous la clé du MOT DE PASSE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Une ligne du payload : l'index en clair, plus la charge DÉCHIFFRÉE (11 §4).
 *
 * Le paramètre est GÉNÉRIQUE et non un `Record<string, unknown>` : les sept
 * formes d'index de `formes.ts` sont des interfaces en lecture seule, et une
 * interface n'a pas de signature d'index — elle ne s'assigne donc pas à un
 * `Record`. La contrainte dit ce qui est réellement exigé (« ça a un `id` ») et
 * laisse le compilateur vérifier le reste au lieu de l'effacer.
 */
function ligne<T extends { readonly id: string }>(index: T, charge: unknown): T & LigneSauvegardee {
  return { ...index, charge };
}

/** Le contenu déchiffré, dans la forme exacte que `importerSauvegarde` revalide. */
export function contenuSeance(): ContenuSauvegarde {
  const instant = new Date().toISOString();

  const indexMission: IndexMission = {
    id: MISSION_ID,
    status: 'en_cours',
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const chargeMission: ChargeMission = {
    titre: MISSION_FIL_TPE.titre,
    companyId: SOCIETE_ID,
    timezone: FUSEAU_MISSION,
    auditLevel: 'standard',
    geoScope: 'france',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };

  const unites = UNITES.map((unite, rang) => {
    const index: IndexOrgUnit = {
      id: unite.id,
      missionId: MISSION_ID,
      parentId: unite.parentId,
      kind: unite.kind,
      status: 'active',
      position: rang + 1,
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeOrgUnit = {
      name: unite.nom,
      countryCode: 'FR',
      timezone: FUSEAU_MISSION,
      headcount: unite.effectif,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: null,
      mergedIntoId: null,
      clientCreatedAt: instant,
    };
    return ligne(index, charge);
  });

  const questions = QUESTIONS.map((question, rang) => {
    const index: IndexMissionQuestion = {
      id: question.id,
      missionId: MISSION_ID,
      position: rang + 1,
      texteSnapshot: question.texte,
      // La tokenisation vient du code de PRODUCTION : deux normalisations
      // différentes rendraient la fixture introuvable par la recherche
      // hors-parcours (03 §25.4) qui la cherche.
      motsCles: jetonsDeRecherche(question.texte),
      answerType: question.type,
      criticality: question.criticite,
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    // ── LES TROIS CHAMPS QUI SUIVENT LE DRAPEAU, ET POURQUOI ILS LE SUIVENT ──
    // `addedAdHoc` était posé ICI, en dur à `false` pour les douze questions :
    // c'est le défaut du 2026-09-10. Il est désormais DÉCLARÉ par question, et
    // ce qui en dépend en découle plutôt que d'être répété — une charge ad hoc
    // se reconnaît à trois marques que `creerQuestionAdHoc` écrit ensemble, et
    // les dissocier recréerait un état que le terrain ne produit pas.
    const charge: ChargeMissionQuestion = {
      // Une question ad hoc ne cite AUCUNE entrée de banque : le terrain lui
      // frappe un identifiant neuf. Le réutiliser depuis `QUESTION_BANQUE_ID`
      // ferait pointer douze questions vers la même entrée, dont une qui n'en a
      // pas.
      questionId: question.addedAdHoc ? identifiant(10, rang + 1) : QUESTION_BANQUE_ID,
      questionVersion: 1,
      guidanceSnapshot: question.guidance,
      optionsSnapshot: null,
      scoringSnapshot: null,
      // `0` pour une ad hoc : elle ne pèse pas dans le score tant que le siège ne
      // l'a pas reprise (03 §25.3), et c'est ce que le terrain écrit.
      weightSnapshot: question.addedAdHoc ? 0 : null,
      allowRangeSnapshot: false,
      addedAdHoc: question.addedAdHoc,
      blockCode: question.bloc,
    };
    return ligne(index, charge);
  });

  const sessions = [SESSION_PASSEE, SESSION_REPRISE, ...sessionsPlanifiees()].map((entree) =>
    ligne(entree.index, entree.charge),
  );

  const reponses = reponsesSemees().map((entree) => ligne(entree.index, entree.charge));

  return contenuSauvegardeSchema.parse({
    missionId: MISSION_ID,
    lignes: {
      missions: [ligne(indexMission, chargeMission)],
      missionQuestions: questions,
      orgUnits: unites,
      interviews: sessions,
      answers: reponses,
      // ── DEUX TABLES VOLONTAIREMENT VIDES, ET C'EST DIT ────────────────────
      // `attachments` : la chaîne photo n'est pas observable à P-C (V-1.6, A02
      // réserve NB-4). Semer des pièces jointes ferait apparaître des vignettes
      // qui ne mènent nulle part — un faux témoin.
      // `workAssignments` : c'est de la planification de SIÈGE, et rien sur
      // l'appareil ne la lit (vérifié : aucun appelant hors `base.ts`). Une
      // ligne y serait du décor invérifiable.
      attachments: [],
      workAssignments: [],
    },
    // L'outbox est VIDE, et il le faut : `importerSauvegarde` ne réinjecte pas la
    // file (`operationsNonReinjectees`), et une op semée ici afficherait un
    // avertissement « éléments non synchronisés » sur un appareil qui n'a jamais
    // rien collecté. La séance produira sa propre outbox en cotant.
    operations: [],
  });
}

/**
 * Fabrique le `.axionbackup` de séance.
 *
 * ── CE QUI EST DE LA CRYPTO DE PRODUCTION, LIGNE À LIGNE ────────────────────
 * `genererSel` (16 octets, WebCrypto) · `deriverKek` (Argon2id via `hash-wasm`,
 * `PARAMETRES_KDF_DEFAUT` = le profil OWASP du coffre, 47 104 Kio) ·
 * `crypto.subtle.encrypt` en AES-256-GCM avec un nonce de `LONGUEUR_NONCE_OCTETS`
 * · `versBase64`. Rien n'est réimplémenté, rien n'est affaibli : c'est la même
 * clé et le même chiffre que ceux qu'`exporterSauvegarde` produit sur l'iPad, et
 * c'est la seule raison pour laquelle `importerSauvegarde` saura l'ouvrir.
 *
 * Le sel est NEUF (jamais celui d'un coffre) : deux clés dérivées du même mot de
 * passe avec le même sel seraient la même clé, et le fichier partagerait alors la
 * clé qui protège un appareil.
 */
export async function fabriquerSauvegardeSeance(
  motDePasse: string = MOT_DE_PASSE_SAUVEGARDE_SEANCE,
): Promise<{ readonly fichier: FichierSauvegarde; readonly nom: string }> {
  const contenu = contenuSeance();

  const sel = genererSel();
  const cle = await deriverKek(motDePasse, sel, PARAMETRES_KDF_DEFAUT);
  const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
  const chiffre = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cle,
    new TextEncoder().encode(JSON.stringify(contenu)),
  );

  const creeLe = new Date().toISOString();
  const fichier: FichierSauvegarde = {
    enTete: {
      versionFormat: VERSION_FORMAT_SAUVEGARDE,
      missionId: MISSION_ID,
      // En clair dans l'en-tête, donc AUCUNE donnée personnelle et aucune
      // référence client : c'est ce que l'écran de restauration affiche sous
      // « Appareil d'origine ».
      libelleAppareil: 'Fixture de séance P-C (A26)',
      creeLe,
      versionSchemaLocal: VERSION_SCHEMA_LOCAL,
      operationsIncluses: contenu.operations.length,
      kdf: { algo: 'argon2id', sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT },
    },
    charge: {
      v: VERSION_ENVELOPPE,
      n: versBase64(nonce),
      c: versBase64(new Uint8Array(chiffre)),
    },
  };

  return { fichier, nom: nomFichierSauvegarde(MISSION_ID, creeLe) };
}
