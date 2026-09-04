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
// ── LA POLITIQUE DE MOT DE PASSE EST DITE AVANT D'ÊTRE OPPOSÉE (A51, F-23) ──
// Le coffre la GARANTIT (`verifierPolitiqueMotDePasse`) ; l'écran, lui, doit la
// dire — au moment du choix, pas après un refus. Un auditeur qui découvre une
// règle en la violant a déjà perdu confiance dans l'outil. Elle n'est annoncée et
// opposée qu'au PREMIER usage : au déverrouillage d'un coffre existant, refuser
// un mot de passe court n'ajouterait aucune sécurité et interdirait l'accès à des
// données déjà chiffrées.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Bouton, Message } from '@axion/ui';
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@axion/shared';
import { AnomalieCoffreError, MotDePasseTropCourtError } from '../local/coffre.js';
import { useTerrain } from './contexte.js';

const AIDE_HORS_LIGNE =
  'Votre mot de passe déverrouille les données de cet appareil, sans réseau. ' +
  'Si la connexion au siège a expiré, la collecte continue : seule la synchronisation attendra une reconnexion.';

// Au premier usage, la même aide dirait faux : le mot de passe ne DÉVERROUILLE
// rien encore, il crée la protection. La mention hors ligne (05 §31-3), elle,
// reste due dans les deux cas — c'est le quatrième état de cet écran.
const AIDE_PREMIER_USAGE =
  `Choisissez un mot de passe d’au moins ${String(MOT_DE_PASSE_LONGUEUR_MIN)} caractères : il chiffrera les données de cet appareil. ` +
  'La collecte fonctionnera ensuite sans réseau ; seule la synchronisation attendra une reconnexion.';

/** Ce que l'écran affiche d'une erreur : une cause, et l'action qui va avec (03 §17.6). */
interface ErreurAffichee {
  readonly cause: string;
  readonly action: string | null;
}

/**
 * Traduit une erreur en cause + action, sans jamais inventer ni technique brute.
 *
 * Les anomalies de coffre (A51 F-22/F-25) portent leur propre action, et elle
 * compte plus que la cause : « ne créez PAS de nouvelle protection ». La perdre en
 * route reviendrait à laisser l'auditeur devant un écran qui dit que rien ne
 * marche, sans lui dire ce qui détruirait ses données.
 */
function traduire(cause: unknown): ErreurAffichee {
  if (cause instanceof AnomalieCoffreError) {
    return { cause: cause.message, action: cause.action };
  }
  // Le message vient de l'erreur métier (`coffre.ts`), en français et sans trace
  // technique : 03 §17.6, « aucune erreur technique brute n'atteint l'écran ».
  // Aucun mot de passe n'est journalisé, ici ni ailleurs.
  if (cause instanceof Error) {
    return { cause: cause.message, action: null };
  }
  return {
    cause: 'Le déverrouillage a échoué.',
    action: 'Réessayez ; aucune donnée locale n’a été modifiée.',
  };
}

export function EcranDeverrouillage(): ReactNode {
  const { ouvrir, premierUsage } = useTerrain();
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ErreurAffichee | null>(null);
  const [enCours, setEnCours] = useState(false);
  const identifiant = useId();

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours) return;
      // La politique n'est opposée qu'au moment du CHOIX (premier usage) — et la
      // saisie n'est pas effacée, pour que l'auditeur puisse la compléter plutôt
      // que de tout retaper. Le coffre refusera de toute façon : cette garde-ci
      // est le message, pas la garantie.
      if (premierUsage && motDePasse.length < MOT_DE_PASSE_LONGUEUR_MIN) {
        setErreur({ cause: new MotDePasseTropCourtError().message, action: null });
        return;
      }
      setEnCours(true);
      setErreur(null);
      void ouvrir(motDePasse)
        .catch((cause: unknown) => {
          setErreur(traduire(cause));
        })
        .finally(() => {
          setMotDePasse('');
          setEnCours(false);
        });
    },
    [enCours, motDePasse, ouvrir, premierUsage],
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
          Choisissez-en un d’au moins {MOT_DE_PASSE_LONGUEUR_MIN} caractères.
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
            autoComplete={premierUsage ? 'new-password' : 'current-password'}
            required
            {...(premierUsage ? { minLength: MOT_DE_PASSE_LONGUEUR_MIN } : {})}
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

        {erreur !== null && (
          <Message
            ton="alerte"
            titre={
              premierUsage ? 'Impossible de préparer cet appareil' : 'Déverrouillage impossible'
            }
            role="alert"
          >
            <p>{erreur.cause}</p>
            {erreur.action !== null && <p>{erreur.action}</p>}
          </Message>
        )}

        <Bouton type="submit" pleineLargeur taille="large" chargement={enCours}>
          {premierUsage ? 'Créer la protection de cet appareil' : 'Déverrouiller'}
        </Bouton>
      </form>
    </section>
  );
}
