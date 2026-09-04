// =============================================================================
// ÉCRAN COUVERTURE — les DEUX axes du 03 §27.1, dans un seul tableau dense.
// Espace 2 « Pilotage mission ». Lot L7, incrément L7b.
//
// ── CE QUE LE CHEF DE MISSION VIENT Y CHERCHER ──────────────────────────────
// « Où en sommes-nous ? », et la réponse a DEUX lectures qu'on ne peut pas
// confondre :
//   · AXE A, en LIGNES — une unité par ligne, l'arbre indenté (FIL-GC : 150
//     unités sur 4 niveaux). « Ce service a-t-il été audité ? » L'alerte §16.6
//     porte sur toute unité `in_scope` sans aucune session ;
//   · AXE B, en COLONNES — les CINQ sources de collecte du §27.1, toujours les
//     cinq, même à zéro. « L'a-t-on audité AUTREMENT qu'en parlant ? »
// Un écran qui n'aurait que l'axe A afficherait « couverture complète » d'une
// mission faite à 100 % d'entretiens — le biais que le §27.1 existe pour corriger.
//
// ── L'ATELIER EST HORS GRILLE, ET IL N'EST JAMAIS SILENCIEUX ────────────────
// `atelier` est le sixième `interviews.kind` mais n'est PAS une source de
// collecte du §27.1 : sa colonne est visuellement détachée, ne porte que le
// réalisé (le §32.4 n'en planifie aucun, un « prévu » y serait une case qui ment)
// et n'entre pas dans le décompte des sources couvertes — un atelier ne comble
// pas l'absence d'une observation. La MARGE l'affiche toujours, y compris à
// zéro ; seule la colonne se replie quand la mission n'en compte aucun, pour ne
// pas encombrer 150 lignes d'une colonne vide.
//
// ── LES QUATRE ÉTATS (§33.2), ET LA RÉSERVE R-L7a-5 ─────────────────────────
// Vide, chargement, erreur, hors ligne : les quatre passent par `etatDeRequete`
// et `ZoneEtat`, comme sur les écrans de L7a. Le contrôle A02 avait relevé que
// trois écrans de L7a n'avaient pas leurs quatre états ; celui-ci les a, et
// l'état vide DIT QUOI FAIRE (§17.6) plutôt que de constater le rien.
//
// ── AUCUN CALCUL ICI (invariant 6 : le siège produit) ───────────────────────
// Aucune somme, aucun pourcentage, aucun décompte n'est fait dans ce fichier :
// tout vient du serveur, agrégé en SQL. Sur 150 unités × 5 sources, recompter à
// chaque rendu tuerait le p95 que la porte P-E mesure.
//
// ── AUCUN MONTANT, ET RIEN DONT ON PUISSE EN DÉDUIRE UN ────────────────────
// Le contrat de cette route ne porte ni montant, ni taux, ni durée valorisée
// (invariant 3, §18.3). L'écran ne peut donc pas en afficher : il n'en reçoit
// aucun. Les seuls nombres rendus sont des COMPTES DE SESSIONS et des EFFECTIFS.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E22 (console de
// pilotage 7 espaces) · E4 (arbre organisationnel à profondeur libre) · E32
// (fuseaux, devises, interface française).
// =============================================================================
import type { ReactNode } from 'react';
import { Badge, Bouton, ZoneEtat } from '@axion/ui';
import {
  DESCRIPTIONS_SOURCE_COLLECTE,
  LIBELLES_SOURCE_COLLECTE,
  SOURCES_COLLECTE,
  type CelluleCouverture,
  type MargesCouverture,
  type UniteCouverte,
} from '../../api/contrats.js';
import { useCouverture } from '../../api/requetes-pilotage.js';
import { useMission } from '../../api/requetes.js';
import { etatDeRequete } from '../../app/etats.js';
import { auClicLienInterne, hrefDeRoute } from '../../app/routeur.js';
import { formaterInstant } from '../../format/dates.js';

/** Indentation maximale rendue — au-delà, l'arbre déborde du tableau dense. */
const PROFONDEUR_MAX_INDENTEE = 6;

/**
 * Une cellule de la grille : « 2 / 3 » réalisé sur prévu, le planifié en second.
 *
 * Trois nombres, pas un ratio : l'écart prévu → planifié est un défaut d'AGENDA,
 * l'écart planifié → réalisé un défaut de TERRAIN. Ce ne sont ni les mêmes
 * alertes ni les mêmes destinataires.
 *
 * ── L'ŒIL ET LA MACHINE LISENT LA MÊME CHOSE, PAS LA MÊME FORME ────────────
 * L'affichage compact (« 2 / 3 ») est ABRÉGÉ, donc `aria-hidden` : lu à voix
 * haute, il donnerait « deux barre oblique trois », qui ne veut rien dire. La
 * phrase complète est la SEULE contenu accessible de la cellule, et elle dit les
 * trois nombres et l'état. §33.6 : jamais la couleur seule — le fond ambré d'une
 * source manquante est doublé du mot « non couverte » dans cette phrase.
 */
