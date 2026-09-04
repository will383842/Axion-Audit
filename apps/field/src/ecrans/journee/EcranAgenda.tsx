// =============================================================================
// AGENDA D'ENTRETIENS — 03 §25.2 (version simple), §27.1/§28.1 (les 6 kind),
// §25.3 (proposition d'unité), §25.6 (entretien complémentaire), §34.6
// (anti-collision NON bloquante), §17.3 (fin de visite)
//
// ── « VERSION SIMPLE », ET CE QUE ÇA VEUT DIRE ICI ─────────────────────────
// 03 §25.2 est intitulé « Agenda d'entretiens (N4 — noyau strict, **version
// simple**) » : une liste par jour, une saisie hors ligne, un avertissement de
// chevauchement. Pas de vue calendaire, pas de glisser-déposer, pas de
// récurrence — le calendrier d'ÉQUIPE est l'espace 3 de la console (§34.6), et
// il est en Phase 2. Livrer ici une vue calendaire serait du périmètre pris sans
// arbitrage.
//
// ── LA PLANIFICATION EST CE QUI REND LE « UN TAP » POSSIBLE ────────────────
// 03 §34.2-1 : taper une session planifiée la démarre PRÉ-REMPLIE, « zéro champ à
// ressaisir ». Ce n'est pas une astuce d'écran : c'est que la session a été créée
// ICI, avec son nom, sa fonction, son unité et son type. Cet écran est donc la
// moitié amont du geste d'un tap.
//
// ── LES QUATRE ÉTATS (03 §33.2) ────────────────────────────────────────────
// Chargement, vide (avec ce qu'il faut faire), erreur (cause + action), hors
// ligne (nominal ici : toute la planification se fait sans réseau).
//
// Traçabilité : E12 (entretiens par interlocuteur), E6 (hors ligne total),
// E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, ChampTexte, Message, Selection, ZoneEtat, type EtatZone } from '@axion/ui';
import {
  AIDE_TYPE_SESSION,
  chevauchements,
  LIBELLE_MODE_ENTRETIEN,
  LIBELLE_TYPE_SESSION,
  modeApplicable,
  planifierSession,
  type Chevauchement,
  type ModeEntretien,
} from '../../agenda/sessions.js';
import { LIBELLE_TYPE_UNITE, proposerUnite, type TypeUnite } from '../../agenda/unites.js';
import { useTerrain } from '../../app/contexte.js';
import { contexteLocal } from '../../local/contexte.js';
import { depotSessions } from '../../local/depots/sessions.js';
import { MODES_ENTRETIEN, TYPES_DE_SESSION, TYPES_UNITE } from '../../local/formes.js';
import { lireIdentiteAuditeur } from '../../session/auditeur.js';
import { formaterHeure } from '../../session/fuseau.js';
import { lireMissionsLocales, lireUnites } from '../../session/missions.js';
import './journee.css';

/**
 * `datetime-local` rend `'AAAA-MM-JJTHH:mm'` en heure LOCALE de l'appareil.
 * L'API et la base sont en UTC (11 §3, invariant 5) : la conversion se fait ici,
 * à l'entrée, et une seule fois. L'affichage, lui, repasse par `formaterHeure`
 * au fuseau de la MISSION (03 §22.2) — les deux ne sont pas le même geste.
 */
