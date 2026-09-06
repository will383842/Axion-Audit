// =============================================================================
// FIN DE SESSION — le geste « Terminer », et ses réciproques
// 03 §19.1 (V2.10, terminer ≠ valider) · §17.3 (fin d'entretien contrôlée) ·
// §33.3 (« l'écran de validation présente la synthèse en une carte lisible »)
//
// ── POURQUOI CET ÉCRAN EXISTE, ET C'EST UN CONSTAT DE REVUE ────────────────
// Revue croisée A29 du 2026-09-05, bloquant **B1** : le domaine
// (`agenda/validation.ts`) savait terminer, rouvrir, valider et déverrouiller,
// avec 21 tests écrits avant le code — et **aucun écran n'appelait rien**. Aucun
// code ne posait `status = 'termine'`. Donc `jour.ts` filtrait un état que
// personne n'atteignait, donc la validation groupée — le livrable-titre du
// §34.2-2 — s'appliquait à un ensemble structurellement vide. Il manquait un
// bouton, et il manquait tout.
//
// ── POURQUOI IL EST DANS `ecrans/journee/` ET NON DANS L'ÉCRAN D'ENTRETIEN ──
// `LOT_L5.md` §1 donne « **terminer ≠ valider** » à L5c et l'écrit dans la
// colonne « Ne livre PAS » de L5b (« terminer/valider »). Le geste est donc à
// L5c par découpage, pas par commodité. Il s'atteint depuis le cockpit et
// l'agenda, où l'auditeur voit ses sessions du jour — et `ecrans/entretien/**`
// (A22) n'est pas touché.
//
// ── LE RÉCAPITULATIF EST UNE EXIGENCE, PAS UN ORNEMENT ─────────────────────
// 03 §17.3 : « au clic “terminer l'entretien”, **récapitulatif automatique** :
// questions sans réponse (avec saut direct), à-revoir ouverts, consentement
// manquant. **Terminer reste possible (le réel commande)** mais l'état est
// tracé. » Les manques sont donc AFFICHÉS et ne bloquent RIEN : un garde-fou qui
// empêcherait de terminer un entretien réellement fini enfermerait l'auditeur
// devant son interlocuteur, et 03 §19.1 l'interdit nommément (« aucun verrou ne
// peut jamais bloquer la SAISIE »).
//
// ── LES QUATRE GESTES, ET AUCUNE RÈGLE RÉÉCRITE ────────────────────────────
// Terminer · Rouvrir (librement, sans motif — la note de couloir de la V2.10) ·
// Valider (verrouille) · Déverrouiller (expert, motif obligatoire). Lesquels
// sont offerts est décidé par `peutTransiter` (L5a) : cet écran demande, il ne
// juge pas. Un bouton absent est un refus de la machine, et le motif est écrit.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E12 (entretiens
// par interlocuteur), E6 (hors ligne total).
// =============================================================================
import { useCallback, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, CarteSyntheseEntretien, Message, ZoneEtat, type EtatZone } from '@axion/ui';
import { LIBELLE_TYPE_SESSION } from '../../agenda/sessions.js';
import {
  AVERTISSEMENT_PERTE_VALIDATION,
  deverrouillerSession,
  rouvrirSession,
  terminerSession,
  validerSession,
} from '../../agenda/validation.js';
import { useTerrain } from '../../app/contexte.js';
import { depotQuestions } from '../../local/depots/questions.js';
import { depotReponses } from '../../local/depots/reponses.js';
import { depotSessions, type SessionLocale } from '../../local/depots/sessions.js';
import { PROFIL_PAR_DEFAUT } from '../../session/auditeur.js';
import { etatSession, peutTransiter } from '../../session/machine.js';
import { lireSessionCourante } from '../../session/position.js';
import { lireNotesVolantes } from '../../session/notes-volantes.js';
import './journee.css';

/**
 * Le résultat de la lecture locale — trois situations, jamais confondues.
 *
 * `undefined` (absent de l'union, porté par `useLiveQuery`) = pas encore
 * répondu ; `{ ok: false }` = la lecture a ÉCHOUÉ ; `{ ok: true, vue: null }` =
 * la lecture a réussi et il n'y a aucune session ouverte. B5 est né de la
 * fusion des deux dernières.
 */
type LectureSession =
  { readonly ok: true; readonly vue: VueSession | null } | { readonly ok: false };

interface VueSession {
  readonly session: SessionLocale;
  readonly repondu: number;
  readonly total: number;
  readonly aRevoir: number;
  readonly na: number;
  readonly nonCommunique: number;
  readonly pieces: number;
}