function Cellule({ cellule }: { cellule: CelluleCouverture }): ReactNode {
  const attendue = cellule.prevu.min > 0;
  const manquante = attendue && !cellule.couvert;
  const prevu =
    cellule.prevu.min === cellule.prevu.max
      ? String(cellule.prevu.min)
      : `${String(cellule.prevu.min)}–${String(cellule.prevu.max)}`;

  return (
    <td
      className="axn-couverture__cellule"
      data-manquante={manquante ? 'true' : 'false'}
      data-attendue={attendue ? 'true' : 'false'}
    >
      <span aria-hidden="true">
        <span className="axn-couverture__realise">{cellule.realise}</span>
        <span className="axn-couverture__separateur">/</span>
        <span className="axn-couverture__prevu">{prevu}</span>
        <span className="axn-couverture__planifie">
          {cellule.planifie} planifié{cellule.planifie > 1 ? 's' : ''}
        </span>
      </span>
      <span className="axn-visuellement-masque">
        {`${String(cellule.realise)} réalisé sur ${prevu} prévu, ${String(cellule.planifie)} planifié`}
        {attendue ? (manquante ? ' — source non couverte' : ' — source couverte') : ''}
      </span>
    </td>
  );
}

function LigneUnite({
  unite,
  ateliers,
  blocsActifs,
}: {
  unite: UniteCouverte;
  ateliers: boolean;
  blocsActifs: number;
}): ReactNode {
  return (
    <tr data-alerte={unite.aucuneSession ? 'true' : 'false'}>
      <th scope="row" className="axn-tableau__principal">
        <span
          className="axn-couverture__unite"
          style={{
            // Indentation de l'arbre : un multiple d'un TOKEN d'espacement, jamais
            // une taille en dur (invariant 4). La profondeur est bornée pour qu'un
            // arbre inhabituellement profond ne pousse pas le tableau hors écran.
            paddingInlineStart: `calc(var(--espacement-4) * ${String(
              Math.min(unite.profondeur, PROFONDEUR_MAX_INDENTEE),
            )})`,
          }}
        >
          {unite.nom}
        </span>
        {!unite.inScope && (
          <Badge ton="neutre">
            <span className="axn-visuellement-masque">Unité </span>hors périmètre
          </Badge>
        )}
        {unite.aucuneSession && <Badge ton="alerte">aucune session</Badge>}
      </th>
      <td>{unite.effectif ?? '—'}</td>
      {unite.parSource.map((cellule) => (
        <Cellule key={cellule.kind} cellule={cellule} />
      ))}
      {ateliers && (
        <td className="axn-couverture__hors-grille">
          {unite.atelierRealise === 0 ? '—' : unite.atelierRealise}
        </td>
      )}
      <td>
        {unite.sourcesAttendues === 0
          ? '—'
          : `${String(unite.sourcesCouvertes)} / ${String(unite.sourcesAttendues)}`}
      </td>
      <td>
        {blocsActifs === 0
          ? '—'
          : unite.blocsNonCouverts.length === 0
            ? 'aucun'
            : unite.blocsNonCouverts.join(', ')}
      </td>
    </tr>
  );
}

/** Les marges de mission — mission entière, jamais la page (§6.3 `LOT_L7.md`). */
function Marges({ marges, ateliers }: { marges: MargesCouverture; ateliers: boolean }): ReactNode {
  return (
    <tr className="axn-couverture__marges">
      <th scope="row">Total de la mission</th>
      <td>{marges.unitesInScope} au périmètre</td>
      {marges.parSource.map((cellule) => (
        <Cellule key={cellule.kind} cellule={cellule} />
      ))}
      {ateliers && <td className="axn-couverture__hors-grille">{marges.atelierRealise}</td>}
      <td>
        {marges.unitesSansAucuneSession === 0
          ? 'toutes touchées'
          : `${String(marges.unitesSansAucuneSession)} sans session`}
      </td>
      <td>{marges.unitesHorsPerimetre} hors périmètre</td>
    </tr>
  );
}

