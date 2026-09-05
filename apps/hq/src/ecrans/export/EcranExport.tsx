// =============================================================================
// ÉCRAN D'EXPORT DE MISSION — 03 §36.3. Lot L7, incrément L7c.
//
// ── CE QUE CET ÉCRAN DOIT FAIRE, ET QUI N'EST PAS « TÉLÉCHARGER » ──────────
// Le critère d'acceptation du §36.3 est : « le rapport §20.3 peut être rédigé EN
// ENTIER depuis le ZIP, sans retourner dans l'outil ». Un auditeur qui reçoit
// onze fichiers sans savoir lequel nourrit quelle rubrique RETOURNE DANS L'OUTIL,
// et le critère tombe pour une raison qui n'a rien de technique. L'écran affiche
// donc, AVANT le téléchargement, ce que contient l'archive et à quoi chaque
// fichier sert — depuis `DESCRIPTIONS_FICHIERS_EXPORT`, la même source que le
// serveur, jamais une liste recopiée.
//
// ── LA CASE DES RÉPONDANTS EST UNE DÉCISION, PAS UN CONFORT ────────────────
// Décochée par défaut. Cochée, elle ajoute `?repondants=true` à la requête, et le
// SERVEUR n'écrit alors les noms que pour les sessions dont le consentement est
// explicitement acquis (§26, arbitrage A01 du 2026-09-05). Le libellé le dit en
// toutes lettres : une case qui promettrait « tous les noms » mentirait sur ce
// que le serveur fait.
//
// ── AUCUNE OPTION INERTE ──────────────────────────────────────────────────
// Il n'y a PAS de case « inclure les fichiers joints » : le téléchargement des
// pièces jointes appartient à L6c et n'est pas livré. L'écran le DIT au lieu de
// laisser croire à un oubli. Une case à cocher qui ne fait rien est un mensonge
// d'écran (`DECISIONS.md` 2026-09-05).
//
// ── LES ÉTATS (§33.2), ET CELUI QUI N'EXISTE PAS ICI ──────────────────────
// CHARGEMENT (la mission se lit) · ERREUR (y compris le 404, avec le retour vers
// la mission) · NOMINAL. Il n'y a **pas d'état vide**, et c'est la même raison
// qu'à l'écran d'avancement de L7a : une mission absente est un 404, donc une
// erreur, et une mission PRÉSENTE a toujours une archive — fût-elle réduite à sa
// méta et à des fichiers en-têtes seuls. Rendre « vide » un export possible
// empêcherait de télécharger précisément ce qui prouve qu'il n'y a rien encore.
// Ce que l'utilisateur doit savoir, il le lit AVANT de cliquer : la liste des
// fichiers, et ce que l'archive ne contient pas.
// Le téléchargement, lui, a ses trois retours propres : en cours (le bouton porte
// son état), échec (message d'alerte, en français), succès (le nom du fichier
// reçu, pour qu'on le retrouve dans son dossier de téléchargement).
//
// Traçabilité : E14 (consolidation) · E22 (console de pilotage 7 espaces) · E32
// (interface française) · E36.
// =============================================================================
import { useState, type ReactNode } from 'react';
import { Bouton, CaseACocher, Message, ZoneEtat } from '@axion/ui';
import {
  DESCRIPTIONS_FICHIERS_EXPORT,
  FICHIERS_EXPORT,
  VERSION_EXPORT,
  type CleFichierExport,
} from '../../api/contrats.js';
import { useMission } from '../../api/requetes.js';
import { useTelechargementExport } from '../../api/requetes-export.js';
import { etatDeRequete } from '../../app/etats.js';
import { auClicLienInterne, hrefDeRoute } from '../../app/routeur.js';

/**
 * L'ordre d'affichage : le fichier central d'abord.
 *
 * `reponses.csv` est celui que le §36.3 appelle « LE fichier central » et celui
 * que chaque constat cite (§36.6-2). Le lister en quatrième position, comme dans
 * la liste du pack, ferait chercher.
 */
const ORDRE_AFFICHAGE: readonly CleFichierExport[] = [
  'reponses',
  'mission',
  'arbre',
  'sessions',
  'constats',
  'casUsage',
  'inventaireOutils',
  'registreIa',
  'unitesHorsPerimetre',
  'manifestePiecesJointes',
];