export function EcranFinDeSession(): ReactNode {
  const { base, naviguer } = useTerrain();
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // ── B5 (recette novice A54, 2026-09-06) : L'ÉCHEC N'EST PAS LE VIDE ────────
  // La lecture était enveloppée dans un `catch { return null }`, et `null` était
  // rendu comme l'état VIDE : « Aucune session ouverte ». Une PANNE DE LECTURE du
  // stockage local annonçait donc à l'auditeur que son entretien n'existe pas —
  // il vient d'y passer quarante-cinq minutes. C'est le même défaut que le coffre
  // illisible lu comme « absent », et 03 §33.2 sépare « vide » et « erreur »
  // précisément pour qu'il ne se produise pas.
  //
  // L'écran voisin (`EcranAujourdhui`) fait déjà la bonne chose avec le même
  // motif ; c'était donc une incohérence entre deux écrans du même incrément. La
  // lecture rend désormais une union discriminée — la forme employée par
  // `EcranAccueil` (`LectureSocle`) —, et les trois situations ont chacune leur
  // rendu : `undefined` = chargement, `{ ok: false }` = panne, `{ ok: true,
  // vue: null }` = aucune session ouverte.
  const lecture = useLiveQuery(
    async (): Promise<LectureSession | undefined> => {
      if (base === null) return undefined;
      try {
        const id = await lireSessionCourante(base);
        if (id === null) return { ok: true, vue: null };
        const session = await depotSessions.parId(id);
        if (session === null) return { ok: true, vue: null };
        const avancement = await depotReponses.avancement(id);
        const questions = await depotQuestions.parMission(session.missionId);
        const pieces = await lireNotesVolantes(id);
        return {
          ok: true,
          vue: {
            session,
            repondu: avancement.repondues,
            total: questions.length,
            aRevoir: avancement.aRevoir,
            na: avancement.nonApplicables,
            nonCommunique: avancement.nonCommuniquees,
            pieces: pieces.length,
          },
        };
      } catch {
        // La cause technique ne monte pas à l'écran (11 §2) ; l'écran dit la
        // cause MÉTIER et l'action, ce que 03 §33.2 exige.
        return { ok: false };
      }
    },
    [base],
    undefined,
  );

  /** La session à rendre. `null` couvre à la fois « aucune » et « panne » : dans
   *  les deux cas il n'y a pas de synthèse à afficher, et c'est `etat` — juste
   *  en dessous — qui dit LAQUELLE des deux situations l'auditeur regarde. */
  const vue: VueSession | null = lecture?.ok === true ? lecture.vue : null;

  /**
   * Exécute un geste et revient à la journée s'il aboutit.
   *
   * Le motif de refus vient de la machine et s'affiche tel quel (03 §19.1 :
   * « précisément ce qui manque […] jamais un simple cadenas muet »).
   */
  const agir = useCallback(
    (geste: () => Promise<void>): void => {
      setEnCours(true);
      setErreur(null);
      void geste()
        .then(() => {
          naviguer({ type: 'retour' });
        })
        .catch((cause: unknown) => {
          setErreur(cause instanceof Error ? cause.message : 'Le geste n’a pas abouti.');
        })
        .finally(() => {
          setEnCours(false);
        });
    },
    [naviguer],
  );

  /** Le retour à la journée — la même sortie, quel que soit l'état. */
  const retourALaJournee = (
    <Bouton
      onClick={() => {
        naviguer({ type: 'racine', vue: 'aujourdhui' });
      }}
    >
      Revenir à ma journée
    </Bouton>
  );

  const etat: EtatZone =
    lecture === undefined
      ? { nature: 'chargement', libelle: 'Lecture de la session', lignes: 4 }
      : !lecture.ok
        ? {
            // B5 — l'état qui manquait. Il dit que la session EXISTE PEUT-ÊTRE et
            // que rien n'a été supprimé : c'est exactement ce que l'auditeur a
            // besoin d'entendre avant de refaire quarante-cinq minutes d'entretien.
            nature: 'erreur',
            titre: 'La session n’a pas pu être lue',
            cause:
              'Le stockage local de cet appareil n’a pas répondu. Cela ne veut PAS dire que votre entretien n’existe pas : rien n’a été supprimé.',
            action:
              'Rechargez la page, puis rouvrez cette session depuis votre journée. Si l’erreur revient, exportez une sauvegarde de secours avant de poursuivre la collecte, et signalez-le.',
            actions: retourALaJournee,
          }
        : lecture.vue === null
          ? {
              nature: 'vide',
              titre: 'Aucune session ouverte',
              description:
                'Ouvrez une session depuis votre journée, puis revenez ici pour la terminer ou la valider.',
              actions: retourALaJournee,
            }
          : { nature: 'nominal' };

  const session = vue?.session ?? null;
  const courant = session === null ? null : etatSession(session);
  const permis = (action: Parameters<typeof peutTransiter>[1]): boolean =>
    courant !== null && peutTransiter(courant, action, PROFIL_PAR_DEFAUT).autorise;
  const permisExpert = (action: Parameters<typeof peutTransiter>[1]): boolean =>
    courant !== null && peutTransiter(courant, action, 'expert').autorise;

  // 03 §17.3 : le récapitulatif nomme ce qui manque. Il n'empêche rien.
  const manques: string[] = [];
  if (vue !== null) {
    if (vue.total > vue.repondu) {
      manques.push(`${String(vue.total - vue.repondu)} question(s) sans réponse.`);
    }
    if (vue.aRevoir > 0) manques.push(`${String(vue.aRevoir)} point(s) à revoir encore ouverts.`);
    if (!vue.session.consentGiven) manques.push('L’accord de participation n’est pas enregistré.');
  }

  return (
    <section className="axn-pile">
      <h1>Fin de session</h1>

      <ZoneEtat etat={etat}>
        <>
          {session !== null && vue !== null && (
            <>
              <CarteSyntheseEntretien
                titre={session.personName ?? LIBELLE_TYPE_SESSION[session.kind]}
                sousTitre={`${LIBELLE_TYPE_SESSION[session.kind]}${session.personRole === null ? '' : ` · ${session.personRole}`}`}
                repondu={vue.repondu}
                total={vue.total}
                aRevoir={vue.aRevoir}
                na={vue.na}
                nonCommunique={vue.nonCommunique}
                notes={session.generalNotes === null ? 0 : 1}
                pieces={vue.pieces}
              />

              {/* §17.3 : « Terminer reste possible (le réel commande) mais
                  l'état est tracé. » Ces manques informent, ils ne bloquent
                  aucun bouton — §19.1 interdit qu'un verrou bloque la collecte. */}
              {manques.length > 0 && (
                <Message ton="avertissement" titre="Avant de terminer, à savoir">
                  <ul>
                    {manques.map((manque) => (
                      <li key={manque}>{manque}</li>
                    ))}
                  </ul>
                </Message>
              )}

              {courant === 'termine' && (
                <Message ton="info" titre="Terminée, pas encore validée">
                  Cette session reste modifiable : une note ajoutée maintenant n’est pas une
                  révision. La validation, elle, verrouille — elle se pose en fin de journée.
                </Message>
              )}

              <div className="axn-journee__actions">
                {permis('terminer') && (
                  <Bouton
                    taille="large"
                    chargement={enCours}
                    onClick={() => {
                      agir(() => terminerSession(session, PROFIL_PAR_DEFAUT));
                    }}
                  >
                    Terminer la session
                  </Bouton>
                )}

                {permis('rouvrir') && (
                  <Bouton
                    variante="secondaire"
                    chargement={enCours}
                    onClick={() => {
                      agir(() => rouvrirSession(session, PROFIL_PAR_DEFAUT));
                    }}
                  >
                    Rouvrir la session
                  </Bouton>
                )}

                {permis('valider') && (
                  <Bouton
                    variante="secondaire"
                    chargement={enCours}
                    onClick={() => {
                      agir(() => validerSession(session, PROFIL_PAR_DEFAUT));
                    }}
                  >
                    Valider maintenant
                  </Bouton>
                )}

                <Bouton
                  variante="discret"
                  onClick={() => {
                    naviguer({ type: 'retour' });
                  }}
                >
                  Revenir
                </Bouton>
              </div>

              {/* §19.1 : en profil `expert`, les verrous deviennent des
                  garde-fous contournables AVEC MOTIF OBLIGATOIRE, journalisé.
                  Le champ n'apparaît que si la machine autorise le geste. */}
              {permisExpert('deverrouiller') && (
                <div className="axn-journee__carte">
                  <Message ton="avertissement" titre="Session validée et verrouillée">
                    Toute correction passera par une révision tracée. Un déverrouillage exige un
                    motif, et il est réservé au profil expert.
                  </Message>
                  {/* M8 (A29) : la perte de `valideeLe` ne peut pas être évitée
                      sans un champ que L5c n'a pas le droit d'ajouter. Elle
                      cesse au moins d'être SILENCIEUSE — invariant 7. */}
                  <Message ton="alerte" titre="Ce que ce geste efface">
                    {AVERTISSEMENT_PERTE_VALIDATION}
                  </Message>
                  <textarea
                    className="axn-champ__saisie"
                    aria-label="Motif du déverrouillage"
                    value={motif}
                    onChange={(evenement) => {
                      setMotif(evenement.target.value);
                    }}
                  />
                  <div className="axn-journee__actions">
                    <Bouton
                      variante="danger"
                      chargement={enCours}
                      onClick={() => {
                        agir(() => deverrouillerSession(session, 'expert', motif));
                      }}
                    >
                      Déverrouiller avec motif
                    </Bouton>
                  </div>
                </div>
              )}

              {erreur !== null && (
                <Message ton="alerte" titre="Le geste n’a pas abouti">
                  {erreur}
                </Message>
              )}
            </>
          )}
        </>
      </ZoneEtat>
    </section>
  );
}
