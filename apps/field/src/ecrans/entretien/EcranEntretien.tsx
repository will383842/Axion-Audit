// =============================================================================
// L'ÉCRAN D'ENTRETIEN — 3 ZONES (03 M3.1) — le poste de travail de l'auditeur
//
// Gauche : blocs + progression (`ZoneBlocs`) · Centre : UNE question et sa
// saisie (`ZoneQuestion`) · Droite : notes de question, bloc-notes, notes
// volantes (`PanneauNotes`). Sur écran étroit, gauche et droite deviennent des
// panneaux ; en écran partagé (§33.3), elles n'existent plus.
//
// ── CE QUE CET ÉCRAN LIT, ET D'OÙ ───────────────────────────────────────────
// Tout vient d'IndexedDB par `useLiveQuery` (dexie-react-hooks, 11 §1) : la
// session (`depotSessions`), le questionnaire figé (`depotQuestions`), l'INDEX
// des réponses (en clair, pour la progression — aucun déchiffrement), la
// réponse courante (`depotReponses.parQuestion`, déchiffrée), les notes
// volantes. Rien ne vient du réseau. La session ouverte et la question courante
// sont mémorisées dans `meta` (`session/position.ts`) : rouvrir l'app ramène
// exactement ici (03 §17.4).
//
// ── CE QU'IL ÉCRIT, ET COMMENT ──────────────────────────────────────────────
// Chaque geste est un `ecrireLocal` (par `session/ecriture-*.ts`), passé à
// `useEnregistrementContinu` : immédiat pour un tap, débouncé pour une frappe,
// purgé avant tout changement de question et à toute sortie de page.
// L'indicateur « Enregistré » ne s'allume qu'APRÈS l'écriture.
//
// ── LES QUATRE ÉTATS (03 §33.2) ─────────────────────────────────────────────
// chargement (squelettes) · vide (aucun entretien ouvert → « Nouvel entretien »,
// ou questionnaire vide) · erreur (session introuvable, cause + action) · hors
// ligne (pastille dans l'en-tête, mode NOMINAL) · nominal.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu — notes, ad hoc),
// E12 (entretiens par interlocuteur, à-revoir / N-A), E37 (scoring intégralement
// spécifié — fourchettes §27.4), E6 (hors ligne total), E44 (UX/UI 2026-2027 — tokens, grille §33).
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BandeauPartage,
  Bouton,
  IndicateurEnregistrement,
  Message,
  Panneau,
  PastilleSync,
  Squelette,
  ZoneEtat,
  type EtatZone,
} from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import type { BaseLocale } from '../../local/base.js';
import { contexteLocal } from '../../local/contexte.js';
import { depotQuestions, type QuestionLocale } from '../../local/depots/questions.js';
import { depotReponses, type ReponseLocale } from '../../local/depots/reponses.js';
import { depotSessions, type SessionLocale } from '../../local/depots/sessions.js';
import type { IndexAnswer } from '../../local/formes.js';
import { lireIdentiteAuditeur, PROFIL_PAR_DEFAUT } from '../../session/auditeur.js';
import { ecrireReponse, motifRefusEcriture } from '../../session/ecriture-reponses.js';
import { demarrerEntretien, ecrireNotesGenerales } from '../../session/ecriture-session.js';
import { useEnregistrementContinu } from '../../session/enregistrement.js';
import { useBalayageHorizontal } from '../../session/gestes.js';
import { etatSession } from '../../session/machine.js';
import {
  REQUETE_POINTEUR_FIN,
  REQUETE_TROIS_COLONNES,
  useEnLigne,
  useRequeteMedia,
} from '../../session/media.js';
import { lireMissionLocale, lireUnites } from '../../session/missions.js';
import {
  creerNoteVolante,
  detacherNoteVolante,
  lireNotesVolantes,
  rattacherNoteVolante,
  supprimerNoteVolante,
} from '../../session/notes-volantes.js';
import {
  lireQuestionCourante,
  lireSessionCourante,
  memoriserQuestionCourante,
  memoriserSessionCourante,
} from '../../session/position.js';
import { creerQuestionAdHoc } from '../../session/questions-adhoc.js';
import { useRaccourcisEntretien, type ActionsRaccourcis } from '../../session/raccourcis.js';
import type { ValeurTypee } from '../../session/valeurs.js';
import { DemarrageEntretien } from './DemarrageEntretien.js';
import { DialogueDrapeau, type DecisionDrapeau, type NatureDrapeau } from './DialogueDrapeau.js';
import { DialogueQuestionAdHoc, type SaisieQuestionAdHoc } from './DialogueQuestionAdHoc.js';
import { PaletteRecherche } from './PaletteRecherche.js';
import { PanneauNotes } from './PanneauNotes.js';
import type { Cadence } from './SaisieReponse.js';
import { ZoneBlocs } from './ZoneBlocs.js';
import { ZoneQuestion } from './ZoneQuestion.js';
import './entretien.css';