function versUtc(saisieLocale: string): string | null {
  if (saisieLocale === '') return null;
  const instant = new Date(saisieLocale);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function EcranAgenda(): ReactNode {
  const { base, naviguer } = useTerrain();
  const identifiant = useId();

  const [missionId, setMissionId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [kind, setKind] = useState<(typeof TYPES_DE_SESSION)[number]>('entretien');
  const [mode, setMode] = useState<ModeEntretien>('sur_site');
  const [nom, setNom] = useState('');
  const [fonction, setFonction] = useState('');
  const [creneau, setCreneau] = useState('');
  const [duree, setDuree] = useState('45');
  const [participants, setParticipants] = useState('');
  const [collisions, setCollisions] = useState<readonly Chevauchement[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // ── Proposition d'unité (03 §25.3) ────────────────────────────────────────
  const [proposeVisible, setProposeVisible] = useState(false);
  const [nomUnite, setNomUnite] = useState('');
  const [typeUnite, setTypeUnite] = useState<TypeUnite>('service');
  const [effectif, setEffectif] = useState('');

  const missions = useLiveQuery(
    async () => (base === null ? undefined : lireMissionsLocales()),
    [base],
    undefined,
  );
  const missionCourante =
    missionId === ''
      ? (missions?.[0] ?? null)
      : (missions?.find((m) => m.id === missionId) ?? null);

  const unites = useLiveQuery(
    async () => (missionCourante === null ? [] : lireUnites(missionCourante.id)),
    [missionCourante?.id],
    [],
  );

  const sessions = useLiveQuery(
    async () =>
      missionCourante === null
        ? []
        : depotSessions.duJour({
            missionId: missionCourante.id,
            fuseau: missionCourante.timezone,
          }),
    [missionCourante?.id, missionCourante?.timezone],
    [],
  );

  const uniteChoisie = orgUnitId === '' ? (unites[0]?.id ?? '') : orgUnitId;

  const planifier = useCallback(
    (evenement: FormEvent): void => {
      evenement.preventDefault();
      if (base === null || missionCourante === null) return;
      setEnCours(true);
      setErreur(null);
      setMessage(null);

      void (async (): Promise<void> => {
        const identite = await lireIdentiteAuditeur(base, contexteLocal().coffre);
        if (identite === null) {
          throw new Error(
            'Aucune identité d’auditeur n’est enregistrée sur cet appareil : connectez-vous une fois au siège avant de planifier.',
          );
        }
        const quand = versUtc(creneau);
        const dureeMin = duree === '' ? null : Number.parseInt(duree, 10);

        // L'anti-collision est calculée AVANT, affichée APRÈS, et ne conditionne
        // RIEN (03 §25.2 « non bloquant », §34.6, §19.1). La session est créée
        // dans tous les cas.
        setCollisions(
          chevauchements(
            {
              orgUnitId: uniteChoisie,
              personName: nom.trim() === '' ? null : nom.trim(),
              scheduledAt: quand,
              scheduledDurationMin: dureeMin,
            },
            sessions,
          ),
        );

        await planifierSession({
          missionId: missionCourante.id,
          orgUnitId: uniteChoisie,
          kind,
          conductedBy: identite.id,
          scheduledAt: quand,
          dureeMin: Number.isNaN(dureeMin) ? null : dureeMin,
          ...(modeApplicable(kind) ? { mode } : {}),
          personName: nom.trim() === '' ? null : nom.trim(),
          personRole: fonction.trim() === '' ? null : fonction.trim(),
          participants:
            kind === 'atelier'
              ? participants
                  .split('\n')
                  .map((ligne) => ligne.trim())
                  .filter((ligne) => ligne !== '')
                  .map((ligne) => {
                    const [personne, role] = ligne.split(/\s*[—-]\s*/, 2);
                    return { nom: personne ?? ligne, fonction: role ?? '' };
                  })
              : null,
        });

        setMessage(
          'Session planifiée. Elle apparaîtra dans votre journée, prête à démarrer en un tap.',
        );
        setNom('');
        setFonction('');
        setParticipants('');
      })()
        .catch((cause: unknown) => {
          setErreur(
            cause instanceof Error ? cause.message : 'La session n’a pas pu être planifiée.',
          );
        })
        .finally(() => {
          setEnCours(false);
        });
    },
    [
      base,
      creneau,
      duree,
      fonction,
      kind,
      missionCourante,
      mode,
      nom,
      participants,
      sessions,
      uniteChoisie,
    ],
  );

  const proposer = useCallback((): void => {
    if (base === null || missionCourante === null) return;
    setEnCours(true);
    setErreur(null);

    void (async (): Promise<void> => {
      const identite = await lireIdentiteAuditeur(base, contexteLocal().coffre);
      if (identite === null) {
        throw new Error('Aucune identité d’auditeur n’est enregistrée sur cet appareil.');
      }
      const id = await proposerUnite({
        missionId: missionCourante.id,
        nom: nomUnite,
        kind: typeUnite,
        parentId: uniteChoisie === '' ? null : uniteChoisie,
        effectifEstime: effectif === '' ? null : Number.parseInt(effectif, 10),
        proposeePar: identite.id,
        // Après l'arbre du siège : le terrain propose, il ne réordonne pas.
        position: 1000 + unites.length,
      });
      setOrgUnitId(id);
      setNomUnite('');
      setEffectif('');
      setProposeVisible(false);
      setMessage(
        'Unité proposée. Vous pouvez y rattacher des sessions dès maintenant ; le siège la qualifiera à la synchronisation.',
      );
    })()
      .catch((cause: unknown) => {
        setErreur(cause instanceof Error ? cause.message : 'L’unité n’a pas pu être proposée.');
      })
      .finally(() => {
        setEnCours(false);
      });
  }, [base, effectif, missionCourante, nomUnite, typeUnite, unites.length, uniteChoisie]);

  const optionsUnites = useMemo(
    () =>
      unites.map((unite) => ({
        valeur: unite.id,
        libelle: unite.status === 'proposee' ? `${unite.name} (proposée)` : unite.name,
      })),
    [unites],
  );

  const etat: EtatZone =
    missions === undefined
      ? { nature: 'chargement', libelle: 'Lecture des missions embarquées', lignes: 3 }
      : missions.length === 0
        ? {
            nature: 'vide',
            titre: 'Aucune mission sur cet appareil',
            description:
              'Embarquez une mission depuis l’accueil avant de planifier des sessions de collecte.',
            actions: (
              <Bouton
                onClick={() => {
                  naviguer({ type: 'aller', vue: 'accueil' });
                }}
              >
                Revenir à l’accueil
              </Bouton>
            ),
          }
        : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <h1>Agenda</h1>

      <ZoneEtat etat={etat}>
        <>
          {/* ── La journée déjà planifiée ─────────────────────────────────── */}
          <div className="axn-journee__carte">
            <div className="axn-journee__entete-carte">
              <h2 className="axn-journee__titre-carte">Sessions du jour</h2>
            </div>
            {sessions.length === 0 ? (
              <p>Aucune session planifiée aujourd’hui sur cette mission.</p>
            ) : (
              <ul className="axn-journee__liste">
                {sessions.map((session) => (
                  <li key={session.id} className="axn-journee__session">
                    <span className="axn-journee__heure">
                      {session.scheduledAt === null
                        ? '—:—'
                        : formaterHeure(session.scheduledAt, missionCourante?.timezone)}
                    </span>
                    <span className="axn-journee__details">
                      <span className="axn-journee__personne">
                        {session.personName ?? LIBELLE_TYPE_SESSION[session.kind]}
                      </span>
                      <span className="axn-journee__contexte">
                        {LIBELLE_TYPE_SESSION[session.kind]}
                        {session.mode === null ? '' : ` · ${LIBELLE_MODE_ENTRETIEN[session.mode]}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Planifier une session ─────────────────────────────────────── */}
          <form className="axn-journee__carte" onSubmit={planifier}>
            <div className="axn-journee__entete-carte">
              <h2 className="axn-journee__titre-carte">Planifier une session de collecte</h2>
            </div>

            {(missions?.length ?? 0) > 1 && (
              <Selection
                libelle="Mission"
                value={missionCourante?.id ?? ''}
                onChange={(evenement) => {
                  setMissionId(evenement.target.value);
                  setOrgUnitId('');
                }}
                options={(missions ?? []).map((m) => ({ valeur: m.id, libelle: m.titre }))}
              />
            )}

            <Selection
              libelle="Type de session"
              aide={AIDE_TYPE_SESSION[kind]}
              value={kind}
              onChange={(evenement) => {
                setKind(evenement.target.value as (typeof TYPES_DE_SESSION)[number]);
              }}
              options={TYPES_DE_SESSION.map((valeur) => ({
                valeur,
                libelle: LIBELLE_TYPE_SESSION[valeur],
              }))}
            />

            {/* 03 §32.6-1 : le mode n'existe QUE pour l'entretien. Le champ
                disparaît plutôt que de se griser — un champ grisé invite à
                chercher comment l'activer. */}
            {modeApplicable(kind) && (
              <Selection
                libelle="Mode"
                value={mode}
                onChange={(evenement) => {
                  setMode(evenement.target.value as ModeEntretien);
                }}
                options={MODES_ENTRETIEN.map((valeur) => ({
                  valeur,
                  libelle: LIBELLE_MODE_ENTRETIEN[valeur],
                }))}
              />
            )}

            <Selection
              libelle="Unité"
              value={uniteChoisie}
              onChange={(evenement) => {
                setOrgUnitId(evenement.target.value);
              }}
              options={optionsUnites}
            />

            <Bouton
              type="button"
              variante="discret"
              onClick={() => {
                setProposeVisible((visible) => !visible);
              }}
            >
              {proposeVisible ? 'Annuler la proposition' : 'L’unité n’est pas dans la liste'}
            </Bouton>

            {proposeVisible && (
              <div className="axn-journee__carte">
                <ChampTexte
                  libelle="Nom de l’unité"
                  aide="Elle sera proposée au siège, qui la validera ou la fusionnera. Vous pouvez y rattacher des sessions dès maintenant."
                  value={nomUnite}
                  onChange={(evenement) => {
                    setNomUnite(evenement.target.value);
                  }}
                />
                <Selection
                  libelle="Type d’unité"
                  value={typeUnite}
                  onChange={(evenement) => {
                    setTypeUnite(evenement.target.value as TypeUnite);
                  }}
                  options={TYPES_UNITE.map((valeur) => ({
                    valeur,
                    libelle: LIBELLE_TYPE_UNITE[valeur],
                  }))}
                />
                <ChampTexte
                  nature="nombre"
                  libelle="Effectif estimé"
                  aide="Une estimation vaut mieux qu’un vide."
                  value={effectif}
                  onChange={(evenement) => {
                    setEffectif(evenement.target.value);
                  }}
                />
                <Bouton type="button" variante="secondaire" chargement={enCours} onClick={proposer}>
                  Proposer cette unité
                </Bouton>
              </div>
            )}

            {kind === 'atelier' ? (
              <ChampTexte
                libelle="Participants"
                aide="Un par ligne, au format « Nom — fonction »."
                value={participants}
                onChange={(evenement) => {
                  setParticipants(evenement.target.value);
                }}
              />
            ) : (
              <>
                <ChampTexte
                  libelle="Nom de l’interlocuteur"
                  value={nom}
                  onChange={(evenement) => {
                    setNom(evenement.target.value);
                  }}
                />
                <ChampTexte
                  libelle="Fonction"
                  value={fonction}
                  onChange={(evenement) => {
                    setFonction(evenement.target.value);
                  }}
                />
              </>
            )}

            {/*
              `ChampTexte` retire délibérément `type` : ses six natures sont des
              natures de DONNÉE, et aucune n'est un instant. Le sélecteur natif
              `datetime-local` est pourtant ce qui rend la saisie d'un créneau
              supportable au doigt — il ouvre le sélecteur d'heure de l'appareil
              plutôt qu'un clavier. L'écran compose donc les classes du design
              system directement, exactement comme `EcranDeverrouillage` (L5a) le
              fait pour le mot de passe et pour la même raison : aucune couleur ni
              taille en dur, aucun jeton nouveau (invariant 4).
            */}
            <div className="axn-champ">
              <label className="axn-champ__libelle" htmlFor={`${identifiant}-creneau`}>
                Créneau
              </label>
              <input
                id={`${identifiant}-creneau`}
                className="axn-champ__saisie"
                type="datetime-local"
                aria-describedby={`${identifiant}-creneau-aide`}
                value={creneau}
                onChange={(evenement) => {
                  setCreneau(evenement.target.value);
                }}
              />
              <p id={`${identifiant}-creneau-aide`} className="axn-champ__aide">
                Heure de cet appareil. Elle sera affichée au fuseau du site audité.
              </p>
            </div>
            <ChampTexte
              nature="nombre"
              libelle="Durée prévue (minutes)"
              value={duree}
              onChange={(evenement) => {
                setDuree(evenement.target.value);
              }}
            />

            <Bouton type="submit" taille="large" chargement={enCours}>
              Planifier
            </Bouton>
          </form>

          {/* L'avertissement de chevauchement arrive APRÈS la création : il
              informe, il n'a jamais empêché (03 §25.2, §34.6, §19.1). */}
          {collisions.map((collision) => (
            <Message key={collision.sessionId} ton="avertissement" titre="Créneau déjà occupé">
              {collision.message}
            </Message>
          ))}

          {message !== null && (
            <Message ton="succes" titre="C’est enregistré">
              {message}
            </Message>
          )}
          {erreur !== null && (
            <Message ton="alerte" titre="La session n’a pas été planifiée">
              {erreur}
            </Message>
          )}
        </>
      </ZoneEtat>
    </section>
  );
}