/** Le fichier que l'archive NE contient pas, et pourquoi — dit, jamais tu. */
const ABSENTS: readonly { readonly nom: string; readonly motif: string }[] = [
  {
    nom: FICHIERS_EXPORT.scores,
    motif:
      'Le scoring (03 §32.1) n’est pas encore livré : aucun score par bloc ou par unité n’existe. Le fichier est absent, et son absence est signalée dans mission.json.',
  },
  {
    nom: 'pieces_jointes/ (les fichiers)',
    motif:
      'Le téléchargement des pièces jointes n’est pas encore livré. Le manifeste liste ce qui a été collecté, avec de quoi le réclamer.',
  },
];

function ListeDesFichiers(): ReactNode {
  return (
    <dl className="axn-fiche axn-fiche--liste">
      {ORDRE_AFFICHAGE.map((cle) => (
        <div key={cle}>
          <dt>
            <code>{FICHIERS_EXPORT[cle]}</code>
          </dt>
          <dd>{DESCRIPTIONS_FICHIERS_EXPORT[cle]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EcranExport({ id }: { id: string }): ReactNode {
  const [avecRepondants, setAvecRepondants] = useState(false);
  const mission = useMission(id);
  const telechargement = useTelechargementExport(id);

  const retourMission = (
    <a
      href={hrefDeRoute({ type: 'mission', id })}
      onClick={auClicLienInterne({ type: 'mission', id })}
    >
      Retour à la mission
    </a>
  );

  // `vide: false` — voir l'en-tête : l'absence de mission est un 404, et une
  // mission qui existe est toujours exportable.
  const etat = etatDeRequete(
    { enAttente: mission.isPending, erreur: mission.error, vide: false },
    {
      actions: (
        <Bouton variante="secondaire" onClick={() => void mission.refetch()}>
          Réessayer
        </Bouton>
      ),
      actionsIntrouvable: retourMission,
      chargement: { lignes: 6, libelle: 'Chargement de la mission' },
    },
  );

  return (
    <section className="axn-pile" aria-labelledby="titre-export">
      <div className="axn-entete-ecran">
        <h1 id="titre-export">Export de mission</h1>
        <span className="axn-entete-ecran__compteur">format 03 §36.3 · v{VERSION_EXPORT}</span>
      </div>
      <p>
        Une archive ZIP avec laquelle <strong>le rapport s’écrit en entier</strong>, sans revenir
        dans l’outil. Les fichiers sont en UTF-8 avec BOM et séparateur «&nbsp;;&nbsp;» (lisibles
        tels quels dans un tableur français) ; les horodatages sont écrits{' '}
        <strong>à l’heure de la mission</strong>, avec leur décalage.
      </p>

      <ZoneEtat etat={etat}>
        <div className="axn-pile">
          <h2>Ce que contient l’archive</h2>
          <ListeDesFichiers />

          <h2>Ce qu’elle ne contient pas, et pourquoi</h2>
          <dl className="axn-fiche axn-fiche--liste">
            {ABSENTS.map((absent) => (
              <div key={absent.nom}>
                <dt>
                  <code>{absent.nom}</code>
                </dt>
                <dd>{absent.motif}</dd>
              </div>
            ))}
          </dl>

          <h2>Options</h2>
          <CaseACocher
            checked={avecRepondants}
            onChange={(evenement) => {
              setAvecRepondants(evenement.target.checked);
            }}
            libelle="Inclure le nom des répondants pour les sessions dont le consentement a été recueilli"
          />
          <p className="axn-aide">
            Décochée, l’archive ne porte aucun nom&nbsp;: les réponses restent identifiées par la
            fonction, le service et l’unité. Cochée, le serveur n’écrit le nom que si le
            consentement de la personne est <strong>explicitement acquis</strong> — un consentement
            inconnu ou refusé laisse la cellule vide.
          </p>

          {telechargement.erreur !== null && (
            <Message ton="alerte" titre="Le téléchargement a échoué">
              {telechargement.erreur}
            </Message>
          )}
          {telechargement.dernierFichier !== null && telechargement.erreur === null && (
            <Message ton="succes" titre="Archive téléchargée">
              {telechargement.dernierFichier}
            </Message>
          )}

          <div className="axn-tableau__pied">
            <Bouton
              chargement={telechargement.enCours}
              onClick={() => {
                void telechargement.lancer(avecRepondants);
              }}
            >
              Télécharger l’archive
            </Bouton>
          </div>
        </div>
      </ZoneEtat>
    </section>
  );
}
