// =============================================================================
// ÉCRAN D'ACCUEIL DU SOCLE — les quatre états, et rien qui mente
//
// Ce n'est PAS le cockpit « Aujourd'hui » du 03 §34.2 : celui-là est le périmètre
// de L5c, avec l'agenda, la fin de journée et l'export de secours. Ici, le socle
// montre ce qu'il sait réellement — les missions présentes sur cet appareil, la
// file de montée, l'état de la sauvegarde et celui du lien avec le siège — et il
// dit franchement ce qui n'est pas encore disponible.
//
// ── LES QUATRE ÉTATS (03 §33.2) ─────────────────────────────────────────────
// vide (aucune mission), chargement (squelettes aux dimensions finales),
// **erreur** (la lecture locale a échoué — réserve R-L5a-7 : une `useLiveQuery`
// qui rejette faisait tomber l'écran entier au lieu d'afficher une cause et une
// action) et hors ligne, qui est le mode NOMINAL de cette application
// (invariant 1) et se dit donc comme une capacité, pas comme une panne.
//
// ── UNE SEULE SOURCE POUR L'INVARIANT 8 ─────────────────────────────────────
// L'alerte « aucune sync depuis 24 h » n'est plus calculée ici : elle vient de
// `portSyncInerte.etat(missionId)` (réserve R-L5a-8). Deux endroits qui calculent
// la même alerte finissent par en afficher deux différentes, et c'est justement
// l'alerte qui dit à l'auditeur que sa journée ne vit que sur sa tablette.
// `LOT_L5.md` §3.6 : la pastille ne verdit pas tant que L6a n'a pas livré — une
// pastille qui verdit sans serveur annonce plus qu'elle ne fait.
//
// ── L'EMBARQUEMENT EST APPELÉ POUR DE VRAI, ET IL GUIDE ─────────────────────
// Le bouton appelle `embarquerMission` : la persistance du stockage (05 §31-2)
// est réellement demandée. Si elle est REFUSÉE, l'écran ne se contente pas de
// l'afficher — il conduit à l'écran de stockage, qui explique quoi faire
// (bloquant B3 : cet écran n'était atteignable par aucun chemin de production).
//
// Traçabilité : E38 (sauvegarde terrain : sync + export), E26 (alertes actives sur
// les manques).
// =============================================================================
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message, PastilleSync, ZoneEtat, type EtatZone } from '@axion/ui';
import { cleEmbarquement, clePersistance, type BaseLocale } from '../local/base.js';
import { embarquerMission, type ResultatEmbarquement } from '../local/embarquement.js';
import { portSyncInerte, type EtatSyncMission } from '../local/port-sync.js';
import { useTerrain } from './contexte.js';
import { AccesEntretien } from '../ecrans/entretien/AccesEntretien.js'; // raccordement L5b (A22)

/** Une mission présente localement, avec les deux états que B4 sépare. */
interface MissionLocale {
  readonly id: string;
  /** Les DONNÉES sont là (premier pull réussi). */
  readonly embarquee: boolean;
  /** `storage.persist()` a été accordé pour elle (condition, pas résultat). */
  readonly persistanceAccordee: boolean;
  readonly operationsEnAttente: number;
  readonly operationsBloquees: number;
}

interface ResumeSocle {
  readonly missions: readonly MissionLocale[];
  readonly missionsEmbarquees: number;
  readonly operationsEnAttente: number;
  readonly operationsBloquees: number;
  readonly sessionsEnCours: number;
}

type LectureSocle = { readonly ok: true; readonly resume: ResumeSocle } | { readonly ok: false };

/**
 * Lecture d'INDEX uniquement : identifiants, marques et compteurs. Aucun
 * déchiffrement, donc aucun titre de mission ici — `missions.titre` vit dans la
 * charge chiffrée (`LOT_L5.md` §3.2). Afficher le libellé est le travail du
 * cockpit L5c, qui passe par le dépôt.
 *
 * Les missions viennent de la table `missions` ET de l'outbox : après une purge,
 * des opérations peuvent survivre à la mission qui les a produites, et ce sont
 * précisément celles qu'il ne faut pas perdre de vue (invariant 7).
 */
