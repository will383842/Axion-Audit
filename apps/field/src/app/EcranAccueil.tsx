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
// vide (aucune mission sur l'appareil), chargement (squelettes aux dimensions
// finales via `ZoneEtat`), erreur (portée par la coquille) et hors ligne — qui est
// le mode NOMINAL de cette application (invariant 1) et se dit donc comme une
// capacité, pas comme une panne.
//
// ── LA PASTILLE NE VERDIT PAS ───────────────────────────────────────────────
// `LOT_L5.md` §3.6 : le port de sync est INERTE tant que L6a n'a pas livré, et
// « une pastille qui verdit sans serveur, c'est exactement le garde-fou qui
// annonce plus qu'il ne fait ». Elle affiche donc « en attente », avec le compte
// RÉEL des opérations locales, lu sur la file.
//
// ── L'EMBARQUEMENT EST APPELÉ POUR DE VRAI, ET IL REFUSE ────────────────────
// Le bouton appelle `embarquerMission` : la persistance du stockage (05 §31-2) est
// réellement demandée, puis le premier pull REFUSE avec son motif documenté
// (`premier_pull_indisponible`, dépendance L3d). L'écran affiche ce refus tel
// quel. Un bouton qui prétendrait embarquer produirait une mission vide sur la
// tablette, et l'auditeur ne s'en apercevrait que chez le client.
//
// Traçabilité : E38 (sauvegarde terrain : sync + export), E26 (alertes actives sur
// les manques).
// =============================================================================
import { useCallback, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message, PastilleSync, ZoneEtat, type EtatZone } from '@axion/ui';
import { cleEmbarquement, CLES_META, type BaseLocale } from '../local/base.js';
import { embarquerMission, type ResultatEmbarquement } from '../local/embarquement.js';
import { evaluerAlerteSauvegarde } from '../local/port-sync.js';
import { useTerrain } from './contexte.js';
import { AccesEntretien } from '../ecrans/entretien/AccesEntretien.js'; // raccordement L5b (A22)

/** Une mission présente localement, et si elle est embarquée (05 §31-2). */
interface MissionLocale {
  readonly id: string;
  readonly embarquee: boolean;
}

interface ResumeSocle {
  readonly missions: readonly MissionLocale[];
  readonly missionsEmbarquees: number;
  readonly operationsEnAttente: number;
  readonly operationsBloquees: number;
  readonly sessionsEnCours: number;
}

/**
 * Lecture d'INDEX uniquement : identifiants, statuts et compteurs. Aucun
 * déchiffrement, donc aucun titre de mission ici — `missions.titre` vit dans la
 * charge chiffrée (`LOT_L5.md` §3.2, liste fermée). Afficher le libellé est le
 * travail du cockpit L5c, qui passe par le dépôt.
 */
async function lireResume(base: BaseLocale): Promise<ResumeSocle> {
  const marques = new Set(
    (await base.meta.where('cle').startsWith(CLES_META.prefixeEmbarquement).toArray()).map(
      (ligne) => ligne.cle,
    ),
  );
  const missions = (await base.missions.toArray()).map((ligne) => ({
    id: ligne.id,
    embarquee: marques.has(cleEmbarquement(ligne.id)),
  }));
  const operationsEnAttente = await base.outbox.where('statut').equals('en_attente').count();
  const total = await base.outbox.count();
  const sessionsEnCours = await base.interviews.where('status').equals('en_cours').count();
  return {
    missions,
    missionsEmbarquees: marques.size,
    operationsEnAttente,
    operationsBloquees: total - operationsEnAttente,
    sessionsEnCours,
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
  const { base, jetonSiege, rafraichirStockage } = useTerrain();
  const [embarquement, setEmbarquement] = useState<ResultatEmbarquement | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const resume = useLiveQuery(
    async () => (base === null ? null : lireResume(base)),
    [base],
    undefined,
  );

  const embarquer = useCallback(
    (missionId: string): void => {
      if (base === null) return;
      setEnCours(missionId);
      void embarquerMission(base, missionId)
        .then(async (resultat) => {
          setEmbarquement(resultat);
          // La demande de persistance a pu changer l'état du stockage : l'en-tête
          // et l'écran dédié doivent le refléter sans attendre un rechargement.
          await rafraichirStockage();
        })
        .finally(() => {
          setEnCours(null);
        });
    },
    [base, rafraichirStockage],
  );

  const etat: EtatZone =
    resume === undefined
      ? { nature: 'chargement', libelle: 'Lecture des données de cet appareil', lignes: 3 }
      : resume === null || resume.missions.length === 0
        ? {
            nature: 'vide',
            titre: 'Aucune mission sur cet appareil',
            description:
              'Le téléchargement d’une mission n’est pas encore disponible dans cette version : le questionnaire doit d’abord être figé côté siège. Le stockage de cet appareil, lui, est déjà préparé.',
          }
        : { nature: 'nominal' };

  const alerte = evaluerAlerteSauvegarde(null, resume?.operationsEnAttente ?? null);

  return (
    <section className="axn-pile">
      <h1>Aujourd’hui</h1>

      <div className="axn-coquille__indicateurs">
        <PastilleSync
          etat={(resume?.operationsEnAttente ?? 0) > 0 ? 'en-attente' : 'hors-ligne'}
          {...(resume === undefined || resume === null
            ? {}
            : { enAttente: resume.operationsEnAttente })}
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

      {alerte.message !== null && (
        <Message ton="avertissement" titre="Sauvegarde des données de collecte">
          {alerte.message}
        </Message>
      )}

      {resume !== undefined && resume !== null && resume.operationsBloquees > 0 && (
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
              <span>{mission.embarquee ? 'Mission embarquée' : 'Mission non embarquée'}</span>
              {!mission.embarquee && (
                <Bouton
                  variante="secondaire"
                  chargement={enCours === mission.id}
                  onClick={() => {
                    embarquer(mission.id);
                  }}
                >
                  Embarquer sur cet appareil
                </Bouton>
              )}
            </li>
          ))}
        </ul>
        <p>
          {resume?.missionsEmbarquees ?? 0} mission(s) embarquée(s) · {resume?.sessionsEnCours ?? 0}{' '}
          session(s) en cours sur cet appareil.
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
