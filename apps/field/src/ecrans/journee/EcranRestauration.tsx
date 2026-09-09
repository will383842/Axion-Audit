// =============================================================================
// RESTAURATION D'UNE SAUVEGARDE DE SECOURS — 05 §9.7, 11 §4, 07 ligne L5
//
// ── LE CRITÈRE DE PORTE QUI COMMANDE CET ÉCRAN ──────────────────────────────
// 07, ligne L5 : « export de secours créé puis **restauré sur un 2ᵉ appareil** ».
// Le domaine (`sauvegarde/sauvegarde.ts`) savait restaurer et le prouvait par
// test ; sans écran, c'était indémontrable à P-C. Cet écran est l'appareil neuf :
// il s'atteint depuis l'écran d'EMBARQUEMENT (`accueil`), c'est-à-dire AVANT
// qu'une mission soit chargée — c'est là qu'un appareil de remplacement en a
// besoin, et nulle part ailleurs.
//
// ── CE QUE L'ÉCRAN DEMANDE, ET POURQUOI ─────────────────────────────────────
//   · le FICHIER `.axionbackup` — lu localement, jamais envoyé nulle part ;
//   · le MOT DE PASSE — la seule clé du fichier (11 §4 : dérivée du mot de passe,
//     pas de la DEK de cet appareil, qui n'a jamais vu ces données) ;
//   · la PERSISTANCE du stockage (05 §31-2), demandée AVANT d'écrire. Un refus
//     n'écrit rien et l'écran guide — mais il n'enferme plus : voir D-A27-1.
//
// ── D-A27-1 : LA RESTAURATION PROCÈDE SANS PERSISTANCE, L'EMBARQUEMENT NON ──
// (DECISIONS.md, 2026-09-06 — A01 sur délégation de Williams.)
// 05 §31-2 refuse l'EMBARQUEMENT sans persistance, et son motif est net : ne pas
// laisser naître des données NEUVES dans un stockage que le navigateur peut
// effacer. Une restauration est la situation inverse — la donnée existe déjà,
// dans le fichier, en sécurité — et sur un navigateur qui refuse la persistance,
// refuser reviendrait à garantir ZÉRO donnée là où l'on pouvait en sauver.
// L'écran fait donc les deux : il affiche le guidage EN PREMIER (il peut suffire
// — « Sur l'écran d'accueil » se règle en trois gestes), et il laisse passer
// outre par une action explicite, jamais par défaut. Après quoi le RÉ-EXPORT est
// l'action mise en avant : c'est lui qui rend l'arbitrage tenable, puisque la
// copie survivante ne doit pas rester seule sur un stockage non garanti
// (invariant 8).
//
// ── DÉFAUT A27-D1, FERMÉ ICI ────────────────────────────────────────────────
// `exigerPersistance()` était appelé HORS de tout `try`, dans une IIFE lancée par
// `void`. Or `navigator.storage.persist()` et `.estimate()` LÈVENT — `SecurityError`
// sur WebKit en navigation privée et en contexte non sécurisé, c'est-à-dire sur
// l'iPad même que 03 §22.1 vise. Le rejet partait en promesse non gérée,
// `setPhase` n'était jamais rappelé, et l'écran restait DÉFINITIVEMENT sur son
// squelette « Déchiffrement et restauration en cours », sans cause, sans action
// et sans issue (l'état `en_cours` retire le formulaire, `Recommencer`
// n'appartient qu'à l'état d'erreur). Deux gardes le ferment, et il en faut deux :
//   ① un `try` autour du seul appel qui n'en avait pas, pour NOMMER la cause ;
//   ② un `.catch` terminal sur l'IIFE, filet de sécurité structurel — le jour où
//      quelqu'un ajoutera un `await` au-dessus du `try`, l'écran dira quelque
//      chose au lieu de se figer. C'est le même parti qu'`EcranFinDeJournee`.
//
// ── CE QU'IL DIT, ET NE TAIT PAS ────────────────────────────────────────────
// Le nombre d'opérations d'outbox présentes dans le fichier et NON réinjectées
// (DECISIONS.md 2026-09-05) : les données sont restaurées, la file ne l'est pas
// dans cette version. Le domaine le rend ; l'écran l'affiche tel quel — même
// parti que le port de sync inerte, jamais une pastille verte.
// Et, depuis le constat A27 du 2026-09-06, D'OÙ vient ce qu'il vient d'écrire :
// l'appareil d'origine et l'instant de la sauvegarde. « 3 élément(s) restauré(s) »
// ne permettait pas de vérifier qu'on avait restauré le BON fichier.
//
// Les quatre états (03 §33.2) : vide (aucun fichier choisi — dit quoi faire),
// chargement (lecture + dérivation Argon2id, qui peut prendre une seconde sur
// tablette), erreur (mauvais mot de passe / fichier illisible / persistance
// refusée / stockage en panne — cause + action + une SORTIE), hors ligne
// (nominal : tout se fait sans réseau).
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours),
// E6 (hors ligne total), E33 (sécurité / RGPD).
// =============================================================================
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Bouton, Message, RappelHorsLigne, ZoneEtat, type EtatZone } from '@axion/ui';
import {
  CAPACITES_HORS_LIGNE,
  PASTILLE_PORTEE_PAR_LA_COQUILLE,
} from '../../app/capacites-hors-ligne.js';
import { useTerrain } from '../../app/contexte.js';
import { exigerPersistance, guidageSansPersistance } from '../../local/stockage.js';
import { deposerFichier } from '../../sauvegarde/depot.js';
import { EXTENSION_SAUVEGARDE, nomFichierSauvegarde } from '../../sauvegarde/format.js';
import {
  exporterSauvegarde,
  importerSauvegarde,
  MotDePasseExportInvalideError,
  type RapportImport,
} from '../../sauvegarde/sauvegarde.js';
import { formaterDateHeureMission } from '../../session/fuseau.js';
import { useEnLigne } from '../../session/media.js';
import './journee.css';

