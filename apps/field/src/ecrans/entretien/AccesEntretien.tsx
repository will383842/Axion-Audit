// =============================================================================
// ACCÈS À L'ENTRETIEN DEPUIS L'ACCUEIL — raccordement L5b, une ligne dans
// `app/EcranAccueil.tsx`
//
// Le cockpit « Aujourd'hui » (03 §34.2, L5c) remplacera ce bloc par l'agenda et
// le démarrage pré-rempli en un tap. D'ici là : ouvrir un nouvel entretien, ou
// reprendre celui qui est mémorisé (03 §17.4, reprise instantanée).
//
// ── LE DÉFAUT D'INTÉGRATION FERMÉ ICI (2026-09-05, à la refusion l5a → l5b) ──
// Ce bloc RELANÇAIT l'erreur de lecture pendant le rendu. `useLiveQuery` de
// `dexie-react-hooks` ne rend pas un état d'échec : il RE-JETTE le rejet de la
// requête au rendu, pour qu'une frontière d'erreur le capte. Aucune frontière
// n'existe au-dessus, donc l'arbre entier tombait — et avec lui l'état d'erreur
// que `EcranAccueil` venait d'établir (réserve R-L5a-7) au moment précis où il
// devait servir. L'auditeur voyait une page blanche, sans cause ni action, quand
// son stockage local le lâche. Le défaut était STRUCTURELLEMENT invisible en CI :
// le test vivait sur `lot/l5a`, ce composant sur `lot/l5b`, chaque branche verte
// séparément. Correction : le rejet est capté DANS la requête, au plus près, et
// devient une valeur — exactement le motif que `EcranAccueil` applique déjà.
//
// ── LES QUATRE ÉTATS (03 §33.2), ET POURQUOI L'ERREUR N'EST PAS UNE `alerte` ──
// chargement · vide · erreur · nominal, tous portés par les composants d'A21.
// L'erreur passe par `Message ton="avertissement"` (`role="status"`) et NON par
// `ZoneEtat nature="erreur"` (`role="alert"`) : la panne de lecture est UNE
// cause, l'écran qui contient ce bloc en lève déjà l'alerte interruptive, et
// deux `role="alert"` pour un seul fait coupent deux fois la parole au lecteur
// d'écran (§17.3 : aucune notification intrusive en entretien). Même doctrine
// que R-L5a-8 — une seule source pour une alerte, sinon elles divergent.
// « Nouvel entretien » reste HORS de la zone d'état, dans les quatre cas : ce
// bouton ne dépend d'aucune lecture, et une panne du stockage local ne doit
// jamais empêcher d'ouvrir un entretien (invariant 1, 03 §33.7 — un tap).
//
// Traçabilité : E12 (entretiens par interlocuteur), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bouton, Message, ZoneEtat, type EtatZone } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { depotSessions, type SessionLocale } from '../../local/depots/sessions.js';
import { lireSessionCourante } from '../../session/position.js';

/** Le résultat d'une lecture locale qui a le DROIT d'échouer, et qui le dit. */
type LectureReprise =
  { readonly ok: true; readonly session: SessionLocale | null } | { readonly ok: false };

/**
 * Ce que l'auditeur doit pouvoir faire quand même : rien dans ce message ne
 * dépend du stockage local, et l'action annoncée est réellement exécutable.
 */
const CAUSE_LECTURE = 'Le stockage local de cet appareil n’a pas répondu.';
const ACTION_LECTURE =
  'Vous pouvez ouvrir un nouvel entretien : la collecte n’attend pas cette lecture. ' +
  'Rechargez la page pour retrouver une reprise ; rien n’a été supprimé.';

export function AccesEntretien(): ReactNode {
  const { base, naviguer } = useTerrain();

  // Sans troisième argument, `useLiveQuery` rend `undefined` tant que la requête
  // n'a pas répondu : c'est l'état « chargement » du 03 §33.2, et il n'a pas
  // besoin d'une valeur par défaut qui le déguiserait en « aucun entretien ».
  const lecture: LectureReprise | undefined = useLiveQuery(async (): Promise<
    LectureReprise | undefined
  > => {
    if (base === null) return undefined;
    try {
      const id = await lireSessionCourante(base);
      return { ok: true, session: id === null ? null : await depotSessions.parId(id) };
    } catch {
      return { ok: false };
    }
  }, [base]);

  const session = lecture?.ok === true ? lecture.session : null;
  const enEchec = lecture?.ok === false;

  const etat: EtatZone =
    lecture === undefined
      ? { nature: 'chargement', libelle: 'Recherche d’un entretien à reprendre', lignes: 1 }
      : session === null
        ? {
            nature: 'vide',
            titre: 'Aucun entretien en cours sur cet appareil',
            description:
              'Démarrez-en un avec « Nouvel entretien » : trois champs suffisent, le reste est optionnel.',
          }
        : { nature: 'nominal' };

  return (
    <div className="axn-pile">
      <div className="axn-coquille__indicateurs">
        <Bouton
          onClick={() => {
            naviguer({ type: 'aller', vue: 'nouvelEntretien' });
          }}
        >
          Nouvel entretien
        </Bouton>
      </div>

      {enEchec ? (
        <Message ton="avertissement" titre="Reprise d’entretien indisponible">
          {CAUSE_LECTURE} Impossible de vérifier si un entretien était en cours. {ACTION_LECTURE}
        </Message>
      ) : (
        <ZoneEtat etat={etat}>
          <div className="axn-coquille__indicateurs">
            <Bouton
              variante="secondaire"
              onClick={() => {
                naviguer({ type: 'aller', vue: 'entretien' });
              }}
            >
              Reprendre l’entretien de {session?.personName ?? 'l’interlocuteur'}
            </Bouton>
          </div>
        </ZoneEtat>
      )}
    </div>
  );
}
