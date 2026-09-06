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
// ── L'ÉTAT D'ERREUR A DEUX FORMES, ET C'EST DÉLIBÉRÉ (revue A29, R3) ────────
// Une erreur ORDINAIRE (mot de passe faux, mot de passe trop court) laisse le
// formulaire vivant : on se trompe de touche, on recommence. Une ANOMALIE DE
// COFFRE, elle, retire le formulaire — bouton compris. La raison n'est pas de
// style : sur cette famille-là, l'écran affichait « Ne créez PAS de protection
// sur cet appareil » juste au-dessus d'un bouton actif « Créer la protection de
// cet appareil ». 03 §33.2 demande un état d'erreur COHÉRENT ; ici, le message
// le plus cliquable était celui qui détruit la journée de collecte.
//
// ── LA POLITIQUE DE MOT DE PASSE EST DITE AVANT D'ÊTRE OPPOSÉE (A51, F-23) ──
// Le coffre la GARANTIT (`verifierPolitiqueMotDePasse`) ; l'écran, lui, doit la
// dire — au moment du choix, pas après un refus. Un auditeur qui découvre une
// règle en la violant a déjà perdu confiance dans l'outil. Elle n'est annoncée et
// opposée qu'au PREMIER usage : au déverrouillage d'un coffre existant, refuser
// un mot de passe court n'ajouterait aucune sécurité et interdirait l'accès à des
// données déjà chiffrées.
//
// ── B1 (recette novice A54, 2026-09-06) : NE JAMAIS DIAGNOSTIQUER À VIDE ─────
// Le bouton tapé champ vide répondait « Déverrouillage impossible / Mot de passe
// incorrect » — sur l'écran qui CRÉE le mot de passe. Le novice cherchait un mot
// de passe qui n'existe pas, et appelait le siège. La cause est structurelle : le
// message venait de `deriverKek`, qui refuse une chaîne vide — et qui a raison de
// la refuser ; la crypto n'est pas touchée. Un refus de crypto n'est simplement
// pas une phrase d'accueil.
//
// L'écran valide donc AVANT d'appeler le coffre, et dit CE QUI EST ATTENDU.
// « Mot de passe incorrect » n'est plus prononcé que lorsqu'un mot de passe a
// réellement été présenté à un coffre existant.
//
// **Les quatre gardes sont ORDONNÉES, et l'ordre est un choix** : champ vide,
// puis LONGUEUR, puis confirmation. La longueur passe avant la confirmation parce
// qu'elle est plus actionnable — on ne fait pas retaper deux fois, debout chez un
// client, un mot de passe que la politique refusera de toute façon.
//
// Le bouton reste ACTIF et répond : un bouton grisé muet est le « cadenas muet »
// que 03 §19.1 interdit.
//
// ── M5 : LA CONFIRMATION, AU PREMIER USAGE SEULEMENT ────────────────────────
// L'écran annonce lui-même que le mot de passe « ne peut pas être récupéré ». Une
// faute de frappe sur un clavier virtuel d'iPad rendait donc l'appareil
// définitivement illisible, sans aucun filet. La confirmation n'existe qu'au
// premier usage : à la reprise, le coffre est le juge, et une seconde saisie ne
// protégerait de rien. La LONGUEUR, elle, n'est pas inventée par cet écran : elle
// vient de `MOT_DE_PASSE_LONGUEUR_MIN` (`packages/shared`) — une politique de
// sécurité ne s'écrit pas dans un composant (11 §8).
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Bouton, Message, RappelHorsLigne } from '@axion/ui';
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@axion/shared';
import { AnomalieCoffreError, MotDePasseTropCourtError } from '../local/coffre.js';
import { useEnLigne } from '../session/media.js';
import { CAPACITES_HORS_LIGNE } from './capacites-hors-ligne.js';
import { useTerrain } from './contexte.js';

const AIDE_HORS_LIGNE =
  'Votre mot de passe déverrouille les données de cet appareil, sans réseau. ' +
  'Si la connexion au siège a expiré, la collecte continue : seule la synchronisation attendra une reconnexion.';