type PanneauLateral = 'blocs' | 'notes' | null;

const ID_NOTE_QUESTION = 'axn-note-de-question';

const CAPACITES_HORS_LIGNE = [
  'Répondre à chaque question, la marquer à revoir, sans objet ou non communiquée',
  'Prendre des notes et des notes volantes',
  'Ajouter une question ad hoc ou en retrouver une hors parcours',
];

/**
 * L'ordre de parcours. Le dépôt trie par `position` ; à position ÉGALE, une
 * question ad hoc passe AVANT la question siège : née de la question n, elle
 * prend `n + 1` (DECISIONS.md 2026-09-02 [L5b] : « juste après la courante »)
 * sans renuméroter les questions siège (05 §9.4). Deux ad hoc à la même
 * position se suivent dans l'ordre de leur création (id v7).
 */
function ordonnerParcours(questions: readonly QuestionLocale[]): QuestionLocale[] {
  return [...questions].sort(
    (a, b) =>
      a.position - b.position ||
      Number(b.addedAdHoc) - Number(a.addedAdHoc) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** L'index des réponses d'une session, SANS la charge : pour compter, pas pour lire. */
async function lireIndexReponses(base: BaseLocale, interviewId: string): Promise<IndexAnswer[]> {
  const lignes = await base.answers
    .where('interviewId')
    .equals(interviewId)
    .filter((ligne) => ligne.supprimeLe === null)
    .toArray();
  return lignes.map((ligne) => {
    const { charge, ...index } = ligne;
    void charge;
    return index;
  });
}

export function EcranEntretien(): ReactNode {
  const { base, naviguer } = useTerrain();
  const troisColonnes = useRequeteMedia(REQUETE_TROIS_COLONNES);
  const pointeurFin = useRequeteMedia(REQUETE_POINTEUR_FIN);
  const enLigne = useEnLigne();

  // ── Lectures vivantes ──────────────────────────────────────────────────────
  // `useLiveQuery` GARDE son résultat précédent quand ses dépendances changent,
  // jusqu'à ce que la nouvelle requête ait émis. Les lectures qui décident d'un
  // ÉTAT (session, questionnaire, question mémorisée) sont donc TAGUÉES par la
  // clé qu'elles ont lue : un résultat dont la clé n'est pas celle d'aujourd'hui
  // vaut « pas encore lu » (`undefined`), jamais « lu : absent » (`null`). Sans
  // cela, « Entretien introuvable » s'affichait un instant à CHAQUE ouverture —
  // le `null` calculé quand la session courante n'était pas encore connue.
  const sessionId = useLiveQuery(
    async () => (base === null ? null : lireSessionCourante(base)),
    [base],
    undefined,
  );
  const lectureSession = useLiveQuery(
    async () =>
      typeof sessionId === 'string'
        ? { pour: sessionId, session: await depotSessions.parId(sessionId) }
        : null,
    [sessionId],
    undefined,
  );
  const session: SessionLocale | null | undefined =
    sessionId === null
      ? null
      : typeof sessionId === 'string' && lectureSession?.pour === sessionId
        ? lectureSession.session
        : undefined;
  const missionId = session?.missionId;
  const mission = useLiveQuery(
    async () => (missionId === undefined ? null : lireMissionLocale(missionId)),
    [missionId],
    undefined,
  );
  const unites = useLiveQuery(
    async () => (missionId === undefined ? [] : lireUnites(missionId)),
    [missionId],
    undefined,
  );
  const lectureQuestions = useLiveQuery(
    async () =>
      missionId === undefined
        ? null
        : { pour: missionId, questions: await depotQuestions.parMission(missionId) },
    [missionId],
    undefined,
  );
  // `null` = aucune mission à lire ; `undefined` = mission connue, pas encore lue.
  const questions: QuestionLocale[] | null | undefined = useMemo(
    () =>
      missionId === undefined
        ? null
        : lectureQuestions?.pour === missionId
          ? ordonnerParcours(lectureQuestions.questions)
          : undefined,
    [lectureQuestions, missionId],
  );
  const indexReponses = useLiveQuery(
    async () =>
      base === null || typeof sessionId !== 'string' ? [] : lireIndexReponses(base, sessionId),
    [base, sessionId],
    undefined,
  );
  const notesVolantes = useLiveQuery(
    async () => (typeof sessionId === 'string' ? lireNotesVolantes(sessionId) : []),
    [sessionId],
    undefined,
  );
  const lectureQuestionMemorisee = useLiveQuery(
    async () =>
      base === null || typeof sessionId !== 'string'
        ? null
        : { pour: sessionId, questionId: await lireQuestionCourante(base, sessionId) },
    [base, sessionId],
    undefined,
  );
  const questionMemorisee: string | null | undefined =
    typeof sessionId !== 'string'
      ? null
      : lectureQuestionMemorisee?.pour === sessionId
        ? lectureQuestionMemorisee.questionId
        : undefined;
  const identite = useLiveQuery(
    async () => (base === null ? null : lireIdentiteAuditeur(base, contexteLocal().coffre)),
    [base],
    undefined,
  );
  const enAttente = useLiveQuery(
    async () =>
      base === null || missionId === undefined
        ? 0
        : base.outbox
            .where('missionId')
            .equals(missionId)
            .filter((op) => op.statut === 'en_attente')
            .count(),
    [base, missionId],
    0,
  );

  // ── Position ───────────────────────────────────────────────────────────────
  const [questionChoisie, setQuestionChoisie] = useState<string | null>(null);
  const [horsParcours, setHorsParcours] = useState(false);
  const listeQuestions = questions ?? [];
  const questionId =
    questionChoisie !== null && listeQuestions.some((question) => question.id === questionChoisie)
      ? questionChoisie
      : typeof questionMemorisee === 'string' &&
          listeQuestions.some((question) => question.id === questionMemorisee)
        ? questionMemorisee
        : (listeQuestions[0]?.id ?? null);
  const rang = listeQuestions.findIndex((question) => question.id === questionId);
  const question = rang >= 0 ? listeQuestions[rang] : undefined;

  // ── La réponse courante — deux lectures, et pourquoi ──────────────────────
  // La lecture VIVANTE (`useLiveQuery`) garde sa valeur précédente pendant
  // qu'une nouvelle requête tourne : au changement de question, elle montre un
  // instant la réponse de l'AUTRE question. Un brouillon initialisé là-dessus
  // écrirait la note de A dans B. D'où `initiale` : la réponse lue UNE fois,
  // pour cette question précisément, avant de rendre la saisie. La lecture
  // vivante prend le relais dès qu'elle parle bien de cette question.
  const [initiale, setInitiale] = useState<{
    readonly questionId: string;
    readonly reponse: ReponseLocale | null;
  } | null>(null);
  useEffect(() => {
    if (typeof sessionId !== 'string' || questionId === null) return;
    let vivant = true;
    void depotReponses.parQuestion(sessionId, questionId).then((lue) => {
      if (vivant) setInitiale({ questionId, reponse: lue });
    });
    return () => {
      vivant = false;
    };
  }, [sessionId, questionId]);

  const reponseVivante = useLiveQuery(
    async () =>
      typeof sessionId === 'string' && questionId !== null
        ? depotReponses.parQuestion(sessionId, questionId)
        : null,
    [sessionId, questionId],
    undefined,
  );
  // La plus RÉCENTE des deux lectures gagne (`clientUpdatedAt`) : après une
  // écriture, `initiale` peut être rafraîchie avant que la lecture vivante ait
  // émis — et l'inverse. Aucune des deux ne doit faire reculer l'écran.
  const reponse: ReponseLocale | null | undefined = ((): ReponseLocale | null | undefined => {
    if (initiale?.questionId !== questionId) return undefined;
    const vivante = reponseVivante?.missionQuestionId === questionId ? reponseVivante : null;
    if (vivante === null) return initiale.reponse;
    if (initiale.reponse === null) return vivante;
    return vivante.clientUpdatedAt >= initiale.reponse.clientUpdatedAt ? vivante : initiale.reponse;
  })();

  // ── Enregistrement continu ─────────────────────────────────────────────────
  const enregistrement = useEnregistrementContinu(mission?.timezone);
  const { enregistrer, differer, purger } = enregistrement;

  // ── Interface ──────────────────────────────────────────────────────────────
  const [partage, setPartage] = useState(false);
  const [panneau, setPanneau] = useState<PanneauLateral>(null);
  const [drapeau, setDrapeau] = useState<NatureDrapeau | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [adHoc, setAdHoc] = useState(false);
  const [fourchette, setFourchette] = useState(false);
  const [cleNotes, setCleNotes] = useState(0);
  const [erreurAction, setErreurAction] = useState<string | null>(null);

  // La fourchette suit la valeur persistée quand on ARRIVE sur une question.
  const questionInitiale = initiale?.questionId;
  useEffect(() => {
    if (initiale === null || initiale.questionId !== questionInitiale) return;
    setFourchette(initiale.reponse?.value?.type === 'range');
    // Volontairement : seule l'ARRIVÉE sur une question (re)règle la bascule.
  }, [questionInitiale]);

  const aller = useCallback(
    (id: string, depuisRecherche = false): void => {
      void purger().then(() => {
        setQuestionChoisie(id);
        setHorsParcours(depuisRecherche);
        setRecherche(false);
        setPanneau(null);
        if (base !== null && typeof sessionId === 'string') {
          void memoriserQuestionCourante(base, sessionId, id);
        }
      });
    },
    [base, purger, sessionId],
  );

  const peutPrecedent = rang > 0;
  const peutSuivant = rang >= 0 && rang < listeQuestions.length - 1;
  const precedent = useCallback((): void => {
    const cible = listeQuestions[rang - 1];
    if (cible !== undefined) aller(cible.id);
  }, [aller, listeQuestions, rang]);
  const suivant = useCallback((): void => {
    const cible = listeQuestions[rang + 1];
    if (cible !== undefined) aller(cible.id);
  }, [aller, listeQuestions, rang]);

  const ecritureRefusee =
    session === null || session === undefined ? null : motifRefusEcriture(session);
  const etatDeSession = session === null || session === undefined ? null : etatSession(session);

  const ecrireValeur = useCallback(
    (valeur: ValeurTypee | null, cadence: Cadence): void => {
      if (session === null || session === undefined || question === undefined) return;
      const leveSansObjet = valeur?.type === 'yes_no' ? { notApplicable: false } : {};
      const travail = (): Promise<unknown> =>
        ecrireReponse({ session, question }, { value: valeur, horsParcours, ...leveSansObjet });
      if (cadence === 'immediat') void enregistrer(travail);
      else differer(`valeur:${question.id}`, travail);
    },
    [differer, enregistrer, horsParcours, question, session],
  );

  const decider = useCallback(
    (decision: DecisionDrapeau): void => {
      setDrapeau(null);
      if (session === null || session === undefined || question === undefined) return;
      const noteActuelle = reponse?.note ?? null;
      const precision = decision.motif;
      const modification =
        decision.nature === 'a_revoir'
          ? { flagReview: decision.pose, reviewReason: decision.pose ? precision : null }
          : decision.nature === 'sans_objet'
            ? { notApplicable: decision.pose, naReason: decision.pose ? precision : null }
            : {
                withheld: decision.pose,
                withheldReason: decision.pose ? decision.motifNonCommunique : null,
                ...(decision.pose && precision !== null
                  ? { note: noteActuelle === null ? precision : `${noteActuelle}\n${precision}` }
                  : {}),
              };
      let ecrite: ReponseLocale | null = null;
      void enregistrer(async () => {
        ecrite = await ecrireReponse({ session, question }, { ...modification, horsParcours });
      }).then(() => {
        if (ecrite === null) return;
        // La ligne écrite devient la lecture de référence de cette question :
        // le brouillon de note qui va remonter repart du texte RÉELLEMENT stocké.
        setInitiale({ questionId: question.id, reponse: ecrite });
        if (decision.nature === 'non_communique') setCleNotes((n) => n + 1);
      });
    },
    [enregistrer, horsParcours, question, reponse?.note, session],
  );

  const ecrireNoteDeQuestion = useCallback(
    (texte: string): void => {
      if (session === null || session === undefined || question === undefined) return;
      differer(`note:${question.id}`, () =>
        ecrireReponse({ session, question }, { note: texte, horsParcours }),
      );
    },
    [differer, horsParcours, question, session],
  );

  const ecrireBlocNotes = useCallback(
    (texte: string): void => {
      if (session === null || session === undefined) return;
      differer('bloc-notes', () => ecrireNotesGenerales(session, texte));
    },
    [differer, session],
  );

  /**
   * Capture une note volante et dit SI ELLE A ÉTÉ ÉCRITE.
   *
   * ── BLOQUANT B1 (revue A29, 2026-09-03) ────────────────────────────────
   * Cette fonction rendait `Promise<void>` et sortait par un `return` nu dans
   * deux cas : session absente, identité de l'auditeur inconnue. La promesse
   * RÉSOLVAIT donc, l'appelant lisait un succès et vidait le champ — l'auditeur
   * tapait sa note, appuyait sur « Garder cette note volante », et le texte
   * disparaissait sans que rien ne soit persisté. Chemin atteignable sur un
   * appareil neuf, où l'identité n'a jamais été rangée.
   *
   * ET IL Y AVAIT UNE SECONDE FACE, que le seul `throw` n'aurait pas fermée :
   * `enregistrer()` (enregistrement continu) AVALE l'échec de son travail pour
   * en faire un état d'erreur affichable — c'est son rôle, et il est juste. Mais
   * il résout donc aussi quand la transaction Dexie a échoué. Le drapeau `ecrite`
   * ci-dessous n'est levé QUE par le retour de `creerNoteVolante`, à l'intérieur
   * du travail : il distingue « écrit » de « tenté », ce que la promesse seule ne
   * peut pas dire.
   */
  const capturerNoteVolante = useCallback(
    async (texte: string): Promise<boolean> => {
      if (session === null || session === undefined) {
        setErreurAction(
          'Aucun entretien n’est ouvert sur cet appareil : la note n’a pas été enregistrée, votre texte est toujours à l’écran.',
        );
        return false;
      }
      if (identite === null || identite === undefined) {
        setErreurAction(
          'L’identité de l’auditeur est inconnue sur cet appareil : connectez-vous une fois au siège avant de capturer une note volante. Votre texte n’a pas été effacé.',
        );
        return false;
      }
      let ecrite = false;
      await enregistrer(async () => {
        await creerNoteVolante({
          missionId: session.missionId,
          interviewId: session.id,
          createdBy: identite.id,
          content: texte,
        });
        ecrite = true;
      });
      return ecrite;
    },
    [enregistrer, identite, session],
  );

  const creerAdHoc = useCallback(
    async (saisie: SaisieQuestionAdHoc): Promise<void> => {
      if (session === null || session === undefined) return;
      // Juste APRÈS la courante (03 §17.5 : elle naît d'une réponse, elle se pose
      // dans la foulée) ; `ordonnerParcours` la place devant la question siège
      // qui porte déjà ce numéro.
      const position =
        question === undefined
          ? listeQuestions.reduce((max, q) => Math.max(max, q.position), 0) + 1
          : question.position + 1;
      let nouvelId = '';
      await enregistrer(async () => {
        nouvelId = await creerQuestionAdHoc({
          missionId: session.missionId,
          texte: saisie.texte,
          answerType: saisie.answerType,
          guidance: saisie.guidance,
          blockCode: question?.blockCode ?? null,
          position,
          options: saisie.options,
        });
      });
      if (nouvelId === '') throw new Error('La question n’a pas pu être créée sur cet appareil.');
      setAdHoc(false);
      aller(nouvelId);
    },
    [aller, enregistrer, listeQuestions, question, session],
  );

  const demarrer = useCallback(
    async (accord: boolean): Promise<void> => {
      if (session === null || session === undefined) return;
      await enregistrer(() =>
        demarrerEntretien(session, identite?.profil ?? PROFIL_PAR_DEFAUT, accord),
      );
    },
    [enregistrer, identite?.profil, session],
  );

  const ouvrirNote = useCallback((): void => {
    if (troisColonnes) {
      document.getElementById(ID_NOTE_QUESTION)?.focus();
    } else {
      setPanneau('notes');
    }
  }, [troisColonnes]);

  // Les fermetures de superposition sont STABLES : `Panneau`/`Dialogue` (design
  // system) relancent leur gestion du focus quand `onFermer` change — un rappel
  // recréé à chaque rendu de cet écran (et cet écran se rend à chaque lecture
  // vivante) rendrait le focus à leur premier bouton en pleine frappe.
  const fermerPanneau = useCallback((): void => {
    setPanneau(null);
  }, []);
  const fermerDrapeau = useCallback((): void => {
    setDrapeau(null);
  }, []);
  const fermerRecherche = useCallback((): void => {
    setRecherche(false);
  }, []);
  const fermerAdHoc = useCallback((): void => {
    setAdHoc(false);
  }, []);

  const fermerEntretien = useCallback((): void => {
    void purger().then(async () => {
      if (base !== null) await memoriserSessionCourante(base, null);
      naviguer({ type: 'racine', vue: 'accueil' });
    });
  }, [base, naviguer, purger]);

  // ── Raccourcis et gestes ───────────────────────────────────────────────────
  const fenetreOuverte = drapeau !== null || recherche || adHoc || panneau !== null;
  const actionsRaccourcis = useMemo<ActionsRaccourcis>(
    () => ({
      suivant,
      precedent,
      coter: (note) => {
        if (question?.answerType === 'scale_1_5' && ecritureRefusee === null) {
          ecrireValeur({ type: 'scale_1_5', v: note }, 'immediat');
        }
      },
      ouiNon: (choix) => {
        if (question?.answerType === 'yes_no' && ecritureRefusee === null) {
          ecrireValeur({ type: 'yes_no', v: choix }, 'immediat');
        }
      },
      sansObjet: () => {
        if (ecritureRefusee === null && !partage) setDrapeau('sans_objet');
      },
      aRevoir: () => {
        if (ecritureRefusee === null && !partage) setDrapeau('a_revoir');
      },
      recherche: () => {
        if (!partage) setRecherche(true);
      },
      partage: () => {
        setPartage((actif) => !actif);
      },
    }),
    [ecrireValeur, ecritureRefusee, partage, precedent, question?.answerType, suivant],
  );
  useRaccourcisEntretien(actionsRaccourcis, {
    actif:
      !fenetreOuverte &&
      etatDeSession !== null &&
      etatDeSession !== 'non_demarre' &&
      question !== undefined,
  });
  const balayage = useBalayageHorizontal(suivant, precedent, !fenetreOuverte);

  // Quand on change de question, la charge en attente est purgée (voir `aller`) ;
  // en plus, on remet l'ascenseur en haut de la question.
  const centreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    centreRef.current?.scrollIntoView({ block: 'start' });
  }, [questionId]);

  // ── Les quatre états ───────────────────────────────────────────────────────
  const etat: EtatZone =
    sessionId === undefined ||
    session === undefined ||
    questions === undefined ||
    indexReponses === undefined ||
    notesVolantes === undefined ||
    questionMemorisee === undefined ||
    mission === undefined
      ? { nature: 'chargement', libelle: 'Ouverture de l’entretien', forme: 'carte', lignes: 6 }
      : sessionId === null
        ? {
            nature: 'vide',
            titre: 'Aucun entretien ouvert',
            description:
              'Ouvrez un nouvel entretien en trois champs — nom, fonction, unité — ou reprenez-en un depuis l’accueil.',
            actions: (
              <Bouton
                onClick={() => {
                  naviguer({ type: 'aller', vue: 'nouvelEntretien' });
                }}
              >
                Nouvel entretien
              </Bouton>
            ),
          }
        : session === null
          ? {
              nature: 'erreur',
              titre: 'Entretien introuvable',
              cause:
                'L’entretien mémorisé n’existe plus sur cet appareil (mission déchargée ou entretien supprimé).',
              action:
                'Revenez à l’accueil et ouvrez un autre entretien. Rien n’a été supprimé par cette opération.',
              actions: <Bouton onClick={fermerEntretien}>Revenir à l’accueil</Bouton>,
            }
          : questions === null || questions.length === 0
            ? // `null` n'arrive pas ici (la session lue porte sa mission) ; la garde tient le type.
              {
                nature: 'vide',
                titre: 'Questionnaire vide sur cet appareil',
                description:
                  'Le questionnaire figé de cette mission n’a pas été téléchargé. Embarquez la mission depuis l’accueil, en ligne, puis reprenez cet entretien.',
                actions: <Bouton onClick={fermerEntretien}>Revenir à l’accueil</Bouton>,
              }
            : { nature: 'nominal' };

  const unite = unites?.find((u) => u.id === session?.orgUnitId);

  return (
    <ZoneEtat etat={etat}>
      {session !== null && session !== undefined && question !== undefined && (
        <section className={`axn-entretien${partage ? ' axn-entretien--partage' : ''}`}>
          <header className="axn-entretien__entete">
            <div className="axn-entretien__identite">
              <h2>{partage ? 'Entretien' : (session.personName ?? 'Entretien')}</h2>
              {!partage && (
                <p>
                  {session.personRole ?? ''}
                  {unite === undefined ? '' : ` · ${unite.name}`}
                  {etatDeSession === null ? '' : ` · ${libelleEtat(etatDeSession)}`}
                </p>
              )}
            </div>
            <div className="axn-entretien__indicateurs">
              <IndicateurEnregistrement
                etat={enregistrement.etat}
                {...(enregistrement.horodatage === undefined
                  ? {}
                  : { horodatage: enregistrement.horodatage })}
              />
              {!partage && (
                <PastilleSync etat={enLigne ? 'en-attente' : 'hors-ligne'} enAttente={enAttente} />
              )}
              {!partage && (
                <Bouton variante="discret" onClick={fermerEntretien}>
                  Quitter l’entretien
                </Bouton>
              )}
            </div>
            <BandeauPartage
              actif={partage}
              onBasculer={setPartage}
              afficherRaccourci={pointeurFin && !partage}
            />
          </header>

          {!partage && !enLigne && (
            <Message ton="info" titre="Hors ligne — la collecte continue">
              <ul>
                {CAPACITES_HORS_LIGNE.map((capacite) => (
                  <li key={capacite}>{capacite}</li>
                ))}
              </ul>
            </Message>
          )}

          {enregistrement.erreur !== null && (
            <Message
              ton="alerte"
              titre="Enregistrement local en échec"
              actions={
                <Bouton variante="secondaire" onClick={enregistrement.effacerErreur}>
                  J’ai compris
                </Bouton>
              }
            >
              {enregistrement.erreur}
            </Message>
          )}

          {erreurAction !== null && (
            <Message
              ton="avertissement"
              actions={
                <Bouton
                  variante="secondaire"
                  onClick={() => {
                    setErreurAction(null);
                  }}
                >
                  Fermer
                </Bouton>
              }
            >
              {erreurAction}
            </Message>
          )}

          {!partage && (
            <div className="axn-entretien__acces-lateraux">
              <Bouton
                variante="secondaire"
                onClick={() => {
                  setPanneau('blocs');
                }}
              >
                Blocs et progression
              </Bouton>
              <Bouton
                variante="secondaire"
                onClick={() => {
                  setPanneau('notes');
                }}
              >
                Notes
              </Bouton>
            </div>
          )}

          {!partage && (
            <aside className="axn-entretien__zone--laterale" aria-label="Blocs et progression">
              <ZoneBlocs
                questions={listeQuestions}
                reponses={indexReponses ?? []}
                questionCouranteId={questionId}
                onAller={(id) => {
                  aller(id);
                }}
              />
            </aside>
          )}

          <div className="axn-entretien__zone--centre" ref={centreRef} {...balayage}>
            {etatDeSession === 'non_demarre' ? (
              <DemarrageEntretien
                personName={session.personName ?? 'l’interlocuteur'}
                onDemarrer={demarrer}
              />
            ) : reponse === undefined ? (
              <Squelette forme="carte" lignes={4} libelle="Lecture de la réponse" />
            ) : (
              <ZoneQuestion
                question={question}
                rang={rang + 1}
                total={listeQuestions.length}
                reponse={reponse}
                horsParcours={horsParcours}
                partage={partage}
                ecritureRefusee={ecritureRefusee}
                fourchette={fourchette}
                onFourchette={setFourchette}
                onValeur={ecrireValeur}
                onDrapeau={setDrapeau}
                onNote={ouvrirNote}
                onRecherche={() => {
                  setRecherche(true);
                }}
                onQuestionAdHoc={() => {
                  setAdHoc(true);
                }}
                onPrecedent={precedent}
                onSuivant={suivant}
                peutPrecedent={peutPrecedent}
                peutSuivant={peutSuivant}
                afficherRaccourcis={pointeurFin}
              />
            )}
          </div>

          {!partage && (
            <aside className="axn-entretien__zone--laterale" aria-label="Notes">
              <PanneauNotes
                cleNoteDeQuestion={`${question.id}-${String(cleNotes)}`}
                noteDeQuestion={reponse?.note ?? ''}
                onNoteDeQuestion={ecrireNoteDeQuestion}
                ecriturePossible={ecritureRefusee === null && reponse !== undefined}
                cleBlocNotes={session.id}
                notesGenerales={session.generalNotes ?? ''}
                onNotesGenerales={ecrireBlocNotes}
                notesVolantes={notesVolantes ?? []}
                onCapturerNoteVolante={capturerNoteVolante}
                reponseCouranteId={reponse?.id ?? null}
                onRattacher={(note) => {
                  if (reponse !== null && reponse !== undefined) {
                    void enregistrer(() => rattacherNoteVolante(note, reponse.id));
                  }
                }}
                onDetacher={(note) => {
                  void enregistrer(() => detacherNoteVolante(note));
                }}
                onSupprimer={(note) => {
                  void enregistrer(() => supprimerNoteVolante(note));
                }}
                fuseau={mission?.timezone}
                idNoteDeQuestion={ID_NOTE_QUESTION}
              />
            </aside>
          )}

          {/* Panneaux d'écran étroit — le même contenu que les colonnes. */}
          <Panneau
            ouvert={panneau === 'blocs' && !partage}
            titre="Blocs et progression"
            position="cote"
            onFermer={fermerPanneau}
          >
            <ZoneBlocs
              questions={listeQuestions}
              reponses={indexReponses ?? []}
              questionCouranteId={questionId}
              onAller={(id) => {
                aller(id);
              }}
            />
          </Panneau>
          <Panneau
            ouvert={panneau === 'notes' && !partage}
            titre="Notes"
            position="bas"
            onFermer={fermerPanneau}
          >
            <PanneauNotes
              cleNoteDeQuestion={`panneau-${question.id}-${String(cleNotes)}`}
              noteDeQuestion={reponse?.note ?? ''}
              onNoteDeQuestion={ecrireNoteDeQuestion}
              ecriturePossible={ecritureRefusee === null && reponse !== undefined}
              cleBlocNotes={`panneau-${session.id}`}
              notesGenerales={session.generalNotes ?? ''}
              onNotesGenerales={ecrireBlocNotes}
              notesVolantes={notesVolantes ?? []}
              onCapturerNoteVolante={capturerNoteVolante}
              reponseCouranteId={reponse?.id ?? null}
              onRattacher={(note) => {
                if (reponse !== null && reponse !== undefined) {
                  void enregistrer(() => rattacherNoteVolante(note, reponse.id));
                }
              }}
              onDetacher={(note) => {
                void enregistrer(() => detacherNoteVolante(note));
              }}
              onSupprimer={(note) => {
                void enregistrer(() => supprimerNoteVolante(note));
              }}
              fuseau={mission?.timezone}
            />
          </Panneau>

          <DialogueDrapeau
            key={`${drapeau ?? 'aucun'}-${question.id}`}
            nature={drapeau}
            dejaPose={
              drapeau === 'a_revoir'
                ? reponse?.flagReview === 1
                : drapeau === 'sans_objet'
                  ? reponse?.notApplicable === 1
                  : reponse?.withheld === 1
            }
            motifActuel={
              drapeau === 'a_revoir'
                ? (reponse?.reviewReason ?? null)
                : drapeau === 'sans_objet'
                  ? (reponse?.naReason ?? null)
                  : null
            }
            motifNonCommuniqueActuel={reponse?.withheldReason ?? null}
            onDecider={decider}
            onFermer={fermerDrapeau}
          />

          <PaletteRecherche
            ouvert={recherche}
            missionId={session.missionId}
            onChoisir={(id) => {
              aller(id, true);
            }}
            onFermer={fermerRecherche}
          />

          <DialogueQuestionAdHoc ouvert={adHoc} onCreer={creerAdHoc} onFermer={fermerAdHoc} />
        </section>
      )}
    </ZoneEtat>
  );
}

function libelleEtat(etat: ReturnType<typeof etatSession>): string {
  switch (etat) {
    case 'non_demarre':
      return 'non démarré';
    case 'en_cours':
      return 'en cours';
    case 'termine':
      return 'terminé';
    case 'valide':
      return 'validé';
  }
}