export function EcranCouverture({ id }: { id: string }): ReactNode {
  const mission = useMission(id);
  const requete = useCouverture(id);
  const pages = requete.data?.pages ?? [];
  // Les marges viennent de la PREMIÈRE page : le serveur les calcule sur la
  // mission entière et garantit qu'elles sont identiques d'une page à l'autre.
  // Les relire sur la dernière page reçue reviendrait au même — les lire sur la
  // page COURANTE serait le défaut que ce contrat existe pour fermer.
  const premiere = pages[0];
  const unites = pages.flatMap((page) => page.unites);
  const ateliers = (premiere?.marges.atelierRealise ?? 0) > 0;

  const retourMission = (
    <a
      href={hrefDeRoute({ type: 'mission', id })}
      onClick={auClicLienInterne({ type: 'mission', id })}
    >
      Retour à la mission
    </a>
  );

  const etat = etatDeRequete(
    { enAttente: requete.isPending, erreur: requete.error, vide: unites.length === 0 },
    {
      vide: {
        titre: 'Aucune unité dans l’arbre de cette mission',
        description:
          'La couverture se lit sur l’arbre organisationnel : importez-le ou créez au moins une unité, puis marquez celles qui sont dans le périmètre. Le plan d’entretiens dimensionnera alors ce qui est attendu de chacune.',
        actions: retourMission,
      },
      actions: (
        <Bouton variante="secondaire" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      ),
      actionsIntrouvable: retourMission,
      chargement: { lignes: 12, libelle: 'Chargement de la couverture' },
    },
  );

  return (
    <section className="axn-pile" aria-labelledby="titre-couverture">
      <div className="axn-entete-ecran">
        <h1 id="titre-couverture">Couverture de la mission</h1>
        {premiere !== undefined && (
          <span className="axn-entete-ecran__compteur">
            {unites.length} unité{unites.length > 1 ? 's' : ''} affichée
            {unites.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p>
        Deux lectures d’un même tableau : <strong>par unité</strong> (chaque service a-t-il été
        audité&nbsp;?) et <strong>par source de collecte</strong> (l’a-t-on audité autrement qu’en
        parlant&nbsp;?). Chaque cellule se lit «&nbsp;réalisé / prévu&nbsp;», le prévu venant du
        plan d’entretiens de la mission.
      </p>
      <ZoneEtat etat={etat}>
        <div className="axn-tableau-cadre">
          <table className="axn-tableau axn-couverture">
            <caption className="axn-visuellement-masque">
              Couverture par unité organisationnelle et par source de collecte
            </caption>
            <thead>
              <tr>
                <th scope="col">Unité</th>
                <th scope="col">Effectif</th>
                {SOURCES_COLLECTE.map((kind) => (
                  <th key={kind} scope="col" title={DESCRIPTIONS_SOURCE_COLLECTE[kind]}>
                    {LIBELLES_SOURCE_COLLECTE[kind]}
                  </th>
                ))}
                {ateliers && (
                  <th scope="col" className="axn-couverture__hors-grille">
                    Atelier <span className="axn-couverture__note">hors grille §27.1</span>
                  </th>
                )}
                <th scope="col">Sources couvertes</th>
                <th scope="col">Blocs non couverts</th>
              </tr>
            </thead>
            <tbody>
              {unites.map((unite) => (
                <LigneUnite
                  key={unite.orgUnitId}
                  unite={unite}
                  ateliers={ateliers}
                  blocsActifs={premiere?.blocsActifs.length ?? 0}
                />
              ))}
            </tbody>
            {premiere !== undefined && (
              <tfoot>
                <Marges marges={premiere.marges} ateliers={ateliers} />
              </tfoot>
            )}
          </table>
          {requete.hasNextPage && (
            <div className="axn-tableau__pied">
              <Bouton
                variante="secondaire"
                chargement={requete.isFetchingNextPage}
                onClick={() => void requete.fetchNextPage()}
              >
                Charger la suite
              </Bouton>
            </div>
          )}
        </div>
      </ZoneEtat>
      {premiere !== undefined && (
        <>
          {premiere.avertissements.length > 0 && (
            <ul className="axn-couverture__avertissements" aria-label="Avertissements du plan">
              {premiere.avertissements.map((avertissement) => (
                <li key={avertissement.code}>{avertissement.message}</li>
              ))}
            </ul>
          )}
          <p className="axn-couverture__horodatage">
            {/* Fuseau de MISSION (invariant 5) : « où en sommes-nous » se lit à
                l'heure des gens qui font le travail, pas à celle du siège. */}
            Calculée le{' '}
            {formaterInstant(premiere.calculeLe, mission.data?.timezone ?? premiere.timezone)}{' '}
            (heure de la mission).
          </p>
        </>
      )}
    </section>
  );
}
