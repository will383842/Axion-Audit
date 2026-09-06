// =============================================================================
// CE QUE LE RATTACHEMENT APPORTE À LA COQUILLE — un seul point de branchement
//
// ── POURQUOI CE FICHIER EXISTE (même raison que `coquille-l5c.tsx`) ─────────
// `LOT_L5.md` §1, amendement du 2026-09-05 : `App.tsx` est un fichier PARTAGÉ
// qui ne contient que de l'AIGUILLAGE — des `case`, et des APPELS à un module
// d'incrément. « Un incrément qui a besoin d'ajouter un comportement à la
// coquille publie une fonction et l'appelle ; il n'écrit pas sa logique dans le
// fichier commun. »
//
// ── LE PROBLÈME QUE CE RAPPEL RÉSOUT, ET CELUI QU'IL NE CRÉE PAS ───────────
// Un appareil non rattaché ne peut ouvrir AUCUN entretien (05 §9.9). Jusqu'ici,
// l'auditeur ne l'apprenait qu'au fond de « Nouvel entretien », dans un état
// d'erreur — c'est-à-dire trop tard, et au mauvais endroit (recette A54, t+3
// min). Le rappel vit donc dans la coquille : il est visible depuis n'importe
// quel écran, et il porte le GESTE, pas seulement le constat.
//
// Il ne rend RIEN dès qu'une identité existe : ce n'est pas un bandeau permanent
// mais l'annonce d'un état anormal, qui disparaît définitivement une fois
// l'appareil rattaché. Et il ne se montre pas SUR l'écran de rattachement — un
// rappel qui invite à faire ce qu'on est en train de faire est du bruit.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E33 (sécurité / RGPD).
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message } from '@axion/ui';
import { useTerrain } from '../app/contexte.js';
import { contexteLocal } from '../local/contexte.js';
import { lireIdentiteAuditeur } from '../session/auditeur.js';

/**
 * Le rappel « cet appareil n'appartient encore à personne », posé une fois dans
 * la coquille.
 *
 * La lecture de l'identité passe par `useLiveQuery` : elle disparaît d'elle-même
 * à la seconde où le rattachement aboutit, sans que la coquille ait à le savoir.
 */
export function AccesRattachement(): ReactNode {
  const { base, phase, vue, naviguer } = useTerrain();

  const identite = useLiveQuery(
    async () => (base === null ? null : lireIdentiteAuditeur(base, contexteLocal().coffre)),
    [base],
    undefined,
  );

  // `undefined` = pas encore lu. On ne crie pas avant de savoir : un rappel qui
  // clignote à chaque chargement finirait par ne plus être lu du tout.
  if (phase !== 'ouvert' || identite === undefined || identite !== null) return null;
  if (vue === 'connexionSiege') return null;

  return (
    <Message
      ton="avertissement"
      titre="Cet appareil n’est rattaché à aucun auditeur"
      actions={
        <Bouton
          onClick={() => {
            naviguer({ type: 'aller', vue: 'connexionSiege' });
          }}
        >
          Rattacher cet appareil
        </Bouton>
      }
    >
      Aucun entretien ne peut être ouvert tant qu’il n’a pas de propriétaire. Le rattachement se
      fait une fois, en ligne ; toute la collecte se fait ensuite sans réseau.
    </Message>
  );
}