// Au premier usage, la même aide dirait faux : le mot de passe ne DÉVERROUILLE
// rien encore, il crée la protection. La mention hors ligne (05 §31-3), elle,
// reste due dans les deux cas — c'est le quatrième état de cet écran.
const AIDE_PREMIER_USAGE =
  `Choisissez un mot de passe d’au moins ${String(MOT_DE_PASSE_LONGUEUR_MIN)} caractères : il chiffrera les données de cet appareil. ` +
  'Saisissez-le deux fois pour écarter une faute de frappe. ' +
  'La collecte fonctionnera ensuite sans réseau ; seule la synchronisation attendra une reconnexion.';

/** B1 — ce que l'écran répond quand le champ est vide. Jamais un diagnostic. */
const ATTENDU_PREMIER_USAGE = 'Saisissez un mot de passe pour protéger cet appareil.';
const ATTENDU_REPRISE = 'Saisissez votre mot de passe pour déverrouiller la collecte.';
const CONFIRMATION_ATTENDUE = 'Saisissez le mot de passe une seconde fois pour le confirmer.';
const CONFIRMATION_DIFFERENTE =
  'Les deux saisies sont différentes. Retapez le même mot de passe dans les deux champs : ' +
  'sans lui, les données de cet appareil resteraient illisibles.';

/** Ce que l'écran affiche d'une erreur : une cause, et l'action qui va avec (03 §17.6). */
interface ErreurAffichee {
  readonly cause: string;
  readonly action: string | null;
  /**
   * Anomalie du coffre — c'est-à-dire : il n'y a RIEN à réessayer ici.
   *
   * Ce n'est pas un détail d'affichage. Sur cette famille d'erreurs, et sur elle
   * seule, le geste que l'écran doit empêcher est celui que l'écran propose : le
   * formulaire et son bouton disparaissent, il ne reste que la cause et l'action
   * (revue A29 du 2026-09-05, R3).
   */
  readonly anomalie: boolean;
}

/**
 * Une réponse de VALIDATION : une cause, aucune action, et surtout aucune
 * anomalie — la saisie reste, le formulaire vit, et le coffre n'a pas été touché.
 */
function attendu(cause: string): ErreurAffichee {
  return { cause, action: null, anomalie: false };
}

/**
 * Traduit une erreur en cause + action, sans jamais inventer ni technique brute.
 *
 * Les anomalies de coffre (A51 F-22/F-25) portent leur propre action, et elle
 * compte plus que la cause : « ne créez PAS de nouvelle protection ». La perdre en
 * route reviendrait à laisser l'auditeur devant un écran qui dit que rien ne
 * marche, sans lui dire ce qui détruirait ses données.
 *
 * La branche `Error` ci-dessous n'affiche QUE des messages métier de `coffre.ts`,
 * tous écrits en français, et c'est `local/coffre-appareil.ts` qui le garantit en
 * enveloppant au plus près toute panne technique du chiffrement (revue A29, R1).
 * Sans ce filet, un `DataError: Invalid key length` de WebCrypto s'afficherait ici
 * tel quel — en anglais, sans action, et surtout sans le « ne créez PAS ».
 */
function traduire(cause: unknown): ErreurAffichee {
  if (cause instanceof AnomalieCoffreError) {
    return { cause: cause.message, action: cause.action, anomalie: true };
  }
  // Le message vient de l'erreur métier (`coffre.ts`), en français et sans trace
  // technique : 03 §17.6, « aucune erreur technique brute n'atteint l'écran ».
  // Aucun mot de passe n'est journalisé, ici ni ailleurs.
  if (cause instanceof Error) {
    return { cause: cause.message, action: null, anomalie: false };
  }
  return {
    cause: 'Le déverrouillage a échoué.',
    action: 'Réessayez ; aucune donnée locale n’a été modifiée.',
    anomalie: false,
  };
}

