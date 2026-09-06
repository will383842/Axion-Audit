// =============================================================================
// ÉCRAN AVANCEMENT D'UNE MISSION — espace 2 « Pilotage mission », L7-min. L7a.
//
// Ce que le contrat de L3 porte, et que l'écran rend :
//   1. la FICHE (`GET /v1/missions/:id`) — titre, statut, niveau, périmètre,
//      fuseau, période prévue, NDA, livraison ;
//   2. le CLIENT (`GET /v1/companies/:id`) — nommé, jamais son identifiant ;
//   3. les JALONS (03 §32.2) — les cinq statuts dans l'ordre, le courant en
//      évidence, ceux d'avant marqués passés. Dérivés de `STATUTS_MISSION` : la
//      console ne connaît pas un sixième statut que le contrat ignore.
//
// Ce que cet écran NE montre PAS : complétude, à-revoir, dernière sync (05 §8.3
// `dashboard`). Heatmap et avance/retard sont différables. Aucune donnée
// financière ne transite (invariant 3) — le contrat ne la porte pas, l'écran ne
// peut donc pas l'afficher.
//
// ── AJOUT L7b : LE DRILL-DOWN (§22.3) ───────────────────────────────────────
// Deux liens mènent aux écrans du lot L7b — la COUVERTURE (par unité ET par
// source, §27.1) et l'AGRÉGATION par question (M5.1, provenance et « non
// communiqué » visibles). Ce sont des liens et non des onglets : l'URL d'un
// écran de couverture doit être collable dans un message, et le bouton
// « précédent » du navigateur doit y remonter d'un cran.
//
// Dates : un instant (`deliveredAt`, `updatedAt`) au FUSEAU DE LA MISSION ; une
// date civile (`startPlanned`, `ndaSignedAt`) telle quelle (`format/dates.ts`).
//
// Traçabilité : E22 (console de pilotage 7 espaces), E39 (machine à états
// mission), E32 (fuseaux, devises, interface française).
// =============================================================================
import type { ReactNode } from 'react';
import { Bouton, ZoneEtat } from '@axion/ui';
import { useEntreprise, useMission } from '../api/requetes.js';
import {
  LIBELLES_NIVEAU_AUDIT,
  LIBELLES_PERIMETRE_GEO,
  LIBELLES_STATUT_MISSION,
  STATUTS_MISSION,
  type MissionResponse,
} from '../api/contrats.js';
import { etatDeRequete } from '../app/etats.js';
import { auClicLienInterne, hrefDeRoute, ROUTE_PORTEFEUILLE } from '../app/routeur.js';
import { formaterDateCivile, formaterInstant } from '../format/dates.js';
import { BadgeStatut } from './EcranPortefeuille.js';

function Jalons({ statut }: { statut: MissionResponse['status'] }): ReactNode {
  const courant = STATUTS_MISSION.indexOf(statut);
  return (
    <ol className="axn-jalons" aria-label="Étapes de la mission">
      {STATUTS_MISSION.map((code, index) => (
        <li
          key={code}
          aria-current={index === courant ? 'step' : undefined}
          data-passe={index < courant ? 'true' : 'false'}
        >
          {LIBELLES_STATUT_MISSION[code]}
        </li>
      ))}
    </ol>
  );
}

/**
 * Le client de la mission — une ligne, jamais un bloc d'état : la fiche est déjà
 * lisible, et un squelette de plus ici serait un second `role="status"` sur un
 * écran qui en a déjà un. Ses trois issues tiennent en un texte.
 */
function Client({ companyId }: { companyId: string }): ReactNode {
  const requete = useEntreprise(companyId);
  let contenu: ReactNode;
  if (requete.data !== undefined) {
    const entreprise = requete.data;
    contenu = (
      <>
        <strong>{entreprise.name}</strong>
        {entreprise.headcount === null ? '' : ` · ${String(entreprise.headcount)} personnes`}
        {entreprise.countries.length === 0 ? '' : ` · ${entreprise.countries.join(', ')}`}
      </>
    );
  } else if (requete.isPending) {
    contenu = <span>en cours de lecture…</span>;
  } else {
    contenu = (
      <>
        non lisible pour l’instant{' '}
        <Bouton variante="discret" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      </>
    );
  }
  return <p className="axn-entete-ecran__client">Client : {contenu}</p>;
}