type Phase =
  | { readonly nature: 'vide' }
  | { readonly nature: 'pret'; readonly fichier: File }
  | { readonly nature: 'en_cours' }
  | {
      readonly nature: 'erreur';
      readonly cause: string;
      readonly action: string;
      /**
       * Le fichier à reprendre SANS exiger la persistance (D-A27-1), ou `null`
       * quand l'échec n'a rien à voir avec le stockage — un mauvais mot de passe
       * ne se répare pas en passant outre, et proposer de le faire apprendrait à
       * l'auditeur à cliquer sur « quand même » devant n'importe quel refus.
       */
      readonly repriseSansPersistance: File | null;
    }
  | {
      readonly nature: 'restauree';
      readonly rapport: RapportImport;
      /** `false` = restauré sur un stockage que le navigateur peut effacer. */
      readonly persistanceAccordee: boolean;
    };

/** Le ré-export proposé juste après la restauration — son propre petit état. */
type Reexport =
  | { readonly nature: 'repos' }
  | { readonly nature: 'saisie' }
  | { readonly nature: 'en_cours' }
  | { readonly nature: 'fait'; readonly nom: string }
  | { readonly nature: 'echec'; readonly message: string };

const CAUSE_STOCKAGE_INJOIGNABLE =
  'Le stockage de cet appareil n’a pas pu être interrogé : le navigateur a refusé la question elle-même.';

const ACTION_STOCKAGE_INJOIGNABLE =
  'C’est le cas en navigation privée, et sur une page ouverte hors HTTPS. Quittez la navigation privée, ' +
  'ouvrez l’application depuis l’écran d’accueil, puis réessayez — ou restaurez quand même, ' +
  'en ré-exportant une sauvegarde aussitôt.';

