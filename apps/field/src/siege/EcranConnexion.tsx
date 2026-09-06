// =============================================================================
// « RATTACHER CET APPAREIL » — le chemin de production de l'identité d'auditeur
//
// ── CE QUE CET ÉCRAN FERME ──────────────────────────────────────────────────
// L'identité de l'auditeur (05 §9.9 : propriétaire de la session) n'avait aucun
// chemin de production : `memoriserIdentiteAuditeur` n'était appelé que par des
// tests, et la recette novice s'arrêtait à `t+3 min` sur « Auditeur inconnu sur
// cet appareil ». Le message disait déjà quoi faire — « connectez-vous une fois
// au siège depuis cet appareil » — et cet écran est ce qui manquait pour le
// faire. Voir `siege/connexion.ts` pour le POURQUOI de la connexion, et
// `DECISIONS.md` du 2026-09-06 pour les options écartées.
//
// ── LES QUATRE ÉTATS (03 §33.2), ET LE CINQUIÈME CAS ────────────────────────
//   chargement  → l'identité est lue dans le coffre (squelettes, jamais un spinner)
//   erreur      → cause + action, en français, formulaire toujours vivant
//   hors ligne  → rappel des capacités locales ; ici le réseau est NÉCESSAIRE, et
//                 l'écran le dit au lieu de laisser l'auditeur deviner
//   nominal     → le formulaire
//   déjà rattaché → le formulaire DISPARAÎT (invariant 7 : on ne propose pas un
//                 geste dont le seul effet possible serait d'écraser un
//                 propriétaire de session). Il n'y a pas d'état « vide » : l'écran
//                 EST son contenu, comme le déverrouillage.
//
// ── LA LEÇON B1, APPLIQUÉE ICI AVANT D'ÊTRE REDEMANDÉE ──────────────────────
// Recette novice A54 : un écran ne DIAGNOSTIQUE jamais une erreur qui n'a pas eu
// lieu. Champ vide ⇒ l'écran dit ce qu'il attend, n'appelle ni le réseau ni le
// coffre, et n'efface pas la saisie. Le mot « incorrect » n'est prononcé que
// lorsque le siège l'a réellement dit.
//
// ── AUCUNE COULEUR NI TAILLE EN DUR (invariant 4) ───────────────────────────
// Les classes sont celles du design system, comme `EcranDeverrouillage` : le
// champ de mot de passe est composé à la main parce que `ChampTexte` retire
// délibérément `type` de ses propriétés (aucune de ses six natures n'est un
// secret). Aucun jeton nouveau n'est créé ici.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min),
// E6 (hors ligne total — ce qui suppose de dire ce qui ne l'est pas).
// =============================================================================
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message, RappelHorsLigne, Squelette } from '@axion/ui';
import { useTerrain } from '../app/contexte.js';
import { contexteLocal } from '../local/contexte.js';
import { useEnLigne } from '../session/media.js';
import { lireIdentiteAuditeur } from '../session/auditeur.js';
import {
  AutreAuditeurSurCetAppareilError,
  IdentifiantsRefusesError,
  ReponseSiegeInattendueError,
  SiegeInjoignableError,
  connecterAuSiege,
  rattacherAppareil,
} from './connexion.js';

/** Ce que l'écran répond quand un champ manque. Jamais un diagnostic (B1). */
const ATTENDU_ADRESSE = 'Saisissez l’adresse de votre compte Axion pour rattacher cet appareil.';
const ATTENDU_MOT_DE_PASSE = 'Saisissez le mot de passe de votre compte Axion.';

/** Cause + action (03 §17.6, §33.2). `action` peut manquer, jamais la cause. */
interface ErreurAffichee {
  readonly cause: string;
  readonly action: string | null;
}

function attendu(cause: string): ErreurAffichee {
  return { cause, action: null };
}

/**
 * Traduit une erreur en cause + action.
 *
 * Chaque erreur de `connexion.ts` porte SON action : celle d'un siège
 * injoignable (« rapprochez-vous d'une connexion ») n'a rien à voir avec celle
 * d'un refus (« vérifiez l'adresse »), et une action générique les vaudrait
 * toutes les deux mal. Aucune erreur technique brute n'atteint l'écran.
 */
function traduire(cause: unknown): ErreurAffichee {
  if (
    cause instanceof SiegeInjoignableError ||
    cause instanceof IdentifiantsRefusesError ||
    cause instanceof ReponseSiegeInattendueError ||
    cause instanceof AutreAuditeurSurCetAppareilError
  ) {
    return { cause: cause.message, action: cause.action };
  }
  if (cause instanceof Error) {
    return {
      cause: cause.message,
      action: 'Réessayez ; aucune donnée locale n’a été modifiée.',
    };
  }
  return {
    cause: 'Le rattachement de cet appareil a échoué.',
    action: 'Réessayez ; aucune donnée locale n’a été modifiée.',
  };
}

