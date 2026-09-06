// =============================================================================
// ÉCRAN DE DÉVERROUILLAGE — 05 §9.7, 05 §31-3
//
// ── LE POINT QUE CET ÉCRAN DOIT DIRE, ET QUE PERSONNE D'AUTRE NE DIRA ───────
// 05 §31-3 : « si le refresh token expire pendant une longue période hors ligne,
// le déverrouillage local continue de fonctionner, la collecte se poursuit sans
// interruption ; seule la SYNCHRONISATION attend une reconnexion. Message clair à
// l'auditeur (“reconnexion requise pour synchroniser — vos données sont en
// sécurité sur l'appareil”). » Un auditeur qui croit avoir perdu sa journée parce
// qu'un écran lui parle de session expirée fera n'importe quoi pour la récupérer.
//
// ── LE CHAMP DE MOT DE PASSE ────────────────────────────────────────────────
// `ChampTexte` de `packages/ui` retire délibérément `type` de ses propriétés (six
// natures de DONNÉE, aucune n'est un secret). L'écran compose donc directement
// les classes du design system — aucune couleur ni taille en dur (invariant 4),
// aucun jeton nouveau : ce sont les mêmes règles CSS que tous les autres champs.
//
// Les quatre états (03 §33.2) : le chargement est porté par la coquille, l'erreur
// est ci-dessous, il n'y a pas d'état vide (l'écran EST le contenu) et le hors
// ligne est le mode NOMINAL — d'où la mention explicite plutôt qu'une pastille.
//
// ── B1 (recette novice A54, 2026-09-06) : NE JAMAIS DIAGNOSTIQUER À VIDE ─────
// Le bouton tapé champ vide, au PREMIER usage, répondait « Déverrouillage
// impossible / Mot de passe incorrect » — sur l'écran qui CRÉE le mot de passe.
// Le novice cherchait un mot de passe qui n'existe pas, et appelait le siège.
// La cause est structurelle : le message venait de `deriverKek`, qui refuse une
// chaîne vide — et qui a raison de la refuser ; la crypto n'est pas touchée. Un
// refus de crypto n'est pas une phrase d'accueil.
//
// L'écran valide donc AVANT d'appeler le coffre, et chaque message est écrit
// pour la situation où il paraît : on dit CE QUI EST ATTENDU quand rien n'a été
// saisi, et on ne parle de « mot de passe incorrect » que lorsqu'un mot de passe
// a réellement été présenté à un coffre existant.
//
// Le bouton reste ACTIF et répond : un bouton grisé muet est le « cadenas muet »
// que 03 §19.1 interdit — le défaut jumeau (M1) du même parcours.
//
// ── M5 : LA CONFIRMATION, AU PREMIER USAGE SEULEMENT ────────────────────────
// L'écran annonce lui-même que le mot de passe « ne peut pas être récupéré ».
// Une faute de frappe sur un clavier virtuel d'iPad rendait donc l'appareil
// définitivement illisible, sans aucun filet. La confirmation n'existe qu'au
// premier usage : à la reprise, le coffre est le juge, et une seconde saisie ne
// protégerait de rien. Aucune règle de LONGUEUR n'est inventée — le pack n'en
// pose aucune, et un minimum improvisé serait une politique de sécurité écrite
// par un écran (11 §8).
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Bouton, Message } from '@axion/ui';
import { useTerrain } from './contexte.js';

const AIDE_HORS_LIGNE =
  'Votre mot de passe déverrouille les données de cet appareil, sans réseau. ' +
  'Si la connexion au siège a expiré, la collecte continue : seule la synchronisation attendra une reconnexion.';

/** Au premier usage, la saisie CRÉE : l'aide dit ce qu'on attend, pas ce qui manque. */
const AIDE_PREMIER_USAGE =
  'Choisissez un mot de passe et retenez-le : il sera demandé à chaque reprise, il n’est envoyé nulle part et ' +
  'il ne peut pas être récupéré. Saisissez-le deux fois pour écarter une faute de frappe.';

/** B1 — ce que l'écran répond quand le champ est vide. Jamais un diagnostic. */
const ATTENDU_PREMIER_USAGE = 'Saisissez un mot de passe pour protéger cet appareil.';
const ATTENDU_REPRISE = 'Saisissez votre mot de passe pour déverrouiller la collecte.';
const CONFIRMATION_ATTENDUE = 'Saisissez le mot de passe une seconde fois pour le confirmer.';
const CONFIRMATION_DIFFERENTE =
  'Les deux saisies sont différentes. Retapez le même mot de passe dans les deux champs : ' +
  'sans lui, les données de cet appareil resteraient illisibles.';

