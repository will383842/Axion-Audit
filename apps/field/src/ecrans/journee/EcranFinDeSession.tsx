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

  const vue = useLiveQuery(
    async (): Promise<VueSession | null | undefined> => {
      if (base === null) return undefined;
      try {
        const id = await lireSessionCourante(base);
        if (id === null) return null;
        const session = await depotSessions.parId(id);
        if (session === null) return null;
        const avancement = await depotReponses.avancement(id);
        const questions = await depotQuestions.parMission(session.missionId);
        const pieces = await lireNotesVolantes(id);
        return {
          session,
          repondu: avancement.repondues,
          total: questions.length,
          aRevoir: avancement.aRevoir,
          na: avancement.nonApplicables,
          nonCommunique: avancement.nonCommuniquees,
          pieces: pieces.length,
        };
      } catch {
        return null;
      }
    },
    [base],
    undefined,
  );

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

  const etat: EtatZone =
    vue === undefined
      ? { nature: 'chargement', libelle: 'Lecture de la session', lignes: 4 }
      : vue === null
        ? {
            nature: 'vide',
            titre: 'Aucune session ouverte',
            description:
              'Ouvrez une session depuis votre journée, puis revenez ici pour la terminer ou la valider.',
            actions: (
              <Bouton
                onClick={() => {
                  naviguer({ type: 'racine', vue: 'aujourdhui' });
                }}
              >
                Revenir à ma journée
              </Bouton>
            ),
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
  if (vue !== undefined && vue !== null) {
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
          {session !== null && vue != null && (
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
