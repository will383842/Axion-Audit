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
  ZoneEtat,
  type EtatSync,
  type EtatZone,
} from '@axion/ui';
import {
  CLE_DERNIER_RITUEL,
  construireJournee,
  rappelFinDeJournee,
  type EtatMissionDuJour,
  type JourneeTerrain,
} from '../../agenda/jour.js';
import { LIBELLE_TYPE_SESSION } from '../../agenda/sessions.js';
import { useTerrain } from '../../app/contexte.js';
import { lireMeta } from '../../local/base.js';
import { maintenant } from '../../local/horloge.js';
import type { SessionLocale } from '../../local/depots/sessions.js';
import { portSyncInerte, type StatutSync } from '../../local/port-sync.js';
import { memoriserSessionCourante } from '../../session/position.js';
import { formaterHeure } from '../../session/fuseau.js';
import { useEnLigne } from '../../session/media.js';
import { BandeauMiseAJour } from './BandeauMiseAJour.js';
import './journee.css';

/** Ce que l'appareil sait faire sans réseau — rappel de l'état hors ligne (§33.2). */
const CAPACITES_HORS_LIGNE = [
  'Ouvrir, mener et terminer une session de collecte',
  // « Photographier » RETIRÉ le 2026-09-05 (majeur M6, A29) : la capture photo
  // n'existe nulle part dans l'application — le point d'entrée est chez A22
  // (lot/l5b). Une liste de capacités qui promet ce que le produit ne fait pas
  // est un mensonge à l'auditeur en mode avion. À remettre quand le geste existe.
  'Annoter, signaler un point à revoir, terminer une session',
  'Exporter une sauvegarde de secours chiffrée',
];

/**
 * Le statut du port traduit vers celui de la pastille.
 *
 * `indisponible` devient `hors-ligne` et NON `synchronise` : la pastille du
 * design system n'a pas d'état « pas encore construit », et lui faire dire
 * « synchronisé » serait le mensonge que `LOT_L5.md` §3.6 interdit nommément.
 * La phrase qui accompagne la pastille, elle, dit la vérité complète.
 */
function versEtatPastille(statut: StatutSync): EtatSync {
  switch (statut) {
    case 'a_jour':
      return 'synchronise';
    case 'en_attente':
      return 'en-attente';
    case 'echec':
      return 'echec';
    case 'jamais_synchronisee':
    case 'indisponible':
      return 'hors-ligne';
  }
}

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

/** Le fuseau de la mission d'une session — « heure locale du site » (§34.2). */
function fuseauDe(
  journee: JourneeTerrain | null | undefined,
  missionId: string,
): string | undefined {
  return journee?.missions.find((m) => m.mission.id === missionId)?.mission.timezone;
}

/** Une ligne d'agenda : heure locale du site, personne, unité, type (§34.2). */
function LigneSession({
  session,
  fuseau,
  onOuvrir,
  onFinir,
}: {
  readonly session: SessionLocale;
  readonly fuseau: string | undefined;
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
      <h1>Aujourd’hui</h1>

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
          <p>
            {etatMission.aRevoirOuverts} point(s) à revoir ·{' '}
            {etatMission.sync.operationsEnAttente ?? 0} élément(s) à remonter
            {etatMission.sync.statut === 'indisponible' &&
              ' · la synchronisation n’est pas encore disponible dans cette version'}
          </p>
          <div className="axn-journee__actions">
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

      {!enLigne && (
        <ZoneEtat
          etat={{
            nature: 'hors-ligne',
            capacites: CAPACITES_HORS_LIGNE,
            ...(journee === undefined || journee === null
              ? {}
              : {
                  enAttente: journee.missions.reduce(
                    (total: number, m: EtatMissionDuJour) =>
                      total + (m.sync.operationsEnAttente ?? 0),
                    0,
                  ),
                }),
          }}
        >
          <span />
        </ZoneEtat>
      )}
    </section>
  );
}
