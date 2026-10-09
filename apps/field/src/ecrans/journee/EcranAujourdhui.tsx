// =============================================================================
// COCKPIT « AUJOURD'HUI » — 03 §34.2, l'écran d'accueil de la PWA terrain
//
// ── CE QU'IL DOIT RÉPONDRE, EN UN ÉCRAN ─────────────────────────────────────
// 03 §34.2 : « **Zéro navigation pour répondre à “qu'est-ce que je fais
// maintenant ?”** » — c'est le critère, et il commande tout l'ordre de la page :
//   ① ce qui menace la donnée (alertes locales) ;
//   ② ce que je fais MAINTENANT (reprendre, ou la session suivante) ;
//   ③ ma journée (agenda agrégé, toutes missions confondues) ;
//   ④ l'état de chaque mission (à-revoir, sync) ;
//   ⑤ le rituel de fin de journée.
// Un cockpit qui commencerait par l'état des missions ferait chercher la
// prochaine action ; c'est exactement ce que le §34.2 refuse.
//
// ── LES QUATRE ÉTATS (03 §33.2) ─────────────────────────────────────────────
// Rendus par `ZoneEtat` de `packages/ui` : chargement (squelettes aux dimensions
// finales), vide (« aucune session aujourd'hui » AVEC ce qu'il faut faire),
// erreur (cause + action), hors ligne (pastille discrète + capacités locales).
// L'état HORS LIGNE n'est PAS un état dégradé de cet écran : tout ce qu'il montre
// est local. Il est affiché comme une information, jamais comme une panne — c'est
// la différence entre l'invariant 1 tenu et l'invariant 1 affiché.
//
// ── AUCUNE PASTILLE NE VERDIT SANS SERVEUR ──────────────────────────────────
// `LOT_L5.md` §3.6 : le port de sync est inerte tant que L6a n'a pas livré ; il
// rend `indisponible` et « l'écran l'affiche tel quel — jamais une pastille
// verte ». Le compte d'opérations en attente, lui, est VRAI (lu dans l'outbox) :
// l'écran dit donc « 12 éléments à remonter, synchronisation indisponible », qui
// est la seule phrase honnête dans cet état.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total),
// E38 (sauvegarde terrain, invariant 8), E12 (entretiens par interlocuteur).
// =============================================================================
import { useCallback, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AnneauProgression,
  Badge,
  Bouton,
  Message,
  PastilleSync,
  RappelHorsLigne,
  ZoneEtat,
  type EtatZone,
} from '@axion/ui';
import {
  CAPACITES_HORS_LIGNE,
  PASTILLE_PORTEE_PAR_LA_COQUILLE,
} from '../../app/capacites-hors-ligne.js';
import { memoriserMissionARevoir } from '../../agenda/a-revoir.js';
import {
  CLE_DERNIER_RITUEL,
  construireJournee,
  rappelFinDeJournee,
  type JourneeTerrain,
} from '../../agenda/jour.js';
import { LIBELLE_TYPE_SESSION } from '../../agenda/sessions.js';
import { useTerrain } from '../../app/contexte.js';
import { versEtatPastille } from '../../app/etat-sync-affiche.js';
import { lireMeta } from '../../local/base.js';
import { maintenant } from '../../local/horloge.js';
import type { SessionLocale } from '../../local/depots/sessions.js';
import { portSyncInerte } from '../../local/port-sync.js';
import { memoriserSessionCourante } from '../../session/position.js';
import { formaterDateHeure, formaterHeure } from '../../session/fuseau.js';
import { useEnLigne } from '../../session/media.js';
import { BandeauMiseAJour } from './BandeauMiseAJour.js';
import './journee.css';

// La liste de capacités de ce cockpit vit désormais dans
// `app/capacites-hors-ligne.ts` (A21, 2026-09-06), déplacée telle quelle. Elle y
// rejoint ses dix sœurs — dont celle de l'accueil, qui promettait encore la
// photo retirée d'ici le 2026-09-05 (majeur M6) : deux listes séparées, une
// correction sur deux. Une seule chose change de fond ici : le rendu passe de
// `ZoneEtat nature="hors-ligne"` à `RappelHorsLigne`, parce que `ZoneEtat` IGNORE
// ses enfants sur cette nature — le `<span />` qu'il fallait lui passer était un
// contournement, pas une intention.

