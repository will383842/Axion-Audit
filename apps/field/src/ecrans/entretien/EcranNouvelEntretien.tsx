// =============================================================================
// « NOUVEL ENTRETIEN » — 03 §17.4 : « démarrage d'un entretien en 3 champs
// (nom, fonction, unité) — tout le reste est optionnel ou différable »
//
// Trois champs obligatoires, un facultatif (le courriel, 03 M3.2), la date
// automatique (`clientCreatedAt`, horloge corrigée). La session naît
// `non_demarre`, hors ligne, avec un UUID v7 généré sur l'appareil ; l'accord de
// participation se recueille à l'écran suivant, au démarrage (03 M3.2 V2.10).
//
// La MISSION n'est pas un champ : c'est le contexte. Une seule mission sur
// l'appareil → elle est prise ; plusieurs → un sélecteur, avant les trois
// champs. Le cockpit « Aujourd'hui » (L5c) pré-remplira tout cela en un tap.
//
// Les quatre états (03 §33.2) : chargement · vide (aucune mission, ou aucune
// unité dans la mission) · erreur (identité de l'auditeur inconnue — on ne
// fabrique pas un propriétaire de session) · nominal.
// Traçabilité : E12 (entretiens par interlocuteur), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, ChampTexte, Message, Selection, ZoneEtat, type EtatZone } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { contexteLocal } from '../../local/contexte.js';
import { lireIdentiteAuditeur } from '../../session/auditeur.js';
import { creerEntretien } from '../../session/ecriture-session.js';
import { lireMissionsLocales, lireUnites } from '../../session/missions.js';
import { memoriserSessionCourante } from '../../session/position.js';
import './entretien.css';

export function EcranNouvelEntretien(): ReactNode {
  const { base, naviguer } = useTerrain();

  const missions = useLiveQuery(
    async () => (base === null ? [] : lireMissionsLocales()),
    [base],
    undefined,
  );
  const identite = useLiveQuery(
    async () => (base === null ? null : lireIdentiteAuditeur(base, contexteLocal().coffre)),
    [base],
    undefined,
  );

  const [missionChoisie, setMissionChoisie] = useState('');
  const missionId =
    missions === undefined
      ? ''
      : missions.length === 1
        ? (missions[0]?.id ?? '')
        : missions.some((mission) => mission.id === missionChoisie)
          ? missionChoisie
          : '';

  const unites = useLiveQuery(
    async () => (missionId === '' ? [] : lireUnites(missionId)),
    [missionId],
    undefined,
  );

  const [nom, setNom] = useState('');
  const [fonction, setFonction] = useState('');
  const [uniteId, setUniteId] = useState('');
  const [courriel, setCourriel] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = useCallback(
    (evenement: FormEvent<HTMLFormElement>): void => {
      evenement.preventDefault();
      if (enCours || base === null || identite === null || identite === undefined) return;
      if (nom.trim() === '' || fonction.trim() === '' || uniteId === '') {
        setErreur('Le nom, la fonction et l’unité sont nécessaires pour ouvrir un entretien.');
        return;
      }
      setEnCours(true);
      setErreur(null);
      void creerEntretien({
        missionId,
        orgUnitId: uniteId,
        personName: nom,
        personRole: fonction,
        personEmail: courriel.trim() === '' ? null : courriel,
        conductedBy: identite.id,
      })
        .then(async (id) => {
          await memoriserSessionCourante(base, id);
          naviguer({ type: 'remplacer', vue: 'entretien' });
        })
        .catch((cause: unknown) => {
          setErreur(
            cause instanceof Error
              ? cause.message
              : 'L’entretien n’a pas pu être créé sur cet appareil. Rien n’a été enregistré.',
          );
        })
        .finally(() => {
          setEnCours(false);
        });
    },
    [base, courriel, enCours, fonction, identite, missionId, naviguer, nom, uniteId],
  );

  const etat: EtatZone =
    missions === undefined || identite === undefined || unites === undefined
      ? { nature: 'chargement', libelle: 'Préparation du nouvel entretien', lignes: 4 }
      : identite === null
        ? {
            nature: 'erreur',
            titre: 'Auditeur inconnu sur cet appareil',
            cause:
              'Aucune identité d’auditeur n’est enregistrée ici : un entretien doit avoir un propriétaire, et l’application ne l’invente pas.',
            action:
              'Connectez-vous une fois au siège depuis cet appareil, puis revenez ouvrir l’entretien.',
          }
        : missions.length === 0
          ? {
              nature: 'vide',
              titre: 'Aucune mission sur cet appareil',
              description:
                'Embarquez une mission depuis l’accueil, en ligne, avant d’ouvrir un entretien.',
              actions: (
                <Bouton
                  onClick={() => {
                    naviguer({ type: 'retour' });
                  }}
                >
                  Revenir à l’accueil
                </Bouton>
              ),
            }
          : missionId !== '' && unites.length === 0
            ? {
                nature: 'vide',
                titre: 'Aucune unité dans cette mission',
                description:
                  'L’arbre organisationnel de la mission n’a pas été téléchargé sur cet appareil. Un entretien se tient toujours dans une unité.',
              }
            : { nature: 'nominal' };

  return (
    <section className="axn-pile axn-nouvel-entretien" aria-labelledby="axn-nouvel-entretien-titre">
      <h1 id="axn-nouvel-entretien-titre">Nouvel entretien</h1>
      <p>Trois champs. Tout le reste se fait pendant l’entretien, ou après.</p>

      <ZoneEtat etat={etat}>
        <form onSubmit={soumettre} noValidate>
          {missions !== undefined && missions.length > 1 && (
            <Selection
              libelle="Mission"
              obligatoire
              optionVide="Choisir la mission"
              options={missions.map((mission) => ({ valeur: mission.id, libelle: mission.titre }))}
              value={missionId}
              onChange={(evenement) => {
                setMissionChoisie(evenement.target.value);
                setUniteId('');
              }}
            />
          )}

          <ChampTexte
            libelle="Nom de l’interlocuteur"
            obligatoire
            autoComplete="off"
            autoFocus
            value={nom}
            onChange={(evenement) => {
              setNom(evenement.target.value);
            }}
          />
          <ChampTexte
            libelle="Fonction"
            obligatoire
            autoComplete="off"
            value={fonction}
            onChange={(evenement) => {
              setFonction(evenement.target.value);
            }}
          />
          <Selection
            libelle="Unité"
            obligatoire
            optionVide="Choisir l’unité"
            options={(unites ?? []).map((unite) => ({
              valeur: unite.id,
              libelle: unite.status === 'proposee' ? `${unite.name} (proposée)` : unite.name,
            }))}
            value={uniteId}
            disabled={missionId === ''}
            {...(missionId === '' ? { aide: 'Choisissez d’abord la mission.' } : {})}
            onChange={(evenement) => {
              setUniteId(evenement.target.value);
            }}
          />
          <ChampTexte
            libelle="Courriel (facultatif)"
            nature="courriel"
            autoComplete="off"
            value={courriel}
            onChange={(evenement) => {
              setCourriel(evenement.target.value);
            }}
          />

          {erreur !== null && (
            <Message ton="alerte" titre="Entretien non créé" role="alert">
              {erreur}
            </Message>
          )}

          <Bouton type="submit" pleineLargeur taille="large" chargement={enCours}>
            Ouvrir l’entretien
          </Bouton>
        </form>
      </ZoneEtat>
    </section>
  );
}
