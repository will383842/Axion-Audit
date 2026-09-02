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
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Bouton, Message } from '@axion/ui';
import { useTerrain } from './contexte.js';

const AIDE_HORS_LIGNE =
  'Votre mot de passe déverrouille les données de cet appareil, sans réseau. ' +
  'Si la connexion au siège a expiré, la collecte continue : seule la synchronisation attendra une reconnexion.';

export function EcranDeverrouillage(): ReactNode {
  const { ouvrir, premierUsage } = useTerrain();
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const identifiant = useId();

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours) return;
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
          setEnCours(false);
        });
    },
    [enCours, motDePasse, ouvrir],
  );

  return (
    <main className="axn-pile axn-pile--large" aria-labelledby={`${identifiant}-titre`}>
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
            {AIDE_HORS_LIGNE}
          </p>
        </div>

        {erreur !== null && (
          <Message ton="alerte" titre="Déverrouillage impossible" role="alert">
            {erreur}
          </Message>
        )}

        <Bouton type="submit" pleineLargeur taille="large" chargement={enCours}>
          {premierUsage ? 'Créer la protection de cet appareil' : 'Déverrouiller'}
        </Bouton>
      </form>
    </main>
  );
}