export function EcranDeverrouillage(): ReactNode {
  const { ouvrir, premierUsage } = useTerrain();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<ErreurAffichee | null>(null);
  const [enCours, setEnCours] = useState(false);
  const identifiant = useId();
  const enLigne = useEnLigne();

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours) return;

      // ── B1 : ce que l'écran sait AVANT d'appeler le coffre ────────────────
      // Aucune de ces réponses n'est un diagnostic : elles disent ce qui est
      // attendu. Aucune n'efface la saisie — l'auditeur complète plutôt qu'il ne
      // retape. Le coffre n'est appelé que si la saisie a un sens.
      if (motDePasse === '') {
        setErreur(attendu(premierUsage ? ATTENDU_PREMIER_USAGE : ATTENDU_REPRISE));
        return;
      }
      // La politique n'est opposée qu'au moment du CHOIX (premier usage). Le
      // coffre refusera de toute façon : cette garde-ci est le message, pas la
      // garantie.
      if (premierUsage && motDePasse.length < MOT_DE_PASSE_LONGUEUR_MIN) {
        setErreur(attendu(new MotDePasseTropCourtError().message));
        return;
      }
      if (premierUsage && confirmation === '') {
        setErreur(attendu(CONFIRMATION_ATTENDUE));
        return;
      }
      if (premierUsage && confirmation !== motDePasse) {
        setErreur(attendu(CONFIRMATION_DIFFERENTE));
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
          setConfirmation('');
          setEnCours(false);
        });
    },
    [confirmation, enCours, motDePasse, ouvrir, premierUsage],
  );

  // Une anomalie de coffre ferme l'écran : plus de bouton, plus de saisie, plus
  // d'invitation à « préparer » — voir `ErreurAffichee.anomalie`. La coquille met
  // par ailleurs `premierUsage` à `false` sur le même événement (`contexte.tsx`) ;
  // les deux gardes sont volontairement indépendantes, parce qu'ici la garde qui
  // manque est celle qui détruit une journée de collecte.
  const anomalie = erreur?.anomalie === true;

  return (
    <section className="axn-pile axn-pile--large" aria-labelledby={`${identifiant}-titre`}>
      <h1 id={`${identifiant}-titre`}>
        {anomalie
          ? 'Anomalie du coffre de cet appareil'
          : premierUsage
            ? 'Préparer cet appareil'
            : 'Déverrouiller la collecte'}
      </h1>

      {premierUsage && !anomalie && (
        <Message ton="info" titre="Première utilisation de cet appareil">
          Votre mot de passe protège les données d’audit stockées ici. Il n’est envoyé nulle part et
          ne peut pas être récupéré : sans lui, les données de cet appareil resteront illisibles.
          Choisissez-en un d’au moins {MOT_DE_PASSE_LONGUEUR_MIN} caractères.
        </Message>
      )}

      {anomalie && (
        <Message ton="alerte" titre="Cet appareil ne peut pas être ouvert" role="alert">
          <p>{erreur.cause}</p>
          {erreur.action !== null && <p>{erreur.action}</p>}
        </Message>
      )}

      {!anomalie && (
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
            <Message
              ton="alerte"
              titre={premierUsage ? 'Protection non créée' : 'Déverrouillage impossible'}
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
      )}

      {/*
        §33.2, seconde moitié : LE RAPPEL DES CAPACITÉS, SANS LA PASTILLE.

        Arbitrage A01 du 2026-09-04, sur délégation de Williams (voir
        `DECISIONS.md`) : cet écran vit AVANT l'ouverture du coffre, et il est le
        seul rendu hors de la coquille — celle-ci ne pose donc pas sa pastille
        ici. Une pastille y annoncerait un état de synchronisation dont
        l'auditeur ne peut RIEN faire tant qu'il n'est pas entré (03 §19.2 :
        « jamais anxiogène »). « Cet appareil fonctionne sans réseau » est, lui,
        exactement ce qu'un auditeur bloqué dehors a besoin de lire.

        `!anomalie` : sur une anomalie de coffre, « déverrouiller cet appareil »
        serait faux — et c'est le seul cas où cet écran n'a plus de capacité à
        promettre. La règle est la même que celle du formulaire, deux lignes plus
        haut (revue A29 du 2026-09-05, R3).
      */}
      {!anomalie && (
        <RappelHorsLigne
          enLigne={enLigne}
          capacites={CAPACITES_HORS_LIGNE.deverrouillage}
          introduction="Sans réseau, cet appareil reste utilisable :"
          avecPastille={false}
        />
      )}
    </section>
  );
}
