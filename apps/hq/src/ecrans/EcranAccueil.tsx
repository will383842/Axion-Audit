// =============================================================================
// ÉCRAN D'ACCUEIL — espace 1 « Tour de contrôle », version L7-min. Lot L7a.
//
// 03 §22.3 : « cartes mission (client, niveau d'audit, statut, jauge, badge
// avance/retard, auditeurs, prochaine échéance) ; chiffres clés ». **L7a livre
// la carte avec ce que le contrat de L3 porte** : client (résolu par
// `GET /v1/companies/:id`), niveau, statut, échéance. La jauge, les auditeurs
// et la dernière sync arrivent avec la route de couverture (L7b) ; le badge
// avance/retard et les alertes sont DIFFÉRABLES (05 §24.5) — ni promis, ni
// esquissés : une carte « pour plus tard », vide aujourd'hui, est exactement ce
// que A36 traque.
//
// Chiffres clés : « missions actives » = non clôturées, calculé sur la première
// page du portefeuille (50). Au-delà, le chiffre est marqué « au moins » — un
// chiffre exact demande un agrégat serveur, pas une lecture de liste.
//
// Le client est résolu PAR CARTE : une requête par entreprise, dédupliquée par
// TanStack. C'est un N+1 borné par la page, et c'est un point à trancher
// (`LOT_L7.md` §5 : jointure dans la liste, ou route de portefeuille).
//
// Traçabilité : E22 (console de pilotage 7 espaces).
//
// E25 (« zéro oubli — plan, couverture, contrôles ») était cité ici jusqu'au
// 2026-09-03 : RETIRÉ sur constat d'A02 (réserve R-L7a-4), qui a ouvert §17.3 et
// §16.6 et constaté qu'AUCUN des quatre objets d'E25 n'est livré par cet écran —
// ce que le commentaire ci-dessus écrit lui-même six lignes plus haut. La glose
// est supprimée, pas remplacée : une glose s'enlève aussi bien qu'elle s'ajoute,
// et `check:tracabilite` ne pouvait pas la voir (son contrôle compare la glose au
// LIBELLÉ de l'exigence, jamais au code). Une glose absente est un manque ; une
// glose fausse passe le garde et ment.
// =============================================================================
import type { ReactNode } from 'react';
import { Bouton, ZoneEtat } from '@axion/ui';
import { useEntreprise, usePortefeuille } from '../api/requetes.js';
import { LIBELLES_NIVEAU_AUDIT, type MissionResponse } from '../api/contrats.js';
import { etatDeRequete } from '../app/etats.js';
import { auClicLienInterne, hrefDeRoute, ROUTE_PORTEFEUILLE } from '../app/routeur.js';
import { formaterDateCivile } from '../format/dates.js';
import { BadgeStatut } from './EcranPortefeuille.js';

/** Le nom du client, ou un texte d'attente/de repli — jamais l'identifiant. */
function NomClient({ companyId }: { companyId: string }): ReactNode {
  const requete = useEntreprise(companyId);
  if (requete.data !== undefined) return <>{requete.data.name}</>;
  if (requete.isPending) return <span>Client en cours de lecture…</span>;
  return <>Client non lisible</>;
}

function CarteMission({ mission }: { mission: MissionResponse }): ReactNode {
  const route = { type: 'mission', id: mission.id } as const;
  return (
    <article className="axn-carte-mission">
      <h2 className="axn-carte-mission__titre">
        <a href={hrefDeRoute(route)} onClick={auClicLienInterne(route)}>
          {mission.title}
        </a>
      </h2>
      <p className="axn-carte-mission__client">
        <NomClient companyId={mission.companyId} />
      </p>
      <dl className="axn-carte-mission__faits">
        <div>
          <dt>Statut</dt>
          <dd>
            <BadgeStatut statut={mission.status} />
          </dd>
        </div>
        <div>
          <dt>Niveau</dt>
          <dd>{LIBELLES_NIVEAU_AUDIT[mission.auditLevel]}</dd>
        </div>
        <div>
          <dt>Échéance</dt>
          <dd>
            {mission.endPlanned === null
              ? 'non renseignée'
              : formaterDateCivile(mission.endPlanned)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function ChiffresCles({
  missions,
  partiel,
}: {
  missions: readonly MissionResponse[];
  partiel: boolean;
}): ReactNode {
  const actives = missions.filter((m) => m.status !== 'cloturee').length;
  const enCollecte = missions.filter((m) => m.status === 'en_cours').length;
  const enAnalyse = missions.filter((m) => m.status === 'en_analyse').length;
  const prefixe = partiel ? 'au moins ' : '';
  return (
    <div className="axn-chiffres" aria-label="Chiffres clés">
      <div className="axn-chiffre">
        <span className="axn-chiffre__valeur">
          {prefixe}
          {actives}
        </span>
        <span className="axn-chiffre__libelle">
          {actives > 1 ? 'missions actives' : 'mission active'}
        </span>
      </div>
      <div className="axn-chiffre">
        <span className="axn-chiffre__valeur">
          {prefixe}
          {enCollecte}
        </span>
        <span className="axn-chiffre__libelle">en collecte</span>
      </div>
      <div className="axn-chiffre">
        <span className="axn-chiffre__valeur">
          {prefixe}
          {enAnalyse}
        </span>
        <span className="axn-chiffre__libelle">en analyse</span>
      </div>
    </div>
  );
}

export function EcranAccueil(): ReactNode {
  const requete = usePortefeuille();
  const missions = requete.data?.pages.flatMap((page) => page.items) ?? [];

  const etat = etatDeRequete(
    { enAttente: requete.isPending, erreur: requete.error, vide: missions.length === 0 },
    {
      vide: {
        titre: 'Aucune mission à piloter',
        description:
          'Créez une mission depuis le cadrage (module M9), puis importez son arbre organisationnel : elle apparaîtra ici avec son statut.',
      },
      actions: (
        <Bouton variante="secondaire" onClick={() => void requete.refetch()}>
          Réessayer
        </Bouton>
      ),
      chargement: { lignes: 6, libelle: 'Chargement de la tour de contrôle' },
    },
  );

  return (
    <section className="axn-pile" aria-labelledby="titre-accueil">
      <h1 id="titre-accueil">Tour de contrôle</h1>
      <ZoneEtat etat={etat}>
        <ChiffresCles missions={missions} partiel={requete.hasNextPage} />
        <div className="axn-entete-ecran">
          <h2>Missions</h2>
          <a href={hrefDeRoute(ROUTE_PORTEFEUILLE)} onClick={auClicLienInterne(ROUTE_PORTEFEUILLE)}>
            Voir tout le portefeuille
          </a>
        </div>
        <div className="axn-cartes">
          {missions.map((mission) => (
            <CarteMission key={mission.id} mission={mission} />
          ))}
        </div>
      </ZoneEtat>
    </section>
  );
}