/**
 * ── LES DEUX ÉCHECS QUI SE RECLASSENT, ET POURQUOI ILS REMONTENT ────────────
 * A27-D1 venait d'un `await` hors de tout `try`. La parade n'est pas d'ajouter
 * un `try` de plus — il en manquerait un le jour où quelqu'un ajoute un `await`
 * — mais de n'avoir plus qu'UNE SEULE porte de sortie : tout rejet de la
 * séquence traverse le `.catch` terminal, qui rend une phase d'erreur. Les deux
 * échecs que l'écran sait NOMMER se marquent donc au passage, au lieu d'être
 * devinés à l'arrivée. Un troisième cas, inconnu, y arrive quand même — et
 * l'écran parle, au lieu de se figer sur son squelette.
 */
class EchecStockage extends Error {
  override readonly name = 'EchecStockage';
}

class EchecLecture extends Error {
  override readonly name = 'EchecLecture';
}

/** Lit le fichier choisi comme du JSON. Tout échec de lecture est un `EchecLecture`. */
async function lireJson(fichier: File): Promise<unknown> {
  try {
    return JSON.parse(await fichier.text());
  } catch {
    throw new EchecLecture('fichier illisible comme JSON');
  }
}

/**
 * Traduit un rejet en phase d'erreur : une cause, une action, et — pour le seul
 * échec de stockage — la reprise de D-A27-1.
 *
 * Fonction PURE et à part : c'est elle qui décide de ce que l'auditeur lit un
 * soir d'incident, et elle doit pouvoir être éprouvée cas par cas sans monter
 * un écran. Un mauvais mot de passe n'ouvre PAS la reprise sans persistance :
 * il ne se répare pas en passant outre, et proposer « quand même » devant
 * n'importe quel refus apprendrait à cliquer sans lire.
 */
function classerEchec(cause: unknown, fichier: File): Phase {
  if (cause instanceof EchecStockage) {
    return {
      nature: 'erreur',
      cause: CAUSE_STOCKAGE_INJOIGNABLE,
      action: ACTION_STOCKAGE_INJOIGNABLE,
      repriseSansPersistance: fichier,
    };
  }
  if (cause instanceof EchecLecture) {
    return {
      nature: 'erreur',
      cause: 'Ce fichier n’est pas lisible comme une sauvegarde Axion.',
      action: `Vérifiez que vous avez choisi un fichier ${EXTENSION_SAUVEGARDE}, non modifié.`,
      repriseSansPersistance: null,
    };
  }
  // Les deux erreurs du domaine portent déjà cause ET action, en français ; un
  // rejet qui n'est pas une `Error` (une API qui `throw 'message'`) ne fuit pas
  // son détail technique à l'écran (§33.2 : « code technique replié »).
  return {
    nature: 'erreur',
    cause: cause instanceof Error ? cause.message : 'La restauration a échoué.',
    action: 'Vérifiez le mot de passe et le fichier, puis réessayez. Rien n’a été modifié.',
    repriseSansPersistance: null,
  };
}

