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
import { Bouton, EtatErreur, Message, ZoneEtat } from '@axion/ui';
import { alerteEspace, exigerPersistance } from '../local/stockage.js';
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

  const redemander = useCallback((): void => {
    setEnCours(true);
    void exigerPersistance()
      .then(async (resultat) => {
        setGuidage(resultat.accordee ? null : resultat.guidage);
        await rafraichirStockage();
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
      <h1>Stockage de cet appareil</h1>

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
    </section>
  );
}