export function EcranDeverrouillage(): ReactNode {
  const { ouvrir, premierUsage } = useTerrain();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const identifiant = useId();

  // B1 — le titre de l'encart suit la situation. « Déverrouillage impossible »
  // sur un écran de création est un contresens : c'est celui qu'a lu A54.
  const titreErreur = premierUsage ? 'Protection non créée' : 'Déverrouillage impossible';

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours) return;

      // ── B1 : ce que l'écran sait AVANT d'appeler le coffre ────────────────
      // Aucune de ces trois réponses n'est un diagnostic : elles disent ce qui
      // est attendu. Le coffre n'est appelé que si la saisie a un sens.
      if (motDePasse === '') {
        setErreur(premierUsage ? ATTENDU_PREMIER_USAGE : ATTENDU_REPRISE);
        return;
      }
      if (premierUsage && confirmation === '') {
        setErreur(CONFIRMATION_ATTENDUE);
        return;
      }
      if (premierUsage && confirmation !== motDePasse) {
        setErreur(CONFIRMATION_DIFFERENTE);
        return;
      }

      setEnCours(true);
      setErreur(null);
      void ouvrir(motDePasse)
        .catch((cause: unknown) => {
          // Le message vient de l'erreur métier (`coffre.ts`), en français et sans
          // trace technique : 03 §17.6, « aucune erreur technique brute n'atteint
          // l'écran ». Aucun mot de passe n'est journalisé, ici ni ailleurs.
          setErreur(
            cause instanceof Error
              ? cause.message
              : 'Le déverrouillage a échoué. Réessayez ; aucune donnée locale n’a été modifiée.',
          );
        })
        .finally(() => {
          setMotDePasse('');
          setConfirmation('');
          setEnCours(false);
        });
    },
    [confirmation, enCours, motDePasse, ouvrir, premierUsage],
  );

  return (
    <section className="axn-pile axn-pile--large" aria-labelledby={`${identifiant}-titre`}>
      <h1 id={`${identifiant}-titre`}>
        {premierUsage ? 'Préparer cet appareil' : 'Déverrouiller la collecte'}
      </h1>

      {premierUsage && (
        <Message ton="info" titre="Première utilisation de cet appareil">
          Votre mot de passe protège les données d’audit stockées ici. Il n’est envoyé nulle part et
          ne peut pas être récupéré : sans lui, les données de cet appareil resteront illisibles.
        </Message>
      )}

      <form onSubmit={soumettre} noValidate>
        <div className="axn-champ">
          <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp`}>
            Mot de passe
            <span className="axn-champ__obligatoire" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={`${identifiant}-mdp`}
            className="axn-champ__saisie"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            data-saisie-libre="vrai"
            aria-invalid={erreur !== null}
            aria-describedby={`${identifiant}-aide`}
            value={motDePasse}
            onChange={(evenement) => {
              setMotDePasse(evenement.target.value);
            }}
          />
          <p id={`${identifiant}-aide`} className="axn-champ__aide">
            {premierUsage ? AIDE_PREMIER_USAGE : AIDE_HORS_LIGNE}
          </p>
        </div>

        {premierUsage && (
          <div className="axn-champ">
            <label className="axn-champ__libelle" htmlFor={`${identifiant}-confirmation`}>
              Confirmer le mot de passe
              <span className="axn-champ__obligatoire" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id={`${identifiant}-confirmation`}
              className="axn-champ__saisie"
              type="password"
              autoComplete="new-password"
              required
              data-saisie-libre="vrai"
              aria-invalid={erreur !== null}
              value={confirmation}
              onChange={(evenement) => {
                setConfirmation(evenement.target.value);
              }}
            />
          </div>
        )}

        {erreur !== null && (
          <Message ton="alerte" titre={titreErreur} role="alert">
            {erreur}
          </Message>
        )}

        <Bouton type="submit" pleineLargeur taille="large" chargement={enCours}>
          {premierUsage ? 'Créer la protection de cet appareil' : 'Déverrouiller'}
        </Bouton>
      </form>
    </section>
  );
}