export function EcranRestauration(): ReactNode {
  const { naviguer } = useTerrain();
  const enLigne = useEnLigne();
  const identifiant = useId();
  const [motDePasse, setMotDePasse] = useState('');
  const [phase, setPhase] = useState<Phase>({ nature: 'vide' });
  const [reexport, setReexport] = useState<Reexport>({ nature: 'repos' });
  const [motDePasseExport, setMotDePasseExport] = useState('');

  const choisir = useCallback((fichier: File | null): void => {
    setPhase(fichier === null ? { nature: 'vide' } : { nature: 'pret', fichier });
  }, []);

  /**
   * Le geste, avec ou sans l'exigence de persistance.
   *
   * `exigerLaPersistance` n'est pas un drapeau de confort : il porte la
   * différence entre le chemin nominal (05 §31-2 : on demande, et un refus
   * guide) et la reprise explicite de D-A27-1 (on a lu le guidage, on passe
   * outre en connaissance de cause). Aucun des deux n'est un défaut de l'autre.
   */
  const lancer = useCallback(
    (fichier: File, exigerLaPersistance: boolean): void => {
      setPhase({ nature: 'en_cours' });

      void (async (): Promise<void> => {
        let persistanceAccordee = false;

        if (exigerLaPersistance) {
          // ── A27-D1 : le seul appel qui n'était gardé par rien ─────────────
          // `persist()` et `estimate()` LÈVENT sur WebKit en navigation privée
          // et hors contexte sécurisé. Le rejet est reclassé, pas avalé : il
          // ressort par la porte unique, avec sa cause et sa reprise.
          const verdict = await exigerPersistance().catch(() => {
            throw new EchecStockage('navigator.storage a rejeté');
          });
          if (!verdict.accordee) {
            setPhase({
              nature: 'erreur',
              cause: 'Le navigateur ne garantit pas de conserver les données sur cet appareil.',
              // Le guidage SANS sa conclusion d'embarquement : ici, la
              // restauration n'est pas refusée, elle attend une décision.
              action: guidageSansPersistance(verdict.motif),
              repriseSansPersistance: fichier,
            });
            return;
          }
          persistanceAccordee = true;
        }

        const rapport = await importerSauvegarde(await lireJson(fichier), motDePasse);
        setMotDePasse('');
        setPhase({ nature: 'restauree', rapport, persistanceAccordee });
      })().catch((cause: unknown) => {
        setPhase(classerEchec(cause, fichier));
      });
    },
    [motDePasse],
  );

  /**
   * Le fichier choisi, ou `null`. Extrait ici, et pas testé dans le gestionnaire :
   * un garde `if (phase.nature !== 'pret') return;` aurait été une branche que
   * rien ne peut atteindre — le bouton est fermé dans tous les autres états — donc
   * du code qu'aucun test ne peut honnêtement couvrir. Ce qui ne peut pas arriver
   * ne se garde pas : ça se rend impossible.
   */
  const fichierPret = phase.nature === 'pret' ? phase.fichier : null;

  /**
   * Le ré-export depuis CET appareil, juste après la restauration.
   *
   * Le mot de passe est redemandé, et ce n'est pas une lourdeur : celui de la
   * restauration a été effacé de l'état à la seconde du succès (11 §4 — il est
   * la clé du fichier), et le prolonger pour épargner une saisie serait rallonger
   * la vie d'un secret en mémoire pour un gain de confort. Le champ porte un
   * libellé distinct : ce n'est plus la clé du fichier reçu, c'est celle du
   * fichier qu'on va produire.
   */
  const reexporter = useCallback(
    (missionId: string): void => {
      setReexport({ nature: 'en_cours' });
      void (async (): Promise<void> => {
        const produit = await exporterSauvegarde({ missionId, motDePasse: motDePasseExport });
        const nom = nomFichierSauvegarde(missionId, produit.enTete.creeLe);
        deposerFichier(nom, JSON.stringify(produit));
        setMotDePasseExport('');
        setReexport({ nature: 'fait', nom });
      })().catch((cause: unknown) => {
        setReexport({
          nature: 'echec',
          message:
            cause instanceof MotDePasseExportInvalideError
              ? cause.message
              : 'La sauvegarde n’a pas pu être produite sur cet appareil. Vos données restaurées restent en place ; réessayez, et prévenez le siège si l’échec persiste.',
        });
      });
    },
    [motDePasseExport],
  );

  // Le fichier repris est extrait AVANT le JSX, et pas lu depuis `phase` dans le
  // gestionnaire : TypeScript ne conserve pas l'affinage d'une PROPRIÉTÉ à
  // l'intérieur d'une fonction imbriquée. Une variable locale dit la même chose
  // au lecteur, et la dit aussi au compilateur.
  const repriseSansPersistance = phase.nature === 'erreur' ? phase.repriseSansPersistance : null;

  const etat: EtatZone =
    phase.nature === 'en_cours'
      ? { nature: 'chargement', libelle: 'Déchiffrement et restauration en cours', lignes: 3 }
      : phase.nature === 'erreur'
        ? {
            nature: 'erreur',
            titre: 'La sauvegarde n’a pas été restaurée',
            cause: phase.cause,
            action: phase.action,
            actions: (
              <>
                {repriseSansPersistance !== null && (
                  <Bouton
                    taille="large"
                    onClick={() => {
                      lancer(repriseSansPersistance, false);
                    }}
                  >
                    Restaurer quand même, sans garantie de conservation
                  </Bouton>
                )}
                <Bouton
                  variante="secondaire"
                  onClick={() => {
                    setPhase({ nature: 'vide' });
                  }}
                >
                  Recommencer
                </Bouton>
              </>
            ),
          }
        : { nature: 'nominal' };

  return (
    <section className="axn-pile axn-pile--large">
      <h1>Restaurer une sauvegarde</h1>
      <p>
        Pour reprendre une mission sur un appareil neuf ou de remplacement, à partir d’un fichier
        {` ${EXTENSION_SAUVEGARDE} `}produit en fin de journée. Tout se fait sur cet appareil, sans
        réseau.
      </p>

      <ZoneEtat etat={etat}>
        <>
          {phase.nature === 'restauree' ? (
            <div className="axn-journee__carte">
              <Message ton="succes" titre="Sauvegarde restaurée">
                {phase.rapport.lignesRestaurees} élément(s) de mission restauré(s). La mission est
                maintenant présente sur cet appareil.
              </Message>

              {/* Constat A27 (2026-09-06) : DE QUEL fichier vient ce qui vient
                  d'être écrit. Deux sauvegardes sur la même clé USB — mardi et
                  mercredi, ou deux missions — ne se distinguaient d'aucune façon
                  avant de rouvrir la journée.
                  L'appareil d'origine et l'instant sortent de l'en-tête EN CLAIR ;
                  le titre et le fuseau, eux, sont lus dans la base après l'import
                  (L5d) — un identifiant de 36 caractères n'apprend rien à personne
                  et n'est pas de l'interface en français, et l'instant se lit au
                  fuseau de la MISSION, jamais à celui du portable de l'auditeur
                  (03 §22.2, invariant 5). */}
              <dl className="axn-journee__identite">
                <div>
                  <dt>Appareil d’origine</dt>
                  <dd>{phase.rapport.libelleAppareilSource}</dd>
                </div>
                <div>
                  <dt>Sauvegarde produite le</dt>
                  <dd>
                    {formaterDateHeureMission(
                      phase.rapport.sauvegardeCreeeLe,
                      phase.rapport.fuseauMission,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Mission</dt>
                  <dd>
                    {phase.rapport.titreMission ??
                      'Mission non nommée dans ce fichier — ouvrez votre journée pour la reconnaître'}
                  </dd>
                </div>
              </dl>

              {phase.rapport.avertissement !== null && (
                <Message ton="avertissement" titre="File d’envoi non restaurée">
                  {phase.rapport.avertissement}
                </Message>
              )}

              {/* D-A27-1 : l'avertissement fort, jamais une pastille discrète. */}
              {!phase.persistanceAccordee && (
                <Message ton="alerte" titre="Stockage non garanti sur cet appareil">
                  Le navigateur ne s’engage pas à conserver ces données : il peut les effacer pour
                  récupérer de l’espace, et iOS le fait au bout de quelques jours sans usage. Vos
                  données sont là, mais elles ne sont pas à l’abri ici. Produisez une sauvegarde
                  maintenant, et synchronisez dès qu’un réseau est disponible.
                </Message>
              )}

              {/* Le ré-export : mis en avant, jamais enfoui dans un menu. Il est
                  l'action PRINCIPALE quand la persistance n'a pas été accordée —
                  c'est ce qui rend D-A27-1 tenable au regard de l'invariant 8. */}
              <div className="axn-journee__actions">
                {reexport.nature === 'repos' ? (
                  <Bouton
                    taille="large"
                    variante={phase.persistanceAccordee ? 'secondaire' : 'principal'}
                    onClick={() => {
                      setReexport({ nature: 'saisie' });
                    }}
                  >
                    Exporter une sauvegarde depuis cet appareil
                  </Bouton>
                ) : null}
                <Bouton
                  taille="large"
                  variante={phase.persistanceAccordee ? 'principal' : 'secondaire'}
                  onClick={() => {
                    naviguer({ type: 'racine', vue: 'aujourdhui' });
                  }}
                >
                  Ouvrir ma journée
                </Bouton>
              </div>

              {(reexport.nature === 'saisie' || reexport.nature === 'en_cours') && (
                <div className="axn-champ">
                  <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp-export`}>
                    Mot de passe de cet appareil
                  </label>
                  <input
                    id={`${identifiant}-mdp-export`}
                    className="axn-champ__saisie"
                    type="password"
                    autoComplete="current-password"
                    data-saisie-libre="vrai"
                    aria-describedby={`${identifiant}-mdp-export-aide`}
                    value={motDePasseExport}
                    onChange={(evenement) => {
                      setMotDePasseExport(evenement.target.value);
                    }}
                  />
                  <p id={`${identifiant}-mdp-export-aide`} className="axn-champ__aide">
                    Il chiffrera le nouveau fichier, et sera le seul moyen de le rouvrir.
                  </p>
                  <div className="axn-journee__actions">
                    <Bouton
                      taille="large"
                      disabled={reexport.nature === 'en_cours' || motDePasseExport === ''}
                      onClick={() => {
                        reexporter(phase.rapport.missionId);
                      }}
                    >
                      Produire le fichier de sauvegarde
                    </Bouton>
                  </div>
                </div>
              )}

              {reexport.nature === 'fait' && (
                <Message ton="succes" titre="Nouvelle sauvegarde produite">
                  Fichier déposé sur cet appareil : {reexport.nom}. Mettez-le à l’abri (clé USB,
                  second appareil) — aucune donnée ne doit vivre sur un seul appareil plus de 24 h
                  ouvrées.
                </Message>
              )}

              {reexport.nature === 'echec' && (
                <Message ton="alerte" titre="Sauvegarde non produite">
                  {reexport.message}
                </Message>
              )}
            </div>
          ) : (
            <div className="axn-journee__carte">
              {/* Deux champs composés directement avec les classes du design
                  system : `ChampTexte` retire `type`, et ni un fichier ni un
                  secret ne sont une nature de DONNÉE — précédent posé par
                  `EcranDeverrouillage` (L5a). Aucune couleur ni taille en dur. */}
              <div className="axn-champ">
                <label className="axn-champ__libelle" htmlFor={`${identifiant}-fichier`}>
                  Fichier de sauvegarde
                </label>
                {/* PAS d'attribut `accept`, et c'est délibéré (constat A27,
                    2026-09-06). iOS mappe `accept` sur des UTI ; `.axionbackup`
                    n'en est pas un, et une extension inconnue GRISE tous les
                    fichiers dans le sélecteur Files — sur l'appareil même pour
                    lequel cet écran existe. Le filtre est donc retiré plutôt que
                    deviné, ce qui est de toute façon plus juste : c'est le
                    déchiffrement qui dit si un fichier est bon, jamais son nom.
                    Un fichier qui n'en est pas un est refusé deux lignes plus
                    bas, avec sa cause et son action, et un test l'éprouve.
                    Reste dû à un iPad réel : vérifier que le sélecteur Files
                    n'oppose aucun autre filtre (P-C, checklist 07 §15). */}
                <input
                  id={`${identifiant}-fichier`}
                  className="axn-champ__saisie"
                  type="file"
                  aria-describedby={`${identifiant}-fichier-aide`}
                  onChange={(evenement) => {
                    choisir(evenement.target.files?.[0] ?? null);
                  }}
                />
                <p id={`${identifiant}-fichier-aide`} className="axn-champ__aide">
                  {phase.nature === 'pret'
                    ? `Fichier choisi : ${phase.fichier.name}`
                    : 'Aucun fichier choisi. Sélectionnez la sauvegarde produite sur l’appareil d’origine.'}
                </p>
              </div>

              <div className="axn-champ">
                {/*
                  N3 (recette A54, 2026-09-09) — « Votre mot de passe » était ici
                  DOUBLEMENT trompeur : ce n'est ni un mot de passe à créer, ni
                  celui de cet appareil-ci. Une sauvegarde se restaure sur un
                  appareil de REMPLACEMENT, qui a son propre coffre et son propre
                  mot de passe ; la seule clé du fichier est celui de l'appareil
                  qui l'a produit (11 §4). Écrire « de cet appareil » ici aurait
                  été une contre-vérité — le champ du RÉ-EXPORT, plus haut, porte
                  ce libellé-là, et il est juste pour lui.
                */}
                <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp`}>
                  Mot de passe de l’appareil qui a produit la sauvegarde
                </label>
                <input
                  id={`${identifiant}-mdp`}
                  className="axn-champ__saisie"
                  type="password"
                  autoComplete="current-password"
                  data-saisie-libre="vrai"
                  aria-describedby={`${identifiant}-mdp-aide`}
                  value={motDePasse}
                  onChange={(evenement) => {
                    setMotDePasse(evenement.target.value);
                  }}
                />
                <p id={`${identifiant}-mdp-aide`} className="axn-champ__aide">
                  Ce n’est pas celui de cet appareil-ci, ni un mot de passe à créer : c’est la seule
                  clé du fichier, et cet appareil n’a jamais vu ces données.
                </p>
              </div>

              <div className="axn-journee__actions">
                {fichierPret === null ? (
                  <Bouton taille="large" disabled>
                    Restaurer sur cet appareil
                  </Bouton>
                ) : (
                  <Bouton
                    taille="large"
                    disabled={motDePasse === ''}
                    onClick={() => {
                      lancer(fichierPret, true);
                    }}
                  >
                    Restaurer sur cet appareil
                  </Bouton>
                )}
                <Bouton
                  variante="secondaire"
                  onClick={() => {
                    naviguer({ type: 'retour' });
                  }}
                >
                  Revenir
                </Bouton>
              </div>
            </div>
          )}
        </>
      </ZoneEtat>

      {/* §33.2 — le rappel des capacités. Il remplace un `ZoneEtat` de nature
          « hors-ligne » auquel il fallait passer un `<span />` d'enfant pour
          compiler, alors que cette nature IGNORE ses enfants : le contournement
          disparaît avec lui. L'introduction est celle de cet écran — un appareil
          de remplacement, à l'hôtel, sans réseau, est le cas NOMINAL ici. */}
      <RappelHorsLigne
        enLigne={enLigne}
        capacites={CAPACITES_HORS_LIGNE.restauration}
        introduction="Sans réseau, cette restauration reste possible :"
        avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}
      />
    </section>
  );
}

/**
 * La porte d'entrée vers la restauration, composée sous l'écran d'embarquement.
 *
 * Elle est discrète — un appareil neuf n'est pas le cas courant — mais elle est
 * LÀ où on en a besoin : avant qu'une mission soit chargée. Un bouton, pas un
 * paragraphe : sur une tablette de remplacement, à l'hôtel, personne ne lit.
 */
export function AccesRestauration(): ReactNode {
  const { naviguer } = useTerrain();
  return (
    <div className="axn-journee__actions">
      <Bouton
        variante="secondaire"
        onClick={() => {
          naviguer({ type: 'aller', vue: 'restauration' });
        }}
      >
        Restaurer une sauvegarde de secours
      </Bouton>
    </div>
  );
}