async function lireResume(base: BaseLocale): Promise<ResumeSocle> {
  const cles = new Set(
    (await base.meta.where('cle').startsWith('mission:').toArray()).map((ligne) => ligne.cle),
  );

  const enAttenteParMission = new Map<string, number>();
  const bloqueesParMission = new Map<string, number>();
  await base.outbox.each((op) => {
    const cible = op.statut === 'en_attente' ? enAttenteParMission : bloqueesParMission;
    cible.set(op.missionId, (cible.get(op.missionId) ?? 0) + 1);
  });

  const identifiants = new Set<string>((await base.missions.toArray()).map((ligne) => ligne.id));
  for (const id of enAttenteParMission.keys()) identifiants.add(id);
  for (const id of bloqueesParMission.keys()) identifiants.add(id);

  const missions = [...identifiants].sort().map((id) => ({
    id,
    embarquee: cles.has(cleEmbarquement(id)),
    persistanceAccordee: cles.has(clePersistance(id)),
    operationsEnAttente: enAttenteParMission.get(id) ?? 0,
    operationsBloquees: bloqueesParMission.get(id) ?? 0,
  }));

  return {
    missions,
    missionsEmbarquees: missions.filter((mission) => mission.embarquee).length,
    operationsEnAttente: [...enAttenteParMission.values()].reduce((a, b) => a + b, 0),
    operationsBloquees: [...bloqueesParMission.values()].reduce((a, b) => a + b, 0),
    sessionsEnCours: await base.interviews.where('status').equals('en_cours').count(),
  };
}

const CAPACITES_HORS_LIGNE = [
  'Mener un entretien et enregistrer chaque réponse',
  'Prendre des notes, des notes volantes et des photos',
  'Retrouver n’importe quelle question du questionnaire figé',
];

/** 05 §31-3, presque mot pour mot : rassurer AVANT de demander quoi que ce soit. */
const MESSAGE_RECONNEXION =
  'Reconnexion requise pour synchroniser — vos données sont en sécurité sur cet appareil. ' +
  'La collecte continue normalement hors ligne ; seule la remontée vers le siège attend une reconnexion.';

/**
 * Un jeton présent mais indéchiffrable n'est PAS une simple déconnexion : c'est le
 * signe que le chiffrement local a mal tourné, et ce même chiffrement protège les
 * réponses d'audit. On le dit, au lieu de proposer de se reconnecter.
 */
const MESSAGE_JETON_ILLISIBLE =
  'Le jeton de connexion enregistré sur cet appareil est illisible. Vos données de collecte ne sont pas perdues et rien n’a été supprimé, ' +
  'mais signalez-le avant de continuer : exportez une sauvegarde de secours, puis reconnectez-vous.';