export function EcranConnexion(): ReactNode {
  const { base, naviguer } = useTerrain();
  const enLigne = useEnLigne();
  const identifiant = useId();

  const identite = useLiveQuery(
    async () => (base === null ? null : lireIdentiteAuditeur(base, contexteLocal().coffre)),
    [base],
    undefined,
  );

  const [courriel, setCourriel] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ErreurAffichee | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours || base === null) return;

      // B1 — ce que l'écran sait AVANT d'appeler quoi que ce soit. Aucune de ces
      // réponses n'est un diagnostic, et aucune n'efface la saisie.
      if (courriel.trim() === '') {
        setErreur(attendu(ATTENDU_ADRESSE));
        return;
      }
      if (motDePasse === '') {
        setErreur(attendu(ATTENDU_MOT_DE_PASSE));
        return;
      }

      setEnCours(true);
      setErreur(null);
      void (async () => {
        try {
          // `fetch` résolu À L'APPEL, comme dans la console : c'est ce qui rend
          // cet écran éprouvable sans serveur, à travers les vrais schémas.
          const session = await connecterAuSiege({
            fetch: (entree, init) => fetch(entree, init),
            courriel,
            motDePasse,
          });
          await rattacherAppareil(base, contexteLocal().coffre, session);
          // Le mot de passe ne survit pas au geste ; l'adresse non plus, elle
          // n'a plus d'usage. `useLiveQuery` fera basculer l'écran tout seul.
          setMotDePasse('');
          setCourriel('');
        } catch (cause: unknown) {
          setErreur(traduire(cause));
          setMotDePasse('');
        } finally {
          setEnCours(false);
        }
      })();
    },
    [base, courriel, enCours, motDePasse],
  );

  if (identite === undefined) {
    return (
      <section className="axn-pile axn-pile--large" aria-busy="true">
        <Squelette forme="titre" />
        <Squelette forme="ligne" lignes={3} />
      </section>
    );
  }

  // ── Déjà rattaché : le formulaire n'a plus de raison d'exister ─────────────
  if (identite !== null) {
    return (
      <section className="axn-pile axn-pile--large" aria-labelledby={`${identifiant}-titre`}>
        <h1 id={`${identifiant}-titre`}>Appareil rattaché</h1>
        <Message ton="succes" titre="Cet appareil est rattaché à votre compte">
          <p>
            Les entretiens ouverts ici vous appartiennent, et cela suffit à collecter hors ligne.
            Rien d’autre n’est à faire.
          </p>
          <p>
            Mode de saisie en vigueur :{' '}
            {identite.profil === 'guide_strict' ? 'guidé strict' : 'expert'}.
          </p>
        </Message>
        <Bouton
          onClick={() => {
            naviguer({ type: 'retour' });
          }}
        >
          Revenir
        </Bouton>
      </section>
    );
  }

  return (
    <section className="axn-pile axn-pile--large" aria-labelledby={`${identifiant}-titre`}>
      <h1 id={`${identifiant}-titre`}>Rattacher cet appareil</h1>

      <Message ton="info" titre="Pourquoi cette étape">
        Un entretien a toujours un propriétaire, et l’application ne l’invente pas. Rattachez cet
        appareil à votre compte une fois, en ligne : ensuite, toute la collecte se fait sans réseau.
      </Message>

      {/* L'état hors ligne : ici le réseau est NÉCESSAIRE, et le taire enverrait
          l'auditeur essayer en boucle. Le bouton reste actif — c'est la tentative
          réelle qui tranche, jamais une heuristique de navigateur (leçon B6). */}
      <RappelHorsLigne
        enLigne={enLigne}
        introduction="Cet appareil semble hors ligne. Le rattachement demande une connexion, une seule fois. Sans réseau, cet appareil sait encore :"
        capacites={[
          'ouvrir ce qui est déjà enregistré ici',
          'restaurer une sauvegarde de secours',
          'collecter, dès qu’il sera rattaché',
        ]}
      />

      <form onSubmit={soumettre} noValidate>
        <div className="axn-champ">
          <label className="axn-champ__libelle" htmlFor={`${identifiant}-courriel`}>
            Adresse de votre compte
            <span className="axn-champ__obligatoire" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={`${identifiant}-courriel`}
            className="axn-champ__saisie"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
            data-saisie-libre="vrai"
            aria-invalid={erreur !== null}
            value={courriel}
            onChange={(evenement) => {
              setCourriel(evenement.target.value);
            }}
          />
        </div>

        <div className="axn-champ">
          <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp`}>
            Mot de passe du compte
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
            data-saisie-libre="vrai"
            aria-invalid={erreur !== null}
            aria-describedby={`${identifiant}-aide`}
            value={motDePasse}
            onChange={(evenement) => {
              setMotDePasse(evenement.target.value);
            }}
          />
          <p id={`${identifiant}-aide`} className="axn-champ__aide">
            C’est le mot de passe de votre compte au siège, pas celui qui déverrouille cet appareil.
          </p>
        </div>

        {erreur !== null && (
          <Message ton="alerte" titre="Appareil non rattaché" role="alert">
            <p>{erreur.cause}</p>
            {erreur.action !== null && <p>{erreur.action}</p>}
          </Message>
        )}

        <Bouton type="submit" pleineLargeur taille="large" chargement={enCours}>
          Rattacher cet appareil
        </Bouton>
      </form>
    </section>
  );
}
