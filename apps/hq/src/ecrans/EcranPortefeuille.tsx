// =============================================================================
// ÉCRAN PORTEFEUILLE — la liste dense (§33.4), point d'entrée de l'espace 2
// « Pilotage mission ». Lot L7a.
//
// 03 §18.4 : « toutes les missions, chacune avec : client, statut, jauge,
// badge avance/retard, auditeurs, dernière sync, alertes ». **L7a livre la liste
// et le statut** ; la jauge et la dernière sync arrivent avec la route de
// couverture (L7b) ; le badge avance/retard et les alertes sont DIFFÉRABLES
// (05 §24.5) — ils ne sont ni promis ni esquissés ici. Le client n'est pas dans
// `missionResponseSchema` : sur cette liste dense on ne fait PAS un appel par
// ligne (la tour de contrôle le fait, sur ses cartes) — point à trancher,
// `LOT_L7.md` §5.
//
// Liste keyset (11 §3) : « Afficher la suite » demande la page suivante avec le
// curseur OPAQUE rendu par la précédente ; la console ne le lit jamais.
//
// Les quatre états (§33.2) : `etatDeRequete` + `ZoneEtat`.
//
// Traçabilité : E22 (console de pilotage 7 espaces), E25 (zéro oubli — plan,
// couverture, contrôles).
// =============================================================================
import type { ReactNode } from 'react';
import { Badge, Bouton, ZoneEtat, type TonBadge } from '@axion/ui';
import { usePortefeuille } from '../api/requetes.js';
import {
  LIBELLES_NIVEAU_AUDIT,
  LIBELLES_PERIMETRE_GEO,
  LIBELLES_STATUT_MISSION,
  type MissionResponse,
  type StatutMission,
} from '../api/contrats.js';
import { etatDeRequete } from '../app/etats.js';
import { auClicLienInterne, hrefDeRoute } from '../app/routeur.js';
import { formaterDateCivile, formaterInstant } from '../format/dates.js';

/** Le ton d'un statut — exhaustif par le type, comme les libellés. */
export const TON_STATUT: Record<StatutMission, TonBadge> = {
  preparation: 'neutre',
  en_cours: 'action',
  en_analyse: 'info',
  livree: 'succes',
  cloturee: 'neutre',
};

export function BadgeStatut({ statut }: { statut: StatutMission }): ReactNode {
  return <Badge ton={TON_STATUT[statut]}>{LIBELLES_STATUT_MISSION[statut]}</Badge>;
}

function LigneMission({ mission }: { mission: MissionResponse }): ReactNode {
  const route = { type: 'mission', id: mission.id } as const;
  return (
    <tr>
      <td className="axn-tableau__principal">
        <a href={hrefDeRoute(route)} onClick={auClicLienInterne(route)}>
          {mission.title}
        </a>
      </td>
      <td>
        <BadgeStatut statut={mission.status} />
      </td>
      <td>{LIBELLES_NIVEAU_AUDIT[mission.auditLevel]}</td>
      <td>
        {LIBELLES_PERIMETRE_GEO[mission.geoScope]}
        {mission.countryCode === null ? '' : ` · ${mission.countryCode}`}
      </td>
      <td>{mission.startPlanned === null ? '—' : formaterDateCivile(mission.startPlanned)}</td>
      <td>{mission.endPlanned === null ? '—' : formaterDateCivile(mission.endPlanned)}</td>
      <td>{formaterInstant(mission.updatedAt, mission.timezone)}</td>
    </tr>
  );
}

export function EcranPortefeuille(): ReactNode {
  const requete = usePortefeuille();
  const missions = requete.data?.pages.flatMap((page) => page.items) ?? [];

  const etat = etatDeRequete(
    { enAttente: requete.isPending, erreur: requete.error, vide: missions.length === 0 },
    {
      vide: {
        titre: 'Aucune mission dans le portefeuille',
        description:
          'Créez une mission depuis le cadrage (module M9) : dès qu’elle existe, elle apparaît ici avec son statut.',
      },
      actions: (
        <Bouton variante="secondaire" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      ),
      chargement: { lignes: 8, libelle: 'Chargement du portefeuille' },
    },
  );

  return (
    <section className="axn-pile" aria-labelledby="titre-portefeuille">
      <div className="axn-entete-ecran">
        <h1 id="titre-portefeuille">Portefeuille des missions</h1>
        {missions.length > 0 && (
          <span className="axn-entete-ecran__compteur">
            {missions.length} mission{missions.length > 1 ? 's' : ''}
            {requete.hasNextPage ? (missions.length > 1 ? ' affichées' : ' affichée') : ''}
          </span>
        )}
      </div>
      <ZoneEtat etat={etat}>
        <div className="axn-tableau-cadre">
          <table className="axn-tableau">
            <caption className="axn-visuellement-masque">Missions du portefeuille</caption>
            <thead>
              <tr>
                <th scope="col">Mission</th>
                <th scope="col">Statut</th>
                <th scope="col">Niveau</th>
                <th scope="col">Périmètre</th>
                <th scope="col">Début prévu</th>
                <th scope="col">Fin prévue</th>
                <th scope="col">Mise à jour (heure de mission)</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <LigneMission key={mission.id} mission={mission} />
              ))}
            </tbody>
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
    </section>
  );
}
