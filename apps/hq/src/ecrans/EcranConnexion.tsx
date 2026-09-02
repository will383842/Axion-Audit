// =============================================================================
// ÉCRAN DE CONNEXION — la porte de la console, côté client. Lot L7a.
//
// S'affiche dès qu'une requête reçoit un 401 : il n'y a pas de session. Il poste
// `loginRequestSchema` sur `POST /v1/auth/login` (05 §8.1) avec l'en-tête qui
// identifie la console (`api/auth.ts`), puis **oublie la réponse** — le contrat
// actuel rend des jetons Bearer pour la PWA ; la console n'en stocke aucun. La
// session de la console, ce sera le cookie httpOnly que le serveur déposera
// (fiche A-006, chantier C1). Jusque-là, une connexion « réussie » ici peut être
// suivie d'un nouveau 401 : l'écran le dit en français, sans mentir.
//
// Le champ mot de passe compose directement les classes du design system, comme
// `EcranDeverrouillage` du terrain : `ChampTexte` ne connaît que des natures de
// DONNÉE, aucune n'est un secret, et `packages/ui` est figé (fiche étage 1 à
// ouvrir : nature `secret`). Aucune couleur ni taille en dur, aucun jeton nouveau.
//
// Traçabilité : E33 (sécurité / RGPD), E43 (exécutabilité autopilote —
// conventions d'API).
// =============================================================================
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Bouton, ChampTexte, EtatErreur } from '@axion/ui';
import { ErreurApi, ErreurReseau } from '../api/client.js';
import { loginRequestSchema, loginResponseSchema } from '../api/contrats.js';
import { useClientApi } from '../api/requetes.js';

interface ProprietesEcranConnexion {
  /** Appelé après un `login` accepté : la coquille relance les requêtes. */
  onConnecte: () => void;
  /** `true` si un `login` a déjà réussi et que le serveur a QUAND MÊME rendu 401. */
  sessionNonEtablie: boolean;
}

export function EcranConnexion({
  onConnecte,
  sessionNonEtablie,
}: ProprietesEcranConnexion): ReactNode {
  const client = useClientApi();
  const idTitre = useId();
  const idMotDePasse = `${idTitre}-mdp`;
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Pas de « détail technique » ici : sur un écran de connexion, un code d'erreur
  // renseigne un attaquant autant qu'un utilisateur, et le message français suffit.
  const [refus, setRefus] = useState<{ cause: string; action: string } | null>(null);

  async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    setEnCours(true);
    setRefus(null);
    try {
      await client.ecrire(
        '/auth/login',
        loginRequestSchema,
        { email, password: motDePasse },
        loginResponseSchema,
      );
      // La réponse n'est PAS conservée : voir l'en-tête de ce fichier.
      setMotDePasse('');
      onConnecte();
    } catch (erreur) {
      if (erreur instanceof ErreurApi) {
        setRefus({
          cause: erreur.message,
          action:
            erreur.statut === 401
              ? 'Vérifiez l’adresse e-mail et le mot de passe, puis réessayez.'
              : 'Réessayez. Si le problème persiste, signalez-le à l’équipe technique.',
        });
      } else if (erreur instanceof ErreurReseau) {
        setRefus({
          cause: 'Le serveur est injoignable.',
          action: 'Vérifiez le réseau du poste, puis réessayez.',
        });
      } else {
        setRefus({
          cause: 'La connexion a échoué pour une raison inattendue.',
          action: 'Rechargez la page, puis réessayez.',
        });
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="axn-pile axn-pile--etroite" aria-labelledby={idTitre}>
      <h1 id={idTitre}>Connexion à la console</h1>
      <p>Réservée aux administrateurs. Les auditeurs travaillent depuis l’application terrain.</p>
      {sessionNonEtablie && (
        <EtatErreur
          titre="Session non ouverte"
          cause="Vos identifiants ont été acceptés, mais le serveur n’a pas ouvert de session pour la console."
          action="L’authentification par cookie de la console n’est pas encore activée côté serveur. Signalez-le à l’équipe technique."
        />
      )}
      {refus !== null && (
        <EtatErreur titre="Connexion refusée" cause={refus.cause} action={refus.action} />
      )}
      <form onSubmit={(evenement) => void soumettre(evenement)}>
        <ChampTexte
          libelle="Adresse e-mail"
          nature="courriel"
          name="email"
          autoComplete="username"
          obligatoire
          value={email}
          onChange={(evenement) => {
            setEmail(evenement.currentTarget.value);
          }}
        />
        <div className="axn-champ">
          <label className="axn-champ__libelle" htmlFor={idMotDePasse}>
            Mot de passe
            <span className="axn-champ__obligatoire" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={idMotDePasse}
            className="axn-champ__saisie"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            data-saisie-libre="vrai"
            value={motDePasse}
            onChange={(evenement) => {
              setMotDePasse(evenement.currentTarget.value);
            }}
          />
        </div>
        <Bouton type="submit" chargement={enCours}>
          Se connecter
        </Bouton>
      </form>
    </section>
  );
}