function Fiche({ mission }: { mission: MissionResponse }): ReactNode {
  return (
    <dl className="axn-fiche">
      <div>
        <dt>Niveau d’audit</dt>
        <dd>{LIBELLES_NIVEAU_AUDIT[mission.auditLevel]}</dd>
      </div>
      <div>
        <dt>Périmètre</dt>
        <dd>
          {LIBELLES_PERIMETRE_GEO[mission.geoScope]}
          {mission.countryCode === null ? '' : ` · ${mission.countryCode}`}
        </dd>
      </div>
      <div>
        <dt>Fuseau de la mission</dt>
        <dd>{mission.timezone} (heure de la mission)</dd>
      </div>
      <div>
        <dt>Début prévu</dt>
        <dd>
          {mission.startPlanned === null
            ? 'non renseigné'
            : formaterDateCivile(mission.startPlanned)}
        </dd>
      </div>
      <div>
        <dt>Fin prévue</dt>
        <dd>
          {mission.endPlanned === null ? 'non renseignée' : formaterDateCivile(mission.endPlanned)}
        </dd>
      </div>
      <div>
        <dt>NDA</dt>
        <dd>
          {mission.ndaRef === null
            ? 'non renseigné'
            : `${mission.ndaRef}${mission.ndaSignedAt === null ? '' : ` · signé le ${formaterDateCivile(mission.ndaSignedAt)}`}`}
        </dd>
      </div>
      <div>
        <dt>Livraison</dt>
        <dd>
          {mission.deliveredAt === null
            ? 'non livrée'
            : `Livrée le ${formaterInstant(mission.deliveredAt, mission.timezone)}`}
        </dd>
      </div>
      <div>
        <dt>Blocs actifs</dt>
        <dd>{mission.activeBlocks.length}</dd>
      </div>
      <div>
        <dt>Dernière modification</dt>
        <dd>{formaterInstant(mission.updatedAt, mission.timezone)}</dd>
      </div>
    </dl>
  );
}

/**
 * LE DRILL-DOWN (§22.3) — deux VRAIS liens, jamais des onglets.
 *
 * Chaque vue a son URL : collable dans un message, ouvrable dans un nouvel
 * onglet, et le bouton « précédent » du navigateur y remonte d'un cran. Le
 * résumé sous chaque lien dit ce qu'on y trouve — un lien nu obligerait à
 * l'ouvrir pour le savoir.
 */
function VuesDePilotage({ id }: { id: string }): ReactNode {
  const couverture = { type: 'couverture', id } as const;
  const agregation = { type: 'agregation', id } as const;
  return (
    <nav className="axn-vues-pilotage" aria-label="Vues de pilotage de la mission">
      <a href={hrefDeRoute(couverture)} onClick={auClicLienInterne(couverture)}>
        <strong>Couverture</strong>
        <span>
          Par unité <em>et</em> par source de collecte : ce qui est prévu, planifié, réalisé, et les
          unités du périmètre qu’aucune session n’a encore touchées.
        </span>
      </a>
      <a href={hrefDeRoute(agregation)} onClick={auClicLienInterne(agregation)}>
        <strong>Agrégation par question</strong>
        <span>
          Toutes les réponses côte à côte, avec leur provenance et le statut « non communiqué »
          rendu visible.
        </span>
      </a>
    </nav>
  );
}

export function EcranAvancementMission({ id }: { id: string }): ReactNode {
  const requete = useMission(id);
  const retourPortefeuille = (
    <a href={hrefDeRoute(ROUTE_PORTEFEUILLE)} onClick={auClicLienInterne(ROUTE_PORTEFEUILLE)}>
      Retour au portefeuille
    </a>
  );
  const etat = etatDeRequete(
    { enAttente: requete.isPending, erreur: requete.error, vide: false },
    {
      // Pas d'état vide : une mission absente est un 404, rendu comme erreur.
      actions: (
        <Bouton variante="secondaire" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      ),
      actionsIntrouvable: retourPortefeuille,
      chargement: { lignes: 6, libelle: 'Chargement de la mission' },
    },
  );
  const mission = requete.data;

  return (
    <section className="axn-pile">
      <ZoneEtat etat={etat}>
        {mission === undefined ? null : (
          <>
            <div className="axn-entete-ecran">
              <h1 id="titre-mission">{mission.title}</h1>
              <BadgeStatut statut={mission.status} />
            </div>
            <Client companyId={mission.companyId} />
            <Jalons statut={mission.status} />
            <Fiche mission={mission} />
            <VuesDePilotage id={id} />
          </>
        )}
      </ZoneEtat>
    </section>
  );
}