// B6 (recette novice A54, 2026-09-06) : `versEtatPastille` vivait ICI, et la
// pastille de la coquille en avait une autre — d'où deux pastilles qui se
// contredisaient sur le même écran. La traduction est remontée dans
// `app/etat-sync-affiche.ts`, une fois, pour la coquille comme pour ce cockpit.

function nombreTerminees(journee: JourneeTerrain | null | undefined): number {
  return (journee?.sessionsDuJour ?? []).filter((session) => session.status === 'termine').length;
}

/**
 * La progression du jour, en POURCENTAGE — c'est ce qu'`AnneauProgression`
 * attend (`valeur: 0 à 100`), et non un couple valeur/total.
 *
 * Zéro session ⇒ 0 %, jamais une division par zéro déguisée en anneau plein. Un
 * anneau qui affiche « 100 % » sur une journée vide est le genre de faux
 * réconfort qui se découvre en recette.
 */
function partTerminees(journee: JourneeTerrain | null | undefined): number {
  const total = journee?.sessionsDuJour.length ?? 0;
  return total === 0 ? 0 : Math.round((nombreTerminees(journee) / total) * 100);
}

/**
 * Le fuseau de la mission d'une session — « heure locale du site » (§34.2).
 * `null` si la mission n'est pas dans la journée lue : le fuseau est alors
 * INCONNU et l'heure est rendue en UTC nommé, jamais au fuseau de l'appareil
 * (arbitrage A01 du 2026-09-08).
 */
function fuseauDe(journee: JourneeTerrain | null | undefined, missionId: string): string | null {
  return journee?.missions.find((m) => m.mission.id === missionId)?.mission.timezone ?? null;
}

/** Une ligne d'agenda : heure locale du site, personne, unité, type (§34.2). */
function LigneSession({
  session,
  fuseau,
  onOuvrir,
  onFinir,
}: {
  readonly session: SessionLocale;
  readonly fuseau: string | null;
  readonly onOuvrir: (session: SessionLocale) => void;
  readonly onFinir: (session: SessionLocale) => void;
}): ReactNode {
  const heure = session.scheduledAt === null ? '—:—' : formaterHeure(session.scheduledAt, fuseau);
  const personne = session.personName ?? LIBELLE_TYPE_SESSION[session.kind];

  return (
    <li>
      <button
        type="button"
        className="axn-journee__session"
        onClick={() => {
          onOuvrir(session);
        }}
      >
        <span className="axn-journee__heure">{heure}</span>
        <span className="axn-journee__details">
          <span className="axn-journee__personne">{personne}</span>
          <span className="axn-journee__contexte">
            {LIBELLE_TYPE_SESSION[session.kind]}
            {session.personRole === null ? '' : ` · ${session.personRole}`}
          </span>
        </span>
        {session.status === 'en_cours' && <Badge ton="avertissement">En cours</Badge>}
        {session.status === 'termine' && session.valideeLe === null && (
          <Badge ton="info">Terminée, à valider</Badge>
        )}
        {session.valideeLe !== null && <Badge ton="succes">Validée</Badge>}
      </button>
      {/* Bloquant B1 de la revue A29 : le geste « Terminer » n'existait NULLE
          PART, et la validation groupée s'appliquait donc à un ensemble
          structurellement vide. Il est ici, sur la ligne de la session, là où
          l'auditeur la voit. HORS du <button> de la ligne : un bouton dans un
          bouton est un HTML invalide et un piège de navigation clavier. */}
      {(session.status === 'en_cours' || session.status === 'termine') && (
        <Bouton
          variante="secondaire"
          onClick={() => {
            onFinir(session);
          }}
        >
          {session.status === 'en_cours' ? 'Terminer la session' : 'Rouvrir ou valider'}
        </Bouton>
      )}
    </li>
  );
}

