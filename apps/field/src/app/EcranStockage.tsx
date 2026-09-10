// =============================================================================
// ÉCRAN DE STOCKAGE — le guidage exigé par 05 §31-2
//
// « Si la persistance est refusée par le navigateur, la mission N'EST PAS
// EMBARQUÉE et l'écran GUIDE L'UTILISATEUR (installation sur l'écran d'accueil /
// libération d'espace). » Cet écran est ce guidage. Il ne comporte AUCUN moyen de
// « continuer quand même » : c'est le point de la règle.
//
// 03 §22.1 nomme la limite qui rend ce texte nécessaire : « sur iPad,
// l'installation “Sur l'écran d'accueil” est requise pour la persistance longue
// durée d'IndexedDB (procédure d'installation guidée fournie dans l'outil) ».
// Personne ne devine cette manipulation ; l'outil doit la dire.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E38 (sauvegarde terrain).
// =============================================================================
import { useCallback, useState, type ReactNode } from 'react';
import { Bouton, EtatErreur, Message, RappelHorsLigne, ZoneEtat } from '@axion/ui';
import { alerteEspace, exigerPersistance } from '../local/stockage.js';
import { useEnLigne } from '../session/media.js';
import { CAPACITES_HORS_LIGNE, PASTILLE_PORTEE_PAR_LA_COQUILLE } from './capacites-hors-ligne.js';
import { useTerrain } from './contexte.js';

/** Un volume en octets, lisible par un humain. Aucune bibliothèque pour cela. */
function volumeLisible(octets: number): string {
  const unites = ['o', 'ko', 'Mo', 'Go'];
  let valeur = octets;
  let rang = 0;
  while (valeur >= 1024 && rang < unites.length - 1) {
    valeur /= 1024;
    rang += 1;
  }
  return `${valeur.toFixed(valeur < 10 && rang > 0 ? 1 : 0)} ${unites[rang] ?? 'o'}`;
}

export function EcranStockage(): ReactNode {
  const { stockage, rafraichirStockage } = useTerrain();
  const [guidage, setGuidage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enLigne = useEnLigne();

  const redemander = useCallback((): void => {
    setEnCours(true);
    void exigerPersistance()
      .then(async (resultat) => {
        setGuidage(resultat.accordee ? null : resultat.guidage);
        await rafraichirStockage();
      })
      // LE `.catch` QUI MANQUAIT — ET L'ÉCRAN OÙ IL MANQUAIT LE PLUS.
      //
      // `navigator.storage.persist()` et `.estimate()` LÈVENT sous WebKit en
      // navigation privée et en contexte non sécurisé, c'est-à-dire sur l'iPad
      // même que 03 §22.1 vise. Sans cette branche, le rejet partait en promesse
      // non gérée, `finally` éteignait le chargement, et `setGuidage` n'était
      // jamais rappelé : le bouton « Redemander » de l'écran DONT L'UNIQUE
      // RAISON D'ÊTRE est de réparer le stockage devenait un bouton mort.
      //
      // Ce n'est pas un écran figé — c'est pire à sa façon : un écran qui a
      // l'air d'aller bien. Frère du défaut A27-D1 d'`EcranRestauration`, trouvé
      // par A24 en l'instruisant, fermé ici le 2026-09-06.
      .catch(() => {
        setGuidage(
          'Le navigateur a refusé de répondre à la demande de conservation. C’est ce qu’il ' +
            'fait en navigation privée, et quand la page n’est pas servie de façon sécurisée. ' +
            'Ouvrez l’application dans une fenêtre ordinaire, puis redemandez.',
        );
      })
      .finally(() => {
        setEnCours(false);
      });
  }, [rafraichirStockage]);

  const alerte = stockage === null ? null : alerteEspace(stockage);
  const quota = stockage?.quotaOctets ?? null;
  const utilise = stockage?.utiliseOctets ?? null;
  const persistant = stockage?.persistant ?? null;

  return (
    <section className="axn-pile axn-pile--large">
      {/*
        R-L5a-7 : `persistant === null` veut dire « on ne sait pas encore » — le
        chargement, ou un navigateur sans l'API. L'afficher en ERREUR faisait
        crier l'écran pendant la seconde qui précède la réponse, et 03 §33.2
        distingue nommément les deux états. Trois branches, donc, pas deux.
      */}
      {persistant === null ? (
        <ZoneEtat
          etat={{
            nature: 'chargement',
            libelle: 'Vérification du stockage de cet appareil',
            lignes: 2,
          }}
        >
          <span />
        </ZoneEtat>
      ) : persistant ? (
        <Message ton="succes" titre="Conservation garantie">
          Le navigateur garantit de ne pas effacer les données de collecte de cet appareil.
        </Message>
      ) : (
        <EtatErreur
          titre="La conservation des données n’est pas garantie"
          cause={
            guidage ??
            'Le navigateur n’a pas encore accordé la conservation durable du stockage de cette application.'
          }
          action="Installez l’application sur l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), libérez de l’espace si nécessaire, puis redemandez la conservation. Tant que ce n’est pas fait, aucune mission ne peut être embarquée."
          actions={
            <Bouton onClick={redemander} chargement={enCours} taille="large">
              Redemander la conservation
            </Bouton>
          }
        />
      )}

      {quota !== null && utilise !== null && (
        <p>
          Espace utilisé : {volumeLisible(utilise)} sur {volumeLisible(quota)}.
        </p>
      )}

      {alerte !== null && (
        <Message ton="avertissement" titre="Espace de stockage">
          {alerte}
        </Message>
      )}

      {/* §33.2 — le quatrième état. Il compte particulièrement ICI : l'écran
          parle de conservation et d'espace, et l'auditeur qui y atterrit sans
          réseau peut croire que la demande de conservation attend le siège. Elle
          n'attend rien : `navigator.storage.persist()` est une décision du
          navigateur, prise sur l'appareil. */}
      <RappelHorsLigne
        enLigne={enLigne}
        capacites={CAPACITES_HORS_LIGNE.stockage}
        avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}
      />
    </section>
  );
}