export function EcranAccueil(): ReactNode {
  const { base, jetonSiege, rafraichirStockage, naviguer } = useTerrain();
  const [embarquement, setEmbarquement] = useState<ResultatEmbarquement | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [etatsSync, setEtatsSync] = useState<readonly EtatSyncMission[]>([]);

  // R-L5a-7 : une lecture locale qui échoue produit un ÉTAT, pas une exception
  // qui emporte l'arbre. `useLiveQuery` propage le rejet au rendu ; on le capte
  // ici, au plus près, là où on sait quoi en dire.
  // Sans troisième argument, `useLiveQuery` rend `undefined` tant que la requête
  // n'a pas répondu — c'est exactement l'état « chargement » du 03 §33.2, et il
  // n'a pas besoin d'une valeur par défaut qui le déguiserait en résultat vide.
  const lecture: LectureSocle | undefined = useLiveQuery(async (): Promise<
    LectureSocle | undefined
  > => {
    if (base === null) return undefined;
    try {
      return { ok: true, resume: await lireResume(base) };
    } catch {
      return { ok: false };
    }
  }, [base]);

  const resume = lecture?.ok === true ? lecture.resume : null;

  // R-L5a-8 : le port est LA source de l'état de sync et de l'alerte de
  // l'invariant 8. On lui donne les comptes réels, il rend le verdict.
  useEffect(() => {
    if (resume === null) return;
    setEtatsSync(
      resume.missions.map((mission) => {
        portSyncInerte.rafraichirEtat(
          mission.id,
          mission.operationsEnAttente,
          mission.operationsBloquees,
        );
        return portSyncInerte.etat(mission.id);
      }),
    );
  }, [resume]);

  const alertes = [
    ...new Set(
      etatsSync
        .map((etat) => etat.alerte.message)
        .filter((message): message is string => message !== null),
    ),
  ];

  const embarquer = useCallback(
    (missionId: string): void => {
      if (base === null) return;
      setEnCours(missionId);
      void embarquerMission(base, missionId)
        .then(async (resultat) => {
          setEmbarquement(resultat);
          // La demande de persistance a pu changer l'état du stockage : l'écran
          // dédié doit le refléter sans attendre un rechargement.
          await rafraichirStockage();
          // B3 — le refus ne s'affiche pas, il CONDUIT. 05 §31-2 : « l'écran guide
          // l'utilisateur (installation sur l'écran d'accueil / libération
          // d'espace) ». Sans cette ligne, l'écran de guidage n'était atteignable
          // par aucun chemin de production.
          if (resultat.statut === 'refuse' && resultat.persistance !== 'accordee') {
            naviguer({ type: 'aller', vue: 'stockage' });
          }
        })
        .finally(() => {
          setEnCours(null);
        });
    },
    [base, naviguer, rafraichirStockage],
  );

  const etat: EtatZone =
    lecture === undefined
      ? { nature: 'chargement', libelle: 'Lecture des données de cet appareil', lignes: 3 }
      : !lecture.ok
        ? {
            nature: 'erreur',
            titre: 'Les données locales n’ont pas pu être lues',
            cause: 'Le stockage local de cet appareil n’a pas répondu.',
            action:
              'Rechargez la page. Si le problème persiste, exportez une sauvegarde de secours avant de poursuivre la collecte — rien n’a été supprimé.',
          }
        : lecture.resume.missions.length === 0
          ? {
              nature: 'vide',
              titre: 'Aucune mission sur cet appareil',
              description:
                'Le téléchargement d’une mission arrive avec la synchronisation. Le stockage de cet appareil, lui, peut déjà être préparé.',
            }
          : { nature: 'nominal' };

  return (
    <section className="axn-pile">
      <h1>Aujourd’hui</h1>

      <div className="axn-coquille__indicateurs">
        <PastilleSync
          etat={(resume?.operationsEnAttente ?? 0) > 0 ? 'en-attente' : 'hors-ligne'}
          {...(resume === null ? {} : { enAttente: resume.operationsEnAttente })}
        />
      </div>

      {(jetonSiege === 'absent' || jetonSiege === 'expire') && (
        <Message ton="info" titre="Connexion au siège">
          {MESSAGE_RECONNEXION}
        </Message>
      )}

      {jetonSiege === 'illisible' && (
        <Message ton="alerte" titre="Jeton de connexion illisible">
          {MESSAGE_JETON_ILLISIBLE}
        </Message>
      )}

      {alertes.map((message) => (
        <Message key={message} ton="avertissement" titre="Sauvegarde des données de collecte">
          {message}
        </Message>
      ))}

      {resume !== null && resume.operationsBloquees > 0 && (
        <Message ton="alerte" titre="Éléments à examiner">
          {resume.operationsBloquees} élément(s) de collecte n’ont pas pu être remontés et attendent
          une décision. Rien n’a été supprimé.
        </Message>
      )}

      {embarquement?.statut === 'refuse' && (
        <Message ton="avertissement" titre="Mission non embarquée">
          {embarquement.guidage}
        </Message>
      )}

      {embarquement?.statut === 'embarquee' && (
        <Message ton="succes" titre="Mission embarquée">
          Cet appareil conserve désormais les données de cette mission hors ligne.
        </Message>
      )}

      <ZoneEtat etat={etat}>
        <ul className="axn-pile">
          {(resume?.missions ?? []).map((mission) => (
            <li key={mission.id} className="axn-coquille__indicateurs">
              <span>
                {mission.embarquee
                  ? 'Données présentes sur cet appareil'
                  : mission.persistanceAccordee
                    ? 'Stockage prêt — données pas encore téléchargées'
                    : 'Stockage non préparé'}
              </span>
              {!mission.embarquee && (
                <Bouton
                  variante="secondaire"
                  chargement={enCours === mission.id}
                  onClick={() => {
                    embarquer(mission.id);
                  }}
                >
                  {mission.persistanceAccordee ? 'Réessayer' : 'Préparer cet appareil'}
                </Bouton>
              )}
            </li>
          ))}
        </ul>
        <p>
          {resume?.missionsEmbarquees ?? 0} mission(s) avec des données ·{' '}
          {resume?.sessionsEnCours ?? 0} session(s) en cours sur cet appareil.
        </p>
      </ZoneEtat>

      <AccesEntretien />

      <Message ton="info" titre="Ce que cet appareil sait faire sans réseau">
        <ul>
          {CAPACITES_HORS_LIGNE.map((capacite) => (
            <li key={capacite}>{capacite}</li>
          ))}
        </ul>
      </Message>
    </section>
  );
}
