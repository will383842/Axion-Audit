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
//   · la PERSISTANCE du stockage (05 §31-2), exigée AVANT d'écrire : restaurer
//     une mission dans un stockage que le navigateur peut effacer serait
//     recréer la perte qu'on vient de réparer. Refus = rien n'est écrit, et
//     l'écran guide.
//
// ── CE QU'IL DIT, ET NE TAIT PAS ────────────────────────────────────────────
// Le nombre d'opérations d'outbox présentes dans le fichier et NON réinjectées
// (DECISIONS.md 2026-09-05) : les données sont restaurées, la file ne l'est pas
// dans cette version. Le domaine le rend ; l'écran l'affiche tel quel — même
// parti que le port de sync inerte, jamais une pastille verte.
//
// Les quatre états (03 §33.2) : vide (aucun fichier choisi — dit quoi faire),
// chargement (lecture + dérivation Argon2id, qui peut prendre une seconde sur
// tablette), erreur (mauvais mot de passe / fichier illisible / persistance
// refusée — cause + action), hors ligne (nominal : tout se fait sans réseau).
//
// Traçabilité : E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours),
// E6 (hors ligne total), E33 (sécurité / RGPD).
// =============================================================================
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Bouton, Message, ZoneEtat, type EtatZone } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { exigerPersistance } from '../../local/stockage.js';
import { EXTENSION_SAUVEGARDE } from '../../sauvegarde/format.js';
import { importerSauvegarde, type RapportImport } from '../../sauvegarde/sauvegarde.js';
import { useEnLigne } from '../../session/media.js';
import './journee.css';

type Phase =
  | { readonly nature: 'vide' }
  | { readonly nature: 'pret'; readonly fichier: File }
  | { readonly nature: 'en_cours' }
  | { readonly nature: 'erreur'; readonly cause: string; readonly action: string }
  | { readonly nature: 'restauree'; readonly rapport: RapportImport };

export function EcranRestauration(): ReactNode {
  const { naviguer } = useTerrain();
  const enLigne = useEnLigne();
  const identifiant = useId();
  const [motDePasse, setMotDePasse] = useState('');
  const [phase, setPhase] = useState<Phase>({ nature: 'vide' });

  const choisir = useCallback((fichier: File | null): void => {
    setPhase(fichier === null ? { nature: 'vide' } : { nature: 'pret', fichier });
  }, []);

  const restaurer = useCallback((): void => {
    if (phase.nature !== 'pret') return;
    const { fichier } = phase;
    setPhase({ nature: 'en_cours' });

    void (async (): Promise<void> => {
      // 05 §31-2 : la persistance AVANT d'écrire. Un refus ne restaure rien.
      const persistance = await exigerPersistance();
      if (!persistance.accordee) {
        setPhase({
          nature: 'erreur',
          cause: 'Le navigateur ne garantit pas de conserver les données sur cet appareil.',
          action: persistance.guidage,
        });
        return;
      }

      let contenu: unknown;
      try {
        contenu = JSON.parse(await fichier.text());
      } catch {
        setPhase({
          nature: 'erreur',
          cause: 'Ce fichier n’est pas lisible comme une sauvegarde Axion.',
          action: `Vérifiez que vous avez choisi un fichier ${EXTENSION_SAUVEGARDE}, non modifié.`,
        });
        return;
      }

      try {
        const rapport = await importerSauvegarde(contenu, motDePasse);
        setMotDePasse('');
        setPhase({ nature: 'restauree', rapport });
      } catch (erreur) {
        // Les deux erreurs du domaine portent déjà cause ET action, en français.
        setPhase({
          nature: 'erreur',
          cause: erreur instanceof Error ? erreur.message : 'La restauration a échoué.',
          action: 'Vérifiez le mot de passe et le fichier, puis réessayez. Rien n’a été modifié.',
        });
      }
    })();
  }, [motDePasse, phase]);

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
              <Bouton
                variante="secondaire"
                onClick={() => {
                  setPhase({ nature: 'vide' });
                }}
              >
                Recommencer
              </Bouton>
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
              {phase.rapport.avertissement !== null && (
                <Message ton="avertissement" titre="File d’envoi non restaurée">
                  {phase.rapport.avertissement}
                </Message>
              )}
              <div className="axn-journee__actions">
                <Bouton
                  taille="large"
                  onClick={() => {
                    naviguer({ type: 'racine', vue: 'aujourdhui' });
                  }}
                >
                  Ouvrir ma journée
                </Bouton>
              </div>
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
                <input
                  id={`${identifiant}-fichier`}
                  className="axn-champ__saisie"
                  type="file"
                  accept={EXTENSION_SAUVEGARDE}
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
                <label className="axn-champ__libelle" htmlFor={`${identifiant}-mdp`}>
                  Votre mot de passe
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
                  Celui avec lequel la sauvegarde a été produite. Il est la seule clé du fichier —
                  cet appareil n’a jamais vu ces données.
                </p>
              </div>

              <div className="axn-journee__actions">
                <Bouton
                  taille="large"
                  disabled={phase.nature !== 'pret' || motDePasse === ''}
                  onClick={restaurer}
                >
                  Restaurer sur cet appareil
                </Bouton>
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

      {!enLigne && (
        <ZoneEtat
          etat={{
            nature: 'hors-ligne',
            capacites: ['Restaurer une sauvegarde de secours, intégralement sans réseau'],
          }}
        >
          <span />
        </ZoneEtat>
      )}
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