export function EcranAujourdhui(): ReactNode {
  const { base, naviguer } = useTerrain();
  const enLigne = useEnLigne();

  // `useLiveQuery` : le cockpit se rafraîchit quand la base bouge, sans qu'aucun
  // écran n'ait à le lui demander. `undefined` = pas encore répondu (chargement),
  // `null` = la lecture a ÉCHOUÉ — deux états distincts, §33.2 les sépare.
  const journee = useLiveQuery(
    async (): Promise<JourneeTerrain | null | undefined> => {
      if (base === null) return undefined;
      try {
        return await construireJournee(portSyncInerte);
      } catch {
        // La cause exacte n'est pas remontée à l'écran : elle contiendrait des
        // détails techniques, et 11 §2 proscrit les journaux bavards côté client.
        // L'écran dit la cause MÉTIER et l'action, ce que §33.2 exige.
        return null;
      }
    },
    [base],
    undefined,
  );

  /**
   * Ouvrir une session, quel que soit son état.
   *
   * **Aucun verrou ici** (03 §19.1 : « aucun verrou ne peut jamais bloquer la
   * SAISIE ») : une session validée s'ouvre aussi, en lecture, et c'est l'écran
   * d'entretien qui portera la conséquence du verrouillage. Refuser l'ouverture
   * empêcherait de RELIRE ce qu'on a validé.
   */
  const ouvrir = useCallback(
    (session: SessionLocale): void => {
      if (base === null) return;
      void memoriserSessionCourante(base, session.id).then(() => {
        naviguer({ type: 'aller', vue: 'entretien' });
      });
    },
    [base, naviguer],
  );

  // 03 §34.2-2 : « rappel discret sur le cockpit tant que le rituel du jour n'est
  // pas fait ». Le domaine le calcule (`rappelFinDeJournee`) ; il n'était rendu
  // nulle part — une fonction orpheline, attrapée par A27. `CLE_DERNIER_RITUEL`
  // est la clé qu'écrit `EcranFinDeJournee` ; la lire ici est le seul couplage.
  const dernierRituel = useLiveQuery(
    async () => (base === null ? null : ((await lireMeta(base, CLE_DERNIER_RITUEL)) ?? null)),
    [base],
    null,
  );
  const rappel =
    journee == null
      ? null
      : rappelFinDeJournee(
          typeof dernierRituel === 'string' ? dernierRituel : null,
          journee,
          maintenant(),
        );

  /**
   * NB-15 — « ses à-revoir en attente (**compteur cliquable par mission**) »
   * (03 §34.2). Le compteur était un nombre mort : l'auditeur savait COMBIEN de
   * zones d'ombre il laissait derrière lui, et devait les retrouver entretien
   * par entretien. La mission tapée est mémorisée dans `meta` — la navigation
   * n'a pas de paramètre (`app/navigation.ts`) — puis la liste consolidée
   * s'ouvre (03 M3), d'où chaque point rouvre SA question (§17.2).
   */
  const ouvrirARevoir = useCallback(
    (missionId: string): void => {
      if (base === null) return;
      void memoriserMissionARevoir(base, missionId).then(() => {
        naviguer({ type: 'aller', vue: 'aRevoir' });
      });
    },
    [base, naviguer],
  );

  /** Ouvre l'écran de fin de session sur CETTE session (bloquant B1, A29). */
  const finir = useCallback(
    (session: SessionLocale): void => {
      if (base === null) return;
      void memoriserSessionCourante(base, session.id).then(() => {
        naviguer({ type: 'aller', vue: 'finDeSession' });
      });
    },
    [base, naviguer],
  );

  const etat: EtatZone =
    journee === undefined
      ? { nature: 'chargement', libelle: 'Lecture de votre journée', lignes: 4 }
      : journee === null
        ? {
            nature: 'erreur',
            titre: 'Votre journée n’a pas pu être lue',
            cause: 'Les données locales de cet appareil n’ont pas pu être ouvertes.',
            action:
              'Rechargez la page. Si le problème persiste, exportez une sauvegarde de secours avant toute autre manipulation.',
          }
        : journee.sessionsDuJour.length === 0
          ? {
              nature: 'vide',
              titre: 'Aucune session prévue aujourd’hui',
              description:
                'Planifiez une session depuis l’agenda, ou ouvrez un entretien imprévu en trois champs. Tout fonctionne sans réseau.',
              actions: (
                <div className="axn-journee__actions">
                  <Bouton
                    onClick={() => {
                      naviguer({ type: 'aller', vue: 'agenda' });
                    }}
                  >
                    Ouvrir l’agenda
                  </Bouton>
                  <Bouton
                    variante="secondaire"
                    onClick={() => {
                      naviguer({ type: 'aller', vue: 'nouvelEntretien' });
                    }}
                  >
                    Nouvel entretien
                  </Bouton>
                </div>
              ),
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <BandeauMiseAJour />
      {/* ── ① Ce qui menace la donnée ─────────────────────────────────────── */}
      {(journee?.alertes ?? []).map((alerte) => (
        <Message
          key={`${alerte.nature}-${alerte.missionId}-${alerte.cible.type === 'session' ? alerte.cible.id : 'mission'}`}
          ton={alerte.nature === 'sync_muette' ? 'alerte' : 'avertissement'}
          titre={
            alerte.nature === 'sync_muette'
              ? 'Sauvegarde des données de collecte'
              : alerte.nature === 'entretien_non_termine'
                ? 'Session commencée'
                : 'Points à revoir'
          }
          actions={
            alerte.cible.type === 'session' ? (
              <Bouton
                variante="secondaire"
                onClick={() => {
                  const cible = journee?.sessionsDuJour.find(
                    (s) => alerte.cible.type === 'session' && s.id === alerte.cible.id,
                  );
                  if (cible !== undefined) ouvrir(cible);
                }}
              >
                Reprendre
              </Bouton>
            ) : alerte.nature === 'a_revoir_en_attente' ? (
              // NB-15 : l'alerte nommait le nombre et n'offrait aucun geste. Elle
              // mène là où le compteur mène — une alerte qu'on ne peut pas
              // traiter depuis l'endroit où on la lit se traite en la lisant deux
              // fois.
              <Bouton
                variante="secondaire"
                onClick={() => {
                  ouvrirARevoir(alerte.missionId);
                }}
              >
                Voir les points à revoir
              </Bouton>
            ) : undefined
          }
        >
          {alerte.message}
        </Message>
      ))}

      {/* ── ② Ce que je fais maintenant ────────────────────────────────────── */}
      {journee?.aReprendre != null && (
        <div className="axn-journee__carte">
          <div className="axn-journee__entete-carte">
            <h2 className="axn-journee__titre-carte">Reprendre là où vous vous êtes arrêté</h2>
          </div>
          <p>
            {journee.aReprendre.personName ?? 'Session sans interlocuteur nommé'} ·{' '}
            {LIBELLE_TYPE_SESSION[journee.aReprendre.kind]}
          </p>
          <div className="axn-journee__actions">
            <Bouton
              taille="large"
              onClick={() => {
                if (journee.aReprendre !== null) ouvrir(journee.aReprendre);
              }}
            >
              Reprendre la session
            </Bouton>
          </div>
        </div>
      )}

      {/* ── ③ Ma journée, toutes missions confondues ───────────────────────── */}
      <ZoneEtat etat={etat}>
        <div className="axn-journee__carte">
          <div className="axn-journee__entete-carte">
            <h2 className="axn-journee__titre-carte">Vos sessions du jour</h2>
            <AnneauProgression
              valeur={partTerminees(journee)}
              libelle="Sessions terminées"
              libelleAccessible={`${String(nombreTerminees(journee))} session(s) terminée(s) sur ${String(journee?.sessionsDuJour.length ?? 0)}`}
            />
          </div>
          <ul className="axn-journee__liste">
            {/* `sessionsDuJour` et non `missions.flatMap` : c'est la liste triée
                APRÈS le mélange des missions. La première version itérait mission
                par mission — le tri du domaine était juste et jamais utilisé, et
                l'auditeur lisait sa matinée deux fois. A27 l'a mesuré. */}
            {(journee?.sessionsDuJour ?? []).map((session) => (
              <LigneSession
                key={session.id}
                session={session}
                fuseau={fuseauDe(journee, session.missionId)}
                onOuvrir={ouvrir}
                onFinir={finir}
              />
            ))}
          </ul>
          <div className="axn-journee__actions">
            <Bouton
              variante="secondaire"
              onClick={() => {
                naviguer({ type: 'aller', vue: 'agenda' });
              }}
            >
              Voir l’agenda
            </Bouton>
            <Bouton
              variante="secondaire"
              onClick={() => {
                naviguer({ type: 'aller', vue: 'nouvelEntretien' });
              }}
            >
              Nouvel entretien
            </Bouton>
          </div>
        </div>
      </ZoneEtat>

      {/* ── ④ L'état de chaque mission ─────────────────────────────────────── */}
      {(journee?.missions ?? []).map((etatMission) => (
        <div key={etatMission.mission.id} className="axn-journee__carte">
          <div className="axn-journee__entete-carte">
            <h2 className="axn-journee__titre-carte">{etatMission.mission.titre}</h2>
            <PastilleSync
              etat={versEtatPastille(etatMission.sync.statut)}
              {...(etatMission.sync.operationsEnAttente === null
                ? {}
                : { enAttente: etatMission.sync.operationsEnAttente })}
            />
          </div>
          {/* 03 §34.2, la troisième donnée de « l'état de sync par mission » :
              le DERNIER SUCCÈS. Rendu ICI, dans la phrase qui dit déjà les deux
              autres (file, disponibilité), et non dans la prop `derniereSync` de
              la pastille — délibérément (A23, 2026-09-08) : la pastille est
              l'ÉTAT, traduit par `etat-sync-affiche.ts` pour la coquille comme
              pour ce cockpit (B6) ; un texte libre qui y entrerait n'aurait pas
              d'équivalent dans l'en-tête, et « jamais synchronisée » dans une
              pastille rendrait illisible la garde « aucune pastille verte »
              (`/synchronis[ée]e?/`). L'instant est lu dans `meta` par
              `construireJournee`, le même qui nourrit l'alerte de l'invariant 8,
              et formaté AU FUSEAU DE LA MISSION (03 §22.2, invariant 5). */}
          <p>
            {etatMission.sync.operationsEnAttente ?? 0} élément(s) à remonter ·{' '}
            {etatMission.sync.derniereSyncReussieLe === null
              ? 'jamais synchronisée depuis cet appareil'
              : `dernière synchronisation réussie le ${formaterDateHeure(
                  etatMission.sync.derniereSyncReussieLe,
                  etatMission.mission.timezone,
                )}`}
            {etatMission.sync.statut === 'indisponible' &&
              ' · la synchronisation n’est pas encore disponible dans cette version'}
          </p>
          {/*
            NB-15 — LE COMPTEUR EST LE BOUTON, et il n'y a qu'un compteur.

            03 §34.2 dit « compteur CLIQUABLE par mission » : le nombre a quitté
            la phrase ci-dessus pour devenir ce bouton. Le laisser AUSSI dans la
            phrase aurait donné deux fois le même fait sur la même carte —
            exactement ce que B6 a coûté avec les deux pastilles de sync.

            À ZÉRO, ce n'est plus un bouton mais une phrase. Un lien qui ouvre une
            liste vide fait faire un aller-retour pour rien en pleine journée ;
            et l'auditeur qui lit « aucun point à revoir » a déjà sa réponse. La
            liste garde son état vide pour le cas où le dernier point est levé
            alors qu'on y est (§33.2).
          */}
          <div className="axn-journee__actions">
            {etatMission.aRevoirOuverts > 0 ? (
              <Bouton
                variante="secondaire"
                onClick={() => {
                  ouvrirARevoir(etatMission.mission.id);
                }}
              >
                {etatMission.aRevoirOuverts} point(s) à revoir
              </Bouton>
            ) : (
              <p className="axn-coquille__mention">Aucun point à revoir</p>
            )}
            <Bouton
              variante="secondaire"
              onClick={() => {
                naviguer({ type: 'aller', vue: 'pilote' });
              }}
            >
              Où en est cette mission ?
            </Bouton>
          </div>
        </div>
      ))}

      {/* ── ⑤ Le rituel de fin de journée ──────────────────────────────────── */}
      {rappel !== null && (
        <Message ton="info" titre="Rituel du soir">
          {rappel}
        </Message>
      )}
      <div className="axn-journee__actions">
        <Bouton
          taille="large"
          onClick={() => {
            naviguer({ type: 'aller', vue: 'finDeJournee' });
          }}
        >
          Fin de journée
        </Bouton>
        {/* L'écran d'EMBARQUEMENT (L5a) reste joignable : la règle de vue initiale
            (arbitrage A01, 2026-09-05) fait atterrir ici quand une mission est
            présente, elle ne retire pas l'autre écran de la route. */}
        <Bouton
          variante="discret"
          onClick={() => {
            naviguer({ type: 'aller', vue: 'accueil' });
          }}
        >
          Missions et stockage de l’appareil
        </Bouton>
      </div>

      {/*
        §33.2 — le rappel des capacités. La condition `!enLigne` n'est plus écrite
        ici : elle est DANS `RappelHorsLigne`, qui ne rend rien quand le réseau
        est là. C'est le point du composant — une condition qu'un écran sur deux
        oubliait d'écrire n'en est pas une.

        Le COMPTE en attente n'est plus passé, et c'est délibéré : la pastille de
        l'en-tête l'affiche déjà, lu dans l'outbox. Celui d'ici l'additionnait
        depuis `sync.operationsEnAttente` — deux comptes du même fait, sur le même
        écran, susceptibles de diverger. B6 a coûté assez cher pour qu'on ne
        recommence pas avec un nombre.
      */}
      <RappelHorsLigne
        enLigne={enLigne}
        capacites={CAPACITES_HORS_LIGNE.aujourdhui}
        avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}
      />
    </section>
  );
}
